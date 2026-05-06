# Cryptography & Protection

Reticulum is built around cryptographic identities instead of accounts, servers, or certificate authorities. For Ratspeak users, the practical result is that private messages are encrypted to the recipient before they leave the sender, and intermediate transport nodes forward ciphertext.

There is one important nuance: Reticulum also supports **Plain** destinations for direct local public broadcast. Plain destinations are intentionally unencrypted and are not transported over multiple hops. They are not used for private Ratspeak or LXMF messages.

## Identity Keys

A Reticulum identity is a 64-byte private keyset:

| Bytes | Purpose | Algorithm |
|------:|---------|-----------|
| 0-31 | Key agreement | X25519 |
| 32-63 | Signing seed | Ed25519 |

The X25519 key is used for Diffie-Hellman key agreement. The Ed25519 key signs announces, link proofs, receipt proofs, and other identity-bound data.

The two roles stay separate. Signing material is not used for encryption, and key-agreement material is not used for signatures.

The private key file is a bearer credential. If you lose it, you lose the identity and the destinations derived from it. If someone else copies it, they can impersonate that identity. There is no recovery server or central registry that can restore or revoke it for you.

## Destination Hashes Are Not Secrets

Reticulum routes on 16-byte destination hashes. A destination hash is public addressing material, not a password.

For a Single destination, the hash is derived from the application destination name and the identity's public-key hash. That means:

- The same identity can create multiple destinations, such as an LXMF inbox and another application endpoint.
- Two users can use the same destination name without address collision.
- Knowing a destination hash is enough to ask the network for a path, but not enough to decrypt traffic for that destination.

Destination hashes are intentionally short to keep packet overhead low on scarce links. The 128-bit address space is large enough for practical use while preserving the 500-byte packet budget.

## Encrypted Packets

For Single destinations, the sender can encrypt a packet without a network round trip if it already knows the destination's public key or current ratchet key from an announce.

The simplified flow is:

1. Generate fresh ephemeral X25519 key material.
2. Derive a shared secret with the destination public key or ratchet key.
3. Derive symmetric encryption and authentication keys with HKDF.
4. Encrypt the payload and authenticate the ciphertext.
5. Include the sender's ephemeral public key in the encrypted token so the recipient can derive the same shared secret.

Every packet uses fresh ephemeral key material. If a packet fails authentication, it is dropped before application code sees it.

## Links and Forward Secrecy

Links provide forward secrecy through their own ephemeral key exchange. The link initiator and destination exchange fresh key material during link establishment and derive session keys for that link. Those keys are not long-term identity keys and are not reused for later links.

This is why links are the right substrate for larger or stateful work: they are encrypted, efficient after setup, and do not require the initiator to reveal a long-term identity unless the application chooses to identify over the link.

## Ratchets

Ratchets provide forward secrecy for link-less Single destination packets.

When a destination has ratchets enabled, its announces include a rotating X25519 ratchet public key signed by the long-term identity. Senders that know the current ratchet encrypt to that ratchet key instead of the static identity encryption key. When old ratchet private keys are discarded, old captured link-less packets become harder to decrypt even if the long-term identity is later compromised.

Default parameters:

| Parameter | Default |
|-----------|---------|
| Generated ratchets retained | 512 |
| Minimum rotation interval | 1800 seconds |
| Received ratchet expiry | 30 days |

The retention window exists because announces take time to propagate. Peers may still encrypt to a recent ratchet until they learn the newest one.

## Cryptographic Primitives

The Reticulum protocol primitives are:

- Ed25519 for signatures.
- X25519 for ECDH key exchange.
- HKDF for key derivation.
- AES-256-CBC with PKCS7 padding for encrypted tokens.
- HMAC-SHA-256 for message authentication.
- SHA-256 and SHA-512 for hashing.

The Python reference implementation uses PyCA/OpenSSL for the main public-key and AES primitives in normal installations, with internal implementations for HKDF, HMAC, token framing, and PKCS7 padding. Ratspeak's Rust implementation uses Rust crypto crates while preserving the same protocol behavior and wire compatibility.

## LXMF Stamps and Tickets

Encryption prevents intermediaries from reading messages. It does not, by itself, stop someone from sending unwanted encrypted messages to a public destination.

LXMF adds spam resistance with stamps and tickets.

**Stamps** are proof-of-work tokens attached to messages. The recipient publishes a required cost, and an unknown sender must spend CPU to produce a stamp that meets that cost.

**Tickets** are a trusted fast path. A recipient can issue a ticket to a sender, and messages carrying a valid ticket bypass the stamp requirement until the ticket expires or rotates.

This keeps first contact permissionless without making repeated conversation expensive.

## Ingress Control

Reticulum also protects scarce interfaces at the routing layer.

**Announce caps** limit how much bandwidth an interface can spend on announces. The default is 2% of interface bandwidth.

**Announce queues** hold excess announces and drain them according to available bandwidth, prioritizing lower-hop destinations first.

**Ingress control** limits how quickly new destination announces are accepted on public interfaces, especially where many peers can connect and announce at once.

These controls are not encryption. They decide whether packets and announces are worth processing on a local interface.

## Blackholing

Blackholing lets an operator block an identity locally at the transport layer. It can stop announces from that identity from propagating through your node and prevent your node from carrying traffic toward it.

Blackholing is local policy. There is no global block switch in Reticulum, and there should not be one. Operators decide what their own nodes and infrastructure will carry.

## IFAC Private Segments

Interface Access Codes add a shared-secret gate to an interface. When IFAC is configured, outbound packets include an authentication code derived from the interface's IFAC material. Receivers without matching material drop the packets before they enter the Reticulum stack.

IFAC is useful when you want a private segment on a shared carrier, such as a public TCP listener or a radio channel used by multiple groups.

IFAC does not replace end-to-end encryption and does not provide forward secrecy. It is an access filter for an interface. Reticulum identity encryption still protects private payloads above it.
