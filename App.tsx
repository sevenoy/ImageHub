import React, { useState, useRef, useEffect } from 'react';
import { toPng, toBlob } from 'html-to-image';
import {
  Download,
  Grid2X2,
  Grid3X3,
  Palette,
  RotateCcw,
  Github,
  LayoutGrid,
  CloudUpload,
  Circle,
  Square,
  RectangleHorizontal,
  RectangleVertical,
  Monitor,
  Smartphone,
  Maximize,
  Scaling,
  PaintBucket,
  Shuffle,
  Zap,
  Settings,
  FileImage,
  Sliders,
  ChevronDown,
  ChevronUp,
  Stamp,
} from 'lucide-react';
import { CollageGrid } from './components/CollageGrid';
import { BatchWatermarkPanel } from './components/BatchWatermarkPanel';
import { CollageItem, LayoutType } from './types';
import { FILE_IMPORT_DEBUG_VERSION, SHOW_FILE_IMPORT_DEBUG } from './utils/nativeFolderInputDebug';

// Placeholder images from Picsum
const DEFAULT_IMAGES = [
  'https://picsum.photos/id/10/800/800',
  'https://picsum.photos/id/14/800/800',
  'https://picsum.photos/id/28/800/800',
  'https://picsum.photos/id/43/800/800',
  'https://picsum.photos/id/55/800/800',
  'https://picsum.photos/id/65/800/800',
  'https://picsum.photos/id/88/800/800',
  'https://picsum.photos/id/103/800/800',
  'https://picsum.photos/id/106/800/800',
];

const BACKGROUND_OPTIONS = [
  { name: '纯白', value: 'bg-white' },
  { name: '纯黑', value: 'bg-slate-900' },
  { name: '米色', value: 'bg-orange-50' },
  { name: '淡紫', value: 'bg-purple-50' },
  { name: '极光', value: 'bg-gradient-to-br from-emerald-400 to-cyan-400' },
  { name: '落日', value: 'bg-gradient-to-br from-orange-400 to-rose-400' },
  { name: '深海', value: 'bg-gradient-to-br from-blue-800 to-indigo-900' },
];

const shouldIncludeInExport = (node: HTMLElement): boolean =>
  node.dataset.exportIgnore !== 'true';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<'collage' | 'watermark'>('collage');
  const [layout, setLayout] = useState<LayoutType>(LayoutType.GRID_3X3);
  const [items, setItems] = useState<CollageItem[]>([]);

  // Style State
  const [gap, setGap] = useState<number>(3);
  const [outerPadding, setOuterPadding] = useState<number>(3);
  const [borderRadius, setBorderRadius] = useState<number>(6);
  const [aspectRatio, setAspectRatio] = useState<string>("3 / 4");
  const [backgroundClass, setBackgroundClass] = useState<string>("bg-white");

  // Export Settings
  const [exportFormat, setExportFormat] = useState<'png' | 'jpeg'>('png');
  const [exportQuality, setExportQuality] = useState<number>(0.85);

  // UI State (Collapsible Sections)
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isLayoutOpen, setIsLayoutOpen] = useState(false);
  const [isRatioOpen, setIsRatioOpen] = useState(false);
  const [isStyleOpen, setIsStyleOpen] = useState(false);
  const [isBackgroundOpen, setIsBackgroundOpen] = useState(false);

  const [isExporting, setIsExporting] = useState(false);
  const [isExportMode, setIsExportMode] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const collageRef = useRef<HTMLDivElement>(null);

  // Initialize items based on layout
  useEffect(() => {
    const count = layout === LayoutType.GRID_2X2 ? 4 : 9;

    setItems((prev) => {
      // If we are shrinking, slice the array
      if (prev.length >= count) {
        return prev.slice(0, count);
      }
      // If growing, add new items
      const newItems = [...prev];
      for (let i = prev.length; i < count; i++) {
        newItems.push({
          id: `item-${Date.now()}-${i}`,
          url: DEFAULT_IMAGES[i % DEFAULT_IMAGES.length],
        });
      }
      return newItems;
    });
  }, [layout]);

  const handleDownload = async () => {
    if (!collageRef.current) return;
    setIsExporting(true);
    setIsExportMode(true);

    const generateImage = async (width: number, format: 'png' | 'jpeg', quality: number): Promise<string | Blob | null> => {
      const currentWidth = collageRef.current!.offsetWidth;
      const ratio = width / currentWidth;
      const options = { quality, pixelRatio: ratio, filter: shouldIncludeInExport };

      if (format === 'png') {
        return await toPng(collageRef.current!, { ...options, quality: 1.0 });
      } else {
        return await toBlob(collageRef.current!, { ...options, type: 'image/jpeg' });
      }
    };

    try {
      // Small delay to ensure render states are clean
      await new Promise(resolve => setTimeout(resolve, 100));

      let result: string | Blob | null = null;
      let finalFormat = exportFormat;

      try {
        // Attempt 1: Desired settings (2448px width)
        result = await generateImage(2448, exportFormat, exportQuality);
      } catch (err: any) {
        console.warn("Attempt 1 failed:", err);

        // Attempt 2: Fallback to lower resolution (1920px)
        const confirmLowRes = window.confirm(`高清导出失败 (${err.message})。\n是否尝试降低分辨率 (1920px) 导出？`);
        if (!confirmLowRes) throw err;

        result = await generateImage(1920, exportFormat, exportQuality);
      }

      if (result) {
        const url = typeof result === 'string' ? result : URL.createObjectURL(result);
        const link = document.createElement('a');
        link.download = `collage-${layout}-${Date.now()}.${finalFormat === 'jpeg' ? 'jpg' : 'png'}`;
        link.href = url;
        link.click();

        if (typeof result !== 'string') {
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
      } else {
        throw new Error("生成结果为空");
      }

    } catch (err: any) {
      console.error('Failed to download image', err);
      alert(`生成图片最终失败: ${err.message || "未知错误"}\n\n建议：\n1. 尝试使用电脑浏览器\n2. 尝试选择 JPG 格式\n3. 减少图片数量`);
    } finally {
      setIsExportMode(false);
      setIsExporting(false);
    }
  };

  const handleFiles = (files: File[]) => {
    if (files.length === 0) return;

    let newLayout = layout;

    // Auto-switch layout based on file count
    if (files.length === 4) {
      newLayout = LayoutType.GRID_2X2;
    } else if (files.length >= 9) {
      newLayout = LayoutType.GRID_3X3;
    } else if (layout === LayoutType.GRID_2X2 && files.length > 4) {
      newLayout = LayoutType.GRID_3X3;
    }

    setLayout(newLayout);

    setItems(prev => {
      const targetCount = newLayout === LayoutType.GRID_2X2 ? 4 : 9;
      let nextItems = [...prev];

      if (nextItems.length > targetCount) {
        nextItems = nextItems.slice(0, targetCount);
      }
      while (nextItems.length < targetCount) {
        nextItems.push({
          id: `auto-${Date.now()}-${nextItems.length}`,
          url: DEFAULT_IMAGES[nextItems.length % DEFAULT_IMAGES.length]
        });
      }

      files.forEach((file, idx) => {
        if (idx < targetCount) {
          nextItems[idx] = {
            id: `upload-${Date.now()}-${idx}`,
            url: URL.createObjectURL(file)
          };
        }
      });

      return nextItems;
    });
  };

  // Global Drag Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = (Array.from(e.dataTransfer.files) as File[]).filter(f => f.type.startsWith('image/'));
    handleFiles(files);
  };

  // Feature: Shuffle Images
  const shuffleItems = () => {
    setItems(prev => {
      const shuffled = [...prev];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    });
  };

  // Feature: Seamless Mode
  const setSeamlessMode = () => {
    setGap(0);
    setOuterPadding(0);
    setBorderRadius(0);
  };

  const ratioOptions = [
    { label: '3:4', value: '3 / 4', icon: RectangleVertical },
    { label: '2:3', value: '2 / 3', icon: RectangleVertical },
    { label: '1:1', value: '1 / 1', icon: Square },
    { label: '4:3', value: '4 / 3', icon: RectangleHorizontal },
    { label: '16:9', value: '16 / 9', icon: Monitor },
    { label: '9:16', value: '9 / 16', icon: Smartphone },
  ];

  return (
    <div
      className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >

      {/* Drag Overlay */}
      {isDragOver && (
        <div className="fixed inset-0 bg-indigo-500/10 backdrop-blur-sm z-50 flex items-center justify-center p-8 pointer-events-none">
          <div className="border-4 border-indigo-500 border-dashed rounded-3xl w-full h-full flex flex-col items-center justify-center bg-white/50 animate-pulse">
            <CloudUpload size={64} className="text-indigo-600 mb-4" />
            <h2 className="text-3xl font-bold text-slate-800">释放图片</h2>
            <p className="text-lg text-slate-600 mt-2">自动排列 4 张或 9 张照片</p>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="w-full bg-white border-b border-gray-200 sticky top-0 z-30 px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg text-white">
            <LayoutGrid size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">
              ImageHub
            </h1>
            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">图片综合工具</p>
            {SHOW_FILE_IMPORT_DEBUG && <p className="text-[9px] text-indigo-600 font-black">{FILE_IMPORT_DEBUG_VERSION}</p>}
          </div>
        </div>

        <div className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-500">
          <span className="flex items-center gap-1"><Zap size={12} className="text-amber-500" /> 拖拽图片可直接上传</span>
          <span className="w-px h-3 bg-slate-200"></span>
          <span className="flex items-center gap-1"><Zap size={12} className="text-amber-500" /> 点击两张图片交换位置</span>
        </div>

        <a
          href="#"
          className="text-slate-400 hover:text-slate-800 transition-colors"
          title="Github"
        >
          <Github size={20} />
        </a>
      </header>

      <div className="w-full px-4 pt-4 relative z-20">
        <div className="container mx-auto">
          <div className="inline-flex w-full sm:w-auto items-center gap-1 rounded-2xl bg-white border border-slate-200 p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setActiveView('collage')}
              className={`flex flex-1 sm:flex-none items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
                activeView === 'collage' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <LayoutGrid size={16} />
              多图合成
            </button>
            <button
              type="button"
              onClick={() => setActiveView('watermark')}
              className={`flex flex-1 sm:flex-none items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
                activeView === 'watermark' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Stamp size={16} />
              批量水印
            </button>
          </div>
        </div>
      </div>

      {/* Main Content - Flex Column on Mobile, Row on Desktop */}
      {activeView === 'collage' ? (
      <main className="flex-1 container mx-auto px-4 py-6 flex flex-col md:flex-col lg:flex-row gap-6 items-start justify-center overflow-hidden">

        {/* Collage Display Area - NOW ON TOP */}
        <div className="w-full lg:flex-1 flex items-start justify-center min-h-[400px] md:min-h-[500px] bg-slate-100/50 rounded-3xl border-2 border-dashed border-slate-200 p-4 md:p-8 overflow-auto order-1">
          {/* The Canvas */}
          <div
            className={`relative shadow-2xl transition-colors duration-300 ease-in-out ${backgroundClass}`}
            style={{
              aspectRatio: aspectRatio,
              padding: `${outerPadding}px`,
              width: '100%',
              maxWidth: '800px'
            }}
            ref={collageRef}
          >
            <CollageGrid
              items={items}
              layout={layout}
              setItems={setItems}
              gap={gap}
              borderRadius={borderRadius}
              isExportMode={isExportMode}
            />
          </div>
        </div>

        {/* Settings Panel - NOW BELOW (Order 2) */}
        <aside className="w-full lg:w-80 flex-shrink-0 space-y-4 order-2 pb-10">

          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-3">
            <button
              onClick={handleDownload}
              disabled={isExporting}
              className="w-full flex items-center justify-center gap-2 p-3.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-300 hover:shadow-xl hover:-translate-y-0.5 font-bold text-sm disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isExporting ? '正在渲染...' : '下载高清大图'}
              {!isExporting && <Download size={16} />}
            </button>
          </div>

          {/* 1. Export Settings & Download (Top Priority) */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <button
              onClick={() => setIsExportOpen(!isExportOpen)}
              className="w-full p-4 flex items-center justify-between bg-white hover:bg-slate-50 transition-colors"
            >
              <h3 className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                <Settings size={12} /> 导出设置
              </h3>
              {isExportOpen ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
            </button>

            {isExportOpen && (
              <div className="px-4 pb-4 space-y-4 animate-fade-in border-t border-slate-50 pt-4">
                {/* Format Selection */}
                <div>
                  <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5 mb-2"><FileImage size={12} /> 图片格式</label>
                  <div className="relative">
                    <select
                      value={exportFormat}
                      onChange={(e) => setExportFormat(e.target.value as any)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="jpeg">JPG (通用)</option>
                      <option value="png">PNG (无损 - 极大)</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                {/* Quality Slider (Hidden for PNG) */}
                {exportFormat !== 'png' && (
                  <div className="animate-fade-in">
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5"><Sliders size={12} /> 压缩质量</label>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${exportQuality > 0.9 ? 'bg-green-100 text-green-700' :
                        exportQuality > 0.7 ? 'bg-blue-100 text-blue-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                        {Math.round(exportQuality * 100)}%
                      </span>
                    </div>
                    <input
                      type="range" min="0.1" max="1.0" step="0.01"
                      value={exportQuality}
                      onChange={(e) => setExportQuality(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2. Layout & Actions */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <button
              onClick={() => setIsLayoutOpen(!isLayoutOpen)}
              className="w-full p-4 flex items-center justify-between bg-white hover:bg-slate-50 transition-colors"
            >
              <h3 className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                <Grid2X2 size={12} /> 布局与操作
              </h3>
              {isLayoutOpen ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
            </button>

            {isLayoutOpen && (
              <div className="px-4 pb-4 space-y-4 animate-fade-in border-t border-slate-50 pt-4">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setLayout(LayoutType.GRID_2X2)}
                    className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all ${layout === LayoutType.GRID_2X2
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-500'
                      : 'border-slate-200 hover:border-slate-300 text-slate-500'
                      }`}
                  >
                    <Grid2X2 size={20} className="mb-1" />
                    <span className="text-xs font-bold">2 x 2</span>
                  </button>
                  <button
                    onClick={() => setLayout(LayoutType.GRID_3X3)}
                    className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all ${layout === LayoutType.GRID_3X3
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-500'
                      : 'border-slate-200 hover:border-slate-300 text-slate-500'
                      }`}
                  >
                    <Grid3X3 size={20} className="mb-1" />
                    <span className="text-xs font-bold">3 x 3</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={shuffleItems}
                    className="flex items-center justify-center gap-2 p-2.5 bg-slate-50 text-slate-700 rounded-lg hover:bg-slate-100 transition-colors font-medium text-xs border border-slate-200"
                  >
                    <Shuffle size={14} />
                    <span>随机位置</span>
                  </button>
                  <button
                    onClick={() => setItems(prev => prev.map((item, idx) => ({ ...item, url: DEFAULT_IMAGES[idx % DEFAULT_IMAGES.length] + `?r=${Date.now()}` })))}
                    className="flex items-center justify-center gap-2 p-2.5 bg-slate-50 text-slate-700 rounded-lg hover:bg-slate-100 transition-colors font-medium text-xs border border-slate-200"
                  >
                    <RotateCcw size={14} />
                    <span>重置图片</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 3. Dimensions & Ratio */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <button
              onClick={() => setIsRatioOpen(!isRatioOpen)}
              className="w-full p-4 flex items-center justify-between bg-white hover:bg-slate-50 transition-colors"
            >
              <h3 className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                <Maximize size={12} /> 尺寸与比例
              </h3>
              {isRatioOpen ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
            </button>

            {isRatioOpen && (
              <div className="px-4 pb-4 animate-fade-in border-t border-slate-50 pt-4">
                <div className="relative">
                  <select
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {ratioOptions.map((option) => (
                      <option key={option.label} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>
            )}
          </div>

          {/* 4. Styles (Gaps, Padding, Radius) */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <button
              onClick={() => setIsStyleOpen(!isStyleOpen)}
              className="w-full p-4 flex items-center justify-between bg-white hover:bg-slate-50 transition-colors"
            >
              <h3 className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                <Palette size={12} /> 样式微调
              </h3>
              {isStyleOpen ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
            </button>

            {isStyleOpen && (
              <div className="px-4 pb-4 space-y-4 animate-fade-in border-t border-slate-50 pt-4">
                <div className="flex justify-end">
                  <button
                    onClick={setSeamlessMode}
                    className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full font-bold hover:bg-indigo-200 transition-colors"
                  >
                    一键无缝
                  </button>
                </div>

                {/* Sliders */}
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5"><Scaling size={12} /> 画布外边距</label>
                      <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 font-mono">{outerPadding}px</span>
                    </div>
                    <input
                      type="range" min="0" max="60" value={outerPadding}
                      onChange={(e) => setOuterPadding(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5"><LayoutGrid size={12} /> 图片间距</label>
                      <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 font-mono">{gap}px</span>
                    </div>
                    <input
                      type="range" min="0" max="40" value={gap}
                      onChange={(e) => setGap(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5"><Circle size={12} /> 圆角半径</label>
                      <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 font-mono">{borderRadius}px</span>
                    </div>
                    <input
                      type="range" min="0" max="60" value={borderRadius}
                      onChange={(e) => setBorderRadius(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 5. Background Color */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <button
              onClick={() => setIsBackgroundOpen(!isBackgroundOpen)}
              className="w-full p-4 flex items-center justify-between bg-white hover:bg-slate-50 transition-colors"
            >
              <h3 className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                <PaintBucket size={12} /> 背景风格
              </h3>
              {isBackgroundOpen ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
            </button>

            {isBackgroundOpen && (
              <div className="px-4 pb-4 animate-fade-in border-t border-slate-50 pt-4">
                <div className="relative">
                  <select
                    value={backgroundClass}
                    onChange={(e) => setBackgroundClass(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {BACKGROUND_OPTIONS.map((bg) => (
                      <option key={bg.name} value={bg.value}>
                        {bg.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>
            )}
          </div>

        </aside>
      </main>
      ) : (
        <main className="flex-1 container mx-auto px-4 py-6 max-w-5xl">
          <BatchWatermarkPanel />
        </main>
      )}
    </div>
  );
};

export default App;
