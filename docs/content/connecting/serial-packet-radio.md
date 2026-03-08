# Serial & Packet Radio

Connecting Reticulum over serial ports, packet radio TNCs, and custom hardware — for legacy systems, amateur radio, and DIY links.

## Serial Interface

The **SerialInterface** sends and receives Reticulum packets over any standard serial port. This works with any device that transparently passes data — direct UART connections, serial modems, radio links with serial output, or USB-to-serial adapters.

### Configuration

```ini
[[Serial Link]]
  type = SerialInterface
  enabled = yes
  port = /dev/ttyUSB0
  speed = 115200
  databits = 8
  parity = none
  stopbits = 1
```

### Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `port` | — | Serial device path (`/dev/ttyUSB0`, `/dev/ttyACM0`, `COM3`, etc.) |
| `speed` | — | Baud rate (common: 9600, 19200, 38400, 57600, 115200) |
| `databits` | `8` | Data bits per byte (5, 6, 7, or 8) |
| `parity` | `none` | Parity checking: `none`, `even`, `odd` |
| `stopbits` | `1` | Stop bits: `1` or `2` |

### Use Cases

- **Direct cable connection** between two computers
- **Serial radio links** — pair of radio modems with serial interfaces
- **Legacy equipment** — connecting to older networking hardware
- **Embedded systems** — UART connections to microcontrollers or SBCs

## KISS Interface (Packet Radio)

The **KISSInterface** communicates with packet radio modems and TNCs (Terminal Node Controllers) using the KISS protocol. This is the standard way to connect Reticulum to amateur radio equipment.

### Supported Hardware

- **OpenModem** — open-source radio modem
- **Dire Wolf** — software-defined TNC (runs on a computer with a sound card)
- **FreeDV TNC** — digital voice and data modem
- Any KISS-compatible TNC or soundmodem

### Configuration

```ini
[[Packet Radio]]
  type = KISSInterface
  enabled = yes
  port = /dev/ttyUSB1
  speed = 115200
  databits = 8
  parity = none
  stopbits = 1
  preamble = 150
  txtail = 10
  persistence = 200
  slottime = 20
  flow_control = false
```

### KISS Parameters

These control the channel access behavior (CSMA/CA):

| Parameter | Default | Description |
|-----------|---------|-------------|
| `preamble` | `150` | TX preamble length in flag bytes — time for receiver to synchronize |
| `txtail` | `10` | TX tail length in flag bytes — keeps transmitter keyed after data |
| `persistence` | `200` | CSMA persistence (0–255) — probability of transmitting when channel clear |
| `slottime` | `20` | CSMA slot time in milliseconds — interval between channel checks |
| `flow_control` | `false` | Enable hardware flow control |

> **Tip**: Higher `persistence` means more aggressive channel access (faster but more collisions). Lower values are polite (slower but fewer collisions). For shared amateur frequencies with multiple stations, use lower persistence (64–128).

### Identification Beaconing

For amateur radio compliance, KISS interfaces support callsign identification:

```ini
[[Packet Radio]]
  type = KISSInterface
  id_callsign = MYCALL-0
  id_interval = 600
  # ... other params
```

This transmits your callsign at the specified interval (in seconds) to comply with station identification requirements.

### KISS over TCP

You can also use a TCP connection to a remote KISS device (such as a soundmodem running on another machine):

```ini
[[TCP Soundmodem]]
  type = TCPClientInterface
  enabled = yes
  kiss_framing = True
  target_host = 127.0.0.1
  target_port = 8001
```

> **Warning**: Only enable `kiss_framing` when connecting to an actual KISS device. Never use it when connecting a TCPClientInterface to a standard TCPServerInterface.

## AX.25 KISS Interface

For amateur radio operators who need AX.25 encapsulation for regulatory compliance:

```ini
[[AX.25 Packet Radio]]
  type = AX25KISSInterface
  enabled = yes
  callsign = MYCALL
  ssid = 0
  port = /dev/ttyUSB2
  speed = 115200
  databits = 8
  parity = none
  stopbits = 1
  preamble = 150
  txtail = 10
  persistence = 200
  slottime = 20
```

> **Note**: AX.25 adds overhead compared to plain KISS. Only use this if your regulatory environment specifically requires AX.25 framing. For most use cases, a standard KISSInterface with identification beaconing is sufficient.

## Pipe Interface

The **PipeInterface** uses any external program as a Reticulum interface by piping data through its stdin/stdout. This is useful for custom hardware drivers, virtual connections, or experimental link types.

```ini
[[Custom Link]]
  type = PipeInterface
  enabled = yes
  command = /usr/local/bin/my-radio-driver
  respawn_delay = 5
```

If the program exits, Reticulum automatically respawns it after `respawn_delay` seconds.

### Use Cases

- Custom radio hardware with non-standard drivers
- Virtual test interfaces for development
- Bridging through external programs (netcat, socat, etc.)

## What's Next

- [Interface Types Overview](../connecting/interface-types-overview) — compare all interfaces
- [Interface Modes](../connecting/interface-modes) — configure interface behavior
- [LoRa / RNode](../connecting/lora-rnode) — long-range radio with RNode
- [Building Networks](../connecting/building-networks) — network topology strategies
