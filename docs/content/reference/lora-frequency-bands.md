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

## Ratspeak LoRa Presets

Ratspeak ships with a single canonical set of eight LoRa presets that apply regardless of frequency band. You pick the frequency for your region separately from the modulation preset. **Long Fast** is the factory default.

| Preset | Bitrate | SF | Bandwidth | Coding Rate | TX Power | Link Budget |
|--------|--------:|:--:|:---------:|:-----------:|:--------:|:-----------:|
| Short Turbo | 21.99 kbps | 7 | 500 kHz | 4/5 | 14 dBm | 140 dB |
| Short Fast | 10.84 kbps | 7 | 250 kHz | 4/5 | 14 dBm | 143 dB |
| Short Slow | 6.25 kbps | 8 | 250 kHz | 4/5 | 14 dBm | 145.5 dB |
| Medium Fast | 3.52 kbps | 9 | 250 kHz | 4/5 | 17 dBm | 148 dB |
| Medium Slow | 1.95 kbps | 10 | 250 kHz | 4/5 | 17 dBm | 150.5 dB |
| Long Turbo | 1.34 kbps | 11 | 500 kHz | 4/8 | 22 dBm | 150 dB |
| **Long Fast** *(default)* | **1.07 kbps** | **11** | **250 kHz** | **4/5** | **22 dBm** | **153 dB** |
| Long Moderate | 0.34 kbps | 11 | 125 kHz | 4/8 | 22 dBm | 156 dB |

### Recommended Frequencies by Region

| Region | Suggested Frequency | Regional TX Power Cap |
|--------|--------------------|----------------------|
| US 915 MHz | 915 MHz | 30 dBm EIRP (FCC) |
| EU 868 MHz | 867.2 MHz (g sub-band) | 14 dBm (25 mW) |
| EU 868 MHz (high-power sub-band) | 869.525 MHz (g3 sub-band) | 27 dBm at 10% duty cycle |
| UK 868 MHz | 867.2 MHz | 14 dBm |
| AU 915 MHz | 920 MHz | 30 dBm EIRP |
| JP 920 MHz | 923 MHz | 13 dBm |
| KR 920 MHz | 921 MHz | 10 dBm |
| IN 865 MHz | 866 MHz | 14 dBm |
| CN 470 MHz | 470 MHz | 17 dBm |

> **Note**: Ratspeak presets use TX power 14–22 dBm at the preset defaults. You may need to **lower TX power below the preset default** to stay within your regional cap (EU 868 is the most common case — you'll want 14 dBm even when using a Long preset). All preset parameters are individually tunable.

> **EU 868 duty cycle**: Most sub-bands limit you to a **1% duty cycle** (~36 seconds of TX per hour). The slower presets (Long Moderate in particular) reach this limit quickly — favor **Short Fast** or **Medium Fast** for higher-traffic EU use, or use the g3 sub-band (869.525 MHz) which allows 10% duty cycle.

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

**Wider bandwidth = faster data rate but shorter range.** Ratspeak's canonical presets use 250 kHz for most presets (125 kHz for Long Moderate, 500 kHz for the Turbo presets).

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

### For Urban Environments — Short Fast preset

```ini
frequency = 915000000
bandwidth = 250000
spreadingfactor = 7
codingrate = 5
txpower = 14
```

Short range but fast — good for city mesh networks where nodes are close together.

### For Maximum Range — Long Moderate preset

```ini
frequency = 915000000
bandwidth = 125000
spreadingfactor = 11
codingrate = 8
txpower = 22
```

Maximum range in Ratspeak's canonical set — suitable for mountain-to-valley links or rural areas with clear line of sight. Note that this has the longest time on air; under EU duty-cycle limits you will hit the cap quickly.

### Default — Long Fast preset

```ini
frequency = 915000000
bandwidth = 250000
spreadingfactor = 11
codingrate = 5
txpower = 22
```

Ratspeak's factory default. Good all-around long-range settings at higher bandwidth than Long Moderate.

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
