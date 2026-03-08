# Choosing Your Setup

Ratspeak comes in two flavors and runs two ways. This page helps you pick the right combination.

<div class="docs-diagram">
<svg viewBox="0 0 700 280" xmlns="http://www.w3.org/2000/svg" fill="none">
  <!-- Start node -->
  <rect x="230" y="10" width="240" height="40" rx="20" fill="rgba(126,143,162,0.10)" stroke="#7e8fa2" stroke-width="2"/>
  <text x="350" y="35" text-anchor="middle" font-family="Outfit" font-size="14" fill="#e0e6ed">What matters most to you?</text>

  <!-- Branch lines from start -->
  <line x1="290" y1="50" x2="130" y2="90" stroke="#7e8fa2" stroke-width="1.5"/>
  <line x1="350" y1="50" x2="350" y2="90" stroke="#7e8fa2" stroke-width="1.5"/>
  <line x1="410" y1="50" x2="570" y2="90" stroke="#7e8fa2" stroke-width="1.5"/>

  <!-- Branch 1: Python -->
  <rect x="30" y="90" width="200" height="36" rx="8" fill="rgba(0,212,170,0.08)" stroke="#00D4AA" stroke-width="1.5"/>
  <text x="130" y="113" text-anchor="middle" font-family="Outfit" font-size="13" fill="#00D4AA">Quick start / Extensibility</text>
  <line x1="130" y1="126" x2="130" y2="160" stroke="#00D4AA" stroke-width="1.5" stroke-dasharray="4 3"/>
  <polygon points="130,162 125,154 135,154" fill="#00D4AA"/>
  <rect x="30" y="164" width="200" height="36" rx="8" fill="rgba(0,212,170,0.10)" stroke="#00D4AA" stroke-width="2"/>
  <text x="130" y="187" text-anchor="middle" font-family="JetBrains Mono" font-size="12" fill="#00D4AA">Ratspeak-py (Python)</text>

  <!-- Branch 2: Rust -->
  <rect x="250" y="90" width="200" height="36" rx="8" fill="rgba(56,189,248,0.08)" stroke="#38BDF8" stroke-width="1.5"/>
  <text x="350" y="113" text-anchor="middle" font-family="Outfit" font-size="13" fill="#38BDF8">Speed / Single binary</text>
  <line x1="350" y1="126" x2="350" y2="160" stroke="#38BDF8" stroke-width="1.5" stroke-dasharray="4 3"/>
  <polygon points="350,162 345,154 355,154" fill="#38BDF8"/>
  <rect x="250" y="164" width="200" height="36" rx="8" fill="rgba(56,189,248,0.10)" stroke="#38BDF8" stroke-width="2"/>
  <text x="350" y="187" text-anchor="middle" font-family="JetBrains Mono" font-size="12" fill="#38BDF8">Ratspeak-rs (Rust)</text>

  <!-- Branch 3: RNode -->
  <rect x="470" y="90" width="200" height="36" rx="8" fill="rgba(245,158,11,0.08)" stroke="#F59E0B" stroke-width="1.5"/>
  <text x="570" y="113" text-anchor="middle" font-family="Outfit" font-size="13" fill="#F59E0B">Off-grid / No internet</text>
  <line x1="570" y1="126" x2="570" y2="160" stroke="#F59E0B" stroke-width="1.5" stroke-dasharray="4 3"/>
  <polygon points="570,162 565,154 575,154" fill="#F59E0B"/>
  <rect x="470" y="164" width="200" height="36" rx="8" fill="rgba(245,158,11,0.10)" stroke="#F59E0B" stroke-width="2"/>
  <text x="570" y="187" text-anchor="middle" font-family="JetBrains Mono" font-size="12" fill="#F59E0B">Add RNode hardware</text>

  <!-- Convergence lines -->
  <line x1="130" y1="200" x2="130" y2="225" stroke="#7e8fa2" stroke-width="1" stroke-dasharray="3 3"/>
  <line x1="350" y1="200" x2="350" y2="225" stroke="#7e8fa2" stroke-width="1" stroke-dasharray="3 3"/>
  <line x1="570" y1="200" x2="570" y2="225" stroke="#7e8fa2" stroke-width="1" stroke-dasharray="3 3"/>
  <line x1="130" y1="225" x2="570" y2="225" stroke="#7e8fa2" stroke-width="1" stroke-dasharray="3 3"/>
  <line x1="350" y1="225" x2="350" y2="240" stroke="#7e8fa2" stroke-width="1.5"/>
  <polygon points="350,242 345,234 355,234" fill="#7e8fa2"/>

  <!-- Convergence box -->
  <rect x="200" y="244" width="300" height="30" rx="15" fill="rgba(126,143,162,0.08)" stroke="#7e8fa2" stroke-width="1.5"/>
  <text x="350" y="264" text-anchor="middle" font-family="Outfit" font-size="13" fill="#e0e6ed">Both share the same dashboard</text>
</svg>
<figcaption>Decision flowchart — pick the implementation that fits your priorities</figcaption>
</div>

## Two Implementations

Ratspeak has two independent implementations. They share the same protocol and can talk to each other, but they are built with different tools and have different trade-offs.

| | Ratspeak-py | Ratspeak-rs |
|---|---|---|
| **Language** | Python | Rust |
| **Maturity** | Original, battle-tested | Newer, primary focus going forward |
| **Install** | `pip install` + clone repo | `cargo install` or download binary |
| **Prerequisites** | Python 3.11+, pip | Rust toolchain or none (pre-built binary) |
| **Best for** | Getting started, broad OS support | Performance, security, long-term use |

Ratspeak-py came first. It has the widest install base and the most community-tested configurations. Ratspeak-rs is where active development is headed. It starts faster, uses less memory, and produces a single static binary you can drop onto any machine.

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
