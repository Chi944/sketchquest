import { describe, expect, it } from 'vitest';
import {
  checkDimensions,
  cropRectangle,
  dimensionsFromHeader,
  fitWithin,
  FULL_CROP,
  orientedDimensions,
  PIXEL_LIMIT,
} from './geometry';
import { checkPhotoFile } from './prepare';

describe('photo geometry and resource limits', () => {
  it('fits landscape and portrait photos without enlargement or distortion', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1536, height: 1152 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1152, height: 1536 });
    expect(fitWithin(640, 480)).toEqual({ width: 640, height: 480 });
    expect(() => fitWithin(NaN, 300)).toThrow();
  });
  it('interprets crop fractions in the rotated frame', () => {
    const portrait = orientedDimensions(1200, 800, 1);
    expect(portrait).toEqual({ width: 800, height: 1200 });
    expect(cropRectangle(portrait, { left: 0.25, right: 0.75, top: 0, bottom: 0.5 })).toEqual({
      x: 200,
      y: 0,
      width: 400,
      height: 600,
    });
    expect(orientedDimensions(1200, 800, 2)).toEqual({ width: 1200, height: 800 });
    expect(orientedDimensions(1200, 800, 3)).toEqual(portrait);
  });
  it('includes image boundary pixels and rejects invalid crop bounds', () => {
    expect(cropRectangle({ width: 701, height: 499 }, FULL_CROP)).toEqual({
      x: 0,
      y: 0,
      width: 701,
      height: 499,
    });
    expect(
      cropRectangle({ width: 101, height: 101 }, { left: 0.1, right: 0.2, top: 0.1, bottom: 0.2 }),
    ).toEqual({ x: 10, y: 10, width: 11, height: 11 });
    expect(() =>
      cropRectangle({ width: 20, height: 20 }, { left: 0.5, right: 0.5, top: 0, bottom: 1 }),
    ).toThrow();
    expect(() =>
      cropRectangle({ width: 20, height: 20 }, { ...FULL_CROP, right: Infinity }),
    ).toThrow();
  });
  it('accepts the 24 MP boundary, but rejects larger or nonnumeric dimensions', () => {
    expect(6000 * 4000).toBe(PIXEL_LIMIT);
    expect(() => checkDimensions(6000, 4000)).not.toThrow();
    expect(() => checkDimensions(6001, 4000)).toThrow('24 megapixels');
    expect(() => checkDimensions(0, 4000)).toThrow();
    expect(() => checkDimensions(100.5, 4000)).toThrow();
  });
  it('checks file size and declared types before decoding', () => {
    expect(() => checkPhotoFile({ name: 'photo.JPG', type: '', size: 2000 })).not.toThrow();
    expect(() =>
      checkPhotoFile({ name: 'photo.heic', type: 'image/heic', size: 2000 }),
    ).not.toThrow();
    expect(() =>
      checkPhotoFile({ name: 'photo.png', type: 'image/png', size: 15 * 1024 * 1024 }),
    ).not.toThrow();
    expect(() =>
      checkPhotoFile({ name: 'photo.jpg', type: 'image/jpeg', size: 15 * 1024 * 1024 + 1 }),
    ).toThrow('15 MB');
    expect(() =>
      checkPhotoFile({ name: 'payload.jpg', type: 'image/svg+xml', size: 2000 }),
    ).toThrow('Choose a JPEG');
    expect(() => checkPhotoFile({ name: 'photo.jpg', type: 'image/jpeg', size: 0 })).toThrow(
      'empty',
    );
  });
});

describe('early header inspection', () => {
  it('reads PNG dimensions independently of filename', () => {
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]);
    bytes.set([0x49, 0x48, 0x44, 0x52], 12);
    const view = new DataView(bytes.buffer);
    view.setUint32(16, 8000);
    view.setUint32(20, 6000);
    expect(dimensionsFromHeader(bytes)).toEqual({ width: 8000, height: 6000 });
  });
  it('reads JPEG dimensions after an APP metadata segment', () => {
    const bytes = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe1, 0, 4, 0, 0, 0xff, 0xc2, 0, 8, 8, 0x03, 0x20, 0x04, 0xb0, 0,
    ]);
    expect(dimensionsFromHeader(bytes)).toEqual({ width: 1200, height: 800 });
  });
  it('reads extended WebP dimensions using little-endian 24-bit fields', () => {
    const bytes = new Uint8Array(30);
    const put = (offset: number, text: string) =>
      bytes.set(
        [...text].map((c) => c.charCodeAt(0)),
        offset,
      );
    put(0, 'RIFF');
    put(8, 'WEBP');
    put(12, 'VP8X');
    bytes.set([0xff, 0x07, 0], 24);
    bytes.set([0xff, 0x03, 0], 27);
    expect(dimensionsFromHeader(bytes)).toEqual({ width: 2048, height: 1024 });
  });
  it('handles corrupt and truncated headers without inventing dimensions', () => {
    expect(dimensionsFromHeader(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBeNull();
    expect(dimensionsFromHeader(new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 20, 0]))).toBeNull();
    expect(dimensionsFromHeader(new Uint8Array())).toBeNull();
  });
});
