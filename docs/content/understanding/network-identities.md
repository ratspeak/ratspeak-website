# Network Identities

Using Reticulum identities to represent networks, communities, and groups of nodes — beyond individual user identities.

## What Are Network Identities?

A **Network Identity** is a standard Reticulum identity (512-bit Ed25519 + X25519 keyset) used to represent a logical group rather than an individual user. Think of it as a cryptographic membership badge for a fleet of nodes.

Regular identities represent individual users. Network identities represent:

- A community mesh network
- An organization's infrastructure
- A group of trusted transport nodes
- A private overlay network

## Creating a Network Identity

Generate one with the `rnid` utility:

```bash
rnid -g ~/.reticulum/storage/identities/my_network
```

This creates a new 512-bit identity file that can be distributed to all nodes in the network.

## Current Uses

### Interface Discovery

Transport nodes can sign their discovery announces with a Network Identity. Listening instances verify the signature before auto-connecting — only connecting to nodes that belong to their network.

```ini
[reticulum]
  network_identity = ~/.reticulum/storage/identities/my_network
  discover_interfaces = yes
  interface_discovery_sources = 521c87a83afb8f29e4455e77930b973b
```

### Whitelisting

Only transport instances identified by a trusted Network Identity are auto-connected. This prevents rogue nodes from injecting themselves into your network.

```ini
[reticulum]
  autoconnect_discovered_interfaces = 3
  required_discovery_value = 16
```

The `required_discovery_value` sets a proof-of-work difficulty threshold, making it computationally expensive to spam fake discovery announces.

### Encrypted Discovery

Discovery announces can be encrypted using the Network Identity. Only nodes that have the Network Identity can decrypt and act on the announces — invisible to outsiders.

```ini
[[Public Gateway]]
  type = BackboneInterface
  discoverable = yes
  discovery_name = Community Hub Alpha
  discovery_encrypt = yes
  # ... other params
```

## How It Works

1. **Generate** a Network Identity keypair
2. **Distribute** the identity file to all nodes in your network (secure channel)
3. **Configure** each node to use the identity in their Reticulum config
4. Nodes **sign** their discovery announces with the shared identity
5. Other member nodes **verify** the signature and auto-connect
6. Non-members **cannot** verify and are ignored

## Security Considerations

- The Network Identity file contains private keys — distribute securely
- Anyone with the identity file can join the network
- Revoking access requires generating a new Network Identity and redistributing it
- Network Identities are separate from user identities — they don't affect individual privacy

## Reference Identity

The Reticulum reference implementation identity:

```
bc7291552be7a58f361522990465165c
```

## What's Next

- [Destinations & Addressing](../understanding/destinations-addressing) — individual identity addressing
- [Security Model](../understanding/security-model) — cryptographic security properties
- [Building Networks](../connecting/building-networks) — practical network deployment
- [Interface Modes](../connecting/interface-modes) — controlling interface participation
