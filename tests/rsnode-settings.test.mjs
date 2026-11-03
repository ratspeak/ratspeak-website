import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { RSNODE_RESULT } from '../assets/js/rsnode-device.js';
import { SETTING, WIFI_MODES, checkSettingsForm, decodeEntries, decodeSettings, encodeEntries, readRsnodeSettings,
  settingsChanges, settingsForm, settingsOutcome, settingsRadioLines, settingsRefusal, settingsSavedMessage,
  writeRsnodeSettings } from '../assets/js/rsnode-settings.js';
import { flasherPage } from './flasher-page.mjs';

const html = flasherPage('flash.html');
const hex = value => Buffer.from(value).toString('hex');
const bytes = text => Array.from(Buffer.from(text));
const entry = (id, value) => [id, value.length, ...value];

// A SETTINGS_GET body in the order rsNode's settings::encode writes it, written by hand from
// crates/rsnode-management/src/settings.rs: a Repeater on its own network with peers and an uplink.
const REPEATER_GET = [
  ...entry(0x01, [2]), ...entry(0x02, [6]), ...entry(0x03, bytes('Field kit')), ...entry(0x04, [1]),
  ...entry(0x05, []), ...entry(0x06, []), ...entry(0x07, []),
  ...entry(0x10, [2]),
  ...entry(0x13, [0x33, 0xd3, 0xe6, 0x08]), ...entry(0x14, [0, 1, 0xe8, 0x48]), ...entry(0x15, [9]), ...entry(0x16, [5]),
  ...entry(0x17, [14]), ...entry(0x18, [0, 18]), ...entry(0x19, [0x14, 0x24]), ...entry(0x1a, [1]), ...entry(0x1b, [1]),
  ...entry(0x1c, [1]), ...entry(0x1d, [8]), ...entry(0x1e, [1]),
  ...entry(0x20, [1]), ...entry(0x21, [0x10, 0x92]), ...entry(0x22, [2]), ...entry(0x23, [0]), ...entry(0x25, [0]),
  ...entry(0x28, [1]), ...entry(0x29, bytes('rns.example.org')), ...entry(0x2a, [0x10, 0x92]), ...entry(0x2b, [0]), ...entry(0x2d, [0])
];
// An RNode fresh from Install: Wi-Fi off, no region, no Repeater profile.
const FRESH_GET = [
  ...entry(0x01, [0]), ...entry(0x02, [1]), ...entry(0x03, []), ...entry(0x04, [0]), ...entry(0x05, []), ...entry(0x06, []),
  ...entry(0x07, []), ...entry(0x10, [0xff]), ...entry(0x1c, [0]), ...entry(0x1e, [0]),
  ...entry(0x20, [0]), ...entry(0x21, [0x10, 0x92]), ...entry(0x22, [2]), ...entry(0x23, [0]), ...entry(0x25, [0]),
  ...entry(0x28, [0]), ...entry(0x29, []), ...entry(0x2a, [0, 0]), ...entry(0x2b, [0]), ...entry(0x2d, [0])
];
// A station with a fixed address, gateway and DNS.
const STATION_GET = [
  ...entry(0x01, [1]), ...entry(0x02, [1]), ...entry(0x03, bytes('Home')), ...entry(0x04, [1]),
  ...entry(0x05, [192, 168, 1, 50, 255, 255, 255, 0]), ...entry(0x06, [192, 168, 1, 1]), ...entry(0x07, [1, 1, 1, 1]),
  ...entry(0x10, [0xff]), ...entry(0x1c, [0]), ...entry(0x1e, [0]), ...entry(0x20, [0]), ...entry(0x21, [0x10, 0x92]),
  ...entry(0x22, [2]), ...entry(0x23, [0]), ...entry(0x25, [0]), ...entry(0x28, [0]), ...entry(0x29, []), ...entry(0x2a, [0, 0]),
  ...entry(0x2b, [0]), ...entry(0x2d, [0])
];
const repeater = decodeSettings(REPEATER_GET), fresh = decodeSettings(FRESH_GET), station = decodeSettings(STATION_GET);
const form = (settings, changes = {}) => ({ ...settingsForm(settings), ...changes });
const entriesHex = entries => hex(encodeEntries(entries));

test('the ids are rsNode settings.rs ids', () => {
  assert.deepEqual([SETTING.wifiMode, SETTING.wifiChannel, SETTING.wifiName, SETTING.wifiPassword, SETTING.wifiAddress,
    SETTING.wifiGateway, SETTING.wifiDns, SETTING.region, SETTING.frequency, SETTING.txPower, SETTING.loraIfacKey,
    SETTING.peersEnabled, SETTING.peersPort, SETTING.peersMax, SETTING.peersIfacKey, SETTING.uplinkEnabled, SETTING.uplinkHost,
    SETTING.uplinkPort, SETTING.uplinkIfacKey], [1, 2, 3, 4, 5, 6, 7, 0x10, 0x13, 0x17, 0x1e, 0x20, 0x21, 0x22, 0x25, 0x28, 0x29, 0x2a, 0x2d]);
  assert.deepEqual(WIFI_MODES, { off: 0, join: 1, own: 2 });
});

test('a get reads as the node holds it, with secrets only as set or not set', () => {
  assert.deepEqual(repeater.wifi, { mode: 2, channel: 6, name: 'Field kit', passwordSet: true, address: null, gateway: null, dns: null });
  assert.equal(repeater.region, 2);
  assert.deepEqual(repeater.radio, { frequency: 869525000, bandwidth: 125000, spreadingFactor: 9, codingRate: 5, txPower: 14 });
  assert.deepEqual(repeater.loraIfac, { enabled: true, size: 8, keySet: true });
  assert.deepEqual(repeater.peers, { enabled: true, port: 4242, max: 2, ifac: { enabled: false, size: null, keySet: false } });
  assert.deepEqual(repeater.uplink, { enabled: true, host: 'rns.example.org', port: 4242, ifac: { enabled: false, size: null, keySet: false } });
  assert.deepEqual(settingsRadioLines(repeater), { region: 'Europe 868', radio: '869.525 MHz · 125 kHz · SF9 · CR 4/5 · 14 dBm', ifac: 'On (8)' });
  assert.deepEqual(fresh.wifi, { mode: 0, channel: 1, name: '', passwordSet: false, address: null, gateway: null, dns: null });
  assert.deepEqual([fresh.region, fresh.radio], [null, null]);
  assert.deepEqual(settingsRadioLines(fresh), { region: 'Not chosen', radio: 'Not set up', ifac: 'Not set' });
  assert.deepEqual(station.wifi.address, { address: '192.168.1.50', netmask: '255.255.255.0' });
  assert.deepEqual([station.wifi.gateway, station.wifi.dns], ['192.168.1.1', '1.1.1.1']);
  // Readers skip ids they do not know; a cut entry is malformed.
  assert.equal(decodeSettings([...FRESH_GET, ...entry(0x7f, [1, 2, 3])]).wifi.mode, 0);
  assert.throws(() => decodeEntries([0x03, 4, 0x41]), /truncated/);
  assert.throws(() => decodeEntries([0x03]), /truncated/);
  assert.deepEqual(decodeEntries(encodeEntries([[0x03, bytes('ab')], [0x05, []]])), [[0x03, bytes('ab')], [0x05, []]]);
});

test('a save sends only what changed, and a password only when typed', () => {
  // RNode joins a home network.
  const join = form(fresh, { wifiMode: 'join', name: 'Home', password: 'correct-horse' });
  assert.equal(checkSettingsForm(join, fresh, false), null);
  assert.equal(entriesHex(settingsChanges(join, fresh, false)), '010101' + '0304' + hex(bytes('Home')) + '040d' + hex(bytes('correct-horse')));
  // An open network sends an empty password.
  assert.equal(entriesHex(settingsChanges(form(fresh, { wifiMode: 'join', name: 'Cafe', password: '' }), fresh, false)),
    '010101' + '0304' + hex(bytes('Cafe')) + '0400');
  // Nothing typed, nothing sent.
  assert.deepEqual(settingsChanges(form(repeater), repeater, true), []);
  assert.deepEqual(settingsChanges(form(station), station, false), []);
  // Its own network on channel 11, with the stored password kept.
  assert.equal(entriesHex(settingsChanges(form(repeater, { channel: 11 }), repeater, true)), '02010b');
  // Wi-Fi off sends the mode alone.
  assert.equal(entriesHex(settingsChanges(form(station, { wifiMode: 'off' }), station, false)), '010100');
  // Dropping the fixed address clears address, gateway and DNS together.
  assert.equal(entriesHex(settingsChanges(form(station, { fixed: false }), station, false)), '050006000700');
  assert.equal(entriesHex(settingsChanges(form(station, { address: '192.168.1.60', dns: '' }), station, false)),
    '0508c0a8013cffffff00' + '0700');
  // Peers on another port; uplink off. The RNode form never touches them.
  const peers = form(repeater, { peersPort: '4243', uplinkEnabled: false });
  assert.equal(entriesHex(settingsChanges(peers, repeater, true)), '21021093' + '280100');
  assert.deepEqual(settingsChanges(peers, repeater, false), []);
  assert.equal(entriesHex(settingsChanges(form(fresh, { uplinkEnabled: true, uplinkHost: ' hub.local ', uplinkPort: '4965' }), fresh, true)),
    '280101' + '2909' + hex(bytes('hub.local')) + '2a021365');
});

test('the form refuses what the node would refuse, naming the field', () => {
  const check = (settings, changes, isRepeater = false) => checkSettingsForm(form(settings, changes), settings, isRepeater);
  assert.deepEqual(check(fresh, { wifiMode: 'join', name: '', password: '' }), { field: 'name', message: 'Enter the name of the network to join.' });
  assert.equal(check(fresh, { wifiMode: 'join', name: 'x'.repeat(33), password: '' }).field, 'name');
  assert.equal(check(fresh, { wifiMode: 'join', name: 'é'.repeat(16), password: '' }), null);
  assert.equal(check(fresh, { wifiMode: 'join', name: 'é'.repeat(17), password: '' }).field, 'name');
  assert.deepEqual(check(fresh, { wifiMode: 'join', name: 'Home', password: 'short' }),
    { field: 'password', message: 'A Wi-Fi password is 8 to 32 characters, or empty for an open network.' });
  assert.equal(check(fresh, { wifiMode: 'join', name: 'Home', password: 'x'.repeat(33) }).field, 'password');
  assert.equal(check(fresh, { wifiMode: 'join', name: 'Home', password: 'pässwörd1' }).field, 'password');
  // The node's own network needs a password; its name is optional.
  assert.deepEqual(check(fresh, { wifiMode: 'own', name: '' }),
    { field: 'password', message: 'The node\'s own network needs a password of 8 to 32 characters.' });
  assert.equal(check(fresh, { wifiMode: 'own', name: '', password: '' }).field, 'password');
  assert.equal(check(fresh, { wifiMode: 'own', name: '', password: '12345678' }), null);
  assert.equal(check(repeater, {}, true), null);
  // Switching between joining and hosting needs the other network's password.
  assert.deepEqual(check(station, { wifiMode: 'own' }), { field: 'password', message: 'Enter a password for the node\'s network.' });
  assert.equal(check(repeater, { wifiMode: 'join', name: 'Home' }, true).field, 'password');
  assert.equal(check(repeater, { wifiMode: 'own', channel: 14 }, true).field, 'channel');
  // Fixed addresses, as rsnode-core valid_static_station_route checks them.
  assert.equal(check(station, { address: '192.168.1.0' }).field, 'address');
  assert.equal(check(station, { address: '127.0.0.5' }).field, 'address');
  assert.equal(check(station, { address: '192.168.1.300' }).field, 'address');
  assert.equal(check(station, { netmask: '255.0.255.0' }).field, 'netmask');
  assert.equal(check(station, { netmask: '255.255.255.255' }).field, 'netmask');
  assert.equal(check(station, { gateway: '10.0.0.1' }).field, 'gateway');
  assert.equal(check(station, { gateway: '' , dns: '' }), null);
  assert.equal(check(station, { dns: '224.0.0.1' }).field, 'dns');
  // Peers and the uplink, for a Repeater only.
  assert.equal(check(repeater, { peersPort: '80' }, true).field, 'peersPort');
  assert.equal(check(repeater, { peersPort: '70000' }, true).field, 'peersPort');
  assert.equal(check(repeater, { peersPort: '80' }, false), null);
  assert.equal(check(repeater, { peersEnabled: false, peersPort: '' }, true), null);
  assert.equal(check(repeater, { uplinkHost: 'rns example' }, true).field, 'uplinkHost');
  assert.equal(check(repeater, { uplinkHost: 'h'.repeat(65) }, true).field, 'uplinkHost');
  assert.equal(check(repeater, { uplinkPort: '0' }, true).field, 'uplinkPort');
});

test('a set reply says restart, unchanged, or why: the entry and reason name the field', () => {
  const ok = body => ({ result: RSNODE_RESULT.ok, body });
  assert.deepEqual(settingsOutcome(ok([0x00, 0xfa])), { kind: 'restart', restartMs: 250 });
  assert.deepEqual(settingsOutcome(ok([])), { kind: 'unchanged' });
  const invalid = (body, mode) => settingsOutcome({ result: RSNODE_RESULT.invalid, body }, mode);
  assert.deepEqual(invalid([0x03, 4]), { kind: 'invalid', field: 'name', message: 'The node refused this network name.' });
  assert.deepEqual(invalid([0x21, 4]), { kind: 'invalid', field: 'peersPort', message: 'The node refused this peer port.' });
  assert.equal(invalid([0x00, 5], 'join').field, 'name');
  assert.equal(invalid([0x00, 5], 'own').field, 'password');
  assert.match(invalid([0x00, 5]).message, /8 to 32 characters/);
  assert.deepEqual(invalid([0x13, 7]), { kind: 'invalid', field: null, message: 'Confirm this change on the device.' });
  assert.deepEqual(invalid([0x00, 9]), { kind: 'invalid', field: null, message: 'The node refused the peer or uplink settings. Check the ports and the uplink host.' });
  assert.deepEqual(invalid([0x10, 2]), { kind: 'invalid', field: null, message: 'This firmware does not have that setting.' });
  assert.deepEqual(invalid([]), { kind: 'invalid', field: null, message: 'The node could not read the request. Nothing changed.' });
  assert.deepEqual(settingsRefusal([0x29, 4]), { field: 'uplinkHost', message: 'The node refused this uplink host.' });
  for (const [result, kind] of [['refused', 'refused'], ['busy', 'busy'], ['storage', 'storage'], ['unsupported', 'unsupported'],
    ['unavailable', 'unsupported']]) assert.equal(settingsOutcome({ result: RSNODE_RESULT[result], body: [] }).kind, kind, result);
  assert.deepEqual(settingsOutcome(null), { kind: 'unsupported' });
  assert.deepEqual(settingsOutcome({ result: RSNODE_RESULT.denied, body: [] }), { kind: 'failed', result: 1 });
});

test('after a restart the message says where Wi-Fi stands and how to connect', () => {
  const wifi = (mode, ready, ip) => ({ wifi: { mode, ready, ip } });
  const joined = decodeSettings(STATION_GET);
  assert.equal(settingsSavedMessage('887A', joined, wifi(1, true, '192.168.1.50'), false),
    'Saved. RNode 887A joined “Home” at 192.168.1.50. Apps connect to 192.168.1.50, port 7633.');
  assert.equal(settingsSavedMessage('887A', joined, wifi(1, false, null), false),
    'Saved. RNode 887A restarted but has not joined “Home” yet. Check the network name and password; the node\'s screen shows its Wi-Fi state.');
  assert.equal(settingsSavedMessage('B44E', repeater, wifi(2, true, '10.0.0.1'), true),
    'Saved. RNode B44E runs its own network “Field kit” at 10.0.0.1. Peers connect to 10.0.0.1, port 4242.');
  assert.equal(settingsSavedMessage('B44E', { ...repeater, wifi: { ...repeater.wifi, name: '' } }, wifi(2, true, '10.0.0.1'), false),
    'Saved. RNode B44E runs its own network “RNode B44E” at 10.0.0.1. Apps connect to 10.0.0.1, port 7633.');
  assert.equal(settingsSavedMessage('887A', fresh, null, false), 'Saved. RNode 887A restarted with Wi-Fi off. Bluetooth is available again.');
  assert.equal(settingsSavedMessage('887A', fresh, null, true), 'Saved. RNode 887A restarted with Wi-Fi off.');
});

// A node answering CMD_RSNODE settings frames, KISS-escaped as rsNode sends them.
function settingsPort(answers) {
  let controller;
  const written = [];
  const kiss = payload => Uint8Array.from([0xc0, ...[0x7a, ...payload].flatMap(byte => byte === 0xc0 ? [0xdb, 0xdc] : byte === 0xdb ? [0xdb, 0xdd] : [byte]), 0xc0]);
  return {
    written,
    readable: new ReadableStream({ start(value) { controller = value; } }),
    writable: new WritableStream({ write(chunk) {
      written.push(hex(chunk));
      const answer = answers.shift();
      if (answer) controller.enqueue(answer === 'error' ? Uint8Array.from([0xc0, 0x90, 0x07, 0xc0]) : kiss(answer));
    } })
  };
}

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

test('get and set travel as CMD_RSNODE sub 0x02 and 0x03 frames', async () => {
  const port = settingsPort([[0x02, 0x00, ...REPEATER_GET], [0x03, 0x00, 0x00, 0xfa], [0x03, 0x02, 0x00, 0x05], 'error', 'error']);
  const session = createRnodeSession(port);
  try {
    assert.deepEqual((await readRsnodeSettings(session)).uplink.host, 'rns.example.org');
    // The board byte 0xc0 in a value is escaped on the wire.
    const entries = [[SETTING.wifiMode, [2]], [SETTING.wifiPassword, bytes('12345678')], [SETTING.wifiChannel, [0xc0]]];
    assert.deepEqual(await writeRsnodeSettings(session, entries, 'own'), { kind: 'restart', restartMs: 250 });
    assert.deepEqual(await writeRsnodeSettings(session, [[SETTING.wifiMode, [9]]], 'own'), { kind: 'invalid', field: 'password',
      message: 'The node refused these Wi-Fi settings. Joining a network needs its name and a password of 8 to 32 characters, or none for an open network; the node\'s own network needs a password of 8 to 32 characters.' });
    // A beta without settings refuses the command.
    assert.equal(await readRsnodeSettings(session), null);
    assert.deepEqual(await writeRsnodeSettings(session, [[SETTING.wifiMode, [0]]]), { kind: 'unsupported' });
  } finally {
    await closeRnodeSession(session);
  }
  assert.equal(port.written[0], 'c07a02c0');
  assert.equal(port.written[1], 'c07a03' + '010102' + '0408' + hex(bytes('12345678')) + '0201dbdc' + 'c0');
  assert.equal(port.written[4], 'c07a03010100c0');
});

// The panel's task against stand-ins for the port, the node and the DOM it reports to.
function settingsTask(node, overrides = {}) {
  const calls = [];
  const before = { nodeId: '887A', repeater: false, settings: fresh };
  const context = {
    state: { flashing: false }, navigator: { serial: {} }, rsnodeOwnerBusy: false, rsnodeSettingsBusy: false, rsnodeChecking: false,
    rsnodeSettingsNode: before, RNODE_REPAIR_SETTLE_MS: 0, RSNODE_RESUME_MS: 100, RSNODE_TAKEOVER: 'If you just installed, press RESET on the board first.',
    HOST_OWNERS: { 0: null, 1: 'USB', 2: 'Bluetooth', 3: 'Wi-Fi' }, WIFI_MODES,
    document: { getElementById: () => ({}) },
    setRsnodeSettingsBusy: busy => calls.push(['busy', busy]),
    rsnodeSettingsMessage: (message, error, done) => calls.push(['message', message, !!error, !!done]),
    rsnodeToolPortFromUser: async () => calls.push(['port']),
    rsnodeOtherPorts: async () => [],
    openProgressLog: () => ({ log: () => {}, setStatus: status => calls.push(['status', status]) }),
    openRnodeSerialPort: async () => 'port',
    createRnodeSession: port => ({ port }),
    closeRnodeSession: async () => calls.push(['close']),
    waitForRsnode: async () => true,
    readManagementStatus: async () => ({ nodeId: node.nodeId }),
    readRsnodeStatus: async () => node.status.shift(),
    readRsnodeSettings: async () => node.settings,
    writeRsnodeSettings: async (session, entries, mode) => { calls.push(['write', entriesHex(entries), mode]); return node.outcome; },
    leaveRsnode: async () => calls.push(['leave']),
    sleepMs: async ms => calls.push(['sleep', ms]),
    renderRsnodeSettings: () => calls.push(['render']),
    readRsnodeSettingsForm: () => node.form,
    rsnodeFieldError: (field, message) => Object.assign(new Error(message), { field }),
    rsnodeSettingsField: key => ({ key, focus: () => calls.push(['focus', key]) }),
    checkSettingsForm, settingsChanges, settingsSavedMessage, showSerialWarning: () => {},
    ...overrides
  };
  const page = pageFunctions(['RSNODE_SETTINGS_RESTART_MS', 'RSNODE_WIFI_WAIT_MS', 'RSNODE_WIFI_POLL_MS', 'rsnodePortError',
    'rsnodeHeldElsewhere', 'rsnodeHeldMessage', 'rsnodePersonaNote', 'rsnodeSettingsError', 'waitForRsnodeWifi',
    'runRsnodeSettingsTask'], context);
  return { ...page, context, calls };
}

const statusOf = (repeater, hostOwner, wifi = null) => ({ node: { repeater, bluetoothAvailable: !wifi, bluetoothEnabled: true, hostOwner }, wifi });

test('Save sends the change, follows the restart, waits for Wi-Fi, then shows the node as it came back', async () => {
  const joined = decodeSettings(STATION_GET);
  const node = { nodeId: '887A', settings: joined, outcome: { kind: 'restart', restartMs: 250 },
    form: form(fresh, { wifiMode: 'join', name: 'Home', password: 'correct-horse' }),
    status: [statusOf(false, 1), statusOf(false, 1, { mode: 1, ready: false, ip: null }), statusOf(false, 0, { mode: 1, ready: true, ip: '192.168.1.50' })] };
  const task = settingsTask(node);
  await task.runRsnodeSettingsTask(true);
  assert.deepEqual(task.calls.filter(call => ['write', 'sleep', 'leave', 'render', 'close'].includes(call[0])), [
    ['write', '010101' + '0304' + hex(bytes('Home')) + '040d' + hex(bytes('correct-horse')), 'join'],
    ['sleep', 1250], ['sleep', 2000], ['leave'], ['render'], ['close']]);
  assert.ok(task.calls.some(call => call[0] === 'message' && call[1] === 'Restarting…'));
  assert.deepEqual(task.calls.filter(call => call[0] === 'message').at(-1),
    ['message', 'Saved. RNode 887A joined “Home” at 192.168.1.50. Apps connect to 192.168.1.50, port 7633.', false, true]);
  assert.deepEqual(JSON.parse(JSON.stringify(task.context.rsnodeSettingsNode)), { nodeId: '887A', repeater: false, settings: joined });
});

test('Save stops before writing when the form, the node or another app says no', async () => {
  // A field error is caught before a port is asked for.
  let task = settingsTask({ nodeId: '887A', form: form(fresh, { wifiMode: 'join', name: '' }), status: [] });
  await task.runRsnodeSettingsTask(true);
  assert.ok(!task.calls.some(call => call[0] === 'port'));
  assert.deepEqual(task.calls.filter(call => call[0] === 'focus'), [['focus', 'name']]);
  // Nothing changed: nothing is sent.
  task = settingsTask({ nodeId: '887A', form: form(fresh), status: [] });
  await task.runRsnodeSettingsTask(true);
  assert.deepEqual(task.calls.filter(call => call[0] !== 'busy'), [['message', '', false, false], ['message', 'Nothing to save yet.', false, false], ['close']]);
  // Another app holds the RNode over Bluetooth.
  const join = form(fresh, { wifiMode: 'join', name: 'Home', password: '' });
  task = settingsTask({ nodeId: '887A', form: join, status: [statusOf(false, 2)] });
  await task.runRsnodeSettingsTask(true);
  assert.ok(!task.calls.some(call => call[0] === 'write'));
  assert.deepEqual(task.calls.filter(call => call[0] === 'message').at(-1),
    ['message', 'Another app is using RNode 887A over Bluetooth. Disconnect it, or hold USB on the node, then save again.', true, false]);
  // A different node on the port.
  task = settingsTask({ nodeId: 'FFFF', form: join, status: [statusOf(false, 1)] });
  await task.runRsnodeSettingsTask(true);
  assert.equal(task.calls.filter(call => call[0] === 'message').at(-1)[1], 'This is RNode FFFF, not RNode 887A. Read its settings first.');
  // Missing STATUS prevents a settings write and cannot identify a firmware version.
  task = settingsTask({ nodeId: '887A', form: join, status: [null] });
  await task.runRsnodeSettingsTask(true);
  assert.ok(!task.calls.some(call => call[0] === 'write'));
  const unsupported = task.calls.filter(call => call[0] === 'message').at(-1)[1];
  assert.match(unsupported, /^RNode 887A did not report USB settings support\./);
  assert.match(unsupported, /use the instructions for its firmware version\./);
  assert.match(unsupported, /The Install action erases the node\./);
});

test('a refusal from the node lands on the field it names, and Unchanged says so', async () => {
  const join = form(fresh, { wifiMode: 'join', name: 'Home', password: '' });
  let task = settingsTask({ nodeId: '887A', form: join, status: [statusOf(false, 1)],
    outcome: { kind: 'invalid', field: 'name', message: 'The node refused this network name.' } });
  await task.runRsnodeSettingsTask(true);
  assert.deepEqual(task.calls.filter(call => call[0] === 'focus'), [['focus', 'name']]);
  assert.deepEqual(task.calls.filter(call => call[0] === 'message').at(-1), ['message', 'The node refused this network name.', true, false]);
  task = settingsTask({ nodeId: '887A', form: join, settings: fresh, status: [statusOf(false, 1)], outcome: { kind: 'unchanged' } });
  await task.runRsnodeSettingsTask(true);
  assert.ok(!task.calls.some(call => call[0] === 'sleep'));
  assert.equal(task.calls.filter(call => call[0] === 'message').at(-1)[1], 'Nothing changed: RNode 887A already had these settings.');
  task = settingsTask({ nodeId: '887A', form: join, status: [statusOf(false, 1)], outcome: { kind: 'refused' } });
  await task.runRsnodeSettingsTask(true);
  assert.match(task.calls.filter(call => call[0] === 'message').at(-1)[1], /^Another app is using RNode 887A over Bluetooth or Wi-Fi\./);
});

test('Read shows a Repeater as it runs, and the panel sits with the other rsNode tools', async () => {
  const task = settingsTask({ nodeId: 'B44E', settings: repeater, status: [statusOf(true, 0)] });
  await task.runRsnodeSettingsTask(false);
  assert.deepEqual(JSON.parse(JSON.stringify(task.context.rsnodeSettingsNode)), { nodeId: 'B44E', repeater: true, settings: repeater });
  assert.deepEqual(task.calls.filter(call => call[0] === 'message').at(-1), ['message', 'Showing RNode B44E. The node keeps running as a Repeater.', false, true]);
  assert.match(html, /<details class="flash-cta__repair rsnode-settings" id="rsnodeSettings" name="rsnode-tools" hidden>/);
  const panel = /id="rsnodeSettings"[\s\S]*?id="rsnodeOwner"/.exec(html)[0];
  for (const id of ['rsnodeWifiName', 'rsnodeWifiPassword', 'rsnodeWifiChannel', 'rsnodeWifiAddress', 'rsnodeWifiNetmask', 'rsnodeWifiGateway',
    'rsnodeWifiDns', 'rsnodePeersEnabled', 'rsnodePeersPort', 'rsnodeUplinkEnabled', 'rsnodeUplinkHost', 'rsnodeUplinkPort']) {
    assert.match(panel, new RegExp(`id="${id}"`), id);
  }
  // Every field the codec can name has a control.
  const fields = extract('RSNODE_SETTINGS_FIELDS');
  for (const key of ['wifiMode', 'name', 'password', 'channel', 'address', 'netmask', 'gateway', 'dns', 'peersEnabled', 'peersPort',
    'uplinkEnabled', 'uplinkHost', 'uplinkPort']) assert.match(fields, new RegExp(`\\b${key}:`), key);
  // A stored password is never shown: only whether it is set.
  assert.doesNotMatch(extract('renderRsnodeSettings'), /\.value = [^;]*password/i);
  assert.match(panel, /autocomplete="new-password"/);
});
