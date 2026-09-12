/** Coordinates are fractions of the oriented image, not of the original file. */
export interface CropBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export type QuarterTurn = 0 | 1 | 2 | 3;
export interface Dimensions {
  width: number;
  height: number;
}
export const FULL_CROP: CropBounds = { left: 0, top: 0, right: 1, bottom: 1 };
export const SOURCE_BYTE_LIMIT = 15 * 1024 * 1024;
export const PIXEL_LIMIT = 24_000_000;
export const OUTPUT_BYTE_LIMIT = 1024 * 1024;
export const OUTPUT_LONG_SIDE = 1536;

export function checkDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error('This image has invalid dimensions. Try another photo.');
  }
  if (width * height > PIXEL_LIMIT) {
    throw new Error(
      'This photo is larger than 24 megapixels. Resize it or use a lower-resolution photo.',
    );
  }
}

export function fitWithin(width: number, height: number, longSide = OUTPUT_LONG_SIDE): Dimensions {
  if (
    ![width, height, longSide].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0 ||
    longSide < 1
  ) {
    throw new Error('Cannot resize an image with invalid dimensions.');
  }
  const scale = Math.min(1, longSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function orientedDimensions(
  width: number,
  height: number,
  rotation: QuarterTurn,
): Dimensions {
  return rotation % 2 ? { width: height, height: width } : { width, height };
}

export function cropRectangle(dimensions: Dimensions, crop: CropBounds) {
  const { left, top, right, bottom } = crop;
  if (
    ![left, top, right, bottom].every(Number.isFinite) ||
    left < 0 ||
    top < 0 ||
    right > 1 ||
    bottom > 1 ||
    right <= left ||
    bottom <= top
  ) {
    throw new Error('Choose a crop with some width and height.');
  }
  const x = Math.floor(left * dimensions.width);
  const y = Math.floor(top * dimensions.height);
  const width = Math.max(1, Math.ceil(right * dimensions.width) - x);
  const height = Math.max(1, Math.ceil(bottom * dimensions.height) - y);
  return { x, y, width, height };
}

/** Reads common file headers before decoding, to reject oversized images early. */
export function dimensionsFromHeader(bytes: Uint8Array): Dimensions | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...bytes.subarray(start, start + length));
  if (bytes.length >= 24 && bytes[0] === 0x89 && ascii(1, 3) === 'PNG' && ascii(12, 4) === 'IHDR') {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    if (ascii(12, 4) === 'VP8X') {
      return {
        width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
        height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
      };
    }
    if (ascii(12, 4) === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return {
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff,
      };
    }
    if (ascii(12, 4) === 'VP8L' && bytes[20] === 0x2f) {
      return {
        width: 1 + (bytes[21] | ((bytes[22] & 0x3f) << 8)),
        height: 1 + ((bytes[22] >> 6) | (bytes[23] << 2) | ((bytes[24] & 0x0f) << 10)),
      };
    }
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      while (offset < bytes.length && bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) return null;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) return null;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) return null;
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
          marker,
        ) &&
        length >= 7
      ) {
        return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
      }
      offset += length;
    }
  }
  return null;
}
