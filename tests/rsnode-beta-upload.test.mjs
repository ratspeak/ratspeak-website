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
