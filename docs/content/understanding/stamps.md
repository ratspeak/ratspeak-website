# Stamps & Proof-of-Work

How Reticulum uses cryptographic stamps to prevent spam, rate-limit announces, and ensure fair resource usage on constrained networks.

## What Are Stamps?

A **stamp** is a proof-of-work value attached to certain Reticulum operations — primarily interface discovery announces. The sender must expend computational effort to produce a valid stamp before the operation is accepted by the network. This makes it expensive to flood the network with spurious traffic, while legitimate users with genuine announcements pay only a negligible computational cost.

The concept is similar to Hashcash in email anti-spam systems: require the sender to solve a small cryptographic puzzle. A single stamp takes fractions of a second to compute on modern hardware, but generating thousands of stamps to spam the network becomes impractical.

## Why Stamps Exist

Reticulum is designed to operate on extremely constrained links — LoRa radios with a few kilobits per second, packet radio at 1200 baud, or even 5 bps HF links. On these mediums, every byte of bandwidth is precious. Without stamps, an attacker could flood discovery announces at minimal cost, consuming the scarce airtime that legitimate nodes need for actual communication.

Stamps provide a defense layer that:

- **Prevents announce spam** — generating fake discovery announces at scale requires significant compute time
- **Protects constrained networks** — LoRa and packet radio links are shielded from being overwhelmed
- **Preserves fairness** — all nodes must invest the same computational effort to announce
- **Requires no central authority** — proof-of-work is verified locally by each receiving node

## How Stamps Work

When an interface is configured as discoverable, its discovery announces include a cryptographic stamp. The stamp is computed by finding a value that, when hashed with the announce data, produces a hash with a certain number of leading zero bits. The number of leading zeros required is the **stamp difficulty**.

### Verification

Receiving nodes verify stamps by:

1. Extracting the stamp value from the announce
2. Hashing the stamp together with the announce data
3. Checking that the result has the required number of leading zero bits
4. Dropping the announce if the stamp is invalid or the difficulty is insufficient

This verification is computationally trivial — a single hash operation. The asymmetry between creation cost (many hash attempts) and verification cost (one hash check) is what makes the system effective.

## Configuring Stamp Difficulty

### On Discoverable Interfaces

When publishing an interface as discoverable, set the proof-of-work difficulty with `discovery_stamp_value`:

```ini
[[My Public Gateway]]
  type = BackboneInterface
  mode = gateway
  listen_on = 0.0.0.0
  port = 4242
  discoverable = yes
  discovery_name = Region A Public Entrypoint
  discovery_stamp_value = 24
```

The `discovery_stamp_value` is an integer representing the number of leading zero bits required in the stamp hash. Higher values require more computation:

| Difficulty | Approximate Compute Time | Use Case |
|:----------:|:------------------------:|----------|
| 8 | Instant | Very low barrier, minimal protection |
| 14 | Fractions of a second | Default, suitable for most networks |
| 24 | Several seconds | Public gateways, higher spam protection |
| 32+ | Minutes or more | Maximum protection, rarely needed |

> **Note**: The default `discovery_stamp_value` is 14, which provides a reasonable balance between spam protection and announce latency.

### On Receiving Nodes

Nodes listening for discoverable interfaces can set a minimum stamp difficulty they will accept:

```ini
[reticulum]
discover_interfaces = yes
required_discovery_value = 16
```

Discovery announces with a stamp difficulty below `required_discovery_value` are silently dropped. This lets you filter out low-effort announces while accepting legitimate ones.

## When Stamps Are Required

Stamps are currently used for **interface discovery announces**. These are the broadcasts that discoverable interfaces send to advertise their presence, allowing other nodes to find and connect to them.

Regular destination announces (the ones used for path discovery in normal operation) do not use stamps. They are rate-limited through other mechanisms — the [announce cap](../understanding/transport-routing.md), [ingress control](../understanding/ingress-control.md), and [announce rate control](../connecting/interface-modes.md).

> **Tip**: If you are running a private network with trusted participants, you can set `discovery_stamp_value` to a low value or rely on encrypted discovery announces with a [Network Identity](../understanding/network-identities.md) instead.

## Stamps and Network Identities

Stamps work alongside Network Identities for layered security. A discoverable interface can require both a valid stamp (proof-of-work) and a valid Network Identity signature (proof of membership):

```ini
[[My Private Gateway]]
  type = BackboneInterface
  mode = gateway
  listen_on = 0.0.0.0
  port = 5858
  discoverable = yes
  discovery_stamp_value = 22
  discovery_encrypt = yes
```

```ini
[reticulum]
discover_interfaces = yes
required_discovery_value = 16
network_identity = ~/.reticulum/storage/identities/my_network
interface_discovery_sources = 521c87a83afb8f29e4455e77930b973b
```

This combination ensures that discovery announces are:

1. Computationally expensive to forge (stamps)
2. Cryptographically authenticated (Network Identity signature)
3. Optionally encrypted (only members can read the announce payload)

## What's Next

- [Ingress Control](../understanding/ingress-control.md) — rate limiting for incoming announce traffic
- [Blackhole Management](../understanding/blackhole-management.md) — blocking specific identities
- [Network Identities](../understanding/network-identities.md) — group identity and trust
- [Transport & Routing](../understanding/transport-routing.md) — how announces propagate
