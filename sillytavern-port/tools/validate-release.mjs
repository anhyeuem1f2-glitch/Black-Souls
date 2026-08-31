import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReleaseCandidates, preflightBundle } from '../card/loader-core.js';

const portRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(portRoot, '..');
const ref = argument('--ref');
const outputPath = resolve(portRoot, argument('--output') ?? 'release/verified-runtime.json');
const fallbackRef = argument('--fallback-ref') ?? '5ac55ae9b4b983e5aa3d9f107447f975e60e059b';
const expectedRemote = 'https://github.com/anhyeuem1f2-glitch/Black-Souls.git';
if (!/^[0-9a-f]{40}$/i.test(String(ref ?? ''))) throw new Error('Usage: node tools/validate-release.mjs --ref <40-character pushed commit SHA>');

const fetchUrl = git('remote', 'get-url', 'origin');
const pushUrl = git('remote', 'get-url', '--push', 'origin');
if (fetchUrl !== expectedRemote || pushUrl !== expectedRemote) throw new Error(`Unexpected origin URLs. fetch=${fetchUrl} push=${pushUrl}`);
const remoteMain = git('ls-remote', '--heads', 'origin', 'main').split(/\s+/)[0];
if (remoteMain !== ref) throw new Error(`Commit ${ref} is not the currently pushed origin/main (${remoteMain || 'missing'}).`);
const remoteFallbackTag = git('ls-remote', 'origin', 'refs/tags/streaming-v0.4.1^{}').split(/\s+/)[0];
if (remoteFallbackTag && remoteFallbackTag !== fallbackRef) throw new Error(`Last-known-good tag resolves to ${remoteFallbackTag}, expected ${fallbackRef}.`);

const candidates = createReleaseCandidates({
  owner: 'anhyeuem1f2-glitch', repository: 'Black-Souls', currentRef: ref,
  currentSha256: null, fallbackRef: null,
});
const sources = [];
let canonical = null;
for (let index = 0; index < candidates.length; index += 1) {
  const candidate = { ...candidates[index], expectedSha256: canonical?.entrySha256 ?? null };
  const requests = [];
  try {
    const preflight = await retry(() => preflightBundle(candidate, { requests }), 4, 2500);
    canonical ??= preflight;
    if (preflight.entrySha256 !== canonical.entrySha256) throw new Error(`CDN sources disagree on runtime SHA-256 for ${ref}.`);
    sources.push({
      id: candidate.id, label: candidate.label, role: index === 0 ? 'primary' : 'fallback', ok: true,
      baseUrl: candidate.baseUrl, manifestUrl: candidate.manifestUrl, entryUrl: preflight.entryUrl,
      requests,
    });
  } catch (error) {
    sources.push({
      id: candidate.id, label: candidate.label, role: index === 0 ? 'primary' : 'fallback', ok: false,
      baseUrl: candidate.baseUrl, manifestUrl: candidate.manifestUrl, error: String(error?.message || error), requests,
    });
  }
}

if (!canonical || !sources.some((source) => source.role === 'primary' && source.ok) || !sources.some((source) => source.role === 'fallback' && source.ok)) {
  throw new Error(`Release ${ref} failed primary/fallback CDN verification:\n${JSON.stringify(sources, null, 2)}`);
}
const verification = {
  schema: 'black-souls-verified-runtime-v1',
  verified: true,
  verifiedAt: new Date().toISOString(),
  repository: { owner: 'anhyeuem1f2-glitch', name: 'Black-Souls', fetchUrl, pushUrl },
  ref,
  remoteMainAtVerification: remoteMain,
  runtimeVersion: canonical.manifest.runtimeVersion,
  sourceCommit: canonical.manifest.sourceCommit,
  buildManifest: 'sillytavern-port/runtime/dist/runtime-build.json',
  entry: `sillytavern-port/runtime/dist/${canonical.manifest.entry}`,
  entrySha256: canonical.entrySha256,
  entryBytes: canonical.manifest.entryBytes,
  dataVersion: canonical.manifest.dataVersion,
  dependencyIndexVersion: canonical.manifest.dependencyIndexVersion,
  fallbackRef,
  fallbackTag: 'streaming-v0.4.1',
  fallbackMode: 'legacy-module',
  sources,
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(verification, null, 2)}\n`, 'utf8');
console.log(`Verified pushed runtime ${ref}`);
console.log(`Runtime SHA-256 ${verification.entrySha256}`);
console.log(`Wrote ${outputPath}`);

async function retry(operation, attempts, delayMs) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return await operation(); }
    catch (error) { lastError = error; if (attempt < attempts) await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs)); }
  }
  throw lastError;
}
function argument(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
function git(...args) { return execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' }).trim(); }
