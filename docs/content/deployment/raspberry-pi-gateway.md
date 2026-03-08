# Raspberry Pi Gateway

Turn a Raspberry Pi into an always-on Reticulum transport node, propagation server, and LoRa gateway — the workhorse of community mesh networks.

## What You'll Build

A headless Raspberry Pi running rnsd that:

- Acts as a transport node (relays packets)
- Runs a propagation node (stores messages for offline users)
- Provides LoRa coverage via an attached RNode
- Accepts TCP connections from remote peers
- Runs 24/7 with minimal power consumption

## Hardware

| Component | Recommended | Notes |
|-----------|-------------|-------|
| **Raspberry Pi** | Pi 4 (2 GB+) or Pi Zero 2 W | Pi Zero 2 W for lowest power |
| **SD Card** | 16 GB+ (Class 10 / A1) | Reliable brand (SanDisk, Samsung) |
| **RNode** | LilyGO T-Beam or Heltec LoRa32 | Flashed with RNode firmware |
| **Antenna** | Collinear omnidirectional | Matched to your frequency band |
| **Power** | Official Pi power supply or PoE HAT | 5V 3A for Pi 4, 5V 2A for Pi Zero |
| **Case** | Weatherproof if outdoor | IP65+ for outdoor deployment |

## Setup

### 1. Install Raspberry Pi OS

Flash **Raspberry Pi OS Lite (64-bit)** to your SD card using Raspberry Pi Imager. Enable SSH and configure WiFi during imaging.

### 2. Install Reticulum

```bash
sudo apt update && sudo apt install -y python3 python3-pip
pip install rns lxmf --break-system-packages
```

### 3. Flash Your RNode

Connect the RNode via USB and flash it:

```bash
rnodeconf --autoinstall
```

Verify:

```bash
rnodeconf -i
```

### 4. Configure Reticulum

Edit `~/.reticulum/config`:

```ini
[reticulum]
  enable_transport = yes
  share_instance = yes
  instance_name = pi-gateway

[logging]
  loglevel = 4

[interfaces]
  [[Default Interface]]
    type = AutoInterface
    interface_enabled = True

  [[LoRa Radio]]
    type = RNodeInterface
    port = /dev/serial/by-id/usb-Silicon_Labs_CP2102N_USB_to_UART-if00-port0
    frequency = 915000000
    bandwidth = 125000
    spreadingfactor = 9
    codingrate = 5
    txpower = 17
    mode = gateway
    enabled = yes

  [[TCP Server]]
    type = TCPServerInterface
    listen_ip = 0.0.0.0
    listen_port = 4242
    enabled = yes
```

> **Tip**: Use `/dev/serial/by-id/...` paths instead of `/dev/ttyUSB0` to avoid port shuffling when multiple USB devices are connected.

### 5. Create systemd Service

Create `/etc/systemd/system/rnsd.service`:

```ini
[Unit]
Description=Reticulum Network Stack Daemon
After=network.target

[Service]
Type=simple
Restart=always
RestartSec=3
User=pi
ExecStart=/home/pi/.local/bin/rnsd --service

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable rnsd
sudo systemctl start rnsd
```

### 6. Open Firewall (If Using TCP)

```bash
sudo ufw allow 4242/tcp
sudo ufw allow 22/tcp
sudo ufw enable
```

### 7. Verify

```bash
sudo systemctl status rnsd
rnstatus
```

You should see your LoRa interface, AutoInterface, and TCP server all active.

## Persistent USB Device Naming

Find your RNode's persistent path:

```bash
ls -la /dev/serial/by-id/
```

Use this path in your config instead of `/dev/ttyUSB0`.

## Monitoring

```bash
# Check interface status
rnstatus

# Check path to a specific destination
rnpath <destination_hash>

# View logs
journalctl -u rnsd -f
```

## Power Optimization (Pi Zero 2 W)

For battery or solar deployments:

- Disable HDMI: `tvservice -o`
- Disable Bluetooth (if not using BLE): add `dtoverlay=disable-bt` to `/boot/config.txt`
- Disable LEDs: add `dtparam=act_led_trigger=none` to `/boot/config.txt`
- Use Pi Zero 2 W (~1W idle vs ~3W for Pi 4)

## What's Next

- [Community Mesh Network](../deployment/community-mesh) — multi-node network design
- [Docker Deployment](../deployment/docker-deployment) — containerized setup
- [Building Networks](../connecting/building-networks) — topology patterns
- [Antennas, Range & Power](../hardware/antennas-range-power) — antenna selection
