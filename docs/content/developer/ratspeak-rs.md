# Ratspeak-rs Backend

The Rust implementation of Ratspeak — a pure Rust protocol stack with an Axum web server, optional Tauri desktop wrapper, and the same frontend as Ratspeak-py.

## Technology Stack

| Component | Crate | Purpose |
|-----------|-------|---------|
| Async runtime | tokio 1 | Work-stealing async executor |
| Web framework | axum 0.8 | HTTP routing and middleware |
| WebSocket | socketioxide 0.15 | Socket.IO server |
| Database | rusqlite 0.32 (bundled) | SQLite with r2d2 connection pool |
| Cryptography | x25519-dalek, ed25519-dalek, aes, hkdf | Protocol-level encryption |
| Serialization | serde, rmp-serde | JSON and MessagePack |
| CLI | clap 4 | Command-line argument parsing |
| Logging | tracing | Structured async logging |
| Static assets | rust-embed 8 | Compile frontend into binary |
| Desktop app | Tauri 2 | Optional native window wrapper |

## Workspace Structure

The project is organized as a Cargo workspace with 14 crates in three layers:

### Protocol Layer (Core)

| Crate | Purpose |
|-------|---------|
| **rns-crypto** | X25519 key exchange, Ed25519 signatures, AES-256-CBC, HKDF, HMAC, SHA-256 |
| **rns-wire** | Packet headers, encoding/decoding, hash computation |
| **rns-identity** | Identity keypairs, destinations, announce validation, ratchet key rings |

### Network Layer

| Crate | Purpose |
|-------|---------|
| **rns-transport** | Transport actor, path/link/announce tables, rate limiting, persistence |
| **rns-link** | Encrypted channel establishment, handshake, keepalive |
| **rns-protocol** | Channels (reliable sequenced) and Resources (large file transfer), BZIP2 compression |
| **rns-interface** | Interface trait + implementations: TCP, UDP, Serial, KISS, RNode, Local, Auto, HDLC |
| **rns-runtime** | Reticulum singleton, config parsing, interface factory, RPC server |
| **rns-tools** | CLI binaries: rnsd, rnstatus, rnpath, rnid |

### Application Layer

| Crate | Purpose |
|-------|---------|
| **lxmf-core** | LXMF message format, routing, propagation, signing, sync |
| **lxmf-tools** | LXMF daemon (lxmd) |
| **lrgp** | Multiplayer games over LXMF (MessagePack serialization) |
| **ratspeak-dashboard** | Axum web server, Socket.IO, SQLite, LXMF/RNS integration |
| **raticulum-tests** | Integration test suites (run `cargo test --workspace` for current count) |

## Dashboard Crate

The `ratspeak-dashboard` crate is the web application:

```
crates/ratspeak-dashboard/src/
├── main.rs         # Binary entry point
├── lib.rs          # Server init, Axum setup, background tasks
├── config.rs       # Env var config (port, host, RNS config dir)
├── routes.rs       # REST API endpoints
├── socketio.rs     # Socket.IO event handlers
├── db.rs           # SQLite schema, migrations, queries
├── lxmf.rs         # LXMF manager (identity, messaging, contacts)
├── rns.rs          # RNS runtime integration
├── state.rs        # Shared AppState (db pool, managers)
├── embedded.rs     # Static asset serving (rust-embed)
└── nodes.rs        # Hub topology from config
```

### Startup Flow

1. Parse environment config (`RATSPEAK_SERVER_PORT`, `RATSPEAK_RNS_CONFIG_DIR`)
2. Initialize SQLite with schema migrations (same schema v12 as Python)
3. Create shared `AppState` (database pool, LXMF manager, RNS manager)
4. Set up Socket.IO with event handlers
5. Build Axum router (API routes + static asset serving)
6. Bind TCP listener and spawn server
7. Background initialization: LXMF identity → RNS runtime → ticker loops

**Initialization stages:** `"checking"` → `"lxmf"` → `"rns"` → `"ready"`

### Background Tasks

| Task | Interval | Purpose |
|------|----------|---------|
| LXMF router tick | 500ms | Process outbound message queue |
| Announce trigger | 300s (after 3s delay) | Broadcast LXMF announce |
| Stats polling | 1.5s | Query transport actor for interface stats, paths, announces |
| Inbound handler | Event-driven | Process received LXMF messages |

### Async Architecture

Unlike Python's threading model, Ratspeak-rs uses Tokio's async runtime:

- **No blocking threads** — all I/O is async (network, database via spawn_blocking)
- **Transport actor** — dedicated async task with message-passing (channels, not locks)
- **Connection pool** — r2d2 manages up to 8 concurrent SQLite connections
- **Socket.IO broadcasts** — atomic push to all connected browsers

## Key Differences from Python

### Protocol Stack

Ratspeak-rs implements the entire Reticulum and LXMF protocol in pure Rust rather than calling into Python libraries. This means:

- **Single binary** — no Python runtime, no pip, no virtual environments
- **Faster packet processing** — native code for all cryptographic operations
- **Memory safety** — Rust's ownership system prevents data races
- **Zeroize support** — Private keys securely wiped from memory when dropped

### Interface Implementation

All network interfaces are implemented as async Rust code:

```
rns-interface/src/
├── lib.rs        # Module root and re-exports
├── traits.rs     # Interface trait definition
├── tcp.rs        # TCP Client + Server
├── udp.rs        # UDP Broadcast
├── serial.rs     # Serial port (feature-gated)
├── kiss.rs       # KISS framing
├── kiss_iface.rs # KISS interface
├── rnode.rs      # RNode LoRa
├── local.rs      # Local IPC
├── auto.rs       # Auto-discovery
└── hdlc.rs       # HDLC framing
```

Feature flag `serial` (enabled by default) controls serial/KISS/RNode inclusion.

### What's Not Yet Implemented

| Feature | Status |
|---------|--------|
| Propagation node support | Partial (hooks ready) |
| BLE interface | Stubs only (needs btleplug) |
| PyInstaller bundling | N/A (single binary) |

## Building & Running

### Build

```bash
cd rustrat

# Build all crates
cargo build --release

# Run tests (over 600 unit + integration tests)
cargo test --workspace

# Build specific crate
cargo build -p ratspeak-dashboard --release
```

### Output Binaries

```
target/release/
├── rnsd        # Reticulum daemon
├── rnstatus    # Network status tool
├── rnpath      # Path lookup utility
├── rnid        # Identity management tool
└── lxmd        # LXMF daemon
```

### Run

**Option 1: RNS daemon + dashboard**
```bash
./target/release/rnsd -c ./nodes/node_1 -vv &
cargo run -p ratspeak-dashboard --release
# Dashboard at http://localhost:5050
```

**Option 2: Tauri desktop app**
```bash
cargo tauri dev
# Or run the built binary:
./src-tauri/target/release/ratspeak
```

**Option 3: Start script**
```bash
./start.sh
# Tries Tauri first, falls back to cargo
```

### Configuration

Environment variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `RATSPEAK_SERVER_PORT` | 5050 | Dashboard HTTP port |
| `RATSPEAK_SERVER_HOST` | 127.0.0.1 | Bind address |
| `RATSPEAK_SERVER_API_TOKEN` | (none) | Bearer token for API auth |
| `RATSPEAK_RNS_CONFIG_DIR` | `~/reticulum` | RNS config directory |

### Data Directories

```
~/.ratspeak/
├── ratspeak.db          # SQLite database (same schema as Python)
├── identities/          # Per-identity keypairs and LXMF state
└── files/               # Received file attachments
```

## What's Next

- [Frontend Architecture](../developer/frontend) — shared browser-side code
- [REST API Reference](../developer/rest-api) — complete endpoint documentation
- [Building & Contributing](../developer/building-contributing) — development workflow
