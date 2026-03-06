# What Is Ratspeak?

A real-time dashboard and desktop app for Reticulum mesh networks — messaging, network visualization, games, identity management, and monitoring in your browser or as a native application.

## Overview

Ratspeak gives you a graphical interface to the Reticulum network stack. Instead of managing configs by hand and monitoring from the terminal, you get a real-time dashboard with encrypted messaging, interactive network graphs, chess games over the mesh, dynamic interface management, and identity controls — all from a browser or the Tauri desktop app.

It's built with Flask + Socket.IO on the backend and vanilla JavaScript on the frontend. No build tools, no framework lock-in, no accounts, no cloud services.

<div class="screenshot-placeholder">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#7e8fa2" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
    <div>Dashboard overview — screenshot placeholder</div>
</div>

## Features

### Encrypted Messaging
Send and receive LXMF (Lightweight Extensible Message Format) encrypted messages, compatible with Sideband, NomadNet, and MeshChat. Supports multiple delivery modes including store-and-forward for offline recipients. File attachments, full-text search, and delivery status tracking included.

### Network Graph
A D3.js force-directed graph showing your mesh topology in real time. Nodes are color-coded by type — hub (green), contacts (blue), stale (yellow), offline (red), transport (purple), discovered (gray). Zoom, pan, drag, pin, search, and filter. See [Graph Visualization](../using-ratspeak/graph-visualization) for details.

### Games & Apps
Play chess and other interactive games with contacts over the mesh. Built on **RLAP** (Reticulum LXMF App Protocol) — a lightweight app protocol that encodes game actions into LXMF messages. Non-Ratspeak clients see human-readable fallback text. See [Games & Apps](../using-ratspeak/games-and-apps) for details.

### Network Topology
Live connections table showing all discovered destinations with hop counts, path ages, interface info, and reachability status. Interface health alerts, throughput sparklines, and status summaries.

### Identity Management
Create, import, export, and switch between Reticulum identities without restarting. Each identity is an Ed25519 + X25519 keypair with isolated storage. Export identities for use in other Reticulum apps.

### Interface Control
Add and remove network interfaces through the UI — TCP connections, LoRa via RNode (open-source LoRa radio hardware), WiFi/LAN auto-discovery, and BLE mesh. LoRa presets for Long Range, Balanced, and Fast modes with region-specific frequencies.

### Propagation Node
Run a local propagation node for store-and-forward messaging. Sync messages from remote propagation nodes. Essential for delay-tolerant networks where recipients may be offline.

### Contacts & Reachability
Track contact reachability with configurable thresholds. See who's online, stale, or offline based on how recently a route to them was confirmed. Auto-path requests keep routes fresh.

### Desktop App
Ratspeak runs as a native desktop application via **Tauri** (Rust-based app shell with WebView). The Python backend is bundled as a sidecar binary via PyInstaller. Available for macOS, Linux, and Windows.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | Python 3.11+, Flask, Socket.IO |
| Frontend | Vanilla JavaScript (no build step) |
| Protocol | Reticulum (RNS), LXMF, RLAP |
| Desktop | Tauri v2 (Rust + WebView) |
| Database | SQLite with WAL mode, FTS5 search |
| Visualization | D3.js v7 (Canvas rendering) |
| Real-time | Socket.IO WebSocket connections |

## The Ecosystem

Ratspeak is one of several applications built on Reticulum:

- **[Sideband](https://github.com/markqvist/Sideband)** — mobile/desktop messaging app with voice calls
- **[NomadNet](https://github.com/markqvist/NomadNetwork)** — terminal-based mesh communication
- **[MeshChat](https://github.com/liamcottle/reticulum-meshchat)** — web-based messaging
- **[Columba](https://github.com/music-mind/Columba)** — native Android LXMF client

All of these speak LXMF over Reticulum, so messages sent from Ratspeak can be received by Sideband (and vice versa). RLAP game actions appear as readable text on non-Ratspeak clients.

## Next Steps

- [How They Work Together](../introduction/how-they-work-together) — understand the architecture
- [Installing Ratspeak](../getting-started/installing-ratspeak) — get up and running
- [Dashboard Overview](../using-ratspeak/dashboard-overview) — tour the interface
