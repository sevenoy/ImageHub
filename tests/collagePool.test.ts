import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ensurePoolSize, getVisibleItems, shuffleVisible } from '../utils/collagePool';
import { swapItemsById } from '../utils/collageSwap';
import type { CollageItem } from '../types';

const item = (k: string): CollageItem => ({ id: `id-${k}`, url: `u-${k}` });
const nine = 'abcdefghi'.split('').map(item);
const ids = (xs: CollageItem[]) => xs.map((i) => i.id.slice(3)).join('');

describe('collage pool keeps hidden items across layout switches', () => {
  it('3x3 -> 2x2 -> 3x3 restores all nine, with edits made in between', () => {
    let pool = ensurePoolSize(nine, 4, () => item('x')); // switching to 2x2 never shortens
    expect(pool).toBe(nine);
    expect(ids(getVisibleItems(pool, 4))).toBe('abcd');

    pool = swapItemsById(pool, 'id-a', 'id-c'); // swap while in 2x2
    pool = pool.map((i) => (i.id === 'id-b' ? { ...i, url: 'replaced' } : i)); // replace while in 2x2
    expect(ids(getVisibleItems(pool, 4))).toBe('cbad');

    const back = getVisibleItems(ensurePoolSize(pool, 9, () => item('x')), 9);
    expect(ids(back)).toBe('cbadefghi');
    expect(back[1].url).toBe('replaced');
    expect(back.slice(4)).toEqual(nine.slice(4)); // hidden five untouched
  });

  it('grows only when the pool is smaller than needed', () => {
    const four = nine.slice(0, 4);
    const grown = ensurePoolSize(four, 9, (i) => item(`n${i}`));
    expect(grown).toHaveLength(9);
    expect(grown.slice(0, 4)).toEqual(four);
  });

  it('shuffle only touches visible items', () => {
    const out = shuffleVisible(nine, 4, () => 0);
    expect(out.slice(4)).toEqual(nine.slice(4));
    expect(ids(out.slice(0, 4)).split('').sort().join('')).toBe('abcd');
    expect(out).toHaveLength(9);
  });

  it('vite config no longer injects GEMINI keys into the client bundle', () => {
    const cfg = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');
    expect(cfg).not.toMatch(/GEMINI|API_KEY|loadEnv|\bdefine\s*:/);
  });
});
