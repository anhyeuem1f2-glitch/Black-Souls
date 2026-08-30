export class EventInterpreter {
  constructor(engine) {
    this.engine = engine;
    this.running = false;
  }

  async run(list, context = {}) {
    if (this.running) return;
    this.running = true;
    const labels = new Map(list.flatMap((command, index) => command.code === 118 ? [[String(command.parameters?.[0] ?? ''), index]] : []));
    let cursor = 0;
    try {
      while (cursor < list.length) {
        const result = await this.executeRange(list, cursor, list.length, context, labels);
        if (result?.exit || result?.jumpIndex == null) break;
        cursor = result.jumpIndex;
      }
    } finally {
      this.running = false;
      if (this.engine.consumePendingAutorun()) queueMicrotask(() => this.engine.runAutorunEvents());
    }
  }

  async executeRange(list, start, end, context, labels) {
    for (let index = start; index < end; index += 1) {
      const command = list[index];
      const parameters = command.parameters ?? [];
      switch (command.code) {
        case 0: break;
        case 101: {
          const lines = [];
          while (list[index + 1]?.code === 401) lines.push(String(list[++index].parameters?.[0] ?? ''));
          await this.engine.showMessage(lines.join('\n'), { face: parameters[0], faceIndex: parameters[1], background: parameters[2], position: parameters[3] });
          break;
        }
        case 102: {
          const options = parameters[0] ?? [];
          const choice = await this.engine.showChoice(options.map((item) => String(item)), { cancelType: parameters[1] });
          const boundary = findChoiceBoundary(list, index, command.indent, end);
          const branch = boundary.branches.find((item) => item.choice === choice) ?? boundary.branches.find((item) => item.cancel && choice < 0);
          if (branch) {
            const result = await this.executeRange(list, branch.start, branch.end, context, labels);
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
          const result = await this.executeRange(list, branchStart, branchEnd, context, labels);
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
          await this.engine.transfer(parameters[1], parameters[2], parameters[3], parameters[4]);
          break;
        case 205: this.applyMoveRoute(parameters[0], parameters[1]); break;
        case 221: await this.engine.renderer.fadeTo(1); break;
        case 222: await this.engine.renderer.fadeTo(0); break;
        case 230: await wait((parameters[0] ?? 1) * 1000 / 60); break;
        case 212: await this.engine.showAnimation(parameters[0], parameters[1]); break;
        case 213: await this.engine.showBalloon(parameters[0], parameters[1]); break;
        case 250: await this.engine.playSe(parameters[0]); break;
        case 303: await this.engine.nameInput(parameters[0], parameters[1]); break;
        case 320: this.engine.setActorName(parameters[0], String(parameters[1] ?? '')); break;
        case 355: {
          const lines = [String(parameters[0] ?? '')];
          while (list[index + 1]?.code === 655) lines.push(String(list[++index].parameters?.[0] ?? ''));
          this.engine.runRubyCompatibility(lines.join('\n'));
          break;
        }
        default: this.engine.noteUnsupported(command.code);
      }
    }
    return null;
  }

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
