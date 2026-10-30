// Design checks: problems in a drawing, for the Checks list. Pure functions of the diagram.

// The checks, in the order they're listed: [id, name, level, on unless turned off, what it looks for].
const CHECKS = [
  ["tags", "Same tag twice", "error", true, "Two parts with the same tag (or designation)."],
  ["wireNos", "Same wire or cable number twice", "error", true, "Wires in different circuits with the same number, or cables with the same name."],
  ["names", "Circuit with two names", "error", true, "Wires, bus bars or connector labels with different circuit names that are wired together."],
  ["overfull", "Too many wires on a terminal", "error", true, "More wires on a terminal than its type says it takes."],
  ["size", "Wire size wrong for the terminal", "error", true, "A wire thinner or thicker than its terminal's type says it takes."],
  ["overlap", "Parts on top of each other", "error", true, "Parts overlapping on the same page."],
  ["rail", "Part off the end of its rail", "warn", true, "A DIN rail part hanging past the end of the rail it's on."],
  ["lonely", "Connector label with no partner", "warn", true, "A connector label whose name isn't used anywhere else, so it joins nothing."],
  ["cableEnds", "Cable to nowhere", "warn", true, "A cable leaving the drawing with no destination given."],
  ["unconnected", "Part with nothing connected", "warn", true, "A part with terminals, none of them wired."],
  ["io", "PLC point with no symbol", "warn", true, "A wired PLC input or output with no symbol."],
  ["orderNo", "No order number", "warn", true, "Parts that the bill of materials can't order."],
  ["length", "No length", "info", false, "Wires and cables whose length can't be estimated (ends on different pages, say) and isn't set."],
  ["unused", "Unused terminals", "info", false, "Terminals with no wire that aren't marked spare."],
];
const CHECK_LEVELS = { error: "Error", warn: "Warning", info: "Note" };
const checkOn = (doc, id) => { const c = CHECKS.find((x) => x[0] === id); return (doc.settings.checks || {})[id] ?? c[3]; };

// A wire size as an area in mm²: "1.5 mm²", "16 AWG", "2/0 AWG". null when it can't be read.
function gaugeArea(g) {
  const s = String(g || "").trim();
  let m = /^(\d)\/0\s*awg/i.exec(s);
  if (m) return awgArea(1 - +m[1]);
  m = /(\d+(?:[.,]\d+)?)/.exec(s);
  if (!m) return null;
  const v = +m[1].replace(",", ".");
  return /awg/i.test(s) ? awgArea(v) : v;
}

// "K1, K2, K3 and 4 more"
const fewOf = (xs, n = 6) => (xs.length > n ? xs.slice(0, n).join(", ") + ` and ${xs.length - n} more` : xs.join(", "));

// Everything the checks find: [{ check, level, text, ids, fix }], ids being what a line selects (parts, wires,
// bus bars, cables), and fix an offer to put it right ({ spare: [{ item, terms }] }: mark terminals spare).
// h: what the app works out: { ref(end), cableLength(cable), cableTo(cable): where an open cable's loose end
// goes, or null when it has none (it's plugged in or bundled) }.
function designChecks(doc, h) {
  const out = [];
  const add = (check, text, ids, fix) => out.push({ check, level: CHECKS.find((c) => c[0] === check)[2], text, ids: [...new Set(ids)], fix });
  const on = (id) => checkOn(doc, id);
  const items = itemMap(doc), tpls = tplMap(doc);
  const parts = doc.items.filter((it) => it.kind === "part" && tpls.get(it.tpl));
  const tplOf = (it) => tpls.get(it.tpl);
  const conns = validConnections(doc, items, tpls), buses = validBuses(doc, items, tpls);
  const key = (e) => e.item + "|" + e.term;
  const termOf = (e) => { const it = items.get(e.item), tpl = it && tpls.get(it.tpl); return tpl && tpl.terminals.find((t) => t.id === e.term); };

  if (on("tags")) {
    const by = new Map();
    for (const it of parts) {
      if (!String(it.tag || "").trim()) continue;
      const k = partRef(doc, it, tplOf(it)).toLowerCase();
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(it);
    }
    for (const list of by.values()) if (list.length > 1) add("tags", `${list.length} parts are tagged ${partRef(doc, list[0], tplOf(list[0]))}.`, list.map((it) => it.id));
  }

  if (on("wireNos")) {
    // The same number on wires of one circuit is fine: some drawings number wires by circuit.
    const find = buildCircuits(doc, items, tpls, conns, buses);
    const by = new Map();
    for (const c of conns) {
      const w = String(c.wire || "").trim();
      if (!w) continue;
      if (!by.has(w.toLowerCase())) by.set(w.toLowerCase(), []);
      by.get(w.toLowerCase()).push(c);
    }
    for (const list of by.values()) {
      if (new Set(list.map((c) => find(key(c.a)))).size > 1) add("wireNos", `Wire number ${list[0].wire.trim()} is used in ${new Set(list.map((c) => find(key(c.a)))).size} different circuits.`, list.map((c) => c.id));
    }
    const cab = new Map();
    for (const cb of doc.cables || []) {
      const l = String(cb.label || "").trim().toLowerCase();
      if (!l) continue;
      if (!cab.has(l)) cab.set(l, []);
      cab.get(l).push(cb);
    }
    for (const list of cab.values()) if (list.length > 1) add("wireNos", `${list.length} cables are called ${list[0].label.trim()}.`, list.map((cb) => cb.id));
  }

  if (on("names")) {
    const names = circuitNames(doc), seen = new Map();
    const note = (k, id) => {
      const ns = names.names(k);
      if (ns.length < 2) return;
      const j = ns.join(" / ");
      if (!seen.has(j)) seen.set(j, { ns, ids: [] });
      if (id) seen.get(j).ids.push(id);
    };
    for (const c of conns) note(key(c.a), c.id);
    for (const b of buses) note(key(b.terms[0]), b.id);
    for (const it of parts) for (const [t, v] of Object.entries(it.termLabels || {})) if (String(v || "").trim()) note(it.id + "|" + t, it.id);
    for (const { ns, ids } of seen.values()) add("names", `One circuit is called both ${ns.slice(0, -1).join(", ")} and ${ns[ns.length - 1]}.`, ids);
  }

  if (on("overfull") || on("size")) {
    const at = wiresAt(doc);
    for (const it of parts) {
      const tpl = tplOf(it), max = Math.round(+tpl.maxWires || 0);
      if (!on("overfull") || !(max > 0)) continue;
      for (const t of tpl.terminals) {
        const n = at.get(it.id + "|" + t.id) || 0;
        if (n > max) add("overfull", `${h.ref({ item: it.id, term: t.id })} has ${n} wires; it takes ${max}.`, [it.id, ...conns.filter((c) => key(c.a) === it.id + "|" + t.id || key(c.b) === it.id + "|" + t.id).map((c) => c.id)]);
      }
    }
    if (on("size")) {
      for (const c of conns) {
        const area = gaugeArea(c.gauge);
        if (area === null) continue;
        for (const e of [c.a, c.b]) {
          const it = items.get(e.item), tpl = it && tpls.get(it.tpl);
          if (!tpl || !termOf(e) || isSlot(termOf(e)) || isPort(termOf(e))) continue;
          const lo = gaugeArea(tpl.sizeMin), hi = gaugeArea(tpl.sizeMax);
          const small = lo !== null && area < lo * 0.99, big = hi !== null && area > hi * 1.01;
          if (!small && !big) continue;
          const range = [tpl.sizeMin, tpl.sizeMax].filter((x) => String(x || "").trim()).join(" to ");
          add("size", `${c.wire ? c.wire + " " : "A wire "}(${c.gauge}) on ${h.ref(e)} is too ${small ? "thin" : "thick"}: it takes ${lo !== null && hi !== null ? range : small ? tpl.sizeMin + " and up" : "up to " + tpl.sizeMax}.`, [c.id, it.id]);
        }
      }
    }
  }

  // Boxes on each page, for overlaps and rails.
  const box = new Map(parts.map((it) => [it.id, itemBox(it, tplOf(it))]));
  const pageIdOf = (it) => pageOf(doc, it);
  if (on("overlap")) {
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        const p = parts[i], q = parts[j];
        if (pageIdOf(p) !== pageIdOf(q)) continue;
        const a = box.get(p.id), b = box.get(q.id);
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > 0.3 && oy > 0.3) add("overlap", `${partRef(doc, p, tplOf(p)) || tplOf(p).name} and ${partRef(doc, q, tplOf(q)) || tplOf(q).name} overlap.`, [p.id, q.id]);
      }
    }
  }
  if (on("rail")) {
    const rails = doc.items.filter((r) => r.kind === "rail");
    for (const it of parts) {
      if (isLoose(tplOf(it))) continue;
      const b = box.get(it.id);
      for (const r of rails) {
        if (pageIdOf(r) !== pageIdOf(it)) continue;
        const rb = itemBox(r), cy = rb.y + rb.h / 2;
        if (b.y > cy || b.y + b.h < cy || b.x + b.w <= rb.x || b.x >= rb.x + rb.w) continue; // not across this rail
        const past = Math.max(rb.x - b.x, b.x + b.w - (rb.x + rb.w));
        if (past > 0.01) add("rail", `${partRef(doc, it, tplOf(it)) || tplOf(it).name} hangs ${+past.toFixed(1)} mm off the ${b.x < rb.x ? "left" : "right"} end of its DIN rail.`, [it.id, r.id]);
      }
    }
  }

  if (on("lonely")) {
    // A label joins its terminal to everything else with its name: elsewhere than its own wiring, there must be some.
    const find = buildCircuits(doc, items, tpls, conns, buses, { physical: true });
    const where = new Map(); // name -> Set of physical circuits carrying it
    forEachName(items, tpls, conns, buses, (name, k) => {
      const n = netKey(name);
      if (!where.has(n)) where.set(n, new Set());
      where.get(n).add(find(k));
    });
    for (const it of parts) {
      for (const [t, v] of Object.entries(it.termLabels || {})) {
        if (!String(v || "").trim() || !tplOf(it).terminals.some((x) => x.id === t)) continue;
        if ((where.get(netKey(v)) || new Set()).size < 2) add("lonely", `The connector label ${String(v).trim()} on ${h.ref({ item: it.id, term: t })} isn't used anywhere else, so it joins nothing.`, [it.id]);
      }
    }
  }

  if (on("cableEnds")) {
    for (const cb of doc.cables || []) {
      const to = h.cableTo(cb);
      if (to !== null && !String(to).trim()) add("cableEnds", `Cable ${cb.label || ""} leaves the drawing with no destination: give it one in its panel (Goes to).`.replace("Cable  ", "A cable "), [cb.id]);
    }
  }

  // What's attached to each terminal: wires, bus bars and plugged-in cables.
  const used = new Set();
  for (const c of conns) { used.add(key(c.a)); used.add(key(c.b)); }
  for (const b of buses) for (const e of b.terms) used.add(key(e));
  for (const cb of doc.cables || []) for (const e of [cb.portA, cb.portB, ...(cb.plugsA || []), ...(cb.plugsB || [])]) if (e) used.add(key(e));
  const spareOf = (it, t) => !!(it.spare && it.spare[t.id]);

  if (on("unconnected")) {
    for (const it of parts) {
      const tpl = tplOf(it), ts = tpl.terminals.filter((t) => !isSlot(t));
      if (!ts.length || stripRole(tpl) === "divider" || ts.some((t) => used.has(it.id + "|" + t.id)) || ts.every((t) => spareOf(it, t))) continue;
      add("unconnected", `${partRef(doc, it, tpl) || "A " + tpl.name} has nothing connected.`, [it.id]);
    }
  }

  if (on("io")) {
    const by = new Map();
    for (const r of ioRows(doc, h)) {
      if (r.symbol.trim() || !r.wired.length) continue;
      if (!by.has(r.it)) by.set(r.it, []);
      by.get(r.it).push(r);
    }
    for (const [it, rs] of by) add("io", `${rs[0].module || rs[0].tpl.name}: ${rs.length === 1 ? "a wired point has" : rs.length + " wired points have"} no symbol (${fewOf(rs.map((r) => r.term))}). Name them in the I/O list.`, [it.id]);
  }

  if (on("orderNo")) {
    const by = new Map();
    for (const it of parts) {
      const tpl = tplOf(it);
      if (partOrderNo(it, tpl)) continue;
      if (!by.has(tpl)) by.set(tpl, []);
      by.get(tpl).push(it);
    }
    // One line: on a drawing of generic parts, every type would have one.
    const list = [...by].sort((x, y) => y[1].length - x[1].length);
    const all = list.flatMap(([, its]) => its);
    if (all.length) add("orderNo", `${all.length === 1 ? "A part" : all.length + " parts"} of ${list.length === 1 ? "one type" : list.length + " types"} can't be ordered: ${fewOf(list.map(([tpl, its]) => tpl.name + (its.length > 1 ? " × " + its.length : "")), 4)}. Set the numbers in each type's Ordering tab, or on the parts.`, all.map((it) => it.id));
  }

  if (on("length")) {
    const lens = lengthsFor(doc), cored = new Set((doc.cables || []).flatMap((cb) => cb.wires));
    const wires = conns.filter((c) => !cored.has(c.id) && !lens.wire(c));
    if (wires.length) add("length", `${wires.length === 1 ? "A wire has" : wires.length + " wires have"} no length: ${fewOf(wires.map((c) => c.wire || h.ref(c.a) + " → " + h.ref(c.b)))}. Set it in the wire's panel.`, wires.map((c) => c.id));
    const cables = (doc.cables || []).filter((cb) => !h.cableLength(cb));
    if (cables.length) add("length", `${cables.length === 1 ? "A cable has" : cables.length + " cables have"} no length: ${fewOf(cables.map((cb) => cb.label || "?"))}. Set it in the cable's panel.`, cables.map((cb) => cb.id));
  }

  if (on("unused")) {
    for (const it of parts) {
      const tpl = tplOf(it);
      if (stripRole(tpl) === "divider") continue;
      const free = tpl.terminals.filter((t) => !isSlot(t) && !isPort(t) && !used.has(it.id + "|" + t.id) && !spareOf(it, t));
      if (!free.length) continue;
      add("unused", `${partRef(doc, it, tpl) || tpl.name}: ${free.length === 1 ? "terminal" : free.length + " terminals"} ${fewOf(free.map((t) => t.name), 8)} ${free.length === 1 ? "has" : "have"} no wire.`, [it.id], { spare: [{ item: it.id, terms: free.map((t) => t.id) }] });
    }
  }

  const rank = { error: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
