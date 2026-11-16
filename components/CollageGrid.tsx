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
  // The ref mirrors the state so click handlers stay referentially stable
  // (PhotoCard is memoized) and always see the latest selection, even for two
  // clicks that land within the same frame.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const [lastSwap, setLastSwap] = useState<{ a: string; b: string } | null>(null);
  const swallowNextClick = useRef(false);
  const undoTimer = useRef<number | undefined>(undefined);
  const canSwap = items.length > 1;
  const canSwapRef = useRef(canSwap);
  canSwapRef.current = canSwap;

  const select = useCallback((id: string | null) => {
    selectedRef.current = id;
    setSelectedId(id);
  }, []);

  const startUndoWindow = useCallback((pair: { a: string; b: string } | null) => {
    window.clearTimeout(undoTimer.current);
    setLastSwap(pair);
    if (pair) {
      undoTimer.current = window.setTimeout(() => setLastSwap(null), UNDO_WINDOW_MS);
    }
  }, []);

  useEffect(() => () => window.clearTimeout(undoTimer.current), []);

  // Drop stale selection / undo if an item disappeared (e.g. layout shrank).
  useEffect(() => {
    if (selectedId !== null && !items.some((i) => i.id === selectedId)) select(null);
    if (lastSwap && !(items.some((i) => i.id === lastSwap.a) && items.some((i) => i.id === lastSwap.b))) {
      startUndoWindow(null);
    }
  }, [items, selectedId, lastSwap, select, startUndoWindow]);

  const cancelSelection = useCallback(() => select(null), [select]);

  // Esc cancels the current selection from anywhere on the page.
  useEffect(() => {
    if (selectedId === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelSelection();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId, cancelSelection]);

  const handleSwapSelect = useCallback(
    (id: string) => {
      if (!canSwapRef.current) return;
      const current = selectedRef.current;

      if (current === null) {
        startUndoWindow(null);
        select(id);
        return;
      }
      if (current === id) {
        select(null);
        return;
      }

      const pair = { a: current, b: id };
      setItems((prev) => swapItemsById(prev, pair.a, pair.b));
      select(null);
      startUndoWindow(pair);
    },
    [select, setItems, startUndoWindow],
  );

  // A mouse press already did the work; drop the click that follows it, wherever
  // the browser delivers it (the card under the cursor may have moved).
  const handlePress = useCallback(
    (id: string) => {
      swallowNextClick.current = true;
      handleSwapSelect(id);
    },
    [handleSwapSelect],
  );

  const undoSwap = () => {
    if (!lastSwap) return;
    const pair = lastSwap;
    setItems((prev) => swapItemsById(prev, pair.a, pair.b));
    startUndoWindow(null);
  };

  // Replacing an image is independent from swapping: it only changes that
  // item's url and clears any pending selection / undo.
  const handleReplace = useCallback(
    (id: string, file: File) => {
      const url = URL.createObjectURL(file);
      setItems((prev) => replaceItemUrl(prev, id, url));
      select(null);
      startUndoWindow(null);
    },
    [select, setItems, startUndoWindow],
  );

  const gridClass = layout === LayoutType.GRID_2X2 ? 'grid-cols-2' : 'grid-cols-3';
  const showHint = !isExportMode && canSwap && (selectedId !== null || lastSwap !== null);

  return (
    <div className="relative w-full h-full">
      <div
        className={`grid ${gridClass} w-full h-full`}
        style={{ gap: `${gap}px` }}
        onPointerDownCapture={() => {
          swallowNextClick.current = false;
        }}
        onClickCapture={(event) => {
          if (!swallowNextClick.current) return;
          swallowNextClick.current = false;
          event.stopPropagation();
        }}
      >
        {items.map((item, index) => (
          <PhotoCard
            key={item.id}
            item={item}
            index={index}
            onReplace={handleReplace}
            onSwapClick={handleSwapSelect}
            onSwapPress={handlePress}
            borderRadius={borderRadius}
            canSwap={canSwap}
            isSelected={selectedId === item.id}
            isSwapTarget={selectedId !== null && selectedId !== item.id}
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
          <div className="pointer-events-auto flex max-w-full items-center gap-1 rounded-full bg-slate-900 py-1 pl-3 pr-1 text-xs font-medium text-white shadow-lg">
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
