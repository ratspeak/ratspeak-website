const MAP_TTL_SECONDS = 15 * 60;

const SOURCES = [
  {
    id: 'ratspeak-discovery-store',
    label: 'Ratspeak discovery ingest',
    kind: 'server-observed',
    trust: 'operator'
  },
  {
    id: 'manual-opt-in',
    label: 'Manual opt-in queue',
    kind: 'manual',
    trust: 'self-reported'
  }
];

export function buildMapSnapshot(nowInput = new Date()) {
  return {
    schemaVersion: 1,
    sourceMode: 'pending-live',
    generatedAt: new Date(nowInput).toISOString(),
    ttlSeconds: MAP_TTL_SECONDS,
    disclaimer: 'No live discovery records have been received yet.',
    sources: SOURCES,
    nodes: []
  };
}

export const MAP_SNAPSHOT = buildMapSnapshot(new Date());
