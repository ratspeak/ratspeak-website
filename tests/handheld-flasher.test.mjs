import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

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
