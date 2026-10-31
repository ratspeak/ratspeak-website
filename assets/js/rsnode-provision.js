// rsNode managers over USB KISS, step for step as rsNode's scripts/provision-rsnode.py runs them.
// The management key and AP password are retired (rsNode ADR 0015); READ_MGMT names the node.
// tests/fixtures/rsnode-provision-vectors.json records that script's frames.
const CMD_DETECT = 0x08;
const CMD_LEAVE = 0x0a;
const CMD_TRANSPORT_CFG = 0x6f;
const CMD_ERROR = 0x90;
const DETECT_REQ = 0x73;
const DETECT_RESP = 0x46;
const READ_MGMT = 0x05;
const READ_NODE = 0x07;
const ADD_OWNER = 0x08;
const REMOVE_OWNER = 0x09;
const MANAGEMENT_STATUS_LEN = 11;
const NODE_STATUS_HEADER_LEN = 20;
const OWNER_ENTRY_LEN = 18;
const OWNERS_MAX = 4;
const OWNER_KIND_LXMF = 1;
const OWNER_KIND_IDENTITY = 2;
const OWNER_KINDS = { 1: 'lxmf', 2: 'identity' };
const ROLE_PRIMARY = 1;
const ROLE_HELPER = 2;
const ROLES = { 1: 'owner', 2: 'admin' };
const ERROR_INVALID_CONFIG = 0x07;
const ERROR_NAMES = {
  0x01: 'no entropy source: start Bluetooth or Wi-Fi and retry',
  0x03: 'persistent storage is locked',
  0x07: 'invalid configuration'
};
const DETECT_POLL_MS = 1000;
const EXCHANGE_TIMEOUT_MS = 3000;
const KISS_TIMEOUT_MS = 30000;
const WAIT_HINT = 'waiting for USB KISS: if you just installed, press RESET on the board; ' +
  'in RNode, hold USB to take over from another app';

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

/** READ_MGMT's 11-byte reply, kept for the node id; its retired key and AP flags are not reported. */
export function parseManagementStatus(payload) {
  if (payload.length !== MANAGEMENT_STATUS_LEN || payload[0] !== READ_MGMT) {
    throw new Error(`malformed management status payload length=${payload.length}`);
  }
  if (payload[1] > 1 || payload[2] > 1) throw new Error('malformed management status boolean field');
  const nodeId = Array.from(payload.slice(3, 7));
  if (nodeId.some(byte => !UPPER_HEX.includes(byte))) throw new Error('malformed node id in management status');
  return { nodeId: String.fromCharCode(...nodeId) };
}

/** The identity sector: the management destination, policy and managers. */
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

/** provision-rsnode.py's lines for a node; null is firmware without the identity sector. */
export function renderNode(node) {
  if (node === null) return ['node identity: not supported by this firmware'];
  if (node.destination === null) return ['node identity: none yet (the first manager creates it)'];
  const lines = [`management destination: ${node.destination}`];
  for (const owner of node.owners) lines.push(`${ROLES[owner.role]}: ${OWNER_KINDS[owner.kind]} ${owner.hash}`);
  if (!node.owners.length) lines.push('managers: none (the management Link stays off)');
  if (node.nearbyOnly) lines.push('nearby-only: on');
  return lines;
}

/** The Owner first, then Admins (helper options): [kind, role, hash, description]. */
export function ownersToEnrol({ owner = null, ownerIdentity = null, helper = [], helperIdentity = [] }) {
  const owners = [];
  if (owner) owners.push([OWNER_KIND_LXMF, ROLE_PRIMARY, owner, 'the owner']);
  if (ownerIdentity) owners.push([OWNER_KIND_IDENTITY, ROLE_PRIMARY, ownerIdentity, 'the owner']);
  for (const value of helper) owners.push([OWNER_KIND_LXMF, ROLE_HELPER, value, 'an admin']);
  for (const value of helperIdentity) owners.push([OWNER_KIND_IDENTITY, ROLE_HELPER, value, 'an admin']);
  return owners;
}

async function exchange(session, command, payload, timeoutMs, accept) {
  await session.send(command, Array.from(payload));
  return session.readFrame(frame => accept.includes(frame.command), timeoutMs);
}

/** code is the KISS error; subcommand the TRANSPORT_CFG step it answered. */
function rejected(what, code, reason, subcommand) {
  return Object.assign(new Error(`device rejected ${what}: error 0x${code.toString(16).padStart(2, '0')} (${reason})`),
    { code, subcommand });
}

async function managementExchange(session, payload, what) {
  const frame = await exchange(session, CMD_TRANSPORT_CFG, payload, EXCHANGE_TIMEOUT_MS, [CMD_TRANSPORT_CFG, CMD_ERROR]);
  if (!frame) throw new Error(`timed out waiting for the device to answer ${what}`);
  if (frame.command === CMD_ERROR) {
    const code = frame.payload.length ? frame.payload[0] : 0xff;
    throw rejected(what, code, ERROR_NAMES[code] || 'unknown error', payload[0]);
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
    if (payload[0] === ADD_OWNER && code === ERROR_INVALID_CONFIG) reason = 'the manager list is full, or this firmware predates managers';
    else if (payload[0] === REMOVE_OWNER && code === ERROR_INVALID_CONFIG) reason = 'no such manager, or this firmware predates managers';
    throw rejected(what, code, reason, payload[0]);
  }
  try { return parseNodeStatus(frame.payload); } catch (error) { throw new Error(`${what}: ${error.message}`); }
}

/** READ_MGMT as --read asks it. */
export function readManagementStatus(session) {
  return managementExchange(session, [READ_MGMT], 'READ_MGMT');
}

/** READ_NODE as --read asks it; null on firmware that predates managers. */
export function readNodeStatus(session) {
  return nodeExchange(session, [READ_NODE], 'READ_NODE');
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
}

/**
 * Run provision-rsnode.py's manager sequence over an open KISS session ({ send, readFrame }).
 * Options mirror its flags: read, owner, ownerIdentity, helper (--admin), helperIdentity (--admin-identity), removeOwner (--remove-manager)
 * (hashes). nodeId, the page's own option, stops before any change on another node;
 * identified(status), the page's own hook, runs once the node is named, before any change.
 */
export async function provisionRsnode(session, options, { log = () => {}, identified = async () => {} } = {}) {
  if (!await waitForDevice(session, KISS_TIMEOUT_MS, log)) {
    throw new Error(`no KISS response within ${KISS_TIMEOUT_MS / 1000} s: if you just installed, press RESET on the board; ` +
      'in RNode, hold USB on the home menu to take over from another app, then try again');
  }
  let status = await readManagementStatus(session);
  logStatus(log, status);
  if (options.nodeId && options.nodeId !== status.nodeId) {
    await session.send(CMD_LEAVE, [0xff]);
    throw new Error(`this is RNode ${status.nodeId}, not RNode ${options.nodeId}`);
  }
  await identified(status);
  if (options.read) {
    const node = await readNodeStatus(session);
    await session.send(CMD_LEAVE, [0xff]);
    renderNode(node).forEach(line => log(line));
    return { status, node };
  }
  const removals = options.removeOwner || [];
  const owners = ownersToEnrol(options);
  for (const hash of removals) await nodeExchange(session, [REMOVE_OWNER, ...hash], 'the removal of a manager');
  for (const [kind, role, hash, what] of owners) await nodeExchange(session, [ADD_OWNER, kind, role, ...hash], what);
  const node = await readNodeStatus(session);
  if (node === null && (removals.length || owners.length)) throw new Error('this firmware predates managers');
  status = await readManagementStatus(session);
  await session.send(CMD_LEAVE, [0xff]);
  logStatus(log, status);
  renderNode(node).forEach(line => log(line));
  return { status, node };
}
