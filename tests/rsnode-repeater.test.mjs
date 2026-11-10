import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { HOST_OWNERS, RSNODE_RESULT, rsnodeLights, rsnodeScreenless } from '../assets/js/rsnode-device.js';
import { addRsnodeOwner, parseNodeStatus } from '../assets/js/rsnode-provision.js';
import { LIMITS, REPEATER_PRESETS, REPEATER_REGIONS, SETUP, checkRepeaterForm, controlRepeater, parseRsnodeIdentity,
  readRsnodeIdentity, repeaterOwner, repeaterRadioLine, repeaterRegions, repeaterSettingsForm, repeaterSetupEntries,
  repeaterSavedMessage, repeaterSetupOutcome, repeaterSetupRefusal, repeaterSummary, writeRepeaterSetup } from '../assets/js/rsnode-repeater.js';
import { WIFI_MODES, checkSettingsForm, decodeSettings, encodeEntries, settingsChanges } from '../assets/js/rsnode-settings.js';
import { nodeContactCard, parseContactCard } from '../assets/js/rsnode-card.js';
import { rsnodeBoard, rsnodeBoardForTarget } from '../assets/js/rsnode-beta.js';
import { flasherPage } from './flasher-page.mjs';

const html = flasherPage('flash.html');
const vectors = JSON.parse(readFileSync(new URL('./fixtures/rsnode-card-vectors.json', import.meta.url), 'utf8'));
const [alice, node] = vectors.identities;
const bytes = value => Array.from(Buffer.from(value, 'hex'));
const hex = value => Buffer.from(value).toString('hex');
const utf8 = text => Array.from(Buffer.from(text));
const entriesHex = entries => hex(encodeEntries(entries));

// rsNode is private: the catalog is checked against its source where a checkout sits beside this one.
const CATALOG = new URL('../../rsNode/crates/rsnode-core/src/repeater_catalog.rs', import.meta.url);

test('the catalog is rsNode\'s repeater_catalog, in its order', { skip: !existsSync(CATALOG) && 'no rsNode checkout' }, () => {
  const source = readFileSync(CATALOG, 'utf8');
  const regions = [...source.matchAll(/Region \{\s+id: (\d+),\s+key: "(\w+)",[\s\S]*?min_hz: ([\d_]+),[\s\S]*?frequency_hz: ([\d_]+),/g)]
    .map(match => ({ id: Number(match[1]), key: match[2], frequency: Number(match[4].replace(/_/g, '')),
      highBand: Number(match[3].replace(/_/g, '')) >= 800000000 }));
  assert.deepEqual(REPEATER_REGIONS.map(({ id, key, frequency, highBand }) => ({ id, key, frequency, highBand })), regions);
  const presets = [...source.matchAll(/Preset \{\s+key: "(\w+)",\s+label: "[^"]+",\s+spreading_factor: (\d+),\s+bandwidth_hz: ([\d_]+),\s+coding_rate: (\d+),/g)]
    .map(match => ({ key: match[1], spreadingFactor: Number(match[2]), bandwidth: Number(match[3].replace(/_/g, '')), codingRate: Number(match[4]) }));
  assert.deepEqual(REPEATER_PRESETS.map(({ key, spreadingFactor, bandwidth, codingRate }) => ({ key, spreadingFactor, bandwidth, codingRate })), presets);
});

test('a V4 offers no 433 MHz region, and the radio line follows the preset', () => {
  assert.deepEqual(repeaterRegions(rsnodeBoard('heltec-v4-r8')).map(region => region.id), [1, 2, 4, 5]);
  assert.deepEqual(repeaterRegions(rsnodeBoard('heltec-v3')).map(region => region.id), [1, 2, 3, 4, 5]);
  assert.deepEqual(repeaterRegions(null).map(region => region.id), [1, 2, 3, 4, 5]);
  // Only the V4s lose 433 MHz to their amplifier: every other board, by id or by update target, gets the whole list.
  for (const id of ['heltec-t114', 't-echo', 'thinknode-m1', 'rak4631', 'heltec-wsl-v3']) {
    assert.deepEqual(repeaterRegions(rsnodeBoard(id)).map(region => region.id), [1, 2, 3, 4, 5], id);
  }
  for (const target of [0xc4, 0x51, 0xba]) assert.equal(repeaterRegions(rsnodeBoardForTarget(target)).length, 5, target.toString(16));
  for (const id of ['heltec-v4', 'heltec-v4-r8', 'heltec-v4-r8-tft']) assert.equal(repeaterRegions(rsnodeBoard(id)).length, 4, id);
  assert.equal(repeaterRadioLine(2, 7), '868.000 MHz · 125 kHz · SF11 · CR 4/8');
  assert.equal(repeaterRadioLine(null, 0), '');
});

test('REPEATER_SETUP entries are region, preset, LIMITS, acceptance, then start', () => {
  assert.deepEqual(SETUP, { region: 1, preset: 2, frequency: 3, bandwidth: 4, spreadingFactor: 5, codingRate: 6, txPower: 7,
    limits: 8, accepted: 9, start: 10 });
  assert.deepEqual(LIMITS, { default: 0, custom: 1, off: 2 });
  const setup = (limits, extra = {}) => entriesHex(repeaterSetupEntries({ region: 2, preset: 0, limits, accepted: true, start: true, ...extra }));
  assert.equal(setup({ mode: 'off' }), '010102' + '020100' + '080102' + '090101' + '0a0101');
  assert.equal(setup({ mode: 'default' }, { accepted: false, start: false, preset: 7 }), '010102' + '020107' + '080100' + '0a0100');
  assert.equal(setup({ mode: 'custom', txPower: 14, dutyCycle: true }), '010102' + '020100' + '0803010e01' + '090101' + '0a0101');
  assert.equal(setup({ mode: 'custom', txPower: -3, dutyCycle: false }).slice(12, 22), '080301fd00');
  assert.throws(() => repeaterSetupEntries({ region: 9, preset: 0, limits: { mode: 'off' } }), /region/);
  assert.throws(() => repeaterSetupEntries({ region: 1, preset: 8, limits: { mode: 'off' } }), /preset/);
  assert.throws(() => repeaterSetupEntries({ region: 1, preset: 0, limits: { mode: 'custom', txPower: 40 } }), /power/);
});

test('a setup reply says restart, saved, or why: the entry and settings reason name the field', () => {
  const ok = body => ({ result: RSNODE_RESULT.ok, body });
  assert.deepEqual(repeaterSetupOutcome(ok([0x01, 0xf4])), { kind: 'restart', restartMs: 500 });
  assert.deepEqual(repeaterSetupOutcome(ok([])), { kind: 'done' });
  assert.equal(repeaterSetupOutcome(ok([1])).kind, 'uncertain');
  const invalid = body => repeaterSetupOutcome({ result: RSNODE_RESULT.invalid, body });
  assert.deepEqual(invalid([0x01, 4]), { kind: 'invalid', field: 'region', message: 'The node refused this region.' });
  assert.deepEqual(invalid([0x02, 6]), { kind: 'invalid', field: 'preset', message: 'This board cannot use this region and preset.' });
  assert.deepEqual(invalid([0x09, 4]), { kind: 'invalid', field: 'accepted', message: 'Accept the local rules notice to use these LIMITS.' });
  assert.deepEqual(invalid([0x08, 4]), { kind: 'invalid', field: 'limits', message: 'The node refused these LIMITS.' });
  assert.deepEqual(invalid([0x0a, 8]), { kind: 'invalid', field: null,
    message: 'The node could not start the Repeater with these settings. Try DEFAULT LIMITS or another preset.' });
  assert.equal(invalid([0x00, 8]).message, invalid([0x0a, 8]).message);
  assert.deepEqual(invalid([0x03, 7]), { kind: 'invalid', field: null, message: 'Confirm this change on the device.' });
  assert.match(invalid([0x0b, 2]).message, /cannot set up a Repeater over USB/);
  assert.deepEqual(repeaterSetupRefusal([]), { field: null, message: 'The node could not read the request. Nothing changed.' });
  for (const [result, kind] of [['refused', 'refused'], ['busy', 'busy'], ['storage', 'storage'], ['unsupported', 'unsupported'],
    ['unavailable', 'unsupported']]) assert.equal(repeaterSetupOutcome({ result: RSNODE_RESULT[result], body: [] }).kind, kind, result);
  assert.deepEqual(repeaterSetupOutcome(null), { kind: 'unsupported' });
  assert.deepEqual(repeaterSetupOutcome({ result: RSNODE_RESULT.denied, body: [] }), { kind: 'failed', result: 1 });
});

// The node's IDENTITY body, from a vector rns-identity computed.
const identityBody = (entry, name = entry.name) => [1, ...bytes(entry.publicKey), ...bytes(entry.lxmf), ...bytes(entry.identity),
  ...bytes(entry.manage), utf8(name).length, ...utf8(name)];

test('IDENTITY reads the node\'s key and hashes, checked against the key, and builds its RSCP2 card', async () => {
  const identity = await parseRsnodeIdentity(identityBody(node));
  assert.deepEqual({ ...identity, publicKey: hex(identity.publicKey) },
    { present: true, publicKey: node.publicKey, lxmf: node.lxmf, identity: node.identity, manage: node.manage, name: node.name });
  assert.deepEqual(await parseRsnodeIdentity([0]), { present: false });
  const card = await parseContactCard(nodeContactCard(identity));
  assert.deepEqual([card.kind, card.lxmf, card.caps], ['device', node.lxmf, ['rsnode', 'rsnode.update']]);
  const swap = (offset, value) => { const body = identityBody(node); body.splice(offset, 16, ...bytes(value)); return body; };
  await assert.rejects(parseRsnodeIdentity(swap(65, alice.lxmf)), /LXMF address does not match/);
  await assert.rejects(parseRsnodeIdentity(swap(81, alice.identity)), /identity hash does not match/);
  await assert.rejects(parseRsnodeIdentity(swap(97, alice.manage)), /management destination does not match/);
  await assert.rejects(parseRsnodeIdentity(identityBody(node).slice(0, -1)), /name/);
  await assert.rejects(parseRsnodeIdentity([1, 2, 3]), /malformed/);
  await assert.rejects(parseRsnodeIdentity([...identityBody(node, ''), 0xff].map((b, i, all) => i === all.length - 2 ? 1 : b)), /name/);
});

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

const { createRnodeSession, closeRnodeSession } = pageFunctions(['KISS', 'RNODE_READ_TIMEOUT_MS', 'kissEscape', 'kissFrame',
  'decodeKissPayload', 'createKissReadPump', 'createRnodeSession', 'closeRnodeSession']);

// A node answering each write with the next KISS frame, escaped as rsNode sends it.
function nodePort(answers) {
  let controller;
  const written = [];
  const escape = payload => payload.flatMap(byte => byte === 0xc0 ? [0xdb, 0xdc] : byte === 0xdb ? [0xdb, 0xdd] : [byte]);
  return {
    written,
    readable: new ReadableStream({ start(value) { controller = value; } }),
    writable: new WritableStream({ write(chunk) {
      written.push(hex(chunk));
      const answer = answers.shift();
      if (answer) controller.enqueue(answer === 'error' ? Uint8Array.from([0xc0, 0x90, 0x07, 0xc0]) : Uint8Array.from([0xc0, ...escape(answer), 0xc0]));
    } })
  };
}

test('IDENTITY, REPEATER_SETUP and REPEATER_CONTROL travel as CMD_RSNODE sub 0x04, 0x05 and 0x06 frames', async () => {
  const port = nodePort([[0x7a, 0x04, 0x00, ...identityBody(node)], [0x7a, 0x05, 0x00, 0x01, 0xf4], [0x7a, 0x05, 0x02, 0x09, 0x04],
    [0x7a, 0x06, 0x00, 0x00, 0xfa], [0x7a, 0x06, 0x00], 'error', 'error']);
  const session = createRnodeSession(port);
  try {
    assert.equal((await readRsnodeIdentity(session)).lxmf, node.lxmf);
    const entries = repeaterSetupEntries({ region: 1, preset: 0, limits: { mode: 'off' }, accepted: true, start: true });
    assert.deepEqual(await writeRepeaterSetup(session, entries), { kind: 'restart', restartMs: 500 });
    assert.equal((await writeRepeaterSetup(session, entries)).field, 'accepted');
    assert.deepEqual(await controlRepeater(session, 'start'), { kind: 'restart', restartMs: 250 });
    assert.deepEqual(await controlRepeater(session, 'stop'), { kind: 'done' });
    // Firmware without the subcommands answers CMD_ERROR.
    assert.equal(await readRsnodeIdentity(session), null);
    assert.deepEqual(await controlRepeater(session, 'exit'), { kind: 'unsupported' });
    await assert.rejects(controlRepeater(session, 'reboot'), /unknown/);
  } finally {
    await closeRnodeSession(session);
  }
  assert.deepEqual(port.written, ['c07a04c0', 'c07a05' + '010101020100080102090101' + '0a0101c0', 'c07a05010101020100080102090101' + '0a0101c0',
    'c07a0601c0', 'c07a0602c0', 'c07a04c0', 'c07a0603c0']);
});

test('ADD_OWNER sends kind 3 with the key a card gave, and kind 1 for a typed address', async () => {
  const owner = [0x03, 0x01, ...bytes(alice.lxmf)];
  const reply = [0x6f, 0x07, 0x01, ...bytes(node.manage), 0x00, 0x01, ...owner];
  const port = nodePort([reply, [0x6f, 0x07, 0x01, ...bytes(node.manage), 0x00, 0x01, 0x01, 0x01, ...bytes(alice.lxmf)]]);
  const session = createRnodeSession(port);
  try {
    const node3 = await addRsnodeOwner(session, Uint8Array.from(bytes(alice.lxmf)), Uint8Array.from(bytes(alice.publicKey)));
    assert.deepEqual(node3.owners, [{ kind: 3, role: 1, hash: alice.lxmf }]);
    await addRsnodeOwner(session, Uint8Array.from(bytes(alice.lxmf)));
    assert.throws(() => addRsnodeOwner(session, Uint8Array.from(bytes(alice.lxmf)), new Uint8Array(32)), /64 bytes/);
  } finally {
    await closeRnodeSession(session);
  }
  const key = bytes(alice.publicKey).flatMap(byte => byte === 0xc0 ? [0xdb, 0xdc] : byte === 0xdb ? [0xdb, 0xdd] : [byte]);
  assert.equal(port.written[0], 'c06f0803' + '01' + alice.lxmf + hex(key) + 'c0');
  assert.equal(port.written[1], 'c06f0801' + '01' + alice.lxmf + 'c0');
  assert.deepEqual(parseNodeStatus(reply.slice(1)).owners[0].kind, 3);
});

const baseForm = (changes = {}) => ({ region: 2, preset: 0, limits: { mode: 'off', txPower: NaN, dutyCycle: true }, accepted: true,
  owner: alice.lxmf, card: null, remote: false, wifiName: '', wifiPassword: '', uplinkHost: '', uplinkPort: '4242', ...changes });

test('the panel checks region, LIMITS, acceptance, Owner, and Wi-Fi before asking for a port', async () => {
  assert.equal(checkRepeaterForm(baseForm()), null);
  assert.equal(checkRepeaterForm(baseForm({ region: null })).field, 'region');
  assert.equal(checkRepeaterForm(baseForm({ limits: { mode: 'custom', txPower: NaN } })).field, 'limitsPower');
  assert.equal(checkRepeaterForm(baseForm({ limits: { mode: 'custom', txPower: 14, dutyCycle: true } })), null);
  assert.deepEqual(checkRepeaterForm(baseForm({ accepted: false })),
    { field: 'accepted', message: 'Accept the local rules notice to start the Repeater.' });
  assert.equal(checkRepeaterForm(baseForm({ owner: ' ' })).message, 'Paste your Ratspeak LXMF address, or scan your contact card.');
  assert.equal(checkRepeaterForm(baseForm({ owner: 'abc' })).message, 'An LXMF address is 32 hexadecimal characters. Copy yours from Ratspeak.');
  assert.equal(checkRepeaterForm(baseForm({ owner: `<${alice.lxmf}>` })), null);
  const card = await parseContactCard(alice.rscp1);
  assert.equal(checkRepeaterForm(baseForm({ owner: '', card })), null);
  assert.deepEqual(repeaterOwner(baseForm({ owner: '', card })), { address: Uint8Array.from(bytes(alice.lxmf)), publicKey: card.publicKey });
  assert.equal(repeaterOwner(baseForm()).publicKey, null);
  assert.equal(checkRepeaterForm(baseForm({ remote: true, wifiName: '' })).field, 'name');
  assert.equal(checkRepeaterForm(baseForm({ remote: true, wifiName: 'Home', wifiPassword: 'short' })).field, 'password');
  assert.equal(checkRepeaterForm(baseForm({ remote: true, wifiName: 'Home', uplinkHost: '' })).field, 'uplinkHost');
  assert.equal(checkRepeaterForm(baseForm({ remote: true, wifiName: 'Home', uplinkHost: 'rns.example.org', uplinkPort: '0' })).field, 'uplinkPort');
  assert.equal(checkRepeaterForm(baseForm({ remote: true, wifiName: 'Home', uplinkHost: 'rns.example.org' })), null);
  assert.equal(repeaterSummary(baseForm()), 'Saves Europe 868 with Medium Fast, LIMITS Off.');
  assert.equal(repeaterSummary(baseForm({ region: null })), 'Choose a region to finish setup.');
});

const entry = (id, value) => [id, value.length, ...value];
const FRESH = decodeSettings([...entry(0x01, [0]), ...entry(0x21, [0x10, 0x92]), ...entry(0x28, [0]), ...entry(0x2a, [0, 0])]);
const JOINED = decodeSettings([...entry(0x01, [1]), ...entry(0x03, utf8('Home')), ...entry(0x04, [1]), ...entry(0x21, [0x10, 0x92]),
  ...entry(0x28, [0]), ...entry(0x2a, [0, 0])]);

test('reach it from anywhere joins the network and turns the uplink on, with the settings codec', () => {
  const remote = baseForm({ remote: true, wifiName: 'Home', wifiPassword: 'correct-horse', uplinkHost: ' rns.example.org ', uplinkPort: '4965' });
  const form = repeaterSettingsForm(remote, FRESH);
  assert.equal(checkSettingsForm(form, FRESH, true), null);
  assert.equal(entriesHex(settingsChanges(form, FRESH, true)), '010101' + '0304' + hex(utf8('Home')) + '040d' + hex(utf8('correct-horse')) +
    '280101' + '290f' + hex(utf8('rns.example.org')) + '2a021365');
  // The same network with no password typed keeps the stored one.
  const kept = repeaterSettingsForm({ ...remote, wifiPassword: '' }, JOINED);
  assert.equal(kept.password, null);
  assert.equal(entriesHex(settingsChanges(kept, JOINED, true)), '280101' + '290f' + hex(utf8('rns.example.org')) + '2a021365');
  // Another network with none is an open network.
  assert.equal(repeaterSettingsForm({ ...remote, wifiName: 'Cafe', wifiPassword: '' }, JOINED).password, '');
});

test('the result says the node is set up but not repeating yet, and where its Wi-Fi stands', () => {
  const status = (repeater, wifi = null) => ({ node: { repeater }, wifi });
  assert.equal(repeaterSavedMessage('887A', status(true), baseForm()), 'RNode 887A is set up as a Repeater and is not repeating yet.');
  assert.equal(repeaterSavedMessage('887A', status(false), baseForm()),
    'RNode 887A saved the Repeater settings but did not restart as a Repeater. Check its screen.');
  const remote = baseForm({ remote: true, wifiName: 'Home', uplinkHost: 'rns.example.org ', uplinkPort: '4242' });
  assert.equal(repeaterSavedMessage('887A', status(true, { mode: 1, ready: true, ip: '192.168.1.50' }), remote),
    'RNode 887A is set up as a Repeater and is not repeating yet. It joined “Home” at 192.168.1.50 and connects to rns.example.org, port 4242.');
  assert.match(repeaterSavedMessage('887A', status(true, { mode: 1, ready: false, ip: null }), remote), /It has not joined “Home” yet\./);
  assert.match(repeaterSavedMessage('887A', status(true, { mode: 1, ready: false, ip: null }), remote), /its screen shows its Wi-Fi state\.$/);
  // A board with no screen is sent to the live view's status check instead.
  const screenless = (target, repeater, wifi = null) => ({ ...status(repeater, wifi), board: { platform: 0x80, mcu: 0x81, board: target } });
  for (const target of [0x51, 0xba]) {
    assert.equal(repeaterSavedMessage('887A', screenless(target, false), baseForm()),
      'RNode 887A saved the Repeater settings but did not restart as a Repeater. Run the status check in rsNode live view.');
    assert.equal(repeaterSavedMessage('887A', screenless(target, true), baseForm()), 'RNode 887A is set up as a Repeater and is not repeating yet.');
  }
  assert.equal(repeaterSavedMessage('887A', screenless(0xba, true, { mode: 1, ready: false, ip: null }), remote),
    'RNode 887A is set up as a Repeater and is not repeating yet. It has not joined “Home” yet. Check the network name and password; ' +
    'the status check in rsNode live view shows its Wi-Fi state.');
  // The ThinkNode M1 has a screen, and so do the boards whose wire identity the others borrow.
  for (const target of [0xc4, 0x44, 0x3a]) assert.match(repeaterSavedMessage('887A', screenless(target, false), baseForm()), /Check its screen\.$/);
});

// The panel's task against stand-ins for the port, the node and the DOM it reports to.
function repeaterTask(node, form, overrides = {}) {
  const calls = [];
  const context = {
    state: { flashing: false }, navigator: { serial: {} }, rsnodeOwnerBusy: false, rsnodeSettingsBusy: false, rsnodeRepeaterBusy: false,
    rsnodeChecking: false, rsnodeRepeaterResult: null, rsnodeDeviceFacts: null, RNODE_REPAIR_SETTLE_MS: 0, RSNODE_RESUME_MS: 100,
    RSNODE_TAKEOVER: 'If you just installed, press RESET on the board first.', HOST_OWNERS, WIFI_MODES,
    document: { getElementById: () => ({}), querySelectorAll: () => [] }, rsnodeHeardBoard: null,
    updateRsnodeSettingsVisibility: () => {}, window: { confirm: text => { calls.push(['confirm', text]); return true; } },
    showRsnodeDeviceCheck: () => calls.push(['check']),
    setRsnodeRepeaterBusy: busy => calls.push(['busy', busy]),
    rsnodeRepeaterMessage: (message, error, done) => calls.push(['message', message, !!error, !!done]),
    readRsnodeRepeaterForm: () => form,
    rsnodeFieldError: (field, message) => Object.assign(new Error(message), { field }),
    rsnodeRepeaterField: key => ({ key, focus: () => calls.push(['focus', key]) }),
    stopRsnodeRepeaterScan: () => {},
    rsnodeToolPortFromUser: async () => calls.push(['port']),
    rsnodeOtherPorts: async () => [],
    renderRsnodeRepeaterCard: () => calls.push(['card', context.rsnodeRepeaterResult && context.rsnodeRepeaterResult.card]),
    openProgressLog: () => ({ log: () => {}, setStatus: () => {} }),
    openRnodeSerialPort: async () => 'port',
    createRnodeSession: port => ({ port }),
    closeRnodeSession: async () => calls.push(['close']),
    waitForRsnode: async () => true,
    readManagementStatus: async () => ({ nodeId: node.nodeId }),
    readRsnodeStatus: async () => node.status.shift(),
    rsnodeBoardForTarget,
    addRsnodeOwner: async (session, address, key) => calls.push(['owner', hex(address), key ? hex(key) : null]),
    bytesToHex: hex,
    readRsnodeSettings: async () => node.settings,
    writeRsnodeSettings: async (session, entries, mode) => { calls.push(['settings', entriesHex(entries), mode]); return node.saved; },
    writeRepeaterSetup: async (session, entries) => { calls.push(['setup', entriesHex(entries)]); return node.setup; },
    readRsnodeIdentity: async () => node.identity,
    leaveRsnode: async () => calls.push(['leave']),
    sleepMs: async ms => calls.push(['sleep', ms]),
    showSerialWarning: () => {},
    checkRepeaterForm, repeaterRegions, repeaterOwner, repeaterSettingsForm, checkSettingsForm, settingsChanges, repeaterSetupEntries,
    nodeContactCard, repeaterSavedMessage, controlRepeater, rsnodeLights, rsnodeScreenless,
    ...overrides
  };
  const page = pageFunctions(['RSNODE_SETTINGS_RESTART_MS', 'RSNODE_WIFI_WAIT_MS', 'RSNODE_WIFI_POLL_MS', 'RSNODE_CLI_WORDS',
    'rsnodePortError', 'rsnodeHeldElsewhere', 'rsnodeHeldMessage', 'waitForRsnodeWifi', 'followRsnodeRestart', 'rsnodeRepeaterRefusal',
    'rsnodeRepeaterError', 'rsnodeRepeaterNode', 'rsnodeRepeaterTarget', 'rsnodeRepeaterControls', 'noteRsnodeRepeater',
    'rsnodeBoardScreenless', 'rsnodeBoardHasWifi', 'hearRsnodeBoard', 'rsnodeIsRepeater', 'RSNODE_REPEATER_CONTROLS',
    'runRsnodeRepeaterTask', 'runRsnodeRepeaterControl'], context);
  return { ...page, context, calls };
}

const statusOf = (repeater, hostOwner, extra = {}) => ({ node: { repeater, bluetoothAvailable: true, bluetoothEnabled: true, hostOwner },
  board: { platform: 0x80, mcu: 0x81, board: 0x3f }, wifi: null, ...extra });

test('Finish setup enrols the Owner, saves Wi-Fi and the uplink, saves the Repeater without starting it, then shows the node\'s card', async () => {
  const identity = await parseRsnodeIdentity(identityBody(node));
  const card = await parseContactCard(alice.rscp1);
  const form = baseForm({ owner: '', card, remote: true, wifiName: 'Home', wifiPassword: 'correct-horse', uplinkHost: 'rns.example.org' });
  const task = repeaterTask({ nodeId: '887A', settings: FRESH, saved: { kind: 'restart', restartMs: 250 }, setup: { kind: 'restart', restartMs: 500 },
    identity, status: [statusOf(false, 1), statusOf(true, 0, { wifi: { mode: 1, ready: true, ip: '192.168.1.50' } })] }, form);
  await task.runRsnodeRepeaterTask();
  assert.deepEqual(task.calls.filter(call => !['busy', 'message'].includes(call[0])), [
    ['port'], ['card', null],
    ['owner', alice.lxmf, alice.publicKey],
    ['settings', '010101' + '0304' + hex(utf8('Home')) + '040d' + hex(utf8('correct-horse')) + '280101' + '290f' +
      hex(utf8('rns.example.org')) + '2a021092', 'join'],
    ['sleep', 1250],
    ['setup', '010102' + '020100' + '080102' + '090101' + '0a0100'],
    ['sleep', 1500],
    ['leave'], ['card', nodeContactCard(identity)], ['close']]);
  assert.deepEqual(task.calls.filter(call => call[0] === 'message').at(-1), ['message',
    'RNode 887A is set up as a Repeater and is not repeating yet. It joined “Home” at 192.168.1.50 and connects to rns.example.org, port 4242.', false, true]);
  assert.deepEqual([task.context.rsnodeRepeaterResult.nodeId, task.context.rsnodeRepeaterResult.repeating], ['887A', false]);
  assert.equal(task.rsnodeRepeaterTarget(), '887A');
});

test('Start repeating is offered only for a node set up here or a Repeater in the live view, and sends REPEATER_CONTROL start', async () => {
  const facts = (repeater, radioProfile, forwarding = null) => ({ status: { nodeId: 'B44E' }, rsnode: { node: { repeater, forwarding } },
    transport: { bootMode: repeater, radioProfile } });
  let task = repeaterTask({ nodeId: '887A' }, baseForm(), { rsnodeDeviceFacts: null });
  assert.equal(task.rsnodeRepeaterTarget(), null);
  task.context.rsnodeDeviceFacts = facts(false, true);
  assert.equal(task.rsnodeRepeaterTarget(), null);
  task.context.rsnodeDeviceFacts = facts(true, false);
  assert.equal(task.rsnodeRepeaterTarget(), null);
  // A Repeater that says it is paused, or that predates the forwarding flag, can be started; one forwarding cannot.
  task.context.rsnodeDeviceFacts = facts(true, true, true);
  assert.equal(task.rsnodeRepeaterTarget(), null);
  task.context.rsnodeDeviceFacts = facts(true, true, false);
  assert.equal(task.rsnodeRepeaterTarget(), 'B44E');
  task.context.rsnodeDeviceFacts = facts(true, true);
  assert.equal(task.rsnodeRepeaterTarget(), 'B44E');
  task.context.rsnodeDeviceFacts = { ...facts(true, true), rsnode: null };
  assert.equal(task.rsnodeRepeaterTarget(), 'B44E');
  // Setup that just finished here wins over the live view.
  task.context.rsnodeDeviceFacts = facts(true, true, true);
  task.context.rsnodeRepeaterResult = { nodeId: '887A', repeating: false };
  assert.equal(task.rsnodeRepeaterTarget(), '887A');
  task.context.rsnodeRepeaterResult.repeating = true;
  assert.equal(task.rsnodeRepeaterTarget(), null);
  // Nothing to start: nothing is sent.
  await task.runRsnodeRepeaterControl('start');
  assert.ok(!task.calls.some(call => call[0] === 'port'));

  // The control frame goes to the node that was set up; it is already a Repeater, so it does not restart.
  const port = nodePort([[0x7a, 0x06, 0x00]]);
  task = repeaterTask({ nodeId: '887A' }, baseForm(), { rsnodeDeviceFacts: null, rsnodeRepeaterResult: { nodeId: '887A', repeating: false },
    openRnodeSerialPort: async () => port, createRnodeSession, closeRnodeSession: async session => { await closeRnodeSession(session); task.calls.push(['close']); } });
  await task.runRsnodeRepeaterControl('start');
  assert.deepEqual(port.written, ['c07a0601c0']);
  assert.deepEqual(task.calls.filter(call => !['busy', 'message'].includes(call[0])), [['port'], ['leave'], ['close']]);
  assert.deepEqual(task.calls.filter(call => call[0] === 'message').at(-1), ['message', 'The node is repeating.', false, true]);
  assert.equal(task.context.rsnodeRepeaterResult.repeating, true);
  assert.deepEqual(task.calls.filter(call => call[0] === 'busy'), [['busy', true], ['busy', false]]);

  // Another node on the port is left alone.
  task = repeaterTask({ nodeId: 'FFFF' }, baseForm(), { rsnodeDeviceFacts: null, rsnodeRepeaterResult: { nodeId: '887A', repeating: false },
    controlRepeater: async () => { throw new Error('sent to the wrong node'); } });
  await task.runRsnodeRepeaterControl('start');
  assert.equal(task.calls.filter(call => call[0] === 'message').at(-1)[1], 'This is RNode FFFF, not RNode 887A. Connect RNode 887A to start it.');
  assert.equal(task.context.rsnodeRepeaterResult.repeating, false);
});

test('a board with no screen is set up and started with its lights and status check named, never its screen or menu', async () => {
  const identity = await parseRsnodeIdentity(identityBody(node));
  const rak = (repeater, hostOwner) => statusOf(repeater, hostOwner, { board: { platform: 0x70, mcu: 0x71, board: 0x51 } });
  // Setup remembers the board, so Start repeating can say what its light does next.
  let task = repeaterTask({ nodeId: '887A', setup: { kind: 'restart', restartMs: 0 }, identity, status: [rak(false, 1), rak(true, 0)] }, baseForm());
  await task.runRsnodeRepeaterTask();
  assert.equal(task.calls.filter(call => call[0] === 'message').at(-1)[1], 'RNode 887A is set up as a Repeater and is not repeating yet.');
  assert.equal(task.context.rsnodeRepeaterResult.board.id, 'rak4631');
  const start = async overrides => {
    const port = nodePort([[0x7a, 0x06, 0x00]]);
    const started = repeaterTask({ nodeId: '887A' }, baseForm(), { openRnodeSerialPort: async () => port, createRnodeSession, closeRnodeSession, ...overrides });
    await started.runRsnodeRepeaterControl('start');
    assert.deepEqual(port.written, ['c07a0601c0']);
    return started.calls.filter(call => call[0] === 'message').at(-1);
  };
  assert.deepEqual(await start({ rsnodeRepeaterResult: task.context.rsnodeRepeaterResult }),
    ['message', 'The node is repeating. Its green light now flashes twice every 5 seconds.', false, true]);
  // A paused Stick Lite V3 seen in the live view is started the same way, and its last read now says it forwards.
  const facts = (board = 0xba) => ({ status: { nodeId: '887A' }, transport: { bootMode: true, radioProfile: true },
    rsnode: { node: { repeater: true, forwarding: false }, board: { platform: 0x80, mcu: 0x81, board } } });
  const lite = facts();
  assert.equal((await start({ rsnodeDeviceFacts: lite }))[1], 'The node is repeating. Its white light now flashes twice every 5 seconds.');
  assert.deepEqual(lite.rsnode.node, { repeater: true, forwarding: true });
  // A board with a screen, or one whose STATUS never named it, gets the plain line.
  assert.equal((await start({ rsnodeDeviceFacts: facts(0x3a) }))[1], 'The node is repeating.');
  assert.equal((await start({ rsnodeDeviceFacts: { ...facts(), rsnode: null } }))[1], 'The node is repeating.');
  // Another app holding it: there is no USB button to hold.
  task = repeaterTask({ nodeId: '887A', status: [rak(false, 2)] }, baseForm());
  await task.runRsnodeRepeaterTask();
  assert.equal(task.calls.filter(call => call[0] === 'message').at(-1)[1],
    'Another app is using RNode 887A over Bluetooth. Disconnect it, then save again.');
  task = repeaterTask({ nodeId: '887A', status: [rak(false, 1)], setup: { kind: 'refused' } }, baseForm());
  await task.runRsnodeRepeaterTask();
  assert.equal(task.calls.filter(call => call[0] === 'message').at(-1)[1],
    'Another app is using RNode 887A over Bluetooth or Wi-Fi. Disconnect it, then save again.');
  // The panel's hint names the board's menu only for a board that has one.
  const later = extract('syncRsnodeRepeaterForm');
  assert.match(later, /rsnodeBoardScreenless\(rsnodeHeardBoard\) \? 'or later from Ratspeak with \/start\.' : 'later from Ratspeak with \/start, or from the board\\'s menu\.'/);
});

// A Repeater as the live view last read it: STATUS names the board by its update target.
const repeaterFacts = (target, forwarding, repeater = true) => ({ status: { nodeId: '887A' }, transport: { bootMode: repeater, radioProfile: true },
  rsnode: { node: { repeater, forwarding }, board: { platform: target === 0x51 ? 0x70 : 0x80, mcu: target === 0x51 ? 0x71 : 0x81, board: target } } });

test('a Repeater with no screen can be stopped and returned to RNode mode here; a board with a screen keeps its own menu', async () => {
  // Stop: one frame, no restart, and the node's last read now says it is paused.
  let facts = repeaterFacts(0x51, true);
  let port = nodePort([[0x7a, 0x06, 0x00]]);
  let task = repeaterTask({ nodeId: '887A' }, baseForm(), { rsnodeDeviceFacts: facts, openRnodeSerialPort: async () => port, createRnodeSession, closeRnodeSession });
  await task.runRsnodeRepeaterControl('stop');
  assert.deepEqual(port.written, ['c07a0602c0']);
  assert.deepEqual(task.calls.filter(call => call[0] === 'message').at(-1),
    ['message', 'The node stopped repeating. Its green light now flashes once every 5 seconds.', false, true]);
  assert.deepEqual(facts.rsnode.node, { repeater: true, forwarding: false });
  assert.ok(!task.calls.some(call => ['confirm', 'check', 'sleep'].includes(call[0])));
  assert.equal(task.rsnodeRepeaterTarget(), '887A');

  // Back to RNode mode: said plainly first, then one frame, the restart, and the live view takes over.
  facts = repeaterFacts(0xba, false);
  port = nodePort([[0x7a, 0x06, 0x00, 0x00, 0xfa]]);
  task = repeaterTask({ nodeId: '887A' }, baseForm(), { rsnodeDeviceFacts: facts, openRnodeSerialPort: async () => port, createRnodeSession,
    closeRnodeSession: async session => { await closeRnodeSession(session); task.calls.push(['close']); } });
  await task.runRsnodeRepeaterControl('exit');
  assert.deepEqual(port.written, ['c07a0603c0']);
  assert.deepEqual(task.calls.filter(call => !['busy', 'message'].includes(call[0])), [
    ['confirm', 'Return RNode 887A to RNode mode?\n\nIt stops repeating and restarts as an RNode. Its Repeater settings and managers stay.'],
    ['port'], ['sleep', 1250], ['leave'], ['close'], ['check']]);
  assert.deepEqual(task.calls.filter(call => call[0] === 'message').at(-1), ['message', 'RNode 887A is back in RNode mode.', false, true]);
  assert.deepEqual(facts.rsnode.node, { repeater: false, forwarding: false });
  assert.equal(task.rsnodeRepeaterNode(), null);

  // Declined: nothing is asked of the node.
  task = repeaterTask({ nodeId: '887A' }, baseForm(), { rsnodeDeviceFacts: repeaterFacts(0xba, true),
    window: { confirm: () => false }, controlRepeater: async () => { throw new Error('sent after a No'); } });
  await task.runRsnodeRepeaterControl('exit');
  assert.ok(!task.calls.some(call => ['port', 'check', 'busy'].includes(call[0])));

  // A node set up here: its card stays, it reads as an RNode that Start repeating can bring back.
  const identity = await parseRsnodeIdentity(identityBody(node));
  const result = { nodeId: '887A', identity, card: nodeContactCard(identity), repeating: true, repeater: true, board: rsnodeBoard('rak4631') };
  port = nodePort([[0x7a, 0x06, 0x00, 0x00, 0xfa]]);
  task = repeaterTask({ nodeId: '887A' }, baseForm(), { rsnodeRepeaterResult: result, openRnodeSerialPort: async () => port, createRnodeSession, closeRnodeSession });
  await task.runRsnodeRepeaterControl('exit');
  assert.deepEqual([result.repeater, result.repeating, result.card], [false, false, nodeContactCard(identity)]);
  assert.deepEqual(JSON.parse(JSON.stringify(task.rsnodeRepeaterNode())), { nodeId: '887A', board: JSON.parse(JSON.stringify(rsnodeBoard('rak4631'))),
    repeater: false, forwarding: false });
  assert.equal(task.rsnodeRepeaterTarget(), '887A');
  // No longer a Repeater: neither Stop nor a second return is sent.
  for (const action of ['stop', 'exit']) await task.runRsnodeRepeaterControl(action);
  assert.deepEqual(port.written, ['c07a0603c0']);

  // A board with a screen, or one no STATUS named: Stop and Return are not sent, whatever calls them.
  for (const known of [repeaterFacts(0x3f, true), repeaterFacts(0xc4, true), repeaterFacts(0x44, true), { ...repeaterFacts(0x51, true), rsnode: null }]) {
    task = repeaterTask({ nodeId: '887A' }, baseForm(), { rsnodeDeviceFacts: known, controlRepeater: async () => { throw new Error('sent to a board with a screen'); } });
    for (const action of ['stop', 'exit']) await task.runRsnodeRepeaterControl(action);
    assert.ok(!task.calls.some(call => ['port', 'confirm'].includes(call[0])));
  }
  // Another node on the port, and a node that refuses, each say so.
  task = repeaterTask({ nodeId: 'FFFF' }, baseForm(), { rsnodeDeviceFacts: repeaterFacts(0x51, true), controlRepeater: async () => { throw new Error('sent to the wrong node'); } });
  await task.runRsnodeRepeaterControl('stop');
  assert.equal(task.calls.filter(call => call[0] === 'message').at(-1)[1], 'This is RNode FFFF, not RNode 887A. Connect RNode 887A to stop it.');
  await task.runRsnodeRepeaterControl('exit');
  assert.equal(task.calls.filter(call => call[0] === 'message').at(-1)[1], 'This is RNode FFFF, not RNode 887A. Connect RNode 887A to return it to RNode mode.');
  facts = repeaterFacts(0x51, true);
  port = nodePort([[0x7a, 0x06, 0x02]]);
  task = repeaterTask({ nodeId: '887A' }, baseForm(), { rsnodeDeviceFacts: facts, openRnodeSerialPort: async () => port, createRnodeSession, closeRnodeSession });
  await task.runRsnodeRepeaterControl('stop');
  assert.deepEqual(task.calls.filter(call => call[0] === 'message').at(-1), ['message', 'The node refused this.', true, false]);
  assert.equal(facts.rsnode.node.forwarding, true);

  // Offering them on every board is this one line.
  assert.equal(extract('rsnodeRepeaterControls').replace(/\s+/g, ' '), 'function rsnodeRepeaterControls(board) { return rsnodeBoardScreenless(board); }');
});

test('the panel shows Start or Stop, whichever the node is not doing, and the way back to RNode mode, only for a board with no screen', () => {
  const elements = {};
  const element = id => elements[id] ||= { id, hidden: false, disabled: false, textContent: '', value: '', checked: false };
  const context = { state: { flashing: false }, rsnodeRepeaterBusy: false, rsnodeRepeaterControl: null, rsnodeSettingsBusy: false, rsnodeOwnerBusy: false,
    rsnodeChecking: false, rsnodeRepeaterResult: null, rsnodeDeviceFacts: null, rsnodeHeardBoard: null, rsnodeRepeaterOwnerCard: null,
    rsnodeRepeaterStopScan: null, document: { getElementById: element, querySelector: () => null },
    renderRsnodeRepeaterRegions: () => {}, syncRsnodePort: () => {}, repeaterRadioLine, repeaterSummary, rsnodeBoardForTarget };
  const page = pageFunctions(['RSNODE_LIMITS_HELP', 'rsnodeBoardScreenless', 'rsnodeBoardHasWifi', 'rsnodeIsRepeater', 'rsnodeRepeaterNode',
    'rsnodeRepeaterTarget', 'rsnodeRepeaterControls', 'readRsnodeRepeaterForm', 'syncRsnodeRepeaterForm'], context);
  const shown = changes => {
    Object.assign(context, { rsnodeRepeaterBusy: false, rsnodeRepeaterControl: null, rsnodeRepeaterResult: null, rsnodeDeviceFacts: null }, changes);
    page.syncRsnodeRepeaterForm();
    return ['rsnodeRepeaterGo', 'rsnodeRepeaterStop', 'rsnodeRepeaterExit'].map(id => elements[id].hidden ? 'hidden' : elements[id].disabled ? 'off' : 'on').join(' ');
  };
  // No Repeater known: Start is there, disabled, as before.
  assert.equal(shown({}), 'off hidden hidden');
  // A board with a screen never gets Stop or the way back, forwarding or not.
  for (const target of [0x3a, 0x3f, 0xbf, 0xc0, 0x3c, 0x44, 0xc4]) {
    assert.equal(shown({ rsnodeDeviceFacts: repeaterFacts(target, true) }), 'off hidden hidden', target.toString(16));
    assert.equal(shown({ rsnodeDeviceFacts: repeaterFacts(target, false) }), 'on hidden hidden', target.toString(16));
  }
  // A board with no screen: Stop while it forwards, Start while it is paused, and the way back either way.
  for (const target of [0x51, 0xba]) {
    assert.equal(shown({ rsnodeDeviceFacts: repeaterFacts(target, true) }), 'hidden on on', target.toString(16));
    assert.equal(shown({ rsnodeDeviceFacts: repeaterFacts(target, false) }), 'on hidden on', target.toString(16));
    // As an RNode it has nothing to stop or leave.
    assert.equal(shown({ rsnodeDeviceFacts: repeaterFacts(target, false, false) }), 'off hidden hidden', target.toString(16));
  }
  // The node set up here follows the same rule, and reads as an RNode once it has been returned to RNode mode.
  const result = (repeating, repeater = true) => ({ nodeId: '887A', repeating, repeater, board: rsnodeBoard('heltec-wsl-v3') });
  assert.equal(shown({ rsnodeRepeaterResult: result(false) }), 'on hidden on');
  assert.equal(shown({ rsnodeRepeaterResult: result(true) }), 'hidden on on');
  assert.equal(shown({ rsnodeRepeaterResult: result(false, false) }), 'on hidden hidden');
  assert.equal(shown({ rsnodeRepeaterResult: { nodeId: '887A', repeating: true, board: rsnodeBoard('heltec-v4') } }), 'off hidden hidden');
  // While a control runs, every button waits and the one in use says so.
  assert.equal(shown({ rsnodeRepeaterBusy: true, rsnodeRepeaterControl: 'stop', rsnodeDeviceFacts: repeaterFacts(0x51, true) }), 'hidden off off');
  assert.deepEqual(['rsnodeRepeaterFinish', 'rsnodeRepeaterStop', 'rsnodeRepeaterExit'].map(id => elements[id].textContent),
    ['Finish setup', 'Stopping…', 'Return to RNode mode…']);
  shown({ rsnodeRepeaterBusy: true, rsnodeRepeaterControl: 'exit', rsnodeDeviceFacts: repeaterFacts(0x51, true) });
  assert.equal(elements.rsnodeRepeaterExit.textContent, 'Returning…');
  shown({ rsnodeRepeaterBusy: true, rsnodeDeviceFacts: repeaterFacts(0x51, false) });
  assert.deepEqual([elements.rsnodeRepeaterFinish.textContent, elements.rsnodeRepeaterGo.textContent], ['Finishing…', 'Start repeating']);

  // The page ships both hidden, beside Start repeating, and each click runs its control.
  const panel = /id="rsnodeRepeater"[\s\S]*?id="rsnodeDevice"/.exec(html)[0];
  assert.match(panel, /id="rsnodeRepeaterGo"[^>]*>Start repeating<\/button>\s*<button class="rsnode-beta__button" id="rsnodeRepeaterStop" type="button" disabled hidden>Stop repeating<\/button>/);
  assert.match(panel, /<button class="rsnode-beta__button rsnode-tools__end" id="rsnodeRepeaterExit" type="button" disabled hidden>Return to RNode mode…<\/button>/);
  assert.match(html, /\['Go', 'Stop', 'Exit'\]\.forEach\(function\(button, index\) \{\s+document\.getElementById\('rsnodeRepeater' \+ button\)\.addEventListener\('click', function\(\) \{\s+runRsnodeRepeaterControl\(\['start', 'stop', 'exit'\]\[index\]\);/);
});

test('a board with no Wi-Fi is not offered Reach it from anywhere, and a setup that asks for it is stopped before anything is written', async () => {
  // The option and its tip are marked; hearing of a board without Wi-Fi hides them and renames the panel's summary.
  const panel = /id="rsnodeRepeater"[\s\S]*?id="rsnodeDevice"/.exec(html)[0];
  assert.match(panel, /<fieldset class="rsnode-settings__group" data-wifi-only>\s*<legend class="rnode-source__label">Reach it from anywhere \(optional\)<\/legend>/);
  assert.match(panel, /<li>Finish setup restarts the node as a Repeater\.<span data-wifi-only> It may restart once more first to join Wi-Fi\.<\/span><\/li>/);
  assert.match(panel, /<span class="flash-cta__repair-meta" id="rsnodeRepeaterMeta">Region, Owner, and Wi-Fi over USB<\/span>/);
  const parts = { '[data-wifi-only]': [{ hidden: false }, { hidden: false }], '[data-screen-only]': [{ hidden: false }] };
  const meta = { textContent: '' }, settings = { hidden: false }, remote = { checked: true, value: '' };
  const context = { state: { device: 'custom', rsnodeInstalled: false }, betaStage: 'ready', isRsnodeSelected: () => true, rsnodeRepeaterOwnerCard: null,
    document: { querySelectorAll: selector => parts[selector], querySelector: () => null,
      getElementById: id => id === 'rsnodeRepeaterMeta' ? meta : id === 'rsnodeSettings' ? settings : remote } };
  const page = pageFunctions(['rsnodeHeardBoard', 'rsnodeToolsUnlocked', 'rsnodeBoardScreenless', 'rsnodeBoardHasWifi', 'updateRsnodeSettingsVisibility',
    'hearRsnodeBoard', 'readRsnodeRepeaterForm'], context);
  const heard = id => {
    page.hearRsnodeBoard(id ? rsnodeBoard(id) : null);
    return [parts['[data-wifi-only]'].every(part => part.hidden), parts['[data-screen-only]'][0].hidden, meta.textContent, settings.hidden,
      page.readRsnodeRepeaterForm().remote];
  };
  for (const id of ['rak4631', 'thinknode-m1', 't-echo', 'heltec-t114']) {
    assert.deepEqual(heard(id), [true, id === 'rak4631', 'Region and Owner over USB', true, false], id);
  }
  for (const id of ['heltec-v3', 'heltec-v4', 'heltec-v4-r8', 'heltec-v4-r8-tft', 'heltec-wsl-v3', null]) {
    assert.deepEqual(heard(id), [false, id === 'heltec-wsl-v3', 'Region, Owner, and Wi-Fi over USB', false, true], String(id));
  }

  // The form was filled in for a board with Wi-Fi, and the node on the port has none: the node says so before any write.
  const remote1 = baseForm({ remote: true, wifiName: 'Home', wifiPassword: 'correct-horse', uplinkHost: 'rns.example.org' });
  const rak = statusOf(false, 1, { board: { platform: 0x70, mcu: 0x71, board: 0x51 } });
  let task = repeaterTask({ nodeId: '887A', status: [rak] }, remote1);
  await task.runRsnodeRepeaterTask();
  assert.deepEqual(task.calls.filter(call => call[0] === 'message').at(-1),
    ['message', 'RAK4631 has no Wi-Fi, so it cannot connect to a server. Finish setup again to set it up without one.', true, false]);
  assert.ok(!task.calls.some(call => ['owner', 'settings', 'setup'].includes(call[0])));
  // The tools now know the board, so the option is gone and the next Finish setup leaves it out.
  assert.equal(task.context.rsnodeHeardBoard.id, 'rak4631');
  const identity = await parseRsnodeIdentity(identityBody(node));
  task = repeaterTask({ nodeId: '887A', status: [rak, statusOf(true, 0, { board: rak.board })], setup: { kind: 'restart', restartMs: 0 }, identity }, baseForm());
  await task.runRsnodeRepeaterTask();
  assert.equal(task.calls.filter(call => call[0] === 'message').at(-1)[1], 'RNode 887A is set up as a Repeater and is not repeating yet.');
  assert.ok(!task.calls.some(call => call[0] === 'settings'));
  // A Stick Lite V3 has Wi-Fi: the same form goes through.
  const lite = extra => statusOf(extra.repeater, 1, { board: { platform: 0x80, mcu: 0x81, board: 0xba }, ...extra });
  task = repeaterTask({ nodeId: '887A', settings: FRESH, saved: { kind: 'restart', restartMs: 0 }, setup: { kind: 'restart', restartMs: 0 }, identity,
    status: [lite({ repeater: false }), lite({ repeater: true, wifi: { mode: 1, ready: true, ip: '192.168.1.50' } })] }, remote1);
  await task.runRsnodeRepeaterTask();
  assert.ok(task.calls.some(call => call[0] === 'settings'));
  assert.match(task.calls.filter(call => call[0] === 'message').at(-1)[1], /It joined “Home” at 192\.168\.1\.50/);
  assert.equal(task.context.rsnodeHeardBoard.id, 'heltec-wsl-v3');
});

test('Start stops before writing when the form, the board, or another app says no, and lands a refusal on its field', async () => {
  // A field error is caught before a port is asked for.
  let task = repeaterTask({ nodeId: '887A', status: [] }, baseForm({ accepted: false }));
  await task.runRsnodeRepeaterTask();
  assert.ok(!task.calls.some(call => call[0] === 'port'));
  assert.deepEqual(task.calls.filter(call => call[0] === 'focus'), [['focus', 'accepted']]);
  // A V4 has no 433 MHz radio.
  task = repeaterTask({ nodeId: '887A', status: [statusOf(false, 1)] }, baseForm({ region: 3 }));
  await task.runRsnodeRepeaterTask();
  assert.ok(!task.calls.some(call => call[0] === 'owner'));
  assert.equal(task.calls.filter(call => call[0] === 'message').at(-1)[1], 'Heltec V4 · R2 has no 433 MHz radio. Choose another region.');
  // Another app holds the RNode.
  task = repeaterTask({ nodeId: '887A', status: [statusOf(false, 2)] }, baseForm());
  await task.runRsnodeRepeaterTask();
  assert.ok(!task.calls.some(call => call[0] === 'owner'));
  assert.match(task.calls.filter(call => call[0] === 'message').at(-1)[1], /^Another app is using RNode 887A over Bluetooth\./);
  // Firmware without STATUS cannot set up a Repeater.
  task = repeaterTask({ nodeId: '887A', status: [null] }, baseForm());
  await task.runRsnodeRepeaterTask();
  assert.equal(task.calls.filter(call => call[0] === 'message').at(-1)[1], 'RNode 887A cannot set up a Repeater over USB. Update it first.');
  // The node refuses the preset: the error lands on it, after the Owner was enrolled and before any card.
  task = repeaterTask({ nodeId: '887A', status: [statusOf(false, 1)],
    setup: { kind: 'invalid', field: 'preset', message: 'This board cannot use this region and preset.' } }, baseForm());
  await task.runRsnodeRepeaterTask();
  assert.deepEqual(task.calls.filter(call => ['owner', 'setup', 'focus', 'leave'].includes(call[0])).map(call => call[0]), ['owner', 'setup', 'focus']);
  assert.deepEqual(task.calls.filter(call => call[0] === 'message').at(-1), ['message', 'This board cannot use this region and preset.', true, false]);
  // No identity after the restart means no card.
  task = repeaterTask({ nodeId: '887A', status: [statusOf(false, 1), statusOf(true, 0)], setup: { kind: 'restart', restartMs: 0 },
    identity: { present: false } }, baseForm());
  await task.runRsnodeRepeaterTask();
  assert.equal(task.calls.filter(call => call[0] === 'message').at(-1)[1], 'RNode 887A did not report its identity, so there is no contact card to show.');
});

test('the panel sits first among the rsNode tools, asks once for the local rules, and the other panels point to it', () => {
  assert.match(html, /<details class="flash-cta__repair rsnode-repeater" id="rsnodeRepeater" name="rsnode-tools" hidden>/);
  assert.ok(html.indexOf('id="rsnodeRepeater"') < html.indexOf('id="rsnodeDevice"'));
  const panel = /id="rsnodeRepeater"[\s\S]*?id="rsnodeDevice"/.exec(html)[0];
  const text = panel.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.equal(text.match(/radio rules/g).length, 1);
  assert.match(text, /You are responsible for following the radio rules where you use it, including frequency, power, and airtime limits\./);
  assert.match(text, /Connect it to a Reticulum TCP server so you can reach it from anywhere\./);
  assert.match(text, /Scan this in Ratspeak to add your rsNode as a contact\. You can then manage it by messaging it\./);
  // Setup ends paused: the person is holding the board. Starting is its own, later choice.
  assert.match(panel, /id="rsnodeRepeaterFinish" type="submit" form="rsnodeRepeaterForm"[^>]*>Finish setup</);
  assert.match(panel, /id="rsnodeRepeaterGo" type="button"[^>]*disabled>Start repeating</);
  assert.doesNotMatch(text, /Start the Repeater/);
  assert.equal(text.match(/without repeating yet/g).length, 1);
  assert.match(text, /Finish setup saves these settings without repeating yet\. Start repeating here, later from Ratspeak with \/start, or from the board's menu\./);
  assert.match(panel, /name="rsnodeRepeaterLimits" value="off" checked/);
  for (const value of ['default', 'custom']) assert.match(panel, new RegExp(`name="rsnodeRepeaterLimits" value="${value}">`));
  for (const id of Object.values(JSON.parse(extract('RSNODE_REPEATER_FIELDS').replace(/^var \w+ = /, '').replace(/;$/, '')
    .replace(/(\w+):/g, '"$1":').replace(/'/g, '"')))) assert.match(panel, new RegExp(`id="${id}"`), id);
  const settings = /id="rsnodeSettings"[\s\S]*?id="rsnodeOwner"/.exec(html)[0].replace(/<[^>]+>/g, ' ');
  assert.match(settings, /To choose the region, preset, and LIMITS, use Set up as a Repeater\./);
  assert.doesNotMatch(settings, /set on the device/i);
});

test('flash.html alone may use the camera: its header rule comes after the site-wide one and keeps the other policies', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const policy = source => {
    const index = config.headers.findIndex(rule => rule.source === source);
    return { index, value: config.headers[index].headers.find(header => header.key === 'Permissions-Policy').value };
  };
  const site = policy('/(.*)'), flash = policy('/flash.html');
  // Vercel applies every matching rule in order; for one header key the last match wins.
  assert.ok(flash.index > site.index);
  assert.equal(flash.value, site.value.replace('camera=()', 'camera=(self)'));
  assert.match(site.value, /camera=\(\)/);
  const others = config.headers.filter(rule => rule.source !== '/flash.html' && rule.source !== '/(.*)');
  assert.ok(others.every(rule => !rule.headers.some(header => header.key === 'Permissions-Policy')));
});
