export default async function handler(req) {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const device = searchParams.get('device');

  const repos = {
    ratdeck: { repo: 'defidude/Ratdeck', file: 'ratdeck-firmware.bin' },
    ratcom:  { repo: 'defidude/RatCom',  file: 'ratcom-firmware.bin' }
  };

  const config = repos[device];
  if (!config) {
    return new Response(JSON.stringify({ error: 'Unknown device' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Fetch latest release metadata from GitHub API (CORS-safe server-side)
  const releaseResp = await fetch(
    `https://api.github.com/repos/${config.repo}/releases/latest`,
    { headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'ratspeak-flasher' } }
  );

  if (!releaseResp.ok) {
    return new Response(JSON.stringify({ error: 'Release not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const release = await releaseResp.json();
  const asset = release.assets.find(a => a.name === config.file);

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

  // Otherwise, download the binary and stream it back
  const binResp = await fetch(asset.browser_download_url, {
    headers: { 'User-Agent': 'ratspeak-flasher' }
  });

  if (!binResp.ok) {
    return new Response(JSON.stringify({ error: 'Download failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(binResp.body, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${asset.name}"`,
      'Content-Length': asset.size.toString(),
      'Cache-Control': 'public, max-age=300'
    }
  });
}
