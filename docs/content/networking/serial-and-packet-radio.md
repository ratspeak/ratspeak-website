# Serial & Packet Radio

Wired serial links and packet-radio framers are the original Reticulum carriers. They predate IP, predate Wi-Fi, and they still work when nothing else does. If you have a USB-to-serial cable, a TNC, or a LoRa modem with KISS firmware, Ratspeak can put traffic across it.

## Why serial interfaces matter

Serial is the lowest-common-denominator transport. It runs over copper, fiber, RS-232 cables strung between buildings, AX.25 packet radio on amateur bands, LoRa modems on ISM bands, and arbitrary half-duplex links you build yourself. There is no DHCP, no router, no upstream provider — two endpoints, a wire or an antenna, and a framer in between.

Different framers exist because different physical layers have different needs. A clean point-to-point cable can use almost anything. A noisy radio link wants escape sequences and CRCs. An amateur band wants callsigns. Pick the interface that matches the framing your hardware actually speaks.

## SerialInterface

Raw serial. No framing layer of its own — Reticulum packets go straight onto the wire. Use this for direct point-to-point cables and for hardware that does not speak KISS or HDLC.

Configuration parameters:

- `port` — device path (`/dev/ttyUSB0`, `/dev/cu.usbserial-XXXX`, `COM3`)
- `speed` — baud rate (e.g. `115200`)
- `databits` — typically `8`
- `parity` — `none`, `even`, or `odd`
- `stopbits` — typically `1`

Both ends must agree on every parameter. A baud-rate mismatch produces silence; a parity mismatch produces garbage that looks like silence after the CRC fails.

Choose SerialInterface when you control both ends of a clean physical link and want minimum overhead.

## KISSInterface (TNCs and LoRa modems)

Classic KISS framing — the format every packet-radio TNC and most LoRa modem firmwares already speak. Frames are delimited by `0xC0` and escaped with `0xDB` so the delimiter never appears inside payload bytes.

Use KISSInterface for:

- Hardware TNCs (Kantronics, MFJ, etc.)
- LoRa modems running KISS-mode firmware
- Anything labeled "KISS-compatible"

In addition to the serial parameters above, KISS exposes the timing knobs that traditional TNCs need:

- `preamble` — milliseconds of carrier before the frame
- `txtail` — milliseconds of carrier after the frame
- `persistence` — p-persistence value for CSMA channel access
- `slottime` — slot duration for CSMA backoff

Defaults work for most modern modems. Tune these only if you are sharing a channel with other stations and need to play nicely with their timing.

## AX.25 KISS (amateur radio)

AX.25 is the framing layer used on amateur packet-radio bands. AX25KISSInterface wraps Reticulum packets in AX.25 frames and ships them through a KISS TNC. Required when operating on amateur frequencies — the regulator wants to see your callsign on the air.

Configuration adds:

- `callsign` — your assigned amateur callsign
- `ssid` — secondary station identifier (`0`–`15`)

You must hold a valid amateur license and use your own callsign. AX.25 framing is also useful on the air because other amateur operators can hear and identify your traffic with standard packet tools.

## HDLC

HDLC framing for point-to-point links with a clean physical layer. Frames are delimited by `0x7E` and escape sequences XOR with `0x20`. HDLC is well-defined, simple to implement, and widely understood — making it a good choice when you are bridging two endpoints with custom or industrial hardware that does not speak KISS.

HDLCInterface uses the same serial parameters as SerialInterface. It assumes the link is reliable enough that you do not need the timing parameters that KISS exposes for half-duplex radio.

Choose HDLC over raw Serial when you need framing — for example, when running multiple Reticulum links over a multiplexer, or when the receiving side needs explicit frame boundaries to recover from sync loss.

## PipeInterface

PipeInterface spawns a subprocess and reads/writes Reticulum packets to its stdin/stdout. It is the escape hatch for non-standard transports — if you can write a small program that reads bytes from one place and writes them to another, you can carry Reticulum over it.

Use cases:

- Tunnel through SSH or `socat`
- Bridge to legacy radio control software
- Wrap proprietary modem protocols
- Test new transports without writing a Rust interface

Configuration is just the command to spawn. The subprocess inherits stdin/stdout from Reticulum; everything else (arguments, environment, working directory) is up to you.

PipeInterface trusts the wrapped command. If the subprocess dies, the interface goes down — restart policies are your responsibility.

## Platform support

Serial framers (Serial, KISS, AX.25 KISS, HDLC, RNode) are gated behind a build feature on desktop. Default desktop builds ship with serial enabled. Custom builds that strip the feature lose all serial-based interfaces — including USB-attached LoRa modems.

iOS does not expose USB serial to third-party applications. Apple's policy prevents accessory apps from opening arbitrary USB devices, so serial framers are unavailable on iOS regardless of which cable you plug in. iPad and iPhone users wanting LoRa or radio connectivity should use Bluetooth-attached hardware (BLE RNode) instead.

Android exposes USB serial through the host APIs and can run the full set of serial framers. macOS, Linux, and Windows desktop builds all support every framer documented above.
