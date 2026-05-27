import {
  TOKEN_ADDRESS,
  VOTE_DOMAIN,
  VOTE_TYPES,
  aggregateResults,
  canonicalVoteMessage,
  findChoice,
  findPoll,
  isEligibleBalance,
  isEligibleVote,
  normalizePollState,
  serializableVoteMessage,
  validateVoteAgainstPoll,
  validateVoteMessageInput,
  voteStoragePollIds
} from '../lib/vote-core.js';
import {
  checkRateLimit,
  clientKeyFromHeaders,
  rateLimitFromEnv,
  rateLimitHeaders
} from '../lib/rate-limit.js';
import {
  ELIGIBILITY_RULE_LABEL,
  readSnapshotBalance
} from '../lib/snapshot-rpc.js';
import { getAddress, isAddress, verifyTypedData } from 'viem';

export const config = { runtime: 'edge' };

const BLOB_API = 'https://vercel.com/api/blob';
const API_VERSION = '12';
const PROPOSALS_PATHNAME = 'community-poll-proposals.json';
const VOTES_PREFIX = 'community-poll-votes';
const MAX_BODY = 64 * 1024;
const NO_STORE = { 'Cache-Control': 'no-store' };
const RATE_LIMIT_WINDOW_MS = rateLimitFromEnv('RATE_LIMIT_WINDOW_MS', 60_000);
const VOTE_READ_RATE_LIMIT = rateLimitFromEnv('VOTE_READ_RATE_LIMIT', 120);
const VOTE_WRITE_RATE_LIMIT = rateLimitFromEnv('VOTE_WRITE_RATE_LIMIT', 6);

export default async function handler(req) {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!blobToken) {
    return jsonResponse({ error: 'Storage not configured' }, 503, NO_STORE);
  }

  if (req.method === 'GET') {
    const limit = checkRequestRate(req, 'votes:get', VOTE_READ_RATE_LIMIT);
    if (!limit.allowed) return tooManyRequests(limit, 'Too many result checks. Try again shortly.');
    const url = new URL(req.url);
    return getResults(url, blobToken);
  }

  if (req.method === 'POST') {
    const limit = checkRequestRate(req, 'votes:post', VOTE_WRITE_RATE_LIMIT);
    if (!limit.allowed) return tooManyRequests(limit, 'Too many vote attempts. Try again shortly.');
    return postVote(req, blobToken);
  }

  return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: 'GET, POST', ...NO_STORE });
}

async function getResults(url, blobToken) {
  const polls = await loadPolls(blobToken);
  const pollId = url.searchParams.get('pollId') || polls[0]?.id || '';
  const poll = findPoll(polls, pollId);
  if (!poll) return jsonResponse({ error: 'Unknown poll' }, 404, NO_STORE);

  const votes = await loadVotesForPoll(blobToken, poll);
  return jsonResponse({ ok: true, results: buildResults(poll, votes) }, 200, NO_STORE);
}

async function postVote(req, blobToken) {
  const payload = await readJson(req);
  if (!payload.ok) return jsonResponse({ error: payload.error }, payload.status, NO_STORE);

  const { message, signature } = payload.value || {};
  if (!/^0x[0-9a-fA-F]+$/.test(String(signature || ''))) {
    return jsonResponse({ error: 'Invalid signature' }, 400, NO_STORE);
  }
  const input = validateVoteMessageInput(message);
  if (!input.ok) return jsonResponse({ error: input.error }, 400, NO_STORE);
  if (!isAddress(message.voter)) return jsonResponse({ error: 'Invalid voter address' }, 400, NO_STORE);

  const voter = getAddress(message.voter);
  const polls = await loadPolls(blobToken);
  const poll = findPoll(polls, message.pollId);
  const choice = findChoice(poll, message.choiceId);
  const pollValidation = validateVoteAgainstPoll(message, poll, choice);
  if (!pollValidation.ok) return jsonResponse({ error: pollValidation.error }, 409, NO_STORE);

  const canonicalMessage = canonicalVoteMessage({
    poll,
    choice,
    voter,
    nonce: message.nonce,
    createdAt: input.createdAt
  });
  const verified = await verifyTypedData({
    address: voter,
    domain: VOTE_DOMAIN,
    types: VOTE_TYPES,
    primaryType: 'Vote',
    message: canonicalMessage,
    signature
  });
  if (!verified) return jsonResponse({ error: 'Signature verification failed' }, 401, NO_STORE);

  const existing = await loadVoteForVoter(blobToken, poll, voter);
  const existingCreatedAt = Number(existing?.message?.createdAt || 0);
  if (existing && existingCreatedAt > input.createdAt) {
    const votes = await loadVotesForPoll(blobToken, poll);
    return jsonResponse({
      ok: true,
      ignored: true,
      reason: 'A newer signed vote is already recorded for this wallet.',
      vote: publicVote(existing),
      results: buildResults(poll, votes)
    }, 200, NO_STORE);
  }

  let snapshot;
  try {
    snapshot = await readSnapshotBalance(voter, poll.snapshotBlock);
  } catch (err) {
    console.error('Snapshot balance read failed', err);
    return jsonResponse({ error: 'Snapshot balance read failed' }, 502, NO_STORE);
  }
  if (!isEligibleBalance(snapshot.rawBalance, snapshot.decimals)) {
    return jsonResponse({ error: 'This wallet is not eligible at the snapshot block' }, 403, NO_STORE);
  }

  const now = new Date().toISOString();
  const storedVote = {
    version: 1,
    pollId: poll.id,
    choiceId: choice.id,
    voter,
    tokenContract: TOKEN_ADDRESS,
    snapshotBlock: poll.snapshotBlock,
    message: serializableVoteMessage(canonicalMessage),
    signature,
    eligible: true,
    eligibilityRule: ELIGIBILITY_RULE_LABEL,
    tokenDecimals: snapshot.decimals,
    tokenSymbol: snapshot.symbol,
    signedAt: new Date(input.createdAt).toISOString(),
    receivedAt: now
  };

  await writeVote(blobToken, storedVote);
  const votes = await loadVotesForPoll(blobToken, poll);
  return jsonResponse({
    ok: true,
    vote: publicVote(storedVote),
    results: buildResults(poll, votes)
  }, 200, NO_STORE);
}

function buildResults(poll, votes) {
  const tokenDecimals = pickTokenDecimals(votes);
  const tokenSymbol = pickTokenSymbol(votes);
  return aggregateResults(poll, votes, { tokenDecimals, tokenSymbol });
}

function pickTokenDecimals(votes) {
  const decimals = votes.find(vote => Number.isInteger(vote?.tokenDecimals))?.tokenDecimals;
  return Number.isInteger(decimals) ? decimals : 18;
}

function pickTokenSymbol(votes) {
  return votes.find(vote => vote?.tokenSymbol)?.tokenSymbol || 'RATSPEAK';
}

function publicVote(vote) {
  const tokenDecimals = Number.isInteger(vote.tokenDecimals) ? vote.tokenDecimals : 18;
  return {
    pollId: vote.pollId,
    choiceId: vote.choiceId,
    voter: vote.voter,
    snapshotBlock: vote.snapshotBlock,
    eligible: isEligibleVote(vote, tokenDecimals),
    eligibilityRule: vote.eligibilityRule || ELIGIBILITY_RULE_LABEL,
    tokenSymbol: vote.tokenSymbol,
    signedAt: vote.signedAt,
    receivedAt: vote.receivedAt,
    signature: String(vote.signature || '').slice(0, 18) + '..' + String(vote.signature || '').slice(-12)
  };
}

async function loadPolls(blobToken) {
  const stored = await readBlobJson(blobToken, PROPOSALS_PATHNAME);
  return normalizePollState(stored || null).polls;
}

async function loadVoteForVoter(blobToken, poll, voter) {
  const votes = await Promise.all(voteStoragePollIds(poll).map(pollId => readBlobJson(blobToken, votePath(pollId, voter))));
  return votes.filter(Boolean).sort(compareStoredVoteFreshness).pop() || null;
}

async function loadVotesForPoll(blobToken, poll) {
  const listings = await Promise.all(voteStoragePollIds(poll).map(pollId => listBlobs(blobToken, `${VOTES_PREFIX}/${pollId}/`)));
  const blobs = listings.flat();
  const votes = await Promise.all(blobs.map(blob => fetch(blob.url, { cache: 'no-store' })
    .then(resp => resp.ok ? resp.json() : null)
    .catch(() => null)));
  return votes.filter(Boolean);
}

async function writeVote(blobToken, vote) {
  const putResp = await fetch(`${BLOB_API}/?pathname=${encodeURIComponent(votePath(vote.pollId, vote.voter))}`, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${blobToken}`,
      'x-api-version': API_VERSION,
      'x-vercel-blob-access': 'public',
      'x-content-type': 'application/json',
      'x-add-random-suffix': '0',
      'x-allow-overwrite': '1'
    },
    body: JSON.stringify(vote)
  });

  if (!putResp.ok) {
    const detail = await putResp.text().catch(() => '');
    console.error('Vote Blob PUT failed', putResp.status, detail.slice(0, 500));
    throw new Error('Vote storage write failed');
  }
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

function votePath(pollId, voter) {
  return `${VOTES_PREFIX}/${pollId}/${String(voter).toLowerCase()}.json`;
}

function compareStoredVoteFreshness(a, b) {
  const receivedCompare = String(a?.receivedAt || '').localeCompare(String(b?.receivedAt || ''));
  if (receivedCompare !== 0) return receivedCompare;
  return String(a?.signedAt || '').localeCompare(String(b?.signedAt || ''));
}

async function readJson(req) {
  const raw = await req.text();
  if (raw.length > MAX_BODY) return { ok: false, status: 413, error: 'Payload too large' };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, status: 400, error: 'Invalid JSON' };
  }
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders }
  });
}

function checkRequestRate(req, bucket, limit) {
  return checkRateLimit(bucket, clientKeyFromHeaders(req.headers), {
    limit,
    windowMs: RATE_LIMIT_WINDOW_MS
  });
}

function tooManyRequests(limit, error) {
  return jsonResponse({ error }, 429, {
    ...NO_STORE,
    ...rateLimitHeaders(limit)
  });
}
