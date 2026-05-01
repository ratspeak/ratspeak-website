# Ratkey

Ratkey is a Rust library — the `rns-ratkey` crate — for hardware-backed Reticulum identities. Your Ed25519 signing key and X25519 ECDH key live on a YubiKey 5 or Nitrokey 3 instead of a file on disk; signing and key agreement happen on the device, gated by a PIN. **The Ratspeak desktop and mobile apps do not yet consume this library.** Using Ratkey today means writing your own Rust code against the crate.

## Why hardware identity

A Reticulum identity is two private keys: Ed25519 for announces and signatures, X25519 for link establishment. When those keys live in a software file, anyone with read access to the host can clone your identity and impersonate you on the network. With a hardware token, the private halves are generated inside the device firmware and never leave it. The host only ever sees public keys and signed or derived results.

Hardware-backed identities are wire-compatible with software identities. Other peers cannot tell the difference, and you do not lose access to any part of the network by switching.

## Supported hardware

| Device | Detection | Attestation |
|---|---|---|
| YubiKey 5 series | PC/SC reader name match | YubiKey attestation chains bundled (legacy and current firmware) |
| Nitrokey 3 series | PC/SC reader name match | Not provided by current Nitrokey firmware |

Both devices use the standard PIV protocol. Ratkey talks to them through the platform PC/SC daemon — CryptoTokenKit on macOS, pcscd on Linux, WinSCard on Windows.

## Use it from Rust

The shape of a typical flow looks like this:

```rust
use rns_ratkey::{HardwareIdentity, HwidConfig, PinCache};
use rns_ratkey::provision::{ProvisionConfig, ProvisionResult};

// First-time provisioning generates keys on the device and writes a .hwid file
// containing only public keys and metadata.
let result: ProvisionResult = rns_ratkey::provision::provision(&config, &mut session)?;

// Later sessions load the .hwid and bind it to the live token; the constructor
// fails closed if the on-device public keys don't match what the file claims.
let hwid = HwidConfig::load(&result.hwid_path.unwrap())?;
let identity = HardwareIdentity::from_hwid_mock(hwid, session)?;
```

The public surface is small: `HardwareIdentity` for a bound, ready-to-use identity, `HwidConfig` for the on-disk metadata file, `ProvisionConfig` / `ProvisionResult` for first-time setup, `PinCache` for short-lived PIN caching, and `RatkeyError` for the error type. A `MockPivSession` with real Ed25519/X25519 crypto is exported for tests and dev. The real PIV-over-PC/SC backend is gated behind the `hardware` Cargo feature so that builds without system PC/SC libraries still compile.

## Status and roadmap

The library is workable today for advanced users building their own Reticulum applications. You can provision a YubiKey, derive a Reticulum identity hash from on-device keys, sign announces, and run X25519 ECDH for link establishment.

What is not built yet:

- An "Identity → Move to hardware key" flow inside the Ratspeak app. The desktop and mobile clients do not consume Ratkey at all today.
- A drop-in identity swap inside Reticulum's link and transport layers. Until that lands, you wire a hardware identity into your own application code paths.
- Full X.509 chain verification for attestation certificates.
- A published `examples/` directory. The contract above is the canonical shape; copy from the unit tests until examples ship.

Ratspeak app integration is on the roadmap. Until it lands, Ratkey is most useful as a building block for advanced users, not a turn-key feature.

## License

MIT, version 0.1.0. Source at [github.com/ratspeak/rsReticulum](https://github.com/ratspeak/rsReticulum) under `crates/rns-ratkey`. Not yet published to crates.io.
