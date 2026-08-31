import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const portRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(portRoot, '..');
const runtimeRoot = join(portRoot, 'runtime');
const distRoot = join(runtimeRoot, 'dist');
const packageJson = JSON.parse(await readFile(join(portRoot, 'package.json'), 'utf8'));
const runtimeManifest = JSON.parse(await readFile(join(runtimeRoot, 'manifest.json'), 'utf8'));
const dependencyIndex = JSON.parse(await readFile(join(portRoot, 'generated', 'dependencies', 'game-dependency-index.json'), 'utf8'));
const sourceCommit = argument('--source-commit') ?? git('rev-parse', 'HEAD');
const builtAt = git('show', '-s', '--format=%cI', sourceCommit);

if (!/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error(`Invalid source commit: ${sourceCommit}`);
await mkdir(distRoot, { recursive: true });

const entryPath = join(distRoot, 'black-souls-runtime.bundle.js');
await build({
  entryPoints: [join(runtimeRoot, 'bootstrap.js')],
  outfile: entryPath,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2022'],
  charset: 'utf8',
  legalComments: 'none',
  sourcemap: false,
  minify: false,
  banner: { js: `/* BLACK SOULS browser runtime ${packageJson.version}; source ${sourceCommit} */` },
});

const entry = await readFile(entryPath);
const entrySha256 = createHash('sha256').update(entry).digest('hex').toUpperCase();
const buildManifest = {
  schema: 'black-souls-runtime-build-v1',
  runtimeVersion: packageJson.version,
  sourceCommit,
  builtAt,
  entry: 'black-souls-runtime.bundle.js',
  entrySha256,
  entryBytes: entry.byteLength,
  runtimeManifest: '../manifest.json',
  dataVersion: runtimeManifest.data.schema,
  dependencyIndexVersion: dependencyIndex.schema,
  requiredBootData: [
    '../../generated/database/System.json',
    '../../generated/database/Tilesets.json',
    '../../generated/database/Actors.json',
    '../../generated/database/Classes.json',
    '../../generated/database/Skills.json',
    '../../generated/database/Items.json',
    '../../generated/database/Weapons.json',
    '../../generated/database/Armors.json',
    '../../generated/database/Enemies.json',
    '../../generated/database/Troops.json',
    '../../generated/database/States.json',
    '../../generated/database/CommonEvents.json',
    '../../generated/database/Animations.json',
    '../../generated/asset-manifest.json',
    '../../generated/prefetch-manifest.json',
    '../../generated/dependencies/inventory-dependencies.json',
    '../../generated/dependencies/combat-dependencies.json',
    '../../generated/dependencies/ui-dependencies.json',
  ],
};

await writeFile(join(distRoot, 'runtime-build.json'), `${JSON.stringify(buildManifest, null, 2)}\n`, 'utf8');
console.log(`Built runtime/dist/${buildManifest.entry}`);
console.log(`Runtime SHA-256 ${entrySha256}`);
console.log(`Build source commit ${sourceCommit}`);

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function git(...args) {
  return execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' }).trim();
}
