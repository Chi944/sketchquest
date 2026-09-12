# Fixed failure: sparse arrays bypassed board validation

During independent rule/validation testing, a board with a missing terrain element passed structural validation. The array still had the expected length, and the required exit was present. A similar issue affected sparse crate-position arrays.

The original implementation used `terrain.forEach(...)` and `crates.some(...)` to inspect entries. JavaScript skips holes in both methods, so a missing value was never checked. This was a real reproduced implementation failure, not a hypothetical example: the regression assertion expecting a `terrain_type` issue failed with `expected false to be true` before the fix.

## Reproduction

```ts
const board = emptyBoard(4, 4);
const terrain = [...board.terrain];
delete terrain[2];

// Before the fix, the absent cell could escape per-entry validation.
validateBoard({ ...board, terrain });

// A sparse crate array had the same skipped-entry problem.
validateBoard({ ...board, crates: Array(1) });
```

JSON cannot directly encode sparse arrays, so ordinary JSON uploads were not the primary entry point for this exact shape. Local JavaScript transformations or restored in-memory data could still produce it. Letting an undefined terrain value reach movement rules would violate the invariant that every cell has a recognized terrain type.

## Correction and evidence

The validator now checks `Array.from(terrain)` and `Array.from(crates)`. Holes become explicit `undefined` entries and fail the existing terrain/position checks. Parsing continues to reject any board with validation issues.

The regression lives in `src/core/board.test.ts`, in “validates the full symbol and occupancy rules.” It verifies both the missing terrain cell and the sparse crate array. The test failed before the change and passed after it; the full owned core/solver suite then passed 26 tests. Run `npx vitest run src/core/board.test.ts` to reproduce the protection.

The lesson is narrow and practical: length checks plus array callbacks do not guarantee that every JavaScript array position was inspected. Validation at shared-data and local-draft boundaries must account for the language's actual array semantics.
