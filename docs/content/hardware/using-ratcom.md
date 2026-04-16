# Using Your RatCom

A practical guide to operating the RatCom — pocket-sized encrypted messaging on the Reticulum mesh.

## First Power-On

1. Attach a **915 MHz antenna** (or your region's frequency) to the LoRa module before powering on
2. Power on via the side button or USB-C
3. RatCom generates a fresh Reticulum identity on first boot — this takes a few seconds
4. Your LXMF address appears on the **Home** tab

Share your 32-character LXMF address with contacts so they can reach you.

## Navigating the Interface

RatCom has four tabs. Switch with `,` and `/` keys.

### Home

Your node status:

- **LXMF Address** — your destination hash
- **Display Name** — set in Setup
- **Connection Status** — LoRa, WiFi, or both
- **Online Nodes** — current mesh peer count

### Messages

Read and send encrypted messages.

**Reading:**
- Conversations sorted by most recent
- Unread badges on new messages
- Scroll with `;` (up) and `.` (down)

**Sending:**
1. Select a conversation or enter a new destination hash
2. Type your message
3. Press **Enter** to send

All messages are encrypted end-to-end.

### Nodes

Live view of discovered mesh peers. Nodes appear as they announce and disappear when they go out of range or timeout.

### Setup

Device configuration:

| Sub-menu | Controls |
|----------|----------|
| **Radio** | LoRa frequency, spreading factor, bandwidth, TX power, presets |
| **WiFi** | AP / STA / OFF mode, credentials |
| **Display** | Brightness, timeouts |
| **Audio** | Notification sounds |
| **System** | Transport mode, display name, factory reset |

## Radio Configuration

### Presets

RatCom uses the same eight canonical presets as RatDeck. **Long Fast** is the factory default:

| Preset | Bitrate | Best for |
|--------|--------:|----------|
| Short Turbo | 21.99 kbps | Very short range, highest throughput |
| Short Fast | 10.84 kbps | Short range, fast — same building or close outdoor |
| Short Slow | 6.25 kbps | Short range with better resilience |
| Medium Fast | 3.52 kbps | Neighborhood / urban |
| Medium Slow | 1.95 kbps | Urban with some obstructions |
| Long Turbo | 1.34 kbps | Long range, wider bandwidth |
| **Long Fast** *(default)* | **1.07 kbps** | **Long range general use** |
| Long Moderate | 0.34 kbps | Maximum range — rural, emergencies, mountain links |

Change presets in **Setup → Radio**. Settings apply immediately.

### Manual Parameters

For advanced tuning:

- **Frequency** — must match all nodes on your link
- **Spreading Factor** (SF7–SF12) — higher = farther but slower
- **Bandwidth** (125/250/500 kHz) — lower = farther but slower
- **TX Power** (2–22 dBm) — higher = farther, more battery drain

Every node on the same LoRa link must use identical parameters.

## WiFi Bridging

### AP Mode (Default)

RatCom creates its own WiFi hotspot:

1. **Setup → WiFi → AP Mode**
2. Network: `ratcom-XXXX`, password: `ratspeak`
3. Connect your laptop to this network
4. Add a TCP connection in Ratspeak to `192.168.4.1:4242`

Your laptop now reaches the LoRa mesh through RatCom's radio.

### STA Mode

Join an existing WiFi network:

1. **Setup → WiFi → STA Mode**
2. Enter network name and password
3. Use the assigned IP with port 4242 as a TCP target

### WiFi Off

**Setup → WiFi → OFF** disables WiFi entirely. Best battery life, LoRa only.

## Transport Mode

Enable in **Setup → System → Transport Mode** to relay packets for other nodes.

**Enable when:** your RatCom is stationary with good radio coverage — acting as a repeater.

**Disable when:** you're mobile — saves battery and reduces radio traffic.

## Battery Management

RatCom has a built-in 1750 mAh battery. To maximize runtime:

- Use **WiFi OFF** when you don't need bridging
- Lower TX power for nearby nodes
- Use a **Short** preset for short-range links
- Disable transport mode when mobile
- The screen dims and turns off automatically based on your timeout settings

## Keyboard Reference

| Key | Action |
|-----|--------|
| `,` / `/` | Previous / next tab |
| `;` / `.` | Scroll up / down |
| Enter | Select / send |
| Esc | Back / cancel |
| Ctrl+H | Help overlay |
| Ctrl+M | Jump to Messages |
| Ctrl+A | Force announce |

## Storage Notes

RatCom has 1.9 MB of flash storage — smaller than RatDeck's 7.8 MB. This means:

- Fewer messages stored locally before old ones are pruned
- Insert a **microSD card** (FAT32) for extended storage and identity backup
- Messages, contacts, and config are written with crash-safe atomic writes

## Troubleshooting

### No peers visible

- Verify antenna is attached to the LoRa module
- Check radio parameters match other nodes
- Try the **Long Moderate** preset (all nodes must match)
- Use **Ctrl+A** to force an announce

### Messages not delivering

- Confirm recipient is online (check Nodes tab)
- Force announce with **Ctrl+A** so the mesh knows your path
- If using a propagation node, verify it's configured in Setup

### WiFi bridge not connecting

- Check your laptop is on the `ratcom-XXXX` network
- Target should be `192.168.4.1:4242`
- Toggle WiFi mode off and back to AP

### Boot issues

- RatCom tracks boot failures — after 3 consecutive fails, WiFi auto-disables
- Factory reset via **Setup → System → Factory Reset**
- Emergency reset: send `WIPE` over serial within 500ms of boot

## RatDeck vs RatCom — Which to Carry?

| | RatDeck | RatCom |
|--|---------|--------|
| **Screen** | Bigger (320x240), easier to read | Compact (240x135) |
| **Input** | Keyboard + trackball | Keyboard only |
| **Storage** | 7.8 MB flash | 1.9 MB flash |
| **Battery** | External | Built-in 1750 mAh |
| **Portability** | Jacket pocket | Jeans pocket |
| **Best for** | Primary device, long sessions | Quick messages, grab-and-go |

## What's Next

- [RatCom Hardware Specs](../hardware/ratcom) — full hardware specifications
- [RatDeck User Guide](../hardware/using-ratdeck) — the larger alternative
- [Flashing Firmware](../hardware/flashing-firmware) — updating or reinstalling firmware
- [Antennas, Range & Power](../hardware/antennas-range-power) — getting maximum range
