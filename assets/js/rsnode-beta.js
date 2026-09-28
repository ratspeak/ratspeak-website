import { sha256Hex } from './handheld-release.js';

const BOARDS = Object.freeze({
  'heltec-v3': { label: 'Heltec V3', flashSize: '8MB', capacity: 8 * 1024 * 1024 },
  'heltec-v4': { label: 'Heltec V4 · R2', flashSize: '16MB', capacity: 16 * 1024 * 1024 },
  'heltec-v4-r8': { label: 'Heltec V4 · R8 (OLED)', flashSize: '16MB', capacity: 16 * 1024 * 1024 },
  'heltec-v4-r8-tft': { label: 'Heltec V4 R8 · Expansion Kit V2', flashSize: '16MB', capacity: 16 * 1024 * 1024 }
});
const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

export function rsnodeBoard(id) {
  return owns(BOARDS, id) ? { id, ...BOARDS[id] } : null;
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

export function validateBetaCatalog(catalog) {
  if (!catalog || !Array.isArray(catalog.boards) || catalog.boards.length > Object.keys(BOARDS).length) {
    throw new Error('The beta board list is unavailable. Try again.');
  }
  const seen = new Set();
  for (const metadata of catalog.boards) {
    const board = rsnodeBoard(metadata.id);
    if (!board || seen.has(board.id) || metadata.chipFamily !== 'ESP32-S3' ||
        metadata.flashSize !== board.flashSize || typeof metadata.version !== 'string' ||
        !metadata.version || typeof metadata.fileName !== 'string' ||
        !/^[a-zA-Z0-9._-]+\.zip$/.test(metadata.fileName) ||
        !Number.isSafeInteger(metadata.size) || metadata.size <= 0 || metadata.size > 4 * 1024 * 1024 ||
        !/^[a-f0-9]{64}$/.test(metadata.sha256 || '')) {
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

export async function validateBetaManifest(zip, manifest, metadata) {
  const board = rsnodeBoard(manifest && manifest.board);
  if (!board || !metadata || metadata.id !== board.id || manifest.version !== metadata.version ||
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
