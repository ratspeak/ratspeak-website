import { sha256Hex } from './handheld-release.js';

// otaBoard is the board byte of the node's target, which its status reports. ESP32-S3 boards
// install a factory image over USB; nRF52840 boards install a UF2 through their bootloader drive.
// screen: false is a board with no screen: the flasher's status check and its lights stand in for one.
// wifi: false is a board with no Wi-Fi, so no Wi-Fi settings and no uplink.
const ESP = { chipFamily: 'ESP32-S3', installMode: 'factory' };
const NRF = { chipFamily: 'nRF52840', installMode: 'uf2', wifi: false };
const BOARDS = Object.freeze({
  'heltec-v3': { ...ESP, label: 'Heltec V3', flashSize: '8MB', capacity: 8 * 1024 * 1024, otaBoard: 0x3a },
  'heltec-v4': { ...ESP, label: 'Heltec V4 · R2', flashSize: '16MB', capacity: 16 * 1024 * 1024, otaBoard: 0x3f },
  'heltec-v4-r8': { ...ESP, label: 'Heltec V4 · R8', flashSize: '16MB', capacity: 16 * 1024 * 1024, otaBoard: 0xbf },
  'heltec-v4-r8-tft': { ...ESP, label: 'Heltec V4 · R8 TFT', flashSize: '16MB', capacity: 16 * 1024 * 1024, otaBoard: 0xc0 },
  'heltec-t114': { ...NRF, label: 'Heltec T114', otaBoard: 0x3c,
    uf2: { base: 0x26000, end: 0xe8000, family: 0xada52840, drive: 'HT-n5262' } },
  't-echo': { ...NRF, label: 'LilyGO T-Echo', otaBoard: 0x44,
    uf2: { base: 0x26000, end: 0xef000, family: 0xada52840, drive: 'TECHOBOOT' } },
  // Its bootloader drive name is not verified, so none is recorded.
  'thinknode-m1': { ...NRF, label: 'Elecrow ThinkNode M1', otaBoard: 0xc4,
    uf2: { base: 0x26000, end: 0xef000, family: 0xada52840 } },
  'rak4631': { ...NRF, label: 'RAK4631', otaBoard: 0x51, screen: false,
    uf2: { base: 0x26000, end: 0xef000, family: 0xada52840, drive: 'RAK4631' } },
  'heltec-wsl-v3': { ...ESP, label: 'Heltec Wireless Stick Lite V3', flashSize: '8MB', capacity: 8 * 1024 * 1024, otaBoard: 0xba,
    screen: false }
});
const UF2_BLOCK = 512;
const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

export function rsnodeBoard(id) {
  return owns(BOARDS, id) ? { id, ...BOARDS[id] } : null;
}

/** The board a node's status names by its update target, or null. */
export function rsnodeBoardForTarget(board) {
  const id = Object.keys(BOARDS).find(key => BOARDS[key].otaBoard === board);
  return id ? rsnodeBoard(id) : null;
}

export async function betaRequest(action, body, options = {}) {
  const query = new URLSearchParams({ action, ...options.query });
  const response = await fetch('/api/rsnode-beta?' + query, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
    signal: options.signal,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  if (!response.ok) {
    let message = 'The beta could not be loaded. Try again.';
    try {
      const result = await response.json();
      if (typeof result.error === 'string') message = result.error;
    } catch { /* A failed proxy response is not necessarily JSON. */ }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return options.binary ? response.arrayBuffer() : response.json();
}

/** A board's optional signed update (.rsota): true when absent or well formed for that board. */
export function validUpdateMetadata(update, board) {
  if (update === undefined) return true;
  if (board.installMode !== 'factory') return false;
  const target = /^([a-f0-9]{2}):([a-f0-9]{2}):([a-f0-9]{2})$/.exec(update && update.otaTarget || '');
  return !!(update && typeof update === 'object' && target && target[1] === '80' && target[2] === '81' &&
    parseInt(target[3], 16) === board.otaBoard &&
    typeof update.fileName === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.rsota$/.test(update.fileName) &&
    Number.isSafeInteger(update.size) && update.size > 128 && update.size <= 4 * 1024 * 1024 &&
    /^[a-f0-9]{64}$/.test(update.sha256 || '') &&
    Number.isSafeInteger(update.sequence) && update.sequence >= 1 && update.sequence <= 0xffffffff &&
    /^[a-f0-9]{16}$/.test(update.releaseKeyId || '') &&
    typeof update.version === 'string' && /^[\x21-\x7e]{1,24}$/.test(update.version));
}

export function validateBetaCatalog(catalog) {
  if (!catalog || !Array.isArray(catalog.boards) || catalog.boards.length > Object.keys(BOARDS).length) {
    throw new Error('The beta board list is unavailable. Try again.');
  }
  const seen = new Set();
  for (const metadata of catalog.boards) {
    const board = rsnodeBoard(metadata.id);
    if (!board || seen.has(board.id) || metadata.chipFamily !== board.chipFamily ||
        metadata.installMode !== board.installMode || metadata.flashSize !== board.flashSize ||
        typeof metadata.version !== 'string' ||
        !metadata.version || typeof metadata.fileName !== 'string' ||
        !/^[a-zA-Z0-9._-]+\.zip$/.test(metadata.fileName) ||
        !Number.isSafeInteger(metadata.size) || metadata.size <= 0 || metadata.size > 4 * 1024 * 1024 ||
        !/^[a-f0-9]{64}$/.test(metadata.sha256 || '') || !validUpdateMetadata(metadata.update, board)) {
      throw new Error('The beta package details are incomplete. Nothing has been flashed.');
    }
    seen.add(board.id);
  }
  return catalog.boards;
}

export async function verifyBetaDownload(buffer, metadata) {
  validateBetaCatalog({ boards: [metadata] });
  if (buffer.byteLength !== metadata.size || await sha256Hex(buffer) !== metadata.sha256) {
    throw new Error('Firmware download failed verification. Choose the board again to retry.');
  }
}

/** A UF2 for the board's bootloader: nRF52840 family, contiguous 256-byte blocks from the app base, clear of storage. */
export function validUf2(bytes, board) {
  const layout = board.uf2;
  const count = bytes.length / UF2_BLOCK;
  if (!layout || !Number.isInteger(count) || count < 1) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < count; index++) {
    const at = index * UF2_BLOCK;
    const word = offset => view.getUint32(at + offset, true);
    if (word(0) !== 0x0a324655 || word(4) !== 0x9e5d5157 || word(508) !== 0x0ab16f30 || word(8) !== 0x2000 ||
        word(12) !== layout.base + index * 256 || word(16) !== 256 || word(20) !== index || word(24) !== count ||
        word(28) !== layout.family) return false;
  }
  return layout.base + count * 256 <= layout.end;
}

async function validateUf2Manifest(zip, manifest, board) {
  if (manifest.installMode !== 'uf2' || manifest.chipFamily !== board.chipFamily ||
      !Array.isArray(manifest.parts) || manifest.parts.length !== 1) {
    throw new Error('This is not a supported rsNode package for the selected board.');
  }
  const part = manifest.parts[0];
  if (!part || part.path !== 'firmware.uf2' || !Number.isSafeInteger(part.size) || part.size < UF2_BLOCK ||
      part.size > 2 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(part.sha256 || '')) {
    throw new Error('Invalid rsNode firmware file layout.');
  }
  const entry = zip.file(part.path);
  if (!entry || entry.dir) throw new Error('The rsNode package is missing its firmware file.');
  const bytes = await entry.async('uint8array');
  if (bytes.length !== part.size || await sha256Hex(bytes) !== part.sha256) {
    throw new Error('The rsNode firmware file failed verification.');
  }
  if (!validUf2(bytes, board)) throw new Error('The rsNode firmware file does not match this board.');
  return { bytes, board: board.id, boardLabel: board.label, installMode: 'uf2', product: 'rsnode',
    fileName: `rsnode-${board.id}-${manifest.version}.uf2`, drive: board.uf2.drive || null };
}

export async function validateBetaManifest(zip, manifest, metadata) {
  const board = rsnodeBoard(manifest && manifest.board);
  if (board && board.installMode === 'uf2' && metadata && metadata.id === board.id &&
      manifest.version === metadata.version && manifest.schemaVersion === 1 && manifest.product === 'rsnode') {
    return validateUf2Manifest(zip, manifest, board);
  }
  if (!board || board.installMode !== 'factory' || !metadata || metadata.id !== board.id || manifest.version !== metadata.version ||
      manifest.schemaVersion !== 1 || manifest.product !== 'rsnode' || manifest.installMode !== 'factory' ||
      manifest.chipFamily !== 'ESP32-S3' || manifest.flashSize !== board.flashSize ||
      manifest.flashMode !== 'dio' || !['40m', '80m'].includes(manifest.flashFreq) ||
      !Array.isArray(manifest.parts) || manifest.parts.length !== 1) {
    throw new Error('This is not a supported rsNode factory package for the selected board.');
  }
  const part = manifest.parts[0];
  if (!part || part.path !== 'firmware.bin' || part.offset !== 0 ||
      !Number.isSafeInteger(part.size) || part.size < 0x10000 || part.size > board.capacity ||
      !/^[a-f0-9]{64}$/.test(part.sha256 || '')) {
    throw new Error('Invalid rsNode factory image layout.');
  }
  const entry = zip.file(part.path);
  if (!entry || entry.dir) throw new Error('The rsNode package is missing its factory image.');
  const bytes = await entry.async('uint8array');
  if (bytes.length !== part.size || await sha256Hex(bytes) !== part.sha256) {
    throw new Error('The rsNode factory image failed verification.');
  }
  const frequency = { 0: '40m', 15: '80m' }[bytes[3] & 15];
  if (bytes[0] !== 0xe9 || bytes[2] !== 2 || bytes[3] >> 4 !== (board.flashSize === '8MB' ? 3 : 4) ||
      bytes[12] !== 9 || bytes[13] !== 0 || frequency !== manifest.flashFreq) {
    throw new Error('The rsNode image chip or flash settings do not match its manifest.');
  }
  return { bytes, address: 0, board: board.id, boardLabel: board.label, installMode: 'factory',
    product: 'rsnode', flashOptions: { flashSize: manifest.flashSize, flashMode: manifest.flashMode, flashFreq: manifest.flashFreq } };
}
