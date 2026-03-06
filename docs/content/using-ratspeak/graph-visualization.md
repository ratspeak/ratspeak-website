# Graph Visualization

A real-time, interactive force-directed graph of your Reticulum mesh network — see your hub, contacts, transport nodes, and discovered peers at a glance.

## Overview

The Graph view renders a live network topology using D3.js force simulation on an HTML Canvas. Nodes represent Reticulum destinations; edges represent known paths between them. The graph updates in real time as peers are discovered, go stale, or disappear.

<div class="screenshot-placeholder">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#7e8fa2" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><line x1="9.5" y1="10" x2="6.5" y2="6.5"/><line x1="14.5" y1="10" x2="17.5" y2="6.5"/><line x1="9.5" y1="14" x2="6.5" y2="17.5"/><line x1="14.5" y1="14" x2="17.5" y2="17.5"/></svg>
    <div>Graph visualization view — screenshot placeholder</div>
</div>

## Node Types

Each node is color-coded by its role and status:

<div class="docs-diagram">
<svg viewBox="0 0 700 200" xmlns="http://www.w3.org/2000/svg" fill="none">
  <!-- Title -->
  <text x="350" y="24" text-anchor="middle" fill="#e2e8f0" font-family="Outfit" font-size="14" font-weight="600">Node Type Color Legend</text>

  <!-- Hub -->
  <circle cx="70" cy="75" r="14" fill="#00D4AA" opacity="0.9"/>
  <text x="70" y="110" text-anchor="middle" fill="#00D4AA" font-family="JetBrains Mono" font-size="11" font-weight="600">Hub</text>
  <text x="70" y="125" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Your node</text>

  <!-- Contact -->
  <circle cx="185" cy="75" r="14" fill="#38BDF8" opacity="0.9"/>
  <text x="185" y="110" text-anchor="middle" fill="#38BDF8" font-family="JetBrains Mono" font-size="11" font-weight="600">Contact</text>
  <text x="185" y="125" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Reachable</text>

  <!-- Stale -->
  <circle cx="300" cy="75" r="14" fill="#F59E0B" opacity="0.9"/>
  <text x="300" y="110" text-anchor="middle" fill="#F59E0B" font-family="JetBrains Mono" font-size="11" font-weight="600">Stale</text>
  <text x="300" y="125" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">30-60 min</text>

  <!-- Offline -->
  <circle cx="415" cy="75" r="14" fill="#EF4444" opacity="0.9"/>
  <text x="415" y="110" text-anchor="middle" fill="#EF4444" font-family="JetBrains Mono" font-size="11" font-weight="600">Offline</text>
  <text x="415" y="125" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">&gt;60 min</text>

  <!-- Transport -->
  <circle cx="530" cy="75" r="14" fill="#C084FC" opacity="0.9"/>
  <text x="530" y="110" text-anchor="middle" fill="#C084FC" font-family="JetBrains Mono" font-size="11" font-weight="600">Transport</text>
  <text x="530" y="125" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Router node</text>

  <!-- Discovered -->
  <circle cx="645" cy="75" r="14" fill="#6B7280" opacity="0.9"/>
  <text x="645" y="110" text-anchor="middle" fill="#6B7280" font-family="JetBrains Mono" font-size="11" font-weight="600">Discovered</text>
  <text x="645" y="125" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">Unknown peer</text>

  <!-- Edges legend -->
  <line x1="150" y1="165" x2="250" y2="165" stroke="#3a4759" stroke-width="1.5"/>
  <text x="310" y="169" fill="#7e8fa2" font-family="Outfit" font-size="10">Direct link</text>

  <line x1="420" y1="165" x2="520" y2="165" stroke="#3a4759" stroke-width="1.5" stroke-dasharray="6 3"/>
  <text x="580" y="169" fill="#7e8fa2" font-family="Outfit" font-size="10">Inferred path</text>
</svg>
<figcaption>Node colors and edge types used in the graph view</figcaption>
</div>

| Color | Type | Description |
|-------|------|-------------|
| Green | **Hub** | Your local node (always centered) |
| Blue | **Contact** | Known contacts with a reachable path |
| Yellow | **Stale** | Contacts with path age between 30-60 minutes |
| Red | **Offline** | Contacts with no recent path (>60 minutes) |
| Purple | **Transport** | Transport nodes (routers) discovered in path table |
| Gray | **Discovered** | Unknown peers found via announces or path table |

## Edge Types

- **Solid lines** — direct links (1-hop paths confirmed in the path table)
- **Dashed lines** — inferred multi-hop paths (derived from hop counts)

## Interactions

### Zoom and Pan
Use the mouse wheel to zoom in/out and click-drag on the background to pan. The graph supports smooth zooming with D3's zoom behavior.

### Node Dragging
Click and drag any node to reposition it. Dragged nodes are temporarily pulled out of the force simulation.

### Pinning Nodes
Double-click a node to pin it in place. Pinned nodes stay at their position even as the simulation runs. Double-click again to unpin.

### Node Detail Panel
Click any node to open a detail panel showing:
- Display name and destination hash
- Node type and status
- Hop count and path age
- Interface carrying the path

### Search and Filter
The toolbar above the graph provides:
- **Search** — filter nodes by name or destination hash
- **Type filters** — toggle visibility of Hub, Contact, Transport, and Discovered nodes

## Technical Details

### Canvas Rendering
The graph uses HTML Canvas (not SVG) for rendering. This provides significantly better performance with large node counts — hundreds of nodes render smoothly at 60fps.

### Simulation Lifecycle
The D3 force simulation **pauses when the graph view is not active** to avoid unnecessary CPU usage. When you switch to the Graph tab, the simulation resumes. This is managed by the view lifecycle in `nav.js`.

### Data Source
Graph data comes from the same `stats_update` Socket.IO event that feeds the connections table and health cards. The `graphUpdate()` function in `graph.js` processes this data to add/remove/update nodes and edges.

## Next Steps

- [Network Monitoring](../using-ratspeak/network-monitoring) — connections table and interface stats
- [Dashboard Overview](../using-ratspeak/dashboard-overview) — general interface tour
- [Building Networks](../connecting/building-networks) — network topology strategies
