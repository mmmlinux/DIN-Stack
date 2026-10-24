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
    d.settings = Object.assign({}, DEFAULT_SETTINGS, s0);
    // Older diagrams hid the destination labels with a separate tick box; that's the "None" wires mode now.
    if (d.settings.showDest === false) { if (d.settings.lines === "off") d.settings.lines = "none"; d.settings.showDest = true; }
    // "None" (no wires drawn) became stubs without labels or wire names.
    if (d.settings.lines === "none") Object.assign(d.settings, { lines: "off", wireLabels: false, labelName: "dest", labelWire: false });
    d.templates = Array.isArray(d.templates) ? d.templates : [];
    d.items = Array.isArray(d.items) ? d.items : [];
    d.connections = Array.isArray(d.connections) ? d.connections : [];
    d.buses = Array.isArray(d.buses) ? d.buses : [];
    d.cables = Array.isArray(d.cables) ? d.cables : [];
    d.wireProfiles = Array.isArray(d.wireProfiles) ? d.wireProfiles : JSON.parse(JSON.stringify(DEFAULT_PROFILES));
    // How each named circuit's wires are labelled, by circuit name: "name", "dest", or unset to follow the drawing.
    d.circuitLabels = d.circuitLabels && typeof d.circuitLabels === "object" && !Array.isArray(d.circuitLabels) ? d.circuitLabels : {};
    d.cableProfiles = Array.isArray(d.cableProfiles) ? d.cableProfiles : JSON.parse(JSON.stringify(DEFAULT_CABLE_PROFILES));
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
  }

  function toWorld(e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  function viewCenter() {
    const r = svg.getBoundingClientRect();
    return { x: view.x + r.width / view.scale / 2, y: view.y + r.height / view.scale / 2 };
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
  function setSelFilter(kinds) {
    selFilter = kinds && kinds.size && kinds.size < Object.keys(SEL_KINDS).length ? kinds : null;
    renderCanvas();
    updateToolbar();
  }
  const allows = (kind) => !selFilter || selFilter.has(kind);
  // Everything the filter lets through, for Ctrl+A.
  function selectableAll() {
    if (!selFilter) return doc.items.map((i) => i.id);
    return [
      ...doc.items.filter((i) => allows(i.kind)).map((i) => i.id),
      ...(allows("wire") ? doc.connections.filter((c) => !hiddenWires || !hiddenWires.has(c.id)).map((c) => c.id) : []),
      ...(allows("bus") ? doc.buses.map((b) => b.id) : []),
      ...(allows("cable") ? doc.cables.map((cb) => cb.id) : []),
    ];
  }

  // ---------- rendering ----------
  let gaugeListStd = null;
  function refresh() {
    if (gaugeListStd !== doc.settings.wireStd) {
      gaugeListStd = doc.settings.wireStd;
      $("gaugeList").innerHTML = wireGauges(gaugeListStd).map((g) => `<option value="${esc(g)}">`).join("");
    }
    $("netList").innerHTML = allNetNames().map((v) => `<option value="${esc(v)}">`).join("");
    renderCanvas();
    renderProps();
    renderDrawer();
    updateToolbar();
    scheduleSave();
  }

  function renderCanvas() {
    content.innerHTML = renderDiagram(doc, { interactive: true, sel, pending, busEdit, hideWires: hiddenWires });
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
    const what = busEdit.land ? `Other end of ${cableById(busEdit.id)?.label || "the cable"}`
      : cable ? (busEdit.id ? `Adding to ${cableById(busEdit.id)?.label || "the cable"}` : "New cable")
      : busEdit.id ? `Editing bus bar ${busById(busEdit.id)?.label || ""}` : "New bus bar";
    const tip = busEdit.land ? landingTip()
      : n ? `${n} picked`
      : cable ? "Click the terminals its cores go to, in order, and any cable connector it plugs into" : "Click terminals or bus bar slots, or drag along a row";
    m.innerHTML = `<b>${esc(what)}</b><span class="muted">${esc(tip)}</span>
      ${!cable && n > 2 ? `<button class="small" data-act="busAlt0" title="Keep the 1st, 3rd, 5th… along the row">Keep 1st, 3rd…</button><button class="small" data-act="busAlt1" title="Keep the 2nd, 4th, 6th… along the row">Keep 2nd, 4th…</button>` : ""}
      <button class="small primary" data-act="busDone"${busReady() ? "" : " disabled"} title="Enter">${ic("check", "sm")} Done</button>
      <button class="small" data-act="busCancel" title="Esc">Cancel</button>`;
    m.hidden = false;
  }

  function renderOverlay() {
    let s = "";
    const px = 1 / view.scale;
    const from = drag && drag.type === "wire" ? drag.from : pending;
    if (from && (pending || drag.moved)) {
      const p = termPoint(from);
      if (p) s += `<line x1="${p.x}" y1="${p.y}" x2="${mouse.x}" y2="${mouse.y}" stroke="#f59e0b" stroke-width="${2 * px}" stroke-dasharray="${6 * px} ${4 * px}" pointer-events="none"/>`;
    }
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
  const UI_DEFAULTS = { openCats: [], leftHidden: false, closedSecs: [], drawerTab: "wires", drawerH: 200, drawerClosed: false };
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
  function libraries() {
    return [...new Set(doc.templates.map((t) => t.library))];
  }
  function currentLib() {
    const libs = libraries();
    if (ui.lib === ALL_LIBS || libs.includes(ui.lib)) return ui.lib;
    return libs[0] || DEFAULT_LIBRARY;
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
        s += `<div class="lib-item" data-tpl="${esc(t.id)}" title="Click to add, or drag onto the diagram">
          <div class="thumb">${renderTemplatePreview(t, 32)}</div>
          <div class="meta"><div class="name">${esc(t.name)}</div><div class="size">${r3(t.w)} × ${r3(t.h)} mm · ${plural(t.terminals.length, "terminal")}${isLoose(t) ? " · loose" : ""}</div></div>
          <div class="acts">
            <button class="icon-btn" data-lib="edit" title="Edit this type">${ic("edit", "sm")}</button>
            <button class="icon-btn" data-lib="dup" title="Duplicate this type">${ic("copy", "sm")}</button>
            <button class="icon-btn danger" data-lib="del" title="Delete this type">${ic("trash", "sm")}</button>
          </div>
        </div>`;
      }
    }
    $("library").innerHTML = s || `<div class="muted lib-empty">${shown.length ? "No matching object types." : "This library is empty. Use <b>+ New type</b>, or <b>+</b> above to load a ready-made library."}</div>`;
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

  function editTemplate(tpl, isNew) {
    TplEditor.open(tpl, {
      isNew,
      categories: categories(),
      libraries: libraries(),
      lostCheck: isNew ? null : lostConnections,
      onSave(t) {
        checkpoint();
        const i = doc.templates.findIndex((x) => x.id === t.id);
        if (i >= 0) doc.templates[i] = t; else doc.templates.push(t);
        cleanConnections();
        // Follow the type into its library, so it doesn't vanish from view.
        if (currentLib() !== ALL_LIBS && currentLib() !== t.library) setLib(t.library); else renderLibrary();
        refresh();
        toast(isNew ? `Added “${t.name}” to ${t.library}` : `Updated “${t.name}”`);
      },
    });
  }

  function newTemplate() {
    const lib = currentLib();
    editTemplate({
      id: uid("u"), name: "", library: lib === ALL_LIBS ? DEFAULT_LIBRARY : lib, category: "Custom", prefix: "A", w: 40, h: 60,
      fill: "#dfe6ee", radius: 1, showName: true, terminals: [],
    }, true);
  }

  function duplicateTemplate(id) {
    const src = doc.templates.find((t) => t.id === id);
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = uid("u");
    copy.name = src.name + " (copy)";
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
    const it = { id: uid(), kind: "part", tpl: tplId, tag: autoTag(tpl.prefix), desc: "", x: 0, y: 0, rot: 0 };
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
    const it = { id: uid(), kind: "rail", x: Math.round((c.x - 100) / g) * g, y: Math.round((c.y - 17.5) / g) * g, length: 200, height: 35 };
    doc.items.unshift(it); // rails sit behind everything
    sel = new Set([it.id]);
    refresh();
  }

  function addText(at) {
    checkpoint();
    const c = at && "x" in at ? at : viewCenter();
    const it = { id: uid(), kind: "text", x: r3(c.x - 20), y: r3(c.y - 3), text: "Note", size: 3.5, color: "#1d2126", bold: false };
    doc.items.push(it);
    sel = new Set([it.id]);
    refresh();
    focusProp("text");
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
    doc.items = doc.items.filter((i) => !sel.has(i.id));
    doc.connections = doc.connections.filter((c) => !sel.has(c.id));
    doc.buses = doc.buses.filter((b) => !sel.has(b.id));
    // Deleting a cable unbundles it and its wires stay, except a one-ended cable, whose cores go with it.
    const cores = new Set(doc.cables.filter((cb) => cb.open && sel.has(cb.id)).flatMap((cb) => cb.wires));
    doc.connections = doc.connections.filter((c) => !cores.has(c.id));
    doc.cables = doc.cables.filter((cb) => !sel.has(cb.id));
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
    const ids = wireIds.filter((id) => connById(id));
    if (!ids.length) return;
    checkpoint();
    for (const cb of doc.cables) cb.wires = cb.wires.filter((id) => !ids.includes(id));
    let cb = into && cableById(into);
    if (cb) cb.wires.push(...ids);
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
    checkpoint();
    cb.wires = cb.wires.filter((id) => id !== connId);
    if (cb.open) doc.connections = doc.connections.filter((c) => c.id !== connId); // a core can't outlive its cable
    doc.cables = doc.cables.filter((x) => x.wires.length);
    refresh();
  }

  function unbundle(cb) {
    checkpoint();
    doc.cables = doc.cables.filter((x) => x !== cb);
    sel = new Set(cb.wires);
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

  // ---------- cable connectors ----------
  // A cable connector (a "port" terminal, e.g. an RJ45 socket) takes a cable's plug, not single wires.
  // A cable records the connectors it's plugged into as portA / portB (see cableGeometry).
  const sameEnd = (e1, e2) => !!e1 && !!e2 && e1.item === e2.item && e1.term === e2.term;
  function isPortEnd(e) {
    const t = e && tplOf(itemById(e.item))?.terminals.find((x) => x.id === e.term);
    return !!t && isPort(t);
  }
  const cableAtPort = (e) => doc.cables.find((cb) => sameEnd(cb.portA, e) || sameEnd(cb.portB, e));

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

  // Take a cable's plug out of a connector. A cable left with no cores and no plug goes.
  function unplug(cb, e) {
    checkpoint();
    if (sameEnd(cb.portA, e)) { cb.portA = cb.portB; cb.portB = null; } else if (sameEnd(cb.portB, e)) cb.portB = null;
    if (!cb.wires.length && !cb.portA) { doc.cables = doc.cables.filter((x) => x !== cb); sel.delete(cb.id); }
    cleanConnections();
    refresh();
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

  // Pick the terminals a one-ended cable's cores land on and the connectors it plugs into (a new cable, or
  // more for an existing one).
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

  // What to click next while landing a cable's other end.
  function landingTip() {
    const cores = freeCores(cableById(busEdit.id) || { wires: [] }), n = busEdit.terms.length;
    if (n >= cores.length) return `All ${plural(cores.length, "core")} have a terminal. Press Enter or click Done`;
    const k = cores[n];
    return `Core ${n + 1} of ${cores.length} (${k.c.wire || "wire"}, from ${refOf(k.near)}): click the terminal it goes to`;
  }

  // A cable whose cores land on terminals at one end and whose other end is free (not plugged in).
  const canLand = (cb) => !!cb && cb.open && !cb.portA && !cb.portB && cb.wires.length > 0;

  // Enough terminals picked to finish: a terminal for every core when landing a cable's other end.
  function busReady() {
    const n = busEdit.terms.length;
    if (busEdit.land) return n === freeCores(cableById(busEdit.id) || { wires: [] }).length;
    return n >= (busEdit.kind === "cable" ? 1 : 2);
  }

  function finishLanding() {
    const cb = cableById(busEdit.id);
    if (!cb) { cancelBus(); return; }
    const cores = freeCores(cb), picked = busEdit.terms.map(termKeyParts);
    if (picked.length !== cores.length) { toast(`Pick a terminal for each of the ${plural(cores.length, "core")}`); return; }
    const loop = cores.findIndex((k, i) => sameEnd(k.near, picked[i]));
    if (loop >= 0) { toast(`Core ${loop + 1} would start and end on ${refOf(picked[loop])}`); return; }
    checkpoint();
    // Every core runs from its old terminal (end A, where pa is) to its new one (end B).
    cores.forEach((k, i) => { k.c.a = { ...k.near }; k.c.b = { ...picked[i] }; });
    cb.open = false;
    delete cb.to;
    cb.pb = null; // was where the free end lay; now the fan-out point at the new end works itself out
    busEdit = null;
    sel = new Set([cb.id]);
    setHint("");
    refresh();
  }

  function finishCable() {
    if (busEdit.land) { finishLanding(); return; }
    let cb = busEdit.id && cableById(busEdit.id);
    const picked = busEdit.terms.map(termKeyParts);
    const plugs = [...(cb ? [cb.portA, cb.portB].filter(Boolean) : []), ...picked.filter(isPortEnd)];
    const terms = picked.filter((e) => !isPortEnd(e));
    const cores = (cb ? cb.wires.length : 0) + terms.length;
    if (!cores && !plugs.length) { toast("Pick at least one terminal or cable connector for the cable"); return; }
    if (plugs.length > 2) { toast("A cable has two ends, so it can plug into two connectors at most"); return; }
    if (cores && plugs.length > 1) { toast("A cable whose cores land on terminals can plug into one connector, at its other end"); return; }
    checkpoint();
    if (!cb) {
      cb = { id: uid("k"), label: nextCable(), desc: "", to: "", color: "#3a3f45", notes: "", open: true, wires: [], pa: null, pb: null };
      doc.cables.push(cb);
    }
    // Cores land at end A, so a plug goes at end B; with no cores, the plugs are ends A and B.
    if (cores) { cb.portA = null; cb.portB = plugs[0] || null; } else { cb.portA = plugs[0]; cb.portB = plugs[1] || null; }
    let core = Math.max(0, ...cb.wires.map(connById).filter(Boolean).map((c) => parseInt((c.a.item === cb.id ? c.a : c.b).term, 10) || 0));
    for (const e of terms) {
      const c = { id: uid("c"), a: { ...e }, b: { item: cb.id, term: String(++core) }, wire: nextWire(), notes: "" };
      initWire(c);
      doc.connections.push(c);
      cb.wires.push(c.id);
    }
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
    if (busEdit.kind === "cable") { finishCable(); return; }
    if (busEdit.terms.length < 2) { toast("Pick at least two terminals for the bus bar"); return; }
    checkpoint();
    const terms = busEdit.terms.map(termKeyParts);
    let b = busEdit.id && busById(busEdit.id);
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
  }

  function toggleBusTerm(key, onlyAdd) {
    const p = termKeyParts(key), t = tplOf(itemById(p.item))?.terminals.find((x) => x.id === p.term) || {};
    if (busEdit.land) {
      if (isSlot(t)) return;
      if (isPort(t)) { toast(`${refOf(p)} is a cable connector. To plug the cable in instead, use Plug into a connector…`); return; }
      const n = freeCores(cableById(busEdit.id) || { wires: [] }).length;
      if (!busEdit.terms.includes(key) && busEdit.terms.length >= n) { toast(`Every core has a terminal. Click a picked one to take it off, or press Enter`); return; }
    } else if (busEdit.kind === "cable") {
      if (isSlot(t)) return; // slots take bus bars, not cores
      const other = isPort(t) && !busEdit.terms.includes(key) && cableAtPort(p);
      if (other && other.id !== busEdit.id) { toast(`${refOf(p)} already has cable ${other.label || ""}`.trim()); return; }
    } else if (isPort(t)) return; // connectors take cables, not bus bars
    const i = busEdit.terms.indexOf(key);
    if (i >= 0 && !onlyAdd) busEdit.terms.splice(i, 1);
    else if (i < 0) busEdit.terms.push(key);
    else return;
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

  function rotateSelection(dir = 1) {
    const parts = [...sel].map(itemById).filter((i) => i && i.kind === "part");
    if (!parts.length) return;
    checkpoint();
    for (const it of parts) {
      const b = boxOf(it);
      it.rot = (((it.rot || 0) + 90 * dir) % 360 + 360) % 360;
      it.x = r3(it.x + (b.w - b.h) / 2);
      it.y = r3(it.y + (b.h - b.w) / 2);
    }
    refresh();
  }

  function nudge(dx, dy) {
    const items = [...sel].map(itemById).filter(Boolean);
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
      if (!cb.pa && !cb.pb) continue;
      const ws = cb.wires.map((id) => conns.get(id)).filter(Boolean);
      let ends;
      if (cb.open) {
        const near = ws.map((c) => (c.a.item === cb.id ? c.b : c.a));
        const one = near.length ? near : cb.portA ? [cb.portA] : [];
        ends = { pa: one, pb: cb.portB ? [] : one };
      } else {
        if (!ws.length || ws.some((c) => !termPoint(c.a) || !termPoint(c.b))) continue;
        const g = cableGeometry(cb, conns, (e) => ({ ...termPoint(e), e }));
        if (!g) continue;
        ends = { pa: g.cores.map((k) => k.ea.e), pb: g.cores.map((k) => k.eb.e) };
      }
      for (const key of ["pa", "pb"]) {
        const from = ends[key].map(termPoint);
        if (!cb[key] || !from.length || from.some((p) => !p)) continue;
        out.push({ cb, key, p: { ...cb[key] }, ends: ends[key], from });
      }
    }
    return out;
  }

  function followCables(anchors) {
    for (const a of anchors) {
      const now = a.ends.map(termPoint);
      const dx = now[0] ? now[0].x - a.from[0].x : 0, dy = now[0] ? now[0].y - a.from[0].y : 0;
      const together = now.every((q, i) => q && Math.abs(q.x - a.from[i].x - dx) < 1e-6 && Math.abs(q.y - a.from[i].y - dy) < 1e-6);
      a.cb[a.key] = together ? { x: r3(a.p.x + dx), y: r3(a.p.y + dy) } : { ...a.p };
    }
  }

  // Copy the given items (and wires between them) offset by dx, dy.
  function cloneItems(src, dx, dy) {
    const usedTags = new Set(doc.items.map((i) => i.tag).filter(Boolean));
    const idMap = new Map();
    const out = [];
    for (const it of src.items) {
      const c = JSON.parse(JSON.stringify(it));
      c.id = uid();
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
      const shift = (p) => p && { x: r3(p.x + dx), y: r3(p.y + dy) };
      doc.cables.push({ ...JSON.parse(JSON.stringify(cb)), id: uid("k"), label: nextCable(), wires: cb.wires.map((w) => connMap.get(w)), pa: shift(cb.pa), pb: shift(cb.pb) });
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

  function selectionPayload() {
    const items = doc.items.filter((i) => sel.has(i.id));
    const ids = new Set(items.map((i) => i.id));
    const connections = doc.connections.filter((c) => ids.has(c.a.item) && ids.has(c.b.item));
    const buses = doc.buses.filter((b) => b.terms.every((e) => ids.has(e.item)));
    const wireIds = new Set(connections.map((c) => c.id));
    const cables = doc.cables.filter((cb) => cb.wires.every((w) => wireIds.has(w)));
    return JSON.parse(JSON.stringify({ items, connections, buses, cables }));
  }

  function duplicateSelection() {
    const p = selectionPayload();
    if (!p.items.length) return;
    checkpoint();
    cloneItems(p, 10, 10);
    refresh();
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
    for (const c of doc.connections) {
      const p = profileById(c.profile);
      if (p) applyProfile(c, p);
      else convertWire(c, guessRole(c.a, c.b), from, to);
    }
    lastWire.gauge = convertGauge(lastWire.gauge, to);
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
      // Between two connectors this is a cable; a connector never takes a single wire.
      if (isPortEnd(a) && isPortEnd(b)) plugCable(a, b);
      else toast(`${refOf(isPortEnd(a) ? a : b)} is a cable connector: it takes a cable's plug, not a single wire. Right-click it to plug in a cable.`);
      return;
    }
    const same = (e1, e2) => e1.item === e2.item && e1.term === e2.term;
    const dup = doc.connections.find((c) => (same(c.a, a) && same(c.b, b)) || (same(c.a, b) && same(c.b, a)));
    if (dup) { sel = new Set([dup.id]); toast("Those terminals are already connected"); refresh(); return; }
    checkpoint();
    const c = { id: uid("c"), a: { ...a }, b: { ...b }, wire: nextWire(), notes: "" };
    initWire(c);
    doc.connections.push(c);
    sel = new Set([c.id]);
    setHint("");
    refresh();
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
      for (const o of doc.items) {
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
    return doc.items.filter((o) => {
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
    const itemEl = e.target.closest("[data-item]");
    const handleEl = e.target.closest("[data-cable-handle]");

    if (handleEl && !busEdit && !selFilter) {
      // Dragging a cable's breakout point.
      const [cid, end] = handleEl.dataset.cableHandle.split("|");
      drag = { type: "cablept", id: cid, end, sx: e.clientX, sy: e.clientY, moved: false };
      svg.setPointerCapture(e.pointerId);
      return;
    }

    if (busEdit) {
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

    if (termEl && !filtered) {
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
      const moving = new Set([...sel].filter((s) => itemById(s)));
      for (const s of [...moving]) {
        const it = itemById(s);
        if (it.kind === "rail") for (const m of mountedOn(it)) moving.add(m.id);
      }
      const orig = new Map();
      for (const s of moving) { const it = itemById(s); orig.set(s, { x: it.x, y: it.y }); }
      // Everything's starting position, for pushing neighbours along with Ctrl held.
      const all = new Map(doc.items.map((it) => [it.id, { x: it.x, y: it.y }]));
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
      if (pending) {
        setHint(t ? `Connect ${refOf(pending)} to ${refOf(termKeyParts(t.dataset.term))}` : `Wiring from ${refOf(pending)} — click another terminal (Esc to cancel)`);
        renderOverlay();
      } else if (t) {
        const k = termKeyParts(t.dataset.term);
        const count = doc.connections.filter((c) => [c.a, c.b].some((x) => x.item === k.item && x.term === k.term)).length;
        const label = String(itemById(k.item)?.termLabels?.[k.term] || "").trim();
        setHint(`${refOf(k)}${label ? ` · ${label}` : ""}${count ? ` · ${count} wire${count > 1 ? "s" : ""}` : ""} — drag to another terminal to wire it`);
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
    } else if (drag.type === "cablept") {
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 3) return;
      const cb = cableById(drag.id);
      if (!cb) return;
      if (!drag.moved) { checkpoint(); drag.moved = true; }
      const g = doc.settings.grid || 0;
      const gs = (v) => (g > 0 && !e.altKey ? Math.round(v / g) * g : r3(v));
      cb["p" + drag.end] = { x: gs(w.x), y: gs(w.y) };
      renderCanvas();
    } else if (drag.type === "wire") {
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 3) drag.moved = true;
      const t = e.target.closest && document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-term]");
      setHint(t && drag.moved ? `Connect ${refOf(drag.from)} to ${refOf(termKeyParts(t.dataset.term))}` : `Wiring from ${refOf(drag.from)}`);
      renderOverlay();
    } else if (drag.type === "marquee") {
      drag.cur = w;
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
      for (const it of doc.items) {
        if (!allows(it.kind)) continue;
        const b = boxOf(it);
        if (b.x < x2 && b.x + b.w > x1 && b.y < y2 && b.y + b.h > y1) sel.add(it.id);
      }
      if (selFilter) {
        // Filtered boxes also pick wires, bus bars and cables with an end in the box.
        const inBox = (e) => { const p = e && termPoint(e); return !!p && p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2; };
        const wireIn = (c) => !!c && [c.a, c.b].some(inBox);
        if (allows("wire")) for (const c of doc.connections) if ((!hiddenWires || !hiddenWires.has(c.id)) && wireIn(c)) sel.add(c.id);
        if (allows("bus")) for (const b of doc.buses) if (b.terms.some(inBox)) sel.add(b.id);
        if (allows("cable")) for (const cb of doc.cables) if (inBox(cb.portA) || inBox(cb.portB) || cb.wires.some((id) => wireIn(connById(id)))) sel.add(cb.id);
      }
      refresh();
    }
    renderOverlay();
  });

  svg.addEventListener("pointerleave", () => { if (!drag && !pending && !busEdit) setHint(""); });

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
    if (ctx.hidden) return;
    ctx.hidden = true;
    ctxItems = [];
  }

  // entries: { label, run, hint?, danger?, disabled?, checked? }, "-" for a divider, or { heading }.
  function showCtx(x, y, entries) {
    const list = entries.filter(Boolean).filter((e, i, a) => e !== "-" || (i > 0 && a[i - 1] !== "-" && i < a.length - 1));
    ctxItems = list;
    ctx.innerHTML = list.map((e, i) => {
      if (e === "-") return '<div class="ctx-sep"></div>';
      if (e.heading) return `<div class="ctx-head">${esc(e.heading)}</div>`;
      return `<button role="menuitem" data-i="${i}"${e.disabled ? " disabled" : ""} class="${e.danger ? "danger" : ""}${e.checked ? " checked" : ""}"><span>${esc(e.label)}</span>${e.hint ? `<kbd>${esc(e.hint)}</kbd>` : ""}</button>`;
    }).join("");
    ctx.hidden = false;
    const r = ctx.getBoundingClientRect();
    ctx.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 4)) + "px";
    ctx.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + "px";
    ctx.querySelector("button:not([disabled])")?.focus();
  }

  ctx.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-i]");
    if (!b) return;
    const entry = ctxItems[+b.dataset.i];
    hideCtx();
    entry && entry.run && entry.run();
  });
  ctx.addEventListener("keydown", (e) => {
    const btns = [...ctx.querySelectorAll("button:not([disabled])")];
    const i = btns.indexOf(document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      btns[(i + (e.key === "ArrowDown" ? 1 : -1) + btns.length) % btns.length]?.focus();
    } else if (e.key === "Escape") { e.stopPropagation(); hideCtx(); }
  });
  ctx.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("pointerdown", (e) => { if (!ctx.contains(e.target)) hideCtx(); }, true);
  window.addEventListener("blur", hideCtx);
  window.addEventListener("resize", hideCtx);
  svg.addEventListener("wheel", hideCtx, { passive: true });

  const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";

  function profileEntries(conns) {
    if (!doc.wireProfiles.length) return [];
    const cur = new Set(conns.map((c) => c.profile || ""));
    return ["-", { heading: "Wire profile" }, ...doc.wireProfiles.map((p) => ({
      label: p.name, checked: cur.size === 1 && cur.has(p.id),
      run: () => { checkpoint(); assignProfile(conns, p.id); refresh(); },
    }))];
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
      ? [["", `As for the drawing (${doc.settings.cables === "break" ? "broken" : "full length"})`], ["full", "Full length"], ["break", "Broken: a tail at each end"]]
      : [["", `As for the drawing (${doc.settings.lines === "off" ? "stubs" : "a line"})`], ["line", "A line to the other end"], ["break", "Broken: a stub at each end"]];
  }
  const breakable = (cb) => !cb.open || !!cb.portB;

  function drawEntries(list, kind) {
    if (!list.length) return [];
    const cur = new Set(list.map((x) => x.draw || ""));
    return ["-", { heading: kind === "cable" ? "Draw cable" : "Draw wire" }, ...drawOpts(kind).map(([v, l]) => ({
      label: l, checked: cur.size === 1 && cur.has(v),
      run: () => { checkpoint(); for (const x of list) if (v) x.draw = v; else delete x.draw; refresh(); },
    }))];
  }

  // Per-wire label choice for wires in named circuits: as for the circuit, its name, or where the wire goes.
  function labelEntries(conns) {
    const names = circuitNames(doc).conn;
    const named = conns.filter((c) => names.get(c.id));
    if (!named.length) return [];
    const cur = new Set(named.map((c) => c.labelShow || ""));
    const set = (v) => () => { checkpoint(); for (const c of named) if (v) c.labelShow = v; else delete c.labelShow; refresh(); };
    return ["-", { heading: "Label shows" }, ...[["", "As for the circuit"], ["name", "Circuit name"], ["dest", "Where it goes"]].map(([v, l]) => ({
      label: l, checked: cur.size === 1 && cur.has(v), run: set(v),
    }))];
  }

  function cableProfileEntries(cb) {
    if (!doc.cableProfiles.length) return [];
    return ["-", { heading: "Cable profile" }, ...doc.cableProfiles.map((p) => ({
      label: p.name, checked: cb.profile === p.id,
      run: () => { checkpoint(); applyCableProfile(cb, p); refresh(); },
    }))];
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
      "-",
      { label: `Select all ${tpl.name}`, run: () => selectSameType(it) },
    );
    if (tagPrefix(it.tag)) out.push({ label: `Select all “${tagPrefix(it.tag)}…”`, run: () => selectSamePrefix(it) });
    if (!term) out.push({ label: "New bus bar…", run: () => startBus(null) });
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
        { label: "Select all", hint: mod + "A", disabled: !doc.items.length, run: () => { sel = new Set(doc.items.map((i) => i.id)); refresh(); } },
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
        if (items.filter((i) => i.kind !== "text").length > 1) {
          out.push("-", { label: "Pack side by side", run: () => alignSelection("pack") }, { label: "Align middles", run: () => alignSelection("middle") },
            { label: "Align tops", run: () => alignSelection("top") }, { label: "Align bottoms", run: () => alignSelection("bottom") });
        }
      }
      if (wires.length || bars.length) out.push("-", { label: "Select whole circuit", run: () => selectCircuit(false) }, { label: "Select daisy chain", run: () => selectCircuit(true) });
      if (wires.length || cbs.length) out.push({ label: "Show only these wires", run: () => showOnlyWires(selectedWireIds()) });
      if (wires.length) out.push(...drawEntries(wires.filter((c) => !cableOf(c.id)), "wire"), ...labelEntries(wires), ...profileEntries(wires));
      out.push(...drawEntries(cbs.filter(breakable), "cable"));
      out.push("-", { label: `Delete ${sel.size} items`, hint: "Del", danger: true, run: deleteSelection });
      return out;
    }
    if (wires.length) {
      const c = wires[0];
      return [
        { heading: `Wire ${c.wire || ""}`.trim() },
        { label: "Select whole circuit", run: () => selectCircuit(false) },
        { label: "Select daisy chain", run: () => selectCircuit(true) },
        { label: "Show only this wire", run: () => showOnlyWires([c.id]) },
        { label: "Swap ends", run: () => swapEnds(c) },
        cableOf(c.id) ? (cableOf(c.id).open ? null : { label: `Take out of cable ${cableOf(c.id).label || ""}`.trim(), run: () => removeFromCable(c.id) }) : { label: "Bundle into a cable", run: () => bundleWires([c.id]) },
        ...drawEntries(cableOf(c.id) ? [] : [c], "wire"),
        ...labelEntries([c]),
        ...profileEntries([c]),
        "-",
        { label: "Delete wire", hint: "Del", danger: true, run: deleteSelection },
      ];
    }
    if (cbs.length) {
      const cb = cbs[0];
      if (cb.open) {
        return [
          { heading: `Cable ${cb.label || ""}`.trim() },
          cb.portA ? null : { label: "Add cores…", run: () => startCable(cb.id) },
          canLand(cb) ? { label: "Land the other end…", run: () => startLanding(cb.id) } : null,
          !cb.portB ? { label: "Plug into a connector…", run: () => startCable(cb.id) } : null,
          cb.wires.length ? { label: "Select its cores", run: () => { sel = new Set(cb.wires); refresh(); } } : null,
          { label: "Reset layout", disabled: !(cb.pa || cb.pb), run: () => { checkpoint(); cb.pa = null; cb.pb = null; refresh(); } },
          ...drawEntries(breakable(cb) ? [cb] : [], "cable"),
          ...cableProfileEntries(cb),
          "-",
          { label: "Delete cable", hint: "Del", danger: true, run: () => deleteCableAndWires(cb) },
        ];
      }
      return [
        { heading: `Cable ${cb.label || ""}`.trim() },
        { label: "Select its wires", run: () => { sel = new Set(cb.wires); refresh(); } },
        { label: "Reset fan-out points", disabled: !(cb.pa || cb.pb), run: () => { checkpoint(); cb.pa = null; cb.pb = null; refresh(); } },
        ...drawEntries([cb], "cable"),
        ...cableProfileEntries(cb),
        "-",
        { label: "Unbundle (keep wires)", hint: "Del", run: () => unbundle(cb) },
        { label: "Delete cable and wires", danger: true, run: () => deleteCableAndWires(cb) },
      ];
    }
    if (bars.length) {
      const b = bars[0];
      return [
        { heading: `Bus bar ${b.label || ""}`.trim() },
        { label: "Edit terminals…", run: () => startBus(b.id) },
        { label: "Select whole circuit", run: () => selectCircuit(false) },
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
        "-",
        { label: "Delete rail", hint: "Del", danger: true, run: deleteSelection },
      ];
    }
    if (it.kind === "text") {
      return [
        { heading: "Text note" },
        { label: "Edit text", run: () => focusProp("text") },
        { label: "Duplicate", hint: mod + "D", run: duplicateSelection },
        { label: "Copy", hint: mod + "C", run: copySelection },
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
        { heading: busEdit.kind === "cable" ? "Cable" : "Bus bar" },
        { label: "Done", hint: "Enter", disabled: !busReady(), run: finishBus },
        busEdit.kind === "cable" ? null : { label: "Keep 1st, 3rd…", disabled: busEdit.terms.length < 3, run: () => alternateBus(0) },
        busEdit.kind === "cable" ? null : { label: "Keep 2nd, 4th…", disabled: busEdit.terms.length < 3, run: () => alternateBus(1) },
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
    if (DIALOGS.some((id) => !$(id).hidden)) {
      if (e.key === "Escape") for (const id of DIALOGS) $(id).hidden = true;
      return;
    }
    const inField = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); saveFile(); return; }
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
    else if (mod && k.toLowerCase() === "v") { e.preventDefault(); paste(); }
    else if (mod && k.toLowerCase() === "a") { e.preventDefault(); sel = new Set(selectableAll()); refresh(); }
    else if (k === "Delete" || k === "Backspace") { e.preventDefault(); deleteSelection(); }
    else if (k === "Escape") {
      if (pending) { pending = null; setHint(""); renderCanvas(); }
      else if (selFilter) setSelFilter(null); // keeps what was selected with it
      else if (sel.size) { sel.clear(); refresh(); }
    }
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
    const refs = busEdit.terms.map((k) => refOf(termKeyParts(k)));
    const cable = busEdit.kind === "cable";
    const cb = cable && busEdit.id && cableById(busEdit.id);
    const title = cable ? (cb ? "Add cores to " + (cb.label || "cable") : "New cable") : busEdit.id ? "Edit bus bar " + (busById(busEdit.id)?.label || "") : "New bus bar";
    const sub = cable
      ? "Click the terminals the cable's cores go to, in core order, or drag along a row. The other end of the cable isn't drawn: say where it goes once it's made."
      : "Click terminals or bus bar slots (the small squares in the middle of terminal blocks) to add or remove them, or drag along a row to sweep them in.";
    const min = cable ? 1 : 2;
    return head(cable ? "Cable" : "Bus bar", esc(title), sub) + `<div class="picked">
      ${refs.length ? `<p><b>${plural(refs.length, cable ? "core" : "terminal")}</b></p><p class="ref-list">${esc(refs.join(", "))}</p>` : '<p class="muted">No terminals picked yet.</p>'}
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
    const cb = cableById(busEdit.id);
    const cores = freeCores(cb || { wires: [] }), picked = busEdit.terms.map(termKeyParts);
    const rows = cores.map((k, i) => `<tr${i === picked.length ? ' class="next"' : ""}><td>${colorChip(k.c.color, k.c.stripe)}${esc(k.c.wire || "—")}</td><td>${esc(refOf(k.near))} → ${picked[i] ? esc(refOf(picked[i])) : '<span class="muted">…</span>'}</td></tr>`).join("");
    const sub = "Click the terminal each core goes to, in core order, or drag along a row. Click a picked terminal again to take it off. The cable then has both ends on the drawing.";
    return head("Cable", esc("Other end of " + (cb?.label || "cable")), sub) + `<div class="picked">
      <p><b>${picked.length} of ${plural(cores.length, "core")}</b></p>
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
    const parts = doc.items.filter((i) => i.kind === "part").length;
    const stat = (n, label, tab) => `<button class="stat" data-act="tab" data-tab="${tab}" title="Show the ${label.toLowerCase()} list"><b>${n}</b><span>${label}</span></button>`;
    const profiles = doc.wireProfiles.length ? `<table class="term-list">${doc.wireProfiles.map((p) => {
      const n = doc.connections.filter((c) => c.profile === p.id).length;
      return `<tr><td>${colorChip(p.color, p.stripe)}${esc(p.name)}</td><td class="muted">${esc([p.gauge, p.conductor].filter(Boolean).join(", "))} · ${plural(n, "wire")}</td></tr>`;
    }).join("")}</table>` : '<p class="muted">No profiles yet.</p>';
    const cprofiles = doc.cableProfiles.length ? `<table class="term-list">${doc.cableProfiles.map((p) => {
      const n = doc.cables.filter((cb) => cb.profile === p.id).length;
      return `<tr><td>${colorChip(p.color)}${esc(p.name)}</td><td class="muted">${esc([p.desc, p.shield && "shielded", p.twisted && "twisted pairs"].filter(Boolean).join(", "))} · ${plural(n, "cable")}</td></tr>`;
    }).join("")}</table>` : '<p class="muted">No cable profiles yet.</p>';
    const sub = [m.revision && "Revision " + m.revision, m.date, m.author].filter(Boolean).map(esc).join(" · ");
    return head("Diagram", esc(m.title || "Untitled diagram"), sub || "Nothing selected")
      + `<div class="stats">${stat(parts, "Parts", "parts")}${stat(doc.connections.length, "Wires", "wires")}${stat(doc.cables.length, "Cables", "cables")}${stat(doc.buses.length, "Bus bars", "buses")}</div>`
      + body(section("diag.title", "Title block", `
        <div class="row2">${field("Revision", inp("meta.revision", m.revision))}${field("Date", inp("meta.date", m.date, "date"))}</div>
        ${field("Author", inp("meta.author", m.author))}
        ${field("Notes", area("meta.notes", m.notes, 3))}
        <p class="hint-text">Shown on the printout and at the top of exported images. The title is at the top of the window.</p>`)
      + section("diag.profiles", "Wire profiles", profiles + `<div class="btn-row" style="margin-top:8px"><button class="small" data-act="profiles">${ic("edit", "sm")} Edit wire profiles…</button></div>`, doc.wireProfiles.length)
      + section("diag.cprofiles", "Cable profiles", cprofiles + `<div class="btn-row" style="margin-top:8px"><button class="small" data-act="cprofiles">${ic("edit", "sm")} Edit cable profiles…</button></div>`, doc.cableProfiles.length));
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
      return `<tr><td>${esc(t.name)}</td><td>${label}${refs || (isSlot(t) ? '<span class="muted">Bus bar slot</span>' : "")}</td></tr>`;
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
      actBtn("dup", "copy", "Duplicate (Ctrl+D)") + sepEl + actBtn("delete", "trash", "Delete (Del)"))
      + body(section("text.main", "Note", `
        ${field("Text", area("text", it.text, 4))}
        <div class="row2">${field("Size (mm)", num("size", it.size, 0.5, 'min="0.5"'))}${field("Colour", inp("color", it.color || "#1d2126", "color"))}</div>
        ${chk("bold", it.bold, "Bold")}
        <div class="row2">${field("X (mm)", num("x", it.x))}${field("Y (mm)", num("y", it.y))}</div>`));
  }

  function connProps(c) {
    const cb = cableOf(c.id);
    const acts = actBtn("swap", "swap", "Swap From and To") + actBtn("selCircuit", "wire", "Select the whole circuit") + sepEl + actBtn("delete", "trash", "Delete wire (Del)");
    const cable = cb
      ? `<p style="margin:0 0 8px"><a class="link" data-conn-link="${esc(cb.id)}">${esc(cb.label || "Cable")}${cb.desc ? " · " + esc(cb.desc) : ""}</a></p>
         ${cb.open ? '<p class="hint-text">This wire is a core of a cable whose other end isn’t drawn. To draw it, select the cable and use <i>Land the other end…</i></p>' : '<div class="btn-row"><button class="small" data-act="cableRemove">Take out of cable</button></div>'}`
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

  // Profile picker; choosing one assigns it to the selected wire(s). "mixed" shows when selected wires differ.
  function profileSelect(current, mixed) {
    const opts = (mixed ? [["__mixed", "(mixed)"]] : []).concat([["", "Custom (no profile)"]], doc.wireProfiles.map((p) => [p.id, profileLabel(p)]));
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
    const direct = circuitOf(doc, [id], { direct: true });
    const chain = direct.conns.size + direct.buses.size;
    return section("circuit", `Circuit${name ? " · " + esc(name) : ""}`, `
      ${field("Circuit name", `<input type="text" data-circ="${esc(id)}" list="netList" value="${esc(name || "")}" placeholder="e.g. +24V, 0V, L1">`)}
      ${name ? field("Circuit's labels show", `<select data-clabel="${esc(netKey(name))}" title="What this circuit's wire labels show, overriding Named circuits show for the drawing">${[
        ["", `As set for the drawing (${doc.settings.labelName === "circuit" ? "circuit name" : "where each wire goes"})`],
        ["name", "Circuit name"], ["dest", "Where each wire goes"],
      ].map(([v, l]) => `<option value="${v}"${(doc.circuitLabels[netKey(name)] || "") === v ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`) : ""}
      ${isConn(id) ? labelShowField([connById(id)]) : ""}
      <p class="hint-text">${parts.length ? parts.join(", ") : "Nothing else connected"} · ${plural(terms.length, "terminal")}</p>
      ${rows.length ? `<table class="term-list">${rows.join("")}</table>` : ""}
      ${rows.length ? `<div class="btn-row" style="margin-top:8px"><button class="small" data-act="selCircuit">Select whole circuit</button>${chain > 1 && chain < rows.length + 1 ? `<button class="small" data-act="selChain" title="Only the wires and bus bars joined at the same terminals, not those on the far side of a terminal block or inside other parts">Select daisy chain (${chain})</button>` : ""}</div>` : ""}
      <div class="field"><span>Terminals</span><p class="ref-list">${esc(terms.join(", "))}</p></div>
      <p class="hint-text">Circuits follow wires, bus bars and terminals linked inside a part. Terminals with the same connector label, and wires with the same circuit name, are one circuit even without a wire between them.</p>`);
  }

  // A cable's two ends, for headings and lists: the connector it's plugged into, the parts its cores land
  // on, or where its free end goes.
  function cableEnds(cb) {
    const ws = cb.wires.map(connById).filter(Boolean);
    const parts = (es) => [...new Set(es.map((e) => refOf(e).split(doc.settings.termSep)[0]))].join(", ");
    if (!cb.open) return [parts(ws.map((c) => c.a)), parts(ws.map((c) => c.b))];
    const a = cb.portA ? refOf(cb.portA) : parts(ws.map((c) => (c.a.item === cb.id ? c.b : c.a)));
    return [a, cb.portB ? refOf(cb.portB) : cb.to || "not drawn"];
  }

  const cableProfileById = (id) => (id ? doc.cableProfiles.find((p) => p.id === id) : null);

  function cableProfileSelect(current) {
    const opts = [["", "Custom (no profile)"], ...doc.cableProfiles.map((p) => [p.id, [p.name, p.desc].filter(Boolean).join(" — ")])];
    return `<select data-cpf="assign">${mixedOpt(current)}${opts.map(([v, l]) => `<option value="${esc(v)}"${current === v ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  }

  function cableProps(cb) {
    const ws = cb.wires.map(connById).filter(Boolean);
    const near = (c) => (c.a.item === cb.id ? c.b : c.a);
    const [endA, endB] = cableEnds(cb);
    const prof = cableProfileById(cb.profile);
    const canPlug = !cb.portB; // a cable with cores, or plugged in at one end, can take a plug at its other end
    const rows = ws.map((c) => `<tr><td>${colorChip(c.color, c.stripe)}<a data-conn-link="${esc(c.id)}">${esc(c.wire || "—")}</a></td><td>${cb.open ? `${esc(refOf(c.a.item === cb.id ? c.a : c.b))} → ${esc(refOf(near(c)))}` : `${esc(refOf(c.a))} ↔ ${esc(refOf(c.b))}`}</td><td class="x"><button class="icon-btn" data-core="${esc(c.id)}" title="${cb.open ? "Remove this core" : "Take this wire out of the cable"}">${ic("x", "sm")}</button></td></tr>`).join("");
    const reset = `<button class="small" data-act="cableReset" title="Put the ${cb.open ? "fan-out and end points" : "fan-out points"} back where they're worked out automatically"${cb.pa || cb.pb ? "" : " disabled"}>${cb.open ? "Reset layout" : "Reset fan-out points"}</button>`;
    const both = !cb.open || (cb.portA && cb.portB); // two drawn ends, rather than one end and where it goes
    const sub = (ws.length ? plural(ws.length, "core") + " · " : "") + `${esc(endA)} ${cb.open && !cb.portB && !cb.to ? "· other end not drawn" : (both ? "↔ " : "→ ") + esc(endB)}`;
    const acts = (cb.open && !cb.portA ? actBtn("cableCores", "plus", "Add cores…") : "") + (canLand(cb) ? actBtn("cableLand", "wire", "Land the other end…") : "") + (ws.length ? actBtn("cableSelect", "wire", cb.open ? "Select its cores" : "Select its wires") : "")
      + sepEl + actBtn("cableDelete", "trash", cb.open ? "Delete cable" : "Delete cable and wires");
    const plugRow = (end, e) => `<tr><td>End ${end}</td><td>${esc(refOf(e))}</td><td class="x"><button class="icon-btn" data-unplug="${end}" title="Unplug the cable from this connector">${ic("x", "sm")}</button></td></tr>`;
    const plugs = cb.open ? section("cable.plugs", "Connectors", `
        ${cb.portA || cb.portB ? `<table class="term-list">${cb.portA ? plugRow("A", cb.portA) : ""}${cb.portB ? plugRow("B", cb.portB) : ""}</table>` : ""}
        <p class="hint-text">${!ws.length
          ? "A cable plugged into connectors doesn't draw its cores. Describe them with its type, e.g. Cat6 4×2×AWG24."
          : "A cable whose cores land on terminals can plug into a connector at its other end, such as a motor's socket."}</p>
        ${canPlug ? `<div class="btn-row"><button class="small" data-act="cablePlug" title="Pick the cable connector its other end plugs into">${ic("plus", "sm")} Plug into a connector…</button></div>` : ""}`, (cb.portA ? 1 : 0) + (cb.portB ? 1 : 0)) : "";
    return head("Cable", esc(cb.label || "Cable"), sub, acts) + body(
      section("cable.main", "Cable", `
        ${field("Label", inp("label", cb.label, "text", 'placeholder="e.g. C1"'))}
        <div class="field"><span>Cable profile</span><div class="inline-row">${cableProfileSelect(cb.profile || "")}<button class="small" data-act="profiles">Edit…</button></div></div>
        ${prof && prof.notes ? `<p class="hint-text">${esc(prof.notes)}</p>` : ""}
        ${field("Type", inp("desc", cb.desc, "text", `placeholder="e.g. ${cb.open ? "Cat6 S/FTP, 4x0.75 LiYY" : "3G1.5 H07RN-F"}"`))}
        <div class="row2">${chk("shield", cb.shield, "Shielded")}${chk("twisted", cb.twisted, "Twisted pairs")}</div>
        ${cb.open && !cb.portB ? field("Goes to", inp("to", cb.to || "", "text", 'placeholder="e.g. Pump P1, field sensor B3"')) : ""}
        ${colorField(`Sheath colour · ${esc(wireColorName(cb.color))}`, cb.color)}
        ${breakable(cb) ? field("Draw", sel_("draw", cb.draw || "", drawOpts("cable"))) : ""}
        ${field("Notes", area("notes", cb.notes))}`)
      + plugs
      + (cb.open && cb.portA ? "" : section("cable.cores", cb.open ? "Cores" : "Wires", `
        <table class="term-list">${rows}</table>
        <p class="hint-text">${cb.open
          ? "Each core is a wire: click one to set its colour, size or profile. Drag the orange dots to move where the cores fan out and where the cable ends."
          : `To add wires, Shift-click them along with the cable, then use <i>Add to ${esc(cb.label || "cable")}</i>. Drag the orange dots at the sheath ends to move where the cores fan out.`}</p>
        <div class="btn-row">
          ${cb.open ? `<button class="small" data-act="cableCores" title="Pick more terminals for this cable">${ic("plus", "sm")} Add cores…</button>` : ""}
          ${canLand(cb) ? `<button class="small" data-act="cableLand" title="Pick the terminals its cores go to at the other end, so both ends are drawn">Land the other end…</button>` : ""}
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
        ${chk("bold", same(notes, (it) => !!it.bold), "Bold")}`), notes.length);
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
        <div class="btn-row"><button class="small" data-act="selCircuit">Select whole circuit</button><button class="small" data-act="selChain" title="Only the wires and bus bars joined at the same terminals">Select daisy chain</button></div>
        ${wires || cbs.length ? `<div class="btn-row"><button class="small" data-act="showOnly" title="Hide every other wire on the drawing until you choose Show all">Show only these wires</button></div>` : ""}`);
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
  function selectCircuit(direct) {
    const circ = circuitOf(doc, [...sel].filter((id) => isConn(id) || busById(id)), { direct });
    sel = new Set([...circ.conns, ...circ.buses]);
    refresh();
  }

  function selectSameType(it) {
    sel = new Set(doc.items.filter((i) => i.kind === "part" && i.tpl === it.tpl).map((i) => i.id));
    refresh();
  }

  function selectSamePrefix(it) {
    const p = tagPrefix(it.tag);
    sel = new Set(doc.items.filter((i) => i.kind === "part" && tagPrefix(i.tag) === p).map((i) => i.id));
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
      toast(v === "us" ? "Wires switched to AWG and US colours" : "Wires switched to mm² and IEC colours");
      return;
    }
    for (const target of list) {
      setPath(target, k, v);
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
    if (k === "tpl") cleanConnections();
  }

  const props = $("props");
  props.addEventListener("focusin", () => { editCheckpointed = false; });
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
    if (el.dataset.cpf === "assign") {
      const { list } = editTargets(el), p = cableProfileById(el.value);
      if (!list.length || el.value === "__mixed") return;
      checkpoint();
      for (const cb of list) if (p) applyCableProfile(cb, p); else cb.profile = "";
      refresh();
      return;
    }
    if (el.dataset.pf === "assign") {
      if (el.value === "__mixed") return;
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
    if (el.dataset.tl) { refresh(); return; }
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
    const unp = e.target.closest("[data-unplug]");
    if (unp) { const cb = propsTarget(); if (cb) unplug(cb, unp.dataset.unplug === "A" ? cb.portA : cb.portB); return; }
    const core = e.target.closest("[data-core]");
    if (core) { removeFromCable(core.dataset.core); return; }
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    const target = propsTarget();
    switch (act) {
      case "delete": deleteSelection(); break;
      case "dup": duplicateSelection(); break;
      case "rotL": rotateSelection(-1); break;
      case "rotR": rotateSelection(1); break;
      case "editTpl": editTemplate(tplOf(target), false); break;
      case "renumber": applyRenumber(); break;
      case "selCircuit": selectCircuit(false); break;
      case "showOnly": showOnlyWires(selectedWireIds()); break;
      case "selChain": selectCircuit(true); break;
      case "profiles": openProfiles(); break;
      case "cprofiles": openProfiles(true); break;
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
      case "cableUnbundle": unbundle(target); break;
      case "cableDelete": deleteCableAndWires(target); break;
      case "cableSelect": sel = new Set(target.wires); refresh(); break;
      case "cableReset": checkpoint(); target.pa = null; target.pb = null; refresh(); break;
      case "cableCores": startCable(target.id); break;
      case "cablePlug": startCable(target.id); break;
      case "cableLand": startLanding(target.id); break;
      case "fitRail": fitRail(target); break;
      case "tab": showDrawerTab(b.dataset.tab); break;
    }
  });

  // The bar across the drawing while picking bus bar or cable terminals.
  $("modeBar").addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "busDone") finishBus();
    else if (act === "busCancel") cancelBus();
    else if (act === "busAlt0") alternateBus(0);
    else if (act === "busAlt1") alternateBus(1);
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
        <td><input data-f="name" type="text" value="${esc(p.name)}"></td>
        <td>${colorChip(p.color, p.stripe)}<select data-f="color">${colorOpts(p.color)}</select> <input data-f="color" type="color" value="${esc(p.color === "gy" ? "#2e9b3c" : p.color)}" title="Custom colour"></td>
        <td>${stripeSelect("", p.stripe, p.color === "gy").replace('data-k=""', 'data-f="stripe"')}</td>
        <td><input data-f="gauge" type="text" list="gaugeList" value="${esc(p.gauge)}"></td>
        <td><select data-f="conductor">${[["", "—"], ...CONDUCTORS.map((x) => [x, x])].map(([v, l]) => `<option value="${v}"${(p.conductor || "") === v ? " selected" : ""}>${l}</option>`).join("")}</select></td>
        <td>${n}</td>
        <td><button class="icon-btn danger" data-pdel title="Delete profile">${ic("x", "sm")}</button></td>
      </tr>`;
    }).join("") || '<tr><td colspan="7" class="muted" style="padding:10px">No profiles. Add one below.</td></tr>';
    $("cprofRows").innerHTML = doc.cableProfiles.map((p) => {
      const n = doc.cables.filter((cb) => cb.profile === p.id).length;
      return `<tr data-cpid="${esc(p.id)}">
        <td><input data-f="name" type="text" value="${esc(p.name)}"></td>
        <td>${colorChip(p.color)}<select data-f="color">${colorOpts(p.color)}</select> <input data-f="color" type="color" value="${esc(p.color === "gy" ? "#2e9b3c" : p.color)}" title="Custom colour"></td>
        <td><input data-f="desc" type="text" value="${esc(p.desc || "")}" placeholder="e.g. Cat6 S/FTP"></td>
        <td class="c"><input data-f="shield" type="checkbox"${p.shield ? " checked" : ""} title="Shielded"></td>
        <td class="c"><input data-f="twisted" type="checkbox"${p.twisted ? " checked" : ""} title="Twisted pairs"></td>
        <td><input data-f="notes" type="text" value="${esc(p.notes || "")}" placeholder="e.g. drain wire, max length"></td>
        <td>${n}</td>
        <td><button class="icon-btn danger" data-cpdel title="Delete cable profile">${ic("x", "sm")}</button></td>
      </tr>`;
    }).join("") || '<tr><td colspan="8" class="muted" style="padding:10px">No cable profiles. Add one below.</td></tr>';
  }

  // Edit a cable profile field and push the change to every cable that follows it.
  const cprofRow = (e) => e.target.closest("tr[data-cpid]");
  function editCableProfile(row, f, value) {
    const p = cableProfileById(row.dataset.cpid);
    if (!p) return;
    if (!profCheckpointed) { checkpoint(); profCheckpointed = true; }
    p[f] = value;
    for (const cb of doc.cables) if (cb.profile === p.id) applyCableProfile(cb, p);
    renderCanvas();
    renderDrawer();
    updateToolbar();
    scheduleSave();
  }
  $("cprofRows").addEventListener("input", (e) => {
    const row = cprofRow(e), f = e.target.dataset.f;
    if (!row || !f || e.target.tagName === "SELECT" || e.target.type === "checkbox") return;
    editCableProfile(row, f, f === "color" ? e.target.value.toLowerCase() : e.target.value);
  });
  $("cprofRows").addEventListener("change", (e) => {
    const row = cprofRow(e), f = e.target.dataset.f;
    if (!row || !f) return;
    if (e.target.tagName === "SELECT") editCableProfile(row, f, e.target.value);
    if (e.target.type === "checkbox") editCableProfile(row, f, e.target.checked);
    if (f === "color") renderProfiles();
  });
  $("cprofRows").addEventListener("click", (e) => {
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
    doc.cableProfiles.push({ id: uid("cp"), name: "New cable profile", color: "#1f1f1f", desc: "", shield: false, twisted: false, notes: "" });
    renderProfiles();
    refresh();
    const inputs = $("cprofRows").querySelectorAll('[data-f="name"]');
    const last = inputs[inputs.length - 1];
    last.focus();
    last.select();
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
    doc.wireProfiles.push({ id: uid("wp"), name: "New profile", color: "#1f1f1f", gauge: convertGauge("1 mm²", doc.settings.wireStd), conductor: "Stranded" });
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
    $("settingsBody").innerHTML = `
      <div class="set-group">
        <h4>Drawing</h4>
        <div class="row2">
          ${field("Snap grid", sel_("settings.grid", s.grid, [[0, "Off"], [0.5, "0.5 mm"], [1, "1 mm"], [2.5, "2.5 mm"], [5, "5 mm"]]))}
          ${field("Wires drawn as", sel_("settings.lines", s.lines, [["off", "Stubs at the terminals"], ["straight", "Straight lines"], ["curved", "Curved lines"]]))}
        </div>
        <div class="row2">
          ${field("Cables drawn", sel_("settings.cables", s.cables, [["full", "Full length"], ["break", "Broken: a tail at each end"]]))}
          ${chk("settings.labelCable", s.labelCable, "Cable names in labels (C1 → K1)")}
        </div>
        <div class="row2">
          ${chk("settings.wireLabels", s.wireLabels !== false, "Labels: where each wire goes")}
          ${field("Named circuits' labels show", sel_("settings.labelName", s.labelName, [["dest", "Where each wire goes"], ["circuit", "Circuit name"]]))}
        </div>
        ${chk("settings.labelWire", s.labelWire, "Wire names in labels (W3 → TB101-1)")}
        <div class="row2">
          ${field("Tag text height (mm)", num("settings.tagSize", s.tagSize, 0.1, 'min="0.5"'))}
          ${field("Label text height (mm)", num("settings.labelSize", s.labelSize, 0.1, 'min="0.5"'))}
        </div>
        ${chk("settings.snapEdges", s.snapEdges, "Snap to neighbours and rails")}
        ${chk("settings.showTermNames", s.showTermNames, "Show terminal names")}
      </div>
      <div class="set-group">
        <h4>Wiring</h4>
        <div class="row2">
          ${field("Wire standard", sel_("settings.wireStd", s.wireStd, Object.entries(WIRE_STANDARDS).map(([id, w]) => [id, w.name])))}
          ${field("Terminal reference", sel_("settings.termSep", s.termSep, [["-", "TB101-1"], [":", "TB101:1"], [".", "TB101.1"], ["/", "TB101/1"], [" ", "TB101 1"]]))}
        </div>
        <p class="hint-text">Changing the wire standard converts existing wires and profiles to the nearest size, and line / neutral / earth wires to the new colours.</p>
        <div class="btn-row"><button class="small" data-sact="profiles">${ic("edit", "sm")} Edit wire profiles…</button></div>
      </div>
      <div class="set-group">
        <h4>Building strips</h4>
        <div class="field"><span>Build direction: where new parts beside a selected one, repeats and packing go</span>${dirToggle()}</div>
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
      toast(v === "us" ? "Wires switched to AWG and US colours" : "Wires switched to mm² and IEC colours");
    } else setPath(doc, k, v);
    refresh();
  }

  $("settingsBody").addEventListener("focusin", () => { setCheckpointed = false; });
  $("settingsBody").addEventListener("input", (e) => {
    if (e.target.type === "number") applySetting(e.target, true);
  });
  $("settingsBody").addEventListener("change", (e) => {
    if (e.target.type !== "number") { applySetting(e.target, false); renderSettings(); }
  });
  $("settingsBody").addEventListener("click", (e) => {
    const b = e.target.closest("[data-act='dir'], [data-sact]");
    if (!b) return;
    if (b.dataset.sact === "profiles") { $("settingsModal").hidden = true; openProfiles(); return; }
    checkpoint();
    doc.settings.direction = b.dataset.dir;
    refresh();
    renderSettings();
  });

  // ---------- drawer: wire list / parts list ----------
  function wireRows() {
    return doc.connections.slice().sort((a, b) => natural(a.wire, b.wire));
  }

  function partsSummary() {
    const groups = new Map();
    for (const it of doc.items) {
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

  function cableCores(cb) {
    return cb.wires.map(connById).filter(Boolean).map((c) => `${c.wire || "—"} ${wireLookName(c.color, c.stripe)}`);
  }

  function busRows() {
    return doc.buses.slice().sort((a, b) => natural(a.label, b.label));
  }

  function busRefs(b) {
    return busOrder(b.terms.map((e) => ({ e, ...termPoint(e) }))).map((p) => refOf(p.e));
  }

  function renderDrawer() {
    const body = $("drawerBody");
    const counts = { wires: doc.connections.length, cables: doc.cables.length, buses: doc.buses.length, parts: doc.items.filter((i) => i.kind === "part").length };
    for (const el of document.querySelectorAll("[data-count]")) el.textContent = counts[el.dataset.count];
    for (const b of document.querySelectorAll(".drawer-tabs [data-tab]")) b.classList.toggle("active", b.dataset.tab === drawerTab);
    $("btnListCsv").hidden = drawerTab !== "wires";
    if ($("drawer").classList.contains("collapsed")) return; // filled in when it's opened
    if (drawerTab === "wires") {
      const rows = wireRows();
      const circ = circuitOf(doc, [...sel].filter((id) => isConn(id) || busById(id)));
      const names = circuitNames(doc);
      body.innerHTML = `<table class="data-table"><thead><tr><th>Wire</th><th>From</th><th>To</th><th>Circuit</th><th>Colour</th><th>Size</th><th>Conductor</th><th>Profile</th><th>Cable</th><th>Notes</th></tr></thead><tbody>
        ${rows.map((c) => `<tr data-sel="${esc(c.id)}" class="${sel.has(c.id) ? "sel" : circ.conns.has(c.id) ? "net" : ""}">
          <td><b>${esc(c.wire)}</b></td><td>${esc(refOf(c.a))}</td><td>${esc(refOf(c.b))}</td><td>${esc(names.conn.get(c.id) || "")}</td>
          <td>${colorChip(c.color, c.stripe)}${esc(wireLookName(c.color, c.stripe))}</td><td>${esc(c.gauge)}</td><td>${esc(c.conductor || "")}</td><td>${esc(profileById(c.profile)?.name || "")}</td><td>${esc(cableOf(c.id)?.label || "")}</td><td>${esc(c.notes)}</td></tr>`).join("")
        || '<tr><td colspan="10" class="empty">No wires yet. Drag from one terminal to another to add one.</td></tr>'}
      </tbody></table>`;
    } else if (drawerTab === "cables") {
      body.innerHTML = `<table class="data-table"><thead><tr><th>Cable</th><th>Type</th><th>Profile</th><th>From</th><th>To</th><th>Cores</th><th>Notes</th></tr></thead><tbody>
        ${cableRows().map((cb) => {
          const [a, b] = cableEnds(cb);
          const type = [cb.desc, cb.shield && "shielded", cb.twisted && "twisted pairs"].filter(Boolean).join(", ");
          return `<tr data-sel="${esc(cb.id)}" class="${sel.has(cb.id) ? "sel" : ""}">
          <td>${colorChip(cb.color)}<b>${esc(cb.label)}</b></td><td>${esc(type)}</td><td>${esc(cableProfileById(cb.profile)?.name || "")}</td><td>${esc(a)}</td><td>${esc(b)}</td><td>${esc(cableCores(cb).join(", "))}</td><td>${esc(cb.notes || "")}</td></tr>`;
        }).join("")
        || '<tr><td colspan="7" class="empty">No cables yet. Select some wires and choose “Bundle into a cable”, or drag from one cable connector to another.</td></tr>'}
      </tbody></table>`;
    } else if (drawerTab === "buses") {
      const circ = circuitOf(doc, [...sel].filter((id) => isConn(id) || busById(id)));
      const names = circuitNames(doc);
      body.innerHTML = `<table class="data-table"><thead><tr><th>Bus bar</th><th>Terminals</th><th>Circuit</th><th>Colour</th><th>Notes</th></tr></thead><tbody>
        ${busRows().map((b) => `<tr data-sel="${esc(b.id)}" class="${sel.has(b.id) ? "sel" : circ.buses.has(b.id) ? "net" : ""}">
          <td><b>${esc(b.label)}</b></td><td>${esc(busRefs(b).join(", "))}</td><td>${esc(names.bus.get(b.id) || "")}</td>
          <td>${colorChip(b.color)}${esc(wireColorName(b.color))}</td><td>${esc(b.notes)}</td></tr>`).join("")
        || '<tr><td colspan="5" class="empty">No bus bars yet. Right-click empty space on the drawing, choose “Bus bar…”, then click the terminals to bridge.</td></tr>'}
      </tbody></table>`;
    } else {
      const parts = doc.items.filter((i) => i.kind === "part" && tplOf(i)).sort((a, b) => natural(a.tag || "~", b.tag || "~"));
      const summary = partsSummary().map((g) => `${g.tags.length} × ${esc(g.tpl.name)}`).join(" · ");
      body.innerHTML = `<table class="data-table"><thead><tr><th>Tag</th><th>Type</th><th>Description</th><th>Size (mm)</th><th>Wired terminals</th></tr></thead><tbody>
        ${parts.map((it) => {
          const t = tplOf(it);
          const used = new Set();
          for (const c of doc.connections) for (const e of [c.a, c.b]) if (e.item === it.id) used.add(e.term);
          for (const b of doc.buses) for (const e of b.terms) if (e.item === it.id) used.add(e.term);
          return `<tr data-sel="${esc(it.id)}" class="${sel.has(it.id) ? "sel" : ""}"><td><b>${esc(it.tag || "—")}</b></td><td>${esc(t.name)}</td><td>${esc(it.desc)}</td><td>${r3(t.w)} × ${r3(t.h)}</td><td>${used.size} / ${t.terminals.length}</td></tr>`;
        }).join("") || '<tr><td colspan="5" class="empty">No parts yet. Click an object in the library to add one.</td></tr>'}
        ${summary ? `<tr class="summary"><td colspan="5">${summary}</td></tr>` : ""}
      </tbody></table>`;
    }
    filterDrawer();
  }

  // Hide list rows that don't contain the filter text.
  function filterDrawer() {
    const q = $("listFilter").value.trim().toLowerCase();
    const rows = [...$("drawerBody").querySelectorAll("tbody tr[data-sel]")];
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
    const row = e.target.closest("[data-sel]");
    if (row) { sel = new Set([row.dataset.sel]); refresh(); }
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
      if (i >= 0) doc.wireProfiles[i] = p; else doc.wireProfiles.push(p);
      for (const c of doc.connections) if (c.profile === p.id) applyProfile(c, p);
      profiles++;
    }
    for (const p of Array.isArray(d.cableProfiles) ? d.cableProfiles : []) {
      if (!p || !p.id || !p.name) continue;
      const i = doc.cableProfiles.findIndex((x) => x.id === p.id);
      if (i >= 0) doc.cableProfiles[i] = p; else doc.cableProfiles.push(p);
      for (const cb of doc.cables) if (cb.profile === p.id) applyCableProfile(cb, p);
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

  function exportSVGString(pxPerMm) {
    const inner = renderDiagram(doc, { interactive: false });
    const tmp = document.createElementNS(SVGNS, "svg");
    tmp.setAttribute("style", "position:absolute;left:-9999px;top:0;visibility:hidden");
    tmp.innerHTML = `<g>${inner}</g>`;
    document.body.appendChild(tmp);
    let bb = tmp.firstChild.getBBox();
    tmp.remove();
    if (!bb.width || !bb.height) bb = { x: 0, y: 0, width: 100, height: 50 };
    const m = 8, titleH = 16;
    const x0 = bb.x - m, y0 = bb.y - m - titleH;
    const W = bb.width + m * 2, H = bb.height + m * 2 + titleH;
    const meta = [doc.meta.revision && "Rev " + doc.meta.revision, doc.meta.date, doc.meta.author].filter(Boolean).join("  ·  ");
    const head = `<text x="${x0 + m}" y="${y0 + m + 4}" font-family="${FONT}" font-size="5" font-weight="bold" fill="#1d2126">${esc(doc.meta.title)}</text>`
      + (meta ? `<text x="${x0 + m}" y="${y0 + m + 10}" font-family="${FONT}" font-size="3" fill="#555">${esc(meta)}</text>` : "");
    const size = pxPerMm ? `width="${Math.round(W * pxPerMm)}" height="${Math.round(H * pxPerMm)}"` : `width="${r3(W)}mm" height="${r3(H)}mm"`;
    return {
      svg: `<svg xmlns="${SVGNS}" ${size} viewBox="${r3(x0)} ${r3(y0)} ${r3(W)} ${r3(H)}"><rect x="${r3(x0)}" y="${r3(y0)}" width="${r3(W)}" height="${r3(H)}" fill="#ffffff"/>${head}${inner}</svg>`,
      W, H,
    };
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
      c.toBlob((b) => download(slug(doc.meta.title) + ".png", b), "image/png");
    };
    img.onerror = () => alert("Sorry, the PNG could not be created in this browser. Try SVG instead.");
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
  }

  function csvCell(v) {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function exportCSV() {
    const names = circuitNames(doc);
    const rows = [["Wire", "From", "To", "Circuit", "Colour", "Size", "Conductor", "Profile", "Cable", "Notes"]];
    for (const c of wireRows()) rows.push([c.wire, refOf(c.a), refOf(c.b), names.conn.get(c.id) || "", wireLookName(c.color, c.stripe), c.gauge, c.conductor || "", profileById(c.profile)?.name || "", cableOf(c.id)?.label || "", c.notes]);
    download(slug(doc.meta.title) + "-wires.csv", "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n"), "text/csv");
  }

  function printDoc() {
    const m = doc.meta;
    const meta = [m.revision && "Revision " + m.revision, m.date, m.author].filter(Boolean).join(" · ");
    const wires = wireRows();
    const groups = partsSummary();
    const names = circuitNames(doc);
    let s = `<h1>${esc(m.title)}</h1>${meta ? `<div class="pmeta">${esc(meta)}</div>` : ""}${m.notes ? `<div class="pnotes">${esc(m.notes)}</div>` : ""}`;
    s += exportSVGString().svg.replace(/width="[^"]*mm" height="[^"]*mm"/, "");
    if (wires.length) {
      s += `<h2>Wire list</h2><table><thead><tr><th>Wire</th><th>From</th><th>To</th><th>Circuit</th><th>Colour</th><th>Size</th><th>Conductor</th><th>Profile</th><th>Cable</th><th>Notes</th></tr></thead><tbody>`;
      s += wires.map((c) => `<tr><td>${esc(c.wire)}</td><td>${esc(refOf(c.a))}</td><td>${esc(refOf(c.b))}</td><td>${esc(names.conn.get(c.id) || "")}</td><td>${esc(wireLookName(c.color, c.stripe))}</td><td>${esc(c.gauge)}</td><td>${esc(c.conductor || "")}</td><td>${esc(profileById(c.profile)?.name || "")}</td><td>${esc(cableOf(c.id)?.label || "")}</td><td>${esc(c.notes)}</td></tr>`).join("");
      s += "</tbody></table>";
    }
    if (doc.cables.length) {
      s += `<h2>Cables</h2><table><thead><tr><th>Cable</th><th>Description</th><th>Cores</th><th>Notes</th></tr></thead><tbody>`;
      s += cableRows().map((cb) => `<tr><td>${esc(cb.label)}</td><td>${esc([cb.desc, cb.to && "→ " + cb.to].filter(Boolean).join(" "))}</td><td>${esc(cableCores(cb).join(", "))}</td><td>${esc(cb.notes || "")}</td></tr>`).join("");
      s += "</tbody></table>";
    }
    if (doc.buses.length) {
      s += `<h2>Bus bars</h2><table><thead><tr><th>Bus bar</th><th>Terminals</th><th>Circuit</th><th>Colour</th><th>Notes</th></tr></thead><tbody>`;
      s += busRows().map((b) => `<tr><td>${esc(b.label)}</td><td>${esc(busRefs(b).join(", "))}</td><td>${esc(names.bus.get(b.id) || "")}</td><td>${esc(wireColorName(b.color))}</td><td>${esc(b.notes)}</td></tr>`).join("");
      s += "</tbody></table>";
    }
    if (groups.length) {
      s += `<h2>Parts list</h2><table><thead><tr><th>Qty</th><th>Type</th><th>Size (mm)</th><th>Tags</th></tr></thead><tbody>`;
      s += groups.map((g) => `<tr><td>${g.tags.length}</td><td>${esc(g.tpl.name)}</td><td>${r3(g.tpl.w)} × ${r3(g.tpl.h)}</td><td>${esc(g.tags.filter(Boolean).sort(natural).join(", "))}</td></tr>`).join("");
      s += "</tbody></table>";
    }
    $("printArea").innerHTML = s;
    window.print();
  }

  // ---------- commands: toolbar, menus and dialog buttons ----------
  // Dialogs that Esc and a click on the backdrop close (the designer handles its own).
  const DIALOGS = ["helpModal", "profModal", "libChooser", "settingsModal", "welcomeModal"];

  function newDiagram(ask = true) {
    if (ask && !confirm("Start a new, empty diagram? Your object library is kept. (You can undo this.)")) return;
    checkpoint();
    { const std = doc.settings.wireStd, libVersions = doc.libVersions; doc = normalize(newProject(doc.templates)); doc.libVersions = libVersions; setWireStd(std); }
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

  async function loadExample() {
    if (!confirm("Replace the current diagram with the example? (You can undo this.)")) return;
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

  // The welcome tips, shown by themselves the first time DIN Stack is opened in a browser.
  function openWelcome() {
    ui.welcomed = true;
    saveUi();
    $("welcomeModal").hidden = false;
    $("welcomeModal").querySelector(".primary").focus();
  }

  $("welcomeModal").addEventListener("click", (e) => {
    const act = e.target.closest("[data-wel]")?.dataset.wel;
    if (!act) return;
    $("welcomeModal").hidden = true;
    if (act === "blank") newDiagram(false);
    if (act === "help") openHelp();
  });

  const commands = {
    new: newDiagram,
    open: () => $("fileInput").click(),
    save: saveFile,
    example: loadExample,
    print: printDoc,
    exportSvg: () => download(slug(doc.meta.title) + ".svg", exportSVGString().svg, "image/svg+xml"),
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
  window.addEventListener("beforeunload", () => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(doc)); } catch (e) { /* ignore */ }
  });

  // ---------- start ----------
  $("versionLabel").textContent = "v" + APP_VERSION;
  // Installable as an app (and usable offline) when served over http(s), e.g. from GitHub Pages.
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register("sw.js").catch(() => { /* not installable here; the app still works */ });
  }
  // First visit: nothing saved in this browser yet and the welcome hasn't been shown. People who used
  // DIN Stack before the welcome existed already have a saved diagram, so they don't get it.
  const firstVisit = !ui.welcomed && (() => { try { return !localStorage.getItem(LS_KEY); } catch (e) { return false; } })();
  doc = loadInitial();
  drawerTab = ["wires", "cables", "buses", "parts"].includes(ui.drawerTab) ? ui.drawerTab : "wires";
  $("drawer").classList.toggle("collapsed", !!ui.drawerClosed);
  renderLibrary();
  applyView();
  refresh();
  requestAnimationFrame(fit);
  if (firstVisit) openWelcome();
  // A new workspace starts as its example, fetched once nothing is saved for it yet.
  if (workspace && (() => { try { return !localStorage.getItem(LS_KEY); } catch (e) { return true; } })()) {
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
