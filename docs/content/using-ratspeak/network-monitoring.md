# Network Monitoring

Real-time visibility into your mesh network — connections, interfaces, throughput, and alerts.

## Connections Table

The connections table is the primary view for network health. It shows all discovered destinations with:

- **Name** — the announced display name (if available)
- **Destination hash** — the 16-byte hex address
- **Hop count** — number of transport nodes between you and the destination
- **Path age** — how recently the path was confirmed
- **Interface** — which of your interfaces carries the path
- **Status** — reachable / stale / unreachable

The table supports sorting by any column, filtering by interface type, and searching by name or hash.

<div class="screenshot-placeholder" data-caption="Network monitoring view showing connections table, interface stats cards with throughput sparklines, and alert history">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#7e8fa2" stroke-width="1.5" stroke-linecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
    <div>Network monitoring view with topology — screenshot placeholder</div>
</div>

## Interface Stats

For each active interface, Ratspeak displays:

- **Type** — TCP Client, TCP Server, RNode (LoRa), AutoInterface, BLE Mesh
- **Status** — connected / disconnected
- **Throughput** — bytes in/out with sparkline history (up to 60 samples)
- **RNode details** — frequency, bandwidth, spreading factor, coding rate, TX power (for LoRa interfaces)

Stats are polled every **1.5 seconds** (configurable via `poll_interval`).

## Throughput Sparklines

Each interface shows a mini throughput chart with the last 60 data points (~90 seconds of history). This gives you a quick visual sense of traffic patterns without needing a dedicated monitoring tool.

## Alert System

Ratspeak monitors interface health and generates alerts:

| Level | Trigger | Example |
|-------|---------|---------|
| **Critical** | Interface went down | "Dublin Hub disconnected" |
| **Info** | Interface came up | "Dublin Hub connected" |
| **Info** | Auto-removal | "RNode on /dev/ttyUSB0 removed (port disappeared)" |

Alerts are deduplicated within a **30-second window** and capped at **50 active alerts**. Internal interfaces (LocalInterface, SharedInstance) don't trigger alerts.

Interface names are converted from raw RNS format (e.g., `TCPClientInterface[Dublin Hub/dublin.connect...:4965]`) to human-readable messages.

## RNode Auto-Removal

If an RNode serial port disappears (e.g., USB device unplugged), Ratspeak detects it after **3 consecutive polling cycles** (~4.5 seconds) and automatically removes the interface configuration, then restarts the hub node.

## Status Summaries

Every **5 minutes** (configurable via `status_summary_interval`), Ratspeak emits a status summary counting online, stale, and offline contacts from the path table.

## Graph View

For a visual representation of your mesh topology, see the [Graph Visualization](../using-ratspeak/graph-visualization) view. The graph renders the same network data as the connections table but as an interactive force-directed node graph with color-coded node types and edge paths.

## What's Next

- [Graph Visualization](../using-ratspeak/graph-visualization) — interactive network graph
- [Dashboard Overview](../using-ratspeak/dashboard-overview) — general interface tour
- [Interface Types Overview](../connecting/interface-types-overview) — understanding interface types
- [Building Networks](../connecting/building-networks) — network topology strategies
