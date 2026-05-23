# Home or Friend Group

A private mesh for a household, a few friends, or a small organization. Two to ten people, one always-on box doing the routing, and an interface lock so nobody outside the group can join. This page is the recipe.

## Why this setup

You want chat that does not depend on Discord, Signal, or any company's servers. You want it to keep working when your home internet hiccups. You want everyone you trust to be reachable, and nobody you don't.

A single always-on transport node solves the hard part: it stays online so the rest of you can come and go. Your laptops and phones connect to it when they're on, and it gives everyone a stable route through the group. Messages to offline friends sit in an Offline Inbox only if you also run or choose an LXMF propagation node; the transport node by itself forwards packets, not mailbox storage. Lock the network with IFAC and the whole thing is invisible to outsiders, even ones who happen to be running Reticulum on the same wire.

## Hardware you need

One always-on machine. Any of these work:

- A cheap VPS with a public IP, anywhere from $3 to $10 per month.
- A Raspberry Pi 4 or 5 sitting on your home Wi-Fi.
- An old workstation or NUC you don't power off.
- A spare laptop with the lid-close-suspend behaviour disabled.

Two to ten Ratspeak clients, one per person. These are just the desktop or mobile app.

Optional handhelds: a Ratdeck or rsCardputer unit for anyone who wants off-grid LoRa coverage when they're away from Wi-Fi.

## Step 1 - set up the always-on node

The transport node runs `rnsd-rs`, the rsReticulum daemon. It is a single executable, light on memory, and a good fit for Raspberry Pi-class boards.

Drop the daemon's config at `~/.rsReticulum/config` unless you pass a different directory with `--config`. Start with this minimum:

```
[reticulum]
  enable_transport = yes
  share_instance = yes

[interfaces]
  [[Default Interface]]
    type = AutoInterface
    interface_enabled = yes
```

`enable_transport = yes` is the critical line. Without it, the node will pass packets for itself but won't forward for the group. With it, the node becomes the hub everyone else routes through.

Start the daemon and leave it running. On a Pi, wire it up as a systemd service so it comes back after reboots.

## Step 2 - lock the interface with IFAC

By default a Reticulum interface accepts traffic from any other Reticulum node it can reach. Fine for a public mesh, wrong for a private one. The fix is the Interface Authentication Code, IFAC for short.

Pick a network name and a strong shared secret. Write them down somewhere your group can find them; you'll need them on every device. Then add a TCP server interface to the always-on node's config:

```
[interfaces]
  [[Friend Group VPS]]
    type = TCPServerInterface
    listen_ip = 0.0.0.0
    listen_port = 4242
    network_name = our-friends
    passphrase = a-strong-shared-secret
```

`network_name` and `passphrase` together form the lock. Leave `ifac_size` unset unless you have a specific reason to tune it; Reticulum picks an interface-appropriate default. Anyone who tries to connect without the matching pair gets ignored. No announces, no path discovery, nothing leaks.

Restart `rnsd-rs` on the node. If it's a VPS, open port 4242 in your firewall (or whichever port you chose). If it's a home Pi reachable from outside, forward that port on your router.

## Step 3 - add it to each Ratspeak client

Open Ratspeak, head to Settings, then Network, then Interfaces. Add a new TCP client interface pointing at the always-on node:

```
[interfaces]
  [[Home VPS]]
    type = TCPClientInterface
    target_host = vps.example.org
    target_port = 4242
    network_name = our-friends
    passphrase = a-strong-shared-secret
```

The IFAC name and passphrase must match the server side exactly, character for character. A typo gets you silence, not an error message. That's by design.

Save, restart the interface, and watch the connection come up. Send an announce. Within a few seconds your friends should see you in their contacts list, and you should see theirs. You're done.

For people on your home Wi-Fi who don't need the VPS, you can also add an `AutoInterface` block for LAN discovery - it'll find the always-on node automatically with no config beyond `network_name` and `passphrase`.

## Bringing in handhelds (Ratdeck/rsCardputer)

If anyone wants LoRa coverage for hikes, festivals, or just walking around the neighbourhood, hand them a Ratdeck or rsCardputer. These are portable nodes with a LoRa radio onboard. Configure the same `network_name` and `passphrase` on the LoRa interface and they'll join the same locked mesh, just over radio instead of TCP.

These handhelds are standalone Reticulum endpoints with their own identity unless you deliberately import or migrate an identity. Ratdeck can also expose an RNode-compatible BLE bridge when that mode is enabled. rsCardputer can boot into RNode mode when you want it to act as the radio for a phone or laptop instead of as its own endpoint. When someone is at home, traffic can flow through the VPS. When they're out of range, it can flow over LoRa to whichever group member is closest.

## Maintenance

Update the daemon when you update Ratspeak. Wire format is stable, but security fixes happen.

Rotate the IFAC passphrase if someone leaves the group. Pick a new one, push it to every device on a known-good day, and the departing member's old config stops working immediately.

Watch the always-on node's logs for the first week. You're looking for stable links and announce traffic. If links keep dropping, your network is the suspect, not Reticulum.

Back up `~/.rsReticulum/storage/` on the always-on node from time to time. It holds path tables and propagated messages - losing it isn't fatal, but a fresh node takes a while to relearn the topology.

That's the whole deployment. One always-on box, an IFAC lock, and a TCP client on each device. The rest of the network you build on top of this is just contacts and conversations.
