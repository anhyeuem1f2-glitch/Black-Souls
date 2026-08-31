# Inventory and Equipment Compatibility

Version 0.5.0 replaces the prior menu placeholders with persistent party data backed by the original Items, Weapons, Armors, Actors, and Classes databases.

Implemented behavior includes 0–99 item stacks, gold, consumable use, HP/MP/TP and state effects, item/weapon/armor event grants and removals, shop purchase/sale, class/actor equip permissions, parameter recalculation, equip/unequip inventory transfer, actor EXP/level/skills, and save/load normalization.

The custom equipment script `114-装備拡張.rb` is represented for actors 1–4 with slots `[weapon, shield, head, body, accessory, accessory, accessory, accessory]`. Armor part/type restrictions and class feature permissions are enforced. The Item, Equip, Status, Shop, and Synthesis scenes expose the resulting state in the browser UI.

The synthesis configuration comes from `120-アイテム合成.rb`: all 15 recipes are indexed. Recipe unlock calls (`recipe_all_switch_on`, kind-specific unlocks), material/gold checks, consumption, and result grants are persisted.

Automated regressions cover stacking, consumption, actor targeting, eight-slot permissions, stat changes, unequip return, buying, selling, recipe unlock, material consumption, synthesis output, and structured-clone/save normalization.

Known limits: item formulas/common-event item effects, optimized equipment, key-item selection, quantity selection UI, and every plugin-specific note tag are not yet equivalent to the Ruby runtime. The compatibility audit remains explicit about these gaps.
