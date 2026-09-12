import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { openApp, proposedBoard, uploadSynthetic } from './helpers';

async function audit(page: Page, testInfo: TestInfo, state: string) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  await testInfo.attach(`axe-${state}.json`, {
    body: JSON.stringify(
      { url: result.url, violations: result.violations, incomplete: result.incomplete },
      null,
      2,
    ),
    contentType: 'application/json',
  });
  expect
    .soft(
      result.violations.map(({ id, impact, nodes }) => ({
        id,
        impact,
        nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
      })),
      `Accessibility violations in ${state}`,
    )
    .toEqual([]);
}

async function tabTo(page: Page, target: Locator) {
  for (let step = 0; step < 30; step++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  await expect(
    target,
    'The target must be reachable using Tab without a focus trap.',
  ).toBeFocused();
}

async function expectNoHorizontalOverflow(page: Page) {
  expect
    .soft(
      await page.evaluate(() => ({
        actual: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
      })),
    )
    .toEqual({ actual: 320, viewport: 320 });
}

test('desktop play and rules dialog pass the automated accessibility audit', async ({
  page,
}, testInfo) => {
  await openApp(page);
  await audit(page, testInfo, 'desktop-play');
  const rulesButton = page.getByRole('button', { name: 'Puzzle rules', exact: true });
  await rulesButton.click();
  const dialog = page.getByRole('dialog', { name: 'Small world. Simple rules.', exact: true });
  await expect(dialog).toBeVisible();
  await audit(page, testInfo, 'rules-dialog');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(rulesButton).toBeFocused();
});

test('keyboard users can navigate mode tabs and edit a board through one grid tab stop', async ({
  page,
}) => {
  await openApp(page);
  const play = page.getByRole('tab', { name: 'Play', exact: true });
  const draw = page.getByRole('tab', { name: 'Draw', exact: true });
  const remix = page.getByRole('tab', { name: 'Remix', exact: true });
  await play.focus();
  await page.keyboard.press('ArrowRight');
  await expect.soft(draw, 'ARIA tabs must respond to right/left arrow navigation.').toBeFocused();
  // Enter also supports manual-activation tab implementations.
  await page.keyboard.press('Enter');
  if (!((await draw.getAttribute('aria-selected')) === 'true')) await draw.press('Enter');
  await expect(draw).toHaveAttribute('aria-selected', 'true');
  await draw.focus();
  await page.keyboard.press('End');
  await expect.soft(remix, 'End should reach the last mode tab.').toBeFocused();
  await draw.press('Enter');
  const board = proposedBoard(page);
  const firstCell = board.getByRole('button', { name: 'A1, wall', exact: true });
  await tabTo(page, firstCell);
  await page.keyboard.press('ArrowRight');
  await expect(board.getByRole('button', { name: 'B1, wall', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(board.getByRole('button', { name: 'B2, floor, player', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  await expect(firstCell).toBeFocused();
  await page.keyboard.press('8');
  await page.keyboard.press('Enter');
  const edited = board.getByRole('button', { name: 'A1, floor, changed', exact: true });
  await expect(edited).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Undo edit', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(edited).toBeFocused();
  for (let index = 0; index < 5; index++) await page.keyboard.press('ArrowRight');
  const rowEnd = board.getByRole('button', { name: 'F1, wall', exact: true });
  await expect(rowEnd).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect
    .soft(rowEnd, 'A right arrow at the grid edge should not jump to a different row.')
    .toBeFocused();
});

test.describe('320 pixel accessibility', () => {
  test.use({ viewport: { width: 320, height: 812 }, isMobile: true, hasTouch: true });

  test('editing, remix and a prepared proposal fit the screen and pass automated checks', async ({
    page,
  }, testInfo) => {
    await openApp(page);
    await page.getByRole('tab', { name: 'Draw', exact: true }).tap();
    await expectNoHorizontalOverflow(page);
    await audit(page, testInfo, '320-edit');
    await page.getByRole('tab', { name: 'Remix', exact: true }).tap();
    await expectNoHorizontalOverflow(page);
    await audit(page, testInfo, '320-remix');
    await page.getByRole('button', { name: /Try a prepared change/ }).tap();
    await expect(page.getByRole('button', { name: 'Accept & play', exact: true })).toBeEnabled();
    await expectNoHorizontalOverflow(page);
    await audit(page, testInfo, '320-proposal-review');
  });

  test('photo preparation and notebook dialogs remain accessible on a narrow screen', async ({
    page,
  }, testInfo) => {
    await openApp(page, true);
    const uploadButton = page.getByRole('button', { name: /Start with a sketch/ });
    await uploadSynthetic(page);
    await page.getByRole('checkbox', { name: 'I know the grid size', exact: true }).check();
    const dialog = page.getByRole('dialog', { name: 'A sketch becomes a quest', exact: true });
    await expectNoHorizontalOverflow(page);
    expect
      .soft(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1))
      .toBe(true);
    await audit(page, testInfo, '320-photo-preparation');
    // Native dialog focus must not enter background controls. Chromium may briefly
    // report body while keyboard focus moves through browser chrome between cycles.
    for (let index = 0; index < 30; index++) {
      await page.keyboard.press('Tab');
      expect
        .soft(
          await dialog.evaluate(
            (element) =>
              document.activeElement === document.body || element.contains(document.activeElement),
          ),
        )
        .toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect.soft(uploadButton).toBeFocused();
    await page.getByRole('button', { name: /My notebook/ }).tap();
    await expect(
      page.getByRole('dialog', { name: 'Your puzzle notebook', exact: true }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await audit(page, testInfo, '320-notebook');
  });
});
