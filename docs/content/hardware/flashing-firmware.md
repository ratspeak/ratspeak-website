# Flashing Firmware

This guide walks you through getting firmware onto a Ratdeck, Ratcom, or RNode-class board. The web flasher is the fastest path for Ratdeck and Ratcom; PlatformIO is the path you want when you're hacking on the firmware itself. RNode boards use Mark Qvist's `rnodeconf` toolchain.

> **Warning**: Attach an antenna matched to your frequency band before powering or testing a LoRa radio. Transmitting without an antenna can damage the radio module.

## Web Flasher (Easiest)

For Ratdeck and Ratcom, you don't need to install anything. Plug the board into a USB-C port and visit:

**[ratspeak.org/download.html](https://ratspeak.org/download.html)**

The page uses WebSerial (Chrome, Edge, or Opera on desktop) to detect the board, pick the right image, and flash it directly from your browser. Pick your board, click Flash, and wait for the progress bar to hit 100%. The same image covers all regions — the LoRa band is a runtime setting you choose later from the device UI.

If the browser can't see the board, jump to the [Recovery](#/hardware/flashing-firmware::recovery-download-mode) section below.

## Ratdeck (PlatformIO Build & Flash)

Use this path when you want to build from source — for example, to test a patch or a custom branch.

1. Clone the repo and install PlatformIO:

```bash
git clone https://github.com/ratspeak/ratdeck
cd ratdeck
pip install platformio
```

2. Build and flash in one command:

```bash
python3 -m platformio run -e ratdeck_915 -t upload
```

The `ratdeck_915` environment is the only Ratdeck target — the same image runs in every region, and the band is selected at runtime once the device boots.

3. (Optional) Watch the boot log:

```bash
python3 -m platformio device monitor -b 115200
```

## Ratcom (PlatformIO Build & Flash)

The Ratcom build is structured the same way, with its own repo and environment name.

1. Clone and install PlatformIO (skip if you already did this for Ratdeck):

```bash
git clone https://github.com/ratspeak/ratcom
cd ratcom
pip install platformio
```

2. Build and flash:

```bash
python3 -m platformio run -e ratcom_915 -t upload
```

The environment is `ratcom_915`. If you have multiple boards plugged in, append `--upload-port /dev/cu.usbmodem*` (macOS), `/dev/ttyACM0` (Linux), or `COM3` (Windows) to target the right one.

## RNode (rnodeconf)

RNode-class boards (RNode, LilyGO T-Beam Supreme, Heltec V3, etc.) use the upstream RNode toolchain rather than PlatformIO directly. The `rnodeconf` utility ships with Reticulum.

1. Install Reticulum, which brings in `rnodeconf`:

```bash
pip install rns
```

2. Plug the board into USB and run the auto-installer:

```bash
rnodeconf --autoinstall
```

The utility detects your board, downloads the right RNode firmware image, flashes it, and provisions the EEPROM with the correct transceiver and frequency settings. Follow the interactive prompts.

To verify or update an existing RNode later:

```bash
rnodeconf -i        # show device info
rnodeconf --update  # update firmware in place
```

Note: `airtime_limit_long` and `airtime_limit_short` are *runtime* configuration keys — you set them in your Reticulum config under the RNode interface stanza, not at flash time.

## Recovery (Download Mode)

If a flash fails partway through and the board no longer enumerates, force the ESP32-S3 into download mode:

- **Ratdeck**: hold the **trackball button** while plugging in USB (or while pressing reset). Release once the board is connected.
- **Ratcom**: hold the **boot button** while plugging in USB. Release once the host detects the device.

Then re-run the web flasher or your PlatformIO upload command. Download mode bypasses whatever state the previous flash left behind.

For RNode boards, hold the BOOT button (and tap RESET if the board has a reset button) before re-running `rnodeconf --autoinstall`.

## Verifying the Flash Worked

A successful flash shows the same signs across all three platforms:

1. The device boots into its splash/animation screen within a few seconds of reset.
2. The serial monitor (`platformio device monitor` for Ratdeck/Ratcom, `rnodeconf -i` for RNode) prints the firmware version and a healthy hardware report.
3. The LoRa radio initializes without errors — look for a `RADIO_INIT_OK` line or equivalent.
4. For Ratdeck and Ratcom, the first-boot/setup flow appears and lets you set the device name, timezone or region defaults, and network mode.
5. If you enable Hotspot/AP mode later, a Wi-Fi access point named `ratdeck-XXXX` or `ratcom-XXXX` appears and exposes the configured TCP bridge.
6. A Reticulum identity is generated on first boot (X25519 encryption key + Ed25519 signing key) and persisted to flash. Subsequent reflashes preserve it.

If any of those steps stall, power-cycle the board and check the serial monitor for the failure point before re-flashing.
