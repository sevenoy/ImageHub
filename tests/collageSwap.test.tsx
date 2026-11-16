import React, { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CollageGrid } from '../components/CollageGrid';
import { CollageItem, LayoutType } from '../types';
import { replaceItemUrl, swapItemsById } from '../utils/collageSwap';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const make = (): CollageItem[] =>
  ['a', 'b', 'c', 'd'].map((k) => ({ id: `id-${k}`, url: `https://img.test/${k}.png` }));

describe('swapItemsById / replaceItemUrl', () => {
  it('swaps exactly two items and leaves the rest untouched', () => {
    const items = make();
    const next = swapItemsById(items, 'id-a', 'id-c');
    expect(next.map((i) => i.id)).toEqual(['id-c', 'id-b', 'id-a', 'id-d']);
    expect(next[1]).toBe(items[1]);
    expect(next[3]).toBe(items[3]);
    expect(items.map((i) => i.id)).toEqual(['id-a', 'id-b', 'id-c', 'id-d']); // input not mutated
  });

  it('is a no-op for same / unknown ids', () => {
    const items = make();
    expect(swapItemsById(items, 'id-a', 'id-a')).toBe(items);
    expect(swapItemsById(items, 'id-a', 'nope')).toBe(items);
  });

  it('replace only changes the url of one item', () => {
    const items = make();
    const next = replaceItemUrl(items, 'id-b', 'blob:new');
    expect(next.map((i) => i.id)).toEqual(items.map((i) => i.id));
    expect(next.map((i) => i.url)).toEqual([items[0].url, 'blob:new', items[2].url, items[3].url]);
  });
});

describe('CollageGrid click-to-swap', () => {
  let host: HTMLDivElement;
  let root: Root;

  const Harness: React.FC<{ exportMode?: boolean }> = ({ exportMode = false }) => {
    const [items, setItems] = useState<CollageItem[]>(make());
    return (
      <CollageGrid
        items={items}
        layout={LayoutType.GRID_2X2}
        setItems={setItems}
        onReplaceFile={(id, file) => setItems((prev) => replaceItemUrl(prev, id, URL.createObjectURL(file)))}
        gap={3}
        borderRadius={6}
        isExportMode={exportMode}
      />
    );
  };

  const render = (exportMode = false) => act(() => root.render(<Harness exportMode={exportMode} />));
  const cards = () => Array.from(host.querySelectorAll<HTMLElement>('[data-testid="photo-card"]'));
  const click = (el: Element) => act(() => (el as HTMLElement).click());
  const order = () => Array.from(host.querySelectorAll('img')).map((i) => i.getAttribute('src')!.slice(-5, -4));
  const hint = () => host.querySelector('[data-testid="swap-hint"]');

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('click 1st then 3rd swaps them; the other two stay put', () => {
    render();
    expect(order()).toEqual(['a', 'b', 'c', 'd']);
    click(cards()[0]);
    expect(cards()[0].dataset.selected).toBe('true');
    expect(hint()?.textContent).toContain('请选择要交换的另一张图片');
    click(cards()[2]);
    expect(order()).toEqual(['c', 'b', 'a', 'd']);
    expect(cards().every((c) => c.dataset.selected === 'false')).toBe(true);
    expect(hint()?.textContent).toContain('已交换');
  });

  it('survives repeated swaps without mixing up order', () => {
    render();
    const doSwap = (i: number, j: number) => {
      click(cards()[i]);
      click(cards()[j]);
    };
    doSwap(0, 3); // d b c a
    doSwap(1, 2); // d c b a
    doSwap(0, 1); // c d b a
    doSwap(3, 0); // a d b c
    expect(order()).toEqual(['a', 'd', 'b', 'c']);
  });

  it('mouse acts on press (not release) and the trailing click does not double-fire', () => {
    render();
    const press = (el: Element, pointerType: string) =>
      act(() => {
        const e = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 });
        Object.defineProperty(e, 'pointerType', { value: pointerType });
        el.dispatchEvent(e);
      });

    press(cards()[0], 'mouse');
    expect(cards()[0].dataset.selected).toBe('true'); // selected before release
    click(cards()[0]); // the click that follows the press is swallowed
    expect(cards()[0].dataset.selected).toBe('true');

    press(cards()[2], 'mouse');
    expect(order()).toEqual(['c', 'b', 'a', 'd']); // swapped on press
    click(cards()[2]);
    expect(order()).toEqual(['c', 'b', 'a', 'd']);
    expect(cards().every((c) => c.dataset.selected === 'false')).toBe(true);

    // touch: pointerdown alone does nothing, the click selects
    press(cards()[1], 'touch');
    expect(cards()[1].dataset.selected).toBe('false');
    click(cards()[1]);
    expect(cards()[1].dataset.selected).toBe('true');
  });

  it('two clicks in the same frame still swap the right pair', () => {
    render();
    act(() => {
      cards()[0].click();
      cards()[3].click();
    });
    expect(order()).toEqual(['d', 'b', 'c', 'a']);
  });

  it('clicking the selected card again cancels; Esc cancels too', () => {
    render();
    click(cards()[1]);
    click(cards()[1]);
    expect(cards()[1].dataset.selected).toBe('false');
    expect(hint()).toBeNull();
    expect(order()).toEqual(['a', 'b', 'c', 'd']);

    click(cards()[2]);
    expect(cards()[2].dataset.selected).toBe('true');
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(cards()[2].dataset.selected).toBe('false');
    expect(order()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('undo restores the previous order', () => {
    render();
    click(cards()[0]);
    click(cards()[3]);
    expect(order()).toEqual(['d', 'b', 'c', 'a']);
    click(host.querySelector('[data-testid="swap-undo"]')!);
    expect(order()).toEqual(['a', 'b', 'c', 'd']);
    expect(hint()).toBeNull();
  });

  it('replace button never selects or swaps, even with another card selected', () => {
    render();
    const replaceButtons = () => Array.from(host.querySelectorAll<HTMLElement>('[data-testid="replace-image"]'));
    const input = host.querySelectorAll<HTMLInputElement>('[data-testid="replace-input"]')[2];
    const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {});

    // no selection: pressing replace opens the picker only
    click(replaceButtons()[2]);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(cards().every((c) => c.dataset.selected === 'false')).toBe(true);
    expect(order()).toEqual(['a', 'b', 'c', 'd']);

    // with card 0 selected: pressing replace on card 2 must not swap
    click(cards()[0]);
    click(replaceButtons()[2]);
    expect(order()).toEqual(['a', 'b', 'c', 'd']);
    expect(cards()[0].dataset.selected).toBe('true');
  });

  it('replacing an image keeps position and ids, and swapping still works afterwards', () => {
    (URL as any).createObjectURL = vi.fn(() => 'blob:replaced/x.png');
    render();
    const input = host.querySelectorAll<HTMLInputElement>('[data-testid="replace-input"]')[0];
    const file = new File(['x'], 'x.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    act(() => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const srcs = () => Array.from(host.querySelectorAll('img')).map((i) => i.getAttribute('src'));
    expect(srcs()).toEqual(['blob:replaced/x.png', 'https://img.test/b.png', 'https://img.test/c.png', 'https://img.test/d.png']);

    click(cards()[0]);
    click(cards()[1]);
    expect(srcs()).toEqual(['https://img.test/b.png', 'blob:replaced/x.png', 'https://img.test/c.png', 'https://img.test/d.png']);
  });

  it('rejects non-image files on replace', () => {
    (URL as any).createObjectURL = vi.fn(() => 'blob:bad');
    render();
    const input = host.querySelectorAll<HTMLInputElement>('[data-testid="replace-input"]')[0];
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'x.txt', { type: 'text/plain' })], configurable: true });
    act(() => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(order()).toEqual(['a', 'b', 'c', 'd']);
    expect(host.querySelector('img')!.getAttribute('src')).toBe('https://img.test/a.png');
  });

  it('export mode renders no selection UI, hints or replace buttons', () => {
    render();
    click(cards()[0]);
    expect(hint()).not.toBeNull();
    act(() => root.render(<Harness exportMode />));
    // Same Harness instance: selection state is still set, but export mode must hide all UI.
    expect(host.querySelector('[data-export-ignore]')).toBeNull();
    expect(host.querySelector('[data-testid="replace-image"]')).toBeNull();
    expect(hint()).toBeNull();
    expect(host.querySelectorAll('img').length).toBe(4);
  });
  it('editor renders the light preview; export mode renders the original; loading shows a placeholder', () => {
    const items: CollageItem[] = [
      { id: 'p', url: 'blob:original-p', previewUrl: 'blob:preview-p' },
      { id: 'q', url: 'blob:original-q', loading: true },
      { id: 'r', url: 'https://img.test/r.png' }, // no preview: falls back to url
    ];
    const View: React.FC<{ exportMode: boolean }> = ({ exportMode }) => (
      <CollageGrid items={items} layout={LayoutType.GRID_3X3} setItems={() => {}} onReplaceFile={() => {}} gap={0} borderRadius={0} isExportMode={exportMode} />
    );
    act(() => root.render(<View exportMode={false} />));
    expect(Array.from(host.querySelectorAll('img')).map((i) => i.getAttribute('src'))).toEqual(['blob:preview-p', 'https://img.test/r.png']);
    expect(host.textContent).toContain('处理中');

    act(() => root.render(<View exportMode />));
    expect(Array.from(host.querySelectorAll('img')).map((i) => i.getAttribute('src'))).toEqual(['blob:original-p', 'blob:original-q', 'https://img.test/r.png']);
    expect(host.textContent).not.toContain('处理中');
  });
});
