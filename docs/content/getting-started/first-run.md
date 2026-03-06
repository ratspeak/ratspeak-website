# First Run

The first time you launch Ratspeak, it generates a unique cryptographic identity for you and sets up everything needed to join the mesh. Here's what happens and what to look for.

## The Setup Wizard

On first launch, Ratspeak runs through initial setup:

1. Creates your data directory at `.ratspeak/`
2. Generates a new Reticulum identity
3. Sets up the SQLite database with FTS5 search
4. Creates the LXMF message router

<div class="screenshot-placeholder">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#7e8fa2" stroke-width="1.5" stroke-linecap="round"><path d="M12 2a10 10 0 110 20 10 10 0 010-20z"/><path d="M12 6v6l4 2"/></svg>
    <div>Setup wizard — screenshot placeholder</div>
</div>

## Identity Creation

Your Reticulum identity is a **512-bit Curve25519 keyset**:

- **Ed25519 signing key** (256 bits) — proves you are who you say
- **X25519 encryption key** (256 bits) — enables encrypted communication

From this keypair, two hashes are derived:

<div class="docs-diagram">
<svg viewBox="0 0 660 180" xmlns="http://www.w3.org/2000/svg" fill="none">
  <!-- Seed/Keypair -->
  <rect x="20" y="30" width="120" height="50" rx="8" stroke="#C084FC" stroke-width="1.5" fill="rgba(192,132,252,0.08)"/>
  <text x="80" y="52" text-anchor="middle" fill="#C084FC" font-family="JetBrains Mono" font-size="11" font-weight="600">Keypair</text>
  <text x="80" y="68" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">512-bit Curve25519</text>

  <!-- Arrow -->
  <line x1="140" y1="45" x2="170" y2="45" stroke="#3a4759" stroke-width="1.5"/>
  <polygon points="170,41 178,45 170,49" fill="#3a4759"/>

  <!-- Ed25519 -->
  <rect x="180" y="15" width="110" height="30" rx="6" stroke="#38BDF8" stroke-width="1" fill="rgba(56,189,248,0.06)"/>
  <text x="235" y="35" text-anchor="middle" fill="#38BDF8" font-family="JetBrains Mono" font-size="10">Ed25519</text>

  <!-- X25519 -->
  <rect x="180" y="55" width="110" height="30" rx="6" stroke="#F59E0B" stroke-width="1" fill="rgba(245,158,11,0.06)"/>
  <text x="235" y="75" text-anchor="middle" fill="#F59E0B" font-family="JetBrains Mono" font-size="10">X25519</text>

  <!-- Arrow to SHA-256 -->
  <line x1="290" y1="45" x2="330" y2="55" stroke="#3a4759" stroke-width="1.5"/>
  <polygon points="330,51 338,55 330,59" fill="#3a4759"/>

  <!-- SHA-256 -->
  <rect x="340" y="35" width="100" height="40" rx="8" stroke="#00D4AA" stroke-width="1.5" fill="rgba(0,212,170,0.08)"/>
  <text x="390" y="60" text-anchor="middle" fill="#00D4AA" font-family="JetBrains Mono" font-size="11" font-weight="600">SHA-256</text>

  <!-- Arrow to Identity Hash -->
  <line x1="440" y1="45" x2="480" y2="35" stroke="#3a4759" stroke-width="1.5"/>
  <polygon points="480,31 488,35 480,39" fill="#3a4759"/>

  <!-- Identity Hash -->
  <rect x="490" y="10" width="150" height="40" rx="8" stroke="#00D4AA" stroke-width="1.5" fill="rgba(0,212,170,0.10)"/>
  <text x="565" y="28" text-anchor="middle" fill="#00D4AA" font-family="JetBrains Mono" font-size="10" font-weight="600">Identity Hash</text>
  <text x="565" y="42" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">16 bytes (truncated)</text>

  <!-- Arrow to LXMF Hash -->
  <line x1="440" y1="65" x2="480" y2="75" stroke="#3a4759" stroke-width="1.5"/>
  <polygon points="480,71 488,75 480,79" fill="#3a4759"/>

  <!-- LXMF Destination Hash -->
  <rect x="490" y="60" width="150" height="40" rx="8" stroke="#C084FC" stroke-width="1.5" fill="rgba(192,132,252,0.10)"/>
  <text x="565" y="78" text-anchor="middle" fill="#C084FC" font-family="JetBrains Mono" font-size="10" font-weight="600">LXMF Address</text>
  <text x="565" y="92" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="9">hash(lxmf.delivery + key)</text>

  <!-- Caption -->
  <text x="330" y="150" text-anchor="middle" fill="#7e8fa2" font-family="Outfit" font-size="11" font-style="italic">Identity derivation: keypair to destination hashes</text>
</svg>
</div>

- **Identity hash** — your node's identity on the Reticulum network
- **LXMF destination hash** — your messaging address (what you share with contacts)

These hashes are deterministic — the same keypair always produces the same addresses, so your identity is fully portable.

## Choosing a Display Name

You'll be prompted to set a **display name** (also called an "announced name"). This is the human-readable name that appears when you announce your presence on the network. It's included in your LXMF announces, so other users see it in their contact lists.

> **Note**: Display names are not unique or authenticated — they're a convenience label. The destination hash is the true identity.

## Generated Files

After first run, your project directory contains:

```
.ratspeak/
  ratspeak.db              # SQLite database (messages, contacts, identities)
  secret_key               # Flask session secret
  identities/
    <hash>/                # Per-identity directory
      identity             # 64-byte RNS identity file (restricted permissions)
      lxmf/                # LXMF storage for this identity
```

The identity file is 64 bytes — the raw Ed25519 + X25519 private keys. This file **is your identity**. Back it up. If you lose it, you lose access to that address permanently.

> **Warning**: Never share your identity file. Anyone with this file can impersonate you on the network. Export and share only your destination hash.

## What You'll See

After first run, the dashboard sidebar shows seven tabs: **Dashboard**, **Messages**, **Identity**, **Network**, **Graph**, **Games**, and **Settings**. The Dashboard tab is selected by default, showing your node status and interface health.

## Next Steps

- [Your First Connection](../getting-started/your-first-connection) — connect to the mesh
- [Sending Your First Message](../getting-started/sending-your-first-message) — send an encrypted message
- [Identity Management](../using-ratspeak/identity-management) — managing multiple identities
