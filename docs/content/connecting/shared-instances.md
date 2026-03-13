# Shared Instances

How multiple programs share a single Reticulum instance on the same system, avoiding duplicate transport stacks and hardware conflicts.

## What Is a Shared Instance?

When you run a Reticulum program, it initializes the full protocol stack — bringing up interfaces, managing transport tables, and handling announce propagation. If you run a second program on the same system, it would normally try to do the same thing, leading to hardware conflicts (two programs fighting over the same serial port or radio) and wasted resources (duplicate routing tables, double announce traffic).

A **shared instance** solves this by designating one running program as the **master instance** that owns all interfaces and transport logic. Every other program on the same system connects to the master as a **client** through a local socket, transparently sharing the network stack without duplicating it.

This is enabled by default. If you run `rnsd` (the Reticulum daemon), it becomes the master instance. Any other program — Ratspeak, Sideband, NomadNet, or your own application — automatically connects as a client.

## How It Works

The shared instance mechanism operates through a local socket:

1. The **first program** to start Reticulum becomes the master instance. It opens all configured interfaces, manages the transport layer, and listens on a local socket for client connections.
2. **Subsequent programs** detect that a master is already running. Instead of initializing their own interfaces, they connect to the master via the local socket.
3. All traffic flows through the master — clients send and receive packets as if they had direct interface access, but the master handles all physical I/O and routing.

> **Note**: Client programs still create their own destinations, identities, and links. Only the transport layer and interface management are shared.

## Configuration

Shared instances are controlled by two settings in `~/.reticulum/config`:

```ini
[reticulum]
share_instance = Yes
instance_name = default
```

| Parameter | Default | Description |
|-----------|:-------:|-------------|
| `share_instance` | `Yes` | Allow other programs to share this Reticulum instance |
| `instance_name` | `default` | Identifier for the shared instance socket |

### Running Multiple Isolated Instances

If you need completely separate Reticulum instances on the same machine (for example, one connected to a public network and another to a private test network), use different instance names and config directories:

```ini
# ~/.reticulum/config (public network)
[reticulum]
share_instance = Yes
instance_name = public

# ~/.reticulum-test/config (test network)
[reticulum]
share_instance = Yes
instance_name = testnet
```

Programs specify which config directory to use via command-line flags (e.g., `rnsd --config ~/.reticulum-test`). Each instance name creates a separate local socket, so programs connecting to `public` and `testnet` are fully isolated.

## The Daemon Pattern

The recommended approach for shared instances is to run `rnsd` as a persistent daemon:

```bash
# Start the daemon
rnsd

# Or as a system service
sudo systemctl start rnsd
sudo systemctl enable rnsd
```

With `rnsd` running as the master instance, all your applications — Ratspeak, command-line tools like `rnstatus` and `rnpath`, and any custom programs — connect as clients automatically. This provides:

- **Persistent connectivity** — interfaces stay up even when individual applications restart
- **Shared transport state** — path tables and announce caches are maintained centrally
- **No hardware conflicts** — only one process accesses serial ports, radios, and other hardware
- **Lower resource usage** — one transport engine instead of many

> **Tip**: Running `rnsd` as a systemd service ensures Reticulum starts on boot and restarts automatically after failures. See [Raspberry Pi Gateway](../deployment/raspberry-pi-gateway.md) for a complete systemd setup example.

## Common Use Cases

### Running Ratspeak Alongside Other Reticulum Apps

If you use Ratspeak and another Reticulum client (like NomadNet or Sideband) on the same machine, a shared instance ensures both apps use the same interfaces and see the same network state. Start `rnsd` first, then launch both applications — they will share the single daemon instance.

### Development and Testing

When developing Reticulum applications, the shared instance lets you run your app alongside `rnstatus` for monitoring and `rnpath` for path inspection, all sharing the same transport layer.

```bash
# Terminal 1: Start the daemon
rnsd -v

# Terminal 2: Monitor interfaces
rnstatus -m

# Terminal 3: Run your application
python3 my_app.py
```

### Disabling Sharing

In rare cases, you may want a program to run its own independent instance. Set `share_instance = No` in its configuration, or use the API parameter:

```python
import RNS
reticulum = RNS.Reticulum(configdir="./my_config", require_shared_instance=False)
```

> **Warning**: Running multiple independent instances with overlapping interfaces (e.g., both trying to use the same serial port) will cause errors. Only disable sharing if each instance has its own distinct set of interfaces.

## What's Next

- [Building Networks](../connecting/building-networks.md) — topology patterns and transport node placement
- [Interface Types Overview](../connecting/interface-types-overview.md) — available interface types
- [Configuration](../using-ratspeak/configuration.md) — Ratspeak-specific configuration options
