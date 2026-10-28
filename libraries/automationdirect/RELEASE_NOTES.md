# AutomationDirect libraries: release notes

The AutomationDirect libraries in this folder each have their own version number (MAJOR.COMMIT.CHANGE), separate from DIN Stack's. They're listed here by library, newest version first. DIN Stack's own changes are in the main [release notes](../../RELEASE_NOTES.md).

To get a newer version into a diagram, click **+** beside the library drop-down and use **Refresh** next to the library. It's highlighted when the diagram has an older version.

## AutomationDirect DIN-rail relays

File: [`automationdirect-din-relays.json`](automationdirect-din-relays.json)

### 1.0.1 — 2026-10-23

- **MIRO 12.4 relay DPDT** (Murrelektronik 52102, 52103, 52111, 52130, 52140): the terminal layout now matches the real relay. A1 and A2 are on their own at the top end, and all six contact terminals are at the bottom end in two columns: 11, 12, 14 on the left and 21, 22, 24 on the right. Before, 11 and 21 were at the top with the coil terminals. Parts already in a diagram keep their wires; the wires follow the terminals to their new places.

### 1.0.0

The library as first published in DIN Stack 1.1.2, before libraries had version numbers: the DIN-rail relays, timers, monitoring relays and relay sockets that AutomationDirect sells.

- 59 object types covering 206 part numbers, in seven *AD relays* categories: interface, solid state & optocoupler, force guided, intrinsically safe, monitoring, timers and sockets.
- Brands: Murrelektronik, Klemsan, Dold, Gefran, Macromatic, Fuji Electric and AutomationDirect's own sockets.
- Sizes come from AutomationDirect's drawings, and terminals carry the names printed on the devices. Terminal positions are approximate.
- Search the library by part number (for example `52000`, `RK7814` or `GRSH`) to find the type that covers it.

## AutomationDirect pushbuttons & pilot lights

File: [`automationdirect-pushbuttons.json`](automationdirect-pushbuttons.json)

### 1.0.2 — 2026-10-23

- **Schmersal devices** from AutomationDirect's range: 28 new types, 52 in all.
  - **Whole devices** for the N (22 mm) and E (30 mm) series: 1 N.O., 1 N.C., 1 N.O. + 1 N.C., 2 N.O. and 2 N.C. pushbuttons and selectors, E-stops with an EF220.1 (2 N.C.) or EF303.1 (1 N.C. + 1 N.O.) block, illuminated pushbuttons and pilot lights.
  - **Every EF contact block** (EF10, EF03, EF110/EF220, EF033, EF103/EF303) in mounting positions 1, 2 and 3, and the ELE/ELDE light block. Place them side by side under one tag to build any other arrangement.
  - **NK-T and RK-T joysticks** with one or two M12 connectors.
- Terminal numbers are Schmersal's, which depend on the block's mounting position (for example EF03.2 is 23-24, EF103.2 is 31-32 and 43-44). Flange positions and screw positions are approximate; see the [library guide](../../docs/library.md#libraries-that-come-with-din-stack).

### 1.0.1 — 2026-10-23

- New library: 24 panel-door devices sold by AutomationDirect, drawn from the wiring side, one type per series and contact arrangement.
  - **GCX 22 mm** (plastic GCX3xxx and metal GCX1xxx): 1 N.O., 1 N.C., 1 N.O. + 1 N.C., 2 N.O. and 2 N.C., the illuminated versions with a lamp (X1/X2), and pilot lights.
  - **Fuji Command 30 mm** (AR30/DR30): pushbuttons, E-stops (including 1 N.O. + 2 N.C.), LED illuminated pushbuttons and pilot lights.
  - **Eaton HT800 30 mm**: pushbuttons and selectors with one or two contact blocks, illuminated pushbuttons and pilot lights.
- Part numbers in the names are examples. Terminal positions are approximate.
