import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const portRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generatedRoot = join(portRoot, 'generated');
const outputRoot = join(generatedRoot, 'dependencies');
await mkdir(outputRoot, { recursive: true });

const databaseNames = ['Actors', 'Animations', 'Armors', 'Classes', 'CommonEvents', 'Enemies', 'Items', 'MapInfos', 'Skills', 'States', 'System', 'Tilesets', 'Troops', 'Weapons'];
const database = Object.fromEntries(await Promise.all(databaseNames.map(async (name) => [name, await json(join(generatedRoot, 'database', `${name}.json`))])));
const assetManifest = await json(join(generatedRoot, 'asset-manifest.json'));
const assetsByBase = new Map(assetManifest.assets.map((entry) => [baseKey(entry.path), entry.path]));
const maps = {};
for (let id = 1; id <= 150; id += 1) maps[id] = await json(join(generatedRoot, 'maps', `${String(id).padStart(3, '0')}.json`));

const reverse = new Map();
const audioUses = {};
const eventDependencies = {};
const commonEventDependencies = {};
const combatDependencies = {};
const mapDependencies = {};

for (const [mapId, map] of Object.entries(maps)) {
  const dependencies = emptyDependencies({ kind: 'map', mapId: Number(mapId), dataPath: `maps/${String(mapId).padStart(3, '0')}.json`, tilesetId: map.tileset_id });
  const tileset = database.Tilesets[map.tileset_id];
  for (const name of tileset?.tileset_names ?? []) addAsset(dependencies, `Graphics/Tilesets/${name}`, `map:${mapId}:tileset`, 'MAP_TILESET', 'critical');
  if (map.parallax_name) addAsset(dependencies, `Graphics/Parallaxes/${map.parallax_name}`, `map:${mapId}:parallax`, 'MAP_EFFECTS', 'normal');
  for (const match of String(map.note ?? '').matchAll(/==マップフォグ([^\[]+)\[/g)) addAsset(dependencies, `Graphics/Parallaxes/${match[1]}`, `map:${mapId}:fog`, 'MAP_EFFECTS', 'critical');
  addAudio(dependencies, 'BGM', map.bgm, `map:${mapId}:bgm`, 'AUDIO', 'normal');
  addAudio(dependencies, 'BGS', map.bgs, `map:${mapId}:bgs`, 'AUDIO', 'normal');
  if (map.specify_battleback) {
    if (map.battleback1_name) addAsset(dependencies, `Graphics/Battlebacks1/${map.battleback1_name}`, `map:${mapId}:battleback1`, 'COMBAT_GRAPHICS', 'normal');
    if (map.battleback2_name) addAsset(dependencies, `Graphics/Battlebacks2/${map.battleback2_name}`, `map:${mapId}:battleback2`, 'COMBAT_GRAPHICS', 'normal');
  }
  for (const event of Object.values(map.events ?? {})) {
    for (let pageIndex = 0; pageIndex < (event.pages ?? []).length; pageIndex += 1) {
      const page = event.pages[pageIndex];
      const key = `map:${mapId}:event:${event.id}:page:${pageIndex}`;
      const eventDeps = emptyDependencies({ kind: 'map-event', mapId: Number(mapId), eventId: event.id, page: pageIndex, trigger: page.trigger });
      if (page.graphic?.character_name) addAsset(eventDeps, `Graphics/Characters/${page.graphic.character_name}`, `${key}:page-graphic`, 'MAP_EVENTS', page.trigger === 3 ? 'critical' : 'normal');
      scanCommands(page.list, eventDeps, key);
      finish(eventDeps);
      eventDependencies[key] = eventDeps;
      merge(dependencies, eventDeps);
    }
  }
  finish(dependencies);
  mapDependencies[mapId] = dependencies;
}

for (let id = 1; id < database.CommonEvents.length; id += 1) {
  const commonEvent = database.CommonEvents[id];
  if (!commonEvent) continue;
  const dependencies = emptyDependencies({ kind: 'common-event', commonEventId: id, name: commonEvent.name, trigger: commonEvent.trigger, switchId: commonEvent.switch_id });
  scanCommands(commonEvent.list, dependencies, `common-event:${id}`);
  finish(dependencies);
  commonEventDependencies[id] = dependencies;
}

for (let troopId = 1; troopId < database.Troops.length; troopId += 1) {
  const troop = database.Troops[troopId];
  if (!troop) continue;
  const dependencies = emptyDependencies({ kind: 'combat', troopId, name: troop.name, enemyIds: [], skillIds: [], animationIds: [] });
  for (const member of troop.members ?? []) {
    const enemy = database.Enemies[member.enemy_id];
    if (!enemy) continue;
    dependencies.enemyIds.push(enemy.id);
    if (enemy.battler_name) addAsset(dependencies, `Graphics/Battlers/${enemy.battler_name}`, `troop:${troopId}:enemy:${enemy.id}`, 'COMBAT_GRAPHICS', 'critical');
    for (const action of enemy.actions ?? []) {
      dependencies.skillIds.push(action.skill_id);
      const skill = database.Skills[action.skill_id];
      if (skill?.animation_id) dependencies.animationIds.push(skill.animation_id);
      addAnimation(dependencies, skill?.animation_id, `troop:${troopId}:skill:${action.skill_id}`);
    }
  }
  addAudio(dependencies, 'BGM', database.System.battle_bgm, `troop:${troopId}:battle-bgm`, 'COMBAT_AUDIO', 'critical');
  addAsset(dependencies, 'Graphics/System/mist', `troop:${troopId}:script:153`, 'COMBAT_GRAPHICS', 'normal');
  addAudio(dependencies, 'ME', database.System.battle_end_me, `troop:${troopId}:battle-end`, 'COMBAT_AUDIO', 'normal');
  for (const page of troop.pages ?? []) scanCommands(page.list, dependencies, `troop:${troopId}:page`);
  finish(dependencies);
  dependencies.enemyIds = unique(dependencies.enemyIds);
  dependencies.skillIds = unique(dependencies.skillIds);
  dependencies.animationIds = unique(dependencies.animationIds);
  combatDependencies[troopId] = dependencies;
}

const recipes = await parseSynthesisRecipes(join(generatedRoot, 'scripts', '120-アイテム合成.rb'));
const inventoryDependencies = {
  schema: 'black-souls-inventory-dependencies-v1',
  database: {
    items: database.Items.filter(Boolean).length,
    weapons: database.Weapons.filter(Boolean).length,
    armors: database.Armors.filter(Boolean).length,
    actors: database.Actors.filter(Boolean).length,
    classes: database.Classes.filter(Boolean).length,
  },
  equipment: {
    sourceScript: 'generated/scripts/114-装備拡張.rb', mode: 'actor',
    actorSlotOverrides: { 1: [0, 1, 2, 3, 4, 4, 4, 4], 2: [0, 1, 2, 3, 4, 4, 4, 4], 3: [0, 1, 2, 3, 4, 4, 4, 4], 4: [0, 1, 2, 3, 4, 4, 4, 4] },
    armorPartNote: '部位番号：',
  },
  synthesis: { sourceScript: 'generated/scripts/120-アイテム合成.rb', recipes },
  assets: unique(['Graphics/System/IconSet.png', 'Graphics/System/Window.png', ...database.Actors.filter(Boolean).map((actor) => actor.face_name ? resolved(`Graphics/Faces/${actor.face_name}`) : null).filter(Boolean)]),
};

const uiDependencies = {
  schema: 'black-souls-ui-dependencies-v1',
  MENU_UI: unique(['Graphics/System/Window.png', 'Graphics/System/IconSet.png', ...database.Actors.filter(Boolean).map((actor) => actor.face_name ? resolved(`Graphics/Faces/${actor.face_name}`) : null).filter(Boolean)]),
  TITLE: unique([resolved(`Graphics/Titles1/${database.System.title1_name}`), resolved(`Graphics/Titles2/${database.System.title2_name}`), audioPath('BGM', database.System.title_bgm)].filter(Boolean)),
};

const audioDependencies = {
  schema: 'black-souls-audio-dependencies-v1',
  uses: Object.fromEntries(Object.entries(audioUses).sort(([a], [b]) => a.localeCompare(b)).map(([path, uses]) => [path, unique(uses).sort()])),
};
const assetReverseIndex = {
  schema: 'black-souls-asset-reverse-index-v1',
  assets: Object.fromEntries([...reverse.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([path, uses]) => [path, unique(uses).sort()])),
};
const gameIndex = {
  schema: 'black-souls-game-dependency-index-v1', generatedFrom: 'all normalized maps, events, common events, databases, and extracted custom scripts',
  counts: {
    maps: Object.keys(mapDependencies).length, events: Object.keys(eventDependencies).length,
    commonEvents: Object.keys(commonEventDependencies).length, troops: Object.keys(combatDependencies).length,
    indexedAssets: reverse.size, indexedAudio: Object.keys(audioUses).length, synthesisRecipes: recipes.length,
  },
  domains: ['CORE', 'TITLE', 'OPENING', 'MAP_DATA', 'MAP_TILESET', 'MAP_EVENTS', 'MAP_EFFECTS', 'PICTURES', 'AUDIO', 'MENU_UI', 'INVENTORY', 'EQUIPMENT', 'COMBAT_DATA', 'COMBAT_GRAPHICS', 'COMBAT_AUDIO', 'ANIMATIONS', 'COMMON_EVENTS', 'PLUGIN_RUNTIME'],
  files: ['map-dependencies.json', 'event-dependencies.json', 'common-event-dependencies.json', 'combat-dependencies.json', 'inventory-dependencies.json', 'ui-dependencies.json', 'audio-dependencies.json', 'asset-reverse-index.json'],
};

await Promise.all([
  write('game-dependency-index.json', gameIndex), write('map-dependencies.json', { schema: 'black-souls-map-dependencies-v1', maps: mapDependencies }),
  write('event-dependencies.json', { schema: 'black-souls-event-dependencies-v1', events: eventDependencies }),
  write('common-event-dependencies.json', { schema: 'black-souls-common-event-dependencies-v1', commonEvents: commonEventDependencies }),
  write('combat-dependencies.json', { schema: 'black-souls-combat-dependencies-v1', troops: combatDependencies }),
  write('inventory-dependencies.json', inventoryDependencies), write('ui-dependencies.json', uiDependencies),
  write('audio-dependencies.json', audioDependencies), write('asset-reverse-index.json', assetReverseIndex),
]);

console.log(JSON.stringify(gameIndex.counts));

function scanCommands(list = [], target, source) {
  for (let index = 0; index < list.length; index += 1) {
    const command = list[index];
    const p = command.parameters ?? [];
    const commandSource = `${source}:command:${index}:code:${command.code}`;
    if (command.code === 117) target.commonEvents.push(Number(p[0]));
    if (command.code === 201 && p[0] === 0) target.transfers.push(Number(p[1]));
    if (command.code === 205) for (const move of p[1]?.list ?? []) if (move.code === 41 && move.parameters?.[0]) addAsset(target, `Graphics/Characters/${move.parameters[0]}`, `${commandSource}:move-graphic`, 'MAP_EVENTS', 'critical');
    if (command.code === 212) addAnimation(target, Number(p[1]), commandSource);
    if (command.code === 231 && p[1]) addAsset(target, `Graphics/Pictures/${p[1]}`, `${commandSource}:picture`, 'PICTURES', 'critical');
    if (command.code === 241) addAudio(target, 'BGM', p[0], commandSource, 'AUDIO', 'normal');
    if (command.code === 245) addAudio(target, 'BGS', p[0], commandSource, 'AUDIO', 'normal');
    if (command.code === 249) addAudio(target, 'ME', p[0], commandSource, 'AUDIO', 'normal');
    if (command.code === 250) addAudio(target, 'SE', p[0], commandSource, 'AUDIO', 'normal');
    if (command.code === 301 && p[0] === 0) target.battles.push(Number(p[1]));
    if (command.code === 322 && p[1]) addAsset(target, `Graphics/Characters/${p[1]}`, `${commandSource}:actor-graphic`, 'MAP_EVENTS', 'critical');
  }
}

function addAnimation(target, animationId, source) {
  const animation = database.Animations[animationId];
  if (!animation) return;
  if (animation.animation1_name) addAsset(target, `Graphics/Animations/${animation.animation1_name}`, `${source}:animation:${animationId}`, 'ANIMATIONS', 'normal');
  if (animation.animation2_name) addAsset(target, `Graphics/Animations/${animation.animation2_name}`, `${source}:animation:${animationId}`, 'ANIMATIONS', 'normal');
}

function addAudio(target, folder, descriptor, source, domain, criticality) {
  const path = audioPath(folder, descriptor);
  if (!path) return;
  target.assets.push({ path, domain, criticality, source });
  addReverse(path, source);
  (audioUses[path] ??= []).push(source);
}

function addAsset(target, basePath, source, domain, criticality) {
  if (!basePath || /\/$/.test(basePath)) return;
  const path = resolved(basePath);
  target.assets.push({ path: path ?? basePath, domain, criticality, source, present: Boolean(path) });
  addReverse(path ?? basePath, source);
}

function addReverse(path, source) { const uses = reverse.get(path) ?? []; uses.push(source); reverse.set(path, uses); }
function resolved(basePath) { return assetsByBase.get(baseKey(basePath)) ?? null; }
function audioPath(folder, descriptor) { return descriptor?.name ? resolved(`Audio/${folder}/${descriptor.name}`) ?? `Audio/${folder}/${descriptor.name}` : null; }
function baseKey(path) { return String(path ?? '').replaceAll('\\', '/').replace(/\.[^.\/]+$/, '').toLocaleLowerCase(); }
function emptyDependencies(metadata = {}) { return { ...metadata, assets: [], transfers: [], commonEvents: [], battles: [] }; }
function merge(target, source) { target.assets.push(...source.assets); target.transfers.push(...source.transfers); target.commonEvents.push(...source.commonEvents); target.battles.push(...source.battles); }
function finish(target) {
  target.assets = [...new Map(target.assets.map((entry) => [`${entry.path}|${entry.domain}|${entry.criticality}`, entry])).values()].sort((a, b) => a.path.localeCompare(b.path));
  target.transfers = unique(target.transfers).sort((a, b) => a - b); target.commonEvents = unique(target.commonEvents).sort((a, b) => a - b); target.battles = unique(target.battles).sort((a, b) => a - b);
}
function unique(values) { return [...new Set(values.filter((value) => value != null && value !== ''))]; }

async function parseSynthesisRecipes(path) {
  const source = await readFile(path, 'utf8');
  const recipes = [];
  for (const match of source.matchAll(/^\s*([IWA])_recipe\[(\d+)\]\s*=\s*\[(\d+)\s*,\s*(.+)\]\s*$/gm)) {
    const materials = [...match[4].matchAll(/\["([IWA])",\s*(\d+),\s*(\d+)\]/g)].map((item) => ({ kind: kindName(item[1]), id: Number(item[2]), amount: Number(item[3]) }));
    recipes.push({ kind: kindName(match[1]), id: Number(match[2]), gold: Number(match[3]), materials });
  }
  return recipes.sort((a, b) => a.kind.localeCompare(b.kind) || a.id - b.id);
}
function kindName(value) { return ({ I: 'item', W: 'weapon', A: 'armor' })[value]; }
async function json(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function write(name, value) { await writeFile(join(outputRoot, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
