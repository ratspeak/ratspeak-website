# Tauri IPC Reference

Ratspeak's desktop and mobile app is a Tauri v2 shell. The Rust core exposes a typed command surface that the WebView frontend calls; the core pushes asynchronous updates back as named events. This page documents the shape of that surface so you can build tools, alternate frontends, automation, or test harnesses against it.

For the canonical, version-correct command list, browse the source on GitHub: <https://github.com/ratspeak/Ratspeak>.

## How IPC works in Ratspeak

The Rust core registers about 116 functions tagged `#[tauri::command]`, grouped into nine domain modules. Each command is async, takes typed arguments, and returns `Result<Value, AppError>`. The WebView calls them via Tauri's `invoke` bridge.

In the other direction, the core stashes the Tauri `AppHandle` at startup and uses `AppHandle::emit(name, payload)` to broadcast events to every open window. There is no embedded HTTP server, no WebSocket, and no localhost port — all traffic is Tauri's process-internal IPC.

Because everything runs in-process, integrations must either embed in the app's WebView (custom HTML/JS loaded by Tauri) or be a sibling Rust crate calling the core directly. There is no remote IPC surface.

## Calling a command

```js
const { invoke } = window.__TAURI__.core;

try {
  const conversations = await invoke("list_conversations", { limit: 50 });
  console.log(conversations);
} catch (err) {
  // err is { code, message }
  console.error(err.code, err.message);
}
```

Argument names use camelCase on the JS side and are mapped to the Rust parameter names by Tauri. Returned `Value` is plain JSON — `serde_json::Value` on the Rust side, deserialized by Tauri.

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

Commands live under nine domain modules. Counts shift between releases; the current truth is the source on GitHub.

| Domain       | Approx. count | Covers                                                                  |
|--------------|---------------|-------------------------------------------------------------------------|
| `interfaces` | ~25           | Add/remove/list TCP, UDP, Serial, KISS, RNode, AX.25, I2P, Pipe, Auto.  |
| `system`     | ~18           | Lifecycle, status, restart, log level, transport mode, app metadata.    |
| `network`    | ~18           | Announces, paths, link probes, propagation nodes, blackhole, hubs.      |
| `messaging`  | ~14           | Send, list, mark-read, attachments, conversation CRUD.                  |
| `identity`   | ~12           | Identity load/reset/switch, hashes, display name, ratchet keys.         |
| `ble`        | ~10           | BLE peer mesh and BLE RNode discovery, pairing, link diagnostics.       |
| `contacts`   | ~9            | Address book, trust state, custom names, hash lookup.                   |
| `games`      | ~8            | LRGP game sessions, action submission, session deletion.                |
| `peers`      | ~1            | Live peer roster snapshot (mostly event-driven).                        |

For the full per-command signature and argument schema, grep the source: `grep -rn '#\[tauri::command\]' crates/ratspeak-dashboard/src/commands/` in the [Ratspeak repo](https://github.com/ratspeak/Ratspeak).

## Event vocabulary

Names the core broadcasts; subscribe to whichever your integration cares about.

| Event                  | Payload                                                                  |
|------------------------|--------------------------------------------------------------------------|
| `system_status`        | Runtime health: RNS up, LXMF up, interface counts, identity ready.       |
| `lxmf_identity`        | Active identity hash and display name when loaded or switched.           |
| `contacts_update`      | Full contact list snapshot after any contact mutation.                   |
| `conversations_update` | Conversation roster — last message, unread, peer hash.                   |
| `lxmf_message`         | A single inbound or outbound LXMF message in canonical form.             |
| `lxmf_step`            | Per-message delivery progress (queued, sending, sent, delivered, failed).|
| `unread_total`         | Aggregate unread count across all conversations.                         |
| `stats_update`         | Transport, link, and traffic counters; see Notes for cadence.            |
| `peers_updated`        | Live peer mesh roster snapshot.                                          |
| `all_game_sessions`    | LRGP session list after any session-state change.                        |

Other narrower events exist (`identity_reset`, `identity_switched`, `auto_announce_updated`, `propagation_update`, `ble_diag`, `hub_interfaces_update`, `transport_mode_updated`, etc.). Treat them as live; check the source if you depend on one.

## Error model

Every command returns `Result<Value, AppError>`. Tauri serializes the error variant directly, so on the JS side a rejected `invoke` Promise yields:

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

**Stats are the exception.** The bundled dashboard pulls `get_stats` on a 2.5-second cadence because the counter is cheap and steady. The core also emits `stats_update`; you can pick whichever fits your UX.

**Wait for readiness.** On cold start, RNS comes up before LXMF. Calls into the messaging or identity domain before LXMF is ready return `lxmf_not_initialized` or `service_unavailable`. Listen for `system_status` and gate calls on its `lxmf` flag, or retry with backoff.

**Identity is implicit.** Commands operate against the currently loaded identity — there is no per-call identity argument. Listen for `identity_switched` to know when that context changes underneath you.

**Attachments.** LXMF caps a single message at 1000 bytes for the title-and-content path and ~500 KB for the field path used by attachments. Larger payloads must be chunked at the application layer; the core does not split for you.

**Threading.** Commands are async on a Tokio runtime; long work does not block the WebView. Events are emitted from whatever task produced them, so handlers must be reentrant.

**Versioning.** The IPC surface is not a stable public API. Pin to a Ratspeak release when shipping integrations and re-verify against [the source](https://github.com/ratspeak/Ratspeak) on upgrade.
