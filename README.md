<div align="center">

<img src="build/icon.svg" width="120" alt="OpsLink Icon"/>

# OpsLink

**A free, open-source ACARS Datalink & Flight Operations Tool for flight simulator enthusiasts.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/msoehl/OpsLink)](https://github.com/msoehl/OpsLink/releases/latest)
[![Build](https://img.shields.io/github/actions/workflow/status/msoehl/OpsLink/release.yml)](https://github.com/msoehl/OpsLink/actions)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey)

</div>

---

## About

OpsLink puts **ACARS first**. It brings realistic airline datalink operations to your flight simulator — automated OPS messages through every flight phase, CPDLC logon from the live map, PDC parsing, D-ATIS, loadsheets, and more.

---

## Features

- **ACARS / Hoppie Datalink** — Full CPDLC, PDC, D-ATIS, Oceanic, Position reporting, Loadsheet and OPS messages via [Hoppie](https://www.hoppie.nl/acars/).
- **Automatic Phase Messages** — OPS notifications fire automatically as you taxi, climb, cruise, descend and block in.
- **CPDLC from the Map** — Click an ATC sector on the live map to instantly open a CPDLC logon.
- **PDC Parser** — Received pre-departure clearances are automatically parsed for Squawk, SID and Initial Climb.
- **Message Templates** — Save and reuse free-text ACARS messages.
- **Sound Alerts** — Distinct audio cues for CPDLC uplinks, OPS messages and general incoming traffic.
- **Flight Logbook** — Flights are recorded automatically with phase timeline and full ACARS transcript.
- **Moving Map** — Live route display with VATSIM/IVAO traffic, VATGlasses ATC sectors and sim aircraft position.
- **Flight Planning** — Load your SimBrief OFP with a single click. Overview, fuel summary, navlog and raw OFP text.
- **Auto-Updater** — In-app update check and one-click install from GitHub Releases.

---

## Download

<div align="center">

[⬇️ Download for macOS](https://github.com/msoehl/OpsLink/releases/latest/download/OpsLink.dmg) &nbsp;&nbsp; [⬇️ Download for Windows](https://github.com/msoehl/OpsLink/releases/latest/download/OpsLink-Setup.exe)

</div>

> **macOS:** The app is currently unsigned. On first launch, right-click → **Open**.

---

## Setup

1. **SimBrief** — Enter your SimBrief username in Settings and load your OFP from the Dashboard.
2. **Hoppie ACARS** — Register a free logon code at [hoppie.nl](https://www.hoppie.nl/acars/) and enter it in Settings.
3. **Network** — Choose VATSIM or IVAO in Settings for live traffic and ATIS.
4. **Simulator** — Connect MSFS/P3D via SimConnect or X-Plane via UDP — position and phase tracking starts automatically.

---

## Disclaimer

OpsLink is intended **for use with flight simulators only**. It is not certified for real-world aviation use.

---

## License

[MIT](LICENSE) © 2025 Moritz Söhl
