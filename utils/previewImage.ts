import type React from 'react';
import type { CollageItem } from '../types';

/**
 * Editor previews.
 *
 * Camera photos (~30 MP) decode to >100 MB each. Nine of them exceed the
 * browser's image-decode cache, so every re-layout re-decoded all of them
 * (hundreds of ms of main-thread stall per click). The editor therefore shows a
 * ~2000px local preview; the original file (`item.url`) is still what gets
 * exported. Previews never leave the machine (blob: URLs only).
 */
export const PREVIEW_MAX_EDGE = 2000;
const PREVIEW_QUALITY = 0.92;
const CONCURRENCY = 2;

export const fitWithin = (w: number, h: number, maxEdge: number) => {
  const longest = Math.max(w, h);
  if (longest <= maxEdge) return { width: w, height: h, scaled: false };
  const k = maxEdge / longest;
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)), scaled: true };
};

/**
 * Returns a blob: URL of a downscaled JPEG, or null when no preview is needed
 * (already small) or the browser cannot decode the file (caller falls back to
 * the original).
 */
export const createPreviewUrl = async (file: File, maxEdge = PREVIEW_MAX_EDGE): Promise<string | null> => {
  if (typeof createImageBitmap !== 'function') return null;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const size = fitWithin(bitmap.width, bitmap.height, maxEdge);
    if (!size.scaled) return null;
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', PREVIEW_QUALITY));
    canvas.width = canvas.height = 1; // release the backing store right away
    return blob ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
};

let running = 0;
const queue: Array<() => void> = [];
const pump = () => {
  while (running < CONCURRENCY && queue.length) {
    running++;
    queue.shift()!();
  }
};
const schedule = <T>(task: () => Promise<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    queue.push(() => {
      task().then(resolve, reject).finally(() => {
        running--;
        pump();
      });
    });
    pump();
  });

export const isBlobUrl = (url?: string) => !!url && url.startsWith('blob:');

/** Revoke after the next paint cycle so an <img> still showing it is not broken mid-commit. */
export const revokeLater = (...urls: Array<string | undefined>) => {
  const blobs = urls.filter(isBlobUrl) as string[];
  if (blobs.length === 0) return;
  window.setTimeout(() => blobs.forEach((u) => URL.revokeObjectURL(u)), 1500);
};

/** Pure state update used when a preview finishes: only applies if the item still holds the same original. */
export const applyPreview = (
  items: CollageItem[],
  id: string,
  originalUrl: string,
  previewUrl: string | null,
): CollageItem[] => {
  let applied = false;
  const next = items.map((item) => {
    if (item.id !== id || item.url !== originalUrl) return item;
    applied = true;
    return { id: item.id, url: item.url, ...(previewUrl ? { previewUrl } : {}) };
  });
  return applied ? next : items;
};

/**
 * Generate a preview in the background (2 at a time) and attach it to the item.
 * If the item was replaced/removed meanwhile the preview is discarded and revoked.
 */
export const attachPreview = (
  file: File,
  id: string,
  originalUrl: string,
  setItems: React.Dispatch<React.SetStateAction<CollageItem[]>>,
  getItems: () => CollageItem[],
) => {
  void schedule(() => createPreviewUrl(file)).then((previewUrl) => {
    const stillThere = getItems().some((i) => i.id === id && i.url === originalUrl);
    if (!stillThere) {
      if (previewUrl) revokeLater(previewUrl);
      return;
    }
    setItems((prev) => applyPreview(prev, id, originalUrl, previewUrl));
  });
};
