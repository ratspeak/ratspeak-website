# First Run

The first time you launch Ratspeak, it creates your cryptographic identity and sets up your local environment. Here's what to expect.

## The Setup Wizard

On first launch, Ratspeak runs through initial setup:

1. Creates your data directory at `.ratspeak/`
2. Generates a new Reticulum identity -- your cryptographic key pair
3. Sets up the local database for messages, contacts, and settings
4. Starts the LXMF message router

This takes a few seconds. You do not need to provide any input during this step -- Ratspeak handles everything automatically.

<div class="screenshot-placeholder" data-caption="Ratspeak setup wizard showing identity creation progress with animated key generation">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#7e8fa2" stroke-width="1.5" stroke-linecap="round"><path d="M12 2a10 10 0 110 20 10 10 0 010-20z"/><path d="M12 6v6l4 2"/></svg>
    <div>Setup wizard -- screenshot coming soon</div>
</div>

## Your Identity

Your Reticulum identity is a pair of cryptographic keys:

- **Signing key** (Ed25519) -- proves you are who you say you are
- **Encryption key** (X25519) -- lets others send you encrypted messages

Think of it like a wax seal and a lockbox: the signing key is your personal seal that no one can forge, and the encryption key is a lockbox that only you can open. Together, they let you prove your identity and receive private messages without relying on any central authority.

From these keys, Ratspeak derives your **destination hash** -- your address on the network:

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
<figcaption>Identity derivation: keypair to destination hashes</figcaption>
</div>

The diagram above shows how your keypair flows through a one-way hash function to produce two addresses:

- **Identity hash** -- your node's identity on the Reticulum network
- **LXMF address** -- your messaging address, the one you share with contacts

These hashes are deterministic. The same keypair always produces the same addresses, which means your identity is fully portable. Copy your key file to another machine and you bring your address with you.

Your LXMF address is what you give to other people so they can reach you. It looks like this: `<13425ec15b621c1d928589718000d814>`.

## Setting Your Display Name

After identity creation, you are prompted to set a display name. This is the human-readable name that appears when you announce your presence on the network. Other users see it in their contact lists when they discover you.

Pick something recognizable. You can change it later in **Settings**.

> **Note**: Display names are convenience labels, not unique identifiers. Your destination hash is your true address. Two people can have the same display name -- the hash distinguishes them.

## Your Files

After first run, Ratspeak creates the following directory structure:

```
.ratspeak/
  ratspeak.db              # Database (messages, contacts, settings)
  secret_key               # Session key
  identities/
    <hash>/                # Your identity directory
      identity             # Your key file (64 bytes -- back this up!)
      lxmf/                # Message storage
```

The `identity` file is 64 bytes containing your raw Ed25519 and X25519 private keys. This file is your identity on the network. Everything else -- your messages, contacts, settings -- can be rebuilt or recovered. The identity file cannot.

> **Warning**: Your identity file IS your identity. If you lose it, that address is gone forever. Back it up to a secure location. Never share it -- anyone with this file can impersonate you on the network and read messages intended for you.

## What You'll See

After setup completes, the dashboard loads in your browser. The sidebar shows seven views:

- **Dashboard** -- your node status and interface health
- **Messages** -- send and receive encrypted messages
- **Identity** -- view and manage your cryptographic identity
- **Network** -- see connected interfaces and peers
- **Graph** -- visualize the network topology
- **Games** -- peer-to-peer games over the mesh
- **Settings** -- configure your node and display name

The **Dashboard** view is selected by default. From here you can verify that your node is running and check the status of your network interfaces before making your first connection.

## What's Next

- [Your First Connection](../getting-started/your-first-connection) -- connect to the mesh
- [Sending Your First Message](../getting-started/sending-your-first-message) -- send an encrypted message
- [Identity Management](../using-ratspeak/identity-management) -- create and manage multiple identities
