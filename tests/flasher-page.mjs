import { readFileSync } from 'node:fs';

const FLASHER_TAG = '<script type="module" src="/assets/site/flasher.js"></script>';
const flasher = readFileSync(new URL('../assets/site/flasher.js', import.meta.url), 'utf8');

// Reads a page that loads the shared flasher engine, with flasher.js inlined where the page loads it.
export function flasherPage(name) {
  const html = readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
  if (!html.includes(FLASHER_TAG)) throw new Error(`${name} does not load flasher.js`);
  return html.replace(FLASHER_TAG, () => `<script type="module">\n${flasher}</script>`);
}

// Both flasher pages, for assertions that no page may contain something.
export const allFlasherPages = () => flasherPage('download.html') + flasherPage('flash.html');
