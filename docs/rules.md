# SketchQuest rules, versions 1 and 2

Reach the exit by moving one cell up, right, down, or left. There is no diagonal movement, pulling, or pushing of multiple crates. Moves are counted equally; a push is also a move and additionally increments the push counter.

Existing puzzles retain `schemaVersion: 1, rulesVersion: 1` and their exact behavior. Expedition puzzles use the same schema with `rulesVersion: 2`, adding water, bridges, ice, collectible relics, and a third crate. Share import, editing, gameplay, solving, and replay all validate and retain the declared version. The original three examples and prepared 6→10 move demonstration are unchanged.

## Board and initial state

Boards have 4–8 rows and 4–8 columns. In version 1, every cell has exactly one terrain value: floor, wall, key, locked door, or exit. Occupants are separate: one player position and zero, one, or two distinct crate positions. The player cannot share a cell with a crate. There is exactly one exit, at most one key, and at most one door. Any door requires a key somewhere on the board; a key without a door is valid. Version 2 permits the four additional terrains below and up to three crates, with at most four relics.

Player and crate occupants may start on floor, key, or exit terrain. Starting on a wall or locked door is invalid. A player starting on a key immediately possesses it; a player starting on the exit has already won with zero moves. A crate starting on a key does not collect it. These layered states can be created with the editor; an ambiguous photograph showing overlapping occupant glyphs requires correction.

Disconnected terrain is structurally valid. It may be irrelevant, or it may make the exit unreachable. Structural validation does not guess solvability. Out-of-range positions, duplicate crates, overlapping occupants, missing/duplicate required symbols, unknown terrain, unsupported versions, and incomplete arrays are rejected at acceptance and import boundaries.

## A directional action

1. A completed session rejects further moves until restart or a different revision is selected.
2. Check the adjacent player destination. Boundaries, walls, and a door without an already-held key block movement.
3. If a crate occupies the adjacent cell, check the cell one further in the same direction. It must be inside the board, traversable with the player's **pre-move** key possession, and free of another crate. Move that one crate forward.
4. Move the player into the adjacent cell. Collect the key if that cell contains it; possession is permanent for the session.
5. Reaching exit terrain wins. Successful actions count one move, and successful crate pushes additionally count one push.

Invalid actions leave state unchanged and do not increment either counter. Undoing play or restarting reconstructs state from the accepted revision and retained valid moves; a restart does not permanently remove a previously collected key from the board definition.

## Layered terrain edge cases

| Situation                                                                         | Result                                                                                                     |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Push a crate onto a key                                                           | The key stays underneath. The crate does not collect it.                                                   |
| Push a crate off a covered key                                                    | The player enters the vacated key cell and collects it.                                                    |
| Push that covered-key crate into a locked door without already possessing the key | Blocked. A key that would be collected during the attempted move cannot authorize the push.                |
| Push a crate onto a door after collecting the key                                 | Allowed if the destination is otherwise unoccupied. The door remains passable for the rest of the session. |
| Push a crate off a covered exit                                                   | The player enters the exit and wins, if the crate push is legal.                                           |
| Reach a key after it was previously collected                                     | Possession remains true; terrain need not be mutated.                                                      |
| A crate is stuck in a corner                                                      | The game may still be solvable. Crates have no target squares and do not need to reach any destination.    |
| Attempt to enter a crate with another crate immediately behind it                 | Blocked. Two crates cannot be pushed together.                                                             |
| Attempt a horizontal move at the edge of a row                                    | Blocked; cell-index arithmetic never wraps into the next row.                                              |
| Replay contains an invalid action or a move after winning                         | Replay stops at the last legal state and returns `valid: false`.                                           |

## Editor and revision semantics

### Expedition mechanics (version 2)

| Terrain | Behavior                                                                                                                                                   |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Water   | Impassable for both player and crates. Neither occupant can start here. Water does not consume crates or turn into a bridge.                               |
| Bridge  | Walkable by the player and crates. A bridge is a complete terrain cell, with the crossing modeled by neighboring water cells.                              |
| Ice     | Entering ice slides the player in the chosen direction until entering the first non-ice cell or stopping before an obstacle. The entire input is one move. |
| Relic   | Collected permanently by the player. Every relic on the accepted board must be collected before reaching the exit can win.                                 |

Ice slides stop before boundaries, walls, deep water, a locked door, or any crate. Sliding **never automatically pushes a crate**. A later directional input may push that crate one cell using the ordinary push rules. Crates do not slide: directly pushing one onto ice advances it exactly one cell. If the player enters the vacated ice cell, the pushed crate immediately ahead stops any further slide. A blocked slide leaves the player on the last reached ice cell; the next input can choose another direction. An entirely blocked initial input fails without counting a move. Starting on ice does not trigger movement until a directional input. Ice paths advance strictly along one axis on a finite, non-wrapping board, so they cannot loop.

The first non-ice landing cell applies its normal effect: a key or relic is collected, and an exit wins when all relics are held. Crates can cover relics without collecting them. Pushing a crate off a relic lets the player enter its former cell and collect it. A player starting on a relic immediately collects it. An exit with remaining relics is still walkable and the player may leave it; it is not a win. An expedition with no relics has the original exit condition.

Version 2 state adds `collectedRelics`, a four-bit mask indexed by relic cells in row-major order. Version 1 state omits that field, preserving legacy replay values exactly. Undo and restart reconstruct the mask from the accepted board and retained directional inputs. The board definition never removes collected relic terrain.

### Painting and revision behavior

The player, key, door, and exit palette tools relocate their unique symbol. Relics are independent and do not relocate earlier relics. Painting any expedition terrain or applying an edit containing it upgrades that draft to version 2; removing it later does not silently downgrade the version. Painting an occupant preserves compatible terrain, allowing a crate to cover a key, relic, or exit. Painting a wall, water, or door removes an occupant from that cell. Painting an occupant onto those blocked terrains replaces the terrain with floor. Erase removes the occupant first; another erase removes its underlying special terrain. Crate limits and required-symbol constraints can be temporarily violated in a draft so the user can correct it; invalid drafts cannot become accepted playable boards.

Resizing preserves the top-left cell coordinates. Cropped player/exit/key/door symbols remain missing and are flagged rather than silently re-created. Literal AI cell edits replace the listed terrain and occupant; duplicate edited cells and multiple new player placements are invalid. A newly placed player relocates the old player. The patched board still requires full validation.

Accepting a changed board creates a new revision and starts a fresh play session. Previously collected keys, move history, and verification do not transfer to a different board. The previous revision remains available. A proposed interpretation is a draft until accepted.

## Deterministic solving and replay

Gameplay, BFS, and replay use the same pure transition function. BFS searches the full state: player cell, canonical sorted crate cells, key possession, and (for version 2) the collected relic mask. It minimizes **directional inputs**, not pushes, cells crossed, or subjective difficulty. Equal-length ties use Up, Right, Down, Left order. Do not prune corner crates as automatic deadlocks; an immovable crate may be irrelevant to reaching the exit.

The version 1 maximum loose state count for 64 cells and two crates is `64 × C(63, 2) × 2 = 249,984`. Version 2 has a larger theoretical space due to the third crate and up to 16 relic masks. Both versions retain default budgets of 250,000 discovered states and 5,000 ms. Sparse discovered-state storage avoids allocating the entire theoretical space. Search runs in a Worker and yields cooperatively so cancellation can be handled. The public outcomes are:

- `solved`: a shortest-move path, replay-checked through the shared rules, plus counts and statistics.
- `unsolvable`: only after all reachable states have been explored.
- `inconclusive`: a time budget, state budget, or cancellation stopped the search.

Each job carries its own job ID, revision ID, and canonical board identity. Results from an earlier revision or cancelled job must not update a newer board. A replay being syntactically valid is insufficient for verification: it must also reach the exit. To claim that an edit made the shortest solution longer, both original and proposed **initial boards** must have solved shortest paths and the proposed length must be strictly larger.

## Prepared expeditions

Six local examples provide new routes without requiring live AI. The source metadata is exported separately as `EXPEDITIONS` so original `EXAMPLES` indices remain stable. Their shortest directional-input counts are checked in tests, and every returned path is replayed to confirm that all relics were collected and the exit reached.

| Theme  | Expedition       | Grid  | Shortest inputs | Features                                                                 |
| ------ | ---------------- | ----- | --------------- | ------------------------------------------------------------------------ |
| Forest | Relic grove      | 6 × 6 | 8               | Two relics, a courtyard detour, one crate                                |
| Forest | Warden’s gate    | 7 × 7 | 15              | A required keyed passage, three crates, two relics                       |
| Coast  | Tidal crossing   | 6 × 6 | 11              | Water divides the shores; one bridge connects both relics                |
| Coast  | Smuggler’s cove  | 8 × 8 | 25              | Multiple crossings, three relics, a required key and gate                |
| Frost  | Frozen footsteps | 6 × 6 | 6               | Two relics connected by sliding ice lanes                                |
| Frost  | Winter vault     | 8 × 8 | 13              | Sliding ice, two crates, water, a bridge, a keyed shortcut, three relics |
