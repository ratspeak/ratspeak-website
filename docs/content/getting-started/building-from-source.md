# Building from Source

Use this path when you want to test the current tree, package Ratspeak yourself, review the code before running it, or work on Ratspeak, rsReticulum, rsLXMF, or rsLXST directly.

This page assumes you are comfortable following terminal commands but not that you already know Rust, Tauri, Android Studio, or Xcode.

## What you are building

Ratspeak is the app. It embeds the protocol and support repos below:

- **[Ratspeak](https://github.com/ratspeak/Ratspeak)** - the desktop and mobile app. The current app release is v1.0.19, published as a normal public GitHub release on the [Ratspeak releases page](https://github.com/ratspeak/Ratspeak/releases).
- **[rsReticulum](https://github.com/ratspeak/rsReticulum)** - the Reticulum network stack and `*-rs` command-line tools. The current public release is the [v0.9.4 pre-release](https://github.com/ratspeak/rsReticulum/releases/tag/v0.9.4).
- **[rsLXMF](https://github.com/ratspeak/rsLXMF)** - the LXMF messaging layer and `lxmd-rs` propagation daemon. The current public release is the [v0.9.2 pre-release](https://github.com/ratspeak/rsLXMF/releases/tag/v0.9.2).
- **[lrgp-rs](https://github.com/ratspeak/lrgp-rs)** - the lightweight game protocol used by the Ratspeak app.
- **[rsLXST](https://github.com/ratspeak/rsLXST)** - the experimental LXST telephony layer used for Ratspeak's voice calls. Required for the default Ratspeak build; skip with `--no-default-features` if you want to build without voice.

During development these repos resolve each other by relative path. Git is the easiest way to fetch them, but GitHub ZIP downloads also work if you extract and rename the folders to match this layout:

```bash
mkdir ratspeak-src
cd ratspeak-src

git clone https://github.com/ratspeak/rsReticulum
git clone https://github.com/ratspeak/rsLXMF
git clone https://github.com/ratspeak/lrgp-rs
git clone https://github.com/ratspeak/rsLXST
git clone https://github.com/ratspeak/Ratspeak
```

The folder should look like this:

```text
ratspeak-src/
|-- rsReticulum/
|-- rsLXMF/
|-- lrgp-rs/
|-- rsLXST/
`-- Ratspeak/
```

If you clone only `Ratspeak`, Cargo will fail because it cannot find the sibling protocol crates. The `rsLXST` sibling is only strictly required for the default build, which enables the experimental `lxst-voice` Cargo feature; pass `--no-default-features` to `cargo tauri dev` / `cargo tauri build` to build Ratspeak without voice and skip that clone.

## Common prerequisites

Install these first on every desktop platform:

1. **Git**, or GitHub ZIP downloads renamed to the folder layout above.
2. **Rust 1.85 or newer**, installed through [`rustup`](https://www.rust-lang.org/tools/install).
3. **Tauri v2 CLI**, installed with Cargo:

```bash
cargo install tauri-cli --version "^2.0.0" --locked
```

Check that the tools are visible in your terminal:

```bash
git --version
rustc --version
cargo --version
cargo tauri --version
```

Ratspeak's frontend is plain HTML, CSS, and JavaScript bundled into the Tauri app. There is no npm install step for this repo.

## Platform setup

### macOS desktop

Install Xcode Command Line Tools:

```bash
xcode-select --install
```

If you will also build iOS, install the full Xcode app from Apple, launch it once, and let it finish installing components.

### Linux desktop

Install the Tauri system packages for your distro. On Debian or Ubuntu:

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

Fedora, Arch, openSUSE, Alpine, and NixOS use different package names. Use the current [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) page for your distro before building Ratspeak.

### Windows desktop

Install:

1. **Git for Windows**. This also gives you Git Bash, which is useful for the CSS helper script.
2. **Microsoft C++ Build Tools** with the **Desktop development with C++** workload.
3. **Rust with the MSVC toolchain**. If Rust is already installed, run:

```powershell
rustup default stable-msvc
```

4. **Microsoft Edge WebView2 Runtime**, if your Windows install does not already include it.

Build commands can run from PowerShell. For the CSS step, use Git Bash or run the shell script through `bash`.

### Android

Android builds can be done from macOS, Linux, or Windows.

Install Android Studio. In Android Studio's SDK Manager, install:

- Android SDK Platform
- Android SDK Platform-Tools
- Android SDK Build-Tools
- Android SDK Command-line Tools
- NDK (Side by side)

Set `JAVA_HOME`, `ANDROID_HOME`, and `NDK_HOME` as described by [Tauri's Android prerequisites](https://v2.tauri.app/start/prerequisites/#android), then add the Android Rust targets:

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

For a physical device, enable Developer Options and USB debugging. `adb devices` should show the phone before you build or install.

### iOS

iOS builds require macOS and the full Xcode app. Command Line Tools alone are not enough.

Install the Rust iOS targets:

```bash
rustup target add aarch64-apple-ios x86_64-apple-ios aarch64-apple-ios-sim
```

Install CocoaPods:

```bash
brew install cocoapods
```

There is no public iOS download yet. Source builds are for local development, device testing, or later TestFlight packaging. For a physical iPhone or iPad, you also need an Apple developer team and a provisioning profile that can sign `org.ratspeak.ios`. Simulator builds do not need App Store distribution signing, but they are not enough to validate Bluetooth, Local Network, notifications, or background behavior.

## Build rsReticulum

Use this when you want the standalone Reticulum daemon and tools:

```bash
cd ratspeak-src/rsReticulum
cargo build --release
```

The binaries land in `target/release/`:

```text
rnsd-rs
rnstatus-rs
rnpath-rs
rnid-rs
rnprobe-rs
rncp-rs
rnsh-rs
rnodeconf-rs
```

Release builds use only `*-rs` command names so they can live beside other
Reticulum tools on `PATH` without ambiguity. Command names select the binary
only; config storage is controlled separately by the default resolver or by
`--config`.

Create a starter config and run the daemon:

```bash
mkdir -p ~/.rsReticulum
./target/release/rnsd-rs --exampleconfig > ~/.rsReticulum/config
./target/release/rnsd-rs --config ~/.rsReticulum
```

Open a second terminal to check it:

```bash
cd ratspeak-src/rsReticulum
./target/release/rnstatus-rs --config ~/.rsReticulum
```

Bare rsReticulum tools default to rsReticulum-specific config locations such as
`~/.rsReticulum`. Use `~/.reticulum` only when you intentionally want to share
an existing Reticulum config. If another daemon is running at the same time,
use a distinct shared-instance port pair in the config as well.

## Build rsLXMF

`rsLXMF` must sit next to `rsReticulum`, because it depends on the local Reticulum crates:

```bash
cd ratspeak-src/rsLXMF
cargo build --release
```

The `lxmd-rs` daemon lands in `target/release/`.

Create a starter config:

```bash
mkdir -p ~/.rsLXMF ~/.rsReticulum
./target/release/lxmd-rs --exampleconfig > ~/.rsLXMF/config
```

Run it:

```bash
./target/release/lxmd-rs --config ~/.rsLXMF --rnsconfig ~/.rsReticulum
```

If a Reticulum daemon using the same config is already running, `lxmd-rs` attaches to it over the shared-instance socket. If not, `lxmd-rs` starts an in-process Reticulum runtime from the directory supplied with `--rnsconfig`.

To send one message from a script:

```bash
./target/release/lxmd-rs --config ~/.rsLXMF --rnsconfig ~/.rsReticulum \
  --send <destination_hash> "hello from source"
```

## Build Ratspeak for desktop

First build the dashboard CSS:

```bash
cd ratspeak-src/Ratspeak
bash dashboard/build-css.sh
```

Run a development build:

```bash
cd src-tauri
cargo tauri dev
```

To build Ratspeak without the experimental voice stack (and without needing the `rsLXST` sibling checkout), add `--no-default-features`:

```bash
cargo tauri dev --no-default-features
```

Build release bundles:

```bash
cd ratspeak-src/Ratspeak
bash dashboard/build-css.sh
cd src-tauri
cargo tauri build
```

Outputs land under:

```text
Ratspeak/src-tauri/target/release/bundle/
```

The bundle type depends on the OS you built on: `.app` / `.dmg` on macOS, `.msi` / `.exe` on Windows, and `.AppImage` / `.deb` / `.rpm` on Linux.

## Build Ratspeak for Android

From the Ratspeak repo:

```bash
cd ratspeak-src/Ratspeak
bash scripts/build-android-prod.sh
```

That script rebuilds the CSS, clears development Tauri environment variables, and builds an APK. The debug APK path is:

```text
Ratspeak/src-tauri/gen/android/app/build/outputs/apk/arm64/debug/app-arm64-debug.apk
```

Install it on a connected device:

```bash
adb install -r src-tauri/gen/android/app/build/outputs/apk/arm64/debug/app-arm64-debug.apk
```

For an interactive mobile development run:

```bash
cd ratspeak-src/Ratspeak/src-tauri
cargo tauri android dev
```

## Build Ratspeak for iOS

Ratspeak does not currently offer a public iOS artifact. Build from source on macOS when you are doing local development or have provisioning access for `org.ratspeak.ios`.

From macOS:

```bash
cd ratspeak-src/Ratspeak
bash scripts/build-ios-prod.sh
```

That script rebuilds the CSS, clears development Tauri environment variables, and builds the iOS package. The IPA path is:

```text
Ratspeak/src-tauri/gen/apple/build/arm64/Ratspeak.ipa
```

For simulator or device development:

```bash
cd ratspeak-src/Ratspeak/src-tauri
cargo tauri ios dev
```

If a production iOS build opens to a blank page or tries to load a local dev server, check that `TAURI_CONFIG` and `TAURI_DEV_HOST` are not set in your shell. The production app must load the bundled asset protocol.

iOS platform notes:

- Local Network access is required for LAN peers. UDP multicast discovery also needs Apple's multicast networking entitlement in the signed provisioning profile; without it, local discovery can be limited.
- iOS apps cannot use general USB serial devices. Use Bluetooth RNode hardware or an RNode TCP bridge for LoRa on iPhone and iPad.
- Bluetooth, notifications, and camera/photo access all require the normal iOS permission prompts.
- Background execution is controlled by iOS. Ratspeak can use declared Bluetooth background modes, but it should not be treated as a headless always-on daemon.

## Mobile and the protocol repos

You do not separately install `rnsd-rs` or `lxmd-rs` on Android or iOS. Mobile Ratspeak embeds rsReticulum and rsLXMF as Rust libraries, then compiles them for the Android or iOS target as part of the app build.

If you are debugging protocol code for mobile, make the change in `rsReticulum` or `rsLXMF`, then rebuild Ratspeak for that mobile target. The sibling checkout is what makes that loop work.

## Common build problems

**Cargo cannot find `../rsReticulum`, `../rsLXMF`, `../lrgp-rs`, or `../rsLXST`.** The repos are not checked out as siblings. Move them into the layout shown at the top of this page. If you only see the error for `../rsLXST`, either clone that sibling too or pass `--no-default-features` to `cargo tauri dev` / `cargo tauri build` to build Ratspeak without the experimental voice stack.

**`cargo tauri` is not found.** Install the Tauri CLI with `cargo install tauri-cli --version "^2.0.0" --locked`, then open a new terminal.

**Linux fails on WebKit or appindicator packages.** Install the Tauri system dependencies for your distro. Package names changed with Tauri v2; Debian and Ubuntu need `libwebkit2gtk-4.1-dev`.

**Windows builds fail while compiling native code.** Make sure the Visual Studio Build Tools workload is **Desktop development with C++**, and that Rust is using the MSVC toolchain.

**Android builds cannot find the NDK.** Reopen the terminal after setting `ANDROID_HOME`, `NDK_HOME`, and `JAVA_HOME`, then confirm `adb devices` works.

**iOS signing fails.** Check the Xcode project signing team and provisioning profile. The current iOS bundle identifier is `org.ratspeak.ios`. Multicast local discovery also requires Apple's multicast networking entitlement.
