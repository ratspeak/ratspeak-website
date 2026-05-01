# Deployment Overview

Deployment in Reticulum means running infrastructure beyond a single client. A
lone Ratspeak install talking over the public TCP testnet is a *user*, not a
deployment. Once you put up a transport node so your friends can reach each
other, run a propagation node so messages survive while peers are offline,
gateway a LoRa segment to the internet, or hand out IFAC keys to lock a private
mesh — you are deploying.

The four scenarios below cover the shapes most operators end up in. They are
not exclusive: a community mesh usually contains several home-or-friend-group
deployments, and an emergency kit is just a community mesh with the IP
backhaul cut. Pick the scenario closest to what you want and follow its guide.

## Pick a scenario

**[Home or Friend Group](../deployment/home-or-friend-group)** — A small
private mesh for a household, a band, a study group, a guild. A few Ratspeak
clients, optionally one always-on transport node on a cheap VPS, a Raspberry
Pi, or a desktop that's already on. IFAC pre-shared key locks the network so
strangers can't join. This is the most common starting point; do not overbuild.

**[Community Mesh](../deployment/community-mesh)** — A multi-node LoRa
mesh covering a neighborhood, a campus, or a town, with one or more IP
gateways for backhaul between segments. Public or semi-public, multiple
operators each running their own node. Uses Boundary or Gateway interface
modes and stitches local AutoInterface segments together over TCP. Pick this
when you want coverage and the operator pool is bigger than one person.

**[Off-grid and Emergency](../deployment/off-grid-emergency)** — RNode
plus handheld only, no internet, LoRa for everything, batteries and solar for
power. Designed to keep working when the grid does not. Pick this for field
exercises, disaster preparedness kits, or remote sites with no backhaul.

**[Infrastructure and Ops](../deployment/infrastructure-and-ops)** — The
operator's reference for running a propagation node or transport router as a
service: Docker and systemd deployments, monitoring with `rnstatus`, `rnpath`,
and `rnprobe`, and remote management. Read this once you've picked one of the
above and need to run it reliably.

## Common building blocks

Every scenario reuses the same primitives. You will see them again on each
page; what changes is how they are combined.

- **Transport nodes** forward packets between interfaces and announce paths
  on behalf of the network. One always-on transport per region of the mesh
  is usually enough.
- **Propagation nodes** store-and-forward LXMF messages so a recipient who
  is offline still receives them when they next come online. Without one,
  delivery is best-effort and synchronous.
- **IFAC pre-shared key** authenticates an interface so only nodes that
  know the key can join. This is what turns a public-by-default protocol
  into a private mesh.
- **RNode and LoRa** provide the radio layer for off-grid and community
  meshes. Any RNode-compatible hardware works; firmware is loaded with
  `rnodeconf`.
- **The `rnsd` daemon** runs the Reticulum stack as a background service.
  The Rust `rnsd` shipped with Ratspeak and the Python `rnsd` from the
  upstream Reticulum project are wire-compatible — pick whichever fits
  the host. Rust is leaner on small Linux boxes and Windows; Python is
  the reference and has the longest field history.
