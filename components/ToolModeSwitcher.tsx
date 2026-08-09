import React from 'react';
import { LayoutGrid, Stamp } from 'lucide-react';

export type ToolMode = 'collage' | 'watermark';

type ToolModeSwitcherProps = {
  activeView: ToolMode;
  onChange: (view: ToolMode) => void;
};

export const ToolModeSwitcher: React.FC<ToolModeSwitcherProps> = ({ activeView, onChange }) => (
  <nav aria-label="工具模式" className="w-full px-4 pt-4 relative z-20">
    <div className="container mx-auto">
      <div data-testid="tool-mode-switcher" className="inline-flex w-full sm:w-auto items-center gap-1 rounded-2xl bg-white border border-slate-200 p-1 shadow-sm">
        <button
          type="button"
          onClick={() => onChange('collage')}
          aria-pressed={activeView === 'collage'}
          className={`flex flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm ${
            activeView === 'collage' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <LayoutGrid size={16} />
          多图合成
        </button>
        <button
          type="button"
          onClick={() => onChange('watermark')}
          aria-pressed={activeView === 'watermark'}
          className={`flex flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm ${
            activeView === 'watermark' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Stamp size={16} />
          批量水印
        </button>
      </div>
    </div>
  </nav>
);
