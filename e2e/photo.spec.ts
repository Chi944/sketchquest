import { test, expect } from '@playwright/test';
import {
  currentBoard,
  mockedInterpretation,
  multipart,
  openApp,
  proposedBoard,
  syntheticPhoto,
  uploadSynthetic,
} from './helpers';

test('mocked extraction is sent only on request and uncertain cells require review', async ({
  page,
}) => {
  await openApp(page, true);
  let requests = 0;
  await page.route('**/api/interpret', async (route) => {
    requests++;
    const form = await multipart(route);
    expect(form.has('width')).toBe(false);
    expect(form.has('height')).toBe(false);
    expect(form.has('legend')).toBe(false);
    const image = form.get('image') as File;
    expect(image.name).toBe('sketchquest-crop.jpg');
    expect(image.type).toBe('image/jpeg');
    expect(image.size).toBeLessThanOrEqual(1024 * 1024);
    const bytes = new Uint8Array(await image.arrayBuffer());
    expect([...bytes.subarray(0, 2)]).toEqual([255, 216]);
    await route.fulfill({
      json: {
        requestId: form.get('requestId'),
        interpretation: mockedInterpretation(),
        metrics: { latencyMs: 1 },
      },
    });
  });
  await uploadSynthetic(page);
  expect(requests).toBe(0);
  await page.getByRole('button', { name: 'Interpret photo', exact: true }).click();
  await expect(proposedBoard(page).getByRole('button')).toHaveCount(16);
  await expect(
    page.getByRole('img', { name: 'Your prepared sketch, kept private', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('1 cell needs a second look', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept & play', exact: true })).toBeDisabled();
  await expect(
    proposedBoard(page).getByRole('button', { name: /^B2, floor, crate, changed, needs review$/ }),
  ).toBeVisible();
  await page.getByTitle('Erase (7)', { exact: true }).click();
  await proposedBoard(page)
    .getByRole('button', { name: /^B2, floor, crate, changed, needs review$/ })
    .click();
  await expect(page.getByText('1 cell needs a second look', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Accept & play', exact: true }).click();
  await expect(
    currentBoard(page).getByRole('button', { name: 'A1, floor, player', exact: true }),
  ).toBeVisible();
  await expect(
    currentBoard(page).getByRole('button', { name: 'B2, floor', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'Your prepared sketch, kept private', exact: true }),
  ).toHaveCount(0);
  expect(requests).toBe(1);
});

test('malformed files fail locally and a mocked quota failure keeps the selected photo', async ({
  page,
}) => {
  await openApp(page, true);
  let requests = 0;
  await page.route('**/api/interpret', async (route) => {
    requests++;
    await route.fulfill({
      status: 429,
      json: {
        error: {
          code: 'QUOTA_EXHAUSTED',
          message: 'The shared free allowance is used up.',
          retryAfter: 60,
        },
      },
    });
  });
  await page.getByRole('button', { name: /Start with a sketch/ }).click();
  await page.getByLabel('Choose puzzle photo', { exact: true }).setInputFiles({
    name: 'broken.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('not an image'),
  });
  await expect(page.getByRole('alert')).toContainText('could not be opened');
  expect(requests).toBe(0);
  const photo = await syntheticPhoto(page);
  await page.getByLabel('Choose puzzle photo', { exact: true }).setInputFiles(photo);
  await expect(page.getByRole('img', { name: /Your puzzle photo/ })).toBeVisible();
  await page.getByRole('button', { name: 'Interpret photo', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('The shared free allowance is used up.');
  await expect(page.getByRole('img', { name: /Your puzzle photo/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Interpret photo', exact: true })).toBeEnabled();
  expect(requests).toBe(1);
});

for (const cancelAction of ['change crop', 'close modal'] as const) {
  test(`a delayed mocked image response is discarded after ${cancelAction}`, async ({ page }) => {
    await openApp(page, true);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requested!: () => void;
    const didRequest = new Promise<void>((resolve) => {
      requested = resolve;
    });
    let finished!: () => void;
    const didFinish = new Promise<void>((resolve) => {
      finished = resolve;
    });
    await page.route('**/api/interpret', async (route) => {
      const form = await multipart(route);
      requested();
      await gate;
      try {
        await route.fulfill({
          json: { requestId: form.get('requestId'), interpretation: mockedInterpretation(false) },
        });
      } catch {
        /* The browser may have already completed aborting the request. */
      } finally {
        finished();
      }
    });
    await uploadSynthetic(page);
    await page.getByRole('button', { name: 'Interpret photo', exact: true }).click();
    await didRequest;
    const aborted = page.waitForEvent('requestfailed', {
      predicate: (request) => request.url().endsWith('/api/interpret'),
    });
    if (cancelAction === 'change crop') {
      await page.getByRole('slider', { name: /Left edge/ }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(
        page.getByRole('button', { name: 'Interpret photo', exact: true }),
      ).toBeEnabled();
    } else {
      await page.getByRole('button', { name: 'Close photo import', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    await aborted;
    release();
    await didFinish;
    await expect(proposedBoard(page)).toHaveCount(0);
    await expect(currentBoard(page).getByRole('button')).toHaveCount(36);
    if (cancelAction === 'change crop')
      await expect(page.getByRole('img', { name: /Your puzzle photo/ })).toBeVisible();
  });
}

test('explicit grid and symbol legend accompany the crop without accepting the result automatically', async ({
  page,
}) => {
  await openApp(page, true);
  await page.route('**/api/interpret', async (route) => {
    const form = await multipart(route);
    expect(form.get('width')).toBe('4');
    expect(form.get('height')).toBe('4');
    expect(form.get('legend')).toBe('The letter E is the exit.');
    await route.fulfill({
      json: { requestId: form.get('requestId'), interpretation: mockedInterpretation(false) },
    });
  });
  await uploadSynthetic(page);
  await page.getByRole('checkbox', { name: 'I know the grid size', exact: true }).check();
  await page.getByLabel('Grid columns', { exact: true }).selectOption('4');
  await page.getByLabel('Grid rows', { exact: true }).selectOption('4');
  await page.getByLabel(/What do your marks mean/).fill('The letter E is the exit.');
  await page.getByRole('button', { name: 'Interpret photo', exact: true }).click();
  await expect(proposedBoard(page)).toBeVisible();
  await page.getByRole('button', { name: 'Keep current puzzle', exact: true }).click();
  await expect(currentBoard(page).getByRole('button')).toHaveCount(36);
  await expect(page.getByRole('heading', { name: 'The little escape', exact: true })).toBeVisible();
});
