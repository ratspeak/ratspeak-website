# RLAP Protocol

Reticulum LXMF App Protocol — a lightweight standard for interactive applications over LXMF messaging.

## Overview

RLAP defines how interactive app sessions (games, file sharing, collaborative tools) are encoded as LXMF messages. It uses LXMF's custom extension fields to carry structured envelopes alongside human-readable fallback text. Any Reticulum client can adopt RLAP — clients that don't understand it simply display the fallback text as a regular message.

RLAP is designed for the constraints of mesh networking: every byte matters on LoRa links, so the protocol uses single-character keys and msgpack serialization.

## LXMF Field Allocation

RLAP uses two LXMF custom extension fields:

| Field | Constant | Decimal | Value |
|-------|----------|---------|-------|
| Custom Type | `FIELD_CUSTOM_TYPE` | `0xFB` (251) | `"rlap.v1"` |
| Custom Meta | `FIELD_CUSTOM_META` | `0xFD` (253) | RLAP envelope (dict) |

All LXMF fields are serialized via **msgpack** (`RNS.vendor.umsgpack`), not JSON. This is a wire format constraint.

The LXMF message `content` field carries fallback text — the human-readable description of the action. Non-RLAP clients display this as a regular message.

## Envelope Schema

The envelope is a dict stored in `fields[0xFD]` with short single-character keys to minimize wire size:

```python
fields[0xFD] = {
    "a": "chess.1",             # app_id.version
    "c": "move",                # command (action type)
    "s": "a1b2c3d4e5f6g7h8",   # session_id (8 random bytes, hex)
    "p": { ... },               # payload (app-specific)
}
fields[0xFB] = "rlap.v1"       # custom type marker
```

| Key | Name | Description |
|-----|------|-------------|
| `a` | App ID + Version | Combined identifier, e.g. `"chess.1"` |
| `c` | Command | Action type: `challenge`, `accept`, `move`, `resign`, etc. |
| `s` | Session ID | Unique session identifier (hex-encoded random bytes) |
| `p` | Payload | App-specific data dict (also uses short keys) |

<div class="docs-diagram">
<svg viewBox="0 0 720 320" xmlns="http://www.w3.org/2000/svg" fill="none">
  <!-- Title -->
  <text x="360" y="24" text-anchor="middle" fill="#e2e8f0" font-family="Outfit" font-size="14" font-weight="600">RLAP Envelope Inside an LXMF Message</text>

  <!-- Outer LXMF message box -->
  <rect x="30" y="45" width="660" height="260" rx="12" stroke="#38BDF8" stroke-width="1.5" fill="rgba(56,189,248,0.04)"/>
  <text x="50" y="68" fill="#38BDF8" font-family="JetBrains Mono" font-size="12" font-weight="600">LXMF Message</text>

  <!-- Content field -->
  <rect x="50" y="80" width="280" height="40" rx="6" stroke="#7e8fa2" stroke-width="1" fill="rgba(126,143,162,0.06)"/>
  <text x="60" y="97" fill="#7e8fa2" font-family="JetBrains Mono" font-size="10">content</text>
  <text x="130" y="97" fill="#9eadbf" font-family="Outfit" font-size="10">"[Ratspeak Chess] Move 5: Nf3"</text>
  <text x="60" y="112" fill="#7e8fa2" font-family="Outfit" font-size="9">Fallback text (shown by non-RLAP clients)</text>

  <!-- Field 0xFB -->
  <rect x="350" y="80" width="160" height="40" rx="6" stroke="#F59E0B" stroke-width="1" fill="rgba(245,158,11,0.06)"/>
  <text x="360" y="97" fill="#F59E0B" font-family="JetBrains Mono" font-size="10">fields[0xFB]</text>
  <text x="360" y="112" fill="#9eadbf" font-family="JetBrains Mono" font-size="10">"rlap.v1"</text>

  <!-- Field 0xFD (envelope) -->
  <rect x="50" y="140" width="620" height="150" rx="8" stroke="#00D4AA" stroke-width="1.5" fill="rgba(0,212,170,0.06)"/>
  <text x="60" y="160" fill="#00D4AA" font-family="JetBrains Mono" font-size="11" font-weight="600">fields[0xFD] — RLAP Envelope</text>

  <!-- a field -->
  <rect x="70" y="175" width="120" height="34" rx="4" stroke="#C084FC" stroke-width="1" fill="rgba(192,132,252,0.06)"/>
  <text x="80" y="190" fill="#C084FC" font-family="JetBrains Mono" font-size="10">"a"</text>
  <text x="100" y="190" fill="#9eadbf" font-family="JetBrains Mono" font-size="10">: "chess.1"</text>
  <text x="80" y="203" fill="#7e8fa2" font-family="Outfit" font-size="8">app_id.version</text>

  <!-- c field -->
  <rect x="210" y="175" width="120" height="34" rx="4" stroke="#C084FC" stroke-width="1" fill="rgba(192,132,252,0.06)"/>
  <text x="220" y="190" fill="#C084FC" font-family="JetBrains Mono" font-size="10">"c"</text>
  <text x="240" y="190" fill="#9eadbf" font-family="JetBrains Mono" font-size="10">: "move"</text>
  <text x="220" y="203" fill="#7e8fa2" font-family="Outfit" font-size="8">command</text>

  <!-- s field -->
  <rect x="350" y="175" width="160" height="34" rx="4" stroke="#C084FC" stroke-width="1" fill="rgba(192,132,252,0.06)"/>
  <text x="360" y="190" fill="#C084FC" font-family="JetBrains Mono" font-size="10">"s"</text>
  <text x="380" y="190" fill="#9eadbf" font-family="JetBrains Mono" font-size="10">: "a1b2c3d4..."</text>
  <text x="360" y="203" fill="#7e8fa2" font-family="Outfit" font-size="8">session_id</text>

  <!-- p field (payload) -->
  <rect x="70" y="225" width="580" height="50" rx="6" stroke="#F59E0B" stroke-width="1" fill="rgba(245,158,11,0.04)"/>
  <text x="80" y="243" fill="#F59E0B" font-family="JetBrains Mono" font-size="10">"p"</text>
  <text x="100" y="243" fill="#9eadbf" font-family="JetBrains Mono" font-size="10">: {"u": "g1f3", "m": "Nf3", "n": 5, "t": "f9e8d7...", "x": "", "w": ""}</text>
  <text x="80" y="264" fill="#7e8fa2" font-family="Outfit" font-size="8">payload — app-specific data (chess: UCI move, SAN, move number, turn, terminal status, winner)</text>

  <!-- msgpack label -->
  <text x="540" y="68" fill="#7e8fa2" font-family="Outfit" font-size="10" font-style="italic">Serialized via msgpack</text>
</svg>
<figcaption>Structure of an RLAP envelope within an LXMF message</figcaption>
</div>

## Size Constraints

LXMF has strict per-method content limits:

| Delivery Method | Max Content | Behavior if Exceeded |
|-----------------|-------------|---------------------|
| **OPPORTUNISTIC** | 295 bytes | Auto-escalates to DIRECT |
| **DIRECT** (packet) | 319 bytes | Auto-escalates to Resource |
| **DIRECT** (resource) | ~3.2 MB | Link-based streaming |

LXMF overhead is 112 bytes (destination hash, source hash, Ed25519 signature, timestamp, msgpack structure).

**Budget rule**: The `fields[0xFD]` envelope dict, when packed alone via msgpack, must not exceed **200 bytes**. This leaves room for fallback text, title, and framing within the 295-byte OPPORTUNISTIC limit. Staying within OPPORTUNISTIC means game actions are delivered as fast single-packet messages — no link handshake required.

If content exceeds the OPPORTUNISTIC limit, LXMF silently escalates to DIRECT delivery, which requires a full Reticulum link handshake. On LoRa links, this can add seconds to minutes of latency.

## Session Lifecycle

All RLAP sessions follow this state machine:

```
challenge --> accept --> action* --> end
    |                      |
    +--> decline           +--> resign
    |                      +--> draw_offer --> draw_accept
    +--> expire (local)    |                +-> draw_decline
                           +--> error
```

| Command | Description |
|---------|-------------|
| `challenge` | Initiates a new session. Challenger generates the session ID |
| `accept` | Accepts a challenge and provides initial state |
| `decline` | Rejects a challenge |
| `action` | App-specific action within an active session (e.g., a chess move) |
| `end` | Terminal state (checkmate, stalemate, timeout) |
| `resign` | Voluntary forfeit |
| `draw_offer` / `draw_accept` / `draw_decline` | Draw negotiation |
| `error` | Receiver rejects an invalid action |
| `expire` | Local-only cleanup — no LXMF message sent |

## Validation Models

Each app declares its validation strategy:

| Model | Description | Error Behavior |
|-------|-------------|----------------|
| `sender` | Sender validates before sending; receiver trusts | No error actions (sender prevents bad moves) |
| `receiver` | Receiver validates on receipt; rejects invalid | Sends `error` action with code |
| `both` | Both sides validate independently | Receiver sends `error` if validation disagrees |

Chess uses **sender validation** — chess.js enforces legal moves client-side. For competitive or cross-client scenarios, receiver validation provides stronger guarantees.

## Session Types

| Type | Description | Example |
|------|-------------|---------|
| `turn_based` | Players alternate actions | Chess, Tic-Tac-Toe |
| `real_time` | Both players can act at any time | Collaborative editing |
| `one_shot` | Single action, no ongoing session | File sharing |

## Session Expiry

| Status | TTL | Description |
|--------|-----|-------------|
| `pending` | 24 hours | Unanswered challenges |
| `active` | 7 days | Inactive sessions |
| `completed` | Indefinite | History preserved |

Expiry is **local-only** — both peers expire sessions independently based on their local clocks. No LXMF message is sent on expiry.

## Delivery Method Guidelines

Each action type has a preferred delivery method:

| Action | Preferred | Rationale |
|--------|-----------|-----------|
| `challenge` | OPPORTUNISTIC | Small payload, fire-and-forget |
| `accept` | OPPORTUNISTIC | Small payload with initial state |
| `move` | OPPORTUNISTIC | Must fit in 295B (short keys enforce this) |
| `resign` | DIRECT | Delivery confirmation important |
| `draw_accept` | DIRECT | State-changing, want confirmation |
| `error` | OPPORTUNISTIC | Informational |

## Fallback Text Convention

Every RLAP message sets the LXMF `content` field to a human-readable string:

**Format**: `[Ratspeak <AppName>] <description>`

Examples:
- `[Ratspeak Chess] Sent a challenge!`
- `[Ratspeak Chess] Move 5: Nf3`
- `[Ratspeak Chess] Checkmate! White wins.`

There is no separate `fallback` key in the envelope. The LXMF content field IS the fallback. This saves ~30-40 bytes per message.

## Plugin Architecture

Apps are implemented as subclasses of `AppBase`, which defines:

- **`handle_incoming()`** — process received RLAP actions
- **`handle_outgoing()`** — prepare outgoing actions
- **`validate_action()`** — validate moves (for receiver/both models)
- **`render_fallback()`** — generate fallback text
- **`get_manifest()`** — declare app metadata (ID, version, session type, TTLs)

The **App Router** discovers installed apps, dispatches incoming/outgoing actions by `app_id`, and manages the app registry.

## Capability Negotiation

Capabilities are **not** exchanged in every message. Instead, the `app_id.version` field (`"a"`) implicitly declares the sender's protocol version. A client receiving `"chess.1"` knows the sender supports RLAP v1 chess. If a client receives an unknown `app_id`, it sends an `error` action with code `unsupported_app`.

## Cross-Client Adoption

RLAP is designed for progressive adoption across the Reticulum ecosystem:

| Level | Support | Behavior |
|-------|---------|----------|
| **Level 0** | No RLAP awareness | Sees fallback text as regular messages |
| **Level 1** | RLAP detection only | Identifies RLAP messages, displays metadata |
| **Level 2** | Passive participation | Renders game states, no interaction |
| **Level 3** | Full participation | Sends and receives RLAP actions |

Currently, Ratspeak is the only Level 3 client. All other LXMF clients operate at Level 0 via the fallback text mechanism.

## Backward Compatibility

Messages with `fields[0xFB] = "ratspeak.game"` are legacy v0 (pre-RLAP). The app router translates them to RLAP format on receipt. Legacy translation is **receive-only** — all outbound messages use RLAP v1.

## What's Next

- [Games & Apps](../using-ratspeak/games-and-apps) — using RLAP apps in Ratspeak
- [LXMF Protocol](../understanding/lxmf-protocol) — the messaging layer RLAP builds on
- [Wire Format](../understanding/wire-format) — Reticulum's packet structure
