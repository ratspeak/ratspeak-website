# Installing Ratspeak (Python)

Get Ratspeak-py running on your system in a few minutes.

## Prerequisites

You need three things before you start:

- **Python 3.11 or newer** — the runtime that powers Ratspeak-py
- **pip** — the Python package manager (ships with most Python installs)
- **git** — to clone the repository

Check your Python version by running:

```bash
python3 --version
```

If the output shows 3.11 or higher, you are good to go. If not, install or upgrade Python before continuing.

> **Tip**: See [Platform Notes](../getting-started/platform-notes) for OS-specific prerequisites, including how to install Python on macOS, Debian, Ubuntu, Fedora, and Windows.

## Installation

Open a terminal and run these commands one at a time.

```bash
# Clone the repository
git clone https://github.com/ratspeak/ratspeak.git
cd ratspeak

# Create a virtual environment (recommended)
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

The virtual environment keeps Ratspeak's dependencies isolated from your system Python. You can skip this step, but it prevents conflicts with other Python projects on your machine.

> **Note**: On Windows (WSL), replace `source .venv/bin/activate` with `source .venv/Scripts/activate` if you are using Git Bash, or `. .venv/bin/activate` in a standard WSL shell.

## Starting Ratspeak

```bash
./start.sh
```

This launches three processes:

1. **rnsd** — the Reticulum network daemon, which handles all network transport
2. **Bridge agent** — connects the daemon to the dashboard
3. **Dashboard server** — the web UI, served on port 5050

Open **http://localhost:5050** in your browser. You should see the setup wizard on first run.

> **Note**: The first start may take a few seconds longer while Reticulum generates your identity keys.

## Stopping Ratspeak

```bash
./stop.sh
```

This cleanly shuts down all three processes. You can also press `Ctrl+C` in the terminal where you ran `start.sh`, but `stop.sh` is more reliable for background processes.

## Dashboard-Only Mode

If you already have **rnsd** running from another Reticulum application (Sideband, NomadNet, or a manual daemon), you do not need to start it again. Run just the dashboard:

```bash
cd dashboard
python app.py
```

The dashboard connects to the existing daemon as a shared instance client. This avoids port conflicts and lets multiple Reticulum applications share a single daemon.

## Configuration

The default configuration lives at `dashboard/ratspeak.conf`. You can override any setting with environment variables when you start Ratspeak.

```bash
# Change the port
RATSPEAK_SERVER_PORT=8080 ./start.sh

# Change the host (to allow network access from other devices)
RATSPEAK_SERVER_HOST=0.0.0.0 ./start.sh
```

> **Warning**: Setting the host to `0.0.0.0` exposes the dashboard to your local network. Only do this on trusted networks.

See [Configuration](../using-ratspeak/configuration) for the full reference of all available settings.

## Troubleshooting

**Port already in use?**
Change the port with `RATSPEAK_SERVER_PORT=8080 ./start.sh`. Alternatively, find what is using port 5050 with `lsof -i :5050` (macOS/Linux) and stop it.

**Python version too old?**
Run `python3 --version` to confirm. You need 3.11 or newer. On systems with multiple Python versions, try `python3.11 --version` or `python3.12 --version` to see if a newer version is installed under a different name.

**pip install fails?**
On newer versions of Debian and Ubuntu, pip may refuse to install packages system-wide. Use a virtual environment (described above) to avoid this. If you must install system-wide, add the `--break-system-packages` flag, but a virtual environment is the better solution.

**Dashboard doesn't load?**
Check the terminal output for error messages. All three processes (rnsd, bridge agent, dashboard server) must be running. If one failed to start, the logs will tell you which one and why.

**Permission denied on start.sh?**
Make the script executable: `chmod +x start.sh stop.sh`.

## What's Next

- [First Run](../getting-started/first-run) — complete the setup wizard and create your identity
- [Your First Connection](../getting-started/your-first-connection) — connect to the network and find peers
- [Platform Notes](../getting-started/platform-notes) — OS-specific instructions and workarounds
