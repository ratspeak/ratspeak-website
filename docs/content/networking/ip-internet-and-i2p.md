# IP, LAN & I2P

The fastest way to put two Reticulum nodes in contact is over an IP link. TCP and UDP carry frames between hosts that already have a route to each other; AutoInterface finds peers on the same LAN with no configuration; Backbone scales to thousands of concurrent transport peers; I2P can hide the IP addresses on either end from each other. All five run over the same socket layer and can be active on a node at once.

For protocol-level detail (header formats, IFAC, mode semantics) see the [Reticulum manual](https://reticulum.network/manual/).

## TCPClientInterface

A simple outbound TCP socket — what you use to dial a public Ratspeak server, another public hub, or a friend's transport node.

```ini
[[Emerald]]
  type = TCPClientInterface
  enabled = yes
  target_host = 2.ratspeak.org
  target_port = 4242
```

`target_host` and `target_port` are required (IPv4, IPv6, or hostname). `kiss_framing = yes` is only for an external KISS soundmodem and must never be set against a `TCPServerInterface`. `i2p_tunneled = yes` adjusts timeouts when the socket is going through a local I2P SAM tunnel. The interface auto-reconnects with backoff on drop, and multiple `TCPClientInterface` blocks dial in parallel.

## TCPServerInterface

Accepts inbound TCP connections. Run this on a host with a routable address (or behind a port-forward).

```ini
[[Inbound]]
  type = TCPServerInterface
  enabled = yes
  listen_ip = 0.0.0.0
  listen_port = 4242
  mode = gateway
```

`listen_ip` defaults to `0.0.0.0`; use `::` for IPv6 dual-stack. `prefer_ipv6 = yes` prefers AAAA over A on outbound resolution. Use `mode = gateway` when this listener is the client-facing entrypoint for other nodes. If the same machine also bridges a local LoRa or serial segment to a wider IP network, put `gateway` on the local/client-facing side and use `boundary` on the wider-network side when you need to constrain announce flow.

## AutoInterface — zero-config LAN

AutoInterface uses IPv6 link-local multicast to find every other Reticulum node on the same broadcast domain, then talks to them over UDP. No address, no port, no peer list.

```ini
[[LAN]]
  type = AutoInterface
  enabled = yes
  group_id = home
```

Discovery rides UDP **29716**, data rides UDP **42671** — both must be open on the host firewall. Nodes only see each other if their `group_id` matches; one physical LAN can host as many isolated AutoInterface meshes as you have group names. `discovery_scope` (default `link`) accepts `link`, `admin`, `site`, `organisation`, or `global` and controls multicast TTL. `discovery_port` and `data_port` override the defaults if those ports are in use. `devices` whitelists specific NICs (`eth0`, `wlan0`); `ignored_devices` blacklists them.

Failure modes are predictable: managed switches that drop multicast, hotel/captive-portal Wi-Fi that isolates clients, and most commercial VPNs (no IPv6 multicast) all break it. On those networks, fall back to TCP.

## BackboneInterface — high-throughput WAN

Backbone is HDLC framed over TCP with per-peer keepalive tuning, wire-compatible with `TCPServerInterface` / `TCPClientInterface` peers but scaling to thousands of concurrent connections per process. It runs on **Linux, macOS, and Windows desktop**; Linux additionally gets `TCP_USER_TIMEOUT` for fast detection of stuck connections. Mobile builds (iOS, Android) hide Backbone in the Ratspeak UI for now — use `TCPServerInterface` / `TCPClientInterface` there.

```ini
[[Backbone]]
  type = BackboneInterface
  enabled = yes
  listen_on = 0.0.0.0
  port = 4242
  mode = gateway
```

`listen_on` and `port` set the bind address. An optional `remote = host:port` makes Backbone dial outbound as well. Use Backbone when you're a transport node fanning out to many clients, or when TCP is measurably the bottleneck. In the Ratspeak desktop UI, Backbone surfaces as an opt-in toggle on the standard TCP connect / host modals rather than a separate flow.

## UDPInterface

Plain UDP, unicast or multicast. Useful for a known peer on a network where TCP is awkward, or a multicast group on a controlled segment.

```ini
[[Peer over UDP]]
  type = UDPInterface
  enabled = yes
  listen_ip = 0.0.0.0
  listen_port = 4242
  forward_ip = 10.0.0.5
  forward_port = 4242
```

For a multicast group, point both `listen_ip` and `forward_ip` at the same multicast address. Most operators reach for AutoInterface (LAN) or TCP (WAN) first — UDP shines when topology is static and overhead matters.

## I2PInterface — IP-hiding transport

Reticulum carried over an I2P SAM tunnel. Private Reticulum and LXMF payloads are already encrypted above the transport; I2P adds **transport anonymity at the IP layer** — neither end sees the other's clearnet IP. Bring up `i2pd` first (the SAM API must be reachable locally, default `127.0.0.1:7656`).

```ini
[[I2P]]
  type = I2PInterface
  enabled = yes
  connectable = yes
  peers = 5urvjicpzi7q3ybztsef4i5ow2aq4soktfj7zedz53s47r54jnqq.b32.i2p
```

`connectable = yes` accepts inbound — the interface prints its own `.b32.i2p` address on first run, which is what you share with peers. `peers` is a comma-separated list of `.b32.i2p` addresses to dial. Set `i2p_tunneled = yes` on a local TCP interface that is being tunneled by I2P, so its timeouts adjust for tunnel latency.

First start is slow — tunnel construction takes minutes. Steady-state latency is 1–5 seconds per hop and throughput is well below direct TCP, but the link survives CGNAT, dynamic IPs, and most restrictive firewalls. Pair I2P with a reachable Offline Inbox/propagation node and the latency cost largely disappears for delay-tolerant messaging.

## IFAC — per-interface authentication

Any interface above can be locked to peers that share a passphrase. Set `network_name` and `passphrase` on every node that should join — packets without a matching IFAC signature are dropped at ingress before the protocol sees them.

```ini
[[Private TCP]]
  type = TCPServerInterface
  listen_ip = 0.0.0.0
  listen_port = 4242
  network_name = our-mesh
  passphrase = correct horse battery staple
```

Leave `ifac_size` unset unless you are deliberately tuning IFAC overhead; the default is chosen per interface. The upstream Reticulum manual defines explicit `ifac_size` values in bits, and normal users should not need to override it. IFAC is an authentication boundary, not a confidentiality boundary — private payloads are already encrypted above it. See the [Reticulum manual](https://reticulum.network/manual/interfaces.html) for the full mode/IFAC matrix.

## Public Ratspeak TCP servers

Adding a public Ratspeak TCP server gives you immediate reach across the existing Reticulum network. In the app, the public Ratspeak servers are labelled by friendly names:

| Name | Endpoint |
|---|---|
| Ruby | `1.ratspeak.org:4141` |
| Emerald | `2.ratspeak.org:4242` |
| Diamond | `3.ratspeak.org:4343` |

The legacy endpoint `rns.ratspeak.org:4242` is an alias for Emerald.

In the app, "Official" means the server is managed by Ratspeak; "Unofficial" means it is operated by a third party.

Other public Reticulum hubs are independent of Ratspeak:

- For wider Reticulum connectivity, use the current Reticulum connect/backbone information at [reticulum.network/connect.html](https://reticulum.network/connect.html) or a community directory you trust.

Hubs are convenient, not load-bearing. If you intend to be reachable long-term, run your own `TCPServerInterface` (or `BackboneInterface` on a desktop OS for higher peer counts) and announce yourself — the network gets healthier with every node that does.
