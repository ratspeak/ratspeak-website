import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { loadPublishedSnapshot, mapPathname, pruneExpiredNodes } from '../lib/map-live-snapshot.js';
import { buildMapSvg } from '../lib/og-map-render.js';

const FALLBACK_IMAGE = '/assets/seo/og-home.png';
const CACHE_DAILY = 'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400';
const CACHE_FALLBACK = 'public, max-age=0, s-maxage=300';

let assets;

function loadAssets() {
  if (assets === undefined) {
    try {
      assets = {
        land: JSON.parse(readFileSync(new URL('../scripts/data/ne_110m_land.geojson', import.meta.url), 'utf8')),
        countries: JSON.parse(readFileSync(new URL('../scripts/data/ne_110m_admin_0_countries.geojson', import.meta.url), 'utf8')),
        fontPath: tracedFontPath()
      };
    } catch (error) {
      console.error('OG map asset load failed', error);
      assets = null;
    }
  }
  return assets;
}

function tracedFontPath() {
  const url = new URL('../lib/fonts/JetBrainsMono-Medium.ttf', import.meta.url);
  readFileSync(url); // readFileSync(new URL(...)) is the pattern Vercel's file tracer bundles from
  return fileURLToPath(url);
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let snapshot = null;
  try {
    snapshot = pruneExpiredNodes(await loadPublishedSnapshot(process.env.BLOB_READ_WRITE_TOKEN, mapPathname()));
  } catch (error) {
    console.error('OG map snapshot read failed', error);
  }

  const geo = loadAssets();
  if (!geo || !snapshot?.nodes?.length) {
    res.setHeader('Cache-Control', CACHE_FALLBACK);
    return res.redirect(302, FALLBACK_IMAGE);
  }

  let png;
  try {
    const svg = buildMapSvg(snapshot, geo);
    png = new Resvg(svg, {
      font: {
        fontFiles: [geo.fontPath],
        defaultFontFamily: 'JetBrains Mono',
        loadSystemFonts: false
      }
    }).render().asPng();
  } catch (error) {
    console.error('OG map render failed', error);
    res.setHeader('Cache-Control', CACHE_FALLBACK);
    return res.redirect(302, FALLBACK_IMAGE);
  }

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', CACHE_DAILY);
  res.setHeader('Content-Length', png.length);
  return req.method === 'HEAD' ? res.status(200).end() : res.status(200).send(png);
}
