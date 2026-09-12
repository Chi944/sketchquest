import { expect, test, type Page } from '@playwright/test';
import { EXPEDITIONS } from '../src/core/examples';
import { solve } from '../src/solver/search';
import { currentBoard, openApp, openFirstVisit, proposedBoard, readNotebook } from './helpers';

async function webglAvailable(page: Page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2');
    const supported = Boolean(context);
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    return supported;
  });
}

async function expectWorldOrExplicitFallback(
  page: Page,
  view: 'First-person view' | '3D world view' = 'First-person view',
) {
  const supported = await webglAvailable(page);
  if (!supported) {
    test.info().annotations.push({
      type: 'WebGL unavailable',
      description:
        'An independent WebGL 2 probe failed; this run verifies the explicit grid fallback.',
    });
    await expect(page.getByText('Grid view · 3D unavailable', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '3D world view', exact: true })).toBeDisabled();
    await expect(currentBoard(page)).toBeVisible();
    return false;
  }
  await expect(page.getByRole('button', { name: view, exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const canvas = page.locator('canvas').filter({ visible: true });
  await expect(canvas).toHaveCount(1);
  await expect
    .poll(() =>
      canvas.evaluate((element) => {
        const drawing = element as HTMLCanvasElement;
        return drawing.width > 0 && drawing.height > 0;
      }),
    )
    .toBe(true);
  await expect(page.getByText('Opening your little world…', { exact: true })).toHaveCount(0);
  await expect(
    page.locator(`[data-camera="${view === 'First-person view' ? 'first-person' : 'overview'}"]`),
  ).toBeVisible();
  return true;
}

test('first visit renders the first-person expedition, and map/grid changes preserve play and reload preference', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openFirstVisit(page);
  await expect(
    page.getByRole('heading', { name: EXPEDITIONS[0].title, level: 2, exact: true }),
  ).toBeVisible();
  const supported = await expectWorldOrExplicitFallback(page);
  if (supported) await page.keyboard.press('w');
  else await page.getByRole('button', { name: 'Move right', exact: true }).click();
  await page.getByRole('button', { name: '2D grid view', exact: true }).click();
  await expect(
    currentBoard(page).getByRole('button', { name: 'C2, floor, player', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('1 moves', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sketchquest-view'))).toBe('2d');
  await expect
    .poll(async () => {
      const workspace = await readNotebook(page);
      return workspace?.sessions[workspace.activeRevisionId]?.cursor;
    })
    .toBe(1);
  await page.reload();
  await expect(page.getByRole('button', { name: '2D grid view', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    currentBoard(page).getByRole('button', { name: 'C2, floor, player', exact: true }),
  ).toBeVisible();
  if (supported) {
    await page.getByRole('button', { name: '3D world view', exact: true }).click();
    await expectWorldOrExplicitFallback(page, '3D world view');
    await page.getByRole('button', { name: 'Step back', exact: true }).click();
    await page.getByRole('button', { name: '2D grid view', exact: true }).click();
    await expect(
      currentBoard(page).getByRole('button', { name: 'B2, floor, player', exact: true }),
    ).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('reduced motion keeps the 3D scene still while movement remains usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openFirstVisit(page);
  const supported = await expectWorldOrExplicitFallback(page);
  if (supported) {
    const canvas = page.locator('canvas').filter({ visible: true });
    const firstFrame = await canvas.screenshot({ animations: 'allow' });
    // A real interval checks that idle Three.js motion honors the user's preference.
    await page.waitForTimeout(300);
    const laterFrame = await canvas.screenshot({ animations: 'allow' });
    expect(Array.from(laterFrame), 'Reduced-motion idle frames should be identical').toEqual(
      Array.from(firstFrame),
    );
  }
  if (supported) await page.keyboard.press('w');
  else await page.getByRole('button', { name: 'Move right', exact: true }).click();
  await page.getByRole('button', { name: '2D grid view', exact: true }).click();
  await expect(
    currentBoard(page).getByRole('button', { name: 'C2, floor, player', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('unavailable WebGL produces an explicit playable grid fallback', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      kind: string,
      ...args: unknown[]
    ) {
      if (kind === 'webgl' || kind === 'webgl2' || kind === 'experimental-webgl') return null;
      return Reflect.apply(original, this, [kind, ...args]);
    } as typeof original;
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openFirstVisit(page);
  await expect(page.getByText('Grid view · 3D unavailable', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '3D world view', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Move right', exact: true }).click();
  await expect(
    currentBoard(page).getByRole('button', { name: 'C2, floor, player', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('world navigation starts the corresponding expedition and retains its board on reload', async ({
  page,
}) => {
  await openApp(page);
  for (const [name, theme] of [
    ['Forest ruins', 'forest'],
    ['Sunken coast', 'coast'],
    ['Frozen passage', 'frost'],
  ] as const) {
    const quest = EXPEDITIONS.find((entry) => entry.theme === theme)!;
    await page.getByRole('button', { name, exact: true }).click();
    await expect(
      page.getByRole('heading', { name: quest.title, level: 2, exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const workspace = await readNotebook(page);
        return workspace?.revisions.find((revision) => revision.id === workspace.activeRevisionId)
          ?.board;
      })
      .toEqual(quest.board);
    await expect(page.getByText('0 moves', { exact: true })).toBeVisible();
  }
  await page.reload();
  const frozen = EXPEDITIONS.find((entry) => entry.theme === 'frost')!;
  await expect(
    page.getByRole('heading', { name: frozen.title, level: 2, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Ice carries you until solid ground.', { exact: true }),
  ).toBeVisible();
});

for (const quest of EXPEDITIONS) {
  test(`${quest.title}: chapter card loads the verified puzzle and replays every relic to the exit`, async ({
    page,
  }) => {
    await openApp(page);
    await page
      .getByRole('button', { name: `Play expedition: ${quest.title}`, exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: quest.title, level: 2, exact: true }),
    ).toBeVisible();
    const expected = await solve(quest.board);
    expect(expected.status, 'The shipped expedition must have a verified solution').toBe('solved');
    if (expected.status !== 'solved') throw new Error(`${quest.title} did not solve`);
    await expect(
      page.getByRole('heading', { name: 'Verified solvable', exact: true }),
    ).toBeVisible();
    const watch = page.getByRole('button', {
      name: `Watch solution ${expected.moves} steps`,
      exact: true,
    });
    await expect(watch).toBeEnabled();
    const relics = quest.board.terrain.filter((terrain) => terrain === 'relic').length;
    await expect(page.getByText(`0 / ${relics} relics`, { exact: true })).toBeVisible();
    await watch.click();
    await page.getByLabel('Playback speed', { exact: true }).selectOption('180');
    await expect(page.getByText('Found your way!', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(`${relics} / ${relics} relics`, { exact: true })).toBeVisible();
    await expect(page.getByText('The exit is ready', { exact: true })).toBeVisible();
    const exit = quest.board.terrain.indexOf('exit');
    const coordinate = `${String.fromCharCode(65 + (exit % quest.board.width))}${Math.floor(exit / quest.board.width) + 1}`;
    await expect(
      currentBoard(page).getByRole('button', { name: `${coordinate}, exit, player`, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Next solution step', exact: true }),
    ).toBeDisabled();
    await page.getByRole('button', { name: 'Exit solution replay', exact: true }).click();
    await expect(page.getByText(`0 / ${relics} relics`, { exact: true })).toBeVisible();
    await expect(page.getByText('0 moves', { exact: true })).toBeVisible();
  });
}

test('water, bridge, ice and relic tools save and restore a rules version 2 puzzle', async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole('tab', { name: 'Draw', exact: true }).click();
  const edits = [
    { tool: 'Water (9)', coordinate: 'B4', cell: 19, terrain: 'water' },
    { tool: 'Bridge (0)', coordinate: 'B5', cell: 25, terrain: 'bridge' },
    { tool: 'Ice (i)', coordinate: 'C2', cell: 8, terrain: 'ice' },
    { tool: 'Relic (r)', coordinate: 'E2', cell: 10, terrain: 'relic' },
  ];
  for (const edit of edits) {
    await page.getByTitle(edit.tool, { exact: true }).click();
    await proposedBoard(page)
      .getByRole('button', { name: `${edit.coordinate}, floor`, exact: true })
      .click();
    await expect(
      proposedBoard(page).getByRole('button', {
        name: `${edit.coordinate}, ${edit.terrain}, changed`,
        exact: true,
      }),
    ).toBeVisible();
  }
  await page.getByLabel('Puzzle title', { exact: true }).fill('My river and ice expedition');
  await expect.poll(async () => (await readNotebook(page))?.draft?.rulesVersion).toBe(2);
  await page.getByRole('button', { name: 'Apply board & play', exact: true }).click();
  await expect
    .poll(async () => {
      const workspace = await readNotebook(page);
      const revision = workspace?.revisions.find(
        (entry) => entry.id === workspace.activeRevisionId,
      );
      return (
        revision && {
          title: revision.title,
          rulesVersion: revision.board.rulesVersion,
          terrain: edits.map((edit) => revision.board.terrain[edit.cell]),
        }
      );
    })
    .toEqual({
      title: 'My river and ice expedition',
      rulesVersion: 2,
      terrain: edits.map((edit) => edit.terrain),
    });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'My river and ice expedition', exact: true }),
  ).toBeVisible();
  for (const edit of edits) {
    await expect(
      currentBoard(page).getByRole('button', {
        name: `${edit.coordinate}, ${edit.terrain}`,
        exact: true,
      }),
    ).toBeVisible();
  }
  await expect(page.getByText('0 / 1 relics', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Move right', exact: true }).click();
  await expect(
    currentBoard(page).getByRole('button', {
      name: 'D2, floor, key collected, player',
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText('1 moves', { exact: true })).toBeVisible();
});
