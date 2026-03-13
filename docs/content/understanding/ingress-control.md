# Ingress Control

How Reticulum rate-limits incoming announces to protect nodes from being overwhelmed, especially on public interfaces and constrained links.

## What Is Ingress Control?

**Ingress control** is Reticulum's mechanism for rate-limiting incoming announce traffic on a per-interface basis. When a large number of announces for previously unknown destinations arrive in a short period, ingress control places them on hold so that traffic for established destinations continues without interruption.

This is distinct from the global announce cap (which limits overall announce bandwidth to 2% of interface capacity). Ingress control specifically targets bursts of new-destination announces — the pattern typically seen during spam attacks or when a node first connects to a large network.

## Why It Matters

On public-facing interfaces — backbone gateways, TCP servers, or LoRa access points — any remote peer can send announces. Without rate limiting, a misbehaving or malicious client could:

- **Flood the path table** with thousands of bogus destinations
- **Consume processing time** verifying announce signatures
- **Exhaust bandwidth** on constrained links with announce traffic
- **Disrupt established traffic** by starving real packets of capacity

Ingress control prevents these scenarios by throttling the rate at which new announces are processed, while letting traffic for known destinations flow normally.

## How It Works

Ingress control operates at the level of **individual sub-interfaces**. On interfaces that support multiple connections (like `TCPServerInterface` or `BackboneInterface`), each connected client is tracked independently. This means one misbehaving client cannot disrupt others connected to the same interface.

The mechanism works in stages:

1. **Normal operation** — Announces arrive and are processed immediately
2. **Burst detection** — If announces from a sub-interface exceed the burst frequency threshold, the interface enters burst state
3. **Hold phase** — New announces are queued (up to a configurable maximum) instead of being processed
4. **Cool-down** — After the burst subsides and a penalty period elapses, held announces are released one at a time at a controlled rate
5. **Return to normal** — Once the queue is cleared, the interface returns to normal operation

> **Note**: Ingress control only affects announces for **new** destinations. Announces for already-known destinations (path updates, ratchet rotations) are always processed immediately.

## Configuration

Ingress control is enabled by default on all interfaces. The parameters can be tuned per interface in `~/.reticulum/config`:

```ini
[[My Public Gateway]]
  type = BackboneInterface
  mode = gateway
  listen_on = 0.0.0.0
  port = 4242
  ingress_control = True
  ic_burst_freq = 12
  ic_burst_freq_new = 3.5
  ic_max_held_announces = 256
  ic_burst_hold = 60
  ic_burst_penalty = 300
  ic_held_release_interval = 30
  ic_new_time = 7200
```

### Parameters

| Parameter | Default | Description |
|-----------|:-------:|-------------|
| `ingress_control` | `True` | Enable or disable announce ingress control |
| `ic_new_time` | 7200 s | How long a sub-interface is considered "newly spawned" after connecting |
| `ic_burst_freq_new` | 3.5/s | Max announce frequency for new sub-interfaces |
| `ic_burst_freq` | 12/s | Max announce frequency for established sub-interfaces |
| `ic_max_held_announces` | 256 | Maximum unique announces held in the queue |
| `ic_burst_hold` | 60 s | Time the burst frequency must stay below threshold before clearing |
| `ic_burst_penalty` | 300 s | Additional delay after burst clears before releasing held announces |
| `ic_held_release_interval` | 30 s | Time between releasing each held announce from the queue |

### New vs Established Sub-Interfaces

Newly connected sub-interfaces use a stricter rate limit (`ic_burst_freq_new` at 3.5/s) compared to established ones (`ic_burst_freq` at 12/s). A sub-interface is considered "new" for the duration specified by `ic_new_time` (default 2 hours).

This two-tier approach is deliberate: when a client first connects, it typically sends a burst of announces for all its known destinations. The lower threshold for new connections prevents this initial burst from overwhelming the node, while established connections get a higher limit since they have already demonstrated legitimate behavior.

## Interaction with Other Rate Controls

Ingress control is one of several mechanisms Reticulum uses to manage announce traffic:

| Mechanism | Scope | Purpose |
|-----------|-------|---------|
| **Announce cap** | Global, per interface | Limits total announce bandwidth to 2% of interface capacity |
| **Announce rate control** | Per destination, per interface | Limits how frequently a single destination can be re-announced |
| **Ingress control** | Per sub-interface | Rate-limits bursts of new-destination announces |
| **[Stamps](../understanding/stamps.md)** | Per discovery announce | Requires proof-of-work for interface discovery announces |
| **[Blackholing](../understanding/blackhole-management.md)** | Per identity | Blocks all traffic from specific identities |

These mechanisms complement each other. The announce cap provides a bandwidth ceiling, announce rate control prevents individual destinations from being over-announced, ingress control handles burst scenarios, stamps gate discovery, and blackholing removes persistent bad actors.

## Tuning for Your Network

### Public Internet Gateways

For gateways serving many clients over the internet, the defaults work well. If you experience frequent bursts, consider lowering `ic_burst_freq_new`:

```ini
ic_burst_freq_new = 2.0
ic_burst_penalty = 600
```

### LoRa Access Points

On bandwidth-constrained LoRa interfaces, tighter limits prevent announce traffic from consuming scarce airtime:

```ini
ic_burst_freq = 4
ic_burst_freq_new = 1.5
ic_max_held_announces = 64
```

### Private Networks

On trusted private networks, you may want to relax or disable ingress control to allow faster convergence:

```ini
ingress_control = False
```

> **Warning**: Disabling ingress control on public-facing interfaces removes an important protection layer. Only disable it on interfaces where you trust all connected peers.

## What's Next

- [Stamps & Proof-of-Work](../understanding/stamps.md) — proof-of-work for discovery announces
- [Blackhole Management](../understanding/blackhole-management.md) — blocking specific identities
- [Transport & Routing](../understanding/transport-routing.md) — how announce propagation works
- [Interface Modes](../connecting/interface-modes.md) — controlling interface behavior
