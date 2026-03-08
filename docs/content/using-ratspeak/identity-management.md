# Identity Management

Create, import, export, and switch between Reticulum identities — all without restarting.

## What Is an Identity?

A Reticulum identity is a **512-bit Curve25519 keyset**:

- **Ed25519** (256 bits) — signing and verification
- **X25519** (256 bits) — encryption and key exchange

Your identity determines your destination hash (your address on the network). Each identity gets isolated storage for messages, contacts, and LXMF data.

## Creating a New Identity

1. Navigate to the **Identity** view
2. Click **Create New Identity**
3. Optionally set a nickname and display name

Ratspeak generates a fresh keypair and derives the identity hash and LXMF destination hash. The identity file (64 bytes) is saved to `.ratspeak/identities/<hash>/identity` with restricted permissions (0600).

## Importing an Identity

You can import identities from other Reticulum applications (Sideband, NomadNet, etc.).

### From File

Import a **64-byte RNS identity file**:

1. Navigate to the **Identity** view
2. Click **Import Identity**
3. Select the identity file

### From Base64

If you have a base64-encoded identity string:

1. Navigate to the **Identity** view
2. Click **Import Identity**
3. Paste the base64 string

> **Note**: If you import an identity that was previously removed, Ratspeak will reactivate it with its existing data (reimport).

## Exporting an Identity

Export your identity for use in other Reticulum applications:

- **File export** — downloads the 64-byte identity file
- **Base64 export** — copies a base64-encoded string

> **Warning**: Your identity file contains your private keys. Anyone with this file can impersonate you. Share your destination hash, never your identity file.

<div class="screenshot-placeholder" data-caption="Identity management view showing active identity card, identity list, and import/export controls">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#7e8fa2" stroke-width="1.5" stroke-linecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    <div>Identity management view — screenshot placeholder</div>
</div>

## Switching Identities

Ratspeak supports **hot-swapping** identities without restarting the backend:

1. Navigate to the **Identity** view
2. Select the identity you want to activate
3. Click **Switch**

Behind the scenes, this:

1. Tears down the current LXMF message router
2. Updates the active identity in the database
3. Initializes a new LXMF router with the selected identity
4. Re-announces on the network with the new identity

If the switch fails, Ratspeak automatically rolls back to the previous identity.

## Per-Identity Storage

Each identity maintains isolated storage:

```
.ratspeak/identities/<hash>/
  identity       # 64-byte keypair file
  lxmf/          # LXMF storage directory
```

Messages and contacts are associated with specific identities in the database. Switching identities changes which conversations and contacts you see.

## Removing an Identity

1. Switch to a different identity first (you can't remove the active one)
2. Navigate to the **Identity** view
3. Click **Remove** on the identity you want to delete

Depending on settings, removal can cascade to delete associated contacts and messages, or preserve them.

## Display Names

Each identity has a **display name** — the human-readable name announced on the network. Other users see this name in their contact lists and conversation headers.

Updating the display name on the active identity triggers a re-announce so the change propagates across the network.

## What's Next

- [First Run](../getting-started/first-run) — initial identity setup
- [Messaging](../using-ratspeak/messaging) — communicate with your identity
- [Security Model](../understanding/security-model) — cryptographic details
