# Frontend Architecture

Ratspeak's browser-side code — a vanilla JavaScript application using Socket.IO for real-time updates, D3.js for network visualization, and LRGP for multiplayer games.

## Technology Stack

| Library | Version | Purpose |
|---------|---------|---------|
| Socket.IO | 4.7.4 | Real-time WebSocket communication |
| D3.js | 7 | Force-directed network graph |
| — | — | Game logic handled by LRGP game engines |
| jdenticon | 3.3.0 | Deterministic avatar generation from identity hashes |

No framework (React, Vue, Angular). The frontend uses a **module pattern** with vanilla JavaScript and DOM manipulation.

## File Structure

```
dashboard/static/
├── vendor/
│   ├── socket.io-4.7.4.min.js
│   ├── d3.v7.min.js
│   └── jdenticon-3.3.0.min.js
└── js/
    ├── state.js                # Global state, Socket.IO init, API auth
    ├── socketio_handlers.js    # Real-time event handlers
    ├── nav.js                  # View switching, navigation UI
    ├── lxmf.js                 # Messaging UI, conversations, contacts
    ├── identity.js             # Identity management, profile
    ├── games.js                # Game modal, LRGP UI, challenges
    ├── game_engines.js         # Game engine implementations
    ├── games_tab.js            # Games tab view controller
    ├── graph.js                # D3.js network graph (canvas)
    ├── topology.js             # Topology display, node status
    ├── health.js               # Health metrics, interface cards
    ├── events.js               # Event log, filtering, timestamps
    ├── settings.js             # Settings UI, interface management
    ├── propagation.js          # Propagation node UI
    ├── setup.js                # First-run setup flow
    ├── modals.js               # Modal system, focus trapping
    ├── dialogs.js              # Confirmation dialogs
    ├── toasts.js               # Toast notifications
    ├── emoji_picker.js         # Emoji picker with keyboard nav
    ├── emoji_data.js           # Emoji dataset
    └── vendor/
        └── chess.min.js
```

## Architecture Pattern

The frontend follows an **event-driven module pattern**:

1. **Module isolation** — Each feature (messaging, games, graph) is self-contained
2. **Global state** — Shared via `state.js` (Socket.IO socket, API token, helpers)
3. **Event-driven updates** — Socket.IO events trigger UI re-renders
4. **No virtual DOM** — Direct DOM manipulation for performance
5. **Debounced rendering** — Expensive operations (graph, tables) are throttled

### Data Flow

```
Server (Socket.IO event)
    ↓
socketio_handlers.js (dispatch)
    ↓
Feature module (lxmf.js, games.js, etc.)
    ↓
DOM update (render function)
```

User actions follow the reverse path:

```
User click / keyboard event
    ↓
Feature module (event handler)
    ↓
Socket.IO emit or REST API call
    ↓
Server processes, emits update
    ↓
All connected browsers receive update
```

## Core Modules

### state.js — Global State

Central state management and utilities:

- **Socket.IO initialization** with authentication (Bearer token from localStorage)
- **API helpers** for REST calls with auth headers
- **Formatting functions**: `prettySize()`, `prettySpeed()`, `prettyTime()`
- **Hash-copy dropdown** — Click any destination hash to copy, add contact, or open message
- **Debounce helper** for throttled renders

### socketio_handlers.js — Event Dispatch

Connects to all Socket.IO events and dispatches to feature modules:

- **Connection status** — Visual indicator (green/orange/red dot)
- **`stats_update`** — Topology, path tables, agent status, contact reachability
- **`topology_updated`** — Triggers network graph re-render
- **`game_update`** — Game state changes and move notifications
- **`event`** — Activity log stream (throttled to prevent spam)
- **`node_operation_status`** — Progress tracking for interface operations

### lxmf.js — Messaging

The messaging interface:

- **Conversation list** with unread badges, sorted by recency
- **Ghost row system** — Temporary placeholder for unsent conversations
- **Message composition** with reply targets
- **Emoji reactions** — Inline reaction display and tracking
- **Contact list** with trust levels and last-seen status
- **Message deduplication** — Prevents duplicate display from multiple Socket.IO events

### games.js — Games & LRGP

Interactive application UI:

- **Game board rendering** — Canvas-based Tic-Tac-Toe grid
- **Move validation** — Client-side legal move enforcement
- **Challenge flow** — Challenge → Accept/Decline → Play → End
- **Game bar** — Persistent indicator when a game is active
- **Move history** — Reconstructed from conversation messages

### graph.js — Network Visualization

D3.js force-directed graph on HTML5 Canvas:

- **Force simulation** — Hub repulsion, collision avoidance, link distance
- **Canvas rendering** — Better performance than SVG for large graphs
- **Zoom/pan** — Mouse wheel zoom, click-drag pan
- **Node filtering** — Toggle visibility by type (hub, contact, transport, discovered)
- **Search** — Find nodes by hash or display name
- **Quadtree** — Spatial indexing for efficient hover detection
- **Tooltips** — Node details on hover

### events.js — Event Log

Activity stream with category filtering:

- **Categories**: All, Alert, Message, System
- **Relative timestamps** — "2 minutes ago" with full-date tooltips
- **Status counters** — Online/stale/offline node indicators
- **Throttled entries** — One status update per 280 seconds to prevent log spam

## UI Components

### Modal System (modals.js)

- **Focus trapping** — Tab key cycles within modal, preventing background interaction
- **Escape to close** — Keyboard shortcut for all modals
- **Backdrop click** — Click outside modal to close
- **Stacking** — Multiple modals can stack (e.g., emoji picker inside message modal)

### Toast Notifications (toasts.js)

- **Auto-dismiss** — Timed notifications (default 3 seconds)
- **Color coding** — Green (success), red (error), orange (warning), blue (info)
- **Stacking** — Multiple toasts stack vertically

### Emoji Picker (emoji_picker.js)

- **Full dataset** — Complete emoji set organized by category
- **Keyboard navigation** — Arrow keys to browse, Enter to select
- **Search** — Type to filter emojis by name

## Authentication

The frontend supports optional Bearer token authentication:

1. On first load, checks if API requires authentication
2. If token configured, prompts user for token
3. Stores token in `localStorage`
4. Includes token in all REST API calls (`Authorization: Bearer {token}`) and Socket.IO auth

## Keyboard Shortcuts

| Key | Context | Action |
|-----|---------|--------|
| Enter | Message input | Send message |
| Shift+Enter | Message input | New line |
| Escape | Any modal | Close modal |
| Escape | Emoji picker | Close picker |
| Escape | Hash dropdown | Dismiss dropdown |
| Enter | Confirmation dialog | Confirm action |

## Static Asset Serving

- **Python**: Flask serves from `dashboard/static/` directory
- **Rust**: `rust-embed` compiles all assets into the binary at build time — no external files needed

The HTML template (`index.html`) is a single-page application shell. All views are rendered client-side by showing/hiding DOM sections via `nav.js`.

## What's Next

- [REST API Reference](../developer/rest-api) — endpoints the frontend calls
- [Socket.IO Events](../developer/socketio-events) — real-time events the frontend listens to
- [LRGP Protocol & Building Games](../developer/lrgp-protocol) — game protocol
