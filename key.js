"use strict";
(function () {
  // Refuse to run inside someone else's frame (clickjacking). GitHub Pages
  // can't send X-Frame-Options, so do it here.
  if (window.top !== window.self) {
    document.documentElement.textContent = "";
    try { window.top.location = window.self.location.href; } catch (e) { /* cross-origin: page stays blank */ }
    return;
  }

  var KEY_RE = /^TDS-[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/; // server alphabet: no 0/O/1/I
  var STORE = "tds_key_view";
  var ERRORS = {
    bypass: ["Link not completed", "The Linkvertise step couldn't be verified. Open the key link again and finish it without skipping or refreshing."],
    config: ["Key system offline", "The key system is being set up. Try again in a few minutes."],
    server: ["Something went wrong", "The key server had a problem. Please try again."],
    limit: ["Too many keys", "You've reached today's key limit on this network. Use the key you already have, or try again tomorrow."]
  };

  // The key arrives in the #fragment (never sent to any server). Read it once,
  // then wipe it from the address bar and history so it can't leak through a
  // copied URL, a screenshot of the address bar or browser history. A copy is
  // kept for this tab only, so a refresh still shows it.
  window.addEventListener("hashchange", function () { location.reload(); });
  var params = new URLSearchParams(location.hash.slice(1));
  if (location.hash) {
    history.replaceState(null, "", location.pathname + location.search);
    if (params.get("k")) {
      try { sessionStorage.setItem(STORE, params.toString()); } catch (e) { /* storage blocked: fine */ }
    } else {
      try { sessionStorage.removeItem(STORE); } catch (e) { /* ignore */ }
    }
  } else {
    try { params = new URLSearchParams(sessionStorage.getItem(STORE) || ""); } catch (e) { /* ignore */ }
  }

  var key = params.get("k") || "";
  var expires = Number(params.get("e"));
  var $ = function (id) { return document.getElementById(id); };
  var show = function (id) { $(id).classList.remove("hidden"); $(id).classList.add("show"); };

  if (KEY_RE.test(key)) {
    $("key").textContent = key;
    show("ok");

    var btn = $("copy");
    var done = function () {
      btn.textContent = "Copied!";
      btn.classList.add("copied");
      setTimeout(function () { btn.textContent = "Copy key"; btn.classList.remove("copied"); }, 1800);
    };
    var fallback = function () {
      var r = document.createRange();
      r.selectNodeContents($("key"));
      var s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
      try { document.execCommand("copy"); done(); } catch (e) { btn.textContent = "Press Ctrl+C"; }
    };
    btn.addEventListener("click", function () {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(key).then(done, fallback);
      } else {
        fallback();
      }
    });

    // Expiry countdown (text only, nothing parsed as HTML).
    if (isFinite(expires) && expires > 0 && expires < Date.now() + 2 * 86400000) {
      var el = $("expiry");
      var tick = function () {
        var left = Math.max(0, expires - Date.now());
        el.textContent = "";
        if (left <= 0) {
          var b = document.createElement("b");
          b.className = "expired";
          b.textContent = "Expired";
          el.appendChild(b);
          return;
        }
        var h = Math.floor(left / 3600000), m = Math.floor(left / 60000) % 60, s = Math.floor(left / 1000) % 60;
        el.appendChild(document.createTextNode("Expires in "));
        var t = document.createElement("b");
        t.textContent = h + "h " + String(m).padStart(2, "0") + "m " + String(s).padStart(2, "0") + "s";
        el.appendChild(t);
      };
      tick();
      setInterval(tick, 1000);
    }
  } else {
    var e = ERRORS[params.get("err")] || ["No key here", "Open the key link to get a free 24-hour key."];
    $("errTitle").textContent = e[0];
    $("errText").textContent = e[1];
    show("err");
  }
})();
