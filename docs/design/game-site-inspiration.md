# Game website references: the expedition update

Inspected 13 September 2026. These are primary, official game sites. Each was opened in a separate local Chromium session at 1440 × 1100; the observations below describe the rendered pages and their exposed media, rather than search snippets. References inform composition, hierarchy, and material treatment. Their artwork, logos, characters, music, and code are not assets for SketchQuest.

## References and original adaptations

### Monument Valley III — ustwo games

[Official game website](https://www.monumentvalleygame.com/mv3)

**Observed:** A slim, white series navigation sits above a full-width architectural scene. A large white wordmark overlaps a restrained coral, lavender, and deep-blue world. The scene has room to breathe, with small characters establishing its scale. The page includes a muted, looping hero video, a separate trailer, and an image gallery.

**SketchQuest adaptation:** Make a puzzle feel like a small place worth exploring. Use a distinct scene silhouette, layered depth, a tiny explorer, and generous space around the board. Introduce compact chapter navigation for the playable expeditions. The game itself should be the focal scene; shorten the marketing header so it does not delay play. Keep our forest materials, original character, and typography.

### TUNIC — ISOMETRICORP Games

[Official game website](https://tunicgame.com/)

**Observed:** A saturated blue isometric landscape fills the background and moves through a muted, looping video. The large white title and central trailer lead into parchment-like banners and framed actions. Gold highlights, dark outlines, decorative corners, and chunky labels make controls feel related to the adventure rather than detached website furniture.

**SketchQuest adaptation:** Give the workbench a recognizable expedition identity: dark forest framing, warm paper panels, brass route markers, numbered chapters, and a small collection of meaningful badges. Use button depth and a short press response. Limit decorative corners to major panels; preserve clear control labels, visible focus, and enough room for translated or enlarged text. Do not reproduce TUNIC's fox, rune language, or branded ornament.

### LEGO Builder's Journey — Light Brick Studio

[Official developer page](https://www.lightbrick.com/builders-journey)

**Observed:** The first screen places a physical-looking miniature landscape on the right and title/platform actions in quiet space on the left. Blue atmosphere, material highlights, soft shadows, and a clear camera angle separate the tiny scene from its surroundings. The page follows with a screenshot gallery and distinct creative-play sections. The developer describes photoreal lighting and a mode for building and sharing scenes.

**SketchQuest adaptation:** Render the playable grid as a coherent three-dimensional tabletop, with warm stone, wood, water, metallic pickups, and deliberate directional light. Keep obstacles legible through shape and height. Use actual game-state transitions for movement, pickup, gate, and completion feedback. Treat Play and Create as neighboring modes with one shared rules system and a usable flat-board alternative.

## Suggested composition for SketchQuest

These are design proposals, not claims about the reference sites.

- **Surround:** Midnight forest `#112923`, raised forest `#1b3930`, soft parchment `#f5f0df`, ink `#263c32`, brass `#d9ad5f`, and restrained water blue `#75bac5`. Keep normal text at accessible contrast; use brass as a material/accent rather than faint small text on parchment.
- **Type:** Retain the self-hosted Fraunces display and readable Nunito Sans controls. Give the product title and expedition names a clear size contrast. Use compact uppercase only for short eyebrow labels and chapter numbers.
- **Layout:** A compact scenic introduction leads directly into a board-dominant play surface and a narrower mission/control column. Present expedition choices as small cards showing a chapter number, scene name, mechanic, and verified difficulty information. Stack controls beneath the scene on mobile; keep movement controls nearby.
- **Meaningful motion:** Interpolate a legal player step, slide a pushed crate, shrink or lift a collected pickup, visibly change a gate, and provide a brief completion response. A level entrance can settle into place once. Animate from actual state changes, not an unrelated perpetual demo.
- **Depth:** Use a fixed or tightly bounded camera so north/east/south/west remain understandable. Keep playable floor visibly separate from water, walls, and raised obstacles. Minimize occlusion. Do not require camera motion or visual depth to solve a puzzle.
- **Control:** Honor reduced motion, pause rendering when hidden, cap rendering density, and retain the semantic HTML board for keyboard, touch, editing, and fallback. A three-dimensional scene must not become a second rules engine.

## Scope and verification

The user explicitly requested more animation, more puzzle variation, and a richer site after the earlier photoreal pass. This update expands the earlier still-image direction. Original generated scenery can remain useful as framing while the live puzzle gains geometry and motion.

Verify the final implementation at desktop, 390px, and 320px widths; with reduced motion and WebGL unavailable; while switching expeditions; and during push, pickup, obstacle, undo, reset, replay, and win states. Every shipped expedition should have a verified solution under the same rules used by the player. The reference sites were inspected for visual direction, not audited for accessibility or performance.
