export const MAX_AP = 4000;
export const FRAME_AP_GAIN = 10;
export const REFRESH_FRAME = 3;
export const DIFFICULTY_VARIABLE_ID = 60;
export const START_AP_RATES = Object.freeze({ preemptive: [40, 30], normal: [30, 40], surprise: [0, 10], escapeFailed: [0, 10] });
const NO_MIRROR_TROOPS = new Set([136,137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,165,166,167,168,169,170,171,176,177,178,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,220,221,222,223,224,225,69,70,71,72,73,134,226,227,228,229,231,232,233,235,236,240,26,164,255,256,257,263,135,289,304,305,306,307,308,309,310,311,312,313,259,260,317,318,314,315,172]);
const NO_ZOOM_TROOPS = new Set([153, 26]);

// Ported from Scripts/162-周回敵の強さ.rb. The source uses `to_i` for
// parameters and `round` for rewards, so those two rounding rules stay distinct.
export const DIFFICULTY_RATES = Object.freeze({
  mhp: [1.0, 1.5, 1.7, 2.0, 2.2, 2.5, 2.7, 3.0, 6.0, 7.0],
  mmp: [1.0, 1.5, 1.7, 2.0, 2.2, 2.5, 2.7, 3.0, 3.5, 7.0],
  atk: [1.0, 1.5, 1.7, 2.0, 2.2, 2.5, 2.7, 3.0, 6.0, 7.0],
  def: [1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.2, 2.4, 3.0, 4.0],
  mat: [1.0, 1.5, 1.7, 2.0, 2.2, 2.5, 2.7, 3.0, 6.0, 7.0],
  mdf: [1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.2, 2.4, 3.0, 4.0],
  agi: [1.0, 1.5, 1.7, 2.0, 2.2, 2.5, 2.7, 3.0, 6.0, 7.0],
  luk: [1.0, 1.5, 1.7, 2.0, 2.2, 2.5, 2.7, 3.0, 3.5, 4.0],
  exp: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  gold: [1.0, 1.5, 1.7, 2.0, 2.2, 2.5, 2.7, 3.0, 4.5, 6.0],
  drop: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  critical: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
});

export class CombatSystem {
  constructor(database, partySystem, diagnostic = () => {}) {
    this.database = database;
    this.party = partySystem;
    this.diagnostic = diagnostic;
  }

  createBattle(state, troopId, { canEscape = false, canLose = false, battleback1 = '', battleback2 = '', preemptive = false, surprise = false, encounter = null } = {}) {
    const troop = this.database.troops[troopId];
    if (!troop) throw new Error(`Unknown troop ${troopId}.`);
    const actors = state.party.members.map((actorId, index) => {
      const actor = state.actors[actorId];
      const parameters = this.party.parameters(state, actorId);
      return {
        side: 'actor', index, actorId, name: actor.name || this.database.actors[actorId]?.name || `Actor ${actorId}`,
        hp: actor.hp, mp: actor.mp, tp: actor.tp, states: [...actor.states], parameters,
        hit: 0.95, eva: 0.05, cri: 0.04, faceName: actor.faceName ?? this.database.actors[actorId]?.face_name ?? '', faceIndex: actor.faceIndex ?? this.database.actors[actorId]?.face_index ?? 0,
        ap: 0, chant: null, guarding: false, turnCount: 1,
      };
    });
    const difficulty = difficultyIndex(state);
    const enemies = (troop.members ?? []).filter((member) => !member.hidden).map((member, index) => {
      const enemy = this.database.enemies[member.enemy_id];
      const parameters = scaledEnemyParameters(enemy?.params ?? [], difficulty);
      return {
        side: 'enemy', index, enemyId: enemy.id, name: enemy.name, battlerName: enemy.battler_name,
        x: member.x, y: member.y, hp: parameters.mhp, mp: parameters.mmp, tp: 0, states: [], parameters,
        hit: Number(enemy.hit ?? 95) / 100, eva: Number(enemy.eva ?? 5) / 100, cri: Number(enemy.cri ?? 4) / 100,
        ap: 0, chant: null, guarding: false, turnCount: 1,
      };
    });
    const battle = {
      troopId, troopName: troop.name, canEscape, canLose, battleback1, battleback2,
      preemptive: Boolean(preemptive), surprise: Boolean(surprise), encounter: encounter ? structuredClone(encounter) : null,
      phase: 'running', actors, enemies, selectedCommand: 0, selectedTarget: 0, commands: [], commandDefinitions: [],
      log: [`${troop.name} appeared.`], frames: 0, escapeAttempts: 0, result: null, rngSeed: (0x9e3779b9 ^ troopId ^ (difficulty << 16)) >>> 0,
      difficulty, compatibility: { maxAp: MAX_AP, frameApGain: FRAME_AP_GAIN, refreshFrame: REFRESH_FRAME, smartEnemyAi: true, casting: true, castInterruption: true, dynamicActorCommands: true, difficultyVariable: DIFFICULTY_VARIABLE_ID, symbolContactCondition: true },
      mistEnabled: !state.switches?.[5], endRecoveryApplied: false,
    };
    for (const enemy of enemies) {
      const visualSeed = (Number(troopId) * 1103515245 + Number(enemy.enemyId) * 12345 + enemy.index * 2654435761) >>> 0;
      enemy.mirror = !NO_MIRROR_TROOPS.has(Number(troopId)) && visualSeed % 3 === 0;
      enemy.perspectiveScale = NO_ZOOM_TROOPS.has(Number(troopId)) ? 1 : (Number(enemy.y) - 480 * 0.65) * 0.005 + 1;
      enemy.breathPeriod = 150 + visualSeed % 30;
      enemy.breathOffset = (visualSeed >>> 8) % enemy.breathPeriod;
    }
    const actorMode = preemptive ? 1 : surprise ? -1 : 0; const enemyMode = -actorMode;
    for (const actor of actors) actor.ap = this.startAp(state, actor, actorMode, battle);
    for (const enemy of enemies) enemy.ap = this.startAp(state, enemy, enemyMode, battle);
    return battle;
  }

  update(state, frames = 1) {
    const battle = state.battle;
    if (!battle || battle.result || battle.phase === 'actor-command' || battle.phase === 'target') return battle?.result ?? null;
    for (let frame = 0; frame < frames && !battle.result; frame += 1) {
      battle.frames += 1;
      for (const battler of [...battle.actors, ...battle.enemies]) {
        if (battler.hp <= 0 || (!battler.chant && battler.ap >= MAX_AP)) continue;
        if (battle.frames % REFRESH_FRAME !== 0) continue;
        const point = this.apGainPoint(state, battler, Boolean(battler.chant)) * REFRESH_FRAME;
        if (battler.chant) battler.chant.elapsed = Math.min(battler.chant.total, battler.chant.elapsed + point);
        else battler.ap = Math.min(MAX_AP, battler.ap + point);
      }
      const completedChant = [...battle.actors, ...battle.enemies].find((entry) => entry.hp > 0 && entry.chant && entry.chant.elapsed >= entry.chant.total);
      if (completedChant) { this.resolveChant(state, completedChant); this.checkResult(state); continue; }
      const actor = battle.actors.find((entry) => entry.hp > 0 && !entry.chant && entry.ap >= MAX_AP);
      if (actor) {
        battle.phase = 'actor-command'; battle.activeActor = actor.index; battle.commandDefinitions = this.actorCommands(state, actor); battle.commands = battle.commandDefinitions.map((command) => command.name); battle.selectedCommand = 0; break;
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
    if (!battle || battle.phase !== 'actor-command' || !actor || actor.hp <= 0) return { accepted: false };
    if (symbol === 'escape') return this.escape(state);
    if (symbol === 'guard') {
      actor.guarding = true; this.finishAction(state, actor, this.database.skills[2]); battle.phase = 'running'; battle.log.push(`${actor.name} defended.`); return { accepted: true };
    }
    if (symbol === 'item') {
      const itemId = Number(payload.itemId); const item = this.database.items[itemId];
      if (!item || this.party.quantity(state, 'item', itemId) < 1) return { accepted: false, reason: 'unavailable' };
      const targets = this.targetsForSkill(battle, actor, item, targetIndex); const result = targets.map((target) => this.applySkill(state, actor, target, item));
      if (item.consumable) this.party.gain(state, 'item', itemId, -1);
      this.applyUserEffect(state, actor, item); this.finishAction(state, actor, item); battle.phase = 'running'; battle.log.push(`${actor.name} used ${item.name}.`); this.checkResult(state); return { accepted: true, result };
    }
    const skillId = symbol === 'skill' ? Number(payload.skillId) : this.attackSkillId(state, actor.actorId);
    const skill = this.database.skills[skillId];
    if (!skill) return { accepted: false, reason: 'skill' };
    if (actor.mp < Number(skill.mp_cost ?? 0) || actor.tp < Number(skill.tp_cost ?? 0)) return { accepted: false, reason: 'cost' };
    actor.mp -= Number(skill.mp_cost ?? 0); actor.tp -= Number(skill.tp_cost ?? 0);
    const chant = chantMetadata(skill.note);
    if (chant) {
      const total = Math.max(1, chant.base + randomIntInclusive(battle, chant.random));
      actor.chant = { skillId, targetIndex, type: chant.type, elapsed: 0, total };
      battle.phase = 'running'; battle.log.push(`${actor.name} began casting ${skill.name}.`);
      return { accepted: true, chanting: true };
    }
    const targets = this.targetsForSkill(battle, actor, skill, targetIndex);
    const result = [];
    for (let repeat = 0; repeat < Math.max(1, Number(skill.repeats) || 1); repeat += 1) for (const target of targets) result.push(this.applySkill(state, actor, target, skill));
    this.applyUserEffect(state, actor, skill);
    actor.tp = Math.min(100, actor.tp + Number(skill.tp_gain ?? 0)); this.syncActor(state, actor);
    this.finishAction(state, actor, skill); actor.guarding = false; battle.phase = 'running'; this.checkResult(state);
    return { accepted: true, result };
  }

  attackSkillId(state, actorId) {
    const battler = state.battle?.actors?.find((entry) => entry.actorId === actorId) ?? { side: 'actor', actorId, states: state.actors[actorId]?.states ?? [] };
    const candidates = this.featureObjects(state, battler).flatMap((object) => [...String(object.note ?? '').matchAll(/<攻撃ID変更[：:](\d+)>/g)].map((match) => Number(match[1])));
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
    if (enemy.mp < Number(skill.mp_cost ?? 0) || enemy.tp < Number(skill.tp_cost ?? 0)) { enemy.ap = 0; return; }
    enemy.mp -= Number(skill.mp_cost ?? 0); enemy.tp -= Number(skill.tp_cost ?? 0);
    const chant = chantMetadata(skill.note);
    if (chant) {
      const total = Math.max(1, chant.base + randomIntInclusive(battle, chant.random));
      enemy.chant = { skillId: skill.id, targetIndex: target.index, type: chant.type, elapsed: 0, total };
      battle.log.push(`${enemy.name} began casting ${skill.name}.`); return;
    }
    for (let repeat = 0; repeat < Math.max(1, Number(skill.repeats) || 1); repeat += 1) for (const resolved of this.targetsForSkill(battle, enemy, skill, target.index)) this.applySkill(state, enemy, resolved, skill);
    this.applyUserEffect(state, enemy, skill);
    enemy.tp = Math.min(100, enemy.tp + Number(skill.tp_gain ?? 0));
    this.finishAction(state, enemy, skill); enemy.guarding = false;
  }

  selectEnemyAction(state, enemy, actions) {
    const battle = state.battle; const data = this.database.enemies[enemy.enemyId];
    let forced = actions.filter((action) => Number(action.rating) === 10 && this.skillUsable(enemy, this.database.skills[action.skill_id]));
    const exclusions = actions.filter((action) => Number(action.rating) === 1 && this.skillUsable(enemy, this.database.skills[action.skill_id]));
    if (String(data?.note ?? '').includes('賢くランダム')) forced = shuffleWithBattle(forced, battle);
    for (const action of forced) {
      const skill = this.database.skills[action.skill_id]; const targets = this.smartTargets(state, enemy, action, skill, exclusions);
      if (targets.length) return { ...action, _smartTargets: targets };
    }
    const candidates = actions.filter((action) => ![1, 10].includes(Number(action.rating)) && this.actionCondition(state, enemy, action) && this.skillUsable(enemy, this.database.skills[action.skill_id]));
    if (!candidates.length) return actions.find((action) => Number(action.skill_id) === 1) ?? actions[0];
    const ratingMax = Math.max(...candidates.map((action) => Number(action.rating) || 0)); const ratingZero = ratingMax - 3;
    const weighted = candidates.filter((action) => Number(action.rating) > ratingZero); const sum = weighted.reduce((total, action) => total + Number(action.rating) - ratingZero, 0);
    let roll = Math.floor(nextRandom(battle) * Math.max(1, sum));
    for (const action of weighted) { roll -= Number(action.rating) - ratingZero; if (roll < 0) return action; }
    return weighted.at(-1);
  }

  actionCondition(state, enemy, action) {
    const rate = enemy.hp / Math.max(1, enemy.parameters.mhp);
    const mpRate = enemy.mp / Math.max(1, enemy.parameters.mmp);
    const type = Number(action.condition_type); const p1 = Number(action.condition_param1); const p2 = Number(action.condition_param2);
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
    const chant = battler.chant; battler.chant = null;
    const skill = this.database.skills[chant.skillId];
    const targets = this.targetsForSkill(battle, battler, skill, chant.targetIndex);
    for (let repeat = 0; repeat < Math.max(1, Number(skill.repeats) || 1); repeat += 1) for (const target of targets) if (target?.hp > 0) this.applySkill(state, battler, target, skill);
    this.applyUserEffect(state, battler, skill);
    this.finishAction(state, battler, skill);
  }

  targetsForSkill(battle, subject, skill, targetIndex = 0) {
    const scope = Number(skill?.scope ?? 1); const allies = subject.side === 'actor' ? battle.actors : battle.enemies; const opponents = subject.side === 'actor' ? battle.enemies : battle.actors;
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
    if (!target || (target.hp <= 0 && ![9, 10].includes(Number(skill?.scope)))) return null;
    const physical = Number(skill.hit_type ?? 0) === 1;
    const hitChance = Math.max(0, Math.min(1, Number(skill.success_rate ?? 100) / 100 * (physical ? subject.hit ?? 0.95 : 1) * (1 - (target.eva ?? 0))));
    if (nextRandom(state.battle) >= hitChance) { state.battle.log.push(`${subject.name} used ${skill.name}, but missed ${target.name}.`); return { skillId: skill.id, missed: true }; }
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
    if (damageType === 3) this.applyRecovery(state, target, 'hp', amount);
    if (damageType === 4) this.applyRecovery(state, target, 'mp', amount);
    if (damageType === 5) subject.hp = Math.min(subject.parameters.mhp, subject.hp + Math.max(0, before - target.hp));
    if (damageType === 6) subject.mp = Math.min(subject.parameters.mmp, subject.mp + amount);
    for (const effect of skill.effects ?? []) {
      if (effect.code === 11) this.applyRecovery(state, target, 'hp', Math.floor(target.parameters.mhp * Number(effect.value1 || 0) + Number(effect.value2 || 0)));
      if (effect.code === 12) this.applyRecovery(state, target, 'mp', Math.floor(target.parameters.mmp * Number(effect.value1 || 0) + Number(effect.value2 || 0)));
      if (effect.code === 13) target.tp = clamp(target.tp + Math.floor(100 * Number(effect.value1 || 0) + Number(effect.value2 || 0)), 0, 100);
      if (effect.code === 21 && nextRandom(state.battle) < Math.max(0, Number(effect.value1) || 0) && !target.states.includes(effect.data_id)) {
        target.states.push(effect.data_id); this.applyStateApControl(state, target, Number(effect.data_id));
      }
      if (effect.code === 22 && nextRandom(state.battle) < Math.max(0, Number(effect.value1) || 0)) target.states = target.states.filter((id) => id !== effect.data_id);
    }
    if (target.hp <= 0) this.tryAutoResurrection(state, target);
    this.syncActor(state, target);
    const dealt = Math.max(0, before - target.hp);
    state.battle.log.push(`${critical ? 'Critical! ' : ''}${subject.name} used ${skill.name}: ${dealt} damage to ${target.name}.`);
    return { skillId: skill.id, subject: subject.name, target: target.name, damage: dealt, hp: target.hp, critical };
  }

  tryAutoResurrection(state, target) {
    for (const object of this.featureObjects(state, target)) {
      for (const match of String(object.note ?? '').matchAll(/<自動蘇生[：:]([^>]+)>/g)) {
        const [hpExpression, animationText, chanceExpression = '100'] = match[1].split(/\s*,\s*/);
        const chance = recoveryExpression(chanceExpression, target, state.variables);
        if (chance <= nextRandom(state.battle) * 100) continue;
        const hp = Math.floor(recoveryExpression(hpExpression, target, state.variables));
        if (hp <= 0) continue;
        target.hp = clamp(hp, 1, target.parameters.mhp);
        target.resurrectionAnimationId = Number(animationText) || 0;
        this.breakResurrectionFeature(state, target, object);
        state.battle.log.push(`${target.name} resurrected with ${target.hp} HP.`);
        return true;
      }
    }
    return false;
  }

  breakResurrectionFeature(state, target, feature) {
    const match = /<自動蘇生破損[：:]([^>]+)>/.exec(String(feature.note ?? ''));
    if (!match || recoveryExpression(match[1], target, state.variables) <= nextRandom(state.battle) * 100) return;
    const stateId = target.states.find((id) => this.database.states[id] === feature);
    if (stateId) target.states = target.states.filter((id) => id !== stateId);
    if (target.side === 'actor') {
      const actor = state.actors[target.actorId]; const equip = actor.equips.find((entry) => entry.id && this.party.data(entry.kind, entry.id) === feature);
      if (equip) Object.assign(equip, { id: 0 });
    }
  }

  applyRecovery(state, target, kind, amount) {
    if (amount <= 0) return;
    const notes = this.featureNotes(state, target); const prefix = kind === 'hp' ? 'HP' : 'MP';
    const voidChance = notes.reduce((sum, note) => sum + noteNumber(note, new RegExp(`<${prefix}回復無効[：:](\\d+)>`), 0), 0);
    const reverseChance = notes.reduce((sum, note) => sum + noteNumber(note, new RegExp(`<${prefix}回復反転[：:](\\d+)>`), 0), 0);
    if (voidChance > nextRandom(state.battle) * 100) return;
    const reverse = reverseChance > nextRandom(state.battle) * 100;
    const maximum = kind === 'hp' ? target.parameters.mhp : target.parameters.mmp;
    target[kind] = reverse ? Math.max(0, target[kind] - amount) : Math.min(maximum, target[kind] + amount);
  }

  applyUserEffect(state, subject, object) {
    const match = /<使用者効果\s*(\d+)\s*>/.exec(String(object?.note ?? '')); if (!match || subject.hp <= 0) return;
    const reaction = this.database.skills[Number(match[1])]; if (reaction) this.applySkill(state, subject, subject, reaction);
  }

  escape(state) {
    const battle = state.battle;
    if (!battle.canEscape) return { accepted: false, reason: 'disabled' };
    battle.escapeAttempts += 1;
    const actorAgi = average(battle.actors.filter((entry) => entry.hp > 0).map((entry) => entry.parameters.agi));
    const enemyAgi = average(battle.enemies.filter((entry) => entry.hp > 0).map((entry) => entry.parameters.agi));
    if (battle.escapeAttempts > 1 || actorAgi >= enemyAgi) { battle.result = 'escape'; battle.phase = 'finished'; this.applyBattleEndRecovery(state, battle); return { accepted: true, escaped: true }; }
    for (const actor of battle.actors) actor.ap = this.startAp(state, actor, 2, battle);
    battle.phase = 'running'; battle.log.push('Escape failed.'); return { accepted: true, escaped: false };
  }

  checkResult(state) {
    const battle = state.battle;
    if (battle.enemies.every((entry) => entry.hp <= 0)) {
      battle.result = 'victory'; battle.phase = 'finished';
      const defeated = battle.enemies.map((entry) => this.database.enemies[entry.enemyId]);
      const difficulty = battle.difficulty ?? difficultyIndex(state);
      battle.rewards = {
        exp: defeated.reduce((sum, enemy) => sum + scaledReward(enemy, 'exp', difficulty), 0),
        gold: defeated.reduce((sum, enemy) => sum + scaledReward(enemy, 'gold', difficulty), 0),
        drops: defeated.flatMap((enemy) => this.rollDrops(state, enemy, difficulty)),
      };
      this.party.gainGold(state, battle.rewards.gold);
      for (const drop of battle.rewards.drops) this.party.gain(state, drop.kind, drop.id, 1);
      for (const actor of battle.actors) this.party.gainExp(state, actor.actorId, battle.rewards.exp);
      this.applyBattleEndRecovery(state, battle);
    } else if (battle.actors.every((entry) => entry.hp <= 0)) { battle.result = battle.canLose ? 'lose' : 'gameover'; battle.phase = 'finished'; this.applyBattleEndRecovery(state, battle); }
    return battle.result;
  }

  rollDrops(state, enemy, difficulty) {
    const kinds = { 1: 'item', 2: 'weapon', 3: 'armor' }; const rate = DIFFICULTY_RATES.drop[difficulty];
    return (enemy.drop_items ?? []).flatMap((drop) => {
      const kind = kinds[drop.kind]; if (!kind || !drop.data_id) return [];
      return nextRandom(state.battle) < rate / Math.max(1, Number(drop.denominator) || 1) ? [{ kind, id: Number(drop.data_id) }] : [];
    });
  }

  applyBattleEndRecovery(state, battle) {
    if (battle.endRecoveryApplied) return; battle.endRecoveryApplied = true;
    for (const battler of battle.actors) {
      const actor = state.actors[battler.actorId];
      const notes = this.featureNotes(state, battler).join('\n'); const parameters = this.party.parameters(state, battler.actorId);
      for (const match of notes.matchAll(/<戦闘終了後HP回復[：:]([^>]+)>/g)) actor.hp = clamp(actor.hp + Math.floor(recoveryExpression(match[1], { ...battler, parameters }, state.variables)), 0, parameters.mhp);
      for (const match of notes.matchAll(/<戦闘終了後MP回復[：:]([^>]+)>/g)) actor.mp = clamp(actor.mp + Math.floor(recoveryExpression(match[1], { ...battler, parameters }, state.variables)), 0, parameters.mmp);
      for (const match of notes.matchAll(/<戦闘終了後TP回復[：:]([^>]+)>/g)) actor.tp = clamp(actor.tp + Math.floor(recoveryExpression(match[1], { ...battler, parameters }, state.variables)), 0, 100);
      for (const match of notes.matchAll(/<戦闘終了後ステート解除[：:]([^>]+)>/g)) actor.states = actor.states.filter((id) => id !== Math.floor(recoveryExpression(match[1], { ...battler, parameters }, state.variables)));
      Object.assign(battler, { hp: actor.hp, mp: actor.mp, tp: actor.tp, states: [...actor.states] });
    }
  }

  syncActor(state, battler) {
    if (battler.side !== 'actor') return;
    const actor = state.actors[battler.actorId];
    Object.assign(actor, { hp: battler.hp, mp: battler.mp, tp: battler.tp, states: [...battler.states] });
  }

  startAp(state, battler, mode, battle) {
    const rates = mode === 1 ? START_AP_RATES.preemptive : mode === -1 ? START_AP_RATES.surprise : mode === 2 ? START_AP_RATES.escapeFailed : START_AP_RATES.normal;
    let base = rates[0]; let range = rates[1];
    for (const note of this.featureNotes(state, battler)) {
      const modeText = mode === 2 ? null : String(mode);
      const pattern = modeText == null ? /<逃走ＡＰ=\[(\-?\d+),(\-?\d+)\]>/g : new RegExp(`<開始ＡＰ=${modeText.replace('-', '\\-')},\\[(\\-?\\d+),(\\-?\\d+)\\]>`, 'g');
      for (const match of note.matchAll(pattern)) { base += Number(match[1]); range += Number(match[2]); }
    }
    base = clamp(base, 0, 100); range = clamp(range, 0, 100);
    return Math.floor(MAX_AP * (base + randomIntInclusive(battle, range)) / 100);
  }

  apGainPoint(state, battler, chanting) {
    let plus = 0; let agiRate = 1; let frameRate = 1; const type = battler.chant?.type;
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
    const next = nextApMetadata(object?.note); battler.ap = Math.floor(MAX_AP * (next.base + randomIntInclusive(state.battle, next.random)) / 100);
    battler.turnCount = Number(battler.turnCount ?? 1) + 1; battler.chant = null;
    this.syncActor(state, battler);
  }

  actorCommands(state, battler) {
    const terms = this.database.system?.terms?.commands ?? []; const definitions = [{ name: terms[2] || 'Attack', symbol: 'attack', ext: null }];
    const features = this.featureObjects(state, battler).flatMap((object) => object?.features ?? []);
    const sealed = new Set(features.filter((feature) => Number(feature.code) === 42).map((feature) => Number(feature.data_id)));
    const skillTypes = [...new Set(features.filter((feature) => Number(feature.code) === 41).map((feature) => Number(feature.data_id)))].filter((id) => !sealed.has(id)).sort((a, b) => a - b);
    for (const id of skillTypes) definitions.push({ name: this.database.system?.skill_types?.[id] || `${terms[5] || 'Skill'} ${id}`, symbol: 'skill', ext: id });
    definitions.push({ name: terms[3] || 'Defend', symbol: 'guard', ext: null }, { name: terms[4] || 'Item', symbol: 'item', ext: null }, { name: terms[1] || 'Escape', symbol: 'escape', ext: null });
    return definitions;
  }

  featureObjects(state, battler) {
    if (battler.side === 'enemy') return [this.database.enemies[battler.enemyId], ...battler.states.map((id) => this.database.states[id])].filter(Boolean);
    const actor = state.actors[battler.actorId]; const data = this.database.actors[battler.actorId];
    return [data, this.database.classes[data?.class_id], ...(actor?.equips ?? []).map((entry) => entry.id ? this.party.data(entry.kind, entry.id) : null), ...(actor?.states ?? []).map((id) => this.database.states[id])].filter(Boolean);
  }

  featureNotes(state, battler) { return this.featureObjects(state, battler).map((object) => String(object.note ?? '')); }
  skillUsable(battler, skill) { return Boolean(skill) && battler.hp > 0 && battler.mp >= Number(skill.mp_cost ?? 0) && battler.tp >= Number(skill.tp_cost ?? 0); }

  smartTargets(state, enemy, action, skill, exclusions) {
    const scope = Number(skill?.scope ?? 0); const targets = scope >= 1 && scope <= 6 ? state.battle.actors : scope >= 7 && scope <= 10 ? state.battle.enemies : [];
    if (!targets.length || ![2, 3, 4].includes(Number(action.condition_type))) return [];
    return targets.filter((target) => target.hp > 0 && targetCondition(target, action)).filter((target) => exclusions.every((blocked) => !targetCondition(target, blocked))).map((target) => target.index);
  }

  applyStateApControl(state, target, stateId) {
    const note = String(this.database.states[stateId]?.note ?? '');
    if (target.chant && /<詠唱キャンセル>/.test(note)) { target.chant = null; state.battle.log.push(`${target.name}'s casting was interrupted.`); }
    const chant = /<詠唱増減=(0|1),\[(\-?\d+),(\d+)\]>/.exec(note);
    if (target.chant && chant) { const value = target.chant.total * (Number(chant[2]) + randomIntInclusive(state.battle, Number(chant[3]))) / 100; target.chant.elapsed = clamp(chant[1] === '0' ? value : target.chant.elapsed + value, 0, target.chant.total); }
    const ap = /<ＡＰ増減=(0|1),\[(\-?\d+),(\d+)\]>/.exec(note);
    if (!target.chant && ap) { const value = MAX_AP * (Number(ap[2]) + randomIntInclusive(state.battle, Number(ap[3]))) / 100; target.ap = clamp(ap[1] === '0' ? value : target.ap + value, 0, MAX_AP); }
  }
}

function chantMetadata(note = '') {
  const source = String(note); const exact = /<詠唱=(\d+),\[(\-?\d+),(\d+)\]>/.exec(source);
  if (exact) return { type: Number(exact[1]), base: Number(exact[2]), random: Number(exact[3]), frames: Math.max(1, Number(exact[2]) + Math.floor(Number(exact[3]) / 2)) };
  const match = /<(?:(?:詠唱)|chant)[：:]\s*(\d+)(?:\s*,\s*(\d+))?>/i.exec(source);
  if (!match) return null;
  return { type: 0, base: Number(match[1]), random: Number(match[2] ?? 0), frames: Math.max(1, Number(match[1]) + Math.floor(Number(match[2] ?? 0) / 2)) };
}
function evaluateFormula(formula = '0', subject, target, variables = {}) {
  let expression = String(formula)
    .replace(/\ba\.(mhp|mmp|atk|def|mat|mdf|agi|luk)\b/g, (_, key) => String(Number(subject[key]) || 0))
    .replace(/\bb\.(mhp|mmp|atk|def|mat|mdf|agi|luk)\b/g, (_, key) => String(Number(target[key]) || 0))
    .replace(/\ba\.(hp|mp|tp)\b/g, (_, key) => String(Number(subject[key]) || 0))
    .replace(/\bb\.(hp|mp|tp)\b/g, (_, key) => String(Number(target[key]) || 0))
    .replace(/\bv\[(\d+)\]/g, (_, id) => String(Number(variables[id]) || 0));
  if (!/^[\d\s+\-*/%().]+$/.test(expression)) return 0;
  try { return Number(Function(`"use strict"; return (${expression});`)()) || 0; } catch { return 0; }
}
function parameterObject(values) { return Object.fromEntries(['mhp', 'mmp', 'atk', 'def', 'mat', 'mdf', 'agi', 'luk'].map((name, index) => [name, Number(values[index] ?? 0)])); }
function difficultyIndex(state) { return Math.max(0, Math.min(9, Math.floor(Number(state?.variables?.[DIFFICULTY_VARIABLE_ID]) || 0))); }
function scaledEnemyParameters(values, difficulty) {
  const raw = parameterObject(values);
  return Object.fromEntries(Object.entries(raw).map(([name, value]) => [name, Math.floor(value * DIFFICULTY_RATES[name][difficulty])]));
}
function scaledReward(enemy, kind, difficulty) {
  const raw = Number(enemy?.[kind] ?? 0);
  const disabled = kind === 'exp' ? /<経験値変動無効>/.test(String(enemy?.note ?? '')) : /<お金変動無効>/.test(String(enemy?.note ?? ''));
  return disabled ? raw : Math.round(raw * DIFFICULTY_RATES[kind][difficulty]);
}
function nextRandom(battle) {
  let value = Number(battle?.rngSeed ?? 0x9e3779b9) >>> 0;
  value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
  if (battle) battle.rngSeed = value >>> 0;
  return (value >>> 0) / 0x1_0000_0000;
}
function randomIntInclusive(battle, max) { return Math.floor(nextRandom(battle) * (Math.max(0, Number(max) || 0) + 1)); }
function nextApMetadata(note = '') { const match = /<行動後ＡＰ=\[(\d+),(\d+)\]>/.exec(String(note)); return match ? { base: Number(match[1]), random: Number(match[2]) } : { base: 0, random: 0 }; }
function attackSkillPriority(skill) { const match = /<攻撃ID優先度変更[：:](\-?\d+)>/.exec(String(skill?.note ?? '')); return Number(match?.[1]) || 0; }
function recoveryExpression(source, battler, variables = {}) {
  const parameters = battler?.parameters ?? {}; let expression = String(source)
    .replace(/\bself\.(mhp|mmp|hp|mp|tp|max_tp)\b/g, (_, key) => String(key === 'max_tp' ? 100 : Number(parameters[key] ?? battler?.[key]) || 0))
    .replace(/\b(mhp|mmp|max_tp|hp|mp|tp)\b/g, (_, key) => String(key === 'max_tp' ? 100 : Number(parameters[key] ?? battler?.[key]) || 0))
    .replace(/\$game_variables\[(\d+)\]/g, (_, id) => String(Number(variables[id]) || 0));
  if (!/^[\d\s+\-*/%().]+$/.test(expression)) return 0;
  try { return Number(Function(`"use strict"; return (${expression});`)()) || 0; } catch { return 0; }
}
function noteNumber(note, pattern, fallback) { const match = pattern.exec(note); return match ? Number(match[1]) : fallback; }
function notePercent(note, pattern, fallback) { const match = pattern.exec(note); return match ? Number(match[1]) * 0.01 : fallback; }
function chantTypeIncluded(note, type) { const match = /<詠唱敏捷タイプ=\[([\d,]+)\]>/.exec(note); return !match || match[1].split(',').map(Number).includes(Number(type)); }
function targetCondition(target, action) { const type = Number(action.condition_type); const p1 = Number(action.condition_param1); const p2 = Number(action.condition_param2); if (type === 2) { const rate = target.hp / Math.max(1, target.parameters.mhp); return rate >= p1 && rate <= p2; } if (type === 3) { const rate = target.mp / Math.max(1, target.parameters.mmp); return rate >= p1 && rate <= p2; } if (type === 4) return target.states.includes(p1); return false; }
function shuffleWithBattle(entries, battle) { const result = [...entries]; for (let index = result.length - 1; index > 0; index -= 1) { const other = Math.floor(nextRandom(battle) * (index + 1)); [result[index], result[other]] = [result[other], result[index]]; } return result; }
function pickAlive(entries, battle) { const alive = entries.filter((entry) => entry.hp > 0); return alive[Math.floor(nextRandom(battle) * alive.length)]; }
function average(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

export { attackSkillPriority, chantMetadata, difficultyIndex, evaluateFormula, nextApMetadata, recoveryExpression, scaledEnemyParameters, scaledReward };
