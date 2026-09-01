export const TILE_ID = Object.freeze({ B: 0, C: 256, D: 512, E: 768, A5: 1536, A1: 2048, A2: 2816, A3: 4352, A4: 5888, MAX: 8192 });

export class CanvasRenderer {
  constructor(stage, loader, engineConfig) {
    this.stage = stage; this.loader = loader;
    this.width = engineConfig.logicalWidth; this.height = engineConfig.logicalHeight; this.tileSize = engineConfig.tileSize;
    this.canvas = document.createElement('canvas'); this.canvas.width = this.width; this.canvas.height = this.height;
    this.displayContext = this.canvas.getContext('2d'); this.displayContext.imageSmoothingEnabled = false;
    this.frameCanvas = document.createElement('canvas'); this.frameCanvas.width = this.width; this.frameCanvas.height = this.height;
    this.context = this.frameCanvas.getContext('2d'); this.context.imageSmoothingEnabled = false; stage.append(this.canvas);
    this.fade = 0; this.characterImages = new Map(); this.faceImages = new Map(); this.animations = []; this.balloons = []; this.pictures = new Map();
    this.screenTone = null; this.screenFlash = null; this.screenShake = null; this.weather = null; this.battleGraphics = null;
    this.animationSheetFailures = new Map();
    this.characterSheetFailures = new Map();
    this.frameHistory = [];
    this.stats = { frames: 0, presentedFrames: 0, retainedFrames: 0, lastFrameMs: 0, maxFrameMs: 0, scene: 'LOADING', mapId: null, tileset: null, loadedSheets: [], characters: [], missingCharacters: [], title: null, animationFailures: [], fontReadyMs: 0, font: 'Arial', backbuffer: { width: this.width, height: this.height, atomicPresent: true }, chunks: [] };
  }

  async setTitle(system) {
    const fontBegan = performance.now();
    await waitForFonts();
    this.stats.fontReadyMs = Math.round((performance.now() - fontBegan) * 100) / 100;
    const title1Path = system.title1_name ? `Graphics/Titles1/${system.title1_name}.png` : null;
    const title2Path = system.title2_name ? `Graphics/Titles2/${system.title2_name}.png` : null;
    const [title1, title2, windowSkin, iconSet] = await Promise.all([
      title1Path ? this.loader.image(title1Path) : null,
      title2Path ? this.loader.image(title2Path) : null,
      this.loader.image('Graphics/System/Window.png'),
      this.loader.image('Graphics/System/IconSet.png'),
    ]);
    this.windowSkin = windowSkin; this.iconSet = iconSet; this.currencyUnit = system.currency_unit ?? '';
    this.title = { title1, title2, title1Path, title2Path };
    this.stats.title = {
      title1: title1Path ? { path: title1Path, width: title1.naturalWidth || title1.width, height: title1.naturalHeight || title1.height, decoded: true } : null,
      title2: title2Path ? { path: title2Path, width: title2.naturalWidth || title2.width, height: title2.naturalHeight || title2.height, decoded: true } : null,
      stretchMode: 'RGSSLAB::XP_Display_Size::TITLE_TYPE=1 (640x480)',
    };
  }

  async setMap(map, tileset, { playerGraphic, events = [], mapId, x = 0, y = 0 } = {}) {
    const loadToken = Symbol(`map-${mapId ?? 'unknown'}`);
    this.mapLoadToken = loadToken;
    const sheets = await Promise.all((tileset?.tileset_names ?? []).map((name) => name ? this.loader.image(`Graphics/Tilesets/${name}.png`) : null));
    const inInitialViewport = (event) => !Number.isFinite(event.x) || !Number.isFinite(event.y) || (Math.abs(event.x - x) <= 12 && Math.abs(event.y - y) <= 9);
    const initialEvents = events.filter(inInitialViewport);
    const deferredEvents = events.filter((event) => !inInitialViewport(event));
    const graphics = [playerGraphic, ...initialEvents.map((event) => event.page?.graphic)].filter((graphic) => graphic?.character_name);
    const characterImages = new Map(this.characterImages);
    const missingCharacters = [];
    await Promise.all([...new Set(graphics.map((graphic) => graphic.character_name))].map(async (name) => {
      const path = `Graphics/Characters/${name}.png`;
      if (this.characterSheetFailures.has(path)) { missingCharacters.push(name); return; }
      const image = await this.loader.image(path, { optional: true });
      if (image) characterImages.set(name, image);
      else {
        this.characterSheetFailures.set(path, 'unavailable');
        missingCharacters.push(name);
      }
    }));
    const fog = await this.loadFog(map.note);
    this.map = map; this.tileset = tileset; this.sheets = sheets; this.characterImages = characterImages; this.fog = fog; this.playerGraphic = playerGraphic;
    this.stats.mapId = mapId; this.stats.tileset = tileset?.name ?? null; this.stats.loadedSheets = (tileset?.tileset_names ?? []).filter(Boolean); this.stats.characters = [...this.characterImages.keys()]; this.stats.missingCharacters = missingCharacters;
    this.stats.chunks = [{ id: `map:${mapId}:viewport`, ready: true, pending: false, dirty: false, mode: 'synchronous-integer-tile-window', marginTiles: 2 }];
    void this.streamCharacterGraphics(deferredEvents, loadToken);
  }

  async streamCharacterGraphics(events, loadToken = this.mapLoadToken) {
    const names = [...new Set(events.map((event) => event.page?.graphic?.character_name).filter(Boolean))]
      .filter((name) => !this.characterImages.has(name));
    await Promise.allSettled(names.map(async (name) => {
      const path = `Graphics/Characters/${name}.png`;
      if (this.characterSheetFailures.has(path)) return;
      const image = await this.loader.image(path, { optional: true });
      if (this.mapLoadToken !== loadToken) return;
      if (image) this.characterImages.set(name, image);
      else {
        this.characterSheetFailures.set(path, 'unavailable');
        if (!this.stats.missingCharacters.includes(name)) this.stats.missingCharacters.push(name);
      }
      this.stats.characters = [...this.characterImages.keys()];
    }));
  }

  async ensureEventGraphics(events, loadToken = this.mapLoadToken) {
    const names = [...new Set(events.map((event) => event.page?.graphic?.character_name ?? event.graphic?.character_name).filter(Boolean))]
      .filter((name) => !this.characterImages.has(name));
    const unavailable = [];
    await Promise.all(names.map(async (name) => {
      const path = `Graphics/Characters/${name}.png`;
      try {
        const image = await this.loader.image(path);
        if (this.mapLoadToken === loadToken && image) {
          this.characterImages.set(name, image);
          this.characterSheetFailures.delete(path);
          this.stats.missingCharacters = this.stats.missingCharacters.filter((entry) => entry !== name);
        }
      } catch (error) {
        unavailable.push({ name, error: error.message });
        this.characterSheetFailures.set(path, error.message);
        if (!this.stats.missingCharacters.includes(name)) this.stats.missingCharacters.push(name);
      }
    }));
    this.stats.characters = [...this.characterImages.keys()];
    if (unavailable.length) throw new Error(`Could not load active event graphic: ${unavailable.map((entry) => entry.name).join(', ')}`);
  }

  async prepareFace(name) {
    if (!name || this.faceImages.has(name)) return this.faceImages.get(name) ?? null;
    const image = await this.loader.image(`Graphics/Faces/${name}.png`, { optional: true });
    if (image) this.faceImages.set(name, image);
    return image;
  }

  async setBattle(battle) {
    const battleback1Path = battle.battleback1 ? `Graphics/Battlebacks1/${battle.battleback1}.png` : null;
    const battleback2Path = battle.battleback2 ? `Graphics/Battlebacks2/${battle.battleback2}.png` : null;
    const [battleback1, battleback2, mist] = await Promise.all([
      battleback1Path ? this.loader.image(battleback1Path, { optional: true }) : null,
      battleback2Path ? this.loader.image(battleback2Path, { optional: true }) : null,
      battle.mistEnabled ? this.loader.image('Graphics/System/mist.png', { optional: true }) : null,
    ]);
    const enemies = new Map();
    await Promise.all([...new Set(battle.enemies.map((enemy) => enemy.battlerName).filter(Boolean))].map(async (name) => {
      const image = await this.loader.image(`Graphics/Battlers/${name}.png`);
      enemies.set(name, image);
    }));
    await Promise.all([...new Set(battle.actors.map((actor) => actor.faceName).filter(Boolean))].map((name) => this.prepareFace(name)));
    this.battleGraphics = { battleback1, battleback2, battleback1Path, battleback2Path, enemies, mist };
  }

  clearBattle() { this.battleGraphics = null; }

  async loadFog(note = '') {
    const match = /==マップフォグ([^\[]+)\[([^\]]+)\]==/.exec(note); if (!match) return null;
    const [x = 0, y = 0, zoom = 100, opacity = 255, blend = 0] = match[2].split(',').map(Number);
    const image = await this.loader.image(`Graphics/Parallaxes/${match[1]}.png`, { optional: true });
    return image ? { image, x, y, zoom, opacity, blend } : null;
  }

  render(state, events = []) {
    const began = performance.now();
    const telemetry = { frame: this.stats.frames + 1, scene: state.scene ?? 'PLAYING', mapId: state.mapId ?? this.stats.mapId, began, presented: false, retainedPreviousFrame: false, clearCalls: 0, drawCalls: 0, invalidTileLookups: 0, missingTileSamples: 0, tileSamples: 0, tileDraws: 0, tilesetReady: Boolean(this.sheets), autotileCacheReady: Boolean(this.sheets?.slice(0, 4).every((sheet, index) => !this.tileset?.tileset_names?.[index] || sheet)), offscreenCanvas: { width: this.frameCanvas.width, height: this.frameCanvas.height }, camera: null, visibleRange: null, chunkIds: this.stats.chunks.map((entry) => entry.id), pendingChunks: this.stats.chunks.filter((entry) => entry.pending).map((entry) => entry.id), dirtyChunks: this.stats.chunks.filter((entry) => entry.dirty).map((entry) => entry.id) };
    this.activeFrame = telemetry;
    try {
      this.renderFrame(state, events);
      // Present only after the full logical frame is ready. No visible-canvas
      // clear occurs, so a failed frame leaves the last known-good image intact.
      this.displayContext.drawImage(this.frameCanvas, 0, 0);
      telemetry.presented = true;
      this.stats.presentedFrames += 1;
    } catch (error) {
      telemetry.retainedPreviousFrame = true;
      telemetry.error = error.message;
      this.stats.retainedFrames += 1;
      throw error;
    } finally {
      this.finishFrame(began, telemetry);
      this.activeFrame = null;
    }
  }

  renderFrame(state, events = []) {
    const context = this.context; context.fillStyle = '#080709'; context.fillRect(0, 0, this.width, this.height);
    this.stats.scene = state.scene ?? 'PLAYING';
    if (state.scene === 'TITLE') {
      this.drawTitle(state.title);
      return;
    }
    if (state.scene === 'BATTLE') {
      this.drawBattle(state.battle);
      this.drawPictures();
      this.drawScreenEffects();
      return;
    }
    if (state.scene === 'FILE_LOAD') {
      this.drawFileMenu(state.menu);
      return;
    }
    if (!this.map || !this.sheets) return;
    const playerX = Number.isFinite(state.realX) ? state.realX : state.x; const playerY = Number.isFinite(state.realY) ? state.realY : state.y;
    const window = computeTileWindow({ displayX: state.displayX, displayY: state.displayY, playerX, playerY, mapWidth: this.map.width, mapHeight: this.map.height, width: this.width, height: this.height, tileSize: this.tileSize, margin: 2 });
    const cameraX = window.cameraX; const cameraY = window.cameraY;
    this.camera = { x: cameraX, y: cameraY, logicalX: window.logicalX, logicalY: window.logicalY, pixelX: window.pixelX, pixelY: window.pixelY };
    if (this.activeFrame) { this.activeFrame.camera = { ...this.camera }; this.activeFrame.visibleRange = { startX: window.startX, endX: window.endX, startY: window.startY, endY: window.endY, marginTiles: window.margin }; }
    const upper = [];
    // VX Ace composes ground layers 0/1 first, then the z=3 shadow bits and
    // table edges, and finally the ordinary z=2 tiles. Star-priority tiles
    // from every map layer are deferred until after normal-priority sprites.
    this.drawMapLayer(0, window, upper);
    this.drawMapLayer(1, window, upper);
    this.drawShadows(window);
    this.drawTableEdges(window);
    this.drawMapLayer(2, window, upper);
    const sprites = events.map((event) => ({ ...event, priority: event.priority ?? 1, type: 'event' }));
    if (!state.transparent) sprites.push({ x: playerX, y: playerY, direction: state.direction, pattern: state.pattern ?? 1, opacity: state.opacity ?? 255, priority: 1, graphic: this.playerGraphic, type: 'player' });
    sprites.sort((a, b) => a.priority - b.priority || a.y - b.y || (a.type === 'event' ? -1 : 1));
    for (const sprite of sprites.filter((item) => item.priority < 2)) this.drawCharacter(sprite, cameraX, cameraY);
    for (const args of upper) this.drawTile(...args); this.drawFog();
    for (const sprite of sprites.filter((item) => item.priority >= 2)) this.drawCharacter(sprite, cameraX, cameraY);
    // Background discovery is best-effort and remembers failures. Explicit event
    // page/resource barriers use ensureEventGraphics so Retry can make a fresh attempt.
    void this.streamCharacterGraphics(events).catch(() => {});
    this.drawAnimations(cameraX, cameraY); this.drawBalloons(cameraX, cameraY); this.drawPictures(); this.drawWeather();
    // VX Ace applies Game_Screen tone/flash to the scene viewports. Window-layer
    // UI is composed afterwards and must remain legible during a black tint.
    this.drawScreenEffects();
    this.drawMessage(state.message); this.drawChoice(state.choice);
    if (['MENU', 'END', 'ITEM', 'SKILL', 'EQUIP', 'STATUS', 'SYNTHESIS', 'SHOP', 'FILE_SAVE', 'FILE_LOAD'].includes(state.scene)) this.drawGameMenu(state.menu, state);
    if (this.fade > 0) { context.fillStyle = `rgba(0,0,0,${this.fade})`; context.fillRect(0, 0, this.width, this.height); }
  }

  finishFrame(began, telemetry = this.activeFrame) {
    const elapsed = performance.now() - began; this.stats.frames += 1; this.stats.lastFrameMs = Math.round(elapsed * 100) / 100; this.stats.maxFrameMs = Math.max(this.stats.maxFrameMs, this.stats.lastFrameMs);
    if (telemetry) {
      telemetry.elapsedMs = this.stats.lastFrameMs;
      telemetry.ended = performance.now();
      this.frameHistory.push(telemetry);
      this.frameHistory = this.frameHistory.slice(-240);
      this.stats.lastFrame = telemetry;
    }
  }

  drawTitle(title) {
    const c = this.context;
    if (this.title?.title1) c.drawImage(this.title.title1, 0, 0, this.width, this.height);
    if (this.title?.title2) c.drawImage(this.title.title2, 0, 0, this.width, this.height);
    const commands = title?.commands ?? [];
    const width = 160; const lineHeight = 24; const padding = 12; const height = commands.length * lineHeight + padding * 2;
    const x = (this.width - width) / 2; const y = (this.height * 1.6 - height) / 2;
    this.drawWindow(x, y, width, height);
    c.font = font(22); c.textBaseline = 'middle';
    commands.forEach((command, index) => {
      const selected = index === title?.selected;
      c.fillStyle = command.enabled === false ? '#777' : '#f4f4f4';
      if (selected) this.drawCursor(x + 12, y + padding + lineHeight * index, width - 24, lineHeight);
      c.fillText(displayText(command.label), x + 16, y + padding + lineHeight * index + lineHeight / 2);
    });
    c.textBaseline = 'alphabetic';
  }

  drawGameMenu(menu, state = {}) {
    if (!menu) return;
    if (menu.kind === 'file') return this.drawFileMenu(menu);
    if (menu.kind === 'item' || menu.kind === 'skill' || menu.kind === 'synthesis' || menu.kind === 'shop') return this.drawInventoryMenu(menu, state);
    if (menu.kind === 'equip') return this.drawEquipMenu(menu, state);
    if (menu.kind === 'status') return this.drawStatusMenu(menu, state);
    const c = this.context; c.fillStyle = 'rgba(0,0,0,.30)'; c.fillRect(0, 0, this.width, this.height);
    const width = menu.kind === 'end' ? 160 : 160; const lineHeight = 24; const padding = 12; const height = menu.commands.length * lineHeight + padding * 2;
    const x = menu.kind === 'end' ? (this.width - width) / 2 : 0; const y = menu.kind === 'end' ? (this.height - height) / 2 : 0;
    this.drawWindow(x, y, width, height);
    c.font = font(20); c.textBaseline = 'middle';
    menu.commands.forEach((command, index) => {
      const selected = index === menu.selected;
      c.fillStyle = command.enabled === false ? '#777' : '#f4f4f4';
      if (selected) this.drawCursor(x + padding, y + padding + index * lineHeight, width - padding * 2, lineHeight);
      c.fillText(displayText(command.label), x + 16, y + padding + lineHeight * index + lineHeight / 2);
    });
    c.textBaseline = 'alphabetic';
    if (menu.kind !== 'end') this.drawMenuStatus(state, menu);
  }

  drawMenuStatus(state, menu = {}) {
    const c = this.context;
    this.drawWindow(160, 0, 480, 480);
    const members = state.party?.members ?? [];
    members.slice(0, 4).forEach((actorId, index) => {
      const actor = state.actors?.[actorId] ?? {}; const y = 12 + index * 114;
      this.drawActorPortrait(actor, 170, y + 6, 96, 96);
      c.font = font(20); c.fillStyle = '#f4f4f4'; c.fillText(displayText(actor.name), 278, y + 25);
      c.font = font(18); c.fillText(`Lv ${actor.level ?? 1}`, 278, y + 53);
      const parameters = menu.actorStatus?.[actorId] ?? {};
      this.drawGauge(360, y + 42, 138, 8, actor.hp, parameters.mhp ?? actor.hp, '#d85a5a', '#7b1f2b');
      c.fillText(`HP ${Math.floor(actor.hp ?? 0)}`, 278, y + 78);
      c.fillText(`MP ${Math.floor(actor.mp ?? 0)}`, 414, y + 78);
    });
    this.drawWindow(0, 432, 160, 48);
    c.font = font(18); c.fillStyle = '#f4f4f4'; c.textAlign = 'right'; c.fillText(`${Math.floor(state.party?.gold ?? 0)} ${displayText(this.currencyUnit)}`, 146, 462); c.textAlign = 'left';
    this.drawWindow(0, 370, 160, 64);
    c.fillStyle = '#e5d08d'; c.fillText('Tội Lỗi', 14, 394); c.fillStyle = '#f4f4f4'; c.textAlign = 'right'; c.fillText(String(state.variables?.[38] ?? 0), 140, 420); c.textAlign = 'left';
  }

  drawInventoryMenu(menu, state = {}) {
    const c = this.context; c.fillStyle = 'rgba(0,0,0,.30)'; c.fillRect(0, 0, this.width, this.height);
    const entries = menu.entries ?? [];
    const selected = entries[menu.selected];
    this.drawWindow(0, 0, 640, 48);
    c.font = font(18); c.fillStyle = '#f4f4f4'; c.fillText(displayText(selected?.data?.description ?? ''), 14, 30);
    let listY = 48;
    if (menu.kind === 'item') {
      this.drawWindow(0, 48, 640, 48); listY = 96;
      const columnWidth = 640 / Math.max(1, menu.categories?.length ?? 4);
      (menu.categories ?? []).forEach((category, index) => {
        if (menu.mode === 'category' && index === menu.categorySelected) this.drawCursor(index * columnWidth + 12, 60, columnWidth - 24, 24);
        c.fillStyle = '#f4f4f4'; c.textAlign = 'center'; c.fillText(displayText(category.label), index * columnWidth + columnWidth / 2, 82);
      });
      c.textAlign = 'left';
    }
    this.drawWindow(0, listY, 640, 480 - listY);
    c.font = font(18);
    entries.slice(0, 28).forEach((entry, index) => {
      const column = index % 2; const row = Math.floor(index / 2); const x = 12 + column * 308; const y = listY + 12 + row * 24;
      const active = menu.kind !== 'item' || menu.mode === 'items';
      if (active && index === menu.selected) this.drawCursor(x, y, 300, 24);
      const data = entry.data ?? {};
      if (data.icon_index != null) this.drawIcon(Number(data.icon_index), x + 2, y);
      const suffix = menu.kind === 'shop' ? `${entry.price} ${this.currencyUnit}` : menu.kind === 'skill' ? `${data.mp_cost ?? 0} MP` : `:${String(entry.amount ?? 1).padStart(2, ' ')}`;
      c.fillStyle = '#f4f4f4'; c.fillText(displayText(data.name ?? `${entry.kind} ${entry.id}`), x + 30, y + 19);
      c.textAlign = 'right'; c.fillText(displayText(suffix), x + 294, y + 19); c.textAlign = 'left';
    });
  }

  drawEquipMenu(menu, state) {
    const c = this.context; c.fillStyle = 'rgba(0,0,0,.30)'; c.fillRect(0, 0, this.width, this.height);
    const actor = state.actors?.[menu.actorId] ?? {}; const selectedSlot = menu.slotEntries?.[menu.selected];
    this.drawWindow(0, 0, 640, 48); c.font = font(18); c.fillStyle = '#f4f4f4'; c.fillText(displayText(selectedSlot?.data?.description ?? ''), 14, 30);
    this.drawWindow(0, 48, 208, 192); c.fillText(displayText(actor.name), 16, 76);
    const labels = ['Công Kích', 'Phòng Ngự', 'Phép Thuật', 'Kháng Phép', 'Tốc Độ', 'May Mắn'];
    const names = ['atk', 'def', 'mat', 'mdf', 'agi', 'luk'];
    labels.forEach((label, index) => { c.fillStyle = '#e5d08d'; c.fillText(label, 16, 102 + index * 24); c.fillStyle = '#f4f4f4'; c.textAlign = 'right'; c.fillText(String(menu.parameters?.[names[index]] ?? 0), 190, 102 + index * 24); c.textAlign = 'left'; });
    this.drawWindow(208, 48, 432, 48);
    (menu.commands ?? []).forEach((command, index) => {
      const x = 220 + index * 136; if (menu.mode === 'command' && index === menu.commandSelected) this.drawCursor(x, 60, 128, 24);
      c.fillStyle = '#f4f4f4'; c.textAlign = 'center'; c.fillText(displayText(command.label), x + 64, 80);
    }); c.textAlign = 'left';
    this.drawWindow(208, 96, 432, 144);
    const etypeNames = ['Vũ Khí', '', '', 'Nhẫn', 'Phụ Kiện'];
    (menu.slotEntries ?? actor.equips ?? []).slice(0, 5).forEach((slot, index) => {
      const y = 108 + index * 24; if (menu.mode === 'slots' && index === menu.selected) this.drawCursor(220, y, 408, 24);
      c.fillStyle = '#e5d08d'; c.fillText(displayText(etypeNames[slot.etypeId] ?? ''), 224, y + 19);
      if (slot.data?.icon_index != null) this.drawIcon(slot.data.icon_index, 314, y);
      c.fillStyle = '#f4f4f4'; c.fillText(displayText(slot.data?.name ?? ''), 342, y + 19);
    });
    this.drawWindow(0, 240, 640, 240);
    if (menu.mode === 'choices') (menu.choices ?? []).slice(0, 18).forEach((entry, index) => {
      const column = index % 2; const row = Math.floor(index / 2); const x = 12 + column * 308; const y = 252 + row * 24;
      if (index === menu.choiceSelected) this.drawCursor(x, y, 300, 24);
      if (entry.data?.icon_index != null) this.drawIcon(entry.data.icon_index, x + 2, y);
      c.fillStyle = '#f4f4f4'; c.fillText(displayText(entry.data?.name ?? ''), x + 30, y + 19);
    });
  }

  drawStatusMenu(menu, state) {
    const c = this.context; c.fillStyle = 'rgba(0,0,0,.30)'; c.fillRect(0, 0, this.width, this.height); this.drawWindow(0, 0, 640, 480);
    const actor = state.actors?.[menu.actorId] ?? {}; c.font = font(20); c.fillStyle = '#f4f4f4';
    c.fillText(displayText(actor.name), 16, 31); c.fillText(displayText(menu.className), 140, 31); c.fillText(displayText(actor.nickname), 300, 31);
    this.drawHorzLine(12, 36, 616);
    this.drawActorPortrait(actor, 20, 60, 96, 96);
    c.fillStyle = '#e5d08d'; c.fillText('Lv', 148, 82); c.fillStyle = '#f4f4f4'; c.textAlign = 'right'; c.fillText(String(actor.level ?? 1), 278, 82); c.textAlign = 'left';
    this.drawGauge(148, 112, 124, 8, actor.hp, menu.parameters?.mhp, '#dc5b60', '#79202d');
    c.fillText(`HP ${Math.floor(actor.hp ?? 0)}/${menu.parameters?.mhp ?? 0}`, 148, 132);
    this.drawGauge(148, 142, 124, 8, actor.mp, menu.parameters?.mmp, '#5c87d9', '#253e7c');
    c.fillText(`MP ${Math.floor(actor.mp ?? 0)}/${menu.parameters?.mmp ?? 0}`, 148, 162);
    c.fillStyle = '#e5d08d'; c.fillText('Kinh Nghiệm hiện tại', 316, 82); c.fillText('Cần thêm Cấp độ', 316, 130);
    c.fillStyle = '#f4f4f4'; c.textAlign = 'right'; c.fillText(String(menu.expCurrent ?? 0), 604, 106); c.fillText(String(menu.expNext ?? 0), 604, 154); c.textAlign = 'left';
    this.drawHorzLine(12, 156, 616);
    const paramKeys = ['atk', 'def', 'mat', 'mdf', 'agi', 'luk'];
    paramKeys.forEach((key, index) => { const y = 190 + index * 24; c.fillStyle = '#e5d08d'; c.fillText(displayText(menu.paramLabels?.[index + 2] ?? key), 44, y); c.fillStyle = '#f4f4f4'; c.textAlign = 'right'; c.fillText(String(menu.parameters?.[key] ?? 0), 258, y); c.textAlign = 'left'; });
    (menu.equipment ?? []).slice(0, 8).forEach((item, index) => { const y = 190 + index * 24; if (item?.icon_index != null) this.drawIcon(item.icon_index, 300, y - 18); c.fillStyle = '#f4f4f4'; c.fillText(displayText(item?.name ?? ''), 328, y); });
    this.drawHorzLine(12, 324, 616);
    c.fillStyle = '#f4f4f4'; wrapText(c, displayText(actor.description), 16, 370, 608, 24);
  }

  drawFileMenu(menu) {
    const c = this.context; c.fillStyle = '#09080a'; c.fillRect(0, 0, this.width, this.height);
    this.drawWindow(0, 0, 640, 48); c.font = font(20); c.fillStyle = '#f4f4f4'; c.fillText(displayText(menu.help), 14, 31);
    const visible = (menu.slots ?? []).slice(menu.topIndex, menu.topIndex + 4);
    visible.forEach((entry, visibleIndex) => {
      const index = menu.topIndex + visibleIndex; const y = 48 + visibleIndex * 108;
      this.drawWindow(0, y, 640, 108);
      c.font = font(20); c.fillStyle = entry.empty ? '#777' : '#f4f4f4';
      const name = `Tệp ${entry.slot}`;
      if (index === menu.selected) this.drawCursor(12, y + 12, Math.max(78, c.measureText(name).width + 12), 24);
      c.fillText(name, 16, y + 34);
      if (!entry.empty) {
        (entry.partyCharacters ?? []).slice(0, 4).forEach((character, partyIndex) => this.drawSaveCharacter(character, 152 + partyIndex * 48, y + 70));
        c.font = font(16); c.fillStyle = '#d7d2cb'; c.fillText(`${displayText(entry.playerName)}  Lv ${entry.level ?? 1}`, 300, y + 35);
        c.fillText(displayText(entry.location), 300, y + 60);
        c.textAlign = 'right'; c.fillText(formatPlaytime(entry.playtimeSeconds), 620, y + 88); c.textAlign = 'left';
        c.fillStyle = '#9e9891'; c.fillText(formatTimestamp(entry.savedAt), 300, y + 86);
      }
    });
  }

  drawBattle(battle) {
    const c = this.context; c.fillStyle = '#100d12'; c.fillRect(0, 0, this.width, this.height);
    if (this.battleGraphics?.battleback1) c.drawImage(this.battleGraphics.battleback1, 0, 0, this.width, this.height);
    if (this.battleGraphics?.battleback2) c.drawImage(this.battleGraphics.battleback2, 0, 0, this.width, this.height);
    if (battle?.mistEnabled && this.battleGraphics?.mist) this.drawBattleMist(battle, this.battleGraphics.mist);
    for (const enemy of battle?.enemies ?? []) {
      if (enemy.hp <= 0) continue; const image = this.battleGraphics?.enemies?.get(enemy.battlerName); if (!image) continue;
      const baseScale = Math.min(1, 260 / Math.max(image.width, image.height)); const breath = 1 + Math.sin(Math.PI * 2 * (battle.frames + enemy.breathOffset) / Math.max(1, enemy.breathPeriod)) * 0.0075 + 0.0075;
      const perspective = Math.max(0.25, Number(enemy.perspectiveScale) || 1); const width = image.width * baseScale * perspective; const height = image.height * baseScale * perspective * breath;
      c.save(); c.translate(enemy.x, enemy.y); c.scale(enemy.mirror ? -1 : 1, 1); c.drawImage(image, -width / 2, -height, width, height); c.restore();
      c.fillStyle = '#17080a'; c.fillRect(enemy.x - 40, Math.min(320, enemy.y - height + 15), 80, 4); c.fillStyle = '#d0a055'; c.fillRect(enemy.x - 40, Math.min(320, enemy.y - height + 15), 80 * enemy.hp / Math.max(1, enemy.parameters.mhp), 4);
      const enemyAp = enemy.chant ? enemy.chant.elapsed / Math.max(1, enemy.chant.total) : enemy.ap / 4000;
      c.globalAlpha = 0.5; c.fillStyle = '#202040'; c.fillRect(enemy.x - 50, enemy.y - 10, 100, 6); c.fillStyle = enemy.chant ? '#be78d0' : '#7e9fe8'; c.fillRect(enemy.x - 50, enemy.y - 10, 100 * Math.min(1, enemyAp), 6); c.globalAlpha = 1;
      c.fillStyle = '#eee'; c.font = font(13); c.textAlign = 'center'; c.fillText(displayText(enemy.name), enemy.x, enemy.y + 28); c.textAlign = 'left';
    }
    const commandRows = Math.max(4, Math.min(8, battle?.commands?.length ?? 4)); const commandHeight = 24 + commandRows * 24; const commandY = 480 - commandHeight;
    this.drawWindow(0, commandY, 128, commandHeight); this.drawWindow(128, 360, 512, 120); c.font = font(17); c.fillStyle = '#f4f4f4';
    const actor = battle?.actors?.[battle?.activeActor ?? 0] ?? battle?.actors?.[0];
    if (actor) {
      const face = this.faceImages.get(actor.faceName); if (face) c.drawImage(face, (actor.faceIndex % 4) * 96, Math.floor(actor.faceIndex / 4) * 96 + 38, 96, 24, 142, 365, 96, 24);
      c.fillText(displayText(actor.name), 142, 387);
      this.drawGauge(330, 375, 120, 8, actor.hp, actor.parameters.mhp, '#dc5b60', '#79202d');
      this.drawGauge(468, 375, 80, 8, actor.mp, actor.parameters.mmp, '#5c87d9', '#253e7c');
      c.fillText(`HP ${actor.hp}/${actor.parameters.mhp}`, 320, 408); c.fillText(`MP ${actor.mp}/${actor.parameters.mmp}`, 466, 408);
      const actorAp = actor.chant ? actor.chant.elapsed / Math.max(1, actor.chant.total) : actor.ap / 4000;
      this.drawGauge(320, 419, 230, 8, actorAp, 1, actor.chant ? '#bd74cb' : '#7e9fe8', actor.chant ? '#6b3573' : '#334c89');
      c.fillText(`AP ${Math.floor(Math.min(1, actorAp) * 100)}%`, 320, 449);
    }
    if (battle?.phase === 'actor-command') (battle.commands ?? []).slice(0, 8).forEach((command, index) => {
      const y = commandY + 12 + index * 24; if (index === battle.selectedCommand) this.drawCursor(12, y, 104, 24);
      c.fillStyle = '#f4f4f4'; c.fillText(displayText(command), 16, y + 19);
    });
    else { c.fillStyle = '#c9c2ba'; c.fillText(displayText(battle?.log?.at(-1) ?? ''), 146, 462); }
  }

  drawBattleMist(battle, image) {
    const c = this.context; c.save(); c.globalCompositeOperation = 'lighter';
    for (let index = 0; index < 10; index += 1) {
      const z = 20 + ((battle.frames + index * 57) % 580); const baseX = 160 + ((index * 131 + battle.troopId * 17) % 320);
      const x = (baseX - 320) * z / 128 + baseX; const y = z / 4 + 160; const scale = z * 0.003 + 0.25;
      c.globalAlpha = Math.max(0, Math.min(1, (z >= 536 ? (600 - z) * 4 : z) / 255));
      const width = image.width * scale; const height = image.height * scale; c.drawImage(image, x - width / 2, y - height / 2, width, height);
    }
    c.restore();
  }

  async showPicture(id, name, parameters = {}) {
    const image = await this.loader.image(`Graphics/Pictures/${name}.png`);
    this.pictures.set(Number(id), { id: Number(id), name, image, origin: 0, x: 0, y: 0, zoomX: 100, zoomY: 100, opacity: 255, blend: 0, ...parameters });
  }

  movePicture(id, parameters = {}) {
    const picture = this.pictures.get(Number(id)); if (!picture) return Promise.resolve();
    const frames = Math.max(0, Number(parameters.duration) || 0);
    const target = { ...parameters }; delete target.duration;
    if (!frames) { Object.assign(picture, target); return Promise.resolve(); }
    const began = performance.now(); const until = began + frames * 1000 / 60;
    picture.transition = { from: Object.fromEntries(Object.keys(target).map((key) => [key, picture[key]])), target, began, until };
    return waitFrames(frames);
  }
  erasePicture(id) { this.pictures.delete(Number(id)); }

  drawPictures() {
    const c = this.context;
    for (const picture of [...this.pictures.values()].sort((a, b) => a.id - b.id)) {
      updatePictureTransition(picture);
      if (picture.angleSpeed) picture.angle = (Number(picture.angle ?? 0) + Number(picture.angleSpeed) / 2) % 360;
      const width = picture.image.width * (picture.zoomX ?? 100) / 100; const height = picture.image.height * (picture.zoomY ?? 100) / 100;
      const x = (picture.x ?? 0) - (picture.origin === 1 ? width / 2 : 0); const y = (picture.y ?? 0) - (picture.origin === 1 ? height / 2 : 0);
      c.save(); c.globalAlpha = (picture.opacity ?? 255) / 255; c.globalCompositeOperation = ['source-over', 'lighter', 'multiply'][picture.blend ?? 0] ?? 'source-over';
      c.translate(x + width / 2, y + height / 2); c.rotate(Number(picture.angle ?? 0) * Math.PI / 180);
      c.drawImage(picture.image, -width / 2, -height / 2, width, height);
      const tone = picture.tone;
      if (tone && (Number(tone.red ?? tone[0]) < 0 || Number(tone.green ?? tone[1]) < 0 || Number(tone.blue ?? tone[2]) < 0)) {
        const darkness = clamp(-(Number(tone.red ?? tone[0] ?? 0) + Number(tone.green ?? tone[1] ?? 0) + Number(tone.blue ?? tone[2] ?? 0)) / 765, 0, 1);
        c.globalCompositeOperation = 'source-atop'; c.fillStyle = `rgba(0,0,0,${darkness})`; c.fillRect(-width / 2, -height / 2, width, height);
      }
      c.restore();
    }
  }

  tintScreen(tone, frames = 1) { this.screenTone = { tone, until: performance.now() + frames * 1000 / 60 }; return waitFrames(frames); }
  flashScreen(color, frames = 1) { this.screenFlash = { color, began: performance.now(), until: performance.now() + frames * 1000 / 60 }; return waitFrames(frames); }
  shakeScreen(power, speed, frames = 1) { this.screenShake = { power, speed, began: performance.now(), until: performance.now() + frames * 1000 / 60 }; return waitFrames(frames); }
  setWeather(type, power, frames = 1) { this.weather = { type, power, began: performance.now() }; return waitFrames(frames); }

  drawScreenEffects() {
    const c = this.context; const now = performance.now();
    if (this.screenTone) {
      const tone = this.screenTone.tone ?? {}; const darkness = clamp(-(Number(tone.red) + Number(tone.green) + Number(tone.blue)) / (255 * 3), 0, 1);
      if (darkness > 0) { c.fillStyle = `rgba(0,0,0,${darkness})`; c.fillRect(0, 0, this.width, this.height); }
    }
    if (this.screenFlash) {
      const color = this.screenFlash.color ?? {}; const duration = Math.max(1, this.screenFlash.until - this.screenFlash.began); const alpha = clamp((this.screenFlash.until - now) / duration, 0, 1) * (Number(color.alpha ?? 255) / 255);
      if (alpha > 0) { c.fillStyle = `rgba(${color.red ?? 255},${color.green ?? 255},${color.blue ?? 255},${alpha})`; c.fillRect(0, 0, this.width, this.height); }
      else this.screenFlash = null;
    }
    if (this.screenShake && now >= this.screenShake.until) this.screenShake = null;
  }

  drawWeather() {
    if (!this.weather || !this.weather.type || this.weather.power <= 0) return;
    const c = this.context; const now = performance.now() / 30; c.save(); c.strokeStyle = 'rgba(190,210,230,.48)'; c.lineWidth = 1;
    const count = Math.min(120, this.weather.power * 12);
    for (let index = 0; index < count; index += 1) { const x = (index * 83 + now * 5) % this.width; const y = (index * 47 + now * 11) % this.height; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 5, y + 12); c.stroke(); }
    c.restore();
  }

  drawWindow(x, y, width, height) {
    const c = this.context;
    if (!this.windowSkin) {
      c.fillStyle = 'rgba(0,0,0,.90)'; c.fillRect(x, y, width, height); c.strokeStyle = '#d2cbbd'; c.strokeRect(x + .5, y + .5, width - 1, height - 1); return;
    }
    c.save(); c.globalAlpha = 0.94;
    c.drawImage(this.windowSkin, 0, 0, 64, 64, x + 4, y + 4, Math.max(1, width - 8), Math.max(1, height - 8));
    const s = this.windowSkin; const edge = 16;
    c.drawImage(s, 64, 0, 16, 16, x, y, edge, edge); c.drawImage(s, 112, 0, 16, 16, x + width - edge, y, edge, edge);
    c.drawImage(s, 64, 48, 16, 16, x, y + height - edge, edge, edge); c.drawImage(s, 112, 48, 16, 16, x + width - edge, y + height - edge, edge, edge);
    c.drawImage(s, 80, 0, 32, 16, x + edge, y, Math.max(1, width - edge * 2), edge);
    c.drawImage(s, 80, 48, 32, 16, x + edge, y + height - edge, Math.max(1, width - edge * 2), edge);
    c.drawImage(s, 64, 16, 16, 32, x, y + edge, edge, Math.max(1, height - edge * 2));
    c.drawImage(s, 112, 16, 16, 32, x + width - edge, y + edge, edge, Math.max(1, height - edge * 2));
    c.restore();
  }

  drawCursor(x, y, width, height) {
    const c = this.context;
    if (this.windowSkin) { c.save(); c.globalAlpha = .72; c.drawImage(this.windowSkin, 64, 64, 32, 32, x, y, width, height); c.restore(); }
    else { c.fillStyle = 'rgba(255,255,255,.16)'; c.fillRect(x, y, width, height); }
  }

  drawIcon(index, x, y) {
    if (!this.iconSet || !Number.isFinite(Number(index))) return;
    const id = Number(index); this.context.drawImage(this.iconSet, (id % 16) * 24, Math.floor(id / 16) * 24, 24, 24, x, y, 24, 24);
  }

  drawGauge(x, y, width, height, value = 0, maximum = 1, color1 = '#fff', color2 = '#888') {
    const ratio = clamp(Number(value) / Math.max(1, Number(maximum)), 0, 1); const gradient = this.context.createLinearGradient(x, y, x + width, y);
    gradient.addColorStop(0, color2); gradient.addColorStop(1, color1);
    this.context.fillStyle = '#241f25'; this.context.fillRect(x, y, width, height); this.context.fillStyle = gradient; this.context.fillRect(x, y, width * ratio, height);
  }

  drawHorzLine(x, y, width) { this.context.fillStyle = 'rgba(255,255,255,.20)'; this.context.fillRect(x, y, width, 2); }

  drawActorPortrait(actor, x, y, width, height) {
    const name = actor?.characterName; const image = name ? this.characterImages.get(name) : null;
    if (!image) return;
    const frame = characterFrame(image, name, actor.characterIndex ?? 0, 2, 1);
    const scale = Math.min(width / frame.width, height / frame.height, 2);
    this.context.drawImage(image, frame.sx, frame.sy, frame.width, frame.height, x + (width - frame.width * scale) / 2, y + height - frame.height * scale, frame.width * scale, frame.height * scale);
  }

  drawSaveCharacter(character, x, y) {
    const image = this.characterImages.get(character.characterName); if (!image) return;
    const frame = characterFrame(image, character.characterName, character.characterIndex ?? 0, 2, 1);
    this.context.drawImage(image, frame.sx, frame.sy, frame.width, frame.height, x - frame.width / 2, y - frame.height, frame.width, frame.height);
  }

  tileAt(x, y, z) {
    if (this.activeFrame) this.activeFrame.tileSamples += 1;
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
      if (this.activeFrame) this.activeFrame.invalidTileLookups += 1;
      return 0;
    }
    if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height) return 0;
    const value = this.map.data.data[vxAceTileDataIndex(this.map.width, this.map.height, x, y, z)];
    if (value == null && this.activeFrame) this.activeFrame.missingTileSamples += 1;
    return value ?? 0;
  }
  drawMapLayer(z, window, upper) {
    for (let mapY = window.startY; mapY <= window.endY; mapY += 1) for (let mapX = window.startX; mapX <= window.endX; mapX += 1) {
      const dx = mapX * this.tileSize - window.pixelX; const dy = mapY * this.tileSize - window.pixelY;
      const tileId = this.tileAt(mapX, mapY, z); const args = [tileId, dx, dy, { x: mapX, y: mapY, z }];
      if (this.isUpper(tileId)) upper.push(args); else this.drawTile(...args);
    }
  }
  isUpper(tileId) { return Boolean((this.tileset?.flags?.data?.[tileId] ?? 0) & 0x10); }
  drawTile(tileId, dx, dy, mapPosition = null) {
    if (tileId <= 0) return;
    if (this.activeFrame) {
      this.activeFrame.tileDraws += 1; this.activeFrame.drawCalls += 1;
      const inspector = this.activeFrame.tileInspector ??= [];
      if (inspector.length < 96 && !inspector.some((entry) => entry.tileId === tileId)) {
        inspector.push({ ...mapPosition, ...resolveVxAceTile(tileId, Math.floor(performance.now() / 400)), flags: tilesetFlagTraits(this.tileset?.flags?.data?.[tileId] ?? 0) });
      }
    }
    if (tileId < TILE_ID.A5) return this.drawNormalTile(tileId, dx, dy);
    if (tileId < TILE_ID.A1) return this.drawNormalTile(tileId, dx, dy, 4, TILE_ID.A5);
    this.drawAutotile(tileId, dx, dy);
  }
  drawNormalTile(tileId, dx, dy, forcedSheet, base = 0) {
    const sheetIndex = forcedSheet ?? (5 + Math.floor(tileId / 256)); const localId = forcedSheet == null ? tileId % 256 : tileId - base; const sheet = this.sheets[sheetIndex]; if (!sheet) return;
    this.context.drawImage(sheet, (localId % 8) * 32, Math.floor(localId / 8) * 32, 32, 32, dx, dy, 32, 32);
  }

  drawAutotile(tileId, dx, dy) {
    const resolved = resolveVxAceTile(tileId, Math.floor(performance.now() / 400));
    const sheet = this.sheets[resolved.sheetIndex]; if (!sheet) return;
    for (const quarter of resolved.quarters) this.context.drawImage(sheet, quarter.sx, quarter.sy, 16, 16, dx + quarter.dx, dy + quarter.dy, 16, 16);
  }

  drawShadows(window) {
    const offset = this.map.width * this.map.height * 3; this.context.fillStyle = 'rgba(0,0,0,.42)';
    for (let my = window.startY; my <= window.endY; my += 1) for (let mx = window.startX; mx <= window.endX; mx += 1) { const bits = (this.map.data.data[mx + my * this.map.width + offset] ?? 0) & 0x0f; const dx = mx * this.tileSize - window.pixelX; const dy = my * this.tileSize - window.pixelY; for (let q = 0; q < 4; q += 1) if (bits & (1 << q)) this.context.fillRect(dx + (q % 2) * 16, dy + Math.floor(q / 2) * 16, 16, 16); }
  }

  drawTableEdges(window) {
    for (let mapY = window.startY; mapY <= window.endY; mapY += 1) for (let mapX = window.startX; mapX <= window.endX; mapX += 1) {
      const upperTileId = this.tileAt(mapX, mapY - 1, 1); const tileId = this.tileAt(mapX, mapY, 1);
      if (!this.isTable(upperTileId) || this.isTable(tileId)) continue;
      const resolved = resolveVxAceTile(upperTileId, Math.floor(performance.now() / 400));
      if (resolved.family !== 'A2') continue;
      const sheet = this.sheets[resolved.sheetIndex]; if (!sheet) continue;
      const dx = mapX * this.tileSize - window.pixelX; const dy = mapY * this.tileSize - window.pixelY;
      for (const quarter of resolved.quarters.slice(2)) this.context.drawImage(sheet, quarter.sx, quarter.sy + 8, 16, 8, dx + quarter.dx, dy, 16, 8);
    }
  }

  drawCharacter(sprite, cameraX, cameraY) {
    const graphic = sprite.graphic; if (!graphic?.character_name) return; const image = this.characterImages.get(graphic.character_name); if (!image) return;
    const frame = characterFrame(image, graphic.character_name, graphic.character_index ?? 0, sprite.direction ?? graphic.direction ?? 2, sprite.pattern ?? graphic.pattern ?? 1);
    const x = (sprite.x - cameraX) * 32 + 16; const y = (sprite.y - cameraY + 1) * 32; const shift = graphic.character_name.startsWith('!') ? 0 : 4;
    const dx = Math.round(x - frame.width / 2); const dy = Math.round(y - frame.height - shift); const opacity = clamp(Number(sprite.opacity ?? 255) / 255, 0, 1);
    this.context.save(); this.context.globalAlpha = opacity; this.context.globalCompositeOperation = Number(sprite.blendType) === 1 ? 'lighter' : Number(sprite.blendType) === 2 ? 'multiply' : 'source-over';
    if (this.isBush(Math.round(sprite.x), Math.round(sprite.y)) && frame.height >= 24) {
      const bushHeight = Math.min(12, frame.height / 2); const topHeight = frame.height - bushHeight;
      this.context.drawImage(image, frame.sx, frame.sy, frame.width, topHeight, dx, dy, frame.width, topHeight);
      this.context.globalAlpha = opacity * 0.5;
      this.context.drawImage(image, frame.sx, frame.sy + topHeight, frame.width, bushHeight, dx, dy + topHeight, frame.width, bushHeight);
    } else this.context.drawImage(image, frame.sx, frame.sy, frame.width, frame.height, dx, dy, frame.width, frame.height);
    this.context.restore();
  }

  isBush(x, y) { for (let z = 2; z >= 0; z -= 1) if ((this.tileset?.flags?.data?.[this.tileAt(x, y, z)] ?? 0) & 0x40) return true; return false; }
  isTable(tileId) { return Boolean((this.tileset?.flags?.data?.[tileId] ?? 0) & 0x80); }

  drawFog() {
    if (!this.fog) return; const { image, x, y, zoom, opacity, blend } = this.fog; const scale = zoom > 10 ? zoom / 100 : 1; const width = image.width * scale; const height = image.height * scale;
    this.context.save(); this.context.globalAlpha = clamp(opacity / 255, 0, 1); this.context.globalCompositeOperation = blend === 1 ? 'lighter' : blend === 2 ? 'multiply' : 'source-over';
    for (let dx = x % width - width; dx < this.width; dx += width) for (let dy = y % height - height; dy < this.height; dy += height) this.context.drawImage(image, dx, dy, width, height); this.context.restore();
  }

  async showAnimation(target, animation) {
    if (!animation) return;
    const sheets = await Promise.all([animation.animation1_name, animation.animation2_name].map(async (name) => {
      if (!name) return null;
      const path = `Graphics/Animations/${name}.png`;
      if (this.animationSheetFailures.has(path)) return null;
      try {
        return await this.loader.image(path);
      } catch (error) {
        this.animationSheetFailures.set(path, error.message);
        this.stats.animationFailures = [...this.animationSheetFailures].map(([failedPath, message]) => ({ path: failedPath, error: message }));
        console.warn(`[BLACK SOULS] Animation sheet unavailable; animation ${animation.id ?? '?'} will render without ${path}.`, error);
        return null;
      }
    }));
    this.animations.push({ target, animation, sheets, began: performance.now() }); await new Promise((resolve) => setTimeout(resolve, Math.max(1, animation.frame_max) * 4 * 1000 / 60));
  }
  async showBalloon(target, balloonId) {
    this.balloonImage ??= await this.loader.image('Graphics/System/Balloon.png');
    this.balloons.push({ target, balloonId, began: performance.now() });
    await new Promise((resolve) => setTimeout(resolve, 8 * 80));
  }
  drawBalloons(cameraX, cameraY) {
    const now = performance.now();
    this.balloons = this.balloons.filter((active) => {
      const frame = Math.floor((now - active.began) / 80); if (frame >= 8) return false;
      const x = (active.target.x - cameraX) * 32 + 16; const y = (active.target.y - cameraY) * 32 - 22;
      this.context.drawImage(this.balloonImage, frame * 32, (active.balloonId - 1) * 32, 32, 32, x - 16, y - 16, 32, 32); return true;
    });
  }
  drawAnimations(cameraX, cameraY) {
    const now = performance.now(); this.animations = this.animations.filter((active) => {
      const frame = active.animation.frames?.[Math.floor((now - active.began) / (4 * 1000 / 60))]; if (!frame) return false; const x = (active.target.x - cameraX) * 32 + 16; const y = (active.target.y - cameraY) * 32 + 16; const data = frame.cell_data?.data ?? [];
      for (let cell = 0; cell < (frame.cell_max ?? 0); cell += 1) { const offset = cell * 8; const pattern = data[offset]; if (pattern == null || pattern < 0) continue; const sheet = active.sheets[pattern < 100 ? 0 : 1]; if (!sheet) continue; const local = pattern % 100; const zoom = (data[offset + 3] ?? 100) / 100;
        this.context.save(); this.context.globalAlpha = (data[offset + 6] ?? 255) / 255; this.context.globalCompositeOperation = (data[offset + 7] ?? 0) === 1 ? 'lighter' : 'source-over'; this.context.translate(x + (data[offset + 1] ?? 0), y + (data[offset + 2] ?? 0)); this.context.rotate((data[offset + 4] ?? 0) * Math.PI / 180); this.context.scale(data[offset + 5] ? -1 : 1, 1); this.context.drawImage(sheet, (local % 5) * 192, Math.floor(local / 5) * 192, 192, 192, -96 * zoom, -96 * zoom, 192 * zoom, 192 * zoom); this.context.restore(); }
      return true;
    });
  }

  drawMessage(message) {
    if (!message) return;
    const data = typeof message === 'string' ? { text: message, position: 2, background: 0 } : message;
    const c = this.context; const y = [0, 180, 360][Number(data.position ?? 2)] ?? 360;
    if (Number(data.background ?? 0) === 1) { const gradient = c.createLinearGradient(0, y, 0, y + 120); gradient.addColorStop(0, 'rgba(0,0,0,0)'); gradient.addColorStop(.25, 'rgba(0,0,0,.76)'); gradient.addColorStop(.75, 'rgba(0,0,0,.76)'); gradient.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gradient; c.fillRect(0, y, 640, 120); }
    else if (Number(data.background ?? 0) === 0) this.drawWindow(0, y, 640, 120);
    const face = this.faceImages.get(data.face);
    if (face) { const index = Number(data.faceIndex) || 0; c.drawImage(face, (index % 4) * 96, Math.floor(index / 4) * 96, 96, 96, 12, y + 12, 96, 96); }
    c.fillStyle = '#f4f4f4'; c.font = font(20);
    wrapText(c, displayText(data.text), face ? 120 : 12, y + 34, face ? 508 : 616, 24);
  }
  drawChoice(choice) {
    if (!choice) return; const c = this.context; c.font = font(20);
    const width = Math.max(96, Math.min(360, Math.max(...choice.options.map((option) => c.measureText(displayText(option)).width), 0) + 48));
    const height = choice.options.length * 24 + 24; const x = this.width - width; const y = Math.max(0, 360 - height);
    this.drawWindow(x, y, width, height);
    choice.options.forEach((option, index) => { const rowY = y + 12 + index * 24; if (index === choice.selected) this.drawCursor(x + 12, rowY, width - 24, 24); c.fillStyle = '#f4f4f4'; c.fillText(displayText(option), x + 16, rowY + 19); });
  }
  promptText(label, maxLength, value = '') {
    return new Promise((resolve) => {
      const form = document.createElement('form');
      form.dataset.bsModal = 'name-input';
      form.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;background:#000c;color:#eee;font:18px Arial,"Noto Sans","Segoe UI",sans-serif';
      form.innerHTML = `<label style="display:grid;gap:10px;width:min(360px,80%)">${label}<input maxlength="${Number(maxLength) || 12}" style="padding:10px;background:#100d0e;color:#fff;border:1px solid #866"><button style="padding:9px;background:#28181c;color:#fff;border:1px solid #744">Confirm</button></label>`;
      const input = form.querySelector('input');
      let settled = false;
      input.value = value;
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (settled) return;
        settled = true;
        const result = input.value.trim();
        form.remove();
        this.stage.focus({ preventScroll: true });
        resolve(result);
      });
      this.stage.append(form);
      input.focus({ preventScroll: true });
    });
  }
  promptRetry(label, detail = '') {
    return new Promise((resolve) => {
      const form = document.createElement('form'); form.dataset.bsModal = 'resource-retry';
      form.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;background:#000d;color:#eee;font:16px Arial,"Noto Sans","Segoe UI",sans-serif;z-index:30';
      form.innerHTML = `<section style="width:min(480px,86%);padding:20px;border:1px solid #744;background:#100c0d"><strong></strong><p style="color:#b9acad;overflow-wrap:anywhere"></p><button value="retry">Retry</button><button value="cancel">Cancel</button></section>`;
      form.querySelector('strong').textContent = label; form.querySelector('p').textContent = detail;
      form.addEventListener('submit', (event) => { event.preventDefault(); const retry = event.submitter?.value === 'retry'; form.remove(); this.stage.focus({ preventScroll: true }); resolve(retry); });
      this.stage.append(form); form.querySelector('button').focus({ preventScroll: true });
    });
  }
  async fadeTo(target, duration = 280) { const start = this.fade; const began = performance.now(); await new Promise((resolve) => { const frame = (now) => { const progress = Math.min(1, (now - began) / duration); this.fade = start + (target - start) * progress; if (progress < 1) requestAnimationFrame(frame); else resolve(); }; requestAnimationFrame(frame); }); }
  diagnostics() {
    return {
      ...this.stats, camera: this.camera, activeAnimations: this.animations.length, activeBalloons: this.balloons.length,
      frameHistory: this.frameHistory.slice(-120),
      fog: Boolean(this.fog), pictures: [...this.pictures.values()].map(({ id, name, x, y, opacity, angle }) => ({ id, name, x, y, opacity, angle })),
      battle: this.battleGraphics ? { battleback1: this.battleGraphics.battleback1Path, battleback2: this.battleGraphics.battleback2Path, enemies: [...this.battleGraphics.enemies.keys()] } : null,
      screenEffects: { tone: this.screenTone, flash: this.screenFlash, shake: this.screenShake, weather: this.weather },
      failedCharacterSheets: [...this.characterSheetFailures].map(([path, error]) => ({ path, error })),
    };
  }
}

export function computeTileWindow({ displayX, displayY, playerX = 0, playerY = 0, mapWidth, mapHeight, width = 640, height = 480, tileSize = 32, margin = 2 }) {
  const viewportTilesX = width / tileSize; const viewportTilesY = height / tileSize;
  const logicalX = clamp(Number.isFinite(displayX) ? displayX : playerX - (viewportTilesX - 1) / 2, 0, Math.max(0, mapWidth - viewportTilesX));
  const logicalY = clamp(Number.isFinite(displayY) ? displayY : playerY - (viewportTilesY - 1) / 2, 0, Math.max(0, mapHeight - viewportTilesY));
  const pixelX = Math.round(logicalX * tileSize); const pixelY = Math.round(logicalY * tileSize);
  const cameraX = pixelX / tileSize; const cameraY = pixelY / tileSize;
  return {
    logicalX, logicalY, pixelX, pixelY, cameraX, cameraY, margin,
    startX: Math.max(0, Math.floor(pixelX / tileSize) - margin),
    endX: Math.min(mapWidth - 1, Math.ceil((pixelX + width) / tileSize) + margin),
    startY: Math.max(0, Math.floor(pixelY / tileSize) - margin),
    endY: Math.min(mapHeight - 1, Math.ceil((pixelY + height) / tileSize) + margin),
  };
}

export function vxAceTileDataIndex(width, height, x, y, z) { return x + y * width + z * width * height; }

export function tilesetFlagTraits(flag = 0) {
  return {
    raw: Number(flag) || 0,
    passage: Number(flag) & 0x0f,
    star: Boolean(Number(flag) & 0x10),
    ladder: Boolean(Number(flag) & 0x20),
    bush: Boolean(Number(flag) & 0x40),
    counter: Boolean(Number(flag) & 0x80),
    damageFloor: Boolean(Number(flag) & 0x100),
    terrainTag: (Number(flag) >> 12) & 0x0f,
  };
}

export function resolveVxAceTile(tileId, animationTick = 0) {
  tileId = Number(tileId) || 0;
  if (tileId <= 0) return { tileId, family: 'EMPTY', sheetIndex: null, source: null, quarters: [] };
  if (tileId < TILE_ID.A5) {
    const sheetIndex = 5 + Math.floor(tileId / 256); const localId = tileId % 256;
    return { tileId, family: ['B', 'C', 'D', 'E'][Math.floor(tileId / 256)] ?? 'UNUSED', sheetIndex, localId, source: { x: (localId % 8) * 32, y: Math.floor(localId / 8) * 32, width: 32, height: 32 }, quarters: [] };
  }
  if (tileId < TILE_ID.A1) {
    const localId = tileId - TILE_ID.A5;
    return { tileId, family: 'A5', sheetIndex: 4, localId, source: { x: (localId % 8) * 32, y: Math.floor(localId / 8) * 32, width: 32, height: 32 }, quarters: [] };
  }
  const kind = Math.floor((tileId - TILE_ID.A1) / 48); const shape = (tileId - TILE_ID.A1) % 48; const tx = kind % 8; const ty = Math.floor(kind / 8);
  let family = 'A1'; let sheetIndex = 0; let bx = 0; let by = 0; let table = FLOOR_AUTOTILE_TABLE; let tableName = 'floor';
  const surfaceFrame = [0, 1, 2, 1][Math.abs(Math.floor(animationTick)) % 4]; const waterfallFrame = Math.abs(Math.floor(animationTick)) % 3;
  if (tileId >= TILE_ID.A4) { family = 'A4'; sheetIndex = 3; bx = tx * 2; by = Math.floor((ty - 10) * 2.5 + (ty % 2 === 1 ? 0.5 : 0)); if (ty % 2 === 1) { table = WALL_AUTOTILE_TABLE; tableName = 'wall'; } }
  else if (tileId >= TILE_ID.A3) { family = 'A3'; sheetIndex = 2; bx = tx * 2; by = (ty - 6) * 2; table = WALL_AUTOTILE_TABLE; tableName = 'wall'; }
  else if (tileId >= TILE_ID.A2) { family = 'A2'; sheetIndex = 1; bx = tx * 2; by = (ty - 2) * 3; }
  else if (kind === 0) { bx = surfaceFrame * 2; by = 0; }
  else if (kind === 1) { bx = surfaceFrame * 2; by = 3; }
  else if (kind === 2) { bx = 6; by = 0; }
  else if (kind === 3) { bx = 6; by = 3; }
  else {
    bx = Math.floor(tx / 4) * 8; by = ty * 6 + (Math.floor(tx / 2) % 2) * 3;
    if (kind % 2 === 0) bx += surfaceFrame * 2;
    else { bx += 6; by += waterfallFrame; table = WATERFALL_AUTOTILE_TABLE; tableName = 'waterfall'; }
  }
  const tableShape = table[shape];
  if (!tableShape) return { tileId, family, sheetIndex, kind, shape, table: tableName, base: { x: bx, y: by }, source: null, quarters: [], invalidShape: true };
  const quarters = tableShape.map(([qsx, qsy], index) => ({ sx: (bx + qsx) * 16, sy: (by + qsy) * 16, dx: (index % 2) * 16, dy: Math.floor(index / 2) * 16 }));
  return { tileId, family, sheetIndex, kind, shape, table: tableName, animation: { tick: animationTick, surfaceFrame, waterfallFrame }, base: { x: bx, y: by }, source: null, quarters };
}

export function characterFrame(image, name, index, direction, pattern) {
  const big = name.replace(/^!/, '').startsWith('$'); const width = image.width / (big ? 3 : 12); const height = image.height / (big ? 4 : 8); const baseX = big ? 0 : (index % 4) * 3; const baseY = big ? 0 : Math.floor(index / 4) * 4;
  const cardinal = [2, 4, 6, 8].includes(direction) ? direction : direction < 5 ? 2 : 8; const row = { 2: 0, 4: 1, 6: 2, 8: 3 }[cardinal]; const renderedPattern = Number(pattern) < 3 ? clamp(Number(pattern) || 0, 0, 2) : 1; return { sx: (baseX + renderedPattern) * width, sy: (baseY + row) * height, width, height };
}

const FLOOR_AUTOTILE_TABLE = [
  [[2,4],[1,4],[2,3],[1,3]],[[2,0],[1,4],[2,3],[1,3]],[[2,4],[3,0],[2,3],[1,3]],[[2,0],[3,0],[2,3],[1,3]],[[2,4],[1,4],[2,3],[3,1]],[[2,0],[1,4],[2,3],[3,1]],[[2,4],[3,0],[2,3],[3,1]],[[2,0],[3,0],[2,3],[3,1]],
  [[2,4],[1,4],[2,1],[1,3]],[[2,0],[1,4],[2,1],[1,3]],[[2,4],[3,0],[2,1],[1,3]],[[2,0],[3,0],[2,1],[1,3]],[[2,4],[1,4],[2,1],[3,1]],[[2,0],[1,4],[2,1],[3,1]],[[2,4],[3,0],[2,1],[3,1]],[[2,0],[3,0],[2,1],[3,1]],
  [[0,4],[1,4],[0,3],[1,3]],[[0,4],[3,0],[0,3],[1,3]],[[0,4],[1,4],[0,3],[3,1]],[[0,4],[3,0],[0,3],[3,1]],[[2,2],[1,2],[2,3],[1,3]],[[2,2],[1,2],[2,3],[3,1]],[[2,2],[1,2],[2,1],[1,3]],[[2,2],[1,2],[2,1],[3,1]],
  [[2,4],[3,4],[2,3],[3,3]],[[2,4],[3,4],[2,1],[3,3]],[[2,0],[3,4],[2,3],[3,3]],[[2,0],[3,4],[2,1],[3,3]],[[2,4],[1,4],[2,5],[1,5]],[[2,0],[1,4],[2,5],[1,5]],[[2,4],[3,0],[2,5],[1,5]],[[2,0],[3,0],[2,5],[1,5]],
  [[0,4],[3,4],[0,3],[3,3]],[[2,2],[1,2],[2,5],[1,5]],[[0,2],[1,2],[0,3],[1,3]],[[0,2],[1,2],[0,3],[3,1]],[[2,2],[3,2],[2,3],[3,3]],[[2,2],[3,2],[2,1],[3,3]],[[2,4],[3,4],[2,5],[3,5]],[[2,0],[3,4],[2,5],[3,5]],
  [[0,4],[1,4],[0,5],[1,5]],[[0,4],[3,0],[0,5],[1,5]],[[0,2],[3,2],[0,3],[3,3]],[[0,2],[1,2],[0,5],[1,5]],[[0,4],[3,4],[0,5],[3,5]],[[2,2],[3,2],[2,5],[3,5]],[[0,2],[3,2],[0,5],[3,5]],[[0,0],[1,0],[0,1],[1,1]],
];
const WALL_AUTOTILE_TABLE = [
  [[2,2],[1,2],[2,1],[1,1]],[[0,2],[1,2],[0,1],[1,1]],[[2,0],[1,0],[2,1],[1,1]],[[0,0],[1,0],[0,1],[1,1]],[[2,2],[3,2],[2,1],[3,1]],[[0,2],[3,2],[0,1],[3,1]],[[2,0],[3,0],[2,1],[3,1]],[[0,0],[3,0],[0,1],[3,1]],
  [[2,2],[1,2],[2,3],[1,3]],[[0,2],[1,2],[0,3],[1,3]],[[2,0],[1,0],[2,3],[1,3]],[[0,0],[1,0],[0,3],[1,3]],[[2,2],[3,2],[2,3],[3,3]],[[0,2],[3,2],[0,3],[3,3]],[[2,0],[3,0],[2,3],[3,3]],[[0,0],[3,0],[0,3],[3,3]],
];
const WATERFALL_AUTOTILE_TABLE = [[[2,0],[1,0],[2,1],[1,1]],[[0,0],[1,0],[0,1],[1,1]],[[2,0],[3,0],[2,1],[3,1]],[[0,0],[3,0],[0,1],[3,1]]];
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function displayText(value) { return String(value ?? '').normalize('NFC'); }
function font(size = 20) { return `${size}px Arial, "Noto Sans", "Segoe UI", sans-serif`; }
function wrapText(context, text, x, y, width, lineHeight) { for (const paragraph of displayText(text).split('\n')) { let line = ''; for (const word of paragraph.split(/\s+/)) { const test = line ? `${line} ${word}` : word; if (context.measureText(test).width > width && line) { context.fillText(line, x, y); y += lineHeight; line = word; } else line = test; } context.fillText(line, x, y); y += lineHeight; } }
async function waitForFonts() { try { await globalThis.document?.fonts?.ready; await globalThis.document?.fonts?.load?.('20px Arial', 'Cậu cần gì? Đường Đừng Thánh Người'); } catch {} }
function formatPlaytime(seconds = 0) { const total = Math.max(0, Math.floor(Number(seconds) || 0)); return `${String(Math.floor(total / 3600)).padStart(2, '0')}:${String(Math.floor(total / 60) % 60).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`; }
function formatTimestamp(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(); }
function waitFrames(frames) { return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(frames) || 0) * 1000 / 60)); }
function updatePictureTransition(picture) {
  const transition = picture.transition; if (!transition) return;
  const now = performance.now(); const progress = clamp((now - transition.began) / Math.max(1, transition.until - transition.began), 0, 1);
  for (const [key, target] of Object.entries(transition.target)) {
    const start = transition.from[key]; picture[key] = Number.isFinite(Number(start)) && Number.isFinite(Number(target)) ? Number(start) + (Number(target) - Number(start)) * progress : (progress >= 1 ? target : start);
  }
  if (progress >= 1) delete picture.transition;
}
