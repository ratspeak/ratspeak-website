export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const device = searchParams.get('device');
  const version = searchParams.get('version');

  const repos = {
    ratdeck: { repo: 'ratspeak/ratdeck', file: 'ratdeck-firmware.zip' },
    ratcom:  { repo: 'ratspeak/ratcom',  file: 'ratcom-firmware.zip' }
  };

  const cfg = repos[device];
  if (!cfg) {
    return new Response(JSON.stringify({ error: 'Unknown device' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const ghHeaders = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'ratspeak-flasher' };

  // List available releases (last 5)
  if (searchParams.get('releases') === 'true') {
    const resp = await fetch(
      `https://api.github.com/repos/${cfg.repo}/releases?per_page=5`,
      { headers: ghHeaders }
    );
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: 'Could not fetch releases' }), {
        status: 502, headers: { 'Content-Type': 'application/json' }
      });
    }
    const releases = await resp.json();
    const result = releases
      .filter(r => !r.draft && !r.prerelease)
      .map(r => {
        const asset = r.assets.find(a => a.name === cfg.file);
        return { version: r.tag_name, size: asset ? asset.size : null };
      })
      .filter(r => r.size !== null);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' }
    });
  }

  // Fetch a specific release by tag, or latest
  const releaseUrl = version
    ? `https://api.github.com/repos/${cfg.repo}/releases/tags/${version}`
    : `https://api.github.com/repos/${cfg.repo}/releases/latest`;

  const releaseResp = await fetch(releaseUrl, { headers: ghHeaders });

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
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${asset.name}"`,
      'Cache-Control': 'public, max-age=300'
    }
  });
}
