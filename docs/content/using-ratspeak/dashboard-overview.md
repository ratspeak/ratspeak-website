# Dashboard Overview

A tour of the Ratspeak interface — what's where and how to navigate.

## Layout

The dashboard is a single-page application with a consistent layout:

- **Sidebar** (left) — main navigation between views
- **Header** — node status, alerts, identity info
- **Main content** (center) — the active view's content
- **Status indicators** — real-time connection and interface status

<div class="screenshot-placeholder" data-caption="Full Ratspeak dashboard layout showing sidebar navigation, header status bar, and main content area">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#7e8fa2" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
    <div>Full dashboard with numbered callouts — screenshot placeholder</div>
</div>

## Main Views

The sidebar provides access to seven views:

### Dashboard
The home view showing a quick overview of your node: active interfaces, connected peers, recent announces, and alert history.

### Messages
The messaging interface — conversations list, message composition, delivery status, file attachments, and full-text search across all messages.

### Identity
Manage your Reticulum identities — create new ones, import/export, switch active identity, and set display names.

### Network
Network monitoring and interface management — connections table with sorting and filtering, interface stats, throughput sparklines, topology visualization, and controls for adding/removing interfaces.

### Graph
Interactive force-directed network graph showing your hub, contacts, transport nodes, and discovered peers. Color-coded nodes, zoom/pan/drag, search and filter. See [Graph Visualization](../using-ratspeak/graph-visualization) for full details.

### Games
Interactive applications over the mesh — challenge contacts to chess, track game sessions, and view move history. Built on the RLAP protocol. See [Games & Apps](../using-ratspeak/games-and-apps) for details.

### Settings
Configuration panel — ratspeak.conf settings, propagation node controls, path table management, and system information.

## Real-Time Updates

The dashboard uses Socket.IO for real-time communication. All data updates — new messages, interface status changes, announce arrivals, alert notifications, game moves — are pushed instantly to your browser without polling or page refreshes.

The stats polling loop runs every **1.5 seconds** (configurable), keeping interface throughput, path tables, and connection status continuously updated.

## Alerts

When interfaces go up or down, Ratspeak generates alerts:

- **Critical** (red) — an interface has gone down
- **Info** (blue) — an interface has come up or an auto-removal occurred

Alerts appear in the header and can be dismissed individually. Duplicate alerts within a 30-second window are suppressed.

## What's Next

- [Messaging](../using-ratspeak/messaging) — send and receive encrypted messages
- [Graph Visualization](../using-ratspeak/graph-visualization) — interactive network graph
- [Games & Apps](../using-ratspeak/games-and-apps) — play games over the mesh
- [Network Monitoring](../using-ratspeak/network-monitoring) — monitor your mesh
- [Configuration](../using-ratspeak/configuration) — customize Ratspeak settings
