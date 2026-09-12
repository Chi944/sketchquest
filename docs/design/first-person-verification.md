# First-person release verification — 13 September 2026

This release adds a real perspective camera, gloved hand rig, relative controls and explicit inventory, plus rules version 3. A key is consumed when the explorer opens its gate; boots protect from spikes, water remains fatal, and every relic is needed to activate the exit. Six authored expeditions exercise these mechanics. Historical version 1/2 boards retain their behavior.

## Automated and manual checks

- `npm test`: **142 tests in 18 files passed**. Coverage includes fatal moves with inventory, boots/spikes/water, hazardous ice landings, gate consumption, key non-respawn, terminal replay, full-state undo/restart, solver state encoding, causal level requirements, versioned storage and both share adapters.
- Strict TypeScript, Cloudflare production build and Vercel production build passed. Three.js and HEIC conversion remain lazy chunks; Vite reports their size warning. No runtime model, remote character asset or new dependency is required.
- Browser verification exercises first-person defaults, relative WASD and Q/E, zero-cost turns, Map/Grid state retention, keyboard isolation in dialogs/inputs, all six shortest-route replays, inventory, gate persistence, both hazard deaths, death reload, undo and retry.
- Existing browser checks cover editing, 6→10 prepared remix, photo review/corrections/error paths, autosave, notebook preservation and immutable local shares. Model HTTP responses are explicitly mocked; these tests do not measure model quality.
- Phone first-person controls meet a 44 CSS-pixel minimum. The 390px view passed axe. Existing desktop/320px accessibility states passed. Additional manual 320px Explore and expanded-view checks found no horizontal overflow or page errors; Escape exits the expanded view.

**All 36 browser checks passed across the complete run and isolated sharing rerun.** The initial complete run passed 35 of 36; the last share creation hit the existing development database’s daily quota. All three sharing checks then passed against a fresh isolated local D1 store in 15.4 seconds. Production quotas and existing development data were unchanged.

The isolated store was migrated with `npx wrangler d1 migrations apply DB --local --persist-to artifacts/fps-test-state-20260913`. A temporary Vite config selected that persistence root and port 5193. `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5193 npx playwright test e2e/sharing.spec.ts` ran the real D1 checks. The temporary server was stopped; ignored fixture data remains available locally.

## Animation and resource checks

Actual normal-motion browser sessions verified visible key pickup, the held key, physical gate opening and the retained key in its lock, water death while equipped, undo of the fatal step and Map switching. Camera death veil reached `0.750`; undo restored it to `0.000`. No page errors were observed.

An instrumented WebGL2 run recorded **zero additional draw calls while settled** and **zero while offscreen**. Rendering is capped near 30fps during active animation, pauses on hidden/offscreen pages, and uses DPR at most 1.6. Observers, listeners, geometry, textures, materials, hand meshes and renderer resources are disposed on removal. Reduced motion snaps to final state without travel, turning interpolation, bob or particles. Forced WebGL failure visibly falls back to Grid.

Normal strides last approximately 285ms; ice glides are capped at 620ms. Hand pickup lasts 650ms; the gate/key gesture settles within 760ms. Camera rotation takes 250ms. These are animation durations, not measured device frame-rate guarantees.

Review discovered and fixed three rendering restoration bugs: a canceled gate gesture could leave the restored key scaled down; rewinding a particle burst could leave frozen particles; switching view could retain death tint. Pickups now face the explorer for readable silhouettes, the HUD owns one reticle, and dormant exit seals appear on both sides.

## Scope and evidence

Production deployment `dpl_AdRYpyBV7APMmS3PD2exgLacs1iA` is READY at [SketchQuest](https://sketchquest-beige.vercel.app). Live desktop checks verified the default perspective camera, key pickup, gate opening and winning solver replay. Live 390px checks verified water death while wearing boots, the fall/tint, undo recovery and zero horizontal overflow. Both sessions reported zero page errors.

The new [version 3 Winter vault snapshot](https://sketchquest-beige.vercel.app/s/xTDRNnEMzWVQwam2DfzD-g) was written once to real private Blob storage and read back as the exact canonical board. A fresh browser loaded its first-person view and replayed all 25 moves to victory with the gate open, boots equipped and 3/3 relics. Existing version 1/2 shared URLs still return their original versions.

Actual production captures:

- [Desktop page](first-person-desktop.png)
- [Phone expedition](first-person-mobile.png)
- [Opened gate](first-person-gate.png)
- [Death and recovery controls](first-person-death.png)

This is a cardinal-direction grid puzzle seen from the character’s eyes. Facing changes in 90-degree steps; it does not implement free mouse-look, jumping, combat or continuous off-grid physics. Hands, scenery and effects are procedural Three.js meshes; Map retains the existing generated explorer atlas. Solver proofs concern directional-input length and safety under the defined rules, not subjective difficulty.

The committed screenshots show the actual application. Original generated-art prompts and source images remain in [artwork provenance](photoreal-generation.md). [Version 3 rules](../first-person-rules.md) and [deployment verification](../vercel-deployment.md) document the release semantics and live checks. Live model evaluation remains unrun.
