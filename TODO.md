# To do

## Amphenol 26482 Series 2 library (`libraries/amphenol-26482-series-2.json`)

- [ ] **Contact positions** were measured from the insert drawings in an Amphenol catalog hosted by RS (ACSE206-05-14). Amphenol's own site blocks automated downloads. Check a few against MIL-STD-1669 or a real connector.
- [ ] **Letters inferred where the catalog is unclear:** the centre contact of 24-61 has no letter in the drawing and is named `RR` (the next double letter after PP). The centre contacts of 20-41 and 22-32 are printed as capitals that duplicate outer contacts, so they're taken as lowercase `t` and `j`.
- [ ] **The catalog's own chart disagrees with its drawings** on the contact sizes of 18-8, 20-24, 22-19 and 22-21. The drawings' labels were used, and they match Glenair's MIL-STD-1669 chart.
- [ ] **Wire colour guess:** contacts named N or L (and lowercase n) make new wires take the AC neutral or line colour, as if they were mains terminals.
- [ ] **Not included:** plugs (MS3476, MS3475), the outside shapes of the jam-nut and cable-connecting receptacles, alternate insert positions W/X/Y/Z, and MIL-STD-1669 arrangements that Amphenol's catalog doesn't list (8-2, 8-3, 8-4, 10-98, 14-22, 16-14, 16-99, 18-85, 20-27, 20-90, 22-34, 24-27).

## Phoenix Contact UT library (`libraries/phoenix-contact-ut.json`)

- [ ] **Screw and bridge-slot positions** are approximate: screws 6 mm in from each end, bridge slots 3 mm either side of the middle. Phoenix's dimension drawings weren't available, because its website blocks automated access. Check them against a real block or Phoenix's drawings.
- [ ] **UT 1,5** dimensions (4.15 × 48 mm) come from distributor and CAD data, not the catalog. Its blue and PE versions aren't included.
- [ ] **Multi-level blocks:** check which level is which on the UTTB-PE (assumed: the lower level is PE) and on the three-level PE/L/N and PE/L/L blocks (assumed: PE lowest, then L, with N or the second L on top).
- [ ] **TWIN blocks:** the single connection is at the top and the two at the bottom. Real blocks may be mirrored.
- [ ] **Not included:** orange, red and black colour variants, HESI LED variants, MT/MTD test-socket (P/P) variants, UT 4-QUATTRO HV, UTTB-PV and other special blocks, and accessories that don't take rail space (markers, test plugs, warning signs, pick-off blocks). Plug-in bridges are drawn as bus bars.
- [ ] **Accessories for UT 1,5:** its end cover and partition plate weren't found, so none are included. ATP-UT is listed for UT 2,5 to UT 10 only.
- [ ] **Accessory sizes** come from Phoenix datasheets, which label length and height inconsistently; the longer dimension is used as the length across the rail. The DP-UTTB spacer plate is 2.6 mm in its datasheet but 2.5 mm in the catalog (2.6 used).
- [ ] **Source data** is a 2010 catalog extract. Check that order numbers are still current.

## AutomationDirect relay library (`libraries/automationdirect-din-relays.json`)

### Check terminal layouts against real hardware

Sizes come from AutomationDirect's drawings, and terminal names from the wiring diagrams and label photos. On these types, which name sits on which screw was inferred rather than read, so check them first:

- [ ] **MIRO 12.4 DPDT** (52102, 52103, 52111, 52130, 52140): the product photo shows 4 screws at each end, but the label diagram suggests 2 (A1, A2) at one end and 6 (11, 12, 14, 21, 22, 24) at the other. The library currently has A1, A2, 11, 21 at the top and 12, 22, 14, 24 at the bottom.
- [ ] **750-3C-SKT** (11-pin octal): only the right column (8, 11, 9) and the coil pins (2, 10) were readable on the drawing. The rest of the rows (4 3 7 8 / 1 6 11 / 5 9) are a guess.
- [ ] **70169-D and 70170-D** (Macromatic octal sockets): which way they sit on the rail, and the pin order along each screw row.
- [ ] **TP411X** (Fuji 11-pin socket): the middle row (9, 10, 11).
- [ ] **782-2C-SKT**: the width is 24.4 mm or 29.7 mm, depending on how the drawing is read. The library uses 24.4.
- [ ] **782-4C-SKT**: the 3 × 4 contact grid and its row order (NO, NC, COM).
- [ ] **MIRO 6.2 and Klemsan KPR-SC slim relays**: which end holds the coil terminals, and the order of 11, 12 and 14 along the contact end.
- [ ] **Murrelektronik RMM 51101 and 51152**: the terminals are on the ends of the housing, so their front-view positions are rough.
- [ ] **Gefran GRSH "DC + alarm"** (…-D-2 models): pin 3 is named `Us-` because its label couldn't be read clearly. Also check the order of the 6-pin block.
- [ ] **Klemsan phase monitors with PTC**: T1 and T2/T3 were placed on the second tier at the top end without a clear photo.
- [ ] **Dold MK9962N and MK7850N**: confirm what X2 and X3 are, and that X1 is really absent on the MK9962N.

### Missing details

- [ ] **Gefran GRSH 90–120 A fan supply**: the -60, -61 and -62 models need external fan power (230 VAC, 115 VAC, 24 VDC), and its terminals aren't in the library.
- [ ] **ProSense PMRU-2C phase monitors**: these are covered only by the 70169-D socket, with pin numbers. A type with the PMRU's pin functions (L1, L2, L3, contacts) would be friendlier.
- [ ] **Label crowding**: on inner terminal rows (Dold RK7814 Z3/Z4/Z5, Dold MK bottom rows, 782-4C-SKT), labels pick sideways sides and overlap a little. Setting *Label side* by hand on those rows may help.

### Decisions

- [ ] **Built-in or add-on**: the AutomationDirect types are a ready-made library added from *+ Add a library…*. Decide whether any of them should become built-in types.
- [ ] **Generator script**: the library was generated with a throwaway Python script that isn't in the repo. Add a Go generator if the library will need regenerating or extending.
- [ ] **Publish**: push to GitHub so the library shows up in *+ Add a library…* on the live site.
- [ ] **Category names**: the library's categories all start with "AD relays:", which is redundant now that the library has its own entry in the drop-down. Consider shortening them (for example *Interface*, *Timers*).
