# Blackhole Management

Blocking specific identities at the transport layer — managing local blackhole lists, subscribing to trusted sources, and publishing lists for your network.

## What Is Blackholing?

**Blackholing** is Reticulum's mechanism for blocking specific identities at the transport layer. When an identity is blackholed on your node, its announces are silently dropped and its traffic is not routed through your transport instance. The identity effectively ceases to exist from your node's perspective.

This provides a defense against spam, abuse, and unwanted traffic without compromising Reticulum's zero-trust architecture. Blackholing is always a **local decision** — you control who your node blocks, and your block list affects only your own network segment.

> **Note**: There is fundamentally **no way to globally block or censor** any identity in Reticulum. Blackholes only affect the nodes that choose to apply them. A blackholed identity can still communicate freely through any path that does not traverse your node.

## Local Blackhole Management

Use the `rnpath` utility to manage your local blackhole list.

### Blocking an Identity

```bash
rnpath -B <identity_hash> --duration 24 --reason "Excessive announces"
```

| Flag | Description |
|------|-------------|
| `-B, --blackhole` | Blackhole the specified identity hash |
| `--duration HOURS` | How long the blackhole lasts (in hours). Omit for permanent. |
| `--reason TEXT` | Human-readable reason for the block |

### Removing a Blackhole

```bash
rnpath -U <identity_hash>
```

### Viewing the Blackhole List

```bash
# List all blackholed identities
rnpath -b

# JSON output for scripting
rnpath -b -j
```

The output shows each blackholed identity hash, the reason for blocking, the duration, and when the block expires.

## Automated List Sourcing

For networks with multiple transport nodes, you can subscribe to blackhole lists from trusted peers. This allows a network administrator to maintain a single blackhole list and have it automatically distributed to all subscribing nodes.

### Subscribing to a Source

Add trusted transport identity hashes to your configuration:

```ini
[reticulum]
blackhole_sources = 521c87a83afb8f29e4455e77930b973b, 68a4aa91ac350c4087564e8a69f84e86
```

Your node will periodically (approximately hourly) fetch the blackhole list from each configured source via the `rnstransport.info.blackhole` destination. Any identities on the source's list are automatically added to your local blackhole list.

> **Warning**: Subscribing to a blackhole source grants that source the ability to influence who your node will route traffic for. Only subscribe to sources you trust. A malicious source could blackhole legitimate identities, effectively censoring them from your node's perspective.

### Previewing a Remote List

Before subscribing, you can preview what a transport node is publishing:

```bash
rnpath -p -R <transport_hash> -i ~/.reticulum/identities/mgmt
```

This fetches and displays the remote node's published blackhole list without importing it. Review the list to verify the source is trustworthy before adding it to `blackhole_sources`.

## Publishing Your Blackhole List

If you maintain a blackhole list that other nodes should use, enable publishing:

```ini
[reticulum]
publish_blackhole = yes
```

This makes your local blackhole database available to subscribers via the `rnstransport.info.blackhole` destination. Any node that includes your transport identity hash in its `blackhole_sources` will periodically fetch and apply your list.

### Best Practices for Publishers

- **Document your criteria** — make it clear to subscribers why identities are blackholed
- **Use durations** — prefer time-limited blocks over permanent ones when appropriate
- **Include reasons** — always set a `--reason` when blackholing so subscribers can audit the list
- **Be conservative** — blackholing a legitimate identity disrupts real communication for all subscribers

## Remote Blackhole Management

If you manage remote transport nodes with [remote management](../deployment/remote-management.md) enabled, you can manage their blackhole lists from your local machine:

```bash
# View blackholed identities on a remote node
rnpath -b -R <transport_hash> -i ~/.reticulum/identities/mgmt

# Blackhole an identity on a remote node
rnpath -B <bad_hash> --duration 48 --reason "Spam" -R <transport_hash> -i ~/.reticulum/identities/mgmt

# Remove a blackhole on a remote node
rnpath -U <identity_hash> -R <transport_hash> -i ~/.reticulum/identities/mgmt
```

## Use Cases

### Blocking Announce Spam

The most common use case. If an identity is flooding the network with excessive announces, blackhole it to stop propagation through your node:

```bash
rnpath -B <spammer_hash> --duration 72 --reason "Announce flooding"
```

### Managing Network Access

On private or semi-private networks, blackholing can enforce access policies. While [Interface Access Codes (IFAC)](../understanding/protocol-architecture.md) provide stronger access control at the interface level, blackholing offers a quick way to revoke access without reconfiguring interfaces.

### Community Moderation

Network operators can maintain shared blackhole lists for their community. A trusted coordinator publishes the list, and community transport nodes subscribe. This provides distributed moderation without central authority — any node can unsubscribe at any time.

## Limitations

- **Local scope only** — blackholes affect only your node and nodes that subscribe to your list. The blocked identity can still communicate through other paths.
- **Identity-based** — blackholing targets identity hashes, not destinations or applications. All traffic from a blackholed identity is blocked.
- **No retroactive effect** — blackholing an identity does not remove already-cached path entries. Existing paths expire naturally over time.
- **Trust required for sourcing** — automated list sourcing requires trusting the source. There is no consensus mechanism or voting system.

## What's Next

- [Ingress Control](../understanding/ingress-control.md) — rate limiting for announce traffic
- [Stamps & Proof-of-Work](../understanding/stamps.md) — proof-of-work for discovery announces
- [Security Model](../understanding/security-model.md) — Reticulum's zero-trust architecture
- [Remote Management](../deployment/remote-management.md) — managing nodes remotely
