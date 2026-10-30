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
// They're American (AWG, US colours); a metric drawing gets them converted with convertWire.
const DEFAULT_PROFILES = [
  { id: "wp_24v", name: "+24 V DC", color: "#d32f2f", gauge: "16 AWG", conductor: "Stranded" },
  { id: "wp_0v", name: "0 V DC", color: "#1f63c6", gauge: "16 AWG", conductor: "Stranded" },
  { id: "wp_pe", name: "Ground (PE)", color: "#2e9b3c", gauge: "16 AWG", conductor: "Stranded" },
  { id: "wp_l", name: "AC hot (line)", color: "#1f1f1f", gauge: "16 AWG", conductor: "Stranded" },
  { id: "wp_n", name: "AC neutral", color: "#f2f2f2", gauge: "16 AWG", conductor: "Stranded" },
  { id: "wp_sig", name: "Control signal", color: "#7b3fb0", gauge: "18 AWG", conductor: "Stranded" },
];

// Cable profiles: named cable types (sheath colour, type, shield, twisted pairs) that cables can follow.
// A profile can list the cores it contains, in order ({ mark, color, stripe, gauge, conductor }): a cable
// following it gives its cores those looks, core 1 first. With no cores listed, its wires keep their own looks.
// The ready-made ones are in the cable library (cables.js); these help describe their cores.
const WHITE = "#f2f2f2";
const BLACK = "#1f1f1f";
const T568B = (gauge) => [["#ef7d00", true], ["#ef7d00"], ["#2e9b3c", true], ["#1f63c6"], ["#1f63c6", true], ["#2e9b3c"], ["#7a4a25", true], ["#7a4a25"]]
  .map(([c, striped], i) => ({ mark: String(i + 1), color: striped ? WHITE : c, stripe: striped ? c : "", gauge, conductor: "" }));
// Cores as [mark, colour, size]: numbered black cores, with green/yellow (unmarked) for earth.
const coreList = (list) => list.map(([mark, color, gauge]) => ({ mark, color, stripe: "", gauge, conductor: "Stranded" }));

// Copy a cable profile's properties onto a cable and remember which profile it follows.
function applyCableProfile(cb, p) {
  cb.profile = p.id;
  cb.color = p.color;
  cb.desc = p.desc;
  cb.shield = !!p.shield;
  cb.twisted = !!p.twisted;
}

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
  // Network and cable connectors: "port" terminals take a cable's plug rather than single wires.
  {
    id: "ethsw5", name: "Ethernet switch, 5-port", category: "Network", prefix: "SW",
    w: 52, h: 90, fill: "#3c4148", radius: 2, showName: true,
    terminals: [
      T("vp", "+V", 8, 6), T("vn", "0V", 16, 6), T("fe", "FE", 24, 6),
      ...[1, 2, 3, 4, 5].map((i) => ({ ...T("p" + i, "P" + i, 7 + (i - 1) * 9.5, 80), side: "bottom", kind: "port" })),
    ],
  },
  {
    id: "ethsw8", name: "Ethernet switch, 8-port", category: "Network", prefix: "SW",
    w: 84, h: 90, fill: "#3c4148", radius: 2, showName: true,
    terminals: [
      T("vp", "+V", 8, 6), T("vn", "0V", 16, 6), T("fe", "FE", 24, 6),
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ ...T("p" + i, "P" + i, 7 + (i - 1) * 10, 80), side: "bottom", kind: "port" })),
    ],
  },
  {
    id: "rj45ft", name: "RJ45 panel feed-through", category: "Network", prefix: "X", mount: "free",
    w: 18, h: 28, fill: "#5b6168", radius: 1.5, showName: false,
    terminals: [{ ...T("in", "IN", 9, 7), side: "top", kind: "port" }, { ...T("out", "OUT", 9, 21), side: "bottom", kind: "port" }],
  },
  {
    id: "connm23", name: "Motor connector, M23 panel socket", category: "Enclosure connectors", prefix: "X", mount: "free",
    w: 28, h: 30, fill: "#9aa3ad", radius: 3, showName: false,
    terminals: [
      { ...T("u", "U", 5, 4), side: "top" }, { ...T("v", "V", 11, 4), side: "top" }, { ...T("w", "W", 17, 4), side: "top" }, { ...T("pe", "PE", 23, 4), side: "top" },
      { ...T("plug", "PLUG", 14, 22), side: "bottom", kind: "port" },
    ],
  },
  {
    id: "motor3", name: "Motor, 3-phase (with connector)", category: "Field devices", prefix: "M", mount: "free",
    w: 40, h: 40, fill: "#4a6b8a", radius: 20, showName: false,
    terminals: [{ ...T("x1", "X1", 20, 7), side: "top", kind: "port" }],
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
  // D-sub 25 socket along the top; screw terminals along the bottom in two staggered rows at 5.08 mm pitch,
  // 1–13 in front and 14–25 behind, numbered like the socket's pins.
  {
    id: "db25fan", name: "D-sub 25 fan-out block", category: "Generic", prefix: "X",
    w: 70, h: 66, fill: "#5f8f6a", radius: 1.5, showName: true,
    terminals: [
      { ...T("d", "D25", 35, 7), side: "top", kind: "port" },
      ...Array.from({ length: 13 }, (_, i) => ({ ...T(String(i + 1), String(i + 1), +(4.52 + i * 5.08).toFixed(2), 60), side: "bottom" })),
      ...Array.from({ length: 12 }, (_, i) => ({ ...T(String(i + 14), String(i + 14), +(7.06 + i * 5.08).toFixed(2), 51), side: "bottom" })),
    ],
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
// Cable connectors (ports, e.g. an RJ45 socket) take a cable's plug, not single wires.
const isPort = (t) => t.kind === "port";

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
const TEMPLATE_PACKS = { connectors: ["conn2", "conn4", "conn8", "connm12"], plugs: ["plug3"], network: ["ethsw5", "ethsw8", "rj45ft", "connm23", "motor3"], breakout: ["db25fan"] };

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

// Every object type belongs to a named library, and the sidebar shows one library at a time.
// Built-in types go in "Built-in". The project library holds the types made or changed in the diagram:
// new types, duplicates, edited copies of types from other libraries, and any type with no library set.
// It used to be called "My types".
const BUILTIN_LIBRARY = "Built-in";
const PROJECT_LIBRARY = "This project";
const isBuiltinId = (id) => DEFAULT_TEMPLATES.some((x) => x.id === id);

// Bring a stored object type up to date (diagrams saved by older versions).
function upgradeTemplate(tpl) {
  applyDefaultLinks(tpl);
  applyDefaultSlots(tpl);
  tpl.library = String(tpl.library || "").trim() || (isBuiltinId(tpl.id) ? BUILTIN_LIBRARY : PROJECT_LIBRARY);
  if (tpl.library === "My types") tpl.library = PROJECT_LIBRARY;
}

DEFAULT_TEMPLATES.forEach(upgradeTemplate);

const DEFAULT_SETTINGS = {
  grid: 1,            // snap step in mm
  labelSize: 2,       // destination label text height in mm
  tagSize: 3,         // part tag text height in mm
  lines: "off",       // how wires are drawn: off (a stub at each terminal) | straight | curved (lines between terminals)
                      // (a wire can say otherwise with draw: "straight", "curved" or "break")
  cables: "full",     // how cables are drawn: full (the sheath runs end to end) | break (a short tail at each end)
  labelCable: false,  // the cable's name in its labels: along the sheath ("C1 · 3G1.5"), and at a break ("C1 → K1")
  wireLabels: true,   // where each wire goes, at its terminals ("→ TB101-1")
  labelName: "dest",  // what a named circuit's wire labels show: "dest" (where each goes, TB101-1) or "circuit" (+24V)
  labelWire: false,   // the wire's number in its labels too: in a stub's label ("W3 → TB101-1"), or at the middle of a line
  labelPage: true,    // a wire or cable label for an end on another page says which page: "TB101-1 (Door)"
  showDest: true,     // only read from older diagrams: false there means no wires shown
  showTermNames: true,
  snapEdges: true,
  direction: "ltr",   // ltr | rtl: which way strips grow when adding, repeating and packing
  termSep: "-",       // joins part tag and terminal name in references, e.g. TB101-1
  wireStd: "us",      // us | metric: wire sizes (mm² or AWG) and line / neutral / earth colours
  refStyle: "simple", // simple (K1, TB101-1) | iec: IEC 81346 reference designations (=PUMP+CAB1-K1:13)
  slack: 100,         // extra wire at each end, in mm, added to estimated lengths
  wireEnd: "ferrule", // how wire ends are finished unless their profile or the end says otherwise (WIRE_ENDS)
  strip: 10,          // strip length at each wire end, in mm, likewise
  ductFill: 60,       // fill wire ducts up to this percentage of their cross-section
  railHoles: 150,     // DIN rails' mounting holes in DXF drawings: no more than this far apart, in mm (0: none)
  railHoleD: 5.5,     // their diameter, in mm
  railHoleEnd: 15,    // the first and last this far from the rail's ends, in mm
};

// Paper sizes for printing, portrait, in mm. Each belongs to the American or metric standard, and other is
// its nearest size in the other standard, swapped in when the diagram's standard changes.
const PAPERS = {
  halfletter: { name: "Half Letter (5.5 × 8.5 in)", w: 139.7, h: 215.9, std: "us", other: "a5" },
  letter: { name: "Letter (8.5 × 11 in)", w: 215.9, h: 279.4, std: "us", other: "a4" },
  legal: { name: "Legal (8.5 × 14 in)", w: 215.9, h: 355.6, std: "us", other: "a4" },
  tabloid: { name: "Tabloid (11 × 17 in)", w: 279.4, h: 431.8, std: "us", other: "a3" },
  ansic: { name: "ANSI C (17 × 22 in)", w: 431.8, h: 558.8, std: "us", other: "a2" },
  a5: { name: "A5 (148 × 210 mm)", w: 148, h: 210, std: "metric", other: "halfletter" },
  a4: { name: "A4 (210 × 297 mm)", w: 210, h: 297, std: "metric", other: "letter" },
  a3: { name: "A3 (297 × 420 mm)", w: 297, h: 420, std: "metric", other: "tabloid" },
  a2: { name: "A2 (420 × 594 mm)", w: 420, h: 594, std: "metric", other: "ansic" },
};

// Print margins offered, in mm: quarter inches for American, round millimetres for metric.
const PRINT_MARGINS = { us: [6.35, 12.7, 19.05, 25.4], metric: [5, 10, 15, 20] };

const nearestMargin = (mm, std) => (PRINT_MARGINS[std] || PRINT_MARGINS.metric).reduce((b, v) => (Math.abs(v - mm) < Math.abs(b - mm) ? v : b));

// Print settings, saved with the diagram (settings.print). scale: "fit" (each page on one sheet), "shrink"
// (real size, shrunk to fit one sheet if need be), "width" (fitted to the paper's width) or "scale" (percent
// of real size); the last two go on over more sheets when a page doesn't fit. pages: "all", "current" or
// "none" (only the lists). orient: "auto" picks whichever takes fewer sheets, then prints bigger.
function printDefaults(std) {
  const us = std === "us";
  return {
    paper: us ? "letter" : "a4", orient: "auto", margin: us ? 12.7 : 10, scale: "fit", percent: 100, pages: "all",
    head: true, frame: false, wires: true, cables: true, buses: true, parts: true, strips: true, io: true, bom: true,
  };
}

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
    cableProfiles: [], // added from the cable library
    packs: Object.keys(TEMPLATE_PACKS),
  };
}

// The example diagram: a small 24 V control panel that uses most of what DIN Stack can draw.
function exampleProject() {
  const p = newProject();
  p.meta.title = "Example: 24 V control panel with UPS";
  p.meta.notes = "Mains comes in on J1 through F1 to the power supply PS1. The DC UPS UPS1 and battery GB1 keep 24 V up during a mains cut, and its alarm contact drives K1, which lights H1 on the door (page Door) through cable C3. Wires run in the ducts D1–D5; the BOM and Terminals tabs, and File → Export…, show what's worked out from the drawing.";
  // Two pages: the back plate inside the cabinet, and the door.
  p.pages = [{ id: "p1", name: "Cabinet", location: "CAB1" }, { id: "p2", name: "Door", location: "DOOR" }];
  p.page = "p1";
  // A project type: the door's pilot light isn't one of the built-in types.
  p.templates.push({
    id: "pilot22", name: "Pilot light, 22 mm", category: "Pilot lights", prefix: "H", mount: "free", library: PROJECT_LIBRARY,
    w: 30, h: 30, fill: "#f0c000", radius: 15, showName: false, cutout: { shape: "round", d: 22.3 },
    terminals: [{ ...T("x1", "X1", 9, 6), side: "top" }, { ...T("x2", "X2", 21, 6), side: "top" }],
  });
  p.settings.print = { ...printDefaults(p.settings.wireStd), head: false, frame: true, scale: "shrink" };
  const part = (id, tpl, tag, x, y, desc = "") => ({ id, kind: "part", tpl, tag, desc, x, y, rot: 0 });
  const onRail = (railY, h) => railY + 17.5 - h / 2; // top of a part h mm tall, centred on a 35 mm rail
  const A = 95, B = 290; // the two rails
  const duct = (id, label, x, y, length, vertical = false) => ({ id, kind: "duct", label, x, y, length, width: 40, depth: 60, vertical });
  const strip = (it, name) => Object.assign(it, { strip: name });
  p.items = [
    // The back plate goes first, so it's drawn under everything, then the ducts and rails.
    { id: "bp1", kind: "plate", name: "Back plate", x: 0, y: -10, w: 400, h: 435 },
    duct("d1", "D1", 50, 0, 300),
    duct("d2", "D2", 50, 195, 300),
    duct("d3", "D3", 50, 375, 300),
    duct("d4", "D4", 10, 0, 415, true),
    duct("d5", "D5", 350, 0, 415, true),
    { id: "r1", kind: "rail", x: 60, y: A, length: 270, height: 35 },
    { id: "r2", kind: "rail", x: 60, y: B, length: 110, height: 35 },
    // Rail 1: mains terminals (strip X1), breaker, power supply, UPS and the 24 V distribution strip (X2).
    strip(part("es1", "endstop", "", 64, onRail(A, 50)), "X1"),
    strip(part("x1", "tb2", "TB1", 73.5, onRail(A, 45), "L"), "X1"),
    strip(part("x2", "tb2blue", "TB2", 78.7, onRail(A, 45), "N"), "X1"),
    strip(part("x3", "tbpe", "TB3", 83.9, onRail(A, 45), "PE"), "X1"),
    strip(part("x4", "tbpe", "TB4", 89.1, onRail(A, 45), "PE"), "X1"),
    part("f1", "cb2", "F1", 94.3, onRail(A, 85), "Mains"),
    part("ps1", "psu", "PS1", 134, onRail(A, 90), "24 V DC 5 A"),
    part("ups1", "ups", "UPS1", 186, onRail(A, 90), "24 V DC UPS"),
    part("f2", "cb1", "F2", 242, onRail(A, 85), "24 V out"),
    strip(part("es2", "endstop", "", 260, onRail(A, 50)), "X2"),
    // Rail 2: network switch, alarm relay and the terminals for the cable to the door (strip X3).
    part("sw1", "ethsw5", "SW1", 64, onRail(B, 90), "Unmanaged"),
    part("k1", "relay", "K1", 116, onRail(B, 90), "UPS alarm"),
    strip(part("es4", "endstop", "", 132, onRail(B, 50)), "X3"),
    strip(part("x13", "tb2", "TB13", 141.5, onRail(B, 45)), "X3"),
    strip(part("x14", "tb2blue", "TB14", 146.7, onRail(B, 45)), "X3"),
    strip(part("es5", "endstop", "", 151.9, onRail(B, 50)), "X3"),
    // Loose parts: the battery on the back plate, and connectors on the bottom of the enclosure.
    part("gb1", "battery", "GB1", 180, 275, "12 V 7 Ah ×2"),
    part("xm", "plug3", "J1", 110, 440, "Mains in"),
    part("xn", "rj45ft", "J2", 62, 435, "Service port"),
    { id: "t2", kind: "text", x: 180, y: 348, text: "K1 picks up when UPS1 is running on battery\nand lights H1 on the door.", size: 2.5 },
    // The door: the pilot light, wired from strip X3 through cable C3.
    { ...part("h1", "pilot22", "H1", 60, 40, "UPS on battery"), page: "p2" },
    { id: "t3", kind: "text", x: 45, y: 78, text: "Inside of the door", size: 3.5, bold: true, page: "p2" },
    { id: "t4", kind: "text", x: 45, y: 85, text: "H1 lights while the UPS runs on battery.\nCable C3 comes from strip X3 on the Cabinet page;\nthe labels say which page the other ends are on.", size: 2.5, page: "p2" },
  ];
  // The distribution strip: +24 V and 0 V blocks in turn, between end stops.
  for (let i = 0; i < 8; i++) p.items.push(strip(part("x" + (i + 5), i % 2 ? "tb2blue" : "tb2", "TB" + (i + 5), 269.5 + i * 5.2, onRail(A, 45)), "X2"));
  p.items.push(strip(part("es3", "endstop", "", 269.5 + 8 * 5.2, onRail(A, 50)), "X2"));
  // A group note: a bracket under the distribution strip's blocks, with a line to the note.
  p.items.push({ id: "t1", kind: "text", x: 268, y: 165, text: "24 V distribution, strip X2\n+24 V on the grey blocks (bus bar BB1)\n0 V on the blue blocks (bus bar BB2)", size: 2.5,
    links: ["x5", "x6", "x7", "x8", "x9", "x10", "x11", "x12"], gap: 22 });

  const prof = (id) => p.wireProfiles.find((x) => x.id === id);
  let n = 0;
  const w = (a, at, b, bt, profile, extra) => {
    const c = { id: "c" + ++n, a: { item: a, term: at }, b: { item: b, term: bt }, wire: "W" + n, notes: "" };
    if (typeof profile === "string") applyProfile(c, prof(profile));
    else Object.assign(c, { profile: "", stripe: "", conductor: "Stranded" }, profile);
    return Object.assign(c, extra);
  };
  p.connections = [
    // Mains in, through cable C1 from the plug X1 to the mains terminals.
    w("xm", "l", "x1", "b", "wp_l"),
    w("xm", "n", "x2", "b", "wp_n"),
    w("xm", "pe", "x3", "b", "wp_pe"),
    // Mains terminals to the breaker and power supply; TB4 takes the switch's functional earth.
    w("x1", "a", "f1", "a", "wp_l"),
    w("x2", "a", "f1", "c", "wp_n"),
    w("x3", "a", "ps1", "pe", "wp_pe"),
    w("x4", "b", "sw1", "fe", "wp_pe"),
    w("f1", "b", "ps1", "l", "wp_l"),
    w("f1", "d", "ps1", "n", "wp_n"),
    // Power supply to UPS.
    w("ps1", "v1", "ups1", "ip", "wp_24v"),
    w("ps1", "g1", "ups1", "in", "wp_0v"),
    // Battery: heavier wires, drawn as lines, with ring lugs on the battery's posts.
    w("gb1", "p", "ups1", "bp", { color: "#d32f2f", gauge: "14 AWG" }, { draw: "straight", endA: "ring", stripA: 8 }),
    w("gb1", "n", "ups1", "bn", { color: "#1f1f1f", gauge: "14 AWG" }, { draw: "straight", endA: "ring", stripA: 8 }),
    // UPS output, through F2, to the distribution strip.
    w("ups1", "op", "f2", "a", "wp_24v", { circuit: "+24V" }),
    w("f2", "b", "x5", "a", "wp_24v"),
    w("ups1", "on", "x6", "a", "wp_0v", { circuit: "0V" }),
    // Switch supply.
    w("x7", "b", "sw1", "vp", "wp_24v"),
    w("x8", "b", "sw1", "vn", "wp_0v"),
    // UPS alarm contact switches K1's coil.
    w("x9", "b", "ups1", "com", "wp_24v"),
    w("ups1", "alm", "k1", "a1", "wp_sig", { circuit: "UPS alarm" }),
    w("k1", "a2", "x10", "b", "wp_0v"),
    // K1's contact switches the beacon, through TB13 and TB14 to cable C3.
    w("x11", "b", "k1", "c", "wp_24v"),
    w("k1", "no", "x13", "a", "wp_sig", { circuit: "Beacon" }),
    w("x12", "b", "x14", "a", "wp_0v"),
  ];
  const byWire = (...ids) => ids.map((k) => "c" + k);

  // The pilot light's cable, from strip X3 to H1 on the door page.
  const core = (item, term, to) => ({ id: "c" + ++n, a: { item, term }, b: { item: "h1", term: to }, wire: "W" + n, notes: "" });
  const beacon = [core("x13", "b", "x1"), core("x14", "b", "x2")];
  p.connections.push(...beacon);

  // Cable types from the cable library. A cable's cores take the looks its type lists, core 1 first,
  // as when a cable profile is picked in the app.
  p.cableProfiles = ["cp_mains", "cp_cat6", "cp_dc2"].map((id) => {
    const { category, ...cp } = JSON.parse(JSON.stringify(CABLE_LIBRARY.find((x) => x.id === id)));
    return cp;
  });
  const cable = (id, label, profile, extra) => {
    const cb = { id, label, to: "", notes: "", open: false, wires: [], pa: null, pb: null, ...extra };
    const cp = p.cableProfiles.find((x) => x.id === profile);
    applyCableProfile(cb, cp);
    cb.wires.map((wid) => p.connections.find((c) => c.id === wid)).forEach((c, i) => {
      const k = cp.cores[i];
      Object.assign(c, { profile: "", color: k.color, stripe: k.stripe || "", gauge: k.gauge || "", conductor: k.conductor || "", follow: false, fromCable: true });
      if (k.mark) c.mark = k.mark;
    });
    return cb;
  };
  p.cables = [
    // Mains cable from the plug, drawn broken: a tail at each end says where the other end goes. It's routed
    // up the side duct D4, away from the 24 V wiring.
    cable("cab1", "C1", "cp_mains", { wires: byWire(1, 2, 3), draw: "break", via: ["d4"] }),
    // Patch lead from switch port 1 to the service port on the enclosure.
    cable("cab2", "C2", "cp_cat6", { open: true, portA: { item: "sw1", term: "p1" }, portB: { item: "xn", term: "in" } }),
    // Two cores to the pilot light on the door. Its ends are on different pages, so its length is typed in (m).
    cable("cab3", "C3", "cp_dc2", { wires: beacon.map((c) => c.id), length: 1.5 }),
  ];
  // Bill of materials lines for what isn't drawn.
  p.bomExtra = [
    { qty: 1, maker: "", no: "", desc: "Enclosure, 16 × 20 × 8 in, with back plate" },
    { qty: 1, maker: "", no: "", desc: "Cable gland, ½ in NPT, for C1" },
  ];

  // Bus bars along the strips, named for their circuits.
  const bus = (id, label, color, term, items, circuit) => ({ id, label, color, notes: "", follow: false, circuit, terms: items.map((item) => ({ item, term })) });
  p.buses = [
    bus("bb1", "BB1", "#d32f2f", "s1", ["x5", "x7", "x9", "x11"], "+24V"),
    bus("bb2", "BB2", "#1f63c6", "s2", ["x6", "x8", "x10", "x12"], "0V"),
    bus("bb3", "BB3", "#2e9b3c", "s1", ["x3", "x4"], "PE"),
  ];
  return p;
}
