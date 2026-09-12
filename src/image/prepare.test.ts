import { afterEach, describe, expect, it, vi } from 'vitest';
import { FULL_CROP, OUTPUT_BYTE_LIMIT } from './geometry';
import { loadPhoto, preparePhoto, renderPhoto, type LoadedPhoto } from './prepare';

afterEach(() => vi.unstubAllGlobals());

function canvasHarness(sizeForQuality = (_quality: number) => 120) {
  const canvases: HTMLCanvasElement[] = [];
  const snapshots: { width: number; height: number; type: string; quality: number }[] = [];
  const points: number[][][] = [];
  const make = () => {
    let a = 1,
      b = 0,
      c = 0,
      d = 1,
      e = 0,
      f = 0;
    const context = {
      fillStyle: '',
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
      fillRect: vi.fn(),
      scale(x: number, y: number) {
        a *= x;
        b *= x;
        c *= y;
        d *= y;
      },
      translate(x: number, y: number) {
        e += a * x + c * y;
        f += b * x + d * y;
      },
      rotate(angle: number) {
        const cosine = Math.cos(angle),
          sine = Math.sin(angle);
        [a, b, c, d] = [
          a * cosine + c * sine,
          b * cosine + d * sine,
          c * cosine - a * sine,
          d * cosine - b * sine,
        ];
      },
      drawImage() {
        // Two independently chosen source landmarks and all four corners.
        points.push(
          [
            [0, 0],
            [100, 0],
            [100, 60],
            [0, 60],
            [20, 50],
            [80, 10],
          ].map(([x, y]) => [Math.round(a * x + c * y + e), Math.round(b * x + d * y + f)]),
        );
      },
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => context,
      toBlob(
        this: { width: number; height: number },
        callback: BlobCallback,
        type: string,
        quality: number,
      ) {
        snapshots.push({ width: this.width, height: this.height, type, quality });
        callback({ size: sizeForQuality(quality), type } as Blob);
      },
    } as unknown as HTMLCanvasElement;
    canvases.push(canvas);
    return canvas;
  };
  vi.stubGlobal('document', { createElement: make });
  return { canvases, snapshots, points };
}

const photo: LoadedPhoto = {
  source: {} as ImageBitmap,
  width: 100,
  height: 60,
  name: 'landmarks.png',
  dispose: () => {},
};

describe('photo pixel preparation', () => {
  it('rotates the actual pixels clockwise, not just the visible preview', () => {
    const harness = canvasHarness();
    const canvas = renderPhoto(photo, FULL_CROP, 1);
    expect({ width: canvas.width, height: canvas.height }).toEqual({ width: 60, height: 100 });
    expect(harness.points[0].slice(0, 4)).toEqual([
      [60, 0],
      [60, 100],
      [0, 100],
      [0, 0],
    ]);
  });
  it('maps known source landmarks to the crop edges after rotation', () => {
    const harness = canvasHarness();
    const canvas = renderPhoto(photo, { left: 1 / 6, right: 5 / 6, top: 0.2, bottom: 0.8 }, 1);
    expect({ width: canvas.width, height: canvas.height }).toEqual({ width: 40, height: 60 });
    expect(harness.points[0].slice(4)).toEqual([
      [0, 0],
      [40, 60],
    ]);
  });
  it('reencodes as JPEG within the upload byte and size limits', async () => {
    const harness = canvasHarness((quality) => (quality > 0.7 ? OUTPUT_BYTE_LIMIT + 1 : 500_000));
    const output = await preparePhoto({ ...photo, width: 4000, height: 3000 }, FULL_CROP, 0);
    expect(output.size).toBe(500_000);
    expect(output.type).toBe('image/jpeg');
    expect(harness.snapshots.map((snapshot) => snapshot.quality)).toEqual([0.9, 0.78, 0.64]);
    expect(
      harness.snapshots.every(
        (snapshot) =>
          snapshot.width === 1536 && snapshot.height === 1152 && snapshot.type === 'image/jpeg',
      ),
    ).toBe(true);
    expect(harness.canvases[0].width).toBe(0); // Release intermediate pixel buffers.
  });
  it('bounds unsuccessful compression attempts and reports a recoverable failure', async () => {
    const harness = canvasHarness(() => OUTPUT_BYTE_LIMIT + 1);
    await expect(preparePhoto(photo, FULL_CROP, 0)).rejects.toThrow('Crop closer');
    expect(harness.snapshots).toHaveLength(24);
    expect(harness.canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(
      true,
    );
  });
  it('releases decoded oversized images and never accepts them into the editor', async () => {
    const close = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 8000, height: 6000, close })),
    );
    const file = new File(['fake decoder input'], 'photo.jpg', { type: 'image/jpeg' });
    await expect(loadPhoto(file)).rejects.toThrow('24 megapixels');
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('rejects oversized PNG headers before allocating decoded pixels', async () => {
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47]);
    bytes.set([0x49, 0x48, 0x44, 0x52], 12);
    const view = new DataView(bytes.buffer);
    view.setUint32(16, 8000);
    view.setUint32(20, 6000);
    const decoder = vi.fn();
    vi.stubGlobal('createImageBitmap', decoder);
    await expect(loadPhoto(new File([bytes], 'giant.png', { type: 'image/png' }))).rejects.toThrow(
      '24 megapixels',
    );
    expect(decoder).not.toHaveBeenCalled();
  });
});
