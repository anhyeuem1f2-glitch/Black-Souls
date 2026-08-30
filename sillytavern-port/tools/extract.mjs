import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { normalizeRubyValue, parseRubyMarshal, RubyString } from './lib/ruby-marshal.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const portRoot = resolve(here, '..');
const repoRoot = resolve(portRoot, '..');
const dataRoot = join(repoRoot, 'Data');
const generatedRoot = join(portRoot, 'generated');

await mkdir(join(generatedRoot, 'database'), { recursive: true });
await mkdir(join(generatedRoot, 'maps'), { recursive: true });
await mkdir(join(generatedRoot, 'scripts'), { recursive: true });

const files = (await readdir(dataRoot)).filter((name) => name.endsWith('.rvdata2')).sort();
const manifest = { schema: 'black-souls-normalized-data-v1', source: 'RPG Maker VX Ace Ruby Marshal 4.8', files: [] };

for (const name of files) {
  const sourcePath = join(dataRoot, name);
  let parsed;
  try {
    parsed = parseRubyMarshal(await readFile(sourcePath));
  } catch (error) {
    throw new Error(`Failed to parse ${name}: ${error.message}`, { cause: error });
  }
  if (name === 'Scripts.rvdata2') {
    const scripts = [];
    for (const [index, entry] of parsed.entries()) {
      if (!Array.isArray(entry) || entry.length < 3 || !(entry[1] instanceof RubyString) || !(entry[2] instanceof RubyString)) {
        throw new Error(`Unexpected script entry ${index}`);
      }
      const id = entry[0] instanceof RubyString ? entry[0].text() : entry[0];
      const title = entry[1].text();
      const source = inflateSync(entry[2].bytes).toString('utf8');
      const filename = `${String(index).padStart(3, '0')}-${sanitize(title || 'unnamed')}.rb`;
      await writeFile(join(generatedRoot, 'scripts', filename), source, 'utf8');
      scripts.push({ index, id, title, filename, bytes: Buffer.byteLength(source), lines: source.split(/\r?\n/).length });
    }
    await json(join(generatedRoot, 'scripts', 'index.json'), { schema: 'black-souls-rgss3-scripts-v1', scripts });
    manifest.files.push({ source: name, kind: 'scripts', records: scripts.length });
    continue;
  }

  const normalized = normalizeRubyValue(parsed);
  const mapMatch = /^Map(\d{3})\.rvdata2$/.exec(name);
  const outputPath = mapMatch
    ? join(generatedRoot, 'maps', `${mapMatch[1]}.json`)
    : join(generatedRoot, 'database', `${basename(name, '.rvdata2')}.json`);
  await json(outputPath, normalized);
  manifest.files.push({ source: name, kind: mapMatch ? 'map' : 'database', output: outputPath.slice(portRoot.length + 1).replaceAll('\\', '/') });
}

await json(join(generatedRoot, 'manifest.json'), manifest);
console.log(`Extracted ${manifest.files.length} rvdata2 files (${manifest.files.filter((item) => item.kind === 'map').length} maps).`);

function sanitize(value) {
  return value.normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || 'unnamed';
}

async function json(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
