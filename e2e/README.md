# Browser checks

Start the existing local Vite/Cloudflare development server on `127.0.0.1:5173` and migrate local D1, then run `npm run test:e2e`. Set `PLAYWRIGHT_BASE_URL` only to another **local** test server. The configuration deliberately does not launch a second server.

Tests cover editing, movement, push/history counts, restart, prepared 6-to-10-move remix, replay controls, autosave, immutable D1 sharing, notebook preservation, malformed share data, mobile width/touch controls, image failures, extraction review and cancellation. Chromium is the initial browser target.

`npm run test:e2e -- e2e/accessibility.spec.ts` audits desktop play and rules plus 320-pixel editing, remix, proposal review, photo preparation and the notebook using axe-core WCAG A/AA and best-practice rules. It also checks keyboard mode navigation, board arrow/Enter editing, one board tab stop, dialog focus restoration and containment, and horizontal overflow. Axe results, including checks that need manual review, are attached to the Playwright report. These bounded checks do not establish full accessibility conformance; screen readers and real-device operation remain manual checks.

Photo/proposal responses and AI status are mocked; inference endpoints are intercepted even if a developer configured a real model. The image itself is a synthetic local canvas drawing. Browser results are **not model extraction accuracy measurements**. Sharing tests use real local D1 and create two shared records per full run. Repeated runs within one minute can legitimately hit the local server's sharing allowance; wait for the allowance to reset instead of bypassing the production checks.

Traces and screenshots are kept for failures. `playwright-report/` is a local report, not a production artifact. Native camera capture and HEIC conversion still need real-device checks.
