# Photoreal expedition redesign

## Decision and scope

The user's review identified two problems: the game pieces looked unattractive, and the page felt plain. They specifically requested the image generator to create photorealistic imagery and characters. This authorizes replacing the notebook visual treatment with richer generated art while retaining the completed editor, solver, replay, review, sharing, and accessibility behavior.

The direction is **a miniature expedition through an overgrown forest ruin**. The page should feel like a considered game experience with tactile materials and a memorable setting. It should still make the first playable action obvious.

This document is an implementation brief. It does not claim that assets have been generated or that the verification below has passed; the asset files, generation record, final screenshots, and test output provide that evidence.

## Page composition

Use a warm ivory outer canvas with generous but controlled breathing room. Set the brand and navigation in dark forest ink with a small brass-colored detail. The header stays quiet enough for one scenic hero to establish the world.

The hero combines the existing introductory message and photo action with a wide scene: old stone arches, detailed moss, warm shafts of light, and a miniature explorer. The composition needs a clear copy area instead of text covering the busiest foliage. The crop can differ across desktop and phone widths, but the focal subject must remain deliberate. Keep copy live in the DOM; do not use rasterized words from a generated mockup.

Place the board immediately after the hero. A subtle tabletop surround gives it a physical edge and warm depth. Avoid large photographic margins that make the board smaller. A single frame, consistent cell seams, and believable contact shadows give a clearer illusion than multiple nested glossy cards.

The right column continues the same material palette with restrained surfaces. The objective card can carry a small atmospheric crop or image sequence, but solver proof, move counts, editing controls, and review outcomes stay on calm solid backgrounds. The visual hierarchy should read: scene and promise, board and current state, next action, supporting detail.

## Asset roles

| Asset            | Visual role                                              | Required reading at game scale                                                  |
| ---------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Forest-ruin hero | Establish the setting and deepen the opening composition | Recognizable landscape and focal explorer; clean area for live copy             |
| Explorer         | Player character                                         | One distinct figure with a memorable silhouette; separate from moss and stone   |
| Mossy stone wall | Impassable obstacle                                      | Visually dense, square footprint; does not resemble traversable ground          |
| Wooden crate     | Pushable object                                          | Clear wood grain and framed box silhouette; distinct from the wall              |
| Brass key        | Collectible unlocking item                               | High legibility on pale ground; a readable bow and shaft                        |
| Locked door      | Requires the key                                         | A closed physical door; lock state reinforced by interface cues                 |
| Illuminated exit | Goal destination                                         | An open passage with a distinct light cue; distinguishable from the locked door |

The six cell assets should share a camera angle, believable scale, light direction, and restrained contact shadow. Transparent backgrounds let the real cell surface remain visible. Use generous but consistent internal margins so an isolated large key does not appear to occupy several cells and a small explorer remains recognizable.

The explorer can be personable through pose, garment detail, and an original silhouette without returning to a flat cartoon badge. Photorealistic here describes material and light, not a claim that the imaginary character or location exists.

No new paid model API, stock purchase, or external generation service is introduced. Preserve the project's free-service constraint. Record the actual generator and output provenance with the assets rather than assigning an invented license or measured cost.

## Color and typography

| Role               | Suggested anchor  | Intended use                         |
| ------------------ | ----------------- | ------------------------------------ |
| Canvas             | `#f7f4ec`         | Warm ivory page and open space       |
| Primary ink        | `#1c3029`         | Headings, strong labels, navigation  |
| Secondary ink      | `#59635a`         | Readable support text on ivory       |
| Primary action     | `#164d46`         | Main buttons, selected state         |
| Action text        | `#ffffff`         | Text on deep teal                    |
| Material highlight | Muted brass/amber | Key, scene light, decorative accents |

The first ink/ivory pair has approximately 12.70:1 contrast, secondary ink/ivory approximately 5.69:1, and white/teal approximately 9.61:1 using the standard sRGB relative-luminance calculation. These are palette-pair calculations, not a completed audit of rendered UI. Test actual backgrounds, scrims, hover states, and disabled states separately.

Small amber text is easy to under-contrast: `#9a6b27` on the suggested ivory is about 4.24:1. Use a darker ink for text, or darken the amber deliberately and verify it. Texture and image gradients make contrast dependent on position, so critical controls and status text belong on solid surfaces.

Retain the self-hosted display/body pairing and strengthen the scale relationship. The title can be more editorial and spacious without changing the app's vocabulary. Avoid mixing a new decorative font with every material effect; the scenic imagery already supplies detail.

## Specific implementation risks found in the existing UI

1. **The cascade contains repeated final overrides.** `src/App.module.css` repeats many selectors and media rules after their initial definitions. Changing only the early cobalt colors or card spacing leaves later notebook styles active. Resolve the complete cascade, especially at 800px, 650px, and 370px, instead of adding an indefinite third layer of patches.
2. **The piece containers assume SVG.** The board, palette, and objective trail explicitly size `svg` descendants. Raster assets need shared explicit dimensions and `object-fit: contain`, including miniature example boards and tiny covered-terrain indicators. The image must not create a new intrinsic minimum width or intercept cell clicks.
3. **A separate large hero would displace the task.** The incumbent page already has an intro and upload action. Integrate those into the scene and constrain its height. Check that the opening desktop view still includes a meaningful portion of the playable board, and that mobile users reach the activity without a long decorative preamble.
4. **Existing no-wrap and row constraints can overflow.** The headline's highlighted span uses `white-space: nowrap`, while the mobile upload label and its secondary copy share a horizontal flex row. Longer editorial copy needs wrapping and child `min-width: 0` at 320px. Keep counters, title input, and editor actions under the same check.
5. **Photographic depth can obscure state.** Current cell differences, uncertainty, and selection use backgrounds and inset outlines. Large props and terrain texture may visually overpower them. Keep stable high-contrast outlines, explicit diamond/question markers, and covered-item badges above imagery, and verify keyboard focus over every terrain type.

## Interaction invariants

The art is a presentation layer. Board geometry, legal moves, key collection, door state, pushing, shortest-path proof, and replay use the existing rules. A photographed-looking door should not imply new animation or mechanics the game lacks.

Keep the existing per-cell labels and roving keyboard focus. Generated pieces are decorative where a cell label already names their role; avoid duplicate screen-reader announcements. Preserve text labels in the palette, selected-tool indication, Current/Draft/Proposed state labels, and text explanations for solver outcomes.

No generated image replaces a working control, proposal comparison, or proof result. Retain draft preservation and explicit acceptance. The user should recognize what changed, what is currently playable, and how to recover from an unavailable model with the same ease after the redesign.

## Verification criteria

- Inspect the actual running Play, Draw, and Remix/review screens at desktop width, 390px, and 320px. Include 4×4 and 8×8 boards, a long revision title, and a visible proposal marker.
- Confirm that every shipped asset loads locally with appropriate intrinsic dimensions, that fonts remain self-hosted, and that failed asset loading does not erase semantic cell labels or controls.
- Check image composition and object fit at all uses: main board, palette, objective sequence, examples, help, and covered-terrain indicators. Small pieces should remain recognizable without relying on texture detail alone.
- Use keyboard navigation to focus cells containing each terrain type and the player/crate. Focus and uncertainty/change markers must remain visible above the art. Verify touch targets and absence of horizontal page overflow at 320px.
- Recheck text and focus contrast over the hero and solid surfaces. Treat generated scene light as variable; use a reliable scrim or solid copy surface where necessary.
- Confirm reduced motion still disables nonessential animation and that the scene adds no perpetual motion.
- Run the repository's required unit/integration checks, typecheck, production build, and relevant browser tests. Save new screenshots and report only checks actually observed.

Impeccable's craft guidance supports consistency, hierarchy, responsive fit, and a deliberate visual direction. Design with Intent keeps the task, user control, understandable state, and recovery in view. Those methods guide this pass; they are not evidence of audience research or a numeric design-quality score.
