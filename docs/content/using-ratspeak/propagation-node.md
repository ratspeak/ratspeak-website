# Propagation Node

Store-and-forward messaging for offline contacts — how propagation nodes work and how to use them in Ratspeak.

## What Is a Propagation Node?

A propagation node stores encrypted messages for recipients who are currently offline. When the recipient comes back online and syncs with the propagation node, their stored messages are delivered.

This is essential for **delay-tolerant networks** where participants aren't always connected — which is common in LoRa meshes, intermittent internet access, and mobile setups.

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
