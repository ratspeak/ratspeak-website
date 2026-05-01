# Install & Platform Setup

Ratspeak is a single application — one binary per platform, no separate daemon, no web server, no Python. Pick your platform below, install it, and you're done.

## Download

Grab the installer for your OS from [ratspeak.org/download.html](https://ratspeak.org/download.html). Mobile builds will land on the App Store and Play Store soon; until then, download from the GitHub releases page linked from the same download page.

## macOS

1. Download the `.dmg` (Apple Silicon or Intel — match your Mac).
2. Open the `.dmg`. Drag **Ratspeak.app** onto the **Applications** folder shortcut.
3. Eject the disk image.
4. Launch Ratspeak from Applications or Spotlight.

## Linux

Three formats are published — pick whichever fits your distro:

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

Two installers are available: `.msi` (Windows Installer) and a NSIS `.exe`. Either one works — pick whichever you prefer. Double-click to install. Ratspeak appears in the Start Menu when it's done.

## iOS

The App Store build is in review. In the meantime:

- **TestFlight** — join the public beta from the link on [ratspeak.org/download.html](https://ratspeak.org/download.html).
- **Sideload** — clone the source and build to your device with Xcode if you have a developer account.

## Android

- Download the `.apk` from the GitHub releases page.
- Open the file. Android will ask permission to install from an unknown source — grant it for your browser or file manager.
- Tap **Install**.

The Play Store build will replace this step once it lands.

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
| macOS | `~/Library/Application Support/com.ratspeak.app/.ratspeak/` |
| Linux | `~/.local/share/com.ratspeak.app/.ratspeak/` |
| Windows | `%APPDATA%\com.ratspeak.app\.ratspeak\` |

Back this folder up to preserve your identity and messages. Deleting it resets Ratspeak to a fresh install.

## Updating

Future versions of Ratspeak will check for updates in-app. For now, download the new installer from [ratspeak.org/download.html](https://ratspeak.org/download.html) and install it over the top — your data folder is left untouched.

## Building from source

If you'd rather build it yourself, install Rust 1.85+ and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS, clone the [Ratspeak repository](https://github.com/ratspeak/Ratspeak), and run `cargo tauri build`. The output binaries land in `src-tauri/target/release/bundle/`.
