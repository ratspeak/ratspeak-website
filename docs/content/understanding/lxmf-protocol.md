# LXMF Protocol

Lightweight Extensible Message Format — zero-configuration encrypted messaging over Reticulum.

## Overview

LXMF is a messaging protocol built on top of Reticulum that provides:

- **Zero-configuration message routing** — no servers to configure
- **End-to-end encryption** — every message is encrypted
- **Forward secrecy** — via ephemeral key exchanges
- **Store-and-forward** — messages wait for offline recipients via propagation nodes
- **Medium agnostic** — efficient enough for LoRa and packet radio

LXMF messages can even be encoded as **QR codes** or **text-based URIs** for analog transport on paper.

## Delivery Modes

LXMF supports three delivery methods:

### Direct

A link is established to the recipient and the message is delivered over the encrypted channel. Used for longer messages and file attachments.

```
Sender → [Link Handshake] → Recipient → Delivery Proof
```

### Opportunistic

The message is sent as a single packet without establishing a link first. Only works for short messages (content must fit within the encrypted MDU of 383 bytes). Faster but less reliable.

```
Sender → [Single Packet] → Recipient
```

### Propagated

The message is routed through a **propagation node** for store-and-forward delivery. The propagation node holds the message until the recipient connects and syncs.

```
Sender → Propagation Node → [stored] → Recipient syncs → Delivery
```

## LXMF Fields

Messages can carry several types of content:

| Field | Constant | Description |
|-------|----------|-------------|
| File attachments | `FIELD_FILE_ATTACHMENTS` | List of `[filename, data]` tuples |
| Inline images | `FIELD_IMAGE` | `[mime_type, image_bytes]` |
| Audio | `FIELD_AUDIO` | `[codec, audio_bytes]` (opus, ogg, mp3, wav) |
| Title | — | Optional message title/subject |
| Content | — | Message body text |

Additional standard fields exist for telemetry, threading, commands, and group messaging. LXMF also defines **custom extension fields** used by protocols like RLAP:

| Field | Constant | Description |
|-------|----------|-------------|
| Custom Type | `FIELD_CUSTOM_TYPE` (`0xFB`) | Protocol identifier (e.g., `"rlap.v1"`) |
| Custom Meta | `FIELD_CUSTOM_META` (`0xFD`) | Protocol-specific metadata (e.g., RLAP envelope dict) |

These custom fields enable app-layer protocols to piggyback on LXMF messages while maintaining backward compatibility — clients that don't understand the custom fields simply ignore them and display the standard content. See [RLAP Protocol](../understanding/rlap-protocol) for how Ratspeak uses these fields.

## Propagation Nodes

A propagation node acts as a mailbox:

1. **Sender** delivers message to the propagation node
2. **Propagation node** stores the encrypted message
3. **Recipient** comes online and sends a sync request
4. **Propagation node** delivers all stored messages

Any LXMF-capable node can run as a propagation node. In Ratspeak, enable it from Settings.

## Ecosystem Compatibility

All LXMF-compatible applications can interoperate:

| Application | Platform | Description |
|------------|----------|-------------|
| **Sideband** | Android, Linux, macOS, Windows | Full-featured mobile/desktop messenger |
| **NomadNet** | Terminal | Terminal-based mesh communication |
| **MeshChat** | Web | Web-based messaging |
| **MeshChatX** | — | Extended MeshChat |
| **Columba** | Android | Native Android client |
| **Ratspeak** | Web | Dashboard with full network management |

A message sent from Ratspeak can be received on Sideband, and vice versa. The destination hash is the universal address across all clients.

## LXST — Streaming Companion

**LXST** (Lightweight Extensible Streaming Transport) is LXMF's companion protocol for **real-time streaming**:

- Voice calls and similar real-time communication
- Same zero-configuration approach
- End-to-end encryption
- Works over any Reticulum medium

## Message Size Considerations

On bandwidth-constrained links (LoRa, packet radio):

- Opportunistic messages must fit in a single 383-byte encrypted packet. After LXMF overhead (~111 bytes for source hash, signature, and metadata), the practical content limit for opportunistic messages is roughly 200 bytes.
- Direct messages can be larger (sent as Resources over Links)
- Ratspeak limits file attachments to 500 KB. Other LXMF clients may have different limits.
- Keep messages concise on slow links — every byte costs airtime

## Next Steps

- [Messaging](../using-ratspeak/messaging) — using LXMF in Ratspeak
- [Propagation Node](../using-ratspeak/propagation-node) — store-and-forward setup
- [Protocol Architecture](../understanding/protocol-architecture) — the network layer beneath LXMF
