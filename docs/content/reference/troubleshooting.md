# Troubleshooting

Common issues with Ratspeak and Reticulum — symptoms, causes, and solutions.

## Installation Issues

### pip install fails with dependency errors

**Symptom:** `pip install -r requirements.txt` fails with compilation errors.

**Solution:**
```bash
# Ensure you have build tools
# macOS:
xcode-select --install

# Debian/Ubuntu:
sudo apt install build-essential python3-dev libffi-dev

# Then retry in a fresh venv
python3 -m venv .venv --clear
source .venv/bin/activate
pip install -r requirements.txt
```

### "No module named rns" or "No module named lxmf"

**Symptom:** Dashboard crashes on startup with import errors.

**Solution:** Make sure you're in the virtual environment:
```bash
source .venv/bin/activate
pip install rns lxmf
```

### Rust build fails

**Symptom:** `cargo build` errors.

**Common fixes:**
```bash
# Update Rust toolchain
rustup update

# Clean and rebuild
cargo clean && cargo build --release

# If serial features cause issues (no USB):
cargo build --release --no-default-features
```

---

## Startup Issues

### Dashboard shows "Starting..." indefinitely

**Symptom:** Browser shows loading screen, never reaches "ready".

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| rnsd not running | Start it: `rnsd --config nodes/node_1 -vv` |
| Port 5050 in use | Change port in `ratspeak.conf` or kill the other process |
| RNS shared instance conflict | Check for other Reticulum instances: `ps aux \| grep rnsd` |
| Database locked | Remove stale lock: check for other Ratspeak processes |

### "Address already in use" on port 5050

**Solution:**
```bash
# Find what's using the port
lsof -i :5050

# Kill it, or change the port
# In ratspeak.conf:
# [server]
# port = 8080
```

### "Could not connect to shared instance"

**Symptom:** Dashboard starts but can't reach the RNS daemon.

**Solution:**
```bash
# Make sure rnsd is running
rnsd --config nodes/node_1 -vv

# Check if shared instance port is available
lsof -i :38005

# If another instance is running, stop it first
./stop.sh
```

---

## Messaging Issues

### Messages stuck on "pending"

**Symptom:** Sent messages never progress to "sent" or "delivered".

**Causes:**

| Cause | Solution |
|-------|----------|
| No path to recipient | Wait for their announce, or request path manually |
| Recipient offline | Use propagation node for store-and-forward delivery |
| Interface down | Check Network Monitoring → Interface cards |
| RNS routing broken | Clear paths: Settings → Clear Path Table |

### Messages show "failed"

**Symptom:** Messages fail after timeout (3 minutes).

**Solutions:**
- Verify the contact's destination hash is correct
- Check that at least one shared interface connects you
- Try sending via propagation node instead of direct
- If on LoRa: ensure you're within radio range or have transport nodes

### Not receiving messages

**Symptom:** Other users say they sent messages, but nothing appears.

**Solutions:**
- Force an announce: Settings → Trigger Announce
- Check that your identity is active and LXMF destination is registered
- Verify the sender has your correct destination hash
- Check for identity mismatch (switched identities recently?)

### Full-text search returns no results

**Symptom:** Search bar finds nothing, even for known messages.

**Solution:** The FTS5 index may be out of sync. Restart the dashboard — it will rebuild the index on startup.

---

## Connection Issues

### AutoInterface not discovering peers

**Symptom:** LAN peers don't appear in topology.

**Solutions:**
- Ensure both devices are on the same subnet
- Check firewall: AutoInterface uses multicast (UDP)
- Some WiFi routers block multicast — try a direct TCP connection instead
- On Linux, check that the correct network interface is active:
  ```ini
  [[WiFi]]
      type = AutoInterface
      allowed_interfaces = wlan0
  ```

### TCP connection refused

**Symptom:** Can't connect to a remote hub.

**Solutions:**
- Verify the host and port are correct
- Check that the remote server's firewall allows the port
- Ensure the remote is running `TCPServerInterface` on that port
- Try `telnet host port` or `nc -zv host port` to test connectivity

### RNode not detected

**Symptom:** Serial port dropdown is empty, or RNode interface fails to start.

**Solutions:**

| OS | Fix |
|----|-----|
| Linux | Add user to `dialout` group: `sudo usermod -a -G dialout $USER` (then log out/in) |
| macOS | Install CP2102 driver if needed |
| All | Check cable — some USB cables are charge-only (no data) |
| All | Verify with `ls /dev/tty*` that the device appears |

### BLE scan finds nothing

**Symptom:** BLE scanning returns no devices.

**Solutions:**
- Ensure `bleak` is installed: `pip install bleak`
- On Linux: `sudo apt install bluez` and ensure bluetooth service is running
- BLE range is limited (~10m) — move devices closer
- Some systems require running as root for BLE scanning

---

## Network Issues

### Announces not propagating

**Symptom:** Nodes can't see each other despite being connected.

**Solutions:**
- Ensure at least one node has `enable_transport = Yes`
- Check that transport nodes have multiple interfaces
- On LoRa: announce propagation is rate-limited to 2% of bandwidth — be patient
- Verify with `rnstatus` that interfaces are active

### High latency on LoRa

**Symptom:** Messages take minutes to deliver over LoRa.

**This is normal for LoRa.** At SF12/125kHz, a single packet takes ~1.5 seconds to transmit. With retries, path discovery, and multi-hop routing, delivery times of 30-120 seconds are typical.

**Optimization tips:**
- Use lower spreading factor (SF7-SF9) for shorter range but faster speeds
- Use wider bandwidth (250kHz) if regulatory limits allow
- Minimize hop count — place transport nodes strategically
- Use `boundary` mode on TCP interfaces to prevent internet traffic flooding LoRa

### "Path not found" for known contacts

**Solutions:**
- Request path: click the contact → Request Path
- Force announce on both sides
- Clear path table and wait for fresh announces
- Check that transport nodes are running between you

---

## Identity Issues

### Identity file won't import

**Symptom:** Import fails with "invalid identity" error.

**Solutions:**
- Identity files must be exactly 64 bytes (Ed25519 + X25519 private keys)
- Check that the file isn't corrupted (compare sizes)
- For base64 import, ensure the string is valid base64 encoding of 64 bytes

### "Clone detected" warning

**Symptom:** Dashboard warns about identity cloning.

**Cause:** The same identity file is running on a different machine (different hostname, MAC, or CPU architecture).

**Solution:** Each identity should only run on one machine at a time. Either stop the other instance, or create a new identity on this machine.

---

## Database Issues

### "database is locked"

**Symptom:** Operations fail with SQLite lock errors.

**Solutions:**
- Ensure only one Ratspeak instance is running
- Check for zombie processes: `ps aux | grep ratspeak`
- Restart the dashboard
- If persistent, the WAL file may be corrupted — stop all processes and delete `ratspeak.db-wal` and `ratspeak.db-shm` (the database itself is safe)

### Database corruption

**Symptom:** Crashes on startup with SQLite errors.

**Nuclear option (last resort):**
```bash
# Back up the database first!
cp ~/.ratspeak/ratspeak.db ~/.ratspeak/ratspeak.db.bak

# Try SQLite recovery
sqlite3 ~/.ratspeak/ratspeak.db ".recover" | sqlite3 ~/.ratspeak/ratspeak_recovered.db

# Or start fresh (loses message history, keeps identities):
rm ~/.ratspeak/ratspeak.db
# Restart dashboard — it will create a new database
```

---

## Performance Issues

### Dashboard is slow / high CPU

**Solutions:**
- Reduce polling interval in `ratspeak.conf`: `poll_interval = 3.0`
- Close extra browser tabs connected to the dashboard
- On Raspberry Pi: use Ratspeak-rs (Rust) for lower resource usage
- Reduce `max_log_entries` if the event log is large

### Network graph is laggy

**Solutions:**
- Filter node types (uncheck "Discovered" nodes in graph controls)
- Reduce `max_nodes` in config
- The graph uses D3.js force simulation — complex topologies are inherently expensive

---

## Getting Help

If none of the above solves your issue:

1. Check the [FAQ](../reference/faq) for common questions
2. Check the Ratspeak GitHub Issues for known bugs
3. Include in your bug report: OS, Python/Rust version, `ratspeak.conf`, and relevant error output

## What's Next

- [FAQ](../reference/faq) — frequently asked questions
- [Configuration Reference](../reference/configuration-reference) — all config options
- [Platform Notes](../getting-started/platform-notes) — OS-specific setup
