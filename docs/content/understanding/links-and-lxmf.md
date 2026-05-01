# Links & LXMF

When you send a message, two things happen underneath. Reticulum sets up
an encrypted **link** between your node and the recipient's, and **LXMF**
(the Lightweight eXtensible Message Format) packages the message so it
can travel over that link, through a propagation node, or as a single
bare packet.

## What a Reticulum link is

A link is an encrypted, ephemeral, point-to-point session between two
destinations. Once established, both peers share a symmetric key derived
fresh for that session — old link keys can't be recovered even if a
node's long-term identity is later compromised.

Links are the substrate for everything stateful in Reticulum: reliable
channels, large file transfers, and the link-mode delivery LXMF prefers
when both parties are online. Either side can tear a link down at any
time, and nothing about a link persists once it ends.

## The 3-packet handshake

Establishing a link takes three packets:

1. **Link request.** The initiator sends an ephemeral X25519 public key to
   the destination, along with a link ID derived from the request hash.
2. **Proof.** The receiver replies with its own ephemeral X25519 key plus
   a signed proof. Both sides now derive the same shared secret via a
   Diffie-Hellman exchange and HKDF.
3. **Identification.** The initiator sends an encrypted identification
   packet signed with its long-term identity key, proving who it is on
   the now-encrypted link.

After the third packet the link is **active**. See the
[Reticulum manual](https://reticulum.network/manual/understanding.html#link-establishment)
for the full cryptographic detail.

## Link timers

Three timers govern a link's lifetime:

- **Establishment timeout — ~6 seconds per hop.** If the proof or
  identification packet doesn't arrive within ~6 s per network hop, the
  attempt is abandoned. A 4-hop link waits ~24 s.
- **Keepalive — 360 seconds.** When a link goes idle, each side sends a
  small keepalive packet every 6 minutes so intermediate nodes don't drop
  their path entries.
- **Stale-after — 720 seconds.** If no traffic or keepalive arrives in 12
  minutes, the link is torn down. The next message triggers a fresh
  handshake.

These defaults are tuned for slow, lossy networks; on a healthy LAN they
are rarely reached.

## What rides on a link

A bare link is just an encrypted tunnel. Two higher-level constructs sit
on top of it:

- **Channels.** Reliable, ordered, multiplexed message streams. A channel
  retransmits lost packets and delivers messages in order, the way TCP
  does over IP. LXMF's link-mode delivery uses a channel internally.
- **Resource transfer.** Built for payloads too large for a single packet
  — files, images, attachments. Resources chunk the payload, hash each
  chunk, and let the receiver verify and reassemble. Transfers can be
  paused, resumed, and cancelled.

Either construct can run alongside others on the same link.

## LXMF: the message format

LXMF is the message format itself, independent of transport. Each
message contains:

- A timestamp and a destination identity hash.
- A title and content body (both optional, both arbitrary bytes).
- A **fields** dictionary for structured data: telemetry, app-specific
  payloads, game protocol frames, anything an application wants to
  attach.
- A signature from the sender's identity key, so the recipient can
  verify origin even if the message arrived through an untrusted relay.

The format is deliberately small and extensible: chat clients and sensor
networks both fit comfortably inside it.

## Three delivery modes

When you hand LXMF a message, it picks one of three delivery modes:

- **Direct.** The recipient is online and reachable, so LXMF opens a
  Reticulum link and sends the message over a reliable channel.
  Compression is negotiated when the link is set up. This is the
  default for back-and-forth conversation.
- **Opportunistic.** If the message fits in a single packet (≤ 295 bytes
  of payload), LXMF skips the handshake entirely and fires a single
  encrypted packet at the destination. No link, no acknowledgement —
  the packet either arrives because a path exists, or it doesn't. Cheap
  and useful for short bursts and beacons.
- **Propagated.** If the recipient is offline, LXMF hands the message to
  a **propagation node**, which holds it as an encrypted blob until the
  recipient comes back online and asks for their mail.

The sender doesn't usually choose — the local LXMF router picks based on
size, reachability, and recipient preferences.

## Propagation nodes

A propagation node is a Reticulum node running the `lxmd` daemon. It
accepts encrypted LXMF blobs addressed to identities it holds mail for,
syncs those blobs with peer propagation nodes for redundancy, and replies
to "give me my mail" queries from clients — deleting the local copy once
delivery is confirmed. Propagation nodes never see plaintext: every blob
is end-to-end encrypted to the recipient's identity. They are a delivery
convenience, not a trust anchor.

## Stamps and tickets

LXMF's anti-spam mechanism is a **proof-of-work stamp** attached to
outbound messages. The sender burns a small, configurable amount of CPU
to compute a hash that meets a difficulty target; the recipient checks
it before accepting the message. Strangers pay the cost; the network
gets a natural rate limit without any central authority.

**Tickets** let frequent correspondents skip the stamp. A ticket is a
small per-pair token issued by the recipient — once you hold a valid
ticket for someone, your messages to them are accepted without a stamp.
Tickets rotate and expire on their own schedule, so a leaked ticket is
short-lived. The result: first contact is gated by proof-of-work, and
real conversations run unimpeded.
