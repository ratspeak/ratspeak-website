// rsNode owners and management key over USB KISS, step for step as rsNode's
// scripts/provision-rsnode.py runs them; the management-AP password is left as is.
// tests/fixtures/rsnode-provision-vectors.json records that script's frames.
const CMD_DETECT = 0x08;
const CMD_LEAVE = 0x0a;
const CMD_TRANSPORT_CFG = 0x6f;
const CMD_ERROR = 0x90;
const DETECT_REQ = 0x73;
const DETECT_RESP = 0x46;
const SET_MGMT_KEY = 0x04;
const READ_MGMT = 0x05;
const CLEAR_MGMT_KEY = 0x06;
const READ_NODE = 0x07;
const ADD_OWNER = 0x08;
const REMOVE_OWNER = 0x09;
const MANAGEMENT_STATUS_LEN = 11;
const NODE_STATUS_HEADER_LEN = 20;
const OWNER_ENTRY_LEN = 18;
const OWNERS_MAX = 4;
const KEY_LEN = 32;
export const KEY_FILE_READ_MAX = KEY_LEN * 2 + 2;
const OWNER_KIND_LXMF = 1;
const OWNER_KIND_IDENTITY = 2;
const OWNER_KINDS = { 1: 'lxmf', 2: 'identity' };
const ROLE_PRIMARY = 1;
const ROLE_HELPER = 2;
const ROLES = { 1: 'primary', 2: 'helper' };
const ERROR_INVALID_CONFIG = 0x07;
const ERROR_NAMES = {
  0x01: 'no entropy source: start Bluetooth or Wi-Fi and retry',
  0x03: 'persistent storage is locked',
  0x07: 'invalid configuration'
};
const DETECT_POLL_MS = 1000;
const EXCHANGE_TIMEOUT_MS = 3000;
const KISS_TIMEOUT_MS = 30000;
const WAIT_HINT = 'waiting for USB KISS: idle RNode devices connect automatically; ' +
  'hold USB to take over from another host (EXIT Repeater first)';

// Typed hashes strip as str.strip() does; bytes.fromhex() and bytes.strip() skip ASCII whitespace only.
const TEXT_SPACE = '\\t-\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const TEXT_STRIP = new RegExp(`^[${TEXT_SPACE}]+|[${TEXT_SPACE}]+$`, 'g');
const ASCII_SPACE = ' \t\n\r\x0b\x0c';
const UPPER_HEX = Array.from('0123456789ABCDEF', character => character.charCodeAt(0));

const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

function fromHex(text) {
  const bytes = [];
  for (let i = 0; i < text.length;) {
    if (ASCII_SPACE.includes(text[i])) { i++; continue; }
    const pair = text.slice(i, i + 2);
    if (!/^[0-9a-fA-F]{2}$/.test(pair)) return null;
    bytes.push(parseInt(pair, 16));
    i += 2;
  }
  return Uint8Array.from(bytes);
}

/** A 16-byte hash as Reticulum prints it, with or without angle brackets. */
export function parseHash(text) {
  let cleaned = String(text).replace(TEXT_STRIP, '');
  if (cleaned.startsWith('<')) cleaned = cleaned.slice(1);
  if (cleaned.endsWith('>')) cleaned = cleaned.slice(0, -1);
  const value = fromHex(cleaned);
  if (!value) throw new Error(`Not a hexadecimal hash: ${text}`);
  if (value.length !== 16) throw new Error(`A hash is 32 hexadecimal characters, got ${cleaned.length}: ${text}`);
  return value;
}

/** A management key file as rsnode-manage.py and update-rsnode-ota.py accept it. */
export function parseKeyFile(bytes) {
  if (bytes.length > KEY_FILE_READ_MAX) throw new Error('management key file is unexpectedly large');
  let key = Uint8Array.from(bytes);
  if (bytes.length !== KEY_LEN) {
    let start = 0, end = bytes.length;
    while (start < end && ASCII_SPACE.includes(String.fromCharCode(bytes[start]))) start++;
    while (end > start && ASCII_SPACE.includes(String.fromCharCode(bytes[end - 1]))) end--;
    if (end - start !== KEY_LEN * 2) throw new Error('management key must be 32 raw bytes or 64 hexadecimal characters');
    const text = key.slice(start, end);
    key = text.every(byte => byte < 0x80) ? fromHex(String.fromCharCode(...text)) : null;
    if (!key) throw new Error('management key is not raw bytes or hexadecimal');
  }
  if (key.length === KEY_LEN && key.every(byte => byte === 0)) throw new Error('management key must not be all zero');
  return key;
}

export function generateManagementKey() {
  const key = new Uint8Array(KEY_LEN);
  // The device rejects the all-zero sentinel.
  do crypto.getRandomValues(key); while (key.every(byte => byte === 0));
  return key;
}

export function parseManagementStatus(payload) {
  if (payload.length !== MANAGEMENT_STATUS_LEN || payload[0] !== READ_MGMT) {
    throw new Error(`malformed management status payload length=${payload.length}`);
  }
  if (payload[1] > 1 || payload[2] > 1) throw new Error('malformed management status boolean field');
  const nodeId = Array.from(payload.slice(3, 7));
  if (nodeId.some(byte => !UPPER_HEX.includes(byte))) throw new Error('malformed node id in management status');
  return {
    pskSet: payload[1] === 1,
    keySet: payload[2] === 1,
    nodeId: String.fromCharCode(...nodeId),
    floor: ((payload[7] << 24) | (payload[8] << 16) | (payload[9] << 8) | payload[10]) >>> 0
  };
}

/** The identity sector: the management destination, policy and owners. */
export function parseNodeStatus(payload) {
  if (payload.length < NODE_STATUS_HEADER_LEN || payload[0] !== READ_NODE) {
    throw new Error(`malformed node status payload length=${payload.length}`);
  }
  if (payload[1] > 1 || payload[18] > 1) throw new Error('malformed node status boolean field');
  const count = payload[19];
  const entries = payload.slice(NODE_STATUS_HEADER_LEN);
  if (count > OWNERS_MAX || entries.length !== count * OWNER_ENTRY_LEN) throw new Error('malformed node status owner list');
  const owners = [];
  for (let index = 0; index < count; index++) {
    const entry = entries.slice(index * OWNER_ENTRY_LEN, (index + 1) * OWNER_ENTRY_LEN);
    if (!OWNER_KINDS[entry[0]] || !ROLES[entry[1]]) throw new Error('malformed owner entry');
    owners.push({ kind: entry[0], role: entry[1], hash: hex(entry.slice(2)) });
  }
  return { destination: payload[1] === 1 ? hex(payload.slice(2, 18)) : null, nearbyOnly: payload[18] === 1, owners };
}

export function renderStatus(status) {
  return `status: ap_psk=${status.pskSet ? 'set' : 'not set'} management_key=${status.keySet ? 'set' : 'not set'}`;
}

/** provision-rsnode.py's lines for a node; null is firmware without the identity sector. */
export function renderNode(node) {
  if (node === null) return ['node identity: not supported by this firmware'];
  if (node.destination === null) return ['node identity: none yet (the first owner enrolment creates it)'];
  const lines = [`management destination: ${node.destination}`];
  for (const owner of node.owners) lines.push(`owner: ${ROLES[owner.role]} ${OWNER_KINDS[owner.kind]} ${owner.hash}`);
  if (!node.owners.length) lines.push('owners: none (the management Link stays off)');
  if (node.nearbyOnly) lines.push('policy: updates only from nearby');
  return lines;
}

/** The primary first, then helpers: [kind, role, hash, description]. */
export function ownersToEnrol({ owner = null, ownerIdentity = null, helper = [], helperIdentity = [] }) {
  const owners = [];
  if (owner) owners.push([OWNER_KIND_LXMF, ROLE_PRIMARY, owner, 'the primary owner']);
  if (ownerIdentity) owners.push([OWNER_KIND_IDENTITY, ROLE_PRIMARY, ownerIdentity, 'the primary owner']);
  for (const value of helper) owners.push([OWNER_KIND_LXMF, ROLE_HELPER, value, 'a helper']);
  for (const value of helperIdentity) owners.push([OWNER_KIND_IDENTITY, ROLE_HELPER, value, 'a helper']);
  return owners;
}

async function exchange(session, command, payload, timeoutMs, accept) {
  await session.send(command, Array.from(payload));
  return session.readFrame(frame => accept.includes(frame.command), timeoutMs);
}

function rejected(what, code, reason) {
  return new Error(`device rejected ${what}: error 0x${code.toString(16).padStart(2, '0')} (${reason})`);
}

async function managementExchange(session, payload, what) {
  const frame = await exchange(session, CMD_TRANSPORT_CFG, payload, EXCHANGE_TIMEOUT_MS, [CMD_TRANSPORT_CFG, CMD_ERROR]);
  if (!frame) throw new Error(`timed out waiting for the device to answer ${what}`);
  if (frame.command === CMD_ERROR) {
    const code = frame.payload.length ? frame.payload[0] : 0xff;
    throw rejected(what, code, ERROR_NAMES[code] || 'unknown error');
  }
  try { return parseManagementStatus(frame.payload); } catch (error) { throw new Error(`${what}: ${error.message}`); }
}

/** An owner subcommand; null when the firmware predates the identity sector. */
async function nodeExchange(session, payload, what) {
  const frame = await exchange(session, CMD_TRANSPORT_CFG, payload, EXCHANGE_TIMEOUT_MS, [CMD_TRANSPORT_CFG, CMD_ERROR]);
  if (!frame) throw new Error(`timed out waiting for the device to answer ${what}`);
  if (frame.command === CMD_ERROR) {
    const code = frame.payload.length ? frame.payload[0] : 0xff;
    if (payload[0] === READ_NODE && code === ERROR_INVALID_CONFIG) return null;
    let reason = ERROR_NAMES[code] || 'unknown error';
    if (payload[0] === ADD_OWNER && code === ERROR_INVALID_CONFIG) reason = 'the owner table is full, or this firmware predates owners';
    else if (payload[0] === REMOVE_OWNER && code === ERROR_INVALID_CONFIG) reason = 'no such owner, or this firmware predates owners';
    throw rejected(what, code, reason);
  }
  try { return parseNodeStatus(frame.payload); } catch (error) { throw new Error(`${what}: ${error.message}`); }
}

async function waitForDevice(session, timeoutMs, log) {
  const deadline = Date.now() + timeoutMs;
  let hinted = false;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return false;
    const frame = await exchange(session, CMD_DETECT, [DETECT_REQ], Math.min(DETECT_POLL_MS, Math.max(remaining, 50)), [CMD_DETECT]);
    if (frame && frame.payload.length === 1 && frame.payload[0] === DETECT_RESP) return true;
    if (!hinted) { log(WAIT_HINT); hinted = true; }
  }
}

function logStatus(log, status) {
  log(`node id: RNode ${status.nodeId}`);
  log(renderStatus(status));
  log(`poke floor: ${status.floor}`);
}

/**
 * Run provision-rsnode.py's sequence over an open KISS session ({ send, readFrame }).
 * Options mirror its flags: read, managementKey (bytes), noKey, clearKey, owner,
 * ownerIdentity, helper, helperIdentity, removeOwner (hashes). Without managementKey,
 * noKey or clearKey a new key is generated; saveKey receives it once the node confirms it.
 */
export async function provisionRsnode(session, options, { log = () => {}, saveKey = () => {} } = {}) {
  if (!await waitForDevice(session, KISS_TIMEOUT_MS, log)) {
    throw new Error(`no KISS response within ${KISS_TIMEOUT_MS / 1000} s: EXIT Repeater if active; ` +
      'in RNode, hold USB on the home menu to take over from another host, then try again');
  }
  let status = await managementExchange(session, [READ_MGMT], 'READ_MGMT');
  logStatus(log, status);
  if (options.read) {
    const node = await nodeExchange(session, [READ_NODE], 'READ_NODE');
    await session.send(CMD_LEAVE, [0xff]);
    renderNode(node).forEach(line => log(line));
    return { status, node };
  }
  const removals = options.removeOwner || [];
  const owners = ownersToEnrol(options);
  const generated = !options.managementKey && !options.noKey && !options.clearKey ? generateManagementKey() : null;
  const key = options.managementKey || generated;
  if (key) {
    if (key.length !== KEY_LEN || key.every(byte => byte === 0)) throw new Error('management key must be 32 non-zero bytes');
    status = await managementExchange(session, [SET_MGMT_KEY, ...key], 'the management key (SET_MGMT_KEY)');
    if (!status.keySet) throw new Error('device did not report the management key as set');
    // Only a device-confirmed key is worth keeping.
    if (generated) saveKey({ name: `rsnode-${status.nodeId}.key`, text: hex(generated) + '\n' });
  }
  if (options.clearKey) {
    status = await managementExchange(session, [CLEAR_MGMT_KEY], 'clearing the management key');
    if (status.keySet) throw new Error('device still reports a management key');
  }
  for (const hash of removals) await nodeExchange(session, [REMOVE_OWNER, ...hash], 'REMOVE_OWNER');
  for (const [kind, role, hash, what] of owners) await nodeExchange(session, [ADD_OWNER, kind, role, ...hash], what);
  const node = await nodeExchange(session, [READ_NODE], 'READ_NODE');
  if (node === null && (removals.length || owners.length)) throw new Error('this firmware predates owners');
  status = await managementExchange(session, [READ_MGMT], 'READ_MGMT');
  await session.send(CMD_LEAVE, [0xff]);
  logStatus(log, status);
  renderNode(node).forEach(line => log(line));
  return { status, node };
}
