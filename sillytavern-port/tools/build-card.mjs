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
    description: 'Deterministic BLACK SOULS browser port. Selecting the card boots directly into the original title scene; gameplay makes no AI/model call.',
    personality: '',
    scenario: '',
    first_mes: '',
    mes_example: '',
    creator_notes: 'Requires TavernHelper / JS-Slash-Runner 4.8.19 or compatible. Re-import this v0.5.0 card and enable its character script when SillyTavern asks. It auto-mounts directly into the original BLACK SOULS title scene and makes no AI call. Runtime is pinned to immutable tag systems-v0.5.0 with jsDelivr/testingcf/GitHub Raw module fallbacks. This release adds whole-game dependency indexes, resource-gated page/graphic changes, the original Alice blood/corpse page transition, persistent item/equipment/shop/synthesis systems, and a real-data MAX_AP=4000 battle loop with original difficulty-variable scaling. Predictive prefetch remains bounded and map-scoped. Esc is VX Ace Cancel/Menu and never closes the host; use Exit to SillyTavern to leave.',
    system_prompt: '',
    post_history_instructions: '',
    alternate_greetings: [],
    tags: ['game', 'BLACK SOULS', 'no-llm-gameplay', 'TavernHelper'],
    creator: 'anhyeuem1f2-glitch / Codex port tooling',
    character_version: '0.5.0',
    extensions: {
      talkativeness: '0.0',
      favorite: false,
      tavern_helper: {
        scripts: [{
          type: 'script', enabled: true, name: 'BLACK SOULS Direct Game Host', id: 'black-souls-game-host-v2',
          content, info: 'Auto-loads the pinned browser runtime through preflighted CDN fallbacks and enters the original title scene in the TavernHelper script iframe. No generation API is used.',
          button: { enabled: false, buttons: [] },
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
