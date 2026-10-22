// DIN Stack — main application: state, canvas interaction, panels, import/export.

(() => {
  const $ = (id) => document.getElementById(id);
  const SVGNS = "http://www.w3.org/2000/svg";
  const LS_KEY = "dinstack.project.v1";
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
    d.settings = Object.assign({}, DEFAULT_SETTINGS, d.settings || {});
    d.templates = Array.isArray(d.templates) ? d.templates : [];
    d.items = Array.isArray(d.items) ? d.items : [];
    d.connections = Array.isArray(d.connections) ? d.connections : [];
    d.buses = Array.isArray(d.buses) ? d.buses : [];
    d.cables = Array.isArray(d.cables) ? d.cables : [];
    d.wireProfiles = Array.isArray(d.wireProfiles) ? d.wireProfiles : JSON.parse(JSON.stringify(DEFAULT_PROFILES));
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
    doc.cables = validCables(doc, doc.connections);
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
    content.innerHTML = renderDiagram(doc, { interactive: true, sel, pending, busEdit });
    svg.classList.toggle("wiring", !!pending || !!busEdit);
    renderOverlay();
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
    $("linesSelect").value = doc.settings.lines;
    if (document.activeElement !== $("titleInput")) $("titleInput").value = doc.meta.title;
    document.title = (doc.meta.title ? doc.meta.title + " · " : "") + "DIN Stack";
  }

  // ---------- library ----------
  // Which library categories are folded and whether the left panel is hidden: a per-browser
  // convenience, not part of the diagram.
  const UI_KEY = "dinstack.ui.v1";
  const ui = (() => {
    try { return Object.assign({ folded: [], leftHidden: false }, JSON.parse(localStorage.getItem(UI_KEY) || "{}")); }
    catch (e) { return { folded: [], leftHidden: false }; }
  })();
  function saveUi() {
    try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) { /* storage unavailable */ }
  }

  function renderLibrary() {
    const q = $("libSearch").value.trim().toLowerCase();
    const cats = [];
    for (const t of doc.templates) if (!cats.includes(t.category)) cats.push(t.category);
    let s = "";
    for (const c of cats) {
      const list = doc.templates.filter((t) => t.category === c && (!q || t.name.toLowerCase().includes(q) || c.toLowerCase().includes(q)));
      if (!list.length) continue;
      const closed = !q && ui.folded.includes(c); // searching shows every match
      s += `<button class="lib-cat${closed ? " closed" : ""}" data-cat="${esc(c)}" aria-expanded="${!closed}" title="${closed ? "Show" : "Hide"} ${esc(c)}"><span class="chev">▾</span>${esc(c)}<span class="count">${list.length}</span></button>`;
      if (closed) continue;
      for (const t of list) {
        s += `<div class="lib-item" data-tpl="${esc(t.id)}" title="Click to add, or drag onto the diagram">
          <div class="thumb">${renderTemplatePreview(t, 30)}</div>
          <div class="meta"><div class="name">${esc(t.name)}</div><div class="size">${r3(t.w)} × ${r3(t.h)} mm · ${t.terminals.length} terminal${t.terminals.length === 1 ? "" : "s"}${isLoose(t) ? " · loose" : ""}</div></div>
          <div class="acts">
            <button data-lib="edit" title="Edit">✎</button>
            <button data-lib="dup" title="Duplicate">⧉</button>
            <button data-lib="del" title="Delete">🗑</button>
          </div>
        </div>`;
      }
    }
    $("library").innerHTML = s || `<div class="muted" style="padding:8px">No matching object types.</div>`;
    const allFolded = cats.length && cats.every((c) => ui.folded.includes(c));
    $("btnLibFold").textContent = allFolded ? "⊞" : "⊟";
    $("btnLibFold").title = allFolded ? "Expand all categories" : "Collapse all categories";
  }

  function toggleCategory(c) {
    ui.folded = ui.folded.includes(c) ? ui.folded.filter((x) => x !== c) : [...ui.folded, c];
    saveUi();
    renderLibrary();
  }

  function setLeftHidden(hidden) {
    ui.leftHidden = hidden;
    saveUi();
    $("app").classList.toggle("left-collapsed", hidden);
  }

  function categories() {
    return [...new Set(doc.templates.map((t) => t.category))];
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
      lostCheck: isNew ? null : lostConnections,
      onSave(t) {
        checkpoint();
        const i = doc.templates.findIndex((x) => x.id === t.id);
        if (i >= 0) doc.templates[i] = t; else doc.templates.push(t);
        cleanConnections();
        renderLibrary();
        refresh();
        toast(isNew ? `Added “${t.name}” to the library` : `Updated “${t.name}”`);
      },
    });
  }

  function newTemplate() {
    editTemplate({
      id: uid("u"), name: "", category: "Custom", prefix: "A", w: 40, h: 60,
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
    const el = $("props").querySelector(`[data-k="${key}"]`);
    if (el) { el.focus(); el.select && el.select(); }
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
    setHint("Bus bar: click terminals or bus bar slots (or drag along a row) to add or remove them · Enter to finish · Esc to cancel");
    refresh();
  }

  // Pick the terminals a one-ended cable's cores land on (a new cable, or more cores for an existing one).
  function startCable(id, first) {
    pending = null;
    busEdit = { kind: "cable", id: id || null, terms: first ? [first] : [] };
    setHint("Cable: click the terminals its cores go to, in core order (or drag along a row) · Enter to finish · Esc to cancel");
    refresh();
  }

  function finishCable() {
    if (!busEdit.terms.length) { toast("Pick at least one terminal for the cable"); return; }
    checkpoint();
    let cb = busEdit.id && cableById(busEdit.id);
    if (!cb) {
      cb = { id: uid("k"), label: nextCable(), desc: "", to: "", color: "#3a3f45", notes: "", open: true, wires: [], pa: null, pb: null };
      doc.cables.push(cb);
    }
    let core = Math.max(0, ...cb.wires.map(connById).filter(Boolean).map((c) => parseInt((c.a.item === cb.id ? c.a : c.b).term, 10) || 0));
    for (const k of busEdit.terms) {
      const c = { id: uid("c"), a: termKeyParts(k), b: { item: cb.id, term: String(++core) }, wire: nextWire(), notes: "" };
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
    if (busEdit.kind === "cable") {
      const p = termKeyParts(key), it = itemById(p.item);
      if (isSlot(tplOf(it)?.terminals.find((t) => t.id === p.term) || {})) return; // slots take bus bars, not cores
    }
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
    for (const it of items) { it.x = r3(it.x + dx); it.y = r3(it.y + dy); }
    refresh();
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

    if (handleEl && !busEdit) {
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

    if (termEl) {
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
      drag = { type: "move", primary: id, start: w, sx: e.clientX, sy: e.clientY, orig, all, moving, moved: false, clickedSelected };
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
        const b = boxOf(it);
        if (b.x < x2 && b.x + b.w > x1 && b.y < y2 && b.y + b.h > y1) sel.add(it.id);
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

  function partEntries(it, term) {
    const tpl = tplOf(it);
    const ref = term && refOf(term);
    const out = [];
    if (term) {
      out.push({ heading: ref },
        { label: "Start a wire here", run: () => { pending = term; setHint(`Wiring from ${ref} — click another terminal (Esc to cancel)`); renderCanvas(); } },
        { label: "Connector label…", run: () => {
          sel = new Set([it.id]);
          refresh();
          const el = $("props").querySelector(`[data-tl="${CSS.escape(term.term)}"]`);
          if (el) { el.scrollIntoView({ block: "center" }); el.focus(); el.select(); }
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
        { label: "Paste here", hint: mod + "V", disabled: !(clipboard && clipboard.items.length), run: paste },
        "-",
        { label: "Add DIN rail here", run: () => addRail(at) },
        { label: "Add text note here", run: () => addText(at) },
        { label: "New bus bar…", run: () => startBus(null) },
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
      if (wires.length) out.push(...profileEntries(wires));
      out.push("-", { label: `Delete ${sel.size} items`, hint: "Del", danger: true, run: deleteSelection });
      return out;
    }
    if (wires.length) {
      const c = wires[0];
      return [
        { heading: `Wire ${c.wire || ""}`.trim() },
        { label: "Select whole circuit", run: () => selectCircuit(false) },
        { label: "Select daisy chain", run: () => selectCircuit(true) },
        { label: "Swap ends", run: () => swapEnds(c) },
        cableOf(c.id) ? (cableOf(c.id).open ? null : { label: `Take out of cable ${cableOf(c.id).label || ""}`.trim(), run: () => removeFromCable(c.id) }) : { label: "Bundle into a cable", run: () => bundleWires([c.id]) },
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
          { label: "Add cores…", run: () => startCable(cb.id) },
          { label: "Select its cores", run: () => { sel = new Set(cb.wires); refresh(); } },
          { label: "Reset layout", disabled: !(cb.pa || cb.pb), run: () => { checkpoint(); cb.pa = null; cb.pb = null; refresh(); } },
          "-",
          { label: "Delete cable", hint: "Del", danger: true, run: () => deleteCableAndWires(cb) },
        ];
      }
      return [
        { heading: `Cable ${cb.label || ""}`.trim() },
        { label: "Select its wires", run: () => { sel = new Set(cb.wires); refresh(); } },
        { label: "Reset fan-out points", disabled: !(cb.pa || cb.pb), run: () => { checkpoint(); cb.pa = null; cb.pb = null; refresh(); } },
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
        { label: "Done", hint: "Enter", disabled: busEdit.terms.length < (busEdit.kind === "cable" ? 1 : 2), run: finishBus },
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
    if (!$("tplModal").hidden || !$("helpModal").hidden || !$("profModal").hidden) {
      if (e.key === "Escape") { $("helpModal").hidden = true; $("profModal").hidden = true; }
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
    else if (mod && k.toLowerCase() === "a") { e.preventDefault(); sel = new Set(doc.items.map((i) => i.id)); refresh(); }
    else if (k === "Delete" || k === "Backspace") { e.preventDefault(); deleteSelection(); }
    else if (k === "Escape") {
      if (pending) { pending = null; setHint(""); renderCanvas(); }
      else if (sel.size) { sel.clear(); refresh(); }
    }
    else if (k === "r" || k === "R") rotateSelection(e.shiftKey ? -1 : 1);
    else if (k === "f" || k === "F") fit();
    else if (k === " ") { spaceDown = true; e.preventDefault(); }
    else if (k.startsWith("Arrow") && sel.size) {
      e.preventDefault();
      const step = (doc.settings.grid || 1) * (e.shiftKey ? 10 : 1);
      const v = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[k];
      nudge(v[0], v[1]);
    }
  });
  document.addEventListener("keyup", (e) => { if (e.key === " ") spaceDown = false; });

  // ---------- properties panel ----------
  let propsCtx = { type: "project" };

  const field = (label, input) => `<label class="field"><span>${label}</span>${input}</label>`;
  const inp = (k, v, type = "text", extra = "") => `<input data-k="${k}" type="${type}" value="${esc(v ?? "")}" ${extra}>`;
  const num = (k, v, step = 0.1, extra = "") => inp(k, v === undefined ? "" : r3(v), "number", `step="${step}" ${extra}`);
  const chk = (k, v, label) => `<label class="check"><input data-k="${k}" type="checkbox"${v ? " checked" : ""}> ${label}</label>`;
  const dirToggle = () => `<div class="seg" role="group" aria-label="Build direction">
      <button data-act="dir" data-dir="ltr" class="${rtl() ? "" : "on"}" title="New parts, repeats and packing go to the right">Left → right</button>
      <button data-act="dir" data-dir="rtl" class="${rtl() ? "on" : ""}" title="New parts, repeats and packing go to the left">Right → left</button>
    </div>`;
  const sel_ = (k, v, opts) => `<select data-k="${k}">${opts.map(([val, lab]) => `<option value="${esc(val)}"${String(val) === String(v) ? " selected" : ""}>${esc(lab)}</option>`).join("")}</select>`;

  function renderProps() {
    const el = $("props");
    const ids = [...sel];
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
  }

  function busEditProps() {
    const refs = busEdit.terms.map((k) => refOf(termKeyParts(k)));
    if (busEdit.kind === "cable") {
      const cb = busEdit.id && cableById(busEdit.id);
      return `
      <h3>${cb ? "Add cores to " + esc(cb.label || "cable") : "New cable"}</h3>
      <p class="sub">Click the terminals the cable's cores go to, in core order, or drag along a row. The other end of the cable isn't drawn: give it a description of where it goes once it's made.</p>
      <p>${refs.length ? `<b>${refs.length}</b> core${refs.length === 1 ? "" : "s"}: ${esc(refs.join(", "))}` : '<span class="muted">No terminals picked yet.</span>'}</p>
      <div class="btn-row">
        <button data-act="busDone" class="primary"${refs.length < 1 ? " disabled" : ""}>Done (Enter)</button>
        <button data-act="busCancel">Cancel (Esc)</button>
      </div>`;
    }
    return `
      <h3>${busEdit.id ? "Edit bus bar " + esc(busById(busEdit.id)?.label || "") : "New bus bar"}</h3>
      <p class="sub">Click terminals or bus bar slots (the small squares in the middle of terminal blocks) to add or remove them, or drag along a row to sweep them in.</p>
      <p>${refs.length ? `<b>${refs.length}</b> terminal${refs.length === 1 ? "" : "s"}: ${esc(refs.join(", "))}` : '<span class="muted">No terminals picked yet.</span>'}</p>
      ${refs.length > 2 ? `<div class="field"><span>Bridge every other one</span><div class="btn-row" style="margin:0">
        <button data-act="busAlt0" title="Keep the 1st, 3rd, 5th… along the row">Keep 1st, 3rd…</button>
        <button data-act="busAlt1" title="Keep the 2nd, 4th, 6th… along the row">Keep 2nd, 4th…</button>
      </div></div>` : ""}
      <div class="btn-row">
        <button data-act="busDone" class="primary"${refs.length < 2 ? " disabled" : ""}>Done (Enter)</button>
        <button data-act="busCancel">Cancel (Esc)</button>
      </div>`;
  }

  function swatches(current) {
    return WIRE_COLORS.map((w) => `<button class="swatch${w.value === "gy" ? " gy" : ""}${w.value === current ? " on" : ""}" data-color="${esc(w.value)}" title="${esc(w.name)}" style="${w.value === "gy" ? "" : "background:" + w.value}"></button>`).join("");
  }

  function busProps(b) {
    const refs = busOrder(b.terms.map((e) => ({ e, ...termPoint(e) }))).map((p) => refOf(p.e));
    return `
      <h3>Bus bar ${esc(b.label || "")}</h3>
      <p class="sub">Bridges ${refs.length} terminals</p>
      ${field("Label", inp("label", b.label, "text", 'placeholder="e.g. BB1"'))}
      <div class="field"><span>Colour · ${esc(wireColorName(b.color))}</span><div class="swatches">${swatches(b.color)}</div>
        <div style="display:flex;gap:6px;align-items:center"><span class="muted" style="font-size:12px">Custom</span>${inp("color", b.color !== "gy" ? b.color : "#b87333", "color")}</div></div>
      ${followBox(b)}
      ${field("Notes", `<textarea data-k="notes" rows="2">${esc(b.notes)}</textarea>`)}
      <p class="muted" style="font-size:12px">Terminals: ${esc(refs.join(", "))}</p>
      <div class="btn-row"><button data-act="busEdit">Edit terminals</button><button data-act="delete" class="danger">Delete bus bar</button></div>
      ${circuitBlock(b.id)}`;
  }

  function projectProps() {
    const m = doc.meta, s = doc.settings;
    const parts = doc.items.filter((i) => i.kind === "part").length;
    return `
      <h3>Diagram</h3>
      <p class="sub">${parts} part${parts === 1 ? "" : "s"} · ${doc.connections.length} wire${doc.connections.length === 1 ? "" : "s"}</p>
      <div class="row2">${field("Revision", inp("meta.revision", m.revision))}${field("Date", inp("meta.date", m.date, "date"))}</div>
      ${field("Author", inp("meta.author", m.author))}
      ${field("Notes", `<textarea data-k="meta.notes" rows="3">${esc(m.notes)}</textarea>`)}
      <hr>
      <h3>Display</h3>
      <div class="row2">
        ${field("Snap grid", sel_("settings.grid", s.grid, [[0, "Off"], [0.5, "0.5 mm"], [1, "1 mm"], [2.5, "2.5 mm"], [5, "5 mm"]]))}
        ${field("Wires", sel_("settings.lines", s.lines, [["off", "Labels only"], ["straight", "Straight"], ["curved", "Curved"]]))}
      </div>
      <div class="row2">
        ${field("Tag text (mm)", num("settings.tagSize", s.tagSize, 0.1, 'min="0.5"'))}
        ${field("Label text (mm)", num("settings.labelSize", s.labelSize, 0.1, 'min="0.5"'))}
      </div>
      ${field("Wire standard", sel_("settings.wireStd", s.wireStd, Object.entries(WIRE_STANDARDS).map(([id, w]) => [id, w.name])))}
      ${field("Terminal reference", sel_("settings.termSep", s.termSep, [["-", "TB101-1"], [":", "TB101:1"], [".", "TB101.1"], ["/", "TB101/1"], [" ", "TB101 1"]]))}
      <div class="field"><span>Build direction</span>${dirToggle()}</div>
      ${chk("settings.showDest", s.showDest, "Show where each wire goes")}
      ${chk("settings.showTermNames", s.showTermNames, "Show terminal names")}
      ${chk("settings.snapEdges", s.snapEdges, "Snap to neighbours and rails")}
      <hr>
      <h3>Wire profiles</h3>
      ${doc.wireProfiles.length ? `<table class="term-list">${doc.wireProfiles.map((p) => {
        const n = doc.connections.filter((c) => c.profile === p.id).length;
        return `<tr><td>${colorChip(p.color, p.stripe)}${esc(p.name)}</td><td class="muted">${esc([p.gauge, p.conductor].filter(Boolean).join(", "))} · ${n} wire${n === 1 ? "" : "s"}</td></tr>`;
      }).join("")}</table>` : '<p class="muted">No profiles yet.</p>'}
      <div class="btn-row"><button data-act="profiles">Edit wire profiles…</button></div>
      <hr>
      <p class="muted">Select something to edit it. Click a library object to add it — with a part selected, the new one lands flush beside it in the build direction.</p>
      <div class="btn-row"><button data-act="example">Load example</button></div>`;
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
    return `
      <h3>${esc(it.tag || tpl.name)}</h3>
      <p class="sub">${esc(tpl.name)} · ${r3(b.w)} × ${r3(b.h)} mm${isLoose(tpl) ? " · loose (not on a rail)" : ""}</p>
      <div class="row2">${field("Tag", inp("tag", it.tag, "text", 'placeholder="e.g. TB101"'))}${field("Type", sel_("tpl", it.tpl, doc.templates.map((t) => [t.id, t.name])))}</div>
      ${field("Description", inp("desc", it.desc, "text", 'placeholder="Shown on the part"'))}
      <div class="row2">${field("X (mm)", num("x", it.x))}${field("Y (mm)", num("y", it.y))}</div>
      <div class="row2">
        ${field("Rotation", `<div class="btn-row" style="margin:0"><button data-act="rotL" title="Rotate left">⟲</button><button data-act="rotR" title="Rotate right (R)">⟳</button><span class="muted" style="align-self:center">${it.rot || 0}°</span></div>`)}
        ${field("Colour", `<div style="display:flex;gap:4px">${inp("color", it.color || tpl.fill, "color")}${it.color ? '<button class="small" data-act="resetColor" title="Use the type’s colour">↺</button>' : ""}</div>`)}
      </div>
      <div class="btn-row">
        <button data-act="editTpl">Edit object type</button>
        <button data-act="dup">Duplicate</button>
        <button data-act="busNew" title="Bridge terminals with a bus bar">Bus bar…</button>
        <button data-act="delete" class="danger">Delete</button>
      </div>
      <div class="field"><span>Select several to renumber them</span><div class="btn-row" style="margin:0">
        <button data-act="selType" title="Select every ${esc(tpl.name)}">All of this type</button>
        ${tagPrefix(it.tag) ? `<button data-act="selPrefix" title="Select every part tagged ${esc(tagPrefix(it.tag))} plus a number">All “${esc(tagPrefix(it.tag))}…”</button>` : ""}
      </div></div>
      <div class="field"><span>Repeat ${rtl() ? "to the left" : "to the right"} (tags count up)</span>
        <div style="display:flex;gap:6px"><input id="repeatCount" type="number" min="1" max="200" value="5" style="width:70px"><button data-act="repeat">Add copies</button></div>
        ${dirToggle()}
      </div>
      <hr>
      <h3>Terminals</h3>
      ${tpl.terminals.length ? `<table class="term-list">${rows}</table>` : '<p class="muted">This type has no terminals.</p>'}`;
  }

  function railProps(it) {
    return `
      <h3>DIN rail</h3>
      <p class="sub">Parts sitting on the rail move with it.</p>
      <div class="row2">${field("X (mm)", num("x", it.x))}${field("Y (mm)", num("y", it.y))}</div>
      <div class="row2">${field("Length (mm)", num("length", it.length, 1, 'min="10"'))}${field("Profile", sel_("height", it.height, [[35, "35 mm"], [15, "15 mm"]]))}</div>
      <div class="btn-row"><button data-act="fitRail">Fit length to parts</button><button data-act="dup">Duplicate</button><button data-act="delete" class="danger">Delete</button></div>`;
  }

  function textProps(it) {
    return `
      <h3>Text note</h3>
      ${field("Text", `<textarea data-k="text" rows="4">${esc(it.text)}</textarea>`)}
      <div class="row2">${field("Size (mm)", num("size", it.size, 0.5, 'min="0.5"'))}${field("Colour", inp("color", it.color || "#1d2126", "color"))}</div>
      ${chk("bold", it.bold, "Bold")}
      <div class="row2">${field("X (mm)", num("x", it.x))}${field("Y (mm)", num("y", it.y))}</div>
      <div class="btn-row"><button data-act="dup">Duplicate</button><button data-act="delete" class="danger">Delete</button></div>`;
  }

  function connProps(c) {
    const sw = swatches(c.color);
    const custom = c.color !== "gy" ? c.color : "#2e9b3c";
    return `
      <h3>Wire ${esc(c.wire || "")}</h3>
      <p class="sub">${esc(refOf(c.a))} ↔ ${esc(refOf(c.b))}</p>
      ${field("Wire number / label", inp("wire", c.wire, "text", 'placeholder="e.g. W12"'))}
      <div class="field"><span>Profile</span><div style="display:flex;gap:6px">${profileSelect(c.profile)}<button class="small" data-act="profiles" title="Create and edit wire profiles">Edit…</button></div></div>
      <div class="field"><span>Colour · ${esc(wireLookName(c.color, c.stripe))}</span><div class="swatches">${sw}</div>
        <div style="display:flex;gap:6px;align-items:center"><span class="muted" style="font-size:12px">Custom</span>${inp("color", custom, "color")}</div></div>
      <div class="row2">
        ${field("Stripe", stripeSelect("stripe", c.stripe, c.color === "gy"))}
      ${field("Size", inp("gauge", c.gauge, "text", `list="gaugeList" placeholder="e.g. ${wireStd(doc.settings.wireStd).example}"`))}
        ${field("Conductor", sel_("conductor", c.conductor || "", [["", "—"], ...CONDUCTORS.map((x) => [x, x])]))}
      </div>
      ${followBox(c)}
      ${field("Notes", `<textarea data-k="notes" rows="3">${esc(c.notes)}</textarea>`)}
      ${(() => {
        const cb = cableOf(c.id);
        return cb ? `<div class="field"><span>Cable</span><div class="btn-row" style="margin:0"><a data-conn-link="${esc(cb.id)}">${esc(cb.label || "Cable")}${cb.desc ? " · " + esc(cb.desc) : ""}</a>${cb.open ? "" : '<button class="small" data-act="cableRemove">Take out of cable</button>'}</div></div>`
          : '<div class="btn-row"><button data-act="cableNew" title="Draw this wire as a cable (select several wires to bundle them together)">Bundle into a cable</button></div>';
      })()}
      <div class="btn-row"><button data-act="swap" title="Swap From and To">Swap ends</button><button data-act="delete" class="danger">Delete wire</button></div>
      ${circuitBlock(c.id)}`;
  }

  // Tracer stripe picker: none, or any wire colour other than the base. Green/yellow has its own banding.
  function stripeSelect(k, value, off) {
    const opts = [["", "None"], ...WIRE_COLORS.filter((w) => w.value !== "gy").map((w) => [w.value, w.name])];
    if (value && !opts.some(([v]) => v === value)) opts.push([value, "Custom"]);
    return `<select data-k="${k}"${off ? ' disabled title="Green/yellow is already banded"' : ""}>${opts.map(([v, l]) => `<option value="${esc(v)}"${(value || "") === v ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  }

  // Profile picker; choosing one assigns it to the selected wire(s). "mixed" shows when selected wires differ.
  function profileSelect(current, mixed) {
    const opts = (mixed ? [["__mixed", "(mixed)"]] : []).concat([["", "Custom (no profile)"]], doc.wireProfiles.map((p) => [p.id, profileLabel(p)]));
    return `<select data-pf="assign" style="flex:1;min-width:0">${opts.map(([v, l]) => `<option value="${esc(v)}"${(mixed ? v === "__mixed" : v === (current || "")) ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
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
      .concat(bars.map((x) => `<tr><td><a data-conn-link="${esc(x.id)}">${esc(x.label || "Bus")}</a></td><td>Bus bar, ${x.terms.length} terminals</td></tr>`));
    const parts = [others.length && `${others.length} other wire${others.length === 1 ? "" : "s"}`, bars.length && `${bars.length} bus bar${bars.length === 1 ? "" : "s"}`].filter(Boolean);
    const names = circuitNames(doc);
    const name = isConn(id) ? names.conn.get(id) : names.bus.get(id);
    const direct = circuitOf(doc, [id], { direct: true });
    const chain = direct.conns.size + direct.buses.size;
    return `
      <hr>
      <h3>Circuit${name ? " " + esc(name) : ""}</h3>
      ${field("Circuit name", `<input type="text" data-circ="${esc(id)}" list="netList" value="${esc(name || "")}" placeholder="e.g. +24V, 0V, L1">`)}
      <p class="sub">${parts.length ? parts.join(", ") : "Nothing else connected"} · ${terms.length} terminals</p>
      ${rows.length ? `<table class="term-list">${rows.join("")}</table>` : ""}
      <p class="muted" style="font-size:12px">Terminals: ${esc(terms.join(", "))}</p>
      ${rows.length ? `<div class="btn-row"><button data-act="selCircuit">Select whole circuit</button>${chain > 1 && chain < rows.length + 1 ? `<button data-act="selChain" title="Only the wires and bus bars joined at the same terminals, not those on the far side of a terminal block or inside other parts">Select daisy chain (${chain})</button>` : ""}</div>` : ""}
      <p class="muted" style="font-size:12px">Circuits follow wires, bus bars and terminals that are linked inside a part (set in the object type). Terminals with the same connector label, and wires with the same circuit name, are the same circuit even without a wire between them.</p>`;
  }

  function cableProps(cb) {
    const ws = cb.wires.map(connById).filter(Boolean);
    const ends = (k) => [...new Set(ws.map((c) => refOf(c[k]).split(doc.settings.termSep)[0]))].join(", ");
    const near = (c) => (c.a.item === cb.id ? c.b : c.a);
    const rows = ws.map((c) => `<tr><td>${colorChip(c.color, c.stripe)}<a data-conn-link="${esc(c.id)}">${esc(c.wire || "—")}</a></td><td>${cb.open ? `${esc(refOf(c.a.item === cb.id ? c.a : c.b))} → ${esc(refOf(near(c)))}` : `${esc(refOf(c.a))} ↔ ${esc(refOf(c.b))}`}</td><td><button class="icon" data-core="${esc(c.id)}" title="${cb.open ? "Remove this core" : "Take this wire out of the cable"}">✕</button></td></tr>`).join("");
    if (cb.open) {
      return `
      <h3>Cable ${esc(cb.label || "")}</h3>
      <p class="sub">${ws.length} core${ws.length === 1 ? "" : "s"} · ${esc([...new Set(ws.map((c) => refOf(near(c)).split(doc.settings.termSep)[0]))].join(", "))}${cb.to ? " → " + esc(cb.to) : " · other end not drawn"}</p>
      <div class="row2">${field("Label", inp("label", cb.label, "text", 'placeholder="e.g. C1"'))}${field("Description", inp("desc", cb.desc, "text", 'placeholder="e.g. 4x0.75 LiYY"'))}</div>
      ${field("Goes to", inp("to", cb.to || "", "text", 'placeholder="e.g. Pump P1, field sensor B3"'))}
      <div class="field"><span>Sheath colour · ${esc(wireColorName(cb.color))}</span><div class="swatches">${swatches(cb.color)}</div></div>
      ${field("Notes", `<textarea data-k="notes" rows="2">${esc(cb.notes || "")}</textarea>`)}
      <h3>Cores</h3>
      <table class="term-list">${rows}</table>
      <p class="muted" style="font-size:12px">Each core is a wire: click one to set its colour, size or profile. Drag the orange dots to move where the cores fan out and where the cable ends.</p>
      <div class="btn-row">
        <button data-act="cableCores" title="Pick more terminals for this cable">Add cores…</button>
        <button data-act="cableReset"${cb.pa || cb.pb ? "" : " disabled"}>Reset layout</button>
        <button data-act="cableSelect">Select its cores</button>
      </div>
      <div class="btn-row"><button data-act="cableDelete" class="danger">Delete cable</button></div>`;
    }
    return `
      <h3>Cable ${esc(cb.label || "")}</h3>
      <p class="sub">${ws.length} core${ws.length === 1 ? "" : "s"} · ${esc(ends("a"))} ↔ ${esc(ends("b"))}</p>
      <div class="row2">${field("Label", inp("label", cb.label, "text", 'placeholder="e.g. C1"'))}${field("Description", inp("desc", cb.desc, "text", 'placeholder="e.g. 3G1.5 H07RN-F"'))}</div>
      <div class="field"><span>Sheath colour · ${esc(wireColorName(cb.color))}</span><div class="swatches">${swatches(cb.color)}</div></div>
      ${field("Notes", `<textarea data-k="notes" rows="2">${esc(cb.notes || "")}</textarea>`)}
      <h3>Cores</h3>
      <table class="term-list">${rows}</table>
      <p class="muted" style="font-size:12px">To add wires, Shift-click them along with the cable, then use <i>Add to ${esc(cb.label || "cable")}</i>. Drag the orange dots at the sheath ends to move where the cores fan out.</p>
      <div class="btn-row">
        <button data-act="cableReset" title="Put the fan-out points back where they're worked out automatically"${cb.pa || cb.pb ? "" : " disabled"}>Reset fan-out points</button>
        <button data-act="cableSelect">Select its wires</button>
      </div>
      <div class="btn-row">
        <button data-act="cableUnbundle" title="Remove the cable but keep its wires">Unbundle</button>
        <button data-act="cableDelete" class="danger">Delete cable and wires</button>
      </div>`;
  }

  function multiProps(ids) {
    const items = ids.filter((i) => itemById(i)).length;
    const wires = ids.filter(isConn).length;
    const bars = ids.filter((i) => busById(i)).length;
    const cbs = ids.map(cableById).filter(Boolean);
    return `
      <h3>${ids.length} selected</h3>
      ${wires && cbs.length === 1 && !cbs[0].open ? `<div class="btn-row"><button data-act="cableAdd" class="primary">Add ${wires} wire${wires === 1 ? "" : "s"} to ${esc(cbs[0].label || "the cable")}</button></div>` : ""}
      ${wires && !cbs.length ? `<div class="btn-row"><button data-act="cableNew" title="Group these wires into a cable, drawn as one sheath that fans out to each terminal">Bundle ${wires} wires into a cable</button></div>` : ""}
      <p class="sub">${items} item${items === 1 ? "" : "s"}${wires ? `, ${wires} wire${wires === 1 ? "" : "s"}` : ""}${bars ? `, ${bars} bus bar${bars === 1 ? "" : "s"}` : ""}</p>
      ${wires ? (() => {
        const ps = new Set(ids.filter(isConn).map((id) => connById(id).profile || ""));
        return `<div class="field"><span>Wire profile for ${wires} wire${wires === 1 ? "" : "s"}</span><div style="display:flex;gap:6px">${profileSelect([...ps][0], ps.size > 1)}<button class="small" data-act="profiles">Edit…</button></div></div>`;
      })() : ""}
      ${items > 1 ? `<div class="field"><span>Arrange</span><div class="btn-row" style="margin:0">
        <button data-act="align" data-mode="pack" title="Line up side by side with no gaps, in the build direction">Pack side by side</button>
        <button data-act="align" data-mode="middle" title="Centre vertically on the leftmost item">Align middles</button>
        <button data-act="align" data-mode="top">Align tops</button>
        <button data-act="align" data-mode="bottom">Align bottoms</button>
        <button data-act="align" data-mode="left">Align lefts</button>
      </div>${dirToggle()}</div>` : ""}
      <div class="btn-row">
        ${items ? '<button data-act="dup">Duplicate</button><button data-act="rotR">Rotate</button>' : ""}
        <button data-act="delete" class="danger">Delete</button>
      </div>
      ${renumberBlock(ids.map(itemById).filter((i) => i && i.kind === "part"))}`;
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
    return `
      <hr>
      <h3>Renumber tags</h3>
      <p class="sub">${parts.length} parts, numbered in position order. Wires stay connected.</p>
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
      <p class="muted" id="rnPreview">${esc(renumberPreview(parts, { prefix, start, step: 1, order }))}</p>
      <div class="btn-row"><button data-act="renumber" class="primary">Renumber ${parts.length} parts</button></div>`;
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
    const target = propsTarget();
    if (!k || !target) return;
    const v = readInput(el);
    if (v === undefined) return;
    if (k === "settings.wireStd") {
      setWireStd(v);
      toast(v === "us" ? "Wires switched to AWG and US colours" : "Wires switched to mm² and IEC colours");
      return;
    }
    setPath(target, k, v);
    if (propsCtx.type === "bus" && k === "color") handEdited(target);
    if (propsCtx.type === "conn" && /^(color|stripe|gauge|conductor)$/.test(k)) {
      lastWire[k] = v;
      // Changing a wire by hand makes it a custom wire rather than following its profile.
      const p = profileById(target.profile);
      if (p && (p[k] || "") !== v) { target.profile = ""; lastWire.profile = ""; }
      handEdited(target);
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
    if (el.dataset.pf === "assign") {
      if (el.value === "__mixed") return;
      checkpoint();
      assignProfile([...sel].map(connById).filter(Boolean), el.value);
      refresh();
      return;
    }
    if ("follow" in el.dataset) {
      const c = propsTarget();
      if (!c) return;
      checkpoint();
      c.follow = el.checked;
      const src = c.follow && circuitSource(c, c);
      if (src) copyLook(c, src);
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
    const sw = e.target.closest("[data-color]");
    if (sw) {
      const c = propsTarget();
      if (!c || !(propsCtx.type === "conn" || propsCtx.type === "bus" || propsCtx.type === "cable")) return;
      checkpoint();
      c.color = sw.dataset.color;
      if (propsCtx.type === "conn") {
        lastWire.color = c.color;
        if (profileById(c.profile)?.color !== c.color) { c.profile = ""; lastWire.profile = ""; }
      }
      if (propsCtx.type !== "cable") handEdited(c);
      refresh();
      return;
    }
    const link = e.target.closest("[data-conn-link]");
    if (link) { sel = new Set([link.dataset.connLink]); refresh(); return; }
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
      case "selChain": selectCircuit(true); break;
      case "profiles": openProfiles(); break;
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
      case "resetColor": checkpoint(); delete target.color; refresh(); break;
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
      case "fitRail": fitRail(target); break;
      case "example":
        if (!confirm("Replace the current diagram with the example? (You can undo this.)")) break;
        checkpoint();
        { const std = doc.settings.wireStd; doc = normalize(exampleProject()); setWireStd(std); }
        sel.clear();
        afterLoad();
        requestAnimationFrame(fit);
        break;
    }
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

  function openProfiles() {
    profCheckpointed = false;
    renderProfiles();
    $("profModal").hidden = false;
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
        <td><button class="icon" data-pdel title="Delete profile">✕</button></td>
      </tr>`;
    }).join("") || '<tr><td colspan="7" class="muted" style="padding:10px">No profiles. Add one below.</td></tr>';
  }

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
  $("profModal").addEventListener("click", (e) => { if (e.target.id === "profModal") $("profModal").hidden = true; });
  new MutationObserver(() => { if ($("profModal").hidden) refresh(); }).observe($("profModal"), { attributes: true, attributeFilter: ["hidden"] });

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
      body.innerHTML = `<table class="data-table"><thead><tr><th>Cable</th><th>Description</th><th>Cores</th><th>Notes</th></tr></thead><tbody>
        ${cableRows().map((cb) => `<tr data-sel="${esc(cb.id)}" class="${sel.has(cb.id) ? "sel" : ""}">
          <td><b>${esc(cb.label)}</b></td><td>${esc([cb.desc, cb.to && "→ " + cb.to].filter(Boolean).join(" "))}</td><td>${esc(cableCores(cb).join(", "))}</td><td>${esc(cb.notes || "")}</td></tr>`).join("")
        || '<tr><td colspan="4" class="empty">No cables yet. Select some wires and choose “Bundle into a cable”.</td></tr>'}
      </tbody></table>`;
    } else if (drawerTab === "buses") {
      const circ = circuitOf(doc, [...sel].filter((id) => isConn(id) || busById(id)));
      const names = circuitNames(doc);
      body.innerHTML = `<table class="data-table"><thead><tr><th>Bus bar</th><th>Terminals</th><th>Circuit</th><th>Colour</th><th>Notes</th></tr></thead><tbody>
        ${busRows().map((b) => `<tr data-sel="${esc(b.id)}" class="${sel.has(b.id) ? "sel" : circ.buses.has(b.id) ? "net" : ""}">
          <td><b>${esc(b.label)}</b></td><td>${esc(busRefs(b).join(", "))}</td><td>${esc(names.bus.get(b.id) || "")}</td>
          <td>${colorChip(b.color)}${esc(wireColorName(b.color))}</td><td>${esc(b.notes)}</td></tr>`).join("")
        || '<tr><td colspan="5" class="empty">No bus bars yet. Use “Bus bar” under Add, then click the terminals to bridge.</td></tr>'}
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
        }).join("") || '<tr><td colspan="5" class="empty">No parts yet.</td></tr>'}
        ${summary ? `<tr><td colspan="5" class="empty">${summary}</td></tr>` : ""}
      </tbody></table>`;
    }
  }

  $("drawer").addEventListener("click", (e) => {
    const tab = e.target.closest("[data-tab]");
    if (tab) {
      drawerTab = tab.dataset.tab;
      for (const b of document.querySelectorAll(".drawer-tabs [data-tab]")) b.classList.toggle("active", b === tab);
      $("drawer").classList.remove("collapsed");
      $("btnDrawerToggle").textContent = "▾";
      renderDrawer();
      requestAnimationFrame(applyView);
      return;
    }
    if (e.target.closest("#btnDrawerToggle")) {
      const c = $("drawer").classList.toggle("collapsed");
      $("btnDrawerToggle").textContent = c ? "▴" : "▾";
      requestAnimationFrame(applyView);
      return;
    }
    const row = e.target.closest("[data-sel]");
    if (row) { sel = new Set([row.dataset.sel]); refresh(); }
  });

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
      afterLoad();
      requestAnimationFrame(fit);
      toast("Opened " + f.name);
    });
  });

  $("libFileInput").addEventListener("change", (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    readJSONFile(f, (d) => {
      const list = d && Array.isArray(d.templates) ? d.templates : null;
      if (!list) { alert("No object types found in that file."); return; }
      checkpoint();
      let added = 0, updated = 0;
      for (const t of list) {
        if (!t || !t.id || !(t.w > 0) || !(t.h > 0)) continue;
        t.terminals = t.terminals || [];
        upgradeTemplate(t);
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
      cleanConnections();
      renderLibrary();
      refresh();
      toast(`Imported ${added} new and ${updated} updated object type${added + updated === 1 ? "" : "s"}${profiles ? ` and ${profiles} wire profile${profiles === 1 ? "" : "s"}` : ""}`);
    });
  });

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

  // ---------- toolbar wiring ----------
  $("btnNew").addEventListener("click", () => {
    if (!confirm("Start a new, empty diagram? Your object library is kept. (You can undo this.)")) return;
    checkpoint();
    { const std = doc.settings.wireStd; doc = normalize(newProject(doc.templates)); setWireStd(std); }
    sel.clear();
    afterLoad();
    requestAnimationFrame(fit);
  });
  $("btnOpen").addEventListener("click", () => $("fileInput").click());
  $("btnSave").addEventListener("click", saveFile);
  $("btnExport").addEventListener("click", (e) => { e.stopPropagation(); $("exportMenu").hidden = !$("exportMenu").hidden; });
  document.addEventListener("click", () => { $("exportMenu").hidden = true; });
  $("exportMenu").addEventListener("click", (e) => {
    const b = e.target.closest("[data-export]");
    if (!b) return;
    $("exportMenu").hidden = true;
    const kind = b.dataset.export;
    if (kind === "svg") download(slug(doc.meta.title) + ".svg", exportSVGString().svg, "image/svg+xml");
    if (kind === "png") exportPNG();
    if (kind === "csv") exportCSV();
    if (kind === "print") printDoc();
  });
  $("btnUndo").addEventListener("click", undo);
  $("btnRedo").addEventListener("click", redo);
  $("btnZoomIn").addEventListener("click", () => zoomAt(1.25));
  $("btnZoomOut").addEventListener("click", () => zoomAt(0.8));
  $("btnFit").addEventListener("click", fit);
  $("linesSelect").addEventListener("change", (e) => { checkpoint(); doc.settings.lines = e.target.value; refresh(); });
  $("btnHelp").addEventListener("click", () => { $("helpModal").hidden = false; });
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => { $(b.dataset.close).hidden = true; }));
  $("helpModal").addEventListener("click", (e) => { if (e.target.id === "helpModal") $("helpModal").hidden = true; });
  $("btnAddRail").addEventListener("click", () => addRail());
  $("btnAddText").addEventListener("click", () => addText());
  $("btnAddBus").addEventListener("click", () => startBus(null));
  $("btnAddCable").addEventListener("click", () => startCable(null));
  $("btnLibFold").addEventListener("click", () => {
    const cats = categories();
    ui.folded = cats.every((c) => ui.folded.includes(c)) ? [] : cats;
    saveUi();
    renderLibrary();
  });
  $("btnLeftCollapse").addEventListener("click", () => setLeftHidden(true));
  $("btnLeftExpand").addEventListener("click", () => setLeftHidden(false));
  setLeftHidden(!!ui.leftHidden);
  $("btnNewTpl").addEventListener("click", newTemplate);
  $("btnLibExport").addEventListener("click", () => {
    download("dinstack-library.json", JSON.stringify({ type: "dinstack-library", app: APP_VERSION, templates: doc.templates, wireProfiles: doc.wireProfiles }, null, 2), "application/json");
  });
  $("btnLibImport").addEventListener("click", () => $("libFileInput").click());
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
  doc = loadInitial();
  renderLibrary();
  applyView();
  refresh();
  requestAnimationFrame(fit);
})();
