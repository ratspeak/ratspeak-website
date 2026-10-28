import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { handheldPackage, handheldRelease, identifyHandheldImage, isLauncherImage,
  validateHandheldImage, verifyHandheldDownload, sha256Hex } from '../assets/js/handheld-release.js';

const downloadHtml = readFileSync(new URL('../download.html', import.meta.url), 'utf8');

function extractFunction(name) {
  const start = downloadHtml.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const open = downloadHtml.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < downloadHtml.length; i += 1) {
    if (downloadHtml[i] === '{') depth += 1;
    if (downloadHtml[i] === '}') {
      depth -= 1;
      if (depth === 0) return downloadHtml.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

test('only confirmed handheld factory installs erase internal storage', () => {
  const source = extractFunction('shouldEraseBeforeFlash');
  const shouldErase = vm.runInNewContext(`(${source})`, { state: { eraseAll: false } });

  assert.equal(shouldErase({ installMode: 'factory' }), true);
  assert.equal(shouldErase({ installMode: 'update' }), false);
  assert.equal(shouldErase({}), false);
});

test('custom firmware keeps the explicit full-erase choice', () => {
  const source = extractFunction('shouldEraseBeforeFlash');
  const shouldErase = vm.runInNewContext(`(${source})`, { state: { eraseAll: true } });

  assert.equal(shouldErase({ installMode: 'update' }), true);
  assert.equal(shouldErase({}), true);
});

test('erase confirmation uses conditional data-loss copy', () => {
  assert.match(extractFunction('confirmFactoryInstall'), /All data in internal storage will be lost/);
  assert.doesNotMatch(downloadHtml, /These packages are fresh installs|new Rust messaging backend|Before you flash|This is a fresh install|installDialogBackup/);
  assert.match(downloadHtml, /eraseAll: eraseBeforeFlash/);
  assert.match(downloadHtml, /<span class="flash-option-pill__label">Full Erase<\/span>/);
});


test('preserving handheld updates ignore stale custom erase state', () => {
  const shouldErase = vm.runInNewContext(`(${extractFunction('shouldEraseBeforeFlash')})`, { state: { eraseAll: true } });
  assert.equal(shouldErase({ product: 'ratspeak-handheld', installMode: 'update' }), false);
  assert.equal(shouldErase({ product: 'ratspeak-handheld', installMode: 'factory' }), true);
});

function handheldFlow(overrides = {}) {
  const state = { device: 'tdeck', selectedPackage: 'full', firmwareReady: true, eraseAll: false, ...overrides.state };
  const calls = [];
  const prepared = { product: 'ratspeak-handheld', board: 'tdeck', package: 'full', version: '2.3.0',
    installMode: 'factory', fileArray: [{ address: 0, data: 'factory' }], ...overrides.prepared };
  const installed = { status: 'recognized', package: 'full', ...overrides.installed };
  const plan = { installMode: 'update', parts: [{ address: 0x110000, bytes: new Uint8Array([1]), unchanged: false }],
    ...overrides.plan };
  const context = { state, inspectHandheld: async () => installed, handheldUpdatePlan: async () => plan,
    handheldConfirmation: () => ({ action: 'Erase and install' }),
    confirmFactoryInstall: async () => { calls.push('confirm'); return overrides.accept ?? true; },
    uint8ToBstr: () => 'application', buildPackagePicker: () => calls.push('picker'), DEVICES: { tdeck: {} },
    selectedPackageLabel: () => state.selectedPackage, fetchFirmwareFromRelease: async () => calls.push('fetch'),
    prepareFileArray: async () => ({ ...prepared, package: state.selectedPackage }) };
  const run = vm.runInNewContext(`(async ${extractFunction('prepareHandheldInstall')})`, context);
  return { run: () => run({}, prepared, () => {}), calls, state };
}

test('compatible update starts without confirmation and never writes the merged factory image', async () => {
  const flow = handheldFlow(); const result = await flow.run();
  assert.equal(result.installMode, 'update');
  assert.equal(result.fileArray[0].address, 0x110000);
  assert.equal(result.flashOptions.flashMode, 'keep');
  assert.deepEqual(flow.calls, []);
});

test('already-current firmware skips unnecessary flash writes', async () => {
  const flow = handheldFlow({ plan: { upToDate: true, parts: [{ unchanged: true }] } });
  assert.equal((await flow.run()).fileArray.length, 0);
  assert.deepEqual(flow.calls, []);
});

for (const accept of [false, true]) test(`unknown installation requires consent: ${accept}`, async () => {
  const flow = handheldFlow({ installed: { status: 'unknown', reconnect: true }, plan: { installMode: undefined }, accept });
  const result = await flow.run(); assert.deepEqual(flow.calls, ['confirm']);
  if (!accept) assert.equal(result, null);
  else { assert.equal(result.installMode, 'factory'); assert.equal(result.reconnect, true); }
});

test('an explicit fresh installation still requires confirmation', async () => {
  const flow = handheldFlow({ state: { eraseAll: true }, accept: false });
  assert.equal(await flow.run(), null); assert.deepEqual(flow.calls, ['confirm']);
});

test('default package follows the installed arrangement, explicit selection does not', async () => {
  const automatic = handheldFlow({ installed: { package: 'standalone' } });
  assert.equal((await automatic.run()).package, 'standalone');
  assert.deepEqual(automatic.calls, ['picker', 'fetch']);
  const explicit = handheldFlow({ installed: { package: 'standalone' }, state: { packageExplicit: true },
    plan: { installMode: undefined }, accept: false });
  assert.equal(await explicit.run(), null); assert.deepEqual(explicit.calls, ['confirm']);
});

function espImage(size, entryOffset) {
  const bytes = new Uint8Array(size);
  bytes[0] = 0xE9;
  if (entryOffset != null) bytes.set([0xAA, 0x50, 0x01, 0x02, entryOffset & 0xFF, (entryOffset >> 8) & 0xFF, entryOffset >> 16, 0], 0x8000);
  return bytes;
}

async function prepareSingleBin(name, bytes, customOffsets = null) {
  const state = { device: 'custom', customOffsets, customFile: { name, arrayBuffer: async () => bytes.buffer } };
  const context = { state, isRsnodeSelected: () => false, uint8ToBstr: () => 'image', formatBytes: String, CUSTOM_FLASH_DEFAULTS: {},
    identifyHandheldImage, validateHandheldImage, DEVICES: { tdeck: { name: 'T-Deck' }, cardputer: { name: 'Cardputer' } } };
  const prepare = vm.runInNewContext(`${extractFunction('isMergedImage')}; (async ${extractFunction('prepareFileArray')})`, context);
  return prepare(() => {});
}

async function singleBinAddress(name, bytes, customOffsets = null) {
  return (await prepareSingleBin(name, bytes, customOffsets)).fileArray[0].address;
}

const REVISION = 'a'.repeat(40);
const component = (board, role, version = '2.3.4', revision = REVISION, dirty = 0) =>
  `RATSPEAK-HANDHELD-COMPONENT:v1:${board}:${role}:${version}:${revision}:${dirty}\0`;

// Factory-image shape: ESP32-S3 DIO bootloader header, a table, and embedded identities.
function releaseImage(board, identities, { freq = 0xf, storageInside = false } = {}) {
  const bytes = new Uint8Array(0x60000).fill(0xff);
  bytes.set([0xe9, 3, 2, ((board === 'cardputer' ? 3 : 4) << 4) | freq], 0);
  bytes[12] = 9; bytes[13] = 0;
  const row = (index, type, subtype, offset) => {
    const view = new DataView(bytes.buffer, 0x8000 + index * 32, 32);
    bytes.set([0xaa, 0x50, type, subtype], 0x8000 + index * 32);
    view.setUint32(4, offset, true); view.setUint32(8, 0x10000, true);
  };
  row(0, 1, 0x02, 0x9000);
  row(1, 0, 0x10, 0x10000);
  row(2, 1, 0x82, storageInside ? 0x50000 : 0x810000);
  identities.forEach((identity, index) => bytes.set(new TextEncoder().encode(identity), 0x10100 + index * 0x10000));
  return bytes;
}

test('a complete handheld .bin uploaded under Build your own is written at 0x0', async () => {
  assert.equal(await singleBinAddress('tdeck-standalone.bin', espImage(0x9000, 0x9000)), 0);
  assert.equal(await singleBinAddress('firmware.bin', espImage(0x9000)), 0x10000);
  assert.equal(await singleBinAddress('firmware.bin', espImage(0x9000, 0x1234)), 0x10000);
  assert.equal(await singleBinAddress('firmware-merged.bin', espImage(0x100)), 0);
  assert.equal(await singleBinAddress('tdeck-standalone.bin', espImage(0x9000, 0x9000), [0x10000]), 0x10000);
});

test('releases from 2.3.4 download bare images; earlier ones keep their ZIPs', () => {
  const name = (tag, mode) => handheldPackage(handheldRelease('tdeck', tag), mode).fileName;
  assert.equal(name('v2.3.3', 'full'), 'tdeck-full.zip');
  assert.equal(name('v2.3.4', 'full'), 'tdeck-full.bin');
  assert.equal(name('v2.4.0', 'rnode'), 'tdeck-rnode.bin');
  assert.equal(name('v3.0.0-beta.1', 'standalone'), 'tdeck-standalone.bin');
  assert.equal(handheldPackage(handheldRelease('tpager', 'v2.3.4'), 'standalone').fileName, 'pager-standalone.bin');
  assert.equal(handheldPackage(handheldRelease('m9', 'v2.3.4')).fileName, 'm9-standalone.bin');
});

test('a release image names its board, package and version without a manifest', () => {
  const full = releaseImage('tdeck', ['launcher', 'standalone', 'rnode'].map(role => component('tdeck', role)));
  assert.deepEqual({ ...identifyHandheldImage(full) }, { board: 'tdeck', package: 'full', version: '2.3.4', revision: REVISION,
    flashMode: 'dio', flashSize: '16MB', flashFreq: '80m' });
  const rnode = releaseImage('cardputer', [component('cardputer', 'rnode')], { freq: 0 });
  assert.equal(identifyHandheldImage(rnode).package, 'rnode');
  assert.equal(identifyHandheldImage(rnode).flashSize, '8MB');
  assert.equal(identifyHandheldImage(rnode).flashFreq, '40m');
  const prepared = validateHandheldImage(full, { board: 'tdeck', package: 'full', version: 'v2.3.4' });
  assert.equal(prepared.address, 0); assert.equal(prepared.installMode, 'factory'); assert.equal(prepared.bytes, full);
  assert.throws(() => validateHandheldImage(full, { board: 'tpager' }), /different device/);
  assert.throws(() => validateHandheldImage(full, { package: 'standalone' }), /different device or mode/);
  assert.throws(() => validateHandheldImage(full, { version: 'v2.3.3' }), /different release/);
});

test('mixed, dirty, partial or unsupported images are not identified', () => {
  const cases = [
    [component('tdeck', 'launcher'), component('tdeck', 'standalone', '2.3.3'), component('tdeck', 'rnode')],
    [component('tdeck', 'standalone'), component('tpager', 'rnode')],
    [component('tdeck', 'standalone', '2.3.4', 'b'.repeat(40)), component('tdeck', 'rnode')],
    [component('tdeck', 'standalone', '2.3.4', REVISION, 1)],
    [component('tdeck', 'launcher'), component('tdeck', 'standalone')],
    [component('m9', 'rnode')],
    [component('unknown', 'standalone')],
    [],
  ];
  for (const identities of cases) assert.equal(identifyHandheldImage(releaseImage('tdeck', identities)), null);
  assert.equal(identifyHandheldImage(releaseImage('tdeck', [component('cardputer', 'standalone')])), null);
  const wrongChip = releaseImage('tdeck', [component('tdeck', 'standalone')]);
  wrongChip[12] = 5;
  assert.equal(identifyHandheldImage(wrongChip), null);
  assert.throws(() => validateHandheldImage(wrongChip), /Unsupported handheld image/);
});

test('Launcher images are refused by the web flasher', () => {
  const standalone = releaseImage('tdeck', [component('tdeck', 'standalone')]);
  const launcher = releaseImage('tdeck', [component('tdeck', 'standalone')], { storageInside: true });
  assert.equal(isLauncherImage(standalone), false);
  assert.equal(isLauncherImage(launcher), true);
  assert.throws(() => validateHandheldImage(launcher), /bmorcelli's Launcher/);
});

test('release .bin downloads are checked against the GitHub digest like ZIPs', async () => {
  const bytes = releaseImage('tdeck', [component('tdeck', 'standalone')]);
  const metadata = { product: 'ratspeak-handheld', installMode: 'factory', board: 'tdeck', package: 'standalone',
    fileName: 'tdeck-standalone.bin', size: bytes.length, sha256: await sha256Hex(bytes) };
  await verifyHandheldDownload(bytes.buffer, metadata);
  await assert.rejects(verifyHandheldDownload(bytes.buffer, { ...metadata, fileName: 'tdeck-standalone-launcher.bin' }), /metadata/);
  await assert.rejects(verifyHandheldDownload(bytes.buffer, { ...metadata, sha256: 'b'.repeat(64) }), /SHA-256/);
});

test('a release .bin uploaded under Build your own is verified and flashed like the download', async () => {
  const image = releaseImage('cardputer', ['launcher', 'standalone', 'rnode'].map(role => component('cardputer', role)), { freq: 0 });
  const prepared = await prepareSingleBin('anything.bin', image);
  assert.equal(prepared.product, 'ratspeak-handheld');
  assert.equal(prepared.board, 'cardputer'); assert.equal(prepared.package, 'full'); assert.equal(prepared.version, '2.3.4');
  assert.equal(prepared.fileArray[0].address, 0);
  assert.deepEqual({ ...prepared.flashOptions }, { flashMode: 'dio', flashSize: '8MB', flashFreq: '40m' });
  const launcher = releaseImage('tdeck', [component('tdeck', 'standalone')], { storageInside: true });
  await assert.rejects(prepareSingleBin('tdeck-standalone-launcher.bin', launcher), /bmorcelli's Launcher/);
});
