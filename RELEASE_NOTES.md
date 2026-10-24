# Release notes

Changes to the ready-made libraries are listed separately: each library's folder in [`libraries/`](libraries/README.md) has its own release notes.

## 1.6.1 — 2026-10-24

- **Updated Mechatronics example:** the `#mechatronics` example has been replaced with a newer version. It adds terminal blocks TB6 and TB7, two buses and a new wire type, and reworks some of the wiring. If you've already opened the example, your saved copy is kept; use **File → Load the example** on the `#mechatronics` link to get the new one.

## 1.5.3 — 2026-10-24

- **Mechatronics example:** add `#mechatronics` to DIN Stack's address to open the Mechatronics example, built with the AACC Mechatronics library. That link is a workspace of its own: it starts with the example, keeps its own saved diagram apart from the main one, and **File → Load the example** there loads the Mechatronics example. The plain address works as before. Like the library manager, it needs the online version or an installed copy that has been online.

## 1.5.2 — 2026-10-24

- **New library: AACC Mechatronics** (version 1.0.1), in the library manager (**+** beside the library drop-down). It has TE (Entrelec) ZK2.5 and ZK2.5-4P PI-spring terminal blocks and their end sections, a TB-2503 barrier strip, the Allen-Bradley MicroLogix 1100 PLC in all four 1763-L16 versions, the Siemens SIMATIC NET CSM 1277 switch and PM1207 power supply, and the RHINO PSP05-020S 5 V supply. The README and library guide describe it; the details are in its [release notes](libraries/aacc-mechatronics/RELEASE_NOTES.md).

## 1.5.1 — 2026-10-24

- **Tidier libraries folder:** each ready-made library now has a folder of its own in `libraries/`, with its own release notes beside it. A folder can hold a collection: both AutomationDirect libraries are in `libraries/automationdirect/`. [`libraries/README.md`](libraries/README.md) lists them all. Nothing changes in the app: the library manager finds them as before, and *What's new* opens the library's own notes.

## 1.4.31 — 2026-10-23

- **Cable menu of its own:** the cable settings have moved out of the wire menu into a new cable button beside it, at the bottom right of the drawing.
- **Cable names are now optional:** a new **Cable names** tick box in that menu (and in Settings) shows or hides the cable's name in its labels. With it off, a broken cable's tails just say where the other end goes (*K1* rather than *C1 → K1*), a full-length cable shows only its type along the sheath (e.g. *3G1.5*), and a one-ended cable's free end shows where it goes without the arrow. It's off for new drawings; existing drawings keep showing cable names until you untick it.

## 1.4.30 — 2026-10-23

- **Broken wires:** any wire can now be drawn as a tail at each end instead of a line across the drawing. Select a wire (or several) and set **Draw as** to *Broken: a stub at each end*; each end then gets a short stub labelled with where the wire goes, as in *Stubs* mode. *A line to the other end* does the opposite, e.g. to draw a short jumper as a line when the drawing uses stubs. *As for the drawing* follows the wire menu. It's also on the right-click menu.
- **Broken cables:** the wire menu at the bottom right has a new **Cables** choice: *Full length*, or *Broken (tails)*, which draws each cable as a short length of sheath at each end with a break bar and a label saying where the other end goes (e.g. *C1 → K1*). It's in Settings too, and each cable can override it with **Draw** in its panel or on the right-click menu. A cable whose ends are too close for two tails and their labels is still drawn whole, and a one-ended cable running to a free end is unchanged.
- A cable's end labels now have a white outline, like wire labels, so they read over wires.

## 1.4.29 — 2026-10-23

- **ASUS computer** added to the *Misc networking* library (version 1.0.2): a free-standing computer with six serial ports, two LAN ports, six USB ports, HDMI, DisplayPort and a two-terminal power connector. Click **Refresh** next to the library in the library manager to get it. The README and library guide describe it; the details are in the [library release notes](libraries/misc-networking/RELEASE_NOTES.md).

## 1.4.28 — 2026-10-23

- **Cables move with their parts:** moving the parts a cable's wires land on now moves the cable too, instead of leaving its fan-out points behind (and, for a one-ended cable, its free end). Move everything at both ends and the whole cable moves; move just the parts at one end and that end's fan-out point moves with them. This works when dragging, nudging with the arrow keys, and aligning or packing. Cables whose fan-out points were never dragged already followed their parts, and still do.

## 1.4.27 — 2026-10-23

- **Wire names are now a separate on/off option:** labels that say where a wire goes can show just the connection (*TB101-1*) or lead with the wire's name (*W3 → TB101-1*). Tick or untick **Wire names** in the wire menu at the bottom right of the drawing, or in Settings. It's off for new drawings.
- This works alongside circuit names: the menu's **Named circuits show** picks *Where each wire goes* or *Circuit name*, so a wire labelled with its connection no longer has to carry its wire name.
- Existing drawings keep how they looked: if they showed wire names, *Wire names* is ticked; untick it to hide them.

## 1.4.26 — 2026-10-23

- **Edit several things at once:** with more than one thing selected, the panel now has a section for each kind in the selection, with the settings they share. A change there applies to all of them:
  - *Wires:* profile, colour, stripe, size, conductor, *Match their circuits*, what their labels show, and notes.
  - *Bus bars:* colour, *Match their circuits* and notes.
  - *Cables:* cable profile, type, shielded, twisted pairs, sheath colour and notes.
  - *Parts:* type, colour and description.
  - *DIN rails:* length and profile.
  - *Text notes:* size, colour and bold.
- Settings that differ across the selection show as *Mixed* (an empty box, *(mixed)* in a drop-down, or a half-ticked box) until you change them. Things that are unique to each one, like tags, wire numbers and positions, are left out.

## 1.4.25 — 2026-10-23

- **Choose each wire's label:** a wire in a named circuit can now show either the circuit's name (e.g. *+24V*) or where it goes (e.g. *TB101-1*), whatever the rest of its circuit does. Select the wire and pick under **This wire's label shows** in its *Circuit* section, or right-click one or more wires → **Label shows**. *As for the circuit* goes back to following the circuit.
- The circuit-wide choice is now called **Circuit's labels show**, to tell it apart.

## 1.4.24 — 2026-10-23

- **Land the other end of a cable:** a one-ended cable (cores on terminals, sheath running off to a free end) can now have its other end drawn too. Right-click the cable → **Land the other end…** (or use the button in its panel), then click the terminal each core goes to, in core order. The bar at the top says which core is next, and the panel lists each core with the terminal picked for it. Click a picked terminal again to take it off.
- Press Enter or **Done** once every core has a terminal. The cable is then drawn with both ends, like wires bundled into a cable, and its **Goes to** label is dropped. Its cores keep their wire numbers, colours and profiles. Undo puts the free end back.

## 1.4.23 — 2026-10-23

- **Schmersal pushbuttons, pilot lights and joysticks** are now in the *AutomationDirect pushbuttons & pilot lights* library (version 1.0.2): N series 22 mm and E series 30 mm devices, each EF contact block and the light block, and the NK-T/RK-T joysticks. Click **Refresh** next to the library in the library manager to get them. The README and library guide describe them, including how Schmersal numbers its terminals.

## 1.4.22 — 2026-10-23

- **Two new ready-made libraries** in the library manager (**+** beside the library drop-down):
  - *AutomationDirect pushbuttons & pilot lights*: GCX 22 mm, Fuji Command 30 mm and Eaton HT800 30 mm pushbuttons, selector switches, E-stops and pilot lights.
  - *Misc networking*: a Tripp Lite industrial 5-port switch and PoE++ injector for DIN rail, and the StarTech IH2006 HDMI KVM-over-IP extender.
- The README and library guide describe both. Their contents are in the [library release notes](libraries/README.md).

## 1.4.21 — 2026-10-23

- **One label per circuit at a terminal:** when labels show circuit names and several wires of the same circuit meet at one terminal (a daisy chain, for example), the terminal now shows a single stub and label for them, e.g. one *+24V* instead of two. Clicking it selects the first of those wires, and it's highlighted when any of them is selected. Wires labelled by terminal or wire name still get a stub and label each, since their labels differ.

## 1.4.20 — 2026-10-23

- **Circuit labels per circuit:** a named circuit can now choose how its wires are labelled, whatever **Name in labels** is set to for the drawing. Select one of its wires (or bus bars) and set **Labels show** in the *Circuit* section of the right panel:
  - *As set for the drawing* (the default);
  - *Circuit name*: its wires show the circuit's name (e.g. *+24V*) instead of where they go;
  - *Where each wire goes*: its wires never show the circuit's name.
- For example, label only *+24V* and *0V* with their names and everything else with its terminals. The choice is saved with the diagram, by circuit name.

## 1.4.19 — 2026-10-23

- **Circuit name or terminal, not both:** with **Name in labels** set to *Circuit name*, a label now shows the circuit's name (e.g. *+24V*) if the wire's circuit has one, and otherwise the terminal it connects to (e.g. *TB101-1*), never both together. With straight or curved lines, a named circuit's wire shows its name at the middle of the line and no labels at its ends. *Wire name* is unchanged (*W3 → TB101-1*).

## 1.4.18 — 2026-10-23

- **Circuit names in labels:** *Include wire name* in the wire button's menu (and Settings) is now **Name in labels**, with three choices:
  - **No name:** labels just say where each wire goes.
  - **Wire name:** the wire's number, as before (*W3 → TB101-1*, or *W3* at the middle of each line).
  - **Circuit name:** the circuit's name instead (*+24V → TB101-1*, or *+24V* at the middle of each line). Wires in a circuit with no name show no name.
- **No stray arrows:** the arrow now only appears between a name and where the wire goes. Without a name, a label is just the destination, e.g. *TB101-1* rather than *→ TB101-1*. This includes the labels at the ends of straight and curved lines.

## 1.4.17 — 2026-10-23

- **Wire view options:** the wire button at the bottom right (and Settings) now sets the wire style and the labels separately.
  - Style: **Stubs** (a short stub at each terminal), **Straight lines** or **Curved lines**.
  - **Labels** (tick box): where each wire goes, shown at its terminals, e.g. *→ TB101-1*. This now works with lines too.
  - **Include wire name** (tick box): adds the wire's number, in front of the label with stubs (*W3 → TB101-1*), or at the middle of each line.
  - The tick boxes leave the menu open, so you can set both at once. The printout and exported images follow the same settings.
- The *None* choice is gone. A diagram saved with *None* opens as stubs with both tick boxes off.

## 1.4.16 — 2026-10-23

- **Cleaner cable ends:** with **Wires** set to *Labels*, a wire that's a core of a cable no longer gets a short coloured stub at its terminal as well, since the cable already draws the core from the terminal into the sheath. Its label (e.g. *W1 → C2-1*) still shows in the same place. Wires that aren't in a cable keep their stubs.

## 1.4.15 — 2026-10-23

- **Tidier library:** every category in the library now starts folded, so a library first shows just its category names. Click one to open it; the ones you open stay open. The fold button beside the search box still opens or folds them all, and searching shows every match whatever is folded. (Because of this change, categories you'd opened or folded before start folded once.)

## 1.4.14 — 2026-10-23

- **Selection filter:** a new funnel button in the view tools at the bottom right, beside the wire button, limits what you can select. Its *Select only* menu has parts, wires, cables, bus bars, DIN rails and text notes. Pick one for only that kind; with a filter on, each tick adds or removes a kind, and *Anything (no filter)* turns it off.
  - While it's on, the button turns blue and says what's allowed (e.g. *Only wires*), and the cursor over the drawing becomes a crosshair with a small funnel.
  - Clicks pick only the allowed kinds, and terminals don't start wires. Dragging on empty space (or on something not allowed) draws a selection box that picks up the allowed kinds, including wires, bus bars and cables with an end inside the box. Shift adds to the selection. Ctrl+A selects everything allowed.
  - **Space** or **Esc** turns the filter off. Esc keeps what you just selected, so you can act on it; press Esc again to clear the selection. Space + drag still pans the drawing.

## 1.4.13 — 2026-10-23

- **Cable connectors:** a terminal can now be a *Cable connector*: a socket, such as an RJ45 port or a motor connector, that takes a cable's plug rather than single wires. It's drawn as a socket, and set with **Type** in the object type designer.
  - Drag from one connector to another to plug a cable in between them, e.g. a patch lead from a switch to a PLC. Dragging a single wire onto a connector is refused, with a hint.
  - Right-click a connector for *Plug in a cable…*, or *Select cable* and *Unplug the cable* when one is plugged in.
  - A cable whose cores land on terminals can plug into a connector at its other end, such as a motor cable from a drive's U, V, W and PE to the motor's socket. Click the connector while picking its terminals, or use **Plug into a connector…** in the cable's panel.
  - A plugged cable leaves its socket straight out and curves round to its other end. A *Connectors* section in the cable's panel lists where it's plugged in, and the cable list has *From* and *To* columns.
- **New built-in types** (category *Network* and others): Ethernet switches with 5 and 8 RJ45 ports and +V, 0V and FE terminals, an RJ45 panel feed-through, an M23 motor panel socket (U, V, W, PE inside and a plug outside), and a 3-phase motor with a connector. Diagrams that use the built-in library get them automatically.
- **Cable profiles:** named cable types, alongside wire profiles: sheath colour, type (e.g. Cat6 S/FTP 4×2×AWG24), *Shielded*, *Twisted pairs* and notes. Five starter profiles are included (Ethernet Cat6, industrial Ethernet shielded, motor cable shielded, control cable, mains cable).
  - Pick one under **Cable profile** in a cable's panel, or from its right-click menu. Editing a profile updates every cable that follows it; changing a cable by hand makes it custom.
  - Edit them in the profiles window, now *Wire and cable profiles*, from *Edit cable profiles…* in the right panel with nothing selected.
  - Any cable can be marked *Shielded* or *Twisted pairs*. A shielded cable is drawn with a dashed outline along its sheath. The wires inside a cable keep their own wire profiles.
  - Exported libraries include cable profiles, and importing one merges them.

## 1.4.12 — 2026-10-23

- **Library sidebar fixes:**
  - Long category names (such as the AutomationDirect library's) no longer make a sideways scroll bar appear under the library. They're shortened with "…", and the full name shows when you hover over them.
  - The **⋯** menu beside the library drop-down no longer runs off the left edge of the window. It now fits the width of the sidebar, and long entries such as *Export "AutomationDirect DIN-rail relays"* are shortened, with the full text on hover.

## 1.4.11 — 2026-10-23

- **Show only these wires:** with wires selected (or a cable), right-click and choose *Show only these wires* (*Show only this wire* for one), or use the button under *Wiring* in the right panel. Every other wire is hidden from the drawing so you can follow just those.
  - While wires are hidden, the view tools at the bottom right say how many are shown, e.g. *Showing 3 of 10 wires · Show all*. Click it, or right-click empty space and choose *Show all wires*, to bring them back.
  - It's only a view: hidden wires stay in the diagram and the wire list, new wires you draw still show, and printouts and exported images include every wire. Opening a file, starting a new diagram or loading the example shows all wires again.

## 1.4.10 — 2026-10-23

- **View tools in their own group:** the wire button now sits in its own small box just left of the zoom buttons, instead of sharing their box. Future view options will join it there, keeping zoom separate.

## 1.4.9 — 2026-10-23

- **View tools:** the **Wires** strip across the top right of the drawing is now a single wire button in the bottom-right corner, next to the zoom buttons. Click it for a small menu of *None*, *Labels*, *Straight lines* and *Curved lines*, with a tick on the current one. Hover over the button to see which is in use. This leaves the top of the drawing clear.

## 1.4.8 — 2026-10-23

- **Help menu:** a new **Help** menu next to **Export** has *How to use DIN Stack* (the help, still also on the **?** key) and *Welcome tips*. The **?** button at the top right is gone.
- **Getting started removed:** the right panel no longer shows the *Getting started* tips with nothing selected. Its buttons all live elsewhere now: *Welcome tips* and help in the **Help** menu, and Settings at the top right.

## 1.4.7 — 2026-10-23

- **Shorter library manager:** each library's description is folded away by default. Click the arrow (or the library's name) to show or hide it. Ones you open stay open while you load, refresh and unload.

## 1.4.6 — 2026-10-23

- **Library manager:** **+** beside the library drop-down now opens *Included libraries*, a manager for the ready-made libraries that come with DIN Stack. Each one shows whether it's loaded in this diagram, its version, and how many parts use it, with:
  - **Load** to add it;
  - **Refresh** to load it again and pick up changes. It's highlighted when a newer version is out, and it also removes types the library no longer has, unless a part still uses them;
  - **Unload** to remove it. If parts use its types, it asks first and removes those parts and their wires too.
- **Refresh all** at the bottom refreshes every included library in the diagram. The window stays open between actions, and **Undo** reverses each one.
- In the **⋯** menu, *Add a ready-made library…* is now *Manage included libraries…*.

## 1.4.5 — 2026-10-23

- **Library versions:** each ready-made library now has its own version number and its own history, in the new [library release notes](libraries/README.md). Library fixes are recorded there from now on, not here.
- **+ Add a library…** shows each library's version with a *What's new* link. A diagram remembers which version of a library it loaded. When a newer version is available, or the library was added before it had a version number, its **Update** button is highlighted and the list says which version the diagram has.
- The first library update under this scheme is *AutomationDirect DIN-rail relays* 1.0.1, which corrects the MIRO 12.4 relay's terminal layout. Use **Update** to get it.

## 1.4.4 — 2026-10-23

- **Wire lines replace the labels:** with **Wires** set to *Straight* or *Curved*, wires are drawn as lines between the terminals without the destination labels (`W3 → TB101-1`) at each end, which used to be drawn underneath the lines as well. Each line shows its wire number at the middle; click it or the line to select the wire.
- **No wires:** a new **None** choice in **Wires** (and in Settings) hides wires and cables on the drawing, for a layout view. They're still in the wire list, a selected wire's terminals are still ringed, and printouts and exported images follow the setting. Bus bars and connector labels still show.
- The *Show where each wire goes* tick box in Settings is gone, since *Labels* and *None* cover it. A diagram saved with it unticked opens with **Wires** set to *None*.

## 1.4.3 — 2026-10-23

- **Adding from the right-click menu:** the *Add* toolbar at the top left of the drawing is gone. Right-click empty space on the drawing for **Add**: *DIN rail here*, *Text note here*, *Bus bar…* and *Cable…*. Bus bars and cables can still be started from a terminal's right-click menu too.
- The welcome tips, help and *Getting started* say where to find them.

## 1.4.2 — 2026-10-23

- **Welcome tips:** the first time DIN Stack is opened in a browser, a short welcome explains how to place parts, wire them, edit them and keep your work. From there you can explore the example, start a blank diagram, or open the help. It appears only once, and not at all for anyone who has already used DIN Stack in that browser.
- **Welcome tips** in the *Getting started* section of the right panel (with nothing selected) shows it again.

## 1.4.1 — 2026-10-23

A reorganised interface. Everything works as before; some things have moved.

- **Top bar:** *New*, *Open*, *Save* and *Load the example* are under **File**. Print, images and the CSV wire list are under **Export**. Undo and redo are at the right, with **Settings** (the sliders button) and **Help**.
- **On the drawing:** **Add** (rail, note, bus bar, cable) is at the top left. **Wires** (labels, straight or curved lines) is at the top right, and zoom is at the bottom right.
- **Bus bars and cables:** while you pick terminals, a bar across the top of the drawing shows how many are picked, with **Done**, **Cancel** and *Keep 1st, 3rd… / 2nd, 4th…*.
- **Settings dialog:** the snap grid, text sizes, wire standard, terminal reference style, build direction and display options are in one place. They used to sit in the side panel with nothing selected.
- **Inspector (right panel):** each item shows what it is, its name, and quick buttons (rotate, duplicate, edit type, delete, swap ends…) at the top. Its settings are in sections you can fold, such as *Part*, *Strip* and *Terminals* for a part, or *Wire*, *Cable* and *Circuit* for a wire. Folded sections stay folded.
  - With nothing selected, it shows the diagram: counts of parts, wires, cables and bus bars (click one to open that list), the title block, wire profiles, and a few tips.
  - A part's *Type* list is grouped by library.
  - Selecting several wires offers *Select whole circuit* and *Select daisy chain* in the panel, not just the right-click menu.
- **Lists (bottom):** each tab shows how many it holds. A **Filter** box narrows the list shown, and the wire list has a **CSV** button. Drag the top edge to make the lists taller or shorter, or double-click the tab bar to hide them. The tab, height and hidden state are remembered.
- **Library:** the **+** next to the library drop-down adds a ready-made library, and its window now also has *Import a library file…*. The **⋯** menu has import and export. The fold button beside the search box folds or unfolds every category.
- **Help** is split into topics, and **?** opens it.
- Clicking the drawing now closes an open menu.
- Icons throughout, and the dark theme is more consistent.

## 1.3.1 — 2026-10-23

- **Amphenol 26482 Series 2 library:** a new ready-made library, *Amphenol 26482 Series 2 connectors*, in **+ Add a library…**. It has 68 circular panel receptacles: all 34 MIL-DTL-26482 Series 2 insert arrangements, from shell size 8 to 24, each with pins and with sockets.
- Contacts carry the catalog's letters and are laid out as seen from the wire side. Pin inserts are mirrored, and the master key is at the top. Search for an arrangement such as `14-19` to find it.

## 1.2.2 — 2026-10-23

- **UT accessories:** the *Phoenix Contact UT terminal blocks* library now has 64 types, adding the accessories that take up rail space:
  - partition plates for UT, TWIN, QUATTRO, UTTB and three-level blocks, and the UTTB spacer plate;
  - end clamps: CLIPFIX 35-5, CLIPFIX 35, E/UK and E/NS 35 N.
- Plug-in bridges aren't separate types: draw them as bus bars through the blocks' bridge slots. If you added the library before, use **Update** in **+ Add a library…** to get the new types.

## 1.2.1 — 2026-10-22

The first change after the 1.1.3 commit, so the middle number goes up. Developed as 1.1.4 and 1.1.5 (the UT accessories above); those numbers were never released and are skipped.

- **Phoenix Contact UT library:** a new ready-made library, *Phoenix Contact UT terminal blocks*, in **+ Add a library…**. It has 54 types:
  - feed-through blocks from UT 1,5 to UT 35, in grey and blue;
  - ground (PE) blocks;
  - TWIN (3-connection) and QUATTRO (4-connection) blocks;
  - double-level UTTB and three-level blocks, including PE/L/N;
  - fuse (HESI) and disconnect (HEDI, MT, MTD) blocks;
  - end covers.
- Sizes come from Phoenix Contact's catalog, and each type's name includes its order number. Feed-through and ground blocks have two bridge slots in the middle, like the built-in terminal blocks, and can be swapped with them without losing wires.

## 1.1.3 — 2026-10-22

- Added `TODO.md`, a list of open items. Most are the AutomationDirect library types whose terminal layout still needs checking against real hardware.

## 1.1.2 — 2026-10-22

Numbered 1.0.35 while developed on its own branch, renumbered to follow 1.1.1 (the to-do list above was 1.0.36).

- **AutomationDirect relay library:** a ready-made library, *AutomationDirect DIN-rail relays*, with the DIN-rail relays, timers, monitoring relays and relay sockets that AutomationDirect sells. Add it from **+ Add a library…** at the bottom of the library drop-down.
  - 59 object types covering 206 part numbers, in seven *AD relays* categories: interface, solid state & optocoupler, force guided, intrinsically safe, monitoring, timers and sockets.
  - Brands: Murrelektronik, Klemsan, Dold, Gefran, Macromatic, Fuji Electric and AutomationDirect's own sockets.
  - Sizes come from AutomationDirect's drawings, and terminals carry the names printed on the devices. Terminal positions are approximate.
  - Search the library by part number (for example `52000`, `RK7814` or `GRSH`) to find the type that covers it.
- The library guide has a new *Libraries that come with DIN Stack* section explaining how it's organised.

## 1.1.1 — 2026-10-22

Version number set by hand as a new minor release. It brings together the changes made since 1.0.34, which were numbered 1.0.35 and 1.0.36 during development and never released under those numbers.

- **Separate libraries:** object types are now kept in named libraries instead of one long list. A drop-down above the search box picks which one is shown:
  - *Built-in* has the types that come with DIN Stack.
  - *My types* has the types you've made.
  - Each imported library file becomes its own library, named after the file, and is shown straight after importing.
  - *All libraries* shows everything at once, for searching across all of them.
- New types go into the library being shown. The type designer has a new **Library** field, so you can move a type to another library or start a new one.
- **Add a library:** pick **+ Add a library…** at the bottom of the library drop-down to see the ready-made libraries that come with DIN Stack, and add one with a click. Each is loaded as its own library and shown straight away. One already in the diagram offers **Update**, to load it again.
  - The list comes from `libraries/index.json`. It needs the online version or an installed copy; when DIN Stack is opened straight from `index.html`, the chooser explains how to import a library file by hand instead.
  - No ready-made libraries are listed yet. They'll appear as library files are added to `libraries/`.
- **Export library** now saves just the library shown, in a file named after it. Pick *All libraries* to export everything as before.
- Library files can carry a `name`, used as the library's name when imported.
- Diagrams and library files from earlier versions open as before. Their built-in types go into *Built-in* and the rest into *My types* (or, when importing, a library named after the file).

## 1.0.34 — 2026-10-22

Version number set by hand: kept in the 1.0 series rather than moving to 1.1.1.

- A **GitHub** link next to the version number, at the bottom of the library panel, opens the project page.
- The README links to the online version at https://mmmlinux.github.io/DIN-Stack/.

## 1.0.33 — 2026-10-22

- Finished the rename to DIN Stack: the app's storage in the browser, its offline copy and the marker inside exported library files now use the new name too.
- Work autosaved in the browser by earlier versions isn't picked up. Open a saved `.json` file to continue with it. Diagram and library files from earlier versions still open as before.
- Installed copies clear out all older offline caches when they update.

## 1.0.32 — 2026-10-22

- **Renamed to DIN Stack** (previously DIN Sizer). The new name appears in the app, its browser tab, the installed app and the documentation.
- *Export library* now downloads `dinstack-library.json`. Library and diagram files saved under the old name still open, and work saved in your browser carries over.

## 1.0.31 — 2026-10-22

- **Add moved to the toolbar:** *Rail*, *Note*, *Bus bar* and *Cable* are now in the top toolbar under **Add**, so they stay available when the library panel is hidden.
- The left panel now holds only the library. Its **«** hide button sits next to *+ New type*.

## 1.0.30 — 2026-10-22

- **Collapsible object library:** click a category's name (e.g. *Terminal blocks*) to fold it away, and click again to open it. Each category shows how many types it holds. The ⊟ button next to *+ New type* folds every category, and ⊞ opens them all again.
- Searching shows all matching types, even in folded categories.
- **Hide the left panel:** **«** at the top of the left panel shrinks it to a thin strip, giving the drawing more room. Click **»** on the strip to bring it back.
- The app remembers which categories are folded and whether the panel is hidden, in this browser. It isn't saved with the diagram.

## 1.0.29 — 2026-10-22

- **One-ended cables:** for a cable whose other end isn't on the drawing, such as a field device, a pump or a sensor:
  1. Click **Cable** under Add, or right-click a terminal → *Cable from here…*.
  2. Click the terminals its cores go to, in core order (or drag along a row).
  3. Press Enter.
  
  The cores sweep from the terminals into a sheath that runs off to a free end, marked with a short bar.
- Each cable has a label, a description (e.g. `4x0.75 LiYY`) and a new **Goes to** field. "Goes to" is written past the free end, e.g. "→ Pump P1".
- Each core is a wire, so it has its own number, colour, size and profile, and it's listed in the wire list as going to **C1-1**, **C1-2**… Circuit highlighting works as usual.
- **Changing it:** *Add cores…* picks more terminals. Removing a core in the cable's list deletes it. Deleting the cable deletes its cores. Drag the orange dots to move the fan-out point and the free end, and *Reset layout* puts them back.
- By default the cable leaves in the direction the terminals face, and starts beyond the wire labels so it doesn't cover them.
- Wire labels now have a thin paper-coloured outline, so they stay readable where a wire or cable runs underneath.
- The *Add* buttons are laid out two to a row.

## 1.0.28 — 2026-10-22

- **Cables (bundled wires):** select the wires that run in one cable, then click **Bundle into a cable** in the panel, or right-click → *Bundle into a cable*. The cable is drawn as a thick sheath between the two ends. At each end the cores sweep out of the sheath, each in its own colour (stripes included), to its terminal. This shows even when *Wires* is set to *Labels only*.
- Each cable has a label (C1, C2…), a description such as `3G1.5 H07RN-F`, a sheath colour and notes. The label and description are written along the sheath.
- With a cable selected, drag the orange dots at the ends of the sheath to move where the cores fan out. **Reset fan-out points** puts them back where they're worked out automatically.
- **Managing cables:**
  - Add wires to a cable by Shift-selecting them with it. Take one out from the wire's panel, the cable's core list, or the right-click menu.
  - **Unbundle** (or Delete) removes the cable and keeps its wires. *Delete cable and wires* removes both.
  - Copying or duplicating parts carries their cables along.
- **Lists:** the wire list, CSV and printout have a new *Cable* column, there's a new **Cables** tab, and the printout includes a cable table.
- **New loose part:** *Mains plug (L, N, PE)*, under *Enclosure connectors*, for a power cable coming in from outside. Existing diagrams get it added once.

## 1.0.27 — 2026-10-22

- **Grids of terminals in the object type designer:** *Add a grid of terminals* places a block such as a 2 × 16 header or an IC footprint. You set columns, rows, the pitch across and down (2.54 mm by default), and the position (or leave it centred).
- **Numbering options:**
  - *Rows, wrapping* (1 2 / 3 4 …)
  - *Columns, wrapping*
  - *Around, counter-clockwise like an IC* (1–16 down the left, 17–32 back up the right)
  - *Around, clockwise*
  - *Row letter + number* (A1… B1…)
  
  *Pin 1 at* sets the starting corner, and *First name* sets the starting name.
- Grid terminals face their labels away from the grid: left and right columns outward, or top and bottom rows outward. A new grid starts out selected, ready to drag into place.
- **Closely pitched terminals:** dots now shrink to fit the spacing between terminals, so pins at 2.54 mm no longer overlap. Below about 3.6 mm, each pin's name is printed inside its dot, both on the diagram and in the designer. Existing parts, with wider spacing, look the same as before.
- A part's tag now steers clear of any terminals under it, not only those on the top and bottom edges. When only the tag fits, the type name underneath is left off.
- The library guide has a new section on grids.

## 1.0.26 — 2026-10-22

- **Ctrl-drag snaps the whole group:** when you push parts along with Ctrl held, the whole moving group snaps, not just the part you grabbed. Any of its edges can sit flush against the parts staying put, or line up with them. For example, sliding a strip right closes up flush against the next part on the rail, and a small drag snaps back to where it started. Edges also line up with parts on a nearby rail. Hold **Alt** as well to move without snapping.

## 1.0.25 — 2026-10-22

- **Striped wires:** a wire's panel has a new **Stripe** setting for a tracer stripe in any wire colour, e.g. red with a white stripe, or white with a green stripe. The stripe is drawn as short dashes over the base colour on the drawing, in both the wire stubs and drawn lines.
- Striped wires are listed with the base colour first, like **Red/White**, in the wire list, CSV export and printout, with a striped colour chip.
- **Wire profiles can have a stripe**, set in a new *Stripe* column of the profiles dialog. Wires following the profile take it. Adding or changing a stripe on a profile wire by hand makes it a custom wire, the same as changing its colour.
- New wires that match their circuit copy its stripe too. Green/yellow already has its own banding, so it can't take a stripe.

## 1.0.24 — 2026-10-22

- **Ctrl-drag only pushes what's touching:** holding Ctrl while dragging now moves only the parts snapped against the selection on that side, then the parts touching those, and so on. The first gap stops it. For example, dragging TB103 right moves the rest of the strip and its end stop, but not a relay further along the rail with space before it. Previously everything level with the selection moved, gap or not.
- Rails are never pushed, only the parts on them.

## 1.0.23 — 2026-10-22

- **Select and move several terminals in the object type designer:**
  - Drag a box over empty space to select terminals. Shift- or Ctrl-click (in the preview or the table) adds or removes one, and Ctrl+A selects all.
  - Drag any selected terminal to move the whole group. The grabbed terminal snaps to the grid, the rest keep their spacing, and the group stays inside the outline. Hold Shift to move straight.
  - Arrow keys nudge the selection (Shift for ten steps), Ctrl+D duplicates it, and Delete removes it.
  - Esc clears the selection first, and a second Esc closes the designer.
- **Selection bar** under the preview: *Align in a row*, *Align in a column*, *Space evenly*, *Link together*, *Duplicate* and *Delete*.
- In the terminal table, changing Type, Label side or Link on a selected row applies to all selected terminals.
- **Undo and redo inside the designer** (Ctrl+Z, Ctrl+Y) for terminal moves, edits, rows, deletions and the size and colour fields.
- A newly added row of terminals starts out selected, ready to be dragged into place.
- Clicking the preview now takes keyboard focus, so Delete, the arrow keys and Esc act on the terminals rather than the last text box you typed in.
- A plain click on empty space still adds a terminal, as before.

## 1.0.22 — 2026-10-22

- **Right-click menus** on the drawing:
  - **Parts:** edit object type, duplicate, copy, repeat once, rotate, select all of the same type or tag prefix, new bus bar, delete.
  - **Terminals:** the part's menu, plus *Start a wire here*, *Connector label…* (jumps to that terminal's label box) and *Bus bar from here…*.
  - **Wires:** select whole circuit or daisy chain, swap ends, pick a wire profile (the current one is ticked), delete.
  - **Bus bars:** edit terminals, select whole circuit, delete.
  - **Rails:** fit to parts, duplicate, copy, delete. **Text notes:** edit text, duplicate, copy, delete.
  - **Empty space:** paste here, add a DIN rail or text note here, new bus bar, undo, redo, select all, fit to window.
  - **Several things selected:** duplicate, copy, rotate, pack and align, circuit selection, wire profile, and delete for the whole selection.
  - **While picking terminals for a bus bar:** Done, *Keep 1st, 3rd…*, *Keep 2nd, 4th…*, Cancel.
- Right-clicking something selects it first. If it's already part of a multiple selection, the selection is kept.
- The menu works from the keyboard: arrow keys to move, Enter to choose, Esc to close. Keyboard shortcuts are shown next to their menu items.

## 1.0.21 — 2026-10-22

- **Loose connectors:** a new *Enclosure connectors* group in the library has 2-, 4- and 8-pin panel connectors and a round M12 4-pin connector, for connections that go to the enclosure rather than the rail. They're tagged X1, X2…, and their wires read like `X1-3`.
- **Mounting setting for object types:** in the designer, *DIN rail* (as before) or *Loose (enclosure, panel, cable)*. Loose parts can be placed anywhere: they don't snap onto rails or get carried along when a rail is moved, but still line up with neighbouring parts. They show "loose" in the library and on the part's panel.
- Clicking a loose part in the library while a rail part is selected no longer puts it on the strip next to that part. It's placed in view instead. Clicking it with another loose part selected still places it alongside.
- Diagrams saved before this version get the new connector types added to their library once. If you delete them, they stay deleted.
- On wide parts whose terminals would cover the centred tag, such as the connectors, the tag now moves into the free space below the terminals.
- The library guide covers the Mounting setting and the new connectors.

## 1.0.20 — 2026-10-22

- **Push to make room:** hold **Ctrl** (Cmd on a Mac) while dragging a part, or a selection of parts, and everything beyond it in the direction you drag moves along with it. Drag TB103 right with Ctrl to open a gap after TB102, and TB104 onwards, the end stop and anything else further along that row all shift together.
- Only items level with what you're dragging are pushed: the rest of its row when moving sideways, or what's directly above or below it when moving up or down. Parts on other rails stay where they are, and so does the rail itself.
- While Ctrl is held the move stays straight (purely sideways or purely up and down), and a hint shows how many items are being pushed. You can press or release Ctrl mid-drag. Wires and bus bars stay attached, and one undo puts everything back.

## 1.0.19 — 2026-10-22

- **Library guide:** a new document, `docs/library.md`, explains how to build your object library. It covers every setting in the designer, adding terminals (by clicking, by row or by typing positions), label sides, internal links and bus bar slots. It also has a worked example, notes on changing types that are already in use, exporting and importing libraries, and the library file format for anyone who wants to generate libraries with a script.
- The help (**?**) and the README link to the guide.

## 1.0.18 — 2026-10-22

- **Select daisy chain:** next to *Select whole circuit* in a wire's or bus bar's panel. It selects only the wires and bus bars joined to each other at the same terminals, such as a chain of jumpers along the tops of a terminal strip. It doesn't follow connections through a part, so wires on the other side of the terminal blocks aren't included. Wires joined only by a shared circuit name or connector label aren't included either.
- The button shows how many it will select, and only appears when the chain is smaller than the whole circuit.

## 1.0.17 — 2026-10-22

- **Bus bars match their circuit too:** a new bus bar takes the colour of the wires in its circuit instead of always starting copper. It keeps following, so changing the feed wire's colour by hand changes the bus bar too.
- Changing a bus bar's colour by hand stops it following, and wires or bus bars that follow it change to match. A bus bar's panel has the same **Match the circuit** tick box as a wire.
- A new wire joining a circuit that has bus bars but no wires takes the bus bar's colour, and follows it.
- Bus bars made before this version don't follow anything until you tick the box.

## 1.0.16 — 2026-10-22

- **Install as an app:** when DIN Sizer is opened from its website (such as GitHub Pages), browsers now recognise it as a web app. In Firefox on Windows, use "Add to taskbar" in the address bar. In Chrome or Edge, use the install button. It then opens in its own window with its own icon.
- **Works offline:** once installed or visited, the app keeps working without a connection. When online it always loads the latest version.
- New app icon: terminal blocks on a rail, with two bus bars.

## 1.0.15 — 2026-10-22

- **New wires match their circuit:** a new wire that joins a circuit already holding wires takes on their profile, colour, size and conductor. It first looks at the terminal you started from and its circuit, then the other end. Matching beats the old guess from terminal names.
- Matching wires keep following. If you later change a wire in the circuit by hand, for example the wire from the power supply to the terminal that feeds a bus bar, the matching wires change with it.
- Changing a matching wire by hand stops it following, so your change sticks. The wire's panel has a **Match the circuit** tick box to turn following back on, which copies the circuit's wire again.
- Wires in diagrams saved before this version don't follow anything until you tick the box.

## 1.0.14 — 2026-10-22

- **Circuit names:** select a wire or bus bar and type a *Circuit name* under Circuit, such as `+24V`, `0V` or `L1`. The name applies to the whole circuit, so wires added to it later pick it up automatically.
- **Connector labels:** select a part and type a label next to any terminal in its Terminals list. The label is drawn at the terminal as a boxed tag. Use it where a connection comes from somewhere you don't want to wire up on the drawing, such as a power feed.
- The same name means the same circuit. Terminals with the same connector label, and wires or bus bars with the same circuit name, are treated as connected even with no wire between them. Circuit highlighting follows them. Names aren't case-sensitive.
- Renaming a circuit also renames the connector labels in it. Clearing a circuit name leaves its connector labels alone.
- The wire list, bus bar list, CSV export and printout have a new **Circuit** column. Name fields suggest names already in use, and hovering a labelled terminal shows its label.
- The example now names the +24V and 0V circuits and labels the incoming L1 and N supply.

## 1.0.13 — 2026-10-22

- **Bus bar slots:** terminal blocks now have two slots in the middle that take bus bars but not wires, like the bridge shafts on real blocks. Use one slot for each bar to connect alternate blocks in a row, for example +24 V on every other block and 0 V on the rest.
- While picking terminals for a bus bar, **Keep 1st, 3rd…** and **Keep 2nd, 4th…** thin the picked terminals to every other one along the row. Sweep the whole row of slots, then keep the half you want.
- Each block a bar connects to gets a coloured contact dot. A bar that passes over a block without a dot doesn't connect to it.
- Slots can only be clicked while picking for a bus bar. At other times, clicking one selects the block or bar as usual.
- The object type designer has a new **Type** column, *Wire* or *Bus bar slot*, so your own types can have slots too.
- Built-in 2-wire, blue, ground and 4-wire terminal blocks get their slots automatically, including in diagrams you've already saved. Slots you delete in the designer stay deleted.
- Tags on narrow parts now sit in the free space between terminals rather than behind them.
- The example diagram's strip now alternates +24 V and 0 V blocks, bridged with two bus bars.

## 1.0.12 — 2026-10-22

- **Wire standard:** a new setting under Display (nothing selected) switches between **Metric** (mm² sizes, brown line, blue neutral, green/yellow earth, as before) and **American** (AWG sizes, black hot, white neutral, green ground).
- Switching converts the whole diagram. Wire and profile sizes change to the nearest standard size (1.5 mm² becomes 16 AWG, and so on), and AC line, neutral and earth wires change colour. Other colours, such as +24 V red and 0 V blue, stay as they are. Switching back restores the original sizes exactly.
- The starter profiles are renamed to match, for example *Protective earth* becomes *Ground (PE)*. The size suggestions list only the chosen system's sizes.
- New diagrams and *Load example* keep the current standard.
- Fixed: a new wire to a terminal named N now picks the AC neutral profile rather than 0 V DC.

## 1.0.11 — 2026-10-22

- **Wire profiles:** set up named wire types, each with a colour, size and conductor (stranded or solid), and assign wires to them. Pick a profile on a selected wire, or select several wires (for example with *Select whole circuit*) and assign them all at once.
- Editing a profile updates every wire assigned to it. Changing a wire's colour, size or conductor by hand makes it a custom wire again.
- Open **Edit wire profiles…** from the Diagram panel (nothing selected) or with *Edit…* next to a wire's profile. It comes with six starter profiles: +24 V DC, 0 V DC, protective earth, AC line, AC neutral and control signal.
- New wires pick a fitting profile automatically: the one whose colour matches the terminal (+, 0 V, PE, L, N), otherwise the last profile you used.
- Wires now record **Conductor** (stranded or solid). The wire list, CSV export and printout gain *Conductor* and *Profile* columns.
- *Export library* now includes your wire profiles, and *Import library* adds them, so profiles can be reused across diagrams.

## 1.0.10 — 2026-10-22

- **Bus bars:** bridge a row of terminals with a bus bar, such as a jumper comb across several terminal blocks. Click **Bus bar** under Add (or *Bus bar…* on a selected part), then click the terminals or drag along the row, and press Enter. The bar is drawn as a thick line through the terminals.
- Bus bars count in circuit highlighting: selecting a wire lights up the bars in its circuit and everything they bridge.
- Each bus bar has a label (BB1, BB2…), a colour and notes, and its terminals can be edited later. Bus bars have their own tab next to the wire list, are included when printing, and are copied when you duplicate or copy the parts they bridge.
- The example diagram now has bus bars across the +24 V and 0 V terminal blocks.

## 1.0.9 — 2026-10-22

- **Circuit highlighting:** selecting a wire now also highlights the rest of its circuit in lighter blue. This covers every wire connected to it, including through the other side of a terminal block, along with their terminals and their rows in the wire list. The wire's panel lists the other wires in the circuit and has a *Select whole circuit* button.
- **Internal connections in object types:** the designer has a new **Link** column. Terminals with the same Link value are treated as connected inside the part. Use *Link all* or *Clear links* for quick setup, and dashed lines in the preview show the links.
- The built-in types come linked where it makes sense: terminal blocks and fuse terminals end to end, each pole of a breaker from top to bottom, and the power supply's +V pair and −V pair. Diagrams saved before this version get these links automatically. Types you created yourself start with no links.

## 1.0.8 — 2026-10-22

- When a terminal has several wires, their labels are now arranged to match where the wires go. On a top or bottom terminal, a wire to a part on the left sits in the left lane and a wire to the right sits in the right lane. On side terminals, wires going up sit above wires going down. If two wires head the same way, they're ordered by wire number.

## 1.0.7 — 2026-10-22

- When a terminal has more than one wire, each wire now gets its own stub, in its own colour, and its own label, side by side in wire-number order. Previously they were squeezed into one comma-separated label. Each label can be clicked on its own to select that wire.

## 1.0.6 — 2026-10-22

- **Renumber tags:** select several parts and renumber them in the order they sit: left to right, right to left, or top to bottom. You choose the prefix, start number and step, with a live preview. Leading zeros are kept, so starting at `001` gives 001, 002, … Wires stay connected, and you're told if a new tag is already used by another part.
- New buttons on a selected part: **All of this type** and **All "TB…"** select every matching part in one click. The second picks up every part with the same tag prefix, such as grey, blue and ground terminal blocks together.

## 1.0.5 — 2026-10-22

- Fixed: dragging objects from the library onto the sheet now works reliably with any mouse, touchpad or pen. While you drag, a preview of the part follows the cursor, snapping to rails and neighbouring parts, and the part is placed where you let go. Press Esc to cancel or hold Alt to place freely.

## 1.0.4 — 2026-10-22

- Parts snap onto DIN rails much more readily. A part now centres on a rail from at least 12 mm away (more when zoomed out), and this takes priority over lining up with nearby parts.
- Hold **Alt** while dragging to turn snapping off and place a part freely.

## 1.0.3 — 2026-10-22

- Terminal references now read like **TB101-1** and **TB101-2**: the part's tag, a dash, then the terminal name. To use a different character, change *Terminal reference* under Display (nothing selected). The choices are `-`, `:`, `.`, `/` or a space. This applies to wire labels, the wire list, CSV and print.
- Built-in terminal blocks now use the tag prefix **TB**. The example diagram's strip is numbered TB101–TB107.

## 1.0.2 — 2026-10-22

- New **Left → right / Right → left** toggle for building strips. With right to left, parts added beside the selected one, *Repeat* copies and *Pack side by side* all go leftwards, and tags still count up. You'll find the toggle under the Repeat control, in the Arrange tools when several parts are selected, and under Display when nothing is selected. It's saved with the diagram.

## 1.0.1 — 2026-10-22

First version.

- Draw DIN rail layouts with real-size parts in millimetres: terminal blocks, power supply, DC UPS / battery backup, battery, circuit breakers, relay and generic modules.
- Design your own object types: set the size and colour, then click to place terminals or add whole rows of them.
- Wire terminals together by dragging or by clicking. Each terminal shows where its wire goes, with optional straight or curved lines.
- Set a number, colour, size and notes for each wire. The wire list and parts list update as you work.
- Build terminal strips quickly with numbered repeats. Parts snap to their neighbours and to DIN rails.
- Export to SVG (true scale), PNG and CSV, or print / save as PDF with the wire list and parts list.
- Work saves automatically in the browser. Diagrams and object libraries can be saved to files and opened again.
- Includes an example diagram: a 24 V supply with battery backup and a terminal strip.
