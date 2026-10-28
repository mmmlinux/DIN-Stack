# Phoenix Contact UT terminal blocks: release notes

This library has its own version number (MAJOR.COMMIT.CHANGE), separate from DIN Stack's. Versions are listed newest first. DIN Stack's own changes are in the main [release notes](../../RELEASE_NOTES.md).

To get a newer version into a diagram, click **+** beside the library drop-down and use **Refresh** next to the library. It's highlighted when the diagram has an older version.

## 1.0.0

The library as of DIN Stack 1.2.2, before libraries had version numbers: 64 types.

- Added in DIN Stack 1.2.1 with 54 types:
  - feed-through blocks from UT 1,5 to UT 35, in grey and blue;
  - ground (PE) blocks;
  - TWIN (3-connection) and QUATTRO (4-connection) blocks;
  - double-level UTTB and three-level blocks, including PE/L/N;
  - fuse (HESI) and disconnect (HEDI, MT, MTD) blocks;
  - end covers.
- Sizes come from Phoenix Contact's catalog, and each type's name includes its order number. Feed-through and ground blocks have two bridge slots in the middle, like the built-in terminal blocks, and can be swapped with them without losing wires.
- DIN Stack 1.2.2 added the accessories that take up rail space, for 64 types in all:
  - partition plates for UT, TWIN, QUATTRO, UTTB and three-level blocks, and the UTTB spacer plate;
  - end clamps: CLIPFIX 35-5, CLIPFIX 35, E/UK and E/NS 35 N.
- Plug-in bridges aren't separate types: draw them as bus bars through the blocks' bridge slots.
