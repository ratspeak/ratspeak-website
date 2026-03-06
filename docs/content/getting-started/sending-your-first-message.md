# Sending Your First Message

Send an encrypted LXMF message through the Reticulum mesh network.

## Adding a Contact

Before you can message someone, you need their **LXMF destination hash** — a 32-character hex string like `13425ec15b621c1d928589718000d814`.

1. Navigate to the **Messages** section
2. Click **New Conversation** or **Add Contact**
3. Paste the recipient's destination hash
4. Optionally set a nickname for the contact

**Testing on your own?** Run a second Ratspeak instance (or Sideband) on the same network. Your second instance's LXMF address appears in its Identity section — copy it and use it as the recipient.

> **Note**: If the recipient has announced on the network and your node has received the announce, they may already appear in your contacts list automatically.

## Composing a Message

1. Select the contact from your conversations list
2. Type your message in the compose area
3. Click **Send**

<div class="screenshot-placeholder">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#7e8fa2" stroke-width="1.5" stroke-linecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
    <div>Messaging view — screenshot placeholder</div>
</div>

## What Happens Behind the Scenes

When you hit Send, Ratspeak performs several steps:

1. **Composing** — the message is prepared and encrypted
2. **Resolving** — the recipient's identity is looked up (if not cached)
3. **Routing** — a path to the destination is found in the path table
4. **Sent** — the encrypted message is transmitted through the mesh
5. **Delivered** — delivery confirmation received (if path allows)

The delivery mode is chosen automatically:

| Condition | Mode | How It Works |
|-----------|------|-------------|
| Short text, no attachments (under ~295 bytes content) | **Opportunistic** | Sent as a single encrypted packet, no link setup |
| Longer messages or attachments | **Direct** | Establishes an encrypted link, then delivers |
| Recipient offline | **Propagated** | Routes through a propagation node for later delivery |

## Delivery Status

Each message shows a status indicator:

- **Sending** — message is being transmitted
- **Sent** — transmitted, awaiting delivery proof
- **Delivered** — recipient confirmed receipt
- **Failed** — delivery failed (recipient unreachable, timeout)
- **Timeout** — no delivery confirmation within 60 seconds

> **Tip**: If a message fails, check that your connection is active and the recipient is reachable. Failed messages are automatically retried when the contact reappears.

## File Attachments

You can attach files (up to 500 KB), images, and audio (Opus, OGG, MP3, WAV). The attachment is encrypted along with the message content and delivered via direct link.

## Next Steps

- [Messaging](../using-ratspeak/messaging) — detailed messaging features
- [Contacts](../using-ratspeak/contacts) — managing contacts and reachability
- [Propagation Node](../using-ratspeak/propagation-node) — store-and-forward for offline contacts
