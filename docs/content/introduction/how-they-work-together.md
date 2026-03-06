# How They Work Together

Ratspeak isn't a single program — it's three processes working in concert. Understanding how they connect helps you troubleshoot issues and build more complex setups.

## The Stack

Ratspeak sits at the top of a three-layer stack:

| Layer | What It Does |
|-------|-------------|
| **Reticulum** | Cryptographic networking — routing, encryption, transport |
| **LXMF (Lightweight Extensible Message Format)** | Messaging protocol — delivery modes, store-and-forward |
| **RLAP (Reticulum LXMF App Protocol)** | App layer — interactive sessions (games, tools) encoded in LXMF custom fields |
| **Ratspeak** | User interface — dashboard, controls, visualization |

Each layer depends on the one below it. Reticulum handles the network. LXMF handles messages. Ratspeak makes it all accessible through a browser.

## Three-Process Architecture

Ratspeak runs three types of processes that work together:

<div class="docs-diagram">
<svg viewBox="0 0 700 320" xmlns="http://www.w3.org/2000/svg" fill="none">
  <!-- rnsd process -->
  <rect x="40" y="40" width="180" height="100" rx="10" stroke="#00D4AA" stroke-width="1.5" fill="rgba(0,212,170,0.06)"/>
  <text x="130" y="70" text-anchor="middle" fill="#00D4AA" font-family="JetBrains Mono" font-size="13" font-weight="600">rnsd</text>
  <text x="130" y="90" text-anchor="middle" fill="#9eadbf" font-family="Outfit" font-size="11">Reticulum Daemon</text>
  <text x="130" y="108" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="10">Interfaces, transport, routing</text>

  <!-- node_agent process -->
  <rect x="260" y="40" width="180" height="100" rx="10" stroke="#F59E0B" stroke-width="1.5" fill="rgba(245,158,11,0.06)"/>
  <text x="350" y="70" text-anchor="middle" fill="#F59E0B" font-family="JetBrains Mono" font-size="13" font-weight="600">node_agent.py</text>
  <text x="350" y="90" text-anchor="middle" fill="#9eadbf" font-family="Outfit" font-size="11">Node Agent</text>
  <text x="350" y="108" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="10">RNS bridge, packet relay</text>

  <!-- app.py process -->
  <rect x="480" y="40" width="180" height="100" rx="10" stroke="#38BDF8" stroke-width="1.5" fill="rgba(56,189,248,0.06)"/>
  <text x="570" y="70" text-anchor="middle" fill="#38BDF8" font-family="JetBrains Mono" font-size="13" font-weight="600">app.py</text>
  <text x="570" y="90" text-anchor="middle" fill="#9eadbf" font-family="Outfit" font-size="11">Dashboard Server</text>
  <text x="570" y="108" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="10">Web UI, Socket.IO, LXMF</text>

  <!-- Connections -->
  <!-- rnsd <-> agent (RNS shared instance) -->
  <line x1="220" y1="75" x2="260" y2="75" stroke="#00D4AA" stroke-width="1.5" stroke-dasharray="6 3"/>
  <text x="240" y="68" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">RNS</text>

  <!-- agent <-> app (Socket.IO /agents) -->
  <line x1="440" y1="75" x2="480" y2="75" stroke="#F59E0B" stroke-width="1.5" stroke-dasharray="6 3"/>
  <text x="460" y="68" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Socket.IO</text>

  <!-- rnsd <-> app (RNS shared instance) -->
  <path d="M130 140 L130 200 L570 200 L570 140" stroke="#38BDF8" stroke-width="1.5" stroke-dasharray="6 3"/>
  <text x="350" y="218" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="10">RNS Shared Instance (hub node client)</text>

  <!-- Browser -->
  <rect x="430" y="240" width="280" height="60" rx="10" stroke="#C084FC" stroke-width="1.5" fill="rgba(192,132,252,0.06)"/>
  <text x="570" y="268" text-anchor="middle" fill="#C084FC" font-family="JetBrains Mono" font-size="12" font-weight="600">Browser</text>
  <text x="570" y="285" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="10">http://localhost:5050</text>

  <!-- app <-> browser -->
  <line x1="570" y1="140" x2="570" y2="240" stroke="#C084FC" stroke-width="1.5" stroke-dasharray="6 3"/>
  <text x="590" y="190" fill="#7e8fa2" font-family="Outfit" font-size="9">HTTP + WS</text>

  <!-- Animated data pulse on rnsd->app connection -->
  <circle r="3" fill="#38BDF8" opacity="0.8">
    <animate attributeName="cx" values="130;350;570" dur="3s" repeatCount="indefinite"/>
    <animate attributeName="cy" values="200;200;200" dur="3s" repeatCount="indefinite"/>
  </circle>

  <!-- Animated data pulse on app->browser -->
  <circle r="3" fill="#C084FC" opacity="0.8">
    <animate attributeName="cx" values="570;570" dur="1.5s" repeatCount="indefinite"/>
    <animate attributeName="cy" values="140;240" dur="1.5s" repeatCount="indefinite"/>
  </circle>
</svg>
<figcaption>The three-process model with data flow connections</figcaption>
</div>

### 1. rnsd — Reticulum Daemon

The **rnsd** (Reticulum Network Stack Daemon) is the core networking process. It manages all configured interfaces (LoRa, TCP, WiFi, etc.), handles packet routing and transport, and maintains path tables for the network.

Each node has its own rnsd instance with its own config directory under `nodes/<node_name>/`.

### 2. node_agent.py — Node Agent

The **node agent** bridges rnsd and the dashboard. It connects to rnsd as a shared instance client (connecting to rnsd's local socket so multiple programs can share one Reticulum instance) and to the dashboard server via Socket.IO's `/agents` namespace. It relays packet send/receive commands between the two.

### 3. app.py — Dashboard Server

The **dashboard server** is a Flask + Socket.IO application. It connects to the hub node's rnsd as a shared instance client, runs the messaging system (LXMF router), serves the web UI, and handles all user interactions via Socket.IO events.

## The Hub Node

The **hub node** (`node_1` by default) is the primary rnsd instance. The dashboard connects directly to it. When you add interfaces, change settings, or send messages through Ratspeak, you're operating through the hub node's Reticulum instance.

Additional nodes can be added dynamically through the UI for multi-node deployments, but for most setups a single hub node is all you need.

## Data Flow Example

When you send a message through Ratspeak:

1. You type a message in the browser
2. The browser sends it via Socket.IO to **app.py**
3. **app.py**'s LXMF router encrypts it and hands it to **rnsd** via the shared instance connection
4. **rnsd** routes the encrypted packet out through the appropriate interface (LoRa, TCP, WiFi, etc.)
5. The packet traverses the mesh network to its destination
6. Delivery confirmation travels back the same path

## Interface Changes

Adding or removing interfaces requires a brief restart of the Reticulum daemon. Ratspeak handles this automatically — you'll see a momentary reconnection, then the new interface appears.

> **Tip**: BLE Mesh is the exception — it registers directly with the RNS transport layer at runtime without needing an rnsd restart.

## Next Steps

- [Key Concepts](../introduction/key-concepts) — essential terminology
- [Installing Ratspeak](../getting-started/installing-ratspeak) — get up and running
- [Dashboard Overview](../using-ratspeak/dashboard-overview) — tour the interface
