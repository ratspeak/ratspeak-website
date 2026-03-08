# Flashing Firmware

How to install RNode firmware on supported boards, and how to build and flash RatDeck and RatCom firmware.

## RNode Firmware (rnodeconf)

The easiest way to turn a supported board into an RNode is with `rnodeconf`, which is included when you install Reticulum.

### Prerequisites

```bash
pip install rns
```

### Auto-Install

Connect your board via USB, then run:

```bash
rnodeconf --autoinstall
```

The utility will:

1. Detect your board and transceiver
2. Download the appropriate firmware
3. Flash it to the device
4. Provision the EEPROM with device settings

Follow the interactive prompts — it handles everything automatically.

### Updating Firmware

To update an existing RNode to the latest firmware:

```bash
rnodeconf --update
```

### Verifying Installation

Check that your RNode is working:

```bash
rnodeconf -i
```

This displays device information including firmware version, transceiver type, frequency range, and hardware capabilities.

### Useful rnodeconf Flags

| Flag | Purpose |
|------|---------|
| `-i` | Show device information |
| `-a` | Auto-install (interactive) |
| `-u` | Update firmware |
| `-e` | Extract firmware binary |
| `-N` | Switch to normal mode |
| `-T` | Switch to TNC mode |
| `-b` / `-B` | Enable / disable Bluetooth |
| `-p` | Bluetooth pairing mode |
| `-D <0-255>` | Set display brightness |

## RatDeck Firmware

### Web Flash (Easiest)

Visit **[ratspeak.org/download](https://ratspeak.org/download)** and flash directly from your browser using WebSerial. No build tools required.

### Building from Source

#### Prerequisites

```bash
pip install platformio
git clone https://github.com/ratspeak/ratdeck.git
cd ratdeck
```

#### Build

```bash
python3 -m platformio run
```

Output: `.pio/build/ratdeck_915/firmware.bin`

#### Flash

```bash
python3 -m platformio run --target upload
```

Or with esptool directly (more reliable):

```bash
python3 -m esptool --chip esp32s3 --port /dev/cu.usbmodem* --baud 460800 \
    --before default-reset --after hard-reset \
    write_flash -z 0x10000 .pio/build/ratdeck_915/firmware.bin
```

#### Serial Monitor

```bash
python3 -m platformio device monitor -b 115200
```

### Download Mode

If your T-Deck Plus isn't detected:

1. Hold the trackball button (GPIO 0 / BOOT)
2. Press reset while holding
3. Release both — device enters bootloader mode
4. Flash as normal

## RatCom Firmware

### Building from Source

```bash
git clone https://github.com/ratspeak/ratcom.git
cd ratcom
python3 -m platformio run -e ratputer_915
```

### Flash

```bash
python3 -m platformio run -e ratputer_915 -t upload --upload-port /dev/cu.usbmodem*
```

Or with esptool:

```bash
python3 -m esptool --chip esp32s3 --port /dev/cu.usbmodem* --baud 460800 \
    --before default-reset --after hard-reset \
    write_flash -z 0x10000 .pio/build/ratputer_915/firmware.bin
```

## First Boot

After flashing either RatDeck or RatCom:

1. Device shows boot animation with progress bar
2. LoRa radio initializes
3. SD card checked and directories created (if present)
4. Reticulum identity generated (Ed25519 keypair)
5. WiFi AP starts (`ratdeck-XXXX` or `ratcom-XXXX`)
6. Initial announce broadcast
7. Ready to use

The identity is persisted to flash, SD card, and NVS — it survives reflashes and power cycles.

## USB Port Paths

| Platform | Typical Path |
|----------|-------------|
| **macOS** | `/dev/cu.usbmodem*` |
| **Linux** | `/dev/ttyACM0` or `/dev/ttyUSB0` |
| **Windows** | `COM3` (check Device Manager) |

> **Tip**: On Linux, use persistent device paths to avoid USB port shuffling:
> ```
> /dev/serial/by-id/usb-FTDI_FT230X_Basic_UART_43891CKM-if00-port0
> ```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Device not detected | Try a different USB cable (data cable, not charge-only) |
| Flash fails | Enter download mode (hold BOOT + press RESET) |
| Upload speed errors | Lower baud rate: `--baud 115200` |
| Permission denied (Linux) | Add user to `dialout` group: `sudo usermod -aG dialout $USER` |
| Wrong port | List ports: `python3 -m serial.tools.list_ports` |

## What's Next

- [RNode Overview](../hardware/rnode-overview) — how RNode works
- [Supported Boards](../hardware/supported-boards) — hardware options
- [Antennas, Range & Power](../hardware/antennas-range-power) — optimize performance
- [LoRa with RNode](../connecting/lora-rnode) — configure LoRa parameters
