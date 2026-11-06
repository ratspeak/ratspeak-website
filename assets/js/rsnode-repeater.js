// A Repeater set up over USB (rsNode ADR 0016): CMD_RSNODE IDENTITY, REPEATER_SETUP and
// REPEATER_CONTROL as rsNode's messaging-management interfaces §6 define them. A USB connection
// proves possession, so it stands in for the board's button. Refusals carry the settings reasons.
import { RSNODE_RESULT, rsnodeCommand } from './rsnode-device.js';
import { SETTINGS_REASONS, checkSettingsForm, decodeSettings, encodeEntries, settingsForm } from './rsnode-settings.js';
import { destinationHash, identityHash } from './rsnode-card.js';
import { parseHash } from './rsnode-provision.js';

const SUB_IDENTITY = 0x04;
const SUB_REPEATER_SETUP = 0x05;
const SUB_REPEATER_CONTROL = 0x06;
const KEY_LEN = 64;
const HASH_LEN = 16;
const IDENTITY_FIXED_LEN = 1 + KEY_LEN + 3 * HASH_LEN + 1;

/** REPEATER_SETUP entry ids. */
export const SETUP = Object.freeze({ region: 0x01, preset: 0x02, frequency: 0x03, bandwidth: 0x04, spreadingFactor: 0x05,
  codingRate: 0x06, txPower: 0x07, limits: 0x08, accepted: 0x09, start: 0x0a });
/** LIMITS wire values. */
export const LIMITS = Object.freeze({ default: 0, custom: 1, off: 2 });
const CONTROL = Object.freeze({ start: 1, stop: 2, exit: 3 });

/** rsNode's repeater_catalog REGIONS: persistence id, default frequency, and whether it is above 800 MHz. */
export const REPEATER_REGIONS = Object.freeze([
  { id: 1, key: 'americas', label: 'Americas 915', frequency: 915000000, highBand: true },
  { id: 2, key: 'europe', label: 'Europe 868', frequency: 868000000, highBand: true },
  { id: 3, key: 'uhf_433', label: '433 UHF', frequency: 433000000, highBand: false },
  { id: 4, key: 'australia', label: 'Australia 915', frequency: 915000000, highBand: true },
  { id: 5, key: 'asia', label: 'Asia 923', frequency: 923000000, highBand: true }
]);
/** rsNode's repeater_catalog PRESETS, in catalog order: the index is the wire value. */
export const REPEATER_PRESETS = Object.freeze([
  { key: 'medium_fast', label: 'Medium Fast', spreadingFactor: 9, bandwidth: 250000, codingRate: 5 },
  { key: 'short_turbo', label: 'Short Turbo', spreadingFactor: 7, bandwidth: 500000, codingRate: 5 },
  { key: 'short_fast', label: 'Short Fast', spreadingFactor: 7, bandwidth: 250000, codingRate: 5 },
  { key: 'short_slow', label: 'Short Slow', spreadingFactor: 8, bandwidth: 250000, codingRate: 5 },
  { key: 'medium_slow', label: 'Medium Slow', spreadingFactor: 10, bandwidth: 250000, codingRate: 5 },
  { key: 'long_turbo', label: 'Long Turbo', spreadingFactor: 11, bandwidth: 500000, codingRate: 8 },
  { key: 'long_fast', label: 'Long Fast', spreadingFactor: 11, bandwidth: 250000, codingRate: 5 },
  { key: 'long_moderate', label: 'Long Moderate', spreadingFactor: 11, bandwidth: 125000, codingRate: 8 }
]);

const u16 = bytes => (bytes[0] << 8) | bytes[1];
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

/** The regions a board's radio offers: Heltec V4 boards have no 433 MHz path. */
export function repeaterRegions(board) {
  return board && board.id && board.id.startsWith('heltec-v4') ? REPEATER_REGIONS.filter(region => region.highBand) : REPEATER_REGIONS;
}

/** The radio a region and preset give, as the panel shows it. */
export function repeaterRadioLine(regionId, presetIndex) {
  const region = REPEATER_REGIONS.find(entry => entry.id === regionId), preset = REPEATER_PRESETS[presetIndex];
  if (!region || !preset) return '';
  return `${(region.frequency / 1e6).toFixed(3)} MHz · ${preset.bandwidth / 1000} kHz · SF${preset.spreadingFactor} · CR 4/${preset.codingRate}`;
}

/**
 * REPEATER_SETUP's entries, in the order the node applies them: region, preset, LIMITS, the
 * local-rules acceptance, then whether to start. limits is { mode, txPower, dutyCycle }.
 */
export function repeaterSetupEntries({ region, preset, limits, accepted, start }) {
  if (!REPEATER_REGIONS.some(entry => entry.id === region)) throw new Error('Choose a region.');
  if (!Number.isInteger(preset) || !REPEATER_PRESETS[preset]) throw new Error('Choose a preset.');
  if (!Object.hasOwn(LIMITS, limits.mode)) throw new Error('Choose LIMITS.');
  let value = [LIMITS[limits.mode]];
  if (limits.mode === 'custom') {
    if (!Number.isInteger(limits.txPower) || limits.txPower < -9 || limits.txPower > 30) throw new Error('Choose a power limit from -9 to 30 dBm.');
    value = [LIMITS.custom, limits.txPower & 0xff, limits.dutyCycle ? 1 : 0];
  }
  const entries = [[SETUP.region, [region]], [SETUP.preset, [preset]], [SETUP.limits, value]];
  if (accepted) entries.push([SETUP.accepted, [1]]);
  entries.push([SETUP.start, [start ? 1 : 0]]);
  return entries;
}

// The panel field an entry's id names.
const SETUP_FIELDS = { 0x01: 'region', 0x02: 'preset', 0x03: 'preset', 0x04: 'preset', 0x05: 'preset', 0x06: 'preset',
  0x07: 'limits', 0x08: 'limits', 0x09: 'accepted', 0x0a: null };
const UNREADABLE = 'The node could not read the request. Nothing changed.';
const START_TEXT = 'The node could not start the Repeater with these settings. Try DEFAULT LIMITS or another preset.';
const VALUE_TEXT = { region: 'The node refused this region.', preset: 'The node refused this preset.',
  limits: 'The node refused these LIMITS.', accepted: 'Accept the local rules notice to use these LIMITS.' };

/** A REPEATER_SETUP refusal [id, reason] as { field, message }; id 0 is the request as a whole. */
export function repeaterSetupRefusal(body) {
  if (body.length !== 2) return { field: null, message: UNREADABLE };
  const [id, code] = body;
  const reason = SETTINGS_REASONS[code] || 'value';
  const field = SETUP_FIELDS[id] === undefined ? null : SETUP_FIELDS[id];
  if (reason === 'malformed' || reason === 'duplicate') return { field: null, message: UNREADABLE };
  if (reason === 'unknownId') return { field: null, message: 'This firmware cannot set up a Repeater over USB. Update it first.' };
  if (reason === 'confirmOnDevice') return { field: null, message: 'Confirm this change on the device.' };
  if (reason === 'radio') return { field: field === 'limits' ? 'limits' : 'preset', message: 'This board cannot use this region and preset.' };
  if (field === 'accepted') return { field, message: VALUE_TEXT.accepted };
  if (reason === 'transport' || id === SETUP.start || !field) return { field: null, message: START_TEXT };
  return { field, message: VALUE_TEXT[field] };
}

function outcome(reply, refusal) {
  if (!reply) return { kind: 'unsupported' };
  const { result, body } = reply;
  if (result === RSNODE_RESULT.ok) {
    if (body.length === 2) return { kind: 'restart', restartMs: u16(body) };
    if (body.length === 0) return { kind: 'done' };
    return { kind: 'uncertain', message: 'The node\'s reply was incomplete. Read its status before retrying.' };
  }
  if (result === RSNODE_RESULT.invalid) return { kind: 'invalid', ...refusal(body) };
  if (result === RSNODE_RESULT.refused) return { kind: 'refused' };
  if (result === RSNODE_RESULT.busy) return { kind: 'busy' };
  if (result === RSNODE_RESULT.storage) return { kind: 'storage' };
  if (result === RSNODE_RESULT.unsupported || result === RSNODE_RESULT.unavailable) return { kind: 'unsupported' };
  return { kind: 'failed', result };
}

/** A REPEATER_SETUP reply: restart (with its delay), saved without a restart, or why it was refused. */
export const repeaterSetupOutcome = reply => outcome(reply, repeaterSetupRefusal);

export async function writeRepeaterSetup(session, entries) {
  return repeaterSetupOutcome(await rsnodeCommand(session, SUB_REPEATER_SETUP, encodeEntries(entries)));
}

/** REPEATER_CONTROL: start, stop (forwarding only), or exit to RNode mode. */
export async function controlRepeater(session, action) {
  if (!Object.hasOwn(CONTROL, action)) throw new Error(`unknown Repeater action ${action}`);
  return outcome(await rsnodeCommand(session, SUB_REPEATER_CONTROL, [CONTROL[action]]),
    () => ({ field: null, message: action === 'start' ? START_TEXT : 'The node refused this.' }));
}

/**
 * IDENTITY's body: { present: false } before the first Owner, else the node's public key and
 * hashes, each checked against the key.
 */
export async function parseRsnodeIdentity(body) {
  if (body.length === 1 && body[0] === 0) return { present: false };
  if (body.length < IDENTITY_FIXED_LEN || body[0] !== 1) throw new Error(`malformed rsNode identity length=${body.length}`);
  const publicKey = Uint8Array.from(body.slice(1, 1 + KEY_LEN));
  const at = offset => hex(body.slice(offset, offset + HASH_LEN));
  const lxmf = at(1 + KEY_LEN), identity = at(1 + KEY_LEN + HASH_LEN), manage = at(1 + KEY_LEN + 2 * HASH_LEN);
  const nameLen = body[IDENTITY_FIXED_LEN - 1];
  if (body.length !== IDENTITY_FIXED_LEN + nameLen) throw new Error('malformed rsNode identity name');
  let name;
  try { name = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(body.slice(IDENTITY_FIXED_LEN))); } catch {
    throw new Error('malformed rsNode identity name');
  }
  const identityBytes = await identityHash(publicKey);
  if (hex(identityBytes) !== identity) throw new Error('rsNode identity hash does not match its public key');
  if (hex(await destinationHash('lxmf.delivery', identityBytes)) !== lxmf) throw new Error('rsNode LXMF address does not match its public key');
  if (hex(await destinationHash('rsnode.manage', identityBytes)) !== manage) throw new Error('rsNode management destination does not match its public key');
  return { present: true, publicKey, lxmf, identity, manage, name };
}

/** IDENTITY; null on firmware that predates it. */
export async function readRsnodeIdentity(session) {
  const reply = await rsnodeCommand(session, SUB_IDENTITY);
  if (!reply || reply.result !== RSNODE_RESULT.ok) return null;
  return parseRsnodeIdentity(reply.body);
}

// A node with nothing set, for checking the panel's Wi-Fi and uplink before a node is read.
const BLANK_SETTINGS = decodeSettings([]);
const LIMITS_TEXT = { off: 'Off', default: 'Default', custom: 'Custom' };

/**
 * The settings form a "reach it from anywhere" choice gives: join the network and turn the
 * uplink on, keeping everything else. An empty password keeps the stored one for the same network.
 */
export function repeaterSettingsForm(form, settings = BLANK_SETTINGS) {
  const wifi = settings.wifi;
  const keep = form.wifiPassword === '' && wifi.mode === 1 && wifi.name === form.wifiName && wifi.passwordSet;
  return { ...settingsForm(settings), wifiMode: 'join', name: form.wifiName, password: keep ? null : form.wifiPassword,
    uplinkEnabled: true, uplinkHost: form.uplinkHost, uplinkPort: form.uplinkPort };
}

/** The first thing to fix in the panel, as { field, message }, or null. */
export function checkRepeaterForm(form) {
  const problem = (field, message) => ({ field, message });
  if (!REPEATER_REGIONS.some(region => region.id === form.region)) return problem('region', 'Choose the region where the node will run.');
  if (form.limits.mode === 'custom' && !(Number.isInteger(form.limits.txPower) && form.limits.txPower >= -9 && form.limits.txPower <= 30)) {
    return problem('limitsPower', 'Enter a power limit from -9 to 30 dBm.');
  }
  if (!form.accepted) return problem('accepted', 'Accept the local rules notice to start the Repeater.');
  if (!form.card) {
    if (!form.owner.trim()) return problem('owner', 'Paste your Ratspeak LXMF address, or scan your contact card.');
    try { parseHash(form.owner); } catch { return problem('owner', 'An LXMF address is 32 hexadecimal characters. Copy yours from Ratspeak.'); }
  }
  if (form.remote) return checkSettingsForm(repeaterSettingsForm(form), BLANK_SETTINGS, true);
  return null;
}

/** The Owner to enrol: a scanned card's address and key, or a typed address alone. */
export function repeaterOwner(form) {
  if (form.card) return { address: parseHash(form.card.lxmf), publicKey: form.card.publicKey };
  return { address: parseHash(form.owner), publicKey: null };
}

/** The line beside Start. */
export function repeaterSummary(form) {
  const region = REPEATER_REGIONS.find(entry => entry.id === form.region), preset = REPEATER_PRESETS[form.preset];
  if (!region || !preset) return 'Choose a region to start.';
  return `Starts on ${region.label} with ${preset.label}, LIMITS ${LIMITS_TEXT[form.limits.mode]}.`;
}

/** What a started node says, once it is back and its STATUS says where it stands. */
export function repeaterStartedMessage(nodeId, status, form) {
  const name = `RNode ${nodeId}`;
  if (!status || !status.node || !status.node.repeater) {
    return `${name} saved the Repeater settings but is not running as a Repeater. Check its screen.`;
  }
  if (!form.remote) return `${name} runs as a Repeater.`;
  const wifi = status.wifi;
  if (!wifi || wifi.mode !== 1 || !wifi.ready || !wifi.ip) {
    return `${name} runs as a Repeater but has not joined “${form.wifiName}” yet. Check the network name and password; its screen shows its Wi-Fi state.`;
  }
  return `${name} runs as a Repeater. It joined “${form.wifiName}” at ${wifi.ip} and connects to ${form.uplinkHost.trim()}, port ${Number(form.uplinkPort)}.`;
}
