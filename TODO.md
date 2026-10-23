# To do

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
