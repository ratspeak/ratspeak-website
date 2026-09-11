import test from 'node:test';
import assert from 'node:assert/strict';
import { triageVersionedGroups } from '../lib/registry-store.js';

const PREFIX = 'holder-registry/queue/';
const NOW = Date.parse('2026-09-11T12:00:00Z');
const MIN = 60_000;
const OPTS = { liveMs: 20 * MIN, deadMs: 24 * 60 * MIN, now: NOW };

function blob(id, ageMs, version = true) {
  const at = NOW - ageMs;
  const key = `${String(at).padStart(14, '0')}-abcd`;
  return {
    pathname: version ? `${PREFIX}${id}/${key}.json` : `${PREFIX}${id}.json`,
    url: `https://blob/${id}/${key}`,
    uploadedAt: new Date(at).toISOString()
  };
}

test('only groups written within the live window are read', () => {
  const { live, dead } = triageVersionedGroups([
    blob('fresh', 5 * MIN),
    blob('expired', 60 * MIN),
    blob('ancient', 48 * 60 * MIN)
  ], PREFIX, OPTS);
  assert.deepEqual(live.map((g) => g.id), ['fresh']);
  assert.deepEqual(dead.map((g) => g.id), ['ancient']);
});

test('a group is as young as its newest version and reads the newest', () => {
  const old = blob('resend', 3 * 60 * MIN);
  const fresh = blob('resend', 2 * MIN);
  const { live, dead } = triageVersionedGroups([old, fresh], PREFIX, OPTS);
  assert.equal(dead.length, 0);
  assert.equal(live.length, 1);
  assert.equal(live[0].newest.url, fresh.url);
  assert.equal(live[0].versions.length, 2);
});

test('legacy single-file records and unknown ages are still read', () => {
  const legacy = blob('legacy', 1 * MIN, false);
  const undated = { pathname: `${PREFIX}odd/version.json`, url: 'https://blob/odd' };
  const { live, dead } = triageVersionedGroups([legacy, undated], PREFIX, OPTS);
  assert.deepEqual(live.map((g) => g.id).sort(), ['legacy', 'odd']);
  assert.equal(dead.length, 0);
  assert.equal(live.find((g) => g.id === 'legacy').newest.url, legacy.url);
});

test('version key timestamps date a blob when the listing lacks uploadedAt', () => {
  const stale = blob('keyed', 30 * 60 * MIN);
  delete stale.uploadedAt;
  const { live, dead } = triageVersionedGroups([stale], PREFIX, OPTS);
  assert.equal(live.length, 0);
  assert.deepEqual(dead.map((g) => g.id), ['keyed']);
});

test('blobs outside the prefix are ignored', () => {
  const { live, dead } = triageVersionedGroups([blob('x', 0), { pathname: 'other/x.json', url: 'u' }], PREFIX, OPTS);
  assert.equal(live.length + dead.length, 1);
});
