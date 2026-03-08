# Socket.IO Events

Complete reference for Ratspeak's real-time Socket.IO events — both client-emitted (browser → server) and server-emitted (server → browser).

## Connection

### connect (client → server)

Establishes the WebSocket connection. If API token is configured, the token must be included in the auth handshake.

**On successful connect, server emits:**
- `stats_update` — Current network state
- `event_log` — Recent event history
- `lxmf_identity` — Active identity info
- `contacts_update` — Full contact list
- `unread_total` — Unread message count
- `topology_updated` — Network topology
- `propagation_update` — Propagation node status
- `hub_interfaces_update` — Configured interfaces
- `alert` (×N) — Any active alerts
- `agent_discovered` (×N) — Known agents

---

## Messaging

### send_lxmf_message (client → server)

Send a direct LXMF message.

**Payload:**
```json
{
  "dest_hash": "4faf1b2e0a077e6a...",
  "content": "Hello from the mesh!",
  "title": "",
  "client_msg_id": "local-uuid"
}
```

**Validation:** Hex destination hash (16-64 chars), content max 4 KB.

**Server emits:** `lxmf_step` with delivery progress:
```json
{ "step": "sent", "message": "Message queued for delivery" }
{ "step": "delivered", "message": "Delivery confirmed", "rtt_ms": 450 }
{ "step": "failed", "message": "Delivery timed out" }
```

### send_lxmf_reply (client → server)

Send a message with reply-to reference.

**Payload:**
```json
{
  "dest_hash": "4faf1b2e...",
  "content": "I agree!",
  "reply_to_id": "original-msg-uuid",
  "reply_to_preview": "Should we try LoRa?",
  "reply_to_sender": "a1b2c3d4...",
  "client_msg_id": "local-uuid"
}
```

### send_lxmf_propagated (client → server)

Send a message via propagation node (store-and-forward).

**Payload:** Same as `send_lxmf_message`.

### send_lxmf_with_attachment (client → server)

Send a message with file or image attachment.

**Payload:**
```json
{
  "dest_hash": "4faf1b2e...",
  "content": "Check this out",
  "title": "",
  "file_data": "base64-encoded-file",
  "file_name": "document.pdf",
  "image_data": "base64-encoded-image",
  "image_mime": "image/jpeg",
  "client_msg_id": "local-uuid"
}
```

**Validation:** File/image max 500 KB (base64 max 700 KB).

### send_reaction (client → server)

React to a message with an emoji.

**Payload:**
```json
{
  "dest_hash": "4faf1b2e...",
  "message_id": "msg-uuid",
  "emoji": "thumbs-up",
  "action": "add"
}
```

`action` is `"add"` or `"remove"`.

### new_message (server → client)

Broadcast when a new message is received.

**Payload:** Full message object with `id`, `content`, `source`, `destination`, `timestamp`, `state`, `direction`, `hops`, `rtt_ms`, `attachment_name`, `reply_to_id`, `game_id`.

---

## Contacts & Conversations

### add_contact (client → server)

**Payload:** `{ "hash": "4faf1b2e...", "display_name": "Bob" }`

**Server emits:** `contacts_update` (broadcast to all clients), `contact_added`

### remove_contact (client → server)

**Payload:** `{ "hash": "4faf1b2e..." }`

**Server emits:** `contacts_update` (broadcast)

### get_conversation (client → server)

**Payload:** `{ "hash": "4faf1b2e..." }`

**Server emits:** `conversation_update` (full message list), `unread_total` (updated count)

### mark_read (client → server)

**Payload:** `{ "hash": "4faf1b2e..." }`

**Server emits:** `unread_total`

### hide_conversation (client → server)

**Payload:** `{ "hash": "4faf1b2e..." }`

**Server emits:** `conversation_hidden`

### delete_conversation (client → server)

**Payload:** `{ "hash": "4faf1b2e..." }`

**Server emits:** `conversation_deleted`

### contacts_update (server → client)

Broadcast when contact list changes. Contains full contact array.

### unread_total (server → client)

**Payload:** `{ "total": 5 }`

---

## Games & Interactive Apps (RLAP)

### send_game_action (client → server)

Send a game/app action via RLAP protocol.

**Payload:**
```json
{
  "dest_hash": "4faf1b2e...",
  "game_id": "session-uuid",
  "game": "chess",
  "action": "move",
  "move": "e2e4",
  "index": 5
}
```

**Supported actions:** `"challenge"`, `"accept"`, `"decline"`, `"move"`, `"resign"`, `"draw_offer"`, `"draw_accept"`, `"draw_decline"`

**Returns:** `{ "error": "message" }` on failure, or result dict on success.

### get_active_games (client → server)

Get game sessions with a specific contact.

**Payload:** `{ "hash": "4faf1b2e..." }`

**Server emits:** `active_games` with session list.

### get_all_game_sessions (client → server)

Get all game sessions across all contacts.

**Server emits:** `all_game_sessions`

### mark_game_read (client → server)

Clear unread flag on a game session.

**Payload:** `{ "session_id": "session-uuid" }`

### get_game_session_detail (client → server)

Get session with full action history.

**Payload:** `{ "session_id": "session-uuid" }`

**Server emits:** `game_session_detail` with session + actions array.

### get_available_games (client → server)

List registered RLAP apps.

**Server emits:** `available_games` with app list.

### game_update (server → client)

Broadcast when a game state changes (new challenge, move received, game ended).

**Payload:** Full game session object with `game_id`, `game`, `contact_hash`, `status`, `state`, `turn`, `winner`, `move_count`.

---

## Propagation

### set_propagation_node (client → server)

**Payload:** `{ "hash": "a1b2c3d4..." }` (empty string to clear)

### enable_propagation (client → server)

**Payload:** `{ "enabled": true }`

### sync_propagation (client → server)

Trigger sync with propagation node.

**Server emits:** `propagation_sync_result`

### get_propagation_status (client → server)

**Server emits:** `propagation_update`

---

## Network & Paths

### trigger_announce (client → server)

Force an LXMF announce broadcast.

**Server emits:** `announce_triggered`

### request_path (client → server)

Request path to a specific destination.

**Payload:** `{ "hash": "4faf1b2e..." }`

**Server emits:** `path_requested`

### request_all_paths (client → server)

Request paths to all known contacts.

**Server emits:** `all_paths_requested`

### check_contact_status (client → server)

Check reachability of all contacts.

**Server emits:** `contact_identity_status` with per-contact availability.

---

## Network Status (server → client)

### stats_update

Periodic network status push (every 1.5 seconds).

**Payload:** Contains interface stats, path table entries, throughput samples, agent status, contact reachability information.

### topology_updated

Network topology change detected.

**Payload:** Full topology graph (`nodes` + `edges`).

### alert

System alert raised.

**Payload:** `{ "message": "Interface LoRa down", "type": "warning" }`

### event

Activity log entry.

**Payload:** `{ "message": "Message delivered to Bob", "category": "message", "timestamp": 1709856000.0 }`

---

## Identity

### switch_identity (client → server)

Hot-swap to a different identity.

**Payload:** `{ "hash": "a1b2c3d4..." }`

On failure, server emits `identity_error`.

### lxmf_identity (server → client)

Active identity information.

**Payload:** `{ "hash": "a1b2c3d4...", "lxmf_destination": "e5f6g7h8...", "display_name": "Alice" }`

---

## Alerts

### dismiss_alert (client → server)

**Payload:** `{ "index": 0 }`

Removes alert by index from the active alerts stack.

---

## Hub Node Management

### node_add_rnode (client → server)

Add an RNode LoRa interface to the hub.

### node_add_auto (client → server)

Add an AutoInterface (LAN/WiFi discovery).

### node_add_tcp_client (client → server)

Add a TCP client connection.

### node_add_tcp_server (client → server)

Add a TCP server listener.

### node_remove_interface (client → server)

Remove an interface from the hub.

### node_restart (client → server)

Restart the hub node.

### node_stop (client → server)

Stop the hub node.

### hub_interfaces_update (server → client)

Hub interface configuration changed.

### node_operation_status (server → client)

Progress update for hub operations (adding/removing interfaces).

**Payload:** `{ "operation": "add_rnode", "status": "success", "message": "RNode added" }`

---

## What's Next

- [REST API Reference](../developer/rest-api) — HTTP endpoint reference
- [RLAP Protocol & Building Apps](../developer/rlap-protocol) — game/app protocol details
- [Architecture Overview](../developer/architecture-overview) — system design
