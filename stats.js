"use strict";
(function () {
  var API = "https://wayygafuzirbnpzhktzk.supabase.co/functions/v1/tds/stats";
  var STORE = "stats_t";
  var SCRIPTS = [
    { id: "tds", name: "TDS Scenario Player", match: /tds|tower/i },
    { id: "rideapet", name: "Ride A Pet Egg Farm", match: /ride/i },
  ];
  var SOURCES = [
    { id: "linkvertise", name: "Linkvertise (ads)", color: "var(--s1)" },
    { id: "linkunlocker", name: "LinkUnlocker (task)", color: "var(--s2)" },
  ];
  var FAIL_NAMES = {
    "load:invalid": "Invalid key typed", "load:expired": "Expired key", "load:device": "Key used on another device",
    "load:error": "Server error", "keyfail:linkvertise": "Linkvertise not completed", "keyfail:linkunlocker": "LinkUnlocker not completed",
  };

  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  var fmt = function (n) { return n == null ? "—" : Number(n).toLocaleString("en-US"); };
  var svgNS = "http://www.w3.org/2000/svg";
  var svg = function (tag, attrs) {
    var e = document.createElementNS(svgNS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };

  // Password: from #t=... once (then wiped from the address bar), else this browser's copy.
  var token = "";
  var hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get("t")) {
    token = hash.get("t");
    try { localStorage.setItem(STORE, token); } catch (e) { /* storage blocked */ }
    history.replaceState(null, "", location.pathname);
  } else {
    try { token = localStorage.getItem(STORE) || ""; } catch (e) { /* ignore */ }
  }

  function showLogin(msg) {
    $("dash").classList.add("hidden");
    $("login").classList.remove("hidden");
    $("loginErr").textContent = msg || "";
  }
  $("go").addEventListener("click", function () {
    token = $("pw").value.trim();
    try { localStorage.setItem(STORE, token); } catch (e) { /* ignore */ }
    load();
  });
  $("pw").addEventListener("keydown", function (e) { if (e.key === "Enter") $("go").click(); });
  $("refresh").addEventListener("click", load);

  // ---- tooltip
  var tip = $("tip");
  function showTip(evt, text) {
    tip.textContent = text;
    tip.classList.remove("hidden");
    var x = Math.min(evt.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = x + "px";
    tip.style.top = (evt.clientY - tip.offsetHeight - 10) + "px";
  }
  function hideTip() { tip.classList.add("hidden"); }

  // ---- helpers over the response
  function sum(totals, prefix, suffix) {
    var n = 0;
    for (var k in totals) {
      if (k.indexOf(prefix) === 0 && (!suffix || k.slice(-suffix.length) === suffix)) n += totals[k];
    }
    return n;
  }
  function last30Days() {
    var out = [];
    var d = new Date();
    for (var i = 29; i >= 0; i--) {
      var x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - i));
      out.push(x.toISOString().slice(0, 10));
    }
    return out;
  }

  // ---- stacked daily bar chart (one axis, thin bars, 2px gaps, hover tooltip)
  function barChart(host, legendHost, days, series, valueOf) {
    host.textContent = "";
    legendHost.textContent = "";
    series.forEach(function (s) {
      var l = el("span", null, s.name);
      l.style.setProperty("--c", s.color);
      legendHost.appendChild(l);
    });
    var totals = days.map(function (d) {
      return series.reduce(function (a, s) { return a + valueOf(d, s); }, 0);
    });
    var max = Math.max.apply(null, totals);
    if (!max) {
      host.appendChild(el("div", "empty", "Nothing yet"));
      return;
    }
    var W = 600, H = 180, padL = 28, padB = 18, padT = 6;
    var plotW = W - padL, plotH = H - padB - padT;
    var step = plotW / days.length, bw = Math.max(3, step - 4);
    var root = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img" });
    var top = Math.ceil(max);
    [0, 0.5, 1].forEach(function (f) {
      var y = padT + plotH - plotH * f;
      root.appendChild(svg("line", { x1: padL, x2: W, y1: y, y2: y, stroke: "var(--grid)", "stroke-width": 1 }));
      var t = svg("text", { x: padL - 6, y: y + 4, "text-anchor": "end", fill: "var(--faint)", "font-size": 10 });
      t.textContent = Math.round(top * f);
      root.appendChild(t);
    });
    days.forEach(function (d, i) {
      var x = padL + i * step + (step - bw) / 2;
      var yBase = padT + plotH;
      var parts = [];
      series.forEach(function (s) {
        var v = valueOf(d, s);
        parts.push(s.name + ": " + v);
        if (!v) return;
        var h = plotH * v / top;
        var segH = Math.max(1, h - 2); // 2px surface gap between stacked segments
        root.appendChild(svg("rect", { x: x, y: yBase - h, width: bw, height: segH, rx: 2, fill: s.color }));
        yBase -= h;
      });
      if ((days.length - 1 - i) % 7 === 0) { // every 7th day, counted back from today
        var t = svg("text", { x: x + bw / 2, y: H - 4, "text-anchor": "middle", fill: "var(--faint)", "font-size": 10 });
        t.textContent = d.date.slice(5);
        root.appendChild(t);
      }
      var hit = svg("rect", { x: padL + i * step, y: 0, width: step, height: H - padB, fill: "transparent" });
      var label = d.date + " · " + parts.join(" · ");
      hit.addEventListener("mousemove", function (e) { showTip(e, label); });
      hit.addEventListener("mouseleave", hideTip);
      root.appendChild(hit);
    });
    host.appendChild(root);
  }

  function render(data) {
    var t = data.totals || {};
    var rs = data.rscripts && !data.rscripts.error ? data.rscripts : null;
    $("updated").textContent = "Last 30 days · updated " + new Date(data.generatedAt).toLocaleTimeString();

    // tiles
    var keysLv = t["key:linkvertise"] || 0, keysLu = t["key:linkunlocker"] || 0;
    var tiles = [
      ["Real runs", rs ? rs.totals.runs : null, rs ? fmt(rs.totals.uniquePlayers) + " players (rscripts)" : "needs RSCRIPTS_API_KEY"],
      ["Live now", rs ? rs.totals.liveNow : null, rs ? "avg session " + rs.totals.avgSessionMinutes + " min" : "rscripts"],
      ["Key window opened", sum(t, "loader:"), "loader fetched"],
      ["Keys issued", keysLv + keysLu, "ads " + keysLv + " · task " + keysLu],
      ["Loaded with a key", sum(t, "load:", ":ok"), "incl. repeat runs"],
      ["Active keys", data.keys.active, data.keys.allTime + " all time"],
    ];
    var host = $("tiles");
    host.textContent = "";
    tiles.forEach(function (x) {
      var d = el("div", "tile");
      d.appendChild(el("div", "label", x[0]));
      d.appendChild(el("div", "value", fmt(x[1])));
      d.appendChild(el("div", "sub", x[2]));
      host.appendChild(d);
    });

    // funnel
    var steps = [
      ["Ran the script", rs ? rs.totals.runs : null],
      ["Key window", sum(t, "loader:")],
      ["Got a key", keysLv + keysLu],
      ["Loaded with key", sum(t, "load:", ":ok")],
    ].filter(function (s) { return s[1] != null; });
    var f = $("funnel");
    f.textContent = "";
    var first = steps.length ? Math.max(steps[0][1], 1) : 1;
    steps.forEach(function (s) {
      var row = el("div", "funnel-row");
      row.appendChild(el("div", "name", s[0]));
      var bar = el("div", "bar"), fill = el("div", "fill");
      fill.style.width = Math.min(100, 100 * s[1] / first) + "%";
      bar.appendChild(fill);
      row.appendChild(bar);
      var num = el("div", "num", fmt(s[1]) + " ");
      num.appendChild(el("span", "pct", Math.round(100 * s[1] / first) + "%"));
      row.appendChild(num);
      f.appendChild(row);
    });

    // daily charts
    var byDate = {};
    (data.daily || []).forEach(function (d) { byDate[d.date] = d.counts; });
    var days = last30Days().map(function (date) { return { date: date, counts: byDate[date] || {} }; });
    barChart($("keysChart"), $("keysLegend"), days, SOURCES, function (d, s) { return d.counts["key:" + s.id] || 0; });
    var scriptSeries = SCRIPTS.map(function (s, i) { return { id: s.id, name: s.name, color: i ? "var(--s2)" : "var(--s1)" }; });
    barChart($("runsChart"), $("runsLegend"), days, scriptSeries, function (d, s) { return d.counts["loader:" + s.id] || 0; });

    // per-script table
    var tbl = $("perScript");
    tbl.textContent = "";
    var head = el("tr");
    ["Script", "Key window", "Loaded with key", "Failed loads", "Runs (rscripts)", "Players (rscripts)"].forEach(function (h) {
      head.appendChild(el("th", null, h));
    });
    tbl.appendChild(head);
    var rsRows = rs ? (rs.perScript || []).slice() : [];
    SCRIPTS.forEach(function (s) {
      var idx = rsRows.findIndex(function (r) { return s.match.test(r.title || r.slug || ""); });
      var r = idx >= 0 ? rsRows.splice(idx, 1)[0] : null;
      var failed = sum(t, "load:" + s.id + ":") - (t["load:" + s.id + ":ok"] || 0);
      var tr = el("tr");
      [s.name, t["loader:" + s.id] || 0, t["load:" + s.id + ":ok"] || 0, failed, r ? r.runs : null, r ? r.uniquePlayers : null]
        .forEach(function (v, i) { tr.appendChild(el("td", null, i ? fmt(v) : v)); });
      tbl.appendChild(tr);
    });
    rsRows.forEach(function (r) {
      var tr = el("tr");
      [r.title, null, null, null, r.runs, r.uniquePlayers].forEach(function (v, i) { tr.appendChild(el("td", null, i ? fmt(v) : v)); });
      tbl.appendChild(tr);
    });

    // failures
    var fails = $("fails");
    fails.textContent = "";
    var failCounts = {};
    for (var k in t) {
      var parts = k.split(":");
      var key = parts[0] === "load" ? "load:" + parts[2] : parts[0] === "keyfail" ? k : null;
      if (key && key !== "load:ok") failCounts[key] = (failCounts[key] || 0) + t[k];
    }
    var fk = Object.keys(failCounts).sort(function (a, b) { return failCounts[b] - failCounts[a]; });
    if (!fk.length) fails.appendChild(el("p", "muted", "None"));
    fk.forEach(function (k) {
      var row = el("div", "list-row");
      row.appendChild(el("span", null, FAIL_NAMES[k] || k));
      row.appendChild(el("span", null, fmt(failCounts[k])));
      fails.appendChild(row);
    });

    // executors
    var ex = $("executors");
    ex.textContent = "";
    var list = rs ? rs.executors || [] : [];
    if (!list.length) ex.appendChild(el("p", "muted", rs ? "No data yet" : "Needs RSCRIPTS_API_KEY"));
    list.forEach(function (x) {
      var row = el("div", "list-row");
      row.appendChild(el("span", null, x.name));
      row.appendChild(el("span", null, fmt(x.sessions)));
      ex.appendChild(row);
    });

    $("rsNote").textContent = rs ? "Runs and players come from rscripts' in-game analytics; key and load numbers from our key server."
      : "rscripts: " + (data.rscripts && data.rscripts.error || "unavailable") + ". Key and load numbers come from our key server.";
    $("login").classList.add("hidden");
    $("dash").classList.remove("hidden");
  }

  var loading = false;
  function load() {
    if (!token) return showLogin();
    if (loading) return;
    loading = true;
    $("refresh").textContent = "Loading…";
    fetch(API, { headers: { "x-stats-token": token }, cache: "no-store" })
      .then(function (res) {
        if (res.status === 403) {
          try { localStorage.removeItem(STORE); } catch (e) { /* ignore */ }
          token = "";
          throw new Error("Wrong password");
        }
        if (!res.ok) throw new Error("Server error (" + res.status + ")");
        return res.json();
      })
      .then(render)
      .catch(function (e) { showLogin(e.message); })
      .then(function () { loading = false; $("refresh").textContent = "Refresh"; });
  }

  load();
  setInterval(function () { if (!document.hidden && token) load(); }, 60000);
})();
