import React, { useRef } from 'react';
import { Check, ImagePlus, Repeat2 } from 'lucide-react';
import { CollageItem } from '../types';

interface PhotoCardProps {
  item: CollageItem;
  index: number;
  onReplace: (id: string, file: File) => void;
  onSwapClick: (id: string) => void;
  borderRadius: number;
  canSwap: boolean;
  isSelected: boolean;
  /** Another card is selected and this one is a possible swap partner. */
  isSwapTarget: boolean;
  /** Just swapped: shows a brief confirmation outline. */
  isFlashing: boolean;
  isExportMode?: boolean;
}

/**
 * Two independent actions per cell:
 *  - clicking the image selects / swaps (the `card` element)
 *  - the corner button replaces the image (a SIBLING of the card, so its
 *    clicks can never reach the swap handler).
 * All selection UI is drawn in overlays marked data-export-ignore and is not
 * rendered at all while exporting; the image itself is never dimmed.
 */
export const PhotoCard: React.FC<PhotoCardProps> = ({
  item,
  index,
  onReplace,
  onSwapClick,
  borderRadius,
  canSwap,
  isSelected,
  isSwapTarget,
  isFlashing,
  isExportMode = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const showUi = !isExportMode;

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('image/')) onReplace(item.id, file);
    event.target.value = '';
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!canSwap) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSwapClick(item.id);
    }
  };

  const label = !canSwap
    ? `第 ${index + 1} 张图片`
    : isSelected
      ? `第 ${index + 1} 张图片，已选中，点击取消`
      : isSwapTarget
        ? `第 ${index + 1} 张图片，点击与已选图片交换`
        : `第 ${index + 1} 张图片，点击选择以交换位置`;

  return (
    <div
      data-photo-id={item.id}
      style={{ borderRadius: `${borderRadius}px` }}
      className="relative group w-full h-full overflow-hidden bg-gray-100"
    >
      <div
        data-testid="photo-card"
        data-selected={isSelected ? 'true' : 'false'}
        role={canSwap ? 'button' : undefined}
        aria-pressed={canSwap ? isSelected : undefined}
        aria-label={label}
        tabIndex={canSwap ? 0 : -1}
        onClick={canSwap ? () => onSwapClick(item.id) : undefined}
        onKeyDown={handleKeyDown}
        className={`absolute inset-0 outline-none ${canSwap && showUi ? 'cursor-pointer' : ''}`}
      >
        <img
          src={item.url}
          alt={`第 ${index + 1} 张拼图图片`}
          className="w-full h-full object-cover pointer-events-none select-none"
          draggable={false}
        />
      </div>

      {showUi && (
        <div data-export-ignore="true" className="pointer-events-none absolute inset-0">
          {/* outline only: the photo underneath stays fully visible */}
          <div
            className={`absolute inset-0 transition-all duration-150 ${
              isSelected
                ? 'border-4 border-indigo-500 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.9)]'
                : isFlashing
                  ? 'border-[3px] border-emerald-400'
                  : 'border-0 border-transparent'
            }`}
            style={{ borderRadius: `${borderRadius}px` }}
          />

          {isSelected && (
            <div className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white shadow-md">
              <Check size={14} strokeWidth={3} />
            </div>
          )}

          {isSwapTarget && (
            <div className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-indigo-600 shadow-md ring-1 ring-indigo-200">
              <Repeat2 size={18} />
            </div>
          )}
        </div>
      )}

      {showUi && (
        <button
          type="button"
          data-export-ignore="true"
          data-testid="replace-image"
          aria-label={`替换第 ${index + 1} 张图片`}
          title="替换图片"
          onClick={() => fileInputRef.current?.click()}
          className={`absolute bottom-2 right-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-md ring-1 ring-black/5 transition-opacity hover:bg-white active:scale-95 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
            isSelected ? 'opacity-100' : 'opacity-80 group-hover:opacity-100'
          }`}
        >
          <ImagePlus size={16} />
        </button>
      )}

      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        data-testid="replace-input"
        onChange={handleFileChange}
      />
    </div>
  );
};
