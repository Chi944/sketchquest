import { test, expect } from '@playwright/test';
import { acceptMockedPhoto, currentBoard, openApp, proposedBoard, readNotebook } from './helpers';

test('a photo-derived puzzle shares through local D1 into a clean context without its photograph', async ({
  page,
  browser,
}) => {
  await openApp(page, true);
  await acceptMockedPhoto(page);
  let posted: Record<string, unknown> | undefined;
  page.on('request', (request) => {
    if (request.url().endsWith('/api/shares') && request.method() === 'POST')
      posted = request.postDataJSON();
  });
  await page.getByRole('button', { name: 'Share current puzzle', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Pass the adventure along', exact: true }),
  ).toBeVisible();
  const url = await page.getByLabel('Shared puzzle link', { exact: true }).inputValue();
  expect(new URL(url).pathname).toMatch(/^\/s\/[A-Za-z0-9_-]{22}$/);
  expect(Object.keys(posted!).sort()).toEqual(['board', 'title']);
  expect(JSON.stringify(posted)).not.toMatch(
    /private-synthetic-camera|previewUrl|data:image|blob:/,
  );

  const visitor = await browser.newContext();
  try {
    const clean = await visitor.newPage();
    await clean.goto(url);
    await expect(currentBoard(clean).getByRole('button')).toHaveCount(16);
    await expect(
      clean.getByRole('heading', { name: 'From my sketch', exact: true, level: 1 }),
    ).toBeVisible();
    await expect(clean.getByRole('tab', { name: 'Draw', exact: true })).toHaveCount(0);
    await expect(clean.getByRole('tab', { name: 'Remix', exact: true })).toHaveCount(0);
    await expect(clean.getByRole('button', { name: /My notebook/ })).toHaveCount(0);
    await expect(clean.locator('img')).toHaveCount(0);
    await clean.getByRole('button', { name: 'Move right', exact: true }).click();
    await expect(
      currentBoard(clean).getByRole('button', { name: 'B1, floor, player', exact: true }),
    ).toBeVisible();
    const response = await visitor.request.get(
      new URL(`/api/shares/${new URL(url).pathname.split('/').pop()}`, url).href,
    );
    expect(response.ok()).toBe(true);
    const record = await response.json();
    expect(Object.keys(record).sort()).toEqual(['board', 'createdAt', 'id', 'title']);
    expect(record.board.width).toBe(4);
    expect(JSON.stringify(record)).not.toMatch(
      /private-synthetic-camera|previewUrl|data:image|blob:/,
    );
  } finally {
    await visitor.close();
  }
});

test('copying a shared puzzle preserves an existing notebook and parked draft in the same browser', async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Share current puzzle', exact: true }).click();
  const field = page.getByLabel('Shared puzzle link', { exact: true });
  await expect(field).toBeVisible();
  const sharedUrl = await field.inputValue();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('tab', { name: 'Draw', exact: true }).click();
  await page.getByLabel('Puzzle title', { exact: true }).fill('A draft worth keeping');
  await proposedBoard(page).getByRole('button', { name: 'E2, floor', exact: true }).click();
  await expect
    .poll(async () => (await readNotebook(page))?.draftTitle)
    .toBe('A draft worth keeping');
  const previous = await readNotebook(page);
  if (!previous) throw new Error('The existing notebook was not saved.');
  await page.goto(sharedUrl);
  await expect(currentBoard(page)).toBeVisible();
  await page.getByRole('button', { name: 'Make your own version', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect
    .poll(async () => (await readNotebook(page))?.revisions.length)
    .toBeGreaterThan(previous.revisions.length);
  const after = await readNotebook(page);
  if (!after) throw new Error('The copied notebook was not saved.');
  expect(
    previous.revisions.every((revision: { id: string }) =>
      after.revisions.some((kept: { id: string }) => kept.id === revision.id),
    ),
  ).toBe(true);
  expect(after.parkedDrafts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        baseRevisionId: previous.activeRevisionId,
        title: 'A draft worth keeping',
        board: previous.draft,
      }),
    ]),
  );
  expect(after.activeRevisionId).not.toBe(previous.activeRevisionId);
  await page.getByRole('button', { name: /My notebook/ }).click();
  const notebook = page.getByRole('dialog', { name: 'Your puzzle notebook', exact: true });
  await expect(notebook.getByText('A draft worth keeping', { exact: true })).toBeVisible();
  await notebook.getByRole('button', { name: 'Continue draft', exact: true }).click();
  await expect(page.getByLabel('Puzzle title', { exact: true })).toHaveValue(
    'A draft worth keeping',
  );
  await expect(
    proposedBoard(page).getByRole('button', { name: 'E2, wall, changed', exact: true }),
  ).toBeVisible();
});

test('malformed shared data is rejected on the server and bad links fail clearly', async ({
  page,
  request,
  baseURL,
}) => {
  const rejected = await request.post('/api/shares', {
    headers: { Origin: baseURL! },
    data: {
      title: 'Bad board',
      board: { width: 999, height: 4, terrain: [], player: 0, crates: [] },
    },
  });
  expect(rejected.status()).toBe(422);
  expect((await rejected.json()).error.code).toBe('INVALID_BOARD');
  await page.goto('/s/not-a-valid-share-id');
  await expect(
    page.getByRole('heading', { name: 'This adventure couldn’t be opened', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('This shared puzzle was not found.', { exact: true })).toBeVisible();
  await expect(currentBoard(page)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Make a puzzle', exact: true })).toHaveAttribute(
    'href',
    '/',
  );
});
