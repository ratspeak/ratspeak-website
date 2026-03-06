# Messaging

Sending and receiving encrypted LXMF messages — delivery modes, attachments, search, and status tracking.

## How Messages Work

All messaging in Ratspeak uses **LXMF** (Lightweight Extensible Message Format) over Reticulum. Every message is end-to-end encrypted with forward secrecy. Messages sent from Ratspeak can be received by Sideband, NomadNet, MeshChat, and vice versa.

## Three Delivery Modes

Ratspeak automatically selects the best delivery mode based on message size and recipient availability:

<div class="docs-diagram">
<svg viewBox="0 0 700 280" xmlns="http://www.w3.org/2000/svg" fill="none">
  <!-- Direct -->
  <text x="116" y="20" text-anchor="middle" fill="#00D4AA" font-family="Outfit" font-size="13" font-weight="600">Direct</text>
  <rect x="30" y="35" width="60" height="40" rx="6" stroke="#00D4AA" stroke-width="1" fill="rgba(0,212,170,0.08)"/>
  <text x="60" y="60" text-anchor="middle" fill="#e2e8f0" font-family="Outfit" font-size="10">You</text>
  <line x1="90" y1="55" x2="138" y2="55" stroke="#00D4AA" stroke-width="1.5"/>
  <polygon points="138,51 146,55 138,59" fill="#00D4AA"/>
  <text x="118" y="48" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="8">link</text>
  <rect x="148" y="35" width="60" height="40" rx="6" stroke="#00D4AA" stroke-width="1" fill="rgba(0,212,170,0.08)"/>
  <text x="178" y="60" text-anchor="middle" fill="#e2e8f0" font-family="Outfit" font-size="10">Recipient</text>
  <text x="116" y="95" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Establishes link first</text>
  <text x="116" y="108" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">For long messages + files</text>

  <!-- Opportunistic -->
  <text x="350" y="20" text-anchor="middle" fill="#F59E0B" font-family="Outfit" font-size="13" font-weight="600">Opportunistic</text>
  <rect x="264" y="35" width="60" height="40" rx="6" stroke="#F59E0B" stroke-width="1" fill="rgba(245,158,11,0.08)"/>
  <text x="294" y="60" text-anchor="middle" fill="#e2e8f0" font-family="Outfit" font-size="10">You</text>
  <line x1="324" y1="55" x2="358" y2="55" stroke="#F59E0B" stroke-width="1.5" stroke-dasharray="4 3"/>
  <polygon points="358,51 366,55 358,59" fill="#F59E0B"/>
  <text x="346" y="48" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="8">fire</text>
  <rect x="368" y="35" width="60" height="40" rx="6" stroke="#F59E0B" stroke-width="1" fill="rgba(245,158,11,0.08)"/>
  <text x="398" y="60" text-anchor="middle" fill="#e2e8f0" font-family="Outfit" font-size="10">Recipient</text>
  <text x="350" y="95" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Sends without a link</text>
  <text x="350" y="108" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Short text only (&le; 200 bytes)</text>

  <!-- Propagated -->
  <text x="582" y="20" text-anchor="middle" fill="#C084FC" font-family="Outfit" font-size="13" font-weight="600">Propagated</text>
  <rect x="500" y="35" width="50" height="40" rx="6" stroke="#C084FC" stroke-width="1" fill="rgba(192,132,252,0.08)"/>
  <text x="525" y="60" text-anchor="middle" fill="#e2e8f0" font-family="Outfit" font-size="10">You</text>
  <line x1="550" y1="55" x2="572" y2="55" stroke="#C084FC" stroke-width="1"/>
  <polygon points="572,51 578,55 572,59" fill="#C084FC"/>
  <rect x="580" y="30" width="55" height="50" rx="6" stroke="#C084FC" stroke-width="1.5" fill="rgba(192,132,252,0.12)"/>
  <text x="607" y="52" text-anchor="middle" fill="#C084FC" font-family="JetBrains Mono" font-size="8" font-weight="600">PROP</text>
  <text x="607" y="66" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="8">NODE</text>
  <line x1="635" y1="55" x2="652" y2="55" stroke="#C084FC" stroke-width="1"/>
  <polygon points="652,51 658,55 652,59" fill="#C084FC"/>
  <rect x="660" y="35" width="30" height="40" rx="6" stroke="#C084FC" stroke-width="1" fill="rgba(192,132,252,0.06)" stroke-dasharray="3 2"/>
  <text x="675" y="60" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">?</text>
  <text x="582" y="100" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Store-and-forward</text>
  <text x="582" y="113" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">For offline recipients</text>

  <!-- Animated packets -->
  <circle r="3" fill="#00D4AA" opacity="0.8">
    <animate attributeName="cx" values="60;178" dur="1.5s" repeatCount="indefinite"/>
    <animate attributeName="cy" values="55;55" dur="1.5s" repeatCount="indefinite"/>
  </circle>
  <circle r="3" fill="#F59E0B" opacity="0.8">
    <animate attributeName="cx" values="294;398" dur="1s" repeatCount="indefinite"/>
    <animate attributeName="cy" values="55;55" dur="1s" repeatCount="indefinite"/>
  </circle>
  <circle r="3" fill="#C084FC" opacity="0.8">
    <animate attributeName="cx" values="525;607;607;675" dur="3s" repeatCount="indefinite"/>
    <animate attributeName="cy" values="55;55;55;55" dur="3s" repeatCount="indefinite"/>
  </circle>
</svg>
<figcaption>Three LXMF delivery modes: direct (with link), opportunistic (fire-and-forget), propagated (store-and-forward)</figcaption>
</div>

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

## Full-Text Search

All messages are indexed with FTS5 (SQLite full-text search). Use the search bar in the Messages view to search across all conversations by message content.

## Next Steps

- [Contacts](../using-ratspeak/contacts) — manage contacts and reachability
- [Propagation Node](../using-ratspeak/propagation-node) — set up store-and-forward
- [LXMF Protocol](../understanding/lxmf-protocol) — understand the underlying protocol
