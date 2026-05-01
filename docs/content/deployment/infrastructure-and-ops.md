# Infrastructure & Ops

Day-2 operations for a Reticulum deployment: what to run, where to run it, and how to manage it once it's out the door.

---

## What you're running

Two roles cover almost every infrastructure deployment.

**Transport node.** Any Reticulum node with `enable_transport = yes` in its config. It forwards packets between the interfaces it's configured with — Ethernet, TCP tunnels, LoRa, I2P, whatever. A small VPS, a home server, or a Raspberry Pi all work. Transport nodes are the backbone of a multi-hop mesh.

**Propagation node.** A store-and-forward LXMF server. It holds messages for offline peers and syncs state with other propagation nodes so a recipient can fetch their queued mail from any peer in the cluster. Run `lxmd` from the Rust stack, or `python3 -m LXMF.Utilities.lxmd` from the upstream Python LXMF package.

A single host can do both. They're separate processes (`rnsd` for transport, `lxmd` for propagation) sharing one Reticulum config at `~/.reticulum/config`.

---

## Docker

A container running `rnsd` on `python:3.12-slim` is the path of least resistance on cloud hosts.

```dockerfile
FROM python:3.12-slim
RUN pip install --no-cache-dir rns lxmf
COPY config /root/.reticulum/config
EXPOSE 4242
CMD ["rnsd", "--service"]
```

```bash
docker build -t rnsd .
docker run -d --name rnsd \
  --network host \
  -v ~/.reticulum:/root/.reticulum \
  --restart unless-stopped \
  rnsd
```

Use `--network host` if you want AutoInterface to discover peers via IPv6 multicast on the LAN — bridged networking sees only other containers on the same Docker network. For a TCP-only public node, drop `--network host` and use `-p 4242:4242` instead.

Mount `~/.reticulum` so identity and routing state survive container rebuilds. For a USB-attached RNode or other serial radio, pass it through with `--device=/dev/ttyUSB0` (or, more reliably, a `/dev/serial/by-id/...` path that doesn't shuffle on reboot).

---

## Raspberry Pi systemd

A Pi 4 or Pi Zero 2 W running headless makes a fine always-on transport node, often with a LoRa radio attached.

Install Reticulum, drop your config in `~/.reticulum/config`, then run as a systemd service.

```ini
# /etc/systemd/system/rnsd.service
[Unit]
Description=Reticulum Network Stack Daemon
After=network.target

[Service]
Type=simple
Restart=always
RestartSec=3
User=pi
ExecStart=/home/pi/.local/bin/rnsd --service

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now rnsd
```

If you're exposing TCP to the internet, open the port:

```bash
sudo ufw allow 4242/tcp
```

Use `/dev/serial/by-id/...` paths in your interface config — USB device numbers aren't stable across reboots, especially with multiple radios attached.

---

## Propagation node walkthrough

1. Install LXMF on the host alongside Reticulum, and confirm `rnsd` is running.
2. Start the propagation daemon: `python3 -m LXMF.Utilities.lxmd` (or `lxmd` on the Rust stack).
3. The first run generates a propagation node identity and prints its destination hash. Publish that hash to your users.
4. Wrap it in a systemd unit (same shape as `rnsd.service` above, with `ExecStart` pointing at `lxmd`).

Clients configure the published hash as their outbound propagation node and sync stored messages on demand. Multiple propagation nodes discover each other through the announce mesh and gossip stored messages, so any peer in the cluster can serve any recipient.

---

## Remote management

Reticulum has built-in tooling for inspecting and managing nodes over the network — no SSH, no port forwarding, no VPN.

On the remote node, in `~/.reticulum/config`:

```ini
[reticulum]
  enable_remote_management = yes
  remote_management_allowed = 9fb6d773498fb3feda407ed8ef2c3229
  respond_to_probes = yes
```

`remote_management_allowed` is a comma-separated list of identity hashes authorized to query this node. `respond_to_probes` lets it answer `rnprobe` requests.

Generate a management identity on your local machine:

```bash
rnid -g ~/.reticulum/identities/mgmt
rnid -i ~/.reticulum/identities/mgmt -p   # prints the hash
```

Add that hash to the remote node's `remote_management_allowed`, restart `rnsd`, and you're authenticated. All management traffic is end-to-end encrypted and identity-authenticated; there are no passwords to leak.

---

## Monitoring with rnstatus, rnpath, rnprobe

These three tools ship with both the Rust (`rsReticulum`) and upstream Python distributions.

```bash
# Live interface and link state on the local node
rnstatus

# Same query, but against a remote node
rnstatus -R <node_hash> -i ~/.reticulum/identities/mgmt

# Path table — what the node thinks it knows about routing
rnpath -R <node_hash> -i ~/.reticulum/identities/mgmt

# Round-trip and packet loss to a destination
rnprobe rnstransport.probe <dest_hash> -n 5
```

`rnstatus` is what you reach for first — it shows interface health, traffic counters, and link state. `rnpath` answers "does this node know how to reach X, and through whom." `rnprobe` measures real RTT and loss for a destination, including hop count and (where the link supports it) RSSI/SNR. Add `-w <seconds>` to any of them to set a query timeout, or `-j` for JSON output you can pipe into a fleet monitor.

A simple fleet check is a shell loop calling `rnstatus -R -j` against each of your node hashes and flagging anything that times out.

---

## Updating

**Python stack (Pi, Docker base image).** `apt update && apt upgrade` for the OS, then `pip install --upgrade rns lxmf` for Reticulum and LXMF themselves. Restart the systemd unit or rebuild the container.

**Rust stack (`rsReticulum`, `rsLXMF`).** Pull the latest release tarball, or `cargo install --path .` from a source checkout. Restart the service. Identity and routing state at `~/.reticulum/` are preserved across version bumps.

For containers, the persistent volume holding `~/.reticulum` is what makes upgrades painless — stop, remove, rebuild, re-run with the same mount, and the node comes back with the same identity and announce history.
