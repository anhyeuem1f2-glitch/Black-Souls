import { InputController } from './input.js';
import { CollisionMap } from '../map/collision.js';
import { EventInterpreter } from '../map/interpreter.js';
import { AudioManager } from '../audio/audio-manager.js';
import { cancelScene } from './lifecycle.js';
import { PartySystem } from '../game/party-system.js';
import { CombatSystem } from '../game/combat-system.js';
import { GameEventSystem } from '../map/event-system.js';

export class GameEngine {
  constructor({ loader, renderer, saves, status, onSceneChange = () => {}, onExitRequest = () => {}, onTransitionState = () => {} }) {
    this.loader = loader;
    this.renderer = renderer;
    this.saves = saves;
    this.status = status;
    this.onSceneChange = onSceneChange;
    this.onExitRequest = onExitRequest;
    this.onTransitionState = onTransitionState;
    this.unsupported = new Set();
    this.diagnosticsLog = [];
    this.interpreterTraceEnabled = new URLSearchParams(globalThis.location?.search ?? '').get('bsTrace') === '1';
    this.modalStack = [];
    this.modalSequence = 0;
    this.fixedStepMs = 1000 / 60;
    this.maxFrameDeltaMs = 250;
    this.accumulatorMs = 0;
    this.lastLoopAt = null;
  }

  async initialize() {
    this.database = await this.loader.initialize();
    this.party = new PartySystem(this.database, this.database.inventoryDependencies);
    this.combat = new CombatSystem(this.database, this.party, (entry) => this.recordDiagnostic(entry));
    this.prefetch = this.loader.prefetch;
    this.input = new InputController(this.renderer.stage);
    this.interpreter = new EventInterpreter(this);
    this.events = new GameEventSystem(this);
    this.audio = new AudioManager(this.loader, (entry) => this.recordDiagnostic(entry));
    this.state = this.initialState('LOADING');
    this.prefetch.setContextProvider(() => ({
      interpreter: this.interpreter?.snapshot?.() ?? null,
      renderer: { scene: this.renderer.stats.scene, mapId: this.renderer.stats.mapId, frames: this.renderer.stats.frames },
      state: { scene: this.state?.scene, mapId: this.state?.mapId, loadingMap: this.state?.loadingMap },
    }));
    this.hasSave = await (this.saves.any?.() ?? this.saves.has(1)).catch((error) => { this.recordDiagnostic({ type: 'save-probe-failed', error: error.message }); return false; });
    await this.enterTitle();
    this.running = true;
    this.loop();
    this.status('');
  }

  initialState(scene = 'TITLE') {
    const partyState = this.party?.initialState?.() ?? {
      party: { members: [...(this.database.system.party_members ?? [1])], gold: 0, inventory: { items: {}, weapons: {}, armors: {} }, recipes: { item: {}, weapon: {}, armor: {} } },
      actors: Object.fromEntries(this.database.actors.filter(Boolean).map((actor) => [actor.id, { name: actor.name }])),
    };
    return {
      schema: 'black-souls-st-state-v2', scene, mapId: this.database.system.start_map_id,
      x: this.database.system.start_x, y: this.database.system.start_y,
      realX: this.database.system.start_x, realY: this.database.system.start_y,
      direction: 2, pattern: 1, originalPattern: 1, animationCount: 0, steps: 0, moveSpeed: 4, dash: false,
      displayX: 0, displayY: 0, originOpacity: 255, stealthCount: 0,
      switches: {}, variables: {}, selfSwitches: {}, transparent: false, opacity: 255, message: null,
      ...partyState, choice: null, pictures: {}, screenTone: null, screenFlash: null, screenShake: null, weather: null, battle: null, eventOverrides: {},
      system: { saveDisabled: false, menuDisabled: false, encounterDisabled: false, formationDisabled: false, playtimeSeconds: 0, startedAt: Date.now(), saveCount: 0 },
      timer: { working: false, count: 0 }, pluginState: {}, difficulty: 0, ngPlus: 0,
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
    this.prefetch?.prefetchRoute('opening');
  }

  async newGame() {
    await this.audio.unlock();
    this.state = this.initialState('PLAYING');
    this.state.system.startedAt = Date.now();
    this.notifyScene();
    await this.loadMap(this.state.mapId);
    this.status(`New game: map ${this.state.mapId} (${this.state.x}, ${this.state.y})`);
    void this.runAutorunEvents().catch((error) => this.handleInterpreterFailure(error));
  }

  async loadMap(mapId) {
    this.events ??= new GameEventSystem(this);
    this.state.loadingMap = true;
    this.onTransitionState({ state: 'loading', mapId, streaming: this.prefetch?.getStatus?.() ?? null });
    try {
      await this.prefetch?.prepareMap?.(mapId, { x: this.state.x, y: this.state.y });
      const map = await this.loader.map(mapId);
      const tileset = this.database.tilesets[map.tileset_id];
      const collision = new CollisionMap(map, tileset);
      const actorId = this.state.party?.members?.[0] ?? this.database.system.party_members?.[0] ?? 1;
      const actor = this.database.actors[actorId];
      const actorState = this.state.actors[actorId];
      const playerGraphic = { character_name: actorState?.characterName ?? actor?.character_name ?? '', character_index: actorState?.characterIndex ?? actor?.character_index ?? 0 };
      this.events.setupMap(map, mapId);
      await this.renderer.setMap(map, tileset, { playerGraphic, events: this.currentRenderableEvents(map), mapId, x: this.state.x, y: this.state.y });
      this.map = map;
      this.collision = collision;
      this.state.mapName = String(map.display_name ?? '').normalize('NFC');
      this.state.realX = Number.isFinite(this.state.realX) ? this.state.realX : this.state.x;
      this.state.realY = Number.isFinite(this.state.realY) ? this.state.realY : this.state.y;
      this.updateCamera();
      await this.audio.applyMapAudio(map);
      const transition = this.prefetch?.markMapVisible?.(mapId, { x: this.state.x, y: this.state.y }) ?? null;
      this.onTransitionState({ state: 'visible', mapId, transition, streaming: this.prefetch?.getStatus?.() ?? null });
    } catch (error) {
      this.prefetch?.failTransition?.(mapId, error);
      this.onTransitionState({ state: 'failed', mapId, error: error.message, streaming: this.prefetch?.getStatus?.() ?? null });
      throw error;
    } finally {
      this.state.loadingMap = false;
    }
  }

  async transfer(mapId, x, y, direction = 0) {
    const previous = { mapId: this.state.mapId, x: this.state.x, y: this.state.y, realX: this.state.realX, realY: this.state.realY, direction: this.state.direction };
    this.state.mapId = mapId;
    this.state.x = this.state.realX = x;
    this.state.y = this.state.realY = y;
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
      if (page?.trigger === 3 || page?.trigger === 4) await this.interpreter.run(page.list, { eventId: event.id, trigger: page.trigger });
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
    if (condition.item_valid && this.party.quantity(this.state, 'item', condition.item_id) <= 0) return false;
    if (condition.actor_valid && !this.state.party.members.includes(condition.actor_id)) return false;
    return true;
  }

  loop = (now = performance.now()) => {
    if (!this.running) return;
    try {
      if (this.lastLoopAt == null) this.lastLoopAt = now;
      const elapsed = Math.min(this.maxFrameDeltaMs, Math.max(0, now - this.lastLoopAt));
      this.lastLoopAt = now;
      this.accumulatorMs += elapsed;
      let updates = 0;
      while (this.accumulatorMs >= this.fixedStepMs && updates < 15) {
        this.update(this.fixedStepMs / 1000);
        this.accumulatorMs -= this.fixedStepMs;
        updates += 1;
      }
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

  update(deltaSeconds = 1 / 60) {
    if (this.paused) return;
    this.updatePlaytime(deltaSeconds);
    this.updateMovement(deltaSeconds);
    this.updateCamera();
    this.events?.update(deltaSeconds);
    this.interpreter?.updateWatchdog?.();
    if (this.input.takeInteraction()) void this.audio.unlock();
    if (this.state.scene === 'TITLE') { this.updateTitle(); return; }
    if (this.state.scene === 'BATTLE') { this.updateBattle(); return; }
    if (['MENU', 'END', 'ITEM', 'SKILL', 'EQUIP', 'STATUS', 'SYNTHESIS', 'SHOP', 'FILE_SAVE', 'FILE_LOAD'].includes(this.state.scene)) { this.updateMenu(); return; }
    if (this.state.choice) {
      const movement = this.input.takeDirection();
      if (movement?.[1]) this.state.choice.selected = (this.state.choice.selected + Math.sign(movement[1]) + this.state.choice.options.length) % this.state.choice.options.length;
      if (this.input.takeConfirm()) {
        const selected = this.state.choice.selected;
        this.state.choice = null;
        if (this.state.message?.choiceAttached) this.state.message = null;
        this.choiceResolve?.(selected);
        this.choiceResolve = null;
        return;
      }
      if (this.input.takeCancel() && this.state.choice.cancelType >= 0) {
        const selected = this.state.choice.cancelType;
        this.state.choice = null;
        if (this.state.message?.choiceAttached) this.state.message = null;
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
    if (this.interpreter.running || this.events?.busy) return;
    if (this.isMoving()) return;
    if (this.input.takeCancel()) { this.openMenu(); return; }
    if (this.input.takeConfirm()) {
      this.triggerActionEvent();
      return;
    }
    const movement = this.input.takeMovementDirection?.() ?? this.input.takeDirection();
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
    const task = command.symbol === 'new_game' ? this.newGame() : this.openLoadMenu();
    Promise.resolve(task).catch((error) => { this.recordDiagnostic({ type: 'scene-transition-failed', error: error.message }); this.status(error.message); }).finally(() => { this.transitioning = false; });
  }

  updateMenu() {
    if (this.state.scene === 'FILE_SAVE' || this.state.scene === 'FILE_LOAD') { this.updateFileMenu(); return; }
    if (this.state.scene === 'ITEM') { this.updateItemMenu(); return; }
    if (this.state.scene === 'SKILL') { if (this.input.takeCancel()) this.openMenu(); return; }
    if (this.state.scene === 'EQUIP') { this.updateEquipMenu(); return; }
    if (this.state.scene === 'STATUS') { if (this.input.takeCancel() || this.input.takeConfirm()) this.openMenu(); return; }
    if (this.state.scene === 'SYNTHESIS') { this.updateSynthesisMenu(); return; }
    if (this.state.scene === 'SHOP') { this.updateShopMenu(); return; }
    const movement = this.input.takeDirection();
    if (movement?.[1]) this.state.menu.selected = cycle(this.state.menu.selected, Math.sign(movement[1]), this.state.menu.commands.length);
    if (this.input.takeCancel()) {
      if (this.state.scene === 'END') this.openMenu();
      else this.closeMenuToGame();
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
    if (command.symbol === 'save') void this.openSaveMenu();
    if (command.symbol === 'game_end') this.openEndMenu();
    if (command.symbol === 'item') this.openItemMenu();
    if (command.symbol === 'skill') this.openSkillMenu();
    if (command.symbol === 'equip') this.openEquipMenu();
    if (command.symbol === 'status') this.openStatusMenu();
  }

  openMenu() {
    const labels = this.database.system.terms.commands;
    const members = this.state.party?.members ?? [];
    this.state.menu = {
      kind: 'menu', selected: 0,
      actorStatus: Object.fromEntries(members.map((actorId) => [actorId, this.party.parameters(this.state, actorId)])),
      commands: [
        { symbol: 'item', label: labels[4], enabled: true }, { symbol: 'skill', label: labels[5], enabled: true },
        { symbol: 'equip', label: labels[6], enabled: true }, { symbol: 'status', label: labels[7], enabled: true },
        { symbol: 'formation', label: labels[8], enabled: members.length >= 2 && !this.state.system?.formationDisabled },
        { symbol: 'save', label: labels[9], enabled: !this.state.system?.saveDisabled }, { symbol: 'game_end', label: labels[10], enabled: true },
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

  async transferWithRecovery(mapId, x, y, direction = 0) {
    let attempt = 0;
    while (true) {
      attempt += 1;
      try { return await this.transfer(mapId, x, y, direction); }
      catch (error) {
        this.recordDiagnostic({ type: 'resource-wait-failed', operation: 'transfer', mapId, attempt, error: error.message, interpreter: this.interpreter.snapshot() });
        const retry = await this.renderer.promptRetry?.(`Map ${mapId} could not finish loading.`, error.message);
        if (!retry) throw error;
        this.recordDiagnostic({ type: 'resource-retry-requested', operation: 'transfer', mapId, attempt });
      }
    }
  }

  openItemMenu() {
    const labels = this.database.system.terms.commands;
    this.state.menu = {
      kind: 'item', mode: 'category', categorySelected: 0, selected: 0,
      categories: [
        { symbol: 'item', label: labels[4] }, { symbol: 'weapon', label: labels[12] },
        { symbol: 'armor', label: labels[13] }, { symbol: 'key_item', label: labels[14] },
      ],
      entries: this.itemEntriesForCategory('item'),
    };
    this.setScene('ITEM');
  }

  updateItemMenu() {
    const menu = this.state.menu;
    if (menu.mode === 'category') {
      if (this.input.takeCancel()) { this.openMenu(); return; }
      const movement = this.input.takeDirection();
      if (movement?.[0]) {
        menu.categorySelected = cycle(menu.categorySelected, Math.sign(movement[0]), menu.categories.length);
        menu.entries = this.itemEntriesForCategory(menu.categories[menu.categorySelected].symbol);
        menu.selected = 0;
      }
      if (this.input.takeConfirm()) menu.mode = 'items';
      return;
    }
    if (this.input.takeCancel()) { menu.mode = 'category'; return; }
    if (this.isMoving()) return;
    const movement = this.input.takeMovementDirection?.() ?? this.input.takeDirection();
    if (movement && menu.entries.length) {
      const delta = movement[1] ? Math.sign(movement[1]) * 2 : Math.sign(movement[0]);
      if (delta) menu.selected = cycle(menu.selected, delta, menu.entries.length);
    }
    if (!this.input.takeConfirm() || !menu.entries.length) return;
    const entry = menu.entries[menu.selected];
    if (entry.kind !== 'item') return;
    const result = this.party.useItem(this.state, entry.id, this.state.party.members[0]);
    if (result.used) this.status(`Used ${entry.data.name}.`);
    menu.entries = this.itemEntriesForCategory(menu.categories[menu.categorySelected].symbol);
    menu.selected = Math.max(0, Math.min(menu.selected, menu.entries.length - 1));
  }

  itemEntriesForCategory(category) {
    if (category === 'weapon' || category === 'armor') return this.party.inventoryEntries(this.state, [category]);
    return this.party.inventoryEntries(this.state, ['item']).filter((entry) => (Number(entry.data?.itype_id ?? 1) === 2) === (category === 'key_item'));
  }

  openSkillMenu() {
    const actorId = this.state.party.members[0];
    const actor = this.state.actors[actorId];
    this.state.menu = { kind: 'skill', actorId, selected: 0, entries: (actor?.skills ?? []).map((id) => ({ id, data: this.database.skills[id] })).filter((entry) => entry.data) };
    this.setScene('SKILL');
  }

  openEquipMenu() {
    const actorId = this.state.party.members[0];
    const labels = this.database.system.terms.commands;
    this.state.menu = {
      kind: 'equip', mode: 'command', actorId, commandSelected: 0,
      commands: [{ symbol: 'equip', label: labels[15] }, { symbol: 'optimize', label: labels[16] }, { symbol: 'clear', label: labels[17] }],
      selected: 0, choices: [], choiceSelected: 0,
    };
    this.decorateEquipMenu(this.state.menu);
    this.setScene('EQUIP');
  }

  updateEquipMenu() {
    const menu = this.state.menu; const actor = this.state.actors[menu.actorId];
    if (menu.mode === 'command') {
      if (this.input.takeCancel()) { this.openMenu(); return; }
      const movement = this.input.takeDirection();
      if (movement?.[0]) menu.commandSelected = cycle(menu.commandSelected, Math.sign(movement[0]), menu.commands.length);
      if (!this.input.takeConfirm()) return;
      const symbol = menu.commands[menu.commandSelected].symbol;
      if (symbol === 'equip') menu.mode = 'slots';
      if (symbol === 'clear') { this.clearActorEquipment(menu.actorId); this.decorateEquipMenu(menu); }
      if (symbol === 'optimize') { this.optimizeActorEquipment(menu.actorId); this.decorateEquipMenu(menu); }
      return;
    }
    if (menu.mode === 'choices') {
      if (this.input.takeCancel()) { menu.mode = 'slots'; return; }
      const movement = this.input.takeDirection();
      if (movement?.[1] && menu.choices.length) menu.choiceSelected = cycle(menu.choiceSelected, Math.sign(movement[1]), menu.choices.length);
      if (!this.input.takeConfirm()) return;
      const selected = menu.choices[menu.choiceSelected] ?? { kind: actor.equips[menu.selected].kind, id: 0 };
      const result = this.party.equip(this.state, menu.actorId, menu.selected, selected.kind, selected.id);
      if (result.equipped) this.status(selected.id ? `Equipped ${this.party.data(selected.kind, selected.id)?.name}.` : 'Unequipped.');
      menu.mode = 'slots'; this.decorateEquipMenu(menu); return;
    }
    if (this.input.takeCancel()) { menu.mode = 'command'; return; }
    const movement = this.input.takeMovementDirection?.() ?? this.input.takeDirection();
    if (movement?.[1] && actor.equips.length) menu.selected = cycle(menu.selected, Math.sign(movement[1]), actor.equips.length);
    if (!this.input.takeConfirm()) return;
    const current = actor.equips[menu.selected];
    menu.choices = [{ kind: current.kind, id: 0, amount: 0, data: { name: '(Remove)' } }, ...this.party.inventoryEntries(this.state, ['weapon', 'armor']).filter((entry) => this.party.canEquip(this.state, menu.actorId, entry.kind, entry.id, menu.selected))];
    menu.choiceSelected = 0; menu.mode = 'choices';
  }

  decorateEquipMenu(menu) {
    menu.slotEntries = (this.state.actors[menu.actorId]?.equips ?? []).map((slot) => ({ ...slot, data: slot.id ? this.party.data(slot.kind, slot.id) : null }));
    menu.parameters = this.party.parameters(this.state, menu.actorId);
  }

  clearActorEquipment(actorId) {
    const actor = this.state.actors[actorId];
    for (let index = 0; index < (actor?.equips?.length ?? 0); index += 1) {
      const slot = actor.equips[index];
      if (slot.id) this.party.equip(this.state, actorId, index, slot.kind, 0);
    }
  }

  optimizeActorEquipment(actorId) {
    this.clearActorEquipment(actorId);
    const actor = this.state.actors[actorId];
    for (let index = 0; index < (actor?.equips?.length ?? 0); index += 1) {
      const candidates = this.party.inventoryEntries(this.state, ['weapon', 'armor'])
        .filter((entry) => this.party.canEquip(this.state, actorId, entry.kind, entry.id, index))
        .sort((a, b) => sumParams(b.data?.params) - sumParams(a.data?.params));
      const best = candidates[0];
      if (best) this.party.equip(this.state, actorId, index, best.kind, best.id);
    }
  }

  openStatusMenu() {
    const actorId = this.state.party.members[0];
    const actor = this.state.actors[actorId];
    this.state.menu = {
      kind: 'status', actorId, parameters: this.party.parameters(this.state, actorId),
      className: this.database.classes[actor?.classId]?.name ?? '',
      expCurrent: actor?.exp ?? 0,
      expNext: Math.max(0, this.party.expForLevel(actor?.classId, (actor?.level ?? 1) + 1) - (actor?.exp ?? 0)),
      equipment: (actor?.equips ?? []).map((slot) => slot.id ? this.party.data(slot.kind, slot.id) : null),
      paramLabels: this.database.system.terms.params,
    };
    this.setScene('STATUS');
  }

  async openLoadMenu() {
    const slots = await this.saves.list();
    const graphics = slots.flatMap((slot) => (slot.partyCharacters ?? []).map((entry) => ({ graphic: { character_name: entry.characterName, character_index: entry.characterIndex } })));
    await Promise.resolve(this.renderer.ensureEventGraphics?.(graphics))
      .catch((error) => this.recordDiagnostic({ type: 'save-character-warm-failed', error: error.message }));
    const latest = await this.saves.latestSlot();
    this.state.menu = { kind: 'file', mode: 'load', help: 'Mở tệp nào?', selected: Math.max(0, latest - 1), topIndex: Math.max(0, Math.min(12, latest - 3)), slots };
    this.setScene('FILE_LOAD');
  }

  async openSaveMenu() {
    if (this.state.system?.saveDisabled) { this.status('Không thể lưu tại đây.'); return; }
    const slots = await this.saves.list();
    const graphics = slots.flatMap((slot) => (slot.partyCharacters ?? []).map((entry) => ({ graphic: { character_name: entry.characterName, character_index: entry.characterIndex } })));
    await Promise.resolve(this.renderer.ensureEventGraphics?.(graphics))
      .catch((error) => this.recordDiagnostic({ type: 'save-character-warm-failed', error: error.message }));
    const selected = Math.max(0, Math.min(15, Number(this.lastSaveSlot ?? 1) - 1));
    this.state.menu = { kind: 'file', mode: 'save', help: 'Lưu vào đâu?', selected, topIndex: Math.max(0, Math.min(12, selected - 1)), slots };
    this.setScene('FILE_SAVE');
  }

  updateFileMenu() {
    const menu = this.state.menu;
    if (!menu || this.transitioning) return;
    if (this.input.takeCancel()) {
      if (menu.mode === 'load') void this.enterTitle();
      else this.openMenu();
      return;
    }
    const movement = this.input.takeDirection();
    if (movement?.[1]) {
      menu.selected = cycle(menu.selected, Math.sign(movement[1]), menu.slots.length);
      if (menu.selected < menu.topIndex) menu.topIndex = menu.selected;
      if (menu.selected > menu.topIndex + 3) menu.topIndex = menu.selected - 3;
    }
    if (!this.input.takeConfirm()) return;
    const slot = menu.selected + 1;
    const entry = menu.slots[menu.selected];
    if (menu.mode === 'load' && entry.empty) { this.status('Tệp này không có dữ liệu.'); return; }
    this.transitioning = true;
    const task = menu.mode === 'save'
      ? this.save(slot).then(() => this.openMenu())
      : this.load(slot);
    Promise.resolve(task).catch((error) => {
      this.recordDiagnostic({ type: 'save-scene-failed', mode: menu.mode, slot, error: error.message });
      this.status(error.message);
    }).finally(() => { this.transitioning = false; });
  }

  openSynthesisMenu() {
    const entries = this.database.inventoryDependencies.synthesis.recipes.filter((recipe) => this.state.party.recipes[recipe.kind]?.[recipe.id]).map((recipe) => ({ ...recipe, data: this.party.data(recipe.kind, recipe.id) }));
    this.state.menu = { kind: 'synthesis', selected: 0, entries };
    this.setScene('SYNTHESIS');
  }

  updateSynthesisMenu() {
    const menu = this.state.menu;
    if (this.input.takeCancel()) { this.setScene('PLAYING'); return; }
    const movement = this.input.takeDirection();
    if (movement?.[1] && menu.entries.length) menu.selected = cycle(menu.selected, Math.sign(movement[1]), menu.entries.length);
    if (!this.input.takeConfirm() || !menu.entries.length) return;
    const recipe = menu.entries[menu.selected]; const result = this.party.synthesize(this.state, recipe.kind, recipe.id, 1);
    this.status(result.crafted ? `Created ${recipe.data?.name}.` : `Cannot synthesize: ${result.reason}.`);
  }

  openShop(goods, purchaseOnly = false) {
    const entries = goods.map((good) => {
      const kind = ['item', 'weapon', 'armor'][Number(good[0])] ?? 'item'; const id = Number(good[1]); const data = this.party.data(kind, id);
      return { kind, id, data, price: Number(good[2]) === 0 ? Number(data?.price ?? 0) : Number(good[3] ?? 0) };
    }).filter((entry) => entry.data);
    this.state.menu = { kind: 'shop', selected: 0, entries, purchaseOnly };
    this.setScene('SHOP');
    return new Promise((resolve) => { this.shopResolve = resolve; });
  }

  updateShopMenu() {
    const menu = this.state.menu;
    if (this.input.takeCancel()) { const resolve = this.shopResolve; this.shopResolve = null; this.setScene('PLAYING'); resolve?.(); return; }
    const movement = this.input.takeDirection();
    if (movement?.[1] && menu.entries.length) menu.selected = cycle(menu.selected, Math.sign(movement[1]), menu.entries.length);
    if (!this.input.takeConfirm() || !menu.entries.length) return;
    const entry = menu.entries[menu.selected]; const result = this.party.buy(this.state, entry.kind, entry.id, 1, entry.price);
    this.status(result.bought ? `Bought ${entry.data.name}.` : `Cannot buy: ${result.reason}.`);
  }

  openMenuFromEvent() { this.openMenu(); return new Promise((resolve) => { this.menuResolve = resolve; }); }

  closeMenuToGame() {
    this.setScene('PLAYING');
    const resolve = this.menuResolve; this.menuResolve = null; resolve?.();
  }

  async startBattle(troopId, canEscape = false, canLose = false) {
    const paths = this.database.prefetchManifest?.battles?.[troopId]?.assets ?? [];
    await this.prefetch?.prefetchAssets?.(paths, { priority: 0, reason: `battle:${troopId}` });
    const encounter = this.events?.battleContext?.() ?? null;
    const battle = this.combat.createBattle(this.state, troopId, {
      canEscape, canLose, battleback1: this.state.nextBattleback1 ?? this.map?.battleback1_name ?? '', battleback2: this.state.nextBattleback2 ?? this.map?.battleback2_name ?? '',
      preemptive: Boolean(encounter?.preemptive), surprise: Boolean(encounter?.surprise), encounter,
    });
    this.state.system.battleCount = Number(this.state.system.battleCount ?? 0) + 1;
    this.state.battle = battle;
    await this.renderer.setBattle?.(battle);
    void this.audio.playLoop('bgm', this.state.battleBgm ?? this.database.system.battle_bgm);
    this.setScene('BATTLE');
    this.recordDiagnostic({ type: 'symbol-battle-entered', troopId, encounter, assets: paths.length, scene: this.state.scene });
    return new Promise((resolve) => { this.battleResolve = resolve; });
  }

  resolveBattleTroop(parameters = []) {
    const designation = Number(parameters[0]);
    if (designation === 0) return Number(parameters[1]);
    if (designation === 1) return Number(this.state.variables?.[parameters[1]] ?? 0);
    const region = this.collision?.regionId?.(this.state.x, this.state.y) ?? 0;
    const candidates = (this.map?.encounter_list ?? []).filter((entry) => !(entry.region_set?.length) || entry.region_set.includes(region));
    const total = candidates.reduce((sum, entry) => sum + Math.max(0, Number(entry.weight) || 0), 0);
    if (!total) return 0;
    let roll = this.events?.randomInt?.(total) ?? 0;
    for (const entry of candidates) {
      roll -= Math.max(0, Number(entry.weight) || 0);
      if (roll < 0) return Number(entry.troop_id);
    }
    return Number(candidates.at(-1)?.troop_id ?? 0);
  }

  updateBattle() {
    const battle = this.state.battle;
    if (!battle) { this.setScene('PLAYING'); return; }
    this.combat.update(this.state, 1);
    if (battle.result) { void this.finishBattle(battle.result); return; }
    if (battle.phase !== 'actor-command') return;
    const movement = this.input.takeDirection();
    if (movement?.[1]) battle.selectedCommand = cycle(battle.selectedCommand, Math.sign(movement[1]), battle.commands.length);
    if (!this.input.takeConfirm()) return;
    const definition = battle.commandDefinitions?.[battle.selectedCommand] ?? { symbol: ['attack', 'skill', 'item', 'guard', 'escape'][battle.selectedCommand] };
    const symbol = definition.symbol;
    const active = battle.actors[battle.activeActor]; const actor = this.state.actors[active.actorId];
    const payload = symbol === 'skill' ? { skillId: actor.skills.map((id) => this.database.skills[id]).find((skill) => Number(skill?.stype_id) === Number(definition.ext) && active.mp >= Number(skill.mp_cost ?? 0) && active.tp >= Number(skill.tp_cost ?? 0))?.id }
      : symbol === 'item' ? { itemId: this.party.inventoryEntries(this.state, ['item'])[0]?.id } : {};
    const result = this.combat.actorCommand(this.state, symbol, battle.selectedTarget, payload);
    if (!result.accepted) this.status(`Battle command unavailable: ${result.reason ?? 'invalid'}.`);
  }

  async finishBattle(result) {
    if (this.finishingBattle) return;
    this.finishingBattle = true;
    try {
      await this.audio.applyMapAudio(this.map);
      this.renderer.clearBattle?.();
      this.state.scene = 'PLAYING';
      this.notifyScene();
      const resolve = this.battleResolve; this.battleResolve = null;
      resolve?.(result);
    } finally { this.finishingBattle = false; }
  }

  async refreshCurrentMapVisuals(reason = 'page-change') {
    if (!this.map) return;
    const events = this.currentRenderableEvents();
    await this.renderer.ensureEventGraphics?.(events);
    this.recordDiagnostic({ type: 'dynamic-event-graphics-ready', reason, mapId: this.state.mapId, characters: [...new Set(events.map((event) => event.graphic?.character_name).filter(Boolean))] });
  }

  gainItem(kind, id, amount) { return this.party.gain(this.state, kind, id, amount); }
  gainGold(amount) { return this.party.gainGold(this.state, amount); }
  changeBattleBgm(descriptor) { this.state.battleBgm = structuredClone(descriptor); }
  saveBgm() { this.state.savedBgm = structuredClone(this.audio.descriptors?.bgm ?? null); }
  replayBgm() { return this.state.savedBgm ? this.audio.playLoop('bgm', this.state.savedBgm) : Promise.resolve(); }
  playMe(descriptor) { return this.audio.playOneShot('ME', descriptor); }
  recoverActor(actorId) {
    const actor = this.state.actors[actorId]; if (!actor) return;
    const parameters = this.party.parameters(this.state, actorId);
    Object.assign(actor, { hp: parameters.mhp, mp: parameters.mmp, tp: 0, states: [] });
  }
  changeActorExp(actorId, amount) { return this.party.gainExp(this.state, actorId, amount); }
  changeActorLevel(actorId, amount) {
    const actor = this.state.actors[actorId]; if (!actor) return null;
    const target = Math.max(1, Math.min(this.party.maxLevel(actorId), actor.level + Number(amount)));
    return this.party.gainExp(this.state, actorId, this.party.expForLevel(actor.classId, target) - actor.exp);
  }
  changeActorSkill(actorId, operation, skillId) {
    const actor = this.state.actors[actorId]; if (!actor) return;
    if (operation === 0 && !actor.skills.includes(skillId)) actor.skills.push(skillId);
    if (operation === 1) actor.skills = actor.skills.filter((id) => id !== skillId);
  }
  changeActorClass(actorId, classId, keepExp = false) {
    const actor = this.state.actors[actorId]; if (!actor || !this.database.classes[classId]) return;
    actor.classId = Number(classId);
    if (!keepExp) actor.exp = 0;
    actor.skills = this.party.initialSkills(actor.classId, actor.level);
    const parameters = this.party.parameters(this.state, actorId);
    actor.hp = Math.min(actor.hp, parameters.mhp); actor.mp = Math.min(actor.mp, parameters.mmp);
  }
  async changePartyMember(actorId, operation, initialize = false) {
    const members = this.state.party.members;
    if (operation === 0 && !members.includes(actorId)) {
      if (initialize) this.state.actors[actorId] = this.party.createActor(this.database.actors[actorId]);
      members.push(actorId);
    }
    if (operation === 1) this.state.party.members = members.filter((id) => id !== actorId);
    const leaderId = this.state.party.members[0];
    const leader = this.state.actors[leaderId];
    if (leader) {
      this.renderer.playerGraphic = { character_name: leader.characterName ?? '', character_index: leader.characterIndex ?? 0 };
      await this.renderer.ensureEventGraphics?.([{ graphic: this.renderer.playerGraphic }]);
    }
  }
  async setActorGraphic(actorId, characterName, characterIndex, faceName, faceIndex) {
    const actor = this.state.actors[actorId]; if (!actor) return;
    Object.assign(actor, { characterName: String(characterName ?? ''), characterIndex: Number(characterIndex) || 0, faceName: String(faceName ?? ''), faceIndex: Number(faceIndex) || 0 });
    if (this.state.party.members[0] === actorId) {
      this.renderer.playerGraphic = { character_name: actor.characterName, character_index: actor.characterIndex };
      await this.renderer.ensureEventGraphics?.([{ graphic: this.renderer.playerGraphic }]);
    }
  }
  changeActorEquipment(actorId, slotId, itemId) {
    const slot = this.state.actors[actorId]?.equips?.[slotId];
    return slot ? this.party.equip(this.state, actorId, slotId, slot.etypeId === 0 ? 'weapon' : 'armor', itemId, { force: true }) : null;
  }

  async showPicture(id, name, parameters) { this.state.pictures[id] = { id, name, ...parameters }; await this.renderer.showPicture?.(id, name, parameters); }
  movePicture(id, parameters) { Object.assign(this.state.pictures[id] ??= { id }, parameters); return this.renderer.movePicture?.(id, parameters) ?? Promise.resolve(); }
  erasePicture(id) { delete this.state.pictures[id]; this.renderer.erasePicture?.(id); }
  tintScreen(tone, frames) { this.state.screenTone = { tone, frames }; return this.renderer.tintScreen?.(tone, frames) ?? Promise.resolve(); }
  flashScreen(color, frames) { this.state.screenFlash = { color, frames }; return this.renderer.flashScreen?.(color, frames) ?? Promise.resolve(); }
  shakeScreen(power, speed, frames) { this.state.screenShake = { power, speed, frames }; return this.renderer.shakeScreen?.(power, speed, frames) ?? Promise.resolve(); }
  setWeather(type, power, frames) { this.state.weather = { type, power, frames }; return this.renderer.setWeather?.(type, power, frames) ?? Promise.resolve(); }
  playBgm(descriptor) { return this.audio.playLoop('bgm', descriptor); }
  playBgs(descriptor) { return this.audio.playLoop('bgs', descriptor); }
  stopAudio(channel) { this.audio.stop(channel); }

  async changeCharacterGraphic(target, name, index = 0, eventId = 0) {
    if (target === -1) {
      const actorId = this.state.party.members[0]; const actor = this.state.actors[actorId]; actor.characterName = String(name ?? ''); actor.characterIndex = Number(index) || 0;
      this.renderer.playerGraphic = { character_name: actor.characterName, character_index: actor.characterIndex };
      await this.renderer.ensureEventGraphics?.([{ graphic: this.renderer.playerGraphic }]);
      return;
    }
    const resolvedId = target === 0 ? eventId : target; const key = `${this.state.mapId},${resolvedId}`;
    this.state.eventOverrides[key] ??= {};
    this.state.eventOverrides[key].graphic = { character_name: String(name ?? ''), character_index: Number(index) || 0, direction: this.map?.events?.[resolvedId]?.pages?.[0]?.graphic?.direction ?? 2, pattern: 1 };
    await this.refreshCurrentMapVisuals('move-route-graphic');
  }

  waitFrames(frames) { return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(frames) || 0) * 1000 / 60)); }

  async moveRouteStep(target, dx, dy, direction, eventId = 0) {
    if (target === -1) {
      this.ensureRealPosition();
      const speed = Number(this.state.moveSpeed ?? 4);
      this.state.routeForcing = true;
      this.state.x += dx; this.state.y += dy;
      if (direction % 2 === 0) this.state.direction = direction;
      else {
        const horizontal = dx < 0 ? 4 : 6; const vertical = dy < 0 ? 8 : 2;
        if (this.state.direction === reverse(horizontal)) this.state.direction = horizontal;
        if (this.state.direction === reverse(vertical)) this.state.direction = vertical;
      }
      this.advanceStep();
      await this.waitFrames(256 / 2 ** speed);
      this.state.realX = this.state.x; this.state.realY = this.state.y;
      this.state.routeForcing = false;
      return;
    }
    const override = this.routeOverride(target, eventId);
    const speed = Number(override.moveSpeed ?? 3);
    const fromX = Number(override.x); const fromY = Number(override.y);
    const resolvedId = target === 0 ? eventId : target;
    const event = this.map?.events?.[resolvedId];
    if (!override.through && event && !this.events?.eventPassable?.(resolvedId, fromX, fromY, fromX + dx, fromY + dy, direction)) return false;
    override.x = fromX + dx; override.y = fromY + dy;
    if (direction % 2 === 0) override.direction = direction;
    override.motion = { fromX, fromY, toX: override.x, toY: override.y, began: performance.now(), durationMs: (256 / 2 ** speed) * 1000 / 60 };
    await this.waitFrames(256 / 2 ** speed);
    override.realX = override.x; override.realY = override.y;
    delete override.motion;
    return true;
  }

  setRouteDirection(target, direction, eventId = 0) {
    if (target === -1) this.state.direction = direction;
    else this.routeOverride(target, eventId).direction = direction;
  }

  setRouteProperty(target, property, value, eventId = 0) {
    if (target === -1) {
      if (property === 'transparent') this.state.transparent = Boolean(value);
      else if (property === 'opacity') this.state.opacity = Number(value);
      else this.state[property] = value;
      return;
    }
    this.routeOverride(target, eventId)[property] = value;
  }

  routeOverride(target, eventId = 0) {
    const resolvedId = target === 0 ? eventId : target;
    const event = this.map?.events?.[resolvedId];
    const page = event ? this.activePage(event) : null;
    const key = `${this.state.mapId},${resolvedId}`;
    const override = this.state.eventOverrides[key] ??= {};
    override.x ??= event?.x ?? 0; override.y ??= event?.y ?? 0;
    override.realX ??= override.x; override.realY ??= override.y;
    override.direction ??= page?.graphic?.direction ?? 2;
    override.pattern ??= page?.graphic?.pattern ?? 1;
    override.moveSpeed ??= page?.move_speed ?? 3;
    override.moveFrequency ??= page?.move_frequency ?? 3;
    return override;
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
        this.ensureRealPosition();
        this.state.x += dx; this.state.y += dy;
        if (this.state.direction === reverse(horizontal)) this.state.direction = horizontal;
        if (this.state.direction === reverse(vertical)) this.state.direction = vertical;
        this.advanceStep(); this.events?.playerTouch?.(this.state.x, this.state.y, 'player-touch-arrival'); return true;
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
    if (!this.canStep(this.state.x, this.state.y, direction)) {
      this.events?.playerTouch?.(this.state.x + dx, this.state.y + dy, 'player-touch-front');
      return false;
    }
    this.ensureRealPosition();
    this.state.x += dx; this.state.y += dy; this.advanceStep();
    this.events?.playerTouch?.(this.state.x, this.state.y, 'player-touch-arrival');
    return true;
  }

  canStep(x, y, direction) {
    const [dx, dy] = { 2: [0, 1], 4: [-1, 0], 6: [1, 0], 8: [0, -1] }[direction] ?? [0, 0];
    const targetX = x + dx; const targetY = y + dy;
    return this.collision.passable(x, y, direction) && this.collision.passable(targetX, targetY, reverse(direction))
      && !this.events?.blocksPlayer?.(targetX, targetY);
  }

  advanceStep() {
    this.state.steps = (this.state.steps ?? 0) + 1;
    if (Number(this.state.stealthCount ?? 0) !== 0) this.state.stealthCount -= 1;
    this.prefetch?.prefetchLikelyDestinations(this.state.mapId, { x: this.state.x, y: this.state.y });
  }

  ensureRealPosition() {
    if (!Number.isFinite(this.state.realX)) this.state.realX = this.state.x;
    if (!Number.isFinite(this.state.realY)) this.state.realY = this.state.y;
  }

  isMoving() {
    this.ensureRealPosition();
    return Math.abs(this.state.realX - this.state.x) > 1e-6 || Math.abs(this.state.realY - this.state.y) > 1e-6;
  }

  realMoveSpeed() {
    const dashAllowed = !this.map?.disable_dashing && !this.state.switches?.[0];
    const dash = !this.state.routeForcing && dashAllowed && Boolean(this.input?.isDashPressed?.());
    this.state.dash = dash;
    return Number(this.state.moveSpeed ?? 4) + (dash ? 1 : 0);
  }

  updateMovement(deltaSeconds = 1 / 60) {
    if (!this.state || this.state.scene !== 'PLAYING') return;
    this.ensureRealPosition();
    if (!this.isMoving()) return;
    const speed = this.realMoveSpeed();
    const distance = (2 ** speed / 256) * Math.max(0, deltaSeconds * 60);
    this.state.realX = approach(this.state.realX, this.state.x, distance);
    this.state.realY = approach(this.state.realY, this.state.y, distance);
    this.state.animationCount = Number(this.state.animationCount ?? 0) + 1.5 * Math.max(0, deltaSeconds * 60);
    if (this.state.animationCount > 18 - speed * 2) {
      this.state.pattern = (Number(this.state.pattern ?? 1) + 1) % 4;
      this.state.animationCount = 0;
    }
    if (!this.isMoving()) this.state.pattern = this.state.originalPattern ?? 1;
  }

  updateCamera() {
    if (!this.map || !this.state) return;
    const realX = Number.isFinite(this.state.realX) ? this.state.realX : this.state.x;
    const realY = Number.isFinite(this.state.realY) ? this.state.realY : this.state.y;
    this.state.displayX = clamp(realX - 9.5, 0, Math.max(0, Number(this.map.width) - 20));
    this.state.displayY = clamp(realY - 7, 0, Math.max(0, Number(this.map.height) - 15));
  }

  updatePlaytime(deltaSeconds = 1 / 60) {
    if (!this.state?.system || this.state.scene === 'TITLE') return;
    this.state.system.playtimeSeconds = Number(this.state.system.playtimeSeconds ?? 0) + Math.max(0, deltaSeconds);
    if (this.state.timer?.working) this.state.timer.count = Math.max(0, Number(this.state.timer.count ?? 0) - Math.max(0, deltaSeconds * 60));
  }

  async showMessage(text, options = {}) {
    if (options.face) await Promise.resolve(this.renderer.prepareFace?.(String(options.face)))
      .catch((error) => this.recordDiagnostic({ type: 'message-face-failed', face: options.face, error: error.message }));
    this.state.message = { text: this.expandText(text), face: String(options.face ?? ''), faceIndex: Number(options.faceIndex) || 0, background: Number(options.background) || 0, position: Number(options.position ?? 2), choiceAttached: Boolean(options.choiceAttached) };
    if (options.choiceAttached) return;
    return new Promise((resolve) => { this.messageResolve = resolve; });
  }

  showChoice(options, { cancelType = -1, defaultType = 0 } = {}) {
    const resolvedCancel = Number(cancelType) >= 0 && Number(cancelType) < options.length ? Number(cancelType) : -1;
    this.state.choice = { options: options.map((item) => this.expandText(item)), selected: clampIndex(defaultType, options.length), cancelType: resolvedCancel };
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
    this.state.actors[actorId].name = String(name ?? '').normalize('NFC');
  }

  expandText(text) {
    return String(text).normalize('NFC').replace(/\\[Nn]\[(\d+)\]/g, (_, id) => this.state.actors[id]?.name ?? '').replace(/\\[Cc]\[\d+\]|\\[.!|{}^><]/g, '').normalize('NFC');
  }

  triggerActionEvent() {
    this.events?.actionTrigger?.();
  }

  playSe(audio) { return this.audio.playSe(audio); }

  showAnimation(targetId, animationId) {
    const event = targetId === -1 ? null : this.map?.events?.[targetId];
    const runtime = event ? this.events?.runtime?.(targetId, event) : null;
    const target = targetId === -1 ? { x: this.state.x, y: this.state.y } : { x: runtime?.realX ?? event?.x ?? this.state.x, y: runtime?.realY ?? event?.y ?? this.state.y };
    return this.renderer.showAnimation(target, this.database.animations[animationId]);
  }

  showBalloon(targetId, balloonId) {
    const event = targetId === -1 ? null : this.map?.events?.[targetId];
    const runtime = event ? this.events?.runtime?.(targetId, event) : null;
    const target = targetId === -1 ? { x: this.state.x, y: this.state.y } : { x: runtime?.realX ?? event?.x ?? this.state.x, y: runtime?.realY ?? event?.y ?? this.state.y };
    return this.renderer.showBalloon(target, balloonId);
  }

  currentRenderableEvents(map = this.map) {
    return Object.values(map?.events ?? {}).flatMap((event) => {
      const page = this.activePage(event);
      const override = this.state.eventOverrides?.[`${this.state.mapId},${event.id}`] ?? {};
      const runtime = map === this.map ? this.events?.refresh?.(event) : null;
      const graphic = runtime?.graphic ?? override.graphic ?? page?.graphic;
      if (!graphic?.character_name || override.transparent) return [];
      const position = routePosition(override, event);
      return [{ id: event.id, x: position.x, y: position.y, direction: override.direction ?? graphic.direction, pattern: override.pattern ?? graphic.pattern, opacity: override.opacity ?? 255, blendType: override.blendType ?? 0, priority: override.priority ?? page?.priority_type ?? 1, graphic, moveSpeed: override.moveSpeed ?? page?.move_speed ?? 3, moveFrequency: override.moveFrequency ?? page?.move_frequency ?? 3, page: { ...page, graphic } }];
    });
  }

  runRubyCompatibility(source, context = {}) {
    if (String(source).trim() === 'recipe_all_switch_on') { this.party.unlockAllRecipes(this.state); return; }
    if (/^SceneManager\.call\(Scene_ItemSynthesis\)$/.test(String(source).trim())) { this.openSynthesisMenu(); return; }
    const recipe = /^([iwa])_recipe_switch_on\((\d+)\)$/.exec(String(source).trim());
    if (recipe) { const kind = ({ i: 'item', w: 'weapon', a: 'armor' })[recipe[1]]; this.state.party.recipes[kind][recipe[2]] = true; return; }
    const copyName = /^\$game_actors\[(\d+)\]\.name\s*=\s*\$game_actors\[(\d+)\]\.name$/.exec(String(source).trim());
    if (copyName) { this.setActorName(Number(copyName[1]), this.state.actors[copyName[2]]?.name ?? ''); return; }
    const journal = /^RETCON::Journal::journal_activate\((\d+)\)$/.exec(source);
    if (journal) {
      this.state.journal ??= {};
      this.state.journal[journal[1]] = true;
      return;
    }
    if (source === '$game_party.steps = 0') { this.state.steps = 0; return; }
    if (source === 'reset_stealth') { this.state.stealth = false; this.state.stealthCount = 0; return; }
    const symbol = /^enable_symbol_encount\((\d+)\)$/.exec(String(source).trim());
    if (symbol && context.eventId) {
      const runtime = this.events?.runtime?.(context.eventId);
      if (runtime) runtime.symbolId = Number(symbol[1]);
      return;
    }
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
      party: { members: [...(this.state.party?.members ?? [])], gold: this.state.party?.gold ?? 0, inventory: structuredClone(this.state.party?.inventory ?? {}) },
      battle: this.state.battle ? {
        troopId: this.state.battle.troopId, phase: this.state.battle.phase, result: this.state.battle.result,
        preemptive: this.state.battle.preemptive, surprise: this.state.battle.surprise, encounter: this.state.battle.encounter,
        difficulty: this.state.battle.difficulty, frames: this.state.battle.frames,
        actors: this.state.battle.actors.map(({ name, hp, mp, tp, ap, chant, states }) => ({ name, hp, mp, tp, ap, chant, states })),
        enemies: this.state.battle.enemies.map(({ enemyId, name, hp, mp, tp, ap, chant, states }) => ({ enemyId, name, hp, mp, tp, ap, chant, states })),
        rewards: this.state.battle.rewards ?? null, log: this.state.battle.log.slice(-12),
      } : null,
      interpreter: this.interpreter?.diagnostics(), modals: this.modalStack.map((entry) => ({ ...entry })),
      events: this.events?.diagnostics?.() ?? null,
      streaming: this.prefetch?.getStatus(),
      assets: this.loader.diagnostics(), audio: this.audio?.diagnostics(), renderer: this.renderer.diagnostics(),
      unsupported: [...this.unsupported], log: [...this.diagnosticsLog],
    };
  }

  snapshot() { return structuredClone(this.state); }
  async save(slot) {
    this.state.system ??= {};
    this.state.system.saveCount = Number(this.state.system.saveCount ?? 0) + 1;
    const metadata = await this.saves.save(slot, this.snapshot(), { location: this.state.mapName });
    this.lastSaveSlot = Number(slot);
    this.hasSave = true;
    this.status(`Đã lưu vào tệp ${slot}.`);
    this.recordDiagnostic({ type: 'save-db-ready', operation: 'save', slot, metadata });
    return metadata;
  }
  async load(slot) {
    const state = await this.saves.load(slot);
    if (!state) throw new Error(`Save slot ${slot} is empty.`);
    this.state = state;
    this.party.normalizeState(this.state);
    this.state.schema = 'black-souls-st-state-v2';
    this.state.system ??= { saveDisabled: false, menuDisabled: false, encounterDisabled: false, formationDisabled: false, playtimeSeconds: 0, startedAt: Date.now(), saveCount: 0 };
    this.state.timer ??= { working: false, count: 0 };
    this.state.pluginState ??= {};
    this.state.realX = Number.isFinite(this.state.realX) ? this.state.realX : this.state.x;
    this.state.realY = Number.isFinite(this.state.realY) ? this.state.realY : this.state.y;
    this.state.moveSpeed ??= 4; this.state.pattern ??= 1; this.state.originalPattern ??= 1; this.state.animationCount ??= 0;
    this.state.displayX ??= 0; this.state.displayY ??= 0; this.state.originOpacity ??= 255; this.state.stealthCount ??= 0;
    this.state.eventOverrides ??= {}; this.state.pictures ??= {}; this.state.battle = null;
    this.state.scene = 'PLAYING'; this.state.menu = null;
    await this.loadMap(state.mapId);
    await Promise.all(Object.values(this.state.pictures).filter((picture) => picture?.name).map((picture) => this.renderer.showPicture?.(picture.id, picture.name, picture)));
    if (this.state.screenTone) void this.renderer.tintScreen?.(this.state.screenTone.tone, 0);
    if (this.state.screenFlash) void this.renderer.flashScreen?.(this.state.screenFlash.color, this.state.screenFlash.frames);
    if (this.state.screenShake) void this.renderer.shakeScreen?.(this.state.screenShake.power, this.state.screenShake.speed, this.state.screenShake.frames);
    if (this.state.weather) void this.renderer.setWeather?.(this.state.weather.type, this.state.weather.power, 0);
    this.lastSaveSlot = Number(slot);
    this.hasSave = true;
    this.notifyScene();
    this.status(`Đã tải tệp ${slot}.`);
    this.recordDiagnostic({ type: 'save-db-ready', operation: 'load', slot });
  }

  async exportSave(slot = null) { return this.saves.export(slot ?? this.lastSaveSlot ?? await this.saves.latestSlot()); }
  async importSave(serialized, targetSlot = null) {
    const metadata = await this.saves.import(serialized, targetSlot);
    this.hasSave = true;
    if (this.state.scene === 'TITLE') await this.enterTitle();
    return metadata;
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
function clampIndex(value, length) { return length ? Math.max(0, Math.min(length - 1, Number(value) || 0)) : 0; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function approach(current, target, distance) { return current < target ? Math.min(current + distance, target) : current > target ? Math.max(current - distance, target) : target; }
function sumParams(values = []) { return values.reduce((sum, value) => sum + Number(value || 0), 0); }
function routePosition(override, event) {
  const motion = override.motion;
  if (!motion) return { x: override.realX ?? override.x ?? event.x, y: override.realY ?? override.y ?? event.y };
  const progress = Math.max(0, Math.min(1, (performance.now() - motion.began) / Math.max(1, motion.durationMs)));
  return { x: motion.fromX + (motion.toX - motion.fromX) * progress, y: motion.fromY + (motion.toY - motion.fromY) * progress };
}
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
