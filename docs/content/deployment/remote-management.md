# Remote Management

Managing headless Reticulum and Ratspeak nodes remotely — monitoring status, executing commands, and maintaining infrastructure over the mesh.

## Overview

Once you have Reticulum nodes deployed as headless infrastructure — Raspberry Pi gateways, VPS transport nodes, or remote relay stations — you need a way to manage them without physical access. Reticulum provides built-in remote management capabilities that work over the mesh itself, secured by cryptographic identity verification.

There are two complementary approaches:

- **Built-in remote management** — Query interface status and manage blackhole lists remotely using `rnstatus` and `rnpath` with the `-R` flag
- **Remote command execution** — Run arbitrary commands on remote nodes using the `rnx` utility

## Enabling Built-in Remote Management

Configure the remote node to accept management queries by adding these lines to its `~/.reticulum/config`:

```ini
[reticulum]
enable_remote_management = yes
remote_management_allowed = 9fb6d773498fb3feda407ed8ef2c3229, 2d882c5586e548d79b5af27bca1776dc
```

The `remote_management_allowed` parameter takes a comma-separated list of identity hashes that are authorized to query the node. Generate a management identity on your local machine:

```bash
rnid -g ~/.reticulum/identities/mgmt
rnid -i ~/.reticulum/identities/mgmt -p
```

Copy the identity hash from the output and add it to the remote node's `remote_management_allowed` list.

### Querying Remote Status

Once configured, use `rnstatus` with the `-R` flag to query the remote node:

```bash
# Query a remote transport node's interface status
rnstatus -R <transport_hash> -i ~/.reticulum/identities/mgmt

# Monitor continuously
rnstatus -R <transport_hash> -i ~/.reticulum/identities/mgmt -m

# JSON output for scripting
rnstatus -R <transport_hash> -i ~/.reticulum/identities/mgmt -j

# Set a timeout for the query
rnstatus -R <transport_hash> -i ~/.reticulum/identities/mgmt -w 15
```

### Managing Remote Blackhole Lists

Use `rnpath` with `-R` to manage blackhole lists on remote nodes:

```bash
# View blackholed identities on a remote node
rnpath -b -R <transport_hash> -i ~/.reticulum/identities/mgmt

# Blackhole an identity on a remote node
rnpath -B <bad_hash> --duration 48 --reason "Spam" -R <transport_hash> -i ~/.reticulum/identities/mgmt

# Preview a remote node's published blackhole list
rnpath -p -R <transport_hash> -i ~/.reticulum/identities/mgmt
```

## Remote Command Execution with rnx

The `rnx` utility allows you to execute commands on remote systems over Reticulum links. This is useful for general system administration tasks that go beyond Reticulum-specific management.

### Setting Up the Remote Node

On the remote node, start `rnx` in listen mode with a list of authorized identities:

```bash
rnx --listen -a <your_identity_hash>
```

For persistent operation, run it as a systemd service:

```ini
[Unit]
Description=Reticulum Remote Execution Listener
After=rnsd.service

[Service]
Type=simple
Restart=always
RestartSec=5
User=USERNAME
ExecStart=rnx --listen -a IDENTITY_HASH_1 -a IDENTITY_HASH_2

[Install]
WantedBy=multi-user.target
```

### Executing Remote Commands

From your local machine, run commands on the remote node:

```bash
# Check system uptime
rnx <dest_hash> "uptime"

# Check disk usage
rnx <dest_hash> "df -h"

# View Reticulum logs
rnx <dest_hash> "journalctl -u rnsd --no-pager -n 50"

# Restart the Reticulum daemon
rnx <dest_hash> "sudo systemctl restart rnsd"

# Interactive pseudo-shell
rnx <dest_hash> -x
```

> **Warning**: `rnx` executes commands with the permissions of the user running the listener. Be careful with the identities you authorize, and avoid running the listener as root unless necessary.

The default identity for `rnx` is stored at `~/.reticulum/identities/rnx`. You can specify a different identity with the `-i` flag.

## SSH + Reticulum Patterns

For more complex management scenarios, you can combine SSH with Reticulum's transport capabilities. Use `rnx` for quick checks and restarts, and SSH (tunneled through TCP interfaces if needed) for full interactive sessions.

A practical pattern for managing a fleet of nodes:

1. **Quick health checks** — Use `rnstatus -R` to verify interface status across all nodes
2. **Routine commands** — Use `rnx` for log checks, service restarts, and config updates
3. **Interactive sessions** — Use `rnsh` (Reticulum shell) for full terminal access when needed
4. **Bulk operations** — Script `rnx` calls to update configurations across multiple nodes

## Monitoring Node Health

### Status Checks

Create a simple monitoring script that queries your infrastructure:

```bash
#!/bin/bash
MGMT_ID="~/.reticulum/identities/mgmt"
NODES=("hash1" "hash2" "hash3")

for node in "${NODES[@]}"; do
    echo "=== Node: $node ==="
    rnstatus -R "$node" -i "$MGMT_ID" -w 10 -j 2>/dev/null
    if [ $? -ne 0 ]; then
        echo "  UNREACHABLE"
    fi
    echo ""
done
```

### Connectivity Testing

Use `rnprobe` to test round-trip connectivity to remote nodes:

```bash
rnprobe rnstransport.probe <dest_hash> -n 5 -t 30
```

This reports round-trip time, hop count, and signal quality metrics (RSSI/SNR) when available.

> **Tip**: The remote node must have `respond_to_probes = Yes` in its configuration for `rnprobe` to work.

## Security Considerations

- **Identity-based authentication** — Only identities listed in `remote_management_allowed` can query a node. There are no passwords to brute-force.
- **Encrypted transport** — All management traffic is encrypted end-to-end using Reticulum's standard cryptographic stack.
- **Minimal attack surface** — Remote management only exposes status queries and blackhole management. It does not provide shell access (use `rnx` or `rnsh` separately for that).
- **Audit your authorized list** — Periodically review which identities have management access. Remove any that are no longer needed.

## What's Next

- [Raspberry Pi Gateway](../deployment/raspberry-pi-gateway.md) — setting up a headless gateway node
- [Docker Deployment](../deployment/docker-deployment.md) — containerized Reticulum deployment
- [Blackhole Management](../understanding/blackhole-management.md) — blocking spam and abuse
- [Building Networks](../connecting/building-networks.md) — network topology patterns
