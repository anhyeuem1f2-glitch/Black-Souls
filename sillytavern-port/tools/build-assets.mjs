import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const portRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(portRoot, '..');
const generatedRoot = join(portRoot, 'generated');
const { stdout } = await exec('git', ['ls-tree', '-r', '--name-only', '-z', 'HEAD'], { cwd: repoRoot, encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 });
const paths = stdout.toString('utf8').split('\0').filter(Boolean);
const repoAssets = paths.filter((path) => /^(Graphics|Audio)\//.test(path));
const lfsExtensions = new Set(['png','jpg','jpeg','webp','bmp','gif','ogg','wav','mp3','m4a','flac','mp4','avi','wmv','webm']);
const assets = await Promise.all(repoAssets.map(async (path) => {
  const extension = extname(path).slice(1).toLowerCase();
  const lfs = lfsExtensions.has(extension);
  const localSize = await stat(join(repoRoot, ...path.split('/'))).then((item) => item.size).catch(() => null);
  return {
    path,
    category: path.split('/').slice(0, 2).join('/'),
    extension,
    size: localSize,
    lfs,
    lfsOid: null,
    status: lfs ? (localSize == null ? 'lfs-tracked-not-materialized' : 'lfs-tracked-materialized') : 'git-blob',
    delivery: lfs ? 'github-media' : 'runtime-repository',
  };
}));

const bundled = [
  ['Graphics/Tilesets/Dungeon_A1.png', 'Graphics/Tilesets/Dungeon_A1.png'],
  ['Graphics/Tilesets/Dungeon_A2.png', 'Graphics/Tilesets/Dungeon_A2.png'],
  ['Graphics/Tilesets/Dungeon_A4.png', 'Graphics/Tilesets/Dungeon_A4.png'],
  ['Graphics/Tilesets/Dungeon_A5.png', 'Graphics/Tilesets/Dungeon_A5.png'],
  ['Graphics/Tilesets/Dungeon_C.png', 'Graphics/Tilesets/Dungeon_C.png'],
  ['Graphics/Tilesets/Inside_A1.png', 'Graphics/Tilesets/Inside_A1.png'],
  ['Graphics/Tilesets/Inside_A2.png', 'Graphics/Tilesets/Inside_A2.png'],
  ['Graphics/Tilesets/Inside_A4.png', 'Graphics/Tilesets/Inside_A4.png'],
  ['Graphics/Tilesets/Inside_A5.png', 'Graphics/Tilesets/Inside_A5.png'],
  ['Graphics/Tilesets/Inside_B.png', 'Graphics/Tilesets/Inside_B.png'],
  ['Graphics/Characters/Damage3.png', 'Graphics/Characters/Damage3.png'],
  ['Graphics/Characters/Monster1.png', 'Graphics/Characters/Monster1.png'],
  ['Graphics/Characters/!Flame.png', 'Graphics/Characters/!Flame.png'],
  ['Graphics/Characters/!Other3.png', 'Graphics/Characters/!Other3.png'],
  ['Graphics/Animations/Light6.png', 'Graphics/Animations/Light6.png'],
  ['Graphics/Animations/Sword2.png', 'Graphics/Animations/Sword2.png'],
  ['Graphics/System/Balloon.png', 'Graphics/System/Balloon.png'],
  ['Audio/SE/Fire1.ogg', 'Audio/SE/Fire1.ogg'],
  ['Audio/SE/Move.ogg', 'Audio/SE/Move.ogg'],
  ['Audio/SE/Open3.ogg', 'Audio/SE/Open3.ogg'],
  ['Audio/SE/Slash1.ogg', 'Audio/SE/Slash1.ogg'],
  ['Audio/SE/Slash7.ogg', 'Audio/SE/Slash7.ogg'],
  ['Audio/SE/Slash9.ogg', 'Audio/SE/Slash9.ogg'],
];
for (const [path, bundledPath] of bundled) {
  const file = join(portRoot, 'assets', 'rtp', ...bundledPath.split('/'));
  const bytes = await readFile(file);
  const bundledEntry = {
    path, category: path.split('/').slice(0, 2).join('/'), extension: extname(path).slice(1).toLowerCase(),
    size: (await stat(file)).size, lfs: false, lfsOid: null, sha256: createHash('sha256').update(bytes).digest('hex'),
    status: 'bundled-rtp', delivery: 'runtime-bundle', deliveryPath: `../assets/rtp/${bundledPath}`,
  };
  const existingIndex = assets.findIndex((asset) => asset.path === path);
  if (existingIndex >= 0) {
    bundledEntry.upstream = { lfs: assets[existingIndex].lfs, status: assets[existingIndex].status, delivery: assets[existingIndex].delivery };
    assets[existingIndex] = bundledEntry;
  } else assets.push(bundledEntry);
}

const available = new Set(assets.map((asset) => stripExtension(asset.path).toLocaleLowerCase()));
const requirements = new Map();
const requireAsset = (basePath, source) => {
  if (!basePath || /\/$/.test(basePath)) return;
  const key = basePath.toLocaleLowerCase(); const item = requirements.get(key) ?? { basePath, sources: new Set() };
  item.sources.add(source); requirements.set(key, item);
};
const tilesets = await json(join(generatedRoot, 'database', 'Tilesets.json'));
for (const tileset of tilesets.filter(Boolean)) for (const name of tileset.tileset_names ?? []) if (name) requireAsset(`Graphics/Tilesets/${name}`, `tileset:${tileset.id}`);
const actors = await json(join(generatedRoot, 'database', 'Actors.json'));
for (const actor of actors.filter(Boolean)) { if (actor.character_name) requireAsset(`Graphics/Characters/${actor.character_name}`, `actor:${actor.id}`); if (actor.face_name) requireAsset(`Graphics/Faces/${actor.face_name}`, `actor:${actor.id}`); }
const animations = await json(join(generatedRoot, 'database', 'Animations.json'));
for (const animation of animations.filter(Boolean)) { if (animation.animation1_name) requireAsset(`Graphics/Animations/${animation.animation1_name}`, `animation:${animation.id}`); if (animation.animation2_name) requireAsset(`Graphics/Animations/${animation.animation2_name}`, `animation:${animation.id}`); }
const system = await json(join(generatedRoot, 'database', 'System.json'));
if (system.title1_name) requireAsset(`Graphics/Titles1/${system.title1_name}`, 'system:title1');
if (system.title2_name) requireAsset(`Graphics/Titles2/${system.title2_name}`, 'system:title2');
if (system.title_bgm?.name) requireAsset(`Audio/BGM/${system.title_bgm.name}`, 'system:title-bgm');
for (let id = 1; id <= 150; id += 1) {
  const map = await json(join(generatedRoot, 'maps', `${String(id).padStart(3, '0')}.json`));
  if (map.parallax_name) requireAsset(`Graphics/Parallaxes/${map.parallax_name}`, `map:${id}`);
  for (const match of String(map.note ?? '').matchAll(/==マップフォグ([^\[]+)\[/g)) requireAsset(`Graphics/Parallaxes/${match[1]}`, `map:${id}:fog`);
  if (map.bgm?.name) requireAsset(`Audio/BGM/${map.bgm.name}`, `map:${id}`); if (map.bgs?.name) requireAsset(`Audio/BGS/${map.bgs.name}`, `map:${id}`);
  for (const event of Object.values(map.events ?? {})) for (const page of event.pages ?? []) {
    if (page.graphic?.character_name) requireAsset(`Graphics/Characters/${page.graphic.character_name}`, `map:${id}:event:${event.id}`);
    scanCommands(page.list, `map:${id}:event:${event.id}`);
  }
}
function scanCommands(commands = [], source) {
  for (const command of commands) {
    const p = command.parameters ?? [];
    if (command.code === 241 && p[0]?.name) requireAsset(`Audio/BGM/${p[0].name}`, source);
    if (command.code === 245 && p[0]?.name) requireAsset(`Audio/BGS/${p[0].name}`, source);
    if (command.code === 249 && p[0]?.name) requireAsset(`Audio/ME/${p[0].name}`, source);
    if (command.code === 250 && p[0]?.name) requireAsset(`Audio/SE/${p[0].name}`, source);
    if (command.code === 231 && p[1]) requireAsset(`Graphics/Pictures/${p[1]}`, source);
  }
}

const directReferences = [...requirements.values()].map((item) => ({ basePath: item.basePath, present: available.has(item.basePath.toLocaleLowerCase()), sources: [...item.sources].sort() })).sort((a, b) => a.basePath.localeCompare(b.basePath));
const manifest = {
  schema: 'black-souls-asset-manifest-v2', generatedFrom: 'git HEAD LFS objects + normalized rvdata2 references + isolated browser RTP subset',
  repository: { owner: 'anhyeuem1f2-glitch', name: 'Black-Souls', ref: 'systems-v0.5.0' },
  deliveryPolicy: { lfs: 'github-media', bundledRtp: 'runtime-bundle', validation: 'magic-bytes-before-decode' },
  assets: assets.sort((a, b) => a.path.localeCompare(b.path)), directReferences, missingDirectReferences: directReferences.filter((item) => !item.present),
};
await writeFile(join(generatedRoot, 'asset-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ assets: assets.length, lfs: assets.filter((asset) => asset.lfs).length, bundled: bundled.length, directReferences: directReferences.length, missingDirectReferences: manifest.missingDirectReferences.length }));

function stripExtension(path) { return path.slice(0, path.length - extname(path).length); }
async function json(path) { return JSON.parse(await readFile(path, 'utf8')); }
