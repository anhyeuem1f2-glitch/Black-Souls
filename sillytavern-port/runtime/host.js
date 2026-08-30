import { GameEngine } from './core/game-engine.js';
import { DataLoader } from './data/loader.js';
import { CanvasRenderer } from './render/canvas-renderer.js';
import { SaveStore } from './save/indexeddb.js';

export class BlackSoulsHost {
  constructor({ manifest, manifestUrl, target = document.body, dataBaseUrl, assetBaseUrl, onLoaderState = () => {} }) {
    this.manifest = manifest;
    this.manifestUrl = manifestUrl;
    this.target = target;
    this.dataBaseUrl = new URL(dataBaseUrl ?? manifest.data.base, manifestUrl);
    this.assetBaseUrl = new URL(assetBaseUrl ?? manifest.assets.base, manifestUrl);
    this.onLoaderState = onLoaderState;
  }

  async mount() {
    this.root = document.createElement('main');
    this.root.className = 'black-souls-host';
    this.root.innerHTML = `
      <style>${styles}</style>
      <section class="bs-shell">
        <header><span>BLACK SOULS</span><span class="bs-runtime">runtime ${escapeHtml(this.manifest.version)}</span></header>
        <div class="bs-stage" tabindex="0" aria-label="BLACK SOULS game viewport"></div>
        <div class="bs-progress"><div></div><span>Loading game data...</span></div>
        <nav>
          <button data-action="start">New game</button>
          <button data-action="continue">Continue</button>
          <button data-action="save">Save</button>
          <button data-action="fullscreen">Fullscreen</button>
        </nav>
        <output class="bs-status" aria-live="polite"></output>
      </section>`;
    this.target.replaceChildren(this.root);
    this.stage = this.root.querySelector('.bs-stage');
    this.status = this.root.querySelector('.bs-status');
    this.progress = this.root.querySelector('.bs-progress');

    this.notifyLoader('Loading game data...', this.dataBaseUrl.href);
    const loader = new DataLoader(this.dataBaseUrl, this.assetBaseUrl, (message, fraction) => {
      this.setProgress(message, fraction);
      if (fraction >= 0.45) {
        this.setProgress('Starting BLACK SOULS...', 0.72);
        this.notifyLoader('Starting BLACK SOULS...', message);
      }
    });
    const renderer = new CanvasRenderer(this.stage, loader, this.manifest.engine);
    const saves = new SaveStore();
    this.engine = new GameEngine({ loader, renderer, saves, status: (message) => this.setStatus(message) });
    this.bindControls();
    await this.engine.initialize();
    this.setProgress('Ready', 1);
    this.notifyLoader('Ready', `runtime ${this.manifest.version}`);
    this.readyTimer = setTimeout(() => { if (this.progress) this.progress.hidden = true; }, 1000);
    this.stage.focus();
    return this;
  }

  bindControls() {
    this.onClick = async (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (!action) return;
      try {
        if (action === 'start') await this.engine.newGame();
        if (action === 'continue') await this.engine.load(1);
        if (action === 'save') await this.engine.save(1);
        if (action === 'fullscreen') await this.root.requestFullscreen?.();
        this.stage.focus();
      } catch (error) {
        this.setStatus(error.message, true);
      }
    };
    this.root.addEventListener('click', this.onClick);
  }

  setProgress(message, fraction = 0) {
    this.progress.querySelector('span').textContent = message;
    this.progress.querySelector('div').style.setProperty('--progress', `${Math.max(0, Math.min(1, fraction)) * 100}%`);
  }

  setStatus(message, error = false) {
    this.status.textContent = message ?? '';
    this.status.classList.toggle('error', error);
  }

  notifyLoader(state, detail = '') {
    try { this.onLoaderState(state, detail); } catch (error) { console.warn('[BLACK SOULS] Loader state callback failed', error); }
  }

  async save(slot) { return this.engine.save(slot); }
  async loadSave(slot) { return this.engine.load(slot); }
  async reset() { return this.engine.newGame(); }
  getState() { return this.engine.snapshot(); }

  async unmount() {
    clearTimeout(this.readyTimer);
    this.root?.removeEventListener('click', this.onClick);
    await this.engine?.destroy();
    this.root?.remove();
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

const styles = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #050506; color: #e9e5dd; font: 14px/1.4 Georgia, serif; }
  .black-souls-host { min-height: 100vh; display: grid; place-items: center; padding: 12px; background: radial-gradient(circle at 50% 30%, #23181b, #050506 65%); }
  .bs-shell { width: min(100%, 980px); border: 1px solid #5d4042; background: #0b0a0b; box-shadow: 0 18px 70px #000; }
  header, nav { min-height: 42px; display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid #382a2c; letter-spacing: .12em; }
  header { justify-content: space-between; }
  .bs-runtime { color: #8e8580; font: 11px ui-monospace, monospace; letter-spacing: 0; }
  .bs-stage { position: relative; width: 100%; aspect-ratio: 4 / 3; max-height: calc(100vh - 160px); overflow: hidden; outline: none; background: #000; }
  .bs-stage:focus-visible { box-shadow: inset 0 0 0 2px #9a5559; }
  .bs-stage canvas { width: 100%; height: 100%; image-rendering: pixelated; display: block; }
  .bs-progress { padding: 8px 12px; color: #aaa; }
  .bs-progress div { height: 3px; margin-bottom: 6px; background: linear-gradient(90deg, #8e2d35 var(--progress), #241c1d var(--progress)); }
  nav { border-top: 1px solid #382a2c; border-bottom: 0; }
  button { border: 1px solid #5d4042; color: #e9e5dd; background: #171214; padding: 6px 12px; cursor: pointer; }
  button:hover { background: #2a1a1e; }
  .bs-status { display: block; min-height: 30px; padding: 6px 12px; color: #aaa; font: 12px ui-monospace, monospace; }
  .bs-status.error { color: #ff8d92; }
`;
