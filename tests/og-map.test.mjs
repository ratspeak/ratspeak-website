import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OG_WIDTH,
  OG_HEIGHT,
  KIND_COLORS,
  project,
  geojsonToPath,
  plottableNodes,
  buildMapSvg
} from '../lib/og-map-render.js';
import { pruneExpiredNodes } from '../lib/map-live-snapshot.js';

const FIXTURE_LAND = {
  features: [
    {
      geometry: {
        type: 'Polygon',
        coordinates: [[[-180, -90], [180, -90], [180, -60], [-180, -60], [-180, -90]]]
      }
    }
  ]
};

function snapshot(nodes, extra = {}) {
  return { generatedAt: '2026-07-10T05:48:58.161Z', nodes, ...extra };
}

test('project maps longitude across full width and top latitude to y=0', () => {
  assert.equal(project(0, -180).x, 0);
  assert.equal(project(0, 180).x, OG_WIDTH);
  assert.ok(Math.abs(project(74, 0).y) < 0.001);
  assert.ok(project(0, 0).y > 0 && project(0, 0).y < OG_HEIGHT);
});

test('project stays finite at the poles', () => {
  for (const lat of [90, -90]) {
    const { x, y } = project(lat, 0);
    assert.ok(Number.isFinite(x) && Number.isFinite(y), `lat ${lat} projected to ${x},${y}`);
  }
});

test('geojsonToPath emits a closed finite path for polar geometry', () => {
  const d = geojsonToPath(FIXTURE_LAND);
  assert.match(d, /^M[\d.-]+ [\d.-]+L/);
  assert.ok(d.endsWith('Z'));
  assert.ok(!d.includes('NaN') && !d.includes('Infinity'));
});

test('plottableNodes colors by kind, falls back for unknown kinds', () => {
  const nodes = plottableNodes(snapshot([
    { kind: 'server-ipv4', location: { lat: 50.1, lon: 8.7 } },
    { kind: 'mystery-kind', location: { lat: 40, lon: -74 } }
  ]));
  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].color, KIND_COLORS['server-ipv4']);
  assert.notEqual(nodes[1].color, undefined);
  assert.ok(!Object.values(KIND_COLORS).includes(nodes[1].color));
});

test('plottableNodes skips missing locations and out-of-frame latitudes', () => {
  const nodes = plottableNodes(snapshot([
    { kind: 'server-ipv4' },
    { kind: 'server-ipv4', location: { lat: 'x', lon: 0 } },
    { kind: 'server-ipv4', location: { lat: -78, lon: 166.7 } },
    { kind: 'client-auto', location: { lat: 35.7, lon: 139.7 } }
  ]));
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].color, KIND_COLORS['client-auto']);
});

test('buildMapSvg renders dots, logo, and site caption', () => {
  const svg = buildMapSvg(
    snapshot([{ kind: 'i2p', location: { lat: 52.5, lon: 13.4 } }]),
    { land: FIXTURE_LAND }
  );
  assert.ok(svg.startsWith(`<svg width="${OG_WIDTH}" height="${OG_HEIGHT}"`));
  assert.ok(svg.includes(KIND_COLORS.i2p));
  assert.ok(svg.includes('>ratspeak.org</text>'));
  assert.ok(svg.includes('<path d="M327.97'));
});

test('buildMapSvg tolerates an empty snapshot and missing geometry', () => {
  const svg = buildMapSvg({ nodes: [] }, {});
  assert.ok(svg.includes('>ratspeak.org</text>'));
  assert.ok(!svg.includes('NaN') && !svg.includes('Infinity') && !svg.includes('undefined'));
});

test('pruneExpiredNodes drops week-stale nodes, keeps manual opt-ins', () => {
  const now = Date.parse('2026-07-10T00:00:00Z');
  const pruned = pruneExpiredNodes(snapshot([
    { lastSeen: '2026-07-09T00:00:00Z' },
    { lastSeen: '2026-06-01T00:00:00Z' },
    { label: 'manual, no lastSeen' }
  ]), now);
  assert.equal(pruned.nodes.length, 2);
  assert.ok(!pruned.nodes.some((n) => n.lastSeen === '2026-06-01T00:00:00Z'));
});
