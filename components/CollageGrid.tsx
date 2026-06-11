import React, { useEffect, useState } from 'react';
import { PhotoCard } from './PhotoCard';
import { CollageItem, LayoutType } from '../types';

interface CollageGridProps {
  items: CollageItem[];
  layout: LayoutType;
  setItems: React.Dispatch<React.SetStateAction<CollageItem[]>>;
  gap: number;
  borderRadius: number;
  isExportMode?: boolean;
}

export const CollageGrid: React.FC<CollageGridProps> = ({
  items,
  layout,
  setItems,
  gap,
  borderRadius,
  isExportMode = false,
}) => {
  const [selectedSwapIndex, setSelectedSwapIndex] = useState<number | null>(null);
  const [swapNotice, setSwapNotice] = useState('');
  const canSwap = items.length > 1;

  useEffect(() => {
    if (selectedSwapIndex !== null && selectedSwapIndex >= items.length) {
      setSelectedSwapIndex(null);
      setSwapNotice('');
    }
  }, [items.length, selectedSwapIndex]);

  useEffect(() => {
    if (!swapNotice) return;
    const timer = window.setTimeout(() => setSwapNotice(''), 1800);
    return () => window.clearTimeout(timer);
  }, [swapNotice]);

  const handleSwapSelect = (index: number) => {
    if (!canSwap) return;

    if (selectedSwapIndex === null) {
      setSelectedSwapIndex(index);
      setSwapNotice(`已选择第 ${index + 1} 张，点击另一张图片即可互换位置`);
      return;
    }

    if (selectedSwapIndex === index) {
      setSelectedSwapIndex(null);
      setSwapNotice('已取消选择');
      return;
    }

    const firstIndex = selectedSwapIndex;
    const secondIndex = index;
    setItems((prev) => {
      if (firstIndex >= prev.length || secondIndex >= prev.length) return prev;
      const nextItems = [...prev];
      [nextItems[firstIndex], nextItems[secondIndex]] = [nextItems[secondIndex], nextItems[firstIndex]];
      return nextItems;
    });
    setSelectedSwapIndex(null);
    setSwapNotice(`已交换第 ${firstIndex + 1} 张和第 ${secondIndex + 1} 张`);
  };

  const cancelSwapSelection = () => {
    setSelectedSwapIndex(null);
    setSwapNotice('');
  };

  const handleReplace = (id: string, file: File) => {
    const url = URL.createObjectURL(file);
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, url } : item))
    );
  };

  const gridClass = layout === LayoutType.GRID_2X2 ? 'grid-cols-2' : 'grid-cols-3';

  return (
    <div className="relative w-full h-full">
      {!isExportMode && canSwap && (selectedSwapIndex !== null || swapNotice) && (
        <div
          data-export-ignore="true"
          className="absolute left-3 right-3 top-3 z-20 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/95 px-3 py-2 text-xs font-bold text-indigo-700 shadow-lg ring-1 ring-indigo-100"
        >
          <span>{swapNotice || `已选择第 ${selectedSwapIndex! + 1} 张，点击另一张图片即可互换位置`}</span>
          {selectedSwapIndex !== null && (
            <button
              type="button"
              onClick={cancelSwapSelection}
              className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-black text-indigo-700 hover:bg-indigo-100"
            >
              取消选择
            </button>
          )}
        </div>
      )}

      <div
        className={`grid ${gridClass} w-full h-full`}
        style={{ gap: `${gap}px` }}
      >
        {items.map((item, index) => (
          <PhotoCard
            key={item.id}
            item={item}
            index={index}
            onReplace={handleReplace}
            onSwapClick={handleSwapSelect}
            borderRadius={borderRadius}
            canSwap={canSwap}
            isSelected={selectedSwapIndex === index}
            selectedSwapIndex={selectedSwapIndex}
            isExportMode={isExportMode}
          />
        ))}
      </div>
    </div>
  );
};
