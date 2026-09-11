// Shared reader for the published live map snapshot in Vercel Blob.
// Used by api/map-nodes.js (edge) and api/og-map.js (node).
//
// The snapshot is written without a random suffix, so its public URL is
// stable. Resolving it costs a Blob list() (a billed advanced operation);
// the URL is memoized per isolate, and MAP_BLOB_URL skips the list entirely.

const BLOB_API = 'https://vercel.com/api/blob';
const API_VERSION = '12';
const DEFAULT_PATHNAME = 'map/live.json';
const NODE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const urlCache = new Map();

export function mapPathname() {
  return process.env.MAP_BLOB_PATH || DEFAULT_PATHNAME;
}

export function resetSnapshotUrlCache() {
  urlCache.clear();
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

async function resolveSnapshotUrl(blobToken, pathname, fetchImpl) {
  const params = new URLSearchParams({ prefix: pathname, limit: '10' });
  const listResp = await fetchImpl(`${BLOB_API}?${params.toString()}`, {
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
  return blob ? blob.url : null;
}

export async function loadPublishedSnapshot(blobToken, pathname = mapPathname(), fetchImpl = fetch) {
  if (!blobToken) return null;

  const pinned = pathname === mapPathname() ? process.env.MAP_BLOB_URL : '';
  let url = pinned || urlCache.get(pathname);
  if (!url) {
    url = await resolveSnapshotUrl(blobToken, pathname, fetchImpl);
    if (!url) return null;
    urlCache.set(pathname, url);
  }

  const blobResp = await fetchImpl(url);
  if (blobResp.status === 404) {
    urlCache.delete(pathname);
    return null;
  }
  if (!blobResp.ok) {
    throw new Error(`Blob fetch failed: ${blobResp.status}`);
  }
  return blobResp.json();
}
