# First Run

The first time you launch Ratspeak, it creates your cryptographic identity and sets up your local environment. Here's what to expect.

## The Setup Wizard

On first launch, Ratspeak runs through initial setup:

1. Creates your data directory at `.ratspeak/`
2. Generates a new Reticulum identity -- your cryptographic key pair
3. Sets up the local database for messages, contacts, and settings
4. Starts the LXMF message router

This takes a few seconds. You do not need to provide any input during this step -- Ratspeak handles everything automatically.

## Your Identity

Your Reticulum identity is a pair of cryptographic keys:

- **Signing key** (Ed25519) -- proves you are who you say you are
- **Encryption key** (X25519) -- lets others send you encrypted messages

Think of it like a wax seal and a lockbox: the signing key is your personal seal that no one can forge, and the encryption key is a lockbox that only you can open. Together, they let you prove your identity and receive private messages without relying on any central authority.

From these keys, Ratspeak derives your **destination hash** -- your address on the network:

When Ratspeak starts for the first time, it generates your identity through this process:

1. A random 256-bit seed is generated using the OS cryptographic random number generator
2. The seed derives an **X25519** private key (for encryption) and an **Ed25519** private key (for signing)
3. The corresponding public keys are computed from the private keys
4. Your **address** (a truncated hash of your public keys) is derived — this is how other nodes identify you
5. The private keys are saved to your identity file; the public keys are announced to the network

Your keypair produces two addresses:

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
