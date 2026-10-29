// Geometry helpers and SVG rendering. All coordinates are millimetres.

const SIDES = ["top", "right", "bottom", "left"];
const SIDE_VEC = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };
const FONT = "Arial, Helvetica, sans-serif";

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function n(v) { return Math.round(v * 1000) / 1000; }

function tplMap(doc) {
  const m = new Map();
  for (const t of doc.templates) m.set(t.id, t);
  return m;
}

function itemMap(doc) {
  const m = new Map();
  for (const it of doc.items) m.set(it.id, it);
  return m;
}

// The page an item is on: its own, or the first page if it has none or its page is gone.
function pageOf(doc, it) {
  const ps = doc.pages || [];
  return it && ps.some((p) => p.id === it.page) ? it.page : ps[0]?.id;
}

function pageName(doc, id) {
  return (doc.pages || []).find((p) => p.id === id)?.name || "";
}

function textLines(it) { return String(it.text || "").split("\n"); }

// A text note's box before turning (x, y its top-left corner) and its angle in degrees, clockwise. A note
// turns about the middle of that box, so turning it leaves it where it is.
function textFrame(it) {
  const lines = textLines(it);
  const longest = Math.max(1, ...lines.map((l) => l.length));
  return { x: it.x, y: it.y, w: longest * it.size * 0.56, h: lines.length * it.size * 1.25, rot: ((+it.rot || 0) % 360 + 360) % 360 };
}

// Bounding box of any diagram item in world coordinates.
function itemBox(it, tpl) {
  if (it.kind === "rail") return { x: it.x, y: it.y, w: it.length, h: it.height };
  if (it.kind === "duct") return { x: it.x, y: it.y, w: it.vertical ? it.width : it.length, h: it.vertical ? it.length : it.width };
  if (it.kind === "plate") return { x: it.x, y: it.y, w: it.w, h: it.h };
  if (it.kind === "text") {
    // The box round the turned note.
    const f = textFrame(it), a = (f.rot * Math.PI) / 180;
    const w = Math.abs(f.w * Math.cos(a)) + Math.abs(f.h * Math.sin(a)), h = Math.abs(f.w * Math.sin(a)) + Math.abs(f.h * Math.cos(a));
    return { x: f.x + (f.w - w) / 2, y: f.y + (f.h - h) / 2, w, h };
  }
  if (!tpl) return { x: it.x, y: it.y, w: 10, h: 10 };
  const r = (it.rot || 0) % 180 !== 0;
  return { x: it.x, y: it.y, w: r ? tpl.h : tpl.w, h: r ? tpl.w : tpl.h };
}

// Which edge a terminal faces in the template's own (unrotated) frame.
function localSide(tpl, t) {
  if (t.side && t.side !== "auto") return t.side;
  // Distance relative to the part's size, so thin parts like terminal blocks face up/down rather than sideways.
  const d = { top: t.y / tpl.h, right: (tpl.w - t.x) / tpl.w, bottom: (tpl.h - t.y) / tpl.h, left: t.x / tpl.w };
  let best = "top";
  for (const s of SIDES) if (d[s] < d[best]) best = s;
  return best;
}

// Rotate a template-local point clockwise by rot degrees; result is relative to the rotated box's top-left.
function rotPoint(x, y, w, h, rot) {
  switch (((rot || 0) % 360 + 360) % 360) {
    case 90: return { x: h - y, y: x };
    case 180: return { x: w - x, y: h - y };
    case 270: return { x: y, y: w - x };
    default: return { x, y };
  }
}

function termWorld(it, tpl, t) {
  const rot = it.rot || 0;
  const p = rotPoint(t.x, t.y, tpl.w, tpl.h, rot);
  const side = SIDES[(SIDES.indexOf(localSide(tpl, t)) + Math.round(rot / 90)) % 4];
  return { x: it.x + p.x, y: it.y + p.y, side };
}

// Closest distance between two terminals of a type (cached until the terminals move).
const spacingCache = new WeakMap();
function termSpacing(tpl) {
  const ts = tpl.terminals;
  const sig = ts.map((t) => t.x + "," + t.y).join(";");
  const hit = spacingCache.get(tpl);
  if (hit && hit.sig === sig) return hit.d;
  let d = Infinity;
  for (let i = 0; i < ts.length; i++) {
    for (let j = i + 1; j < ts.length; j++) d = Math.min(d, Math.hypot(ts[i].x - ts[j].x, ts[i].y - ts[j].y));
  }
  spacingCache.set(tpl, { sig, d });
  return d;
}

// Terminal dots fit the part and their spacing, so closely pitched pins (e.g. 2.54 mm) don't overlap.
function termRadius(tpl) {
  return Math.max(0.5, Math.min(1.4, tpl.w * 0.28, tpl.h * 0.28, termSpacing(tpl) * 0.4));
}

// Terminals too close together for names beside them get their names inside the dot instead.
const denseTerms = (tpl) => termSpacing(tpl) < 3.6;

// Bus bar slots are drawn as small square recesses.
function slotSize(tpl) {
  return Math.max(1.2, Math.min(2.6, tpl.w * 0.5, tpl.h * 0.5));
}

function slotRect(x, y, tpl, extra = "") {
  const a = slotSize(tpl);
  return `<rect x="${n(x - a / 2)}" y="${n(y - a / 2)}" width="${n(a)}" height="${n(a)}" rx="${n(a * 0.18)}" fill="#4b5058" stroke="#24282d" stroke-width="0.25"${extra}/>`;
}

// Cable connectors (ports) are drawn as sockets, sized to the gap to the nearest other terminal.
function portSize(tpl) {
  let d = Infinity;
  for (const p of tpl.terminals) {
    if (!isPort(p)) continue;
    for (const t of tpl.terminals) if (t !== p) d = Math.min(d, Math.hypot(p.x - t.x, p.y - t.y));
  }
  return Math.max(2.4, Math.min(7, d * 0.75, tpl.w * 0.7, tpl.h * 0.7));
}

function portGlyph(x, y, tpl, extra = "") {
  const a = portSize(tpl), h = a * 0.78;
  return `<rect x="${n(x - a / 2)}" y="${n(y - h / 2)}" width="${n(a)}" height="${n(h)}" rx="${n(a * 0.08)}" fill="#2b2f35" stroke="#15181b" stroke-width="0.25"${extra}/>`
    + `<rect x="${n(x - a * 0.36)}" y="${n(y - h * 0.3)}" width="${n(a * 0.72)}" height="${n(h * 0.52)}" fill="#0e1012" pointer-events="none"/>`
    + `<rect x="${n(x - a * 0.14)}" y="${n(y + h * 0.22)}" width="${n(a * 0.28)}" height="${n(h * 0.16)}" fill="#0e1012" pointer-events="none"/>`;
}

// Where a cable leaves a connector: a little way out from the socket, the way the connector faces.
function portExit(p) {
  const v = SIDE_VEC[p.side] || [0, 1];
  const off = portSize(p.tpl) / 2 + 2.5;
  return { x: p.x + v[0] * off, y: p.y + v[1] * off, at: p, v };
}

function rotTransform(tpl, rot) {
  switch (((rot || 0) % 360 + 360) % 360) {
    case 90: return ` translate(${n(tpl.h)} 0) rotate(90)`;
    case 180: return ` translate(${n(tpl.w)} ${n(tpl.h)}) rotate(180)`;
    case 270: return ` translate(0 ${n(tpl.w)}) rotate(270)`;
    default: return "";
  }
}

function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return 1;
  const v = parseInt(m[1], 16);
  const ch = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function inkFor(fill) { return luminance(fill) > 0.32 ? "#1d2126" : "#f5f6f7"; }

function darken(hex, f) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return "#3b4048";
  const v = parseInt(m[1], 16);
  const c = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((x) => Math.round(x * f));
  return "#" + c.map((x) => x.toString(16).padStart(2, "0")).join("");
}

function wireColorName(value) {
  const c = WIRE_COLORS.find((w) => w.value.toLowerCase() === String(value).toLowerCase());
  return c ? c.name : value;
}

// A wire's colour with its tracer stripe, base colour first: "Red/White".
function wireLookName(color, stripe) {
  return wireColorName(color) + (stripe ? "/" + wireColorName(stripe) : "");
}

// A wire-styled path: dark casing, colour core, then green/yellow banding or a tracer stripe (short
// dashes of the stripe colour, so the base colour still reads as the main one).
function wirePath(d, color, width, extra = "", stripe = "") {
  const core = color === "gy" ? "#f0c000" : color || "#1f1f1f";
  let s = `<path d="${d}" fill="none" stroke="#3a3f45" stroke-width="${n(width + 0.3)}" stroke-linecap="round" ${extra}/>`;
  s += `<path d="${d}" fill="none" stroke="${core}" stroke-width="${n(width)}" stroke-linecap="round" ${extra}/>`;
  if (color === "gy") s += `<path d="${d}" fill="none" stroke="#2e9b3c" stroke-width="${n(width)}" stroke-dasharray="1.6 1.6" ${extra}/>`;
  if (stripe && stripe !== "gy") s += `<path d="${d}" fill="none" stroke="${esc(stripe)}" stroke-width="${n(width)}" stroke-dasharray="0.7 1.5" ${extra}/>`;
  return s;
}

// "TB101-1": a part's tag (or type name) and a terminal's name. who, if given, names the part instead
// (its reference designation, see partRef).
function endRef(it, tpl, termId, sep = "-", who) {
  if (!it || !tpl) return "?";
  const t = tpl.terminals.find((x) => x.id === termId);
  return (who ?? (it.tag || tpl.name)) + sep + (t ? t.name : "?");
}

// Reference designations (IEC 81346), when settings.refStyle is "iec": a part is "-K1", led by the
// function (=) and location (+) of its page, or else the diagram's (meta.func, meta.location).
// Stored without their = and + signs.
const aspectText = (v) => String(v || "").trim().replace(/^[=+]+\s*/, "");
const iecRefs = (doc) => doc.settings.refStyle === "iec";
function pageAspects(doc, pageId) {
  const p = (doc.pages || []).find((x) => x.id === pageId) || {}, m = doc.meta || {};
  return { func: aspectText(p.func) || aspectText(m.func), loc: aspectText(p.location) || aspectText(m.location) };
}

// "=PUMP+CAB1": the function and location of a page, as written before a part's tag.
function aspectPrefix(doc, pageId) {
  const a = pageAspects(doc, pageId);
  return (a.func ? "=" + a.func : "") + (a.loc ? "+" + a.loc : "");
}

// How a part is named in references: its tag (or type name without one). With IEC designations it's
// "-K1", led by its function and location, except those it shares with page ctx (the page a label is
// drawn on); with no ctx, in full ("=PUMP+CAB1-K1").
function partRef(doc, it, tpl, ctx) {
  if (!it || !tpl) return "?";
  if (!it.tag) return tpl.name;
  if (!iecRefs(doc)) return it.tag;
  const a = pageAspects(doc, pageOf(doc, it)), c = ctx ? pageAspects(doc, ctx) : { func: "", loc: "" };
  const f = a.func && a.func !== c.func ? "=" + a.func : "";
  const l = a.loc && (f || a.loc !== c.loc) ? "+" + a.loc : "";
  return f + l + "-" + it.tag;
}

// A part's tag as shown on it: "-K1" with IEC designations.
const shownTag = (doc, it) => (it.tag && iecRefs(doc) ? "-" + it.tag : it.tag || "");

// The cable a connection end is on, if it's on a cable rather than a terminal: the far end of a one-ended
// cable's core (off the drawing), or the end of a bundled core that isn't connected there.
function cableEndOf(doc, e) {
  return (doc.cables || []).find((k) => k.id === e.item) || null;
}

// Reference for either kind of connection end: "TB101-1" for a terminal, "C1-3" for core 3 of a
// cable at an end where it isn't on a terminal. ctx: the page it's written on (see partRef).
function endLabel(doc, items, tpls, e, sep = "-", ctx) {
  const it = items.get(e.item);
  if (it) { const tpl = tpls.get(it.tpl); return endRef(it, tpl, e.term, sep, partRef(doc, it, tpl, ctx)); }
  const cb = cableEndOf(doc, e);
  return cb ? (cb.label || "Cable") + sep + e.term : "?";
}

// Connections whose ends both still exist (a terminal, or the far end of a one-ended cable).
function validConnections(doc, items, tpls) {
  return doc.connections.filter((c) => {
    for (const e of [c.a, c.b]) {
      if (cableEndOf(doc, e)) continue;
      const it = items.get(e.item);
      const tpl = it && tpls.get(it.tpl);
      if (!tpl || !tpl.terminals.some((t) => t.id === e.term)) return false;
    }
    return true;
  });
}

// Bus bars with their missing terminals dropped; a bar needs at least two terminals to exist.
function validBuses(doc, items, tpls) {
  const ok = (e) => {
    const it = items.get(e.item);
    const tpl = it && tpls.get(it.tpl);
    return !!(tpl && tpl.terminals.some((t) => t.id === e.term));
  };
  return (doc.buses || []).map((b) => ({ ...b, terms: b.terms.filter(ok) })).filter((b) => b.terms.length >= 2);
}

// Order bus bar points along the row they form (left to right, or top to bottom for a column).
function busOrder(points) {
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const wide = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys);
  return points.slice().sort(wide ? (a, b) => a.x - b.x || a.y - b.y : (a, b) => a.y - b.y || a.x - b.x);
}

// Electrical circuits: terminals joined by wires, bus bars, or a shared "link" value inside a part
// (e.g. both sides of a terminal block). Returns a find(terminalKey) -> circuit id function.
// With opt.direct, only wires and bus bars count: a daisy chain, not crossing to a part's other terminals.
// With opt.physical, only what's wired together counts (wires, bus bars and links inside parts), not names.
function buildCircuits(doc, items, tpls, conns, buses, opt = {}) {
  const parent = new Map();
  const find = (k) => {
    if (!parent.has(k)) parent.set(k, k);
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r);
    while (parent.get(k) !== r) { const nx = parent.get(k); parent.set(k, r); k = nx; }
    return r;
  };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  for (const it of items.values()) {
    const tpl = !opt.direct && it.kind === "part" && tpls.get(it.tpl);
    if (!tpl) continue;
    const first = new Map();
    for (const t of tpl.terminals) {
      const link = String(t.link || "").trim();
      if (!link) continue;
      const k = it.id + "|" + t.id;
      if (first.has(link)) union(first.get(link), k); else first.set(link, k);
    }
  }
  for (const c of conns) union(c.a.item + "|" + c.a.term, c.b.item + "|" + c.b.term);
  for (const b of buses) for (const e of b.terms.slice(1)) union(b.terms[0].item + "|" + b.terms[0].term, e.item + "|" + e.term);
  // Same name, same circuit: terminals with the same connector label, and wires or bus bars given the
  // same circuit name, are joined even with no wire between them (e.g. every "+24V" point).
  if (opt.direct || opt.physical) return find;
  const named = new Map();
  forEachName(items, tpls, conns, buses, (name, k) => {
    const nk = netKey(name);
    if (named.has(nk)) union(named.get(nk), k); else named.set(nk, k);
  });
  return find;
}

const netKey = (name) => String(name || "").trim().toLowerCase();

// Calls fn(name, "item|term") for every connector label and every named wire or bus bar.
function forEachName(items, tpls, conns, buses, fn) {
  for (const it of items.values()) {
    const tpl = it.kind === "part" && it.termLabels && tpls.get(it.tpl);
    if (!tpl) continue;
    for (const t of tpl.terminals) {
      const name = String(it.termLabels[t.id] || "").trim();
      if (name) fn(name, it.id + "|" + t.id);
    }
  }
  for (const c of conns) if (netKey(c.circuit)) fn(c.circuit.trim(), c.a.item + "|" + c.a.term);
  for (const b of buses) if (netKey(b.circuit)) fn(b.circuit.trim(), b.terms[0].item + "|" + b.terms[0].term);
}

// Circuit names for the whole diagram: { conn: Map id -> name, bus: Map id -> name, term("item|term") -> name,
// names("item|term") -> the circuit's names as a list }.
// A circuit carrying several different names gets them all, joined with " / ".
function circuitNames(doc) {
  const items = itemMap(doc), tpls = tplMap(doc);
  const conns = validConnections(doc, items, tpls), buses = validBuses(doc, items, tpls);
  const find = buildCircuits(doc, items, tpls, conns, buses);
  const byRoot = new Map();
  forEachName(items, tpls, conns, buses, (name, k) => {
    const r = find(k);
    if (!byRoot.has(r)) byRoot.set(r, new Map());
    const m = byRoot.get(r);
    if (!m.has(netKey(name))) m.set(netKey(name), name);
  });
  const namesOf = (k) => {
    const m = byRoot.get(find(k));
    return m ? [...m.values()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : [];
  };
  const nameOf = (k) => namesOf(k).join(" / ");
  const out = { conn: new Map(), bus: new Map(), term: nameOf, names: namesOf };
  for (const c of conns) out.conn.set(c.id, nameOf(c.a.item + "|" + c.a.term));
  for (const b of buses) out.bus.set(b.id, nameOf(b.terms[0].item + "|" + b.terms[0].term));
  return out;
}

// Everything in the same circuit(s) as the given wires / bus bars (or terminals, as "item|term"):
// { conns: Set of ids, buses: Set of ids, terms: Set of "item|term" }. opt as for buildCircuits.
function circuitOf(doc, ids, opt) {
  const items = itemMap(doc), tpls = tplMap(doc);
  const conns = validConnections(doc, items, tpls);
  const buses = validBuses(doc, items, tpls);
  const find = buildCircuits(doc, items, tpls, conns, buses, opt);
  const key = (e) => e.item + "|" + e.term;
  const roots = new Set();
  for (const c of conns) if (ids.includes(c.id)) roots.add(find(key(c.a)));
  for (const b of buses) if (ids.includes(b.id)) roots.add(find(key(b.terms[0])));
  for (const id of ids) if (String(id).includes("|")) roots.add(find(id));
  const out = { conns: new Set(), buses: new Set(), terms: new Set() };
  if (!roots.size) return out;
  for (const c of conns) if (roots.has(find(key(c.a)))) out.conns.add(c.id);
  for (const b of buses) if (roots.has(find(key(b.terms[0])))) out.buses.add(b.id);
  for (const it of items.values()) {
    const tpl = it.kind === "part" && tpls.get(it.tpl);
    if (!tpl) continue;
    for (const t of tpl.terminals) {
      const k = it.id + "|" + t.id;
      if (roots.has(find(k))) out.terms.add(k);
    }
  }
  return out;
}

function fitText(text, size, maxLen) {
  const est = String(text).length * size * 0.6;
  return est > maxLen && est > 0 ? (size * maxLen) / est : size;
}

function renderRail(it, attrs) {
  const { x, y, length: w, height: h } = it;
  const lip = h * 0.14;
  let s = `<g ${attrs}>`;
  s += `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="#cfd4da" stroke="#6b7179" stroke-width="0.35"/>`;
  s += `<rect x="${n(x)}" y="${n(y + lip)}" width="${n(w)}" height="${n(h - 2 * lip)}" fill="#bcc2c9" stroke="#8b929a" stroke-width="0.25"/>`;
  const slotW = Math.min(15, h * 0.43), slotH = h * 0.15, pitch = 25;
  for (let sx = x + 6; sx + slotW <= x + w - 4; sx += pitch) {
    s += `<rect x="${n(sx)}" y="${n(y + h / 2 - slotH / 2)}" width="${n(slotW)}" height="${n(slotH)}" rx="${n(slotH / 2)}" fill="#f4f6f8" stroke="#8b929a" stroke-width="0.25"/>`;
  }
  return s + "</g>";
}

// Slotted wire duct, seen from the front with its cover on: the cover down the middle and the fingers along
// both sides, a slot every 12 mm. Its label is on the cover at its start; fill ({ pct, over }), when given,
// is added there, and a duct over its fill limit is outlined in red.
function renderDuct(it, attrs, fill) {
  const b = itemBox(it), v = !!it.vertical;
  const len = v ? b.h : b.w, wd = v ? b.w : b.h;
  // Draw it lying along x, turned upright for a vertical duct.
  const R = (x, y, w, h, extra) => (v ? `<rect x="${n(b.x + y)}" y="${n(b.y + x)}" width="${n(h)}" height="${n(w)}" ${extra}/>` : `<rect x="${n(b.x + x)}" y="${n(b.y + y)}" width="${n(w)}" height="${n(h)}" ${extra}/>`);
  let s = `<g ${attrs}>` + R(0, 0, len, wd, 'fill="#b9bec4" stroke="#6b7179" stroke-width="0.35"');
  const finger = Math.min(wd * 0.28, 12), slot = 4, pitch = 12;
  for (let x = (len % pitch) / 2 + (pitch - slot) / 2; x + slot <= len; x += pitch) {
    s += R(x, 0, slot, finger, 'fill="#8e949b"') + R(x, wd - finger, slot, finger, 'fill="#8e949b"');
  }
  s += R(0, finger, len, wd - 2 * finger, 'fill="#c9cdd2" stroke="#7c828a" stroke-width="0.25"');
  const over = fill && fill.over;
  if (over) s += R(0, 0, len, wd, 'fill="none" stroke="#d32f2f" stroke-width="0.8"');
  const text = [it.label, fill && (fill.pct >= 0.5 || over) ? `${Math.round(fill.pct)} %` : ""].filter(Boolean).join(" · ");
  const size = Math.min(5, (wd - 2 * finger) * 0.6);
  if (text) s += `<text x="${n(v ? b.x + b.w / 2 : b.x + 3)}" y="${n(v ? b.y + 3 + size : b.y + b.h / 2)}" font-family="${FONT}" font-size="${n(size)}" ${v ? 'text-anchor="middle"' : ""} dominant-baseline="${v ? "auto" : "central"}" fill="${over ? "#d32f2f" : "#4b5058"}"${over ? ' font-weight="bold"' : ""} pointer-events="none">${esc(text)}</text>`;
  return s + "</g>";
}

// The back plate (or enclosure): an outline under everything, named at its top left. Only its edge picks
// it up, so clicks inside it reach the drawing.
function renderPlate(it, attrs) {
  const { x, y, w, h } = it;
  return `<g ${attrs}><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="2" fill="#a0a8b2" fill-opacity="0.12" stroke="#8b929a" stroke-width="0.6" pointer-events="none"/>`
    + `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="2" fill="none" stroke="transparent" stroke-width="4" pointer-events="stroke"/>`
    + (it.name ? `<text x="${n(x + 3)}" y="${n(y + 5)}" font-family="${FONT}" font-size="3.5" fill="#6b7179" pointer-events="none">${esc(it.name)}</text>` : "")
    + "</g>";
}

function renderText(it, attrs) {
  const lines = textLines(it);
  const size = it.size || 3;
  const f = textFrame(it);
  const turn = f.rot ? ` transform="rotate(${n(f.rot)} ${n(f.x + f.w / 2)} ${n(f.y + f.h / 2)})"` : "";
  let s = `<text ${attrs} x="${n(it.x)}" y="${n(it.y + size * 0.85)}"${turn} font-family="${FONT}" font-size="${n(size)}" fill="${esc(it.color || "#1d2126")}"${it.bold ? ' font-weight="bold"' : ""}>`;
  lines.forEach((l, i) => {
    s += `<tspan x="${n(it.x)}" dy="${i === 0 ? 0 : n(size * 1.25)}">${esc(l) || " "}</tspan>`;
  });
  return s + "</text>";
}

// The box round a group note's items (boxes), and which side of it the note's bracket goes on: the side
// the note is furthest out past, "top" or "bottom" for a note over or under them, "left" or "right" beside.
function groupBox(boxes) {
  const x = Math.min(...boxes.map((b) => b.x)), y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
}
function bracketSide(note, g) {
  const nb = itemBox(note), cx = nb.x + nb.w / 2, cy = nb.y + nb.h / 2;
  const outX = cx < g.x ? g.x - cx : Math.max(0, cx - g.x - g.w), outY = cy < g.y ? g.y - cy : Math.max(0, cy - g.y - g.h);
  if (outY >= outX) return cy < g.y + g.h / 2 ? "top" : "bottom";
  return cx < g.x + g.w / 2 ? "left" : "right";
}

// A group note's bracket: a line along that side of its items, the gap (it.gap, mm) out from them, with a
// tick at each end towards the items and a leader from its middle to the note.
function renderNoteBracket(it, boxes, attrs) {
  if (!boxes.length) return "";
  const { x: gx, y: gy, w: gw, h: gh } = groupBox(boxes), side = bracketSide(it, { x: gx, y: gy, w: gw, h: gh });
  const nb = itemBox(it);
  const gap = it.gap === undefined ? 4 : +it.gap, tick = 2;
  let d, tip, bar;
  if (side === "top" || side === "bottom") {
    const s = side === "top" ? -1 : 1, y = s < 0 ? gy - gap : gy + gh + gap, mx = gx + gw / 2;
    tip = { x: mx, y: y + s * tick };
    bar = `M${n(gx)} ${n(y)}L${n(gx + gw)} ${n(y)}`;
    d = `M${n(gx)} ${n(y - s * tick)}L${n(gx)} ${n(y)}L${n(gx + gw)} ${n(y)}L${n(gx + gw)} ${n(y - s * tick)}M${n(mx)} ${n(y)}L${n(tip.x)} ${n(tip.y)}`;
  } else {
    const s = side === "left" ? -1 : 1, x = s < 0 ? gx - gap : gx + gw + gap, my = gy + gh / 2;
    tip = { x: x + s * tick, y: my };
    bar = `M${n(x)} ${n(gy)}L${n(x)} ${n(gy + gh)}`;
    d = `M${n(x - s * tick)} ${n(gy)}L${n(x)} ${n(gy)}L${n(x)} ${n(gy + gh)}L${n(x - s * tick)} ${n(gy + gh)}M${n(x)} ${n(my)}L${n(tip.x)} ${n(tip.y)}`;
  }
  // The leader runs to the nearest point of the note, unless the note covers the bracket's middle.
  const lx = Math.min(Math.max(tip.x, nb.x), nb.x + nb.w), ly = Math.min(Math.max(tip.y, nb.y), nb.y + nb.h);
  if (lx !== tip.x || ly !== tip.y) d += `L${n(lx)} ${n(ly)}`;
  // On screen, a wider invisible strip along the bar to drag it in or out (it sets it.gap).
  const grab = attrs ? `<path d="${bar}" class="bracket-bar ${side === "top" || side === "bottom" ? "ns" : "ew"}" data-bracket="${esc(it.id)}" fill="none" stroke="transparent" stroke-width="2.5"/>` : "";
  return `<path ${attrs} d="${d}" fill="none" stroke="${esc(it.color || "#1d2126")}" stroke-width="0.3" stroke-linecap="round" stroke-linejoin="round"/>${grab}`;
}

function renderPartBody(doc, it, tpl, attrs) {
  const box = itemBox(it, tpl);
  const st = doc.settings;
  const fill = it.color || tpl.fill || "#e6e8eb";
  const ink = inkFor(fill);
  let s = `<g ${attrs}>`;
  s += `<g transform="translate(${n(it.x)} ${n(it.y)})${rotTransform(tpl, it.rot)}">`;
  s += `<rect width="${n(tpl.w)}" height="${n(tpl.h)}" rx="${n(tpl.radius || 0)}" fill="${esc(fill)}" stroke="${darken(fill, 0.55)}" stroke-width="0.35"/>`;
  s += "</g>";

  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const tag = shownTag(doc, it);
  const sub = it.desc || (tpl.showName ? tpl.name : "");
  const vertical = box.w < 14 && box.h > box.w * 2;
  const tf = `font-family="${FONT}" fill="${ink}" text-anchor="middle" dominant-baseline="central" pointer-events="none"`;
  if (vertical) {
    if (tag) {
      // Put the tag in the longest stretch free of terminals and bus bar slots, e.g. between a
      // terminal block's top screw and its slots.
      const clearOf = (t) => isSlot(t) ? slotSize(tpl) / 2 + 0.5 : isPort(t) ? portSize(tpl) / 2 + 2.6 : termRadius(tpl) + 0.5 + (st.showTermNames && t.name ? 2.2 : 0);
      const spans = tpl.terminals.map((t) => { const y = termWorld(it, tpl, t).y, c = clearOf(t); return [y - c, y + c]; }).sort((a, b) => a[0] - b[0]);
      let gap = { a: box.y, b: box.y + box.h };
      if (spans.length) {
        const stops = [[box.y, box.y], ...spans, [box.y + box.h, box.y + box.h]];
        gap = { a: 0, b: 0 };
        let end = stops[0][1];
        for (let i = 1; i < stops.length; i++) {
          if (stops[i][0] - end > gap.b - gap.a + 0.01) gap = { a: end, b: stops[i][0] };
          end = Math.max(end, stops[i][1]);
        }
        if (gap.b - gap.a < Math.min(box.h * 0.25, 5)) gap = { a: box.y, b: box.y + box.h };
      }
      const ty = (gap.a + gap.b) / 2;
      const size = fitText(tag, Math.min(st.tagSize, box.w * 0.62), Math.min(box.h * 0.6, (gap.b - gap.a) * 0.95));
      s += `<text x="${n(cx)}" y="${n(ty)}" font-size="${n(size)}" font-weight="bold" transform="rotate(-90 ${n(cx)} ${n(ty)})" ${tf}>${esc(tag)}</text>`;
    }
  } else {
    const tagSize = tag ? fitText(tag, Math.min(st.tagSize, box.h * 0.3), box.w * 0.9) : 0;
    let subSize = sub ? fitText(sub, Math.min(st.tagSize * 0.7, box.h * 0.2), box.w * 0.9) : 0;
    const height = () => tagSize + subSize + (tagSize && subSize ? 0.6 : 0);
    let ty = cy - height() / 2;
    // If terminals under the text (with their names) would cover it, move it into the tallest free band
    // between them, e.g. below the pin row of a small connector. If only the tag fits, the type name is left off.
    const textW = Math.max(tag.length * tagSize, String(sub || "").length * subSize) * 0.6;
    const r = termRadius(tpl), inside = denseTerms(tpl);
    const spans = tpl.terminals.map((t) => {
      const p = termWorld(it, tpl, t);
      const c = isSlot(t) ? slotSize(tpl) / 2 + 0.5 : isPort(t) ? portSize(tpl) / 2 + 2.6 : r + 0.5 + (st.showTermNames && t.name && !inside && (p.side === "top" || p.side === "bottom") ? 2.2 : 0);
      return Math.abs(p.x - cx) < textW / 2 + c ? [p.y - c, p.y + c] : null;
    }).filter(Boolean).sort((a, b) => a[0] - b[0]);
    if (height() && spans.some(([a, b]) => a < ty + height() && b > ty)) {
      const bands = [];
      let end = box.y;
      for (const [a, b] of [...spans, [box.y + box.h, box.y + box.h]]) {
        if (a > end) bands.push({ a: end, b: a });
        end = Math.max(end, b);
      }
      const tallest = bands.sort((p, q) => (q.b - q.a) - (p.b - p.a))[0];
      if (tallest && tallest.b - tallest.a < height() + 0.4 && tagSize && tallest.b - tallest.a >= tagSize + 0.4) subSize = 0;
      if (tallest && tallest.b - tallest.a >= height() + 0.4) ty = (tallest.a + tallest.b) / 2 - height() / 2;
    }
    if (tagSize) {
      s += `<text x="${n(cx)}" y="${n(ty + tagSize / 2)}" font-size="${n(tagSize)}" font-weight="bold" ${tf}>${esc(tag)}</text>`;
      ty += tagSize + (subSize ? 0.6 : 0);
    }
    if (subSize) s += `<text x="${n(cx)}" y="${n(ty + subSize / 2)}" font-size="${n(subSize)}" ${tf}>${esc(sub)}</text>`;
  }
  return s + "</g>";
}

// Cables whose wires still exist, each with only its valid wires. An end plugged into a cable connector
// (portA / portB) is unplugged if the connector is gone (checked when items and tpls are given), and so are
// the more connectors an end can have (plugsA / plugsB). A plugged end with no cores is always end A, an
// end with more connectors has a main one (portA / portB) unless its cores land there, and a cable with
// neither cores nor a plug is dropped. A bundle left with no core connected at both ends is one-ended now.
function validCables(doc, conns, items, tpls) {
  const ok = new Set(conns.map((c) => c.id)), byId = new Map(conns.map((c) => [c.id, c]));
  const plug = (e) => {
    if (!e) return null;
    if (!items) return e;
    const it = items.get(e.item);
    const tpl = it && tpls.get(it.tpl);
    return tpl && tpl.terminals.some((t) => t.id === e.term && isPort(t)) ? e : null;
  };
  return (doc.cables || []).map((cb) => {
    const x = { ...cb, wires: cb.wires.filter((id) => ok.has(id)), portA: plug(cb.portA), portB: plug(cb.portB),
      plugsA: (cb.plugsA || []).map(plug).filter(Boolean), plugsB: (cb.plugsB || []).map(plug).filter(Boolean) };
    if (x.open && !x.wires.length && !x.portA && x.plugsA.length) x.portA = x.plugsA.shift();
    if (x.open && !x.portB && x.plugsB.length) x.portB = x.plugsB.shift();
    if (!x.wires.length && !x.portA && x.portB) { Object.assign(x, { portA: x.portB, portB: null, plugsA: x.plugsB, plugsB: [] }); }
    if (!x.open && x.wires.length && x.wires.every((id) => byId.get(id).a.item === cb.id || byId.get(id).b.item === cb.id)) {
      Object.assign(x, { open: true, portA: null, portB: null, pb: null, to: "" });
    }
    return x;
  }).filter((cb) => cb.wires.length || cb.portA);
}

// Where a cable runs: its wires sorted into the two ends (A and B), the centre of each end's terminals,
// and the two breakout points where the sheath ends and the cores fan out. Breakout points are the
// cable's own pa / pb when set, otherwise a little way from each end's terminals towards the other end.
// pos(end) gives a wire end's { x, y, side }; clear is how far the wire labels stick out from the
// terminals, so the sheath starts beyond them.
// near keeps automatic breakout points close to their ends however far apart the ends are (for a cable
// drawn broken), rather than up to 40% of the way along.
// A one-ended cable (open) has its cores on terminals at end A only. Its end B is free (free: true, with a
// tail), or plugged into a cable connector (plugB). A cable with no cores is plugged in at end A (plugA)
// and runs to another connector or to a free end.
// An end with more connectors (cb.plugsA / plugsB), besides its cores or main connector, branches: the
// sheath ends at the end's fan-out point, and a branch runs from there to each of its connectors
// (branchA / branchB, connector exits; plugA / plugB are then null, as no connector ends the sheath).
function cableGeometry(cb, connById, pos, clear = 0, near = false) {
  const g = cableShape(cb, connById, pos, clear, near);
  if (!g) return g;
  const exitOf = (e) => { const p = e && pos(e); return p && p.tpl ? portExit(p) : null; };
  const extra = { A: (cb.plugsA || []).map(exitOf).filter(Boolean), B: (cb.plugsB || []).map(exitOf).filter(Boolean) };
  g.branchA = [];
  g.branchB = [];
  if (!extra.A.length && !extra.B.length) return g;
  const mid = (pts) => ({ x: pts.reduce((t, p) => t + p.x, 0) / pts.length, y: pts.reduce((t, p) => t + p.y, 0) / pts.length });
  for (const [E, e] of [["A", "a"], ["B", "b"]]) {
    if (!extra[E].length) continue;
    const main = g["plug" + E];
    const branches = [...(main ? [main] : []), ...extra[E]];
    const pts = [...branches, ...g.cores.map((k) => k["e" + e]).filter(Boolean)];
    const c = mid(pts), to = E === "A" ? g.cB : g.cA;
    const dist = Math.hypot(to.x - c.x, to.y - c.y);
    const spread = Math.max(...pts.map((p) => Math.hypot(p.x - c.x, p.y - c.y)));
    const reach = Math.max(8, spread * 0.8 + 6, clear + 3);
    const off = near ? reach : Math.min(reach, dist * 0.4);
    const own = E === "A" ? cb.pa : cb.pb;
    g["c" + E] = c;
    g["b" + E] = own || (dist < 0.01 ? { x: c.x, y: c.y + 10 } : { x: c.x + ((to.x - c.x) / dist) * off, y: c.y + ((to.y - c.y) / dist) * off });
    g["plug" + E] = null;
    g["branch" + E] = branches;
  }
  return g;
}

function cableShape(cb, connById, pos, clear, near) {
  const ws = cb.wires.map((id) => connById.get(id)).filter(Boolean);
  const exitOf = (e) => { const p = e && pos(e); return p && p.tpl ? portExit(p) : null; };
  const plugB = cb.open ? exitOf(cb.portB) : null;
  if (cb.open && !ws.length) {
    const plugA = exitOf(cb.portA);
    if (!plugA) return null;
    const tail = plugB || cb.pb || { x: plugA.x + plugA.v[0] * 30, y: plugA.y + plugA.v[1] * 30 };
    return { cores: [], cA: plugA, cB: tail, bA: plugA, bB: tail, open: true, free: !plugB, plugA, plugB };
  }
  if (!ws.length) return null;
  if (cb.open) {
    // One-ended: the cores fan out to their terminals, and the sheath runs off to a free end (the tail) or a connector.
    const cores = ws.map((c) => ({ c, ea: pos(c.a.item === cb.id ? c.b : c.a), eb: null })).filter((k) => k.ea);
    if (!cores.length) return null;
    const cA = { x: cores.reduce((t, k) => t + k.ea.x, 0) / cores.length, y: cores.reduce((t, k) => t + k.ea.y, 0) / cores.length };
    // By default the cable leaves the way the terminals face.
    let vx = 0, vy = 0;
    for (const k of cores) { const v = SIDE_VEC[k.ea.side] || [0, 0]; vx += v[0]; vy += v[1]; }
    const vl = Math.hypot(vx, vy);
    const dir = vl > 0.01 ? [vx / vl, vy / vl] : [0, 1];
    const spread = Math.max(...cores.map((k) => Math.hypot(k.ea.x - cA.x, k.ea.y - cA.y)));
    const reach = Math.max(8, spread * 0.8 + 6, clear + 3);
    const tail = plugB || cb.pb || { x: cA.x + dir[0] * (reach + 30), y: cA.y + dir[1] * (reach + 30) };
    const dl = Math.hypot(tail.x - cA.x, tail.y - cA.y) || 1;
    const off = Math.min(reach, dl * 0.5);
    const bA = cb.pa || { x: cA.x + ((tail.x - cA.x) / dl) * off, y: cA.y + ((tail.y - cA.y) / dl) * off };
    return { cores, cA, cB: tail, bA, bB: tail, open: true, free: !plugB, plugB };
  }
  // A bundled core that isn't connected at one end (its end there is on the cable itself, not a terminal)
  // has only its other end drawn, at whichever end of the cable that terminal is nearer: it's null at the
  // end it isn't connected at.
  const through = (c) => c.a.item !== cb.id && c.b.item !== cb.id;
  const first = ws.find(through);
  if (!first) return null;
  const d2 = (p, q) => (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
  let A = pos(first.a), B = pos(first.b);
  // End A is where the first wire's end a is, so it stays put when that wire's other end is unhooked.
  const lead = ws[0];
  if (lead !== first) {
    const liveA = lead.a.item !== cb.id, p = pos(liveA ? lead.a : lead.b);
    if ((d2(p, A) <= d2(p, B)) !== liveA) [A, B] = [B, A];
  }
  const mid = (pts) => ({ x: pts.reduce((t, p) => t + p.x, 0) / pts.length, y: pts.reduce((t, p) => t + p.y, 0) / pts.length });
  const full = new Map(ws.filter(through).map((c) => {
    const pa = pos(c.a), pb = pos(c.b);
    return [c, d2(pa, A) + d2(pb, B) <= d2(pa, B) + d2(pb, A) ? { c, ea: pa, eb: pb } : { c, ea: pb, eb: pa }];
  }));
  const tA = mid([...full.values()].map((k) => k.ea)), tB = mid([...full.values()].map((k) => k.eb));
  const cores = ws.map((c) => {
    if (full.has(c)) return full.get(c);
    const p = pos(c.a.item === cb.id ? c.b : c.a);
    return d2(p, tA) <= d2(p, tB) ? { c, ea: p, eb: null } : { c, ea: null, eb: p };
  });
  const atA = cores.map((k) => k.ea).filter(Boolean), atB = cores.map((k) => k.eb).filter(Boolean);
  const cA = mid(atA), cB = mid(atB);
  const dist = Math.sqrt(d2(cA, cB));
  const auto = (from, to, ends) => {
    if (dist < 0.01) return { x: from.x, y: from.y + 10 };
    const spread = Math.max(...ends.map((p) => Math.sqrt(d2(p, from))));
    const reach = Math.max(8, spread * 0.8 + 6, clear + 3);
    const off = near ? reach : Math.min(reach, dist * 0.4);
    return { x: from.x + ((to.x - from.x) / dist) * off, y: from.y + ((to.y - from.y) / dist) * off };
  };
  const bA = cb.pa || auto(cA, cB, atA);
  const bB = cb.pb || auto(cB, cA, atB);
  return { cores, cA, cB, bA, bB };
}

// Path of one core from its terminal to the breakout point: leaves the terminal along its label side and
// arrives in line with the sheath, so the cores sweep together into the cable.
function corePath(t, b, other) {
  const v = SIDE_VEC[t.side] || [0, 0];
  const dl = Math.hypot(other.x - b.x, other.y - b.y) || 1;
  const u = [(other.x - b.x) / dl, (other.y - b.y) / dl];
  const span = Math.hypot(b.x - t.x, b.y - t.y);
  const k1 = Math.min(6, span * 0.4), k2 = Math.min(10, span * 0.5);
  return `M${n(t.x)} ${n(t.y)} C${n(t.x + v[0] * k1)} ${n(t.y + v[1] * k1)} ${n(b.x - u[0] * k2)} ${n(b.y - u[1] * k2)} ${n(b.x)} ${n(b.y)}`;
}

/**
 * Render the diagram contents as an SVG fragment.
 * opt: { interactive, sel: Set of ids, pending: {item, term} | null, page: page id }
 */
function renderDiagram(doc, opt = {}) {
  const st = doc.settings;
  const tpls = tplMap(doc);
  const items = itemMap(doc);
  const sel = opt.sel || new Set();
  // opt.page: only that page's items are drawn. A wire or cable with one end on another page is drawn
  // broken at this end, labelled with the page the other end is on unless labelPage is off.
  const here = (it) => !opt.page || pageOf(doc, it) === opt.page;
  const ctx = opt.page; // labels leave out the function and location they share with this page
  const onOther = (e) => { const it = items.get(e.item); return !!it && !here(it); };
  const pageOn = st.labelPage !== false;
  const pageNote = (e) => (pageOn && onOther(e) ? ` (${pageName(doc, pageOf(doc, items.get(e.item)))})` : "");
  // A wire end on a cable rather than a terminal goes with the wire's other end.
  const endHere = (e) => { const it = items.get(e.item); return !!it && here(it); };
  // opt.hideWires: ids of wires left off the drawing ("Show only these wires"), as if they didn't exist.
  const allConns = validConnections(doc, items, tpls).filter((c) => !opt.hideWires || !opt.hideWires.has(c.id));
  const conns = allConns.filter((c) => endHere(c.a) || endHere(c.b));
  const bothHere = (c) => !onOther(c.a) && !onOther(c.b);
  const ia = !!opt.interactive;
  // Wires are drawn as a stub at each terminal ("off"), or as "straight" or "curved" lines between terminals.
  // Labels say where each wire goes, at its terminals; wire names put its number in a stub's label, or at
  // the middle of its line.
  const showLines = st.lines === "straight" || st.lines === "curved";
  const destOn = st.wireLabels !== false;
  // A named circuit's wires can be labelled with the circuit's name instead of where they go: all of them
  // with labelName "circuit", and each circuit can override that (doc.circuitLabels, by circuit name:
  // "name" always, "dest" never), and each wire can override its circuit (c.labelShow, the same values).
  // Otherwise labels say where the wire goes, led by the wire's number if labelWire is on.
  const overrides = doc.circuitLabels || {};
  const circNames = st.labelName === "circuit" || Object.keys(overrides).length || conns.some((c) => c.labelShow) ? circuitNames(doc).conn : null;
  const circuitLabel = (c) => {
    const cn = circNames && circNames.get(c.id);
    if (!cn) return "";
    const o = c.labelShow || overrides[netKey(cn)];
    return o === "name" || (o !== "dest" && st.labelName === "circuit") ? cn : "";
  };
  const nameOf = (c) => (st.labelWire ? c.wire || "" : "");

  // Mouse-over text (interactive only). A wire's: its name and cable, where it runs, with each end's page
  // when the diagram has more than one, its circuit's name, its look and its notes.
  const multiPage = (doc.pages || []).length > 1;
  const allCircs = ia ? circuitNames(doc).conn : null;
  const profNames = new Map((doc.wireProfiles || []).map((p) => [p.id, p.name]));
  const pagesIn = (its) => (multiPage ? [...new Set(its.filter(Boolean).map((it) => pageName(doc, pageOf(doc, it))))].join(", ") : "");
  const endTip = (e) => { const pg = pagesIn([items.get(e.item)]); return endLabel(doc, items, tpls, e, st.termSep) + (pg ? ` (${pg})` : ""); };
  const tipEl = (s) => (ia && s ? `<title>${esc(s)}</title>` : "");
  const wireTip = (c) => {
    if (!ia) return "";
    const cb = cables.find((k) => k.wires.includes(c.id));
    const cn = allCircs.get(c.id);
    const prof = profNames.get(c.profile);
    return [
      [c.wire || "Wire", cb && ("in cable " + (cb.label || "")).trim()].filter(Boolean).join(" · "),
      `${endTip(c.a)} → ${endTip(c.b)}`,
      cn && "Circuit: " + cn,
      [c.mark, wireLookName(c.color, c.stripe), c.gauge, c.conductor, prof && "profile " + prof].filter(Boolean).join(" · "),
      c.notes && "Notes: " + c.notes,
    ].filter(Boolean).join("\n");
  };

  // Back plates under everything, then rails and ducts, then parts.
  const plates = [], rails = [], bodies = [], texts = [];
  for (const it of doc.items) {
    if (!here(it)) continue;
    const a = ia ? `data-item="${esc(it.id)}" class="item"` : "";
    if (it.kind === "plate") plates.push(renderPlate(it, a));
    else if (it.kind === "rail") rails.push(renderRail(it, a));
    else if (it.kind === "duct") rails.push(renderDuct(it, a, opt.ductFill && opt.ductFill.get(it.id)));
    else if (it.kind === "text") {
      // A group note's items on its page; ones on other pages, or gone, are left out.
      const linked = (it.links || []).map((id) => items.get(id)).filter((x) => x && x.kind !== "text" && pageOf(doc, x) === pageOf(doc, it));
      texts.push(renderNoteBracket(it, linked.map((x) => itemBox(x, tpls.get(x.tpl))), a) + renderText(it, a));
    }
    else if (tpls.has(it.tpl)) bodies.push(renderPartBody(doc, it, tpls.get(it.tpl), a));
  }

  // Terminal positions and the connections at each. Terminals on other pages are kept (here: false), in
  // their own page's coordinates, for working out where wires and cables go.
  const termPos = new Map();   // "item|term" -> {x, y, side, box, tpl, it, t, here}
  for (const it of doc.items) {
    if (it.kind !== "part") continue;
    const tpl = tpls.get(it.tpl);
    if (!tpl) continue;
    const box = itemBox(it, tpl), on = here(it);
    for (const t of tpl.terminals) termPos.set(it.id + "|" + t.id, { ...termWorld(it, tpl, t), box, tpl, it, t, here: on });
  }
  const atTerm = new Map();
  for (const c of conns) {
    for (const [end, there] of [[c.a, c.b], [c.b, c.a]]) {
      const k = end.item + "|" + end.term;
      if (!atTerm.has(k)) atTerm.set(k, []);
      atTerm.get(k).push({ c, ref: endLabel(doc, items, tpls, there, st.termSep, ctx) + pageNote(there), other: there.item + "|" + there.term });
    }
  }

  // With wires or bus bars selected, the rest of their circuit gets a lighter highlight.
  const buses = validBuses(doc, items, tpls);
  const seeds = ia ? [...conns, ...buses].filter((x) => sel.has(x.id)).map((x) => x.id) : [];
  const circ = seeds.length ? circuitOf(doc, seeds) : { conns: new Set(), buses: new Set(), terms: new Set() };
  const inCirc = (id) => (circ.conns.has(id) || circ.buses.has(id)) && !sel.has(id);
  const glow = (d, strong) => `<path d="${d}" fill="none" stroke="#3b82f6" stroke-opacity="${strong ? 0.4 : 0.2}" stroke-width="${strong ? 2.2 : 1.8}" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"/>`;

  // Bus bars: a thick bar through the bridged terminals, drawn under the terminal screws.
  const busPathD = (keys) => "M" + busOrder(keys.map((k) => termPos.get(k))).map((p) => `${n(p.x)} ${n(p.y)}`).join(" L");
  let busLayer = "";
  for (const b of buses) {
    // Only the terminals on this page, should a bar's parts have been split between pages.
    const bt = b.terms.filter(endHere);
    if (bt.length < 2) continue;
    const d = busPathD(bt.map((e) => e.item + "|" + e.term));
    if (sel.has(b.id) || inCirc(b.id)) busLayer += glow(d, sel.has(b.id)).replace(/stroke-width="[\d.]+"/, `stroke-width="${sel.has(b.id) ? 3 : 2.6}"`);
    busLayer += wirePath(d, b.color || "#b87333", 1.1, 'stroke-linejoin="round"');
    // A contact where the bar sits in a slot, so a bar passing over a block it skips reads as not connected.
    for (const e of bt) {
      const p = termPos.get(e.item + "|" + e.term);
      if (isSlot(p.t)) busLayer += `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(slotSize(p.tpl) * 0.36)}" fill="${b.color === "gy" ? "#2e9b3c" : esc(b.color || "#b87333")}" stroke="#fbfbfb" stroke-width="0.3" pointer-events="none"/>`;
    }
    if (ia) busLayer += `<path d="${d}" class="hit" data-bus="${esc(b.id)}" fill="none" stroke="transparent" stroke-width="2.4"/>`;
  }
  const be = ia && opt.busEdit;
  if (be && be.terms.length) {
    const keys = be.terms.filter((k) => termPos.get(k)?.here);
    if (keys.length > 1) busLayer += `<path d="${busPathD(keys)}" fill="none" stroke="#f59e0b" stroke-width="1.1" stroke-dasharray="1.6 1" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"/>`;
  }

  // Cables: each core sweeps from its terminal into a breakout point, and a sheath joins the two
  // breakout points. Drawn whenever wires are, with lines or labels, since the grouping is the point.
  const cables = validCables(doc, allConns, items, tpls);
  const bundled = new Set(cables.flatMap((cb) => cb.wires));
  // Each wire is a line to its other end, or broken into a stub and label at each terminal: as the drawing's
  // wire style says, unless the wire says otherwise: c.draw "straight" or "curved" (a line of that shape),
  // "line" (a line shaped as the drawing's lines are, straight unless they're curved) or "break". Cable cores
  // follow the drawing. A wire to another page is always broken.
  const isLine = (c) => bothHere(c) && (!bundled.has(c.id) && c.draw ? c.draw !== "break" : showLines);
  const isCurved = (c) => (c.draw === "curved" ? true : c.draw === "straight" ? false : st.lines === "curved");
  const showLabels = destOn || conns.some((c) => !isLine(c)); // terminals get lanes for stubs and/or labels
  const connMap = new Map(allConns.map((c) => [c.id, c]));
  let cableLayer = "", cableTop = "";
  for (const cb of cables) {
    // The terminals and connectors the cable is on, and whether any are on this page or another.
    const ends = [cb.portA, cb.portB, ...cb.plugsA, ...cb.plugsB, ...cb.wires.flatMap((id) => [connMap.get(id).a, connMap.get(id).b])]
      .map((e) => e && termPos.get(e.item + "|" + e.term)).filter(Boolean);
    const near = ends.filter((p) => p.here);
    if (!near.length) continue;
    // With its other end on another page, the cable is broken here, its tail running the way this end's
    // terminals face: the other page's terminals are put out that way for working out the cable's shape.
    const split = near.length < ends.length;
    let far = null;
    if (split) {
      const c = { x: near.reduce((t, p) => t + p.x, 0) / near.length, y: near.reduce((t, p) => t + p.y, 0) / near.length };
      let vx = 0, vy = 0;
      for (const p of near) { const v = SIDE_VEC[p.side] || [0, 0]; vx += v[0]; vy += v[1]; }
      const vl = Math.hypot(vx, vy);
      const dir = vl > 0.01 ? [vx / vl, vy / vl] : [0, 1];
      far = { x: c.x + dir[0] * 200, y: c.y + dir[1] * 200 };
    }
    // Roughly how far the longest wire label of the cable reaches out from its terminal.
    const clear = showLabels ? Math.max(0, ...cb.wires.map((id) => {
      const c = connMap.get(id);
      return c ? (String(c.wire || "").length + 3 + endLabel(doc, items, tpls, c.b, st.termSep, ctx).length) * st.labelSize * 0.6 + 4 : 0;
    })) : 0;
    // A broken cable (cb.draw, else the drawing's cables setting) is just a short tail of sheath at each
    // end, ending in a break bar and the cable's label with where its other end goes ("C1 → K1"). It's
    // drawn whole when there isn't room between its ends for both tails and labels, and when it's
    // one-ended and runs to a free end.
    const TAIL = 12, fs = Math.min(st.labelSize * 1.1, 3);
    const pos = (e) => { const p = termPos.get(e.item + "|" + e.term); return p && !p.here ? { ...p, ...far } : p; };
    const want = split || (cb.draw || st.cables) === "break";
    let g = cableGeometry(cb, connMap, pos, clear, want);
    if (!g) continue;
    // Which of the cable's ends are on this page (a free end goes with end A).
    const atA = [g.plugA?.at, ...g.branchA.map((p) => p.at), ...g.cores.map((k) => k.ea)], atB = [g.plugB?.at, ...g.branchB.map((p) => p.at), ...g.cores.map((k) => k.eb)];
    const hereA = atA.some((p) => p?.here), hereB = g.free ? hereA : atB.some((p) => p?.here);
    const tagsOf = (ps) => [...new Set(ps.filter((p) => p && p.it).map((p) => partRef(doc, p.it, p.tpl, ctx)))].join(", ");
    const plugName = (pl) => (pl ? endRef(pl.at.it, pl.at.tpl, pl.at.t.id, st.termSep, partRef(doc, pl.at.it, pl.at.tpl, ctx)) : "");
    // An end's connectors and the parts its cores land on: "M1-X1" or "X1-P1, X2-P1, TB3".
    const endName = (plugs, cores) => [...new Set([...plugs.filter(Boolean).map(plugName), tagsOf(cores)])].filter(Boolean).join(", ");
    const namesA = endName([g.plugA, ...g.branchA], g.cores.map((k) => k.ea)), namesB = endName([g.plugB, ...g.branchB], g.cores.map((k) => k.eb));
    const pageAt = (ps) => { const p = pageOn && ps.find((q) => q && q.it && !q.here); return p ? ` (${pageName(doc, pageOf(doc, p.it))})` : ""; };
    // A cable's mouse-over text: its name, profile and type, where each end goes (and on which page), its
    // cores and its notes.
    const endWhere = (pl, ps, free) => {
      const pg = pagesIn(ps.map((p) => p && p.it));
      return (free ? cb.to || "free end" : pl || "?") + (pg ? ` (${pg})` : "");
    };
    const cprof = (doc.cableProfiles || []).find((p) => p.id === cb.profile)?.name;
    const cableTip = ia ? [
      [cb.label || "Cable", cprof && "profile " + cprof, cb.desc, cb.shield && "shielded"].filter(Boolean).join(" · "),
      `${endWhere(namesA, atA)} → ${endWhere(namesB, atB, g.free)}`,
      g.cores.length ? g.cores.length + (g.cores.length === 1 ? " core" : " cores") : "",
      cb.notes && "Notes: " + cb.notes,
    ].filter(Boolean).join("\n") : "";
    // With cable names off (labelCable), just where it goes: "K1".
    const goes = (name) => (st.labelCable ? `${cb.label || "Cable"} → ${name || "?"}` : name || "?");
    // [where the tail starts, its plug if any, the other end, its label, which end]
    const tails = want && !g.free ? [
      [g.bA, g.plugA, g.bB, goes(namesB) + pageAt(atB), 0],
      [g.bB, g.plugB, g.bA, goes(namesA) + pageAt(atA), 1],
    ] : [];
    const gap = (g.bB.x - g.bA.x) * (g.cB.x - g.cA.x) + (g.bB.y - g.bA.y) * (g.cB.y - g.cA.y) > 0 ? Math.hypot(g.bB.x - g.bA.x, g.bB.y - g.bA.y) : 0;
    // A tail whose end has been dragged (cb.ta / cb.tb) keeps the cable broken, room or not, and so does
    // having its other end on another page.
    const broken = tails.length > 0 && (split || !!(cb.ta || cb.tb) || gap > tails.reduce((t, x) => t + TAIL + x[3].length * fs * 0.6 + 4, 0));
    if (want && !broken) g = cableGeometry(cb, connMap, pos, clear);
    const on = sel.has(cb.id);
    for (const k of g.cores) {
      const c = k.c;
      for (const [t, b, other] of g.open ? [[k.ea, g.bA, g.bB]] : [[k.ea, g.bA, g.bB], [k.eb, g.bB, g.bA]]) {
        if (!t || !t.here) continue; // not connected at this end, or it's on another page
        const d = corePath(t, b, other);
        if (sel.has(c.id) || inCirc(c.id) || on) cableLayer += glow(d, sel.has(c.id) || on);
        cableLayer += wirePath(d, c.color, 0.5, 'stroke-linejoin="round"', c.stripe);
        if (ia) cableLayer += `<path d="${d}" class="hit" data-conn="${esc(c.id)}" fill="none" stroke="transparent" stroke-width="2.4">${tipEl(wireTip(c))}</path>`;
      }
    }
    const w = Math.max(1.6, 0.9 + 0.35 * g.cores.length);
    const sheath = cb.color || "#3a3f45";
    // A cable plugged into a connector leaves it straight out, then curves round to its other end.
    const span = Math.hypot(g.bB.x - g.bA.x, g.bB.y - g.bA.y), bend = Math.max(6, Math.min(40, span * 0.4));
    const c1 = g.plugA ? { x: g.bA.x + g.plugA.v[0] * bend, y: g.bA.y + g.plugA.v[1] * bend } : g.bA;
    const c2 = g.plugB ? { x: g.bB.x + g.plugB.v[0] * bend, y: g.bB.y + g.plugB.v[1] * bend } : g.bB;
    const curved = !!(g.plugA || g.plugB);
    const td = curved
      ? `M${n(g.bA.x)} ${n(g.bA.y)} C${n(c1.x)} ${n(c1.y)} ${n(c2.x)} ${n(c2.y)} ${n(g.bB.x)} ${n(g.bB.y)}`
      : `M${n(g.bA.x)} ${n(g.bA.y)} L${n(g.bB.x)} ${n(g.bB.y)}`;
    // The sheath's middle and its direction there, for the label.
    const mid = { x: (g.bA.x + 3 * c1.x + 3 * c2.x + g.bB.x) / 8, y: (g.bA.y + 3 * c1.y + 3 * c2.y + g.bB.y) / 8 };
    const dir = { x: g.bB.x + c2.x - c1.x - g.bA.x, y: g.bB.y + c2.y - c1.y - g.bA.y };
    // Text running on from a point p along direction u (a unit vector), past a gap of h, kept upright, with
    // a paper-coloured outline so it reads over wires.
    const endText = (p, u, h, txt) => {
      const half = txt.length * fs * 0.3;
      const tx = p.x + u[0] * (half + h + 0.8), ty = p.y + u[1] * (half + h + 0.8);
      let ang = (Math.atan2(u[1], u[0]) * 180) / Math.PI;
      if (ang > 90) ang -= 180; else if (ang <= -90) ang += 180;
      return `<text x="${n(tx)}" y="${n(ty)}" transform="rotate(${n(ang)} ${n(tx)} ${n(ty)})" font-family="${FONT}" font-size="${n(fs)}" text-anchor="middle" dominant-baseline="central" fill="${on ? "#1d5fd6" : "#1d2126"}" stroke="#ffffff" stroke-opacity="0.9" stroke-width="${n(fs * 0.22)}" stroke-linejoin="round" paint-order="stroke" pointer-events="none">${esc(txt)}</text>`;
    };
    // A short bar across the sheath at p, square to direction u: a free end, or a break.
    const crossBar = (p, u) => {
      const h = w / 2 + 1, q = [-u[1], u[0]];
      return `<path d="M${n(p.x + q[0] * h)} ${n(p.y + q[1] * h)} L${n(p.x - q[0] * h)} ${n(p.y - q[1] * h)}" stroke="${darken(sheath, 0.6)}" stroke-width="0.5" stroke-linecap="round" pointer-events="none"/>`;
    };
    let paths = [td], breaks = "";
    const tailEnds = [];
    if (broken) {
      paths = [];
      tails.forEach(([p, pl, other, txt, i]) => {
        if (!(i ? hereB : hereA)) return; // that end is on another page
        // Each tail runs TAIL mm towards the other end (or straight out of its plug), unless its end has
        // been dragged somewhere.
        const set = i ? cb.tb : cb.ta;
        const to = set || other, L = Math.hypot(to.x - p.x, to.y - p.y) || 1;
        const u = pl && !set ? pl.v : [(to.x - p.x) / L, (to.y - p.y) / L];
        const e = set ? { x: set.x, y: set.y } : { x: p.x + u[0] * TAIL, y: p.y + u[1] * TAIL };
        paths.push(`M${n(p.x)} ${n(p.y)} L${n(e.x)} ${n(e.y)}`);
        breaks += crossBar(e, u) + endText(e, u, w / 2 + 1, txt);
        tailEnds.push([e, i]);
      });
    }
    for (const d of paths) {
      if (on) cableTop += `<path d="${d}" fill="none" stroke="#3b82f6" stroke-opacity="0.4" stroke-width="${n(w + 1.6)}" stroke-linecap="round" pointer-events="none"/>`;
      // A shielded cable shows its braid as a dashed outline along the sheath.
      if (cb.shield) cableTop += `<path d="${d}" fill="none" stroke="#6b7280" stroke-width="${n(w + 1.5)}" stroke-dasharray="0.9 0.6" pointer-events="none"/>`;
    }
    // An end with more connectors branches at its fan-out point: a thinner length of sheath to each one,
    // leaving the connector straight out, then curving round to the fan-out point.
    const bw = Math.max(1.2, w * 0.75);
    for (const [br, b, on2] of [[g.branchA, g.bA, hereA], [g.branchB, g.bB, hereB]]) {
      for (const pl of on2 ? br : []) {
        if (!pl.at.here) continue;
        const span2 = Math.hypot(pl.x - b.x, pl.y - b.y), k = Math.max(3, Math.min(20, span2 * 0.5));
        const d = `M${n(b.x)} ${n(b.y)} C${n(b.x + (pl.x - b.x) * 0.3)} ${n(b.y + (pl.y - b.y) * 0.3)} ${n(pl.x + pl.v[0] * k)} ${n(pl.y + pl.v[1] * k)} ${n(pl.x)} ${n(pl.y)}`;
        if (on) cableTop += `<path d="${d}" fill="none" stroke="#3b82f6" stroke-opacity="0.4" stroke-width="${n(bw + 1.6)}" stroke-linecap="round" pointer-events="none"/>`;
        if (cb.shield) cableTop += `<path d="${d}" fill="none" stroke="#6b7280" stroke-width="${n(bw + 1.5)}" stroke-dasharray="0.9 0.6" pointer-events="none"/>`;
        cableTop += `<path d="${d}" fill="none" stroke="${darken(sheath, 0.6)}" stroke-width="${n(bw + 0.4)}" stroke-linecap="round"/>`;
        cableTop += `<path d="${d}" fill="none" stroke="${esc(sheath)}" stroke-width="${n(bw)}" stroke-linecap="round"/>`;
        if (ia) cableTop += `<path d="${d}" class="hit" data-cable="${esc(cb.id)}" fill="none" stroke="transparent" stroke-width="${n(bw + 2)}">${tipEl(cableTip)}</path>`;
      }
    }
    // A plug where an end goes into a cable connector, over the socket.
    for (const pl of [g.plugA, g.plugB, ...(hereA ? g.branchA : []), ...(hereB ? g.branchB : [])]) {
      if (!pl || !pl.at.here) continue;
      const a = portSize(pl.at.tpl);
      const back = { x: pl.at.x + pl.v[0] * a * 0.15, y: pl.at.y + pl.v[1] * a * 0.15 };
      cableTop += `<path d="M${n(back.x)} ${n(back.y)} L${n(pl.x)} ${n(pl.y)}" stroke="${darken(sheath, 0.55)}" stroke-width="${n(a * 0.62)}" stroke-linecap="butt" pointer-events="none"/>`;
      cableTop += `<path d="M${n(pl.x - pl.v[0] * 1.2)} ${n(pl.y - pl.v[1] * 1.2)} L${n(pl.x)} ${n(pl.y)}" stroke="${esc(sheath)}" stroke-width="${n(w + 0.6)}" stroke-linecap="butt" pointer-events="none"/>`;
    }
    for (const d of paths) {
      cableTop += `<path d="${d}" fill="none" stroke="${darken(sheath, 0.6)}" stroke-width="${n(w + 0.4)}" stroke-linecap="round"/>`;
      cableTop += `<path d="${d}" fill="none" stroke="${esc(sheath)}" stroke-width="${n(w)}" stroke-linecap="round"/>`;
    }
    cableTop += breaks;
    if (g.free) {
      // Free end: a short cross bar, then where it goes.
      const L = Math.hypot(g.bB.x - g.bA.x, g.bB.y - g.bA.y) || 1;
      const u = [(g.bB.x - g.bA.x) / L, (g.bB.y - g.bA.y) / L];
      cableTop += crossBar(g.bB, u);
      if (cb.to) cableTop += endText(g.bB, u, w / 2 + 1, (st.labelCable ? "→ " : "") + cb.to);
    }
    // Label along the sheath, kept upright (a broken cable has it at each break instead): its name if
    // cable names are on, and its type.
    const label = [st.labelCable && cb.label, cb.desc].filter(Boolean).join(" · ");
    if (label && span > 4 && !broken) {
      let ang = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
      if (ang > 90) ang -= 180; else if (ang <= -90) ang += 180;
      const mx = mid.x, my = mid.y;
      const nrm = [Math.sin((ang * Math.PI) / 180), -Math.cos((ang * Math.PI) / 180)];
      const off = w / 2 + fs * 0.75;
      const tx = mx + nrm[0] * off, ty = my + nrm[1] * off;
      cableTop += `<text x="${n(tx)}" y="${n(ty)}" transform="rotate(${n(ang)} ${n(tx)} ${n(ty)})" font-family="${FONT}" font-size="${n(fs)}" font-weight="bold" text-anchor="middle" dominant-baseline="central" fill="${on ? "#1d5fd6" : "#1d2126"}" pointer-events="none">${esc(label)}</text>`;
    }
    if (ia) {
      for (const d of paths) cableTop += `<path d="${d}" class="hit" data-cable="${esc(cb.id)}" fill="none" stroke="transparent" stroke-width="${n(w + 2)}">${tipEl(cableTip)}</path>`;
      if (on) {
        for (const [end, p] of [["a", g.bA], ["b", g.bB]]) {
          if ((end === "a" && g.plugA) || (end === "b" && g.plugB)) continue; // fixed at its connector
          if (!(end === "a" ? hereA : hereB)) continue; // on another page
          const tip = g.free && end === "b" ? "Drag to move the cable's free end" : "Drag to move where the cores fan out";
          cableTop += `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(w / 2 + 0.9)}" fill="#f59e0b" fill-opacity="0.35" stroke="#f59e0b" stroke-width="0.4" class="cable-handle" data-cable-handle="${esc(cb.id)}|${end}"><title>${tip}</title></circle>`;
        }
        // A broken cable's tails each have a second dot, where the tail stops.
        tailEnds.forEach(([p, i]) => {
          cableTop += `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(w / 2 + 0.9)}" fill="#f59e0b" fill-opacity="0.35" stroke="#f59e0b" stroke-width="0.4" class="cable-handle" data-cable-handle="${esc(cb.id)}|t${i ? "b" : "a"}"><title>Drag to move where this end's tail stops</title></circle>`;
        });
      }
    }
  }

  // Connection lines, each with its wire number at the middle.
  let lines = "", lineLabels = "";
  for (const c of conns) {
    if (bundled.has(c.id) || !isLine(c)) continue; // cable cores are drawn as part of their cable
    const p1 = termPos.get(c.a.item + "|" + c.a.term), p2 = termPos.get(c.b.item + "|" + c.b.term);
    let d, mid;
    if (isCurved(c)) {
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const k = Math.max(8, Math.min(80, dist * 0.45));
      const v1 = SIDE_VEC[p1.side], v2 = SIDE_VEC[p2.side];
      const c1 = { x: p1.x + v1[0] * k, y: p1.y + v1[1] * k }, c2 = { x: p2.x + v2[0] * k, y: p2.y + v2[1] * k };
      d = `M${n(p1.x)} ${n(p1.y)} C${n(c1.x)} ${n(c1.y)} ${n(c2.x)} ${n(c2.y)} ${n(p2.x)} ${n(p2.y)}`;
      mid = { x: (p1.x + 3 * c1.x + 3 * c2.x + p2.x) / 8, y: (p1.y + 3 * c1.y + 3 * c2.y + p2.y) / 8 }; // the curve at its halfway point
    } else {
      d = `M${n(p1.x)} ${n(p1.y)} L${n(p2.x)} ${n(p2.y)}`;
      mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    }
    if (sel.has(c.id) || inCirc(c.id)) lines += glow(d, sel.has(c.id));
    lines += wirePath(d, c.color, 0.55, 'opacity="0.92"', c.stripe);
    if (ia) lines += `<path d="${d}" class="hit" data-conn="${esc(c.id)}" fill="none" stroke="transparent" stroke-width="3">${tipEl(wireTip(c))}</path>`;
    const name = nameOf(c);
    if (name) {
      const hl = sel.has(c.id) ? ' fill="#1d5fd6" font-weight="bold"' : inCirc(c.id) ? ' fill="#4a86ec"' : ' fill="#1d2126"';
      lineLabels += `<text x="${n(mid.x)}" y="${n(mid.y)}" font-family="${FONT}" font-size="${n(st.labelSize)}" text-anchor="middle" dominant-baseline="central"${hl} stroke="#ffffff" stroke-opacity="0.9" stroke-width="${n(st.labelSize * 0.3)}" stroke-linejoin="round" paint-order="stroke"${ia ? ` data-conn="${esc(c.id)}" class="dest"` : ""}>${tipEl(wireTip(c))}${esc(name)}</text>`;
    }
  }

  // Stubs, destination labels, terminals.
  let stubs = "", labels = "", terms = "", rings = "", slots = "", sockets = "";
  const ls = st.labelSize;
  for (const [k, p] of termPos) {
    if (!p.here) continue;
    const r = termRadius(p.tpl);
    if (isPort(p.t)) {
      // Cable connectors take a cable's plug, not wires. The name goes on the side away from the cable.
      const a = portSize(p.tpl), h = a * 0.78;
      sockets += portGlyph(p.x, p.y, p.tpl, ' pointer-events="none"');
      if (ia) terms += `<g class="term port" data-term="${esc(k)}"><rect x="${n(p.x - a / 2 - 0.4)}" y="${n(p.y - h / 2 - 0.4)}" width="${n(a + 0.8)}" height="${n(h + 0.8)}" fill="transparent" class="term-hit"/></g>`;
      if (st.showTermNames && p.t.name) {
        const v = SIDE_VEC[p.side] || [0, 1], fs = Math.min(1.8, ls);
        const reach = (Math.abs(v[0]) ? a / 2 : h / 2) + 0.5 + fs * 0.6;
        const tx = p.x - v[0] * reach, ty = p.y - v[1] * reach;
        const anchor = v[0] > 0 ? "end" : v[0] < 0 ? "start" : "middle";
        terms += `<text x="${n(tx)}" y="${n(ty)}" font-family="${FONT}" font-size="${n(fs)}" text-anchor="${anchor}" dominant-baseline="central" fill="${inkFor(p.it.color || p.tpl.fill)}" pointer-events="none">${esc(p.t.name)}</text>`;
      }
      continue;
    }
    if (isSlot(p.t)) {
      // Bus bar slots take bus bars only: no wires, and clickable only while picking for a bus bar.
      slots += slotRect(p.x, p.y, p.tpl, ' pointer-events="none"');
      if (be) terms += `<g class="term slot" data-term="${esc(k)}"><rect x="${n(p.x - slotSize(p.tpl) / 2 - 0.4)}" y="${n(p.y - slotSize(p.tpl) / 2 - 0.4)}" width="${n(slotSize(p.tpl) + 0.8)}" height="${n(slotSize(p.tpl) + 0.8)}" fill="transparent" class="term-hit"/></g>`;
      continue;
    }
    // A stub needs a lane even without labels, and so does a line labelled with its circuit's name.
    const list = (atTerm.get(k) || []).filter((e) => destOn || !isLine(e.c) || circuitLabel(e.c));
    const v = SIDE_VEC[p.side];
    if (list.length) {
      const edge = { top: p.y - p.box.y, bottom: p.box.y + p.box.h - p.y, left: p.x - p.box.x, right: p.box.x + p.box.w - p.x }[p.side];
      // Several wires on one terminal fan out into side-by-side lanes, each with its own stub and label.
      const perp = [Math.abs(v[1]), Math.abs(v[0])];
      const lane = ls * 1.25;
      // Lanes follow where each wire goes: leftmost destination in the leftmost lane (or topmost for side terminals).
      const axis = perp[0] ? "x" : "y";
      const dest = (e) => termPos.get(e.other)?.[axis] ?? 0;
      const sorted = list.slice().sort((a, b) => {
        const d = dest(a) - dest(b);
        return Math.abs(d) > 0.01 ? d : String(a.c.wire).localeCompare(String(b.c.wire), undefined, { numeric: true });
      });
      // Wires labelled with the same circuit name (e.g. a daisy chain) would say the same thing twice, so they
      // share one stub and label. ids holds every wire in the lane, for highlighting.
      const wires = [], byName = new Map();
      for (const e of sorted) {
        const cn = circuitLabel(e.c);
        const key = cn && cn + "|" + bundled.has(e.c.id);
        if (key && byName.has(key)) { byName.get(key).ids.push(e.c.id); continue; }
        const lane = { ...e, ids: [e.c.id] };
        if (key) byName.set(key, lane);
        wires.push(lane);
      }
      wires.forEach((e, i) => {
        const off = (i - (wires.length - 1) / 2) * lane;
        const ox = perp[0] * off, oy = perp[1] * off;
        const bx = p.x + v[0] * edge + ox, by = p.y + v[1] * edge + oy;
        const ex = p.x + v[0] * (edge + 1.6) + ox, ey = p.y + v[1] * (edge + 1.6) + oy;
        const sd = `M${n(p.x)} ${n(p.y)} L${n(bx)} ${n(by)} L${n(ex)} ${n(ey)}`;
        const ax = p.x + v[0] * (edge + 2.3) + ox, ay = p.y + v[1] * (edge + 2.3) + oy;
        let tr = "", anchor = "start";
        if (p.side === "top") tr = ` transform="rotate(-90 ${n(ax)} ${n(ay)})"`;
        if (p.side === "bottom") { tr = ` transform="rotate(-90 ${n(ax)} ${n(ay)})"`; anchor = "end"; }
        if (p.side === "left") anchor = "end";
        // A stub, except with lines (they reach the terminal) or for a cable core (it runs from the terminal into
        // its cable), which get just the label.
        const isSel = e.ids.some((id) => sel.has(id)), isNear = e.ids.some(inCirc);
        if (!isLine(e.c) && !bundled.has(e.c.id)) {
          if (isSel || isNear) stubs += glow(sd, isSel);
          stubs += wirePath(sd, e.c.color, 0.45, 'stroke-linejoin="round"', e.c.stripe);
        }
        // The arrow only joins a name to where the wire goes ("W3 → TB101-1"); on its own it's just "TB101-1".
        // A circuit name replaces the destination instead, at each end as a destination would be: "+24V" if
        // the circuit has a name, else "TB101-1".
        let txt;
        const cn = circuitLabel(e.c);
        if (cn) txt = cn;
        else {
          const name = isLine(e.c) ? "" : nameOf(e.c);
          txt = name && destOn ? `${name} → ${e.ref}` : name || (destOn ? e.ref : "");
        }
        if (!txt) return;
        const hl = isSel ? ' fill="#1d5fd6" font-weight="bold"' : isNear ? ' fill="#4a86ec"' : ' fill="#1d2126"';
        // A thin paper-coloured outline keeps the label readable where a wire or cable runs under it.
        labels += `<text x="${n(ax)}" y="${n(ay)}"${tr} font-family="${FONT}" font-size="${n(ls)}" text-anchor="${anchor}" dominant-baseline="central"${hl} stroke="#ffffff" stroke-opacity="0.9" stroke-width="${n(ls * 0.22)}" stroke-linejoin="round" paint-order="stroke"${ia ? ` data-conn="${esc(e.c.id)}" data-at="${esc(k)}" class="dest"` : ""}>${tipEl(e.ids.map((id) => wireTip(connMap.get(id))).join("\n\n"))}${esc(txt)}</text>`;
      });
    }

    const fill = p.it.color || p.tpl.fill;
    terms += `<g${ia ? ` class="term" data-term="${esc(k)}"` : ""}>`;
    // Mouse-over text: the terminal, what it's for (from its object type) and its connector label.
    if (ia) {
      const flag = String(p.it.termLabels?.[p.t.id] || "").trim();
      const tip = [endRef(p.it, p.tpl, p.t.id, st.termSep, partRef(doc, p.it, p.tpl)), String(p.t.desc || "").trim(), flag];
      terms += `<title>${esc(tip.filter(Boolean).join("\n"))}</title>`;
    }
    if (ia) terms += `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(Math.max(r + 0.6, 2))}" fill="transparent" class="term-hit"/>`;
    terms += `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(r)}" fill="#fbfbfb" stroke="#30353b" stroke-width="0.3" class="term-dot"/>`;
    const inside = st.showTermNames && p.t.name && denseTerms(p.tpl);
    if (!inside) terms += `<line x1="${n(p.x - r * 0.6)}" y1="${n(p.y + r * 0.6)}" x2="${n(p.x + r * 0.6)}" y2="${n(p.y - r * 0.6)}" stroke="#30353b" stroke-width="0.25" pointer-events="none"/>`;
    terms += "</g>";
    if (inside) {
      const fs = fitText(p.t.name, r * 1.15, r * 1.7);
      terms += `<text x="${n(p.x)}" y="${n(p.y)}" font-family="${FONT}" font-size="${n(fs)}" text-anchor="middle" dominant-baseline="central" fill="#1d2126" pointer-events="none">${esc(p.t.name)}</text>`;
    } else if (st.showTermNames && p.t.name) {
      const fs = Math.min(1.8, ls);
      const ink = inkFor(fill);
      let tx = p.x, ty = p.y, anchor = "middle", base = "central";
      if (p.side === "top") { ty = p.y + r + 0.4 + fs / 2; }
      else if (p.side === "bottom") { ty = p.y - r - 0.4 - fs / 2; }
      else if (p.side === "left") { tx = p.x + r + 0.5; anchor = "start"; }
      else { tx = p.x - r - 0.5; anchor = "end"; }
      terms += `<text x="${n(tx)}" y="${n(ty)}" font-family="${FONT}" font-size="${n(fs)}" text-anchor="${anchor}" dominant-baseline="${base}" fill="${ink}" pointer-events="none">${esc(p.t.name)}</text>`;
    }
  }

  if (ia) {
    for (const k of circ.terms) {
      const p = termPos.get(k);
      if (p?.here) rings += `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(termRadius(p.tpl) + 0.8)}" fill="none" stroke="#93c5fd" stroke-width="0.5" pointer-events="none"/>`;
    }
    // The selected wires' own ends are marked in the app's overlay, at a fixed size on screen.
    if (be) {
      for (const k of be.terms) {
        const p = termPos.get(k);
        if (p?.here) rings += `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(termRadius(p.tpl) + 1.1)}" fill="#f59e0b" fill-opacity="0.25" stroke="#f59e0b" stroke-width="0.6" pointer-events="none"/>`;
      }
    }
    if (opt.pending) {
      const p = termPos.get(opt.pending.item + "|" + opt.pending.term);
      if (p?.here) rings += `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(termRadius(p.tpl) + 1.2)}" fill="none" stroke="#f59e0b" stroke-width="0.7" pointer-events="none"/>`;
    }
  }

  let selBoxes = "";
  if (ia) {
    for (const it of doc.items) {
      if (!sel.has(it.id) || !here(it)) continue;
      const b = itemBox(it, tpls.get(it.tpl));
      selBoxes += `<rect x="${n(b.x - 1)}" y="${n(b.y - 1)}" width="${n(b.w + 2)}" height="${n(b.h + 2)}" fill="none" stroke="#3b82f6" stroke-width="0.5" stroke-dasharray="1.5 1" pointer-events="none"/>`;
    }
  }

  return plates.join("") + rails.join("") + bodies.join("") + sockets + lines + cableLayer + cableTop + stubs + slots + busLayer + labels + terms + lineLabels + texts.join("") + rings + selBoxes;
}

// Small standalone preview of an object type (used in the library and editor).
function renderTemplatePreview(tpl, size) {
  const pad = 2;
  const vw = tpl.w + pad * 2, vh = tpl.h + pad * 2;
  const r = termRadius(tpl);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(-pad)} ${n(-pad)} ${n(vw)} ${n(vh)}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet">`;
  s += `<rect width="${n(tpl.w)}" height="${n(tpl.h)}" rx="${n(tpl.radius || 0)}" fill="${esc(tpl.fill)}" stroke="${darken(tpl.fill, 0.55)}" stroke-width="${n(Math.max(0.35, Math.max(vw, vh) / 80))}"/>`;
  for (const t of tpl.terminals) {
    if (isSlot(t)) s += slotRect(t.x, t.y, tpl);
    else if (isPort(t)) s += portGlyph(t.x, t.y, tpl);
    else s += `<circle cx="${n(t.x)}" cy="${n(t.y)}" r="${n(r)}" fill="#fff" stroke="#30353b" stroke-width="${n(Math.max(0.3, Math.max(vw, vh) / 120))}"/>`;
  }
  return s + "</svg>";
}
