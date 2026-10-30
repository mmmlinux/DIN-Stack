# AACC Mechatronics: release notes

This library has its own version number (MAJOR.COMMIT.CHANGE), separate from DIN Stack's. Versions are listed newest first. DIN Stack's own changes are in the main [release notes](../../RELEASE_NOTES.md).

To get a newer version into a diagram, click **+** beside the library drop-down and use **Refresh** next to the library. It's highlighted when the diagram has an older version.

## 1.2.1 — 2026-10-30

- The MicroLogix 1100's inputs and outputs are marked for DIN Stack's PLC I/O list, with their addresses: I:0/0 to I:0/9, O:0/0 to O:0/5, and the analog inputs IV1 and IV2 at I:0.4 and I:0.5. Needs DIN Stack 1.12.6 or later.

## 1.1.2 — 2026-10-29

- The TE terminal blocks and their end sections are marked as such, for DIN Stack's terminal strip report. Needs DIN Stack 1.11.6 or later.

## 1.1.1 — 2026-10-29

- Makers and order numbers filled in for DIN Stack's bill of materials: TE Connectivity (Entrelec) blocks and end sections, the MicroLogix 1100 as 1763-L16AWA, -L16BWA, -L16BBB and -L16DWD, the Siemens CSM 1277 and PM1207, and the RHINO PSP05-020S. The TB-2503 barrier strip is generic and has none. Needs DIN Stack 1.11.1 or later.

## 1.0.1 — 2026-10-24

- New library with 12 types for the AACC Mechatronics panel:
  - **TE Connectivity (Entrelec) terminal blocks:** ZK2.5 and ZK2.5-4P PI-spring feed-through blocks (grey), with plug-in bridge slots, and their EK2.5 and EK2.5-4P end sections.
  - **TB-2503 barrier strip:** a generic 3-position, 25 A screw barrier strip for panel mounting, with a screw on each side of each position.
  - **Allen-Bradley MicroLogix 1100:** 1763-L16AWA, L16BWA, L16BBB and L16DWD, with their input and output terminal blocks as in Rockwell's user manual, and the RS-232 and Ethernet ports.
  - **Siemens:** SIMATIC NET CSM 1277 4-port switch (6GK7277-1AA10-0AA0) and SIMATIC PM1207 24 V DC 2.5 A power supply (6EP1332-1SH71).
  - **AutomationDirect RHINO PSP05-020S:** 5 V DC 4 A power supply, screw terminals.
- Several terminal positions and names are assumptions; see the [library guide](../../docs/library.md#libraries-that-come-with-din-stack).
