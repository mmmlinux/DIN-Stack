# Misc networking: release notes

This library has its own version number (MAJOR.COMMIT.CHANGE), separate from DIN Stack's. Versions are listed newest first. DIN Stack's own changes are in the main [release notes](../../RELEASE_NOTES.md).

To get a newer version into a diagram, click **+** beside the library drop-down and use **Refresh** next to the library. It's highlighted when the diagram has an older version.

## 1.1.1 — 2026-10-29

- Makers and order numbers filled in for DIN Stack's bill of materials: NGI-U05E and NPOEI-60W-1G (Tripp Lite), IH2006-KVM-EXTENDER for the transmitter (sold as a kit with the receiver) and IH2006-KVM-RX for the receiver on its own. The ASUS computer has its maker only. Needs DIN Stack 1.11.1 or later.

## 1.0.2 — 2026-10-23

- **ASUS computer** (new, 5 types in all): a free-standing computer, 7.25 in tall by 5.25 in wide, that doesn't go on a DIN rail. One side has a two-terminal power connector (V+, V−, which take wires), two LAN ports, serial ports COM1–2, four USB ports, HDMI and DisplayPort. The other side has serial ports COM3–6 and two more USB ports.
- The order of the connectors along each side and the power polarity are assumptions; see the [library guide](../../docs/library.md#libraries-that-come-with-din-stack).

## 1.0.1 — 2026-10-23

- New library with 4 types:
  - **Tripp Lite NGI-U05E** 5-port unmanaged industrial gigabit switch (DIN rail, 12–48 V DC).
  - **Tripp Lite NPOEI-60W-1G** 60 W 802.3bt PoE++ injector (DIN rail, dual 24–57 V DC, alarm relay).
  - **StarTech IH2006** HDMI KVM-over-IP transmitter and receiver (the IH2006-KVM-EXTENDER kit).
- The switch's power pin names and the injector's terminal order are assumptions; see the [library guide](../../docs/library.md#libraries-that-come-with-din-stack).
