# Propagation Node

Store-and-forward messaging for offline contacts — how propagation nodes work and how to use them in Ratspeak.

## What Is a Propagation Node?

A propagation node stores encrypted messages for recipients who are currently offline. When the recipient comes back online and syncs with the propagation node, their stored messages are delivered.

This is essential for **delay-tolerant networks** where participants aren't always connected — which is common in LoRa meshes, intermittent internet access, and mobile setups.

<div class="docs-diagram">
<svg viewBox="0 0 680 170" xmlns="http://www.w3.org/2000/svg" fill="none">
  <!-- Sender -->
  <rect x="20" y="50" width="80" height="50" rx="8" stroke="#00D4AA" stroke-width="1.5" fill="rgba(0,212,170,0.08)"/>
  <text x="60" y="72" text-anchor="middle" fill="#00D4AA" font-family="JetBrains Mono" font-size="11" font-weight="600">Sender</text>
  <text x="60" y="88" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">online</text>

  <!-- Arrow to prop node -->
  <line x1="100" y1="75" x2="180" y2="75" stroke="#00D4AA" stroke-width="1.5"/>
  <polygon points="180,71 188,75 180,79" fill="#00D4AA"/>
  <text x="145" y="68" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">1. send</text>

  <!-- Prop Node -->
  <rect x="190" y="35" width="120" height="80" rx="10" stroke="#C084FC" stroke-width="2" fill="rgba(192,132,252,0.10)"/>
  <text x="250" y="62" text-anchor="middle" fill="#C084FC" font-family="JetBrains Mono" font-size="12" font-weight="600">Propagation</text>
  <text x="250" y="78" text-anchor="middle" fill="#C084FC" font-family="JetBrains Mono" font-size="12" font-weight="600">Node</text>
  <text x="250" y="100" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">2. stores message</text>

  <!-- Time passes -->
  <text x="385" y="60" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="10" font-style="italic">time passes...</text>
  <line x1="340" y1="75" x2="430" y2="75" stroke="#3a4759" stroke-width="1" stroke-dasharray="6 4"/>

  <!-- Recipient comes online -->
  <rect x="440" y="50" width="80" height="50" rx="8" stroke="#38BDF8" stroke-width="1.5" fill="rgba(56,189,248,0.08)"/>
  <text x="480" y="72" text-anchor="middle" fill="#38BDF8" font-family="JetBrains Mono" font-size="11" font-weight="600">Recipient</text>
  <text x="480" y="88" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">comes online</text>

  <!-- Sync arrow -->
  <line x1="480" y1="50" x2="480" y2="30" stroke="#38BDF8" stroke-width="1" stroke-dasharray="3 2"/>
  <line x1="480" y1="30" x2="310" y2="30" stroke="#38BDF8" stroke-width="1"/>
  <polygon points="314,26 306,30 314,34" fill="#38BDF8"/>
  <text x="395" y="24" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">3. sync request</text>

  <!-- Delivery arrow -->
  <line x1="310" y1="90" x2="440" y2="90" stroke="#C084FC" stroke-width="1.5"/>
  <polygon points="440,86 448,90 440,94" fill="#C084FC"/>
  <text x="375" y="84" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">4. delivers stored messages</text>

  <!-- Caption -->
  <text x="340" y="155" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="11" font-style="italic">Store-and-forward: messages wait for the recipient to come online</text>
</svg>
<figcaption>Store-and-forward: messages wait for the recipient to come online</figcaption>
</div>

## Running a Local Propagation Node

You can run your own propagation node from Ratspeak:

1. Navigate to **Settings**
2. Find the **Propagation Node** section
3. Toggle **Enable Propagation** on

Once enabled, your node will accept and store messages for other destinations on the network. Other LXMF clients can configure your node as their propagation server.

## Setting an Outbound Propagation Node

To send messages through a propagation node (for recipients who are offline):

1. Navigate to **Settings**
2. Enter the **propagation node's destination hash**
3. Save the setting

Messages that can't be delivered directly will be routed through this propagation node for store-and-forward delivery.

The propagation node setting is saved **per-identity** — different identities can use different propagation nodes.

## Syncing Messages

To retrieve messages stored at a propagation node:

1. Navigate to **Settings** or **Messages**
2. Click **Sync from Propagation Node**

This requests all stored messages from your configured propagation node. Syncing establishes a link to the propagation node and downloads all pending messages for your current identity. If no messages are stored, the sync completes immediately. Messages arrive through the normal delivery pipeline and appear in your conversations.

## Propagation Status

The propagation status view shows:

- Whether propagation is enabled locally
- The configured outbound propagation node (if any)
- Number of messages stored (if running as a propagation node)

## What's Next

- [Messaging](../using-ratspeak/messaging) — message delivery modes
- [LXMF Protocol](../understanding/lxmf-protocol) — protocol-level details
- [Building Networks](../connecting/building-networks) — network architecture considerations
