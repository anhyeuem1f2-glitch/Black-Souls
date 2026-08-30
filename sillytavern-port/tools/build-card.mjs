import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const portRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cardRoot = join(portRoot, 'card');
await mkdir(cardRoot, { recursive: true });
const content = await readFile(join(cardRoot, 'card-entry.js'), 'utf8');

const card = {
  spec: 'chara_card_v3',
  spec_version: '3.0',
  data: {
    name: 'BLACK SOULS',
    description: 'Deterministic browser game host for the BLACK SOULS SillyTavern port. Gameplay does not call an AI model.',
    personality: '',
    scenario: '',
    first_mes: '',
    mes_example: '',
    creator_notes: 'Requires TavernHelper / JS-Slash-Runner 4.8.19 or compatible. Enable the included character script when SillyTavern asks. Runtime loading automatically checks jsDelivr primary, jsDelivr testing fallback, then GitHub Raw diagnostics. Press Escape to close the game surface; use the TavernHelper button to reopen it.',
    system_prompt: '',
    post_history_instructions: '',
    alternate_greetings: [],
    tags: ['game', 'BLACK SOULS', 'no-llm-gameplay', 'TavernHelper'],
    creator: 'anhyeuem1f2-glitch / Codex port tooling',
    character_version: '0.1.1-dev',
    extensions: {
      talkativeness: '0.0',
      favorite: false,
      tavern_helper: {
        scripts: [{
          type: 'script', enabled: true, name: 'BLACK SOULS Game Host', id: 'black-souls-game-host-v1',
          content, info: 'Loads the versioned browser runtime through preflighted CDN fallbacks and presents it in the TavernHelper script iframe. No generation API is used.',
          button: { enabled: true, buttons: [{ name: 'Open BLACK SOULS', visible: true }] },
          data: {}, export_with: { data: true, button: true },
        }],
        variables: {},
      },
    },
    character_book: { name: 'BLACK SOULS Runtime Metadata', description: '', scan_depth: 0, token_budget: 0, recursive_scanning: false, entries: [] },
    assets: [],
    nickname: '',
    creator_notes_multilingual: {},
    source: ['https://github.com/anhyeuem1f2-glitch/Black-Souls'],
    group_only_greetings: [],
  },
};

await writeFile(join(cardRoot, 'Black_Souls_ST.json'), `${JSON.stringify(card, null, 2)}\n`, 'utf8');
console.log('Built card/Black_Souls_ST.json');
