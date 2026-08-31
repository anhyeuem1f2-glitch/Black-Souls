import { GameEngine } from './core/game-engine.js';
import { HOST_STATES, PRESENTATION_STATES, hostStateForScene, transitionHostState, transitionPresentationState } from './core/lifecycle.js';
import { DataLoader } from './data/loader.js';
import { CanvasRenderer } from './render/canvas-renderer.js';
import { SaveStore } from './save/indexeddb.js';

export class BlackSoulsHost {
  constructor({ manifest, manifestUrl, target = document.body, dataBaseUrl, assetDevelopmentBaseUrl, onLoaderState = () => {}, onHostState = () => {} }) {
    this.manifest = manifest;
    this.manifestUrl = manifestUrl;
    this.target = target;
    this.dataBaseUrl = new URL(dataBaseUrl ?? manifest.data.base, manifestUrl);
    this.runtimeBaseUrl = new URL('./', manifestUrl);
    this.assetConfig = assetDevelopmentBaseUrl ? { ...manifest.assets, repository: { ...manifest.assets.repository, developmentBaseUrl: assetDevelopmentBaseUrl } } : manifest.assets;
    this.onLoaderState = onLoaderState;
    this.onHostState = onHostState;
    this.lifecycleState = HOST_STATES.UNINITIALIZED;
    this.presentationState = PRESENTATION_STATES.WINDOWED;
    this.resumeState = HOST_STATES.TITLE;
  }

  async mount() {
    this.root = document.createElement('main');
    this.root.className = 'black-souls-host';
    this.root.innerHTML = `
      <style>${styles}</style>
      <section class="bs-viewport">
        <div class="bs-stage" tabindex="0" aria-label="BLACK SOULS game viewport"></div>
        <div class="bs-progress" role="status" aria-live="polite"><div class="bs-progress-card"><strong>BLACK SOULS</strong><span>Loading game data...</span><i></i></div></div>
        <nav class="bs-toolbar" aria-label="BLACK SOULS host controls">
          <button data-action="fullscreen" title="Fullscreen">⛶</button>
          <button data-action="exit" title="Exit to SillyTavern">Exit to SillyTavern</button>
          <button data-action="diagnostics" aria-expanded="false" title="Developer diagnostics">⋯</button>
        </nav>
        <output class="bs-status" aria-live="polite" hidden></output>
        <aside class="bs-diagnostics" hidden><pre></pre></aside>
      </section>
      <section class="bs-resume-layer" hidden><button data-action="resume">Resume BLACK SOULS</button></section>`;
    this.target.replaceChildren(this.root);
    this.stage = this.root.querySelector('.bs-stage');
    this.status = this.root.querySelector('.bs-status');
    this.progress = this.root.querySelector('.bs-progress');
    this.bindControls();
    this.setLifecycle('LOAD');

    try {
      this.notifyLoader('Loading game data...', this.dataBaseUrl.href);
      const loader = new DataLoader(this.dataBaseUrl, this.runtimeBaseUrl, this.assetConfig, (message, fraction) => {
        this.setProgress(message, fraction);
        if (fraction >= 0.45) {
          this.setProgress('Starting BLACK SOULS...', 0.72);
          this.notifyLoader('Starting BLACK SOULS...', message);
        }
      }, (entry) => { console.debug('[BLACK SOULS diagnostics]', entry); this.refreshDiagnostics(); });
      const renderer = new CanvasRenderer(this.stage, loader, this.manifest.engine);
      const saves = new SaveStore();
      this.engine = new GameEngine({
        loader,
        renderer,
        saves,
        status: (message) => this.setStatus(message),
        onSceneChange: (scene) => this.handleSceneChange(scene),
        onExitRequest: () => { void this.pause(); },
      });
      await this.engine.initialize();
      this.setProgress('Ready', 1);
      this.notifyLoader('Ready', `runtime ${this.manifest.version}`);
      this.progress.classList.add('is-ready');
      this.readyTimer = setTimeout(() => { if (this.progress) this.progress.hidden = true; }, 240);
      this.focusGame();
      this.diagnosticsTimer = setInterval(() => this.refreshDiagnostics(), 1000);
      return this;
    } catch (error) {
      this.setLifecycle('ERROR');
      throw error;
    }
  }

  bindControls() {
    this.onClick = async (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (!action) {
        if (event.target.closest('.bs-stage') && !event.target.closest('[data-bs-modal]')) this.focusGame();
        return;
      }
      try {
        if (action === 'fullscreen') {
          if (document.fullscreenElement === this.root) await document.exitFullscreen?.();
          else await this.root.requestFullscreen?.();
        }
        if (action === 'exit') await this.pause();
        if (action === 'resume') await this.resume();
        if (action === 'diagnostics') this.toggleDiagnostics(event.target.closest('button'));
        if (action !== 'exit') this.focusGame();
      } catch (error) {
        this.setStatus(error.message, true);
      }
    };
    this.onFullscreenChange = () => {
      this.presentationState = transitionPresentationState(this.presentationState, document.fullscreenElement === this.root ? 'FULLSCREEN_ENTER' : 'FULLSCREEN_EXIT');
      this.emitHostState('fullscreenchange');
      if (this.lifecycleState !== HOST_STATES.PAUSED) this.focusGame();
      this.refreshDiagnostics();
    };
    this.root.addEventListener('click', this.onClick);
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
  }

  handleSceneChange(scene) { this.setLifecycle(`SCENE:${scene}`); }

  setLifecycle(event, resumeState = this.resumeState) {
    const previous = this.lifecycleState;
    this.lifecycleState = transitionHostState(previous, event, resumeState);
    if ([HOST_STATES.TITLE, HOST_STATES.PLAYING, HOST_STATES.MENU].includes(this.lifecycleState)) this.resumeState = this.lifecycleState;
    if (previous !== this.lifecycleState) this.emitHostState(event, previous);
  }

  emitHostState(reason, previous = this.lifecycleState) {
    try {
      this.onHostState({ state: this.lifecycleState, previous, reason, scene: this.engine?.state?.scene ?? null, presentation: this.presentationState });
    } catch (error) { console.warn('[BLACK SOULS] Host state callback failed', error); }
  }

  async pause() {
    if (this.lifecycleState === HOST_STATES.PAUSED) return;
    if (document.fullscreenElement === this.root) await document.exitFullscreen?.();
    this.resumeState = hostStateForScene(this.engine?.state?.scene);
    this.engine?.pause();
    this.root.classList.add('is-paused');
    this.root.querySelector('.bs-resume-layer').hidden = false;
    this.setLifecycle('PAUSE');
  }

  async resume() {
    if (this.lifecycleState !== HOST_STATES.PAUSED) return;
    this.root.classList.remove('is-paused');
    this.root.querySelector('.bs-resume-layer').hidden = true;
    this.engine?.resume();
    this.setLifecycle('RESUME', this.resumeState);
    this.focusGame();
  }

  focusGame() {
    if (!this.stage || this.lifecycleState === HOST_STATES.PAUSED || this.stage.querySelector('[data-bs-modal]')) return;
    this.stage.focus({ preventScroll: true });
  }

  setProgress(message, fraction = 0) {
    this.progress.querySelector('span').textContent = message;
    this.progress.querySelector('i').style.setProperty('--progress', `${Math.max(0, Math.min(1, fraction)) * 100}%`);
  }

  setStatus(message, error = false) {
    clearTimeout(this.statusTimer);
    this.status.textContent = message ?? '';
    this.status.hidden = !message;
    this.status.classList.toggle('error', error);
    if (message && !error) this.statusTimer = setTimeout(() => { if (this.status) this.status.hidden = true; }, 1800);
  }

  notifyLoader(state, detail = '') {
    try { this.onLoaderState(state, detail); } catch (error) { console.warn('[BLACK SOULS] Loader state callback failed', error); }
  }

  toggleDiagnostics(button) {
    const panel = this.root.querySelector('.bs-diagnostics');
    panel.hidden = !panel.hidden;
    button?.setAttribute('aria-expanded', String(!panel.hidden));
    this.refreshDiagnostics();
  }

  refreshDiagnostics() {
    const output = this.root?.querySelector('.bs-diagnostics pre');
    if (!output || !this.engine) return;
    output.textContent = JSON.stringify({
      runtime: { version: this.manifest.version, manifestUrl: this.manifestUrl.href },
      host: { state: this.lifecycleState, presentation: this.presentationState, fullscreen: document.fullscreenElement === this.root, focus: document.activeElement === this.stage },
      ...this.engine.getDiagnostics(),
    }, null, 2);
  }

  async save(slot) { return this.engine.save(slot); }
  async loadSave(slot) { return this.engine.load(slot); }
  async reset() { return this.engine.newGame(); }
  getState() { return this.engine.snapshot(); }
  getHostState() { return { state: this.lifecycleState, presentation: this.presentationState, scene: this.engine?.state?.scene ?? null }; }
  getDiagnostics() { this.refreshDiagnostics(); return { host: this.getHostState(), ...this.engine.getDiagnostics() }; }

  async unmount() {
    clearTimeout(this.readyTimer);
    clearTimeout(this.statusTimer);
    clearInterval(this.diagnosticsTimer);
    this.root?.removeEventListener('click', this.onClick);
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    if (document.fullscreenElement === this.root) await document.exitFullscreen?.();
    await this.engine?.destroy();
    this.setLifecycle('UNMOUNT');
    this.root?.remove();
  }
}

const styles = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; }
  body { margin: 0; background: #000; color: #e9e5dd; font: 14px/1.4 Georgia, serif; }
  .black-souls-host { position: fixed; inset: 0; width: 100vw; height: 100vh; overflow: hidden; background: #000; }
  .bs-viewport { position: absolute; inset: 0; display: grid; place-items: center; overflow: hidden; background: #000; }
  .bs-stage { position: relative; width: min(100vw, calc(100vh * 4 / 3)); height: min(100vh, calc(100vw * 3 / 4)); aspect-ratio: 4 / 3; outline: none; background: #000; }
  .bs-stage:focus-visible { box-shadow: inset 0 0 0 2px #9a5559; }
  .bs-stage canvas { width: 100%; height: 100%; image-rendering: pixelated; display: block; }
  .bs-progress { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; background: radial-gradient(circle at 50% 34%, #24171b, #050506 66%); transition: opacity .2s ease; }
  .bs-progress.is-ready { opacity: 0; pointer-events: none; }
  .bs-progress-card { width: min(420px, calc(100vw - 36px)); padding: 22px; border: 1px solid #5d4042; background: #0d0a0b; box-shadow: 0 18px 70px #000; display: grid; gap: 12px; }
  .bs-progress strong { font-size: 24px; letter-spacing: .12em; }
  .bs-progress span { color: #aaa; font: 13px ui-monospace, monospace; }
  .bs-progress i { height: 3px; background: linear-gradient(90deg, #9a343c var(--progress), #281d20 var(--progress)); }
  .bs-toolbar { position: fixed; z-index: 10; top: 8px; right: 8px; display: flex; gap: 5px; opacity: .22; transition: opacity .16s ease; }
  .bs-toolbar:hover, .bs-toolbar:focus-within { opacity: 1; }
  button { border: 1px solid #685054; color: #eee; background: #0b090acc; padding: 7px 10px; cursor: pointer; font: 12px ui-monospace, monospace; }
  button:hover, button:focus-visible { background: #2a1a1e; outline: 1px solid #bd8a90; }
  .bs-status { position: fixed; z-index: 11; left: 50%; bottom: 12px; transform: translateX(-50%); max-width: min(92vw, 680px); padding: 7px 11px; background: #080607e8; border: 1px solid #46383a; color: #d3ccc4; font: 12px ui-monospace, monospace; }
  .bs-status.error { color: #ff8d92; border-color: #8f3e46; }
  .bs-diagnostics { position: fixed; z-index: 12; inset: 48px 10px 10px auto; width: min(560px, calc(100vw - 20px)); overflow: auto; border: 1px solid #5d4042; background: #050506f5; }
  .bs-diagnostics pre { margin: 0; padding: 12px; color: #aeb9ad; font: 11px/1.45 ui-monospace, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
  .bs-resume-layer { position: fixed; inset: 0; z-index: 40; background: #080607; }
  .bs-resume-layer button { width: 100%; height: 100%; border: 1px solid #744; color: #fff; background: linear-gradient(180deg, #28181c, #120d0f); font-size: 13px; }
  .black-souls-host.is-paused .bs-viewport { display: none; }
  .black-souls-host.is-paused .bs-resume-layer { display: block; }
  @media (pointer: coarse) { .bs-toolbar { opacity: .7; } }
`;
