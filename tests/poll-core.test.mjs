import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_POLLS,
  ELIGIBILITY_THRESHOLD_TOKENS,
  SNAPSHOT_BLOCK,
  STARTER_POLL_CLOSES,
  STARTER_POLL_ID,
  STARTER_POLL_TITLE,
  TOKEN_ADDRESS,
  VOTE_KIND,
  VOTE_STRATEGY,
  aggregateResults,
  canonicalVoteForPoll,
  canonicalVoteMessage,
  cleanText,
  eligibilityThresholdRaw,
  findChoice,
  findPoll,
  isEligibleBalance,
  isEligibleVote,
  isPollClosed,
  normalizeCloseTime,
  normalizePoll,
  normalizePollState,
  parseRawBalance,
  pollWinnerChoice,
  serializableVoteMessage,
  slugify,
  validateVoteAgainstPoll,
  validateVoteMessageInput,
  voteStoragePollIds
} from '../lib/vote-core.js';

const LEGACY_STARTER_POLL_ID = 'node-deployments';

function starterPoll() {
  return normalizePollState(null).polls[0];
}

function openPoll(overrides = {}) {
  return normalizePoll({
    id: 'test-poll',
    title: 'Test poll?',
    deckTitle: 'Test',
    type: 'Proposal #2',
    snapshotBlock: 50000000,
    closes: '2099-01-01T00:00:00Z',
    description: 'A test poll.',
    choices: [
      { id: 'alpha', name: 'Alpha', detail: 'First' },
      { id: 'beta', name: 'Beta', detail: 'Second' }
    ],
    ...overrides
  });
}

function voteFor(poll, choiceId, voter, extra = {}) {
  return {
    pollId: poll.id,
    choiceId,
    voter,
    snapshotBlock: poll.snapshotBlock,
    eligible: true,
    receivedAt: '2026-01-01T00:00:00.000Z',
    signedAt: '2026-01-01T00:00:00.000Z',
    ...extra
  };
}

test('normalizePollState(null) yields the canonical starter poll', () => {
  const state = normalizePollState(null);
  assert.equal(state.version, 1);
  assert.equal(state.polls.length, 1);
  const poll = state.polls[0];
  assert.equal(poll.id, STARTER_POLL_ID);
  assert.equal(poll.title, STARTER_POLL_TITLE);
  assert.equal(poll.closes, STARTER_POLL_CLOSES);
  assert.equal(poll.snapshotBlock, SNAPSHOT_BLOCK);
  assert.deepEqual(poll.choices.map(choice => choice.id), [
    'distribute-more-nodes',
    'create-youtube-videos-and-blogs',
    'improve-discord-and-telegram',
    'marketing-materials'
  ]);
});

test('legacy starter poll id and choice ids canonicalize', () => {
  const state = normalizePollState({
    version: 1,
    polls: [{
      id: LEGACY_STARTER_POLL_ID,
      title: 'Which community improvements next?',
      deckTitle: 'Community Allocation',
      type: 'Proposal #1',
      snapshotBlock: SNAPSHOT_BLOCK,
      closes: '2026-06-30T00:00:00Z',
      description: 'Legacy state.',
      choices: [
        { id: 'rural-us-mesh-seed-kits', name: 'Distribute more nodes' },
        { id: 'hackerspaces-and-maker-labs', name: 'Create YouTube videos and blogs' },
        { id: 'global-firmware-testers', name: 'Improve Discord & Telegram' },
        { id: 'university-radio-clubs', name: 'Marketing materials' }
      ]
    }]
  });
  const poll = state.polls[0];
  assert.equal(poll.id, STARTER_POLL_ID);
  assert.equal(poll.title, STARTER_POLL_TITLE);
  assert.equal(poll.closes, STARTER_POLL_CLOSES, 'starter close time is pinned');
  assert.deepEqual(poll.choices.map(choice => choice.id), [
    'distribute-more-nodes',
    'create-youtube-videos-and-blogs',
    'improve-discord-and-telegram',
    'marketing-materials'
  ]);
});

test('a legacy-id poll with a different title is NOT canonicalized', () => {
  const state = normalizePollState({
    version: 1,
    polls: [{
      id: LEGACY_STARTER_POLL_ID,
      title: 'Something else entirely',
      choices: [{ name: 'A' }, { name: 'B' }]
    }]
  });
  assert.equal(state.polls[0].id, LEGACY_STARTER_POLL_ID);
  assert.equal(state.polls[0].title, 'Something else entirely');
});

test('normalizePollState dedupes ids and falls back to defaults when all polls invalid', () => {
  const dupes = normalizePollState({
    version: 1,
    polls: [openPoll(), openPoll({ title: 'Second copy' })]
  });
  assert.equal(dupes.polls.length, 1);

  const invalid = normalizePollState({ version: 1, polls: [{ id: 'x', choices: [] }] });
  assert.equal(invalid.polls[0].id, STARTER_POLL_ID, 'falls back to DEFAULT_POLLS');
});

test('normalizePoll rejects polls with fewer than two usable choices', () => {
  assert.equal(normalizePoll(null), null);
  assert.equal(normalizePoll({ id: 'x', title: 'X', choices: [{ name: 'Only' }] }), null);
  assert.equal(
    normalizePoll({ id: 'x', title: 'X', choices: [{ name: 'A' }, { name: '' }] }),
    null,
    'empty-name choices are dropped before the count check'
  );
});

test('normalizePoll fills defaults: positional id fallback, snapshot fallback, generated choice ids', () => {
  const poll = normalizePoll({
    title: 'My Poll!',
    snapshotBlock: 'garbage',
    choices: [{ name: 'First Choice' }, { name: 'Second Choice' }]
  }, 4);
  assert.equal(poll.id, 'proposal-5', 'id falls back to position, not title (title ids are a client concern)');
  assert.equal(normalizePoll({ ...poll, id: 'My Poll!' }, 0).id, 'my-poll');
  assert.equal(poll.snapshotBlock, SNAPSHOT_BLOCK);
  assert.deepEqual(poll.choices.map(choice => choice.id), ['first-choice', 'second-choice']);
});

test('normalizeCloseTime handles date-only, datetime, and junk', () => {
  assert.equal(normalizeCloseTime('2026-09-01'), '2026-09-01T23:59:00Z');
  assert.equal(normalizeCloseTime('2026-09-01T12:30:00Z'), '2026-09-01T12:30:00Z');
  assert.equal(normalizeCloseTime('not a date'), '');
  assert.equal(normalizeCloseTime(''), '');
});

test('slugify and cleanText basics', () => {
  assert.equal(slugify('  Hello, World!  ', 'fb'), 'hello-world');
  assert.equal(slugify('***', 'fallback-id'), 'fallback-id');
  assert.equal(cleanText('  padded  ', '', 100), 'padded');
  assert.equal(cleanText(null, 'fallback', 100), 'fallback');
  assert.equal(cleanText('x'.repeat(20), '', 5), 'xxxxx');
});

test('isPollClosed respects nowMs and treats missing closes as open', () => {
  const poll = openPoll({ closes: '2026-06-07T23:59:00Z' });
  assert.equal(isPollClosed(poll, Date.parse('2026-06-07T00:00:00Z')), false);
  assert.equal(isPollClosed(poll, Date.parse('2026-06-08T00:00:00Z')), true);
  assert.equal(isPollClosed({ ...poll, closes: '' }, Date.now()), false);
});

test('winnerChoiceId normalizes: starter pinned, valid kept, invalid cleared', () => {
  assert.equal(starterPoll().winnerChoiceId, 'distribute-more-nodes', 'starter winner is pinned');
  assert.equal(openPoll({ winnerChoiceId: 'beta' }).winnerChoiceId, 'beta');
  assert.equal(openPoll({ winnerChoiceId: 'not-a-choice' }).winnerChoiceId, '');
  assert.equal(openPoll().winnerChoiceId, '');
});

test('pollWinnerChoice: stored winner only surfaces on a closed poll', () => {
  const open = openPoll({ winnerChoiceId: 'beta' });
  assert.equal(pollWinnerChoice(open), null, 'open poll never has a winner');

  const closed = openPoll({ winnerChoiceId: 'beta', closes: '2020-01-01T00:00:00Z' });
  assert.equal(pollWinnerChoice(closed).name, 'Beta');

  const closedNoWinner = openPoll({ closes: '2020-01-01T00:00:00Z' });
  assert.equal(pollWinnerChoice(closedNoWinner), null, 'closed poll with no declared winner');

  assert.equal(pollWinnerChoice(starterPoll()).id, 'distribute-more-nodes');
  assert.equal(pollWinnerChoice(null), null);
});

test('findPoll and findChoice', () => {
  const poll = openPoll();
  assert.equal(findPoll([poll], 'test-poll'), poll);
  assert.equal(findPoll([poll], 'missing'), null);
  assert.equal(findChoice(poll, 'beta').name, 'Beta');
  assert.equal(findChoice(poll, 'missing'), null);
  assert.equal(findChoice(null, 'beta'), null);
});

test('validateVoteMessageInput accepts a well-formed message', () => {
  const result = validateVoteMessageInput({
    kind: VOTE_KIND,
    pollId: 'test-poll',
    choiceId: 'alpha',
    tokenContract: TOKEN_ADDRESS.toUpperCase().replace('0X', '0x'),
    strategy: VOTE_STRATEGY,
    nonce: 'abcdef1234567890',
    snapshotBlock: '50000000',
    createdAt: String(Date.now())
  });
  assert.equal(result.ok, true);
  assert.equal(result.snapshotBlock, 50000000);
});

test('validateVoteMessageInput rejections', () => {
  const base = {
    kind: VOTE_KIND,
    pollId: 'test-poll',
    choiceId: 'alpha',
    tokenContract: TOKEN_ADDRESS,
    strategy: VOTE_STRATEGY,
    nonce: 'abcdef1234567890',
    snapshotBlock: '50000000',
    createdAt: String(Date.now())
  };
  assert.equal(validateVoteMessageInput(null).error, 'missing signed message');
  assert.equal(validateVoteMessageInput({ ...base, kind: 'other' }).error, 'wrong vote kind');
  assert.equal(validateVoteMessageInput({ ...base, pollId: 'Bad Slug' }).error, 'invalid poll id');
  assert.equal(validateVoteMessageInput({ ...base, choiceId: '-bad-' }).error, 'invalid choice id');
  assert.equal(
    validateVoteMessageInput({ ...base, tokenContract: '0x' + '1'.repeat(40) }).error,
    'wrong token contract'
  );
  assert.equal(validateVoteMessageInput({ ...base, strategy: 'other' }).error, 'wrong voting strategy');
  assert.equal(validateVoteMessageInput({ ...base, nonce: 'short' }).error, 'invalid nonce');
  assert.equal(validateVoteMessageInput({ ...base, snapshotBlock: '-5' }).error, 'invalid snapshot block');
  assert.equal(
    validateVoteMessageInput({ ...base, createdAt: String(Date.now() + 6 * 60 * 1000) }).error,
    'signature timestamp is too far ahead'
  );
  assert.equal(
    validateVoteMessageInput({ ...base, createdAt: String(Date.now() + 4 * 60 * 1000) }).ok,
    true,
    'less than five minutes ahead is accepted'
  );
});

test('validateVoteAgainstPoll rejections and closed-poll gate', () => {
  const poll = openPoll();
  const choice = poll.choices[0];
  const message = { pollId: poll.id, choiceId: choice.id, snapshotBlock: poll.snapshotBlock };
  assert.equal(validateVoteAgainstPoll(message, null, choice).error, 'unknown poll');
  assert.equal(validateVoteAgainstPoll(message, poll, null).error, 'unknown choice');
  assert.equal(
    validateVoteAgainstPoll({ ...message, snapshotBlock: 1 }, poll, choice).error,
    'snapshot block mismatch'
  );
  const closed = openPoll({ closes: '2020-01-01T00:00:00Z' });
  assert.equal(
    validateVoteAgainstPoll(
      { pollId: closed.id, choiceId: choice.id, snapshotBlock: closed.snapshotBlock },
      closed,
      closed.choices[0]
    ).error,
    'poll is closed'
  );
  assert.equal(validateVoteAgainstPoll(message, poll, choice).ok, true);
});

test('eligibility helpers: threshold, raw parsing, explicit flags', () => {
  assert.equal(eligibilityThresholdRaw(18), ELIGIBILITY_THRESHOLD_TOKENS * 10n ** 18n);
  assert.equal(parseRawBalance('123'), 123n);
  assert.equal(parseRawBalance('-5'), 0n);
  assert.equal(parseRawBalance('junk'), 0n);
  assert.equal(isEligibleBalance((10n ** 18n).toString(), 18), true);
  assert.equal(isEligibleBalance((10n ** 18n - 1n).toString(), 18), false);
  assert.equal(isEligibleVote({ eligible: true }, 18), true, 'explicit flag wins');
  assert.equal(isEligibleVote({ eligible: false, snapshotBalanceRaw: (10n ** 19n).toString() }, 18), false);
  assert.equal(isEligibleVote({ snapshotBalanceRaw: (10n ** 18n).toString() }, 18), true);
});

test('voteStoragePollIds includes the legacy id only for the starter poll', () => {
  assert.deepEqual(voteStoragePollIds(starterPoll()), [STARTER_POLL_ID, LEGACY_STARTER_POLL_ID]);
  assert.deepEqual(voteStoragePollIds(openPoll()), ['test-poll']);
  assert.deepEqual(voteStoragePollIds(null), []);
});

test('canonicalVoteForPoll remaps legacy starter votes and drops mismatches', () => {
  const poll = starterPoll();
  const legacyVote = {
    pollId: LEGACY_STARTER_POLL_ID,
    choiceId: 'rural-us-mesh-seed-kits',
    snapshotBlock: poll.snapshotBlock
  };
  const mapped = canonicalVoteForPoll(legacyVote, poll);
  assert.equal(mapped.pollId, STARTER_POLL_ID);
  assert.equal(mapped.choiceId, 'distribute-more-nodes');

  assert.equal(canonicalVoteForPoll({ ...legacyVote, snapshotBlock: 1 }, poll), null);
  assert.equal(canonicalVoteForPoll({ pollId: 'other', choiceId: 'x', snapshotBlock: poll.snapshotBlock }, poll), null);
});

test('aggregateResults counts one latest eligible vote per voter', () => {
  const poll = openPoll();
  const votes = [
    voteFor(poll, 'alpha', '0xAAA', { receivedAt: '2026-01-01T00:00:00.000Z' }),
    voteFor(poll, 'beta', '0xaaa', { receivedAt: '2026-01-02T00:00:00.000Z' }),
    voteFor(poll, 'alpha', '0xBBB'),
    voteFor(poll, 'alpha', '0xCCC', { eligible: false }),
    voteFor(poll, 'beta', '0xDDD', { pollId: 'other-poll' })
  ];
  const results = aggregateResults(poll, votes);
  assert.equal(results.voterCount, 2, 'revote replaces, ineligible and foreign votes drop');
  const byId = new Map(results.choices.map(choice => [choice.choiceId, choice]));
  assert.equal(byId.get('alpha').voters, 1);
  assert.equal(byId.get('beta').voters, 1, 'case-insensitive voter key; later receivedAt wins');
  assert.equal(byId.get('alpha').percent, 50);
  assert.equal(results.pollId, poll.id);
  assert.equal(results.tokenContract, TOKEN_ADDRESS);
});

test('aggregateResults: a latest vote for an unknown choice is not counted', () => {
  const poll = openPoll();
  const votes = [
    voteFor(poll, 'alpha', '0xAAA', { receivedAt: '2026-01-01T00:00:00.000Z' }),
    voteFor(poll, 'ghost-choice', '0xAAA', { receivedAt: '2026-01-02T00:00:00.000Z' })
  ];
  const results = aggregateResults(poll, votes);
  assert.equal(results.voterCount, 0, 'the voter\'s latest vote names a missing choice');
});

test('aggregateResults freshness tiebreak falls back to signedAt', () => {
  const poll = openPoll();
  const votes = [
    voteFor(poll, 'alpha', '0xAAA', { receivedAt: '2026-01-01T00:00:00.000Z', signedAt: '2026-01-01T00:00:00.000Z' }),
    voteFor(poll, 'beta', '0xAAA', { receivedAt: '2026-01-01T00:00:00.000Z', signedAt: '2026-01-01T00:00:01.000Z' })
  ];
  const results = aggregateResults(poll, votes);
  const byId = new Map(results.choices.map(choice => [choice.choiceId, choice]));
  assert.equal(byId.get('beta').voters, 1);
  assert.equal(byId.get('alpha').voters, 0);
});

test('canonicalVoteMessage and serializableVoteMessage shapes', () => {
  const poll = openPoll();
  const choice = poll.choices[0];
  const message = canonicalVoteMessage({
    poll,
    choice,
    voter: '0x' + '1'.repeat(40),
    nonce: 'abcdef1234567890',
    createdAt: 1750000000000
  });
  assert.equal(message.kind, VOTE_KIND);
  assert.equal(message.strategy, VOTE_STRATEGY);
  assert.equal(typeof message.snapshotBlock, 'bigint');
  assert.equal(typeof message.createdAt, 'bigint');

  const serialized = serializableVoteMessage(message);
  assert.equal(serialized.snapshotBlock, String(poll.snapshotBlock));
  assert.equal(serialized.createdAt, '1750000000000');
  assert.equal(JSON.parse(JSON.stringify(serialized)).pollId, poll.id, 'JSON-safe');
});

test('DEFAULT_POLLS round-trips through normalizePollState unchanged', () => {
  const normalized = normalizePollState({ version: 1, polls: DEFAULT_POLLS });
  assert.deepEqual(
    normalized.polls.map(poll => poll.id),
    DEFAULT_POLLS.map(poll => poll.id)
  );
  assert.deepEqual(
    normalized.polls[0].choices.map(choice => choice.id),
    DEFAULT_POLLS[0].choices.map(choice => choice.id)
  );
});
