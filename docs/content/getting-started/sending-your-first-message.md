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

<div class="screenshot-placeholder" data-caption="Ratspeak messaging view showing a conversation with sent and received messages, delivery status indicators, and compose area">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#7e8fa2" stroke-width="1.5" stroke-linecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
    <div>Messaging view — screenshot coming soon</div>
</div>

## How Delivery Works

Ratspeak chooses the best delivery method automatically:

| Situation | Method | What Happens |
|---|---|---|
| Short message, path exists | **Opportunistic** | Sent as a single encrypted packet — fast, no handshake needed |
| Longer message or file attachment | **Direct** | Establishes an encrypted link first, then delivers reliably |
| Recipient is offline | **Propagated** | Routed through a propagation node for store-and-forward delivery |

<div class="docs-diagram">
<svg viewBox="0 0 700 120" xmlns="http://www.w3.org/2000/svg" fill="none">
  <defs>
    <marker id="arrowLifecycle" markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto">
      <polygon points="0 0, 6 2.5, 0 5" fill="#7e8fa2"/>
    </marker>
  </defs>

  <!-- Step boxes -->
  <!-- Compose -->
  <rect x="6" y="16" width="80" height="34" rx="8" fill="rgba(0,212,170,0.08)" stroke="#00D4AA" stroke-width="1.5"/>
  <text x="46" y="38" text-anchor="middle" font-family="Outfit" font-size="11" fill="#00D4AA">Compose</text>

  <!-- Arrow -->
  <line x1="86" y1="33" x2="102" y2="33" stroke="#7e8fa2" stroke-width="1" marker-end="url(#arrowLifecycle)"/>

  <!-- Encrypt -->
  <rect x="104" y="16" width="80" height="34" rx="8" fill="rgba(192,132,252,0.10)" stroke="#C084FC" stroke-width="1.5"/>
  <text x="144" y="38" text-anchor="middle" font-family="Outfit" font-size="11" fill="#C084FC">Encrypt</text>

  <!-- Arrow -->
  <line x1="184" y1="33" x2="200" y2="33" stroke="#7e8fa2" stroke-width="1" marker-end="url(#arrowLifecycle)"/>

  <!-- Queue -->
  <rect x="202" y="16" width="72" height="34" rx="8" fill="rgba(126,143,162,0.08)" stroke="#7e8fa2" stroke-width="1.5"/>
  <text x="238" y="38" text-anchor="middle" font-family="Outfit" font-size="11" fill="#e0e6ed">Queue</text>

  <!-- Arrow -->
  <line x1="274" y1="33" x2="290" y2="33" stroke="#7e8fa2" stroke-width="1" marker-end="url(#arrowLifecycle)"/>

  <!-- Route -->
  <rect x="292" y="16" width="80" height="34" rx="8" fill="rgba(245,158,11,0.10)" stroke="#F59E0B" stroke-width="1.5"/>
  <text x="332" y="38" text-anchor="middle" font-family="Outfit" font-size="11" fill="#F59E0B">Route</text>

  <!-- Arrow -->
  <line x1="372" y1="33" x2="388" y2="33" stroke="#7e8fa2" stroke-width="1" marker-end="url(#arrowLifecycle)"/>

  <!-- Deliver -->
  <rect x="390" y="16" width="80" height="34" rx="8" fill="rgba(0,212,170,0.08)" stroke="#00D4AA" stroke-width="1.5"/>
  <text x="430" y="38" text-anchor="middle" font-family="Outfit" font-size="11" fill="#00D4AA">Deliver</text>

  <!-- Arrow -->
  <line x1="470" y1="33" x2="486" y2="33" stroke="#7e8fa2" stroke-width="1" marker-end="url(#arrowLifecycle)"/>

  <!-- Decrypt -->
  <rect x="488" y="16" width="80" height="34" rx="8" fill="rgba(192,132,252,0.10)" stroke="#C084FC" stroke-width="1.5"/>
  <text x="528" y="38" text-anchor="middle" font-family="Outfit" font-size="11" fill="#C084FC">Decrypt</text>

  <!-- Arrow -->
  <line x1="568" y1="33" x2="584" y2="33" stroke="#7e8fa2" stroke-width="1" marker-end="url(#arrowLifecycle)"/>

  <!-- Display -->
  <rect x="586" y="16" width="80" height="34" rx="8" fill="rgba(56,189,248,0.08)" stroke="#38BDF8" stroke-width="1.5"/>
  <text x="626" y="38" text-anchor="middle" font-family="Outfit" font-size="11" fill="#38BDF8">Display</text>

  <!-- Animated dot traveling the path -->
  <circle r="4" fill="#00D4AA" opacity="0.9">
    <animateMotion dur="4s" repeatCount="indefinite" path="M46,33 L144,33 L238,33 L332,33 L430,33 L528,33 L626,33"/>
  </circle>

  <!-- Status labels below -->
  <text x="190" y="76" text-anchor="middle" font-family="JetBrains Mono" font-size="10" fill="#F59E0B">pending</text>
  <line x1="224" y1="72" x2="270" y2="72" stroke="#7e8fa2" stroke-width="0.8" stroke-dasharray="3 2"/>
  <text x="332" y="76" text-anchor="middle" font-family="JetBrains Mono" font-size="10" fill="#00D4AA">sent</text>
  <line x1="358" y1="72" x2="396" y2="72" stroke="#7e8fa2" stroke-width="0.8" stroke-dasharray="3 2"/>
  <text x="480" y="76" text-anchor="middle" font-family="JetBrains Mono" font-size="10" fill="#38BDF8">delivered</text>

  <!-- Bracket lines connecting status to steps -->
  <line x1="104" y1="56" x2="104" y2="64" stroke="#7e8fa2" stroke-width="0.5"/>
  <line x1="274" y1="56" x2="274" y2="64" stroke="#7e8fa2" stroke-width="0.5"/>
  <line x1="104" y1="64" x2="274" y2="64" stroke="#7e8fa2" stroke-width="0.5"/>
  <line x1="190" y1="64" x2="190" y2="69" stroke="#F59E0B" stroke-width="0.8"/>

  <line x1="292" y1="56" x2="292" y2="64" stroke="#7e8fa2" stroke-width="0.5"/>
  <line x1="372" y1="56" x2="372" y2="64" stroke="#7e8fa2" stroke-width="0.5"/>
  <line x1="292" y1="64" x2="372" y2="64" stroke="#7e8fa2" stroke-width="0.5"/>
  <line x1="332" y1="64" x2="332" y2="69" stroke="#00D4AA" stroke-width="0.8"/>

  <line x1="390" y1="56" x2="390" y2="64" stroke="#7e8fa2" stroke-width="0.5"/>
  <line x1="568" y1="56" x2="568" y2="64" stroke="#7e8fa2" stroke-width="0.5"/>
  <line x1="390" y1="64" x2="568" y2="64" stroke="#7e8fa2" stroke-width="0.5"/>
  <line x1="480" y1="64" x2="480" y2="69" stroke="#38BDF8" stroke-width="0.8"/>

  <!-- Sender / Recipient labels -->
  <text x="46" y="104" text-anchor="middle" font-family="Outfit" font-size="9" fill="#7e8fa2">Sender</text>
  <line x1="46" y1="96" x2="46" y2="54" stroke="#7e8fa2" stroke-width="0.5" stroke-dasharray="2 2"/>
  <text x="626" y="104" text-anchor="middle" font-family="Outfit" font-size="9" fill="#7e8fa2">Recipient</text>
  <line x1="626" y1="96" x2="626" y2="54" stroke="#7e8fa2" stroke-width="0.5" stroke-dasharray="2 2"/>
</svg>
<figcaption>Message lifecycle — from composition through encryption, routing, and delivery</figcaption>
</div>

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
