#!/usr/bin/env python3
"""Record rsNode's USB answers for the web flasher's device view tests.

Builds a host model of rsNode from its own code: the RNode host adapter
(crates/rsnode-core), the owner status the firmware returns over USB
(crates/rsnode-management, crates/rsnode-transport) and the Heltec screen
renderer (firmware/common/src/display.rs). Each request the page sends is
encoded as rsNode's scripts encode it and answered by that model; screens are
read back with probe-heltec-v4.py's own PNG export. No device is touched and
rsNode is only read. Needs cargo. Regenerate when those sources change:

  python3 -B scripts/rsnode-device-vectors.py --rsnode-source ../rsNode \\
      --output tests/fixtures/rsnode-device-vectors.json
"""

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import zlib

SOURCES = [
    "crates/rsnode-core/src/host.rs",
    "crates/rsnode-core/src/constants.rs",
    "crates/rsnode-core/src/ui.rs",
    "crates/rsnode-management/src/node_identity.rs",
    "firmware/common/src/display.rs",
    "firmware/common/src/manage_service.rs",
    "scripts/probe-heltec-v4.py",
    "scripts/smoke-rsnode-usb.py",
    "scripts/provision-rsnode.py",
    "scripts/configure-transport-ifac.py",
    "scripts/configure-saved-radio.py",
    "scripts/validate-rf-link.py",
]
SCREEN_WIDTH = 128
SCREEN_HEIGHT = 64

CARGO_TOML = """\
[package]
name = "rsnode-device-model"
version = "0.0.0"
edition = "2024"
publish = false

[features]
default = ["wifi-bridge"]
wifi-bridge = []

[dependencies]
embedded-hal = "1"
rsnode-core = {{ path = "{root}/crates/rsnode-core" }}
rsnode-management = {{ path = "{root}/crates/rsnode-management", default-features = false }}
rsnode-transport = {{ path = "{root}/crates/rsnode-transport" }}

[workspace]
"""

# rsNode as the USB host sees it, one command per stdin line; every answer ends with ".".
HARNESS = r"""
mod ui {
    pub use rsnode_core::ui::*;
}

#[path = "@DISPLAY@"]
#[allow(dead_code, unused_imports)]
mod display;

use std::io::{self, BufRead, Write};

use display::{DISPLAY_BYTES, Display, DisplayError, Panel};
use rsnode_core::airtime::AirtimeStats;
use rsnode_core::constants::*;
use rsnode_core::RadioProfile;
use rsnode_core::host::{
    BoardIdentity, DisplayAction, HostAction, RNodeHostAdapter, RadioReadout, ReadOnlyReply,
};
use rsnode_core::kiss::{FeedResult, Frame, KissDecoder, encode_frame};
use rsnode_core::rssi::RssiStats;
use rsnode_core::ui::{
    HomeNotice, MenuItem, TransportUiState, TransportUiStats, UiFrame, UiLinkTransport, UiScreen,
};
use rsnode_management::node_identity::{
    MANAGE_DESTINATION_NAME, NODE_PRIVATE_KEY_LEN, NODE_STATUS_MAX, NodeIdentityRecord,
    OwnerCommandError, apply_owner_command, decode_owner_command, encode_node_status,
    owner_subcommand,
};
use rsnode_transport::identity::LocalIdentity;

struct NullPanel;

impl Panel for NullPanel {
    fn init(&mut self, _: u8, _: u8) -> Result<(), DisplayError> {
        Ok(())
    }
    fn set_address(&mut self, _: u8) {}
    fn set_intensity(&mut self, _: u8) -> Result<(), DisplayError> {
        Ok(())
    }
    fn set_rotation(&mut self, _: u8) -> Result<(), DisplayError> {
        Ok(())
    }
    fn blank(&mut self, _: bool) -> Result<(), DisplayError> {
        Ok(())
    }
    fn present(&mut self, _: &[u8; DISPLAY_BYTES]) -> Result<(), DisplayError> {
        Ok(())
    }
}

struct Device {
    identity: BoardIdentity,
    host: RNodeHostAdapter,
    display: Display<NullPanel>,
    decoder: KissDecoder<2300>,
    owners: bool,
    record: Option<NodeIdentityRecord>,
    entropy: [u8; NODE_PRIVATE_KEY_LEN],
    repeater: Option<RadioReadout>,
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn unhex(text: &str) -> Vec<u8> {
    (0..text.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&text[i..i + 2], 16).expect("hex"))
        .collect()
}

fn encoded(encode: impl FnOnce(&mut [u8]) -> usize) -> Vec<u8> {
    let mut out = [0u8; 2300];
    let len = encode(&mut out);
    out[..len].to_vec()
}

impl Device {
    fn new(board: &str, name: &str) -> Self {
        let (identity, host) = match board {
            "heltec-v3" => (BoardIdentity::HELTEC_V3, RNodeHostAdapter::heltec_v3()),
            "heltec-v4" => (BoardIdentity::HELTEC_V4, RNodeHostAdapter::heltec_v4()),
            "t-echo" => (BoardIdentity::T_ECHO, RNodeHostAdapter::t_echo()),
            other => panic!("unknown board {other}"),
        };
        let mut device = Self {
            identity,
            host,
            display: Display::from_panel(NullPanel),
            decoder: KissDecoder::new(),
            owners: true,
            record: None,
            entropy: [0; NODE_PRIVATE_KEY_LEN],
            repeater: None,
        };
        let mut device_name = *b"RNode 0000";
        device_name[6..].copy_from_slice(name.as_bytes());
        device.host.set_device_name(device_name);
        device
    }

    // The firmware's USB frame path: owner subcommands go to the identity sector
    // (manage_service::usb_owner_command), everything else to the host adapter. A
    // Repeater answers read-only, as its main loop does.
    fn route(&mut self, command: u8, payload: &[u8]) -> Vec<u8> {
        if let Some(readout) = self.repeater {
            let mut response = [0u8; 2300];
            let frame = Frame { command, payload };
            return match self.host.handle_read_only_frame(frame, &mut response, readout) {
                ReadOnlyReply::Respond(len) => response[..len].to_vec(),
                ReadOnlyReply::NodeRead => self.owner_command(payload),
                ReadOnlyReply::Silent => Vec::new(),
            };
        }
        if command == CMD_TRANSPORT_CFG && owner_subcommand(payload) {
            return if self.owners {
                self.owner_command(payload)
            } else {
                encoded(|out| encode_frame(CMD_ERROR, &[ERROR_INVALID_CONFIG], out).unwrap())
            };
        }
        let mut response = [0u8; 2300];
        let Ok(outcome) = self.host.handle_frame(Frame { command, payload }, &mut response) else {
            return Vec::new();
        };
        match outcome.action {
            HostAction::SetRadioState(_) => {
                encoded(|out| self.host.encode_radio_state(out).unwrap())
            }
            HostAction::Display(DisplayAction::ReadDisplay | DisplayAction::ReadFramebuffer) => {
                let reply = response[..outcome.response_len].to_vec();
                self.display.mirror_readback(&mut self.host);
                reply
            }
            _ => response[..outcome.response_len].to_vec(),
        }
    }

    fn owner_command(&mut self, payload: &[u8]) -> Vec<u8> {
        let error = |code: u8| encoded(|out| encode_frame(CMD_ERROR, &[code], out).unwrap());
        let Some(command) = decode_owner_command(payload) else {
            return error(ERROR_INVALID_CONFIG);
        };
        let entropy = self.entropy;
        match apply_owner_command(self.record.as_ref(), command, || Some(entropy)) {
            Ok(Some(next)) => self.record = Some(next),
            Ok(None) => {}
            Err(OwnerCommandError::Entropy) => return error(ERROR_INITRADIO),
            Err(OwnerCommandError::Owners(_)) => return error(ERROR_INVALID_CONFIG),
        }
        let destination = self.record.as_ref().map(|record| {
            LocalIdentity::from_private_key(&record.private_key)
                .destination_hash(MANAGE_DESTINATION_NAME)
        });
        let mut status = [0u8; NODE_STATUS_MAX];
        let len = encode_node_status(self.record.as_ref(), destination, &mut status);
        encoded(|out| encode_frame(CMD_TRANSPORT_CFG, &status[..len], out).unwrap())
    }

    fn render(&mut self, args: &[&str]) {
        let screen = match args[0] {
            "home" => UiScreen::Home,
            "pairing" => UiScreen::Pairing,
            "usb-ready" => UiScreen::UsbReady,
            "link" => UiScreen::Link,
            "repeater" => UiScreen::Transport,
            other => panic!("unknown screen {other}"),
        };
        let selected = match args[1] {
            "bluetooth" => MenuItem::Bluetooth,
            "usb" => MenuItem::Usb,
            "network" => MenuItem::Network,
            "transport" => MenuItem::Transport,
            "power-off" => MenuItem::PowerOff,
            other => panic!("unknown menu item {other}"),
        };
        let link_transport = match args[2] {
            "usb" => UiLinkTransport::Usb,
            "ble" => UiLinkTransport::Ble,
            "wifi" => UiLinkTransport::Wifi,
            other => panic!("unknown transport {other}"),
        };
        let pairing_code: u32 = args[4].parse().unwrap();
        let mut pairing_id = [0u8; 4];
        pairing_id.copy_from_slice(&self.host.device_name()[6..10]);
        let mut frame = UiFrame {
            screen,
            selected,
            home_notice: HomeNotice::None,
            hold_progress: args[5].parse().unwrap(),
            pairing_code,
            pairing_code_valid: pairing_code != 0,
            pairing_id,
            pairing_remaining_seconds: 30,
            pairing_remaining_percent: 60,
            link_transport,
            radio_online: args[3] == "1",
            bluetooth_paired: false,
            transport_ui: TransportUiState::new(),
            repeater_ui: rsnode_core::repeater_ui::RepeaterUi::new(),
            transport_stats: TransportUiStats::default(),
        };
        if let Some(readout) = self.repeater {
            frame.repeater_ui.set_running();
            frame.transport_stats.active = readout.radio_online;
            frame.transport_stats.accepted = readout.rx_packets;
            frame.transport_stats.transmitted = readout.tx_packets;
        }
        self.display.render_ui(&mut self.host, frame).unwrap();
    }

    fn state(&self, out: &mut impl Write) {
        let state = self.host.state();
        let stats = &state.stats;
        // The radio as a USB host reads it: a Repeater's own, else the RNode host state.
        let radio = self.repeater.unwrap_or_else(|| self.host.radio_readout());
        let channel = &radio.channel;
        let identity = self.identity;
        let mut field = |key: &str, value: String| writeln!(out, "state {key} {value}").unwrap();
        field("board", identity.board.to_string());
        field("platform", identity.platform.to_string());
        field("mcu", identity.mcu.to_string());
        field("firmwareMajor", identity.firmware_major.to_string());
        field("firmwareMinor", identity.firmware_minor.to_string());
        field("deviceName", String::from_utf8_lossy(self.host.device_name()).replace(' ', "_"));
        field("firmwareHash", hex(self.host.firmware_hash()));
        field("frequency", radio.frequency_hz.to_string());
        field("bandwidth", radio.bandwidth_hz.to_string());
        field("txPower", radio.tx_power_dbm.to_string());
        field("spreadingFactor", radio.spreading_factor.to_string());
        field("codingRate", radio.coding_rate_denominator.to_string());
        field("online", radio.radio_online.to_string());
        field("rx", radio.rx_packets.to_string());
        field("tx", radio.tx_packets.to_string());
        field("lastRssi", radio.last_rssi_dbm.to_string());
        field("lastSnrRaw", radio.last_snr_raw.to_string());
        field("airtimeShort", channel.short_airtime_bps.to_string());
        field("airtimeLong", channel.long_airtime_bps.to_string());
        field("loadShort", channel.short_channel_load_bps.to_string());
        field("loadLong", channel.long_channel_load_bps.to_string());
        field("currentRssi", channel.current_rssi_dbm.to_string());
        field("noiseFloor", channel.noise_floor_dbm.to_string());
        field("interference", channel.interference_dbm.map_or("null".into(), |dbm| dbm.to_string()));
        field("batteryState", stats.battery.state.to_string());
        field("batteryPercent", stats.battery.percent.to_string());
        field("bluetoothEnabled", state.bluetooth_enabled.to_string());
        field("bluetoothPairing", state.bluetooth_pairing.to_string());
    }

    fn command(&mut self, line: &str, out: &mut impl Write) {
        let parts: Vec<&str> = line.split_whitespace().collect();
        match parts[0] {
            "owners" => self.owners = parts[1] == "on",
            "entropy" => self.entropy.copy_from_slice(&unhex(parts[1])),
            "firmware" => self.host.set_firmware_hash(unhex(parts[1]).try_into().unwrap()),
            "transport" => {
                self.host
                    .ensure_transport_config(unhex(parts[1]).try_into().unwrap())
                    .unwrap();
            }
            // The Repeater persona on a saved profile: frequency bandwidth sf cr power, online, RX, TX.
            "repeater" => {
                let value = |index: usize| parts[index].parse::<u32>().unwrap();
                let profile = RadioProfile {
                    frequency_hz: value(1),
                    bandwidth_hz: value(2),
                    spreading_factor: value(3) as u8,
                    coding_rate_denominator: value(4) as u8,
                    tx_power_dbm: value(5) as i8,
                    ..RadioProfile::RATSPEAK_LONG_FAST_915
                };
                let mut config = self.host.transport_config().expect("transport first");
                config.boot_mode = true;
                config.radio_profile = Some(profile);
                self.host.store_transport_config(config).unwrap();
                self.repeater = Some(RadioReadout::repeater(
                    Some(profile),
                    parts[6] == "1",
                    value(7),
                    value(8),
                ));
            }
            "host" => {
                for byte in unhex(parts[1]) {
                    if self.decoder.feed(byte) != FeedResult::Frame {
                        continue;
                    }
                    let Some(frame) = self.decoder.frame() else {
                        continue;
                    };
                    let (command, payload) = (frame.command, frame.payload.to_vec());
                    let reply = self.route(command, &payload);
                    writeln!(out, "reply {}", hex(&reply)).unwrap();
                }
            }
            "rssi" => self.host.set_rssi_stats(RssiStats {
                current_dbm: parts[1].parse().unwrap(),
                noise_floor_dbm: parts[2].parse().unwrap(),
                interference_dbm: parts[3].parse().ok(),
            }),
            "airtime" => {
                let value = |index: usize| parts[index].parse().unwrap();
                self.host.set_airtime_stats(AirtimeStats {
                    short_airtime_bps: value(1),
                    long_airtime_bps: value(2),
                    short_channel_load_bps: value(3),
                    long_channel_load_bps: value(4),
                });
            }
            "battery" => {
                self.host
                    .set_battery_stats(parts[1].parse().unwrap(), parts[2].parse().unwrap());
                let frame = encoded(|out| self.host.encode_battery_stats(out).unwrap());
                writeln!(out, "async {}", hex(&frame)).unwrap();
            }
            // A received packet, framed as the firmware delivers it to the host.
            "receive" => {
                let rssi: i16 = parts[1].parse().unwrap();
                self.host.state_mut().stats.last_rssi_dbm = rssi;
                self.host.state_mut().stats.last_snr_raw = parts[2].parse::<i8>().unwrap() as u8;
                self.display.push_rx_waterfall(rssi);
                for frame in [
                    encoded(|out| self.host.encode_stat_rssi(out).unwrap()),
                    encoded(|out| self.host.encode_stat_snr(out).unwrap()),
                    encoded(|out| self.host.encode_rx_data(&unhex(parts[3]), out).unwrap()),
                ] {
                    writeln!(out, "async {}", hex(&frame)).unwrap();
                }
            }
            "waterfall" => match parts[1] {
                "rx" => self.display.push_rx_waterfall(parts[2].parse().unwrap()),
                _ => self
                    .display
                    .push_tx_waterfall(parts[2] != "0", parts[2].parse().unwrap()),
            },
            "render" => self.render(&parts[1..]),
            "state" => self.state(out),
            other => panic!("unknown command {other}"),
        }
    }
}

fn main() {
    let stdin = io::stdin();
    let mut out = io::stdout().lock();
    let mut device: Option<Device> = None;
    for line in stdin.lock().lines() {
        let line = line.unwrap();
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts[0] == "device" {
            device = Some(Device::new(parts[1], parts[2]));
        } else {
            device.as_mut().expect("device first").command(&line, &mut out);
        }
        writeln!(out, ".").unwrap();
        out.flush().unwrap();
    }
}
"""


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def build_model(root, scratch):
    (scratch / "src").mkdir(parents=True)
    (scratch / "Cargo.toml").write_text(CARGO_TOML.format(root=root), encoding="utf-8")
    (scratch / "src/main.rs").write_text(
        HARNESS.replace("@DISPLAY@", str(root / "firmware/common/src/display.rs")), encoding="utf-8")
    # rsNode's own lock file pins the model's dependencies.
    shutil.copy(root / "Cargo.lock", scratch / "Cargo.lock")
    command = ["cargo", "build", "--release", "--quiet", "--manifest-path", str(scratch / "Cargo.toml")]
    if subprocess.run([*command, "--offline"], capture_output=True).returncode:
        subprocess.run(command, check=True)
    return scratch / "target/release/rsnode-device-model"


class Model:
    def __init__(self, binary):
        self.process = subprocess.Popen([binary], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)

    def __call__(self, line):
        self.process.stdin.write(line + "\n")
        self.process.stdin.flush()
        lines = []
        while (answer := self.process.stdout.readline()) != ".\n":
            if not answer:
                raise SystemExit(f"the rsNode model stopped at: {line}")
            lines.append(answer.rstrip("\n"))
        return lines

    def ask(self, frame):
        """The device's reply to one host frame; empty when it sends none."""
        [answer] = self(f"host {frame.hex()}")
        return bytes.fromhex(answer.removeprefix("reply "))

    def asynchronous(self, line):
        return [answer.removeprefix("async ") for answer in self(line)]

    def state(self):
        values = {}
        for answer in self("state"):
            _, key, value = answer.split(" ", 2)
            values[key] = value.replace("_", " ") if key in ("deviceName", "firmwareHash") else json.loads(value)
        return values

    def close(self):
        self.process.stdin.close()
        self.process.wait()


def frame_payload(probe, frame):
    """A reply as probe-heltec-v4.py reads it off the wire."""

    class Wire:
        def __init__(self, data):
            self.data = bytearray(data)

        def read(self, _size):
            if not self.data:
                return b""
            byte = bytes(self.data[:1])
            del self.data[:1]
            return byte

    return probe.read_frame(Wire(frame), time.monotonic() + 1)


def screen_rows(probe, scratch, payload, board):
    """The screen as probe-heltec-v4.py exports it, one packed hex row per pixel row."""
    path = scratch / "screen.png"
    probe.write_display_png(path, payload, board)
    png = path.read_bytes()
    width, height = struct.unpack(">II", png[16:24])
    assert (width, height) == (SCREEN_WIDTH, SCREEN_HEIGHT) and png[24:26] == b"\x08\x00"
    chunks, offset = [], 8
    while offset < len(png):
        length, kind = struct.unpack(">I4s", png[offset:offset + 8])
        if kind == b"IDAT":
            chunks.append(png[offset + 8:offset + 8 + length])
        offset += 12 + length
    pixels = zlib.decompress(b"".join(chunks))
    rows = []
    for y in range(height):
        line = pixels[y * (width + 1):(y + 1) * (width + 1)]
        assert line[0] == 0, "the probe writes unfiltered rows"
        bits = bytearray(width // 8)
        for x, value in enumerate(line[1:]):
            if value:
                bits[x // 8] |= 0x80 >> (x % 8)
        rows.append(bits.hex())
    return rows


def requests(probe, provision, ifac, saved):
    """Every frame the page writes, encoded as the named rsNode script writes it."""
    encode = probe.encode
    return {
        # probe-heltec-v4.py: its probe and --extended checks, --display-read, --bt-pair and --leave.
        "detect": encode(probe.CMD_DETECT, bytes([probe.DETECT_REQ])),
        "board": encode(probe.CMD_BOARD),
        "platform": encode(probe.CMD_PLATFORM),
        "mcu": encode(probe.CMD_MCU),
        "firmware": encode(probe.CMD_FW_VERSION),
        "fw_hash": encode(probe.CMD_HASHES, b"\x02"),
        "radio_state": encode(probe.CMD_RADIO_STATE),
        "frequency": encode(probe.CMD_FREQUENCY),
        "bandwidth": encode(probe.CMD_BANDWIDTH),
        "sf": encode(probe.CMD_SF),
        "cr": encode(probe.CMD_CR),
        "tx_power": encode(probe.CMD_TXPOWER),
        "stat_rx": encode(probe.CMD_STAT_RX),
        "stat_tx": encode(probe.CMD_STAT_TX),
        "stat_rssi": encode(probe.CMD_STAT_RSSI),
        "stat_snr": encode(probe.CMD_STAT_SNR),
        "stat_chtm": encode(probe.CMD_STAT_CHTM),
        "stat_bat": encode(probe.CMD_STAT_BAT),
        "disp_read": encode(probe.CMD_DISP_READ, b"\x01"),
        "bt_pair": encode(probe.CMD_BT_CTRL, b"\x02"),
        "leave": encode(probe.CMD_LEAVE, b"\xff"),
        # provision-rsnode.py --read.
        "read_mgmt": provision.encode(provision.CMD_TRANSPORT_CFG, bytes([provision.TRANSPORT_CFG_READ_MGMT])),
        "read_node": provision.encode(provision.CMD_TRANSPORT_CFG, bytes([provision.TRANSPORT_CFG_READ_NODE])),
        # configure-transport-ifac.py --read.
        "transport": ifac.encode_frame(ifac.CMD_TRANSPORT_CFG, bytes([ifac.TRANSPORT_CFG_READ])),
        # configure-saved-radio.py --reset.
        "reset": saved.encode(saved.CMD_RESET, bytes((saved.RESET_MAGIC,))),
    }


PRIMARY = bytes.fromhex("c0db" + "11" * 14)
HELPER = bytes.fromhex("33" * 15 + "c0")

# name, board, node id, setup, screens. Setup lines go to the model; "frame" entries are
# host frames the named script writes, sent before the page connects.
SCENARIOS = [
    ("Heltec V4 on its home menu, provisioned", "heltec-v4", "887A", [
        ("frame", "set_psk"), ("frame", "set_key"), ("frame", "add_primary"), ("frame", "add_helper"),
        ("model", "battery 1 84"),
    ], [
        ("home, USB selected", "home usb usb 0 0 0"),
        ("home, Bluetooth selected", "home bluetooth usb 0 0 0"),
        ("home, MANAGE selected", "home network usb 0 0 0"),
        ("home, holding REPEATER", "home transport usb 0 0 4"),
        ("USB ready", "usb-ready usb usb 0 0 0"),
    ]),
    ("Heltec V3 carrying a Bluetooth host's traffic", "heltec-v3", "0F3C", [
        ("frame", "set_psk"), ("model", "transport " + "5a" * 16), ("frame", "set_ifac"),
        ("frame", "radio_off"), ("frame", "set_frequency"), ("frame", "set_bandwidth"), ("frame", "set_sf"),
        ("frame", "set_cr"), ("frame", "set_tx_power"), ("frame", "radio_on"),
        ("frame", "data"), ("frame", "data"), ("frame", "data"),
        ("model", "waterfall tx 14"), ("model", "waterfall tx 0"), ("model", "waterfall tx 14"),
        ("model", "receive -104 22 " + "aa" * 40), ("model", "waterfall rx -109"),
        ("model", "receive -117 -18 " + "bb" * 64),
        ("model", "rssi -118 -121 none"), ("model", "airtime 123 456 234 345"),
        ("model", "battery 2 76"),
    ], [
        ("Bluetooth link", "link transport ble 1 0 0"),
        ("Bluetooth pairing", "pairing bluetooth ble 0 482913 0"),
    ]),
    ("Heltec V4 running as a Repeater", "heltec-v4", "B44E", [
        ("frame", "set_psk"), ("frame", "add_primary"), ("model", "transport " + "6b" * 16),
        ("model", "repeater 869525000 125000 9 6 14 1 1234 56"), ("model", "battery 1 84"),
    ], [
        ("Repeater running", "repeater transport usb 1 0 0"),
    ]),
    ("T-Echo without a screen mirror", "t-echo", "5D21", [
        ("model", "owners off"),
    ], []),
]


def setup_frames(probe, provision, ifac):
    """Frames an earlier session wrote, as the scripts that own them write them."""
    psk_command = bytes([provision.TRANSPORT_CFG_SET_MGMT_AP_PSK]) + b"vector-psk-0001"
    key = bytes(range(0xC0, 0xE0))
    owner = lambda kind, role, value: provision.encode(
        provision.CMD_TRANSPORT_CFG, bytes([provision.TRANSPORT_CFG_ADD_OWNER, kind, role]) + value)
    return {
        "set_psk": provision.encode(provision.CMD_TRANSPORT_CFG, psk_command),
        "set_key": provision.encode(provision.CMD_TRANSPORT_CFG, bytes([provision.TRANSPORT_CFG_SET_MGMT_KEY]) + key),
        "add_primary": owner(provision.OWNER_KIND_LXMF, provision.ROLE_PRIMARY, PRIMARY),
        "add_helper": owner(provision.OWNER_KIND_IDENTITY, provision.ROLE_HELPER, HELPER),
        "set_ifac": ifac.encode_frame(ifac.CMD_TRANSPORT_CFG, bytes([ifac.TRANSPORT_CFG_SET_IFAC, 8]) +
                                      ifac.derive_ifac_key("rsnode-vectors", "testing")),
        # probe-heltec-v4.py --radio-on with an explicit profile.
        "radio_off": probe.encode(probe.CMD_RADIO_STATE, b"\x00"),
        "set_frequency": probe.encode(probe.CMD_FREQUENCY, (915_000_000).to_bytes(4, "big")),
        "set_bandwidth": probe.encode(probe.CMD_BANDWIDTH, (250_000).to_bytes(4, "big")),
        "set_sf": probe.encode(probe.CMD_SF, bytes((9,))),
        "set_cr": probe.encode(probe.CMD_CR, bytes((5,))),
        "set_tx_power": probe.encode(probe.CMD_TXPOWER, bytes((14,))),
        "radio_on": probe.encode(probe.CMD_RADIO_STATE, b"\x01"),
        "data": probe.encode(0x00, b"\x5a" * 32),
    }


def run_scenario(model, modules, scratch, name, board, node_id, setup, screens):
    probe, provision, ifac, saved, smoke, rf = modules
    frames = setup_frames(probe, provision, ifac)
    model(f"device {board} {node_id}")
    model("entropy " + hashlib.sha512(node_id.encode()).hexdigest())
    model("firmware " + hashlib.sha256(f"rsnode {board}".encode()).hexdigest())
    unsolicited = []
    for kind, value in setup:
        if kind == "frame":
            model.ask(frames[value])
        else:
            unsolicited += model.asynchronous(value)
    table = requests(probe, provision, ifac, saved)
    replies = {}
    for request, frame in table.items():
        if request in ("disp_read", "bt_pair", "leave", "reset"):
            continue
        reply = model.ask(frame)
        replies[request] = {"host": frame.hex(), "device": reply.hex()}
    device = model.state()
    management = provision.parse_management_status(frame_payload(probe, bytes.fromhex(replies["read_mgmt"]["device"]))[1])
    node_reply = frame_payload(probe, bytes.fromhex(replies["read_node"]["device"]))
    node = provision.parse_node_status(node_reply[1]) if node_reply[0] == provision.CMD_TRANSPORT_CFG else None
    transport = ifac.render_status(frame_payload(probe, bytes.fromhex(replies["transport"]["device"]))[1])
    channel = rf.decode_stat_payload(rf.CMD_STAT_CHTM, frame_payload(probe, bytes.fromhex(replies["stat_chtm"]["device"]))[1])
    preset = next((key for key, value in smoke.BOARD_PRESETS.items() if value.get("board") == f"{device['board']:02x}"), None)
    rendered = []
    for screen_name, screen in screens:
        model(f"render {screen}")
        reply = model.ask(table["disp_read"])
        command, payload = frame_payload(probe, reply)
        assert command == probe.CMD_DISP_READ
        rendered.append({"name": screen_name, "device": reply.hex(), "rows": screen_rows(probe, scratch, payload, device["board"])})
    # --bt-pair changes the node, so it is asked after every read, with what it left behind.
    replies["bt_pair"] = {"host": table["bt_pair"].hex(), "device": model.ask(table["bt_pair"]).hex()}
    after = model.state()
    replies["bt_pair"]["bluetooth"] = {"enabled": after["bluetoothEnabled"], "pairing": after["bluetoothPairing"]}
    for request in ("leave", "reset"):
        replies[request] = {"host": table[request].hex(), "device": model.ask(table[request]).hex()}
    replies["disp_read"] = {"host": table["disp_read"].hex(), "device": None}
    unsupported = None
    if not screens:
        try:
            probe.write_display_png(scratch / "screen.png", bytes(1024), device["board"])
        except ValueError as error:
            unsupported = str(error)
    return {
        "name": name,
        "preset": preset,
        "device": device,
        "management": as_json(management),
        "node": as_json(node),
        "transport": transport,
        "channel": channel,
        "requests": replies,
        "unsolicited": unsolicited,
        "screens": rendered,
        "screenUnsupported": unsupported,
    }


def transport_vectors(ifac):
    """Repeater record status payloads and configure-transport-ifac.py's verdict on each."""
    payloads = [bytes([0, 0, 0, 0, 0, 0, 0]), bytes([0, 1, 1, 1, 1, 1, 8]), bytes([0, 0, 1, 1, 1, 0, 64]),
                bytes([0, 0, 0, 0, 0, 0]), bytes([0, 0, 0, 0, 0, 0, 0, 0]), bytes([5, 0, 0, 0, 0, 0, 0]),
                bytes([0, 2, 0, 0, 0, 0, 0]), bytes([0, 0, 0, 0, 0, 1, 0]), bytes([0, 0, 0, 0, 0, 0, 8]),
                bytes([0, 0, 0, 0, 1, 1, 0]), bytes([0, 0, 0, 0, 1, 0, 65])]
    vectors = []
    for payload in payloads:
        try:
            vectors.append({"payload": payload.hex(), "line": ifac.render_status(payload)})
        except ValueError as error:
            vectors.append({"payload": payload.hex(), "error": str(error)})
    return vectors


def as_json(value):
    if isinstance(value, bytes):
        return value.hex()
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, (list, tuple)):
        return [as_json(item) for item in value]
    return {re.sub(r"_(\w)", lambda m: m.group(1).upper(), key): as_json(item)
            for key, item in vars(value).items()}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--rsnode-source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    sys.dont_write_bytecode = True
    root = args.rsnode_source.resolve()
    sys.path.insert(0, str(root / "scripts"))
    modules = (
        load("rsnode_probe", root / "scripts/probe-heltec-v4.py"),
        load("rsnode_provision", root / "scripts/provision-rsnode.py"),
        load("rsnode_ifac", root / "scripts/configure-transport-ifac.py"),
        load("rsnode_saved_radio", root / "scripts/configure-saved-radio.py"),
        load("rsnode_smoke", root / "scripts/smoke-rsnode-usb.py"),
        load("rsnode_rf_link", root / "scripts/validate-rf-link.py"),
    )
    with tempfile.TemporaryDirectory() as directory:
        scratch = Path(directory)
        model = Model(build_model(root, scratch / "model"))
        try:
            scenarios = [run_scenario(model, modules, scratch, *scenario) for scenario in SCENARIOS]
        finally:
            model.close()
    fixture = {
        "source": {path: hashlib.sha256((root / path).read_bytes()).hexdigest() for path in SOURCES},
        "presets": modules[4].BOARD_PRESETS,
        "scenarios": scenarios,
        "transportReplies": transport_vectors(modules[2]),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(fixture, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
