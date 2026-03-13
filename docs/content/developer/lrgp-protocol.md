# LRGP Protocol & Building Games

The Lightweight Reticulum Gaming Protocol (LRGP) — a protocol for multiplayer games over LXMF messaging. How it works, how to build new games, and the full protocol specification.

## What is LRGP?

LRGP enables multiplayer game sessions to run over LXMF messages. It works by embedding structured game data inside standard LXMF messages, meaning:

- **Any LXMF transport works** — direct, propagated, over LoRa, TCP, or any Reticulum interface
- **Non-LRGP clients see fallback text** — Sideband, NomadNet, and other clients display a human-readable message
- **Bandwidth-optimized** — single-character keys and MessagePack serialization fit within LoRa's tight constraints

LRGP v0.2 is **2-player only**. All sessions have exactly one initiator and one responder.

## Protocol Overview

LRGP uses two LXMF custom extension fields to carry game data:

| Field | Constant | Value |
|-------|----------|-------|
| Custom Type | `0xFB` (251) | `"lrgp.v1"` |
| Custom Meta | `0xFD` (253) | LRGP envelope (MessagePack dict) |

The LXMF `content` field always contains human-readable fallback text. All data is serialized via **msgpack** (not JSON).

### Legacy Markers

Implementations must also recognize these legacy markers on inbound messages:
- `"rlap.v1"` — prior protocol version
- `"ratspeak.game"` — legacy v0

All outbound messages use `"lrgp.v1"`.

### Envelope Format

```python
fields[0xFB] = "lrgp.v1"
fields[0xFD] = {
    "a": "ttt.1",                # game_id.version
    "c": "move",                 # command
    "s": "a1b2c3d4e5f6g7h8",    # session_id (16-char hex)
    "p": { "i": 4, ... }        # payload (game-specific)
}
```

All keys are **single characters** to minimize wire size:

| Key | Name | Type | Description |
|-----|------|------|-------------|
| `a` | Game ID + Version | string | Combined `"game_id.version"` |
| `c` | Command | string | Action type (challenge, move, resign, etc.) |
| `s` | Session ID | string | 16 hex chars (8 random bytes), unique per session |
| `p` | Payload | dict | Game-specific data (also uses short keys) |

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

Every LRGP interaction is organized into **sessions** — a sequence of actions between two players.

### State Machine

```
challenge ──→ accept ──→ move* ──→ end
    │                      │
    ├──→ decline            ├──→ resign
    │                      ├──→ draw_offer ──→ draw_accept
    └──→ expire (local)    │                └──→ draw_decline
                           └──→ error (receiver → sender)
```

### Commands

| Command | Direction | Purpose |
|---------|-----------|---------|
| `challenge` | Initiator → Responder | Start a new game session |
| `accept` | Responder → Initiator | Accept the challenge |
| `decline` | Responder → Initiator | Decline the challenge |
| `move` | Either → Either | Game-specific action (place a piece, etc.) |
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

Expiry is **local-only** — both peers expire independently, no network message sent. Games may override default TTLs via their manifest.

## Session Types

| Type | Description | Example |
|------|-------------|---------|
| `turn_based` | Players alternate turns | Tic-Tac-Toe |
| `real_time` | Both players can act anytime | Collaborative games |
| `round_based` | Multiple rounds with scoring | Tournament-style |
| `single_round` | Single round per session | Rock-paper-scissors |

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

LRGP supports three validation approaches:

| Model | Description | Error Behavior |
|-------|-------------|----------------|
| **sender** | Sender validates before sending | No error actions needed |
| **receiver** | Receiver validates on receipt | Sends `error` action on invalid |
| **both** | Both sides validate independently | Receiver sends `error` if disagreement |

Tic-Tac-Toe uses **sender validation** — the client enforces legal moves (empty cells only) before sending.

## Error Handling

When a receiver cannot process an action, it sends an `error` command:

```python
fields[0xFD] = {
    "a": "ttt.1",
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
- `unsupported_app` — Game not installed
- `invalid_move` — Illegal game action
- `not_your_turn` — Wrong player acting
- `session_expired` — Session no longer active
- `protocol_error` — Malformed envelope or unknown command

## Fallback Text

Every LRGP message sets the LXMF `content` field to human-readable text:

**Format:** `[LRGP <GameName>] <description>`

**Examples:**
- `[LRGP TTT] Sent a challenge!`
- `[LRGP TTT] Move 3`
- `[LRGP TTT] X wins!`
- `[LRGP TTT] Resigned. O wins.`

Non-LRGP clients (Sideband, NomadNet) display this as a regular message — no special handling required.

## Tic-Tac-Toe Payload Schema

The built-in Tic-Tac-Toe game (`ttt.1`) uses these payload keys:

| Key | Name | Type | Used In |
|-----|------|------|---------|
| `i` | Cell index | int | move (0-8, left-to-right top-to-bottom) |
| `b` | Board state | string | accept, move (9 chars: `"_"`, `"X"`, `"O"`) |
| `n` | Move number | int | move (1-based) |
| `t` | Turn (hash) | string | accept, move (hash of player whose turn is next) |
| `x` | Terminal status | string | move (`""`, `"win"`, `"draw"`) |
| `w` | Winner (hash) | string | move (if win) |

**Example Tic-Tac-Toe move:**
```python
fields[0xFD] = {
    "a": "ttt.1",
    "c": "move",
    "s": "a1b2c3d4e5f6g7h8",
    "p": {
        "i": 4,
        "b": "    X    ",
        "n": 1,
        "t": "4faf1b2e...",
        "x": "",
        "w": ""
    }
}
```

## Building a New Game

### Game Manifest

Each game declares a manifest:

```python
{
    "app_id": "mygame",
    "version": 1,
    "display_name": "My Game",
    "icon": "mygame-icon",
    "session_type": "turn_based",
    "max_players": 2,
    "min_players": 2,
    "validation": "sender",
    "actions": ["challenge", "accept", "decline", "move", "resign"],
    "preferred_delivery": {"move": "opportunistic", "resign": "direct"},
    "ttl": {"pending": 86400, "active": 604800}
}
```

### Plugin Architecture

Games subclass `GameBase` and implement:

```python
class MyGame(GameBase):
    def get_manifest(self):
        return {
            "app_id": "mygame",
            "version": 1,
            "display_name": "My Game",
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
        return f"[LRGP MyGame] {command}"
```

### Registration

Place your game module in the `lrgp.games` package. The Game Router auto-discovers and registers all `GameBase` subclasses at startup.

### Design Constraints

When designing an LRGP game, keep these constraints in mind:

1. **200-byte envelope budget** — Use single-character payload keys, minimize data
2. **Asynchronous delivery** — Messages may take seconds (TCP) to hours (propagation) to arrive
3. **No guaranteed ordering** — Messages may arrive out of order on slow networks
4. **Idempotent actions** — Design for duplicate delivery (LXMF may retry)
5. **Graceful degradation** — Handle missing fields, unknown commands, version mismatches

## Storage Schema

### game_sessions

| Column | Type | Description |
|--------|------|-------------|
| `session_id` | TEXT | 16-char hex, part of composite PK |
| `identity_id` | TEXT | Local identity, part of composite PK |
| `app_id` | TEXT | Game identifier |
| `app_version` | INTEGER | Protocol version |
| `contact_hash` | TEXT | Remote peer's identity hash |
| `initiator` | TEXT | Who sent the challenge |
| `status` | TEXT | pending/active/completed/expired/declined |
| `metadata` | TEXT (JSON) | Game-specific state blob |
| `unread` | INTEGER | 0 or 1 |
| `created_at` | REAL | Unix timestamp |
| `updated_at` | REAL | Unix timestamp |
| `last_action_at` | REAL | Unix timestamp (used for TTL) |

### game_actions

| Column | Type | Description |
|--------|------|-------------|
| `session_id` | TEXT | Session reference |
| `identity_id` | TEXT | Local identity |
| `action_num` | INTEGER | Sequence number |
| `command` | TEXT | LRGP command |
| `payload_json` | TEXT | Serialized payload |
| `sender` | TEXT | Who sent this action |
| `timestamp` | REAL | Unix timestamp |

## Cross-Client Compatibility

| Level | Support | Behavior |
|-------|---------|----------|
| **None** | No LRGP awareness | Sees fallback text as regular message |
| **Basic** | LRGP detection only | Identifies LRGP messages, displays metadata |
| **Full** | Full participation | Sends and receives LRGP game actions |

Currently, **Ratspeak is the only Full client**. All other LXMF clients see fallback text (None level).

## Legacy Compatibility

Messages with `fields[0xFB]` set to `"rlap.v1"` or `"ratspeak.game"` are legacy. The Game Router recognizes them on inbound and processes them normally:

| Legacy Field | LRGP Equivalent |
|-------------|-----------------|
| `action` | `"c"` (command) |
| `game_id` | `"s"` (session_id) |
| `game` | `"a"` (game_id prefix) |
| `state` | `"p"."b"` (board) |
| `move` | `"p"."i"` (cell index) |

Legacy translation is **receive-only** — all outbound messages use `"lrgp.v1"`.

## What's Next

- [Games & LRGP](../using-ratspeak/games-and-apps) — using LRGP games in Ratspeak
- [LXMF Protocol](../understanding/lxmf-protocol) — the messaging layer LRGP rides on
- [REST API Reference](../developer/rest-api) — game-related API endpoints
- [Socket.IO Events](../developer/socketio-events) — game-related real-time events
