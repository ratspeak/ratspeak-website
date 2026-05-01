# Games

The **Games** view is where you play turn-based games with your contacts over the mesh. Two games ship today: **Tic-Tac-Toe** and **Chess**. Both ride on top of [LRGP](../products/lrgp) — each move is a small MessagePack envelope tucked inside an LXMF custom field, so a move is just another message as far as the network is concerned.

Because move payloads stay well under 295 bytes, they travel opportunistically. You and your opponent never need to be online at the same time. Make a move, close the app, get on with your day — the next move arrives whenever your contact's client picks it up.

## What the Games view does

Open the Games view from the bottom navigation. You'll see two columns:

- **Sessions** on the left, grouped by status — pending challenges, active games, finished games.
- **Board** on the right, showing whichever session you've selected.

Sessions with a move waiting on you show an unread badge, the same way the Messages view marks unread threads.

## Starting a game

1. Open **Games**.
2. Tap **New Game** at the top of the sessions list.
3. Pick the game type — Tic-Tac-Toe or Chess.
4. Tap a contact's name to send them the challenge.

The challenge goes out as a single LXMF message. When your contact opens their copy of Ratspeak, they'll see it under **Pending** and can accept or decline. Pending challenges live for 24 hours; if no one answers, the session quietly expires.

Both peers hold their own copy of the game state locally. There is no server in the middle — your client and your opponent's client each apply moves to their own board and exchange the deltas.

## Tic-Tac-Toe

The simplest of the two. You'll see a 3x3 grid. The challenger plays X and moves first.

- Click an empty cell to place your mark.
- Three in a row wins. A full board with no winner is a draw.
- Illegal moves are blocked client-side, so you can't accidentally overwrite a square.

Each move sends a tiny envelope with the cell index. The whole game rarely exceeds nine moves, so a full match fits comfortably inside a handful of LXMF messages.

## Chess

Chess uses the `cozy-chess` engine for legal-move generation, so every move you make is validated against full chess rules — castling, en passant, promotion, the lot.

- Click a piece to see its legal destinations highlighted.
- Click a destination to move.
- Pawn promotion prompts you for the promotion piece.
- The board flips to your perspective: White at the bottom if you're playing White, Black at the bottom if you're playing Black.

The challenger plays White by default. Move history is shown alongside the board in standard algebraic notation.

## How a session ends

A game ends one of four ways:

- **Resign** — either player can resign at any time from the board controls. The session moves to Completed with the resigning player marked as the loser.
- **Draw** — Tic-Tac-Toe ends in a draw automatically when the board fills with no winner. Chess supports draw offers and accepts standard draw conditions (stalemate, threefold repetition, fifty-move rule, insufficient material).
- **Checkmate / win** — Tic-Tac-Toe ends on three-in-a-row. Chess ends on checkmate. The winning side is recorded in the session.
- **Expiry** — an active game with no moves for 7 days auto-expires. The session is preserved in history but no further moves are accepted.

Completed sessions stay in your history indefinitely so you can scroll back through old games.

## What non-Ratspeak clients see

LRGP messages are still valid LXMF messages, so a contact running Sideband, NomadNet, or any other LXMF client will receive them — they just won't see a board. Instead, the message body shows a fallback line:

- `[LRGP TTT] Move 3` for a Tic-Tac-Toe move.
- `[LRGP Chess] e2e4` for a chess move.

The conversation reads cleanly and nothing is dropped, but interactive game state is lost on that side. Among Ratspeak peers, the board renders normally. As more clients adopt LRGP, the same envelopes will start rendering boards there too — for now, expect cross-client play to fall back to text on the non-Ratspeak end.
