# SketchQuest visual system

The existing implementation is the authority for this refinement. Preserve the playful notebook world: pale blue dotted paper, white drawing surface, cobalt actions, navy type, warm yellow sketch underline, and procedural puzzle pieces. The grid must remain the largest and most prominent interactive object.

## Type and composition

- Self-host Bricolage Grotesque for display and puzzle headings, Nunito Sans for controls and body text. Keep prose readable and metadata secondary through scale and placement, never faint contrast.
- Center a 1,190px work area with a roughly 1.9:1 board/sidebar split on wide screens. Stack the activity and its tools at 800px; keep the photo entry action full width on phones.
- Use a restrained 4/8px spacing rhythm with larger gaps between tasks. Related controls stay adjacent to their board.
- White surfaces use thin blue-gray borders, restrained rounding, and a soft downward shadow. No decorative imagery replaces interactive elements.

## Semantics and accessibility

- Cobalt means an action or selection. Green plus explicit text/check marks means verified success. Amber plus question marks means review. Violet plus diamond markers means a proposed change.
- Display Draft, Proposed, and Current beside the board title. A proposal does not replace the accepted revision until the visitor accepts it.
- Target at least 4.5:1 for normal text and clear visible keyboard focus. Main touch and movement controls are at least 44px on phones. Dense board cells remain independently named and keyboard operable.
- Respect reduced motion. Use one subtle piece-arrival motion; no continuous decorative movement.
- Show specific recovery copy for unavailable AI, bad images, malformed shares, cancelled searches, budgets, and invalid boards. Preserve unfinished drafts in the notebook.

## Generated reference and verification

The user requested generated section imagery during the polish pass. [The generated reference](docs/design/generated-reference.png) shows a desktop play page and a compact mobile proposal section. It guides contrast, hierarchy, spacing, and state presentation; its raster text and geometry are not a source of game truth. Final screenshots document the actual running implementation at explicit viewport sizes.

See [design method provenance](docs/design/source-notes.md) and [the visual verification record](docs/design/verification.md). No audience interviews or complete screen-reader certification are claimed.
