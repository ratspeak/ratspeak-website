// rsNode's screen and status over USB KISS, asked as rsNode's scripts ask: the screen mirror
// as probe-heltec-v4.py --display-read, the radio as its --extended checks. Managers come from
// rsnode-provision.js; the node's own status from CMD_RSNODE (rsNode ADR 0015), which older
// betas do not answer. tests/fixtures/rsnode-device-vectors.json records rsNode's own answers.
import { rsnodeBoardForTarget } from './rsnode-beta.js';
import { readManagementStatus, readNodeStatus, renderNode } from './rsnode-provision.js';

const CMD_FREQUENCY = 0x01;
const CMD_BANDWIDTH = 0x02;
const CMD_TXPOWER = 0x03;
const CMD_SF = 0x04;
const CMD_CR = 0x05;
const CMD_RADIO_STATE = 0x06;
const CMD_DETECT = 0x08;
const CMD_LEAVE = 0x0a;
const CMD_STAT_RX = 0x21;
const CMD_STAT_TX = 0x22;
const CMD_STAT_RSSI = 0x23;
const CMD_STAT_SNR = 0x24;
const CMD_STAT_CHTM = 0x25;
const CMD_STAT_BAT = 0x27;
const CMD_BT_CTRL = 0x46;
const CMD_BOARD = 0x47;
const CMD_PLATFORM = 0x48;
const CMD_MCU = 0x49;
const CMD_FW_VERSION = 0x50;
const CMD_RESET = 0x55;
const CMD_HASHES = 0x60;
const CMD_BT_PIN = 0x62;
const CMD_DISP_READ = 0x66;
const CMD_ERROR = 0x90;
const CMD_TRANSPORT_CFG = 0x6f;
const CMD_RSNODE = 0x7a;
const SUB_STATUS = 0x01;
const DETECT_REQ = 0x73;
const DETECT_RESP = 0x46;
const HASH_FIRMWARE = 0x02;
const BT_PAIRING = 0x02;
const TRANSPORT_READ = 0x00;
const RESET_BYTE = 0xf8;
const RSSI_OFFSET = 157;
// rsNode's -292 dBm "no reading" wraps to 0x79 on the wire; 0x80 is its "no packet" SNR.
const RSSI_SENTINEL = 0x79;
const SNR_UNKNOWN = 0x80;
const INTERFERENCE_NONE = 0xff;
export const SCREEN_WIDTH = 128;
export const SCREEN_HEIGHT = 64;
const SCREEN_BYTES = SCREEN_WIDTH * SCREEN_HEIGHT / 8;
const BOARDS = { 0x3a: 'Heltec V3', 0x3c: 'Heltec T114', 0x3f: 'Heltec V4', 0x44: 'T-Echo', 0x51: 'RAK4631' };
// Heltec V3 and V4 mirror their whole 128x64 UI; T-Echo and T114 return part of a larger panel.
// A board with no screen can answer as one of these: rsnodeScreenless reads its STATUS instead.
const SCREEN_BOARDS = [0x3a, 0x3f];
const PLATFORMS = { 0x70: 'nRF52', 0x80: 'ESP32' };
const BATTERY_STATES = { 1: 'discharging', 2: 'charging', 3: 'charged' };
const ROLE_PRIMARY = 1;
const ROLE_HELPER = 2;
const PAIRING_CODE_MAX = 999999;
const DETECT_POLL_MS = 1000;
const EXCHANGE_TIMEOUT_MS = 2000;
const WAIT_TIMEOUT_MS = 30000;
// A refusal comes straight back; an accepted pairing or reset sends nothing.
const REFUSAL_WAIT_MS = 500;
// Older betas leave CMD_RSNODE unanswered as an RNode and refuse it as a Repeater.
const STATUS_WAIT_MS = 1500;

/** CMD_RSNODE result codes: rsNode's link_commands::CommandResult. */
export const RSNODE_RESULT = Object.freeze({ ok: 0, denied: 1, invalid: 2, busy: 5, unsupported: 6, storage: 7,
  rejected: 8, refused: 9, unavailable: 10, gap: 11 });
/** STATUS host owner: who holds an RNode. */
export const HOST_OWNERS = Object.freeze({ 0: null, 1: 'USB', 2: 'Bluetooth', 3: 'Wi-Fi' });
// ManageStatus tags with fixed lengths; a known tag of another length is malformed, unknown tags are skipped.
// The node facts (0x10) gained a forwarding byte after 1.0.0.
const STATUS_LENGTHS = { 0x01: [3], 0x02: [6], 0x03: [8], 0x04: [9], 0x05: [4], 0x06: [2], 0x07: [25], 0x08: [1], 0x09: [4],
  0x0a: [22], 0x0b: [9], 0x0c: [6], 0x0d: [2], 0x0e: [36], 0x10: [4, 5] };
const RELEASE_MAX = 24;
const WIFI_READY = 0x01;
const OTA_NEARBY_ONLY = 0x02;
const OTA_TRIAL = 0x04;

const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const hexByte = byte => '0x' + byte.toString(16).padStart(2, '0');
const u16 = (bytes, offset) => (bytes[offset] << 8) | bytes[offset + 1];
const u32 = (bytes, offset = 0) => ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
const ipv4 = bytes => bytes.every(byte => byte === 0) ? null : Array.from(bytes).join('.');
const signed = byte => (byte << 24) >> 24;
const version = ({ major, minor }) => `${major}.${String(minor).padStart(2, '0')}`;
// smoke-rsnode-usb.py's decode_wire_rssi.
const rssi = wire => wire === 0 ? null : wire - RSSI_OFFSET;

export const screenSupported = board => SCREEN_BOARDS.includes(board);

/** STATUS names a board with no screen: the status check and the board's lights stand in for one. */
export function rsnodeScreenless(rsnode) {
  const board = rsnode && rsnode.board && rsnodeBoardForTarget(rsnode.board.board);
  return !!board && board.screen === false;
}

/** A CMD_DISP_READ payload as one byte per pixel, row by row: the SSD1306 pages probe-heltec-v4.py exports. */
export function screenPixels(payload) {
  if (payload.length !== SCREEN_BYTES) throw new Error(`unexpected screen size ${payload.length}`);
  const pixels = new Uint8Array(SCREEN_WIDTH * SCREEN_HEIGHT);
  for (let y = 0; y < SCREEN_HEIGHT; y++) {
    const page = (y >> 3) * SCREEN_WIDTH, bit = 1 << (y & 7);
    for (let x = 0; x < SCREEN_WIDTH; x++) pixels[y * SCREEN_WIDTH + x] = payload[page + x] & bit ? 1 : 0;
  }
  return pixels;
}

/** configure-transport-ifac.py's reading of the Repeater record status. */
export function parseTransportStatus(payload) {
  if (payload.length !== 7 || payload[0] !== TRANSPORT_READ) throw new Error(`malformed status payload length=${payload.length}`);
  if (payload.slice(1, 6).some(value => value > 1)) throw new Error('malformed status boolean field');
  const [, bootMode, transportId, radioProfile, ifacKey, ifacEnabled, ifacSize] = payload;
  if ((!ifacKey && (ifacEnabled || ifacSize !== 0)) || (ifacKey && !(ifacSize >= 1 && ifacSize <= 64))) {
    throw new Error('incoherent IFAC status fields');
  }
  return { bootMode: bootMode === 1, transportId: transportId === 1, radioProfile: radioProfile === 1,
    ifacKey: ifacKey === 1, ifacEnabled: ifacEnabled === 1, ifacSize };
}

export function renderTransport(transport) {
  const flag = value => value ? 1 : 0;
  return `boot=${flag(transport.bootMode)} id=${flag(transport.transportId)} profile=${flag(transport.radioProfile)} ` +
    `ifac_key=${flag(transport.ifacKey)} ifac_enabled=${flag(transport.ifacEnabled)} ifac_size=${transport.ifacSize}`;
}

/** CMD_STAT_CHTM as validate-rf-link.py decodes it; RSSIs are null while rsNode has no reading. */
export function parseChannelStats(payload) {
  const sentinel = payload[8] === RSSI_SENTINEL && payload[9] === RSSI_SENTINEL;
  return {
    airtimeShort: u16(payload, 0), airtimeLong: u16(payload, 2), loadShort: u16(payload, 4), loadLong: u16(payload, 6),
    currentRssi: sentinel ? null : rssi(payload[8]),
    noiseFloor: sentinel ? null : rssi(payload[9]),
    interference: payload[10] === INTERFERENCE_NONE ? null : payload[10] - RSSI_OFFSET
  };
}

async function exchange(session, command, payload, accept = frame => frame.command === command) {
  await session.send(command, payload);
  return session.readFrame(accept, EXCHANGE_TIMEOUT_MS);
}

async function query(session, name, command, length, payload = [], accept = undefined) {
  const frame = await exchange(session, command, payload, accept);
  if (!frame) throw new Error(`no answer to ${name}`);
  if (frame.payload.length !== length) throw new Error(`malformed ${name} payload length=${frame.payload.length}`);
  return frame.payload;
}

/**
 * A CMD_RSNODE exchange: { result, body }, or null when the node does not know the command
 * (it answers CMD_ERROR, or nothing within timeoutMs).
 */
export async function rsnodeCommand(session, sub, body = [], timeoutMs = EXCHANGE_TIMEOUT_MS) {
  await session.send(CMD_RSNODE, [sub, ...body]);
  const frame = await session.readFrame(candidate => candidate.command === CMD_ERROR ||
    (candidate.command === CMD_RSNODE && candidate.payload[0] === sub), timeoutMs);
  if (!frame || frame.command === CMD_ERROR) return null;
  if (frame.payload.length < 2) throw new Error(`malformed rsNode reply length=${frame.payload.length}`);
  return { result: frame.payload[1], body: Array.from(frame.payload.slice(2)) };
}

/** rsNode's STATUS body: ManageStatus TLVs, then the node's own facts (tag 0x10). */
export function parseRsnodeStatus(body) {
  const status = { board: null, firmware: null, releaseKeyId: null, ota: null, pendingSequence: null, owners: null,
    radio: null, wifi: null, image: null, release: null, node: null, uptimeS: null, lastUpdate: null };
  const seen = new Set();
  for (let offset = 0; offset < body.length;) {
    const tag = body[offset], len = body[offset + 1];
    const value = Array.from(body.slice(offset + 2, offset + 2 + len));
    if (len === undefined || value.length !== len) throw new Error('malformed rsNode status: truncated entry');
    offset += 2 + len;
    if (STATUS_LENGTHS[tag] !== undefined && !STATUS_LENGTHS[tag].includes(len)) {
      throw new Error(`malformed rsNode status: tag ${hexByte(tag)} length ${len}`);
    }
    if (STATUS_LENGTHS[tag] !== undefined || tag === 0x0f) {
      if (seen.has(tag)) throw new Error(`malformed rsNode status: duplicate tag ${hexByte(tag)}`);
      seen.add(tag);
    }
    switch (tag) {
      case 0x01: status.board = { platform: value[0], mcu: value[1], board: value[2] }; break;
      case 0x02: status.firmware = { major: u16(value, 0), minor: u16(value, 2), patch: u16(value, 4) }; break;
      case 0x03: status.releaseKeyId = hex(value); break;
      case 0x04: status.ota = { acceptedSequence: u32(value), slotLen: u32(value, 4),
        nearbyOnly: !!(value[8] & OTA_NEARBY_ONLY), trialPending: !!(value[8] & OTA_TRIAL) }; break;
      case 0x05: status.pendingSequence = u32(value); break;
      case 0x06: status.owners = { count: value[0], role: value[1] }; break;
      case 0x07: status.radio = { frequency: u32(value), bandwidth: u32(value, 4), spreadingFactor: value[8],
        codingRate: value[9], txPower: signed(value[10]), dutyTenthsPercent: u16(value, 11),
        maxTransmissionMs: u32(value, 13) }; break;
      case 0x09: status.uptimeS = u32(value); break;
      case 0x0a:
        if (value[5] > 1) throw new Error('malformed rsNode status: update result');
        status.lastUpdate = { sequence: u32(value), source: value[4], running: value[5] === 1 };
        break;
      case 0x0c: status.wifi = { mode: value[0], ready: !!(value[1] & WIFI_READY), ip: ipv4(value.slice(2)) }; break;
      case 0x0e: status.image = { len: u32(value), sha256: hex(value.slice(4)) }; break;
      case 0x0f:
        if (!len || len > RELEASE_MAX || value.some(byte => byte < 0x21 || byte > 0x7e)) throw new Error('malformed rsNode status: release');
        status.release = String.fromCharCode(...value);
        break;
      case 0x10:
        if (len === 5 && value[4] > 1) throw new Error('malformed rsNode status: forwarding');
        // forwarding is null on 1.0.0, which does not report it.
        status.node = { repeater: value[0] === 1, bluetoothAvailable: value[1] === 1,
          bluetoothEnabled: value[2] === 1, hostOwner: value[3], forwarding: len === 5 ? value[4] === 1 : null };
        break;
    }
  }
  return status;
}

/** The node's STATUS; null on a beta that predates it. */
export async function readRsnodeStatus(session) {
  const reply = await rsnodeCommand(session, SUB_STATUS, [], STATUS_WAIT_MS);
  if (!reply || reply.result !== RSNODE_RESULT.ok) return null;
  return parseRsnodeStatus(reply.body);
}

/** Bluetooth cannot run: Wi-Fi is on. */
export const rsnodeBluetoothOff = facts => !!(facts && facts.rsnode && facts.rsnode.node && !facts.rsnode.node.bluetoothAvailable);

/** DETECT once a second, as provision-rsnode.py waits; false after timeoutMs or once stopped() is true. */
export async function waitForRsnode(session, { timeoutMs = WAIT_TIMEOUT_MS, stopped = () => false, waiting = () => {} } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (let attempt = 0; !stopped(); attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return false;
    await session.send(CMD_DETECT, [DETECT_REQ]);
    const frame = await session.readFrame(candidate => candidate.command === CMD_DETECT,
      Math.min(DETECT_POLL_MS, Math.max(remaining, 50)));
    if (frame && frame.payload.length === 1 && frame.payload[0] === DETECT_RESP) return true;
    if (attempt === 0) waiting();
  }
  return false;
}

/**
 * What the node is: its name and managers, board, firmware, Repeater record and, from betas
 * that report it, its STATUS (rsnode; null otherwise). An RNode without READ_MGMT fails with notRsnode set.
 */
export async function readRsnodeFacts(session) {
  let status;
  try {
    status = await readManagementStatus(session);
  } catch (error) {
    throw Object.assign(new Error(`not rsNode firmware: ${error.message}`), { notRsnode: true });
  }
  const node = await readNodeStatus(session);
  const [board] = await query(session, 'board', CMD_BOARD, 1);
  const [platform] = await query(session, 'platform', CMD_PLATFORM, 1);
  const [mcu] = await query(session, 'mcu', CMD_MCU, 1);
  const [major, minor] = await query(session, 'firmware', CMD_FW_VERSION, 2);
  const image = await query(session, 'fw_hash', CMD_HASHES, 33, [HASH_FIRMWARE],
    frame => frame.command === CMD_HASHES && frame.payload[0] === HASH_FIRMWARE);
  const transport = await query(session, 'transport', CMD_TRANSPORT_CFG, 7, [TRANSPORT_READ],
    frame => frame.command === CMD_TRANSPORT_CFG && frame.payload[0] === TRANSPORT_READ);
  const rsnode = await readRsnodeStatus(session);
  return { status, node, board, platform, mcu, firmware: { major, minor }, firmwareHash: hex(image.slice(1)),
    transport: parseTransportStatus(transport), rsnode };
}

/**
 * Drop what the node sent unasked (battery and channel telemetry, received packets) or answered
 * late, so a long session neither queues it nor reads it as a fresh answer. A pairing code is kept
 * for readRsnodePairingCode.
 */
async function dropUnsolicited(session) {
  while (await session.readFrame(frame => frame.command !== CMD_BT_PIN, 0));
}

/**
 * The pairing code the node sends unasked once a phone starts pairing (CMD_BT_PIN, as
 * probe-heltec-v4.py --bt-pair prints it): six digits, or null when none is waiting.
 */
export async function readRsnodePairingCode(session) {
  let code = null;
  for (let frame; (frame = await session.readFrame(candidate => candidate.command === CMD_BT_PIN, 0));) {
    const value = frame.payload.length === 4 ? u32(frame.payload) : null;
    if (value !== null && value <= PAIRING_CODE_MAX) code = String(value).padStart(6, '0');
  }
  return code;
}

/** The radio and its counters; the last packet's RSSI and SNR are null until one arrives. */
export async function readRsnodeRadio(session) {
  await dropUnsolicited(session);
  const byte = async (name, command) => (await query(session, name, command, 1))[0];
  const word = async (name, command) => u32(await query(session, name, command, 4));
  const radio = {
    online: await byte('radio_state', CMD_RADIO_STATE) === 1,
    frequency: await word('frequency', CMD_FREQUENCY),
    bandwidth: await word('bandwidth', CMD_BANDWIDTH),
    spreadingFactor: await byte('sf', CMD_SF),
    codingRate: await byte('cr', CMD_CR),
    txPower: await byte('tx_power', CMD_TXPOWER),
    rx: await word('stat_rx', CMD_STAT_RX),
    tx: await word('stat_tx', CMD_STAT_TX)
  };
  const lastRssi = await byte('stat_rssi', CMD_STAT_RSSI);
  const lastSnr = await byte('stat_snr', CMD_STAT_SNR);
  Object.assign(radio, lastPacket(lastRssi, lastSnr));
  radio.channel = parseChannelStats(await query(session, 'stat_chtm', CMD_STAT_CHTM, 11));
  const [state, percent] = await query(session, 'stat_bat', CMD_STAT_BAT, 2);
  radio.battery = { state, percent };
  return radio;
}

function lastPacket(wire, snr) {
  return snr === SNR_UNKNOWN ? { rssi: null, snr: null } : { rssi: wire - RSSI_OFFSET, snr: signed(snr) / 4 };
}

/** One screen, asked as probe-heltec-v4.py --display-read asks; null when no answer came in time. */
export async function readRsnodeScreen(session) {
  const frame = await exchange(session, CMD_DISP_READ, [0x01]);
  return frame ? screenPixels(frame.payload) : null;
}

export function leaveRsnode(session) {
  return session.send(CMD_LEAVE, [0xff]);
}

/**
 * Sends a command that changes the node; false when it refuses with CMD_ERROR, as a Repeater
 * or a node another app is using does, since they answer only reads.
 */
async function command(session, code, payload) {
  await session.send(code, payload);
  return !(await session.readFrame(frame => frame.command === CMD_ERROR, REFUSAL_WAIT_MS));
}

/**
 * probe-heltec-v4.py --bt-pair: Bluetooth on and kept on, with a pairing window whose code the
 * screen shows and the node sends over USB (readRsnodePairingCode).
 */
export function startRsnodePairing(session) {
  return command(session, CMD_BT_CTRL, [BT_PAIRING]);
}

/** LEAVE first so the node is out of host mode, then configure-saved-radio.py's reset. */
export async function restartRsnode(session) {
  await leaveRsnode(session);
  return command(session, CMD_RESET, [RESET_BYTE]);
}

const radioConfigured = radio => radio.frequency !== 0 && radio.bandwidth !== 0 && radio.txPower !== 0xff &&
  radio.spreadingFactor !== 0;

function radioLine(radio) {
  const state = radio.online ? 'On' : 'Off';
  if (!radioConfigured(radio)) return `${state} · not configured`;
  return `${state} · ${(radio.frequency / 1e6).toFixed(3)} MHz · ${+(radio.bandwidth / 1000).toFixed(2)} kHz · ` +
    `SF${radio.spreadingFactor} · CR 4/${radio.codingRate} · ${radio.txPower} dBm`;
}

// The web flasher's names: the primary is the owner, helpers are admins.
function ownersLine(node) {
  if (node === null) return 'Not supported by this firmware';
  if (node.destination === null) return 'None yet';
  const admins = node.owners.filter(owner => owner.role === ROLE_HELPER).length;
  const parts = [];
  if (node.owners.some(owner => owner.role === ROLE_PRIMARY)) parts.push('Owner');
  if (admins) parts.push(`${admins} admin${admins === 1 ? '' : 's'}`);
  return parts.length ? parts.join(' and ') : 'None';
}

function repeaterLine(transport) {
  const parts = [transport.radioProfile ? 'Profile saved' : 'Not set up'];
  if (transport.ifacKey) parts.push(transport.ifacEnabled ? `IFAC on (${transport.ifacSize})` : 'IFAC off');
  if (transport.bootMode) parts.push('starts as Repeater');
  return parts.join(' · ');
}

// A running Repeater's forwarding, when its STATUS reports it.
function forwardingLine(rsnode) {
  const node = rsnode && rsnode.node;
  if (!node || !node.repeater || node.forwarding === null) return null;
  return node.forwarding ? 'Repeating' : 'Paused';
}

// STATUS names the variant; the RNode BOARD byte is one for every V4.
function boardName(facts) {
  const variant = facts.rsnode && facts.rsnode.board && rsnodeBoardForTarget(facts.rsnode.board.board);
  return variant ? variant.label : BOARDS[facts.board] || `Board ${hexByte(facts.board)}`;
}

function wifiLine(wifi) {
  if (!wifi || wifi.mode === 0) return 'Off';
  const name = wifi.mode === 1 ? 'Joined a network' : 'Own network';
  if (!wifi.ready) return wifi.mode === 1 ? 'Joining a network…' : 'Starting its own network…';
  return wifi.ip ? `${name} · ${wifi.ip}` : name;
}

/** The panel's lines; Wi-Fi, channel and battery are null when the node has nothing to report, Wi-Fi also on a board without it. */
export function rsnodeSummary(facts, radio) {
  const channel = radio.channel;
  const rsnode = facts.rsnode;
  const variant = rsnode && rsnode.board && rsnodeBoardForTarget(rsnode.board.board);
  return {
    node: `RNode ${facts.status.nodeId}`,
    board: `${boardName(facts)} · ${PLATFORMS[facts.platform] || hexByte(facts.platform)}`,
    firmware: `${rsnode && rsnode.release ? rsnode.release : `RNode ${version(facts.firmware)}`} · image ${facts.firmwareHash.slice(0, 8)}`,
    owners: ownersLine(facts.node),
    repeater: repeaterLine(facts.transport),
    forwarding: forwardingLine(rsnode),
    wifi: rsnode && !(variant && variant.wifi === false) ? wifiLine(rsnode.wifi) : null,
    radio: radioLine(radio),
    packets: `RX ${radio.rx} · TX ${radio.tx}` + (radio.rssi === null ? '' : ` · last ${radio.rssi} dBm, ${radio.snr} dB`),
    channel: radio.online
      ? `Airtime ${(channel.airtimeShort / 100).toFixed(1)}% · load ${(channel.loadShort / 100).toFixed(1)}%` +
        (channel.noiseFloor === null ? '' : ` · noise ${channel.noiseFloor} dBm`)
      : null,
    battery: BATTERY_STATES[radio.battery.state] ? `${radio.battery.percent}% · ${BATTERY_STATES[radio.battery.state]}` : null
  };
}

function upFor(seconds) {
  const count = (value, unit) => `${value} ${unit}${value === 1 ? '' : 's'}`;
  if (seconds < 60) return 'less than a minute';
  if (seconds < 3600) return count(Math.floor(seconds / 60), 'minute');
  if (seconds < 86400) return count(Math.floor(seconds / 3600), 'hour');
  return count(Math.floor(seconds / 86400), 'day');
}

function managersItem(node) {
  const admins = node.owners.filter(owner => owner.role === ROLE_HELPER).length;
  const parts = [];
  if (node.owners.some(owner => owner.role === ROLE_PRIMARY)) parts.push('an Owner');
  if (admins) parts.push(`${admins} admin${admins === 1 ? '' : 's'}`);
  return parts.length ? `It has ${parts.join(' and ')}.` : 'It has no managers yet.';
}

/**
 * A node with no screen, as a short checklist of { ok, text }: what readRsnodeFacts and the radio
 * say it is doing. ok is false for what is off, waiting, or paused.
 */
export function rsnodeStatusCheck(facts, radio = null) {
  const rsnode = facts.rsnode, node = rsnode && rsnode.node;
  const repeater = node ? node.repeater : facts.transport.bootMode;
  const items = [{ ok: true, text: `RNode ${facts.status.nodeId} answered over USB.` }];
  const add = (ok, text) => items.push({ ok, text });
  if (rsnode && rsnode.release) {
    add(true, `It runs rsNode ${rsnode.release}` + (rsnode.uptimeS === null ? '.' : ` and has been up for ${upFor(rsnode.uptimeS)}.`));
  }
  if (rsnode && (rsnode.pendingSequence !== null || (rsnode.ota && rsnode.ota.trialPending))) add(false, 'It is finishing an update.');
  if (!repeater) {
    const app = node && node.hostOwner >= 2 ? HOST_OWNERS[node.hostOwner] : null;
    add(true, app ? `It is running as an RNode, and an app is using it over ${app}.` : 'It is running as an RNode.');
  } else if (!node || node.forwarding === null) {
    add(true, 'It is running as a Repeater.');
  } else if (node.forwarding) {
    add(true, 'It is running as a Repeater and forwarding.');
  } else {
    add(false, 'It is a Repeater, paused. Start repeating in Set up as a Repeater.');
  }
  if (radio) {
    if (radio.online) add(true, radioConfigured(radio) ? `Its radio is on at ${(radio.frequency / 1e6).toFixed(3)} MHz.` : 'Its radio is on.');
    else add(false, repeater ? 'Its radio is off.' : 'Its radio is off until an app turns it on.');
  }
  if (node) {
    if (!node.bluetoothAvailable) add(false, 'Bluetooth is off while Wi-Fi is on.');
    else if (node.bluetoothEnabled) add(true, 'Bluetooth is on.');
    else add(false, repeater ? 'Bluetooth is off.' : 'Bluetooth is off. Start Bluetooth pairing to turn it on.');
  }
  const wifi = rsnode && rsnode.wifi;
  if (wifi && wifi.mode !== 0) {
    if (wifi.ready && wifi.ip) add(true, wifi.mode === 1 ? `Wi-Fi joined a network at ${wifi.ip}.` : `Wi-Fi runs its own network at ${wifi.ip}.`);
    else add(false, wifi.mode === 1 ? 'Wi-Fi is joining a network.' : 'Wi-Fi is starting its own network.');
  }
  if (facts.node) add(facts.node.owners.length > 0, managersItem(facts.node));
  return items;
}

// What the firmware's lights say on a board with no screen. heartbeat names the light that flashes every 5 seconds.
const LIGHTS = {
  'rak4631': { heartbeat: 'green light', legend: [
    ['Green light', 'One short flash every 5 seconds means it is running as an RNode. Two short flashes every 5 seconds mean the Repeater is forwarding.'],
    ['Blue light', 'One flash for each packet received or sent. Steady blinking while a pairing window is open, or while a manager asked it to blink.']
  ] },
  'heltec-wsl-v3': { heartbeat: 'white light', legend: [
    ['White light', 'One short flash every 5 seconds means it is running as an RNode. Two short flashes every 5 seconds mean the Repeater is forwarding. ' +
      'An extra flash means packets were received or sent in the last second. Steady blinking means a pairing window is open, or a manager asked it to blink.']
  ] }
};

/** A screenless board's lights: { heartbeat, legend: [[light, meaning]] }, or null for a board with a screen. */
export function rsnodeLights(board) {
  return board && Object.hasOwn(LIGHTS, board.id) ? LIGHTS[board.id] : null;
}

/** The build lines of a bug report, from STATUS. */
function buildLines(rsnode) {
  if (!rsnode) return ['version: not reported by this firmware'];
  const target = rsnode.board;
  const variant = target && rsnodeBoardForTarget(target.board);
  return [
    `version: ${rsnode.release || 'not reported'}`,
    `variant: ${variant ? variant.label : 'unknown'}${target ? ` (target ${[target.platform, target.mcu, target.board].map(hexByte).join(':')})` : ''}`,
    `update key: ${rsnode.releaseKeyId || 'none'}`,
    `ota sequence: ${rsnode.ota ? rsnode.ota.acceptedSequence : 'unknown'}` +
      (rsnode.pendingSequence !== null ? `, pending ${rsnode.pendingSequence}` : '') +
      (rsnode.ota && rsnode.ota.trialPending ? ', trial running' : ''),
    `mode: ${rsnode.node ? (rsnode.node.repeater ? 'Repeater' : 'RNode') : 'unknown'}` +
      (forwardingLine(rsnode) ? `, ${forwardingLine(rsnode).toLowerCase()}` : '') +
      (rsnode.node && HOST_OWNERS[rsnode.node.hostOwner] ? `, held over ${HOST_OWNERS[rsnode.node.hostOwner]}` : '') +
      (rsnode.node ? `, Bluetooth ${rsnode.node.bluetoothAvailable ? (rsnode.node.bluetoothEnabled ? 'on' : 'off') : 'unavailable'}` : '')
  ];
}

/** Plain text for a bug report, in the wording rsNode's scripts print. */
export function rsnodeDetails(facts, radio) {
  const summary = rsnodeSummary(facts, radio);
  return [
    summary.node,
    `board: ${summary.board} (board ${hexByte(facts.board)}, platform ${hexByte(facts.platform)}, mcu ${hexByte(facts.mcu)})`,
    `firmware: RNode ${version(facts.firmware)}, image ${facts.firmwareHash}`,
    ...buildLines(facts.rsnode),
    ...renderNode(facts.node),
    `transport: ${renderTransport(facts.transport)}`,
    ...(summary.wifi ? [`wi-fi: ${summary.wifi}`] : []),
    `radio: ${summary.radio}`,
    `packets: ${summary.packets}`,
    ...(summary.channel ? [`channel: ${summary.channel}`] : []),
    ...(summary.battery ? [`battery: ${summary.battery}`] : [])
  ].join('\n') + '\n';
}
