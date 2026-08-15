import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('public policies keep the release terms proportionate and complete', () => {
  const privacy = read('privacy.html');
  const terms = read('terms.html');
  const guidelines = read('community-guidelines.html');
  const support = read('support.html');
  const all = [privacy, terms, guidelines, support].join('\n');

  for (const document of [privacy, terms, guidelines]) {
    assert.match(document, /Effective August 15, 2026/);
  }

  assert.match(privacy, /<h3>Age eligibility<\/h3>/);
  assert.match(terms, /<h2>Eligibility<\/h2>/);
  assert.match(guidelines, /<strong>Violence and targeted harm:<\/strong>/);
  assert.match(guidelines, /<strong>Abuse and exploitation:<\/strong>/);
  assert.ok(
    guidelines.indexOf('Violence and targeted harm') <
      guidelines.indexOf('Abuse and exploitation'),
    'the conduct standard should lead with broad user safety, not one specific abuse category'
  );

  for (const control of ['Block:', 'Leave:', 'Report:']) {
    assert.ok(guidelines.includes(control), `missing ${control} control`);
  }
  assert.match(support, /mail@ratspeak\.org/);
  assert.match(support, /Do not attach illegal, exploitative, or non-consensual material/);

  for (const stale of [
    'Child sexual abuse and exploitation:',
    'Sexual exploitation and abuse:',
    'We prioritize child safety',
    'Do not attach child sexual abuse material',
    'exploit, endanger, sexualize, groom, or solicit a child'
  ]) {
    assert.ok(!all.includes(stale), `stale over-specific policy copy remains: ${stale}`);
  }
});
