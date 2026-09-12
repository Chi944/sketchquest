# Vercel deployment

**Production:** [sketchquest-beige.vercel.app](https://sketchquest-beige.vercel.app/)

SketchQuest has a dedicated Vercel project, `chi944s-projects/sketchquest`. The authenticated team API reported `billing.plan: hobby` on 13 September 2026. Its private Blob store, `sketchquest-snapshots`, is in Singapore (`sin1`). No paid plan, trial upgrade, model gateway, or paid inference was enabled.

The Vercel build serves the same React application and browser solver as the Cloudflare build. `vite.vercel.config.ts` omits the Cloudflare development adapter. `api/index.ts` runs the Hono Vercel adapter in a Node function. The original Cloudflare Worker, D1 migrations, and local development workflow remain available.

`npm run build:vercel` first runs the complete strict TypeScript check, including the API and its dependencies. Vercel then transpiles the checked API a second time. `api/tsconfig.json` makes that second pass transpile-only, avoiding unrelated Cloudflare/Vite ambient-type lookup diagnostics in Vercel's temporary compiler directory. Server dependency imports include explicit `.js` extensions for Node ESM resolution.

## Available behavior

- Drawing, editing, playing, shortest-path solving, replay, revisions, local autosave, JSON import/export, and the clearly labeled prepared remix work in the browser.
- Six expeditions add water, bridges, sliding ice, collectible relics, and a lazy-loaded interactive Three.js view. Rules-version 1 boards remain compatible; the new expeditions use rules version 2.
- Sharing writes a canonical immutable snapshot to private Vercel Blob storage and returns an unguessable `/s/<id>` URL. Anyone with that URL can read the snapshot through the API. It is a real server snapshot, not an encoded puzzle in the URL.
- Live photo interpretation and natural-language generation are disabled on this deployment. The API returns `AI_DISABLED`; no fallback model or provider is called.

Only the snapshot ID, title, canonical board, and creation time enter a shared record. Photographs, prompts, undo stacks, sessions, and private revisions remain excluded. Blob credentials and quota records are never delivered to the browser. JSON endpoints retain size limits, strict schemas, board validation, and same-origin checks for writes.

## Free usage controls

Vercel documents that [Hobby usage stops at its included limits](https://vercel.com/docs/plans/hobby), and [Hobby Blob incurs no additional usage charges](https://vercel.com/docs/vercel-blob/usage-and-pricing). The application's limits leave room within the currently documented 2,000 included advanced Blob operations per month:

| Limit               | Vercel sharing allowance                  |
| ------------------- | ----------------------------------------- |
| Per connection      | 3 reservations per minute; 10 per UTC day |
| Across all visitors | 20 reservations per UTC day               |
| Rolling 30 days     | 450 reservations                          |
| Lifetime            | 10,000 reservations                       |

A successful share normally uses two writes: a quota reservation and its immutable snapshot. Quota records use an HMAC of a daily rotating client identifier derived from [Vercel's edge-provided address header](https://vercel.com/docs/headers/request-headers); raw IP addresses are not stored. A private ledger retains at most 450 reservation entries and discards entries older than 30 days during the next successful reservation. A lifetime count remains.

The ledger uses a consistent read and an [ETag conditional write](https://vercel.com/docs/vercel-blob/using-blob-sdk), so simultaneous server instances cannot overwrite one another's quota admissions. Contention returns a short retry response. An uncertain or failed snapshot write can consume a reservation; the app does not retry it automatically. Rejected requests, reads, and provider-level retries still use infrastructure resources. Heavy traffic may exhaust Hobby limits and pause service; these application quotas do not claim to eliminate that possibility.

Sharing fails closed unless all required server configuration exists:

- `VERCEL_HOBBY_CONFIRMED=true`, set only after checking the team's current plan.
- A server-only `QUOTA_SECRET` of at least 32 characters.
- The dedicated `BLOB_READ_WRITE_TOKEN`, or configured Blob OIDC credentials.

Production is configured. Preview remains disabled unless these values are explicitly configured there. If the team plan changes, disable the guard and verify pricing before restoring it. Never copy credentials from another project or commit `.env*` / `.vercel/`.

## Build and deploy

```sh
npm ci
npm test
npm run typecheck
npm run build:vercel
vercel pull --yes --environment production --scope chi944s-projects
vercel deploy --prod --yes --scope chi944s-projects
```

The Vercel project is linked locally in ignored `.vercel/project.json`. `vercel.json` configures the standalone Vite output, the API function, shared-link routing, and security headers. Generated artwork is served as local static assets, so it does not require a model call or image transformation at runtime.

This uses Vercel's remote Linux builder. The standalone local Vite build passes on the Windows development host, but Vercel CLI 52's local `vercel build` currently fails there with `spawn cmd.exe ENOENT` after dependency installation. Do not mistake that CLI launcher failure for a verified server-function build. On a host where the local Vercel builder works, `vercel build --prod` followed by `vercel deploy --prebuilt --prod` is also supported.

Before each production deployment, run the full suite and review the generated artwork in the actual application. After deployment, check the homepage, `/api/status`, browser interaction, and one share round-trip in a fresh browser context. Inspect runtime errors without printing environment values. AI accuracy remains unmeasured until a separate free inference deployment and evaluation are explicitly configured.

## Adapter verification

`worker/vercel.test.ts` covers real route logic with explicitly mocked storage: unavailable-service reporting, immutable record shape, malformed requests, origin rejection, nonexistent IDs, free-plan guards, concurrency, per-minute/day/month/lifetime allowances, and ledger retention. These are deterministic adapter tests; they are not evidence of live Blob availability or model accuracy. Production smoke verification is recorded separately after deployment.

## Production smoke verification — 13 September 2026

The final deployment, `dpl_EBsje2CWXz7uH7SRqztS4W5oCdYG`, reached `READY` in 17 seconds. Its remote build completed the strict application typecheck, Vite build, and API transpilation without TypeScript errors. The upload contained approximately 1.2 MB of application source and assets; private environment files and local build output were excluded. The deployment uses the latest photoreal artwork and the corrected "Reach the open arch" instruction.

| Check                               | Observed result                                                                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Homepage and shared puzzle page     | HTTP 200                                                                                                                    |
| `/api/status`                       | HTTP 200; sharing enabled, live AI disabled                                                                                 |
| Generated hero image                | HTTP 200, WebP, 183,326 bytes                                                                                               |
| Generated transparent game pieces   | HTTP 200, WebP, 130,492 bytes                                                                                               |
| Create real immutable snapshot      | HTTP 201; random opaque ID                                                                                                  |
| Read back snapshot                  | HTTP 200; board matched the original exactly                                                                                |
| Snapshot after redeployment         | Still available, same ID and board                                                                                          |
| Snapshot cache                      | `public, max-age=86400, immutable`                                                                                          |
| Production desktop browser          | Hero decoded at 1536 pixels; fonts loaded; no horizontal overflow                                                           |
| Prepared remix and replay           | Real 6 → 10 move proof; accepted revision replay reached exit E5 in 10 moves and 3 pushes; 10/10 steps and win state        |
| Fresh mobile browser                | Shared puzzle loaded at 390 × 844 with touch enabled; 6-move solution verified; zero page errors and no horizontal overflow |
| Final deployment runtime error scan | No logged runtime errors during the smoke checks                                                                            |

The real smoke puzzle remains available at [The little escape](https://sketchquest-beige.vercel.app/s/dRbY-OklZBbbxwXPocXcAg). It contains only the original public example board and its title. The smoke check consumed one sharing reservation and made no inference requests.

The accompanying local verification passed 98 unit/integration tests, 19 Chromium browser tests, and all seven axe accessibility states. These results cover implemented behavior; they do not measure live model accuracy or guarantee accessibility for every possible board and interaction.

## Expedition expansion deployment — 13 September 2026

The expansion is deployed at the same [production URL](https://sketchquest-beige.vercel.app/). Deployment `dpl_Ct8u2rd6p7VLhCZDCQujePznW7Re` reached `READY` in 30 seconds. The existing project, private Blob store, free-plan guard, and quota limits were retained. A fresh authenticated team check confirmed the Hobby plan before uploading; no paid resource was added.

The remote Linux build completed its strict application typecheck, Vite build, and Node API transpilation without TypeScript errors. The Three.js board view is a separate 590,025-byte JavaScript chunk (approximately 151 KB compressed), requested when the 3D view opens. The main application bundle is approximately 330 KB (105 KB compressed). The build retains the expected large-chunk notice for the lazy 3D and HEIC modules.

| Check                         | Observed result                                                                          |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| Homepage and `/api/status`    | HTTP 200; sharing enabled, live AI disabled                                              |
| Lazy Three.js board chunk     | HTTP 200, JavaScript, 590,025 bytes                                                      |
| Version-2 snapshot creation   | HTTP 201; canonical Winter vault expedition payload read directly from `EXPEDITIONS`     |
| Version-2 snapshot read-back  | HTTP 200; `rulesVersion: 2`; complete 8 × 8 board matched its source exactly             |
| Version-2 shared page         | HTTP 200; immutable snapshot cache retained                                              |
| Existing version-1 snapshot   | HTTP 200; `rulesVersion: 1`; original board and title unchanged                          |
| Final deployment runtime scan | No runtime errors logged during the API/share checks                                     |
| Local regression verification | 117 unit/integration tests and 30 Chromium browser tests passed before production upload |

The new real snapshot is [Winter vault](https://sketchquest-beige.vercel.app/s/RB4ly4aZcaDtElki6hLDYQ), containing ice, water, a bridge, a locked gate, and relics. The original [The little escape](https://sketchquest-beige.vercel.app/s/dRbY-OklZBbbxwXPocXcAg) remains available unchanged. This expansion smoke check consumed one sharing reservation and made no model calls.

Fresh production browser checks confirmed the default "3D world view" was selected and its live WebGL canvas was present. The coast expedition had no horizontal overflow at a 390-pixel viewport. Winter vault displayed its 3D frost theme; a real replay completed 13/13 moves, collected 3/3 relics, and reached the "Found your way" win state. No page errors occurred in these checks.

Production browser evidence: [desktop 3D](design/expedition-desktop.png), [mobile coast](design/expedition-mobile.png), and [frost expedition](design/expedition-frost.png).
