import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import firmware from '../api/firmware.js';
import { HANDHELD_RELEASE_TAG, handheldRelease, handheldPackage, sha256Hex,
  verifyHandheldDownload, validateHandheldManifest } from '../assets/js/handheld-release.js';

globalThis.crypto ||= webcrypto;

test('M9 defaults to Standalone and has no older or unsupported packages', () => {
  for (const name of ['m9', 'thinknode_m9']) {
    const release = handheldRelease(name);
    assert.equal(release.board, 'm9');
    assert.deepEqual(release.packages, ['standalone']);
    assert.equal(handheldPackage(release).fileName, 'm9-standalone.zip');
    for (const mode of ['full', 'rnode', 'constructor']) assert.equal(handheldPackage(release, mode), null);
    for (const tag of ['v1.9.9', 'v2.1.0', 'v2.2.0', 'v2.2.1']) assert.equal(handheldRelease(name, tag), null);
  }
  for (const board of ['tdeck', 'tpager', 'cardputer']) {
    assert.equal(handheldPackage(handheldRelease(board)).package, 'full');
  }
});

test('M9 API serves the pinned Standalone asset and rejects unavailable modes before fetching', async () => {
  const previous = globalThis.fetch;
  const name = 'm9-standalone.zip';
  const base = 'https://github.com/ratspeak/ratspeak-handheld/releases/download/';
  const assetUrl = base + HANDHELD_RELEASE_TAG + '/' + name;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(options.headers.Authorization, undefined);
    if (url === assetUrl) return new Response('published bytes');
    assert.equal(url, 'https://api.github.com/repos/ratspeak/ratspeak-handheld/releases/tags/' + HANDHELD_RELEASE_TAG);
    return Response.json({ tag_name: HANDHELD_RELEASE_TAG, draft: false, published_at: '2026-09-24T00:00:00Z',
      assets: [{ name, state: 'uploaded', size: 15, digest: 'sha256:' + 'a'.repeat(64), browser_download_url: assetUrl }] });
  };
  const request = query => new Request('http://localhost/api/firmware?source=handheld&device=m9' + query);
  try {
    for (const mode of ['full', 'rnode', 'constructor']) {
      assert.equal((await firmware(request('&package=' + mode))).status, 404);
    }
    assert.equal(calls, 0);
    const info = await firmware(request('&info=true'));
    assert.equal(info.status, 200);
    assert.equal((await info.json()).package, 'standalone');
    const download = await firmware(request(''));
    assert.equal(download.status, 200);
    assert.equal(await download.text(), 'published bytes');
    assert.equal(download.headers.get('Cache-Control'), 'no-store');
  } finally { globalThis.fetch = previous; }
});

test('M9 factory checks accept its 16MB image and reject wrong board, mode, offset and corruption', async () => {
  const bytes = new Uint8Array(0x11000);
  bytes[0] = 0xe9; bytes[2] = 2; bytes[3] = 0x4f; bytes[12] = 9;
  const part = { path: 'm9-standalone.bin', offset: '0x0000', size: bytes.length, sha256: await sha256Hex(bytes) };
  const manifest = { schemaVersion: 1, product: 'ratspeak-handheld', board: 'm9', package: 'standalone',
    version: '2.2.2', installMode: 'factory', chipFamily: 'ESP32-S3', flashSize: '16MB', flashMode: 'dio', flashFreq: '80m', parts: [part] };
  const zip = { file: name => name === part.path ? { async: async () => bytes } : null };
  const plan = await validateHandheldManifest(zip, manifest, { board: 'm9', package: 'standalone', version: 'v2.2.2' });
  assert.equal(plan.address, 0); assert.equal(plan.bytes, bytes);
  await assert.rejects(validateHandheldManifest(zip, manifest, { board: 'tdeck' }), /different device/);
  for (const mode of ['full', 'rnode']) {
    await assert.rejects(validateHandheldManifest(zip, { ...manifest, package: mode }), /Unsupported/);
  }
  for (const path of ['undefined-standalone.bin', 'tdeck-standalone.bin']) {
    await assert.rejects(validateHandheldManifest(zip, { ...manifest, parts: [{ ...part, path }] }), /layout/);
  }
  await assert.rejects(validateHandheldManifest(zip, { ...manifest, parts: [{ ...part, offset: '0x10000' }] }), /layout/);
  const metadata = { product: 'ratspeak-handheld', board: 'm9', package: 'standalone', installMode: 'factory',
    fileName: 'm9-standalone.zip', size: bytes.length, sha256: await sha256Hex(bytes) };
  await verifyHandheldDownload(bytes.buffer, metadata);
  await assert.rejects(verifyHandheldDownload(bytes.buffer, { ...metadata, package: 'rnode', fileName: 'm9-rnode.zip' }));
  bytes[100] ^= 1;
  await assert.rejects(validateHandheldManifest(zip, manifest), /verification/);
  await assert.rejects(verifyHandheldDownload(bytes.buffer, metadata), /SHA-256/);
});
