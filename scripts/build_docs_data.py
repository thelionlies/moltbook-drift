"""Extract real trial data from Inspect .eval logs into JSON for the docs/ site.

Reads the three log-backed experiments (poet positive control, evil-A seed-42,
manipulative-F) and writes:
  docs/data/trials.json   a curated sample of real trials per condition, used
                           by the "try it yourself" replay widget
  docs/data/results.json  the full results table from experiments/results.csv,
                           used to render the results chart

Run with: python3 scripts/build_docs_data.py
Requires Python 3.14+ (zipfile zstd support) and no third-party packages.
"""

from __future__ import annotations

import csv
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS_DATA = ROOT / "docs" / "data"

LOG_SOURCES = [
    {
        "label": "Poet (Identity)",
        "feed_persona": "poet",
        "category": "A",
        "run_id": "20260806-poet-positive-control",
        "arms": {
            "baseline": ("experiments/10_assistant_poet_A_positive_control/logs/baseline", "a_baseline"),
            "neutral": ("experiments/10_assistant_poet_A_positive_control/logs/neutral", "a_neutral"),
            "exposed": ("experiments/10_assistant_poet_A_positive_control/logs/poet", "poet_a"),
        },
    },
    {
        "label": "Evil (Identity)",
        "feed_persona": "evil",
        "category": "A",
        "run_id": "20260913T064229Z",
        "arms": {
            "baseline": ("experiments/11_assistant_evil_A_3x/seed-42/a_evil_baseline", "a_evil_baseline"),
            "neutral": ("experiments/11_assistant_evil_A_3x/seed-42/a_evil_neutral", "a_evil_neutral"),
            "exposed": ("experiments/11_assistant_evil_A_3x/seed-42/evil_a", "evil_a"),
        },
    },
    {
        "label": "Manipulative (Promotion)",
        "feed_persona": "malicious-manipulative",
        "category": "F",
        "run_id": "20260913T091407Z",
        "arms": {
            "baseline": ("experiments/12_assistant_manipulative_F/run/f_manipulative_baseline", "f_manipulative_baseline"),
            "neutral": ("experiments/12_assistant_manipulative_F/run/f_manipulative_neutral", "f_manipulative_neutral"),
            "exposed": ("experiments/12_assistant_manipulative_F/run/manipulative_f", "manipulative_f"),
        },
    },
]

ROUNDS_TO_KEEP = 10  # ship the full feed so the browser can page through every round
MAX_TRIALS_PER_ARM = 5  # cap payload size; real aggregate counts come from results.csv


def find_eval_file(dir_path: Path) -> Path:
    files = sorted(dir_path.glob("*.eval"))
    if not files:
        raise FileNotFoundError(f"no .eval file under {dir_path}")
    return files[0]


def split_feed_rounds(feed_text: str) -> list[str]:
    """Split a '=== Your Moltbook feed — round N of 10 ===' user message into rounds."""
    parts = re.split(r"(?=== Your Moltbook feed)", feed_text)
    return [p.strip() for p in parts if p.strip()]


REACTION_INSTRUCTION_RE = re.compile(
    r"\n*React to EACH post on its own line.*$", re.IGNORECASE | re.DOTALL
)


def strip_reaction_instruction(feed_text: str) -> str:
    """Drop the trailing "React to EACH post..." prompt instruction line.

    That line tells the model how to format its reactions; it isn't part of
    the feed content itself, so it shouldn't be displayed as if it were.
    """
    return REACTION_INSTRUCTION_RE.sub("", feed_text).rstrip()


def extract_sample(sample: dict) -> dict:
    messages = sample["messages"]
    feed_messages = [
        strip_reaction_instruction(m["content"]) if isinstance(m["content"], str) else ""
        for m in messages
        if m.get("role") == "user" and "Moltbook feed" in str(m.get("content", ""))
    ]
    kept_rounds = feed_messages[:ROUNDS_TO_KEEP]
    total_rounds = len(feed_messages)

    scores = sample.get("scores") or {}
    choice_score = scores.get("choice") or {}
    picked_letter = choice_score.get("answer")

    choices = sample.get("choices") or []
    target = sample.get("target")

    return {
        "id": sample.get("id"),
        "feed_sample_rounds": kept_rounds,
        "feed_total_rounds": total_rounds,
        "choices": choices,
        "target_letter": target,
        "picked_letter": picked_letter,
        "picked_is_assistant": picked_letter == target,
    }


def extract_arm(eval_path: Path) -> list[dict]:
    z = zipfile.ZipFile(eval_path)
    sample_names = sorted(
        (n for n in z.namelist() if n.startswith("samples/") and n.endswith(".json")),
        key=lambda n: int(re.search(r"(\d+)_epoch", n).group(1)),
    )
    out = []
    for name in sample_names[:MAX_TRIALS_PER_ARM]:
        sample = json.loads(z.read(name))
        out.append(extract_sample(sample))
    return out


def build_results() -> list[dict]:
    rows = []
    with (ROOT / "experiments" / "results.csv").open(newline="") as f:
        for row in csv.DictReader(f):
            rows.append(row)
    return rows


def find_result_row(results: list[dict], run_id: str, condition_id: str) -> dict:
    for row in results:
        if row["run_id"] == run_id and row["condition_id"] == condition_id:
            return row
    raise KeyError(f"no results.csv row for {run_id}/{condition_id}")


def build_trials(results: list[dict]) -> list[dict]:
    conditions = []
    for source in LOG_SOURCES:
        arms = {}
        for arm_name, (rel_dir, condition_id) in source["arms"].items():
            eval_path = find_eval_file(ROOT / rel_dir)
            row = find_result_row(results, source["run_id"], condition_id)
            arms[arm_name] = {
                "trials": extract_arm(eval_path),
                "valid_n": int(row["valid_n"]),
                "assistant_count": int(row["assistant_count"]),
                "non_assistant_count": int(row["non_assistant_count"]),
            }
        conditions.append(
            {
                "label": source["label"],
                "feed_persona": source["feed_persona"],
                "category": source["category"],
                "arms": arms,
            }
        )
    return conditions


def main() -> None:
    DOCS_DATA.mkdir(parents=True, exist_ok=True)
    results = build_results()
    trials = build_trials(results)
    (DOCS_DATA / "trials.json").write_text(json.dumps(trials, indent=2))
    (DOCS_DATA / "results.json").write_text(json.dumps(results, indent=2))
    print(f"wrote {DOCS_DATA / 'trials.json'}")
    print(f"wrote {DOCS_DATA / 'results.json'}")


if __name__ == "__main__":
    main()
