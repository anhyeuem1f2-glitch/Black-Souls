export class EventInterpreter {
  constructor(engine) {
    this.engine = engine;
    this.running = false;
    this.instanceId = ++interpreterSequence;
    this.traceEnabled = engine.interpreterTraceEnabled === true;
    this.traceLog = [];
    this.current = null;
    this.lastProgressAt = 0;
    this.stallReportedFor = null;
  }

  async run(list, context = {}) {
    if (this.running) {
      this.record('RUN_REJECTED_ALREADY_RUNNING', { requestedEventId: context.eventId ?? 0 });
      this.engine.recordDiagnostic?.({ type: 'interpreter-run-rejected', interpreterId: this.instanceId, requestedEventId: context.eventId ?? 0, current: this.snapshot() });
      return;
    }
    this.running = true;
    const labels = new Map(list.flatMap((command, index) => command.code === 118 ? [[String(command.parameters?.[0] ?? ''), index]] : []));
    let cursor = 0;
    this.current = {
      mapId: this.engine.state.mapId,
      eventId: context.eventId ?? 0,
      index: 0,
      code: list[0]?.code ?? 0,
      waitMode: '',
      waitStartedAt: null,
      rangeDepth: 0,
      startedAt: Date.now(),
    };
    this.progress(0, list[0]?.code ?? 0, 'RUN_START');
    try {
      while (cursor < list.length) {
        const result = await this.executeRange(list, cursor, list.length, context, labels);
        if (result?.exit || result?.jumpIndex == null) break;
        cursor = result.jumpIndex;
      }
    } catch (error) {
      const failure = { type: 'interpreter-command-failed', interpreterId: this.instanceId, ...this.snapshot(), error: error.message };
      this.record('COMMAND_FAILED', { error: error.message });
      this.engine.recordDiagnostic?.(failure);
      throw error;
    } finally {
      this.record('RUN_END', { nextIndex: this.current?.index ?? cursor });
      this.running = false;
      if (this.current) {
        this.current.waitMode = '';
        this.current.waitStartedAt = null;
        this.current.finishedAt = Date.now();
      }
      if (this.engine.consumePendingAutorun()) queueMicrotask(() => {
        void this.engine.runAutorunEvents().catch((error) => this.engine.handleInterpreterFailure?.(error, this.snapshot()));
      });
    }
  }

  async executeRange(list, start, end, context, labels, depth = 0) {
    for (let index = start; index < end; index += 1) {
      const command = list[index];
      const parameters = command.parameters ?? [];
      if (index === start || index % 12 === 0 || command.code === 221) this.engine.prefetch?.scanUpcoming(list, index + 1);
      this.current.rangeDepth = depth;
      this.progress(index, command.code, 'COMMAND_START', { parameters: summarizeParameters(parameters) });
      switch (command.code) {
        case 0: break;
        case 101: {
          const lines = [];
          while (list[index + 1]?.code === 401) lines.push(String(list[++index].parameters?.[0] ?? ''));
          const choiceAttached = list[index + 1]?.code === 102;
          const message = this.engine.showMessage(lines.join('\n'), { face: parameters[0], faceIndex: parameters[1], background: parameters[2], position: parameters[3], choiceAttached });
          if (choiceAttached) await message;
          else await this.suspend('message', message);
          break;
        }
        case 102: {
          const options = parameters[0] ?? [];
          const choice = await this.suspend('choice', this.engine.showChoice(options.map((item) => String(item)), { cancelType: parameters[1] }));
          const boundary = findChoiceBoundary(list, index, command.indent, end);
          const branch = boundary.branches.find((item) => item.choice === choice) ?? boundary.branches.find((item) => item.cancel && choice < 0);
          if (branch) {
            const result = await this.executeRange(list, branch.start, branch.end, context, labels, depth + 1);
            if (result?.jumpIndex != null || result?.exit) return result;
          }
          index = boundary.end;
          break;
        }
        case 108:
        case 118:
        case 401:
        case 402:
        case 403:
        case 404:
        case 408:
        case 411:
        case 412:
        case 505:
        case 655:
          break;
        case 111: {
          const boundary = findConditionalBoundary(list, index, command.indent, end);
          const matched = this.evaluateCondition(parameters, context);
          const branchStart = matched ? index + 1 : boundary.elseIndex == null ? boundary.end : boundary.elseIndex + 1;
          const branchEnd = matched ? boundary.elseIndex ?? boundary.end : boundary.end;
          const result = await this.executeRange(list, branchStart, branchEnd, context, labels, depth + 1);
          if (result?.jumpIndex != null || result?.exit) return result;
          index = boundary.end;
          break;
        }
        case 115: return { exit: true };
        case 117: {
          const commonId = Number(firstParam(parameters)); const common = this.engine.database?.commonEvents?.[commonId];
          if (!common?.list) { this.engine.noteUnsupported(117, `common event ${commonId}`); break; }
          const commonLabels = new Map(common.list.flatMap((entry, entryIndex) => entry.code === 118 ? [[String(entry.parameters?.[0] ?? ''), entryIndex]] : []));
          const result = await this.executeRange(common.list, 0, common.list.length, { ...context, commonEventId: commonId }, commonLabels, depth + 1);
          if (result?.exit) break;
          break;
        }
        case 119: {
          const target = labels.get(String(parameters[0] ?? ''));
          if (target == null) this.engine.noteUnsupported(119, `missing label ${parameters[0]}`);
          else return { jumpIndex: target };
          break;
        }
        case 121:
          for (let id = parameters[0]; id <= parameters[1]; id += 1) this.engine.state.switches[id] = parameters[2] === 0;
          await this.suspendVisual('resource', this.engine.refreshCurrentMapVisuals?.('switch-change') ?? Promise.resolve(), { reason: 'switch-change', first: parameters[0], last: parameters[1] });
          break;
        case 122: this.controlVariables(parameters); break;
        case 123:
          this.engine.state.selfSwitches[`${this.engine.state.mapId},${context.eventId},${parameters[0]}`] = parameters[1] === 0;
          await this.suspendVisual('resource', this.engine.refreshCurrentMapVisuals?.('self-switch-change') ?? Promise.resolve(), { reason: 'self-switch-change', eventId: context.eventId, selfSwitch: parameters[0] });
          break;
        case 125: this.engine.gainGold?.(this.operandValue(parameters[1], parameters[2], parameters[3]) * (parameters[0] === 0 ? 1 : -1)); break;
        case 126: this.changeInventory('item', parameters); break;
        case 127: this.changeInventory('weapon', parameters); break;
        case 128: this.changeInventory('armor', parameters); break;
        case 129: await this.suspendVisual('resource', this.changePartyMember(parameters), { operation: 'party-member', actorId: parameters[0] }); break;
        case 132: this.engine.changeBattleBgm?.(parameters[0]); break;
        case 134: this.engine.state.system ??= {}; this.engine.state.system.saveDisabled = parameters[0] !== 0; break;
        case 135: this.engine.state.system ??= {}; this.engine.state.system.menuDisabled = parameters[0] !== 0; break;
        case 136: this.engine.state.system ??= {}; this.engine.state.system.encounterDisabled = parameters[0] !== 0; break;
        case 137: this.engine.state.system ??= {}; this.engine.state.system.formationDisabled = parameters[0] !== 0; break;
        case 201:
          if (parameters[0] !== 0) throw new Error('Variable-based transfers are not implemented yet');
          await this.suspend('resource', this.engine.transferWithRecovery?.(parameters[1], parameters[2], parameters[3], parameters[4]) ?? this.engine.transfer(parameters[1], parameters[2], parameters[3], parameters[4]), { operation: 'transfer', mapId: parameters[1] });
          break;
        case 205: await this.applyMoveRoute(parameters[0], parameters[1], context); break;
        case 211: this.engine.state.transparent = Boolean(firstParam(parameters)); break;
        case 221: await this.suspend('fade', this.engine.renderer.fadeTo(1)); break;
        case 222: await this.suspend('fade', this.engine.renderer.fadeTo(0)); break;
        case 230: {
          const frames = firstParam(parameters) ?? 1;
          await this.suspend('wait_count', this.engine.waitFrames ? this.engine.waitFrames(frames) : wait(frames * 1000 / 60));
          break;
        }
        case 212: await this.suspendVisual('animation', this.engine.showAnimation(parameters[0], parameters[1]), { targetId: parameters[0], animationId: parameters[1] }); break;
        case 213: await this.suspend('balloon', this.engine.showBalloon(parameters[0], parameters[1])); break;
        case 223: await this.suspend('screen_tint', this.engine.tintScreen?.(parameters[0], parameters[1]) ?? Promise.resolve()); break;
        case 224: await this.suspend('screen_flash', this.engine.flashScreen?.(parameters[0], parameters[1]) ?? Promise.resolve()); break;
        case 225: await this.suspend('screen_shake', this.engine.shakeScreen?.(parameters[0], parameters[1], parameters[2]) ?? Promise.resolve()); break;
        case 231: {
          const picture = pictureParameters(parameters);
          await this.suspendVisual('resource', this.engine.showPicture?.(parameters[0], String(parameters[1] ?? ''), picture) ?? Promise.resolve(), { pictureId: parameters[0], name: parameters[1] });
          break;
        }
        case 232: {
          const movement = this.engine.movePicture?.(parameters[0], pictureParameters(parameters)) ?? Promise.resolve();
          if (parameters[11]) await this.suspendVisual('picture', movement, { pictureId: parameters[0] });
          break;
        }
        case 233: this.engine.movePicture?.(parameters[0], { angleSpeed: parameters[1] }); break;
        case 234: this.engine.movePicture?.(parameters[0], { tone: parameters[1], duration: parameters[2] }); break;
        case 235: this.engine.erasePicture?.(firstParam(parameters)); break;
        case 236: await this.suspend('weather', this.engine.setWeather?.(parameters[0], parameters[1], parameters[2]) ?? Promise.resolve()); break;
        case 241: await this.suspendVisual('resource', this.engine.playBgm?.(parameters[0]) ?? Promise.resolve(), { channel: 'bgm', name: parameters[0]?.name }); break;
        case 242: this.engine.stopAudio?.('bgm'); break;
        case 243: this.engine.saveBgm?.(); break;
        case 244: await this.suspendVisual('resource', this.engine.replayBgm?.() ?? Promise.resolve(), { channel: 'bgm', operation: 'replay' }); break;
        case 245: await this.suspendVisual('resource', this.engine.playBgs?.(parameters[0]) ?? Promise.resolve(), { channel: 'bgs', name: parameters[0]?.name }); break;
        case 246: this.engine.stopAudio?.('bgs'); break;
        case 249: await this.suspendVisual('audio', this.engine.playMe?.(parameters[0]) ?? Promise.resolve(), { channel: 'me', name: parameters[0]?.name }); break;
        case 250: await this.suspend('audio', this.engine.playSe(parameters[0])); break;
        case 251: this.engine.stopSe?.(); break;
        case 281: this.engine.state.mapNameDisplay = parameters[0] === 0; break;
        case 301: {
          const troopId = this.engine.resolveBattleTroop?.(parameters) ?? (parameters[0] === 0 ? Number(parameters[1]) : 0);
          if (!troopId) { this.engine.noteUnsupported(301, 'no eligible troop'); break; }
          const outcome = await this.suspend('battle', this.engine.startBattle(troopId, parameters[2], parameters[3]), { troopId });
          const boundary = findBattleBoundary(list, index, command.indent, end);
          const marker = ({ victory: 601, escape: 602, lose: 603, gameover: 603 })[outcome];
          const branch = boundary.branches.find((item) => item.code === marker);
          if (branch) {
            const result = await this.executeRange(list, branch.start, branch.end, context, labels, depth + 1);
            if (result?.jumpIndex != null || result?.exit) return result;
          }
          index = boundary.end;
          break;
        }
        case 302: {
          const goods = [parameters];
          while (list[index + 1]?.code === 605) goods.push(list[++index].parameters ?? []);
          await this.suspend('shop', this.engine.openShop(goods, Boolean(parameters[4])));
          break;
        }
        case 303: await this.suspend('name_input', this.engine.nameInput(parameters[0], parameters[1]), { actorId: parameters[0], maxLength: parameters[1] }); break;
        case 314: for (const actorId of this.actorTargets(parameters)) this.engine.recoverActor?.(actorId); break;
        case 315: {
          const amount = this.operandValue(parameters[3], parameters[4]) * (parameters[2] === 0 ? 1 : -1);
          for (const actorId of this.actorTargets(parameters)) this.engine.changeActorExp?.(actorId, amount);
          break;
        }
        case 316: {
          const amount = this.operandValue(parameters[3], parameters[4]) * (parameters[2] === 0 ? 1 : -1);
          for (const actorId of this.actorTargets(parameters)) this.engine.changeActorLevel?.(actorId, amount);
          break;
        }
        case 318: for (const actorId of this.actorTargets(parameters)) this.engine.changeActorSkill?.(actorId, parameters[2], parameters[3]); break;
        case 319: this.engine.changeActorEquipment?.(parameters[0], parameters[1], parameters[2]); break;
        case 320: this.engine.setActorName(parameters[0], String(parameters[1] ?? '')); break;
        case 321: this.engine.changeActorClass?.(parameters[0], parameters[1], Boolean(parameters[2])); break;
        case 322: await this.suspendVisual('resource', this.engine.setActorGraphic?.(parameters[0], parameters[1], parameters[2], parameters[3], parameters[4]) ?? Promise.resolve(), { actorId: parameters[0], graphic: parameters[1] }); break;
        case 353: this.engine.setScene?.('GAMEOVER'); break;
        case 354: await this.engine.enterTitle?.(); return { exit: true };
        case 351: await this.suspend('menu', this.engine.openMenuFromEvent()); break;
        case 355: {
          const lines = [String(parameters[0] ?? '')];
          while (list[index + 1]?.code === 655) lines.push(String(list[++index].parameters?.[0] ?? ''));
          this.engine.runRubyCompatibility(lines.join('\n'));
          break;
        }
        default: this.engine.noteUnsupported(command.code);
      }
      this.current.rangeDepth = depth;
      this.progress(index + 1, list[index + 1]?.code ?? 0, 'COMMAND_END', { completedIndex: index, completedCode: command.code });
    }
    return null;
  }

  async suspend(waitMode, promise, detail = {}) {
    this.current.waitMode = waitMode;
    this.current.waitStartedAt = Date.now();
    this.record('SUSPEND', detail);
    try {
      const result = await promise;
      this.record('RESUME', detail);
      return result;
    } finally {
      this.current.waitMode = '';
      this.current.waitStartedAt = null;
      this.lastProgressAt = Date.now();
      this.stallReportedFor = null;
    }
  }

  async suspendVisual(waitMode, promise, detail = {}) {
    try {
      return await this.suspend(waitMode, promise, detail);
    } catch (error) {
      const failure = { type: 'visual-command-failed-continuing', interpreterId: this.instanceId, ...this.snapshot(), waitMode, error: error.message, ...detail };
      this.record('VISUAL_FAILURE_CONTINUE', failure);
      this.engine.recordDiagnostic?.(failure);
      console.warn('[BLACK SOULS] Visual event command failed; event logic will continue.', failure);
      return null;
    }
  }

  progress(index, code, result, detail = {}) {
    if (this.current) {
      this.current.index = index;
      this.current.code = code;
    }
    this.lastProgressAt = Date.now();
    this.stallReportedFor = null;
    this.record(result, detail);
  }

  updateWatchdog(now = Date.now()) {
    if (!this.traceEnabled || !this.running || this.current?.waitMode || now - this.lastProgressAt < 4000) return;
    const key = `${this.current?.mapId}:${this.current?.eventId}:${this.current?.index}:${this.current?.code}`;
    if (this.stallReportedFor === key) return;
    this.stallReportedFor = key;
    const entry = { type: 'INTERPRETER_STALL', interpreterId: this.instanceId, ...this.snapshot() };
    this.engine.recordDiagnostic?.(entry);
    console.warn('[BLACK SOULS]', entry);
  }

  record(result, detail = {}) {
    const entry = { at: new Date().toISOString(), interpreterId: this.instanceId, ...this.snapshot(), result, ...detail };
    this.traceLog.push(entry);
    this.traceLog = this.traceLog.slice(-120);
    if (this.traceEnabled) console.debug('[BLACK SOULS interpreter]', entry);
  }

  snapshot() {
    return {
      running: this.running,
      mapId: this.current?.mapId ?? this.engine.state?.mapId ?? null,
      eventId: this.current?.eventId ?? null,
      index: this.current?.index ?? null,
      code: this.current?.code ?? null,
      waitMode: this.current?.waitMode ?? '',
      waitStartedAt: this.current?.waitStartedAt ?? null,
      rangeDepth: this.current?.rangeDepth ?? 0,
    };
  }

  diagnostics() { return { id: this.instanceId, ...this.snapshot(), traceEnabled: this.traceEnabled, trace: this.traceEnabled ? [...this.traceLog] : [] }; }

  evaluateCondition(parameters, context) {
    const type = parameters[0];
    if (type === 0) return Boolean(this.engine.state.switches[parameters[1]]) === (parameters[2] === 0);
    if (type === 1) {
      const left = this.engine.state.variables[parameters[1]] ?? 0;
      const right = parameters[2] === 0 ? parameters[3] : this.engine.state.variables[parameters[3]] ?? 0;
      return [left === right, left >= right, left <= right, left > right, left < right, left !== right][parameters[4]] ?? false;
    }
    if (type === 2) return Boolean(this.engine.state.selfSwitches[`${this.engine.state.mapId},${context.eventId},${parameters[1]}`]) === (parameters[2] === 0);
    if (type === 4 && parameters[2] === 1) return (this.engine.state.actors[parameters[1]]?.name ?? '') === String(parameters[3] ?? '');
    if (type === 12) return this.engine.evaluateRubyCondition(String(parameters[1] ?? ''));
    this.engine.noteUnsupported(111, `condition ${type}`);
    return false;
  }

  controlVariables(parameters) {
    const [first, last, operation, operandType, ...operand] = parameters;
    let value = 0;
    if (operandType === 0) value = operand[0];
    else if (operandType === 1) value = this.engine.state.variables[operand[0]] ?? 0;
    else if (operandType === 2) value = randomInteger(Number(operand[0]), Number(operand[1]));
    else if (operandType === 3) value = this.gameDataOperand(operand[0], operand[1], operand[2]);
    else return this.engine.noteUnsupported(122, `operand ${operandType}`);
    for (let id = first; id <= last; id += 1) {
      const current = this.engine.state.variables[id] ?? 0;
      this.engine.state.variables[id] = operation === 0 ? value : operation === 1 ? current + value : operation === 2 ? current - value : operation === 3 ? current * value : operation === 4 ? Math.trunc(current / value) : current % value;
    }
  }

  gameDataOperand(type, first, second) {
    if (type === 0) return this.engine.party?.quantity?.(this.engine.state, 'item', first) ?? 0;
    if (type === 1) return this.engine.party?.quantity?.(this.engine.state, 'weapon', first) ?? 0;
    if (type === 2) return this.engine.party?.quantity?.(this.engine.state, 'armor', first) ?? 0;
    if (type === 3) {
      const actor = this.engine.state.actors?.[first]; const parameters = this.engine.party?.parameters?.(this.engine.state, first) ?? {};
      return [actor?.level, actor?.exp, actor?.hp, actor?.mp, parameters.mhp, parameters.mmp, parameters.atk, parameters.def, parameters.mat, parameters.mdf, parameters.agi, parameters.luk][second] ?? 0;
    }
    if (type === 5) {
      if (Number(first) === -1) return [this.engine.state.x, this.engine.state.y, this.engine.state.direction][second] ?? 0;
      const id = Number(first) === 0 ? this.current?.eventId : Number(first); const event = this.engine.map?.events?.[id];
      const override = this.engine.state.eventOverrides?.[`${this.engine.state.mapId},${id}`];
      return [override?.x ?? event?.x, override?.y ?? event?.y, override?.direction][second] ?? 0;
    }
    if (type === 6) return this.engine.state.party?.members?.[Number(first)] ?? 0;
    if (type === 7) return [
      this.engine.state.mapId, this.engine.state.party?.members?.length ?? 0, this.engine.state.party?.gold ?? 0,
      this.engine.state.steps ?? 0, Math.floor(this.engine.state.system?.playtimeSeconds ?? 0), Math.floor((this.engine.state.timer?.count ?? 0) / 60),
      this.engine.state.system?.saveCount ?? 0, this.engine.state.system?.battleCount ?? 0,
    ][first] ?? 0;
    this.engine.noteUnsupported(122, `game data ${type}:${first}:${second}`);
    return 0;
  }

  async applyMoveRoute(target, route, context = {}) {
    for (const command of route?.list ?? []) {
      const parameters = command.parameters ?? [];
      if (command.code >= 1 && command.code <= 8) {
        const movement = [[0, 0, 0], [0, 1, 2], [-1, 0, 4], [1, 0, 6], [0, -1, 8], [-1, 1, 1], [1, 1, 3], [-1, -1, 7], [1, -1, 9]][command.code];
        await this.engine.moveRouteStep?.(target, ...movement, context.eventId);
      }
      else if (command.code === 15) await (this.engine.waitFrames?.(Math.max(0, Number(parameters[0]) - 1)) ?? wait(Math.max(0, Number(parameters[0]) - 1) * 1000 / 60));
      else if (command.code >= 16 && command.code <= 19) this.engine.setRouteDirection?.(target, ({ 16: 2, 17: 4, 18: 6, 19: 8 })[command.code], context.eventId);
      else if (command.code === 27) this.engine.state.switches[parameters[0]] = true;
      else if (command.code === 28) this.engine.state.switches[parameters[0]] = false;
      else if (command.code === 29) this.engine.setRouteProperty?.(target, 'moveSpeed', Number(parameters[0]), context.eventId);
      else if (command.code === 30) this.engine.setRouteProperty?.(target, 'moveFrequency', Number(parameters[0]), context.eventId);
      else if (command.code === 37) this.engine.setRouteProperty?.(target, 'through', true, context.eventId);
      else if (command.code === 38) this.engine.setRouteProperty?.(target, 'through', false, context.eventId);
      else if (command.code === 39) this.engine.setRouteProperty?.(target, 'transparent', true, context.eventId);
      else if (command.code === 40) this.engine.setRouteProperty?.(target, 'transparent', false, context.eventId);
      else if (command.code === 41) {
        await this.suspendVisual('resource', this.engine.changeCharacterGraphic(target, command.parameters?.[0], command.parameters?.[1], context.eventId), { reason: 'move-route-graphic', target, name: command.parameters?.[0] });
      }
      else if (command.code === 42) this.engine.setRouteProperty?.(target, 'opacity', Number(parameters[0]), context.eventId);
      else if (command.code === 44) await this.engine.playSe?.(parameters[0]);
      else if (![0, 31, 32, 33, 34, 35, 36, 43].includes(command.code)) this.engine.noteUnsupported(205, `move command ${command.code}`);
    }
  }

  operandValue(type, value, fallback = 0) { return Number(type === 1 ? this.engine.state.variables[value] ?? 0 : value ?? fallback); }

  changeInventory(kind, parameters) {
    const id = parameters[0]; const operation = parameters[1]; const value = this.operandValue(parameters[2], parameters[3]);
    this.engine.gainItem?.(kind, id, value * (operation === 0 ? 1 : -1));
  }

  changePartyMember(parameters) {
    const [actorId, operation, initialize] = parameters;
    if (this.engine.changePartyMember) return this.engine.changePartyMember(actorId, operation, Boolean(initialize));
    this.engine.state.party ??= { members: [] }; const members = this.engine.state.party.members;
    if (operation === 0 && !members.includes(actorId)) members.push(actorId);
    if (operation === 1) this.engine.state.party.members = members.filter((id) => id !== actorId);
    return Promise.resolve();
  }

  actorTargets(parameters) {
    return parameters[0] === 0 ? [Number(parameters[1])] : [...(this.engine.state.party?.members ?? [])];
  }
}

function findConditionalBoundary(list, start, indent, end) {
  let elseIndex = null;
  for (let index = start + 1; index < end; index += 1) {
    if (list[index].indent !== indent) continue;
    if (list[index].code === 411) elseIndex = index;
    if (list[index].code === 412) return { elseIndex, end: index };
  }
  return { elseIndex, end: end - 1 };
}

function findChoiceBoundary(list, start, indent, end) {
  const markers = [];
  let finish = end - 1;
  for (let index = start + 1; index < end; index += 1) {
    if (list[index].indent !== indent) continue;
    if (list[index].code === 402) markers.push({ index, choice: list[index].parameters?.[0], cancel: false });
    if (list[index].code === 403) markers.push({ index, choice: -1, cancel: true });
    if (list[index].code === 404) { finish = index; break; }
  }
  return { end: finish, branches: markers.map((marker, index) => ({ ...marker, start: marker.index + 1, end: markers[index + 1]?.index ?? finish })) };
}

function findBattleBoundary(list, start, indent, end) {
  const markers = []; let finish = end - 1;
  for (let index = start + 1; index < end; index += 1) {
    if (list[index].indent !== indent) continue;
    if ([601, 602, 603].includes(list[index].code)) markers.push({ index, code: list[index].code });
    if (list[index].code === 604) { finish = index; break; }
  }
  return { end: finish, branches: markers.map((marker, index) => ({ ...marker, start: marker.index + 1, end: markers[index + 1]?.index ?? finish })) };
}

function pictureParameters(parameters) {
  return { origin: parameters[2] ?? 0, x: parameters[4] ?? 0, y: parameters[5] ?? 0, zoomX: parameters[6] ?? 100, zoomY: parameters[7] ?? 100, opacity: parameters[8] ?? 255, blend: parameters[9] ?? 0, duration: parameters[10] ?? 0 };
}

function firstParam(parameters) { return Array.isArray(parameters) ? parameters[0] : parameters; }

function wait(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
function randomInteger(minimum, maximum) {
  const low = Math.min(minimum, maximum); const high = Math.max(minimum, maximum);
  return low + Math.floor(Math.random() * (high - low + 1));
}

let interpreterSequence = 0;

function summarizeParameters(parameters) {
  const summary = JSON.stringify(parameters);
  return summary.length > 180 ? `${summary.slice(0, 177)}...` : summary;
}
