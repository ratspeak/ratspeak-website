# Installing Ratspeak (Rust)

Get Ratspeak-rs running on your system. Faster, more secure, and the primary implementation going forward.

## Prerequisites

You have two options for installing Ratspeak-rs:

- **Pre-built binary** — no Rust toolchain needed. Download the binary for your platform and run it.
- **Build from source** — requires the Rust toolchain (version 1.85 or newer).

Pick whichever suits you. The result is the same either way.

## Option 1: Pre-built Binary

This is the fastest path. Download the release archive for your operating system and architecture, extract it, and you are ready to go.

```bash
# Download the latest release
# Available for Linux (x86_64, aarch64), macOS (x86_64, aarch64), Windows
curl -LO https://github.com/ratspeak/ratspeak/releases/latest/download/ratspeak-rs-$(uname -s)-$(uname -m).tar.gz

# Extract the archive
tar xzf ratspeak-rs-*.tar.gz

# Enter the directory
cd ratspeak-rs
```

> **Note**: Pre-built binaries may not be available for all platforms yet. If your platform is not listed on the releases page, use Option 2 to build from source.

After extracting, skip ahead to **Starting Ratspeak-rs** below.

## Option 2: Build from Source

Building from source gives you the latest code and works on any platform that Rust supports.

### Install the Rust Toolchain

If you do not already have Rust installed, run the official installer:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Follow the prompts and accept the defaults. When it finishes, restart your terminal or run `source $HOME/.cargo/env` so the `cargo` command is available.

Verify the installation:

```bash
rustc --version
```

You need version 1.85 or newer. If your version is older, update with `rustup update`.

### Clone and Build

```bash
git clone https://github.com/ratspeak/rustrat.git
cd rustrat
cargo build --release
```

The build takes a few minutes depending on your hardware. When it finishes, the compiled binaries are in `target/release/`.

### What Gets Built

The build produces several executables:

- `rnsd` — Reticulum network daemon
- `rnstatus` — query network status
- `rnpath` — look up paths to destinations
- `rnid` — manage identities
- `lxmd` — LXMF messaging daemon

You do not need to run these individually. The startup script handles launching and coordinating them.

## Starting Ratspeak-rs

From the Ratspeak-rs directory, run:

```bash
./start.sh
```

This launches the network daemon, bridge agent, and dashboard server -- the same components as Ratspeak-py, built in Rust. Open **http://localhost:5050** in your browser to reach the dashboard.

## Stopping Ratspeak-rs

To shut everything down cleanly:

```bash
./stop.sh
```

This stops all Ratspeak-rs processes. Your data and identity are preserved for the next launch.

## Key Differences from Ratspeak-py

If you are coming from the Python implementation, here is what changed under the hood:

| Aspect | Ratspeak-py | Ratspeak-rs |
|--------|-------------|-------------|
| Network stack | Python RNS library | Native Rust (actor-based) |
| Concurrency | Threaded (with locks) | Actor model (lock-free) |
| Security | Python crypto bindings | Pure Rust crypto (audited crates) |
| Performance | Good | Better -- lower latency, less memory |
| Same UI | Yes | Yes |
| Interoperable | Yes | Yes -- same Reticulum protocol |

Both implementations produce the same user experience and communicate on the same network. You can run Ratspeak-py on one machine and Ratspeak-rs on another, and they will talk to each other without any extra configuration.

Your existing identity files and database are compatible. If you are migrating from Ratspeak-py, copy your `.ratspeak/` directory to the new installation and Ratspeak-rs will pick it up.

## Troubleshooting

**Rust version too old?**
Run `rustup update` to get the latest stable release. Ratspeak-rs requires Rust 1.85 or newer.

**Build fails with serial port errors?**
On Linux, install the system dependency for serial port support:

```bash
# Debian/Ubuntu
sudo apt install libudev-dev

# Fedora
sudo dnf install systemd-devel
```

Then run `cargo build --release` again.

**Dashboard does not start?**
Check that no other process is using port 5050. You can verify with:

```bash
lsof -i :5050
```

If another process holds the port, stop it first or change the Ratspeak port in your configuration.

**Permission denied on `start.sh`?**
Make the script executable:

```bash
chmod +x start.sh stop.sh
```

> **Tip**: If you hit a problem not covered here, open an issue at [github.com/ratspeak/rustrat](https://github.com/ratspeak/rustrat) with the full error output.

## What's Next

- [First Run](../getting-started/first-run) -- complete the setup wizard
- [Your First Connection](../getting-started/your-first-connection) -- connect to the network
- [Platform Notes](../getting-started/platform-notes) -- OS-specific instructions
