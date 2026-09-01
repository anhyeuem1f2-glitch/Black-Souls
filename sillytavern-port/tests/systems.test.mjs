import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { CombatSystem, DIFFICULTY_RATES, FRAME_AP_GAIN, MAX_AP, REFRESH_FRAME, START_AP_RATES, chantMetadata, nextApMetadata } from '../runtime/game/combat-system.js';
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
  assert.deepEqual(chantMetadata('<詠唱:120,20>'), { type: 0, base: 120, random: 20, frames: 130 });
  assert.deepEqual(chantMetadata('<詠唱=2,[4000,600]>'), { type: 2, base: 4000, random: 600, frames: 4300 });
  assert.deepEqual(nextApMetadata('<行動後ＡＰ=[25,10]>'), { base: 25, random: 10 });
  assert.equal(MAX_AP, 4000);
});

test('ATB start ranges, three-frame refresh cadence, and actor commands match Scripts 122-131', async () => {
  const { database, state, combat } = await realSystems();
  const normal = combat.createBattle(state, 3); const actor = normal.actors[0]; const enemy = normal.enemies[0];
  assert.ok(actor.ap >= MAX_AP * START_AP_RATES.normal[0] / 100 && actor.ap <= MAX_AP * 0.70);
  assert.ok(enemy.ap >= MAX_AP * START_AP_RATES.normal[0] / 100 && enemy.ap <= MAX_AP * 0.70);
  actor.ap = 0; enemy.ap = 0; state.battle = normal; const expected = (actor.parameters.agi + FRAME_AP_GAIN) * REFRESH_FRAME;
  combat.update(state, 2); assert.equal(actor.ap, 0); combat.update(state, 1); assert.equal(actor.ap, expected);
  const names = combat.actorCommands(state, actor).map((command) => command.name);
  assert.deepEqual(names, [database.system.terms.commands[2], database.system.skill_types[1], database.system.skill_types[2], database.system.terms.commands[3], database.system.terms.commands[4], database.system.terms.commands[1]]);

  const preemptive = combat.createBattle(state, 3, { preemptive: true });
  assert.ok(preemptive.actors[0].ap >= 1600 && preemptive.actors[0].ap <= 2800); assert.ok(preemptive.enemies[0].ap >= 0 && preemptive.enemies[0].ap <= 400);
  const surprise = combat.createBattle(state, 3, { surprise: true });
  assert.ok(surprise.actors[0].ap >= 0 && surprise.actors[0].ap <= 400); assert.ok(surprise.enemies[0].ap >= 1600 && surprise.enemies[0].ap <= 2800);
});

test('real early troop 3 accepts an item and an actor skill, awards rewards, and preserves the map-owned state', async () => {
  const { party, state, combat } = await realSystems(); state.mapId = 98; state.x = 6; state.y = 19; state.scene = 'BATTLE';
  party.gain(state, 'item', 3, 1); state.actors[1].hp = Math.max(1, state.actors[1].hp - 200);
  state.battle = combat.createBattle(state, 3, { battleback1: 'Stone1', battleback2: 'Dungeon', encounter: { mapId: 98, eventId: 16 } });
  const actor = state.battle.actors[0]; actor.hp = state.actors[1].hp; actor.ap = MAX_AP; state.battle.phase = 'actor-command'; state.battle.activeActor = 0;
  const item = combat.actorCommand(state, 'item', 0, { itemId: 3 }); assert.equal(item.accepted, true); assert.equal(party.quantity(state, 'item', 3), 0);
  actor.ap = MAX_AP; state.battle.phase = 'actor-command'; state.battle.activeActor = 0;
  const skill = combat.actorCommand(state, 'skill', 0, { skillId: 163 }); assert.equal(skill.accepted, true); assert.equal(state.battle.result, 'victory');
  assert.equal(state.battle.encounter.eventId, 16); assert.equal(state.mapId, 98); assert.deepEqual([state.x, state.y], [6, 19]);
  assert.ok(state.battle.rewards.gold > 0); assert.ok(state.battle.log.some((line) => line.includes('Prey Upon')));
});

test('original custom battle note tags govern attack replacement, guts, resurrection, recovery, and user effects', async () => {
  const { database, state, combat } = await realSystems();
  state.battle = combat.createBattle(state, 3); const actor = state.battle.actors[0]; const enemy = state.battle.enemies[0];

  state.actors[actor.actorId].equips[0] = { etypeId: 0, kind: 'weapon', id: 211 };
  database.actors[actor.actorId].note += '\n<攻撃ID変更:286>';
  assert.equal(combat.attackSkillId(state, actor.actorId), 286, 'equal-priority attack skills choose the highest original skill ID');

  actor.hp = 100; actor.states = [59]; state.actors[actor.actorId].states = [59];
  combat.applySkill(state, enemy, actor, database.skills[163]);
  assert.equal(actor.hp, 1, 'state 59 leaves exactly one HP after otherwise-lethal damage');

  actor.hp = 100; actor.states = [27]; state.actors[actor.actorId].states = [27];
  combat.applySkill(state, enemy, actor, database.skills[163]);
  assert.equal(actor.hp, Math.min(500, actor.parameters.mhp)); assert.ok(!actor.states.includes(27)); assert.equal(actor.resurrectionAnimationId, 42);

  actor.hp = Math.max(1, actor.parameters.mhp - 200); actor.states = [55]; state.actors[actor.actorId].states = [55]; const weakenedHp = actor.hp;
  combat.applySkill(state, actor, actor, database.items[3]);
  assert.equal(actor.hp, weakenedHp, 'state 55 applies its real 100% HP recovery nullification');

  actor.states = []; state.actors[actor.actorId].states = [];
  combat.applyUserEffect(state, actor, database.skills[286]);
  assert.ok(actor.states.includes(9), 'Bunker Shield applies skill 2 to its user');

  database.actors[actor.actorId].note += '\n<戦闘終了後HP回復:mhp/5>\n<戦闘終了後MP回復:mmp/10>\n<戦闘終了後TP回復:max_tp/20>\n<戦闘終了後ステート解除:9>';
  Object.assign(state.actors[actor.actorId], { hp: 1, mp: 0, tp: 0, states: [9] }); Object.assign(actor, { hp: 1, mp: 0, tp: 0, states: [9] });
  combat.applyBattleEndRecovery(state, state.battle);
  assert.equal(state.actors[actor.actorId].hp, 1 + Math.floor(actor.parameters.mhp / 5));
  assert.equal(state.actors[actor.actorId].mp, Math.floor(actor.parameters.mmp / 10)); assert.equal(state.actors[actor.actorId].tp, 5); assert.ok(!state.actors[actor.actorId].states.includes(9));
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

test('original class selection replaces the flame actor with Knight Grim and both opening routes remain executable', async () => {
  const [{ database, party, state }, map97, map98, commonEvents] = await Promise.all([
    realSystems(), json('generated/maps/097.json'), json('generated/maps/098.json'), json('generated/database/CommonEvents.json'),
  ]);
  database.commonEvents = commonEvents;
  const engine = Object.create(GameEngine.prototype);
  engine.database = database; engine.party = party; engine.map = map97;
  engine.state = { ...state, mapId: 97, x: 12, y: 18, realX: 12, realY: 18, direction: 6, scene: 'PLAYING', transparent: false, opacity: 255, eventOverrides: {}, pictures: {}, system: {} };
  engine.renderer = { playerGraphic: { character_name: '!Flame', character_index: 5 }, fadeTo: async () => {}, ensureEventGraphics: async () => {}, flashScreen: async () => {} };
  engine.audio = { stop: () => {} }; engine.prefetch = null; engine.diagnosticsLog = []; engine.unsupported = new Set();
  engine.waitFrames = async () => {}; engine.refreshCurrentMapVisuals = async () => {}; engine.playSe = async () => {};
  engine.showAnimation = async () => {}; engine.showBalloon = async () => {}; engine.showMessage = async () => {};
  engine.nameInput = async (actorId) => engine.setActorName(actorId, 'Alice');
  engine.showChoice = async (options) => options.includes('Bỏ qua') ? 1 : 0;
  const transfers = [];
  engine.transfer = async (mapId, x, y, direction) => { Object.assign(engine.state, { mapId, x, y, realX: x, realY: y, direction: direction || engine.state.direction }); transfers.push([mapId, x, y, direction]); };
  const interpreter = new EventInterpreter(engine);
  await interpreter.run(map97.events['1'].pages[0].list, { eventId: 1 });
  assert.deepEqual(engine.state.party.members, [2]);
  assert.equal(engine.state.actors[2].name, 'Alice');
  assert.deepEqual(engine.renderer.playerGraphic, { character_name: '$主人公', character_index: 0 });
  assert.equal(engine.state.variables[6], 1); assert.equal(engine.state.variables[14], 2); assert.equal(engine.state.switches[1], true);
  assert.deepEqual(transfers.at(-1).slice(0, 3), [98, 55, 5]);

  engine.map = map98; engine.state.mapId = 98;
  const introMessages = [];
  engine.showMessage = async (text) => introMessages.push(text);
  await interpreter.run(map98.events['10'].pages[0].list, { eventId: 10, trigger: 4 });
  assert.equal(map98.events['10'].pages[0].trigger, 4);
  assert.equal(engine.state.switches[8], true);
  assert.ok(introMessages.length > 0);
  assert.equal(engine.state.eventOverrides['98,12'].moveSpeed, 4);
  assert.equal(engine.state.eventOverrides['98,12'].moveFrequency, 3);
});

test('VX Ace movement uses exact 60 Hz speed-4 and dash-5 distances without diagonal normalization', () => {
  const engine = Object.create(GameEngine.prototype);
  engine.map = { disable_dashing: false };
  engine.input = { isDashPressed: () => false };
  engine.state = { scene: 'PLAYING', x: 1, y: 0, realX: 0, realY: 0, moveSpeed: 4, switches: {}, pattern: 1, originalPattern: 1, animationCount: 0 };
  for (let frame = 0; frame < 16; frame += 1) engine.updateMovement(1 / 60);
  assert.equal(engine.state.realX, 1);

  Object.assign(engine.state, { x: 1, y: 0, realX: 0, realY: 0 });
  engine.input.isDashPressed = () => true;
  for (let frame = 0; frame < 8; frame += 1) engine.updateMovement(1 / 60);
  assert.equal(engine.state.realX, 1);

  Object.assign(engine.state, { x: 1, y: 1, realX: 0, realY: 0 });
  engine.input.isDashPressed = () => false;
  engine.updateMovement(1 / 60);
  assert.equal(engine.state.realX, 1 / 16); assert.equal(engine.state.realY, 1 / 16);
  assert.equal(Math.hypot(engine.state.realX, engine.state.realY), Math.SQRT2 / 16);
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
  assert.ok(reverse.assets['Graphics/Tilesets/Dungeon_C.png']?.some((source) => source.includes('tileset')));
  assert.ok(reverse.assets['Graphics/Characters/14遺体.png']?.some((source) => source.includes('map:97')));
});

function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }
async function until(predicate) { for (let attempt = 0; attempt < 100; attempt += 1) { if (predicate()) return; await new Promise((resolve) => setTimeout(resolve, 0)); } throw new Error('Timed out'); }
