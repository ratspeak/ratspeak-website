# Games & Apps

Interactive applications built on RLAP — play chess, challenge contacts, and track sessions alongside your messages.

## Overview

The Games tab hosts interactive applications that run over the Reticulum mesh using LXMF messages. Each app session (a chess game, for example) is a series of structured messages exchanged between two contacts. Under the hood, these messages use **RLAP (Reticulum LXMF App Protocol)** — a lightweight protocol that encodes app actions into LXMF custom fields.

Non-Ratspeak clients (Sideband, NomadNet, MeshChat) see human-readable fallback text for every action, so RLAP sessions don't break compatibility.

<div class="screenshot-placeholder" data-caption="Games tab showing session list on the left and an active chess game with board and move history on the right">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#7e8fa2" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
    <div>Games tab with chess session — screenshot placeholder</div>
</div>

## Available Apps

| App | Status | Type | Description |
|-----|--------|------|-------------|
| **Chess** | Active | Turn-based | Standard chess with full rule enforcement |
| **Tic-Tac-Toe** | In progress | Turn-based | Classic 3x3 grid game |

More apps can be added through the RLAP plugin architecture. See [RLAP Protocol](../developer/rlap-protocol) for the technical specification.

## Games Tab Layout

The Games view is split into two panels:

- **Session List** (left) — all active, pending, and completed game sessions, with unread badges for sessions that have new activity
- **Detail Panel** (right) — the selected session's game board, move history, and controls

Sessions are grouped by status: **Pending** (awaiting response), **Active** (in progress), and **Completed** (finished games).

## Session Lifecycle

Every game session follows a standard lifecycle:

<div class="docs-diagram">
<svg viewBox="0 0 720 300" xmlns="http://www.w3.org/2000/svg" fill="none">
  <!-- Title -->
  <text x="360" y="24" text-anchor="middle" fill="#e2e8f0" font-family="Outfit" font-size="14" font-weight="600">Session Lifecycle State Machine</text>

  <!-- Challenge -->
  <rect x="40" y="60" width="120" height="44" rx="8" stroke="#F59E0B" stroke-width="1.5" fill="rgba(245,158,11,0.08)"/>
  <text x="100" y="87" text-anchor="middle" fill="#F59E0B" font-family="JetBrains Mono" font-size="12" font-weight="600">challenge</text>

  <!-- Accept -->
  <rect x="240" y="60" width="120" height="44" rx="8" stroke="#00D4AA" stroke-width="1.5" fill="rgba(0,212,170,0.08)"/>
  <text x="300" y="87" text-anchor="middle" fill="#00D4AA" font-family="JetBrains Mono" font-size="12" font-weight="600">accept</text>

  <!-- Action -->
  <rect x="440" y="60" width="120" height="44" rx="8" stroke="#38BDF8" stroke-width="1.5" fill="rgba(56,189,248,0.08)"/>
  <text x="500" y="87" text-anchor="middle" fill="#38BDF8" font-family="JetBrains Mono" font-size="12" font-weight="600">action*</text>

  <!-- End -->
  <rect x="580" y="160" width="100" height="44" rx="8" stroke="#00D4AA" stroke-width="2" fill="rgba(0,212,170,0.12)"/>
  <text x="630" y="187" text-anchor="middle" fill="#00D4AA" font-family="JetBrains Mono" font-size="12" font-weight="600">end</text>

  <!-- Decline -->
  <rect x="240" y="160" width="120" height="44" rx="8" stroke="#FF6B6B" stroke-width="1.5" fill="rgba(255,107,107,0.08)"/>
  <text x="300" y="187" text-anchor="middle" fill="#FF6B6B" font-family="JetBrains Mono" font-size="12" font-weight="600">decline</text>

  <!-- Resign -->
  <rect x="440" y="160" width="120" height="44" rx="8" stroke="#FF6B6B" stroke-width="1.5" fill="rgba(255,107,107,0.08)"/>
  <text x="500" y="187" text-anchor="middle" fill="#FF6B6B" font-family="JetBrains Mono" font-size="12" font-weight="600">resign</text>

  <!-- Draw offer -->
  <rect x="340" y="240" width="120" height="44" rx="8" stroke="#C084FC" stroke-width="1.5" fill="rgba(192,132,252,0.08)"/>
  <text x="400" y="262" text-anchor="middle" fill="#C084FC" font-family="JetBrains Mono" font-size="11" font-weight="600">draw_offer</text>

  <!-- Draw accept -->
  <rect x="520" y="240" width="120" height="44" rx="8" stroke="#C084FC" stroke-width="1.5" fill="rgba(192,132,252,0.08)"/>
  <text x="580" y="262" text-anchor="middle" fill="#C084FC" font-family="JetBrains Mono" font-size="11" font-weight="600">draw_accept</text>

  <!-- Arrows: challenge -> accept -->
  <line x1="160" y1="82" x2="232" y2="82" stroke="#3a4759" stroke-width="1.5"/>
  <polygon points="232,78 240,82 232,86" fill="#3a4759"/>

  <!-- challenge -> decline -->
  <line x1="100" y1="104" x2="100" y2="170" stroke="#3a4759" stroke-width="1" stroke-dasharray="4 3"/>
  <line x1="100" y1="170" x2="232" y2="175" stroke="#3a4759" stroke-width="1" stroke-dasharray="4 3"/>
  <polygon points="232,171 240,175 232,179" fill="#3a4759"/>

  <!-- accept -> action -->
  <line x1="360" y1="82" x2="432" y2="82" stroke="#3a4759" stroke-width="1.5"/>
  <polygon points="432,78 440,82 432,86" fill="#3a4759"/>

  <!-- action self-loop -->
  <path d="M530 60 Q550 40 530 60" stroke="#38BDF8" stroke-width="1" fill="none"/>
  <path d="M500 60 C500 40 540 40 540 60" stroke="#38BDF8" stroke-width="1.5" fill="none"/>
  <polygon points="540,56 544,64 536,64" fill="#38BDF8"/>

  <!-- action -> end -->
  <line x1="545" y1="104" x2="620" y2="152" stroke="#3a4759" stroke-width="1.5"/>
  <polygon points="616,148 624,152 618,156" fill="#3a4759"/>

  <!-- action -> resign -->
  <line x1="500" y1="104" x2="500" y2="152" stroke="#3a4759" stroke-width="1" stroke-dasharray="4 3"/>
  <polygon points="496,152 500,160 504,152" fill="#3a4759"/>

  <!-- action -> draw_offer -->
  <line x1="470" y1="104" x2="420" y2="232" stroke="#3a4759" stroke-width="1" stroke-dasharray="4 3"/>
  <polygon points="416,228 420,236 424,228" fill="#3a4759"/>

  <!-- draw_offer -> draw_accept -->
  <line x1="460" y1="262" x2="512" y2="262" stroke="#3a4759" stroke-width="1"/>
  <polygon points="512,258 520,262 512,266" fill="#3a4759"/>

  <!-- draw_accept -> end -->
  <line x1="620" y1="240" x2="640" y2="212" stroke="#3a4759" stroke-width="1"/>
  <polygon points="636,212 644,208 640,216" fill="#3a4759"/>

  <!-- resign -> end -->
  <line x1="540" y1="182" x2="572" y2="182" stroke="#3a4759" stroke-width="1"/>
  <polygon points="572,178 580,182 572,186" fill="#3a4759"/>
</svg>
<figcaption>RLAP session lifecycle: challenge, accept, actions, and terminal states</figcaption>
</div>

1. **Challenge** — one player sends a challenge to a contact
2. **Accept / Decline** — the recipient accepts or declines
3. **Action** — players take turns (moves in chess)
4. **End** — the game reaches a terminal state (checkmate, stalemate, draw, resign)

## Playing Chess

### Starting a Game

1. Navigate to the **Games** tab
2. Click **New Game** and select **Chess**
3. Choose a contact to challenge
4. The challenge is sent as an LXMF message

<div class="screenshot-placeholder" data-caption="Challenge dialog showing game type selection and contact picker">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#7e8fa2" stroke-width="1.5" stroke-linecap="round"><path d="M12 2L9 9H3l5 4-2 7 6-4 6 4-2-7 5-4h-6z"/></svg>
    <div>Games tab challenge dialog — screenshot placeholder</div>
</div>

### Making Moves

- The challenger always plays **White** and moves first
- Click a piece to select it, then click the destination square
- Legal moves are enforced client-side by chess.js
- Each move is sent as an LXMF message with the move in UCI and SAN notation

### Game End

Games end by **checkmate**, **stalemate**, **resignation**, or **draw agreement**. The final board state is preserved in the session history.

## Fallback Text

When a game action is sent, the LXMF message `content` field contains a human-readable description. Non-RLAP clients see these as regular messages:

- `[Ratspeak Chess] Sent a challenge!`
- `[Ratspeak Chess] Challenge accepted`
- `[Ratspeak Chess] Move 5: Nf3`
- `[Ratspeak Chess] Checkmate! White wins.`

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

RLAP envelopes are designed to fit within LXMF's **OPPORTUNISTIC** delivery limit (295 bytes total content). The envelope dict itself must stay under **200 bytes** when packed. This ensures game actions are sent as fast single-packet messages — no link handshake required.

## What's Next

- [RLAP Protocol](../developer/rlap-protocol) — technical protocol specification
- [Messaging](../using-ratspeak/messaging) — how LXMF messaging works
- [Dashboard Overview](../using-ratspeak/dashboard-overview) — general interface tour
