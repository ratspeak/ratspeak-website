export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const device = searchParams.get('device');

  const repos = {
    ratdeck: { repo: 'defidude/Ratdeck', file: 'ratdeck-firmware.bin' },
    ratcom:  { repo: 'defidude/RatCom',  file: 'ratcom-firmware.bin' }
  };

  const cfg = repos[device];
  if (!cfg) {
    return new Response(JSON.stringify({ error: 'Unknown device' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Fetch latest release metadata from GitHub API
  const releaseResp = await fetch(
    `https://api.github.com/repos/${cfg.repo}/releases/latest`,
    { headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'ratspeak-flasher' } }
  );

  if (!releaseResp.ok) {
    return new Response(JSON.stringify({ error: 'Release not found', status: releaseResp.status }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const release = await releaseResp.json();
  const asset = release.assets.find(a => a.name === cfg.file);

  if (!asset) {
    return new Response(JSON.stringify({ error: 'Firmware binary not in release' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // If ?info=true, return metadata only (version, size)
  if (searchParams.get('info') === 'true') {
    return new Response(JSON.stringify({
      version: release.tag_name,
      fileName: asset.name,
      size: asset.size
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Download the binary and stream it back
  const binResp = await fetch(asset.browser_download_url, {
    headers: { 'User-Agent': 'ratspeak-flasher' }
  });

  if (!binResp.ok) {
    return new Response(JSON.stringify({ error: 'Download failed', status: binResp.status }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(binResp.body, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${asset.name}"`,
      'Cache-Control': 'public, max-age=300'
    }
  });
}
