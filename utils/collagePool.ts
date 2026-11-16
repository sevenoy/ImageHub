import type { CollageItem } from '../types';

/**
 * The editor keeps a pool of items that is never shortened when the layout
 * shrinks. Only the first `count` items are shown (and exported); the rest are
 * kept so switching back to a bigger layout restores them.
 */
export const ensurePoolSize = (
  pool: CollageItem[],
  count: number,
  makeItem: (index: number) => CollageItem,
): CollageItem[] => {
  if (pool.length >= count) return pool;
  const next = [...pool];
  for (let i = pool.length; i < count; i++) next.push(makeItem(i));
  return next;
};

export const getVisibleItems = (pool: CollageItem[], count: number): CollageItem[] =>
  pool.slice(0, count);

/** Shuffle only the visible part; hidden items keep their place and content. */
export const shuffleVisible = (
  pool: CollageItem[],
  count: number,
  random: () => number = Math.random,
): CollageItem[] => {
  const head = pool.slice(0, count);
  for (let i = head.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [head[i], head[j]] = [head[j], head[i]];
  }
  return [...head, ...pool.slice(count)];
};
