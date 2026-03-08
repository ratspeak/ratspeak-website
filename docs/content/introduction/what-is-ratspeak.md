# What is Ratspeak?

Ratspeak is your window into encrypted mesh communication — send messages, manage your network, and monitor connections without servers, accounts, or surveillance.

## Overview

<div class="screenshot-placeholder" data-caption="Ratspeak dashboard showing connections console with active network nodes, messaging sidebar, and network health indicators">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#7e8fa2" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
    <div>Ratspeak dashboard — screenshot coming soon</div>
</div>

Ratspeak is a dashboard and desktop app for Reticulum mesh networks. It gives you a graphical interface for messaging, network visualization, identity management, connection monitoring, and interactive apps like chess.

No accounts to create on someone else's server. No data stored in someone else's cloud. Your identity is a cryptographic key that lives on your device.

Ratspeak is available two ways:

- **In your browser** — open localhost and start using it
- **As a desktop app** — native app for macOS, Linux, and Windows via Tauri

## Two Implementations

Ratspeak exists in two implementations:

- **Ratspeak-py** — the original Python implementation (Flask + Socket.IO backend). Mature, full-featured, and the easiest way to get started.
- **Ratspeak-rs** — a Rust implementation with the same features. Built on an actor-based architecture for better performance and security. This is the primary focus going forward.

Both use the same web frontend and are fully interoperable on the Reticulum network. Choose whichever suits your platform and preferences.

## What You Can Do

- **Send encrypted messages** — LXMF end-to-end encrypted messaging, compatible with other Reticulum apps (Sideband, NomadNet, MeshChat). Send files, search message history, and track delivery.
- **Visualize your network** — interactive graph showing who's connected, how many hops away, and which interfaces carry traffic.
- **Manage your identity** — create, import, export, and switch between identities. Your identity is your passport on the mesh.
- **Monitor connections** — live table of every destination your node knows about, with reachability status, hop counts, and path ages.
- **Connect radios and interfaces** — add LoRa radios, TCP links, WiFi discovery, and Bluetooth mesh through the UI.
- **Run a propagation node** — store messages for offline contacts and deliver them when they reconnect.
- **Play chess over the mesh** — interactive games via the RLAP protocol, with human-readable fallback for non-Ratspeak clients.

## Hardware Companions

Ratspeak also has dedicated hardware:

- **RatDeck** — a portable LoRa messenger built on the LilyGo T-Deck Plus (ESP32-S3 with integrated display, keyboard, and LoRa radio).
- **RatCom** — a pocket-sized Reticulum node built on the M5Stack Cardputer (ESP32-S3 with keyboard and LoRa module).

Both run standalone firmware and can connect to your Ratspeak dashboard. See the [Hardware](../hardware/rnode-overview) section for details.

## Who Is Ratspeak For?

- **Privacy-conscious communicators** — you want encrypted messaging without trusting a company.
- **Off-grid operators** — you need communication that works without internet or cell service.
- **Community network builders** — you're setting up resilient infrastructure for your neighborhood.
- **Developers** — you want to build apps on a decentralized protocol.

## The Ecosystem

Ratspeak is part of the Reticulum ecosystem. Other apps include Sideband (mobile/desktop), NomadNet (terminal-based), MeshChat (web-based), and Columba (Android). They all speak LXMF over Reticulum, so messages sent from Ratspeak reach users on any compatible app.

## What's Next

- [What is Reticulum?](../introduction/what-is-reticulum) — the networking protocol underneath
- [Choosing Your Setup](../getting-started/choosing-your-setup) — pick the right installation for you
- [Dashboard Overview](../using-ratspeak/dashboard-overview) — tour the interface
