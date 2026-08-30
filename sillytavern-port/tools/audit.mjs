import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const portRoot = resolve(here, '..');
const generatedRoot = join(portRoot, 'generated');
const auditRoot = join(generatedRoot, 'audit');
await mkdir(auditRoot, { recursive: true });

const commandNames = new Map(Object.entries({
  0: 'End', 101: 'Show Text', 102: 'Show Choices', 103: 'Input Number', 104: 'Select Key Item',
  105: 'Show Scrolling Text', 108: 'Comment', 111: 'Conditional Branch', 112: 'Loop', 113: 'Break Loop',
  115: 'Exit Event Processing', 117: 'Common Event', 118: 'Label', 119: 'Jump to Label', 121: 'Control Switches',
  122: 'Control Variables', 123: 'Control Self Switch', 124: 'Control Timer', 125: 'Change Gold', 126: 'Change Items',
  127: 'Change Weapons', 128: 'Change Armors', 129: 'Change Party Member', 132: 'Change Battle BGM',
  133: 'Change Battle End ME', 134: 'Change Save Access', 135: 'Change Menu Access', 136: 'Change Encounter',
  201: 'Transfer Player', 202: 'Set Vehicle Location', 203: 'Set Event Location', 204: 'Scroll Map',
  205: 'Set Move Route', 206: 'Get On/Off Vehicle', 211: 'Change Transparency', 212: 'Show Animation',
  213: 'Show Balloon Icon', 214: 'Erase Event', 216: 'Change Player Followers', 217: 'Gather Followers',
  221: 'Fadeout Screen', 222: 'Fadein Screen', 223: 'Tint Screen', 224: 'Flash Screen', 225: 'Shake Screen',
  230: 'Wait', 231: 'Show Picture', 232: 'Move Picture', 233: 'Rotate Picture', 234: 'Tint Picture',
  235: 'Erase Picture', 236: 'Set Weather Effects', 241: 'Play BGM', 242: 'Fadeout BGM', 243: 'Save BGM',
  244: 'Replay BGM', 245: 'Play BGS', 246: 'Fadeout BGS', 249: 'Play ME', 250: 'Play SE', 251: 'Stop SE',
  261: 'Play Movie', 281: 'Change Map Name Display', 282: 'Change Tileset', 283: 'Change Battle Back',
  284: 'Change Parallax Back', 285: 'Get Location Info', 301: 'Battle Processing', 302: 'Shop Processing',
  303: 'Name Input Processing', 311: 'Change HP', 312: 'Change MP', 313: 'Change State', 314: 'Recover All',
  315: 'Change EXP', 316: 'Change Level', 317: 'Change Parameter', 318: 'Change Skill', 319: 'Change Equipment',
  320: 'Change Name', 321: 'Change Class', 322: 'Change Actor Graphic', 323: 'Change Vehicle Graphic',
  324: 'Change Nickname', 331: 'Change Enemy HP', 332: 'Change Enemy MP', 333: 'Change Enemy State',
  334: 'Enemy Recover All', 335: 'Enemy Appear', 336: 'Enemy Transform', 337: 'Show Battle Animation',
  339: 'Force Action', 340: 'Abort Battle', 351: 'Open Menu Screen', 352: 'Open Save Screen',
  353: 'Game Over', 354: 'Return to Title Screen', 355: 'Script', 401: 'Text Data', 402: 'When Choice',
  403: 'When Cancel', 404: 'End Choices', 405: 'Scrolling Text Data', 408: 'Comment Continuation',
  411: 'Else', 412: 'Branch End', 413: 'Repeat Above', 505: 'Move Route Command', 601: 'Battle Win',
  602: 'Battle Escape', 603: 'Battle Lose', 604: 'Battle End', 605: 'Shop Goods', 655: 'Script Continuation',
}));

const coverage = new Map();
const snippets = new Map();
const runtimeCoverage = new Map(Object.entries({
  0: ['complete', true], 101: ['partial', false], 108: ['complete', true], 121: ['complete', true],
  102: ['partial', true], 111: ['partial', true], 115: ['complete', false], 118: ['complete', false], 119: ['complete', false],
  122: ['partial', false], 123: ['complete', false], 201: ['partial', true], 205: ['partial', true],
  221: ['partial', true], 222: ['partial', true], 230: ['complete', false], 250: ['partial', true],
  303: ['partial', true], 320: ['complete', false], 355: ['partial', false], 401: ['complete', true],
  402: ['complete', true], 403: ['complete', true], 404: ['complete', true], 408: ['complete', false],
  411: ['complete', true], 412: ['complete', true], 505: ['partial', true], 655: ['complete', false],
}));

for (let mapId = 1; mapId <= 150; mapId += 1) {
  const id = String(mapId).padStart(3, '0');
  const map = await json(join(generatedRoot, 'maps', `${id}.json`));
  for (const event of Object.values(map.events ?? {})) {
    if (!event?.pages) continue;
    for (let page = 0; page < event.pages.length; page += 1) {
      consumeList(event.pages[page].list ?? [], { kind: 'map', id: mapId, eventId: event.id, page });
    }
  }
}

const commonEvents = await json(join(generatedRoot, 'database', 'CommonEvents.json'));
for (let id = 1; id < commonEvents.length; id += 1) {
  const event = commonEvents[id];
  if (event?.list) consumeList(event.list, { kind: 'common-event', id });
}

const eventCoverage = [...coverage.values()]
  .map((item) => {
    const [implementation, tested] = runtimeCoverage.get(String(item.code)) ?? runtimeCoverage.get(item.code) ?? ['none', false];
    return { ...item, maps: [...item.maps].sort((a, b) => a - b), commonEvents: [...item.commonEvents].sort((a, b) => a - b), implementation, tested };
  })
  .sort((a, b) => a.code - b.code);
const embeddedRuby = [...snippets.values()].sort((a, b) => b.occurrences - a.occurrences || a.hash.localeCompare(b.hash));
await writeJson(join(auditRoot, 'event-command-coverage.json'), eventCoverage);
await writeJson(join(auditRoot, 'embedded-ruby.json'), embeddedRuby);

const scriptIndex = await json(join(generatedRoot, 'scripts', 'index.json'));
const scripts = [];
for (const metadata of scriptIndex.scripts) {
  const source = await readFile(join(generatedRoot, 'scripts', metadata.filename), 'utf8');
  scripts.push({
    ...metadata,
    layer: metadata.index <= 108 ? 'RGSS3 core' : metadata.index === 166 ? 'Main' : 'BLACK SOULS custom/plugin',
    win32ApiReferences: matches(source, /Win32API/gi),
    evalReferences: matches(source, /\beval\s*\(/g),
    fileIoReferences: matches(source, /\b(?:File|Dir)\s*[.:(]/g),
    loadDataReferences: matches(source, /\b(?:load_data|save_data)\b/g),
  });
}
await writeJson(join(auditRoot, 'script-coverage.json'), scripts);

const system = await json(join(generatedRoot, 'database', 'System.json'));
const summary = {
  schema: 'black-souls-port-audit-v1',
  maps: 150,
  commonEvents: commonEvents.filter(Boolean).length,
  eventCommandTypes: eventCoverage.length,
  eventCommands: eventCoverage.reduce((sum, item) => sum + item.count, 0),
  embeddedRubySnippets: embeddedRuby.length,
  embeddedRubyOccurrences: embeddedRuby.reduce((sum, item) => sum + item.occurrences, 0),
  scripts: scripts.length,
  customScripts: scripts.filter((item) => item.layer === 'BLACK SOULS custom/plugin').length,
  customScriptBytes: scripts.filter((item) => item.layer === 'BLACK SOULS custom/plugin').reduce((sum, item) => sum + item.bytes, 0),
  customScriptLines: scripts.filter((item) => item.layer === 'BLACK SOULS custom/plugin').reduce((sum, item) => sum + item.lines, 0),
  win32ApiReferences: scripts.reduce((sum, item) => sum + item.win32ApiReferences, 0),
  start: { mapId: system.start_map_id, x: system.start_x, y: system.start_y },
};
await writeJson(join(auditRoot, 'summary.json'), summary);
await writeFile(join(portRoot, 'EVENT_COMMAND_COVERAGE.md'), eventCoverageMarkdown(summary, eventCoverage, embeddedRuby), 'utf8');
await writeFile(join(portRoot, 'CUSTOM_SCRIPT_COVERAGE.md'), scriptCoverageMarkdown(summary, scripts), 'utf8');

console.log(JSON.stringify(summary, null, 2));

function consumeList(list, source) {
  for (let index = 0; index < list.length; index += 1) {
    const command = list[index];
    if (!command || typeof command.code !== 'number') continue;
    let item = coverage.get(command.code);
    if (!item) {
      item = { code: command.code, name: commandNames.get(String(command.code)) ?? commandNames.get(command.code) ?? 'Unknown', count: 0, maps: new Set(), commonEvents: new Set() };
      coverage.set(command.code, item);
    }
    item.count += 1;
    if (source.kind === 'map') item.maps.add(source.id);
    else item.commonEvents.add(source.id);

    if (command.code === 355) {
      const lines = [stringValue(command.parameters?.[0])];
      while (list[index + 1]?.code === 655) lines.push(stringValue(list[++index].parameters?.[0]));
      recordSnippet(lines.join('\n'), 'event-script', source);
    }
    if (command.code === 111 && command.parameters?.[0] === 12) {
      recordSnippet(stringValue(command.parameters?.[1]), 'branch-script', source);
    }
  }
}

function recordSnippet(source, kind, location) {
  if (!source) return;
  const hash = createHash('sha256').update(source).digest('hex').slice(0, 16);
  const existing = snippets.get(hash) ?? { hash, kind, source, occurrences: 0, locations: [] };
  existing.occurrences += 1;
  if (existing.locations.length < 25) existing.locations.push(location);
  snippets.set(hash, existing);
}

function stringValue(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value.$string === 'string') return value.$string;
  return value == null ? '' : JSON.stringify(value);
}

function matches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function eventCoverageMarkdown(summary, commands, ruby) {
  const rows = commands.map((item) => `| ${item.code} | ${item.name} | ${item.count} | ${item.maps.length} | ${item.commonEvents.length} | ${item.implementation} | ${item.tested ? 'yes' : 'no'} |`).join('\n');
  const rubyRows = ruby.slice(0, 100).map((item) => `| \`${item.hash}\` | ${item.kind} | ${item.occurrences} | \`${escapeCell(item.source.split(/\r?\n/, 1)[0].slice(0, 100))}\` |`).join('\n');
  return `# Event Command Coverage\n\nGenerated from all 150 maps and ${summary.commonEvents} common events. Unsupported commands remain explicit; this report does not imply compatibility.\n\n- Command instances: ${summary.eventCommands}\n- Distinct command codes: ${summary.eventCommandTypes}\n- Distinct embedded Ruby snippets: ${summary.embeddedRubySnippets}\n\n| Code | VX Ace command | Count | Maps | Common events | Implemented | Tested |\n|---:|---|---:|---:|---:|---|---|\n${rows}\n\n## Embedded Ruby inventory\n\nThe machine-readable complete inventory, including full source and locations, is in \`generated/audit/embedded-ruby.json\`.\n\n| Hash | Kind | Uses | First line |\n|---|---|---:|---|\n${rubyRows}\n`;
}

function scriptCoverageMarkdown(summary, allScripts) {
  const custom = allScripts.filter((item) => item.layer === 'BLACK SOULS custom/plugin');
  const rows = custom.map((item) => `| ${item.index} | ${escapeCell(item.title)} | ${item.lines} | ${item.bytes} | ${item.win32ApiReferences} | not ported |`).join('\n');
  return `# Custom Script Coverage\n\nGenerated from the decompressed \`Data/Scripts.rvdata2\` archive.\n\n- Total entries: ${summary.scripts}\n- Custom/plugin entries: ${summary.customScripts}\n- Custom/plugin source: ${summary.customScriptLines} lines / ${summary.customScriptBytes} bytes\n- Static \`Win32API\` references across all scripts: ${summary.win32ApiReferences}\n\n| Index | Script | Lines | Bytes | Win32API refs | Browser status |\n|---:|---|---:|---:|---:|---|\n${rows}\n`;
}

function escapeCell(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('`', '\\`');
}

async function json(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
