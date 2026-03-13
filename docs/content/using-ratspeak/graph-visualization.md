# Graph Visualization

A real-time, interactive force-directed graph of your Reticulum mesh network — see your hub, contacts, transport nodes, and discovered peers at a glance.

## Overview

The Graph view renders a live network topology using D3.js force simulation on an HTML Canvas. Nodes represent Reticulum destinations; edges represent known paths between them. The graph updates in real time as peers are discovered, go stale, or disappear.

## Node Types

Each node is color-coded by its role and status:

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

## What's Next

- [Network Monitoring](../using-ratspeak/network-monitoring) — connections table and interface stats
- [Dashboard Overview](../using-ratspeak/dashboard-overview) — general interface tour
- [Building Networks](../connecting/building-networks) — network topology strategies
