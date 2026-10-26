import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { KEY_FILE_READ_MAX, parseHash, parseKeyFile, parseManagementStatus, parseNodeStatus, provisionRsnode,
  renderNode, renderStatus } from '../assets/js/rsnode-provision.js';

// Generated from rsNode's provision-rsnode.py by scripts/rsnode-provision-vectors.py.
const vectors = JSON.parse(readFileSync(new URL('./fixtures/rsnode-provision-vectors.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../download.html', import.meta.url), 'utf8');
const bytes = value => Uint8Array.from(Buffer.from(value, 'hex'));
const hex = value => Buffer.from(value).toString('hex');

function extract(name) {
  const match = new RegExp(`(?:async )?function ${name}\\(|var ${name} = (?!\\{)[^;]*;|var ${name} = `).exec(html);
  assert.ok(match, `missing ${name}`);
  if (match[0].endsWith(';')) return match[0];
  const open = html.indexOf('{', match.index);
  let depth = 0, quote = null, escaped = false, comment = null;
  for (let i = open; i < html.length; i++) {
    const c = html[i], next = html[i + 1];
    if (comment) {
      if (comment === '//' ? c === '\n' : c === '*' && next === '/') { if (comment === '/*') i++; comment = null; }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '/' && (next === '/' || next === '*')) { comment = c + next; i++; }
    else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return html.slice(match.index, i + 1) + (html[i + 1] === ';' ? ';' : '');
  }
  throw new Error('Unterminated ' + name);
}

function pageFunctions(names, context = {}) {
  const source = names.map(extract).join('\n') + `\n({ ${names.filter(name => !/^[A-Z_]+$/.test(name)).join(', ')} })`;
  return vm.runInNewContext(source, Object.assign(context, { Uint8Array, setTimeout, clearTimeout, console }));
}

// The page's own KISS session over a port that answers as the recorded device did.
const { createRnodeSession } = pageFunctions(['KISS', 'RNODE_READ_TIMEOUT_MS', 'kissEscape', 'kissFrame',
  'decodeKissPayload', 'createKissReadPump', 'createRnodeSession']);

function replayPort(transcript) {
  let controller, next = 0;
  const deliver = () => {
    while (next < transcript.length && transcript[next].device) controller.enqueue(bytes(transcript[next++].device));
  };
  return {
    readable: new ReadableStream({ start(value) { controller = value; } }),
    writable: new WritableStream({ write(chunk) {
      assert.ok(next < transcript.length && transcript[next].host, `unexpected write ${hex(chunk)}`);
      assert.equal(hex(chunk), transcript[next].host, `frame ${next}`);
      next++;
      deliver();
    } }),
    remaining: () => transcript.length - next
  };
}

function formOptions(options) {
  const hash = value => value === null ? null : bytes(value);
  return { ...options, managementKey: hash(options.managementKey), owner: hash(options.owner),
    ownerIdentity: hash(options.ownerIdentity), helper: options.helper.map(hash),
    helperIdentity: options.helperIdentity.map(hash), removeOwner: options.removeOwner.map(hash) };
}

async function withRandom(key, callback) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues(target) {
    assert.ok(key, 'no key is generated in this scenario');
    target.set(key);
    return target;
  } } });
  try { return await callback(); } finally { Object.defineProperty(globalThis, 'crypto', original); }
}

for (const scenario of vectors.scenarios) {
  test(`writes the frames provision-rsnode.py writes: ${scenario.name}`, async () => {
    const port = replayPort(scenario.transcript);
    const session = createRnodeSession(port);
    const lines = [], saved = [];
    let result, failure;
    const key = scenario.keyFile ? bytes(scenario.keyFile.text.trim()) : null;
    try {
      result = await withRandom(key, () => provisionRsnode(session, formOptions(scenario.options),
        { log: line => lines.push(line), saveKey: file => saved.push(file) }));
    } catch (error) {
      if (error instanceof assert.AssertionError) throw error;
      failure = error;
    } finally {
      session.pump.stop();
      await session.reader.cancel();
    }
    assert.equal(port.remaining(), 0, 'every recorded frame was exchanged');
    if (scenario.exitCode === 0) {
      assert.equal(failure, undefined);
      assert.deepEqual(result.status, scenario.status.value);
      assert.deepEqual(result.node, scenario.node.value);
    } else {
      assert.equal(failure?.message, scenario.stderr.replace(/^provision-rsnode: /, ''));
    }
    // The page logs the script's output, without the password and key-path lines it never prints.
    assert.deepEqual(lines, scenario.stdout.filter(line => !/^(AP password|management key):/.test(line)));
    assert.deepEqual(saved, scenario.keyFile ? [scenario.keyFile] : []);
  });
}

test('reply payloads read as provision-rsnode.py reads them', () => {
  for (const vector of vectors.replies) {
    const payload = Array.from(bytes(vector.payload));
    const parse = payload[0] === 0x07 ? parseNodeStatus : parseManagementStatus;
    if (vector.error) {
      assert.throws(() => parse(payload), { message: vector.error }, vector.payload);
      continue;
    }
    const value = parse(payload);
    assert.deepEqual(value, vector.value);
    if (vector.lines) assert.deepEqual(renderNode(value), vector.lines);
    else assert.equal(renderStatus(value), vector.line);
  }
});

test('owner hashes and key files are accepted exactly when provision-rsnode.py accepts them', () => {
  for (const vector of vectors.hashes) {
    if (vector.error) assert.throws(() => parseHash(vector.text), undefined, JSON.stringify(vector.text));
    else assert.equal(hex(parseHash(vector.text)), vector.hash, JSON.stringify(vector.text));
  }
  for (const vector of vectors.keyFiles) {
    if (vector.error) assert.throws(() => parseKeyFile(bytes(vector.bytes)), { message: vector.error }, vector.bytes);
    else assert.equal(hex(parseKeyFile(bytes(vector.bytes))), vector.key, vector.bytes);
  }
});

const plain = options => JSON.parse(JSON.stringify(options, (key, value) => value instanceof Uint8Array ? hex(value) : value));

// The managers list as each recorded command line asks: removals are rows read from the node.
function managersPage(argv) {
  const values = flag => argv.flatMap((value, index) => value === flag ? [argv[index + 1]] : []);
  const row = (text, kind, role, removed) => {
    const entry = { hash: hex(parseHash(text)), kind, role };
    return removed ? { ...entry, node: entry, added: false, removed: true } : { ...entry, node: null, added: true, removed: false };
  };
  const field = value => ({ value, setAttribute(name, setting) { this[name] = setting; } });
  const elements = {
    rsnodeOwnerHash: field(''), rsnodeOwnerKind: field('lxmf'), rsnodeOwnerRole: field('admin')
  };
  const context = {
    document: { getElementById: id => elements[id] }, parseHash, bytesToHex: hex,
    rsnodeManagersFrom: { nodeId: 'ABCD', supported: true }, rsnodeManagerEditing: null, rsnodeOwnerSaved: false,
    renderRsnodeManagers: () => {},
    rsnodeManagers: [...values('--remove-owner').map(text => row(text, 'lxmf', 'admin', true)),
      ...values('--owner').map(text => row(text, 'lxmf', 'owner')), ...values('--owner-identity').map(text => row(text, 'identity', 'owner')),
      ...values('--helper').map(text => row(text, 'lxmf', 'admin')), ...values('--helper-identity').map(text => row(text, 'identity', 'admin'))]
  };
  const page = pageFunctions(['RSNODE_MANAGERS_MAX', 'rsnodeActive', 'rsnodeManagersPlan', 'rsnodeManagersWith', 'rsnodeManagerDraft',
    'rsnodeFieldError', 'applyRsnodeManagerEdit', 'rsnodeOwnerOptions'], context);
  return { ...page, context, elements };
}

// The page never changes the management key, so it matches the script's --no-key runs.
test('the managers list gives provision-rsnode.py the options its command line does', async () => {
  for (const scenario of vectors.scenarios.filter(scenario => scenario.options.noKey)) {
    const page = managersPage(scenario.argv);
    // Removals only fit the node the list was read from.
    const expected = scenario.options.removeOwner.length ? { ...scenario.options, nodeId: 'ABCD' } : scenario.options;
    assert.deepEqual(plain(await page.rsnodeOwnerOptions()), expected, scenario.name);
  }
});

test('an entry left in the editor is checked, then saved with the list', async () => {
  const page = managersPage(['--no-key']);
  const { elements } = page;
  page.context.rsnodeManagerEditing = 'new';
  elements.rsnodeOwnerHash.value = 'not-a-hash';
  await assert.rejects(page.rsnodeOwnerOptions(), error => error.field === elements.rsnodeOwnerHash);
  assert.equal(elements.rsnodeOwnerHash['aria-invalid'], 'true');
  elements.rsnodeOwnerHash.value = ' <C0DB' + '11'.repeat(14) + '> ';
  elements.rsnodeOwnerRole.value = 'owner';
  assert.deepEqual(plain(await page.rsnodeOwnerOptions()).owner, 'c0db' + '11'.repeat(14));
  assert.equal(page.context.rsnodeManagerEditing, null);
});

const OWNER = 'aa'.repeat(16), ADMIN = 'bb'.repeat(16), OTHER = 'cc'.repeat(16);
const onNode = (hash, kind, role) => ({ hash, kind, role, node: { hash, kind, role }, added: false, removed: false });

test('one owner per node: a new owner replaces the old one, which stays only by choice', () => {
  const { rsnodeManagersPlan, rsnodeManagersWith, rsnodeOwnerChanges, rsnodeManagersFromNode } = pageFunctions([
    'RSNODE_KINDS', 'RSNODE_ROLES', 'rsnodeCount', 'rsnodeManagersPlan', 'rsnodeManagersWith', 'rsnodeOwnerChanges', 'rsnodeManagersFromNode']);
  const node = [onNode(OWNER, 'lxmf', 'owner'), onNode(ADMIN, 'identity', 'admin')];
  assert.deepEqual(plain(rsnodeManagersPlan(node)).fromNode, false);
  assert.deepEqual(plain(rsnodeOwnerChanges(rsnodeManagersPlan(node))), []);

  // Promoting the admin replaces the owner, as the node itself does.
  const promoted = rsnodeManagersWith(node, { hash: ADMIN, kind: 'identity', role: 'owner' }, node[1]);
  assert.deepEqual(plain(promoted).map(row => [row.role, row.removed]), [['owner', true], ['owner', false]]);
  const plan = plain(rsnodeManagersPlan(promoted));
  assert.deepEqual([plan.ownerIdentity, plan.helper, plan.removeOwner, plan.fromNode], [ADMIN, [], [OWNER], true]);
  assert.deepEqual(plain(rsnodeOwnerChanges(rsnodeManagersPlan(promoted))), ['set the owner', 'remove 1 manager']);
  // Undo keeps the old owner as an admin, enrolled again after the new owner replaced it.
  const kept = plain(rsnodeManagersPlan(promoted.map((row, index) => index ? row : { ...row, removed: false, role: 'admin' })));
  assert.deepEqual([kept.ownerIdentity, kept.helper, kept.removeOwner, kept.changed], [ADMIN, [OWNER], [], 1]);

  // A new hash for a listed manager removes the old one; a removed row is only removed.
  const edited = rsnodeManagersWith(node, { hash: OTHER, kind: 'lxmf', role: 'admin' }, node[1]);
  edited[0] = { ...edited[0], removed: true };
  const replaced = plain(rsnodeManagersPlan(edited));
  assert.deepEqual([replaced.removeOwner, replaced.helper, replaced.owner, replaced.removed, replaced.added], [[OWNER, ADMIN], [OTHER], null, 2, 1]);

  // A read keeps rows added here; an owner added here replaces the node's own, as saving would.
  const read = plain(rsnodeManagersFromNode({ destination: OWNER, nearbyOnly: false, owners: [{ kind: 1, role: 1, hash: OWNER }] },
    [{ hash: OTHER, kind: 'identity', role: 'owner', node: null, added: true, removed: false }, onNode(ADMIN, 'lxmf', 'admin')]));
  assert.deepEqual(read, [
    { node: { hash: OWNER, kind: 'lxmf', role: 'owner' }, added: false, removed: true, hash: OWNER, kind: 'lxmf', role: 'owner' },
    { node: null, added: true, removed: false, hash: OTHER, kind: 'identity', role: 'owner' }]);
  assert.deepEqual(plain(rsnodeManagersFromNode(null, [])), []);
});

test('the editor rejects a repeated manager and a fifth one', () => {
  const page = managersPage(['--no-key']);
  const { elements, context } = page;
  context.rsnodeManagers = [onNode(OWNER, 'lxmf', 'owner'), onNode(ADMIN, 'lxmf', 'admin'), { ...onNode(OTHER, 'lxmf', 'admin'), removed: true }];
  context.rsnodeManagerEditing = 'new';
  for (const [hash, message] of [[OTHER, 'This manager is already in the list.'], ['12'.repeat(16), null]]) {
    elements.rsnodeOwnerHash.value = hash;
    if (message) assert.throws(() => page.applyRsnodeManagerEdit(), { message });
    else assert.equal(page.applyRsnodeManagerEdit(), 3);
    context.rsnodeManagerEditing = 'new';
  }
  context.rsnodeManagers.push(onNode('34'.repeat(16), 'lxmf', 'admin'));
  elements.rsnodeOwnerHash.value = '56'.repeat(16);
  assert.throws(() => page.applyRsnodeManagerEdit(), { message: 'A node holds up to 4 managers.' });
  // Editing keeps the count and may keep the hash.
  context.rsnodeManagerEditing = context.rsnodeManagers[1];
  elements.rsnodeOwnerHash.value = ADMIN;
  elements.rsnodeOwnerRole.value = 'owner';
  assert.equal(page.applyRsnodeManagerEdit(), 1);
  assert.deepEqual(plain(context.rsnodeManagers).map(row => [row.role, row.removed]),
    [['owner', true], ['owner', false], ['admin', true], ['admin', false], ['admin', false]]);
});

test('a save meant for one node stops on another before changing anything', async () => {
  const scenario = vectors.scenarios.find(s => s.name === 'remove a helper');
  const read = scenario.transcript.findIndex(frame => frame.host === 'c06f05c0');
  const transcript = [...scenario.transcript.slice(0, read + 2), { host: 'c00affc0' }];
  const port = replayPort(transcript);
  const session = createRnodeSession(port);
  try {
    await assert.rejects(provisionRsnode(session, { ...formOptions(scenario.options), nodeId: 'FFFF' }),
      { message: `this is RNode ${scenario.status.value.nodeId}, not RNode FFFF` });
  } finally {
    session.pump.stop();
    await session.reader.cancel();
  }
  assert.equal(port.remaining(), 0);
});

test('owner work checks its input before asking for a port and always closes the session', async () => {
  const calls = [];
  const options = { owner: new Uint8Array(16) };
  const invalid = Object.assign(new Error('A hash is 32 hexadecimal characters'), { field: { focus: () => calls.push(['focus']) } });
  const context = {
    state: { flashing: false }, navigator: { serial: {} }, rsnodeOwnerBusy: false, RNODE_REPAIR_SETTLE_MS: 0,
    document: { getElementById: () => ({}) },
    setRsnodeOwnerBusy: busy => { context.rsnodeOwnerBusy = busy; calls.push(['busy', busy]); },
    rsnodeOwnerMessage: (message, error) => { if (message) calls.push(['message', !!error]); },
    rsnodeOwnerOptions: async () => { throw invalid; },
    rsnodeToolPortFromUser: async () => calls.push(['port']),
    rsnodeOtherPorts: async () => [],
    openProgressLog: () => ({ log: () => {}, setProgress: () => {}, setStatus: () => {} }),
    openRnodeSerialPort: async () => 'port',
    createRnodeSession: port => ({ port }),
    provisionRsnode: async (session, given) => { calls.push(['provision', session.port, given === options]); return { status: { nodeId: 'ABCD' } }; },
    showRsnodeOwnerResult: () => calls.push(['result']),
    closeRnodeSession: async session => calls.push(['close', session && session.port])
  };
  const run = pageFunctions(['RSNODE_CLI_WORDS', 'rsnodePortError', 'rsnodeOwnerError', 'runRsnodeOwnerTask'], context).runRsnodeOwnerTask;
  await run(false);
  assert.deepEqual(calls, [['busy', true], ['message', true], ['close', null], ['busy', false], ['focus']]);

  calls.length = 0;
  context.rsnodeOwnerOptions = async () => options;
  await run(false);
  assert.deepEqual(calls, [['busy', true], ['port'], ['provision', 'port', true], ['result'], ['message', false],
    ['close', 'port'], ['busy', false]]);

  calls.length = 0;
  context.provisionRsnode = async () => { throw new Error('device rejected the primary owner: error 0x01'); };
  await run(false);
  assert.deepEqual(calls, [['busy', true], ['port'], ['message', true], ['close', 'port'], ['busy', false]]);
});

test('the owner row says what a save changes and what to do after a failure, in its own words', () => {
  const state = { flashing: false };
  const { rsnodeOwnerSummary, rsnodeOwnerError } = pageFunctions(['RSNODE_CLI_WORDS', 'rsnodeOwnerSummary', 'rsnodePortError',
    'rsnodeOwnerError'], { state });
  assert.equal(rsnodeOwnerSummary([]), 'Nothing to save yet. Add a manager.');
  assert.equal(rsnodeOwnerSummary(['set the owner']), 'Saving will set the owner.');
  assert.equal(rsnodeOwnerSummary(['set the owner', 'add 2 admins', 'remove 1 manager']),
    'Saving will set the owner, add 2 admins and remove 1 manager.');
  state.flashing = true;
  assert.equal(rsnodeOwnerSummary(['set the owner']), 'Available when flashing finishes.');

  const failure = scenario => new Error(vectors.scenarios.find(s => s.name === scenario).stderr.replace(/^provision-rsnode: /, ''));
  const READ_BACK = 'Read from node to see what it has now.';
  assert.deepEqual(plain(rsnodeOwnerError(failure('enrollment without entropy'), 'protocol', false)), {
    text: 'The node rejected the owner: error 0x01 (no entropy source: start Bluetooth or Wi-Fi and retry)', hint: READ_BACK });
  assert.deepEqual(plain(rsnodeOwnerError(failure('enroll a helper into a full owner table'), 'protocol', false)), {
    text: 'The node rejected an admin: error 0x07 (the manager list is full, or this firmware predates managers)',
    hint: 'A node holds up to 4 managers. ' + READ_BACK });
  assert.deepEqual(plain(rsnodeOwnerError(failure('remove an owner that is not enrolled'), 'protocol', false)), {
    text: 'The node rejected a removal: error 0x07 (no such manager, or this firmware predates managers)', hint: READ_BACK });
  assert.deepEqual(plain(rsnodeOwnerError(new Error('this firmware predates owners'), 'protocol', false)),
    { text: 'This firmware predates managers', hint: READ_BACK });
  assert.deepEqual(plain(rsnodeOwnerError(failure('enrollment without entropy'), 'protocol', true)),
    { text: 'The node rejected the owner: error 0x01 (no entropy source: start Bluetooth or Wi-Fi and retry)' });
  assert.deepEqual(plain(rsnodeOwnerError(new Error('timed out waiting for the device to answer the primary owner'), 'protocol', false)),
    { text: 'Timed out waiting for the node to answer the owner', hint: READ_BACK });
  assert.deepEqual(plain(rsnodeOwnerError(new Error('no KISS response within 30 s: EXIT Repeater if active'), 'protocol', false)),
    { text: 'No KISS response within 30 s: EXIT Repeater if active' });
  assert.deepEqual(plain(rsnodeOwnerError(new Error('Failed to open serial port.'), 'open', false)),
    { text: 'Could not open the serial port. Close other apps that use it, such as Ratspeak or a serial monitor, then try again.' });
  assert.deepEqual(plain(rsnodeOwnerError(Object.assign(new Error('The device has been lost.'), { name: 'NetworkError' }), 'protocol', false)),
    { text: 'The node disconnected from USB.' });
});

test('the Step 03 hint names the first rsNode step still open', () => {
  const context = { betaStage: 'locked', state: {}, rsnodeBoardSelect: { value: '' }, rsnodeVariantIsConfirmed: () => false };
  const { rsnodeFlowNote } = pageFunctions(['rsnodeFlowNote'], context);
  const notes = [];
  for (const step of [{}, { betaStage: 'terms' }, { betaStage: 'ready' }, { rsnodeBoardSelect: { value: 'heltec-v4' }, state: { rsnodeLoading: true } },
    { state: { rsnodeLoadFailed: true } }, { state: {} }, { rsnodeVariantIsConfirmed: () => true }]) {
    Object.assign(context, step);
    notes.push(rsnodeFlowNote());
  }
  assert.deepEqual(notes, ['Unlock the rsNode beta to continue.', 'Accept the beta terms to continue.',
    'Choose your board to flash. To manage a node that already runs rsNode, use the tools below.',
    'Loading the firmware for your board…', 'Firmware could not be loaded. Choose the board again to retry.',
    'Confirm the V4 variant to continue.', 'Select a USB device to continue.']);
});

test('the owner step appears only with beta access, before and after an rsNode install', () => {
  const panel = { hidden: true, open: false }, notice = { hidden: true };
  const context = { state: { device: 'custom', rsnodeInstalled: false }, betaStage: 'locked',
    isRsnodeSelected: () => true, document: { getElementById: id => id === 'rsnodeOwner' ? panel : notice } };
  const { updateRsnodeOwnerVisibility, showRsnodeOwnerStep } = pageFunctions(['rsnodeToolsUnlocked',
    'updateRsnodeOwnerVisibility', 'showRsnodeOwnerStep'], context);
  updateRsnodeOwnerVisibility();
  assert.equal(panel.hidden, true);
  context.betaStage = 'ready';
  updateRsnodeOwnerVisibility();
  assert.equal(panel.hidden, false);
  // An uploaded rsNode package gets the owner step, but only while the beta is unlocked.
  Object.assign(context, { betaStage: 'locked', isRsnodeSelected: () => false });
  showRsnodeOwnerStep();
  assert.deepEqual([context.state.rsnodeInstalled, panel.hidden], [true, true]);
  context.betaStage = 'ready';
  showRsnodeOwnerStep();
  assert.deepEqual([panel.hidden, panel.open, notice.hidden], [false, true, false]);
  context.state.device = 'tdeck';
  updateRsnodeOwnerVisibility();
  assert.equal(panel.hidden, true);

  const start = html.indexOf('window.startFlash = async function()');
  const flash = html.slice(start, html.indexOf('function isRnodeReconnectSetupIssue', start));
  assert.match(flash, /state\.flashing \|\| rsnodeOwnerBusy\) return;/);
  assert.ok(flash.indexOf("if (prepared && prepared.product === 'rsnode') showRsnodeOwnerStep();") > flash.indexOf('await esploader.writeFlash('));
});

test('the device management row says owner and admin, as the docs define them', () => {
  const panel = /id="rsnodeOwner"[\s\S]*?id="flashRepair"/.exec(html);
  assert.ok(panel, 'missing device management panel');
  assert.doesNotMatch(panel[0].replace(/<[^>]+>/g, ' '), /helper|primary/i);
});
