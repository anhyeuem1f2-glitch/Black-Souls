const DIRECTIONS = Object.freeze({
  1: [-1, 1], 2: [0, 1], 3: [1, 1], 4: [-1, 0],
  6: [1, 0], 7: [-1, -1], 8: [0, -1], 9: [1, -1],
});

import { classifyEventPage, isAutonomousMobility, symbolIdFromMoveRoute } from './event-mobility.js';

// Ported from generated/scripts/145-シンボル.rb. Keep the indices in the
// same order as SYMBOL_SETTING_LIST so event-route calls remain data-driven.
export const SYMBOL_SETTINGS = Object.freeze({
  0: Object.freeze({ awayLevel: 0, awayLevelType: 1, reactionDistance: 3, dashDistance: 5, idleType: 0, visibilityDistance: 5, beforeSpeed: 2, afterSpeed: 4, beforeFrequency: 5, afterFrequency: 5, balloonId: 1, blockedRegions: [1, 3] }),
  1: Object.freeze({ awayLevel: 0, awayLevelType: 1, reactionDistance: 3, dashDistance: 4, idleType: 1, visibilityDistance: 0, beforeSpeed: 0, afterSpeed: 4, beforeFrequency: 0, afterFrequency: 5, balloonId: 1, blockedRegions: [] }),
  2: Object.freeze({ awayLevel: 0, awayLevelType: 1, reactionDistance: 0, dashDistance: 0, idleType: 0, visibilityDistance: 0, beforeSpeed: 0, afterSpeed: 0, beforeFrequency: 0, afterFrequency: 0, balloonId: 0, blockedRegions: [] }),
  3: Object.freeze({ awayLevel: 0, awayLevelType: 1, reactionDistance: 0, dashDistance: 0, idleType: 0, visibilityDistance: 0, beforeSpeed: 0, afterSpeed: 0, beforeFrequency: 0, afterFrequency: 0, balloonId: 0, blockedRegions: [] }),
});

export class GameEventSystem {
  constructor(engine) {
    this.engine = engine;
    this.map = null;
    this.mapId = 0;
    this.busy = false;
    this.lastCollision = null;
    this.lastEncounter = null;
    this.chaseTrace = [];
    this.pageRefreshes = [];
    this.prefetches = new Map();
  }

  setupMap(map, mapId = this.engine.state.mapId) {
    this.map = map;
    this.mapId = Number(mapId);
    this.busy = false;
    this.activeEventId = null;
    for (const event of Object.values(map?.events ?? {})) if (event) this.refresh(event, true);
  }

  update(deltaSeconds = 1 / 60) {
    if (!this.map || this.engine.state.scene !== 'PLAYING') return;
    const interpreterBusy = Boolean(this.engine.interpreter?.running || this.busy);
    this.updateStealthOpacity(interpreterBusy);
    for (const event of Object.values(this.map.events ?? {})) {
      if (!event) continue;
      const runtime = this.refresh(event);
      if (!runtime || runtime.erased || runtime.pageIndex < 0) continue;
      this.updateMotion(runtime, deltaSeconds);
      this.updateSymbolReaction(event, runtime, interpreterBusy);
      if (runtime.motion || this.moving(runtime) || runtime.routeWait > 0) {
        runtime.routeWait = Math.max(0, Number(runtime.routeWait ?? 0) - 1);
        continue;
      }
      runtime.stopCount = Number(runtime.stopCount ?? 0) + Math.max(0, deltaSeconds * 60);
      if (interpreterBusy || runtime.starting || runtime.locked) continue;
      if (runtime.stopCount <= stopCountThreshold(runtime.moveFrequency)) continue;
      if (!runtime.uninhibited && !this.nearScreen(runtime)) continue;
      if (runtime.symbolId != null) this.updateSymbolMovement(event, runtime);
      else this.updateAutonomousMovement(event, runtime);
    }
  }

  refresh(event, force = false) {
    const runtime = this.runtime(event.id, event);
    const pageIndex = activePageIndex(this.engine, event);
    if (!force && runtime.pageIndex === pageIndex) return pageIndex >= 0 ? runtime : null;
    const previous = runtime.pageIndex;
    runtime.pageIndex = pageIndex;
    runtime.stopCount = 0;
    runtime.routeIndex = 0;
    runtime.routeWait = 0;
    runtime.starting = false;
    runtime.locked = false;
    runtime.symbolForming = false;
    runtime.symbolId = null;
    delete runtime.motion;
    runtime.realX = runtime.x;
    runtime.realY = runtime.y;
    if (pageIndex < 0) {
      Object.assign(runtime, { through: true, trigger: null, priority: 0, transparent: true });
      return null;
    }
    const page = event.pages[pageIndex];
    const graphic = page.graphic ?? {};
    runtime.direction = Number(graphic.direction) || 2;
    runtime.originalDirection = runtime.direction;
    runtime.prelockDirection = 0;
    runtime.pattern = Number(graphic.pattern) || 0;
    runtime.originalPattern = runtime.pattern;
    runtime.graphic = structuredClone(graphic);
    const mobility = classifyEventPage(event, page);
    Object.assign(runtime, {
      moveType: Number(page.move_type) || 0,
      moveSpeed: Number(page.move_speed) || 0,
      moveFrequency: Number(page.move_frequency) || 0,
      walkAnime: Boolean(page.walk_anime), stepAnime: Boolean(page.step_anime),
      directionFix: Boolean(page.direction_fix), through: Boolean(page.through),
      priority: Number(page.priority_type) || 0, trigger: Number(page.trigger),
      transparent: false, moveRoute: page.move_route ?? null,
      uninhibited: isUninhibited(event, page), originOpacity: Number(runtime.originOpacity ?? runtime.opacity ?? 255),
      mobilityClass: mobility.classification, mobilityEvidence: mobility.evidence,
    });
    const symbolId = symbolIdFromPage(page);
    if (symbolId != null && SYMBOL_SETTINGS[symbolId]) {
      runtime.symbolId = symbolId;
      runtime.moveSpeed = SYMBOL_SETTINGS[symbolId].beforeSpeed;
      runtime.moveFrequency = SYMBOL_SETTINGS[symbolId].beforeFrequency;
    }
    this.pageRefreshes.push({ at: Date.now(), mapId: this.mapId, eventId: event.id, previous, pageIndex });
    this.pageRefreshes = this.pageRefreshes.slice(-30);
    return runtime;
  }

  runtime(eventId, event = this.map?.events?.[eventId]) {
    const key = `${this.mapId},${eventId}`;
    const runtime = this.engine.state.eventOverrides[key] ??= {};
    runtime.x ??= Number(event?.x) || 0; runtime.y ??= Number(event?.y) || 0;
    runtime.realX ??= runtime.x; runtime.realY ??= runtime.y;
    runtime.opacity ??= 255; runtime.pageIndex ??= -2;
    return runtime;
  }

  updateMotion(runtime, deltaSeconds) {
    if (runtime.motion) return;
    if (!this.moving(runtime)) {
      if (runtime.walkAnime || runtime.stepAnime) this.updatePattern(runtime, deltaSeconds);
      return;
    }
    const distance = (2 ** Number(runtime.moveSpeed ?? 3) / 256) * Math.max(0, deltaSeconds * 60);
    runtime.realX = approach(runtime.realX, runtime.x, distance);
    runtime.realY = approach(runtime.realY, runtime.y, distance);
    runtime.stopCount = 0;
    if (runtime.walkAnime) this.updatePattern(runtime, deltaSeconds);
    if (!this.moving(runtime) && !runtime.stepAnime) runtime.pattern = runtime.originalPattern ?? 1;
  }

  updatePattern(runtime, deltaSeconds) {
    runtime.animationCount = Number(runtime.animationCount ?? 0) + 1.5 * Math.max(0, deltaSeconds * 60);
    if (runtime.animationCount > 18 - Number(runtime.moveSpeed ?? 3) * 2) {
      runtime.pattern = (Number(runtime.pattern ?? 1) + 1) % 4;
      runtime.animationCount = 0;
    }
  }

  updateAutonomousMovement(event, runtime) {
    if (!isAutonomousMobility(runtime.mobilityClass)) return;
    if (runtime.moveType === 1) {
      const roll = this.randomInt(6);
      if (roll <= 1) this.tryMove(event, runtime, [2, 4, 6, 8][this.randomInt(4)]);
      else if (roll <= 4) this.tryMove(event, runtime, runtime.direction);
      else runtime.stopCount = 0;
    } else if (runtime.moveType === 2) {
      this.moveTypeTowardPlayer(event, runtime);
    } else if (runtime.moveType === 3) this.updateCustomRoute(event, runtime);
  }

  updateCustomRoute(event, runtime) {
    const route = runtime.moveRoute;
    const list = route?.list ?? [];
    if (!list.length) return;
    let command = list[runtime.routeIndex] ?? list[0];
    if (command.code === 0) {
      if (!route.repeat) return;
      runtime.routeIndex = 0; command = list[0];
      if (command?.code === 0) return;
    }
    const parameters = command.parameters ?? [];
    let moved = true;
    if (command.code >= 1 && command.code <= 8) moved = this.tryMove(event, runtime, ({ 1: 2, 2: 4, 3: 6, 4: 8, 5: 1, 6: 3, 7: 7, 8: 9 })[command.code]);
    else if (command.code === 9) moved = this.tryMove(event, runtime, [2, 4, 6, 8][this.randomInt(4)]);
    else if (command.code === 10) moved = this.moveTowardPlayer(event, runtime);
    else if (command.code === 11) moved = this.moveAwayFromPlayer(event, runtime);
    else if (command.code === 12) moved = this.tryMove(event, runtime, runtime.direction);
    else if (command.code === 13) moved = this.tryMove(event, runtime, reverse(runtime.direction), { changeDirection: false });
    else if (command.code === 14) {
      const dx = Number(parameters[0]) || 0; const dy = Number(parameters[1]) || 0;
      if (!runtime.directionFix) runtime.direction = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 4 : 6) : dy < 0 ? 8 : 2;
      runtime.x += dx; runtime.y += dy; runtime.stopCount = 0;
    }
    else if (command.code === 15) runtime.routeWait = Math.max(0, Number(parameters[0]) - 1);
    else if (command.code >= 16 && command.code <= 19 && !runtime.directionFix) runtime.direction = ({ 16: 2, 17: 4, 18: 6, 19: 8 })[command.code];
    else if (command.code === 20 && !runtime.directionFix) runtime.direction = ({ 2: 4, 4: 8, 6: 2, 8: 6 })[runtime.direction] ?? runtime.direction;
    else if (command.code === 21 && !runtime.directionFix) runtime.direction = ({ 2: 6, 4: 2, 6: 8, 8: 4 })[runtime.direction] ?? runtime.direction;
    else if (command.code === 22 && !runtime.directionFix) runtime.direction = reverse(runtime.direction);
    else if (command.code === 23 && !runtime.directionFix) runtime.direction = (this.randomInt(2) === 0 ? ({ 2: 4, 4: 8, 6: 2, 8: 6 }) : ({ 2: 6, 4: 2, 6: 8, 8: 4 }))[runtime.direction] ?? runtime.direction;
    else if (command.code === 24 && !runtime.directionFix) runtime.direction = [2, 4, 6, 8][this.randomInt(4)];
    else if (command.code === 25 && !runtime.directionFix) runtime.direction = directionToward(runtime.x, runtime.y, this.engine.state.x, this.engine.state.y, runtime.direction);
    else if (command.code === 26 && !runtime.directionFix) runtime.direction = reverse(directionToward(runtime.x, runtime.y, this.engine.state.x, this.engine.state.y, reverse(runtime.direction)));
    else if (command.code === 27) this.engine.state.switches[parameters[0]] = true;
    else if (command.code === 28) this.engine.state.switches[parameters[0]] = false;
    else if (command.code === 29) runtime.moveSpeed = Number(parameters[0]);
    else if (command.code === 30) runtime.moveFrequency = Number(parameters[0]);
    else if (command.code === 31) runtime.walkAnime = true;
    else if (command.code === 32) runtime.walkAnime = false;
    else if (command.code === 33) runtime.stepAnime = true;
    else if (command.code === 34) runtime.stepAnime = false;
    else if (command.code === 35) runtime.directionFix = true;
    else if (command.code === 36) runtime.directionFix = false;
    else if (command.code === 37) runtime.through = true;
    else if (command.code === 38) runtime.through = false;
    else if (command.code === 39) runtime.transparent = true;
    else if (command.code === 40) runtime.transparent = false;
    else if (command.code === 41) void this.engine.changeCharacterGraphic?.(event.id, parameters[0], parameters[1], event.id);
    else if (command.code === 42) runtime.opacity = runtime.originOpacity = Number(parameters[0]);
    else if (command.code === 43) runtime.blendType = Number(parameters[0]);
    else if (command.code === 44) void this.engine.playSe?.(parameters[0]);
    else if (command.code === 45) this.engine.runRubyCompatibility?.(String(parameters[0] ?? ''), { eventId: event.id });
    if (moved || route.skippable) runtime.routeIndex += 1;
    runtime.stopCount = 0;
  }

  updateSymbolReaction(event, runtime, inactive) {
    if (runtime.symbolId == null) return;
    const setting = SYMBOL_SETTINGS[runtime.symbolId];
    const stealth = this.stealthActive();
    if (inactive) {
      // Script 145 suspends reaction checks while the map interpreter runs; it
      // preserves @forming until normal map updates resume.
    } else if (runtime.erased || stealth) {
      runtime.symbolForming = false;
    } else {
      const distance = this.distanceToPlayer(runtime);
      const threshold = runtime.symbolForming ? setting.dashDistance + 1
        : (this.engine.state.dash && this.engine.isMoving?.() ? setting.dashDistance : setting.reactionDistance);
      const reacting = distance <= threshold;
      if (!runtime.symbolForming && reacting) this.startForming(event, runtime, setting);
      else if (runtime.symbolForming && !reacting) this.endForming(event, runtime, setting, 'distance');
      runtime.symbolForming = reacting;
    }
    runtime.opacity = setting.visibilityDistance === 0 ? runtime.originOpacity
      : clamp(runtime.originOpacity - 50 * (this.distanceToPlayer(runtime) - setting.visibilityDistance), 0, 255);
  }

  updateSymbolMovement(event, runtime) {
    const setting = SYMBOL_SETTINGS[runtime.symbolId];
    if (runtime.symbolForming && !this.stealthActive()) {
      runtime.moveSpeed = setting.afterSpeed; runtime.moveFrequency = setting.afterFrequency;
      if (setting.awayLevel > 0 && this.playerLevel(setting.awayLevelType) > setting.awayLevel) this.moveAwayFromPlayer(event, runtime, setting.blockedRegions);
      else this.moveTypeTowardPlayer(event, runtime, setting.blockedRegions);
    } else {
      runtime.moveSpeed = setting.beforeSpeed; runtime.moveFrequency = setting.beforeFrequency;
      if (setting.idleType === 0) {
        const roll = this.randomInt(6);
        if (roll <= 1) this.tryMove(event, runtime, [2, 4, 6, 8][this.randomInt(4)], { blockedRegions: setting.blockedRegions });
        else if (roll <= 4) this.tryMove(event, runtime, runtime.direction, { blockedRegions: setting.blockedRegions });
        else runtime.stopCount = 0;
      }
      else runtime.stopCount = 0;
    }
  }

  startForming(event, runtime, setting) {
    runtime.moveSpeed = setting.afterSpeed; runtime.moveFrequency = setting.afterFrequency;
    this.traceChase('detected', event, runtime, { distance: this.distanceToPlayer(runtime) });
    if (setting.balloonId) {
      void this.engine.playSe?.({ name: 'Decision1', volume: 50, pitch: 150 });
      void this.engine.renderer.showBalloon?.({ x: runtime.realX, y: runtime.realY }, setting.balloonId);
    }
    const troopIds = battleTroopIds(this.engine, event.pages[runtime.pageIndex]?.list ?? []);
    for (const troopId of troopIds) this.prefetchBattle(event.id, troopId);
  }

  endForming(event, runtime, setting, reason) {
    runtime.moveSpeed = setting.beforeSpeed; runtime.moveFrequency = setting.beforeFrequency;
    this.traceChase('lost', event, runtime, { reason, distance: this.distanceToPlayer(runtime) });
  }

  prefetchBattle(eventId, troopId) {
    const key = `${this.mapId},${eventId}:${troopId}`;
    if (this.prefetches.has(key)) return this.prefetches.get(key).promise;
    const paths = this.engine.database.prefetchManifest?.battles?.[troopId]?.assets ?? [];
    const status = { key, eventId, troopId, priority: 'HIGH', state: 'pending', assets: paths.length, requestedAt: Date.now() };
    const promise = Promise.resolve(this.engine.prefetch?.prefetchAssets?.(paths, { priority: 1, reason: `symbol-chase:${this.mapId}:${eventId}:${troopId}` }))
      .then((result) => { status.state = 'ready'; status.readyAt = Date.now(); return result; }, (error) => { status.state = 'failed'; status.error = error.message; throw error; });
    status.promise = promise;
    this.prefetches.set(key, status);
    return promise;
  }

  tryMove(event, runtime, direction, { changeDirection = true, blockedRegions = runtime.symbolId == null ? [] : SYMBOL_SETTINGS[runtime.symbolId].blockedRegions } = {}) {
    const vector = DIRECTIONS[direction];
    if (!vector) { runtime.stopCount = 0; return false; }
    if (changeDirection && direction % 2 === 0 && !runtime.directionFix) runtime.direction = direction;
    const [dx, dy] = vector; const targetX = runtime.x + dx; const targetY = runtime.y + dy;
    const passable = runtime.through || this.eventPassable(event.id, runtime.x, runtime.y, targetX, targetY, direction, blockedRegions);
    if (!passable) {
      runtime.stopCount = 0;
      this.lastCollision = { at: Date.now(), mapId: this.mapId, mover: `event:${event.id}`, from: [runtime.x, runtime.y], target: [targetX, targetY], direction };
      if (runtime.trigger === 2 && this.playerCharacterAt(targetX, targetY)) this.startEvent(event, 'event-touch', this.contactIndexAt(targetX, targetY));
      return false;
    }
    runtime.x = targetX; runtime.y = targetY; runtime.stopCount = 0;
    this.traceChase(runtime.symbolForming ? 'step' : 'autonomous-step', event, runtime, { direction });
    if (runtime.trigger === 2 && this.playerCharacterAt(targetX, targetY)) this.startEvent(event, 'event-touch', this.contactIndexAt(targetX, targetY));
    return true;
  }

  eventPassable(eventId, x, y, targetX, targetY, direction, blockedRegions = []) {
    if (direction % 2 === 1) {
      const dx = targetX - x; const dy = targetY - y;
      const horizontal = dx < 0 ? 4 : 6; const vertical = dy < 0 ? 8 : 2;
      return (this.eventCardinalPassable(eventId, x, y, x + dx, y, horizontal, blockedRegions)
          && this.eventCardinalPassable(eventId, x + dx, y, targetX, targetY, vertical, blockedRegions))
        || (this.eventCardinalPassable(eventId, x, y, x, y + dy, vertical, blockedRegions)
          && this.eventCardinalPassable(eventId, x, y + dy, targetX, targetY, horizontal, blockedRegions));
    }
    return this.eventCardinalPassable(eventId, x, y, targetX, targetY, direction, blockedRegions);
  }

  eventCardinalPassable(eventId, x, y, targetX, targetY, direction, blockedRegions = []) {
    if (!this.engine.collision?.passable(x, y, direction) || !this.engine.collision?.passable(targetX, targetY, reverse(direction))) return false;
    if (blockedRegions.includes(this.engine.collision.regionId(targetX, targetY))) return false;
    if (this.eventAt(targetX, targetY, { excludeId: eventId, anyPriority: true, nonThrough: true })) return false;
    if (this.playerCharacterAt(targetX, targetY)) return false;
    return true;
  }

  moveTowardPlayer(event, runtime, blockedRegions = []) {
    const sx = runtime.x - this.engine.state.x; const sy = runtime.y - this.engine.state.y;
    const horizontal = sx > 0 ? 4 : sx < 0 ? 6 : 0;
    const vertical = sy > 0 ? 8 : sy < 0 ? 2 : 0;
    const first = Math.abs(sx) > Math.abs(sy) ? horizontal : vertical;
    const second = first === horizontal ? vertical : horizontal;
    return (first && this.tryMove(event, runtime, first, { blockedRegions })) || (second && this.tryMove(event, runtime, second, { blockedRegions })) || false;
  }

  moveTypeTowardPlayer(event, runtime, blockedRegions = []) {
    if (this.distanceToPlayer(runtime) < 20) {
      const roll = this.randomInt(6);
      if (roll <= 3) return this.moveTowardPlayer(event, runtime, blockedRegions);
      if (roll === 4) return this.tryMove(event, runtime, [2, 4, 6, 8][this.randomInt(4)], { blockedRegions });
      return this.tryMove(event, runtime, runtime.direction, { blockedRegions });
    }
    return this.tryMove(event, runtime, [2, 4, 6, 8][this.randomInt(4)], { blockedRegions });
  }

  moveAwayFromPlayer(event, runtime, blockedRegions = []) {
    const sx = runtime.x - this.engine.state.x; const sy = runtime.y - this.engine.state.y;
    const horizontal = sx > 0 ? 6 : sx < 0 ? 4 : 0;
    const vertical = sy > 0 ? 2 : sy < 0 ? 8 : 0;
    const first = Math.abs(sx) > Math.abs(sy) ? horizontal : vertical;
    const second = first === horizontal ? vertical : horizontal;
    return (first && this.tryMove(event, runtime, first, { blockedRegions })) || (second && this.tryMove(event, runtime, second, { blockedRegions })) || false;
  }

  eventAt(x, y, { excludeId = 0, anyPriority = false, nonThrough = false } = {}) {
    for (const event of Object.values(this.map?.events ?? {})) {
      if (!event || event.id === excludeId) continue;
      const runtime = this.refresh(event);
      if (!runtime || runtime.erased || runtime.transparent) continue;
      if (nonThrough && runtime.through) continue;
      if (!anyPriority && runtime.priority !== 1) continue;
      if (runtime.x === x && runtime.y === y) return { event, runtime };
    }
    return null;
  }

  blocksPlayer(x, y) { return Boolean(this.eventAt(x, y, { nonThrough: true })); }

  playerTouch(x, y, reason = 'player-touch') {
    const candidates = [];
    for (const event of Object.values(this.map?.events ?? {})) {
      if (!event) continue;
      const runtime = this.refresh(event);
      if (runtime && runtime.x === x && runtime.y === y && [1, 2].includes(runtime.trigger)) candidates.push({ event, runtime });
    }
    const candidate = candidates.find(({ runtime }) => runtime.priority === 1) ?? candidates[0];
    if (candidate) return this.startEvent(candidate.event, reason, 0);
    return false;
  }

  actionTrigger() {
    const [dx, dy] = DIRECTIONS[this.engine.state.direction] ?? [0, 1];
    const positions = [[this.engine.state.x, this.engine.state.y], [this.engine.state.x + dx, this.engine.state.y + dy]];
    for (const [x, y] of positions) {
      const found = this.eventAt(x, y, { anyPriority: true });
      if (found?.runtime.trigger === 0 && this.startEvent(found.event, 'action', 0)) return true;
    }
    return false;
  }

  startEvent(event, reason, contactIndex = 0) {
    const runtime = this.refresh(event);
    if (!runtime || runtime.starting || this.busy || this.engine.interpreter.running || this.engine.state.scene !== 'PLAYING') return false;
    runtime.starting = true; runtime.locked = true; runtime.prelockDirection = runtime.direction;
    if (runtime.symbolId == null && !runtime.directionFix) runtime.direction = directionToward(runtime.x, runtime.y, this.engine.state.x, this.engine.state.y, runtime.direction);
    const contactCondition = runtime.symbolId == null ? 0 : this.contactCondition(runtime, contactIndex);
    this.activeEventId = event.id;
    this.lastEncounter = { at: Date.now(), mapId: this.mapId, eventId: event.id, reason, contactIndex, contactCondition, symbolId: runtime.symbolId, phase: 'resource-barrier' };
    this.traceChase('contact', event, runtime, { reason, contactIndex, contactCondition });
    this.busy = true;
    void this.runEvent(event, runtime).catch((error) => this.engine.handleInterpreterFailure?.(error)).finally(() => {
      runtime.starting = false; runtime.locked = false;
      if (!runtime.directionFix && runtime.prelockDirection) runtime.direction = runtime.prelockDirection;
      this.busy = false; this.activeEventId = null;
    });
    return true;
  }

  async runEvent(event, runtime) {
    const renderable = this.engine.currentRenderableEvents(this.map).filter((entry) => entry.id === event.id);
    await this.engine.renderer.ensureEventGraphics?.(renderable);
    if (this.lastEncounter?.eventId === event.id) this.lastEncounter.phase = 'interpreter';
    await this.engine.interpreter.run(event.pages[runtime.pageIndex]?.list ?? [], { eventId: event.id, trigger: runtime.trigger, encounter: this.lastEncounter });
    if (this.lastEncounter?.eventId === event.id) this.lastEncounter.phase = 'complete';
  }

  contactCondition(runtime, contactIndex = 0) {
    if (contactIndex > 0) {
      const visible = this.visibleFollowers();
      return contactIndex === visible.length ? 2 : 0;
    }
    const px = Number(this.engine.state.realX ?? this.engine.state.x); const py = Number(this.engine.state.realY ?? this.engine.state.y);
    const ex = Number(runtime.realX ?? runtime.x); const ey = Number(runtime.realY ?? runtime.y);
    let position = -1;
    if (px === ex) position = py > ey ? 1 : 0;
    else if (py === ey) position = px > ex ? 2 : 3;
    if (position < 0 || runtime.direction !== this.engine.state.direction) return 0;
    if (runtime.direction === 2) return position === 0 ? 1 : 2;
    if (runtime.direction === 4) return position === 2 ? 1 : 2;
    if (runtime.direction === 6) return position === 3 ? 1 : 2;
    if (runtime.direction === 8) return position === 1 ? 1 : 2;
    return 0;
  }

  battleContext() {
    if (!this.activeEventId || !this.lastEncounter) return null;
    return { eventId: this.activeEventId, contactCondition: this.lastEncounter.contactCondition, preemptive: this.lastEncounter.contactCondition === 1, surprise: this.lastEncounter.contactCondition === 2 };
  }

  playerCharacterAt(x, y) {
    if (this.engine.state.x === x && this.engine.state.y === y) return true;
    return this.visibleFollowers().some((follower) => follower.x === x && follower.y === y);
  }

  contactIndexAt(x, y) {
    if (this.engine.state.x === x && this.engine.state.y === y) return 0;
    const index = this.visibleFollowers().findIndex((follower) => follower.x === x && follower.y === y);
    return index < 0 ? 0 : index + 1;
  }

  visibleFollowers() { return (this.engine.state.followers ?? []).filter((entry) => entry && entry.visible !== false); }
  distanceToPlayer(runtime) { return Math.abs(runtime.x - this.engine.state.x) + Math.abs(runtime.y - this.engine.state.y); }
  moving(runtime) { return Math.abs(Number(runtime.realX) - Number(runtime.x)) > 1e-6 || Math.abs(Number(runtime.realY) - Number(runtime.y)) > 1e-6; }
  nearScreen(runtime) {
    const centerX = Number(this.engine.state.displayX ?? 0) + 10;
    const centerY = Number(this.engine.state.displayY ?? 0) + 7.5;
    return Math.abs(Number(runtime.realX) - centerX) <= 12 && Math.abs(Number(runtime.realY) - centerY) <= 8;
  }
  stealthActive() { return Number(this.engine.state.stealthCount ?? 0) !== 0 || Boolean(this.engine.state.stealth); }
  updateStealthOpacity(interpreterBusy) {
    if (this.stealthActive() && !interpreterBusy) this.engine.state.opacity = 128;
    else if (this.engine.state.opacity === 128) this.engine.state.opacity = Number(this.engine.state.originOpacity ?? 255);
  }
  playerLevel(type) {
    const levels = (this.engine.state.party?.members ?? []).map((id) => Number(this.engine.state.actors?.[id]?.level ?? 1));
    if (!levels.length) return 1;
    if (type === 1) return Math.max(...levels);
    if (type === 2) return levels[0];
    return levels.reduce((sum, level) => sum + level, 0) / levels.length;
  }
  randomInt(max) {
    let seed = Number(this.engine.state.mapRngSeed ?? (0x6d2b79f5 ^ this.mapId)) >>> 0;
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    this.engine.state.mapRngSeed = seed >>> 0;
    return Math.floor((this.engine.state.mapRngSeed / 0x100000000) * max);
  }
  traceChase(type, event, runtime, detail = {}) {
    this.chaseTrace.push({ at: Date.now(), type, mapId: this.mapId, eventId: event.id, x: runtime.x, y: runtime.y, playerX: this.engine.state.x, playerY: this.engine.state.y, ...detail });
    this.chaseTrace = this.chaseTrace.slice(-120);
  }
  diagnostics() {
    const current = Object.values(this.map?.events ?? {}).flatMap((event) => {
      if (!event) return [];
      const runtime = this.runtime(event.id, event);
      return [{ id: event.id, pageIndex: runtime.pageIndex, x: runtime.x, y: runtime.y, realX: runtime.realX, realY: runtime.realY, moveType: runtime.moveType, speed: runtime.moveSpeed, frequency: runtime.moveFrequency, trigger: runtime.trigger, priority: runtime.priority, through: runtime.through, symbolId: runtime.symbolId, forming: runtime.symbolForming, starting: runtime.starting }];
    });
    return { mapId: this.mapId, busy: this.busy, activeEventId: this.activeEventId ?? null, lastCollision: this.lastCollision, lastEncounter: this.lastEncounter, chaseTrace: [...this.chaseTrace], pageRefreshes: [...this.pageRefreshes], battlePrefetch: [...this.prefetches.values()].map(({ promise, ...entry }) => entry), events: current };
  }
}

export function stopCountThreshold(moveFrequency) { return 30 * (5 - Number(moveFrequency ?? 3)); }
export function symbolIdFromPage(page) {
  return symbolIdFromMoveRoute(page);
}

function activePageIndex(engine, event) {
  for (let index = (event.pages?.length ?? 0) - 1; index >= 0; index -= 1) if (engine.conditionsMet(event.pages[index].condition, event.id)) return index;
  return -1;
}
function isUninhibited(event, page) {
  if (/<uninhibited>/i.test(String(event.name ?? ''))) return true;
  return (page.list ?? []).filter((command) => command.code === 108 || command.code === 408).some((command) => /<uninhibited>/i.test(String(command.parameters?.[0] ?? '')));
}
function battleTroopIds(engine, list, depth = 2, seen = new Set()) {
  const ids = [];
  for (const command of list ?? []) {
    const parameters = command.parameters ?? [];
    if (command.code === 301) {
      if (parameters[0] === 0) ids.push(Number(parameters[1]));
      else if (parameters[0] === 1) ids.push(Number(engine.state.variables?.[parameters[1]] ?? 0));
    }
    if (command.code === 117 && depth > 0 && !seen.has(parameters[0])) {
      seen.add(parameters[0]);
      ids.push(...battleTroopIds(engine, engine.database.commonEvents?.[parameters[0]]?.list, depth - 1, seen));
    }
  }
  return [...new Set(ids.filter((id) => id > 0))];
}
function directionToward(x, y, targetX, targetY, fallback = 2) {
  const sx = x - targetX; const sy = y - targetY;
  if (Math.abs(sx) > Math.abs(sy)) return sx > 0 ? 4 : sx < 0 ? 6 : fallback;
  return sy > 0 ? 8 : sy < 0 ? 2 : fallback;
}
function reverse(direction) { return 10 - Number(direction); }
function approach(current, target, distance) { return current < target ? Math.min(current + distance, target) : current > target ? Math.max(current - distance, target) : target; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
