# Save Format

Current schema: `black-souls-st-save-v1`, stored in IndexedDB database `black-souls-sillytavern`, object store `saves`, keyed by numeric slot.

Each record contains `slot`, `schema`, `savedAt`, and a structured-cloned state containing map/position/direction, switches, variables, self switches, transparency, and compatibility state added by supported plugins.

This schema is intentionally versioned but not yet original-save compatible. Before compatibility is claimed it must add party, inventory, actors, equipment, states, timers, vehicles, common-event interpreter stacks, screen/picture state, RNG state where needed, and every covered custom plugin state. Future migrations must be explicit and preserve the prior record until the migrated save is validated.
