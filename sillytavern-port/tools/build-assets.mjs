import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const portRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(portRoot, '..');
const generatedRoot = join(portRoot, 'generated');
const { stdout } = await exec('git', ['ls-tree', '-r', '--name-only', '-z', 'HEAD'], { cwd: repoRoot, encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 });
const paths = stdout.toString('utf8').split('\0').filter(Boolean);
const assets = paths.filter((path) => /^(Graphics|Audio)\//.test(path)).map((path) => ({ path, category: path.split('/').slice(0, 2).join('/'), extension: extname(path).slice(1).toLowerCase() }));
const available = new Set(assets.map((asset) => stripExtension(asset.path).toLocaleLowerCase()));

const requirements = new Map();
const requireAsset = (basePath, source) => {
  if (!basePath || /\/$/.test(basePath)) return;
  const key = basePath.toLocaleLowerCase();
  const item = requirements.get(key) ?? { basePath, sources: new Set() };
  item.sources.add(source);
  requirements.set(key, item);
};

const tilesets = await json(join(generatedRoot, 'database', 'Tilesets.json'));
for (const tileset of tilesets.filter(Boolean)) {
  for (const name of tileset.tileset_names ?? []) if (name) requireAsset(`Graphics/Tilesets/${name}`, `tileset:${tileset.id}`);
}
const actors = await json(join(generatedRoot, 'database', 'Actors.json'));
for (const actor of actors.filter(Boolean)) {
  if (actor.character_name) requireAsset(`Graphics/Characters/${actor.character_name}`, `actor:${actor.id}`);
  if (actor.face_name) requireAsset(`Graphics/Faces/${actor.face_name}`, `actor:${actor.id}`);
}
for (let id = 1; id <= 150; id += 1) {
  const map = await json(join(generatedRoot, 'maps', `${String(id).padStart(3, '0')}.json`));
  if (map.parallax_name) requireAsset(`Graphics/Parallaxes/${map.parallax_name}`, `map:${id}`);
  if (map.bgm?.name) requireAsset(`Audio/BGM/${map.bgm.name}`, `map:${id}`);
  if (map.bgs?.name) requireAsset(`Audio/BGS/${map.bgs.name}`, `map:${id}`);
  for (const event of Object.values(map.events ?? {})) {
    for (const page of event.pages ?? []) if (page.graphic?.character_name) requireAsset(`Graphics/Characters/${page.graphic.character_name}`, `map:${id}:event:${event.id}`);
  }
}

const directReferences = [...requirements.values()].map((item) => ({ basePath: item.basePath, present: available.has(item.basePath.toLocaleLowerCase()), sources: [...item.sources].sort() })).sort((a, b) => a.basePath.localeCompare(b.basePath));
const manifest = {
  schema: 'black-souls-asset-manifest-v1', generatedFrom: 'git HEAD + normalized rvdata2 references',
  assets, directReferences, missingDirectReferences: directReferences.filter((item) => !item.present),
};
await writeFile(join(generatedRoot, 'asset-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ assets: assets.length, directReferences: directReferences.length, missingDirectReferences: manifest.missingDirectReferences.length }));

function stripExtension(path) { return path.slice(0, path.length - extname(path).length); }
async function json(path) { return JSON.parse(await readFile(path, 'utf8')); }
