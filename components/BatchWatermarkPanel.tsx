import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eraser,
  FileArchive,
  FolderInput,
  FolderOutput,
  Image as ImageIcon,
  Loader2,
  Play,
  ShieldCheck,
  Stamp,
  Trash2,
  Type,
  Upload,
} from 'lucide-react';
import {
  BatchImageEntry,
  BatchWatermarkType,
  DirectoryHandleLike,
  LoadedCanvasImage,
  createZipBuilder,
  DEFAULT_MAX_BATCH_IMAGES,
  downloadBlob,
  ensureDirectory,
  getEntryFile,
  loadCanvasImage,
  makeOutputRelativePath,
  makeUniqueZipPath,
  pickDirectory,
  renderWatermarkedImage,
  waitForBrowser,
  writeBlobToDirectory,
} from '../utils/batchWatermark';
import {
  ImageFileItem,
  LocalImageReadProgress,
  LocalImageReadStats,
  canUseFileSystemAccessDirectory,
  pickSourceDirectory,
  readImagesFromDirectoryHandle,
  readImagesFromFileList,
  revokeImageFileItemUrls,
} from '../utils/localImageFiles';
import {
  FILE_IMPORT_DEBUG_VERSION,
  NativeFolderInputDebug,
  copyNativeFolderInputDebug,
  createInitialNativeFolderInputDebug,
  createNativeFolderInputDebug,
} from '../utils/nativeFolderInputDebug';
import {
  SavedWatermark,
  dataUrlToFile,
  deleteSavedWatermark,
  fileToDataUrl,
  loadSavedWatermarks,
  saveWatermark,
} from '../utils/watermarkLibrary';

type ProcessStatus = {
  total: number;
  processed: number;
  success: number;
  failed: number;
  skipped: number;
  currentFile: string;
  errors: string[];
  warnings: string[];
  outputMode: 'directory' | 'zip' | '';
  zipDownloaded: boolean;
  cancelled: boolean;
};

type OutputSummary = {
  success: number;
  failed: number;
  skipped: number;
  outputMode: 'directory' | 'zip';
  outputLocation: string;
  outputFolderName: string;
  copied: boolean;
};

const emptyStatus: ProcessStatus = {
  total: 0,
  processed: 0,
  success: 0,
  failed: 0,
  skipped: 0,
  currentFile: '',
  errors: [],
  warnings: [],
  outputMode: '',
  zipDownloaded: false,
  cancelled: false,
};

const acceptedImageTypes = 'image/jpeg,image/png,image/webp';
const acceptedImageExtensions = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';
const maxZipFallbackImages = 200;
const maxStatusErrors = 60;

const emptyReadStats: LocalImageReadStats = {
  sourceName: '未选择',
  method: 'files',
  totalFiles: 0,
  imageCount: 0,
  skippedCount: 0,
  systemSkippedCount: 0,
  invalidImageCount: 0,
  decodeFailedCount: 0,
  limitSkippedCount: 0,
  unsupportedCount: 0,
  folderCount: 0,
  errorCount: 0,
  durationMs: 0,
  warnings: [],
  errors: [],
  firstSystemSkippedPaths: [],
  firstSkippedReasons: [],
  firstDecodeFailedPaths: [],
};

const getReadMethodLabel = (method: LocalImageReadStats['method']) => {
  if (method === 'showDirectoryPicker') return 'showDirectoryPicker';
  if (method === 'webkitdirectory') return 'webkitdirectory';
  return '选择图片';
};

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const getErrorMessage = (error: unknown) => {
  if (error instanceof DOMException && error.name === 'AbortError') return '任务已取消';
  if (error instanceof Error) return error.message;
  return '未知错误';
};

const getSkippedBreakdown = (stats: LocalImageReadStats) => {
  const badImageCount = Math.max(stats.invalidImageCount, stats.decodeFailedCount);
  const knownSkipped = stats.systemSkippedCount + stats.unsupportedCount + badImageCount + stats.limitSkippedCount;
  const otherSkipped = Math.max(0, stats.skippedCount - knownSkipped);
  return { badImageCount, otherSkipped };
};

const getSkippedSummary = (stats: LocalImageReadStats) => {
  if (!stats.skippedCount) return '';

  const { badImageCount, otherSkipped } = getSkippedBreakdown(stats);
  const parts = [
    stats.systemSkippedCount ? `系统文件 ${stats.systemSkippedCount} 个` : '',
    stats.unsupportedCount ? `不支持格式 ${stats.unsupportedCount} 个` : '',
    badImageCount ? `坏图 ${badImageCount} 个` : '',
    stats.limitSkippedCount ? `超出上限 ${stats.limitSkippedCount} 个` : '',
    otherSkipped ? `其他 ${otherSkipped} 个` : '',
  ].filter(Boolean);

  return parts.length
    ? `已跳过 ${stats.skippedCount} 个文件：${parts.join('，')}`
    : `已跳过 ${stats.skippedCount} 个文件`;
};

const stopEvent = (event: React.PointerEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

const stopDragEvent = (event: React.DragEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

export const BatchWatermarkPanel: React.FC = () => {
  const [entries, setEntries] = useState<BatchImageEntry[]>([]);
  const [selectedSkipped, setSelectedSkipped] = useState(0);
  const [sourceRootName, setSourceRootName] = useState('批量图片');
  const [sourceLabel, setSourceLabel] = useState('尚未选择图片');
  const [readStats, setReadStats] = useState<LocalImageReadStats>(emptyReadStats);
  const [readProgress, setReadProgress] = useState<LocalImageReadProgress | null>(null);

  const [watermarkType, setWatermarkType] = useState<BatchWatermarkType>('image');
  const [textConfig, setTextConfig] = useState({
    text: 'ImageHub',
    fontSize: 42,
    color: '#ffffff',
    opacity: 0.88,
    shadow: true,
    outline: false,
  });
  const [imageConfig, setImageConfig] = useState({
    opacity: 0.85,
    scalePercent: 18,
  });
  const [watermarkFile, setWatermarkFile] = useState<File | null>(null);
  const [watermarkImageUrl, setWatermarkImageUrl] = useState('');
  const [savedWatermarks, setSavedWatermarks] = useState<SavedWatermark[]>([]);
  const [watermarkLibraryStatus, setWatermarkLibraryStatus] = useState('');
  const [activeSavedWatermarkId, setActiveSavedWatermarkId] = useState('');
  const [position, setPosition] = useState({ x: 0.85, y: 0.9 });

  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewImageUrl, setPreviewImageUrl] = useState('');
  const [previewWidth, setPreviewWidth] = useState(0);
  const [previewLoadRequested, setPreviewLoadRequested] = useState(false);
  const [previewReloadKey, setPreviewReloadKey] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const [outputDirectory, setOutputDirectory] = useState<DirectoryHandleLike | null>(null);
  const [outputDirectoryName, setOutputDirectoryName] = useState('');
  const [outputRootName, setOutputRootName] = useState('批量图片水印');
  const [outputRootTouched, setOutputRootTouched] = useState(false);
  const [fileSuffix, setFileSuffix] = useState('_水印');
  const [suffixSubfolders, setSuffixSubfolders] = useState(false);
  const [status, setStatus] = useState<ProcessStatus>(emptyStatus);
  const [outputSummary, setOutputSummary] = useState<OutputSummary | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReadingFolder, setIsReadingFolder] = useState(false);
  const [isReadingAdvancedFolder, setIsReadingAdvancedFolder] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [nativeDebug, setNativeDebug] = useState<NativeFolderInputDebug | null>(null);
  const [debugCopyStatus, setDebugCopyStatus] = useState('');
  const [showNativeDebugJson, setShowNativeDebugJson] = useState(false);
  const [showReadStatsDetails, setShowReadStatsDetails] = useState(false);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const watermarkInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const previewOverlayRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const scanAbortControllerRef = useRef<AbortController | null>(null);
  const imageItemsRef = useRef<ImageFileItem[]>([]);
  const previewObjectUrlRef = useRef('');
  const activeDragPointerRef = useRef<number | null>(null);
  const dragPositionRef = useRef(position);
  const dragFrameRef = useRef<number | null>(null);

  const hasFileSystemAccess = canUseFileSystemAccessDirectory();
  const currentPreviewEntry = entries[Math.min(previewIndex, Math.max(entries.length - 1, 0))];
  const progressPercent = status.total ? Math.round((status.processed / status.total) * 100) : 0;
  const shouldShowNativeDebugPanel = status.errors.length > 0 || readStats.errorCount > 0;

  const revokePreviewObjectUrl = useCallback(() => {
    if (!previewObjectUrlRef.current) return;
    URL.revokeObjectURL(previewObjectUrlRef.current);
    previewObjectUrlRef.current = '';
  }, []);

  const clearPreviewDisplay = useCallback(() => {
    revokePreviewObjectUrl();
    setPreviewImageUrl('');
    setPreviewWidth(0);
    setPreviewLoading(false);
    setPreviewError('');
  }, [revokePreviewObjectUrl]);

  const requestPreviewLoad = useCallback(() => {
    setPreviewLoadRequested(true);
    setPreviewReloadKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!outputRootTouched) {
      setOutputRootName(`${sourceRootName}水印`);
    }
  }, [outputRootTouched, sourceRootName]);

  useEffect(() => {
    const folderInput = folderInputRef.current as (HTMLInputElement & { webkitdirectory?: boolean; directory?: boolean }) | null;
    if (!folderInput) return;
    folderInput.webkitdirectory = true;
    folderInput.directory = true;
    folderInput.setAttribute('webkitdirectory', '');
    setNativeDebug(createInitialNativeFolderInputDebug('batch-watermark', folderInput));
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadSavedWatermarks()
      .then((items) => {
        if (!cancelled) setSavedWatermarks(items);
      })
      .catch((error) => {
        if (!cancelled) setWatermarkLibraryStatus(`常用水印库读取失败：${getErrorMessage(error)}`);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (previewIndex > entries.length - 1) {
      setPreviewIndex(0);
    }
  }, [entries.length, previewIndex]);

  useEffect(() => {
    dragPositionRef.current = position;
  }, [position]);

  useEffect(() => {
    return () => {
      if (dragFrameRef.current !== null) {
        window.cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!currentPreviewEntry) {
      clearPreviewDisplay();
      return;
    }

    if (!previewLoadRequested) {
      clearPreviewDisplay();
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    revokePreviewObjectUrl();
    setPreviewImageUrl('');
    setPreviewWidth(0);
    setPreviewError('');
    setPreviewLoading(true);

    const loadPreview = async () => {
      let nextUrl = '';

      try {
        const file = await getEntryFile(currentPreviewEntry, controller.signal);
        nextUrl = URL.createObjectURL(file);

        const img = new Image();
        img.decoding = 'async';
        img.src = nextUrl;
        await img.decode();
        if (controller.signal.aborted) throw new DOMException('任务已取消', 'AbortError');

        if (cancelled) {
          if (nextUrl) URL.revokeObjectURL(nextUrl);
          return;
        }

        previewObjectUrlRef.current = nextUrl;
        setPreviewImageUrl(nextUrl);
      } catch (error) {
        if (cancelled || (error instanceof DOMException && error.name === 'AbortError')) return;
        if (nextUrl) {
          URL.revokeObjectURL(nextUrl);
          nextUrl = '';
        }
        setPreviewImageUrl('');
        setPreviewError(`示例图预览失败：${getErrorMessage(error)}`);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    };

    void loadPreview();

    return () => {
      cancelled = true;
      controller.abort();
      revokePreviewObjectUrl();
    };
  }, [
    clearPreviewDisplay,
    currentPreviewEntry,
    previewLoadRequested,
    previewReloadKey,
    revokePreviewObjectUrl,
  ]);

  useEffect(() => {
    if (!previewRef.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setPreviewWidth(width);
    });
    observer.observe(previewRef.current);
    return () => observer.disconnect();
  }, [previewImageUrl]);

  useEffect(() => {
    return () => {
      if (watermarkImageUrl) URL.revokeObjectURL(watermarkImageUrl);
      revokePreviewObjectUrl();
      abortControllerRef.current?.abort();
      scanAbortControllerRef.current?.abort();
      revokeImageFileItemUrls(imageItemsRef.current);
    };
  }, [revokePreviewObjectUrl, watermarkImageUrl]);

  const clearSelectedImages = useCallback(() => {
    scanAbortControllerRef.current?.abort();
    revokeImageFileItemUrls(imageItemsRef.current);
    imageItemsRef.current = [];
    setEntries([]);
    setSelectedSkipped(0);
    setSourceRootName('批量图片');
    setSourceLabel('尚未选择图片');
    setPreviewIndex(0);
    setPreviewLoadRequested(false);
    clearPreviewDisplay();
    setReadStats(emptyReadStats);
    setReadProgress(null);
    setStatus(emptyStatus);
    setDebugCopyStatus('');
    setShowNativeDebugJson(false);
  }, [clearPreviewDisplay]);

  const applyImageReadResult = useCallback((items: ImageFileItem[], stats: LocalImageReadStats) => {
    revokeImageFileItemUrls(imageItemsRef.current);
    imageItemsRef.current = items;
    const limited = items.length > DEFAULT_MAX_BATCH_IMAGES;
    const importedItems = items.slice(0, DEFAULT_MAX_BATCH_IMAGES);
    const nextEntries: BatchImageEntry[] = importedItems.map((item) => ({
      id: item.id,
      file: item.file,
      name: item.name,
      relativePath: item.relativePath,
      directoryPath: item.directoryPath ? item.directoryPath.split('/').filter(Boolean) : [],
    }));

    setEntries(nextEntries);
    setSelectedSkipped(stats.skippedCount);
    setSourceRootName(stats.sourceName || '批量图片');
    setSourceLabel(stats.method === 'files' ? `已选择 ${nextEntries.length} 张照片` : `已读取文件夹：${stats.sourceName}（${nextEntries.length} 张照片）`);
    setPreviewIndex(0);
    setPreviewLoadRequested(nextEntries.length > 0);
    setPreviewReloadKey((prev) => prev + 1);
    setReadStats(stats);
    setReadProgress(null);
    setStatus({
      ...emptyStatus,
      skipped: stats.skippedCount,
      warnings: [
        getSkippedSummary(stats),
        limited ? `已读取 ${items.length} 张，当前导入前 ${DEFAULT_MAX_BATCH_IMAGES} 张` : '',
        ...stats.warnings,
      ].filter(Boolean),
      errors: stats.errors.slice(0, maxStatusErrors),
    });

    return nextEntries;
  }, []);

  const handleImageInput = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.currentTarget.files;
    if (!files) return;
    const stableFiles = Array.from(files as ArrayLike<File>);
    event.currentTarget.value = '';
    void (async () => {
      clearSelectedImages();
      const result = await readImagesFromFileList(stableFiles, 'files', { createObjectUrls: false });
      if (!result.items.length) {
        setNativeDebug(createNativeFolderInputDebug('batch-watermark', folderInputRef.current, stableFiles, result, 0, null));
        setReadStats(result.stats);
        setSelectedSkipped(result.stats.skippedCount);
        setSourceLabel('未读取到支持的图片');
        setStatus({
          ...emptyStatus,
          skipped: result.stats.skippedCount,
          errors: ['该文件夹中没有读取到支持的图片，请确认格式为 jpg/jpeg/png/webp，或查看浏览器权限。', ...result.stats.errors.slice(0, maxStatusErrors)],
        });
        return;
      }
      const nextEntries = applyImageReadResult(result.items, result.stats);
      setNativeDebug(createNativeFolderInputDebug(
        'batch-watermark',
        folderInputRef.current,
        stableFiles,
        result,
        nextEntries.length,
        nextEntries[0]?.name || null
      ));
    })().catch((error) => {
      clearSelectedImages();
      setStatus((prev) => ({ ...prev, errors: [`选择图片失败：${getErrorMessage(error)}`] }));
    });
  }, [applyImageReadResult, clearSelectedImages]);

  const handleFallbackFolderInput = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.currentTarget.files;
    if (!files) return;
    const stableFiles = Array.from(files as ArrayLike<File>);
    event.currentTarget.value = '';
    void (async () => {
      clearSelectedImages();
      setIsReadingFolder(true);
      setSourceLabel('正在读取文件夹...');
      const result = await readImagesFromFileList(stableFiles, 'webkitdirectory', { createObjectUrls: false });
      if (!result.items.length) {
        setNativeDebug(createNativeFolderInputDebug('batch-watermark', folderInputRef.current, stableFiles, result, 0, null));
        setReadStats(result.stats);
        setSelectedSkipped(result.stats.skippedCount);
        setSourceLabel('未读取到支持的图片');
        setStatus({
          ...emptyStatus,
          skipped: result.stats.skippedCount,
          errors: ['该文件夹中没有读取到支持的图片，请确认格式为 jpg/jpeg/png/webp，或查看浏览器权限。', ...result.stats.errors.slice(0, maxStatusErrors)],
        });
        return;
      }
      const nextEntries = applyImageReadResult(result.items, result.stats);
      setNativeDebug(createNativeFolderInputDebug(
        'batch-watermark',
        folderInputRef.current,
        stableFiles,
        result,
        nextEntries.length,
        nextEntries[0]?.name || null
      ));
    })().catch((error) => {
      clearSelectedImages();
      setNativeDebug(createNativeFolderInputDebug('batch-watermark', folderInputRef.current, stableFiles, null, 0, null));
      setStatus((prev) => ({ ...prev, errors: [`选择文件夹失败：${getErrorMessage(error)}`] }));
    }).finally(() => {
      setIsReadingFolder(false);
    });
  }, [applyImageReadResult, clearSelectedImages]);

  const handlePickSourceFolder = useCallback(async () => {
    folderInputRef.current?.click();
  }, []);

  const handleCopyDebug = useCallback(async () => {
    if (!nativeDebug) return;
    try {
      await copyNativeFolderInputDebug(nativeDebug);
      setDebugCopyStatus('已复制');
    } catch (copyError) {
      setDebugCopyStatus(`复制失败：${getErrorMessage(copyError)}`);
    }
  }, [nativeDebug]);

  const handleAdvancedPickSourceFolder = useCallback(async () => {
    if (!hasFileSystemAccess) {
      setStatus((prev) => ({
        ...prev,
        errors: [...prev.errors, '当前浏览器不支持 showDirectoryPicker，请使用默认“选择文件夹”。'],
      }));
      return;
    }
    try {
      setIsReadingAdvancedFolder(true);
      clearSelectedImages();
      setSourceLabel('正在等待选择文件夹...');

      const directory = await pickSourceDirectory();
      const controller = new AbortController();
      scanAbortControllerRef.current = controller;

      setSourceRootName(directory.name || '批量图片');
      setSourceLabel('正在扫描文件夹...');

      const result = await readImagesFromDirectoryHandle(directory, {
        signal: controller.signal,
        createObjectUrls: false,
        onProgress: (progress) => {
          setReadProgress(progress);
          setSelectedSkipped(progress.skippedCount);
          setSourceLabel(`扫描中：${progress.imageCount} 张照片 / ${progress.skippedCount} 个跳过 / ${progress.totalFiles} 个文件 / ${progress.folderCount} 个文件夹`);
        },
      });

      if (!result.items.length) {
        setReadStats(result.stats);
        setSelectedSkipped(result.stats.skippedCount);
        setSourceLabel('未读取到支持的图片');
        setStatus({
          ...emptyStatus,
          skipped: result.stats.skippedCount,
          errors: ['该文件夹中没有读取到支持的图片，请确认格式为 jpg/jpeg/png/webp，或查看浏览器权限。', ...result.stats.errors],
        });
        return;
      }

      applyImageReadResult(result.items, result.stats);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setSourceLabel('已取消读取');
        return;
      }
      clearSelectedImages();
      setStatus((prev) => ({ ...prev, errors: [`选择文件夹失败：${getErrorMessage(error)}`] }));
    } finally {
      scanAbortControllerRef.current = null;
      setIsReadingAdvancedFolder(false);
    }
  }, [applyImageReadResult, clearSelectedImages, hasFileSystemAccess]);

  const cancelFolderScan = useCallback(() => {
    scanAbortControllerRef.current?.abort();
    setIsReadingFolder(false);
    setSourceLabel('正在停止扫描...');
  }, []);

  const handlePickOutputFolder = useCallback(async () => {
    try {
      const directory = await pickDirectory('readwrite');
      setOutputDirectory(directory);
      setOutputDirectoryName(directory.name);
      setStatus((prev) => ({
        ...prev,
        warnings: prev.warnings.filter((warning) => !warning.includes('未选择输出文件夹')),
      }));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setStatus((prev) => ({ ...prev, errors: [`选择输出文件夹失败：${getErrorMessage(error)}`] }));
    }
  }, []);

  const handleWatermarkImageInput = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file) return;

    if (watermarkImageUrl) URL.revokeObjectURL(watermarkImageUrl);
    setWatermarkFile(file);
    setWatermarkImageUrl(URL.createObjectURL(file));
    setActiveSavedWatermarkId('');
    setWatermarkLibraryStatus('');
    setWatermarkType('image');
  }, [watermarkImageUrl]);

  const saveCurrentWatermarkToLibrary = useCallback(async () => {
    if (!watermarkFile) {
      setWatermarkLibraryStatus('请先上传一张水印图片');
      return;
    }

    try {
      const promptedName = window.prompt('给这个常用水印命名', watermarkFile.name);
      if (promptedName === null) {
        setWatermarkLibraryStatus('已取消保存常用水印');
        return;
      }
      const name = promptedName.trim() || watermarkFile.name;
      const dataUrl = await fileToDataUrl(watermarkFile);
      const item: SavedWatermark = {
        id: `watermark-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name,
        mimeType: watermarkFile.type || 'image/png',
        dataUrl,
        createdAt: new Date().toISOString(),
        size: watermarkFile.size,
      };

      await saveWatermark(item);
      setSavedWatermarks((prev) => [item, ...prev.filter((saved) => saved.id !== item.id)]);
      setActiveSavedWatermarkId(item.id);
      setWatermarkLibraryStatus(`已保存到常用水印：${name}`);
    } catch (error) {
      setWatermarkLibraryStatus(`保存常用水印失败：${getErrorMessage(error)}`);
    }
  }, [watermarkFile]);

  const applySavedWatermark = useCallback(async (item: SavedWatermark) => {
    try {
      const file = await dataUrlToFile(item.dataUrl, item.name, item.mimeType);
      if (watermarkImageUrl) URL.revokeObjectURL(watermarkImageUrl);
      setWatermarkFile(file);
      setWatermarkImageUrl(URL.createObjectURL(file));
      setActiveSavedWatermarkId(item.id);
      setWatermarkType('image');
      setWatermarkLibraryStatus(`已应用常用水印：${item.name}`);
      requestPreviewLoad();
    } catch (error) {
      setWatermarkLibraryStatus(`应用常用水印失败：${getErrorMessage(error)}`);
    }
  }, [requestPreviewLoad, watermarkImageUrl]);

  const removeSavedWatermark = useCallback(async (item: SavedWatermark) => {
    if (!window.confirm(`删除常用水印“${item.name}”？`)) return;

    try {
      await deleteSavedWatermark(item.id);
      setSavedWatermarks((prev) => prev.filter((saved) => saved.id !== item.id));
      if (activeSavedWatermarkId === item.id) {
        setActiveSavedWatermarkId('');
        setWatermarkLibraryStatus(`已删除“${item.name}”。当前水印仍保留在本次任务中。`);
      } else {
        setWatermarkLibraryStatus(`已删除常用水印：${item.name}`);
      }
    } catch (error) {
      setWatermarkLibraryStatus(`删除常用水印失败：${getErrorMessage(error)}`);
    }
  }, [activeSavedWatermarkId]);

  const getPositionFromPointer = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height),
    };
  }, []);

  const movePreviewOverlay = useCallback((nextPosition: { x: number; y: number }) => {
    dragPositionRef.current = nextPosition;
    if (dragFrameRef.current !== null) return;

    dragFrameRef.current = window.requestAnimationFrame(() => {
      dragFrameRef.current = null;
      const overlay = previewOverlayRef.current;
      if (!overlay) return;
      const { x, y } = dragPositionRef.current;
      overlay.style.left = `${x * 100}%`;
      overlay.style.top = `${y * 100}%`;
    });
  }, []);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    stopEvent(event);
    const nextPosition = getPositionFromPointer(event);
    if (!nextPosition) return;
    activeDragPointerRef.current = event.pointerId;
    movePreviewOverlay(nextPosition);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [getPositionFromPointer, movePreviewOverlay]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (activeDragPointerRef.current !== event.pointerId || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    stopEvent(event);
    const nextPosition = getPositionFromPointer(event);
    if (nextPosition) movePreviewOverlay(nextPosition);
  }, [getPositionFromPointer, movePreviewOverlay]);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    stopEvent(event);
    if (activeDragPointerRef.current === event.pointerId) {
      activeDragPointerRef.current = null;
      setPosition(dragPositionRef.current);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const resetAll = useCallback(() => {
    abortControllerRef.current?.abort();
    clearSelectedImages();
    setOutputDirectory(null);
    setOutputDirectoryName('');
    setOutputRootTouched(false);
    setFileSuffix('_水印');
    setSuffixSubfolders(false);
    setPosition({ x: 0.85, y: 0.9 });
    setPreviewLoadRequested(false);
    setPreviewReloadKey((prev) => prev + 1);
  }, [clearSelectedImages]);

  const cancelProcessing = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const copyOutputLocation = useCallback(async () => {
    if (!outputSummary) return;

    try {
      await navigator.clipboard.writeText(outputSummary.outputLocation);
      setOutputSummary((prev) => prev ? { ...prev, copied: true } : prev);
    } catch (error) {
      setStatus((prev) => ({
        ...prev,
        warnings: [...prev.warnings, `复制输出位置失败：${getErrorMessage(error)}`],
      }));
    }
  }, [outputSummary]);

  const startProcessing = useCallback(async () => {
    if (!entries.length) {
      setStatus((prev) => ({ ...prev, errors: ['请先选择要加水印的图片或文件夹'] }));
      return;
    }

    if (watermarkType === 'text' && !textConfig.text.trim()) {
      setStatus((prev) => ({ ...prev, errors: ['请先输入文字水印内容'] }));
      return;
    }

    if (watermarkType === 'image' && !watermarkFile) {
      setStatus((prev) => ({ ...prev, errors: ['请先上传 logo、二维码或 PNG 水印图片'] }));
      return;
    }

    const useDirectoryOutput = Boolean(outputDirectory && hasFileSystemAccess);
    if (!useDirectoryOutput && entries.length > maxZipFallbackImages) {
      setStatus((prev) => ({
        ...prev,
        errors: [`当前选择了 ${entries.length} 张图片。为避免浏览器内存崩溃，超过 ${maxZipFallbackImages} 张时请先选择输出文件夹，不使用 ZIP fallback。`],
      }));
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setOutputSummary(null);
    setIsProcessing(true);
    setShowErrors(false);

    const initialWarnings = [
      getSkippedSummary(readStats),
      useDirectoryOutput ? '' : '未选择可写输出文件夹，已使用 ZIP fallback 导出',
    ].filter(Boolean) as string[];

    setStatus({
      ...emptyStatus,
      total: entries.length,
      skipped: selectedSkipped,
      outputMode: useDirectoryOutput ? 'directory' : 'zip',
      warnings: initialWarnings,
    });

    let loadedWatermarkImage: LoadedCanvasImage | undefined;
    let completedSuccess = 0;
    let completedFailed = 0;

    try {
      if (watermarkType === 'image' && watermarkFile) {
        loadedWatermarkImage = await loadCanvasImage(watermarkFile);
      }

      const outputOptions = { fileSuffix, suffixSubfolders, preserveStructure: true };
      const renderConfig = {
        type: watermarkType,
        position,
        referenceWidth: 1000,
        text: textConfig,
        image: imageConfig,
      };

      const rootName = outputRootName.trim() || `${sourceRootName}水印`;
      const zipBuilder = useDirectoryOutput ? null : createZipBuilder();
      const zipPaths = new Set<string>();
      const directoryRoot = useDirectoryOutput && outputDirectory
        ? await ensureDirectory(outputDirectory, [rootName])
        : null;

      for (const entry of entries) {
        if (controller.signal.aborted) throw new DOMException('任务已取消', 'AbortError');
        setStatus((prev) => ({ ...prev, currentFile: entry.relativePath || entry.name }));

        try {
          const sourceFile = await getEntryFile(entry, controller.signal);
          const result = await renderWatermarkedImage(sourceFile, renderConfig, loadedWatermarkImage, controller.signal);
          const relativePath = makeOutputRelativePath(entry, result.extension, outputOptions);

          if (directoryRoot) {
            await writeBlobToDirectory(directoryRoot, relativePath, result.blob);
          } else if (zipBuilder) {
            const zipPath = makeUniqueZipPath(`${rootName}/${relativePath}`, zipPaths);
            await zipBuilder.addFile(zipPath, result.blob);
          }

          completedSuccess += 1;
          setStatus((prev) => ({
            ...prev,
            processed: prev.processed + 1,
            success: prev.success + 1,
            warnings: result.warning ? [...prev.warnings, result.warning] : prev.warnings,
          }));
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') throw error;
          completedFailed += 1;
          setStatus((prev) => ({
            ...prev,
            processed: prev.processed + 1,
            failed: prev.failed + 1,
            errors: [...prev.errors, `${entry.relativePath || entry.name}：${getErrorMessage(error)}`],
          }));
        }

        await waitForBrowser();
      }

      if (zipBuilder) {
        const zipBlob = zipBuilder.toBlob();
        downloadBlob(zipBlob, `${rootName}.zip`);
        setOutputSummary({
          success: completedSuccess,
          failed: completedFailed,
          skipped: selectedSkipped,
          outputMode: 'zip',
          outputLocation: `${rootName}.zip（浏览器下载目录）`,
          outputFolderName: rootName,
          copied: false,
        });
        setStatus((prev) => ({ ...prev, zipDownloaded: true, currentFile: '' }));
      } else {
        setOutputSummary({
          success: completedSuccess,
          failed: completedFailed,
          skipped: selectedSkipped,
          outputMode: 'directory',
          outputLocation: `${outputDirectoryName || '已选择输出文件夹'} / ${rootName}`,
          outputFolderName: rootName,
          copied: false,
        });
        setStatus((prev) => ({ ...prev, currentFile: '' }));
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setStatus((prev) => ({
          ...prev,
          cancelled: true,
          currentFile: '',
          warnings: [...prev.warnings, '任务已取消，已完成的文件会保留'],
        }));
      } else {
        setStatus((prev) => ({
          ...prev,
          currentFile: '',
          errors: [...prev.errors, `批量处理失败：${getErrorMessage(error)}`],
        }));
      }
    } finally {
      loadedWatermarkImage?.close();
      abortControllerRef.current = null;
      setIsProcessing(false);
    }
  }, [
    entries,
    fileSuffix,
    hasFileSystemAccess,
    imageConfig,
    outputDirectory,
    outputRootName,
    position,
    readStats,
    selectedSkipped,
    sourceRootName,
    suffixSubfolders,
    textConfig,
    watermarkFile,
    watermarkType,
  ]);

  const previewFontSize = useMemo(() => {
    return Math.max(12, Math.round((textConfig.fontSize / 1000) * (previewWidth || 560)));
  }, [previewWidth, textConfig.fontSize]);

  const previewTextStyle = useMemo<React.CSSProperties & { WebkitTextStroke?: string }>(() => ({
    color: textConfig.color,
    fontSize: `${previewFontSize}px`,
    opacity: textConfig.opacity,
    lineHeight: 1.1,
    textShadow: textConfig.shadow
      ? '0 2px 10px rgba(15, 23, 42, 0.45), 0 0 1px rgba(255, 255, 255, 0.8)'
      : undefined,
    WebkitTextStroke: textConfig.outline ? '1px rgba(15, 23, 42, 0.7)' : undefined,
  }), [previewFontSize, textConfig.color, textConfig.opacity, textConfig.outline, textConfig.shadow]);

  const previewOptions = useMemo(() => {
    return entries.slice(0, 200).map((entry, index) => ({ entry, index }));
  }, [entries]);

  return (
    <div className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden text-sm">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-violet-100 text-violet-600 rounded-xl"><Stamp size={18} /></div>
          <div>
            <h2 className="font-bold text-slate-900 text-lg">批量水印</h2>
            <p className="text-[11px] text-slate-500 font-semibold">单图批量加文字或图片水印，保留目录结构导出</p>
            <p className="text-[10px] text-violet-600 font-black">{FILE_IMPORT_DEBUG_VERSION}</p>
          </div>
        </div>
        <div className="hidden sm:block text-[11px] text-slate-400 font-semibold">最多读取 {DEFAULT_MAX_BATCH_IMAGES} 张</div>
      </div>

      <div className="p-5 space-y-5">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">输入来源</h4>
            <span className="text-[10px] text-slate-400">{sourceLabel}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={isProcessing || isReadingFolder}
              className="flex items-center justify-center gap-2 p-3 bg-white border border-slate-200 rounded-xl text-slate-600 hover:border-violet-300 hover:text-violet-700 hover:shadow-sm transition-all disabled:opacity-50"
            >
              <Upload size={15} />
              <span className="text-xs font-bold">选择图片</span>
            </button>
            <button
              type="button"
              onClick={handlePickSourceFolder}
              disabled={isProcessing || isReadingFolder}
              className="flex items-center justify-center gap-2 p-3 bg-white border border-slate-200 rounded-xl text-slate-600 hover:border-violet-300 hover:text-violet-700 hover:shadow-sm transition-all disabled:opacity-50"
            >
              {isReadingFolder ? <Loader2 size={15} className="animate-spin" /> : <FolderInput size={15} />}
              <span className="text-xs font-bold">{isReadingFolder ? '读取中' : '选择文件夹'}</span>
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            <span>默认使用 webkitdirectory multiple 读取真实本地文件夹。</span>
            <button
              type="button"
              onClick={handleAdvancedPickSourceFolder}
              disabled={isProcessing || isReadingFolder || isReadingAdvancedFolder}
              className="font-bold text-slate-500 hover:text-violet-600 disabled:opacity-50"
            >
              {isReadingAdvancedFolder ? '高级读取中' : '高级选择文件夹 showDirectoryPicker'}
            </button>
            {isReadingFolder && (
              <button type="button" onClick={cancelFolderScan} className="font-bold text-rose-500 hover:text-rose-600">
                取消读取
              </button>
            )}
          </div>

          <input ref={imageInputRef} type="file" multiple accept={acceptedImageExtensions} className="hidden" onChange={handleImageInput} />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFallbackFolderInput}
            {...{ webkitdirectory: '' }}
          />

          {shouldShowNativeDebugPanel && (
            <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-black text-violet-700">原生文件夹输入诊断</div>
                  <div className="text-[10px] font-bold text-violet-500">{FILE_IMPORT_DEBUG_VERSION}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNativeDebugJson((prev) => !prev)}
                    disabled={!nativeDebug}
                    className="rounded-lg bg-white border border-violet-200 px-3 py-1.5 text-[11px] font-bold text-violet-700 hover:border-violet-300 disabled:opacity-50"
                  >
                    {showNativeDebugJson ? '收起诊断' : '展开诊断'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyDebug}
                    disabled={!nativeDebug}
                    className="rounded-lg bg-white border border-violet-200 px-3 py-1.5 text-[11px] font-bold text-violet-700 hover:border-violet-300 disabled:opacity-50"
                  >
                    复制诊断信息
                  </button>
                </div>
              </div>
              {debugCopyStatus && <div className="text-[11px] font-semibold text-violet-700">{debugCopyStatus}</div>}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                {[
                  ['raw', nativeDebug?.rawFileListLength ?? 0],
                  ['filtered', nativeDebug?.filteredImageCount ?? 0],
                  ['state', nativeDebug?.finalStateImagesLength ?? 0],
                  ['system', nativeDebug?.systemSkippedCount ?? 0],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-white border border-violet-100 px-2 py-1.5">
                    <span className="text-violet-400 font-bold">{label}: </span>
                    <span className="font-black text-slate-700">{value}</span>
                  </div>
                ))}
              </div>
              {showNativeDebugJson && (
                <pre className="max-h-80 overflow-auto rounded-lg bg-white border border-violet-100 p-3 text-[11px] leading-relaxed text-slate-700 whitespace-pre-wrap break-all">
                  {JSON.stringify(nativeDebug || createInitialNativeFolderInputDebug('batch-watermark', folderInputRef.current), null, 2)}
                </pre>
              )}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-slate-50 rounded-xl border border-slate-100 p-2">
              <div className="text-lg font-black text-slate-700">{entries.length}</div>
              <div className="text-[10px] text-slate-400">已读取照片</div>
            </div>
            <div className="bg-slate-50 rounded-xl border border-slate-100 p-2">
              <div className="text-lg font-black text-amber-600">{readStats.systemSkippedCount}</div>
              <div className="text-[10px] text-slate-400">系统文件跳过</div>
            </div>
            <div className="bg-slate-50 rounded-xl border border-slate-100 p-2">
              <div className="text-lg font-black text-violet-600">{readStats.totalFiles}</div>
              <div className="text-[10px] text-slate-400">原始文件</div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowReadStatsDetails((prev) => !prev)}
              className="w-full flex flex-wrap items-center justify-between gap-2 p-3 text-left hover:bg-slate-100/70 transition-colors"
            >
              <div>
                <div className="text-xs font-black text-slate-600">读取明细</div>
                <div className="text-[11px] font-semibold text-slate-400">
                  已读取 {readStats.imageCount} 张 / 跳过 {readStats.skippedCount} 个 / 错误 {readStats.errorCount} 个
                </div>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500">
                {showReadStatsDetails ? '收起' : '展开'}
                {showReadStatsDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </div>
            </button>

            {showReadStatsDetails && (
              <div className="border-t border-slate-100 p-3 space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                  <div><span className="text-slate-400">读取方式：</span><span className="font-bold text-slate-700">{getReadMethodLabel(readStats.method)}</span></div>
                  <div><span className="text-slate-400">根文件夹：</span><span className="font-bold text-slate-700">{readStats.sourceName}</span></div>
                  <div><span className="text-slate-400">原始文件：</span><span className="font-bold text-slate-700">{readStats.totalFiles}</span></div>
                  <div><span className="text-slate-400">已读取照片：</span><span className="font-bold text-slate-700">{readStats.imageCount}</span></div>
                  <div><span className="text-slate-400">跳过总数：</span><span className="font-bold text-slate-700">{readStats.skippedCount}</span></div>
                  <div><span className="text-slate-400">已跳过系统文件：</span><span className="font-bold text-slate-700">{readStats.systemSkippedCount}</span></div>
                  <div><span className="text-slate-400">坏图跳过：</span><span className="font-bold text-slate-700">{getSkippedBreakdown(readStats).badImageCount}</span></div>
                  <div><span className="text-slate-400">不支持格式：</span><span className="font-bold text-slate-700">{readStats.unsupportedCount}</span></div>
                  <div><span className="text-slate-400">超出上限跳过：</span><span className="font-bold text-slate-700">{readStats.limitSkippedCount}</span></div>
                  <div><span className="text-slate-400">错误：</span><span className="font-bold text-slate-700">{readStats.errorCount}</span></div>
                </div>
                {readProgress && (
                  <div className="break-all text-[11px] text-indigo-700">
                    正在扫描：{readProgress.imageCount} 张照片 / {readProgress.systemSkippedCount} 个系统文件跳过 / {readProgress.skippedCount} 个总跳过 / {readProgress.totalFiles} 个文件；当前 {readProgress.currentPath}
                  </div>
                )}
                {entries.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">前 10 个 relativePath</div>
                    <div className="max-h-28 overflow-auto rounded-lg bg-white border border-slate-100 p-2 space-y-1">
                      {entries.slice(0, 10).map((entry) => (
                        <div key={entry.id} className="break-all text-[11px] font-semibold text-slate-600">{entry.relativePath}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">水印类型</h4>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setWatermarkType('text')}
              className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all ${
                watermarkType === 'text' ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-transparent bg-slate-100 text-slate-500'
              }`}
            >
              <Type size={16} />
              <span className="text-xs font-bold">文字水印</span>
            </button>
            <button
              type="button"
              onClick={() => setWatermarkType('image')}
              className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all ${
                watermarkType === 'image' ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-transparent bg-slate-100 text-slate-500'
              }`}
            >
              <ImageIcon size={16} />
              <span className="text-xs font-bold">图片水印</span>
            </button>
          </div>

          {watermarkType === 'text' ? (
            <div className="space-y-3">
              <input
                value={textConfig.text}
                onChange={(event) => setTextConfig((prev) => ({ ...prev, text: event.target.value }))}
                placeholder="输入水印文字"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
              <div className="grid grid-cols-[1fr_auto] gap-3 items-center">
                <label className="text-xs font-medium text-slate-600">字号 {textConfig.fontSize}</label>
                <input
                  type="color"
                  value={textConfig.color}
                  onChange={(event) => setTextConfig((prev) => ({ ...prev, color: event.target.value }))}
                  className="h-8 w-10 rounded-lg border border-slate-200 bg-white cursor-pointer"
                  title="文字颜色"
                />
              </div>
              <input
                type="range"
                min="16"
                max="140"
                value={textConfig.fontSize}
                onChange={(event) => setTextConfig((prev) => ({ ...prev, fontSize: Number(event.target.value) }))}
                className="w-full h-2 bg-slate-200 rounded-full appearance-none cursor-pointer accent-violet-500"
              />
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-medium text-slate-600">透明度</label>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-mono">{Math.round(textConfig.opacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.01"
                  value={textConfig.opacity}
                  onChange={(event) => setTextConfig((prev) => ({ ...prev, opacity: Number(event.target.value) }))}
                  className="w-full h-2 bg-slate-200 rounded-full appearance-none cursor-pointer accent-violet-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center justify-center gap-2 bg-slate-50 border border-slate-100 rounded-lg py-2 text-xs font-semibold text-slate-600">
                  <input type="checkbox" checked={textConfig.shadow} onChange={(event) => setTextConfig((prev) => ({ ...prev, shadow: event.target.checked }))} className="accent-violet-600" />
                  阴影
                </label>
                <label className="flex items-center justify-center gap-2 bg-slate-50 border border-slate-100 rounded-lg py-2 text-xs font-semibold text-slate-600">
                  <input type="checkbox" checked={textConfig.outline} onChange={(event) => setTextConfig((prev) => ({ ...prev, outline: event.target.checked }))} className="accent-violet-600" />
                  描边
                </label>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => watermarkInputRef.current?.click()}
                disabled={isProcessing}
                className="w-full flex items-center justify-center gap-2 p-3 bg-white border border-slate-200 rounded-xl text-slate-600 hover:border-violet-300 hover:text-violet-700 hover:shadow-sm transition-all disabled:opacity-50"
              >
                <ImageIcon size={15} />
                <span className="text-xs font-bold">{watermarkFile ? watermarkFile.name : '上传水印图片'}</span>
              </button>
              <input ref={watermarkInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleWatermarkImageInput} />
              <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-black text-violet-700">常用水印库</div>
                    <div className="text-[10px] font-semibold text-violet-500">仅保存在当前浏览器本地</div>
                  </div>
                  <button
                    type="button"
                    onClick={saveCurrentWatermarkToLibrary}
                    disabled={!watermarkFile || isProcessing}
                    className="rounded-lg bg-white border border-violet-200 px-3 py-1.5 text-[11px] font-bold text-violet-700 hover:border-violet-300 disabled:opacity-50"
                  >
                    保存到常用水印
                  </button>
                </div>
                {watermarkLibraryStatus && (
                  <div className="text-[11px] font-semibold text-violet-700">{watermarkLibraryStatus}</div>
                )}
                {savedWatermarks.length ? (
                  <div className="grid grid-cols-2 gap-2">
                    {savedWatermarks.map((item) => (
                      <div
                        key={item.id}
                        className={`rounded-xl border bg-white p-2 space-y-2 ${activeSavedWatermarkId === item.id ? 'border-violet-400 ring-1 ring-violet-300' : 'border-violet-100'}`}
                      >
                        <div className="h-16 rounded-lg bg-slate-100 border border-slate-100 flex items-center justify-center overflow-hidden">
                          <img src={item.dataUrl} alt={item.name} className="max-h-full max-w-full object-contain" draggable={false} />
                        </div>
                        <div className="truncate text-[11px] font-bold text-slate-700" title={item.name}>{item.name}</div>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => applySavedWatermark(item)}
                            disabled={isProcessing}
                            className="flex-1 rounded-lg bg-violet-600 px-2 py-1.5 text-[10px] font-bold text-white hover:bg-violet-700 disabled:opacity-50"
                          >
                            使用
                          </button>
                          <button
                            type="button"
                            onClick={() => removeSavedWatermark(item)}
                            disabled={isProcessing}
                            className="rounded-lg border border-slate-200 px-2 py-1.5 text-[10px] font-bold text-slate-500 hover:border-rose-200 hover:text-rose-600 disabled:opacity-50"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-violet-200 bg-white/70 p-3 text-center text-[11px] font-semibold text-violet-500">
                    暂无常用水印。上传水印图片后可保存到这里。
                  </div>
                )}
              </div>
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-medium text-slate-600">水印大小</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="2"
                      max="80"
                      value={imageConfig.scalePercent}
                      onChange={(event) => {
                        const nextValue = Math.min(80, Math.max(2, Number(event.target.value) || 2));
                        setImageConfig((prev) => ({ ...prev, scalePercent: nextValue }));
                      }}
                      className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-[11px] font-bold text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                    <span className="text-[10px] text-slate-400">%</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="2"
                  max="80"
                  value={imageConfig.scalePercent}
                  onChange={(event) => setImageConfig((prev) => ({ ...prev, scalePercent: Number(event.target.value) }))}
                  className="w-full h-2 bg-slate-200 rounded-full appearance-none cursor-pointer accent-violet-500"
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-medium text-slate-600">透明度</label>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-mono">{Math.round(imageConfig.opacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.01"
                  value={imageConfig.opacity}
                  onChange={(event) => setImageConfig((prev) => ({ ...prev, opacity: Number(event.target.value) }))}
                  className="w-full h-2 bg-slate-200 rounded-full appearance-none cursor-pointer accent-violet-500"
                />
              </div>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">示例图</h4>
            <select
              value={previewIndex}
              onChange={(event) => {
                setPreviewIndex(Number(event.target.value));
                requestPreviewLoad();
              }}
              disabled={!entries.length || isProcessing}
              className="max-w-[180px] p-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
            >
              {previewOptions.length ? previewOptions.map(({ entry, index }) => (
                <option key={entry.id} value={index}>第 {index + 1} 张：{entry.name}</option>
              )) : <option value={0}>暂无图片</option>}
            </select>
          </div>
          {entries.length > previewOptions.length && (
            <p className="text-[11px] text-slate-400">示例图下拉仅显示前 {previewOptions.length} 张，全部图片仍会参与批量处理。</p>
          )}
          {entries.length > 0 && !previewLoadRequested && (
            <button
              type="button"
              onClick={requestPreviewLoad}
              disabled={isProcessing}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white p-2.5 text-xs font-bold text-violet-700 hover:border-violet-300 hover:bg-violet-50 disabled:opacity-50"
            >
              <ImageIcon size={14} />
              加载示例图预览
            </button>
          )}

          <div className="bg-slate-100/80 border border-slate-200 rounded-2xl p-3">
            {previewLoading ? (
              <div className="h-44 rounded-xl bg-white border border-dashed border-violet-200 flex items-center justify-center gap-2 text-xs font-semibold text-violet-600">
                <Loader2 size={15} className="animate-spin" />
                正在解码并生成当前示例图预览
              </div>
            ) : previewImageUrl ? (
              <div
                ref={previewRef}
                data-testid="batch-watermark-preview"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onDragStart={stopDragEvent}
                className="relative overflow-hidden rounded-xl bg-white shadow-inner touch-none cursor-crosshair select-none"
              >
                <img
                  data-testid="batch-watermark-base-image"
                  src={previewImageUrl}
                  alt="批量水印示例图"
                  draggable={false}
                  onDragStart={stopDragEvent}
                  className="block w-full max-h-[360px] object-contain pointer-events-none bg-slate-200"
                  onLoad={() => {
                    if (previewRef.current) setPreviewWidth(previewRef.current.getBoundingClientRect().width);
                  }}
                />
                <div
                  ref={previewOverlayRef}
                  data-testid="batch-watermark-overlay"
                  draggable={false}
                  onDragStart={stopDragEvent}
                  className="absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-move select-none"
                  style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%`, touchAction: 'none', userSelect: 'none' }}
                >
                  {watermarkType === 'text' ? (
                    <div className="font-black whitespace-nowrap pointer-events-none" style={previewTextStyle}>{textConfig.text || '水印文字'}</div>
                  ) : watermarkImageUrl ? (
                    <img
                      src={watermarkImageUrl}
                      alt="图片水印预览"
                      draggable={false}
                      onDragStart={stopDragEvent}
                      className="block pointer-events-none select-none"
                      style={{ width: Math.max(28, (previewWidth || 560) * (imageConfig.scalePercent / 100)), maxWidth: '90%', height: 'auto', opacity: imageConfig.opacity }}
                    />
                  ) : (
                    <div className="px-3 py-2 rounded-lg bg-white/90 border border-slate-200 text-xs font-bold text-slate-500 shadow">上传水印图</div>
                  )}
                </div>
              </div>
            ) : previewError ? (
              <div className="h-44 rounded-xl bg-white border border-dashed border-rose-200 flex flex-col items-center justify-center gap-2 px-4 text-center text-xs font-semibold text-rose-600">
                <AlertCircle size={16} />
                <span>{previewError}</span>
                <button
                  type="button"
                  onClick={requestPreviewLoad}
                  disabled={isProcessing}
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-bold text-rose-700 disabled:opacity-50"
                >
                  重新加载示例图预览
                </button>
              </div>
            ) : (
              <div className="h-44 rounded-xl bg-white border border-dashed border-slate-300 flex items-center justify-center text-xs font-semibold text-slate-400">
                {entries.length ? '已导入照片，正在等待加载当前示例图预览' : '选择图片后显示可拖动预览'}
              </div>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">输出设置</h4>
          <button
            type="button"
            onClick={handlePickOutputFolder}
            disabled={!hasFileSystemAccess || isProcessing}
            className="w-full flex items-center justify-center gap-2 p-3 bg-white border border-slate-200 rounded-xl text-slate-600 hover:border-violet-300 hover:text-violet-700 hover:shadow-sm transition-all disabled:opacity-50"
          >
            <FolderOutput size={15} />
            <span className="text-xs font-bold">{outputDirectoryName ? `输出到：${outputDirectoryName}` : hasFileSystemAccess ? '选择输出文件夹' : '当前浏览器不支持文件夹写入'}</span>
          </button>
          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1.5">输出根文件夹名</span>
            <input
              value={outputRootName}
              onChange={(event) => {
                setOutputRootTouched(true);
                setOutputRootName(event.target.value);
              }}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1.5">文件名后缀</span>
            <input
              value={fileSuffix}
              onChange={(event) => setFileSuffix(event.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </label>
          <div className="grid grid-cols-1 gap-2">
            <label className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-600">
              <span>给子文件夹追加“水印”后缀</span>
              <input type="checkbox" checked={suffixSubfolders} onChange={(event) => setSuffixSubfolders(event.target.checked)} className="accent-violet-600" />
            </label>
            <label className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-600">
              <span>保留原文件夹结构</span>
              <input type="checkbox" checked disabled className="accent-violet-600" />
            </label>
          </div>
        </section>

        <section className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={startProcessing}
              disabled={isProcessing || !entries.length}
              className="col-span-2 flex items-center justify-center gap-1.5 p-3 bg-slate-900 text-white rounded-xl hover:bg-violet-600 transition-all shadow-lg shadow-slate-900/15 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold"
            >
              {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              开始批量加水印
            </button>
            <button type="button" onClick={cancelProcessing} disabled={!isProcessing} className="flex items-center justify-center gap-1.5 p-3 bg-white border border-slate-200 text-slate-600 rounded-xl hover:border-amber-300 hover:text-amber-700 transition-all disabled:opacity-50 text-xs font-bold">
              <Ban size={14} />
              取消
            </button>
            <button type="button" onClick={resetAll} disabled={isProcessing} className="flex items-center justify-center gap-1.5 p-3 bg-white border border-slate-200 text-slate-600 rounded-xl hover:border-rose-300 hover:text-rose-600 transition-all disabled:opacity-50 text-xs font-bold">
              <Trash2 size={14} />
              清空
            </button>
          </div>

          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
              <span>处理进度</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
            </div>

            <div className="grid grid-cols-5 gap-1 text-center">
              {[
                ['总数', status.total || entries.length],
                ['已完成', status.processed],
                ['成功', status.success],
                ['失败', status.failed],
                ['跳过', status.skipped || selectedSkipped],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-white border border-slate-100 px-1.5 py-2">
                  <div className="text-sm font-black text-slate-700">{value}</div>
                  <div className="text-[9px] text-slate-400">{label}</div>
                </div>
              ))}
            </div>

            {status.currentFile && <div className="truncate text-[11px] text-slate-500">当前：{status.currentFile}</div>}

            <div className="space-y-2">
              {status.success > 0 && !isProcessing && (
                <div className="flex items-start gap-2 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-2">
                  <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" />
                  <span>已完成 {status.success} 张，输出方式：{status.outputMode === 'directory' ? '目标文件夹' : 'ZIP 包'}{status.zipDownloaded ? '，ZIP 已开始下载' : ''}</span>
                </div>
              )}
              {status.warnings.map((warning, index) => (
                <div key={`${warning}-${index}`} className="flex items-start gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2">
                  <FileArchive size={14} className="mt-0.5 flex-shrink-0" />
                  <span>{warning}</span>
                </div>
              ))}
              {status.cancelled && (
                <div className="flex items-start gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2">
                  <Eraser size={14} className="mt-0.5 flex-shrink-0" />
                  <span>任务已取消，UI 已恢复可操作。</span>
                </div>
              )}
            </div>

            {status.errors.length > 0 && (
              <div className="border border-rose-100 bg-rose-50 rounded-xl overflow-hidden">
                <button type="button" onClick={() => setShowErrors(!showErrors)} className="w-full flex items-center justify-between gap-2 p-2 text-[11px] font-bold text-rose-700">
                  <span className="flex items-center gap-1.5"><AlertCircle size={14} /> 错误列表（{status.errors.length}）</span>
                </button>
                {showErrors && (
                  <div className="max-h-32 overflow-auto border-t border-rose-100 bg-white/60 p-2 space-y-1">
                    {status.errors.map((error, index) => (
                      <div key={`${error}-${index}`} className="text-[11px] text-rose-700 break-words">{error}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      {outputSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className="rounded-xl bg-emerald-100 p-2 text-emerald-600">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <div className="text-base font-black text-slate-900">批量水印完成</div>
                <div className="text-[11px] font-semibold text-slate-500">处理结果已生成</div>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
                  <div className="text-lg font-black text-emerald-700">{outputSummary.success}</div>
                  <div className="text-[10px] font-bold text-emerald-600">成功</div>
                </div>
                <div className="rounded-xl bg-rose-50 border border-rose-100 p-3">
                  <div className="text-lg font-black text-rose-700">{outputSummary.failed}</div>
                  <div className="text-[10px] font-bold text-rose-600">失败</div>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                  <div className="text-lg font-black text-slate-700">{outputSummary.skipped}</div>
                  <div className="text-[10px] font-bold text-slate-500">跳过</div>
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 space-y-2">
                <div className="text-[11px] text-slate-500">
                  <span className="font-bold text-slate-700">输出方式：</span>
                  {outputSummary.outputMode === 'directory' ? '目标文件夹' : 'ZIP 下载'}
                </div>
                <div className="text-[11px] text-slate-500">
                  <span className="font-bold text-slate-700">输出文件夹名：</span>
                  <span className="break-all">{outputSummary.outputFolderName}</span>
                </div>
                <div className="text-[11px] text-slate-500">
                  <span className="font-bold text-slate-700">输出位置：</span>
                  <span className="break-all">{outputSummary.outputLocation}</span>
                </div>
                <div className="text-[10px] leading-relaxed text-slate-400">
                  普通网页不能直接打开 Finder 文件夹。可复制输出位置后，在浏览器下载记录或 Finder 中查看结果。
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                {outputSummary.failed > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowErrors(true);
                      setOutputSummary(null);
                    }}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100"
                  >
                    查看失败原因
                  </button>
                )}
                <button
                  type="button"
                  onClick={copyOutputLocation}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-violet-300 hover:text-violet-700"
                >
                  {outputSummary.copied ? '已复制' : '复制输出路径'}
                </button>
                <button
                  type="button"
                  onClick={() => setOutputSummary(null)}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
