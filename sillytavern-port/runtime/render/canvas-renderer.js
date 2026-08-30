const TILE_ID = { A5: 1536, A1: 2048, A2: 2816, A3: 4352, A4: 5888 };

export class CanvasRenderer {
  constructor(stage, loader, engineConfig) {
    this.stage = stage; this.loader = loader;
    this.width = engineConfig.logicalWidth; this.height = engineConfig.logicalHeight; this.tileSize = engineConfig.tileSize;
    this.canvas = document.createElement('canvas'); this.canvas.width = this.width; this.canvas.height = this.height;
    this.context = this.canvas.getContext('2d'); this.context.imageSmoothingEnabled = false; stage.append(this.canvas);
    this.fade = 0; this.characterImages = new Map(); this.animations = []; this.balloons = [];
    this.stats = { frames: 0, lastFrameMs: 0, maxFrameMs: 0, mapId: null, tileset: null, loadedSheets: [], characters: [] };
  }

  async setMap(map, tileset, { playerGraphic, events = [], mapId } = {}) {
    this.map = map; this.tileset = tileset; this.stats.mapId = mapId; this.stats.tileset = tileset?.name ?? null;
    this.sheets = await Promise.all((tileset?.tileset_names ?? []).map((name) => name ? this.loader.image(`Graphics/Tilesets/${name}.png`) : null));
    this.stats.loadedSheets = (tileset?.tileset_names ?? []).filter(Boolean); this.playerGraphic = playerGraphic;
    const graphics = [playerGraphic, ...events.map((event) => event.page?.graphic)].filter((graphic) => graphic?.character_name);
    await Promise.all([...new Set(graphics.map((graphic) => graphic.character_name))].map(async (name) => this.characterImages.set(name, await this.loader.image(`Graphics/Characters/${name}.png`))));
    this.stats.characters = [...this.characterImages.keys()]; this.fog = await this.loadFog(map.note);
  }

  async loadFog(note = '') {
    const match = /==マップフォグ([^\[]+)\[([^\]]+)\]==/.exec(note); if (!match) return null;
    const [x = 0, y = 0, zoom = 100, opacity = 255, blend = 0] = match[2].split(',').map(Number);
    const image = await this.loader.image(`Graphics/Parallaxes/${match[1]}.png`, { optional: true });
    return image ? { image, x, y, zoom, opacity, blend } : null;
  }

  render(state, events = []) {
    const began = performance.now(); const context = this.context; context.fillStyle = '#080709'; context.fillRect(0, 0, this.width, this.height); if (!this.map) return;
    const visibleX = Math.ceil(this.width / this.tileSize) + 1; const visibleY = Math.ceil(this.height / this.tileSize) + 1;
    const cameraX = clamp(state.x - Math.floor(visibleX / 2), 0, Math.max(0, this.map.width - visibleX));
    const cameraY = clamp(state.y - Math.floor(visibleY / 2), 0, Math.max(0, this.map.height - visibleY)); this.camera = { x: cameraX, y: cameraY };
    const upper = [];
    for (let z = 0; z < 3; z += 1) for (let y = 0; y < visibleY; y += 1) for (let x = 0; x < visibleX; x += 1) {
      const mapX = x + cameraX; const mapY = y + cameraY; if (mapX >= this.map.width || mapY >= this.map.height) continue;
      const tileId = this.tileAt(mapX, mapY, z); const args = [tileId, x * this.tileSize, y * this.tileSize];
      if (this.isUpper(tileId)) upper.push(args); else this.drawTile(...args);
    }
    this.drawShadows(cameraX, cameraY, visibleX, visibleY);
    const sprites = events.map((event) => ({ ...event, type: 'event' }));
    if (!state.transparent) sprites.push({ x: state.x, y: state.y, direction: state.direction, pattern: state.pattern ?? 1, graphic: this.playerGraphic, type: 'player' });
    sprites.sort((a, b) => a.y - b.y || (a.type === 'event' ? -1 : 1)); for (const sprite of sprites) this.drawCharacter(sprite, cameraX, cameraY);
    for (const args of upper) this.drawTile(...args); this.drawFog(); this.drawAnimations(cameraX, cameraY); this.drawBalloons(cameraX, cameraY); this.drawMessage(state.message); this.drawChoice(state.choice);
    if (this.fade > 0) { context.fillStyle = `rgba(0,0,0,${this.fade})`; context.fillRect(0, 0, this.width, this.height); }
    const elapsed = performance.now() - began; this.stats.frames += 1; this.stats.lastFrameMs = Math.round(elapsed * 100) / 100; this.stats.maxFrameMs = Math.max(this.stats.maxFrameMs, this.stats.lastFrameMs);
  }

  tileAt(x, y, z) { return this.map.data.data[x + y * this.map.width + z * this.map.width * this.map.height] ?? 0; }
  isUpper(tileId) { return Boolean((this.tileset?.flags?.data?.[tileId] ?? 0) & 0x10); }
  drawTile(tileId, dx, dy) { if (tileId <= 0) return; if (tileId < TILE_ID.A5) return this.drawNormalTile(tileId, dx, dy); if (tileId < TILE_ID.A1) return this.drawNormalTile(tileId, dx, dy, 4, TILE_ID.A5); this.drawAutotile(tileId, dx, dy); }
  drawNormalTile(tileId, dx, dy, forcedSheet, base = 0) {
    const sheetIndex = forcedSheet ?? (5 + Math.floor(tileId / 256)); const localId = forcedSheet == null ? tileId % 256 : tileId - base; const sheet = this.sheets[sheetIndex]; if (!sheet) return;
    this.context.drawImage(sheet, (localId % 8) * 32, Math.floor(localId / 8) * 32, 32, 32, dx, dy, 32, 32);
  }

  drawAutotile(tileId, dx, dy) {
    const kind = Math.floor((tileId - TILE_ID.A1) / 48); const shape = (tileId - TILE_ID.A1) % 48; const tx = kind % 8; const ty = Math.floor(kind / 8);
    let sheetIndex = 0; let bx = 0; let by = 0; let table = FLOOR_AUTOTILE_TABLE; const animationFrame = Math.floor(performance.now() / 400) % 4;
    if (tileId >= TILE_ID.A4) { sheetIndex = 3; bx = tx * 2; by = Math.floor((ty - 10) * 2.5 + (ty % 2 === 1 ? 0.5 : 0)); if (ty % 2 === 1) table = WALL_AUTOTILE_TABLE; }
    else if (tileId >= TILE_ID.A3) { sheetIndex = 2; bx = tx * 2; by = (ty - 6) * 2; table = WALL_AUTOTILE_TABLE; }
    else if (tileId >= TILE_ID.A2) { sheetIndex = 1; bx = tx * 2; by = (ty - 2) * 3; }
    else {
      const waterFrame = [0, 1, 2, 1][animationFrame];
      if (kind === 0) { bx = waterFrame * 2; by = 0; } else if (kind === 1) { bx = waterFrame * 2; by = 3; } else if (kind === 2) { bx = 6; by = 0; } else if (kind === 3) { bx = 6; by = 3; }
      else { bx = Math.floor(tx / 4) * 8; by = ty * 6 + (Math.floor(tx / 2) % 2) * 3; if (kind % 2 === 0) bx += waterFrame * 2; else { bx += 6; by += animationFrame % 3; table = WATERFALL_AUTOTILE_TABLE; } }
    }
    const sheet = this.sheets[sheetIndex]; if (!sheet) return; const quarters = table[shape % table.length];
    for (let index = 0; index < 4; index += 1) { const [qsx, qsy] = quarters[index]; this.context.drawImage(sheet, (bx + qsx) * 16, (by + qsy) * 16, 16, 16, dx + (index % 2) * 16, dy + Math.floor(index / 2) * 16, 16, 16); }
  }

  drawShadows(cameraX, cameraY, width, height) {
    const offset = this.map.width * this.map.height * 3; this.context.fillStyle = 'rgba(0,0,0,.42)';
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) { const mx = x + cameraX; const my = y + cameraY; const bits = (this.map.data.data[mx + my * this.map.width + offset] ?? 0) & 0x0f; for (let q = 0; q < 4; q += 1) if (bits & (1 << q)) this.context.fillRect(x * 32 + (q % 2) * 16, y * 32 + Math.floor(q / 2) * 16, 16, 16); }
  }

  drawCharacter(sprite, cameraX, cameraY) {
    const graphic = sprite.graphic; if (!graphic?.character_name) return; const image = this.characterImages.get(graphic.character_name); if (!image) return;
    const frame = characterFrame(image, graphic.character_name, graphic.character_index ?? 0, sprite.direction ?? graphic.direction ?? 2, sprite.pattern ?? graphic.pattern ?? 1);
    const x = (sprite.x - cameraX) * 32 + 16; const y = (sprite.y - cameraY + 1) * 32; const shift = graphic.character_name.startsWith('!') ? 0 : 4;
    this.context.drawImage(image, frame.sx, frame.sy, frame.width, frame.height, Math.round(x - frame.width / 2), Math.round(y - frame.height - shift), frame.width, frame.height);
  }

  drawFog() {
    if (!this.fog) return; const { image, x, y, zoom, opacity, blend } = this.fog; const scale = zoom > 10 ? zoom / 100 : 1; const width = image.width * scale; const height = image.height * scale;
    this.context.save(); this.context.globalAlpha = clamp(opacity / 255, 0, 1); this.context.globalCompositeOperation = blend === 1 ? 'lighter' : blend === 2 ? 'multiply' : 'source-over';
    for (let dx = x % width - width; dx < this.width; dx += width) for (let dy = y % height - height; dy < this.height; dy += height) this.context.drawImage(image, dx, dy, width, height); this.context.restore();
  }

  async showAnimation(target, animation) {
    if (!animation) return; const sheets = await Promise.all([animation.animation1_name, animation.animation2_name].map((name) => name ? this.loader.image(`Graphics/Animations/${name}.png`) : null));
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

  drawMessage(message) { if (!message) return; const c = this.context; c.fillStyle = 'rgba(8,6,8,.92)'; c.fillRect(12, this.height - 132, this.width - 24, 120); c.strokeStyle = '#c5bda9'; c.strokeRect(12.5, this.height - 131.5, this.width - 25, 119); c.fillStyle = '#f1ede4'; c.font = '20px Georgia, serif'; wrapText(c, message, 30, this.height - 96, this.width - 60, 28); c.font = '13px ui-monospace, monospace'; c.fillStyle = '#aaa'; c.fillText('Enter / Space', this.width - 125, this.height - 24); }
  drawChoice(choice) { if (!choice) return; const c = this.context; const width = 280; const height = choice.options.length * 30 + 24; const x = this.width - width - 22; const y = this.height - 144 - height; c.fillStyle = 'rgba(8,6,8,.95)'; c.fillRect(x, y, width, height); c.strokeStyle = '#c5bda9'; c.strokeRect(x + .5, y + .5, width - 1, height - 1); c.font = '18px Georgia, serif'; choice.options.forEach((option, index) => { c.fillStyle = index === choice.selected ? '#fff' : '#aaa'; c.fillText(`${index === choice.selected ? '›' : ' '} ${option}`, x + 18, y + 30 + index * 30); }); }
  promptText(label, maxLength, value = '') { return new Promise((resolve) => { const form = document.createElement('form'); form.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;background:#000c;color:#eee;font:18px Georgia,serif'; form.innerHTML = `<label style="display:grid;gap:10px;width:min(360px,80%)">${label}<input maxlength="${Number(maxLength) || 12}" style="padding:10px;background:#100d0e;color:#fff;border:1px solid #866"><button style="padding:9px;background:#28181c;color:#fff;border:1px solid #744">Confirm</button></label>`; const input = form.querySelector('input'); input.value = value; form.addEventListener('submit', (event) => { event.preventDefault(); const result = input.value.trim(); form.remove(); this.stage.focus(); resolve(result); }); this.stage.append(form); input.focus(); }); }
  async fadeTo(target, duration = 280) { const start = this.fade; const began = performance.now(); await new Promise((resolve) => { const frame = (now) => { const progress = Math.min(1, (now - began) / duration); this.fade = start + (target - start) * progress; if (progress < 1) requestAnimationFrame(frame); else resolve(); }; requestAnimationFrame(frame); }); }
  diagnostics() { return { ...this.stats, camera: this.camera, activeAnimations: this.animations.length, activeBalloons: this.balloons.length, fog: Boolean(this.fog) }; }
}

export function characterFrame(image, name, index, direction, pattern) {
  const big = name.replace(/^!/, '').startsWith('$'); const width = image.width / (big ? 3 : 12); const height = image.height / (big ? 4 : 8); const baseX = big ? 0 : (index % 4) * 3; const baseY = big ? 0 : Math.floor(index / 4) * 4;
  const cardinal = [2, 4, 6, 8].includes(direction) ? direction : direction < 5 ? 2 : 8; const row = { 2: 0, 4: 1, 6: 2, 8: 3 }[cardinal]; return { sx: (baseX + clamp(pattern, 0, 2)) * width, sy: (baseY + row) * height, width, height };
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
function wrapText(context, text, x, y, width, lineHeight) { for (const paragraph of String(text).split('\n')) { let line = ''; for (const word of paragraph.split(/\s+/)) { const test = line ? `${line} ${word}` : word; if (context.measureText(test).width > width && line) { context.fillText(line, x, y); y += lineHeight; line = word; } else line = test; } context.fillText(line, x, y); y += lineHeight; } }
