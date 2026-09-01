import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const downloadHtml = readFileSync(new URL('../download.html', import.meta.url), 'utf8');

function extractFunction(name) {
  const start = downloadHtml.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const open = downloadHtml.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < downloadHtml.length; i += 1) {
    if (downloadHtml[i] === '{') depth += 1;
    if (downloadHtml[i] === '}') {
      depth -= 1;
      if (depth === 0) return downloadHtml.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

test('handheld factory installs always erase incompatible internal storage', () => {
  const source = extractFunction('shouldEraseBeforeFlash');
  const shouldErase = vm.runInNewContext(`(${source})`, { state: { eraseAll: false } });

  assert.equal(shouldErase({ installMode: 'factory' }), true);
  assert.equal(shouldErase({ installMode: 'update' }), false);
  assert.equal(shouldErase({}), false);
});

test('custom firmware keeps the explicit full-erase choice', () => {
  const source = extractFunction('shouldEraseBeforeFlash');
  const shouldErase = vm.runInNewContext(`(${source})`, { state: { eraseAll: true } });

  assert.equal(shouldErase({ installMode: 'update' }), true);
  assert.equal(shouldErase({}), true);
});

test('fresh-install warning matches the automatic erase behavior', () => {
  assert.match(downloadHtml, /Continuing resets the device's internal storage/);
  assert.match(downloadHtml, /eraseAll: eraseBeforeFlash/);
  assert.match(downloadHtml, /<span class="flash-option-pill__label">Full Erase<\/span>/);
});
