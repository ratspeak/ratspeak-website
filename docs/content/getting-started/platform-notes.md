# Platform Notes

Ratspeak runs on Linux, macOS, Windows, Raspberry Pi, and Android (via Termux). Here's what you need to know for each platform.

## Linux

### Debian / Ubuntu

Modern Debian-based systems restrict pip installs. For Ratspeak-py, always use a virtual environment:

```bash
sudo apt install python3 python3-pip python3-venv git
git clone https://github.com/ratspeak/ratspeak.git && cd ratspeak
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
./start.sh
```

For Ratspeak-rs:

```bash
# Install Rust (if building from source)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Build dependencies
sudo apt install build-essential pkg-config libssl-dev libudev-dev

git clone https://github.com/ratspeak/rustrat.git && cd rustrat
cargo build --release
./start.sh
```

### Arch Linux

```bash
# Ratspeak-py
pip install -r requirements.txt

# Ratspeak-rs
sudo pacman -S base-devel openssl
cargo build --release
```

### Fedora / RHEL

```bash
# Ratspeak-py
sudo dnf install python3 python3-pip
pip install -r requirements.txt

# Ratspeak-rs
sudo dnf groupinstall "Development Tools"
sudo dnf install openssl-devel
cargo build --release
```

## macOS

### Ratspeak-py

```bash
# Install Python if needed (via Homebrew)
brew install python@3.11

git clone https://github.com/ratspeak/ratspeak.git && cd ratspeak
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
./start.sh
```

If `rnsd` is not found after install, add the Python bin directory to your PATH:

```bash
export PATH="$HOME/Library/Python/3.x/bin:$PATH"
```

### Ratspeak-rs

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

git clone https://github.com/ratspeak/rustrat.git && cd rustrat
cargo build --release
./start.sh
```

## Windows

Ratspeak's startup scripts require a bash-compatible shell.

### Option 1: WSL (Recommended)

Install WSL (Windows Subsystem for Linux) from the Microsoft Store, then follow the Linux instructions above.

### Option 2: Git Bash

1. Install Python 3.11+ from python.org (check **Add Python to PATH** during install)
2. Install Git for Windows
3. Open Git Bash and follow the Linux instructions

> **Note**: Ratspeak-rs can be built natively on Windows with `cargo build --release` from PowerShell or cmd -- no WSL needed.

## Raspberry Pi

Raspberry Pi makes an excellent always-on Reticulum node. Use **64-bit Raspberry Pi OS** for best compatibility.

### Ratspeak-py

```bash
sudo apt install python3 python3-pip python3-venv python3-cryptography python3-pyserial
git clone https://github.com/ratspeak/ratspeak.git && cd ratspeak
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
./start.sh
```

### Ratspeak-rs

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
sudo apt install build-essential pkg-config libssl-dev libudev-dev
git clone https://github.com/ratspeak/rustrat.git && cd rustrat
cargo build --release
./start.sh
```

> **Tip**: A Pi Zero 2 W with an RNode radio makes a compact, low-power mesh gateway. See [Raspberry Pi Gateway](../deployment/raspberry-pi-gateway) for a complete setup guide.

## Android (Termux)

```bash
pkg update && pkg upgrade
pkg install python python-cryptography git
pip install rns lxmf

# Clone and run Ratspeak-py
git clone https://github.com/ratspeak/ratspeak.git && cd ratspeak
pip install -r requirements.txt
python dashboard/app.py
```

> **Note**: For a native Android experience, consider [Sideband](https://github.com/markqvist/Sideband) -- a dedicated LXMF client for Android. It interoperates with Ratspeak over the same Reticulum network.

## Pure Python Fallback (rnspure)

On systems where the `cryptography` package can't be installed (no C compiler, no OpenSSL):

```bash
pip install rnspure
```

This uses pure-Python cryptographic implementations. It works but is significantly slower and has received less security scrutiny.

> **Warning**: Only use `rnspure` when the standard `cryptography` package truly cannot be installed. For all other cases, use the regular install.

## OpenWRT

```bash
opkg install python3 python3-pip python3-cryptography python3-pyserial
pip install rns
```

AutoInterface requires link-local IPv6 support on the device.

## What's Next

- [First Run](../getting-started/first-run) -- complete the setup wizard
- [Your First Connection](../getting-started/your-first-connection) -- connect to the network
- [Choosing Your Setup](../getting-started/choosing-your-setup) -- compare implementations
