# SketchQuest API and free deployment setup

The Hono Worker serves same-origin `/api/*` routes. Browser assets and the puzzle engine work without AI. Local D1 sharing works after `npm run db:migrate`. No provider call is made by default: `wrangler.jsonc` has no AI binding and `FREE_PLAN_CONFIRMED` is `false`.

The separate [Vercel deployment](vercel-deployment.md) serves the same public snapshot contract using a Node function and private Blob storage, with lower persistent sharing quotas. Live AI stays disabled there. The Cloudflare configuration and quota details below apply to the original Worker deployment.

## Local operation

1. Install dependencies, run `npm run db:migrate`, then `npm run dev`.
2. The all-zero D1 ID is a local placeholder. Do not deploy it as a real database.
3. Localhost uses a fixed development cookie-signing key; no `.dev.vars` is needed for sharing. AI buttons correctly report unavailable.
4. `npm test` includes backend tests using the real migration and admission SQL in in-memory SQLite. AI responses in tests are explicit test doubles. Tests never call Workers AI.

## Free production configuration

Before enabling remote services, confirm the Cloudflare account is on **Workers Free**, create a D1 database, replace the placeholder ID, and apply migrations to that database. Set a random `QUOTA_SECRET` of at least 32 characters with Wrangler secrets. The secret signs actor cookies and produces HMAC identifiers; it must never be a `VITE_` variable.

For AI, complete the one-time Llama 3.2 model license acceptance, then add `"ai": { "binding": "AI" }` and set `FREE_PLAN_CONFIRMED` to the string `"true"`. This flag is an explicit deployment assertion, not an automatic billing-account check. The application cannot inspect the account plan. Do not set it on a paid account. Keep Workers Free and do not configure paid fallback models, prepaid gateway credits, or a paid plan upgrade. AI is enabled only when the flag, binding, D1, and production quota secret are all configured.

The fixed model is `@cf/meta/llama-3.2-11b-vision-instruct`. Image requests use a bounded data URL; text and image calls use the documented JSON Schema `response_format`, nonstreaming. Every response is validated again locally. JSON Mode may fail; it does not prove semantic correctness or solvability. The Worker never solves a board; the browser's solver verifies proposals before they can be accepted.

Workers Free includes 10,000 AI neurons/day, resetting at 00:00 UTC. Exhaustion fails with an error instead of billing. The application's separate 50-call daily limit is not a promise that 50 calls fit inside the provider's neuron allowance. Wrangler development with a real AI binding also consumes the remote allowance. Configure live AI only intentionally. Cloudflare says inputs and outputs are not used for model training or service improvement without explicit consent. See [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), [JSON Mode](https://developers.cloudflare.com/workers-ai/features/json-mode/), [model setup](https://developers.cloudflare.com/workers-ai/models/llama-3.2-11b-vision-instruct/), and [data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/).

Include the Llama license and a visible **Built with Llama** attribution when enabling that model. No deployment or model-license acceptance is performed by local setup.

## Routes

All modifying requests require `Origin` exactly equal to the request URL's origin. Cross-site requests are rejected; CORS is not enabled. JSON bodies are read as bounded streams, limited to 32 KiB. Errors use `{ "error": { "code": "...", "message": "...", "retryAfter": 60 } }`; `retryAfter` and the HTTP `Retry-After` header are present only when relevant. Provider error text is never returned.

| Route                 | Request                                                                   | Response                                                      |
| --------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `GET /api/status`     | None                                                                      | `{ aiEnabled, sharingEnabled, model, message }`               |
| `POST /api/interpret` | Multipart `image`, UUID `requestId`; optional `width`, `height`, `legend` | `{ requestId, interpretation, metrics }`                      |
| `POST /api/propose`   | `{ requestId, baseRevisionId, baseHash, board, prompt, selectedCells }`   | `ProposalResponse` from the shared core types, plus `metrics` |
| `POST /api/shares`    | `{ board, title }`                                                        | HTTP 201 `{ id, url }`, linking to `/s/<id>`                  |
| `GET /api/shares/:id` | 22-character opaque ID                                                    | `{ id, title, board, createdAt }`                             |

Interpretation accepts PNG, JPEG, and WebP, up to 1 MiB and 1536 pixels on the longest side. The actual file signature, MIME agreement, and header dimensions are checked. The complete multipart body is capped at 1 MiB + 16 KiB; repeated/unrecognized fields are rejected. The server never fetches user image URLs. Optional grid dimensions must both be supplied, each an integer 4–8. Legends and edit prompts are limited to 600 characters. Photos and prompts are held only for processing; they are never persisted or logged by this application.

An `interpreted` result must include every grid cell exactly once. Clarification results may contain a partial grid with explicit uncertainty. Interpretations can still need rule corrections: the UI must review them before committing a revision. No image result is silently treated as a playable board. Image output is capped at 4,096 tokens, with concise empty notes on clear cells to fit an 8×8 grid. A truncated or otherwise invalid response is rejected, never silently completed.

Successful inference metrics include measured `latencyMs`. `inputTokens` and `outputTokens` appear only if the provider returned valid usage counters. If both are present, `estimatedNeurons` uses the published model rates `(inputTokens × 4410 + outputTokens × 61493) / 1,000,000`, rounded to three decimals. This is an estimate, not an actual billed-neuron measurement. Missing counters remain absent. `actualCostUsd: 0` and `costBasis: "confirmed-free-plan"` are emitted only behind the explicit `FREE_PLAN_CONFIRMED=true` gate; this reflects the operator's free-plan assertion, not a fetched billing statement. Metrics are returned to the client and never persisted by the Worker.

Proposals require a valid input board and the exact `boardHash` canonical identity of that board. The hash is a JSON identity string, not a short digest. The response echoes `requestId`, `baseRevisionId`, and `baseHash`; the client must reject late responses for another revision. Every ordinary edit has one candidate; a request for a longer solution can have up to three. Each candidate changes one to six cells including implicit occupant relocation, keeps dimensions fixed, and passes structural rule validation. Selected cells are reference context, not an edit boundary. The player/exit remain fixed unless the prompt contains a clear affirmative move/place/relocate instruction; ambiguous or negated language conservatively leaves them fixed. No candidate is guaranteed solvable or longer until checked by the browser solver.

Public shares store only canonical board JSON, a title of 1–80 characters, an opaque ID, and an ISO creation time. Stored snapshots are immutable and revalidated on read. The app does not expose a share listing or allow editing an existing snapshot. Anyone with the link can read it. Missing/invalid IDs return 404. Successful reads may cache for one day. A total cap of 10,000 snapshots bounds storage; when full, users can still export JSON.

## Quotas, duplicate requests, and failure behavior

The admission table stores only HMAC identifiers, operation kind, and timestamps. The write that admits an operation checks all applicable counters in **one conditional SQLite INSERT**. This avoids a check-then-increment race across Worker instances. Indexes cover each counter. A transactional bounded cleanup deletes metadata older than seven days as new requests arrive; a quiet deployment can retain the last metadata until activity resumes. [D1 batch transaction behavior](https://developers.cloudflare.com/d1/worker-api/d1-database/)

| Operation                              | Per actor and per IP            | Global      |
| -------------------------------------- | ------------------------------- | ----------- |
| AI interpretation + proposals combined | 2/rolling minute and 10/UTC day | 50/UTC day  |
| Share creation                         | 3/rolling minute and 20/UTC day | 100/UTC day |

Actor identity is a signed, HTTP-only SameSite=Lax cookie; IP enforcement remains effective when a visitor clears cookies. Only Cloudflare's `CF-Connecting-IP` header is used remotely. No raw addresses are stored. Changing the production quota secret resets actor identities, so rotate it intentionally. Successful, failed, and timed-out provider attempts all consume an admitted operation to avoid retry storms.

AI request UUIDs are globally deduplicated for the retained admission period, including retries whose first cookie response was lost. A duplicate receives 409 `DUPLICATE_REQUEST`; model responses are not cached in D1. The client should generate a new UUID only for an intentional new attempt. This prevents automatic re-inference after an uncertain result. Share requests have no idempotency key in their public contract; each successful POST creates a snapshot.

The Worker does not retry provider calls automatically. AI timeouts return 504 after 25 seconds; the upstream call may still complete and remains counted. Model setup problems, free-plan incompatibility, and service outages return actionable 503s; malformed model output returns 502; quota exhaustion returns 429 with retry timing. All failures preserve the local draft. The client must display actual errors and must not synthesize a fake AI result.
