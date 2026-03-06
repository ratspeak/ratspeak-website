# Your First Connection

Connect to the Reticulum network — whether that's your local WiFi, a remote TCP node, or a LoRa radio.

## AutoInterface (WiFi / LAN)

The simplest way to connect is via **AutoInterface** — zero-configuration local network discovery (automatically finds other Reticulum nodes on your WiFi or LAN).

1. Open the dashboard at **http://localhost:5050**
2. Navigate to the **Network** section
3. Enable the **AutoInterface** toggle

That's it. Any other Reticulum nodes on the same LAN or WiFi network will be automatically discovered. No IP addresses, no port numbers, no configuration needed.

AutoInterface uses UDP ports **29716** and **42671**. If you have a firewall, ensure these ports allow local traffic.

> **Tip**: AutoInterface works great for testing — run two Ratspeak instances on the same network and they'll find each other automatically.

## TCP Connection

To connect to a remote node over the internet (or any IP network):

1. Navigate to the **Network** section
2. Click **Add Connection**
3. Enter the remote node's **hostname** (or IP address) and **port**
4. Click **Connect**

<div class="screenshot-placeholder">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#7e8fa2" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="12" y1="6" x2="12" y2="18"/><line x1="6" y1="12" x2="18" y2="12"/></svg>
    <div>Add TCP connection modal — screenshot placeholder</div>
</div>

For a list of public nodes, check the Reticulum community resources. You can also connect to any node running a `TCPServerInterface`.

### Connection History

Ratspeak remembers your previous TCP connections. After disconnecting, you can quickly reconnect from the connection history without re-entering the details.

## Verifying Your Connection

Once connected, you should see:

1. The interface appears in the **Connections** table with a green status indicator
2. Within 30-60 seconds, you should see announces arriving from other nodes
3. Your path table beginning to populate

The connections table shows each interface's type, status, and throughput. Hop counts indicate how many transport nodes sit between you and each discovered destination.

## What If Nothing Happens?

If you don't see any other nodes after connecting:

- **AutoInterface**: Ensure both nodes are on the same network segment and UDP ports 29716/42671 aren't blocked
- **TCP**: Verify the hostname/IP and port are correct, and that the remote node is actually running a TCP server interface
- **Firewall**: Check that your firewall allows outbound connections on the specified port
- **Patience**: Announce propagation takes time, especially over slow links. Wait 30-60 seconds

## Next Steps

- [Sending Your First Message](../getting-started/sending-your-first-message) — communicate with another node
- [Interface Types Overview](../connecting/interface-types-overview) — explore all connection options
- [TCP Connections](../connecting/tcp-connections) — detailed TCP configuration
