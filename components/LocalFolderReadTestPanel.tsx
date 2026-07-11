import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FolderInput,
  Image as ImageIcon,
  Loader2,
  RefreshCcw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  ImageFileItem,
  LocalImageReadReport,
  canUseFileSystemAccessDirectory,
  formatFileSize,
  pickSourceDirectory,
  readImagesFromDirectoryHandle,
  readImagesFromFileList,
  revokeImageFileItemUrls,
} from '../utils/localImageFiles';
import {
  FILE_IMPORT_DEBUG_VERSION,
  SHOW_FILE_IMPORT_DEBUG,
  NativeFolderInputDebug,
  copyNativeFolderInputDebug,
  createInitialNativeFolderInputDebug,
  createNativeFolderInputDebug,
} from '../utils/nativeFolderInputDebug';

const pageSize = 200;
const acceptedImageTypes = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';

type Diagnostics = {
  userAgent: string;
  isSecureContext: boolean;
  hasShowDirectoryPicker: boolean;
  inputHasWebkitDirectory: boolean;
  inputAttributeWebkitDirectory: boolean;
  fileCountAfterSelect: number;
  firstFileName: string;
  firstFileRelativePath: string;
  href: string;
};

const makeEmptyReport = (): LocalImageReadReport => ({
  mode: 'webkitdirectory',
  rootName: '未选择',
  rawFileCount: 0,
  imageCount: 0,
  skippedCount: 0,
  systemSkippedCount: 0,
  invalidImageCount: 0,
  decodeFailedCount: 0,
  limitSkippedCount: 0,
  unsupportedCount: 0,
  errorCount: 0,
  firstRelativePaths: [],
  firstSystemSkippedPaths: [],
  firstSkippedReasons: [],
  firstDecodeFailedPaths: [],
  firstValidImagePaths: [],
  errors: [],
});

const makeDiagnostics = (input: HTMLInputElement | null, files: File[] = []): Diagnostics => ({
  userAgent: navigator.userAgent,
  isSecureContext: window.isSecureContext,
  hasShowDirectoryPicker: 'showDirectoryPicker' in window,
  inputHasWebkitDirectory: Boolean(
    input && ((input as HTMLInputElement & { webkitdirectory?: unknown }).webkitdirectory !== undefined || input.hasAttribute('webkitdirectory'))
  ),
  inputAttributeWebkitDirectory: Boolean(input?.hasAttribute('webkitdirectory')),
  fileCountAfterSelect: files.length,
  firstFileName: files[0]?.name || '',
  firstFileRelativePath: files[0] ? ((files[0] as File & { webkitRelativePath?: string }).webkitRelativePath || '') : '',
  href: window.location.href,
});

const getErrorMessage = (error: unknown) => {
  if (error instanceof DOMException && error.name === 'AbortError') return '任务已取消';
  if (error instanceof Error) return error.message;
  return '未知错误';
};

export const LocalFolderReadTestPanel: React.FC = () => {
  const [items, setItems] = useState<ImageFileItem[]>([]);
  const [report, setReport] = useState<LocalImageReadReport | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [nativeDebug, setNativeDebug] = useState<NativeFolderInputDebug | null>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const [isReading, setIsReading] = useState(false);
  const [isReadingAdvanced, setIsReadingAdvanced] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [brokenIds, setBrokenIds] = useState<Record<string, boolean>>({});

  const imageInputRef = useRef<HTMLInputElement>(null);
  const directoryInputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<ImageFileItem[]>([]);
  // object URLs created for the currently visible page only
  const pageUrlsRef = useRef<Map<string, string>>(new Map());
  const isMountedRef = useRef(true);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const revokePageUrls = useCallback(() => {
    pageUrlsRef.current.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
    });
    pageUrlsRef.current = new Map();
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    const directoryInput = directoryInputRef.current as (HTMLInputElement & { webkitdirectory?: boolean; directory?: boolean }) | null;
    if (directoryInput) {
      directoryInput.webkitdirectory = true;
      directoryInput.directory = true;
      directoryInput.setAttribute('webkitdirectory', '');
    }
    setDiagnostics(makeDiagnostics(directoryInputRef.current));
    setNativeDebug(createInitialNativeFolderInputDebug('folder-read', directoryInputRef.current));
    return () => {
      isMountedRef.current = false;
      revokePageUrls();
      revokeImageFileItemUrls(itemsRef.current);
    };
  }, [revokePageUrls]);

  const clearImages = useCallback(() => {
    revokePageUrls();
    revokeImageFileItemUrls(itemsRef.current);
    itemsRef.current = [];
    setItems([]);
    setReport(null);
    setCopyStatus('');
    setError('');
    setPage(1);
    setBrokenIds({});
  }, [revokePageUrls]);

  const applyReadResult = useCallback((images: ImageFileItem[], nextReport: LocalImageReadReport) => {
    revokePageUrls();
    revokeImageFileItemUrls(itemsRef.current);
    itemsRef.current = images;
    setItems(images);
    setReport(nextReport);
    setPage(1);
    setBrokenIds({});
    if (images.length === 0) {
      setError('没有可用图片：该文件夹中没有读取到可解码的 jpg/jpeg/png/webp 图片。');
    } else {
      setError('');
    }
  }, [revokePageUrls]);

  const handleDirectoryInputChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    clearImages();
    const files = Array.from((event.currentTarget.files || []) as ArrayLike<File>);
    setDiagnostics(makeDiagnostics(directoryInputRef.current, files));
    event.currentTarget.value = '';

    if (files.length === 0) {
      // User cancelled the native picker, or selected nothing.
      setError('未选择文件夹。');
      return;
    }

    setIsReading(true);
    try {
      const result = await readImagesFromFileList(files, 'webkitdirectory', { createObjectUrls: false });
      if (!isMountedRef.current) return;
      setNativeDebug(createNativeFolderInputDebug(
        'folder-read',
        directoryInputRef.current,
        files,
        result,
        result.images.length,
        result.images[0]?.name || null
      ));
      applyReadResult(result.images, result.report);
    } catch (readError) {
      if (!isMountedRef.current) return;
      setNativeDebug(createNativeFolderInputDebug('folder-read', directoryInputRef.current, files, null, 0, null));
      setReport(makeEmptyReport());
      setError(`读取文件夹失败：${getErrorMessage(readError)}`);
    } finally {
      if (isMountedRef.current) setIsReading(false);
    }
  }, [applyReadResult, clearImages]);

  const handleImageInputChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    clearImages();
    const files = Array.from((event.currentTarget.files || []) as ArrayLike<File>);
    setDiagnostics(makeDiagnostics(directoryInputRef.current, files));
    event.currentTarget.value = '';

    if (files.length === 0) {
      setError('未选择图片。');
      return;
    }

    setIsReading(true);
    try {
      const result = await readImagesFromFileList(files, 'files', { createObjectUrls: false });
      if (!isMountedRef.current) return;
      setNativeDebug(createNativeFolderInputDebug(
        'folder-read',
        directoryInputRef.current,
        files,
        result,
        result.images.length,
        result.images[0]?.name || null
      ));
      applyReadResult(result.images, result.report);
    } catch (readError) {
      if (!isMountedRef.current) return;
      setError(`读取图片失败：${getErrorMessage(readError)}`);
    } finally {
      if (isMountedRef.current) setIsReading(false);
    }
  }, [applyReadResult, clearImages]);

  const handleCopyDebug = useCallback(async () => {
    if (!nativeDebug) return;
    try {
      await copyNativeFolderInputDebug(nativeDebug);
      setCopyStatus('已复制');
    } catch (copyError) {
      setCopyStatus(`复制失败：${getErrorMessage(copyError)}`);
    }
  }, [nativeDebug]);

  const handleAdvancedDirectoryPick = useCallback(async () => {
    if (!canUseFileSystemAccessDirectory()) {
      setError('当前浏览器不支持 showDirectoryPicker。请使用默认“选择文件夹”。');
      return;
    }

    clearImages();
    setIsReadingAdvanced(true);
    setDiagnostics(makeDiagnostics(directoryInputRef.current));

    try {
      const directory = await pickSourceDirectory();
      const result = await readImagesFromDirectoryHandle(directory, { createObjectUrls: false });
      if (!isMountedRef.current) return;
      applyReadResult(result.images, result.report);
    } catch (advancedError) {
      if (advancedError instanceof DOMException && advancedError.name === 'AbortError') {
        if (isMountedRef.current) setError('未选择文件夹（已取消）。');
      } else if (isMountedRef.current) {
        setError(`高级选择文件夹失败：${getErrorMessage(advancedError)}`);
      }
    } finally {
      if (isMountedRef.current) setIsReadingAdvanced(false);
    }
  }, [applyReadResult, clearImages]);

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const clampedPage = Math.min(page, pageCount);
  const visibleItems = useMemo(() => {
    const start = (clampedPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [clampedPage, items]);

  // Create object URLs only for the currently visible page; revoke the previous page's URLs.
  useEffect(() => {
    revokePageUrls();
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return;
    const map = new Map<string, string>();
    for (const item of visibleItems) {
      try {
        map.set(item.id, URL.createObjectURL(item.file));
      } catch {
        /* skip files that cannot produce a URL */
      }
    }
    pageUrlsRef.current = map;
    // force re-render so <img> picks up the new URLs
    setBrokenIds((prev) => ({ ...prev }));
    return () => {
      map.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* ignore */
        }
      });
    };
  }, [visibleItems, revokePageUrls]);

  const handleImgError = useCallback((id: string) => {
    setBrokenIds((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
  }, []);

  const displayReport = report || makeEmptyReport();
  const diagnosticRows = diagnostics ? [
    ['userAgent', diagnostics.userAgent],
    ['isSecureContext', String(diagnostics.isSecureContext)],
    ['hasShowDirectoryPicker', String(diagnostics.hasShowDirectoryPicker)],
    ['inputHasWebkitDirectory', String(diagnostics.inputHasWebkitDirectory)],
    ['fileCountAfterSelect', String(diagnostics.fileCountAfterSelect)],
    ['firstFileName', diagnostics.firstFileName || '-'],
    ['firstFileRelativePath', diagnostics.firstFileRelativePath || '-'],
    ['href', diagnostics.href],
  ] : [];

  return (
    <div className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden text-sm">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl"><FolderInput size={18} /></div>
          <div>
            <h2 className="font-bold text-slate-900 text-lg">本地文件夹读取测试</h2>
            <p className="text-[11px] text-slate-500 font-semibold">默认使用 webkitdirectory multiple 读取真实本地文件夹</p>
            {SHOW_FILE_IMPORT_DEBUG && <p className="text-[10px] text-indigo-600 font-black">{FILE_IMPORT_DEBUG_VERSION}</p>}
          </div>
        </div>
        <div className="hidden sm:block text-[11px] text-slate-400 font-semibold">{displayReport.mode}</div>
      </div>

      <div className="p-5 space-y-5">
        <section className="grid grid-cols-2 lg:grid-cols-5 gap-2">
          <button
            type="button"
            onClick={() => directoryInputRef.current?.click()}
            className="flex items-center justify-center gap-2 p-3 bg-white border border-slate-200 rounded-xl text-slate-600 hover:border-indigo-300 hover:text-indigo-700 hover:shadow-sm transition-all"
          >
            <FolderInput size={15} />
            <span className="text-xs font-bold">选择文件夹</span>
          </button>
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            className="flex items-center justify-center gap-2 p-3 bg-white border border-slate-200 rounded-xl text-slate-600 hover:border-indigo-300 hover:text-indigo-700 hover:shadow-sm transition-all"
          >
            <Upload size={15} />
            <span className="text-xs font-bold">选择图片</span>
          </button>
          <button
            type="button"
            onClick={clearImages}
            className="flex items-center justify-center gap-2 p-3 bg-white border border-slate-200 rounded-xl text-slate-600 hover:border-rose-300 hover:text-rose-600 hover:shadow-sm transition-all"
          >
            <Trash2 size={15} />
            <span className="text-xs font-bold">清空列表</span>
          </button>
          <button
            type="button"
            onClick={handleAdvancedDirectoryPick}
            disabled={isReadingAdvanced || isReading}
            className="flex items-center justify-center gap-2 p-3 bg-white border border-slate-200 rounded-xl text-slate-500 hover:border-slate-300 hover:text-slate-700 hover:shadow-sm transition-all disabled:opacity-50"
          >
            {isReadingAdvanced ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
            <span className="text-xs font-bold">高级选择文件夹</span>
          </button>
          <input ref={imageInputRef} type="file" multiple accept={acceptedImageTypes} style={{ display: 'none' }} onChange={handleImageInputChange} />
          <input
            ref={directoryInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={handleDirectoryInputChange}
            {...{ webkitdirectory: '' }}
          />
        </section>

        {SHOW_FILE_IMPORT_DEBUG && <section className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-black text-indigo-700">原生文件夹输入诊断</div>
              <div className="text-[10px] font-bold text-indigo-500">{FILE_IMPORT_DEBUG_VERSION}</div>
            </div>
            <button
              type="button"
              onClick={handleCopyDebug}
              disabled={!nativeDebug}
              className="rounded-lg bg-white border border-indigo-200 px-3 py-1.5 text-[11px] font-bold text-indigo-700 hover:border-indigo-300 disabled:opacity-50"
            >
              复制诊断信息
            </button>
          </div>
          {copyStatus && <div className="text-[11px] font-semibold text-indigo-700">{copyStatus}</div>}
          <pre className="max-h-80 overflow-auto rounded-lg bg-white border border-indigo-100 p-3 text-[11px] leading-relaxed text-slate-700 whitespace-pre-wrap break-all">
            {JSON.stringify(nativeDebug || createInitialNativeFolderInputDebug('folder-read', directoryInputRef.current), null, 2)}
          </pre>
        </section>}

        <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 text-center">
          {[
            ['读取方式', displayReport.mode],
            ['根文件夹', displayReport.rootName],
            ['已读取照片', displayReport.imageCount],
            ['系统文件已忽略', displayReport.systemSkippedCount],
            ['不支持格式', displayReport.unsupportedCount],
            ['坏图已忽略', displayReport.invalidImageCount],
            ['超限跳过', displayReport.limitSkippedCount],
            ['错误', displayReport.errorCount],
          ].map(([label, value]) => (
            <div key={label} className="bg-slate-50 rounded-xl border border-slate-100 p-2 min-w-0">
              <div className="text-sm font-black text-slate-700 truncate">{value}</div>
              <div className="text-[10px] text-slate-400">{label}</div>
            </div>
          ))}
        </section>

        <section className="rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-2">
          <div className="text-xs font-bold text-slate-500">诊断信息</div>
          <div className="text-[11px] text-slate-500">原始文件：{displayReport.rawFileCount}；最终可处理照片：{displayReport.imageCount}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
            {diagnosticRows.map(([key, value]) => (
              <div key={key} className="rounded-lg bg-white border border-slate-100 px-2 py-1.5 text-[11px]">
                <span className="font-bold text-slate-500">{key}: </span>
                <span className="break-all text-slate-600">{value}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-2">
          <div className="text-xs font-bold text-slate-500">前 20 个 relativePath</div>
          {displayReport.firstRelativePaths.length ? (
            <div className="max-h-40 overflow-auto rounded-lg bg-white border border-slate-100 p-2 space-y-1">
              {displayReport.firstRelativePaths.map((path) => (
                <div key={path} className="break-all text-[11px] font-semibold text-indigo-700">{path}</div>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-slate-400">暂无 relativePath</div>
          )}
        </section>

        {error && (
          <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-2">
            {error}
          </div>
        )}
        {displayReport.errors.slice(0, 20).map((entryError) => (
          <div key={entryError} className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2">
            {entryError}
          </div>
        ))}

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">图片清单</h4>
              <p className="text-[11px] text-slate-400 mt-1">
                已读取 {items.length} 张，当前显示 {visibleItems.length} 张{items.length > pageSize ? `，第 ${clampedPage} / ${pageCount} 页` : ''}
              </p>
            </div>
            {items.length > pageSize && (
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={clampedPage <= 1} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 disabled:opacity-40">
                  上一页
                </button>
                <button type="button" onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))} disabled={clampedPage >= pageCount} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 disabled:opacity-40">
                  下一页
                </button>
              </div>
            )}
          </div>

          {visibleItems.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {visibleItems.map((item) => {
                const previewUrl = pageUrlsRef.current.get(item.id);
                const isBroken = brokenIds[item.id];
                return (
                <div key={item.id} className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50 p-2 min-w-0">
                  <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-white border border-slate-100">
                    {previewUrl && !isBroken ? (
                      <img
                        src={previewUrl}
                        alt={item.relativePath}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        onError={() => handleImgError(item.id)}
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-slate-300" title={isBroken ? '预览加载失败' : undefined}>
                        <ImageIcon size={18} />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-black text-slate-700">{item.name}</div>
                    <div className="mt-1 break-all text-[11px] font-semibold text-indigo-700">{item.relativePath}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-slate-400">
                      <span>{formatFileSize(item.size)}</span>
                      <span>{item.type || 'unknown'}</span>
                      <span>{item.directoryPath || '根目录'}</span>
                      {isBroken && <span className="text-rose-500 font-bold">预览失败</span>}
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          ) : (
            <div className="h-40 rounded-xl bg-slate-50 border border-dashed border-slate-300 flex flex-col items-center justify-center gap-2 text-xs font-semibold text-slate-400">
              <RotateCcw size={18} />
              <span>选择文件夹后显示完整图片列表</span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
