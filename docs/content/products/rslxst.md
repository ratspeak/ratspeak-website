# rsLXST

rsLXST is the experimental Rust implementation of LXST telephony for Reticulum.
The first public target is Opus voice calling for Ratspeak and other Rust apps,
not complete parity with Python LXST.

Python LXST remains the source of truth. rsLXST targets wire compatibility for
the implemented telephony surface and uses live interop tests against a pinned
Python LXST reference to keep that behavior honest.

## What it supports

The supported release surface is library-first:

- `lxst.telephony` Reticulum destination registration and announces.
- Incoming and outgoing call setup over Reticulum links.
- Answer, reject, busy, timeout, hangup, and teardown.
- LXST signalling and media packet framing.
- Raw audio frame encode/decode for compatibility and app plumbing.
- Opus voice profiles for Medium Quality, High Quality, Super High Quality,
  Low Latency, and Ultra Low Latency calls.
- Active profile switching after a call is established.
- Typed Rust control and event channels for apps such as Ratspeak.

Applications own the platform layer: microphone and speaker permissions, audio
session lifecycle, device routing, capture, playback, resampling, notifications,
and user interface.

## What is not included yet

Features users may know from Python LXST that are not part of the first rsLXST
release:

- `rnphone` parity or a public `rnphone-rs` executable.
- Codec2 low-bandwidth voice encode/decode.
- Built-in CPAL or native microphone/speaker backends.
- Python LXST's local audio graph: sources, sinks, pipelines, mixers, filters,
  AGC, tones, file playback, and recording.
- Broadcast and non-telephony streaming primitives.
- Hardware keypad, display, and ringer integration.

Those are future parity targets, not current release promises.

## Interoperability

The release gate covers bidirectional Python interop for implemented behavior:

- Rust-to-Python and Python-to-Rust call establishment.
- Answer, hangup, reject, busy, and timeout flows.
- Raw media in both directions.
- Opus media across the Opus voice profile matrix.
- Profile switching initiated by Rust and by Python.

If profile switching proves unreliable for a specific Python client or network
topology, Ratspeak may accept inbound Python profile signals while limiting
automatic outbound switching to known Rust/Ratspeak peers until the path is
proven.

## Build

Clone rsLXST next to rsReticulum:

```bash
mkdir ratspeak-src
cd ratspeak-src
git clone https://github.com/ratspeak/rsReticulum
git clone https://github.com/ratspeak/rsLXST
cd rsLXST
cargo build --release
```

Run the local gate:

```bash
cargo fmt --all -- --check
cargo clippy --workspace -- -D warnings
cargo test --workspace
```

Live Python interop tests need Python Reticulum/LXMF dependencies and the pinned
LXST reference checkout used by maintainers:

```bash
python -m pip install rns lxmf numpy
```

Source: [github.com/ratspeak/rsLXST](https://github.com/ratspeak/rsLXST).
