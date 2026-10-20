/* 上海导游考试备考 - 单页应用 */
(function () {
  "use strict";

  var App = document.getElementById("app");
  var Tabbar = document.getElementById("tabbar");

  var DATA = { questions: [], guide: [], qa: [], loaded: false };

  /* ---------------- Storage helpers ---------------- */
  var LS = {
    get: function (key, fallback) {
      try {
        var v = localStorage.getItem(key);
        return v ? JSON.parse(v) : fallback;
      } catch (e) { return fallback; }
    },
    set: function (key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
    }
  };

  var K_WRONG = "tg_wrong_v1";
  var K_STATS = "tg_stats_v1";
  var K_GUIDE_DONE = "tg_guide_done_v1";
  var K_EXAM_HIST = "tg_exam_hist_v1";

  function getWrong() { return LS.get(K_WRONG, {}); }
  function setWrong(o) { LS.set(K_WRONG, o); }
  function getStats() {
    return LS.get(K_STATS, { totalAnswered: 0, totalCorrect: 0, byDate: {} });
  }
  function setStats(s) { LS.set(K_STATS, s); }
  function getGuideDone() { return LS.get(K_GUIDE_DONE, {}); }
  function setGuideDone(o) { LS.set(K_GUIDE_DONE, o); }
  function getExamHist() { return LS.get(K_EXAM_HIST, []); }
  function setExamHist(a) { LS.set(K_EXAM_HIST, a); }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function recordAnswer(correct) {
    var s = getStats();
    s.totalAnswered++;
    if (correct) s.totalCorrect++;
    var t = todayStr();
    if (!s.byDate[t]) s.byDate[t] = { answered: 0, correct: 0 };
    s.byDate[t].answered++;
    if (correct) s.byDate[t].correct++;
    setStats(s);
  }

  function addWrong(q) {
    var w = getWrong();
    w[q.id] = { q: q, addedAt: Date.now() };
    setWrong(w);
  }
  function removeWrong(id) {
    var w = getWrong();
    delete w[id];
    setWrong(w);
  }

  /* ---------------- Utilities ---------------- */
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function esc(s) {
    if (s == null) return "";
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  var YEAR_LABELS = { 0: "模拟题" };

  /* ---------------- Router ---------------- */
  var routes = {};
  function route(pattern, fn) { routes[pattern] = fn; }

  function parseHash() {
    var h = location.hash.replace(/^#/, "");
    if (!h) h = "/home";
    var parts = h.split("?");
    var segs = parts[0].split("/").filter(Boolean);
    var query = {};
    if (parts[1]) {
      parts[1].split("&").forEach(function (kv) {
        var p = kv.split("=");
        query[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || "");
      });
    }
    return { segs: segs, query: query };
  }

  function navigate(hash) { location.hash = hash; }

  function render() {
    var r = parseHash();
    var top = r.segs[0] || "home";
    window.scrollTo(0, 0);
    updateTabbar(top);
    Tabbar.style.display = ["home", "quiz", "exam", "guide", "qa"].indexOf(top) >= 0 && r.segs.length <= 1 ? "flex" : (["quiz","exam","guide","qa"].indexOf(top)>=0 ? "none" : "flex");
    // Show tabbar on top-level pages only; hide during active sessions for focus
    var focusModes = {
      "quizrun": 1, "examrun": 1, "guidesection": 1, "qarun": 1
    };
    try {
      dispatch(r);
    } catch (e) {
      console.error(e);
      App.innerHTML = '<div class="page"><div class="empty">页面出错了：' + esc(e.message) + '</div></div>';
    }
  }

  function updateTabbar(top) {
    qsa(".tab", Tabbar).forEach(function (a) {
      a.classList.toggle("active", a.dataset.tab === top);
    });
  }

  function dispatch(r) {
    var top = r.segs[0] || "home";
    switch (top) {
      case "home": return pageHome();
      case "quiz":
        if (r.segs[1] === "run") return pageQuizRun();
        return pageQuizSetup();
      case "exam":
        if (r.segs[1] === "run") return pageExamRun();
        if (r.segs[1] === "result") return pageExamResult();
        return pageExamSetup();
      case "guide":
        if (r.segs[1] && r.segs[2] != null) return pageGuideSection(r.segs[1], parseInt(r.segs[2], 10));
        if (r.segs[1]) return pageGuideArea(r.segs[1]);
        return pageGuideList();
      case "qa":
        if (r.segs[1] === "run") return pageQaRun();
        return pageQaSetup();
      case "wrongbook": return pageWrongbook();
      case "stats": return pageStats();
      default: return pageHome();
    }
  }

  /* ---------------- Top bar helper ---------------- */
  function topbar(title, opts) {
    opts = opts || {};
    var backHtml = opts.back ? '<a class="back" href="' + opts.back + '">‹</a>' : "";
    var actionHtml = opts.actionLabel ? '<a class="action" id="tb-action">' + esc(opts.actionLabel) + "</a>" : "";
    return '<div class="topbar">' + backHtml + "<h1>" + esc(title) + "</h1>" + actionHtml + "</div>";
  }

  /* ================= HOME ================= */
  function pageHome() {
    var stats = getStats();
    var wrongCount = Object.keys(getWrong()).length;
    var t = todayStr();
    var today = stats.byDate[t] || { answered: 0, correct: 0 };
    var acc = stats.totalAnswered ? Math.round((stats.totalCorrect / stats.totalAnswered) * 100) : 0;

    var qCount = DATA.questions.length;
    var gCount = DATA.guide.reduce(function (s, a) { return s + a.sections.length; }, 0);
    var qaCount = DATA.qa.length;

    App.innerHTML =
      '<div class="topbar"><h1>上海导游考试备考</h1></div>' +
      '<div class="page">' +
        '<div class="stat-card">' +
          '<div class="lbl">今日已练习</div>' +
          '<div class="row"><div class="num">' + today.answered + ' 题</div><div class="lbl">累计正确率 ' + acc + '%</div></div>' +
        '</div>' +
        '<div class="grid2">' +
          tile("📝", "分科刷题", qCount + " 道题库", "#/quiz") +
          tile("⏱️", "模拟考试", "计时组卷", "#/exam") +
          tile("🗺️", "导游词背诵", gCount + " 个知识点", "#/guide") +
          tile("💬", "面试问答", qaCount + " 道问答", "#/qa") +
        "</div>" +
        '<div class="section-title">复习工具</div>' +
        '<div class="card card-tap" onclick="location.hash=\'#/wrongbook\'">' +
          '<div class="link-row" style="border:none;padding:0;">' +
            '<span>📕 错题本</span><span class="v">' + wrongCount + ' 道 ›</span>' +
          "</div>" +
        "</div>" +
        '<div class="card card-tap" onclick="location.hash=\'#/stats\'">' +
          '<div class="link-row" style="border:none;padding:0;">' +
            '<span>📊 学习统计</span><span class="v">累计 ' + stats.totalAnswered + ' 题 ›</span>' +
          "</div>" +
        "</div>" +
      "</div>";
  }

  function tile(icon, title, sub, href) {
    return '<a class="tile" href="' + href + '"><div class="ic">' + icon + '</div><div class="t">' + esc(title) + '</div><div class="s">' + esc(sub) + "</div></a>";
  }

  /* ================= QUIZ (分科刷题) ================= */
  var quizState = null;

  function questionPool(filter) {
    return DATA.questions.filter(function (q) {
      if (filter.subjectGroup && filter.subjectGroup !== "all" && q.subjectGroup !== filter.subjectGroup) return false;
      if (filter.year && filter.year !== "all") {
        if (filter.year === "mock") { if (q.source !== "模拟题") return false; }
        else if (String(q.year) !== filter.year) return false;
      }
      if (filter.type && filter.type !== "all" && q.type !== filter.type) return false;
      return true;
    });
  }

  function pageQuizSetup() {
    var f = pageQuizSetup._f || { subjectGroup: "all", year: "all", type: "all" };
    pageQuizSetup._f = f;

    var years = ["all", "2025", "2024", "2023", "2022", "2020", "2019", "2018", "2016", "mock"];
    var yearLabels = { all: "全部年份", "2025": "2025", "2024": "2024", "2023": "2023", "2022": "2022", "2020": "2020", "2019": "2019", "2018": "2018", "2016": "2016", mock: "模拟题" };
    var groups = [["all", "全部科目"], ["一二", "科目一二（法规/业务）"], ["三四", "科目三四（基础知识）"], ["一二三四", "综合"]];
    var types = [["all", "全部题型"], ["判断题", "判断题"], ["单选题", "单选题"], ["多选题", "多选题"]];

    var count = questionPool(f).length;

    App.innerHTML =
      topbar("分科刷题") +
      '<div class="page">' +
        '<div class="filter-group"><div class="filter-label">科目</div><div class="chip-row" id="f-group">' +
          groups.map(function (g) { return chip(g[1], g[0], f.subjectGroup === g[0]); }).join("") +
        "</div></div>" +
        '<div class="filter-group"><div class="filter-label">年份 / 来源</div><div class="chip-row" id="f-year">' +
          years.map(function (y) { return chip(yearLabels[y], y, f.year === y); }).join("") +
        "</div></div>" +
        '<div class="filter-group"><div class="filter-label">题型</div><div class="chip-row" id="f-type">' +
          types.map(function (t) { return chip(t[1], t[0], f.type === t[0]); }).join("") +
        "</div></div>" +
        '<div class="card" style="text-align:center;color:var(--text-2);font-size:14px;">共匹配 <b style="color:var(--brand);font-size:18px;">' + count + "</b> 道题目</div>" +
        '<button class="btn" id="start-quiz" ' + (count === 0 ? "disabled" : "") + '>开始刷题</button>' +
      "</div>";

    function chip(label, val, active) {
      return '<span class="chip' + (active ? " active" : "") + '" data-val="' + esc(val) + '">' + esc(label) + "</span>";
    }
    function bindChips(id, key) {
      qsa("#" + id + " .chip").forEach(function (el) {
        el.onclick = function () {
          f[key] = el.dataset.val;
          pageQuizSetup();
        };
      });
    }
    bindChips("f-group", "subjectGroup");
    bindChips("f-year", "year");
    bindChips("f-type", "type");

    qs("#start-quiz").onclick = function () {
      var pool = shuffle(questionPool(f));
      quizState = { pool: pool, idx: 0, selected: null, revealed: false, correctCount: 0, mode: "practice" };
      navigate("#/quiz/run");
    };
  }

  function pageQuizRun() {
    if (!quizState || !quizState.pool.length) { navigate("#/quiz"); return; }
    if (quizState.idx >= quizState.pool.length) {
      return renderQuizDone();
    }
    var q = quizState.pool[quizState.idx];
    var pct = Math.round((quizState.idx / quizState.pool.length) * 100);

    App.innerHTML =
      topbar("刷题 " + (quizState.idx + 1) + "/" + quizState.pool.length, { back: "#/quiz" }) +
      '<div class="page" style="padding-bottom:90px;">' +
        '<div class="progress-bar"><div style="width:' + pct + '%"></div></div>' +
        '<div class="q-meta"><span class="q-type-badge">' + esc(q.type) + '</span><span>' + (q.year ? q.year + "年 · " : "") + esc(q.source) + '</span></div>' +
        '<div class="q-stem">' + esc(q.question) + '</div>' +
        '<div id="q-body"></div>' +
        '<div id="q-explain"></div>' +
      "</div>" +
      '<div class="quiz-footer" id="quiz-footer"></div>';

    renderQuizBody(q);
  }

  function renderQuizBody(q) {
    var body = qs("#q-body");
    var footer = qs("#quiz-footer");
    var revealed = quizState.revealed;
    var isMulti = q.type === "多选题";
    var selArr = Array.isArray(quizState.selected) ? quizState.selected : (quizState.selected != null ? [quizState.selected] : []);

    if (q.type === "判断题") {
      body.innerHTML =
        '<div class="tf-row">' +
          tfBtn("正确", "正确") + tfBtn("错误", "错误") +
        "</div>";
      qsa(".tf-btn", body).forEach(function (btn) {
        btn.onclick = function () { selectAnswer(btn.dataset.val, false); };
      });
    } else {
      var opts = q.options && q.options.length ? q.options : [];
      if (!opts.length) {
        body.innerHTML = q.type === "简答"
          ? '<div class="option" style="color:var(--text-3);">（该题为背记类问答题，点击"显示答案"查看参考答案）</div>'
          : '<div class="option" style="color:var(--text-3);">（本题无选项，点击“显示答案”查看参考答案）</div>';
      } else {
        var hint = (isMulti && !revealed) ? '<div style="font-size:12px;color:var(--text-3);margin:-2px 0 8px;">多选题：可选择多个选项</div>' : "";
        body.innerHTML = hint + opts.map(function (o, i) {
          return optRow(o, i);
        }).join("");
        qsa(".option", body).forEach(function (el) {
          el.onclick = function () { selectAnswer(el.dataset.val, isMulti); };
        });
      }
    }

    function tfBtn(label, val) {
      var cls = "tf-btn";
      if (revealed) {
        if (val === normalizedAnswer(q)) cls += " correct";
        else if (val === quizState.selected) cls += " wrong";
      } else if (quizState.selected === val) cls += " selected";
      return '<div class="' + cls + '" data-val="' + esc(val) + '">' + label + "</div>";
    }
    function optRow(text, i) {
      var letter = text.match(/^([A-E])[\.．]/);
      var val = letter ? letter[1] : text;
      var cls = "option";
      var isCorrectOpt = isOptionCorrect(q, val, text);
      var isSel = selArr.indexOf(val) >= 0;
      if (revealed) {
        if (isCorrectOpt) cls += " correct";
        else if (isSel) cls += " wrong";
      } else if (isSel) cls += " selected";
      return '<div class="' + cls + '" data-val="' + esc(val) + '"><span class="mark">' + (letter ? letter[1] : "•") + '</span><span>' + esc(text.replace(/^([A-E])[\.．]\s*/, "")) + "</span></div>";
    }

    // footer buttons
    if (!revealed) {
      footer.innerHTML = '<button class="btn secondary" id="btn-show">显示答案</button>';
      qs("#btn-show").onclick = function () { revealAnswer(q); };
    } else {
      var isLast = quizState.idx === quizState.pool.length - 1;
      footer.innerHTML = '<button class="btn" id="btn-next">' + (isLast ? "查看结果" : "下一题") + "</button>";
      qs("#btn-next").onclick = function () {
        quizState.idx++;
        quizState.selected = null;
        quizState.revealed = false;
        pageQuizRun();
      };
    }

    if (revealed) renderExplain(q);
  }

  function normalizedAnswer(q) {
    if (q.type === "判断题") return q.answer.indexOf("正") >= 0 ? "正确" : "错误";
    return q.answer;
  }
  function answerLetters(q) {
    return (q.answer.match(/[A-E](?=[\.．])/g) || []);
  }
  function isOptionCorrect(q, letter, text) {
    var ans = q.answer || "";
    if (ans.indexOf(letter + ".") === 0 || ans.indexOf(letter + "、") >= 0 || ans === letter) return true;
    // multi-answer like "A.xx、B.xx"
    var re = new RegExp("(^|、)" + letter + "[\\.．]");
    return re.test(ans);
  }

  function selectAnswer(val, isMulti) {
    if (quizState.revealed) return;
    if (isMulti) {
      var cur = Array.isArray(quizState.selected) ? quizState.selected.slice() : [];
      var pos = cur.indexOf(val);
      if (pos >= 0) cur.splice(pos, 1); else cur.push(val);
      quizState.selected = cur;
    } else {
      quizState.selected = val;
    }
    var q = quizState.pool[quizState.idx];
    renderQuizBody(q);
  }

  function revealAnswer(q) {
    quizState.revealed = true;
    if (q.type === "简答") {
      // 无选项的背记类问答，不计入对错统计
      renderQuizBody(q);
      return;
    }
    var correct = computeCorrect(q, quizState.selected);
    recordAnswer(correct);
    if (correct) { removeWrong(q.id); } else { addWrong(q); }
    renderQuizBody(q);
  }

  function computeCorrect(q, selected) {
    if (selected == null || (Array.isArray(selected) && !selected.length)) return false;
    if (q.type === "判断题") return selected === normalizedAnswer(q);
    if (q.type === "多选题") {
      var selArr = (Array.isArray(selected) ? selected : [selected]).slice().sort();
      var ansArr = answerLetters(q).slice().sort();
      return selArr.length > 0 && JSON.stringify(selArr) === JSON.stringify(ansArr);
    }
    if (q.type === "简答") return false; // 无法自动判分，仅展示参考答案
    return isOptionCorrect(q, selected);
  }

  function renderExplain(q) {
    var el = qs("#q-explain");
    var correct = computeCorrect(q, quizState.selected);
    var html;
    if (q.type === "简答") {
      html = '<div class="result-banner" style="background:var(--brand-light);color:var(--brand-dark);">📖 参考答案如下</div>';
    } else {
      html = '<div class="result-banner ' + (correct ? "ok" : "bad") + '">' + (correct ? "✓ 回答正确" : "✕ 回答错误") + "</div>";
    }
    html += '<div class="explain-box"><b>正确答案：</b>' + esc(q.answer || "") + "</div>";
    if (q.explanation) {
      html += '<div class="explain-box" style="margin-top:8px;"><b>解析：</b>' + esc(q.explanation) + "</div>";
    }
    el.innerHTML = html;
  }

  function renderQuizDone() {
    var total = quizState.pool.length;
    App.innerHTML =
      topbar("刷题完成", { back: "#/quiz" }) +
      '<div class="page">' +
        '<div class="score-hero"><div class="big">' + total + '</div><div class="sub">本次共练习 ' + total + ' 道题</div></div>' +
        '<button class="btn" id="btn-redo">再刷一轮（相同筛选）</button>' +
        '<button class="btn secondary" style="margin-top:10px;" onclick="location.hash=\'#/wrongbook\'">查看错题本</button>' +
        '<button class="btn ghost" style="margin-top:10px;" onclick="location.hash=\'#/quiz\'">返回筛选</button>' +
      "</div>";
    qs("#btn-redo").onclick = function () {
      quizState.pool = shuffle(quizState.pool);
      quizState.idx = 0; quizState.selected = null; quizState.revealed = false;
      navigate("#/quiz/run");
    };
  }

  /* ================= WRONGBOOK ================= */
  function pageWrongbook() {
    var w = getWrong();
    var list = Object.keys(w).map(function (k) { return w[k].q; });
    App.innerHTML =
      topbar("错题本", { back: "#/home" }) +
      '<div class="page">' +
        (list.length ? '<button class="btn" id="btn-review-wrong">开始复习错题（' + list.length + ' 道）</button>' : "") +
        '<div style="margin-top:14px;">' +
        (list.length ? list.map(function (q, i) { return wrongCard(q, i); }).join("") : '<div class="empty">还没有错题，继续加油！</div>') +
        "</div>" +
      "</div>";

    if (list.length) {
      qs("#btn-review-wrong").onclick = function () {
        quizState = { pool: shuffle(list), idx: 0, selected: null, revealed: false, mode: "wrong" };
        navigate("#/quiz/run");
      };
      qsa(".wrong-remove").forEach(function (btn) {
        btn.onclick = function (e) {
          e.stopPropagation();
          removeWrong(btn.dataset.id);
          pageWrongbook();
        };
      });
    }

    function wrongCard(q, i) {
      return '<div class="card">' +
        '<div class="q-meta"><span class="q-type-badge">' + esc(q.type) + '</span><span>' + (q.year ? q.year + "年" : q.source) + '</span></div>' +
        '<div style="font-size:14.5px;line-height:1.6;margin:6px 0;">' + esc(q.question) + '</div>' +
        '<div class="explain-box"><b>正确答案：</b>' + esc(q.answer) + '</div>' +
        '<div style="display:flex;justify-content:flex-end;margin-top:8px;">' +
          '<span class="btn ghost sm wrong-remove" data-id="' + esc(q.id) + '">移出错题本</span>' +
        "</div>" +
      "</div>";
    }
  }

  /* ================= STATS ================= */
  function pageStats() {
    var s = getStats();
    var hist = getExamHist();
    var dates = Object.keys(s.byDate).sort().reverse().slice(0, 14);
    var acc = s.totalAnswered ? Math.round((s.totalCorrect / s.totalAnswered) * 100) : 0;

    App.innerHTML =
      topbar("学习统计", { back: "#/home" }) +
      '<div class="page">' +
        '<div class="grid3">' +
          statTile(s.totalAnswered, "累计做题") +
          statTile(s.totalCorrect, "累计正确") +
          statTile(acc + "%", "正确率") +
        "</div>" +
        '<div class="section-title">最近练习</div>' +
        '<div class="card">' +
          (dates.length ? dates.map(function (d) {
            var v = s.byDate[d];
            var a = v.answered ? Math.round((v.correct / v.answered) * 100) : 0;
            return '<div class="link-row"><span>' + d + '</span><span class="v">' + v.answered + ' 题 · 正确率 ' + a + '%</span></div>';
          }).join("") : '<div class="empty">暂无记录</div>') +
        "</div>" +
        '<div class="section-title">模拟考试记录</div>' +
        '<div class="card">' +
          (hist.length ? hist.slice().reverse().slice(0, 10).map(function (h) {
            return '<div class="link-row"><span>' + h.date + ' · ' + esc(h.groupLabel) + '</span><span class="v">' + h.score + '/' + h.total + '</span></div>';
          }).join("") : '<div class="empty">暂无模拟考试记录</div>') +
        "</div>" +
      "</div>";

    function statTile(num, lbl) {
      return '<div class="tile"><div class="t" style="font-size:20px;color:var(--brand);">' + num + '</div><div class="s">' + lbl + "</div></div>";
    }
  }

  /* ================= EXAM (模拟考试) ================= */
  var examState = null;
  var EXAM_PRESETS = [
    { key: "一二", label: "科目一 + 科目二", desc: "政策法规与旅游职业道德 / 导游业务", counts: { "判断题": 10, "单选题": 25, "多选题": 5 }, minutes: 50 },
    { key: "三四", label: "科目三 + 科目四", desc: "全国导游基础知识 / 上海地方导游基础知识", counts: { "判断题": 10, "单选题": 25, "多选题": 5 }, minutes: 50 },
    { key: "一二三四", label: "综合模拟", desc: "从全部题库随机抽取", counts: { "判断题": 15, "单选题": 30, "多选题": 5 }, minutes: 60 }
  ];

  function pageExamSetup() {
    App.innerHTML =
      topbar("模拟考试") +
      '<div class="page">' +
        '<div class="radio-list" id="exam-list">' +
        EXAM_PRESETS.map(function (p, i) {
          return '<div class="radio-item card-tap" data-i="' + i + '"><div><div class="name">' + esc(p.label) + '</div><div class="desc">' + esc(p.desc) + ' · 共' + (p.counts["判断题"]+p.counts["单选题"]+p.counts["多选题"]) + '题 · ' + p.minutes + '分钟</div></div><span>›</span></div>';
        }).join("") +
        "</div>" +
        '<div class="section-title">说明</div>' +
        '<div class="card" style="font-size:13px;color:var(--text-2);line-height:1.7;">题目从历年真题与模拟题库中随机抽取，题量与时长为模拟练习设置，仅供熟悉考试节奏参考，请以官方考试大纲为准。</div>' +
      "</div>";

    qsa(".radio-item", App).forEach(function (el) {
      el.onclick = function () { startExam(EXAM_PRESETS[parseInt(el.dataset.i, 10)]); };
    });
  }

  function startExam(preset) {
    var pool = DATA.questions.filter(function (q) {
      return preset.key === "一二三四" ? true : q.subjectGroup === preset.key;
    });
    var byType = { "判断题": [], "单选题": [], "多选题": [] };
    pool.forEach(function (q) { if (byType[q.type]) byType[q.type].push(q); });
    var picked = [];
    Object.keys(preset.counts).forEach(function (t) {
      picked = picked.concat(shuffle(byType[t]).slice(0, preset.counts[t]));
    });
    picked = shuffle(picked);
    if (!picked.length) { alert("题库暂不足以生成该模拟卷"); return; }

    examState = {
      preset: preset,
      questions: picked,
      answers: {}, // idx -> selected val
      idx: 0,
      endAt: Date.now() + preset.minutes * 60000,
      submitted: false
    };
    navigate("#/exam/run");
  }

  var examTimerHandle = null;

  function pageExamRun() {
    if (!examState) { navigate("#/exam"); return; }
    var q = examState.questions[examState.idx];

    App.innerHTML =
      '<div class="topbar"><a class="back" href="#/exam">‹</a><h1>' + (examState.idx + 1) + ' / ' + examState.questions.length + '</h1><span class="action" id="exam-submit-top">交卷</span></div>' +
      '<div class="timer-pill" id="exam-timer">--:--</div>' +
      '<div class="page" style="padding-bottom:170px;">' +
        '<div class="q-meta"><span class="q-type-badge">' + esc(q.type) + '</span></div>' +
        '<div class="q-stem">' + esc(q.question) + '</div>' +
        '<div id="exam-body"></div>' +
        '<div class="card-num-grid" id="exam-nav"></div>' +
      "</div>" +
      '<div class="quiz-footer" id="exam-footer"></div>';

    renderExamBody(q);
    renderExamNav();
    bindExamFooter();

    qs("#exam-submit-top").onclick = confirmSubmitExam;

    clearInterval(examTimerHandle);
    examTimerHandle = setInterval(updateExamTimer, 1000);
    updateExamTimer();
  }

  function updateExamTimer() {
    var el = qs("#exam-timer");
    if (!el || !examState) { clearInterval(examTimerHandle); return; }
    var remain = (examState.endAt - Date.now()) / 1000;
    if (remain <= 0) {
      clearInterval(examTimerHandle);
      submitExam();
      return;
    }
    el.textContent = fmtTime(remain);
  }

  function renderExamBody(q) {
    var body = qs("#exam-body");
    var selected = examState.answers[examState.idx];
    if (q.type === "判断题") {
      body.innerHTML = '<div class="tf-row">' +
        ["正确", "错误"].map(function (v) {
          return '<div class="tf-btn' + (selected === v ? " selected" : "") + '" data-val="' + v + '">' + v + "</div>";
        }).join("") + "</div>";
    } else {
      var opts = q.options && q.options.length ? q.options : [];
      body.innerHTML = opts.map(function (o) {
        var letter = (o.match(/^([A-E])[\.．]/) || [])[1] || o;
        var isSel = (selected || []).indexOf ? (selected || []).indexOf(letter) >= 0 : selected === letter;
        return '<div class="option' + (isSel ? " selected" : "") + '" data-val="' + esc(letter) + '"><span class="mark">' + letter + '</span><span>' + esc(o.replace(/^([A-E])[\.．]\s*/, "")) + "</span></div>";
      }).join("");
    }
    qsa(".tf-btn, .option", body).forEach(function (el) {
      el.onclick = function () {
        var q2 = examState.questions[examState.idx];
        if (q2.type === "多选题") {
          var cur = examState.answers[examState.idx] || [];
          if (!Array.isArray(cur)) cur = [];
          var v = el.dataset.val;
          var pos = cur.indexOf(v);
          if (pos >= 0) cur.splice(pos, 1); else cur.push(v);
          examState.answers[examState.idx] = cur;
        } else {
          examState.answers[examState.idx] = el.dataset.val;
        }
        renderExamBody(q2);
        renderExamNav();
      };
    });
  }

  function renderExamNav() {
    var nav = qs("#exam-nav");
    if (!nav) return;
    nav.innerHTML = examState.questions.map(function (q, i) {
      var cls = "n";
      if (i === examState.idx) cls += " current";
      else if (examState.answers[i] != null && examState.answers[i].length !== 0) cls += " answered";
      return '<div class="' + cls + '" data-i="' + i + '">' + (i + 1) + "</div>";
    }).join("");
    qsa(".n", nav).forEach(function (el) {
      el.onclick = function () { examState.idx = parseInt(el.dataset.i, 10); pageExamRun(); };
    });
  }

  function bindExamFooter() {
    var footer = qs("#exam-footer");
    var isFirst = examState.idx === 0;
    var isLast = examState.idx === examState.questions.length - 1;
    footer.innerHTML =
      '<button class="btn ghost" id="exam-prev" ' + (isFirst ? "disabled" : "") + '>上一题</button>' +
      '<button class="btn" id="exam-next">' + (isLast ? "交卷" : "下一题") + "</button>";
    qs("#exam-prev").onclick = function () { examState.idx--; pageExamRun(); };
    qs("#exam-next").onclick = function () {
      if (isLast) { confirmSubmitExam(); }
      else { examState.idx++; pageExamRun(); }
    };
  }

  function confirmSubmitExam() {
    var answered = Object.keys(examState.answers).length;
    var total = examState.questions.length;
    if (confirm("已作答 " + answered + "/" + total + " 题，确认交卷吗？")) {
      submitExam();
    }
  }

  function submitExam() {
    if (!examState || examState.submitted) return;
    examState.submitted = true;
    clearInterval(examTimerHandle);
    var correct = 0;
    examState.questions.forEach(function (q, i) {
      var sel = examState.answers[i];
      var ok = false;
      if (sel != null) {
        if (q.type === "判断题") ok = sel === normalizedAnswer(q);
        else if (q.type === "多选题") {
          var selArr = Array.isArray(sel) ? sel.slice().sort() : [];
          var ansLetters = (q.answer.match(/[A-E](?=[\.．])/g) || []).sort();
          ok = selArr.length && JSON.stringify(selArr) === JSON.stringify(ansLetters);
        } else {
          ok = isOptionCorrect(q, sel);
        }
      }
      examState.results = examState.results || [];
      examState.results[i] = ok;
      if (ok) correct++; else addWrong(q);
      recordAnswer(ok);
    });
    examState.score = correct;
    var hist = getExamHist();
    hist.push({
      date: new Date().toLocaleString("zh-CN", { hour12: false }),
      groupLabel: examState.preset.label,
      score: correct,
      total: examState.questions.length
    });
    setExamHist(hist);
    navigate("#/exam/result");
  }

  function pageExamResult() {
    if (!examState || !examState.submitted) { navigate("#/exam"); return; }
    var total = examState.questions.length;
    var score = examState.score;
    var pct = Math.round((score / total) * 100);

    App.innerHTML =
      topbar("考试结果", { back: "#/home" }) +
      '<div class="page">' +
        '<div class="score-hero"><div class="big">' + score + ' / ' + total + '</div><div class="sub">正确率 ' + pct + '% · ' + esc(examState.preset.label) + '</div></div>' +
        '<button class="btn" id="btn-review">查看逐题解析</button>' +
        '<button class="btn secondary" style="margin-top:10px;" onclick="location.hash=\'#/exam\'">再来一次</button>' +
        '<button class="btn ghost" style="margin-top:10px;" onclick="location.hash=\'#/home\'">返回首页</button>' +
        '<div id="exam-review" style="margin-top:16px;"></div>' +
      "</div>";

    qs("#btn-review").onclick = function () {
      var el = qs("#exam-review");
      el.innerHTML = examState.questions.map(function (q, i) {
        var ok = examState.results[i];
        var sel = examState.answers[i];
        var selText = Array.isArray(sel) ? sel.join("、") : (sel || "未作答");
        return '<div class="card">' +
          '<div class="q-meta"><span class="q-type-badge">' + esc(q.type) + '</span><span style="color:' + (ok ? "var(--good)" : "var(--bad)") + ';font-weight:600;">' + (ok ? "✓ 正确" : "✕ 错误") + '</span></div>' +
          '<div style="font-size:14.5px;line-height:1.6;margin:6px 0;">' + (i + 1) + '. ' + esc(q.question) + '</div>' +
          (q.options && q.options.length ? '<div style="font-size:13px;color:var(--text-2);margin-bottom:4px;">' + q.options.map(esc).join("<br>") + '</div>' : '') +
          '<div class="explain-box"><b>你的答案：</b>' + esc(selText) + '　<b>正确答案：</b>' + esc(q.answer) + (q.explanation ? '<br><b>解析：</b>' + esc(q.explanation) : '') + '</div>' +
        "</div>";
      }).join("");
      qs("#btn-review").style.display = "none";
    };
  }

  /* ================= GUIDE (导游词) ================= */
  var AREA_ICONS = {
    "overview": "🏙️", "waitan": "🌉", "renminguangchang": "🏛️", "yuyuan": "🏯",
    "dongfangmingzhu": "🗼", "longhua": "🛕", "xujiahuiyuan": "⛪"
  };

  function pageGuideList() {
    var done = getGuideDone();
    App.innerHTML =
      topbar("导游词背诵") +
      '<div class="page">' +
        DATA.guide.map(function (area) {
          var total = area.sections.length;
          var doneCount = area.sections.filter(function (s) { return done[area.areaId + "|" + s.title]; }).length;
          return '<a class="card area-card" href="#/guide/' + area.areaId + '">' +
            '<div class="icon">' + (AREA_ICONS[area.areaId] || "📍") + '</div>' +
            '<div class="info"><div class="name">' + esc(area.areaName) + '</div><div class="sub">' + total + ' 个知识点 · 已掌握 ' + doneCount + '</div></div>' +
            '<div class="arrow">›</div>' +
          "</a>";
        }).join("") +
      "</div>";
  }

  function pageGuideArea(areaId) {
    var area = DATA.guide.find(function (a) { return a.areaId === areaId; });
    if (!area) { navigate("#/guide"); return; }
    var done = getGuideDone();

    App.innerHTML =
      topbar(area.areaName, { back: "#/guide" }) +
      '<div class="page">' +
        '<div class="card" style="padding:6px 16px;">' +
        area.sections.map(function (s, i) {
          var key = areaId + "|" + s.title;
          return '<div class="guide-section-item">' +
            '<a style="flex:1;" href="#/guide/' + areaId + '/' + i + '"><div class="title">' + esc(s.title) + '</div><div class="len">约 ' + s.content.length + ' 字</div></a>' +
            '<span class="check-badge' + (done[key] ? " done" : "") + '" data-key="' + esc(key) + '"></span>' +
          "</div>";
        }).join("") +
        "</div>" +
      "</div>";

    qsa(".check-badge", App).forEach(function (el) {
      el.onclick = function () {
        var d = getGuideDone();
        var k = el.dataset.key;
        d[k] = !d[k];
        setGuideDone(d);
        pageGuideArea(areaId);
      };
    });
  }

  function pageGuideSection(areaId, idx) {
    var area = DATA.guide.find(function (a) { return a.areaId === areaId; });
    if (!area || !area.sections[idx]) { navigate("#/guide/" + areaId); return; }
    var sec = area.sections[idx];
    var mode = pageGuideSection._mode || "read";
    var done = getGuideDone();
    var key = areaId + "|" + sec.title;

    App.innerHTML =
      topbar(sec.title, { back: "#/guide/" + areaId }) +
      '<div class="page" style="padding-bottom:110px;">' +
        '<div class="mode-switch">' +
          '<div class="chip' + (mode === "read" ? " active" : "") + '" data-m="read">通读模式</div>' +
          '<div class="chip' + (mode === "recite" ? " active" : "") + '" data-m="recite">背诵模式</div>' +
        "</div>" +
        '<div class="card"><div class="guide-content" id="guide-content"></div></div>' +
      "</div>" +
      '<div class="quiz-footer">' +
        '<button class="btn secondary" id="btn-mark">' + (done[key] ? "✓ 已掌握" : "标记为已掌握") + '</button>' +
        '<button class="btn" id="btn-nextsec">下一个知识点</button>' +
      "</div>";

    renderGuideContent(sec.content, mode);

    qsa(".mode-switch .chip", App).forEach(function (el) {
      el.onclick = function () {
        pageGuideSection._mode = el.dataset.m;
        pageGuideSection(areaId, idx);
      };
    });
    qs("#btn-mark").onclick = function () {
      var d = getGuideDone();
      d[key] = !d[key];
      setGuideDone(d);
      pageGuideSection(areaId, idx);
    };
    qs("#btn-nextsec").onclick = function () {
      var nextIdx = idx + 1 < area.sections.length ? idx + 1 : 0;
      navigate("#/guide/" + areaId + "/" + nextIdx);
    };
  }

  function renderGuideContent(text, mode) {
    var el = qs("#guide-content");
    if (mode === "read") {
      el.innerHTML = esc(text);
      return;
    }
    // recite mode: mask ~18% of characters in short runs, tap-to-reveal
    var chars = text.split("");
    var html = "";
    var i = 0;
    var rand = mulberry32(hashStr(text));
    while (i < chars.length) {
      var c = chars[i];
      var isCJK = /[一-鿿]/.test(c);
      if (isCJK && rand() < 0.10) {
        var len = 2 + Math.floor(rand() * 3);
        var chunk = chars.slice(i, i + len).join("");
        if (/^[一-鿿]+$/.test(chunk)) {
          html += '<span class="blank" onclick="this.classList.toggle(\'revealed\')">' + esc(chunk) + "</span>";
          i += chunk.length;
          continue;
        }
      }
      html += esc(c);
      i++;
    }
    el.innerHTML = html;
  }

  function hashStr(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
    return h;
  }
  function mulberry32(seed) {
    var t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ================= QA (面试问答) ================= */
  var qaState = null;

  function pageQaSetup() {
    var cats = ["all"].concat(uniq(DATA.qa.map(function (q) { return q.category; })));
    var f = pageQaSetup._cat || "all";
    App.innerHTML =
      topbar("面试问答") +
      '<div class="page">' +
        '<div class="filter-group"><div class="filter-label">分类</div><div class="chip-row" id="qa-cats">' +
          cats.map(function (c) {
            return '<span class="chip' + (f === c ? " active" : "") + '" data-c="' + esc(c) + '">' + (c === "all" ? "全部" : esc(c)) + "</span>";
          }).join("") +
        "</div></div>" +
        '<div class="card" style="text-align:center;color:var(--text-2);">共 <b style="color:var(--brand);font-size:18px;">' + DATA.qa.filter(function (q) { return f === "all" || q.category === f; }).length + '</b> 道问答题</div>' +
        '<button class="btn" id="qa-start">开始练习（翻卡片）</button>' +
      "</div>";

    qsa("#qa-cats .chip").forEach(function (el) {
      el.onclick = function () { pageQaSetup._cat = el.dataset.c; pageQaSetup(); };
    });
    qs("#qa-start").onclick = function () {
      var pool = shuffle(DATA.qa.filter(function (q) { return f === "all" || q.category === f; }));
      qaState = { pool: pool, idx: 0, flipped: false };
      navigate("#/qa/run");
    };
  }

  function uniq(arr) {
    var seen = {}, out = [];
    arr.forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); } });
    return out;
  }

  function pageQaRun() {
    if (!qaState || !qaState.pool.length) { navigate("#/qa"); return; }
    var q = qaState.pool[qaState.idx];
    App.innerHTML =
      topbar("问答 " + (qaState.idx + 1) + "/" + qaState.pool.length, { back: "#/qa" }) +
      '<div class="page">' +
        '<div class="flashcard' + (qaState.flipped ? " answer" : "") + '" id="flashcard">' +
          '<div class="label">' + (qaState.flipped ? "参考答案" : esc(q.category)) + '</div>' +
          '<div class="content">' + esc(qaState.flipped ? q.answer : q.question) + "</div>" +
        "</div>" +
        '<div class="card-hint">点击卡片' + (qaState.flipped ? "返回问题" : "查看答案") + '</div>' +
        '<div class="qa-nav">' +
          '<button class="btn ghost" id="qa-prev" ' + (qaState.idx === 0 ? "disabled" : "") + '>上一题</button>' +
          '<button class="btn" id="qa-next">' + (qaState.idx === qaState.pool.length - 1 ? "完成" : "下一题") + "</button>" +
        "</div>" +
      "</div>";

    qs("#flashcard").onclick = function () { qaState.flipped = !qaState.flipped; pageQaRun(); };
    qs("#qa-prev").onclick = function () { qaState.idx--; qaState.flipped = false; pageQaRun(); };
    qs("#qa-next").onclick = function () {
      if (qaState.idx === qaState.pool.length - 1) { navigate("#/qa"); return; }
      qaState.idx++; qaState.flipped = false; pageQaRun();
    };
  }

  /* ================= BOOT ================= */
  function loadData(cb) {
    Promise.all([
      fetch("data/questions.json").then(function (r) { return r.json(); }),
      fetch("data/guide.json").then(function (r) { return r.json(); }),
      fetch("data/interview_qa.json").then(function (r) { return r.json(); })
    ]).then(function (res) {
      DATA.questions = res[0];
      DATA.guide = res[1];
      DATA.qa = res[2];
      DATA.loaded = true;
      cb();
    }).catch(function (err) {
      App.innerHTML = '<div class="page"><div class="empty">数据加载失败，请检查网络后刷新重试。<br>' + esc(err.message) + "</div></div>";
    });
  }

  App.innerHTML = '<div class="page"><div class="empty">加载中…</div></div>';
  Tabbar.style.display = "none";

  loadData(function () {
    Tabbar.style.display = "flex";
    window.addEventListener("hashchange", render);
    render();
  });

  qsa(".tab", Tabbar).forEach(function (a) {
    a.addEventListener("click", function () {
      // reset in-memory session states when switching top-level tabs
    });
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }
})();
