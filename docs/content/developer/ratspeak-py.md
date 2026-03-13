# Ratspeak-py Backend

The Python implementation of Ratspeak — built on Flask, Flask-SocketIO, and the python-rns/python-lxmf libraries.

## Technology Stack

| Component | Library | Version |
|-----------|---------|---------|
| Web framework | Flask | Latest |
| WebSocket | Flask-SocketIO | Latest |
| Mesh networking | RNS | >= 0.9.1 |
| Messaging | LXMF | >= 0.5.5 |
| Database | SQLite 3 | Built-in |
| Serial ports | pyserial | >= 3.5 |
| BLE scanning | bleak | Latest |
| Cryptography | cryptography | >= 3.4.7 |
| App protocol | lrgp | Local package |

## Module Map

```
dashboard/
├── app.py                  # Main entry — Flask routes, Socket.IO handlers
├── database.py             # SQLite schema, migrations, CRUD
├── lxmf_manager.py         # LXMF router, messaging, contacts
├── app_router.py           # LRGP bridge (multiplayer games)
├── rns_manager.py          # RNS init, announce handling, stats polling
├── node_manager.py         # Hub node config, process lifecycle
├── identity_manager.py     # Multi-identity create/import/export/switch
├── agent_manager.py        # Agent registry, hub interface handlers
├── interface_manager.py    # RNode presets, frequency regions, validation
├── ble_peer_interface.py   # BLE Mesh peer-to-peer interface
├── node_agent.py           # Node subprocess launcher
├── config.py               # Config loader (ENV + ratspeak.conf)
├── events.py               # Thread-safe event logging
├── utils.py                # Serialization helpers
├── ratspeak.conf           # Config file template
├── static/                 # Frontend assets
└── templates/              # HTML templates
```

## Key Modules

### app.py (~6500 lines)

The main entry point. Contains all Flask routes and Socket.IO event handlers in a single file.

**Responsibilities:**
- Flask app initialization and configuration
- All REST API endpoint definitions (`@app.route`)
- All Socket.IO event handlers (`@socketio.on`)
- Startup orchestration (hub node, RNS, LXMF)
- Security headers and API token authentication
- Background thread management

**Startup sequence:**
1. Load config from `ratspeak.conf` and environment
2. Initialize database (schema migrations)
3. Start hub node (rnsd + node_agent)
4. Initialize RNS (Reticulum instance)
5. Initialize LXMF (router, identity, destinations)
6. Register Socket.IO handlers
7. Start background polling threads
8. Serve on configured host:port

### database.py (~1300 lines)

SQLite persistence layer with schema versioning.

**Schema version 12** with incremental migrations. Key design decisions:
- **Identity scoping**: All content tables include `identity_id` column for multi-identity isolation
- **WAL mode**: `PRAGMA journal_mode=WAL` for concurrent reads
- **FTS5**: Full-text search on messages via virtual table with auto-sync triggers
- **Thread-local connections**: Each thread gets its own SQLite connection via `threading.local()`

### lxmf_manager.py (~2100 lines)

The messaging engine — the largest and most complex module.

**Key data structures:**
- `contacts` — In-memory dict `{dest_hex: {display_name, identity_pubkey, last_seen, trust}}`
- `conversations` — In-memory dict `{dest_hex: [{id, content, timestamp, state, ...}]}`
- `_message_timers` — Dict `{msg_id: threading.Event}` for cancellable delivery timeouts

**Background threads:**
- `_announce_loop()` — Broadcasts LXMF announce every 120 seconds
- `_timeout_monitor_loop()` — Checks delivery timeouts every 5 seconds, expires stale app sessions

**Identity hot-swap:**
When switching identities, `init_lxmf_for_identity()` tears down the current LXMF router, loads the new identity's keypair, creates a new destination, and reinitializes. All in-memory caches are flushed and reloaded from the database.

### app_router.py (~350 lines)

Bridges the LRGP library to Ratspeak's infrastructure (SQLite + Socket.IO + LXMF).

**Flow for outgoing game action:**
1. Socket.IO handler calls `handle_outgoing_action()`
2. Loads existing session from database into app memory
3. LRGP library builds the envelope (msgpack-serialized)
4. Packs into LXMF custom fields (`0xFB` and `0xFD`)
5. Sends via LXMF with appropriate delivery method
6. Persists updated session and emits Socket.IO events

### rns_manager.py (~1000 lines)

Network layer integration with polling-based stats collection.

**Background threads:**
- `poll_rns_stats()` — Every 1.5 seconds, queries RNS for interface stats, path table, throughput
- `status_summary_emitter()` — Every 300 seconds, emits consolidated status to all connected browsers

**Data tracked:**
- `announce_history` — Recent announces (newest first)
- `interface_throughput` — Last 60 samples per interface (rolling window for sparklines)
- `active_alerts` — Network event alerts with type and severity

### node_manager.py (~800 lines)

Manages hub node configuration and process lifecycle.

**Two key classes:**
- `NodeConfigManager` — Reads/writes RNS config files, manages interface blocks (add/remove RNode, TCP, Auto interfaces)
- `ProcessManager` — Starts/stops rnsd and node agent subprocesses, handles restart signals

### identity_manager.py (~350 lines)

Multi-identity orchestration. Creates, imports, exports, and switches between identities.

**Identity lifecycle:**
1. `create_identity()` — Generates new RNS identity (Ed25519 + X25519 keypair), saves to disk and database
2. `import_identity()` — Imports 64-byte identity file or base64 string
3. `switch_identity()` — Hot-swaps active identity (reinitializes LXMF router)
4. `export_identity()` — Exports identity as binary file or base64
5. `remove_identity()` — Deletes identity file and database row

## Threading Model

```
Main Thread (Flask)
├── Socket.IO Thread Pool (one thread per event)
├── Announce Loop Thread (120s interval)
├── Timeout Monitor Thread (5s interval)
├── RNS Polling Thread (1.5s interval)
└── Status Summary Thread (300s interval)
```

**Thread safety** is managed through explicit locks:

| Lock | Protects |
|------|----------|
| `contacts_lock` | Contacts dictionary |
| `conversations_lock` | Conversations dictionary |
| `_message_timers_lock` | Message timer dictionary |
| `announce_history_lock` | Announce history list |
| `interface_throughput_lock` | Throughput samples |
| `_identity_switch_lock` | Identity switching (RLock) |
| `event_log_lock` | Event log deque |

## Configuration

### ratspeak.conf

```ini
[server]
port = 5050
host = 127.0.0.1
# api_token = your-secret-token-here

[nodes]
directory = nodes
hub_node = node_1

[dashboard]
poll_interval = 1.5
max_log_entries = 200
status_summary_interval = 300
max_nodes = 99
path_age_reachable = 1800
path_age_stale = 3600
```

### Environment Variable Overrides

Any config value can be overridden with `RATSPEAK_SECTION_KEY`:

```bash
export RATSPEAK_SERVER_PORT=8080
export RATSPEAK_SERVER_API_TOKEN=secret-key-here
export RATSPEAK_DASHBOARD_POLL_INTERVAL=3.0
```

## Security

- **API authentication**: Bearer token checked on all `/api/*` endpoints and Socket.IO connect
- **Input validation**: Hex hashes validated by regex, display names sanitized (max 500 chars), interface names checked for injection
- **Security headers**: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- **Identity files**: Stored with `chmod 0o600` (owner-readable only)
- **Clone detection**: Machine fingerprint (hostname + MAC + CPU) detects identity file copying

## Installation & Development

```bash
# Clone and setup
git clone https://github.com/ratspeak/ratspeak.git
cd ratspeak
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Run
./start.sh
# Opens at http://localhost:5050
```

**Startup stages** (tracked by `/api/startup-progress`):
1. `"starting"` — Initial
2. `"checking"` — Checking existing processes
3. `"rnsd"` — Starting RNS daemon
4. `"lxmf"` — Initializing LXMF
5. `"ready"` — Dashboard ready

**Clean restart**: Exit code 42 triggers `start.sh` to relaunch automatically.

## What's Next

- [Ratspeak-rs Backend](../developer/ratspeak-rs) — the Rust implementation
- [REST API Reference](../developer/rest-api) — complete endpoint documentation
- [Socket.IO Events](../developer/socketio-events) — real-time event reference
- [Database Schema](../developer/database-schema) — full schema documentation
