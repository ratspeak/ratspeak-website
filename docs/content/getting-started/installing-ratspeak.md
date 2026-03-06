# Installing Ratspeak

Get Ratspeak running on your system in a few minutes.

## Prerequisites

- **Python 3.11+** (required)
- **pip** (Python package manager)
- **git** (to clone the repository)
- **bleak** and **bless** (for BLE mesh — installed via requirements.txt)

Ratspeak runs on Linux, macOS, and Windows (via WSL or Git Bash). See [Platform Notes](platform-notes) for OS-specific details.

## Quick Start

```bash
# Clone the repository
git clone https://github.com/defidude/ratspeak.git
cd ratspeak

# Create a virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start everything (rnsd + agent + dashboard)
./start.sh
```

> **Tip**: If you see an error, check that Python 3.11+ is in your PATH and that port 5050 is not already in use.

The dashboard will be available at **http://localhost:5050**.

## What `start.sh` Does

The start script launches three processes:

1. **rnsd** — the Reticulum daemon (hub node)
2. **node_agent.py** — bridges rnsd and the dashboard
3. **app.py** — the Flask dashboard server on port 5050

All processes launch and their output streams to the current terminal.

## Dashboard-Only Mode

If you already have a Reticulum daemon (rnsd) running — for example, from Sideband or NomadNet — you can start just the dashboard:

```bash
cd dashboard
python app.py
```

The dashboard will connect to the existing rnsd as a shared instance client.

## Stopping

```bash
./stop.sh
```

This cleanly shuts down all Ratspeak processes.

## Configuration

The dashboard reads its configuration from `dashboard/ratspeak.conf`. You can change the port, host, polling intervals, and more. Every setting can also be overridden via environment variables:

```bash
# Example: change the dashboard port
RATSPEAK_SERVER_PORT=8080 ./start.sh
```

See [Configuration](../using-ratspeak/configuration) for the full reference.

## Verifying the Install

After starting, open **http://localhost:5050** in your browser. You should see:

1. The Ratspeak dashboard with a setup wizard (on first run)
2. The sidebar showing your node status
3. No error messages in the terminal

> **Tip**: If the dashboard doesn't load, check that port 5050 isn't in use by another application. You can change it via `RATSPEAK_SERVER_PORT`.

## Next Steps

- [First Run](../getting-started/first-run) — complete the setup wizard
- [Your First Connection](../getting-started/your-first-connection) — connect to the network
- [Platform Notes](../getting-started/platform-notes) — OS-specific instructions
