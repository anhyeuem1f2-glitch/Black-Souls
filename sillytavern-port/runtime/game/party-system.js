const PARAM_NAMES = ['mhp', 'mmp', 'atk', 'def', 'mat', 'mdf', 'agi', 'luk'];
const STORE_NAMES = { item: 'items', weapon: 'weapons', armor: 'armors' };
const DATABASE_NAMES = { item: 'items', weapon: 'weapons', armor: 'armors' };

export class PartySystem {
  constructor(database, configuration = {}) {
    this.database = database;
    this.configuration = configuration;
    this.recipes = configuration?.synthesis?.recipes ?? [];
    this.recipeMap = new Map(this.recipes.map((recipe) => [`${recipe.kind}:${recipe.id}`, recipe]));
  }

  initialState() {
    const members = [...(this.database.system?.party_members ?? [1])];
    return {
      party: { members, gold: 0, inventory: { items: {}, weapons: {}, armors: {} }, recipes: { item: {}, weapon: {}, armor: {} } },
      actors: Object.fromEntries(this.database.actors.filter(Boolean).map((actor) => [actor.id, this.createActor(actor)])),
    };
  }

  createActor(actor) {
    const level = Math.max(1, Number(actor.initial_level) || 1);
    const equips = this.initialEquips(actor);
    const state = {
      id: actor.id, name: actor.name, classId: actor.class_id, level, exp: 0, hp: 1, mp: 0, tp: 0,
      nickname: actor.nickname ?? '', description: actor.description ?? '',
      characterName: actor.character_name ?? '', characterIndex: Number(actor.character_index) || 0,
      faceName: actor.face_name ?? '', faceIndex: Number(actor.face_index) || 0,
      states: [], skills: this.initialSkills(actor.class_id, level), equips,
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
    return [...(this.configuration?.equipment?.actorSlotOverrides?.[actorId] ?? [0, 1, 2, 3, 4])];
  }

  initialEquips(actor) {
    const slots = this.equipSlots(actor.id);
    const result = slots.map((etypeId) => ({ etypeId, kind: etypeId === 0 ? 'weapon' : 'armor', id: 0 }));
    for (let databaseIndex = 0; databaseIndex < (actor.equips ?? []).length; databaseIndex += 1) {
      const id = Number(actor.equips[databaseIndex]) || 0;
      if (!id) continue;
      const kind = databaseIndex === 0 ? 'weapon' : 'armor';
      const item = this.data(kind, id);
      const etypeId = kind === 'weapon' ? 0 : Number(item?.etype_id ?? databaseIndex);
      const slot = result.find((entry) => entry.etypeId === etypeId && !entry.id);
      if (slot) Object.assign(slot, { kind, id });
    }
    return result;
  }

  normalizeState(state) {
    state.party ??= { members: [...(this.database.system?.party_members ?? [1])], gold: 0, inventory: { items: {}, weapons: {}, armors: {} }, recipes: { item: {}, weapon: {}, armor: {} } };
    state.party.inventory ??= { items: {}, weapons: {}, armors: {} };
    state.party.recipes ??= { item: {}, weapon: {}, armor: {} };
    for (const actorData of this.database.actors.filter(Boolean)) {
      state.actors[actorData.id] ??= this.createActor(actorData);
      const actor = state.actors[actorData.id];
      actor.id ??= actorData.id; actor.classId ??= actorData.class_id; actor.level ??= actorData.initial_level || 1; actor.exp ??= 0;
      actor.nickname ??= actorData.nickname ?? ''; actor.description ??= actorData.description ?? '';
      actor.characterName ??= actorData.character_name ?? ''; actor.characterIndex ??= Number(actorData.character_index) || 0;
      actor.faceName ??= actorData.face_name ?? ''; actor.faceIndex ??= Number(actorData.face_index) || 0;
      actor.states ??= []; actor.skills ??= this.initialSkills(actor.classId, actor.level); actor.equips ??= this.initialEquips(actorData);
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

  gainGold(state, amount) { state.party.gold = clamp((Number(state.party.gold) || 0) + Number(amount), 0, 99_999_999); return state.party.gold; }

  useItem(state, itemId, actorId = state.party.members[0]) {
    const item = this.data('item', itemId);
    const actor = state.actors[actorId];
    if (!item || !actor || this.quantity(state, 'item', itemId) < 1) return { used: false, reason: 'unavailable' };
    const before = { hp: actor.hp, mp: actor.mp, tp: actor.tp, states: [...actor.states] };
    const parameters = this.parameters(state, actorId);
    for (const effect of item.effects ?? []) this.applyItemEffect(actor, parameters, effect);
    if (item.consumable) this.gain(state, 'item', itemId, -1);
    return { used: true, itemId, actorId, before, after: { hp: actor.hp, mp: actor.mp, tp: actor.tp, states: [...actor.states] }, remaining: this.quantity(state, 'item', itemId) };
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
    const etypeId = kind === 'weapon' ? 0 : Number(item.etype_id);
    if (slot.etypeId !== etypeId) return false;
    const actorData = this.database.actors[actorId];
    const klass = this.database.classes[actor.classId];
    const features = [...(actorData?.features ?? []), ...(klass?.features ?? [])];
    const permissionCode = kind === 'weapon' ? 51 : 52;
    const typeId = kind === 'weapon' ? item.wtype_id : item.atype_id;
    return features.some((feature) => feature.code === permissionCode && feature.data_id === typeId);
  }

  equip(state, actorId, slotIndex, kind, id, { force = false } = {}) {
    const actor = state.actors[actorId];
    const slot = actor?.equips?.[slotIndex];
    if (!slot) return { equipped: false, reason: 'slot' };
    if (id && !force && (this.quantity(state, kind, id) < 1 || !this.canEquip(state, actorId, kind, id, slotIndex))) return { equipped: false, reason: 'restriction' };
    const previous = { kind: slot.kind, id: slot.id };
    if (previous.id && !force) this.gain(state, previous.kind, previous.id, 1);
    if (id && !force) this.gain(state, kind, id, -1);
    slot.kind = kind;
    slot.id = Number(id) || 0;
    const parameters = this.parameters(state, actorId);
    actor.hp = Math.min(actor.hp, parameters.mhp); actor.mp = Math.min(actor.mp, parameters.mmp);
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
    return Object.fromEntries(PARAM_NAMES.map((name, index) => [name, Math.max(name === 'mhp' ? 1 : 0, Math.floor(values[index]))]));
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
      actor.hp = parameters.mhp; actor.mp = parameters.mmp;
    }
    return { previousLevel, level: actor.level, exp: actor.exp };
  }

  maxLevel(actorId) {
    const actor = this.database.actors[actorId];
    const bonus = Number(/<レベル限界増加:(\d+)>/.exec(String(actor?.note ?? ''))?.[1] ?? 0);
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
    if (!recipe) return { crafted: false, reason: 'recipe' };
    if (!state.party.recipes[kind]?.[id]) return { crafted: false, reason: 'locked' };
    const count = Math.max(1, Math.floor(amount));
    if (state.party.gold < recipe.gold * count) return { crafted: false, reason: 'gold' };
    if (recipe.materials.some((material) => this.quantity(state, material.kind, material.id) < material.amount * count)) return { crafted: false, reason: 'materials' };
    this.gainGold(state, -recipe.gold * count);
    for (const material of recipe.materials) this.gain(state, material.kind, material.id, -material.amount * count);
    this.gain(state, kind, id, count);
    return { crafted: true, kind, id, amount: count };
  }

  buy(state, kind, id, amount = 1, price = this.data(kind, id)?.price ?? 0) {
    const count = Math.max(1, Math.floor(amount)); const total = Math.max(0, Number(price) || 0) * count;
    if (state.party.gold < total || !this.data(kind, id)) return { bought: false, reason: state.party.gold < total ? 'gold' : 'item' };
    this.gainGold(state, -total); this.gain(state, kind, id, count);
    return { bought: true, kind, id, amount: count, total };
  }

  sell(state, kind, id, amount = 1) {
    const count = Math.max(1, Math.floor(amount));
    if (this.quantity(state, kind, id) < count) return { sold: false, reason: 'quantity' };
    const total = Math.floor(Number(this.data(kind, id)?.price ?? 0) / 2) * count;
    this.gain(state, kind, id, -count); this.gainGold(state, total);
    return { sold: true, kind, id, amount: count, total };
  }

  inventoryEntries(state, kinds = ['item', 'weapon', 'armor']) {
    return kinds.flatMap((kind) => (
      Object.entries(state.party.inventory[STORE_NAMES[kind]] ?? {})
        .filter(([, amount]) => amount > 0)
        .map(([id, amount]) => ({ kind, id: Number(id), amount, data: this.data(kind, Number(id)) }))
    ))
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.id - b.id);
  }

  data(kind, id) { return this.database[DATABASE_NAMES[kind]]?.[Number(id)] ?? null; }
}

function tableParameter(table, paramId, level) {
  const xsize = Number(table?.xsize ?? 8);
  const safeLevel = clamp(Math.floor(level), 0, Math.max(0, Number(table?.ysize ?? 100) - 1));
  return Number(table?.data?.[paramId + safeLevel * xsize] ?? 0);
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value) || 0)); }

export { PARAM_NAMES };
