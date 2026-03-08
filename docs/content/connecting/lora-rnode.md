# LoRa / RNode

Long-range radio communication via RNode devices — frequencies, presets, and configuration.

## What Is RNode?

RNode is an open-source LoRa radio interface for Reticulum. It uses LoRa radio chips with a **custom MAC layer** (not LoRaWAN) for efficient, long-range mesh communication. RNode devices can communicate over distances of 1–50+ km depending on terrain, antenna, and settings.

## Supported Devices

RNode firmware can be installed on various LoRa-capable hardware using:

```bash
rnodeconf --autoinstall
```

This utility detects your hardware and flashes the appropriate firmware.

## LoRa Presets

Ratspeak offers three presets that balance range and speed:

| Preset | Speed | SF | Bandwidth | Coding Rate | TX Power | Best For |
|--------|-------|:--:|:---------:|:-----------:|:--------:|----------|
| **Long Range** | ~37 bps | 12 | 62.5 kHz | 4/8 | 22 dBm | Maximum distance, very low data rate |
| **Balanced** | ~1.8 Kbps | 9 | 125 kHz | 4/5 | 17 dBm | Good range/speed trade-off |
| **Fast** | ~11 Kbps | 7 | 250 kHz | 4/5 | 14 dBm | Shorter range, higher throughput |

<div class="docs-diagram">
<svg viewBox="0 0 600 200" xmlns="http://www.w3.org/2000/svg" fill="none">
  <!-- Axes -->
  <line x1="80" y1="160" x2="560" y2="160" stroke="#3a4759" stroke-width="1"/>
  <line x1="80" y1="30" x2="80" y2="160" stroke="#3a4759" stroke-width="1"/>
  <text x="320" y="190" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="11">Range</text>
  <text x="40" y="95" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="11" transform="rotate(-90,40,95)">Speed</text>

  <!-- Long Range -->
  <circle cx="460" cy="140" r="20" stroke="#00D4AA" stroke-width="1.5" fill="rgba(0,212,170,0.15)"/>
  <text x="460" y="144" text-anchor="middle" fill="#00D4AA" font-family="JetBrains Mono" font-size="8" font-weight="600">LR</text>
  <text x="460" y="120" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">~37 bps</text>

  <!-- Balanced -->
  <circle cx="300" cy="100" r="22" stroke="#F59E0B" stroke-width="1.5" fill="rgba(245,158,11,0.15)"/>
  <text x="300" y="104" text-anchor="middle" fill="#F59E0B" font-family="JetBrains Mono" font-size="8" font-weight="600">BAL</text>
  <text x="300" y="80" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">~1.8 Kbps</text>

  <!-- Fast -->
  <circle cx="160" cy="50" r="18" stroke="#38BDF8" stroke-width="1.5" fill="rgba(56,189,248,0.15)"/>
  <text x="160" y="54" text-anchor="middle" fill="#38BDF8" font-family="JetBrains Mono" font-size="8" font-weight="600">FAST</text>
  <text x="160" y="38" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">~11 Kbps</text>

  <!-- Axis labels -->
  <text x="100" y="155" fill="#7e8fa2" font-family="Outfit" font-size="9">Short</text>
  <text x="530" y="155" fill="#7e8fa2" font-family="Outfit" font-size="9">Long</text>
  <text x="90" y="145" fill="#7e8fa2" font-family="Outfit" font-size="9">Slow</text>
  <text x="90" y="42" fill="#7e8fa2" font-family="Outfit" font-size="9">Fast</text>
</svg>
<figcaption>LoRa presets: trade-off between range and throughput</figcaption>
</div>

## Frequency Regions

Select the frequency band appropriate for your location:

| Region | Label | Frequency Range | Default |
|--------|-------|----------------|---------|
| US 915 | US 915 MHz (ISM) | 902–928 MHz | 915 MHz |
| EU 868 | EU 868 MHz | 863–870 MHz | 868 MHz |
| 433 | 433 MHz | 433–434.8 MHz | 433 MHz |
| CN 470 | CN 470 MHz | 470–510 MHz | 470 MHz |
| AU 915 | AU 915 MHz | 915–928 MHz | 920 MHz |
| KR 920 | KR 920 MHz | 920–923 MHz | 921 MHz |
| IN 865 | IN 865 MHz | 865–867 MHz | 866 MHz |
| JP 920 | JP 920 MHz | 920–928 MHz | 923 MHz |

> **Warning**: Always use the frequency band legal in your jurisdiction. ISM bands are unlicensed but usage rules vary by country.

## LoRa Parameters

For advanced tuning beyond presets:

| Parameter | Range | Description |
|-----------|-------|-------------|
| `frequency` | 137 MHz – 3 GHz | Center frequency in Hz |
| `bandwidth` | 7.8 kHz – 1625 kHz | Channel bandwidth (common: 125k, 250k, 500k) |
| `spreadingfactor` | 5–12 | Higher = more range, lower speed |
| `codingrate` | 5–8 | Error correction level (4/5 to 4/8) |
| `txpower` | 0–22 dBm | Transmit power |

### Available Bandwidths

7.8K, 10.4K, 15.6K, 20.8K, 31.25K, 41.7K, 62.5K, 125K, 250K, 500K (in kHz).

## Connection Methods

RNode can connect via:

- **Serial** — `/dev/ttyUSB0`, `/dev/ttyACM0`, etc.
- **TCP** — `tcp://host:port` (for networked RNode access)
- **BLE** — `ble://device` (Bluetooth connection to RNode)

## Config File Format

```ini
[[LoRa Radio]]
  type = RNodeInterface
  port = /dev/ttyUSB0
  frequency = 915000000
  bandwidth = 125000
  spreadingfactor = 12
  codingrate = 8
  txpower = 17
  enabled = yes
```

## Airtime Limits

LoRa interfaces support airtime limiting to comply with regulations:

| Parameter | Description |
|-----------|-------------|
| `airtime_limit_long` | Long-term airtime percentage limit |
| `airtime_limit_short` | Short-term airtime percentage limit |

## Multi-Transceiver Support

For RNodes with multiple radio transceivers, use `RNodeMultiInterface` with sub-interfaces:

```ini
[[Multi RNode]]
  type = RNodeMultiInterface
  port = /dev/ttyUSB0

  [[[900 MHz Radio]]]
    frequency = 915000000
    bandwidth = 125000
    spreadingfactor = 12
    codingrate = 8
    txpower = 17

  [[[433 MHz Radio]]]
    frequency = 433000000
    bandwidth = 125000
    spreadingfactor = 9
    codingrate = 5
    txpower = 14
```

## What's Next

- [Interface Types Overview](../connecting/interface-types-overview) — compare all interfaces
- [Interface Modes](../connecting/interface-modes) — configure interface behavior
- [Building Networks](../connecting/building-networks) — design your mesh topology
