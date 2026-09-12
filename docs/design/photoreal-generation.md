# Photoreal production artwork

Generated on 13 September 2026 with Codex's built-in OpenAI image generator, following the user's request for photorealistic characters and scenery. No Higgsfield, paid external API, or runtime image-generation service was used.

## Shipped assets

| Asset                   | Source                                                            | Web asset                                                     | Role                                                                                            |
| ----------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Expedition sprite atlas | `photoreal-sources/expedition-pieces.png`, 1536 × 1024 with alpha | `public/art/expedition-pieces.webp`, 768 × 512, 130,492 bytes | Player, wall, crate, key, locked door, exit across board, palette, objective trail and examples |
| Forest-ruin hero        | `photoreal-sources/expedition-hero.png`, 1536 × 1024              | `public/art/expedition-hero.webp`, 1536 × 1024, 183,326 bytes | Responsive photographic header behind real HTML text and photo action                           |

Both generated results ship in the application. FFmpeg performed only WebP encoding and atlas downscaling (quality 92 for atlas, 84 for hero); the six pieces are selected with CSS sprite positions. Transparency was checked in the decoded PNG. CSS applies a dark scrim behind hero copy, contact shadows, and explicit dimensions. Real HTML cell labels, proposal markers, focus outlines, and the unlocked-door status indicator remain above the decorative art. These synthetic images depict no claimed real person or place.

## Exact atlas prompt

```text
Use case: game asset sprite sheet, photorealistic-natural. Create ONE production-ready transparent PNG SPRITE ATLAS for SketchQuest, an original miniature expedition puzzle game. Canvas landscape 1536 by 1024, EXACTLY three equal 512px columns and two equal 512px rows. Six isolated assets, one perfectly centered in each invisible square cell, each contained within the middle 82 percent of its square with generous transparent margins. True transparent alpha background, no ground plane across cells, no checkerboard image, no text, no labels, no grid lines, no frames. Camera is fixed front three-quarter from slightly above, consistent warm upper-left studio sunlight, subtle short contact shadow within each square. These must look like sharply photographed REAL miniatures and objects: physically realistic textures, fine material detail, natural proportion, NOT cartoon, NOT illustration, NOT flat vector, NOT outlines.
TOP LEFT: full body original adult female explorer character standing facing camera slightly right, realistic human anatomy and facial features, honey-ochre waxed cotton field jacket with hood down, charcoal trousers, dark brown hiking boots, small deep-teal backpack, dark chestnut hair tied back. Confident quiet pose, entire head and boots visible; readable jacket silhouette.
TOP MIDDLE: one squat chunky square block of ancient pale limestone masonry, dense individual stone texture, small deep green moss in seams, roughly cubic, top face visible, not a long wall or scenery.
TOP RIGHT: one single weathered oak shipping crate, square cube, thick diagonal cross-braced wooden slats, iron corner nails, visible top and front, fine realistic wood grain.
BOTTOM LEFT: one large antique brass skeleton key lying diagonally from upper-left to lower-right, clear round bow and toothed bit, warmly reflective worn metal, instantly readable shape.
BOTTOM MIDDLE: one single free-standing ancient arched oak door in a gray limestone frame, closed, with a very visible brass padlock at center and dark iron hinges. Entire frame fits cell; doorway must look LOCKED.
BOTTOM RIGHT: one single free-standing empty stone arch exit, open passage lit turquoise and warm sun beyond, tiny fern beside its base; unmistakably open with no door slab and no lock. All imagery sharp at game sizes and editorial photorealism. Each asset occupies only its own exact grid square and never crosses into a neighboring square. No brands, no franchise references.
```

## Exact hero prompt

```text
Use case: website hero background / photorealistic-natural. Create a cinematic photorealistic landscape image for the SketchQuest interactive puzzle website. Wide landscape composition roughly 1536x1024 intended to crop to a panoramic header. We are looking into a beautiful miniature lost garden built on an artisan's dark walnut workbench: ancient limestone archway threaded with tiny emerald ferns, weathered oak crate, softly gleaming antique brass key, subtle ochre light and morning mist. A small original realistic adult female explorer in a honey-ochre waxed jacket, charcoal trousers, dark brown boots and deep-teal backpack stands beside the arch at the RIGHT THIRD, seen slightly from behind at three-quarter, human anatomy natural. Atmospheric woodland bokeh and moss, realistic macro photography, tactile carved stone and walnut grain, restrained cinematic production design, very high photographic material fidelity, shallow depth of field with sharp hero subject. Warm sunbeams from upper right, rich deep forest green shadows. LEFT HALF mostly dark quiet out-of-focus forest/workbench shadow, intentionally simple negative space so large ivory website typography can be placed there in HTML. Main arch/explorer scene occupies right third, center vertically, keeping key important subjects within central 55 percent of image height to support a panoramic crop. No UI, no text, no letters, no logo, no symbols, no cartoon, no illustration, no painted style, no glossy plastic toy look, no border. This is the real decorative image used on the page, not a screenshot mockup.
```

## Implemented result

- `photoreal-desktop-play.png`: running desktop application, 1440 × 1100 viewport.
- `photoreal-mobile-play.png`: running mobile layout, 390 × 844 viewport.
- `photoreal-desktop-proposal.png` and `photoreal-mobile-proposal.png`: real prepared-remix review, including the computed 6 → 10 move comparison.

See [current verification](verification.md) and [design method provenance](source-notes.md). Earlier notebook screenshots and the generated UI reference are historical evidence; the user rejected that visual direction.
