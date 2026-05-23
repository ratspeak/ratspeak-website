# LoRa Radio Interfaces

An RNode is a LoRa transceiver running open firmware that speaks the KISS protocol over USB serial, Bluetooth LE, or a TCP bridge. Any board in that family — RNode Mk2, LilyGO T-Beam / T-Echo, Heltec, RAK4631, homebuilt builds on a supported Semtech radio — works. The radio handles modulation; Reticulum handles addressing, encryption, and routing on top of it.

LoRa is the slow lane of the network. Throughput is measured in hundreds of bytes per second, not kilobits, and a frame may take seconds to a minute on the air. In return you get kilometers of range from a battery-sized radio and the freedom to operate without infrastructure.

## Connecting an RNode in Ratspeak

Open the Network view and tap **Add LoRa Device**. Four transports are available depending on platform:

- **USB / Serial** — desktop (Linux, macOS, Windows). The radio enumerates as a serial port; pick it from the dropdown.
- **USB-OTG** — Android phones with USB host mode, using a USB-C OTG cable. Grant the per-device permission prompt the first time you plug in.
- **Bluetooth** — desktop and mobile. Put the RNode into pairing mode first (hold the left button until the OLED prompts), then scan. The 6-digit passkey on the OLED is entered on the phone. Bonding only happens once; subsequent connects are silent.
- **TCP** — desktop and mobile. Use this when the RNode's KISS stream is exposed over a local TCP bridge, for example by firmware with TCP support or by a nearby always-on host attached to the radio.

After choosing a transport, set a name, region, and preset. Ratspeak writes the interface config and brings it up immediately — no manual config file editing. Adding another transport for the same physical RNode automatically tears down the older side, so the radio is never driven from two places at once.

## RNode over TCP

RNode TCP is still a LoRa radio interface. It is not the same thing as a normal **TCP Client** interface. A TCP Client connects Ratspeak to another Reticulum node or hub; RNode TCP connects Ratspeak to the radio's RNode/KISS control stream, then packets still go over LoRa on the air.

In the TCP tab, enter an endpoint as `host`, `host:port`, `tcp://host`, or `tcp://host:port`. If you omit the port, Ratspeak uses the RNode TCP default port `7633`. IPv6 literals should use brackets when a port is present, for example `tcp://[fd00::10]:7633`.

Keep RNode TCP on a trusted LAN, hotspot, or VPN unless the bridge itself adds authentication. Anyone who can open the raw radio control stream can spend your airtime and change how the attached radio behaves.

## The 8 firmware presets

These are the RNode/Ratspeak preset family exposed in the desktop and mobile dashboard and mirrored by current Ratdeck/rsCardputer firmware. Smaller screens may present them differently, but the radio parameters are the same.

| Preset           | SF  | BW (kHz) | CR  | TX (dBm) | Use it for                                                           |
|------------------|-----|----------|-----|----------|----------------------------------------------------------------------|
| Short Turbo      | 7   | 500      | 4/5 | 14       | Same-room or same-building. Highest bitrate, lowest range.            |
| Short Fast       | 7   | 250      | 4/5 | 14       | Indoor, dense urban. Fast, modest range.                              |
| Short Slow       | 8   | 250      | 4/5 | 14       | Slightly more reach than Short Fast at the same power budget.         |
| Medium Fast      | 9   | 250      | 4/5 | 17       | Neighborhood-scale links with line-of-sight obstructions.             |
| Medium Slow      | 10  | 250      | 4/5 | 17       | Suburban / rural with mild terrain. Balanced.                         |
| Long Turbo       | 11  | 500      | 4/8 | 22       | Wide bandwidth long-haul. Higher airtime than Long Fast.              |
| **Long Fast**    | 11  | 250      | 4/5 | 22       | The de-facto community default. Long range, reasonable throughput.    |
| Long Moderate    | 11  | 125      | 4/8 | 22       | Maximum sensitivity over difficult terrain. Slow but reaches farther. |

If you don't know which to pick, **Long Fast** matches what most other public LoRa mesh nodes use. Two radios can only hear each other if they share the same frequency, SF, BW, and CR — pick a preset everyone else in your area is running.

## Tunable parameters

Presets are starting points. The underlying parameters Ratspeak writes to the RNode are:

- **Frequency** — center frequency in Hz. Must match the regional band, stay inside any sub-band restrictions, and ideally avoid channels heavily used by other LoRa traffic in your area.
- **Spreading factor (SF 7–12)** — higher SF = greater sensitivity / range, exponentially longer airtime. SF12 is roughly 32× the on-air time of SF7 for the same payload. Doubling SF doubles range in ideal conditions and roughly doubles airtime.
- **Bandwidth (62.5–500 kHz)** — wider BW = faster, less sensitive, more spectrum used. Narrow BW gains sensitivity (and range) at the cost of throughput, and is more vulnerable to oscillator drift between cheap radios.
- **Coding rate (4/5–4/8)** — forward error correction overhead. 4/5 is fastest, 4/8 the most resilient at ~60% the data rate.
- **TX power (typically 14–22 dBm)** — radio output. Cap depends on regional rules and the antenna gain you're feeding.
- **Preamble length** — symbols transmitted before each frame. Longer preambles help under heavy interference at the cost of airtime.

Both nodes on a link must agree on frequency, SF, BW, and CR. TX power and preamble can differ per side.

## Regional bands

LoRa is unlicensed in ISM bands but the bands themselves are regional. **You are responsible for staying within local regulations** — duty cycle, max EIRP, channel plan.

- **Americas / Australia** — 915 MHz (902–928 MHz US, 915–928 MHz AU)
- **Europe** — 868 MHz (863–870 MHz EU, with sub-band duty-cycle limits)
- **Asia** — 923 MHz (varies sharply by country; check your national regulator)

Ratspeak's region picker only sets a default center frequency. It does not enforce duty cycle or power caps for you — that is on the operator.

If you're unsure what's legal for your location, check your national regulator's ISM-band rulings before transmitting. Receive-only operation is legal essentially everywhere LoRa hardware is sold.

## Airtime limits

For installations where you must stay under a regulatory duty cycle (notably the EU 868 MHz sub-bands), the RNode interface accepts two optional caps:

- **Long-window limit** — percent of a long rolling window the radio is allowed to transmit.
- **Short-window limit** — percent of a short rolling window the radio is allowed to transmit.

When the limit is reached the radio stops transmitting until the window slides forward; receive is unaffected, so the node still hears its neighbors and routes paths it can't currently emit on. These are best-effort soft caps — not a substitute for understanding your region's rules. Set them per-interface in the radio's advanced config; they default to unset.

Pairing duty-cycle caps with a slower preset (Long Fast or Long Moderate) is usually a better way to stay legal than running fast and throttling — slow presets carry more bytes per percent of airtime.

## Multi-radio boards

Boards with multiple sub-radios — a RAK4631 with stacked LoRa shields, dual-radio RNode builds — are exposed as a single interface that fans out internally. Each sub-radio gets its own frequency, SF/BW/CR, and TX power, and Reticulum treats them as separate physical paths sharing one serial endpoint. This is the practical way to bridge two regional bands (a 868 MHz cell and a 433 MHz long-haul link, for example) on one device.

Single-radio boards use the standard RNode interface. Multi-radio boards use the multi-interface form. Ratspeak picks the right one based on what the firmware reports during enumeration, so adding the device looks the same in the UI either way — you'll just see one row per active sub-radio in the Network view once it's up.

## Practical notes

- Two radios will only hear each other if frequency, SF, BW, and CR all match. Mismatched preset = silent failure.
- Range is dominated by antenna and line-of-sight, not TX power. A good antenna at 14 dBm beats a bare PCB trace at 22 dBm.
- The radio is half-duplex. Heavy TX from one node briefly deafens every node that can hear it. On busy meshes, slower presets backpressure better than fast ones.
- LoRa is shared spectrum. Anyone in your area on the same channel sees your packets at the radio layer; Reticulum's encryption is what keeps the contents private.
