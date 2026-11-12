(function () {
  "use strict";

  // ---- Tabs ----
  document.querySelectorAll(".tab-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    });
  });

  // ---- Try it yourself ----
  var state = {
    trials: null,
    conditionIndex: 0,
    arm: "exposed",
    trialIndex: 0,
    feedRoundIndex: 0,
    userCorrect: 0,
    userTotal: 0,
    locked: false,
  };

  function renderPersonaPicker() {
    var el = document.getElementById("persona-picker");
    el.innerHTML = "";
    state.trials.forEach(function (c, i) {
      var pill = document.createElement("button");
      pill.className = "pill" + (i === state.conditionIndex ? " active" : "");
      pill.textContent = c.label;
      pill.addEventListener("click", function () {
        state.conditionIndex = i;
        state.trialIndex = 0;
        renderPersonaPicker();
        renderArmPicker();
        renderTrial();
      });
      el.appendChild(pill);
    });
  }

  var ARM_INFO = {
    baseline: "No feed at all. The model answers cold, right after its system prompt, " +
      "with nothing to react to first.",
    neutral: "The model scrolls 50 posts written in its own assistant voice before " +
      "answering. This is the control for \"reading any feed at all.\"",
    exposed: "The model scrolls 50 posts written in the target persona's voice before " +
      "answering. This is the condition actually under test.",
  };

  function renderArmPicker() {
    var el = document.getElementById("arm-picker");
    el.innerHTML = "";
    var arms = [
      ["baseline", "Baseline"],
      ["neutral", "Neutral"],
      ["exposed", "Exposed"],
    ];
    arms.forEach(function (pair) {
      var pill = document.createElement("button");
      pill.className = "pill" + (pair[0] === state.arm ? " active" : "");
      pill.textContent = pair[1];
      pill.addEventListener("click", function () {
        state.arm = pair[0];
        state.trialIndex = 0;
        renderArmPicker();
        renderTrial();
      });
      el.appendChild(pill);
    });
    document.getElementById("arm-explainer").textContent = ARM_INFO[state.arm];
  }

  function currentArmData() {
    return state.trials[state.conditionIndex].arms[state.arm];
  }

  function currentTrial() {
    var arm = currentArmData();
    return arm.trials[state.trialIndex % arm.trials.length];
  }

  var AVATAR_COLORS = ["var(--accent)", "var(--accent-2)", "var(--bad)", "var(--good)", "var(--accent-3)"];

  function avatarColorFor(handle) {
    var sum = 0;
    for (var i = 0; i < handle.length; i++) sum += handle.charCodeAt(i);
    return AVATAR_COLORS[sum % AVATAR_COLORS.length];
  }

  function parseRound(roundText) {
    var lines = roundText.split("\n");
    var roundMatch = lines[0].match(/round (\d+) of (\d+)/i);
    var label = roundMatch ? "Round " + roundMatch[1] + " of " + roundMatch[2] : "Feed round";
    var body = lines.slice(1).join("\n");
    var postChunks = body.split(/\n(?=\[post \d+\])/);
    var posts = [];
    postChunks.forEach(function (chunk) {
      var m = chunk.match(/^\[post \d+\]\s*@(\S+)\n([\s\S]*)$/);
      if (m) {
        posts.push({ handle: m[1], text: m[2].trim() });
      }
    });
    return { label: label, posts: posts };
  }

  function renderFeedRound() {
    var trial = currentTrial();
    var feedContainer = document.getElementById("feed-container");
    var pager = document.getElementById("round-pager");
    var pagerLabel = document.getElementById("round-pager-label");
    feedContainer.innerHTML = "";

    if (trial.feed_total_rounds === 0) {
      pager.style.display = "none";
      return;
    }
    pager.style.display = "flex";

    var rounds = trial.feed_sample_rounds;
    var idx = Math.min(state.feedRoundIndex, rounds.length - 1);
    var round = parseRound(rounds[idx]);

    document.getElementById("round-prev").disabled = idx === 0;
    document.getElementById("round-next").disabled = idx === rounds.length - 1;
    pagerLabel.textContent = round.label;

    var roundDiv = document.createElement("div");
    roundDiv.className = "feed-round";
    round.posts.forEach(function (post) {
      var postDiv = document.createElement("div");
      postDiv.className = "feed-post";

      var avatar = document.createElement("div");
      avatar.className = "feed-post-avatar";
      avatar.style.background = avatarColorFor(post.handle);
      avatar.textContent = post.handle.slice(0, 2).toUpperCase();

      var bodyDiv = document.createElement("div");
      bodyDiv.className = "feed-post-body";
      var handleDiv = document.createElement("div");
      handleDiv.className = "feed-post-handle";
      handleDiv.textContent = "@" + post.handle;
      var textDiv = document.createElement("div");
      textDiv.className = "feed-post-text clamped";
      textDiv.textContent = post.text;
      textDiv.title = "Click to read the full post";
      textDiv.addEventListener("click", function () {
        textDiv.classList.toggle("clamped");
        seeMoreBtn.textContent = textDiv.classList.contains("clamped") ? "See more" : "See less";
      });

      var seeMoreBtn = document.createElement("button");
      seeMoreBtn.type = "button";
      seeMoreBtn.className = "see-more-btn";
      seeMoreBtn.textContent = "See more";
      seeMoreBtn.addEventListener("click", function () {
        textDiv.classList.toggle("clamped");
        seeMoreBtn.textContent = textDiv.classList.contains("clamped") ? "See more" : "See less";
      });

      bodyDiv.appendChild(handleDiv);
      bodyDiv.appendChild(textDiv);
      bodyDiv.appendChild(seeMoreBtn);
      postDiv.appendChild(avatar);
      postDiv.appendChild(bodyDiv);
      roundDiv.appendChild(postDiv);
    });
    feedContainer.appendChild(roundDiv);
  }

  document.getElementById("round-prev").addEventListener("click", function () {
    if (state.feedRoundIndex > 0) {
      state.feedRoundIndex -= 1;
      renderFeedRound();
    }
  });

  document.getElementById("round-next").addEventListener("click", function () {
    var trial = currentTrial();
    if (state.feedRoundIndex < trial.feed_sample_rounds.length - 1) {
      state.feedRoundIndex += 1;
      renderFeedRound();
    }
  });

  function renderTrial() {
    state.locked = false;
    state.feedRoundIndex = 0;
    var trial = currentTrial();
    var feedNote = document.getElementById("feed-note");
    var agentStatus = document.getElementById("agent-status-text");
    var thinkingRow = document.getElementById("thinking-row");
    var outcomeBadge = document.getElementById("outcome-badge");
    thinkingRow.style.display = "none";
    outcomeBadge.hidden = true;

    if (trial.feed_total_rounds === 0) {
      agentStatus.textContent = "no feed this arm, going straight to the question…";
      feedNote.textContent = "This arm shows no feed. The model goes straight to the question.";
    } else {
      agentStatus.textContent = "scrolled " + trial.feed_total_rounds + " rounds of its feed, " +
        "5 posts per round, all in the same voice…";
      feedNote.textContent = "Use the arrows above to flip through every round the model actually saw.";
      thinkingRow.style.display = "flex";
    }
    renderFeedRound();

    var list = document.getElementById("choice-list");
    list.innerHTML = "";
    trial.choices.forEach(function (text, idx) {
      var btn = document.createElement("button");
      btn.className = "choice-btn";
      btn.textContent = text;
      btn.addEventListener("click", function () {
        onGuess(idx, btn);
      });
      list.appendChild(btn);
    });

    renderTally();
  }

  function onGuess(idx, btnEl) {
    if (state.locked) return;
    state.locked = true;
    var trial = currentTrial();
    var letters = ["A", "B", "C", "D", "E"];
    var guessedLetter = letters[idx];
    var correct = guessedLetter === trial.picked_letter;

    state.userTotal += 1;
    if (correct) state.userCorrect += 1;

    var buttons = document.querySelectorAll("#choice-list .choice-btn");
    buttons.forEach(function (b, i) {
      if (letters[i] === trial.picked_letter) {
        b.classList.add("picked-real", "correct-badge");
      }
    });
    btnEl.classList.add("user-guess");

    var outcomeBadge = document.getElementById("outcome-badge");
    outcomeBadge.hidden = false;
    if (trial.picked_is_assistant) {
      outcomeBadge.className = "outcome-badge stayed";
      outcomeBadge.textContent = "stayed in the assistant voice";
    } else {
      outcomeBadge.className = "outcome-badge drifted";
      outcomeBadge.textContent = "drifted to the persona voice";
    }

    renderTally();
  }

  function renderTally() {
    var arm = currentArmData();
    var el = document.getElementById("tally");
    el.innerHTML =
      "<span>Your guesses: <strong>" + state.userCorrect + "/" + state.userTotal + "</strong> matched the model</span>" +
      "<span>Real result, this condition/arm: <strong>" + arm.non_assistant_count + "/" + arm.valid_n +
      "</strong> trials drifted away from the assistant-style post</span>";
  }

  document.getElementById("next-trial-btn").addEventListener("click", function () {
    var arm = currentArmData();
    state.trialIndex = (state.trialIndex + 1) % arm.trials.length;
    renderTrial();
  });

  // ---- Headline drift charts (SVG, hand-curated numbers) ----
  var ARM_COLOR = {
    baseline: "var(--text-dim)",
    neutral: "var(--accent)",
    exposed: "var(--bad)",
  };

  function drawDriftChart(container, title, arms) {
    var card = document.createElement("div");
    card.className = "chart-card";

    var heading = document.createElement("div");
    heading.className = "chart-title";
    heading.textContent = title;
    card.appendChild(heading);

    var w = 230, h = 170;
    var padL = 26, padB = 26, padT = 10, padR = 8;
    var plotW = w - padL - padR, plotH = h - padT - padB;
    var barGap = 14;
    var barW = (plotW - barGap * (arms.length - 1)) / arms.length;
    var maxVal = 1;

    var svgParts = [];
    svgParts.push('<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '">');

    // gridlines at 0, 0.5, 1.0
    [0, 0.5, 1].forEach(function (g) {
      var y = padT + plotH * (1 - g);
      svgParts.push('<line x1="' + padL + '" x2="' + (w - padR) + '" y1="' + y + '" y2="' + y +
        '" style="stroke:var(--border)" stroke-width="1" />');
      svgParts.push('<text x="' + (padL - 6) + '" y="' + (y + 3) + '" text-anchor="end">' + g + '</text>');
    });

    arms.forEach(function (arm, i) {
      var x = padL + i * (barW + barGap);
      var barH = plotH * (arm.value / maxVal);
      var y = padT + plotH - barH;
      var color = ARM_COLOR[arm.arm] || "var(--accent)";

      svgParts.push('<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + Math.max(barH, 1) +
        '" rx="3" style="fill:' + color + '" />');

      if (arm.err) {
        var errPx = plotH * arm.err;
        var cx = x + barW / 2;
        var yTop = y - errPx;
        var yBot = Math.min(y + errPx, padT + plotH);
        svgParts.push('<line x1="' + cx + '" x2="' + cx + '" y1="' + yTop + '" y2="' + yBot +
          '" style="stroke:var(--text)" stroke-width="1.2" />');
        svgParts.push('<line x1="' + (cx - 4) + '" x2="' + (cx + 4) + '" y1="' + yTop + '" y2="' + yTop +
          '" style="stroke:var(--text)" stroke-width="1.2" />');
        svgParts.push('<line x1="' + (cx - 4) + '" x2="' + (cx + 4) + '" y1="' + yBot + '" y2="' + yBot +
          '" style="stroke:var(--text)" stroke-width="1.2" />');
      }

      svgParts.push('<text class="bar-value" x="' + (x + barW / 2) + '" y="' + (y - (arm.err ? plotH * arm.err + 6 : 6)) +
        '" text-anchor="middle">' + arm.value.toFixed(2) + '</text>');
      svgParts.push('<text x="' + (x + barW / 2) + '" y="' + (h - padB + 12) + '" text-anchor="middle">' + arm.label + '</text>');
    });

    svgParts.push("</svg>");
    card.innerHTML += svgParts.join("");
    container.appendChild(card);
  }

  function renderHeadlineCharts() {
    var highRiskContainer = document.getElementById("chart-highrisk");
    var highRiskData = [
      { title: "evil", arms: [
        { arm: "baseline", label: "baseline", value: 0.05, err: 0.05 },
        { arm: "neutral", label: "neutral", value: 0.0, err: 0 },
        { arm: "exposed", label: "evil", value: 0.0, err: 0 },
      ]},
      { title: "manipulative", arms: [
        { arm: "baseline", label: "baseline", value: 0.0, err: 0 },
        { arm: "neutral", label: "neutral", value: 0.0, err: 0 },
        { arm: "exposed", label: "manip.", value: 0.15, err: 0.08 },
      ]},
    ];
    highRiskData.forEach(function (d) { drawDriftChart(highRiskContainer, d.title + " (identity)", d.arms); });

    var rolePlayContainer = document.getElementById("chart-roleplay");
    var rolePlayData = [
      { title: "poet", arms: [
        { arm: "baseline", label: "baseline", value: 0.0, err: 0 },
        { arm: "neutral", label: "neutral", value: 0.15, err: 0.08 },
        { arm: "exposed", label: "poet", value: 0.85, err: 0.08 },
      ]},
      { title: "pirate", arms: [
        { arm: "baseline", label: "baseline", value: 0.0, err: 0 },
        { arm: "neutral", label: "neutral", value: 0.10, err: 0.07 },
        { arm: "exposed", label: "pirate", value: 0.80, err: 0.09 },
      ]},
    ];
    rolePlayData.forEach(function (d) { drawDriftChart(rolePlayContainer, d.title + " (identity)", d.arms); });

    var sweepContainer = document.getElementById("chart-sweep");
    var sweepData = [
      { title: "evil (viewpoint)", arms: [
        { arm: "baseline", label: "baseline", value: 0.0, err: 0 },
        { arm: "neutral", label: "neutral", value: 0.0, err: 0 },
        { arm: "exposed", label: "evil", value: 0.05, err: 0.05 },
      ]},
      { title: "manipulative (technology)", arms: [
        { arm: "baseline", label: "baseline", value: 0.05, err: 0.05 },
        { arm: "neutral", label: "neutral", value: 0.15, err: 0.08 },
        { arm: "exposed", label: "manip.", value: 0.05, err: 0.05 },
      ]},
      { title: "manipulative (economics)", arms: [
        { arm: "baseline", label: "baseline", value: 0.05, err: 0.05 },
        { arm: "neutral", label: "neutral", value: 0.05, err: 0.05 },
        { arm: "exposed", label: "manip.", value: 0.05, err: 0.05 },
      ]},
    ];
    sweepData.forEach(function (d) { drawDriftChart(sweepContainer, d.title, d.arms); });
  }

  // ---- Boot ----
  fetch("data/trials.json").then((r) => r.json()).then(function (trials) {
    state.trials = trials;
    renderPersonaPicker();
    renderArmPicker();
    renderTrial();
    renderHeadlineCharts();
  });
})();
