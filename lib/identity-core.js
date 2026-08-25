// Holder-registry core: shared, pure logic for the portal's identity
// registration (wallet <-> LXMF address). Mirrors the vote-core pattern —
// imported by both the page and api/identity.js so validation cannot drift.
// Storage, HMAC digests, RPC reads, and signature verification live in the
// API layer; everything here is synchronous and side-effect free.
import { BASE_CHAIN_ID, TOKEN_ADDRESS, isEligibleBalance, parseRawBalance } from './vote-core.js';

export const REGISTRATION_KIND = 'ratspeak.holder_registry.registration.v1';
export const UNLINK_KIND = 'ratspeak.holder_registry.unlink.v1';
export const BADGE_CLAIM_KIND = 'ratspeak.holder_registry.badge_claim.v1';
export const REGISTRY_ELIGIBILITY_RULE = '>=1 RATSPEAK at latest block';

export const REGISTRY_DOMAIN = {
  name: 'Ratspeak Holder Registry',
  version: '1',
  chainId: BASE_CHAIN_ID
};

export const REGISTRATION_TYPES = {
  Registration: [
    { name: 'kind', type: 'string' },
    { name: 'wallet', type: 'address' },
    { name: 'lxmfAddress', type: 'string' },
    { name: 'tokenContract', type: 'address' },
    { name: 'verificationId', type: 'string' },
    { name: 'issuedAt', type: 'uint256' }
  ]
};

// Unlink is wallet-scoped (one registration per wallet) so masked reads can
// never block it: the signer does not need to know the stored address.
export const UNLINK_TYPES = {
  Unlink: [
    { name: 'kind', type: 'string' },
    { name: 'wallet', type: 'address' },
    { name: 'nonce', type: 'string' },
    { name: 'issuedAt', type: 'uint256' }
  ]
};

// Unambiguous uppercase alphabet (no 0/O/1/I/L): 6 chars ~= 30 bits —
// paired with server-side attempt rate limits and the 15-minute TTL.
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
export const CODE_TTL_MS = 15 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const VERIFICATION_ID_HEX_LENGTH = 32;
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

// Delivery statuses in timeline order, then the two post-delivery stages.
export const DELIVERY_STATUSES = ['queued', 'resolving', 'sending', 'delivered', 'propagated'];
export const PENDING_STATUSES = [...DELIVERY_STATUSES, 'code_verified'];
export const TERMINAL_STATUSES = ['registered', 'expired', 'cancelled'];
// Retryable failures, not terminal: 'unreachable' = the mesh found no path
// to the address; 'undelivered' = the message went out but no delivery proof
// came back. They point at different problems, so they stay distinct.
export const VERIFICATION_STATUSES = [...PENDING_STATUSES, 'unreachable', 'undelivered', ...TERMINAL_STATUSES];

// LXMF address = 16-byte Reticulum destination hash, 32 hex chars.
// Accepts plain hex plus the pretty forms Ratspeak/Python print
// ("<aa:bb:...>", spaced or colon-grouped); returns lowercase hex or ''.
export function normalizeLxmfAddress(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const stripped = raw.replace(/^</, '').replace(/>$/, '').replace(/[\s:.-]/g, '');
  if (!/^[0-9a-fA-F]{32}$/.test(stripped)) return '';
  return stripped.toLowerCase();
}

export function isLxmfAddress(value) {
  return /^[0-9a-f]{32}$/.test(String(value || ''));
}

export function shortLxmfAddress(value) {
  const hex = normalizeLxmfAddress(value);
  if (!hex) return '';
  return `${hex.slice(0, 4)}…${hex.slice(-4)}`;
}

export function normalizeCode(value) {
  return String(value || '').toUpperCase().replace(/[\s-]/g, '');
}

export function isCodeShaped(value) {
  if (String(value || '').length !== CODE_LENGTH) return false;
  return [...String(value)].every(ch => CODE_ALPHABET.includes(ch));
}

export function codeFromRandomBytes(bytes) {
  if (!bytes || bytes.length < CODE_LENGTH) throw new Error(`need at least ${CODE_LENGTH} random bytes`);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

export function isVerificationId(value) {
  return new RegExp(`^[0-9a-f]{${VERIFICATION_ID_HEX_LENGTH}}$`).test(String(value || ''));
}

export function canonicalRegistrationMessage({ wallet, lxmfAddress, verificationId, issuedAt }) {
  return {
    kind: REGISTRATION_KIND,
    wallet,
    lxmfAddress,
    tokenContract: TOKEN_ADDRESS,
    verificationId: String(verificationId || ''),
    issuedAt: BigInt(issuedAt)
  };
}

export function canonicalUnlinkMessage({ wallet, nonce, issuedAt }) {
  return {
    kind: UNLINK_KIND,
    wallet,
    nonce: String(nonce || ''),
    issuedAt: BigInt(issuedAt)
  };
}

export function serializableMessage(message) {
  return { ...message, issuedAt: message.issuedAt.toString() };
}

export function validateRegistrationInput(message, nowMs = Date.now()) {
  if (!message || typeof message !== 'object') return fail('missing signed message');
  if (message.kind !== REGISTRATION_KIND) return fail('wrong registration kind');
  if (!isLxmfAddress(message.lxmfAddress)) return fail('invalid lxmf address');
  if (String(message.tokenContract || '').toLowerCase() !== TOKEN_ADDRESS.toLowerCase()) return fail('wrong token contract');
  if (!isVerificationId(message.verificationId)) return fail('invalid verification id');
  return validateIssuedAt(message, nowMs);
}

export function validateUnlinkInput(message, nowMs = Date.now()) {
  if (!message || typeof message !== 'object') return fail('missing signed message');
  if (message.kind !== UNLINK_KIND) return fail('wrong unlink kind');
  if (!isVerificationId(message.nonce)) return fail('invalid nonce');
  return validateIssuedAt(message, nowMs);
}

function validateIssuedAt(message, nowMs) {
  const issuedAt = Number(message.issuedAt);
  if (!Number.isSafeInteger(issuedAt) || issuedAt <= 0) return fail('invalid timestamp');
  if (issuedAt > nowMs + MAX_CLOCK_SKEW_MS) return fail('timestamp is too far ahead');
  return { ok: true, issuedAt };
}

// ------------------------------------------------- pending verification ----
export function isDeliveryComplete(status) {
  return status === 'delivered' || status === 'propagated';
}

// The user may have received the code even while the proof is still in
// flight, so code entry opens as soon as the send is under way.
export function canEnterCode(status) {
  return status === 'sending' || isDeliveryComplete(status);
}

export function isCodeExpired(pending, nowMs = Date.now()) {
  const issued = Date.parse(String(pending?.codeIssuedAt || ''));
  return Number.isFinite(issued) && nowMs > issued + CODE_TTL_MS;
}

export function canResend(pending, nowMs = Date.now()) {
  if (!pending) return false;
  if (TERMINAL_STATUSES.includes(pending.status)) return false;
  const lastSent = Date.parse(String(pending.lastSentAt || pending.codeIssuedAt || ''));
  if (!Number.isFinite(lastSent)) return true;
  return nowMs - lastSent >= RESEND_COOLDOWN_MS;
}

export function normalizePendingStatus(status) {
  return VERIFICATION_STATUSES.includes(status) ? status : 'queued';
}

// ------------------------------------------------------------- badges -------
// Holder badge ladder (token amounts, editable). Assigned server-side from
// the same balance read that gates eligibility; stored with the record.
export const BADGE_TIERS = [
  { id: 'bronze', name: 'Bronze', minTokens: 1_000_000n },
  { id: 'silver', name: 'Silver', minTokens: 10_000_000n },
  { id: 'gold', name: 'Gold', minTokens: 100_000_000n },
  { id: 'diamond', name: 'Diamond', minTokens: 1_000_000_000n }
];

export function badgeForBalance(rawBalance, decimals = 18) {
  const raw = parseRawBalance(rawBalance);
  const unit = 10n ** BigInt(decimals);
  let tier = 'none';
  for (const t of BADGE_TIERS) {
    if (raw >= t.minTokens * unit) tier = t.id;
  }
  return tier;
}

export function normalizeBadge(value) {
  return BADGE_TIERS.some(t => t.id === value) ? value : 'none';
}

export function badgeRank(tier) {
  return BADGE_TIERS.findIndex(t => t.id === tier); // -1 for none
}

// "A badge is a badge": claims upgrade, never downgrade.
export function higherBadge(a, b) {
  return badgeRank(a) >= badgeRank(b) ? normalizeBadge(a) : normalizeBadge(b);
}

export const BADGE_CLAIM_TYPES = {
  BadgeClaim: [
    { name: 'kind', type: 'string' },
    { name: 'wallet', type: 'address' },
    { name: 'tokenContract', type: 'address' },
    { name: 'nonce', type: 'string' },
    { name: 'issuedAt', type: 'uint256' }
  ]
};

export function canonicalBadgeClaimMessage({ wallet, nonce, issuedAt }) {
  return {
    kind: BADGE_CLAIM_KIND,
    wallet,
    tokenContract: TOKEN_ADDRESS,
    nonce: String(nonce || ''),
    issuedAt: BigInt(issuedAt)
  };
}

export function validateBadgeClaimInput(message, nowMs = Date.now()) {
  if (!message || typeof message !== 'object') return fail('missing signed message');
  if (message.kind !== BADGE_CLAIM_KIND) return fail('wrong claim kind');
  if (String(message.tokenContract || '').toLowerCase() !== TOKEN_ADDRESS.toLowerCase()) return fail('wrong token contract');
  if (!isVerificationId(message.nonce)) return fail('invalid nonce');
  return validateIssuedAt(message, nowMs);
}

// -------------------------------------------------------------- perks -------
// Enrollment is the consent gate for the relay perks: the ONLY signal that
// lets an address + tier leave the private registry for the infra fleet.
// The signature covers the consent facts; alert preferences are portal-side
// state, never part of the signed message and never shared with infra.
export const PERKS_KIND = 'ratspeak.holder_registry.perks.v1';

export const PERKS_TYPES = {
  Perks: [
    { name: 'kind', type: 'string' },
    { name: 'wallet', type: 'address' },
    { name: 'lxmfAddress', type: 'string' },
    { name: 'enrolled', type: 'bool' },
    { name: 'nonce', type: 'string' },
    { name: 'issuedAt', type: 'uint256' }
  ]
};

export const ALERT_THRESHOLD_DEFAULT_MIN = 15;
export const ALERT_THRESHOLD_MIN_MIN = 5;
export const ALERT_THRESHOLD_MAX_MIN = 1440;

export function canonicalPerksMessage({ wallet, lxmfAddress, enrolled, nonce, issuedAt }) {
  return {
    kind: PERKS_KIND,
    wallet,
    lxmfAddress: normalizeLxmfAddress(lxmfAddress),
    enrolled: Boolean(enrolled),
    nonce: String(nonce || ''),
    issuedAt: BigInt(issuedAt)
  };
}

export function validatePerksInput(message, nowMs = Date.now()) {
  if (!message || typeof message !== 'object') return fail('missing signed message');
  if (message.kind !== PERKS_KIND) return fail('wrong perks kind');
  if (!isLxmfAddress(message.lxmfAddress)) return fail('invalid lxmf address');
  if (typeof message.enrolled !== 'boolean') return fail('invalid enrolled flag');
  if (!isVerificationId(message.nonce)) return fail('invalid nonce');
  return validateIssuedAt(message, nowMs);
}

export function normalizeAlertThreshold(value) {
  const minutes = Number(value);
  if (!Number.isInteger(minutes)) return ALERT_THRESHOLD_DEFAULT_MIN;
  return Math.min(ALERT_THRESHOLD_MAX_MIN, Math.max(ALERT_THRESHOLD_MIN_MIN, minutes));
}

// --------------------------------------------------- registration record ---
export function normalizeRegistration(record) {
  if (!record || typeof record !== 'object') return null;
  const lxmfAddress = normalizeLxmfAddress(record.lxmfAddress);
  const wallet = String(record.wallet || '');
  if (!lxmfAddress || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) return null;
  return {
    version: 1,
    wallet,
    lxmfAddress,
    tokenContract: TOKEN_ADDRESS,
    signature: String(record.signature || ''),
    message: record.message && typeof record.message === 'object' ? record.message : null,
    registeredAt: cleanTimestamp(record.registeredAt),
    unlinkedAt: cleanTimestamp(record.unlinkedAt)
  };
}

export function isActiveRegistration(record) {
  return Boolean(record && record.registeredAt && !record.unlinkedAt);
}

export function isEligibleToRegister(rawBalance, decimals = 18) {
  return isEligibleBalance(rawBalance, decimals);
}

function cleanTimestamp(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return Number.isNaN(Date.parse(raw)) ? '' : raw;
}

function fail(error) {
  return { ok: false, error };
}
