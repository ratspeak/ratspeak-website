# Install & Platform Setup

Ratspeak is a single application: no separate daemon, no web server, no Python runtime. Pick your platform below, install it, and you're done.

## Download

Ratspeak v1.0.0 is published as a normal public release. Start at [ratspeak.org/download.html](https://ratspeak.org/download.html), or use the [GitHub releases page](https://github.com/ratspeak/Ratspeak/releases) directly. If you want to inspect or package the code yourself, use [Building from Source](../getting-started/building-from-source).

## macOS

1. Download the `.dmg` from the download page or GitHub release (Apple Silicon or Intel — match your Mac).
2. Open the `.dmg`. Drag **Ratspeak.app** onto the **Applications** folder shortcut.
3. Eject the disk image.
4. Launch Ratspeak from Applications or Spotlight.

## Linux

Pick whichever Linux release format fits your distro:

- **`.AppImage`** — most portable, works on essentially any modern distro. After downloading, make it executable and run it:
  ```bash
  chmod +x Ratspeak-*.AppImage
  ./Ratspeak-*.AppImage
  ```
- **`.deb`** — Debian, Ubuntu, Mint, Pop!_OS:
  ```bash
  sudo apt install ./ratspeak_*.deb
  ```
- **`.rpm`** — Fedora, RHEL, openSUSE:
  ```bash
  sudo dnf install ./ratspeak-*.rpm
  ```

Once installed via `.deb` or `.rpm`, Ratspeak shows up in your application menu. AppImages run in place — drop them anywhere on your `$PATH` if you want to launch from a terminal.

## Windows

Use the Windows installer from the download page or GitHub release. If multiple Windows package types are available, use the MSIX build when this machine needs the Bluetooth Peer advertiser/peripheral role; Windows only exposes the Bluetooth capability Ratspeak uses from the packaged app. The `.msi` and `.exe` builds are fine for normal desktop use, TCP, I2P, serial radios, and RNode work, but they do not provide the Bluetooth Peer advertiser/peripheral role.

## iOS

There is no public iOS download yet. iOS testing is currently source builds on macOS with Xcode and developer provisioning for `org.ratspeak.ios`; TestFlight and App Store distribution will come later. See [Building from Source](../getting-started/building-from-source).

iOS does not support general USB serial from third-party apps, so LoRa on iPhone and iPad uses Bluetooth RNode hardware. Local Network and multicast discovery depend on Apple permissions and provisioning, notifications require user permission, and background execution remains subject to iOS lifecycle limits.

## Android

- Download the `.apk` from [ratspeak.org/download.html](https://ratspeak.org/download.html) or the GitHub release.
- Open the file. Android will ask permission to install from an unknown source — grant it for your browser or file manager.
- Tap **Install**.

Public Play Store distribution will replace this for most users once the listing is ready.

## First launch (security warnings)

Ratspeak's installers aren't yet code-signed and notarized, so each OS will ask you to confirm the first time you run it. This is a one-time prompt.

- **macOS** — "Ratspeak.app cannot be opened because the developer cannot be verified." Right-click the app and choose **Open**, then click **Open** in the dialog. Subsequent launches work normally.
- **Windows** — SmartScreen shows "Windows protected your PC." Click **More info**, then **Run anyway**.
- **Linux AppImage** — needs `chmod +x` (shown above). No further prompt.
- **Android** — "For your security, your phone is not allowed to install unknown apps from this source." Tap **Settings**, allow the source, then return and install.

## Where your data lives

Ratspeak stores its identity keys, message database, and config in the OS-standard data directory under a `.ratspeak/` subfolder:

| Platform | Path |
|---|---|
| macOS | `~/Library/Application Support/org.ratspeak.desktop/.ratspeak/` |
| Linux | `~/.local/share/org.ratspeak.desktop/.ratspeak/` |
| Windows | `%APPDATA%\org.ratspeak.desktop\.ratspeak\` |

The app-private Reticulum config is inside that folder at `reticulum/config`
and defaults to shared-instance ports `37430`/`37431`. It is separate from a
system Reticulum install using ports `37428`/`37429`, such as Python
Reticulum's `~/.reticulum/config` or rsReticulum's `~/.rsReticulum/config`.

Back this folder up to preserve your identity and messages. Deleting it resets Ratspeak to a fresh install.

## Updating

Future versions of Ratspeak will check for updates in-app. Until that lands, install the newer public release artifact from the download page or GitHub releases over the top — your data folder is left untouched.

## Next

Once Ratspeak launches, continue to [Your First Session](../getting-started/your-first-session).

If you want to review the code, package the current tree yourself, or build for a platform without a public artifact, use [Building from Source](../getting-started/building-from-source). It covers the sibling repo layout, Rust and Tauri prerequisites, desktop bundles, Android APKs, iOS builds, and the standalone `rnsd-rs` / `lxmd-rs` daemons.
