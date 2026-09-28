// Operator-only upload. Never puts beta firmware in the static website tree.
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { get, put } from '@vercel/blob';

const siteRoot = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
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
  const requiredBoards = new Set(['heltec-v3', 'heltec-v4', 'heltec-v4-r8']);
  if (!Array.isArray(input.boards) || input.boards.length !== 3) throw new Error('Expected all three beta boards.');
  const prepared = [];
  for (const entry of input.boards) {
    if (!requiredBoards.delete(entry.id) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(entry.version || '') ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.zip$/.test(entry.fileName || '') ||
        !/^[a-f0-9]{64}$/.test(entry.sha256 || '') || !Number.isSafeInteger(entry.size) ||
        entry.size <= 0 || entry.size > 4 * 1024 * 1024) throw new Error('Invalid package catalog.');
    const path = await realpath(resolve(dirname(catalogPath), entry.fileName));
    if (!path.startsWith(dirname(catalogPath) + sep)) throw new Error('Package escapes its catalog directory.');
    const bytes = await readFile(path);
    if (bytes.length !== entry.size || digest(bytes) !== entry.sha256) throw new Error(`Package integrity failed: ${entry.id}`);
    prepared.push({ entry, bytes });
  }
  // Validate every local package before beginning any remote writes.
  const boards = [];
  for (const { entry, bytes } of prepared) {
    const path = `rsnode-beta/${entry.version}/${entry.sha256}/${entry.fileName}`;
    const blob = await upload(path, bytes, { ...auth, access: 'private',
      addRandomSuffix: true, allowOverwrite: false, contentType: 'application/zip' });
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
    if (verified.length !== entry.size || digest(verified) !== entry.sha256) throw new Error('Uploaded package integrity failed.');
    boards.push({ id: entry.id, version: entry.version, fileName: entry.fileName,
      size: entry.size, sha256: entry.sha256, url: url.href });
    report(`Verified private package: ${entry.id}`);
  }
  await writeFile(outputPath, JSON.stringify({ boards }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  report(`Deployment catalog written: ${outputPath}`);
  return { boards };
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
