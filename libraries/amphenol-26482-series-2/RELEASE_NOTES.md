# Amphenol 26482 Series 2 connectors: release notes

This library has its own version number (MAJOR.COMMIT.CHANGE), separate from DIN Stack's. Versions are listed newest first. DIN Stack's own changes are in the main [release notes](../../RELEASE_NOTES.md).

To get a newer version into a diagram, click **+** beside the library drop-down and use **Refresh** next to the library. It's highlighted when the diagram has an older version.

## 1.1.1 — 2026-10-29

- Every type now has its maker (Amphenol) and three order numbers to pick from, for DIN Stack's bill of materials: the MS3470 wall-mount (the default), MS3471 cable-connecting and MS3474 jam-nut receptacle with that insert, e.g. MS3470L14-19P. Shell class L is assumed; change the letter if you order another class. Needs DIN Stack 1.11.1 or later.

## 1.0.0

The library as first published in DIN Stack 1.3.1, before libraries had version numbers.

- 68 circular panel receptacles: all 34 MIL-DTL-26482 Series 2 insert arrangements, from shell size 8 to 24, each with pins and with sockets.
- Contacts carry the catalog's letters and are laid out as seen from the wire side. Pin inserts are mirrored, and the master key is at the top. Search for an arrangement such as `14-19` to find it.
