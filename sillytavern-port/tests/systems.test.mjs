import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { CombatSystem, DIFFICULTY_RATES, MAX_AP, chantMetadata } from '../runtime/game/combat-system.js';
import { PartySystem } from '../runtime/game/party-system.js';
import { EventInterpreter } from '../runtime/map/interpreter.js';
import { GameEngine } from '../runtime/core/game-engine.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = async (path) => JSON.parse(await readFile(join(root, path), 'utf8'));

async function realSystems() {
  const [system, actors, classes, items, weapons, armors, enemies, troops, skills, states, configuration] = await Promise.all([
    json('generated/database/System.json'), json('generated/database/Actors.json'), json('generated/database/Classes.json'),
    json('generated/database/Items.json'), json('generated/database/Weapons.json'), json('generated/database/Armors.json'),
    json('generated/database/Enemies.json'), json('generated/database/Troops.json'), json('generated/database/Skills.json'),
    json('generated/database/States.json'), json('generated/dependencies/inventory-dependencies.json'),
  ]);
  const database = { system, actors, classes, items, weapons, armors, enemies, troops, skills, states };
  const party = new PartySystem(database, configuration); const state = { ...party.initialState(), switches: {}, variables: {}, selfSwitches: {} };
  return { database, configuration, party, state, combat: new CombatSystem(database, party) };
}

test('real BLACK SOULS inventory stacks, consumes, targets, and survives serialization', async () => {
  const { party, state } = await realSystems(); const actor = state.actors[1]; const maximum = party.parameters(state, 1).mhp;
  party.gain(state, 'item', 3, 2); assert.equal(party.quantity(state, 'item', 3), 2);
  actor.hp = Math.max(1, maximum - 500); const result = party.useItem(state, 3, 1);
  assert.equal(result.used, true); assert.equal(actor.hp, Math.min(maximum, result.before.hp + 150)); assert.equal(party.quantity(state, 'item', 3), 1);
  party.gain(state, 'item', 3, -1); assert.equal(party.quantity(state, 'item', 3), 0);
  const restored = structuredClone(state); party.normalizeState(restored);
  assert.equal(restored.actors[1].hp, actor.hp); assert.deepEqual(restored.party.inventory, state.party.inventory);
});

test('custom eight-slot equipment enforces real class permissions and changes parameters', async () => {
  const { database, party, state } = await realSystems(); const actor = state.actors[1];
  assert.deepEqual(actor.equips.map((slot) => slot.etypeId), [0, 1, 2, 3, 4, 4, 4, 4]);
  const candidate = database.armors.find((armor) => armor?.etype_id === 4 && party.canEquip({ ...state, party: state.party }, 1, 'armor', armor.id, 4));
  assert.ok(candidate, 'expected at least one real equippable accessory');
  party.gain(state, 'armor', candidate.id, 1); const before = party.parameters(state, 1);
  const equipped = party.equip(state, 1, 4, 'armor', candidate.id);
  assert.equal(equipped.equipped, true); assert.equal(actor.equips[4].id, candidate.id); assert.equal(party.quantity(state, 'armor', candidate.id), 0);
  const after = party.parameters(state, 1); assert.equal(after.atk, before.atk + Number(candidate.params[2] ?? 0));
  party.equip(state, 1, 4, 'armor', 0); assert.equal(party.quantity(state, 'armor', candidate.id), 1);
});

test('shop and original synthesis recipe consume real materials and persist results', async () => {
  const { party, state } = await realSystems();
  party.gainGold(state, 1000); const bought = party.buy(state, 'item', 3, 2); assert.equal(bought.bought, true); assert.equal(party.quantity(state, 'item', 3), 2);
  const sold = party.sell(state, 'item', 3, 1); assert.equal(sold.sold, true); assert.equal(party.quantity(state, 'item', 3), 1);
  party.unlockAllRecipes(state); party.gain(state, 'item', 49, 2);
  const crafted = party.synthesize(state, 'item', 8); assert.equal(crafted.crafted, true); assert.equal(party.quantity(state, 'item', 49), 0); assert.equal(party.quantity(state, 'item', 8), 1);
});

test('real troop 1 executes MAX_AP combat, smart enemy selection, damage, victory, and rewards', async () => {
  const { database, party, state, combat } = await realSystems(); state.variables[60] = 0;
  state.battle = combat.createBattle(state, 1, { canEscape: true, battleback1: 'Wood1', battleback2: 'Room2' });
  const enemy = state.battle.enemies[0];
  assert.equal(combat.selectEnemyAction(state, enemy, database.enemies[1].actions).skill_id, 157);
  let attacks = 0;
  while (!state.battle.result && attacks < 20) {
    state.battle.actors[0].ap = MAX_AP; state.battle.phase = 'actor-command'; state.battle.activeActor = 0;
    const result = combat.actorCommand(state, 'attack', 0);
    assert.equal(result.accepted, true); attacks += 1;
  }
  assert.equal(state.battle.result, 'victory'); assert.ok(attacks > 0); assert.ok(state.battle.log.some((line) => line.includes('damage'))); assert.ok(state.party.gold >= 15);
});

test('combat metadata supports casting and interrupt semantics from original note tags', () => {
  assert.deepEqual(chantMetadata('<詠唱:120,20>'), { frames: 130 });
  assert.equal(MAX_AP, 4000);
});

test('difficulty variable 60 uses the original parameter and reward matrices', async () => {
  const { database, state, combat } = await realSystems(); state.variables[60] = 1;
  state.battle = combat.createBattle(state, 1);
  assert.equal(state.battle.difficulty, 1);
  assert.equal(state.battle.enemies[0].parameters.mhp, Math.floor(database.enemies[1].params[0] * 1.5));
  assert.deepEqual(DIFFICULTY_RATES.exp, Array(10).fill(0));
  for (const enemy of state.battle.enemies) enemy.hp = 0;
  combat.checkResult(state);
  assert.equal(state.battle.rewards.exp, 0);
  assert.equal(state.battle.rewards.gold, Math.round(database.enemies[1].gold * 1.5) * 3);
});

test('Map 97 switch 14 waits for active corpse graphics and then exposes original 14遺体 pages', async () => {
  const map = await json('generated/maps/097.json'); const gate = deferred(); const waits = [];
  const engine = {
    state: { mapId: 97, switches: {}, variables: {}, selfSwitches: {}, actors: {}, party: { members: [] } },
    refreshCurrentMapVisuals: async () => { waits.push('requested'); await gate.promise; waits.push('ready'); },
    consumePendingAutorun: () => false, recordDiagnostic: () => {}, noteUnsupported: () => {},
  };
  const interpreter = new EventInterpreter(engine);
  const run = interpreter.run([map.events['1'].pages[0].list[230]], { eventId: 1 });
  await until(() => interpreter.current?.waitMode === 'resource');
  assert.equal(engine.state.switches[14], true); assert.deepEqual(waits, ['requested']);
  gate.resolve(); await run; assert.deepEqual(waits, ['requested', 'ready']);

  const pageEngine = Object.create(GameEngine.prototype); pageEngine.state = { mapId: 97, switches: { 14: true }, variables: {}, selfSwitches: {}, eventOverrides: {}, party: { members: [] } }; pageEngine.map = map;
  pageEngine.party = { quantity: () => 0 };
  const renderable = pageEngine.currentRenderableEvents(map);
  assert.equal(renderable.find((event) => event.id === 1).graphic.character_name, '14遺体');
  assert.equal(renderable.filter((event) => event.graphic.character_name === '14遺体').length, 5);
});

test('map transfer resource barrier resumes the same interpreter after recovery', async () => {
  const gate = deferred(); const engine = {
    state: { mapId: 7, switches: {}, variables: {}, selfSwitches: {}, actors: {}, party: { members: [] } },
    transferWithRecovery: async (mapId, x, y) => { await gate.promise; Object.assign(engine.state, { mapId, x, y }); },
    refreshCurrentMapVisuals: async () => {}, consumePendingAutorun: () => false, recordDiagnostic: () => {}, noteUnsupported: () => {},
  };
  const interpreter = new EventInterpreter(engine); const instanceId = interpreter.instanceId;
  const run = interpreter.run([
    { code: 201, indent: 0, parameters: [0, 97, 15, 16, 2, 0] },
    { code: 121, indent: 0, parameters: [77, 77, 0] },
    { code: 0, indent: 0, parameters: [] },
  ], { eventId: 1 });
  await until(() => interpreter.current?.waitMode === 'resource');
  assert.equal(engine.state.switches[77], undefined); assert.equal(interpreter.instanceId, instanceId);
  gate.resolve(); await run;
  assert.equal(engine.state.mapId, 97); assert.equal(engine.state.switches[77], true); assert.equal(interpreter.instanceId, instanceId);
});

test('whole-game dependency database includes every required index and reverse source', async () => {
  const index = await json('generated/dependencies/game-dependency-index.json');
  assert.equal(index.counts.maps, 150); assert.equal(index.counts.events, 6444); assert.equal(index.counts.troops, 355); assert.equal(index.counts.synthesisRecipes, 15);
  for (const name of index.files) assert.ok(await readFile(join(root, 'generated', 'dependencies', name), 'utf8'));
  const reverse = await json('generated/dependencies/asset-reverse-index.json');
  assert.ok(reverse.assets['Graphics/Tilesets/Dungeon_C']?.some((source) => source.includes('tileset')));
  assert.ok(reverse.assets['Graphics/Characters/14遺体.png']?.some((source) => source.includes('map:97')));
});

function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }
async function until(predicate) { for (let attempt = 0; attempt < 100; attempt += 1) { if (predicate()) return; await new Promise((resolve) => setTimeout(resolve, 0)); } throw new Error('Timed out'); }
