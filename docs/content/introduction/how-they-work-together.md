# How They Work Together

Ratspeak, Reticulum, and LXMF each handle a different job. Understanding how they connect makes everything else in this documentation click.

## The Layer Cake

Think of it like sending a letter. Reticulum is the roads and mail carriers — it moves packets from place to place. LXMF is the envelope and stamp — it formats your message, encrypts it, and handles delivery. Ratspeak is the desk where you write and read letters.

Here is how the layers stack up:

| Layer | Role | Analogy |
|-------|------|---------|
| **Reticulum** | Networking — routing, encryption, transport | The roads and mail carriers |
| **LXMF** | Messaging — delivery modes, store-and-forward | The envelope and stamp |
| **RLAP** | Apps — interactive sessions encoded in messages | A form inside the envelope |
| **Ratspeak** | Interface — dashboard, controls, visualization | Your desk |

Each layer depends on the one below it. Reticulum handles the network plumbing. LXMF handles message formatting and delivery. RLAP lets apps embed interactive sessions inside messages. Ratspeak ties it all together in a browser-based interface you can actually use.

## Under the Hood

When you start Ratspeak, three things happen behind the scenes:

1. **The network daemon starts** (`rnsd`) — This is the engine that talks to the outside world. It manages your radio connections, WiFi discovery, TCP links, and all the routing. Think of it as the radio operator in your station.

2. **A bridge agent connects** — This small helper connects the network daemon to the dashboard, relaying network events back and forth.

3. **The dashboard server starts** — This is what you see in your browser. It handles messaging, shows your network graph, and lets you manage everything through a graphical interface.

<div class="docs-diagram">
<svg viewBox="0 0 700 300" xmlns="http://www.w3.org/2000/svg" fill="none">
  <!-- rnsd process -->
  <rect x="40" y="40" width="180" height="90" rx="10" stroke="#00D4AA" stroke-width="1.5" fill="rgba(0,212,170,0.06)"/>
  <text x="130" y="68" text-anchor="middle" fill="#00D4AA" font-family="JetBrains Mono" font-size="13" font-weight="600">rnsd</text>
  <text x="130" y="88" text-anchor="middle" fill="#9eadbf" font-family="Outfit" font-size="11">Network Daemon</text>
  <text x="130" y="108" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="10">Interfaces, routing, transport</text>

  <!-- Bridge agent -->
  <rect x="260" y="40" width="180" height="90" rx="10" stroke="#F59E0B" stroke-width="1.5" fill="rgba(245,158,11,0.06)"/>
  <text x="350" y="68" text-anchor="middle" fill="#F59E0B" font-family="JetBrains Mono" font-size="13" font-weight="600">Bridge Agent</text>
  <text x="350" y="88" text-anchor="middle" fill="#9eadbf" font-family="Outfit" font-size="11">Node Agent</text>
  <text x="350" y="108" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="10">Relays network events</text>

  <!-- Dashboard server -->
  <rect x="480" y="40" width="180" height="90" rx="10" stroke="#38BDF8" stroke-width="1.5" fill="rgba(56,189,248,0.06)"/>
  <text x="570" y="68" text-anchor="middle" fill="#38BDF8" font-family="JetBrains Mono" font-size="13" font-weight="600">Dashboard</text>
  <text x="570" y="88" text-anchor="middle" fill="#9eadbf" font-family="Outfit" font-size="11">Web Server</text>
  <text x="570" y="108" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="10">UI, messaging, controls</text>

  <!-- Connection: rnsd <-> agent -->
  <line x1="220" y1="75" x2="260" y2="75" stroke="#3a4759" stroke-width="1.5" stroke-dasharray="6 3"/>
  <text x="240" y="68" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">RNS</text>

  <!-- Connection: agent <-> dashboard -->
  <line x1="440" y1="75" x2="480" y2="75" stroke="#3a4759" stroke-width="1.5" stroke-dasharray="6 3"/>

  <!-- Connection: rnsd <-> dashboard (direct) -->
  <path d="M130 130 L130 185 L570 185 L570 130" stroke="#38BDF8" stroke-width="1.5" stroke-dasharray="6 3"/>
  <text x="350" y="200" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="10">Direct RNS connection for messaging</text>

  <!-- Browser -->
  <rect x="440" y="225" width="280" height="55" rx="10" stroke="#C084FC" stroke-width="1.5" fill="rgba(192,132,252,0.06)"/>
  <text x="580" y="250" text-anchor="middle" fill="#C084FC" font-family="JetBrains Mono" font-size="12" font-weight="600">Your Browser</text>
  <text x="580" y="268" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="10">or Tauri Desktop App</text>

  <!-- Dashboard <-> Browser -->
  <line x1="570" y1="130" x2="570" y2="225" stroke="#C084FC" stroke-width="1.5" stroke-dasharray="6 3"/>
  <text x="588" y="178" fill="#7e8fa2" font-family="Outfit" font-size="9">HTTP + WebSocket</text>

  <!-- Animated data pulse -->
  <circle r="3" fill="#00D4AA" opacity="0.8">
    <animate attributeName="cx" values="130;350;570" dur="3s" repeatCount="indefinite"/>
    <animate attributeName="cy" values="185;185;185" dur="3s" repeatCount="indefinite"/>
  </circle>
</svg>
<figcaption>Ratspeak architecture: network daemon, bridge agent, and dashboard server</figcaption>
</div>

The network daemon (`rnsd`) is your primary node — sometimes called the hub node. When you add interfaces, change settings, or send messages, you are operating through this Reticulum instance. For most setups, a single hub node is all you need.

## Ratspeak-py vs Ratspeak-rs

Ratspeak has two implementations. They look the same from the outside and talk the same protocol, but they are built with different tools.

| | Ratspeak-py | Ratspeak-rs |
|---|---|---|
| Language | Python | Rust |
| Backend | Flask + Socket.IO | Axum + Socket.IO |
| Network stack | Python RNS library | Native Rust implementation |
| Best for | Getting started, broad platform support | Performance, security, long-term use |
| Same frontend | Yes | Yes |
| Interoperable | Yes — same protocol, same network | Yes |

Both implementations produce the same user experience. Messages sent from Ratspeak-py reach Ratspeak-rs users (and vice versa) because they speak the same Reticulum protocol. Pick whichever fits your situation — you can always switch later without losing compatibility with the rest of the network.

## Sending a Message — The Full Journey

Here is what happens when you send a message, start to finish:

1. You type a message and hit **Send** in your browser.
2. The browser sends it to the dashboard server via WebSocket.
3. The dashboard's messaging system (LXMF) encrypts the message with the recipient's public key.
4. The encrypted packet is handed to the network daemon (`rnsd`).
5. `rnsd` routes the packet out through the best available interface — LoRa radio, TCP connection, WiFi, whatever is available.
6. The packet travels across the mesh, hopping through transport nodes if needed.
7. The recipient's `rnsd` receives the packet.
8. Their dashboard decrypts it and shows it in their message view.
9. A delivery confirmation travels back to you.

No central server touches the message at any point. The encryption happens on your device, and only the recipient's device can decrypt it. Transport nodes in between carry sealed packets they cannot read.

Adding or removing network interfaces requires a brief restart of the network daemon. Ratspeak handles this automatically — you will see a momentary reconnection, then the new interface appears.

> **Tip**: BLE Mesh is the one interface that doesn't require restarting the network daemon. It connects directly at runtime — useful for quick ad-hoc connections.

## What's Next

- [Key Concepts](../introduction/key-concepts) — essential terminology explained
- [Choosing Your Setup](../getting-started/choosing-your-setup) — pick the right installation
- [Dashboard Overview](../using-ratspeak/dashboard-overview) — tour the interface
