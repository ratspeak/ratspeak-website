# Using Your RatDeck

A practical guide to operating the RatDeck — from first power-on through daily messaging, radio tuning, and field use.

## First Power-On

1. Attach a **915 MHz antenna** (or your region's frequency) before powering on — transmitting without an antenna can damage the radio
2. Connect power via USB-C or battery
3. The boot screen shows firmware version and hardware detection
4. On first boot, RatDeck generates a fresh Reticulum identity and LXMF address — this takes a few seconds

Your 32-character LXMF address appears on the **Home** tab. Share this with contacts so they can message you.

## Navigating the Interface

RatDeck has five tabs. Switch between them with the `,` and `/` keys, or tap the tab bar on the touchscreen.

### Home

Your identity at a glance:

- **LXMF Address** — your 32-character destination hash
- **Display Name** — editable in Setup
- **Connection Status** — LoRa, WiFi, or both
- **Online Nodes** — how many peers the mesh currently sees

### Messages

Where you read and write encrypted messages.

**Reading messages:**
- Conversations are sorted by most recent activity
- Unread conversations show a badge count
- Select a conversation and scroll with the trackball or `;` / `.` keys

**Sending a message:**
1. Select an existing conversation, or start a new one by entering a destination hash
2. Type your message on the physical keyboard
3. Press **Enter** to send

Messages are encrypted end-to-end with Ed25519 signatures. Delivery status updates as the message propagates through the mesh.

### Friends

Your saved contacts. Add a friend by entering their destination hash and an optional display name. Friends appear by name instead of raw hash throughout the interface.

### Peers

All nodes the RatDeck has discovered via Reticulum announces. This is a live view of the mesh — nodes appear and disappear as they come in and out of range.

### Setup

All device configuration, organized into sub-menus:

| Sub-menu | What it controls |
|----------|-----------------|
| **Radio** | LoRa frequency, spreading factor, bandwidth, TX power, presets |
| **WiFi** | AP mode, STA mode, off — network name and password |
| **Display** | Brightness, dim timeout, screen-off timeout |
| **Audio** | Notification sounds, volume |
| **System** | Transport mode, display name, firmware info, factory reset |

## Radio Configuration

### Quick Presets

For most users, presets are the easiest way to configure the radio:

| Preset | When to use it |
|--------|---------------|
| **Long Range** | Maximum distance, slow speed — rural, mountain-to-mountain, emergencies |
| **Balanced** | Good range with usable speed — general daily use |
| **Fast** | Short range, fast transfers — same building or nearby outdoor |

Select a preset in **Setup → Radio → Preset**. Changes apply immediately.

### Manual Tuning

If you need fine control, adjust individual parameters:

- **Frequency** — must match all nodes you want to communicate with (default: 915 MHz in the US)
- **Spreading Factor** (SF7–SF12) — higher = more range, less speed
- **Bandwidth** (125/250/500 kHz) — lower = more range, less speed
- **Coding Rate** (4/5 through 4/8) — higher denominator = more error correction
- **TX Power** (2–22 dBm) — higher = more range, more battery drain

All nodes on the same LoRa link must use identical radio parameters. If you change settings, every other node must match.

## WiFi Bridging

RatDeck can bridge your laptop's Reticulum instance to the LoRa mesh over WiFi.

### AP Mode (Default)

RatDeck creates its own WiFi network:

1. In **Setup → WiFi**, select **AP Mode**
2. The network name is `ratdeck-XXXX` (password: `ratspeak`)
3. On your laptop, connect to this network
4. In the Ratspeak dashboard, add a TCP connection to `192.168.4.1:4242`

Your laptop now has access to the LoRa mesh through the RatDeck's radio.

### STA Mode

Connect the RatDeck to an existing WiFi network:

1. In **Setup → WiFi**, select **STA Mode**
2. Enter the network name and password
3. The RatDeck connects and gets an IP address
4. Use this IP with port 4242 as a TCP connection target

### WiFi Off

Set WiFi to **OFF** to save battery when you only need LoRa. This is the most power-efficient mode.

## Transport Mode

Enable transport in **Setup → System → Transport Mode** to turn your RatDeck into a mesh relay. When enabled, it forwards packets for other nodes — extending the network's reach.

Enable transport when:
- Your RatDeck is in a fixed, elevated location with good radio coverage
- You want to bridge between nodes that can't directly reach each other
- You're setting up a repeater station

Leave it disabled for normal mobile use — it increases radio traffic and battery drain.

## Power Management

### Screen States

The display cycles through three states to save battery:

1. **Active** — full brightness, all inputs responsive
2. **Dimmed** — reduced brightness after idle timeout (configurable)
3. **Off** — screen off after longer idle timeout

Wake the screen by pressing any key or moving the trackball.

### Battery Tips

- Use **WiFi OFF** mode when you don't need bridging
- Lower TX power if communicating with nearby nodes
- Use the **Fast** radio preset for short-range links (less airtime = less power)
- Disable transport mode when mobile

## Keyboard Reference

| Shortcut | Action |
|----------|--------|
| `,` / `/` | Previous / next tab |
| `;` / `.` | Scroll up / down |
| Enter | Select / send message |
| Esc | Back / cancel |
| Ctrl+H | Help overlay |
| Ctrl+M | Jump to Messages |
| Ctrl+A | Force announce (re-broadcast your identity) |
| Ctrl+D | Diagnostics dump (serial output) |
| Ctrl+T | Send radio test packet |
| Ctrl+R | RSSI monitor (live signal strength) |

## Troubleshooting

### No peers visible

- Confirm your antenna is attached
- Check that your radio frequency and parameters match other nodes
- Try the **Long Range** preset to maximize discovery range
- Use **Ctrl+T** to send a test packet and **Ctrl+R** to monitor for responses

### Messages not delivering

- Check that the recipient's node is online (visible in Peers)
- If using a propagation node, verify your outbound prop node is set in Setup
- Try **Ctrl+A** to force an announce so the network knows your current path

### WiFi bridge not connecting

- Verify your laptop is connected to the `ratdeck-XXXX` network
- Check that you're using `192.168.4.1:4242` as the TCP target
- Try toggling WiFi mode off and back to AP

### Device won't boot

- Connect via USB and check serial output for error messages
- If stuck in a boot loop, RatDeck auto-disables WiFi after 3 failed boots
- Factory reset: **Setup → System → Factory Reset** (or serial WIPE command within 500ms of boot)

## What's Next

- [RatDeck Hardware Specs](../hardware/ratdeck) — full hardware specifications
- [RatCom User Guide](../hardware/using-ratcom) — the pocket-sized alternative
- [Flashing Firmware](../hardware/flashing-firmware) — updating or reinstalling firmware
- [Antennas, Range & Power](../hardware/antennas-range-power) — getting maximum range
