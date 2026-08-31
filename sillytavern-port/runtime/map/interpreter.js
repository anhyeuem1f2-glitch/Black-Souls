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
          await this.suspend('message', this.engine.showMessage(lines.join('\n'), { face: parameters[0], faceIndex: parameters[1], background: parameters[2], position: parameters[3] }));
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
        case 119: {
          const target = labels.get(String(parameters[0] ?? ''));
          if (target == null) this.engine.noteUnsupported(119, `missing label ${parameters[0]}`);
          else return { jumpIndex: target };
          break;
        }
        case 121:
          for (let id = parameters[0]; id <= parameters[1]; id += 1) this.engine.state.switches[id] = parameters[2] === 0;
          break;
        case 122: this.controlVariables(parameters); break;
        case 123:
          this.engine.state.selfSwitches[`${this.engine.state.mapId},${context.eventId},${parameters[0]}`] = parameters[1] === 0;
          break;
        case 201:
          if (parameters[0] !== 0) throw new Error('Variable-based transfers are not implemented yet');
          await this.suspend('transfer', this.engine.transfer(parameters[1], parameters[2], parameters[3], parameters[4]));
          break;
        case 205: this.applyMoveRoute(parameters[0], parameters[1]); break;
        case 221: await this.suspend('fade', this.engine.renderer.fadeTo(1)); break;
        case 222: await this.suspend('fade', this.engine.renderer.fadeTo(0)); break;
        case 230: {
          const frames = parameters[0] ?? 1;
          await this.suspend('wait_count', this.engine.waitFrames ? this.engine.waitFrames(frames) : wait(frames * 1000 / 60));
          break;
        }
        case 212: await this.suspendVisual('animation', this.engine.showAnimation(parameters[0], parameters[1]), { targetId: parameters[0], animationId: parameters[1] }); break;
        case 213: await this.suspend('balloon', this.engine.showBalloon(parameters[0], parameters[1])); break;
        case 250: await this.suspend('audio', this.engine.playSe(parameters[0])); break;
        case 303: await this.suspend('name_input', this.engine.nameInput(parameters[0], parameters[1]), { actorId: parameters[0], maxLength: parameters[1] }); break;
        case 320: this.engine.setActorName(parameters[0], String(parameters[1] ?? '')); break;
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
    else return this.engine.noteUnsupported(122, `operand ${operandType}`);
    for (let id = first; id <= last; id += 1) {
      const current = this.engine.state.variables[id] ?? 0;
      this.engine.state.variables[id] = operation === 0 ? value : operation === 1 ? current + value : operation === 2 ? current - value : operation === 3 ? current * value : operation === 4 ? Math.trunc(current / value) : current % value;
    }
  }

  applyMoveRoute(target, route) {
    if (target !== -1) return this.engine.noteUnsupported(205, 'non-player target');
    for (const command of route?.list ?? []) {
      if (command.code === 39) this.engine.state.transparent = true;
      else if (command.code === 40) this.engine.state.transparent = false;
      else if (command.code !== 0) this.engine.noteUnsupported(205, `move command ${command.code}`);
    }
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

function wait(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

let interpreterSequence = 0;

function summarizeParameters(parameters) {
  const summary = JSON.stringify(parameters);
  return summary.length > 180 ? `${summary.slice(0, 177)}...` : summary;
}
