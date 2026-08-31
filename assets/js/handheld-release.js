// Pin automatic downloads to a reviewed release. Null restores legacy routes.
export const HANDHELD_RELEASE_TAG = 'v2.1.0';

export const HANDHELD_REPOSITORY = 'ratspeak/ratspeak-handheld';
const BOARDS = { tdeck: 'rsdeck', tpager: 'rspager' };
const FACTORY_BOARDS = { ...BOARDS, cardputer: 'rscardputer' };
const ALIASES = { rsdeck: 'tdeck', ratdeck: 'tdeck', rspager: 'tpager' };
const PACKAGES = { full: 'Full launcher', standalone: 'Standalone', rnode: 'RNode only' };
const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export function handheldRelease(device, tag = HANDHELD_RELEASE_TAG) {
  const board = owns(ALIASES, device) ? ALIASES[device] : device;
  if (!tag || !owns(BOARDS, board)) return null;
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) {
    throw new Error('Invalid handheld release tag');
  }
  return { board, tag, repo: HANDHELD_REPOSITORY, prefix: BOARDS[board] };
}

export function handheldPackage(release, packageId = 'full') {
  if (!release || !owns(PACKAGES, packageId)) return null;
  return {
    ...release,
    package: packageId,
    packageLabel: PACKAGES[packageId],
    fileName: release.prefix + '-' + packageId + '.zip'
  };
}

export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

export async function verifyHandheldDownload(buffer, metadata) {
  if (!metadata || metadata.product !== 'ratspeak-handheld' || metadata.installMode !== 'factory' ||
      !owns(BOARDS, metadata.board) || !owns(PACKAGES, metadata.package) ||
      metadata.fileName !== BOARDS[metadata.board] + '-' + metadata.package + '.zip' ||
      !Number.isSafeInteger(metadata.size) || metadata.size <= 0 || metadata.size > 20 * 1024 * 1024 ||
      buffer.byteLength !== metadata.size || !/^[a-f0-9]{64}$/.test(metadata.sha256 || '')) {
    throw new Error('Incomplete handheld release metadata. Nothing has been flashed.');
  }
  if (await sha256Hex(buffer) !== metadata.sha256) {
    throw new Error('Firmware download failed SHA-256 verification. Download it again.');
  }
}

// Unified packages deliberately have one factory image. Never infer an update
// offset, accept another board, or fall back to a legacy layout for these ZIPs.
export async function validateHandheldManifest(zip, manifest, expected = {}) {
  const board = manifest && manifest.board;
  const packageId = manifest && manifest.package;
  const flashSize = board === 'cardputer' ? '8MB' : '16MB';
  const capacity = board === 'cardputer' ? 8 * 1024 * 1024 : 16 * 1024 * 1024;
  if (!manifest || manifest.schemaVersion !== 1 || manifest.product !== 'ratspeak-handheld' ||
      !owns(FACTORY_BOARDS, board) || !owns(PACKAGES, packageId) || manifest.installMode !== 'factory' ||
      manifest.chipFamily !== 'ESP32-S3' || manifest.flashSize !== flashSize ||
      manifest.flashMode !== 'dio' || manifest.flashFreq !== '80m' ||
      !Array.isArray(manifest.parts) || manifest.parts.length !== 1) {
    throw new Error('Unsupported handheld package. Use a factory ZIP built for your device.');
  }
  if ((expected.board && expected.board !== board) || (expected.package && expected.package !== packageId)) {
    throw new Error('This firmware package is for a different device or mode.');
  }
  const part = manifest.parts[0];
  const filename = FACTORY_BOARDS[board] + '-' + packageId + '.bin';
  if (!part || part.path !== filename || ![0, '0x0000', '0x0'].includes(part.offset) ||
      !Number.isSafeInteger(part.size) || part.size < 0x10000 || part.size > capacity ||
      !/^[a-f0-9]{64}$/.test(part.sha256 || '')) {
    throw new Error('Invalid handheld factory image layout.');
  }
  const file = zip.file(filename);
  if (!file || file.dir) throw new Error('Handheld package is missing its factory image.');
  const bytes = await file.async('uint8array');
  if (bytes.length !== part.size || bytes[0] !== 0xe9 || await sha256Hex(bytes) !== part.sha256) {
    throw new Error('Handheld factory image failed size or SHA-256 verification.');
  }
  return { board, package: packageId, bytes, address: 0, installMode: 'factory' };
}
