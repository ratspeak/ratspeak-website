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

// The owner form, filled in as each recorded command line asks.
function ownerForm(argv, keyText) {
  const values = flag => argv.flatMap((value, index) => value === flag ? [argv[index + 1]] : []);
  const field = value => ({ value, setAttribute(name, setting) { this[name] = setting; }, closest: () => null });
  const identity = values('--owner-identity')[0];
  const elements = {
    rsnodeOwnerKind: { value: identity ? 'identity' : 'lxmf' },
    rsnodeOwnerHash: field(identity || values('--owner')[0] || ''),
    rsnodeKeyMode: { value: argv.includes('--no-key') ? 'keep' : argv.includes('--clear-key') ? 'clear'
      : argv.includes('--management-key') ? 'file' : 'generate' },
    rsnodeKeyFile: { ...field(''), files: keyText ? [new Blob([keyText])] : [] },
    rsnodeHelpers: field(values('--helper').join('\n')),
    rsnodeHelperIdentities: field(values('--helper-identity').join('\n')),
    rsnodeRemoveOwners: field(values('--remove-owner').join('\n\n'))
  };
  for (const [id, element] of Object.entries(elements)) element.id = id;
  return { getElementById: id => elements[id], elements };
}

const plain = options => JSON.parse(JSON.stringify(options, (key, value) => value instanceof Uint8Array ? hex(value) : value));

test('the owner form gives provision-rsnode.py the options its command line does', async () => {
  for (const scenario of vectors.scenarios.filter(scenario => !scenario.options.read)) {
    const document = ownerForm(scenario.argv, scenario.options.managementKey && scenario.options.managementKey + '\n');
    const { rsnodeOwnerOptions } = pageFunctions(['RSNODE_OWNER_LISTS', 'rsnodeOwnerLines', 'rsnodeFieldError',
      'rsnodeHashes', 'rsnodeOwnerOptions'], { document, parseHash, parseKeyFile, KEY_FILE_READ_MAX });
    assert.deepEqual(plain(await rsnodeOwnerOptions()), scenario.options, scenario.name);
  }
  const document = ownerForm(['--no-key', '--owner', 'not-a-hash']);
  const { rsnodeOwnerOptions } = pageFunctions(['RSNODE_OWNER_LISTS', 'rsnodeOwnerLines', 'rsnodeFieldError',
    'rsnodeHashes', 'rsnodeOwnerOptions'], { document, parseHash, parseKeyFile, KEY_FILE_READ_MAX });
  await assert.rejects(rsnodeOwnerOptions(), error => error.field === document.elements.rsnodeOwnerHash);
  assert.equal(document.elements.rsnodeOwnerHash['aria-invalid'], 'true');
});

test('owner work checks its input before asking for a port and always closes the session', async () => {
  const calls = [];
  const options = { owner: new Uint8Array(16) };
  const invalid = Object.assign(new Error('A hash is 32 hexadecimal characters'), { field: { focus: () => calls.push(['focus']) } });
  const context = {
    state: { flashing: false }, navigator: { serial: {} }, rsnodeOwnerBusy: false, RNODE_REPAIR_SETTLE_MS: 0,
    document: { getElementById: () => ({}) }, saveRsnodeKey: () => {},
    setRsnodeOwnerBusy: busy => { context.rsnodeOwnerBusy = busy; calls.push(['busy', busy]); },
    rsnodeOwnerMessage: (message, error) => { if (message) calls.push(['message', !!error]); },
    rsnodeOwnerOptions: async () => { throw invalid; },
    requestFreshRnodePortFromUser: async () => calls.push(['port']),
    openProgressLog: () => ({ log: () => {}, setProgress: () => {}, setStatus: () => {} }),
    openRnodeSerialPort: async () => 'port',
    createRnodeSession: port => ({ port }),
    provisionRsnode: async (session, given) => { calls.push(['provision', session.port, given === options]); return {}; },
    showRsnodeOwnerResult: () => calls.push(['result']),
    closeRnodeSession: async session => calls.push(['close', session && session.port])
  };
  const run = pageFunctions(['runRsnodeOwnerTask'], context).runRsnodeOwnerTask;
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

test('the owner step appears only with beta access, before and after an rsNode install', () => {
  const panel = { hidden: true, open: false }, notice = { hidden: true };
  const context = { state: { device: 'custom', rsnodeInstalled: false }, betaStage: 'locked',
    isRsnodeSelected: () => true, document: { getElementById: id => id === 'rsnodeOwner' ? panel : notice } };
  const { updateRsnodeOwnerVisibility, showRsnodeOwnerStep } = pageFunctions(['updateRsnodeOwnerVisibility', 'showRsnodeOwnerStep'], context);
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

test('the owner panel uses the ownership guide wording', () => {
  const panel = /id="rsnodeOwner"[\s\S]*?id="flashRepair"/.exec(html);
  assert.ok(panel, 'missing owner panel');
  const text = panel[0].replace(/<[^>]+>/g, '').replace(/&middot;/g, '·').replace(/\s+/g, ' ');
  for (const sentence of vectors.guide) assert.ok(text.includes(sentence), sentence);
});
