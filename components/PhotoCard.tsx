import React, { useRef } from 'react';
import { Check, RefreshCw, Repeat2 } from 'lucide-react';
import { CollageItem } from '../types';

interface PhotoCardProps {
  item: CollageItem;
  index: number;
  onReplace: (id: string, file: File) => void;
  onSwapClick: (index: number) => void;
  borderRadius: number;
  canSwap: boolean;
  isSelected: boolean;
  selectedSwapIndex: number | null;
  isExportMode?: boolean;
}

export const PhotoCard: React.FC<PhotoCardProps> = ({
  item,
  index,
  onReplace,
  onSwapClick,
  borderRadius,
  canSwap,
  isSelected,
  selectedSwapIndex,
  isExportMode = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const showSwapUi = !isExportMode;

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      onReplace(item.id, event.target.files[0]);
    }
    event.target.value = '';
  };

  const stopCardEvent = (event: React.MouseEvent | React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const triggerUpload = (event: React.MouseEvent) => {
    stopCardEvent(event);
    fileInputRef.current?.click();
  };

  const handleCardClick = () => {
    if (canSwap) onSwapClick(index);
  };

  const handleCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!canSwap) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSwapClick(index);
    }
    if (event.key === 'Escape' && isSelected) {
      event.preventDefault();
      onSwapClick(index);
    }
  };

  const instruction = !canSwap
    ? '替换图片'
    : isSelected
      ? '已选中，点击另一张互换'
      : selectedSwapIndex !== null
        ? `点击与第 ${selectedSwapIndex + 1} 张互换`
        : '点击选择交换位置';

  return (
    <div
      role={canSwap ? 'button' : undefined}
      tabIndex={canSwap ? 0 : -1}
      aria-label={canSwap ? `第 ${index + 1} 张图片，${instruction}` : `第 ${index + 1} 张图片`}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      style={{ borderRadius: `${borderRadius}px` }}
      className={`relative group w-full h-full overflow-hidden bg-gray-100 outline-none transition-all duration-200 ${
        isExportMode
          ? 'ring-0'
          : isSelected
          ? 'ring-4 ring-inset ring-indigo-500 shadow-2xl'
          : canSwap
            ? 'ring-0 hover:ring-2 hover:ring-inset hover:ring-indigo-300/70 focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-indigo-400'
            : 'ring-0'
      }`}
    >
      <img
        src={item.url}
        alt={`第 ${index + 1} 张拼图图片`}
        className="w-full h-full object-cover pointer-events-none select-none"
        draggable={false}
      />

      {showSwapUi && isSelected && (
        <div
          data-export-ignore="true"
          className="absolute left-2 top-2 z-20 flex items-center gap-1 rounded-full bg-indigo-600 px-2 py-1 text-[10px] font-black text-white shadow-lg"
        >
          <Check size={12} />
          待交换
        </div>
      )}

      {showSwapUi && (
        <div
          data-export-ignore="true"
          className={`absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity duration-200 ${
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
          }`}
        >
          <div className="flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-xs font-medium text-white">
            <Repeat2 size={12} />
            {instruction}
          </div>

          <button
            type="button"
            onClick={triggerUpload}
            onPointerDown={stopCardEvent}
            className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-lg transition-transform hover:bg-indigo-50 active:scale-95"
          >
            <RefreshCw size={14} />
            替换图片
          </button>
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onClick={(event) => event.stopPropagation()}
        onChange={handleFileChange}
      />
    </div>
  );
};
