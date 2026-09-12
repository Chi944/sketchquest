# SketchQuest expedition design

The site is a playable expedition portal: compact cinematic scenery, clear chapter selection, and a tactile 3D puzzle as its centre. This implements the user's request for richer animation, more obstacles and varied puzzles, and game-site inspiration. The earlier still-image notebook direction is historical.

## Reference and original choices

[Official game-site research](docs/design/game-site-inspiration.md) records actual rendered observations of Monument Valley III, TUNIC and LEGO Builder's Journey. The implementation adapts their attention to world framing, material light and chapter navigation. No reference artwork, code, characters or logos were copied.

The page uses a deep blue/teal expedition surround, warm light play surfaces, brass actions and a compact scenic hero. Three.js renders the actual puzzle in a bounded orthographic camera. Six authored expedition cards show their real board geometry; forest, coast and frost each have distinct materials and atmosphere.

## Tokens and type

| Role          | Value     |
| ------------- | --------- |
| Deep surround | #163443   |
| Raised stage  | #203e 4b  |
| Open page     | #dbe 6e 7 |
| Light surface | #fbfbf 3  |
| Text          | #29434b   |
| Brass action  | #f 0c 674 |

Bricolage Grotesque gives the title, board and expedition names their compact, confident shape. Nunito Sans carries controls and explanatory text. Fraunces remains in the scenic annotation and chapter numerals. All fonts are self-hosted and licensed.

The desktop work area is at most 1360px, with a roughly 2:1 board/tools split. The scenic introduction is approximately 240px high. Chapter navigation leads immediately to the game. The stage is capped at 480px high on desktop and adapts to phone widths; controls remain directly under it. Expedition cards appear beneath the workbench. At 800px the workbench stacks; narrower phones use one column.

## Objects and motion

- Stone courses have beveled edges, material grain and small moss details. Crates have wooden slats, braces and nails. The key and gate share brass material cues. The explorer uses our generated transparent character atlas as a billboard on the physical board.
- Water, bridges, ice and relics are visually different in both 3D and the flat grid. Their rules come solely from the shared transition function. The renderer never infers collisions or collects an item by itself.
- Legal moves and pushes interpolate over 220–620ms according to distance. Gate opening lasts 460ms. A pickup produces a brief burst; completing a quest produces a bounded celebration. Pointer tilt is small and returns to rest.
- Animation stops after the interaction settles. Rendering pauses when the page is hidden or the scene is offscreen. Pixel density is capped at 1.6 and active animation renders near 30fps. Geometry, textures, materials, observers and the renderer are disposed on removal.
- Reduced motion immediately reflects the final game state without travel, tilt or particles. The game remains fully usable. WebGL failure switches visibly to the 2D grid.

## Interaction and accessibility

The user can select 3D world or Grid; the preference persists when browser storage is available. Drawing and proposal review use the exact flat grid, with editable cell labels, changed-cell diamonds, uncertainty markers and focus outlines. The 3D canvas is decorative and retains a separate accessible cell description. Movement and view controls remain keyboard/touch operable.

Normal text must retain at least 4.5:1 contrast. Status uses explicit text and symbols. Relic collection has a live count. Rules explain that ice counts as one directional input and that all relics are required to complete an expedition. New chapters preserve existing notebooks and parked drafts.

Live AI unavailability remains explicit. Prepared quests and the prepared 6→10 remix are authored examples; they are not represented as model responses. Solver results and replay are computed in the browser.

## Evidence

[Expedition verification](docs/design/expedition-verification.md) records tests, actual screenshots, performance observations and the release's limits. Previous generated PNGs and prompts remain in [image provenance](docs/design/photoreal-generation.md).
