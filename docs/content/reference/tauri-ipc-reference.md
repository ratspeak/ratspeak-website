# Tauri IPC Reference

Ratspeak's desktop and mobile app is a Tauri v2 shell. The Rust core exposes a typed command surface that the WebView frontend calls; the core pushes asynchronous updates back as named events. This page documents the shape of that surface for app contributors, alternate frontends, automation, and test harnesses.

For the canonical, version-correct command list, browse the source on GitHub: <https://github.com/ratspeak/Ratspeak>.

## How IPC works in Ratspeak

The Rust core registers just over 120 functions tagged `#[tauri::command]`, grouped into nine domain modules. Each command is async, takes typed arguments, and returns an `AppResult<T>` where `T` is JSON-serializable. The WebView calls them via Tauri's `invoke` bridge.

In the other direction, the core stashes the Tauri `AppHandle` at startup and uses `AppHandle::emit(name, payload)` to broadcast events to every open window. There is no embedded HTTP server, no WebSocket, and no localhost port — all traffic is Tauri's process-internal IPC.

Because everything runs in-process, integrations must either live in the app's WebView or be Rust code calling the core directly. There is no remote IPC surface.

## Calling a command

```js
const { invoke } = window.__TAURI__.core;

try {
  const conversations = await invoke("api_lxmf_conversations");
  console.log(conversations);
} catch (err) {
  // err is { code, message }
  console.error(err.code, err.message);
}
```

For direct command parameters, use the Tauri argument names registered by Rust. Many Ratspeak commands take a single nested `args` struct; those nested fields intentionally mirror the Rust struct and may be snake_case, for example `dest_hash`, `delivery_method`, and `client_msg_id` in `send_lxmf_message`. Treat the source and dashboard callers as canonical when wiring a new integration.

## Listening for events

```js
const { listen } = window.__TAURI__.event;

const unlisten = await listen("lxmf_message", (e) => {
  // e.payload is the event body, shape depends on event name
  appendMessage(e.payload);
});

// later
unlisten();
```

Events fire on a single global channel — every listener for a given name receives every emit. Payloads are JSON objects whose schema is defined by the emitting site in the core.

## Command domains

Commands live under nine domain modules. Counts shift between releases; the current truth is the registered `generate_handler!` list and the command modules in source.

| Domain       | Approx. count | Covers                                                                  |
|--------------|---------------|-------------------------------------------------------------------------|
| `interfaces` | ~30           | AutoInterface, LoRa/RNode, BLE RNode scan, serial discovery, TCP client/server, Backbone client/server, notifications, transport mode, connection history. |
| `system`     | ~18           | Lifecycle, status, restart, app metadata, reset/clear actions.          |
| `network`    | ~20           | Announces, paths, Offline Inbox/propagation nodes, blackholes, hub interfaces, network log state and level. |
| `messaging`  | ~14           | Send, list, mark-read, attachments, conversation CRUD.                  |
| `identity`   | ~12           | Identity create/import/export/activate/switch, hashes, display name.    |
| `ble`        | ~10           | Bluetooth Peer, BLE RNode discovery, pairing prompts, cancellation, disconnects. |
| `contacts`   | ~9            | Address book, trust state, custom names, hash lookup.                   |
| `games`      | ~8            | LRGP game sessions, action submission, session deletion.                |
| `peers`      | ~1            | Live peer roster snapshot (mostly event-driven).                        |

For the full per-command signature and argument schema, inspect the source with `rg -n '#\[tauri::command\]|generate_handler!' crates/ratspeak-tauri/src/commands src-tauri/src/lib.rs` in the [Ratspeak repo](https://github.com/ratspeak/Ratspeak).

## Event vocabulary

Names the core broadcasts; subscribe to whichever your integration cares about.

| Event                  | Payload                                                                  |
|------------------------|--------------------------------------------------------------------------|
| `system_status`        | Coarse lifecycle marker, for example ready, stopping, or stopped.        |
| `lxmf_identity`        | Active identity hash and display name when loaded or switched.           |
| `contacts_update`      | Full contact list snapshot after any contact mutation.                   |
| `conversations_update` | Conversation roster — last message, unread, peer hash.                   |
| `lxmf_message`         | A single inbound or outbound LXMF message in canonical form.             |
| `lxmf_step`            | Per-message send or attachment progress, including validation errors.    |
| `unread_total`         | Aggregate unread count across all conversations.                         |
| `stats_update`         | Transport, link, and traffic counters; see Notes for cadence.            |
| `peers_updated`        | Live peer mesh roster snapshot.                                          |
| `all_game_sessions`    | LRGP session list after any session-state change.                        |
| `node_operation_status`| Interface add/remove/update progress for long-running network operations.|
| `propagation_sync_result` | Propagation-node sync completion or failure.                          |

Other narrower events exist (`identity_reset`, `identity_switched`, `auto_announce_updated`, `propagation_update`, `ble_peer_status_update`, `hub_interfaces_update`, `transport_mode_updated`, etc.). Treat them as live; check the source if you depend on one.

## Error model

Every command returns `AppResult<T>`. Tauri serializes the error variant directly, so on the JS side a rejected `invoke` Promise yields:

```json
{ "code": "not_found", "message": "no contact for hash a1b2c3d4" }
```

Standard codes in use:

- `bad_request` — argument validation failure
- `unauthorized` / `forbidden` — capability gate refused the call
- `not_found` — referenced row, hash, or session does not exist
- `conflict` — state precondition violated (e.g. duplicate identity)
- `service_unavailable` — RNS or transport not ready yet
- `database_unavailable` — SQLite pool exhausted or migration mid-flight
- `lxmf_not_initialized` — LXMF stack not up; retry after `system_status` reports ready
- `internal_error` — unexpected; the message is human-readable, the cause is logged

Treat unknown codes as fatal for that call but not for the session.

## Notes for integrators

**Subscribe, don't poll.** Every domain that matters emits when state changes. Polling commands in a loop wastes IPC bandwidth and races the broadcast.

**Stats are the exception.** The core emits `stats_update` on a 2.5-second cadence. Listen for that event instead of inventing a polling command.

**Wait for readiness.** On cold start, RNS comes up before LXMF. Calls into the messaging or identity domain before LXMF is ready return `lxmf_not_initialized` or `service_unavailable`. Wait for `system_status` to report `ready`, or retry with backoff after setup.

**Identity is implicit.** Commands operate against the currently loaded identity — there is no per-call identity argument. Listen for `identity_switched` to know when that context changes underneath you.

**Attachments.** The app exposes its current message, attachment, efficient-resource, and Offline Inbox/propagation-node transfer limits through `api_lxmf_limits`. Do not hard-code UI limits; they depend on the protocol resource ceiling and, for Offline Inbox delivery, the selected propagation node's advertised transfer limit.

**Threading.** Commands are async on a Tokio runtime; long work does not block the WebView. Events are emitted from whatever task produced them, so handlers must be reentrant.

**Versioning.** The IPC surface is not a stable public API. Pin to a Ratspeak release when shipping integrations and re-verify against [the source](https://github.com/ratspeak/Ratspeak) on upgrade.
