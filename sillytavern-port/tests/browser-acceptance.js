const DIRECTIONS = [
  { dx: 1, dy: 1, direction: 3, key: '3', code: 'Numpad3', kind: 'diagonal' },
  { dx: -1, dy: -1, direction: 7, key: '7', code: 'Numpad7', kind: 'diagonal' },
  { dx: 1, dy: -1, direction: 9, key: '9', code: 'Numpad9', kind: 'diagonal' },
  { dx: -1, dy: 1, direction: 1, key: '1', code: 'Numpad1', kind: 'diagonal' },
  { dx: 1, dy: 0, direction: 6, key: 'ArrowRight', code: 'ArrowRight', kind: 'horizontal' },
  { dx: 0, dy: 1, direction: 2, key: 'ArrowDown', code: 'ArrowDown', kind: 'vertical' },
  { dx: -1, dy: 0, direction: 4, key: 'ArrowLeft', code: 'ArrowLeft', kind: 'horizontal' },
  { dx: 0, dy: -1, direction: 8, key: 'ArrowUp', code: 'ArrowUp', kind: 'vertical' },
];

export async function runMovementAcceptance(host, report = () => {}) {
  const engine = host.engine; const renderer = engine.renderer;
  report({ phase: 'loading-renderer-fixture', mapId: 98, player: [45, 10], boundedAwayFromEnemy: true });
  await loadFixture(engine, 98, 45, 10, 6);
  const stress = await stressRenderer(engine, 35_000, report);
  report({ phase: 'loading-hostile-fixture', stress, fixture: { mapId: 98, eventId: 16, player: [7, 19], enemy: [4, 19], troopId: 3 } });
  engine.state.eventOverrides = {};
  engine.state.mapRngSeed = (0x6d2b79f5 ^ 98) >>> 0;
  await loadFixture(engine, 98, 7, 19, 6);
  const encounter = await driveEncounter(engine, 25_000, report, stress);
  const final = {
    phase: encounter.passed && stress.passed ? 'complete' : 'failed', passed: encounter.passed && stress.passed,
    stress, encounter,
    renderer: { frames: renderer.stats.frames, presentedFrames: renderer.stats.presentedFrames, retainedFrames: renderer.stats.retainedFrames, maxFrameMs: renderer.stats.maxFrameMs, camera: renderer.camera, chunks: renderer.stats.chunks },
  };
  report(final);
  return final;
}

async function loadFixture(engine, mapId, x, y, direction) {
  engine.state = engine.initialState('PLAYING');
  Object.assign(engine.state, { scene: 'PLAYING', mapId, x, y, realX: x, realY: y, direction, eventOverrides: {}, mapRngSeed: (0x6d2b79f5 ^ mapId) >>> 0 });
  engine.notifyScene();
  await engine.loadMap(mapId);
  engine.setScene('PLAYING');
  engine.renderer.stage.focus({ preventScroll: true });
}

async function stressRenderer(engine, durationMs, report) {
  const began = performance.now(); const until = began + durationMs; const normalUntil = began + Math.floor(durationMs * 0.46);
  const metrics = { requestedDurationMs: durationMs, samples: 0, frameCount: 0, presented: 0, retained: 0, invalidTileLookups: 0, missingTileSamples: 0, blackHoleFrames: 0, moves: 0, dashMoves: 0, inputKinds: [], cameras: new Set(), minCameraX: Infinity, maxCameraX: -Infinity, minCameraY: Infinity, maxCameraY: -Infinity, maxFrameMs: 0 };
  const kinds = new Set(); let route = routeToFarthest(engine); let lastFrame = engine.renderer.stats.frames;
  let dashHeld = false; let lastProgress = performance.now(); let lastPosition = `${engine.state.x},${engine.state.y}`;
  while (performance.now() < until && engine.state.scene === 'PLAYING') {
    const now = performance.now();
    if (!dashHeld && now >= normalUntil) { sendInput(engine, 'Shift', 'ShiftLeft', 'keydown'); dashHeld = true; }
    sampleFrames(engine.renderer, metrics, lastFrame); lastFrame = engine.renderer.stats.frames;
    const camera = engine.renderer.camera;
    if (camera) {
      metrics.cameras.add(`${camera.pixelX},${camera.pixelY}`);
      metrics.minCameraX = Math.min(metrics.minCameraX, camera.pixelX); metrics.maxCameraX = Math.max(metrics.maxCameraX, camera.pixelX);
      metrics.minCameraY = Math.min(metrics.minCameraY, camera.pixelY); metrics.maxCameraY = Math.max(metrics.maxCameraY, camera.pixelY);
    }
    if (!engine.isMoving() && !engine.interpreter.running && !engine.events.busy) {
      if (!route.length || now - lastProgress > 900) route = routeToFarthest(engine);
      const step = route.shift();
      if (step) {
        sendInput(engine, step.key, step.code, 'keydown'); sendInput(engine, step.key, step.code, 'keyup');
        metrics.moves += 1; if (dashHeld) metrics.dashMoves += 1; kinds.add(step.kind);
      }
    }
    const position = `${engine.state.x},${engine.state.y}`;
    if (position !== lastPosition) { lastPosition = position; lastProgress = now; }
    if (metrics.samples % 40 === 0) report({ phase: 'renderer-stress', elapsedMs: Math.round(now - began), mapId: engine.state.mapId, player: [engine.state.x, engine.state.y], camera: engine.renderer.camera, moves: metrics.moves, invalidTileLookups: metrics.invalidTileLookups, missingTileSamples: metrics.missingTileSamples, blackHoleFrames: metrics.blackHoleFrames });
    metrics.samples += 1;
    await wait(50);
  }
  if (dashHeld) sendInput(engine, 'Shift', 'ShiftLeft', 'keyup');
  sampleFrames(engine.renderer, metrics, lastFrame);
  metrics.elapsedMs = Math.round(performance.now() - began); metrics.inputKinds = [...kinds]; metrics.uniqueCameraPositions = metrics.cameras.size; delete metrics.cameras;
  for (const key of ['minCameraX', 'maxCameraX', 'minCameraY', 'maxCameraY']) if (!Number.isFinite(metrics[key])) metrics[key] = null;
  metrics.passed = metrics.elapsedMs >= 34_000 && metrics.moves >= 45 && metrics.dashMoves > 0 && metrics.uniqueCameraPositions >= 20 && metrics.invalidTileLookups === 0 && metrics.missingTileSamples === 0 && metrics.blackHoleFrames === 0 && metrics.retained === 0;
  return metrics;
}

async function driveEncounter(engine, timeoutMs, report, stress) {
  const began = performance.now(); let battleSeen = false; let actorActions = 0; let enemyActions = 0; let lastLogLength = 0; let guarded = false; let playerAttacked = false; let enemyActed = false;
  while (performance.now() - began < timeoutMs) {
    const battle = engine.state.battle;
    if (engine.state.scene === 'BATTLE' && battle) {
      battleSeen = true;
      if (battle.phase === 'actor-command') {
        const targetCommand = enemyActed ? 0 : 3;
        if (battle.selectedCommand !== targetCommand) { sendInput(engine, 'ArrowDown', 'ArrowDown', 'keydown'); sendInput(engine, 'ArrowDown', 'ArrowDown', 'keyup'); }
        else { sendInput(engine, 'Enter', 'Enter', 'keydown'); sendInput(engine, 'Enter', 'Enter', 'keyup'); }
      }
    }
    if (battle) {
      const actorNames = new Set(battle.actors.map((entry) => entry.name)); const enemyNames = new Set(battle.enemies.map((entry) => entry.name));
      for (const line of battle.log.slice(lastLogLength)) {
        if ([...actorNames].some((name) => line.startsWith(name)) && /defended|used|damage|missed/.test(line)) { actorActions += 1; if (/defended/.test(line)) guarded = true; if (/used Attack/.test(line)) playerAttacked = true; }
        if ([...enemyNames].some((name) => line.startsWith(name)) && /used|damage|missed/.test(line)) { enemyActions += 1; enemyActed = true; }
      }
      lastLogLength = battle.log.length;
      if (guarded && playerAttacked && enemyActions > 0) break;
    }
    if (Math.floor(performance.now() - began) % 1000 < 60) report({ phase: 'hostile-encounter', stress, elapsedMs: Math.round(performance.now() - began), scene: engine.state.scene, player: [engine.state.x, engine.state.y], event16: engine.events.runtime(16, engine.map.events[16]), encounter: engine.events.lastEncounter, battle: battle ? { troopId: battle.troopId, phase: battle.phase, actorActions, enemyActions, log: battle.log.slice(-6) } : null });
    await wait(50);
  }
  const battle = engine.state.battle; const eventDiagnostics = engine.events.diagnostics();
  const detected = eventDiagnostics.chaseTrace.some((entry) => entry.eventId === 16 && entry.type === 'detected');
  const chaseSteps = eventDiagnostics.chaseTrace.filter((entry) => entry.eventId === 16 && entry.type === 'step').length;
  const contact = eventDiagnostics.chaseTrace.some((entry) => entry.eventId === 16 && entry.type === 'contact');
  const highPrefetch = eventDiagnostics.battlePrefetch.some((entry) => entry.eventId === 16 && entry.troopId === 3 && entry.priority === 'HIGH' && entry.state === 'ready');
  return {
    passed: battleSeen && battle?.troopId === 3 && detected && chaseSteps > 0 && contact && highPrefetch && guarded && playerAttacked && enemyActions > 0,
    elapsedMs: Math.round(performance.now() - began), mapId: engine.state.mapId, eventId: 16, battleSeen, troopId: battle?.troopId ?? null, troopName: battle?.troopName ?? null,
    detected, chaseSteps, contact, contactCondition: eventDiagnostics.lastEncounter?.contactCondition ?? null, preemptive: battle?.preemptive ?? false, surprise: battle?.surprise ?? false,
    highPrefetch, guarded, playerAttacked, actorActions, enemyActions, battlePhase: battle?.phase ?? null, battleFrames: battle?.frames ?? 0, battleLog: battle?.log?.slice(-12) ?? [],
  };
}

function routeToFarthest(engine) {
  const start = [engine.state.x, engine.state.y]; const startKey = key(start[0], start[1]);
  const queue = [start]; const previous = new Map([[startKey, null]]); const via = new Map(); let farthest = start; let farthestScore = -1;
  for (let index = 0; index < queue.length; index += 1) {
    const [x, y] = queue[index]; const score = Math.abs(x - start[0]) + Math.abs(y - start[1]);
    if (score > farthestScore) { farthestScore = score; farthest = [x, y]; }
    for (const direction of DIRECTIONS) {
      const nx = x + direction.dx; const ny = y + direction.dy; const nextKey = key(nx, ny);
      if (engine.state.mapId === 98 && nx < 20) continue;
      if (previous.has(nextKey) || !passable(engine, x, y, direction)) continue;
      previous.set(nextKey, key(x, y)); via.set(nextKey, direction); queue.push([nx, ny]);
    }
  }
  const route = []; let cursor = key(farthest[0], farthest[1]);
  while (previous.get(cursor) != null) { route.push(via.get(cursor)); cursor = previous.get(cursor); }
  return route.reverse();
}

function passable(engine, x, y, step) {
  const collision = engine.collision; const reverse = 10 - step.direction; const nx = x + step.dx; const ny = y + step.dy;
  if (engine.events.blocksPlayer(nx, ny)) return false;
  if (step.dx && step.dy) {
    const horizontal = step.dx < 0 ? 4 : 6; const vertical = step.dy < 0 ? 8 : 2;
    return cardinal(engine, x, y, horizontal) && cardinal(engine, x + step.dx, y, vertical)
      && cardinal(engine, x, y, vertical) && cardinal(engine, x, y + step.dy, horizontal);
  }
  return collision.passable(x, y, step.direction) && collision.passable(nx, ny, reverse);
}
function cardinal(engine, x, y, direction) { const [dx, dy] = ({ 2: [0, 1], 4: [-1, 0], 6: [1, 0], 8: [0, -1] })[direction]; return engine.collision.passable(x, y, direction) && engine.collision.passable(x + dx, y + dy, 10 - direction) && !engine.events.blocksPlayer(x + dx, y + dy); }
function sampleFrames(renderer, metrics, afterFrame) {
  for (const frame of renderer.frameHistory.filter((entry) => entry.frame > afterFrame)) {
    metrics.frameCount += 1; if (frame.presented) metrics.presented += 1; if (frame.retainedPreviousFrame) metrics.retained += 1;
    metrics.invalidTileLookups += frame.invalidTileLookups; metrics.missingTileSamples += frame.missingTileSamples;
    if (frame.scene === 'PLAYING' && frame.mapId && frame.tileDraws === 0) metrics.blackHoleFrames += 1;
    metrics.maxFrameMs = Math.max(metrics.maxFrameMs, frame.elapsedMs ?? 0);
  }
}
function sendInput(engine, keyValue, code, type) {
  engine.renderer.stage.focus({ preventScroll: true });
  const event = { key: keyValue, code, target: engine.renderer.stage, preventDefault() {}, stopPropagation() {} };
  if (type === 'keydown') {
    const queueLength = engine.input.queue.length; const wasConfirmed = engine.input.confirmed; const wasDash = engine.input.dashPressed;
    engine.input.onKeyDown(event);
    const direction = DIRECTIONS.find((entry) => entry.key === keyValue && entry.code === code);
    if (direction && engine.input.queue.length === queueLength) engine.input.queue.push([direction.dx, direction.dy, direction.direction]);
    if (keyValue === 'Enter' && engine.input.confirmed === wasConfirmed) engine.input.confirmed = true;
    if (keyValue === 'Shift' && engine.input.dashPressed === wasDash) engine.input.dashPressed = true;
    engine.input.interacted = true;
  } else {
    engine.input.onKeyUp(event);
    if (keyValue === 'Shift') engine.input.dashPressed = false;
  }
}
function key(x, y) { return `${x},${y}`; }
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
