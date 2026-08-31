import { InputController } from './input.js';
import { CollisionMap } from '../map/collision.js';
import { EventInterpreter } from '../map/interpreter.js';
import { AudioManager } from '../audio/audio-manager.js';
import { cancelScene } from './lifecycle.js';
import { PartySystem } from '../game/party-system.js';
import { CombatSystem } from '../game/combat-system.js';

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
  }

  async initialize() {
    this.database = await this.loader.initialize();
    this.party = new PartySystem(this.database, this.database.inventoryDependencies);
    this.combat = new CombatSystem(this.database, this.party, (entry) => this.recordDiagnostic(entry));
    this.prefetch = this.loader.prefetch;
    this.input = new InputController(this.renderer.stage);
    this.interpreter = new EventInterpreter(this);
    this.audio = new AudioManager(this.loader, (entry) => this.recordDiagnostic(entry));
    this.state = this.initialState('LOADING');
    this.prefetch.setContextProvider(() => ({
      interpreter: this.interpreter?.snapshot?.() ?? null,
      renderer: { scene: this.renderer.stats.scene, mapId: this.renderer.stats.mapId, frames: this.renderer.stats.frames },
      state: { scene: this.state?.scene, mapId: this.state?.mapId, loadingMap: this.state?.loadingMap },
    }));
    this.hasSave = await this.saves.has(1).catch((error) => { this.recordDiagnostic({ type: 'save-probe-failed', error: error.message }); return false; });
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
      schema: 'black-souls-st-state-v1', scene, mapId: this.database.system.start_map_id,
      x: this.database.system.start_x, y: this.database.system.start_y, direction: 2, pattern: 1, steps: 0,
      switches: {}, variables: {}, selfSwitches: {}, transparent: false, opacity: 255, message: null,
      ...partyState, choice: null, pictures: {}, screenTone: null, screenFlash: null, screenShake: null, weather: null, battle: null, eventOverrides: {},
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
    this.notifyScene();
    await this.loadMap(this.state.mapId);
    this.status(`New game: map ${this.state.mapId} (${this.state.x}, ${this.state.y})`);
    void this.runAutorunEvents().catch((error) => this.handleInterpreterFailure(error));
  }

  async loadMap(mapId) {
    this.state.loadingMap = true;
    this.onTransitionState({ state: 'loading', mapId, streaming: this.prefetch?.getStatus?.() ?? null });
    try {
      await this.prefetch?.prepareMap?.(mapId, { x: this.state.x, y: this.state.y });
      const map = await this.loader.map(mapId);
      const tileset = this.database.tilesets[map.tileset_id];
      const collision = new CollisionMap(map, tileset);
      const actorId = this.database.system.party_members?.[0] ?? 1;
      const actor = this.database.actors[actorId];
      const actorState = this.state.actors[actorId];
      const playerGraphic = { character_name: actorState?.characterName ?? actor?.character_name ?? '', character_index: actorState?.characterIndex ?? actor?.character_index ?? 0 };
      await this.renderer.setMap(map, tileset, { playerGraphic, events: this.currentRenderableEvents(map), mapId, x: this.state.x, y: this.state.y });
      this.map = map;
      this.collision = collision;
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
    if (condition.item_valid && this.party.quantity(this.state, 'item', condition.item_id) <= 0) return false;
    if (condition.actor_valid && !this.state.party.members.includes(condition.actor_id)) return false;
    return true;
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
    if (this.state.scene === 'BATTLE') { this.updateBattle(); return; }
    if (['MENU', 'END', 'ITEM', 'EQUIP', 'STATUS', 'SYNTHESIS', 'SHOP'].includes(this.state.scene)) { this.updateMenu(); return; }
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
    if (this.state.scene === 'ITEM') { this.updateItemMenu(); return; }
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
    if (command.symbol === 'save') void this.save(1);
    if (command.symbol === 'game_end') this.openEndMenu();
    if (command.symbol === 'item') this.openItemMenu();
    if (command.symbol === 'equip') this.openEquipMenu();
    if (command.symbol === 'status') this.openStatusMenu();
  }

  openMenu() {
    const labels = this.database.system.terms.commands;
    this.state.menu = {
      kind: 'menu', selected: 0,
      commands: [
        { symbol: 'item', label: labels[4], enabled: true }, { symbol: 'skill', label: labels[5], enabled: false },
        { symbol: 'equip', label: labels[6], enabled: true }, { symbol: 'status', label: labels[7], enabled: true },
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
    const entries = this.party.inventoryEntries(this.state, ['item']);
    this.state.menu = { kind: 'item', selected: 0, entries };
    this.setScene('ITEM');
  }

  updateItemMenu() {
    const menu = this.state.menu;
    if (this.input.takeCancel()) { this.openMenu(); return; }
    const movement = this.input.takeDirection();
    if (movement?.[1] && menu.entries.length) menu.selected = cycle(menu.selected, Math.sign(movement[1]), menu.entries.length);
    if (!this.input.takeConfirm() || !menu.entries.length) return;
    const entry = menu.entries[menu.selected];
    const result = this.party.useItem(this.state, entry.id, this.state.party.members[0]);
    if (result.used) this.status(`Used ${entry.data.name}.`);
    menu.entries = this.party.inventoryEntries(this.state, ['item']);
    menu.selected = Math.max(0, Math.min(menu.selected, menu.entries.length - 1));
  }

  openEquipMenu() {
    const actorId = this.state.party.members[0];
    this.state.menu = { kind: 'equip', mode: 'slots', actorId, selected: 0, choices: [], choiceSelected: 0 };
    this.decorateEquipMenu(this.state.menu);
    this.setScene('EQUIP');
  }

  updateEquipMenu() {
    const menu = this.state.menu; const actor = this.state.actors[menu.actorId];
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
    if (this.input.takeCancel()) { this.openMenu(); return; }
    const movement = this.input.takeDirection();
    if (movement?.[1] && actor.equips.length) menu.selected = cycle(menu.selected, Math.sign(movement[1]), actor.equips.length);
    if (!this.input.takeConfirm()) return;
    const current = actor.equips[menu.selected];
    menu.choices = [{ kind: current.kind, id: 0, amount: 0, data: { name: '(Remove)' } }, ...this.party.inventoryEntries(this.state, ['weapon', 'armor']).filter((entry) => this.party.canEquip(this.state, menu.actorId, entry.kind, entry.id, menu.selected))];
    menu.choiceSelected = 0; menu.mode = 'choices';
  }

  decorateEquipMenu(menu) {
    menu.slotEntries = (this.state.actors[menu.actorId]?.equips ?? []).map((slot) => ({ ...slot, data: slot.id ? this.party.data(slot.kind, slot.id) : null }));
  }

  openStatusMenu() {
    const actorId = this.state.party.members[0];
    this.state.menu = { kind: 'status', actorId, parameters: this.party.parameters(this.state, actorId) };
    this.setScene('STATUS');
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
    const battle = this.combat.createBattle(this.state, troopId, {
      canEscape, canLose, battleback1: this.state.nextBattleback1 ?? this.map?.battleback1_name ?? '', battleback2: this.state.nextBattleback2 ?? this.map?.battleback2_name ?? '',
    });
    this.state.battle = battle;
    await this.renderer.setBattle?.(battle);
    void this.audio.playLoop('bgm', this.state.battleBgm ?? this.database.system.battle_bgm);
    this.setScene('BATTLE');
    return new Promise((resolve) => { this.battleResolve = resolve; });
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
    const symbol = ['attack', 'skill', 'item', 'guard', 'escape'][battle.selectedCommand];
    const payload = symbol === 'skill' ? { skillId: this.state.actors[battle.actors[battle.activeActor].actorId].skills[0] ?? 1 }
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

  advancePattern() {
    this.state.pattern = [0, 1, 2, 1][(this.state.steps ?? 0) % 4];
    this.state.steps = (this.state.steps ?? 0) + 1;
    this.prefetch?.prefetchLikelyDestinations(this.state.mapId, { x: this.state.x, y: this.state.y });
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
      const override = this.state.eventOverrides?.[`${this.state.mapId},${event.id}`] ?? {};
      const graphic = override.graphic ?? page?.graphic;
      if (!graphic?.character_name) return [];
      return [{ id: event.id, x: override.x ?? event.x, y: override.y ?? event.y, direction: override.direction ?? graphic.direction, pattern: override.pattern ?? graphic.pattern, opacity: override.opacity ?? 255, priority: page?.priority_type ?? 1, graphic, page: { ...page, graphic } }];
    });
  }

  runRubyCompatibility(source) {
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
      party: { members: [...(this.state.party?.members ?? [])], gold: this.state.party?.gold ?? 0, inventory: structuredClone(this.state.party?.inventory ?? {}) },
      battle: this.state.battle ? {
        troopId: this.state.battle.troopId, phase: this.state.battle.phase, result: this.state.battle.result,
        difficulty: this.state.battle.difficulty, frames: this.state.battle.frames,
        actors: this.state.battle.actors.map(({ name, hp, mp, tp, ap, chant, states }) => ({ name, hp, mp, tp, ap, chant, states })),
        enemies: this.state.battle.enemies.map(({ enemyId, name, hp, mp, tp, ap, chant, states }) => ({ enemyId, name, hp, mp, tp, ap, chant, states })),
        rewards: this.state.battle.rewards ?? null, log: this.state.battle.log.slice(-12),
      } : null,
      interpreter: this.interpreter?.diagnostics(), modals: this.modalStack.map((entry) => ({ ...entry })),
      streaming: this.prefetch?.getStatus(),
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
    this.party.normalizeState(this.state);
    this.state.eventOverrides ??= {}; this.state.pictures ??= {}; this.state.battle = null;
    this.state.scene = 'PLAYING'; this.state.menu = null;
    await this.loadMap(state.mapId);
    await Promise.all(Object.values(this.state.pictures).filter((picture) => picture?.name).map((picture) => this.renderer.showPicture?.(picture.id, picture.name, picture)));
    if (this.state.screenTone) void this.renderer.tintScreen?.(this.state.screenTone.tone, 0);
    if (this.state.screenFlash) void this.renderer.flashScreen?.(this.state.screenFlash.color, this.state.screenFlash.frames);
    if (this.state.screenShake) void this.renderer.shakeScreen?.(this.state.screenShake.power, this.state.screenShake.speed, this.state.screenShake.frames);
    if (this.state.weather) void this.renderer.setWeather?.(this.state.weather.type, this.state.weather.power, 0);
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
