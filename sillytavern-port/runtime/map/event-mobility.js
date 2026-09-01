export const EVENT_MOBILITY = Object.freeze({
  STATIC_PROP: 'STATIC_PROP',
  STATIC_DECORATION: 'STATIC_DECORATION',
  INTERACTABLE_STATIC: 'INTERACTABLE_STATIC',
  AUTONOMOUS_RANDOM: 'AUTONOMOUS_RANDOM',
  AUTONOMOUS_APPROACH: 'AUTONOMOUS_APPROACH',
  CUSTOM_ROUTE: 'CUSTOM_ROUTE',
  SYMBOL_ENEMY: 'SYMBOL_ENEMY',
  CUTSCENE_ACTOR: 'CUTSCENE_ACTOR',
  OTHER: 'OTHER',
});

const OBJECT_GRAPHIC = /^(?:!|14遺体|Damage|Door|Gate|Chest)|(?:corpse|blood|bottle|遺体|死体|血|瓶)/i;

export function symbolIdFromMoveRoute(page) {
  for (const command of page?.move_route?.list ?? []) {
    if (Number(command.code) !== 45) continue;
    const match = /(?:^|\s)enable_symbol_encount\((\d+)\)/.exec(String(command.parameters?.[0] ?? ''));
    if (match) return Number(match[1]);
  }
  return null;
}

export function classifyEventPage(event, page) {
  if (!page) return { classification: EVENT_MOBILITY.OTHER, evidence: ['missing page'] };
  const moveType = Number(page.move_type) || 0;
  const graphic = page.graphic ?? {};
  const name = String(graphic.character_name ?? '');
  const tileId = Number(graphic.tile_id) || 0;
  const trigger = Number(page.trigger);
  const symbolId = symbolIdFromMoveRoute(page);
  const routeCodes = (page.move_route?.list ?? []).map((command) => Number(command.code));
  const eventCodes = (page.list ?? []).map((command) => Number(command.code));
  const hasEventBody = eventCodes.some((code) => code !== 0);
  const hasForcedRoute = eventCodes.includes(205);
  const evidence = [
    `move_type=${moveType}`,
    `trigger=${Number.isFinite(trigger) ? trigger : 'none'}`,
    `graphic=${name || (tileId ? `tile:${tileId}` : 'none')}`,
    `route_codes=[${routeCodes.join(',')}]`,
  ];

  if (symbolId != null) return { classification: EVENT_MOBILITY.SYMBOL_ENEMY, symbolId, evidence: [...evidence, `enable_symbol_encount(${symbolId})`] };
  if (moveType === 1) return { classification: EVENT_MOBILITY.AUTONOMOUS_RANDOM, symbolId: null, evidence };
  if (moveType === 2) return { classification: EVENT_MOBILITY.AUTONOMOUS_APPROACH, symbolId: null, evidence };
  if (moveType === 3) return { classification: EVENT_MOBILITY.CUSTOM_ROUTE, symbolId: null, evidence };
  if ((trigger === 3 || trigger === 4) && (name || hasForcedRoute)) return { classification: EVENT_MOBILITY.CUTSCENE_ACTOR, symbolId: null, evidence: [...evidence, hasForcedRoute ? 'event command 205' : `trigger=${trigger}`] };
  if (tileId > 0 || OBJECT_GRAPHIC.test(name)) {
    const classification = hasEventBody && trigger === 0 ? EVENT_MOBILITY.INTERACTABLE_STATIC : EVENT_MOBILITY.STATIC_PROP;
    return { classification, symbolId: null, evidence: [...evidence, tileId > 0 ? 'tile graphic' : 'object/corpse graphic'] };
  }
  if (hasEventBody && trigger === 0) return { classification: EVENT_MOBILITY.INTERACTABLE_STATIC, symbolId: null, evidence: [...evidence, 'action-trigger event body'] };
  if (name) return { classification: EVENT_MOBILITY.STATIC_DECORATION, symbolId: null, evidence: [...evidence, 'visible fixed page'] };
  return { classification: EVENT_MOBILITY.OTHER, symbolId: null, evidence: [...evidence, hasEventBody ? 'invisible event controller' : 'empty page'] };
}

export function isAutonomousMobility(classification) {
  return [
    EVENT_MOBILITY.AUTONOMOUS_RANDOM,
    EVENT_MOBILITY.AUTONOMOUS_APPROACH,
    EVENT_MOBILITY.CUSTOM_ROUTE,
    EVENT_MOBILITY.SYMBOL_ENEMY,
  ].includes(classification);
}
