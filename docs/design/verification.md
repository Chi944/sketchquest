# Visual verification

## Current expedition release

The richer game-site design, Three.js animation and six new expeditions supersede the earlier still-image design below. See [expedition verification](expedition-verification.md) for the current 117 unit/integration tests, 30 browser tests, scene performance evidence, and production captures.

## Historical photoreal implementation — 13 September 2026

The user's review superseded the notebook direction below. The shipped design uses a generated forest-ruin hero, realistic explorer and prop sprites, Fraunces display typography, warm ivory surfaces, and forest-green controls. [Exact prompts and original production images](photoreal-generation.md) are preserved alongside the implementation captures.

- `npm test`: 98 passing tests across 13 files, including 11 Vercel adapter tests with mocked storage.
- `npm run test:e2e`: all 19 Chromium browser tests pass, including seven axe states with no detected violations and keyboard-only grid editing. The suite includes a real local D1 share round trip; it does not simulate live model availability.
- Both Cloudflare and standalone Vercel production builds pass. TypeScript checks cover the application and server adapters. The large HEIC decoder remains lazy-loaded.
- Fresh-context captures: `photoreal-desktop-play.png` and `photoreal-desktop-proposal.png` at a 1440×1100 viewport; `photoreal-mobile-play.png` and `photoreal-mobile-proposal.png` at 390×844. Automated checks also cover 320px without horizontal overflow.
- The real prepared proposal computes and displays a six-to-ten-move change. Photographic pieces remain decorative; buttons, cell descriptions, focus indicators, and review markers retain their semantics and interaction.
- The first warm-palette pass exposed low-contrast secondary text. Secondary green and amber text was darkened, and all affected axe states passed on the final run.

These results do not establish screen-reader certification, real phone camera/HEIC behavior, or live AI accuracy. Actual Vercel deployment checks are recorded in [the deployment document](../vercel-deployment.md).

## Historical notebook reference

`generated-reference.png` was generated with Codex's built-in image generation tool from the initial implementation screenshot. It contains a desktop page and a mobile proposal-review section. Its exact prompt is recorded in `generation-prompt.md`. No paid external image API or Higgsfield call was used.

That earlier implementation used real HTML controls and procedural SVG puzzle pieces. The generated UI reference is historical design documentation; the user subsequently rejected its plain appearance.

## Refinements

- Removed the hero eyebrow and tightened the header so the playable board is reached sooner.
- Increased small interface text and darkened secondary text throughout the paper, tools, and dialogs.
- Kept the photo action readable on phones and stacked tools before the desktop sidebar became cramped.
- Increased movement and primary action targets to 44px on phones.
- Added a shape marker and accessible cell descriptions to proposed changes; uncertain cells retain question marks.
- Kept explicit prepared-example labeling and measured 6-to-10-move comparison.
- Preserved unfinished drafts, image review flags, and recovery paths when the surrounding work changes.

## Evidence

Final captures and automated accessibility/browser results are recorded after verification. Screenshots demonstrate the rendered states at their stated viewport sizes, not a claim that every possible device or assistive technology has been tested.

## Mechanical detector result

The official command `npx impeccable detect --json src/` ran once after the refinement. It returned two warnings and one advisory. One warning identified an obsolete photo-error side-border declaration, which was removed; the final rendered rule already used a uniform border. The retained movement-button bottom border represents a pressed keycap, not a card accent. The retained grid-line background is confined to the photo-preparation canvas, where it supports the drawing/grid task. These are narrow intentional exceptions, not a blanket suppression of detector findings.

The first bulk format triggered a local Vite/Cloudflare hot-reload restart failure. Restarting the existing local development server restored it. Final browser verification uses that restarted server; this incident was not a deployed-service outage.

## Historical notebook verification result

- `npm test`: 87 passing tests across 12 files.
- `npm run test:e2e`: 19 passing Chromium tests, including 7 axe states with no detected violations. Details and limits are in `e2e/accessibility-audit.md`.
- Strict TypeScript checks include application, Worker, evaluation scripts, and browser tests. Production build succeeds. The optional HEIC decoder remains a large lazy-loaded chunk; ordinary play does not download it.
- Captures: `desktop-play.png` and `desktop-proposal.png` at 1440×1100; `mobile-play.png` and `mobile-proposal.png` at 390×844. Automated width checks also cover 320px; intermediate composition was inspected at 768px.

These checks do not establish live model accuracy, actual phone camera/HEIC behavior, screen-reader certification, or production availability. No real inference call was made during these browser checks.
