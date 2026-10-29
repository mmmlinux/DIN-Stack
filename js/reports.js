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
