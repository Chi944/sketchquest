# Evaluation and current evidence

The deterministic rules and solver have measured local results. Live image-extraction accuracy, latency, and model cost have **not been measured**. No extraction calls were made while preparing this corpus. The synthetic SVG drawings are original procedural test assets, not self-drawn photographs, and cannot support claims about handwriting recognition.

## Rules and shortest-path correctness

The core suite contains independently written literal transition examples, a separate small reference solver, and 24 seeded 4 × 4 boards whose shortest distances are cross-checked. Tests cover walls/boundaries, permanent key access, crates covering keys and exits, pre-move door restrictions, invalid pushes, initial key/exit occupancy, exhaustive unsolvability, budgets, cancellation, and Worker job identities. Every production solver result is replayed before it is returned as solved.

The seed for generated reference cross-checks is `0x51e7c`; fixtures and tie-breaking order are fixed. The independent reference implementation does not call the production transition function or packed-state encoder. Matching small fixtures is useful evidence, not a proof that every possible board is implemented correctly.

## Recorded local solver benchmark

[Raw measurement JSON](../eval/reports/solver-local.json) was produced by `scripts/evaluate-solver.ts` on Node v24.19.0, Windows x64. Budgets were 250,000 discovered states and 5,000 ms. Times below are one local run, rounded for readability. They include search setup and cooperative yielding; they are not browser/mobile percentiles or a representative performance distribution.

| Fixture                  | Outcome    | Shortest moves | Pushes on returned path | Explored states | Time (ms) |
| ------------------------ | ---------- | -------------: | ----------------------: | --------------: | --------: |
| The little escape        | Solved     |              6 |                       0 |              28 |      1.47 |
| Under cover              | Solved     |              4 |                       2 |               7 |      1.05 |
| Two’s company            | Solved     |             10 |                       0 |             653 |      2.35 |
| Prepared longer route    | Solved     |             10 |                       3 |              55 |      1.26 |
| Disconnected exit        | Unsolvable |              — |                       — |               8 |      1.21 |
| Open 8 × 8 room          | Solved     |             10 |                       0 |           1,091 |      4.20 |
| Crate-blocked corridor   | Unsolvable |              — |                       — |               1 |      0.99 |
| Open room, isolated exit | Unsolvable |              — |                       — |         214,157 |     72.48 |

All five returned solutions replayed successfully. The three unsolvable outcomes followed exhaustive frontier exhaustion. The prepared edit is a transparent fixture: adding a wall at cell 10 changes the first example's shortest solution from 6 to 10 moves. This demonstrates deterministic comparison; it is not evidence of a live model generating that edit or of a guaranteed increase in human difficulty.

Reproduce with `npm run eval:solver`. State counts and shortest lengths should remain stable; timings will vary with runtime, device, and workload. Budget/cancellation behavior is tested with deliberately small limits. Do not interpret a budget-limited run as unsolvable.

## Extraction corpus and metrics

The committed corpus contains 12 development boards, 12 held-out boards, and six rejected/conflicting cases. All 30 images are **synthetic authored SVG sketches**. Expected boards come from authored ASCII tables, parsed independently of the production ASCII helper and checked by the core validator. Those structural checks are not an independent human annotation review. Source IDs and board contents are disjoint between development and held-out sets; generated rotations of a source must keep its split.

[The offline harness](../eval/README.md) accepts saved outputs using the application's shared `Interpretation` fields. It never calls a model. The committed [extraction report](../eval/reports/extraction-not-run.json) has zero recorded samples; accuracy and unavailable usage/cost values remain `null`.

| Metric                  | Definition                                                                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cell-level accuracy     | Micro-average of cells whose terrain **and** occupant match the expected cell. Wrong dimensions produce zero correct cells.                                                       |
| Exact-board accuracy    | Fraction of recorded valid-board samples with correct dimensions, one matching entry per cell, and a structurally valid exact grid. Correct uncertain cells receive credit.       |
| Non-floor symbol recall | Expected walls, player, crates, key, door, and exit recognized at their annotated positions, counted separately by symbol. This prevents blank floor from hiding symbol failures. |
| Missed critical symbols | Missing or misplaced player, crate, key, door, or exit instances, listed by cell. Wall misses remain visible in symbol recall.                                                    |
| Corrections             | Actual user editing-action counts only when supplied; mismatched cells are reported separately and are not called observed correction effort.                                     |
| Rejection rate          | Fraction of recorded conflict fixtures for which the model requests clarification or explicitly declines interpretation. Technical errors do not count as cautious rejection.     |
| Latency / usage / cost  | Supplied measurements with coverage counts, totals, mean, and nearest-rank p50/p95. Missing values are not converted to zero.                                                     |

Failed recorded requests remain in accuracy denominators. Unmeasured samples are shown explicitly and excluded; partial reports must not be described as full-corpus results. Imported provenance is caller-declared. A future real evaluation should use permissioned/self-drawn photos, independently checked annotations, frozen held-out prompts, multiple capture conditions, and measured correction effort. Model confidence flags must never be presented as calibrated extraction accuracy.
