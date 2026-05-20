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

## Messaging says service unavailable or not initialized

On cold start, the Reticulum runtime comes up before LXMF. Messaging calls made during that window can return `service_unavailable`, `database_unavailable`, or `lxmf_not_initialized`. Wait until setup finishes and the app is responsive, then retry. If it persists after a restart, collect logs as described in [Still stuck](#/reference/troubleshooting::still-stuck).

## I can't see any peers

Walk through these in order:

1. Open **Network** and confirm at least one interface is enabled and shows a green status.
2. **AutoInterface**: both ends must be on the same LAN. Many corporate WiFi networks and guest SSIDs block multicast — try a wired connection or a different network.
3. **TCP**: confirm you can reach the host and port (`nc -zv host port`). Check the remote side has a TCPServer interface listening on that port.
4. **LoRa**: frequency, spreading factor, bandwidth, and coding rate must match exactly on both ends. One mismatched parameter and you hear nothing.

## My RNode doesn't show up in "Add LoRa Device"

- **macOS / Linux**: serial devices need user permissions. On Linux, add yourself to the `dialout` group (`sudo usermod -aG dialout $USER`), then log out and back in. On macOS, the device should appear as `/dev/tty.usbserial-*` automatically.
- **Windows**: install the CP210x or CH340 driver matching your RNode's USB chip. Check Device Manager for an unknown COM device.
- **iOS**: USB radios are not supported. Use a BLE-equipped RNode from **Network → Add LoRa Device → Bluetooth**, or use the TCP tab if your RNode stream is exposed on a reachable local endpoint. Accept the OS pairing prompt for BLE when it appears.
- Bad cables look identical to good ones. If nothing else works, try a different USB cable — many shipped with devices are charge-only.

## Messages aren't delivering

A few things to check:

- **Length matters**. Opportunistic single-packet delivery caps at 295 bytes. Anything longer needs either Direct delivery to a recipient that is reachable at send time or an Offline Inbox/propagation node that both sides can reach.
- **Recipient announce is stale**. Open the contact and tap **Request Path** or use Offline Inbox if one is reachable. If their announce is older than the network's path expiry, packets have nowhere to go.
- **No transport coverage**. If you and the recipient share no interface and no hub between you, there's no route. Add a TCP hub or run a transport node.

## I lost my identity

The identity file lives inside Ratspeak's per-OS data directory — `~/Library/Application Support/org.ratspeak.desktop/.ratspeak/identities/<hash>/identity` on macOS, `~/.local/share/org.ratspeak.desktop/.ratspeak/identities/<hash>/identity` on Linux, `%APPDATA%\org.ratspeak.desktop\.ratspeak\identities\<hash>\identity` on Windows. If you have a backup of that file, copy it back into place and restart the app.

If you don't have a backup, the identity is **unrecoverable** — keys are generated client-side and never escrowed anywhere. Generate a new identity, then tell your contacts your new hash so they can update their address book.

## Auto-Announce isn't broadcasting

1. **Settings → Network → Auto-Announce** must not be set to **Off**.
2. At least one interface must be enabled and connected. If all interfaces are red, there's nothing to announce on.
3. Manual announces (long-press the bottom bar, or **Network → Announce**) are independent of the setting and always available — use them to confirm announce works at all before debugging the schedule.

## Bluetooth Peer sees nothing

- Both devices need **Bluetooth Peer** enabled in **Settings → Network**.
- Both devices need OS-level Bluetooth permission. On iOS and recent Android, the OS prompts on first scan; if you denied, grant it under system settings.
- BLE range is roughly 10 metres through walls, less with metal or concrete in the way. Move closer.
- On Windows, use the MSIX build if this machine needs to advertise for Bluetooth Peer. The plain `.exe` / MSI builds do not provide the advertiser/peripheral role.
- On Linux, the `bluetooth` service must be running (`systemctl status bluetooth`), the user must have BlueZ permissions, the adapter must support LE advertising, and some distros need `Experimental = true` in `/etc/bluetooth/main.conf` followed by `sudo systemctl restart bluetooth`.

## I can't reach a public Ratspeak TCP server

Ruby (`1.ratspeak.org:4141`), Emerald (`2.ratspeak.org:4242`), and Diamond (`3.ratspeak.org:4343`) are best-effort public Ratspeak infrastructure with no uptime guarantee. The legacy endpoint `rns.ratspeak.org:4242` is an alias for Emerald. If one is unreachable:

- Try another public Ratspeak server, or a different community hub from [Reticulum's current connect/backbone information](https://reticulum.network/connect.html) or from a community directory you trust.
- Run your own TCPServer on a small VPS — it's a single interface block in the config.
- Connect peer-to-peer over a different transport (LoRa, BLE, AutoInterface on a shared LAN).

## Path not found for a contact you've messaged before

Reticulum forgets stale paths. Open the contact and tap **Request Path**, or wait for the next announce from the recipient. If the recipient went offline, a reachable Offline Inbox/propagation node can still hold encrypted mail for later pickup.

## "Database is locked"

Only one instance of Ratspeak should run against a given data directory at a time. Quit any other copies (check the system tray and any leftover processes), then relaunch. If the error persists after a clean restart, the WAL files may be stuck — quit the app and delete `ratspeak.db-wal` and `ratspeak.db-shm` in your data directory. The main `.db` file is safe to leave alone.

## Peers or Network views are laggy with many nodes

Filter out **Discovered** peers you have never spoken to, or narrow the interface/status filters while diagnosing a large mesh. Large announce tables are normal on busy networks; narrow what is shown rather than deleting what the router has learned.

## Voice call button never appears

The call button only appears when:

- the binary you are running was built with the `lxst-voice` Cargo feature (the default for public builds — source builds invoked with `--no-default-features` compile it out entirely);
- the active conversation is with a **saved contact** (peers and unknown addresses cannot be dialed);
- no other call is already in progress.

If you built from source and the button is missing, rebuild without `--no-default-features` and make sure you have the `rsLXST` sibling checkout next to `Ratspeak`. See [Building from Source](../getting-started/building-from-source) for the layout.

## Microphone permission was denied

Voice calls need OS-level microphone access. The first call triggers the prompt; later calls reuse the granted permission.

- **macOS** — System Settings → Privacy & Security → Microphone → enable Ratspeak.
- **Windows** — Settings → Privacy & Security → Microphone → toggle on for Ratspeak.
- **Linux** — most distros do not gate microphone access per-app at the OS level. If audio capture still fails, check your PulseAudio / PipeWire input device and that no other app holds an exclusive handle on it.
- **Android** — Settings → Apps → Ratspeak → Permissions → enable Microphone.
- **iOS** — Settings → Privacy & Security → Microphone → enable Ratspeak.

If permission was denied on the very first prompt some OSes never prompt again. Toggle the permission off and back on in system settings, then place a fresh call.

## Incoming call surface never opens

A few things to check:

- **You are not a contact yet.** Ratspeak only rings for inbound calls from saved contacts or for callers reachable on a direct zero-hop Reticulum path. Ask the caller to save you (or save them) and try again.
- **You have rejected this caller many times.** After ten consecutive rejections a non-contact caller is automatically blackholed. Open **Network → Blackholes** and remove the entry if it was a mistake.
- **You blocked the contact.** Blocked contacts are blackholed at the network layer; their calls never reach the call surface. Unblock the contact under **Contacts** and remove the corresponding network blackhole entry.
- **The voice stack is not running.** Reopen the app — the call surface comes online once the LXST service has started.

## Call connects but there is no audio

- Confirm both sides granted microphone permission (see above).
- Check your OS default audio input and output. Ratspeak uses the OS default device and does not yet expose an in-app picker.
- On Linux, confirm PulseAudio or PipeWire actually exposes the device you expect (`pactl info`, `pactl list short sinks/sources`).
- On Android, leave the app foregrounded during the first call. Background audio routing while the OS is still confirming foreground service state can drop the capture stream.
- If the audio strip in the app shows a yellow warning text, that is the runtime telling you which side of the pipeline failed to start (microphone vs speaker) — copy that string when filing a bug.

## High latency on LoRa

This is normal, not a bug. At SF12 / 125 kHz, a single packet takes around 1.5 seconds on the air, and end-to-end delivery over multiple hops with retries can take 30 to 120 seconds. To trade range for speed, drop to SF7–SF9 and (if regulations allow) widen to 250 kHz.

## Still stuck

Open **Settings → About** and check the version. Then ask in the community channels with: your OS, the version string, what you tried, and what you saw.

Useful logs are platform-specific:

- **Desktop**: `Ratspeak/logs/ratspeak.log` under the app data directory.
- **Android**: `adb logcat -s RatspeakRust`.
- **iOS**: Console logs under the `org.ratspeak.ios` process.

Message bodies are not intentionally logged, but hashes, filenames, interface names, paths, and errors can appear. Redact anything you do not want to share.
