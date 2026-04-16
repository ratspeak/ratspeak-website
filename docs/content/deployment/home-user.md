# Home User Setup

The simplest deployment — running Ratspeak on your personal computer for encrypted messaging over WiFi, internet, and optional LoRa radio.

## What You'll Build

A single Ratspeak node on your desktop or laptop that:

- Discovers peers on your local network automatically (AutoInterface)
- Connects to remote friends over the internet (TCP)
- Optionally adds long-range radio with an RNode

This is the starting point for most users. You can grow from here into more complex setups.

## Prerequisites

- A computer running macOS, Linux, or Windows (WSL)
- Ratspeak installed ([Python](../getting-started/installing-python) or [Rust](../getting-started/installing-rust))
- Internet connection (for TCP connections to remote peers)

## Step 1: Start Ratspeak

```bash
cd ratspeak
./start.sh
```

Open your browser to `http://localhost:5050`. The dashboard loads with a fresh identity.

## Step 2: Local Network Discovery

AutoInterface is enabled by default. Any other Reticulum node on your WiFi or LAN will be discovered automatically — no configuration needed.

If you have a friend on the same WiFi, they'll appear in your connections table within seconds.

## Step 3: Connect to Remote Peers

To reach friends over the internet:

1. Navigate to the **Network** section
2. Click **Add Connection**
3. Enter a hostname and port (e.g., `dublin.connect.reticulum.network:4965`)
4. Click **Connect**

You're now connected to the wider Reticulum network.

> **Tip**: Your friend can run a TCP server on their end, or you can both connect to a shared community node. See [Friend Group Chat Network](../deployment/friend-group-chat) for setting up your own.

## Step 4: Add LoRa (Optional)

If you have an [RNode](../hardware/rnode-overview):

1. Plug it in via USB
2. Navigate to the **Network** section
3. Click **Add LoRa Radio**
4. Select the serial port and a preset (Long Fast is the Ratspeak default and a good start; Medium Fast if you want more throughput and can accept less range)
5. Click **Connect**

You now have off-grid radio capability alongside your internet connections.

## Step 5: Share Your Address

Give friends your **LXMF destination hash** (visible on the Identity tab). They add it as a contact, and you can exchange encrypted messages.

## Recommended Settings

| Setting | Value | Why |
|---------|-------|-----|
| Transport mode | Off | Home users don't need to relay traffic |
| Propagation node | Set to a community node | Receive messages when offline |
| AutoInterface | Enabled | Discover local peers |

## What's Next

- [Friend Group Chat Network](../deployment/friend-group-chat) — set up a shared server for your group
- [Your First Connection](../getting-started/your-first-connection) — detailed connection walkthrough
- [Sending Your First Message](../getting-started/sending-your-first-message) — messaging tutorial
- [Configuration](../using-ratspeak/configuration) — customize settings
