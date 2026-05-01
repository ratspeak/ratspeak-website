# Ratdeck

Ratdeck is the firmware that turns a LilyGO T-Deck Plus into a self-contained handheld Reticulum mesh node. Battery-powered, with a real QWERTY keyboard, a colour screen, and an integrated LoRa radio — no laptop, no phone tether, no separate RNode dongle. It speaks LXMF natively, so the device you hold in your hand is the node.

## Hardware

You need one [LilyGO T-Deck Plus](https://www.lilygo.cc/products/t-deck-plus). It's an ESP32-S3 handheld with a 320×240 IPS display, a backlit QWERTY thumb keyboard, a four-direction trackball, an integrated SX1262 LoRa transceiver, an internal battery, and an optional UBlox GPS module for time sync. That's the whole bill of materials. Pick up the 915 MHz variant for the Americas/Australia or the 868 MHz variant for Europe — the firmware is the same image either way.

## Get the firmware on your device

The easy path is the [web flasher](https://ratspeak.org/download.html). Plug the T-Deck into your computer with a USB-C cable, hold the trackball down while you power it on (this puts the ESP32 into download mode), and follow the prompts in the browser. Two minutes, no toolchain.

If you'd rather build from source, see the bottom of this page.

## First boot

On first boot Ratdeck generates a fresh Reticulum identity for you, then asks for a display name and your timezone. From there you land on the Home tab. Your LXMF address is the 32-character hex string on the Home screen — that's what you share with friends so they can message you.

## What you can do on it

Five tabs along the bottom, navigated with the trackball:

- **Home** — your address, signal/battery status, and a manual announce (press the trackball or Enter to broadcast yourself to the mesh).
- **Friends** — saved contacts. Long-press a row to add or delete.
- **Msgs** — your inbox. Tap a thread to read or reply.
- **Peers** — every Reticulum node Ratdeck has heard from on the mesh. Select one to start a chat.
- **Settings** — radio config, network mode, region, device options.

## LoRa presets

Eight presets cover the useful range from "fast and short" to "slow and long." The default is Long Fast, which is what most public Reticulum mesh activity uses.

| Preset | SF | BW | CR | TX power |
|---|---|---|---|---|
| Short Turbo | 7 | 500 kHz | 4/5 | 14 dBm |
| Short Fast | 7 | 250 kHz | 4/5 | 14 dBm |
| Short Slow | 8 | 250 kHz | 4/5 | 14 dBm |
| Medium Fast | 9 | 250 kHz | 4/5 | 17 dBm |
| Medium Slow | 10 | 250 kHz | 4/5 | 17 dBm |
| Long Turbo | 11 | 500 kHz | 4/8 | 22 dBm |
| **Long Fast** *(default)* | 11 | 250 kHz | 4/5 | 22 dBm |
| Long Moderate | 11 | 125 kHz | 4/8 | 22 dBm |

Pick a Short preset if you're standing near other devices and want snappy delivery. Pick Long Fast for general mesh use — it matches what the broader Reticulum community runs by default. Drop to Long Moderate if you're trying to reach a node at the edge of usable signal. You can also override any individual parameter (frequency, SF, bandwidth, coding rate, TX power) from Settings → Radio, and changes apply immediately without a reboot.

## Regions

One firmware image covers all four ISM bands: Americas (915 MHz), Europe (868 MHz), Australia (915 MHz), and Asia (923 MHz). You pick your region in Settings, and Ratdeck will also infer a sensible default from the timezone you chose at first boot. You're responsible for operating within your local regulations.

## Wi-Fi bridging

Ratdeck has two Wi-Fi modes, mutually exclusive, both toggled in Settings → Network.

**STA mode** joins your home Wi-Fi. With internet access the device can reach public Reticulum hubs like `rns.ratspeak.org:4242`, which extends the mesh well beyond what LoRa alone can cover.

**AP mode** turns the Ratdeck itself into a hotspot — SSID `ratdeck-XXXX`, password `ratspeak` — and exposes a TCP server on port 4242. Connect a laptop to that network and add a `TCPClientInterface` pointed at `192.168.4.1:4242` in your desktop Reticulum config, and your laptop can talk to the wider LoRa mesh through the handheld. Useful for typing long messages on a real keyboard, or for participating in the mesh from a desktop with no radio of its own.

## Build from source

If you want to build the firmware yourself rather than use the web flasher:

```bash
git clone https://github.com/ratspeak/ratdeck
cd ratdeck
pip install platformio
python3 -m platformio run -e ratdeck_915          # build
python3 -m platformio run -e ratdeck_915 -t upload # build + flash over USB
```

The same `ratdeck_915` build covers every region — the LoRa band is a runtime setting, not a compile-time one, so one image works everywhere.
