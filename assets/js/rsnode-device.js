// rsNode's screen and status over USB KISS, asked as rsNode's scripts ask: the screen mirror
// as probe-heltec-v4.py --display-read, the radio as its --extended checks. Owners and the
// management key come from rsnode-provision.js. tests/fixtures/rsnode-device-vectors.json
// records rsNode's own answers.
import { readManagementStatus, readNodeStatus, renderNode, renderStatus } from './rsnode-provision.js';

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
const CMD_BOARD = 0x47;
const CMD_PLATFORM = 0x48;
const CMD_MCU = 0x49;
const CMD_FW_VERSION = 0x50;
const CMD_RESET = 0x55;
const CMD_HASHES = 0x60;
const CMD_DISP_READ = 0x66;
const CMD_TRANSPORT_CFG = 0x6f;
const DETECT_REQ = 0x73;
const DETECT_RESP = 0x46;
const HASH_FIRMWARE = 0x02;
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
const BOARDS = { 0x3a: 'Heltec V3', 0x3c: 'Heltec T114', 0x3f: 'Heltec V4', 0x44: 'T-Echo' };
// Heltec V3 and V4 mirror their whole 128x64 UI; T-Echo and T114 return part of a larger panel.
const SCREEN_BOARDS = [0x3a, 0x3f];
const PLATFORMS = { 0x70: 'nRF52', 0x80: 'ESP32' };
const BATTERY_STATES = { 1: 'discharging', 2: 'charging', 3: 'charged' };
const ROLE_PRIMARY = 1;
const ROLE_HELPER = 2;
const DETECT_POLL_MS = 1000;
const EXCHANGE_TIMEOUT_MS = 2000;
const WAIT_TIMEOUT_MS = 30000;

const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const hexByte = byte => '0x' + byte.toString(16).padStart(2, '0');
const u16 = (bytes, offset) => (bytes[offset] << 8) | bytes[offset + 1];
const u32 = bytes => ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
const signed = byte => (byte << 24) >> 24;
const version = ({ major, minor }) => `${major}.${String(minor).padStart(2, '0')}`;
// smoke-rsnode-usb.py's decode_wire_rssi.
const rssi = wire => wire === 0 ? null : wire - RSSI_OFFSET;

export const screenSupported = board => SCREEN_BOARDS.includes(board);

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
 * What the node is: its management status and owners, board, firmware and Repeater record.
 * An RNode without rsNode's management status fails with notRsnode set.
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
  return { status, node, board, platform, mcu, firmware: { major, minor }, firmwareHash: hex(image.slice(1)),
    transport: parseTransportStatus(transport) };
}

/**
 * Drop what the node sent unasked (battery and channel telemetry, received packets) or answered
 * late, so a long session neither queues it nor reads it as a fresh answer.
 */
async function dropUnsolicited(session) {
  while (await session.readFrame(null, 0));
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

/** LEAVE first so the node is out of host mode, then configure-saved-radio.py's reset. */
export async function restartRsnode(session) {
  await leaveRsnode(session);
  await session.send(CMD_RESET, [RESET_BYTE]);
}

const radioConfigured = radio => radio.frequency !== 0 && radio.bandwidth !== 0 && radio.txPower !== 0xff &&
  radio.spreadingFactor !== 0;

function radioLine(radio) {
  const state = radio.online ? 'On' : 'Off';
  if (!radioConfigured(radio)) return `${state} · not configured`;
  return `${state} · ${(radio.frequency / 1e6).toFixed(3)} MHz · ${+(radio.bandwidth / 1000).toFixed(2)} kHz · ` +
    `SF${radio.spreadingFactor} · CR 4/${radio.codingRate} · ${radio.txPower} dBm`;
}

function ownersLine(node) {
  if (node === null) return 'Not supported by this firmware';
  if (node.destination === null) return 'None yet';
  const helpers = node.owners.filter(owner => owner.role === ROLE_HELPER).length;
  const parts = [];
  if (node.owners.some(owner => owner.role === ROLE_PRIMARY)) parts.push('Primary');
  if (helpers) parts.push(`${helpers} helper${helpers === 1 ? '' : 's'}`);
  return parts.length ? parts.join(' and ') : 'None';
}

function repeaterLine(transport) {
  const parts = [transport.radioProfile ? 'Profile saved' : 'Not set up'];
  if (transport.ifacKey) parts.push(transport.ifacEnabled ? `IFAC on (${transport.ifacSize})` : 'IFAC off');
  if (transport.bootMode) parts.push('starts as Repeater');
  return parts.join(' · ');
}

/** The panel's lines; channel and battery are null when the node has nothing to report. */
export function rsnodeSummary(facts, radio) {
  const channel = radio.channel;
  return {
    node: `RNode ${facts.status.nodeId}`,
    board: `${BOARDS[facts.board] || `Board ${hexByte(facts.board)}`} · ${PLATFORMS[facts.platform] || hexByte(facts.platform)}`,
    firmware: `RNode ${version(facts.firmware)} · image ${facts.firmwareHash.slice(0, 8)}`,
    management: `${facts.status.keySet ? 'Key set' : 'No key'} · ${facts.status.pskSet ? 'AP password set' : 'no AP password'}`,
    owners: ownersLine(facts.node),
    repeater: repeaterLine(facts.transport),
    radio: radioLine(radio),
    packets: `RX ${radio.rx} · TX ${radio.tx}` + (radio.rssi === null ? '' : ` · last ${radio.rssi} dBm, ${radio.snr} dB`),
    channel: radio.online
      ? `Airtime ${(channel.airtimeShort / 100).toFixed(1)}% · load ${(channel.loadShort / 100).toFixed(1)}%` +
        (channel.noiseFloor === null ? '' : ` · noise ${channel.noiseFloor} dBm`)
      : null,
    battery: BATTERY_STATES[radio.battery.state] ? `${radio.battery.percent}% · ${BATTERY_STATES[radio.battery.state]}` : null
  };
}

/** Plain text for a bug report, in the wording rsNode's scripts print. */
export function rsnodeDetails(facts, radio) {
  const summary = rsnodeSummary(facts, radio);
  return [
    summary.node,
    `board: ${summary.board} (board ${hexByte(facts.board)}, platform ${hexByte(facts.platform)}, mcu ${hexByte(facts.mcu)})`,
    `firmware: RNode ${version(facts.firmware)}, image ${facts.firmwareHash}`,
    renderStatus(facts.status),
    ...renderNode(facts.node),
    `transport: ${renderTransport(facts.transport)}`,
    `radio: ${summary.radio}`,
    `packets: ${summary.packets}`,
    ...(summary.channel ? [`channel: ${summary.channel}`] : []),
    ...(summary.battery ? [`battery: ${summary.battery}`] : [])
  ].join('\n') + '\n';
}
