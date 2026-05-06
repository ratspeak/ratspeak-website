export const config = { runtime: 'edge' };

const ghHeaders = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'ratspeak-flasher' };
const RNODE_REPO = 'markqvist/RNode_Firmware';

// Friendly variant names for RNode firmware filenames.
// Used to render a human-readable picker; falls back to the raw filename.
const RNODE_VARIANT_LABELS = {
  'rnode_firmware.zip':                  'Original RNode (AVR)',
  'rnode_firmware_esp32_generic.zip':    'Generic ESP32',
  'rnode_firmware_featheresp32.zip':     'Adafruit Feather ESP32',
  'rnode_firmware_t3s3.zip':             'LilyGO LoRa32 T3S3 (SX1262/SX1268)',
  'rnode_firmware_t3s3_sx127x.zip':      'LilyGO LoRa32 T3S3 (SX127x)',
  'rnode_firmware_t3s3_sx1280_pa.zip':   'LilyGO LoRa32 T3S3 (SX1280 + PA, 2.4 GHz)',
  'rnode_firmware_ng21.zip':             'LilyGO LoRa32 NG21',
  'rnode_firmware_ng20.zip':             'LilyGO LoRa32 NG20',
  'rnode_firmware_lora32v10.zip':        'LilyGO LoRa32 v1.0',
  'rnode_firmware_lora32v20.zip':        'LilyGO LoRa32 v2.0',
  'rnode_firmware_lora32v20_extled.zip': 'LilyGO LoRa32 v2.0 (external LED)',
  'rnode_firmware_lora32v21.zip':        'LilyGO LoRa32 v2.1',
  'rnode_firmware_lora32v21_extled.zip': 'LilyGO LoRa32 v2.1 (external LED)',
  'rnode_firmware_lora32v21_tcxo.zip':   'LilyGO LoRa32 v2.1 (TCXO)',
  'rnode_firmware_heltec32v2.zip':       'Heltec LoRa32 v2',
  'rnode_firmware_heltec32v3.zip':       'Heltec LoRa32 v3',
  'rnode_firmware_heltec32v4pa.zip':     'Heltec LoRa32 v4 (PA)',
  'rnode_firmware_heltec_t114.zip':      'Heltec Mesh Node T114',
  'rnode_firmware_tbeam.zip':            'LilyGO T-Beam',
  'rnode_firmware_tbeam_sx1262.zip':     'LilyGO T-Beam (SX1262)',
  'rnode_firmware_tbeam_supreme.zip':    'LilyGO T-Beam Supreme',
  'rnode_firmware_tdeck.zip':            'LilyGO T-Deck',
  'rnode_firmware_techo.zip':            'LilyGO T-Echo',
  'rnode_firmware_rak4631.zip':          'RAK4631',
  'rnode_firmware_rak4631_sx1280.zip':   'RAK4631 (SX1280)',
  'rnode_firmware_opencom_xl.zip':       'openCom XL',
  'rnode_firmware_xiao_esp32s3.zip':     'Seeed XIAO ESP32-S3 + Wio-SX1262'
};

// The website flasher is Web Serial + esptool-js, so only expose ESP32-family
// RNode assets. AVR and nRF52 packages need avrdude / nrfutil-style flows.
const RNODE_WEB_ESP_ASSETS = new Set([
  'rnode_firmware_esp32_generic.zip',
  'rnode_firmware_featheresp32.zip',
  'rnode_firmware_t3s3.zip',
  'rnode_firmware_t3s3_sx127x.zip',
  'rnode_firmware_t3s3_sx1280_pa.zip',
  'rnode_firmware_ng21.zip',
  'rnode_firmware_ng20.zip',
  'rnode_firmware_lora32v10.zip',
  'rnode_firmware_lora32v20.zip',
  'rnode_firmware_lora32v20_extled.zip',
  'rnode_firmware_lora32v21.zip',
  'rnode_firmware_lora32v21_extled.zip',
  'rnode_firmware_lora32v21_tcxo.zip',
  'rnode_firmware_heltec32v2.zip',
  'rnode_firmware_heltec32v3.zip',
  'rnode_firmware_heltec32v4pa.zip',
  'rnode_firmware_tbeam.zip',
  'rnode_firmware_tbeam_sx1262.zip',
  'rnode_firmware_tbeam_supreme.zip',
  'rnode_firmware_tdeck.zip',
  'rnode_firmware_xiao_esp32s3.zip'
]);

function variantLabel(filename) {
  return RNODE_VARIANT_LABELS[filename] || filename.replace(/^rnode_firmware_?/, '').replace(/\.zip$/, '') || filename;
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const source = searchParams.get('source') || 'ratspeak';
  const device = searchParams.get('device');
  const version = searchParams.get('version');
  const asset = searchParams.get('asset');

  // ── Source: RNode firmware (markqvist) ──────────────
  if (source === 'rnode') {
    return handleRnode({ searchParams, version, asset });
  }

  // ── Source: Ratspeak (ratdeck / ratcom) ─────────────
  const repos = {
    ratdeck: { repo: 'ratspeak/ratdeck', file: 'ratdeck-firmware.zip' },
    ratcom:  { repo: 'ratspeak/ratcom',  file: 'ratcom-firmware.zip' }
  };

  const cfg = repos[device];
  if (!cfg) {
    return jsonResponse({ error: 'Unknown device' }, 400);
  }

  // List available releases (last 5)
  if (searchParams.get('releases') === 'true') {
    const resp = await fetch(
      `https://api.github.com/repos/${cfg.repo}/releases?per_page=5`,
      { headers: ghHeaders }
    );
    if (!resp.ok) return jsonResponse({ error: 'Could not fetch releases' }, 502);
    const releases = await resp.json();
    const result = releases
      .filter(r => !r.draft && !r.prerelease)
      .map(r => {
        const a = r.assets.find(x => x.name === cfg.file);
        return { version: r.tag_name, size: a ? a.size : null };
      })
      .filter(r => r.size !== null);
    return jsonResponse(result, 200, { 'Cache-Control': 'public, max-age=300' });
  }

  const releaseUrl = version
    ? `https://api.github.com/repos/${cfg.repo}/releases/tags/${version}`
    : `https://api.github.com/repos/${cfg.repo}/releases/latest`;

  const releaseResp = await fetch(releaseUrl, { headers: ghHeaders });
  if (!releaseResp.ok) return jsonResponse({ error: 'Release not found', status: releaseResp.status }, 404);

  const release = await releaseResp.json();
  const releaseAsset = release.assets.find(a => a.name === cfg.file);
  if (!releaseAsset) return jsonResponse({ error: 'Firmware binary not in release' }, 404);

  if (searchParams.get('info') === 'true') {
    return jsonResponse({
      version: release.tag_name,
      fileName: releaseAsset.name,
      size: releaseAsset.size
    });
  }

  return streamAsset(releaseAsset);
}

async function handleRnode({ searchParams, version, asset }) {
  // List variants (assets) for a release
  if (searchParams.get('variants') === 'true') {
    const releaseUrl = version
      ? `https://api.github.com/repos/${RNODE_REPO}/releases/tags/${version}`
      : `https://api.github.com/repos/${RNODE_REPO}/releases/latest`;
    const resp = await fetch(releaseUrl, { headers: ghHeaders });
    if (!resp.ok) return jsonResponse({ error: 'RNode release not found', status: resp.status }, 404);
    const release = await resp.json();
    const variants = release.assets
      .filter(a => RNODE_WEB_ESP_ASSETS.has(a.name))
      .map(a => ({
        name: a.name,
        label: variantLabel(a.name),
        size: a.size,
        sha256: a.digest && a.digest.startsWith('sha256:') ? a.digest.slice(7) : null
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return jsonResponse({
      version: release.tag_name,
      published: release.published_at,
      variants: variants
    }, 200, { 'Cache-Control': 'public, max-age=300' });
  }

  // List recent releases
  if (searchParams.get('releases') === 'true') {
    const resp = await fetch(
      `https://api.github.com/repos/${RNODE_REPO}/releases?per_page=5`,
      { headers: ghHeaders }
    );
    if (!resp.ok) return jsonResponse({ error: 'Could not fetch releases' }, 502);
    const releases = await resp.json();
    const result = releases
      .filter(r => !r.draft && !r.prerelease)
      .map(r => ({
        version: r.tag_name,
        published: r.published_at,
        variants: r.assets.filter(a => RNODE_WEB_ESP_ASSETS.has(a.name)).length
      }))
      .filter(r => r.variants > 0);
    return jsonResponse(result, 200, { 'Cache-Control': 'public, max-age=300' });
  }

  // Download a specific variant
  if (!asset) return jsonResponse({ error: 'Missing asset parameter' }, 400);
  if (!/^rnode_firmware.*\.zip$/i.test(asset)) {
    return jsonResponse({ error: 'Invalid RNode asset name' }, 400);
  }
  if (!RNODE_WEB_ESP_ASSETS.has(asset)) {
    return jsonResponse({ error: 'This RNode asset is not supported by the ESP32 web flasher' }, 400);
  }

  const releaseUrl = version
    ? `https://api.github.com/repos/${RNODE_REPO}/releases/tags/${version}`
    : `https://api.github.com/repos/${RNODE_REPO}/releases/latest`;
  const releaseResp = await fetch(releaseUrl, { headers: ghHeaders });
  if (!releaseResp.ok) return jsonResponse({ error: 'Release not found' }, 404);
  const release = await releaseResp.json();
  const found = release.assets.find(a => a.name === asset);
  if (!found) return jsonResponse({ error: 'Asset not in release' }, 404);

  if (searchParams.get('info') === 'true') {
    return jsonResponse({
      version: release.tag_name,
      fileName: found.name,
      size: found.size,
      label: variantLabel(found.name),
      sha256: found.digest && found.digest.startsWith('sha256:') ? found.digest.slice(7) : null
    });
  }

  return streamAsset(found);
}

async function streamAsset(asset) {
  const binResp = await fetch(asset.browser_download_url, {
    headers: { 'User-Agent': 'ratspeak-flasher' }
  });
  if (!binResp.ok) return jsonResponse({ error: 'Download failed', status: binResp.status }, 502);
  return new Response(binResp.body, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${asset.name}"`,
      'Cache-Control': 'public, max-age=300'
    }
  });
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders }
  });
}
