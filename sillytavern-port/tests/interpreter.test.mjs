import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { EventInterpreter } from '../runtime/map/interpreter.js';

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

class StopAtChoice extends Error {}

function mockEngine({ choice = 0 } = {}) {
  return {
    state: { mapId: 1, switches: {}, variables: {}, selfSwitches: {}, actors: {} },
    showChoice: async () => choice,
    showMessage: async () => {},
    nameInput: async () => {},
    setActorName: () => {},
    renderer: { fadeTo: async () => {} },
    playSe: () => {},
    runRubyCompatibility: () => {},
    consumePendingAutorun: () => false,
    noteUnsupported: () => {},
    evaluateRubyCondition: () => false,
  };
}
