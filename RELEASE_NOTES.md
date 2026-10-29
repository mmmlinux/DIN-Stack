# Release notes

Changes to the ready-made libraries are listed separately: each library's folder in [`libraries/`](libraries/README.md) has its own release notes.

## 1.11.11 — 2026-10-29

### New features

- **What's in a duct.** Ducts are labelled D1, D2… on their covers. Select one to see the wires and cables running through it, with *Select them* and *Show only these wires*.
- **Duct fill.** Each duct shows how full it is: its wires' and cables' cross-sections against its width × depth. Over the limit in Settings (60 %), it's outlined in red with its fill on the cover. Cable profiles have a new *Ø* column for their outside diameter; left empty, it's worked out from the cores.
- **Pick the ducts a wire goes through.** Ctrl+click wires or cables with some ducts, then *Route through …* (panel or right-click). They visit those ducts, nearest first, and their lengths follow. Their panels show the route, and *Shortest way* undoes it.

### Improvements

- Only ends within 50 mm of each other (such as jumpers between neighbouring terminals) skip the ducts; other wires go through them, as they would in a panel.

## 1.11.10 — 2026-10-29

### New features

- **Wire ducts.** Right-click → *Wire duct here*, across or upright. Set the length, width and depth in the panel; R turns a duct. Ducts that touch are joined, and the bill of materials lists them as lengths to cut.
- **Back plate.** Right-click → *Back plate round the drawing* draws the plate (or enclosure) under everything. It's picked up by its edge, so clicks inside it still reach the drawing, and it goes in the bill of materials.
- **Wire lengths.** Every wire's length is estimated along the ducts by the shortest way, plus spare at each end (100 mm, in Settings), or across and down where there's no duct. Type a length into a wire's panel to use your own. Cables are estimated between their ends too, or take a length in metres. The wire and cable lists, their CSV files and the printout show lengths, with ≈ for estimates.
- **Wires and cables by the metre.** The bill of materials adds up each wire and cable profile's length and rounds it up to whole metres. Cable cores are no longer counted as separate wires.
- **Wire ends.** Each end is finished with a ferrule, twin ferrule, ring or fork lug, or nothing, with a strip length: set for the drawing in Settings, for a wire profile (new *Ends* and *Strip* columns), or for each end in the wire's panel. A ferrule where two wires share a terminal becomes a twin ferrule.
- **Wire processing list.** *File → Export… → Wire processing* lists every wire and core with its length, profile, colour, size, and each end's finish and strip length.

### Improvements

- The selection filter can pick only wire ducts or only back plates. A selection box takes in a duct or back plate only when it covers all of it, as with rails.
- Settings has a new *Lengths and wire ends* group, and the help a new *Lengths and wire ends* page.

## 1.11.9 — 2026-10-29

### New features

- **Labels.** *File → Export…* makes a CSV file of markers and labels for label printer software: terminal markers (one per block, or per level), wire markers (each end of each loose wire, with where the other end goes if you like), cable labels (each end, with the cable's type), core markers, device labels and connector labels. Each label has its text, a second line and where it goes. Pick the kinds, order them by name or by position, get one file or one per kind, and see a preview first.
- **Cable list as CSV**, from *File → Export…* or *CSV* above the cable list.

### Improvements

- *File → Export…* (Ctrl+E) gathers everything that downloads: the SVG and PNG images, the wire list, cable list, bill of materials and terminal strips, and the labels. It replaces the five export entries in the File menu.

## 1.11.8 — 2026-10-29

### Improvements

- **Shift+click selects a run along a rail:** every part on the same DIN rail from the last part clicked to this one. Ctrl+Shift+click adds the run to the selection.
- **Ctrl+click adds single things to the selection** (or takes them out), as Shift+click used to. Dragging a selection with Ctrl held still pushes the parts beside it along.
- **Shift+drag always draws a selection box**, even starting on a rail or part, so it no longer picks up and moves the rail. A box only selects a DIN rail when it covers the whole rail.

## 1.11.7 — 2026-10-29

### New features

- **Library updates when opening a diagram.** When you open a diagram, load the example or carry on with yours, DIN Stack checks whether any of its included libraries have a newer version out. If so, it lists them with their old and new versions and offers to update them all. *Not now* stops it asking about those versions until DIN Stack is next opened, and the check can be turned off from the same window or in Settings.

### Improvements

- *Refresh all* in the library manager is now one undo step, rather than one per library.

## 1.11.6 — 2026-10-29

### New features

- **Terminal strip report.** The new *Terminals* tab lists each terminal strip, with a row for each level of each block: the wires on its top and bottom, where they go and their cable and core, the bus bars through it and its circuit. End covers, plates and clamps show where they sit, and unused levels say *spare*. Pick one strip or see them all, click a strip's heading to select its blocks, and print them or download them as CSV (also *File → Terminal strips (CSV)*).
- **Strip names.** Blocks side by side on a rail make a strip, called by their tags until named. Give a block a strip name (e.g. X1) in its panel, and the blocks beside it join that strip.
- **Make one strip.** Select terminal blocks anywhere, even apart from each other or on other pages, and click *Make one strip* (or right-click → *Make one terminal strip*) to list them as one strip.
- **Terminal strip setting for object types.** The type designer says whether a type is a terminal block, a divider (end cover, plate or clamp) or neither; *Automatic* goes by its category.

### Improvements

- Wire profiles and cable profiles share one *Profiles* tab at the bottom, each under its own heading with its buttons, leaving room for the new tab.
- In a narrower window, the lists' filter box is just its icon until clicked, so all the tabs fit.
- The Phoenix Contact UT, AACC mechatronics and American Electrical fuse holder libraries are updated to 1.1.2.

### Bug fixes

- The bill of materials tab is remembered when DIN Stack opens again, like the other tabs.

## 1.11.5 — 2026-10-29

### New features

- **Import libraries and profiles.** *File → Import libraries and profiles…* opens another diagram (or a library file) and lets you tick which of its libraries, wire profiles and cable profiles to bring in. Profiles from a diagram in the other wire standard are converted.

### Improvements

- *Import a library file…* in the library now asks which of the file's libraries and profiles to bring in, rather than taking everything.

## 1.11.4 — 2026-10-29

### Improvements

- The New diagram dialog now says its choices can always be changed later.

## 1.11.3 — 2026-10-29

### New features

- **New diagram dialog.** *File → New diagram* and the start screen's *New diagram* ask for the title, the wire standard (American or metric) and the reference designations, and whether to bring over the open diagram's libraries, wire profiles and cable profiles. The tick boxes are remembered.

### Improvements

- The start screen's *Keep my libraries* tick box has moved into the New diagram dialog.

## 1.11.2 — 2026-10-29

### New features

- **IEC 81346 reference designations.** *Reference designations* in Settings switches from tags (K1, TB101-1) to designations: parts are `-K1`, led by a function (`=PUMP`) and location (`+CAB1`), so terminals read `=PUMP+CAB1-K1:13`.
  - Each page can have its own function and location, set in the panel with nothing selected; the title block sets them for pages without.
  - Labels on the drawing leave out the function and location they share with their page; the lists, exports and bill of materials give them in full.
  - Tags are numbered within each function and location, so `+CAB1-K1` and `+DOOR-K1` can both exist.
  - Switching to IEC joins terminals with `:` (and back to `-` when switching back).
- **Drawing frame.** *Around the drawing* in the print settings can put each sheet in a frame: a border with zones numbered across and lettered down, and a title strip with the title, page, revision, date, author and sheet number. The printed parts list then says which zone each part is in, e.g. `K1 (B3)`.

### Improvements

- In Settings, the reference style and terminal reference are side by side under *Standards*.
- The print settings' *Heading on every sheet* tick box is now the *Around the drawing* choice: a heading, the frame, or nothing.

## 1.11.1 — 2026-10-29

### New features

- **Bill of materials.** A new **BOM** tab under the drawing lists everything to order, grouped by maker and order number: parts with the accessories ordered with them, DIN rails with the lengths to cut, bus bars, wires and cables. Click a line to select what it counts.
  - **+ Line** adds lines for things that aren't drawn, such as the enclosure or screws, typed straight into the list.
  - Exports as CSV (the list's **CSV** button or **File → Bill of materials (CSV)**), and prints with the lists (*Bill of materials* in the print settings).
- **Order data.** The object type designer has an **Ordering** tab: the maker, the order numbers the type covers (the first is the default), and accessories ordered with each part. A part picks its order number under *Ordering* in its panel. DIN rails and bus bars have a maker and order number in their panels, and wire and cable profiles in the profiles dialog.

### Improvements

- The object type designer's settings are in three tabs, **Part**, **Add terminals** and **Ordering**, instead of one long column.
- The lists at the bottom are in two groups: wires, cables, bus bars and the profiles, then parts and the bill of materials. The tabs are a little tighter, and the filter box stays small until it's used, so they all fit.
- Ready-made libraries updated with makers and order numbers: [AutomationDirect DIN-rail relays and pushbuttons](libraries/automationdirect/RELEASE_NOTES.md) to 1.1.1, [Phoenix Contact UT terminal blocks](libraries/phoenix-contact-ut/RELEASE_NOTES.md) to 1.1.1, [Amphenol 26482 Series 2 connectors](libraries/amphenol-26482-series-2/RELEASE_NOTES.md) to 1.1.1, [Misc networking](libraries/misc-networking/RELEASE_NOTES.md) to 1.1.1, [AACC Mechatronics](libraries/aacc-mechatronics/RELEASE_NOTES.md) to 1.1.1 and [American Electrical fuse holders](libraries/american-electrical/RELEASE_NOTES.md) to 1.1.1.

## 1.10.38 — 2026-10-28

### Improvements

- A group note's bracket can be dragged: grab its long line and move it closer to or further from the items. The note stays put and its line follows; the distance shows while dragging and in the note's panel.
- **Settings is easier to find your way around.** It's wider, in two columns, and grouped the same way as the wires and cables buttons at the bottom right:
  - **Standards:** wire standard and terminal reference, with the **Wire profiles…** and **Print settings…** buttons.
  - **Wires** and **Cables:** how each is drawn and what their labels show.
  - **Labels and text:** page names (for both wires and cables), terminal names and text heights.
  - **Placing parts:** snap grid, snapping to neighbours and rails, and build direction, now together.
  - **Starting up:** the start screen.
- Tick boxes no longer sit beside drop-downs in Settings, so everything lines up.

## 1.10.37 — 2026-10-28

### New features

- **Group notes.** Select parts or rails and right-click → **Group note**: a note above them with a bracket spanning their full width and a line from it to the note. The bracket goes on whichever side of the items the note is on and follows the items when they move or change. It starts just clear of their wire labels; its distance can be changed in the note's panel, where **Clear the labels** fits it again. Moving all the items moves the note with them.
  - **Link note to the selected items** links an existing note to the items selected with it; **Unlink** in its panel or menu makes it a plain note again.
  - Copying a group note with its items links the copy to the copied items.

## 1.10.36 — 2026-10-28

### New features

- **Text notes can be turned.** R and Shift+R, the turn buttons in a note's panel and its right-click menu turn it a quarter turn; its new **Angle** setting takes any angle, e.g. 45°. A note turns about its middle, and the angle is printed and exported with it.

## 1.10.35 — 2026-10-28

### Bug fixes

- A right-click menu no longer shows its first entry highlighted before the mouse reaches it, and neither does a submenu opened with a click. ↓ and ↑ still pick entries from the keyboard.

## 1.10.34 — 2026-10-28

### Bug fixes

- *Text note here* and *DIN rail here* in the right-click menu put the note or rail where you right-clicked, instead of in the middle of the view.

## 1.10.33 — 2026-10-28

### Improvements

- The release notes only say when a ready-made library is added or updated; what changed in it is in that library's own release notes. Earlier entries are shortened to match, and the details they held are now in the libraries' notes.

## 1.10.32 — 2026-10-28

### Improvements

- The version history no longer starts with the note about the libraries' release notes.

## 1.10.31 — 2026-10-28

### Improvements

- Each section of the version history is headed by its latest version number (e.g. 1.10.31 rather than 1.10), with the version it started from beside it.

## 1.10.30 — 2026-10-28

### Improvements

- The version history sorts each minor version's changes into **New features**, **Improvements** and **Bug fixes**. The release notes file has the same headings under each version.

## 1.10.29 — 2026-10-28

### Improvements

- The version history has one section per minor version (e.g. 1.10), with all its changes together, instead of one per update. Numbered steps in older notes show as numbered lists.

## 1.10.28 — 2026-10-28

### New features

- Clicking the version number at the bottom of the library shows the **version history**: what changed in each version, newest first, with the one you're using marked. It needs the online version or an installed copy; opened straight from `index.html`, it links to the release notes on GitHub.

## 1.10.27 — 2026-10-28

### Improvements

- **Undo** and **Redo** are now in the top bar after the Help menu, before the diagram's name.
- The Settings button at the top right is gone: Settings… is in the Edit menu.

## 1.10.26 — 2026-10-28

### Improvements

- The diagram's name at the top looks editable: it has a dashed outline and a pencil, and outlines in blue when you point at it. Empty, it says *Name this diagram*.

## 1.10.25 — 2026-10-28

### Improvements

- The library's **+ New type** button is now **+ New part**.

## 1.10.24 — 2026-10-28

### New features

- **Favourite wire and cable profiles.** A star (★) beside each profile makes it a favourite: only favourites are offered in the *Profile* and *Cable profile* drop-downs and the right-click menus, so they stay short in a drawing with many profiles. A profile already given to the wire or cable is shown too.
  - **All wire profiles…** / **All cable profiles…** in those drop-downs and menus opens a window with every profile in the drawing, favourites first, to search and pick from. Enter picks the only match.
  - Star or unstar profiles in that window, in the profiles dialog (*Edit…*), or in the *Wire profiles* and *Cable profiles* lists at the bottom. Undo works on these too.
  - Profiles in diagrams made before this version all start as favourites, as do new profiles. Updating a cable profile from the cable library, or importing a library file, keeps whether it's a favourite.

## 1.10.23 — 2026-10-28

### New features

- **Several connectors at one end of a cable.** An end can plug into more than one connector, alongside its loose cores: e.g. a motor cable with a power plug, an encoder plug and two cores on terminal blocks at the drive end, and the motor connector at the other. *Add a connector…* for an end (in the cable's *Ends* section or its right-click menu) plugs it into another one. The end branches at its fan-out point, a length of sheath to each connector.
  - Each connector can be unplugged on its own (*Unplug X1-PLUG*); unplugging an end's main connector hands its place to the next.
  - Leaving an end free unplugs all its connectors. Plugging in, fanning out, landing and moving an end keep the other end's connectors.
  - The ends' connectors show in the cable list, the cable's panel, its labels and its mouse-over text, follow their parts when moved, and go to another page with them.
  - When making a new cable with *Cable…*, the first connector clicked is the far end; any more go at the near end with the cores.
- **Straight or curved, wire by wire.** A wire's *Draw as* now offers *Straight line* and *Curved line* (as well as *Broken* and the drawing's default), so one wire can be curved while the rest are stubs or straight. Wires set to "a line" before keep the look they had.

### Improvements

- **Shorter right-click menus.** Groups of choices are now submenus (›): *Draw wire*, *Draw cable*, *Label shows*, *Wire profile*, *Cable profile*, *Move to page*, *Align*, *Select circuit*, and each end of a cable. Hover over, click, or press → to open one.

## 1.10.22 — 2026-10-28

### New features

- **Save as…** lets you choose the file's name and folder in Chrome and Edge. Other browsers ask for a file name and download it.
- **Edit menu:** Undo, Redo, **Cut** (Ctrl+X), Copy, Paste, Duplicate, Delete, Select all, Select none, **Find in the lists…** (Ctrl+F, the lists' filter box) and Settings…. Commands with nothing to act on are greyed out.

### Improvements

- **File menu** in the usual order, with the Export menu merged into it: New diagram, Open… (Ctrl+O), Open the example, Save (Ctrl+S), **Save as…** (Ctrl+Shift+S), the SVG, PNG and wire list exports, and Print / PDF… (Ctrl+P).
- Ctrl+P opens DIN Stack's print settings instead of the browser's print window.

## 1.10.21 — 2026-10-28

### Bug fixes

- Printing with all the lists turned off no longer adds a last page with only the heading on it.

## 1.10.20 — 2026-10-28

### Improvements

- **Printed sheets have one heading,** in the same place and at the same size on every sheet: the title with the page's name, and the revision line, with *Sheet 2 of 6 · row 1, column 2* at the right when a page goes over several sheets. The notes are under it on the first sheet. The title block no longer appears again inside the drawing, and the heading isn't scaled with the drawing.
- The scale is no longer printed on the sheets.
- The drawing is centred in the space under the heading. A page over several sheets is centred on the sheets put together, and every sheet holds the same-sized piece so they line up.
- The lists' first page has the heading too.

## 1.10.19 — 2026-10-27

### New features

- **Print settings.** *Print / PDF* opens a settings window before printing, saved with the diagram:
  - **Paper:** size (Half Letter, Letter, Legal, Tabloid, ANSI C, or A5 to A2), orientation (automatic, portrait or landscape) and margins.
  - **Size of the drawing:** fit each page on one sheet, real size (shrunk only if it doesn't fit), fit to the paper's width, or a set scale where 100% is real size. A page too big for one sheet is printed over several, each labelled with its row and column.
  - **What to print:** all drawing pages, the one open or none, the title and notes, and each of the lists. With one page printed, the lists have only what's on it.
  - A line at the bottom says how many sheets each page takes and at what scale.
- Paper sizes and margins follow the wire standard: American gets Letter sizes and inches, metric gets A sizes and mm. Switching the standard in Settings switches the paper to the nearest size.

### Improvements

- Each sheet of drawing is printed on a page to itself, and the lists always start on a new page. Each sheet is labelled with its page name and scale.

## 1.10.18 — 2026-10-27

### Bug fixes

- **Print / PDF:** tall drawings no longer run off the bottom of the page. Each drawing is scaled to fit its sheet both across and down, allowing for the title and notes above it, on any paper size and in portrait or landscape.

## 1.10.17 — 2026-10-27

### New features

- **Page names** option under the wires and cables buttons at the bottom right, and in Settings: turn off to leave the other end's page out of wire and cable labels. On by default.
- **Mouse-over text for wires and cables.** A wire, its label or line, or a cable core shows the wire's name and cable, where each end goes (with its page when there's more than one), its circuit, colour, size, profile and notes. A cable shows its name, profile, type, where each end goes, its cores and notes.

## 1.10.16 — 2026-10-27

### New features

- **Pages:** a diagram can have several pages, such as the back panel, the door and a junction box. Tabs at the bottom left of the drawing switch between them; **+** adds a page, double-clicking a tab renames it, and right-clicking it duplicates, moves or deletes it.
- **Move to page** in the right-click menu of parts, rails and notes moves them to another page or a new one, keeping their place. Parts on a moved rail go with it.
- Wires and cables can run between pages: start a wire, open the other page and click its terminal. At each end they're drawn broken, labelled with the other end's page, e.g. *W3 → S1-13 (Door)*. **Go to other end** opens that page.
- Snapping, selection boxes, *Select all* and measuring stay within the page you're on.
- The wire, cable, bus bar and parts lists, the wire list CSV and the printout have a **Page** column when there's more than one page. Clicking a row on another page opens that page.
- **Print / PDF** prints each page on its own sheet. SVG and PNG exports are of the page you're on, with its name after the title.
- Diagrams from earlier versions open with everything on *Page 1*.

## 1.10.15 — 2026-10-27

### New features

- **USB 2.0, A to Mini-B** added to the *USB* group in the cable library.

## 1.10.14 — 2026-10-27

### New features

- **USB cables in the cable library:** a new *USB* group with USB 2.0 cables A to B, A to Micro-B, A to C and C to C. Each has red VBUS, white D−, green D+ and black GND cores marked with their signals; C to C adds a CC core.

## 1.10.13 — 2026-10-27

### Improvements

- When choosing how a wire or cable is drawn (right-click menu or its panel), the drawing-wide choice is now shown as *Default (…)*, e.g. *Default (broken)*, instead of *As for the drawing (…)*.

## 1.10.12 — 2026-10-27

### Bug fixes

- Duplicating or pasting parts no longer adds a copy of every plugged-in cable on the drawing. A plugged-in cable is copied only when the parts at both its plugs are, and the copy is plugged into the copied parts.

## 1.10.11 — 2026-10-27

### Bug fixes

- Right-clicking a cable with a free end (one not on the drawing) shows the options for both ends again, the end you clicked first, so you can fan out or plug in the free end from there.

## 1.10.10 — 2026-10-27

### New features

- **Move a broken cable's tails:** a selected cable drawn *Broken* has two dots at each end, one where the cores fan out and one where the tail stops, like a cable with a free end. Drag them to place each tail and its label. They move with the parts at that end, and *Reset fan-out points* puts them back.
- A cable whose tails have been placed stays broken even when its ends are close together.

## 1.10.9 — 2026-10-27

### Improvements

- Right-clicking a wire or cable shows options for the end you clicked only (the end nearest the mouse, or the one whose label you clicked). For the other end there's **Go to other end**, which scrolls the drawing to it at the same zoom.
- **Connect through…** is no longer in a cable core's right-click menu; it's still in the wire's panel.

## 1.10.8 — 2026-10-27

### New features

- **Move a cable's end to other terminals:** right-click a cable and pick **Move end…** under the end to move (also in the *Ends* section of its panel). Click the terminal each core moves to, in core order, or drag along a row. **Keep** leaves a core where it is. The other end stays put.
- **Show only its wires** (or *Show only its cores*) when right-clicking a cable.

## 1.10.7 — 2026-10-27

### Improvements

- A terminal's mouse-over text shows its connector label on its own, without "Connector label:" in front.

## 1.10.6 — 2026-10-27

### New features

- **Terminal descriptions:** the terminal table in the object type designer has a **Description** column (e.g. *+24 VDC*). It shows when the mouse is over that terminal on every part of the type, and under the terminal's name in the part's *Terminals* list.

### Improvements

- Connector labels are no longer drawn as yellow tags beside terminals. They show when the mouse is over the terminal.

## 1.10.5 — 2026-10-27

### New features

- **Move a wire's end to another terminal:** right-click a wire, or its label at a terminal, and pick **Move end at…** for either end (the end the label is at comes first), then click the terminal it goes to. Works for cable cores too.

### Improvements

- Taking the last wire off one end of a cable leaves that end free, without asking.

## 1.10.4 — 2026-10-27

### New features

- **Cores connected at one end only.** When landing the other end of a cable, **Skip** leaves a core not connected at that end; the panel lists each core with *Skip* or *Use* to change your mind.
- In a cable's panel, each wire has a drop-down for which ends it's connected at: **Both ends**, **End A only** or **End B only**. A wire connected at one end only is marked *not connected through*, and is drawn at that end only. Setting it back to *Both ends* asks for the terminal at the other end. The wire's own panel has **Connect through…** too.
- A cable keeps at least one core connected at both ends. Leaving an end free or plugging it in removes the cores that were connected only at that end.

## 1.10.3 — 2026-10-27

### New features

- **Choose which core goes to each terminal when fanning out a cable.** For a cable whose profile lists its cores, the bar at the top shows the **Next core** for the next terminal you click: pick another, or **Skip** to leave a core spare. The panel lists each picked terminal with its core, to change or swap them, and the drawing shows each terminal's core number.
- **Change a core afterwards:** each wire in the **Cores** section of a cable's panel has a drop-down for which of the profile's cores it is. Picking one another wire has swaps them.

### Bug fixes

- A cable's cores keep their numbers and colours when its other end is fanned out or left free, even with cores skipped.
- The *Serial cable, 9 cores, shielded* in the cable library reads *9×AWG28, D-sub 9* as its type, instead of repeating "shielded".

## 1.10.2 — 2026-10-27

### New features

- **Serial cable, 9 cores, shielded** in the cable library (*Fieldbus and serial*): 9 × 28 AWG cores in DIN 47100 colours, numbered 1–9 for D-sub 9 pins.

## 1.10.1 — 2026-10-27

### New features

- **Measure tool** at the bottom right of the drawing (key M): drag across the drawing to measure a distance, shown in mm and inches. The ends snap to terminals and to the corners and edges of parts and rails. Shift keeps the line level or upright, and Alt turns snapping off. A measurement at an angle also shows its distance across and down. Click or press Esc to clear it.

### Bug fixes

- The hint at the bottom of the drawing sits above the buttons there instead of covering them.

## 1.9.20 — 2026-10-26

### New features

- **Select and Wire tools** at the bottom right of the drawing (keys V and W). With **Select**, clicking a terminal selects its wires, bus bars and plugged-in cable instead of starting a wire; a terminal with nothing on it selects its part. **Wire** works as before. The tool is remembered in this browser.

## 1.9.19 — 2026-10-26

### New features

- **Easier to find a cable's other end:** a selected cable's ends (the connectors it plugs into, or the terminals its cores land on) are ringed in bold blue, at a fixed size on screen like a selected wire's. A broken cable also gets a dashed line between its two ends.

## 1.9.18 — 2026-10-26

### New features

- **Easier to find a wire's other end:** a selected wire's ends are ringed in bold blue, and the rings keep their size on screen when you zoom out. A wire drawn as stubs also gets a dashed line between its two ends while it's selected.

## 1.9.17 — 2026-10-26

### New features

- **New library: American Electrical fuse holders** (version 1.0.1), in the library manager: AEI's DIN-rail fuse holders. Details are in its [release notes](libraries/american-electrical/RELEASE_NOTES.md).

## 1.9.16 — 2026-10-26

### Improvements

- The help's topic groups stand out more, with bolder headings and a line between groups.

## 1.9.15 — 2026-10-26

### Improvements

- **Help rewritten as short topics**, grouped under Getting started, Building, Wiring, Cables, Object types, and Output and reference.
- New help topics: saving and files, rails and notes, libraries, swapping a part's type, lists, printing and exporting, and settings.

## 1.9.14 — 2026-10-26

### Improvements

- **Cable profiles tab** in the lists at the bottom, replacing the cable profiles section in the diagram panel. Clicking a profile selects its cables.
- The start screen counts down from 10 seconds when DIN Stack opens, then carries on with the current diagram unless it's clicked or a key is pressed.

## 1.9.13 — 2026-10-26

### New features

- **D-sub 25 fan-out block** in the built-in *Generic* types: a DIN-rail block with a D-sub 25 socket that breaks out to 25 screw terminals, numbered like the socket's pins.
- **D-sub 25 cable, shielded** in the cable library (*Control cables*): 25 × 24 AWG cores in DIN 47100 colours, cores 1–25 to pins 1–25.

## 1.9.12 — 2026-10-26

### Improvements

- The start screen's default choice is **Continue** whenever there's a diagram to carry on with, including after opening an example link.
- Start screen choices reordered: **New diagram**, **Continue**, **Open a file…**, then the example.

## 1.9.11 — 2026-10-26

### Improvements

- Removed the parts, wires, cables and bus bars counters from the diagram panel.
- **Wire profiles tab** in the lists at the bottom, replacing the wire profiles section in the diagram panel. Clicking a profile selects its wires.

## 1.9.10 — 2026-10-26

### Improvements

- **Updated Mechatronics example:** the 24 V and 5 V circuits are named `+24VDC` and `+5VDC`, several wires are labelled with their circuit name, and the power cable has a black sheath and the description *Power*.

## 1.9.9 — 2026-10-26

### New features

- **Connector labels warn before joining named circuits:** a label that would attach a terminal to a differently named circuit now asks first, with the same choices as wires, bus bars and cables.
- **Select the named circuit or just what's wired:** where a circuit's name reaches beyond its wiring, *Select whole circuit* is split into **Select all of “+24V”** and **Select connected wires**. The circuit panel's buttons show how many each selects.

## 1.9.8 — 2026-10-26

### New features

- **Project library:** a new *This project* library holds new types, duplicates, and edited copies of types from other libraries.
- **Editing a type from another library** saves an edited copy in *This project* and switches the diagram's parts to it, leaving the original unchanged.

### Improvements

- The *My types* library is renamed *This project*.

## 1.9.7 — 2026-10-26

### New features

- **Keep my libraries:** a tick box on the start screen's **New diagram** card chooses whether a new diagram keeps your loaded libraries or starts with only the built-in one.

## 1.9.6 — 2026-10-26

### Improvements

- On the start screen, **Open a file…** and **Load the example** have swapped places.

## 1.9.5 — 2026-10-26

### Improvements

- The start screen always offers **Load the example**, not only on example links.

## 1.9.4 — 2026-10-26

### New features

- **New example diagram:** a 24 V control panel with a UPS, replacing the power-supply example. It shows two rails, bus bars, named circuits, broken and line-drawn wires, cables from the cable library (including a patch lead and a one-ended cable), loose parts and notes.

## 1.9.3 — 2026-10-26

### Improvements

- **Swapped parts fit where the old one was:** changing a part's **Type** keeps it on its rail, keeps neighbours snapped against it (a strip opens up or closes in to suit), and pushes aside anything a bigger part would overlap. Cables follow the parts that move.

## 1.9.2 — 2026-10-26

### New features

- **Start screen can be turned off:** a tick box on the start screen, and a matching setting under *Starting up* in Settings.

## 1.9.1 — 2026-10-26

### New features

- **Start screen every time:** DIN Stack opens with a start screen offering **Continue**, **New diagram** or **Open a file…**. On an example link such as `#mechatronics`, it also offers **Reload the Mechatronics example**.

### Improvements

- The getting-started tips are a fold-out section of the start screen. **Help → Welcome tips** is now **Help → Start screen**.

## 1.8.2 — 2026-10-26

### Improvements

- **American wiring is the default.** New drawings use AWG sizes and US colours (black hot, white neutral, green ground). The starter wire profiles are now 16 AWG (18 AWG for control signals), and the built-in example is in AWG. Drawings you already have keep their wire standard. New uses the standard of the drawing you have open, so if yours is metric, switch it once under *Settings → Wire standard*.
- **The cable library is in AWG.** Every cable's core sizes and descriptions are in AWG (for example the mains cable is SJOOW 16/3, and the control cable 7×AWG18). A metric drawing still gets the nearest mm² sizes when it adds one.
- **Power cables in US colours.** Mains cables are black, white and green. Three-phase cables are L1 black, L2 red and L3 blue (the 208/120 V convention), with a white neutral and a green ground. The low-voltage supply cable is red + and black −, and motor and drive cables have a green ground.
- The Mechatronics example's mains, motor and control cable profiles are updated to match.

## 1.8.1 — 2026-10-26

### New features

- **Cable library:** ready-made cable types, each listing its cores, that you add to a drawing's cable profiles. It has Ethernet (Cat5e, Cat6, shielded Industrial Ethernet), PROFINET Type A, PROFIBUS DP, DeviceNet / CANopen, RS-485, M8 and M12 sensor cables (3, 4, 5 and 8 pins), numbered, shielded and LiYY / LiYCY control cables, mains, three-phase, low-voltage, motor and drive cables, and instrument, RTD and type K thermocouple cables. It's built in, so it works offline.
  - **From a cable:** pick *From the cable library…* in its **Cable profile** drop-down or its right-click menu, then **Use** on a type. That adds the type to the drawing, if it isn't there already, and gives it to the cable.
  - **Elsewhere:** *Cable library…* in the cable button at the bottom right of the drawing (with cables selected, **Use** gives them the type), *Add from the cable library…* in **Wire and cable profiles**, and *Cable library…* under *Cable profiles* in the right panel.
  - The library shows which types are already in the drawing. Editing the drawing's copy doesn't change the library; if the copy differs from the library's, **Update** puts the library's back (you're asked first).
  - In a drawing using American wire sizes, cables added from the library get their core sizes in AWG.
- **Joining named circuits asks first:** if a new wire, bus bar or cable's cores would join two circuits with different names (say `+24V` to `0V`), a dialog shows the names and where they meet, and asks what to do:
  - *Call it all +24V* (or the other name) joins them under one name, renamed everywhere in the drawing, and says how many wires, bus bars and connector labels that changes.
  - *Keep both names* joins them as `+24V / 0V`, as before.
  - **Don't join** leaves the drawing as it was. For a bus bar or cable, the terminals you picked stay picked so you can change them.
  - Joins between unnamed circuits, or a named circuit and an unnamed one, don't ask.

### Improvements

- **New drawings start with no cable profiles:** add the ones a drawing uses from the cable library. Existing drawings keep their cable profiles, and the five starter profiles are in the library under the same names. *New cable profile* still makes one of your own.

## 1.7.5 — 2026-10-24

### New features

- **Circuit names at both ends of lines:** with *Straight* or *Curved* lines, a wire labelled with its circuit's name (e.g. `+24V`) now has the name at each end, where its destination label would be, instead of once at the middle of the line. The middle of the line shows the wire's number when *Wire names* is ticked, as it does for other wires. Cable cores labelled with their circuit's name get it at their ends too, with lines as with stubs.

## 1.7.4 — 2026-10-24

### Improvements

- **Mechatronics example cables list their cores:** the `#mechatronics` example's cable profiles now have the same cores as the starter profiles, with sizes in AWG to match the example's American wire standard (the motor cable's power cores are 16 AWG and its brake pair 18 AWG, the control cable's cores 18 AWG). Its shielded Industrial Ethernet patch lead now lists its eight cores in T568B order. If you've already opened the example, your saved copy is kept; use **File → Load the example** on the `#mechatronics` link to get the new one.

## 1.7.3 — 2026-10-24

### Improvements

- **Every starter cable profile now lists its cores** in new drawings:
  - *Industrial Ethernet, shielded*: eight cores in T568B order, 26 AWG, like *Ethernet, Cat6*.
  - *Motor cable, shielded*: black power cores marked U, V and W, a green/yellow earth (1.5 mm²), and a black pair marked 5 and 6 for a brake or thermistor (0.75 mm²).
  - *Control cable*: six black cores numbered 1 to 6 and a green/yellow earth (0.75 mm²).
- Existing drawings keep their cable profiles as they are.

## 1.7.2 — 2026-10-24

### New features

- **Cable profiles list their cores:** in **Wire and cable profiles** (the *Edit…* button beside a cable's profile), click **Cores** on a cable profile to list the cores it contains, in order. Each core has a marking (the number or letters printed on it, if any), colour, stripe, size and conductor. **Add core** copies the last one and numbers on from it.
- **Cables follow them:** a cable given that profile gives its cores those looks, core 1 first, and editing the profile's cores updates them. A core you change by hand keeps its own look until you pick the profile for the cable again. A profile with no cores listed leaves its cables' wires as they are, as before.
- **Patch leads show them too:** a cable plugged in at both ends lists its profile's cores in its panel and in the *Cores* column of the cables list and printout. When you fan out an end, the bar at the top says which core comes next (e.g. *Next: core 2 (2 Orange 24 AWG)*), and the new cores take the profile's looks.
- A core's marking shows beside it in the cable's panel, the wire's panel and the cables list.

### Improvements

- New drawings' *Ethernet, Cat6* profile lists its eight cores in T568B order, and *Mains cable* its brown, blue and green/yellow cores. Existing drawings keep their profiles as they are.
- Switching the *Wire standard* converts the sizes of cable profile cores, but not their colours: a cable's cores are the colours they're made in.
- The *Edit…* button beside a cable's profile now opens the dialog at the cable profiles.

## 1.7.1 — 2026-10-24

### New features

- **One kind of cable:** patch leads between connectors and bundles of wires are now the same thing. Each end of a cable is plugged into a cable connector, fans out into cores that land on terminals, or is free (running off the drawing), and any two go together: connector to connector, connector to fan-out, or fan-out to fan-out.
- **Change either end:** a cable's panel has a new **Ends** section, and its right-click menu a section for each end, with what that end can change to: *Plug into a connector…*, *Fan out to terminals…*, *Unplug*, *Leave free* or *Add cores…*. For example, plug one end of a bundle of wires into a motor's socket, or fan out one end of a patch lead onto a terminal strip.
- **Drag from a connector to a terminal** to make a cable plugged into the connector with one core landing on the terminal. Use *Add cores…* for more.

### Improvements

- Plugging in or freeing one end of a bundle takes its wires off their terminals at that end (you're asked first). They become the cable's cores, so their circuits no longer run through to that end, and deleting the cable deletes them. Plugging in the end a cable's cores land on, when its other end isn't fanned out, removes the cores, since a cable plugged in there doesn't draw them. Undo puts everything back.
- *Land the other end…* is now *Fan out to terminals…* on the cable's other end, and works when that end is plugged in too (it's unplugged).

## 1.6.1 — 2026-10-24

### Improvements

- **Updated Mechatronics example:** the `#mechatronics` example has been replaced with a newer version. It adds terminal blocks TB6 and TB7, two buses and a new wire type, and reworks some of the wiring. If you've already opened the example, your saved copy is kept; use **File → Load the example** on the `#mechatronics` link to get the new one.

## 1.5.3 — 2026-10-24

### New features

- **Mechatronics example:** add `#mechatronics` to DIN Stack's address to open the Mechatronics example, built with the AACC Mechatronics library. That link is a workspace of its own: it starts with the example, keeps its own saved diagram apart from the main one, and **File → Load the example** there loads the Mechatronics example. The plain address works as before. Like the library manager, it needs the online version or an installed copy that has been online.

## 1.5.2 — 2026-10-24

### New features

- **New library: AACC Mechatronics** (version 1.0.1), in the library manager (**+** beside the library drop-down): the parts of the AACC Mechatronics panel. Details are in its [release notes](libraries/aacc-mechatronics/RELEASE_NOTES.md).

## 1.5.1 — 2026-10-24

### Improvements

- **Tidier libraries folder:** each ready-made library now has a folder of its own in `libraries/`, with its own release notes beside it. A folder can hold a collection: both AutomationDirect libraries are in `libraries/automationdirect/`. [`libraries/README.md`](libraries/README.md) lists them all. Nothing changes in the app: the library manager finds them as before, and *What's new* opens the library's own notes.

## 1.4.31 — 2026-10-23

### New features

- **Cable names are now optional:** a new **Cable names** tick box in that menu (and in Settings) shows or hides the cable's name in its labels. With it off, a broken cable's tails just say where the other end goes (*K1* rather than *C1 → K1*), a full-length cable shows only its type along the sheath (e.g. *3G1.5*), and a one-ended cable's free end shows where it goes without the arrow. It's off for new drawings; existing drawings keep showing cable names until you untick it.

### Improvements

- **Cable menu of its own:** the cable settings have moved out of the wire menu into a new cable button beside it, at the bottom right of the drawing.

## 1.4.30 — 2026-10-23

### New features

- **Broken wires:** any wire can now be drawn as a tail at each end instead of a line across the drawing. Select a wire (or several) and set **Draw as** to *Broken: a stub at each end*; each end then gets a short stub labelled with where the wire goes, as in *Stubs* mode. *A line to the other end* does the opposite, e.g. to draw a short jumper as a line when the drawing uses stubs. *As for the drawing* follows the wire menu. It's also on the right-click menu.
- **Broken cables:** the wire menu at the bottom right has a new **Cables** choice: *Full length*, or *Broken (tails)*, which draws each cable as a short length of sheath at each end with a break bar and a label saying where the other end goes (e.g. *C1 → K1*). It's in Settings too, and each cable can override it with **Draw** in its panel or on the right-click menu. A cable whose ends are too close for two tails and their labels is still drawn whole, and a one-ended cable running to a free end is unchanged.

### Improvements

- A cable's end labels now have a white outline, like wire labels, so they read over wires.

## 1.4.29 — 2026-10-23

### Improvements

- *Misc networking* library updated to version 1.0.2. The changes are in its [release notes](libraries/misc-networking/RELEASE_NOTES.md).

## 1.4.28 — 2026-10-23

### Improvements

- **Cables move with their parts:** moving the parts a cable's wires land on now moves the cable too, instead of leaving its fan-out points behind (and, for a one-ended cable, its free end). Move everything at both ends and the whole cable moves; move just the parts at one end and that end's fan-out point moves with them. This works when dragging, nudging with the arrow keys, and aligning or packing. Cables whose fan-out points were never dragged already followed their parts, and still do.

## 1.4.27 — 2026-10-23

### New features

- **Wire names are now a separate on/off option:** labels that say where a wire goes can show just the connection (*TB101-1*) or lead with the wire's name (*W3 → TB101-1*). Tick or untick **Wire names** in the wire menu at the bottom right of the drawing, or in Settings. It's off for new drawings.
- This works alongside circuit names: the menu's **Named circuits show** picks *Where each wire goes* or *Circuit name*, so a wire labelled with its connection no longer has to carry its wire name.
- Existing drawings keep how they looked: if they showed wire names, *Wire names* is ticked; untick it to hide them.

## 1.4.26 — 2026-10-23

### New features

- **Edit several things at once:** with more than one thing selected, the panel now has a section for each kind in the selection, with the settings they share. A change there applies to all of them:
  - *Wires:* profile, colour, stripe, size, conductor, *Match their circuits*, what their labels show, and notes.
  - *Bus bars:* colour, *Match their circuits* and notes.
  - *Cables:* cable profile, type, shielded, twisted pairs, sheath colour and notes.
  - *Parts:* type, colour and description.
  - *DIN rails:* length and profile.
  - *Text notes:* size, colour and bold.
- Settings that differ across the selection show as *Mixed* (an empty box, *(mixed)* in a drop-down, or a half-ticked box) until you change them. Things that are unique to each one, like tags, wire numbers and positions, are left out.

## 1.4.25 — 2026-10-23

### New features

- **Choose each wire's label:** a wire in a named circuit can now show either the circuit's name (e.g. *+24V*) or where it goes (e.g. *TB101-1*), whatever the rest of its circuit does. Select the wire and pick under **This wire's label shows** in its *Circuit* section, or right-click one or more wires → **Label shows**. *As for the circuit* goes back to following the circuit.

### Improvements

- The circuit-wide choice is now called **Circuit's labels show**, to tell it apart.

## 1.4.24 — 2026-10-23

### New features

- **Land the other end of a cable:** a one-ended cable (cores on terminals, sheath running off to a free end) can now have its other end drawn too. Right-click the cable → **Land the other end…** (or use the button in its panel), then click the terminal each core goes to, in core order. The bar at the top says which core is next, and the panel lists each core with the terminal picked for it. Click a picked terminal again to take it off.
- Press Enter or **Done** once every core has a terminal. The cable is then drawn with both ends, like wires bundled into a cable, and its **Goes to** label is dropped. Its cores keep their wire numbers, colours and profiles. Undo puts the free end back.

## 1.4.23 — 2026-10-23

### Improvements

- *AutomationDirect pushbuttons & pilot lights* library updated to version 1.0.2. The changes are in its [release notes](libraries/automationdirect/RELEASE_NOTES.md).

## 1.4.22 — 2026-10-23

### New features

- **Two new ready-made libraries** in the library manager (**+** beside the library drop-down):
  - *AutomationDirect pushbuttons & pilot lights*: GCX 22 mm, Fuji Command 30 mm and Eaton HT800 30 mm pushbuttons, selector switches, E-stops and pilot lights.
  - *Misc networking*: a Tripp Lite industrial 5-port switch and PoE++ injector for DIN rail, and the StarTech IH2006 HDMI KVM-over-IP extender.
- Details are in their [release notes](libraries/README.md).

## 1.4.21 — 2026-10-23

### Improvements

- **One label per circuit at a terminal:** when labels show circuit names and several wires of the same circuit meet at one terminal (a daisy chain, for example), the terminal now shows a single stub and label for them, e.g. one *+24V* instead of two. Clicking it selects the first of those wires, and it's highlighted when any of them is selected. Wires labelled by terminal or wire name still get a stub and label each, since their labels differ.

## 1.4.20 — 2026-10-23

### New features

- **Circuit labels per circuit:** a named circuit can now choose how its wires are labelled, whatever **Name in labels** is set to for the drawing. Select one of its wires (or bus bars) and set **Labels show** in the *Circuit* section of the right panel:
  - *As set for the drawing* (the default);
  - *Circuit name*: its wires show the circuit's name (e.g. *+24V*) instead of where they go;
  - *Where each wire goes*: its wires never show the circuit's name.
- For example, label only *+24V* and *0V* with their names and everything else with its terminals. The choice is saved with the diagram, by circuit name.

## 1.4.19 — 2026-10-23

### Improvements

- **Circuit name or terminal, not both:** with **Name in labels** set to *Circuit name*, a label now shows the circuit's name (e.g. *+24V*) if the wire's circuit has one, and otherwise the terminal it connects to (e.g. *TB101-1*), never both together. With straight or curved lines, a named circuit's wire shows its name at the middle of the line and no labels at its ends. *Wire name* is unchanged (*W3 → TB101-1*).

## 1.4.18 — 2026-10-23

### Improvements

- **Circuit names in labels:** *Include wire name* in the wire button's menu (and Settings) is now **Name in labels**, with three choices:
  - **No name:** labels just say where each wire goes.
  - **Wire name:** the wire's number, as before (*W3 → TB101-1*, or *W3* at the middle of each line).
  - **Circuit name:** the circuit's name instead (*+24V → TB101-1*, or *+24V* at the middle of each line). Wires in a circuit with no name show no name.

### Bug fixes

- **No stray arrows:** the arrow now only appears between a name and where the wire goes. Without a name, a label is just the destination, e.g. *TB101-1* rather than *→ TB101-1*. This includes the labels at the ends of straight and curved lines.

## 1.4.17 — 2026-10-23

### Improvements

- **Wire view options:** the wire button at the bottom right (and Settings) now sets the wire style and the labels separately.
  - Style: **Stubs** (a short stub at each terminal), **Straight lines** or **Curved lines**.
  - **Labels** (tick box): where each wire goes, shown at its terminals, e.g. *→ TB101-1*. This now works with lines too.
  - **Include wire name** (tick box): adds the wire's number, in front of the label with stubs (*W3 → TB101-1*), or at the middle of each line.
  - The tick boxes leave the menu open, so you can set both at once. The printout and exported images follow the same settings.
- The *None* choice is gone. A diagram saved with *None* opens as stubs with both tick boxes off.

## 1.4.16 — 2026-10-23

### Improvements

- **Cleaner cable ends:** with **Wires** set to *Labels*, a wire that's a core of a cable no longer gets a short coloured stub at its terminal as well, since the cable already draws the core from the terminal into the sheath. Its label (e.g. *W1 → C2-1*) still shows in the same place. Wires that aren't in a cable keep their stubs.

## 1.4.15 — 2026-10-23

### Improvements

- **Tidier library:** every category in the library now starts folded, so a library first shows just its category names. Click one to open it; the ones you open stay open. The fold button beside the search box still opens or folds them all, and searching shows every match whatever is folded. (Because of this change, categories you'd opened or folded before start folded once.)

## 1.4.14 — 2026-10-23

### New features

- **Selection filter:** a new funnel button in the view tools at the bottom right, beside the wire button, limits what you can select. Its *Select only* menu has parts, wires, cables, bus bars, DIN rails and text notes. Pick one for only that kind; with a filter on, each tick adds or removes a kind, and *Anything (no filter)* turns it off.
  - While it's on, the button turns blue and says what's allowed (e.g. *Only wires*), and the cursor over the drawing becomes a crosshair with a small funnel.
  - Clicks pick only the allowed kinds, and terminals don't start wires. Dragging on empty space (or on something not allowed) draws a selection box that picks up the allowed kinds, including wires, bus bars and cables with an end inside the box. Shift adds to the selection. Ctrl+A selects everything allowed.
  - **Space** or **Esc** turns the filter off. Esc keeps what you just selected, so you can act on it; press Esc again to clear the selection. Space + drag still pans the drawing.

## 1.4.13 — 2026-10-23

### New features

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

### Bug fixes

- **Library sidebar fixes:**
  - Long category names (such as the AutomationDirect library's) no longer make a sideways scroll bar appear under the library. They're shortened with "…", and the full name shows when you hover over them.
  - The **⋯** menu beside the library drop-down no longer runs off the left edge of the window. It now fits the width of the sidebar, and long entries such as *Export "AutomationDirect DIN-rail relays"* are shortened, with the full text on hover.

## 1.4.11 — 2026-10-23

### New features

- **Show only these wires:** with wires selected (or a cable), right-click and choose *Show only these wires* (*Show only this wire* for one), or use the button under *Wiring* in the right panel. Every other wire is hidden from the drawing so you can follow just those.
  - While wires are hidden, the view tools at the bottom right say how many are shown, e.g. *Showing 3 of 10 wires · Show all*. Click it, or right-click empty space and choose *Show all wires*, to bring them back.
  - It's only a view: hidden wires stay in the diagram and the wire list, new wires you draw still show, and printouts and exported images include every wire. Opening a file, starting a new diagram or loading the example shows all wires again.

## 1.4.10 — 2026-10-23

### Improvements

- **View tools in their own group:** the wire button now sits in its own small box just left of the zoom buttons, instead of sharing their box. Future view options will join it there, keeping zoom separate.

## 1.4.9 — 2026-10-23

### Improvements

- **View tools:** the **Wires** strip across the top right of the drawing is now a single wire button in the bottom-right corner, next to the zoom buttons. Click it for a small menu of *None*, *Labels*, *Straight lines* and *Curved lines*, with a tick on the current one. Hover over the button to see which is in use. This leaves the top of the drawing clear.

## 1.4.8 — 2026-10-23

### New features

- **Help menu:** a new **Help** menu next to **Export** has *How to use DIN Stack* (the help, still also on the **?** key) and *Welcome tips*. The **?** button at the top right is gone.

### Improvements

- **Getting started removed:** the right panel no longer shows the *Getting started* tips with nothing selected. Its buttons all live elsewhere now: *Welcome tips* and help in the **Help** menu, and Settings at the top right.

## 1.4.7 — 2026-10-23

### Improvements

- **Shorter library manager:** each library's description is folded away by default. Click the arrow (or the library's name) to show or hide it. Ones you open stay open while you load, refresh and unload.

## 1.4.6 — 2026-10-23

### New features

- **Library manager:** **+** beside the library drop-down now opens *Included libraries*, a manager for the ready-made libraries that come with DIN Stack. Each one shows whether it's loaded in this diagram, its version, and how many parts use it, with:
  - **Load** to add it;
  - **Refresh** to load it again and pick up changes. It's highlighted when a newer version is out, and it also removes types the library no longer has, unless a part still uses them;
  - **Unload** to remove it. If parts use its types, it asks first and removes those parts and their wires too.
- **Refresh all** at the bottom refreshes every included library in the diagram. The window stays open between actions, and **Undo** reverses each one.

### Improvements

- In the **⋯** menu, *Add a ready-made library…* is now *Manage included libraries…*.

## 1.4.5 — 2026-10-23

### New features

- **Library versions:** each ready-made library now has its own version number and its own history, in the new [library release notes](libraries/README.md). Library fixes are recorded there from now on, not here.
- **+ Add a library…** shows each library's version with a *What's new* link. A diagram remembers which version of a library it loaded. When a newer version is available, or the library was added before it had a version number, its **Update** button is highlighted and the list says which version the diagram has.

### Bug fixes

- *AutomationDirect DIN-rail relays* library updated to version 1.0.1. The change is in its [release notes](libraries/automationdirect/RELEASE_NOTES.md).

## 1.4.4 — 2026-10-23

### New features

- **Wire lines replace the labels:** with **Wires** set to *Straight* or *Curved*, wires are drawn as lines between the terminals without the destination labels (`W3 → TB101-1`) at each end, which used to be drawn underneath the lines as well. Each line shows its wire number at the middle; click it or the line to select the wire.
- **No wires:** a new **None** choice in **Wires** (and in Settings) hides wires and cables on the drawing, for a layout view. They're still in the wire list, a selected wire's terminals are still ringed, and printouts and exported images follow the setting. Bus bars and connector labels still show.

### Improvements

- The *Show where each wire goes* tick box in Settings is gone, since *Labels* and *None* cover it. A diagram saved with it unticked opens with **Wires** set to *None*.

## 1.4.3 — 2026-10-23

### Improvements

- **Adding from the right-click menu:** the *Add* toolbar at the top left of the drawing is gone. Right-click empty space on the drawing for **Add**: *DIN rail here*, *Text note here*, *Bus bar…* and *Cable…*. Bus bars and cables can still be started from a terminal's right-click menu too.
- The welcome tips, help and *Getting started* say where to find them.

## 1.4.2 — 2026-10-23

### New features

- **Welcome tips:** the first time DIN Stack is opened in a browser, a short welcome explains how to place parts, wire them, edit them and keep your work. From there you can explore the example, start a blank diagram, or open the help. It appears only once, and not at all for anyone who has already used DIN Stack in that browser.
- **Welcome tips** in the *Getting started* section of the right panel (with nothing selected) shows it again.

## 1.4.1 — 2026-10-23

A reorganised interface. Everything works as before; some things have moved.

### Improvements

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

### New features

- **New library: Amphenol 26482 Series 2 connectors**, in **+ Add a library…**: MIL-DTL-26482 Series 2 circular panel receptacles. Details are in its [release notes](libraries/amphenol-26482-series-2/RELEASE_NOTES.md).

## 1.2.2 — 2026-10-23

### Improvements

- *Phoenix Contact UT terminal blocks* library updated. The changes are in its [release notes](libraries/phoenix-contact-ut/RELEASE_NOTES.md).

## 1.2.1 — 2026-10-22

The first change after the 1.1.3 commit, so the middle number goes up. Developed as 1.1.4 and 1.1.5 (the UT library update above); those numbers were never released and are skipped.

### New features

- **New library: Phoenix Contact UT terminal blocks**, in **+ Add a library…**: Phoenix Contact's UT screw terminal blocks. Details are in its [release notes](libraries/phoenix-contact-ut/RELEASE_NOTES.md).

## 1.1.3 — 2026-10-22

### Improvements

- Added `TODO.md`, a list of open items. Most are the AutomationDirect library types whose terminal layout still needs checking against real hardware.

## 1.1.2 — 2026-10-22

Numbered 1.0.35 while developed on its own branch, renumbered to follow 1.1.1 (the to-do list above was 1.0.36).

### New features

- **New library: AutomationDirect DIN-rail relays**, in **+ Add a library…**: the DIN-rail relays, timers, monitoring relays and relay sockets AutomationDirect sells. Details are in its [release notes](libraries/automationdirect/RELEASE_NOTES.md).

### Improvements

- The library guide has a new *Libraries that come with DIN Stack* section explaining how it's organised.

## 1.1.1 — 2026-10-22

Version number set by hand as a new minor release. It brings together the changes made since 1.0.34, which were numbered 1.0.35 and 1.0.36 during development and never released under those numbers.

### New features

- **Separate libraries:** object types are now kept in named libraries instead of one long list. A drop-down above the search box picks which one is shown:
  - *Built-in* has the types that come with DIN Stack.
  - *My types* has the types you've made.
  - Each imported library file becomes its own library, named after the file, and is shown straight after importing.
  - *All libraries* shows everything at once, for searching across all of them.
- New types go into the library being shown. The type designer has a new **Library** field, so you can move a type to another library or start a new one.
- **Add a library:** pick **+ Add a library…** at the bottom of the library drop-down to see the ready-made libraries that come with DIN Stack, and add one with a click. Each is loaded as its own library and shown straight away. One already in the diagram offers **Update**, to load it again.
  - The list comes from `libraries/index.json`. It needs the online version or an installed copy; when DIN Stack is opened straight from `index.html`, the chooser explains how to import a library file by hand instead.
  - No ready-made libraries are listed yet. They'll appear as library files are added to `libraries/`.

### Improvements

- **Export library** now saves just the library shown, in a file named after it. Pick *All libraries* to export everything as before.
- Library files can carry a `name`, used as the library's name when imported.
- Diagrams and library files from earlier versions open as before. Their built-in types go into *Built-in* and the rest into *My types* (or, when importing, a library named after the file).

## 1.0.34 — 2026-10-22

Version number set by hand: kept in the 1.0 series rather than moving to 1.1.1.

### New features

- A **GitHub** link next to the version number, at the bottom of the library panel, opens the project page.

### Improvements

- The README links to the online version at https://mmmlinux.github.io/DIN-Stack/.

## 1.0.33 — 2026-10-22

### Improvements

- Finished the rename to DIN Stack: the app's storage in the browser, its offline copy and the marker inside exported library files now use the new name too.
- Work autosaved in the browser by earlier versions isn't picked up. Open a saved `.json` file to continue with it. Diagram and library files from earlier versions still open as before.
- Installed copies clear out all older offline caches when they update.

## 1.0.32 — 2026-10-22

### Improvements

- **Renamed to DIN Stack** (previously DIN Sizer). The new name appears in the app, its browser tab, the installed app and the documentation.
- *Export library* now downloads `dinstack-library.json`. Library and diagram files saved under the old name still open, and work saved in your browser carries over.

## 1.0.31 — 2026-10-22

### Improvements

- **Add moved to the toolbar:** *Rail*, *Note*, *Bus bar* and *Cable* are now in the top toolbar under **Add**, so they stay available when the library panel is hidden.
- The left panel now holds only the library. Its **«** hide button sits next to *+ New type*.

## 1.0.30 — 2026-10-22

### New features

- **Collapsible object library:** click a category's name (e.g. *Terminal blocks*) to fold it away, and click again to open it. Each category shows how many types it holds. The ⊟ button next to *+ New type* folds every category, and ⊞ opens them all again.
- Searching shows all matching types, even in folded categories.
- **Hide the left panel:** **«** at the top of the left panel shrinks it to a thin strip, giving the drawing more room. Click **»** on the strip to bring it back.
- The app remembers which categories are folded and whether the panel is hidden, in this browser. It isn't saved with the diagram.

## 1.0.29 — 2026-10-22

### New features

- **One-ended cables:** for a cable whose other end isn't on the drawing, such as a field device, a pump or a sensor:
  1. Click **Cable** under Add, or right-click a terminal → *Cable from here…*.
  2. Click the terminals its cores go to, in core order (or drag along a row).
  3. Press Enter.
  
  The cores sweep from the terminals into a sheath that runs off to a free end, marked with a short bar.
- Each cable has a label, a description (e.g. `4x0.75 LiYY`) and a new **Goes to** field. "Goes to" is written past the free end, e.g. "→ Pump P1".
- Each core is a wire, so it has its own number, colour, size and profile, and it's listed in the wire list as going to **C1-1**, **C1-2**… Circuit highlighting works as usual.
- **Changing it:** *Add cores…* picks more terminals. Removing a core in the cable's list deletes it. Deleting the cable deletes its cores. Drag the orange dots to move the fan-out point and the free end, and *Reset layout* puts them back.
- By default the cable leaves in the direction the terminals face, and starts beyond the wire labels so it doesn't cover them.

### Improvements

- Wire labels now have a thin paper-coloured outline, so they stay readable where a wire or cable runs underneath.
- The *Add* buttons are laid out two to a row.

## 1.0.28 — 2026-10-22

### New features

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

### New features

- **Grids of terminals in the object type designer:** *Add a grid of terminals* places a block such as a 2 × 16 header or an IC footprint. You set columns, rows, the pitch across and down (2.54 mm by default), and the position (or leave it centred).
- **Numbering options:**
  - *Rows, wrapping* (1 2 / 3 4 …)
  - *Columns, wrapping*
  - *Around, counter-clockwise like an IC* (1–16 down the left, 17–32 back up the right)
  - *Around, clockwise*
  - *Row letter + number* (A1… B1…)
  
  *Pin 1 at* sets the starting corner, and *First name* sets the starting name.
- Grid terminals face their labels away from the grid: left and right columns outward, or top and bottom rows outward. A new grid starts out selected, ready to drag into place.

### Improvements

- **Closely pitched terminals:** dots now shrink to fit the spacing between terminals, so pins at 2.54 mm no longer overlap. Below about 3.6 mm, each pin's name is printed inside its dot, both on the diagram and in the designer. Existing parts, with wider spacing, look the same as before.
- A part's tag now steers clear of any terminals under it, not only those on the top and bottom edges. When only the tag fits, the type name underneath is left off.
- The library guide has a new section on grids.

## 1.0.26 — 2026-10-22

### Improvements

- **Ctrl-drag snaps the whole group:** when you push parts along with Ctrl held, the whole moving group snaps, not just the part you grabbed. Any of its edges can sit flush against the parts staying put, or line up with them. For example, sliding a strip right closes up flush against the next part on the rail, and a small drag snaps back to where it started. Edges also line up with parts on a nearby rail. Hold **Alt** as well to move without snapping.

## 1.0.25 — 2026-10-22

### New features

- **Striped wires:** a wire's panel has a new **Stripe** setting for a tracer stripe in any wire colour, e.g. red with a white stripe, or white with a green stripe. The stripe is drawn as short dashes over the base colour on the drawing, in both the wire stubs and drawn lines.
- Striped wires are listed with the base colour first, like **Red/White**, in the wire list, CSV export and printout, with a striped colour chip.
- **Wire profiles can have a stripe**, set in a new *Stripe* column of the profiles dialog. Wires following the profile take it. Adding or changing a stripe on a profile wire by hand makes it a custom wire, the same as changing its colour.
- New wires that match their circuit copy its stripe too. Green/yellow already has its own banding, so it can't take a stripe.

## 1.0.24 — 2026-10-22

### Improvements

- **Ctrl-drag only pushes what's touching:** holding Ctrl while dragging now moves only the parts snapped against the selection on that side, then the parts touching those, and so on. The first gap stops it. For example, dragging TB103 right moves the rest of the strip and its end stop, but not a relay further along the rail with space before it. Previously everything level with the selection moved, gap or not.
- Rails are never pushed, only the parts on them.

## 1.0.23 — 2026-10-22

### New features

- **Select and move several terminals in the object type designer:**
  - Drag a box over empty space to select terminals. Shift- or Ctrl-click (in the preview or the table) adds or removes one, and Ctrl+A selects all.
  - Drag any selected terminal to move the whole group. The grabbed terminal snaps to the grid, the rest keep their spacing, and the group stays inside the outline. Hold Shift to move straight.
  - Arrow keys nudge the selection (Shift for ten steps), Ctrl+D duplicates it, and Delete removes it.
  - Esc clears the selection first, and a second Esc closes the designer.
- **Selection bar** under the preview: *Align in a row*, *Align in a column*, *Space evenly*, *Link together*, *Duplicate* and *Delete*.
- In the terminal table, changing Type, Label side or Link on a selected row applies to all selected terminals.
- **Undo and redo inside the designer** (Ctrl+Z, Ctrl+Y) for terminal moves, edits, rows, deletions and the size and colour fields.

### Improvements

- A newly added row of terminals starts out selected, ready to be dragged into place.
- A plain click on empty space still adds a terminal, as before.

### Bug fixes

- Clicking the preview now takes keyboard focus, so Delete, the arrow keys and Esc act on the terminals rather than the last text box you typed in.

## 1.0.22 — 2026-10-22

### New features

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

### New features

- **Loose connectors:** a new *Enclosure connectors* group in the library has 2-, 4- and 8-pin panel connectors and a round M12 4-pin connector, for connections that go to the enclosure rather than the rail. They're tagged X1, X2…, and their wires read like `X1-3`.
- **Mounting setting for object types:** in the designer, *DIN rail* (as before) or *Loose (enclosure, panel, cable)*. Loose parts can be placed anywhere: they don't snap onto rails or get carried along when a rail is moved, but still line up with neighbouring parts. They show "loose" in the library and on the part's panel.
- Diagrams saved before this version get the new connector types added to their library once. If you delete them, they stay deleted.

### Improvements

- On wide parts whose terminals would cover the centred tag, such as the connectors, the tag now moves into the free space below the terminals.
- The library guide covers the Mounting setting and the new connectors.

### Bug fixes

- Clicking a loose part in the library while a rail part is selected no longer puts it on the strip next to that part. It's placed in view instead. Clicking it with another loose part selected still places it alongside.

## 1.0.20 — 2026-10-22

### New features

- **Push to make room:** hold **Ctrl** (Cmd on a Mac) while dragging a part, or a selection of parts, and everything beyond it in the direction you drag moves along with it. Drag TB103 right with Ctrl to open a gap after TB102, and TB104 onwards, the end stop and anything else further along that row all shift together.
- Only items level with what you're dragging are pushed: the rest of its row when moving sideways, or what's directly above or below it when moving up or down. Parts on other rails stay where they are, and so does the rail itself.
- While Ctrl is held the move stays straight (purely sideways or purely up and down), and a hint shows how many items are being pushed. You can press or release Ctrl mid-drag. Wires and bus bars stay attached, and one undo puts everything back.

## 1.0.19 — 2026-10-22

### New features

- **Library guide:** a new document, `docs/library.md`, explains how to build your object library. It covers every setting in the designer, adding terminals (by clicking, by row or by typing positions), label sides, internal links and bus bar slots. It also has a worked example, notes on changing types that are already in use, exporting and importing libraries, and the library file format for anyone who wants to generate libraries with a script.
- The help (**?**) and the README link to the guide.

## 1.0.18 — 2026-10-22

### New features

- **Select daisy chain:** next to *Select whole circuit* in a wire's or bus bar's panel. It selects only the wires and bus bars joined to each other at the same terminals, such as a chain of jumpers along the tops of a terminal strip. It doesn't follow connections through a part, so wires on the other side of the terminal blocks aren't included. Wires joined only by a shared circuit name or connector label aren't included either.
- The button shows how many it will select, and only appears when the chain is smaller than the whole circuit.

## 1.0.17 — 2026-10-22

### New features

- **Bus bars match their circuit too:** a new bus bar takes the colour of the wires in its circuit instead of always starting copper. It keeps following, so changing the feed wire's colour by hand changes the bus bar too.
- Changing a bus bar's colour by hand stops it following, and wires or bus bars that follow it change to match. A bus bar's panel has the same **Match the circuit** tick box as a wire.
- A new wire joining a circuit that has bus bars but no wires takes the bus bar's colour, and follows it.
- Bus bars made before this version don't follow anything until you tick the box.

## 1.0.16 — 2026-10-22

### New features

- **Install as an app:** when DIN Sizer is opened from its website (such as GitHub Pages), browsers now recognise it as a web app. In Firefox on Windows, use "Add to taskbar" in the address bar. In Chrome or Edge, use the install button. It then opens in its own window with its own icon.
- **Works offline:** once installed or visited, the app keeps working without a connection. When online it always loads the latest version.

### Improvements

- New app icon: terminal blocks on a rail, with two bus bars.

## 1.0.15 — 2026-10-22

### New features

- **New wires match their circuit:** a new wire that joins a circuit already holding wires takes on their profile, colour, size and conductor. It first looks at the terminal you started from and its circuit, then the other end. Matching beats the old guess from terminal names.
- Matching wires keep following. If you later change a wire in the circuit by hand, for example the wire from the power supply to the terminal that feeds a bus bar, the matching wires change with it.
- Changing a matching wire by hand stops it following, so your change sticks. The wire's panel has a **Match the circuit** tick box to turn following back on, which copies the circuit's wire again.
- Wires in diagrams saved before this version don't follow anything until you tick the box.

## 1.0.14 — 2026-10-22

### New features

- **Circuit names:** select a wire or bus bar and type a *Circuit name* under Circuit, such as `+24V`, `0V` or `L1`. The name applies to the whole circuit, so wires added to it later pick it up automatically.
- **Connector labels:** select a part and type a label next to any terminal in its Terminals list. The label is drawn at the terminal as a boxed tag. Use it where a connection comes from somewhere you don't want to wire up on the drawing, such as a power feed.
- The same name means the same circuit. Terminals with the same connector label, and wires or bus bars with the same circuit name, are treated as connected even with no wire between them. Circuit highlighting follows them. Names aren't case-sensitive.
- Renaming a circuit also renames the connector labels in it. Clearing a circuit name leaves its connector labels alone.
- The wire list, bus bar list, CSV export and printout have a new **Circuit** column. Name fields suggest names already in use, and hovering a labelled terminal shows its label.

### Improvements

- The example now names the +24V and 0V circuits and labels the incoming L1 and N supply.

## 1.0.13 — 2026-10-22

### New features

- **Bus bar slots:** terminal blocks now have two slots in the middle that take bus bars but not wires, like the bridge shafts on real blocks. Use one slot for each bar to connect alternate blocks in a row, for example +24 V on every other block and 0 V on the rest.
- While picking terminals for a bus bar, **Keep 1st, 3rd…** and **Keep 2nd, 4th…** thin the picked terminals to every other one along the row. Sweep the whole row of slots, then keep the half you want.
- Each block a bar connects to gets a coloured contact dot. A bar that passes over a block without a dot doesn't connect to it.
- Slots can only be clicked while picking for a bus bar. At other times, clicking one selects the block or bar as usual.
- The object type designer has a new **Type** column, *Wire* or *Bus bar slot*, so your own types can have slots too.
- Built-in 2-wire, blue, ground and 4-wire terminal blocks get their slots automatically, including in diagrams you've already saved. Slots you delete in the designer stay deleted.

### Improvements

- Tags on narrow parts now sit in the free space between terminals rather than behind them.
- The example diagram's strip now alternates +24 V and 0 V blocks, bridged with two bus bars.

## 1.0.12 — 2026-10-22

### New features

- **Wire standard:** a new setting under Display (nothing selected) switches between **Metric** (mm² sizes, brown line, blue neutral, green/yellow earth, as before) and **American** (AWG sizes, black hot, white neutral, green ground).
- Switching converts the whole diagram. Wire and profile sizes change to the nearest standard size (1.5 mm² becomes 16 AWG, and so on), and AC line, neutral and earth wires change colour. Other colours, such as +24 V red and 0 V blue, stay as they are. Switching back restores the original sizes exactly.
- The starter profiles are renamed to match, for example *Protective earth* becomes *Ground (PE)*. The size suggestions list only the chosen system's sizes.
- New diagrams and *Load example* keep the current standard.

### Bug fixes

- Fixed: a new wire to a terminal named N now picks the AC neutral profile rather than 0 V DC.

## 1.0.11 — 2026-10-22

### New features

- **Wire profiles:** set up named wire types, each with a colour, size and conductor (stranded or solid), and assign wires to them. Pick a profile on a selected wire, or select several wires (for example with *Select whole circuit*) and assign them all at once.
- Editing a profile updates every wire assigned to it. Changing a wire's colour, size or conductor by hand makes it a custom wire again.
- Open **Edit wire profiles…** from the Diagram panel (nothing selected) or with *Edit…* next to a wire's profile. It comes with six starter profiles: +24 V DC, 0 V DC, protective earth, AC line, AC neutral and control signal.
- New wires pick a fitting profile automatically: the one whose colour matches the terminal (+, 0 V, PE, L, N), otherwise the last profile you used.
- Wires now record **Conductor** (stranded or solid). The wire list, CSV export and printout gain *Conductor* and *Profile* columns.
- *Export library* now includes your wire profiles, and *Import library* adds them, so profiles can be reused across diagrams.

## 1.0.10 — 2026-10-22

### New features

- **Bus bars:** bridge a row of terminals with a bus bar, such as a jumper comb across several terminal blocks. Click **Bus bar** under Add (or *Bus bar…* on a selected part), then click the terminals or drag along the row, and press Enter. The bar is drawn as a thick line through the terminals.
- Bus bars count in circuit highlighting: selecting a wire lights up the bars in its circuit and everything they bridge.
- Each bus bar has a label (BB1, BB2…), a colour and notes, and its terminals can be edited later. Bus bars have their own tab next to the wire list, are included when printing, and are copied when you duplicate or copy the parts they bridge.

### Improvements

- The example diagram now has bus bars across the +24 V and 0 V terminal blocks.

## 1.0.9 — 2026-10-22

### New features

- **Circuit highlighting:** selecting a wire now also highlights the rest of its circuit in lighter blue. This covers every wire connected to it, including through the other side of a terminal block, along with their terminals and their rows in the wire list. The wire's panel lists the other wires in the circuit and has a *Select whole circuit* button.
- **Internal connections in object types:** the designer has a new **Link** column. Terminals with the same Link value are treated as connected inside the part. Use *Link all* or *Clear links* for quick setup, and dashed lines in the preview show the links.
- The built-in types come linked where it makes sense: terminal blocks and fuse terminals end to end, each pole of a breaker from top to bottom, and the power supply's +V pair and −V pair. Diagrams saved before this version get these links automatically. Types you created yourself start with no links.

## 1.0.8 — 2026-10-22

### Improvements

- When a terminal has several wires, their labels are now arranged to match where the wires go. On a top or bottom terminal, a wire to a part on the left sits in the left lane and a wire to the right sits in the right lane. On side terminals, wires going up sit above wires going down. If two wires head the same way, they're ordered by wire number.

## 1.0.7 — 2026-10-22

### Improvements

- When a terminal has more than one wire, each wire now gets its own stub, in its own colour, and its own label, side by side in wire-number order. Previously they were squeezed into one comma-separated label. Each label can be clicked on its own to select that wire.

## 1.0.6 — 2026-10-22

### New features

- **Renumber tags:** select several parts and renumber them in the order they sit: left to right, right to left, or top to bottom. You choose the prefix, start number and step, with a live preview. Leading zeros are kept, so starting at `001` gives 001, 002, … Wires stay connected, and you're told if a new tag is already used by another part.
- New buttons on a selected part: **All of this type** and **All "TB…"** select every matching part in one click. The second picks up every part with the same tag prefix, such as grey, blue and ground terminal blocks together.

## 1.0.5 — 2026-10-22

### Bug fixes

- Fixed: dragging objects from the library onto the sheet now works reliably with any mouse, touchpad or pen. While you drag, a preview of the part follows the cursor, snapping to rails and neighbouring parts, and the part is placed where you let go. Press Esc to cancel or hold Alt to place freely.

## 1.0.4 — 2026-10-22

### New features

- Hold **Alt** while dragging to turn snapping off and place a part freely.

### Improvements

- Parts snap onto DIN rails much more readily. A part now centres on a rail from at least 12 mm away (more when zoomed out), and this takes priority over lining up with nearby parts.

## 1.0.3 — 2026-10-22

### Improvements

- Terminal references now read like **TB101-1** and **TB101-2**: the part's tag, a dash, then the terminal name. To use a different character, change *Terminal reference* under Display (nothing selected). The choices are `-`, `:`, `.`, `/` or a space. This applies to wire labels, the wire list, CSV and print.
- Built-in terminal blocks now use the tag prefix **TB**. The example diagram's strip is numbered TB101–TB107.

## 1.0.2 — 2026-10-22

### New features

- New **Left → right / Right → left** toggle for building strips. With right to left, parts added beside the selected one, *Repeat* copies and *Pack side by side* all go leftwards, and tags still count up. You'll find the toggle under the Repeat control, in the Arrange tools when several parts are selected, and under Display when nothing is selected. It's saved with the diagram.

## 1.0.1 — 2026-10-22

First version.

### New features

- Draw DIN rail layouts with real-size parts in millimetres: terminal blocks, power supply, DC UPS / battery backup, battery, circuit breakers, relay and generic modules.
- Design your own object types: set the size and colour, then click to place terminals or add whole rows of them.
- Wire terminals together by dragging or by clicking. Each terminal shows where its wire goes, with optional straight or curved lines.
- Set a number, colour, size and notes for each wire. The wire list and parts list update as you work.
- Build terminal strips quickly with numbered repeats. Parts snap to their neighbours and to DIN rails.
- Export to SVG (true scale), PNG and CSV, or print / save as PDF with the wire list and parts list.
- Work saves automatically in the browser. Diagrams and object libraries can be saved to files and opened again.
- Includes an example diagram: a 24 V supply with battery backup and a terminal strip.
