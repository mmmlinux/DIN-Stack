# DIN Stack

A small browser app for documenting DIN rail wiring. You place terminal blocks, power supplies, battery backups and other parts at their real size in millimetres, then connect terminals. Each terminal is labelled with where its wire goes (`W3 → TB101-1`), and the app builds a wire list and parts list for you.

It isn't tied to any manufacturer. Every object is a simple rectangle with terminals, and you can design your own in a few seconds.

**Use it online:** https://mmmlinux.github.io/DIN-Stack/

## Features

- **Real-size parts.** Every object type has a width and height in mm. Parts snap flush against each other and centre on DIN rails (35 mm or 15 mm).
- **Separate libraries.** Each imported library file is kept as its own library, picked from a drop-down above the library list, alongside *Built-in* and *My types*. *+ Add a library…* in the same drop-down lists the ready-made libraries in `libraries/` to add with one click. Export saves the library shown.
- **Your own object types.** Set the size, then click where each terminal goes, add a whole row, or add a grid (e.g. 2 × 16) numbered by rows, by columns, around like an IC, or with row letters. Box-select terminals to move, align, space or link them as a group. Changing a type updates every part that uses it. Types can be rail-mounted or loose. Loose types, such as the included enclosure connectors, can go anywhere without snapping to rails. See the [library guide](docs/library.md) for details.
- **Ready-made libraries.** Add [AutomationDirect's DIN-rail relays, timers and sockets](libraries/automationdirect-din-relays.json) (59 types covering 206 part numbers) or [Phoenix Contact UT terminal blocks](libraries/phoenix-contact-ut.json) with their accessories (64 types) or [Amphenol 26482 Series 2 circular connectors](libraries/amphenol-26482-series-2.json) (68 types) from *+ Add a library…* instead of drawing them yourself.
- **Wiring for documentation.** Drag from one terminal to another (or click one, then the other). Wires get a number, colour, size and notes. They show as destination labels at each terminal, and can also be drawn as straight or curved lines.
- **Striped wires.** Give a wire a tracer stripe, such as red with a white stripe, shown on the drawing and listed as "Red/White".
- **Wire profiles.** Named wire types (colour, stripe, size, stranded or solid) that you assign wires to. Editing a profile updates all its wires. New wires and bus bars match the wires already in their circuit, and follow later changes to them unless you change the new one by hand.
- **Metric or American wiring.** A *Wire standard* setting switches sizes between mm² and AWG, and line / neutral / earth colours between IEC (brown, blue, green/yellow) and US (black, white, green). Existing wires and profiles are converted.
- **Cables.** Bundle wires that run in one cable. They're drawn as a sheath that fans out into the coloured cores at each terminal, with the cable's label and description along it. A cable can also have just one end on the drawing, with its cores landing on terminals and its sheath running off to a labelled free end (e.g. "→ Pump P1"). Cables have their own list and appear in the printout.
- **Bus bars.** Bridge a row of terminals with a bus bar, drawn as a bar through them and included in circuit tracing and the printout. Terminal blocks have two bus bar slots in the middle, so two bars can bridge alternate blocks (for example +24 V and 0 V). *Keep 1st, 3rd…* and *Keep 2nd, 4th…* make that quick.
- **Circuit tracing.** Selecting a wire highlights every other wire in the same circuit. The trace follows wires and terminals that are linked inside a part, such as both sides of a terminal block. Internal links are set per object type. You can select the whole circuit, or just the daisy chain of wires joined at the same terminals.
- **Named circuits and connector labels.** Name a circuit (e.g. `+24V`) from any wire in it. Give a terminal a connector label instead of drawing a wire from where the supply comes from. Terminals and wires with the same name count as one circuit, and a *Circuit* column appears in the wire list, CSV and printout.
- **Terminal strips.** Select a block and use *Repeat* to add numbered copies (TB101, TB102, …). Each connector is referenced as tag plus terminal name, e.g. TB101-1 and TB101-2; the joining character can be changed under Display. Clicking a library item while a part is selected also places the new part flush beside it. A *Left → right / Right → left* toggle sets which way strips grow.
- **Renumbering.** Select several parts (or every part of a type or tag prefix in one click), then renumber them in position order with your choice of prefix, start number and step. Wires stay attached.
- **Lists.** A live wire list and parts list, exportable as CSV.
- **Export.** SVG at true scale, PNG, or *Print / PDF*, which prints the diagram, wire list and parts list.
- **Saving.** Work saves automatically in your browser. *Save* and *Open* use `.json` files, and the object library can be exported and imported separately.
- **Right-click menus** on parts, terminals, wires, bus bars, rails, notes and empty space.
- **Making room.** Hold Ctrl while dragging a part to push the parts snapped against it on that side along too, for example to open a gap in a terminal strip. Parts past a gap stay where they are.
- Undo and redo, copy and paste, rotate, align and pack, and keyboard shortcuts (press **?** in the app).

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
| `libraries/` | Ready-made library files: AutomationDirect's DIN-rail relays, timers and sockets, Phoenix Contact UT terminal blocks, and Amphenol 26482 Series 2 connectors |
| `libraries/index.json` | The list of ready-made libraries offered by *+ Add a library…* |
| `TODO.md` | Open items, such as terminal layouts in the AutomationDirect library still to check against real hardware |

## License

You're free to use, modify and share DIN Stack. You may not sell it, or sell a product or service whose value comes mainly from it, without the author's permission. See [LICENSE](LICENSE) for the full terms (MIT License with the Commons Clause).
