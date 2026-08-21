import test from 'node:test';
import assert from 'node:assert/strict';
import { TOKEN_ADDRESS } from '../lib/vote-core.js';
import {
  BADGE_CLAIM_KIND,
  BADGE_TIERS,
  CODE_ALPHABET,
  CODE_LENGTH,
  CODE_TTL_MS,
  DELIVERY_STATUSES,
  REGISTRATION_KIND,
  RESEND_COOLDOWN_MS,
  TERMINAL_STATUSES,
  UNLINK_KIND,
  VERIFICATION_STATUSES,
  canEnterCode,
  canResend,
  canonicalRegistrationMessage,
  canonicalUnlinkMessage,
  codeFromRandomBytes,
  isActiveRegistration,
  isCodeExpired,
  isCodeShaped,
  isDeliveryComplete,
  isEligibleToRegister,
  isLxmfAddress,
  isVerificationId,
  badgeForBalance,
  canonicalBadgeClaimMessage,
  higherBadge,
  normalizeBadge,
  validateBadgeClaimInput,
  normalizeCode,
  normalizeLxmfAddress,
  normalizePendingStatus,
  normalizeRegistration,
  serializableMessage,
  shortLxmfAddress,
  validateRegistrationInput,
  validateUnlinkInput
} from '../lib/identity-core.js';

const ADDR = '8f4a2b7c91d30e56a1c4f7b2d8e90a3b';
const WALLET = '0x667fF918754239Bc5DfB39EfE943f29c735E7CB4';
const VID = 'a'.repeat(32);

test('normalizeLxmfAddress accepts plain and pretty forms', () => {
  assert.equal(normalizeLxmfAddress(ADDR), ADDR);
  assert.equal(normalizeLxmfAddress(ADDR.toUpperCase()), ADDR);
  assert.equal(normalizeLxmfAddress(`  ${ADDR}  `), ADDR);
  const pretty = '<8f:4a:2b:7c:91:d3:0e:56:a1:c4:f7:b2:d8:e9:0a:3b>';
  assert.equal(normalizeLxmfAddress(pretty), ADDR);
  assert.equal(normalizeLxmfAddress('8f4a 2b7c 91d3 0e56 a1c4 f7b2 d8e9 0a3b'), ADDR);
});

test('normalizeLxmfAddress rejects wrong shapes', () => {
  assert.equal(normalizeLxmfAddress(''), '');
  assert.equal(normalizeLxmfAddress(ADDR.slice(0, 30)), '', 'too short');
  assert.equal(normalizeLxmfAddress(ADDR + 'ff'), '', 'too long (identity hash, not address?)');
  assert.equal(normalizeLxmfAddress('8f4a2b7c-not-an-address'), '');
  assert.equal(normalizeLxmfAddress(WALLET), '', 'an EVM address is not an LXMF address');
  assert.equal(isLxmfAddress(ADDR.toUpperCase()), false, 'isLxmfAddress expects normalized lowercase');
  assert.equal(isLxmfAddress(ADDR), true);
});

test('shortLxmfAddress renders the 4…4 form', () => {
  assert.equal(shortLxmfAddress(ADDR), '8f4a…0a3b');
  assert.equal(shortLxmfAddress('junk'), '');
});

test('code alphabet excludes ambiguous glyphs and shapes correctly', () => {
  for (const ch of '01OIL') assert.equal(CODE_ALPHABET.includes(ch), false, `alphabet must exclude ${ch}`);
  assert.equal(CODE_ALPHABET.length, 31);
  assert.equal(isCodeShaped('R7FKQ2'), true);
  assert.equal(isCodeShaped('R7FKQ'), false, 'length');
  assert.equal(isCodeShaped('R7FKQ0'), false, 'excluded glyph');
  assert.equal(normalizeCode(' r7f-kq2 '), 'R7FKQ2');
});

test('codeFromRandomBytes yields alphabet-only codes of the right length', () => {
  const code = codeFromRandomBytes(new Uint8Array([0, 30, 31, 62, 255, 7]));
  assert.equal(code.length, CODE_LENGTH);
  assert.equal(isCodeShaped(code), true);
  assert.throws(() => codeFromRandomBytes(new Uint8Array(4)));
});

test('registration message canonicalization and serialization', () => {
  const message = canonicalRegistrationMessage({
    wallet: WALLET,
    lxmfAddress: ADDR,
    verificationId: VID,
    issuedAt: 1755720000000
  });
  assert.equal(message.kind, REGISTRATION_KIND);
  assert.equal(message.tokenContract, TOKEN_ADDRESS);
  assert.equal(typeof message.issuedAt, 'bigint');
  const serialized = serializableMessage(message);
  assert.equal(serialized.issuedAt, '1755720000000');
  assert.equal(JSON.parse(JSON.stringify(serialized)).lxmfAddress, ADDR, 'JSON-safe');
});

test('validateRegistrationInput rejections', () => {
  const now = Date.now();
  const base = {
    kind: REGISTRATION_KIND,
    wallet: WALLET,
    lxmfAddress: ADDR,
    tokenContract: TOKEN_ADDRESS,
    verificationId: VID,
    issuedAt: String(now)
  };
  assert.equal(validateRegistrationInput(base, now).ok, true);
  assert.equal(validateRegistrationInput(null).error, 'missing signed message');
  assert.equal(validateRegistrationInput({ ...base, kind: UNLINK_KIND }).error, 'wrong registration kind');
  assert.equal(validateRegistrationInput({ ...base, lxmfAddress: ADDR.toUpperCase() }).error, 'invalid lxmf address', 'must be pre-normalized');
  assert.equal(validateRegistrationInput({ ...base, tokenContract: '0x' + '2'.repeat(40) }).error, 'wrong token contract');
  assert.equal(validateRegistrationInput({ ...base, verificationId: 'short' }).error, 'invalid verification id');
  assert.equal(validateRegistrationInput({ ...base, issuedAt: '-1' }).error, 'invalid timestamp');
  assert.equal(
    validateRegistrationInput({ ...base, issuedAt: String(now + 6 * 60 * 1000) }, now).error,
    'timestamp is too far ahead'
  );
  assert.equal(validateRegistrationInput({ ...base, issuedAt: String(now + 4 * 60 * 1000) }, now).ok, true);
});

test('validateUnlinkInput is wallet-scoped', () => {
  const now = Date.now();
  const base = { kind: UNLINK_KIND, wallet: WALLET, nonce: VID, issuedAt: String(now) };
  assert.equal(validateUnlinkInput(base, now).ok, true);
  assert.equal(validateUnlinkInput({ ...base, kind: REGISTRATION_KIND }).error, 'wrong unlink kind');
  assert.equal(validateUnlinkInput({ ...base, nonce: 'nope' }).error, 'invalid nonce');
  const unlink = canonicalUnlinkMessage({ wallet: WALLET, nonce: VID, issuedAt: now });
  assert.equal(unlink.kind, UNLINK_KIND);
  assert.equal('lxmfAddress' in unlink, false, 'unlink carries no address');
});

test('status vocabulary is coherent', () => {
  assert.deepEqual(DELIVERY_STATUSES, ['queued', 'resolving', 'sending', 'delivered', 'propagated']);
  for (const status of [...TERMINAL_STATUSES, 'unreachable']) {
    assert.equal(VERIFICATION_STATUSES.includes(status), true);
  }
  assert.equal(isDeliveryComplete('delivered'), true);
  assert.equal(isDeliveryComplete('propagated'), true);
  assert.equal(isDeliveryComplete('sending'), false);
  assert.equal(canEnterCode('sending'), true, 'code entry opens while proof is in flight');
  assert.equal(canEnterCode('resolving'), false);
  assert.equal(normalizePendingStatus('bogus'), 'queued');
  assert.equal(normalizePendingStatus('propagated'), 'propagated');
});

test('code expiry and resend cooldown', () => {
  const issued = Date.parse('2026-08-20T18:00:00Z');
  const pending = { status: 'delivered', codeIssuedAt: '2026-08-20T18:00:00.000Z', lastSentAt: '2026-08-20T18:00:00.000Z' };
  assert.equal(isCodeExpired(pending, issued + CODE_TTL_MS - 1000), false);
  assert.equal(isCodeExpired(pending, issued + CODE_TTL_MS + 1000), true);
  assert.equal(canResend(pending, issued + RESEND_COOLDOWN_MS - 1000), false);
  assert.equal(canResend(pending, issued + RESEND_COOLDOWN_MS + 1000), true);
  assert.equal(canResend({ ...pending, status: 'registered' }, issued + 10 * RESEND_COOLDOWN_MS), false, 'terminal never resends');
  assert.equal(canResend({ status: 'unreachable' }, issued), true, 'no send timestamp yet');
  assert.equal(canResend(null, issued), false);
});

test('registration record normalization and active check', () => {
  const record = normalizeRegistration({
    wallet: WALLET,
    lxmfAddress: ADDR.toUpperCase(),
    signature: '0xabc',
    message: { kind: REGISTRATION_KIND },
    registeredAt: '2026-08-20T18:30:00Z'
  });
  assert.equal(record.lxmfAddress, ADDR, 'address normalized on the way in');
  assert.equal(record.tokenContract, TOKEN_ADDRESS);
  assert.equal(isActiveRegistration(record), true);
  assert.equal(isActiveRegistration({ ...record, unlinkedAt: '2026-08-21T00:00:00Z' }), false);
  assert.equal(normalizeRegistration({ wallet: 'nope', lxmfAddress: ADDR }), null);
  assert.equal(normalizeRegistration({ wallet: WALLET, lxmfAddress: 'nope' }), null);
  assert.equal(normalizeRegistration({ wallet: WALLET, lxmfAddress: ADDR, registeredAt: 'garbage' }).registeredAt, '');
});

test('eligibility reuses the vote-core threshold', () => {
  assert.equal(isEligibleToRegister((10n ** 18n).toString(), 18), true);
  assert.equal(isEligibleToRegister((10n ** 18n - 1n).toString(), 18), false);
});

test('badge ladder boundaries', () => {
  const T = 10n ** 18n;
  assert.equal(badgeForBalance((999_999n * T).toString()), 'none');
  assert.equal(badgeForBalance((1_000_000n * T).toString()), 'bronze');
  assert.equal(badgeForBalance((10_000_000n * T).toString()), 'silver');
  assert.equal(badgeForBalance((999_999_999n * T).toString()), 'gold');
  assert.equal(badgeForBalance((1_000_000_000n * T).toString()), 'diamond');
  assert.equal(badgeForBalance((5_000_000_000n * T).toString()), 'diamond');
  assert.equal(badgeForBalance('junk'), 'none');
  assert.equal(badgeForBalance((1_000_000n * 10n ** 6n).toString(), 6), 'bronze', 'decimals-aware');
  assert.equal(normalizeBadge('gold'), 'gold');
  assert.equal(normalizeBadge('platinum'), 'none');
  assert.equal(BADGE_TIERS.length, 4);
});

test('badge claims validate and only upgrade', () => {
  const now = Date.now();
  const message = canonicalBadgeClaimMessage({ wallet: WALLET, nonce: VID, issuedAt: now });
  assert.equal(message.kind, BADGE_CLAIM_KIND);
  const serial = { ...message, issuedAt: String(now) };
  assert.equal(validateBadgeClaimInput(serial, now).ok, true);
  assert.equal(validateBadgeClaimInput({ ...serial, kind: 'nope' }).error, 'wrong claim kind');
  assert.equal(validateBadgeClaimInput({ ...serial, tokenContract: '0x' + '3'.repeat(40) }).error, 'wrong token contract');
  assert.equal(validateBadgeClaimInput({ ...serial, nonce: 'x' }).error, 'invalid nonce');
  assert.equal(higherBadge('gold', 'silver'), 'gold');
  assert.equal(higherBadge('silver', 'gold'), 'gold');
  assert.equal(higherBadge('none', 'bronze'), 'bronze');
  assert.equal(higherBadge('diamond', 'none'), 'diamond');
});

test('isVerificationId', () => {
  assert.equal(isVerificationId(VID), true);
  assert.equal(isVerificationId(VID.toUpperCase()), false);
  assert.equal(isVerificationId('a'.repeat(31)), false);
});
