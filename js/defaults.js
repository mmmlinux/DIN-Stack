// Built-in data: wire colours, gauges, starter object types and the example project.

const WIRE_COLORS = [
  { name: "Black", value: "#1f1f1f" },
  { name: "Red", value: "#d32f2f" },
  { name: "Blue", value: "#1f63c6" },
  { name: "Dark blue", value: "#123a7a" },
  { name: "Brown", value: "#7a4a25" },
  { name: "Grey", value: "#8a8f96" },
  { name: "White", value: "#f2f2f2" },
  { name: "Orange", value: "#ef7d00" },
  { name: "Yellow", value: "#f0c000" },
  { name: "Green", value: "#2e9b3c" },
  { name: "Violet", value: "#7b3fb0" },
  { name: "Pink", value: "#e46aa6" },
  { name: "Green/Yellow", value: "gy" },
  { name: "Copper", value: "#b87333" },
];

// Wire standards. Metric uses mm² sizes and IEC colours (brown line, blue neutral, green/yellow earth);
// American uses AWG sizes and US colours (black line, white neutral, green ground).
const WIRE_STANDARDS = {
  metric: {
    name: "Metric — mm², IEC colours", unit: "mm²", example: "1.5 mm²",
    sizes: [0.14, 0.25, 0.34, 0.5, 0.75, 1, 1.5, 2.5, 4, 6, 10, 16, 25],
    colors: { L: "#7a4a25", N: "#123a7a", PE: "gy" },
    names: { wp_l: "AC line", wp_n: "AC neutral", wp_pe: "Protective earth" },
  },
  us: {
    name: "American — AWG, US colours", unit: "AWG", example: "16 AWG",
    sizes: [26, 24, 22, 20, 18, 16, 14, 12, 10, 8, 6, 4, 2],
    colors: { L: "#1f1f1f", N: "#f2f2f2", PE: "#2e9b3c" },
    names: { wp_l: "AC hot (line)", wp_n: "AC neutral", wp_pe: "Ground (PE)" },
  },
};

const wireStd = (id) => WIRE_STANDARDS[id] || WIRE_STANDARDS.metric;
const awgArea = (n) => Math.PI / 4 * (0.127 * Math.pow(92, (36 - n) / 39)) ** 2;
const sizeLabel = (std, v) => v + " " + wireStd(std).unit;
const wireGauges = (std) => wireStd(std).sizes.map((v) => sizeLabel(std, v));

// Read "1.5 mm²" or "16 AWG" as { std, area in mm² }; null for anything else.
function parseGauge(g) {
  const s = String(g || "").trim();
  let m = /^(\d*\.?\d+)\s*(mm²|mm2|mm\^2|sq\.?\s*mm)$/i.exec(s);
  if (m) return { std: "metric", area: parseFloat(m[1]) };
  m = /^#?(\d+)\s*(awg|ga)$/i.exec(s);
  if (m) return { std: "us", area: awgArea(parseInt(m[1], 10)) };
  return null;
}

// The nearest standard size in the other system; sizes already in that system, or not recognised, stay as they are.
function convertGauge(g, std) {
  const p = parseGauge(g);
  if (!p || p.std === std) return g;
  const area = (v) => (std === "us" ? awgArea(v) : v);
  let best = null, bestD = Infinity;
  for (const v of wireStd(std).sizes) {
    const d = Math.abs(Math.log(area(v) / p.area));
    if (d < bestD) { best = v; bestD = d; }
  }
  return sizeLabel(std, best);
}

// The circuit role a profile stands for (line, neutral or earth), from its starter id or its name.
function profileRole(p) {
  const fixed = { wp_l: "L", wp_n: "N", wp_pe: "PE" }[p.id];
  if (fixed) return fixed;
  if (/neutral/i.test(p.name)) return "N";
  if (/(earth|ground|gnd|pe)/i.test(p.name)) return "PE";
  if (/(line|live|hot|phase)/i.test(p.name)) return "L";
  return null;
}

// Move a wire or profile from one standard to another. The size goes to the nearest equivalent, and a
// line, neutral or earth colour changes to the other standard's colour (other colours are left alone).
// The previous size is remembered, so switching back restores it exactly rather than rounding twice.
function convertWire(o, role, from, to) {
  const g = o.sizeWas && o.sizeWas.to === o.gauge ? o.sizeWas.from : convertGauge(o.gauge, to);
  if (g !== o.gauge) { o.sizeWas = { from: o.gauge, to: g }; o.gauge = g; }
  if (role && o.color === wireStd(from).colors[role]) o.color = wireStd(to).colors[role];
  const names = wireStd(from).names;
  if (names[o.id] && o.name === names[o.id]) o.name = wireStd(to).names[o.id];
}

const CONDUCTORS = ["Stranded", "Solid"];

// Starter wire profiles: named presets of colour, size and conductor that wires can be assigned to.
const DEFAULT_PROFILES = [
  { id: "wp_24v", name: "+24 V DC", color: "#d32f2f", gauge: "1.5 mm²", conductor: "Stranded" },
  { id: "wp_0v", name: "0 V DC", color: "#1f63c6", gauge: "1.5 mm²", conductor: "Stranded" },
  { id: "wp_pe", name: "Protective earth", color: "gy", gauge: "1.5 mm²", conductor: "Stranded" },
  { id: "wp_l", name: "AC line", color: "#7a4a25", gauge: "1.5 mm²", conductor: "Stranded" },
  { id: "wp_n", name: "AC neutral", color: "#123a7a", gauge: "1.5 mm²", conductor: "Stranded" },
  { id: "wp_sig", name: "Control signal", color: "#7b3fb0", gauge: "0.75 mm²", conductor: "Stranded" },
];

// Copy a profile's properties onto a wire and remember which profile it follows.
function applyProfile(conn, p) {
  conn.profile = p.id;
  conn.color = p.color;
  conn.stripe = p.stripe || "";
  conn.gauge = p.gauge;
  conn.conductor = p.conductor;
}

function T(id, name, x, y) { return { id, name, x, y, side: "auto" }; }

const DEFAULT_TEMPLATES = [
  {
    id: "tb2", name: "Terminal block, 2-wire", category: "Terminal blocks", prefix: "TB",
    w: 5.2, h: 45, fill: "#c3c8ce", radius: 0.5, showName: false,
    terminals: [T("a", "1", 2.6, 5), T("b", "2", 2.6, 40)],
  },
  {
    id: "tb2blue", name: "Terminal block, 2-wire (blue)", category: "Terminal blocks", prefix: "TB",
    w: 5.2, h: 45, fill: "#7fb2e0", radius: 0.5, showName: false,
    terminals: [T("a", "1", 2.6, 5), T("b", "2", 2.6, 40)],
  },
  {
    id: "tbpe", name: "Ground terminal block (PE)", category: "Terminal blocks", prefix: "TB",
    w: 5.2, h: 45, fill: "#b5d86a", radius: 0.5, showName: false,
    terminals: [T("a", "1", 2.6, 5), T("b", "2", 2.6, 40)],
  },
  {
    id: "tb4", name: "Terminal block, 4-wire", category: "Terminal blocks", prefix: "TB",
    w: 5.2, h: 60, fill: "#c3c8ce", radius: 0.5, showName: false,
    terminals: [T("a", "1", 2.6, 4.5), T("b", "2", 2.6, 11.5), T("c", "3", 2.6, 48.5), T("d", "4", 2.6, 55.5)],
  },
  {
    id: "tbfuse", name: "Fuse terminal block", category: "Terminal blocks", prefix: "F",
    w: 8.2, h: 72, fill: "#4b5058", radius: 0.6, showName: false,
    terminals: [T("a", "1", 4.1, 5), T("b", "2", 4.1, 67)],
  },
  {
    id: "endstop", name: "End stop", category: "Terminal blocks", prefix: "",
    w: 9.5, h: 50, fill: "#3f444b", radius: 0.8, showName: false, terminals: [],
  },
  {
    id: "psu", name: "Power supply", category: "Power", prefix: "PS",
    w: 52, h: 90, fill: "#e6e8eb", radius: 2, showName: true,
    terminals: [
      T("v1", "+V", 8, 6), T("v2", "+V", 17, 6), T("g1", "-V", 26, 6), T("g2", "-V", 35, 6),
      T("l", "L", 8, 84), T("n", "N", 17, 84), T("pe", "PE", 26, 84),
    ],
  },
  {
    id: "ups", name: "DC UPS / battery backup", category: "Power", prefix: "UPS",
    w: 52, h: 90, fill: "#e6e8eb", radius: 2, showName: true,
    terminals: [
      T("op", "+OUT", 8, 6), T("on", "-OUT", 17, 6), T("alm", "ALM", 30, 6), T("com", "COM", 39, 6),
      T("ip", "+IN", 8, 84), T("in", "-IN", 17, 84), T("bp", "+BAT", 30, 84), T("bn", "-BAT", 39, 84),
    ],
  },
  {
    id: "battery", name: "Battery", category: "Power", prefix: "GB",
    w: 150, h: 65, fill: "#3a3f46", radius: 3, showName: true,
    terminals: [{ ...T("p", "+", 20, 8), side: "top" }, { ...T("n", "-", 130, 8), side: "top" }],
  },
  {
    id: "cb1", name: "Circuit breaker, 1-pole", category: "Protection", prefix: "F",
    w: 18, h: 85, fill: "#f4f4f4", radius: 1.5, showName: false,
    terminals: [T("a", "1", 9, 6), T("b", "2", 9, 79)],
  },
  {
    id: "cb2", name: "Circuit breaker, 2-pole", category: "Protection", prefix: "F",
    w: 36, h: 85, fill: "#f4f4f4", radius: 1.5, showName: false,
    terminals: [T("a", "1", 9, 6), T("c", "3", 27, 6), T("b", "2", 9, 79), T("d", "4", 27, 79)],
  },
  {
    id: "relay", name: "Relay module", category: "Control", prefix: "K",
    w: 16, h: 90, fill: "#e9e3c9", radius: 1.5, showName: false,
    terminals: [T("a1", "A1", 4.5, 6), T("a2", "A2", 11.5, 6), T("c", "11", 3, 84), T("nc", "12", 8, 84), T("no", "14", 13, 84)],
  },
  // Loose connectors: mounted on the enclosure rather than a rail, so they don't snap onto rails.
  {
    id: "conn2", name: "Panel connector, 2-pin", category: "Enclosure connectors", prefix: "X", mount: "free",
    w: 12, h: 16, fill: "#5b6168", radius: 1.5, showName: false,
    terminals: [{ ...T("1", "1", 3.5, 3.5), side: "top" }, { ...T("2", "2", 8.5, 3.5), side: "top" }],
  },
  {
    id: "conn4", name: "Panel connector, 4-pin", category: "Enclosure connectors", prefix: "X", mount: "free",
    w: 22, h: 16, fill: "#5b6168", radius: 1.5, showName: false,
    terminals: ["1", "2", "3", "4"].map((p, i) => ({ ...T(p, p, 3.5 + i * 5, 3.5), side: "top" })),
  },
  {
    id: "conn8", name: "Panel connector, 8-pin", category: "Enclosure connectors", prefix: "X", mount: "free",
    w: 42, h: 16, fill: "#5b6168", radius: 1.5, showName: false,
    terminals: ["1", "2", "3", "4", "5", "6", "7", "8"].map((p, i) => ({ ...T(p, p, 3.5 + i * 5, 3.5), side: "top" })),
  },
  {
    id: "connm12", name: "Circular connector, M12 4-pin", category: "Enclosure connectors", prefix: "X", mount: "free",
    w: 16, h: 16, fill: "#9aa3ad", radius: 8, showName: false,
    terminals: [
      { ...T("1", "1", 4.5, 4.5), side: "top" }, { ...T("2", "2", 11.5, 4.5), side: "top" },
      { ...T("3", "3", 11.5, 11.5), side: "bottom" }, { ...T("4", "4", 4.5, 11.5), side: "bottom" },
    ],
  },
  {
    id: "plug3", name: "Mains plug (L, N, PE)", category: "Enclosure connectors", prefix: "X", mount: "free",
    w: 22, h: 14, fill: "#2b2f35", radius: 4, showName: false,
    terminals: [{ ...T("l", "L", 5, 3.5), side: "top" }, { ...T("n", "N", 11, 3.5), side: "top" }, { ...T("pe", "PE", 17, 3.5), side: "top" }],
  },
  {
    id: "mod8", name: "Generic module, 4+4", category: "Generic", prefix: "A",
    w: 36, h: 90, fill: "#dfe6ee", radius: 1.5, showName: true,
    terminals: [
      T("1", "1", 6, 6), T("2", "2", 14, 6), T("3", "3", 22, 6), T("4", "4", 30, 6),
      T("5", "5", 6, 84), T("6", "6", 14, 84), T("7", "7", 22, 84), T("8", "8", 30, 84),
    ],
  },
  {
    id: "box4", name: "Generic box, side terminals", category: "Generic", prefix: "A",
    w: 60, h: 40, fill: "#eef0f3", radius: 2, showName: true,
    terminals: [T("1", "1", 4, 12), T("2", "2", 4, 28), T("3", "3", 56, 12), T("4", "4", 56, 28)],
  },
];

// Terminals sharing a link value are connected inside the part, e.g. both sides of a terminal block.
const DEFAULT_LINKS = {
  tb2: { a: "1", b: "1" },
  tb2blue: { a: "1", b: "1" },
  tbpe: { a: "1", b: "1" },
  tb4: { a: "1", b: "1", c: "1", d: "1" },
  tbfuse: { a: "1", b: "1" },
  psu: { v1: "+V", v2: "+V", g1: "-V", g2: "-V" },
  cb1: { a: "1", b: "1" },
  cb2: { a: "1", b: "1", c: "2", d: "2" },
};

// Give a built-in type its default links, unless it already has link settings of its own.
function applyDefaultLinks(tpl) {
  const links = DEFAULT_LINKS[tpl.id];
  if (!links || tpl.terminals.some((t) => "link" in t)) return;
  for (const t of tpl.terminals) t.link = links[t.id] || "";
}

// Bus bar slots: points on a part that take a bus bar (jumper) but not a wire. Built-in terminal
// blocks have two in the middle, so two bars can bridge alternate blocks, e.g. +24 V and 0 V.
const DEFAULT_SLOTS = {
  tb2: [19.5, 25.5],
  tb2blue: [19.5, 25.5],
  tbpe: [19.5, 25.5],
  tb4: [27, 33],
};

const isSlot = (t) => t.kind === "bus";

// Give a built-in terminal block its bus bar slots, unless its terminals already say what kind they are
// (so slots someone deleted in the designer don't come back).
function applyDefaultSlots(tpl) {
  const ys = DEFAULT_SLOTS[tpl.id];
  if (!ys || tpl.terminals.some((t) => "kind" in t)) return;
  for (const t of tpl.terminals) t.kind = "wire";
  const link = tpl.terminals.find((t) => t.link)?.link || "";
  ys.forEach((y, i) => {
    if (tpl.terminals.some((t) => t.id === "s" + (i + 1))) return;
    tpl.terminals.push({ id: "s" + (i + 1), name: "B" + (i + 1), x: tpl.w / 2, y, side: "auto", link, kind: "bus" });
  });
}

// Built-in types added after the first version, by batch. A diagram saved before a batch existed gets
// its types once (recorded in doc.packs), so deleting one of them later doesn't bring it back.
const TEMPLATE_PACKS = { connectors: ["conn2", "conn4", "conn8", "connm12"], plugs: ["plug3"] };

function addTemplatePacks(d) {
  d.packs = Array.isArray(d.packs) ? d.packs : [];
  for (const [pack, ids] of Object.entries(TEMPLATE_PACKS)) {
    if (d.packs.includes(pack)) continue;
    for (const id of ids) {
      const t = DEFAULT_TEMPLATES.find((x) => x.id === id);
      if (t && !d.templates.some((x) => x.id === id)) d.templates.push(JSON.parse(JSON.stringify(t)));
    }
    d.packs.push(pack);
  }
}

// Loose parts (enclosure connectors and the like) aren't mounted on a DIN rail.
const isLoose = (tpl) => !!tpl && tpl.mount === "free";

// Bring a stored object type up to date (diagrams saved by older versions).
function upgradeTemplate(tpl) {
  applyDefaultLinks(tpl);
  applyDefaultSlots(tpl);
}

DEFAULT_TEMPLATES.forEach(upgradeTemplate);

const DEFAULT_SETTINGS = {
  grid: 1,            // snap step in mm
  labelSize: 2,       // destination label text height in mm
  tagSize: 3,         // part tag text height in mm
  lines: "off",       // off | straight | curved
  showDest: true,     // destination labels at terminals
  showTermNames: true,
  snapEdges: true,
  direction: "ltr",   // ltr | rtl: which way strips grow when adding, repeating and packing
  termSep: "-",       // joins part tag and terminal name in references, e.g. TB101-1
  wireStd: "metric",  // metric | us: wire sizes (mm² or AWG) and line / neutral / earth colours
};

function newProject(templates) {
  return {
    schema: 1,
    meta: { title: "Untitled diagram", author: "", revision: "A", date: new Date().toISOString().slice(0, 10), notes: "" },
    settings: { ...DEFAULT_SETTINGS },
    templates: JSON.parse(JSON.stringify(templates || DEFAULT_TEMPLATES)),
    items: [{ id: "r1", kind: "rail", x: 10, y: 40, length: 300, height: 35 }],
    connections: [],
    buses: [],
    wireProfiles: JSON.parse(JSON.stringify(DEFAULT_PROFILES)),
    packs: Object.keys(TEMPLATE_PACKS),
  };
}

function exampleProject() {
  const p = newProject();
  p.meta.title = "Example: 24 V supply with battery backup";
  p.items = [
    { id: "r1", kind: "rail", x: 10, y: 40, length: 250, height: 35 },
    { id: "f1", kind: "part", tpl: "cb1", tag: "F1", desc: "", x: 14, y: 15, rot: 0 },
    { id: "ps1", kind: "part", tpl: "psu", tag: "PS1", desc: "24 V DC 5 A", x: 36, y: 12.5, rot: 0 },
    { id: "ups1", kind: "part", tpl: "ups", tag: "UPS1", desc: "24 V DC UPS", x: 92, y: 12.5, rot: 0 },
    { id: "es1", kind: "part", tpl: "endstop", tag: "", desc: "", x: 150, y: 32.5, rot: 0 },
    { id: "gb1", kind: "part", tpl: "battery", tag: "GB1", desc: "12 V 7 Ah ×2", x: 40, y: 130, rot: 0 },
    { id: "k1", kind: "part", tpl: "relay", tag: "K1", desc: "", x: 210, y: 12.5, rot: 0 },
    { id: "t1", kind: "text", x: 230, y: 108, text: "Terminal strip TB101–TB107\n+24 V on TB101, 103, 105 (bus bar BB1)\n0 V on TB102, 104, 106 (bus bar BB2)", size: 3 },
  ];
  for (let i = 0; i < 7; i++) {
    p.items.push({
      id: "x" + (i + 1), kind: "part", tpl: i === 6 ? "tbpe" : i % 2 ? "tb2blue" : "tb2",
      tag: "TB" + (101 + i), desc: "", x: 159.5 + i * 5.2, y: 35, rot: 0,
    });
  }
  p.items.push({ id: "es2", kind: "part", tpl: "endstop", tag: "", desc: "", x: 159.5 + 7 * 5.2, y: 32.5, rot: 0 });
  const c = (id, a, at, b, bt, wire, color, gauge) => ({ id, a: { item: a, term: at }, b: { item: b, term: bt }, wire, color, gauge, notes: "" });
  p.connections = [
    c("c1", "f1", "b", "ps1", "l", "W1", "#7a4a25", "1.5 mm²"),
    c("c2", "ps1", "v1", "ups1", "ip", "W2", "#d32f2f", "1.5 mm²"),
    c("c3", "ps1", "g1", "ups1", "in", "W3", "#1f63c6", "1.5 mm²"),
    c("c4", "gb1", "p", "ups1", "bp", "W4", "#d32f2f", "2.5 mm²"),
    c("c5", "gb1", "n", "ups1", "bn", "W5", "#1f1f1f", "2.5 mm²"),
    c("c6", "ups1", "op", "x1", "a", "W6", "#d32f2f", "1.5 mm²"),
    c("c7", "ups1", "on", "x2", "a", "W7", "#1f63c6", "1.5 mm²"),
    c("c8", "x1", "b", "k1", "a1", "W8", "#d32f2f", "0.75 mm²"),
    c("c9", "x2", "b", "k1", "a2", "W9", "#1f63c6", "0.75 mm²"),
    c("c10", "ps1", "pe", "x7", "a", "W10", "gy", "1.5 mm²"),
  ];
  const prof = { c1: "wp_l", c2: "wp_24v", c3: "wp_0v", c6: "wp_24v", c7: "wp_0v", c10: "wp_pe" };
  for (const c of p.connections) {
    const pr = prof[c.id] && p.wireProfiles.find((x) => x.id === prof[c.id]);
    if (pr) applyProfile(c, pr); else c.conductor = "Stranded";
  }
  // Named circuits, and connector labels for the incoming supply instead of wires from elsewhere.
  p.connections.find((x) => x.id === "c6").circuit = "+24V";
  p.connections.find((x) => x.id === "c7").circuit = "0V";
  p.items.find((x) => x.id === "f1").termLabels = { a: "L1" };
  p.items.find((x) => x.id === "ps1").termLabels = { n: "N" };
  // Two bars in the blocks' bus bar slots bridge alternate blocks: +24 V in slot 1, 0 V in slot 2.
  const bus = (id, label, color, term, items) => ({ id, label, color, notes: "", terms: items.map((item) => ({ item, term })) });
  p.buses = [
    bus("bb1", "BB1", "#d32f2f", "s1", ["x1", "x3", "x5"]),
    bus("bb2", "BB2", "#1f63c6", "s2", ["x2", "x4", "x6"]),
  ];
  return p;
}
