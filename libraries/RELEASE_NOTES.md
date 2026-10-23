# Library release notes

The ready-made libraries in this folder have their own version numbers (MAJOR.COMMIT.CHANGE), separate from DIN Stack's. They're listed here by library, newest version first. DIN Stack's own changes are in the main [release notes](../RELEASE_NOTES.md).

To get a newer version into a diagram, click **+** beside the library drop-down and use **Refresh** next to the library. It's highlighted when the diagram has an older version.

## AutomationDirect DIN-rail relays

File: [`automationdirect-din-relays.json`](automationdirect-din-relays.json)

### 1.0.1 — 2026-10-23

- **MIRO 12.4 relay DPDT** (Murrelektronik 52102, 52103, 52111, 52130, 52140): the terminal layout now matches the real relay. A1 and A2 are on their own at the top end, and all six contact terminals are at the bottom end in two columns: 11, 12, 14 on the left and 21, 22, 24 on the right. Before, 11 and 21 were at the top with the coil terminals. Parts already in a diagram keep their wires; the wires follow the terminals to their new places.

### 1.0.0

The library as first published in DIN Stack 1.1.2 (59 object types covering 206 part numbers), before libraries had version numbers.

## Phoenix Contact UT terminal blocks

File: [`phoenix-contact-ut.json`](phoenix-contact-ut.json)

### 1.0.0

The library as of DIN Stack 1.2.2 (64 types, including the accessories added in that release), before libraries had version numbers.

## Amphenol 26482 Series 2 connectors

File: [`amphenol-26482-series-2.json`](amphenol-26482-series-2.json)

### 1.0.0

The library as first published in DIN Stack 1.3.1 (68 receptacles), before libraries had version numbers.

## AutomationDirect pushbuttons & pilot lights

File: [`automationdirect-pushbuttons.json`](automationdirect-pushbuttons.json)

### 1.0.2 — 2026-10-23

- **Schmersal devices** from AutomationDirect's range: 28 new types, 52 in all.
  - **Whole devices** for the N (22 mm) and E (30 mm) series: 1 N.O., 1 N.C., 1 N.O. + 1 N.C., 2 N.O. and 2 N.C. pushbuttons and selectors, E-stops with an EF220.1 (2 N.C.) or EF303.1 (1 N.C. + 1 N.O.) block, illuminated pushbuttons and pilot lights.
  - **Every EF contact block** (EF10, EF03, EF110/EF220, EF033, EF103/EF303) in mounting positions 1, 2 and 3, and the ELE/ELDE light block. Place them side by side under one tag to build any other arrangement.
  - **NK-T and RK-T joysticks** with one or two M12 connectors.
- Terminal numbers are Schmersal's, which depend on the block's mounting position (for example EF03.2 is 23-24, EF103.2 is 31-32 and 43-44). Flange positions and screw positions are approximate; see the [library guide](../docs/library.md#libraries-that-come-with-din-stack).

### 1.0.1 — 2026-10-23

- New library: 24 panel-door devices sold by AutomationDirect, drawn from the wiring side, one type per series and contact arrangement.
  - **GCX 22 mm** (plastic GCX3xxx and metal GCX1xxx): 1 N.O., 1 N.C., 1 N.O. + 1 N.C., 2 N.O. and 2 N.C., the illuminated versions with a lamp (X1/X2), and pilot lights.
  - **Fuji Command 30 mm** (AR30/DR30): pushbuttons, E-stops (including 1 N.O. + 2 N.C.), LED illuminated pushbuttons and pilot lights.
  - **Eaton HT800 30 mm**: pushbuttons and selectors with one or two contact blocks, illuminated pushbuttons and pilot lights.
- Part numbers in the names are examples. Terminal positions are approximate.

## Misc networking

File: [`misc-networking.json`](misc-networking.json)

### 1.0.2 — 2026-10-23

- **ASUS computer** (new, 5 types in all): a free-standing computer, 7.25 in tall by 5.25 in wide, that doesn't go on a DIN rail. One side has a two-terminal power connector (V+, V−, which take wires), two LAN ports, serial ports COM1–2, four USB ports, HDMI and DisplayPort. The other side has serial ports COM3–6 and two more USB ports.
- The order of the connectors along each side and the power polarity are assumptions; see the [library guide](../docs/library.md#libraries-that-come-with-din-stack).

### 1.0.1 — 2026-10-23

- New library with 4 types:
  - **Tripp Lite NGI-U05E** 5-port unmanaged industrial gigabit switch (DIN rail, 12–48 V DC).
  - **Tripp Lite NPOEI-60W-1G** 60 W 802.3bt PoE++ injector (DIN rail, dual 24–57 V DC, alarm relay).
  - **StarTech IH2006** HDMI KVM-over-IP transmitter and receiver (the IH2006-KVM-EXTENDER kit).
- The switch's power pin names and the injector's terminal order are assumptions; see the [library guide](../docs/library.md#libraries-that-come-with-din-stack).
