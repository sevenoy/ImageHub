import { describe, expect, it } from 'vitest';
import { applyPreview, fitWithin } from '../utils/previewImage';
import { replaceItemUrl } from '../utils/collageSwap';
import type { CollageItem } from '../types';

describe('preview sizing', () => {
  it('scales long edge to the limit, keeps aspect ratio', () => {
    expect(fitWithin(4672, 7008, 2000)).toEqual({ width: 1333, height: 2000, scaled: true });
    expect(fitWithin(7008, 4672, 2000)).toEqual({ width: 2000, height: 1333, scaled: true });
  });
  it('does not touch images that are already small', () => {
    expect(fitWithin(1600, 1200, 2000)).toEqual({ width: 1600, height: 1200, scaled: false });
    expect(fitWithin(2000, 1500, 2000).scaled).toBe(false);
  });
});

describe('preview state updates', () => {
  const base = (): CollageItem[] => [
    { id: 'a', url: 'blob:A', loading: true },
    { id: 'b', url: 'blob:B' },
  ];

  it('attaches a preview and clears loading, only for the same original', () => {
    const items = base();
    const out = applyPreview(items, 'a', 'blob:A', 'blob:pA');
    expect(out[0]).toEqual({ id: 'a', url: 'blob:A', previewUrl: 'blob:pA' });
    expect(out[1]).toBe(items[1]);
  });

  it('keeps the original when no preview is needed (null) and clears loading', () => {
    expect(applyPreview(base(), 'a', 'blob:A', null)[0]).toEqual({ id: 'a', url: 'blob:A' });
  });

  it('ignores a stale preview after the image was replaced (no wrong-image association)', () => {
    const replaced = replaceItemUrl(base(), 'a', 'blob:A2', true);
    const out = applyPreview(replaced, 'a', 'blob:A', 'blob:stalePreview');
    expect(out).toBe(replaced);
    expect(out[0]).toEqual({ id: 'a', url: 'blob:A2', loading: true });
  });

  it('ignores previews for removed items', () => {
    const items = base();
    expect(applyPreview(items, 'gone', 'blob:X', 'blob:p')).toBe(items);
  });

  it('replace drops the old preview so the new image is never shown with the old preview', () => {
    const withPreview: CollageItem[] = [{ id: 'a', url: 'blob:A', previewUrl: 'blob:pA' }];
    expect(replaceItemUrl(withPreview, 'a', 'blob:A2', true)[0]).toEqual({ id: 'a', url: 'blob:A2', loading: true });
  });
});
