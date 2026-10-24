# Building your object library

DIN Stack draws every part as a rectangle with terminals. Each kind of part is an **object type**, and the object types together make up the **library** in the left sidebar. This guide covers designing object types, the settings that control how parts behave, and saving and sharing a library.

## Contents

- [Where the library lives](#where-the-library-lives)
- [Creating an object type](#creating-an-object-type)
- [Type settings](#type-settings)
- [Terminals](#terminals)
- [Internal links](#internal-links)
- [Bus bar slots](#bus-bar-slots)
- [Worked example: a 4-channel relay module](#worked-example-a-4-channel-relay-module)
- [Changing a type that's already in use](#changing-a-type-thats-already-in-use)
- [Saving and sharing a library](#saving-and-sharing-a-library)
- [Library file format](#library-file-format)
- [Tips](#tips)

## Where the library lives

The library is stored **inside each diagram**:

- It's saved with the diagram, both in the browser's automatic save and in `.json` files from *Save*.
- **New** starts an empty diagram but keeps the current library.
- **Open** loads the library that was saved with that file.
- To move object types between diagrams, use **Export** and **Import a library file…** in the **⋯** menu at the top of the library (see [Saving and sharing a library](#saving-and-sharing-a-library)).

### Several libraries

A diagram can hold several libraries, and the sidebar shows one at a time. Pick which one with the drop-down at the top of the library:

- **Built-in** holds the types that come with DIN Stack.
- **My types** holds types you made before libraries existed, and any type with no library set.
- **Each imported library file becomes its own library**, named after the file (see [Saving and sharing a library](#saving-and-sharing-a-library)).
- **All libraries** shows every type at once. Use it to search across all of them.

The search box searches the library shown. New types go into the library shown (or *My types* when *All libraries* is picked). To move a type to another library, or start a new one, change its **Library** in the designer.

Which library is shown is remembered in your browser and isn't saved with the diagram.

### Managing the included libraries

Click **+** beside the library drop-down (or **⋯ → Manage included libraries…**) to open the library manager. It lists the ready-made libraries that come with DIN Stack, says whether each is loaded in this diagram and how many parts use it, and has a button for each job:

- **Load** adds a library to the diagram as its own library and shows it in the sidebar.
- **Refresh** loads a library that's already in the diagram again, replacing its types with the published ones. Types the library no longer has are removed, unless a part on the drawing still uses them. Changes you made to its types are replaced too.
- **Unload** removes a library's types from the diagram. If parts on the drawing use them, it says how many first, and those parts and their wires are removed with it.
- **Refresh all** (at the bottom) refreshes every included library in the diagram.

The window stays open, so you can load, refresh and unload several in a row. **Undo** reverses each of them. Descriptions are folded away to keep the list short; click the arrow or a library's name to show what's in it.

Each ready-made library has its own version number, separate from DIN Stack's, and its own history in the `RELEASE_NOTES.md` in its folder under [`libraries/`](../libraries/README.md) (*What's new* in the list). The diagram remembers which version of each library it last loaded. When a newer one is available, or the library was added before it had a version number, the list says *Update available* and highlights **Refresh**.

The list is read from `libraries/index.json`, so it needs the online version, or an installed copy that has been online. A copy opened straight from `index.html` can't read it; download the library file and use **Import a library file…** (in the same window, or the **⋯** menu) instead.

To offer a new library in the list, give it a folder in `libraries/` with the library file and a `RELEASE_NOTES.md`, and add an entry to `libraries/index.json`. Related libraries can share a folder (as the AutomationDirect ones do in `libraries/automationdirect/`); their release notes then have a `##` section per library, headed with its name, so *What's new* can link straight to it.

```json
{
  "type": "dinstack-catalog",
  "libraries": [
    { "file": "my-parts/my-parts.json", "version": "1.0.0", "name": "My parts", "description": "What's in it, in a sentence.", "types": 12 }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `file` | The library file's path inside `libraries/`, including its folder. |
| `version` | Optional. The library's version, the same as the `version` in its file. It's shown in the list, and a diagram holding an older version is offered the update. |
| `name` | The library's name, shown in the list and used for its types unless the file sets its own. |
| `description` | Optional. A sentence shown under the name. |
| `types` | Optional. How many object types it has, shown in the list. |

### Libraries that come with DIN Stack

| Library | What's in it |
| --- | --- |
| **AutomationDirect DIN-rail relays** ([`automationdirect-din-relays.json`](../libraries/automationdirect/automationdirect-din-relays.json)) | DIN-rail relays, timers, monitoring relays and relay sockets sold by AutomationDirect: 59 object types covering 206 part numbers (Murrelektronik, Klemsan, Dold, Gefran, Macromatic, Fuji and AutomationDirect's own sockets). |
| **Phoenix Contact UT terminal blocks** ([`phoenix-contact-ut.json`](../libraries/phoenix-contact-ut/phoenix-contact-ut.json)) | 64 types: UT screw terminal blocks (feed-through UT 1,5 to UT 35 in grey and blue, ground (PE), TWIN and QUATTRO, double-level UTTB, three-level, fuse (HESI), and disconnect (HEDI, MT, MTD) blocks) and the accessories that take up rail space: end covers, partition and spacer plates, and end clamps. Each type's name includes its order number. |
| **Amphenol 26482 Series 2 connectors** ([`amphenol-26482-series-2.json`](../libraries/amphenol-26482-series-2/amphenol-26482-series-2.json)) | 68 MIL-DTL-26482 Series 2 circular receptacles: all 34 insert arrangements from shell size 8 to 24, each with pins (P) and with sockets (S). |
| **AutomationDirect pushbuttons & pilot lights** ([`automationdirect-pushbuttons.json`](../libraries/automationdirect/automationdirect-pushbuttons.json)) | 52 types: 22 mm GCX pushbuttons, selector switches, E-stops and pilot lights (plastic and metal), Fuji Command 30 mm and Eaton HT800 30 mm devices, and Schmersal N (22 mm) and E (30 mm) series devices, their EF contact and light blocks, and NK-T/RK-T joysticks. One type per series and contact arrangement, drawn from the wiring side. |
| **Misc networking** ([`misc-networking.json`](../libraries/misc-networking/misc-networking.json)) | 5 types: Tripp Lite (Eaton) NGI-U05E 5-port industrial switch and NPOEI-60W-1G PoE++ injector for DIN rail, the StarTech IH2006 HDMI KVM-over-IP transmitter and receiver, and an ASUS computer with six serial ports. |
| **AACC Mechatronics** ([`aacc-mechatronics.json`](../libraries/aacc-mechatronics/aacc-mechatronics.json)) | 12 types for the AACC Mechatronics panel: TE (Entrelec) ZK2.5 and ZK2.5-4P PI-spring terminal blocks with their EK2.5 end sections, a TB-2503 barrier strip, the Allen-Bradley MicroLogix 1100 PLC (1763-L16AWA, L16BWA, L16BBB and L16DWD), the Siemens SIMATIC NET CSM 1277 switch and PM1207 power supply, and the RHINO PSP05-020S 5 V supply. |

About the AutomationDirect library:

- **One type per housing.** Models that differ only in coil voltage, timing range or rating share a type. Each type's name lists the part numbers it covers, so searching the library for a part number such as `52000` or `GRSH` finds it.
- **Sizes** come from AutomationDirect's dimension drawings. **Terminal names** are the ones printed on the device. **Terminal positions** are approximate, placed from the drawings and product photos. Check them against your hardware before relying on the layout.
- **Plug-in relays** go on the rail through a socket, so the library has the socket, not the relay. Socket terminals use the IEC numbers (A1, A2, 11, 12, 14…), except the octal and Fuji timer sockets, which use pin numbers.
- **Dold force guided modules** label each contact terminal with both of its possible numbers, such as `11/13`, because the same base takes relays with different contact arrangements.
- **Gefran GRSH** types are grouped by housing width and control option. The fan supply wiring of the 90–120 A models isn't included.
- Gefran heatsinks (HS-…, DIS-90G-KIT) are left out, as they have no terminals.

About the Phoenix Contact UT library:

- **Sizes** (width along the rail and length across it) come from Phoenix Contact's CLIPLINE complete catalog. UT 1,5 comes from distributor and CAD data. Screw and bridge positions are approximate.
- **Feed-through and ground blocks** work like the built-in terminal blocks. Their terminals are linked, and two bus bar slots in the middle take the FBS plug-in bridges. They use the same internal terminal ids as the built-in blocks, so a part can be switched between a built-in block and a UT block (with **Type** in the inspector) without losing its wires.
- **Multi-level blocks:** each level is a separate circuit. The lowest level's screws are at the ends, and the upper levels' are further in. On the PE/L/N blocks the terminals are named after their level.
- **Fuse and disconnect blocks** (HESI, HEDI, MT, MTD) don't link their two sides, since they're only connected while the fuse is in or the disconnect is closed. Each side has its own bridge slot.
- **End covers** (D-UT…) are 2.2 mm wide parts with no terminals. Put one at the open end of a strip.
- **Partition plates** (ATP-UT…, TP-UK) separate groups of blocks, for example where a plug-in bridge is cut short or two voltages meet. The **DP-UTTB spacer plate** levels out the offset between UTTB blocks. Plates are a little longer than the blocks they go between.
- **End clamps** hold a strip in place at each end: CLIPFIX 35-5 (5.15 mm, the one Phoenix lists for UT 2,5), CLIPFIX 35, E/UK and E/NS 35 N (9.5 mm).
- **Plug-in bridges** (FBS…) and reducing bridges (RB…) aren't object types: draw them with **Bus bar** through the blocks' B1 or B2 slots. Markers, test plugs and warning signs don't take rail space and aren't included.
- Colours other than grey, blue and green-yellow (orange, red, black) and the LED variants of the fuse blocks aren't included. Duplicate the nearest type and change its colour.

About the Amphenol 26482 Series 2 library:

- **One type per insert arrangement and contact gender.** The type name starts with the arrangement and gender as it appears at the end of the part number, such as `14-19P` in MS3470L14-19P, so searching for `14-19` finds both versions. The same insert fits the wall-mount (MS3470), cable-connecting (MS3471) and jam-nut (MS3474) receptacles.
- **Contacts are shown from the wire side**, the way you see them when wiring the back of a panel. Socket inserts look as they do in the catalog's insert drawings; pin inserts are mirrored left to right. The master key is at the top.
- **Contact positions** were measured from the insert drawings in Amphenol's catalog and scaled to the shell, so they're close but not exact. Contact letters are the catalog's. The contact sizes (#20, #16, #12) are in each type's name.
- **The outline** is the square flange of the MS3470 wall-mount receptacle. Jam-nut and cable-connecting receptacles are a different shape on the outside, but their inserts are the same.
- Plugs (MS3476, MS3475), protective caps, backshells and the alternate insert positions (W, X, Y, Z) aren't included.

About the AutomationDirect pushbuttons & pilot lights library:

- **One type per series and contact arrangement**, not per colour or legend. A red 1 N.C. pushbutton and a red 1 N.C. mushroom E-stop wire the same way, so they share a type. Each name gives example part numbers; search for one, such as `GCX3100`, `AR30`, `NDT` or `EF103.2`, to find its type.
- **Drawn from the wiring side**, as you see the device from inside the enclosure door. Types are *Loose*, with tag prefix `S` (or `PL` for pilot lights).
- **Terminal names** use the block's position and function: the first block (left) is `13`/`14` when N.O. or `11`/`12` when N.C., the second block (right) `23`/`24` or `21`/`22`, and a lamp is `X1`/`X2`. The blocks themselves are marked 3-4 and 1-2, so rename the terminals if your drawings use those.
- **Outlines** come from AutomationDirect's drawings (GCX 30 × 40 mm, Fuji AR30 30 × 44 mm). The Eaton HT800 outline (52 × 36 mm) and all terminal positions are approximate. Extra blocks stacked behind the first two sit in the same place in this view, so they're not drawn except where noted (Fuji 1 N.O. + 2 N.C. E-stop).
- **Schmersal N and E series** are modular: you buy the operator (NDT, NDP, NDL, NW…, NDRZ, NML for 22 mm; EDT, EDP, EDL, EW…, ESS, EDRZ/EDRR, EML for 30 mm) and snap EF contact blocks and a light block onto its mounting flange. Both series use the same blocks, so they share types. There are two ways to draw them:
  - **A whole device** (category *Schmersal N 22mm & E 30mm*): the common arrangements, such as 1 N.O., 1 N.O. + 1 N.C., the E-stop blocks, illuminated pushbuttons and pilot lights. Each name lists the blocks it assumes.
  - **Single blocks** (category *Schmersal EF contact & light blocks*): one type for every EF contact block AutomationDirect sells, in each mounting position, and one for the light blocks. For any other arrangement, place the blocks side by side and give them the same tag (S1, S1, S1), so wires read `S1-11`, `S1-23` and so on.
- **Schmersal terminal numbers** follow the block's mounting position, as printed on the blocks: a single block in position 1 is `11`/`12` (N.C.) or `13`/`14` (N.O.), in position 2 `21`/`22` or `23`/`24`, and in position 3 `31`/`32` or `33`/`34`. A double block takes two numbers: `11`-`12` and `23`-`24` for EF103.1, `31`-`32` and `43`-`44` for EF103.2, `51`-`52` and `61`-`62` for EF110.3. The light block is `X1`/`X2`.
- **Schmersal flange positions** from the wiring side are taken as 1 (left), 3 (middle) and 2 (right). Position 3 is where the light block goes on illuminated devices. Schmersal marks position 1 with the bevel on the flange, so check whether your view is mirrored. The outline (30 × 45.2 mm) and block size (9.8 × 45.2 mm) come from AutomationDirect's drawings. Screw positions are approximate, and on double blocks the second contact is drawn at the ends.
- **Schmersal blocks for E-stops:** AutomationDirect lists EF10, EF110 and EF103 as not suitable for E-stops, and EF220 and EF303 as not suitable for the maintained NWS/NWT selectors. The E-stop types use EF220.1 and EF303.1.
- **Schmersal joysticks** (NK-T blue, RK-T grey) have their contacts built in and connect through one or two M12 8-pin sockets, drawn as cable ports `X1` and `X2`. Which socket is X1 is an assumption. Their 80 mm outline comes from AutomationDirect's drawings.
- Schmersal accessories without terminals (legend plates, hole seals, the NUE adapter, spare flanges, seals and the EFR spring) aren't object types.
- Stack lights, potentiometers, pendants, foot switches and enclosures aren't included, and nor are joysticks other than Schmersal's.

About the Misc networking library:

- **NGI-U05E** and **NPOEI-60W-1G** are DIN-rail parts, drawn from the front with the power terminals along the top. RJ45 sockets are cable ports. The names of the switch's three power pins (V+, V−, FG) and the order of the injector's six (PWR+, PWR−, ALM, ALM, RPS−, RPS+) weren't in the documents found, so check them against the label on the unit.
- **IH2006** transmitter and receiver are *Loose* (they mount with brackets), drawn from above with the front panel along the top edge and the rear along the bottom. The RS-232 terminal block (GND, RxD, TxD) takes wires; the HDMI, USB, audio, LAN and 5 V DC sockets are cable ports. The receiver's two USB ports are an assumption; the guide just says "USB HID ports".
- **ASUS computer** is *Loose* (it doesn't go on a DIN rail), 7.25 in tall by 5.25 in wide (184 × 133 mm), drawn with one connector side along the left edge and the other along the right. The left side has the two-terminal power connector (V+, V−, which take wires), LAN 1–2, COM1–2, USB 1–4, HDMI and DisplayPort; the right side has COM3–6 and USB 5–6. The connectors are cable ports. Their order along each side and the power pin polarity are assumptions, so check them against the unit.

About the AACC Mechatronics library:

- **TE (Entrelec) ZK2.5 and ZK2.5-4P** blocks are 5.2 mm wide and 50.9 and 80.2 mm long. They work like the built-in terminal blocks, with the same internal terminal ids, two linked bridge slots in the middle (B1, B2), and terminals 1 and 2 at the ends (3 and 4 further in on the 4-connection block). The EK2.5 (52.2 mm) and EK2.5-4P (82.8 mm) end sections are 2 mm wide with no terminals. Lengths come from TE's and distributors' data; the clamp and bridge positions are approximate.
- **TB-2503** is a generic barrier strip (50.5 × 28 mm, 10 mm pitch), *Loose*, drawn with its three positions side by side. Each position has a screw on both sides, named the same (1, 2, 3) and linked.
- **MicroLogix 1100**: one type per version, 110 × 90 mm, with the input terminal block along the top and the output block along the bottom. Terminal names and order come from the terminal block layouts in Rockwell's user manual (1763-UM001); positions marked *NOT USED* are left out. Each block is drawn as a staggered double row, and the screw spacing is approximate. The RS-232 (CH0) and Ethernet (CH1) ports are cable ports on the left; their positions are approximate.
- **CSM 1277** (45 × 100 mm) has its 3-pole 24 V DC terminal along the top and ports P1–P4 along the bottom. The terminals are named L+, M and PE here so new wires get DC colours; check the names printed on the unit.
- **PM1207** (70 × 100 mm) has its input (L, N, PE) along the top and two L+ and two M output terminals along the bottom, as listed in Siemens' datasheet. Which edge each block is on, and the order of the outputs, are assumptions.
- **RHINO PSP05-020S** is drawn from AutomationDirect's dimension drawing (27 × 75 mm front): output (+V, −V) at the top and input (PE, N, L) at the bottom. The parts list said PSP05-0205, which isn't a part number; PSP05-020S is the 5 V model in the range.

## Creating an object type

| To… | Do this |
| --- | --- |
| Start from scratch | Click **+ New type** above the library. |
| Start from a similar type | Hover over it in the library and click **⧉ Duplicate**. |
| Change an existing type | Hover over it in the library and click **✎ Edit**, or select a part on the diagram and click **Edit object type**. |
| Remove a type | Hover over it in the library and click **🗑 Delete**. Parts on the diagram that use it are removed too, so you're asked first. |

The designer has the type's settings on the left and a full-size preview on the right, with the terminal table below it. Click **Save** to keep your changes, or **Cancel** (or Esc) to discard them.

## Type settings

| Setting | What it does |
| --- | --- |
| **Name** | Shown in the library, the inspector and the parts list. |
| **Library** | Which library the type belongs to. Pick an existing one or type a new name to start a new library. |
| **Category** | Groups the library list, for example *Terminal blocks*, *Power*, *Control*. Type a new name to start a new group. |
| **Mounting** | *DIN rail* parts snap onto rails and move with a rail when it's dragged. *Loose* parts, such as connectors on the enclosure wall, a panel or a cable, can be placed anywhere: they don't snap onto rails or move with them, though they still line up with neighbouring parts. Loose types show "loose" in the library. |
| **Width / Height (mm)** | The part's outline as seen from the front, unrotated, at real size. |
| **Tag prefix** | New parts are tagged with this prefix and the next free number: with `K`, the first relay is K1, then K2, and so on. Leave it empty for parts without tags, like end stops. Terminal blocks use `TB`, giving TB101-style tags through *Repeat* and *Renumber*. |
| **Corner radius** | Rounds the corners of the outline. Drawing only. |
| **Colour** | The body colour. Tag text switches between dark and light automatically to stay readable. |
| **Show type name on part** | Prints the type name under the tag when the part has no description of its own. Useful for larger modules, but leave it off for narrow parts like terminal blocks. |

### Loose connectors

The library's *Enclosure connectors* group has 2-, 4- and 8-pin panel connectors and a round M12 4-pin connector, all set to *Loose* with the tag prefix `X`. Their pins are named 1, 2, 3…, so wires read like `X1-3`. The M12's pins are numbered clockwise from the top left, so rename them if your connector's face is laid out differently. For other connectors, duplicate one of these and change the size and pins. For a round body, make the width and height equal and set the corner radius to half the width.

### Measuring a part

- **Width:** the part's width along the rail. Datasheets often call this the module width or pitch. Terminal blocks are typically 5.2 mm, 6.2 mm, 8.2 mm and so on.
- **Height:** the overall height across the rail.
- **On the rail:** parts snap so they're centred on the rail vertically. If a real part isn't centred on its rail clip, you can still drag it off-centre, or hold **Alt** while dragging to place it freely.

## Terminals

A terminal is a point where wires (or bus bars) attach. Each one has a name, a position and a few options, all edited in the table under the preview.

### Adding terminals

| Method | How |
| --- | --- |
| **Click** | Click on the preview to add a terminal there. It's named after the previous one, counting up (1 → 2, IN1 → IN2). Drag a terminal to move it. **Snap** above the preview sets the grid it moves on (0.1–2.5 mm). |
| **Add a row** | Fill in the *Add a row* tab on the left and click **Add row**. This is the quickest way to get a neat screw row. |
| **Type it in** | Edit X and Y in the table for exact positions from a dimension drawing. |

Settings for **Add a row**:

| Setting | Meaning |
| --- | --- |
| **Edge** | Which edge the row runs along. |
| **Count** | How many terminals. |
| **First name** | The first terminal's name. A trailing number counts up: `1` gives 1, 2, 3…; `A1` gives A1, A2…; `13` gives 13, 14… |
| **Inset from edge** | How far in from that edge the row sits, in mm. |
| **Pitch (mm)** | Spacing between terminals. Leave it blank to spread them evenly along the edge. |
| **Start offset** | Position of the first terminal along the edge. Leave it blank to centre the row. |

### Adding a grid of terminals

The **Add a grid** tab places a block of terminals in one go, such as a 2 × 16 pin header or an IC footprint.

| Setting | Meaning |
| --- | --- |
| **Columns / Rows** | Grid size. A 2 × 16 has 2 columns and 16 rows (tall); a 16 × 2 is wide. |
| **Pitch across / down** | Spacing between columns and between rows, in mm. Defaults to 2.54 mm (0.1"). |
| **Left / Top** | Position of the first column and row. Leave blank to centre the grid on the part. |
| **Numbering** | How the pins are numbered (below). |
| **Pin 1 at** | The corner pin 1 sits in. |
| **First name** | The first pin's name. A trailing number counts up, e.g. `1` or `P1`. For row letters, use something like `A1` or `a1`. |

Numbering options, shown for a 2 × 16 with pin 1 at the top left:

| Numbering | Result |
| --- | --- |
| **Rows, wrapping** | Across each row, then the next row down: 1 2 / 3 4 / … Typical of 2-row pin headers and ribbon connectors. |
| **Columns, wrapping** | Down each column, then the next column: 1–16 on the left, 17–32 on the right. |
| **Around, counter-clockwise (like an IC)** | Around the outside: 1–16 down the left, then 17–32 back up the right, as on a DIP chip. For a wide (16 × 2) IC, set *Pin 1 at* to bottom left: 1–16 run along the bottom and 17–32 back along the top. |
| **Around, clockwise** | The same, the other way round. |
| **Row letter + number** | A letter for each row and a number along it: A1–A16, B1–B16. Typical of DIN 41612 connectors. |

For grids larger than two rows or columns, *Around* numbers the outer ring and then each inner ring in turn.

Grid terminals get label sides facing away from the grid. In a tall grid, the left column faces left and the right column faces right; in a wide grid, the top row faces up and the bottom row down. A new grid starts out selected, so you can drag it into place.

When terminals are packed closer than about 3.6 mm, the dots shrink to fit and each pin's name is printed inside its dot rather than beside it, on the diagram as well as in the designer.

### Selecting and moving several terminals

| To… | Do this |
| --- | --- |
| Select several | Drag a box over empty space in the preview. Hold **Shift** or **Ctrl** while dragging to add to the current selection. |
| Add or remove one | **Shift+click** or **Ctrl+click** it in the preview, or Shift/Ctrl-click its row in the table. |
| Select all | **Ctrl+A** (with the preview focused, i.e. after clicking it). |
| Clear the selection | **Esc**. A second Esc closes the designer. |
| Move the selection | Drag any selected terminal. The one you grab snaps to the grid and the others keep their spacing; the group stays inside the outline. Hold **Shift** while dragging to move straight across or straight up and down. |
| Nudge | Arrow keys move the selection one snap step, or ten with **Shift**. |
| Copy | **Ctrl+D**, or **Duplicate** in the selection bar. Copies are named on from the last terminal. |
| Delete | **Delete**, or **Delete** in the selection bar. A single terminal can also be deleted with **✕** in its row. |

A newly added row of terminals starts out selected, so you can drag it straight into place.

When terminals are selected, a bar under the preview offers:

| Button | What it does |
| --- | --- |
| **Align in a row** | Gives them all the Y of the leftmost one. |
| **Align in a column** | Gives them all the X of the topmost one. |
| **Space evenly** | Spreads them evenly between the first and last, along whichever direction they're spread out more. |
| **Link together** | Gives them the same **Link** value: one they already share, or the next free number. |
| **Duplicate**, **Delete** | As above. |

In the table, changing **Type**, **Label side** or **Link** on a selected row changes it for every selected terminal. Name, X and Y always change only that row.

**Ctrl+Z** and **Ctrl+Y** undo and redo changes inside the designer. **Cancel** still throws away everything since you opened it.

### Terminal fields

| Column | Meaning |
| --- | --- |
| **Name** | What the terminal is called on the part. It's used in every reference: tag, separator, name, e.g. `PS1-+V` or `TB101-1`. Names don't have to be unique; a supply with two `+V` terminals is fine. |
| **X / Y** | Position in mm from the **top-left corner** of the unrotated outline. |
| **Type** | *Wire* for a normal terminal, or *Bus bar slot* (see [Bus bar slots](#bus-bar-slots)). |
| **Label side** | Which way the wire labels and stubs point. *Auto* picks the nearest edge relative to the part's size, so terminals on a narrow terminal block face up or down rather than sideways. Set it by hand when Auto picks the wrong edge, for example on the top face of a battery. The preview shows the chosen side with a short blue tick. |
| **Link** | Internal connections (see [Internal links](#internal-links)). |

When a part is rotated on the diagram, its terminals, label sides and links all rotate with it, so you only design the type once.

### Terminal names help automatic wire colours

When you draw a new wire that doesn't join an existing circuit, DIN Stack guesses its colour (and wire profile) from the terminal names:

| Name looks like | Treated as |
| --- | --- |
| `PE`, `GND`, `EARTH`, `⏚` | Protective earth / ground |
| `+`, `L+`, `V+`, or anything ending in `+` | DC positive |
| `-`, `0V`, `V-`, `M`, `L-`, `COM-`, or anything ending in `-` | DC negative / 0 V |
| `N` | AC neutral |
| `L`, `L1`, `L2`, `L3` | AC line |

The colours follow the wire standard set in Settings (metric or American). Conventional names get sensible colours for free.

## Internal links

Terminals with the same **Link** value are connected inside the part. Circuit highlighting, circuit names and *Select whole circuit* follow these links. Any text works as a value. Only matching values matter.

| Part | Typical links |
| --- | --- |
| 2-wire terminal block | Both terminals `1` (they're the same conductor). |
| Power supply | Both `+V` terminals `+V`, both `-V` terminals `-V`. L, N and PE are left empty. |
| 2-pole breaker | Pole 1 in/out `1`, pole 2 in/out `2`. |
| Relay | Usually none: contacts are only connected when the relay switches. |

Dashed blue lines in the preview show which terminals are linked. **Link all** links every terminal together, and **Clear links** removes them all.

Leave links empty for terminals that are only connected when a switch, fuse or relay closes. That way circuit tracing shows what's permanently connected.

## Bus bar slots

Set a terminal's **Type** to *Bus bar slot* for a point that takes a bus bar (jumper comb) but not a wire, like the bridge shafts in the middle of real terminal blocks. Slots:

- are drawn as small dark squares, with no name label or wire labels
- can only be clicked while picking terminals for a bus bar, so they never get in the way of wiring
- need a **Link** value matching the block's terminals, so a bar in the slot connects to the block's circuit

The built-in 2-wire, blue, ground and 4-wire terminal blocks have two slots each, so one bar can join odd blocks and another the even ones. To add slots to your own block, place them along the centre line between the screw rows and give them the same Link as the screws.

## Worked example: a 4-channel relay module

Say you have a relay module that's 45 mm wide and 90 mm tall. It has four control inputs and a common along the top, and four normally-open contacts along the bottom, each with a common (C) and a normally-open (NO) terminal.

1. Click **+ New type**. Set **Name** to `Relay module, 4-channel`, **Category** to `Control`, **Width** to `45`, **Height** to `90` and **Tag prefix** to `K`. Tick **Show type name on part**.
2. Add the input row. Set **Edge** to *Top*, **Count** to `5`, **First name** to `IN1`, **Inset** to `6` and **Pitch** to `8`. Leave **Start offset** blank and click **Add row**. That gives IN1–IN5 centred along the top. In the table, rename IN5 to `COM`.
3. Add the contact commons. Set **Edge** to *Bottom*, **Count** to `4`, **First name** to `C1`, **Inset** to `6` and **Pitch** to `10`, and click **Add row** (C1–C4).
4. Add the normally-open contacts. Keep the same settings but change **First name** to `NO1` and **Inset** to `14`, and click **Add row** (NO1–NO4, just above the commons).
5. Leave **Link** empty everywhere. A contact is only connected when its relay is on.
6. Click **Save**. The type appears under *Control*. Click it to place one, or drag it onto a rail.

If your relay's datasheet uses numbers like 13/14, 23/24 for its contacts, rename the terminals in the table to match.

## Changing a type that's already in use

- **Every part of a type is drawn from it**, so changing the size, colour or terminal positions updates all of those parts at once.
- **Renaming a terminal is safe.** Wires stay attached and their labels update.
- **Deleting a terminal removes the wires attached to it.** The designer warns you before saving how many wires will go. Undo brings them back.
- **To make a variant without touching existing parts**, use **Duplicate** and edit the copy.
- **A part's type can also be changed** from the inspector (**Type**). Wires stay on terminals that have the same internal id in the new type. Duplicated types keep their terminal ids, so swapping between a type and its copy keeps the wiring.

## Saving and sharing a library

| Action | Result |
| --- | --- |
| **⋯ → Export** | Downloads the library shown, plus your wire profiles, as a file named after the library (for example `my-types.json`). With *All libraries* picked, it downloads `dinstack-library.json` with every type in the diagram. |
| **Import a library file…** (in **⋯**, or the **+** window) | Merges a library file into the current diagram as its own library, and shows it. |

How importing merges:

- **Same id** as a type you already have: your type is replaced by the imported one, and parts using it update.
- **New id:** the type is added.
- **Your other types are kept.**
- **Wire profiles** and **cable profiles** merge the same way, by id, and wires and cables using an updated profile change to match.
- **Library name:** each imported type keeps the library it was exported from. Types without one go into a library named after the file: its `name` field if it has one, otherwise the file name (`automationdirect-din-relays.json` becomes *automationdirect din relays*). Built-in types stay in *Built-in*.

To keep a standard library for all your work, build it in one diagram, export it, and import it into each new diagram. Alternatively, keep a "template" diagram file and start new work from it with *Open* then *Save*.

Libraries saved by older versions of DIN Stack still import. Built-in types in them get internal links and bus bar slots added if they didn't have them.

## Library file format

A library file is plain JSON, so you can also generate or edit one with a script or text editor:

```json
{
  "type": "dinstack-library",
  "app": "1.1.1",
  "name": "My types",
  "templates": [
    {
      "id": "u7k2m9q",
      "name": "Relay module, 4-channel",
      "library": "My types",
      "category": "Control",
      "mount": "rail",
      "prefix": "K",
      "w": 45,
      "h": 90,
      "fill": "#e9e3c9",
      "radius": 1.5,
      "showName": true,
      "terminals": [
        { "id": "in1", "name": "IN1", "x": 6.5, "y": 6, "side": "auto", "link": "", "kind": "wire" },
        { "id": "c1", "name": "C1", "x": 7.5, "y": 84, "side": "auto", "link": "", "kind": "wire" },
        { "id": "no1", "name": "NO1", "x": 7.5, "y": 76, "side": "auto", "link": "", "kind": "wire" }
      ]
    }
  ],
  "wireProfiles": [
    { "id": "wp_24v", "name": "+24 V DC", "color": "#d32f2f", "gauge": "1.5 mm²", "conductor": "Stranded" }
  ],
  "cableProfiles": [
    { "id": "cp_cat6", "name": "Ethernet, Cat6", "color": "#1f63c6", "desc": "Cat6 U/UTP 4×2×AWG24", "shield": false, "twisted": true, "notes": "" }
  ]
}
```

The top-level `name` is optional: it names the library that types without their own `library` go into when the file is imported. `app` is the DIN Stack version that wrote the file. An optional `version` (such as `"1.0.1"`) is the library's own version; importing a file that has one records it in the diagram. Exported files don't include it.

### Object type fields

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Unique, stable identifier. Importing matches on it, and parts reference it. Don't change it once parts use the type. |
| `name` | yes | Display name. |
| `library` | no | The library the type belongs to. If it's missing, importing uses the file's `name`, or the file name. |
| `category` | no | Library group. Defaults to *Custom*. |
| `mount` | no | `free` for a loose part that doesn't go on a DIN rail. Anything else, or leaving it out, means a rail-mounted part. |
| `prefix` | no | Tag prefix for new parts. |
| `w`, `h` | yes | Width and height in mm. Both must be greater than 0, or the type is skipped on import. |
| `fill` | no | Body colour as `#rrggbb`. |
| `radius` | no | Corner radius in mm. |
| `showName` | no | `true` to print the type name on parts. |
| `terminals` | no | List of terminals (below). |

### Terminal fields

| Field | Meaning |
| --- | --- |
| `id` | Unique within the type, and stable: wires and bus bars reference it. |
| `name` | Name shown on the part and in references. |
| `x`, `y` | Position in mm from the top-left of the unrotated outline. |
| `side` | `auto`, `top`, `right`, `bottom` or `left`. |
| `link` | Internal link value. Same value = connected inside the part. Empty for none. |
| `kind` | `wire` (default), `bus` for a bus bar slot, or `port` for a cable connector (a socket such as an RJ45 port that takes a cable's plug, not single wires). |

### Wire profile fields

| Field | Meaning |
| --- | --- |
| `id` | Unique, stable identifier. |
| `name` | Display name. |
| `color` | `#rrggbb`, or `gy` for green/yellow. |
| `stripe` | Tracer stripe colour as `#rrggbb`, or empty for none. |
| `gauge` | Free text, e.g. `1.5 mm²` or `16 AWG`. |
| `conductor` | `Stranded`, `Solid` or empty. |

Ids can be any text. The app makes short random ones, but readable ids like `relay-4ch` are fine as long as they're unique.

## Tips

- **Give terminals the names printed on the device.** References like `PS1-+V` or `K3-14` then match the hardware, and the colour guess works.
- **Narrow parts face their labels up and down automatically.** If a wide part's labels point the wrong way, set *Label side* by hand.
- **Use categories** to keep the library short. The search box at the top filters by name and category.
- **Duplicate the built-in terminal blocks** to make other widths or colours. They keep their links and bus bar slots.
- **Export your library now and then** as a backup, since it otherwise only lives inside your diagrams and the browser's storage.
