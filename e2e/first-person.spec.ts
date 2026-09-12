import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { boardFromAscii } from '../src/core/board';
import { replay } from '../src/core/rules';
import type { Direction } from '../src/core/types';
import { currentBoard, importPuzzle, openFirstVisit, readNotebook } from './helpers';

const inventoryPuzzle = boardFromAscii(
  ['#######', '#PKD.E#', '#.F.R.#', '#.S~..#', '#.....#', '#######'],
  3,
);
const openCourtyard = boardFromAscii(
  ['######', '#....#', '#.P..#', '#....#', '#...E#', '######'],
  3,
);

// These checks examine directional semantics and item transitions without travel throttling.
// The expedition suite separately covers the normal-motion first visit and its actual canvas.
test.use({ reducedMotion: 'reduce' });

async function savedRun(page: Page) {
  const workspace = await readNotebook(page);
  if (!workspace) return null;
  const revision = workspace.revisions.find((entry) => entry.id === workspace.activeRevisionId);
  const session = workspace.sessions[workspace.activeRevisionId];
  if (!revision || !session) return null;
  return replay(revision.board, session.moves.slice(0, session.cursor));
}

async function expectMoves(page: Page, moves: Direction[]) {
  await expect
    .poll(async () => {
      const workspace = await readNotebook(page);
      const session = workspace?.sessions[workspace.activeRevisionId];
      return session && session.moves.slice(0, session.cursor);
    })
    .toEqual(moves);
}

test('first-person WASD follows facing, Q/E turn without spending moves, and map/grid retain position', async ({
  page,
}) => {
  await openFirstVisit(page);
  await importPuzzle(page, openCourtyard, 'A courtyard for turning');
  await expect(page.locator('[data-camera="first-person"]')).toBeVisible();
  await expect(page.getByLabel('Facing East', { exact: true })).toBeVisible();
  const moves: Direction[] = [];
  for (const [key, direction] of [
    ['w', 'right'],
    ['s', 'left'],
    ['a', 'up'],
    ['d', 'down'],
  ] as const) {
    await page.keyboard.press(key);
    moves.push(direction);
    await expectMoves(page, moves);
  }
  await page.keyboard.press('e');
  await expect(page.getByLabel('Facing South', { exact: true })).toBeVisible();
  await expect(page.locator('[data-camera="first-person"]')).toHaveAttribute('data-facing', 'down');
  await expectMoves(page, moves);
  await page.keyboard.press('w');
  moves.push('down');
  await expectMoves(page, moves);
  await page.keyboard.press('q');
  await expect(page.getByLabel('Facing East', { exact: true })).toBeVisible();
  await expectMoves(page, moves);
  await page.keyboard.press('w');
  moves.push('right');
  await expectMoves(page, moves);
  await page.getByRole('button', { name: '3D world view', exact: true }).click();
  await expect(page.locator('[data-camera="overview"]')).toBeVisible();
  await page.getByRole('button', { name: '2D grid view', exact: true }).click();
  await expect(
    currentBoard(page).getByRole('button', { name: 'D4, floor, player', exact: true }),
  ).toBeVisible();
  await expectMoves(page, moves);
  await page.getByRole('button', { name: 'First-person view', exact: true }).click();
  await expect(page.getByLabel('Facing East', { exact: true })).toBeVisible();
  await expect(page.locator('[data-camera="first-person"]')).toBeVisible();
  await expectMoves(page, moves);
});

test('a collected brass key opens one gate, is consumed, and never respawns on return or reload', async ({
  page,
}) => {
  await openFirstVisit(page);
  await importPuzzle(page, inventoryPuzzle, 'A key stays in its lock');
  const inventory = page.getByRole('group', { name: 'Explorer inventory', exact: true });
  await expect(inventory.getByLabel('Brass key not found', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Take brass key', exact: true }).click();
  await expect(inventory.getByLabel('Carrying brass key', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Use key & open gate', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Use key & open gate', exact: true }).click();
  await expect(inventory.getByLabel('Gate open', { exact: true })).toBeVisible();
  await expect(inventory.getByLabel('Carrying brass key', { exact: true })).toHaveCount(0);
  await page.keyboard.press('s');
  await expectMoves(page, ['right', 'right', 'left']);
  await expect.poll(async () => (await savedRun(page))?.state.hasKey).toBe(false);
  await expect.poll(async () => (await savedRun(page))?.state.doorOpened).toBe(true);
  await page.reload();
  await expect(inventory.getByLabel('Gate open', { exact: true })).toBeVisible();
  await expect(inventory.getByLabel('Carrying brass key', { exact: true })).toHaveCount(0);
  await page.keyboard.press('w');
  await expectMoves(page, ['right', 'right', 'left', 'right']);
  await expect.poll(async () => (await savedRun(page))?.state.hasKey).toBe(false);
  await expect(page.getByRole('button', { name: 'Use key & open gate', exact: true })).toHaveCount(
    0,
  );
});

test('open dialogs and text inputs do not capture first-person movement or turning', async ({
  page,
}) => {
  await openFirstVisit(page);
  await importPuzzle(page, openCourtyard, 'Keep typing in the notebook');
  await page.getByRole('button', { name: 'Puzzle rules', exact: true }).click();
  await page.keyboard.press('w');
  await page.keyboard.press('e');
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Facing East', { exact: true })).toBeVisible();
  await expect.poll(async () => (await savedRun(page))?.moves).toBe(0);
  await page.getByRole('tab', { name: 'Draw', exact: true }).click();
  await page.getByLabel('Puzzle title', { exact: true }).fill('we saw a quiet eastward trail');
  await page.getByRole('tab', { name: 'Play', exact: true }).click();
  await expect.poll(async () => (await savedRun(page))?.moves).toBe(0);
  await expect(page.getByLabel('Facing East', { exact: true })).toBeVisible();
});

test('boots protect against spikes, but water kills with carried items; undo, reload and retry preserve the right inventory', async ({
  page,
}) => {
  await openFirstVisit(page);
  await importPuzzle(page, inventoryPuzzle, 'Boots cannot make you swim');
  const inventory = page.getByRole('group', { name: 'Explorer inventory', exact: true });
  const death = page.getByRole('alert', { name: 'Journey ended', exact: true });
  await page.keyboard.press('w');
  await expect(inventory.getByLabel('Carrying brass key', { exact: true })).toBeVisible();
  await page.keyboard.press('d');
  await expect(inventory.getByLabel('Iron boots equipped', { exact: true })).toBeVisible();
  await page.keyboard.press('d');
  await expectMoves(page, ['right', 'down', 'down']);
  await expect.poll(async () => (await savedRun(page))?.state.player).toBe(23);
  await expect(death).toHaveCount(0);
  for (const key of ['a', 'w', 'w']) await page.keyboard.press(key);
  await expect(inventory.getByLabel('Exit ready, 1 of 1 relics', { exact: true })).toBeVisible();
  await page.keyboard.press('d');
  await page.keyboard.press('s');
  await expect(death).toBeVisible();
  await expect(death).toContainText('A key or iron boots cannot keep you afloat');
  await expect(inventory.getByLabel('Carrying brass key', { exact: true })).toBeVisible();
  await expect(inventory.getByLabel('Iron boots equipped', { exact: true })).toBeVisible();
  await expect(inventory.getByLabel('Exit ready, 1 of 1 relics', { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole('group', { name: 'First-person movement controls' })
      .getByRole('button', { name: 'Walk forward', exact: true }),
  ).toBeDisabled();
  const fatalPath: Direction[] = ['right', 'down', 'down', 'up', 'right', 'right', 'down', 'left'];
  await expectMoves(page, fatalPath);
  await page.keyboard.press('w');
  await expectMoves(page, fatalPath);
  await expect.poll(async () => (await savedRun(page))?.state.dead).toBe(true);
  await page.reload();
  await expect(death).toBeVisible();
  await expect(inventory.getByLabel('Carrying brass key', { exact: true })).toBeVisible();
  await expect(inventory.getByLabel('Iron boots equipped', { exact: true })).toBeVisible();
  await expect(inventory.getByLabel('Exit ready, 1 of 1 relics', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo fatal step', exact: true }).click();
  await expect(death).toHaveCount(0);
  await expectMoves(page, fatalPath.slice(0, -1));
  await expect.poll(async () => (await savedRun(page))?.state.dead).toBe(false);
  await expect(inventory.getByLabel('Carrying brass key', { exact: true })).toBeVisible();
  await expect(inventory.getByLabel('Iron boots equipped', { exact: true })).toBeVisible();
  await expect(inventory.getByLabel('Exit ready, 1 of 1 relics', { exact: true })).toBeVisible();
  await page.keyboard.press('s');
  await expect(death).toBeVisible();
  await page.getByRole('button', { name: 'Retry expedition', exact: true }).click();
  await expect(death).toHaveCount(0);
  await expect.poll(async () => (await savedRun(page))?.moves).toBe(0);
  await expect(inventory.getByLabel('Brass key not found', { exact: true })).toBeVisible();
  await expect(inventory.getByLabel('Iron boots not found', { exact: true })).toBeVisible();
  await expect(inventory.getByLabel('Exit dormant, 0 of 1 relics', { exact: true })).toBeVisible();
});

test('carrying a key does not protect bare feet from spikes, and the grid explains the death', async ({
  page,
}) => {
  await openFirstVisit(page);
  await importPuzzle(page, inventoryPuzzle, 'A key is not protective equipment');
  for (const key of ['w', 's', 'd', 'd', 'w']) await page.keyboard.press(key);
  await expectMoves(page, ['right', 'left', 'down', 'down', 'right']);
  const death = page.getByRole('alert', { name: 'Journey ended', exact: true });
  await expect(death).toBeVisible();
  await expect(death).toContainText('Find the iron boots before crossing');
  const inventory = page.getByRole('group', { name: 'Explorer inventory', exact: true });
  await expect(inventory.getByLabel('Carrying brass key', { exact: true })).toBeVisible();
  await expect(inventory.getByLabel('Iron boots not found', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '2D grid view', exact: true }).click();
  await expect(
    currentBoard(page).getByRole('button', {
      name: 'C4, spikes, player, fallen in spikes',
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Step back', exact: true }).click();
  await expect(death).toHaveCount(0);
  await expect(
    currentBoard(page).getByRole('button', { name: 'B4, floor, player', exact: true }),
  ).toBeVisible();
  await expect.poll(async () => (await savedRun(page))?.state.hasKey).toBe(true);
});

test.describe('first-person touch controls', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('touch movement and turns remain accessible beside the 3D scene on a phone', async ({
    page,
  }, testInfo) => {
    await openFirstVisit(page);
    await importPuzzle(page, openCourtyard, 'A pocket-sized courtyard');
    const controls = page.getByRole('group', {
      name: 'First-person movement controls',
      exact: true,
    });
    await controls.getByRole('button', { name: 'Walk forward', exact: true }).tap();
    await controls.getByRole('button', { name: 'Walk backward', exact: true }).tap();
    await controls.getByRole('button', { name: 'Turn right', exact: true }).tap();
    await expect(page.getByLabel('Facing South', { exact: true })).toBeVisible();
    await controls.getByRole('button', { name: 'Walk forward', exact: true }).tap();
    await expectMoves(page, ['right', 'left', 'down']);
    for (const button of await controls.getByRole('button').all()) {
      const box = await button.boundingBox();
      const label = await button.getAttribute('aria-label');
      expect.soft(box!.width, `${label} touch target width`).toBeGreaterThanOrEqual(44);
      expect.soft(box!.height, `${label} touch target height`).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    await testInfo.attach('axe-mobile-first-person.json', {
      body: JSON.stringify(audit.violations, null, 2),
      contentType: 'application/json',
    });
    expect(
      audit.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) })),
    ).toEqual([]);
    await page.getByRole('button', { name: '2D grid view', exact: true }).tap();
    await expect(
      currentBoard(page).getByRole('button', { name: 'C4, floor, player', exact: true }),
    ).toBeVisible();
  });
});
