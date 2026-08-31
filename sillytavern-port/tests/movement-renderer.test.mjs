import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { GameEngine } from '../runtime/core/game-engine.js';
import { CombatSystem } from '../runtime/game/combat-system.js';
import { PartySystem } from '../runtime/game/party-system.js';
import { CollisionMap } from '../runtime/map/collision.js';
import { GameEventSystem, SYMBOL_SETTINGS, stopCountThreshold, symbolIdFromPage } from '../runtime/map/event-system.js';
import { EventInterpreter } from '../runtime/map/interpreter.js';
import { CanvasRenderer, computeTileWindow } from '../runtime/render/canvas-renderer.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = async (path) => JSON.parse(await readFile(join(root, path), 'utf8'));

test('fractional camera movement always samples integer tiles with a two-tile covered margin', () => {
  for (let step = 0; step <= 192; step += 1) {
    const displayX = 3 + step / 64; const displayY = 4 + step / 128;
    const window = computeTileWindow({ displayX, displayY, playerX: displayX + 9.5, playerY: displayY + 7, mapWidth: 60, mapHeight: 62 });
    for (const value of [window.startX, window.endX, window.startY, window.endY, window.pixelX, window.pixelY]) assert.equal(Number.isInteger(value), true);
    assert.ok(window.startX * 32 - window.pixelX <= 0);
    assert.ok((window.endX + 1) * 32 - window.pixelX >= 640);
    assert.ok(window.startY * 32 - window.pixelY <= 0);
    assert.ok((window.endY + 1) * 32 - window.pixelY >= 480);
    assert.equal(window.margin, 2);
  }
});

test('renderer presents complete backbuffer frames and retains the previous frame on failure', () => {
  const originalDocument = globalThis.document;
  const contexts = [];
  globalThis.document = {
    createElement: () => {
      const context = { imageSmoothingEnabled: true, drawImageCalls: 0, drawImage() { this.drawImageCalls += 1; } };
      contexts.push(context);
      return { width: 0, height: 0, getContext: () => context };
    },
  };
  try {
    const renderer = new CanvasRenderer({ append() {} }, {}, { logicalWidth: 640, logicalHeight: 480, tileSize: 32 });
    renderer.renderFrame = () => {};
    renderer.render({ scene: 'TITLE', mapId: 0 });
    assert.equal(contexts[0].drawImageCalls, 1);
    renderer.renderFrame = () => { throw new Error('incomplete-frame'); };
    assert.throws(() => renderer.render({ scene: 'PLAYING', mapId: 98 }), /incomplete-frame/);
    assert.equal(contexts[0].drawImageCalls, 1, 'visible frame was not cleared or replaced');
    assert.equal(renderer.diagnostics().retainedFrames, 1);
    assert.equal(renderer.diagnostics().frameHistory.at(-1).retainedPreviousFrame, true);
    assert.equal(renderer.diagnostics().frameHistory.at(-1).clearCalls, 0);
  } finally { globalThis.document = originalDocument; }
});

test('Map 98 event 16 retains its original symbol profile, page refresh, and collision settings', async () => {
  const map = await json('generated/maps/098.json'); const event = map.events['16'];
  assert.equal(symbolIdFromPage(event.pages[0]), 1);
  assert.deepEqual(SYMBOL_SETTINGS[1], { awayLevel: 0, awayLevelType: 1, reactionDistance: 3, dashDistance: 4, idleType: 1, visibilityDistance: 0, beforeSpeed: 0, afterSpeed: 4, beforeFrequency: 0, afterFrequency: 5, balloonId: 1, blockedRegions: [] });
  assert.equal(stopCountThreshold(5), 0); assert.equal(stopCountThreshold(3), 60);

  const engine = minimalEventEngine(map, { x: 7, y: 19 });
  engine.events.setupMap(map, 98);
  let runtime = engine.events.runtime(16, event);
  assert.equal(runtime.pageIndex, 0); assert.equal(runtime.symbolId, 1); assert.equal(runtime.trigger, 2); assert.equal(runtime.through, false); assert.equal(runtime.priority, 1);
  engine.state.selfSwitches['98,16,B'] = true;
  runtime = engine.events.refresh(event);
  assert.equal(runtime.pageIndex, 1); assert.equal(runtime.symbolId, null); assert.equal(runtime.trigger, 4); assert.equal(runtime.through, true);
  engine.state.selfSwitches['98,16,D'] = true;
  runtime = engine.events.refresh(event);
  assert.equal(runtime.pageIndex, 2, 'last valid page wins');
});

test('normal-priority events block the player while through and below-priority events do not', () => {
  const makeMap = (through, priority) => ({ width: 4, height: 4, events: { 1: { id: 1, name: 'fixture', x: 1, y: 0, pages: [{ condition: {}, graphic: { character_name: 'Actor1', direction: 2, pattern: 1 }, move_type: 0, move_speed: 3, move_frequency: 3, move_route: { repeat: true, list: [{ code: 0, parameters: [] }] }, walk_anime: true, step_anime: false, direction_fix: false, through, priority_type: priority, trigger: 1, list: [{ code: 0, indent: 0, parameters: [] }] }] } }, data: { data: [] } });
  for (const [through, priority, blocked] of [[false, 1, true], [true, 1, false], [false, 0, false]]) {
    const map = makeMap(through, priority); const engine = minimalEventEngine(map, { mapId: 1, x: 0, y: 0 });
    engine.collision = { passable: () => true, regionId: () => 0 };
    engine.events.setupMap(map, 1);
    assert.equal(engine.canStep(0, 0, 6), !blocked, `${JSON.stringify({ through, priority })}`);
  }
});

test('event diagonal movement uses VX Ace cardinal corner passability', () => {
  const map = { width: 4, height: 4, events: { 1: { id: 1, name: 'diagonal', x: 1, y: 1, pages: [{ condition: {}, graphic: { character_name: 'Actor1', direction: 2, pattern: 1 }, move_type: 0, move_speed: 3, move_frequency: 3, move_route: { repeat: true, list: [{ code: 0, parameters: [] }] }, walk_anime: true, step_anime: false, direction_fix: false, through: false, priority_type: 1, trigger: 0, list: [{ code: 0, indent: 0, parameters: [] }] }] } }, data: { data: [] } };
  const engine = minimalEventEngine(map, { mapId: 1, x: 0, y: 0 });
  engine.events.setupMap(map, 1);
  const runtime = engine.events.runtime(1, map.events[1]);
  engine.collision = { passable: (_x, _y, direction) => direction !== 6, regionId: () => 0 };
  assert.equal(engine.events.tryMove(map.events[1], runtime, 3), false, 'blocked east edge prevents southeast corner-cutting');
  assert.deepEqual([runtime.x, runtime.y], [1, 1]);
  engine.collision = { passable: () => true, regionId: () => 0 };
  assert.equal(engine.events.tryMove(map.events[1], runtime, 3), true);
  assert.deepEqual([runtime.x, runtime.y], [2, 2]);
});

test('random, approach, and repeating custom autonomous routes use page movement data', () => {
  for (const [moveType, route, expected] of [
    [1, { repeat: true, skippable: false, list: [{ code: 0, parameters: [] }] }, [1, 2]],
    [2, { repeat: true, skippable: false, list: [{ code: 0, parameters: [] }] }, [2, 1]],
    [3, { repeat: true, skippable: false, list: [{ code: 3, parameters: [] }, { code: 0, parameters: [] }] }, [2, 1]],
  ]) {
    const event = eventFixture(1, 1, 1, { moveType, route });
    const map = { width: 6, height: 6, events: { 1: event }, data: { data: [] } };
    const engine = minimalEventEngine(map, { mapId: 1, x: 4, y: 1 });
    engine.events.setupMap(map, 1); engine.events.randomInt = () => 0;
    const runtime = engine.events.runtime(1, event);
    engine.events.updateAutonomousMovement(event, runtime);
    assert.deepEqual([runtime.x, runtime.y], expected, `move type ${moveType}`);
    if (moveType === 3) {
      runtime.realX = runtime.x; runtime.realY = runtime.y;
      engine.events.updateAutonomousMovement(event, runtime);
      assert.equal(runtime.routeIndex, 1, 'repeat route reaches its terminator before looping');
    }
  }
});

test('events collide with non-through events regardless of the other event priority', () => {
  const mover = eventFixture(1, 1, 1); const obstacle = eventFixture(2, 2, 1, { priority: 0 });
  const map = { width: 5, height: 5, events: { 1: mover, 2: obstacle }, data: { data: [] } };
  const engine = minimalEventEngine(map, { mapId: 1, x: 4, y: 4 }); engine.events.setupMap(map, 1);
  const runtime = engine.events.runtime(1, mover);
  assert.equal(engine.events.tryMove(mover, runtime, 6), false);
  engine.events.runtime(2, obstacle).through = true;
  assert.equal(engine.events.tryMove(mover, runtime, 6), true);
});

test('dash radius, hysteresis, and facing produce the source symbol encounter conditions', () => {
  const event = eventFixture(1, 1, 1, { route: { repeat: true, skippable: false, list: [{ code: 45, parameters: ['enable_symbol_encount(1)'] }, { code: 0, parameters: [] }] }, trigger: 2 });
  const map = { width: 8, height: 5, events: { 1: event }, data: { data: [] } };
  const engine = minimalEventEngine(map, { mapId: 1, x: 5, y: 1 }); engine.events.setupMap(map, 1);
  const runtime = engine.events.runtime(1, event); runtime.direction = 6; engine.state.direction = 6;
  engine.state.dash = false; engine.isMoving = () => true; engine.events.updateSymbolReaction(event, runtime, false);
  assert.equal(runtime.symbolForming, false, 'normal radius is three tiles');
  engine.state.dash = true; engine.events.updateSymbolReaction(event, runtime, false);
  assert.equal(runtime.symbolForming, true, 'moving dash radius is four tiles');
  engine.state.x = 6; engine.events.updateSymbolReaction(event, runtime, false);
  assert.equal(runtime.symbolForming, true, 'forming hysteresis holds through dash radius plus one');
  engine.state.x = 0; engine.state.realX = 0; engine.state.realY = 1;
  assert.equal(engine.events.contactCondition(runtime, 0), 1, 'player behind a same-facing symbol is preemptive');
  engine.state.x = 2; engine.state.realX = 2;
  assert.equal(engine.events.contactCondition(runtime, 0), 2, 'player ahead of a same-facing symbol is surprise');
});

test('event-touch starts once and collision prevents hostile overlap', async () => {
  const event = eventFixture(1, 1, 1, { trigger: 2 });
  const map = { width: 5, height: 5, events: { 1: event }, data: { data: [] } };
  const engine = minimalEventEngine(map, { mapId: 1, x: 2, y: 1 });
  let runs = 0; let release;
  engine.interpreter.run = () => { runs += 1; return new Promise((resolve) => { release = resolve; }); };
  engine.events.setupMap(map, 1); const runtime = engine.events.runtime(1, event);
  assert.equal(engine.events.tryMove(event, runtime, 6), false);
  assert.equal(engine.events.tryMove(event, runtime, 6), false);
  await Promise.resolve();
  assert.equal(runs, 1); assert.deepEqual([runtime.x, runtime.y], [1, 1]);
  release(); await Promise.resolve(); await Promise.resolve();
});

test('real Map 98 hostile symbol chases, contacts, and enters troop 3 battle through command 301', async () => {
  const [map, tilesets, system, actors, classes, items, weapons, armors, enemies, troops, skills, states, commonEvents, inventoryDependencies, prefetchManifest] = await Promise.all([
    json('generated/maps/098.json'), json('generated/database/Tilesets.json'), json('generated/database/System.json'), json('generated/database/Actors.json'),
    json('generated/database/Classes.json'), json('generated/database/Items.json'), json('generated/database/Weapons.json'), json('generated/database/Armors.json'),
    json('generated/database/Enemies.json'), json('generated/database/Troops.json'), json('generated/database/Skills.json'), json('generated/database/States.json'),
    json('generated/database/CommonEvents.json'), json('generated/dependencies/inventory-dependencies.json'), json('generated/prefetch-manifest.json'),
  ]);
  const database = { system, tilesets, actors, classes, items, weapons, armors, enemies, troops, skills, states, commonEvents, prefetchManifest };
  const party = new PartySystem(database, inventoryDependencies); const partyState = party.initialState();
  const engine = Object.create(GameEngine.prototype);
  Object.assign(engine, {
    database, party, combat: new CombatSystem(database, party), map, collision: new CollisionMap(map, tilesets[map.tileset_id]),
    state: { ...partyState, schema: 'black-souls-st-state-v2', scene: 'PLAYING', mapId: 98, x: 7, y: 19, realX: 7, realY: 19, displayX: 0, displayY: 12, direction: 6, pattern: 1, originalPattern: 1, animationCount: 0, moveSpeed: 4, switches: {}, variables: {}, selfSwitches: {}, eventOverrides: {}, opacity: 255, originOpacity: 255, system: {}, pictures: {}, stealthCount: 0 },
    renderer: { ensureEventGraphics: async () => {}, showBalloon: async () => {}, setBattle: async () => {}, clearBattle() {}, stats: {} },
    audio: { playLoop: async () => {}, playSe: async () => {}, applyMapAudio: async () => {} },
    prefetch: { calls: [], scanUpcoming() {}, async prefetchAssets(paths, options) { this.calls.push({ paths, options }); return paths; } },
    diagnosticsLog: [], unsupported: new Set(), onSceneChange: () => {}, status: () => {}, input: { isDashPressed: () => false },
  });
  engine.recordDiagnostic = GameEngine.prototype.recordDiagnostic;
  engine.playSe = async (audio) => engine.audio.playSe(audio);
  engine.events = new GameEventSystem(engine); engine.interpreter = new EventInterpreter(engine); engine.events.setupMap(map, 98);

  for (let frame = 0; frame < 90 && engine.state.scene !== 'BATTLE'; frame += 1) {
    engine.events.update(1 / 60);
    await Promise.resolve();
  }
  assert.equal(engine.state.scene, 'BATTLE');
  assert.equal(engine.state.battle.troopId, 3); assert.equal(engine.state.battle.troopName, 'Lợn Đồ Tể');
  assert.ok(engine.events.chaseTrace.some((entry) => entry.type === 'detected'));
  assert.ok(engine.events.chaseTrace.some((entry) => entry.type === 'step'));
  assert.ok(engine.events.chaseTrace.some((entry) => entry.type === 'contact'));
  assert.ok(engine.prefetch.calls.some((entry) => entry.options.priority === 1 && entry.options.reason.includes('symbol-chase:98:16:3')));
  assert.ok(engine.prefetch.calls.some((entry) => entry.options.priority === 0 && entry.options.reason === 'battle:3'));
  assert.equal(engine.events.lastEncounter.eventId, 16); assert.equal(engine.events.lastEncounter.phase, 'interpreter');
});

function minimalEventEngine(map, { mapId = 98, x = 0, y = 0 } = {}) {
  const engine = Object.create(GameEngine.prototype);
  engine.map = map;
  engine.state = { scene: 'PLAYING', mapId, x, y, realX: x, realY: y, displayX: 0, displayY: 0, direction: 2, party: { members: [] }, actors: {}, switches: {}, variables: {}, selfSwitches: {}, eventOverrides: {}, opacity: 255, originOpacity: 255, stealthCount: 0 };
  engine.party = { quantity: () => 0 }; engine.collision = { passable: () => true, regionId: () => 0 };
  engine.renderer = { ensureEventGraphics: async () => {}, showBalloon: async () => {} };
  engine.audio = { playSe: async () => {} }; engine.playSe = async () => {};
  engine.database = { commonEvents: [], prefetchManifest: { battles: {} } }; engine.prefetch = { prefetchAssets: async () => [] };
  engine.interpreter = { running: false, run: async () => {} }; engine.events = new GameEventSystem(engine);
  engine.recordDiagnostic = () => {}; engine.handleInterpreterFailure = (error) => { throw error; };
  return engine;
}

function eventFixture(id, x, y, { moveType = 0, route = { repeat: true, skippable: false, list: [{ code: 0, parameters: [] }] }, priority = 1, through = false, trigger = 0 } = {}) {
  return { id, name: `event-${id}`, x, y, pages: [{ condition: {}, graphic: { character_name: 'Actor1', direction: 2, pattern: 1 }, move_type: moveType, move_speed: 3, move_frequency: 3, move_route: route, walk_anime: true, step_anime: false, direction_fix: false, through, priority_type: priority, trigger, list: [{ code: 0, indent: 0, parameters: [] }] }] };
}
