import { test, expect } from '@playwright/test';
import { currentBoard, openApp, proposedBoard, readNotebook } from './helpers';

test('manual editor supports undo, redo and a fresh play session while preserving revisions', async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Move right', exact: true }).click();
  await expect(
    currentBoard(page).getByRole('button', { name: 'C2, floor, player', exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Draw', exact: true }).click();
  await page.getByTitle('Wall (1)', { exact: true }).click();
  await proposedBoard(page).getByRole('button', { name: 'E2, floor', exact: true }).click();
  await expect(
    proposedBoard(page).getByRole('button', { name: 'E2, wall, changed', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Undo edit', exact: true }).click();
  await expect(
    proposedBoard(page).getByRole('button', { name: 'E2, floor', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Redo edit', exact: true }).click();
  await expect(
    proposedBoard(page).getByRole('button', { name: 'E2, wall, changed', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Puzzle title', { exact: true }).fill('A hand-drawn detour');
  await page.getByRole('button', { name: 'Apply board & play', exact: true }).click();
  await expect(
    currentBoard(page).getByRole('button', { name: 'B2, floor, player', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('0 moves', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'A hand-drawn detour', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: /My notebook/ }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Your puzzle notebook' })
      .getByText('The little escape', { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('dialog', { name: 'Your puzzle notebook' })
      .getByText('A hand-drawn detour', { exact: true }),
  ).toBeVisible();
});

test('keyboard moves, pushes, history navigation and restart use the same visible rules', async ({
  page,
}) => {
  await openApp(page);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await expect(
    currentBoard(page).getByRole('button', { name: 'C3, floor, player', exact: true }),
  ).toBeVisible();
  await expect(
    currentBoard(page).getByRole('button', { name: 'C4, floor, crate', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('2 moves', { exact: true })).toBeVisible();
  await expect(page.getByText('pushes', { exact: true }).locator('..')).toHaveText('1pushes');
  await page.getByRole('button', { name: 'Step back', exact: true }).click();
  await expect(
    currentBoard(page).getByRole('button', { name: 'C2, floor, player', exact: true }),
  ).toBeVisible();
  await expect(
    currentBoard(page).getByRole('button', { name: 'C3, floor, crate', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('pushes', { exact: true }).locator('..')).toHaveText('0pushes');
  await page.getByRole('button', { name: 'Step forward', exact: true }).click();
  await expect(
    currentBoard(page).getByRole('button', { name: 'C3, floor, player', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Return to starting position', exact: true }).click();
  await expect(
    currentBoard(page).getByRole('button', { name: 'B2, floor, player', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Go to move 2: down', exact: true }).click();
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await expect(page.getByText('0 moves', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Go to move/ })).toHaveCount(0);
  await page.keyboard.press('ArrowUp');
  await expect(page.getByText('A wall blocks the way.', { exact: true })).toBeVisible();
  await expect(page.getByText('0 moves', { exact: true })).toBeVisible();
});

test('prepared remix proves a 6 to 10 move increase and its solution replays to the exit', async ({
  page,
}) => {
  await openApp(page);
  await expect(
    page.getByRole('button', { name: 'Watch solution 6 steps', exact: true }),
  ).toBeEnabled();
  await page.getByRole('tab', { name: 'Remix', exact: true }).click();
  await page.getByRole('button', { name: 'Try a prepared change', exact: false }).click();
  await expect(page.getByText(/Shortest solution: 6 → 10 moves/)).toBeVisible();
  await expect(page.getByText('Prepared example', { exact: true })).toBeVisible();
  await expect(
    proposedBoard(page).getByRole('button', { name: 'E2, wall, changed', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept & play', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Accept & play', exact: true }).click();
  await page.getByRole('button', { name: 'Watch solution 10 steps', exact: true }).click();
  await page.getByRole('button', { name: 'Pause solution', exact: true }).click();
  const step = page.getByText(/^\d+ \/ 10$/);
  const before = Number((await step.innerText()).split('/')[0]);
  await page.getByRole('button', { name: 'Next solution step', exact: true }).click();
  await expect(step).toHaveText(`${before + 1} / 10`);
  await page.getByRole('button', { name: 'Previous solution step', exact: true }).click();
  await expect(step).toHaveText(`${before} / 10`);
  await page.getByLabel('Playback speed', { exact: true }).selectOption('180');
  await page.getByRole('button', { name: 'Play solution', exact: true }).click();
  await expect(page.getByText('Found your way!', { exact: true })).toBeVisible();
  await expect(
    currentBoard(page).getByRole('button', { name: 'E5, exit, player', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Next solution step', exact: true }),
  ).toBeDisabled();
});

test('editing a prepared longer proposal removes its stale length comparison', async ({ page }) => {
  await openApp(page);
  await page.getByRole('tab', { name: 'Remix', exact: true }).click();
  await page.getByRole('button', { name: 'Try a prepared change', exact: false }).click();
  await expect(page.getByText(/Shortest solution: 6 → 10 moves/)).toBeVisible();
  await page.getByRole('button', { name: 'Adjust by hand', exact: true }).click();
  await page.getByTitle('Floor (8)', { exact: true }).click();
  await proposedBoard(page).getByRole('button', { name: 'E2, wall, changed', exact: true }).click();
  await expect(page.getByText(/Shortest solution: 6 → 10 moves/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Accept & play', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Accept & play', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Watch solution 6 steps', exact: true }),
  ).toBeEnabled();
});

test('autosave restores an unfinished draft and the existing play history after reload', async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Move right', exact: true }).click();
  await page.getByRole('tab', { name: 'Draw', exact: true }).click();
  await page.getByLabel('Puzzle title', { exact: true }).fill('Tomorrow’s doodle');
  await proposedBoard(page).getByRole('button', { name: 'E2, floor', exact: true }).click();
  await expect.poll(async () => (await readNotebook(page))?.draft?.terrain[10]).toBe('wall');
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Draw', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByLabel('Puzzle title', { exact: true })).toHaveValue('Tomorrow’s doodle');
  await expect(
    proposedBoard(page).getByRole('button', { name: 'E2, wall, changed', exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Play', exact: true }).click();
  await expect(
    currentBoard(page).getByRole('button', { name: 'C2, floor, player', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('1 moves', { exact: true })).toBeVisible();
});

test('a mismatched mocked proposal request ID is rejected before changing the board', async ({
  page,
}) => {
  await openApp(page, true);
  await page.route('**/api/propose', async (route) => {
    const input = route.request().postDataJSON();
    await route.fulfill({
      json: {
        requestId: 'wrong-request-id',
        baseRevisionId: input.baseRevisionId,
        baseHash: input.baseHash,
        status: 'proposed',
        objective: 'longer',
        message: 'Mocked mismatched response.',
        candidates: [
          {
            explanation: 'A synthetic detour.',
            edits: [{ cell: 10, terrain: 'wall', occupant: 'none' }],
          },
        ],
      },
    });
  });
  await page.getByRole('tab', { name: 'Remix', exact: true }).click();
  await page
    .getByLabel('What would you change?', { exact: true })
    .fill('Make the shortest solution longer');
  await page.getByRole('button', { name: 'Propose a change', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /response|request/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Review the proposal', exact: true })).toHaveCount(
    0,
  );
  await expect(
    currentBoard(page).getByRole('button', { name: 'E2, floor', exact: true }),
  ).toBeVisible();
});

test.describe('touch viewport', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('touch movement, editing and the photo modal fit a 390 pixel screen', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Move right', exact: true }).tap();
    await expect(
      currentBoard(page).getByRole('button', { name: 'C2, floor, player', exact: true }),
    ).toBeVisible();
    await page.getByRole('tab', { name: 'Draw', exact: true }).tap();
    await proposedBoard(page).getByRole('button', { name: 'E2, floor', exact: true }).tap();
    await expect(
      proposedBoard(page).getByRole('button', { name: 'E2, wall, changed', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await page.getByRole('button', { name: /Start with a sketch/ }).tap();
    const modal = page.getByRole('dialog', { name: 'A sketch becomes a quest', exact: true });
    await expect(modal).toBeVisible();
    const bounds = await modal.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(391);
    expect(await modal.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Close photo import', exact: true }).tap();
    await expect(modal).toHaveCount(0);
  });
});
