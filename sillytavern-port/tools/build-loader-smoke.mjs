import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const portRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtimeBuild = JSON.parse(await readFile(join(portRoot, 'runtime', 'dist', 'runtime-build.json'), 'utf8'));
const result = await build({
  entryPoints: [join(portRoot, 'card', 'card-entry.js')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: ['es2022'],
  charset: 'utf8',
  legalComments: 'none',
  define: {
    __BLACK_SOULS_RUNTIME_REF__: JSON.stringify('development-loader-smoke'),
    __BLACK_SOULS_RUNTIME_SHA256__: JSON.stringify(runtimeBuild.entrySha256),
  },
});
const output = join(portRoot, 'generated', 'dev-card-loader.bundle.js');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, result.outputFiles[0].contents);
console.log('Built generated/dev-card-loader.bundle.js');
