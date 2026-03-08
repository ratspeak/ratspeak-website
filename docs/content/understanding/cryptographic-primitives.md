# Cryptographic Primitives

The specific algorithms and constructions that power Reticulum's security.

## Algorithm Suite

| Primitive | Algorithm | Key/Output Size | Purpose |
|-----------|-----------|:-----------:|---------|
| Digital Signatures | **Ed25519** | 256-bit | Signing announces, proofs, link verification |
| Key Exchange | **X25519** (ECDH) | 256-bit | Deriving shared secrets for encryption |
| Key Derivation | **HKDF** | Variable | Deriving per-packet and per-link symmetric keys |
| Symmetric Encryption | **AES-256-CBC** | 256-bit | Encrypting packet payloads and link traffic |
| Padding | **PKCS7** | N/A | Block alignment for AES-CBC |
| Hashing | **SHA-256** | 256-bit | Destination hashes, packet integrity, proofs |
| Hashing | **SHA-512** | 512-bit | IFAC signatures, internal operations |
| Authentication | **HMAC-SHA256** | 256-bit | Message authentication for encrypted tokens |
| IV Generation | **os.urandom()** | 128-bit | Random initialization vectors for AES-CBC |

## How They Fit Together

### Identity (at rest)

```
Identity = Ed25519_privkey (256-bit) + X25519_privkey (256-bit)
         = 512-bit total keyset
```

An Identity is a 512-bit keyset: an Ed25519 signing key (256-bit) and an X25519 encryption key (256-bit). The corresponding public keys are derived from these and used for addressing and announces.

### Destination Hash (derived)

```
Hash = SHA-256(app_name.aspects + Ed25519_pubkey + X25519_pubkey)[:16]
     = 128-bit truncated address
```

Where "aspects" refers to the dotted naming components (e.g., `lxmf.delivery`).

### Per-Packet Encryption (Single destinations)

For each packet to a Single destination:

1. Generate ephemeral X25519 keypair
2. Perform ECDH with destination's X25519 public key → shared secret
3. Derive symmetric key via HKDF
4. Encrypt payload with AES-256-CBC (random IV)
5. Authenticate with HMAC-SHA256
6. Attach ephemeral public key to packet

The encrypted output is packaged as a modified Fernet token (no version or timestamp metadata).

### Link Encryption

1. Both sides generate ephemeral X25519 keypairs
2. Perform ECDH → shared secret
3. Derive bidirectional symmetric keys via HKDF
4. All traffic encrypted with AES-256-CBC

### Announce Signing

1. Compose announce packet (destination hash + public key + app data)
2. Sign with Ed25519 private key
3. Receivers verify signature with the included public key

## Encrypted Token Format

Reticulum uses a modified **Fernet** token format:

- Based on the Fernet specification
- Uses ephemeral keys from ECDH on Curve25519
- **Modified**: no version or timestamp metadata fields (reducing overhead)
- Token = `IV || Ciphertext || HMAC`

## AES-256 Migration

Reticulum transitioned from AES-128 to **AES-256-CBC** as the default cipher. The migration path was: v0.9.5 added AES-256 support, v0.9.6 made it the default, and v1.0.0 removed legacy AES-128 handlers entirely. All current Reticulum traffic (v1.0.0+) uses AES-256.

## Implementation

| Component | Source |
|-----------|--------|
| X25519, Ed25519, AES-256-CBC | **OpenSSL** via PyCA/cryptography library |
| SHA-256, SHA-512 | Python standard library `hashlib` |
| HKDF, HMAC, PKCS7, Token format | Internal Reticulum implementation |

### Pure-Python Fallback

If `PyCA/cryptography` (and therefore OpenSSL) is unavailable, Reticulum falls back to internal **pure-Python** implementations of all primitives. This works but has significant drawbacks:

- Much slower performance (especially key exchange and symmetric encryption)
- Less security scrutiny compared to OpenSSL-backed implementations
- Only recommended for environments where PyCA truly cannot be installed

> **Warning**: Reticulum has not been externally security audited. While the cryptographic design uses well-established primitives, the implementation has not undergone formal review.

## What's Next

- [Security Model](../understanding/security-model) — how these primitives create a secure system
- [Wire Format](../understanding/wire-format) — where crypto meets the wire
- [Links & Communication](../understanding/links-and-communication) — encrypted channels
