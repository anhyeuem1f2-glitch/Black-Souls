import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateVerification } from './release-schema.mjs';

const portRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(portRoot, '..');
const cardRoot = join(portRoot, 'card');
const packageJson = JSON.parse(await readFile(join(portRoot, 'package.json'), 'utf8'));
const verificationPath = resolve(portRoot, argument('--verification') ?? 'release/verified-runtime.json');
const verification = validateVerification(JSON.parse(await readFile(verificationPath, 'utf8')), verificationPath);

const bundle = await build({
  entryPoints: [join(cardRoot, 'card-entry.js')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: ['es2022'],
  charset: 'utf8',
  legalComments: 'none',
  minify: false,
  define: {
    __BLACK_SOULS_RUNTIME_REF__: JSON.stringify(verification.ref),
    __BLACK_SOULS_RUNTIME_SHA256__: JSON.stringify(verification.entrySha256),
  },
});
const content = bundle.outputFiles[0].text;
if (/__BLACK_SOULS_RUNTIME_(?:REF|SHA256)__/.test(content)) throw new Error('Card loader contains an unresolved release token.');

const card = {
  spec: 'chara_card_v3',
  spec_version: '3.0',
  data: {
    name: 'BLACK SOULS',
    description: 'Deterministic BLACK SOULS browser port. Selecting the card boots directly into the original title scene; gameplay makes no AI/model call.',
    personality: '', scenario: '', first_mes: '', mes_example: '',
    creator_notes: `Requires TavernHelper / JS-Slash-Runner 4.8.19 or compatible. RE-IMPORT REQUIRED for v${packageJson.version}. Enable the character script when SillyTavern asks. Runtime code is a single integrity-checked classic bundle pinned to verified commit ${verification.ref}; jsDelivr, testingcf, and Fastly CDN sources are tried before the visible last-known-good fallback. The loader is designed for TavernHelper's srcdoc iframe and origin:null diagnostics, does not depend on cross-origin nested ES-module imports, and uses explicit code/data/asset bases. Gameplay makes no AI call. Esc is VX Ace Cancel/Menu and never closes the host; use Exit to SillyTavern to leave.`,
    system_prompt: '', post_history_instructions: '', alternate_greetings: [],
    tags: ['game', 'BLACK SOULS', 'no-llm-gameplay', 'TavernHelper'],
    creator: 'anhyeuem1f2-glitch / Codex port tooling',
    character_version: packageJson.version,
    extensions: {
      talkativeness: '0.0', favorite: false,
      tavern_helper: {
        scripts: [{
          type: 'script', enabled: true, name: 'BLACK SOULS Direct Game Host', id: 'black-souls-game-host-v3',
          content,
          info: `Auto-loads verified BLACK SOULS runtime ${packageJson.version} from immutable commit ${verification.ref}. No generation API is used.`,
          button: { enabled: false, buttons: [] }, data: {}, export_with: { data: true, button: true },
        }],
        variables: {},
      },
      black_souls_release: {
        schema: 'black-souls-card-release-v1',
        ref: verification.ref,
        runtimeVersion: verification.runtimeVersion,
        entry: verification.entry,
        entrySha256: verification.entrySha256,
        verifiedAt: verification.verifiedAt,
        fallbackRef: verification.fallbackRef,
      },
    },
    character_book: { name: 'BLACK SOULS Runtime Metadata', description: '', scan_depth: 0, token_budget: 0, recursive_scanning: false, entries: [] },
    assets: [], nickname: '', creator_notes_multilingual: {},
    source: ['https://github.com/anhyeuem1f2-glitch/Black-Souls'], group_only_greetings: [],
  },
};

const serialized = `${JSON.stringify(card, null, 2)}\n`;
await mkdir(cardRoot, { recursive: true });
await mkdir(join(repositoryRoot, 'deliverables'), { recursive: true });
await writeFile(join(cardRoot, 'Black_Souls_ST.json'), serialized, 'utf8');
await writeFile(join(repositoryRoot, 'deliverables', 'Black_Souls_ST.json'), serialized, 'utf8');
console.log(`Built card/Black_Souls_ST.json and deliverables/Black_Souls_ST.json for verified ref ${verification.ref}`);

function argument(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
