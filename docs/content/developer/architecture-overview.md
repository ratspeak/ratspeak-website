# Architecture Overview

A high-level look at how Ratspeak is built — both the Python and Rust implementations, their shared design philosophy, and how the pieces fit together.

## Dual Implementation

Ratspeak has two independent backends that share the same frontend and database schema:

| Component | Ratspeak-py | Ratspeak-rs |
|-----------|-------------|-------------|
| **Language** | Python 3.11+ | Rust (2021 edition) |
| **Web framework** | Flask + Flask-SocketIO | Axum 0.8 + socketioxide |
| **Async model** | Threading (thread pool) | Tokio (async/await) |
| **Database** | SQLite 3 (direct) | SQLite via rusqlite + r2d2 pool |
| **Reticulum** | python-rns library | Pure Rust protocol stack |
| **LXMF** | python-lxmf library | Pure Rust lxmf-core crate |
| **Desktop app** | Browser-only | Tauri 2 (native window) |
| **Binary size** | ~50 MB (with venv) | ~15 MB (single binary) |

Both implementations produce the same REST API, Socket.IO events, and database schema — the frontend doesn't know which backend is running.

## System Architecture

<div class="docs-diagram">
<svg viewBox="0 0 700 400" xmlns="http://www.w3.org/2000/svg" fill="none">
  <!-- Browser -->
  <rect x="220" y="10" width="260" height="60" rx="10" stroke="#38BDF8" stroke-width="1.5" fill="rgba(56,189,248,0.05)"/>
  <text x="350" y="35" text-anchor="middle" fill="#38BDF8" font-family="Outfit" font-size="13" font-weight="600">Browser / Tauri Window</text>
  <text x="350" y="52" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">HTML + Vanilla JS + Socket.IO + D3.js</text>

  <!-- REST + Socket.IO arrows -->
  <line x1="310" y1="70" x2="310" y2="110" stroke="#F59E0B" stroke-width="1.5"/>
  <text x="295" y="95" text-anchor="end" fill="#F59E0B" font-family="JetBrains Mono" font-size="8">REST</text>
  <line x1="390" y1="70" x2="390" y2="110" stroke="#C084FC" stroke-width="1.5"/>
  <text x="405" y="95" text-anchor="start" fill="#C084FC" font-family="JetBrains Mono" font-size="8">Socket.IO</text>

  <!-- Web Server -->
  <rect x="200" y="110" width="300" height="50" rx="10" stroke="#00D4AA" stroke-width="2" fill="rgba(0,212,170,0.08)"/>
  <text x="350" y="135" text-anchor="middle" fill="#00D4AA" font-family="JetBrains Mono" font-size="12" font-weight="600">Web Server (Flask / Axum)</text>
  <text x="350" y="150" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Routes + Socket.IO handlers + Auth</text>

  <!-- Three columns below -->
  <!-- LXMF Manager -->
  <rect x="30" y="200" width="180" height="70" rx="8" stroke="#C084FC" stroke-width="1.5" fill="rgba(192,132,252,0.05)"/>
  <text x="120" y="225" text-anchor="middle" fill="#C084FC" font-family="JetBrains Mono" font-size="11" font-weight="600">LXMF Manager</text>
  <text x="120" y="242" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Messages, contacts,</text>
  <text x="120" y="255" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">propagation, reactions</text>

  <!-- App Router -->
  <rect x="260" y="200" width="180" height="70" rx="8" stroke="#F59E0B" stroke-width="1.5" fill="rgba(245,158,11,0.05)"/>
  <text x="350" y="225" text-anchor="middle" fill="#F59E0B" font-family="JetBrains Mono" font-size="11" font-weight="600">App Router (RLAP)</text>
  <text x="350" y="242" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Games, interactive apps,</text>
  <text x="350" y="255" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">session management</text>

  <!-- RNS Manager -->
  <rect x="490" y="200" width="180" height="70" rx="8" stroke="#38BDF8" stroke-width="1.5" fill="rgba(56,189,248,0.05)"/>
  <text x="580" y="225" text-anchor="middle" fill="#38BDF8" font-family="JetBrains Mono" font-size="11" font-weight="600">RNS Manager</text>
  <text x="580" y="242" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Interfaces, announces,</text>
  <text x="580" y="255" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">topology, stats polling</text>

  <!-- Connections from web server to managers -->
  <line x1="280" y1="160" x2="120" y2="200" stroke="#7e8fa2" stroke-width="1" stroke-dasharray="4 2"/>
  <line x1="350" y1="160" x2="350" y2="200" stroke="#7e8fa2" stroke-width="1" stroke-dasharray="4 2"/>
  <line x1="420" y1="160" x2="580" y2="200" stroke="#7e8fa2" stroke-width="1" stroke-dasharray="4 2"/>

  <!-- Database -->
  <rect x="140" y="310" width="160" height="50" rx="8" stroke="#00D4AA" stroke-width="1.5" fill="rgba(0,212,170,0.05)"/>
  <text x="220" y="335" text-anchor="middle" fill="#00D4AA" font-family="JetBrains Mono" font-size="11" font-weight="600">SQLite (WAL)</text>
  <text x="220" y="350" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Schema v12 + FTS5</text>

  <!-- Reticulum -->
  <rect x="400" y="310" width="200" height="50" rx="8" stroke="#FF6B6B" stroke-width="1.5" fill="rgba(255,107,107,0.05)"/>
  <text x="500" y="335" text-anchor="middle" fill="#FF6B6B" font-family="JetBrains Mono" font-size="11" font-weight="600">Reticulum Network</text>
  <text x="500" y="350" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">LoRa, TCP, UDP, BLE, Serial</text>

  <!-- Connections to bottom layer -->
  <line x1="120" y1="270" x2="200" y2="310" stroke="#7e8fa2" stroke-width="1" stroke-dasharray="4 2"/>
  <line x1="350" y1="270" x2="240" y2="310" stroke="#7e8fa2" stroke-width="1" stroke-dasharray="4 2"/>
  <line x1="580" y1="270" x2="500" y2="310" stroke="#7e8fa2" stroke-width="1" stroke-dasharray="4 2"/>
  <line x1="120" y1="270" x2="450" y2="310" stroke="#7e8fa2" stroke-width="1" stroke-dasharray="4 2"/>
</svg>
<figcaption>Ratspeak architecture — browser connects via REST and Socket.IO to a web server backed by three core managers</figcaption>
</div>

## Core Components

### Web Server Layer

Handles HTTP requests and WebSocket connections. Provides:

- **40+ REST API endpoints** for CRUD operations (contacts, messages, identities, settings)
- **30+ Socket.IO events** for real-time updates (message delivery, game moves, topology changes)
- **Bearer token authentication** (optional, configured in `ratspeak.conf`)
- **Security headers** (CSP, X-Frame-Options, CORS)

### LXMF Manager

The messaging engine. Responsibilities:

- Initialize and manage the LXMF router
- Send/receive encrypted messages (direct, propagated, with attachments)
- Manage contacts (add, remove, trust levels)
- Handle emoji reactions and reply threading
- Multi-identity support with hot-swapping
- Background announce loop (every 120 seconds)
- Message delivery timeout tracking (every 5 seconds)

### App Router (RLAP)

Bridges the RLAP protocol to the dashboard. Handles:

- Game challenges, moves, resignations, draw offers
- Session lifecycle (pending, active, completed, expired)
- Pluggable app registration (chess is built-in, more coming)
- Bi-directional conversion between Socket.IO events and LXMF messages

### RNS Manager

Network layer integration. Provides:

- Reticulum instance initialization
- Interface stats polling (every 1.5 seconds)
- Announce history tracking
- Path table management
- Topology graph construction
- Alert system for network events

### Database

SQLite with WAL (Write-Ahead Logging) mode for concurrent access:

- **Schema version 12** with automatic migrations
- **11 tables**: identities, contacts, messages, reactions, games, app_sessions, app_actions, hidden_conversations, settings, connection_history, schema_version
- **FTS5 full-text search** on messages (with auto-sync triggers)
- All content scoped by `identity_id` for multi-identity isolation

## Data Flow

### Sending a Message

1. User types message in browser, hits Enter
2. Browser emits `send_lxmf_message` Socket.IO event
3. Web server validates input (hex hash, content length)
4. LXMF Manager encrypts and queues the message
5. RNS routes the packet through the mesh network
6. Browser receives `lxmf_step` events tracking delivery status
7. Database records the message with state transitions

### Receiving a Message

1. LXMF router receives encrypted packet from RNS
2. LXMF Manager decrypts and parses the message
3. If RLAP envelope detected: App Router processes the game/app action
4. Message saved to database with identity scoping
5. Socket.IO broadcasts `new_message` to all connected browsers
6. Unread count updated and emitted

## Thread Model

### Python (Ratspeak-py)

- **Main thread**: Flask development server
- **Socket.IO thread pool**: One thread per event handler
- **Background threads**: Announce loop, timeout monitor, RNS polling, status summary
- **Thread safety**: Locks on contacts, conversations, message timers, announce history

### Rust (Ratspeak-rs)

- **Tokio runtime**: Work-stealing async executor
- **Transport actor**: Dedicated task for packet routing
- **Background tasks**: LXMF tick (500ms), announce trigger (300s), stats polling (1.5s)
- **No global locks**: RwLock for optional managers, channels for message passing

## Configuration

Both implementations read from:

- **`ratspeak.conf`** — Dashboard settings (port, host, API token, polling intervals)
- **Environment variables** — Override any config value (e.g., `RATSPEAK_SERVER_PORT=8080`)
- **RNS config** — Reticulum interface configuration (separate file in `~/.reticulum/config`)

## Directory Structure

```
~/.ratspeak/
├── ratspeak.db          # SQLite database
├── .secret_key          # Flask session secret
├── identities/          # Per-identity subdirectories
│   ├── <hash_a>/        #   Identity keypair + LXMF state
│   └── <hash_b>/
└── files/               # Received file attachments
```

## What's Next

- [Ratspeak-py Backend](../developer/ratspeak-py) — Python implementation details
- [Ratspeak-rs Backend](../developer/ratspeak-rs) — Rust implementation details
- [Frontend Architecture](../developer/frontend) — browser-side code organization
