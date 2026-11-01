import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import { betaRequest, rsnodeBoard, validUpdateMetadata, validateBetaCatalog, verifyBetaDownload, validateBetaManifest } from '../assets/js/rsnode-beta.js';
import { sha256Hex } from '../assets/js/handheld-release.js';

globalThis.crypto ||= webcrypto;
const html = readFileSync(new URL('../download.html', import.meta.url), 'utf8');

function extractFunction(name) {
  const match = new RegExp(`(?:async )?function ${name}\\(`).exec(html);
  assert.ok(match, `missing ${name}`);
  const start = match.index;
  const open = html.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = open; i < html.length; i++) {
    const c = html[i], next = html[i + 1];
    if (lineComment) { if (c === '\n') lineComment = false; continue; }
    if (blockComment) { if (c === '*' && next === '/') { blockComment = false; i++; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '/' && next === '/') { lineComment = true; i++; continue; }
    if (c === '/' && next === '*') { blockComment = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error('Unterminated ' + name);
}

async function fixture(id = 'heltec-v4') {
  const board = rsnodeBoard(id);
  const bytes = new Uint8Array(0x10000);
  bytes[0] = 0xe9;
  bytes[2] = 2;
  bytes[3] = board.flashSize === '8MB' ? 0x30 : 0x40;
  bytes[12] = 9;
  const manifest = { schemaVersion: 1, product: 'rsnode', board: id, version: '1.0.0-beta.test',
    installMode: 'factory', chipFamily: 'ESP32-S3', flashSize: board.flashSize, flashMode: 'dio', flashFreq: '40m',
    parts: [{ path: 'firmware.bin', offset: 0, size: bytes.length, sha256: await sha256Hex(bytes) }] };
  const zip = { file: name => name === 'firmware.bin' ? { async: async () => bytes } : null };
  const metadata = { id, label: board.label, version: manifest.version, fileName: id + '.zip',
    size: 100, sha256: 'a'.repeat(64), chipFamily: 'ESP32-S3', flashSize: board.flashSize };
  return { bytes, manifest, zip, metadata };
}

test('beta board catalog permits only the four reviewed Heltec targets', async () => {
  for (const id of ['heltec-v3', 'heltec-v4', 'heltec-v4-r8', 'heltec-v4-r8-tft']) {
    const f = await fixture(id);
    assert.deepEqual(validateBetaCatalog({ boards: [f.metadata] }), [f.metadata]);
  }
  for (const id of ['constructor', '__proto__', 'heltec-t114', 'tdeck']) assert.equal(rsnodeBoard(id), null);
  const { metadata } = await fixture();
  for (const change of [{ id: 'heltec-t114' }, { flashSize: '8MB' }, { sha256: null }, { size: 0 },
    { size: 5 * 1024 * 1024 }, { chipFamily: 'ESP32' }, { fileName: '../secret.zip' }]) {
    assert.throws(() => validateBetaCatalog({ boards: [{ ...metadata, ...change }] }));
  }
  assert.throws(() => validateBetaCatalog({ boards: [metadata, metadata] }));
});

test('a board may carry a signed update for its own target; boards without one are unchanged', async () => {
  const targets = { 'heltec-v3': '3a', 'heltec-v4': '3f', 'heltec-v4-r8': 'bf', 'heltec-v4-r8-tft': 'c0' };
  for (const [id, board] of Object.entries(targets)) {
    const { metadata } = await fixture(id);
    const update = { fileName: `rsnode-${id}.rsota`, size: 1_500_000, sha256: 'b'.repeat(64), sequence: 2026110201,
      otaTarget: `80:81:${board}`, releaseKeyId: '0011223344556677', version: '1.0.0-beta.20261102.1' };
    assert.deepEqual(validateBetaCatalog({ boards: [{ ...metadata, update }] }), [{ ...metadata, update }]);
    assert.equal(validUpdateMetadata(undefined, rsnodeBoard(id)), true);
  }
  const { metadata } = await fixture();
  const update = { fileName: 'rsnode-heltec-v4.rsota', size: 1_500_000, sha256: 'b'.repeat(64), sequence: 2026110201,
    otaTarget: '80:81:3f', releaseKeyId: '0011223344556677', version: '1.0.0-beta.20261102.1' };
  for (const change of [{ fileName: 'rsnode-heltec-v4.zip' }, { fileName: '../x.rsota' }, { size: 128 }, { size: 4 * 1024 * 1024 + 1 },
    { size: 1.5 }, { sha256: 'B'.repeat(64) }, { sequence: 0 }, { sequence: 2 ** 32 }, { otaTarget: '80:81:bf' },
    { otaTarget: '80813f' }, { releaseKeyId: '00112233' }, { releaseKeyId: null }, { version: '' }, { version: 'has space' },
    { version: 'x'.repeat(25) }]) {
    assert.throws(() => validateBetaCatalog({ boards: [{ ...metadata, update: { ...update, ...change } }] }), JSON.stringify(change));
  }
  for (const bad of [null, 'update', []]) assert.throws(() => validateBetaCatalog({ boards: [{ ...metadata, update: bad }] }));
});

test('download verification rejects changed bytes and truncated packages', async () => {
  const { metadata } = await fixture();
  const bytes = new Uint8Array([1, 2, 3]);
  metadata.size = bytes.length;
  metadata.sha256 = await sha256Hex(bytes);
  await verifyBetaDownload(bytes.buffer, metadata);
  await assert.rejects(verifyBetaDownload(bytes.slice(0, 2).buffer, metadata), /verification/);
  await assert.rejects(verifyBetaDownload(new Uint8Array([1, 2, 4]).buffer, metadata), /verification/);
});

test('variant confirmation distinguishes the kit from either OLED board', () => {
  const describe = vm.runInNewContext('(' + extractFunction('rsnodeVariantDescription') + ')');
  assert.match(describe('heltec-v4-r8-tft'), /Expansion Kit V2.*touchscreen/);
  assert.match(describe('heltec-v4-r8'), /R8.*OLED/);
  assert.match(describe('heltec-v4'), /R2/);
});

test('all reviewed images validate as offset-zero factory installs with their actual flash settings', async () => {
  for (const id of ['heltec-v3', 'heltec-v4', 'heltec-v4-r8', 'heltec-v4-r8-tft']) {
    const f = await fixture(id);
    const result = await validateBetaManifest(f.zip, f.manifest, f.metadata);
    assert.equal(result.product, 'rsnode');
    assert.equal(result.board, id);
    assert.equal(result.address, 0);
    assert.equal(result.installMode, 'factory');
    assert.equal(result.flashOptions.flashSize, f.metadata.flashSize);
    assert.equal(result.flashOptions.flashFreq, '40m');
    assert.equal(result.bytes, f.bytes);
  }
});

test('manifest rejects substituted board, update layout, wrong chip, and missing or altered images', async () => {
  const f = await fixture();
  for (const change of [{ board: 'heltec-v4-r8' }, { version: 'other' }, { installMode: 'update' },
    { product: 'ratspeak-handheld' }, { chipFamily: 'ESP32' }, { flashSize: '8MB' }, { flashMode: 'qio' },
    { parts: [{ ...f.manifest.parts[0], offset: 0x10000 }] }, { parts: [{ ...f.manifest.parts[0], path: 'source.tar.gz' }] }]) {
    await assert.rejects(validateBetaManifest(f.zip, { ...f.manifest, ...change }, f.metadata));
  }
  await assert.rejects(validateBetaManifest({ file: () => null }, f.manifest, f.metadata), /missing/);
  f.bytes[200] = 1;
  await assert.rejects(validateBetaManifest(f.zip, f.manifest, f.metadata), /verification/);
});

test('a self-consistent manifest cannot disguise a different image chip or flash header', async () => {
  for (const [offset, value] of [[0, 0], [2, 0], [3, 0x30], [3, 0x4f], [12, 0], [13, 1]]) {
    const f = await fixture();
    f.bytes[offset] = value;
    f.manifest.parts[0].sha256 = await sha256Hex(f.bytes);
    await assert.rejects(validateBetaManifest(f.zip, f.manifest, f.metadata), /chip or flash/);
  }
});

test('beta requests use same-origin non-cached requests and retain auth failure status', async () => {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return Response.json({ stage: 'terms' }); };
  try {
    await betaRequest('login', { password: 'test-only' });
    await betaRequest('session');
    assert.equal(calls[0].url, '/api/rsnode-beta?action=login');
    assert.equal(calls[0].options.credentials, 'same-origin');
    assert.equal(calls[0].options.cache, 'no-store');
    assert.equal(calls[0].options.redirect, 'error');
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[1].options.method, 'GET');
    assert.equal(calls[1].options.body, undefined);
    globalThis.fetch = async () => Response.json({ error: 'Expired' }, { status: 401 });
    await assert.rejects(betaRequest('catalog'), error => error.status === 401 && error.message === 'Expired');
  } finally { globalThis.fetch = previous; }
});

test('late firmware responses cannot become current after a source, board, or device change', () => {
  const state = { device: 'custom', customSource: 'rsnode', firmwareRequestSerial: 4 };
  const current = vm.runInNewContext('(' + extractFunction('customRequestIsCurrent') + ')', { state });
  assert.equal(current(4, 'rsnode'), true);
  assert.equal(current(3, 'rsnode'), false);
  assert.equal(current(4, 'rnode'), false);
  state.device = 'tdeck';
  assert.equal(current(4, 'rsnode'), false);
});

test('locking clears private bytes, readiness, and package URL without corrupting another source', () => {
  const link = { hidden: false, href: '/private', removeAttribute(name) { delete this[name]; } };
  const state = { rsnodeAsset: new ArrayBuffer(10), rsnodeMetadata: {}, firmwareReady: true,
    firmwareAppBytes: new Uint8Array(10), firmwareBytes: new Uint8Array(10),
    rsnodeBundle: { bytes: new Uint8Array(10) }, rsnodeChoice: { kind: 'update', update: true }, rsnodeMode: 'update' };
  const context = { state, document: { getElementById: () => link }, isRsnodeSelected: () => true };
  const clear = vm.runInNewContext('(' + extractFunction('clearRsnodeFirmware') + ')', context);
  clear();
  for (const key of ['rsnodeAsset', 'rsnodeMetadata', 'firmwareAppBytes', 'firmwareBytes', 'rsnodeBundle', 'rsnodeChoice']) assert.equal(state[key], null);
  assert.equal(state.rsnodeMode, 'install');
  assert.equal(state.firmwareReady, false);
  assert.equal(link.hidden, true);
  assert.equal(link.href, undefined);
  context.isRsnodeSelected = () => false;
  state.firmwareReady = true;
  clear();
  assert.equal(state.firmwareReady, true);
});

test('rsNode never invokes upstream EEPROM provisioning, even with a leftover manual toggle', () => {
  const context = { state: { device: 'custom', rnodeProvision: true }, isRsnodeSelected: () => true,
    isOfficialRnodeFirmwareSelected: () => true };
  const shouldRun = vm.runInNewContext('(' + extractFunction('shouldRunRnodeSetup') + ')', context);
  assert.equal(shouldRun(), false);
  context.isRsnodeSelected = () => false;
  assert.equal(shouldRun(), true);
});

test('an authorized downloaded rsNode ZIP uploaded locally retains factory-install safeguards', async () => {
  const f = await fixture();
  const state = { device: 'custom', customFile: { name: 'rsnode.zip', arrayBuffer: async () => new ArrayBuffer(1) } };
  const context = { state, isRsnodeSelected: () => false,
    window: { JSZip: { loadAsync: async () => f.zip } },
    findManifestFile: () => ({ path: 'manifest.json', file: { async: async () => JSON.stringify(f.manifest) } }),
    validateBetaManifest, uint8ToBstr: value => Buffer.from(value).toString('binary') };
  const prepare = vm.runInNewContext('(' + extractFunction('prepareFileArray') + ')', context);
  const result = await prepare(() => {});
  assert.equal(result.product, 'rsnode');
  assert.equal(result.installMode, 'factory');
  assert.equal(result.board, 'heltec-v4');
  assert.equal(result.fileArray[0].address, 0);
  assert.equal(result.flashOptions.flashSize, '16MB');
  assert.equal(state.firmwareAppBytes, f.bytes);
});

test('session reads pause while a cookie-changing authentication request is in progress', async () => {
  let calls = 0;
  const refresh = vm.runInNewContext('(' + extractFunction('refreshBetaSession') + ')', {
    betaAuthBusy: true, betaRequest: async () => { calls++; }
  });
  await refresh(true, true);
  assert.equal(calls, 0);
});

test('flashing and auth mutation prevent source switches', () => {
  for (const [flashing, busy] of [[true, false], [false, true]]) {
    const state = { flashing, customSource: 'rsnode', firmwareRequestSerial: 5 };
    const setSource = vm.runInNewContext('(' + extractFunction('setCustomSource') + ')', { state, betaAuthBusy: busy });
    setSource('rnode');
    assert.equal(state.customSource, 'rsnode');
    assert.equal(state.firmwareRequestSerial, 5);
  }
});

test('rsNode flash checks session, chip and capacity before writing, and uploaded packages skip RNode setup', () => {
  const start = html.indexOf('window.startFlash = async function()');
  const end = html.indexOf('function isRnodeReconnectSetupIssue', start);
  const flash = html.slice(start, end);
  assert.ok(flash.indexOf('await esploader.getFlashSize()') < flash.indexOf('await esploader.writeFlash('));
  assert.ok(flash.indexOf("prepared.product === 'rsnode') needsRnodeSetup = false") < flash.indexOf('confirmFactoryInstall(prepared)'));
  assert.match(flash, /prepared\.product === 'rsnode' && isRsnodeSelected\(\)/);
  assert.match(flash, /flashKiB !== expectedKiB/);
  assert.match(html, /prepared\.board !== 'heltec-v3' && !isRsnodeSelected\(\)/);
});

test('the picker, the install dialog and the package name each board the same way', () => {
  const server = readFileSync(new URL('../lib/rsnode-beta.js', import.meta.url), 'utf8');
  const labels = Object.fromEntries([...server.matchAll(/'(heltec-[a-z0-9-]+)': \{ label: '([^']+)'/g)].map(match => [match[1], match[2]]));
  assert.deepEqual(labels, { 'heltec-v3': 'Heltec V3', 'heltec-v4': 'Heltec V4 · R2', 'heltec-v4-r8': 'Heltec V4 · R8',
    'heltec-v4-r8-tft': 'Heltec V4 · R8 TFT' });
  for (const [id, label] of Object.entries(labels)) assert.equal(rsnodeBoard(id).label, label, id);
});

test('the rsNode pane says what Install erases, what the two modes are, and that managers are optional', () => {
  const pane = /id="customSourceRsnode"[\s\S]*?<!-- Mode B/.exec(html)[0].replace(/<[^>]+>/g, '');
  assert.match(pane, /Install erases the node: identity, managers, Wi-Fi, Bluetooth pairings and Repeater settings\. From the next beta, Update keeps them\./);
  assert.match(pane, /As an RNode, it is the radio for one app, over USB, Bluetooth or Wi-Fi\. As a Repeater, it forwards traffic on its own\./);
  assert.match(pane, /Bluetooth is off while Wi-Fi is on\. Managers are optional and only manage a Repeater\./);
  assert.doesNotMatch(pane, /signed OTA/);
  assert.match(extractFunction('confirmFactoryInstall'), /identity, managers, Wi-Fi, Bluetooth pairings and Repeater settings/);
});

test('Update sends the signed bundle over USB and never runs esptool or erases; Install keeps its path', () => {
  const update = extractFunction('runRsnodeUpdate');
  assert.doesNotMatch(update, /esploader|esptool|writeFlash|eraseAll|shouldEraseBeforeFlash/);
  assert.match(update, /await verifyRsnodeBundle\(bytes, bundle\)/);
  assert.match(update, /streamRsnodeUpdate\(session, bytes,/);
  assert.match(update, /title: 'Update'/);
  assert.ok(update.indexOf('confirmFactoryInstall(') < update.indexOf("betaRequest('session')"));
  assert.ok(update.indexOf("betaRequest('session')") < update.indexOf('openRnodeSerialPort('));
  const start = html.indexOf('window.startFlash = async function()');
  const flash = html.slice(start, html.indexOf('function isRnodeReconnectSetupIssue', start));
  assert.ok(flash.indexOf('rsnodeUpdateChosen()') < flash.indexOf('loadEsptool()'));
  assert.match(extractFunction('shouldEraseBeforeFlash'), /installMode === 'factory'/);
  assert.match(extractFunction('confirmFactoryInstall'), /review \? review\.title : 'Erase and install'/);
});

test('the pane offers Update only for a board with an update, and the flash button follows the choice', () => {
  const elements = {};
  const element = id => elements[id] ||= { id, hidden: false, disabled: false, textContent: '', innerHTML: '',
    classList: { toggle() {} } };
  const radios = ['update', 'install'].map(value => ({ value, checked: false }));
  const state = { flashing: false, rsnodeMetadata: { id: 'heltec-v4', label: 'Heltec V4 · R2' }, rsnodeChoice: null,
    rsnodeMode: 'install', rsnodeBundle: null };
  const context = { state, betaStage: 'ready', rsnodeChecking: false, rsnodeOwnerBusy: false, rsnodeSettingsBusy: false,
    FLASH_ICON_HTML: '', isRsnodeSelected: () => true,
    document: { getElementById: element, querySelectorAll: () => radios } };
  const constant = name => new RegExp(`var ${name} = '(?:[^'\\\\]|\\\\.)*';`).exec(html)[0];
  const source = [constant('RSNODE_INSTALL_NOTE'), constant('RSNODE_UPDATE_NOTE'),
    ...['rsnodeUpdateChosen', 'flashButtonLabel', 'setFlashButtonIdleContent', 'renderRsnodeUpdate'].map(extractFunction),
    '({ renderRsnodeUpdate })'].join('\n');
  const { renderRsnodeUpdate } = vm.runInNewContext(source, context);
  element('flashBtn').textContent = 'Flash rsNode';
  renderRsnodeUpdate();
  assert.equal(elements.rsnodeUpdate.hidden, true);
  assert.match(elements.rsnodeInstallNote.textContent, /^Install erases the node: .* From the next beta, Update keeps them\.$/);
  state.rsnodeMetadata.update = { version: '1.0.0-beta.20261102.1' };
  renderRsnodeUpdate();
  assert.equal(elements.rsnodeUpdate.hidden, false);
  assert.match(elements.rsnodeInstallNote.textContent, /^Update keeps the node's identity, managers, .*; Install erases them\./);
  assert.equal(elements.rsnodeUpdateCheck.textContent, 'Check the node');
  assert.equal(elements.rsnodeUpdateModes.hidden, true);
  state.rsnodeNotice = { text: 'Select the rsNode serial port to check it.', error: false };
  renderRsnodeUpdate();
  assert.equal(elements.rsnodeUpdateStatus.textContent, 'Select the rsNode serial port to check it.');
  Object.assign(state, { rsnodeChoice: { kind: 'update', update: true, message: 'Update to 1.0.0-beta.20261102.1.' }, rsnodeMode: 'update',
    rsnodeBundle: { bytes: new Uint8Array(1) } });
  renderRsnodeUpdate();
  assert.equal(elements.rsnodeUpdateStatus.textContent, 'Update to 1.0.0-beta.20261102.1.');
  assert.equal(elements.rsnodeUpdateModes.hidden, false);
  assert.deepEqual(radios.map(radio => radio.checked), [true, false]);
  assert.match(elements.flashBtn.innerHTML, /Update rsNode/);
  assert.equal(elements.rsnodeUpdateCheck.textContent, 'Check again');
  state.rsnodeMode = 'install';
  elements.flashBtn.textContent = 'Update rsNode';
  renderRsnodeUpdate();
  assert.match(elements.flashBtn.innerHTML, /Flash rsNode/);
  Object.assign(state, { rsnodeChoice: { kind: 'current', update: false }, rsnodeMode: 'install' });
  elements.flashBtn.textContent = 'Flash rsNode';
  renderRsnodeUpdate();
  assert.equal(elements.rsnodeUpdateModes.hidden, true);
  assert.match(elements.flashBtn.innerHTML, /Erase and reinstall/);
});
