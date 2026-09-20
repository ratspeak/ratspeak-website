// Pin automatic downloads to a reviewed public release. Null disables them.
export const HANDHELD_RELEASE_TAG = 'v2.2.0';

export const HANDHELD_REPOSITORY = 'ratspeak/ratspeak-handheld';
const BOARDS = { tdeck: 'tdeck', tpager: 'pager', cardputer: 'cardputer' };
const LEGACY_BOARDS = { tdeck: 'rsdeck', tpager: 'rspager', cardputer: 'rscardputer' };
const ALIASES = { rsdeck: 'tdeck', ratdeck: 'tdeck', rspager: 'tpager', pager: 'tpager', rscardputer: 'cardputer', ratcom: 'cardputer' };
const PACKAGES = { full: 'Full launcher', standalone: 'Standalone', rnode: 'RNode only' };
const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export function handheldBoard(device) {
  const board = owns(ALIASES, device) ? ALIASES[device] : device;
  return owns(BOARDS, board) ? board : null;
}

export function handheldRelease(device, tag = HANDHELD_RELEASE_TAG) {
  const board = handheldBoard(device);
  if (!tag || !board) return null;
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) {
    throw new Error('Invalid handheld release tag');
  }
  // v2.1.0 did not publish Cardputer assets. Capability is separate from release
  // availability; retain this guard for links to that historical release.
  if (board === 'cardputer' && tag === 'v2.1.0') return null;
  return { board, tag, repo: HANDHELD_REPOSITORY, prefix: (tag === 'v2.1.0' ? LEGACY_BOARDS : BOARDS)[board] };
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
      ![BOARDS[metadata.board], LEGACY_BOARDS[metadata.board]].some(prefix => metadata.fileName === prefix + '-' + metadata.package + '.zip') ||
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
      !owns(BOARDS, board) || !owns(PACKAGES, packageId) || manifest.installMode !== 'factory' ||
      manifest.chipFamily !== 'ESP32-S3' || manifest.flashSize !== flashSize ||
      manifest.flashMode !== 'dio' || !['40m', '80m'].includes(manifest.flashFreq) ||
      !Array.isArray(manifest.parts) || manifest.parts.length !== 1) {
    throw new Error('Unsupported handheld package. Use a factory ZIP built for your device.');
  }
  if ((expected.board && expected.board !== board) || (expected.package && expected.package !== packageId)) {
    throw new Error('This firmware package is for a different device or mode.');
  }
  if (expected.version && expected.version !== 'v' + manifest.version) {
    throw new Error('This firmware package is for a different release.');
  }
  const part = manifest.parts[0];
  // Keep previously downloaded packages usable after the filename cleanup.
  const filename = part && part.path;
  const names = [BOARDS[board], LEGACY_BOARDS[board]].map(prefix => prefix + '-' + packageId + '.bin');
  if (!part || !names.includes(filename) || ![0, '0x0000', '0x0'].includes(part.offset) ||
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
  // ESP32-S3 merged bootloader fields, matching the release producer's
  // release_images.flash_settings contract. RNode uses 40 MHz; other packages
  // may use 80 MHz. Never rewrite a verified image using guessed flash settings.
  const frequency = { 0: '40m', 15: '80m' }[bytes[3] & 15];
  if (bytes[2] !== 2 || bytes[3] >> 4 !== (board === 'cardputer' ? 3 : 4) ||
      bytes[12] !== 9 || bytes[13] !== 0 || frequency !== manifest.flashFreq) {
    throw new Error('Factory image chip or flash settings do not match its manifest.');
  }
  return { board, package: packageId, bytes, address: 0, installMode: 'factory' };
}
