# DIN Stack

A small browser app for documenting DIN rail wiring. You place terminal blocks, power supplies, battery backups and other parts at their real size in millimetres, then connect terminals. Each terminal is labelled with where its wire goes (`W3 → TB101-1`), and the app builds a wire list and parts list for you.

It isn't tied to any manufacturer. Every object is a simple rectangle with terminals, and you can design your own in a few seconds.

**Use it online:** https://mmmlinux.github.io/DIN-Stack/

## Features

- **Real-size parts.** Every object type has a width and height in mm. Parts snap flush against each other and centre on DIN rails (35 mm or 15 mm).
- **Measure tool.** Drag across the drawing to measure a distance in mm and inches, with the ends snapping to terminals and to the edges of parts and rails.
- **Pages.** A diagram can have several pages (e.g. back panel, door, junction box), switched with tabs at the bottom left of the drawing. Wires and cables can run between pages and are drawn broken at each end, labelled with the page the other end is on (the *Page names* option turns that off). Holding the mouse over a wire or cable shows where each end goes and on which page, with its circuit and details. The lists show which page everything is on, and *Print / PDF* prints every page.
- **Separate libraries.** Each imported library file is kept as its own library, picked from a drop-down at the top of the library, alongside *Built-in* and *This project*. The **+** beside it opens the library manager, which loads, unloads and refreshes the ready-made libraries in `libraries/`, or imports a library file. Export (in the **⋯** menu) saves the library shown.
- **Swapping a part's type.** Change a part's *Type* and the new part takes the old one's place: it stays on its rail, whatever was snapped against it stays snapped against it (a strip opens out or closes up to suit), and a bigger part pushes aside whatever is in its way.
- **A project library.** *This project* holds the object types made or changed in the diagram: new types, duplicates, and edited copies. Editing a type from the built-in or another library saves an edited copy there and switches the diagram's parts to it, so the original library stays as published and refreshing it can't undo your changes.
- **Your own object types.** Set the size, then click where each terminal goes, add a whole row, or add a grid (e.g. 2 × 16) numbered by rows, by columns, around like an IC, or with row letters. Box-select terminals to move, align, space or link them as a group. Changing a type updates every part that uses it. Types can be rail-mounted or loose. Loose types, such as the included enclosure connectors, can go anywhere without snapping to rails. See the [library guide](docs/library.md) for details.
- **Ready-made libraries.** Add [AutomationDirect's DIN-rail relays, timers and sockets](libraries/automationdirect/automationdirect-din-relays.json) (59 types covering 206 part numbers) or [Phoenix Contact UT terminal blocks](libraries/phoenix-contact-ut/phoenix-contact-ut.json) with their accessories (64 types) or [Amphenol 26482 Series 2 circular connectors](libraries/amphenol-26482-series-2/amphenol-26482-series-2.json) (68 types) or [AutomationDirect pushbuttons, selector switches and pilot lights](libraries/automationdirect/automationdirect-pushbuttons.json) (52 types, including Schmersal's N and E series with their contact blocks) or [miscellaneous networking parts](libraries/misc-networking/misc-networking.json) (an industrial switch, a PoE injector, a KVM extender and an ASUS computer) or [the AACC Mechatronics parts](libraries/aacc-mechatronics/aacc-mechatronics.json) (TE terminal blocks, a MicroLogix 1100 PLC, Siemens CSM 1277 and PM1207, and a RHINO 5 V supply) or [American Electrical 10 × 38 mm fuse holders](libraries/american-electrical/american-electrical-fuse-holders.json) (8 types) from **+** beside the library drop-down instead of drawing them yourself.
- **Example workspaces.** Add `#mechatronics` to the address (https://mmmlinux.github.io/DIN-Stack/#mechatronics) to open the Mechatronics example, built with the AACC Mechatronics library. It's a workspace of its own: its diagram is saved separately from the main one, so you can switch between the two links without losing either, and **File → Open the example** there opens the Mechatronics example.
- **Wiring for documentation.** Drag from one terminal to another (or click one, then the other). The **Select** tool lets you click a terminal to see what's wired to it without starting a wire. Right-click a wire or its label to move either end to another terminal. Wires get a number, colour, size and notes. They show as destination labels at each terminal, or as straight or curved lines between terminals with the wire number on each, or can be hidden. Any wire can be drawn differently from the rest, e.g. broken into a labelled stub at each end so a long run doesn't cross the drawing.
- **Striped wires.** Give a wire a tracer stripe, such as red with a white stripe, shown on the drawing and listed as "Red/White".
- **Wire profiles.** Named wire types (colour, stripe, size, stranded or solid) that you assign wires to. Editing a profile updates all its wires. Wire profiles and cable profiles each have a tab in the lists at the bottom. New wires and bus bars match the wires already in their circuit, and follow later changes to them unless you change the new one by hand.
- **American or metric wiring.** American (AWG, US colours) is the default. A *Wire standard* setting switches sizes between AWG and mm², and line / neutral / earth colours between US (black, white, green) and IEC (brown, blue, green/yellow). Existing wires and profiles are converted.
- **Cables.** Each end of a cable is plugged into one or more cable connectors, fans out into coloured cores that land on terminals (or both, e.g. a motor cable with two plugs and two loose cores at the drive end), or is left free, running off to a labelled end (e.g. "→ Pump P1"), in any combination: connector to connector, connector to fan-out, or fan-out to fan-out. Bundle existing wires into a cable, or start one from a terminal or connector, and change either end later from the cable's *Ends* section or its right-click menu. When fanning out, pick which core goes to each terminal and skip the ones you don't use; a core can also be connected at one end only, marked as not connected through. The sheath carries the cable's label and description. Cables can be drawn full length or broken, as a short tail at each end labelled with where the other end goes (e.g. "K1", or "C1 → K1" with cable names on), for the whole drawing or cable by cable. Cables have their own list and appear in the printout.
- **Cable connectors.** Terminals can be cable connectors (sockets such as RJ45 ports) that take a cable's plug rather than single wires. Drag between two of them for a patch cable, or from one to a terminal for a cable that fans out at its other end, such as a motor cable. Built-in types include 5- and 8-port Ethernet switches, an RJ45 feed-through, an M23 motor connector and a motor.
- **Wire and cable profiles.** Named wire types (colour, stripe, size, conductor) and cable types (sheath colour, type, shielded, twisted pairs, notes, and the cores they contain) that wires and cables follow. A cable profile can list its cores in order, each with a marking, colour, stripe, size and conductor, and a cable's cores take those looks. Star the ones you use most as favourites: only those are offered in the drop-downs and right-click menus, and the rest are a click away in a searchable chooser. Shielded cables are drawn with a dashed outline.
- **Cable library.** Ready-made cable types with their cores (Ethernet, USB 2.0, PROFINET, PROFIBUS, 9-core serial, M8 and M12 sensor cables, control and D-sub 25 cables, power, motor and instrument cables) to add to a drawing's cable profiles, from a cable's *Cable profile* drop-down or the cable button at the bottom right. New drawings start with no cable profiles, and editing a drawing's copy leaves the library alone.
- **Bus bars.** Bridge a row of terminals with a bus bar, drawn as a bar through them and included in circuit tracing and the printout. Terminal blocks have two bus bar slots in the middle, so two bars can bridge alternate blocks (for example +24 V and 0 V). *Keep 1st, 3rd…* and *Keep 2nd, 4th…* make that quick.
- **Circuit tracing.** Selecting a wire highlights every other wire in the same circuit. The trace follows wires and terminals that are linked inside a part, such as both sides of a terminal block. Internal links are set per object type. You can select everything sharing the circuit's name, only what's physically wired to the wire you picked, or just the daisy chain of wires joined at the same terminals.
- **Named circuits and connector labels.** Name a circuit (e.g. `+24V`) from any wire in it. Give a terminal a connector label instead of drawing a wire from where the supply comes from. Terminals and wires with the same name count as one circuit, and a *Circuit* column appears in the wire list, CSV and printout. A named circuit's wires can be labelled with the circuit's name or with where they go, for the whole circuit or wire by wire. A wire, bus bar, cable or connector label that would join two differently named circuits (e.g. `+24V` to `0V`) asks first: join them under one name, keep both names, or don't join.
- **Terminal strips.** Select a block and use *Repeat* to add numbered copies (TB101, TB102, …). Each connector is referenced as tag plus terminal name, e.g. TB101-1 and TB101-2; the joining character can be changed in Settings. Clicking a library item while a part is selected also places the new part flush beside it. A *Left → right / Right → left* toggle sets which way strips grow.
- **Edit several at once.** Select several wires, bus bars, cables, parts, rails or notes and change the settings they share in one go, such as colour, size, type or how their labels read. Settings they don't share show as *Mixed*.
- **Renumbering.** Select several parts (or every part of a type or tag prefix in one click), then renumber them in position order with your choice of prefix, start number and step. Wires stay attached.
- **Lists.** Live lists of wires, cables, bus bars and parts under the drawing, with a filter box. The wire list exports as CSV.
- **Export.** SVG at true scale or PNG, of the page you're on, or *Print / PDF*, which prints the diagram's pages and its lists. Print settings set the paper size (American Letter, Legal, Tabloid… or metric A sizes, following the wire standard), orientation and margins, and scale each page to fit a sheet, to the paper's width, or to a set scale such as 1:1 over as many sheets as it takes. Each sheet of drawing gets a page to itself.
- **Organised workspace.** The library on the left, the drawing in the middle (right-click it to add rails, notes, bus bars and cables), an inspector on the right with foldable sections for whatever is selected, and a Settings dialog for the drawing and wiring options.
- **Start screen.** Each time it opens, DIN Stack offers to continue where you left off, start a new diagram, open a file or load the example. On an example link such as `#mechatronics`, it offers to reload that example instead. If nothing is clicked within 10 seconds, it carries on with the current diagram. You can turn the start screen off from its own tick box or in Settings.
- **Saving.** Work saves automatically in your browser. *Save*, *Save as…* and *Open* in the File menu use `.json` files, and the object library can be exported and imported separately.
- **Right-click menus** on parts, terminals, wires, bus bars, rails, notes and empty space.
- **Making room.** Hold Ctrl while dragging a part to push the parts snapped against it on that side along too, for example to open a gap in a terminal strip. Parts past a gap stay where they are.
- **File and Edit menus** like a desktop app's: File for new, open, save, save as, export and print; Edit for undo, redo, cut, copy, paste, duplicate, delete, select all and find.
- Undo and redo, cut, copy and paste, rotate, align and pack, and keyboard shortcuts (press **?** in the app).

## Running it

It's plain HTML, CSS and JavaScript with no build step and no dependencies.

- **Online:** go to https://mmmlinux.github.io/DIN-Stack/. Nothing to install.
- **Locally:** open `index.html` in a browser.
- **Your own GitHub Pages copy:** push the repository to GitHub, then go to *Settings → Pages*, choose *Deploy from a branch*, pick your branch and the `/ (root)` folder, and save. The site appears at `https://<user>.github.io/<repo>/`.
- **As an app:** from the GitHub Pages site (or any http/https server), the browser can install DIN Stack as an app in its own window. In Firefox on Windows, use the "Add to taskbar" button in the address bar. In Chrome or Edge, use the install button in the address bar or *Apps → Install*. Once installed it also works offline, and it picks up new versions automatically when online. This doesn't apply when opening `index.html` directly as a file.

## Files

| Path | What it holds |
| --- | --- |
| `index.html` | Page layout, dialogs |
| `css/style.css` | Styles, including print layout |
| `js/version.js` | App version |
| `js/defaults.js` | Built-in object types, wire colours, example diagram |
| `js/render.js` | Geometry and SVG drawing |
| `js/tpl-editor.js` | Object type designer |
| `js/app.js` | Editor state, interaction, panels, import/export |
| `manifest.webmanifest` | App name, icons and window style, so browsers can install it as an app |
| `sw.js` | Service worker: installable app and offline use |
| `icons/` | App icons (SVG sources and PNGs) |
| `docs/library.md` | Guide to building and sharing object libraries |
| `libraries/` | Ready-made libraries, one folder each (or one per collection, such as `automationdirect/`), each with its own `RELEASE_NOTES.md`: AutomationDirect's DIN-rail relays, timers and sockets, Phoenix Contact UT terminal blocks, Amphenol 26482 Series 2 connectors, AutomationDirect pushbuttons and pilot lights, misc networking parts and computers, the AACC Mechatronics parts, and American Electrical fuse holders |
| `examples/` | Example diagrams opened by a link: `mechatronics.json` for `#mechatronics` |
| `libraries/index.json` | The list of ready-made libraries shown in the library manager (**+** beside the library drop-down) |
| `libraries/README.md` | List of the ready-made libraries and their folders; their version histories, kept separately from the app's, are in each folder's `RELEASE_NOTES.md` |
| `TODO.md` | Open items, such as terminal layouts in the AutomationDirect library still to check against real hardware |

## Developing

There's no build step: edit the files and reload the page.

To tell a local copy apart from the live site, put an empty file named `.dev` in the project root. While it's there, the logo banner at the top left turns red and shows a **DEV** badge. The page checks for the file when it loads, so this works when opening `index.html` directly or from a local server. `.dev` is listed in `.gitignore`, so it's never committed and the live site never has it. Delete it to see the app as users do.

## License

You're free to use, modify and share DIN Stack. You may not sell it, or sell a product or service whose value comes mainly from it, without the author's permission. See [LICENSE](LICENSE) for the full terms (MIT License with the Commons Clause).
