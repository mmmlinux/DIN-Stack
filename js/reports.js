// Reports built from a diagram: the bill of materials, as rows for the lists, the printout and CSV files.

const naturalCmp = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });

// The order number a part is bought by: its own, or else its type's first.
const partOrderNo = (it, tpl) => String(it.orderNo || "").trim() || String(tpl?.orders?.[0]?.no || "").trim();

// The sections of the bill of materials, in order.
const BOM_SECTIONS = ["Parts", "DIN rails", "Wire ducts", "Bus bars", "Wires", "Cables", "Back plates", "Other"];

// The bill of materials: one line per thing to order, grouped by maker and order number. Things without an
// order number are grouped by what they are instead (parts by type, rails by profile, wires by profile or
// look). Each line: { sec, qty, unit, maker, no, desc, used: [tags, labels or lengths], ids: [selectable ids] }.
// items limits it to some of the diagram's items (e.g. one page's); wires, bus bars and cables then count
// when they touch one of them. Wires and cables are bought by the metre when their lengths are known
// (cableLen(cb): a cable's length in mm, or null); the total is rounded up to whole metres.
function bomLines(doc, items = doc.items, cableLen = () => null) {
  const tpls = tplMap(doc);
  const lines = new Map();
  const line = (key, sec, init) => {
    if (!lines.has(key)) lines.set(key, { sec, qty: 0, unit: "pcs", maker: "", no: "", desc: "", used: [], ids: [], ...init });
    return lines.get(key);
  };
  const ordered = (maker, no) => "o|" + String(maker || "").trim().toLowerCase() + "|" + String(no).trim().toLowerCase();
  const on = new Set(items.map((i) => i.id));
  const all = items === doc.items;

  // Parts, and the accessories their types order with them. An accessory with the same order number as a
  // part (an end cover placed on the drawing, say) adds to that part's line.
  const parts = items.filter((i) => i.kind === "part" && tpls.has(i.tpl))
    .sort((a, b) => naturalCmp((tpls.get(a.tpl).category || "") + tpls.get(a.tpl).name, (tpls.get(b.tpl).category || "") + tpls.get(b.tpl).name));
  for (const it of parts) {
    const t = tpls.get(it.tpl);
    const no = partOrderNo(it, t), maker = String(t.maker || "").trim();
    const desc = (t.orders || []).find((o) => String(o.no || "").trim() === no)?.desc || t.name;
    const l = line(no ? ordered(maker, no) : "t|" + t.id, "Parts", { maker, no, desc });
    l.qty++;
    if (it.tag) l.used.push(partRef(doc, it, t));
    l.ids.push(it.id);
    for (const a of t.accessories || []) {
      const ano = String(a.no || "").trim(), amaker = String(a.maker || "").trim() || maker;
      if (!ano && !String(a.desc || "").trim()) continue;
      const al = line(ano ? ordered(amaker, ano) : "a|" + t.id + "|" + a.desc, "Parts", { maker: amaker, no: ano, desc: a.desc || "Accessory for " + t.name });
      al.qty += a.qty > 0 ? a.qty : 1;
      if (it.tag) al.used.push(partRef(doc, it, t));
      al.ids.push(it.id);
    }
  }

  // DIN rails, bought as lengths and cut: the line lists the cut lengths.
  for (const r of items.filter((i) => i.kind === "rail")) {
    const no = String(r.orderNo || "").trim(), maker = String(r.maker || "").trim();
    const l = line(no ? ordered(maker, no) : "r|" + r.height, "DIN rails", { maker, no, desc: `${r.height} mm DIN rail`, cuts: [] });
    l.qty++;
    l.cuts.push(Math.round(r.length * 10) / 10);
    l.ids.push(r.id);
  }

  // Wire ducts, cut to length like rails: by order number, or else by width and depth.
  for (const d of items.filter((i) => i.kind === "duct")) {
    const no = String(d.orderNo || "").trim(), maker = String(d.maker || "").trim();
    const size = `${d.width} × ${d.depth || "?"} mm`;
    const l = line(no ? ordered(maker, no) : "d|" + size, "Wire ducts", { maker, no, desc: `Wire duct, ${size}`, cuts: [] });
    l.qty++;
    l.cuts.push(Math.round(d.length * 10) / 10);
    l.ids.push(d.id);
  }

  // Back plates (or enclosures).
  for (const p of items.filter((i) => i.kind === "plate")) {
    const no = String(p.orderNo || "").trim(), maker = String(p.maker || "").trim();
    const desc = `${p.name || "Back plate"}, ${Math.round(p.w)} × ${Math.round(p.h)} mm`;
    const l = line(no ? ordered(maker, no) : "p|" + desc, "Back plates", { maker, no, desc });
    l.qty++;
    l.ids.push(p.id);
  }

  // Bus bars, by order number, or else by how many terminals they bridge.
  for (const b of doc.buses.filter((b) => all || b.terms.some((e) => on.has(e.item)))) {
    const no = String(b.orderNo || "").trim(), maker = String(b.maker || "").trim();
    const n = b.terms.length;
    const l = line(no ? ordered(maker, no) : "b|" + n, "Bus bars", { maker, no, desc: no ? "Bus bar" : `Bus bar, ${n} terminals` });
    l.qty++;
    if (b.label) l.used.push(b.label);
    l.ids.push(b.id);
  }

  // Wires and cables, by profile, or else by how they look. A wire in a cable is one of its cores, bought
  // with the cable.
  const lens = lengthsFor(doc);
  const metres = (l, mm) => { if (mm > 0) l.mm = (l.mm || 0) + mm; else l.unknown = (l.unknown || 0) + 1; };
  const profiles = new Map(doc.wireProfiles.map((p) => [p.id, p]));
  const wireOn = (c) => all || [c.a, c.b].some((e) => on.has(e.item));
  const cores = new Set(doc.cables.flatMap((cb) => cb.wires || []));
  for (const c of doc.connections.filter((c) => wireOn(c) && !cores.has(c.id))) {
    const p = profiles.get(c.profile);
    const look = [wireLookName(c.color, c.stripe), c.gauge, c.conductor].filter(Boolean).join(", ");
    const l = p
      ? line("w|" + p.id, "Wires", { maker: String(p.maker || "").trim(), no: String(p.orderNo || "").trim(), desc: `Wire: ${p.name} (${look})`, unit: "wires" })
      : line("wl|" + look.toLowerCase(), "Wires", { desc: `Wire: ${look || "no profile"}`, unit: "wires" });
    l.qty++;
    if (c.wire) l.used.push(c.wire);
    l.ids.push(c.id);
    metres(l, lens.wire(c)?.mm);
  }
  const cprofiles = new Map(doc.cableProfiles.map((p) => [p.id, p]));
  const cableOn = (cb) => all || doc.connections.some((c) => (cb.wires || []).includes(c.id) && wireOn(c))
    || [cb.portA, cb.portB, ...(cb.plugsA || []), ...(cb.plugsB || [])].some((e) => e && on.has(e.item));
  for (const cb of doc.cables.filter(cableOn)) {
    const p = cprofiles.get(cb.profile);
    const l = p
      ? line("c|" + p.id, "Cables", { maker: String(p.maker || "").trim(), no: String(p.orderNo || "").trim(), desc: `Cable: ${p.name}${p.desc ? ` (${p.desc})` : ""}`, unit: "cables" })
      : line("cl|" + String(cb.desc || "").toLowerCase(), "Cables", { desc: `Cable: ${cb.desc || "no profile"}`, unit: "cables" });
    l.qty++;
    if (cb.label) l.used.push(cb.label);
    l.ids.push(cb.id);
    metres(l, cableLen(cb));
  }

  // Lines typed in by hand: the enclosure, screws and anything else that isn't drawn.
  (doc.bomExtra || []).forEach((x, i) => {
    lines.set("x|" + i, { sec: "Other", qty: x.qty, unit: "pcs", maker: x.maker || "", no: x.no || "", desc: x.desc || "", used: [], ids: [], extra: i });
  });

  const out = [...lines.values()];
  for (const l of out) {
    l.used.sort(naturalCmp);
    if (l.cuts) {
      // "2 × 270 mm, 1 × 110 mm", longest first, then the total.
      const counts = new Map();
      for (const c of l.cuts.sort((a, b) => b - a)) counts.set(c, (counts.get(c) || 0) + 1);
      const total = Math.round(l.cuts.reduce((s, c) => s + c, 0) * 10) / 10;
      l.used = [...counts].map(([len, n]) => `${n} × ${len} mm`);
      if (l.cuts.length > 1) l.used.push(`${total} mm in all`);
    }
    // By the metre: "12 m" to buy, with the count and the length measured in the description.
    if (l.mm) {
      const n = l.qty, what = l.unit;
      l.qty = Math.max(1, Math.ceil(l.mm / 1000));
      l.unit = "m";
      l.desc += ` · ${n} ${n === 1 ? what.replace(/s$/, "") : what}, ${Math.round(l.mm / 100) / 10} m in all${l.unknown ? `, ${l.unknown} more without a length` : ""}`;
    }
  }
  return out.sort((a, b) => BOM_SECTIONS.indexOf(a.sec) - BOM_SECTIONS.indexOf(b.sec));
}

// A line's quantity with its unit: "3", "1 wire", "12 wires".
const bomQty = (l) => (l.unit === "pcs" ? String(l.qty) : `${l.qty} ${l.qty === 1 ? l.unit.replace(/s$/, "") : l.unit}`);

// The bill of materials as CSV rows, with a heading row.
function bomCsvRows(lines) {
  return [["Section", "Qty", "Unit", "Maker", "Order no.", "Description", "Used by"],
    ...lines.map((l) => [l.sec, l.qty, l.qty === 1 ? l.unit.replace(/s$/, "") : l.unit, l.maker, l.no, l.desc, l.used.join(", ")])];
}

// ---------- terminal strips ----------

// How a type takes part in terminal strips (tpl.stripRole): "block", a terminal block, with a row in the
// report for each of its levels; "divider", an end cover, partition plate or end clamp, shown where it sits
// between them; or "none". Without one set, types in the "Terminal blocks" category are blocks, or dividers
// when they have no terminals for wires.
const STRIP_ROLES = ["block", "divider", "none"];
function stripRole(tpl) {
  if (!tpl) return "none";
  if (STRIP_ROLES.includes(tpl.stripRole)) return tpl.stripRole;
  if (!/^terminal blocks?$/i.test(String(tpl.category || "").trim())) return "none";
  return tpl.terminals.some((t) => !isSlot(t) && !isPort(t)) ? "block" : "divider";
}

// The diagram's terminal strips: [{ key, name, named, parts, blocks }], parts in order along the strip. A
// block or divider given a strip name (part.strip) is in that strip wherever it is, so blocks apart from each
// other, on other rails or on other pages can make one strip. The rest join the strip of the nearest named
// part in their run (parts sitting flush side by side); a run with no name in it is a strip of its own,
// called by its tags (TB101–TB110). Strips of nothing but dividers are left out.
function terminalStrips(doc) {
  const tpls = tplMap(doc);
  const parts = doc.items.filter((it) => it.kind === "part" && stripRole(tpls.get(it.tpl)) !== "none");
  const box = new Map(parts.map((it) => [it.id, itemBox(it, tpls.get(it.tpl))]));
  const page = new Map(parts.map((it) => [it.id, pageOf(doc, it)]));
  // Touching: on the same page, side by side less than half a millimetre apart, and mostly level.
  const nb = new Map(parts.map((it) => [it.id, []]));
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const p = parts[i], q = parts[j], a = box.get(p.id), b = box.get(q.id);
      if (page.get(p.id) !== page.get(q.id)) continue;
      const beside = Math.abs(a.x + a.w - b.x) <= 0.5 || Math.abs(b.x + b.w - a.x) <= 0.5;
      if (beside && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > Math.min(a.h, b.h) / 2) { nb.get(p.id).push(q); nb.get(q.id).push(p); }
    }
  }
  // Names spread out from the named parts through their runs, a step at a time, so a part between two
  // named strips joins the nearer one. Names match whatever their case.
  const nameOf = new Map();
  let front = parts.filter((it) => String(it.strip || "").trim());
  for (const it of front) nameOf.set(it.id, it.strip.trim());
  while (front.length) {
    const next = [];
    for (const it of front) for (const o of nb.get(it.id)) if (!nameOf.has(o.id)) { nameOf.set(o.id, nameOf.get(it.id)); next.push(o); }
    front = next;
  }
  const groups = new Map();
  for (const it of parts) {
    if (!nameOf.has(it.id)) continue;
    const k = "n|" + nameOf.get(it.id).toLowerCase();
    if (!groups.has(k)) groups.set(k, { name: nameOf.get(it.id), parts: [] });
    groups.get(k).parts.push(it);
  }
  const seen = new Set();
  for (const it of parts) {
    if (nameOf.has(it.id) || seen.has(it.id)) continue;
    const run = [it];
    seen.add(it.id);
    for (let i = 0; i < run.length; i++) for (const o of nb.get(run[i].id)) if (!nameOf.has(o.id) && !seen.has(o.id)) { seen.add(o.id); run.push(o); }
    groups.set("r|" + it.id, { name: "", parts: run });
  }
  // Along the strip: by page, then rail by rail down the page, then in the build direction.
  const pageIx = new Map((doc.pages || []).map((p, i) => [p.id, i]));
  const rtl = doc.settings.direction === "rtl";
  const cmp = (p, q) => {
    const a = box.get(p.id), b = box.get(q.id);
    const pg = (pageIx.get(page.get(p.id)) ?? 0) - (pageIx.get(page.get(q.id)) ?? 0);
    if (pg) return pg;
    const dy = a.y + a.h / 2 - (b.y + b.h / 2);
    if (Math.abs(dy) > 10) return dy;
    return rtl ? b.x + b.w - (a.x + a.w) : a.x - b.x;
  };
  const out = [];
  for (const [k, g] of groups) {
    g.parts.sort(cmp);
    const blocks = g.parts.filter((it) => stripRole(tpls.get(it.tpl)) === "block");
    if (!blocks.length) continue;
    const tags = blocks.filter((it) => it.tag).map((it) => partRef(doc, it, tpls.get(it.tpl)));
    const auto = !tags.length ? tpls.get(blocks[0].tpl).name : tags.length === 1 ? tags[0] : `${tags[0]}–${tags[tags.length - 1]}`;
    out.push({ key: k.startsWith("n|") ? k : "r|" + g.parts[0].id, name: g.name || auto, named: !!g.name, parts: g.parts, blocks: blocks.length });
  }
  return out.sort((a, b) => naturalCmp(a.name, b.name));
}

// A strip's rows, in order: { kind: "divider", it, name } for a divider, and for each level of a block
// (terminals linked inside it, e.g. both sides of a feed-through block) { kind: "level", it, ref, tag (on
// its block's first level only), terms, top, bottom, bridges, circuit, page, spare }. top and bottom list
// the wires on that side of the block as "W3 → K1-A1 · C1/3". h gives what the app works out:
// { ref(end): a reference to a wire's other end, cable(wire id): its cable and core, or "" }.
function stripRows(doc, strip, h) {
  const tpls = tplMap(doc), names = circuitNames(doc);
  const multi = (doc.pages || []).length > 1;
  const rows = [];
  for (const it of strip.parts) {
    const tpl = tpls.get(it.tpl);
    if (stripRole(tpl) === "divider") { rows.push({ kind: "divider", it, name: it.tag ? partRef(doc, it, tpl) + " " + tpl.name : tpl.name }); continue; }
    // Terminals sharing a link are one level; a terminal without one is a level of its own. A block with no
    // links at all (a fuse holder, say, with the fuse between its terminals) is one level. A bus bar slot
    // belongs to the level with its link, or else to the first.
    const levels = new Map();
    const linked = tpl.terminals.some((t) => !isSlot(t) && String(t.link || "").trim());
    for (const t of tpl.terminals) {
      if (isSlot(t) || isPort(t)) continue;
      const k = !linked ? "all" : String(t.link || "").trim() || "t|" + t.id;
      if (!levels.has(k)) levels.set(k, []);
      levels.get(k).push(t);
    }
    if (!levels.size) continue;
    const slotsOf = new Map();
    for (const t of tpl.terminals.filter(isSlot)) {
      const k = levels.has(String(t.link || "").trim()) ? String(t.link).trim() : levels.keys().next().value;
      if (!slotsOf.has(k)) slotsOf.set(k, []);
      slotsOf.get(k).push(t);
    }
    const b = itemBox(it, tpl), mid = b.y + b.h / 2, ref = partRef(doc, it, tpl);
    let first = true;
    for (const [k, ts] of levels) {
      const ids = new Set([...ts, ...(slotsOf.get(k) || [])].map((t) => t.id));
      const top = [], bottom = [];
      for (const t of ts) {
        const upper = termWorld(it, tpl, t).y < mid;
        for (const c of doc.connections) {
          const here = c.a.item === it.id && c.a.term === t.id ? c.a : c.b.item === it.id && c.b.term === t.id ? c.b : null;
          if (!here) continue;
          const cable = h.cable(c.id);
          (upper ? top : bottom).push(`${c.wire ? c.wire + " " : ""}→ ${h.ref(here === c.a ? c.b : c.a)}${cable ? " · " + cable : ""}`);
        }
      }
      const bridges = (doc.buses || []).filter((bb) => bb.terms.some((e) => e.item === it.id && ids.has(e.term))).map((bb) => bb.label || "Bus bar");
      rows.push({
        kind: "level", it, ref, tag: first ? ref : "", terms: ts.map((t) => t.name).join(" / "), top, bottom, bridges,
        circuit: names.term(it.id + "|" + ts[0].id), page: multi ? pageName(doc, pageOf(doc, it)) : "", spare: !top.length && !bottom.length && !bridges.length,
      });
      first = false;
    }
  }
  return rows;
}

// Terminal strips as CSV rows, with a heading row. A level's several wires on one side are joined with "; ".
// The page is only given when there's more than one.
function stripCsvRows(doc, strips, h) {
  const multi = (doc.pages || []).length > 1;
  const out = [["Strip", "Block", "Terminals", "Top", "Bottom", "Bus bars", "Circuit", ...(multi ? ["Page"] : [])]];
  for (const s of strips) {
    for (const r of stripRows(doc, s, h)) {
      out.push(r.kind === "divider" ? [s.name, r.name, "", "", "", "", "", ...(multi ? [pageName(doc, pageOf(doc, r.it))] : [])]
        : [s.name, r.ref, r.terms, r.top.join("; "), r.bottom.join("; "), r.bridges.join("; "), r.circuit, ...(multi ? [r.page] : [])]);
    }
  }
  return out;
}

// ---------- wire processing ----------

// How a wire end is finished.
const WIRE_ENDS = { ferrule: "Ferrule", twin: "Twin ferrule", ring: "Ring lug", fork: "Fork lug", none: "None (bare)" };

// How many wires land on each terminal ("item|term").
function wiresAt(doc) {
  const m = new Map();
  for (const c of doc.connections) for (const e of [c.a, c.b]) m.set(e.item + "|" + e.term, (m.get(e.item + "|" + e.term) || 0) + 1);
  return m;
}

// How a wire's two ends are finished: [{ e, end, strip, why }] for end a, then b. Each end's own setting
// (endA / stripA, endB / stripB), or else its profile's (end, strip), or else the drawing's (settings.wireEnd,
// settings.strip). why says where it came from: "" (its own), "profile", "drawing" or "shared": a ferrule
// on a terminal two or more wires share is a twin ferrule, unless the end says otherwise.
function wireEnds(doc, c, at = wiresAt(doc)) {
  const p = doc.wireProfiles.find((x) => x.id === c.profile);
  return ["a", "b"].map((s) => {
    const S = s.toUpperCase(), e = c[s], own = WIRE_ENDS[c["end" + S]] ? c["end" + S] : "";
    let end = own || (WIRE_ENDS[p?.end] ? p.end : "") || (WIRE_ENDS[doc.settings.wireEnd] ? doc.settings.wireEnd : "ferrule");
    let why = own ? "" : WIRE_ENDS[p?.end] ? "profile" : "drawing";
    if (!own && end === "ferrule" && (at.get(e.item + "|" + e.term) || 0) > 1) { end = "twin"; why = "shared"; }
    const strip = +c["strip" + S] > 0 ? +c["strip" + S] : +p?.strip > 0 ? +p.strip : +doc.settings.strip > 0 ? +doc.settings.strip : 0;
    return { e, end, strip, why };
  });
}

// The wire processing list as CSV rows, with a heading row: every wire and cable core with its length and
// how each end is finished, in wire order. h as for stripRows: { ref(end), cable(wire id) }.
function processingCsvRows(doc, h) {
  const lens = lengthsFor(doc), at = wiresAt(doc);
  const out = [["Wire", "Cable / core", "Length (mm)", "Profile", "Colour", "Size", "Conductor", "End A", "A finish", "A strip (mm)", "End B", "B finish", "B strip (mm)"]];
  const wires = doc.connections.slice().sort((a, b) => naturalCmp(a.wire || "~", b.wire || "~"));
  for (const c of wires) {
    const l = lens.wire(c), ends = wireEnds(doc, c, at);
    const side = (x) => (doc.items.some((i) => i.id === x.e.item) ? [h.ref(x.e), WIRE_ENDS[x.end], x.strip || ""] : [h.ref(x.e), "", ""]);
    out.push([c.wire || "", h.cable(c.id), l ? Math.round(l.mm) : "", doc.wireProfiles.find((p) => p.id === c.profile)?.name || "",
      wireLookName(c.color, c.stripe), c.gauge || "", c.conductor || "", ...side(ends[0]), ...side(ends[1])]);
  }
  return out;
}

// ---------- PLC I/O ----------

// The kinds of I/O point a terminal can be (terminal.io), with its channel number (terminal.ch).
const IO_KINDS = [["DI", "Digital input"], ["DO", "Digital output"], ["AI", "Analog input"], ["AO", "Analog output"]];
const isIoKind = (k) => IO_KINDS.some(([v]) => v === k);
const ioTerms = (tpl) => (tpl?.terminals || []).filter((t) => isIoKind(t.io) && !isSlot(t) && !isPort(t));

// Address patterns, per kind of point (type.ioAddr). {slot} is the part's slot, {ch} the channel, and {byte},
// {bit} and {word} count from the start byte of that kind of point (the part's ioStart, or else its type's):
// {byte}.{bit} for 8 points a byte, {word} for one 2-byte word a channel.
const IO_PRESETS = [
  ["s7", "Siemens S7: %I0.0, %Q0.0, %IW64", { DI: "%I{byte}.{bit}", DO: "%Q{byte}.{bit}", AI: "%IW{word}", AO: "%QW{word}" }],
  ["logix", "Rockwell Logix, local chassis: Local:1:I.Data.0", { DI: "Local:{slot}:I.Data.{ch}", DO: "Local:{slot}:O.Data.{ch}", AI: "Local:{slot}:I.Ch{ch}Data", AO: "Local:{slot}:O.Ch{ch}Data" }],
  ["slc", "Rockwell MicroLogix / SLC 500: I:1/0, O:1/0, I:1.0", { DI: "I:{slot}/{ch}", DO: "O:{slot}/{ch}", AI: "I:{slot}.{ch}", AO: "O:{slot}.{ch}" }],
];
const ioUses = (tpl, ph) => Object.values(tpl?.ioAddr || {}).some((p) => String(p || "").includes("{" + ph + "}"));
const finiteOr = (v, d) => (v !== "" && v !== null && v !== undefined && Number.isFinite(+v) ? +v : d);
const ioStartOf = (it, tpl, kind) => finiteOr(it.ioStart?.[kind], finiteOr(tpl.ioStart?.[kind], 0));
const ioSlotOf = (it) => finiteOr(it.slot, 0);

// A point's channel: its own number, or else where it comes among its type's points of the same kind.
function ioChannel(tpl, t) {
  if (t.ch !== "" && t.ch !== undefined && t.ch !== null && Number.isFinite(+t.ch)) return Math.max(0, Math.round(+t.ch));
  return ioTerms(tpl).filter((x) => x.io === t.io).indexOf(t);
}

// A point's address: the terminal's own (terminal.addr), or else its type's pattern filled in. "" for none.
function ioAddress(it, tpl, t) {
  return String(t.addr || "").trim() || ioPatternAddress(it, tpl, t);
}

// A point's address from its type's pattern alone.
function ioPatternAddress(it, tpl, t) {
  const pat = String(tpl.ioAddr?.[t.io] || "").trim();
  if (!pat) return "";
  const ch = ioChannel(tpl, t), start = ioStartOf(it, tpl, t.io);
  const v = { slot: ioSlotOf(it), ch, byte: start + Math.floor(ch / 8), bit: ch % 8, word: start + 2 * ch };
  return pat.replace(/\{(slot|ch|byte|bit|word)\}/g, (m, k) => v[k]);
}

// A name made fit for a PLC tag: letters, digits and underscores ("S1 Start" -> "S1_Start").
const ioName = (s) => String(s || "").trim().replace(/[^A-Za-z0-9_]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");

// The I/O list: a row for each I/O point of each part, by tag and then in the type's order: { it, tpl, t, key,
// module, term, kind, ch, addr, symbol, desc, wired, suggest: { symbol, desc }, circuit, page }. wired lists
// what the point is wired to: the devices on its circuit (wires, bus bars and links, not names), or with none,
// the terminal blocks and cable cores it goes through. suggest is what Suggest from wiring would fill in.
// h as for stripRows: { ref(end) }.
function ioRows(doc, h, items = doc.items) {
  const imap = itemMap(doc), tpls = tplMap(doc);
  const conns = validConnections(doc, imap, tpls), buses = validBuses(doc, imap, tpls);
  const find = buildCircuits(doc, imap, tpls, conns, buses, { physical: true });
  const names = circuitNames(doc), multi = (doc.pages || []).length > 1;
  // What's on each circuit: part terminals, and the far ends of one-ended cables' cores.
  const on = new Map();
  const add = (k, x) => { const r = find(k); if (!on.has(r)) on.set(r, []); on.get(r).push(x); };
  for (const it of imap.values()) {
    const tpl = it.kind === "part" && tpls.get(it.tpl);
    if (tpl) for (const t of tpl.terminals) if (!isSlot(t) && !isPort(t)) add(it.id + "|" + t.id, { it, tpl, t });
  }
  for (const c of conns) for (const e of [c.a, c.b]) if (!imap.has(e.item)) add(e.item + "|" + e.term, { e });
  const parts = items.filter((it) => it.kind === "part" && ioTerms(tpls.get(it.tpl)).length)
    .sort((a, b) => naturalCmp(a.tag || "~", b.tag || "~"));
  const rows = [];
  for (const it of parts) {
    const tpl = tpls.get(it.tpl), module = partRef(doc, it, tpl);
    for (const t of ioTerms(tpl)) {
      const key = it.id + "|" + t.id;
      const others = (on.get(find(key)) || []).filter((x) => x.it !== it);
      const devices = others.filter((x) => x.it && stripRole(x.tpl) === "none");
      const via = others.filter((x) => !x.it || stripRole(x.tpl) !== "none");
      const refOf = (x) => h.ref(x.e || { item: x.it.id, term: x.t.id });
      const wired = (devices.length ? devices : via).map(refOf);
      const circuit = names.term(key);
      const dev = devices[0], what = dev && String(dev.it.desc || "").trim();
      const own = it.io?.[t.id] || {};
      rows.push({
        it, tpl, t, key, module, term: t.name, kind: t.io, ch: ioChannel(tpl, t), addr: ioAddress(it, tpl, t),
        symbol: String(own.symbol || ""), desc: String(own.desc || ""), wired, circuit,
        suggest: {
          symbol: ioName(circuit || (dev ? [dev.it.tag, what].filter(Boolean).join(" ") : "")),
          desc: dev ? [partRef(doc, dev.it, dev.tpl), what || dev.tpl.name.split(/\s·\s|\s\(|:/)[0].trim()].filter(Boolean).join(" ") : circuit || "",
        },
        page: multi ? pageName(doc, pageOf(doc, it)) : "",
      });
    }
  }
  // A suggested symbol already in use, or suggested for an earlier point, gets the terminal's name added.
  const used = new Set(rows.map((r) => r.symbol.trim().toLowerCase()).filter(Boolean));
  for (const r of rows) {
    if (r.symbol.trim() || !r.suggest.symbol) continue;
    if (used.has(r.suggest.symbol.toLowerCase())) r.suggest.symbol = ioName(r.suggest.symbol + " " + r.term);
    used.add(r.suggest.symbol.toLowerCase());
  }
  return rows;
}

// The I/O list as CSV rows, with a heading row.
function ioCsvRows(doc, rows) {
  const multi = (doc.pages || []).length > 1;
  const out = [["Module", "Terminal", "I/O", "Channel", "Address", "Symbol", "Description", "Wired to", "Circuit", ...(multi ? ["Page"] : [])]];
  for (const r of rows) out.push([r.module, r.term, r.kind, r.ch, r.addr, r.symbol, r.desc, r.wired.join("; "), r.circuit, ...(multi ? [r.page] : [])]);
  return out;
}

// Tag names as each PLC program takes them. Logix: a letter or underscore first, then letters, digits and
// single underscores, up to 40. RSLogix 500: capitals, digits and underscores, up to 20.
const logixName = (s) => { const n = ioName(s); return (/^\d/.test(n) ? "_" + n : n).slice(0, 40).replace(/_$/, ""); };
const slcName = (s) => { const n = ioName(s).toUpperCase(); return (/^\d/.test(n) ? "_" + n : n).slice(0, 20).replace(/_$/, ""); };

// Points to export: those with an address and, for programs that need one, a name. { list, skipped }.
function ioExportable(rows, needName) {
  const list = rows.filter((r) => r.addr && (!needName || r.symbol.trim()));
  return { list, skipped: rows.length - list.length };
}

// Studio 5000 Logix Designer (RSLogix 5000) tags: a CSV of alias tags for File > Import > Tags. Each named point
// becomes an alias for its address, which must be a tag that exists (Local:1:I.Data.0 once module 1 is set up).
function logixCsv(doc, rows, date = new Date()) {
  const q = (s) => '"' + String(s).replace(/[\r\n]+/g, " ").replace(/"/g, '""') + '"';
  const d = date.toString(), when = d.slice(0, 11) + d.slice(16, 24) + " " + d.slice(11, 15); // as Logix writes it: Tue Sep 25 15:46:27 2012
  const lines = ['remark,"CSV-Import-Export"', "remark," + q("Date = " + when), "remark," + q("Owner = " + (doc.meta.author || "")),
    "remark," + q("Company = "), "0.3", "TYPE,SCOPE,NAME,DESCRIPTION,DATATYPE,SPECIFIER,ATTRIBUTES"];
  for (const r of rows) lines.push(`ALIAS,,${logixName(r.symbol)},${q(r.desc)},"",${q(r.addr)},"(RADIX := Decimal, ExternalAccess := Read/Write)"`);
  return lines.join("\r\n") + "\r\n";
}

// RSLogix 500 address, symbol and description CSV, as its Tools > Database > ASCII Export writes it (and its
// ASCII Import reads): no heading; address, 0, symbol, then five description lines of up to 20 characters.
function slcCsv(rows) {
  const lines = [];
  for (const r of rows) {
    const words = String(r.desc || "").replace(/"/g, "'").replace(/,/g, ";").split(/\s+/).filter(Boolean);
    const desc = [""];
    for (const w of words) {
      const cur = desc[desc.length - 1];
      if (!cur) desc[desc.length - 1] = w.slice(0, 20);
      else if ((cur + " " + w).length <= 20) desc[desc.length - 1] = cur + " " + w;
      else desc.push(w.slice(0, 20));
    }
    while (desc.length < 5) desc.push("");
    lines.push(`${r.addr},0,${slcName(r.symbol)},${desc.slice(0, 5).map((d) => `"${d}"`).join(",")},0,,,0,`);
  }
  return lines.join("\r\n") + "\r\n";
}

// TIA Portal PLC tags, as its tag table export writes them: a "PLC Tags" sheet and a "TagTable Properties"
// sheet, for an .xlsx file (see xlsxFile). Addresses get the % they need (I0.0 -> %I0.0).
function tiaSheets(rows, table) {
  const tags = [["Name", "Path", "Data Type", "Logical Address", "Comment", "Hmi Visible", "Hmi Accessible", "Hmi Writeable", "Typeobject ID", "Version ID"]];
  for (const r of rows) {
    const addr = /^[IQM][WDB]?\d/i.test(r.addr) ? "%" + r.addr.toUpperCase() : r.addr;
    tags.push([r.symbol.replace(/"/g, "'").trim().slice(0, 128), table, /^A/.test(r.kind) ? "Int" : "Bool", addr, r.desc, "True", "True", "True", "", ""]);
  }
  return [{ name: "PLC Tags", rows: tags }, { name: "TagTable Properties", rows: [["Path", "BelongsToUnit", "Accessibility"], [table, "", ""]] }];
}

// Names and descriptions read from a CSV (an I/O list from here, or a PLC program's): which points they belong
// to, matched by address, or else by module and terminal. Takes the parsed rows, heading first. Returns
// { found: [{ row, symbol, desc }], unmatched }, or null when there's no column to match by.
function ioImport(table, rows) {
  const head = (table[0] || []).map((x) => String(x).trim().toLowerCase());
  const col = (...names) => head.findIndex((x) => names.includes(x));
  const cA = col("address", "logical address", "specifier", "addr"), cM = col("module", "device", "part"), cT = col("terminal", "pin");
  const cS = col("symbol", "name", "tag name", "symbol name", "tag"), cD = col("description", "comment", "desc");
  if ((cA < 0 && (cM < 0 || cT < 0)) || (cS < 0 && cD < 0)) return null;
  const norm = (s) => String(s || "").trim().toLowerCase().replace(/^%/, "");
  const byAddr = new Map(rows.filter((r) => r.addr).map((r) => [norm(r.addr), r]));
  const byTerm = new Map(rows.map((r) => [norm(r.module) + "|" + norm(r.term), r]));
  const found = [];
  let unmatched = 0;
  for (const line of table.slice(1)) {
    if (!line.some((v) => String(v).trim())) continue;
    const r = (cA >= 0 && byAddr.get(norm(line[cA]))) || (cM >= 0 && cT >= 0 && byTerm.get(norm(line[cM]) + "|" + norm(line[cT])));
    if (!r) { unmatched++; continue; }
    found.push({ row: r, symbol: cS >= 0 ? String(line[cS] ?? "").trim() : undefined, desc: cD >= 0 ? String(line[cD] ?? "").trim() : undefined });
  }
  return { found, unmatched };
}

// A CSV file's text as rows of cells: commas or semicolons (whichever the first line has more of), quotes.
function parseCsv(text) {
  text = String(text).replace(/^﻿/, "");
  const first = text.split(/\r?\n/, 1)[0];
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : ",";
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
