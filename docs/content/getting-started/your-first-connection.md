# Your First Connection

Connect to other Reticulum nodes — on your local network, across the internet, or both at once.

## The Simplest Way: Local WiFi

If another Reticulum user is on the same WiFi or LAN, you don't need to configure anything. Ratspeak's AutoInterface discovers nearby nodes automatically using local network broadcast.

Just start Ratspeak. Within 30-60 seconds, any other Reticulum nodes on your local network appear in the **Dashboard** connections table.

<div class="docs-diagram">
<svg viewBox="0 0 700 160" xmlns="http://www.w3.org/2000/svg" fill="none">
  <defs>
    <marker id="arrowMuted" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto">
      <polygon points="0 0, 7 2.5, 0 5" fill="#7e8fa2"/>
    </marker>
    <marker id="arrowGreenConn" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto">
      <polygon points="0 0, 7 2.5, 0 5" fill="#00D4AA"/>
    </marker>
  </defs>

  <!-- Left node: Your Computer -->
  <rect x="40" y="30" width="140" height="50" rx="12" fill="rgba(0,212,170,0.10)" stroke="#00D4AA" stroke-width="2"/>
  <text x="110" y="52" text-anchor="middle" font-family="Outfit" font-size="13" fill="#00D4AA">Your Computer</text>
  <text x="110" y="68" text-anchor="middle" font-family="JetBrains Mono" font-size="9" fill="#7e8fa2">Ratspeak</text>

  <!-- Right node: Neighbor -->
  <rect x="520" y="30" width="140" height="50" rx="12" fill="rgba(56,189,248,0.10)" stroke="#38BDF8" stroke-width="2"/>
  <text x="590" y="52" text-anchor="middle" font-family="Outfit" font-size="13" fill="#38BDF8">Neighbor</text>
  <text x="590" y="68" text-anchor="middle" font-family="JetBrains Mono" font-size="9" fill="#7e8fa2">Reticulum node</text>

  <!-- Step 1: Multicast discovery (dashed, both directions) -->
  <text x="350" y="20" text-anchor="middle" font-family="Outfit" font-size="10" fill="#7e8fa2">1. Multicast discovery</text>
  <line x1="180" y1="42" x2="515" y2="42" stroke="#7e8fa2" stroke-width="1" stroke-dasharray="4 3" marker-end="url(#arrowMuted)"/>
  <line x1="520" y1="48" x2="185" y2="48" stroke="#7e8fa2" stroke-width="1" stroke-dasharray="4 3" marker-end="url(#arrowMuted)"/>

  <!-- Step 2: Announce exchange (animated green dot traveling right) -->
  <text x="350" y="82" text-anchor="middle" font-family="Outfit" font-size="10" fill="#00D4AA">2. Announce exchange</text>
  <line x1="180" y1="92" x2="510" y2="92" stroke="#00D4AA" stroke-width="1.5" stroke-dasharray="6 3">
    <animate attributeName="stroke-dashoffset" from="18" to="0" dur="1.2s" repeatCount="indefinite"/>
  </line>
  <polygon points="515,92 507,87 507,97" fill="#00D4AA"/>
  <!-- Animated dot -->
  <circle r="4" fill="#00D4AA">
    <animateMotion dur="2s" repeatCount="indefinite" path="M180,92 L510,92"/>
  </circle>

  <!-- Step 3: Path established (solid line) -->
  <text x="350" y="120" text-anchor="middle" font-family="Outfit" font-size="10" fill="#00D4AA">3. Path established</text>
  <line x1="180" y1="130" x2="520" y2="130" stroke="#00D4AA" stroke-width="2"/>
  <circle cx="180" cy="130" r="3" fill="#00D4AA"/>
  <circle cx="520" cy="130" r="3" fill="#00D4AA"/>
  <text x="350" y="148" text-anchor="middle" font-family="JetBrains Mono" font-size="9" fill="#7e8fa2">encrypted traffic can now flow</text>
</svg>
<figcaption>AutoInterface connection flow — zero-config local discovery in three steps</figcaption>
</div>

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

<div class="screenshot-placeholder" data-caption="Add TCP connection dialog showing hostname and port fields">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#7e8fa2" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="12" y1="6" x2="12" y2="18"/><line x1="6" y1="12" x2="18" y2="12"/></svg>
    <div>TCP connection dialog — screenshot coming soon</div>
</div>

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
