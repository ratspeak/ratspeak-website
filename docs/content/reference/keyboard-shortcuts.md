# Keyboard Shortcuts

Keyboard shortcuts for Ratspeak's web dashboard, RatDeck, and RatCom devices.

## Web Dashboard

### Messaging

| Shortcut | Action |
|----------|--------|
| **Enter** | Send message |
| **Shift+Enter** | Insert new line |

### Navigation

| Shortcut | Action |
|----------|--------|
| **Escape** | Close active modal or dropdown |

### Modals & Dialogs

| Shortcut | Action |
|----------|--------|
| **Escape** | Close modal / dismiss dialog |
| **Enter** | Confirm action in dialog |
| **Tab** | Cycle through focusable elements (trapped within modal) |

### Emoji Picker

| Shortcut | Action |
|----------|--------|
| **Arrow keys** | Navigate emoji grid |
| **Enter** | Select emoji |
| **Escape** | Close picker |
| **Type** | Filter emojis by name |

### Hash Dropdown

| Shortcut | Action |
|----------|--------|
| **Escape** | Dismiss hash-copy dropdown |

---

## RatCom (M5Stack Cardputer)

RatCom uses **Ctrl+key** hotkeys for navigation. Hotkeys work regardless of input mode.

| Shortcut | Action |
|----------|--------|
| **Ctrl+H** | Toggle help overlay |
| **Ctrl+M** | Jump to Messages view |
| **Ctrl+N** | Create new message |
| **Ctrl+S** | Jump to Settings view |
| **Ctrl+A** | Force announce (broadcast presence) |
| **Ctrl+D** | Open diagnostics view |

### General Navigation

| Key | Action |
|-----|--------|
| **,** / **/** | Cycle tabs (next/previous) |
| **;** / **.** | Navigate lists (up/down) |
| **Enter** | Select / confirm |
| **Esc** | Back / close overlay |

---

## RatDeck (LilyGo T-Deck Plus)

RatDeck has a physical QWERTY keyboard plus touchscreen. Navigation combines keyboard shortcuts with touch gestures.

### Keyboard

| Key | Action |
|-----|--------|
| **Enter** | Send message / confirm |
| **Esc** | Back / close |
| **Tab** | Switch between panels |

### Touchscreen

| Gesture | Action |
|---------|--------|
| **Tap** | Select item |
| **Swipe left/right** | Switch tabs |
| **Long press** | Context menu |

---

## CLI Tools (rnsd, rnstatus, etc.)

Reticulum CLI tools use standard terminal conventions:

| Shortcut | Action |
|----------|--------|
| **Ctrl+C** | Stop / interrupt |
| **Ctrl+D** | Exit (EOF) |

### rnsd Flags

| Flag | Description |
|------|-------------|
| `-c PATH` | Config directory |
| `-v` / `-vv` | Verbose / very verbose output |
| `-q` | Quiet mode |
| `--service` | Run as system service |
| `--exampleconfig` | Print example config and exit |
| `--version` | Show version |

### rnstatus Flags

| Flag | Description |
|------|-------------|
| `-p` | Show path table |
| `-a` | Show announce table |
| `-j` | JSON output |

## What's Next

- [Dashboard Overview](../using-ratspeak/dashboard-overview) — navigating the web UI
- [RatDeck](../hardware/ratdeck) — T-Deck Plus hardware guide
- [RatCom](../hardware/ratcom) — Cardputer hardware guide
