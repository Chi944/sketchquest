# SketchQuest visual system

The current direction is an enchanted expedition through miniature forest ruins. The user rejected the previous flat notebook treatment and explicitly requested generated photorealistic scenery and characters. This direction supersedes the earlier pale-blue paper, cobalt, and procedural-piece styling. The actual playable grid remains the primary interactive object.

## Art and composition

- Use a dramatic, photorealistic forest-ruin scene as a compact editorial hero. Give the copy a quiet region of the image and a dependable dark scrim. Put the product promise and photo action inside this composition so a second introductory section does not displace the board.
- Present the game as a physical tabletop puzzle: warm stone, subtle sand or paper texture, mossy walls, a small explorer, a wooden crate, an antique brass key, a locked door, and an illuminated exit. Material, light direction, perspective, and contact shadows should agree across assets.
- Render generated props as individual image assets inside real grid cells. Keep game geometry, focus, labels, selection, uncertainty, and proposal markers in HTML/CSS. The scenic hero and props are decorative representations; they do not determine the rules.
- Keep imagery composed and still. Use texture at low contrast around the board, with enough separation between traversable ground and obstacles to recognize the route immediately. Repeated props should read as intentional game pieces rather than a repeating wallpaper.

## Palette and type

The page is a warm ivory gallery with forest-ink type, green actions, and amber material highlights. Implemented anchors are canvas `#f2f1e9`, ink `#293d33`, muted ink `#53634f`, primary green `#245b48`, and ivory action text. Amber is an accent for brass, light, and small decorative details; it is not an automatic choice for small text.

Use self-hosted Fraunces for the editorial display and main headings, Nunito Sans for readable controls, and Bricolage Grotesque for supporting utility elements. Preserve semantic heading order. Secondary information becomes quieter through position and scale, never through faint text.

## Responsive layout

- A centered work area of about 1,190px keeps a generous board and a narrower control column on desktop. A scenic hero should be roughly 260–300px tall on wide screens and compact on phones; exact dimensions must be checked against the implemented content.
- Stack the workbench at tablet widths. Keep the current action, move controls, counters, and state beside or directly beneath their board. The scenery must not require visitors to scroll past a large campaign page to reach the game.
- At 320px, allow display text and upload-button content to wrap. Keep the board square according to its actual dimensions and avoid fixed minimum widths in flex children. Check both 4×4 and 8×8 boards, long revision names, and proposal states.
- Set image dimensions and fit behavior explicitly in the board, palette, objective trail, example thumbnails, and covered-terrain markers. Images must not cause layout shifts or intercept pointer events.

## Semantics and accessibility

- Deep teal indicates action or selection. Verified success uses green plus text/check marks, uncertainty uses amber plus question marks, and a proposed change uses a distinct marker plus explicit text. Retain Current, Draft, and Proposed near the board title.
- Maintain at least 4.5:1 for normal text, visible focus against both images and solid surfaces, and non-color state cues. Put cell focus, proposal diamonds, question markers, and covered-item markers above photographic assets.
- Main touch and movement controls remain at least 44px on phones. Dense grid cells stay independently named and keyboard operable; a photograph cannot replace the semantic control.
- Decorative hero and prop images use empty alternative text where adjacent text or cell labels already supplies their meaning. Preserve labels such as Player, Key, Door, and Exit in the palette and help.
- Respect reduced motion. Keep only restrained interaction feedback, and never add perpetual particles, parallax, or motion required to understand a move.
- AI interpretation and word edits remain reviewable proposals. Keep draft preservation, unavailable-service recovery, and honest solver outcomes intact through the visual change.

## Provenance and verification

[Photoreal art direction](docs/design/photoreal-art-direction.md) records the composition, asset roles, implementation risks, and verification criteria for this redesign. [Design method provenance](docs/design/source-notes.md) records the Impeccable and Design with Intent guidance inspected during the project.

Generated scenery and characters are original synthetic visual assets, not photographs of a real location or evidence of live image-interpretation accuracy. Earlier notebook screenshots and the original generated UI reference record the previous design; they are not the target for this pass. Updated screenshots must identify the running implementation and viewport size. No audience research or complete screen-reader certification is claimed.
