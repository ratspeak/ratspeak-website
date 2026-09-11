import { buildMapSnapshot } from '../assets/map-data.js';
import { loadPublishedSnapshot, mapPathname, pruneExpiredNodes } from '../lib/map-live-snapshot.js';

export const config = { runtime: 'edge' };

// The publisher writes once a minute; one CDN-cached copy per region serves
// every open map tab instead of one Blob round-trip per tab per poll.
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };
const CACHE_LIVE = 'public, max-age=0, s-maxage=60, stale-while-revalidate=300';
const CACHE_NONE = 'no-store';

export default async function handler(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return jsonResponse({ error: 'Method not allowed' }, 405, {
      Allow: 'GET, HEAD',
      'Cache-Control': CACHE_NONE
    });
  }

  let snapshot;
  try {
    snapshot = await loadPublishedSnapshot(process.env.BLOB_READ_WRITE_TOKEN, mapPathname()) ||
      buildMapSnapshot(new Date());
  } catch (error) {
    console.error('Map snapshot read failed', error);
    return jsonResponse({ error: 'Map snapshot read failed' }, 502, { 'Cache-Control': CACHE_NONE });
  }

  snapshot = pruneExpiredNodes(snapshot);

  if (req.method === 'HEAD') {
    return new Response(null, {
      status: 200,
      headers: { ...JSON_HEADERS, 'Cache-Control': CACHE_LIVE }
    });
  }

  return jsonResponse(snapshot, 200, { 'Cache-Control': CACHE_LIVE });
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders }
  });
}
