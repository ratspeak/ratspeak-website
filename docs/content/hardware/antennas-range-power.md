# Antennas, Range & Power

Choosing antennas, understanding range expectations, and configuring transmit power for your LoRa setup.

## Antennas

The antenna is the single most important factor for LoRa range. A better antenna improves both transmit distance and receive sensitivity.

### Antenna Types

| Type | Gain | Pattern | Best For |
|------|------|---------|----------|
| **Stub / rubber duck** | 0–2 dBi | Omnidirectional | Included with boards, basic testing |
| **1/4 wave ground plane** | 2–3 dBi | Omnidirectional | Fixed stations, simple to build |
| **Collinear** | 5–8 dBi | Omnidirectional | Fixed stations, best all-around coverage |
| **Yagi** | 8–15 dBi | Directional | Point-to-point links, maximum range |
| **Dipole** | 2 dBi | Omnidirectional | Compact, good for indoor/portable |

### Frequency Matching

Your antenna must be tuned for your operating frequency:

| Band | Antenna Label |
|------|--------------|
| 433 MHz | 433 MHz antenna |
| 868 MHz | 868 MHz or 900 MHz antenna |
| 915 MHz | 915 MHz or 900 MHz antenna |

> **Warning**: Never transmit without an antenna connected. Operating a LoRa radio with no antenna (or a mismatched antenna) can damage the radio module permanently.

### Connectors

Most RNode-compatible boards use **SMA** or **U.FL/IPEX** connectors:

- **SMA** — larger, threaded, more durable. Common on T-Beam, LoRa32
- **U.FL / IPEX** — tiny snap-on connector. Found on some smaller boards. Use a U.FL-to-SMA pigtail for external antennas

## Range Expectations

LoRa range varies dramatically based on terrain, antenna height, and radio settings:

| Scenario | Typical Range | Notes |
|----------|--------------|-------|
| **Urban, indoor** | 0.5–2 km | Buildings absorb signal heavily |
| **Urban, rooftop** | 2–10 km | Line-of-sight helps significantly |
| **Suburban** | 5–15 km | Mix of clear and obstructed paths |
| **Rural, flat terrain** | 10–30 km | Near line-of-sight |
| **Hilltop to hilltop** | 20–50+ km | Clear line-of-sight, elevation advantage |
| **Mountain peak** | 50–100+ km | Extreme range with directional antennas |

### Factors That Affect Range

**Improve range:**
- Higher antenna placement (elevation is king)
- Higher-gain antenna
- Higher spreading factor (SF12 vs SF7)
- Lower bandwidth (125 kHz vs 500 kHz)
- Higher TX power
- Clear line-of-sight

**Reduce range:**
- Buildings, trees, terrain between nodes
- Indoor placement
- Lower spreading factor (faster but shorter range)
- Wider bandwidth
- Antenna mismatched to frequency

## Transmit Power

TX power is set in dBm (decibels relative to 1 milliwatt):

| dBm | Milliwatts | Use Case |
|-----|-----------|----------|
| 2 | 1.6 mW | Very short range, battery saving |
| 7 | 5 mW | Short range, low power |
| 10 | 10 mW | Moderate range |
| 14 | 25 mW | Good balance (Balanced preset) |
| 17 | 50 mW | Long range (Long Range preset) |
| 20 | 100 mW | Near maximum |
| 22 | 160 mW | Maximum for most boards |

> **Note**: Doubling TX power only adds ~3 dB (marginally more range). Improving your antenna or raising its height is almost always more effective than increasing power.

## Regulatory Compliance

LoRa operates on **ISM bands** (Industrial, Scientific, Medical) — unlicensed but regulated:

| Region | Band | Key Rules |
|--------|------|-----------|
| **US (FCC)** | 915 MHz | No duty cycle limit, max 1W EIRP |
| **EU (ETSI)** | 868 MHz | Duty cycle: 1.5% long-term, 33% short-term |
| **EU** | 433 MHz | Duty cycle limits apply |

For EU 868 MHz, configure airtime limits in the RNode config:

```ini
airtime_limit_long = 1.5
airtime_limit_short = 33
```

Reticulum enforces these limits automatically when configured.

> **Warning**: Always verify the legal frequency band and power limits for your country before transmitting. ISM bands are unlicensed but usage rules vary.

## Optimizing Your Setup

### For Maximum Range
- Use a **collinear or Yagi antenna** mounted as high as possible
- Set **SF12, 62.5 kHz bandwidth, coding rate 4/8** (Long Range preset)
- Set **TX power to maximum legal limit**
- Ensure clear line-of-sight to target

### For Best Throughput
- Use **SF7, 250 kHz bandwidth, coding rate 4/5** (Fast preset)
- Accept shorter range in exchange for ~11 Kbps
- Good for local networks where range isn't critical

### For Battery Life
- Use **lowest TX power that maintains connection**
- Consider **SF9 Balanced preset** as a compromise
- Enable WiFi OFF mode on RatDeck/RatCom when not needed

## What's Next

- [LoRa with RNode](../connecting/lora-rnode) — configure LoRa parameters in detail
- [Supported Boards](../hardware/supported-boards) — hardware options
- [Building Networks](../connecting/building-networks) — network topology strategies
- [Interface Modes](../connecting/interface-modes) — gateway, access point, and boundary modes
