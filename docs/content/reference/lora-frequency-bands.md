# LoRa Frequency Bands

Regional frequency allocations for LoRa — which frequencies to use where, power limits, duty cycle regulations, and recommended RNode settings.

## Quick Reference

| Region | Band | Frequency Range | Max TX Power | Duty Cycle |
|--------|------|-----------------|-------------|------------|
| **US / Canada** | ISM 915 | 902-928 MHz | 30 dBm (1 W) | No limit (FCC Part 15) |
| **EU** | ISM 868 | 863-870 MHz | 14 dBm (25 mW) | 1% or 10% per sub-band |
| **UK** | ISM 868 | 863-870 MHz | 14 dBm (25 mW) | 1% |
| **Australia / NZ** | ISM 915 | 915-928 MHz | 30 dBm (1 W) | No limit |
| **Japan** | ISM 920 | 920-928 MHz | 13 dBm (20 mW) | 10% |
| **South Korea** | ISM 920 | 920-923 MHz | 10 dBm (10 mW) | — |
| **India** | ISM 865 | 865-867 MHz | 14 dBm (25 mW) | — |
| **China** | ISM 470 | 470-510 MHz | 17 dBm (50 mW) | — |

> **Warning**: These are summaries. Always verify current regulations for your specific jurisdiction before transmitting.

## Ratspeak Frequency Presets

Ratspeak includes built-in frequency presets for common regions:

### US 915 MHz

| Parameter | Long Range | Balanced | Fast |
|-----------|-----------|----------|------|
| Frequency | 915 MHz | 915 MHz | 915 MHz |
| Bandwidth | 125 kHz | 125 kHz | 250 kHz |
| Spreading Factor | 12 | 9 | 7 |
| Coding Rate | 4/8 | 4/5 | 4/5 |
| TX Power | 17 dBm | 17 dBm | 17 dBm |
| Data Rate | ~293 bps | ~3,515 bps | ~21,875 bps |
| Range (est.) | 15-50 km | 5-20 km | 2-10 km |

### EU 868 MHz

| Parameter | Long Range | Balanced | Fast |
|-----------|-----------|----------|------|
| Frequency | 867.2 MHz | 867.2 MHz | 867.2 MHz |
| Bandwidth | 125 kHz | 125 kHz | 250 kHz |
| Spreading Factor | 12 | 9 | 7 |
| Coding Rate | 4/8 | 4/5 | 4/5 |
| TX Power | 14 dBm | 14 dBm | 14 dBm |
| Data Rate | ~293 bps | ~3,515 bps | ~21,875 bps |

> **Note**: EU 868 MHz has a **1% duty cycle** limit on most sub-bands. At SF12/125kHz, this means approximately 36 seconds of transmission per hour. Use balanced or fast presets for higher throughput.

### AU 915 MHz

Same as US 915 MHz presets. Australia allows up to 30 dBm (1 W) EIRP.

### JP 920 MHz

| Parameter | Long Range | Balanced | Fast |
|-----------|-----------|----------|------|
| Frequency | 923 MHz | 923 MHz | 923 MHz |
| Bandwidth | 125 kHz | 125 kHz | 250 kHz |
| Spreading Factor | 12 | 9 | 7 |
| Coding Rate | 4/8 | 4/5 | 4/5 |
| TX Power | 13 dBm | 13 dBm | 13 dBm |

## LoRa Parameters Explained

### Spreading Factor (SF)

Controls the trade-off between range and speed:

| SF | Data Rate (125 kHz BW) | Time on Air (50 bytes) | Relative Range |
|----|----------------------|----------------------|---------------|
| SF7 | ~5,470 bps | ~72 ms | Shortest |
| SF8 | ~3,125 bps | ~134 ms | |
| SF9 | ~1,758 bps | ~247 ms | |
| SF10 | ~977 bps | ~453 ms | |
| SF11 | ~537 bps | ~906 ms | |
| SF12 | ~293 bps | ~1,648 ms | Longest |

**Higher SF = longer range but slower speed.** Each SF increase roughly doubles the time on air.

### Bandwidth

| Bandwidth | Effect |
|-----------|--------|
| 7.8 kHz | Maximum range, extremely slow |
| 62.5 kHz | Long range, slow |
| 125 kHz | Standard — good balance (most common) |
| 250 kHz | Shorter range, faster |
| 500 kHz | Shortest range, fastest |

**Wider bandwidth = faster data rate but shorter range.** Most Reticulum deployments use 125 kHz.

### Coding Rate

Error correction redundancy:

| Setting | Ratio | Overhead | Use Case |
|---------|-------|----------|----------|
| CR 5 | 4/5 | 25% | Low interference environments |
| CR 6 | 4/6 | 50% | Moderate interference |
| CR 7 | 4/7 | 75% | High interference |
| CR 8 | 4/8 | 100% | Maximum error resilience |

Higher coding rate = more error correction but slower effective throughput.

## Choosing Settings

### For Urban Environments

```ini
frequency = 915000000
bandwidth = 250000
spreadingfactor = 7
codingrate = 5
txpower = 17
```

Short range but fast — good for city mesh networks where nodes are close together.

### For Rural / Long Range

```ini
frequency = 915000000
bandwidth = 125000
spreadingfactor = 12
codingrate = 8
txpower = 22
```

Maximum range — suitable for mountain-to-valley links or rural areas with clear line of sight.

### For Balanced Use

```ini
frequency = 915000000
bandwidth = 125000
spreadingfactor = 9
codingrate = 5
txpower = 17
```

Good all-around settings. This is the "Balanced" preset in Ratspeak.

## EU Duty Cycle Sub-bands

In Europe, the 868 MHz band is divided into sub-bands with different duty cycle limits:

| Sub-band | Frequency | Duty Cycle | Max TX Power |
|----------|-----------|------------|-------------|
| g | 863.0-868.0 MHz | 1% | 14 dBm |
| g1 | 868.0-868.6 MHz | 1% | 14 dBm |
| g2 | 868.7-869.2 MHz | 0.1% | 14 dBm |
| g3 | 869.4-869.65 MHz | 10% | 27 dBm |
| g4 | 869.7-870.0 MHz | 1% | 14 dBm |

**Recommended**: Use 867.2 MHz (g sub-band, 1% duty cycle) or 869.525 MHz (g3 sub-band, 10% duty cycle, 27 dBm) for higher throughput.

## Regulatory Notes

- **License-free operation** requires staying within ISM band power and duty cycle limits
- **Amateur radio operators** may use higher power on authorized amateur bands (check local regulations)
- **No encryption restriction** in most ISM bands — Reticulum's encryption is legal
- **Antenna gain** counts toward EIRP limits in many jurisdictions
- When in doubt, consult your country's radio frequency regulatory body

## What's Next

- [Antennas, Range & Power](../hardware/antennas-range-power) — antenna selection and optimization
- [LoRa with RNode](../connecting/lora-rnode) — setting up LoRa interfaces
- [RNode Overview](../hardware/rnode-overview) — RNode hardware guide
