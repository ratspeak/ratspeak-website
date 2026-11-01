import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { uploadBetaPackages } from '../scripts/rsnode-beta-upload.mjs';

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'rsnode-upload-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const bytes = Buffer.from('a small upload transport fixture');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const boards = ['heltec-v3', 'heltec-v4', 'heltec-v4-r8'].map(id => ({
    id, version: 'beta-test', fileName: id + '.zip', size: bytes.length, sha256
  }));
  for (const board of boards) await writeFile(join(dir, board.fileName), bytes);
  const catalogPath = join(dir, 'catalog.json');
  await writeFile(catalogPath, JSON.stringify({ boards }));
  return { dir, bytes, boards, catalogPath, output: join(dir, 'uploaded.json') };
}

test('upload helper keeps storage private, verifies all bytes and writes no credentials', async t => {
  const f = await fixture(t);
  const uploaded = new Map();
  const requests = [];
  const result = await uploadBetaPackages(f.catalogPath, f.output, {
    token: 'private-fixture-token', report() {},
    async upload(path, bytes, options) {
      assert.equal(options.access, 'private');
      assert.equal(options.allowOverwrite, false);
      assert.equal(options.token, 'private-fixture-token');
      const url = 'https://fixture.private.blob.vercel-storage.com/' + path;
      uploaded.set(url, bytes);
      return { url };
    },
    async fetchAsset(url, options) {
      requests.push(options);
      if (!options.headers?.Authorization) return new Response(null, { status: 403 });
      assert.equal(options.headers.Authorization, 'Bearer private-fixture-token');
      assert.equal(options.redirect, 'error');
      return new Response(uploaded.get(String(url)));
    }
  });
  assert.equal(result.boards.length, 3);
  assert.equal(requests.length, 6);
  const output = await readFile(f.output, 'utf8');
  assert.ok(!output.includes('private-fixture-token'));
  assert.equal((await stat(f.output)).mode & 0o777, 0o600);
});

test('preflights every local hash before any remote write', async t => {
  const f = await fixture(t);
  await writeFile(join(f.dir, f.boards[2].fileName), 'tampered');
  let uploads = 0;
  await assert.rejects(uploadBetaPackages(f.catalogPath, f.output, {
    token: 'fixture', upload() { uploads++; }, report() {}
  }), /integrity failed/);
  assert.equal(uploads, 0);
});

test('a single TFT candidate can be uploaded without replacing the OLED packages', async t => {
  const f = await fixture(t);
  const board = { ...f.boards[0], id: 'heltec-v4-r8-tft', fileName: 'heltec-v4-r8-tft.zip' };
  await writeFile(join(f.dir, board.fileName), f.bytes);
  await writeFile(f.catalogPath, JSON.stringify({ boards: [board] }));
  let uploads = 0;
  const result = await uploadBetaPackages(f.catalogPath, f.output, {
    token: 'fixture', report() {},
    upload: async () => { uploads++; return { url: 'https://fixture.private.blob.vercel-storage.com/tft.zip' }; },
    fetchAsset: async (_url, options) => options.headers ? new Response(f.bytes) : new Response(null, { status: 403 })
  });
  assert.equal(uploads, 1);
  assert.equal(result.boards[0].id, 'heltec-v4-r8-tft');
});

test('rejects public Blob storage without sending its token to that URL', async t => {
  const f = await fixture(t);
  let fetches = 0;
  await assert.rejects(uploadBetaPackages(f.catalogPath, f.output, {
    token: 'fixture', upload: async () => ({ url: 'https://fixture.public.blob.vercel-storage.com/a.zip' }),
    fetchAsset() { fetches++; }, report() {}
  }), /private Blob URL/);
  assert.equal(fetches, 0);
});

test('refuses a supposedly private object when anonymous download succeeds', async t => {
  const f = await fixture(t);
  await assert.rejects(uploadBetaPackages(f.catalogPath, f.output, {
    token: 'fixture', upload: async () => ({ url: 'https://fixture.private.blob.vercel-storage.com/a.zip' }),
    fetchAsset: async () => new Response(f.bytes), report() {}
  }), /Anonymous Blob access/);
  await assert.rejects(stat(f.output), { code: 'ENOENT' });
});

test('refuses corrupt authenticated remote bytes and emits no deployment catalog', async t => {
  const f = await fixture(t);
  await assert.rejects(uploadBetaPackages(f.catalogPath, f.output, {
    token: 'fixture', upload: async () => ({ url: 'https://fixture.private.blob.vercel-storage.com/a.zip' }),
    fetchAsset: async (_url, options) => options.headers ? new Response('corrupt') : new Response(null, { status: 403 }),
    report() {}
  }), /integrity failed/);
  await assert.rejects(stat(f.output), { code: 'ENOENT' });
});

test('project OIDC selects only the dedicated store and verifies private readback', async t => {
  const f = await fixture(t);
  const storeId = 'store_Abcdefgh12345678';
  let reads = 0;
  const result = await uploadBetaPackages(f.catalogPath, f.output, {
    storeId, token: undefined, report() {},
    async upload(path, bytes, options) {
      assert.equal(options.storeId, storeId);
      assert.equal(options.token, undefined);
      assert.deepEqual(bytes, f.bytes);
      return { url: 'https://abcdefgh12345678.private.blob.vercel-storage.com/' + path };
    },
    fetchAsset: async () => new Response(null, { status: 403 }),
    async readPrivate(url, options) {
      reads++;
      assert.equal(new URL(url).hostname, 'abcdefgh12345678.private.blob.vercel-storage.com');
      assert.equal(options.storeId, storeId);
      assert.equal(options.access, 'private');
      assert.equal(options.token, undefined);
      return { stream: new Response(f.bytes).body, statusCode: 200 };
    }
  });
  assert.equal(result.boards.length, 3);
  assert.equal(reads, 3);
});

test('project OIDC rejects an upload URL belonging to a different private store', async t => {
  const f = await fixture(t);
  let fetched = false;
  await assert.rejects(uploadBetaPackages(f.catalogPath, f.output, {
    storeId: 'store_Abcdefgh12345678', report() {},
    upload: async () => ({ url: 'https://wrongstore.private.blob.vercel-storage.com/a.zip' }),
    fetchAsset: async () => { fetched = true; }, readPrivate: async () => { fetched = true; }
  }), /private Blob URL/);
  assert.equal(fetched, false);
});

// An .rsota laid out as rsNode's package_ota.py writes it; the signature is opaque here.
function rsota(target = '80813f', sequence = 2026110201) {
  const image = Buffer.alloc(600, 0xe9);
  const manifest = Buffer.alloc(128);
  manifest.write('RSOT', 0, 'latin1');
  manifest[4] = 1;
  Buffer.from(target, 'hex').copy(manifest, 5);
  manifest.writeUInt32BE(sequence, 8);
  manifest.writeUInt32BE(image.length, 12);
  createHash('sha256').update(image).digest().copy(manifest, 24);
  return Buffer.concat([manifest, image]);
}

async function withUpdate(t, bundle = rsota(), change = {}) {
  const f = await fixture(t);
  const update = { fileName: 'heltec-v4.rsota', size: bundle.length, sha256: createHash('sha256').update(bundle).digest('hex'),
    sequence: 2026110201, otaTarget: '80:81:3f', releaseKeyId: '0011223344556677', version: '1.0.0-beta.20261102.1', ...change };
  await writeFile(join(f.dir, 'heltec-v4.rsota'), bundle);
  const boards = f.boards.map(board => board.id === 'heltec-v4' ? { ...board, update } : board);
  await writeFile(f.catalogPath, JSON.stringify({ boards }));
  return { ...f, bundle, update };
}

test('a signed update uploads beside its factory package and lands in the deployment catalog', async t => {
  const f = await withUpdate(t);
  const uploaded = new Map();
  const types = [];
  const result = await uploadBetaPackages(f.catalogPath, f.output, {
    token: 'fixture', report() {},
    async upload(path, bytes, options) {
      types.push([path.split('/').pop(), options.contentType, options.access]);
      const url = 'https://fixture.private.blob.vercel-storage.com/' + path;
      uploaded.set(url, bytes);
      return { url };
    },
    fetchAsset: async (url, options) => options.headers ? new Response(uploaded.get(String(url))) : new Response(null, { status: 403 })
  });
  assert.deepEqual(types.find(([name]) => name === 'heltec-v4.rsota'), ['heltec-v4.rsota', 'application/octet-stream', 'private']);
  assert.equal(types.length, 4);
  const written = JSON.parse(await readFile(f.output, 'utf8'));
  const board = written.boards.find(entry => entry.id === 'heltec-v4');
  assert.deepEqual(board.update, { ...f.update,
    url: `https://fixture.private.blob.vercel-storage.com/rsnode-beta/beta-test/${f.update.sha256}/heltec-v4.rsota` });
  assert.deepEqual(uploaded.get(board.update.url), f.bundle);
  assert.equal(written.boards.filter(entry => entry.update).length, 1);
  assert.deepEqual(result, written);
});

test('an update whose manifest or entry disagrees is refused before any remote write', async t => {
  const cases = [
    [rsota('8081bf'), {}], [rsota('80813f', 7), {}], [rsota(), { otaTarget: '80:81:bf' }], [rsota(), { releaseKeyId: 'xyz' }],
    [rsota(), { version: '' }], [rsota(), { fileName: 'heltec-v4.bin' }], [Buffer.from('RSOT'), {}]
  ];
  for (const [bundle, change] of cases) {
    const f = await withUpdate(t, bundle, change);
    let uploads = 0;
    await assert.rejects(uploadBetaPackages(f.catalogPath, f.output, { token: 'fixture', upload() { uploads++; }, report() {} }),
      /Invalid update entry|Update manifest does not match/, JSON.stringify(change));
    assert.equal(uploads, 0);
  }
});
