# Database Schema

Ratspeak's SQLite database — schema version 12, table definitions, indexes, full-text search, and migration strategy.

## Overview

Both Ratspeak-py and Ratspeak-rs use the same SQLite schema (version 12). The database file is stored at `~/.ratspeak/ratspeak.db`.

**Key design decisions:**
- **WAL mode** (`PRAGMA journal_mode=WAL`) for concurrent reads
- **Identity scoping** — all content tables include `identity_id` for multi-identity isolation
- **FTS5 full-text search** on messages with auto-sync triggers
- **Automatic migrations** — schema upgrades run incrementally on startup

## Tables

### schema_version

Tracks the current schema version for migration management.

```sql
CREATE TABLE schema_version (
    version INTEGER NOT NULL
);
```

### identities

Multi-identity support. Each identity has its own RNS keypair and LXMF destination.

```sql
CREATE TABLE identities (
    hash TEXT PRIMARY KEY,
    lxmf_hash TEXT,
    nickname TEXT DEFAULT '',
    display_name TEXT DEFAULT '',
    created_at REAL NOT NULL,
    last_used REAL,
    is_active INTEGER DEFAULT 0,
    propagation_node TEXT DEFAULT '',
    propagation_enabled INTEGER DEFAULT 0
);
```

| Column | Type | Description |
|--------|------|-------------|
| `hash` | TEXT | RNS identity hash (hex), primary key |
| `lxmf_hash` | TEXT | LXMF destination hash (hex) |
| `nickname` | TEXT | Local-only friendly name |
| `display_name` | TEXT | LXMF announce display name (visible to network) |
| `created_at` | REAL | Unix timestamp |
| `last_used` | REAL | Last identity switch timestamp |
| `is_active` | INTEGER | Boolean (0/1) — only one identity active at a time |
| `propagation_node` | TEXT | Configured propagation node hash |
| `propagation_enabled` | INTEGER | Boolean — propagation support on/off |

### contacts

Address book, scoped per identity.

```sql
CREATE TABLE contacts (
    dest_hash TEXT NOT NULL,
    identity_id TEXT DEFAULT '',
    display_name TEXT,
    identity_pubkey TEXT,
    first_seen REAL,
    last_seen REAL,
    trust TEXT DEFAULT 'pending',
    notes TEXT DEFAULT '',
    UNIQUE(dest_hash, identity_id)
);
```

| Column | Type | Description |
|--------|------|-------------|
| `dest_hash` | TEXT | Contact's LXMF destination hash |
| `identity_id` | TEXT | Owning identity (for multi-identity isolation) |
| `display_name` | TEXT | Contact's display name (from announce or manual) |
| `identity_pubkey` | TEXT | Contact's public key (base64, learned from announce) |
| `first_seen` | REAL | First announce timestamp |
| `last_seen` | REAL | Most recent announce timestamp |
| `trust` | TEXT | `"trusted"`, `"pending"`, or `"rejected"` |
| `notes` | TEXT | User-added notes |

### messages

All LXMF messages (inbound and outbound), scoped per identity.

```sql
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    destination TEXT NOT NULL,
    content TEXT DEFAULT '',
    title TEXT DEFAULT '',
    timestamp REAL NOT NULL,
    state TEXT DEFAULT 'unknown',
    direction TEXT DEFAULT 'outbound',
    rtt_ms REAL,
    hops INTEGER,
    path TEXT,
    identity_id TEXT DEFAULT '',
    attachment_name TEXT DEFAULT '',
    attachment_stored_name TEXT DEFAULT '',
    image_name TEXT DEFAULT '',
    image_stored_name TEXT DEFAULT '',
    reply_to_id TEXT DEFAULT '',
    reply_to_preview TEXT DEFAULT '',
    game_id TEXT DEFAULT '',
    game_action TEXT DEFAULT '',
    game_move_san TEXT DEFAULT ''
);
```

**Indexes:**
```sql
CREATE INDEX idx_messages_dest ON messages(destination);
CREATE INDEX idx_messages_source ON messages(source);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);
CREATE INDEX idx_messages_identity ON messages(identity_id);
```

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | UUID primary key |
| `source` | TEXT | Sender's destination hash |
| `destination` | TEXT | Recipient's destination hash |
| `content` | TEXT | Message body |
| `title` | TEXT | Message title (optional) |
| `timestamp` | REAL | Unix timestamp |
| `state` | TEXT | `"pending"`, `"sent"`, `"delivered"`, `"failed"` |
| `direction` | TEXT | `"inbound"` or `"outbound"` |
| `rtt_ms` | REAL | Round-trip time in milliseconds (if delivered) |
| `hops` | INTEGER | Hop count from sender |
| `path` | TEXT | Path list (JSON) |
| `identity_id` | TEXT | Owning identity |
| `attachment_name` | TEXT | Original filename of attachment |
| `attachment_stored_name` | TEXT | Local stored filename |
| `image_name` | TEXT | Original image filename |
| `image_stored_name` | TEXT | Local stored image filename |
| `reply_to_id` | TEXT | UUID of message being replied to |
| `reply_to_preview` | TEXT | Preview text of original message |
| `game_id` | TEXT | LRGP session UUID (if game message) |
| `game_action` | TEXT | LRGP action type |
| `game_move_san` | TEXT | Human-readable move notation (if applicable) |

### messages_fts

Full-text search index (FTS5 virtual table) on message content and title.

```sql
CREATE VIRTUAL TABLE messages_fts USING fts5(
    content, title, id UNINDEXED, identity_id UNINDEXED,
    content='messages', content_rowid='rowid'
);
```

**Auto-sync triggers** keep the FTS index in sync with the messages table:

```sql
-- Insert trigger
CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts(rowid, content, title, id, identity_id)
    VALUES (new.rowid, new.content, new.title, new.id, new.identity_id);
END;

-- Delete trigger
CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, content, title, id, identity_id)
    VALUES ('delete', old.rowid, old.content, old.title, old.id, old.identity_id);
END;

-- Update trigger
CREATE TRIGGER messages_au AFTER UPDATE OF content, title ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, content, title, id, identity_id)
    VALUES ('delete', old.rowid, old.content, old.title, old.id, old.identity_id);
    INSERT INTO messages_fts(rowid, content, title, id, identity_id)
    VALUES (new.rowid, new.content, new.title, new.id, new.identity_id);
END;
```

### reactions

Emoji reactions on messages, scoped per identity.

```sql
CREATE TABLE reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT NOT NULL,
    sender TEXT NOT NULL,
    emoji TEXT NOT NULL,
    timestamp REAL NOT NULL,
    identity_id TEXT DEFAULT '',
    UNIQUE(message_id, sender, emoji, identity_id)
);

CREATE INDEX idx_reactions_msg ON reactions(message_id);
```

### hidden_conversations

Conversations hidden by the user (per identity).

```sql
CREATE TABLE hidden_conversations (
    dest_hash TEXT NOT NULL,
    identity_id TEXT NOT NULL DEFAULT '',
    hidden_at REAL,
    PRIMARY KEY (dest_hash, identity_id)
);
```

### settings

Global key-value settings store.

```sql
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT
);
```

### connection_history

TCP connection history for quick reconnection.

```sql
CREATE TABLE connection_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    host TEXT NOT NULL,
    port INTEGER NOT NULL,
    name TEXT DEFAULT '',
    last_used REAL NOT NULL,
    times_used INTEGER DEFAULT 1,
    UNIQUE(host, port)
);
```

### games

Game session tracking (legacy table, being replaced by app_sessions).

```sql
CREATE TABLE games (
    game_id TEXT NOT NULL,
    game TEXT NOT NULL,
    contact_hash TEXT NOT NULL,
    identity_id TEXT DEFAULT '',
    challenger TEXT NOT NULL,
    state TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    winner TEXT DEFAULT '',
    turn TEXT DEFAULT '',
    first_turn TEXT DEFAULT '',
    move_count INTEGER DEFAULT 0,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL,
    PRIMARY KEY (game_id, identity_id)
);

CREATE INDEX idx_games_contact ON games(contact_hash, identity_id);
CREATE INDEX idx_games_status ON games(status);
```

### app_sessions

LRGP game session tracking (replaces games table for new sessions).

```sql
CREATE TABLE app_sessions (
    session_id TEXT NOT NULL,
    identity_id TEXT NOT NULL DEFAULT '',
    app_id TEXT NOT NULL,
    app_version INTEGER NOT NULL DEFAULT 1,
    contact_hash TEXT NOT NULL,
    initiator TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    metadata TEXT NOT NULL DEFAULT '{}',
    unread INTEGER NOT NULL DEFAULT 0,
    created_at REAL NOT NULL DEFAULT 0,
    updated_at REAL NOT NULL DEFAULT 0,
    last_action_at REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id, identity_id)
);

CREATE INDEX idx_app_sessions_contact ON app_sessions(contact_hash, identity_id);
CREATE INDEX idx_app_sessions_status ON app_sessions(status);
CREATE INDEX idx_app_sessions_app ON app_sessions(app_id);
```

### app_actions

LRGP action history for each session.

```sql
CREATE TABLE app_actions (
    session_id TEXT NOT NULL,
    identity_id TEXT NOT NULL DEFAULT '',
    action_num INTEGER NOT NULL,
    command TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    sender TEXT NOT NULL,
    timestamp REAL NOT NULL DEFAULT 0,
    UNIQUE (session_id, identity_id, action_num)
);
```

## Migration Strategy

Schema migrations run automatically on startup:

1. Read current version from `schema_version` table
2. Run all migrations from current version to `SCHEMA_VERSION` (12)
3. Each migration adds columns, creates tables, or backfills data
4. Migrations are **non-destructive** — existing data is preserved
5. Update `schema_version` after all migrations complete

## Database Pragmas

```sql
PRAGMA journal_mode = WAL;       -- Write-Ahead Logging for concurrency
PRAGMA foreign_keys = ON;        -- Enforce referential integrity
PRAGMA busy_timeout = 30000;     -- Wait up to 30s on lock contention
```

Python uses `isolation_level=None` (autocommit). Rust uses r2d2 connection pool (max 8 connections).

## What's Next

- [Architecture Overview](../developer/architecture-overview) — system design
- [REST API Reference](../developer/rest-api) — endpoints that query this schema
- [Ratspeak-py Backend](../developer/ratspeak-py) — Python database module
