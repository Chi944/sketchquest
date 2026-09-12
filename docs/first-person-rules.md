# First-person expeditions: rules version 3

Explore is an eye-level view of the deterministic board used by Map, Grid, editing, solving and sharing. Rendering never decides collisions or collects items. Current authored expeditions use `schemaVersion: 1, rulesVersion: 3`; historical version 1/2 boards retain their original behavior.

## Objects have specific effects

| Object      | Purpose and effect                                                                                                                                                                                          |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brass key   | Walk onto it to collect it. Carry it to the matching gate. It is consumed only when the explorer enters and opens the gate.                                                                                 |
| Locked gate | Blocks progress until approached with the key. Opening sets `doorOpened` permanently. The used key never respawns. Crates can pass only after the explorer opens it.                                        |
| Relic       | Every relic contributes to the exit. All must be collected to awaken the arch. An incomplete exit remains walkable but cannot win.                                                                          |
| Iron boots  | Collected/equipped on entry, retained for the run. Protect from spikes only; cannot make the explorer float.                                                                                                |
| Spikes      | Fatal without boots, safe with boots. Crates cannot enter spikes.                                                                                                                                           |
| Deep water  | Always fatal, including when carrying a key, every relic or boots. Crates cannot enter water or become bridges.                                                                                             |
| Bridge      | Safe ground across surrounding water. Explorer and crates can cross.                                                                                                                                        |
| Ice         | One input glides to solid ground or a blocking obstacle. The landing applies its normal effect: water or unprotected spikes kill; a held key opens a gate. Crates stop a slide; momentum never pushes them. |
| Crate       | Blocks access and may cover an item. Push exactly one square onto safe, unoccupied terrain. Entering the vacated square collects an underlying item. No pulling or pushing two crates.                      |
| Wall / edge | Blocks explorer and crates. Movement never wraps around a row.                                                                                                                                              |

Boards have 4–8 rows/columns, one player and exit, at most one key/door/pair of boots, at most three crates and four relics. A door requires a key. Occupants cannot start on water, spikes, walls or closed doors. Starting on a key, boots or relic immediately collects it. Starting on an exit wins only if no relic remains. A crate never collects items. Structural validity does not imply solvability.

## Death, undo and replay

Hazard entry is a successful counted move with `dead: true` and `deathCause: 'water' | 'spikes'`. It never wins; further movement is rejected. Invalid moves against walls, gates or blocked crates leave state and counters unchanged.

A replay ending on a fatal move is valid; continuing after death is invalid. Undo reconstructs the previous state, restoring life, inventory, crates and gate status. Retry reconstructs the accepted board with all items reset. Nothing is removed from the immutable terrain definition.

Version 3 adds `hasBoots`, `doorOpened` and `dead` to key possession and the relic mask. Only live states enter BFS. Its sparse encoding includes boots and gate status, so an unused key and an opened gate remain distinct. The solver minimizes directional inputs, retains explicit time/state budgets, and replay-verifies each answer. Dead states cannot become solutions.

## Controls and animation

- **Explore:** W/S walk forward/back, A/D strafe, Q/E rotate 90 degrees. Left/right arrows also turn; up/down arrows walk. A compass shows facing; touch controls expose each action.
- **Map / Grid:** arrows and WASD follow absolute board directions. Switching view preserves state/history. Editing/review uses Grid.
- **Interaction:** walk onto an item to collect it. The prompt ahead also offers a named action such as “Take brass key” or “Use key & open gate,” executing that same step.
- **Death:** the camera falls, text identifies the hazard, and Retry expedition / Undo fatal step restore play. Movement is disabled until recovery.

Explore starts facing a safe direction. Relative input converts to an absolute direction before the shared transition. Turning costs no moves. Replay faces its recorded movement. First-person manual movement waits a bounded 650ms for its animation; keyboard auto-repeat is ignored. Reduced motion removes travel/bob/turn interpolation/particles and the input wait, reflecting final state immediately. No pointer lock is needed.

The renderer animates footsteps, ice glides, crate pushes, gloved-hand pickup, item lift/fade, a key reaching the gate, hinge opening, protective equipment, exit awakening, death and recovery. The consumed key stays absent and the gate stays open; undo restores both. The explorer billboard is hidden only in first person. WebGL failure visibly switches to a playable Grid.

## Editing and persistence

Spikes use T, boots B. Boots painting relocates the unique pair. Spikes/boots upgrade a draft to version 3; removing them never downgrades it. Water/bridge/ice/relic upgrade version 1 to version 2. Compatible occupant painting preserves underlying items. Blocked terrain painting removes occupants; painting an occupant onto blocked terrain creates floor. Erase removes the occupant first, then terrain.

Drafts can temporarily violate rules but cannot be accepted until corrected. Import/export, local revisions, parked drafts and both share adapters preserve version 3. Bounded model schemas/prompts describe each version’s actual semantics. Live inference remains disabled on the deployment.

## Authored routes and purpose checks

| Expedition       | Shortest inputs | Required interactions                                                  |
| ---------------- | --------------: | ---------------------------------------------------------------------- |
| Relic grove      |              10 | Key opens the only passage to the relic and exit.                      |
| Warden’s gate    |              18 | Three crate pushes reach boots; cross spikes and open a keyed passage. |
| Tidal crossing   |               9 | Boots protect from spikes; a bridge crosses lethal water.              |
| Smuggler’s cove  |              24 | Boots, exposed crossings, three relics and a required gate.            |
| Frozen footsteps |               8 | Open the ice chamber and equip boots for the exit approach.            |
| Winter vault     |              25 | Two pushes, boots, ice, water, bridge, gate and three relics.          |

Tests replay every shortest route to victory. Causal tests replace each present gate with a wall and remove each present boots item; those modified boards must be unsolvable. Every included crate requires a push. These are authored puzzles and deterministic results, not generated model outputs.
