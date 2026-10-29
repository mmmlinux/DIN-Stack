// Wire and cable lengths, worked out along the wire ducts, and what runs through each duct. All in mm.
//
// Each page's ducts make a network: points along their centre lines, joined where the ducts touch or
// overlap. A wire end drops from its terminal, the way the terminal faces, into the nearest duct ahead of
// it, runs through the ducts by the shortest way, and climbs out to its other end, plus some slack at each
// end (settings.slack). Ends close together (within DIRECT mm, and nearer each other than the ducts), such
// as a jumper between neighbouring terminals, are joined directly. With
// no duct to use, a wire runs across and down (right angles) from end to end. A wire or cable can be given
// ducts to go through (via: duct ids); it then visits them, nearest first, whatever the shortest way is.
// Ends on different pages, or off the drawing, have no estimate.

// How far a terminal looks for a duct ahead of it, and how close two ends must be to skip the ducts.
const DUCT_REACH = 300;
const DIRECT = 50;

// A duct's centre line: horizontal (v false) at y = c from a to b, or upright at x = c from a to b.
function ductLine(it) {
  const b = itemBox(it);
  return it.vertical ? { id: it.id, v: true, c: b.x + b.w / 2, a: b.y, b: b.y + b.h, box: b } : { id: it.id, v: false, c: b.y + b.h / 2, a: b.x, b: b.x + b.w, box: b };
}
const linePoint = (L, t) => (L.v ? { x: L.c, y: t } : { x: t, y: L.c });
const manhattan = (p, q) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y);
// The point on a duct's centre line nearest p: { t, d } (d: across and down to it).
function nearestOn(L, p) {
  const t = Math.max(L.a, Math.min(L.b, L.v ? p.y : p.x));
  return { t, d: manhattan(linePoint(L, t), p) };
}

// Where two touching ducts' centre lines join: across each other, the nearest points (the crossing, or the
// corner of an L or T); side by side, across the middle of where they overlap; end to end, their near ends.
function ductMeet(A, B) {
  if (A.v !== B.v) {
    const H = A.v ? B : A, V = A.v ? A : B;
    const x = Math.max(H.a, Math.min(H.b, V.c)), y = Math.max(V.a, Math.min(V.b, H.c));
    return A.v ? [y, x] : [x, y]; // positions along A, then along B
  }
  const o1 = Math.max(A.a, B.a), o2 = Math.min(A.b, B.b);
  if (o1 <= o2) return [(o1 + o2) / 2, (o1 + o2) / 2];
  return A.b < B.a ? [A.b, B.a] : [A.a, B.b];
}

// The ducts on a page as a graph: { lines, pts: per line [{ t, k }], nodes: [{ i (line) }], adj: per node
// [[node, mm]] }.
function ductNetwork(doc, pageId) {
  const lines = doc.items.filter((it) => it.kind === "duct" && pageOf(doc, it) === pageId).map(ductLine);
  const pts = lines.map(() => []), nodes = [], adj = [];
  const put = (i, t) => { nodes.push({ i }); adj.push([]); pts[i].push({ t, k: nodes.length - 1 }); return nodes.length - 1; };
  const link = (p, q, d) => { adj[p].push([q, d]); adj[q].push([p, d]); };
  lines.forEach((L, i) => { put(i, L.a); put(i, L.b); });
  const touch = (p, q) => p.x <= q.x + q.w + 1 && q.x <= p.x + p.w + 1 && p.y <= q.y + q.h + 1 && q.y <= p.y + p.h + 1;
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      if (!touch(lines[i].box, lines[j].box)) continue;
      const [ta, tb] = ductMeet(lines[i], lines[j]);
      link(put(i, ta), put(j, tb), manhattan(linePoint(lines[i], ta), linePoint(lines[j], tb)));
    }
  }
  for (const list of pts) {
    list.sort((p, q) => p.t - q.t);
    for (let k = 1; k < list.length; k++) link(list[k - 1].k, list[k].k, list[k].t - list[k - 1].t);
  }
  return { lines, pts, nodes, adj };
}

// Where a terminal (p: { x, y, side }) gets into the ducts: { i (line), t, drop }. The nearest duct straight
// ahead of it, the way it faces; failing that, the nearest duct at all, across and down. With only (a line),
// into that duct, however far.
function ductEntry(net, p, only) {
  const dir = SIDE_VEC[p.side] || [0, -1], reach = only == null ? DUCT_REACH : Infinity;
  const which = only == null ? net.lines.map((_, i) => i) : [only];
  let best = null;
  for (const i of which) {
    // Straight ahead: a duct lying across, above or below a terminal facing up or down (or upright, beside
    // one facing sideways), with the terminal within its length.
    const L = net.lines[i], along = L.v ? p.y : p.x, toward = L.v ? dir[0] : dir[1];
    if (!toward || along < L.a || along > L.b) continue;
    const d = (L.c - (L.v ? p.x : p.y)) * toward;
    if (d >= -((L.v ? L.box.w : L.box.h) / 2) && d <= reach && (!best || Math.abs(d) < best.drop)) best = { i, t: along, drop: Math.abs(d) };
  }
  if (best) return best;
  for (const i of which) {
    const n = nearestOn(net.lines[i], p);
    if (n.d <= reach && (!best || n.d < best.drop)) best = { i, t: n.t, drop: n.d };
  }
  return best;
}

// The shortest way through the ducts from line i at t to line j: to t2 on it, or (t2 null) anywhere on it.
// { len, lines: [the lines it goes through, in order], t (where it ends) }, or null if j isn't joined to i.
function ductLeg(net, i, t, j, t2) {
  if (i === j) return { len: t2 == null ? 0 : Math.abs(t - t2), lines: [i], t: t2 ?? t };
  const n = net.adj.length, dist = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
  for (const p of net.pts[i]) dist[p.k] = Math.abs(p.t - t);
  for (;;) {
    let u = -1;
    for (let k = 0; k < n; k++) if (!done[k] && dist[k] < Infinity && (u < 0 || dist[k] < dist[u])) u = k;
    if (u < 0) break;
    done[u] = true;
    for (const [v, d] of net.adj[u]) if (dist[u] + d < dist[v]) { dist[v] = dist[u] + d; prev[v] = u; }
  }
  let best = null;
  for (const p of net.pts[j]) {
    const d = dist[p.k] + (t2 == null ? 0 : Math.abs(p.t - t2));
    if (d < Infinity && (!best || d < best.len)) best = { len: d, k: p.k, t: t2 ?? p.t };
  }
  if (!best) return null;
  const lines = [];
  for (let u = best.k; u >= 0; u = prev[u]) if (lines[lines.length - 1] !== net.nodes[u].i) lines.push(net.nodes[u].i);
  if (lines[lines.length - 1] !== i) lines.push(i);
  return { len: best.len, lines: lines.reverse(), t: best.t };
}

// The way between two terminal points on one page: { len (without slack), lines (the ducts it goes
// through, as line indices) }. via: lines to go through, visited nearest first.
function ductRoute(net, p, q, via = []) {
  const direct = manhattan(p, q);
  if (!via.length) {
    const ea = net.lines.length && ductEntry(net, p), eb = ea && ductEntry(net, q);
    if (!ea || !eb || (direct <= DIRECT && direct <= ea.drop + eb.drop)) return { len: direct, lines: [] };
    const leg = ductLeg(net, ea.i, ea.t, eb.i, eb.t);
    return leg ? { len: ea.drop + leg.len + eb.drop, lines: leg.lines } : { len: direct, lines: [] };
  }
  // The picked ducts in the order they're met, each the nearest of the rest to where the last left off.
  const order = [], rest = [...new Set(via)];
  let at = p;
  while (rest.length) {
    let k = 0;
    rest.forEach((i, n) => { if (nearestOn(net.lines[i], at).d < nearestOn(net.lines[rest[k]], at).d) k = n; });
    const i = rest.splice(k, 1)[0];
    order.push(i);
    at = linePoint(net.lines[i], nearestOn(net.lines[i], at).t);
  }
  const ea = ductEntry(net, p, order[0]);
  let len = ea.drop, i = ea.i, t = ea.t;
  const lines = [i];
  const go = (j, t2) => {
    const leg = ductLeg(net, i, t, j, t2);
    if (leg) { len += leg.len; lines.push(...leg.lines.slice(1)); t = leg.t; }
    else {
      // Not joined: out of one duct and straight into the next.
      const n = nearestOn(net.lines[j], linePoint(net.lines[i], t));
      len += n.d + (t2 == null ? 0 : Math.abs(n.t - t2));
      lines.push(j);
      t = t2 ?? n.t;
    }
    i = j;
  };
  for (const j of order.slice(1)) go(j, null);
  const eb = ductEntry(net, q, order[order.length - 1]);
  go(eb.i, eb.t);
  return { len: len + eb.drop, lines: lines.filter((x, n) => lines.indexOf(x) === n) };
}

// Lengths for a diagram: { wire(c), between(e1, e2, via) }. wire(c) is { mm, est, ducts } for a wire: its own
// length (est false) or an estimate (est true), with the ids of the ducts it runs through; or null when it
// can't be worked out. between(e1, e2, via) is { mm, ducts } between two terminal ends, or null. Estimates
// include the slack and are rounded up to 10 mm.
function lengthsFor(doc) {
  const items = itemMap(doc), tpls = tplMap(doc), nets = new Map();
  const slack = Math.max(0, +doc.settings.slack || 0);
  const point = (e) => {
    const it = items.get(e.item), tpl = it && tpls.get(it.tpl), t = tpl && tpl.terminals.find((x) => x.id === e.term);
    return t ? { ...termWorld(it, tpl, t), page: pageOf(doc, it) } : null;
  };
  const between = (e1, e2, via) => {
    const p = point(e1), q = point(e2);
    if (!p || !q || p.page !== q.page) return null;
    if (!nets.has(p.page)) nets.set(p.page, ductNetwork(doc, p.page));
    const net = nets.get(p.page);
    const vi = (via || []).map((id) => net.lines.findIndex((L) => L.id === id)).filter((i) => i >= 0);
    const r = ductRoute(net, p, q, vi);
    return { mm: Math.ceil((r.len + 2 * slack) / 10) * 10, ducts: r.lines.map((i) => net.lines[i].id) };
  };
  const wire = (c) => {
    const r = between(c.a, c.b, c.via);
    if (+c.length > 0) return { mm: +c.length, est: false, ducts: r ? r.ducts : [] };
    return r && { ...r, est: true };
  };
  return { wire, between };
}

// "≈ 450 mm" for an estimate, "450 mm" for a length set by hand; metres from a metre up.
function lengthText(l) {
  if (!l) return "";
  const v = l.mm >= 1000 ? `${Math.round(l.mm / 100) / 10} m` : `${Math.round(l.mm)} mm`;
  return (l.est ? "≈ " : "") + v;
}

// ---------- duct fill ----------

// Typical outside diameter of a single PVC-insulated wire (H05V-K / H07V-K; UL 1015 and MTW are much the
// same) by conductor size: [mm², mm].
const WIRE_OD = [[0.14, 1.2], [0.25, 1.6], [0.5, 2.1], [0.75, 2.3], [1, 2.5], [1.5, 2.9], [2.5, 3.5], [4, 4.2], [6, 4.8], [10, 6.2], [16, 7.3], [25, 9], [35, 10.5], [50, 12.5]];

// A wire's outside diameter in mm, from its size ("1.5 mm²" or "16 AWG"), between the sizes listed.
function wireOD(gauge) {
  const s = String(gauge || ""), m = /([\d.]+)/.exec(s);
  if (!m) return 2.5;
  const area = /awg/i.test(s) ? awgArea(+m[1]) : +m[1];
  if (area <= WIRE_OD[0][0]) return WIRE_OD[0][1];
  for (let k = 1; k < WIRE_OD.length; k++) {
    const [a1, d1] = WIRE_OD[k - 1], [a2, d2] = WIRE_OD[k];
    if (area <= a2) return d1 + ((d2 - d1) * (area - a1)) / (a2 - a1);
  }
  return WIRE_OD[WIRE_OD.length - 1][1] * Math.sqrt(area / WIRE_OD[WIRE_OD.length - 1][0]);
}

// A cable's outside diameter in mm: as given (od), or worked out from its cores' sizes: the cores laid up
// together, plus a sheath.
function cableOD(od, gauges) {
  if (+od > 0) return +od;
  const n = gauges.length;
  if (!n) return 6;
  const d = Math.max(...gauges.map(wireOD));
  const lay = { 1: 1, 2: 2, 3: 2.16, 4: 2.42, 5: 2.7, 6: 3, 7: 3 }[n] || 1.15 * Math.sqrt(n) * 1.05;
  return d * lay + 1.6;
}

// How much of a duct's cross-section (width × depth) things of these diameters take, in percent.
const ductFillPct = (duct, diameters) => {
  const room = (+duct.width || 0) * (+duct.depth || +duct.width || 0);
  return room > 0 ? (100 * diameters.reduce((s, d) => s + (Math.PI / 4) * d * d, 0)) / room : 0;
};
