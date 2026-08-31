export class AudioManager {
  constructor(loader, onDiagnostic = () => {}) {
    this.loader = loader;
    this.onDiagnostic = onDiagnostic;
    this.channels = { bgm: null, bgs: null };
    this.pending = { bgm: null, bgs: null };
    this.stats = { unlocked: false, bgm: null, bgs: null, lastSe: null, failures: [] };
  }

  async unlock() {
    if (this.stats.unlocked) return;
    this.stats.unlocked = true;
    for (const channel of ['bgm', 'bgs']) {
      const element = this.channels[channel];
      if (!element || !this.pending[channel]) continue;
      try {
        await element.play();
        if (this.stats[channel]) this.stats[channel].state = 'playing';
        this.pending[channel] = null;
        this.onDiagnostic({ type: 'audio-playing', channel, path: this.stats[channel]?.path, afterUnlock: true });
      } catch (error) {
        if (this.stats[channel]) this.stats[channel].state = 'blocked';
        this.failure(channel, this.stats[channel]?.name ?? '', error.message);
      }
    }
  }

  async applyMapAudio(map) {
    if (map?.autoplay_bgm && map.bgm?.name) await this.playLoop('bgm', map.bgm, { waitForPlayback: false });
    else if (!map?.autoplay_bgm) this.stop('bgm');
    if (map?.autoplay_bgs && map.bgs?.name) await this.playLoop('bgs', map.bgs, { waitForPlayback: false });
    else if (!map?.autoplay_bgs) this.stop('bgs');
  }

  async playLoop(channel, descriptor, { waitForPlayback = true } = {}) {
    if (this.stats[channel]?.name === descriptor.name) return;
    this.stop(channel);
    const path = this.findAudioPath(`Audio/${channel.toUpperCase()}/${descriptor.name}`);
    if (!path) return this.failure(channel, descriptor.name, 'not listed in asset manifest');
    try {
      const url = await this.loader.audioUrl(path);
      const element = new Audio(url);
      element.loop = true;
      applySettings(element, descriptor);
      this.channels[channel] = element;
      this.stats[channel] = { name: descriptor.name, path, state: this.stats.unlocked ? 'loading' : 'blocked' };
      if (!this.stats.unlocked) {
        this.pending[channel] = descriptor;
        this.onDiagnostic({ type: 'audio-awaiting-unlock', channel, path });
        return;
      }
      const playback = element.play().then(() => {
        if (this.channels[channel] !== element) return;
        this.stats[channel].state = 'playing';
        this.onDiagnostic({ type: 'audio-playing', channel, path });
      }).catch((error) => this.failure(channel, descriptor.name, error.message));
      if (waitForPlayback) await playback;
      else void playback;
    } catch (error) {
      this.failure(channel, descriptor.name, error.message);
    }
  }

  async playSe(descriptor) {
    if (!descriptor?.name) return;
    const path = this.findAudioPath(`Audio/SE/${descriptor.name}`);
    if (!path) return this.failure('se', descriptor.name, 'not listed in asset manifest');
    try {
      const element = new Audio(await this.loader.audioUrl(path));
      applySettings(element, descriptor);
      this.stats.lastSe = { name: descriptor.name, path, state: 'loading' };
      await element.play();
      this.stats.lastSe.state = 'playing';
      this.onDiagnostic({ type: 'audio-playing', channel: 'se', path });
    } catch (error) {
      this.failure('se', descriptor.name, error.message);
    }
  }

  findAudioPath(basePath) {
    return this.loader.resolveEntry(basePath)?.path ?? null;
  }

  failure(channel, name, error) {
    const item = { channel, name, error };
    this.stats.failures.push(item);
    this.stats.failures = this.stats.failures.slice(-10);
    this.onDiagnostic({ type: 'audio-failed', ...item });
  }

  stop(channel) {
    const element = this.channels[channel];
    if (element) { element.pause(); element.currentTime = 0; }
    this.channels[channel] = null;
    this.pending[channel] = null;
    this.stats[channel] = null;
  }

  diagnostics() { return structuredClone(this.stats); }
  destroy() { this.stop('bgm'); this.stop('bgs'); }
}

function applySettings(element, descriptor) {
  element.volume = Math.max(0, Math.min(1, Number(descriptor.volume ?? 100) / 100));
  element.playbackRate = Math.max(0.5, Math.min(2, Number(descriptor.pitch ?? 100) / 100));
  element.preload = 'auto';
}
