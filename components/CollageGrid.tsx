import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Repeat2, RotateCcw, X } from 'lucide-react';
import { PhotoCard } from './PhotoCard';
import { CollageItem, LayoutType } from '../types';
import { replaceItemUrl, swapItemsById } from '../utils/collageSwap';

interface CollageGridProps {
  items: CollageItem[];
  layout: LayoutType;
  setItems: React.Dispatch<React.SetStateAction<CollageItem[]>>;
  gap: number;
  borderRadius: number;
  isExportMode?: boolean;
}

const UNDO_WINDOW_MS = 5000;
const FLASH_MS = 700;

export const CollageGrid: React.FC<CollageGridProps> = ({
  items,
  layout,
  setItems,
  gap,
  borderRadius,
  isExportMode = false,
}) => {
  // Selection and undo are tracked by item id, never by index, so they stay
  // attached to the right image even if the list changes in between.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastSwap, setLastSwap] = useState<{ a: string; b: string } | null>(null);
  const [flashIds, setFlashIds] = useState<string[]>([]);
  const timers = useRef<number[]>([]);
  const canSwap = items.length > 1;

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  // Drop stale selection / undo if an item disappeared (e.g. layout shrank).
  useEffect(() => {
    if (selectedId !== null && !items.some((i) => i.id === selectedId)) setSelectedId(null);
    if (lastSwap && !(items.some((i) => i.id === lastSwap.a) && items.some((i) => i.id === lastSwap.b))) {
      setLastSwap(null);
    }
  }, [items, selectedId, lastSwap]);

  const cancelSelection = useCallback(() => setSelectedId(null), []);

  // Esc cancels the current selection from anywhere on the page.
  useEffect(() => {
    if (selectedId === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelSelection();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId, cancelSelection]);

  const flash = (ids: string[]) => {
    setFlashIds(ids);
    later(() => setFlashIds([]), FLASH_MS);
  };

  const handleSwapSelect = (id: string) => {
    if (!canSwap) return;

    if (selectedId === null) {
      setLastSwap(null);
      setSelectedId(id);
      return;
    }

    if (selectedId === id) {
      setSelectedId(null);
      return;
    }

    const pair = { a: selectedId, b: id };
    setItems((prev) => swapItemsById(prev, pair.a, pair.b));
    setSelectedId(null);
    setLastSwap(pair);
    flash([pair.a, pair.b]);
    later(() => setLastSwap((current) => (current === pair ? null : current)), UNDO_WINDOW_MS);
  };

  const undoSwap = () => {
    if (!lastSwap) return;
    const pair = lastSwap;
    setItems((prev) => swapItemsById(prev, pair.a, pair.b));
    setLastSwap(null);
    flash([pair.a, pair.b]);
  };

  // Replacing an image is independent from swapping: it only changes that
  // item's url and leaves selection-free state behind.
  const handleReplace = (id: string, file: File) => {
    const url = URL.createObjectURL(file);
    setItems((prev) => replaceItemUrl(prev, id, url));
    setSelectedId(null);
    setLastSwap(null);
  };

  const gridClass = layout === LayoutType.GRID_2X2 ? 'grid-cols-2' : 'grid-cols-3';
  const showHint = !isExportMode && canSwap && (selectedId !== null || lastSwap !== null);

  return (
    <div className="relative w-full h-full">
      <div className={`grid ${gridClass} w-full h-full`} style={{ gap: `${gap}px` }}>
        {items.map((item, index) => (
          <PhotoCard
            key={item.id}
            item={item}
            index={index}
            onReplace={handleReplace}
            onSwapClick={handleSwapSelect}
            borderRadius={borderRadius}
            canSwap={canSwap}
            isSelected={selectedId === item.id}
            isSwapTarget={selectedId !== null && selectedId !== item.id}
            isFlashing={flashIds.includes(item.id)}
            isExportMode={isExportMode}
          />
        ))}
      </div>

      {showHint && (
        <div
          data-export-ignore="true"
          data-testid="swap-hint"
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-3"
        >
          <div className="pointer-events-auto flex max-w-full items-center gap-1 rounded-full bg-slate-900/90 py-1 pl-3 pr-1 text-xs font-medium text-white shadow-lg backdrop-blur">
            {selectedId !== null ? (
              <>
                <Repeat2 size={14} className="shrink-0 text-indigo-300" />
                <span className="truncate">请选择要交换的另一张图片</span>
                <button
                  type="button"
                  data-testid="swap-cancel"
                  aria-label="取消选择"
                  onClick={cancelSelection}
                  className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-white/15"
                >
                  <X size={14} />
                </button>
              </>
            ) : (
              <>
                <span>已交换位置</span>
                <button
                  type="button"
                  data-testid="swap-undo"
                  onClick={undoSwap}
                  className="ml-1 flex h-8 shrink-0 items-center gap-1 rounded-full px-3 font-bold text-indigo-200 hover:bg-white/15"
                >
                  <RotateCcw size={12} />
                  撤销
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
