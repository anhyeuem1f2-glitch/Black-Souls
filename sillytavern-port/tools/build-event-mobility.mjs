import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyEventPage } from '../runtime/map/event-mobility.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mapsDirectory = join(root, 'generated', 'maps');
const output = join(root, 'generated', 'event-mobility-index.json');
const files = (await readdir(mapsDirectory)).filter((name) => /^\d{3}\.json$/.test(name)).sort();
const pages = [];
const counts = {};

for (const file of files) {
  const mapId = Number(file.slice(0, 3));
  const map = JSON.parse(await readFile(join(mapsDirectory, file), 'utf8'));
  for (const event of Object.values(map.events ?? {}).filter(Boolean).sort((a, b) => Number(a.id) - Number(b.id))) {
    for (const [pageIndex, page] of (event.pages ?? []).entries()) {
      const result = classifyEventPage(event, page);
      counts[result.classification] = Number(counts[result.classification] ?? 0) + 1;
      pages.push({
        mapId,
        mapName: map.display_name ?? '',
        eventId: Number(event.id),
        eventName: event.name ?? '',
        position: { x: Number(event.x) || 0, y: Number(event.y) || 0 },
        pageIndex,
        classification: result.classification,
        symbolId: result.symbolId ?? null,
        movement: {
          type: Number(page.move_type) || 0,
          speed: Number(page.move_speed) || 0,
          frequency: Number(page.move_frequency) || 0,
          route: page.move_route ?? null,
          walkAnimation: Boolean(page.walk_anime),
          stepAnimation: Boolean(page.step_anime),
          directionFix: Boolean(page.direction_fix),
          through: Boolean(page.through),
        },
        trigger: Number(page.trigger),
        priority: Number(page.priority_type) || 0,
        graphic: page.graphic ?? null,
        evidence: result.evidence,
      });
    }
  }
}

await writeFile(output, `${JSON.stringify({ schema: 'black-souls-event-mobility-v1', source: 'generated/maps/*.json (read-only original extraction)', mapCount: files.length, pageCount: pages.length, counts, pages }, null, 2)}\n`);
console.log(`Wrote ${pages.length} page classifications to ${output}.`);
