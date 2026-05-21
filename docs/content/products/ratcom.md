# Ratcom

Ratcom is the firmware that turns an M5Stack Cardputer Adv with the Cap LoRa-1262 add-on into a standalone Reticulum mesh node. It runs the same software stack as Ratdeck — microReticulum plus native LXMF — on smaller, pocketable hardware. If you want a credit-card-sized handheld that can send end-to-end encrypted messages over LoRa with no phone or computer attached, this is it.

## Hardware

The Cardputer Adv is M5Stack's keyboard-first ESP32-S3 handheld: a 240 by 135 TFT, a micro QWERTY keyboard, and a 1750 mAh internal battery in a credit-card form factor. The radio is the Cap LoRa-1262, an SX1262-based module that plugs in as a stack add-on rather than being soldered to the mainboard like Ratdeck's. The whole package weighs almost nothing and fits in a jacket pocket.

## Ratcom vs Ratdeck

Both run the same Reticulum stack on an ESP32-S3 with an SX1262-class LoRa radio, but they target different envelopes.

- **[Ratdeck](../products/ratdeck)** has the bigger 320 by 240 screen, a real tactile keyboard, more memory headroom (PSRAM), and a soldered-in radio. It's the one you reach for when you actually want to compose messages comfortably.
- **Ratcom** is smaller, lighter, and modular — the radio comes off, the screen is half the area, and the UI is a tighter four-tab layout. Pick this if pocketability beats screen real estate.

Both speak the same protocol over the air, so a Ratcom and a Ratdeck on the same frequency and preset will see each other immediately.

## Flash it

The fastest path is the [web flasher](https://ratspeak.org/download.html). Hold the **G0** button while plugging the Cardputer Adv into USB to put the ESP32-S3 in download mode, pick the device, hit flash. That's the whole install. For recovery mode, serial verification, and post-flash checks, see [Flashing Firmware](../hardware/flashing-firmware).

If you'd rather build from source, see [Build from source](#/products/ratcom::build-from-source) below.

## First boot

On first boot Ratcom asks you to pick a timezone and type a display name. A fresh Reticulum identity is generated and persisted to flash, and you land on the **Home** tab. Home shows a shortened LXMF ID for recognition; use the full address from identity/details screens where exposed for manual contact exchange, or start chats from Nodes once announces have been heard.

## What you can do on it

Four tabs across the bottom. Cycle them with the `,` and `/` keys.

- **Home** — your short ID and basic status. Press Enter to manually announce yourself to the mesh.
- **Msgs** — your inbox. Conversations are listed here; pick one to read or reply. Delete/Fn-delete opens the conversation action menu for message actions, contact saving, or history deletion.
- **Nodes** — peers Ratcom has heard on the mesh. Press Enter on someone to start a new conversation with them.
- **Settings** — configure the radio, WiFi, TCP bridges, SD card, display, audio, and device info.

Messages use the same LXMF security model as every other endpoint: encrypted to the recipient with Reticulum's X25519-based key exchange and signed with Ed25519.

## LoRa presets

Eight presets cover the useful range from short, fast local links to slower long-haul links. Settings -> Radio -> Preset. Individual radio parameters — frequency, spreading factor, bandwidth, coding rate, and TX power — are also tunable from the Radio sub-menu, and changes apply immediately without a reboot. First-boot timezone selection sets a regional LoRa default; Settings -> Radio can override the exact frequency. Operate within the rules for your region; you are responsible for knowing what's legal where you are.

For the full preset table and tuning guidance, see [LoRa Radio Interfaces](../networking/lora-and-rnode).

## Bridging to the wider network

Ratcom can join your home WiFi (STA mode) and reach a hosted Reticulum node such as Emerald (`2.ratspeak.org:4242`) so messages flow off the LoRa mesh and onto the wider Reticulum network. The other public Ratspeak TCP servers are Ruby (`1.ratspeak.org:4141`) and Diamond (`3.ratspeak.org:4343`); `rns.ratspeak.org:4242` remains an alias for Emerald. In the app, "Official" means the server is managed by Ratspeak; "Unofficial" means it is operated by a third party. Ratcom can also run as an access point (`ratcom-XXXX`, password `ratspeak`) so a laptop can attach a `TCPClientInterface` at `192.168.4.1:4242`. AP mode is still alpha in the current firmware, so test it before relying on it in the field.

## Build from source

```bash
git clone https://github.com/ratspeak/ratcom
cd ratcom
pip install platformio
python3 -m platformio run -e ratcom_915           # build
python3 -m platformio run -e ratcom_915 -t upload # flash over USB
```

The same `ratcom_915` build covers every region — pick your frequency in Settings → Radio after first boot.

## License

Ratcom firmware is AGPL-3.0-or-later. Vendored third-party libraries keep their own notices, including `lib/Crypto` and attributed radio-driver excerpts under MIT.
