# Choosing Your Setup

Ratspeak comes in two flavors and runs two ways. This page helps you pick the right combination.

**Which setup is right for you?**

- **Just want to try it out?** Install the Python version (`pip install ratspeak`) — it's the fastest way to get started on any platform
- **Want the best performance?** Install ratspeak-rs (the Rust implementation) — native binary, lower resource usage, same features
- **Want a portable mesh device?** Get a RatDeck (T-Deck Plus) or RatCom (M5Stack Cardputer) for standalone LoRa messaging without a computer
- **Want to extend your network's range?** Set up a Transport Node on a Raspberry Pi or Heltec V3 to relay traffic between distant nodes
- **Want both?** You can run the desktop app AND carry a hardware device — they communicate over the same mesh

## Two Implementations

Ratspeak has two independent implementations. They share the same protocol and can talk to each other, but they are built with different tools and have different trade-offs.

| | Ratspeak-py | Ratspeak-rs |
|---|---|---|
| **Language** | Python | Rust |
| **Maturity** | Original, battle-tested | Complete, native performance |
| **Install** | `pip install` + clone repo | `cargo install` or download binary |
| **Prerequisites** | Python 3.11+, pip | Rust toolchain or none (pre-built binary) |
| **Best for** | Getting started, broad OS support | Performance, security, long-term use |

Ratspeak-py came first. It has the widest install base and the most community-tested configurations. Ratspeak-rs starts faster, uses less memory, and produces a single static binary you can drop onto any machine. Both implementations are complete and fully featured.

> **Tip**: If you're unsure, start with Ratspeak-py. It's the fastest path to a working setup.

## Two Modes

You can run either implementation in two ways:

- **Browser mode** — Ratspeak runs as a local web server. Open your browser to `http://localhost:5050` and use it. No app install needed.
- **Desktop app** — A native application (Tauri) that bundles the browser and backend together. Available for macOS, Linux, and Windows.

Both modes give you the exact same interface and features. Browser mode is simpler to set up. Desktop mode is more self-contained.

## Which Setup Should You Choose?

Use these questions to narrow it down.

**Just want to try it out?**
Ratspeak-py in browser mode. Clone, install, start. See [Installing Ratspeak (Python)](../getting-started/installing-python).

**Want the best performance and security?**
Ratspeak-rs. It compiles to native code and handles cryptographic operations faster. See [Installing Ratspeak (Rust)](../getting-started/installing-rust).

**Running on a Raspberry Pi or server?**
Either implementation works. Ratspeak-py is easier to install on a Pi because Python is already there. See [Platform Notes](../getting-started/platform-notes) for hardware-specific guidance.

**Want a native desktop app?**
Download the Tauri desktop build. Desktop builds are available for both Ratspeak-py and Ratspeak-rs. Check the releases page for your platform.

## Requirements

These are the minimum requirements for either implementation.

| Requirement | Detail |
|---|---|
| **Operating system** | macOS, Linux, or Windows (WSL for py) |
| **RAM** | 256 MB minimum |
| **Disk** | ~100 MB for software + database |
| **Network** | Optional — Ratspeak can run fully offline with local interfaces |

You do not need a public IP address, a domain name, or a cloud account. Ratspeak is designed to work on private, local, and mesh networks. An internet connection is not required unless you want to reach peers over the internet.

## What's Next

- [Installing Ratspeak (Python)](../getting-started/installing-python) — get started with the Python version
- [Installing Ratspeak (Rust)](../getting-started/installing-rust) — get started with the Rust version
- [Platform Notes](../getting-started/platform-notes) — OS-specific details
