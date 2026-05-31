# Ratkey

Ratkey is an experimental Rust library — the `rns-ratkey` crate — for hardware-backed Reticulum identities. The shape is simple: Ed25519 signing and X25519 ECDH keys live on a YubiKey 5-class PIV token instead of a private-key file, and private operations happen on the device, gated by a PIN. **The Ratspeak desktop app consumes this library**: you can provision a new YubiKey identity, add an existing key, restore a recoverable identity from a 12-word phrase, unlock with a PIN once per session, auto-lock after a timeout, change the YubiKey PIV PIN, and reset the PIV app when necessary.

It is still labeled **experimental** because this is new desktop hardware-token plumbing, but the real-token path has been exercised on a YubiKey 5.7.4, including on-card signing, on-card ECDH, attestation-chain verification, PIV reset/recovery flows, and TDES management-key compatibility for older YubiKey PIV defaults. **Hardware identities are desktop-only**; on mobile you use a software identity, optionally PIN-encrypted at rest, and carry it across with a 12-word recovery phrase. A tap-to-unlock NFC model is future work. The crate also exposes the BIP-39 seed derivation and PIN-encrypted vault that back recoverable software identities on every platform.

## Why hardware identity

A Reticulum identity is two private keys: Ed25519 for announces and signatures, X25519 for link establishment. When those keys live in a software file, anyone with read access to the host can clone your identity and impersonate you on the network. With a hardware token, the private halves are generated inside the device firmware and never leave it. The host only ever sees public keys and signed or derived results.

Hardware-backed identities are wire-compatible with software identities. Other peers cannot tell the difference, and you do not lose access to any part of the network by switching.

## Target hardware

| Device | Detection | Attestation |
|---|---|---|
| YubiKey 5 series | PC/SC reader name match | YubiKey attestation chains bundled and verified |
| Nitrokey 3 series | PC/SC reader name match | Library target; app UX and validation are centered on YubiKey/PIV today |

Devices are reached through the platform PC/SC daemon — CryptoTokenKit on macOS, pcscd on Linux, WinSCard on Windows. Detection and APDU plumbing live behind the `hardware` Cargo feature so non-hardware builds do not pull in PC/SC dependencies. Mock-backed signing and ECDH are covered by tests, and the YubiKey 5 path has been validated against physical hardware.

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

The library is useful today as the desktop Ratspeak hardware-identity backend and as an integration target for advanced users building their own Reticulum applications. The public identity shape, `.hwid` metadata, signing, ECDH, decrypt flow, PIN unlock/cache/lock, PIV reset, recoverable provisioning/restore, attestation-chain validation, and fail-closed key mismatch behavior are implemented. Real YubiKey operation has been validated; broader token coverage remains experimental.

What is not built yet:

- An "Identity -> Move to hardware key" migration flow for an existing software identity. Today you provision a new hardware identity, add an existing Ratspeak YubiKey identity, or restore a recoverable phrase onto a key.
- Mobile NFC hardware-key unlock. Mobile uses software identities and recovery phrases for now.
- A turn-key hardware identity UX for non-Ratspeak Reticulum applications. Lower-level external-signing hooks exist, but app integration is still custom work.
- Broad Nitrokey and cross-token physical validation. The app path is YubiKey/PIV-focused today.
- A published `examples/` directory. The contract above is the canonical shape; copy from the unit tests until examples ship.

Ratspeak app integration is desktop-only and experimental. Treat hardware-only identities carefully: if the token is lost or reset, the identity is gone unless you chose the recoverable phrase-backed setup.

## License

AGPL-3.0-or-later, version 0.9.4 as part of the rsReticulum crate set. Source at [github.com/ratspeak/rsReticulum](https://github.com/ratspeak/rsReticulum) under `crates/rns-ratkey`. Not yet published to crates.io.
