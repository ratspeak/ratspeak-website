// Update (keeps identity, managers and settings) or Install (erases), and the signed update over USB
// (rsNode ADR 0015): CMD_RSNODE BEGIN, CHUNK and FINISH as rsNode's firmware/common/src/usb_board.rs
// answers them and scripts/rsnode-usb.py upload() sends them.
import { sha256Hex } from './handheld-release.js';
import { RSNODE_RESULT, readRsnodeStatus, rsnodeCommand, waitForRsnode } from './rsnode-device.js';

export const RSOTA_MANIFEST_LEN = 128;
const RSOTA_MAGIC = [0x52, 0x53, 0x4f, 0x54];
const RSOTA_VERSION = 1;
const SUB_BEGIN = 0x10;
const SUB_CHUNK = 0x11;
const SUB_FINISH = 0x12;
const SUB_ABORT = 0x13;
const CHUNK_MAX = 480;
// BEGIN checks the signature; FINISH verifies the whole image before it answers.
const BEGIN_TIMEOUT_MS = 15000;
const CHUNK_TIMEOUT_MS = 5000;
const FINISH_TIMEOUT_MS = 30000;
// Gaps in a row without progress before the transfer is given up.
const GAP_LIMIT = 4;
const RESTART_SETTLE_MS = 1000;
const CONFIRM_TIMEOUT_MS = 3 * 60 * 1000;
const CONFIRM_POLL_MS = 2000;

const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const u32 = (bytes, offset) => ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
const be32 = value => [value >>> 24, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** STATUS's board target as the catalog writes it: 'pp:mm:bb'. */
export function rsnodeOtaTarget(status) {
  const target = status && status.board;
  return target ? [target.platform, target.mcu, target.board].map(byte => byte.toString(16).padStart(2, '0')).join(':') : null;
}

const updateStaged = status => !!(status.ota && status.ota.trialPending) || status.pendingSequence !== null;

/**
 * Whether the node can take the board's signed update. kind: 'update' (Update primary, Install
 * secondary), 'current' (up to date; Install stays as "Erase and reinstall"), 'wait' or 'install'.
 */
export function chooseRsnodeInstall(status, board, bundle) {
  const install = message => ({ kind: 'install', update: false, message });
  if (!bundle) return install(`No update package is available for ${board ? board.label : 'this board'}. The Install action erases the node.`);
  if (!status || !status.ota) return install('This node did not report support for USB updates. The Install action erases the node.');
  if (rsnodeOtaTarget(status) !== bundle.otaTarget) return install('This node is a different board or variant.');
  if (status.releaseKeyId !== bundle.releaseKeyId) return install('This node trusts a different update key.');
  if (updateStaged(status)) return { kind: 'wait', update: false, message: 'Finishing its last update; try again in a minute.' };
  if (status.ota.acceptedSequence >= bundle.sequence) {
    return { kind: 'current', update: false, message: `Up to date${status.release ? ` with ${status.release}` : ''}.` };
  }
  return { kind: 'update', update: true,
    message: `Update ${status.release ? `from ${status.release} ` : ''}to ${bundle.version}. Identity, managers and settings stay.` };
}

/** The signed manifest of an .rsota (rsNode's package_ota.py create_manifest), unverified. */
export function parseRsnodeBundle(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data.length <= RSOTA_MANIFEST_LEN || RSOTA_MAGIC.some((byte, index) => data[index] !== byte) || data[4] !== RSOTA_VERSION) {
    throw new Error('This is not an rsNode update package.');
  }
  return {
    target: hex(data.slice(5, 8)).replace(/(..)(?=.)/g, '$1:'),
    sequence: u32(data, 8),
    imageLength: u32(data, 12),
    version: [0, 2, 4].map(offset => (data[16 + offset] << 8) | data[17 + offset]),
    imageSha256: hex(data.slice(24, 56))
  };
}

/** The downloaded .rsota is the catalog's: size, SHA-256, and a manifest naming its target and sequence. */
export async function verifyRsnodeBundle(bytes, bundle) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const failed = () => new Error('The update package failed verification. Choose the board again to retry.');
  if (!bundle || data.length !== bundle.size || await sha256Hex(data) !== bundle.sha256) throw failed();
  let manifest;
  try { manifest = parseRsnodeBundle(data); } catch { throw failed(); }
  if (manifest.target !== bundle.otaTarget || manifest.sequence !== bundle.sequence ||
      manifest.version.join('.') !== /^(\d+\.\d+\.\d+)(?:[-+][0-9A-Za-z.-]+)?$/.exec(bundle.version || '')?.[1] ||
      manifest.imageLength !== data.length - RSOTA_MANIFEST_LEN ||
      await sha256Hex(data.slice(RSOTA_MANIFEST_LEN)) !== manifest.imageSha256) throw failed();
  return manifest;
}

const REFUSALS = {
  [RSNODE_RESULT.denied]: 'The node refused the update.',
  [RSNODE_RESULT.invalid]: 'The node did not accept the update request.',
  [RSNODE_RESULT.busy]: 'The node is taking another update. Try again in a few minutes.',
  [RSNODE_RESULT.unsupported]: 'USB update support was not confirmed. Check the connection and firmware version. The Install action erases the node.',
  [RSNODE_RESULT.storage]: 'The node could not write the update to its flash. Its current firmware keeps running.',
  [RSNODE_RESULT.rejected]: 'The node rejected the update. Check the package signature, board and sequence.',
  [RSNODE_RESULT.refused]: 'Another app is using the node over Bluetooth or Wi-Fi. Disconnect it, then update again.',
  [RSNODE_RESULT.unavailable]: 'The node is finishing its last update. Try again in a minute.'
};

function refusal(result, where) {
  const text = REFUSALS[result] || `The node stopped the update (result ${result}).`;
  return Object.assign(new Error(where ? `${text} (${where})` : text), { result });
}

// Answers the transfer has queued stay out of the next exchange: every reply carries an absolute offset.
async function exchange(session, sub, body, timeoutMs) {
  while (await session.readFrame(null, 0));
  return rsnodeCommand(session, sub, body, timeoutMs);
}

async function abort(session) {
  try { await exchange(session, SUB_ABORT, [], 1000); } catch { /* The node drops an idle transfer itself. */ }
}

async function transfer(session, data, onProgress) {
  const manifest = Array.from(data.slice(0, RSOTA_MANIFEST_LEN));
  const image = data.subarray(RSOTA_MANIFEST_LEN);
  const begin = await exchange(session, SUB_BEGIN, manifest, BEGIN_TIMEOUT_MS);
  if (!begin) throw refusal(RSNODE_RESULT.unsupported);
  if (begin.result !== RSNODE_RESULT.ok) throw refusal(begin.result);
  if (begin.body.length !== 6) throw new Error('The node answered the update with a malformed reply.');
  const chunkMax = Math.min(CHUNK_MAX, (begin.body[4] << 8) | begin.body[5]);
  let offset = u32(begin.body, 0), gaps = 0;
  if (!chunkMax || offset > image.length) {
    await abort(session);
    throw new Error('The node returned an invalid update offset or chunk size. Nothing was staged.');
  }
  onProgress({ stage: 'writing', sent: offset, total: image.length });
  while (offset < image.length) {
    const body = [...be32(offset), ...image.subarray(offset, offset + chunkMax)];
    let reply = await exchange(session, SUB_CHUNK, body, CHUNK_TIMEOUT_MS);
    if (!reply) reply = await exchange(session, SUB_CHUNK, body, CHUNK_TIMEOUT_MS);
    if (!reply) {
      await abort(session);
      throw new Error(`The node stopped answering at byte ${offset}. Its current firmware keeps running; update again.`);
    }
    if ((reply.result !== RSNODE_RESULT.ok && reply.result !== RSNODE_RESULT.gap) || reply.body.length !== 4) {
      await abort(session);
      throw refusal(reply.result, `at byte ${offset}`);
    }
    const next = u32(reply.body, 0);
    if (next > image.length) {
      await abort(session);
      throw new Error('The node reported more bytes than the update holds.');
    }
    gaps = next > offset ? 0 : gaps + 1;
    if (gaps > GAP_LIMIT) {
      await abort(session);
      throw new Error(`The update made no progress at byte ${offset}. Its current firmware keeps running; update again.`);
    }
    offset = next;
    onProgress({ stage: 'writing', sent: offset, total: image.length });
  }
  // A reset can cut off the acknowledgement after staging succeeds. Only the
  // subsequent status can settle that outcome; do not abort or resend FINISH.
  let finish;
  try { finish = await exchange(session, SUB_FINISH, [], FINISH_TIMEOUT_MS); } catch { return; }
  if (!finish) return;
  if (finish.result !== RSNODE_RESULT.ok) throw refusal(finish.result, 'finishing');
}

const uncertain = message => Object.assign(new Error(message), { kind: 'uncertain' });

/** Classify a stable result using the exact signed image, never a release label alone. */
export function rsnodeUpdateOutcome(status, bundle, manifest, previous, sawTrial = false) {
  if (!status || !status.ota || updateStaged(status)) return null;
  if (rsnodeOtaTarget(status) !== bundle.otaTarget || status.releaseKeyId !== bundle.releaseKeyId) {
    throw uncertain('The connected node or its update key changed. Reconnect the original node and read its status.');
  }
  if (status.ota.acceptedSequence === bundle.sequence && status.image &&
      status.image.len === manifest.imageLength && status.image.sha256 === manifest.imageSha256 &&
      status.release === bundle.version) {
    return { kind: 'updated', release: status.release,
      message: `Updated to ${status.release}. Identity, managers and settings kept.` };
  }
  if (status.ota.acceptedSequence >= bundle.sequence) {
    throw uncertain('The node reports a different accepted update or running image. Read its status before retrying.');
  }
  const last = status.lastUpdate, before = previous && previous.lastUpdate;
  const rebooted = previous && status.uptimeS !== null && previous.uptimeS !== null && status.uptimeS < previous.uptimeS;
  const newRecord = last && (!before || before.sequence !== last.sequence || before.running !== last.running);
  if (last && last.sequence === bundle.sequence && !last.running && (sawTrial || rebooted || newRecord)) {
    const release = status.release || previous?.release || 'its previous firmware';
    return { kind: 'rolled-back', release: status.release,
      message: `The update did not start correctly; the node went back to ${release}.` };
  }
  return null;
}

// The node restarts into the new image on trial, then confirms it or goes back to the old one.
async function confirm(session, bundle, manifest, previous, onProgress, reconnect) {
  onProgress({ stage: 'restarting' });
  await sleep(RESTART_SETTLE_MS);
  const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
  let sawTrial = false;
  while (Date.now() < deadline) {
    let status = null;
    try {
      status = await waitForRsnode(session, { timeoutMs: Math.min(4000, deadline - Date.now()) })
        ? await readRsnodeStatus(session) : null;
    } catch { /* The USB handle can close while the node restarts. */ }
    if (status && status.ota) {
      const trial = updateStaged(status);
      if (status.ota.trialPending && (status.pendingSequence === bundle.sequence || status.image?.sha256 === manifest.imageSha256)) sawTrial = true;
      onProgress({ stage: trial ? 'trial' : 'confirming', release: status.release });
      const outcome = rsnodeUpdateOutcome(status, bundle, manifest, previous, sawTrial);
      if (outcome) return outcome;
    } else if (reconnect) {
      onProgress({ stage: 'reconnecting' });
      try { session = await reconnect(session) || session; } catch { /* Retry until the bounded confirmation deadline. */ }
    }
    await sleep(Math.min(CONFIRM_POLL_MS, Math.max(0, deadline - Date.now())));
  }
  throw uncertain('The node did not confirm the update within 3 minutes. Keep power connected, reconnect it and read its status before retrying.');
}

/**
 * Sends a verified .rsota to the node over an open KISS session (stop-and-wait, resuming where a
 * Gap says), follows the restart and reports { kind: 'updated' | 'rolled-back', release, message }.
 * onProgress gets { stage: 'writing', sent, total }, then 'restarting', 'trial' and 'confirming'.
 */
export async function streamRsnodeUpdate(session, bundleBytes, onProgress = () => {}, bundle, { reconnect } = {}) {
  const data = bundleBytes instanceof Uint8Array ? bundleBytes : new Uint8Array(bundleBytes);
  const manifest = await verifyRsnodeBundle(data, bundle);
  const before = await readRsnodeStatus(session);
  const choice = chooseRsnodeInstall(before, null, bundle);
  if (choice.kind !== 'update') throw Object.assign(new Error(choice.message), { choice });
  await transfer(session, data, onProgress);
  return confirm(session, bundle, manifest, before, onProgress, reconnect);
}
