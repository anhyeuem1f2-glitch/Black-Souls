import { InputController } from './input.js';
import { CollisionMap } from '../map/collision.js';
import { EventInterpreter } from '../map/interpreter.js';

export class GameEngine {
  constructor({ loader, renderer, saves, status }) {
    this.loader = loader;
    this.renderer = renderer;
    this.saves = saves;
    this.status = status;
    this.unsupported = new Set();
  }

  async initialize() {
    this.database = await this.loader.initialize();
    this.input = new InputController(this.renderer.stage);
    this.interpreter = new EventInterpreter(this);
    this.state = this.initialState();
    this.running = true;
    this.loop();
    this.status('Ready. New game starts from the original System.rvdata2 position.');
  }

  initialState() {
    return {
      schema: 'black-souls-st-state-v1', mapId: this.database.system.start_map_id,
      x: this.database.system.start_x, y: this.database.system.start_y, direction: 2,
      switches: {}, variables: {}, selfSwitches: {}, transparent: false, message: null,
      actors: Object.fromEntries(this.database.actors.filter(Boolean).map((actor) => [actor.id, { name: actor.name }])), choice: null,
    };
  }

  async newGame() {
    this.state = this.initialState();
    await this.loadMap(this.state.mapId);
    this.status(`New game: map ${this.state.mapId} (${this.state.x}, ${this.state.y})`);
    await this.runAutorunEvents();
  }

  async loadMap(mapId) {
    const map = await this.loader.map(mapId);
    const tileset = this.database.tilesets[map.tileset_id];
    this.map = map;
    this.collision = new CollisionMap(map, tileset);
    await this.renderer.setMap(map, tileset);
  }

  async transfer(mapId, x, y, direction = 0) {
    this.state.mapId = mapId;
    this.state.x = x;
    this.state.y = y;
    if (direction) this.state.direction = direction;
    await this.loadMap(mapId);
    this.status(`Transferred to original map ${mapId} (${x}, ${y})`);
    this.pendingAutorun = true;
  }

  consumePendingAutorun() {
    const pending = this.pendingAutorun;
    this.pendingAutorun = false;
    return pending;
  }

  async runAutorunEvents() {
    for (const event of Object.values(this.map?.events ?? {})) {
      const page = this.activePage(event);
      if (page?.trigger === 3) await this.interpreter.run(page.list, { eventId: event.id });
    }
  }

  activePage(event) {
    return [...(event.pages ?? [])].reverse().find((page) => this.conditionsMet(page.condition, event.id));
  }

  conditionsMet(condition = {}, eventId = 0) {
    if (condition.switch1_valid && !this.state.switches[condition.switch1_id]) return false;
    if (condition.switch2_valid && !this.state.switches[condition.switch2_id]) return false;
    if (condition.variable_valid && (this.state.variables[condition.variable_id] ?? 0) < condition.variable_value) return false;
    if (condition.self_switch_valid && !this.state.selfSwitches[`${this.state.mapId},${eventId},${condition.self_switch_ch}`]) return false;
    return !condition.item_valid && !condition.actor_valid;
  }

  loop = () => {
    if (!this.running) return;
    this.update();
    this.renderer.render(this.state);
    this.frame = requestAnimationFrame(this.loop);
  };

  update() {
    if (this.state.choice) {
      const movement = this.input.takeDirection();
      if (movement?.[1]) this.state.choice.selected = (this.state.choice.selected + Math.sign(movement[1]) + this.state.choice.options.length) % this.state.choice.options.length;
      if (this.input.takeConfirm()) {
        const selected = this.state.choice.selected;
        this.state.choice = null;
        this.choiceResolve?.(selected);
        this.choiceResolve = null;
      }
      return;
    }
    if (this.state.message) {
      if (this.input.takeConfirm()) {
        this.state.message = null;
        this.messageResolve?.();
        this.messageResolve = null;
      }
      return;
    }
    if (this.interpreter.running) return;
    if (this.input.takeConfirm()) {
      this.triggerActionEvent();
      return;
    }
    const movement = this.input.takeDirection();
    if (!movement || !this.map) return;
    const [dx, dy, direction] = movement;
    const cardinal = dx !== 0 && dy !== 0 ? [[dx, 0, dx < 0 ? 4 : 6], [0, dy, dy < 0 ? 8 : 2]] : [[dx, dy, direction]];
    if (cardinal.every(([mx, my, dir]) => this.collision.passable(this.state.x + mx, this.state.y + my, dir))) {
      this.state.x += dx;
      this.state.y += dy;
      this.state.direction = direction;
    }
  }

  showMessage(text) {
    this.state.message = this.expandText(text);
    return new Promise((resolve) => { this.messageResolve = resolve; });
  }

  showChoice(options) {
    this.state.choice = { options: options.map((item) => this.expandText(item)), selected: 0 };
    return new Promise((resolve) => { this.choiceResolve = resolve; });
  }

  async nameInput(actorId, maxLength) {
    const current = this.state.actors[actorId]?.name ?? '';
    const name = await this.renderer.promptText('Name', maxLength, current);
    if (name) this.setActorName(actorId, name);
  }

  setActorName(actorId, name) {
    this.state.actors[actorId] ??= {};
    this.state.actors[actorId].name = name;
  }

  expandText(text) {
    return String(text).replace(/\\[Nn]\[(\d+)\]/g, (_, id) => this.state.actors[id]?.name ?? '').replace(/\\[Cc]\[\d+\]|\\[.!|{}^><]/g, '');
  }

  triggerActionEvent() {
    const vectors = { 2: [0, 1], 4: [-1, 0], 6: [1, 0], 8: [0, -1], 1: [-1, 1], 3: [1, 1], 7: [-1, -1], 9: [1, -1] };
    const [dx, dy] = vectors[this.state.direction] ?? [0, 1];
    const candidates = Object.values(this.map?.events ?? {}).filter((event) => (event.x === this.state.x && event.y === this.state.y) || (event.x === this.state.x + dx && event.y === this.state.y + dy));
    const event = candidates.find((candidate) => this.activePage(candidate)?.trigger === 0);
    if (event) this.interpreter.run(this.activePage(event).list, { eventId: event.id });
  }

  playSe(audio) {
    if (!audio?.name) return;
    const element = new Audio(this.loader.asset(`Audio/SE/${audio.name}.ogg`));
    element.volume = Math.max(0, Math.min(1, (audio.volume ?? 100) / 100));
    element.play().catch(() => this.noteUnsupported(250, `missing ${audio.name}`));
  }

  runRubyCompatibility(source) {
    const journal = /^RETCON::Journal::journal_activate\((\d+)\)$/.exec(source);
    if (journal) {
      this.state.journal ??= {};
      this.state.journal[journal[1]] = true;
      return;
    }
    if (source === '$game_party.steps = 0') { this.state.steps = 0; return; }
    if (source === 'reset_stealth') { this.state.stealth = false; return; }
    this.noteUnsupported(355, source);
  }

  evaluateRubyCondition(source) {
    const actorName = /^\$game_actors\[(\d+)\]\.name\s*==\s*["'](.*)["']$/.exec(source);
    if (actorName) return (this.state.actors[actorName[1]]?.name ?? '') === actorName[2];
    this.noteUnsupported(111, source);
    return false;
  }

  noteUnsupported(code, detail = '') {
    const key = `${code}${detail ? `:${detail}` : ''}`;
    if (this.unsupported.has(key)) return;
    this.unsupported.add(key);
    console.warn(`[BLACK SOULS] Unsupported command ${key}`);
    this.status(`Compatibility gap recorded: ${key}`);
  }

  snapshot() { return structuredClone(this.state); }
  async save(slot) { await this.saves.save(slot, this.snapshot()); this.status(`Saved slot ${slot}.`); }
  async load(slot) {
    const state = await this.saves.load(slot);
    if (!state) throw new Error(`Save slot ${slot} is empty.`);
    this.state = state;
    await this.loadMap(state.mapId);
    this.status(`Loaded slot ${slot}.`);
  }

  async destroy() {
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.input?.destroy();
  }
}
