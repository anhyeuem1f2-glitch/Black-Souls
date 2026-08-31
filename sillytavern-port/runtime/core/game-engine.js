import { InputController } from './input.js';
import { CollisionMap } from '../map/collision.js';
import { EventInterpreter } from '../map/interpreter.js';
import { AudioManager } from '../audio/audio-manager.js';
import { cancelScene } from './lifecycle.js';

export class GameEngine {
  constructor({ loader, renderer, saves, status, onSceneChange = () => {}, onExitRequest = () => {} }) {
    this.loader = loader;
    this.renderer = renderer;
    this.saves = saves;
    this.status = status;
    this.onSceneChange = onSceneChange;
    this.onExitRequest = onExitRequest;
    this.unsupported = new Set();
    this.diagnosticsLog = [];
    this.interpreterTraceEnabled = new URLSearchParams(globalThis.location?.search ?? '').get('bsTrace') === '1';
    this.modalStack = [];
    this.modalSequence = 0;
  }

  async initialize() {
    this.database = await this.loader.initialize();
    this.input = new InputController(this.renderer.stage);
    this.interpreter = new EventInterpreter(this);
    this.audio = new AudioManager(this.loader, (entry) => this.recordDiagnostic(entry));
    this.state = this.initialState('LOADING');
    this.hasSave = await this.saves.has(1).catch((error) => { this.recordDiagnostic({ type: 'save-probe-failed', error: error.message }); return false; });
    await this.enterTitle();
    this.running = true;
    this.loop();
    this.status('');
  }

  initialState(scene = 'TITLE') {
    return {
      schema: 'black-souls-st-state-v1', scene, mapId: this.database.system.start_map_id,
      x: this.database.system.start_x, y: this.database.system.start_y, direction: 2, pattern: 1, steps: 0,
      switches: {}, variables: {}, selfSwitches: {}, transparent: false, opacity: 255, message: null,
      actors: Object.fromEntries(this.database.actors.filter(Boolean).map((actor) => [actor.id, { name: actor.name }])), choice: null,
    };
  }

  async enterTitle() {
    this.map = null;
    this.collision = null;
    await this.renderer.setTitle(this.database.system);
    this.state.scene = 'TITLE';
    this.state.message = null;
    this.state.choice = null;
    this.state.title = {
      selected: this.hasSave ? 1 : 0,
      commands: [
        { symbol: 'new_game', label: this.database.system.terms.commands[18], enabled: true },
        { symbol: 'continue', label: this.database.system.terms.commands[19], enabled: this.hasSave },
        { symbol: 'shutdown', label: this.database.system.terms.commands[20], enabled: true },
      ],
    };
    this.state.menu = null;
    this.audio.stop('bgs');
    void this.audio.playLoop('bgm', this.database.system.title_bgm);
    this.notifyScene();
    this.renderer.render(this.state);
  }

  async newGame() {
    await this.audio.unlock();
    this.state = this.initialState('PLAYING');
    this.notifyScene();
    await this.loadMap(this.state.mapId);
    this.status(`New game: map ${this.state.mapId} (${this.state.x}, ${this.state.y})`);
    void this.runAutorunEvents().catch((error) => this.handleInterpreterFailure(error));
  }

  async loadMap(mapId) {
    this.state.loadingMap = true;
    try {
      const map = await this.loader.map(mapId);
      const tileset = this.database.tilesets[map.tileset_id];
      const collision = new CollisionMap(map, tileset);
      const actorId = this.database.system.party_members?.[0] ?? 1;
      const actor = this.database.actors[actorId];
      const playerGraphic = { character_name: actor?.character_name ?? '', character_index: actor?.character_index ?? 0 };
      await this.renderer.setMap(map, tileset, { playerGraphic, events: this.currentRenderableEvents(map), mapId });
      this.map = map;
      this.collision = collision;
      await this.audio.applyMapAudio(map);
    } finally {
      this.state.loadingMap = false;
    }
  }

  async transfer(mapId, x, y, direction = 0) {
    const previous = { mapId: this.state.mapId, x: this.state.x, y: this.state.y, direction: this.state.direction };
    this.state.mapId = mapId;
    this.state.x = x;
    this.state.y = y;
    if (direction) this.state.direction = direction;
    try {
      await this.loadMap(mapId);
    } catch (error) {
      Object.assign(this.state, previous);
      this.recordDiagnostic({ type: 'transfer-rollback', requested: { mapId, x, y, direction }, restored: previous, error: error.message });
      throw error;
    }
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

  handleInterpreterFailure(error, interpreter = this.interpreter?.snapshot()) {
    const message = `Event stopped at map ${interpreter?.mapId ?? '?'} event ${interpreter?.eventId ?? '?'} index ${interpreter?.index ?? '?'} code ${interpreter?.code ?? '?'}: ${error.message}`;
    this.recordDiagnostic({ type: 'autorun-failed', error: error.message, interpreter });
    this.status(message);
    console.error('[BLACK SOULS]', message, error);
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
    try {
      this.update();
      this.renderer.render(this.state, this.currentRenderableEvents());
      this.lastRenderError = null;
    } catch (error) {
      if (error.message !== this.lastRenderError) {
        this.lastRenderError = error.message;
        this.recordDiagnostic({ type: 'render-frame-failed', error: error.message });
        console.error('[BLACK SOULS] Render frame failed; the loop will retry.', error);
      }
    }
    this.frame = requestAnimationFrame(this.loop);
  };

  update() {
    if (this.paused) return;
    this.interpreter?.updateWatchdog?.();
    if (this.input.takeInteraction()) void this.audio.unlock();
    if (this.state.scene === 'TITLE') { this.updateTitle(); return; }
    if (this.state.scene === 'MENU' || this.state.scene === 'END') { this.updateMenu(); return; }
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
      if (this.input.takeConfirm() || this.input.takeCancel()) {
        this.state.message = null;
        this.messageResolve?.();
        this.messageResolve = null;
      }
      return;
    }
    if (this.interpreter.running) return;
    if (this.input.takeCancel()) { this.openMenu(); return; }
    if (this.input.takeConfirm()) {
      this.triggerActionEvent();
      return;
    }
    const movement = this.input.takeDirection();
    if (!movement || !this.map) return;
    this.move(...movement);
  }

  updateTitle() {
    const movement = this.input.takeDirection();
    if (movement?.[1]) this.state.title.selected = cycle(this.state.title.selected, Math.sign(movement[1]), this.state.title.commands.length);
    if (this.input.takeCancel()) return;
    if (!this.input.takeConfirm() || this.transitioning) return;
    const command = this.state.title.commands[this.state.title.selected];
    if (!command.enabled) { this.status('Không có dữ liệu lưu.'); return; }
    if (command.symbol === 'shutdown') { this.onExitRequest({ reason: 'title-shutdown', scene: 'TITLE' }); return; }
    this.transitioning = true;
    const task = command.symbol === 'new_game' ? this.newGame() : this.load(1);
    Promise.resolve(task).catch((error) => { this.recordDiagnostic({ type: 'scene-transition-failed', error: error.message }); this.status(error.message); }).finally(() => { this.transitioning = false; });
  }

  updateMenu() {
    const movement = this.input.takeDirection();
    if (movement?.[1]) this.state.menu.selected = cycle(this.state.menu.selected, Math.sign(movement[1]), this.state.menu.commands.length);
    if (this.input.takeCancel()) {
      if (this.state.scene === 'END') this.openMenu();
      else this.setScene(cancelScene(this.state.scene));
      return;
    }
    if (!this.input.takeConfirm()) return;
    const command = this.state.menu.commands[this.state.menu.selected];
    if (command.enabled === false) { this.status('Mục này chưa có trong vertical slice hiện tại.'); return; }
    if (this.state.scene === 'END') {
      if (command.symbol === 'to_title') void this.enterTitle();
      if (command.symbol === 'shutdown') this.onExitRequest({ reason: 'game-end-shutdown', scene: 'END' });
      if (command.symbol === 'cancel') this.openMenu();
      return;
    }
    if (command.symbol === 'save') void this.save(1);
    if (command.symbol === 'game_end') this.openEndMenu();
  }

  openMenu() {
    const labels = this.database.system.terms.commands;
    this.state.menu = {
      kind: 'menu', selected: 0,
      commands: [
        { symbol: 'item', label: labels[4], enabled: false }, { symbol: 'skill', label: labels[5], enabled: false },
        { symbol: 'equip', label: labels[6], enabled: false }, { symbol: 'status', label: labels[7], enabled: false },
        { symbol: 'save', label: labels[9], enabled: true }, { symbol: 'game_end', label: labels[10], enabled: true },
      ],
    };
    this.setScene('MENU');
  }

  openEndMenu() {
    const labels = this.database.system.terms.commands;
    this.state.menu = { kind: 'end', selected: 0, commands: [
      { symbol: 'to_title', label: labels[21], enabled: true },
      { symbol: 'shutdown', label: labels[20], enabled: true },
      { symbol: 'cancel', label: labels[22], enabled: true },
    ] };
    this.setScene('END');
  }

  setScene(scene) {
    this.state.scene = scene;
    if (scene === 'PLAYING') this.state.menu = null;
    this.notifyScene();
  }

  notifyScene() { this.onSceneChange(this.state.scene); }

  move(dx, dy, direction) {
    if (dx !== 0 && dy !== 0) {
      const horizontal = dx < 0 ? 4 : 6; const vertical = dy < 0 ? 8 : 2;
      const strict = this.canStep(this.state.x, this.state.y, horizontal)
        && this.canStep(this.state.x + dx, this.state.y, vertical)
        && this.canStep(this.state.x, this.state.y, vertical)
        && this.canStep(this.state.x, this.state.y + dy, horizontal);
      if (strict) {
        this.state.x += dx; this.state.y += dy;
        if (this.state.direction === reverse(horizontal)) this.state.direction = horizontal;
        if (this.state.direction === reverse(vertical)) this.state.direction = vertical;
        this.advancePattern(); return;
      }
      const fallback = this.state.direction === horizontal ? [vertical, horizontal] : this.state.direction === vertical ? [horizontal, vertical] : [];
      for (const candidate of fallback) if (this.moveCardinal(candidate)) return;
      return;
    }
    this.moveCardinal(direction);
  }

  moveCardinal(direction) {
    const [dx, dy] = { 2: [0, 1], 4: [-1, 0], 6: [1, 0], 8: [0, -1] }[direction] ?? [0, 0];
    this.state.direction = direction;
    if (!this.canStep(this.state.x, this.state.y, direction)) return false;
    this.state.x += dx; this.state.y += dy; this.advancePattern(); return true;
  }

  canStep(x, y, direction) {
    const [dx, dy] = { 2: [0, 1], 4: [-1, 0], 6: [1, 0], 8: [0, -1] }[direction] ?? [0, 0];
    return this.collision.passable(x, y, direction) && this.collision.passable(x + dx, y + dy, reverse(direction));
  }

  advancePattern() { this.state.pattern = [0, 1, 2, 1][(this.state.steps ?? 0) % 4]; this.state.steps = (this.state.steps ?? 0) + 1; }

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
    const modal = {
      id: ++this.modalSequence,
      kind: 'name_input',
      actorId,
      maxLength,
      previousScene: this.state.scene,
      openedAt: new Date().toISOString(),
    };
    this.modalStack.push(modal);
    this.input.clear();
    this.recordDiagnostic({
      type: 'name-input-open', modal: { ...modal }, actorName: current,
      interpreter: this.interpreter.snapshot(), sceneStack: [modal.previousScene, 'NAME_INPUT'],
      playerInputLocked: true, messageBusy: Boolean(this.state.message || this.state.choice), focus: focusSnapshot(this.renderer.stage),
    });
    try {
      const name = await this.renderer.promptText('Name', maxLength, current);
      if (name) this.setActorName(actorId, name);
      this.recordDiagnostic({
        type: 'name-input-confirm', modalId: modal.id, actorId, actorName: this.state.actors[actorId]?.name ?? '',
        interpreter: this.interpreter.snapshot(), sceneStack: [modal.previousScene, 'NAME_INPUT'],
        modalPromiseResolved: true, commandPromisePending: true, playerInputLocked: true,
        messageBusy: Boolean(this.state.message || this.state.choice), focus: focusSnapshot(this.renderer.stage),
      });
    } finally {
      const index = this.modalStack.findIndex((entry) => entry.id === modal.id);
      if (index >= 0) this.modalStack.splice(index, 1);
      this.input.clear();
      this.renderer.stage.focus({ preventScroll: true });
      await nextFrame();
      this.recordDiagnostic({
        type: 'name-input-return-frame', modalId: modal.id, actorId, actorName: this.state.actors[actorId]?.name ?? '',
        interpreter: this.interpreter.snapshot(), modalStack: this.modalStack.map((entry) => entry.kind), sceneStack: [modal.previousScene],
        commandPromisePending: true, playerInputLocked: true, messageBusy: Boolean(this.state.message || this.state.choice), focus: focusSnapshot(this.renderer.stage),
      });
      if (this.interpreterTraceEnabled) setTimeout(() => this.recordDiagnostic({
          type: 'name-input-return-250ms', modalId: modal.id, actorId, actorName: this.state.actors[actorId]?.name ?? '',
          interpreter: this.interpreter.snapshot(), sceneStack: [this.state.scene], modalStack: this.modalStack.map((entry) => entry.kind),
          playerInputLocked: this.interpreter.running, messageBusy: Boolean(this.state.message || this.state.choice), focus: focusSnapshot(this.renderer.stage),
        }), 250);
    }
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

  playSe(audio) { return this.audio.playSe(audio); }

  showAnimation(targetId, animationId) {
    const event = targetId === -1 ? null : this.map?.events?.[targetId];
    const target = targetId === -1 ? { x: this.state.x, y: this.state.y } : { x: event?.x ?? this.state.x, y: event?.y ?? this.state.y };
    return this.renderer.showAnimation(target, this.database.animations[animationId]);
  }

  showBalloon(targetId, balloonId) {
    const event = targetId === -1 ? null : this.map?.events?.[targetId];
    const target = targetId === -1 ? { x: this.state.x, y: this.state.y } : { x: event?.x ?? this.state.x, y: event?.y ?? this.state.y };
    return this.renderer.showBalloon(target, balloonId);
  }

  currentRenderableEvents(map = this.map) {
    return Object.values(map?.events ?? {}).flatMap((event) => {
      const page = this.activePage(event);
      if (!page?.graphic?.character_name) return [];
      return [{ id: event.id, x: event.x, y: event.y, direction: page.graphic.direction, pattern: page.graphic.pattern, opacity: 255, priority: page.priority_type ?? 1, graphic: page.graphic, page }];
    });
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
    this.recordDiagnostic({ type: 'compatibility-gap', code, detail });
  }

  recordDiagnostic(entry) { this.diagnosticsLog.push({ at: new Date().toISOString(), ...entry }); this.diagnosticsLog = this.diagnosticsLog.slice(-30); }
  getDiagnostics() {
    return {
      map: { id: this.state?.mapId, name: this.map?.display_name, tileset: this.renderer.stats.tileset, x: this.state?.x, y: this.state?.y },
      scene: this.state?.scene,
      title: {
        graphic1: this.renderer.stats.title?.title1 ?? null,
        graphic2: this.renderer.stats.title?.title2 ?? null,
        bgm: this.database?.system?.title_bgm?.name ?? null,
        asset: this.renderer.stats.title?.title1?.path ? this.loader.assetDiagnostics(this.renderer.stats.title.title1.path) : null,
      },
      playerAsset: this.renderer.playerGraphic?.character_name ?? null,
      interpreter: this.interpreter?.diagnostics(), modals: this.modalStack.map((entry) => ({ ...entry })),
      assets: this.loader.diagnostics(), audio: this.audio?.diagnostics(), renderer: this.renderer.diagnostics(),
      unsupported: [...this.unsupported], log: [...this.diagnosticsLog],
    };
  }

  snapshot() { return structuredClone(this.state); }
  async save(slot) { await this.saves.save(slot, this.snapshot()); this.hasSave = true; this.status(`Đã lưu vào slot ${slot}.`); }
  async load(slot) {
    const state = await this.saves.load(slot);
    if (!state) throw new Error(`Save slot ${slot} is empty.`);
    this.state = state;
    this.state.scene = 'PLAYING'; this.state.menu = null;
    await this.loadMap(state.mapId);
    this.notifyScene();
    this.status(`Đã tải slot ${slot}.`);
  }

  pause() { this.paused = true; this.input?.clear(); }
  resume() { this.paused = false; this.input?.clear(); }

  async destroy() {
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.input?.destroy();
    this.audio?.destroy();
    this.loader.destroy();
  }
}

function cycle(value, delta, length) { return (value + delta + length) % length; }
function reverse(direction) { return 10 - direction; }
function nextFrame() {
  return new Promise((resolve) => {
    if (typeof globalThis.requestAnimationFrame === 'function') globalThis.requestAnimationFrame(() => resolve());
    else queueMicrotask(resolve);
  });
}
function focusSnapshot(stage) {
  const active = globalThis.document?.activeElement;
  return { activeElement: active?.tagName ?? null, gameHasFocus: active === stage, inputCaptureEnabled: !active || !/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) };
}
