# Off-grid & Emergency

A LoRa-only mesh for situations where there's no internet, no cell service, and no
shared infrastructure: disaster response, expeditions, remote worksites, off-grid
communities. This page is the practical baseline. Everything below works on battery
power and stays within the radio band.

## When to use this

Reach for an off-grid mesh when one of these is true:

- Cellular and internet are down or never existed (storm, blackout, backcountry).
- You need group messaging that survives without any provider.
- You want a private radio channel that won't be confused by other meshes nearby.

This is **messaging-grade** comms: text, position, short status. LoRa is not a
video link. Don't plan on streaming anything. Plan on sending sentences.

## Hardware

Minimum viable off-grid kit:

- **One handheld per person.** Either a Ratdeck or rsCardputer for standalone LoRa
  messaging, or a phone/laptop running Ratspeak connected to a separate RNode
  over BLE, USB where the platform allows it, or a local RNode TCP bridge if
  your field kit supplies its own LAN.
  Ratdeck has BLE bridge support; rsCardputer can be used as a standalone handheld
  or booted into RNode mode for BLE/USB host use.
- **Optional always-on transport node.** A Raspberry Pi + RNode + battery + small
  solar panel, sited high. One transport node can stitch together handhelds that
  can't directly hear each other.

You don't need IP, you don't need Wi-Fi, you don't need a backbone. The only
exception: if you want to bridge a single laptop into the mesh in the field, a
Ratdeck can run as a Wi-Fi access point and the laptop joins it. That's local-only,
no upstream internet involved. Treat that AP bridge as experimental and test it
before the deployment.

## Power budget

LoRa is a low-power protocol, but TX bursts still cost real current. Sensible
numbers to plan around:

- **RNode TX draw:** ~100-200 mA on transmit, much lower idle/RX. A handheld goes
  a full day on its internal pack with normal use.
- **Always-on transport node:** a 20 W solar panel + 100 Wh battery keeps a Pi +
  RNode running 24/7 in normal weather. In persistent overcast, double the panel
  or accept a daily downtime window.
- **Carry a spare battery pack** for handhelds. Two cheap USB-C power banks are
  worth more than one expensive one — redundancy beats capacity.

If the transport node is on a tower or roof, mount the panel where you can reach
it for cleaning. Snow and dust kill more solar deployments than hardware failure.

## Picking a LoRa preset

Reticulum exposes the standard RNode presets. For an off-grid group, start here:

- **Long Fast (SF11, BW250):** good baseline. Reasonable range, tolerable
  throughput for short messages.
- **Long Moderate (SF11, BW125):** drop to this if signal is marginal. Narrower
  bandwidth = more range, but every message takes noticeably longer to send.

Higher spreading factor means longer range and slower throughput. Don't switch
presets mid-deployment unless every node switches together — mismatched presets
won't hear each other at all. Pick one preset per group and write it on the
inside of the case if you have to.

## Frequency and regs

Use the right ISM band for where you are:

- **915 MHz** — Americas, Australia
- **868 MHz** — Europe
- **923 MHz** — most of Asia

You're responsible for staying within local regulations on power, duty cycle, and
band edges. Don't transmit on bands that need a license unless you actually have
one. If you're crossing borders during the deployment, plan the radio config for
each leg before you leave.

## Setting up a transport node

A transport node is a node that relays for others. On the always-on Pi, add this to the rsReticulum config at `~/.rsReticulum/config`.

```
[reticulum]
  enable_transport = yes
```

That single setting turns the node into a relay. Without it, the node only
handles its own traffic. With it, handhelds out of direct earshot of each other
can still talk through the relay. Site the node high — antenna height beats
transmit power every time.

Confirm the transport node is announced and being heard before you scatter. Have
each handheld send a test message to the others. If the message routes through
the transport node, you're set.

## Locking the mesh with IFAC

Use IFAC even in emergencies. **Especially** in emergencies. IFAC stops random
unrelated mesh nodes — somebody's hobby gateway in the next valley — from
polluting your routing tables. Every node in your group sets the same
`network_name` and `passphrase` on the LoRa interface in the node's Reticulum config:

```
[interfaces]
  [[Field LoRa]]
    type = RNodeInterface
    port = /dev/ttyUSB0
    network_name = your-group-name
    passphrase = use-a-strong-shared-secret-here
```

Both fields must match exactly across every node. Treat the passphrase like a
shared key: write it down, hand it out in person before deployment, don't post
it. If somebody loses their handheld, rotate the passphrase across the group.

## Field tips

A few things that come up every real deployment:

- **Pre-share contacts before the emergency.** Trade announces and confirm pairs
  while you still have power and time. In a crisis, nobody wants to debug
  destination hashes.
- **Test the mesh in good weather.** Walk the perimeter, check fringe coverage,
  find the dead spots before they matter. Note where you needed to drop to Long
  Moderate.
- **Label every device.** A piece of tape with the node name and owner saves
  arguments later.
- **Don't expect interactive throughput.** Compose messages, send, move on.
  Treating LoRa like SMS works. Treating it like chat doesn't.
- **Keep one node off when not in use.** Rotating which handheld is powered up
  extends collective battery life across a multi-day event.
- **Antennas matter more than radios.** A clear sky and a good vertical antenna
  beat a high-end RNode buried in a backpack.

When the grid comes back, your mesh keeps working. That's the point.
