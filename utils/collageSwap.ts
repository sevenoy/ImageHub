import type { CollageItem } from '../types';

/**
 * Swap two collage items by id. Ids travel with their image, so the swap stays
 * correct even if the list changed between the two clicks. Returns the same
 * array reference when nothing can be swapped.
 */
export const swapItemsById = (
  items: CollageItem[],
  firstId: string,
  secondId: string,
): CollageItem[] => {
  if (firstId === secondId) return items;
  const a = items.findIndex((item) => item.id === firstId);
  const b = items.findIndex((item) => item.id === secondId);
  if (a < 0 || b < 0) return items;
  const next = [...items];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
};

/** Replace only the image of one item; id (and so its position/identity) is kept. */
export const replaceItemUrl = (
  items: CollageItem[],
  id: string,
  url: string,
): CollageItem[] => items.map((item) => (item.id === id ? { ...item, url } : item));
