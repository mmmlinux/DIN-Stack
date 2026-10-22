# Release notes

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
