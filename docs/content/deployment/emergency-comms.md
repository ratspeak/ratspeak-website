# Emergency Communications

Using Reticulum and Ratspeak for communication when internet and cell networks are down — natural disasters, power outages, and infrastructure failures.

## Why Reticulum for Emergencies

When infrastructure fails, Reticulum keeps working because:

- **No servers required** — peer-to-peer, no central point of failure
- **No internet needed** — LoRa radio works without any infrastructure
- **No accounts or registration** — works immediately with zero setup
- **Encrypted by default** — privacy maintained even in crisis
- **Store-and-forward** — messages delivered when recipients come back online
- **Low power** — LoRa nodes can run on batteries or solar for days

## Emergency Kit

### Minimal Kit (1 Person)

| Item | Purpose |
|------|---------|
| RatDeck or RatCom | Standalone mesh communicator |
| 915 MHz antenna | Better range than built-in stub |
| USB battery pack (10,000+ mAh) | Power for 2-3 days |
| USB-C cable | Charging |

### Group Kit (Neighborhood)

| Item | Qty | Purpose |
|------|-----|---------|
| Raspberry Pi + RNode | 1-2 | Transport/relay nodes |
| High-gain collinear antenna | 1-2 | Maximum coverage |
| RatDeck or RatCom | Per person | Personal communicators |
| Solar panel + charge controller | 1-2 | Indefinite power for relay nodes |
| Weatherproof enclosure | 1-2 | Outdoor deployment |

## Quick Deployment

### Scenario: Power/Internet Out, Need to Communicate

**Option A: RatDeck/RatCom Only (Minutes)**

1. Power on your RatDeck or RatCom
2. It starts in AP mode with LoRa active
3. Anyone within LoRa range with a Reticulum device can communicate
4. No setup required — just turn it on

**Option B: Laptop + RNode (10 Minutes)**

1. Start Ratspeak on your laptop
2. Plug in an RNode via USB
3. Add the LoRa radio in Network settings
4. You're on the mesh — message anyone in radio range

**Option C: Relay Node for Coverage (30 Minutes)**

1. Set up a Raspberry Pi with rnsd at the highest available location
2. Connect an RNode with a high-gain antenna
3. Enable transport mode
4. This node now relays traffic for everyone in range

## Network Design for Emergencies

### Key Principles

- **Elevation wins** — mount antennas as high as possible
- **Redundancy** — multiple transport nodes prevent single points of failure
- **Propagation nodes** — at least one node should store messages for offline users
- **Low bandwidth is fine** — LoRa at 300 bps can still deliver text messages reliably
- **Pre-configure** — set up and test your emergency network before you need it

### Recommended Topology

```
[Hilltop Relay]     <-- LoRa -->     [Hilltop Relay]
  (transport)                          (transport + propagation)
      |                                      |
   LoRa                                   LoRa
      |                                      |
[Neighborhood A]                    [Neighborhood B]
  (RatDecks, laptops)                (RatDecks, laptops)
```

Use **Long Range preset** (SF12, 62.5 kHz, 22 dBm) for maximum distance between relay nodes. Client devices can use Balanced preset for better throughput on shorter links.

## Power Considerations

| Device | Power Draw | Battery Life (10,000 mAh) |
|--------|-----------|--------------------------|
| RatDeck (active) | ~200–500 mW | 2–4 days |
| RatCom (active) | ~150–400 mW | 2–4 days |
| Raspberry Pi 4 + RNode | ~3–5W | 6–12 hours |
| Raspberry Pi Zero 2W + RNode | ~1–2W | 12–24 hours |

For extended deployment, a **20W solar panel + charge controller** can keep a Raspberry Pi relay running indefinitely.

## Pre-Deployment Checklist

- [ ] Test all devices and verify they can communicate
- [ ] Pre-configure transport nodes with correct LoRa settings
- [ ] Identify elevated deployment locations
- [ ] Charge all batteries
- [ ] Share LXMF destination hashes with all participants
- [ ] Designate at least one propagation node
- [ ] Document the network plan (which nodes, where, what frequency)

## What's Next

- [Community Mesh Network](../deployment/community-mesh) — larger-scale deployment
- [Raspberry Pi Gateway](../deployment/raspberry-pi-gateway) — detailed Pi setup guide
- [Antennas, Range & Power](../hardware/antennas-range-power) — optimize radio performance
- [LoRa with RNode](../connecting/lora-rnode) — radio configuration
