# Cryptography & Protection

Reticulum is end-to-end encrypted by construction. There is no clear-text mode, no opt-in TLS layer, and no central authority that issues keys or certificates. Every node generates its own identity locally, and every payload that crosses the network is protected before it leaves the originator. This page walks through the primitives in use, the forward-secrecy story, and the network-layer abuse mitigations that sit alongside encryption.

## The keys you carry

A Reticulum identity is a flat, 64-byte secret stored on disk. It is two independent keypairs concatenated:

| Bytes | Purpose | Algorithm |
|------:|---------|-----------|
| 0–31  | Private key for key agreement | X25519 |
| 32–63 | Signing seed | Ed25519 |

The X25519 key participates in Elliptic Curve Diffie-Hellman during link establishment and announce processing, producing the shared secret from which symmetric session keys are derived.

The Ed25519 key signs announces, signs ratchet identities, and is what other nodes use to verify that a given destination hash legitimately belongs to the holder of this identity.

The two halves never mix: signing material is never used for encryption, and key-agreement material is never used to sign. Mixing them would weaken both — there is well-known cryptographic theory behind keeping signing and Diffie-Hellman keys disjoint, and Reticulum honors it.

The full 64-byte blob is the only thing required to reconstitute an identity on a new device. There is nothing on a server, no recovery mailbox, and no central registry — losing the file means losing the identity.

This is also why identity files should be stored carefully: they are bearer credentials. Anyone holding a copy can speak as that identity until it is rotated, and rotating an identity means publishing a new one and accepting that the old destination hash is gone.

## Destination hashes

Identities are long-lived; what gets routed across the network are *destination hashes*. A destination is an identity bound to a service name and aspect path. The wire-level identifier is a 16-byte truncated SHA-256 — the high 128 bits of the digest of the destination's full name and identity public keys.

This 128-bit truncation (`TRUNCATED_HASHLENGTH = 128`) is what shows up in announces, packet headers, and routing tables. It is short enough to keep packets small on constrained links, while still wide enough that collisions are computationally infeasible.

Two destinations that hash to the same 16 bytes would be a finding worth a paper; in practice the namespace is large enough to treat hashes as unique routing identifiers.

Because the hash is derived from both the identity's public keys and the destination name, a single identity can host many destinations — for example, a user's LXMF inbox, a file server, and a chat propagation node — each with its own routable hash. Conversely, if you know an identity, you can deterministically derive the hashes of any of its named destinations without asking the network.

## How traffic is encrypted

Once two endpoints know each other's identity public keys, establishing a *link* derives a fresh symmetric session via ECDH and HKDF.

Even single-packet, connectionless traffic to a known destination is encrypted: there is no plaintext "fallback" mode in the protocol.

The primitives used on the wire:

- **Symmetric cipher**: AES-256-CBC with PKCS7 padding. Used for encrypted link traffic and for opportunistic single-packet messages addressed to a destination's published key. Each packet uses a fresh initialization vector, prepended to the ciphertext.
- **Key derivation**: HKDF (HMAC-based key derivation function, RFC 5869) over the shared ECDH secret produces the AES key and HMAC key for the session. HKDF binds derivation to a context label, so the same shared secret never produces colliding keys for different uses.
- **Message authentication**: HMAC-SHA-256 covers each ciphertext. A packet that fails HMAC verification is dropped before any further processing — there is no fallback path that trusts unauthenticated bytes. This is encrypt-then-MAC, the construction with the cleanest security proofs.

Two flavors of encrypted traffic show up in practice. Single-packet *opportunistic* messages are useful for fire-and-forget delivery to a known destination — small payload, no round trip. Established *links* are full duplex sessions with their own derived keys, used whenever an exchange involves more than one packet or needs reliability and ordering guarantees.

The Rust implementation uses well-vetted Rust crypto crates: `ed25519-dalek` for signatures, `x25519-dalek` for key agreement, `aes` for the block cipher, `sha2` for hashing, and `hkdf` / `hmac` for the symmetric key schedule. There is no dependency on OpenSSL, no foreign-function-interface boundary in the cryptographic core, and no runtime that can swap the primitives at load time. Each primitive is a Rust crate audited and maintained in the open, with a single well-defined version compiled into the binary.

## Forward secrecy via ratchets

Long-lived identity keys are excellent for stable addressing, but they are a liability if used directly to encrypt traffic. An attacker who later compromises the identity could decrypt every captured packet ever sent to it — every message, every link session, every file transfer.

Reticulum addresses this with *ratchets*. Each announce carries a ratchet identity — an ephemeral public key, signed by the long-lived Ed25519 key, that rotates over time. Senders encrypting opportunistic packets, and peers establishing links, derive their session keys from the *current* ratchet, not the static identity. When the ratchet rotates, the previous ephemeral private key is forgotten.

Default parameters:

- **Rotation cadence**: 1800 seconds (30 minutes).
- **Retain window**: 512 ratchets, roughly 30 days of history.

A peer that compromises a ratchet key can decrypt traffic that used that specific ratchet, but cannot reach back to earlier sessions whose keys have already been deleted. This is forward secrecy at the protocol layer — no application changes required, and no cooperation needed from the sender.

The retain window exists because announces propagate at finite speed, and a brand-new ratchet may not have reached every potential sender yet. Keeping the previous ratchets around for a while preserves connectivity while still bounding how much past traffic a future compromise can read. Past the 30-day window, old ratchet private keys are gone for good.

## Stamps and tickets

Encryption protects payload contents, but it does not on its own prevent unwanted traffic. LXMF (the messaging layer that runs over Reticulum) adds two complementary mechanisms to make spam expensive without putting a gatekeeper in front of legitimate senders.

**Stamps** are proof-of-work tokens attached to messages. The recipient publishes a required cost; the sender must burn that many bits of work to produce a stamp the recipient will accept.

The cost is configurable per destination, so a public broadcast inbox can demand more work than a personal address. Because stamps are cryptographic and self-verifying, the recipient checks them locally with no third-party involvement.

**Tickets** are a fast-path bypass. A recipient can issue a ticket — essentially a signed token — to a sender they trust. Messages carrying a valid ticket skip the stamp requirement entirely.

Tickets are how an active conversation avoids paying proof-of-work on every reply: the recipient hands one out implicitly when they engage, and the sender uses it for subsequent traffic.

Together these mean a stranger pays a small CPU tax to reach you for the first time, while your existing contacts pay nothing. The recipient remains in control: stamp cost can be raised under attack, and tickets can be revoked or simply allowed to expire if a previously-trusted sender turns hostile.

## Ingress control and blackholing

At the interface layer, Reticulum applies hard limits on what gets accepted from the outside world, before announce or message processing runs. The goal is to keep a single misbehaving peer or interface from degrading the rest of the network.

- **Inbound packet caps**: each interface enforces per-second and per-window limits on inbound packets. Sustained over-budget traffic is dropped at the interface boundary, never reaching the routing or transport layers.
- **Announce caps**: by default, no more than 2% of an interface's bandwidth (`announce_cap`) is allowed to be announces. This prevents a noisy or hostile peer from flooding the routing table and starving real traffic of bandwidth.
- **Held announces**: when announces arrive faster than the cap allows, surplus announces are queued and drained slowly rather than dropped outright, so the routing table converges even on busy interfaces.
- **Blackholing**: an operator can mark a specific destination hash as routable-no-more using the `rnpath` tool. Subsequent packets for that hash are dropped at the local node and not forwarded. This is the primary lever for shutting down an abusive endpoint without coordinating with the rest of the mesh — each operator decides, locally, who they will and will not carry.

These controls are policy, not cryptography — they decide whether a packet is processed at all, which is a different question from whether its contents can be read. The two layers compose: a packet that fails ingress checks is dropped before its HMAC is even verified, and a packet that passes ingress but fails HMAC is dropped before any application sees it.

## IFAC pre-shared keys

Some interfaces should not be visible to the public mesh at all. Interface Authentication Codes (IFAC) implement that with a per-interface pre-shared key.

When IFAC is configured, every packet sent on the interface carries an authentication code derived from the pre-shared key and packet contents.

Receiving nodes that do not hold the same key cannot produce or verify these codes, so their packets are rejected and their announces never propagate inward. To an unauthorized listener, the interface looks silent.

The IFAC key has a configurable size — longer keys provide more security margin at the cost of slightly larger per-packet overhead. The key is symmetric and shared out-of-band: typically the operators of a private group exchange it directly, and rotating it requires coordinating with everyone on the interface.

IFAC is independent of end-to-end encryption: it does not replace identity keys or session encryption, and it does not provide forward secrecy. What it provides is a *gate* — a way to run a private interface on the same physical medium as a public one, where membership is governed by a shared secret rather than by routing alone.

The combination of identity-bound encryption, ratcheted forward secrecy, proof-of-work stamps, ingress limits, and IFAC gives operators a layered model: cryptographic guarantees on what is *said*, and policy controls on what is *heard*. Each layer is independent of the others, so weakening one — say, configuring a low stamp cost on a public inbox — does not undermine the rest.
