# I2P Anonymous Networking

Connect Reticulum instances over the Invisible Internet Project (I2P) — anonymous, censorship-resistant networking without exposing IP addresses.

## What Is I2P?

I2P (Invisible Internet Project) is an anonymous overlay network. Unlike direct TCP connections where both sides know each other's IP address, I2P routes traffic through encrypted tunnels so that neither endpoint can identify the other's real network location.

## Why Use I2P with Reticulum?

I2P is valuable when:

- **You don't have a public IP** — I2P works behind NAT, firewalls, and CGNAT without port forwarding
- **Your IP changes frequently** — I2P destinations are persistent even when your real IP changes
- **You need anonymity** — I2P hides your real IP from peers and network observers
- **You're behind restrictive firewalls** — I2P can tunnel through many firewall configurations

<div class="docs-diagram">
<svg viewBox="0 0 700 200" xmlns="http://www.w3.org/2000/svg" fill="none">
  <!-- Node A -->
  <rect x="20" y="60" width="100" height="50" rx="8" stroke="#00D4AA" stroke-width="1.5" fill="rgba(0,212,170,0.08)"/>
  <text x="70" y="82" text-anchor="middle" fill="#00D4AA" font-family="JetBrains Mono" font-size="11" font-weight="600">Node A</text>
  <text x="70" y="98" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">IP hidden</text>

  <!-- Arrow to I2P cloud -->
  <line x1="120" y1="85" x2="190" y2="85" stroke="#C084FC" stroke-width="1.5"/>
  <polygon points="190,81 198,85 190,89" fill="#C084FC"/>

  <!-- I2P cloud -->
  <rect x="200" y="40" width="300" height="90" rx="20" stroke="#C084FC" stroke-width="2" fill="rgba(192,132,252,0.06)"/>
  <text x="350" y="68" text-anchor="middle" fill="#C084FC" font-family="JetBrains Mono" font-size="14" font-weight="600">I2P Network</text>
  <text x="350" y="88" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="10">Encrypted multi-hop tunnels</text>
  <text x="350" y="106" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Neither side knows the other's IP</text>

  <!-- Animated packet -->
  <circle r="3" fill="#C084FC" opacity="0.8">
    <animate attributeName="cx" values="130;500" dur="2.5s" repeatCount="indefinite"/>
    <animate attributeName="cy" values="85;85" dur="2.5s" repeatCount="indefinite"/>
  </circle>

  <!-- Arrow to Node B -->
  <line x1="500" y1="85" x2="570" y2="85" stroke="#C084FC" stroke-width="1.5"/>
  <polygon points="570,81 578,85 570,89" fill="#C084FC"/>

  <!-- Node B -->
  <rect x="580" y="60" width="100" height="50" rx="8" stroke="#38BDF8" stroke-width="1.5" fill="rgba(56,189,248,0.08)"/>
  <text x="630" y="82" text-anchor="middle" fill="#38BDF8" font-family="JetBrains Mono" font-size="11" font-weight="600">Node B</text>
  <text x="630" y="98" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">IP hidden</text>

  <!-- Caption -->
  <text x="350" y="170" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="11" font-style="italic">I2P provides anonymous transport — Reticulum handles encryption and routing on top</text>
</svg>
<figcaption>Reticulum traffic routed through I2P's anonymous tunnel network</figcaption>
</div>

> **Note**: Reticulum already encrypts all traffic end-to-end. I2P adds an additional layer of **transport anonymity** — hiding *who* is communicating, not just *what* they're saying.

## Prerequisites

You need the **i2pd** daemon (the C++ I2P implementation) running on your system.

### Installing i2pd

```bash
# Debian / Ubuntu
sudo apt install i2pd

# macOS (Homebrew)
brew install i2pd

# Arch Linux
sudo pacman -S i2pd
```

Start the daemon:

```bash
sudo systemctl enable --now i2pd   # Linux (systemd)
brew services start i2pd            # macOS
```

Verify it's running by checking the I2P router console at `http://127.0.0.1:7070`.

## Basic Configuration

### Simple I2P Interface

The simplest configuration creates an I2P destination and connects to known peers:

```ini
[[I2P]]
  type = I2PInterface
  enabled = yes
  connectable = yes
```

On first start, Reticulum generates a new I2P destination address (a long `.b32.i2p` address). This process takes time as the I2P router builds tunnels — expect a few minutes before the interface is ready.

### Adding Peers

To connect to specific I2P peers, add their `.b32.i2p` addresses:

```ini
[[I2P]]
  type = I2PInterface
  enabled = yes
  connectable = yes
  peers = 5urvjicpzi7q3ybztsef4i5ow2aq4soktfj7zedz53s47r54jnqq.b32.i2p
```

Multiple peers can be specified as a comma-separated list.

### Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `connectable` | `no` | Accept incoming connections from other I2P peers |
| `peers` | *(none)* | Comma-separated list of `.b32.i2p` peer addresses |

## TCP Server over I2P

You can also tunnel a standard TCP server through I2P. This lets non-I2P-native Reticulum clients connect through an I2P tunnel:

```ini
[[TCP Server on I2P]]
  type = TCPServerInterface
  enabled = yes
  listen_ip = 127.0.0.1
  listen_port = 5001
  i2p_tunneled = yes
```

The `i2p_tunneled = yes` flag tells Reticulum to handle I2P-specific connection behavior (timeouts, reconnection logic).

## Performance Considerations

I2P adds latency due to multi-hop routing through the overlay network:

| Aspect | Impact |
|--------|--------|
| **Latency** | Higher than direct TCP — typically 1–5 seconds per hop through I2P |
| **Throughput** | Lower than direct TCP — I2P tunnel bandwidth is shared |
| **Startup time** | Several minutes on first run as I2P builds tunnels |
| **Reliability** | Good once tunnels are established — I2P handles tunnel rotation |

For real-time messaging, I2P adds noticeable delay. For store-and-forward messaging via propagation nodes, the delay is typically insignificant.

## Comparison: I2P vs Direct TCP

| Feature | Direct TCP | I2P |
|---------|-----------|-----|
| **Speed** | Fast (direct connection) | Slower (multi-hop tunnels) |
| **IP privacy** | Both sides see IP addresses | IP addresses hidden |
| **NAT/firewall** | Requires port forwarding | Works behind NAT |
| **Availability** | Depends on public IP | Works with any internet connection |
| **Setup** | Minimal | Requires i2pd daemon |

## Security Notes

- I2P protects **transport-layer** identity (IP addresses). Reticulum already protects **application-layer** identity and message content.
- Using I2P does not change Reticulum's cryptographic properties — all the same encryption, signing, and forward secrecy apply.
- I2P peers know each other by `.b32.i2p` addresses, not by IP. Your Reticulum destination hash is separate from your I2P address.

## What's Next

- [Interface Types Overview](../connecting/interface-types-overview) — compare all interfaces
- [TCP Connections](../connecting/tcp-connections) — direct TCP alternative
- [Interface Modes](../connecting/interface-modes) — configure interface behavior
- [Building Networks](../connecting/building-networks) — network topology strategies
