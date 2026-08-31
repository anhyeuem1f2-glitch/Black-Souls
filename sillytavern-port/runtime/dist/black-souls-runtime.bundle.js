/* BLACK SOULS browser runtime 0.6.0; source c601dae8d61f79e89a86cc47521602092de66962 */
(() => {
  // runtime/core/input.js
  var axes = /* @__PURE__ */ new Map([
    ["ArrowDown", [0, 1]],
    ["s", [0, 1]],
    ["ArrowLeft", [-1, 0]],
    ["a", [-1, 0]],
    ["ArrowRight", [1, 0]],
    ["d", [1, 0]],
    ["ArrowUp", [0, -1]],
    ["w", [0, -1]]
  ]);
  var keypad = /* @__PURE__ */ new Map([
    ["1", [-1, 1, 1]],
    ["3", [1, 1, 3]],
    ["7", [-1, -1, 7]],
    ["9", [1, -1, 9]],
    ["2", [0, 1, 2]],
    ["4", [-1, 0, 4]],
    ["6", [1, 0, 6]],
    ["8", [0, -1, 8]]
  ]);
  var directionNumber = /* @__PURE__ */ new Map([
    ["-1,1", 1],
    ["0,1", 2],
    ["1,1", 3],
    ["-1,0", 4],
    ["1,0", 6],
    ["-1,-1", 7],
    ["0,-1", 8],
    ["1,-1", 9]
  ]);
  var InputController = class {
    constructor(element, { windowRef = window, documentRef = document } = {}) {
      this.element = element;
      this.window = windowRef;
      this.document = documentRef;
      this.queue = [];
      this.held = /* @__PURE__ */ new Map();
      this.confirmed = false;
      this.cancelled = false;
      this.interacted = false;
      this.onKeyDown = (event) => {
        if (!this.ownsKeyboard(event)) return;
        const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
        if (axes.has(key)) {
          this.held.set(key, axes.get(key));
          this.enqueueHeldDirection();
          this.consume(event);
        } else if (keypad.has(key) && /^Numpad/.test(event.code || "")) {
          this.queue.push(keypad.get(key));
          this.consume(event);
        }
        if (["Enter", " ", "z"].includes(key)) {
          this.confirmed = true;
          this.interacted = true;
          this.consume(event);
        }
        if (["Escape", "x", "Insert"].includes(key)) {
          if (key === "Escape" && this.document.fullscreenElement) return;
          this.cancelled = true;
          this.interacted = true;
          this.consume(event);
        }
      };
      this.onKeyUp = (event) => {
        const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
        this.held.delete(key);
      };
      this.window.addEventListener("keydown", this.onKeyDown, true);
      this.window.addEventListener("keyup", this.onKeyUp, true);
    }
    ownsKeyboard(event) {
      const active = this.document.activeElement;
      if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return false;
      return active === this.element || this.element.contains?.(active) || event.target === this.element;
    }
    enqueueHeldDirection() {
      let dx = 0;
      let dy = 0;
      for (const [x, y] of this.held.values()) {
        dx += x;
        dy += y;
      }
      dx = Math.sign(dx);
      dy = Math.sign(dy);
      const direction = directionNumber.get(`${dx},${dy}`);
      if (direction) this.queue.push([dx, dy, direction]);
    }
    consume(event) {
      this.interacted = true;
      event.preventDefault();
      event.stopPropagation();
    }
    takeDirection() {
      return this.queue.shift() ?? null;
    }
    takeConfirm() {
      const value = this.confirmed;
      this.confirmed = false;
      return value;
    }
    takeCancel() {
      const value = this.cancelled;
      this.cancelled = false;
      return value;
    }
    takeInteraction() {
      const value = this.interacted;
      this.interacted = false;
      return value;
    }
    clear() {
      this.queue.length = 0;
      this.confirmed = false;
      this.cancelled = false;
      this.held.clear();
    }
    destroy() {
      this.window.removeEventListener("keydown", this.onKeyDown, true);
      this.window.removeEventListener("keyup", this.onKeyUp, true);
    }
  };

  // runtime/map/collision.js
  var directionBit = { 2: 1, 4: 2, 6: 4, 8: 8 };
  var CollisionMap = class {
    constructor(map, tileset) {
      this.map = map;
      this.flags = tileset?.flags?.data ?? [];
    }
    tile(x, y, z) {
      if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height) return 0;
      return this.map.data.data[x + y * this.map.width + z * this.map.width * this.map.height] ?? 0;
    }
    regionId(x, y) {
      return this.tile(x, y, 3) >> 8;
    }
    passable(x, y, direction) {
      if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height) return false;
      const bit = directionBit[direction];
      if (!bit) return true;
      for (let z = 2; z >= 0; z -= 1) {
        const tileId = this.tile(x, y, z);
        const flag = this.flags[tileId] ?? 0;
        if ((flag & 16) !== 0) continue;
        return (flag & bit) === 0;
      }
      return false;
    }
  };

  // runtime/map/interpreter.js
  var EventInterpreter = class {
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
        this.record("RUN_REJECTED_ALREADY_RUNNING", { requestedEventId: context.eventId ?? 0 });
        this.engine.recordDiagnostic?.({ type: "interpreter-run-rejected", interpreterId: this.instanceId, requestedEventId: context.eventId ?? 0, current: this.snapshot() });
        return;
      }
      this.running = true;
      const labels = new Map(list.flatMap((command, index) => command.code === 118 ? [[String(command.parameters?.[0] ?? ""), index]] : []));
      let cursor = 0;
      this.current = {
        mapId: this.engine.state.mapId,
        eventId: context.eventId ?? 0,
        index: 0,
        code: list[0]?.code ?? 0,
        waitMode: "",
        waitStartedAt: null,
        rangeDepth: 0,
        startedAt: Date.now()
      };
      this.progress(0, list[0]?.code ?? 0, "RUN_START");
      try {
        while (cursor < list.length) {
          const result = await this.executeRange(list, cursor, list.length, context, labels);
          if (result?.exit || result?.jumpIndex == null) break;
          cursor = result.jumpIndex;
        }
      } catch (error) {
        const failure = { type: "interpreter-command-failed", interpreterId: this.instanceId, ...this.snapshot(), error: error.message };
        this.record("COMMAND_FAILED", { error: error.message });
        this.engine.recordDiagnostic?.(failure);
        throw error;
      } finally {
        this.record("RUN_END", { nextIndex: this.current?.index ?? cursor });
        this.running = false;
        if (this.current) {
          this.current.waitMode = "";
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
        this.progress(index, command.code, "COMMAND_START", { parameters: summarizeParameters(parameters) });
        switch (command.code) {
          case 0:
            break;
          case 101: {
            const lines = [];
            while (list[index + 1]?.code === 401) lines.push(String(list[++index].parameters?.[0] ?? ""));
            await this.suspend("message", this.engine.showMessage(lines.join("\n"), { face: parameters[0], faceIndex: parameters[1], background: parameters[2], position: parameters[3] }));
            break;
          }
          case 102: {
            const options = parameters[0] ?? [];
            const choice = await this.suspend("choice", this.engine.showChoice(options.map((item) => String(item)), { cancelType: parameters[1] }));
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
          case 115:
            return { exit: true };
          case 117: {
            const commonId = Number(firstParam(parameters));
            const common = this.engine.database?.commonEvents?.[commonId];
            if (!common?.list) {
              this.engine.noteUnsupported(117, `common event ${commonId}`);
              break;
            }
            const commonLabels = new Map(common.list.flatMap((entry, entryIndex) => entry.code === 118 ? [[String(entry.parameters?.[0] ?? ""), entryIndex]] : []));
            const result = await this.executeRange(common.list, 0, common.list.length, { ...context, commonEventId: commonId }, commonLabels, depth + 1);
            if (result?.exit) break;
            break;
          }
          case 119: {
            const target = labels.get(String(parameters[0] ?? ""));
            if (target == null) this.engine.noteUnsupported(119, `missing label ${parameters[0]}`);
            else return { jumpIndex: target };
            break;
          }
          case 121:
            for (let id = parameters[0]; id <= parameters[1]; id += 1) this.engine.state.switches[id] = parameters[2] === 0;
            await this.suspendVisual("resource", this.engine.refreshCurrentMapVisuals?.("switch-change") ?? Promise.resolve(), { reason: "switch-change", first: parameters[0], last: parameters[1] });
            break;
          case 122:
            this.controlVariables(parameters);
            break;
          case 123:
            this.engine.state.selfSwitches[`${this.engine.state.mapId},${context.eventId},${parameters[0]}`] = parameters[1] === 0;
            await this.suspendVisual("resource", this.engine.refreshCurrentMapVisuals?.("self-switch-change") ?? Promise.resolve(), { reason: "self-switch-change", eventId: context.eventId, selfSwitch: parameters[0] });
            break;
          case 125:
            this.engine.gainGold?.(this.operandValue(parameters[1], parameters[2], parameters[3]) * (parameters[0] === 0 ? 1 : -1));
            break;
          case 126:
            this.changeInventory("item", parameters);
            break;
          case 127:
            this.changeInventory("weapon", parameters);
            break;
          case 128:
            this.changeInventory("armor", parameters);
            break;
          case 129:
            this.changePartyMember(parameters);
            break;
          case 132:
            this.engine.changeBattleBgm?.(parameters[0]);
            break;
          case 135:
            this.engine.state.menuEnabled = parameters[0] === 0;
            break;
          case 136:
            this.engine.state.encounterEnabled = parameters[0] === 0;
            break;
          case 201:
            if (parameters[0] !== 0) throw new Error("Variable-based transfers are not implemented yet");
            await this.suspend("resource", this.engine.transferWithRecovery?.(parameters[1], parameters[2], parameters[3], parameters[4]) ?? this.engine.transfer(parameters[1], parameters[2], parameters[3], parameters[4]), { operation: "transfer", mapId: parameters[1] });
            break;
          case 205:
            await this.applyMoveRoute(parameters[0], parameters[1], context);
            break;
          case 211:
            this.engine.state.transparent = Boolean(firstParam(parameters));
            break;
          case 221:
            await this.suspend("fade", this.engine.renderer.fadeTo(1));
            break;
          case 222:
            await this.suspend("fade", this.engine.renderer.fadeTo(0));
            break;
          case 230: {
            const frames = firstParam(parameters) ?? 1;
            await this.suspend("wait_count", this.engine.waitFrames ? this.engine.waitFrames(frames) : wait(frames * 1e3 / 60));
            break;
          }
          case 212:
            await this.suspendVisual("animation", this.engine.showAnimation(parameters[0], parameters[1]), { targetId: parameters[0], animationId: parameters[1] });
            break;
          case 213:
            await this.suspend("balloon", this.engine.showBalloon(parameters[0], parameters[1]));
            break;
          case 223:
            await this.suspend("screen_tint", this.engine.tintScreen?.(parameters[0], parameters[1]) ?? Promise.resolve());
            break;
          case 224:
            await this.suspend("screen_flash", this.engine.flashScreen?.(parameters[0], parameters[1]) ?? Promise.resolve());
            break;
          case 225:
            await this.suspend("screen_shake", this.engine.shakeScreen?.(parameters[0], parameters[1], parameters[2]) ?? Promise.resolve());
            break;
          case 231: {
            const picture = pictureParameters(parameters);
            await this.suspendVisual("resource", this.engine.showPicture?.(parameters[0], String(parameters[1] ?? ""), picture) ?? Promise.resolve(), { pictureId: parameters[0], name: parameters[1] });
            break;
          }
          case 232: {
            const movement = this.engine.movePicture?.(parameters[0], pictureParameters(parameters)) ?? Promise.resolve();
            if (parameters[11]) await this.suspendVisual("picture", movement, { pictureId: parameters[0] });
            break;
          }
          case 233:
            this.engine.movePicture?.(parameters[0], { angleSpeed: parameters[1] });
            break;
          case 234:
            this.engine.movePicture?.(parameters[0], { tone: parameters[1], duration: parameters[2] });
            break;
          case 235:
            this.engine.erasePicture?.(firstParam(parameters));
            break;
          case 236:
            await this.suspend("weather", this.engine.setWeather?.(parameters[0], parameters[1], parameters[2]) ?? Promise.resolve());
            break;
          case 241:
            await this.suspendVisual("resource", this.engine.playBgm?.(parameters[0]) ?? Promise.resolve(), { channel: "bgm", name: parameters[0]?.name });
            break;
          case 242:
            this.engine.stopAudio?.("bgm");
            break;
          case 243:
            this.engine.saveBgm?.();
            break;
          case 244:
            await this.suspendVisual("resource", this.engine.replayBgm?.() ?? Promise.resolve(), { channel: "bgm", operation: "replay" });
            break;
          case 245:
            await this.suspendVisual("resource", this.engine.playBgs?.(parameters[0]) ?? Promise.resolve(), { channel: "bgs", name: parameters[0]?.name });
            break;
          case 246:
            this.engine.stopAudio?.("bgs");
            break;
          case 249:
            await this.suspendVisual("audio", this.engine.playMe?.(parameters[0]) ?? Promise.resolve(), { channel: "me", name: parameters[0]?.name });
            break;
          case 250:
            await this.suspend("audio", this.engine.playSe(parameters[0]));
            break;
          case 251:
            this.engine.stopSe?.();
            break;
          case 301: {
            if (parameters[0] !== 0) {
              this.engine.noteUnsupported(301, "variable/random troop");
              break;
            }
            const outcome = await this.suspend("battle", this.engine.startBattle(parameters[1], parameters[2], parameters[3]), { troopId: parameters[1] });
            const boundary = findBattleBoundary(list, index, command.indent, end);
            const marker = { victory: 601, escape: 602, lose: 603, gameover: 603 }[outcome];
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
            await this.suspend("shop", this.engine.openShop(goods, Boolean(parameters[4])));
            break;
          }
          case 303:
            await this.suspend("name_input", this.engine.nameInput(parameters[0], parameters[1]), { actorId: parameters[0], maxLength: parameters[1] });
            break;
          case 314:
            for (const actorId of this.actorTargets(parameters)) this.engine.recoverActor?.(actorId);
            break;
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
          case 318:
            for (const actorId of this.actorTargets(parameters)) this.engine.changeActorSkill?.(actorId, parameters[2], parameters[3]);
            break;
          case 319:
            this.engine.changeActorEquipment?.(parameters[0], parameters[1], parameters[2]);
            break;
          case 320:
            this.engine.setActorName(parameters[0], String(parameters[1] ?? ""));
            break;
          case 322:
            await this.suspendVisual("resource", this.engine.setActorGraphic?.(parameters[0], parameters[1], parameters[2], parameters[3], parameters[4]) ?? Promise.resolve(), { actorId: parameters[0], graphic: parameters[1] });
            break;
          case 353:
            this.engine.setScene?.("GAMEOVER");
            break;
          case 354:
            await this.engine.enterTitle?.();
            return { exit: true };
          case 351:
            await this.suspend("menu", this.engine.openMenuFromEvent());
            break;
          case 355: {
            const lines = [String(parameters[0] ?? "")];
            while (list[index + 1]?.code === 655) lines.push(String(list[++index].parameters?.[0] ?? ""));
            this.engine.runRubyCompatibility(lines.join("\n"));
            break;
          }
          default:
            this.engine.noteUnsupported(command.code);
        }
        this.current.rangeDepth = depth;
        this.progress(index + 1, list[index + 1]?.code ?? 0, "COMMAND_END", { completedIndex: index, completedCode: command.code });
      }
      return null;
    }
    async suspend(waitMode, promise, detail = {}) {
      this.current.waitMode = waitMode;
      this.current.waitStartedAt = Date.now();
      this.record("SUSPEND", detail);
      try {
        const result = await promise;
        this.record("RESUME", detail);
        return result;
      } finally {
        this.current.waitMode = "";
        this.current.waitStartedAt = null;
        this.lastProgressAt = Date.now();
        this.stallReportedFor = null;
      }
    }
    async suspendVisual(waitMode, promise, detail = {}) {
      try {
        return await this.suspend(waitMode, promise, detail);
      } catch (error) {
        const failure = { type: "visual-command-failed-continuing", interpreterId: this.instanceId, ...this.snapshot(), waitMode, error: error.message, ...detail };
        this.record("VISUAL_FAILURE_CONTINUE", failure);
        this.engine.recordDiagnostic?.(failure);
        console.warn("[BLACK SOULS] Visual event command failed; event logic will continue.", failure);
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
      if (!this.traceEnabled || !this.running || this.current?.waitMode || now - this.lastProgressAt < 4e3) return;
      const key = `${this.current?.mapId}:${this.current?.eventId}:${this.current?.index}:${this.current?.code}`;
      if (this.stallReportedFor === key) return;
      this.stallReportedFor = key;
      const entry = { type: "INTERPRETER_STALL", interpreterId: this.instanceId, ...this.snapshot() };
      this.engine.recordDiagnostic?.(entry);
      console.warn("[BLACK SOULS]", entry);
    }
    record(result, detail = {}) {
      const entry = { at: (/* @__PURE__ */ new Date()).toISOString(), interpreterId: this.instanceId, ...this.snapshot(), result, ...detail };
      this.traceLog.push(entry);
      this.traceLog = this.traceLog.slice(-120);
      if (this.traceEnabled) console.debug("[BLACK SOULS interpreter]", entry);
    }
    snapshot() {
      return {
        running: this.running,
        mapId: this.current?.mapId ?? this.engine.state?.mapId ?? null,
        eventId: this.current?.eventId ?? null,
        index: this.current?.index ?? null,
        code: this.current?.code ?? null,
        waitMode: this.current?.waitMode ?? "",
        waitStartedAt: this.current?.waitStartedAt ?? null,
        rangeDepth: this.current?.rangeDepth ?? 0
      };
    }
    diagnostics() {
      return { id: this.instanceId, ...this.snapshot(), traceEnabled: this.traceEnabled, trace: this.traceEnabled ? [...this.traceLog] : [] };
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
      if (type === 4 && parameters[2] === 1) return (this.engine.state.actors[parameters[1]]?.name ?? "") === String(parameters[3] ?? "");
      if (type === 12) return this.engine.evaluateRubyCondition(String(parameters[1] ?? ""));
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
    async applyMoveRoute(target, route, context = {}) {
      for (const command of route?.list ?? []) {
        if (target === -1 && command.code === 39) this.engine.state.transparent = true;
        else if (target === -1 && command.code === 40) this.engine.state.transparent = false;
        else if (command.code === 41) {
          await this.suspendVisual("resource", this.engine.changeCharacterGraphic(target, command.parameters?.[0], command.parameters?.[1], context.eventId), { reason: "move-route-graphic", target, name: command.parameters?.[0] });
        } else if (command.code !== 0) this.engine.noteUnsupported(205, `move command ${command.code}`);
      }
    }
    operandValue(type, value, fallback = 0) {
      return Number(type === 1 ? this.engine.state.variables[value] ?? 0 : value ?? fallback);
    }
    changeInventory(kind, parameters) {
      const id = parameters[0];
      const operation = parameters[1];
      const value = this.operandValue(parameters[2], parameters[3]);
      this.engine.gainItem?.(kind, id, value * (operation === 0 ? 1 : -1));
    }
    changePartyMember(parameters) {
      const [actorId, operation] = parameters;
      this.engine.state.party ??= { members: [] };
      const members = this.engine.state.party.members;
      if (operation === 0 && !members.includes(actorId)) members.push(actorId);
      if (operation === 1) this.engine.state.party.members = members.filter((id) => id !== actorId);
    }
    actorTargets(parameters) {
      return parameters[0] === 0 ? [Number(parameters[1])] : [...this.engine.state.party?.members ?? []];
    }
  };
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
      if (list[index].code === 404) {
        finish = index;
        break;
      }
    }
    return { end: finish, branches: markers.map((marker, index) => ({ ...marker, start: marker.index + 1, end: markers[index + 1]?.index ?? finish })) };
  }
  function findBattleBoundary(list, start, indent, end) {
    const markers = [];
    let finish = end - 1;
    for (let index = start + 1; index < end; index += 1) {
      if (list[index].indent !== indent) continue;
      if ([601, 602, 603].includes(list[index].code)) markers.push({ index, code: list[index].code });
      if (list[index].code === 604) {
        finish = index;
        break;
      }
    }
    return { end: finish, branches: markers.map((marker, index) => ({ ...marker, start: marker.index + 1, end: markers[index + 1]?.index ?? finish })) };
  }
  function pictureParameters(parameters) {
    return { origin: parameters[2] ?? 0, x: parameters[4] ?? 0, y: parameters[5] ?? 0, zoomX: parameters[6] ?? 100, zoomY: parameters[7] ?? 100, opacity: parameters[8] ?? 255, blend: parameters[9] ?? 0, duration: parameters[10] ?? 0 };
  }
  function firstParam(parameters) {
    return Array.isArray(parameters) ? parameters[0] : parameters;
  }
  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
  var interpreterSequence = 0;
  function summarizeParameters(parameters) {
    const summary = JSON.stringify(parameters);
    return summary.length > 180 ? `${summary.slice(0, 177)}...` : summary;
  }

  // runtime/audio/audio-manager.js
  var AudioManager = class {
    constructor(loader, onDiagnostic = () => {
    }) {
      this.loader = loader;
      this.onDiagnostic = onDiagnostic;
      this.channels = { bgm: null, bgs: null };
      this.pending = { bgm: null, bgs: null };
      this.descriptors = { bgm: null, bgs: null };
      this.stats = { unlocked: false, bgm: null, bgs: null, lastSe: null, failures: [] };
    }
    async unlock() {
      if (this.stats.unlocked) return;
      this.stats.unlocked = true;
      for (const channel of ["bgm", "bgs"]) {
        const element = this.channels[channel];
        if (!element || !this.pending[channel]) continue;
        try {
          await element.play();
          if (this.stats[channel]) this.stats[channel].state = "playing";
          this.pending[channel] = null;
          this.onDiagnostic({ type: "audio-playing", channel, path: this.stats[channel]?.path, afterUnlock: true });
        } catch (error) {
          if (this.stats[channel]) this.stats[channel].state = "blocked";
          this.failure(channel, this.stats[channel]?.name ?? "", error.message);
        }
      }
    }
    async applyMapAudio(map) {
      if (map?.autoplay_bgm && map.bgm?.name) await this.playLoop("bgm", map.bgm, { waitForPlayback: false });
      else if (!map?.autoplay_bgm) this.stop("bgm");
      if (map?.autoplay_bgs && map.bgs?.name) await this.playLoop("bgs", map.bgs, { waitForPlayback: false });
      else if (!map?.autoplay_bgs) this.stop("bgs");
    }
    async playLoop(channel, descriptor, { waitForPlayback = true } = {}) {
      if (this.stats[channel]?.name === descriptor.name) return;
      this.stop(channel);
      const path = this.findAudioPath(`Audio/${channel.toUpperCase()}/${descriptor.name}`);
      if (!path) return this.failure(channel, descriptor.name, "not listed in asset manifest");
      try {
        this.descriptors[channel] = structuredClone(descriptor);
        const url = await this.loader.audioUrl(path);
        const element = new Audio(url);
        element.loop = true;
        applySettings(element, descriptor);
        this.channels[channel] = element;
        this.stats[channel] = { name: descriptor.name, path, state: this.stats.unlocked ? "loading" : "blocked" };
        if (!this.stats.unlocked) {
          this.pending[channel] = descriptor;
          this.onDiagnostic({ type: "audio-awaiting-unlock", channel, path });
          return;
        }
        const playback = element.play().then(() => {
          if (this.channels[channel] !== element) return;
          this.stats[channel].state = "playing";
          this.onDiagnostic({ type: "audio-playing", channel, path });
        }).catch((error) => this.failure(channel, descriptor.name, error.message));
        if (waitForPlayback) await playback;
        else void playback;
      } catch (error) {
        this.failure(channel, descriptor.name, error.message);
      }
    }
    async playSe(descriptor) {
      return this.playOneShot("SE", descriptor);
    }
    async playOneShot(category, descriptor) {
      if (!descriptor?.name) return;
      const normalized = String(category).toUpperCase();
      const channel = normalized.toLowerCase();
      const path = this.findAudioPath(`Audio/${normalized}/${descriptor.name}`);
      if (!path) return this.failure(channel, descriptor.name, "not listed in asset manifest");
      try {
        const element = new Audio(await this.loader.audioUrl(path));
        applySettings(element, descriptor);
        this.stats.lastSe = { category: normalized, name: descriptor.name, path, state: "loading" };
        await element.play();
        this.stats.lastSe.state = "playing";
        this.onDiagnostic({ type: "audio-playing", channel, path });
      } catch (error) {
        this.failure(channel, descriptor.name, error.message);
      }
    }
    findAudioPath(basePath) {
      return this.loader.resolveEntry(basePath)?.path ?? null;
    }
    failure(channel, name, error) {
      const item = { channel, name, error };
      this.stats.failures.push(item);
      this.stats.failures = this.stats.failures.slice(-10);
      this.onDiagnostic({ type: "audio-failed", ...item });
    }
    stop(channel) {
      const element = this.channels[channel];
      if (element) {
        element.pause();
        element.currentTime = 0;
      }
      this.channels[channel] = null;
      this.pending[channel] = null;
      this.descriptors[channel] = null;
      this.stats[channel] = null;
    }
    diagnostics() {
      return structuredClone(this.stats);
    }
    destroy() {
      this.stop("bgm");
      this.stop("bgs");
    }
  };
  function applySettings(element, descriptor) {
    element.volume = Math.max(0, Math.min(1, Number(descriptor.volume ?? 100) / 100));
    element.playbackRate = Math.max(0.5, Math.min(2, Number(descriptor.pitch ?? 100) / 100));
    element.preload = "auto";
  }

  // runtime/core/lifecycle.js
  var HOST_STATES = Object.freeze({
    UNINITIALIZED: "UNINITIALIZED",
    LOADING: "LOADING",
    TITLE: "TITLE",
    PLAYING: "PLAYING",
    MENU: "MENU",
    PAUSED: "PAUSED",
    ERROR: "ERROR",
    UNMOUNTED: "UNMOUNTED"
  });
  var PRESENTATION_STATES = Object.freeze({
    WINDOWED: "WINDOWED",
    FULLSCREEN: "FULLSCREEN"
  });
  var ACTIVE_SCENES = /* @__PURE__ */ new Set([HOST_STATES.TITLE, HOST_STATES.PLAYING, HOST_STATES.MENU]);
  function hostStateForScene(scene) {
    if (scene === "TITLE") return HOST_STATES.TITLE;
    if (["MENU", "END", "ITEM", "EQUIP", "STATUS", "SYNTHESIS", "SHOP"].includes(scene)) return HOST_STATES.MENU;
    return HOST_STATES.PLAYING;
  }
  function transitionHostState(current, event, resumeState = HOST_STATES.TITLE) {
    if (event === "LOAD") return HOST_STATES.LOADING;
    if (event === "ERROR") return HOST_STATES.ERROR;
    if (event === "UNMOUNT") return HOST_STATES.UNMOUNTED;
    if (event === "PAUSE" && ACTIVE_SCENES.has(current)) return HOST_STATES.PAUSED;
    if (event === "RESUME" && current === HOST_STATES.PAUSED) return ACTIVE_SCENES.has(resumeState) ? resumeState : HOST_STATES.TITLE;
    if (event.startsWith("SCENE:") && current !== HOST_STATES.UNMOUNTED) return hostStateForScene(event.slice(6));
    return current;
  }
  function transitionPresentationState(current, event) {
    if (event === "FULLSCREEN_ENTER") return PRESENTATION_STATES.FULLSCREEN;
    if (event === "FULLSCREEN_EXIT") return PRESENTATION_STATES.WINDOWED;
    return current;
  }

  // runtime/game/party-system.js
  var PARAM_NAMES = ["mhp", "mmp", "atk", "def", "mat", "mdf", "agi", "luk"];
  var STORE_NAMES = { item: "items", weapon: "weapons", armor: "armors" };
  var DATABASE_NAMES = { item: "items", weapon: "weapons", armor: "armors" };
  var PartySystem = class {
    constructor(database, configuration = {}) {
      this.database = database;
      this.configuration = configuration;
      this.recipes = configuration?.synthesis?.recipes ?? [];
      this.recipeMap = new Map(this.recipes.map((recipe) => [`${recipe.kind}:${recipe.id}`, recipe]));
    }
    initialState() {
      const members = [...this.database.system?.party_members ?? [1]];
      return {
        party: { members, gold: 0, inventory: { items: {}, weapons: {}, armors: {} }, recipes: { item: {}, weapon: {}, armor: {} } },
        actors: Object.fromEntries(this.database.actors.filter(Boolean).map((actor) => [actor.id, this.createActor(actor)]))
      };
    }
    createActor(actor) {
      const level = Math.max(1, Number(actor.initial_level) || 1);
      const equips = this.initialEquips(actor);
      const state = {
        id: actor.id,
        name: actor.name,
        classId: actor.class_id,
        level,
        exp: 0,
        hp: 1,
        mp: 0,
        tp: 0,
        states: [],
        skills: this.initialSkills(actor.class_id, level),
        equips
      };
      const parameters = this.parameters({ actors: { [actor.id]: state } }, actor.id);
      state.hp = parameters.mhp;
      state.mp = parameters.mmp;
      return state;
    }
    initialSkills(classId, level) {
      return [...new Set((this.database.classes?.[classId]?.learnings ?? []).filter((entry) => entry.level <= level).map((entry) => entry.skill_id))];
    }
    equipSlots(actorId) {
      return [...this.configuration?.equipment?.actorSlotOverrides?.[actorId] ?? [0, 1, 2, 3, 4]];
    }
    initialEquips(actor) {
      const slots = this.equipSlots(actor.id);
      const result = slots.map((etypeId) => ({ etypeId, kind: etypeId === 0 ? "weapon" : "armor", id: 0 }));
      for (let databaseIndex = 0; databaseIndex < (actor.equips ?? []).length; databaseIndex += 1) {
        const id = Number(actor.equips[databaseIndex]) || 0;
        if (!id) continue;
        const kind = databaseIndex === 0 ? "weapon" : "armor";
        const item = this.data(kind, id);
        const etypeId = kind === "weapon" ? 0 : Number(item?.etype_id ?? databaseIndex);
        const slot = result.find((entry) => entry.etypeId === etypeId && !entry.id);
        if (slot) Object.assign(slot, { kind, id });
      }
      return result;
    }
    normalizeState(state) {
      state.party ??= { members: [...this.database.system?.party_members ?? [1]], gold: 0, inventory: { items: {}, weapons: {}, armors: {} }, recipes: { item: {}, weapon: {}, armor: {} } };
      state.party.inventory ??= { items: {}, weapons: {}, armors: {} };
      state.party.recipes ??= { item: {}, weapon: {}, armor: {} };
      for (const actorData of this.database.actors.filter(Boolean)) {
        state.actors[actorData.id] ??= this.createActor(actorData);
        const actor = state.actors[actorData.id];
        actor.id ??= actorData.id;
        actor.classId ??= actorData.class_id;
        actor.level ??= actorData.initial_level || 1;
        actor.exp ??= 0;
        actor.states ??= [];
        actor.skills ??= this.initialSkills(actor.classId, actor.level);
        actor.equips ??= this.initialEquips(actorData);
        const parameters = this.parameters(state, actorData.id);
        actor.hp = clamp(Number(actor.hp ?? parameters.mhp), 0, parameters.mhp);
        actor.mp = clamp(Number(actor.mp ?? parameters.mmp), 0, parameters.mmp);
        actor.tp = clamp(Number(actor.tp ?? 0), 0, 100);
      }
      return state;
    }
    quantity(state, kind, id) {
      return Number(state.party?.inventory?.[STORE_NAMES[kind]]?.[id] ?? 0);
    }
    gain(state, kind, id, amount) {
      const data = this.data(kind, id);
      if (!data) throw new Error(`Unknown ${kind} ${id}.`);
      const store = state.party.inventory[STORE_NAMES[kind]];
      const next = clamp((Number(store[id]) || 0) + Number(amount), 0, 99);
      if (next) store[id] = next;
      else delete store[id];
      return next;
    }
    gainGold(state, amount) {
      state.party.gold = clamp((Number(state.party.gold) || 0) + Number(amount), 0, 99999999);
      return state.party.gold;
    }
    useItem(state, itemId, actorId = state.party.members[0]) {
      const item = this.data("item", itemId);
      const actor = state.actors[actorId];
      if (!item || !actor || this.quantity(state, "item", itemId) < 1) return { used: false, reason: "unavailable" };
      const before = { hp: actor.hp, mp: actor.mp, tp: actor.tp, states: [...actor.states] };
      const parameters = this.parameters(state, actorId);
      for (const effect of item.effects ?? []) this.applyItemEffect(actor, parameters, effect);
      if (item.consumable) this.gain(state, "item", itemId, -1);
      return { used: true, itemId, actorId, before, after: { hp: actor.hp, mp: actor.mp, tp: actor.tp, states: [...actor.states] }, remaining: this.quantity(state, "item", itemId) };
    }
    applyItemEffect(actor, parameters, effect) {
      if (effect.code === 11) actor.hp = clamp(actor.hp + Math.floor(parameters.mhp * effect.value1 + effect.value2), 0, parameters.mhp);
      if (effect.code === 12) actor.mp = clamp(actor.mp + Math.floor(parameters.mmp * effect.value1 + effect.value2), 0, parameters.mmp);
      if (effect.code === 13) actor.tp = clamp(actor.tp + Math.floor(effect.value1), 0, 100);
      if (effect.code === 21 && !actor.states.includes(effect.data_id)) actor.states.push(effect.data_id);
      if (effect.code === 22) actor.states = actor.states.filter((id) => id !== effect.data_id);
    }
    canEquip(state, actorId, kind, id, slotIndex) {
      const actor = state.actors[actorId];
      const item = this.data(kind, id);
      const slot = actor?.equips?.[slotIndex];
      if (!actor || !item || !slot) return false;
      const etypeId = kind === "weapon" ? 0 : Number(item.etype_id);
      if (slot.etypeId !== etypeId) return false;
      const actorData = this.database.actors[actorId];
      const klass = this.database.classes[actor.classId];
      const features = [...actorData?.features ?? [], ...klass?.features ?? []];
      const permissionCode = kind === "weapon" ? 51 : 52;
      const typeId = kind === "weapon" ? item.wtype_id : item.atype_id;
      return features.some((feature) => feature.code === permissionCode && feature.data_id === typeId);
    }
    equip(state, actorId, slotIndex, kind, id, { force = false } = {}) {
      const actor = state.actors[actorId];
      const slot = actor?.equips?.[slotIndex];
      if (!slot) return { equipped: false, reason: "slot" };
      if (id && !force && (this.quantity(state, kind, id) < 1 || !this.canEquip(state, actorId, kind, id, slotIndex))) return { equipped: false, reason: "restriction" };
      const previous = { kind: slot.kind, id: slot.id };
      if (previous.id && !force) this.gain(state, previous.kind, previous.id, 1);
      if (id && !force) this.gain(state, kind, id, -1);
      slot.kind = kind;
      slot.id = Number(id) || 0;
      const parameters = this.parameters(state, actorId);
      actor.hp = Math.min(actor.hp, parameters.mhp);
      actor.mp = Math.min(actor.mp, parameters.mmp);
      return { equipped: true, actorId, slotIndex, previous, current: { kind: slot.kind, id: slot.id }, parameters };
    }
    parameters(state, actorId) {
      const actorState = state.actors[actorId];
      const actorData = this.database.actors[actorId];
      if (!actorState || !actorData) return Object.fromEntries(PARAM_NAMES.map((name) => [name, 0]));
      const klass = this.database.classes[actorState.classId];
      const values = PARAM_NAMES.map((_, paramId) => tableParameter(klass?.params, paramId, actorState.level));
      for (const equipped of actorState.equips ?? []) {
        const item = equipped.id ? this.data(equipped.kind, equipped.id) : null;
        for (let paramId = 0; paramId < PARAM_NAMES.length; paramId += 1) values[paramId] += Number(item?.params?.[paramId] ?? 0);
      }
      return Object.fromEntries(PARAM_NAMES.map((name, index) => [name, Math.max(name === "mhp" ? 1 : 0, Math.floor(values[index]))]));
    }
    gainExp(state, actorId, amount) {
      const actor = state.actors[actorId];
      if (!actor) return null;
      actor.exp = Math.max(0, actor.exp + Number(amount));
      const previousLevel = actor.level;
      const maxLevel = this.maxLevel(actorId);
      while (actor.level < maxLevel && actor.exp >= this.expForLevel(actor.classId, actor.level + 1)) actor.level += 1;
      actor.skills = this.initialSkills(actor.classId, actor.level);
      if (actor.level !== previousLevel) {
        const parameters = this.parameters(state, actorId);
        actor.hp = parameters.mhp;
        actor.mp = parameters.mmp;
      }
      return { previousLevel, level: actor.level, exp: actor.exp };
    }
    maxLevel(actorId) {
      const actor = this.database.actors[actorId];
      const bonus = Number(/<レベル限界増加:(\d+)>/.exec(String(actor?.note ?? ""))?.[1] ?? 0);
      return Math.max(Number(actor?.max_level ?? 99), bonus || 0);
    }
    expForLevel(classId, level) {
      const [basis = 30, extra = 20, accelerationA = 30, accelerationB = 30] = this.database.classes[classId]?.exp_params ?? [];
      return Math.round(basis * (level - 1) ** (0.9 + accelerationA / 250) * level * (level + 1) / (6 + level ** 2 / 50 / accelerationB) + (level - 1) * extra);
    }
    unlockAllRecipes(state) {
      for (const recipe of this.recipes) state.party.recipes[recipe.kind][recipe.id] = true;
    }
    synthesize(state, kind, id, amount = 1) {
      const recipe = this.recipeMap.get(`${kind}:${id}`);
      if (!recipe) return { crafted: false, reason: "recipe" };
      if (!state.party.recipes[kind]?.[id]) return { crafted: false, reason: "locked" };
      const count = Math.max(1, Math.floor(amount));
      if (state.party.gold < recipe.gold * count) return { crafted: false, reason: "gold" };
      if (recipe.materials.some((material) => this.quantity(state, material.kind, material.id) < material.amount * count)) return { crafted: false, reason: "materials" };
      this.gainGold(state, -recipe.gold * count);
      for (const material of recipe.materials) this.gain(state, material.kind, material.id, -material.amount * count);
      this.gain(state, kind, id, count);
      return { crafted: true, kind, id, amount: count };
    }
    buy(state, kind, id, amount = 1, price = this.data(kind, id)?.price ?? 0) {
      const count = Math.max(1, Math.floor(amount));
      const total = Math.max(0, Number(price) || 0) * count;
      if (state.party.gold < total || !this.data(kind, id)) return { bought: false, reason: state.party.gold < total ? "gold" : "item" };
      this.gainGold(state, -total);
      this.gain(state, kind, id, count);
      return { bought: true, kind, id, amount: count, total };
    }
    sell(state, kind, id, amount = 1) {
      const count = Math.max(1, Math.floor(amount));
      if (this.quantity(state, kind, id) < count) return { sold: false, reason: "quantity" };
      const total = Math.floor(Number(this.data(kind, id)?.price ?? 0) / 2) * count;
      this.gain(state, kind, id, -count);
      this.gainGold(state, total);
      return { sold: true, kind, id, amount: count, total };
    }
    inventoryEntries(state, kinds = ["item", "weapon", "armor"]) {
      return kinds.flatMap((kind) => Object.entries(state.party.inventory[STORE_NAMES[kind]] ?? {}).filter(([, amount]) => amount > 0).map(([id, amount]) => ({ kind, id: Number(id), amount, data: this.data(kind, Number(id)) }))).sort((a, b) => a.kind.localeCompare(b.kind) || a.id - b.id);
    }
    data(kind, id) {
      return this.database[DATABASE_NAMES[kind]]?.[Number(id)] ?? null;
    }
  };
  function tableParameter(table, paramId, level) {
    const xsize = Number(table?.xsize ?? 8);
    const safeLevel = clamp(Math.floor(level), 0, Math.max(0, Number(table?.ysize ?? 100) - 1));
    return Number(table?.data?.[paramId + safeLevel * xsize] ?? 0);
  }
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  // runtime/game/combat-system.js
  var MAX_AP = 4e3;
  var FRAME_AP_GAIN = 10;
  var DIFFICULTY_VARIABLE_ID = 60;
  var DIFFICULTY_RATES = Object.freeze({
    mhp: [1, 1.5, 1.7, 2, 2.2, 2.5, 2.7, 3, 6, 7],
    mmp: [1, 1.5, 1.7, 2, 2.2, 2.5, 2.7, 3, 3.5, 7],
    atk: [1, 1.5, 1.7, 2, 2.2, 2.5, 2.7, 3, 6, 7],
    def: [1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.4, 3, 4],
    mat: [1, 1.5, 1.7, 2, 2.2, 2.5, 2.7, 3, 6, 7],
    mdf: [1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.4, 3, 4],
    agi: [1, 1.5, 1.7, 2, 2.2, 2.5, 2.7, 3, 6, 7],
    luk: [1, 1.5, 1.7, 2, 2.2, 2.5, 2.7, 3, 3.5, 4],
    exp: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    gold: [1, 1.5, 1.7, 2, 2.2, 2.5, 2.7, 3, 4.5, 6],
    drop: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    critical: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3]
  });
  var CombatSystem = class {
    constructor(database, partySystem, diagnostic = () => {
    }) {
      this.database = database;
      this.party = partySystem;
      this.diagnostic = diagnostic;
    }
    createBattle(state, troopId, { canEscape = false, canLose = false, battleback1 = "", battleback2 = "" } = {}) {
      const troop = this.database.troops[troopId];
      if (!troop) throw new Error(`Unknown troop ${troopId}.`);
      const actors = state.party.members.map((actorId, index) => {
        const actor = state.actors[actorId];
        const parameters = this.party.parameters(state, actorId);
        return {
          side: "actor",
          index,
          actorId,
          name: actor.name || this.database.actors[actorId]?.name || `Actor ${actorId}`,
          hp: actor.hp,
          mp: actor.mp,
          tp: actor.tp,
          states: [...actor.states],
          parameters,
          hit: 0.95,
          eva: 0.05,
          cri: 0.04,
          ap: Math.floor(MAX_AP * 0.3),
          chant: null,
          guarding: false
        };
      });
      const difficulty = difficultyIndex(state);
      const enemies = (troop.members ?? []).filter((member) => !member.hidden).map((member, index) => {
        const enemy = this.database.enemies[member.enemy_id];
        const parameters = scaledEnemyParameters(enemy?.params ?? [], difficulty);
        return {
          side: "enemy",
          index,
          enemyId: enemy.id,
          name: enemy.name,
          battlerName: enemy.battler_name,
          x: member.x,
          y: member.y,
          hp: parameters.mhp,
          mp: parameters.mmp,
          tp: 0,
          states: [],
          parameters,
          hit: Number(enemy.hit ?? 95) / 100,
          eva: Number(enemy.eva ?? 5) / 100,
          cri: Number(enemy.cri ?? 4) / 100,
          ap: Math.floor(MAX_AP * 0.4),
          chant: null,
          guarding: false
        };
      });
      return {
        troopId,
        troopName: troop.name,
        canEscape,
        canLose,
        battleback1,
        battleback2,
        phase: "running",
        actors,
        enemies,
        selectedCommand: 0,
        selectedTarget: 0,
        commands: ["Attack", "Skills", "Items", "Defend", "Escape"],
        log: [`${troop.name} appeared.`],
        frames: 0,
        escapeAttempts: 0,
        result: null,
        rngSeed: (2654435769 ^ troopId ^ difficulty << 16) >>> 0,
        difficulty,
        compatibility: { maxAp: MAX_AP, frameApGain: FRAME_AP_GAIN, smartEnemyAi: true, casting: true, castInterruption: true, difficultyVariable: DIFFICULTY_VARIABLE_ID }
      };
    }
    update(state, frames = 1) {
      const battle = state.battle;
      if (!battle || battle.result || battle.phase === "actor-command" || battle.phase === "target") return battle?.result ?? null;
      for (let frame = 0; frame < frames && !battle.result; frame += 1) {
        battle.frames += 1;
        for (const battler of [...battle.actors, ...battle.enemies]) {
          if (battler.hp <= 0 || battler.ap >= MAX_AP) continue;
          if (battler.chant) {
            battler.chant.remaining -= 1;
            if (battler.chant.remaining <= 0) this.resolveChant(state, battler);
            continue;
          }
          battler.ap = Math.min(MAX_AP, battler.ap + battler.parameters.agi + FRAME_AP_GAIN);
        }
        const actor = battle.actors.find((entry) => entry.hp > 0 && entry.ap >= MAX_AP);
        if (actor) {
          battle.phase = "actor-command";
          battle.activeActor = actor.index;
          break;
        }
        const enemy = battle.enemies.find((entry) => entry.hp > 0 && entry.ap >= MAX_AP);
        if (enemy) this.enemyAction(state, enemy);
        this.checkResult(state);
      }
      return battle.result;
    }
    actorCommand(state, symbol, targetIndex = 0, payload = {}) {
      const battle = state.battle;
      const actor = battle?.actors?.[battle.activeActor ?? 0];
      if (!battle || battle.phase !== "actor-command" || !actor || actor.hp <= 0) return { accepted: false };
      if (symbol === "escape") return this.escape(state);
      if (symbol === "guard") {
        actor.guarding = true;
        actor.ap = 0;
        battle.phase = "running";
        battle.log.push(`${actor.name} defended.`);
        return { accepted: true };
      }
      if (symbol === "item") {
        const result2 = this.party.useItem(state, Number(payload.itemId), actor.actorId);
        if (!result2.used) return { accepted: false, reason: result2.reason };
        Object.assign(actor, { hp: state.actors[actor.actorId].hp, mp: state.actors[actor.actorId].mp, tp: state.actors[actor.actorId].tp, states: [...state.actors[actor.actorId].states] });
        actor.ap = 0;
        battle.phase = "running";
        battle.log.push(`${actor.name} used ${this.database.items[payload.itemId]?.name}.`);
        return { accepted: true, result: result2 };
      }
      const skillId = symbol === "skill" ? Number(payload.skillId) : this.attackSkillId(state, actor.actorId);
      const skill = this.database.skills[skillId];
      if (!skill) return { accepted: false, reason: "skill" };
      if (actor.mp < Number(skill.mp_cost ?? 0) || actor.tp < Number(skill.tp_cost ?? 0)) return { accepted: false, reason: "cost" };
      actor.mp -= Number(skill.mp_cost ?? 0);
      actor.tp -= Number(skill.tp_cost ?? 0);
      const chant = chantMetadata(skill.note);
      if (chant) {
        actor.chant = { skillId, targetIndex, remaining: chant.frames, total: chant.frames };
        actor.ap = 0;
        battle.phase = "running";
        battle.log.push(`${actor.name} began casting ${skill.name}.`);
        return { accepted: true, chanting: true };
      }
      const targets = this.targetsForSkill(battle, actor, skill, targetIndex);
      const result = [];
      for (let repeat = 0; repeat < Math.max(1, Number(skill.repeats) || 1); repeat += 1) for (const target of targets) result.push(this.applySkill(state, actor, target, skill));
      actor.tp = Math.min(100, actor.tp + Number(skill.tp_gain ?? 0));
      this.syncActor(state, actor);
      actor.ap = 0;
      actor.guarding = false;
      battle.phase = "running";
      this.checkResult(state);
      return { accepted: true, result };
    }
    attackSkillId(state, actorId) {
      const actor = state.actors[actorId];
      for (const equipped of actor?.equips ?? []) {
        if (equipped.kind !== "weapon" || !equipped.id) continue;
        const match = /<攻撃ID変更:(\d+)>/.exec(String(this.database.weapons[equipped.id]?.note ?? ""));
        if (match) return Number(match[1]);
      }
      return 1;
    }
    enemyAction(state, enemy) {
      const battle = state.battle;
      const data = this.database.enemies[enemy.enemyId];
      const action = this.selectEnemyAction(state, enemy, data.actions ?? []);
      const skill = this.database.skills[action?.skill_id ?? 1];
      const target = this.targetsForSkill(battle, enemy, skill, 0)[0];
      if (!target || !skill) return;
      if (enemy.mp < Number(skill.mp_cost ?? 0) || enemy.tp < Number(skill.tp_cost ?? 0)) {
        enemy.ap = 0;
        return;
      }
      enemy.mp -= Number(skill.mp_cost ?? 0);
      enemy.tp -= Number(skill.tp_cost ?? 0);
      const chant = chantMetadata(skill.note);
      if (chant) {
        enemy.chant = { skillId: skill.id, targetIndex: target.index, remaining: chant.frames, total: chant.frames };
        enemy.ap = 0;
        battle.log.push(`${enemy.name} began casting ${skill.name}.`);
        return;
      }
      for (let repeat = 0; repeat < Math.max(1, Number(skill.repeats) || 1); repeat += 1) for (const resolved of this.targetsForSkill(battle, enemy, skill, target.index)) this.applySkill(state, enemy, resolved, skill);
      enemy.tp = Math.min(100, enemy.tp + Number(skill.tp_gain ?? 0));
      enemy.ap = 0;
      enemy.guarding = false;
    }
    selectEnemyAction(state, enemy, actions) {
      const forced = actions.filter((action) => action.rating === 10 && this.actionCondition(state, enemy, action));
      const candidates = forced.length ? forced : actions.filter((action) => action.rating !== 1 && action.rating !== 10 && this.actionCondition(state, enemy, action));
      return candidates.sort((a, b) => b.rating - a.rating)[0] ?? actions.find((action) => action.skill_id === 1) ?? actions[0];
    }
    actionCondition(state, enemy, action) {
      const rate = enemy.hp / Math.max(1, enemy.parameters.mhp);
      const mpRate = enemy.mp / Math.max(1, enemy.parameters.mmp);
      if (action.condition_type === 0) return true;
      if (action.condition_type === 2) return rate >= action.condition_param1 && rate <= action.condition_param2;
      if (action.condition_type === 3) return mpRate >= action.condition_param1 && mpRate <= action.condition_param2;
      if (action.condition_type === 4) return enemy.states.includes(Number(action.condition_param1));
      if (action.condition_type === 6) return Boolean(state.switches[action.condition_param1]);
      return false;
    }
    resolveChant(state, battler) {
      const battle = state.battle;
      const chant = battler.chant;
      battler.chant = null;
      const skill = this.database.skills[chant.skillId];
      const targets = this.targetsForSkill(battle, battler, skill, chant.targetIndex);
      for (let repeat = 0; repeat < Math.max(1, Number(skill.repeats) || 1); repeat += 1) for (const target of targets) if (target?.hp > 0) this.applySkill(state, battler, target, skill);
    }
    targetsForSkill(battle, subject, skill, targetIndex = 0) {
      const scope = Number(skill?.scope ?? 1);
      const allies = subject.side === "actor" ? battle.actors : battle.enemies;
      const opponents = subject.side === "actor" ? battle.enemies : battle.actors;
      if (scope === 11) return [subject];
      if (scope === 2) return opponents.filter((entry) => entry.hp > 0);
      if (scope >= 3 && scope <= 6) return Array.from({ length: scope - 2 }, () => pickAlive(opponents, battle)).filter(Boolean);
      if (scope === 8) return allies.filter((entry) => entry.hp > 0);
      if (scope === 10) return allies.filter((entry) => entry.hp <= 0);
      if (scope === 7) return [allies[targetIndex] ?? allies.find((entry) => entry.hp > 0)].filter((entry) => entry?.hp > 0);
      if (scope === 9) return [allies[targetIndex]?.hp <= 0 ? allies[targetIndex] : allies.find((entry) => entry.hp <= 0)].filter(Boolean);
      const selected = opponents[targetIndex];
      return [selected?.hp > 0 ? selected : opponents.find((entry) => entry.hp > 0)].filter(Boolean);
    }
    applySkill(state, subject, target, skill) {
      if (!target || target.hp <= 0) return null;
      const physical = Number(skill.hit_type ?? 0) === 1;
      const hitChance = Math.max(0, Math.min(1, Number(skill.success_rate ?? 100) / 100 * (physical ? subject.hit ?? 0.95 : 1) * (1 - (target.eva ?? 0))));
      if (nextRandom(state.battle) >= hitChance) {
        state.battle.log.push(`${subject.name} used ${skill.name}, but missed ${target.name}.`);
        return { skillId: skill.id, missed: true };
      }
      const raw = evaluateFormula(skill.damage?.formula, subject.parameters, target.parameters, state.variables);
      const damageType = Number(skill.damage?.type ?? 0);
      const variance = Math.max(0, Number(skill.damage?.variance ?? 0)) / 100;
      let amount = Math.max(0, Math.floor(Math.abs(raw) * (1 + (nextRandom(state.battle) * 2 - 1) * variance)));
      const critical = Boolean(skill.damage?.critical) && [1, 5].includes(damageType) && nextRandom(state.battle) < Number(subject.cri ?? 0.04);
      if (critical) amount = Math.floor(amount * DIFFICULTY_RATES.critical[state.battle?.difficulty ?? 0]);
      const before = target.hp;
      const applied = Math.max(1, target.guarding && [1, 5].includes(damageType) ? Math.floor(amount / 2) : amount);
      if ([1, 5].includes(damageType)) target.hp = Math.max(0, target.hp - applied);
      if ([2, 6].includes(damageType)) target.mp = Math.max(0, target.mp - amount);
      if (damageType === 3) target.hp = Math.min(target.parameters.mhp, target.hp + amount);
      if (damageType === 4) target.mp = Math.min(target.parameters.mmp, target.mp + amount);
      if (damageType === 5) subject.hp = Math.min(subject.parameters.mhp, subject.hp + Math.max(0, before - target.hp));
      if (damageType === 6) subject.mp = Math.min(subject.parameters.mmp, subject.mp + amount);
      for (const effect of skill.effects ?? []) {
        if (effect.code === 21 && effect.value1 >= 1 && !target.states.includes(effect.data_id)) target.states.push(effect.data_id);
        if (effect.code === 22 && effect.value1 >= 1) target.states = target.states.filter((id) => id !== effect.data_id);
      }
      if (target.hp <= 0) this.tryAutoResurrection(target);
      if (target.chant && target.hp < before) {
        target.chant = null;
        state.battle.log.push(`${target.name}'s casting was interrupted.`);
      }
      this.syncActor(state, target);
      const dealt = Math.max(0, before - target.hp);
      state.battle.log.push(`${critical ? "Critical! " : ""}${subject.name} used ${skill.name}: ${dealt} damage to ${target.name}.`);
      return { skillId: skill.id, subject: subject.name, target: target.name, damage: dealt, hp: target.hp, critical };
    }
    tryAutoResurrection(target) {
      const stateId = target.states.find((id) => /<自動蘇生:/.test(String(this.database.states[id]?.note ?? "")));
      if (!stateId) return false;
      const match = /<自動蘇生:([^,>]+),/.exec(String(this.database.states[stateId]?.note ?? ""));
      const value = Number(match?.[1] ?? 0);
      target.hp = Math.max(1, value > 100 ? value : Math.floor(target.parameters.mhp * value / 100));
      target.states = target.states.filter((id) => id !== stateId);
      return true;
    }
    escape(state) {
      const battle = state.battle;
      if (!battle.canEscape) return { accepted: false, reason: "disabled" };
      battle.escapeAttempts += 1;
      const actorAgi = average(battle.actors.filter((entry) => entry.hp > 0).map((entry) => entry.parameters.agi));
      const enemyAgi = average(battle.enemies.filter((entry) => entry.hp > 0).map((entry) => entry.parameters.agi));
      if (battle.escapeAttempts > 1 || actorAgi >= enemyAgi) {
        battle.result = "escape";
        battle.phase = "finished";
        return { accepted: true, escaped: true };
      }
      for (const actor of battle.actors) actor.ap = Math.floor(MAX_AP * 0.1);
      battle.phase = "running";
      battle.log.push("Escape failed.");
      return { accepted: true, escaped: false };
    }
    checkResult(state) {
      const battle = state.battle;
      if (battle.enemies.every((entry) => entry.hp <= 0)) {
        battle.result = "victory";
        battle.phase = "finished";
        const defeated = battle.enemies.map((entry) => this.database.enemies[entry.enemyId]);
        const difficulty = battle.difficulty ?? difficultyIndex(state);
        battle.rewards = {
          exp: defeated.reduce((sum, enemy) => sum + scaledReward(enemy, "exp", difficulty), 0),
          gold: defeated.reduce((sum, enemy) => sum + scaledReward(enemy, "gold", difficulty), 0),
          drops: defeated.flatMap((enemy) => this.rollDrops(state, enemy, difficulty))
        };
        this.party.gainGold(state, battle.rewards.gold);
        for (const drop of battle.rewards.drops) this.party.gain(state, drop.kind, drop.id, 1);
        for (const actor of battle.actors) this.party.gainExp(state, actor.actorId, battle.rewards.exp);
        this.applyBattleEndRecovery(state, battle);
      } else if (battle.actors.every((entry) => entry.hp <= 0)) {
        battle.result = battle.canLose ? "lose" : "gameover";
        battle.phase = "finished";
      }
      return battle.result;
    }
    rollDrops(state, enemy, difficulty) {
      const kinds = { 1: "item", 2: "weapon", 3: "armor" };
      const rate = DIFFICULTY_RATES.drop[difficulty];
      return (enemy.drop_items ?? []).flatMap((drop) => {
        const kind = kinds[drop.kind];
        if (!kind || !drop.data_id) return [];
        return nextRandom(state.battle) < rate / Math.max(1, Number(drop.denominator) || 1) ? [{ kind, id: Number(drop.data_id) }] : [];
      });
    }
    applyBattleEndRecovery(state, battle) {
      for (const battler of battle.actors) {
        const actor = state.actors[battler.actorId];
        const notes = [this.database.actors[battler.actorId]?.note, ...actor.equips.map((entry) => entry.id ? this.party.data(entry.kind, entry.id)?.note : ""), ...actor.states.map((id) => this.database.states[id]?.note)].join("\n");
        for (const match of notes.matchAll(/<戦闘終了後HP回復:(\d+)>/g)) actor.hp = Math.min(this.party.parameters(state, battler.actorId).mhp, actor.hp + Number(match[1]));
        for (const match of notes.matchAll(/<戦闘終了後MP回復:(\d+)>/g)) actor.mp = Math.min(this.party.parameters(state, battler.actorId).mmp, actor.mp + Number(match[1]));
        for (const match of notes.matchAll(/<戦闘終了後ステート解除:(\d+)>/g)) actor.states = actor.states.filter((id) => id !== Number(match[1]));
      }
    }
    syncActor(state, battler) {
      if (battler.side !== "actor") return;
      const actor = state.actors[battler.actorId];
      Object.assign(actor, { hp: battler.hp, mp: battler.mp, tp: battler.tp, states: [...battler.states] });
    }
  };
  function chantMetadata(note = "") {
    const match = /<(?:(?:詠唱)|chant)[：:]\s*(\d+)(?:\s*,\s*(\d+))?>/i.exec(String(note));
    if (!match) return null;
    return { frames: Math.max(1, Number(match[1]) + Math.floor(Number(match[2] ?? 0) / 2)) };
  }
  function evaluateFormula(formula = "0", subject, target, variables = {}) {
    let expression = String(formula).replace(/\ba\.(mhp|mmp|atk|def|mat|mdf|agi|luk)\b/g, (_, key) => String(Number(subject[key]) || 0)).replace(/\bb\.(mhp|mmp|atk|def|mat|mdf|agi|luk)\b/g, (_, key) => String(Number(target[key]) || 0)).replace(/\bv\[(\d+)\]/g, (_, id) => String(Number(variables[id]) || 0));
    if (!/^[\d\s+\-*/%().]+$/.test(expression)) return 0;
    try {
      return Number(Function(`"use strict"; return (${expression});`)()) || 0;
    } catch {
      return 0;
    }
  }
  function parameterObject(values) {
    return Object.fromEntries(["mhp", "mmp", "atk", "def", "mat", "mdf", "agi", "luk"].map((name, index) => [name, Number(values[index] ?? 0)]));
  }
  function difficultyIndex(state) {
    return Math.max(0, Math.min(9, Math.floor(Number(state?.variables?.[DIFFICULTY_VARIABLE_ID]) || 0)));
  }
  function scaledEnemyParameters(values, difficulty) {
    const raw = parameterObject(values);
    return Object.fromEntries(Object.entries(raw).map(([name, value]) => [name, Math.floor(value * DIFFICULTY_RATES[name][difficulty])]));
  }
  function scaledReward(enemy, kind, difficulty) {
    const raw = Number(enemy?.[kind] ?? 0);
    const disabled = kind === "exp" ? /<経験値変動無効>/.test(String(enemy?.note ?? "")) : /<お金変動無効>/.test(String(enemy?.note ?? ""));
    return disabled ? raw : Math.round(raw * DIFFICULTY_RATES[kind][difficulty]);
  }
  function nextRandom(battle) {
    let value = Number(battle?.rngSeed ?? 2654435769) >>> 0;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    if (battle) battle.rngSeed = value >>> 0;
    return (value >>> 0) / 4294967296;
  }
  function pickAlive(entries, battle) {
    const alive = entries.filter((entry) => entry.hp > 0);
    return alive[Math.floor(nextRandom(battle) * alive.length)];
  }
  function average(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  }

  // runtime/core/game-engine.js
  var GameEngine = class {
    constructor({ loader, renderer, saves, status, onSceneChange = () => {
    }, onExitRequest = () => {
    }, onTransitionState = () => {
    } }) {
      this.loader = loader;
      this.renderer = renderer;
      this.saves = saves;
      this.status = status;
      this.onSceneChange = onSceneChange;
      this.onExitRequest = onExitRequest;
      this.onTransitionState = onTransitionState;
      this.unsupported = /* @__PURE__ */ new Set();
      this.diagnosticsLog = [];
      this.interpreterTraceEnabled = new URLSearchParams(globalThis.location?.search ?? "").get("bsTrace") === "1";
      this.modalStack = [];
      this.modalSequence = 0;
    }
    async initialize() {
      this.database = await this.loader.initialize();
      this.party = new PartySystem(this.database, this.database.inventoryDependencies);
      this.combat = new CombatSystem(this.database, this.party, (entry) => this.recordDiagnostic(entry));
      this.prefetch = this.loader.prefetch;
      this.input = new InputController(this.renderer.stage);
      this.interpreter = new EventInterpreter(this);
      this.audio = new AudioManager(this.loader, (entry) => this.recordDiagnostic(entry));
      this.state = this.initialState("LOADING");
      this.prefetch.setContextProvider(() => ({
        interpreter: this.interpreter?.snapshot?.() ?? null,
        renderer: { scene: this.renderer.stats.scene, mapId: this.renderer.stats.mapId, frames: this.renderer.stats.frames },
        state: { scene: this.state?.scene, mapId: this.state?.mapId, loadingMap: this.state?.loadingMap }
      }));
      this.hasSave = await this.saves.has(1).catch((error) => {
        this.recordDiagnostic({ type: "save-probe-failed", error: error.message });
        return false;
      });
      await this.enterTitle();
      this.running = true;
      this.loop();
      this.status("");
    }
    initialState(scene = "TITLE") {
      const partyState = this.party?.initialState?.() ?? {
        party: { members: [...this.database.system.party_members ?? [1]], gold: 0, inventory: { items: {}, weapons: {}, armors: {} }, recipes: { item: {}, weapon: {}, armor: {} } },
        actors: Object.fromEntries(this.database.actors.filter(Boolean).map((actor) => [actor.id, { name: actor.name }]))
      };
      return {
        schema: "black-souls-st-state-v1",
        scene,
        mapId: this.database.system.start_map_id,
        x: this.database.system.start_x,
        y: this.database.system.start_y,
        direction: 2,
        pattern: 1,
        steps: 0,
        switches: {},
        variables: {},
        selfSwitches: {},
        transparent: false,
        opacity: 255,
        message: null,
        ...partyState,
        choice: null,
        pictures: {},
        screenTone: null,
        screenFlash: null,
        screenShake: null,
        weather: null,
        battle: null,
        eventOverrides: {}
      };
    }
    async enterTitle() {
      this.map = null;
      this.collision = null;
      await this.renderer.setTitle(this.database.system);
      this.state.scene = "TITLE";
      this.state.message = null;
      this.state.choice = null;
      this.state.title = {
        selected: this.hasSave ? 1 : 0,
        commands: [
          { symbol: "new_game", label: this.database.system.terms.commands[18], enabled: true },
          { symbol: "continue", label: this.database.system.terms.commands[19], enabled: this.hasSave },
          { symbol: "shutdown", label: this.database.system.terms.commands[20], enabled: true }
        ]
      };
      this.state.menu = null;
      this.audio.stop("bgs");
      void this.audio.playLoop("bgm", this.database.system.title_bgm);
      this.notifyScene();
      this.renderer.render(this.state);
      this.prefetch?.prefetchRoute("opening");
    }
    async newGame() {
      await this.audio.unlock();
      this.state = this.initialState("PLAYING");
      this.notifyScene();
      await this.loadMap(this.state.mapId);
      this.status(`New game: map ${this.state.mapId} (${this.state.x}, ${this.state.y})`);
      void this.runAutorunEvents().catch((error) => this.handleInterpreterFailure(error));
    }
    async loadMap(mapId) {
      this.state.loadingMap = true;
      this.onTransitionState({ state: "loading", mapId, streaming: this.prefetch?.getStatus?.() ?? null });
      try {
        await this.prefetch?.prepareMap?.(mapId, { x: this.state.x, y: this.state.y });
        const map = await this.loader.map(mapId);
        const tileset = this.database.tilesets[map.tileset_id];
        const collision = new CollisionMap(map, tileset);
        const actorId = this.database.system.party_members?.[0] ?? 1;
        const actor = this.database.actors[actorId];
        const actorState = this.state.actors[actorId];
        const playerGraphic = { character_name: actorState?.characterName ?? actor?.character_name ?? "", character_index: actorState?.characterIndex ?? actor?.character_index ?? 0 };
        await this.renderer.setMap(map, tileset, { playerGraphic, events: this.currentRenderableEvents(map), mapId, x: this.state.x, y: this.state.y });
        this.map = map;
        this.collision = collision;
        await this.audio.applyMapAudio(map);
        const transition = this.prefetch?.markMapVisible?.(mapId, { x: this.state.x, y: this.state.y }) ?? null;
        this.onTransitionState({ state: "visible", mapId, transition, streaming: this.prefetch?.getStatus?.() ?? null });
      } catch (error) {
        this.prefetch?.failTransition?.(mapId, error);
        this.onTransitionState({ state: "failed", mapId, error: error.message, streaming: this.prefetch?.getStatus?.() ?? null });
        throw error;
      } finally {
        this.state.loadingMap = false;
      }
    }
    async transfer(mapId, x, y, direction = 0) {
      const previous = { mapId: this.state.mapId, x: this.state.x, y: this.state.y, direction: this.state.direction };
      this.state.mapId = mapId;
      this.state.x = x;
      this.state.y = y;
      if (direction) this.state.direction = direction;
      try {
        await this.loadMap(mapId);
      } catch (error) {
        Object.assign(this.state, previous);
        this.recordDiagnostic({ type: "transfer-rollback", requested: { mapId, x, y, direction }, restored: previous, error: error.message });
        throw error;
      }
      this.status(`Transferred to original map ${mapId} (${x}, ${y})`);
      this.pendingAutorun = true;
    }
    consumePendingAutorun() {
      const pending = this.pendingAutorun;
      this.pendingAutorun = false;
      return pending;
    }
    async runAutorunEvents() {
      for (const event of Object.values(this.map?.events ?? {})) {
        const page = this.activePage(event);
        if (page?.trigger === 3) await this.interpreter.run(page.list, { eventId: event.id });
      }
    }
    handleInterpreterFailure(error, interpreter = this.interpreter?.snapshot()) {
      const message = `Event stopped at map ${interpreter?.mapId ?? "?"} event ${interpreter?.eventId ?? "?"} index ${interpreter?.index ?? "?"} code ${interpreter?.code ?? "?"}: ${error.message}`;
      this.recordDiagnostic({ type: "autorun-failed", error: error.message, interpreter });
      this.status(message);
      console.error("[BLACK SOULS]", message, error);
    }
    activePage(event) {
      return [...event.pages ?? []].reverse().find((page) => this.conditionsMet(page.condition, event.id));
    }
    conditionsMet(condition = {}, eventId = 0) {
      if (condition.switch1_valid && !this.state.switches[condition.switch1_id]) return false;
      if (condition.switch2_valid && !this.state.switches[condition.switch2_id]) return false;
      if (condition.variable_valid && (this.state.variables[condition.variable_id] ?? 0) < condition.variable_value) return false;
      if (condition.self_switch_valid && !this.state.selfSwitches[`${this.state.mapId},${eventId},${condition.self_switch_ch}`]) return false;
      if (condition.item_valid && this.party.quantity(this.state, "item", condition.item_id) <= 0) return false;
      if (condition.actor_valid && !this.state.party.members.includes(condition.actor_id)) return false;
      return true;
    }
    loop = () => {
      if (!this.running) return;
      try {
        this.update();
        this.renderer.render(this.state, this.currentRenderableEvents());
        this.lastRenderError = null;
      } catch (error) {
        if (error.message !== this.lastRenderError) {
          this.lastRenderError = error.message;
          this.recordDiagnostic({ type: "render-frame-failed", error: error.message });
          console.error("[BLACK SOULS] Render frame failed; the loop will retry.", error);
        }
      }
      this.frame = requestAnimationFrame(this.loop);
    };
    update() {
      if (this.paused) return;
      this.interpreter?.updateWatchdog?.();
      if (this.input.takeInteraction()) void this.audio.unlock();
      if (this.state.scene === "TITLE") {
        this.updateTitle();
        return;
      }
      if (this.state.scene === "BATTLE") {
        this.updateBattle();
        return;
      }
      if (["MENU", "END", "ITEM", "EQUIP", "STATUS", "SYNTHESIS", "SHOP"].includes(this.state.scene)) {
        this.updateMenu();
        return;
      }
      if (this.state.choice) {
        const movement2 = this.input.takeDirection();
        if (movement2?.[1]) this.state.choice.selected = (this.state.choice.selected + Math.sign(movement2[1]) + this.state.choice.options.length) % this.state.choice.options.length;
        if (this.input.takeConfirm()) {
          const selected = this.state.choice.selected;
          this.state.choice = null;
          this.choiceResolve?.(selected);
          this.choiceResolve = null;
        }
        return;
      }
      if (this.state.message) {
        if (this.input.takeConfirm() || this.input.takeCancel()) {
          this.state.message = null;
          this.messageResolve?.();
          this.messageResolve = null;
        }
        return;
      }
      if (this.interpreter.running) return;
      if (this.input.takeCancel()) {
        this.openMenu();
        return;
      }
      if (this.input.takeConfirm()) {
        this.triggerActionEvent();
        return;
      }
      const movement = this.input.takeDirection();
      if (!movement || !this.map) return;
      this.move(...movement);
    }
    updateTitle() {
      const movement = this.input.takeDirection();
      if (movement?.[1]) this.state.title.selected = cycle(this.state.title.selected, Math.sign(movement[1]), this.state.title.commands.length);
      if (this.input.takeCancel()) return;
      if (!this.input.takeConfirm() || this.transitioning) return;
      const command = this.state.title.commands[this.state.title.selected];
      if (!command.enabled) {
        this.status("Không có dữ liệu lưu.");
        return;
      }
      if (command.symbol === "shutdown") {
        this.onExitRequest({ reason: "title-shutdown", scene: "TITLE" });
        return;
      }
      this.transitioning = true;
      const task = command.symbol === "new_game" ? this.newGame() : this.load(1);
      Promise.resolve(task).catch((error) => {
        this.recordDiagnostic({ type: "scene-transition-failed", error: error.message });
        this.status(error.message);
      }).finally(() => {
        this.transitioning = false;
      });
    }
    updateMenu() {
      if (this.state.scene === "ITEM") {
        this.updateItemMenu();
        return;
      }
      if (this.state.scene === "EQUIP") {
        this.updateEquipMenu();
        return;
      }
      if (this.state.scene === "STATUS") {
        if (this.input.takeCancel() || this.input.takeConfirm()) this.openMenu();
        return;
      }
      if (this.state.scene === "SYNTHESIS") {
        this.updateSynthesisMenu();
        return;
      }
      if (this.state.scene === "SHOP") {
        this.updateShopMenu();
        return;
      }
      const movement = this.input.takeDirection();
      if (movement?.[1]) this.state.menu.selected = cycle(this.state.menu.selected, Math.sign(movement[1]), this.state.menu.commands.length);
      if (this.input.takeCancel()) {
        if (this.state.scene === "END") this.openMenu();
        else this.closeMenuToGame();
        return;
      }
      if (!this.input.takeConfirm()) return;
      const command = this.state.menu.commands[this.state.menu.selected];
      if (command.enabled === false) {
        this.status("Mục này chưa có trong vertical slice hiện tại.");
        return;
      }
      if (this.state.scene === "END") {
        if (command.symbol === "to_title") void this.enterTitle();
        if (command.symbol === "shutdown") this.onExitRequest({ reason: "game-end-shutdown", scene: "END" });
        if (command.symbol === "cancel") this.openMenu();
        return;
      }
      if (command.symbol === "save") void this.save(1);
      if (command.symbol === "game_end") this.openEndMenu();
      if (command.symbol === "item") this.openItemMenu();
      if (command.symbol === "equip") this.openEquipMenu();
      if (command.symbol === "status") this.openStatusMenu();
    }
    openMenu() {
      const labels = this.database.system.terms.commands;
      this.state.menu = {
        kind: "menu",
        selected: 0,
        commands: [
          { symbol: "item", label: labels[4], enabled: true },
          { symbol: "skill", label: labels[5], enabled: false },
          { symbol: "equip", label: labels[6], enabled: true },
          { symbol: "status", label: labels[7], enabled: true },
          { symbol: "save", label: labels[9], enabled: true },
          { symbol: "game_end", label: labels[10], enabled: true }
        ]
      };
      this.setScene("MENU");
    }
    openEndMenu() {
      const labels = this.database.system.terms.commands;
      this.state.menu = { kind: "end", selected: 0, commands: [
        { symbol: "to_title", label: labels[21], enabled: true },
        { symbol: "shutdown", label: labels[20], enabled: true },
        { symbol: "cancel", label: labels[22], enabled: true }
      ] };
      this.setScene("END");
    }
    async transferWithRecovery(mapId, x, y, direction = 0) {
      let attempt = 0;
      while (true) {
        attempt += 1;
        try {
          return await this.transfer(mapId, x, y, direction);
        } catch (error) {
          this.recordDiagnostic({ type: "resource-wait-failed", operation: "transfer", mapId, attempt, error: error.message, interpreter: this.interpreter.snapshot() });
          const retry = await this.renderer.promptRetry?.(`Map ${mapId} could not finish loading.`, error.message);
          if (!retry) throw error;
          this.recordDiagnostic({ type: "resource-retry-requested", operation: "transfer", mapId, attempt });
        }
      }
    }
    openItemMenu() {
      const entries = this.party.inventoryEntries(this.state, ["item"]);
      this.state.menu = { kind: "item", selected: 0, entries };
      this.setScene("ITEM");
    }
    updateItemMenu() {
      const menu = this.state.menu;
      if (this.input.takeCancel()) {
        this.openMenu();
        return;
      }
      const movement = this.input.takeDirection();
      if (movement?.[1] && menu.entries.length) menu.selected = cycle(menu.selected, Math.sign(movement[1]), menu.entries.length);
      if (!this.input.takeConfirm() || !menu.entries.length) return;
      const entry = menu.entries[menu.selected];
      const result = this.party.useItem(this.state, entry.id, this.state.party.members[0]);
      if (result.used) this.status(`Used ${entry.data.name}.`);
      menu.entries = this.party.inventoryEntries(this.state, ["item"]);
      menu.selected = Math.max(0, Math.min(menu.selected, menu.entries.length - 1));
    }
    openEquipMenu() {
      const actorId = this.state.party.members[0];
      this.state.menu = { kind: "equip", mode: "slots", actorId, selected: 0, choices: [], choiceSelected: 0 };
      this.decorateEquipMenu(this.state.menu);
      this.setScene("EQUIP");
    }
    updateEquipMenu() {
      const menu = this.state.menu;
      const actor = this.state.actors[menu.actorId];
      if (menu.mode === "choices") {
        if (this.input.takeCancel()) {
          menu.mode = "slots";
          return;
        }
        const movement2 = this.input.takeDirection();
        if (movement2?.[1] && menu.choices.length) menu.choiceSelected = cycle(menu.choiceSelected, Math.sign(movement2[1]), menu.choices.length);
        if (!this.input.takeConfirm()) return;
        const selected = menu.choices[menu.choiceSelected] ?? { kind: actor.equips[menu.selected].kind, id: 0 };
        const result = this.party.equip(this.state, menu.actorId, menu.selected, selected.kind, selected.id);
        if (result.equipped) this.status(selected.id ? `Equipped ${this.party.data(selected.kind, selected.id)?.name}.` : "Unequipped.");
        menu.mode = "slots";
        this.decorateEquipMenu(menu);
        return;
      }
      if (this.input.takeCancel()) {
        this.openMenu();
        return;
      }
      const movement = this.input.takeDirection();
      if (movement?.[1] && actor.equips.length) menu.selected = cycle(menu.selected, Math.sign(movement[1]), actor.equips.length);
      if (!this.input.takeConfirm()) return;
      const current = actor.equips[menu.selected];
      menu.choices = [{ kind: current.kind, id: 0, amount: 0, data: { name: "(Remove)" } }, ...this.party.inventoryEntries(this.state, ["weapon", "armor"]).filter((entry) => this.party.canEquip(this.state, menu.actorId, entry.kind, entry.id, menu.selected))];
      menu.choiceSelected = 0;
      menu.mode = "choices";
    }
    decorateEquipMenu(menu) {
      menu.slotEntries = (this.state.actors[menu.actorId]?.equips ?? []).map((slot) => ({ ...slot, data: slot.id ? this.party.data(slot.kind, slot.id) : null }));
    }
    openStatusMenu() {
      const actorId = this.state.party.members[0];
      this.state.menu = { kind: "status", actorId, parameters: this.party.parameters(this.state, actorId) };
      this.setScene("STATUS");
    }
    openSynthesisMenu() {
      const entries = this.database.inventoryDependencies.synthesis.recipes.filter((recipe) => this.state.party.recipes[recipe.kind]?.[recipe.id]).map((recipe) => ({ ...recipe, data: this.party.data(recipe.kind, recipe.id) }));
      this.state.menu = { kind: "synthesis", selected: 0, entries };
      this.setScene("SYNTHESIS");
    }
    updateSynthesisMenu() {
      const menu = this.state.menu;
      if (this.input.takeCancel()) {
        this.setScene("PLAYING");
        return;
      }
      const movement = this.input.takeDirection();
      if (movement?.[1] && menu.entries.length) menu.selected = cycle(menu.selected, Math.sign(movement[1]), menu.entries.length);
      if (!this.input.takeConfirm() || !menu.entries.length) return;
      const recipe = menu.entries[menu.selected];
      const result = this.party.synthesize(this.state, recipe.kind, recipe.id, 1);
      this.status(result.crafted ? `Created ${recipe.data?.name}.` : `Cannot synthesize: ${result.reason}.`);
    }
    openShop(goods, purchaseOnly = false) {
      const entries = goods.map((good) => {
        const kind = ["item", "weapon", "armor"][Number(good[0])] ?? "item";
        const id = Number(good[1]);
        const data = this.party.data(kind, id);
        return { kind, id, data, price: Number(good[2]) === 0 ? Number(data?.price ?? 0) : Number(good[3] ?? 0) };
      }).filter((entry) => entry.data);
      this.state.menu = { kind: "shop", selected: 0, entries, purchaseOnly };
      this.setScene("SHOP");
      return new Promise((resolve) => {
        this.shopResolve = resolve;
      });
    }
    updateShopMenu() {
      const menu = this.state.menu;
      if (this.input.takeCancel()) {
        const resolve = this.shopResolve;
        this.shopResolve = null;
        this.setScene("PLAYING");
        resolve?.();
        return;
      }
      const movement = this.input.takeDirection();
      if (movement?.[1] && menu.entries.length) menu.selected = cycle(menu.selected, Math.sign(movement[1]), menu.entries.length);
      if (!this.input.takeConfirm() || !menu.entries.length) return;
      const entry = menu.entries[menu.selected];
      const result = this.party.buy(this.state, entry.kind, entry.id, 1, entry.price);
      this.status(result.bought ? `Bought ${entry.data.name}.` : `Cannot buy: ${result.reason}.`);
    }
    openMenuFromEvent() {
      this.openMenu();
      return new Promise((resolve) => {
        this.menuResolve = resolve;
      });
    }
    closeMenuToGame() {
      this.setScene("PLAYING");
      const resolve = this.menuResolve;
      this.menuResolve = null;
      resolve?.();
    }
    async startBattle(troopId, canEscape = false, canLose = false) {
      const paths = this.database.prefetchManifest?.battles?.[troopId]?.assets ?? [];
      await this.prefetch?.prefetchAssets?.(paths, { priority: 0, reason: `battle:${troopId}` });
      const battle = this.combat.createBattle(this.state, troopId, {
        canEscape,
        canLose,
        battleback1: this.state.nextBattleback1 ?? this.map?.battleback1_name ?? "",
        battleback2: this.state.nextBattleback2 ?? this.map?.battleback2_name ?? ""
      });
      this.state.battle = battle;
      await this.renderer.setBattle?.(battle);
      void this.audio.playLoop("bgm", this.state.battleBgm ?? this.database.system.battle_bgm);
      this.setScene("BATTLE");
      return new Promise((resolve) => {
        this.battleResolve = resolve;
      });
    }
    updateBattle() {
      const battle = this.state.battle;
      if (!battle) {
        this.setScene("PLAYING");
        return;
      }
      this.combat.update(this.state, 1);
      if (battle.result) {
        void this.finishBattle(battle.result);
        return;
      }
      if (battle.phase !== "actor-command") return;
      const movement = this.input.takeDirection();
      if (movement?.[1]) battle.selectedCommand = cycle(battle.selectedCommand, Math.sign(movement[1]), battle.commands.length);
      if (!this.input.takeConfirm()) return;
      const symbol = ["attack", "skill", "item", "guard", "escape"][battle.selectedCommand];
      const payload = symbol === "skill" ? { skillId: this.state.actors[battle.actors[battle.activeActor].actorId].skills[0] ?? 1 } : symbol === "item" ? { itemId: this.party.inventoryEntries(this.state, ["item"])[0]?.id } : {};
      const result = this.combat.actorCommand(this.state, symbol, battle.selectedTarget, payload);
      if (!result.accepted) this.status(`Battle command unavailable: ${result.reason ?? "invalid"}.`);
    }
    async finishBattle(result) {
      if (this.finishingBattle) return;
      this.finishingBattle = true;
      try {
        await this.audio.applyMapAudio(this.map);
        this.renderer.clearBattle?.();
        this.state.scene = "PLAYING";
        this.notifyScene();
        const resolve = this.battleResolve;
        this.battleResolve = null;
        resolve?.(result);
      } finally {
        this.finishingBattle = false;
      }
    }
    async refreshCurrentMapVisuals(reason = "page-change") {
      if (!this.map) return;
      const events = this.currentRenderableEvents();
      await this.renderer.ensureEventGraphics?.(events);
      this.recordDiagnostic({ type: "dynamic-event-graphics-ready", reason, mapId: this.state.mapId, characters: [...new Set(events.map((event) => event.graphic?.character_name).filter(Boolean))] });
    }
    gainItem(kind, id, amount) {
      return this.party.gain(this.state, kind, id, amount);
    }
    gainGold(amount) {
      return this.party.gainGold(this.state, amount);
    }
    changeBattleBgm(descriptor) {
      this.state.battleBgm = structuredClone(descriptor);
    }
    saveBgm() {
      this.state.savedBgm = structuredClone(this.audio.descriptors?.bgm ?? null);
    }
    replayBgm() {
      return this.state.savedBgm ? this.audio.playLoop("bgm", this.state.savedBgm) : Promise.resolve();
    }
    playMe(descriptor) {
      return this.audio.playOneShot("ME", descriptor);
    }
    recoverActor(actorId) {
      const actor = this.state.actors[actorId];
      if (!actor) return;
      const parameters = this.party.parameters(this.state, actorId);
      Object.assign(actor, { hp: parameters.mhp, mp: parameters.mmp, tp: 0, states: [] });
    }
    changeActorExp(actorId, amount) {
      return this.party.gainExp(this.state, actorId, amount);
    }
    changeActorLevel(actorId, amount) {
      const actor = this.state.actors[actorId];
      if (!actor) return null;
      const target = Math.max(1, Math.min(this.party.maxLevel(actorId), actor.level + Number(amount)));
      return this.party.gainExp(this.state, actorId, this.party.expForLevel(actor.classId, target) - actor.exp);
    }
    changeActorSkill(actorId, operation, skillId) {
      const actor = this.state.actors[actorId];
      if (!actor) return;
      if (operation === 0 && !actor.skills.includes(skillId)) actor.skills.push(skillId);
      if (operation === 1) actor.skills = actor.skills.filter((id) => id !== skillId);
    }
    async setActorGraphic(actorId, characterName, characterIndex, faceName, faceIndex) {
      const actor = this.state.actors[actorId];
      if (!actor) return;
      Object.assign(actor, { characterName: String(characterName ?? ""), characterIndex: Number(characterIndex) || 0, faceName: String(faceName ?? ""), faceIndex: Number(faceIndex) || 0 });
      if (this.state.party.members[0] === actorId) {
        this.renderer.playerGraphic = { character_name: actor.characterName, character_index: actor.characterIndex };
        await this.renderer.ensureEventGraphics?.([{ graphic: this.renderer.playerGraphic }]);
      }
    }
    changeActorEquipment(actorId, slotId, itemId) {
      const slot = this.state.actors[actorId]?.equips?.[slotId];
      return slot ? this.party.equip(this.state, actorId, slotId, slot.etypeId === 0 ? "weapon" : "armor", itemId, { force: true }) : null;
    }
    async showPicture(id, name, parameters) {
      this.state.pictures[id] = { id, name, ...parameters };
      await this.renderer.showPicture?.(id, name, parameters);
    }
    movePicture(id, parameters) {
      Object.assign(this.state.pictures[id] ??= { id }, parameters);
      return this.renderer.movePicture?.(id, parameters) ?? Promise.resolve();
    }
    erasePicture(id) {
      delete this.state.pictures[id];
      this.renderer.erasePicture?.(id);
    }
    tintScreen(tone, frames) {
      this.state.screenTone = { tone, frames };
      return this.renderer.tintScreen?.(tone, frames) ?? Promise.resolve();
    }
    flashScreen(color, frames) {
      this.state.screenFlash = { color, frames };
      return this.renderer.flashScreen?.(color, frames) ?? Promise.resolve();
    }
    shakeScreen(power, speed, frames) {
      this.state.screenShake = { power, speed, frames };
      return this.renderer.shakeScreen?.(power, speed, frames) ?? Promise.resolve();
    }
    setWeather(type, power, frames) {
      this.state.weather = { type, power, frames };
      return this.renderer.setWeather?.(type, power, frames) ?? Promise.resolve();
    }
    playBgm(descriptor) {
      return this.audio.playLoop("bgm", descriptor);
    }
    playBgs(descriptor) {
      return this.audio.playLoop("bgs", descriptor);
    }
    stopAudio(channel) {
      this.audio.stop(channel);
    }
    async changeCharacterGraphic(target, name, index = 0, eventId = 0) {
      if (target === -1) {
        const actorId = this.state.party.members[0];
        const actor = this.state.actors[actorId];
        actor.characterName = String(name ?? "");
        actor.characterIndex = Number(index) || 0;
        this.renderer.playerGraphic = { character_name: actor.characterName, character_index: actor.characterIndex };
        await this.renderer.ensureEventGraphics?.([{ graphic: this.renderer.playerGraphic }]);
        return;
      }
      const resolvedId = target === 0 ? eventId : target;
      const key = `${this.state.mapId},${resolvedId}`;
      this.state.eventOverrides[key] ??= {};
      this.state.eventOverrides[key].graphic = { character_name: String(name ?? ""), character_index: Number(index) || 0, direction: this.map?.events?.[resolvedId]?.pages?.[0]?.graphic?.direction ?? 2, pattern: 1 };
      await this.refreshCurrentMapVisuals("move-route-graphic");
    }
    setScene(scene) {
      this.state.scene = scene;
      if (scene === "PLAYING") this.state.menu = null;
      this.notifyScene();
    }
    notifyScene() {
      this.onSceneChange(this.state.scene);
    }
    move(dx, dy, direction) {
      if (dx !== 0 && dy !== 0) {
        const horizontal = dx < 0 ? 4 : 6;
        const vertical = dy < 0 ? 8 : 2;
        const strict = this.canStep(this.state.x, this.state.y, horizontal) && this.canStep(this.state.x + dx, this.state.y, vertical) && this.canStep(this.state.x, this.state.y, vertical) && this.canStep(this.state.x, this.state.y + dy, horizontal);
        if (strict) {
          this.state.x += dx;
          this.state.y += dy;
          if (this.state.direction === reverse(horizontal)) this.state.direction = horizontal;
          if (this.state.direction === reverse(vertical)) this.state.direction = vertical;
          this.advancePattern();
          return;
        }
        const fallback = this.state.direction === horizontal ? [vertical, horizontal] : this.state.direction === vertical ? [horizontal, vertical] : [];
        for (const candidate of fallback) if (this.moveCardinal(candidate)) return;
        return;
      }
      this.moveCardinal(direction);
    }
    moveCardinal(direction) {
      const [dx, dy] = { 2: [0, 1], 4: [-1, 0], 6: [1, 0], 8: [0, -1] }[direction] ?? [0, 0];
      this.state.direction = direction;
      if (!this.canStep(this.state.x, this.state.y, direction)) return false;
      this.state.x += dx;
      this.state.y += dy;
      this.advancePattern();
      return true;
    }
    canStep(x, y, direction) {
      const [dx, dy] = { 2: [0, 1], 4: [-1, 0], 6: [1, 0], 8: [0, -1] }[direction] ?? [0, 0];
      return this.collision.passable(x, y, direction) && this.collision.passable(x + dx, y + dy, reverse(direction));
    }
    advancePattern() {
      this.state.pattern = [0, 1, 2, 1][(this.state.steps ?? 0) % 4];
      this.state.steps = (this.state.steps ?? 0) + 1;
      this.prefetch?.prefetchLikelyDestinations(this.state.mapId, { x: this.state.x, y: this.state.y });
    }
    showMessage(text) {
      this.state.message = this.expandText(text);
      return new Promise((resolve) => {
        this.messageResolve = resolve;
      });
    }
    showChoice(options) {
      this.state.choice = { options: options.map((item) => this.expandText(item)), selected: 0 };
      return new Promise((resolve) => {
        this.choiceResolve = resolve;
      });
    }
    async nameInput(actorId, maxLength) {
      const current = this.state.actors[actorId]?.name ?? "";
      const modal = {
        id: ++this.modalSequence,
        kind: "name_input",
        actorId,
        maxLength,
        previousScene: this.state.scene,
        openedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      this.modalStack.push(modal);
      this.input.clear();
      this.recordDiagnostic({
        type: "name-input-open",
        modal: { ...modal },
        actorName: current,
        interpreter: this.interpreter.snapshot(),
        sceneStack: [modal.previousScene, "NAME_INPUT"],
        playerInputLocked: true,
        messageBusy: Boolean(this.state.message || this.state.choice),
        focus: focusSnapshot(this.renderer.stage)
      });
      try {
        const name = await this.renderer.promptText("Name", maxLength, current);
        if (name) this.setActorName(actorId, name);
        this.recordDiagnostic({
          type: "name-input-confirm",
          modalId: modal.id,
          actorId,
          actorName: this.state.actors[actorId]?.name ?? "",
          interpreter: this.interpreter.snapshot(),
          sceneStack: [modal.previousScene, "NAME_INPUT"],
          modalPromiseResolved: true,
          commandPromisePending: true,
          playerInputLocked: true,
          messageBusy: Boolean(this.state.message || this.state.choice),
          focus: focusSnapshot(this.renderer.stage)
        });
      } finally {
        const index = this.modalStack.findIndex((entry) => entry.id === modal.id);
        if (index >= 0) this.modalStack.splice(index, 1);
        this.input.clear();
        this.renderer.stage.focus({ preventScroll: true });
        await nextFrame();
        this.recordDiagnostic({
          type: "name-input-return-frame",
          modalId: modal.id,
          actorId,
          actorName: this.state.actors[actorId]?.name ?? "",
          interpreter: this.interpreter.snapshot(),
          modalStack: this.modalStack.map((entry) => entry.kind),
          sceneStack: [modal.previousScene],
          commandPromisePending: true,
          playerInputLocked: true,
          messageBusy: Boolean(this.state.message || this.state.choice),
          focus: focusSnapshot(this.renderer.stage)
        });
        if (this.interpreterTraceEnabled) setTimeout(() => this.recordDiagnostic({
          type: "name-input-return-250ms",
          modalId: modal.id,
          actorId,
          actorName: this.state.actors[actorId]?.name ?? "",
          interpreter: this.interpreter.snapshot(),
          sceneStack: [this.state.scene],
          modalStack: this.modalStack.map((entry) => entry.kind),
          playerInputLocked: this.interpreter.running,
          messageBusy: Boolean(this.state.message || this.state.choice),
          focus: focusSnapshot(this.renderer.stage)
        }), 250);
      }
    }
    setActorName(actorId, name) {
      this.state.actors[actorId] ??= {};
      this.state.actors[actorId].name = name;
    }
    expandText(text) {
      return String(text).replace(/\\[Nn]\[(\d+)\]/g, (_, id) => this.state.actors[id]?.name ?? "").replace(/\\[Cc]\[\d+\]|\\[.!|{}^><]/g, "");
    }
    triggerActionEvent() {
      const vectors = { 2: [0, 1], 4: [-1, 0], 6: [1, 0], 8: [0, -1], 1: [-1, 1], 3: [1, 1], 7: [-1, -1], 9: [1, -1] };
      const [dx, dy] = vectors[this.state.direction] ?? [0, 1];
      const candidates = Object.values(this.map?.events ?? {}).filter((event2) => event2.x === this.state.x && event2.y === this.state.y || event2.x === this.state.x + dx && event2.y === this.state.y + dy);
      const event = candidates.find((candidate) => this.activePage(candidate)?.trigger === 0);
      if (event) this.interpreter.run(this.activePage(event).list, { eventId: event.id });
    }
    playSe(audio) {
      return this.audio.playSe(audio);
    }
    showAnimation(targetId, animationId) {
      const event = targetId === -1 ? null : this.map?.events?.[targetId];
      const target = targetId === -1 ? { x: this.state.x, y: this.state.y } : { x: event?.x ?? this.state.x, y: event?.y ?? this.state.y };
      return this.renderer.showAnimation(target, this.database.animations[animationId]);
    }
    showBalloon(targetId, balloonId) {
      const event = targetId === -1 ? null : this.map?.events?.[targetId];
      const target = targetId === -1 ? { x: this.state.x, y: this.state.y } : { x: event?.x ?? this.state.x, y: event?.y ?? this.state.y };
      return this.renderer.showBalloon(target, balloonId);
    }
    currentRenderableEvents(map = this.map) {
      return Object.values(map?.events ?? {}).flatMap((event) => {
        const page = this.activePage(event);
        const override = this.state.eventOverrides?.[`${this.state.mapId},${event.id}`] ?? {};
        const graphic = override.graphic ?? page?.graphic;
        if (!graphic?.character_name) return [];
        return [{ id: event.id, x: override.x ?? event.x, y: override.y ?? event.y, direction: override.direction ?? graphic.direction, pattern: override.pattern ?? graphic.pattern, opacity: override.opacity ?? 255, priority: page?.priority_type ?? 1, graphic, page: { ...page, graphic } }];
      });
    }
    runRubyCompatibility(source) {
      if (String(source).trim() === "recipe_all_switch_on") {
        this.party.unlockAllRecipes(this.state);
        return;
      }
      if (/^SceneManager\.call\(Scene_ItemSynthesis\)$/.test(String(source).trim())) {
        this.openSynthesisMenu();
        return;
      }
      const recipe = /^([iwa])_recipe_switch_on\((\d+)\)$/.exec(String(source).trim());
      if (recipe) {
        const kind = { i: "item", w: "weapon", a: "armor" }[recipe[1]];
        this.state.party.recipes[kind][recipe[2]] = true;
        return;
      }
      const copyName = /^\$game_actors\[(\d+)\]\.name\s*=\s*\$game_actors\[(\d+)\]\.name$/.exec(String(source).trim());
      if (copyName) {
        this.setActorName(Number(copyName[1]), this.state.actors[copyName[2]]?.name ?? "");
        return;
      }
      const journal = /^RETCON::Journal::journal_activate\((\d+)\)$/.exec(source);
      if (journal) {
        this.state.journal ??= {};
        this.state.journal[journal[1]] = true;
        return;
      }
      if (source === "$game_party.steps = 0") {
        this.state.steps = 0;
        return;
      }
      if (source === "reset_stealth") {
        this.state.stealth = false;
        return;
      }
      this.noteUnsupported(355, source);
    }
    evaluateRubyCondition(source) {
      const actorName = /^\$game_actors\[(\d+)\]\.name\s*==\s*["'](.*)["']$/.exec(source);
      if (actorName) return (this.state.actors[actorName[1]]?.name ?? "") === actorName[2];
      this.noteUnsupported(111, source);
      return false;
    }
    noteUnsupported(code, detail = "") {
      const key = `${code}${detail ? `:${detail}` : ""}`;
      if (this.unsupported.has(key)) return;
      this.unsupported.add(key);
      console.warn(`[BLACK SOULS] Unsupported command ${key}`);
      this.recordDiagnostic({ type: "compatibility-gap", code, detail });
    }
    recordDiagnostic(entry) {
      this.diagnosticsLog.push({ at: (/* @__PURE__ */ new Date()).toISOString(), ...entry });
      this.diagnosticsLog = this.diagnosticsLog.slice(-30);
    }
    getDiagnostics() {
      return {
        map: { id: this.state?.mapId, name: this.map?.display_name, tileset: this.renderer.stats.tileset, x: this.state?.x, y: this.state?.y },
        scene: this.state?.scene,
        title: {
          graphic1: this.renderer.stats.title?.title1 ?? null,
          graphic2: this.renderer.stats.title?.title2 ?? null,
          bgm: this.database?.system?.title_bgm?.name ?? null,
          asset: this.renderer.stats.title?.title1?.path ? this.loader.assetDiagnostics(this.renderer.stats.title.title1.path) : null
        },
        playerAsset: this.renderer.playerGraphic?.character_name ?? null,
        party: { members: [...this.state.party?.members ?? []], gold: this.state.party?.gold ?? 0, inventory: structuredClone(this.state.party?.inventory ?? {}) },
        battle: this.state.battle ? {
          troopId: this.state.battle.troopId,
          phase: this.state.battle.phase,
          result: this.state.battle.result,
          difficulty: this.state.battle.difficulty,
          frames: this.state.battle.frames,
          actors: this.state.battle.actors.map(({ name, hp, mp, tp, ap, chant, states }) => ({ name, hp, mp, tp, ap, chant, states })),
          enemies: this.state.battle.enemies.map(({ enemyId, name, hp, mp, tp, ap, chant, states }) => ({ enemyId, name, hp, mp, tp, ap, chant, states })),
          rewards: this.state.battle.rewards ?? null,
          log: this.state.battle.log.slice(-12)
        } : null,
        interpreter: this.interpreter?.diagnostics(),
        modals: this.modalStack.map((entry) => ({ ...entry })),
        streaming: this.prefetch?.getStatus(),
        assets: this.loader.diagnostics(),
        audio: this.audio?.diagnostics(),
        renderer: this.renderer.diagnostics(),
        unsupported: [...this.unsupported],
        log: [...this.diagnosticsLog]
      };
    }
    snapshot() {
      return structuredClone(this.state);
    }
    async save(slot) {
      await this.saves.save(slot, this.snapshot());
      this.hasSave = true;
      this.status(`Đã lưu vào slot ${slot}.`);
    }
    async load(slot) {
      const state = await this.saves.load(slot);
      if (!state) throw new Error(`Save slot ${slot} is empty.`);
      this.state = state;
      this.party.normalizeState(this.state);
      this.state.eventOverrides ??= {};
      this.state.pictures ??= {};
      this.state.battle = null;
      this.state.scene = "PLAYING";
      this.state.menu = null;
      await this.loadMap(state.mapId);
      await Promise.all(Object.values(this.state.pictures).filter((picture) => picture?.name).map((picture) => this.renderer.showPicture?.(picture.id, picture.name, picture)));
      if (this.state.screenTone) void this.renderer.tintScreen?.(this.state.screenTone.tone, 0);
      if (this.state.screenFlash) void this.renderer.flashScreen?.(this.state.screenFlash.color, this.state.screenFlash.frames);
      if (this.state.screenShake) void this.renderer.shakeScreen?.(this.state.screenShake.power, this.state.screenShake.speed, this.state.screenShake.frames);
      if (this.state.weather) void this.renderer.setWeather?.(this.state.weather.type, this.state.weather.power, 0);
      this.notifyScene();
      this.status(`Đã tải slot ${slot}.`);
    }
    pause() {
      this.paused = true;
      this.input?.clear();
    }
    resume() {
      this.paused = false;
      this.input?.clear();
    }
    async destroy() {
      this.running = false;
      cancelAnimationFrame(this.frame);
      this.input?.destroy();
      this.audio?.destroy();
      this.loader.destroy();
    }
  };
  function cycle(value, delta, length) {
    return (value + delta + length) % length;
  }
  function reverse(direction) {
    return 10 - direction;
  }
  function nextFrame() {
    return new Promise((resolve) => {
      if (typeof globalThis.requestAnimationFrame === "function") globalThis.requestAnimationFrame(() => resolve());
      else queueMicrotask(resolve);
    });
  }
  function focusSnapshot(stage) {
    const active = globalThis.document?.activeElement;
    return { activeElement: active?.tagName ?? null, gameHasFocus: active === stage, inputCaptureEnabled: !active || !/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) };
  }

  // runtime/streaming/prefetch-manager.js
  var PREFETCH_PRIORITY = Object.freeze({ CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3, IDLE: 4 });
  var DEFAULT_TIMEOUTS = Object.freeze({ json: 1e4, image: 18e3, audio: 3e4, binary: 18e3 });
  var PrefetchManager = class {
    constructor({
      version = "dev",
      dataVersion = "dev",
      assetVersion = "dev",
      fetchImpl = (...args) => fetch(...args),
      cacheStorage = safeCacheStorage(),
      maxConcurrent = 8,
      reservedCritical = 2,
      memoryBudgetBytes = 64 * 1024 * 1024,
      decodedBudgetBytes = 160 * 1024 * 1024,
      now = () => globalThis.performance?.now?.() ?? Date.now(),
      backoffMs = 120,
      onDiagnostic = () => {
      },
      timeouts = {},
      developerMode = false,
      persistentEnabled = true
    } = {}) {
      this.versionKey = `${version}:${dataVersion}:${assetVersion}`;
      this.cacheName = `black-souls-stream-v1-${safeKey(this.versionKey)}`;
      this.fetchImpl = fetchImpl;
      this.cacheStorage = cacheStorage;
      this.maxConcurrent = maxConcurrent;
      this.reservedCritical = Math.min(reservedCritical, Math.max(0, maxConcurrent - 1));
      this.now = now;
      this.backoffMs = backoffMs;
      this.onDiagnostic = onDiagnostic;
      this.timeouts = { ...DEFAULT_TIMEOUTS, ...timeouts };
      this.developerMode = developerMode;
      this.persistentEnabled = persistentEnabled;
      this.memory = new WeightedLru(memoryBudgetBytes);
      this.decoded = new WeightedLru(decodedBudgetBytes);
      this.parsed = new WeightedLru(24 * 1024 * 1024);
      this.inflight = /* @__PURE__ */ new Map();
      this.queue = [];
      this.active = /* @__PURE__ */ new Map();
      this.sequence = 0;
      this.mapWarmups = /* @__PURE__ */ new Map();
      this.transition = idleTransition();
      this.transitionTimers = [];
      this.metrics = {
        requests: 0,
        prefetchRequests: 0,
        prefetchHits: 0,
        prefetchMisses: 0,
        memoryCacheHits: 0,
        decodedCacheHits: 0,
        parsedCacheHits: 0,
        persistentCacheHits: 0,
        networkFetchCount: 0,
        bytesFetched: 0,
        duplicateRequestsAvoided: 0,
        retries: 0,
        fallbacks: 0,
        timeouts: 0,
        failures: 0,
        fetchMs: 0,
        decodeMs: 0,
        transitions: []
      };
    }
    bindLoader(loader) {
      this.loader = loader;
    }
    setManifest(manifest) {
      this.manifest = manifest;
    }
    setContextProvider(provider) {
      this.contextProvider = provider;
    }
    async fetchBytes(key, candidates, {
      priority = PREFETCH_PRIORITY.CRITICAL,
      kind = "binary",
      purpose = "runtime",
      retries = 1,
      timeoutMs = this.timeouts[kind] ?? this.timeouts.binary,
      validate = () => {
      },
      persistent = this.persistentEnabled
    } = {}) {
      const logicalKey = this.versioned(key);
      this.metrics.requests += 1;
      if (purpose === "prefetch") this.metrics.prefetchRequests += 1;
      const cached = this.memory.get(logicalKey);
      if (cached) {
        this.metrics.memoryCacheHits += 1;
        return cached;
      }
      if (this.inflight.has(logicalKey)) {
        this.metrics.duplicateRequestsAvoided += 1;
        this.bump(logicalKey, priority);
        return this.inflight.get(logicalKey);
      }
      const pending = this.schedule(logicalKey, priority, async () => {
        const result = await this.loadCandidates(logicalKey, normalizeCandidates(candidates), { kind, retries, timeoutMs, validate, persistent, priority });
        this.memory.set(logicalKey, result, result.bytes.byteLength);
        return result;
      });
      this.inflight.set(logicalKey, pending);
      try {
        return await pending;
      } finally {
        this.inflight.delete(logicalKey);
      }
    }
    async loadCandidates(logicalKey, candidates, options) {
      let lastError;
      const failures = [];
      for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
        const candidate = candidates[candidateIndex];
        const attempts = candidateIndex === 0 ? Math.max(1, options.retries + 1) : 1;
        for (let attemptIndex = 0; attemptIndex < attempts; attemptIndex += 1) {
          const attempt = { key: logicalKey, url: candidate.url, source: candidate.source, candidateIndex, attemptIndex, kind: options.kind };
          try {
            const persistent = options.persistent ? await this.persistentMatch(candidate.url, options.validate, attempt) : null;
            if (persistent) return persistent;
            const began = this.now();
            this.metrics.networkFetchCount += 1;
            const response = await this.fetchWithTimeout(candidate.url, options.timeoutMs);
            const bytes = new Uint8Array(await response.arrayBuffer());
            const meta = responseMeta(response, candidate);
            options.validate(bytes, meta);
            const elapsed = this.now() - began;
            this.metrics.bytesFetched += bytes.byteLength;
            this.metrics.fetchMs += elapsed;
            if (candidateIndex > 0) this.metrics.fallbacks += 1;
            const result = { bytes, ...meta, elapsedMs: elapsed };
            if (options.persistent) await this.persistentPut(candidate.url, result);
            this.emit({ type: "stream-fetch-ready", ...attempt, status: result.status, bytes: bytes.byteLength, elapsedMs: elapsed });
            return result;
          } catch (error) {
            lastError = error;
            failures.push({ ...attempt, error: error.message, code: error.code ?? "FETCH_FAILED", diagnostics: error.diagnostics ?? null });
            if (error?.code === "FETCH_TIMEOUT") this.metrics.timeouts += 1;
            const retrying = candidateIndex === 0 && attemptIndex + 1 < attempts;
            if (retrying) {
              this.metrics.retries += 1;
              await delay(this.backoffMs * (attemptIndex + 1));
            }
            this.emit({ type: "stream-fetch-failed", ...attempt, retrying, error: error.message, code: error.code ?? "FETCH_FAILED" });
          }
        }
      }
      this.metrics.failures += 1;
      if (lastError && !lastError.attempts) lastError.attempts = failures;
      throw lastError ?? new Error(`No fetch candidates for ${logicalKey}`);
    }
    async fetchWithTimeout(url, timeoutMs) {
      const controller = new AbortController();
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          const error = new Error(`Fetch timed out after ${timeoutMs} ms: ${url}`);
          error.code = "FETCH_TIMEOUT";
          reject(error);
        }, timeoutMs);
      });
      try {
        const response = await Promise.race([
          this.fetchImpl(url, { mode: "cors", cache: "default", signal: controller.signal }),
          timeout
        ]);
        if (!response.ok) {
          const error = new Error(`HTTP ${response.status} ${response.statusText}`);
          error.code = "HTTP_ERROR";
          throw error;
        }
        return response;
      } finally {
        clearTimeout(timer);
      }
    }
    schedule(key, priority, run) {
      let resolveTask;
      let rejectTask;
      const promise = new Promise((resolve, reject) => {
        resolveTask = resolve;
        rejectTask = reject;
      });
      this.queue.push({ key, priority, run, resolve: resolveTask, reject: rejectTask, queuedAt: this.now(), sequence: ++this.sequence });
      this.pump();
      return promise;
    }
    pump() {
      queueMicrotask(() => {
        while (this.active.size < this.maxConcurrent && this.queue.length) {
          this.queue.sort((a, b) => a.priority - b.priority || a.sequence - b.sequence);
          const highIndex = this.queue.findIndex((item) => item.priority <= PREFETCH_PRIORITY.HIGH);
          const speculativeLimit = this.maxConcurrent - this.reservedCritical;
          const index = highIndex >= 0 ? highIndex : this.active.size < speculativeLimit ? 0 : -1;
          if (index < 0) break;
          const task = this.queue.splice(index, 1)[0];
          task.startedAt = this.now();
          this.active.set(task.key, task);
          Promise.resolve().then(task.run).then(task.resolve, task.reject).finally(() => {
            this.active.delete(task.key);
            this.pump();
          });
        }
      });
    }
    bump(key, priority) {
      const task = this.queue.find((item) => item.key === key);
      if (task) task.priority = Math.min(task.priority, priority);
    }
    cancelLowPriority() {
      const cancelled = this.queue.filter((task) => task.priority >= PREFETCH_PRIORITY.LOW);
      this.queue = this.queue.filter((task) => task.priority < PREFETCH_PRIORITY.LOW);
      for (const task of cancelled) {
        const error = new Error(`Cancelled speculative prefetch: ${task.key}`);
        error.name = "AbortError";
        task.reject(error);
      }
      return cancelled.length;
    }
    getDecoded(key) {
      const value = this.decoded.get(this.versioned(key));
      if (value) this.metrics.decodedCacheHits += 1;
      return value;
    }
    setDecoded(key, value, bytes) {
      this.decoded.set(this.versioned(key), value, bytes);
    }
    hasResource(key) {
      return this.memory.entries.has(this.versioned(key));
    }
    recordDecode(milliseconds) {
      this.metrics.decodeMs += milliseconds;
    }
    getParsed(key) {
      const value = this.parsed.get(this.versioned(key));
      if (value) this.metrics.parsedCacheHits += 1;
      return value;
    }
    setParsed(key, value, bytes = 1) {
      this.parsed.set(this.versioned(key), value, bytes);
    }
    async prefetchAssets(paths, { priority = PREFETCH_PRIORITY.NORMAL, reason = "assets" } = {}) {
      if (!this.loader) return [];
      return Promise.allSettled(unique(paths).map((path) => this.loader.prefetchAsset(path, { priority, purpose: "prefetch", reason })));
    }
    async prefetchMap(mapId, { priority = PREFETCH_PRIORITY.HIGH, criticalOnly = false, reason = "map", awaitOptional = false, onCriticalProgress = null } = {}) {
      const dependency = this.manifest?.maps?.[mapId];
      if (!this.loader || !dependency) return null;
      const began = this.now();
      const status = this.mapWarmups.get(mapId) ?? { mapId, ready: false, priority, requestedAt: began, criticalReady: 0, criticalTotal: dependency.criticalAssets.length + 1 };
      status.priority = Math.min(status.priority, priority);
      this.mapWarmups.set(mapId, status);
      const labels = [dependency.dataPath ?? `Map ${mapId}`, ...dependency.criticalAssets];
      const track = (label, promise) => promise.then(
        (value) => {
          onCriticalProgress?.({ label, ready: true });
          return value;
        },
        (error) => {
          onCriticalProgress?.({ label, ready: false, error: error.message });
          throw error;
        }
      );
      const mapPromise = track(labels[0], this.loader.map(mapId, { priority, purpose: "prefetch" }));
      const critical = dependency.criticalAssets.map((path) => track(path, this.loader.prefetchAsset(path, { priority, purpose: "prefetch", reason })));
      const optionalPaths = criticalOnly ? [] : (dependency.warmAssets ?? dependency.assets).filter((path) => !dependency.criticalAssets.includes(path));
      const optionalPriority = Math.min(PREFETCH_PRIORITY.IDLE, priority + 1);
      const optional = optionalPaths.map((path) => this.loader.prefetchAsset(path, { priority: optionalPriority, purpose: "prefetch", reason, optional: true }));
      const criticalResults = await Promise.allSettled([mapPromise, ...critical]);
      status.criticalReady = criticalResults.filter((item) => item.status === "fulfilled").length;
      status.ready = criticalResults.every((item) => item.status === "fulfilled");
      status.readyAt = this.now();
      status.elapsedMs = status.readyAt - began;
      status.failures = criticalResults.flatMap((item, index) => item.status === "rejected" ? [{ path: labels[index], error: item.reason?.message ?? String(item.reason) }] : []);
      if (awaitOptional) await Promise.allSettled(optional);
      else void Promise.allSettled(optional);
      this.emit({ type: "map-prefetch-ready", mapId, reason, priority, ready: status.ready, elapsedMs: status.elapsedMs, failures: status.failures });
      return status;
    }
    prefetchLikelyDestinations(mapId, { x = 0, y = 0 } = {}) {
      const signature = `${mapId}:${Math.floor(x / 4)}:${Math.floor(y / 4)}`;
      if (this.lastPrediction?.signature === signature) return this.lastPrediction.result;
      const dependency = this.manifest?.maps?.[mapId];
      const distance = /* @__PURE__ */ new Map();
      for (const point of dependency?.transferPoints ?? []) distance.set(point.mapId, Math.min(distance.get(point.mapId) ?? Infinity, Math.abs(point.x - x) + Math.abs(point.y - y)));
      const candidates = [...this.manifest?.transferGraph?.[mapId] ?? []].sort((left, right) => (distance.get(left) ?? Infinity) - (distance.get(right) ?? Infinity));
      const direct = candidates.slice(0, 2);
      const deferred = candidates.slice(2, 6);
      const second = unique(direct.flatMap((id) => this.manifest?.transferGraph?.[id] ?? [])).filter((id) => !candidates.includes(id) && id !== Number(mapId)).slice(0, 6);
      for (const id of direct) void this.prefetchMap(id, { priority: PREFETCH_PRIORITY.HIGH, reason: `map-${mapId}-direct` });
      for (const id of second) void this.prefetchMap(id, { priority: PREFETCH_PRIORITY.NORMAL, reason: `map-${mapId}-second-hop` });
      for (const id of deferred) void this.prefetchMap(id, { priority: PREFETCH_PRIORITY.LOW, reason: `map-${mapId}-branch` });
      const result = { direct, second, deferred };
      this.lastPrediction = { signature, result };
      return result;
    }
    prefetchRoute(routeId) {
      const levels = this.manifest?.routes?.[routeId] ?? [];
      for (const level of levels) {
        const priority = level.depth === 0 ? PREFETCH_PRIORITY.HIGH : level.depth === 1 ? PREFETCH_PRIORITY.NORMAL : PREFETCH_PRIORITY.LOW;
        for (const mapId of level.mapIds ?? []) void this.prefetchMap(mapId, { priority, reason: `route-${routeId}-depth-${level.depth}` });
      }
      return levels;
    }
    scanUpcoming(list, start = 0, { limit = this.manifest?.policy?.eventLookahead ?? 48, commonDepth = 2 } = {}) {
      const actions = [];
      for (const command of (list ?? []).slice(start, start + limit)) {
        const parameters = command?.parameters ?? [];
        if (command?.code === 201 && parameters[0] === 0) actions.push({ type: "map", mapId: Number(parameters[1]), priority: PREFETCH_PRIORITY.HIGH });
        if (command?.code === 212) actions.push(...(this.manifest?.animations?.[Number(parameters[1])]?.assets ?? []).map((path) => ({ type: "asset", path, priority: PREFETCH_PRIORITY.HIGH })));
        if (command?.code === 231 && parameters[1]) actions.push({ type: "asset", path: this.resolveAsset(`Graphics/Pictures/${parameters[1]}`), priority: PREFETCH_PRIORITY.HIGH });
        if (command?.code === 241) actions.push({ type: "asset", path: this.resolveAudio("BGM", parameters[0]), priority: PREFETCH_PRIORITY.HIGH });
        if (command?.code === 245) actions.push({ type: "asset", path: this.resolveAudio("BGS", parameters[0]), priority: PREFETCH_PRIORITY.HIGH });
        if (command?.code === 249) actions.push({ type: "asset", path: this.resolveAudio("ME", parameters[0]), priority: PREFETCH_PRIORITY.NORMAL });
        if (command?.code === 250) actions.push({ type: "asset", path: this.resolveAudio("SE", parameters[0]), priority: PREFETCH_PRIORITY.NORMAL });
        if (command?.code === 301 && parameters[0] === 0) actions.push(...(this.manifest?.battles?.[Number(parameters[1])]?.assets ?? []).map((path) => ({ type: "asset", path, priority: PREFETCH_PRIORITY.HIGH })));
        if (command?.code === 322) {
          if (parameters[1]) actions.push({ type: "asset", path: this.resolveAsset(`Graphics/Characters/${parameters[1]}`), priority: PREFETCH_PRIORITY.HIGH });
          if (parameters[3]) actions.push({ type: "asset", path: this.resolveAsset(`Graphics/Faces/${parameters[3]}`), priority: PREFETCH_PRIORITY.NORMAL });
        }
        if (command?.code === 205) {
          for (const move of parameters[1]?.list ?? []) if (move.code === 41 && move.parameters?.[0]) actions.push({ type: "asset", path: this.resolveAsset(`Graphics/Characters/${move.parameters[0]}`), priority: PREFETCH_PRIORITY.HIGH });
        }
        if (command?.code === 117) actions.push(...this.commonActions(Number(parameters[0]), commonDepth));
      }
      const deduped = dedupeActions(actions.filter((action) => action.path || action.mapId));
      for (const action of deduped) {
        if (action.type === "map") void this.prefetchMap(action.mapId, { priority: action.priority, reason: "event-lookahead" });
        else void this.prefetchAssets([action.path], { priority: action.priority, reason: "event-lookahead" });
      }
      return deduped;
    }
    commonActions(id, depth, seen = /* @__PURE__ */ new Set()) {
      if (!id || depth < 0 || seen.has(id)) return [];
      seen.add(id);
      const dependency = this.manifest?.commonEvents?.[id];
      if (!dependency) return [];
      return [
        ...(dependency.assets ?? []).map((path) => ({ type: "asset", path, priority: PREFETCH_PRIORITY.NORMAL })),
        ...(dependency.transfers ?? []).map((mapId) => ({ type: "map", mapId, priority: PREFETCH_PRIORITY.NORMAL })),
        ...(dependency.commonEvents ?? []).flatMap((next) => this.commonActions(next, depth - 1, seen))
      ];
    }
    async prepareMap(mapId, { x = 0, y = 0 } = {}) {
      const dependency = this.manifest?.maps?.[mapId];
      const viewportAssets = unique((dependency?.eventAssets ?? []).filter((event) => Math.abs(event.x - x) <= 12 && Math.abs(event.y - y) <= 9).map((event) => event.path));
      this.beginTransition(mapId, unique([dependency?.dataPath ?? `Map ${mapId}`, ...dependency?.criticalAssets ?? [], ...viewportAssets]));
      const mark = ({ label, ready }) => {
        if (this.transition.targetMapId !== mapId || this.transition.state !== "loading") return;
        if (ready) this.transition.criticalReady += 1;
        this.transition.waitingFor = this.transition.waitingFor.filter((path) => path !== label);
      };
      const before = this.mapWarmups.get(mapId)?.ready === true;
      if (before) this.metrics.prefetchHits += 1;
      else this.metrics.prefetchMisses += 1;
      const status = await this.prefetchMap(mapId, { priority: PREFETCH_PRIORITY.CRITICAL, criticalOnly: false, reason: "transition-barrier", onCriticalProgress: mark });
      const viewportResults = await Promise.allSettled(viewportAssets.map((path) => this.loader.prefetchAsset(path, { priority: PREFETCH_PRIORITY.CRITICAL, purpose: "prefetch", reason: "initial-viewport", optional: true }).then(
        (value) => {
          mark({ label: path, ready: true });
          return value;
        },
        (error) => {
          mark({ label: path, ready: false, error: error.message });
          throw error;
        }
      )));
      this.transition.criticalReady = (status?.criticalReady ?? 0) + viewportResults.filter((item) => item.status === "fulfilled").length;
      this.transition.criticalTotal = (status?.criticalTotal ?? 0) + viewportAssets.length;
      this.transition.waitingFor = unique([
        ...(status?.failures ?? []).map((failure) => failure.path),
        ...viewportResults.flatMap((item, index) => item.status === "rejected" ? [viewportAssets[index]] : [])
      ]);
      this.transition.prefetchHit = before;
      return status;
    }
    markMapVisible(mapId, position = {}) {
      const elapsedMs = this.now() - this.transition.startedAt;
      const record = { mapId, elapsedMs, prefetchHit: this.transition.prefetchHit, at: (/* @__PURE__ */ new Date()).toISOString() };
      this.metrics.transitions.push(record);
      this.metrics.transitions = this.metrics.transitions.slice(-100);
      this.clearTransitionTimers();
      this.transition = { ...this.transition, state: "visible", elapsedMs, completedAt: this.now() };
      this.pinMap(mapId);
      this.emit({ type: "map-transition-visible", ...record });
      queueMicrotask(() => this.prefetchLikelyDestinations(mapId, position));
      return record;
    }
    failTransition(mapId, error) {
      this.clearTransitionTimers();
      this.transition = { ...this.transition, state: "failed", mapId, elapsedMs: this.now() - this.transition.startedAt, error: error.message };
    }
    beginTransition(mapId, criticalAssets) {
      this.clearTransitionTimers();
      this.transition = { state: "loading", targetMapId: mapId, startedAt: this.now(), criticalReady: 0, criticalTotal: criticalAssets.length, waitingFor: [...criticalAssets], prefetchHit: false, warning: null };
      this.transitionTimers.push(setTimeout(() => this.transitionWarning("warning"), 3e3));
      this.transitionTimers.push(setTimeout(() => this.transitionWarning("serious"), 1e4));
    }
    transitionWarning(level) {
      if (this.transition.state !== "loading") return;
      this.transition.warning = level;
      const entry = { type: "TRANSITION_STALL", level, ...this.transitionSnapshot(), context: this.contextProvider?.() ?? null };
      this.emit(entry);
      if (this.developerMode) console.warn("[BLACK SOULS]", entry);
    }
    pinMap(mapId) {
      this.memory.unpinAll();
      this.decoded.unpinAll();
      this.parsed.unpinAll();
      const dependency = this.manifest?.maps?.[mapId];
      if (!dependency) return;
      this.parsed.pin(this.versioned(`map:${mapId}`));
      for (const path of dependency.criticalAssets ?? []) {
        this.memory.pin(this.versioned(`asset:${normalKey(path)}`));
        this.decoded.pin(this.versioned(`image:${normalKey(path)}`));
      }
    }
    transitionSnapshot() {
      const elapsedMs = this.transition.state === "loading" && this.transition.startedAt ? this.now() - this.transition.startedAt : this.transition.elapsedMs ?? 0;
      return { ...this.transition, elapsedMs };
    }
    getStatus() {
      const transitions = this.metrics.transitions.map((item) => item.elapsedMs).sort((a, b) => a - b);
      const active = [...this.active.values()].map((task) => ({ key: task.key, priority: priorityName(task.priority), ageMs: this.now() - task.startedAt }));
      const queued = this.queue.map((task) => ({ key: task.key, priority: priorityName(task.priority), ageMs: this.now() - task.queuedAt }));
      return {
        versionKey: this.versionKey,
        cacheName: this.cacheName,
        policy: { maxConcurrent: this.maxConcurrent, reservedCritical: this.reservedCritical, lookahead: this.manifest?.policy?.eventLookahead ?? 48, graphDepth: 2, timeouts: { ...this.timeouts } },
        transition: this.transitionSnapshot(),
        pendingCriticalFetches: active.filter((item) => item.priority === "CRITICAL").length + queued.filter((item) => item.priority === "CRITICAL").length,
        oldestRequestAge: Math.max(0, ...active.map((item) => item.ageMs), ...queued.map((item) => item.ageMs)),
        active,
        queued,
        warmMaps: [...this.mapWarmups.values()].map(({ mapId, ready, priority, elapsedMs, failures }) => ({ mapId, ready, priority: priorityName(priority), elapsedMs, failures })),
        memory: this.memory.status(),
        decoded: this.decoded.status(),
        parsed: this.parsed.status(),
        metrics: {
          ...this.metrics,
          averageTransitionMs: average2(transitions),
          p95TransitionMs: percentile(transitions, 0.95),
          prefetchHitRate: ratio(this.metrics.prefetchHits, this.metrics.prefetchHits + this.metrics.prefetchMisses)
        }
      };
    }
    destroy() {
      this.cancelLowPriority();
      this.clearTransitionTimers();
      this.memory.clear();
      this.decoded.clear();
      this.parsed.clear();
      this.inflight.clear();
    }
    resolveAsset(base) {
      return this.loader?.resolveEntry(base)?.path ?? null;
    }
    resolveAudio(folder, descriptor) {
      return descriptor?.name ? this.resolveAsset(`Audio/${folder}/${descriptor.name}`) : null;
    }
    versioned(key) {
      return `${this.versionKey}:${key}`;
    }
    emit(entry) {
      try {
        this.onDiagnostic({ at: (/* @__PURE__ */ new Date()).toISOString(), ...entry });
      } catch {
      }
    }
    clearTransitionTimers() {
      for (const timer of this.transitionTimers) clearTimeout(timer);
      this.transitionTimers = [];
    }
    async persistentMatch(url, validate, attempt) {
      if (!this.cacheStorage?.open) return null;
      try {
        const cache = await this.cacheStorage.open(this.cacheName);
        const response = await cache.match(url);
        if (!response) return null;
        const bytes = new Uint8Array(await response.arrayBuffer());
        const meta = responseMeta(response, { url, source: "persistent-cache" });
        try {
          validate(bytes, meta);
        } catch (error) {
          await cache.delete?.(url);
          throw error;
        }
        this.metrics.persistentCacheHits += 1;
        this.emit({ type: "persistent-cache-hit", ...attempt, bytes: bytes.byteLength });
        return { bytes, ...meta, elapsedMs: 0 };
      } catch (error) {
        this.emit({ type: "persistent-cache-read-failed", url, error: error.message });
        return null;
      }
    }
    async persistentPut(url, result) {
      if (!this.cacheStorage?.open || typeof Response === "undefined") return;
      try {
        const cache = await this.cacheStorage.open(this.cacheName);
        await cache.put(url, new Response(result.bytes.slice(), { status: 200, headers: { "content-type": result.contentType || "application/octet-stream", "x-black-souls-source": result.source || "" } }));
      } catch (error) {
        this.emit({ type: "persistent-cache-write-failed", url, error: error.message });
      }
    }
  };
  var WeightedLru = class {
    constructor(budgetBytes) {
      this.budgetBytes = budgetBytes;
      this.bytes = 0;
      this.entries = /* @__PURE__ */ new Map();
    }
    get(key) {
      const entry = this.entries.get(key);
      if (!entry) return null;
      this.entries.delete(key);
      this.entries.set(key, entry);
      entry.lastAccess = Date.now();
      return entry.value;
    }
    set(key, value, bytes = 1) {
      const previous = this.entries.get(key);
      if (previous) this.bytes -= previous.bytes;
      this.entries.delete(key);
      this.entries.set(key, { value, bytes: Math.max(1, Number(bytes) || 1), pinned: previous?.pinned ?? false, lastAccess: Date.now() });
      this.bytes += Math.max(1, Number(bytes) || 1);
      this.evict();
      return value;
    }
    pin(key) {
      const entry = this.entries.get(key);
      if (entry) entry.pinned = true;
    }
    unpinAll() {
      for (const entry of this.entries.values()) entry.pinned = false;
      this.evict();
    }
    evict() {
      for (const [key, entry] of this.entries) {
        if (this.bytes <= this.budgetBytes) break;
        if (entry.pinned) continue;
        this.entries.delete(key);
        this.bytes -= entry.bytes;
      }
    }
    clear() {
      this.entries.clear();
      this.bytes = 0;
    }
    status() {
      return { entries: this.entries.size, bytes: this.bytes, budgetBytes: this.budgetBytes, pinned: [...this.entries.values()].filter((entry) => entry.pinned).length };
    }
  };
  function normalizeCandidates(candidates) {
    return (candidates ?? []).map((candidate, index) => typeof candidate === "string" ? { url: candidate, source: index ? `fallback-${index}` : "primary" } : candidate);
  }
  function responseMeta(response, candidate) {
    return { url: candidate.url, finalUrl: response.url || candidate.url, source: candidate.source, status: response.status, contentType: response.headers?.get?.("content-type") || "", contentLength: response.headers?.get?.("content-length") || "", redirected: Boolean(response.redirected) };
  }
  function safeKey(value) {
    return String(value).replace(/[^a-z0-9._-]+/gi, "-").slice(0, 120);
  }
  function normalKey(path) {
    return String(path).replaceAll("\\", "/").replace(/^\.\//, "").toLocaleLowerCase();
  }
  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }
  function priorityName(value) {
    return Object.entries(PREFETCH_PRIORITY).find(([, priority]) => priority === value)?.[0] ?? String(value);
  }
  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  function average2(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  }
  function percentile(values, percentileValue) {
    return values.length ? values[Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * percentileValue) - 1))] : 0;
  }
  function ratio(left, total) {
    return total ? left / total : 0;
  }
  function idleTransition() {
    return { state: "idle", targetMapId: null, startedAt: 0, criticalReady: 0, criticalTotal: 0, waitingFor: [], prefetchHit: false, warning: null };
  }
  function safeCacheStorage() {
    try {
      return globalThis.caches ?? null;
    } catch {
      return null;
    }
  }
  function dedupeActions(actions) {
    const result = /* @__PURE__ */ new Map();
    for (const action of actions) {
      const key = action.type === "map" ? `map:${action.mapId}` : `asset:${action.path}`;
      const previous = result.get(key);
      if (!previous || action.priority < previous.priority) result.set(key, action);
    }
    return [...result.values()];
  }

  // runtime/assets/asset-resolver.js
  var LFS_SIGNATURE = "version https://git-lfs.github.com/spec/v1";
  var AssetError = class extends Error {
    constructor(code, message, diagnostics = {}) {
      super(message);
      this.name = "AssetError";
      this.code = code;
      this.diagnostics = diagnostics;
    }
  };
  var AssetResolver = class {
    constructor({ manifest, runtimeBaseUrl, repository, fetchImpl = (...args) => fetch(...args), onDiagnostic = () => {
    }, streaming = null }) {
      this.manifest = manifest;
      this.runtimeBaseUrl = new URL(runtimeBaseUrl);
      this.repository = repository;
      this.fetchImpl = fetchImpl;
      this.onDiagnostic = onDiagnostic;
      this.entries = new Map((manifest.assets ?? []).map((entry) => [normalKey2(entry.path), entry]));
      this.byBase = /* @__PURE__ */ new Map();
      for (const entry of manifest.assets ?? []) {
        const key = normalKey2(stripExtension(entry.path));
        if (!this.byBase.has(key)) this.byBase.set(key, entry);
      }
      this.streaming = streaming ?? new PrefetchManager({ version: "standalone", assetVersion: repository?.ref ?? "test", fetchImpl, cacheStorage: null, onDiagnostic });
      this.ownsStreaming = !streaming;
      this.imageInflight = /* @__PURE__ */ new Map();
      this.audioUrlCache = /* @__PURE__ */ new Map();
      this.assetReports = /* @__PURE__ */ new Map();
      this.objectUrls = /* @__PURE__ */ new Set();
      this.stats = { requests: 0, cacheHits: 0, loaded: 0, decoded: 0, failed: 0, lfsPointersRejected: 0, sources: {}, lastError: null, lastLoaded: null, lastDecodeError: null };
    }
    entry(path) {
      return this.entries.get(normalKey2(path)) ?? this.byBase.get(normalKey2(stripExtension(path))) ?? null;
    }
    candidates(path) {
      const entry = this.entry(path);
      const requested = entry?.path ?? path;
      const urls = [];
      if (entry?.deliveryPath) {
        urls.push({ source: "runtime-bundle", url: new URL(encodePath(entry.deliveryPath), this.runtimeBaseUrl).href });
      }
      if (this.repository?.developmentBaseUrl) {
        urls.push({ source: "development-local", url: new URL(encodePath(requested), this.repository.developmentBaseUrl).href });
      }
      if (this.repository?.owner && this.repository?.name && this.repository?.ref) {
        const base = `https://media.githubusercontent.com/media/${encodeURIComponent(this.repository.owner)}/${encodeURIComponent(this.repository.name)}/${encodeURIComponent(this.repository.ref)}/`;
        urls.push({ source: "github-media", url: new URL(encodePath(requested), base).href });
        const redirectBase = `https://github.com/${encodeURIComponent(this.repository.owner)}/${encodeURIComponent(this.repository.name)}/raw/${encodeURIComponent(this.repository.ref)}/`;
        urls.push({ source: "github-raw-redirect", url: new URL(encodePath(requested), redirectBase).href });
      }
      if (!entry?.lfs && !entry?.deliveryPath) {
        urls.unshift({ source: "runtime-repository", url: new URL(encodePath(`../../${requested}`), this.runtimeBaseUrl).href });
      }
      return dedupe(urls);
    }
    async binary(path, { required = true, kind, priority = PREFETCH_PRIORITY.CRITICAL, purpose = "runtime" } = {}) {
      const key = normalKey2(path);
      if (this.streaming.hasResource(`asset:${key}`)) {
        this.stats.cacheHits += 1;
      }
      try {
        return await this.fetchBinary(path, { required, kind, priority, purpose });
      } catch (error) {
        this.stats.failed += 1;
        this.stats.lastError = { path, error: error.message, code: error.code ?? "ASSET_UNAVAILABLE" };
        if (!required) return null;
        if (error instanceof AssetError && error.code === "ASSET_UNAVAILABLE") throw error;
        throw new AssetError("ASSET_UNAVAILABLE", `Could not load required asset: ${path}`, { path, cause: error.message, attempts: error.attempts ?? [] });
      }
    }
    async fetchBinary(path, { kind, priority, purpose }) {
      this.stats.requests += 1;
      const entry = this.entry(path);
      const resource = await this.streaming.fetchBytes(`asset:${normalKey2(path)}`, this.candidates(path), {
        priority,
        kind: kind ?? assetKind(path),
        purpose,
        retries: 1,
        validate: (bytes) => {
          const pointer = parseLfsPointer(bytes);
          if (pointer) {
            this.stats.lfsPointersRejected += 1;
            throw new AssetError("LFS_POINTER_RECEIVED", `Asset source returned a Git LFS pointer instead of ${path}`, { pointer });
          }
          validateMagic(bytes, entry?.extension ?? extension(path), kind);
        }
      });
      const result = { ...resource, magicBytes: hexPrefix(resource.bytes), lfsPointer: false, entry };
      this.stats.loaded += 1;
      this.stats.sources[result.source] = (this.stats.sources[result.source] ?? 0) + 1;
      this.stats.lastLoaded = { path, source: result.source, bytes: result.bytes.byteLength, url: result.url };
      const report = { path, originalRepoPath: entry?.path ?? path, ...result, bytes: result.bytes.byteLength, stage: "ready", decodeSuccess: null };
      delete report.entry;
      this.assetReports.set(normalKey2(path), report);
      this.onDiagnostic({ type: "asset-loaded", ...report });
      return result;
    }
    async image(path, { required = true, priority = PREFETCH_PRIORITY.CRITICAL, purpose = "runtime" } = {}) {
      const key = normalKey2(path);
      const cached = this.streaming.getDecoded(`image:${key}`);
      if (cached) {
        this.stats.cacheHits += 1;
        return cached;
      }
      if (!this.imageInflight.has(key)) this.imageInflight.set(key, this.decodeImage(path, required, priority, purpose));
      try {
        return await this.imageInflight.get(key);
      } finally {
        this.imageInflight.delete(key);
      }
    }
    async decodeImage(path, required, priority, purpose) {
      const asset = await this.binary(path, { required, kind: "image", priority, purpose });
      if (!asset) return null;
      const began = globalThis.performance?.now?.() ?? Date.now();
      const blob = new Blob([asset.bytes], { type: asset.contentType || mimeFor(path) });
      const url = URL.createObjectURL(blob);
      this.objectUrls.add(url);
      const image = new Image();
      image.src = url;
      try {
        if (image.decode) await image.decode();
        else await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = reject;
        });
        const report = {
          ...this.assetReports.get(normalKey2(path)) ?? {},
          path,
          originalRepoPath: asset.entry?.path ?? path,
          resolvedRuntimeUrl: asset.finalUrl || asset.url,
          source: asset.source,
          status: asset.status,
          contentType: asset.contentType,
          contentLength: asset.contentLength || String(asset.bytes.byteLength),
          bytes: asset.bytes.byteLength,
          magicBytes: asset.magicBytes,
          lfsPointer: false,
          decodedWidth: image.naturalWidth || image.width,
          decodedHeight: image.naturalHeight || image.height,
          decodeSuccess: true,
          stage: "decoded"
        };
        this.assetReports.set(normalKey2(path), report);
        this.stats.decoded += 1;
        const decodeMs = (globalThis.performance?.now?.() ?? Date.now()) - began;
        this.streaming.recordDecode(decodeMs);
        this.streaming.setDecoded(`image:${normalKey2(path)}`, image, Math.max(1, (image.naturalWidth || image.width) * (image.naturalHeight || image.height) * 4));
        this.onDiagnostic({ type: "asset-decoded", ...report });
        return image;
      } catch (cause) {
        const diagnostics = { path, source: asset.source, url: asset.url, cause: String(cause), decodeSuccess: false, stage: "decode" };
        this.assetReports.set(normalKey2(path), { ...this.assetReports.get(normalKey2(path)) ?? {}, ...diagnostics });
        this.stats.lastDecodeError = diagnostics;
        this.onDiagnostic({ type: "asset-decode-failed", ...diagnostics });
        throw new AssetError("IMAGE_DECODE_FAILED", `Browser could not decode ${path}`, diagnostics);
      }
    }
    async audioUrl(path, { required = true } = {}) {
      const key = normalKey2(path);
      if (this.audioUrlCache.has(key)) return this.audioUrlCache.get(key);
      const asset = await this.binary(path, { required, kind: "audio" });
      if (!asset) return null;
      const url = URL.createObjectURL(new Blob([asset.bytes], { type: asset.contentType || mimeFor(path) }));
      this.objectUrls.add(url);
      this.audioUrlCache.set(key, url);
      return url;
    }
    prefetch(path, { priority = PREFETCH_PRIORITY.NORMAL, purpose = "prefetch", optional = true } = {}) {
      const kind = assetKind(path);
      if (kind === "image") return this.image(path, { required: !optional, priority, purpose });
      return this.binary(path, { required: !optional, kind, priority, purpose });
    }
    diagnostics() {
      return { ...this.stats, imageInflight: this.imageInflight.size, audioUrls: this.audioUrlCache.size, manifestAssets: this.entries.size };
    }
    assetDiagnostics(path) {
      return structuredClone(this.assetReports.get(normalKey2(path)) ?? null);
    }
    destroy() {
      for (const url of this.objectUrls) URL.revokeObjectURL(url);
      this.objectUrls.clear();
      this.imageInflight.clear();
      this.audioUrlCache.clear();
      this.assetReports.clear();
      if (this.ownsStreaming) this.streaming.destroy();
    }
  };
  function parseLfsPointer(bytes) {
    const text = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 512)));
    if (!text.startsWith(LFS_SIGNATURE)) return null;
    return {
      oid: /oid sha256:([0-9a-f]{64})/i.exec(text)?.[1] ?? null,
      size: Number(/size (\d+)/.exec(text)?.[1] ?? 0)
    };
  }
  function validateMagic(bytes, ext = "", kind) {
    const normalized = String(ext).toLowerCase().replace(/^\./, "");
    const starts = (...values) => values.every((value, index) => bytes[index] === value);
    const ascii = (start, length) => new TextDecoder().decode(bytes.subarray(start, start + length));
    let valid = true;
    if (normalized === "png") valid = starts(137, 80, 78, 71, 13, 10, 26, 10);
    else if (normalized === "jpg" || normalized === "jpeg") valid = starts(255, 216, 255);
    else if (normalized === "ogg") valid = ascii(0, 4) === "OggS";
    else if (normalized === "wav") valid = ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE";
    else if (normalized === "mp3") valid = ascii(0, 3) === "ID3" || starts(255, 251) || starts(255, 243) || starts(255, 242);
    if (!valid) throw new AssetError("INVALID_ASSET_BYTES", `Invalid ${normalized || kind || "asset"} signature; refusing to pass bytes to the browser decoder`, { extension: normalized, byteLength: bytes.length });
  }
  function encodePath(path) {
    return String(path).split("/").filter((part) => part !== "").map(encodeURIComponent).join("/");
  }
  function normalKey2(path) {
    return String(path).replaceAll("\\", "/").replace(/^\.\//, "").toLocaleLowerCase();
  }
  function extension(path) {
    return /\.([^.\/]+)$/.exec(path)?.[1]?.toLowerCase() ?? "";
  }
  function stripExtension(path) {
    return String(path).replace(/\.[^.\/]+$/, "");
  }
  function dedupe(items) {
    const seen = /* @__PURE__ */ new Set();
    return items.filter((item) => !seen.has(item.url) && seen.add(item.url));
  }
  function mimeFor(path) {
    return { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", ogg: "audio/ogg", wav: "audio/wav", mp3: "audio/mpeg" }[extension(path)] ?? "application/octet-stream";
  }
  function hexPrefix(bytes, length = 12) {
    return [...bytes.subarray(0, length)].map((value) => value.toString(16).padStart(2, "0")).join(" ");
  }
  function assetKind(path) {
    return /\.(?:png|jpe?g)$/i.test(path) ? "image" : /\.(?:ogg|wav|mp3)$/i.test(path) ? "audio" : "binary";
  }

  // runtime/data/loader.js
  var DataLoader = class {
    constructor(dataBaseUrl, runtimeBaseUrl, assetConfig, progress = () => {
    }, onDiagnostic = () => {
    }, streamingConfig = {}) {
      this.dataBaseUrl = dataBaseUrl;
      this.runtimeBaseUrl = runtimeBaseUrl;
      this.assetConfig = assetConfig;
      this.progress = progress;
      this.onDiagnostic = onDiagnostic;
      this.prefetchManifest = streamingConfig.manifest ?? "prefetch-manifest.json";
      this.jsonCache = /* @__PURE__ */ new Map();
      this.prefetch = new PrefetchManager({
        version: streamingConfig.runtimeVersion ?? "dev",
        dataVersion: streamingConfig.dataVersion ?? "black-souls-normalized-data-v1",
        assetVersion: assetConfig.repository?.ref ?? "dev",
        onDiagnostic,
        developerMode: streamingConfig.developerMode,
        maxConcurrent: streamingConfig.maxConcurrent ?? 8,
        reservedCritical: streamingConfig.reservedCritical ?? 2,
        memoryBudgetBytes: streamingConfig.memoryBudgetBytes,
        decodedBudgetBytes: streamingConfig.decodedBudgetBytes,
        timeouts: streamingConfig.timeouts,
        persistentEnabled: !assetConfig.repository?.developmentBaseUrl && !isLocalUrl(dataBaseUrl)
      });
      this.prefetch.bindLoader(this);
    }
    async initialize() {
      this.progress("Loading game data...", 0.15);
      const [system, tilesets, actors, classes, skills, items, weapons, armors, enemies, troops, states, commonEvents, animations, assetManifest, prefetchManifest, inventoryDependencies, combatDependencies, uiDependencies] = await Promise.all([
        this.json("database/System.json"),
        this.json("database/Tilesets.json"),
        this.json("database/Actors.json"),
        this.json("database/Classes.json"),
        this.json("database/Skills.json"),
        this.json("database/Items.json"),
        this.json("database/Weapons.json"),
        this.json("database/Armors.json"),
        this.json("database/Enemies.json"),
        this.json("database/Troops.json"),
        this.json("database/States.json"),
        this.json("database/CommonEvents.json"),
        this.json("database/Animations.json"),
        this.json(this.assetConfig.manifest, this.runtimeBaseUrl),
        this.json(this.prefetchManifest),
        this.json("dependencies/inventory-dependencies.json"),
        this.json("dependencies/combat-dependencies.json"),
        this.json("dependencies/ui-dependencies.json")
      ]);
      this.assets = new AssetResolver({
        manifest: assetManifest,
        runtimeBaseUrl: this.runtimeBaseUrl,
        repository: this.assetConfig.repository,
        onDiagnostic: this.onDiagnostic,
        streaming: this.prefetch
      });
      this.prefetch.setManifest(prefetchManifest);
      this.progress("Game data ready", 0.45);
      return { system, tilesets, actors, classes, skills, items, weapons, armors, enemies, troops, states, commonEvents, animations, assetManifest, prefetchManifest, inventoryDependencies, combatDependencies, uiDependencies };
    }
    map(id, options = {}) {
      return this.json(`maps/${String(id).padStart(3, "0")}.json`, this.dataBaseUrl, { ...options, key: `map:${id}` });
    }
    async json(path, base = this.dataBaseUrl, { key, priority = PREFETCH_PRIORITY.CRITICAL, purpose = "runtime" } = {}) {
      const url = new URL(path, base).href;
      const cacheKey = key ?? `json:${url}`;
      const parsed = this.prefetch.getParsed(cacheKey);
      if (parsed) return parsed;
      if (this.jsonCache.has(cacheKey)) return this.jsonCache.get(cacheKey);
      const pending = this.prefetch.fetchBytes(cacheKey, dataCandidates(url), {
        priority,
        kind: "json",
        purpose,
        validate: (bytes, meta) => {
          if (meta.contentType && !/\bjson\b/i.test(meta.contentType)) throw new Error(`Required game data has invalid Content-Type "${meta.contentType}" at ${meta.url}`);
          JSON.parse(new TextDecoder().decode(bytes));
        }
      }).then((resource) => {
        const text = new TextDecoder().decode(resource.bytes);
        const value = JSON.parse(text);
        this.prefetch.setParsed(cacheKey, value, resource.bytes.byteLength);
        return value;
      });
      this.jsonCache.set(cacheKey, pending);
      try {
        return await pending;
      } finally {
        this.jsonCache.delete(cacheKey);
      }
    }
    image(path, { optional = false } = {}) {
      return this.assets.image(path, { required: !optional });
    }
    audioUrl(path, { optional = false } = {}) {
      return this.assets.audioUrl(path, { required: !optional });
    }
    prefetchAsset(path, options = {}) {
      return this.assets.prefetch(path, options);
    }
    resolveEntry(path) {
      return this.assets.entry(path);
    }
    assetDiagnostics(path) {
      return this.assets?.assetDiagnostics(path) ?? null;
    }
    diagnostics() {
      return { assets: this.assets?.diagnostics() ?? { state: "not-initialized" }, streaming: this.prefetch.getStatus() };
    }
    destroy() {
      this.assets?.destroy();
      this.prefetch.destroy();
    }
  };
  function dataCandidates(url) {
    const primary = new URL(url);
    const candidates = [{ source: "runtime-selected", url: primary.href }];
    const cdnMatch = /^(?:gh\/)?([^/]+)\/([^/@]+)@([^/]+)\/(.*)$/.exec(primary.pathname.replace(/^\//, ""));
    if ((primary.hostname === "cdn.jsdelivr.net" || primary.hostname === "testingcf.jsdelivr.net") && cdnMatch) {
      const [, owner, repository, ref, path] = cdnMatch;
      const alternate = primary.hostname === "cdn.jsdelivr.net" ? "testingcf.jsdelivr.net" : "cdn.jsdelivr.net";
      candidates.push({ source: "runtime-cdn-fallback", url: `https://${alternate}/gh/${owner}/${repository}@${ref}/${path}` });
      candidates.push({ source: "runtime-raw-fallback", url: `https://raw.githubusercontent.com/${owner}/${repository}/${ref}/${path}` });
    }
    if (primary.hostname === "raw.githubusercontent.com") {
      const [, owner, repository, ref, ...rest] = primary.pathname.split("/");
      const path = rest.join("/");
      candidates.push({ source: "runtime-jsdelivr-fallback", url: `https://cdn.jsdelivr.net/gh/${owner}/${repository}@${ref}/${path}` });
      candidates.push({ source: "runtime-testingcf-fallback", url: `https://testingcf.jsdelivr.net/gh/${owner}/${repository}@${ref}/${path}` });
    }
    return candidates;
  }
  function isLocalUrl(url) {
    return ["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname);
  }

  // runtime/render/canvas-renderer.js
  var TILE_ID = { A5: 1536, A1: 2048, A2: 2816, A3: 4352, A4: 5888 };
  var CanvasRenderer = class {
    constructor(stage, loader, engineConfig) {
      this.stage = stage;
      this.loader = loader;
      this.width = engineConfig.logicalWidth;
      this.height = engineConfig.logicalHeight;
      this.tileSize = engineConfig.tileSize;
      this.canvas = document.createElement("canvas");
      this.canvas.width = this.width;
      this.canvas.height = this.height;
      this.context = this.canvas.getContext("2d");
      this.context.imageSmoothingEnabled = false;
      stage.append(this.canvas);
      this.fade = 0;
      this.characterImages = /* @__PURE__ */ new Map();
      this.animations = [];
      this.balloons = [];
      this.pictures = /* @__PURE__ */ new Map();
      this.screenTone = null;
      this.screenFlash = null;
      this.screenShake = null;
      this.weather = null;
      this.battleGraphics = null;
      this.animationSheetFailures = /* @__PURE__ */ new Map();
      this.characterSheetFailures = /* @__PURE__ */ new Map();
      this.stats = { frames: 0, lastFrameMs: 0, maxFrameMs: 0, scene: "LOADING", mapId: null, tileset: null, loadedSheets: [], characters: [], missingCharacters: [], title: null, animationFailures: [] };
    }
    async setTitle(system) {
      const title1Path = system.title1_name ? `Graphics/Titles1/${system.title1_name}.png` : null;
      const title2Path = system.title2_name ? `Graphics/Titles2/${system.title2_name}.png` : null;
      const [title1, title2] = await Promise.all([
        title1Path ? this.loader.image(title1Path) : null,
        title2Path ? this.loader.image(title2Path) : null
      ]);
      this.title = { title1, title2, title1Path, title2Path };
      this.stats.title = {
        title1: title1Path ? { path: title1Path, width: title1.naturalWidth || title1.width, height: title1.naturalHeight || title1.height, decoded: true } : null,
        title2: title2Path ? { path: title2Path, width: title2.naturalWidth || title2.width, height: title2.naturalHeight || title2.height, decoded: true } : null,
        stretchMode: "RGSSLAB::XP_Display_Size::TITLE_TYPE=1 (640x480)"
      };
    }
    async setMap(map, tileset, { playerGraphic, events = [], mapId, x = 0, y = 0 } = {}) {
      const loadToken = Symbol(`map-${mapId ?? "unknown"}`);
      this.mapLoadToken = loadToken;
      const sheets = await Promise.all((tileset?.tileset_names ?? []).map((name) => name ? this.loader.image(`Graphics/Tilesets/${name}.png`) : null));
      const inInitialViewport = (event) => !Number.isFinite(event.x) || !Number.isFinite(event.y) || Math.abs(event.x - x) <= 12 && Math.abs(event.y - y) <= 9;
      const initialEvents = events.filter(inInitialViewport);
      const deferredEvents = events.filter((event) => !inInitialViewport(event));
      const graphics = [playerGraphic, ...initialEvents.map((event) => event.page?.graphic)].filter((graphic) => graphic?.character_name);
      const characterImages = new Map(this.characterImages);
      const missingCharacters = [];
      await Promise.all([...new Set(graphics.map((graphic) => graphic.character_name))].map(async (name) => {
        const path = `Graphics/Characters/${name}.png`;
        if (this.characterSheetFailures.has(path)) {
          missingCharacters.push(name);
          return;
        }
        const image = await this.loader.image(path, { optional: true });
        if (image) characterImages.set(name, image);
        else {
          this.characterSheetFailures.set(path, "unavailable");
          missingCharacters.push(name);
        }
      }));
      const fog = await this.loadFog(map.note);
      this.map = map;
      this.tileset = tileset;
      this.sheets = sheets;
      this.characterImages = characterImages;
      this.fog = fog;
      this.playerGraphic = playerGraphic;
      this.stats.mapId = mapId;
      this.stats.tileset = tileset?.name ?? null;
      this.stats.loadedSheets = (tileset?.tileset_names ?? []).filter(Boolean);
      this.stats.characters = [...this.characterImages.keys()];
      this.stats.missingCharacters = missingCharacters;
      void this.streamCharacterGraphics(deferredEvents, loadToken);
    }
    async streamCharacterGraphics(events, loadToken = this.mapLoadToken) {
      const names = [...new Set(events.map((event) => event.page?.graphic?.character_name).filter(Boolean))].filter((name) => !this.characterImages.has(name));
      await Promise.allSettled(names.map(async (name) => {
        const path = `Graphics/Characters/${name}.png`;
        if (this.characterSheetFailures.has(path)) return;
        const image = await this.loader.image(path, { optional: true });
        if (this.mapLoadToken !== loadToken) return;
        if (image) this.characterImages.set(name, image);
        else {
          this.characterSheetFailures.set(path, "unavailable");
          if (!this.stats.missingCharacters.includes(name)) this.stats.missingCharacters.push(name);
        }
        this.stats.characters = [...this.characterImages.keys()];
      }));
    }
    async ensureEventGraphics(events, loadToken = this.mapLoadToken) {
      const names = [...new Set(events.map((event) => event.page?.graphic?.character_name ?? event.graphic?.character_name).filter(Boolean))].filter((name) => !this.characterImages.has(name));
      const unavailable = [];
      await Promise.all(names.map(async (name) => {
        const path = `Graphics/Characters/${name}.png`;
        try {
          const image = await this.loader.image(path);
          if (this.mapLoadToken === loadToken && image) {
            this.characterImages.set(name, image);
            this.characterSheetFailures.delete(path);
            this.stats.missingCharacters = this.stats.missingCharacters.filter((entry) => entry !== name);
          }
        } catch (error) {
          unavailable.push({ name, error: error.message });
          this.characterSheetFailures.set(path, error.message);
          if (!this.stats.missingCharacters.includes(name)) this.stats.missingCharacters.push(name);
        }
      }));
      this.stats.characters = [...this.characterImages.keys()];
      if (unavailable.length) throw new Error(`Could not load active event graphic: ${unavailable.map((entry) => entry.name).join(", ")}`);
    }
    async setBattle(battle) {
      const battleback1Path = battle.battleback1 ? `Graphics/Battlebacks1/${battle.battleback1}.png` : null;
      const battleback2Path = battle.battleback2 ? `Graphics/Battlebacks2/${battle.battleback2}.png` : null;
      const [battleback1, battleback2] = await Promise.all([
        battleback1Path ? this.loader.image(battleback1Path, { optional: true }) : null,
        battleback2Path ? this.loader.image(battleback2Path, { optional: true }) : null
      ]);
      const enemies = /* @__PURE__ */ new Map();
      await Promise.all([...new Set(battle.enemies.map((enemy) => enemy.battlerName).filter(Boolean))].map(async (name) => {
        const image = await this.loader.image(`Graphics/Battlers/${name}.png`);
        enemies.set(name, image);
      }));
      this.battleGraphics = { battleback1, battleback2, battleback1Path, battleback2Path, enemies };
    }
    clearBattle() {
      this.battleGraphics = null;
    }
    async loadFog(note = "") {
      const match = /==マップフォグ([^\[]+)\[([^\]]+)\]==/.exec(note);
      if (!match) return null;
      const [x = 0, y = 0, zoom = 100, opacity = 255, blend = 0] = match[2].split(",").map(Number);
      const image = await this.loader.image(`Graphics/Parallaxes/${match[1]}.png`, { optional: true });
      return image ? { image, x, y, zoom, opacity, blend } : null;
    }
    render(state, events = []) {
      const began = performance.now();
      const context = this.context;
      context.fillStyle = "#080709";
      context.fillRect(0, 0, this.width, this.height);
      this.stats.scene = state.scene ?? "PLAYING";
      if (state.scene === "TITLE") {
        this.drawTitle(state.title);
        this.finishFrame(began);
        return;
      }
      if (state.scene === "BATTLE") {
        this.drawBattle(state.battle);
        this.drawPictures();
        this.drawScreenEffects();
        this.finishFrame(began);
        return;
      }
      if (!this.map || !this.sheets) {
        this.finishFrame(began);
        return;
      }
      const visibleX = Math.ceil(this.width / this.tileSize) + 1;
      const visibleY = Math.ceil(this.height / this.tileSize) + 1;
      const cameraX = clamp2(state.x - Math.floor(visibleX / 2), 0, Math.max(0, this.map.width - visibleX));
      const cameraY = clamp2(state.y - Math.floor(visibleY / 2), 0, Math.max(0, this.map.height - visibleY));
      this.camera = { x: cameraX, y: cameraY };
      const upper = [];
      for (let z = 0; z < 3; z += 1) for (let y = 0; y < visibleY; y += 1) for (let x = 0; x < visibleX; x += 1) {
        const mapX = x + cameraX;
        const mapY = y + cameraY;
        if (mapX >= this.map.width || mapY >= this.map.height) continue;
        const tileId = this.tileAt(mapX, mapY, z);
        const args = [tileId, x * this.tileSize, y * this.tileSize];
        if (this.isUpper(tileId)) upper.push(args);
        else this.drawTile(...args);
      }
      this.drawShadows(cameraX, cameraY, visibleX, visibleY);
      const sprites = events.map((event) => ({ ...event, priority: event.priority ?? 1, type: "event" }));
      if (!state.transparent) sprites.push({ x: state.x, y: state.y, direction: state.direction, pattern: state.pattern ?? 1, opacity: state.opacity ?? 255, priority: 1, graphic: this.playerGraphic, type: "player" });
      sprites.sort((a, b) => a.priority - b.priority || a.y - b.y || (a.type === "event" ? -1 : 1));
      for (const sprite of sprites.filter((item) => item.priority < 2)) this.drawCharacter(sprite, cameraX, cameraY);
      for (const args of upper) this.drawTile(...args);
      this.drawFog();
      for (const sprite of sprites.filter((item) => item.priority >= 2)) this.drawCharacter(sprite, cameraX, cameraY);
      void this.streamCharacterGraphics(events).catch(() => {
      });
      this.drawAnimations(cameraX, cameraY);
      this.drawBalloons(cameraX, cameraY);
      this.drawPictures();
      this.drawWeather();
      this.drawMessage(state.message);
      this.drawChoice(state.choice);
      if (["MENU", "END", "ITEM", "EQUIP", "STATUS", "SYNTHESIS", "SHOP"].includes(state.scene)) this.drawGameMenu(state.menu, state);
      this.drawScreenEffects();
      if (this.fade > 0) {
        context.fillStyle = `rgba(0,0,0,${this.fade})`;
        context.fillRect(0, 0, this.width, this.height);
      }
      this.finishFrame(began);
    }
    finishFrame(began) {
      const elapsed = performance.now() - began;
      this.stats.frames += 1;
      this.stats.lastFrameMs = Math.round(elapsed * 100) / 100;
      this.stats.maxFrameMs = Math.max(this.stats.maxFrameMs, this.stats.lastFrameMs);
    }
    drawTitle(title) {
      const c = this.context;
      if (this.title?.title1) c.drawImage(this.title.title1, 0, 0, this.width, this.height);
      if (this.title?.title2) c.drawImage(this.title.title2, 0, 0, this.width, this.height);
      const commands = title?.commands ?? [];
      const width = 160;
      const lineHeight = 24;
      const padding = 12;
      const height = commands.length * lineHeight + padding * 2;
      const x = (this.width - width) / 2;
      const y = (this.height * 1.6 - height) / 2;
      this.drawWindow(x, y, width, height);
      c.font = '18px "Noto Serif", Georgia, serif';
      c.textBaseline = "middle";
      commands.forEach((command, index) => {
        const selected = index === title?.selected;
        c.fillStyle = command.enabled === false ? "#676263" : selected ? "#ffffff" : "#d5d0c8";
        c.fillText(`${selected ? "›" : " "} ${String(command.label).trim()}`, x + 14, y + padding + lineHeight * index + lineHeight / 2);
      });
      c.textBaseline = "alphabetic";
    }
    drawGameMenu(menu, state = {}) {
      if (!menu) return;
      if (menu.kind === "item" || menu.kind === "synthesis" || menu.kind === "shop") return this.drawInventoryMenu(menu, state);
      if (menu.kind === "equip") return this.drawEquipMenu(menu, state);
      if (menu.kind === "status") return this.drawStatusMenu(menu, state);
      const c = this.context;
      c.fillStyle = "rgba(0,0,0,.58)";
      c.fillRect(0, 0, this.width, this.height);
      const width = menu.kind === "end" ? 210 : 190;
      const lineHeight = 30;
      const padding = 14;
      const height = menu.commands.length * lineHeight + padding * 2;
      const x = menu.kind === "end" ? (this.width - width) / 2 : 18;
      const y = menu.kind === "end" ? (this.height - height) / 2 : 18;
      this.drawWindow(x, y, width, height);
      c.font = '19px "Noto Serif", Georgia, serif';
      c.textBaseline = "middle";
      menu.commands.forEach((command, index) => {
        const selected = index === menu.selected;
        c.fillStyle = command.enabled === false ? "#6e6868" : selected ? "#fff" : "#d1cbc2";
        c.fillText(`${selected ? "›" : " "} ${command.label}`, x + 16, y + padding + lineHeight * index + lineHeight / 2);
      });
      c.textBaseline = "alphabetic";
    }
    drawInventoryMenu(menu, state = {}) {
      const c = this.context;
      c.fillStyle = "rgba(0,0,0,.72)";
      c.fillRect(0, 0, this.width, this.height);
      this.drawWindow(18, 18, 604, 444);
      c.font = '18px "Noto Serif", Georgia, serif';
      c.fillStyle = "#eee";
      c.fillText(menu.kind === "synthesis" ? "Synthesis" : menu.kind === "shop" ? `Shop     ${state.party?.gold ?? 0} ${this.currencyUnit ?? "S"}` : "Items", 38, 50);
      const entries = menu.entries ?? [];
      entries.slice(0, 12).forEach((entry, index) => {
        const selected2 = index === menu.selected;
        const data = entry.data ?? {};
        const suffix = menu.kind === "shop" ? `${entry.price} S` : `×${entry.amount ?? 1}`;
        c.fillStyle = selected2 ? "#fff" : "#cbc5bc";
        c.fillText(`${selected2 ? "›" : " "} ${data.name ?? `${entry.kind} ${entry.id}`}  ${suffix}`, 42, 84 + index * 27);
      });
      const selected = entries[menu.selected];
      if (selected?.data?.description) {
        c.fillStyle = "#aaa49c";
        c.font = "14px Georgia, serif";
        wrapText(c, selected.data.description, 330, 84, 270, 20);
      }
    }
    drawEquipMenu(menu, state) {
      const c = this.context;
      c.fillStyle = "rgba(0,0,0,.72)";
      c.fillRect(0, 0, this.width, this.height);
      this.drawWindow(18, 18, 604, 444);
      const actor = state.actors?.[menu.actorId];
      c.font = "18px Georgia, serif";
      c.fillStyle = "#eee";
      c.fillText(`Equipment — ${actor?.name ?? ""}`, 38, 50);
      (menu.slotEntries ?? actor?.equips ?? []).forEach((slot, index) => {
        const item = slot.data;
        c.fillStyle = menu.mode === "slots" && index === menu.selected ? "#fff" : "#c9c3ba";
        c.fillText(`${menu.mode === "slots" && index === menu.selected ? "›" : " "} [${slot.etypeId}] ${item?.name ?? (slot.id ? `${slot.kind} ${slot.id}` : "(empty)")}`, 42, 84 + index * 27);
      });
      if (menu.mode === "choices") (menu.choices ?? []).slice(0, 10).forEach((entry, index) => {
        c.fillStyle = index === menu.choiceSelected ? "#fff" : "#aaa";
        c.fillText(`${index === menu.choiceSelected ? "›" : " "} ${entry.data?.name ?? "(Remove)"}`, 350, 84 + index * 27);
      });
    }
    drawStatusMenu(menu, state) {
      const c = this.context;
      c.fillStyle = "rgba(0,0,0,.72)";
      c.fillRect(0, 0, this.width, this.height);
      this.drawWindow(80, 55, 480, 370);
      const actor = state.actors?.[menu.actorId];
      c.font = "20px Georgia, serif";
      c.fillStyle = "#fff";
      c.fillText(actor?.name ?? "", 108, 95);
      c.font = "17px Georgia, serif";
      c.fillStyle = "#d1cbc2";
      c.fillText(`Lv ${actor?.level ?? 1}    HP ${actor?.hp ?? 0}/${menu.parameters?.mhp ?? 0}    MP ${actor?.mp ?? 0}/${menu.parameters?.mmp ?? 0}`, 108, 132);
      Object.entries(menu.parameters ?? {}).forEach(([name, value], index) => c.fillText(`${name.toUpperCase().padEnd(4)} ${value}`, 120 + index % 2 * 210, 180 + Math.floor(index / 2) * 42));
    }
    drawBattle(battle) {
      const c = this.context;
      c.fillStyle = "#100d12";
      c.fillRect(0, 0, this.width, this.height);
      if (this.battleGraphics?.battleback1) c.drawImage(this.battleGraphics.battleback1, 0, 0, this.width, this.height);
      if (this.battleGraphics?.battleback2) c.drawImage(this.battleGraphics.battleback2, 0, 0, this.width, this.height);
      for (const enemy of battle?.enemies ?? []) {
        if (enemy.hp <= 0) continue;
        const image = this.battleGraphics?.enemies?.get(enemy.battlerName);
        if (!image) continue;
        const scale = Math.min(1, 260 / Math.max(image.width, image.height));
        const width = image.width * scale;
        const height = image.height * scale;
        c.drawImage(image, enemy.x - width / 2, enemy.y - height, width, height);
        c.fillStyle = "#17080a";
        c.fillRect(enemy.x - 55, enemy.y + 4, 110, 7);
        c.fillStyle = "#8d1f29";
        c.fillRect(enemy.x - 55, enemy.y + 4, 110 * enemy.hp / Math.max(1, enemy.parameters.mhp), 7);
        c.fillStyle = "#eee";
        c.font = "13px Georgia, serif";
        c.textAlign = "center";
        c.fillText(enemy.name, enemy.x, enemy.y + 28);
        c.textAlign = "left";
      }
      this.drawWindow(12, 350, 616, 118);
      c.font = "16px Georgia, serif";
      c.fillStyle = "#eee";
      const actor = battle?.actors?.[0];
      if (actor) c.fillText(`${actor.name}  HP ${actor.hp}/${actor.parameters.mhp}  MP ${actor.mp}/${actor.parameters.mmp}  AP ${Math.floor(actor.ap)}/${4e3}`, 30, 380);
      if (battle?.phase === "actor-command") (battle.commands ?? []).forEach((command, index) => {
        c.fillStyle = index === battle.selectedCommand ? "#fff" : "#aaa";
        c.fillText(`${index === battle.selectedCommand ? "›" : " "} ${command}`, 30 + index % 3 * 180, 414 + Math.floor(index / 3) * 28);
      });
      else {
        c.fillStyle = "#c9c2ba";
        c.fillText(battle?.log?.at(-1) ?? "", 30, 420);
      }
    }
    async showPicture(id, name, parameters = {}) {
      const image = await this.loader.image(`Graphics/Pictures/${name}.png`);
      this.pictures.set(Number(id), { id: Number(id), name, image, origin: 0, x: 0, y: 0, zoomX: 100, zoomY: 100, opacity: 255, blend: 0, ...parameters });
    }
    movePicture(id, parameters = {}) {
      const picture = this.pictures.get(Number(id));
      if (!picture) return Promise.resolve();
      const frames = Math.max(0, Number(parameters.duration) || 0);
      const target = { ...parameters };
      delete target.duration;
      if (!frames) {
        Object.assign(picture, target);
        return Promise.resolve();
      }
      const began = performance.now();
      const until = began + frames * 1e3 / 60;
      picture.transition = { from: Object.fromEntries(Object.keys(target).map((key) => [key, picture[key]])), target, began, until };
      return waitFrames(frames);
    }
    erasePicture(id) {
      this.pictures.delete(Number(id));
    }
    drawPictures() {
      const c = this.context;
      for (const picture of [...this.pictures.values()].sort((a, b) => a.id - b.id)) {
        updatePictureTransition(picture);
        if (picture.angleSpeed) picture.angle = (Number(picture.angle ?? 0) + Number(picture.angleSpeed) / 2) % 360;
        const width = picture.image.width * (picture.zoomX ?? 100) / 100;
        const height = picture.image.height * (picture.zoomY ?? 100) / 100;
        const x = (picture.x ?? 0) - (picture.origin === 1 ? width / 2 : 0);
        const y = (picture.y ?? 0) - (picture.origin === 1 ? height / 2 : 0);
        c.save();
        c.globalAlpha = (picture.opacity ?? 255) / 255;
        c.globalCompositeOperation = ["source-over", "lighter", "multiply"][picture.blend ?? 0] ?? "source-over";
        c.translate(x + width / 2, y + height / 2);
        c.rotate(Number(picture.angle ?? 0) * Math.PI / 180);
        c.drawImage(picture.image, -width / 2, -height / 2, width, height);
        const tone = picture.tone;
        if (tone && (Number(tone.red ?? tone[0]) < 0 || Number(tone.green ?? tone[1]) < 0 || Number(tone.blue ?? tone[2]) < 0)) {
          const darkness = clamp2(-(Number(tone.red ?? tone[0] ?? 0) + Number(tone.green ?? tone[1] ?? 0) + Number(tone.blue ?? tone[2] ?? 0)) / 765, 0, 1);
          c.globalCompositeOperation = "source-atop";
          c.fillStyle = `rgba(0,0,0,${darkness})`;
          c.fillRect(-width / 2, -height / 2, width, height);
        }
        c.restore();
      }
    }
    tintScreen(tone, frames = 1) {
      this.screenTone = { tone, until: performance.now() + frames * 1e3 / 60 };
      return waitFrames(frames);
    }
    flashScreen(color, frames = 1) {
      this.screenFlash = { color, began: performance.now(), until: performance.now() + frames * 1e3 / 60 };
      return waitFrames(frames);
    }
    shakeScreen(power, speed, frames = 1) {
      this.screenShake = { power, speed, began: performance.now(), until: performance.now() + frames * 1e3 / 60 };
      return waitFrames(frames);
    }
    setWeather(type, power, frames = 1) {
      this.weather = { type, power, began: performance.now() };
      return waitFrames(frames);
    }
    drawScreenEffects() {
      const c = this.context;
      const now = performance.now();
      if (this.screenTone) {
        const tone = this.screenTone.tone ?? {};
        const darkness = clamp2(-(Number(tone.red) + Number(tone.green) + Number(tone.blue)) / (255 * 3), 0, 1);
        if (darkness > 0) {
          c.fillStyle = `rgba(0,0,0,${darkness})`;
          c.fillRect(0, 0, this.width, this.height);
        }
      }
      if (this.screenFlash) {
        const color = this.screenFlash.color ?? {};
        const duration = Math.max(1, this.screenFlash.until - this.screenFlash.began);
        const alpha = clamp2((this.screenFlash.until - now) / duration, 0, 1) * (Number(color.alpha ?? 255) / 255);
        if (alpha > 0) {
          c.fillStyle = `rgba(${color.red ?? 255},${color.green ?? 255},${color.blue ?? 255},${alpha})`;
          c.fillRect(0, 0, this.width, this.height);
        } else this.screenFlash = null;
      }
      if (this.screenShake && now >= this.screenShake.until) this.screenShake = null;
    }
    drawWeather() {
      if (!this.weather || !this.weather.type || this.weather.power <= 0) return;
      const c = this.context;
      const now = performance.now() / 30;
      c.save();
      c.strokeStyle = "rgba(190,210,230,.48)";
      c.lineWidth = 1;
      const count = Math.min(120, this.weather.power * 12);
      for (let index = 0; index < count; index += 1) {
        const x = (index * 83 + now * 5) % this.width;
        const y = (index * 47 + now * 11) % this.height;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x - 5, y + 12);
        c.stroke();
      }
      c.restore();
    }
    drawWindow(x, y, width, height) {
      const c = this.context;
      c.fillStyle = "rgba(0,0,0,.90)";
      c.fillRect(x, y, width, height);
      c.strokeStyle = "#d2cbbd";
      c.lineWidth = 2;
      c.strokeRect(x + 1, y + 1, width - 2, height - 2);
      c.strokeStyle = "#514c49";
      c.lineWidth = 1;
      c.strokeRect(x + 4.5, y + 4.5, width - 9, height - 9);
    }
    tileAt(x, y, z) {
      return this.map.data.data[x + y * this.map.width + z * this.map.width * this.map.height] ?? 0;
    }
    isUpper(tileId) {
      return Boolean((this.tileset?.flags?.data?.[tileId] ?? 0) & 16);
    }
    drawTile(tileId, dx, dy) {
      if (tileId <= 0) return;
      if (tileId < TILE_ID.A5) return this.drawNormalTile(tileId, dx, dy);
      if (tileId < TILE_ID.A1) return this.drawNormalTile(tileId, dx, dy, 4, TILE_ID.A5);
      this.drawAutotile(tileId, dx, dy);
    }
    drawNormalTile(tileId, dx, dy, forcedSheet, base = 0) {
      const sheetIndex = forcedSheet ?? 5 + Math.floor(tileId / 256);
      const localId = forcedSheet == null ? tileId % 256 : tileId - base;
      const sheet = this.sheets[sheetIndex];
      if (!sheet) return;
      this.context.drawImage(sheet, localId % 8 * 32, Math.floor(localId / 8) * 32, 32, 32, dx, dy, 32, 32);
    }
    drawAutotile(tileId, dx, dy) {
      const kind = Math.floor((tileId - TILE_ID.A1) / 48);
      const shape = (tileId - TILE_ID.A1) % 48;
      const tx = kind % 8;
      const ty = Math.floor(kind / 8);
      let sheetIndex = 0;
      let bx = 0;
      let by = 0;
      let table = FLOOR_AUTOTILE_TABLE;
      const animationFrame = Math.floor(performance.now() / 400) % 4;
      if (tileId >= TILE_ID.A4) {
        sheetIndex = 3;
        bx = tx * 2;
        by = Math.floor((ty - 10) * 2.5 + (ty % 2 === 1 ? 0.5 : 0));
        if (ty % 2 === 1) table = WALL_AUTOTILE_TABLE;
      } else if (tileId >= TILE_ID.A3) {
        sheetIndex = 2;
        bx = tx * 2;
        by = (ty - 6) * 2;
        table = WALL_AUTOTILE_TABLE;
      } else if (tileId >= TILE_ID.A2) {
        sheetIndex = 1;
        bx = tx * 2;
        by = (ty - 2) * 3;
      } else {
        const waterFrame = [0, 1, 2, 1][animationFrame];
        if (kind === 0) {
          bx = waterFrame * 2;
          by = 0;
        } else if (kind === 1) {
          bx = waterFrame * 2;
          by = 3;
        } else if (kind === 2) {
          bx = 6;
          by = 0;
        } else if (kind === 3) {
          bx = 6;
          by = 3;
        } else {
          bx = Math.floor(tx / 4) * 8;
          by = ty * 6 + Math.floor(tx / 2) % 2 * 3;
          if (kind % 2 === 0) bx += waterFrame * 2;
          else {
            bx += 6;
            by += animationFrame % 3;
            table = WATERFALL_AUTOTILE_TABLE;
          }
        }
      }
      const sheet = this.sheets[sheetIndex];
      if (!sheet) return;
      const quarters = table[shape % table.length];
      for (let index = 0; index < 4; index += 1) {
        const [qsx, qsy] = quarters[index];
        this.context.drawImage(sheet, (bx + qsx) * 16, (by + qsy) * 16, 16, 16, dx + index % 2 * 16, dy + Math.floor(index / 2) * 16, 16, 16);
      }
    }
    drawShadows(cameraX, cameraY, width, height) {
      const offset = this.map.width * this.map.height * 3;
      this.context.fillStyle = "rgba(0,0,0,.42)";
      for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
        const mx = x + cameraX;
        const my = y + cameraY;
        const bits = (this.map.data.data[mx + my * this.map.width + offset] ?? 0) & 15;
        for (let q = 0; q < 4; q += 1) if (bits & 1 << q) this.context.fillRect(x * 32 + q % 2 * 16, y * 32 + Math.floor(q / 2) * 16, 16, 16);
      }
    }
    drawCharacter(sprite, cameraX, cameraY) {
      const graphic = sprite.graphic;
      if (!graphic?.character_name) return;
      const image = this.characterImages.get(graphic.character_name);
      if (!image) return;
      const frame = characterFrame(image, graphic.character_name, graphic.character_index ?? 0, sprite.direction ?? graphic.direction ?? 2, sprite.pattern ?? graphic.pattern ?? 1);
      const x = (sprite.x - cameraX) * 32 + 16;
      const y = (sprite.y - cameraY + 1) * 32;
      const shift = graphic.character_name.startsWith("!") ? 0 : 4;
      const dx = Math.round(x - frame.width / 2);
      const dy = Math.round(y - frame.height - shift);
      const opacity = clamp2(Number(sprite.opacity ?? 255) / 255, 0, 1);
      this.context.save();
      this.context.globalAlpha = opacity;
      if (this.isBush(sprite.x, sprite.y) && frame.height >= 24) {
        const bushHeight = Math.min(12, frame.height / 2);
        const topHeight = frame.height - bushHeight;
        this.context.drawImage(image, frame.sx, frame.sy, frame.width, topHeight, dx, dy, frame.width, topHeight);
        this.context.globalAlpha = opacity * 0.5;
        this.context.drawImage(image, frame.sx, frame.sy + topHeight, frame.width, bushHeight, dx, dy + topHeight, frame.width, bushHeight);
      } else this.context.drawImage(image, frame.sx, frame.sy, frame.width, frame.height, dx, dy, frame.width, frame.height);
      this.context.restore();
    }
    isBush(x, y) {
      for (let z = 2; z >= 0; z -= 1) if ((this.tileset?.flags?.data?.[this.tileAt(x, y, z)] ?? 0) & 64) return true;
      return false;
    }
    drawFog() {
      if (!this.fog) return;
      const { image, x, y, zoom, opacity, blend } = this.fog;
      const scale = zoom > 10 ? zoom / 100 : 1;
      const width = image.width * scale;
      const height = image.height * scale;
      this.context.save();
      this.context.globalAlpha = clamp2(opacity / 255, 0, 1);
      this.context.globalCompositeOperation = blend === 1 ? "lighter" : blend === 2 ? "multiply" : "source-over";
      for (let dx = x % width - width; dx < this.width; dx += width) for (let dy = y % height - height; dy < this.height; dy += height) this.context.drawImage(image, dx, dy, width, height);
      this.context.restore();
    }
    async showAnimation(target, animation) {
      if (!animation) return;
      const sheets = await Promise.all([animation.animation1_name, animation.animation2_name].map(async (name) => {
        if (!name) return null;
        const path = `Graphics/Animations/${name}.png`;
        if (this.animationSheetFailures.has(path)) return null;
        try {
          return await this.loader.image(path);
        } catch (error) {
          this.animationSheetFailures.set(path, error.message);
          this.stats.animationFailures = [...this.animationSheetFailures].map(([failedPath, message]) => ({ path: failedPath, error: message }));
          console.warn(`[BLACK SOULS] Animation sheet unavailable; animation ${animation.id ?? "?"} will render without ${path}.`, error);
          return null;
        }
      }));
      this.animations.push({ target, animation, sheets, began: performance.now() });
      await new Promise((resolve) => setTimeout(resolve, Math.max(1, animation.frame_max) * 4 * 1e3 / 60));
    }
    async showBalloon(target, balloonId) {
      this.balloonImage ??= await this.loader.image("Graphics/System/Balloon.png");
      this.balloons.push({ target, balloonId, began: performance.now() });
      await new Promise((resolve) => setTimeout(resolve, 8 * 80));
    }
    drawBalloons(cameraX, cameraY) {
      const now = performance.now();
      this.balloons = this.balloons.filter((active) => {
        const frame = Math.floor((now - active.began) / 80);
        if (frame >= 8) return false;
        const x = (active.target.x - cameraX) * 32 + 16;
        const y = (active.target.y - cameraY) * 32 - 22;
        this.context.drawImage(this.balloonImage, frame * 32, (active.balloonId - 1) * 32, 32, 32, x - 16, y - 16, 32, 32);
        return true;
      });
    }
    drawAnimations(cameraX, cameraY) {
      const now = performance.now();
      this.animations = this.animations.filter((active) => {
        const frame = active.animation.frames?.[Math.floor((now - active.began) / (4 * 1e3 / 60))];
        if (!frame) return false;
        const x = (active.target.x - cameraX) * 32 + 16;
        const y = (active.target.y - cameraY) * 32 + 16;
        const data = frame.cell_data?.data ?? [];
        for (let cell = 0; cell < (frame.cell_max ?? 0); cell += 1) {
          const offset = cell * 8;
          const pattern = data[offset];
          if (pattern == null || pattern < 0) continue;
          const sheet = active.sheets[pattern < 100 ? 0 : 1];
          if (!sheet) continue;
          const local = pattern % 100;
          const zoom = (data[offset + 3] ?? 100) / 100;
          this.context.save();
          this.context.globalAlpha = (data[offset + 6] ?? 255) / 255;
          this.context.globalCompositeOperation = (data[offset + 7] ?? 0) === 1 ? "lighter" : "source-over";
          this.context.translate(x + (data[offset + 1] ?? 0), y + (data[offset + 2] ?? 0));
          this.context.rotate((data[offset + 4] ?? 0) * Math.PI / 180);
          this.context.scale(data[offset + 5] ? -1 : 1, 1);
          this.context.drawImage(sheet, local % 5 * 192, Math.floor(local / 5) * 192, 192, 192, -96 * zoom, -96 * zoom, 192 * zoom, 192 * zoom);
          this.context.restore();
        }
        return true;
      });
    }
    drawMessage(message) {
      if (!message) return;
      const c = this.context;
      c.fillStyle = "rgba(8,6,8,.92)";
      c.fillRect(12, this.height - 132, this.width - 24, 120);
      c.strokeStyle = "#c5bda9";
      c.strokeRect(12.5, this.height - 131.5, this.width - 25, 119);
      c.fillStyle = "#f1ede4";
      c.font = "20px Georgia, serif";
      wrapText(c, message, 30, this.height - 96, this.width - 60, 28);
      c.font = "13px ui-monospace, monospace";
      c.fillStyle = "#aaa";
      c.fillText("Enter / Space", this.width - 125, this.height - 24);
    }
    drawChoice(choice) {
      if (!choice) return;
      const c = this.context;
      const width = 280;
      const height = choice.options.length * 30 + 24;
      const x = this.width - width - 22;
      const y = this.height - 144 - height;
      c.fillStyle = "rgba(8,6,8,.95)";
      c.fillRect(x, y, width, height);
      c.strokeStyle = "#c5bda9";
      c.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
      c.font = "18px Georgia, serif";
      choice.options.forEach((option, index) => {
        c.fillStyle = index === choice.selected ? "#fff" : "#aaa";
        c.fillText(`${index === choice.selected ? "›" : " "} ${option}`, x + 18, y + 30 + index * 30);
      });
    }
    promptText(label, maxLength, value = "") {
      return new Promise((resolve) => {
        const form = document.createElement("form");
        form.dataset.bsModal = "name-input";
        form.style.cssText = "position:absolute;inset:0;display:grid;place-items:center;background:#000c;color:#eee;font:18px Georgia,serif";
        form.innerHTML = `<label style="display:grid;gap:10px;width:min(360px,80%)">${label}<input maxlength="${Number(maxLength) || 12}" style="padding:10px;background:#100d0e;color:#fff;border:1px solid #866"><button style="padding:9px;background:#28181c;color:#fff;border:1px solid #744">Confirm</button></label>`;
        const input = form.querySelector("input");
        let settled = false;
        input.value = value;
        form.addEventListener("submit", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (settled) return;
          settled = true;
          const result = input.value.trim();
          form.remove();
          this.stage.focus({ preventScroll: true });
          resolve(result);
        });
        this.stage.append(form);
        input.focus({ preventScroll: true });
      });
    }
    promptRetry(label, detail = "") {
      return new Promise((resolve) => {
        const form = document.createElement("form");
        form.dataset.bsModal = "resource-retry";
        form.style.cssText = "position:absolute;inset:0;display:grid;place-items:center;background:#000d;color:#eee;font:16px Georgia,serif;z-index:30";
        form.innerHTML = `<section style="width:min(480px,86%);padding:20px;border:1px solid #744;background:#100c0d"><strong></strong><p style="color:#b9acad;overflow-wrap:anywhere"></p><button value="retry">Retry</button><button value="cancel">Cancel</button></section>`;
        form.querySelector("strong").textContent = label;
        form.querySelector("p").textContent = detail;
        form.addEventListener("submit", (event) => {
          event.preventDefault();
          const retry = event.submitter?.value === "retry";
          form.remove();
          this.stage.focus({ preventScroll: true });
          resolve(retry);
        });
        this.stage.append(form);
        form.querySelector("button").focus({ preventScroll: true });
      });
    }
    async fadeTo(target, duration = 280) {
      const start = this.fade;
      const began = performance.now();
      await new Promise((resolve) => {
        const frame = (now) => {
          const progress = Math.min(1, (now - began) / duration);
          this.fade = start + (target - start) * progress;
          if (progress < 1) requestAnimationFrame(frame);
          else resolve();
        };
        requestAnimationFrame(frame);
      });
    }
    diagnostics() {
      return {
        ...this.stats,
        camera: this.camera,
        activeAnimations: this.animations.length,
        activeBalloons: this.balloons.length,
        fog: Boolean(this.fog),
        pictures: [...this.pictures.values()].map(({ id, name, x, y, opacity, angle }) => ({ id, name, x, y, opacity, angle })),
        battle: this.battleGraphics ? { battleback1: this.battleGraphics.battleback1Path, battleback2: this.battleGraphics.battleback2Path, enemies: [...this.battleGraphics.enemies.keys()] } : null,
        screenEffects: { tone: this.screenTone, flash: this.screenFlash, shake: this.screenShake, weather: this.weather },
        failedCharacterSheets: [...this.characterSheetFailures].map(([path, error]) => ({ path, error }))
      };
    }
  };
  function characterFrame(image, name, index, direction, pattern) {
    const big = name.replace(/^!/, "").startsWith("$");
    const width = image.width / (big ? 3 : 12);
    const height = image.height / (big ? 4 : 8);
    const baseX = big ? 0 : index % 4 * 3;
    const baseY = big ? 0 : Math.floor(index / 4) * 4;
    const cardinal = [2, 4, 6, 8].includes(direction) ? direction : direction < 5 ? 2 : 8;
    const row = { 2: 0, 4: 1, 6: 2, 8: 3 }[cardinal];
    return { sx: (baseX + clamp2(pattern, 0, 2)) * width, sy: (baseY + row) * height, width, height };
  }
  var FLOOR_AUTOTILE_TABLE = [
    [[2, 4], [1, 4], [2, 3], [1, 3]],
    [[2, 0], [1, 4], [2, 3], [1, 3]],
    [[2, 4], [3, 0], [2, 3], [1, 3]],
    [[2, 0], [3, 0], [2, 3], [1, 3]],
    [[2, 4], [1, 4], [2, 3], [3, 1]],
    [[2, 0], [1, 4], [2, 3], [3, 1]],
    [[2, 4], [3, 0], [2, 3], [3, 1]],
    [[2, 0], [3, 0], [2, 3], [3, 1]],
    [[2, 4], [1, 4], [2, 1], [1, 3]],
    [[2, 0], [1, 4], [2, 1], [1, 3]],
    [[2, 4], [3, 0], [2, 1], [1, 3]],
    [[2, 0], [3, 0], [2, 1], [1, 3]],
    [[2, 4], [1, 4], [2, 1], [3, 1]],
    [[2, 0], [1, 4], [2, 1], [3, 1]],
    [[2, 4], [3, 0], [2, 1], [3, 1]],
    [[2, 0], [3, 0], [2, 1], [3, 1]],
    [[0, 4], [1, 4], [0, 3], [1, 3]],
    [[0, 4], [3, 0], [0, 3], [1, 3]],
    [[0, 4], [1, 4], [0, 3], [3, 1]],
    [[0, 4], [3, 0], [0, 3], [3, 1]],
    [[2, 2], [1, 2], [2, 3], [1, 3]],
    [[2, 2], [1, 2], [2, 3], [3, 1]],
    [[2, 2], [1, 2], [2, 1], [1, 3]],
    [[2, 2], [1, 2], [2, 1], [3, 1]],
    [[2, 4], [3, 4], [2, 3], [3, 3]],
    [[2, 4], [3, 4], [2, 1], [3, 3]],
    [[2, 0], [3, 4], [2, 3], [3, 3]],
    [[2, 0], [3, 4], [2, 1], [3, 3]],
    [[2, 4], [1, 4], [2, 5], [1, 5]],
    [[2, 0], [1, 4], [2, 5], [1, 5]],
    [[2, 4], [3, 0], [2, 5], [1, 5]],
    [[2, 0], [3, 0], [2, 5], [1, 5]],
    [[0, 4], [3, 4], [0, 3], [3, 3]],
    [[2, 2], [1, 2], [2, 5], [1, 5]],
    [[0, 2], [1, 2], [0, 3], [1, 3]],
    [[0, 2], [1, 2], [0, 3], [3, 1]],
    [[2, 2], [3, 2], [2, 3], [3, 3]],
    [[2, 2], [3, 2], [2, 1], [3, 3]],
    [[2, 4], [3, 4], [2, 5], [3, 5]],
    [[2, 0], [3, 4], [2, 5], [3, 5]],
    [[0, 4], [1, 4], [0, 5], [1, 5]],
    [[0, 4], [3, 0], [0, 5], [1, 5]],
    [[0, 2], [3, 2], [0, 3], [3, 3]],
    [[0, 2], [1, 2], [0, 5], [1, 5]],
    [[0, 4], [3, 4], [0, 5], [3, 5]],
    [[2, 2], [3, 2], [2, 5], [3, 5]],
    [[0, 2], [3, 2], [0, 5], [3, 5]],
    [[0, 0], [1, 0], [0, 1], [1, 1]]
  ];
  var WALL_AUTOTILE_TABLE = [
    [[2, 2], [1, 2], [2, 1], [1, 1]],
    [[0, 2], [1, 2], [0, 1], [1, 1]],
    [[2, 0], [1, 0], [2, 1], [1, 1]],
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[2, 2], [3, 2], [2, 1], [3, 1]],
    [[0, 2], [3, 2], [0, 1], [3, 1]],
    [[2, 0], [3, 0], [2, 1], [3, 1]],
    [[0, 0], [3, 0], [0, 1], [3, 1]],
    [[2, 2], [1, 2], [2, 3], [1, 3]],
    [[0, 2], [1, 2], [0, 3], [1, 3]],
    [[2, 0], [1, 0], [2, 3], [1, 3]],
    [[0, 0], [1, 0], [0, 3], [1, 3]],
    [[2, 2], [3, 2], [2, 3], [3, 3]],
    [[0, 2], [3, 2], [0, 3], [3, 3]],
    [[2, 0], [3, 0], [2, 3], [3, 3]],
    [[0, 0], [3, 0], [0, 3], [3, 3]]
  ];
  var WATERFALL_AUTOTILE_TABLE = [[[2, 0], [1, 0], [2, 1], [1, 1]], [[0, 0], [1, 0], [0, 1], [1, 1]], [[2, 0], [3, 0], [2, 1], [3, 1]], [[0, 0], [3, 0], [0, 1], [3, 1]]];
  function clamp2(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  function wrapText(context, text, x, y, width, lineHeight) {
    for (const paragraph of String(text).split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        const test = line ? `${line} ${word}` : word;
        if (context.measureText(test).width > width && line) {
          context.fillText(line, x, y);
          y += lineHeight;
          line = word;
        } else line = test;
      }
      context.fillText(line, x, y);
      y += lineHeight;
    }
  }
  function waitFrames(frames) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(frames) || 0) * 1e3 / 60));
  }
  function updatePictureTransition(picture) {
    const transition = picture.transition;
    if (!transition) return;
    const now = performance.now();
    const progress = clamp2((now - transition.began) / Math.max(1, transition.until - transition.began), 0, 1);
    for (const [key, target] of Object.entries(transition.target)) {
      const start = transition.from[key];
      picture[key] = Number.isFinite(Number(start)) && Number.isFinite(Number(target)) ? Number(start) + (Number(target) - Number(start)) * progress : progress >= 1 ? target : start;
    }
    if (progress >= 1) delete picture.transition;
  }

  // runtime/save/indexeddb.js
  var DATABASE = "black-souls-sillytavern";
  var STORE = "saves";
  var SaveStore = class {
    async save(slot, state) {
      const record = { slot, schema: "black-souls-st-save-v1", savedAt: (/* @__PURE__ */ new Date()).toISOString(), state };
      const database = await openDatabase().catch(() => null);
      if (!database) {
        memorySaves.set(slot, record);
        return;
      }
      await request(database.transaction(STORE, "readwrite").objectStore(STORE).put(record));
    }
    async load(slot) {
      const database = await openDatabase().catch(() => null);
      const record = database ? await request(database.transaction(STORE).objectStore(STORE).get(slot)) : memorySaves.get(slot);
      if (!record) return null;
      if (record.schema !== "black-souls-st-save-v1") throw new Error(`Unsupported save schema: ${record.schema}`);
      return record.state;
    }
    async has(slot) {
      const database = await openDatabase().catch(() => null);
      return database ? Boolean(await request(database.transaction(STORE).objectStore(STORE).getKey(slot))) : memorySaves.has(slot);
    }
  };
  var databasePromise;
  var memorySaves = /* @__PURE__ */ new Map();
  function openDatabase() {
    if (!databasePromise) {
      databasePromise = new Promise((resolve, reject) => {
        const opening = indexedDB.open(DATABASE, 1);
        opening.onupgradeneeded = () => opening.result.createObjectStore(STORE, { keyPath: "slot" });
        opening.onsuccess = () => resolve(opening.result);
        opening.onerror = () => reject(opening.error);
      });
    }
    return databasePromise;
  }
  function request(value) {
    return new Promise((resolve, reject) => {
      value.onsuccess = () => resolve(value.result);
      value.onerror = () => reject(value.error);
    });
  }

  // runtime/host.js
  var BlackSoulsHost = class {
    constructor({ manifest, manifestUrl, runtimeBaseUrl, releaseRef, target = document.body, dataBaseUrl, assetDevelopmentBaseUrl, onLoaderState = () => {
    }, onHostState = () => {
    } }) {
      this.manifest = manifest;
      this.manifestUrl = manifestUrl;
      this.target = target;
      this.dataBaseUrl = new URL(dataBaseUrl ?? manifest.data.base, manifestUrl);
      this.runtimeBaseUrl = new URL(runtimeBaseUrl ?? "./", manifestUrl);
      const repository = {
        ...manifest.assets.repository,
        ref: releaseRef ?? manifest.assets.repository?.ref,
        ...assetDevelopmentBaseUrl ? { developmentBaseUrl: assetDevelopmentBaseUrl } : {}
      };
      this.assetConfig = { ...manifest.assets, repository };
      this.onLoaderState = onLoaderState;
      this.onHostState = onHostState;
      this.lifecycleState = HOST_STATES.UNINITIALIZED;
      this.presentationState = PRESENTATION_STATES.WINDOWED;
      this.resumeState = HOST_STATES.TITLE;
    }
    async mount() {
      this.root = document.createElement("main");
      this.root.className = "black-souls-host";
      this.root.innerHTML = `
      <style>${styles}</style>
      <section class="bs-viewport">
        <div class="bs-stage" tabindex="0" aria-label="BLACK SOULS game viewport"></div>
        <div class="bs-streaming" role="status" aria-live="polite" hidden><i></i><span>Loading area...</span></div>
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
      this.stage = this.root.querySelector(".bs-stage");
      this.status = this.root.querySelector(".bs-status");
      this.progress = this.root.querySelector(".bs-progress");
      this.bindControls();
      this.setLifecycle("LOAD");
      try {
        this.notifyLoader("Loading game data...", this.dataBaseUrl.href);
        const loader = new DataLoader(this.dataBaseUrl, this.runtimeBaseUrl, this.assetConfig, (message, fraction) => {
          this.setProgress(message, fraction);
          if (fraction >= 0.45) {
            this.setProgress("Starting BLACK SOULS...", 0.72);
            this.notifyLoader("Starting BLACK SOULS...", message);
          }
        }, (entry) => {
          console.debug("[BLACK SOULS diagnostics]", entry);
          this.refreshDiagnostics();
        }, {
          runtimeVersion: this.manifest.version,
          dataVersion: this.manifest.data.schema,
          developerMode: new URLSearchParams(location.search).get("bsTrace") === "1",
          ...this.manifest.streaming
        });
        const renderer = new CanvasRenderer(this.stage, loader, this.manifest.engine);
        const saves = new SaveStore();
        this.engine = new GameEngine({
          loader,
          renderer,
          saves,
          status: (message) => this.setStatus(message),
          onSceneChange: (scene) => this.handleSceneChange(scene),
          onExitRequest: () => {
            void this.pause();
          },
          onTransitionState: (state) => this.updateStreamingState(state)
        });
        await this.engine.initialize();
        this.setProgress("Ready", 1);
        this.notifyLoader("Ready", `runtime ${this.manifest.version}`);
        this.progress.classList.add("is-ready");
        this.readyTimer = setTimeout(() => {
          if (this.progress) this.progress.hidden = true;
        }, 240);
        this.focusGame();
        this.diagnosticsTimer = setInterval(() => this.refreshDiagnostics(), 1e3);
        return this;
      } catch (error) {
        this.setLifecycle("ERROR");
        throw error;
      }
    }
    bindControls() {
      this.onClick = async (event) => {
        const action = event.target.closest("[data-action]")?.dataset.action;
        if (!action) {
          if (event.target.closest(".bs-stage") && !event.target.closest("[data-bs-modal]")) this.focusGame();
          return;
        }
        try {
          if (action === "fullscreen") {
            if (document.fullscreenElement === this.root) await document.exitFullscreen?.();
            else await this.root.requestFullscreen?.();
          }
          if (action === "exit") await this.pause();
          if (action === "resume") await this.resume();
          if (action === "diagnostics") this.toggleDiagnostics(event.target.closest("button"));
          if (action !== "exit") this.focusGame();
        } catch (error) {
          this.setStatus(error.message, true);
        }
      };
      this.onFullscreenChange = () => {
        this.presentationState = transitionPresentationState(this.presentationState, document.fullscreenElement === this.root ? "FULLSCREEN_ENTER" : "FULLSCREEN_EXIT");
        this.emitHostState("fullscreenchange");
        if (this.lifecycleState !== HOST_STATES.PAUSED) this.focusGame();
        this.refreshDiagnostics();
      };
      this.root.addEventListener("click", this.onClick);
      document.addEventListener("fullscreenchange", this.onFullscreenChange);
    }
    handleSceneChange(scene) {
      this.setLifecycle(`SCENE:${scene}`);
    }
    setLifecycle(event, resumeState = this.resumeState) {
      const previous = this.lifecycleState;
      this.lifecycleState = transitionHostState(previous, event, resumeState);
      if ([HOST_STATES.TITLE, HOST_STATES.PLAYING, HOST_STATES.MENU].includes(this.lifecycleState)) this.resumeState = this.lifecycleState;
      if (previous !== this.lifecycleState) this.emitHostState(event, previous);
    }
    emitHostState(reason, previous = this.lifecycleState) {
      try {
        this.onHostState({ state: this.lifecycleState, previous, reason, scene: this.engine?.state?.scene ?? null, presentation: this.presentationState });
      } catch (error) {
        console.warn("[BLACK SOULS] Host state callback failed", error);
      }
    }
    async pause() {
      if (this.lifecycleState === HOST_STATES.PAUSED) return;
      if (document.fullscreenElement === this.root) await document.exitFullscreen?.();
      this.resumeState = hostStateForScene(this.engine?.state?.scene);
      this.engine?.pause();
      this.root.classList.add("is-paused");
      this.root.querySelector(".bs-resume-layer").hidden = false;
      this.setLifecycle("PAUSE");
    }
    async resume() {
      if (this.lifecycleState !== HOST_STATES.PAUSED) return;
      this.root.classList.remove("is-paused");
      this.root.querySelector(".bs-resume-layer").hidden = true;
      this.engine?.resume();
      this.setLifecycle("RESUME", this.resumeState);
      this.focusGame();
    }
    focusGame() {
      if (!this.stage || this.lifecycleState === HOST_STATES.PAUSED || this.stage.querySelector("[data-bs-modal]")) return;
      this.stage.focus({ preventScroll: true });
    }
    setProgress(message, fraction = 0) {
      this.progress.querySelector("span").textContent = message;
      this.progress.querySelector("i").style.setProperty("--progress", `${Math.max(0, Math.min(1, fraction)) * 100}%`);
    }
    setStatus(message, error = false) {
      clearTimeout(this.statusTimer);
      this.status.textContent = message ?? "";
      this.status.hidden = !message;
      this.status.classList.toggle("error", error);
      if (message && !error) this.statusTimer = setTimeout(() => {
        if (this.status) this.status.hidden = true;
      }, 1800);
    }
    updateStreamingState(state) {
      const indicator = this.root?.querySelector(".bs-streaming");
      if (!indicator) return;
      if (state.state === "loading") {
        indicator.hidden = false;
        const transition = state.streaming?.transition;
        indicator.querySelector("span").textContent = `Loading Map ${String(state.mapId).padStart(3, "0")} · ${transition?.criticalReady ?? 0}/${transition?.criticalTotal ?? "?"} critical`;
      } else {
        indicator.hidden = true;
        if (state.state === "failed") this.setStatus(`Map ${state.mapId} failed: ${state.error}`, true);
      }
      this.refreshDiagnostics();
    }
    notifyLoader(state, detail = "") {
      try {
        this.onLoaderState(state, detail);
      } catch (error) {
        console.warn("[BLACK SOULS] Loader state callback failed", error);
      }
    }
    toggleDiagnostics(button) {
      const panel = this.root.querySelector(".bs-diagnostics");
      panel.hidden = !panel.hidden;
      button?.setAttribute("aria-expanded", String(!panel.hidden));
      this.refreshDiagnostics();
    }
    refreshDiagnostics() {
      const output = this.root?.querySelector(".bs-diagnostics pre");
      if (!output || !this.engine) return;
      output.textContent = JSON.stringify({
        runtime: { version: this.manifest.version, manifestUrl: this.manifestUrl.href },
        host: { state: this.lifecycleState, presentation: this.presentationState, fullscreen: document.fullscreenElement === this.root, focus: document.activeElement === this.stage },
        ...this.engine.getDiagnostics()
      }, null, 2);
    }
    async save(slot) {
      return this.engine.save(slot);
    }
    async loadSave(slot) {
      return this.engine.load(slot);
    }
    async reset() {
      return this.engine.newGame();
    }
    getState() {
      return this.engine.snapshot();
    }
    getHostState() {
      return { state: this.lifecycleState, presentation: this.presentationState, scene: this.engine?.state?.scene ?? null };
    }
    getDiagnostics() {
      this.refreshDiagnostics();
      return { host: this.getHostState(), ...this.engine.getDiagnostics() };
    }
    async unmount() {
      clearTimeout(this.readyTimer);
      clearTimeout(this.statusTimer);
      clearInterval(this.diagnosticsTimer);
      this.root?.removeEventListener("click", this.onClick);
      document.removeEventListener("fullscreenchange", this.onFullscreenChange);
      if (document.fullscreenElement === this.root) await document.exitFullscreen?.();
      await this.engine?.destroy();
      this.setLifecycle("UNMOUNT");
      this.root?.remove();
    }
  };
  var styles = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; }
  body { margin: 0; background: #000; color: #e9e5dd; font: 14px/1.4 Georgia, serif; }
  .black-souls-host { position: fixed; inset: 0; width: 100vw; height: 100vh; overflow: hidden; background: #000; }
  .bs-viewport { position: absolute; inset: 0; display: grid; place-items: center; overflow: hidden; background: #000; }
  .bs-stage { position: relative; width: min(100vw, calc(100vh * 4 / 3)); height: min(100vh, calc(100vw * 3 / 4)); aspect-ratio: 4 / 3; outline: none; background: #000; }
  .bs-stage:focus-visible { box-shadow: inset 0 0 0 2px #9a5559; }
  .bs-stage canvas { width: 100%; height: 100%; image-rendering: pixelated; display: block; }
  .bs-streaming { position: fixed; z-index: 9; left: 50%; bottom: 16px; transform: translateX(-50%); padding: 7px 10px; border: 1px solid #46383a; background: #080607e8; color: #bcb3aa; font: 11px ui-monospace, monospace; }
  .bs-streaming i { display: inline-block; width: 8px; height: 8px; margin-right: 7px; border: 1px solid #8e5b60; border-top-color: transparent; border-radius: 50%; animation: bs-stream-spin .8s linear infinite; }
  @keyframes bs-stream-spin { to { transform: rotate(360deg); } }
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

  // runtime/bootstrap.js
  var activeHost = null;
  async function mount(options = {}) {
    if (activeHost) await activeHost.unmount();
    const codeBaseUrl = new URL(options.codeBaseUrl ?? "./", options.documentUrl ?? document.baseURI);
    const manifestUrl = new URL(options.manifestUrl ?? "manifest.json", codeBaseUrl);
    options.onLoaderState?.("Loading game data...", manifestUrl.href);
    const manifest = await fetchJson(manifestUrl);
    activeHost = new BlackSoulsHost({ ...options, manifest, manifestUrl, runtimeBaseUrl: codeBaseUrl });
    await activeHost.mount();
    return activeHost;
  }
  async function unmount() {
    if (!activeHost) return;
    await activeHost.unmount();
    activeHost = null;
  }
  var api = {
    mount,
    unmount,
    loadSave: (slot) => activeHost?.loadSave(slot),
    save: (slot) => activeHost?.save(slot),
    reset: () => activeHost?.reset(),
    pause: () => activeHost?.pause(),
    resume: () => activeHost?.resume(),
    getState: () => activeHost?.getState() ?? null,
    getHostState: () => activeHost?.getHostState() ?? { state: "UNMOUNTED", presentation: "WINDOWED", scene: null },
    getDiagnostics: () => activeHost?.getDiagnostics() ?? null
  };
  globalThis.BlackSoulsRuntime = api;
  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) throw new Error(`Runtime manifest failed: HTTP ${response.status} ${response.statusText} at ${url}`);
    const contentType = response.headers.get("content-type") || "";
    if (!/\bjson\b/i.test(contentType)) throw new Error(`Runtime manifest has invalid Content-Type "${contentType || "(missing)"}" at ${url}`);
    return response.json();
  }
})();
