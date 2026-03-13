# Messaging

Sending and receiving encrypted LXMF messages — delivery modes, attachments, search, and status tracking.

## How Messages Work

All messaging in Ratspeak uses **LXMF** (Lightweight Extensible Message Format) over Reticulum. Every message is end-to-end encrypted with forward secrecy. Messages sent from Ratspeak can be received by Sideband, NomadNet, MeshChat, and vice versa.

## Three Delivery Modes

Ratspeak automatically selects the best delivery mode based on message size and recipient availability:

| Mode | When Used | How It Works |
|------|-----------|-------------|
| **Opportunistic** | Short text (<= 200 bytes), no title, no attachments | Sends as a single packet without establishing a link |
| **Direct** | Longer messages, messages with titles, file attachments | Establishes an encrypted link first, then delivers |
| **Propagated** | Recipient offline, manual selection | Routes through a propagation node for store-and-forward |

## Delivery Status

Each message progresses through these states:

1. **Composing** — message is being prepared
2. **Resolving** — looking up the recipient's identity or network path (if not cached)
3. **Routing** — finding a path to the destination
4. **Sent** — transmitted, awaiting delivery proof
5. **Delivered** — delivery confirmed by recipient
6. **Failed** / **Timeout** — delivery unsuccessful (60-second timeout)

## Auto-Resend

When a contact reappears on the network (detected via a new announce), Ratspeak automatically resends up to **5 failed or timed-out messages**. This happens transparently — you'll see the message status change from "failed" to "resending" to "delivered".

## File Attachments

Messages can include file attachments up to **500 KB** per file. Supported attachment types:

- **Files** — any file type (documents, archives, etc.)
- **Images** — inline image display
- **Audio** — opus, ogg, mp3, wav

Attachments are encrypted along with the message and sent via direct link.

## Reactions

You can react to any message with an emoji. Reactions are sent as lightweight LXMF messages and visible to both participants. Click the reaction button on a message to add or remove a reaction. Reaction counts are shown inline on the message.

## Full-Text Search

All messages are indexed with FTS5 (SQLite full-text search). Use the search bar in the Messages view to search across all conversations by message content.

## What's Next

- [Contacts](../using-ratspeak/contacts) — manage contacts and reachability
- [Propagation Node](../using-ratspeak/propagation-node) — set up store-and-forward
- [LXMF Protocol](../understanding/lxmf-protocol) — understand the underlying protocol
