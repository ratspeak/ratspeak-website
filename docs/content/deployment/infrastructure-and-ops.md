# Infrastructure & Ops

Day-2 operations for a Reticulum deployment: what to run, where to run it, and how to manage it once it's out the door.

---

## What you're running

Two roles cover almost every infrastructure deployment.

**Transport node.** Any Reticulum node with `enable_transport = yes` in its config. It forwards packets between the interfaces it's configured with — Ethernet, TCP tunnels, LoRa, I2P, whatever. A small VPS, a home server, or a Raspberry Pi all work. Transport nodes are the backbone of a multi-hop mesh.

**Offline Inbox / propagation node.** A store-and-forward LXMF server. Ratspeak calls this role an Offline Inbox; LXMF and Reticulum tooling call it a propagation node. It holds messages for offline peers and can sync state with configured propagation peers so a recipient has more than one place to fetch queued mail. Run `lxmd-rs` from rsLXMF.

A single host can do both. They're separate processes, `rnsd-rs` for transport and `lxmd-rs` for propagation. rsReticulum defaults to `~/.rsReticulum/config`; rsLXMF defaults to `~/.rsLXMF/config` plus the same rsReticulum directory unless you pass explicit paths.

---

## Docker

A container is useful on cloud hosts where you want a reproducible `rnsd-rs` service. The exact packaging flow depends on how you distribute release binaries, but the runtime shape is simple:

```dockerfile
FROM debian:stable-slim
COPY rnsd-rs /usr/local/bin/rnsd-rs
COPY config /root/.rsReticulum/config
EXPOSE 4242
CMD ["rnsd-rs", "--service"]
```

```bash
docker build -t rnsd-rs .
docker run -d --name rnsd-rs \
  --network host \
  -v ~/.rsReticulum:/root/.rsReticulum \
  --restart unless-stopped \
  rnsd-rs
```

Use `--network host` if you want AutoInterface to discover peers via IPv6 multicast on the LAN — bridged networking sees only other containers on the same Docker network. For a TCP-only public node, drop `--network host` and use `-p 4242:4242` instead.

Mount `~/.rsReticulum` so identity and routing state survive container rebuilds. For a USB-attached RNode or other serial radio, pass it through with `--device=/dev/ttyUSB0` (or, more reliably, a `/dev/serial/by-id/...` path that doesn't shuffle on reboot). For an RNode TCP bridge, no device passthrough is needed; set the RNode interface `port` to `tcp://host:7633` and make sure the container can reach that host.

---

## Raspberry Pi systemd

A Pi 4 or Pi Zero 2 W running headless makes a fine always-on transport node, often with a LoRa radio attached.

Install `rnsd-rs`, drop your config in `~/.rsReticulum/config`, then run it as a systemd service.

```ini
# /etc/systemd/system/rnsd-rs.service
[Unit]
Description=Reticulum Network Stack Daemon
After=network.target

[Service]
Type=simple
Restart=always
RestartSec=3
User=pi
ExecStart=/usr/local/bin/rnsd-rs --config /home/pi/.rsReticulum --service

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now rnsd-rs
```

If you're exposing TCP to the internet, open the port:

```bash
sudo ufw allow 4242/tcp
```

Use `/dev/serial/by-id/...` paths in your interface config — USB device numbers aren't stable across reboots, especially with multiple radios attached.

---

## Offline Inbox node walkthrough

1. Install `lxmd-rs` on the host alongside `rnsd-rs`, and confirm `rnsd-rs` is running.
2. Start the propagation daemon: `lxmd-rs --config ~/.rsLXMF --rnsconfig ~/.rsReticulum --propagation-node`.
3. The first run generates a propagation node identity and prints its destination hash. Publish that 32-character hash to your users as the Offline Inbox node hash.
4. Wrap it in a systemd unit, with `ExecStart` pointing at `lxmd-rs` and the same explicit config paths.

Ratspeak users can leave Offline Inbox on **Auto**, where the app chooses a reachable propagation node, or switch to **Manual** and paste the published hash. Multiple propagation nodes can discover each other through the announce mesh and gossip stored messages when you configure them to peer, so the store-and-forward role is not tied to a single box.

---

## Remote management

Reticulum has built-in tooling for inspecting and managing nodes over the network — no SSH, no port forwarding, no VPN.

On the remote node, in `~/.rsReticulum/config`:

```ini
[reticulum]
  enable_remote_management = yes
  remote_management_allowed = 9fb6d773498fb3feda407ed8ef2c3229
  respond_to_probes = yes
```

`remote_management_allowed` is a comma-separated list of identity hashes authorized to query this node. `respond_to_probes` lets it answer `rnprobe-rs` requests.

Generate a management identity on your local machine:

```bash
mkdir -p ~/.rsReticulum/identities
rnid-rs -g ~/.rsReticulum/identities/mgmt
rnid-rs -i ~/.rsReticulum/identities/mgmt -p   # prints the identity hash
```

Add that hash to the remote node's `remote_management_allowed`, restart the daemon, and you're authenticated. All management traffic is end-to-end encrypted and identity-authenticated; there are no passwords to leak.

---

## Monitoring with rnstatus-rs, rnpath-rs, rnprobe-rs

Use `rnstatus-rs`, `rnpath-rs`, and `rnprobe-rs` for routine node diagnostics.

```bash
# Live interface and link state on the local node
rnstatus-rs --config ~/.rsReticulum

# Same query, but against a remote node
rnstatus-rs --config ~/.rsReticulum -R <node_hash> -i ~/.rsReticulum/identities/mgmt

# Path table — what the node thinks it knows about routing
rnpath-rs --config ~/.rsReticulum -R <node_hash> -i ~/.rsReticulum/identities/mgmt

# Round-trip and packet loss to a destination
rnprobe-rs --config ~/.rsReticulum rnstransport.probe <dest_hash> -n 5
```

`rnstatus-rs` is what you reach for first — it shows interface health, traffic counters, and link state. `rnpath-rs` answers "does this node know how to reach X, and through whom." `rnprobe-rs` measures real RTT and loss for a destination, including hop count and (where the link supports it) RSSI/SNR. Add `-w <seconds>` to any of them to set a query timeout, or `-j` for JSON output you can pipe into a fleet monitor.

A simple fleet check is a shell loop calling `rnstatus-rs -R -j` against each of your node hashes and flagging anything that times out.

---

## Updating

Pull the latest release tarball, or rebuild from a source checkout with `cargo build --release` in the relevant repo. `rsLXMF` needs `rsReticulum` beside it when built from source. See [Building from Source](../getting-started/building-from-source) for the full layout. Restart the service. Identity and routing state at `~/.rsReticulum/` and LXMF daemon state at `~/.rsLXMF/` are preserved across version bumps unless you deliberately pointed the tools at another directory.

For containers, the persistent volume holding `~/.rsReticulum` is what makes upgrades painless — stop, remove, rebuild, re-run with the same mount, and the node comes back with the same identity and announce history.
