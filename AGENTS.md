# SketchQuest development

This is an original project. Do not copy or alter sibling projects.

- All services must remain on verified free tiers. Do not enable paid plans, paid inference, prepaid gateway credits, or automatic model fallback.
- Never expose Cloudflare tokens or QUOTA_SECRET to the browser. Never persist/log photos or raw prompts.
- The transition function in src/core/rules.ts is the source of game behavior. Solver, playback, and gameplay must use it.
- A solver timeout or cancellation is inconclusive, never unsolvable. Verify returned solutions by replay. Discard results that do not match the current job, revision, and board.
- AI output is a proposal against a revision. Validate it and show differences before explicit acceptance. Never execute generated code.
- Do not invent evaluation results. Synthetic vector drawings, mocked API tests, live model outputs, and human photo evaluations must be labeled separately.
- Run npm test, npm run typecheck, and npm run build after consequential changes. Run focused Playwright tests against the local migrated D1 app for interaction/persistence changes.
- Keep the board dominant, colors and symbols readable, touch and keyboard controls functional, and reduced motion supported.
