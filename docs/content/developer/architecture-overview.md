# Architecture Overview

A high-level look at how Ratspeak is built — both the Python and Rust implementations, their shared design philosophy, and how the pieces fit together.

## Dual Implementation

Ratspeak has two independent backends that share the same frontend and database schema:

| Component | Ratspeak-py | Ratspeak-rs |
|-----------|-------------|-------------|
| **Language** | Python 3.11+ | Rust (2024 edition) |
| **Web framework** | Flask + Flask-SocketIO | Axum 0.8 + socketioxide |
| **Async model** | Threading (thread pool) | Tokio (async/await) |
| **Database** | SQLite 3 (direct) | SQLite via rusqlite + r2d2 pool |
| **Reticulum** | python-rns library | Pure Rust protocol stack |
| **LXMF** | python-lxmf library | Pure Rust lxmf-core crate |
| **Desktop app** | Browser-only | Tauri 2 (native window) |
| **Binary size** | ~50 MB (with venv) | ~15 MB (single binary) |

Both implementations produce the same REST API, Socket.IO events, and database schema — the frontend doesn't know which backend is running.

## System Architecture

Data flows through the system in layers:

1. **Network interfaces** (TCP, UDP, LoRa/RNode, Serial, BLE, I2P) receive raw packets from the wire
2. **Transport layer** (rns-transport) routes packets based on destination hashes, maintaining path tables and announce history
3. **Link layer** (rns-link) manages encrypted point-to-point channels with forward secrecy via X25519 key exchange
4. **Protocol layer** (rns-protocol) provides reliable delivery, resource transfers, and channel management over Links
5. **LXMF layer** (lxmf-core) adds message semantics, store-and-forward via Propagation Nodes, and delivery receipts
6. **Application layer** (ratspeak-dashboard) serves the web UI via Axum + Socket.IO, backed by SQLite, with static assets embedded via rust-embed

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

### Game Router (LRGP)

Bridges the LRGP protocol to the dashboard. Handles:

- Game challenges, moves, resignations, draw offers
- Session lifecycle (pending, active, completed, expired)
- Pluggable app registration (Tic-Tac-Toe is built-in, more coming)
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
3. If LRGP envelope detected: Game Router processes the game action
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
