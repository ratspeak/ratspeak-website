import { getAddress, isAddress } from 'viem';
import { findPoll, normalizePollState } from '../lib/vote-core.js';
import {
  checkRateLimit,
  clientKeyFromHeaders,
  rateLimitFromEnv,
  rateLimitHeaders
} from '../lib/rate-limit.js';
import { readSnapshotBalance, serializeSnapshotBalance } from '../lib/snapshot-rpc.js';

export const config = { runtime: 'edge' };

const BLOB_API = 'https://vercel.com/api/blob';
const API_VERSION = '12';
const PROPOSALS_PATHNAME = 'community-poll-proposals.json';
const NO_STORE = { 'Cache-Control': 'no-store' };
const RATE_LIMIT_WINDOW_MS = rateLimitFromEnv('RATE_LIMIT_WINDOW_MS', 60_000);
const SNAPSHOT_RATE_LIMIT = rateLimitFromEnv('SNAPSHOT_RATE_LIMIT', 20);

export default async function handler(req) {
  if (req.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: 'GET', ...NO_STORE });
  }

  const limit = checkRateLimit('snapshot', clientKeyFromHeaders(req.headers), {
    limit: SNAPSHOT_RATE_LIMIT,
    windowMs: RATE_LIMIT_WINDOW_MS
  });
  if (!limit.allowed) {
    return jsonResponse({ error: 'Too many snapshot checks. Try again shortly.' }, 429, {
      ...NO_STORE,
      ...rateLimitHeaders(limit)
    });
  }

  const url = new URL(req.url);
  const address = url.searchParams.get('address') || '';
  if (!isAddress(address)) {
    return jsonResponse({ error: 'Invalid wallet address' }, 400, NO_STORE);
  }

  let polls;
  try {
    polls = await loadPolls(process.env.BLOB_READ_WRITE_TOKEN);
  } catch (err) {
    console.error('Proposal storage read failed', err);
    return jsonResponse({ error: 'Proposal storage read failed' }, 502, NO_STORE);
  }
  const pollId = url.searchParams.get('pollId') || polls[0]?.id || '';
  const poll = findPoll(polls, pollId);
  if (!poll) return jsonResponse({ error: 'Unknown poll' }, 404, NO_STORE);

  const voter = getAddress(address);
  let snapshot;
  try {
    snapshot = await readSnapshotBalance(voter, poll.snapshotBlock);
  } catch (err) {
    console.error('Snapshot balance read failed', err);
    return jsonResponse({ error: 'Snapshot balance read failed' }, 502, NO_STORE);
  }

  return jsonResponse({
    ok: true,
    snapshot: {
      pollId: poll.id,
      address: voter,
      snapshotBlock: poll.snapshotBlock,
      ...serializeSnapshotBalance(snapshot)
    }
  }, 200, NO_STORE);
}

async function loadPolls(blobToken) {
  if (!blobToken) return normalizePollState(null).polls;
  const stored = await readBlobJson(blobToken, PROPOSALS_PATHNAME);
  return normalizePollState(stored || null).polls;
}

async function readBlobJson(blobToken, pathname) {
  const blob = (await listBlobs(blobToken, pathname, 10)).find(item => item.pathname === pathname);
  if (!blob) return null;
  const resp = await fetch(blob.url, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`Blob fetch failed: ${resp.status}`);
  return resp.json();
}

async function listBlobs(blobToken, prefix, limit = 1000) {
  const blobs = [];
  let cursor = '';
  do {
    const params = new URLSearchParams({ prefix, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    const resp = await fetch(`${BLOB_API}?${params.toString()}`, {
      headers: {
        authorization: `Bearer ${blobToken}`,
        'x-api-version': API_VERSION
      }
    });
    if (!resp.ok) throw new Error(`Blob list failed: ${resp.status}`);
    const listing = await resp.json();
    blobs.push(...(listing.blobs || []));
    cursor = listing.cursor || listing.nextCursor || '';
  } while (cursor);
  return blobs;
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders }
  });
}
