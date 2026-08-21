import {
  CODE_LENGTH,
  CODE_TTL_MS,
  REGISTRY_DOMAIN,
  REGISTRATION_TYPES,
  REGISTRY_ELIGIBILITY_RULE,
  UNLINK_TYPES,
  canEnterCode,
  canResend,
  canonicalRegistrationMessage,
  canonicalUnlinkMessage,
  BADGE_CLAIM_TYPES,
  badgeForBalance,
  canonicalBadgeClaimMessage,
  codeFromRandomBytes,
  higherBadge,
  normalizeBadge,
  validateBadgeClaimInput,
  isActiveRegistration,
  isCodeExpired,
  isCodeShaped,
  isEligibleToRegister,
  isLxmfAddress,
  isVerificationId,
  normalizeCode,
  normalizeLxmfAddress,
  normalizePendingStatus,
  normalizeRegistration,
  serializableMessage,
  shortLxmfAddress,
  validateRegistrationInput,
  validateUnlinkInput
} from '../lib/identity-core.js';
import {
  checkRateLimit,
  clientKeyFromHeaders,
  rateLimitFromEnv,
  rateLimitHeaders
} from '../lib/rate-limit.js';
import { readSnapshotBalance } from '../lib/snapshot-rpc.js';
import { getAddress, isAddress, verifyTypedData } from 'viem';

export const config = { runtime: 'edge' };

// Holder registry: wallet <-> LXMF address pairings, verified over the mesh.
//
// User actions (POST {action, ...}): start, verify, resend, cancel, register,
// unlink. Reads are public (GET ?wallet= / ?address= / ?registry=1).
// The mesh bridge polls GET ?bridge=queue and reports transitions with
// {action: "bridge_report"} under IDENTITY_BRIDGE_TOKEN.
//
// Required env vars:
//   BLOB_READ_WRITE_TOKEN    Vercel Blob token (same store as polls).
//   IDENTITY_CODE_SECRET     HMAC key for stored verification-code digests.
//   IDENTITY_BRIDGE_TOKEN    Bearer token for the mesh bridge daemon.
//
// Storage (Vercel Blob). Overwrites are not read-your-write, so records that
// transition state (pending, badges) are append-only: each transition is a
// new immutable file under the record's prefix and reads take the newest.
//   holder-registry/pending/<wallet>/<version>.json  verification in flight (digest only)
//   holder-registry/badges/<wallet>/<version>.json   claimed badge tier
//   holder-registry/queue/<verificationId>/<version>.json  bridge outbox
//     (plaintext code; a tombstone version marks the job claimed)
//   holder-registry/registrations/<wallet>.json  the pairing record
//   holder-registry/by-address/<lxmf>.json    reverse index for takeover flow

const BLOB_API = 'https://vercel.com/api/blob';
const API_VERSION = '12';
const ROOT = 'holder-registry';
const MAX_BODY = 64 * 1024;
const NO_STORE = { 'Cache-Control': 'no-store' };
const MAX_SENDS_PER_PENDING = 5;

const RATE_LIMIT_WINDOW_MS = rateLimitFromEnv('RATE_LIMIT_WINDOW_MS', 60_000);
const IDENTITY_READ_RATE_LIMIT = rateLimitFromEnv('IDENTITY_READ_RATE_LIMIT', 120);
// Writes can trigger real RF traffic on the mesh; keep this tight.
const IDENTITY_WRITE_RATE_LIMIT = rateLimitFromEnv('IDENTITY_WRITE_RATE_LIMIT', 6);

export default async function handler(req) {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  const codeSecret = process.env.IDENTITY_CODE_SECRET;
  if (!blobToken || !codeSecret) {
    return jsonResponse({ error: 'Registry not configured' }, 503, NO_STORE);
  }

  if (req.method === 'GET') {
    const url = new URL(req.url);
    if (url.searchParams.get('bridge') === 'queue') {
      if (!verifyBridge(req)) return jsonResponse({ error: 'Unauthorized' }, 401, NO_STORE);
      return bridgeQueue(blobToken, codeSecret);
    }
    const limit = checkRequestRate(req, 'identity:get', IDENTITY_READ_RATE_LIMIT);
    if (!limit.allowed) return tooManyRequests(limit, 'Too many registry reads. Try again shortly.');
    return getStatus(url, blobToken, codeSecret);
  }

  if (req.method === 'POST') {
    const payload = await readJson(req);
    if (!payload.ok) return jsonResponse({ error: payload.error }, payload.status, NO_STORE);
    const body = payload.value || {};
    const action = String(body.action || '');

    if (action === 'bridge_report') {
      if (!verifyBridge(req)) return jsonResponse({ error: 'Unauthorized' }, 401, NO_STORE);
      return bridgeReport(body, blobToken, codeSecret);
    }

    const limit = checkRequestRate(req, 'identity:post', IDENTITY_WRITE_RATE_LIMIT);
    if (!limit.allowed) return tooManyRequests(limit, 'Too many registration requests. Try again shortly.');

    if (action === 'start') return startVerification(body, blobToken, codeSecret);
    if (action === 'verify') return verifyCode(body, blobToken, codeSecret);
    if (action === 'resend') return resendCode(body, blobToken, codeSecret);
    if (action === 'cancel') return cancelVerification(body, blobToken, codeSecret);
    if (action === 'register') return register(body, blobToken, codeSecret);
    if (action === 'unlink') return unlink(body, blobToken, codeSecret);
    if (action === 'claim_badge') return claimBadge(body, blobToken, codeSecret);
    return jsonResponse({ error: 'Unknown action' }, 400, NO_STORE);
  }

  return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: 'GET, POST', ...NO_STORE });
}

// ------------------------------------------------------------- reads --------
async function getStatus(url, blobToken, secret) {
  const walletParam = url.searchParams.get('wallet') || '';

  // The registry is private by policy: no listing endpoint, no
  // address->wallet reverse lookup. The by-address index exists only for the
  // server-side takeover flow. Residual read surface: per-wallet status
  // (needed for the owner's own resume UX, rate limited).
  if (!isAddress(walletParam)) return jsonResponse({ error: 'Invalid wallet address' }, 400, NO_STORE);
  const wallet = getAddress(walletParam);
  const [registration, pending, badgeRecord] = await Promise.all([
    readSealed(blobToken, secret, registrationPath(wallet)),
    readPending(blobToken, secret, wallet),
    readBadge(blobToken, secret, wallet)
  ]);
  const activeRegistration = normalizeRegistration(registration);
  return jsonResponse({
    ok: true,
    wallet,
    eligibilityRule: REGISTRY_ELIGIBILITY_RULE,
    badge: normalizeBadge(badgeRecord?.badge),
    registration: isActiveRegistration(activeRegistration) ? publicRegistration(activeRegistration) : null,
    pending: publicPending(pending)
  }, 200, NO_STORE);
}

// ------------------------------------------------------------- start --------
async function startVerification(body, blobToken, codeSecret) {
  const secret = codeSecret;
  if (!isAddress(String(body.wallet || ''))) return jsonResponse({ error: 'Invalid wallet address' }, 400, NO_STORE);
  const wallet = getAddress(body.wallet);
  const lxmfAddress = normalizeLxmfAddress(body.lxmfAddress);
  if (!lxmfAddress) return jsonResponse({ error: 'That does not look like an LXMF address (32 hex characters)' }, 400, NO_STORE);

  // D1: starting a verification requires holding RATSPEAK right now.
  let balance;
  try {
    balance = await readSnapshotBalance(wallet, null);
  } catch (err) {
    console.error('Latest balance read failed', err);
    return jsonResponse({ error: 'Balance check failed' }, 502, NO_STORE);
  }
  if (!isEligibleToRegister(balance.rawBalance, balance.decimals)) {
    return jsonResponse({ error: 'This wallet does not hold RATSPEAK' }, 403, NO_STORE);
  }

  // One live verification per wallet; an unexpired one for the same address
  // is returned as-is (idempotent), a different address replaces it.
  const existing = await readPending(blobToken, secret, wallet);
  if (isLivePending(existing) && existing.lxmfAddress === lxmfAddress) {
    return jsonResponse({ ok: true, pending: publicPending(existing) }, 200, NO_STORE);
  }
  if (existing && isVerificationId(existing.verificationId)) {
    // A replaced verification must not leave its old code claimable.
    await writeQueueJob(blobToken, secret, existing.verificationId, { tombstone: true });
  }

  const verificationId = randomHex(16);
  const code = codeFromRandomBytes(crypto.getRandomValues(new Uint8Array(8)));
  const now = new Date().toISOString();
  const pending = {
    version: 1,
    wallet,
    lxmfAddress,
    verificationId,
    codeDigest: await digestCode(codeSecret, verificationId, code),
    codeIssuedAt: now,
    lastSentAt: now,
    sendCount: 1,
    status: 'queued',
    createdAt: now
  };
  await writePending(blobToken, secret, wallet, pending);
  await writeQueueJob(blobToken, secret, verificationId, {
    version: 1,
    verificationId,
    wallet,
    lxmfAddress,
    code,
    createdAt: now
  });

  return jsonResponse({
    ok: true,
    verificationId,
    pending: publicPending(pending)
  }, 200, NO_STORE);
}

// ------------------------------------------------------------- verify -------
async function verifyCode(body, blobToken, codeSecret) {
  const secret = codeSecret;
  const pending = await loadOwnedPending(body, blobToken, codeSecret);
  if (pending.error) return pending.error;
  const record = pending.record;

  if (isCodeExpired(record)) return jsonResponse({ error: 'That code has expired. Start over to get a fresh one.' }, 409, NO_STORE);
  if (!canEnterCode(record.status)) return jsonResponse({ error: 'The code has not been sent yet' }, 409, NO_STORE);

  const code = normalizeCode(body.code);
  if (!isCodeShaped(code)) return jsonResponse({ error: `Codes are ${CODE_LENGTH} letters and numbers` }, 400, NO_STORE);
  const digest = await digestCode(codeSecret, record.verificationId, code);
  if (!timingSafeEqual(digest, String(record.codeDigest || ''))) {
    return jsonResponse({ error: 'Wrong code' }, 401, NO_STORE);
  }

  const next = { ...record, status: 'code_verified', codeVerifiedAt: new Date().toISOString() };
  await writePending(blobToken, secret, record.wallet, next);
  const verifiedAt = Date.now();
  return jsonResponse({
    ok: true,
    pending: publicPending(next),
    proof: {
      verifiedAt,
      mac: await verifyProofMac(codeSecret, record.wallet, record.verificationId, record.lxmfAddress, verifiedAt)
    },
    sign: {
      domain: REGISTRY_DOMAIN,
      types: REGISTRATION_TYPES,
      primaryType: 'Registration',
      message: serializableMessage(canonicalRegistrationMessage({
        wallet: record.wallet,
        lxmfAddress: record.lxmfAddress,
        verificationId: record.verificationId,
        issuedAt: Date.now()
      }))
    }
  }, 200, NO_STORE);
}

// ------------------------------------------------------------- resend -------
async function resendCode(body, blobToken, codeSecret) {
  const secret = codeSecret;
  const pending = await loadOwnedPending(body, blobToken, codeSecret);
  if (pending.error) return pending.error;
  const record = pending.record;

  if (!canResend(record)) return jsonResponse({ error: 'Please wait before resending' }, 429, NO_STORE);
  if (Number(record.sendCount || 0) >= MAX_SENDS_PER_PENDING) {
    return jsonResponse({ error: 'Send limit reached for this verification. Start over later.' }, 429, NO_STORE);
  }

  const code = codeFromRandomBytes(crypto.getRandomValues(new Uint8Array(8)));
  const now = new Date().toISOString();
  const next = {
    ...record,
    codeDigest: await digestCode(codeSecret, record.verificationId, code),
    codeIssuedAt: now,
    lastSentAt: now,
    sendCount: Number(record.sendCount || 0) + 1,
    status: 'queued'
  };
  await writePending(blobToken, secret, record.wallet, next);
  await writeQueueJob(blobToken, secret, record.verificationId, {
    version: 1,
    verificationId: record.verificationId,
    wallet: record.wallet,
    lxmfAddress: record.lxmfAddress,
    code,
    createdAt: now
  });
  return jsonResponse({ ok: true, pending: publicPending(next) }, 200, NO_STORE);
}

// ------------------------------------------------------------- cancel -------
async function cancelVerification(body, blobToken, secret) {
  // Wallet-scoped, no verification id: pendings are created by an unsigned
  // start, so the id proves nothing about ownership — requiring it only
  // strands the wallet owner (lost storage, another browser, or a pending
  // someone else started for their address). Registration stays gated by
  // the code and the wallet signature regardless.
  if (!isAddress(String(body.wallet || ''))) return jsonResponse({ error: 'Invalid wallet address' }, 400, NO_STORE);
  const wallet = getAddress(body.wallet);
  const record = await readPending(blobToken, secret, wallet);
  if (!record || ['registered', 'cancelled'].includes(record.status)) {
    return jsonResponse({ ok: true }, 200, NO_STORE);
  }
  await writePending(blobToken, secret, wallet, { ...record, codeDigest: '', status: 'cancelled' });
  if (record.verificationId) {
    await writeQueueJob(blobToken, secret, record.verificationId, { tombstone: true });
  }
  return jsonResponse({ ok: true }, 200, NO_STORE);
}

// ------------------------------------------------------------- register -----
async function register(body, blobToken, secret) {
  const { message, signature } = body;
  if (!/^0x[0-9a-fA-F]+$/.test(String(signature || ''))) return jsonResponse({ error: 'Invalid signature' }, 400, NO_STORE);
  const input = validateRegistrationInput(message);
  if (!input.ok) return jsonResponse({ error: input.error }, 400, NO_STORE);
  if (!isAddress(String(message.wallet || ''))) return jsonResponse({ error: 'Invalid wallet address' }, 400, NO_STORE);

  const wallet = getAddress(message.wallet);
  const record = await readPending(blobToken, secret, wallet);
  const recordVerified = record
    && record.status === 'code_verified'
    && record.verificationId === message.verificationId
    && record.lxmfAddress === message.lxmfAddress
    && !isCodeExpired(record);
  if (!recordVerified && !(await isValidVerifyProof(secret, body.proof, wallet, message))) {
    return jsonResponse({ error: 'Verify the code before signing' }, 409, NO_STORE);
  }

  const canonical = canonicalRegistrationMessage({
    wallet,
    lxmfAddress: message.lxmfAddress,
    verificationId: message.verificationId,
    issuedAt: input.issuedAt
  });
  const verified = await verifyTypedData({
    address: wallet,
    domain: REGISTRY_DOMAIN,
    types: REGISTRATION_TYPES,
    primaryType: 'Registration',
    message: canonical,
    signature
  });
  if (!verified) return jsonResponse({ error: 'Signature verification failed' }, 401, NO_STORE);

  const now = new Date().toISOString();
  // Takeover: an address moving here unlinks its previous wallet's record.
  const previous = await readSealed(blobToken, secret, byAddressPath(message.lxmfAddress));
  if (previous && !previous.tombstone && previous.wallet && previous.wallet !== wallet) {
    const old = normalizeRegistration(await readSealed(blobToken, secret, registrationPath(previous.wallet)));
    if (isActiveRegistration(old) && old.lxmfAddress === message.lxmfAddress) {
      await putSealed(blobToken, secret, registrationPath(previous.wallet), { ...old, unlinkedAt: now });
    }
  }

  const registration = normalizeRegistration({
    wallet,
    lxmfAddress: message.lxmfAddress,
    signature,
    message: serializableMessage(canonical),
    registeredAt: now
  });
  await putSealed(blobToken, secret, registrationPath(wallet), registration);
  await putSealed(blobToken, secret, byAddressPath(message.lxmfAddress), {
    lxmfAddress: message.lxmfAddress,
    wallet,
    registeredAt: now
  });
  if (record) {
    await writePending(blobToken, secret, wallet, { ...record, codeDigest: '', status: 'registered' });
  }

  return jsonResponse({ ok: true, registration: publicRegistration(registration) }, 200, NO_STORE);
}

// ------------------------------------------------------------- unlink -------
async function unlink(body, blobToken, secret) {
  const { message, signature } = body;
  if (!/^0x[0-9a-fA-F]+$/.test(String(signature || ''))) return jsonResponse({ error: 'Invalid signature' }, 400, NO_STORE);
  const input = validateUnlinkInput(message);
  if (!input.ok) return jsonResponse({ error: input.error }, 400, NO_STORE);
  if (!isAddress(String(message.wallet || ''))) return jsonResponse({ error: 'Invalid wallet address' }, 400, NO_STORE);

  const wallet = getAddress(message.wallet);
  const record = normalizeRegistration(await readSealed(blobToken, secret, registrationPath(wallet)));
  if (!isActiveRegistration(record)) {
    return jsonResponse({ error: 'No matching registration' }, 404, NO_STORE);
  }
  // Freshness bounds replay: the signature must be newly issued.
  if (Math.abs(Date.now() - input.issuedAt) > 10 * 60 * 1000) {
    return jsonResponse({ error: 'Unlink signature is stale — sign again' }, 409, NO_STORE);
  }

  const canonical = canonicalUnlinkMessage({
    wallet,
    nonce: message.nonce,
    issuedAt: input.issuedAt
  });
  const verified = await verifyTypedData({
    address: wallet,
    domain: REGISTRY_DOMAIN,
    types: UNLINK_TYPES,
    primaryType: 'Unlink',
    message: canonical,
    signature
  });
  if (!verified) return jsonResponse({ error: 'Signature verification failed' }, 401, NO_STORE);

  const now = new Date().toISOString();
  await putSealed(blobToken, secret, registrationPath(wallet), { ...record, unlinkedAt: now });
  await putSealed(blobToken, secret, byAddressPath(record.lxmfAddress), { tombstone: true, unlinkedAt: now });
  return jsonResponse({ ok: true }, 200, NO_STORE);
}

// ------------------------------------------------------------- badge --------
async function claimBadge(body, blobToken, secret) {
  const { message, signature } = body;
  if (!/^0x[0-9a-fA-F]+$/.test(String(signature || ''))) return jsonResponse({ error: 'Invalid signature' }, 400, NO_STORE);
  const input = validateBadgeClaimInput(message);
  if (!input.ok) return jsonResponse({ error: input.error }, 400, NO_STORE);
  if (!isAddress(String(message.wallet || ''))) return jsonResponse({ error: 'Invalid wallet address' }, 400, NO_STORE);
  const wallet = getAddress(message.wallet);
  if (Math.abs(Date.now() - input.issuedAt) > 10 * 60 * 1000) {
    return jsonResponse({ error: 'Claim signature is stale — sign again' }, 409, NO_STORE);
  }

  const canonical = canonicalBadgeClaimMessage({ wallet, nonce: message.nonce, issuedAt: input.issuedAt });
  const verified = await verifyTypedData({
    address: wallet,
    domain: REGISTRY_DOMAIN,
    types: BADGE_CLAIM_TYPES,
    primaryType: 'BadgeClaim',
    message: canonical,
    signature
  });
  if (!verified) return jsonResponse({ error: 'Signature verification failed' }, 401, NO_STORE);

  let balance;
  try {
    balance = await readSnapshotBalance(wallet, null);
  } catch (err) {
    console.error('Badge balance read failed', err);
    return jsonResponse({ error: 'Balance check failed' }, 502, NO_STORE);
  }
  const earned = badgeForBalance(balance.rawBalance, balance.decimals);
  const existing = await readBadge(blobToken, secret, wallet);
  const badge = higherBadge(normalizeBadge(existing?.badge), earned);
  if (badge === 'none') {
    return jsonResponse({ error: 'This wallet does not hold enough RATSPEAK for a badge' }, 403, NO_STORE);
  }
  const now = new Date().toISOString();
  await writeBadge(blobToken, secret, wallet, {
    version: 1,
    wallet,
    badge,
    claimedAt: existing?.claimedAt || now,
    updatedAt: now
  });
  return jsonResponse({ ok: true, badge }, 200, NO_STORE);
}

// ------------------------------------------------------------- bridge -------
async function bridgeQueue(blobToken, secret) {
  // Queue records are versioned like pendings (resends must never hide
  // behind a stale tombstone read): newest version per id wins, the legacy
  // single-file form is a fallback.
  const blobs = await listBlobs(blobToken, `${ROOT}/queue/`);
  const groups = new Map();
  for (const blob of blobs) {
    const rel = blob.pathname.slice(`${ROOT}/queue/`.length);
    const [head, version] = rel.split('/');
    const vid = head.replace(/\.json$/, '');
    const entry = groups.get(vid) || { legacy: null, versions: [] };
    if (version) entry.versions.push(blob);
    else entry.legacy = blob;
    groups.set(vid, entry);
  }
  const jobs = [];
  for (const entry of groups.values()) {
    entry.versions.sort((a, b) => (a.pathname < b.pathname ? -1 : 1));
    const newest = entry.versions[entry.versions.length - 1] || entry.legacy;
    if (!newest) continue;
    const job = await openSealedValue(secret, await fetchJson(newest.url));
    if (job && !job.tombstone && job.code) jobs.push(job);
  }
  return jsonResponse({ ok: true, jobs }, 200, NO_STORE);
}

const BRIDGE_STATUSES = ['resolving', 'sending', 'delivered', 'propagated', 'unreachable', 'failed'];

async function bridgeReport(body, blobToken, secret) {
  const verificationId = String(body.verificationId || '');
  const status = String(body.status || '');
  if (!isVerificationId(verificationId)) return jsonResponse({ error: 'Invalid verification id' }, 400, NO_STORE);
  if (!BRIDGE_STATUSES.includes(status)) return jsonResponse({ error: 'Invalid status' }, 400, NO_STORE);

  const job = await readQueueJob(blobToken, secret, verificationId);
  const wallet = job?.wallet || (isAddress(String(body.wallet || '')) ? getAddress(body.wallet) : null);
  if (!wallet) return jsonResponse({ error: 'Unknown verification' }, 404, NO_STORE);

  const record = await readPending(blobToken, secret, wallet);
  if (!record || record.verificationId !== verificationId) {
    return jsonResponse({ error: 'Unknown verification' }, 404, NO_STORE);
  }
  // A late bridge report never regresses a user-driven state; 'failed' maps
  // to the retryable 'unreachable' rather than resetting the flow.
  const mapped = status === 'failed' ? 'unreachable' : status;
  const protectedStatuses = ['registered', 'cancelled', 'code_verified'];
  const next = {
    ...record,
    status: protectedStatuses.includes(record.status) ? record.status : normalizePendingStatus(mapped),
    deliveredAt: (status === 'delivered' || status === 'propagated')
      ? (record.deliveredAt || new Date().toISOString())
      : record.deliveredAt
  };
  await writePending(blobToken, secret, wallet, next);
  // The first post-resolve report claims the job: the plaintext code leaves
  // storage once the bridge holds it in memory. The tombstone keeps the
  // wallet mapping so later reports for the same send still resolve.
  if (job && !job.tombstone && status !== 'resolving') {
    await writeQueueJob(blobToken, secret, verificationId, { tombstone: true, wallet: job.wallet, verificationId });
  }
  return jsonResponse({ ok: true }, 200, NO_STORE);
}

// ------------------------------------------------------------- helpers ------
async function loadOwnedPending(body, blobToken, secret) {
  if (!isAddress(String(body.wallet || ''))) return { error: jsonResponse({ error: 'Invalid wallet address' }, 400, NO_STORE) };
  const wallet = getAddress(body.wallet);
  if (!isVerificationId(String(body.verificationId || ''))) return { error: jsonResponse({ error: 'Invalid verification id' }, 400, NO_STORE) };
  const record = await readPending(blobToken, secret, wallet);
  if (!record || record.verificationId !== body.verificationId || ['registered', 'cancelled'].includes(record.status)) {
    return { error: jsonResponse({ error: 'No verification in progress' }, 404, NO_STORE) };
  }
  return { record };
}

function isLivePending(record) {
  if (!record || ['registered', 'cancelled'].includes(record.status)) return false;
  return !isCodeExpired(record);
}

function publicPending(record) {
  // Cancelled pendings vanish; expired ones stay visible so a returning
  // user resumes at the "code expired — start over" step, not at step 1.
  if (!record || record.status === 'cancelled') return null;
  return {
    lxmfAddress: shortLxmfAddress(record.lxmfAddress),
    status: normalizePendingStatus(record.status),
    codeIssuedAt: record.codeIssuedAt,
    lastSentAt: record.lastSentAt,
    deliveredAt: record.deliveredAt || '',
    sendCount: Number(record.sendCount || 0)
  };
}

function publicRegistration(record) {
  return {
    wallet: record.wallet,
    lxmfAddress: shortLxmfAddress(record.lxmfAddress),
    registeredAt: record.registeredAt
  };
}

function pendingPath(wallet) {
  return `${ROOT}/pending/${String(wallet).toLowerCase()}.json`;
}

// ---------------------------------------------------- versioned records -----
// Pending and badge records transition state, and Blob overwrites are not
// read-your-write: every transition is a NEW immutable file under the
// record's prefix, reads take the newest, older versions are pruned
// best-effort. The single-file paths remain as read-only legacy fallback.
function pendingPrefix(wallet) {
  return `${ROOT}/pending/${String(wallet).toLowerCase()}/`;
}

function badgePrefix(wallet) {
  return `${ROOT}/badges/${String(wallet).toLowerCase()}/`;
}

function versionKey() {
  return `${String(Date.now()).padStart(14, '0')}-${randomHex(4)}`;
}

function sortedVersions(blobs, prefix) {
  return blobs.filter(b => b.pathname.startsWith(prefix)).sort((a, b) => (a.pathname < b.pathname ? -1 : 1));
}

async function readVersioned(blobToken, secret, prefix, legacyPath) {
  const versions = sortedVersions(await listBlobs(blobToken, prefix, 1000), prefix);
  const newest = versions[versions.length - 1];
  if (newest) return openSealedValue(secret, await fetchJson(newest.url));
  return readSealed(blobToken, secret, legacyPath);
}

async function writeVersioned(blobToken, secret, prefix, value) {
  await putSealed(blobToken, secret, `${prefix}${versionKey()}.json`, value);
  try {
    const versions = sortedVersions(await listBlobs(blobToken, prefix, 1000), prefix);
    const stale = versions.slice(0, -8);
    if (stale.length) await deleteBlobs(blobToken, stale.map(b => b.url));
  } catch (e) {}
}

async function deleteBlobs(blobToken, urls) {
  await fetch(`${BLOB_API}/delete`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${blobToken}`,
      'x-api-version': API_VERSION,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ urls })
  });
}

function queuePrefix(verificationId) {
  return `${ROOT}/queue/${verificationId}/`;
}

const readPending = (t, s, wallet) => readVersioned(t, s, pendingPrefix(wallet), pendingPath(wallet));
const readQueueJob = (t, s, vid) => readVersioned(t, s, queuePrefix(vid), queuePath(vid));
const writeQueueJob = (t, s, vid, value) => writeVersioned(t, s, queuePrefix(vid), value);
const writePending = (t, s, wallet, value) => writeVersioned(t, s, pendingPrefix(wallet), value);
const readBadge = (t, s, wallet) => readVersioned(t, s, badgePrefix(wallet), badgePath(wallet));
const writeBadge = (t, s, wallet, value) => writeVersioned(t, s, badgePrefix(wallet), value);

function queuePath(verificationId) {
  return `${ROOT}/queue/${verificationId}.json`;
}

function registrationPath(wallet) {
  return `${ROOT}/registrations/${String(wallet).toLowerCase()}.json`;
}

function byAddressPath(lxmfAddress) {
  return `${ROOT}/by-address/${lxmfAddress}.json`;
}

function badgePath(wallet) {
  return `${ROOT}/badges/${String(wallet).toLowerCase()}.json`;
}

function verifyBridge(req) {
  const expected = process.env.IDENTITY_BRIDGE_TOKEN;
  if (!expected) return false;
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return Boolean(match && timingSafeEqual(match[1], expected));
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function digestCode(secret, verificationId, code) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${verificationId}:${code}`));
  return [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Stateless attestation that a code was verified: register accepts it in
// place of a fresh `code_verified` read, because Blob overwrites are not
// reliably read-your-write and must never block the final signature.
async function verifyProofMac(secret, wallet, verificationId, lxmfAddress, verifiedAt) {
  return digestCode(secret, verificationId, `verified:${wallet}:${lxmfAddress}:${verifiedAt}`);
}

async function isValidVerifyProof(secret, proof, wallet, message) {
  const verifiedAt = Number(proof?.verifiedAt || 0);
  if (!verifiedAt || Math.abs(Date.now() - verifiedAt) > CODE_TTL_MS) return false;
  const expected = await verifyProofMac(secret, wallet, message.verificationId, message.lxmfAddress, verifiedAt);
  return timingSafeEqual(expected, String(proof?.mac || ''));
}

function randomHex(bytes) {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return [...buf].map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---- sealed storage: records are AES-256-GCM ciphertext at rest, keyed by
// ---- HKDF(IDENTITY_CODE_SECRET) with a store-specific info string. A leaked
// ---- blob URL yields ciphertext only.
let storeKeyPromise = null;
function storeKey(secret) {
  if (!storeKeyPromise) {
    storeKeyPromise = (async () => {
      const raw = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'HKDF', false, ['deriveKey']);
      return crypto.subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(16), info: new TextEncoder().encode('holder-registry-store-v1') },
        raw,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
    })();
  }
  return storeKeyPromise;
}

function b64(bytes) {
  let out = '';
  for (const byte of bytes) out += String.fromCharCode(byte);
  return btoa(out);
}

function ub64(text) {
  return Uint8Array.from(atob(String(text || '')), ch => ch.charCodeAt(0));
}

async function putSealed(blobToken, secret, pathname, value) {
  const key = await storeKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(value))
  );
  await putJson(blobToken, pathname, { v: 1, iv: b64(iv), ct: b64(new Uint8Array(ciphertext)) });
}

async function readSealed(blobToken, secret, pathname) {
  return openSealedValue(secret, await readBlobJson(blobToken, pathname));
}

async function openSealedValue(secret, wrapped) {
  if (!wrapped) return null;
  if (!wrapped.ct) return wrapped; // pre-encryption record
  try {
    const key = await storeKey(secret);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ub64(wrapped.iv) }, key, ub64(wrapped.ct));
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    return null;
  }
}

async function putJson(blobToken, pathname, value) {
  const resp = await fetch(`${BLOB_API}/?pathname=${encodeURIComponent(pathname)}`, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${blobToken}`,
      'x-api-version': API_VERSION,
      'x-vercel-blob-access': 'public',
      'x-content-type': 'application/json',
      'x-add-random-suffix': '0',
      'x-allow-overwrite': '1'
    },
    body: JSON.stringify(value)
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    console.error('Registry Blob PUT failed', resp.status, detail.slice(0, 500));
    throw new Error('Registry storage write failed');
  }
}

async function readBlobJson(blobToken, pathname) {
  const blob = (await listBlobs(blobToken, pathname, 10)).find(item => item.pathname === pathname);
  if (!blob) return null;
  return fetchJson(blob.url);
}

async function fetchJson(url) {
  // Unique query bypasses the Blob CDN cache: overwritten records must read
  // back fresh (verify/register would otherwise see stale pending state).
  const fresh = `${url}${url.includes('?') ? '&' : '?'}nocache=${crypto.randomUUID()}`;
  const resp = await fetch(fresh, { cache: 'no-store' });
  if (!resp.ok) return null;
  return resp.json().catch(() => null);
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
  return jsonResponse({ error }, 429, { ...NO_STORE, ...rateLimitHeaders(limit) });
}
