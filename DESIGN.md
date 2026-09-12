# SketchQuest expedition design

The site is a playable expedition portal: compact cinematic scenery, clear chapter selection, and a tactile 3D puzzle as its centre. This implements the user's request for richer animation, more obstacles and varied puzzles, and game-site inspiration. The earlier still-image notebook direction is historical.

## Reference and original choices

[Official game-site research](docs/design/game-site-inspiration.md) records actual rendered observations of Monument Valley III, TUNIC and LEGO Builder's Journey. The implementation adapts their attention to world framing, material light and chapter navigation. No reference artwork, code, characters or logos were copied.

The page uses a deep blue/teal expedition surround, warm light play surfaces, brass actions and a compact scenic hero. Three.js renders the actual puzzle at eye level in Explore, with an orthographic Map for planning. Six authored expedition cards show their real geometry; forest, coast and frost have distinct materials and atmosphere. The [first-person rules](docs/first-person-rules.md) document causal item, gate, hazard and exit behavior.

## Tokens and type

| Role          | Value   |
| ------------- | ------- |
| Deep surround | #163443 |
| Raised stage  | #203e4b |
| Open page     | #dbe6e7 |
| Light surface | #fbfbf3 |
| Text          | #29434b |
| Brass action  | #f0c674 |

Bricolage Grotesque gives the title, board and expedition names their compact, confident shape. Nunito Sans carries controls and explanatory text. Fraunces remains in the scenic annotation and chapter numerals. All fonts are self-hosted and licensed.

The desktop work area is at most 1360px, with a roughly 2:1 board/tools split. The scenic introduction is approximately 240px high. Chapter navigation leads immediately to the game. The stage is capped at 480px high on desktop and adapts to phone widths; controls remain directly under it. Expedition cards appear beneath the workbench. At 800px the workbench stacks; narrower phones use one column.

## Objects and motion

- Stone courses have beveled edges, staggered joints, mineral variation and moss details. Crates have wooden slats, braces and nails. The key and gate share brass cues. The explorer uses our generated atlas in Map; Explore hides the own-character billboard and renders gloved hands and a held key.
- Water, bridges, ice, relics, spikes and boots differ in 3D and Grid. Their rules come solely from the shared transition. Pickups face the explorer for clear silhouettes. The exit carries a dormant seal until all relics are found; the key physically remains in an opened gate.
- Legal moves and pushes interpolate over 220–620ms. A gloved-hand reach accompanies item lift/fade; the key reaches the gate before walking through its opening hinge. Death lowers and tilts the camera with a bounded veil. Victory lights the exit. Map retains subtle pointer tilt.
- Animation stops after the interaction settles. Rendering pauses when the page is hidden or the scene is offscreen. Pixel density is capped at 1.6 and active animation renders near 30fps. Geometry, textures, materials, observers and the renderer are disposed on removal.
- Reduced motion immediately reflects the final game state without travel, tilt or particles. The game remains fully usable. WebGL failure switches visibly to the 2D grid.

## Interaction and accessibility

Explore is the default first-person view, with compass, an action prompt for the object ahead, and visible inventory. Map and Grid remain available; the preference persists when storage is available. Drawing/review use the precise flat grid, with accessible cell labels and visible change/uncertainty markers. Death names the cause and offers retry/undo. All controls support keyboard/touch; camera turns cost no moves. The decorative canvas retains a separate accessible cell description.

Normal text must retain at least 4.5:1 contrast. Status uses explicit text and symbols. Relic collection has a live count. Rules explain that ice counts as one directional input and that all relics are required to complete an expedition. New chapters preserve existing notebooks and parked drafts.

Live AI unavailability remains explicit. Prepared quests and the prepared 6→10 remix are authored examples; they are not represented as model responses. Solver results and replay are computed in the browser.

## Evidence

[First-person verification](docs/design/first-person-verification.md) records current tests, production screenshots, resource observations and limits. [Earlier expedition verification](docs/design/expedition-verification.md) remains historical evidence. Generated PNGs and prompts remain in [image provenance](docs/design/photoreal-generation.md).
