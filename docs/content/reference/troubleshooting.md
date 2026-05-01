# Troubleshooting

## macOS says "unidentified developer" on first launch

Builds aren't notarized yet. Right-click the app and choose **Open**, then confirm. macOS remembers the choice for future launches.

## Linux AppImage won't run

Make it executable first:

```bash
chmod +x Ratspeak-*.AppImage
./Ratspeak-*.AppImage
```

If it still won't start, install FUSE (`sudo apt install libfuse2` on Debian/Ubuntu).

## Windows SmartScreen blocks the installer

SmartScreen warns on unsigned executables. Click **More info**, then **Run anyway**. Code signing is on the roadmap.

## App is slow to start the first time

First launch initializes the SQLite database, builds the FTS index, and generates an identity. Subsequent launches are quick. Wait it out — it's not stuck.

## I can't see any peers

Walk through these in order:

1. Open **Network** and confirm at least one interface is enabled and shows a green status.
2. **AutoInterface**: both ends must be on the same LAN. Many corporate WiFi networks and guest SSIDs block multicast — try a wired connection or a different network.
3. **TCP**: confirm you can reach the host and port (`nc -zv host port`). Check the remote side has a TCPServer interface listening on that port.
4. **LoRa**: frequency, spreading factor, bandwidth, and coding rate must match exactly on both ends. One mismatched parameter and you hear nothing.

## My RNode doesn't show up in "Add LoRa Device"

- **macOS / Linux**: serial devices need user permissions. On Linux, add yourself to the `dialout` group (`sudo usermod -aG dialout $USER`), then log out and back in. On macOS, the device should appear as `/dev/tty.usbserial-*` automatically.
- **Windows**: install the CP210x or CH340 driver matching your RNode's USB chip. Check Device Manager for an unknown COM device.
- **iOS**: USB radios are not supported. Use a BLE-equipped RNode and pair it from **Settings → Bluetooth**.
- Bad cables look identical to good ones. If nothing else works, try a different USB cable — many shipped with devices are charge-only.

## Messages aren't delivering

A few things to check:

- **Length matters**. Opportunistic single-packet delivery caps at 295 bytes. Anything longer needs either a Direct Link to the recipient (both online at once) or a propagation node that both sides have peered with.
- **Recipient announce is stale**. Open the contact and tap **Request Path** or **Fetch from Propagation Node**. If their announce is older than the network's path expiry, packets have nowhere to go.
- **No transport coverage**. If you and the recipient share no interface and no hub between you, there's no route. Add a TCP hub or run a transport node.

## I lost my identity

The identity file lives inside Ratspeak's per-OS data directory — `~/Library/Application Support/com.ratspeak.app/.ratspeak/identities/<hash>/identity` on macOS, `~/.local/share/com.ratspeak.app/.ratspeak/identities/<hash>/identity` on Linux, `%APPDATA%\com.ratspeak.app\.ratspeak\identities\<hash>\identity` on Windows. If you have a backup of that file, copy it back into place and restart the app.

If you don't have a backup, the identity is **unrecoverable** — keys are generated client-side and never escrowed anywhere. Generate a new identity, then tell your contacts your new hash so they can update their address book.

## Auto-Announce isn't broadcasting

1. **Settings → Network → Auto-Announce** must not be set to **Off**.
2. At least one interface must be enabled and connected. If all interfaces are red, there's nothing to announce on.
3. Manual announces (long-press the bottom bar, or **Network → Announce**) are independent of the setting and always available — use them to confirm announce works at all before debugging the schedule.

## BLE peer mesh sees nothing

- Both devices need the **BLE** feature enabled in **Settings → Network**.
- Both devices need OS-level Bluetooth permission. On iOS and recent Android, the OS prompts on first scan; if you denied, grant it under system settings.
- BLE range is roughly 10 metres through walls, less with metal or concrete in the way. Move closer.
- On Linux, the `bluetooth` service must be running (`systemctl status bluetooth`).

## I can't reach `rns.ratspeak.org:4242`

That hub is best-effort community infrastructure with no uptime guarantee. If it's unreachable:

- Try a different community hub from the directory.
- Run your own TCPServer on a small VPS — it's a single interface block in the config.
- Connect peer-to-peer over a different transport (LoRa, BLE, AutoInterface on a shared LAN).

## Path not found for a contact you've messaged before

Reticulum forgets stale paths. Open the contact and tap **Request Path**, or wait for the next announce from the recipient. If the recipient went offline, requesting their announce from a propagation node will revive the path.

## "Database is locked"

Only one instance of Ratspeak should run against a given data directory at a time. Quit any other copies (check the system tray and any leftover processes), then relaunch. If the error persists after a clean restart, the WAL files may be stuck — quit the app and delete `ratspeak.db-wal` and `ratspeak.db-shm` in your data directory. The main `.db` file is safe to leave alone.

## Network graph is laggy with many nodes

Open the graph filters and untick **Discovered** to hide one-hop announces you've never spoken to. Large meshes are inherently expensive to lay out — narrow what's drawn rather than what's stored.

## High latency on LoRa

This is normal, not a bug. At SF12 / 125 kHz, a single packet takes around 1.5 seconds on the air, and end-to-end delivery over multiple hops with retries can take 30 to 120 seconds. To trade range for speed, drop to SF7–SF9 and (if regulations allow) widen to 250 kHz.

## Still stuck

Open **Settings → About** and check the version. Then ask in the community channels with: your OS, the version string, what you tried, and what you saw. Logs from **Settings → Diagnostics** help — they don't contain message contents.
