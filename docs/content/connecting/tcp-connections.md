# TCP Connections

Connecting to remote Reticulum nodes over TCP/IP — both as a client and a server.

## TCP Client

A **TCPClientInterface** connects your node to a remote Reticulum node running a TCP server. This is the most common way to connect to nodes over the internet.

### Adding via Ratspeak UI

1. Navigate to the **Network** section
2. Click **Add Connection**
3. Enter the **hostname** (or IP address) and **port**
4. Click **Connect**

Ratspeak validates the hostname format and port range (1-65535) before connecting.

### Config File Format

```ini
[[My Remote Node]]
  type = TCPClientInterface
  target_host = dublin.connect.reticulum.network
  target_port = 4965
  enabled = yes
```

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `target_host` | Yes | — | Hostname or IP address of the remote node |
| `target_port` | Yes | — | TCP port number (1–65535) |
| `kiss_framing` | No | `false` | Only for external KISS soundmodems — never use with TCPServerInterface |
| `fixed_mtu` | No | — | Override MTU for special cases |

> **Warning**: Never enable `kiss_framing` when connecting to a standard Reticulum TCPServerInterface. It's only for external KISS-framed soundmodems.

## TCP Server

A **TCPServerInterface** allows other nodes to connect to yours. You become a hub that others can reach.

### Config File Format

```ini
[[My Server]]
  type = TCPServerInterface
  listen_ip = 0.0.0.0
  listen_port = 4965
  enabled = yes
```

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `listen_ip` | No | `0.0.0.0` | IP address to listen on (0.0.0.0 = all interfaces) |
| `listen_port` | Yes | — | TCP port to listen on (1–65535) |
| `device` | No | — | Bind to specific network device |
| `prefer_ipv6` | No | `false` | Prefer IPv6 if available |
| `i2p_tunneled` | No | `false` | Mark as I2P-tunneled for special handling |

### Firewall Configuration

If running a TCP server, ensure the port is open in your firewall:

```bash
# Linux (ufw)
sudo ufw allow 4965/tcp

# Linux (iptables)
sudo iptables -A INPUT -p tcp --dport 4965 -j ACCEPT
```

## Connection History

Ratspeak remembers previous TCP connections. When you disconnect from a node, its hostname and port are saved. You can quickly reconnect from the history without re-entering details.

## Backbone Interface (Linux and Android)

For high-performance deployments, the **BackboneInterface** uses kernel-event I/O and can handle thousands of concurrent connections. It's fully compatible with TCP Client/Server interfaces.

```ini
[[Backbone Server]]
  type = BackboneInterface
  listen_on = 0.0.0.0
  port = 4965
  enabled = yes
```

> **Note**: BackboneInterface is only available on Linux and Android. It uses kernel-event I/O (`epoll`/similar) and is not supported on macOS or Windows.

## What's Next

- [Interface Types Overview](../connecting/interface-types-overview) — compare all interface types
- [LoRa / RNode](../connecting/lora-rnode) — radio connections
- [Building Networks](../connecting/building-networks) — network architecture
