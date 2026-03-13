# Games & LRGP

Ratspeak supports multiplayer games over the mesh through LRGP — a lightweight protocol that encodes game actions inside standard LXMF messages.

## Overview

The Games tab lets you play multiplayer games with your contacts over the Reticulum mesh. Under the hood, games use **LRGP (Lightweight Reticulum Gaming Protocol)** — structured data embedded in LXMF custom fields, designed to fit within LoRa's tight bandwidth constraints.

Currently, Tic-Tac-Toe is included as a proof-of-concept to validate the protocol. LRGP is extensible — the plugin architecture supports adding new game types.

Non-Ratspeak clients (Sideband, NomadNet) see human-readable fallback text for every action, so LRGP sessions don't break compatibility.

## Current Games

| Game | Status | Type | Description |
|-----|--------|------|-------------|
| **Tic-Tac-Toe** | Proof of concept | Turn-based | Validates LRGP protocol over mesh |

More games can be added through the LRGP plugin architecture. See [LRGP Protocol](../developer/lrgp-protocol) for the technical specification.

## Games Tab Layout

The Games view is split into two panels:

- **Session List** (left) — all active, pending, and completed game sessions, with unread badges for sessions that have new activity
- **Detail Panel** (right) — the selected session's game board, move history, and controls

Sessions are grouped by status: **Pending** (awaiting response), **Active** (in progress), and **Completed** (finished games).

## Session Lifecycle

Every game session follows a standard lifecycle:

1. **Challenge** — one player sends a challenge to a contact
2. **Accept / Decline** — the recipient accepts or declines
3. **Move** — players take turns (moves in Tic-Tac-Toe)
4. **End** — the game reaches a terminal state (win, draw, resign)

## Playing Tic-Tac-Toe

### Starting a Game

1. Navigate to the **Games** tab
2. Click **New Game** and select **Tic-Tac-Toe**
3. Choose a contact to challenge
4. The challenge is sent as an LXMF message

### Making Moves

- The challenger always plays **X** and moves first
- Tap a cell on the 3x3 grid to place your mark
- Legal moves are enforced client-side (only empty cells)
- Each move is sent as an LXMF message with the cell position

### Game End

Games end by **three in a row** (win), **full board** (draw), or **resignation**. The final board state is preserved in the session history.

## Fallback Text

When a game action is sent, the LXMF message `content` field contains a human-readable description. Non-LRGP clients see these as regular messages:

- `[LRGP TTT] Sent a challenge!`
- `[LRGP TTT] Challenge accepted`
- `[LRGP TTT] X plays center`
- `[LRGP TTT] X wins!`

This ensures game actions don't appear as blank or broken messages on other clients.

## Session Details

### Status and TTLs

| Status | TTL | Description |
|--------|-----|-------------|
| **Pending** | 24 hours | Unanswered challenges auto-expire |
| **Active** | 7 days | Inactive sessions auto-expire |
| **Completed** | Indefinite | Finished games kept in history |

### Unread Badges

Sessions with new activity (opponent moved, challenge received) show an unread badge in the session list, similar to unread message indicators.

### Size Budget

LRGP envelopes are designed to fit within LXMF's **OPPORTUNISTIC** delivery limit (295 bytes total content). The envelope dict itself must stay under **200 bytes** when packed. This ensures game actions are sent as fast single-packet messages — no link handshake required.

## What's Next

- [LRGP Protocol](../developer/lrgp-protocol) — technical protocol specification
- [Messaging](../using-ratspeak/messaging) — how LXMF messaging works
- [Dashboard Overview](../using-ratspeak/dashboard-overview) — general interface tour
