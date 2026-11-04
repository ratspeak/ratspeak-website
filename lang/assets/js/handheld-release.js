// Pin automatic downloads to a reviewed public release. Null disables them.
export const HANDHELD_RELEASE_TAG = 'v2.3.4';

export const HANDHELD_REPOSITORY = 'ratspeak/ratspeak-handheld';
const ALL_PACKAGES = ['full', 'standalone', 'rnode'];
const BOARDS = {
  tdeck: { prefix: 'tdeck', packages: ALL_PACKAGES },
  tpager: { prefix: 'pager', packages: ALL_PACKAGES },
  cardputer: { prefix: 'cardputer', packages: ALL_PACKAGES },
  m9: { prefix: 'm9', packages: ['standalone'] }
};
const LEGACY_BOARDS = { tdeck: 'rsdeck', tpager: 'rspager', cardputer: 'rscardputer' };
const ALIASES = { rsdeck: 'tdeck', ratdeck: 'tdeck', rspager: 'tpager', pager: 'tpager', rscardputer: 'cardputer', ratcom: 'cardputer', thinknode_m9: 'm9' };
const PACKAGES = { full: 'Full launcher', standalone: 'Standalone', rnode: 'RNode only' };
const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const supportsPackage = (board, packageId) => owns(BOARDS, board) && owns(PACKAGES, packageId) && BOARDS[board].packages.includes(packageId);
const prefixes = board => [BOARDS[board].prefix, LEGACY_BOARDS[board]].filter(Boolean);

export function handheldBoard(device) {
  const board = owns(ALIASES, device) ? ALIASES[device] : device;
  return owns(BOARDS, board) ? board : null;
}

export function handheldCapabilities(device) {
  const board = handheldBoard(device);
  if (!board) return null;
  return { board, prefix: BOARDS[board].prefix,
    packages: [...BOARDS[board].packages], defaultPackage: BOARDS[board].packages[0] };
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
  // M9 first shipped in 2.2.2. Do not invent packages for earlier releases.
  const [major, minor, patch] = tag.slice(1).split(/[.-]/).map(Number);
  if (board === 'm9' && (major < 2 || (major === 2 && (minor < 2 || (minor === 2 && patch < 2))))) return null;
  return { ...handheldCapabilities(board), tag, repo: HANDHELD_REPOSITORY,
    prefix: tag === 'v2.1.0' ? LEGACY_BOARDS[board] : BOARDS[board].prefix };
}

// From 2.3.4 releases publish bare factory images; earlier ones wrap them in ZIPs.
export function bareImageRelease(tag) {
  const [major, minor, patch] = tag.slice(1).split(/[.-]/).map(Number);
  return major > 2 || (major === 2 && (minor > 3 || (minor === 3 && patch >= 4)));
}

export function handheldPackage(release, packageId = release?.defaultPackage) {
  if (!release || !supportsPackage(release.board, packageId)) return null;
  return {
    ...release,
    package: packageId,
    packageLabel: PACKAGES[packageId],
    fileName: release.prefix + '-' + packageId + (bareImageRelease(release.tag) ? '.bin' : '.zip')
  };
}

export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

export async function verifyHandheldDownload(buffer, metadata) {
  if (!metadata || metadata.product !== 'ratspeak-handheld' || metadata.installMode !== 'factory' ||
      !supportsPackage(metadata.board, metadata.package) ||
      !prefixes(metadata.board).some(prefix => ['.zip', '.bin'].some(extension =>
        metadata.fileName === prefix + '-' + metadata.package + extension)) ||
      !Number.isSafeInteger(metadata.size) || metadata.size <= 0 || metadata.size > 20 * 1024 * 1024 ||
      buffer.byteLength !== metadata.size || !/^[a-f0-9]{64}$/.test(metadata.sha256 || '')) {
    throw new Error('Incomplete handheld release metadata. Nothing has been flashed.');
  }
  if (await sha256Hex(buffer) !== metadata.sha256) {
    throw new Error('Firmware download failed SHA-256 verification. Download it again.');
  }
}

const COMPONENT = /RATSPEAK-HANDHELD-COMPONENT:v1:([a-z0-9]+):([a-z]+):([0-9A-Za-z.-]+):([0-9a-f]{40}):([01])\0/g;
const ROLES = { 'launcher,rnode,standalone': 'full', standalone: 'standalone', rnode: 'rnode' };

// ESP32-S3 merged bootloader fields, matching the release producer's
// release_images.flash_settings contract. RNode uses 40 MHz; other packages
// may use 80 MHz. Never rewrite a verified image using guessed flash settings.
function factoryFlash(bytes, board) {
  const frequency = { 0: '40m', 15: '80m' }[bytes[3] & 15];
  if (bytes.length < 0x10000 || bytes[0] !== 0xe9 || bytes[2] !== 2 ||
      bytes[3] >> 4 !== (board === 'cardputer' ? 3 : 4) || bytes[12] !== 9 || bytes[13] !== 0 || !frequency) {
    return null;
  }
  return { flashMode: 'dio', flashSize: board === 'cardputer' ? '8MB' : '16MB', flashFreq: frequency };
}

// A release .bin names its board, package, version and source in the component
// identifiers the producer embeds in each application.
export function identifyHandheldImage(bytes) {
  const text = new TextDecoder('latin1').decode(bytes);
  const found = [...text.matchAll(COMPONENT)].map(match => match.slice(1));
  if (!found.length) return null;
  const [board, , version, revision] = found[0];
  const roles = found.map(([, role]) => role).sort().join(',');
  if (found.some(([b, , v, r, dirty]) => b !== board || v !== version || r !== revision || dirty !== '0') ||
      !owns(ROLES, roles) || !supportsPackage(board, ROLES[roles])) {
    return null;
  }
  const flash = factoryFlash(bytes, board);
  return flash && { board, package: ROLES[roles], version, revision, ...flash };
}

// Launcher images declare storage inside the file so bmorcelli's Launcher creates it.
export function isLauncherImage(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let row = 0x8000; row + 32 <= Math.min(bytes.length, 0x8c00); row += 32) {
    if (bytes[row] !== 0xaa || bytes[row + 1] !== 0x50) break;
    if (bytes[row + 2] === 1 && [0x81, 0x82, 0x83].includes(bytes[row + 3]) &&
        view.getUint32(row + 4, true) < bytes.length) return true;
  }
  return false;
}

export function validateHandheldImage(bytes, expected = {}) {
  const image = identifyHandheldImage(bytes);
  if (image && isLauncherImage(bytes)) {
    throw new Error('This image is for bmorcelli\'s Launcher. Use the Standalone .bin here.');
  }
  if (!image || bytes.length > (image.board === 'cardputer' ? 8 : 16) * 1024 * 1024) {
    throw new Error('Unsupported handheld image. Use a factory .bin built for your device.');
  }
  if ((expected.board && expected.board !== image.board) || (expected.package && expected.package !== image.package)) {
    throw new Error('This firmware image is for a different device or mode.');
  }
  if (expected.version && expected.version !== 'v' + image.version) {
    throw new Error('This firmware image is for a different release.');
  }
  return { ...image, bytes, address: 0, installMode: 'factory' };
}

// 2.3.3 and earlier: one factory image in a ZIP. Never infer an update offset,
// accept another board, or fall back to a legacy layout for these ZIPs.
export async function validateHandheldManifest(zip, manifest, expected = {}) {
  const board = manifest && manifest.board;
  const packageId = manifest && manifest.package;
  const flashSize = board === 'cardputer' ? '8MB' : '16MB';
  const capacity = board === 'cardputer' ? 8 * 1024 * 1024 : 16 * 1024 * 1024;
  if (!manifest || manifest.schemaVersion !== 1 || manifest.product !== 'ratspeak-handheld' ||
      !supportsPackage(board, packageId) || manifest.installMode !== 'factory' ||
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
  const names = prefixes(board).map(prefix => prefix + '-' + packageId + '.bin');
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
  const flash = factoryFlash(bytes, board);
  if (!flash || flash.flashFreq !== manifest.flashFreq) {
    throw new Error('Factory image chip or flash settings do not match its manifest.');
  }
  return { board, package: packageId, bytes, address: 0, installMode: 'factory' };
}
