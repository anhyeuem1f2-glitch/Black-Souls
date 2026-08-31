import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const portRoot = resolve(here, '..');
const generated = join(portRoot, 'generated');
const database = join(generated, 'database');

const [system, tilesets, actors, commonEvents, animations, troops, enemies, assetManifest] = await Promise.all([
  json(join(database, 'System.json')),
  json(join(database, 'Tilesets.json')),
  json(join(database, 'Actors.json')),
  json(join(database, 'CommonEvents.json')),
  json(join(database, 'Animations.json')),
  json(join(database, 'Troops.json')),
  json(join(database, 'Enemies.json')),
  json(join(generated, 'asset-manifest.json')),
]);

const assetsByBase = new Map();
for (const entry of assetManifest.assets ?? []) assetsByBase.set(baseKey(entry.path), entry.path);
const common = {};
for (let id = 1; id < commonEvents.length; id += 1) {
  if (!commonEvents[id]?.list) continue;
  common[id] = scanList(commonEvents[id].list);
}

const partyCharacters = (system.party_members ?? [])
  .map((id) => actors[id]?.character_name)
  .filter(Boolean)
  .map((name) => asset(`Graphics/Characters/${name}`))
  .filter(Boolean);
const maps = {};
const graph = {};

for (let mapId = 1; mapId <= 150; mapId += 1) {
  const map = await json(join(generated, 'maps', `${String(mapId).padStart(3, '0')}.json`));
  const tileset = tilesets[map.tileset_id];
  const direct = scanMap(map);
  const expanded = expandCommonDependencies(direct.commonEvents, 2);
  const transfers = unique(direct.transfers).filter((id) => id > 0 && id <= 150);
  const criticalAssets = unique([
    ...(tileset?.tileset_names ?? []).filter(Boolean).map((name) => asset(`Graphics/Tilesets/${name}`)),
    ...partyCharacters,
    ...mapVisualCriticalAssets(map),
  ].filter(Boolean));
  const allAssets = unique([
    ...criticalAssets,
    ...mapAssets(map),
    ...direct.assets,
  ].filter(Boolean));
  const warmAssets = unique([
    ...criticalAssets,
    ...mapAssets(map),
    ...autorunAssets(map),
  ].filter(Boolean));
  maps[mapId] = {
    mapId,
    dataPath: `maps/${String(mapId).padStart(3, '0')}.json`,
    displayName: map.display_name ?? '',
    tilesetId: map.tileset_id,
    criticalAssets,
    assets: allAssets,
    warmAssets,
    eventAssets: mapEventAssets(map),
    transfers,
    transferPoints: mapTransferPoints(map),
    commonEventTransfers: unique(expanded.transfers).filter((id) => id > 0 && id <= 150),
    commonEvents: unique([...direct.commonEvents, ...expanded.commonEvents]),
  };
  graph[mapId] = transfers;
}

const startMapId = system.start_map_id;
const openingMaps = routeFrom(startMapId, graph, 2);
const output = {
  schema: 'black-souls-prefetch-manifest-v1',
  policy: { graphDepth: 2, eventLookahead: 48, commonEventDepth: 2 },
  start: { mapId: startMapId, x: system.start_x, y: system.start_y },
  routes: { opening: openingMaps },
  maps,
  transferGraph: graph,
  commonEvents: common,
  battles: Object.fromEntries(troops.flatMap((troop, id) => troop ? [[id, { assets: battleAssets(id) }]] : [])),
  animations: Object.fromEntries(animations.flatMap((animation, id) => animation ? [[id, { assets: animationAssets(id) }]] : [])),
};
await writeFile(join(generated, 'prefetch-manifest.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ maps: Object.keys(maps).length, edges: Object.values(graph).reduce((sum, edges) => sum + edges.length, 0), openingMaps }, null, 2));

function scanMap(map) {
  const result = emptyDependencies();
  for (const event of Object.values(map.events ?? {})) {
    for (const page of event?.pages ?? []) merge(result, scanList(page.list ?? []));
  }
  return result;
}

function scanList(list) {
  const result = emptyDependencies();
  for (const command of list ?? []) {
    const parameters = command?.parameters ?? [];
    if (command?.code === 117) result.commonEvents.push(Number(parameters[0] ?? 0));
    if (command?.code === 201 && parameters[0] === 0) result.transfers.push(Number(parameters[1] ?? 0));
    if (command?.code === 205) {
      for (const move of parameters[1]?.list ?? []) if (move.code === 41 && move.parameters?.[0]) add(result, `Graphics/Characters/${move.parameters[0]}`);
    }
    if (command?.code === 212) addAnimation(result, Number(parameters[1] ?? 0));
    if (command?.code === 231 && parameters[1]) add(result, `Graphics/Pictures/${parameters[1]}`);
    if (command?.code === 241) addAudio(result, 'BGM', parameters[0]);
    if (command?.code === 245) addAudio(result, 'BGS', parameters[0]);
    if (command?.code === 249) addAudio(result, 'ME', parameters[0]);
    if (command?.code === 250) addAudio(result, 'SE', parameters[0]);
    if (command?.code === 301 && parameters[0] === 0) addBattle(result, Number(parameters[1] ?? 0));
    if (command?.code === 322) {
      if (parameters[1]) add(result, `Graphics/Characters/${parameters[1]}`);
      if (parameters[3]) add(result, `Graphics/Faces/${parameters[3]}`);
    }
  }
  result.assets = unique(result.assets);
  result.transfers = unique(result.transfers.filter(Boolean));
  result.commonEvents = unique(result.commonEvents.filter(Boolean));
  return result;
}

function mapAssets(map) {
  const result = [];
  if (map.parallax_name) result.push(asset(`Graphics/Parallaxes/${map.parallax_name}`));
  const fog = /==マップフォグ([^\[]+)\[/.exec(map.note ?? '')?.[1];
  if (fog) result.push(asset(`Graphics/Parallaxes/${fog}`));
  if (map.specify_battleback && map.battleback1_name) result.push(asset(`Graphics/Battlebacks1/${map.battleback1_name}`));
  if (map.specify_battleback && map.battleback2_name) result.push(asset(`Graphics/Battlebacks2/${map.battleback2_name}`));
  if (map.autoplay_bgm) result.push(audioAsset('BGM', map.bgm));
  if (map.autoplay_bgs) result.push(audioAsset('BGS', map.bgs));
  for (const event of Object.values(map.events ?? {})) {
    for (const page of event?.pages ?? []) if (page.graphic?.character_name) result.push(asset(`Graphics/Characters/${page.graphic.character_name}`));
  }
  return result.filter(Boolean);
}

function mapVisualCriticalAssets(map) {
  const result = [];
  if (map.parallax_name) result.push(asset(`Graphics/Parallaxes/${map.parallax_name}`));
  const fog = /==マップフォグ([^\[]+)\[/.exec(map.note ?? '')?.[1];
  if (fog) result.push(asset(`Graphics/Parallaxes/${fog}`));
  return result.filter(Boolean);
}

function mapEventAssets(map) {
  const result = [];
  for (const event of Object.values(map.events ?? {})) {
    for (const page of event?.pages ?? []) {
      const path = page.graphic?.character_name ? asset(`Graphics/Characters/${page.graphic.character_name}`) : null;
      if (path) result.push({ eventId: event.id, x: event.x, y: event.y, path });
    }
  }
  return [...new Map(result.map((item) => [`${item.eventId}:${item.path}`, item])).values()];
}

function mapTransferPoints(map) {
  const points = [];
  for (const event of Object.values(map.events ?? {})) {
    for (const page of event?.pages ?? []) {
      for (const command of page.list ?? []) {
        if (command.code === 201 && command.parameters?.[0] === 0) points.push({ eventId: event.id, x: event.x, y: event.y, mapId: Number(command.parameters[1]) });
      }
    }
  }
  return [...new Map(points.map((item) => [`${item.eventId}:${item.mapId}`, item])).values()];
}

function autorunAssets(map) {
  const result = [];
  for (const event of Object.values(map.events ?? {})) {
    for (const page of event?.pages ?? []) {
      if (page.trigger !== 3) continue;
      result.push(...scanList((page.list ?? []).slice(0, 60)).assets);
    }
  }
  return unique(result);
}

function expandCommonDependencies(ids, depth, seen = new Set()) {
  const result = emptyDependencies();
  if (depth < 0) return result;
  for (const id of ids ?? []) {
    if (!id || seen.has(id) || !common[id]) continue;
    seen.add(id);
    const item = common[id];
    merge(result, item);
    merge(result, expandCommonDependencies(item.commonEvents, depth - 1, seen));
  }
  return result;
}

function addBattle(result, troopId) {
  result.assets.push(...battleAssets(troopId));
}

function battleAssets(troopId) {
  const result = [];
  const troop = troops[troopId];
  for (const member of troop?.members ?? []) {
    const enemy = enemies[member.enemy_id];
    if (enemy?.battler_name) result.push(asset(`Graphics/Battlers/${enemy.battler_name}`));
  }
  result.push(audioAsset('BGM', system.battle_bgm));
  return unique(result.filter(Boolean));
}

function addAnimation(result, animationId) {
  result.assets.push(...animationAssets(animationId));
}

function animationAssets(animationId) {
  const result = [];
  const animation = animations[animationId];
  if (animation?.animation1_name) result.push(asset(`Graphics/Animations/${animation.animation1_name}`));
  if (animation?.animation2_name) result.push(asset(`Graphics/Animations/${animation.animation2_name}`));
  return unique(result.filter(Boolean));
}

function addAudio(result, folder, descriptor) {
  const path = audioAsset(folder, descriptor);
  if (path) result.assets.push(path);
}

function audioAsset(folder, descriptor) {
  return descriptor?.name ? asset(`Audio/${folder}/${descriptor.name}`) : null;
}

function add(result, base) {
  const path = asset(base);
  if (path) result.assets.push(path);
}

function asset(path) { return assetsByBase.get(baseKey(path)) ?? null; }
function baseKey(path) { return String(path).replaceAll('\\', '/').replace(/\.[^.\/]+$/, '').toLocaleLowerCase(); }
function emptyDependencies() { return { assets: [], transfers: [], commonEvents: [] }; }
function merge(target, source) {
  target.assets.push(...(source.assets ?? []));
  target.transfers.push(...(source.transfers ?? []));
  target.commonEvents.push(...(source.commonEvents ?? []));
  target.assets = unique(target.assets); target.transfers = unique(target.transfers); target.commonEvents = unique(target.commonEvents);
  return target;
}
function unique(values) { return [...new Set(values)]; }
function routeFrom(start, transferGraph, depth) {
  const route = []; const seen = new Set(); let frontier = [start];
  for (let level = 0; level <= depth && frontier.length; level += 1) {
    route.push({ depth: level, mapIds: unique(frontier).filter((id) => !seen.has(id)) });
    for (const id of frontier) seen.add(id);
    frontier = route.at(-1).mapIds.flatMap((id) => transferGraph[id] ?? []).filter((id) => !seen.has(id));
  }
  return route;
}
async function json(path) { return JSON.parse(await readFile(path, 'utf8')); }
