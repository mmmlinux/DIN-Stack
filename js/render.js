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

function textLines(it) { return String(it.text || "").split("\n"); }

// Bounding box of any diagram item in world coordinates.
function itemBox(it, tpl) {
  if (it.kind === "rail") return { x: it.x, y: it.y, w: it.length, h: it.height };
  if (it.kind === "text") {
    const lines = textLines(it);
    const longest = Math.max(1, ...lines.map((l) => l.length));
    return { x: it.x, y: it.y, w: longest * it.size * 0.56, h: lines.length * it.size * 1.25 };
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

// "TB101-1" / "PS1:+V" style reference for one end of a connection.
function endRef(it, tpl, termId, sep = "-") {
  if (!it || !tpl) return "?";
  const t = tpl.terminals.find((x) => x.id === termId);
  const who = it.tag || tpl.name;
  return who + sep + (t ? t.name : "?");
}

// A one-ended cable that a connection end belongs to (its far end, off the drawing), if any.
function openCableOf(doc, e) {
  return (doc.cables || []).find((k) => k.open && k.id === e.item) || null;
}

// Reference for either kind of connection end: "TB101-1" for a terminal, "C1-3" for core 3 of a
// one-ended cable.
function endLabel(doc, items, tpls, e, sep = "-") {
  const it = items.get(e.item);
  if (it) return endRef(it, tpls.get(it.tpl), e.term, sep);
  const cb = openCableOf(doc, e);
  return cb ? (cb.label || "Cable") + sep + e.term : "?";
}

// Connections whose ends both still exist (a terminal, or the far end of a one-ended cable).
function validConnections(doc, items, tpls) {
  return doc.connections.filter((c) => {
    for (const e of [c.a, c.b]) {
      if (openCableOf(doc, e)) continue;
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

function renderText(it, attrs) {
  const lines = textLines(it);
  const size = it.size || 3;
  let s = `<text ${attrs} x="${n(it.x)}" y="${n(it.y + size * 0.85)}" font-family="${FONT}" font-size="${n(size)}" fill="${esc(it.color || "#1d2126")}"${it.bold ? ' font-weight="bold"' : ""}>`;
  lines.forEach((l, i) => {
    s += `<tspan x="${n(it.x)}" dy="${i === 0 ? 0 : n(size * 1.25)}">${esc(l) || " "}</tspan>`;
  });
  return s + "</text>";
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
  const sub = it.desc || (tpl.showName ? tpl.name : "");
  const vertical = box.w < 14 && box.h > box.w * 2;
  const tf = `font-family="${FONT}" fill="${ink}" text-anchor="middle" dominant-baseline="central" pointer-events="none"`;
  if (vertical) {
    if (it.tag) {
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
      const size = fitText(it.tag, Math.min(st.tagSize, box.w * 0.62), Math.min(box.h * 0.6, (gap.b - gap.a) * 0.95));
      s += `<text x="${n(cx)}" y="${n(ty)}" font-size="${n(size)}" font-weight="bold" transform="rotate(-90 ${n(cx)} ${n(ty)})" ${tf}>${esc(it.tag)}</text>`;
    }
  } else {
    const tagSize = it.tag ? fitText(it.tag, Math.min(st.tagSize, box.h * 0.3), box.w * 0.9) : 0;
    let subSize = sub ? fitText(sub, Math.min(st.tagSize * 0.7, box.h * 0.2), box.w * 0.9) : 0;
    const height = () => tagSize + subSize + (tagSize && subSize ? 0.6 : 0);
    let ty = cy - height() / 2;
    // If terminals under the text (with their names) would cover it, move it into the tallest free band
    // between them, e.g. below the pin row of a small connector. If only the tag fits, the type name is left off.
    const textW = Math.max(String(it.tag || "").length * tagSize, String(sub || "").length * subSize) * 0.6;
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
      s += `<text x="${n(cx)}" y="${n(ty + tagSize / 2)}" font-size="${n(tagSize)}" font-weight="bold" ${tf}>${esc(it.tag)}</text>`;
      ty += tagSize + (subSize ? 0.6 : 0);
    }
    if (subSize) s += `<text x="${n(cx)}" y="${n(ty + subSize / 2)}" font-size="${n(subSize)}" ${tf}>${esc(sub)}</text>`;
  }
  return s + "</g>";
}

// Cables whose wires still exist, each with only its valid wires. An end plugged into a cable connector
// (portA / portB) is unplugged if the connector is gone (checked when items and tpls are given). A plugged
// end with no cores is always end A, and a cable with neither cores nor a plug is dropped.
function validCables(doc, conns, items, tpls) {
  const ok = new Set(conns.map((c) => c.id));
  const plug = (e) => {
    if (!e) return null;
    if (!items) return e;
    const it = items.get(e.item);
    const tpl = it && tpls.get(it.tpl);
    return tpl && tpl.terminals.some((t) => t.id === e.term && isPort(t)) ? e : null;
  };
  return (doc.cables || []).map((cb) => {
    const x = { ...cb, wires: cb.wires.filter((id) => ok.has(id)), portA: plug(cb.portA), portB: plug(cb.portB) };
    if (!x.wires.length && !x.portA && x.portB) { x.portA = x.portB; x.portB = null; }
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
function cableGeometry(cb, connById, pos, clear = 0, near = false) {
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
  const first = ws[0];
  let A = pos(first.a), B = pos(first.b);
  const d2 = (p, q) => (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
  const cores = ws.map((c) => {
    const pa = pos(c.a), pb = pos(c.b);
    return d2(pa, A) + d2(pb, B) <= d2(pa, B) + d2(pb, A) ? { c, ea: pa, eb: pb } : { c, ea: pb, eb: pa };
  });
  const mid = (pts) => ({ x: pts.reduce((t, p) => t + p.x, 0) / pts.length, y: pts.reduce((t, p) => t + p.y, 0) / pts.length });
  const cA = mid(cores.map((k) => k.ea)), cB = mid(cores.map((k) => k.eb));
  const dist = Math.sqrt(d2(cA, cB));
  const auto = (from, to, ends) => {
    if (dist < 0.01) return { x: from.x, y: from.y + 10 };
    const spread = Math.max(...ends.map((p) => Math.sqrt(d2(p, from))));
    const reach = Math.max(8, spread * 0.8 + 6, clear + 3);
    const off = near ? reach : Math.min(reach, dist * 0.4);
    return { x: from.x + ((to.x - from.x) / dist) * off, y: from.y + ((to.y - from.y) / dist) * off };
  };
  const bA = cb.pa || auto(cA, cB, cores.map((k) => k.ea));
  const bB = cb.pb || auto(cB, cA, cores.map((k) => k.eb));
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
 * opt: { interactive, sel: Set of ids, pending: {item, term} | null }
 */
function renderDiagram(doc, opt = {}) {
  const st = doc.settings;
  const tpls = tplMap(doc);
  const items = itemMap(doc);
  const sel = opt.sel || new Set();
  // opt.hideWires: ids of wires left off the drawing ("Show only these wires"), as if they didn't exist.
  const conns = validConnections(doc, items, tpls).filter((c) => !opt.hideWires || !opt.hideWires.has(c.id));
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

  const rails = [], bodies = [], texts = [];
  for (const it of doc.items) {
    const a = ia ? `data-item="${esc(it.id)}" class="item"` : "";
    if (it.kind === "rail") rails.push(renderRail(it, a));
    else if (it.kind === "text") texts.push(renderText(it, a));
    else if (tpls.has(it.tpl)) bodies.push(renderPartBody(doc, it, tpls.get(it.tpl), a));
  }

  // Terminal positions and the connections at each.
  const termPos = new Map();   // "item|term" -> {x, y, side, box, tpl, it, t}
  for (const it of doc.items) {
    if (it.kind !== "part") continue;
    const tpl = tpls.get(it.tpl);
    if (!tpl) continue;
    const box = itemBox(it, tpl);
    for (const t of tpl.terminals) termPos.set(it.id + "|" + t.id, { ...termWorld(it, tpl, t), box, tpl, it, t });
  }
  const atTerm = new Map();
  for (const c of conns) {
    for (const [here, there] of [[c.a, c.b], [c.b, c.a]]) {
      const k = here.item + "|" + here.term;
      if (!atTerm.has(k)) atTerm.set(k, []);
      atTerm.get(k).push({ c, ref: endLabel(doc, items, tpls, there, st.termSep), other: there.item + "|" + there.term });
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
    const d = busPathD(b.terms.map((e) => e.item + "|" + e.term));
    if (sel.has(b.id) || inCirc(b.id)) busLayer += glow(d, sel.has(b.id)).replace(/stroke-width="[\d.]+"/, `stroke-width="${sel.has(b.id) ? 3 : 2.6}"`);
    busLayer += wirePath(d, b.color || "#b87333", 1.1, 'stroke-linejoin="round"');
    // A contact where the bar sits in a slot, so a bar passing over a block it skips reads as not connected.
    for (const e of b.terms) {
      const p = termPos.get(e.item + "|" + e.term);
      if (isSlot(p.t)) busLayer += `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(slotSize(p.tpl) * 0.36)}" fill="${b.color === "gy" ? "#2e9b3c" : esc(b.color || "#b87333")}" stroke="#fbfbfb" stroke-width="0.3" pointer-events="none"/>`;
    }
    if (ia) busLayer += `<path d="${d}" class="hit" data-bus="${esc(b.id)}" fill="none" stroke="transparent" stroke-width="2.4"/>`;
  }
  const be = ia && opt.busEdit;
  if (be && be.terms.length) {
    const keys = be.terms.filter((k) => termPos.has(k));
    if (keys.length > 1) busLayer += `<path d="${busPathD(keys)}" fill="none" stroke="#f59e0b" stroke-width="1.1" stroke-dasharray="1.6 1" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"/>`;
  }

  // Cables: each core sweeps from its terminal into a breakout point, and a sheath joins the two
  // breakout points. Drawn whenever wires are, with lines or labels, since the grouping is the point.
  const cables = validCables(doc, conns, items, tpls);
  const bundled = new Set(cables.flatMap((cb) => cb.wires));
  // Each wire is a line to its other end, or broken into a stub and label at each terminal: as the drawing's
  // wire style says, unless the wire says otherwise (c.draw "line" or "break"). Cable cores follow the drawing.
  const isLine = (c) => (!bundled.has(c.id) && c.draw ? c.draw === "line" : showLines);
  const showLabels = destOn || conns.some((c) => !isLine(c)); // terminals get lanes for stubs and/or labels
  const connMap = new Map(conns.map((c) => [c.id, c]));
  let cableLayer = "", cableTop = "";
  for (const cb of cables) {
    // Roughly how far the longest wire label of the cable reaches out from its terminal.
    const clear = showLabels ? Math.max(0, ...cb.wires.map((id) => {
      const c = connMap.get(id);
      return c ? (String(c.wire || "").length + 3 + endLabel(doc, items, tpls, c.b, st.termSep).length) * st.labelSize * 0.6 + 4 : 0;
    })) : 0;
    // A broken cable (cb.draw, else the drawing's cables setting) is just a short tail of sheath at each
    // end, ending in a break bar and the cable's label with where its other end goes ("C1 → K1"). It's
    // drawn whole when there isn't room between its ends for both tails and labels, and when it's
    // one-ended and runs to a free end.
    const TAIL = 12, fs = Math.min(st.labelSize * 1.1, 3);
    const pos = (e) => termPos.get(e.item + "|" + e.term);
    const want = (cb.draw || st.cables) === "break";
    let g = cableGeometry(cb, connMap, pos, clear, want);
    if (!g) continue;
    const tagsOf = (ps) => [...new Set(ps.filter((p) => p && p.it).map((p) => p.it.tag || p.tpl.name))].join(", ");
    const plugName = (pl) => (pl ? endRef(pl.at.it, pl.at.tpl, pl.at.t.id, st.termSep) : "");
    // With cable names off (labelCable), just where it goes: "K1".
    const goes = (name) => (st.labelCable ? `${cb.label || "Cable"} → ${name || "?"}` : name || "?");
    // [where the tail starts, its plug if any, the other end, its label]
    const tails = want && !g.free ? [
      [g.bA, g.plugA, g.bB, goes(plugName(g.plugB) || tagsOf(g.cores.map((k) => k.eb)))],
      [g.bB, g.plugB, g.bA, goes(plugName(g.plugA) || tagsOf(g.cores.map((k) => k.ea)))],
    ] : [];
    const gap = (g.bB.x - g.bA.x) * (g.cB.x - g.cA.x) + (g.bB.y - g.bA.y) * (g.cB.y - g.cA.y) > 0 ? Math.hypot(g.bB.x - g.bA.x, g.bB.y - g.bA.y) : 0;
    const broken = tails.length > 0 && gap > tails.reduce((t, x) => t + TAIL + x[3].length * fs * 0.6 + 4, 0);
    if (want && !broken) g = cableGeometry(cb, connMap, pos, clear);
    const on = sel.has(cb.id);
    for (const k of g.cores) {
      const c = k.c;
      for (const [t, b, other] of g.open ? [[k.ea, g.bA, g.bB]] : [[k.ea, g.bA, g.bB], [k.eb, g.bB, g.bA]]) {
        const d = corePath(t, b, other);
        if (sel.has(c.id) || inCirc(c.id) || on) cableLayer += glow(d, sel.has(c.id) || on);
        cableLayer += wirePath(d, c.color, 0.5, 'stroke-linejoin="round"', c.stripe);
        if (ia) cableLayer += `<path d="${d}" class="hit" data-conn="${esc(c.id)}" fill="none" stroke="transparent" stroke-width="2.4"/>`;
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
    if (broken) {
      paths = [];
      for (const [p, pl, other, txt] of tails) {
        const L = Math.hypot(other.x - p.x, other.y - p.y) || 1;
        const u = pl ? pl.v : [(other.x - p.x) / L, (other.y - p.y) / L];
        const e = { x: p.x + u[0] * TAIL, y: p.y + u[1] * TAIL };
        paths.push(`M${n(p.x)} ${n(p.y)} L${n(e.x)} ${n(e.y)}`);
        breaks += crossBar(e, u) + endText(e, u, w / 2 + 1, txt);
      }
    }
    for (const d of paths) {
      if (on) cableTop += `<path d="${d}" fill="none" stroke="#3b82f6" stroke-opacity="0.4" stroke-width="${n(w + 1.6)}" stroke-linecap="round" pointer-events="none"/>`;
      // A shielded cable shows its braid as a dashed outline along the sheath.
      if (cb.shield) cableTop += `<path d="${d}" fill="none" stroke="#6b7280" stroke-width="${n(w + 1.5)}" stroke-dasharray="0.9 0.6" pointer-events="none"/>`;
    }
    // A plug where an end goes into a cable connector, over the socket.
    for (const pl of [g.plugA, g.plugB]) {
      if (!pl) continue;
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
      for (const d of paths) cableTop += `<path d="${d}" class="hit" data-cable="${esc(cb.id)}" fill="none" stroke="transparent" stroke-width="${n(w + 2)}"/>`;
      if (on) {
        for (const [end, p] of [["a", g.bA], ["b", g.bB]]) {
          if ((end === "a" && g.plugA) || (end === "b" && g.plugB)) continue; // fixed at its connector
          const tip = g.free && end === "b" ? "Drag to move the cable's free end" : "Drag to move where the cores fan out";
          cableTop += `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(w / 2 + 0.9)}" fill="#f59e0b" fill-opacity="0.35" stroke="#f59e0b" stroke-width="0.4" class="cable-handle" data-cable-handle="${esc(cb.id)}|${end}"><title>${tip}</title></circle>`;
        }
      }
    }
  }

  // Connection lines, each with its wire number at the middle.
  let lines = "", lineLabels = "";
  for (const c of conns) {
    if (bundled.has(c.id) || !isLine(c)) continue; // cable cores are drawn as part of their cable
    const p1 = termPos.get(c.a.item + "|" + c.a.term), p2 = termPos.get(c.b.item + "|" + c.b.term);
    let d, mid;
    if (st.lines === "curved") {
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
    if (ia) lines += `<path d="${d}" class="hit" data-conn="${esc(c.id)}" fill="none" stroke="transparent" stroke-width="3"/>`;
    const name = nameOf(c);
    if (name) {
      const hl = sel.has(c.id) ? ' fill="#1d5fd6" font-weight="bold"' : inCirc(c.id) ? ' fill="#4a86ec"' : ' fill="#1d2126"';
      lineLabels += `<text x="${n(mid.x)}" y="${n(mid.y)}" font-family="${FONT}" font-size="${n(st.labelSize)}" text-anchor="middle" dominant-baseline="central"${hl} stroke="#ffffff" stroke-opacity="0.9" stroke-width="${n(st.labelSize * 0.3)}" stroke-linejoin="round" paint-order="stroke"${ia ? ` data-conn="${esc(c.id)}" class="dest"` : ""}>${esc(name)}</text>`;
    }
  }

  // Stubs, destination labels, terminals.
  let stubs = "", labels = "", terms = "", rings = "", slots = "", sockets = "";
  const ls = st.labelSize;
  for (const [k, p] of termPos) {
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
    const flag = String(p.it.termLabels?.[p.t.id] || "").trim();
    const v = SIDE_VEC[p.side];
    if (list.length || flag) {
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
      // A connector label takes the first lane, ahead of the terminal's wires.
      const lanes = flag ? [{ flag }, ...wires] : wires;
      lanes.forEach((e, i) => {
        const off = (i - (lanes.length - 1) / 2) * lane;
        const ox = perp[0] * off, oy = perp[1] * off;
        const bx = p.x + v[0] * edge + ox, by = p.y + v[1] * edge + oy;
        const ex = p.x + v[0] * (edge + 1.6) + ox, ey = p.y + v[1] * (edge + 1.6) + oy;
        const sd = `M${n(p.x)} ${n(p.y)} L${n(bx)} ${n(by)} L${n(ex)} ${n(ey)}`;
        const ax = p.x + v[0] * (edge + 2.3) + ox, ay = p.y + v[1] * (edge + 2.3) + oy;
        let tr = "", anchor = "start";
        if (p.side === "top") tr = ` transform="rotate(-90 ${n(ax)} ${n(ay)})"`;
        if (p.side === "bottom") { tr = ` transform="rotate(-90 ${n(ax)} ${n(ay)})"`; anchor = "end"; }
        if (p.side === "left") anchor = "end";
        if (e.flag) {
          // Connector label: a boxed circuit name instead of a wire's destination.
          const on = circ.terms.has(k);
          stubs += `<path d="${sd}" fill="none" stroke="#5b6168" stroke-width="0.3" stroke-dasharray="0.8 0.5" pointer-events="none"/>`;
          const len = e.flag.length * ls * 0.62 + ls * 0.7, h = ls * 1.15;
          const rx = anchor === "start" ? ax - ls * 0.35 : ax - len + ls * 0.35;
          labels += `<g${tr} pointer-events="none"><rect x="${n(rx)}" y="${n(ay - h / 2)}" width="${n(len)}" height="${n(h)}" rx="${n(h * 0.2)}" fill="${on ? "#dbeafe" : "#fff8db"}" stroke="${on ? "#3b82f6" : "#5b6168"}" stroke-width="0.25"/>`;
          labels += `<text x="${n(ax)}" y="${n(ay)}" font-family="${FONT}" font-size="${n(ls)}" font-weight="bold" text-anchor="${anchor}" dominant-baseline="central" fill="#1d2126" class="flag">${esc(e.flag)}</text></g>`;
          return;
        }
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
        labels += `<text x="${n(ax)}" y="${n(ay)}"${tr} font-family="${FONT}" font-size="${n(ls)}" text-anchor="${anchor}" dominant-baseline="central"${hl} stroke="#ffffff" stroke-opacity="0.9" stroke-width="${n(ls * 0.22)}" stroke-linejoin="round" paint-order="stroke"${ia ? ` data-conn="${esc(e.c.id)}" class="dest"` : ""}>${esc(txt)}</text>`;
      });
    }

    const fill = p.it.color || p.tpl.fill;
    terms += `<g${ia ? ` class="term" data-term="${esc(k)}"` : ""}>`;
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
      if (p) rings += `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(termRadius(p.tpl) + 0.8)}" fill="none" stroke="#93c5fd" stroke-width="0.5" pointer-events="none"/>`;
    }
    // The selected wires' own ends are marked in the app's overlay, at a fixed size on screen.
    if (be) {
      for (const k of be.terms) {
        const p = termPos.get(k);
        if (p) rings += `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(termRadius(p.tpl) + 1.1)}" fill="#f59e0b" fill-opacity="0.25" stroke="#f59e0b" stroke-width="0.6" pointer-events="none"/>`;
      }
    }
    if (opt.pending) {
      const p = termPos.get(opt.pending.item + "|" + opt.pending.term);
      if (p) rings += `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(termRadius(p.tpl) + 1.2)}" fill="none" stroke="#f59e0b" stroke-width="0.7" pointer-events="none"/>`;
    }
  }

  let selBoxes = "";
  if (ia) {
    for (const it of doc.items) {
      if (!sel.has(it.id)) continue;
      const b = itemBox(it, tpls.get(it.tpl));
      selBoxes += `<rect x="${n(b.x - 1)}" y="${n(b.y - 1)}" width="${n(b.w + 2)}" height="${n(b.h + 2)}" fill="none" stroke="#3b82f6" stroke-width="0.5" stroke-dasharray="1.5 1" pointer-events="none"/>`;
    }
  }

  return rails.join("") + bodies.join("") + sockets + lines + cableLayer + cableTop + stubs + slots + busLayer + labels + terms + lineLabels + texts.join("") + rings + selBoxes;
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
