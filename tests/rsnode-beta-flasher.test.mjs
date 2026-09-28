import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import { betaRequest, rsnodeBoard, validateBetaCatalog, verifyBetaDownload, validateBetaManifest } from '../assets/js/rsnode-beta.js';
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

test('beta board catalog permits only the three reviewed Heltec targets', async () => {
  for (const id of ['heltec-v3', 'heltec-v4', 'heltec-v4-r8']) {
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

test('download verification rejects changed bytes and truncated packages', async () => {
  const { metadata } = await fixture();
  const bytes = new Uint8Array([1, 2, 3]);
  metadata.size = bytes.length;
  metadata.sha256 = await sha256Hex(bytes);
  await verifyBetaDownload(bytes.buffer, metadata);
  await assert.rejects(verifyBetaDownload(bytes.slice(0, 2).buffer, metadata), /verification/);
  await assert.rejects(verifyBetaDownload(new Uint8Array([1, 2, 4]).buffer, metadata), /verification/);
});

test('all reviewed images validate as offset-zero factory installs with their actual flash settings', async () => {
  for (const id of ['heltec-v3', 'heltec-v4', 'heltec-v4-r8']) {
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
    firmwareAppBytes: new Uint8Array(10), firmwareBytes: new Uint8Array(10) };
  const context = { state, document: { getElementById: () => link }, isRsnodeSelected: () => true };
  const clear = vm.runInNewContext('(' + extractFunction('clearRsnodeFirmware') + ')', context);
  clear();
  for (const key of ['rsnodeAsset', 'rsnodeMetadata', 'firmwareAppBytes', 'firmwareBytes']) assert.equal(state[key], null);
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
