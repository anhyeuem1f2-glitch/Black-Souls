export const HOST_STATES = Object.freeze({
  UNINITIALIZED: 'UNINITIALIZED',
  LOADING: 'LOADING',
  TITLE: 'TITLE',
  PLAYING: 'PLAYING',
  MENU: 'MENU',
  PAUSED: 'PAUSED',
  ERROR: 'ERROR',
  UNMOUNTED: 'UNMOUNTED',
});

export const PRESENTATION_STATES = Object.freeze({
  WINDOWED: 'WINDOWED',
  FULLSCREEN: 'FULLSCREEN',
});

const ACTIVE_SCENES = new Set([HOST_STATES.TITLE, HOST_STATES.PLAYING, HOST_STATES.MENU]);

export function hostStateForScene(scene) {
  if (scene === 'TITLE') return HOST_STATES.TITLE;
  if (['MENU', 'END', 'ITEM', 'EQUIP', 'STATUS', 'SYNTHESIS', 'SHOP'].includes(scene)) return HOST_STATES.MENU;
  return HOST_STATES.PLAYING;
}

export function transitionHostState(current, event, resumeState = HOST_STATES.TITLE) {
  if (event === 'LOAD') return HOST_STATES.LOADING;
  if (event === 'ERROR') return HOST_STATES.ERROR;
  if (event === 'UNMOUNT') return HOST_STATES.UNMOUNTED;
  if (event === 'PAUSE' && ACTIVE_SCENES.has(current)) return HOST_STATES.PAUSED;
  if (event === 'RESUME' && current === HOST_STATES.PAUSED) return ACTIVE_SCENES.has(resumeState) ? resumeState : HOST_STATES.TITLE;
  if (event.startsWith('SCENE:') && current !== HOST_STATES.UNMOUNTED) return hostStateForScene(event.slice(6));
  return current;
}

export function transitionPresentationState(current, event) {
  if (event === 'FULLSCREEN_ENTER') return PRESENTATION_STATES.FULLSCREEN;
  if (event === 'FULLSCREEN_EXIT') return PRESENTATION_STATES.WINDOWED;
  return current;
}

export function cancelScene(scene) {
  if (scene === 'PLAYING') return 'MENU';
  if (scene === 'MENU') return 'PLAYING';
  if (scene === 'END') return 'MENU';
  return scene;
}
