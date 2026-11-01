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
  if (!bundle) return install(`No update package for ${board ? board.label : 'this board'} yet; installing erases the node.`);
  if (!status || !status.ota) return install('This node runs an older beta; installing erases it. Later betas update in place.');
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
      manifest.imageLength !== data.length - RSOTA_MANIFEST_LEN ||
      await sha256Hex(data.slice(RSOTA_MANIFEST_LEN)) !== manifest.imageSha256) throw failed();
  return manifest;
}

const REFUSALS = {
  [RSNODE_RESULT.denied]: 'The node refused the update.',
  [RSNODE_RESULT.invalid]: 'The node did not accept the update request.',
  [RSNODE_RESULT.busy]: 'The node is taking another update. Try again in a few minutes.',
  [RSNODE_RESULT.unsupported]: 'This node cannot update over USB. Use Install.',
  [RSNODE_RESULT.storage]: 'The node could not write the update to its flash. Its current firmware keeps running.',
  [RSNODE_RESULT.rejected]: 'The node rejected the update: its signature, board or sequence does not match. Nothing changed.',
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
  const chunkMax = Math.min(CHUNK_MAX, (begin.body[4] << 8) | begin.body[5]) || CHUNK_MAX;
  let offset = u32(begin.body, 0), gaps = 0;
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
  const finish = await exchange(session, SUB_FINISH, [], FINISH_TIMEOUT_MS);
  if (!finish) throw new Error('The node did not confirm the finished update. Check its screen, then read its status.');
  if (finish.result !== RSNODE_RESULT.ok) throw refusal(finish.result, 'finishing');
}

// The node restarts into the new image on trial, then confirms it or goes back to the old one.
async function confirm(session, bundle, previous, onProgress) {
  onProgress({ stage: 'restarting' });
  await sleep(RESTART_SETTLE_MS);
  const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = await waitForRsnode(session, { timeoutMs: deadline - Date.now() }) ? await readRsnodeStatus(session) : null;
    if (status && status.ota) {
      const trial = updateStaged(status);
      onProgress({ stage: trial ? 'trial' : 'confirming', release: status.release });
      // The accepted sequence is what the node committed; the release names it.
      if (!trial && status.ota.acceptedSequence >= bundle.sequence) {
        const release = status.release || bundle.version;
        return { kind: 'updated', release, message: `Updated to ${release}. Identity, managers and settings kept.` };
      }
      if (!trial && status.release !== bundle.version) {
        const release = status.release || previous || 'its previous firmware';
        return { kind: 'rolled-back', release: status.release,
          message: `The update did not start correctly; the node went back to ${release}.` };
      }
    }
    await sleep(Math.min(CONFIRM_POLL_MS, Math.max(0, deadline - Date.now())));
  }
  throw new Error('The node did not confirm the update within 3 minutes. Check its screen; it keeps the new firmware or goes back on its own.');
}

/**
 * Sends a verified .rsota to the node over an open KISS session (stop-and-wait, resuming where a
 * Gap says), follows the restart and reports { kind: 'updated' | 'rolled-back', release, message }.
 * onProgress gets { stage: 'writing', sent, total }, then 'restarting', 'trial' and 'confirming'.
 */
export async function streamRsnodeUpdate(session, bundleBytes, onProgress = () => {}, bundle) {
  const data = bundleBytes instanceof Uint8Array ? bundleBytes : new Uint8Array(bundleBytes);
  const before = await readRsnodeStatus(session);
  const choice = chooseRsnodeInstall(before, null, bundle);
  if (choice.kind !== 'update') throw Object.assign(new Error(choice.message), { choice });
  await transfer(session, data, onProgress);
  return confirm(session, bundle, before.release, onProgress);
}
