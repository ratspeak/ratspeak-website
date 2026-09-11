import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPublishedSnapshot, resetSnapshotUrlCache } from '../lib/map-live-snapshot.js';

const BLOB_URL = 'https://store.public.blob.vercel-storage.com/map/live.json';

function fakeFetch(log, { listed = true, blobStatus = 200 } = {}) {
  return async (url) => {
    log.push(url);
    if (url.startsWith('https://vercel.com/api/blob')) {
      const blobs = listed ? [{ pathname: 'map/live.json', url: BLOB_URL }] : [];
      return { ok: true, status: 200, json: async () => ({ blobs }) };
    }
    return { ok: blobStatus === 200, status: blobStatus, json: async () => ({ nodes: [], via: url }) };
  };
}

test('snapshot URL is listed once and reused', async () => {
  resetSnapshotUrlCache();
  const log = [];
  const fetchImpl = fakeFetch(log);
  await loadPublishedSnapshot('token', 'map/live.json', fetchImpl);
  await loadPublishedSnapshot('token', 'map/live.json', fetchImpl);
  assert.equal(log.filter((u) => u.startsWith('https://vercel.com/api/blob')).length, 1);
  assert.equal(log.filter((u) => u === BLOB_URL).length, 2);
});

test('a 404 drops the memoized URL so the next read lists again', async () => {
  resetSnapshotUrlCache();
  const log = [];
  await loadPublishedSnapshot('token', 'map/live.json', fakeFetch(log));
  assert.equal(await loadPublishedSnapshot('token', 'map/live.json', fakeFetch(log, { blobStatus: 404 })), null);
  await loadPublishedSnapshot('token', 'map/live.json', fakeFetch(log));
  assert.equal(log.filter((u) => u.startsWith('https://vercel.com/api/blob')).length, 2);
});

test('missing blob and missing token both read as no snapshot', async () => {
  resetSnapshotUrlCache();
  assert.equal(await loadPublishedSnapshot('', 'map/live.json', fakeFetch([])), null);
  assert.equal(await loadPublishedSnapshot('token', 'map/live.json', fakeFetch([], { listed: false })), null);
});

test('MAP_BLOB_URL skips the list call for the default pathname', async () => {
  resetSnapshotUrlCache();
  process.env.MAP_BLOB_URL = BLOB_URL;
  try {
    const log = [];
    await loadPublishedSnapshot('token', 'map/live.json', fakeFetch(log));
    assert.deepEqual(log, [BLOB_URL]);
  } finally {
    delete process.env.MAP_BLOB_URL;
  }
});
