# REST API Reference

Complete reference for Ratspeak's HTTP API — all endpoints, parameters, and response formats. Both the Python and Rust backends implement the same API.

## Authentication

If `api_token` is configured in `ratspeak.conf`, all `/api/*` endpoints require authentication:

```
Authorization: Bearer your-secret-token-here
```

Alternatively, pass the token as a query parameter: `?token=your-secret-token-here`

Static assets (`/`, `/static/**`) are always accessible without authentication.

## Response Format

All endpoints return JSON. Errors include an `error` field:

```json
{ "error": "Description of what went wrong" }
```

Success responses return the requested data directly. Common HTTP status codes:

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Validation error (bad input) |
| 404 | Resource not found |
| 500 | Internal server error |

---

## Setup & System

### GET /api/setup/status

Check if first-run setup is needed.

**Response:**
```json
{ "needs_setup": true }
```

### POST /api/setup/complete

Complete first-run setup and create initial identity.

**Body:** `{ "display_name": "Alice" }`

**Response:**
```json
{
  "ok": true,
  "identity_hash": "a1b2c3d4...",
  "lxmf_hash": "e5f6g7h8...",
  "display_name": "Alice"
}
```

### POST /api/setup/restart

Restart dashboard after setup.

### GET /api/version

**Response:** `{ "version": "1.0.0", "name": "Ratspeak" }`

### GET /api/startup-progress

**Response:** `{ "stage": "ready" }`

Stages: `"starting"` → `"checking"` → `"rnsd"` → `"lxmf"` → `"ready"`

### POST /api/system/restart

Restart the dashboard and hub node.

### POST /api/system/shutdown

Gracefully shut down the dashboard.

---

## Identity

### GET /api/identity

Get the active identity.

**Response:**
```json
{
  "exists": true,
  "hash": "a1b2c3d4...",
  "lxmf_destination": "e5f6g7h8...",
  "display_name": "Alice",
  "nickname": "alice-main"
}
```

### POST /api/identity/display-name

Update display name and trigger re-announce.

**Body:** `{ "display_name": "Alice B" }`

### POST /api/identity/reset

Reset all identities and restart. Clears all data.

---

## Identity Management (Multi-Identity)

### GET /api/identities

List all identities.

**Response:**
```json
[
  {
    "hash": "a1b2c3d4...",
    "lxmf_hash": "e5f6g7h8...",
    "nickname": "alice-main",
    "display_name": "Alice",
    "is_active": true,
    "created_at": 1709856000.0
  }
]
```

### POST /api/identities/create

Create a new identity.

**Body:** `{ "nickname": "alice-alt" }`

**Response:** `{ "ok": true, "hash": "...", "lxmf_hash": "..." }`

### POST /api/identities/import

Import identity from file upload.

**Body:** Multipart form with `file` field (64-byte binary identity)

### POST /api/identities/import-base64

Import identity from base64 string.

**Body:** `{ "key": "base64-encoded-identity", "nickname": "imported" }`

### GET /api/identities/:hash/export

Download identity as binary file.

### GET /api/identities/:hash/export-base64

Export identity as base64 string.

**Response:** `{ "key": "base64-encoded-identity" }`

### POST /api/identities/:hash/activate

Switch to a different identity. Reinitializes LXMF router.

### PUT /api/identities/:hash

Update identity metadata.

**Body:** `{ "nickname": "new-name", "display_name": "New Name" }`

### DELETE /api/identities/:hash

Delete an identity. Cannot delete the active identity.

---

## Contacts & Conversations

### GET /api/contacts

List all contacts for the active identity.

**Response:**
```json
[
  {
    "hash": "4faf1b2e...",
    "display_name": "Bob",
    "trust": "trusted",
    "last_seen": 1709856000.0
  }
]
```

### GET /api/lxmf/conversations

Get conversation list sorted by recency.

**Response:**
```json
[
  {
    "hash": "4faf1b2e...",
    "display_name": "Bob",
    "unread": 3,
    "timestamp": 1709856000.0,
    "last_message": "Hey, are you on the mesh?"
  }
]
```

### GET /api/conversation/:dest_hash

Get message history with a contact.

**Response:**
```json
[
  {
    "id": "uuid-string",
    "content": "Hello!",
    "timestamp": 1709856000.0,
    "state": "delivered",
    "direction": "outbound",
    "rtt_ms": 450.0,
    "hops": 2,
    "reply_to_id": "",
    "attachment_name": "",
    "game_id": ""
  }
]
```

### GET /api/messages/search?q=:query

Full-text search across all messages (FTS5).

**Parameters:** `q` — search query (minimum 2 characters)

**Response:**
```json
[
  {
    "id": "uuid-string",
    "content": "...matching content...",
    "source": "4faf1b2e...",
    "timestamp": 1709856000.0
  }
]
```

---

## Files

### GET /api/files

List received file attachments.

**Response:**
```json
[
  {
    "stored_name": "abc123_photo.jpg",
    "original_name": "photo.jpg",
    "timestamp": 1709856000.0,
    "message_id": "uuid-string"
  }
]
```

### GET /api/files/:stored_name

Download a received file. Returns binary with appropriate MIME type.

---

## Network & Topology

### GET /api/topology

Get network topology graph data.

**Response:**
```json
{
  "nodes": {
    "node_1": { "type": "hub", "interfaces": [...] }
  },
  "edges": [
    { "source": "node_1", "target": "4faf1b2e...", "type": "tcp" }
  ]
}
```

### GET /api/announces

Get announce history.

**Response:**
```json
[
  {
    "hash": "4faf1b2e...",
    "app_data": "Bob",
    "timestamp": 1709856000.0,
    "hops": 2
  }
]
```

### GET /api/interfaces/throughput

Get interface throughput samples (for sparkline charts).

**Response:**
```json
{
  "LoRa Radio": [1024, 2048, 512, ...],
  "TCP Backbone": [65536, 32768, ...]
}
```

### GET /api/alerts

Get active system alerts.

**Response:** `[{ "message": "Interface down", "type": "warning", "timestamp": 1709856000.0 }]`

### GET /api/connection-history

Get TCP connection history.

**Response:**
```json
[
  {
    "id": 1,
    "host": "hub.example.com",
    "port": 4242,
    "name": "Community Hub",
    "last_used": 1709856000.0
  }
]
```

### DELETE /api/connection-history/:id

Remove a connection history entry.

### POST /api/clear-paths

Clear the RNS path table.

### POST /api/clear-announces

Clear announce history.

---

## Propagation

### GET /api/propagation

Get propagation node status.

**Response:**
```json
{
  "enabled": true,
  "node": "a1b2c3d4...",
  "messages": 42
}
```

---

## Hardware

### GET /api/serial/ports

List available serial ports.

**Response:**
```json
[
  {
    "device": "/dev/ttyUSB0",
    "description": "CP2102N USB to UART",
    "vid": 4292,
    "pid": 60000
  }
]
```

### GET /api/rnode/presets

Get RNode LoRa presets and frequency regions.

**Response:**
```json
{
  "presets": {
    "long_range": { "bandwidth": 125000, "sf": 12, "cr": 8 },
    "balanced": { "bandwidth": 125000, "sf": 9, "cr": 5 },
    "fast": { "bandwidth": 250000, "sf": 7, "cr": 5 }
  },
  "regions": {
    "us_915": { "min": 902000000, "max": 928000000 },
    "eu_868": { "min": 863000000, "max": 870000000 }
  }
}
```

### GET /api/ble/available

Check BLE scanner availability.

### GET /api/ble/scan?timeout=:seconds

Scan for BLE RNode devices.

### GET /api/ble/peer/available

Check BLE Mesh availability.

### GET /api/ble/peer/status

Get BLE Mesh peer status.

---

## Hub Node

### GET /api/hub/interfaces

Get hub's configured interfaces.

**Response:**
```json
{
  "rnode": [...],
  "auto": [...],
  "tcp_client": [...],
  "tcp_server": [...]
}
```

---

## Games & Apps

### GET /api/available-games

List registered RLAP apps.

**Response:**
```json
[
  {
    "app_id": "chess",
    "version": 1,
    "display_name": "Chess",
    "icon": "chess-icon"
  }
]
```

> **Note**: Game actions (challenge, move, resign, etc.) are handled via Socket.IO events, not REST endpoints. See [Socket.IO Events](../developer/socketio-events).

---

## Data Management

### POST /api/clear-messages

Delete all messages for the active identity.

### POST /api/clear-contacts

Delete all contacts for the active identity.

### GET /api/database-stats

Get database statistics.

**Response:** `{ "contacts": 12, "messages": 458, "unread": 3 }`

### GET /api/settings/delete-identity-data

Get the auto-delete setting (whether data is cleared on identity switch).

### POST /api/settings/delete-identity-data

**Body:** `{ "enabled": true }`

---

## What's Next

- [Socket.IO Events](../developer/socketio-events) — real-time event reference
- [Database Schema](../developer/database-schema) — full schema documentation
- [Architecture Overview](../developer/architecture-overview) — system design
