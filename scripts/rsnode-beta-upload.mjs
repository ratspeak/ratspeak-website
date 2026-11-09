// Operator-only upload. Never puts beta firmware in the static website tree.
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { get, put } from '@vercel/blob';

const siteRoot = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
// The board byte of each image's signed update target, as lib/rsnode-beta.js checks it.
const OTA_BOARDS = { 'heltec-v3': '3a', 'heltec-v4': '3f', 'heltec-v4-r8': 'bf', 'heltec-v4-r8-tft': 'c0' };

// A signed .rsota: its catalog entry, its bytes, and a manifest that names the same target and sequence.
async function updateBundle(entry, local) {
  const update = entry.update;
  if (!update || typeof update !== 'object' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.rsota$/.test(update.fileName || '') ||
      !Number.isSafeInteger(update.size) || update.size <= 128 || update.size > 4 * 1024 * 1024 ||
      !/^[a-f0-9]{64}$/.test(update.sha256 || '') ||
      !Number.isSafeInteger(update.sequence) || update.sequence < 1 || update.sequence > 0xffffffff ||
      !/^[a-f0-9]{2}:[a-f0-9]{2}:[a-f0-9]{2}$/.test(update.otaTarget || '') || update.otaTarget.slice(6) !== OTA_BOARDS[entry.id] ||
      !/^[a-f0-9]{16}$/.test(update.releaseKeyId || '') || !/^[\x21-\x7e]{1,24}$/.test(update.version || '')) {
    throw new Error(`Invalid update entry: ${entry.id}`);
  }
  const bytes = await local(update.fileName, update.size, update.sha256, entry.id + ' update');
  if (bytes.subarray(0, 5).toString('latin1') !== 'RSOT\x01' || bytes.subarray(5, 8).toString('hex') !== update.otaTarget.replaceAll(':', '') ||
      bytes.readUInt32BE(8) !== update.sequence || bytes.readUInt32BE(12) !== bytes.length - 128 ||
      digest(bytes.subarray(128)) !== bytes.subarray(24, 56).toString('hex')) {
    throw new Error(`Update manifest does not match its entry: ${entry.id}`);
  }
  return bytes;
}

export async function uploadBetaPackages(catalogArg, outputArg, {
  token = process.env.RSNODE_BETA_BLOB_TOKEN,
  storeId = process.env.RSNODE_BETA_BLOB_STORE_ID,
  upload = put, readPrivate = get, fetchAsset = fetch, report = console.log
} = {}) {
  const catalogPath = await realpath(catalogArg);
  const outputDir = await realpath(dirname(resolve(outputArg)));
  const outputPath = resolve(outputDir, basename(outputArg));
  if ([catalogPath, outputPath].some(path => path === siteRoot || path.startsWith(siteRoot + sep))) {
    throw new Error('Keep beta artifacts and deployment configuration outside the website directory.');
  }
  try {
    await lstat(outputPath);
    throw new Error('Choose a new output catalog path; existing candidates are never overwritten.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (storeId && !/^store_[A-Za-z0-9]{16}$/.test(storeId)) throw new Error('Invalid dedicated Blob store ID.');
  if (!token && !storeId) throw new Error('Set the dedicated RSNODE_BETA_BLOB_STORE_ID for project OIDC or RSNODE_BETA_BLOB_TOKEN.');
  const auth = storeId ? { storeId } : { token };
  const input = JSON.parse(await readFile(catalogPath, 'utf8'));
  const availableBoards = new Set(['heltec-v3', 'heltec-v4', 'heltec-v4-r8', 'heltec-v4-r8-tft', 'heltec-t114']);
  if (!Array.isArray(input.boards) || input.boards.length < 1 || input.boards.length > availableBoards.size) throw new Error('Expected one to five beta board packages.');
  const prepared = [];
  const local = async (fileName, size, sha256, id) => {
    const path = await realpath(resolve(dirname(catalogPath), fileName));
    if (!path.startsWith(dirname(catalogPath) + sep)) throw new Error('Package escapes its catalog directory.');
    const bytes = await readFile(path);
    if (bytes.length !== size || digest(bytes) !== sha256) throw new Error(`Package integrity failed: ${id}`);
    return bytes;
  };
  for (const entry of input.boards) {
    if (!availableBoards.delete(entry.id) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(entry.version || '') ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.zip$/.test(entry.fileName || '') ||
        !/^[a-f0-9]{64}$/.test(entry.sha256 || '') || !Number.isSafeInteger(entry.size) ||
        entry.size <= 0 || entry.size > 4 * 1024 * 1024) throw new Error('Invalid package catalog.');
    const bytes = await local(entry.fileName, entry.size, entry.sha256, entry.id);
    if (entry.update !== undefined && !Object.hasOwn(OTA_BOARDS, entry.id)) throw new Error(`No signed updates for ${entry.id}.`);
    const update = entry.update === undefined ? null : await updateBundle(entry, local);
    prepared.push({ entry, bytes, update });
  }
  // The guide page's private fragment, served only to signed-in testers.
  let guide = null;
  if (input.guide !== undefined) {
    const meta = input.guide;
    if (!meta || typeof meta !== 'object' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(meta.version || '') ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,126}\.html$/.test(meta.fileName || '') ||
        !/^[a-f0-9]{64}$/.test(meta.sha256 || '') || !Number.isSafeInteger(meta.size) ||
        meta.size <= 0 || meta.size > 4 * 1024 * 1024) throw new Error('Invalid guide entry.');
    const bytes = await local(meta.fileName, meta.size, meta.sha256, 'guide');
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    guide = { meta, bytes };
  }
  // Validate every local package before beginning any remote writes.
  const store = async (version, meta, bytes, contentType) => {
    const path = `rsnode-beta/${version}/${meta.sha256}/${meta.fileName}`;
    const blob = await upload(path, bytes, { ...auth, access: 'private',
      addRandomSuffix: true, allowOverwrite: false, contentType });
    const url = new URL(blob.url);
    if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.private\.blob\.vercel-storage\.com$/.test(url.hostname) ||
        url.username || url.password || url.port || url.search || url.hash || url.pathname === '/' ||
        (storeId && url.hostname !== storeId.slice(6).toLowerCase() + '.private.blob.vercel-storage.com')) {
      throw new Error('Upload did not return a private Blob URL.');
    }
    const anonymous = await fetchAsset(url, { redirect: 'manual', signal: AbortSignal.timeout(30_000) });
    await anonymous.body?.cancel();
    if (![401, 403, 404].includes(anonymous.status)) throw new Error('Anonymous Blob access was not denied.');
    // The SDK reads the current project OIDC identity; never persist that token
    // or substitute the unrelated public store's default credential.
    const stored = storeId ? await readPrivate(url.href, { ...auth, access: 'private',
      abortSignal: AbortSignal.timeout(30_000) }) : null;
    const download = storeId
      ? (stored ? new Response(stored.stream, { status: stored.statusCode || 200 }) : new Response(null, { status: 404 }))
      : await fetchAsset(url, { headers: { Authorization: `Bearer ${token}` },
        redirect: 'error', signal: AbortSignal.timeout(30_000) });
    if (!download.ok) throw new Error('Private download verification failed.');
    const verified = Buffer.from(await download.arrayBuffer());
    if (verified.length !== meta.size || digest(verified) !== meta.sha256) throw new Error('Uploaded package integrity failed.');
    return url.href;
  };
  const boards = [];
  for (const { entry, bytes, update } of prepared) {
    const url = await store(entry.version, entry, bytes, 'application/zip');
    const board = { id: entry.id, version: entry.version, fileName: entry.fileName,
      size: entry.size, sha256: entry.sha256, url };
    if (update) {
      const { fileName, size, sha256, sequence, otaTarget, releaseKeyId, version } = entry.update;
      board.update = { fileName, size, sha256, sequence, otaTarget, releaseKeyId, version,
        url: await store(entry.version, entry.update, update, 'application/octet-stream') };
    }
    boards.push(board);
    report(`Verified private package${update ? 's' : ''}: ${entry.id}`);
  }
  const output = { boards };
  if (guide) {
    const { version, fileName, size, sha256 } = guide.meta;
    output.guide = { version, fileName, size, sha256,
      url: await store(version, guide.meta, guide.bytes, 'text/html; charset=utf-8') };
    report('Verified private guide');
  }
  await writeFile(outputPath, JSON.stringify(output, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  report(`Deployment catalog written: ${outputPath}`);
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [catalogArg, outputArg] = process.argv.slice(2);
    if (!catalogArg || !outputArg || process.argv.length !== 4) throw new Error(
      'Usage: node scripts/rsnode-beta-upload.mjs /private/packages/catalog.json /private/deployment/catalog.json');
    await uploadBetaPackages(catalogArg, outputArg);
  } catch (error) {
    // The Blob SDK's diagnostics may contain request metadata. Keep tokens out
    // of operator logs, including errors returned by an upstream service.
    const message = String(error.message || 'Upload failed');
    console.error(message.replaceAll(process.env.RSNODE_BETA_BLOB_TOKEN || '\0', '[redacted]')
      .replaceAll(process.env.VERCEL_OIDC_TOKEN || '\0', '[redacted]'));
    process.exitCode = 1;
  }
}
