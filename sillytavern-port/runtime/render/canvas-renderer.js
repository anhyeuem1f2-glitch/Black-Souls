export class CanvasRenderer {
  constructor(stage, loader, engineConfig) {
    this.stage = stage;
    this.loader = loader;
    this.width = engineConfig.logicalWidth;
    this.height = engineConfig.logicalHeight;
    this.tileSize = engineConfig.tileSize;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.context = this.canvas.getContext('2d');
    this.context.imageSmoothingEnabled = false;
    stage.append(this.canvas);
    this.fade = 0;
  }

  async setMap(map, tileset) {
    this.map = map;
    this.tileset = tileset;
    this.sheets = await Promise.all((tileset?.tileset_names ?? []).map((name) => name ? this.loader.image(`Graphics/Tilesets/${name}.png`) : null));
  }

  render(state) {
    const context = this.context;
    context.fillStyle = '#080709';
    context.fillRect(0, 0, this.width, this.height);
    if (!this.map) return;
    const visibleX = Math.ceil(this.width / this.tileSize);
    const visibleY = Math.ceil(this.height / this.tileSize);
    const cameraX = clamp(state.x - Math.floor(visibleX / 2), 0, Math.max(0, this.map.width - visibleX));
    const cameraY = clamp(state.y - Math.floor(visibleY / 2), 0, Math.max(0, this.map.height - visibleY));
    for (let z = 0; z < 3; z += 1) {
      for (let y = 0; y < visibleY; y += 1) {
        for (let x = 0; x < visibleX; x += 1) {
          const mapX = x + cameraX;
          const mapY = y + cameraY;
          if (mapX >= this.map.width || mapY >= this.map.height) continue;
          const tileId = this.map.data.data[mapX + mapY * this.map.width + z * this.map.width * this.map.height] ?? 0;
          this.drawTile(tileId, x * this.tileSize, y * this.tileSize);
        }
      }
    }
    if (!state.transparent) this.drawPlayer((state.x - cameraX) * this.tileSize, (state.y - cameraY) * this.tileSize);
    this.drawMessage(state.message);
    this.drawChoice(state.choice);
    if (this.fade > 0) {
      context.fillStyle = `rgba(0,0,0,${this.fade})`;
      context.fillRect(0, 0, this.width, this.height);
    }
  }

  drawTile(tileId, dx, dy) {
    if (tileId <= 0) return;
    let sheetIndex = -1;
    let localId = 0;
    if (tileId < 1024) {
      sheetIndex = 5 + Math.floor(tileId / 256);
      localId = tileId % 256;
    } else if (tileId >= 1536 && tileId < 2048) {
      sheetIndex = 4;
      localId = tileId - 1536;
    }
    const sheet = this.sheets[sheetIndex];
    if (sheet) {
      const sx = (localId % 8) * this.tileSize;
      const sy = Math.floor(localId / 8) * this.tileSize;
      this.context.drawImage(sheet, sx, sy, this.tileSize, this.tileSize, dx, dy, this.tileSize, this.tileSize);
      return;
    }
    if (tileId >= 2048) {
      const kind = Math.floor((tileId - 2048) / 48);
      const sheetSlot = kind < 16 ? 0 : kind < 48 ? 1 : kind < 80 ? 2 : 3;
      const autotileSheet = this.sheets[sheetSlot];
      if (autotileSheet) {
        const localKind = kind - [0, 16, 48, 80][sheetSlot];
        const sx = (localKind % 8) * 64;
        const sy = Math.floor(localKind / 8) * 96;
        this.context.drawImage(autotileSheet, sx, sy, this.tileSize, this.tileSize, dx, dy, this.tileSize, this.tileSize);
        return;
      }
    }
    this.context.fillStyle = `hsl(${(tileId * 37) % 360} 18% 16%)`;
    this.context.fillRect(dx, dy, this.tileSize, this.tileSize);
  }

  drawPlayer(x, y) {
    const context = this.context;
    context.fillStyle = '#f1e8d0';
    context.beginPath();
    context.arc(x + 16, y + 14, 7, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#7e242d';
    context.fillRect(x + 9, y + 20, 14, 10);
  }

  drawMessage(message) {
    if (!message) return;
    const context = this.context;
    context.fillStyle = 'rgba(8,6,8,.92)';
    context.fillRect(12, this.height - 132, this.width - 24, 120);
    context.strokeStyle = '#c5bda9';
    context.strokeRect(12.5, this.height - 131.5, this.width - 25, 119);
    context.fillStyle = '#f1ede4';
    context.font = '20px Georgia, serif';
    wrapText(context, message, 30, this.height - 96, this.width - 60, 28);
    context.font = '13px ui-monospace, monospace';
    context.fillStyle = '#aaa';
    context.fillText('Enter / Space', this.width - 125, this.height - 24);
  }

  drawChoice(choice) {
    if (!choice) return;
    const context = this.context;
    const width = 280;
    const height = choice.options.length * 30 + 24;
    const x = this.width - width - 22;
    const y = this.height - 144 - height;
    context.fillStyle = 'rgba(8,6,8,.95)';
    context.fillRect(x, y, width, height);
    context.strokeStyle = '#c5bda9';
    context.strokeRect(x + .5, y + .5, width - 1, height - 1);
    context.font = '18px Georgia, serif';
    choice.options.forEach((option, index) => {
      context.fillStyle = index === choice.selected ? '#fff' : '#aaa';
      context.fillText(`${index === choice.selected ? '›' : ' '} ${option}`, x + 18, y + 30 + index * 30);
    });
  }

  promptText(label, maxLength, value = '') {
    return new Promise((resolve) => {
      const form = document.createElement('form');
      form.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;background:#000c;color:#eee;font:18px Georgia,serif';
      form.innerHTML = `<label style="display:grid;gap:10px;width:min(360px,80%)">${label}<input maxlength="${Number(maxLength) || 12}" style="padding:10px;background:#100d0e;color:#fff;border:1px solid #866"><button style="padding:9px;background:#28181c;color:#fff;border:1px solid #744">Confirm</button></label>`;
      const input = form.querySelector('input');
      input.value = value;
      form.addEventListener('submit', (event) => { event.preventDefault(); const result = input.value.trim(); form.remove(); this.stage.focus(); resolve(result); });
      this.stage.append(form);
      input.focus();
    });
  }

  async fadeTo(target, duration = 280) {
    const start = this.fade;
    const began = performance.now();
    await new Promise((resolve) => {
      const frame = (now) => {
        const progress = Math.min(1, (now - began) / duration);
        this.fade = start + (target - start) * progress;
        if (progress < 1) requestAnimationFrame(frame); else resolve();
      };
      requestAnimationFrame(frame);
    });
  }
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function wrapText(context, text, x, y, width, lineHeight) {
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (context.measureText(test).width > width && line) {
        context.fillText(line, x, y);
        y += lineHeight;
        line = word;
      } else line = test;
    }
    context.fillText(line, x, y);
    y += lineHeight;
  }
}
