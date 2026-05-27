export const BASE_CHAIN_ID = 8453;
export const TOKEN_ADDRESS = '0xf1e9baa65d418a9025e1851dd2d37f1ad208bba3';
export const SNAPSHOT_BLOCK = 46537952;
export const VOTE_KIND = 'ratspeak.community_poll.snapshot.v1';
export const VOTE_STRATEGY = 'erc20-balance-of-at-block';
export const ELIGIBILITY_THRESHOLD_TOKENS = 1n;

export const VOTE_DOMAIN = {
  name: 'Ratspeak Community Poll',
  version: '1',
  chainId: BASE_CHAIN_ID
};

export const VOTE_TYPES = {
  Vote: [
    { name: 'kind', type: 'string' },
    { name: 'pollId', type: 'string' },
    { name: 'choiceId', type: 'string' },
    { name: 'voter', type: 'address' },
    { name: 'tokenContract', type: 'address' },
    { name: 'snapshotBlock', type: 'uint256' },
    { name: 'strategy', type: 'string' },
    { name: 'nonce', type: 'string' },
    { name: 'createdAt', type: 'uint256' }
  ]
};

export const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] }
];

export const DEFAULT_POLLS = [
  {
    id: 'node-deployments',
    title: 'What community improvements next?',
    deckTitle: 'Community Allocation',
    type: 'Proposal #1',
    snapshotBlock: SNAPSHOT_BLOCK,
    closes: '2026-06-15T23:59:00Z',
    description: 'Help us decide where to improve the community next!',
    choices: [
      { id: 'rural-us-mesh-seed-kits', name: 'Distribute more nodes', detail: 'Give away more nodes to the community worldwide.' },
      { id: 'hackerspaces-and-maker-labs', name: 'Create YouTube videos and blogs', detail: 'Create educational and informational videos on Ratspeak & Reticulum.' },
      { id: 'global-firmware-testers', name: 'Improve Discord & Telegram', detail: 'Get Discord and Telegram better setup to support crypto community.' },
      { id: 'university-radio-clubs', name: 'Marketing materials', detail: 'Create one-pagers, flyers, etc., that can easily be distributed and shared.' }
    ]
  }
];

export function normalizePollState(value) {
  const source = value && Array.isArray(value.polls) ? value.polls : DEFAULT_POLLS;
  const seen = new Set();
  const normalized = [];

  source.forEach((poll, index) => {
    const next = normalizePoll(poll, index);
    if (!next || seen.has(next.id)) return;
    seen.add(next.id);
    normalized.push(next);
  });

  if (!normalized.length && source !== DEFAULT_POLLS) {
    return normalizePollState({ version: 1, polls: DEFAULT_POLLS });
  }

  return { version: 1, polls: normalized };
}

export function normalizePoll(poll, index = 0) {
  if (!poll || typeof poll !== 'object') return null;
  const id = slugify(poll.id, `proposal-${index + 1}`);
  const choices = Array.isArray(poll.choices)
    ? poll.choices.map((choice, choiceIndex) => normalizeChoice(choice, choiceIndex)).filter(Boolean)
    : [];
  if (choices.length < 2) return null;

  const snapshotBlock = Number(poll.snapshotBlock);
  return {
    id,
    title: cleanText(poll.title, 'Untitled proposal', 220),
    deckTitle: cleanText(poll.deckTitle || poll.title, 'Proposal', 80),
    type: cleanText(poll.type, 'Proposal', 48),
    snapshotBlock: Number.isSafeInteger(snapshotBlock) && snapshotBlock > 0 ? snapshotBlock : SNAPSHOT_BLOCK,
    closes: normalizeCloseTime(poll.closes),
    description: cleanText(poll.description, '', 280),
    choices,
    createdAt: cleanText(poll.createdAt, '', 40),
    updatedAt: cleanText(poll.updatedAt, '', 40)
  };
}

export function normalizeChoice(choice, index = 0) {
  if (!choice || typeof choice !== 'object') return null;
  const name = cleanText(choice.name, '', 120);
  if (!name) return null;
  return {
    id: slugify(choice.id || name, `choice-${index + 1}`),
    name,
    detail: cleanText(choice.detail, '', 220)
  };
}

export function cleanText(value, fallback = '', maxLength = 280) {
  const text = String(value == null ? fallback : value).trim();
  return text.slice(0, maxLength);
}

export function normalizeCloseTime(value) {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T23:59:00Z`;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().replace(/\.\d{3}Z$/, 'Z');
  return '';
}

export function slugify(value, fallback) {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

export function findPoll(polls, pollId) {
  return polls.find(poll => poll.id === pollId) || null;
}

export function findChoice(poll, choiceId) {
  return poll?.choices.find(choice => choice.id === choiceId) || null;
}

export function isPollClosed(poll, nowMs = Date.now()) {
  const closes = Date.parse(normalizeCloseTime(poll?.closes));
  return Number.isFinite(closes) && nowMs > closes;
}

export function canonicalVoteMessage({ poll, choice, voter, nonce, createdAt }) {
  return {
    kind: VOTE_KIND,
    pollId: poll.id,
    choiceId: choice.id,
    voter,
    tokenContract: TOKEN_ADDRESS,
    snapshotBlock: BigInt(poll.snapshotBlock),
    strategy: VOTE_STRATEGY,
    nonce: String(nonce || ''),
    createdAt: BigInt(createdAt)
  };
}

export function serializableVoteMessage(message) {
  return {
    ...message,
    snapshotBlock: message.snapshotBlock.toString(),
    createdAt: message.createdAt.toString()
  };
}

export function validateVoteMessageInput(message) {
  if (!message || typeof message !== 'object') return fail('missing signed message');
  if (message.kind !== VOTE_KIND) return fail('wrong vote kind');
  if (!isSlug(message.pollId)) return fail('invalid poll id');
  if (!isSlug(message.choiceId)) return fail('invalid choice id');
  if (String(message.tokenContract || '').toLowerCase() !== TOKEN_ADDRESS.toLowerCase()) return fail('wrong token contract');
  if (message.strategy !== VOTE_STRATEGY) return fail('wrong voting strategy');
  if (!/^[a-zA-Z0-9._:-]{8,160}$/.test(String(message.nonce || ''))) return fail('invalid nonce');

  const snapshotBlock = Number(message.snapshotBlock);
  if (!Number.isSafeInteger(snapshotBlock) || snapshotBlock <= 0) return fail('invalid snapshot block');

  const createdAt = Number(message.createdAt);
  if (!Number.isSafeInteger(createdAt) || createdAt <= 0) return fail('invalid signature timestamp');
  if (Number.isNaN(new Date(createdAt).getTime())) return fail('invalid signature timestamp');
  if (createdAt > Date.now() + 5 * 60 * 1000) return fail('signature timestamp is too far ahead');

  return { ok: true, snapshotBlock, createdAt };
}

export function validateVoteAgainstPoll(message, poll, choice) {
  if (!poll) return fail('unknown poll');
  if (!choice) return fail('unknown choice');
  if (message.pollId !== poll.id) return fail('poll mismatch');
  if (message.choiceId !== choice.id) return fail('choice mismatch');
  if (Number(message.snapshotBlock) !== Number(poll.snapshotBlock)) return fail('snapshot block mismatch');
  if (isPollClosed(poll)) return fail('poll is closed');
  return { ok: true };
}

export function aggregateResults(poll, votes, options = {}) {
  const tokenDecimals = Number.isInteger(options.tokenDecimals) ? options.tokenDecimals : 18;
  const tokenSymbol = options.tokenSymbol || 'RATSPEAK';
  const stats = new Map(poll.choices.map(choice => [choice.id, {
    choiceId: choice.id,
    name: choice.name,
    detail: choice.detail || '',
    voters: 0
  }]));
  let updatedAt = '';

  for (const vote of votes) {
    if (!vote || vote.pollId !== poll.id || Number(vote.snapshotBlock) !== Number(poll.snapshotBlock)) continue;
    const stat = stats.get(vote.choiceId);
    if (!stat) continue;
    const decimals = Number.isInteger(vote.tokenDecimals) ? vote.tokenDecimals : tokenDecimals;
    if (!isEligibleVote(vote, decimals)) continue;
    stat.voters += 1;
    if (!updatedAt || String(vote.receivedAt || '') > updatedAt) updatedAt = String(vote.receivedAt || '');
  }

  const choices = Array.from(stats.values());
  const voterCount = choices.reduce((sum, choice) => sum + choice.voters, 0);

  return {
    version: 1,
    pollId: poll.id,
    pollTitle: poll.title,
    snapshotBlock: poll.snapshotBlock,
    tokenContract: TOKEN_ADDRESS,
    tokenSymbol,
    tokenDecimals,
    voterCount,
    updatedAt,
    choices: choices.map(choice => ({
      choiceId: choice.choiceId,
      name: choice.name,
      detail: choice.detail,
      voters: choice.voters,
      percent: voterCount > 0 ? Number((BigInt(choice.voters) * 10000n) / BigInt(voterCount)) / 100 : 0
    }))
  };
}

export function isEligibleBalance(rawBalance, decimals = 18) {
  return parseRawBalance(rawBalance) >= eligibilityThresholdRaw(decimals);
}

export function isEligibleVote(vote, decimals = 18) {
  if (vote?.eligible === true) return true;
  if (vote?.eligible === false) return false;
  return isEligibleBalance(vote?.snapshotBalanceRaw, decimals);
}

export function eligibilityThresholdRaw(decimals = 18) {
  return ELIGIBILITY_THRESHOLD_TOKENS * (10n ** BigInt(decimals));
}

export function parseRawBalance(value) {
  try {
    const raw = BigInt(String(value || '0'));
    return raw > 0n ? raw : 0n;
  } catch {
    return 0n;
  }
}

function isSlug(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value || ''));
}

function fail(error) {
  return { ok: false, error };
}
