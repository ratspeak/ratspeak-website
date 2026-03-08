# RLAP Protocol & Building Apps

The Reticulum LXMF App Protocol (RLAP) — a lightweight standard for interactive applications over LXMF messaging. How it works, how to build new apps, and the full protocol specification.

## What is RLAP?

RLAP enables interactive, session-based applications (games, collaborative tools, file sharing) to run over LXMF messages. It works by embedding structured app data inside standard LXMF messages, meaning:

- **Any LXMF transport works** — direct, propagated, over LoRa, TCP, or any Reticulum interface
- **Non-RLAP clients see fallback text** — Sideband, NomadNet, and other clients display a human-readable message
- **Bandwidth-optimized** — single-character keys and MessagePack serialization fit within LoRa's tight constraints

## Protocol Overview

RLAP uses two LXMF custom extension fields to carry app data:

| Field | Constant | Value |
|-------|----------|-------|
| Custom Type | `0xFB` (251) | `"rlap.v1"` |
| Custom Meta | `0xFD` (253) | RLAP envelope (MessagePack dict) |

The LXMF `content` field always contains human-readable fallback text.

### Envelope Format

```python
fields[0xFB] = "rlap.v1"
fields[0xFD] = {
    "a": "chess.1",              # app_id.version
    "c": "move",                 # command
    "s": "a1b2c3d4e5f6g7h8",    # session_id
    "p": { "u": "e2e4", ... }   # payload (app-specific)
}
```

All keys are **single characters** to minimize wire size:

| Key | Name | Type | Description |
|-----|------|------|-------------|
| `a` | App ID + Version | string | Combined `"app_id.version"` |
| `c` | Command | string | Action type (challenge, move, resign, etc.) |
| `s` | Session ID | string | Hex-encoded random bytes, unique per session |
| `p` | Payload | dict | App-specific data (also uses short keys) |

### Size Budget

LXMF delivery methods have strict content limits:

| Method | Max Content | Auto-escalation |
|--------|-------------|-----------------|
| OPPORTUNISTIC | 295 bytes | Exceeds → DIRECT |
| DIRECT (packet) | 319 bytes | Exceeds → Resource transfer |
| Resource transfer | ~3.2 MB | — |

**Budget rule:** The `fields[0xFD]` envelope must not exceed **~200 bytes** when MessagePack-packed. This leaves headroom for fallback text and framing within the 295-byte OPPORTUNISTIC limit.

OPPORTUNISTIC delivery is the fast path — single packet, no link setup required. Keeping envelopes small means game moves can travel over LoRa in a single radio burst.

## Session Lifecycle

Every RLAP interaction is organized into **sessions** — a sequence of actions between two participants.

### State Machine

```
challenge ──→ accept ──→ action* ──→ end
    │                       │
    ├──→ decline             ├──→ resign
    │                       ├──→ draw_offer ──→ draw_accept
    └──→ expire (local)     │                └──→ draw_decline
                            └──→ error
```

### Standard Commands

| Command | Direction | Purpose |
|---------|-----------|---------|
| `challenge` | Initiator → Responder | Start a new session |
| `accept` | Responder → Initiator | Accept the challenge |
| `decline` | Responder → Initiator | Decline the challenge |
| `action` | Either → Either | App-defined action (move, update, etc.) |
| `resign` | Either → Either | Voluntary forfeit |
| `draw_offer` | Either → Either | Propose a draw |
| `draw_accept` | Either → Either | Accept draw proposal |
| `draw_decline` | Either → Either | Decline draw proposal |
| `error` | Receiver → Sender | Reject invalid action |
| `expire` | Local only | Clean up stale session (no LXMF sent) |

### Session Status

| Status | TTL | Description |
|--------|-----|-------------|
| `pending` | 24 hours | Unanswered challenge |
| `active` | 7 days of inactivity | Game in progress |
| `completed` | Indefinite | Game ended (history) |

Expiry is **local-only** — both peers expire independently, no network message sent.

## Delivery Preferences

Each command type has a preferred LXMF delivery method:

| Command | Preferred | Rationale |
|---------|-----------|-----------|
| `challenge`, `accept`, `decline` | OPPORTUNISTIC | Small payload, single packet |
| `move`, `draw_offer` | OPPORTUNISTIC | Quick moves on LoRa |
| `resign`, `draw_accept`, `draw_decline` | DIRECT | State-changing, want confirmation |
| `error` | OPPORTUNISTIC | Informational |

LXMF auto-escalates from OPPORTUNISTIC to DIRECT if content exceeds 295 bytes.

## Validation Models

RLAP supports three validation approaches:

| Model | Description | Error Behavior |
|-------|-------------|----------------|
| **sender** | Sender validates before sending | No error actions needed |
| **receiver** | Receiver validates on receipt | Sends `error` action on invalid |
| **both** | Both sides validate independently | Receiver sends `error` if disagreement |

Chess uses **sender validation** — the client-side chess.js library enforces legal moves before sending.

## Session Types

| Type | Description | Example |
|------|-------------|---------|
| `turn_based` | Players alternate | Chess, Tic-Tac-Toe |
| `real_time` | Both can act anytime | Collaborative editing |
| `one_shot` | Single action, no ongoing state | File sharing |

## Error Handling

When a receiver cannot process an action, it sends an `error` command:

```python
fields[0xFD] = {
    "a": "chess.1",
    "c": "error",
    "s": "session_id",
    "p": {
        "code": "invalid_move",
        "msg": "Not your turn",
        "ref": "move"
    }
}
```

Standard error codes:
- `unsupported_app` — App not installed
- `invalid_move` — Illegal game action
- `not_your_turn` — Wrong player acting
- `session_expired` — Session no longer active

## Fallback Text

Every RLAP message sets the LXMF `content` field to human-readable text:

**Format:** `[Ratspeak <AppName>] <description>`

**Examples:**
- `[Ratspeak Chess] Sent a challenge!`
- `[Ratspeak Chess] Move 5: Nf3`
- `[Ratspeak Chess] Checkmate! White wins.`
- `[Ratspeak Chess] Resigned. Black wins.`

Non-RLAP clients (Sideband, NomadNet) display this as a regular message — no special handling required.

## Chess Payload Schema

The built-in Chess app uses these payload keys:

| Key | Name | Type | Used In |
|-----|------|------|---------|
| `f` | FEN | string | accept, move (terminal) |
| `u` | UCI move | string | move |
| `m` | SAN move | string | move (display) |
| `n` | Move number | int | move |
| `t` | Turn (hash) | string | accept, move |
| `x` | Terminal status | string | move (`""`, `"checkmate"`, `"stalemate"`, `"draw"`) |
| `w` | Winner (hash) | string | move (if checkmate) |

**Example chess move:**
```python
fields[0xFD] = {
    "a": "chess.1",
    "c": "move",
    "s": "a1b2c3d4e5f6g7h8",
    "p": {
        "u": "e2e4",
        "m": "e4",
        "n": 1,
        "t": "4faf1b2e...",
        "x": "",
        "w": ""
    }
}
```

## Building a New App

### Plugin Architecture

Apps subclass `AppBase` and implement:

```python
class MyApp(AppBase):
    def get_manifest(self):
        return {
            "app_id": "myapp",
            "version": 1,
            "display_name": "My App",
            "session_type": "turn_based",
            "validation": "sender",
        }

    def handle_incoming(self, session, action):
        # Process received action
        # Update session state
        # Return updated session
        pass

    def handle_outgoing(self, session, command, payload):
        # Prepare outgoing action
        # Validate move (if sender validation)
        # Return envelope payload
        pass

    def render_fallback(self, command, payload):
        # Generate human-readable text
        return f"[Ratspeak MyApp] {command}"
```

### Registration

Place your app module in the `rlap.apps` package. The App Router auto-discovers and registers all `AppBase` subclasses at startup.

### Design Constraints

When designing an RLAP app, keep these constraints in mind:

1. **200-byte envelope budget** — Use single-character payload keys, minimize data
2. **Asynchronous delivery** — Messages may take seconds (TCP) to hours (propagation) to arrive
3. **No guaranteed ordering** — Messages may arrive out of order on slow networks
4. **Idempotent actions** — Design for duplicate delivery (LXMF may retry)
5. **Graceful degradation** — Handle missing fields, unknown commands, version mismatches

## Cross-Client Compatibility

| Level | Support | Behavior |
|-------|---------|----------|
| **0** | No RLAP awareness | Sees fallback text as regular message |
| **1** | RLAP detection only | Identifies RLAP messages, displays metadata |
| **2** | Passive participation | Renders game states, no interaction |
| **3** | Full participation | Sends and receives RLAP actions |

Currently, **Ratspeak is the only Level 3 client**. All other LXMF clients are Level 0 (they see fallback text).

## Legacy Compatibility

Messages with `fields[0xFB] = "ratspeak.game"` are pre-RLAP (legacy v0). The App Router translates them to RLAP format on receipt:

| Legacy Field | RLAP Equivalent |
|-------------|-----------------|
| `action` | `"c"` (command) |
| `game_id` | `"s"` (session_id) |
| `game` | `"a"` (app_id prefix) |
| `state` | `"p"."f"` (FEN) |
| `move` | `"p"."u"` (UCI) |
| `move_san` | `"p"."m"` (SAN) |

Legacy translation is **receive-only** — all outbound messages use RLAP v1.

## What's Next

- [Games & Apps](../using-ratspeak/games-and-apps) — using games in Ratspeak
- [LXMF Protocol](../understanding/lxmf-protocol) — the messaging layer RLAP rides on
- [REST API Reference](../developer/rest-api) — game-related API endpoints
- [Socket.IO Events](../developer/socketio-events) — game-related real-time events
