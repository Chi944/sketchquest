import { ApiFault } from './errors';

export const MAX_JSON_BYTES = 32 * 1024;
export const MAX_IMAGE_BYTES = 1024 * 1024;
export const MAX_MULTIPART_BYTES = MAX_IMAGE_BYTES + 16 * 1024;
export const MAX_IMAGE_DIMENSION = 1536;

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('Origin');
  if (
    !origin ||
    origin !== new URL(request.url).origin ||
    request.headers.get('Sec-Fetch-Site') === 'cross-site'
  ) {
    throw new ApiFault('ORIGIN_REJECTED', 'Send this request from the SketchQuest app.', 403);
  }
}

/** Content-Length is only an early check. Chunked and dishonest requests are bounded too. */
export async function readBounded(request: Request, limit: number): Promise<Uint8Array> {
  const advertised = request.headers.get('Content-Length');
  if (advertised && (!/^\d+$/.test(advertised) || Number(advertised) > limit)) {
    throw new ApiFault('BODY_TOO_LARGE', 'This request is too large.', 413);
  }
  if (!request.body) throw new ApiFault('EMPTY_BODY', 'This request has no content.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new ApiFault('BODY_TOO_LARGE', 'This request is too large.', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export async function readJson(request: Request): Promise<unknown> {
  if (
    request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
  ) {
    throw new ApiFault('CONTENT_TYPE', 'Send JSON content.', 415);
  }
  const bytes = await readBounded(request, MAX_JSON_BYTES);
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new ApiFault('INVALID_JSON', 'The request contains invalid JSON.');
  }
}

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));

/** Verify the actual container and dimensions; neither a filename nor MIME is trusted. */
export function inspectImage(bytes: Uint8Array, mime: string) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES)
    throw new ApiFault('IMAGE_TOO_LARGE', 'Use an image smaller than 1 MiB.', 413);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0,
    height = 0,
    actualMime = '';
  if (
    bytes.length >= 33 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value) &&
    ascii(bytes, 12, 4) === 'IHDR' &&
    view.getUint32(8) === 13
  ) {
    actualMime = 'image/png';
    width = view.getUint32(16);
    height = view.getUint32(20);
  } else if (bytes.length >= 12 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    actualMime = 'image/jpeg';
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset] !== 0xff) break;
      while (offset < bytes.length && bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
          marker,
        ) &&
        length >= 7
      ) {
        height = view.getUint16(offset + 3);
        width = view.getUint16(offset + 5);
        break;
      }
      offset += length;
    }
  } else if (
    bytes.length >= 30 &&
    ascii(bytes, 0, 4) === 'RIFF' &&
    ascii(bytes, 8, 4) === 'WEBP' &&
    view.getUint32(4, true) + 8 === bytes.length
  ) {
    actualMime = 'image/webp';
    const kind = ascii(bytes, 12, 4);
    if (kind === 'VP8X') {
      width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    } else if (kind === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      width = view.getUint16(26, true) & 0x3fff;
      height = view.getUint16(28, true) & 0x3fff;
    } else if (kind === 'VP8L' && bytes[20] === 0x2f) {
      width = 1 + (((bytes[22] & 0x3f) << 8) | bytes[21]);
      height = 1 + (((bytes[24] & 0xf) << 10) | (bytes[23] << 2) | (bytes[22] >> 6));
    }
  }
  if (!actualMime || actualMime !== mime || !width || !height) {
    throw new ApiFault('INVALID_IMAGE', 'Use a valid PNG, JPEG, or WebP image.', 415);
  }
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    throw new ApiFault(
      'IMAGE_DIMENSIONS',
      'Resize the image to at most 1536 pixels on its longest side.',
      413,
    );
  }
  return { width, height, mime: actualMime };
}

export function imageDataUrl(bytes: Uint8Array, mime: string) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:${mime};base64,${btoa(binary)}`;
}
