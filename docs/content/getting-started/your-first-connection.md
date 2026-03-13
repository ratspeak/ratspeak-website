# Your First Connection

Connect to other Reticulum nodes — on your local network, across the internet, or both at once.

## The Simplest Way: Local WiFi

If another Reticulum user is on the same WiFi or LAN, you don't need to configure anything. Ratspeak's AutoInterface discovers nearby nodes automatically using local network broadcast.

Just start Ratspeak. Within 30-60 seconds, any other Reticulum nodes on your local network appear in the **Dashboard** connections table.

> **Tip**: Great for testing — run two Ratspeak instances on the same WiFi network and they find each other automatically.

AutoInterface uses UDP ports **29716** and **42671**. If you have a firewall, allow local traffic on these ports.

## Connecting Over the Internet: TCP

To reach someone on a different network:

1. Open the **Settings** view
2. Click **Add TCP Connection**
3. Enter the remote node's hostname (or IP address) and port
4. Click **Connect**

```
Example:
  Host: amsterdam.connect.reticulum.network
  Port: 4251
```

Ratspeak remembers your connections, so you can quickly reconnect after a restart.

> **Info**: Public Reticulum hubs exist for bootstrapping connectivity. Check the Reticulum community resources for current addresses, or set up your own — see [Friend Group Chat Network](../deployment/friend-group-chat).

## What to Expect

After connecting, give the network a moment to propagate:

1. Your interface appears in the connections table with a status indicator
2. Within 30-60 seconds, announces from other nodes start arriving
3. Destination hashes appear in the connections table with hop counts

Hop counts tell you how many relay nodes sit between you and each destination. Lower means closer.

## Both at Once

You can run WiFi discovery and TCP connections simultaneously. Ratspeak transparently routes traffic across all active interfaces — a message might travel over LoRa to a transport node, then hop over TCP to its destination.

## Troubleshooting

**No nodes appearing on local WiFi?**
- Both devices must be on the same network segment
- Check that UDP ports 29716 and 42671 are not blocked
- Some corporate/hotel networks block multicast traffic

**TCP connection failing?**
- Verify the hostname and port are correct
- Check your firewall allows outbound TCP on that port
- Confirm the remote node is running a TCPServerInterface

**Nothing after 60 seconds?**
- Announces propagate slowly over low-bandwidth links — be patient
- Try connecting to a public hub first to verify your setup works

## What's Next

- [Sending Your First Message](../getting-started/sending-your-first-message) — send an encrypted message
- [Interface Types Overview](../connecting/interface-types-overview) — explore all connection options
- [TCP Connections](../connecting/tcp-connections) — advanced TCP configuration
