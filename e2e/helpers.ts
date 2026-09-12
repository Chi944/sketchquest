import { expect, type Page, type Route } from '@playwright/test';
import type { Interpretation } from '../src/core/types';
import type { SavedWorkspace } from '../src/state/storage';

export async function openApp(page: Page, aiEnabled = false) {
  // Deliberate HTTP mocks: these tests assess UI behavior, not model quality.
  // Every model endpoint is intercepted, even when a developer configured live AI.
  await page.route('**/api/interpret', (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: { code: 'TEST_AI_BLOCKED', message: 'Live AI is disabled during browser tests.' },
      },
    }),
  );
  await page.route('**/api/propose', (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: { code: 'TEST_AI_BLOCKED', message: 'Live AI is disabled during browser tests.' },
      },
    }),
  );
  await page.route('**/api/status', (route) =>
    route.fulfill({
      json: {
        aiEnabled,
        sharingEnabled: true,
        model: 'mocked-test-provider',
        message: 'Browser test configuration.',
      },
    }),
  );
  await page.goto('/');
  // Legacy gameplay tests use the visible editing grid; expedition tests exercise 3D separately.
  await page.getByRole('button', { name: '2D grid view', exact: true }).click();
  await expect(
    page.getByRole('group', { name: 'Current puzzle board', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Saved in this browser', { exact: true })).toBeVisible();
}

export const currentBoard = (page: Page) =>
  page.getByRole('group', { name: 'Current puzzle board', exact: true });
export const proposedBoard = (page: Page) =>
  page.getByRole('group', { name: 'Proposed puzzle board', exact: true });

export async function readNotebook(page: Page): Promise<SavedWorkspace | null> {
  return page.evaluate(
    () =>
      new Promise<SavedWorkspace | null>((resolve, reject) => {
        const request = indexedDB.open('sketchquest', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains('workspace')) {
            database.close();
            resolve(null);
            return;
          }
          const read = database
            .transaction('workspace', 'readonly')
            .objectStore('workspace')
            .get('current');
          read.onsuccess = () => {
            database.close();
            resolve(read.result ?? null);
          };
          read.onerror = () => {
            database.close();
            reject(read.error);
          };
        };
      }),
  );
}

/** A synthetic test drawing, created locally; not an extraction evaluation sample. */
export async function syntheticPhoto(page: Page) {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 1200;
    const pen = canvas.getContext('2d')!;
    pen.fillStyle = '#fff';
    pen.fillRect(0, 0, canvas.width, canvas.height);
    pen.strokeStyle = '#173e86';
    pen.lineWidth = 5;
    for (let line = 0; line <= 4; line++) {
      pen.beginPath();
      pen.moveTo(200 + line * 250, 100);
      pen.lineTo(200 + line * 250, 1100);
      pen.stroke();
      pen.beginPath();
      pen.moveTo(200, 100 + line * 250);
      pen.lineTo(1200, 100 + line * 250);
      pen.stroke();
    }
    pen.beginPath();
    pen.arc(325, 225, 50, 0, Math.PI * 2);
    pen.stroke();
    pen.strokeRect(510, 410, 120, 120);
    pen.font = '90px sans-serif';
    pen.fillText('E', 1040, 1010);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  return {
    name: 'private-synthetic-camera-photo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(base64, 'base64'),
  };
}

export function mockedInterpretation(uncertain = true): Interpretation {
  return {
    status: 'interpreted',
    width: 4,
    height: 4,
    cells: Array.from({ length: 16 }, (_, cell) => ({
      cell,
      terrain: cell === 15 ? 'exit' : cell === 10 ? 'key' : cell === 11 ? 'door' : 'floor',
      occupant: cell === 0 ? 'player' : cell === 5 ? 'crate' : 'none',
      uncertain: uncertain && cell === 5,
      alternatives: uncertain && cell === 5 ? ['floor'] : [],
      note: uncertain && cell === 5 ? 'This square might be a crate.' : '',
    })),
    notes: ['Synthetic, mocked interpretation for a browser interaction test.'],
  };
}

export async function multipart(route: Route) {
  const request = route.request();
  const raw = request.postDataBuffer();
  if (!raw) throw new Error('The image request had no body.');
  return new Response(new Uint8Array(raw), {
    headers: { 'Content-Type': request.headers()['content-type'] },
  }).formData();
}

export async function uploadSynthetic(page: Page) {
  const photo = await syntheticPhoto(page);
  await page.getByRole('button', { name: /Start with a sketch/ }).click();
  await page.getByLabel('Choose puzzle photo', { exact: true }).setInputFiles(photo);
  await expect(page.getByRole('img', { name: /Your puzzle photo/ })).toBeVisible();
  return photo;
}

export async function acceptMockedPhoto(page: Page) {
  await page.route('**/api/interpret', async (route) => {
    const form = await multipart(route);
    await route.fulfill({
      json: {
        requestId: form.get('requestId'),
        interpretation: mockedInterpretation(false),
        metrics: { latencyMs: 1 },
      },
    });
  });
  await uploadSynthetic(page);
  await page.getByRole('button', { name: 'Interpret photo', exact: true }).click();
  await expect(proposedBoard(page)).toBeVisible();
  await page.getByRole('button', { name: 'Accept & play', exact: true }).click();
  await expect(currentBoard(page).getByRole('button')).toHaveCount(16);
}
