# Building Networks

Network topology patterns, mixing hardware types, and growing a Reticulum mesh from scratch.

## Transport Nodes vs Instances

The most important architectural decision is which nodes should be **Transport Nodes**:

| Type | Config | Role | Requirements |
|------|--------|------|-------------|
| **Instance** | `enable_transport = No` | End-user device, sends/receives | None — works anywhere |
| **Transport Node** | `enable_transport = Yes` | Forwards packets, routes announces | Should be fixed, persistent, reliable |

Not every node should be a transport node:

- **Resource consumption** — transport nodes maintain path tables and process all announces
- **Stability** — unstable transport nodes degrade network convergence
- **Bandwidth** — too many transport nodes on low-bandwidth mediums consume capacity with routing overhead

> **Tip**: A good rule of thumb: always-on, well-connected nodes should be transport nodes. Mobile or intermittent nodes should remain instances.

## Topology Patterns

<div class="docs-diagram">
<svg viewBox="0 0 700 340" xmlns="http://www.w3.org/2000/svg" fill="none">
  <!-- Star -->
  <text x="100" y="20" text-anchor="middle" fill="#00D4AA" font-family="Outfit" font-size="13" font-weight="600">Star</text>
  <circle cx="100" cy="80" r="14" stroke="#00D4AA" stroke-width="1.5" fill="rgba(0,212,170,0.15)"/>
  <text x="100" y="84" text-anchor="middle" fill="#00D4AA" font-family="JetBrains Mono" font-size="8">T</text>
  <circle cx="60" cy="50" r="8" stroke="#9eadbf" stroke-width="1" fill="rgba(158,173,191,0.08)"/>
  <circle cx="140" cy="50" r="8" stroke="#9eadbf" stroke-width="1" fill="rgba(158,173,191,0.08)"/>
  <circle cx="55" cy="110" r="8" stroke="#9eadbf" stroke-width="1" fill="rgba(158,173,191,0.08)"/>
  <circle cx="145" cy="110" r="8" stroke="#9eadbf" stroke-width="1" fill="rgba(158,173,191,0.08)"/>
  <circle cx="100" cy="130" r="8" stroke="#9eadbf" stroke-width="1" fill="rgba(158,173,191,0.08)"/>
  <line x1="90" y1="70" x2="65" y2="55" stroke="#3a4759" stroke-width="1"/>
  <line x1="110" y1="70" x2="135" y2="55" stroke="#3a4759" stroke-width="1"/>
  <line x1="90" y1="90" x2="60" y2="107" stroke="#3a4759" stroke-width="1"/>
  <line x1="110" y1="90" x2="140" y2="107" stroke="#3a4759" stroke-width="1"/>
  <line x1="100" y1="94" x2="100" y2="122" stroke="#3a4759" stroke-width="1"/>
  <text x="100" y="158" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Simple, one transport node</text>

  <!-- Mesh -->
  <text x="280" y="20" text-anchor="middle" fill="#F59E0B" font-family="Outfit" font-size="13" font-weight="600">Mesh</text>
  <circle cx="250" cy="60" r="12" stroke="#F59E0B" stroke-width="1.5" fill="rgba(245,158,11,0.12)"/>
  <text x="250" y="64" text-anchor="middle" fill="#F59E0B" font-family="JetBrains Mono" font-size="8">T</text>
  <circle cx="310" cy="60" r="12" stroke="#F59E0B" stroke-width="1.5" fill="rgba(245,158,11,0.12)"/>
  <text x="310" y="64" text-anchor="middle" fill="#F59E0B" font-family="JetBrains Mono" font-size="8">T</text>
  <circle cx="250" cy="110" r="12" stroke="#F59E0B" stroke-width="1.5" fill="rgba(245,158,11,0.12)"/>
  <text x="250" y="114" text-anchor="middle" fill="#F59E0B" font-family="JetBrains Mono" font-size="8">T</text>
  <circle cx="310" cy="110" r="12" stroke="#F59E0B" stroke-width="1.5" fill="rgba(245,158,11,0.12)"/>
  <text x="310" y="114" text-anchor="middle" fill="#F59E0B" font-family="JetBrains Mono" font-size="8">T</text>
  <line x1="260" y1="60" x2="300" y2="60" stroke="#3a4759" stroke-width="1"/>
  <line x1="260" y1="110" x2="300" y2="110" stroke="#3a4759" stroke-width="1"/>
  <line x1="250" y1="72" x2="250" y2="98" stroke="#3a4759" stroke-width="1"/>
  <line x1="310" y1="72" x2="310" y2="98" stroke="#3a4759" stroke-width="1"/>
  <line x1="258" y1="68" x2="302" y2="102" stroke="#3a4759" stroke-width="1"/>
  <line x1="302" y1="68" x2="258" y2="102" stroke="#3a4759" stroke-width="1"/>
  <text x="280" y="158" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Resilient, multiple paths</text>

  <!-- Hierarchical -->
  <text x="460" y="20" text-anchor="middle" fill="#38BDF8" font-family="Outfit" font-size="13" font-weight="600">Hierarchical</text>
  <circle cx="460" cy="50" r="14" stroke="#38BDF8" stroke-width="1.5" fill="rgba(56,189,248,0.15)"/>
  <text x="460" y="54" text-anchor="middle" fill="#38BDF8" font-family="JetBrains Mono" font-size="8">T</text>
  <circle cx="430" cy="90" r="10" stroke="#38BDF8" stroke-width="1" fill="rgba(56,189,248,0.08)"/>
  <text x="430" y="94" text-anchor="middle" fill="#38BDF8" font-family="JetBrains Mono" font-size="7">T</text>
  <circle cx="490" cy="90" r="10" stroke="#38BDF8" stroke-width="1" fill="rgba(56,189,248,0.08)"/>
  <text x="490" y="94" text-anchor="middle" fill="#38BDF8" font-family="JetBrains Mono" font-size="7">T</text>
  <circle cx="415" cy="125" r="6" stroke="#9eadbf" stroke-width="1" fill="rgba(158,173,191,0.06)"/>
  <circle cx="445" cy="125" r="6" stroke="#9eadbf" stroke-width="1" fill="rgba(158,173,191,0.06)"/>
  <circle cx="475" cy="125" r="6" stroke="#9eadbf" stroke-width="1" fill="rgba(158,173,191,0.06)"/>
  <circle cx="505" cy="125" r="6" stroke="#9eadbf" stroke-width="1" fill="rgba(158,173,191,0.06)"/>
  <line x1="452" y1="56" x2="434" y2="82" stroke="#3a4759" stroke-width="1"/>
  <line x1="468" y1="56" x2="486" y2="82" stroke="#3a4759" stroke-width="1"/>
  <line x1="424" y1="98" x2="417" y2="119" stroke="#3a4759" stroke-width="1"/>
  <line x1="434" y1="98" x2="443" y2="119" stroke="#3a4759" stroke-width="1"/>
  <line x1="484" y1="98" x2="477" y2="119" stroke="#3a4759" stroke-width="1"/>
  <line x1="494" y1="98" x2="503" y2="119" stroke="#3a4759" stroke-width="1"/>
  <text x="460" y="158" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Organized, tiered transport</text>

  <!-- Backbone + Access -->
  <text x="620" y="20" text-anchor="middle" fill="#C084FC" font-family="Outfit" font-size="13" font-weight="600">Backbone + Access</text>
  <line x1="580" y1="65" x2="660" y2="65" stroke="#C084FC" stroke-width="2"/>
  <circle cx="590" cy="65" r="10" stroke="#C084FC" stroke-width="1.5" fill="rgba(192,132,252,0.12)"/>
  <text x="590" y="69" text-anchor="middle" fill="#C084FC" font-family="JetBrains Mono" font-size="7">T</text>
  <circle cx="620" cy="65" r="10" stroke="#C084FC" stroke-width="1.5" fill="rgba(192,132,252,0.12)"/>
  <text x="620" y="69" text-anchor="middle" fill="#C084FC" font-family="JetBrains Mono" font-size="7">T</text>
  <circle cx="650" cy="65" r="10" stroke="#C084FC" stroke-width="1.5" fill="rgba(192,132,252,0.12)"/>
  <text x="650" y="69" text-anchor="middle" fill="#C084FC" font-family="JetBrains Mono" font-size="7">T</text>
  <text x="620" y="52" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="8">TCP backbone</text>
  <!-- Access points -->
  <circle cx="590" cy="110" r="6" stroke="#9eadbf" stroke-width="1" fill="rgba(158,173,191,0.06)"/>
  <circle cx="610" cy="120" r="6" stroke="#9eadbf" stroke-width="1" fill="rgba(158,173,191,0.06)"/>
  <circle cx="640" cy="110" r="6" stroke="#9eadbf" stroke-width="1" fill="rgba(158,173,191,0.06)"/>
  <circle cx="660" cy="120" r="6" stroke="#9eadbf" stroke-width="1" fill="rgba(158,173,191,0.06)"/>
  <line x1="590" y1="75" x2="590" y2="104" stroke="#3a4759" stroke-width="1" stroke-dasharray="3 2"/>
  <line x1="620" y1="75" x2="612" y2="114" stroke="#3a4759" stroke-width="1" stroke-dasharray="3 2"/>
  <line x1="650" y1="75" x2="642" y2="104" stroke="#3a4759" stroke-width="1" stroke-dasharray="3 2"/>
  <line x1="650" y1="75" x2="658" y2="114" stroke="#3a4759" stroke-width="1" stroke-dasharray="3 2"/>
  <text x="625" y="140" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="8">LoRa access</text>
  <text x="620" y="158" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">High-speed core + radio edges</text>
</svg>
<figcaption>Four common topology patterns. T = Transport Node, small circles = regular instances.</figcaption>
</div>

### Star
One central transport node, all others connect directly. Simple but single point of failure.

### Mesh
Multiple interconnected transport nodes. Resilient — traffic finds alternative paths if one node goes down.

### Hierarchical
Tiered structure with backbone transport nodes and leaf instances. Good for organized deployments.

### Backbone + Access
High-speed TCP backbone connecting transport nodes, with LoRa radio interfaces for last-mile access. Best of both worlds.

## Mixing Hardware Types

Reticulum's greatest strength is seamless medium mixing:

- **WiFi backbone + LoRa access** — high-speed core with long-range radio edges
- **TCP internet + LoRa local** — global reach with off-grid local mesh
- **Ethernet infrastructure + BLE last-meter** — wired backbone with wireless device connections

Interface modes help manage the boundaries:
- Set the internet-facing interface to `boundary` mode
- Set LoRa-facing interfaces to `gateway` mode to serve client devices
- Use `roaming` mode for mobile nodes

## Starting Small

Begin with two nodes on the same WiFi (AutoInterface). Add TCP connections to reach remote nodes. Add LoRa for off-grid capability. The network grows organically — no coordination required.

Each new node autonomously generates destinations and discovers peers. No central planning, no address allocation, no DNS registration.

## Trustless Open Access

Reticulum's encryption model means you can safely run **open-access networks**:

- All traffic is encrypted with ephemeral keys — no inspection possible
- No source addresses — sender anonymity by default
- Unforgeable delivery confirmations — cryptographic proof of receipt
- IFAC for private segments on shared mediums

Participants on the same network cannot interfere with each other's private communication.

## Next Steps

- [Interface Modes](../connecting/interface-modes) — configure interface behavior
- [Protocol Architecture](../understanding/protocol-architecture) — how routing works
- [Security Model](../understanding/security-model) — trustless design
