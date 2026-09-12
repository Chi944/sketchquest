# Expedition release verification

Verified on 13 September 2026. The user requested richer animation, more items and obstacles, puzzle variations, and inspiration from game websites. [Official-site research](game-site-inspiration.md) documents the inspected references. The original implementation uses Three.js geometry and procedural materials, the project's generated explorer/hero, a new expedition navigation and six authored puzzles.

## Functional checks

- **117 unit/integration tests pass across 15 files.** Rules cover water, bridges, forced ice movement, stopping at obstacles, crate pushes on ice, relic collection, incomplete exits, state encoding and version-2 validation. Solver tests preserve the original examples and verify the six new routes. Both server adapters round-trip version-2 boards. Notebook tests preserve version-2 accepted revisions, editable drafts and parked drafts.
- **30 Chromium browser tests pass in 1.8 minutes.** Tests exercise all six chapter cards and their complete solution replays, every new editor tool and reload persistence, world navigation, view preference, reduced motion, real WebGL rendering and a deliberately failed WebGL context. Existing editing, draft recovery, photo-review mocks and real local D1 sharing remain covered.
- Seven axe states detect no violations, with keyboard/grid/dialog checks and 320px overflow checks. This is automated evidence, not screen-reader certification.
- Strict TypeScript, the Cloudflare production build and the standalone Vercel production build pass. The Vercel deployment performs its own remote Linux build and runtime smoke checks; see [deployment evidence](../vercel-deployment.md).

## Scene and motion checks

The live scene displays actual stone courses, crate slats, bridges, water, ice, keys, relics, and arched doors/exits. The generated explorer is a transparent billboard within the 3D scene. Player/crate positions interpolate from canonical game states. The key opens the door's hinged mesh; pickup and win responses are bounded bursts. The six-step legacy replay and all new expedition replays reach their real exit states.

In isolated browser measurements, five consecutive 1.5-second idle samples reported an unchanged draw counter (5,916 draws). Scrolling the scene offscreen produced zero additional draws. Active rendering is capped near 30fps, device pixel ratio at 1.6, and the desktop scene at 480px high. This is a bounded local observation, not a claim about frame rate on every device.

The reduced-motion test compares two actual canvas captures 300ms apart and verifies that they match, then verifies movement still works. WebGL failure visibly switches to Grid and disables the unavailable 3D action. Keyboard and touch movement remain available. Scene teardown disposes geometries, materials, textures, shadow maps, renderer resources and observers.

The Three.js scene is a lazy chunk: approximately 590KB minified / 151KB gzip. The optional HEIC decoder is also lazy; it remains much larger and is unrelated to ordinary play. The generated hero and explorer atlas retain their existing optimized WebP assets.

## Visual evidence

- `expedition-desktop.png`: actual production page at 1440 × 1100, showing the new framing, 3D board and expedition cards.
- `expedition-mobile.png`: actual production at 390 × 844, with the coastal world selected.
- `expedition-frost.png`: actual production's frozen chapter, with new ice and relic geometry.

Checks include desktop, phone, coast, frost, view changes, reduced motion, and fallback. No reference artwork or models were copied from the inspiration sites. No live model requests were made and no paid inference or rendering service was added. AI photo interpretation and unrestricted word edits remain explicitly unavailable on Vercel.
