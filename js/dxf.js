// DXF drawings of a page, for CAD and for machining the back plate or door: outlines, the holes cut for
// door and panel devices (cutouts), their screw holes, and the DIN rails' mounting holes. Written as plain
// ASCII DXF R12, which every CAD and CAM program reads, at 1:1 in millimetres.

// The kinds of cutout a type can have: [shape, name].
const CUTOUT_SHAPES = [["round", "Round"], ["d", "Round with one flat (D)"], ["dd", "Round with two flats"], ["rect", "Rectangle"]];

// The DXF layers: [name, colour (AutoCAD colour number), what's on it]. Machining has only the starred ones.
const DXF_LAYERS = [
  ["PLATE", 7, "Back plates and enclosures", true],
  ["RAILS", 8, "DIN rails"],
  ["DUCTS", 3, "Wire ducts"],
  ["PARTS", 5, "Parts' outlines"],
  ["TEXT", 7, "Tags, labels and notes"],
  ["CUTOUTS", 1, "Holes cut for door and panel devices", true],
  ["HOLES", 6, "Screw holes: parts' and the DIN rails' mounting holes", true],
];

const BULGE90 = Math.tan(Math.PI / 8); // a quarter circle's bulge

// Windows code page 1252's characters from 0x80 to 0x9f, in order (from 0xa0 on, it's the same as Unicode).
const CP1252 = new Map([..."€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ"].map((c, i) => [c, 0x80 + i]));

// Text as the bytes to save in code page 1252: DXF files, and the PLC programs' CSV files.
function cp1252Bytes(text) {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    out[i] = k < 0x80 || (k >= 0xa0 && k <= 0xff) ? k : CP1252.get(text[i]) ?? 0x3f;
  }
  return out;
}

// A part's cutout and screw holes: its order number's own (orders[i].cutout / .holes, from a library), or
// else its type's. { cutout, holes }, either of which may be empty.
function partMachining(it, tpl) {
  const no = partOrderNo(it, tpl);
  const o = (tpl.orders || []).find((x) => x.no === no);
  const cutout = o && "cutout" in o ? o.cutout : tpl.cutout;
  const holes = o && "holes" in o ? o.holes : tpl.holes;
  return { cutout: cutout && cutout.shape && cutout.shape !== "none" ? cutout : null, holes: (holes || []).filter((h) => +h.d > 0) };
}

// What's cut for a part, in words: "a Ø 22.3 mm cutout and 4 Ø 3.2 mm screw holes", or "".
function machiningText(m) {
  const mm = (v) => Math.round(v * 10) / 10 + " mm";
  const c = m.cutout, hs = m.holes;
  const cut = !c ? "" : c.shape === "rect" ? `a ${mm(+c.w).replace(" mm", "")} × ${mm(+c.h)} cutout`
    : +c.d > 0 ? `a Ø ${mm(+c.d)} cutout${c.shape === "d" ? " with a flat" : c.shape === "dd" ? " with two flats" : +c.notchW > 0 ? " with a notch" : ""}` : "";
  const ds = [...new Set(hs.map((h) => +h.d))];
  const holes = !hs.length ? "" : `${hs.length === 1 ? "a" : hs.length}${ds.length === 1 ? ` Ø ${mm(ds[0])}` : ""} screw hole${hs.length === 1 ? "" : "s"}`;
  return [cut, holes].filter(Boolean).join(" and ");
}

// A cutout's outline in the type's own frame: { circle: { x, y, r } } or { poly: [{ x, y, b }] }, or null.
// A poly goes round once, clockwise as seen on the page; b is the bulge of the side from that point to the next (tan of a quarter of the
// arc's angle, every arc bulging outwards), 0 for a straight side. The centre is (x, y) on the type, its
// middle unless given. A notch (round only) is at the top, as is a D's flat; two flats are top and bottom.
function cutoutOutline(cut, tpl) {
  if (!cut) return null;
  const given = (v) => v !== undefined && v !== null && v !== "" && Number.isFinite(+v);
  const cx = given(cut.x) ? +cut.x : tpl.w / 2, cy = given(cut.y) ? +cut.y : tpl.h / 2;
  const at = (pts) => ({ poly: pts.map(([x, y, b]) => ({ x: cx + x, y: cy + y, b: b || 0 })) });
  if (cut.shape === "rect") {
    const w = +cut.w, h = +cut.h;
    if (!(w > 0 && h > 0)) return null;
    return at(roundedRect(-w / 2, -h / 2, w, h, +cut.r || 0).map((p) => [p.x, p.y, p.b]));
  }
  const R = +cut.d / 2;
  if (!(R > 0)) return null;
  const circle = { circle: { x: cx, y: cy, r: R } };
  if (cut.shape === "round") {
    const nw = +cut.notchW, nd = +cut.notchD;
    if (!(nw > 0 && nd > 0 && nw < 2 * R)) return circle;
    const a = Math.asin(nw / 2 / R), y = -R * Math.cos(a);
    return at([[-nw / 2, y], [-nw / 2, -R - nd], [nw / 2, -R - nd], [nw / 2, y, Math.tan((2 * Math.PI - 2 * a) / 4)]]);
  }
  const f = +cut.flat;
  if (cut.shape === "d") {
    // flat: from the flat across to the far side of the circle.
    if (!(f > 0 && f < 2 * R)) return circle;
    const c = f - R, x = Math.sqrt(R * R - c * c);
    return at([[-x, -c], [x, -c, Math.tan((2 * Math.PI - 2 * Math.acos(c / R)) / 4)]]);
  }
  if (cut.shape === "dd") {
    // flat: across the two flats.
    const c = f / 2;
    if (!(c > 0 && c < R)) return circle;
    const x = Math.sqrt(R * R - c * c), b = Math.tan(Math.asin(c / R) / 2);
    return at([[-x, -c], [x, -c, b], [x, c], [-x, c, b]]);
  }
  return null;
}

// A rectangle with rounded corners as a poly (see cutoutOutline), clockwise from the top left.
function roundedRect(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  if (!r) return [{ x, y, b: 0 }, { x: x + w, y, b: 0 }, { x: x + w, y: y + h, b: 0 }, { x, y: y + h, b: 0 }];
  return [
    { x: x + r, y, b: 0 }, { x: x + w - r, y, b: BULGE90 },
    { x: x + w, y: y + r, b: 0 }, { x: x + w, y: y + h - r, b: BULGE90 },
    { x: x + w - r, y: y + h, b: 0 }, { x: x + r, y: y + h, b: BULGE90 },
    { x, y: y + h - r, b: 0 }, { x, y: y + r, b: BULGE90 },
  ];
}

// An outline (from cutoutOutline) as an SVG path, for the type designer's preview.
function outlinePath(o) {
  if (o.circle) {
    const { x, y, r } = o.circle;
    return `M${n(x - r)} ${n(y)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0Z`;
  }
  const pts = o.poly;
  let d = `M${n(pts[0].x)} ${n(pts[0].y)}`;
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length];
    if (!p.b) { d += `L${n(q.x)} ${n(q.y)}`; return; }
    const c = Math.hypot(q.x - p.x, q.y - p.y), r = (c * (1 + p.b * p.b)) / (4 * p.b);
    d += `A${n(r)} ${n(r)} 0 ${p.b > 1 ? 1 : 0} 1 ${n(q.x)} ${n(q.y)}`; // sweep 1: clockwise
  });
  return d + "Z";
}

// Where a DIN rail's mounting holes go, along it from its left end: s.railHoleEnd from each end and no
// more than s.railHoles apart, evenly spaced. None when either is 0.
function railHoleXs(rail, s) {
  const pitch = +s.railHoles, d = +s.railHoleD, end = Math.max(0, +s.railHoleEnd || 0), L = +rail.length;
  if (!(pitch > 0 && d > 0 && L > 0)) return [];
  const span = L - 2 * end;
  if (span <= 0) return [L / 2];
  const gaps = Math.max(1, Math.ceil(span / pitch - 1e-9));
  return Array.from({ length: gaps + 1 }, (_, i) => end + (span * i) / gaps);
}

// Everything on one page drawn for DXF, in the diagram's own millimetres (y down): a list of
// { layer, circle: { x, y, r } } | { layer, poly } | { layer, text, x, y, h, rot, align }. With machining,
// only the plates, cutouts and holes. Also counts of what's in it, for the Export window.
function dxfShapes(doc, pageId, machining = false) {
  const tpls = tplMap(doc), s = doc.settings;
  const out = [], count = { cutouts: 0, holes: 0, railHoles: 0, parts: 0 };
  const add = (layer, shape) => { if (!machining || DXF_LAYERS.find((l) => l[0] === layer)[3]) out.push({ layer, ...shape }); };
  const rect = (layer, x, y, w, h, r = 0) => add(layer, { poly: roundedRect(x, y, w, h, r) });
  const text = (t, x, y, h, rot = 0, align = "middle") => { if (String(t || "").trim()) add("TEXT", { text: String(t), x, y, h, rot, align }); };
  for (const it of doc.items) {
    if (pageOf(doc, it) !== pageId) continue;
    if (it.kind === "plate") {
      rect("PLATE", it.x, it.y, it.w, it.h);
      if (it.name) text(it.name, it.x + 3, it.y + 5, 3.5, 0, "left");
    } else if (it.kind === "rail") {
      rect("RAILS", it.x, it.y, it.length, it.height);
      const d = +s.railHoleD;
      for (const x of railHoleXs(it, s)) { add("HOLES", { circle: { x: it.x + x, y: it.y + it.height / 2, r: d / 2 } }); count.railHoles++; }
    } else if (it.kind === "duct") {
      const b = itemBox(it);
      rect("DUCTS", b.x, b.y, b.w, b.h);
      if (it.label) {
        const size = Math.min(5, (it.width || 40) * 0.25);
        if (it.vertical) text(it.label, b.x + b.w / 2, b.y + 3 + size / 2, size);
        else text(it.label, b.x + 3, b.y + b.h / 2, size, 0, "left");
      }
    } else if (it.kind === "text") {
      // Each line from its own start, turned with the note about the middle of its box.
      const f = textFrame(it), size = it.size || 3, a = (f.rot * Math.PI) / 180;
      const mx = f.x + f.w / 2, my = f.y + f.h / 2;
      textLines(it).forEach((l, i) => {
        const x = it.x - mx, y = it.y + size * 0.85 + i * size * 1.25 - my;
        text(l, mx + x * Math.cos(a) - y * Math.sin(a), my + x * Math.sin(a) + y * Math.cos(a), size, f.rot, "baseline");
      });
    } else if (it.kind === "part") {
      const tpl = tpls.get(it.tpl);
      if (!tpl) continue;
      count.parts++;
      const b = itemBox(it, tpl);
      rect("PARTS", b.x, b.y, b.w, b.h, tpl.radius || 0);
      const tag = shownTag(doc, it);
      if (tag) {
        const vertical = b.w < 14 && b.h > b.w * 2;
        const along = vertical ? b.h : b.w, across = vertical ? b.w : b.h;
        text(tag, b.x + b.w / 2, b.y + b.h / 2, fitText(tag, Math.min(s.tagSize, across * 0.6), along * 0.9), vertical ? 270 : 0);
      }
      // The type's own points to where they are on the page, turned with the part.
      const world = (p) => { const q = rotPoint(p.x, p.y, tpl.w, tpl.h, it.rot); return { x: it.x + q.x, y: it.y + q.y }; };
      const m = partMachining(it, tpl);
      const o = cutoutOutline(m.cutout, tpl);
      if (o) {
        add("CUTOUTS", o.circle ? { circle: { ...world(o.circle), r: o.circle.r } } : { poly: o.poly.map((p) => ({ ...world(p), b: p.b })) });
        count.cutouts++;
      }
      for (const h of m.holes) { add("HOLES", { circle: { ...world({ x: +h.x, y: +h.y }), r: +h.d / 2 } }); count.holes++; }
    }
  }
  return { shapes: out, count };
}

// The corner a page's 0,0 is measured from, in the diagram's mm: the bottom left corner of its back plate
// (its largest, if several), or else of everything on it; the bottom right for a page drawn from behind
// (mirrored), which is the bottom left once it's turned round. { x, y, plate } or null for an empty page.
function originCorner(doc, pageId) {
  const tpls = tplMap(doc), mirror = !!(doc.pages || []).find((p) => p.id === pageId)?.mirror;
  const on = doc.items.filter((i) => pageOf(doc, i) === pageId);
  const plate = on.filter((i) => i.kind === "plate" && i.w > 0 && i.h > 0).sort((a, b) => b.w * b.h - a.w * a.h)[0];
  const boxes = plate ? [plate] : on.map((i) => itemBox(i, tpls.get(i.tpl)));
  if (!boxes.length) return null;
  const x0 = Math.min(...boxes.map((b) => b.x)), x1 = Math.max(...boxes.map((b) => b.x + b.w));
  return { x: mirror ? x1 : x0, y: Math.max(...boxes.map((b) => b.y + b.h)), plate: !!plate };
}

// Where a page's 0,0 is, in the diagram's mm: the corner (originCorner) moved by the page's ox and oy, which
// are along the DXF's X axis (to the right, or to the left on a mirrored page) and up. { x, y, mirror, auto,
// plate } or null. auto: it's at the corner.
function dxfOrigin(doc, pageId) {
  const pg = (doc.pages || []).find((p) => p.id === pageId) || {};
  const c = originCorner(doc, pageId);
  if (!c) return null;
  const mirror = !!pg.mirror, dx = +pg.ox || 0, dy = +pg.oy || 0;
  return { x: c.x + (mirror ? -dx : dx), y: c.y - dy, mirror, auto: !dx && !dy, plate: c.plate };
}

// The page as a DXF file (text), or "" if there's nothing to draw. Coordinates are from the page's 0,0
// (dxfOrigin); a page drawn from behind, such as a door from the wiring side, is mirrored left to right so
// it comes out as seen from the front, to be machined.
function dxfFile(doc, pageId, opt = {}) {
  const { shapes } = dxfShapes(doc, pageId, opt.machining);
  const o = dxfOrigin(doc, pageId);
  if (!shapes.length || !o) return "";
  const mirror = o.mirror;
  const X = (x) => (mirror ? o.x - x : x - o.x), Y = (y) => o.y - y;

  const out = [];
  const g = (code, v) => out.push(String(code), String(v));
  const num = (v) => { const r = Math.round(v * 10000) / 10000; return Object.is(r, -0) ? "0" : String(r); };
  // R12 text is 8-bit, in Windows code page 1252 (see cp1252Bytes); anything outside it is written as \U+XXXX.
  const txt = (s) => String(s).replace(/[\x00-\x1f]/g, " ").replace(/[^\x20-\x7e\xa0-\xff]/gu, (c) => (CP1252.has(c) ? c : "\\U+" + c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")));
  const xy = (x, y, k = 0) => { g(10 + k, num(X(x))); g(20 + k, num(Y(y))); g(30 + k, "0"); };

  // Extents, in DXF coordinates.
  const ext = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const grow = (x, y) => { const a = X(x), b = Y(y); ext.x0 = Math.min(ext.x0, a); ext.x1 = Math.max(ext.x1, a); ext.y0 = Math.min(ext.y0, b); ext.y1 = Math.max(ext.y1, b); };
  for (const s of shapes) {
    if (s.circle) { grow(s.circle.x - s.circle.r, s.circle.y - s.circle.r); grow(s.circle.x + s.circle.r, s.circle.y + s.circle.r); }
    else if (s.poly) for (const p of s.poly) grow(p.x, p.y);
    else grow(s.x, s.y);
  }

  g(0, "SECTION"); g(2, "HEADER");
  g(9, "$ACADVER"); g(1, "AC1009");
  g(9, "$DWGCODEPAGE"); g(3, "ANSI_1252");
  g(9, "$INSBASE"); g(10, "0"); g(20, "0"); g(30, "0");
  g(9, "$EXTMIN"); g(10, num(ext.x0)); g(20, num(ext.y0)); g(30, "0");
  g(9, "$EXTMAX"); g(10, num(ext.x1)); g(20, num(ext.y1)); g(30, "0");
  g(0, "ENDSEC");

  const used = DXF_LAYERS.filter((l) => shapes.some((s) => s.layer === l[0]));
  g(0, "SECTION"); g(2, "TABLES");
  g(0, "TABLE"); g(2, "LTYPE"); g(70, 1);
  g(0, "LTYPE"); g(2, "CONTINUOUS"); g(70, 0); g(3, "Solid line"); g(72, 65); g(73, 0); g(40, "0.0");
  g(0, "ENDTAB");
  g(0, "TABLE"); g(2, "LAYER"); g(70, used.length);
  for (const [name, colour] of used) { g(0, "LAYER"); g(2, name); g(70, 0); g(62, colour); g(6, "CONTINUOUS"); }
  g(0, "ENDTAB");
  g(0, "TABLE"); g(2, "STYLE"); g(70, 1);
  g(0, "STYLE"); g(2, "STANDARD"); g(70, 0); g(40, "0.0"); g(41, "1.0"); g(50, "0.0"); g(71, 0); g(42, "2.5"); g(3, "txt"); g(4, "");
  g(0, "ENDTAB");
  g(0, "ENDSEC");

  g(0, "SECTION"); g(2, "BLOCKS"); g(0, "ENDSEC");

  g(0, "SECTION"); g(2, "ENTITIES");
  // Turning: clockwise on the page is clockwise in the file too. Mirrored, text still reads forwards, so it
  // turns the other way and runs back from where it started (lined up on its right instead of its left).
  const turn = (deg) => num((((mirror ? deg : -deg) % 360) + 360) % 360);
  for (const s of shapes) {
    if (s.circle) {
      g(0, "CIRCLE"); g(8, s.layer); xy(s.circle.x, s.circle.y); g(40, num(s.circle.r));
    } else if (s.poly) {
      // Every outline goes round clockwise as seen on the page, and so do its outward arcs; a clockwise
      // arc's bulge is negative. Mirrored, they go round the other way.
      const pts = s.poly.map((p) => ({ x: X(p.x), y: Y(p.y), b: p.b }));
      const sign = mirror ? 1 : -1;
      g(0, "POLYLINE"); g(8, s.layer); g(66, 1); g(10, "0"); g(20, "0"); g(30, "0"); g(70, 1);
      for (const p of pts) {
        g(0, "VERTEX"); g(8, s.layer); g(10, num(p.x)); g(20, num(p.y)); g(30, "0");
        if (p.b) g(42, num(sign * p.b));
      }
      g(0, "SEQEND"); g(8, s.layer);
    } else {
      g(0, "TEXT"); g(8, s.layer); xy(s.x, s.y); g(40, num(s.h)); g(1, txt(s.text));
      if (s.rot) g(50, turn(s.rot));
      // 72: left 0, centre 1, right 2; 73: baseline 0, middle 2. Anything but left on the baseline is
      // placed by the second point.
      const h = s.align === "middle" ? 1 : mirror ? 2 : 0, v = s.align === "baseline" ? 0 : 2;
      if (h || v) { g(72, h); g(73, v); xy(s.x, s.y, 1); }
    }
  }
  g(0, "ENDSEC");
  g(0, "EOF");
  return out.join("\r\n") + "\r\n";
}
