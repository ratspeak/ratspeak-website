# Choosing Your Setup

Ratspeak is a stack, not a single product. Before installing anything, decide how you want to talk on the mesh: through a desktop app, a phone, a handheld LoRa device, or a piece of infrastructure you run yourself. This page walks through the realistic combinations.

## Pick a Scenario

| You want to... | What you install |
|---|---|
| Send LXMF messages and browse peers from a regular computer | Ratspeak desktop |
| Same as above, but route over a TCP backhaul (public internet or your VPS) | Ratspeak desktop + TCP hub |
| Carry Ratspeak in your pocket | Ratspeak mobile |
| Add LoRa range to your phone or laptop | Ratspeak + an RNode, or Ratdeck as a BLE bridge where supported |
| Carry one device that does everything, no phone or laptop required | Ratdeck or Ratcom (standalone) |
| Run infrastructure for a community or your own LAN | Self-hosted `rnsd-rs` and optionally `lxmd-rs` |

## Just the Ratspeak Desktop App

The simplest start. You install the desktop app on macOS, Linux, or Windows and you're on the mesh. With no other configuration, it discovers peers via local broadcast and any TCP transport nodes you connect to. Good for: a normal user with internet who wants to try LXMF.

- See: [Install and Platform Setup](../getting-started/install-and-platform-setup)
- See: [Ratspeak App](../products/ratspeak)

## Ratspeak Desktop + a TCP Hub

Same client, but you bring your own backhaul. Point it at the public hub `rns.ratspeak.org:4242` to join the wider Ratspeak network, or run your own VPS to host a private one. Useful when you're behind restrictive NAT, want a stable rendezvous point, or want to bridge two LANs together.

- See: [IP, LAN & I2P](../networking/ip-internet-and-i2p)
- See: [Self-Hosted Transport](#/getting-started/choosing-your-setup::self-hosted-transport-node) below

## Ratspeak Mobile

iOS and Android builds of the same client. The main difference is how you talk to LoRa hardware: iOS does not expose USB to apps, so radios connect over Bluetooth LE. Android supports BLE and USB-OTG. If you want a phone to drive a LoRa radio, use a BLE-capable RNode or Ratdeck's bridge profile where supported.

- See: [Install and Platform Setup](../getting-started/install-and-platform-setup)
- See: [Bluetooth Interfaces](../networking/bluetooth-interfaces)

## Ratspeak + an RNode or Ratdeck Bridge

Add a portable LoRa node to your phone or laptop. The radio carries the long-range link; Ratspeak on your main device handles the long sessions and the screen real estate. A normal RNode connects over USB, USB-OTG on Android, or BLE where the firmware supports it. Ratdeck can expose a BLE bridge profile when enabled. Ratcom is standalone first and bridges over Wi-Fi today; it is not a mobile BLE radio tether yet.

- See: [Ratdeck](../products/ratdeck)
- See: [Ratcom](../products/ratcom)
- See: [LoRa Radio Interfaces](../networking/lora-and-rnode)

## Just a Ratdeck or Ratcom

A handheld-only deployment. Both devices run microReticulum and speak LXMF directly — no phone, no laptop, no desktop client involved. The Ratdeck has a 4-inch touchscreen and full QWERTY; the Ratcom is the smaller Cardputer form factor. Best for backpack carry, field operations, or anyone who wants the mesh to be a single self-contained object.

- See: [Ratdeck](../products/ratdeck)
- See: [Ratcom](../products/ratcom)

## Self-Hosted Transport Node

If you want to be infrastructure rather than just a client, run `rnsd-rs` on a Raspberry Pi, a VPS, or a workstation. That gives you a transport node that other peers can route through. Add `lxmd-rs` if you also want an Offline Inbox/propagation node for offline contacts. You don't need this to use Ratspeak — it's for operators who want to extend or stabilize a network.

- See: [Infrastructure & Ops](../deployment/infrastructure-and-ops)

## What You Actually Need

You do not need a public IP, an account, an email, or a working internet connection to use Ratspeak. The mesh runs on whatever transport you give it: local network, TCP over the internet, LoRa, packet radio, I2P, or any combination. Pick the scenario that matches your situation and start there — you can layer the rest on later.

## Next

- [Install and Platform Setup](../getting-started/install-and-platform-setup)
- [Your First Session](../getting-started/your-first-session)
