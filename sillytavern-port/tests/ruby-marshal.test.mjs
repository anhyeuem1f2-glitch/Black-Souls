import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseRubyMarshal, RubyString } from '../tools/lib/ruby-marshal.mjs';

const portRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataRoot = join(portRoot, '..', 'Data');

test('parses Scripts.rvdata2 without data loss at the archive boundary', async () => {
  const scripts = parseRubyMarshal(await readFile(join(dataRoot, 'Scripts.rvdata2')));
  assert.equal(scripts.length, 167);
  assert.ok(scripts.every((entry) => Array.isArray(entry) && entry[1] instanceof RubyString && entry[2] instanceof RubyString));
});

test('parses all 150 map files', async () => {
  for (let id = 1; id <= 150; id += 1) {
    const name = `Map${String(id).padStart(3, '0')}.rvdata2`;
    const map = parseRubyMarshal(await readFile(join(dataRoot, name)));
    assert.equal(map.className, 'RPG::Map', name);
  }
});

test('parses every rvdata2 database file', async () => {
  const names = (await readdir(dataRoot)).filter((name) => name.endsWith('.rvdata2'));
  assert.equal(names.length, 165);
  for (const name of names) assert.notEqual(parseRubyMarshal(await readFile(join(dataRoot, name))), undefined, name);
});
