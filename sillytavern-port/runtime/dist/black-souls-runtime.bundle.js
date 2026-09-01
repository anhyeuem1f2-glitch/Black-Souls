/* BLACK SOULS browser runtime 0.9.0; source c5661976c3032a8a96a7a26e4af51cce6497a71f */
(() => {
  // sillytavern-port/runtime/core/input.js
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
      this.dashPressed = false;
      this.onKeyDown = (event) => {
        if (!this.ownsKeyboard(event)) return;
        const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
        if (axes.has(key)) {
          const firstPress = !this.held.has(key);
          this.held.set(key, axes.get(key));
          if (firstPress) this.enqueueHeldDirection();
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
        if (key === "Shift") {
          this.dashPressed = true;
          this.consume(event);
        }
      };
      this.onKeyUp = (event) => {
        const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
        this.held.delete(key);
        if (key === "Shift") this.dashPressed = false;
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
    currentDirection() {
      let dx = 0;
      let dy = 0;
      for (const [x, y] of this.held.values()) {
        dx += x;
        dy += y;
      }
      dx = Math.sign(dx);
      dy = Math.sign(dy);
      const direction = directionNumber.get(`${dx},${dy}`);
      return direction ? [dx, dy, direction] : null;
    }
    takeMovementDirection() {
      const held = this.currentDirection();
      if (held) {
        this.queue.length = 0;
        return held;
      }
      return this.takeDirection();
    }
    isDashPressed() {
      return this.dashPressed;
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
      this.dashPressed = false;
    }
    destroy() {
      this.window.removeEventListener("keydown", this.onKeyDown, true);
      this.window.removeEventListener("keyup", this.onKeyUp, true);
    }
  };

  // sillytavern-port/runtime/map/collision.js
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

  // sillytavern-port/runtime/map/interpreter.js
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
            const choiceAttached = list[index + 1]?.code === 102;
            const message = this.engine.showMessage(lines.join("\n"), { face: parameters[0], faceIndex: parameters[1], background: parameters[2], position: parameters[3], choiceAttached });
            if (choiceAttached) await message;
            else await this.suspend("message", message);
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
            await this.suspendVisual("resource", this.changePartyMember(parameters), { operation: "party-member", actorId: parameters[0] });
            break;
          case 132:
            this.engine.changeBattleBgm?.(parameters[0]);
            break;
          case 134:
            this.engine.state.system ??= {};
            this.engine.state.system.saveDisabled = parameters[0] !== 0;
            break;
          case 135:
            this.engine.state.system ??= {};
            this.engine.state.system.menuDisabled = parameters[0] !== 0;
            break;
          case 136:
            this.engine.state.system ??= {};
            this.engine.state.system.encounterDisabled = parameters[0] !== 0;
            break;
          case 137:
            this.engine.state.system ??= {};
            this.engine.state.system.formationDisabled = parameters[0] !== 0;
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
          case 281:
            this.engine.state.mapNameDisplay = parameters[0] === 0;
            break;
          case 301: {
            const troopId = this.engine.resolveBattleTroop?.(parameters) ?? (parameters[0] === 0 ? Number(parameters[1]) : 0);
            if (!troopId) {
              this.engine.noteUnsupported(301, "no eligible troop");
              break;
            }
            const outcome = await this.suspend("battle", this.engine.startBattle(troopId, parameters[2], parameters[3]), { troopId });
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
          case 321:
            this.engine.changeActorClass?.(parameters[0], parameters[1], Boolean(parameters[2]));
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
      else if (operandType === 2) value = randomInteger(Number(operand[0]), Number(operand[1]));
      else if (operandType === 3) value = this.gameDataOperand(operand[0], operand[1], operand[2]);
      else return this.engine.noteUnsupported(122, `operand ${operandType}`);
      for (let id = first; id <= last; id += 1) {
        const current = this.engine.state.variables[id] ?? 0;
        this.engine.state.variables[id] = operation === 0 ? value : operation === 1 ? current + value : operation === 2 ? current - value : operation === 3 ? current * value : operation === 4 ? Math.trunc(current / value) : current % value;
      }
    }
    gameDataOperand(type, first, second) {
      if (type === 0) return this.engine.party?.quantity?.(this.engine.state, "item", first) ?? 0;
      if (type === 1) return this.engine.party?.quantity?.(this.engine.state, "weapon", first) ?? 0;
      if (type === 2) return this.engine.party?.quantity?.(this.engine.state, "armor", first) ?? 0;
      if (type === 3) {
        const actor = this.engine.state.actors?.[first];
        const parameters = this.engine.party?.parameters?.(this.engine.state, first) ?? {};
        return [actor?.level, actor?.exp, actor?.hp, actor?.mp, parameters.mhp, parameters.mmp, parameters.atk, parameters.def, parameters.mat, parameters.mdf, parameters.agi, parameters.luk][second] ?? 0;
      }
      if (type === 5) {
        if (Number(first) === -1) return [this.engine.state.x, this.engine.state.y, this.engine.state.direction][second] ?? 0;
        const id = Number(first) === 0 ? this.current?.eventId : Number(first);
        const event = this.engine.map?.events?.[id];
        const override = this.engine.state.eventOverrides?.[`${this.engine.state.mapId},${id}`];
        return [override?.x ?? event?.x, override?.y ?? event?.y, override?.direction][second] ?? 0;
      }
      if (type === 6) return this.engine.state.party?.members?.[Number(first)] ?? 0;
      if (type === 7) return [
        this.engine.state.mapId,
        this.engine.state.party?.members?.length ?? 0,
        this.engine.state.party?.gold ?? 0,
        this.engine.state.steps ?? 0,
        Math.floor(this.engine.state.system?.playtimeSeconds ?? 0),
        Math.floor((this.engine.state.timer?.count ?? 0) / 60),
        this.engine.state.system?.saveCount ?? 0,
        this.engine.state.system?.battleCount ?? 0
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
        } else if (command.code === 15) await (this.engine.waitFrames?.(Math.max(0, Number(parameters[0]) - 1)) ?? wait(Math.max(0, Number(parameters[0]) - 1) * 1e3 / 60));
        else if (command.code >= 16 && command.code <= 19) this.engine.setRouteDirection?.(target, { 16: 2, 17: 4, 18: 6, 19: 8 }[command.code], context.eventId);
        else if (command.code === 27) this.engine.state.switches[parameters[0]] = true;
        else if (command.code === 28) this.engine.state.switches[parameters[0]] = false;
        else if (command.code === 29) this.engine.setRouteProperty?.(target, "moveSpeed", Number(parameters[0]), context.eventId);
        else if (command.code === 30) this.engine.setRouteProperty?.(target, "moveFrequency", Number(parameters[0]), context.eventId);
        else if (command.code === 37) this.engine.setRouteProperty?.(target, "through", true, context.eventId);
        else if (command.code === 38) this.engine.setRouteProperty?.(target, "through", false, context.eventId);
        else if (command.code === 39) this.engine.setRouteProperty?.(target, "transparent", true, context.eventId);
        else if (command.code === 40) this.engine.setRouteProperty?.(target, "transparent", false, context.eventId);
        else if (command.code === 41) {
          await this.suspendVisual("resource", this.engine.changeCharacterGraphic(target, command.parameters?.[0], command.parameters?.[1], context.eventId), { reason: "move-route-graphic", target, name: command.parameters?.[0] });
        } else if (command.code === 42) this.engine.setRouteProperty?.(target, "opacity", Number(parameters[0]), context.eventId);
        else if (command.code === 44) await this.engine.playSe?.(parameters[0]);
        else if (![0, 31, 32, 33, 34, 35, 36, 43].includes(command.code)) this.engine.noteUnsupported(205, `move command ${command.code}`);
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
      const [actorId, operation, initialize] = parameters;
      if (this.engine.changePartyMember) return this.engine.changePartyMember(actorId, operation, Boolean(initialize));
      this.engine.state.party ??= { members: [] };
      const members = this.engine.state.party.members;
      if (operation === 0 && !members.includes(actorId)) members.push(actorId);
      if (operation === 1) this.engine.state.party.members = members.filter((id) => id !== actorId);
      return Promise.resolve();
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
  function randomInteger(minimum, maximum) {
    const low = Math.min(minimum, maximum);
    const high = Math.max(minimum, maximum);
    return low + Math.floor(Math.random() * (high - low + 1));
  }
  var interpreterSequence = 0;
  function summarizeParameters(parameters) {
    const summary = JSON.stringify(parameters);
    return summary.length > 180 ? `${summary.slice(0, 177)}...` : summary;
  }

  // sillytavern-port/runtime/audio/audio-manager.js
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

  // sillytavern-port/runtime/core/lifecycle.js
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

  // sillytavern-port/runtime/game/party-system.js
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
        nickname: actor.nickname ?? "",
        description: actor.description ?? "",
        characterName: actor.character_name ?? "",
        characterIndex: Number(actor.character_index) || 0,
        faceName: actor.face_name ?? "",
        faceIndex: Number(actor.face_index) || 0,
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
        actor.nickname ??= actorData.nickname ?? "";
        actor.description ??= actorData.description ?? "";
        actor.characterName ??= actorData.character_name ?? "";
        actor.characterIndex ??= Number(actorData.character_index) || 0;
        actor.faceName ??= actorData.face_name ?? "";
        actor.faceIndex ??= Number(actorData.face_index) || 0;
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

  // sillytavern-port/runtime/game/combat-system.js
  var MAX_AP = 4e3;
  var FRAME_AP_GAIN = 10;
  var REFRESH_FRAME = 3;
  var DIFFICULTY_VARIABLE_ID = 60;
  var START_AP_RATES = Object.freeze({ preemptive: [40, 30], normal: [30, 40], surprise: [0, 10], escapeFailed: [0, 10] });
  var NO_MIRROR_TROOPS = /* @__PURE__ */ new Set([136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 165, 166, 167, 168, 169, 170, 171, 176, 177, 178, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 220, 221, 222, 223, 224, 225, 69, 70, 71, 72, 73, 134, 226, 227, 228, 229, 231, 232, 233, 235, 236, 240, 26, 164, 255, 256, 257, 263, 135, 289, 304, 305, 306, 307, 308, 309, 310, 311, 312, 313, 259, 260, 317, 318, 314, 315, 172]);
  var NO_ZOOM_TROOPS = /* @__PURE__ */ new Set([153, 26]);
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
    createBattle(state, troopId, { canEscape = false, canLose = false, battleback1 = "", battleback2 = "", preemptive = false, surprise = false, encounter = null } = {}) {
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
          faceName: actor.faceName ?? this.database.actors[actorId]?.face_name ?? "",
          faceIndex: actor.faceIndex ?? this.database.actors[actorId]?.face_index ?? 0,
          ap: 0,
          chant: null,
          guarding: false,
          turnCount: 1
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
          ap: 0,
          chant: null,
          guarding: false,
          turnCount: 1
        };
      });
      const battle = {
        troopId,
        troopName: troop.name,
        canEscape,
        canLose,
        battleback1,
        battleback2,
        preemptive: Boolean(preemptive),
        surprise: Boolean(surprise),
        encounter: encounter ? structuredClone(encounter) : null,
        phase: "running",
        actors,
        enemies,
        selectedCommand: 0,
        selectedTarget: 0,
        commands: [],
        commandDefinitions: [],
        log: [`${troop.name} appeared.`],
        frames: 0,
        escapeAttempts: 0,
        result: null,
        rngSeed: (2654435769 ^ troopId ^ difficulty << 16) >>> 0,
        difficulty,
        compatibility: { maxAp: MAX_AP, frameApGain: FRAME_AP_GAIN, refreshFrame: REFRESH_FRAME, smartEnemyAi: true, casting: true, castInterruption: true, dynamicActorCommands: true, difficultyVariable: DIFFICULTY_VARIABLE_ID, symbolContactCondition: true },
        mistEnabled: !state.switches?.[5],
        endRecoveryApplied: false
      };
      for (const enemy of enemies) {
        const visualSeed = Number(troopId) * 1103515245 + Number(enemy.enemyId) * 12345 + enemy.index * 2654435761 >>> 0;
        enemy.mirror = !NO_MIRROR_TROOPS.has(Number(troopId)) && visualSeed % 3 === 0;
        enemy.perspectiveScale = NO_ZOOM_TROOPS.has(Number(troopId)) ? 1 : (Number(enemy.y) - 480 * 0.65) * 5e-3 + 1;
        enemy.breathPeriod = 150 + visualSeed % 30;
        enemy.breathOffset = (visualSeed >>> 8) % enemy.breathPeriod;
      }
      const actorMode = preemptive ? 1 : surprise ? -1 : 0;
      const enemyMode = -actorMode;
      for (const actor of actors) actor.ap = this.startAp(state, actor, actorMode, battle);
      for (const enemy of enemies) enemy.ap = this.startAp(state, enemy, enemyMode, battle);
      return battle;
    }
    update(state, frames = 1) {
      const battle = state.battle;
      if (!battle || battle.result || battle.phase === "actor-command" || battle.phase === "target") return battle?.result ?? null;
      for (let frame = 0; frame < frames && !battle.result; frame += 1) {
        battle.frames += 1;
        for (const battler of [...battle.actors, ...battle.enemies]) {
          if (battler.hp <= 0 || !battler.chant && battler.ap >= MAX_AP) continue;
          if (battle.frames % REFRESH_FRAME !== 0) continue;
          const point = this.apGainPoint(state, battler, Boolean(battler.chant)) * REFRESH_FRAME;
          if (battler.chant) battler.chant.elapsed = Math.min(battler.chant.total, battler.chant.elapsed + point);
          else battler.ap = Math.min(MAX_AP, battler.ap + point);
        }
        const completedChant = [...battle.actors, ...battle.enemies].find((entry) => entry.hp > 0 && entry.chant && entry.chant.elapsed >= entry.chant.total);
        if (completedChant) {
          this.resolveChant(state, completedChant);
          this.checkResult(state);
          continue;
        }
        const actor = battle.actors.find((entry) => entry.hp > 0 && !entry.chant && entry.ap >= MAX_AP);
        if (actor) {
          battle.phase = "actor-command";
          battle.activeActor = actor.index;
          battle.commandDefinitions = this.actorCommands(state, actor);
          battle.commands = battle.commandDefinitions.map((command) => command.name);
          battle.selectedCommand = 0;
          break;
        }
        const enemy = battle.enemies.find((entry) => entry.hp > 0 && !entry.chant && entry.ap >= MAX_AP);
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
        this.finishAction(state, actor, this.database.skills[2]);
        battle.phase = "running";
        battle.log.push(`${actor.name} defended.`);
        return { accepted: true };
      }
      if (symbol === "item") {
        const itemId = Number(payload.itemId);
        const item = this.database.items[itemId];
        if (!item || this.party.quantity(state, "item", itemId) < 1) return { accepted: false, reason: "unavailable" };
        const targets2 = this.targetsForSkill(battle, actor, item, targetIndex);
        const result2 = targets2.map((target) => this.applySkill(state, actor, target, item));
        if (item.consumable) this.party.gain(state, "item", itemId, -1);
        this.applyUserEffect(state, actor, item);
        this.finishAction(state, actor, item);
        battle.phase = "running";
        battle.log.push(`${actor.name} used ${item.name}.`);
        this.checkResult(state);
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
        const total = Math.max(1, chant.base + randomIntInclusive(battle, chant.random));
        actor.chant = { skillId, targetIndex, type: chant.type, elapsed: 0, total };
        battle.phase = "running";
        battle.log.push(`${actor.name} began casting ${skill.name}.`);
        return { accepted: true, chanting: true };
      }
      const targets = this.targetsForSkill(battle, actor, skill, targetIndex);
      const result = [];
      for (let repeat = 0; repeat < Math.max(1, Number(skill.repeats) || 1); repeat += 1) for (const target of targets) result.push(this.applySkill(state, actor, target, skill));
      this.applyUserEffect(state, actor, skill);
      actor.tp = Math.min(100, actor.tp + Number(skill.tp_gain ?? 0));
      this.syncActor(state, actor);
      this.finishAction(state, actor, skill);
      actor.guarding = false;
      battle.phase = "running";
      this.checkResult(state);
      return { accepted: true, result };
    }
    attackSkillId(state, actorId) {
      const battler = state.battle?.actors?.find((entry) => entry.actorId === actorId) ?? { side: "actor", actorId, states: state.actors[actorId]?.states ?? [] };
      const candidates = this.featureObjects(state, battler).flatMap((object) => [...String(object.note ?? "").matchAll(/<攻撃ID変更[：:](\d+)>/g)].map((match) => Number(match[1])));
      if (!candidates.length) return 1;
      return [...new Set(candidates)].sort((left, right) => {
        const priority = attackSkillPriority(this.database.skills[right]) - attackSkillPriority(this.database.skills[left]);
        return priority || right - left;
      })[0];
    }
    enemyAction(state, enemy) {
      const battle = state.battle;
      const data = this.database.enemies[enemy.enemyId];
      const action = this.selectEnemyAction(state, enemy, data.actions ?? []);
      const skill = this.database.skills[action?.skill_id ?? 1];
      const targetIndex = action?._smartTargets?.[Math.floor(nextRandom(battle) * action._smartTargets.length)] ?? 0;
      const target = this.targetsForSkill(battle, enemy, skill, targetIndex)[0];
      if (!target || !skill) return;
      if (enemy.mp < Number(skill.mp_cost ?? 0) || enemy.tp < Number(skill.tp_cost ?? 0)) {
        enemy.ap = 0;
        return;
      }
      enemy.mp -= Number(skill.mp_cost ?? 0);
      enemy.tp -= Number(skill.tp_cost ?? 0);
      const chant = chantMetadata(skill.note);
      if (chant) {
        const total = Math.max(1, chant.base + randomIntInclusive(battle, chant.random));
        enemy.chant = { skillId: skill.id, targetIndex: target.index, type: chant.type, elapsed: 0, total };
        battle.log.push(`${enemy.name} began casting ${skill.name}.`);
        return;
      }
      for (let repeat = 0; repeat < Math.max(1, Number(skill.repeats) || 1); repeat += 1) for (const resolved of this.targetsForSkill(battle, enemy, skill, target.index)) this.applySkill(state, enemy, resolved, skill);
      this.applyUserEffect(state, enemy, skill);
      enemy.tp = Math.min(100, enemy.tp + Number(skill.tp_gain ?? 0));
      this.finishAction(state, enemy, skill);
      enemy.guarding = false;
    }
    selectEnemyAction(state, enemy, actions) {
      const battle = state.battle;
      const data = this.database.enemies[enemy.enemyId];
      let forced = actions.filter((action) => Number(action.rating) === 10 && this.skillUsable(enemy, this.database.skills[action.skill_id]));
      const exclusions = actions.filter((action) => Number(action.rating) === 1 && this.skillUsable(enemy, this.database.skills[action.skill_id]));
      if (String(data?.note ?? "").includes("賢くランダム")) forced = shuffleWithBattle(forced, battle);
      for (const action of forced) {
        const skill = this.database.skills[action.skill_id];
        const targets = this.smartTargets(state, enemy, action, skill, exclusions);
        if (targets.length) return { ...action, _smartTargets: targets };
      }
      const candidates = actions.filter((action) => ![1, 10].includes(Number(action.rating)) && this.actionCondition(state, enemy, action) && this.skillUsable(enemy, this.database.skills[action.skill_id]));
      if (!candidates.length) return actions.find((action) => Number(action.skill_id) === 1) ?? actions[0];
      const ratingMax = Math.max(...candidates.map((action) => Number(action.rating) || 0));
      const ratingZero = ratingMax - 3;
      const weighted = candidates.filter((action) => Number(action.rating) > ratingZero);
      const sum = weighted.reduce((total, action) => total + Number(action.rating) - ratingZero, 0);
      let roll = Math.floor(nextRandom(battle) * Math.max(1, sum));
      for (const action of weighted) {
        roll -= Number(action.rating) - ratingZero;
        if (roll < 0) return action;
      }
      return weighted.at(-1);
    }
    actionCondition(state, enemy, action) {
      const rate = enemy.hp / Math.max(1, enemy.parameters.mhp);
      const mpRate = enemy.mp / Math.max(1, enemy.parameters.mmp);
      const type = Number(action.condition_type);
      const p1 = Number(action.condition_param1);
      const p2 = Number(action.condition_param2);
      if (type === 0) return true;
      if (type === 1) return p2 === 0 ? enemy.turnCount === p1 : enemy.turnCount > 0 && enemy.turnCount >= p1 && enemy.turnCount % p2 === p1 % p2;
      if (type === 2) return rate >= p1 && rate <= p2;
      if (type === 3) return mpRate >= p1 && mpRate <= p2;
      if (type === 4) return enemy.states.includes(p1);
      if (type === 5) return Math.max(...state.battle.actors.map((actor) => Number(state.actors[actor.actorId]?.level) || 1)) >= p1;
      if (type === 6) return Boolean(state.switches[p1]);
      return false;
    }
    resolveChant(state, battler) {
      const battle = state.battle;
      const chant = battler.chant;
      battler.chant = null;
      const skill = this.database.skills[chant.skillId];
      const targets = this.targetsForSkill(battle, battler, skill, chant.targetIndex);
      for (let repeat = 0; repeat < Math.max(1, Number(skill.repeats) || 1); repeat += 1) for (const target of targets) if (target?.hp > 0) this.applySkill(state, battler, target, skill);
      this.applyUserEffect(state, battler, skill);
      this.finishAction(state, battler, skill);
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
      if (!target || target.hp <= 0 && ![9, 10].includes(Number(skill?.scope))) return null;
      const physical = Number(skill.hit_type ?? 0) === 1;
      const hitChance = Math.max(0, Math.min(1, Number(skill.success_rate ?? 100) / 100 * (physical ? subject.hit ?? 0.95 : 1) * (1 - (target.eva ?? 0))));
      if (nextRandom(state.battle) >= hitChance) {
        state.battle.log.push(`${subject.name} used ${skill.name}, but missed ${target.name}.`);
        return { skillId: skill.id, missed: true };
      }
      const raw = evaluateFormula(skill.damage?.formula, { ...subject.parameters, hp: subject.hp, mp: subject.mp, tp: subject.tp }, { ...target.parameters, hp: target.hp, mp: target.mp, tp: target.tp }, state.variables);
      const damageType = Number(skill.damage?.type ?? 0);
      const variance = Math.max(0, Number(skill.damage?.variance ?? 0)) / 100;
      let amount = Math.max(0, Math.floor(Math.abs(raw) * (1 + (nextRandom(state.battle) * 2 - 1) * variance)));
      const critical = Boolean(skill.damage?.critical) && [1, 5].includes(damageType) && nextRandom(state.battle) < Number(subject.cri ?? 0.04);
      if (critical) amount = Math.floor(amount * DIFFICULTY_RATES.critical[state.battle?.difficulty ?? 0]);
      const before = target.hp;
      const applied = Math.max(1, target.guarding && [1, 5].includes(damageType) ? Math.floor(amount / 2) : amount);
      if ([1, 5].includes(damageType)) {
        const guts = target.states.includes(59) && applied <= 999999 && target.hp <= applied && target.hp > 1;
        target.hp = guts ? 1 : Math.max(0, target.hp - applied);
      }
      if ([2, 6].includes(damageType)) target.mp = Math.max(0, target.mp - amount);
      if (damageType === 3) this.applyRecovery(state, target, "hp", amount);
      if (damageType === 4) this.applyRecovery(state, target, "mp", amount);
      if (damageType === 5) subject.hp = Math.min(subject.parameters.mhp, subject.hp + Math.max(0, before - target.hp));
      if (damageType === 6) subject.mp = Math.min(subject.parameters.mmp, subject.mp + amount);
      for (const effect of skill.effects ?? []) {
        if (effect.code === 11) this.applyRecovery(state, target, "hp", Math.floor(target.parameters.mhp * Number(effect.value1 || 0) + Number(effect.value2 || 0)));
        if (effect.code === 12) this.applyRecovery(state, target, "mp", Math.floor(target.parameters.mmp * Number(effect.value1 || 0) + Number(effect.value2 || 0)));
        if (effect.code === 13) target.tp = clamp2(target.tp + Math.floor(100 * Number(effect.value1 || 0) + Number(effect.value2 || 0)), 0, 100);
        if (effect.code === 21 && nextRandom(state.battle) < Math.max(0, Number(effect.value1) || 0) && !target.states.includes(effect.data_id)) {
          target.states.push(effect.data_id);
          this.applyStateApControl(state, target, Number(effect.data_id));
        }
        if (effect.code === 22 && nextRandom(state.battle) < Math.max(0, Number(effect.value1) || 0)) target.states = target.states.filter((id) => id !== effect.data_id);
      }
      if (target.hp <= 0) this.tryAutoResurrection(state, target);
      this.syncActor(state, target);
      const dealt = Math.max(0, before - target.hp);
      state.battle.log.push(`${critical ? "Critical! " : ""}${subject.name} used ${skill.name}: ${dealt} damage to ${target.name}.`);
      return { skillId: skill.id, subject: subject.name, target: target.name, damage: dealt, hp: target.hp, critical };
    }
    tryAutoResurrection(state, target) {
      for (const object of this.featureObjects(state, target)) {
        for (const match of String(object.note ?? "").matchAll(/<自動蘇生[：:]([^>]+)>/g)) {
          const [hpExpression, animationText, chanceExpression = "100"] = match[1].split(/\s*,\s*/);
          const chance = recoveryExpression(chanceExpression, target, state.variables);
          if (chance <= nextRandom(state.battle) * 100) continue;
          const hp = Math.floor(recoveryExpression(hpExpression, target, state.variables));
          if (hp <= 0) continue;
          target.hp = clamp2(hp, 1, target.parameters.mhp);
          target.resurrectionAnimationId = Number(animationText) || 0;
          this.breakResurrectionFeature(state, target, object);
          state.battle.log.push(`${target.name} resurrected with ${target.hp} HP.`);
          return true;
        }
      }
      return false;
    }
    breakResurrectionFeature(state, target, feature) {
      const match = /<自動蘇生破損[：:]([^>]+)>/.exec(String(feature.note ?? ""));
      if (!match || recoveryExpression(match[1], target, state.variables) <= nextRandom(state.battle) * 100) return;
      const stateId = target.states.find((id) => this.database.states[id] === feature);
      if (stateId) target.states = target.states.filter((id) => id !== stateId);
      if (target.side === "actor") {
        const actor = state.actors[target.actorId];
        const equip = actor.equips.find((entry) => entry.id && this.party.data(entry.kind, entry.id) === feature);
        if (equip) Object.assign(equip, { id: 0 });
      }
    }
    applyRecovery(state, target, kind, amount) {
      if (amount <= 0) return;
      const notes = this.featureNotes(state, target);
      const prefix = kind === "hp" ? "HP" : "MP";
      const voidChance = notes.reduce((sum, note) => sum + noteNumber(note, new RegExp(`<${prefix}回復無効[：:](\\d+)>`), 0), 0);
      const reverseChance = notes.reduce((sum, note) => sum + noteNumber(note, new RegExp(`<${prefix}回復反転[：:](\\d+)>`), 0), 0);
      if (voidChance > nextRandom(state.battle) * 100) return;
      const reverse3 = reverseChance > nextRandom(state.battle) * 100;
      const maximum = kind === "hp" ? target.parameters.mhp : target.parameters.mmp;
      target[kind] = reverse3 ? Math.max(0, target[kind] - amount) : Math.min(maximum, target[kind] + amount);
    }
    applyUserEffect(state, subject, object) {
      const match = /<使用者効果\s*(\d+)\s*>/.exec(String(object?.note ?? ""));
      if (!match || subject.hp <= 0) return;
      const reaction = this.database.skills[Number(match[1])];
      if (reaction) this.applySkill(state, subject, subject, reaction);
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
        this.applyBattleEndRecovery(state, battle);
        return { accepted: true, escaped: true };
      }
      for (const actor of battle.actors) actor.ap = this.startAp(state, actor, 2, battle);
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
        this.applyBattleEndRecovery(state, battle);
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
      if (battle.endRecoveryApplied) return;
      battle.endRecoveryApplied = true;
      for (const battler of battle.actors) {
        const actor = state.actors[battler.actorId];
        const notes = this.featureNotes(state, battler).join("\n");
        const parameters = this.party.parameters(state, battler.actorId);
        for (const match of notes.matchAll(/<戦闘終了後HP回復[：:]([^>]+)>/g)) actor.hp = clamp2(actor.hp + Math.floor(recoveryExpression(match[1], { ...battler, parameters }, state.variables)), 0, parameters.mhp);
        for (const match of notes.matchAll(/<戦闘終了後MP回復[：:]([^>]+)>/g)) actor.mp = clamp2(actor.mp + Math.floor(recoveryExpression(match[1], { ...battler, parameters }, state.variables)), 0, parameters.mmp);
        for (const match of notes.matchAll(/<戦闘終了後TP回復[：:]([^>]+)>/g)) actor.tp = clamp2(actor.tp + Math.floor(recoveryExpression(match[1], { ...battler, parameters }, state.variables)), 0, 100);
        for (const match of notes.matchAll(/<戦闘終了後ステート解除[：:]([^>]+)>/g)) actor.states = actor.states.filter((id) => id !== Math.floor(recoveryExpression(match[1], { ...battler, parameters }, state.variables)));
        Object.assign(battler, { hp: actor.hp, mp: actor.mp, tp: actor.tp, states: [...actor.states] });
      }
    }
    syncActor(state, battler) {
      if (battler.side !== "actor") return;
      const actor = state.actors[battler.actorId];
      Object.assign(actor, { hp: battler.hp, mp: battler.mp, tp: battler.tp, states: [...battler.states] });
    }
    startAp(state, battler, mode, battle) {
      const rates = mode === 1 ? START_AP_RATES.preemptive : mode === -1 ? START_AP_RATES.surprise : mode === 2 ? START_AP_RATES.escapeFailed : START_AP_RATES.normal;
      let base = rates[0];
      let range = rates[1];
      for (const note of this.featureNotes(state, battler)) {
        const modeText = mode === 2 ? null : String(mode);
        const pattern = modeText == null ? /<逃走ＡＰ=\[(\-?\d+),(\-?\d+)\]>/g : new RegExp(`<開始ＡＰ=${modeText.replace("-", "\\-")},\\[(\\-?\\d+),(\\-?\\d+)\\]>`, "g");
        for (const match of note.matchAll(pattern)) {
          base += Number(match[1]);
          range += Number(match[2]);
        }
      }
      base = clamp2(base, 0, 100);
      range = clamp2(range, 0, 100);
      return Math.floor(MAX_AP * (base + randomIntInclusive(battle, range)) / 100);
    }
    apGainPoint(state, battler, chanting) {
      let plus = 0;
      let agiRate = 1;
      let frameRate = 1;
      const type = battler.chant?.type;
      for (const note of this.featureNotes(state, battler)) {
        frameRate *= notePercent(note, /<フレーム速度=(\d+)>/, 1);
        frameRate *= notePercent(note, chanting ? /<詠唱フレーム速度=(\d+)>/ : /<ＡＰフレーム速度=(\d+)>/, 1);
        if (!chanting || chantTypeIncluded(note, type)) {
          plus += noteNumber(note, chanting ? /<詠唱敏捷=(\-?\d+)>/ : /<ＡＰ敏捷=(\-?\d+)>/, 0);
          agiRate *= notePercent(note, chanting ? /<詠唱敏捷率=(\d+)>/ : /<ＡＰ敏捷率=(\d+)>/, 1);
        }
      }
      return Math.max(0, (Math.max(5, (Number(battler.parameters.agi) + plus) * agiRate) + FRAME_AP_GAIN) * frameRate);
    }
    finishAction(state, battler, object) {
      const next = nextApMetadata(object?.note);
      battler.ap = Math.floor(MAX_AP * (next.base + randomIntInclusive(state.battle, next.random)) / 100);
      battler.turnCount = Number(battler.turnCount ?? 1) + 1;
      battler.chant = null;
      this.syncActor(state, battler);
    }
    actorCommands(state, battler) {
      const terms = this.database.system?.terms?.commands ?? [];
      const definitions = [{ name: terms[2] || "Attack", symbol: "attack", ext: null }];
      const features = this.featureObjects(state, battler).flatMap((object) => object?.features ?? []);
      const sealed = new Set(features.filter((feature) => Number(feature.code) === 42).map((feature) => Number(feature.data_id)));
      const skillTypes = [...new Set(features.filter((feature) => Number(feature.code) === 41).map((feature) => Number(feature.data_id)))].filter((id) => !sealed.has(id)).sort((a, b) => a - b);
      for (const id of skillTypes) definitions.push({ name: this.database.system?.skill_types?.[id] || `${terms[5] || "Skill"} ${id}`, symbol: "skill", ext: id });
      definitions.push({ name: terms[3] || "Defend", symbol: "guard", ext: null }, { name: terms[4] || "Item", symbol: "item", ext: null }, { name: terms[1] || "Escape", symbol: "escape", ext: null });
      return definitions;
    }
    featureObjects(state, battler) {
      if (battler.side === "enemy") return [this.database.enemies[battler.enemyId], ...battler.states.map((id) => this.database.states[id])].filter(Boolean);
      const actor = state.actors[battler.actorId];
      const data = this.database.actors[battler.actorId];
      return [data, this.database.classes[data?.class_id], ...(actor?.equips ?? []).map((entry) => entry.id ? this.party.data(entry.kind, entry.id) : null), ...(actor?.states ?? []).map((id) => this.database.states[id])].filter(Boolean);
    }
    featureNotes(state, battler) {
      return this.featureObjects(state, battler).map((object) => String(object.note ?? ""));
    }
    skillUsable(battler, skill) {
      return Boolean(skill) && battler.hp > 0 && battler.mp >= Number(skill.mp_cost ?? 0) && battler.tp >= Number(skill.tp_cost ?? 0);
    }
    smartTargets(state, enemy, action, skill, exclusions) {
      const scope = Number(skill?.scope ?? 0);
      const targets = scope >= 1 && scope <= 6 ? state.battle.actors : scope >= 7 && scope <= 10 ? state.battle.enemies : [];
      if (!targets.length || ![2, 3, 4].includes(Number(action.condition_type))) return [];
      return targets.filter((target) => target.hp > 0 && targetCondition(target, action)).filter((target) => exclusions.every((blocked) => !targetCondition(target, blocked))).map((target) => target.index);
    }
    applyStateApControl(state, target, stateId) {
      const note = String(this.database.states[stateId]?.note ?? "");
      if (target.chant && /<詠唱キャンセル>/.test(note)) {
        target.chant = null;
        state.battle.log.push(`${target.name}'s casting was interrupted.`);
      }
      const chant = /<詠唱増減=(0|1),\[(\-?\d+),(\d+)\]>/.exec(note);
      if (target.chant && chant) {
        const value = target.chant.total * (Number(chant[2]) + randomIntInclusive(state.battle, Number(chant[3]))) / 100;
        target.chant.elapsed = clamp2(chant[1] === "0" ? value : target.chant.elapsed + value, 0, target.chant.total);
      }
      const ap = /<ＡＰ増減=(0|1),\[(\-?\d+),(\d+)\]>/.exec(note);
      if (!target.chant && ap) {
        const value = MAX_AP * (Number(ap[2]) + randomIntInclusive(state.battle, Number(ap[3]))) / 100;
        target.ap = clamp2(ap[1] === "0" ? value : target.ap + value, 0, MAX_AP);
      }
    }
  };
  function chantMetadata(note = "") {
    const source = String(note);
    const exact = /<詠唱=(\d+),\[(\-?\d+),(\d+)\]>/.exec(source);
    if (exact) return { type: Number(exact[1]), base: Number(exact[2]), random: Number(exact[3]), frames: Math.max(1, Number(exact[2]) + Math.floor(Number(exact[3]) / 2)) };
    const match = /<(?:(?:詠唱)|chant)[：:]\s*(\d+)(?:\s*,\s*(\d+))?>/i.exec(source);
    if (!match) return null;
    return { type: 0, base: Number(match[1]), random: Number(match[2] ?? 0), frames: Math.max(1, Number(match[1]) + Math.floor(Number(match[2] ?? 0) / 2)) };
  }
  function evaluateFormula(formula = "0", subject, target, variables = {}) {
    let expression = String(formula).replace(/\ba\.(mhp|mmp|atk|def|mat|mdf|agi|luk)\b/g, (_, key) => String(Number(subject[key]) || 0)).replace(/\bb\.(mhp|mmp|atk|def|mat|mdf|agi|luk)\b/g, (_, key) => String(Number(target[key]) || 0)).replace(/\ba\.(hp|mp|tp)\b/g, (_, key) => String(Number(subject[key]) || 0)).replace(/\bb\.(hp|mp|tp)\b/g, (_, key) => String(Number(target[key]) || 0)).replace(/\bv\[(\d+)\]/g, (_, id) => String(Number(variables[id]) || 0));
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
  function randomIntInclusive(battle, max) {
    return Math.floor(nextRandom(battle) * (Math.max(0, Number(max) || 0) + 1));
  }
  function nextApMetadata(note = "") {
    const match = /<行動後ＡＰ=\[(\d+),(\d+)\]>/.exec(String(note));
    return match ? { base: Number(match[1]), random: Number(match[2]) } : { base: 0, random: 0 };
  }
  function attackSkillPriority(skill) {
    const match = /<攻撃ID優先度変更[：:](\-?\d+)>/.exec(String(skill?.note ?? ""));
    return Number(match?.[1]) || 0;
  }
  function recoveryExpression(source, battler, variables = {}) {
    const parameters = battler?.parameters ?? {};
    let expression = String(source).replace(/\bself\.(mhp|mmp|hp|mp|tp|max_tp)\b/g, (_, key) => String(key === "max_tp" ? 100 : Number(parameters[key] ?? battler?.[key]) || 0)).replace(/\b(mhp|mmp|max_tp|hp|mp|tp)\b/g, (_, key) => String(key === "max_tp" ? 100 : Number(parameters[key] ?? battler?.[key]) || 0)).replace(/\$game_variables\[(\d+)\]/g, (_, id) => String(Number(variables[id]) || 0));
    if (!/^[\d\s+\-*/%().]+$/.test(expression)) return 0;
    try {
      return Number(Function(`"use strict"; return (${expression});`)()) || 0;
    } catch {
      return 0;
    }
  }
  function noteNumber(note, pattern, fallback) {
    const match = pattern.exec(note);
    return match ? Number(match[1]) : fallback;
  }
  function notePercent(note, pattern, fallback) {
    const match = pattern.exec(note);
    return match ? Number(match[1]) * 0.01 : fallback;
  }
  function chantTypeIncluded(note, type) {
    const match = /<詠唱敏捷タイプ=\[([\d,]+)\]>/.exec(note);
    return !match || match[1].split(",").map(Number).includes(Number(type));
  }
  function targetCondition(target, action) {
    const type = Number(action.condition_type);
    const p1 = Number(action.condition_param1);
    const p2 = Number(action.condition_param2);
    if (type === 2) {
      const rate = target.hp / Math.max(1, target.parameters.mhp);
      return rate >= p1 && rate <= p2;
    }
    if (type === 3) {
      const rate = target.mp / Math.max(1, target.parameters.mmp);
      return rate >= p1 && rate <= p2;
    }
    if (type === 4) return target.states.includes(p1);
    return false;
  }
  function shuffleWithBattle(entries, battle) {
    const result = [...entries];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const other = Math.floor(nextRandom(battle) * (index + 1));
      [result[index], result[other]] = [result[other], result[index]];
    }
    return result;
  }
  function pickAlive(entries, battle) {
    const alive = entries.filter((entry) => entry.hp > 0);
    return alive[Math.floor(nextRandom(battle) * alive.length)];
  }
  function average(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  }
  function clamp2(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  // sillytavern-port/runtime/map/event-mobility.js
  var EVENT_MOBILITY = Object.freeze({
    STATIC_PROP: "STATIC_PROP",
    STATIC_DECORATION: "STATIC_DECORATION",
    INTERACTABLE_STATIC: "INTERACTABLE_STATIC",
    AUTONOMOUS_RANDOM: "AUTONOMOUS_RANDOM",
    AUTONOMOUS_APPROACH: "AUTONOMOUS_APPROACH",
    CUSTOM_ROUTE: "CUSTOM_ROUTE",
    SYMBOL_ENEMY: "SYMBOL_ENEMY",
    CUTSCENE_ACTOR: "CUTSCENE_ACTOR",
    OTHER: "OTHER"
  });
  var OBJECT_GRAPHIC = /^(?:!|14遺体|Damage|Door|Gate|Chest)|(?:corpse|blood|bottle|遺体|死体|血|瓶)/i;
  function symbolIdFromMoveRoute(page) {
    for (const command of page?.move_route?.list ?? []) {
      if (Number(command.code) !== 45) continue;
      const match = /(?:^|\s)enable_symbol_encount\((\d+)\)/.exec(String(command.parameters?.[0] ?? ""));
      if (match) return Number(match[1]);
    }
    return null;
  }
  function classifyEventPage(event, page) {
    if (!page) return { classification: EVENT_MOBILITY.OTHER, evidence: ["missing page"] };
    const moveType = Number(page.move_type) || 0;
    const graphic = page.graphic ?? {};
    const name = String(graphic.character_name ?? "");
    const tileId = Number(graphic.tile_id) || 0;
    const trigger = Number(page.trigger);
    const symbolId = symbolIdFromMoveRoute(page);
    const routeCodes = (page.move_route?.list ?? []).map((command) => Number(command.code));
    const eventCodes = (page.list ?? []).map((command) => Number(command.code));
    const hasEventBody = eventCodes.some((code) => code !== 0);
    const hasForcedRoute = eventCodes.includes(205);
    const evidence = [
      `move_type=${moveType}`,
      `trigger=${Number.isFinite(trigger) ? trigger : "none"}`,
      `graphic=${name || (tileId ? `tile:${tileId}` : "none")}`,
      `route_codes=[${routeCodes.join(",")}]`
    ];
    if (symbolId != null) return { classification: EVENT_MOBILITY.SYMBOL_ENEMY, symbolId, evidence: [...evidence, `enable_symbol_encount(${symbolId})`] };
    if (moveType === 1) return { classification: EVENT_MOBILITY.AUTONOMOUS_RANDOM, symbolId: null, evidence };
    if (moveType === 2) return { classification: EVENT_MOBILITY.AUTONOMOUS_APPROACH, symbolId: null, evidence };
    if (moveType === 3) return { classification: EVENT_MOBILITY.CUSTOM_ROUTE, symbolId: null, evidence };
    if ((trigger === 3 || trigger === 4) && (name || hasForcedRoute)) return { classification: EVENT_MOBILITY.CUTSCENE_ACTOR, symbolId: null, evidence: [...evidence, hasForcedRoute ? "event command 205" : `trigger=${trigger}`] };
    if (tileId > 0 || OBJECT_GRAPHIC.test(name)) {
      const classification = hasEventBody && trigger === 0 ? EVENT_MOBILITY.INTERACTABLE_STATIC : EVENT_MOBILITY.STATIC_PROP;
      return { classification, symbolId: null, evidence: [...evidence, tileId > 0 ? "tile graphic" : "object/corpse graphic"] };
    }
    if (hasEventBody && trigger === 0) return { classification: EVENT_MOBILITY.INTERACTABLE_STATIC, symbolId: null, evidence: [...evidence, "action-trigger event body"] };
    if (name) return { classification: EVENT_MOBILITY.STATIC_DECORATION, symbolId: null, evidence: [...evidence, "visible fixed page"] };
    return { classification: EVENT_MOBILITY.OTHER, symbolId: null, evidence: [...evidence, hasEventBody ? "invisible event controller" : "empty page"] };
  }
  function isAutonomousMobility(classification) {
    return [
      EVENT_MOBILITY.AUTONOMOUS_RANDOM,
      EVENT_MOBILITY.AUTONOMOUS_APPROACH,
      EVENT_MOBILITY.CUSTOM_ROUTE,
      EVENT_MOBILITY.SYMBOL_ENEMY
    ].includes(classification);
  }

  // sillytavern-port/runtime/map/event-system.js
  var DIRECTIONS = Object.freeze({
    1: [-1, 1],
    2: [0, 1],
    3: [1, 1],
    4: [-1, 0],
    6: [1, 0],
    7: [-1, -1],
    8: [0, -1],
    9: [1, -1]
  });
  var SYMBOL_SETTINGS = Object.freeze({
    0: Object.freeze({ awayLevel: 0, awayLevelType: 1, reactionDistance: 3, dashDistance: 5, idleType: 0, visibilityDistance: 5, beforeSpeed: 2, afterSpeed: 4, beforeFrequency: 5, afterFrequency: 5, balloonId: 1, blockedRegions: [1, 3] }),
    1: Object.freeze({ awayLevel: 0, awayLevelType: 1, reactionDistance: 3, dashDistance: 4, idleType: 1, visibilityDistance: 0, beforeSpeed: 0, afterSpeed: 4, beforeFrequency: 0, afterFrequency: 5, balloonId: 1, blockedRegions: [] }),
    2: Object.freeze({ awayLevel: 0, awayLevelType: 1, reactionDistance: 0, dashDistance: 0, idleType: 0, visibilityDistance: 0, beforeSpeed: 0, afterSpeed: 0, beforeFrequency: 0, afterFrequency: 0, balloonId: 0, blockedRegions: [] }),
    3: Object.freeze({ awayLevel: 0, awayLevelType: 1, reactionDistance: 0, dashDistance: 0, idleType: 0, visibilityDistance: 0, beforeSpeed: 0, afterSpeed: 0, beforeFrequency: 0, afterFrequency: 0, balloonId: 0, blockedRegions: [] })
  });
  var GameEventSystem = class {
    constructor(engine) {
      this.engine = engine;
      this.map = null;
      this.mapId = 0;
      this.busy = false;
      this.lastCollision = null;
      this.lastEncounter = null;
      this.chaseTrace = [];
      this.pageRefreshes = [];
      this.prefetches = /* @__PURE__ */ new Map();
    }
    setupMap(map, mapId = this.engine.state.mapId) {
      this.map = map;
      this.mapId = Number(mapId);
      this.busy = false;
      this.activeEventId = null;
      for (const event of Object.values(map?.events ?? {})) if (event) this.refresh(event, true);
    }
    update(deltaSeconds = 1 / 60) {
      if (!this.map || this.engine.state.scene !== "PLAYING") return;
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
        walkAnime: Boolean(page.walk_anime),
        stepAnime: Boolean(page.step_anime),
        directionFix: Boolean(page.direction_fix),
        through: Boolean(page.through),
        priority: Number(page.priority_type) || 0,
        trigger: Number(page.trigger),
        transparent: false,
        moveRoute: page.move_route ?? null,
        uninhibited: isUninhibited(event, page),
        originOpacity: Number(runtime.originOpacity ?? runtime.opacity ?? 255),
        mobilityClass: mobility.classification,
        mobilityEvidence: mobility.evidence
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
      runtime.x ??= Number(event?.x) || 0;
      runtime.y ??= Number(event?.y) || 0;
      runtime.realX ??= runtime.x;
      runtime.realY ??= runtime.y;
      runtime.opacity ??= 255;
      runtime.pageIndex ??= -2;
      return runtime;
    }
    updateMotion(runtime, deltaSeconds) {
      if (runtime.motion) return;
      if (!this.moving(runtime)) {
        if (runtime.walkAnime || runtime.stepAnime) this.updatePattern(runtime, deltaSeconds);
        return;
      }
      const distance = 2 ** Number(runtime.moveSpeed ?? 3) / 256 * Math.max(0, deltaSeconds * 60);
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
        runtime.routeIndex = 0;
        command = list[0];
        if (command?.code === 0) return;
      }
      const parameters = command.parameters ?? [];
      let moved = true;
      if (command.code >= 1 && command.code <= 8) moved = this.tryMove(event, runtime, { 1: 2, 2: 4, 3: 6, 4: 8, 5: 1, 6: 3, 7: 7, 8: 9 }[command.code]);
      else if (command.code === 9) moved = this.tryMove(event, runtime, [2, 4, 6, 8][this.randomInt(4)]);
      else if (command.code === 10) moved = this.moveTowardPlayer(event, runtime);
      else if (command.code === 11) moved = this.moveAwayFromPlayer(event, runtime);
      else if (command.code === 12) moved = this.tryMove(event, runtime, runtime.direction);
      else if (command.code === 13) moved = this.tryMove(event, runtime, reverse(runtime.direction), { changeDirection: false });
      else if (command.code === 14) {
        const dx = Number(parameters[0]) || 0;
        const dy = Number(parameters[1]) || 0;
        if (!runtime.directionFix) runtime.direction = Math.abs(dx) > Math.abs(dy) ? dx < 0 ? 4 : 6 : dy < 0 ? 8 : 2;
        runtime.x += dx;
        runtime.y += dy;
        runtime.stopCount = 0;
      } else if (command.code === 15) runtime.routeWait = Math.max(0, Number(parameters[0]) - 1);
      else if (command.code >= 16 && command.code <= 19 && !runtime.directionFix) runtime.direction = { 16: 2, 17: 4, 18: 6, 19: 8 }[command.code];
      else if (command.code === 20 && !runtime.directionFix) runtime.direction = { 2: 4, 4: 8, 6: 2, 8: 6 }[runtime.direction] ?? runtime.direction;
      else if (command.code === 21 && !runtime.directionFix) runtime.direction = { 2: 6, 4: 2, 6: 8, 8: 4 }[runtime.direction] ?? runtime.direction;
      else if (command.code === 22 && !runtime.directionFix) runtime.direction = reverse(runtime.direction);
      else if (command.code === 23 && !runtime.directionFix) runtime.direction = (this.randomInt(2) === 0 ? { 2: 4, 4: 8, 6: 2, 8: 6 } : { 2: 6, 4: 2, 6: 8, 8: 4 })[runtime.direction] ?? runtime.direction;
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
      else if (command.code === 45) this.engine.runRubyCompatibility?.(String(parameters[0] ?? ""), { eventId: event.id });
      if (moved || route.skippable) runtime.routeIndex += 1;
      runtime.stopCount = 0;
    }
    updateSymbolReaction(event, runtime, inactive) {
      if (runtime.symbolId == null) return;
      const setting = SYMBOL_SETTINGS[runtime.symbolId];
      const stealth = this.stealthActive();
      if (inactive) {
      } else if (runtime.erased || stealth) {
        runtime.symbolForming = false;
      } else {
        const distance = this.distanceToPlayer(runtime);
        const threshold = runtime.symbolForming ? setting.dashDistance + 1 : this.engine.state.dash && this.engine.isMoving?.() ? setting.dashDistance : setting.reactionDistance;
        const reacting = distance <= threshold;
        if (!runtime.symbolForming && reacting) this.startForming(event, runtime, setting);
        else if (runtime.symbolForming && !reacting) this.endForming(event, runtime, setting, "distance");
        runtime.symbolForming = reacting;
      }
      runtime.opacity = setting.visibilityDistance === 0 ? runtime.originOpacity : clamp3(runtime.originOpacity - 50 * (this.distanceToPlayer(runtime) - setting.visibilityDistance), 0, 255);
    }
    updateSymbolMovement(event, runtime) {
      const setting = SYMBOL_SETTINGS[runtime.symbolId];
      if (runtime.symbolForming && !this.stealthActive()) {
        runtime.moveSpeed = setting.afterSpeed;
        runtime.moveFrequency = setting.afterFrequency;
        if (setting.awayLevel > 0 && this.playerLevel(setting.awayLevelType) > setting.awayLevel) this.moveAwayFromPlayer(event, runtime, setting.blockedRegions);
        else this.moveTypeTowardPlayer(event, runtime, setting.blockedRegions);
      } else {
        runtime.moveSpeed = setting.beforeSpeed;
        runtime.moveFrequency = setting.beforeFrequency;
        if (setting.idleType === 0) {
          const roll = this.randomInt(6);
          if (roll <= 1) this.tryMove(event, runtime, [2, 4, 6, 8][this.randomInt(4)], { blockedRegions: setting.blockedRegions });
          else if (roll <= 4) this.tryMove(event, runtime, runtime.direction, { blockedRegions: setting.blockedRegions });
          else runtime.stopCount = 0;
        } else runtime.stopCount = 0;
      }
    }
    startForming(event, runtime, setting) {
      runtime.moveSpeed = setting.afterSpeed;
      runtime.moveFrequency = setting.afterFrequency;
      this.traceChase("detected", event, runtime, { distance: this.distanceToPlayer(runtime) });
      if (setting.balloonId) {
        void this.engine.playSe?.({ name: "Decision1", volume: 50, pitch: 150 });
        void this.engine.renderer.showBalloon?.({ x: runtime.realX, y: runtime.realY }, setting.balloonId);
      }
      const troopIds = battleTroopIds(this.engine, event.pages[runtime.pageIndex]?.list ?? []);
      for (const troopId of troopIds) this.prefetchBattle(event.id, troopId);
    }
    endForming(event, runtime, setting, reason) {
      runtime.moveSpeed = setting.beforeSpeed;
      runtime.moveFrequency = setting.beforeFrequency;
      this.traceChase("lost", event, runtime, { reason, distance: this.distanceToPlayer(runtime) });
    }
    prefetchBattle(eventId, troopId) {
      const key = `${this.mapId},${eventId}:${troopId}`;
      if (this.prefetches.has(key)) return this.prefetches.get(key).promise;
      const paths = this.engine.database.prefetchManifest?.battles?.[troopId]?.assets ?? [];
      const status = { key, eventId, troopId, priority: "HIGH", state: "pending", assets: paths.length, requestedAt: Date.now() };
      const promise = Promise.resolve(this.engine.prefetch?.prefetchAssets?.(paths, { priority: 1, reason: `symbol-chase:${this.mapId}:${eventId}:${troopId}` })).then((result) => {
        status.state = "ready";
        status.readyAt = Date.now();
        return result;
      }, (error) => {
        status.state = "failed";
        status.error = error.message;
        throw error;
      });
      status.promise = promise;
      this.prefetches.set(key, status);
      return promise;
    }
    tryMove(event, runtime, direction, { changeDirection = true, blockedRegions = runtime.symbolId == null ? [] : SYMBOL_SETTINGS[runtime.symbolId].blockedRegions } = {}) {
      const vector = DIRECTIONS[direction];
      if (!vector) {
        runtime.stopCount = 0;
        return false;
      }
      if (changeDirection && direction % 2 === 0 && !runtime.directionFix) runtime.direction = direction;
      const [dx, dy] = vector;
      const targetX = runtime.x + dx;
      const targetY = runtime.y + dy;
      const passable = runtime.through || this.eventPassable(event.id, runtime.x, runtime.y, targetX, targetY, direction, blockedRegions);
      if (!passable) {
        runtime.stopCount = 0;
        this.lastCollision = { at: Date.now(), mapId: this.mapId, mover: `event:${event.id}`, from: [runtime.x, runtime.y], target: [targetX, targetY], direction };
        if (runtime.trigger === 2 && this.playerCharacterAt(targetX, targetY)) this.startEvent(event, "event-touch", this.contactIndexAt(targetX, targetY));
        return false;
      }
      runtime.x = targetX;
      runtime.y = targetY;
      runtime.stopCount = 0;
      this.traceChase(runtime.symbolForming ? "step" : "autonomous-step", event, runtime, { direction });
      if (runtime.trigger === 2 && this.playerCharacterAt(targetX, targetY)) this.startEvent(event, "event-touch", this.contactIndexAt(targetX, targetY));
      return true;
    }
    eventPassable(eventId, x, y, targetX, targetY, direction, blockedRegions = []) {
      if (direction % 2 === 1) {
        const dx = targetX - x;
        const dy = targetY - y;
        const horizontal = dx < 0 ? 4 : 6;
        const vertical = dy < 0 ? 8 : 2;
        return this.eventCardinalPassable(eventId, x, y, x + dx, y, horizontal, blockedRegions) && this.eventCardinalPassable(eventId, x + dx, y, targetX, targetY, vertical, blockedRegions) || this.eventCardinalPassable(eventId, x, y, x, y + dy, vertical, blockedRegions) && this.eventCardinalPassable(eventId, x, y + dy, targetX, targetY, horizontal, blockedRegions);
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
      const sx = runtime.x - this.engine.state.x;
      const sy = runtime.y - this.engine.state.y;
      const horizontal = sx > 0 ? 4 : sx < 0 ? 6 : 0;
      const vertical = sy > 0 ? 8 : sy < 0 ? 2 : 0;
      const first = Math.abs(sx) > Math.abs(sy) ? horizontal : vertical;
      const second = first === horizontal ? vertical : horizontal;
      return first && this.tryMove(event, runtime, first, { blockedRegions }) || second && this.tryMove(event, runtime, second, { blockedRegions }) || false;
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
      const sx = runtime.x - this.engine.state.x;
      const sy = runtime.y - this.engine.state.y;
      const horizontal = sx > 0 ? 6 : sx < 0 ? 4 : 0;
      const vertical = sy > 0 ? 2 : sy < 0 ? 8 : 0;
      const first = Math.abs(sx) > Math.abs(sy) ? horizontal : vertical;
      const second = first === horizontal ? vertical : horizontal;
      return first && this.tryMove(event, runtime, first, { blockedRegions }) || second && this.tryMove(event, runtime, second, { blockedRegions }) || false;
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
    blocksPlayer(x, y) {
      return Boolean(this.eventAt(x, y, { nonThrough: true }));
    }
    playerTouch(x, y, reason = "player-touch") {
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
        if (found?.runtime.trigger === 0 && this.startEvent(found.event, "action", 0)) return true;
      }
      return false;
    }
    startEvent(event, reason, contactIndex = 0) {
      const runtime = this.refresh(event);
      if (!runtime || runtime.starting || this.busy || this.engine.interpreter.running || this.engine.state.scene !== "PLAYING") return false;
      runtime.starting = true;
      runtime.locked = true;
      runtime.prelockDirection = runtime.direction;
      if (runtime.symbolId == null && !runtime.directionFix) runtime.direction = directionToward(runtime.x, runtime.y, this.engine.state.x, this.engine.state.y, runtime.direction);
      const contactCondition = runtime.symbolId == null ? 0 : this.contactCondition(runtime, contactIndex);
      this.activeEventId = event.id;
      this.lastEncounter = { at: Date.now(), mapId: this.mapId, eventId: event.id, reason, contactIndex, contactCondition, symbolId: runtime.symbolId, phase: "resource-barrier" };
      this.traceChase("contact", event, runtime, { reason, contactIndex, contactCondition });
      this.busy = true;
      void this.runEvent(event, runtime).catch((error) => this.engine.handleInterpreterFailure?.(error)).finally(() => {
        runtime.starting = false;
        runtime.locked = false;
        if (!runtime.directionFix && runtime.prelockDirection) runtime.direction = runtime.prelockDirection;
        this.busy = false;
        this.activeEventId = null;
      });
      return true;
    }
    async runEvent(event, runtime) {
      const renderable = this.engine.currentRenderableEvents(this.map).filter((entry) => entry.id === event.id);
      await this.engine.renderer.ensureEventGraphics?.(renderable);
      if (this.lastEncounter?.eventId === event.id) this.lastEncounter.phase = "interpreter";
      await this.engine.interpreter.run(event.pages[runtime.pageIndex]?.list ?? [], { eventId: event.id, trigger: runtime.trigger, encounter: this.lastEncounter });
      if (this.lastEncounter?.eventId === event.id) this.lastEncounter.phase = "complete";
    }
    contactCondition(runtime, contactIndex = 0) {
      if (contactIndex > 0) {
        const visible = this.visibleFollowers();
        return contactIndex === visible.length ? 2 : 0;
      }
      const px = Number(this.engine.state.realX ?? this.engine.state.x);
      const py = Number(this.engine.state.realY ?? this.engine.state.y);
      const ex = Number(runtime.realX ?? runtime.x);
      const ey = Number(runtime.realY ?? runtime.y);
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
    visibleFollowers() {
      return (this.engine.state.followers ?? []).filter((entry) => entry && entry.visible !== false);
    }
    distanceToPlayer(runtime) {
      return Math.abs(runtime.x - this.engine.state.x) + Math.abs(runtime.y - this.engine.state.y);
    }
    moving(runtime) {
      return Math.abs(Number(runtime.realX) - Number(runtime.x)) > 1e-6 || Math.abs(Number(runtime.realY) - Number(runtime.y)) > 1e-6;
    }
    nearScreen(runtime) {
      const centerX = Number(this.engine.state.displayX ?? 0) + 10;
      const centerY = Number(this.engine.state.displayY ?? 0) + 7.5;
      return Math.abs(Number(runtime.realX) - centerX) <= 12 && Math.abs(Number(runtime.realY) - centerY) <= 8;
    }
    stealthActive() {
      return Number(this.engine.state.stealthCount ?? 0) !== 0 || Boolean(this.engine.state.stealth);
    }
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
      let seed = Number(this.engine.state.mapRngSeed ?? 1831565813 ^ this.mapId) >>> 0;
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      this.engine.state.mapRngSeed = seed >>> 0;
      return Math.floor(this.engine.state.mapRngSeed / 4294967296 * max);
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
  };
  function stopCountThreshold(moveFrequency) {
    return 30 * (5 - Number(moveFrequency ?? 3));
  }
  function symbolIdFromPage(page) {
    return symbolIdFromMoveRoute(page);
  }
  function activePageIndex(engine, event) {
    for (let index = (event.pages?.length ?? 0) - 1; index >= 0; index -= 1) if (engine.conditionsMet(event.pages[index].condition, event.id)) return index;
    return -1;
  }
  function isUninhibited(event, page) {
    if (/<uninhibited>/i.test(String(event.name ?? ""))) return true;
    return (page.list ?? []).filter((command) => command.code === 108 || command.code === 408).some((command) => /<uninhibited>/i.test(String(command.parameters?.[0] ?? "")));
  }
  function battleTroopIds(engine, list, depth = 2, seen = /* @__PURE__ */ new Set()) {
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
    const sx = x - targetX;
    const sy = y - targetY;
    if (Math.abs(sx) > Math.abs(sy)) return sx > 0 ? 4 : sx < 0 ? 6 : fallback;
    return sy > 0 ? 8 : sy < 0 ? 2 : fallback;
  }
  function reverse(direction) {
    return 10 - Number(direction);
  }
  function approach(current, target, distance) {
    return current < target ? Math.min(current + distance, target) : current > target ? Math.max(current - distance, target) : target;
  }
  function clamp3(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  // sillytavern-port/runtime/core/game-engine.js
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
      this.fixedStepMs = 1e3 / 60;
      this.maxFrameDeltaMs = 250;
      this.accumulatorMs = 0;
      this.lastLoopAt = null;
    }
    async initialize() {
      this.database = await this.loader.initialize();
      this.party = new PartySystem(this.database, this.database.inventoryDependencies);
      this.combat = new CombatSystem(this.database, this.party, (entry) => this.recordDiagnostic(entry));
      this.prefetch = this.loader.prefetch;
      this.input = new InputController(this.renderer.stage);
      this.interpreter = new EventInterpreter(this);
      this.events = new GameEventSystem(this);
      this.audio = new AudioManager(this.loader, (entry) => this.recordDiagnostic(entry));
      this.state = this.initialState("LOADING");
      this.prefetch.setContextProvider(() => ({
        interpreter: this.interpreter?.snapshot?.() ?? null,
        renderer: { scene: this.renderer.stats.scene, mapId: this.renderer.stats.mapId, frames: this.renderer.stats.frames },
        state: { scene: this.state?.scene, mapId: this.state?.mapId, loadingMap: this.state?.loadingMap }
      }));
      this.hasSave = await (this.saves.any?.() ?? this.saves.has(1)).catch((error) => {
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
        schema: "black-souls-st-state-v2",
        scene,
        mapId: this.database.system.start_map_id,
        x: this.database.system.start_x,
        y: this.database.system.start_y,
        realX: this.database.system.start_x,
        realY: this.database.system.start_y,
        direction: 2,
        pattern: 1,
        originalPattern: 1,
        animationCount: 0,
        steps: 0,
        moveSpeed: 4,
        dash: false,
        displayX: 0,
        displayY: 0,
        originOpacity: 255,
        stealthCount: 0,
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
        eventOverrides: {},
        system: { saveDisabled: false, menuDisabled: false, encounterDisabled: false, formationDisabled: false, playtimeSeconds: 0, startedAt: Date.now(), saveCount: 0 },
        timer: { working: false, count: 0 },
        pluginState: {},
        difficulty: 0,
        ngPlus: 0
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
      this.state.system.startedAt = Date.now();
      this.notifyScene();
      await this.loadMap(this.state.mapId);
      this.status(`New game: map ${this.state.mapId} (${this.state.x}, ${this.state.y})`);
      void this.runAutorunEvents().catch((error) => this.handleInterpreterFailure(error));
    }
    async loadMap(mapId) {
      this.events ??= new GameEventSystem(this);
      this.state.loadingMap = true;
      this.onTransitionState({ state: "loading", mapId, streaming: this.prefetch?.getStatus?.() ?? null });
      try {
        await this.prefetch?.prepareMap?.(mapId, { x: this.state.x, y: this.state.y });
        const map = await this.loader.map(mapId);
        const tileset = this.database.tilesets[map.tileset_id];
        const collision = new CollisionMap(map, tileset);
        const actorId = this.state.party?.members?.[0] ?? this.database.system.party_members?.[0] ?? 1;
        const actor = this.database.actors[actorId];
        const actorState = this.state.actors[actorId];
        const playerGraphic = { character_name: actorState?.characterName ?? actor?.character_name ?? "", character_index: actorState?.characterIndex ?? actor?.character_index ?? 0 };
        this.events.setupMap(map, mapId);
        await this.renderer.setMap(map, tileset, { playerGraphic, events: this.currentRenderableEvents(map), mapId, x: this.state.x, y: this.state.y });
        this.map = map;
        this.collision = collision;
        this.state.mapName = String(map.display_name ?? "").normalize("NFC");
        this.state.realX = Number.isFinite(this.state.realX) ? this.state.realX : this.state.x;
        this.state.realY = Number.isFinite(this.state.realY) ? this.state.realY : this.state.y;
        this.updateCamera();
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
      const previous = { mapId: this.state.mapId, x: this.state.x, y: this.state.y, realX: this.state.realX, realY: this.state.realY, direction: this.state.direction };
      this.state.mapId = mapId;
      this.state.x = this.state.realX = x;
      this.state.y = this.state.realY = y;
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
        if (page?.trigger === 3 || page?.trigger === 4) await this.interpreter.run(page.list, { eventId: event.id, trigger: page.trigger });
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
    loop = (now = performance.now()) => {
      if (!this.running) return;
      try {
        if (this.lastLoopAt == null) this.lastLoopAt = now;
        const elapsed = Math.min(this.maxFrameDeltaMs, Math.max(0, now - this.lastLoopAt));
        this.lastLoopAt = now;
        this.accumulatorMs += elapsed;
        let updates = 0;
        while (this.accumulatorMs >= this.fixedStepMs && updates < 15) {
          this.update(this.fixedStepMs / 1e3);
          this.accumulatorMs -= this.fixedStepMs;
          updates += 1;
        }
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
    update(deltaSeconds = 1 / 60) {
      if (this.paused) return;
      this.updatePlaytime(deltaSeconds);
      this.updateMovement(deltaSeconds);
      this.updateCamera();
      this.events?.update(deltaSeconds);
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
      if (["MENU", "END", "ITEM", "SKILL", "EQUIP", "STATUS", "SYNTHESIS", "SHOP", "FILE_SAVE", "FILE_LOAD"].includes(this.state.scene)) {
        this.updateMenu();
        return;
      }
      if (this.state.choice) {
        const movement2 = this.input.takeDirection();
        if (movement2?.[1]) this.state.choice.selected = (this.state.choice.selected + Math.sign(movement2[1]) + this.state.choice.options.length) % this.state.choice.options.length;
        if (this.input.takeConfirm()) {
          const selected = this.state.choice.selected;
          this.state.choice = null;
          if (this.state.message?.choiceAttached) this.state.message = null;
          this.choiceResolve?.(selected);
          this.choiceResolve = null;
          return;
        }
        if (this.input.takeCancel() && this.state.choice.cancelType >= 0) {
          const selected = this.state.choice.cancelType;
          this.state.choice = null;
          if (this.state.message?.choiceAttached) this.state.message = null;
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
      if (this.interpreter.running || this.events?.busy) return;
      if (this.isMoving()) return;
      if (this.input.takeCancel()) {
        this.openMenu();
        return;
      }
      if (this.input.takeConfirm()) {
        this.triggerActionEvent();
        return;
      }
      const movement = this.input.takeMovementDirection?.() ?? this.input.takeDirection();
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
      const task = command.symbol === "new_game" ? this.newGame() : this.openLoadMenu();
      Promise.resolve(task).catch((error) => {
        this.recordDiagnostic({ type: "scene-transition-failed", error: error.message });
        this.status(error.message);
      }).finally(() => {
        this.transitioning = false;
      });
    }
    updateMenu() {
      if (this.state.scene === "FILE_SAVE" || this.state.scene === "FILE_LOAD") {
        this.updateFileMenu();
        return;
      }
      if (this.state.scene === "ITEM") {
        this.updateItemMenu();
        return;
      }
      if (this.state.scene === "SKILL") {
        if (this.input.takeCancel()) this.openMenu();
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
      if (command.symbol === "save") void this.openSaveMenu();
      if (command.symbol === "game_end") this.openEndMenu();
      if (command.symbol === "item") this.openItemMenu();
      if (command.symbol === "skill") this.openSkillMenu();
      if (command.symbol === "equip") this.openEquipMenu();
      if (command.symbol === "status") this.openStatusMenu();
    }
    openMenu() {
      const labels = this.database.system.terms.commands;
      const members = this.state.party?.members ?? [];
      this.state.menu = {
        kind: "menu",
        selected: 0,
        actorStatus: Object.fromEntries(members.map((actorId) => [actorId, this.party.parameters(this.state, actorId)])),
        commands: [
          { symbol: "item", label: labels[4], enabled: true },
          { symbol: "skill", label: labels[5], enabled: true },
          { symbol: "equip", label: labels[6], enabled: true },
          { symbol: "status", label: labels[7], enabled: true },
          { symbol: "formation", label: labels[8], enabled: members.length >= 2 && !this.state.system?.formationDisabled },
          { symbol: "save", label: labels[9], enabled: !this.state.system?.saveDisabled },
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
      const labels = this.database.system.terms.commands;
      this.state.menu = {
        kind: "item",
        mode: "category",
        categorySelected: 0,
        selected: 0,
        categories: [
          { symbol: "item", label: labels[4] },
          { symbol: "weapon", label: labels[12] },
          { symbol: "armor", label: labels[13] },
          { symbol: "key_item", label: labels[14] }
        ],
        entries: this.itemEntriesForCategory("item")
      };
      this.setScene("ITEM");
    }
    updateItemMenu() {
      const menu = this.state.menu;
      if (menu.mode === "category") {
        if (this.input.takeCancel()) {
          this.openMenu();
          return;
        }
        const movement2 = this.input.takeDirection();
        if (movement2?.[0]) {
          menu.categorySelected = cycle(menu.categorySelected, Math.sign(movement2[0]), menu.categories.length);
          menu.entries = this.itemEntriesForCategory(menu.categories[menu.categorySelected].symbol);
          menu.selected = 0;
        }
        if (this.input.takeConfirm()) menu.mode = "items";
        return;
      }
      if (this.input.takeCancel()) {
        menu.mode = "category";
        return;
      }
      if (this.isMoving()) return;
      const movement = this.input.takeMovementDirection?.() ?? this.input.takeDirection();
      if (movement && menu.entries.length) {
        const delta = movement[1] ? Math.sign(movement[1]) * 2 : Math.sign(movement[0]);
        if (delta) menu.selected = cycle(menu.selected, delta, menu.entries.length);
      }
      if (!this.input.takeConfirm() || !menu.entries.length) return;
      const entry = menu.entries[menu.selected];
      if (entry.kind !== "item") return;
      const result = this.party.useItem(this.state, entry.id, this.state.party.members[0]);
      if (result.used) this.status(`Used ${entry.data.name}.`);
      menu.entries = this.itemEntriesForCategory(menu.categories[menu.categorySelected].symbol);
      menu.selected = Math.max(0, Math.min(menu.selected, menu.entries.length - 1));
    }
    itemEntriesForCategory(category) {
      if (category === "weapon" || category === "armor") return this.party.inventoryEntries(this.state, [category]);
      return this.party.inventoryEntries(this.state, ["item"]).filter((entry) => Number(entry.data?.itype_id ?? 1) === 2 === (category === "key_item"));
    }
    openSkillMenu() {
      const actorId = this.state.party.members[0];
      const actor = this.state.actors[actorId];
      this.state.menu = { kind: "skill", actorId, selected: 0, entries: (actor?.skills ?? []).map((id) => ({ id, data: this.database.skills[id] })).filter((entry) => entry.data) };
      this.setScene("SKILL");
    }
    openEquipMenu() {
      const actorId = this.state.party.members[0];
      const labels = this.database.system.terms.commands;
      this.state.menu = {
        kind: "equip",
        mode: "command",
        actorId,
        commandSelected: 0,
        commands: [{ symbol: "equip", label: labels[15] }, { symbol: "optimize", label: labels[16] }, { symbol: "clear", label: labels[17] }],
        selected: 0,
        choices: [],
        choiceSelected: 0
      };
      this.decorateEquipMenu(this.state.menu);
      this.setScene("EQUIP");
    }
    updateEquipMenu() {
      const menu = this.state.menu;
      const actor = this.state.actors[menu.actorId];
      if (menu.mode === "command") {
        if (this.input.takeCancel()) {
          this.openMenu();
          return;
        }
        const movement2 = this.input.takeDirection();
        if (movement2?.[0]) menu.commandSelected = cycle(menu.commandSelected, Math.sign(movement2[0]), menu.commands.length);
        if (!this.input.takeConfirm()) return;
        const symbol = menu.commands[menu.commandSelected].symbol;
        if (symbol === "equip") menu.mode = "slots";
        if (symbol === "clear") {
          this.clearActorEquipment(menu.actorId);
          this.decorateEquipMenu(menu);
        }
        if (symbol === "optimize") {
          this.optimizeActorEquipment(menu.actorId);
          this.decorateEquipMenu(menu);
        }
        return;
      }
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
        menu.mode = "command";
        return;
      }
      const movement = this.input.takeMovementDirection?.() ?? this.input.takeDirection();
      if (movement?.[1] && actor.equips.length) menu.selected = cycle(menu.selected, Math.sign(movement[1]), actor.equips.length);
      if (!this.input.takeConfirm()) return;
      const current = actor.equips[menu.selected];
      menu.choices = [{ kind: current.kind, id: 0, amount: 0, data: { name: "(Remove)" } }, ...this.party.inventoryEntries(this.state, ["weapon", "armor"]).filter((entry) => this.party.canEquip(this.state, menu.actorId, entry.kind, entry.id, menu.selected))];
      menu.choiceSelected = 0;
      menu.mode = "choices";
    }
    decorateEquipMenu(menu) {
      menu.slotEntries = (this.state.actors[menu.actorId]?.equips ?? []).map((slot) => ({ ...slot, data: slot.id ? this.party.data(slot.kind, slot.id) : null }));
      menu.parameters = this.party.parameters(this.state, menu.actorId);
    }
    clearActorEquipment(actorId) {
      const actor = this.state.actors[actorId];
      for (let index = 0; index < (actor?.equips?.length ?? 0); index += 1) {
        const slot = actor.equips[index];
        if (slot.id) this.party.equip(this.state, actorId, index, slot.kind, 0);
      }
    }
    optimizeActorEquipment(actorId) {
      this.clearActorEquipment(actorId);
      const actor = this.state.actors[actorId];
      for (let index = 0; index < (actor?.equips?.length ?? 0); index += 1) {
        const candidates = this.party.inventoryEntries(this.state, ["weapon", "armor"]).filter((entry) => this.party.canEquip(this.state, actorId, entry.kind, entry.id, index)).sort((a, b) => sumParams(b.data?.params) - sumParams(a.data?.params));
        const best = candidates[0];
        if (best) this.party.equip(this.state, actorId, index, best.kind, best.id);
      }
    }
    openStatusMenu() {
      const actorId = this.state.party.members[0];
      const actor = this.state.actors[actorId];
      this.state.menu = {
        kind: "status",
        actorId,
        parameters: this.party.parameters(this.state, actorId),
        className: this.database.classes[actor?.classId]?.name ?? "",
        expCurrent: actor?.exp ?? 0,
        expNext: Math.max(0, this.party.expForLevel(actor?.classId, (actor?.level ?? 1) + 1) - (actor?.exp ?? 0)),
        equipment: (actor?.equips ?? []).map((slot) => slot.id ? this.party.data(slot.kind, slot.id) : null),
        paramLabels: this.database.system.terms.params
      };
      this.setScene("STATUS");
    }
    async openLoadMenu() {
      const slots = await this.saves.list();
      const graphics = slots.flatMap((slot) => (slot.partyCharacters ?? []).map((entry) => ({ graphic: { character_name: entry.characterName, character_index: entry.characterIndex } })));
      await Promise.resolve(this.renderer.ensureEventGraphics?.(graphics)).catch((error) => this.recordDiagnostic({ type: "save-character-warm-failed", error: error.message }));
      const latest = await this.saves.latestSlot();
      this.state.menu = { kind: "file", mode: "load", help: "Mở tệp nào?", selected: Math.max(0, latest - 1), topIndex: Math.max(0, Math.min(12, latest - 3)), slots };
      this.setScene("FILE_LOAD");
    }
    async openSaveMenu() {
      if (this.state.system?.saveDisabled) {
        this.status("Không thể lưu tại đây.");
        return;
      }
      const slots = await this.saves.list();
      const graphics = slots.flatMap((slot) => (slot.partyCharacters ?? []).map((entry) => ({ graphic: { character_name: entry.characterName, character_index: entry.characterIndex } })));
      await Promise.resolve(this.renderer.ensureEventGraphics?.(graphics)).catch((error) => this.recordDiagnostic({ type: "save-character-warm-failed", error: error.message }));
      const selected = Math.max(0, Math.min(15, Number(this.lastSaveSlot ?? 1) - 1));
      this.state.menu = { kind: "file", mode: "save", help: "Lưu vào đâu?", selected, topIndex: Math.max(0, Math.min(12, selected - 1)), slots };
      this.setScene("FILE_SAVE");
    }
    updateFileMenu() {
      const menu = this.state.menu;
      if (!menu || this.transitioning) return;
      if (this.input.takeCancel()) {
        if (menu.mode === "load") void this.enterTitle();
        else this.openMenu();
        return;
      }
      const movement = this.input.takeDirection();
      if (movement?.[1]) {
        menu.selected = cycle(menu.selected, Math.sign(movement[1]), menu.slots.length);
        if (menu.selected < menu.topIndex) menu.topIndex = menu.selected;
        if (menu.selected > menu.topIndex + 3) menu.topIndex = menu.selected - 3;
      }
      if (!this.input.takeConfirm()) return;
      const slot = menu.selected + 1;
      const entry = menu.slots[menu.selected];
      if (menu.mode === "load" && entry.empty) {
        this.status("Tệp này không có dữ liệu.");
        return;
      }
      this.transitioning = true;
      const task = menu.mode === "save" ? this.save(slot).then(() => this.openMenu()) : this.load(slot);
      Promise.resolve(task).catch((error) => {
        this.recordDiagnostic({ type: "save-scene-failed", mode: menu.mode, slot, error: error.message });
        this.status(error.message);
      }).finally(() => {
        this.transitioning = false;
      });
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
      const encounter = this.events?.battleContext?.() ?? null;
      const battle = this.combat.createBattle(this.state, troopId, {
        canEscape,
        canLose,
        battleback1: this.state.nextBattleback1 ?? this.map?.battleback1_name ?? "",
        battleback2: this.state.nextBattleback2 ?? this.map?.battleback2_name ?? "",
        preemptive: Boolean(encounter?.preemptive),
        surprise: Boolean(encounter?.surprise),
        encounter
      });
      this.state.system.battleCount = Number(this.state.system.battleCount ?? 0) + 1;
      this.state.battle = battle;
      await this.renderer.setBattle?.(battle);
      void this.audio.playLoop("bgm", this.state.battleBgm ?? this.database.system.battle_bgm);
      this.setScene("BATTLE");
      this.recordDiagnostic({ type: "symbol-battle-entered", troopId, encounter, assets: paths.length, scene: this.state.scene });
      return new Promise((resolve) => {
        this.battleResolve = resolve;
      });
    }
    resolveBattleTroop(parameters = []) {
      const designation = Number(parameters[0]);
      if (designation === 0) return Number(parameters[1]);
      if (designation === 1) return Number(this.state.variables?.[parameters[1]] ?? 0);
      const region = this.collision?.regionId?.(this.state.x, this.state.y) ?? 0;
      const candidates = (this.map?.encounter_list ?? []).filter((entry) => !entry.region_set?.length || entry.region_set.includes(region));
      const total = candidates.reduce((sum, entry) => sum + Math.max(0, Number(entry.weight) || 0), 0);
      if (!total) return 0;
      let roll = this.events?.randomInt?.(total) ?? 0;
      for (const entry of candidates) {
        roll -= Math.max(0, Number(entry.weight) || 0);
        if (roll < 0) return Number(entry.troop_id);
      }
      return Number(candidates.at(-1)?.troop_id ?? 0);
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
      const definition = battle.commandDefinitions?.[battle.selectedCommand] ?? { symbol: ["attack", "skill", "item", "guard", "escape"][battle.selectedCommand] };
      const symbol = definition.symbol;
      const active = battle.actors[battle.activeActor];
      const actor = this.state.actors[active.actorId];
      const payload = symbol === "skill" ? { skillId: actor.skills.map((id) => this.database.skills[id]).find((skill) => Number(skill?.stype_id) === Number(definition.ext) && active.mp >= Number(skill.mp_cost ?? 0) && active.tp >= Number(skill.tp_cost ?? 0))?.id } : symbol === "item" ? { itemId: this.party.inventoryEntries(this.state, ["item"])[0]?.id } : {};
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
    changeActorClass(actorId, classId, keepExp = false) {
      const actor = this.state.actors[actorId];
      if (!actor || !this.database.classes[classId]) return;
      actor.classId = Number(classId);
      if (!keepExp) actor.exp = 0;
      actor.skills = this.party.initialSkills(actor.classId, actor.level);
      const parameters = this.party.parameters(this.state, actorId);
      actor.hp = Math.min(actor.hp, parameters.mhp);
      actor.mp = Math.min(actor.mp, parameters.mmp);
    }
    async changePartyMember(actorId, operation, initialize = false) {
      const members = this.state.party.members;
      if (operation === 0 && !members.includes(actorId)) {
        if (initialize) this.state.actors[actorId] = this.party.createActor(this.database.actors[actorId]);
        members.push(actorId);
      }
      if (operation === 1) this.state.party.members = members.filter((id) => id !== actorId);
      const leaderId = this.state.party.members[0];
      const leader = this.state.actors[leaderId];
      if (leader) {
        this.renderer.playerGraphic = { character_name: leader.characterName ?? "", character_index: leader.characterIndex ?? 0 };
        await this.renderer.ensureEventGraphics?.([{ graphic: this.renderer.playerGraphic }]);
      }
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
    waitFrames(frames) {
      return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(frames) || 0) * 1e3 / 60));
    }
    async moveRouteStep(target, dx, dy, direction, eventId = 0) {
      if (target === -1) {
        this.ensureRealPosition();
        const speed2 = Number(this.state.moveSpeed ?? 4);
        this.state.routeForcing = true;
        this.state.x += dx;
        this.state.y += dy;
        if (direction % 2 === 0) this.state.direction = direction;
        else {
          const horizontal = dx < 0 ? 4 : 6;
          const vertical = dy < 0 ? 8 : 2;
          if (this.state.direction === reverse2(horizontal)) this.state.direction = horizontal;
          if (this.state.direction === reverse2(vertical)) this.state.direction = vertical;
        }
        this.advanceStep();
        await this.waitFrames(256 / 2 ** speed2);
        this.state.realX = this.state.x;
        this.state.realY = this.state.y;
        this.state.routeForcing = false;
        return;
      }
      const override = this.routeOverride(target, eventId);
      const speed = Number(override.moveSpeed ?? 3);
      const fromX = Number(override.x);
      const fromY = Number(override.y);
      const resolvedId = target === 0 ? eventId : target;
      const event = this.map?.events?.[resolvedId];
      if (!override.through && event && !this.events?.eventPassable?.(resolvedId, fromX, fromY, fromX + dx, fromY + dy, direction)) return false;
      override.x = fromX + dx;
      override.y = fromY + dy;
      if (direction % 2 === 0) override.direction = direction;
      override.motion = { fromX, fromY, toX: override.x, toY: override.y, began: performance.now(), durationMs: 256 / 2 ** speed * 1e3 / 60 };
      await this.waitFrames(256 / 2 ** speed);
      override.realX = override.x;
      override.realY = override.y;
      delete override.motion;
      return true;
    }
    setRouteDirection(target, direction, eventId = 0) {
      if (target === -1) this.state.direction = direction;
      else this.routeOverride(target, eventId).direction = direction;
    }
    setRouteProperty(target, property, value, eventId = 0) {
      if (target === -1) {
        if (property === "transparent") this.state.transparent = Boolean(value);
        else if (property === "opacity") this.state.opacity = Number(value);
        else this.state[property] = value;
        return;
      }
      this.routeOverride(target, eventId)[property] = value;
    }
    routeOverride(target, eventId = 0) {
      const resolvedId = target === 0 ? eventId : target;
      const event = this.map?.events?.[resolvedId];
      const page = event ? this.activePage(event) : null;
      const key = `${this.state.mapId},${resolvedId}`;
      const override = this.state.eventOverrides[key] ??= {};
      override.x ??= event?.x ?? 0;
      override.y ??= event?.y ?? 0;
      override.realX ??= override.x;
      override.realY ??= override.y;
      override.direction ??= page?.graphic?.direction ?? 2;
      override.pattern ??= page?.graphic?.pattern ?? 1;
      override.moveSpeed ??= page?.move_speed ?? 3;
      override.moveFrequency ??= page?.move_frequency ?? 3;
      return override;
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
          this.ensureRealPosition();
          this.state.x += dx;
          this.state.y += dy;
          if (this.state.direction === reverse2(horizontal)) this.state.direction = horizontal;
          if (this.state.direction === reverse2(vertical)) this.state.direction = vertical;
          this.advanceStep();
          this.events?.playerTouch?.(this.state.x, this.state.y, "player-touch-arrival");
          return true;
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
      if (!this.canStep(this.state.x, this.state.y, direction)) {
        this.events?.playerTouch?.(this.state.x + dx, this.state.y + dy, "player-touch-front");
        return false;
      }
      this.ensureRealPosition();
      this.state.x += dx;
      this.state.y += dy;
      this.advanceStep();
      this.events?.playerTouch?.(this.state.x, this.state.y, "player-touch-arrival");
      return true;
    }
    canStep(x, y, direction) {
      const [dx, dy] = { 2: [0, 1], 4: [-1, 0], 6: [1, 0], 8: [0, -1] }[direction] ?? [0, 0];
      const targetX = x + dx;
      const targetY = y + dy;
      return this.collision.passable(x, y, direction) && this.collision.passable(targetX, targetY, reverse2(direction)) && !this.events?.blocksPlayer?.(targetX, targetY);
    }
    advanceStep() {
      this.state.steps = (this.state.steps ?? 0) + 1;
      if (Number(this.state.stealthCount ?? 0) !== 0) this.state.stealthCount -= 1;
      this.prefetch?.prefetchLikelyDestinations(this.state.mapId, { x: this.state.x, y: this.state.y });
    }
    ensureRealPosition() {
      if (!Number.isFinite(this.state.realX)) this.state.realX = this.state.x;
      if (!Number.isFinite(this.state.realY)) this.state.realY = this.state.y;
    }
    isMoving() {
      this.ensureRealPosition();
      return Math.abs(this.state.realX - this.state.x) > 1e-6 || Math.abs(this.state.realY - this.state.y) > 1e-6;
    }
    realMoveSpeed() {
      const dashAllowed = !this.map?.disable_dashing && !this.state.switches?.[0];
      const dash = !this.state.routeForcing && dashAllowed && Boolean(this.input?.isDashPressed?.());
      this.state.dash = dash;
      return Number(this.state.moveSpeed ?? 4) + (dash ? 1 : 0);
    }
    updateMovement(deltaSeconds = 1 / 60) {
      if (!this.state || this.state.scene !== "PLAYING") return;
      this.ensureRealPosition();
      if (!this.isMoving()) return;
      const speed = this.realMoveSpeed();
      const distance = 2 ** speed / 256 * Math.max(0, deltaSeconds * 60);
      this.state.realX = approach2(this.state.realX, this.state.x, distance);
      this.state.realY = approach2(this.state.realY, this.state.y, distance);
      this.state.animationCount = Number(this.state.animationCount ?? 0) + 1.5 * Math.max(0, deltaSeconds * 60);
      if (this.state.animationCount > 18 - speed * 2) {
        this.state.pattern = (Number(this.state.pattern ?? 1) + 1) % 4;
        this.state.animationCount = 0;
      }
      if (!this.isMoving()) this.state.pattern = this.state.originalPattern ?? 1;
    }
    updateCamera() {
      if (!this.map || !this.state) return;
      const realX = Number.isFinite(this.state.realX) ? this.state.realX : this.state.x;
      const realY = Number.isFinite(this.state.realY) ? this.state.realY : this.state.y;
      this.state.displayX = clamp4(realX - 9.5, 0, Math.max(0, Number(this.map.width) - 20));
      this.state.displayY = clamp4(realY - 7, 0, Math.max(0, Number(this.map.height) - 15));
    }
    updatePlaytime(deltaSeconds = 1 / 60) {
      if (!this.state?.system || this.state.scene === "TITLE") return;
      this.state.system.playtimeSeconds = Number(this.state.system.playtimeSeconds ?? 0) + Math.max(0, deltaSeconds);
      if (this.state.timer?.working) this.state.timer.count = Math.max(0, Number(this.state.timer.count ?? 0) - Math.max(0, deltaSeconds * 60));
    }
    async showMessage(text, options = {}) {
      if (options.face) await Promise.resolve(this.renderer.prepareFace?.(String(options.face))).catch((error) => this.recordDiagnostic({ type: "message-face-failed", face: options.face, error: error.message }));
      this.state.message = { text: this.expandText(text), face: String(options.face ?? ""), faceIndex: Number(options.faceIndex) || 0, background: Number(options.background) || 0, position: Number(options.position ?? 2), choiceAttached: Boolean(options.choiceAttached) };
      if (options.choiceAttached) return;
      return new Promise((resolve) => {
        this.messageResolve = resolve;
      });
    }
    showChoice(options, { cancelType = -1, defaultType = 0 } = {}) {
      const resolvedCancel = Number(cancelType) >= 0 && Number(cancelType) < options.length ? Number(cancelType) : -1;
      this.state.choice = { options: options.map((item) => this.expandText(item)), selected: clampIndex(defaultType, options.length), cancelType: resolvedCancel };
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
      this.state.actors[actorId].name = String(name ?? "").normalize("NFC");
    }
    expandText(text) {
      return String(text).normalize("NFC").replace(/\\[Nn]\[(\d+)\]/g, (_, id) => this.state.actors[id]?.name ?? "").replace(/\\[Cc]\[\d+\]|\\[.!|{}^><]/g, "").normalize("NFC");
    }
    triggerActionEvent() {
      this.events?.actionTrigger?.();
    }
    playSe(audio) {
      return this.audio.playSe(audio);
    }
    showAnimation(targetId, animationId) {
      const event = targetId === -1 ? null : this.map?.events?.[targetId];
      const runtime = event ? this.events?.runtime?.(targetId, event) : null;
      const target = targetId === -1 ? { x: this.state.x, y: this.state.y } : { x: runtime?.realX ?? event?.x ?? this.state.x, y: runtime?.realY ?? event?.y ?? this.state.y };
      return this.renderer.showAnimation(target, this.database.animations[animationId]);
    }
    showBalloon(targetId, balloonId) {
      const event = targetId === -1 ? null : this.map?.events?.[targetId];
      const runtime = event ? this.events?.runtime?.(targetId, event) : null;
      const target = targetId === -1 ? { x: this.state.x, y: this.state.y } : { x: runtime?.realX ?? event?.x ?? this.state.x, y: runtime?.realY ?? event?.y ?? this.state.y };
      return this.renderer.showBalloon(target, balloonId);
    }
    currentRenderableEvents(map = this.map) {
      return Object.values(map?.events ?? {}).flatMap((event) => {
        const page = this.activePage(event);
        const override = this.state.eventOverrides?.[`${this.state.mapId},${event.id}`] ?? {};
        const runtime = map === this.map ? this.events?.refresh?.(event) : null;
        const graphic = runtime?.graphic ?? override.graphic ?? page?.graphic;
        if (!graphic?.character_name || override.transparent) return [];
        const position = routePosition(override, event);
        return [{ id: event.id, x: position.x, y: position.y, direction: override.direction ?? graphic.direction, pattern: override.pattern ?? graphic.pattern, opacity: override.opacity ?? 255, blendType: override.blendType ?? 0, priority: override.priority ?? page?.priority_type ?? 1, graphic, moveSpeed: override.moveSpeed ?? page?.move_speed ?? 3, moveFrequency: override.moveFrequency ?? page?.move_frequency ?? 3, page: { ...page, graphic } }];
      });
    }
    runRubyCompatibility(source, context = {}) {
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
        this.state.stealthCount = 0;
        return;
      }
      const symbol = /^enable_symbol_encount\((\d+)\)$/.exec(String(source).trim());
      if (symbol && context.eventId) {
        const runtime = this.events?.runtime?.(context.eventId);
        if (runtime) runtime.symbolId = Number(symbol[1]);
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
          preemptive: this.state.battle.preemptive,
          surprise: this.state.battle.surprise,
          encounter: this.state.battle.encounter,
          difficulty: this.state.battle.difficulty,
          frames: this.state.battle.frames,
          actors: this.state.battle.actors.map(({ name, hp, mp, tp, ap, chant, states }) => ({ name, hp, mp, tp, ap, chant, states })),
          enemies: this.state.battle.enemies.map(({ enemyId, name, hp, mp, tp, ap, chant, states }) => ({ enemyId, name, hp, mp, tp, ap, chant, states })),
          rewards: this.state.battle.rewards ?? null,
          log: this.state.battle.log.slice(-12)
        } : null,
        interpreter: this.interpreter?.diagnostics(),
        modals: this.modalStack.map((entry) => ({ ...entry })),
        events: this.events?.diagnostics?.() ?? null,
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
      this.state.system ??= {};
      this.state.system.saveCount = Number(this.state.system.saveCount ?? 0) + 1;
      const metadata = await this.saves.save(slot, this.snapshot(), { location: this.state.mapName });
      this.lastSaveSlot = Number(slot);
      this.hasSave = true;
      this.status(`Đã lưu vào tệp ${slot}.`);
      this.recordDiagnostic({ type: "save-db-ready", operation: "save", slot, metadata });
      return metadata;
    }
    async load(slot) {
      const state = await this.saves.load(slot);
      if (!state) throw new Error(`Save slot ${slot} is empty.`);
      this.state = state;
      this.party.normalizeState(this.state);
      this.state.schema = "black-souls-st-state-v2";
      this.state.system ??= { saveDisabled: false, menuDisabled: false, encounterDisabled: false, formationDisabled: false, playtimeSeconds: 0, startedAt: Date.now(), saveCount: 0 };
      this.state.timer ??= { working: false, count: 0 };
      this.state.pluginState ??= {};
      this.state.realX = Number.isFinite(this.state.realX) ? this.state.realX : this.state.x;
      this.state.realY = Number.isFinite(this.state.realY) ? this.state.realY : this.state.y;
      this.state.moveSpeed ??= 4;
      this.state.pattern ??= 1;
      this.state.originalPattern ??= 1;
      this.state.animationCount ??= 0;
      this.state.displayX ??= 0;
      this.state.displayY ??= 0;
      this.state.originOpacity ??= 255;
      this.state.stealthCount ??= 0;
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
      this.lastSaveSlot = Number(slot);
      this.hasSave = true;
      this.notifyScene();
      this.status(`Đã tải tệp ${slot}.`);
      this.recordDiagnostic({ type: "save-db-ready", operation: "load", slot });
    }
    async exportSave(slot = null) {
      return this.saves.export(slot ?? this.lastSaveSlot ?? await this.saves.latestSlot());
    }
    async importSave(serialized, targetSlot = null) {
      const metadata = await this.saves.import(serialized, targetSlot);
      this.hasSave = true;
      if (this.state.scene === "TITLE") await this.enterTitle();
      return metadata;
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
  function reverse2(direction) {
    return 10 - direction;
  }
  function clampIndex(value, length) {
    return length ? Math.max(0, Math.min(length - 1, Number(value) || 0)) : 0;
  }
  function clamp4(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  function approach2(current, target, distance) {
    return current < target ? Math.min(current + distance, target) : current > target ? Math.max(current - distance, target) : target;
  }
  function sumParams(values = []) {
    return values.reduce((sum, value) => sum + Number(value || 0), 0);
  }
  function routePosition(override, event) {
    const motion = override.motion;
    if (!motion) return { x: override.realX ?? override.x ?? event.x, y: override.realY ?? override.y ?? event.y };
    const progress = Math.max(0, Math.min(1, (performance.now() - motion.began) / Math.max(1, motion.durationMs)));
    return { x: motion.fromX + (motion.toX - motion.fromX) * progress, y: motion.fromY + (motion.toY - motion.fromY) * progress };
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

  // sillytavern-port/runtime/streaming/prefetch-manager.js
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
      this.globalPins = /* @__PURE__ */ new Set();
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
        if (this.globalPins.has(key)) this.memory.pin(logicalKey);
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
      const logicalKey = this.versioned(key);
      this.decoded.set(logicalKey, value, bytes);
      if (this.globalPins.has(key)) this.decoded.pin(logicalKey);
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
    pinGlobalAssets(paths) {
      for (const path of unique(paths)) {
        const normalized = normalKey(path);
        const assetKey = `asset:${normalized}`;
        const imageKey = `image:${normalized}`;
        this.globalPins.add(assetKey);
        this.globalPins.add(imageKey);
        this.memory.pin(this.versioned(assetKey));
        this.decoded.pin(this.versioned(imageKey));
      }
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
        if (command?.code === 101 && parameters[0]) actions.push({ type: "asset", path: this.resolveAsset(`Graphics/Faces/${parameters[0]}`), priority: PREFETCH_PRIORITY.HIGH });
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
      for (const key of this.globalPins) {
        if (key.startsWith("asset:")) this.memory.pin(this.versioned(key));
        if (key.startsWith("image:")) this.decoded.pin(this.versioned(key));
      }
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
        globalPinnedAssets: this.globalPins.size / 2,
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

  // sillytavern-port/runtime/assets/asset-resolver.js
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

  // sillytavern-port/runtime/data/loader.js
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
      const globalUiAssets = [...(uiDependencies.MENU_UI ?? []).slice(0, 2), ...uiDependencies.TITLE ?? []];
      this.prefetch.pinGlobalAssets(globalUiAssets);
      void this.prefetch.prefetchAssets(globalUiAssets, { priority: PREFETCH_PRIORITY.HIGH, reason: "global-ui-warmup" });
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

  // sillytavern-port/runtime/render/canvas-renderer.js
  var TILE_ID = Object.freeze({ B: 0, C: 256, D: 512, E: 768, A5: 1536, A1: 2048, A2: 2816, A3: 4352, A4: 5888, MAX: 8192 });
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
      this.displayContext = this.canvas.getContext("2d");
      this.displayContext.imageSmoothingEnabled = false;
      this.frameCanvas = document.createElement("canvas");
      this.frameCanvas.width = this.width;
      this.frameCanvas.height = this.height;
      this.context = this.frameCanvas.getContext("2d");
      this.context.imageSmoothingEnabled = false;
      stage.append(this.canvas);
      this.fade = 0;
      this.characterImages = /* @__PURE__ */ new Map();
      this.faceImages = /* @__PURE__ */ new Map();
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
      this.frameHistory = [];
      this.stats = { frames: 0, presentedFrames: 0, retainedFrames: 0, lastFrameMs: 0, maxFrameMs: 0, scene: "LOADING", mapId: null, tileset: null, loadedSheets: [], characters: [], missingCharacters: [], title: null, animationFailures: [], fontReadyMs: 0, font: "Arial", backbuffer: { width: this.width, height: this.height, atomicPresent: true }, chunks: [] };
    }
    async setTitle(system) {
      const fontBegan = performance.now();
      await waitForFonts();
      this.stats.fontReadyMs = Math.round((performance.now() - fontBegan) * 100) / 100;
      const title1Path = system.title1_name ? `Graphics/Titles1/${system.title1_name}.png` : null;
      const title2Path = system.title2_name ? `Graphics/Titles2/${system.title2_name}.png` : null;
      const [title1, title2, windowSkin, iconSet] = await Promise.all([
        title1Path ? this.loader.image(title1Path) : null,
        title2Path ? this.loader.image(title2Path) : null,
        this.loader.image("Graphics/System/Window.png"),
        this.loader.image("Graphics/System/IconSet.png")
      ]);
      this.windowSkin = windowSkin;
      this.iconSet = iconSet;
      this.currencyUnit = system.currency_unit ?? "";
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
      this.stats.chunks = [{ id: `map:${mapId}:viewport`, ready: true, pending: false, dirty: false, mode: "synchronous-integer-tile-window", marginTiles: 2 }];
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
    async prepareFace(name) {
      if (!name || this.faceImages.has(name)) return this.faceImages.get(name) ?? null;
      const image = await this.loader.image(`Graphics/Faces/${name}.png`, { optional: true });
      if (image) this.faceImages.set(name, image);
      return image;
    }
    async setBattle(battle) {
      const battleback1Path = battle.battleback1 ? `Graphics/Battlebacks1/${battle.battleback1}.png` : null;
      const battleback2Path = battle.battleback2 ? `Graphics/Battlebacks2/${battle.battleback2}.png` : null;
      const [battleback1, battleback2, mist] = await Promise.all([
        battleback1Path ? this.loader.image(battleback1Path, { optional: true }) : null,
        battleback2Path ? this.loader.image(battleback2Path, { optional: true }) : null,
        battle.mistEnabled ? this.loader.image("Graphics/System/mist.png", { optional: true }) : null
      ]);
      const enemies = /* @__PURE__ */ new Map();
      await Promise.all([...new Set(battle.enemies.map((enemy) => enemy.battlerName).filter(Boolean))].map(async (name) => {
        const image = await this.loader.image(`Graphics/Battlers/${name}.png`);
        enemies.set(name, image);
      }));
      await Promise.all([...new Set(battle.actors.map((actor) => actor.faceName).filter(Boolean))].map((name) => this.prepareFace(name)));
      this.battleGraphics = { battleback1, battleback2, battleback1Path, battleback2Path, enemies, mist };
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
      const telemetry = { frame: this.stats.frames + 1, scene: state.scene ?? "PLAYING", mapId: state.mapId ?? this.stats.mapId, began, presented: false, retainedPreviousFrame: false, clearCalls: 0, drawCalls: 0, invalidTileLookups: 0, missingTileSamples: 0, tileSamples: 0, tileDraws: 0, tilesetReady: Boolean(this.sheets), autotileCacheReady: Boolean(this.sheets?.slice(0, 4).every((sheet, index) => !this.tileset?.tileset_names?.[index] || sheet)), offscreenCanvas: { width: this.frameCanvas.width, height: this.frameCanvas.height }, camera: null, visibleRange: null, chunkIds: this.stats.chunks.map((entry) => entry.id), pendingChunks: this.stats.chunks.filter((entry) => entry.pending).map((entry) => entry.id), dirtyChunks: this.stats.chunks.filter((entry) => entry.dirty).map((entry) => entry.id) };
      this.activeFrame = telemetry;
      try {
        this.renderFrame(state, events);
        this.displayContext.drawImage(this.frameCanvas, 0, 0);
        telemetry.presented = true;
        this.stats.presentedFrames += 1;
      } catch (error) {
        telemetry.retainedPreviousFrame = true;
        telemetry.error = error.message;
        this.stats.retainedFrames += 1;
        throw error;
      } finally {
        this.finishFrame(began, telemetry);
        this.activeFrame = null;
      }
    }
    renderFrame(state, events = []) {
      const context = this.context;
      context.fillStyle = "#080709";
      context.fillRect(0, 0, this.width, this.height);
      this.stats.scene = state.scene ?? "PLAYING";
      if (state.scene === "TITLE") {
        this.drawTitle(state.title);
        return;
      }
      if (state.scene === "BATTLE") {
        this.drawBattle(state.battle);
        this.drawPictures();
        this.drawScreenEffects();
        return;
      }
      if (state.scene === "FILE_LOAD") {
        this.drawFileMenu(state.menu);
        return;
      }
      if (!this.map || !this.sheets) return;
      const playerX = Number.isFinite(state.realX) ? state.realX : state.x;
      const playerY = Number.isFinite(state.realY) ? state.realY : state.y;
      const window2 = computeTileWindow({ displayX: state.displayX, displayY: state.displayY, playerX, playerY, mapWidth: this.map.width, mapHeight: this.map.height, width: this.width, height: this.height, tileSize: this.tileSize, margin: 2 });
      const cameraX = window2.cameraX;
      const cameraY = window2.cameraY;
      this.camera = { x: cameraX, y: cameraY, logicalX: window2.logicalX, logicalY: window2.logicalY, pixelX: window2.pixelX, pixelY: window2.pixelY };
      if (this.activeFrame) {
        this.activeFrame.camera = { ...this.camera };
        this.activeFrame.visibleRange = { startX: window2.startX, endX: window2.endX, startY: window2.startY, endY: window2.endY, marginTiles: window2.margin };
      }
      const upper = [];
      this.drawMapLayer(0, window2, upper);
      this.drawMapLayer(1, window2, upper);
      this.drawShadows(window2);
      this.drawTableEdges(window2);
      this.drawMapLayer(2, window2, upper);
      const sprites = events.map((event) => ({ ...event, priority: event.priority ?? 1, type: "event" }));
      if (!state.transparent) sprites.push({ x: playerX, y: playerY, direction: state.direction, pattern: state.pattern ?? 1, opacity: state.opacity ?? 255, priority: 1, graphic: this.playerGraphic, type: "player" });
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
      this.drawScreenEffects();
      this.drawMessage(state.message);
      this.drawChoice(state.choice);
      if (["MENU", "END", "ITEM", "SKILL", "EQUIP", "STATUS", "SYNTHESIS", "SHOP", "FILE_SAVE", "FILE_LOAD"].includes(state.scene)) this.drawGameMenu(state.menu, state);
      if (this.fade > 0) {
        context.fillStyle = `rgba(0,0,0,${this.fade})`;
        context.fillRect(0, 0, this.width, this.height);
      }
    }
    finishFrame(began, telemetry = this.activeFrame) {
      const elapsed = performance.now() - began;
      this.stats.frames += 1;
      this.stats.lastFrameMs = Math.round(elapsed * 100) / 100;
      this.stats.maxFrameMs = Math.max(this.stats.maxFrameMs, this.stats.lastFrameMs);
      if (telemetry) {
        telemetry.elapsedMs = this.stats.lastFrameMs;
        telemetry.ended = performance.now();
        this.frameHistory.push(telemetry);
        this.frameHistory = this.frameHistory.slice(-240);
        this.stats.lastFrame = telemetry;
      }
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
      c.font = font(22);
      c.textBaseline = "middle";
      commands.forEach((command, index) => {
        const selected = index === title?.selected;
        c.fillStyle = command.enabled === false ? "#777" : "#f4f4f4";
        if (selected) this.drawCursor(x + 12, y + padding + lineHeight * index, width - 24, lineHeight);
        c.fillText(displayText(command.label), x + 16, y + padding + lineHeight * index + lineHeight / 2);
      });
      c.textBaseline = "alphabetic";
    }
    drawGameMenu(menu, state = {}) {
      if (!menu) return;
      if (menu.kind === "file") return this.drawFileMenu(menu);
      if (menu.kind === "item" || menu.kind === "skill" || menu.kind === "synthesis" || menu.kind === "shop") return this.drawInventoryMenu(menu, state);
      if (menu.kind === "equip") return this.drawEquipMenu(menu, state);
      if (menu.kind === "status") return this.drawStatusMenu(menu, state);
      const c = this.context;
      c.fillStyle = "rgba(0,0,0,.30)";
      c.fillRect(0, 0, this.width, this.height);
      const width = menu.kind === "end" ? 160 : 160;
      const lineHeight = 24;
      const padding = 12;
      const height = menu.commands.length * lineHeight + padding * 2;
      const x = menu.kind === "end" ? (this.width - width) / 2 : 0;
      const y = menu.kind === "end" ? (this.height - height) / 2 : 0;
      this.drawWindow(x, y, width, height);
      c.font = font(20);
      c.textBaseline = "middle";
      menu.commands.forEach((command, index) => {
        const selected = index === menu.selected;
        c.fillStyle = command.enabled === false ? "#777" : "#f4f4f4";
        if (selected) this.drawCursor(x + padding, y + padding + index * lineHeight, width - padding * 2, lineHeight);
        c.fillText(displayText(command.label), x + 16, y + padding + lineHeight * index + lineHeight / 2);
      });
      c.textBaseline = "alphabetic";
      if (menu.kind !== "end") this.drawMenuStatus(state, menu);
    }
    drawMenuStatus(state, menu = {}) {
      const c = this.context;
      this.drawWindow(160, 0, 480, 480);
      const members = state.party?.members ?? [];
      members.slice(0, 4).forEach((actorId, index) => {
        const actor = state.actors?.[actorId] ?? {};
        const y = 12 + index * 114;
        this.drawActorPortrait(actor, 170, y + 6, 96, 96);
        c.font = font(20);
        c.fillStyle = "#f4f4f4";
        c.fillText(displayText(actor.name), 278, y + 25);
        c.font = font(18);
        c.fillText(`Lv ${actor.level ?? 1}`, 278, y + 53);
        const parameters = menu.actorStatus?.[actorId] ?? {};
        this.drawGauge(360, y + 42, 138, 8, actor.hp, parameters.mhp ?? actor.hp, "#d85a5a", "#7b1f2b");
        c.fillText(`HP ${Math.floor(actor.hp ?? 0)}`, 278, y + 78);
        c.fillText(`MP ${Math.floor(actor.mp ?? 0)}`, 414, y + 78);
      });
      this.drawWindow(0, 432, 160, 48);
      c.font = font(18);
      c.fillStyle = "#f4f4f4";
      c.textAlign = "right";
      c.fillText(`${Math.floor(state.party?.gold ?? 0)} ${displayText(this.currencyUnit)}`, 146, 462);
      c.textAlign = "left";
      this.drawWindow(0, 370, 160, 64);
      c.fillStyle = "#e5d08d";
      c.fillText("Tội Lỗi", 14, 394);
      c.fillStyle = "#f4f4f4";
      c.textAlign = "right";
      c.fillText(String(state.variables?.[38] ?? 0), 140, 420);
      c.textAlign = "left";
    }
    drawInventoryMenu(menu, state = {}) {
      const c = this.context;
      c.fillStyle = "rgba(0,0,0,.30)";
      c.fillRect(0, 0, this.width, this.height);
      const entries = menu.entries ?? [];
      const selected = entries[menu.selected];
      this.drawWindow(0, 0, 640, 48);
      c.font = font(18);
      c.fillStyle = "#f4f4f4";
      c.fillText(displayText(selected?.data?.description ?? ""), 14, 30);
      let listY = 48;
      if (menu.kind === "item") {
        this.drawWindow(0, 48, 640, 48);
        listY = 96;
        const columnWidth = 640 / Math.max(1, menu.categories?.length ?? 4);
        (menu.categories ?? []).forEach((category, index) => {
          if (menu.mode === "category" && index === menu.categorySelected) this.drawCursor(index * columnWidth + 12, 60, columnWidth - 24, 24);
          c.fillStyle = "#f4f4f4";
          c.textAlign = "center";
          c.fillText(displayText(category.label), index * columnWidth + columnWidth / 2, 82);
        });
        c.textAlign = "left";
      }
      this.drawWindow(0, listY, 640, 480 - listY);
      c.font = font(18);
      entries.slice(0, 28).forEach((entry, index) => {
        const column = index % 2;
        const row = Math.floor(index / 2);
        const x = 12 + column * 308;
        const y = listY + 12 + row * 24;
        const active = menu.kind !== "item" || menu.mode === "items";
        if (active && index === menu.selected) this.drawCursor(x, y, 300, 24);
        const data = entry.data ?? {};
        if (data.icon_index != null) this.drawIcon(Number(data.icon_index), x + 2, y);
        const suffix = menu.kind === "shop" ? `${entry.price} ${this.currencyUnit}` : menu.kind === "skill" ? `${data.mp_cost ?? 0} MP` : `:${String(entry.amount ?? 1).padStart(2, " ")}`;
        c.fillStyle = "#f4f4f4";
        c.fillText(displayText(data.name ?? `${entry.kind} ${entry.id}`), x + 30, y + 19);
        c.textAlign = "right";
        c.fillText(displayText(suffix), x + 294, y + 19);
        c.textAlign = "left";
      });
    }
    drawEquipMenu(menu, state) {
      const c = this.context;
      c.fillStyle = "rgba(0,0,0,.30)";
      c.fillRect(0, 0, this.width, this.height);
      const actor = state.actors?.[menu.actorId] ?? {};
      const selectedSlot = menu.slotEntries?.[menu.selected];
      this.drawWindow(0, 0, 640, 48);
      c.font = font(18);
      c.fillStyle = "#f4f4f4";
      c.fillText(displayText(selectedSlot?.data?.description ?? ""), 14, 30);
      this.drawWindow(0, 48, 208, 192);
      c.fillText(displayText(actor.name), 16, 76);
      const labels = ["Công Kích", "Phòng Ngự", "Phép Thuật", "Kháng Phép", "Tốc Độ", "May Mắn"];
      const names = ["atk", "def", "mat", "mdf", "agi", "luk"];
      labels.forEach((label, index) => {
        c.fillStyle = "#e5d08d";
        c.fillText(label, 16, 102 + index * 24);
        c.fillStyle = "#f4f4f4";
        c.textAlign = "right";
        c.fillText(String(menu.parameters?.[names[index]] ?? 0), 190, 102 + index * 24);
        c.textAlign = "left";
      });
      this.drawWindow(208, 48, 432, 48);
      (menu.commands ?? []).forEach((command, index) => {
        const x = 220 + index * 136;
        if (menu.mode === "command" && index === menu.commandSelected) this.drawCursor(x, 60, 128, 24);
        c.fillStyle = "#f4f4f4";
        c.textAlign = "center";
        c.fillText(displayText(command.label), x + 64, 80);
      });
      c.textAlign = "left";
      this.drawWindow(208, 96, 432, 144);
      const etypeNames = ["Vũ Khí", "", "", "Nhẫn", "Phụ Kiện"];
      (menu.slotEntries ?? actor.equips ?? []).slice(0, 5).forEach((slot, index) => {
        const y = 108 + index * 24;
        if (menu.mode === "slots" && index === menu.selected) this.drawCursor(220, y, 408, 24);
        c.fillStyle = "#e5d08d";
        c.fillText(displayText(etypeNames[slot.etypeId] ?? ""), 224, y + 19);
        if (slot.data?.icon_index != null) this.drawIcon(slot.data.icon_index, 314, y);
        c.fillStyle = "#f4f4f4";
        c.fillText(displayText(slot.data?.name ?? ""), 342, y + 19);
      });
      this.drawWindow(0, 240, 640, 240);
      if (menu.mode === "choices") (menu.choices ?? []).slice(0, 18).forEach((entry, index) => {
        const column = index % 2;
        const row = Math.floor(index / 2);
        const x = 12 + column * 308;
        const y = 252 + row * 24;
        if (index === menu.choiceSelected) this.drawCursor(x, y, 300, 24);
        if (entry.data?.icon_index != null) this.drawIcon(entry.data.icon_index, x + 2, y);
        c.fillStyle = "#f4f4f4";
        c.fillText(displayText(entry.data?.name ?? ""), x + 30, y + 19);
      });
    }
    drawStatusMenu(menu, state) {
      const c = this.context;
      c.fillStyle = "rgba(0,0,0,.30)";
      c.fillRect(0, 0, this.width, this.height);
      this.drawWindow(0, 0, 640, 480);
      const actor = state.actors?.[menu.actorId] ?? {};
      c.font = font(20);
      c.fillStyle = "#f4f4f4";
      c.fillText(displayText(actor.name), 16, 31);
      c.fillText(displayText(menu.className), 140, 31);
      c.fillText(displayText(actor.nickname), 300, 31);
      this.drawHorzLine(12, 36, 616);
      this.drawActorPortrait(actor, 20, 60, 96, 96);
      c.fillStyle = "#e5d08d";
      c.fillText("Lv", 148, 82);
      c.fillStyle = "#f4f4f4";
      c.textAlign = "right";
      c.fillText(String(actor.level ?? 1), 278, 82);
      c.textAlign = "left";
      this.drawGauge(148, 112, 124, 8, actor.hp, menu.parameters?.mhp, "#dc5b60", "#79202d");
      c.fillText(`HP ${Math.floor(actor.hp ?? 0)}/${menu.parameters?.mhp ?? 0}`, 148, 132);
      this.drawGauge(148, 142, 124, 8, actor.mp, menu.parameters?.mmp, "#5c87d9", "#253e7c");
      c.fillText(`MP ${Math.floor(actor.mp ?? 0)}/${menu.parameters?.mmp ?? 0}`, 148, 162);
      c.fillStyle = "#e5d08d";
      c.fillText("Kinh Nghiệm hiện tại", 316, 82);
      c.fillText("Cần thêm Cấp độ", 316, 130);
      c.fillStyle = "#f4f4f4";
      c.textAlign = "right";
      c.fillText(String(menu.expCurrent ?? 0), 604, 106);
      c.fillText(String(menu.expNext ?? 0), 604, 154);
      c.textAlign = "left";
      this.drawHorzLine(12, 156, 616);
      const paramKeys = ["atk", "def", "mat", "mdf", "agi", "luk"];
      paramKeys.forEach((key, index) => {
        const y = 190 + index * 24;
        c.fillStyle = "#e5d08d";
        c.fillText(displayText(menu.paramLabels?.[index + 2] ?? key), 44, y);
        c.fillStyle = "#f4f4f4";
        c.textAlign = "right";
        c.fillText(String(menu.parameters?.[key] ?? 0), 258, y);
        c.textAlign = "left";
      });
      (menu.equipment ?? []).slice(0, 8).forEach((item, index) => {
        const y = 190 + index * 24;
        if (item?.icon_index != null) this.drawIcon(item.icon_index, 300, y - 18);
        c.fillStyle = "#f4f4f4";
        c.fillText(displayText(item?.name ?? ""), 328, y);
      });
      this.drawHorzLine(12, 324, 616);
      c.fillStyle = "#f4f4f4";
      wrapText(c, displayText(actor.description), 16, 370, 608, 24);
    }
    drawFileMenu(menu) {
      const c = this.context;
      c.fillStyle = "#09080a";
      c.fillRect(0, 0, this.width, this.height);
      this.drawWindow(0, 0, 640, 48);
      c.font = font(20);
      c.fillStyle = "#f4f4f4";
      c.fillText(displayText(menu.help), 14, 31);
      const visible = (menu.slots ?? []).slice(menu.topIndex, menu.topIndex + 4);
      visible.forEach((entry, visibleIndex) => {
        const index = menu.topIndex + visibleIndex;
        const y = 48 + visibleIndex * 108;
        this.drawWindow(0, y, 640, 108);
        c.font = font(20);
        c.fillStyle = entry.empty ? "#777" : "#f4f4f4";
        const name = `Tệp ${entry.slot}`;
        if (index === menu.selected) this.drawCursor(12, y + 12, Math.max(78, c.measureText(name).width + 12), 24);
        c.fillText(name, 16, y + 34);
        if (!entry.empty) {
          (entry.partyCharacters ?? []).slice(0, 4).forEach((character, partyIndex) => this.drawSaveCharacter(character, 152 + partyIndex * 48, y + 70));
          c.font = font(16);
          c.fillStyle = "#d7d2cb";
          c.fillText(`${displayText(entry.playerName)}  Lv ${entry.level ?? 1}`, 300, y + 35);
          c.fillText(displayText(entry.location), 300, y + 60);
          c.textAlign = "right";
          c.fillText(formatPlaytime(entry.playtimeSeconds), 620, y + 88);
          c.textAlign = "left";
          c.fillStyle = "#9e9891";
          c.fillText(formatTimestamp(entry.savedAt), 300, y + 86);
        }
      });
    }
    drawBattle(battle) {
      const c = this.context;
      c.fillStyle = "#100d12";
      c.fillRect(0, 0, this.width, this.height);
      if (this.battleGraphics?.battleback1) c.drawImage(this.battleGraphics.battleback1, 0, 0, this.width, this.height);
      if (this.battleGraphics?.battleback2) c.drawImage(this.battleGraphics.battleback2, 0, 0, this.width, this.height);
      if (battle?.mistEnabled && this.battleGraphics?.mist) this.drawBattleMist(battle, this.battleGraphics.mist);
      for (const enemy of battle?.enemies ?? []) {
        if (enemy.hp <= 0) continue;
        const image = this.battleGraphics?.enemies?.get(enemy.battlerName);
        if (!image) continue;
        const baseScale = Math.min(1, 260 / Math.max(image.width, image.height));
        const breath = 1 + Math.sin(Math.PI * 2 * (battle.frames + enemy.breathOffset) / Math.max(1, enemy.breathPeriod)) * 75e-4 + 75e-4;
        const perspective = Math.max(0.25, Number(enemy.perspectiveScale) || 1);
        const width = image.width * baseScale * perspective;
        const height = image.height * baseScale * perspective * breath;
        c.save();
        c.translate(enemy.x, enemy.y);
        c.scale(enemy.mirror ? -1 : 1, 1);
        c.drawImage(image, -width / 2, -height, width, height);
        c.restore();
        c.fillStyle = "#17080a";
        c.fillRect(enemy.x - 40, Math.min(320, enemy.y - height + 15), 80, 4);
        c.fillStyle = "#d0a055";
        c.fillRect(enemy.x - 40, Math.min(320, enemy.y - height + 15), 80 * enemy.hp / Math.max(1, enemy.parameters.mhp), 4);
        const enemyAp = enemy.chant ? enemy.chant.elapsed / Math.max(1, enemy.chant.total) : enemy.ap / 4e3;
        c.globalAlpha = 0.5;
        c.fillStyle = "#202040";
        c.fillRect(enemy.x - 50, enemy.y - 10, 100, 6);
        c.fillStyle = enemy.chant ? "#be78d0" : "#7e9fe8";
        c.fillRect(enemy.x - 50, enemy.y - 10, 100 * Math.min(1, enemyAp), 6);
        c.globalAlpha = 1;
        c.fillStyle = "#eee";
        c.font = font(13);
        c.textAlign = "center";
        c.fillText(displayText(enemy.name), enemy.x, enemy.y + 28);
        c.textAlign = "left";
      }
      const commandRows = Math.max(4, Math.min(8, battle?.commands?.length ?? 4));
      const commandHeight = 24 + commandRows * 24;
      const commandY = 480 - commandHeight;
      this.drawWindow(0, commandY, 128, commandHeight);
      this.drawWindow(128, 360, 512, 120);
      c.font = font(17);
      c.fillStyle = "#f4f4f4";
      const actor = battle?.actors?.[battle?.activeActor ?? 0] ?? battle?.actors?.[0];
      if (actor) {
        const face = this.faceImages.get(actor.faceName);
        if (face) c.drawImage(face, actor.faceIndex % 4 * 96, Math.floor(actor.faceIndex / 4) * 96 + 38, 96, 24, 142, 365, 96, 24);
        c.fillText(displayText(actor.name), 142, 387);
        this.drawGauge(330, 375, 120, 8, actor.hp, actor.parameters.mhp, "#dc5b60", "#79202d");
        this.drawGauge(468, 375, 80, 8, actor.mp, actor.parameters.mmp, "#5c87d9", "#253e7c");
        c.fillText(`HP ${actor.hp}/${actor.parameters.mhp}`, 320, 408);
        c.fillText(`MP ${actor.mp}/${actor.parameters.mmp}`, 466, 408);
        const actorAp = actor.chant ? actor.chant.elapsed / Math.max(1, actor.chant.total) : actor.ap / 4e3;
        this.drawGauge(320, 419, 230, 8, actorAp, 1, actor.chant ? "#bd74cb" : "#7e9fe8", actor.chant ? "#6b3573" : "#334c89");
        c.fillText(`AP ${Math.floor(Math.min(1, actorAp) * 100)}%`, 320, 449);
      }
      if (battle?.phase === "actor-command") (battle.commands ?? []).slice(0, 8).forEach((command, index) => {
        const y = commandY + 12 + index * 24;
        if (index === battle.selectedCommand) this.drawCursor(12, y, 104, 24);
        c.fillStyle = "#f4f4f4";
        c.fillText(displayText(command), 16, y + 19);
      });
      else {
        c.fillStyle = "#c9c2ba";
        c.fillText(displayText(battle?.log?.at(-1) ?? ""), 146, 462);
      }
    }
    drawBattleMist(battle, image) {
      const c = this.context;
      c.save();
      c.globalCompositeOperation = "lighter";
      for (let index = 0; index < 10; index += 1) {
        const z = 20 + (battle.frames + index * 57) % 580;
        const baseX = 160 + (index * 131 + battle.troopId * 17) % 320;
        const x = (baseX - 320) * z / 128 + baseX;
        const y = z / 4 + 160;
        const scale = z * 3e-3 + 0.25;
        c.globalAlpha = Math.max(0, Math.min(1, (z >= 536 ? (600 - z) * 4 : z) / 255));
        const width = image.width * scale;
        const height = image.height * scale;
        c.drawImage(image, x - width / 2, y - height / 2, width, height);
      }
      c.restore();
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
          const darkness = clamp5(-(Number(tone.red ?? tone[0] ?? 0) + Number(tone.green ?? tone[1] ?? 0) + Number(tone.blue ?? tone[2] ?? 0)) / 765, 0, 1);
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
        const darkness = clamp5(-(Number(tone.red) + Number(tone.green) + Number(tone.blue)) / (255 * 3), 0, 1);
        if (darkness > 0) {
          c.fillStyle = `rgba(0,0,0,${darkness})`;
          c.fillRect(0, 0, this.width, this.height);
        }
      }
      if (this.screenFlash) {
        const color = this.screenFlash.color ?? {};
        const duration = Math.max(1, this.screenFlash.until - this.screenFlash.began);
        const alpha = clamp5((this.screenFlash.until - now) / duration, 0, 1) * (Number(color.alpha ?? 255) / 255);
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
      if (!this.windowSkin) {
        c.fillStyle = "rgba(0,0,0,.90)";
        c.fillRect(x, y, width, height);
        c.strokeStyle = "#d2cbbd";
        c.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
        return;
      }
      c.save();
      c.globalAlpha = 0.94;
      c.drawImage(this.windowSkin, 0, 0, 64, 64, x + 4, y + 4, Math.max(1, width - 8), Math.max(1, height - 8));
      const s = this.windowSkin;
      const edge = 16;
      c.drawImage(s, 64, 0, 16, 16, x, y, edge, edge);
      c.drawImage(s, 112, 0, 16, 16, x + width - edge, y, edge, edge);
      c.drawImage(s, 64, 48, 16, 16, x, y + height - edge, edge, edge);
      c.drawImage(s, 112, 48, 16, 16, x + width - edge, y + height - edge, edge, edge);
      c.drawImage(s, 80, 0, 32, 16, x + edge, y, Math.max(1, width - edge * 2), edge);
      c.drawImage(s, 80, 48, 32, 16, x + edge, y + height - edge, Math.max(1, width - edge * 2), edge);
      c.drawImage(s, 64, 16, 16, 32, x, y + edge, edge, Math.max(1, height - edge * 2));
      c.drawImage(s, 112, 16, 16, 32, x + width - edge, y + edge, edge, Math.max(1, height - edge * 2));
      c.restore();
    }
    drawCursor(x, y, width, height) {
      const c = this.context;
      if (this.windowSkin) {
        c.save();
        c.globalAlpha = 0.72;
        c.drawImage(this.windowSkin, 64, 64, 32, 32, x, y, width, height);
        c.restore();
      } else {
        c.fillStyle = "rgba(255,255,255,.16)";
        c.fillRect(x, y, width, height);
      }
    }
    drawIcon(index, x, y) {
      if (!this.iconSet || !Number.isFinite(Number(index))) return;
      const id = Number(index);
      this.context.drawImage(this.iconSet, id % 16 * 24, Math.floor(id / 16) * 24, 24, 24, x, y, 24, 24);
    }
    drawGauge(x, y, width, height, value = 0, maximum = 1, color1 = "#fff", color2 = "#888") {
      const ratio2 = clamp5(Number(value) / Math.max(1, Number(maximum)), 0, 1);
      const gradient = this.context.createLinearGradient(x, y, x + width, y);
      gradient.addColorStop(0, color2);
      gradient.addColorStop(1, color1);
      this.context.fillStyle = "#241f25";
      this.context.fillRect(x, y, width, height);
      this.context.fillStyle = gradient;
      this.context.fillRect(x, y, width * ratio2, height);
    }
    drawHorzLine(x, y, width) {
      this.context.fillStyle = "rgba(255,255,255,.20)";
      this.context.fillRect(x, y, width, 2);
    }
    drawActorPortrait(actor, x, y, width, height) {
      const name = actor?.characterName;
      const image = name ? this.characterImages.get(name) : null;
      if (!image) return;
      const frame = characterFrame(image, name, actor.characterIndex ?? 0, 2, 1);
      const scale = Math.min(width / frame.width, height / frame.height, 2);
      this.context.drawImage(image, frame.sx, frame.sy, frame.width, frame.height, x + (width - frame.width * scale) / 2, y + height - frame.height * scale, frame.width * scale, frame.height * scale);
    }
    drawSaveCharacter(character, x, y) {
      const image = this.characterImages.get(character.characterName);
      if (!image) return;
      const frame = characterFrame(image, character.characterName, character.characterIndex ?? 0, 2, 1);
      this.context.drawImage(image, frame.sx, frame.sy, frame.width, frame.height, x - frame.width / 2, y - frame.height, frame.width, frame.height);
    }
    tileAt(x, y, z) {
      if (this.activeFrame) this.activeFrame.tileSamples += 1;
      if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
        if (this.activeFrame) this.activeFrame.invalidTileLookups += 1;
        return 0;
      }
      if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height) return 0;
      const value = this.map.data.data[vxAceTileDataIndex(this.map.width, this.map.height, x, y, z)];
      if (value == null && this.activeFrame) this.activeFrame.missingTileSamples += 1;
      return value ?? 0;
    }
    drawMapLayer(z, window2, upper) {
      for (let mapY = window2.startY; mapY <= window2.endY; mapY += 1) for (let mapX = window2.startX; mapX <= window2.endX; mapX += 1) {
        const dx = mapX * this.tileSize - window2.pixelX;
        const dy = mapY * this.tileSize - window2.pixelY;
        const tileId = this.tileAt(mapX, mapY, z);
        const args = [tileId, dx, dy, { x: mapX, y: mapY, z }];
        if (this.isUpper(tileId)) upper.push(args);
        else this.drawTile(...args);
      }
    }
    isUpper(tileId) {
      return Boolean((this.tileset?.flags?.data?.[tileId] ?? 0) & 16);
    }
    drawTile(tileId, dx, dy, mapPosition = null) {
      if (tileId <= 0) return;
      if (this.activeFrame) {
        this.activeFrame.tileDraws += 1;
        this.activeFrame.drawCalls += 1;
        const inspector = this.activeFrame.tileInspector ??= [];
        if (inspector.length < 96 && !inspector.some((entry) => entry.tileId === tileId)) {
          inspector.push({ ...mapPosition, ...resolveVxAceTile(tileId, Math.floor(performance.now() / 400)), flags: tilesetFlagTraits(this.tileset?.flags?.data?.[tileId] ?? 0) });
        }
      }
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
      const resolved = resolveVxAceTile(tileId, Math.floor(performance.now() / 400));
      const sheet = this.sheets[resolved.sheetIndex];
      if (!sheet) return;
      for (const quarter of resolved.quarters) this.context.drawImage(sheet, quarter.sx, quarter.sy, 16, 16, dx + quarter.dx, dy + quarter.dy, 16, 16);
    }
    drawShadows(window2) {
      const offset = this.map.width * this.map.height * 3;
      this.context.fillStyle = "rgba(0,0,0,.42)";
      for (let my = window2.startY; my <= window2.endY; my += 1) for (let mx = window2.startX; mx <= window2.endX; mx += 1) {
        const bits = (this.map.data.data[mx + my * this.map.width + offset] ?? 0) & 15;
        const dx = mx * this.tileSize - window2.pixelX;
        const dy = my * this.tileSize - window2.pixelY;
        for (let q = 0; q < 4; q += 1) if (bits & 1 << q) this.context.fillRect(dx + q % 2 * 16, dy + Math.floor(q / 2) * 16, 16, 16);
      }
    }
    drawTableEdges(window2) {
      for (let mapY = window2.startY; mapY <= window2.endY; mapY += 1) for (let mapX = window2.startX; mapX <= window2.endX; mapX += 1) {
        const upperTileId = this.tileAt(mapX, mapY - 1, 1);
        const tileId = this.tileAt(mapX, mapY, 1);
        if (!this.isTable(upperTileId) || this.isTable(tileId)) continue;
        const resolved = resolveVxAceTile(upperTileId, Math.floor(performance.now() / 400));
        if (resolved.family !== "A2") continue;
        const sheet = this.sheets[resolved.sheetIndex];
        if (!sheet) continue;
        const dx = mapX * this.tileSize - window2.pixelX;
        const dy = mapY * this.tileSize - window2.pixelY;
        for (const quarter of resolved.quarters.slice(2)) this.context.drawImage(sheet, quarter.sx, quarter.sy + 8, 16, 8, dx + quarter.dx, dy, 16, 8);
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
      const opacity = clamp5(Number(sprite.opacity ?? 255) / 255, 0, 1);
      this.context.save();
      this.context.globalAlpha = opacity;
      this.context.globalCompositeOperation = Number(sprite.blendType) === 1 ? "lighter" : Number(sprite.blendType) === 2 ? "multiply" : "source-over";
      if (this.isBush(Math.round(sprite.x), Math.round(sprite.y)) && frame.height >= 24) {
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
    isTable(tileId) {
      return Boolean((this.tileset?.flags?.data?.[tileId] ?? 0) & 128);
    }
    drawFog() {
      if (!this.fog) return;
      const { image, x, y, zoom, opacity, blend } = this.fog;
      const scale = zoom > 10 ? zoom / 100 : 1;
      const width = image.width * scale;
      const height = image.height * scale;
      this.context.save();
      this.context.globalAlpha = clamp5(opacity / 255, 0, 1);
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
      const data = typeof message === "string" ? { text: message, position: 2, background: 0 } : message;
      const c = this.context;
      const y = [0, 180, 360][Number(data.position ?? 2)] ?? 360;
      if (Number(data.background ?? 0) === 1) {
        const gradient = c.createLinearGradient(0, y, 0, y + 120);
        gradient.addColorStop(0, "rgba(0,0,0,0)");
        gradient.addColorStop(0.25, "rgba(0,0,0,.76)");
        gradient.addColorStop(0.75, "rgba(0,0,0,.76)");
        gradient.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = gradient;
        c.fillRect(0, y, 640, 120);
      } else if (Number(data.background ?? 0) === 0) this.drawWindow(0, y, 640, 120);
      const face = this.faceImages.get(data.face);
      if (face) {
        const index = Number(data.faceIndex) || 0;
        c.drawImage(face, index % 4 * 96, Math.floor(index / 4) * 96, 96, 96, 12, y + 12, 96, 96);
      }
      c.fillStyle = "#f4f4f4";
      c.font = font(20);
      wrapText(c, displayText(data.text), face ? 120 : 12, y + 34, face ? 508 : 616, 24);
    }
    drawChoice(choice) {
      if (!choice) return;
      const c = this.context;
      c.font = font(20);
      const width = Math.max(96, Math.min(360, Math.max(...choice.options.map((option) => c.measureText(displayText(option)).width), 0) + 48));
      const height = choice.options.length * 24 + 24;
      const x = this.width - width;
      const y = Math.max(0, 360 - height);
      this.drawWindow(x, y, width, height);
      choice.options.forEach((option, index) => {
        const rowY = y + 12 + index * 24;
        if (index === choice.selected) this.drawCursor(x + 12, rowY, width - 24, 24);
        c.fillStyle = "#f4f4f4";
        c.fillText(displayText(option), x + 16, rowY + 19);
      });
    }
    promptText(label, maxLength, value = "") {
      return new Promise((resolve) => {
        const form = document.createElement("form");
        form.dataset.bsModal = "name-input";
        form.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;background:#000c;color:#eee;font:18px Arial,"Noto Sans","Segoe UI",sans-serif';
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
        form.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;background:#000d;color:#eee;font:16px Arial,"Noto Sans","Segoe UI",sans-serif;z-index:30';
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
        frameHistory: this.frameHistory.slice(-120),
        fog: Boolean(this.fog),
        pictures: [...this.pictures.values()].map(({ id, name, x, y, opacity, angle }) => ({ id, name, x, y, opacity, angle })),
        battle: this.battleGraphics ? { battleback1: this.battleGraphics.battleback1Path, battleback2: this.battleGraphics.battleback2Path, enemies: [...this.battleGraphics.enemies.keys()] } : null,
        screenEffects: { tone: this.screenTone, flash: this.screenFlash, shake: this.screenShake, weather: this.weather },
        failedCharacterSheets: [...this.characterSheetFailures].map(([path, error]) => ({ path, error }))
      };
    }
  };
  function computeTileWindow({ displayX, displayY, playerX = 0, playerY = 0, mapWidth, mapHeight, width = 640, height = 480, tileSize = 32, margin = 2 }) {
    const viewportTilesX = width / tileSize;
    const viewportTilesY = height / tileSize;
    const logicalX = clamp5(Number.isFinite(displayX) ? displayX : playerX - (viewportTilesX - 1) / 2, 0, Math.max(0, mapWidth - viewportTilesX));
    const logicalY = clamp5(Number.isFinite(displayY) ? displayY : playerY - (viewportTilesY - 1) / 2, 0, Math.max(0, mapHeight - viewportTilesY));
    const pixelX = Math.round(logicalX * tileSize);
    const pixelY = Math.round(logicalY * tileSize);
    const cameraX = pixelX / tileSize;
    const cameraY = pixelY / tileSize;
    return {
      logicalX,
      logicalY,
      pixelX,
      pixelY,
      cameraX,
      cameraY,
      margin,
      startX: Math.max(0, Math.floor(pixelX / tileSize) - margin),
      endX: Math.min(mapWidth - 1, Math.ceil((pixelX + width) / tileSize) + margin),
      startY: Math.max(0, Math.floor(pixelY / tileSize) - margin),
      endY: Math.min(mapHeight - 1, Math.ceil((pixelY + height) / tileSize) + margin)
    };
  }
  function vxAceTileDataIndex(width, height, x, y, z) {
    return x + y * width + z * width * height;
  }
  function tilesetFlagTraits(flag = 0) {
    return {
      raw: Number(flag) || 0,
      passage: Number(flag) & 15,
      star: Boolean(Number(flag) & 16),
      ladder: Boolean(Number(flag) & 32),
      bush: Boolean(Number(flag) & 64),
      counter: Boolean(Number(flag) & 128),
      damageFloor: Boolean(Number(flag) & 256),
      terrainTag: Number(flag) >> 12 & 15
    };
  }
  function resolveVxAceTile(tileId, animationTick = 0) {
    tileId = Number(tileId) || 0;
    if (tileId <= 0) return { tileId, family: "EMPTY", sheetIndex: null, source: null, quarters: [] };
    if (tileId < TILE_ID.A5) {
      const sheetIndex2 = 5 + Math.floor(tileId / 256);
      const localId = tileId % 256;
      return { tileId, family: ["B", "C", "D", "E"][Math.floor(tileId / 256)] ?? "UNUSED", sheetIndex: sheetIndex2, localId, source: { x: localId % 8 * 32, y: Math.floor(localId / 8) * 32, width: 32, height: 32 }, quarters: [] };
    }
    if (tileId < TILE_ID.A1) {
      const localId = tileId - TILE_ID.A5;
      return { tileId, family: "A5", sheetIndex: 4, localId, source: { x: localId % 8 * 32, y: Math.floor(localId / 8) * 32, width: 32, height: 32 }, quarters: [] };
    }
    const kind = Math.floor((tileId - TILE_ID.A1) / 48);
    const shape = (tileId - TILE_ID.A1) % 48;
    const tx = kind % 8;
    const ty = Math.floor(kind / 8);
    let family = "A1";
    let sheetIndex = 0;
    let bx = 0;
    let by = 0;
    let table = FLOOR_AUTOTILE_TABLE;
    let tableName = "floor";
    const surfaceFrame = [0, 1, 2, 1][Math.abs(Math.floor(animationTick)) % 4];
    const waterfallFrame = Math.abs(Math.floor(animationTick)) % 3;
    if (tileId >= TILE_ID.A4) {
      family = "A4";
      sheetIndex = 3;
      bx = tx * 2;
      by = Math.floor((ty - 10) * 2.5 + (ty % 2 === 1 ? 0.5 : 0));
      if (ty % 2 === 1) {
        table = WALL_AUTOTILE_TABLE;
        tableName = "wall";
      }
    } else if (tileId >= TILE_ID.A3) {
      family = "A3";
      sheetIndex = 2;
      bx = tx * 2;
      by = (ty - 6) * 2;
      table = WALL_AUTOTILE_TABLE;
      tableName = "wall";
    } else if (tileId >= TILE_ID.A2) {
      family = "A2";
      sheetIndex = 1;
      bx = tx * 2;
      by = (ty - 2) * 3;
    } else if (kind === 0) {
      bx = surfaceFrame * 2;
      by = 0;
    } else if (kind === 1) {
      bx = surfaceFrame * 2;
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
      if (kind % 2 === 0) bx += surfaceFrame * 2;
      else {
        bx += 6;
        by += waterfallFrame;
        table = WATERFALL_AUTOTILE_TABLE;
        tableName = "waterfall";
      }
    }
    const tableShape = table[shape];
    if (!tableShape) return { tileId, family, sheetIndex, kind, shape, table: tableName, base: { x: bx, y: by }, source: null, quarters: [], invalidShape: true };
    const quarters = tableShape.map(([qsx, qsy], index) => ({ sx: (bx + qsx) * 16, sy: (by + qsy) * 16, dx: index % 2 * 16, dy: Math.floor(index / 2) * 16 }));
    return { tileId, family, sheetIndex, kind, shape, table: tableName, animation: { tick: animationTick, surfaceFrame, waterfallFrame }, base: { x: bx, y: by }, source: null, quarters };
  }
  function characterFrame(image, name, index, direction, pattern) {
    const big = name.replace(/^!/, "").startsWith("$");
    const width = image.width / (big ? 3 : 12);
    const height = image.height / (big ? 4 : 8);
    const baseX = big ? 0 : index % 4 * 3;
    const baseY = big ? 0 : Math.floor(index / 4) * 4;
    const cardinal = [2, 4, 6, 8].includes(direction) ? direction : direction < 5 ? 2 : 8;
    const row = { 2: 0, 4: 1, 6: 2, 8: 3 }[cardinal];
    const renderedPattern = Number(pattern) < 3 ? clamp5(Number(pattern) || 0, 0, 2) : 1;
    return { sx: (baseX + renderedPattern) * width, sy: (baseY + row) * height, width, height };
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
  function clamp5(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  function displayText(value) {
    return String(value ?? "").normalize("NFC");
  }
  function font(size = 20) {
    return `${size}px Arial, "Noto Sans", "Segoe UI", sans-serif`;
  }
  function wrapText(context, text, x, y, width, lineHeight) {
    for (const paragraph of displayText(text).split("\n")) {
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
  async function waitForFonts() {
    try {
      await globalThis.document?.fonts?.ready;
      await globalThis.document?.fonts?.load?.("20px Arial", "Cậu cần gì? Đường Đừng Thánh Người");
    } catch {
    }
  }
  function formatPlaytime(seconds = 0) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${String(Math.floor(total / 3600)).padStart(2, "0")}:${String(Math.floor(total / 60) % 60).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }
  function formatTimestamp(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
  }
  function waitFrames(frames) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(frames) || 0) * 1e3 / 60));
  }
  function updatePictureTransition(picture) {
    const transition = picture.transition;
    if (!transition) return;
    const now = performance.now();
    const progress = clamp5((now - transition.began) / Math.max(1, transition.until - transition.began), 0, 1);
    for (const [key, target] of Object.entries(transition.target)) {
      const start = transition.from[key];
      picture[key] = Number.isFinite(Number(start)) && Number.isFinite(Number(target)) ? Number(start) + (Number(target) - Number(start)) * progress : progress >= 1 ? target : start;
    }
    if (progress >= 1) delete picture.transition;
  }

  // sillytavern-port/runtime/save/indexeddb.js
  var SAVE_DATABASE = "black-souls-sillytavern";
  var SAVE_SCHEMA = "black-souls-st-save-v2";
  var SAVE_SLOT_COUNT = 16;
  var DATABASE_VERSION = 2;
  var STORES = Object.freeze({ SAVES: "saves", METADATA: "metadata", SETTINGS: "settings" });
  var SaveStore = class {
    constructor({ runtimeVersion = "dev", dataVersion = "black-souls-normalized-data-v1" } = {}) {
      this.runtimeVersion = runtimeVersion;
      this.dataVersion = dataVersion;
    }
    async save(slot, state, metadata = {}) {
      const safeSlot = validateSlot(slot);
      const savedAt = (/* @__PURE__ */ new Date()).toISOString();
      const display = makeDisplayMetadata(safeSlot, state, savedAt, metadata);
      const record = {
        slot: safeSlot,
        schema: SAVE_SCHEMA,
        gameVersion: this.runtimeVersion,
        dataVersion: this.dataVersion,
        savedAt,
        metadata: display,
        state
      };
      const database = await openDatabase().catch(() => null);
      if (!database) {
        memorySaves.set(safeSlot, record);
        memoryMetadata.set(safeSlot, display);
        return display;
      }
      const transaction = database.transaction([STORES.SAVES, STORES.METADATA], "readwrite");
      transaction.objectStore(STORES.SAVES).put(record);
      transaction.objectStore(STORES.METADATA).put(display);
      await transactionDone(transaction);
      return display;
    }
    async load(slot) {
      const safeSlot = validateSlot(slot);
      const database = await openDatabase().catch(() => null);
      const record = database ? await request(database.transaction(STORES.SAVES).objectStore(STORES.SAVES).get(safeSlot)) : memorySaves.get(safeSlot);
      if (!record) return null;
      if (![SAVE_SCHEMA, "black-souls-st-save-v1"].includes(record.schema)) throw new Error(`Unsupported save schema: ${record.schema}`);
      return structuredClone(record.state);
    }
    async has(slot) {
      const safeSlot = validateSlot(slot);
      const database = await openDatabase().catch(() => null);
      return database ? Boolean(await request(database.transaction(STORES.SAVES).objectStore(STORES.SAVES).getKey(safeSlot))) : memorySaves.has(safeSlot);
    }
    async any() {
      return (await this.list()).some((entry) => !entry.empty);
    }
    async list() {
      const database = await openDatabase().catch(() => null);
      const records = database ? await request(database.transaction(STORES.SAVES).objectStore(STORES.SAVES).getAll()) : [...memorySaves.values()];
      const bySlot = new Map(records.map((record) => [Number(record.slot), record]));
      return Array.from({ length: SAVE_SLOT_COUNT }, (_, index) => {
        const slot = index + 1;
        const record = bySlot.get(slot);
        if (!record) return { slot, empty: true };
        return { ...record.metadata ?? makeDisplayMetadata(slot, record.state, record.savedAt), slot, empty: false, schema: record.schema };
      });
    }
    async latestSlot() {
      const records = (await this.list()).filter((entry) => !entry.empty);
      return records.sort((a, b) => Date.parse(b.savedAt ?? 0) - Date.parse(a.savedAt ?? 0))[0]?.slot ?? 1;
    }
    async export(slot) {
      const safeSlot = validateSlot(slot);
      const database = await openDatabase().catch(() => null);
      const record = database ? await request(database.transaction(STORES.SAVES).objectStore(STORES.SAVES).get(safeSlot)) : memorySaves.get(safeSlot);
      if (!record) throw new Error(`Save slot ${safeSlot} is empty.`);
      return JSON.stringify({ format: "black-souls-browser-save-export-v1", exportedAt: (/* @__PURE__ */ new Date()).toISOString(), record }, null, 2);
    }
    async import(serialized, targetSlot = null) {
      const payload = typeof serialized === "string" ? JSON.parse(serialized) : serialized;
      if (payload?.format !== "black-souls-browser-save-export-v1" || !payload.record?.state) throw new Error("Unsupported BLACK SOULS save export.");
      const slot = validateSlot(targetSlot ?? payload.record.slot);
      return this.save(slot, structuredClone(payload.record.state), payload.record.metadata ?? {});
    }
    async setting(key, value) {
      const database = await openDatabase().catch(() => null);
      if (arguments.length === 1) {
        if (!database) return memorySettings.get(String(key));
        return (await request(database.transaction(STORES.SETTINGS).objectStore(STORES.SETTINGS).get(String(key))))?.value;
      }
      const record = { key: String(key), value };
      if (!database) {
        memorySettings.set(String(key), value);
        return value;
      }
      await request(database.transaction(STORES.SETTINGS, "readwrite").objectStore(STORES.SETTINGS).put(record));
      return value;
    }
  };
  var databasePromise;
  var memorySaves = /* @__PURE__ */ new Map();
  var memoryMetadata = /* @__PURE__ */ new Map();
  var memorySettings = /* @__PURE__ */ new Map();
  function openDatabase() {
    if (!globalThis.indexedDB?.open) return Promise.reject(new Error("IndexedDB is unavailable."));
    if (!databasePromise) {
      databasePromise = new Promise((resolve, reject) => {
        const opening = globalThis.indexedDB.open(SAVE_DATABASE, DATABASE_VERSION);
        opening.onupgradeneeded = () => {
          const database = opening.result;
          if (!database.objectStoreNames.contains(STORES.SAVES)) database.createObjectStore(STORES.SAVES, { keyPath: "slot" });
          if (!database.objectStoreNames.contains(STORES.METADATA)) database.createObjectStore(STORES.METADATA, { keyPath: "slot" });
          if (!database.objectStoreNames.contains(STORES.SETTINGS)) database.createObjectStore(STORES.SETTINGS, { keyPath: "key" });
        };
        opening.onsuccess = () => resolve(opening.result);
        opening.onerror = () => reject(opening.error);
        opening.onblocked = () => reject(new Error("Save database upgrade is blocked by another BLACK SOULS tab."));
      });
    }
    return databasePromise;
  }
  function makeDisplayMetadata(slot, state = {}, savedAt = (/* @__PURE__ */ new Date()).toISOString(), overrides = {}) {
    const actorId = state.party?.members?.[0];
    const actor = state.actors?.[actorId] ?? {};
    return {
      slot,
      playerName: normalizeText(overrides.playerName ?? actor.name ?? ""),
      level: Number(overrides.level ?? actor.level ?? 1),
      playtimeSeconds: Number(overrides.playtimeSeconds ?? state.system?.playtimeSeconds ?? state.playtimeSeconds ?? 0),
      location: normalizeText(overrides.location ?? state.mapName ?? `Map ${String(state.mapId ?? 0).padStart(3, "0")}`),
      mapId: Number(state.mapId ?? 0),
      x: Number(state.x ?? 0),
      y: Number(state.y ?? 0),
      partyCharacters: (state.party?.members ?? []).map((id) => {
        const member = state.actors?.[id] ?? {};
        return { actorId: id, characterName: member.characterName ?? "", characterIndex: Number(member.characterIndex ?? 0) };
      }),
      savedAt
    };
  }
  function validateSlot(value) {
    const slot = Number(value);
    if (!Number.isInteger(slot) || slot < 1 || slot > SAVE_SLOT_COUNT) throw new RangeError(`Save slot must be between 1 and ${SAVE_SLOT_COUNT}.`);
    return slot;
  }
  function normalizeText(value) {
    return String(value ?? "").normalize("NFC");
  }
  function request(value) {
    return new Promise((resolve, reject) => {
      value.onsuccess = () => resolve(value.result);
      value.onerror = () => reject(value.error);
    });
  }
  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error("Save transaction was aborted."));
    });
  }

  // sillytavern-port/runtime/host.js
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
          <button data-action="export-save" title="Export browser save">Export Save</button>
          <button data-action="import-save" title="Import browser save">Import Save</button>
          <button data-action="exit" title="Exit to SillyTavern">Exit to SillyTavern</button>
          <button data-action="diagnostics" aria-expanded="false" title="Developer diagnostics">⋯</button>
          <input data-bs-save-import type="file" accept="application/json,.json" hidden>
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
        const saves = new SaveStore({ runtimeVersion: this.manifest.version, dataVersion: this.manifest.data.schema });
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
          if (action === "export-save") await this.exportSaveFile();
          if (action === "import-save") this.root.querySelector("[data-bs-save-import]")?.click();
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
      this.onSaveImport = async (event) => {
        const file = event.target.files?.[0];
        if (!file || !this.engine) return;
        try {
          await this.engine.importSave(await file.text());
          this.setStatus("Đã nhập dữ liệu lưu.");
        } catch (error) {
          this.setStatus(error.message, true);
        } finally {
          event.target.value = "";
        }
      };
      this.root.querySelector("[data-bs-save-import]")?.addEventListener("change", this.onSaveImport);
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
    async exportSave(slot) {
      return this.engine.exportSave(slot);
    }
    async importSave(serialized, slot) {
      return this.engine.importSave(serialized, slot);
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
      this.root?.querySelector("[data-bs-save-import]")?.removeEventListener("change", this.onSaveImport);
      document.removeEventListener("fullscreenchange", this.onFullscreenChange);
      if (document.fullscreenElement === this.root) await document.exitFullscreen?.();
      await this.engine?.destroy();
      this.setLifecycle("UNMOUNT");
      this.root?.remove();
    }
    async exportSaveFile() {
      if (!this.engine) return;
      const serialized = await this.engine.exportSave();
      const blob = new Blob([serialized], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `Black_Souls_Save_${String(this.engine.lastSaveSlot ?? 1).padStart(2, "0")}.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      this.setStatus("Đã xuất dữ liệu lưu.");
    }
  };
  var styles = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; }
  body { margin: 0; background: #000; color: #e9e5dd; font: 14px/1.4 Arial, "Noto Sans", "Segoe UI", sans-serif; }
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

  // sillytavern-port/runtime/bootstrap.js
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
    exportSave: (slot) => activeHost?.exportSave(slot),
    importSave: (serialized, slot) => activeHost?.importSave(serialized, slot),
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
