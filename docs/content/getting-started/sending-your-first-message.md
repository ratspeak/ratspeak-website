# Sending Your First Message

Send your first end-to-end encrypted message across the Reticulum mesh.

## Step 1: Get a Contact's Address

To message someone, you need their **LXMF destination hash** — a 32-character hex string that looks like:

```
13425ec15b621c1d928589718000d814
```

Ask your contact to share their hash from their Ratspeak **Identity** view (or from Sideband, NomadNet, or any other LXMF-compatible app).

> **Tip**: Testing alone? Run a second Ratspeak instance (or Sideband) on the same network. Copy the second instance's LXMF address and use it as your recipient.

## Step 2: Start a Conversation

1. Open the **Messages** view
2. Click **New Conversation**
3. Paste the destination hash
4. Optionally add a display name for the contact
5. Click **Create**

> **Note**: If the recipient has announced on the network, they may already appear in your contacts automatically.

## Step 3: Send a Message

1. Select the conversation
2. Type your message
3. Click **Send** (or press Enter)

## How Delivery Works

Ratspeak chooses the best delivery method automatically:

| Situation | Method | What Happens |
|---|---|---|
| Short message, path exists | **Opportunistic** | Sent as a single encrypted packet — fast, no handshake needed |
| Longer message or file attachment | **Direct** | Establishes an encrypted link first, then delivers reliably |
| Recipient is offline | **Propagated** | Routed through a propagation node for store-and-forward delivery |

## Delivery Status

Watch the status indicator next to each message:

- **Sending** — message is in transit
- **Sent** — transmitted, waiting for confirmation
- **Delivered** — recipient confirmed receipt
- **Failed** — delivery failed after timeout (60 seconds)

If a message fails, Ratspeak retries automatically when the contact reappears on the network.

## Sending Files

Click the attachment icon to send files (up to 500 KB). Supported types include images, documents, and audio. Files are encrypted alongside the message content and delivered via direct link.

## What If They're Offline?

If your contact is not currently connected to the network, your message will fail to deliver — unless you have a **propagation node** enabled. A propagation node stores your message and delivers it when the recipient comes back online.

See [Propagation Nodes](../using-ratspeak/propagation-node) to set one up.

## What's Next

- [Messaging](../using-ratspeak/messaging) — advanced messaging features
- [Managing Contacts](../using-ratspeak/contacts) — contact management and reachability
- [Propagation Nodes](../using-ratspeak/propagation-node) — store-and-forward for offline contacts
