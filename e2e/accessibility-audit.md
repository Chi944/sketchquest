# Accessibility audit

The browser suite uses Chromium, axe-core, semantic locators, and synthetic local image input. All AI requests are intercepted. No extraction quality or accessibility conformance claim is inferred from these tests.

## Checked states

| State                       | Viewport    | Checks                                                                                                        |
| --------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------- |
| Play                        | 1440 × 1000 | WCAG A/AA and best-practice rules                                                                             |
| Rules dialog                | 1440 × 1000 | Automated rules, Escape, return to opener                                                                     |
| Editor                      | 320 × 812   | Automated rules and horizontal overflow                                                                       |
| Remix and prepared proposal | 320 × 812   | Automated rules and horizontal overflow                                                                       |
| Photo preparation           | 320 × 812   | Automated rules, crop controls, dialog width, keyboard containment, Escape and return to opener               |
| Notebook dialog             | 320 × 812   | Automated rules and horizontal overflow                                                                       |
| Mode tabs and board         | 1440 × 1000 | Arrow/End mode navigation; Tab, arrows, Enter and number shortcut editing; one board tab stop; row boundaries |

## Initial findings

- The proposed-board badge had 4.4:1 contrast, below the 4.5:1 requirement for its text.
- Replacing the board title heading with an input left the editor and remix headings out of order.
- Closing a dialog with Escape did not restore focus to its opener.
- Mode tabs did not handle arrow or End navigation, and game movement could receive the same arrow key.

The interface owner fixed the badge contrast, added a draft heading, restored dialog opener focus, and implemented keyboard tab navigation. On 13 September 2026, the completed suite passed **19 tests in 40.8 seconds**, including all four accessibility tests. The seven audited states had **zero detected axe violations**. Keyboard board/tab navigation, dialog containment and focus restoration, and 320-pixel overflow checks passed. Strict TypeScript checking also passed for every E2E file and the Playwright configuration.

Run `npm run test:e2e` to reproduce the complete suite, or `npm run test:e2e -- e2e/accessibility.spec.ts` for the accessibility checks. State-specific JSON results are attached to the generated Playwright report.

## Limits

Axe includes checks requiring manual review in its report; an empty violations list is not a complete accessibility assessment. This suite does not validate screen-reader announcements, all possible boards, OS camera permissions, native HEIC handling, or every browser and assistive-technology combination. Keyboard focus in Chromium may pass through browser chrome between native-dialog cycles; the test checks that background page controls do not receive focus.
