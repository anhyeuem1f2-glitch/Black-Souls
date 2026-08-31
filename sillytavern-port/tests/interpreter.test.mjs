import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { EventInterpreter } from '../runtime/map/interpreter.js';
import { GameEngine } from '../runtime/core/game-engine.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function command(code, parameters = [], indent = 0) { return { code, parameters, indent }; }

test('choice interpreter executes only the selected original-style branch', async () => {
  const seen = [];
  const engine = mockEngine({ choice: 1, seen });
  const interpreter = new EventInterpreter(engine);
  await interpreter.run([
    command(102, [['first', 'second'], 2]),
    command(402, [0, 'first']), command(121, [1, 1, 0], 1),
    command(402, [1, 'second']), command(121, [2, 2, 0], 1),
    command(404), command(0),
  ]);
  assert.equal(engine.state.switches[1], undefined);
  assert.equal(engine.state.switches[2], true);
});

test('conditional interpreter selects the matching switch branch', async () => {
  const engine = mockEngine();
  engine.state.switches[4] = true;
  const interpreter = new EventInterpreter(engine);
  await interpreter.run([
    command(111, [0, 4, 0]),
    command(121, [10, 10, 0], 1),
    command(411),
    command(121, [11, 11, 0], 1),
    command(412), command(0),
  ]);
  assert.equal(engine.state.switches[10], true);
  assert.equal(engine.state.switches[11], undefined);
});

test('actor-name condition matches the original VX Ace condition shape', async () => {
  const engine = mockEngine();
  engine.state.actors = { 1: { name: 'Grimm' } };
  const interpreter = new EventInterpreter(engine);
  await interpreter.run([
    command(111, [4, 1, 1, 'Grimm']),
    command(121, [20, 20, 0], 1),
    command(411), command(121, [21, 21, 0], 1), command(412), command(0),
  ]);
  assert.equal(engine.state.switches[20], true);
  assert.equal(engine.state.switches[21], undefined);
});

test('original map 97 name-confirmation prefix reaches its original choices', async () => {
  const map = JSON.parse(await readFile(join(root, 'generated', 'maps', '097.json'), 'utf8'));
  const originalPrefix = map.events['1'].pages[0].list.slice(10, 60);
  const seen = [];
  const engine = mockEngine();
  engine.state.actors = { 1: { name: '' } };
  engine.nameInput = async () => { engine.state.actors[1].name = 'Thien'; };
  engine.showMessage = async (text) => seen.push(['message', text]);
  engine.showChoice = async (options) => { seen.push(['choice', options]); throw new StopAtChoice(); };
  const interpreter = new EventInterpreter(engine);
  await assert.rejects(() => interpreter.run(originalPrefix, { eventId: 1 }), StopAtChoice);
  assert.deepEqual(seen.at(-1), ['choice', ['Đúng', 'Không đúng']]);
});

test('command 303 suspends and resumes the same interpreter exactly once', async () => {
  const gate = deferred();
  const seen = [];
  const engine = mockEngine();
  engine.state.actors = { 1: { name: '' } };
  engine.showMessage = async (text) => seen.push(text);
  let nameCalls = 0;
  engine.nameInput = async (actorId, maxLength) => {
    nameCalls += 1;
    assert.deepEqual([actorId, maxLength], [1, 6]);
    const name = await gate.promise;
    engine.state.actors[actorId].name = name;
  };
  const interpreter = new EventInterpreter(engine);
  const run = interpreter.run([
    command(101), command(401, ['A']), command(303, [1, 6]), command(101), command(401, ['B']), command(0),
  ], { eventId: 7 });
  await until(() => interpreter.current?.waitMode === 'name_input');
  assert.equal(interpreter.current.index, 2);
  assert.equal(interpreter.running, true);
  gate.resolve('Alice');
  await run;
  assert.deepEqual(seen, ['A', 'B']);
  assert.equal(engine.state.actors[1].name, 'Alice');
  assert.equal(nameCalls, 1);
  assert.equal(interpreter.running, false);
  assert.equal(interpreter.current.waitMode, '');
  assert.equal(interpreter.traceLog.filter((entry) => entry.result === 'COMMAND_START' && entry.code === 303).length, 1);
});

test('sequential name modals each resume once without stale wait state', async () => {
  const engine = mockEngine();
  engine.state.actors = { 1: { name: '' }, 2: { name: '' } };
  const names = ['Alice', 'Grimm'];
  const calls = [];
  engine.nameInput = async (actorId) => {
    calls.push(actorId);
    engine.state.actors[actorId].name = names[calls.length - 1];
  };
  const interpreter = new EventInterpreter(engine);
  await interpreter.run([command(303, [1, 6]), command(303, [2, 8]), command(121, [9, 9, 0]), command(0)]);
  assert.deepEqual(calls, [1, 2]);
  assert.equal(engine.state.actors[1].name, 'Alice');
  assert.equal(engine.state.actors[2].name, 'Grimm');
  assert.equal(engine.state.switches[9], true);
  assert.equal(interpreter.running, false);
  assert.equal(interpreter.current.waitMode, '');
});

test('browser name modal updates actor state, restores focus, and clears its scene stack', async () => {
  const engine = Object.create(GameEngine.prototype);
  let focusCalls = 0;
  let clearCalls = 0;
  engine.state = { scene: 'PLAYING', actors: { 1: { name: '' } }, message: null, choice: null };
  engine.modalStack = [];
  engine.modalSequence = 0;
  engine.interpreterTraceEnabled = false;
  engine.interpreter = { running: true, snapshot: () => ({ running: true, index: 11, code: 303, waitMode: 'name_input' }) };
  engine.input = { clear: () => { clearCalls += 1; } };
  engine.renderer = { stage: { focus: () => { focusCalls += 1; } }, promptText: async () => 'Alice' };
  engine.diagnosticsLog = [];
  await engine.nameInput(1, 6);
  assert.equal(engine.state.actors[1].name, 'Alice');
  assert.equal(engine.state.scene, 'PLAYING');
  assert.deepEqual(engine.modalStack, []);
  assert.equal(clearCalls, 2);
  assert.equal(focusCalls, 1);
  assert.equal(engine.diagnosticsLog.some((entry) => entry.type === 'name-input-return-frame'), true);
});

test('actual opening survives missing animation 109 and reaches the Map 10 playable checkpoint', async () => {
  const map97 = JSON.parse(await readFile(join(root, 'generated', 'maps', '097.json'), 'utf8'));
  const map10 = JSON.parse(await readFile(join(root, 'generated', 'maps', '010.json'), 'utf8'));
  const diagnostics = [];
  const messages = [];
  const transfers = [];
  const engine = mockEngine();
  engine.state.mapId = 97;
  engine.state.actors = { 1: { name: '' } };
  engine.waitFrames = async () => {};
  engine.showMessage = async (text) => messages.push(text);
  engine.showChoice = async () => 0;
  engine.nameInput = async (actorId) => { engine.state.actors[actorId].name = 'Alice'; };
  engine.showAnimation = async (_targetId, animationId) => {
    if (animationId === 109) throw new Error('HTTP 404 Graphics/Animations/Light6.png');
  };
  engine.showBalloon = async () => {};
  engine.transfer = async (mapId, x, y) => { engine.state.mapId = mapId; transfers.push([mapId, x, y]); };
  engine.recordDiagnostic = (entry) => diagnostics.push(entry);
  const interpreter = new EventInterpreter(engine);
  await interpreter.run(map97.events['1'].pages[0].list, { eventId: 1 });
  assert.deepEqual(transfers.at(-1), [10, 15, 16]);
  assert.equal(messages.some((text) => text.includes('Một cái tên hay')), true);
  assert.equal(diagnostics.some((entry) => entry.type === 'visual-command-failed-continuing' && entry.animationId === 109), true);
  await interpreter.run(map10.events['38'].pages[0].list, { eventId: 38 });
  assert.equal(engine.state.selfSwitches['10,38,A'], true);
  assert.equal(interpreter.running, false);
  assert.equal(interpreter.current.waitMode, '');
});

class StopAtChoice extends Error {}

function mockEngine({ choice = 0 } = {}) {
  const diagnostics = [];
  return {
    state: { mapId: 1, switches: {}, variables: {}, selfSwitches: {}, actors: {} },
    showChoice: async () => choice,
    showMessage: async () => {},
    nameInput: async () => {},
    setActorName: () => {},
    renderer: { fadeTo: async () => {} },
    playSe: async () => {},
    showAnimation: async () => {},
    showBalloon: async () => {},
    transfer: async () => {},
    runRubyCompatibility: () => {},
    consumePendingAutorun: () => false,
    noteUnsupported: () => {},
    evaluateRubyCondition: () => false,
    recordDiagnostic: (entry) => diagnostics.push(entry),
    diagnostics,
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function until(predicate) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('Timed out waiting for deterministic interpreter state');
}
