import {
  checkDimensions,
  cropRectangle,
  dimensionsFromHeader,
  fitWithin,
  FULL_CROP,
  orientedDimensions,
  OUTPUT_BYTE_LIMIT,
  OUTPUT_LONG_SIDE,
  SOURCE_BYTE_LIMIT,
  type CropBounds,
  type QuarterTurn,
} from './geometry';

export interface LoadedPhoto {
  source: CanvasImageSource;
  width: number;
  height: number;
  name: string;
  dispose: () => void;
}

const MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);
export const PHOTO_ACCEPT =
  'image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif';

export function checkPhotoFile(file: Pick<File, 'size' | 'type' | 'name'>): void {
  if (!file.size) throw new Error('This file is empty. Choose another photo.');
  if (file.size > SOURCE_BYTE_LIMIT)
    throw new Error('Choose a photo smaller than 15 MB. You can resize it first.');
  if (
    (file.type && !MIME_TYPES.has(file.type.toLowerCase())) ||
    (!file.type && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name))
  ) {
    throw new Error('Choose a JPEG, PNG, WebP, HEIC, or HEIF photo.');
  }
}

async function decode(
  blob: Blob,
): Promise<{ source: CanvasImageSource; width: number; height: number; dispose: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        dispose: () => bitmap.close(),
      };
    } catch {
      /* Safari and some image formats need an image element. */
    }
  }
  const url = URL.createObjectURL(blob);
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      dispose: () => {
        image.src = '';
      },
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function loadPhoto(file: File): Promise<LoadedPhoto> {
  checkPhotoFile(file);
  const header = dimensionsFromHeader(
    new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer()),
  );
  if (header) checkDimensions(header.width, header.height);
  const isHeic = /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
  let image;
  try {
    image = await decode(file);
  } catch {
    if (!isHeic)
      throw new Error('This photo could not be opened. Try another image or save it as JPEG.');
    try {
      const { heicTo } = await import('heic-to/csp');
      const converted = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.95 });
      image = await decode(converted);
    } catch {
      throw new Error(
        'This HEIC photo could not be converted. Save it as JPEG or choose another photo.',
      );
    }
  }
  try {
    checkDimensions(image.width, image.height);
  } catch (error) {
    image.dispose();
    throw error;
  }
  return { ...image, name: file.name };
}

/** Draws only pixels into a fresh canvas; source metadata and grid guides are not copied. */
export function renderPhoto(
  photo: LoadedPhoto,
  crop: CropBounds = FULL_CROP,
  rotation: QuarterTurn = 0,
  longSide = OUTPUT_LONG_SIDE,
): HTMLCanvasElement {
  const oriented = orientedDimensions(photo.width, photo.height, rotation);
  const region = cropRectangle(oriented, crop);
  const size = fitWithin(region.width, region.height, longSide);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context)
    throw new Error(
      'Image editing is unavailable in this browser. Try another browser or draw the board manually.',
    );
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size.width, size.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.scale(size.width / region.width, size.height / region.height);
  context.translate(-region.x, -region.y);
  if (rotation === 1) {
    context.translate(oriented.width, 0);
    context.rotate(Math.PI / 2);
  } else if (rotation === 2) {
    context.translate(oriented.width, oriented.height);
    context.rotate(Math.PI);
  } else if (rotation === 3) {
    context.translate(0, oriented.height);
    context.rotate(-Math.PI / 2);
  }
  context.drawImage(photo.source, 0, 0, photo.width, photo.height);
  return canvas;
}

export function canvasBlob(canvas: HTMLCanvasElement, quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error('This photo could not be prepared. Try a smaller image.')),
      'image/jpeg',
      quality,
    );
  });
}

export async function preparePhoto(
  photo: LoadedPhoto,
  crop: CropBounds,
  rotation: QuarterTurn,
): Promise<Blob> {
  let longSide = OUTPUT_LONG_SIDE;
  for (let resize = 0; resize < 6; resize++) {
    const canvas = renderPhoto(photo, crop, rotation, longSide);
    try {
      for (const quality of [0.9, 0.78, 0.64, 0.5]) {
        const blob = await canvasBlob(canvas, quality);
        if (blob.size <= OUTPUT_BYTE_LIMIT) return blob;
      }
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
    longSide = Math.floor(longSide * 0.75);
  }
  throw new Error(
    'The prepared photo is still too large. Crop closer around your puzzle and try again.',
  );
}
