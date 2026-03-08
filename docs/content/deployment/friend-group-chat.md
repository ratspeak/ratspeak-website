# Friend Group Chat Network

Set up a shared Reticulum node on a VPS so your friend group can message each other from anywhere — no port forwarding, no dynamic DNS, always online.

## What You'll Build

A central transport node on a VPS (Virtual Private Server) that:

- Runs 24/7 on a cheap cloud server
- Accepts TCP connections from your friends
- Relays messages between connected nodes
- Stores messages for offline friends (propagation node)
- Requires no special networking on the client side

<div class="docs-diagram">
<svg viewBox="0 0 700 220" xmlns="http://www.w3.org/2000/svg" fill="none">
  <!-- VPS -->
  <rect x="260" y="30" width="180" height="80" rx="10" stroke="#00D4AA" stroke-width="2" fill="rgba(0,212,170,0.10)"/>
  <text x="350" y="58" text-anchor="middle" fill="#00D4AA" font-family="JetBrains Mono" font-size="13" font-weight="600">VPS Hub</text>
  <text x="350" y="76" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Transport + Propagation</text>
  <text x="350" y="92" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">TCP Server :4242</text>

  <!-- Friends -->
  <rect x="20" y="150" width="100" height="50" rx="8" stroke="#38BDF8" stroke-width="1.5" fill="rgba(56,189,248,0.08)"/>
  <text x="70" y="178" text-anchor="middle" fill="#38BDF8" font-family="Outfit" font-size="10">Alice</text>

  <rect x="170" y="150" width="100" height="50" rx="8" stroke="#F59E0B" stroke-width="1.5" fill="rgba(245,158,11,0.08)"/>
  <text x="220" y="178" text-anchor="middle" fill="#F59E0B" font-family="Outfit" font-size="10">Bob</text>

  <rect x="430" y="150" width="100" height="50" rx="8" stroke="#C084FC" stroke-width="1.5" fill="rgba(192,132,252,0.08)"/>
  <text x="480" y="178" text-anchor="middle" fill="#C084FC" font-family="Outfit" font-size="10">Charlie</text>

  <rect x="580" y="150" width="100" height="50" rx="8" stroke="#FF6B6B" stroke-width="1.5" fill="rgba(255,107,107,0.08)"/>
  <text x="630" y="178" text-anchor="middle" fill="#FF6B6B" font-family="Outfit" font-size="10">Dana</text>

  <!-- Connections -->
  <line x1="70" y1="150" x2="300" y2="110" stroke="#3a4759" stroke-width="1"/>
  <line x1="220" y1="150" x2="330" y2="110" stroke="#3a4759" stroke-width="1"/>
  <line x1="480" y1="150" x2="380" y2="110" stroke="#3a4759" stroke-width="1"/>
  <line x1="630" y1="150" x2="400" y2="110" stroke="#3a4759" stroke-width="1"/>

  <text x="350" y="210" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="11" font-style="italic">Everyone connects to the VPS — messages relay through it automatically</text>
</svg>
<figcaption>Star topology with a VPS hub — the simplest multi-user deployment</figcaption>
</div>

## Prerequisites

- A VPS running Ubuntu 22.04+ or Debian 12+ ($5–10/month from any provider)
- SSH access to the VPS
- Basic command-line familiarity

## Server Setup

### 1. Install Reticulum

```bash
ssh your-vps-ip
sudo apt update && sudo apt install -y python3 python3-pip
pip install rns --break-system-packages
```

### 2. Configure the Node

Edit `~/.reticulum/config` (created on first run of `rnsd`):

```ini
[reticulum]
  enable_transport = yes
  share_instance = yes
  instance_name = friend-hub

[logging]
  loglevel = 4

[interfaces]
  [[Default Interface]]
    type = AutoInterface
    interface_enabled = True

  [[TCP Server]]
    type = TCPServerInterface
    enabled = yes
    listen_ip = 0.0.0.0
    listen_port = 4242
```

### 3. Enable Propagation

Install LXMF and enable propagation so offline friends receive messages later:

```bash
pip install lxmf --break-system-packages
```

The propagation node stores encrypted messages for recipients who are offline and delivers them when they reconnect.

### 4. Open the Firewall

```bash
sudo ufw allow 4242/tcp
sudo ufw allow 22/tcp
sudo ufw enable
```

### 5. Create a systemd Service

Create `/etc/systemd/system/rnsd.service`:

```ini
[Unit]
Description=Reticulum Network Stack Daemon
After=network.target

[Service]
Type=simple
Restart=always
RestartSec=3
User=YOUR_USERNAME
ExecStart=/home/YOUR_USERNAME/.local/bin/rnsd --service

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable rnsd
sudo systemctl start rnsd
```

Verify it's running:

```bash
sudo systemctl status rnsd
```

### 6. Get the Propagation Node Hash

```bash
rnstatus
```

Note the identity hash — your friends will configure this as their propagation node.

## Client Setup (For Each Friend)

Each friend adds a TCP connection to your VPS:

### Via Ratspeak UI

1. Navigate to **Network**
2. Click **Add Connection**
3. Enter your VPS hostname/IP and port `4242`
4. Click **Connect**

### Via Config File

Add to their Reticulum config:

```ini
[[Friend Hub]]
  type = TCPClientInterface
  target_host = your-vps-ip-or-hostname
  target_port = 4242
  enabled = yes
```

### Set Propagation Node

In Ratspeak **Settings**, enter the hub's propagation node hash. Now messages sent while a friend is offline will be stored on the VPS and delivered when they reconnect.

## Security Notes

- All messages are **end-to-end encrypted** — the VPS cannot read them
- The VPS sees destination hashes but not message content or sender identity
- Transport nodes forward packets but cannot decrypt or forge them
- For additional privacy, consider running the VPS through I2P (see [I2P Networking](../connecting/i2p-networking))

## Monitoring

Check node status from the server:

```bash
rnstatus           # Interface status and path count
rnpath <hash>      # Check path to specific destination
```

## What's Next

- [Community Mesh Network](../deployment/community-mesh) — scale up to a neighborhood
- [Home User Setup](../deployment/home-user) — single-user basics
- [TCP Connections](../connecting/tcp-connections) — TCP configuration details
- [Propagation Nodes](../using-ratspeak/propagation-node) — propagation node management
