# Platform Notes

Reticulum and Ratspeak run on almost anything with Python. Here are the platform-specific details you may need.

## Linux

### Debian / Ubuntu (Bookworm+ / Lunar+)

Modern Debian-based systems use externally managed Python environments. Choose one approach:

```bash
# Option 1: Use pipx (recommended for system-wide tools)
pipx install rns

# Option 2: Use pip with system packages flag
pip install rns --break-system-packages

# Option 3: Add to pip config
echo "[global]
break-system-packages = true" >> ~/.config/pip/pip.conf
pip install rns
```

For Ratspeak, always use a virtual environment:

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

### Arch Linux

```bash
pip install rns
```

### Fedora / RHEL

```bash
sudo dnf install python3 python3-pip
pip install rns
```

## macOS

```bash
pip3 install rns
```

If `rnsd` is not found after install, add the Python bin directory to your PATH:

```bash
export PATH="$HOME/Library/Python/3.x/bin:$PATH"
```

Replace `3.x` with your Python version (check with `python3 --version`).

## Windows

Ratspeak's startup scripts require a bash-compatible shell. Install WSL (Windows Subsystem for Linux) or Git Bash before proceeding.

1. Install **Python 3.11+** from [python.org](https://python.org)
2. During install, check **"Add Python to PATH"**
3. Open a terminal:

```bash
pip install rns
```

For Ratspeak, use Git Bash or WSL for the best experience with `start.sh`/`stop.sh`.

## Raspberry Pi

Use a **64-bit OS** for best compatibility:

```bash
sudo apt install python3 python3-pip python3-cryptography python3-pyserial
pip install rns --break-system-packages
```

Raspberry Pi makes an excellent always-on transport node. A Pi Zero 2 W with an RNode radio can serve as a standalone mesh gateway.

## Android (Termux)

```bash
pkg install python python-cryptography
pip install rns
```

> **Note**: For a full mobile Reticulum experience, consider [Sideband](https://github.com/markqvist/Sideband) — a native Android/desktop LXMF client.

## Embedded / Constrained Environments

### rnspure

For systems without C compilation support or where the `cryptography` Python package can't be installed:

```bash
pip install rnspure
# Or equivalently:
pip install rns --no-dependencies
```

The `rns` and `rnspure` packages are identical in code. `rnspure` simply lists no dependencies, so pip doesn't try to install the `cryptography` Python package.

Reticulum will fall back to internal **pure-Python cryptographic implementations**. This works but has two drawbacks:

- Significantly slower performance
- Less security scrutiny than OpenSSL-backed implementations

> **Warning**: Pure-Python crypto should only be used on systems where the `cryptography` Python package truly cannot be installed. For all other cases, use the standard `pip install rns`.

### OpenWRT

```bash
opkg install python3 python3-pip python3-cryptography python3-pyserial
pip install rns
```

AutoInterface requires link-local IPv6 support on the device.

## First Run on Any Platform

After installing Reticulum, the first run creates a default config at `~/.reticulum/config` with AutoInterface enabled. Ratspeak uses its own config at `dashboard/ratspeak.conf` and stores data in `.ratspeak/`. Both can coexist. Config search order:

1. `/etc/reticulum/`
2. `~/.config/reticulum/`
3. `~/.reticulum/`

## Next Steps

- [Installing Ratspeak](../getting-started/installing-ratspeak) — Ratspeak-specific setup
- [First Run](../getting-started/first-run) — initial configuration
- [Your First Connection](../getting-started/your-first-connection) — connect to the network
