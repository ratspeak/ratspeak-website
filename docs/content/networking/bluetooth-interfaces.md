# Bluetooth Interfaces

Ratspeak speaks two different Bluetooth dialects, and they are not interchangeable. The **BLE RNode bridge** connects a phone to a LoRa radio over Bluetooth so you can carry a transceiver in your pocket without a USB cable. **Bluetooth Peer** connects two phones (or laptops) directly to each other so they form a Reticulum link with no radio, no router, and no internet between them.

Both share the same underlying stack: Ratspeak uses the cross-platform `btleplug` crate with native code per OS — Core Bluetooth via `objc2` on macOS and iOS, JNI bindings on Android, and BlueZ via `bluer` on Linux. There is no Python runtime in the loop. Bluetooth support is gated behind the `ble` build feature; mobile builds turn it on by default.

## BLE RNode bridge

The BLE RNode bridge is the wireless equivalent of plugging a radio into a USB port. The phone or laptop is the BLE central; the peripheral is a BLE-equipped RNode or a Ratspeak handheld exposing an RNode-compatible bridge profile, such as Ratdeck when that mode is enabled. Ratcom's current public firmware is standalone/Wi-Fi on the bridge side; its BLE service is not a usable radio bridge yet. KISS frames — the same byte stream that runs over USB serial — are tunneled through a GATT characteristic instead of a UART. The result is point-to-point: one phone, one radio.

The radio still does the radio work. The bridge replaces nothing about LoRa modulation, presets, or regional bands; it only changes how the phone talks to the modem. Throughput, latency, and on-air behavior match a USB-tethered radio of the same model.

### Pairing an RNode

1. Put the radio into BLE pairing or advertising mode. On RNode firmware with a screen this is usually a long-press of the left button until the OLED shows a 6-digit passkey. Ratdeck advertises its bridge profile when BLE is enabled in settings.
2. In Ratspeak, open the Network view and tap **Add LoRa Device** then **Bluetooth**. Nearby radios appear within a few seconds.
3. Select the radio. The OS surfaces the standard pairing prompt; enter the passkey if one is shown on the device.
4. Set a name, region, and preset. Ratspeak brings the interface up immediately.

Bonding is persistent. The next time the radio is in range, Ratspeak reconnects without prompting. If the same physical RNode is later plugged in over USB, the BLE side tears down automatically — the radio is never driven from two transports at once.

If a connect fails partway through, power-cycle the radio and remove the stale pairing from the OS Bluetooth settings before retrying. Stuck bonds are the most common cause of "scans but won't connect." On Linux, make sure the user account is in the `bluetooth` group; on Android, granting the *Nearby devices* runtime permission is required before any scan returns results.

### What goes over the wire

The KISS frame coming off the radio is wrapped, fragmented to fit the negotiated BLE MTU (typically 185–244 bytes depending on the OS and the radio's firmware), and reassembled on the other side. Reticulum's encryption is end-to-end across the link, so anyone sniffing the BLE channel sees ciphertext only. The link key itself is established by Reticulum, not by the Bluetooth pairing — losing the BLE bond does not leak past traffic.

## Bluetooth Peer

Bluetooth Peer is a phone-to-phone (or phone-to-laptop) Reticulum link carried directly over Bluetooth Low Energy GATT. Every Ratspeak node running with Bluetooth Peer enabled is **both** an advertiser and a scanner — the roles are symmetric. When two nodes see each other, the one with the lexicographically lower identity hash takes the central role and opens the connection. This deterministic tiebreak prevents both sides from connecting at once.

There is no pairing step and no shared key to enter. Reticulum's normal identity handshake runs on top of the GATT link, so the security model is identical to any other Reticulum interface: encrypted, authenticated, and tied to long-term identities — not to the Bluetooth bond.

The advertised GATT primary service is:

- **Bluetooth Peer** — `a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d`

The user-facing transport is only **Bluetooth Peer**. Platform-specific compatibility plumbing may register additional GATT services under the hood, but users should not have to choose a protocol or configure UUIDs by hand.

Use Bluetooth Peer as a "right-here-with-you" sideband: a few people in the same room, a vehicle convoy, a small group on a hike, or a backstage crew. It is not a long-distance transport — it is the layer that makes nearby devices reachable when LoRa is overkill and Wi-Fi is unavailable or untrusted.

### Enabling it

Open Network → **Bluetooth Peer** and toggle it on. The state persists, so Bluetooth Peer comes back up on next launch. No configuration file edits, no daemon restart. Discovery is continuous in the background; peers appear in the Peers list and Network view as they come into range.

Bluetooth Peer registers as a normal Reticulum interface, which means announces, links, resources, and LXMF traffic all flow through it the same way they would over LoRa or TCP. A peer that is reachable both over Bluetooth and over LoRa will be picked over Bluetooth when it is closer in hop cost — the transport layer chooses, not the user.

### Desktop requirements

On Windows, the Bluetooth Peer advertiser/peripheral role requires the MSIX build. The plain `.exe` / MSI builds can still run the app, but they do not expose the packaged-app Bluetooth capability needed for nearby devices to discover and connect to the Windows machine over Bluetooth Peer.

On Linux, the advertiser/peripheral role requires a working BlueZ local GATT server and LE advertising path. In practice that means `bluetoothd` is running, the user has permission to use the adapter through BlueZ or polkit, the adapter supports LE advertising, and some distributions need `Experimental = true` in `/etc/bluetooth/main.conf` followed by a Bluetooth service restart. If Ratspeak can scan but cannot advertise, the Network view will show Bluetooth Peer as central-only.

### Use cases vs. LoRa

LoRa wins on range; BLE wins on throughput and latency. If everyone is in the same room, the same coffee shop, the same couple of vehicles, BLE will move messages and small files an order of magnitude faster than the LoRa link sitting on the same desk. Once anyone walks more than fifty meters away, LoRa takes over without any handoff work — the BLE link drops cleanly, the LoRa path is already known, and traffic continues. Run them simultaneously when you can; that is the design.

## iOS support

Apple platforms do not expose USB serial to apps, so iPhones and iPads cannot drive an RNode over a Lightning or USB-C cable. **Bluetooth is the only path to LoRa hardware on iOS.** The BLE RNode bridge is therefore a hard requirement for iOS users who want to participate in a LoRa mesh; the same flow described above applies. The Network view on iOS hides the USB radio option entirely — there is no platform path for it.

Bluetooth Peer works on iOS as well, but Core Bluetooth applies stricter background-execution limits than Android — extended advertising while the app is fully suspended is not guaranteed. Keep Ratspeak in the foreground or in the recents tray during active sessions for reliable peer discovery. Granting the *Bluetooth* permission at first launch is required; without it both the bridge and Bluetooth Peer will silently find nothing.

## Range and limits

BLE is a short-range, low-throughput technology. Real-world expectations:

- **Range** — roughly 10 meters indoors with walls in the way, up to 30–50 meters in clear line of sight. External antennas on RNode hardware extend the bridge side; phone-to-phone range is whatever the two phone radios can manage. Putting a phone in a pocket or thick case typically cuts range by half.
- **Throughput** — on the order of 100 kbps in good conditions, much less when the channel is congested or the connection interval is long. Fine for chat, sensor data, status, small file transfers; not suitable for streaming media.
- **Concurrency** — most phone radios will hold a handful of simultaneous BLE connections cleanly. Beyond that, the OS starts dropping links unpredictably. Treat Bluetooth Peer as small-group transport — five to eight nearby nodes is realistic, twenty is not.
- **Latency** — typical round-trip is tens of milliseconds, but Android in particular will lengthen the connection interval aggressively when the screen is off. Expect occasional multi-hundred-millisecond stalls on backgrounded devices.
- **Interference** — BLE shares 2.4 GHz with Wi-Fi, microwaves, and every other consumer wireless device. Crowded RF environments degrade throughput before they break the link entirely.
- **Battery** — continuous scanning + advertising is the most power-hungry mode BLE has. Expect a noticeable drain on phones left running Bluetooth Peer all day; the bridge alone, with no scanning, is much cheaper.

For longer reach, hand off to LoRa via the RNode bridge. For higher throughput between known peers, fall back to TCP over Wi-Fi or I2P. Bluetooth fills the gap where neither of those is available — close enough to see each other, but with no shared network in between.

If something is misbehaving, the Network view in Ratspeak shows live counters per interface: bytes in, bytes out, last frame, current peer count. A Bluetooth interface that is up but reading zero bytes is almost always a permission issue or a stale OS-level bond, not a bug in the radio or Bluetooth Peer.
