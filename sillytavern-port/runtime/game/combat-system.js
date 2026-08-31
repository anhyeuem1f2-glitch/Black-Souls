export const MAX_AP = 4000;
export const FRAME_AP_GAIN = 10;
export const DIFFICULTY_VARIABLE_ID = 60;

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
        hit: 0.95, eva: 0.05, cri: 0.04,
        ap: Math.floor(MAX_AP * 0.30), chant: null, guarding: false,
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
        ap: Math.floor(MAX_AP * 0.40), chant: null, guarding: false,
      };
    });
    if (preemptive) for (const enemy of enemies) enemy.ap = 0;
    if (surprise) for (const actor of actors) actor.ap = 0;
    return {
      troopId, troopName: troop.name, canEscape, canLose, battleback1, battleback2,
      preemptive: Boolean(preemptive), surprise: Boolean(surprise), encounter: encounter ? structuredClone(encounter) : null,
      phase: 'running', actors, enemies, selectedCommand: 0, selectedTarget: 0, commands: ['Attack', 'Skills', 'Items', 'Defend', 'Escape'],
      log: [`${troop.name} appeared.`], frames: 0, escapeAttempts: 0, result: null, rngSeed: (0x9e3779b9 ^ troopId ^ (difficulty << 16)) >>> 0,
      difficulty, compatibility: { maxAp: MAX_AP, frameApGain: FRAME_AP_GAIN, smartEnemyAi: true, casting: true, castInterruption: true, difficultyVariable: DIFFICULTY_VARIABLE_ID, symbolContactCondition: true },
    };
  }

  update(state, frames = 1) {
    const battle = state.battle;
    if (!battle || battle.result || battle.phase === 'actor-command' || battle.phase === 'target') return battle?.result ?? null;
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
      if (actor) { battle.phase = 'actor-command'; battle.activeActor = actor.index; break; }
      const enemy = battle.enemies.find((entry) => entry.hp > 0 && entry.ap >= MAX_AP);
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
      actor.guarding = true; actor.ap = 0; battle.phase = 'running'; battle.log.push(`${actor.name} defended.`); return { accepted: true };
    }
    if (symbol === 'item') {
      const result = this.party.useItem(state, Number(payload.itemId), actor.actorId);
      if (!result.used) return { accepted: false, reason: result.reason };
      Object.assign(actor, { hp: state.actors[actor.actorId].hp, mp: state.actors[actor.actorId].mp, tp: state.actors[actor.actorId].tp, states: [...state.actors[actor.actorId].states] });
      actor.ap = 0; battle.phase = 'running'; battle.log.push(`${actor.name} used ${this.database.items[payload.itemId]?.name}.`); return { accepted: true, result };
    }
    const skillId = symbol === 'skill' ? Number(payload.skillId) : this.attackSkillId(state, actor.actorId);
    const skill = this.database.skills[skillId];
    if (!skill) return { accepted: false, reason: 'skill' };
    if (actor.mp < Number(skill.mp_cost ?? 0) || actor.tp < Number(skill.tp_cost ?? 0)) return { accepted: false, reason: 'cost' };
    actor.mp -= Number(skill.mp_cost ?? 0); actor.tp -= Number(skill.tp_cost ?? 0);
    const chant = chantMetadata(skill.note);
    if (chant) {
      actor.chant = { skillId, targetIndex, remaining: chant.frames, total: chant.frames };
      actor.ap = 0; battle.phase = 'running'; battle.log.push(`${actor.name} began casting ${skill.name}.`);
      return { accepted: true, chanting: true };
    }
    const targets = this.targetsForSkill(battle, actor, skill, targetIndex);
    const result = [];
    for (let repeat = 0; repeat < Math.max(1, Number(skill.repeats) || 1); repeat += 1) for (const target of targets) result.push(this.applySkill(state, actor, target, skill));
    actor.tp = Math.min(100, actor.tp + Number(skill.tp_gain ?? 0)); this.syncActor(state, actor);
    actor.ap = 0; actor.guarding = false; battle.phase = 'running'; this.checkResult(state);
    return { accepted: true, result };
  }

  attackSkillId(state, actorId) {
    const actor = state.actors[actorId];
    for (const equipped of actor?.equips ?? []) {
      if (equipped.kind !== 'weapon' || !equipped.id) continue;
      const match = /<攻撃ID変更:(\d+)>/.exec(String(this.database.weapons[equipped.id]?.note ?? ''));
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
    if (enemy.mp < Number(skill.mp_cost ?? 0) || enemy.tp < Number(skill.tp_cost ?? 0)) { enemy.ap = 0; return; }
    enemy.mp -= Number(skill.mp_cost ?? 0); enemy.tp -= Number(skill.tp_cost ?? 0);
    const chant = chantMetadata(skill.note);
    if (chant) {
      enemy.chant = { skillId: skill.id, targetIndex: target.index, remaining: chant.frames, total: chant.frames };
      enemy.ap = 0; battle.log.push(`${enemy.name} began casting ${skill.name}.`); return;
    }
    for (let repeat = 0; repeat < Math.max(1, Number(skill.repeats) || 1); repeat += 1) for (const resolved of this.targetsForSkill(battle, enemy, skill, target.index)) this.applySkill(state, enemy, resolved, skill);
    enemy.tp = Math.min(100, enemy.tp + Number(skill.tp_gain ?? 0));
    enemy.ap = 0; enemy.guarding = false;
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
    const chant = battler.chant; battler.chant = null;
    const skill = this.database.skills[chant.skillId];
    const targets = this.targetsForSkill(battle, battler, skill, chant.targetIndex);
    for (let repeat = 0; repeat < Math.max(1, Number(skill.repeats) || 1); repeat += 1) for (const target of targets) if (target?.hp > 0) this.applySkill(state, battler, target, skill);
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
    if (!target || target.hp <= 0) return null;
    const physical = Number(skill.hit_type ?? 0) === 1;
    const hitChance = Math.max(0, Math.min(1, Number(skill.success_rate ?? 100) / 100 * (physical ? subject.hit ?? 0.95 : 1) * (1 - (target.eva ?? 0))));
    if (nextRandom(state.battle) >= hitChance) { state.battle.log.push(`${subject.name} used ${skill.name}, but missed ${target.name}.`); return { skillId: skill.id, missed: true }; }
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
    state.battle.log.push(`${critical ? 'Critical! ' : ''}${subject.name} used ${skill.name}: ${dealt} damage to ${target.name}.`);
    return { skillId: skill.id, subject: subject.name, target: target.name, damage: dealt, hp: target.hp, critical };
  }

  tryAutoResurrection(target) {
    const stateId = target.states.find((id) => /<自動蘇生:/.test(String(this.database.states[id]?.note ?? '')));
    if (!stateId) return false;
    const match = /<自動蘇生:([^,>]+),/.exec(String(this.database.states[stateId]?.note ?? ''));
    const value = Number(match?.[1] ?? 0);
    target.hp = Math.max(1, value > 100 ? value : Math.floor(target.parameters.mhp * value / 100));
    target.states = target.states.filter((id) => id !== stateId);
    return true;
  }

  escape(state) {
    const battle = state.battle;
    if (!battle.canEscape) return { accepted: false, reason: 'disabled' };
    battle.escapeAttempts += 1;
    const actorAgi = average(battle.actors.filter((entry) => entry.hp > 0).map((entry) => entry.parameters.agi));
    const enemyAgi = average(battle.enemies.filter((entry) => entry.hp > 0).map((entry) => entry.parameters.agi));
    if (battle.escapeAttempts > 1 || actorAgi >= enemyAgi) { battle.result = 'escape'; battle.phase = 'finished'; return { accepted: true, escaped: true }; }
    for (const actor of battle.actors) actor.ap = Math.floor(MAX_AP * 0.10);
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
    } else if (battle.actors.every((entry) => entry.hp <= 0)) { battle.result = battle.canLose ? 'lose' : 'gameover'; battle.phase = 'finished'; }
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
    for (const battler of battle.actors) {
      const actor = state.actors[battler.actorId];
      const notes = [this.database.actors[battler.actorId]?.note, ...actor.equips.map((entry) => entry.id ? this.party.data(entry.kind, entry.id)?.note : ''), ...actor.states.map((id) => this.database.states[id]?.note)].join('\n');
      for (const match of notes.matchAll(/<戦闘終了後HP回復:(\d+)>/g)) actor.hp = Math.min(this.party.parameters(state, battler.actorId).mhp, actor.hp + Number(match[1]));
      for (const match of notes.matchAll(/<戦闘終了後MP回復:(\d+)>/g)) actor.mp = Math.min(this.party.parameters(state, battler.actorId).mmp, actor.mp + Number(match[1]));
      for (const match of notes.matchAll(/<戦闘終了後ステート解除:(\d+)>/g)) actor.states = actor.states.filter((id) => id !== Number(match[1]));
    }
  }

  syncActor(state, battler) {
    if (battler.side !== 'actor') return;
    const actor = state.actors[battler.actorId];
    Object.assign(actor, { hp: battler.hp, mp: battler.mp, tp: battler.tp, states: [...battler.states] });
  }
}

function chantMetadata(note = '') {
  const match = /<(?:(?:詠唱)|chant)[：:]\s*(\d+)(?:\s*,\s*(\d+))?>/i.exec(String(note));
  if (!match) return null;
  return { frames: Math.max(1, Number(match[1]) + Math.floor(Number(match[2] ?? 0) / 2)) };
}
function evaluateFormula(formula = '0', subject, target, variables = {}) {
  let expression = String(formula)
    .replace(/\ba\.(mhp|mmp|atk|def|mat|mdf|agi|luk)\b/g, (_, key) => String(Number(subject[key]) || 0))
    .replace(/\bb\.(mhp|mmp|atk|def|mat|mdf|agi|luk)\b/g, (_, key) => String(Number(target[key]) || 0))
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
function pickAlive(entries, battle) { const alive = entries.filter((entry) => entry.hp > 0); return alive[Math.floor(nextRandom(battle) * alive.length)]; }
function average(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }

export { chantMetadata, difficultyIndex, evaluateFormula, scaledEnemyParameters, scaledReward };
