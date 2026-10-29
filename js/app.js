// DIN Stack — main application: state, canvas interaction, panels, import/export.

(() => {
  const $ = (id) => document.getElementById(id);
  const SVGNS = "http://www.w3.org/2000/svg";
  // A link ending in one of these names (e.g. #mechatronics) opens a workspace of its own: its
  // diagram is saved apart from the main one, starts as that example, and "Load the example" loads it.
  const EXAMPLES = { mechatronics: "examples/mechatronics.json" };
  const workspace = (() => { const h = location.hash.slice(1).toLowerCase(); return Object.hasOwn(EXAMPLES, h) ? h : ""; })();
  const LS_KEY = "dinstack.project.v1" + (workspace ? "." + workspace : "");
  const PX_PER_MM = 96 / 25.4; // 100% zoom = real size on a 96 dpi screen

  const svg = $("canvas");
  const content = $("content");
  const overlay = $("overlay");

  let doc;
  let sel = new Set();
  let undoStack = [], redoStack = [];
  let view = { x: 0, y: 0, scale: 3 };
  let pending = null;   // terminal waiting for a second click: {item, term}
  let drag = null;
  let mouse = { x: 0, y: 0 };
  let clipboard = null;
  let drawerTab = "wires";
  let spaceDown = false;
  let editCheckpointed = false;
  let lastWire = { color: "#1f1f1f", stripe: "", gauge: "", conductor: "", profile: "" };
  let libDrag = null;   // dragging an object type from the library: {id, sx, sy, active, pos}
  let libGhost = "";    // SVG preview of that part on the sheet
  let busEdit = null;   // picking terminals for a bus bar: {id (null = new), terms: ["item|term"]}

  // ---------- helpers ----------
  const uid = (p = "i") => p + Math.random().toString(36).slice(2, 9);
  const r3 = (v) => Math.round(v * 1000) / 1000;
  // The value that every object in list has (a key, or a function of the object), or MIXED when they differ.
  const MIXED = Symbol("mixed");
  const same = (list, get) => {
    const vs = list.map(typeof get === "function" ? get : (x) => x[get] ?? "");
    return vs.every((v) => v === vs[0]) ? vs[0] : MIXED;
  };
  const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  const tplOf = (it) => doc.templates.find((t) => t.id === it.tpl);
  const itemById = (id) => doc.items.find((i) => i.id === id);
  const connById = (id) => doc.connections.find((c) => c.id === id);
  const isConn = (id) => !!connById(id);
  const busById = (id) => doc.buses.find((b) => b.id === id);
  const cableById = (id) => doc.cables.find((b) => b.id === id);
  const cableOf = (connId) => doc.cables.find((cb) => cb.wires.includes(connId));
  const exists = (id) => !!(itemById(id) || connById(id) || busById(id) || cableById(id));
  const boxOf = (it) => itemBox(it, it.kind === "part" ? tplOf(it) : null);
  // The page open: what's drawn, and where snapping, selecting and measuring look.
  const onPage = (it) => !!it && pageOf(doc, it) === doc.page;
  const pageItems = () => doc.items.filter(onPage);
  const endHere = (e) => !!e && onPage(itemById(e.item));
  const rtl = () => doc.settings.direction === "rtl";
  // An icon from the sprite in index.html.
  const ic = (name, cls = "") => `<svg class="ic${cls ? " " + cls : ""}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const plural = (n, word, many = word + "s") => `${n} ${n === 1 ? word : many}`;

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  function setHint(text) {
    const h = $("hint");
    if (text) h.textContent = text;
    h.classList.toggle("show", !!text);
  }

  function download(name, data, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function slug(s) {
    return (String(s || "diagram").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "diagram");
  }

  function incrementTag(tag, by = 1) {
    const m = /^(.*?)(\d+)$/.exec(tag || "");
    if (!m) return tag;
    const num = String(parseInt(m[2], 10) + by).padStart(m[2].length, "0");
    return m[1] + num;
  }

  function autoTag(prefix) {
    if (!prefix) return "";
    const re = new RegExp("^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\d+)$");
    let max = 0;
    for (const it of doc.items) {
      const m = it.kind === "part" && re.exec(it.tag || "");
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return prefix + (max + 1);
  }

  function nextWire() {
    let max = 0;
    for (const c of doc.connections) {
      const m = /^W(\d+)$/i.exec(c.wire || "");
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return "W" + (max + 1);
  }

  function termName(end) {
    const it = itemById(end.item);
    const t = it && tplOf(it)?.terminals.find((x) => x.id === end.term);
    return t ? t.name : "";
  }

  function refOf(end) {
    const it = itemById(end.item);
    if (!it && cableById(end.item)) return (cableById(end.item).label || "Cable") + doc.settings.termSep + end.term; // one-ended cable core
    return endRef(it, it && tplOf(it), end.term, doc.settings.termSep);
  }

  // What's attached to a terminal: its wires, the bus bars through it and a cable plugged into it.
  function attachedTo(t) {
    const at = (e) => !!e && e.item === t.item && e.term === t.term;
    return [...doc.connections.filter((c) => at(c.a) || at(c.b)).map((c) => c.id),
      ...doc.buses.filter((b) => b.terms.some(at)).map((b) => b.id),
      ...doc.cables.filter((cb) => cablePlugs(cb).some(at)).map((cb) => cb.id)];
  }

  function setTool(t) {
    tool = t;
    // Measure is for a quick check, so the app opens with the last Select or Wire tool instead.
    if (t !== "measure") { ui.tool = t; saveUi(); }
    for (const b of document.querySelectorAll("[data-tool]")) b.classList.toggle("on", b.dataset.tool === t);
    svg.classList.toggle("tool-select", t === "select");
    svg.classList.toggle("tool-measure", t === "measure");
    const redraw = !!(pending || measure || measureHover);
    measure = measureHover = pending = null;
    if (redraw) renderCanvas();
    setHint(t === "measure" ? MEASURE_TIP : "");
  }

  // ---------- measuring ----------
  // The measure tool's line, {a, b} in mm: kept on screen after the drag until Esc, another tool or the
  // next measurement. measureHover is where a measurement would start, shown before the drag.
  let measure = null, measureHover = null;
  const MEASURE_TIP = "Drag to measure · Shift keeps it level or upright · Alt turns snapping off";
  // Where a measurement's end lands: the nearest terminal, or corner or edge middle of a part or rail,
  // within a few pixels; failing those, the nearest point on one of their edges. Alt measures from exactly
  // where the pointer is.
  function measureSnap(w, free) {
    const exact = { x: r3(w.x), y: r3(w.y) };
    if (free) return exact;
    const thr = 8 / view.scale;
    let best = null, bd = thr;
    const near = (x, y) => { const d = Math.hypot(x - w.x, y - w.y); if (d < bd) { bd = d; best = { x, y }; } };
    const boxes = pageItems().filter((it) => it.kind !== "text").map(boxOf);
    for (const b of boxes) for (const fx of [0, 0.5, 1]) for (const fy of [0, 0.5, 1]) if (fx !== 0.5 || fy !== 0.5) near(b.x + b.w * fx, b.y + b.h * fy);
    for (const it of pageItems()) {
      const tpl = it.kind === "part" && tplOf(it);
      if (tpl) for (const t of tpl.terminals) { const p = termWorld(it, tpl, t); near(p.x, p.y); }
    }
    if (best) return { x: r3(best.x), y: r3(best.y) };
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    for (const b of boxes) {
      const cx = clamp(w.x, b.x, b.x + b.w), cy = clamp(w.y, b.y, b.y + b.h);
      for (const x of [b.x, b.x + b.w]) near(x, cy);
      for (const y of [b.y, b.y + b.h]) near(cx, y);
    }
    return best ? { x: r3(best.x), y: r3(best.y) } : exact;
  }
  // The end of a measurement from a, snapped, and with Shift held kept level or upright.
  function measureEnd(a, w, e) {
    const b = measureSnap(w, e.altKey);
    if (!e.shiftKey) return b;
    return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
  }
  const mmText = (v) => `${Math.round(v * 100) / 100} mm`;
  const inText = (v) => `${(v / 25.4).toFixed(2)} in`;
  function measureText(m) {
    const dx = Math.abs(m.b.x - m.a.x), dy = Math.abs(m.b.y - m.a.y);
    const d = Math.hypot(dx, dy);
    return { main: `${mmText(d)} (${inText(d)})`, parts: dx > 0.005 && dy > 0.005 ? `↔ ${mmText(dx)} · ↕ ${mmText(dy)}` : "" };
  }
  // The measurement in the overlay, at a fixed size on screen: the line with its ends marked, dotted
  // across-and-down legs when it's at an angle, and the distance beside its middle.
  function measureOverlay(px) {
    const C = "#c026d3";
    const dot = (p) => `<circle cx="${p.x}" cy="${p.y}" r="${4 * px}" fill="#fff" stroke="${C}" stroke-width="${2 * px}"/>`;
    if (!measure) return measureHover ? `<g pointer-events="none">${dot(measureHover)}</g>` : "";
    const { a, b } = measure;
    let s = "";
    if (a.x !== b.x && a.y !== b.y) s += `<path d="M${a.x} ${a.y}H${b.x}V${b.y}" fill="none" stroke="${C}" stroke-opacity="0.6" stroke-width="${px}" stroke-dasharray="${2 * px} ${3 * px}"/>`;
    s += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#fff" stroke-width="${4 * px}" stroke-linecap="round"/>`
      + `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${C}" stroke-width="${2 * px}" stroke-linecap="round"/>` + dot(a) + dot(b);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > 0) {
      // Beside the middle of the line, on its upper side.
      let nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
      if (ny > 0 || (ny === 0 && nx > 0)) { nx = -nx; ny = -ny; }
      const t = measureText(measure), gap = (t.parts ? 26 : 16) * px;
      const x = (a.x + b.x) / 2 + nx * gap, y = (a.y + b.y) / 2 + ny * gap;
      const text = (ty, str, size, weight) => `<text x="${x}" y="${ty}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" text-anchor="middle" dominant-baseline="central" fill="${C}" stroke="#fff" stroke-width="${4 * px}" stroke-linejoin="round" paint-order="stroke">${esc(str)}</text>`;
      s += t.parts ? text(y - 8 * px, t.main, 13 * px, 600) + text(y + 8 * px, t.parts, 11 * px, 400) : text(y, t.main, 13 * px, 600);
    }
    return `<g pointer-events="none">${s}</g>`;
  }

  function termPoint(end) {
    const it = itemById(end.item);
    const tpl = it && tplOf(it);
    const t = tpl && tpl.terminals.find((x) => x.id === end.term);
    return t ? termWorld(it, tpl, t) : null;
  }

  // ---------- document & history ----------
  function normalize(d) {
    d.schema = 1;
    d.meta = Object.assign({ title: "Untitled diagram", author: "", revision: "", date: "", notes: "" }, d.meta || {});
    // The "wireNames" tick box (1.4.17) became labelName.
    const s0 = d.settings || {};
    if (!("labelName" in s0) && "wireNames" in s0) s0.labelName = s0.wireNames === false ? "none" : "wire";
    delete s0.wireNames;
    // labelName "wire" and "none" (1.4.25 and before) became "dest", with the wire's number a separate labelWire.
    if (s0.labelName === "wire" || s0.labelName === "none") { s0.labelWire = s0.labelName === "wire"; s0.labelName = "dest"; }
    // Cable names in labels became optional in 1.4.31; diagrams from before keep showing them.
    if (!("labelCable" in s0)) s0.labelCable = true;
    // American became the default wire standard in 1.8.2; diagrams saved without one are metric.
    if (!("wireStd" in s0)) s0.wireStd = "metric";
    d.settings = Object.assign({}, DEFAULT_SETTINGS, s0);
    // Print settings (1.10.19), with paper and margins to suit the wire standard.
    const pd = printDefaults(d.settings.wireStd);
    d.settings.print = Object.assign(pd, s0.print && typeof s0.print === "object" ? s0.print : {});
    if (!PAPERS[d.settings.print.paper]) d.settings.print.paper = pd.paper;
    // Older diagrams hid the destination labels with a separate tick box; that's the "None" wires mode now.
    if (d.settings.showDest === false) { if (d.settings.lines === "off") d.settings.lines = "none"; d.settings.showDest = true; }
    // "None" (no wires drawn) became stubs without labels or wire names.
    if (d.settings.lines === "none") Object.assign(d.settings, { lines: "off", wireLabels: false, labelName: "dest", labelWire: false });
    d.templates = Array.isArray(d.templates) ? d.templates : [];
    d.items = Array.isArray(d.items) ? d.items : [];
    // Pages (1.10.16): each item is on one page, and doc.page is the page open. Diagrams from before
    // have everything on one page.
    d.pages = (Array.isArray(d.pages) ? d.pages : []).filter((p) => p && p.id);
    if (!d.pages.length) d.pages = [{ id: "p1", name: "Page 1" }];
    for (const p of d.pages) p.name = String(p.name || "Page");
    for (const it of d.items) it.page = pageOf(d, it);
    if (!d.pages.some((p) => p.id === d.page)) d.page = d.pages[0].id;
    d.connections = Array.isArray(d.connections) ? d.connections : [];
    // A wire drawn as a line on its own (draw "line", before 1.10.23) is now a straight or curved one, as it looked.
    for (const c of d.connections) if (c && c.draw === "line") c.draw = d.settings.lines === "curved" ? "curved" : "straight";
    d.buses = Array.isArray(d.buses) ? d.buses : [];
    d.cables = Array.isArray(d.cables) ? d.cables : [];
    // The starter profiles are American; older diagrams without profiles get them in their own standard.
    if (!Array.isArray(d.wireProfiles)) {
      d.wireProfiles = JSON.parse(JSON.stringify(DEFAULT_PROFILES));
      for (const p of d.wireProfiles) convertWire(p, profileRole(p), "us", d.settings.wireStd);
    }
    // How each named circuit's wires are labelled, by circuit name: "name", "dest", or unset to follow the drawing.
    d.circuitLabels = d.circuitLabels && typeof d.circuitLabels === "object" && !Array.isArray(d.circuitLabels) ? d.circuitLabels : {};
    if (!Array.isArray(d.cableProfiles)) {
      d.cableProfiles = JSON.parse(JSON.stringify(DEFAULT_CABLE_PROFILES));
      for (const p of d.cableProfiles) for (const k of p.cores) k.gauge = convertGauge(k.gauge, d.settings.wireStd);
    }
    // Favourite profiles (fav) are the ones drop-downs and right-click menus offer; before 1.10.24 they all were.
    for (const list of [d.wireProfiles, d.cableProfiles]) if (!list.some((p) => p && "fav" in p)) for (const p of list) if (p) p.fav = true;
    // Version of each ready-made library last loaded or refreshed, by library name.
    d.libVersions = d.libVersions && typeof d.libVersions === "object" && !Array.isArray(d.libVersions) ? d.libVersions : {};
    // Only diagrams that use the built-in library get new built-in types; New keeps a custom library as it is.
    if (d.templates.some((t) => DEFAULT_TEMPLATES.some((x) => x.id === t.id))) addTemplatePacks(d);
    for (const t of d.templates) {
      t.terminals = t.terminals || [];
      t.category = t.category || "Custom";
      upgradeTemplate(t); // diagrams saved before internal links and bus bar slots existed
    }
    return d;
  }

  function cleanConnections() {
    const items = itemMap(doc), tpls = tplMap(doc);
    const ok = new Set(validConnections(doc, items, tpls).map((c) => c.id));
    doc.connections = doc.connections.filter((c) => ok.has(c.id));
    doc.buses = validBuses(doc, items, tpls);
    doc.cables = validCables(doc, doc.connections, items, tpls);
  }

  function checkpoint() {
    undoStack.push(JSON.stringify(doc));
    if (undoStack.length > 300) undoStack.shift();
    redoStack.length = 0;
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(JSON.stringify(doc));
    doc = JSON.parse(undoStack.pop());
    afterLoad();
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(JSON.stringify(doc));
    doc = JSON.parse(redoStack.pop());
    afterLoad();
  }

  function afterLoad() {
    pending = null;
    busEdit = null;
    sel = new Set([...sel].filter(exists));
    renderLibrary();
    refresh();
  }

  let saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(LS_KEY, JSON.stringify(doc)); } catch (e) { /* storage unavailable */ }
    }, 300);
  }

  function loadInitial() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) { /* fall through to the example */ }
    return normalize(exampleProject());
  }

  // ---------- view ----------
  function applyView() {
    const r = svg.getBoundingClientRect();
    const w = r.width / view.scale, h = r.height / view.scale;
    svg.setAttribute("viewBox", `${view.x} ${view.y} ${w} ${h}`);
    const g = $("gridRect");
    g.setAttribute("x", view.x); g.setAttribute("y", view.y);
    g.setAttribute("width", w); g.setAttribute("height", h);
    $("zoomLabel").textContent = Math.round((view.scale / PX_PER_MM) * 100) + "%";
  }

  function zoomAt(factor, sx, sy) {
    const r = svg.getBoundingClientRect();
    if (sx === undefined) { sx = r.width / 2; sy = r.height / 2; }
    const wx = view.x + sx / view.scale, wy = view.y + sy / view.scale;
    view.scale = Math.min(60, Math.max(0.3, view.scale * factor));
    view.x = wx - sx / view.scale;
    view.y = wy - sy / view.scale;
    applyView();
    renderOverlay();
  }

  function fit() {
    const r = svg.getBoundingClientRect();
    let bb;
    try { bb = content.getBBox(); } catch (e) { bb = null; }
    if (!bb || bb.width === 0 || bb.height === 0) bb = { x: 0, y: 0, width: 300, height: 150 };
    const m = 12;
    view.scale = Math.min(60, Math.max(0.3, Math.min(r.width / (bb.width + m * 2), r.height / (bb.height + m * 2))));
    view.x = bb.x + bb.width / 2 - r.width / view.scale / 2;
    view.y = bb.y + bb.height / 2 - r.height / view.scale / 2;
    applyView();
    renderOverlay();
  }

  // A plain { x, y }: a DOMPoint's x and y wouldn't survive being copied with { ...p }.
  function toWorld(e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const w = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: w.x, y: w.y };
  }

  function viewCenter() {
    const r = svg.getBoundingClientRect();
    return { x: view.x + r.width / view.scale / 2, y: view.y + r.height / view.scale / 2 };
  }

  // Scroll the drawing so point p is in the middle, at the same zoom.
  function centerOn(p) {
    if (!p) return;
    const r = svg.getBoundingClientRect();
    view.x = p.x - r.width / view.scale / 2;
    view.y = p.y - r.height / view.scale / 2;
    applyView();
    renderOverlay();
  }

  // Of keys, the one whose point (at(key), or null) is nearest the mouse; undefined if none has a point.
  function nearest(keys, at) {
    let best, d = Infinity;
    for (const k of keys) {
      const p = at(k);
      const dk = p ? (p.x - mouse.x) ** 2 + (p.y - mouse.y) ** 2 : Infinity;
      if (dk < d) { d = dk; best = k; }
    }
    return best;
  }

  // ---------- show only some wires ----------
  // A view filter, not part of the diagram: the wires hidden by "Show only these wires". It holds the
  // other wires at the time, so wires drawn afterwards still show. Not saved, and undo leaves it alone.
  let hiddenWires = null;
  // The wires in the selection, including those of selected cables.
  function selectedWireIds() {
    return [...new Set([...sel].flatMap((id) => (isConn(id) ? [id] : cableById(id)?.wires || [])))];
  }
  function showOnlyWires(ids) {
    const keep = new Set(ids);
    hiddenWires = new Set(doc.connections.map((c) => c.id).filter((id) => !keep.has(id)));
    if (!hiddenWires.size) hiddenWires = null;
    refresh();
  }
  function showAllWires() {
    hiddenWires = null;
    refresh();
  }

  // ---------- selection filter ----------
  // Which kinds of thing clicks and selection boxes may pick: null for anything, or a Set of "part",
  // "wire", "cable", "bus", "rail" and "text". A view setting like zoom: not saved, and undo leaves it alone.
  const SEL_KINDS = { part: "parts", wire: "wires", cable: "cables", bus: "bus bars", rail: "DIN rails", text: "text notes" };
  let selFilter = null;
  // The tool: "wire" (clicking or dragging from a terminal adds a wire), "select" (clicking a terminal
  // selects what's attached to it) or "measure" (dragging measures the drawing). Select and Wire are
  // remembered per browser.
  let tool = "wire";
  function setSelFilter(kinds) {
    selFilter = kinds && kinds.size && kinds.size < Object.keys(SEL_KINDS).length ? kinds : null;
    renderCanvas();
    updateToolbar();
  }
  const allows = (kind) => !selFilter || selFilter.has(kind);
  // Everything the filter lets through, for Ctrl+A.
  function selectableAll() {
    if (!selFilter) return pageItems().map((i) => i.id);
    return [
      ...pageItems().filter((i) => allows(i.kind)).map((i) => i.id),
      ...(allows("wire") ? doc.connections.filter((c) => (!hiddenWires || !hiddenWires.has(c.id)) && (endHere(c.a) || endHere(c.b))).map((c) => c.id) : []),
      ...(allows("bus") ? doc.buses.filter((b) => b.terms.some(endHere)).map((b) => b.id) : []),
      ...(allows("cable") ? doc.cables.filter((cb) => pagesOf(cb.id).includes(doc.page)).map((cb) => cb.id) : []),
    ];
  }

  // ---------- pages ----------
  // Each page has its own view, kept while the app is open: switching back finds it as it was left.
  const pageViews = new Map();
  let shownPage = null;
  // After the open page changes (switched, undone, or a diagram loaded), bring back that page's view.
  // Returns true if the page has none yet, so it should be fitted once drawn.
  function syncPage() {
    if (shownPage === doc.page) return false;
    if (shownPage) pageViews.set(shownPage, { ...view });
    shownPage = doc.page;
    measure = measureHover = null;
    const v = pageViews.get(doc.page);
    if (!v) return true;
    view = { ...v };
    applyView();
    return false;
  }

  // Open a page. keep: what stays selected (by default nothing, as what was selected isn't on it).
  // Wiring and picking terminals carry on, so a wire or cable can go from one page to another.
  function setPage(id, keep) {
    if (id === doc.page || !doc.pages.some((p) => p.id === id)) return;
    doc.page = id;
    sel = new Set(keep || []);
    refresh();
  }

  // The pages a part, rail, note, wire, bus bar or cable is on: a wire, bus bar or cable can be on several.
  function pagesOf(id) {
    const it = itemById(id);
    if (it) return [pageOf(doc, it)];
    const c = connById(id), b = busById(id), cb = cableById(id);
    const ends = c ? [c.a, c.b] : b ? b.terms : cb ? [...cablePlugs(cb), ...cb.wires.map(connById).filter(Boolean).flatMap((w) => [w.a, w.b])] : [];
    return [...new Set(ends.map((e) => e && itemById(e.item)).filter(Boolean).map((x) => pageOf(doc, x)))];
  }
  const pagesText = (id) => pagesOf(id).map((p) => pageName(doc, p)).join(", ");
  // " (Door)" after a reference to something on a page other than the one open.
  const pageNote = (itemId) => { const it = itemById(itemId); return it && !onPage(it) ? ` (${pageName(doc, pageOf(doc, it))})` : ""; };

  // Show point p, on item itemId's page.
  function goTo(itemId, p) {
    const it = itemById(itemId);
    if (it && !onPage(it)) setPage(pageOf(doc, it), sel);
    centerOn(p);
  }

  function newPageName() {
    const names = new Set(doc.pages.map((p) => p.name.toLowerCase()));
    let i = doc.pages.length + 1;
    while (names.has("page " + i)) i++;
    return "Page " + i;
  }

  // Add a page after the open one; returns its id. Doesn't open it or checkpoint.
  function insertPage(name) {
    const pg = { id: uid("pg"), name: name || newPageName() };
    doc.pages.splice(doc.pages.findIndex((p) => p.id === doc.page) + 1, 0, pg);
    return pg.id;
  }

  function addPage() {
    checkpoint();
    const id = insertPage();
    setPage(id);
    renamePage(id);
  }

  function duplicatePage(id) {
    const pg = doc.pages.find((p) => p.id === id);
    if (!pg) return;
    checkpoint();
    const src = selectionPayload(new Set(doc.items.filter((it) => pageOf(doc, it) === id).map((it) => it.id)));
    if (id === doc.page) pageViews.set(id, { ...view });
    const copy = insertPage(pg.name + " (copy)");
    doc.page = copy;
    if (pageViews.has(id)) pageViews.set(copy, { ...pageViews.get(id) });
    cloneItems(src, 0, 0);
    sel.clear();
    refresh();
  }

  function deletePage(id) {
    const pg = doc.pages.find((p) => p.id === id);
    if (!pg || doc.pages.length < 2) return;
    const n = doc.items.filter((it) => pageOf(doc, it) === id).length;
    if (n && !confirm(`Delete page “${pg.name}” and the ${plural(n, "item")} on it? Wires and cables to them go too. (You can undo this.)`)) return;
    checkpoint();
    const i = doc.pages.indexOf(pg);
    doc.items = doc.items.filter((it) => pageOf(doc, it) !== id);
    doc.pages.splice(i, 1);
    pageViews.delete(id);
    if (doc.page === id) doc.page = doc.pages[Math.min(i, doc.pages.length - 1)].id;
    cleanConnections();
    sel.clear();
    refresh();
  }

  function movePage(id, by) {
    const i = doc.pages.findIndex((p) => p.id === id), j = i + by;
    if (i < 0 || j < 0 || j >= doc.pages.length) return;
    checkpoint();
    [doc.pages[i], doc.pages[j]] = [doc.pages[j], doc.pages[i]];
    refresh();
  }

  // Move the selected parts, rails and notes (and the parts on selected rails) to another page, or with
  // id null to a new one, at the same place on it. The page opens with them still selected.
  function moveToPage(id) {
    const moving = new Set([...sel].filter((s) => itemById(s)));
    for (const s of [...moving]) {
      const it = itemById(s);
      if (it.kind === "rail") for (const m of mountedOn(it)) moving.add(m.id);
    }
    if (!moving.size) return;
    checkpoint();
    if (!id) id = insertPage();
    for (const s of moving) itemById(s).page = id;
    pageViews.set(id, { ...view });
    setPage(id, moving);
    toast(`Moved ${plural(moving.size, "item")} to ${pageName(doc, id)}`);
  }

  function moveToPageEntries() {
    return [{ label: "Move to page", sub: [...doc.pages.filter((p) => p.id !== doc.page).map((p) => ({ label: p.name, run: () => moveToPage(p.id) })),
      "-", { label: "New page", run: () => moveToPage(null) }] }];
  }

  function pageMenu(id) {
    const i = doc.pages.findIndex((p) => p.id === id);
    return [
      { heading: doc.pages[i].name },
      { label: "Rename", run: () => renamePage(id) },
      { label: "Duplicate page", run: () => duplicatePage(id) },
      { label: "Move left", disabled: i === 0, run: () => movePage(id, -1) },
      { label: "Move right", disabled: i === doc.pages.length - 1, run: () => movePage(id, 1) },
      "-",
      { label: "Add a page", run: addPage },
      "-",
      { label: "Delete page", danger: true, disabled: doc.pages.length < 2, run: () => deletePage(id) },
    ];
  }

  // The page tabs at the bottom left of the drawing. While one is being renamed they're left alone.
  let pageRenaming = false, pageTabsKey = "";
  function renderPages() {
    if (pageRenaming) return;
    const el = $("pageTabs");
    const key = JSON.stringify(doc.pages);
    if (key !== pageTabsKey) {
      pageTabsKey = key;
      el.innerHTML = doc.pages.map((p) => `<button role="tab" class="page-tab" data-page="${esc(p.id)}" title="${esc(p.name)}: double-click to rename, right-click for more">${esc(p.name)}</button>`).join("")
        + `<button class="icon-btn" data-cmd="addPage" title="Add a page">${ic("plus")}</button>`;
    }
    for (const b of el.querySelectorAll("[data-page]")) {
      const on = b.dataset.page === doc.page;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", String(on));
      if (!on) continue;
      // Keep the open page's tab in sight when there are more tabs than room.
      const l = b.offsetLeft, r = l + b.offsetWidth;
      if (l < el.scrollLeft) el.scrollLeft = l;
      else if (r > el.scrollLeft + el.clientWidth) el.scrollLeft = r - el.clientWidth;
    }
  }

  // Rename a page in place, in its tab: Enter or clicking away keeps the new name, Esc doesn't.
  function renamePage(id) {
    const pg = doc.pages.find((p) => p.id === id);
    const tab = $("pageTabs").querySelector(`[data-page="${CSS.escape(id)}"]`);
    if (!pg || !tab) return;
    const input = document.createElement("input");
    input.className = "page-name";
    input.value = pg.name;
    input.setAttribute("aria-label", "Page name");
    const fitWidth = () => { input.size = Math.max(6, input.value.length + 1); };
    fitWidth();
    tab.replaceWith(input);
    pageRenaming = true;
    input.focus();
    input.select();
    let done = false;
    const finish = (keep) => {
      if (done) return;
      done = true;
      pageRenaming = false;
      pageTabsKey = "";
      const v = input.value.trim();
      if (keep && v && v !== pg.name) { checkpoint(); pg.name = v; }
      refresh();
    };
    input.addEventListener("input", fitWidth);
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") finish(true);
      else if (e.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(true));
  }

  $("pageTabs").addEventListener("click", (e) => {
    const t = e.target.closest("[data-page]");
    if (t) setPage(t.dataset.page);
  });
  $("pageTabs").addEventListener("dblclick", (e) => {
    const t = e.target.closest("[data-page]");
    if (t) renamePage(t.dataset.page);
  });
  $("pageTabs").addEventListener("contextmenu", (e) => {
    const t = e.target.closest("[data-page]");
    e.preventDefault();
    showCtx(e.clientX, e.clientY, t ? pageMenu(t.dataset.page) : [{ label: "Add a page", run: addPage }]);
  });

  // ---------- rendering ----------
  let gaugeListStd = null;
  function refresh() {
    if (gaugeListStd !== doc.settings.wireStd) {
      gaugeListStd = doc.settings.wireStd;
      $("gaugeList").innerHTML = wireGauges(gaugeListStd).map((g) => `<option value="${esc(g)}">`).join("");
    }
    $("netList").innerHTML = allNetNames().map((v) => `<option value="${esc(v)}">`).join("");
    const unseen = syncPage();
    renderPages();
    renderCanvas();
    if (unseen) fit();
    renderProps();
    renderDrawer();
    updateToolbar();
    scheduleSave();
  }

  function renderCanvas() {
    content.innerHTML = renderDiagram(doc, { interactive: true, sel, pending, busEdit, hideWires: hiddenWires, page: doc.page });
    svg.classList.toggle("wiring", !!pending || !!busEdit);
    svg.classList.toggle("filtering", !!selFilter && !busEdit);
    renderOverlay();
    renderModeBar();
  }

  // The bar across the top of the drawing while picking terminals for a bus bar or cable.
  function renderModeBar() {
    const m = $("modeBar");
    if (!busEdit) { m.hidden = true; return; }
    const n = busEdit.terms.length, cable = busEdit.kind === "cable";
    const name = cableById(busEdit.id)?.label || "the cable";
    const rl = busEdit.reland && connById(busEdit.reland.id);
    const what = rl ? `Moving ${rl.wire || "the wire"}'s end at ${refOf(rl[busEdit.reland.end])}`
      : busEdit.move ? `Moving end ${busEdit.move} of ${name}`
      : busEdit.land ? `Other end of ${name}`
      : busEdit.connect ? `Connecting core ${coreNumbers(cableById(busEdit.id) || { wires: [] }).get(busEdit.connect) || ""} of ${name}`
      : busEdit.plug ? (busEdit.add ? `Adding a connector at end ${busEdit.end} of ${name}` : `Plugging in end ${busEdit.end} of ${name}`)
      : busEdit.fan ? (busEdit.adding ? `Adding cores to ${name}` : `Fanning out end ${busEdit.end} of ${name}`)
      : cable ? (busEdit.id ? `Adding to ${name}` : "New cable")
      : busEdit.id ? `Editing bus bar ${busById(busEdit.id)?.label || ""}` : "New bus bar";
    const tip = rl ? "Click the terminal it goes to instead"
      : busEdit.land ? landingTip()
      : busEdit.connect ? `Click the terminal ${connById(busEdit.connect)?.wire || "it"} goes to at the end it isn't connected at`
      : busEdit.plug ? (busEdit.add ? "Click the cable connector this end plugs into as well" : "Click the cable connector it plugs into")
      : n && cable && !busEdit.id ? `${n} picked. The first connector is the far end; any more go at this end, with the cores`
      : n ? `${n} picked`
      : busEdit.fan ? "Click the terminals its cores land on, in order, or drag along a row"
      : cable ? "Click the terminals its cores go to, in order, and the cable connectors it plugs into: the first connector is the far end, any more go at this end" : "Click terminals or bus bar slots, or drag along a row";
    // While fanning out a cable whose profile lists its cores, the core the next terminal gets.
    const pc = pickCores();
    const nextCore = pc ? `<label class="mode-core">Next core <select data-next-core title="The core the next terminal you click gets">${coreOptions(pc, busEdit.next, (n) => !pc.free(n))}</select></label>
      <button class="small" data-act="coreSkip" title="Leave this core spare and go on to the next one">Skip</button>`
      : busEdit.land && landingPlan().some((k) => k.to === undefined) ? (busEdit.move ? '<button class="small" data-act="landSkip" title="Leave this core where it is, and go on to the next one">Keep</button>'
        : '<button class="small" data-act="landSkip" title="Leave this core not connected at this end, and go on to the next one">Skip</button>') : "";
    m.innerHTML = `<b>${esc(what)}</b><span class="muted">${esc(pc && !n ? "Click a terminal for each core you use" : tip)}</span>${nextCore}
      ${!cable && n > 2 ? `<button class="small" data-act="busAlt0" title="Keep the 1st, 3rd, 5th… along the row">Keep 1st, 3rd…</button><button class="small" data-act="busAlt1" title="Keep the 2nd, 4th, 6th… along the row">Keep 2nd, 4th…</button>` : ""}
      ${busEdit.plug || busEdit.connect || busEdit.reland ? "" : `<button class="small primary" data-act="busDone"${busReady() ? "" : " disabled"} title="Enter">${ic("check", "sm")} Done</button>`}
      <button class="small" data-act="busCancel" title="Esc">Cancel</button>`;
    m.hidden = false;
  }

  // The ends of each selected wire and cable, drawn at a fixed size on screen so they stand out at any zoom:
  // a wire's two terminals, and the connectors a cable plugs into or the terminals its cores land on. A wire
  // drawn as stubs, or a cable drawn broken, also gets a dashed guide from one end to the other.
  function selectedEnds(px) {
    const wires = doc.connections.filter((c) => sel.has(c.id));
    const cables = doc.cables.filter((cb) => sel.has(cb.id));
    if (!wires.length && !cables.length) return "";
    let guides = "", rings = "";
    const seen = new Set();
    const guide = (a, b) => {
      guides += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#3b82f6" stroke-opacity="0.7" stroke-width="${1.5 * px}" stroke-dasharray="${6 * px} ${4 * px}"/>`;
    };
    const ring = (e) => {
      const k = e.item + "|" + e.term, p = endHere(e) && termPoint(e);
      if (!p || seen.has(k)) return;
      seen.add(k);
      const r = Math.max(termRadius(tplOf(itemById(e.item))) + 1, 7 * px);
      rings += `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="#3b82f6" fill-opacity="0.15" stroke="#fff" stroke-width="${5 * px}"/>`
        + `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="none" stroke="#3b82f6" stroke-width="${2.5 * px}"/>`;
    };
    for (const c of wires) {
      const a = endHere(c.a) && termPoint(c.a), b = endHere(c.b) && termPoint(c.b);
      const line = !cableOf(c.id) && c.draw ? c.draw !== "break" : doc.settings.lines !== "off";
      if (a && b && !line && !cableOf(c.id)) guide(a, b);
      ring(c.a);
      ring(c.b);
    }
    for (const cb of cables) {
      const ends = cableEndInfo(cb).map((e) => [...(e.kind === "plug" ? [e.port] : e.kind === "fan" ? e.terms : []), ...e.extra]);
      ends.flat().forEach(ring);
      // The middle of each end, for the guide between them.
      const mid = ends.map((ts) => {
        const ps = ts.filter(endHere).map(termPoint).filter(Boolean);
        return ps.length ? { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length } : null;
      });
      if (mid[0] && mid[1] && (cb.draw || doc.settings.cables) === "break") guide(mid[0], mid[1]);
    }
    return `<g pointer-events="none">${guides}${rings}</g>`;
  }

  // While fanning out a cable's cores, the core picked for each terminal, by it on the drawing.
  function pickedCoreBadges(px) {
    if (!busEdit || !busEdit.coreOf) return "";
    let s = "";
    for (const [k, n] of Object.entries(busEdit.coreOf)) {
      const e = termKeyParts(k), p = endHere(e) && termPoint(e);
      if (!p) continue;
      const x = p.x + 10 * px, y = p.y - 10 * px;
      s += `<circle cx="${x}" cy="${y}" r="${8 * px}" fill="#3b82f6" stroke="#fff" stroke-width="${1.5 * px}"/>`
        + `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${10 * px}" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="#fff">${n}</text>`;
    }
    return `<g pointer-events="none">${s}</g>`;
  }

  function renderOverlay() {
    let s = "";
    const px = 1 / view.scale;
    const from = drag && drag.type === "wire" ? drag.from : pending;
    if (from && (pending || drag.moved)) {
      const p = endHere(from) && termPoint(from);
      if (p) s += `<line x1="${p.x}" y1="${p.y}" x2="${mouse.x}" y2="${mouse.y}" stroke="#f59e0b" stroke-width="${2 * px}" stroke-dasharray="${6 * px} ${4 * px}" pointer-events="none"/>`;
    }
    s += selectedEnds(px);
    s += measureOverlay(px);
    s += pickedCoreBadges(px);
    if (drag && drag.type === "marquee") {
      const x = Math.min(drag.start.x, drag.cur.x), y = Math.min(drag.start.y, drag.cur.y);
      s += `<rect x="${x}" y="${y}" width="${Math.abs(drag.cur.x - drag.start.x)}" height="${Math.abs(drag.cur.y - drag.start.y)}" fill="#3b82f6" fill-opacity="0.08" stroke="#3b82f6" stroke-width="${px}" pointer-events="none"/>`;
    }
    overlay.innerHTML = s + libGhost;
  }

  function updateToolbar() {
    $("btnUndo").disabled = !undoStack.length;
    $("btnRedo").disabled = !redoStack.length;
    const look = [];
    for (const menu of ["linesMenu", "cablesMenu"]) {
      const look = [];
      for (const b of $(menu).querySelectorAll("[data-lines], [data-wopt], [data-lname], [data-cables]")) {
        const on = b.dataset.lines ? b.dataset.lines === doc.settings.lines
          : b.dataset.cables ? b.dataset.cables === doc.settings.cables
          : b.dataset.lname ? b.dataset.lname === doc.settings.labelName : doc.settings[b.dataset.wopt] !== false;
        b.classList.toggle("on", on);
        b.setAttribute("aria-checked", String(on));
        if (on) look.push(b.textContent.trim().toLowerCase());
      }
      const what = menu === "linesMenu" ? ["btnLines", "Wires"] : ["btnCables", "Cables"];
      $(what[0]).title = `${what[1]}: ${look.join(", ")}. Click to change how they're drawn.`;
    }
    const hidden = hiddenWires ? doc.connections.filter((c) => hiddenWires.has(c.id)).length : 0;
    if (!hidden) hiddenWires = null; // the hidden wires were all deleted
    $("btnShowAll").hidden = !hidden;
    if (hidden) $("btnShowAll").innerHTML = `Showing ${doc.connections.length - hidden} of ${plural(doc.connections.length, "wire")} · <b>Show all</b>`;
    for (const b of document.querySelectorAll("#selFilterMenu [data-selkind]")) {
      const on = b.dataset.selkind ? !!selFilter && selFilter.has(b.dataset.selkind) : !selFilter;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", String(on));
    }
    const names = selFilter ? [...selFilter].map((k) => SEL_KINDS[k]) : [];
    $("btnSelFilter").classList.toggle("filter-on", !!selFilter);
    $("selFilterLabel").hidden = !selFilter;
    $("selFilterLabel").textContent = names.length === 1 ? "Only " + names[0] : plural(names.length, "kind");
    $("btnSelFilter").title = selFilter
      ? `Selecting only ${names.join(", ")}. Press Space or Esc to select anything again.`
      : "Selection filter: pick only certain kinds of things";
    if (document.activeElement !== $("titleInput")) $("titleInput").value = doc.meta.title;
    document.title = (doc.meta.title ? doc.meta.title + " · " : "") + "DIN Stack";
  }

  // ---------- library ----------
  // Which library categories and inspector sections are folded, whether the left panel is hidden, and
  // the lists drawer's tab and height: a per-browser convenience, not part of the diagram.
  const UI_KEY = "dinstack.ui.v1";
  // Library categories start folded; openCats lists the ones opened. (It replaced "folded", the list of
  // folded ones, so a library first shows only its category names.)
  const UI_DEFAULTS = { openCats: [], leftHidden: false, closedSecs: [], drawerTab: "wires", drawerH: 200, drawerClosed: false, startScreen: true, tool: "wire" };
  const ui = (() => {
    try { return Object.assign({}, UI_DEFAULTS, JSON.parse(localStorage.getItem(UI_KEY) || "{}")); }
    catch (e) { return { ...UI_DEFAULTS }; }
  })();
  function saveUi() {
    try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) { /* storage unavailable */ }
  }

  // The library shown in the sidebar (also remembered per browser). ALL_LIBS shows every one;
  // it can't clash with a library, as those always have a name.
  const ALL_LIBS = "";
  // Library names in the diagram, the project library first.
  function libraries() {
    const libs = [...new Set(doc.templates.map((t) => t.library))];
    return libs.includes(PROJECT_LIBRARY) ? [PROJECT_LIBRARY, ...libs.filter((l) => l !== PROJECT_LIBRARY)] : libs;
  }
  function currentLib() {
    const libs = libraries();
    if (ui.lib === ALL_LIBS || libs.includes(ui.lib)) return ui.lib;
    return libs[0] || PROJECT_LIBRARY;
  }
  function setLib(name) {
    ui.lib = name;
    saveUi();
    renderLibrary();
  }
  // Object types in the library shown.
  function shownTemplates() {
    const lib = currentLib();
    return lib === ALL_LIBS ? doc.templates : doc.templates.filter((t) => t.library === lib);
  }

  function renderLibrary() {
    const lib = currentLib();
    const libs = libraries();
    const count = (l) => doc.templates.filter((t) => t.library === l).length;
    $("libPick").innerHTML = (libs.length ? "" : `<option value="" selected disabled>No libraries</option>`) + libs.map((l) => `<option value="${esc(l)}"${l === lib ? " selected" : ""}>${esc(l)} (${count(l)})</option>`).join("")
      + (libs.length > 1 ? `<option value="${ALL_LIBS}"${lib === ALL_LIBS ? " selected" : ""}>All libraries (${doc.templates.length})</option>` : "");
    $("libExportItem").querySelector("span").textContent = $("libExportItem").querySelector("span").title = lib === ALL_LIBS ? "Export all libraries" : `Export “${lib}”`;
    const q = $("libSearch").value.trim().toLowerCase();
    const shown = shownTemplates();
    const cats = [];
    for (const t of shown) if (!cats.includes(t.category)) cats.push(t.category);
    let s = "";
    for (const c of cats) {
      const list = shown.filter((t) => t.category === c && (!q || t.name.toLowerCase().includes(q) || c.toLowerCase().includes(q)));
      if (!list.length) continue;
      const closed = !q && !ui.openCats.includes(c); // searching shows every match
      s += `<button class="lib-cat${closed ? " closed" : ""}" data-cat="${esc(c)}" aria-expanded="${!closed}" title="${closed ? "Show" : "Hide"} ${esc(c)}">${ic("chev-d", "sm")}<span class="cat-name">${esc(c)}</span><span class="count">${list.length}</span></button>`;
      if (closed) continue;
      for (const t of list) {
        const from = t.basedOn ? `Edited copy of “${t.basedOn.name || t.name}” from ${t.basedOn.library}. ` : "";
        s += `<div class="lib-item" data-tpl="${esc(t.id)}" title="${esc(from)}Click to add, or drag onto the diagram">
          <div class="thumb">${renderTemplatePreview(t, 32)}</div>
          <div class="meta"><div class="name">${esc(t.name)}</div><div class="size">${r3(t.w)} × ${r3(t.h)} mm · ${plural(t.terminals.length, "terminal")}${isLoose(t) ? " · loose" : ""}${t.basedOn && lib !== PROJECT_LIBRARY ? " · edited" : ""}</div></div>
          <div class="acts">
            <button class="icon-btn" data-lib="edit" title="Edit this type">${ic("edit", "sm")}</button>
            <button class="icon-btn" data-lib="dup" title="Duplicate this type">${ic("copy", "sm")}</button>
            <button class="icon-btn danger" data-lib="del" title="Delete this type">${ic("trash", "sm")}</button>
          </div>
        </div>`;
      }
    }
    $("library").innerHTML = s || `<div class="muted lib-empty">${shown.length ? "No matching object types." : "This library is empty. Use <b>+ New part</b>, or <b>+</b> above to load a ready-made library."}</div>`;
    const allFolded = cats.length && cats.every((c) => !ui.openCats.includes(c));
    $("btnLibFold").innerHTML = ic(allFolded ? "unfold" : "fold");
    $("btnLibFold").title = allFolded ? "Expand all categories" : "Collapse all categories";
  }

  function toggleCategory(c) {
    ui.openCats = ui.openCats.includes(c) ? ui.openCats.filter((x) => x !== c) : [...ui.openCats, c];
    saveUi();
    renderLibrary();
  }

  function setLeftHidden(hidden) {
    ui.leftHidden = hidden;
    saveUi();
    $("app").classList.toggle("left-collapsed", hidden);
  }

  function categories(list = doc.templates) {
    return [...new Set(list.map((t) => t.category))];
  }

  function lostConnections(tpl) {
    const ids = new Set(tpl.terminals.map((t) => t.id));
    const parts = new Set(doc.items.filter((i) => i.kind === "part" && i.tpl === tpl.id).map((i) => i.id));
    return doc.connections.filter((c) => [c.a, c.b].some((e) => parts.has(e.item) && !ids.has(e.term))).length;
  }

  // Editing a type from another library (built-in, ready-made or imported) saves an edited copy in the
  // project library, unless its Library is changed in the designer. The original stays as it was, so
  // refreshing its library can't undo the edit, and this diagram's parts switch to the copy.
  function editTemplate(tpl, isNew) {
    const copies = !isNew && tpl.library !== PROJECT_LIBRARY;
    TplEditor.open(tpl, {
      isNew,
      categories: categories(),
      libraries: libraries(),
      lostCheck: isNew ? null : lostConnections,
      note: copies ? `Saving puts an edited copy in “${PROJECT_LIBRARY}”, and this diagram's parts use it. “${tpl.library}” keeps the original.` : "",
      onSave(t) {
        const i = doc.templates.findIndex((x) => x.id === t.id);
        const was = i >= 0 ? doc.templates[i] : null;
        const copy = copies && was && t.library === was.library;
        if (copy && JSON.stringify(t) === JSON.stringify(was)) return; // nothing changed
        checkpoint();
        if (copy) {
          Object.assign(t, { id: uid("u"), library: PROJECT_LIBRARY, basedOn: { id: was.id, name: was.name, library: was.library } });
          doc.templates.push(t);
          for (const it of doc.items) if (it.kind === "part" && it.tpl === was.id) it.tpl = t.id;
        } else if (i >= 0) doc.templates[i] = t; else doc.templates.push(t);
        cleanConnections();
        // Follow the type into its library, so it doesn't vanish from view.
        if (currentLib() !== ALL_LIBS && currentLib() !== t.library) setLib(t.library); else renderLibrary();
        refresh();
        toast(copy ? `Saved the edited “${t.name}” to ${PROJECT_LIBRARY}; “${was.library}” keeps the original`
          : isNew ? `Added “${t.name}” to ${t.library}` : `Updated “${t.name}”`);
      },
    });
  }

  // New types and duplicates go in the project library.
  function newTemplate() {
    editTemplate({
      id: uid("u"), name: "", library: PROJECT_LIBRARY, category: "Custom", prefix: "A", w: 40, h: 60,
      fill: "#dfe6ee", radius: 1, showName: true, terminals: [],
    }, true);
  }

  function duplicateTemplate(id) {
    const src = doc.templates.find((t) => t.id === id);
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = uid("u");
    copy.name = src.name + " (copy)";
    copy.library = PROJECT_LIBRARY;
    delete copy.basedOn;
    editTemplate(copy, true);
  }

  function deleteTemplate(id) {
    const t = doc.templates.find((x) => x.id === id);
    const used = doc.items.filter((i) => i.kind === "part" && i.tpl === id);
    const msg = used.length
      ? `Delete “${t.name}”? ${used.length} part${used.length > 1 ? "s" : ""} on the diagram use it and will be removed too.`
      : `Delete “${t.name}” from the library?`;
    if (!confirm(msg)) return;
    checkpoint();
    const gone = new Set(used.map((i) => i.id));
    doc.items = doc.items.filter((i) => !gone.has(i.id));
    doc.templates = doc.templates.filter((x) => x.id !== id);
    cleanConnections();
    sel = new Set([...sel].filter(exists));
    renderLibrary();
    refresh();
  }

  // ---------- adding / editing items ----------
  function singleSelectedPart() {
    if (sel.size !== 1) return null;
    const it = itemById([...sel][0]);
    return it && it.kind === "part" ? it : null;
  }

  // at: centre point to snap around; topLeft: exact, already-snapped position (from a library drag).
  function addPart(tplId, at, topLeft) {
    const tpl = doc.templates.find((t) => t.id === tplId);
    if (!tpl) return;
    checkpoint();
    const it = { id: uid(), kind: "part", tpl: tplId, tag: autoTag(tpl.prefix), desc: "", x: 0, y: 0, rot: 0, page: doc.page };
    // Beside the selected part only when both are on rails or both are loose.
    const sp = !at && !topLeft && singleSelectedPart();
    const prev = sp && isLoose(tplOf(sp)) === isLoose(tpl) ? sp : null;
    if (topLeft) {
      it.x = r3(topLeft.x); it.y = r3(topLeft.y);
    } else if (prev) {
      // Place flush beside the selected part (in the build direction), centred on it — handy for building strips.
      const pb = boxOf(prev);
      it.x = r3(rtl() ? pb.x - tpl.w : pb.x + pb.w);
      it.y = r3(pb.y + pb.h / 2 - tpl.h / 2);
      if (prev.tag && (tplOf(prev)?.prefix || "") === (tpl.prefix || "")) {
        const inc = incrementTag(prev.tag);
        if (inc !== prev.tag) it.tag = inc;
      }
    } else {
      const c = at || viewCenter();
      const p = snapPosition(it, c.x - tpl.w / 2, c.y - tpl.h / 2, new Set([it.id]), tpl);
      it.x = r3(p.x); it.y = r3(p.y);
    }
    doc.items.push(it);
    sel = new Set([it.id]);
    refresh();
  }

  function addRail(at) {
    checkpoint();
    const c = at && "x" in at ? at : viewCenter();
    const g = doc.settings.grid || 1;
    const it = { id: uid(), kind: "rail", x: Math.round((c.x - 100) / g) * g, y: Math.round((c.y - 17.5) / g) * g, length: 200, height: 35, page: doc.page };
    doc.items.unshift(it); // rails sit behind everything
    sel = new Set([it.id]);
    refresh();
  }

  function addText(at) {
    checkpoint();
    // A note added at a point starts there; one added without a point goes near the middle of the view.
    const c = at && "x" in at ? { x: at.x, y: at.y - 2 } : { x: viewCenter().x - 20, y: viewCenter().y - 3 };
    const it = { id: uid(), kind: "text", x: r3(c.x), y: r3(c.y), text: "Note", size: 3.5, color: "#1d2126", bold: false, page: doc.page };
    doc.items.push(it);
    sel = new Set([it.id]);
    refresh();
    focusProp("text");
  }

  // ---------- group notes ----------
  // A group note is a text note with links: the ids of the parts and rails it describes. It's drawn with a
  // bracket along their side facing it (renderNoteBracket), and moves with them when they're all dragged.
  const noteLinks = (it) => (it.links || []).map(itemById).filter((x) => x && x.kind !== "text");

  // How far the bracket of a note linked to items should be from them on a side: clear of their wire
  // labels by 2 mm, measured as drawn, and at least 4 mm.
  function bracketGap(items, side) {
    const ids = new Set(items.map((i) => i.id)), g = groupBox(items.map(boxOf));
    const inv = svg.getScreenCTM().inverse();
    const world = (x, y) => { const pt = svg.createSVGPoint(); pt.x = x; pt.y = y; return pt.matrixTransform(inv); };
    let reach = 0;
    for (const el of svg.querySelectorAll("[data-at]")) {
      if (!ids.has(el.dataset.at.split("|")[0])) continue;
      const r = el.getBoundingClientRect(), a = world(r.left, r.top), b = world(r.right, r.bottom);
      reach = Math.max(reach, { top: g.y - a.y, bottom: b.y - g.y - g.h, left: g.x - a.x, right: b.x - g.x - g.w }[side]);
    }
    return Math.max(4, Math.ceil(reach + 2));
  }

  // A note for the selected parts and rails, above them, its bracket spanning them all.
  function addGroupNote() {
    const items = [...sel].map(itemById).filter((i) => i && i.kind !== "text");
    if (!items.length) return;
    checkpoint();
    const g = groupBox(items.map(boxOf)), gap = bracketGap(items, "top");
    const it = { id: uid(), kind: "text", text: "Group note", size: 3.5, color: "#1d2126", bold: false, page: doc.page, links: items.map((i) => i.id), gap };
    const { w, h } = itemBox({ ...it, x: 0, y: 0 });
    // Above the bracket and its leader.
    Object.assign(it, { x: r3(g.x + g.w / 2 - w / 2), y: r3(g.y - gap - 2 - 6 - h) });
    doc.items.push(it);
    sel = new Set([it.id]);
    refresh();
    focusProp("text");
  }

  // Link the one selected note to the other selected parts and rails, in place of what it was linked to.
  function linkNote() {
    const items = [...sel].map(itemById).filter(Boolean);
    const note = items.find((i) => i.kind === "text"), rest = items.filter((i) => i.kind !== "text");
    if (!note || !rest.length) return;
    checkpoint();
    note.links = rest.map((i) => i.id);
    note.gap = bracketGap(rest, bracketSide(note, groupBox(rest.map(boxOf))));
    sel = new Set([note.id]);
    refresh();
  }
  const canLinkNote = (items) => items.filter((i) => i.kind === "text").length === 1 && items.some((i) => i.kind !== "text");

  // The moving ids, with every group note whose items are all among them, so a note goes with its group.
  function withGroupNotes(ids) {
    const out = new Set(ids);
    for (const it of doc.items) {
      if (it.kind !== "text" || out.has(it.id)) continue;
      const ls = noteLinks(it);
      if (ls.length && ls.every((x) => out.has(x.id))) out.add(it.id);
    }
    return out;
  }

  function focusProp(key) {
    focusField($("props").querySelector(`[data-k="${key}"]`));
  }

  // Focus a field in the inspector, opening its section first if it's folded.
  function focusField(el) {
    if (!el) return;
    const sec = el.closest(".sec.closed");
    if (sec) toggleSection(sec.dataset.sec, true);
    el.scrollIntoView({ block: "nearest" });
    el.focus();
    el.select && el.select();
  }

  function deleteSelection() {
    if (!sel.size) return;
    checkpoint();
    // Bundles losing wires: an end with none left is left free.
    const ends = new Map(doc.cables.filter((cb) => !cb.open && cb.wires.some((id) => sel.has(id))).map((cb) => [cb, coreEnds(cb)]));
    doc.items = doc.items.filter((i) => !sel.has(i.id));
    doc.connections = doc.connections.filter((c) => !sel.has(c.id));
    doc.buses = doc.buses.filter((b) => !sel.has(b.id));
    // Deleting a cable unbundles it and its wires stay, except a one-ended cable's cores and a bundle's cores
    // not connected through, which go with it.
    const cores = new Set(doc.cables.filter((cb) => sel.has(cb.id)).flatMap((cb) => cb.wires.filter((id) => cb.open || cableSide(connById(id), cb))));
    doc.connections = doc.connections.filter((c) => !cores.has(c.id));
    doc.cables = doc.cables.filter((cb) => !sel.has(cb.id));
    for (const [cb, e] of ends) settleBundle(cb, e);
    cleanConnections();
    sel.clear();
    refresh();
  }

  // ---------- bus bars ----------
  // ---------- cables (bundled wires) ----------
  function nextCable() {
    let max = 0;
    for (const cb of doc.cables) {
      const m = /^C(\d+)$/i.exec(cb.label || "");
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return "C" + (max + 1);
  }

  // Put wires into a cable (a new one, or an existing one), taking them out of any other cable first.
  function bundleWires(wireIds, into) {
    // A core with an end on its cable (not connected through) can't leave it.
    const ids = wireIds.filter((id) => connById(id) && !doc.cables.some((cb) => cableSide(connById(id), cb)));
    if (!ids.length) return;
    checkpoint();
    for (const cb of doc.cables) cb.wires = cb.wires.filter((id) => !ids.includes(id));
    for (const id of ids) delete connById(id).core; // they take free core numbers in the cable they join
    let cb = into && cableById(into);
    if (cb) { cb.wires.push(...ids); applyCableCores(cb, new Set(ids)); }
    else {
      cb = { id: uid("k"), label: nextCable(), desc: "", color: "#3a3f45", notes: "", wires: ids, pa: null, pb: null };
      doc.cables.push(cb);
    }
    doc.cables = doc.cables.filter((x) => x.wires.length);
    sel = new Set([cb.id]);
    refresh();
  }

  function removeFromCable(connId) {
    const cb = cableOf(connId);
    if (!cb) return;
    const ends = cb.open ? {} : coreEnds(cb);
    delete ends[connId];
    const left = Object.values(ends);
    if (left.length && left.every(Boolean) && new Set(left).size > 1) { toast(BOTH_ENDS_MSG); return; }
    checkpoint();
    const gone = cb.open || cableSide(connById(connId), cb); // a core with an end on the cable can't outlive it
    cb.wires = cb.wires.filter((id) => id !== connId);
    if (connById(connId)) leaveCable(connById(connId));
    if (gone) doc.connections = doc.connections.filter((c) => c.id !== connId);
    settleBundle(cb, ends); // an end with no wires left is left free
    doc.cables = doc.cables.filter((x) => x.wires.length);
    refresh();
  }

  function unbundle(cb) {
    checkpoint();
    // Cores not connected through have nowhere to go without the cable.
    const ws = cb.wires.map(connById).filter(Boolean), keep = ws.filter((c) => !cableSide(c, cb));
    keep.forEach(leaveCable);
    doc.connections = doc.connections.filter((c) => keep.includes(c) || !ws.includes(c));
    doc.cables = doc.cables.filter((x) => x !== cb);
    sel = new Set(keep.map((c) => c.id));
    refresh();
  }

  function deleteCableAndWires(cb) {
    if (!cb.open && !confirm(`Delete cable ${cb.label || ""} and its ${cb.wires.length} wire${cb.wires.length === 1 ? "" : "s"}? (You can undo this.)`)) return;
    checkpoint();
    doc.connections = doc.connections.filter((c) => !cb.wires.includes(c.id));
    doc.cables = doc.cables.filter((x) => x !== cb);
    cleanConnections();
    sel.clear();
    refresh();
  }

  // ---------- the cores a cable profile lists ----------
  // A cable profile can list its cores in order (p.cores: { mark, color, stripe, gauge, conductor }). A
  // cable following it gives its cores those looks, core 1 first: c.fromCable marks a core that has one,
  // and c.mark is its marking (e.g. 1, 2… on numbered cores). A core changed by hand (c.ownLook) keeps
  // its own look when the profile is edited, until the profile is picked for the cable again.
  const profileCores = (cb) => cableProfileById(cb.profile)?.cores || [];

  // Which end of a core ("a" or "b") is on its cable rather than a terminal, or "": a one-ended cable's
  // cores have their free end there ({ item: cb.id, term: core number }), and so does a bundled core that
  // isn't connected at one end of the cable (not connected through).
  const cableSide = (c, cb) => (!c || !cb ? "" : c.a.item === cb.id ? "a" : c.b.item === cb.id ? "b" : "");

  // Each of a cable's cores has a number, saying which of its profile's cores it is (core 3 takes the look
  // of the profile's third core), so a cable can use some of its cores and leave others spare. A one-ended
  // cable's core number is its free end's terminal on the cable; a bundled wire's is c.core, or for a wire
  // bundled without one, the lowest number not taken, in bundle order. Returns { wire id: number }.
  function coreNumbers(cb) {
    const out = new Map(), ws = cb.wires.map(connById).filter(Boolean);
    if (cb.open) {
      for (const c of ws) out.set(c.id, parseInt((c.a.item === cb.id ? c.a : c.b).term, 10) || 0);
      return out;
    }
    const taken = new Set();
    for (const c of ws) {
      const n = c.core > 0 ? c.core : cableSide(c, cb) ? parseInt(c[cableSide(c, cb)].term, 10) : 0;
      if (n > 0 && !taken.has(n)) { out.set(c.id, n); taken.add(n); }
    }
    let n = 1;
    for (const c of ws) if (!out.has(c.id)) { while (taken.has(n)) n++; out.set(c.id, n); taken.add(n); }
    return out;
  }

  // A cable's cores in core order.
  function coreOrder(cb) {
    const num = coreNumbers(cb);
    return cb.wires.map(connById).filter(Boolean).sort((p, q) => num.get(p.id) - num.get(q.id));
  }

  // Core n of a cable in a few words, from its profile: "3: Green 28 AWG".
  function coreLabel(defs, n) {
    const k = defs[n - 1];
    if (!k) return `${n}: not in its profile`;
    return `${n}: ${[k.mark && k.mark !== String(n) ? k.mark : "", wireLookName(k.color, k.stripe), k.gauge].filter(Boolean).join(" ")}`;
  }

  // Make a wire core n of its cable, swapping numbers with the core that was n, and give both the looks of
  // their profile cores.
  function setCoreNumber(id, n) {
    const cb = cableOf(id);
    if (!cb) return;
    const num = coreNumbers(cb), was = num.get(id);
    if (!(n > 0) || n === was) return;
    checkpoint();
    const other = [...num].find(([, m]) => m === n)?.[0];
    // A bundle's numbers are all written down, so the ones worked out don't shift.
    if (!cb.open) for (const [wid, m] of num) connById(wid).core = m;
    const put = (wid, m) => {
      const c = connById(wid), side = cableSide(c, cb);
      if (side) c[side] = { item: cb.id, term: String(m) };
      if (!cb.open) c.core = m;
    };
    put(id, n);
    if (other) put(other, was);
    applyCableCores(cb, new Set([id, other].filter(Boolean)));
    refresh();
  }

  // Where each of a bundle's cores is connected, by wire id: "" at both ends, "A" or "B" at that end only.
  function coreEnds(cb) {
    const s = bundleSides(cb), out = {};
    for (const c of cb.wires.map(connById).filter(Boolean)) {
      const side = cableSide(c, cb); // its end that isn't on a terminal
      out[c.id] = !side ? "" : (s[c.id] || "a") === side ? "B" : "A";
    }
    return out;
  }

  // A bundle whose cores are now all connected at the same one end has nothing left at its other end, so
  // that end's left free, making it one-ended (ends: from coreEnds, as they are now). Returns false, changing
  // nothing, when both ends still have cores but none runs through, which a cable can't be drawn as.
  function settleBundle(cb, ends) {
    if (!cb || cb.open) return true;
    const ws = cb.wires.map(connById).filter(Boolean);
    if (!ws.length || ws.some((c) => !ends[c.id])) return true;
    const at = new Set(ws.map((c) => ends[c.id]));
    if (at.size > 1) return false;
    // The end with the cores is end A now, keeping its fan-out point and its connectors. The other end is
    // plugged into its connectors if it has any, else free.
    const coresAtB = [...at][0] === "B";
    if (coresAtB) cb.pa = cb.pb;
    const keep = (coresAtB ? cb.plugsB : cb.plugsA) || [], lose = (coresAtB ? cb.plugsA : cb.plugsB) || [];
    cb.ta = cb.tb = null;
    Object.assign(cb, { open: true, pb: null, portA: null, portB: lose[0] || null, plugsA: keep, plugsB: lose.slice(1), to: "" });
    ws.forEach((c) => delete c.core); // a one-ended cable's cores are numbered by their free ends
    return true;
  }
  const BOTH_ENDS_MSG = "Both ends of the cable have cores, so one of them needs to be connected through";

  // Take a bundled core off its terminal at one end of the cable ("A" or "B"): it stays in the cable there,
  // not connected through. If that end has no wires left, it's left free.
  function disconnectCore(id, end) {
    const c = connById(id), cb = cableOf(id);
    if (!c || !cb || cb.open || cableSide(c, cb)) return;
    const ends = coreEnds(cb);
    ends[id] = end === "A" ? "B" : "A";
    if (Object.values(ends).every(Boolean) && new Set(Object.values(ends)).size > 1) { toast(BOTH_ENDS_MSG); renderProps(); return; }
    checkpoint();
    const atA = bundleSides(cb)[id] || "a", n = coreNumbers(cb).get(id);
    c[end === "A" ? atA : atA === "a" ? "b" : "a"] = { item: cb.id, term: String(n) };
    c.core = n;
    settleBundle(cb, ends);
    refresh();
  }

  // Give a cable's cores the looks its profile lists: "all" of them (the profile was just picked), those in
  // a Set of wire ids (new cores), or by default all but those changed by hand (the profile was edited).
  function applyCableCores(cb, which) {
    const defs = profileCores(cb), num = coreNumbers(cb);
    coreOrder(cb).forEach((c) => {
      const k = defs[num.get(c.id) - 1];
      if (!k || !(which === "all" || (which instanceof Set ? which.has(c.id) : !c.ownLook))) return;
      Object.assign(c, { profile: "", color: k.color, stripe: k.stripe || "", gauge: k.gauge || "", conductor: k.conductor || "", follow: false, fromCable: true });
      delete c.ownLook;
      if (k.mark) c.mark = k.mark; else delete c.mark;
    });
  }

  // A wire leaving its cable keeps its look but not its core marking.
  function leaveCable(c) {
    delete c.core;
    delete c.fromCable;
    delete c.ownLook;
    delete c.mark;
  }

  // A core in a few words: "1 White/Orange 24 AWG".
  const coreText = (k) => [k.mark, wireLookName(k.color, k.stripe), k.gauge].filter(Boolean).join(" ");

  // ---------- cable connectors ----------
  // A cable connector (a "port" terminal, e.g. an RJ45 socket) takes a cable's plug, not single wires.
  // A cable records the connectors it's plugged into as portA / portB (see cableGeometry).
  const sameEnd = (e1, e2) => !!e1 && !!e2 && e1.item === e2.item && e1.term === e2.term;
  function isPortEnd(e) {
    const t = e && tplOf(itemById(e.item))?.terminals.find((x) => x.id === e.term);
    return !!t && isPort(t);
  }
  // Each end of a cable can be plugged into more than one connector: its main one (portA / portB, unless
  // its cores land there) and more (plugsA / plugsB), e.g. a motor cable with a power plug, an encoder plug
  // and two loose cores at the drive end. An end with more than one thing on it branches at its fan-out point.
  const endPlugs = (cb, end) => [end === "A" ? cb.portA : cb.portB, ...((end === "A" ? cb.plugsA : cb.plugsB) || [])].filter(Boolean);
  const cablePlugs = (cb) => [...endPlugs(cb, "A"), ...endPlugs(cb, "B")];
  const cableAtPort = (e) => doc.cables.find((cb) => cablePlugs(cb).some((p) => sameEnd(p, e)));

  // Swap a cable's ends over: its connectors and the layout points dragged at each end.
  function swapCableEnds(cb) {
    [cb.portA, cb.portB] = [cb.portB || null, cb.portA || null];
    [cb.plugsA, cb.plugsB] = [cb.plugsB || [], cb.plugsA || []];
    [cb.pa, cb.pb] = [cb.pb || null, cb.pa || null];
    [cb.ta, cb.tb] = [cb.tb || null, cb.ta || null];
  }

  // Plug one more connector into an end of a cable that already has something there (its cores or a
  // connector). Returns true when done, false if the connector can't take it.
  function addCablePlug(cb, end, port) {
    const used = cableAtPort(port);
    if (used) { toast(used === cb ? `${cb.label || "The cable"} is already plugged into ${refOf(port)}` : `${refOf(port)} already has cable ${used.label || ""}`.trim()); return false; }
    checkpoint();
    if (end === "B" && cb.open && !cb.portB) { cb.portB = { ...port }; cb.pb = cb.tb = null; delete cb.to; } // a free end is plugged in now
    else {
      const k = end === "A" ? "plugsA" : "plugsB";
      cb[k] = [...(cb[k] || []), { ...port }];
    }
    cleanConnections();
    sel = new Set([cb.id]);
    refresh();
    return true;
  }

  // A new cable plugged into two connectors, e.g. a patch lead from a switch port to a PLC.
  function plugCable(a, b) {
    for (const e of [a, b]) {
      const cb = cableAtPort(e);
      if (cb) { toast(`${refOf(e)} already has cable ${cb.label || ""}`.trim()); sel = new Set([cb.id]); refresh(); return; }
    }
    checkpoint();
    const cb = { id: uid("k"), label: nextCable(), desc: "", to: "", color: "#3a3f45", notes: "", open: true, wires: [], pa: null, pb: null, portA: { ...a }, portB: { ...b } };
    doc.cables.push(cb);
    sel = new Set([cb.id]);
    setHint("");
    refresh();
  }

  // Dragging between a connector and a terminal: a new cable plugged into the connector, with one core
  // landing on the terminal. More cores can be added to it afterwards.
  function plugAndFan(port, term) {
    const t = tplOf(itemById(term.item))?.terminals.find((x) => x.id === term.term);
    if (t && isSlot(t)) { toast("Bus bar slots take bus bars, not cable cores"); return; }
    const used = cableAtPort(port);
    if (used) { toast(`${refOf(port)} already has cable ${used.label || ""}`.trim()); sel = new Set([used.id]); refresh(); return; }
    checkpoint();
    const cb = { id: uid("k"), label: nextCable(), desc: "", to: "", color: "#3a3f45", notes: "", open: true, wires: [], pa: null, pb: null, portA: null, portB: { ...port } };
    const c = { id: uid("c"), a: { ...term }, b: { item: cb.id, term: "1" }, wire: nextWire(), notes: "" };
    initWire(c);
    doc.connections.push(c);
    cb.wires.push(c.id);
    doc.cables.push(cb);
    sel = new Set([cb.id]);
    setHint("");
    refresh();
  }

  // Take a cable's plug out of a connector. An end's next connector takes over as its main one; with none, a
  // cable with no cores is plugged in at its other end only. A cable left with no cores and no plug goes.
  function unplug(cb, e) {
    checkpoint();
    for (const k of ["plugsA", "plugsB"]) if (cb[k]) cb[k] = cb[k].filter((p) => !sameEnd(p, e));
    if (sameEnd(cb.portA, e)) {
      if (cb.plugsA?.length) cb.portA = cb.plugsA.shift();
      else { swapCableEnds(cb); cb.portB = null; }
    } else if (sameEnd(cb.portB, e)) cb.portB = cb.plugsB?.length ? cb.plugsB.shift() : null;
    if (!cb.wires.length && !cb.portA) { doc.cables = doc.cables.filter((x) => x !== cb); sel.delete(cb.id); }
    cleanConnections();
    refresh();
  }

  // ---------- a cable's two ends ----------
  // Every cable has two ends, A and B, and each one is plugged into a cable connector ("plug"), fans out
  // into cores that land on terminals ("fan"), or is free, running off the drawing ("free"). Any two go
  // together. How that's stored: a bundle of wires (not cb.open) fans out at both ends. Otherwise the cores
  // land on terminals at end A only, and their other ends are on the cable itself ({ item: cb.id, term:
  // core number }); a cable with no cores is plugged in at end A (portA), and end B is portB or free.

  // Which end of a bundle each of its wires' ends is at, worked out by position as the drawing does:
  // { [wire id]: "a" or "b", the wire end that's at cable end A }.
  function bundleSides(cb) {
    const conns = new Map(doc.connections.map((c) => [c.id, c]));
    const pos = (e) => ({ ...(termPoint(e) || { x: 0, y: 0 }), e });
    const g = cableGeometry(cb, conns, pos);
    const out = {};
    for (const k of g ? g.cores : []) out[k.c.id] = (k.ea ? k.ea.e === k.c.a : k.eb.e !== k.c.a) ? "a" : "b";
    return out;
  }

  // Where a cable's ends are on the drawing: [end A, end B], each the middle of its terminals, its
  // connector or its free end, as the drawing has them; null for an end it can't place.
  function cableEndPoints(cb) {
    const pos = (e) => { const p = termPoint(e); return p && { ...p, tpl: tplOf(itemById(e.item)) }; };
    const g = cableGeometry(cb, new Map(doc.connections.map((c) => [c.id, c])), pos);
    return g ? [g.cA || null, g.cB || null] : [null, null];
  }

  // A cable's ends: [end A, end B], each { kind: "plug" | "fan" | "free", port, terms, extra }, extra being the
  // end's other connectors.
  function cableEndInfo(cb) {
    const ws = cb.wires.map(connById).filter(Boolean);
    const extra = (k) => (cb[k] || []).slice();
    if (!cb.open) {
      const s = bundleSides(cb);
      const on = (e) => e.item !== cb.id; // not a core's end that isn't connected there
      return [{ kind: "fan", terms: ws.map((c) => (s[c.id] === "b" ? c.b : c.a)).filter(on), extra: extra("plugsA") },
        { kind: "fan", terms: ws.map((c) => (s[c.id] === "b" ? c.a : c.b)).filter(on), extra: extra("plugsB") }];
    }
    const a = ws.length ? { kind: "fan", terms: ws.map((c) => (c.a.item === cb.id ? c.b : c.a)) } : { kind: "plug", port: cb.portA };
    return [{ ...a, extra: extra("plugsA") }, cb.portB ? { kind: "plug", port: cb.portB, extra: extra("plugsB") } : { kind: "free", extra: [] }];
  }

  // What each end can change to: [action, menu label, tooltip].
  function endActions(cb, end) {
    const [me, other] = end === "A" ? cableEndInfo(cb) : cableEndInfo(cb).reverse();
    const out = [];
    if (me.kind === "fan" && me.terms.length) out.push(["move", "Move end…", "Move this end's cores to other terminals, core by core"]);
    if (me.kind === "fan" && cb.open) out.push(["fan", "Add cores…", "Pick more terminals for the cable's cores to land on"]);
    out.push(["plug", me.kind === "plug" ? "Plug into another connector…" : "Plug into a connector…",
      me.kind === "fan" ? (cb.open ? "Plug this end into a cable connector instead. Its cores go, as a cable plugged in at both ends doesn't draw its cores"
        : "Plug this end into a cable connector instead. The wires lose their terminals at this end and become the cable's cores")
        : "Pick the cable connector this end plugs into"]);
    if (me.kind !== "fan") out.push(["fan", "Fan out to terminals…", "Pick the terminals the cable's cores land on at this end"]);
    if (me.kind !== "free") out.push(["addplug", "Add a connector…", "Plug this end into another cable connector as well, e.g. a second plug on a motor cable. The end branches, a length of sheath to each connector"]);
    // With more than one connector, each can come out on its own; the main one's place goes to the next.
    if (me.extra.length) {
      [...(me.kind === "plug" ? [me.port] : []), ...me.extra].forEach((p, i) => out.push(["unplug:" + i, `Unplug ${refOf(p)}`, "Take the cable's plug out of this connector only"]));
      if (me.kind === "fan" && !cb.open) out.push(["free", "Leave free", "Take the wires off their terminals at this end and unplug its connectors, so the cable runs off the drawing. The wires become the cable's cores"]);
    } else if (me.kind === "plug") out.push(["free", "Unplug", other.kind === "free" ? "Unplug the cable. With nothing on the drawing at either end, it goes" : "Unplug this end and leave it free, running off the drawing"]);
    else if (me.kind === "fan" && !cb.open) out.push(["free", "Leave free", "Take the wires off their terminals at this end, so the cable runs off the drawing. The wires become the cable's cores"]);
    return out;
  }

  function runEndAction(cb, end, act) {
    if (act.startsWith("unplug:")) { const p = endPlugs(cb, end)[+act.slice(7)]; if (p) unplug(cb, p); return; }
    if (act === "move") startMoveEnd(cb.id, end);
    else if (act === "addplug") {
      pending = null;
      busEdit = { kind: "cable", id: cb.id, terms: [], end, plug: true, add: true };
      setHint("");
      refresh();
    }
    else if (act === "plug") {
      pending = null;
      busEdit = { kind: "cable", id: cb.id, terms: [], end, plug: true };
      setHint("");
      refresh();
    } else if (act === "fan") {
      if (cb.open && cb.wires.length && end === "B") { startLanding(cb.id); return; }
      pending = null;
      busEdit = { kind: "cable", id: cb.id, terms: [], end, fan: true, adding: cb.open && cb.wires.length > 0 };
      setHint("");
      refresh();
    } else if (act === "free") {
      const port = end === "A" ? (cb.open && !cb.wires.length ? cb.portA : null) : cb.portB;
      if (port) unplug(cb, port); else setCableEnd(cb, end, null);
    }
  }

  // Plug one end of a cable into a connector, or with port null leave it free. A bundle's wires lose their
  // terminals at that end and become cores of the cable. Plugging in the end a cable's cores land on removes
  // the cores, since a cable plugged in at both ends (or plugged in at one and free at the other) doesn't
  // draw them. Returns true when done, false if the connector can't take it, null if the user said no.
  function setCableEnd(cb, end, port) {
    if (port) {
      const used = cableAtPort(port);
      if (used && used !== cb) { toast(`${refOf(port)} already has cable ${used.label || ""}`.trim()); return false; }
      const own = end === "A" ? cb.portA : cb.portB;
      if (!sameEnd(own, port) && cablePlugs(cb).some((p) => sameEnd(p, port))) { toast(`${cb.label || "The cable"} is already plugged into ${refOf(port)}`); return false; }
    }
    const ws = cb.wires.map(connById).filter(Boolean);
    const name = cb.label || "the cable";
    if (!cb.open) {
      // Which end of each wire is at this end of the cable; a core connected only here has no terminal left.
      const s = bundleSides(cb), cut = end === "A" ? "a" : "b", num = coreNumbers(cb);
      const here = (c) => ((s[c.id] || "a") === cut ? "a" : "b");
      const lost = ws.filter((c) => cableSide(c, cb) && cableSide(c, cb) !== here(c));
      const ask = `${port ? `Plugging this end of ${name} into ${refOf(port)}` : `Leaving this end of ${name} free`} takes its ${plural(ws.length - lost.length, "wire")} off their terminals at this end. They become the cable's cores, so they no longer carry their circuits through to this end, and deleting the cable deletes them.${lost.length ? ` ${plural(lost.length, "core")} connected only at this end ${lost.length === 1 ? "goes" : "go"}.` : ""} Go ahead? (You can undo this.)`;
      if (!confirm(ask)) return null;
      checkpoint();
      doc.connections = doc.connections.filter((c) => !lost.includes(c));
      cb.wires = cb.wires.filter((id) => !lost.some((c) => c.id === id));
      ws.filter((c) => !lost.includes(c)).forEach((c) => { c[here(c)] = { item: cb.id, term: String(num.get(c.id)) }; delete c.core; });
      cb.open = true;
      // The other end's connectors go with it to end A; this end's stay with it, unless it's left free.
      const mine = (end === "A" ? cb.plugsA : cb.plugsB) || [], theirs = (end === "A" ? cb.plugsB : cb.plugsA) || [];
      cb.plugsA = theirs;
      cb.plugsB = port ? mine : [];
      // The fan-out point that's left is end A's now; the other end's position is worked out again.
      cb.pa = end === "A" ? cb.pb : cb.pa;
      cb.pb = null;
      cb.ta = cb.tb = null;
      cb.portA = null;
      cb.portB = port ? { ...port } : null;
      cb.to = "";
    } else if (end === "A" && ws.length) {
      if (!port) return null; // a cable needs something on the drawing
      if (!confirm(`Plugging this end of ${name} into ${refOf(port)} removes its ${plural(ws.length, "core")}: a cable plugged into a connector at this end doesn't draw its cores. Go ahead? (You can undo this.)`)) return null;
      checkpoint();
      doc.connections = doc.connections.filter((c) => !cb.wires.includes(c.id));
      cb.wires = [];
      cb.portA = { ...port };
      resetLayout(cb);
    } else {
      checkpoint();
      if (end === "A") cb.portA = { ...port };
      else { cb.portB = port ? { ...port } : null; cb.pb = null; cb.tb = null; if (!port) cb.plugsB = []; }
    }
    if (cb.portB) delete cb.to;
    cleanConnections();
    sel = new Set([cb.id]);
    refresh();
    return true;
  }

  function nextBus() {
    let max = 0;
    for (const b of doc.buses) {
      const m = /^BB(\d+)$/i.exec(b.label || "");
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return "BB" + (max + 1);
  }

  function startBus(id) {
    const b = id && busById(id);
    pending = null;
    busEdit = { kind: "bus", id: b ? b.id : null, terms: b ? b.terms.map((e) => e.item + "|" + e.term) : [] };
    setHint(""); // the bar across the top of the drawing says what to do
    refresh();
  }

  // Pick the terminals a new cable's cores land on and any connectors it plugs into.
  function startCable(id, first) {
    pending = null;
    busEdit = { kind: "cable", id: id || null, terms: first ? [first] : [] };
    setHint("");
    refresh();
  }

  // A one-ended cable's cores in core order, each with its free end (the end on the cable itself).
  function freeCores(cb) {
    const free = (c) => (c.a.item === cb.id ? "a" : "b");
    return cb.wires.map(connById).filter(Boolean)
      .map((c) => ({ c, free: free(c), near: c[free(c) === "a" ? "b" : "a"], n: parseInt(c[free(c)].term, 10) || 0 }))
      .sort((p, q) => p.n - q.n);
  }

  // Draw a one-ended cable's other end: pick a terminal for each core, in core order. The cable then has
  // both ends on the drawing, like wires bundled into a cable.
  function startLanding(id) {
    const cb = cableById(id);
    if (!canLand(cb)) return;
    pending = null;
    busEdit = { kind: "cable", id: cb.id, terms: [], land: true };
    setHint("");
    refresh();
  }

  // While landing a cable's other end: each core in core order with the terminal picked for it (to), null
  // for one left not connected at this end (busEdit.skip, by wire id), or undefined for one still to pick.
  // Each terminal clicked goes to the first core still to pick (busEdit.landTo: wire id -> terminal key).
  // Moving an end (busEdit.move), each core connected at that end instead, where Skip (to null) keeps it put.
  function landingPlan() {
    const to = busEdit.landTo || {}, skip = busEdit.skip || [];
    const cb = cableById(busEdit.id) || { wires: [] };
    return (busEdit.move ? endCores(cb, busEdit.move) : freeCores(cb))
      .map((k) => ({ ...k, to: skip.includes(k.c.id) ? null : to[k.c.id] ? termKeyParts(to[k.c.id]) : undefined }));
  }

  // What to click next while landing a cable's other end.
  function landingTip() {
    const plan = landingPlan(), k = plan.find((x) => x.to === undefined);
    if (busEdit.move) {
      return k ? `Core ${k.n || plan.indexOf(k) + 1} (${k.c.wire || "wire"}, on ${refOf(k.from)}): click the terminal it moves to, or Keep to leave it there`
        : "Every core has a new terminal or stays where it is. Press Enter or click Done";
    }
    if (!k) return plan.some((x) => x.to) ? "Every core has a terminal or is left not connected. Press Enter or click Done" : "Pick a terminal for at least one core";
    return `Core ${k.n || plan.indexOf(k) + 1} (${k.c.wire || "wire"}, from ${refOf(k.near)}): click the terminal it goes to, or Skip to leave it not connected at this end`;
  }

  // Leave a core not connected at the end being landed (the next one to pick, or wire id), or connect it again.
  function skipLanding(id) {
    const plan = landingPlan();
    id = id || plan.find((k) => k.to === undefined)?.c.id;
    if (!id) return;
    busEdit.skip = busEdit.skip || [];
    busEdit.landTo = busEdit.landTo || {};
    if (busEdit.skip.includes(id)) busEdit.skip = busEdit.skip.filter((x) => x !== id);
    else { busEdit.skip.push(id); delete busEdit.landTo[id]; }
    busEdit.terms = Object.values(busEdit.landTo);
    renderCanvas();
    renderProps();
  }

  // Fanning out an end of a cable whose profile lists its cores: which core each picked terminal gets
  // (busEdit.coreOf, by terminal key) and which the next one gets (busEdit.next), so cores can be skipped
  // or put on any terminal. Null when not fanning out such a cable.
  function pickCores() {
    const cb = busEdit && busEdit.fan && busEdit.id && cableById(busEdit.id);
    const defs = cb ? profileCores(cb) : [];
    if (!defs.length) return null;
    busEdit.coreOf = busEdit.coreOf || {};
    const onCable = new Set(coreNumbers(cb).values()), picked = new Set(Object.values(busEdit.coreOf));
    const pc = { cb, defs, onCable, free: (n) => !onCable.has(n) && !picked.has(n) };
    if (!(busEdit.next && pc.free(busEdit.next))) busEdit.next = nextFreeCore(pc);
    return pc;
  }
  // The first free core after core n, going round; past the profile's cores once they're all used.
  function nextFreeCore(pc, after = 0) {
    const N = pc.defs.length;
    for (let i = 1; i <= N; i++) { const n = ((after + i - 1) % N) + 1; if (pc.free(n)) return n; }
    let n = N + 1;
    while (!pc.free(n)) n++;
    return n;
  }
  // The core choices for a drop-down: the profile's cores (those already on the cable can't be picked), and
  // any picked past them.
  function coreOptions(pc, current, disable) {
    const max = Math.max(pc.defs.length, current || 0);
    return Array.from({ length: max }, (_, i) => i + 1).map((n) => `<option value="${n}"${n === current ? " selected" : ""}${n !== current && disable(n) ? " disabled" : ""}>${esc(coreLabel(pc.defs, n))}${pc.onCable.has(n) ? " (on the cable)" : ""}</option>`).join("");
  }
  function skipCore() {
    const pc = pickCores();
    if (!pc) return;
    busEdit.next = nextFreeCore(pc, busEdit.next);
    renderModeBar();
    renderProps();
  }
  // Give a picked terminal core n, swapping with the picked terminal that had it.
  function setPickedCore(key, n) {
    const pc = pickCores();
    if (!pc || !(key in busEdit.coreOf) || pc.onCable.has(n)) return;
    const other = Object.keys(busEdit.coreOf).find((k) => busEdit.coreOf[k] === n);
    if (other) busEdit.coreOf[other] = busEdit.coreOf[key];
    busEdit.coreOf[key] = n;
    pickCores(); // moves next on if it was just taken
    renderCanvas();
    renderProps();
  }

  // A cable whose cores land on terminals at one end only: its other end (free, or plugged into a
  // connector, which it's then unplugged from) can fan out to terminals too.
  const canLand = (cb) => !!cb && cb.open && !cb.portA && cb.wires.length > 0;

  // The cores connected at one end of a cable ("A" or "B"), in core order: each with the side of the wire
  // that's at that end (side), the terminal it's on there (from) and its other end (near).
  function endCores(cb, end) {
    const s = cb.open ? {} : bundleSides(cb), num = coreNumbers(cb);
    return cb.wires.map(connById).filter(Boolean).map((c) => {
      const atA = cb.open ? (c.a.item === cb.id ? "b" : "a") : s[c.id] || "a";
      const side = end === "A" ? atA : atA === "a" ? "b" : "a";
      return { c, side, from: c[side], near: c[side === "a" ? "b" : "a"], n: num.get(c.id) || 0 };
    }).filter((k) => k.from.item !== cb.id).sort((p, q) => p.n - q.n);
  }

  // Move one end of a cable to other terminals: pick a new terminal for each core there, in core order, or
  // Keep one where it is.
  function startMoveEnd(id, end) {
    const cb = cableById(id);
    if (!cb || !endCores(cb, end).length) return;
    pending = null;
    busEdit = { kind: "cable", id: cb.id, terms: [], land: true, move: end };
    setHint("");
    refresh();
  }

  function finishMove() {
    const cb = cableById(busEdit.id), end = busEdit.move;
    if (!cb) { cancelBus(); return; }
    const used = landingPlan().filter((k) => k.to && !sameEnd(k.to, k.from));
    if (!used.length) { cancelBus(); return; } // nothing moved
    const loop = used.find((k) => sameEnd(k.near, k.to));
    if (loop) { toast(`Core ${loop.n} would start and end on ${refOf(loop.to)}`); return; }
    const key = (e) => e.item + "|" + e.term;
    // Only a core connected through joins circuits; a one-ended cable's cores end on the cable itself.
    askJoin(used.filter((k) => k.near.item !== cb.id).map((k) => [key(k.near), key(k.to)]), used.length === 1 ? "This core" : "These cores", () => {
      checkpoint();
      used.forEach((k) => { k.c[k.side] = { ...k.to }; });
      // The fan-out point and tail at the moved end work themselves out again.
      if (end === "A") { cb.pa = null; cb.ta = null; } else { cb.pb = null; cb.tb = null; }
      busEdit = null;
      sel = new Set([cb.id]);
      setHint("");
      refresh();
    });
  }

  // Enough terminals picked to finish: when landing a cable's other end, a terminal or Skip for every core.
  function busReady() {
    const n = busEdit.terms.length;
    if (busEdit.plug) return false; // done as soon as a connector is clicked
    if (busEdit.connect || busEdit.reland) return false; // done as soon as a terminal is clicked
    if (busEdit.land) { const plan = landingPlan(); return (busEdit.move || plan.every((k) => k.to !== undefined)) && plan.some((k) => k.to); }
    return n >= (busEdit.kind === "cable" ? 1 : 2);
  }

  function finishLanding() {
    if (busEdit.move) { finishMove(); return; }
    const cb = cableById(busEdit.id);
    if (!cb) { cancelBus(); return; }
    const plan = landingPlan(), used = plan.filter((k) => k.to);
    if (plan.some((k) => k.to === undefined)) { toast("Pick a terminal for each core, or Skip the ones not connected at this end"); return; }
    if (!used.length) { toast("Pick a terminal for at least one core. To use none at this end, leave it free"); return; }
    const loop = used.find((k) => sameEnd(k.near, k.to));
    if (loop) { toast(`Core ${loop.n} would start and end on ${refOf(loop.to)}`); return; }
    const key = (e) => e.item + "|" + e.term;
    askJoin(used.map((k) => [key(k.near), key(k.to)]), used.length === 1 ? "This core" : "These cores", () => {
      checkpoint();
      // Every core runs from its old terminal (end A, where pa is) to its new one (end B), or stays in the
      // cable there, not connected through.
      plan.forEach((k) => {
        k.c.a = { ...k.near };
        k.c.b = k.to ? { ...k.to } : { item: cb.id, term: String(k.n) };
        if (k.n > 0) k.c.core = k.n;
      });
      cb.open = false;
      delete cb.to;
      cb.portB = null; // unplugged, if it was plugged in
      cb.pb = null; // was where the free end lay; now the fan-out point at the new end works itself out
      cb.ta = cb.tb = null;
      busEdit = null;
      sel = new Set([cb.id]);
      setHint("");
      refresh();
    });
  }

  // Connect a bundled core at the end of the cable it isn't connected at: pick the terminal it goes to.
  function startConnect(id) {
    const c = connById(id), cb = cableOf(id);
    if (!c || !cb || cb.open || !cableSide(c, cb)) return;
    pending = null;
    busEdit = { kind: "cable", id: cb.id, terms: [], connect: id };
    setHint("");
    refresh();
  }

  function finishConnect(p) {
    const c = connById(busEdit.connect), cb = cableById(busEdit.id), side = cableSide(c, cb);
    if (!c || !side) { cancelBus(); return; }
    const near = c[side === "a" ? "b" : "a"];
    if (sameEnd(near, p)) { toast(`This core's other end is on ${refOf(p)}`); return; }
    askJoin([[near.item + "|" + near.term, p.item + "|" + p.term]], "This core", () => {
      checkpoint();
      c[side] = { ...p };
      busEdit = null;
      sel = new Set([cb.id]);
      setHint("");
      refresh();
    });
  }

  // Move one end of a wire ("a" or "b") to another terminal: click the terminal it goes to.
  function startReland(id, end) {
    const c = connById(id);
    if (!c || !termPoint(c[end])) return;
    pending = null;
    busEdit = { kind: "wire", terms: [], reland: { id, end } };
    setHint("");
    refresh();
  }

  function finishReland(p) {
    const { id, end } = busEdit.reland, c = connById(id);
    if (!c) { cancelBus(); return; }
    if (sameEnd(c[end], p)) { cancelBus(); return; } // put back where it was
    const other = c[end === "a" ? "b" : "a"];
    if (sameEnd(other, p)) { toast(`The wire's other end is on ${refOf(p)}`); return; }
    askJoin([[other.item + "|" + other.term, p.item + "|" + p.term]], "This wire", () => {
      checkpoint();
      c[end] = { ...p };
      busEdit = null;
      sel = new Set([c.id]);
      setHint("");
      refresh();
    });
  }

  function finishCable() {
    if (busEdit.land) { finishLanding(); return; }
    if (busEdit.connect) { cancelBus(); return; } // nothing to finish until a terminal is clicked
    if (busEdit.plug) { cancelBus(); return; } // nothing to finish until a connector is clicked
    if (busEdit.fan && !busEdit.terms.length) { toast("Pick at least one terminal for the cable's cores"); return; }
    let cb = busEdit.id && cableById(busEdit.id);
    const picked = busEdit.terms.map(termKeyParts);
    const plugs = picked.filter(isPortEnd), terms = picked.filter((e) => !isPortEnd(e));
    if (!cb && !terms.length && !plugs.length) { toast("Pick at least one terminal or cable connector for the cable"); return; }
    const taken = plugs.find(cableAtPort);
    if (taken) { toast(`${refOf(taken)} already has cable ${cableAtPort(taken).label || ""}`.trim()); return; }
    checkpoint();
    if (!cb) {
      // A new cable: its cores land at end A. The first connector picked is its far end, end B; the rest
      // go at end A, with the cores. With no cores, the first two connectors are ends B and A.
      cb = { id: uid("k"), label: nextCable(), desc: "", to: "", color: "#3a3f45", notes: "", open: true, wires: [], pa: null, pb: null };
      doc.cables.push(cb);
      cb.portB = plugs[0] ? { ...plugs[0] } : null;
      const rest = plugs.slice(1).map((e) => ({ ...e }));
      if (!terms.length) cb.portA = rest.shift() || null;
      if (!terms.length && !cb.portA) { cb.portA = cb.portB; cb.portB = null; } // just one connector: end A, end B free
      cb.plugsA = rest;
      if (cb.portB) delete cb.to;
    } else if (busEdit.fan) {
      // Fanning out an end: its cores land there, so it's end A, and its main connector (if it was plugged
      // in) comes out; its other connectors stay.
      if (busEdit.end === "B" && !cb.wires.length) swapCableEnds(cb);
      if (!cb.wires.length) cb.portA = null;
      if (!cb.wires.length || busEdit.end === "B") resetLayout(cb); // the cable's shape has changed
      if (cb.portB) delete cb.to; // only a free end says where it goes
    }
    // Each core takes the number picked for its terminal, or the next one after the cable's cores.
    const coreOf = (busEdit.fan && busEdit.coreOf) || {};
    let core = Math.max(0, ...cb.wires.map(connById).filter(Boolean).map((c) => parseInt((c.a.item === cb.id ? c.a : c.b).term, 10) || 0), ...Object.values(coreOf));
    const made = new Set();
    for (const e of terms) {
      const c = { id: uid("c"), a: { ...e }, b: { item: cb.id, term: String(coreOf[e.item + "|" + e.term] || ++core) }, wire: nextWire(), notes: "" };
      initWire(c);
      doc.connections.push(c);
      cb.wires.push(c.id);
      made.add(c.id);
    }
    applyCableCores(cb, made);
    busEdit = null;
    sel = new Set([cb.id]);
    setHint("");
    refresh();
  }

  function cancelBus() {
    busEdit = null;
    setHint("");
    refresh();
  }

  function finishBus() {
    if (!busEdit) return;
    if (busEdit.reland) { cancelBus(); return; } // nothing to finish until a terminal is clicked
    if (busEdit.kind === "cable") { finishCable(); return; }
    if (busEdit.terms.length < 2) { toast("Pick at least two terminals for the bus bar"); return; }
    // "Don't join" leaves the terminals picked, to change them.
    const edit = busEdit;
    askJoin([edit.terms], "This bus bar", () => {
      checkpoint();
      const terms = edit.terms.map(termKeyParts);
      let b = edit.id && busById(edit.id);
      if (b) b.terms = terms;
      else {
        b = { id: uid("b"), label: nextBus(), terms, color: "#b87333", notes: "", follow: true };
        doc.buses.push(b);
      }
      // A new bus bar (or a following one with new terminals) takes the colour of the wires in its circuit.
      if (b.follow) {
        const src = circuitSource(b);
        if (src) copyLook(b, src); else b.follow = false;
      }
      busEdit = null;
      sel = new Set([b.id]);
      setHint("");
      refresh();
    });
  }

  function toggleBusTerm(key, onlyAdd) {
    if (!busEdit) return; // e.g. still sweeping after a connector was clicked to plug a cable in
    const p = termKeyParts(key), t = tplOf(itemById(p.item))?.terminals.find((x) => x.id === p.term) || {};
    if (busEdit.plug) {
      if (onlyAdd) return; // sweeping doesn't plug anything in
      if (!isPort(t)) { toast("Click a cable connector (a socket) for this end of the cable to plug into"); return; }
      const cb = cableById(busEdit.id);
      const end = busEdit.end;
      if (!cb) { cancelBus(); return; }
      const add = busEdit.add;
      busEdit = null;
      const done = add ? addCablePlug(cb, end, p) : setCableEnd(cb, end, p);
      if (done === false) busEdit = { kind: "cable", id: cb.id, terms: [], end, plug: true, add }; // that connector's taken: pick another
      if (!done) refresh();
      return;
    }
    if (busEdit.connect || busEdit.reland) {
      if (onlyAdd || isSlot(t)) return;
      if (isPort(t)) { toast(`${refOf(p)} is a cable connector, which takes a cable rather than a single wire`); return; }
      if (busEdit.connect) finishConnect(p); else finishReland(p);
      return;
    }
    if (busEdit.land) {
      if (isSlot(t)) return;
      if (isPort(t)) { toast(`${refOf(p)} is a cable connector. To plug the cable in instead, use Plug into a connector…`); return; }
      // A picked terminal clicked again comes off its core, which is then the next to pick.
      const to = busEdit.landTo = busEdit.landTo || {};
      const had = Object.keys(to).find((id) => to[id] === key);
      if (had) { if (onlyAdd) return; delete to[had]; }
      else {
        const k = landingPlan().find((x) => x.to === undefined);
        if (!k) { toast(busEdit.move ? "Every core has a new terminal or stays where it is. Click a picked one to take it off, or press Enter" : "Every core has a terminal or is left not connected. Click a picked one to take it off, or press Enter"); return; }
        to[k.c.id] = key;
      }
      busEdit.terms = Object.values(to);
      renderCanvas();
      renderProps();
      return;
    }
    if (busEdit.fan) {
      if (isSlot(t)) return;
      if (isPort(t)) { toast(`${refOf(p)} is a cable connector. To plug this end into it instead, use Plug into a connector…`); return; }
    } else if (busEdit.kind === "cable") {
      if (isSlot(t)) return; // slots take bus bars, not cores
      const other = isPort(t) && !busEdit.terms.includes(key) && cableAtPort(p);
      if (other && other.id !== busEdit.id) { toast(`${refOf(p)} already has cable ${other.label || ""}`.trim()); return; }
    } else if (isPort(t)) return; // connectors take cables, not bus bars
    const i = busEdit.terms.indexOf(key);
    if (i >= 0 && !onlyAdd) busEdit.terms.splice(i, 1);
    else if (i < 0) busEdit.terms.push(key);
    else return;
    const pc = pickCores();
    if (pc) {
      if (i >= 0) delete busEdit.coreOf[key];
      else {
        const n = busEdit.next;
        busEdit.coreOf[key] = n;
        busEdit.next = nextFreeCore(pickCores(), n);
      }
    }
    renderCanvas();
    renderProps();
  }

  // Keep every other picked terminal along the row (start 0: 1st, 3rd…; start 1: 2nd, 4th…),
  // e.g. sweep a whole strip's slots, then keep alternate blocks for +24 V and the rest for 0 V.
  function alternateBus(start) {
    const pts = busOrder(busEdit.terms.map((k) => ({ k, ...termPoint(termKeyParts(k)) })));
    busEdit.terms = pts.filter((_, i) => i % 2 === start).map((p) => p.k);
    renderCanvas();
    renderProps();
  }

  // Items to push along when moving with Ctrl: the chain of items touching the selection's leading side
  // in the direction of travel (sign +1 right/down, -1 left/up), then touching those, and so on, e.g. the
  // rest of a strip of blocks sitting flush on a rail. Anything past a gap stays where it is.
  function pushedItems(d, axis, sign) {
    const out = new Set();
    if (!sign) return out;
    const tol = 0.5; // how close counts as touching, in mm
    const span = (id, q) => {
      const it = itemById(id);
      if (!it || it.kind === "rail") return null; // rails stay put; the parts on them are what moves
      const b = itemBox({ ...it, x: q.x, y: q.y }, it.kind === "part" ? tplOf(it) : null);
      return axis === "x" ? { lo: b.x, hi: b.x + b.w, plo: b.y, phi: b.y + b.h } : { lo: b.y, hi: b.y + b.h, plo: b.x, phi: b.x + b.w };
    };
    const others = [];
    for (const [id, q] of d.all) if (!d.orig.has(id)) { const sp = span(id, q); if (sp) others.push({ id, ...sp }); }
    const queue = [];
    for (const [id, q] of d.orig) { const sp = span(id, q); if (sp) queue.push(sp); }
    while (queue.length) {
      const b = queue.pop();
      const edge = sign > 0 ? b.hi : b.lo;
      for (const o of others) {
        if (out.has(o.id) || o.phi <= b.plo + 0.01 || o.plo >= b.phi - 0.01) continue; // not side by side
        if (Math.abs((sign > 0 ? o.lo : o.hi) - edge) <= tol) { out.add(o.id); queue.push(o); }
      }
    }
    return out;
  }

  // Snap a straight group move (Ctrl-drag) along one axis: any moving item's edge may sit flush against,
  // or line up with, the edge of an item staying put. Flush needs the two side by side (overlapping
  // across the move); lining up works for items within 40 mm, like parts on a neighbouring rail.
  // Falls back to the grid for the grabbed item. Returns the snapped offset.
  function groupSnap(d, ids, axis, raw, free) {
    const o = d.all.get(d.primary);
    const g = doc.settings.grid || 0;
    const onGrid = () => (g > 0 ? Math.round((o[axis] + raw) / g) * g - o[axis] : raw);
    if (free) return raw;
    if (!doc.settings.snapEdges) return onGrid();
    const span = (id) => {
      const it = itemById(id);
      if (!it || it.kind === "rail") return null;
      const q = d.all.get(id);
      const b = itemBox({ ...it, x: q.x, y: q.y }, it.kind === "part" ? tplOf(it) : null);
      return axis === "x" ? { lo: b.x, hi: b.x + b.w, plo: b.y, phi: b.y + b.h } : { lo: b.y, hi: b.y + b.h, plo: b.x, phi: b.x + b.w };
    };
    const mov = [...ids].map(span).filter(Boolean);
    const still = [...d.all.keys()].filter((id) => !ids.has(id)).map(span).filter(Boolean);
    const thr = 7 / view.scale;
    let best = null;
    const tryD = (v) => { const dist = Math.abs(v - raw); if (dist < thr && (!best || dist < best.dist)) best = { v, dist }; };
    for (const m of mov) {
      for (const st of still) {
        const gap = Math.max(0, st.plo - m.phi, m.plo - st.phi);
        if (gap === 0 && Math.min(st.phi, m.phi) - Math.max(st.plo, m.plo) > 0.01) {
          tryD(st.lo - m.hi); // flush: moving item's far side against a still item's near side
          tryD(st.hi - m.lo);
        }
        if (gap < 40) { tryD(st.lo - m.lo); tryD(st.hi - m.hi); } // line up
      }
    }
    return best ? best.v : onGrid();
  }

  // After swapping a part's type, fit the new part where the old one was (ob: its box before the swap).
  // It stays on its rail, a side that had something flush against it keeps it flush (the strip beyond
  // closes up or opens out), and when the new part is bigger, whatever is now in its way is pushed along.
  // Parts on rails are only pushed along their rail, never off it.
  function fitSwapped(it, ob) {
    const tol = 0.5; // how close counts as touching, in mm
    const lo = (b, a) => (a === "x" ? b.x : b.y);
    const hi = (b, a) => (a === "x" ? b.x + b.w : b.y + b.h);
    const perp = (a) => (a === "x" ? "y" : "x");
    const side = (b1, b2, a) => lo(b1, perp(a)) < hi(b2, perp(a)) - 0.01 && lo(b2, perp(a)) < hi(b1, perp(a)) - 0.01;
    const rails = pageItems().filter((o) => o.kind === "rail");
    const railed = new Set(rails.flatMap(mountedOn));
    const boxes = new Map(pageItems().filter((o) => o !== it && o.kind !== "rail").map((o) => [o, boxOf(o)]));
    const movable = (a) => [...boxes.keys()].filter((o) => a === "x" || !railed.has(o));
    const flush = (b, a, s) => movable(a).filter((o) => {
      const q = boxes.get(o);
      return side(q, b, a) && Math.abs(s > 0 ? lo(q, a) - hi(b, a) : hi(q, a) - lo(b, a)) <= tol;
    });
    const shift = (o, a, d) => {
      o[a] = r3(o[a] + d);
      boxes.set(o, boxOf(o));
    };

    // Where the new part goes on each axis.
    const nb = boxOf(it); // the new size, still at the old top-left
    const rail = !isLoose(tplOf(it)) && rails.map((r) => ({ r, b: boxOf(r) }))
      .filter(({ b }) => ob.y <= b.y + b.h / 2 && ob.y + ob.h >= b.y + b.h / 2 && ob.x < b.x + b.w && ob.x + ob.w > b.x)
      .sort((p, q) => Math.abs(p.b.y + p.b.h / 2 - ob.y - ob.h / 2) - Math.abs(q.b.y + q.b.h / 2 - ob.y - ob.h / 2))[0];
    const place = (a, n) => {
      if (a === "y" && rail) return rail.b.y + rail.b.h / 2 - n / 2;
      const before = flush(ob, a, -1).length > 0, after = flush(ob, a, 1).length > 0;
      if (before && after) return a === "x" && rtl() ? hi(ob, a) - n : lo(ob, a);
      if (before) return lo(ob, a);
      if (after) return hi(ob, a) - n;
      // Nothing flush on this axis: keep lined up with the neighbours beside it, if it was.
      const beside = [...flush(ob, perp(a), -1), ...flush(ob, perp(a), 1)].map((o) => boxes.get(o));
      if (beside.some((q) => Math.abs(lo(q, a) - lo(ob, a)) <= tol)) return lo(ob, a);
      if (beside.some((q) => Math.abs(hi(q, a) - hi(ob, a)) <= tol)) return hi(ob, a) - n;
      if (a === "x") return rtl() ? hi(ob, a) - n : lo(ob, a);
      return lo(ob, a) + (ob.h - n) / 2;
    };
    it.x = r3(place("x", nb.w));
    it.y = r3(place("y", nb.h));
    const now = boxOf(it);

    // Push o along by at least d (sign s), and whatever it then runs into.
    let pushed; // how far each item has been pushed on the side being fitted
    const shove = (o, a, s, d) => {
      if (d <= (pushed.get(o) || 0) + 0.001) return;
      const was = boxes.get(o);
      shift(o, a, s * (d - (pushed.get(o) || 0)));
      pushed.set(o, d);
      const b = boxes.get(o);
      for (const q of movable(a)) {
        if (q === o) continue;
        const qb = boxes.get(q);
        if (!side(qb, b, a)) continue;
        const ahead = s > 0 ? lo(qb, a) >= hi(was, a) - tol : hi(qb, a) <= lo(was, a) + tol;
        const into = s > 0 ? hi(b, a) - lo(qb, a) : hi(qb, a) - lo(b, a);
        if (ahead && into > 0.01) shove(q, a, s, (pushed.get(q) || 0) + into);
      }
    };
    for (const a of ["x", "y"]) {
      for (const s of [-1, 1]) {
        const d = s > 0 ? hi(now, a) - hi(ob, a) : lo(now, a) - lo(ob, a);
        if (s * d < -0.001) {
          // This side moved in: bring the strip flush against it along too.
          const chain = new Set(), queue = [ob];
          while (queue.length) for (const o of flush(queue.pop(), a, s)) if (!chain.has(o)) { chain.add(o); queue.push(boxes.get(o)); }
          for (const o of chain) shift(o, a, d);
        } else if (s * d > 0.001) {
          pushed = new Map();
          // This side moved out: push along whatever it now overlaps (including anything flush against it).
          for (const o of movable(a)) {
            const b = boxes.get(o);
            if (!side(b, now, a)) continue;
            const ahead = s > 0 ? lo(b, a) >= hi(ob, a) - tol : hi(b, a) <= lo(ob, a) + tol;
            const into = s > 0 ? hi(now, a) - lo(b, a) : hi(b, a) - lo(now, a);
            if (ahead && into > 0.01) shove(o, a, s, into);
          }
        }
      }
    }
  }

  // A quarter turn for the selected parts and text notes. A note turns about its middle, so stays put.
  function rotateSelection(dir = 1) {
    const items = [...sel].map(itemById).filter((i) => i && (i.kind === "part" || i.kind === "text"));
    if (!items.length) return;
    checkpoint();
    for (const it of items) {
      const b = boxOf(it);
      it.rot = ((((+it.rot || 0) + 90 * dir) % 360) + 360) % 360;
      if (it.kind === "text") continue;
      it.x = r3(it.x + (b.w - b.h) / 2);
      it.y = r3(it.y + (b.h - b.w) / 2);
    }
    refresh();
  }

  function nudge(dx, dy) {
    const items = [...withGroupNotes([...sel].filter((id) => itemById(id)))].map(itemById);
    if (!items.length) return;
    checkpoint();
    const anchors = cableAnchors();
    for (const it of items) { it.x = r3(it.x + dx); it.y = r3(it.y + dy); }
    followCables(anchors);
    refresh();
  }

  // A cable's fan-out points (pa, pb), and a one-ended cable's free end (pb), are fixed positions once
  // dragged, so they'd stay put while its parts move. Before a move, cableAnchors notes each fixed point
  // with the terminals at its end of the cable (a one-ended cable's points both belong to its one end);
  // after, followCables moves each point as far as those terminals moved, if they all moved together.
  // It works from where everything started, so it can run on every step of a drag.
  function cableAnchors() {
    const conns = new Map(doc.connections.map((c) => [c.id, c]));
    const out = [];
    for (const cb of doc.cables) {
      if (!hasLayout(cb)) continue;
      const ws = cb.wires.map((id) => conns.get(id)).filter(Boolean);
      let ends;
      if (cb.open) {
        const near = ws.map((c) => (c.a.item === cb.id ? c.b : c.a));
        const one = [...(near.length ? near : cb.portA ? [cb.portA] : []), ...(cb.plugsA || [])];
        // With more connectors at end B, its fan-out point (pb) goes with them; else pb is the free end.
        const atB = endPlugs(cb, "B");
        ends = { pa: one, pb: atB.length > 1 ? atB : cb.portB ? [] : one, ta: one, tb: cb.portB ? atB : one };
      } else {
        if (!ws.length || ws.some((c) => [c.a, c.b].some((e) => e.item !== cb.id && !termPoint(e)))) continue;
        const g = cableGeometry(cb, conns, (e) => ({ ...termPoint(e), e }));
        if (!g) continue;
        ends = { pa: [...g.cores.filter((k) => k.ea).map((k) => k.ea.e), ...(cb.plugsA || [])], pb: [...g.cores.filter((k) => k.eb).map((k) => k.eb.e), ...(cb.plugsB || [])] };
        ends.ta = ends.pa; ends.tb = ends.pb;
      }
      for (const key of ["pa", "pb", "ta", "tb"]) {
        const from = ends[key].map(termPoint);
        if (!cb[key] || !from.length || from.some((p) => !p)) continue;
        out.push({ cb, key, p: { ...cb[key] }, ends: ends[key], from });
      }
    }
    return out;
  }

  // Points of a cable's layout that have been dragged: fan-out points (pa, pb), a one-ended cable's free
  // end (pb) and a broken cable's tail ends (ta, tb).
  const hasLayout = (cb) => !!(cb.pa || cb.pb || cb.ta || cb.tb);
  function resetLayout(cb) {
    cb.pa = cb.pb = cb.ta = cb.tb = null;
  }

  function followCables(anchors) {
    for (const a of anchors) {
      const now = a.ends.map(termPoint);
      const dx = now[0] ? now[0].x - a.from[0].x : 0, dy = now[0] ? now[0].y - a.from[0].y : 0;
      const together = now.every((q, i) => q && Math.abs(q.x - a.from[i].x - dx) < 1e-6 && Math.abs(q.y - a.from[i].y - dy) < 1e-6);
      a.cb[a.key] = together ? { x: r3(a.p.x + dx), y: r3(a.p.y + dy) } : { ...a.p };
    }
  }

  // Copy the given items (and wires between them) offset by dx, dy, onto the page open.
  function cloneItems(src, dx, dy) {
    const usedTags = new Set(doc.items.map((i) => i.tag).filter(Boolean));
    const idMap = new Map();
    const out = [];
    for (const it of src.items) {
      const c = JSON.parse(JSON.stringify(it));
      c.id = uid();
      c.page = doc.page;
      c.x = r3(c.x + dx); c.y = r3(c.y + dy);
      if (c.kind === "part" && c.tag) {
        let t = c.tag, guard = 0;
        while (usedTags.has(t) && guard++ < 999) {
          const inc = incrementTag(t);
          t = inc === t ? t + "'" : inc;
        }
        c.tag = t;
        usedTags.add(t);
      }
      idMap.set(it.id, c.id);
      out.push(c);
    }
    // A copied group note is linked to the copies of its items; with none of them copied, to nothing.
    for (const c of out) if (c.links) { c.links = c.links.map((id) => idMap.get(id)).filter(Boolean); if (!c.links.length) delete c.links; }
    doc.items.push(...out);
    const connMap = new Map();
    for (const c of src.connections) {
      if (!idMap.has(c.a.item) || !idMap.has(c.b.item)) continue;
      const id = uid("c");
      connMap.set(c.id, id);
      doc.connections.push({
        ...JSON.parse(JSON.stringify(c)), id, wire: nextWire(),
        a: { item: idMap.get(c.a.item), term: c.a.term }, b: { item: idMap.get(c.b.item), term: c.b.term },
      });
    }
    for (const cb of src.cables || []) {
      if (!cb.wires.every((w) => connMap.has(w))) continue;
      if (cablePlugs(cb).some((e) => !idMap.has(e.item))) continue; // plugged into a part that wasn't copied
      const shift = (p) => p && { x: r3(p.x + dx), y: r3(p.y + dy) };
      const port = (e) => e && { item: idMap.get(e.item), term: e.term };
      doc.cables.push({ ...JSON.parse(JSON.stringify(cb)), id: uid("k"), label: nextCable(), wires: cb.wires.map((w) => connMap.get(w)), pa: shift(cb.pa), pb: shift(cb.pb), ta: shift(cb.ta), tb: shift(cb.tb), portA: port(cb.portA), portB: port(cb.portB), plugsA: (cb.plugsA || []).map(port), plugsB: (cb.plugsB || []).map(port) });
    }
    for (const b of src.buses || []) {
      if (!b.terms.every((e) => idMap.has(e.item))) continue;
      doc.buses.push({
        ...JSON.parse(JSON.stringify(b)), id: uid("b"), label: nextBus(),
        terms: b.terms.map((e) => ({ item: idMap.get(e.item), term: e.term })),
      });
    }
    sel = new Set(out.map((i) => i.id));
  }

  function selectionPayload(pick = sel) {
    const items = doc.items.filter((i) => pick.has(i.id));
    const ids = new Set(items.map((i) => i.id));
    const connections = doc.connections.filter((c) => ids.has(c.a.item) && ids.has(c.b.item));
    const buses = doc.buses.filter((b) => b.terms.every((e) => ids.has(e.item)));
    const wireIds = new Set(connections.map((c) => c.id));
    // A plugged-in cable has no wires, so it goes along only when the parts it's plugged into do.
    const plugged = (e) => !e || ids.has(e.item);
    const cables = doc.cables.filter((cb) => (cb.wires.length || cb.portA) && cb.wires.every((w) => wireIds.has(w)) && cablePlugs(cb).every(plugged));
    return JSON.parse(JSON.stringify({ items, connections, buses, cables }));
  }

  function duplicateSelection() {
    const p = selectionPayload();
    if (!p.items.length) return;
    checkpoint();
    cloneItems(p, 10, 10);
    refresh();
  }

  function cutSelection() {
    const p = selectionPayload();
    if (!p.items.length) return;
    clipboard = p;
    deleteSelection();
    toast(`Cut ${plural(p.items.length, "item")}`);
  }

  // Find: the lists' filter box, opening the lists if they're hidden.
  function findInLists() {
    if ($("drawer").classList.contains("collapsed")) setDrawerClosed(false);
    $("listFilter").focus();
    $("listFilter").select();
  }

  // Grey out the Edit menu's commands that have nothing to work on.
  function updateEditMenu() {
    const has = {
      undo: undoStack.length > 0, redo: redoStack.length > 0, sel: sel.size > 0,
      items: [...sel].some((id) => itemById(id)), clipboard: !!(clipboard && clipboard.items.length),
    };
    for (const b of $("editMenu").querySelectorAll("[data-needs]")) b.disabled = !has[b.dataset.needs];
  }

  function copySelection() {
    const p = selectionPayload();
    if (!p.items.length) return;
    clipboard = p;
    toast(`Copied ${p.items.length} item${p.items.length > 1 ? "s" : ""}`);
  }

  function paste() {
    if (!clipboard || !clipboard.items.length) return;
    checkpoint();
    const minX = Math.min(...clipboard.items.map((i) => i.x));
    const minY = Math.min(...clipboard.items.map((i) => i.y));
    const g = doc.settings.grid || 1;
    const dx = Math.round((mouse.x - minX) / g) * g, dy = Math.round((mouse.y - minY) / g) * g;
    cloneItems(clipboard, dx, dy);
    refresh();
  }

  function repeatSideways(id, count) {
    const it = itemById(id);
    if (!it || count < 1) return;
    checkpoint();
    const b = boxOf(it);
    const step = rtl() ? -b.w : b.w;
    const made = [];
    let tag = it.tag;
    for (let i = 1; i <= count; i++) {
      const c = JSON.parse(JSON.stringify(it));
      c.id = uid();
      c.x = r3(it.x + step * i);
      tag = incrementTag(tag);
      c.tag = tag;
      made.push(c);
    }
    doc.items.push(...made);
    sel = new Set([made[made.length - 1].id]);
    refresh();
  }

  function alignSelection(mode) {
    const items = [...sel].map(itemById).filter((i) => i && i.kind !== "text");
    if (items.length < 2) return;
    checkpoint();
    const anchors = cableAnchors();
    const boxes = items.map((it) => ({ it, b: boxOf(it) }));
    if (mode === "top") { const y = Math.min(...boxes.map((o) => o.b.y)); boxes.forEach((o) => { o.it.y = r3(y); }); }
    if (mode === "bottom") { const y = Math.max(...boxes.map((o) => o.b.y + o.b.h)); boxes.forEach((o) => { o.it.y = r3(y - o.b.h); }); }
    if (mode === "middle") {
      const ref = boxes.slice().sort((a, b) => a.b.x - b.b.x)[0].b;
      const cy = ref.y + ref.h / 2;
      boxes.forEach((o) => { o.it.y = r3(cy - o.b.h / 2); });
    }
    if (mode === "left") { const x = Math.min(...boxes.map((o) => o.b.x)); boxes.forEach((o) => { o.it.x = r3(x); }); }
    if (mode === "pack" && rtl()) {
      // Keep the rightmost item where it is and close the gaps leftwards.
      boxes.sort((a, b) => (b.b.x + b.b.w) - (a.b.x + a.b.w));
      let x = boxes[0].b.x + boxes[0].b.w;
      for (const o of boxes) { x -= o.b.w; o.it.x = r3(x); }
    } else if (mode === "pack") {
      boxes.sort((a, b) => a.b.x - b.b.x);
      let x = boxes[0].b.x;
      for (const o of boxes) { o.it.x = r3(x); x += o.b.w; }
    }
    followCables(anchors);
    refresh();
  }

  // ---------- wiring ----------
  // What a wire carries, judged from its terminal names: PE, + or - (DC), N or L (AC), or null.
  function guessRole(a, b) {
    const names = [termName(a), termName(b)].map((s) => s.toUpperCase().trim());
    if (names.some((s) => /^(PE|GND|EARTH|⏚)/.test(s))) return "PE";
    if (names.some((s) => /^(\+|L\+|V\+)/.test(s) || /\+$/.test(s))) return "+";
    if (names.some((s) => /^(-|0V|V-|M$|L-|COM-)/.test(s) || /-$/.test(s))) return "-";
    if (names.some((s) => s === "N")) return "N";
    if (names.some((s) => /^L\d?$/.test(s))) return "L";
    return null;
  }

  function guessColor(a, b) {
    const role = guessRole(a, b);
    if (role === "+") return "#d32f2f";
    if (role === "-") return "#1f63c6";
    return role ? wireStd(doc.settings.wireStd).colors[role] : null;
  }

  // Switch the diagram between metric and American wiring: profiles and wires get the nearest size in
  // the new system, and line / neutral / earth wires take the new standard's colours.
  function setWireStd(to) {
    const from = doc.settings.wireStd;
    doc.settings.wireStd = to;
    if (from === to) return;
    for (const p of doc.wireProfiles) convertWire(p, profileRole(p), from, to);
    // A cable's cores are the colours they're made in, so only their sizes change.
    for (const p of doc.cableProfiles) for (const k of p.cores || []) k.gauge = convertGauge(k.gauge, to);
    for (const c of doc.connections) {
      const p = profileById(c.profile);
      if (p) applyProfile(c, p);
      else if (c.fromCable) c.gauge = convertGauge(c.gauge, to);
      else convertWire(c, guessRole(c.a, c.b), from, to);
    }
    lastWire.gauge = convertGauge(lastWire.gauge, to);
    // Paper follows the standard too: Letter sizes and inch margins, or A sizes and mm.
    const pr = doc.settings.print;
    if (pr) {
      if (PAPERS[pr.paper]?.std !== to) pr.paper = PAPERS[pr.paper]?.other || printDefaults(to).paper;
      pr.margin = nearestMargin(pr.margin, to);
    }
  }

  const profileById = (id) => (id ? doc.wireProfiles.find((p) => p.id === id) : null);

  // Copy a wire's look (profile, or colour, size and conductor) onto another.
  function copyWire(c, src) {
    const p = profileById(src.profile);
    if (p) { applyProfile(c, p); return; }
    c.profile = "";
    c.color = src.color;
    c.stripe = src.stripe || "";
    c.gauge = src.gauge;
    c.conductor = src.conductor;
  }

  const isBus = (x) => Array.isArray(x.terms);

  // Copy a wire's or bus bar's look onto another. Bus bars only have a colour, so a bus bar takes just
  // the colour, and a wire copying a bus bar takes its colour (dropping a profile that no longer fits).
  function copyLook(t, src) {
    if (isBus(t)) { t.color = src.color; return; }
    if (!isBus(src)) { copyWire(t, src); return; }
    t.color = src.color;
    t.stripe = "";
    const p = profileById(t.profile);
    if (p && (p.color !== t.color || p.stripe)) t.profile = "";
  }

  // What a new wire or bus bar should match. For a wire: a wire on its From terminal, else elsewhere in
  // the From end's circuit, then the same for the To end; for a bus bar, a wire in its circuit. Bus bars
  // in the circuit are used only when there's no wire. Items set by hand win over ones only following.
  function circuitSource(x, except) {
    const items = itemMap(doc), tpls = tplMap(doc);
    const keep = (y) => y.id !== x.id && y !== except;
    const conns = validConnections(doc, items, tpls).filter(keep);
    const buses = validBuses(doc, items, tpls).filter(keep);
    const find = buildCircuits(doc, items, tpls, conns, buses);
    const key = (e) => e.item + "|" + e.term;
    const pick = (list) => (list.length ? list.find((y) => !y.follow) || list[0] : null);
    const ends = isBus(x) ? x.terms : [x.a, x.b];
    for (const e of ends) {
      const r = find(key(e));
      const src = pick(conns.filter((y) => key(y.a) === key(e) || key(y.b) === key(e))) || pick(conns.filter((y) => find(key(y.a)) === r));
      if (src) return src;
    }
    for (const e of ends) {
      const r = find(key(e));
      const src = pick(buses.filter((y) => find(key(y.terms[0])) === r));
      if (src) return busById(src.id) || src; // validBuses hands back copies
    }
    return null;
  }

  // Wires and bus bars that follow their circuit take on a hand-made change to any wire or bus bar in it.
  function matchFollowers(src) {
    const circ = circuitOf(doc, [src.id]);
    for (const c of doc.connections) if (c !== src && c.follow && circ.conns.has(c.id)) copyLook(c, src);
    for (const b of doc.buses) if (b !== src && b.follow && circ.buses.has(b.id)) copyLook(b, src);
  }

  // A wire or bus bar changed by hand keeps its own settings from then on, and the circuit's following
  // wires and bus bars match it.
  function handEdited(x) {
    x.follow = false;
    // A cable core changed by hand keeps its look when the cable's profile is edited.
    if (x.a && cableOf(x.id)) { delete x.fromCable; x.ownLook = true; }
    matchFollowers(x);
  }

  // The same for several wires or bus bars, shown when any of them has something to match.
  function followBoxes(list) {
    if (!list.some((x) => circuitSource(x, x))) return "";
    const on = same(list, (x) => !!x.follow);
    return `<label class="check" title="Changing a wire or bus bar in a circuit by hand updates the ones that match it. Changing one by hand turns this off for it."><input type="checkbox" data-follow${on === MIXED ? " data-mixed" : on ? " checked" : ""}> Match their circuits</label>`;
  }

  // "Match the circuit" tick box for a wire's or bus bar's panel, shown when there's something to match.
  function followBox(x) {
    const src = circuitSource(x, x);
    if (!src) return "";
    const what = isBus(src) ? src.label : src.wire;
    return `<label class="check" title="Changing a wire or bus bar in this circuit by hand updates the ones that match it. Changing this one by hand turns this off."><input type="checkbox" data-follow${x.follow ? " checked" : ""}> Match the circuit${x.follow ? ` (like ${esc(what || "the rest of it")})` : ""}</label>`;
  }

  // A new wire joining a circuit that already has wires matches them, and keeps following them until it's
  // changed by hand. Otherwise it follows a profile when one fits: the profile matching the terminal's
  // colour guess (+, 0 V, PE, L, N), or the last profile used; with no profiles it gets the guessed or last colour.
  // A circuit with only bus bars gives the new wire their colour (size and conductor come from the usual defaults).
  function initWire(c) {
    const src = circuitSource(c);
    if (src && !isBus(src)) { copyWire(c, src); c.follow = true; return; }
    const guess = guessColor(c.a, c.b);
    const byGuess = guess && (doc.wireProfiles.find((p) => p.color === guess && !p.stripe) || doc.wireProfiles.find((p) => p.color === guess));
    const p = byGuess || (!guess && profileById(lastWire.profile));
    if (p) applyProfile(c, p);
    else {
      c.profile = "";
      c.color = guess || lastWire.color;
      c.stripe = guess ? "" : lastWire.stripe || "";
      c.gauge = lastWire.gauge;
      c.conductor = lastWire.conductor;
    }
    if (src) { copyLook(c, src); c.follow = true; }
  }

  // Name the circuit a wire or bus bar is in: every wire and bus bar in it takes the name, and any
  // connector labels in it are renamed to match (clearing leaves connector labels as they are).
  function nameCircuit(id, name) {
    name = name.trim();
    const circ = circuitOf(doc, [id]);
    for (const c of doc.connections) if (circ.conns.has(c.id)) c.circuit = name;
    for (const b of doc.buses) if (circ.buses.has(b.id)) b.circuit = name;
    if (!name) return;
    for (const k of circ.terms) {
      const e = termKeyParts(k), it = itemById(e.item);
      if (it && it.termLabels && String(it.termLabels[e.term] || "").trim()) it.termLabels[e.term] = name;
    }
  }

  // Every circuit name and connector label in use, for suggestions.
  function allNetNames() {
    const seen = new Map();
    const add = (v) => { const t = String(v || "").trim(); if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t); };
    for (const it of doc.items) for (const v of Object.values(it.termLabels || {})) add(v);
    for (const c of doc.connections) add(c.circuit);
    for (const b of doc.buses) add(b.circuit);
    return [...seen.values()].sort(natural);
  }

  // ---------- joining named circuits ----------
  // A wire, bus bar or cable landing that would join circuits with different names (e.g. +24V to 0V) asks
  // first. Circuits sharing a name are already one, so ends with different names are different circuits.
  // joins: lists of "item|term" keys, each list joined together. Returns one entry for each circuit that
  // would carry several names: { names: every name it would carry, ends: [{ name, names, at: "item|term" }] },
  // an end for each circuit joined, with its name ("A / B" if it has several) and its names as a list.
  function namedJoins(joins) {
    const cn = circuitNames(doc);
    const parent = new Map(), at = new Map();
    const find = (n) => { while (parent.get(n) !== n) n = parent.get(n); return n; };
    for (const keys of joins) {
      const named = keys.map((k) => [cn.term(k), k]).filter(([n]) => n);
      for (const [n, k] of named) if (!parent.has(n)) { parent.set(n, n); at.set(n, k); }
      for (const [n] of named.slice(1)) { const r1 = find(named[0][0]), r2 = find(n); if (r1 !== r2) parent.set(r2, r1); }
    }
    const groups = new Map();
    for (const n of parent.keys()) {
      const r = find(n);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push({ name: n, names: cn.names(at.get(n)), at: at.get(n) });
    }
    return [...groups.values()].filter((ends) => ends.length > 1)
      .map((ends) => ({ ends, names: [...new Set(ends.flatMap((e) => e.names))].sort(natural) }));
  }

  // Run join() (which makes the change, with its own checkpoint), unless it would join named circuits:
  // then ask first, and rename them as chosen afterwards. what: e.g. "This wire". cancelled() runs on
  // "Don't join".
  let joinAnswer = null;
  function askJoin(joins, what, join, cancelled) {
    const found = namedJoins(joins);
    if (!found.length) { join(); return; }
    openJoinDialog(found, what);
    joinAnswer = (picks) => {
      joinAnswer = null;
      $("joinModal").hidden = true;
      if (!picks) { if (cancelled) cancelled(); return; }
      join();
      found.forEach((g, i) => { if (picks[i]) nameCircuit(g.ends[0].at, picks[i]); });
      refresh();
    };
  }

  // What calling a join's circuit keep renames: everything in the circuits joined that aren't called just
  // that already, wherever they are in the drawing. E.g. "3 wires, 1 bus bar and 1 connector label".
  function renameReach(g, keep) {
    const conns = new Set(), buses = new Set(), labels = new Set();
    for (const e of g.ends) {
      if (e.names.length === 1 && netKey(e.names[0]) === netKey(keep)) continue;
      const circ = circuitOf(doc, [e.at]);
      circ.conns.forEach((id) => conns.add(id));
      circ.buses.forEach((id) => buses.add(id));
      for (const k of circ.terms) {
        const p = termKeyParts(k);
        if (String(itemById(p.item)?.termLabels?.[p.term] || "").trim()) labels.add(k);
      }
    }
    return listText([conns.size && plural(conns.size, "wire"), buses.size && plural(buses.size, "bus bar"), labels.size && plural(labels.size, "connector label")].filter(Boolean));
  }
  const listText = (xs) => xs.length > 1 ? xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1] : xs[0] || "";

  function openJoinDialog(found, what) {
    const two = found.length === 1 && found[0].ends.length === 2;
    $("joinTitle").textContent = two ? "Join two named circuits?" : "Join named circuits?";
    $("joinBody").innerHTML = found.map((g, i) => {
      const ends = g.ends.map((e) => `<b>${esc(e.name)}</b> (at ${esc(refOf(termKeyParts(e.at)))})`);
      const opt = (value, title, sub, on) => `<label class="join-opt"><input type="radio" name="join${i}" value="${esc(value)}"${on ? " checked" : ""}><span><b>${esc(title)}</b><span class="muted">${esc(sub)}</span></span></label>`;
      return `<p>${found.length > 1 ? `${i + 1}. ` : ""}${esc(what)} would join ${two ? `${ends[0]} to ${ends[1]}` : listText(ends)}, making them one circuit.</p>
        <div class="join-opts">
          ${g.names.map((n) => {
            const reach = renameReach(g, n);
            return opt(n, `Call it all ${n}`, `Renames ${listText(g.names.filter((x) => x !== n))} to ${n}, everywhere in the drawing${reach ? `: ${reach}` : ""}.`);
          }).join("")}
          ${opt("", g.names.length > 2 ? "Keep all the names" : "Keep both names", `The circuit is labelled ${g.names.join(" / ")}.`, true)}
        </div>`;
    }).join("") + `<p class="hint-text">Joining circuits with different names is often a mistake, such as wiring a supply to its return. <b>Don't join</b> leaves the drawing as it was.</p>`;
    $("joinModal").hidden = false;
    $("joinModal").querySelector('[data-join="ok"]').focus();
  }

  $("joinModal").addEventListener("click", (e) => {
    const b = e.target.closest("[data-join]");
    if (!b || !joinAnswer) return;
    if (b.dataset.join !== "ok") { joinAnswer(null); return; }
    joinAnswer([...$("joinBody").querySelectorAll(".join-opts")].map((box) => box.querySelector("input:checked")?.value || ""));
  });

  function assignProfile(conns, id) {
    const p = profileById(id);
    for (const c of conns) {
      if (p) applyProfile(c, p);
      else c.profile = "";
      handEdited(c);
    }
    lastWire.profile = p ? p.id : "";
  }

  function connect(a, b) {
    setHint("");
    if (a.item === b.item && a.term === b.term) return;
    if (isPortEnd(a) || isPortEnd(b)) {
      // A connector never takes a single wire: between two connectors this is a cable, and between a
      // connector and a terminal it's a cable plugged in at one end with a core landing on the terminal.
      if (isPortEnd(a) && isPortEnd(b)) plugCable(a, b);
      else if (isPortEnd(a)) plugAndFan(a, b);
      else plugAndFan(b, a);
      return;
    }
    const same = (e1, e2) => e1.item === e2.item && e1.term === e2.term;
    const dup = doc.connections.find((c) => (same(c.a, a) && same(c.b, b)) || (same(c.a, b) && same(c.b, a)));
    if (dup) { sel = new Set([dup.id]); toast("Those terminals are already connected"); refresh(); return; }
    askJoin([[a.item + "|" + a.term, b.item + "|" + b.term]], "This wire", () => {
      checkpoint();
      const c = { id: uid("c"), a: { ...a }, b: { ...b }, wire: nextWire(), notes: "" };
      initWire(c);
      doc.connections.push(c);
      sel = new Set([c.id]);
      setHint("");
      refresh();
    });
  }

  // ---------- snapping ----------
  function snapPosition(it, nx, ny, exclude, tplOverride, free) {
    if (free) return { x: nx, y: ny };
    const tpl = tplOverride || (it.kind === "part" ? tplOf(it) : null);
    const b0 = itemBox(it, tpl);
    const w = b0.w, h = b0.h;
    const onRails = it.kind === "part" && !isLoose(tpl);
    const thr = 7 / view.scale;
    const railThr = Math.max(24 / view.scale, 12); // rails pull from further away than other edges
    let bx = null, by = null, railY = null;
    const tryX = (v) => { const d = Math.abs(v - nx); if (d < thr && (!bx || d < bx.d)) bx = { d, v }; };
    const tryY = (v) => { const d = Math.abs(v - ny); if (d < thr && (!by || d < by.d)) by = { d, v }; };
    if (doc.settings.snapEdges && it.kind !== "text") {
      for (const o of pageItems()) {
        if (exclude.has(o.id) || o.kind === "text") continue;
        const ob = boxOf(o);
        const vOver = ny < ob.y + ob.h && ny + h > ob.y;
        const hOver = nx < ob.x + ob.w && nx + w > ob.x;
        const gapX = Math.max(0, ob.x - (nx + w), nx - (ob.x + ob.w));
        const gapY = Math.max(0, ob.y - (ny + h), ny - (ob.y + ob.h));
        if (o.kind === "rail" && !onRails) continue; // loose parts ignore rails
        if (o.kind === "rail") {
          const v = ob.y + ob.h / 2 - h / 2;
          const d = Math.abs(v - ny);
          if (hOver && d < railThr && (!railY || d < railY.d)) railY = { d, v };
          continue;
        }
        if (vOver) { tryX(ob.x + ob.w); tryX(ob.x - w); }
        if (hOver) { tryY(ob.y + ob.h); tryY(ob.y - h); }
        if (gapY < 40) { tryX(ob.x); tryX(ob.x + ob.w - w); }
        if (gapX < 40) { tryY(ob.y); tryY(ob.y + ob.h - h); tryY(ob.y + ob.h / 2 - h / 2); }
      }
    }
    if (railY) by = railY; // mounting on a rail beats any other vertical snap
    const g = doc.settings.grid || 0;
    const gs = (v) => (g > 0 ? Math.round(v / g) * g : v);
    return { x: bx ? bx.v : gs(nx), y: by ? by.v : gs(ny) };
  }

  // Parts sitting on a rail move with it.
  function mountedOn(rail) {
    const rb = boxOf(rail);
    const cy = rb.y + rb.h / 2;
    return pageItems().filter((o) => {
      if (o.kind !== "part" || isLoose(tplOf(o))) return false;
      const b = boxOf(o);
      return b.y <= cy && b.y + b.h >= cy && b.x >= rb.x - 0.01 && b.x + b.w <= rb.x + rb.w + 0.01;
    });
  }

  // ---------- canvas pointer handling ----------
  function termKeyParts(k) { const [item, term] = k.split("|"); return { item, term }; }

  svg.addEventListener("pointerdown", (e) => {
    svg.focus?.();
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      e.preventDefault();
      drag = { type: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: true };
      svg.classList.add("panning");
      svg.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    const w = toWorld(e);
    mouse = { x: w.x, y: w.y };
    const termEl = e.target.closest("[data-term]");
    const connEl = e.target.closest("[data-conn]");
    const busEl = e.target.closest("[data-bus]");
    const cableEl = e.target.closest("[data-cable]");
    let itemEl = e.target.closest("[data-item]");
    const handleEl = e.target.closest("[data-cable-handle]");

    if (tool === "measure" && !busEdit) {
      pending = null;
      const a = measureSnap(w, e.altKey);
      drag = { type: "measure", sx: e.clientX, sy: e.clientY, moved: false };
      measure = { a, b: a };
      measureHover = null;
      svg.setPointerCapture(e.pointerId);
      renderOverlay();
      return;
    }

    // Dragging a group note's bracket in or out from its items.
    const barEl = e.target.closest("[data-bracket]");
    if (barEl && !busEdit && !selFilter && e.button === 0) {
      const id = barEl.dataset.bracket;
      if (!sel.has(id) || sel.size > 1) { sel = new Set([id]); refresh(); }
      drag = { type: "bracket", id, sx: e.clientX, sy: e.clientY, moved: false };
      svg.setPointerCapture(e.pointerId);
      return;
    }

    if (handleEl && !busEdit && !selFilter) {
      // Dragging a cable's breakout point.
      const [cid, end] = handleEl.dataset.cableHandle.split("|");
      drag = { type: "cablept", id: cid, end, sx: e.clientX, sy: e.clientY, moved: false };
      svg.setPointerCapture(e.pointerId);
      return;
    }

    if (busEdit) {
      // Plugging a cable end in, or landing a core or wire end: a click does it, after the pointer events are over, as it
      // may ask first and a dialog mid-click can lose the pointer's release.
      if ((busEdit.plug || busEdit.connect || busEdit.reland) && termEl) {
        const key = termEl.dataset.term;
        setTimeout(() => toggleBusTerm(key), 0);
        return;
      }
      // Picking terminals for a bus bar: click toggles, dragging sweeps more in. Anything else pans.
      if (termEl) {
        toggleBusTerm(termEl.dataset.term);
        drag = { type: "bussweep" };
      } else drag = { type: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false, keepSel: true };
      svg.setPointerCapture(e.pointerId);
      return;
    }

    // With a selection filter, a click picks only the kinds allowed (terminals don't start wires), and
    // dragging from anywhere else draws a selection box.
    let filtered = false;
    if (selFilter && !(spaceDown || e.button !== 0)) {
      const kind = connEl ? "wire" : busEl ? "bus" : cableEl ? "cable" : itemEl ? itemById(itemEl.dataset.item)?.kind : null;
      if (!kind || !allows(kind)) {
        if (pending) { pending = null; setHint(""); }
        drag = { type: "marquee", start: w, cur: w, base: e.shiftKey ? new Set(sel) : new Set() };
        svg.setPointerCapture(e.pointerId);
        return;
      }
      filtered = true;
    }

    if (termEl && !filtered && tool === "select" && !pending) {
      const ids = attachedTo(termKeyParts(termEl.dataset.term));
      if (ids.length) {
        if (e.shiftKey) for (const id of ids) sel.add(id); else sel = new Set(ids);
        refresh();
        return;
      }
      // Nothing on it: the click selects and moves its part.
      itemEl = { dataset: { item: termKeyParts(termEl.dataset.term).item } };
    } else if (termEl && !filtered) {
      const t = termKeyParts(termEl.dataset.term);
      if (pending && !(pending.item === t.item && pending.term === t.term)) {
        const from = pending;
        pending = null;
        connect(from, t);
        return;
      }
      drag = { type: "wire", from: t, sx: e.clientX, sy: e.clientY, moved: false, wasPending: !!pending };
      pending = null;
      svg.setPointerCapture(e.pointerId);
      renderCanvas();
      return;
    }
    if (pending) { pending = null; setHint(""); }

    if (connEl || busEl || cableEl) {
      const id = connEl ? connEl.dataset.conn : busEl ? busEl.dataset.bus : cableEl.dataset.cable;
      if (e.shiftKey) { sel.has(id) ? sel.delete(id) : sel.add(id); } else sel = new Set([id]);
      refresh();
      return;
    }

    if (itemEl) {
      const id = itemEl.dataset.item;
      let clickedSelected = false;
      if (e.shiftKey) {
        if (sel.has(id)) { sel.delete(id); refresh(); return; }
        sel.add(id);
      } else if (!sel.has(id)) sel = new Set([id]);
      else clickedSelected = true;
      let moving = new Set([...sel].filter((s) => itemById(s)));
      for (const s of [...moving]) {
        const it = itemById(s);
        if (it.kind === "rail") for (const m of mountedOn(it)) moving.add(m.id);
      }
      moving = withGroupNotes(moving);
      const orig = new Map();
      for (const s of moving) { const it = itemById(s); orig.set(s, { x: it.x, y: it.y }); }
      // Everything's starting position, for pushing neighbours along with Ctrl held.
      const all = new Map(pageItems().map((it) => [it.id, { x: it.x, y: it.y }]));
      drag = { type: "move", primary: id, start: w, sx: e.clientX, sy: e.clientY, orig, all, moving, moved: false, clickedSelected, cables: cableAnchors() };
      svg.setPointerCapture(e.pointerId);
      refresh();
      return;
    }

    if (e.shiftKey) drag = { type: "marquee", start: w, cur: w, base: new Set(sel) };
    else drag = { type: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
    svg.setPointerCapture(e.pointerId);
  });

  svg.addEventListener("pointermove", (e) => {
    const w = toWorld(e);
    mouse = { x: w.x, y: w.y };
    if (!drag) {
      const t = e.target.closest && e.target.closest("[data-term]");
      if (busEdit) return;
      if (tool === "measure") {
        measureHover = measureSnap(w, e.altKey);
        setHint(measure ? `${measureText(measure).main} — click to clear, or drag to measure again` : MEASURE_TIP);
        renderOverlay();
        return;
      }
      if (pending) {
        setHint(t ? `Connect ${refOf(pending)}${pageNote(pending.item)} to ${refOf(termKeyParts(t.dataset.term))}` : `Wiring from ${refOf(pending)}${pageNote(pending.item)} — click another terminal, on this page or another (Esc to cancel)`);
        renderOverlay();
      } else if (t) {
        const k = termKeyParts(t.dataset.term);
        const count = doc.connections.filter((c) => [c.a, c.b].some((x) => x.item === k.item && x.term === k.term)).length;
        const hit = itemById(k.item);
        const label = String(hit?.termLabels?.[k.term] || "").trim();
        const desc = String((hit && tplOf(hit)?.terminals.find((x) => x.id === k.term)?.desc) || "").trim();
        const what = tool === "select" ? (attachedTo(k).length ? "click to select what's on it" : "nothing on it") : "drag to another terminal to wire it";
        setHint(`${refOf(k)}${desc ? ` · ${desc}` : ""}${label ? ` · ${label}` : ""}${count ? ` · ${count} wire${count > 1 ? "s" : ""}` : ""} — ${what}`);
      } else setHint("");
      return;
    }
    if (drag.type === "pan") {
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) < 3) return;
      drag.moved = true;
      svg.classList.add("panning");
      view.x = drag.vx - dx / view.scale;
      view.y = drag.vy - dy / view.scale;
      applyView();
      renderOverlay();
    } else if (drag.type === "move") {
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 3) return;
      if (!drag.moved) { checkpoint(); drag.moved = true; }
      const prim = itemById(drag.primary);
      const o = drag.orig.get(drag.primary);
      let rx = w.x - drag.start.x, ry = w.y - drag.start.y;
      // Ctrl (or Cmd): move straight along the main direction and push everything beyond the selection
      // in that direction along with it, e.g. to open a gap in a terminal strip.
      const push = e.ctrlKey || e.metaKey;
      const axis = push ? (Math.abs(rx) >= Math.abs(ry) ? "x" : "y") : null;
      if (axis === "x") ry = 0; else if (axis === "y") rx = 0;
      const pushed = axis ? pushedItems(drag, axis, Math.sign(axis === "x" ? rx : ry)) : new Set();
      let dx, dy;
      if (axis) {
        // The whole moving group (selection plus what it pushes) snaps against what stays behind.
        const dv = groupSnap(drag, new Set([...drag.orig.keys(), ...pushed]), axis, axis === "x" ? rx : ry, e.altKey);
        dx = axis === "x" ? dv : 0;
        dy = axis === "y" ? dv : 0;
      } else {
        const p = snapPosition(prim, o.x + rx, o.y + ry, drag.moving, null, e.altKey);
        dx = p.x - o.x;
        dy = p.y - o.y;
      }
      for (const [id, q] of drag.all) {
        const it = itemById(id);
        if (!it) continue;
        const go = drag.orig.has(id) || pushed.has(id);
        it.x = go ? r3(q.x + dx) : q.x;
        it.y = go ? r3(q.y + dy) : q.y;
      }
      followCables(drag.cables);
      setHint(axis ? (pushed.size ? `Pushing ${pushed.size} touching item${pushed.size === 1 ? "" : "s"} ${{ x: rx > 0 ? "right" : "left", y: ry > 0 ? "down" : "up" }[axis]} along with the selection` : "Nothing touching the selection on that side to push") : "");
      renderCanvas();
    } else if (drag.type === "bracket") {
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 3) return;
      const note = itemById(drag.id), ls = note ? noteLinks(note) : [];
      if (!ls.length) return;
      if (!drag.moved) { checkpoint(); drag.moved = true; }
      // How far out past the items' edge on the bracket's side the mouse is, in half millimetres.
      const g = groupBox(ls.map(boxOf)), side = bracketSide(note, g);
      const out = { top: g.y - w.y, bottom: w.y - g.y - g.h, left: g.x - w.x, right: w.x - g.x - g.w }[side];
      note.gap = Math.max(0, Math.round(out * 2) / 2);
      setHint(`Bracket ${note.gap} mm from the items`);
      renderCanvas();
    } else if (drag.type === "cablept") {
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 3) return;
      const cb = cableById(drag.id);
      if (!cb) return;
      if (!drag.moved) { checkpoint(); drag.moved = true; }
      const g = doc.settings.grid || 0;
      const gs = (v) => (g > 0 && !e.altKey ? Math.round(v / g) * g : r3(v));
      cb[drag.end.length > 1 ? drag.end : "p" + drag.end] = { x: gs(w.x), y: gs(w.y) }; // pa / pb, or a tail end ta / tb
      renderCanvas();
    } else if (drag.type === "wire") {
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 3) drag.moved = true;
      const t = e.target.closest && document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-term]");
      setHint(t && drag.moved ? `Connect ${refOf(drag.from)} to ${refOf(termKeyParts(t.dataset.term))}` : `Wiring from ${refOf(drag.from)}`);
      renderOverlay();
    } else if (drag.type === "marquee") {
      drag.cur = w;
      renderOverlay();
    } else if (drag.type === "measure") {
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 3) return;
      drag.moved = true;
      measure.b = measureEnd(measure.a, w, e);
      const t = measureText(measure);
      setHint(t.main + (t.parts ? ` · ${t.parts}` : ""));
      renderOverlay();
    } else if (drag.type === "bussweep") {
      const t = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-term]");
      if (t) toggleBusTerm(t.dataset.term, true);
    }
  });

  svg.addEventListener("pointerup", (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    svg.classList.remove("panning");
    if (d.type === "pan") {
      if (!d.moved && !d.keepSel) { sel.clear(); refresh(); }
    } else if (d.type === "cablept") {
      if (d.moved) refresh();
    } else if (d.type === "bracket") {
      setHint("");
      if (d.moved) refresh();
    } else if (d.type === "measure") {
      // A click without a drag clears the measurement.
      if (!d.moved) { measure = null; setHint(MEASURE_TIP); }
    } else if (d.type === "move") {
      setHint("");
      if (d.moved) refresh();
      else if (d.clickedSelected && sel.size > 1) { sel = new Set([d.primary]); refresh(); }
    } else if (d.type === "wire") {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const t = el && el.closest && el.closest("[data-term]");
      const k = t && termKeyParts(t.dataset.term);
      if (k && !(k.item === d.from.item && k.term === d.from.term)) connect(d.from, k);
      else if (!d.moved && !d.wasPending) {
        pending = d.from;
        setHint(`Wiring from ${refOf(pending)} — click another terminal (Esc to cancel)`);
      } else setHint("");
      renderCanvas();
    } else if (d.type === "marquee") {
      const x1 = Math.min(d.start.x, d.cur.x), x2 = Math.max(d.start.x, d.cur.x);
      const y1 = Math.min(d.start.y, d.cur.y), y2 = Math.max(d.start.y, d.cur.y);
      sel = new Set(d.base);
      for (const it of pageItems()) {
        if (!allows(it.kind)) continue;
        const b = boxOf(it);
        if (b.x < x2 && b.x + b.w > x1 && b.y < y2 && b.y + b.h > y1) sel.add(it.id);
      }
      if (selFilter) {
        // Filtered boxes also pick wires, bus bars and cables with an end in the box.
        const inBox = (e) => { const p = endHere(e) && termPoint(e); return !!p && p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2; };
        const wireIn = (c) => !!c && [c.a, c.b].some(inBox);
        if (allows("wire")) for (const c of doc.connections) if ((!hiddenWires || !hiddenWires.has(c.id)) && wireIn(c)) sel.add(c.id);
        if (allows("bus")) for (const b of doc.buses) if (b.terms.some(inBox)) sel.add(b.id);
        if (allows("cable")) for (const cb of doc.cables) if (cablePlugs(cb).some(inBox) || cb.wires.some((id) => wireIn(connById(id)))) sel.add(cb.id);
      }
      refresh();
    }
    renderOverlay();
  });

  svg.addEventListener("pointerleave", () => {
    if (measureHover) { measureHover = null; renderOverlay(); }
    if (!drag && !pending && !busEdit) setHint("");
  });

  svg.addEventListener("dblclick", (e) => {
    const itemEl = e.target.closest("[data-item]");
    const connEl = e.target.closest("[data-conn]");
    if (connEl) focusProp("wire");
    else if (itemEl) {
      const it = itemById(itemEl.dataset.item);
      if (it && it.kind === "part") focusProp("tag");
      if (it && it.kind === "text") focusProp("text");
    }
  });

  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    zoomAt(Math.exp(-delta * 0.0015), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  // ---------- right-click menu ----------
  const ctx = $("ctxMenu");
  let ctxItems = [];

  function hideCtx() {
    closeSub();
    if (ctx.hidden) return;
    ctx.hidden = true;
    ctxItems = [];
  }

  // A submenu: an entry with sub (a list of entries) opens it beside itself, on hover, click or →.
  const ctxSub = document.createElement("div");
  ctxSub.className = "ctx-menu ctx-sub";
  ctxSub.setAttribute("role", "menu");
  ctxSub.hidden = true;
  document.body.appendChild(ctxSub);
  let subItems = [], subOf = -1;

  // Entries without empty ones or doubled, leading or trailing dividers.
  const tidyCtx = (entries) => entries.filter(Boolean).filter((e, i, a) => e !== "-" || (i > 0 && a[i - 1] !== "-" && i < a.length - 1));
  function ctxHtml(list) {
    return list.map((e, i) => {
      if (e === "-") return '<div class="ctx-sep"></div>';
      if (e.heading) return `<div class="ctx-head">${esc(e.heading)}</div>`;
      if (e.sub) return `<button role="menuitem" aria-haspopup="true" data-i="${i}" class="has-sub"${e.disabled || !e.sub.length ? " disabled" : ""}><span>${esc(e.label)}</span><span class="sub-arrow">›</span></button>`;
      return `<button role="menuitem" data-i="${i}"${e.disabled ? " disabled" : ""} class="${e.danger ? "danger" : ""}${e.checked ? " checked" : ""}"><span>${esc(e.label)}</span>${e.hint ? `<kbd>${esc(e.hint)}</kbd>` : ""}</button>`;
    }).join("");
  }

  function openSub(i, focus) {
    const e = ctxItems[i];
    if (!e || !e.sub) return;
    if (subOf !== i) {
      subOf = i;
      subItems = tidyCtx(e.sub);
      ctxSub.innerHTML = ctxHtml(subItems);
      ctxSub.hidden = false;
      // Beside its entry, on the right if there's room, else on the left.
      const b = ctx.querySelector(`[data-i="${i}"]`).getBoundingClientRect(), r = ctxSub.getBoundingClientRect();
      ctxSub.style.left = (b.right + r.width + 4 <= innerWidth ? b.right + 2 : Math.max(4, b.left - r.width - 2)) + "px";
      ctxSub.style.top = Math.max(4, Math.min(b.top - 5, innerHeight - r.height - 4)) + "px";
      for (const x of ctx.querySelectorAll(".has-sub")) x.classList.toggle("open", +x.dataset.i === i);
    }
    if (focus) ctxSub.querySelector("button:not([disabled])")?.focus();
  }

  function closeSub() {
    if (subOf < 0) return;
    ctxSub.hidden = true;
    subOf = -1;
    subItems = [];
    for (const x of ctx.querySelectorAll(".has-sub.open")) x.classList.remove("open");
  }

  // entries: { label, run, hint?, danger?, disabled?, checked? }, "-" for a divider, or { heading }.
  function showCtx(x, y, entries) {
    closeSub();
    const list = tidyCtx(entries);
    ctxItems = list;
    ctx.innerHTML = ctxHtml(list);
    ctx.hidden = false;
    const r = ctx.getBoundingClientRect();
    ctx.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 4)) + "px";
    ctx.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + "px";
    // The menu takes the keyboard, with no entry picked until the mouse or ↓ ↑ picks one.
    ctx.focus({ preventScroll: true });
  }

  ctx.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-i]");
    if (!b) return;
    const entry = ctxItems[+b.dataset.i];
    // Opened from the keyboard (Enter, a click with no mouse), a submenu picks its first entry.
    if (entry && entry.sub) { openSub(+b.dataset.i, e.detail === 0); return; }
    hideCtx();
    entry && entry.run && entry.run();
  });
  ctxSub.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-i]");
    if (!b) return;
    const entry = subItems[+b.dataset.i];
    hideCtx();
    entry && entry.run && entry.run();
  });
  // Hovering an entry opens its submenu, or closes the one open.
  ctx.addEventListener("mouseover", (e) => {
    const b = e.target.closest("button[data-i]");
    if (!b || b.disabled) return;
    if (ctxItems[+b.dataset.i]?.sub) openSub(+b.dataset.i); else closeSub();
  });
  const arrowKeys = (menu, e) => {
    const btns = [...menu.querySelectorAll("button:not([disabled])")];
    const i = btns.indexOf(document.activeElement);
    e.preventDefault();
    btns[(i + (e.key === "ArrowDown" ? 1 : -1) + btns.length) % btns.length]?.focus();
  };
  ctx.addEventListener("keydown", (e) => {
    const b = document.activeElement?.closest?.("button[data-i]");
    if (e.key === "ArrowDown" || e.key === "ArrowUp") arrowKeys(ctx, e);
    else if (e.key === "ArrowRight" && b && ctxItems[+b.dataset.i]?.sub) { e.preventDefault(); openSub(+b.dataset.i, true); }
    else if (e.key === "Escape") { e.stopPropagation(); hideCtx(); }
  });
  ctxSub.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "ArrowDown" || e.key === "ArrowUp") arrowKeys(ctxSub, e);
    else if (e.key === "ArrowLeft" || e.key === "Escape") {
      e.preventDefault();
      const i = subOf;
      closeSub();
      ctx.querySelector(`[data-i="${i}"]`)?.focus();
    } else if (e.key === "Tab") hideCtx();
  });
  ctx.addEventListener("contextmenu", (e) => e.preventDefault());
  ctxSub.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("pointerdown", (e) => { if (!ctx.contains(e.target) && !ctxSub.contains(e.target)) hideCtx(); }, true);
  window.addEventListener("blur", hideCtx);
  window.addEventListener("resize", hideCtx);
  svg.addEventListener("wheel", hideCtx, { passive: true });

  const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";

  function profileEntries(conns) {
    if (!doc.wireProfiles.length) return [];
    const cur = new Set(conns.map((c) => c.profile || ""));
    return [{ label: "Wire profile", sub: tidyCtx([...offered(doc.wireProfiles, cur).map((p) => ({
      label: p.name, checked: cur.size === 1 && cur.has(p.id),
      run: () => { checkpoint(); assignProfile(conns, p.id); refresh(); },
    })), "-", unfaved(doc.wireProfiles) && { label: "All wire profiles…", run: () => openProfPick("wire", conns.map((c) => c.id)) }]) }];
  }

  // What a named circuit's wire labels show unless a wire says otherwise: "name" or "dest".
  function circuitShows(name) {
    return doc.circuitLabels[netKey(name)] || (doc.settings.labelName === "circuit" ? "name" : "dest");
  }

  // The panel's per-wire label choice, for the wires in ws that are in named circuits.
  function labelShowField(ws) {
    const names = circuitNames(doc).conn;
    const named = ws.filter((c) => names.get(c.id));
    if (!named.length) return "";
    const one = named.length === 1;
    const shows = new Set(named.map((c) => circuitShows(names.get(c.id))));
    const follows = shows.size === 1 ? ` (${shows.has("name") ? "circuit name" : "where it goes"})` : "";
    const cur = same(named, (c) => c.labelShow || "");
    const opts = [["", (one ? "As for the circuit" : "As for their circuits") + follows], ["name", "Circuit name"], ["dest", one ? "Where it goes" : "Where each goes"]];
    return field(one ? "This wire's label shows" : `Labels show · ${plural(named.length, "wire")} in named circuits`,
      `<select data-wlabel title="What the wire's own labels show, overriding its circuit">${mixedOpt(cur)}${opts.map(([v, l]) => `<option value="${v}"${cur === v ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`);
  }

  // How a wire or cable is drawn (its draw value): as the drawing says, whole, or broken into a tail at
  // each end. Wires in cables are drawn by their cable, and a cable running to a free end can't break.
  function drawOpts(kind) {
    return kind === "cable"
      ? [["", `Default (${doc.settings.cables === "break" ? "broken" : "full length"})`], ["full", "Full length"], ["break", "Broken: a tail at each end"]]
      : [["", `Default (${{ off: "stubs", straight: "straight lines", curved: "curved lines" }[doc.settings.lines] || "a line"})`], ["straight", "Straight line"], ["curved", "Curved line"], ["break", "Broken: a stub at each end"]];
  }
  const breakable = (cb) => !cb.open || !!cb.portB;

  function drawEntries(list, kind) {
    if (!list.length) return [];
    const cur = new Set(list.map((x) => x.draw || ""));
    return [{ label: kind === "cable" ? "Draw cable" : "Draw wire", sub: drawOpts(kind).map(([v, l]) => ({
      label: l, checked: cur.size === 1 && cur.has(v),
      run: () => { checkpoint(); for (const x of list) if (v) x.draw = v; else delete x.draw; refresh(); },
    })) }];
  }

  // Per-wire label choice for wires in named circuits: as for the circuit, its name, or where the wire goes.
  function labelEntries(conns) {
    const names = circuitNames(doc).conn;
    const named = conns.filter((c) => names.get(c.id));
    if (!named.length) return [];
    const cur = new Set(named.map((c) => c.labelShow || ""));
    const set = (v) => () => { checkpoint(); for (const c of named) if (v) c.labelShow = v; else delete c.labelShow; refresh(); };
    return [{ label: "Label shows", sub: [["", "As for the circuit"], ["name", "Circuit name"], ["dest", "Where it goes"]].map(([v, l]) => ({
      label: l, checked: cur.size === 1 && cur.has(v), run: set(v),
    })) }];
  }

  function cableProfileEntries(cb) {
    return [{ label: "Cable profile", sub: tidyCtx([...offered(doc.cableProfiles, new Set([cb.profile])).map((p) => ({
      label: p.name, checked: cb.profile === p.id,
      run: () => { checkpoint(); applyCableProfile(cb, p); applyCableCores(cb, "all"); refresh(); },
    })), "-", unfaved(doc.cableProfiles) && { label: "All cable profiles…", run: () => openProfPick("cable", [cb.id]) },
    { label: "From the cable library…", run: () => openCableLib([cb.id]) }]) }];
  }

  function partEntries(it, term) {
    const tpl = tplOf(it);
    const ref = term && refOf(term);
    const out = [];
    if (term && isPortEnd(term)) {
      const cb = cableAtPort(term);
      out.push({ heading: `${ref} · cable connector` }, ...(cb
        ? [{ label: `Select cable ${cb.label || ""}`.trim(), run: () => { sel = new Set([cb.id]); refresh(); } }, { label: "Unplug the cable", run: () => unplug(cb, term) }]
        : [{ label: "Plug in a cable…", run: () => startCable(null, term.item + "|" + term.term) }]), "-");
    } else if (term) {
      out.push({ heading: ref },
        { label: "Start a wire here", run: () => { pending = term; setHint(`Wiring from ${ref} — click another terminal (Esc to cancel)`); renderCanvas(); } },
        { label: "Connector label…", run: () => {
          sel = new Set([it.id]);
          refresh();
          focusField($("props").querySelector(`[data-tl="${CSS.escape(term.term)}"]`));
        } },
        { label: "Bus bar from here…", run: () => { startBus(null); toggleBusTerm(term.item + "|" + term.term); } },
        { label: "Cable from here…", run: () => startCable(null, term.item + "|" + term.term) },
        "-");
    }
    out.push(
      { label: "Edit object type…", run: () => editTemplate(tpl, false) },
      "-",
      { label: "Duplicate", hint: mod + "D", run: duplicateSelection },
      { label: "Copy", hint: mod + "C", run: copySelection },
      { label: `Repeat once ${rtl() ? "to the left" : "to the right"}`, run: () => repeatSideways(it.id, 1) },
      { label: "Rotate right", hint: "R", run: () => rotateSelection(1) },
      { label: "Rotate left", hint: "Shift+R", run: () => rotateSelection(-1) },
      { label: "Group note", run: addGroupNote },
      "-",
      { label: `Select all ${tpl.name}`, run: () => selectSameType(it) },
    );
    if (tagPrefix(it.tag)) out.push({ label: `Select all “${tagPrefix(it.tag)}…”`, run: () => selectSamePrefix(it) });
    if (!term) out.push({ label: "New bus bar…", run: () => startBus(null) });
    out.push(...moveToPageEntries());
    out.push("-", { label: "Delete", hint: "Del", danger: true, run: deleteSelection });
    return out;
  }

  function ctxEntries(e) {
    const termEl = e.target.closest("[data-term]");
    const connEl = e.target.closest("[data-conn]");
    const busEl = e.target.closest("[data-bus]");
    const cableEl = e.target.closest("[data-cable], [data-cable-handle]");
    const itemEl = e.target.closest("[data-item]");
    const cableId = cableEl && (cableEl.dataset.cable || cableEl.dataset.cableHandle.split("|")[0]);
    const id = termEl ? termKeyParts(termEl.dataset.term).item : connEl ? connEl.dataset.conn : busEl ? busEl.dataset.bus : cableId || (itemEl && itemEl.dataset.item);
    if (!id) {
      sel.clear();
      refresh();
      const at = { ...mouse };
      return [
        { heading: "Add" },
        { label: "DIN rail here", run: () => addRail(at) },
        { label: "Text note here", run: () => addText(at) },
        { label: "Bus bar…", run: () => startBus(null) },
        { label: "Cable…", run: () => startCable(null) },
        "-",
        { label: "Paste here", hint: mod + "V", disabled: !(clipboard && clipboard.items.length), run: paste },
        ...(hiddenWires ? ["-", { label: "Show all wires", run: showAllWires }] : []),
        "-",
        { label: "Undo", hint: mod + "Z", disabled: !undoStack.length, run: undo },
        { label: "Redo", hint: mod + "Y", disabled: !redoStack.length, run: redo },
        "-",
        { label: "Select all", hint: mod + "A", disabled: !pageItems().length, run: () => { sel = new Set(pageItems().map((i) => i.id)); refresh(); } },
        "-",
        { label: "Add a page", run: addPage },
        { label: "Fit to window", hint: "F", run: fit },
      ];
    }
    // Right-clicking something outside the selection selects it; inside, the whole selection is kept.
    if (!sel.has(id)) { sel = new Set([id]); refresh(); }
    const wires = [...sel].map(connById).filter(Boolean);
    const bars = [...sel].map(busById).filter(Boolean);
    const cbs = [...sel].map(cableById).filter(Boolean);
    const items = [...sel].map(itemById).filter(Boolean);
    if (sel.size > 1) {
      const out = [{ heading: `${sel.size} selected` }];
      if (wires.length && cbs.length === 1 && !cbs[0].open) out.push({ label: `Add wires to ${cbs[0].label || "cable"}`, run: () => bundleWires(wires.map((c) => c.id), cbs[0].id) });
      else if (wires.length > 1 && !cbs.length) out.push({ label: "Bundle into a cable", run: () => bundleWires(wires.map((c) => c.id)) });
      if (items.length) {
        out.push({ label: "Duplicate", hint: mod + "D", run: duplicateSelection }, { label: "Copy", hint: mod + "C", run: copySelection },
          { label: "Rotate right", hint: "R", run: () => rotateSelection(1) }, { label: "Rotate left", hint: "Shift+R", run: () => rotateSelection(-1) });
        if (canLinkNote(items)) out.push({ label: "Link note to the selected items", run: linkNote });
        else if (!items.some((i) => i.kind === "text")) out.push({ label: "Group note", run: addGroupNote });
        if (items.filter((i) => i.kind !== "text").length > 1) {
          out.push({ label: "Align", sub: [{ label: "Pack side by side", run: () => alignSelection("pack") }, { label: "Align middles", run: () => alignSelection("middle") },
            { label: "Align tops", run: () => alignSelection("top") }, { label: "Align bottoms", run: () => alignSelection("bottom") }] });
        }
      }
      if (items.length) out.push(...moveToPageEntries());
      if (wires.length || bars.length) out.push("-", ...circuitMenu([...wires, ...bars].map((x) => x.id)));
      if (wires.length || cbs.length) out.push({ label: "Show only these wires", run: () => showOnlyWires(selectedWireIds()) });
      out.push("-");
      if (wires.length) out.push(...drawEntries(wires.filter((c) => !cableOf(c.id)), "wire"), ...labelEntries(wires), ...profileEntries(wires));
      out.push(...drawEntries(cbs.filter(breakable), "cable"));
      out.push("-", { label: `Delete ${sel.size} items`, hint: "Del", danger: true, run: deleteSelection });
      return out;
    }
    if (wires.length) {
      const c = wires[0];
      // The end clicked: the one whose label was right-clicked, else the nearer one. Of the other end, the menu
      // only offers to go to it.
      const at = connEl && connEl.dataset.conn === c.id ? connEl.dataset.at : "";
      const ends = ["a", "b"].filter((k) => termPoint(c[k]));
      const here = ends.find((k) => c[k].item + "|" + c[k].term === at) || nearest(ends, (k) => endHere(c[k]) && termPoint(c[k]));
      const there = ends.find((k) => k !== here);
      return [
        { heading: `Wire ${c.wire || ""}`.trim() },
        here ? { label: `Move end at ${refOf(c[here])}…`, run: () => startReland(c.id, here) } : null,
        there ? { label: `Go to other end (${refOf(c[there])}${pageNote(c[there].item)})`, run: () => goTo(c[there].item, termPoint(c[there])) } : null,
        ...circuitMenu([c.id]),
        { label: "Show only this wire", run: () => showOnlyWires([c.id]) },
        { label: "Swap ends", run: () => swapEnds(c) },
        cableOf(c.id) ? (cableOf(c.id).open || cableSide(c, cableOf(c.id)) ? null
          : { label: `Take out of cable ${cableOf(c.id).label || ""}`.trim(), run: () => removeFromCable(c.id) }) : { label: "Bundle into a cable", run: () => bundleWires([c.id]) },
        "-",
        ...drawEntries(cableOf(c.id) ? [] : [c], "wire"),
        ...labelEntries([c]),
        ...profileEntries([c]),
        "-",
        { label: "Delete wire", hint: "Del", danger: true, run: deleteSelection },
      ];
    }
    if (cbs.length) {
      const cb = cbs[0];
      const ends = cableEndInfo(cb), pts = cableEndPoints(cb);
      // A part each end is on (a connector or a terminal), for which page it's on.
      const endItem = ends.map((x) => (x.kind === "plug" ? x.port?.item : x.kind === "fan" ? x.terms[0]?.item : null));
      // The end clicked: the one whose fan-out dot was right-clicked, else the nearer one on this page. Of
      // the other end, the menu only offers to go to it.
      const handle = cableEl && cableEl.dataset.cableHandle;
      const i = handle ? (handle.endsWith("b") ? 1 : 0) : nearest([0, 1], (j) => (!endItem[j] || onPage(itemById(endItem[j])) ? pts[j] : null)) ?? 0;
      const end = i ? "B" : "A", other = i ? "A" : "B";
      const endMenu = (e, j) => ["-", { label: `End ${e}: ${endText(ends[j], cb)}`, sub: endActions(cb, e).map(([act, label]) => ({ label, run: () => runEndAction(cb, e, act) })) }];
      // A free end isn't connected to anything, so there's nothing to go to: what can be done with it is
      // shown as well, the clicked end first.
      const free = ends.some((x) => x.kind === "free");
      return [
        { heading: `Cable ${cb.label || ""}`.trim() },
        cb.wires.length ? { label: cb.open ? "Select its cores" : "Select its wires", run: () => { sel = new Set(cb.wires); refresh(); } } : null,
        cb.wires.length ? { label: cb.open ? "Show only its cores" : "Show only its wires", run: () => showOnlyWires(cb.wires) } : null,
        { label: cb.open ? "Reset layout" : "Reset fan-out points", disabled: !hasLayout(cb), run: () => { checkpoint(); resetLayout(cb); refresh(); } },
        ...endMenu(end, i),
        ...(free ? endMenu(other, 1 - i)
          : [pts[1 - i] ? { label: `Go to end ${other} (${endText(ends[1 - i], cb)}${pageNote(endItem[1 - i])})`, run: () => goTo(endItem[1 - i], pts[1 - i]) } : null]),
        "-",
        ...drawEntries(breakable(cb) ? [cb] : [], "cable"),
        ...cableProfileEntries(cb),
        "-",
        cb.open ? null : { label: "Unbundle (keep wires)", hint: "Del", run: () => unbundle(cb) },
        { label: cb.open ? "Delete cable" : "Delete cable and wires", hint: cb.open ? "Del" : undefined, danger: true, run: () => deleteCableAndWires(cb) },
      ];
    }
    if (bars.length) {
      const b = bars[0];
      return [
        { heading: `Bus bar ${b.label || ""}`.trim() },
        { label: "Edit terminals…", run: () => startBus(b.id) },
        ...circuitMenu([b.id]),
        "-",
        { label: "Delete bus bar", hint: "Del", danger: true, run: deleteSelection },
      ];
    }
    const it = items[0];
    if (it.kind === "rail") {
      return [
        { heading: "DIN rail" },
        { label: "Fit to parts", run: () => fitRail(it) },
        { label: "Duplicate", hint: mod + "D", run: duplicateSelection },
        { label: "Copy", hint: mod + "C", run: copySelection },
        ...moveToPageEntries(),
        "-",
        { label: "Delete rail", hint: "Del", danger: true, run: deleteSelection },
      ];
    }
    if (it.kind === "text") {
      return [
        { heading: "Text note" },
        { label: "Edit text", run: () => focusProp("text") },
        { label: "Rotate right", hint: "R", run: () => rotateSelection(1) },
        { label: "Rotate left", hint: "Shift+R", run: () => rotateSelection(-1) },
        ...(noteLinks(it).length ? [{ label: `Select its ${plural(noteLinks(it).length, "item")}`, run: () => { sel = new Set(noteLinks(it).map((x) => x.id)); refresh(); } },
          { label: "Unlink from its items", run: () => { checkpoint(); delete it.links; refresh(); } }] : []),
        { label: "Duplicate", hint: mod + "D", run: duplicateSelection },
        { label: "Copy", hint: mod + "C", run: copySelection },
        ...moveToPageEntries(),
        "-",
        { label: "Delete note", hint: "Del", danger: true, run: deleteSelection },
      ];
    }
    return partEntries(it, termEl && termKeyParts(termEl.dataset.term));
  }

  svg.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (drag) return;
    mouse = toWorld(e);
    if (busEdit) {
      showCtx(e.clientX, e.clientY, [
        { heading: busEdit.reland ? "Wire" : busEdit.kind === "cable" ? "Cable" : "Bus bar" },
        { label: "Done", hint: "Enter", disabled: !busReady(), run: finishBus },
        busEdit.kind !== "bus" ? null : { label: "Keep 1st, 3rd…", disabled: busEdit.terms.length < 3, run: () => alternateBus(0) },
        busEdit.kind !== "bus" ? null : { label: "Keep 2nd, 4th…", disabled: busEdit.terms.length < 3, run: () => alternateBus(1) },
        { label: "Cancel", hint: "Esc", run: cancelBus },
      ]);
      return;
    }
    if (pending) { pending = null; setHint(""); }
    showCtx(e.clientX, e.clientY, ctxEntries(e));
  });

  // ---------- keyboard ----------
  document.addEventListener("keydown", (e) => {
    if (!ctx.hidden) { if (e.key === "Escape" || e.key === "Tab") hideCtx(); return; } // the menu has the keyboard
    if (openMenu() && e.key === "Escape") { closeMenus(); return; }
    if (!$("tplModal").hidden) return; // the designer has its own keys
    if (!$("joinModal").hidden) {
      // Enter joins, Esc doesn't; a held-down Enter (e.g. the one that finished a bus bar) doesn't count.
      if (e.key === "Escape") joinAnswer?.(null);
      else if (e.key === "Enter" && !e.repeat) { e.preventDefault(); $("joinModal").querySelector('[data-join="ok"]').click(); }
      return;
    }
    if (DIALOGS.some((id) => !$(id).hidden)) {
      if (e.key === "Escape") for (const id of DIALOGS) $(id).hidden = true;
      return;
    }
    const inField = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); if (e.shiftKey) saveFileAs(); else saveFile(); return; }
    if (mod && e.key.toLowerCase() === "o") { e.preventDefault(); $("fileInput").click(); return; }
    if (mod && e.key.toLowerCase() === "p") { e.preventDefault(); openPrint(); return; }
    if (mod && e.key.toLowerCase() === "f") { e.preventDefault(); findInLists(); return; }
    if (inField) return;
    const k = e.key;
    if (busEdit) {
      if (k === "Enter") { e.preventDefault(); finishBus(); }
      else if (k === "Escape") cancelBus();
      return;
    }
    if (mod && k.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (mod && (k.toLowerCase() === "y" || (k.toLowerCase() === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
    else if (mod && k.toLowerCase() === "d") { e.preventDefault(); duplicateSelection(); }
    else if (mod && k.toLowerCase() === "c") { copySelection(); }
    else if (mod && k.toLowerCase() === "x") { e.preventDefault(); cutSelection(); }
    else if (mod && k.toLowerCase() === "v") { e.preventDefault(); paste(); }
    else if (mod && k.toLowerCase() === "a") { e.preventDefault(); sel = new Set(selectableAll()); refresh(); }
    else if (k === "Delete" || k === "Backspace") { e.preventDefault(); deleteSelection(); }
    else if (k === "Escape") {
      if (measure && !drag) { measure = null; setHint(""); renderOverlay(); }
      else if (pending) { pending = null; setHint(""); renderCanvas(); }
      else if (selFilter) setSelFilter(null); // keeps what was selected with it
      else if (sel.size) { sel.clear(); refresh(); }
    }
    else if ((k === "v" || k === "V") && !mod) setTool("select");
    else if ((k === "w" || k === "W") && !mod) setTool("wire");
    else if ((k === "m" || k === "M") && !mod) setTool("measure");
    else if (k === "r" || k === "R") rotateSelection(e.shiftKey ? -1 : 1);
    else if ((k === "f" || k === "F") && !mod) fit();
    else if (k === "?") openHelp();
    else if (k === " ") {
      if (selFilter && !e.repeat) setSelFilter(null);
      spaceDown = true;
      e.preventDefault();
    }
    else if (k.startsWith("Arrow") && sel.size) {
      e.preventDefault();
      const step = (doc.settings.grid || 1) * (e.shiftKey ? 10 : 1);
      const v = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[k];
      nudge(v[0], v[1]);
    }
  });
  document.addEventListener("keyup", (e) => { if (e.key === " ") spaceDown = false; });

  // ---------- inspector (right panel) ----------
  let propsCtx = { type: "project" };

  // With several things selected, a setting they don't share has the value MIXED: text and number boxes
  // are left empty, drop-downs show "(mixed)" and tick boxes are half-ticked until changed.
  const field = (label, input) => `<label class="field"><span>${label}</span>${input}</label>`;
  const inp = (k, v, type = "text", extra = "") => v === MIXED
    ? `<input data-k="${k}" type="${type}" value="" placeholder="Mixed" ${extra.replace(/placeholder="[^"]*"/, "")}>`
    : `<input data-k="${k}" type="${type}" value="${esc(v ?? "")}" ${extra}>`;
  const num = (k, v, step = 0.1, extra = "") => inp(k, v === undefined || v === MIXED ? v : r3(v), "number", `step="${step}" ${extra}`);
  const chk = (k, v, label) => `<label class="check"><input data-k="${k}" type="checkbox"${v === MIXED ? " data-mixed" : v ? " checked" : ""}> ${label}</label>`;
  const area = (k, v, rows = 2) => `<textarea data-k="${k}" rows="${rows}"${v === MIXED ? ' placeholder="Mixed"' : ""}>${v === MIXED ? "" : esc(v || "")}</textarea>`;
  const mixedOpt = (v) => (v === MIXED ? '<option value="__mixed" selected>(mixed)</option>' : "");
  const dirToggle = () => `<div class="seg" role="group" aria-label="Build direction">
      <button data-act="dir" data-dir="ltr" class="${rtl() ? "" : "on"}" title="New parts, repeats and packing go to the right">Left → right</button>
      <button data-act="dir" data-dir="rtl" class="${rtl() ? "on" : ""}" title="New parts, repeats and packing go to the left">Right → left</button>
    </div>`;
  const sel_ = (k, v, opts) => `<select data-k="${k}">${mixedOpt(v)}${opts.map(([val, lab]) => `<option value="${esc(val)}"${String(val) === String(v) ? " selected" : ""}>${esc(lab)}</option>`).join("")}</select>`;
  const body = (s) => `<div class="insp-body">${s}</div>`;
  const sepEl = '<span class="sep"></span>';

  // A quick-action icon button for the top of the inspector.
  const actBtn = (act, icon, title, extra = "") =>
    `<button class="icon-btn${act === "delete" || act === "cableDelete" ? " danger" : ""}" data-act="${act}" title="${esc(title)}" ${extra}>${ic(icon)}</button>`;

  // The top of the inspector: what kind of thing is selected, its name, a line about it, and quick actions.
  function head(kind, title, sub, acts = "") {
    return `<div class="insp-head"><div class="kind">${kind}</div><h3>${title}</h3>${sub ? `<p class="sub">${sub}</p>` : ""}${acts ? `<div class="insp-acts">${acts}</div>` : ""}</div>`;
  }

  // A foldable inspector section. Which ones are folded is remembered per browser, by key.
  function section(key, title, html, count) {
    const closed = ui.closedSecs.includes(key);
    return `<section class="sec${closed ? " closed" : ""}" data-sec="${esc(key)}">
      <button class="sec-head" data-sec-toggle="${esc(key)}" aria-expanded="${!closed}">${ic("chev-d", "sm")}<span>${title}</span>${count !== undefined ? `<span class="count">${count}</span>` : ""}</button>
      <div class="sec-body">${html}</div></section>`;
  }

  function toggleSection(key, open) {
    const closed = open === undefined ? !ui.closedSecs.includes(key) : !open;
    ui.closedSecs = ui.closedSecs.filter((k) => k !== key);
    if (closed) ui.closedSecs.push(key);
    saveUi();
    for (const s of $("props").querySelectorAll(`.sec[data-sec="${CSS.escape(key)}"]`)) {
      s.classList.toggle("closed", closed);
      s.querySelector(".sec-head").setAttribute("aria-expanded", String(!closed));
    }
  }

  function renderProps() {
    const el = $("props");
    const ids = [...sel];
    const before = propsCtx, top = el.scrollTop;
    let h = "";
    if (busEdit) {
      propsCtx = { type: "busEdit" };
      h = busEditProps();
    } else if (ids.length === 0) {
      propsCtx = { type: "project" };
      h = projectProps();
    } else if (ids.length === 1) {
      const it = itemById(ids[0]);
      const c = connById(ids[0]);
      const b = busById(ids[0]);
      const cb = cableById(ids[0]);
      if (c) { propsCtx = { type: "conn", id: c.id }; h = connProps(c); }
      else if (b) { propsCtx = { type: "bus", id: b.id }; h = busProps(b); }
      else if (cb) { propsCtx = { type: "cable", id: cb.id }; h = cableProps(cb); }
      else if (it.kind === "part") { propsCtx = { type: "item", id: it.id }; h = partProps(it); }
      else if (it.kind === "rail") { propsCtx = { type: "item", id: it.id }; h = railProps(it); }
      else { propsCtx = { type: "item", id: it.id }; h = textProps(it); }
    } else {
      propsCtx = { type: "multi" };
      h = multiProps(ids);
    }
    el.innerHTML = `<div class="props">${h}</div>`;
    for (const c of el.querySelectorAll("input[data-mixed]")) c.indeterminate = true; // ticked on some, not others
    // Re-rendering the same thing (after an edit) keeps the panel where it was scrolled to.
    if (before.type === propsCtx.type && before.id === propsCtx.id) el.scrollTop = top;
  }

  function busEditProps() {
    if (busEdit.land) return landingProps();
    if (busEdit.reland) {
      const c = connById(busEdit.reland.id), end = busEdit.reland.end;
      return head("Wire", esc(`Move an end of ${c?.wire || "the wire"}`), "Click the terminal this end of the wire goes to instead. Its other end stays where it is.") + `<div class="picked">
        ${c ? `<p>${colorChip(c.color, c.stripe)}${esc(refOf(c[end === "a" ? "b" : "a"]))} → <s class="muted">${esc(refOf(c[end]))}</s> → <span class="muted">…</span></p>` : ""}
        <div class="btn-row"><button data-act="busCancel">Cancel (Esc)</button></div></div>`;
    }
    const refs = busEdit.terms.map((k) => refOf(termKeyParts(k)));
    const cable = busEdit.kind === "cable";
    const cb = cable && busEdit.id && cableById(busEdit.id);
    const name = (cb && cb.label) || "cable";
    if (busEdit.plug) {
      return head("Cable", esc(`Plug in end ${busEdit.end} of ${name}`), "Click the cable connector (socket) this end plugs into.") + `<div class="picked">
        <div class="btn-row"><button data-act="busCancel">Cancel (Esc)</button></div></div>`;
    }
    if (busEdit.connect) {
      const c = connById(busEdit.connect), side = cableSide(c, cb);
      return head("Cable", esc(`Connect core ${coreNumbers(cb).get(busEdit.connect) || ""} of ${name}`), "Click the terminal this core goes to at the end of the cable it isn't connected at, so it's connected through.") + `<div class="picked">
        ${c && side ? `<p>${colorChip(c.color, c.stripe)}${esc(c.wire || "—")}: ${esc(refOf(c[side === "a" ? "b" : "a"]))} → <span class="muted">…</span></p>` : ""}
        <div class="btn-row"><button data-act="busCancel">Cancel (Esc)</button></div></div>`;
    }
    const title = cable ? (busEdit.fan && !busEdit.adding ? `Fan out end ${busEdit.end} of ${name}` : cb ? "Add cores to " + name : "New cable") : busEdit.id ? "Edit bus bar " + (busById(busEdit.id)?.label || "") : "New bus bar";
    const pc = cable && pickCores();
    const sub = pc
      ? "Click a terminal for each core you use. Each gets the next core shown at the top: pick another core there, or Skip to leave one spare. Change a terminal's core below; picking a core another terminal has swaps them."
      : busEdit.fan
      ? "Click the terminals the cable's cores land on at this end, in core order, or drag along a row."
      : cable
      ? "Click the terminals the cable's cores go to, in core order, or drag along a row, and any cable connector it plugs into. Its other end can be plugged in, fanned out or left free once it's made."
      : "Click terminals or bus bar slots (the small squares in the middle of terminal blocks) to add or remove them, or drag along a row to sweep them in.";
    const min = cable ? 1 : 2;
    const coreRows = pc && busEdit.terms.map((k) => `<tr><td>${esc(refOf(termKeyParts(k)))}</td><td><select class="core-pick" data-core-of="${esc(k)}" title="The core that lands on this terminal">${coreOptions(pc, busEdit.coreOf[k], (n) => pc.onCable.has(n))}</select></td><td class="x"><button class="icon-btn" data-unpick="${esc(k)}" title="Take this terminal off">${ic("x", "sm")}</button></td></tr>`).join("");
    const spare = pc && pc.defs.map((_, i) => i + 1).filter((n) => pc.free(n));
    return head(cable ? "Cable" : "Bus bar", esc(title), sub) + `<div class="picked">
      ${pc ? (refs.length ? `<p><b>${plural(refs.length, "core")}</b></p><table class="term-list">${coreRows}</table>` : '<p class="muted">No terminals picked yet.</p>')
        + (pc.onCable.size ? `<p class="hint-text">Already on the cable: ${plural(pc.onCable.size, "core")} (${[...pc.onCable].sort((a, b) => a - b).join(", ")}).</p>` : "")
        + `<p class="hint-text">${spare.length ? `Spare: ${spare.length === pc.defs.length ? "all its cores" : plural(spare.length, "core") + " (" + spare.join(", ") + ")"}.` : `All ${plural(pc.defs.length, "core")} of its profile are used.`}</p>`
      : refs.length ? `<p><b>${plural(refs.length, cable ? "core" : "terminal")}</b></p><p class="ref-list">${esc(refs.join(", "))}</p>` : '<p class="muted">No terminals picked yet.</p>'}
      ${!cable && refs.length > 2 ? `<div class="field"><span>Bridge every other one</span><div class="btn-row tight">
        <button class="small" data-act="busAlt0" title="Keep the 1st, 3rd, 5th… along the row">Keep 1st, 3rd…</button>
        <button class="small" data-act="busAlt1" title="Keep the 2nd, 4th, 6th… along the row">Keep 2nd, 4th…</button>
      </div></div>` : ""}
      <div class="btn-row">
        <button data-act="busDone" class="primary"${refs.length < min ? " disabled" : ""}>Done (Enter)</button>
        <button data-act="busCancel">Cancel (Esc)</button>
      </div></div>`;
  }

  // Landing a one-ended cable's other end: each core with the terminal picked for it so far.
  function landingProps() {
    if (busEdit.move) return moveEndProps();
    const cb = cableById(busEdit.id);
    const plan = landingPlan(), next = plan.find((k) => k.to === undefined);
    const rows = plan.map((k) => `<tr${k === next ? ' class="next"' : ""}><td>${colorChip(k.c.color, k.c.stripe)}${esc(k.c.wire || "—")}</td><td>${esc(refOf(k.near))} → ${k.to ? esc(refOf(k.to)) : k.to === null ? '<span class="nc">not connected</span>' : '<span class="muted">…</span>'}</td>
      <td class="x"><button class="small" data-land-skip="${esc(k.c.id)}" title="${k.to === null ? "Connect this core at this end after all" : "Leave this core not connected at this end"}">${k.to === null ? "Use" : "Skip"}</button></td></tr>`).join("");
    const sub = "Click the terminal each core goes to, in core order, or drag along a row. Skip a core to leave it not connected at this end. Click a picked terminal again to take it off. The cable then has both ends on the drawing.";
    const picked = plan.filter((k) => k.to).length, skipped = plan.filter((k) => k.to === null).length;
    return head("Cable", esc("Other end of " + (cb?.label || "cable")), sub) + `<div class="picked">
      <p><b>${picked} of ${plural(plan.length, "core")}</b>${skipped ? ` · ${skipped} not connected` : ""}</p>
      <table class="term-list">${rows}</table>
      <div class="btn-row">
        <button data-act="busDone" class="primary"${busReady() ? "" : " disabled"}>Done (Enter)</button>
        <button data-act="busCancel">Cancel (Esc)</button>
      </div></div>`;
  }

  // Moving an end of a cable: each core at that end with where it's moving to so far.
  function moveEndProps() {
    const cb = cableById(busEdit.id);
    const plan = landingPlan(), next = plan.find((k) => k.to === undefined);
    const rows = plan.map((k) => `<tr${k === next ? ' class="next"' : ""}><td>${colorChip(k.c.color, k.c.stripe)}${esc(k.c.wire || "—")}</td><td>${k.to ? `<s class="muted">${esc(refOf(k.from))}</s> → ${esc(refOf(k.to))}` : `${esc(refOf(k.from))}${k.to === null ? ' <span class="muted">(stays)</span>' : ' → <span class="muted">…</span>'}`}</td>
      <td class="x"><button class="small" data-land-skip="${esc(k.c.id)}" title="${k.to === null ? "Move this core after all" : "Leave this core where it is"}">${k.to === null ? "Move" : "Keep"}</button></td></tr>`).join("");
    const sub = "Click the terminal each core moves to, in core order, or drag along a row. Keep a core to leave it where it is; cores not picked when you click Done stay too. Click a picked terminal again to take it off. The other end of the cable stays where it is.";
    const moved = plan.filter((k) => k.to).length;
    return head("Cable", esc(`Move end ${busEdit.move} of ${cb?.label || "cable"}`), sub) + `<div class="picked">
      <p><b>${moved} of ${plural(plan.length, "core")}</b> moving</p>
      <table class="term-list">${rows}</table>
      <div class="btn-row">
        <button data-act="busDone" class="primary"${busReady() ? "" : " disabled"}>Done (Enter)</button>
        <button data-act="busCancel">Cancel (Esc)</button>
      </div></div>`;
  }

  function swatches(current) {
    return WIRE_COLORS.map((w) => `<button class="swatch${w.value === "gy" ? " gy" : ""}${w.value === current ? " on" : ""}" data-color="${esc(w.value)}" title="${esc(w.name)}" style="${w.value === "gy" ? "" : "background:" + w.value}"></button>`).join("");
  }

  // Colour swatches, with a custom colour picker when fallback is given (used when the colour is green/yellow
  // or mixed).
  function colorField(label, current, fallback) {
    const own = current !== "gy" && current !== MIXED;
    return `<div class="field"><span>${label}</span><div class="swatches">${swatches(current)}</div>
      ${fallback ? `<label class="custom-color">Custom ${inp("color", own ? current : fallback, "color")}</label>` : ""}</div>`;
  }

  function busProps(b) {
    const refs = busOrder(b.terms.map((e) => ({ e, ...termPoint(e) }))).map((p) => refOf(p.e));
    return head("Bus bar", esc(b.label || "Bus bar"), `Bridges ${plural(refs.length, "terminal")}`,
      actBtn("busEdit", "edit", "Pick its terminals again") + actBtn("selCircuit", "wire", "Select the whole circuit") + sepEl + actBtn("delete", "trash", "Delete bus bar (Del)"))
      + body(section("bus.main", "Bus bar", `
        ${field("Label", inp("label", b.label, "text", 'placeholder="e.g. BB1"'))}
        ${colorField(`Colour · ${esc(wireColorName(b.color))}`, b.color, "#b87333")}
        ${followBox(b)}
        ${field("Notes", area("notes", b.notes))}
        <div class="field"><span>Terminals</span><p class="ref-list">${esc(refs.join(", "))}</p></div>
        <div class="btn-row"><button class="small" data-act="busEdit">${ic("edit", "sm")} Edit terminals…</button></div>`)
      + circuitBlock(b.id));
  }

  function projectProps() {
    const m = doc.meta;
    const sub = [m.revision && "Revision " + m.revision, m.date, m.author].filter(Boolean).map(esc).join(" · ");
    return head("Diagram", esc(m.title || "Untitled diagram"), sub || "Nothing selected")
      + body(section("diag.title", "Title block", `
        <div class="row2">${field("Revision", inp("meta.revision", m.revision))}${field("Date", inp("meta.date", m.date, "date"))}</div>
        ${field("Author", inp("meta.author", m.author))}
        ${field("Notes", area("meta.notes", m.notes, 3))}
        <p class="hint-text">Shown on the printout and at the top of exported images. The title is at the top of the window.</p>`));
  }

  // Object types to swap a part to, grouped by library.
  function typeSelect(current) {
    return `<select data-k="tpl">${mixedOpt(current)}${libraries().map((l) => `<optgroup label="${esc(l)}">${doc.templates.filter((t) => t.library === l)
      .map((t) => `<option value="${esc(t.id)}"${t.id === current ? " selected" : ""}>${esc(t.name)}</option>`).join("")}</optgroup>`).join("")}</select>`;
  }

  function partProps(it) {
    const tpl = tplOf(it);
    const b = boxOf(it);
    const conns = doc.connections;
    const rows = tpl.terminals.map((t) => {
      const list = conns.filter((c) => (c.a.item === it.id && c.a.term === t.id) || (c.b.item === it.id && c.b.term === t.id));
      const refs = list.map((c) => {
        const other = c.a.item === it.id && c.a.term === t.id ? c.b : c.a;
        return `<a data-conn-link="${esc(c.id)}">${esc((c.wire ? c.wire + " " : "") + "→ " + refOf(other))}</a>`;
      });
      for (const bb of doc.buses) {
        if (bb.terms.some((e) => e.item === it.id && e.term === t.id)) refs.push(`<a data-conn-link="${esc(bb.id)}">Bus bar ${esc(bb.label || "")}</a>`);
      }
      return { t, refs: refs.join("<br>") };
    }).map(({ t, refs }) => {
      const label = isSlot(t) ? "" : `<input type="text" class="term-label" data-tl="${esc(t.id)}" list="netList" value="${esc(it.termLabels?.[t.id] || "")}" placeholder="Connector label" title="Name the circuit at this terminal, e.g. +24V. Terminals with the same label are connected.">`;
      const desc = String(t.desc || "").trim();
      return `<tr><td>${esc(t.name)}${desc ? `<br><span class="muted">${esc(desc)}</span>` : ""}</td><td>${label}${refs || (isSlot(t) ? '<span class="muted">Bus bar slot</span>' : "")}</td></tr>`;
    }).join("");
    const prefix = tagPrefix(it.tag);
    const sub = `${esc(tpl.name)} · ${r3(b.w)} × ${r3(b.h)} mm${it.rot ? ` · rotated ${it.rot}°` : ""}${isLoose(tpl) ? " · loose" : ""}`;
    const acts = actBtn("rotL", "rot-l", "Rotate left (Shift+R)") + actBtn("rotR", "rot-r", "Rotate right (R)") + actBtn("dup", "copy", "Duplicate (Ctrl+D)")
      + actBtn("editTpl", "edit", `Edit the object type “${tpl.name}”`) + sepEl + actBtn("delete", "trash", "Delete (Del)");
    return head("Part", esc(it.tag || tpl.name), sub, acts) + body(
      section("part.main", "Part", `
        <div class="row2">${field("Tag", inp("tag", it.tag, "text", 'placeholder="e.g. TB101"'))}
          ${field("Colour", `<div class="inline-row">${inp("color", it.color || tpl.fill, "color")}${it.color ? `<button class="icon-btn" data-act="resetColor" title="Use the type’s colour">${ic("rot-l", "sm")}</button>` : ""}</div>`)}</div>
        ${field("Type", typeSelect(it.tpl))}
        ${field("Description", inp("desc", it.desc, "text", 'placeholder="Shown on the part"'))}
        <div class="row2">${field("X (mm)", num("x", it.x))}${field("Y (mm)", num("y", it.y))}</div>`)
      + section("part.strip", "Strip", `
        <div class="field"><span>Repeat ${rtl() ? "to the left" : "to the right"} (tags count up)</span>
          <div class="inline-row"><input id="repeatCount" type="number" min="1" max="200" value="5" style="flex:0 0 72px"><button data-act="repeat">Add copies</button></div></div>
        <div class="field"><span>Build direction</span>${dirToggle()}</div>
        <div class="field"><span>Select several, e.g. to renumber them</span><div class="btn-row tight">
          <button class="small" data-act="selType" title="Select every ${esc(tpl.name)}">All of this type</button>
          ${prefix ? `<button class="small" data-act="selPrefix" title="Select every part tagged ${esc(prefix)} plus a number">All “${esc(prefix)}…”</button>` : ""}
        </div></div>
        <div class="btn-row"><button class="small" data-act="busNew" title="Bridge terminals with a bus bar">${ic("bus", "sm")} New bus bar…</button></div>`)
      + section("part.terms", "Terminals", tpl.terminals.length ? `<table class="term-list">${rows}</table>` : '<p class="muted">This type has no terminals.</p>', tpl.terminals.length));
  }

  function railProps(it) {
    return head("DIN rail", `${esc(it.height)} mm rail`, `${r3(it.length)} mm long · parts sitting on it move with it`,
      actBtn("fitRail", "fit", "Fit the length to the parts on it") + actBtn("dup", "copy", "Duplicate (Ctrl+D)") + sepEl + actBtn("delete", "trash", "Delete (Del)"))
      + body(section("rail.main", "Rail", `
        <div class="row2">${field("Length (mm)", num("length", it.length, 1, 'min="10"'))}${field("Profile", sel_("height", it.height, [[35, "35 mm"], [15, "15 mm"]]))}</div>
        <div class="row2">${field("X (mm)", num("x", it.x))}${field("Y (mm)", num("y", it.y))}</div>
        <div class="btn-row"><button class="small" data-act="fitRail">${ic("fit", "sm")} Fit length to parts</button></div>`));
  }

  function textProps(it) {
    const first = String(it.text || "").split("\n")[0].trim();
    return head("Text note", esc(first.length > 40 ? first.slice(0, 40) + "…" : first || "Note"), "",
      actBtn("rotL", "rot-l", "Rotate left (Shift+R)") + actBtn("rotR", "rot-r", "Rotate right (R)") + actBtn("dup", "copy", "Duplicate (Ctrl+D)") + sepEl + actBtn("delete", "trash", "Delete (Del)"))
      + body(section("text.main", "Note", `
        ${field("Text", area("text", it.text, 4))}
        <div class="row2">${field("Size (mm)", num("size", it.size, 0.5, 'min="0.5"'))}${field("Colour", inp("color", it.color || "#1d2126", "color"))}</div>
        <div class="row2">${field("Angle (°)", num("rot", +it.rot || 0, 15, 'title="Clockwise. R and Shift+R turn it a quarter turn"'))}<div class="field"><span>&nbsp;</span>${chk("bold", it.bold, "Bold")}</div></div>
        <div class="row2">${field("X (mm)", num("x", it.x))}${field("Y (mm)", num("y", it.y))}</div>`)
        + (noteLinks(it).length ? section("text.group", "Group", `
        <p class="hint-text">A bracket spans its ${plural(noteLinks(it).length, "item")} (${esc(noteLinks(it).map((x) => x.tag || (x.kind === "rail" ? "rail" : "part")).join(", "))}) on the side facing the note, with a line to it. Drag the note to another side to move the bracket there; dragging all its items takes the note along.</p>
        <div class="field"><span>Bracket distance (mm)</span><div class="inline-row">${num("gap", it.gap === undefined ? 4 : it.gap, 0.5, 'min="0" title="How far out from the items the bracket is drawn"')}<button class="small" data-act="noteGap" title="Set the distance to just clear the items' wire labels on the bracket's side">Clear the labels</button></div></div>
        <div class="btn-row"><button class="small" data-act="noteSelLinks">Select its items</button><button class="small" data-act="noteUnlink">Unlink</button></div>`) : ""));
  }

  function connProps(c) {
    const cb = cableOf(c.id);
    const acts = actBtn("swap", "swap", "Swap From and To") + actBtn("selCircuit", "wire", "Select the whole circuit") + sepEl + actBtn("delete", "trash", "Delete wire (Del)");
    const cable = cb
      ? `<p style="margin:0 0 8px"><a class="link" data-conn-link="${esc(cb.id)}">${esc(cb.label || "Cable")}${cb.desc ? " · " + esc(cb.desc) : ""}</a>${c.mark ? ` · core marked ${esc(c.mark)}` : ""}</p>
         ${cb.open ? '<p class="hint-text">This wire is a core of a cable whose other end isn’t fanned out. To draw it end to end, select the cable and use <i>Fan out to terminals…</i> on its other end.</p>'
           : cableSide(c, cb) ? '<p class="hint-text"><span class="nc">Not connected through</span>: this core is connected at one end of the cable only.</p><div class="btn-row"><button class="small" data-act="coreConnect" title="Pick the terminal it goes to at the end it isn\'t connected at">Connect through…</button><button class="small" data-act="cableRemove">Remove core</button></div>'
           : '<div class="btn-row"><button class="small" data-act="cableRemove">Take out of cable</button></div>'}`
      : `<p class="hint-text">Not in a cable. To bundle several wires together, Shift-click them and use <i>Bundle into a cable</i>.</p>
         <div class="btn-row"><button class="small" data-act="cableNew" title="Draw this wire as a cable">${ic("cable", "sm")} Bundle into a cable</button></div>`;
    return head("Wire", esc(c.wire || "Wire"), `${esc(refOf(c.a))} ↔ ${esc(refOf(c.b))}`, acts) + body(
      section("wire.main", "Wire", `
        ${field("Wire number / label", inp("wire", c.wire, "text", 'placeholder="e.g. W12"'))}
        <div class="field"><span>Profile</span><div class="inline-row">${profileSelect(c.profile)}<button class="small" data-act="profiles" title="Create and edit wire profiles">Edit…</button></div></div>
        ${colorField(`Colour · ${esc(wireLookName(c.color, c.stripe))}`, c.color, "#2e9b3c")}
        <div class="row3">
          ${field("Stripe", stripeSelect("stripe", c.stripe, c.color === "gy"))}
          ${field("Size", inp("gauge", c.gauge, "text", `list="gaugeList" placeholder="e.g. ${wireStd(doc.settings.wireStd).example}"`))}
          ${field("Conductor", sel_("conductor", c.conductor || "", [["", "—"], ...CONDUCTORS.map((x) => [x, x])]))}
        </div>
        ${followBox(c)}
        ${cb ? "" : field("Draw as", sel_("draw", c.draw || "", drawOpts("wire")))}
        ${field("Notes", area("notes", c.notes, 3))}`)
      + section("wire.cable", "Cable", cable)
      + circuitBlock(c.id));
  }

  // Tracer stripe picker: none, or any wire colour other than the base. Green/yellow has its own banding.
  function stripeSelect(k, value, off) {
    const opts = [["", "None"], ...WIRE_COLORS.filter((w) => w.value !== "gy").map((w) => [w.value, w.name])];
    if (value && value !== MIXED && !opts.some(([v]) => v === value)) opts.push([value, "Custom"]);
    return `<select data-k="${k}"${off ? ' disabled title="Green/yellow is already banded"' : ""}>${mixedOpt(value)}${opts.map(([v, l]) => `<option value="${esc(v)}"${(value || "") === v ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  }

  // Favourite profiles are offered in drop-downs and right-click menus, along with any in use (a Set of
  // ids, cur); the rest are picked from all of them in the chooser.
  const offered = (list, cur) => list.filter((p) => p.fav || cur.has(p.id));
  const unfaved = (list) => list.some((p) => !p.fav);
  const PICK_OPT = "__pick"; // a profile drop-down's "All … profiles…"

  // Profile picker; choosing one assigns it to the selected wire(s). "mixed" shows when selected wires differ.
  function profileSelect(current, mixed) {
    const cur = mixed ? new Set() : new Set([current || ""]);
    const opts = (mixed ? [["__mixed", "(mixed)"]] : []).concat([["", "Custom (no profile)"]], offered(doc.wireProfiles, cur).map((p) => [p.id, profileLabel(p)]),
      unfaved(doc.wireProfiles) ? [[PICK_OPT, "All wire profiles…"]] : []);
    return `<select data-pf="assign">${opts.map(([v, l]) => `<option value="${esc(v)}"${(mixed ? v === "__mixed" : v === (current || "")) ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  }

  function profileLabel(p) {
    return [p.name, [wireLookName(p.color, p.stripe), p.gauge, p.conductor].filter(Boolean).join(", ")].filter(Boolean).join(" — ");
  }

  // The rest of a wire's or bus bar's circuit, following wires, bus bars and links inside parts.
  function circuitBlock(id) {
    const circ = circuitOf(doc, [id]);
    const others = doc.connections.filter((x) => circ.conns.has(x.id) && x.id !== id).sort((a, b) => natural(a.wire, b.wire));
    const bars = doc.buses.filter((x) => circ.buses.has(x.id) && x.id !== id);
    const terms = [...circ.terms].map((k) => refOf(termKeyParts(k))).sort(natural);
    const rows = others.map((x) => `<tr><td><a data-conn-link="${esc(x.id)}">${esc(x.wire || "—")}</a></td><td>${esc(refOf(x.a))} ↔ ${esc(refOf(x.b))}</td></tr>`)
      .concat(bars.map((x) => `<tr><td><a data-conn-link="${esc(x.id)}">${esc(x.label || "Bus")}</a></td><td>Bus bar, ${plural(x.terms.length, "terminal")}</td></tr>`));
    const parts = [others.length && plural(others.length, "other wire"), bars.length && plural(bars.length, "bus bar")].filter(Boolean);
    const names = circuitNames(doc);
    const name = isConn(id) ? names.conn.get(id) : names.bus.get(id);
    return section("circuit", `Circuit${name ? " · " + esc(name) : ""}`, `
      ${field("Circuit name", `<input type="text" data-circ="${esc(id)}" list="netList" value="${esc(name || "")}" placeholder="e.g. +24V, 0V, L1">`)}
      ${name ? field("Circuit's labels show", `<select data-clabel="${esc(netKey(name))}" title="What this circuit's wire labels show, overriding Named circuits show for the drawing">${[
        ["", `As set for the drawing (${doc.settings.labelName === "circuit" ? "circuit name" : "where each wire goes"})`],
        ["name", "Circuit name"], ["dest", "Where each wire goes"],
      ].map(([v, l]) => `<option value="${v}"${(doc.circuitLabels[netKey(name)] || "") === v ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`) : ""}
      ${isConn(id) ? labelShowField([connById(id)]) : ""}
      <p class="hint-text">${parts.length ? parts.join(", ") : "Nothing else connected"} · ${plural(terms.length, "terminal")}</p>
      ${rows.length ? `<table class="term-list">${rows.join("")}</table>` : ""}
      ${rows.length ? `<div style="margin-top:8px">${circuitButtons([id])}</div>` : ""}
      <div class="field"><span>Terminals</span><p class="ref-list">${esc(terms.join(", "))}</p></div>
      <p class="hint-text">Circuits follow wires, bus bars and terminals linked inside a part. Terminals with the same connector label, and wires with the same circuit name, are one circuit even without a wire between them.</p>`);
  }

  // A cable's two ends, for headings and lists: the connector it's plugged into, the parts its cores land
  // on, or where its free end goes.
  function cableEnds(cb) {
    return cableEndInfo(cb).map((e) => endText(e, cb));
  }

  // One end of a cable (from cableEndInfo) in a few words: the connector it's plugged into, the parts its
  // cores land on, or where its free end goes (given the cable).
  function endText(e, cb) {
    const more = (e.extra || []).map(refOf);
    if (e.kind === "plug") return [refOf(e.port), ...more].join(", ");
    if (e.kind === "fan") return [...more, ...new Set(e.terms.map((t) => refOf(t).split(doc.settings.termSep)[0]))].join(", ");
    return (cb && cb.to) || "not drawn";
  }

  const cableProfileById = (id) => (id ? doc.cableProfiles.find((p) => p.id === id) : null);
  const CABLE_LIB_OPT = "__lib"; // the cable profile drop-down's "From the cable library…"

  const cableProfileLabel = (p) => [p.name, p.desc].filter(Boolean).join(" — ");

  function cableProfileSelect(current) {
    const opts = [["", "Custom (no profile)"], ...offered(doc.cableProfiles, new Set([current])).map((p) => [p.id, cableProfileLabel(p)]),
      ...(unfaved(doc.cableProfiles) ? [[PICK_OPT, "All cable profiles…"]] : []), [CABLE_LIB_OPT, "From the cable library…"]];
    return `<select data-cpf="assign">${mixedOpt(current)}${opts.map(([v, l]) => `<option value="${esc(v)}"${current === v ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  }

  function cableProps(cb) {
    const ws = cb.wires.map(connById).filter(Boolean);
    const near = (c) => (c.a.item === cb.id ? c.b : c.a);
    const ends = cableEndInfo(cb);
    const [endA, endB] = ends.map((e) => endText(e, cb));
    const defs = profileCores(cb);
    const prof = cableProfileById(cb.profile);
    const num = coreNumbers(cb);
    const corePick = (c) => (defs.length ? `<select class="core-pick" data-core-num="${esc(c.id)}" title="Which of its profile's cores this is. Picking one another wire has swaps them">${Array.from({ length: Math.max(defs.length, num.get(c.id)) }, (_, i) => i + 1).map((n) => `<option value="${n}"${n === num.get(c.id) ? " selected" : ""}>${esc(coreLabel(defs, n))}</option>`).join("")}</select>` : "");
    // A bundle's wires each say whether they're connected through, or at one end of the cable only: picking
    // one end unhooks the wire at the other, and picking "Both ends" again asks for a terminal there.
    const sides = cb.open ? {} : bundleSides(cb);
    const endOf = (c) => { const side = cableSide(c, cb); return side ? ((sides[c.id] || "a") === side ? "A" : "B") : ""; };
    const through = (c) => {
      const off = endOf(c);
      return `<select class="core-pick" data-core-thru="${esc(c.id)}" title="Which ends of the cable this wire is connected at. At one end only, it's not connected through">${[["", "Both ends"], ["A", "End B only"], ["B", "End A only"]].map(([v, l]) => `<option value="${v}"${v === off ? " selected" : ""}>${l}</option>`).join("")}</select>`;
    };
    const route = (c) => {
      if (cb.open) return `${esc(refOf(c.a.item === cb.id ? c.a : c.b))} → ${esc(refOf(near(c)))}`;
      if (!cableSide(c, cb)) return `${esc(refOf(c.a))} ↔ ${esc(refOf(c.b))}`;
      return `${esc(refOf(near(c)))} → <span class="nc" title="This core isn't connected at end ${endOf(c)} of the cable">not connected through</span>`;
    };
    // Its drop-downs go on a line of their own under each wire, where they have room.
    const picks = (c) => (defs.length || !cb.open ? `<tr class="core-ctl"><td colspan="2"><div class="core-ctl-row">${corePick(c)}${cb.open ? "" : through(c)}</div></td><td></td></tr>` : "");
    const rows = coreOrder(cb).map((c) => `<tr><td>${colorChip(c.color, c.stripe)}<a data-conn-link="${esc(c.id)}">${esc(c.wire || "—")}</a>${c.mark ? ` <span class="muted">${esc(c.mark)}</span>` : ""}</td><td>${route(c)}</td><td class="x"><button class="icon-btn" data-core="${esc(c.id)}" title="${cb.open || cableSide(c, cb) ? "Remove this core" : "Take this wire out of the cable"}">${ic("x", "sm")}</button></td></tr>${picks(c)}`).join("");
    const unhooked = cb.open ? 0 : ws.filter((c) => cableSide(c, cb)).length;
    const reset = `<button class="small" data-act="cableReset" title="Put the ${cb.open ? "fan-out and end points" : "fan-out points"} back where they're worked out automatically"${hasLayout(cb) ? "" : " disabled"}>${cb.open ? "Reset layout" : "Reset fan-out points"}</button>`;
    const both = ends[1].kind !== "free"; // two drawn ends, rather than one end and where it goes
    const sub = (ws.length ? plural(ws.length, "core") + " · " : "") + `${esc(endA)} ${!both && !cb.to ? "· other end not drawn" : (both ? "↔ " : "→ ") + esc(endB)}`;
    const acts = (ws.length ? actBtn("cableSelect", "wire", cb.open ? "Select its cores" : "Select its wires") : "")
      + sepEl + actBtn("cableDelete", "trash", cb.open ? "Delete cable" : "Delete cable and wires");
    // Each end: plugged into a connector, fanned out to terminals, or free, and what it can change to.
    const KIND = { plug: "plugged into", fan: "fans out to", free: "free, goes to" };
    const kindOf = (e) => (e.extra.length ? (e.kind === "fan" ? "connectors and cores" : "plugged into") : KIND[e.kind]);
    const endField = (end, e) => `<div class="field"><span>End ${end} · ${kindOf(e)}</span><p class="ref-list">${esc(e.kind === "free" ? cb.to || "—" : endText(e, cb))}</p>
        <div class="btn-row tight">${endActions(cb, end).map(([act, label, title]) => `<button class="small" data-endact="${end}|${act}" title="${esc(title)}">${esc(label)}</button>`).join("")}</div></div>`;
    const endsSec = section("cable.ends", "Ends", `${endField("A", ends[0])}${endField("B", ends[1])}
        <p class="hint-text">Each end of a cable can be plugged into a cable connector, fan out into cores that land on terminals, or be left free, running off the drawing. <i>Add a connector…</i> plugs an end into more connectors as well, e.g. a motor cable's power and encoder plugs and two loose cores at the drive end.${ws.length ? "" : defs.length ? " A cable with no end fanned out doesn't draw its cores; the ones its profile lists are below." : " A cable with no end fanned out doesn't draw its cores: describe them with its type, e.g. Cat6 4×2×AWG24, or list them in its cable profile."}</p>`);
    return head("Cable", esc(cb.label || "Cable"), sub, acts) + body(
      section("cable.main", "Cable", `
        ${field("Label", inp("label", cb.label, "text", 'placeholder="e.g. C1"'))}
        <div class="field"><span>Cable profile</span><div class="inline-row">${cableProfileSelect(cb.profile || "")}<button class="small" data-act="cprofiles" title="Create and edit cable profiles, and the cores they contain">Edit…</button></div></div>
        ${prof && prof.notes ? `<p class="hint-text">${esc(prof.notes)}</p>` : ""}
        ${field("Type", inp("desc", cb.desc, "text", `placeholder="e.g. ${cb.open ? "Cat6 S/FTP, 4x0.75 LiYY" : "3G1.5 H07RN-F"}"`))}
        <div class="row2">${chk("shield", cb.shield, "Shielded")}${chk("twisted", cb.twisted, "Twisted pairs")}</div>
        ${cb.open && !cb.portB ? field("Goes to", inp("to", cb.to || "", "text", 'placeholder="e.g. Pump P1, field sensor B3"')) : ""}
        ${colorField(`Sheath colour · ${esc(wireColorName(cb.color))}`, cb.color)}
        ${breakable(cb) ? field("Draw", sel_("draw", cb.draw || "", drawOpts("cable"))) : ""}
        ${field("Notes", area("notes", cb.notes))}`)
      + endsSec
      + (cb.open && cb.portA ? (defs.length ? section("cable.cores", "Cores", `
        <table class="term-list">${defs.map((k, i) => `<tr><td>${colorChip(k.color, k.stripe)}${i + 1}</td><td>${esc(coreText(k))}</td></tr>`).join("")}</table>
        <p class="hint-text">The cores its profile lists. They aren't drawn while no end of the cable fans out.</p>`, defs.length) : "") : section("cable.cores", cb.open ? "Cores" : "Wires", `
        <table class="term-list">${rows}</table>
        ${unhooked ? `<p class="hint-text">${plural(unhooked, "core")} ${unhooked === 1 ? "is" : "are"} connected at one end only: not connected through.</p>` : ""}
        ${defs.length && defs.length !== ws.length ? `<p class="hint-text">Its profile lists ${plural(defs.length, "core")}; ${plural(ws.length, cb.open ? "core is" : "wire is", cb.open ? "cores are" : "wires are")} drawn.</p>` : ""}
        <p class="hint-text">${cb.open
          ? "Each core is a wire: click one to set its colour, size or profile. Fan out the other end too and they join up end to end. Drag the orange dots to move where the cores fan out and where the cable ends."
          : `To add wires, Shift-click them along with the cable, then use <i>Add to ${esc(cb.label || "cable")}</i>. Drag the orange dots at the sheath ends to move where the cores fan out.`}</p>
        <div class="btn-row">
          ${reset}
          ${cb.open ? "" : '<button class="small" data-act="cableUnbundle" title="Remove the cable but keep its wires">Unbundle (keep wires)</button>'}
        </div>`, ws.length)));
  }

  // The settings shared by several selected things, a section for each kind selected. Each section's data-grp
  // says which kind its controls change (see editTargets); a setting they don't all share shows as mixed.
  function groupSections(ids) {
    const ws = ids.map(connById).filter(Boolean), bs = ids.map(busById).filter(Boolean), cbs = ids.map(cableById).filter(Boolean);
    const items = ids.map(itemById).filter(Boolean);
    const parts = items.filter((i) => i.kind === "part"), rails = items.filter((i) => i.kind === "rail"), notes = items.filter((i) => i.kind === "text");
    const grp = (k, html) => `<div data-grp="${k}">${html}</div>`;
    const colorName = (list, name) => { const v = same(list, name); return v === MIXED ? "mixed" : esc(v); };
    let s = "";
    if (ws.length) {
      const ps = new Set(ws.map((c) => c.profile || ""));
      const color = same(ws, "color");
      s += section("multi.wires", "Wires", grp("conn", `
        <div class="field"><span>Profile</span><div class="inline-row">${profileSelect([...ps][0], ps.size > 1)}<button class="small" data-act="profiles" title="Create and edit wire profiles">Edit…</button></div></div>
        ${colorField(`Colour · ${colorName(ws, (c) => wireLookName(c.color, c.stripe))}`, color, "#2e9b3c")}
        <div class="row3">
          ${field("Stripe", stripeSelect("stripe", same(ws, "stripe"), color === "gy"))}
          ${field("Size", inp("gauge", same(ws, "gauge"), "text", `list="gaugeList" placeholder="e.g. ${wireStd(doc.settings.wireStd).example}"`))}
          ${field("Conductor", sel_("conductor", same(ws, "conductor"), [["", "—"], ...CONDUCTORS.map((x) => [x, x])]))}
        </div>
        ${followBoxes(ws)}
        ${ws.some((c) => !cableOf(c.id)) ? field("Draw as", sel_("draw", same(ws, "draw"), drawOpts("wire"))) : ""}
        ${labelShowField(ws)}
        ${field("Notes", area("notes", same(ws, "notes"), 2))}`), ws.length);
    }
    if (bs.length) {
      s += section("multi.buses", "Bus bars", grp("bus", `
        ${colorField(`Colour · ${colorName(bs, (b) => wireColorName(b.color))}`, same(bs, "color"), "#b87333")}
        ${followBoxes(bs)}
        ${field("Notes", area("notes", same(bs, "notes"), 2))}`), bs.length);
    }
    if (cbs.length) {
      s += section("multi.cables", "Cables", grp("cable", `
        <div class="field"><span>Cable profile</span><div class="inline-row">${cableProfileSelect(same(cbs, "profile"))}<button class="small" data-act="cprofiles">Edit…</button></div></div>
        ${field("Type", inp("desc", same(cbs, "desc"), "text", 'placeholder="e.g. 3G1.5 H07RN-F"'))}
        <div class="row2">${chk("shield", same(cbs, (cb) => !!cb.shield), "Shielded")}${chk("twisted", same(cbs, (cb) => !!cb.twisted), "Twisted pairs")}</div>
        ${colorField(`Sheath colour · ${colorName(cbs, (cb) => wireColorName(cb.color))}`, same(cbs, "color"))}
        ${cbs.some(breakable) ? field("Draw", sel_("draw", same(cbs, "draw"), drawOpts("cable"))) : ""}
        ${field("Notes", area("notes", same(cbs, "notes"), 2))}`), cbs.length);
    }
    if (parts.length) {
      const fill = same(parts, (it) => it.color || tplOf(it).fill);
      s += section("multi.parts", "Parts", grp("part", `
        ${field("Type", typeSelect(same(parts, "tpl")))}
        ${field("Colour", `<div class="inline-row">${inp("color", fill === MIXED ? parts[0].color || tplOf(parts[0]).fill : fill, "color")}${parts.some((it) => it.color) ? `<button class="icon-btn" data-act="resetColor" title="Use each type’s colour">${ic("rot-l", "sm")}</button>` : ""}</div>`)}
        ${field("Description", inp("desc", same(parts, "desc"), "text", 'placeholder="Shown on the part"'))}`), parts.length);
    }
    if (rails.length) {
      s += section("multi.rails", "DIN rails", grp("rail", `
        <div class="row2">${field("Length (mm)", num("length", same(rails, "length"), 1, 'min="10"'))}${field("Profile", sel_("height", same(rails, "height"), [[35, "35 mm"], [15, "15 mm"]]))}</div>`), rails.length);
    }
    if (notes.length) {
      const ink = same(notes, (it) => it.color || "#1d2126");
      s += section("multi.notes", "Text notes", grp("text", `
        <div class="row2">${field("Size (mm)", num("size", same(notes, "size"), 0.5, 'min="0.5"'))}${field("Colour", inp("color", ink === MIXED ? notes[0].color || "#1d2126" : ink, "color"))}</div>
        <div class="row2">${field("Angle (°)", num("rot", same(notes, (it) => +it.rot || 0), 15, 'title="Clockwise"'))}<div class="field"><span>&nbsp;</span>${chk("bold", same(notes, (it) => !!it.bold), "Bold")}</div></div>`), notes.length);
    }
    return s;
  }

  function multiProps(ids) {
    const items = ids.filter((i) => itemById(i)).length;
    const wires = ids.filter(isConn).length;
    const bars = ids.filter((i) => busById(i)).length;
    const cbs = ids.map(cableById).filter(Boolean);
    const sub = [items && plural(items, "item"), wires && plural(wires, "wire"), bars && plural(bars, "bus bar"), cbs.length && plural(cbs.length, "cable")].filter(Boolean).join(", ");
    const acts = (items ? actBtn("rotL", "rot-l", "Rotate left (Shift+R)") + actBtn("rotR", "rot-r", "Rotate right (R)") + actBtn("dup", "copy", "Duplicate (Ctrl+D)") + sepEl : "")
      + actBtn("delete", "trash", `Delete ${ids.length} items (Del)`);
    let s = groupSections(ids);
    if (wires || bars) {
      s += section("multi.wiring", "Wiring", `
        ${wires && cbs.length === 1 && !cbs[0].open ? `<div class="btn-row"><button class="small primary" data-act="cableAdd">Add ${plural(wires, "wire")} to ${esc(cbs[0].label || "the cable")}</button></div>` : ""}
        ${wires && !cbs.length ? `<div class="btn-row"><button class="small" data-act="cableNew" title="Group these wires into a cable, drawn as one sheath that fans out to each terminal">${ic("cable", "sm")} Bundle ${plural(wires, "wire")} into a cable</button></div>` : ""}
        ${circuitButtons(ids.filter((id) => isConn(id) || busById(id)))}
        ${wires || cbs.length ? `<div class="btn-row"><button class="small" data-act="showOnly" title="Hide every other wire on the drawing until you choose Show all">Show only these wires</button></div>` : ""}`);
    }
    {
      const its = ids.map(itemById).filter(Boolean);
      if (canLinkNote(its)) s += section("multi.note", "Group note", `<div class="btn-row"><button class="small primary" data-act="linkNote" title="Draw the note's bracket around the other selected items">Link note to the selected items</button></div>`);
      else if (its.length && !its.some((i) => i.kind === "text")) s += section("multi.note", "Group note", `<div class="btn-row"><button class="small" data-act="groupNote" title="A note above these items, with a bracket spanning them">${ic("note", "sm")} Add a group note</button></div>`);
    }
    if (items > 1) {
      s += section("multi.arrange", "Arrange", `
        <div class="btn-row">
          <button class="small" data-act="align" data-mode="pack" title="Line up side by side with no gaps, in the build direction">Pack side by side</button>
          <button class="small" data-act="align" data-mode="middle" title="Centre vertically on the leftmost item">Align middles</button>
          <button class="small" data-act="align" data-mode="top">Align tops</button>
          <button class="small" data-act="align" data-mode="bottom">Align bottoms</button>
          <button class="small" data-act="align" data-mode="left">Align lefts</button>
        </div>
        <div class="field"><span>Build direction</span>${dirToggle()}</div>`);
    }
    s += renumberBlock(ids.map(itemById).filter((i) => i && i.kind === "part"));
    return head("Selection", `${ids.length} selected`, sub, acts) + body(s || '<p class="insp-note muted">Use the buttons above, or right-click the selection for more.</p>');
  }

  // ---------- renumbering ----------
  // How far selecting a circuit reaches from some wires and bus bars: "named" is everything in their
  // circuits, including what shares a name with no wire between; "connected" only what's wired to them
  // (wires, bus bars and links inside parts); "chain" only wires and bus bars joined at the same terminals.
  function circuitReach(ids, mode) {
    return circuitOf(doc, ids, mode === "chain" ? { direct: true } : mode === "connected" ? { physical: true } : {});
  }

  function selectCircuit(mode) {
    const circ = circuitReach([...sel].filter((id) => isConn(id) || busById(id)), mode);
    sel = new Set([...circ.conns, ...circ.buses]);
    refresh();
  }

  // The ways to select a circuit from these wires and bus bars, with how many each would select. "named"
  // is only offered when a circuit name reaches further than the wiring does.
  function circuitChoices(ids) {
    const count = (mode) => { const c = circuitReach(ids, mode); return c.conns.size + c.buses.size; };
    const all = count("named"), wired = count("connected"), chain = count("chain");
    const cn = circuitNames(doc);
    const names = [...new Set(ids.map((id) => (isConn(id) ? cn.conn.get(id) : cn.bus.get(id))).filter(Boolean))];
    const out = [];
    if (all > wired) {
      out.push({ mode: "named", n: all, label: names.length === 1 ? `Select all of “${names[0]}”` : "Select whole named circuits",
        title: "Everything in the circuit, including wiring elsewhere that shares its name, with no wire between" });
    }
    out.push({ mode: "connected", n: wired, label: all > wired ? "Select connected wires" : "Select whole circuit",
      title: "The wires and bus bars wired to this one, through terminals, bus bars and links inside parts" });
    if (chain > 1 && chain < wired) out.push({ mode: "chain", n: chain, label: "Select daisy chain", title: "Only the wires and bus bars joined at the same terminals, not those on the far side of a terminal block or inside other parts" });
    return out;
  }
  const circuitMenu = (ids) => {
    const ks = circuitChoices(ids).map((k) => ({ label: `${k.label} (${k.n})`, run: () => selectCircuit(k.mode) }));
    return ks.length > 1 ? [{ label: "Select circuit", sub: ks }] : ks;
  };
  const circuitButtons = (ids) => `<div class="btn-row">${circuitChoices(ids).map((k) => `<button class="small" data-act="selReach" data-reach="${k.mode}" title="${esc(k.title)}">${esc(k.label)} (${k.n})</button>`).join("")}</div>`;

  function selectSameType(it) {
    sel = new Set(pageItems().filter((i) => i.kind === "part" && i.tpl === it.tpl).map((i) => i.id));
    refresh();
  }

  function selectSamePrefix(it) {
    const p = tagPrefix(it.tag);
    sel = new Set(pageItems().filter((i) => i.kind === "part" && tagPrefix(i.tag) === p).map((i) => i.id));
    refresh();
  }

  function swapEnds(c) {
    checkpoint();
    [c.a, c.b] = [c.b, c.a];
    refresh();
  }

  // Stretch a rail to just cover the parts sitting on it, with 10 mm spare at each end.
  function fitRail(rail) {
    const parts = mountedOn({ ...rail, x: -1e9, length: 2e9 }).filter((p) => p.kind === "part");
    if (!parts.length) { toast("No parts are sitting on this rail"); return; }
    checkpoint();
    const xs = parts.map(boxOf);
    const x1 = Math.min(...xs.map((q) => q.x)), x2 = Math.max(...xs.map((q) => q.x + q.w));
    rail.x = r3(x1 - 10);
    rail.length = r3(x2 - x1 + 20);
    refresh();
  }

  function tagPrefix(tag) {
    const m = /^(.*?)(\d+)$/.exec(tag || "");
    return m && m[1] ? m[1] : "";
  }

  function orderParts(parts, order) {
    const list = parts.map((it) => ({ it, b: boxOf(it) }));
    const cmp = {
      ltr: (a, b) => a.b.x - b.b.x || a.b.y - b.b.y,
      rtl: (a, b) => (b.b.x + b.b.w) - (a.b.x + a.b.w) || a.b.y - b.b.y,
      ttb: (a, b) => a.b.y - b.b.y || a.b.x - b.b.x,
    }[order];
    return list.sort(cmp).map((o) => o.it);
  }

  // Start "001" keeps three digits: 001, 002, …
  function numberedTag(prefix, start, i, step) {
    const n = parseInt(start, 10) + i * step;
    const pad = /^0\d/.test(start) ? start.length : 0;
    return prefix + String(n).padStart(pad, "0");
  }

  function renumberBlock(parts) {
    if (parts.length < 2) return "";
    const order = rtl() ? "rtl" : "ltr";
    const first = orderParts(parts, order)[0];
    const m = /^(.*?)(\d+)$/.exec(first.tag || "");
    const prefix = m ? m[1] : (tplOf(first)?.prefix || "");
    const start = m ? m[2] : "1";
    return section("multi.renumber", "Renumber tags", `
      <p class="hint-text">${parts.length} parts, numbered in position order. Wires stay connected.</p>
      <div class="row2">
        <label class="field"><span>Prefix</span><input data-rn="prefix" type="text" value="${esc(prefix)}"></label>
        <label class="field"><span>Start at</span><input data-rn="start" type="text" inputmode="numeric" value="${esc(start)}"></label>
      </div>
      <div class="row2">
        <label class="field"><span>Step</span><input data-rn="step" type="number" min="1" value="1"></label>
        <label class="field"><span>Order</span><select data-rn="order">
          <option value="ltr"${order === "ltr" ? " selected" : ""}>Left → right</option>
          <option value="rtl"${order === "rtl" ? " selected" : ""}>Right → left</option>
          <option value="ttb">Top → bottom</option>
        </select></label>
      </div>
      <p class="hint-text" id="rnPreview">${esc(renumberPreview(parts, { prefix, start, step: 1, order }))}</p>
      <div class="btn-row"><button data-act="renumber" class="primary">Renumber ${parts.length} parts</button></div>`, parts.length);
  }

  function readRenumber() {
    const v = (k) => $("props").querySelector(`[data-rn="${k}"]`)?.value ?? "";
    const start = v("start").trim();
    return {
      prefix: v("prefix"),
      start: /^\d+$/.test(start) ? start : "",
      step: Math.max(1, parseInt(v("step"), 10) || 1),
      order: v("order") || "ltr",
    };
  }

  function renumberPreview(parts, o) {
    if (!o.start) return "Start at must be a whole number.";
    const n = parts.length;
    const t = (i) => numberedTag(o.prefix, o.start, i, o.step);
    return n <= 4 ? [...Array(n).keys()].map(t).join(", ") : `${t(0)}, ${t(1)}, ${t(2)} … ${t(n - 1)}`;
  }

  function selectedParts() {
    return [...sel].map(itemById).filter((i) => i && i.kind === "part");
  }

  function applyRenumber() {
    const parts = selectedParts();
    const o = readRenumber();
    if (parts.length < 2 || !o.start) return;
    checkpoint();
    orderParts(parts, o.order).forEach((it, i) => { it.tag = numberedTag(o.prefix, o.start, i, o.step); });
    const mine = new Set(parts.map((p) => p.id));
    const newTags = new Set(parts.map((p) => p.tag));
    const clashes = doc.items.filter((i) => i.kind === "part" && !mine.has(i.id) && newTags.has(i.tag)).map((i) => i.tag);
    refresh();
    toast(clashes.length
      ? `Renumbered ${parts.length} parts. Also used elsewhere: ${[...new Set(clashes)].sort(natural).join(", ")}`
      : `Renumbered ${parts.length} parts`);
  }

  function propsTarget() {
    if (propsCtx.type === "project") return doc;
    if (propsCtx.type === "conn") return connById(propsCtx.id);
    if (propsCtx.type === "bus") return busById(propsCtx.id);
    if (propsCtx.type === "cable") return cableById(propsCtx.id);
    if (propsCtx.type === "item") return itemById(propsCtx.id);
    return null;
  }

  // What a panel control changes: { kind, list }. With one thing selected, that thing (kind as propsCtx.type);
  // with several, every selected thing of the kind named by the control's section (data-grp: conn, bus,
  // cable, part, rail or text).
  function editTargets(el) {
    const grp = el.closest("[data-grp]")?.dataset.grp;
    if (!grp) { const t = propsTarget(); return { kind: propsCtx.type, list: t ? [t] : [] }; }
    const ids = [...sel];
    const list = grp === "conn" ? ids.map(connById) : grp === "bus" ? ids.map(busById) : grp === "cable" ? ids.map(cableById)
      : ids.map(itemById).filter((i) => i && i.kind === grp);
    return { kind: grp, list: list.filter(Boolean) };
  }

  function setPath(obj, path, value) {
    const keys = path.split(".");
    let o = obj;
    while (keys.length > 1) o = o[keys.shift()];
    o[keys[0]] = value;
  }

  function readInput(el) {
    if (el.type === "checkbox") return el.checked;
    if (el.type === "number") { const v = parseFloat(el.value); return isNaN(v) ? undefined : v; }
    if (el.tagName === "SELECT" && /^-?\d*\.?\d+$/.test(el.value)) return parseFloat(el.value);
    return el.value;
  }

  function applyProp(el) {
    const k = el.dataset.k;
    const { kind, list } = editTargets(el);
    if (!k || !list.length) return;
    const v = readInput(el);
    if (v === undefined || v === "__mixed") return;
    if (k === "settings.wireStd") {
      setWireStd(v);
      toast(v === "us" ? "Wires switched to AWG and US colours, paper to Letter sizes" : "Wires switched to mm² and IEC colours, paper to A sizes");
      return;
    }
    // Swapping parts' type: fit each new part where the old one was, and let cables follow what moved.
    const anchors = k === "tpl" ? cableAnchors() : null;
    for (const target of list) {
      const swapped = k === "tpl" && target.kind === "part" && target.tpl !== v ? boxOf(target) : null;
      setPath(target, k, v);
      if (swapped) fitSwapped(target, swapped);
      if (kind === "bus" && k === "color") handEdited(target);
      if (kind === "conn" && /^(color|stripe|gauge|conductor)$/.test(k)) {
        lastWire[k] = v;
        // Changing a wire by hand makes it a custom wire rather than following its profile.
        const p = profileById(target.profile);
        if (p && (p[k] || "") !== v) { target.profile = ""; lastWire.profile = ""; }
        handEdited(target);
      }
      if (kind === "cable" && /^(desc|shield|twisted)$/.test(k)) {
        const p = cableProfileById(target.profile);
        if (p && (k === "desc" ? p.desc || "" : !!p[k]) !== v) target.profile = "";
      }
    }
    if (k === "tpl") { followCables(anchors); cleanConnections(); }
  }

  // A connector label that would attach its terminal to a circuit with a different name asks first, as a
  // wire would (see askJoin). Labels apply as they're typed; this runs once one is finished, and judges
  // it without the terminal's old label, so renaming a label isn't taken for a join.
  let labelWas = null; // { term, value }: a connector label as it was when its box got the focus
  function labelChanged(el) {
    const it = propsTarget(), term = el.dataset.tl, now = el.value;
    const was = labelWas && labelWas.term === term ? labelWas.value : "";
    labelWas = { term, value: now };
    if (!it || !now.trim() || netKey(now) === netKey(was)) { refresh(); return; }
    const set = (v) => { it.termLabels = it.termLabels || {}; if (v.trim()) it.termLabels[term] = v; else delete it.termLabels[term]; };
    const key = it.id + "|" + term;
    set("");
    const there = namedAt(now, key);
    if (!there) { set(now); refresh(); return; }
    askJoin([[key, there]], "This connector label", () => { set(now); refresh(); }, () => { set(was); refresh(); });
  }

  // A terminal (other than notKey) in a circuit called name, if there is one.
  function namedAt(name, notKey) {
    const items = itemMap(doc), tpls = tplMap(doc);
    let at = null;
    forEachName(items, tpls, validConnections(doc, items, tpls), validBuses(doc, items, tpls), (n, k) => {
      if (!at && k !== notKey && netKey(n) === netKey(name)) at = k;
    });
    return at;
  }

  const props = $("props");
  props.addEventListener("focusin", (e) => {
    editCheckpointed = false;
    if (e.target.dataset.tl) labelWas = { term: e.target.dataset.tl, value: e.target.value };
  });
  props.addEventListener("input", (e) => {
    const el = e.target;
    if (el.dataset.rn) { $("rnPreview").textContent = renumberPreview(selectedParts(), readRenumber()); return; }
    if (el.dataset.tl) {
      const it = propsTarget();
      if (!it) return;
      if (!editCheckpointed) { checkpoint(); editCheckpointed = true; }
      it.termLabels = it.termLabels || {};
      if (el.value.trim()) it.termLabels[el.dataset.tl] = el.value; else delete it.termLabels[el.dataset.tl];
      renderCanvas();
      renderDrawer();
      scheduleSave();
      return;
    }
    if (!el.dataset.k || el.type === "checkbox" || el.tagName === "SELECT") return;
    if (!editCheckpointed) { checkpoint(); editCheckpointed = true; }
    applyProp(el);
    renderCanvas();
    renderDrawer();
    updateToolbar();
    scheduleSave();
  });
  props.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.coreOf) { setPickedCore(el.dataset.coreOf, parseInt(el.value, 10)); return; }
    if (el.dataset.coreNum) { setCoreNumber(el.dataset.coreNum, parseInt(el.value, 10)); return; }
    if ("coreThru" in el.dataset) {
      // A core not connected at one end is connected there first, to unhook it at the other end instead.
      const id = el.dataset.coreThru;
      if (cableSide(connById(id), cableOf(id))) { if (el.value) renderProps(); else startConnect(id); }
      else if (el.value) disconnectCore(id, el.value);
      return;
    }
    if (el.dataset.cpf === "assign") {
      const { list } = editTargets(el), p = cableProfileById(el.value);
      if (!list.length || el.value === "__mixed") return;
      if (el.value === CABLE_LIB_OPT) { renderProps(); openCableLib(list.map((cb) => cb.id)); return; }
      if (el.value === PICK_OPT) { renderProps(); openProfPick("cable", list.map((cb) => cb.id)); return; }
      checkpoint();
      for (const cb of list) if (p) { applyCableProfile(cb, p); applyCableCores(cb, "all"); } else cb.profile = "";
      refresh();
      return;
    }
    if (el.dataset.pf === "assign") {
      if (el.value === "__mixed") return;
      if (el.value === PICK_OPT) { renderProps(); openProfPick("wire", [...sel].filter((id) => connById(id))); return; }
      checkpoint();
      assignProfile([...sel].map(connById).filter(Boolean), el.value);
      refresh();
      return;
    }
    if ("follow" in el.dataset) {
      const { list } = editTargets(el);
      if (!list.length) return;
      checkpoint();
      for (const c of list) {
        c.follow = el.checked;
        const src = c.follow && circuitSource(c, c);
        if (src) copyLook(c, src);
      }
      refresh();
      return;
    }
    if ("clabel" in el.dataset) {
      checkpoint();
      if (el.value) doc.circuitLabels[el.dataset.clabel] = el.value; else delete doc.circuitLabels[el.dataset.clabel];
      refresh();
      return;
    }
    if ("wlabel" in el.dataset) {
      // Only wires in named circuits take it; the others have no circuit name to show.
      const names = circuitNames(doc).conn;
      const list = editTargets(el).list.filter((c) => names.get(c.id));
      if (!list.length || el.value === "__mixed") return;
      checkpoint();
      for (const c of list) if (el.value) c.labelShow = el.value; else delete c.labelShow;
      refresh();
      return;
    }
    if (el.dataset.circ) {
      checkpoint();
      nameCircuit(el.dataset.circ, el.value);
      refresh();
      return;
    }
    if (el.dataset.tl) { labelChanged(el); return; }
    if (!el.dataset.k) { return; }
    if (el.type === "checkbox" || el.tagName === "SELECT") {
      checkpoint();
      applyProp(el);
      refresh();
    } else if (/^(tag|wire|color|gauge)$/.test(el.dataset.k)) {
      renderProps(); // refresh headings and swatches once editing finishes
    }
  });
  props.addEventListener("click", (e) => {
    const secBtn = e.target.closest("[data-sec-toggle]");
    if (secBtn) { toggleSection(secBtn.dataset.secToggle); return; }
    const sw = e.target.closest("[data-color]");
    if (sw) {
      const { kind, list } = editTargets(sw);
      if (!list.length || !(kind === "conn" || kind === "bus" || kind === "cable")) return;
      checkpoint();
      for (const c of list) {
        c.color = sw.dataset.color;
        if (kind === "conn") {
          lastWire.color = c.color;
          if (profileById(c.profile)?.color !== c.color) { c.profile = ""; lastWire.profile = ""; }
        }
        if (kind === "cable" && cableProfileById(c.profile)?.color !== c.color) c.profile = "";
        if (kind !== "cable") handEdited(c);
      }
      refresh();
      return;
    }
    const link = e.target.closest("[data-conn-link]");
    if (link) { sel = new Set([link.dataset.connLink]); refresh(); return; }
    const ea = e.target.closest("[data-endact]");
    if (ea) { const cb = propsTarget(), [end, act] = ea.dataset.endact.split("|"); if (cb) runEndAction(cb, end, act); return; }
    const core = e.target.closest("[data-core]");
    if (core) { removeFromCable(core.dataset.core); return; }
    const unpick = e.target.closest("[data-unpick]");
    if (unpick) { toggleBusTerm(unpick.dataset.unpick); return; }
    const landSkip = e.target.closest("[data-land-skip]");
    if (landSkip) { skipLanding(landSkip.dataset.landSkip); return; }
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    const target = propsTarget();
    switch (act) {
      case "delete": deleteSelection(); break;
      case "dup": duplicateSelection(); break;
      case "noteSelLinks": { const t = propsTarget(); if (t) { sel = new Set(noteLinks(t).map((x) => x.id)); refresh(); } break; }
      case "noteGap": { const t = propsTarget(), ls = t ? noteLinks(t) : []; if (ls.length) { checkpoint(); t.gap = bracketGap(ls, bracketSide(t, groupBox(ls.map(boxOf)))); refresh(); } break; }
      case "noteUnlink": { const t = propsTarget(); if (t) { checkpoint(); delete t.links; refresh(); } break; }
      case "groupNote": addGroupNote(); break;
      case "linkNote": linkNote(); break;
      case "rotL": rotateSelection(-1); break;
      case "rotR": rotateSelection(1); break;
      case "editTpl": editTemplate(tplOf(target), false); break;
      case "renumber": applyRenumber(); break;
      case "selCircuit": selectCircuit("named"); break;
      case "selReach": selectCircuit(b.dataset.reach); break;
      case "showOnly": showOnlyWires(selectedWireIds()); break;
      case "profiles": openProfiles(); break;
      case "cprofiles": openProfiles(true); break;
      case "cableLib": openCableLib(); break;
      case "busNew": startBus(null); break;
      case "busEdit": startBus(target.id); break;
      case "busDone": finishBus(); break;
      case "busCancel": cancelBus(); break;
      case "busAlt0": alternateBus(0); break;
      case "busAlt1": alternateBus(1); break;
      case "selType": selectSameType(target); break;
      case "selPrefix": selectSamePrefix(target); break;
      case "dir": checkpoint(); doc.settings.direction = b.dataset.dir; refresh(); break;
      case "repeat": repeatSideways(target.id, Math.min(200, parseInt($("repeatCount").value, 10) || 0)); break;
      case "resetColor": checkpoint(); for (const t of editTargets(b).list) delete t.color; refresh(); break;
      case "align": alignSelection(b.dataset.mode); break;
      case "swap": swapEnds(target); break;
      case "cableNew": bundleWires([...sel].filter(isConn)); break;
      case "cableAdd": bundleWires([...sel].filter(isConn), [...sel].find((id) => cableById(id))); break;
      case "cableRemove": removeFromCable(target.id); break;
      case "coreConnect": startConnect(target.id); break;
      case "cableUnbundle": unbundle(target); break;
      case "cableDelete": deleteCableAndWires(target); break;
      case "cableSelect": sel = new Set(target.wires); refresh(); break;
      case "cableReset": checkpoint(); resetLayout(target); refresh(); break;
      case "fitRail": fitRail(target); break;
    }
  });

  // The bar across the drawing while picking bus bar or cable terminals.
  $("modeBar").addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "busDone") finishBus();
    else if (act === "busCancel") cancelBus();
    else if (act === "busAlt0") alternateBus(0);
    else if (act === "busAlt1") alternateBus(1);
    else if (act === "coreSkip") skipCore();
    else if (act === "landSkip") skipLanding();
  });
  $("modeBar").addEventListener("change", (e) => {
    if (!("nextCore" in e.target.dataset) || !busEdit) return;
    busEdit.next = parseInt(e.target.value, 10);
    renderModeBar();
    renderProps();
  });

  $("titleInput").addEventListener("focus", () => { editCheckpointed = false; });
  $("titleInput").addEventListener("input", (e) => {
    if (!editCheckpointed) { checkpoint(); editCheckpointed = true; }
    doc.meta.title = e.target.value;
    updateToolbar();
    scheduleSave();
  });
  $("titleInput").addEventListener("keydown", (e) => { if (e.key === "Enter") e.target.blur(); });

  // ---------- wire profiles dialog ----------
  let profCheckpointed = false;

  function openProfiles(cables) {
    profCheckpointed = false;
    renderProfiles();
    $("profModal").hidden = false;
    if (cables) $("cprofHead").scrollIntoView({ block: "start" });
  }

  function renderProfiles() {
    const colorOpts = (val) => {
      const known = WIRE_COLORS.some((w) => w.value === val);
      return (known ? [] : [[val, "Custom"]]).concat(WIRE_COLORS.map((w) => [w.value, w.name]))
        .map(([v, l]) => `<option value="${esc(v)}"${v === val ? " selected" : ""}>${esc(l)}</option>`).join("");
    };
    $("profRows").innerHTML = doc.wireProfiles.map((p) => {
      const n = doc.connections.filter((c) => c.profile === p.id).length;
      return `<tr data-pid="${esc(p.id)}">
        <td>${favBtn(p, "wire")}</td>
        <td><input data-f="name" type="text" value="${esc(p.name)}"></td>
        <td>${colorChip(p.color, p.stripe)}<select data-f="color">${colorOpts(p.color)}</select> <input data-f="color" type="color" value="${esc(p.color === "gy" ? "#2e9b3c" : p.color)}" title="Custom colour"></td>
        <td>${stripeSelect("", p.stripe, p.color === "gy").replace('data-k=""', 'data-f="stripe"')}</td>
        <td><input data-f="gauge" type="text" list="gaugeList" value="${esc(p.gauge)}"></td>
        <td><select data-f="conductor">${[["", "—"], ...CONDUCTORS.map((x) => [x, x])].map(([v, l]) => `<option value="${v}"${(p.conductor || "") === v ? " selected" : ""}>${l}</option>`).join("")}</select></td>
        <td>${n}</td>
        <td><button class="icon-btn danger" data-pdel title="Delete profile">${ic("x", "sm")}</button></td>
      </tr>`;
    }).join("") || '<tr><td colspan="8" class="muted" style="padding:10px">No profiles. Add one below.</td></tr>';
    $("cprofRows").innerHTML = doc.cableProfiles.map((p) => {
      const n = doc.cables.filter((cb) => cb.profile === p.id).length;
      const ks = p.cores || [];
      return `<tr data-cpid="${esc(p.id)}">
        <td>${favBtn(p, "cable")}</td>
        <td><input data-f="name" type="text" value="${esc(p.name)}"></td>
        <td>${colorChip(p.color)}<select data-f="color">${colorOpts(p.color)}</select> <input data-f="color" type="color" value="${esc(p.color === "gy" ? "#2e9b3c" : p.color)}" title="Custom colour"></td>
        <td><input data-f="desc" type="text" value="${esc(p.desc || "")}" placeholder="e.g. Cat6 S/FTP"></td>
        <td class="c"><input data-f="shield" type="checkbox"${p.shield ? " checked" : ""} title="Shielded"></td>
        <td class="c"><input data-f="twisted" type="checkbox"${p.twisted ? " checked" : ""} title="Twisted pairs"></td>
        <td><input data-f="notes" type="text" value="${esc(p.notes || "")}" placeholder="e.g. drain wire, max length"></td>
        <td><button class="small${coresOpen.has(p.id) ? " on" : ""}" data-cores-toggle title="The cores this cable contains">${ks.length ? plural(ks.length, "core") : "Cores…"}</button></td>
        <td>${n}</td>
        <td><button class="icon-btn danger" data-cpdel title="Delete cable profile">${ic("x", "sm")}</button></td>
      </tr>${coresOpen.has(p.id) ? `<tr class="cores-row" data-cores="${esc(p.id)}"><td colspan="10">${profileCoresTable(p, colorOpts)}</td></tr>` : ""}`;
    }).join("") || '<tr><td colspan="10" class="muted" style="padding:10px">No cable profiles. Add one below.</td></tr>';
  }

  // ---------- favourite profiles ----------
  // Drop-downs and right-click menus offer only the favourite profiles (fav); the star beside a profile in
  // the profiles dialog, the lists and the chooser makes it one or not.
  function favBtn(p, kind) {
    return `<button class="icon-btn star${p.fav ? " on" : ""}" data-fav="${kind}" data-favid="${esc(p.id)}" aria-pressed="${!!p.fav}" title="${p.fav
      ? "A favourite: offered in the drop-downs and right-click menus. Click to take it off"
      : "Make it a favourite, offered in the drop-downs and right-click menus"}">${ic("star", "sm")}</button>`;
  }

  function toggleFav(b) {
    const p = b.dataset.fav === "cable" ? cableProfileById(b.dataset.favid) : profileById(b.dataset.favid);
    if (!p) return;
    checkpoint();
    p.fav = !p.fav;
    refresh();
    if (!$("profModal").hidden) renderProfiles();
    if (!$("profPick").hidden) renderProfPick();
  }

  // Picking from all of a drawing's profiles: "All wire profiles…" or "All cable profiles…" in a drop-down
  // or right-click menu opens this for the wires or cables (pickFor: their kind and ids) it was opened for.
  let pickFor = null;

  function openProfPick(kind, ids) {
    pickFor = { kind, ids };
    $("profPickSearch").value = "";
    renderProfPick();
    $("profPick").hidden = false;
    $("profPickSearch").focus();
  }

  const pickTargets = () => pickFor.ids.map(pickFor.kind === "cable" ? cableById : connById).filter(Boolean);

  function renderProfPick() {
    const cable = pickFor.kind === "cable";
    const list = cable ? doc.cableProfiles : doc.wireProfiles;
    const targets = pickTargets();
    const cur = new Set(targets.map((x) => x.profile || ""));
    const q = $("profPickSearch").value.trim().toLowerCase();
    const noun = cable ? "cable" : "wire";
    const who = targets.length === 1 ? `${noun} ${(cable ? targets[0].label : targets[0].wire) || ""}`.trim() : plural(targets.length, noun);
    $("profPickTitle").textContent = cable ? "Cable profiles" : "Wire profiles";
    $("profPickFor").innerHTML = `Picking a profile for <b>${esc(who)}</b>. The drop-downs and right-click menus offer only the favourites: click a star to add or remove one.`;
    $("profPickLib").hidden = !cable;
    const facts = (p) => cable
      ? [p.desc, (p.cores || []).length && plural(p.cores.length, "core"), p.shield && "shielded", p.twisted && "twisted pairs"].filter(Boolean).join(" · ")
      : [wireLookName(p.color, p.stripe), p.gauge, p.conductor].filter(Boolean).join(", ");
    const match = list.filter((p) => !q || [p.name, facts(p), p.notes || ""].join(" ").toLowerCase().includes(q));
    let s = "";
    for (const [head, ps] of [["Favourites", match.filter((p) => p.fav)], ["Others", match.filter((p) => !p.fav)]]) {
      if (!ps.length) continue;
      s += `<h3 class="cable-lib-cat">${head}</h3>`;
      for (const p of ps) {
        const n = (cable ? doc.cables : doc.connections).filter((x) => x.profile === p.id).length;
        const status = [cur.has(p.id) && (cur.size === 1 ? "Its profile now" : "Some of them have it"), n && `used by ${plural(n, noun)}`].filter(Boolean).join(" · ");
        s += `<div class="lib-offer prof-offer${cur.has(p.id) ? " loaded" : ""}" data-ppid="${esc(p.id)}">
          ${favBtn(p, pickFor.kind)}
          <div class="meta">
            <div class="name">${colorChip(p.color, cable ? "" : p.stripe)}${esc(p.name)}</div>
            ${facts(p) ? `<div class="size">${esc(facts(p))}</div>` : ""}
            ${status ? `<div class="status">${esc(status.charAt(0).toUpperCase() + status.slice(1))}</div>` : ""}
          </div>
          <div class="actions"><button class="small primary" data-puse title="Give it to the ${targets.length === 1 ? noun : noun + "s"}">Use</button></div>
        </div>`;
      }
    }
    $("profPickList").innerHTML = s || `<p class="muted">${list.length ? "No profiles match." : `This drawing has no ${noun} profiles yet.`}</p>`;
  }

  function useProfPick(id) {
    const targets = pickTargets();
    checkpoint();
    if (pickFor.kind === "cable") {
      const p = cableProfileById(id);
      for (const cb of targets) { applyCableProfile(cb, p); applyCableCores(cb, "all"); }
    } else assignProfile(targets, id);
    $("profPick").hidden = true;
    refresh();
  }

  $("profPickSearch").addEventListener("input", renderProfPick);
  $("profPickSearch").addEventListener("keydown", (e) => {
    // Enter uses the one profile the search leaves.
    const rows = $("profPickList").querySelectorAll("[data-ppid]");
    if (e.key === "Enter" && rows.length === 1) useProfPick(rows[0].dataset.ppid);
  });
  $("profPickList").addEventListener("click", (e) => {
    const fb = e.target.closest("[data-fav]");
    if (fb) { toggleFav(fb); return; }
    const b = e.target.closest("[data-puse]");
    if (b) useProfPick(b.closest("[data-ppid]").dataset.ppid);
  });
  $("profPickEdit").addEventListener("click", () => { $("profPick").hidden = true; openProfiles(pickFor.kind === "cable"); });
  $("profPickLib").addEventListener("click", () => { $("profPick").hidden = true; openCableLib(pickFor.ids); });

  // The cores a cable profile lists, unfolded under its row in the dialog.
  const coresOpen = new Set();
  function profileCoresTable(p, colorOpts) {
    const rows = (p.cores || []).map((k, i) => `<tr data-ci="${i}">
        <td>${i + 1}</td>
        <td><input data-cf="mark" type="text" value="${esc(k.mark || "")}" placeholder="—"></td>
        <td>${colorChip(k.color, k.stripe)}<select data-cf="color">${colorOpts(k.color)}</select></td>
        <td>${stripeSelect("", k.stripe, k.color === "gy").replace('data-k=""', 'data-cf="stripe"')}</td>
        <td><input data-cf="gauge" type="text" list="gaugeList" value="${esc(k.gauge || "")}"></td>
        <td><select data-cf="conductor">${[["", "—"], ...CONDUCTORS.map((x) => [x, x])].map(([v, l]) => `<option value="${v}"${(k.conductor || "") === v ? " selected" : ""}>${l}</option>`).join("")}</select></td>
        <td><button class="icon-btn danger" data-cdel title="Remove this core">${ic("x", "sm")}</button></td>
      </tr>`).join("");
    return `<table class="term-table core-table">
        <thead><tr><th>Core</th><th>Marking</th><th>Colour</th><th>Stripe</th><th>Size</th><th>Conductor</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="7" class="muted">No cores listed: the wires in its cables keep their own colours and sizes.</td></tr>'}</tbody>
      </table>
      <div class="btn-row"><button class="small" data-cadd>${ic("plus", "sm")} Add core</button><span class="muted">Cables following this profile give their cores these looks, core 1 first. A marking is the number or letters printed on the core.</span></div>`;
  }

  // Edit one of a cable profile's cores and pass it on to the cables that follow the profile.
  const coreOf = (e) => {
    const box = e.target.closest("tr[data-cores]"), tr = e.target.closest("tr[data-ci]");
    const p = box && cableProfileById(box.dataset.cores);
    return p ? { p, i: tr ? +tr.dataset.ci : -1 } : null;
  };
  function cableProfileChanged(p) {
    for (const cb of doc.cables) if (cb.profile === p.id) applyCableCores(cb);
    renderCanvas();
    renderDrawer();
    updateToolbar();
    scheduleSave();
  }
  function editProfileCore(p, i, f, value) {
    const k = p.cores && p.cores[i];
    if (!k) return;
    if (!profCheckpointed) { checkpoint(); profCheckpointed = true; }
    k[f] = value;
    if (f === "color" && value === "gy") k.stripe = ""; // green/yellow is already banded
    cableProfileChanged(p);
  }

  // Edit a cable profile field and push the change to every cable that follows it.
  const cprofRow = (e) => e.target.closest("tr[data-cpid]");
  function editCableProfile(row, f, value) {
    const p = cableProfileById(row.dataset.cpid);
    if (!p) return;
    if (!profCheckpointed) { checkpoint(); profCheckpointed = true; }
    p[f] = value;
    for (const cb of doc.cables) if (cb.profile === p.id) { applyCableProfile(cb, p); applyCableCores(cb); }
    renderCanvas();
    renderDrawer();
    updateToolbar();
    scheduleSave();
  }
  $("cprofRows").addEventListener("input", (e) => {
    const cf = e.target.dataset.cf, core = cf && coreOf(e);
    if (core) { if (e.target.tagName !== "SELECT") editProfileCore(core.p, core.i, cf, e.target.value); return; }
    const row = cprofRow(e), f = e.target.dataset.f;
    if (!row || !f || e.target.tagName === "SELECT" || e.target.type === "checkbox") return;
    editCableProfile(row, f, f === "color" ? e.target.value.toLowerCase() : e.target.value);
  });
  $("cprofRows").addEventListener("change", (e) => {
    const cf = e.target.dataset.cf, core = cf && coreOf(e);
    if (core) {
      if (e.target.tagName === "SELECT") editProfileCore(core.p, core.i, cf, e.target.value);
      if (cf === "color" || cf === "stripe") renderProfiles(); // the chip, and stripes off for green/yellow
      return;
    }
    const row = cprofRow(e), f = e.target.dataset.f;
    if (!row || !f) return;
    if (e.target.tagName === "SELECT") editCableProfile(row, f, e.target.value);
    if (e.target.type === "checkbox") editCableProfile(row, f, e.target.checked);
    if (f === "color") renderProfiles();
  });
  $("cprofRows").addEventListener("click", (e) => {
    const fb = e.target.closest("[data-fav]");
    if (fb) { toggleFav(fb); return; }
    const tog = e.target.closest("[data-cores-toggle]");
    if (tog) {
      const id = tog.closest("tr").dataset.cpid;
      if (coresOpen.has(id)) coresOpen.delete(id); else coresOpen.add(id);
      renderProfiles();
      return;
    }
    const core = coreOf(e);
    if (core && e.target.closest("[data-cadd]")) {
      // A new core looks like the last one, numbered on from it if that's numbered.
      const p = core.p, last = (p.cores || [])[p.cores?.length - 1];
      const k = last ? { ...last, mark: /^\d+$/.test(last.mark || "") ? String(+last.mark + 1) : "" }
        : { mark: "", color: "#1f1f1f", stripe: "", gauge: convertGauge("18 AWG", doc.settings.wireStd), conductor: "Stranded" };
      if (!profCheckpointed) { checkpoint(); profCheckpointed = true; }
      p.cores = [...(p.cores || []), k];
      cableProfileChanged(p);
      renderProfiles();
      const marks = $("cprofRows").querySelectorAll(`tr[data-cores="${CSS.escape(p.id)}"] [data-cf="mark"]`);
      marks[marks.length - 1]?.focus();
      return;
    }
    if (core && e.target.closest("[data-cdel]")) {
      if (!profCheckpointed) { checkpoint(); profCheckpointed = true; }
      core.p.cores.splice(core.i, 1);
      cableProfileChanged(core.p);
      renderProfiles();
      return;
    }
    const b = e.target.closest("[data-cpdel]");
    if (!b) return;
    const p = cableProfileById(b.closest("tr").dataset.cpid);
    const used = doc.cables.filter((cb) => cb.profile === p.id);
    if (used.length && !confirm(`Delete “${p.name}”? Its ${used.length} cable${used.length === 1 ? "" : "s"} keep their type and colour as custom cables.`)) return;
    checkpoint();
    for (const cb of used) cb.profile = "";
    doc.cableProfiles = doc.cableProfiles.filter((x) => x !== p);
    renderProfiles();
    refresh();
  });
  $("cprofAdd").addEventListener("click", () => {
    checkpoint();
    doc.cableProfiles.push({ id: uid("cp"), name: "New cable profile", color: "#1f1f1f", desc: "", shield: false, twisted: false, notes: "", cores: [], fav: true });
    renderProfiles();
    refresh();
    const inputs = $("cprofRows").querySelectorAll('[data-f="name"]');
    const last = inputs[inputs.length - 1];
    last.focus();
    last.select();
  });
  $("cprofLib").addEventListener("click", () => openCableLib());

  // ---------- the cable library ----------
  // Ready-made cable types (CABLE_LIBRARY, in cables.js) to add to the drawing's cable profiles. One added
  // keeps the library's id, so the library shows which are in the drawing and whether its copy differs.
  // Opened for some cables (cableLibFor: their ids), Use also gives the type to them.
  let cableLibFor = null;

  // A library cable as this drawing would have it: a copy, with its sizes in mm² in a metric drawing.
  function libCableCopy(lp) {
    const { category, ...p } = JSON.parse(JSON.stringify(lp));
    for (const k of p.cores) k.gauge = convertGauge(k.gauge, doc.settings.wireStd);
    return p;
  }

  // A profile replacing one in the drawing stays a favourite or not as that was; a new one is a favourite
  // unless it says otherwise (one from a library file can).
  function keepFav(p, old) {
    p.fav = old ? !!old.fav : p.fav !== false;
  }

  // Whether two cable profiles describe the same cable (ids aside).
  function sameCable(p, q) {
    const txt = (x, f) => x[f] || "";
    const ks = (x) => x.cores || [];
    return ["name", "color", "desc", "notes"].every((f) => txt(p, f) === txt(q, f))
      && !!p.shield === !!q.shield && !!p.twisted === !!q.twisted
      && ks(p).length === ks(q).length
      && ks(p).every((k, i) => ["mark", "color", "stripe", "gauge", "conductor"].every((f) => txt(k, f) === txt(ks(q)[i], f)));
  }

  // Put a cable profile into the drawing, replacing the one with its id, and pass it on to its cables.
  function mergeCableProfile(p) {
    const i = doc.cableProfiles.findIndex((x) => x.id === p.id);
    keepFav(p, doc.cableProfiles[i]);
    if (i >= 0) doc.cableProfiles[i] = p; else doc.cableProfiles.push(p);
    for (const cb of doc.cables) if (cb.profile === p.id) { applyCableProfile(cb, p); applyCableCores(cb); }
    return p;
  }

  function openCableLib(forIds) {
    cableLibFor = forIds && forIds.length ? forIds : null;
    $("cableLibSearch").value = "";
    renderCableLib();
    $("cableLib").hidden = false;
    $("cableLibSearch").focus();
  }

  function renderCableLib() {
    const q = $("cableLibSearch").value.trim().toLowerCase();
    const forCbs = (cableLibFor || []).map(cableById).filter(Boolean);
    const who = forCbs.length === 1 ? `cable ${forCbs[0].label || ""}`.trim() : plural(forCbs.length, "cable");
    $("cableLibFor").hidden = !forCbs.length;
    $("cableLibFor").innerHTML = forCbs.length ? `Picking a type for <b>${esc(who)}</b>: <b>Use</b> adds it to this drawing, if it isn't already, and gives it to ${forCbs.length === 1 ? "the cable" : "them"}.` : "";
    let s = "";
    for (const cat of [...new Set(CABLE_LIBRARY.map((p) => p.category))]) {
      const list = CABLE_LIBRARY.filter((p) => p.category === cat && (!q || [p.name, p.desc, p.notes, cat].join(" ").toLowerCase().includes(q)));
      if (!list.length) continue;
      s += `<h3 class="cable-lib-cat">${esc(cat)}</h3>`;
      for (const lp of list) {
        const copy = libCableCopy(lp), mine = cableProfileById(lp.id);
        const differs = mine && !sameCable(mine, copy);
        const n = doc.cables.filter((cb) => cb.profile === lp.id).length;
        const facts = [lp.desc, plural(copy.cores.length, "core"), lp.shield && "shielded", lp.twisted && "twisted pairs"].filter(Boolean).join(" · ");
        const status = mine ? (differs ? "In this drawing, changed from the library's" : "In this drawing") + (n ? ` · used by ${plural(n, "cable")}` : "") : "";
        const btns = (forCbs.length ? `<button class="small primary" data-cl="use" title="${mine ? "Give this drawing's copy to the cable" : "Add it to this drawing and give it to the cable"}${forCbs.length === 1 ? "" : "s"}">Use</button>` : "")
          + (!mine ? `<button class="small${forCbs.length ? "" : " primary"}" data-cl="add" title="Add it to this drawing's cable profiles">Add</button>`
            : differs ? `<button class="small" data-cl="update" title="Replace this drawing's copy with the library's">Update</button>` : "");
        s += `<div class="lib-offer${mine ? " loaded" : ""}" data-clid="${esc(lp.id)}">
          <div class="meta">
            <div class="name">${colorChip(lp.color)}${esc(lp.name)}</div>
            <div class="size">${esc(facts)}</div>
            <div class="cable-lib-cores">${copy.cores.map((k, i) => `<span title="Core ${i + 1}: ${esc(coreText(k))}">${colorChip(k.color, k.stripe)}</span>`).join("")}</div>
            ${lp.notes ? `<div class="size">${esc(lp.notes)}</div>` : ""}
            ${status ? `<div class="status">${esc(status)}</div>` : ""}
          </div>
          <div class="actions">${btns}</div>
        </div>`;
      }
    }
    $("cableLibList").innerHTML = s || '<p class="muted">No cables match.</p>';
  }

  $("cableLibSearch").addEventListener("input", renderCableLib);
  $("cableLibList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cl]");
    if (!b) return;
    const lp = CABLE_LIBRARY.find((p) => p.id === b.closest("[data-clid]").dataset.clid), act = b.dataset.cl;
    const mine = cableProfileById(lp.id);
    if (act === "update") {
      const n = doc.cables.filter((cb) => cb.profile === lp.id).length;
      if (!confirm(`Replace this drawing's “${mine.name}” with the library's? Changes made to it in this drawing are lost${n ? `, and its ${plural(n, "cable")} change to match` : ""}. (You can undo this.)`)) return;
    }
    checkpoint();
    // Use keeps the drawing's copy if it has one; Add and Update take the library's.
    const p = act === "use" && mine ? mine : mergeCableProfile(libCableCopy(lp));
    if (act === "use") {
      const cbs = (cableLibFor || []).map(cableById).filter(Boolean);
      for (const cb of cbs) { applyCableProfile(cb, p); applyCableCores(cb, "all"); }
      cableLibFor = null;
      $("cableLib").hidden = true;
      toast(`${cbs.length === 1 ? `${cbs[0].label || "The cable"} is` : `${plural(cbs.length, "cable")} are`} now “${p.name}”`);
    } else toast(act === "update" ? `Updated “${p.name}” from the cable library` : `Added “${p.name}” to this drawing's cable profiles`);
    refresh();
    if (!$("profModal").hidden) renderProfiles();
    if (!$("cableLib").hidden) renderCableLib();
  });

  // Edit a profile field and push the change to every wire that follows the profile.
  function editProfile(row, f, value) {
    const p = profileById(row.dataset.pid);
    if (!p) return;
    if (!profCheckpointed) { checkpoint(); profCheckpointed = true; }
    p[f] = value;
    for (const c of doc.connections) if (c.profile === p.id) applyProfile(c, p);
    renderCanvas();
    renderDrawer();
    updateToolbar();
    scheduleSave();
  }

  $("profRows").addEventListener("input", (e) => {
    const row = e.target.closest("tr[data-pid]");
    const f = e.target.dataset.f;
    if (!row || !f || e.target.tagName === "SELECT") return;
    editProfile(row, f, f === "name" || f === "gauge" ? e.target.value : e.target.value.toLowerCase());
  });
  $("profRows").addEventListener("change", (e) => {
    const row = e.target.closest("tr[data-pid]");
    const f = e.target.dataset.f;
    if (!row || !f) return;
    if (e.target.tagName === "SELECT") editProfile(row, f, e.target.value);
    if (f === "color" || f === "stripe") renderProfiles(); // refresh the chip and colour name
  });
  $("profRows").addEventListener("click", (e) => {
    const fb = e.target.closest("[data-fav]");
    if (fb) { toggleFav(fb); return; }
    const b = e.target.closest("[data-pdel]");
    if (!b) return;
    const p = profileById(b.closest("tr").dataset.pid);
    const used = doc.connections.filter((c) => c.profile === p.id);
    if (used.length && !confirm(`Delete “${p.name}”? Its ${used.length} wire${used.length === 1 ? "" : "s"} keep their colour and size as custom wires.`)) return;
    checkpoint();
    for (const c of used) c.profile = "";
    doc.wireProfiles = doc.wireProfiles.filter((x) => x !== p);
    renderProfiles();
    refresh();
  });
  $("profAdd").addEventListener("click", () => {
    checkpoint();
    doc.wireProfiles.push({ id: uid("wp"), name: "New profile", color: "#1f1f1f", gauge: convertGauge("18 AWG", doc.settings.wireStd), conductor: "Stranded", fav: true });
    renderProfiles();
    refresh();
    const inputs = $("profRows").querySelectorAll('[data-f="name"]');
    const last = inputs[inputs.length - 1];
    last.focus();
    last.select();
  });
  new MutationObserver(() => { if ($("profModal").hidden) refresh(); }).observe($("profModal"), { attributes: true, attributeFilter: ["hidden"] });

  // ---------- settings dialog ----------
  // The diagram's drawing and wiring settings. Fields use the same data-k paths as the inspector.
  let setCheckpointed = false;

  function openSettings() {
    setCheckpointed = false;
    renderSettings();
    $("settingsModal").hidden = false;
  }

  function renderSettings() {
    const s = doc.settings;
    // Two columns: the standards and how wires and cables are drawn (as in the menus at the bottom right),
    // then the labels and text they share, placing parts, and starting up.
    $("settingsBody").innerHTML = `
      <div class="set-col">
        <div class="set-group">
          <h4>Standards</h4>
          <div class="row2 wide-first">
            ${field("Wire standard", sel_("settings.wireStd", s.wireStd, Object.entries(WIRE_STANDARDS).map(([id, w]) => [id, w.name])))}
            ${field("Terminal reference", sel_("settings.termSep", s.termSep, [["-", "TB101-1"], [":", "TB101:1"], [".", "TB101.1"], ["/", "TB101/1"], [" ", "TB101 1"]]))}
          </div>
          <p class="hint-text">Changing the wire standard converts existing wires and profiles to the nearest size and the line / neutral / earth colours, and switches the print paper between American (Letter…, inches) and metric (A4…, mm).</p>
          <div class="btn-row"><button class="small" data-sact="profiles">${ic("edit", "sm")} Wire profiles…</button><button class="small" data-sact="print">${ic("file", "sm")} Print settings…</button></div>
        </div>
        <div class="set-group">
          <h4>Wires</h4>
          <div class="row2">
            ${field("Drawn as", sel_("settings.lines", s.lines, [["off", "Stubs at the terminals"], ["straight", "Straight lines"], ["curved", "Curved lines"]]))}
            ${field("Named circuits' labels show", sel_("settings.labelName", s.labelName, [["dest", "Where each wire goes"], ["circuit", "Circuit name"]]))}
          </div>
          ${chk("settings.wireLabels", s.wireLabels !== false, "Labels: where each wire goes (TB101-1)")}
          ${chk("settings.labelWire", s.labelWire, "Wire names in labels (W3 → TB101-1)")}
        </div>
        <div class="set-group">
          <h4>Cables</h4>
          ${field("Drawn", sel_("settings.cables", s.cables, [["full", "Full length"], ["break", "Broken: a tail at each end"]]))}
          ${chk("settings.labelCable", s.labelCable, "Cable names in labels (C1 → K1)")}
        </div>
      </div>
      <div class="set-col">
        <div class="set-group">
          <h4>Labels and text</h4>
          ${chk("settings.labelPage", s.labelPage !== false, "Page names for ends on another page (TB101-1 (Door))")}
          ${chk("settings.showTermNames", s.showTermNames, "Show terminal names")}
          <div class="row2">
            ${field("Tag text height (mm)", num("settings.tagSize", s.tagSize, 0.1, 'min="0.5"'))}
            ${field("Label text height (mm)", num("settings.labelSize", s.labelSize, 0.1, 'min="0.5"'))}
          </div>
        </div>
        <div class="set-group">
          <h4>Placing parts</h4>
          ${field("Snap grid", sel_("settings.grid", s.grid, [[0, "Off"], [0.5, "0.5 mm"], [1, "1 mm"], [2.5, "2.5 mm"], [5, "5 mm"]]))}
          ${chk("settings.snapEdges", s.snapEdges, "Snap to neighbours and rails")}
          <div class="field"><span>Build direction: where new parts beside a selected one, repeats and packing go</span>${dirToggle()}</div>
        </div>
        <div class="set-group">
          <h4>Starting up</h4>
          <label class="check"><input data-ui="startScreen" type="checkbox"${ui.startScreen ? " checked" : ""}> Show the start screen when DIN Stack opens</label>
          <p class="hint-text">Saved in this browser rather than with the diagram. When it's off, DIN Stack opens straight to the diagram you were working on.</p>
        </div>
      </div>`;
  }

  // Apply a settings field. Text boxes apply as you type (one undo step per visit); the rest on change.
  function applySetting(el, typing) {
    const k = el.dataset.k;
    const v = readInput(el);
    if (!k || v === undefined) return;
    if (typing) { if (!setCheckpointed) { checkpoint(); setCheckpointed = true; } } else checkpoint();
    if (k === "settings.wireStd") {
      setWireStd(v);
      toast(v === "us" ? "Wires switched to AWG and US colours, paper to Letter sizes" : "Wires switched to mm² and IEC colours, paper to A sizes");
    } else setPath(doc, k, v);
    refresh();
  }

  $("settingsBody").addEventListener("focusin", () => { setCheckpointed = false; });
  $("settingsBody").addEventListener("input", (e) => {
    if (e.target.type === "number") applySetting(e.target, true);
  });
  $("settingsBody").addEventListener("change", (e) => {
    if (e.target.dataset.ui) { ui[e.target.dataset.ui] = e.target.checked; saveUi(); return; }
    if (e.target.type !== "number") { applySetting(e.target, false); renderSettings(); }
  });
  $("settingsBody").addEventListener("click", (e) => {
    const b = e.target.closest("[data-act='dir'], [data-sact]");
    if (!b) return;
    if (b.dataset.sact === "profiles") { $("settingsModal").hidden = true; openProfiles(); return; }
    if (b.dataset.sact === "print") { $("settingsModal").hidden = true; openPrint(); return; }
    checkpoint();
    doc.settings.direction = b.dataset.dir;
    refresh();
    renderSettings();
  });

  // ---------- drawer: wire list / parts list ----------
  function wireRows() {
    return doc.connections.slice().sort((a, b) => natural(a.wire, b.wire));
  }

  function partsSummary(items = doc.items) {
    const groups = new Map();
    for (const it of items) {
      if (it.kind !== "part") continue;
      const t = tplOf(it);
      if (!t) continue;
      if (!groups.has(t.id)) groups.set(t.id, { tpl: t, tags: [] });
      groups.get(t.id).tags.push(it.tag);
    }
    return [...groups.values()].sort((a, b) => natural(a.tpl.category + a.tpl.name, b.tpl.category + b.tpl.name));
  }

  function colorChip(c, stripe) {
    if (c === "gy") return '<span class="chip gy"></span>';
    if (stripe) return `<span class="chip" style="background:repeating-linear-gradient(135deg, ${esc(c)} 0 4px, ${esc(stripe)} 4px 6px)"></span>`;
    return `<span class="chip" style="background:${esc(c)}"></span>`;
  }

  function cableRows() {
    return doc.cables.slice().sort((a, b) => natural(a.label, b.label));
  }

  // A cable's cores for lists: its wires, or with none drawn, the cores its profile lists.
  function cableCores(cb) {
    const ws = coreOrder(cb);
    if (!ws.length) return profileCores(cb).map(coreText);
    return ws.map((c) => [c.wire || "—", c.mark, wireLookName(c.color, c.stripe)].filter(Boolean).join(" "));
  }

  function busRows() {
    return doc.buses.slice().sort((a, b) => natural(a.label, b.label));
  }

  function busRefs(b) {
    return busOrder(b.terms.map((e) => ({ e, ...termPoint(e) }))).map((p) => refOf(p.e));
  }

  function renderDrawer() {
    const body = $("drawerBody");
    const counts = { wires: doc.connections.length, cables: doc.cables.length, buses: doc.buses.length, parts: doc.items.filter((i) => i.kind === "part").length, profiles: doc.wireProfiles.length, cprofiles: doc.cableProfiles.length };
    for (const el of document.querySelectorAll("[data-count]")) el.textContent = counts[el.dataset.count];
    for (const b of document.querySelectorAll(".drawer-tabs [data-tab]")) b.classList.toggle("active", b.dataset.tab === drawerTab);
    $("btnListCsv").hidden = drawerTab !== "wires";
    $("btnListProfiles").hidden = drawerTab !== "profiles" && drawerTab !== "cprofiles";
    $("btnListCableLib").hidden = drawerTab !== "cprofiles";
    if ($("drawer").classList.contains("collapsed")) return; // filled in when it's opened
    // With more than one page, the wires, cables, bus bars and parts lists say which page each is on.
    const multi = doc.pages.length > 1;
    const pageTh = multi ? "<th>Page</th>" : "";
    const pageTd = (id) => (multi ? `<td>${esc(pagesText(id))}</td>` : "");
    if (drawerTab === "wires") {
      const rows = wireRows();
      const circ = circuitOf(doc, [...sel].filter((id) => isConn(id) || busById(id)));
      const names = circuitNames(doc);
      body.innerHTML = `<table class="data-table"><thead><tr><th>Wire</th><th>From</th><th>To</th>${pageTh}<th>Circuit</th><th>Colour</th><th>Size</th><th>Conductor</th><th>Profile</th><th>Cable</th><th>Notes</th></tr></thead><tbody>
        ${rows.map((c) => `<tr data-sel="${esc(c.id)}" class="${sel.has(c.id) ? "sel" : circ.conns.has(c.id) ? "net" : ""}">
          <td><b>${esc(c.wire)}</b></td><td>${esc(refOf(c.a))}</td><td>${esc(refOf(c.b))}</td>${pageTd(c.id)}<td>${esc(names.conn.get(c.id) || "")}</td>
          <td>${colorChip(c.color, c.stripe)}${esc(wireLookName(c.color, c.stripe))}</td><td>${esc(c.gauge)}</td><td>${esc(c.conductor || "")}</td><td>${esc(profileById(c.profile)?.name || "")}</td><td>${esc(cableOf(c.id)?.label || "")}</td><td>${esc(c.notes)}</td></tr>`).join("")
        || `<tr><td colspan="${multi ? 11 : 10}" class="empty">No wires yet. Drag from one terminal to another to add one.</td></tr>`}
      </tbody></table>`;
    } else if (drawerTab === "cables") {
      body.innerHTML = `<table class="data-table"><thead><tr><th>Cable</th><th>Type</th><th>Profile</th><th>From</th><th>To</th>${pageTh}<th>Cores</th><th>Notes</th></tr></thead><tbody>
        ${cableRows().map((cb) => {
          const [a, b] = cableEnds(cb);
          const type = [cb.desc, cb.shield && "shielded", cb.twisted && "twisted pairs"].filter(Boolean).join(", ");
          return `<tr data-sel="${esc(cb.id)}" class="${sel.has(cb.id) ? "sel" : ""}">
          <td>${colorChip(cb.color)}<b>${esc(cb.label)}</b></td><td>${esc(type)}</td><td>${esc(cableProfileById(cb.profile)?.name || "")}</td><td>${esc(a)}</td><td>${esc(b)}</td>${pageTd(cb.id)}<td>${esc(cableCores(cb).join(", "))}</td><td>${esc(cb.notes || "")}</td></tr>`;
        }).join("")
        || `<tr><td colspan="${multi ? 8 : 7}" class="empty">No cables yet. Select some wires and choose “Bundle into a cable”, right-click a terminal and choose “Cable from here…”, or drag from a cable connector to another connector or to a terminal.</td></tr>`}
      </tbody></table>`;
    } else if (drawerTab === "buses") {
      const circ = circuitOf(doc, [...sel].filter((id) => isConn(id) || busById(id)));
      const names = circuitNames(doc);
      body.innerHTML = `<table class="data-table"><thead><tr><th>Bus bar</th><th>Terminals</th>${pageTh}<th>Circuit</th><th>Colour</th><th>Notes</th></tr></thead><tbody>
        ${busRows().map((b) => `<tr data-sel="${esc(b.id)}" class="${sel.has(b.id) ? "sel" : circ.buses.has(b.id) ? "net" : ""}">
          <td><b>${esc(b.label)}</b></td><td>${esc(busRefs(b).join(", "))}</td>${pageTd(b.id)}<td>${esc(names.bus.get(b.id) || "")}</td>
          <td>${colorChip(b.color)}${esc(wireColorName(b.color))}</td><td>${esc(b.notes)}</td></tr>`).join("")
        || `<tr><td colspan="${multi ? 6 : 5}" class="empty">No bus bars yet. Right-click empty space on the drawing, choose “Bus bar…”, then click the terminals to bridge.</td></tr>`}
      </tbody></table>`;
    } else if (drawerTab === "profiles") {
      const picked = new Set(doc.connections.filter((c) => sel.has(c.id)).map((c) => c.profile));
      body.innerHTML = `<table class="data-table"><thead><tr><th class="fav-col" title="Favourites: offered in the drop-downs and right-click menus">★</th><th>Profile</th><th>Colour</th><th>Size</th><th>Conductor</th><th>Wires</th></tr></thead><tbody>
        ${doc.wireProfiles.map((p) => `<tr data-prof="${esc(p.id)}" class="${picked.has(p.id) ? "net" : ""}" title="Select the wires with this profile">
          <td class="fav-col">${favBtn(p, "wire")}</td><td><b>${esc(p.name)}</b></td><td>${colorChip(p.color, p.stripe)}${esc(wireLookName(p.color, p.stripe))}</td><td>${esc(p.gauge)}</td><td>${esc(p.conductor || "")}</td>
          <td>${doc.connections.filter((c) => c.profile === p.id).length}</td></tr>`).join("")
        || '<tr><td colspan="6" class="empty">No wire profiles yet. Click Edit… to add one.</td></tr>'}
      </tbody></table>`;
    } else if (drawerTab === "cprofiles") {
      const picked = new Set(doc.cables.filter((cb) => sel.has(cb.id)).map((cb) => cb.profile));
      body.innerHTML = `<table class="data-table"><thead><tr><th class="fav-col" title="Favourites: offered in the drop-downs and right-click menus">★</th><th>Profile</th><th>Type</th><th>Sheath</th><th>Cores</th><th>Cables</th><th>Notes</th></tr></thead><tbody>
        ${doc.cableProfiles.map((p) => `<tr data-cprof="${esc(p.id)}" class="${picked.has(p.id) ? "net" : ""}" title="Select the cables with this profile">
          <td class="fav-col">${favBtn(p, "cable")}</td><td><b>${esc(p.name)}</b></td><td>${esc([p.desc, p.shield && "shielded", p.twisted && "twisted pairs"].filter(Boolean).join(", "))}</td>
          <td>${colorChip(p.color)}${esc(wireColorName(p.color))}</td><td>${(p.cores || []).length || ""}</td>
          <td>${doc.cables.filter((cb) => cb.profile === p.id).length}</td><td>${esc(p.notes || "")}</td></tr>`).join("")
        || '<tr><td colspan="7" class="empty">No cable profiles yet. Add the cables this drawing uses from the cable library.</td></tr>'}
      </tbody></table>`;
    } else {
      const parts = doc.items.filter((i) => i.kind === "part" && tplOf(i)).sort((a, b) => natural(a.tag || "~", b.tag || "~"));
      const summary = partsSummary().map((g) => `${g.tags.length} × ${esc(g.tpl.name)}`).join(" · ");
      body.innerHTML = `<table class="data-table"><thead><tr><th>Tag</th><th>Type</th><th>Description</th>${pageTh}<th>Size (mm)</th><th>Wired terminals</th></tr></thead><tbody>
        ${parts.map((it) => {
          const t = tplOf(it);
          const used = new Set();
          for (const c of doc.connections) for (const e of [c.a, c.b]) if (e.item === it.id) used.add(e.term);
          for (const b of doc.buses) for (const e of b.terms) if (e.item === it.id) used.add(e.term);
          return `<tr data-sel="${esc(it.id)}" class="${sel.has(it.id) ? "sel" : ""}"><td><b>${esc(it.tag || "—")}</b></td><td>${esc(t.name)}</td><td>${esc(it.desc)}</td>${pageTd(it.id)}<td>${r3(t.w)} × ${r3(t.h)}</td><td>${used.size} / ${t.terminals.length}</td></tr>`;
        }).join("") || `<tr><td colspan="${multi ? 6 : 5}" class="empty">No parts yet. Click an object in the library to add one.</td></tr>`}
        ${summary ? `<tr class="summary"><td colspan="${multi ? 6 : 5}">${summary}</td></tr>` : ""}
      </tbody></table>`;
    }
    filterDrawer();
  }

  // Hide list rows that don't contain the filter text.
  function filterDrawer() {
    const q = $("listFilter").value.trim().toLowerCase();
    const rows = [...$("drawerBody").querySelectorAll("tbody tr[data-sel], tbody tr[data-prof], tbody tr[data-cprof]")];
    let shown = 0;
    for (const r of rows) {
      const on = !q || r.textContent.toLowerCase().includes(q);
      r.hidden = !on;
      if (on) shown++;
    }
    $("drawerBody").querySelector(".no-match")?.remove();
    if (q && rows.length && !shown) {
      const cols = $("drawerBody").querySelectorAll("thead th").length;
      $("drawerBody").querySelector("tbody").insertAdjacentHTML("afterbegin", `<tr class="no-match"><td colspan="${cols}" class="empty">Nothing matches “${esc(q)}”.</td></tr>`);
    }
  }

  function setDrawerClosed(closed) {
    ui.drawerClosed = closed;
    saveUi();
    $("drawer").classList.toggle("collapsed", closed);
    renderDrawer();
  }

  function showDrawerTab(tab) {
    drawerTab = ui.drawerTab = tab;
    saveUi();
    if ($("drawer").classList.contains("collapsed")) setDrawerClosed(false); else renderDrawer();
  }

  $("drawer").addEventListener("click", (e) => {
    const tab = e.target.closest("[data-tab]");
    if (tab) { showDrawerTab(tab.dataset.tab); return; }
    if (e.target.closest("#btnDrawerToggle")) { setDrawerClosed(!$("drawer").classList.contains("collapsed")); return; }
    if (e.target.closest("#btnListProfiles")) { openProfiles(drawerTab === "cprofiles"); return; }
    if (e.target.closest("#btnListCableLib")) { openCableLib(); return; }
    const fb = e.target.closest("[data-fav]");
    if (fb) { toggleFav(fb); return; }
    const prof = e.target.closest("[data-prof]");
    if (prof) { sel = new Set(doc.connections.filter((c) => c.profile === prof.dataset.prof).map((c) => c.id)); refresh(); return; }
    const cprof = e.target.closest("[data-cprof]");
    if (cprof) { sel = new Set(doc.cables.filter((cb) => cb.profile === cprof.dataset.cprof).map((cb) => cb.id)); refresh(); return; }
    const row = e.target.closest("[data-sel]");
    if (row) {
      // Something on another page opens that page.
      const pgs = pagesOf(row.dataset.sel);
      if (pgs.length && !pgs.includes(doc.page)) doc.page = pgs[0];
      sel = new Set([row.dataset.sel]);
      refresh();
    }
  });
  $("drawer").querySelector(".drawer-bar").addEventListener("dblclick", (e) => {
    if (!e.target.closest("button, input")) setDrawerClosed(!$("drawer").classList.contains("collapsed"));
  });
  $("listFilter").addEventListener("input", filterDrawer);

  // Drag the top edge of the lists to make them taller or shorter.
  (() => {
    const grip = $("drawerGrip");
    let start = null;
    const setH = (h) => { $("drawerBody").style.height = Math.round(Math.max(80, Math.min(innerHeight * 0.7, h))) + "px"; };
    setH(ui.drawerH);
    grip.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      start = { y: e.clientY, h: $("drawerBody").offsetHeight };
      grip.classList.add("on");
      grip.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    grip.addEventListener("pointermove", (e) => { if (start) setH(start.h + start.y - e.clientY); });
    const end = () => {
      if (!start) return;
      start = null;
      grip.classList.remove("on");
      ui.drawerH = $("drawerBody").offsetHeight;
      saveUi();
    };
    grip.addEventListener("pointerup", end);
    grip.addEventListener("pointercancel", end);
  })();

  // ---------- files & export ----------
  function saveFile() {
    download(slug(doc.meta.title) + ".json", JSON.stringify(doc, null, 2), "application/json");
  }

  // Save with a name and folder of your choosing, where the browser allows it (Chrome, Edge); elsewhere it
  // asks for a file name and downloads it as Save does.
  async function saveFileAs() {
    const data = JSON.stringify(doc, null, 2), name = slug(doc.meta.title) + ".json";
    if (window.showSaveFilePicker) {
      try {
        const h = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: "DIN Stack diagram", accept: { "application/json": [".json"] } }] });
        const w = await h.createWritable();
        await w.write(data);
        await w.close();
        toast("Saved " + h.name);
      } catch (err) {
        if (err.name !== "AbortError") alert("The diagram couldn't be saved: " + err.message);
      }
      return;
    }
    let as = prompt("Save as", name);
    if (!as || !as.trim()) return;
    as = as.trim();
    download(/\.json$/i.test(as) ? as : as + ".json", data, "application/json");
  }

  function readJSONFile(file, cb) {
    const r = new FileReader();
    r.onload = () => {
      try { cb(JSON.parse(r.result)); } catch (err) { alert("That file could not be read: " + err.message); }
    };
    r.readAsText(file);
  }

  $("fileInput").addEventListener("change", (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    readJSONFile(f, (d) => {
      if (!d || !Array.isArray(d.items) || !Array.isArray(d.templates)) { alert("That doesn’t look like a DIN Stack diagram file."); return; }
      checkpoint();
      doc = normalize(d);
      sel.clear();
      hiddenWires = null;
      afterLoad();
      requestAnimationFrame(fit);
      toast("Opened " + f.name);
    });
  });

  $("libFileInput").addEventListener("change", (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    readJSONFile(f, (d) => importLibrary(d, f.name));
  });

  // Merge a library file into the diagram. Types without a library of their own join one named
  // after the file: its "name", the name given by the caller, or the file name.
  // opts.refresh: reloading a library already in the diagram, so the library shown stays as it
  // is and the library's types that the file no longer has are removed, unless parts use them.
  // opts.quiet: no toast (the caller reports).
  function importLibrary(d, fileName, name, opts = {}) {
    const list = d && Array.isArray(d.templates) ? d.templates : null;
    if (!list) { alert("No object types found in that file."); return; }
    checkpoint();
    const fileLib = (typeof d.name === "string" && d.name.trim()) || name || fileName.replace(/\.json$/i, "").replace(/[-_]+/g, " ").trim() || "Imported";
    const libs = new Set();
    let added = 0, updated = 0;
    for (const t of list) {
      if (!t || !t.id || !(t.w > 0) || !(t.h > 0)) continue;
      t.terminals = t.terminals || [];
      if (!String(t.library || "").trim() && !isBuiltinId(t.id)) t.library = fileLib;
      upgradeTemplate(t);
      libs.add(t.library);
      const i = doc.templates.findIndex((x) => x.id === t.id);
      if (i >= 0) { doc.templates[i] = t; updated++; } else { doc.templates.push(t); added++; }
    }
    let profiles = 0;
    for (const p of Array.isArray(d.wireProfiles) ? d.wireProfiles : []) {
      if (!p || !p.id || !p.name) continue;
      const i = doc.wireProfiles.findIndex((x) => x.id === p.id);
      keepFav(p, doc.wireProfiles[i]);
      if (i >= 0) doc.wireProfiles[i] = p; else doc.wireProfiles.push(p);
      for (const c of doc.connections) if (c.profile === p.id) applyProfile(c, p);
      profiles++;
    }
    for (const p of Array.isArray(d.cableProfiles) ? d.cableProfiles : []) {
      if (!p || !p.id || !p.name) continue;
      mergeCableProfile(p);
      profiles++;
    }
    const names = [...libs];
    let dropped = 0;
    if (opts.refresh && names.length === 1) {
      const inFile = new Set(list.map((t) => t && t.id));
      const used = new Set(doc.items.filter((i) => i.kind === "part").map((i) => i.tpl));
      const keep = (t) => t.library !== names[0] || inFile.has(t.id) || used.has(t.id);
      dropped = doc.templates.filter((t) => !keep(t)).length;
      doc.templates = doc.templates.filter(keep);
    }
    cleanConnections();
    if (names.length === 1 && typeof d.version === "string" && d.version) doc.libVersions[names[0]] = d.version;
    // Show what was imported: its library, or all libraries if the file held several.
    if (names.length && !opts.refresh) setLib(names.length > 1 ? ALL_LIBS : names[0]); else renderLibrary();
    refresh();
    if (opts.quiet) return;
    const into = names.length === 1 ? ` into “${names[0]}”` : names.length > 1 ? ` into ${names.length} libraries` : "";
    toast(`Imported ${added} new and ${updated} updated object type${added + updated === 1 ? "" : "s"}${into}${profiles ? ` and ${profiles} profile${profiles === 1 ? "" : "s"}` : ""}${dropped ? `, and removed ${dropped} no longer in it` : ""}`);
  }

  // Remove a library's types from the diagram, and the parts that use them.
  function unloadLibrary(name) {
    const ids = new Set(doc.templates.filter((t) => t.library === name).map((t) => t.id));
    const used = doc.items.filter((i) => i.kind === "part" && ids.has(i.tpl));
    const msg = used.length
      ? `Unload “${name}”? ${used.length} part${used.length > 1 ? "s" : ""} on the diagram ${used.length > 1 ? "use" : "uses"} its types and will be removed too, with their wires. (You can undo this.)`
      : `Unload “${name}”? Its ${ids.size} object type${ids.size === 1 ? "" : "s"} will be removed from this diagram. (You can undo this.)`;
    if (!confirm(msg)) return false;
    checkpoint();
    const gone = new Set(used.map((i) => i.id));
    doc.items = doc.items.filter((i) => !gone.has(i.id));
    doc.templates = doc.templates.filter((t) => !ids.has(t.id));
    delete doc.libVersions[name];
    cleanConnections();
    sel = new Set([...sel].filter(exists));
    renderLibrary();
    refresh();
    toast(`Unloaded “${name}”`);
    return true;
  }

  // ---------- ready-made libraries ----------
  // libraries/index.json lists the library files that ship with DIN Stack. They're fetched, so the
  // chooser needs the app served over http(s); opening index.html as a file can't read them.
  const CATALOG = "libraries/index.json";
  // Each library has its own version number and history, apart from the app's. Libraries live in
  // folders under libraries/ (one folder can hold a collection), each with its own RELEASE_NOTES.md.
  const LIB_DIR = "https://github.com/mmmlinux/DIN-Stack/blob/main/libraries/";

  // Compare MAJOR.COMMIT.CHANGE version strings: negative if a is older than b.
  function compareVersions(a, b) {
    const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d) return d;
    }
    return 0;
  }

  // A library's release notes sit beside its file. The anchor is the heading GitHub gives its section
  // in a folder that holds several libraries; with one library there's no such heading and it's ignored.
  function libNotesLink(l) {
    const dir = l.file.includes("/") ? l.file.slice(0, l.file.lastIndexOf("/") + 1) : "";
    return LIB_DIR + dir + "RELEASE_NOTES.md#" + l.name.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s/g, "-");
  }

  // A catalog file path, encoded a segment at a time so its folder's slash survives.
  const libPath = (file) => "libraries/" + file.split("/").map(encodeURIComponent).join("/");

  function libChooserMsg(html) {
    $("libChooserList").innerHTML = `<p class="muted">${html}</p>`;
  }

  // The library manager lists the libraries that come with DIN Stack, with Load, Refresh and
  // Unload for each. It stays open and is redrawn after each change.
  let catalog = [];
  // Descriptions are folded away to keep the list short; these files have theirs shown.
  const libDescOpen = new Set();

  async function fetchLibrary(l) {
    const res = await fetch(libPath(l.file), { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  function loadedCatalog() {
    const have = new Set(libraries());
    return catalog.filter((l) => have.has(l.name));
  }

  function renderLibManager() {
    const have = new Set(libraries());
    const partsUsing = (name) => {
      const ids = new Set(doc.templates.filter((t) => t.library === name).map((t) => t.id));
      return doc.items.filter((i) => i.kind === "part" && ids.has(i.tpl)).length;
    };
    $("libChooserList").innerHTML = catalog.map((l, i) => {
      const inDoc = have.has(l.name), mine = doc.libVersions[l.name], parts = inDoc ? partsUsing(l.name) : 0, open = libDescOpen.has(l.file);
      // A library added before it had a version number counts as older than any version.
      const newer = inDoc && l.version && (!mine || compareVersions(mine, l.version) < 0);
      const facts = [l.types && `${l.types} object types`, l.version && `version ${esc(l.version)}`].filter(Boolean).join(" · ");
      const status = !inDoc ? "Not loaded"
        : (newer ? `<b>Update available</b>: this diagram has ${mine ? "version " + esc(mine) : "an older version"}` : "Loaded")
          + (parts ? ` · used by ${parts} part${parts === 1 ? "" : "s"}` : "");
      const buttons = inDoc
        ? `<button class="small${newer ? " primary" : ""}" data-act="refresh" data-i="${i}" title="${newer ? `Update to version ${esc(l.version)}` : "Load it again, replacing its types with the published ones"}">Refresh</button>
          <button class="small danger" data-act="unload" data-i="${i}" title="Remove its types from this diagram, and any parts that use them">Unload</button>`
        : `<button class="small primary" data-act="load" data-i="${i}" title="Add it to this diagram as its own library">Load</button>`;
      return `
      <div class="lib-offer${inDoc ? " loaded" : ""}">
        <div class="meta">
          ${l.description
            ? `<button class="lib-name-toggle${open ? "" : " closed"}" data-desc="${i}" aria-expanded="${open}" title="${open ? "Hide" : "Show"} what's in it">${ic("chev-d", "sm")}<span class="name">${esc(l.name)}</span></button>
          <div class="desc"${open ? "" : " hidden"}>${esc(l.description)}</div>`
            : `<div class="name">${esc(l.name)}</div>`}
          <div class="size">${facts}${l.version ? ` · <a href="${esc(libNotesLink(l))}" target="_blank" rel="noopener" title="What changed in each version of this library">What's new</a>` : ""}</div>
          <div class="status">${status}</div>
        </div>
        <div class="actions">${buttons}</div>
      </div>`;
    }).join("");
    $("libRefreshAll").hidden = !loadedCatalog().length;
  }

  $("libChooserList").addEventListener("click", async (e) => {
    const t = e.target.closest("[data-desc]");
    if (t) {
      const file = catalog[+t.dataset.desc].file, open = !libDescOpen.has(file);
      if (open) libDescOpen.add(file); else libDescOpen.delete(file);
      t.classList.toggle("closed", !open);
      t.setAttribute("aria-expanded", open);
      t.title = `${open ? "Hide" : "Show"} what's in it`;
      t.nextElementSibling.hidden = !open;
      return;
    }
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const l = catalog[+b.dataset.i];
    if (b.dataset.act === "unload") { if (unloadLibrary(l.name)) renderLibManager(); return; }
    b.disabled = true;
    b.textContent = "Loading…";
    try {
      importLibrary(await fetchLibrary(l), l.file, l.name, { refresh: b.dataset.act === "refresh" });
    } catch (err) {
      alert(`“${l.name}” couldn't be loaded: ${err.message}`);
    }
    renderLibManager();
  });

  async function refreshAllLibraries() {
    const loaded = loadedCatalog(), failed = [];
    $("libRefreshAll").disabled = true;
    for (const l of loaded) {
      try { importLibrary(await fetchLibrary(l), l.file, l.name, { refresh: true, quiet: true }); }
      catch (err) { failed.push(l.name); }
    }
    $("libRefreshAll").disabled = false;
    renderLibManager();
    const done = loaded.length - failed.length;
    toast(`Refreshed ${done} librar${done === 1 ? "y" : "ies"}${failed.length ? `. Couldn't load ${failed.map((n) => `“${n}”`).join(", ")}` : ""}`);
  }

  async function openLibManager() {
    $("libChooser").hidden = false;
    $("libRefreshAll").hidden = true;
    libChooserMsg("Loading…");
    let cat;
    try {
      const res = await fetch(CATALOG, { cache: "no-cache" });
      if (!res.ok) throw new Error(res.status);
      cat = await res.json();
    } catch (e) {
      libChooserMsg(`The list of libraries couldn't be loaded. It needs the online version (or an installed copy that has been online); a copy opened straight from <code>index.html</code> can't read it. You can still download a file from the <a href="https://github.com/mmmlinux/DIN-Stack/tree/main/libraries" target="_blank" rel="noopener">libraries folder</a> and use <b>Import a library file…</b>.`);
      return;
    }
    catalog = (Array.isArray(cat && cat.libraries) ? cat.libraries : []).filter((l) => l && l.file && l.name);
    if (!catalog.length) { libChooserMsg("No ready-made libraries are available yet."); return; }
    renderLibManager();
  }

  // One page of the drawing (the open one unless given) as an SVG, with the title block at the top. With
  // more than one page, the title is followed by the page's name.
  // titled false leaves out the title block at the top (the printout has a heading of its own instead).
  function exportSVGString(pxPerMm, page = doc.page, titled = true) {
    const inner = renderDiagram(doc, { interactive: false, page });
    const tmp = document.createElementNS(SVGNS, "svg");
    tmp.setAttribute("style", "position:absolute;left:-9999px;top:0;visibility:hidden");
    tmp.innerHTML = `<g>${inner}</g>`;
    document.body.appendChild(tmp);
    let bb = tmp.firstChild.getBBox();
    tmp.remove();
    if (!bb.width || !bb.height) bb = { x: 0, y: 0, width: 100, height: 50 };
    const m = 8, titleH = titled ? 16 : 0;
    const x0 = bb.x - m, y0 = bb.y - m - titleH;
    const W = bb.width + m * 2, H = bb.height + m * 2 + titleH;
    const meta = [doc.meta.revision && "Rev " + doc.meta.revision, doc.meta.date, doc.meta.author].filter(Boolean).join("  ·  ");
    const title = doc.meta.title + (doc.pages.length > 1 ? " — " + pageName(doc, page) : "");
    const head = !titled ? "" : `<text x="${x0 + m}" y="${y0 + m + 4}" font-family="${FONT}" font-size="5" font-weight="bold" fill="#1d2126">${esc(title)}</text>`
      + (meta ? `<text x="${x0 + m}" y="${y0 + m + 10}" font-family="${FONT}" font-size="3" fill="#555">${esc(meta)}</text>` : "");
    const size = pxPerMm ? `width="${Math.round(W * pxPerMm)}" height="${Math.round(H * pxPerMm)}"` : `width="${r3(W)}mm" height="${r3(H)}mm"`;
    const body = `<rect x="${r3(x0)}" y="${r3(y0)}" width="${r3(W)}" height="${r3(H)}" fill="#ffffff"/>${head}${inner}`;
    // body, x0, y0, W and H: the contents and the area they cover, for printing a part of it per sheet.
    return { svg: `<svg xmlns="${SVGNS}" ${size} viewBox="${r3(x0)} ${r3(y0)} ${r3(W)} ${r3(H)}">${body}</svg>`, W, H, x0, y0, body };
  }

  function exportPNG() {
    const probe = exportSVGString();
    const px = Math.min(10, 12000 / Math.max(probe.W, probe.H));
    const { svg: s, W, H } = exportSVGString(px);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = Math.round(W * px); c.height = Math.round(H * px);
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => download(pageFileName() + ".png", b), "image/png");
    };
    img.onerror = () => alert("Sorry, the PNG could not be created in this browser. Try SVG instead.");
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
  }

  // Exported images are of the page open, so with more than one page the file name says which.
  function pageFileName() {
    return slug(doc.meta.title) + (doc.pages.length > 1 ? "-" + slug(pageName(doc, doc.page)) : "");
  }

  function csvCell(v) {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function exportCSV() {
    const names = circuitNames(doc);
    const multi = doc.pages.length > 1;
    const rows = [["Wire", "From", "To", ...(multi ? ["Page"] : []), "Circuit", "Colour", "Size", "Conductor", "Profile", "Cable", "Notes"]];
    for (const c of wireRows()) rows.push([c.wire, refOf(c.a), refOf(c.b), ...(multi ? [pagesText(c.id)] : []), names.conn.get(c.id) || "", wireLookName(c.color, c.stripe), c.gauge, c.conductor || "", profileById(c.profile)?.name || "", cableOf(c.id)?.label || "", c.notes]);
    download(slug(doc.meta.title) + "-wires.csv", "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n"), "text/csv");
  }

  // ---------- printing ----------
  // The heading at the top of every printed sheet, the same size and in the same place on each: the title
  // (with the page's name when there's more than one), and the revision line with which sheet it is when a
  // page takes several. One line each, so it's always the same height.
  function printHead(page, sheet = "") {
    const m = doc.meta;
    const meta = [m.revision && "Revision " + m.revision, m.date, m.author].filter(Boolean).join(" · ");
    const title = m.title + (page && doc.pages.length > 1 ? " — " + page.name : "");
    return `<div class="phead"><h1>${esc(title)}</h1><div class="pmeta"><span>${esc(meta)}</span><span>${esc(sheet)}</span></div></div>`;
  }
  // The diagram's notes, under the heading on the first sheet.
  const printNotes = () => (doc.meta.notes ? `<div class="pnotes">${esc(doc.meta.notes)}</div>` : "");

  // How tall some of the printout's text comes out, in mm, on paper pw mm wide.
  function printHeight(html, pw) {
    if (!html) return 0;
    const el = document.createElement("div");
    el.className = "print-area";
    el.style.cssText = `display:flow-root;position:absolute;left:-9999px;top:0;visibility:hidden;width:${pw}mm`;
    el.innerHTML = html;
    document.body.appendChild(el);
    const h = (el.getBoundingClientRect().height * 25.4) / 96;
    el.remove();
    return h;
  }

  // How the drawing goes onto paper: which way round the paper is, and for each page printed its scale
  // and the grid of sheets it takes. Only the drawing is scaled: it fills the room under the heading
  // (room, in mm), and a page that doesn't fit one sheet at its scale is cut into tiles, one per sheet.
  // The notes go under the heading on the first sheet, so the first page's tiles are that much shorter.
  function printLayout(pr = doc.settings.print) {
    const paper = PAPERS[pr.paper] || PAPERS.a4;
    const pages = pr.pages === "none" ? []
      : pr.pages === "current" ? doc.pages.filter((p) => p.id === doc.page)
      : doc.pages.filter((p) => doc.pages.length === 1 || doc.items.some((it) => pageOf(doc, it) === p.id));
    const drawings = pages.map((p) => ({ page: p, ...exportSVGString(undefined, p.id, false) }));
    const plan = (landscape) => {
      const pw = (landscape ? paper.h : paper.w) - 2 * pr.margin;
      const ph = (landscape ? paper.w : paper.h) - 2 * pr.margin - 1; // 1 mm to spare
      const head = pr.head ? printHeight(printHead(), pw) : 0, notes = pr.head ? printHeight(printNotes(), pw) : 0;
      const out = drawings.map((d, i) => {
        const room = ph - head - (i ? 0 : notes);
        const fit = Math.min(pw / d.W, room / d.H);
        const s = pr.scale === "fit" ? fit : pr.scale === "shrink" ? Math.min(1, fit) : pr.scale === "width" ? pw / d.W : Math.max(1, +pr.percent || 100) / 100;
        const tw = pw / s, th = room / s;
        const cols = Math.max(1, Math.ceil(d.W / tw - 1e-6)), rows = Math.max(1, Math.ceil(d.H / th - 1e-6));
        return { ...d, s, tw, th, cols, rows, sheets: cols * rows, pw, room };
      });
      return { paper, landscape, ph, drawings: out, sheets: out.reduce((t, d) => t + d.sheets, 0), size: out.reduce((t, d) => t + d.s, 0) };
    };
    if (pr.orient !== "auto") return plan(pr.orient === "landscape");
    const a = plan(false), b = plan(true);
    return b.sheets < a.sheets || (b.sheets === a.sheets && b.size > a.size + 1e-9) ? b : a;
  }

  const scaleText = (s) => `${+(s * 100).toFixed(s < 0.1 ? 2 : 1)}%${Math.abs(s - 1) < 1e-9 ? " (real size)" : ""}`;

  // A line under the print settings saying what will come out.
  function printSummary() {
    const pr = doc.settings.print, L = printLayout(pr);
    const parts = [`${L.paper.name.replace(/ \(.*/, "")}, ${L.landscape ? "landscape" : "portrait"}`];
    for (const d of L.drawings) {
      const name = doc.pages.length > 1 ? d.page.name : "Drawing";
      parts.push(`${name}: ${plural(d.sheets, "sheet")}${d.sheets > 1 ? ` (${d.cols} across × ${d.rows} down)` : ""} at ${scaleText(d.s)}`);
    }
    if (pr.wires || pr.cables || pr.buses || pr.parts) parts.push("then the lists, on a new sheet");
    return parts.join(" · ");
  }

  let printCheckpointed = false;
  function openPrint() {
    printCheckpointed = false;
    renderPrint();
    $("printModal").hidden = false;
  }

  function renderPrint() {
    const pr = doc.settings.print, std = doc.settings.wireStd;
    const opt = (k, v, label) => `<option value="${esc(v)}"${String(pr[k]) === String(v) ? " selected" : ""}>${esc(label)}</option>`;
    const select = (k, opts) => `<select data-pk="${k}">${opts.map(([v, label]) => opt(k, v, label)).join("")}</select>`;
    const check = (k, label) => `<label class="check"><input type="checkbox" data-pk="${k}"${pr[k] ? " checked" : ""}> ${label}</label>`;
    // The diagram's own standard's sizes come first.
    const groups = std === "us" ? [["us", "American"], ["metric", "Metric (ISO)"]] : [["metric", "Metric (ISO)"], ["us", "American"]];
    const paper = `<select data-pk="paper">${groups.map(([g, label]) => `<optgroup label="${label}">${Object.entries(PAPERS).filter(([, p]) => p.std === g).map(([id, p]) => opt("paper", id, p.name)).join("")}</optgroup>`).join("")}</select>`;
    const marginText = (mm) => (std === "us" ? `${+(mm / 25.4).toFixed(2)} in` : `${+mm.toFixed(1)} mm`);
    const margins = [...new Set([...PRINT_MARGINS[std === "us" ? "us" : "metric"], pr.margin])].sort((a, b) => a - b);
    $("printBody").innerHTML = `
      <div class="set-group">
        <h4>Paper</h4>
        ${field("Paper size", paper)}
        <div class="row2">
          ${field("Orientation", select("orient", [["auto", "Automatic"], ["portrait", "Portrait"], ["landscape", "Landscape"]]))}
          ${field("Margins", select("margin", margins.map((m) => [m, marginText(m)])))}
        </div>
        <p class="hint-text">Paper sizes and margins follow the wire standard in Settings: American (Letter, inches) or metric (A4, mm). Pick the same paper in the print window.</p>
      </div>
      <div class="set-group">
        <h4>Scaling</h4>
        ${field("Size of the drawing", select("scale", [["fit", "Fit each page on one sheet"], ["shrink", "Real size, shrunk to fit one sheet if too big"], ["width", "Fit to the paper's width"], ["scale", "Set scale"]]))}
        ${pr.scale === "scale" ? field("Scale (% of real size)", `<input type="number" data-pk="percent" min="1" max="1000" step="5" value="${esc(pr.percent)}">`) : ""}
        <p class="hint-text">${pr.scale === "scale" ? "100% prints at real size (1:1). " : ""}${pr.scale === "width" || pr.scale === "scale" ? "A page that doesn't fit one sheet goes on over more, each sheet labelled with its row and column so they can be put together." : "Each drawing page gets a sheet of its own."}</p>
      </div>
      <div class="set-group">
        <h4>Print</h4>
        ${field("Drawing", select("pages", [["all", doc.pages.length > 1 ? "All pages" : "The drawing"], ["current", doc.pages.length > 1 ? `This page only (${pageName(doc, doc.page)})` : "The drawing"], ["none", "None, only the lists"]].filter((o, i) => doc.pages.length > 1 || i !== 1)))}
        ${check("head", "Heading on every sheet (title, page, revision), with the notes on the first")}
        <div class="row2">${check("wires", "Wire list")}${check("cables", "Cable list")}</div>
        <div class="row2">${check("buses", "Bus bar list")}${check("parts", "Parts list")}</div>
        ${doc.pages.length > 1 ? '<p class="hint-text">With one page printed, the lists only have what\'s on it.</p>' : ""}
      </div>`;
    $("printSummary").textContent = printSummary();
  }

  function setPrintOption(el, redraw) {
    const k = el.dataset.pk;
    if (!k) return;
    let v = el.type === "checkbox" ? el.checked : el.value;
    if (k === "margin") v = parseFloat(v);
    if (k === "percent") { v = parseFloat(v); if (!(v > 0)) return; }
    if (!printCheckpointed) { checkpoint(); printCheckpointed = true; }
    doc.settings.print[k] = v;
    scheduleSave();
    updateToolbar();
    if (redraw) renderPrint(); else $("printSummary").textContent = printSummary();
  }

  $("printBody").addEventListener("change", (e) => setPrintOption(e.target, true));
  $("printBody").addEventListener("input", (e) => { if (e.target.type === "number") setPrintOption(e.target, false); });

  // Print with the print settings: the drawing pages, each sheet on a page of the paper to itself, then
  // the lists starting on a new one.
  function printDoc() {
    const pr = doc.settings.print;
    const L = printLayout(pr);
    const wires = wireRows();
    const names = circuitNames(doc);
    const multi = doc.pages.length > 1;
    // With one page printed, the lists have only what's on it.
    const shown = (id) => pr.pages !== "current" || pagesOf(id).includes(doc.page);
    const pageTh = multi ? "<th>Page</th>" : "";
    const pageTd = (id) => (multi ? `<td>${esc(pagesText(id))}</td>` : "");
    const W = L.landscape ? L.paper.h : L.paper.w, H = L.landscape ? L.paper.w : L.paper.h;
    $("printPage").textContent = `@page { size: ${r3(W)}mm ${r3(H)}mm; margin: ${r3(pr.margin)}mm; }`;
    // Each sheet is the paper's printable height: the heading, the notes on the first, then the drawing
    // filling the rest. The drawing is centred on the sheet, or for a page over several sheets, on the
    // sheets put together; every sheet shows the same-sized piece, so they line up.
    let notes = pr.head ? printNotes() : "";
    let s = "";
    for (const d of L.drawings) {
      const gx = d.x0 - (d.cols * d.tw - d.W) / 2, gy = d.y0 - (d.rows * d.th - d.H) / 2;
      for (let r = 0; r < d.rows; r++) {
        for (let c = 0; c < d.cols; c++) {
          const where = d.sheets > 1 ? `Sheet ${r * d.cols + c + 1} of ${d.sheets} · row ${r + 1}, column ${c + 1}` : "";
          s += `<div class="psheet" style="height:${r3(L.ph)}mm">${pr.head ? printHead(d.page, where) : ""}${notes}`
            + `<svg xmlns="${SVGNS}" width="${r3(d.pw)}mm" height="${r3(d.room)}mm" viewBox="${r3(gx + c * d.tw)} ${r3(gy + r * d.th)} ${r3(d.tw)} ${r3(d.th)}">${d.body}</svg></div>`;
          notes = "";
        }
      }
    }
    // The lists' first page has the heading too, and the notes if no drawing had them.
    const head = pr.head ? printHead() + notes : "";
    let lists = "";
    if (pr.wires && wires.some((c) => shown(c.id))) {
      lists += `<h2>Wire list</h2><table><thead><tr><th>Wire</th><th>From</th><th>To</th>${pageTh}<th>Circuit</th><th>Colour</th><th>Size</th><th>Conductor</th><th>Profile</th><th>Cable</th><th>Notes</th></tr></thead><tbody>`;
      lists += wires.filter((c) => shown(c.id)).map((c) => `<tr><td>${esc(c.wire)}</td><td>${esc(refOf(c.a))}</td><td>${esc(refOf(c.b))}</td>${pageTd(c.id)}<td>${esc(names.conn.get(c.id) || "")}</td><td>${esc(wireLookName(c.color, c.stripe))}</td><td>${esc(c.gauge)}</td><td>${esc(c.conductor || "")}</td><td>${esc(profileById(c.profile)?.name || "")}</td><td>${esc(cableOf(c.id)?.label || "")}</td><td>${esc(c.notes)}</td></tr>`).join("");
      lists += "</tbody></table>";
    }
    if (pr.cables && doc.cables.some((cb) => shown(cb.id))) {
      lists += `<h2>Cables</h2><table><thead><tr><th>Cable</th><th>Description</th>${pageTh}<th>Cores</th><th>Notes</th></tr></thead><tbody>`;
      lists += cableRows().filter((cb) => shown(cb.id)).map((cb) => `<tr><td>${esc(cb.label)}</td><td>${esc([cb.desc, cb.to && "→ " + cb.to].filter(Boolean).join(" "))}</td>${pageTd(cb.id)}<td>${esc(cableCores(cb).join(", "))}</td><td>${esc(cb.notes || "")}</td></tr>`).join("");
      lists += "</tbody></table>";
    }
    if (pr.buses && doc.buses.some((b) => shown(b.id))) {
      lists += `<h2>Bus bars</h2><table><thead><tr><th>Bus bar</th><th>Terminals</th>${pageTh}<th>Circuit</th><th>Colour</th><th>Notes</th></tr></thead><tbody>`;
      lists += busRows().filter((b) => shown(b.id)).map((b) => `<tr><td>${esc(b.label)}</td><td>${esc(busRefs(b).join(", "))}</td>${pageTd(b.id)}<td>${esc(names.bus.get(b.id) || "")}</td><td>${esc(wireColorName(b.color))}</td><td>${esc(b.notes)}</td></tr>`).join("");
      lists += "</tbody></table>";
    }
    const groups = partsSummary(pr.pages === "current" ? pageItems() : doc.items);
    if (pr.parts && groups.length) {
      lists += `<h2>Parts list</h2><table><thead><tr><th>Qty</th><th>Type</th><th>Size (mm)</th><th>Tags</th></tr></thead><tbody>`;
      lists += groups.map((g) => `<tr><td>${g.tags.length}</td><td>${esc(g.tpl.name)}</td><td>${r3(g.tpl.w)} × ${r3(g.tpl.h)}</td><td>${esc(g.tags.filter(Boolean).sort(natural).join(", "))}</td></tr>`).join("");
      lists += "</tbody></table>";
    }
    // The lists get a page only when there are some (or, with no drawing printed, for the heading and notes).
    if (lists || (head && !L.drawings.length)) s += `<div class="plists">${head}${lists}</div>`;
    $("printArea").innerHTML = s;
    window.print();
  }

  // ---------- commands: toolbar, menus and dialog buttons ----------
  // Dialogs that Esc and a click on the backdrop close (the designer handles its own).
  const DIALOGS = ["helpModal", "historyModal", "profModal", "profPick", "libChooser", "settingsModal", "welcomeModal", "cableLib", "printModal"];

  // keepLibs false starts from just the built-in library, as it comes.
  function newDiagram(ask = true, keepLibs = true) {
    if (ask && !confirm("Start a new, empty diagram? Your object library is kept. (You can undo this.)")) return;
    checkpoint();
    {
      const std = doc.settings.wireStd, libVersions = keepLibs ? doc.libVersions : {};
      doc = normalize(newProject(keepLibs ? doc.templates : undefined));
      doc.libVersions = libVersions;
      setWireStd(std);
    }
    sel.clear();
    hiddenWires = null;
    afterLoad();
    requestAnimationFrame(fit);
  }

  // The workspace's example is fetched, so like the library list it needs the app served over http(s).
  async function fetchExample() {
    const res = await fetch(EXAMPLES[workspace], { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const d = await res.json();
    if (!d || !Array.isArray(d.items) || !Array.isArray(d.templates)) throw new Error("not a DIN Stack diagram");
    return d;
  }

  async function loadExample(ask = true) {
    if (ask && !confirm("Replace the current diagram with the example? (You can undo this.)")) return;
    let ex;
    if (workspace) {
      try { ex = await fetchExample(); }
      catch (err) { alert("The example couldn't be loaded: " + err.message); return; }
    }
    checkpoint();
    { const std = doc.settings.wireStd; doc = normalize(ex || exampleProject()); setWireStd(std); }
    sel.clear();
    hiddenWires = null;
    afterLoad();
    requestAnimationFrame(fit);
  }

  function exportLibrary() {
    // Exports the library shown, or every library when "All libraries" is picked.
    const lib = currentLib();
    const all = lib === ALL_LIBS;
    const file = { type: "dinstack-library", app: APP_VERSION, ...(all ? {} : { name: lib }), templates: shownTemplates(), wireProfiles: doc.wireProfiles, cableProfiles: doc.cableProfiles };
    download(all ? "dinstack-library.json" : slug(lib) + ".json", JSON.stringify(file, null, 2), "application/json");
  }

  function openHelp() { $("helpModal").hidden = false; }

  // The start screen, shown each time DIN Stack opens: carry on, start afresh, open a file, or load the
  // example. In a workspace (e.g. #mechatronics) that's the workspace's example, and it's the suggested
  // choice. The getting-started tips are open the first time.
  let hadSaved = false; // set at start: whether this browser had a diagram saved (in this workspace)
  // On startup the start screen counts down, then carries on with the diagram unless it's used first.
  let welTimer = null;
  function stopCountdown() {
    clearInterval(welTimer);
    welTimer = null;
    $("welCountdown").hidden = true;
  }

  function openWelcome(countdown = false) {
    const m = $("welcomeModal");
    // With nothing saved, the diagram behind is the example (a workspace's is still loading), so
    // "continue" means exploring it.
    const fresh = !hadSaved && (!!workspace || !ui.welcomed);
    const name = workspace ? workspace[0].toUpperCase() + workspace.slice(1) + " example" : "example";
    $("welContinueHead").textContent = fresh ? "Explore the " + name : "Continue";
    $("welContinueSub").textContent = fresh ? "Look around the example diagram behind this window." : "Carry on with " + (doc.meta.title || "Untitled diagram") + ".";
    $("welExample").hidden = fresh;
    $("welExampleHead").textContent = workspace ? "Reload the " + name : "Load the example";
    $("welExampleSub").textContent = (workspace ? "Replace the diagram with a fresh copy of the " + name : "Replace the diagram with the example, a small 24 V control panel") + ". You can undo this.";
    $("welcomeTips").open = !ui.welcomed;
    for (const b of m.querySelectorAll("[data-wel]")) b.classList.remove("primary");
    // Continue is the default whenever there's a diagram to carry on with.
    const main = m.querySelector(`[data-wel="${fresh || doc.items.length ? "continue" : workspace ? "example" : "blank"}"]`);
    main.classList.add("primary");
    $("welStartup").checked = ui.startScreen;
    // Only worth asking about libraries when there's more than the built-in one.
    const extra = libraries().filter((l) => l !== BUILTIN_LIBRARY);
    $("welBlankCell").classList.toggle("has-opt", extra.length > 0);
    $("welKeepLibsRow").hidden = !extra.length;
    $("welKeepLibsRow").title = "Start the new diagram with " + (extra.length ? extra.join(", ") + " as well as the built-in library" : "the built-in library") + ". Untick to start with just the built-in library.";
    $("welKeepLibs").checked = ui.keepLibs !== false;
    ui.welcomed = true;
    saveUi();
    m.hidden = false;
    main.focus();
    stopCountdown();
    if (countdown) {
      let left = 10;
      const tick = () => {
        if (left <= 0) { stopCountdown(); m.hidden = true; return; }
        $("welCountdown").textContent = `Continuing in ${left--} s…`;
      };
      $("welCountdown").hidden = false;
      tick();
      welTimer = setInterval(tick, 1000);
    }
  }

  $("welcomeModal").addEventListener("click", (e) => {
    const act = e.target.closest("[data-wel]")?.dataset.wel;
    if (!act) return;
    stopCountdown();
    $("welcomeModal").hidden = true;
    if (act === "blank") newDiagram(false, $("welKeepLibsRow").hidden || $("welKeepLibs").checked);
    if (act === "example") loadExample(false);
    if (act === "open") $("fileInput").click();
    if (act === "help") openHelp();
  });
  for (const ev of ["pointerdown", "keydown"]) $("welcomeModal").addEventListener(ev, stopCountdown);
  $("welStartup").addEventListener("change", (e) => { ui.startScreen = e.target.checked; saveUi(); });
  $("welKeepLibs").addEventListener("change", (e) => { ui.keepLibs = e.target.checked; saveUi(); });

  const commands = {
    new: newDiagram,
    open: () => $("fileInput").click(),
    save: saveFile,
    saveAs: saveFileAs,
    cut: cutSelection,
    copy: copySelection,
    paste,
    duplicate: duplicateSelection,
    delete: deleteSelection,
    selectAll: () => { sel = new Set(selectableAll()); refresh(); },
    selectNone: () => { sel.clear(); refresh(); },
    find: findInLists,
    example: loadExample,
    print: openPrint,
    doPrint: () => { $("printModal").hidden = true; printDoc(); },
    exportSvg: () => download(pageFileName() + ".svg", exportSVGString().svg, "image/svg+xml"),
    addPage,
    exportPng: exportPNG,
    exportCsv: exportCSV,
    undo, redo,
    settings: openSettings,
    help: openHelp,
    showAllWires,
    welcome: openWelcome,
    zoomIn: () => zoomAt(1.25),
    zoomOut: () => zoomAt(0.8),
    fit,
    newType: newTemplate,
    libManage: openLibManager,
    libRefreshAll: refreshAllLibraries,
    libImport: () => { $("libChooser").hidden = true; $("libFileInput").click(); },
    libExport: exportLibrary,
    // With cables selected, the library can give them the type picked.
    cableLib: () => openCableLib([...sel].filter((id) => cableById(id))),
  };

  // Drop-down menus: a [data-menu] button opens the menu-list with that id.
  const openMenu = () => document.querySelector(".menu-list:not([hidden])");
  function closeMenus() {
    for (const m of document.querySelectorAll(".menu-list")) m.hidden = true;
    for (const b of document.querySelectorAll("[data-menu]")) b.setAttribute("aria-expanded", "false");
  }

  document.addEventListener("click", (e) => {
    const mb = e.target.closest("[data-menu]");
    if (mb) {
      const list = $(mb.dataset.menu);
      const show = list.hidden;
      if (show && list.id === "editMenu") updateEditMenu();
      closeMenus();
      list.hidden = !show;
      mb.setAttribute("aria-expanded", String(show));
      return;
    }
    const cb = e.target.closest("[data-cmd]");
    if (cb && !cb.disabled) { closeMenus(); commands[cb.dataset.cmd]?.(); }
    // Tabs inside dialogs: [data-pane-btn] shows the [data-pane] with the same name in its [data-tabs].
    const tb = e.target.closest("[data-pane-btn]");
    if (tb) {
      const box = tb.closest("[data-tabs]");
      for (const b of box.querySelectorAll("[data-pane-btn]")) b.classList.toggle("on", b === tb);
      for (const p of box.querySelectorAll("[data-pane]")) p.hidden = p.dataset.pane !== tb.dataset.paneBtn;
    }
  });
  // Pressing anywhere outside an open menu closes it. (Pointer down rather than click: the drawing
  // captures the pointer, so a click on it never arrives.)
  document.addEventListener("pointerdown", (e) => { if (openMenu() && !e.target.closest(".menu")) closeMenus(); }, true);
  // Moving across the menu bar while a menu is open opens the menu under the pointer.
  document.querySelector(".menus").addEventListener("pointerover", (e) => {
    const mb = e.target.closest("[data-menu]");
    if (!mb || !openMenu() || !$(mb.dataset.menu).hidden) return;
    closeMenus();
    $(mb.dataset.menu).hidden = false;
    mb.setAttribute("aria-expanded", "true");
  });

  for (const b of document.querySelectorAll(".mod-key")) b.textContent = b.textContent.replace("Ctrl+", mod);
  // Picking a kind with no filter on selects only that kind; with a filter on, it adds or removes the kind.
  $("selFilterMenu").addEventListener("click", (e) => {
    const b = e.target.closest("[data-selkind]");
    if (!b) return;
    if (!b.dataset.selkind) { setSelFilter(null); closeMenus(); return; }
    const next = new Set(selFilter || []);
    if (next.has(b.dataset.selkind)) next.delete(b.dataset.selkind); else next.add(b.dataset.selkind);
    setSelFilter(next);
  });
  // The wire and cable menus. The wire style closes the menu; the other choices leave it open to change several.
  const viewMenuClick = (e) => {
    const cs = e.target.closest("[data-cables]");
    if (cs) {
      if (cs.dataset.cables === doc.settings.cables) return;
      checkpoint();
      doc.settings.cables = cs.dataset.cables;
      refresh();
      return;
    }
    const ln = e.target.closest("[data-lname]");
    if (ln) {
      if (ln.dataset.lname === doc.settings.labelName) return;
      checkpoint();
      doc.settings.labelName = ln.dataset.lname;
      refresh();
      return;
    }
    const opt = e.target.closest("[data-wopt]");
    if (opt) {
      checkpoint();
      doc.settings[opt.dataset.wopt] = doc.settings[opt.dataset.wopt] === false;
      refresh();
      return;
    }
    const b = e.target.closest("[data-lines]");
    if (!b) return;
    closeMenus();
    if (b.dataset.lines === doc.settings.lines) return;
    checkpoint();
    doc.settings.lines = b.dataset.lines;
    refresh();
  };
  for (const m of ["linesMenu", "cablesMenu"]) $(m).addEventListener("click", viewMenuClick);
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => { $(b.dataset.close).hidden = true; }));
  for (const id of DIALOGS) $(id).addEventListener("click", (e) => { if (e.target.id === id) $(id).hidden = true; });
  $("btnLibFold").addEventListener("click", () => {
    const cats = categories(shownTemplates());
    ui.openCats = cats.every((c) => !ui.openCats.includes(c)) ? [...new Set([...ui.openCats, ...cats])] : ui.openCats.filter((c) => !cats.includes(c));
    saveUi();
    renderLibrary();
  });
  $("btnLeftCollapse").addEventListener("click", () => setLeftHidden(true));
  $("btnLeftExpand").addEventListener("click", () => setLeftHidden(false));
  setLeftHidden(!!ui.leftHidden);
  $("libPick").addEventListener("change", (e) => setLib(e.target.value));
  $("libSearch").addEventListener("input", renderLibrary);

  const lib = $("library");
  let suppressLibClick = false;
  lib.addEventListener("click", (e) => {
    const cat = e.target.closest("[data-cat]");
    if (cat) { toggleCategory(cat.dataset.cat); return; }
    const item = e.target.closest("[data-tpl]");
    if (!item || suppressLibClick) return;
    const id = item.dataset.tpl;
    const act = e.target.closest("[data-lib]");
    if (!act) { addPart(id); return; }
    if (act.dataset.lib === "edit") editTemplate(doc.templates.find((t) => t.id === id), false);
    if (act.dataset.lib === "dup") duplicateTemplate(id);
    if (act.dataset.lib === "del") deleteTemplate(id);
  });
  // Dragging from the library onto the sheet. Pointer-based rather than HTML drag-and-drop,
  // so it works the same with any mouse, touchpad, pen or touch, and shows a snapped preview.
  const dragChip = document.createElement("div");
  dragChip.className = "drag-chip";
  dragChip.hidden = true;
  document.body.appendChild(dragChip);

  function overCanvas(e) {
    const r = svg.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  }

  function endLibDrag() {
    libDrag = null;
    libGhost = "";
    dragChip.hidden = true;
    document.body.classList.remove("lib-dragging");
    renderOverlay();
  }

  function ghostSVG(ghost, tpl) {
    let s = renderPartBody(doc, ghost, tpl, 'opacity="0.65" pointer-events="none"');
    const r = termRadius(tpl);
    for (const t of tpl.terminals) {
      const p = termWorld(ghost, tpl, t);
      s += `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="#fff" stroke="#30353b" stroke-width="0.3" opacity="0.8" pointer-events="none"/>`;
    }
    const b = itemBox(ghost, tpl);
    return s + `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="none" stroke="#3b82f6" stroke-width="${1.5 / view.scale}" stroke-dasharray="${4 / view.scale} ${3 / view.scale}" pointer-events="none"/>`;
  }

  lib.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest("[data-lib]")) return;
    const item = e.target.closest("[data-tpl]");
    if (!item) return;
    libDrag = { id: item.dataset.tpl, sx: e.clientX, sy: e.clientY, active: false, pos: null };
  });

  window.addEventListener("pointermove", (e) => {
    if (!libDrag) return;
    const tpl = doc.templates.find((t) => t.id === libDrag.id);
    if (!tpl) { endLibDrag(); return; }
    if (!libDrag.active) {
      if (Math.hypot(e.clientX - libDrag.sx, e.clientY - libDrag.sy) < 5) return;
      libDrag.active = true;
      document.body.classList.add("lib-dragging");
      dragChip.textContent = tpl.name;
    }
    e.preventDefault();
    dragChip.style.left = e.clientX + 14 + "px";
    dragChip.style.top = e.clientY + 14 + "px";
    if (overCanvas(e)) {
      const w = toWorld(e);
      mouse = { x: w.x, y: w.y };
      const ghost = { id: "__ghost", kind: "part", tpl: tpl.id, tag: autoTag(tpl.prefix), desc: "", x: 0, y: 0, rot: 0 };
      const p = snapPosition(ghost, w.x - tpl.w / 2, w.y - tpl.h / 2, new Set(), tpl, e.altKey);
      ghost.x = r3(p.x); ghost.y = r3(p.y);
      libDrag.pos = { x: ghost.x, y: ghost.y };
      libGhost = ghostSVG(ghost, tpl);
      dragChip.hidden = true;
    } else {
      libDrag.pos = null;
      libGhost = "";
      dragChip.hidden = false;
    }
    renderOverlay();
  });

  window.addEventListener("pointerup", (e) => {
    if (!libDrag) return;
    const d = libDrag;
    endLibDrag();
    if (!d.active) return; // a plain click; the click handler adds the part
    suppressLibClick = true;
    setTimeout(() => { suppressLibClick = false; }, 0);
    if (d.pos && overCanvas(e)) addPart(d.id, null, d.pos);
  });
  window.addEventListener("pointercancel", () => { if (libDrag) endLibDrag(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && libDrag) { e.stopPropagation(); endLibDrag(); }
  }, true);

  new ResizeObserver(() => { applyView(); renderOverlay(); }).observe($("canvasWrap"));
  $("toolGroup").addEventListener("click", (e) => { const b = e.target.closest("[data-tool]"); if (b) setTool(b.dataset.tool); });
  setTool(ui.tool === "select" ? "select" : "wire");
  window.addEventListener("beforeunload", () => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(doc)); } catch (e) { /* ignore */ }
  });

  // ---------- version history ----------
  // The release notes (RELEASE_NOTES.md), shown by clicking the version in the corner. Like the library
  // list they're fetched, so a copy opened straight from index.html points to them on GitHub instead.
  const REPO = "https://github.com/mmmlinux/DIN-Stack";

  // The Markdown the release notes use: **bold**, *italic*, `code` and links (relative ones go to GitHub).
  function mdInline(t) {
    return esc(t)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, txt, url) => `<a href="${/^https?:/.test(url) ? url : REPO + "/blob/main/" + url}" target="_blank" rel="noopener">${txt}</a>`)
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/\*([^*]+)\*/g, "<i>$1</i>");
  }

  // Paragraphs and lists ("- " or "1. "), nested two spaces a level. The "# " title is the dialog's own.
  function mdBlocks(md) {
    let h = "";
    const open = []; // the lists open, innermost last: "ul" or "ol"
    const close = (to) => { while (open.length > to) h += `</li></${open.pop()}>`; };
    for (const line of md.split(/\r?\n/)) {
      const item = line.match(/^( *)(-|\d+\.) (.*)/);
      if (item) {
        const d = Math.floor(item[1].length / 2) + 1, tag = item[2] === "-" ? "ul" : "ol";
        close(d);
        if (open.length === d && open[d - 1] !== tag) close(d - 1);
        if (open.length === d) h += "</li><li>";
        else while (open.length < d) { open.push(tag); h += `<${tag}><li>`; }
        h += mdInline(item[3]);
      } else if (open.length && /^ +\S/.test(line)) {
        // Text running on in the item its indent belongs to.
        close(Math.max(1, Math.floor(line.match(/^ */)[0].length / 2)));
        h += " " + mdInline(line.trim());
      } else {
        close(0);
        if (line.trim() && !/^# /.test(line)) h += `<p>${mdInline(line)}</p>`;
      }
    }
    close(0);
    return h;
  }

  // The release notes, one section per minor version (1.10 holds 1.10.1 to 1.10.28), newest first. Each
  // version's points are under "### " category headings, gathered here across the minor version.
  const HISTORY_CATS = ["New features", "Improvements", "Bug fixes"];

  function historyHtml(md) {
    const entries = md.split(/^## /m).slice(1); // the file's own introduction isn't shown
    const groups = new Map();
    for (const e of entries) {
      const nl = e.indexOf("\n");
      const [ver, date = ""] = (nl < 0 ? e : e.slice(0, nl)).split(" — ").map((x) => x.trim());
      const minor = ver.split(".").slice(0, 2).join(".");
      if (!groups.has(minor)) groups.set(minor, { vers: [], dates: [], cats: new Map(), notes: [] });
      const g = groups.get(minor);
      g.vers.push(ver);
      if (date) g.dates.push(date);
      // Text before an entry's first category is a note about that version, e.g. how it was numbered.
      const [pre, ...secs] = (nl < 0 ? "" : e.slice(nl + 1)).split(/^### /m);
      const add = (cat, text) => { if (!g.cats.has(cat)) g.cats.set(cat, []); g.cats.get(cat).push(text); };
      if (!secs.length) add("Changes", pre.trim());
      else if (pre.trim()) g.notes.push(`${ver}: ${pre.trim().replace(/\s*\n\s*/g, " ")}`);
      for (const s of secs) {
        const i = s.indexOf("\n");
        add((i < 0 ? s : s.slice(0, i)).trim(), i < 0 ? "" : s.slice(i + 1).trim());
      }
    }
    // Oldest to newest, from a newest-first list.
    const span = (xs) => (xs.length > 1 && xs[0] !== xs[xs.length - 1] ? `${xs[xs.length - 1]} to ${xs[0]}` : xs[0] || "");
    let h = "";
    for (const g of groups.values()) {
      // Headed by its latest version, with the first one it started from.
      const first = g.vers[g.vers.length - 1];
      const range = [g.vers.length > 1 && `from ${first}`, span(g.dates)].filter(Boolean).join(" · ");
      const cats = [...HISTORY_CATS.filter((c) => g.cats.has(c)), ...[...g.cats.keys()].filter((c) => !HISTORY_CATS.includes(c))];
      h += `<h3>${esc(g.vers[0])}${g.vers.includes(APP_VERSION) ? '<span class="now">This version</span>' : ""}<span class="range">${esc(range)}</span></h3>`
        + cats.map((c) => `<h4>${esc(c)}</h4>${mdBlocks(g.cats.get(c).join("\n"))}`).join("")
        + (g.notes.length ? `<div class="history-notes">${g.notes.map((n) => `<p>${mdInline(n)}</p>`).join("")}</div>` : "");
    }
    return h;
  }

  async function openHistory() {
    const body = $("historyBody");
    body.innerHTML = '<p class="muted">Loading…</p>';
    $("historyModal").hidden = false;
    body.scrollTop = 0;
    try {
      const res = await fetch("RELEASE_NOTES.md", { cache: "no-cache" });
      if (!res.ok) throw new Error(res.status);
      body.innerHTML = historyHtml(await res.text());
    } catch (e) {
      body.innerHTML = `<p>This is DIN Stack <b>${esc(APP_VERSION)}</b>.</p><p class="muted">The version history couldn't be loaded. It needs the online version (or an installed copy that has been online); a copy opened straight from <code>index.html</code> can't read it. The <a href="${REPO}/blob/main/RELEASE_NOTES.md" target="_blank" rel="noopener">release notes are on GitHub</a>, and in <code>RELEASE_NOTES.md</code> next to <code>index.html</code>.</p>`;
    }
  }
  $("versionLabel").addEventListener("click", openHistory);

  // ---------- start ----------
  $("versionLabel").textContent = "v" + APP_VERSION;
  // Installable as an app (and usable offline) when served over http(s), e.g. from GitHub Pages.
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register("sw.js").catch(() => { /* not installable here; the app still works */ });
  }
  hadSaved = (() => { try { return !!localStorage.getItem(LS_KEY); } catch (e) { return false; } })();
  doc = loadInitial();
  drawerTab = ["wires", "cables", "buses", "parts", "profiles", "cprofiles"].includes(ui.drawerTab) ? ui.drawerTab : "wires";
  $("drawer").classList.toggle("collapsed", !!ui.drawerClosed);
  renderLibrary();
  applyView();
  refresh();
  requestAnimationFrame(fit);
  if (ui.startScreen) openWelcome(true);
  // A new workspace starts as its example, fetched once nothing is saved for it yet.
  if (workspace && !hadSaved) {
    fetchExample().then((d) => {
      doc = normalize(d);
      sel.clear();
      afterLoad();
      requestAnimationFrame(fit);
    }).catch((err) => toast("The " + workspace + " example couldn't be loaded: " + err.message));
  }
  // Switching to or from a workspace link loads that workspace's diagram.
  window.addEventListener("hashchange", () => {
    const h = location.hash.slice(1).toLowerCase();
    if ((Object.hasOwn(EXAMPLES, h) ? h : "") !== workspace) location.reload();
  });
})();
