// Factory Planner — landing page interactions.
// Three small pieces: mobile menu, the draggable hero layout, and two looping feature animations.
(function () {
  "use strict";

  var SVGNS = "http://www.w3.org/2000/svg";
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var clamp01 = function (x) { return Math.max(0, Math.min(1, x)); };
  var smooth = function (x) { x = clamp01(x); return x * x * (3 - 2 * x); };
  var easeInOut = function (x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };

  /* ---------- Mobile menu ---------- */
  var menuBtn = document.querySelector(".menu-btn");
  var menu = document.getElementById("mobile-menu");
  function setMenu(open) {
    menu.hidden = !open;
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.querySelector(".icon-open").hidden = open;
    menuBtn.querySelector(".icon-close").hidden = !open;
  }
  menuBtn.addEventListener("click", function () { setMenu(menu.hidden); });
  menu.addEventListener("click", function (e) { if (e.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !menu.hidden) { setMenu(false); menuBtn.focus(); } });

  // Other pages (privacy, terms) share the header but have no hero or feature animations.
  if (!document.getElementById("hero-plan")) return;

  /* ---------- Hero: draggable layout ---------- */
  // Machine sizes, flows [from, to, weight], and the scattered starting layout (centre points, SVG units).
  var SIZE = [[60, 40], [56, 44], [70, 40], [44, 60], [64, 40], [56, 44]];
  var FLOWS = [[0, 1, 3], [1, 2, 3], [2, 3, 3], [3, 4, 3], [4, 5, 3], [0, 3, 1], [1, 4, 1]];
  var START = [[400, 260], [110, 120], [300, 270], [210, 110], [420, 120], [120, 260]];
  var LABELS = ["Receiving", "Saw", "Lathe", "Mill", "Weld", "Pack"];
  var BOUNDS = { x0: 36, x1: 478, y0: 36, y1: 330 };

  function cost(p) {
    return FLOWS.reduce(function (s, f) { return s + f[2] * Math.hypot(p[f[1]][0] - p[f[0]][0], p[f[1]][1] - p[f[0]][1]); }, 0);
  }
  // Best arrangement: try every assignment of machines to a compact 3×2 grid of slots.
  var BEST = (function () {
    var slots = [], best = null, bestCost = Infinity;
    [140, 232].forEach(function (y) { [145, 245, 345].forEach(function (x) { slots.push([x, y]); }); });
    (function perm(order, used) {
      if (order.length === 6) {
        var p = order.map(function (k) { return slots[k]; }), c = cost(p);
        if (c < bestCost) { bestCost = c; best = p; }
        return;
      }
      for (var k = 0; k < 6; k++) if (!used[k]) { used[k] = 1; order.push(k); perm(order, used); order.pop(); used[k] = 0; }
    })([], []);
    return best;
  })();
  var BASE = cost(START), BEST_COST = cost(BEST);

  var svg = document.getElementById("hero-plan");
  var layer = document.getElementById("hero-layer");
  var flowG = document.getElementById("hero-flows");
  var machineG = document.getElementById("hero-machines");
  var travelEl = document.getElementById("hero-travel");
  var hintEl = document.getElementById("hero-hint");
  var optimiseBtn = document.getElementById("optimise");

  var pos = START.map(function (p) { return p.slice(); });
  var userMoved = false, dragging = -1, optimiseRaf = 0;

  function el(name, attrs) {
    var n = document.createElementNS(SVGNS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  var flowEls = FLOWS.map(function (f) {
    var l = el("line", { stroke: "#2b59c3", "stroke-opacity": f[2] > 1 ? 0.75 : 0.4, "stroke-width": 0.8 + f[2] * 0.5, "stroke-linecap": "round", "marker-end": "url(#arrow)" });
    flowG.appendChild(l);
    return l;
  });
  var machineEls = SIZE.map(function (s, i) {
    var g = el("g", { class: "machine", tabindex: 0, role: "button", "aria-label": LABELS[i] + ", machine " + (i + 1) + " of 6. Use arrow keys to move." });
    g.appendChild(el("rect", { class: "hit", fill: "transparent", width: s[0] + 16, height: s[1] + 16 }));
    g.appendChild(el("rect", { class: "body", rx: 8, width: s[0], height: s[1] }));
    var t = el("text", { "text-anchor": "middle", dy: "0.35em" }); t.textContent = LABELS[i]; g.appendChild(t);
    g.appendChild(el("rect", { class: "ring", rx: 11, width: s[0] + 16, height: s[1] + 16 }));
    machineG.appendChild(g);
    g.addEventListener("pointerdown", function (e) { startDrag(i, e); });
    g.addEventListener("keydown", function (e) { nudge(i, e); });
    return g;
  });

  function render() {
    machineEls.forEach(function (g, i) {
      var w = SIZE[i][0], h = SIZE[i][1], x = pos[i][0] - w / 2, y = pos[i][1] - h / 2;
      var r = g.children;
      r[0].setAttribute("x", x - 8); r[0].setAttribute("y", y - 8);
      r[1].setAttribute("x", x); r[1].setAttribute("y", y);
      r[2].setAttribute("x", pos[i][0]); r[2].setAttribute("y", pos[i][1]);
      r[3].setAttribute("x", x - 8); r[3].setAttribute("y", y - 8);
      g.classList.toggle("dragging", i === dragging);
    });
    FLOWS.forEach(function (f, n) {
      var a = pos[f[0]], b = pos[f[1]], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
      var clip = function (k) { return Math.min(SIZE[k][0] / 2 / (Math.abs(dx / d) || 1e-6), SIZE[k][1] / 2 / (Math.abs(dy / d) || 1e-6)) + 5; };
      var s = clip(f[0]), e = clip(f[1]), line = flowEls[n];
      if (d <= s + e) { line.setAttribute("visibility", "hidden"); return; }
      line.removeAttribute("visibility");
      line.setAttribute("x1", a[0] + dx / d * s); line.setAttribute("y1", a[1] + dy / d * s);
      line.setAttribute("x2", b[0] - dx / d * e); line.setAttribute("y2", b[1] - dy / d * e);
    });
    var c = cost(pos), pct = Math.round((1 - c / BASE) * 100);
    travelEl.textContent = pct > 0 ? "−" + pct + "%" : pct < 0 ? "+" + -pct + "%" : "0%";
    var atBest = c <= BEST_COST + 0.5;
    if (userMoved) hintEl.textContent = atBest ? "Optimised layout" : "Your layout";
    optimiseBtn.hidden = !userMoved || atBest || dragging >= 0;
  }

  function overlaps(i, x, y) {
    return pos.some(function (p, k) {
      return k !== i && Math.abs(p[0] - x) < (SIZE[i][0] + SIZE[k][0]) / 2 + 8 && Math.abs(p[1] - y) < (SIZE[i][1] + SIZE[k][1]) / 2 + 8;
    });
  }
  function clampTo(i, x, y) {
    var w = SIZE[i][0] / 2, h = SIZE[i][1] / 2;
    return [Math.max(BOUNDS.x0 + w, Math.min(BOUNDS.x1 - w, x)), Math.max(BOUNDS.y0 + h, Math.min(BOUNDS.y1 - h, y))];
  }
  // Move machine i toward (x, y), sliding along an edge if it would overlap another machine.
  function moveTo(i, x, y) {
    var t = clampTo(i, x, y), px = pos[i][0], py = pos[i][1];
    if (!overlaps(i, t[0], t[1])) pos[i] = t;
    else if (!overlaps(i, t[0], py)) pos[i] = [t[0], py];
    else if (!overlaps(i, px, t[1])) pos[i] = [px, t[1]];
  }
  function takeControl() {
    if (!userMoved) { userMoved = true; layer.style.opacity = 1; }
    cancelAnimationFrame(optimiseRaf);
  }
  function toSvg(e) {
    var p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  }
  function startDrag(i, e) {
    e.preventDefault();
    takeControl();
    var pt = toSvg(e), off = [pos[i][0] - pt.x, pos[i][1] - pt.y];
    dragging = i; render();
    function move(ev) { var q = toSvg(ev); moveTo(i, q.x + off[0], q.y + off[1]); render(); }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      dragging = -1; render();
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }
  function nudge(i, e) {
    var d = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[e.key];
    if (!d) return;
    e.preventDefault();
    takeControl();
    moveTo(i, pos[i][0] + d[0], pos[i][1] + d[1]);
    render();
  }
  optimiseBtn.addEventListener("click", function () {
    var from = pos.map(function (p) { return p.slice(); }), t0 = performance.now(), dur = reduceMotion ? 1 : 1100;
    cancelAnimationFrame(optimiseRaf);
    (function step(now) {
      var k = easeInOut(Math.min(1, (now - t0) / dur));
      pos = from.map(function (a, i) { return [a[0] + (BEST[i][0] - a[0]) * k, a[1] + (BEST[i][1] - a[1]) * k]; });
      render();
      if (k < 1) optimiseRaf = requestAnimationFrame(step);
    })(t0);
  });

  // Idle loop (until the visitor touches it): scattered → optimised → hold → fade and restart.
  function heroLoop(sec) {
    var s = sec % 7.4, t = 0, fade = 1;
    if (s < 1.2) t = 0;
    else if (s < 3.4) t = easeInOut((s - 1.2) / 2.2);
    else if (s < 6.6) t = 1;
    else if (s < 7.0) { t = 1; fade = 1 - (s - 6.6) / 0.4; }
    else { t = 0; fade = (s - 7.0) / 0.4; }
    pos = START.map(function (a, i) { return [a[0] + (BEST[i][0] - a[0]) * t, a[1] + (BEST[i][1] - a[1]) * t]; });
    layer.style.opacity = fade;
    render();
  }

  /* ---------- Feature animations ---------- */
  var routeStraight = document.getElementById("route-straight");
  var routePath = document.getElementById("route-path");
  var routeDot = document.getElementById("route-dot");
  var routeDist = document.getElementById("route-dist");
  var ROUTE = [[60, 50], [100, 145], [220, 145], [260, 50]];
  var SEGS = ROUTE.slice(1).map(function (p, i) { return Math.hypot(p[0] - ROUTE[i][0], p[1] - ROUTE[i][1]); });
  var ROUTE_LEN = SEGS.reduce(function (a, b) { return a + b; }, 0);

  var sheetDraw = document.querySelectorAll(".sheet-draw");
  var sheetMachines = document.getElementById("sheet-machines");
  var sheetDims = document.getElementById("sheet-dims");
  var sheetFormats = document.getElementById("sheet-formats");

  function featureLoop(c) {
    var out = c > 6.4 ? 1 - clamp01((c - 6.4) / 0.5) : 1;

    // Route: straight line appears and is struck through, then the real path draws around the wall.
    var rp = smooth((c - 1) / 1.8), d = rp * ROUTE_LEN, k = 0;
    while (k < SEGS.length - 1 && d > SEGS[k]) { d -= SEGS[k]; k++; }
    var f = SEGS[k] ? d / SEGS[k] : 0;
    routeStraight.style.opacity = clamp01(c / 0.5) * out;
    routePath.setAttribute("stroke-dashoffset", 1 - rp);
    routePath.style.opacity = out;
    routeDot.setAttribute("cx", ROUTE[k][0] + (ROUTE[k + 1][0] - ROUTE[k][0]) * f);
    routeDot.setAttribute("cy", ROUTE[k][1] + (ROUTE[k + 1][1] - ROUTE[k][1]) * f);
    routeDot.style.opacity = out;
    routeDist.textContent = (rp * ROUTE_LEN / 10 * out).toFixed(1);

    // Export: walls draw, then machines, dimension and formats fade in.
    var off = 1 - smooth((c - 0.3) / 1.5);
    if (c > 6.4) off = Math.max(off, 1 - out);
    sheetDraw.forEach(function (p) { p.setAttribute("stroke-dashoffset", off); });
    sheetMachines.style.opacity = clamp01((c - 1.8) / 0.5) * out;
    sheetDims.style.opacity = clamp01((c - 2.4) / 0.5) * out;
    sheetFormats.style.opacity = 0.35 + 0.65 * clamp01((c - 3.0) / 0.5) * out;
  }

  /* ---------- Run ---------- */
  if (reduceMotion) {
    pos = BEST.map(function (p) { return p.slice(); });
    render();
    featureLoop(5);
    return;
  }
  var start = performance.now();
  (function frame(now) {
    var sec = (now - start) / 1000;
    if (!userMoved) heroLoop(sec);
    featureLoop(sec % 7);
    requestAnimationFrame(frame);
  })(start);
})();
