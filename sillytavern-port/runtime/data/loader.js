export class DataLoader {
  constructor(dataBaseUrl, assetBaseUrl, progress = () => {}) {
    this.dataBaseUrl = dataBaseUrl;
    this.assetBaseUrl = assetBaseUrl;
    this.progress = progress;
    this.jsonCache = new Map();
    this.imageCache = new Map();
  }

  async initialize() {
    this.progress('Loading game data...', 0.15);
    const [system, tilesets, actors, commonEvents] = await Promise.all([
      this.json('database/System.json'),
      this.json('database/Tilesets.json'),
      this.json('database/Actors.json'),
      this.json('database/CommonEvents.json'),
    ]);
    this.progress('Game data ready', 0.45);
    return { system, tilesets, actors, commonEvents };
  }

  map(id) {
    return this.json(`maps/${String(id).padStart(3, '0')}.json`);
  }

  async json(path) {
    const url = new URL(path, this.dataBaseUrl).href;
    if (!this.jsonCache.has(url)) {
      this.jsonCache.set(url, fetch(url).then((response) => {
        if (!response.ok) throw new Error(`Required game data failed: HTTP ${response.status} ${response.statusText} at ${url}`);
        const contentType = response.headers.get('content-type') || '';
        if (!/\bjson\b/i.test(contentType)) throw new Error(`Required game data has invalid Content-Type "${contentType || '(missing)'}" at ${url}`);
        return response.json();
      }));
    }
    return this.jsonCache.get(url);
  }

  asset(path) {
    return new URL(path.split('/').map(encodeURIComponent).join('/'), this.assetBaseUrl).href;
  }

  async image(path, { optional = true } = {}) {
    const url = this.asset(path);
    if (!this.imageCache.has(url)) {
      this.imageCache.set(url, new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => resolve(image);
        image.onerror = () => optional ? resolve(null) : reject(new Error(`Required image missing: ${path}`));
        image.src = url;
      }));
    }
    return this.imageCache.get(url);
  }
}
