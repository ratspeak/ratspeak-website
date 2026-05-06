# Ratkey

Ratkey is an experimental Rust library — the `rns-ratkey` crate — for hardware-backed Reticulum identities. The target shape is simple: Ed25519 signing and X25519 ECDH keys live on a YubiKey 5 or Nitrokey 3 instead of a file on disk, and private operations happen on the device, gated by a PIN. **The Ratspeak desktop and mobile apps do not yet consume this library, and the hardware-token path is not release-grade yet.** Using Ratkey today means writing Rust against the crate, or experimenting with the `rnid-rs hw` tooling when `rns-tools` is built with the hardware feature, while accepting that the real-device backend is still being validated.

## Why hardware identity

A Reticulum identity is two private keys: Ed25519 for announces and signatures, X25519 for link establishment. When those keys live in a software file, anyone with read access to the host can clone your identity and impersonate you on the network. With a hardware token, the private halves are generated inside the device firmware and never leave it. The host only ever sees public keys and signed or derived results.

Hardware-backed identities are wire-compatible with software identities. Other peers cannot tell the difference, and you do not lose access to any part of the network by switching.

## Target hardware

| Device | Detection | Attestation |
|---|---|---|
| YubiKey 5 series | PC/SC reader name match | YubiKey attestation chains bundled (legacy and current firmware) |
| Nitrokey 3 series | PC/SC reader name match | Not provided by current Nitrokey firmware |

Both devices are reached through the platform PC/SC daemon — CryptoTokenKit on macOS, pcscd on Linux, WinSCard on Windows. Detection and APDU plumbing exist behind the `hardware` Cargo feature; mock-backed signing and ECDH are covered by tests. Physical-token verification, touch/PIN edge cases, and cryptographic attestation-chain verification are still release blockers.

## Use it from Rust

The shape of a typical flow looks like this:

```rust
use rns_ratkey::{HardwareIdentity, HwidConfig, MockPivSession};
use rns_ratkey::mock::TouchPolicy;
use rns_ratkey::provision::{provision_mock, ProvisionConfig};
use std::path::PathBuf;

// Mock provisioning generates token-shaped keys and writes a .hwid file
// containing only public keys and metadata. The real-device backend is
// behind the `hardware` feature and is still being validated.
let mut session = MockPivSession::new();
let config = ProvisionConfig {
    pin: "123456".to_string(),
    nickname: "field-key".to_string(),
    touch_signing: TouchPolicy::Always,
    touch_encryption: TouchPolicy::Cached,
    identities_dir: Some(PathBuf::from(".ratspeak/identities")),
};
let result = provision_mock(&mut session, &config)?;

// Later sessions load the .hwid and bind it to a token session; the
// constructor fails closed if the public keys do not match the file.
let hwid_path = result.hwid_path.as_ref().expect("identity.hwid written");
let hwid = HwidConfig::from_file(hwid_path)?;
let identity = HardwareIdentity::from_hwid_mock(hwid, session)?;
```

The public surface is small: `HardwareIdentity` for the bound-identity shape, `HwidConfig` for the on-disk metadata file, `ProvisionConfig` / `ProvisionResult` for first-time setup, `PinCache` for short-lived PIN caching, and `RatkeyError` for the error type. A `MockPivSession` with real Ed25519/X25519 crypto is exported for tests and dev. The real PIV-over-PC/SC backend is gated behind the `hardware` Cargo feature so that builds without system PC/SC libraries still compile.

## Status and roadmap

The library is useful today as an integration target and testbed for advanced users building their own Reticulum applications. The public identity shape, `.hwid` metadata, signing, ECDH, decrypt flow, and fail-closed key mismatch behavior are implemented and mock-tested. Real YubiKey/Nitrokey operation remains experimental until it passes hardware-gated tests.

What is not built yet:

- An "Identity → Move to hardware key" flow inside the Ratspeak app. The desktop and mobile clients do not consume Ratkey at all today.
- A turn-key identity migration flow inside Reticulum applications. Lower-level external-signing hooks exist, but app integration is still custom work.
- Physical-token verification for signing, ECDH, disconnects, wrong PINs, touch timeouts, and slot mismatch cases.
- Full X.509 chain verification for attestation certificates.
- A published `examples/` directory. The contract above is the canonical shape; copy from the unit tests until examples ship.

Ratspeak app integration is on the roadmap. Until it lands, Ratkey is most useful as a building block for advanced users, not a turn-key feature.

## License

AGPL-3.0-or-later, version 0.9.0 as part of the rsReticulum crate set. Source at [github.com/ratspeak/rsReticulum](https://github.com/ratspeak/rsReticulum) under `crates/rns-ratkey`. Not yet published to crates.io.
