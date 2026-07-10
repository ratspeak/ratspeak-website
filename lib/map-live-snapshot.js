// Shared reader for the published live map snapshot in Vercel Blob.
// Used by api/map-nodes.js (edge) and api/og-map.js (node).

const BLOB_API = 'https://vercel.com/api/blob';
const API_VERSION = '12';
const DEFAULT_PATHNAME = 'map/live.json';
const NODE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function mapPathname() {
  return process.env.MAP_BLOB_PATH || DEFAULT_PATHNAME;
}

// Nodes without lastSeen (manual opt-ins) are kept unconditionally.
export function pruneExpiredNodes(snapshot, now = Date.now()) {
  if (!snapshot || !Array.isArray(snapshot.nodes)) return snapshot;
  const cutoff = now - NODE_MAX_AGE_MS;
  const nodes = snapshot.nodes.filter((node) => {
    if (!node || !node.lastSeen) return true;
    const lastSeen = Date.parse(node.lastSeen);
    return !Number.isFinite(lastSeen) || lastSeen >= cutoff;
  });
  return nodes.length === snapshot.nodes.length ? snapshot : { ...snapshot, nodes };
}

export async function loadPublishedSnapshot(blobToken, pathname = mapPathname()) {
  if (!blobToken) return null;

  const params = new URLSearchParams({
    prefix: pathname,
    limit: '10'
  });
  const listResp = await fetch(`${BLOB_API}?${params.toString()}`, {
    headers: {
      authorization: `Bearer ${blobToken}`,
      'x-api-version': API_VERSION
    }
  });
  if (!listResp.ok) {
    throw new Error(`Blob list failed: ${listResp.status}`);
  }

  const listing = await listResp.json();
  const blob = (listing.blobs || []).find((item) => item.pathname === pathname);
  if (!blob) return null;

  const blobResp = await fetch(blob.url, { cache: 'no-store' });
  if (!blobResp.ok) {
    throw new Error(`Blob fetch failed: ${blobResp.status}`);
  }
  return blobResp.json();
}
