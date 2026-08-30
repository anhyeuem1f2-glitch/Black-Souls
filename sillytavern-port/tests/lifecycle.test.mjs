import assert from 'node:assert/strict';
import test from 'node:test';
import { GameEngine } from '../runtime/core/game-engine.js';
import { InputController } from '../runtime/core/input.js';
import { HOST_STATES, PRESENTATION_STATES, cancelScene, transitionHostState, transitionPresentationState } from '../runtime/core/lifecycle.js';

test('host lifecycle has deterministic pause, resume, error, and unmount routes', () => {
  assert.equal(transitionHostState(HOST_STATES.UNINITIALIZED, 'LOAD'), HOST_STATES.LOADING);
  assert.equal(transitionHostState(HOST_STATES.LOADING, 'SCENE:TITLE'), HOST_STATES.TITLE);
  assert.equal(transitionHostState(HOST_STATES.PLAYING, 'PAUSE'), HOST_STATES.PAUSED);
  assert.equal(transitionHostState(HOST_STATES.PAUSED, 'RESUME', HOST_STATES.PLAYING), HOST_STATES.PLAYING);
  assert.equal(transitionHostState(HOST_STATES.LOADING, 'ERROR'), HOST_STATES.ERROR);
  assert.equal(transitionHostState(HOST_STATES.PLAYING, 'UNMOUNT'), HOST_STATES.UNMOUNTED);
});

test('game Cancel opens/closes the game menu and never unmounts the host', () => {
  assert.equal(cancelScene('PLAYING'), 'MENU');
  assert.equal(cancelScene('MENU'), 'PLAYING');
  assert.notEqual(cancelScene('PLAYING'), 'UNMOUNTED');
});

test('browser fullscreen exit changes presentation only', () => {
  assert.equal(transitionPresentationState(PRESENTATION_STATES.WINDOWED, 'FULLSCREEN_ENTER'), PRESENTATION_STATES.FULLSCREEN);
  assert.equal(transitionPresentationState(PRESENTATION_STATES.FULLSCREEN, 'FULLSCREEN_EXIT'), PRESENTATION_STATES.WINDOWED);
  assert.equal(transitionHostState(HOST_STATES.PLAYING, 'FULLSCREEN_EXIT'), HOST_STATES.PLAYING);
});

test('input maps VX Ace confirm/cancel and preserves browser fullscreen Escape', () => {
  const handlers = {};
  const windowRef = {
    addEventListener: (name, handler) => { handlers[name] = handler; },
    removeEventListener: () => {},
  };
  const stage = { contains: () => false };
  const documentRef = { activeElement: stage, fullscreenElement: null };
  const input = new InputController(stage, { windowRef, documentRef });
  const event = (key, code = '') => ({ key, code, target: stage, prevented: false, preventDefault() { this.prevented = true; }, stopPropagation() {} });
  handlers.keydown(event('z'));
  assert.equal(input.takeConfirm(), true);
  handlers.keydown(event('Escape'));
  assert.equal(input.takeCancel(), true);
  documentRef.fullscreenElement = {};
  const fullscreenEscape = event('Escape');
  handlers.keydown(fullscreenEscape);
  assert.equal(input.takeCancel(), false);
  assert.equal(fullscreenEscape.prevented, false);
  documentRef.fullscreenElement = null;
  handlers.keydown(event('ArrowUp'));
  handlers.keydown(event('ArrowLeft'));
  assert.deepEqual(input.takeDirection(), [0, -1, 8]);
  assert.deepEqual(input.takeDirection(), [-1, -1, 7]);
  input.destroy();
});

test('engine enters the traced original title scene and Continue reflects slot availability', async () => {
  const scenes = [];
  const engine = new GameEngine({ loader: {}, renderer: {}, saves: {}, status: () => {}, onSceneChange: (scene) => scenes.push(scene) });
  engine.database = {
    system: { start_map_id: 7, start_x: 7, start_y: 6, title1_name: '1', title2_name: '', title_bgm: { name: 'タイトル、アリス' }, terms: { commands: Array.from({ length: 23 }, (_, index) => `command-${index}`) } },
    actors: [],
  };
  engine.renderer = { setTitle: async (system) => { assert.equal(system.title1_name, '1'); }, render: () => {} };
  engine.audio = { stop: () => {}, playLoop: async () => {} };
  engine.hasSave = true;
  engine.state = engine.initialState('LOADING');
  await engine.enterTitle();
  assert.equal(engine.state.scene, 'TITLE');
  assert.equal(engine.state.title.selected, 1);
  assert.equal(engine.state.title.commands[1].enabled, true);
  assert.equal(scenes.at(-1), 'TITLE');
});

test('New Game transitions through original map 7 without a launcher scene', async () => {
  const engine = new GameEngine({ loader: {}, renderer: {}, saves: {}, status: () => {} });
  engine.database = { system: { start_map_id: 7, start_x: 7, start_y: 6, party_members: [1] }, actors: [null, { character_name: '!Flame', character_index: 5 }], tilesets: [null, { name: 'フィールド' }] };
  engine.audio = { unlock: async () => {}, applyMapAudio: async () => {} };
  engine.loader = { map: async (id) => ({ id, width: 20, height: 15, tileset_id: 1, data: { data: [] }, events: {} }) };
  engine.renderer = { setMap: async () => {} };
  engine.runAutorunEvents = async () => {};
  engine.state = engine.initialState('TITLE');
  await engine.newGame();
  assert.equal(engine.state.scene, 'PLAYING');
  assert.equal(engine.state.mapId, 7);
  assert.deepEqual([engine.state.x, engine.state.y], [7, 6]);
});

test('actual engine Esc path opens and closes Menu without destroying state', () => {
  const engine = new GameEngine({ loader: {}, renderer: {}, saves: {}, status: () => {} });
  engine.database = { system: { terms: { commands: Array.from({ length: 23 }, (_, index) => `command-${index}`) } } };
  engine.state = { scene: 'PLAYING', mapId: 7, x: 7, y: 6 };
  engine.audio = { unlock: async () => {} };
  engine.interpreter = { running: false };
  let cancel = true;
  engine.input = { takeInteraction: () => false, takeCancel: () => { const value = cancel; cancel = false; return value; }, takeConfirm: () => false, takeDirection: () => null };
  engine.update();
  assert.equal(engine.state.scene, 'MENU');
  assert.equal(engine.state.mapId, 7);
  cancel = true;
  engine.update();
  assert.equal(engine.state.scene, 'PLAYING');
  assert.equal(engine.state.mapId, 7);
});

test('title Shutdown requests deliberate host exit instead of unmounting the engine', () => {
  let exitRequest = null;
  const engine = new GameEngine({ loader: {}, renderer: {}, saves: {}, status: () => {}, onExitRequest: (request) => { exitRequest = request; } });
  engine.state = { scene: 'TITLE', title: { selected: 2, commands: [
    { symbol: 'new_game', enabled: true }, { symbol: 'continue', enabled: false }, { symbol: 'shutdown', enabled: true },
  ] } };
  engine.audio = { unlock: async () => {} };
  engine.input = { takeInteraction: () => false, takeDirection: () => null, takeCancel: () => false, takeConfirm: () => true };
  engine.update();
  assert.equal(exitRequest.reason, 'title-shutdown');
  assert.equal(engine.state.scene, 'TITLE');
  assert.notEqual(engine.running, false);
});
