/** Downscale + re-encode photos to WebP in the browser before upload. GIFs (animation) pass through. */
const MAX_EDGE_PX = 2000;
const WEBP_QUALITY = 0.85;
const SKIP_TYPES = new Set(['image/gif', 'image/webp', 'image/avif']);

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || SKIP_TYPES.has(file.type)) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file; // Unsupported (e.g. HEIC on some browsers): upload the original.
  }

  const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY));
  if (!blob || blob.type !== 'image/webp' || blob.size >= file.size) return file;

  const name = file.name.replace(/\.[^.]+$/, '') + '.webp';
  return new File([blob], name, { type: 'image/webp', lastModified: file.lastModified });
}
