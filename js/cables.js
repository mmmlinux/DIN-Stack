// The cable library: ready-made cable types, built in so it works offline. A drawing has its own cable
// profiles, added from here (or made from scratch); each one added keeps the library's id, so the library
// can tell which are in the drawing and whether its copy has changed. Entries are cable profiles
// ({ id, name, color, desc, shield, twisted, notes, cores }) with a category to group them by.
// Core sizes are in AWG; a drawing in metric gets them converted to the nearest mm² size when it adds one.

const GREY = "#8a8f96";
const BROWN = "#7a4a25";
const BLUE = "#1f63c6";
const COPPER = "#b87333";
const RED = "#d32f2f";
const GREEN = "#2e9b3c";
// Cores as [colour, size] or [colour, size, mark], all with the same conductor.
const libCores = (conductor, list) => list.map(([color, gauge, mark]) => ({ mark: mark || "", color, stripe: "", gauge, conductor }));
// DIN 47100 core colours, used on LiYY and LiYCY data and control cables: white, brown, green, yellow…
const DIN47100 = ["#f2f2f2", BROWN, "#2e9b3c", "#f0c000", GREY, "#e46aa6", BLUE, "#d32f2f", "#1f1f1f", "#7b3fb0"];
const din47100 = (n, gauge) => libCores("Stranded", DIN47100.slice(0, n).map((c) => [c, gauge]));
// Numbered black cores 1…n, then a green/yellow earth.
const numberedCores = (n, gauge) => libCores("Stranded", Array.from({ length: n }, (_, i) => [BLACK, gauge, String(i + 1)]).concat([["gy", gauge]]));

const CABLE_LIBRARY = [
  // Ethernet
  { category: "Ethernet", id: "cp_cat5e", name: "Ethernet, Cat5e", color: GREY, desc: "Cat5e U/UTP 4×2×AWG24", shield: false, twisted: true, notes: "Cores in T568B order", cores: T568B("24 AWG") },
  { category: "Ethernet", id: "cp_cat6", name: "Ethernet, Cat6", color: BLUE, desc: "Cat6 U/UTP 4×2×AWG24", shield: false, twisted: true, notes: "Cores in T568B order", cores: T568B("24 AWG") },
  { category: "Ethernet", id: "cp_ie", name: "Industrial Ethernet, shielded", color: "#2e9b3c", desc: "Cat6A S/FTP 4×2×AWG26", shield: true, twisted: true, notes: "Cores in T568B order", cores: T568B("26 AWG") },
  { category: "Ethernet", id: "cp_profinet", name: "PROFINET Type A", color: "#2e9b3c", desc: "2×2×AWG22 star quad, solid", shield: true, twisted: true, notes: "Yellow TD+, orange TD−, white RD+, blue RD− (RJ45 pins 1, 2, 3, 6)",
    cores: libCores("Solid", [["#f0c000", "22 AWG"], ["#ef7d00", "22 AWG"], [WHITE, "22 AWG"], [BLUE, "22 AWG"]]) },

  // Fieldbus and serial
  { category: "Fieldbus and serial", id: "cp_profibus", name: "PROFIBUS DP", color: "#7b3fb0", desc: "1×2×AWG22, solid", shield: true, twisted: true, notes: "Red B, green A",
    cores: libCores("Solid", [["#d32f2f", "22 AWG"], ["#2e9b3c", "22 AWG"]]) },
  { category: "Fieldbus and serial", id: "cp_devicenet", name: "DeviceNet / CANopen, thin", color: GREY, desc: "Thin cable, 2 pairs + drain", shield: true, twisted: true, notes: "White CAN_H, blue CAN_L, red V+, black V−, bare drain",
    cores: libCores("Stranded", [[WHITE, "24 AWG"], [BLUE, "24 AWG"], ["#d32f2f", "22 AWG"], [BLACK, "22 AWG"], [COPPER, "24 AWG"]]) },
  { category: "Fieldbus and serial", id: "cp_rs485", name: "RS-485 / Modbus, 2 pairs", color: GREY, desc: "2×2×AWG24, shielded", shield: true, twisted: true, notes: "Pairs white/brown and green/yellow (DIN 47100)", cores: din47100(4, "24 AWG") },

  // Sensors and actuators
  { category: "Sensors and actuators", id: "cp_m8_3", name: "M8 sensor cable, 3-pin", color: BLACK, desc: "PUR 3×AWG24", shield: false, twisted: false, notes: "Pin 1 brown, 3 blue, 4 black",
    cores: libCores("Stranded", [[BROWN, "24 AWG", "1"], [BLUE, "24 AWG", "3"], [BLACK, "24 AWG", "4"]]) },
  { category: "Sensors and actuators", id: "cp_m12_4", name: "M12 sensor cable, 4-pin", color: BLACK, desc: "PUR 4×AWG22", shield: false, twisted: false, notes: "Pin 1 brown, 2 white, 3 blue, 4 black",
    cores: libCores("Stranded", [[BROWN, "22 AWG", "1"], [WHITE, "22 AWG", "2"], [BLUE, "22 AWG", "3"], [BLACK, "22 AWG", "4"]]) },
  { category: "Sensors and actuators", id: "cp_m12_5", name: "M12 sensor cable, 5-pin", color: BLACK, desc: "PUR 5×AWG22", shield: false, twisted: false, notes: "Pin 1 brown, 2 white, 3 blue, 4 black, 5 grey",
    cores: libCores("Stranded", [[BROWN, "22 AWG", "1"], [WHITE, "22 AWG", "2"], [BLUE, "22 AWG", "3"], [BLACK, "22 AWG", "4"], [GREY, "22 AWG", "5"]]) },
  { category: "Sensors and actuators", id: "cp_m12_8", name: "M12 sensor cable, 8-pin", color: BLACK, desc: "PUR 8×AWG24", shield: false, twisted: false, notes: "Pins 1 to 8 in DIN 47100 colours",
    cores: din47100(8, "24 AWG").map((k, i) => ({ ...k, mark: String(i + 1) })) },

  // Control cables
  { category: "Control cables", id: "cp_ctrl", name: "Control cable", color: GREY, desc: "7×AWG18 numbered", shield: false, twisted: false, notes: "Numbered black cores", cores: numberedCores(6, "18 AWG") },
  { category: "Control cables", id: "cp_ctrl12", name: "Control cable, 12 cores", color: GREY, desc: "12×AWG18 numbered", shield: false, twisted: false, notes: "Numbered black cores", cores: numberedCores(11, "18 AWG") },
  { category: "Control cables", id: "cp_ctrl7cy", name: "Control cable, shielded", color: GREY, desc: "7×AWG18 numbered, braided screen", shield: true, twisted: false, notes: "Numbered black cores", cores: numberedCores(6, "18 AWG") },
  { category: "Control cables", id: "cp_liyy4", name: "Data cable LiYY, 4 cores", color: GREY, desc: "LiYY 4×AWG20", shield: false, twisted: false, notes: "DIN 47100 colours", cores: din47100(4, "20 AWG") },
  { category: "Control cables", id: "cp_liycy4", name: "Data cable LiYCY, 4 cores", color: GREY, desc: "LiYCY 4×AWG20", shield: true, twisted: false, notes: "DIN 47100 colours", cores: din47100(4, "20 AWG") },
  { category: "Control cables", id: "cp_liycy8", name: "Data cable LiYCY, 8 cores", color: GREY, desc: "LiYCY 8×AWG20", shield: true, twisted: false, notes: "DIN 47100 colours", cores: din47100(8, "20 AWG") },

  // Power, in US colours: black hot, white neutral, green ground; three-phase black, red, blue (208/120 V)
  { category: "Power", id: "cp_mains", name: "Mains cable", color: BLACK, desc: "SJOOW 16/3", shield: false, twisted: false, notes: "Black hot, white neutral, green ground",
    cores: libCores("Stranded", [[BLACK, "16 AWG"], [WHITE, "16 AWG"], [GREEN, "16 AWG"]]) },
  { category: "Power", id: "cp_mains25", name: "Mains cable, 14 AWG", color: BLACK, desc: "SJOOW 14/3", shield: false, twisted: false, notes: "Black hot, white neutral, green ground",
    cores: libCores("Stranded", [[BLACK, "14 AWG"], [WHITE, "14 AWG"], [GREEN, "14 AWG"]]) },
  { category: "Power", id: "cp_3ph4", name: "Three-phase cable, no neutral", color: BLACK, desc: "3×14 AWG + ground", shield: false, twisted: false, notes: "L1 black, L2 red, L3 blue, green ground",
    cores: libCores("Stranded", [[BLACK, "14 AWG"], [RED, "14 AWG"], [BLUE, "14 AWG"], [GREEN, "14 AWG"]]) },
  { category: "Power", id: "cp_3ph5", name: "Three-phase cable with neutral", color: BLACK, desc: "4×14 AWG + ground", shield: false, twisted: false, notes: "L1 black, L2 red, L3 blue, white neutral, green ground",
    cores: libCores("Stranded", [[BLACK, "14 AWG"], [RED, "14 AWG"], [BLUE, "14 AWG"], [WHITE, "14 AWG"], [GREEN, "14 AWG"]]) },
  { category: "Power", id: "cp_dc2", name: "Low-voltage supply cable", color: BLACK, desc: "2×18 AWG", shield: false, twisted: false, notes: "Red +, black −",
    cores: libCores("Stranded", [[RED, "18 AWG"], [BLACK, "18 AWG"]]) },
  { category: "Power", id: "cp_motor", name: "Motor cable, shielded", color: "#ef7d00", desc: "3×16 AWG + ground + 2×18 AWG", shield: true, twisted: false, notes: "Brake / thermistor pair: cores 5 and 6",
    cores: coreList([["U", BLACK, "16 AWG"], ["V", BLACK, "16 AWG"], ["W", BLACK, "16 AWG"], ["", GREEN, "16 AWG"], ["5", BLACK, "18 AWG"], ["6", BLACK, "18 AWG"]]) },
  { category: "Power", id: "cp_vfd", name: "Drive cable, shielded", color: "#ef7d00", desc: "3×14 AWG + ground, shielded", shield: true, twisted: false, notes: "For variable-speed drives",
    cores: coreList([["U", BLACK, "14 AWG"], ["V", BLACK, "14 AWG"], ["W", BLACK, "14 AWG"], ["", GREEN, "14 AWG"]]) },

  // Instrumentation
  { category: "Instrumentation", id: "cp_inst1", name: "Instrument cable, 1 pair", color: BLUE, desc: "1×2×AWG18, shielded", shield: true, twisted: true, notes: "e.g. 4–20 mA loops",
    cores: libCores("Stranded", [[BLACK, "18 AWG", "1"], [WHITE, "18 AWG", "2"]]) },
  { category: "Instrumentation", id: "cp_rtd3", name: "RTD cable, 3-wire", color: WHITE, desc: "3×AWG20, shielded", shield: true, twisted: false, notes: "Pt100: red, red, white (IEC 60751)",
    cores: libCores("Stranded", [[RED, "20 AWG"], [RED, "20 AWG"], [WHITE, "20 AWG"]]) },
  { category: "Instrumentation", id: "cp_tck", name: "Thermocouple extension, type K", color: "#2e9b3c", desc: "KX 2×AWG20", shield: false, twisted: false, notes: "Green +, white − (IEC 60584-3)",
    cores: libCores("Solid", [["#2e9b3c", "20 AWG"], [WHITE, "20 AWG"]]) },
];

// The cable profiles drawings started with before the cable library existed, for older files that have none.
// (Sizes are in AWG; normalize converts them to the drawing's wire standard.)
const DEFAULT_CABLE_PROFILES = ["cp_cat6", "cp_ie", "cp_motor", "cp_ctrl", "cp_mains"]
  .map((id) => { const { category, ...p } = CABLE_LIBRARY.find((x) => x.id === id); return p; });
