import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Eraser,
  FileArchive,
  FolderInput,
  FolderOutput,
  Image as ImageIcon,
  Loader2,
  Play,
  Stamp,
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
  LocalImageReadStats,
  canUseFileSystemAccessDirectory,
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
import {
  SavedWatermark,
  dataUrlToFile,
  deleteSavedWatermark,
  fileToDataUrl,
  loadSavedWatermarks,
  saveWatermark,
} from '../utils/watermarkLibrary';
import { createImagePreviewBlob } from '../utils/imageDecode';
import { getCenterSnapState, shouldRenderCenterGuide } from '../utils/watermarkInteraction';
import { BatchWatermarkWorkspace } from './BatchWatermarkWorkspace';
import { WatermarkControlRail } from './WatermarkControlRail';
import { WatermarkPreviewCanvas } from './WatermarkPreviewCanvas';
import { BatchTaskBar } from './BatchTaskBar';
import { ProcessingResultDrawer } from './ProcessingResultDrawer';

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
const defaultImageConfig = { opacity: 0.85, scalePercent: 60 };
const defaultPosition = { x: 0.5, y: 0.15 };

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

type PreviewImageRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const emptyPreviewImageRect: PreviewImageRect = {
  left: 0,
  top: 0,
  width: 0,
  height: 0,
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
    ...defaultImageConfig,
  });
  const [watermarkFile, setWatermarkFile] = useState<File | null>(null);
  const [watermarkImageUrl, setWatermarkImageUrl] = useState('');
  const [savedWatermarks, setSavedWatermarks] = useState<SavedWatermark[]>([]);
  const [watermarkLibraryStatus, setWatermarkLibraryStatus] = useState('');
  const [activeSavedWatermarkId, setActiveSavedWatermarkId] = useState('');
  const [position, setPosition] = useState({ ...defaultPosition });

  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewImageUrl, setPreviewImageUrl] = useState('');
  const [previewWidth, setPreviewWidth] = useState(0);
  const [previewImageRect, setPreviewImageRect] = useState<PreviewImageRect>(emptyPreviewImageRect);
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
  const [showMoreSettings, setShowMoreSettings] = useState(false);
  const [isDraggingWatermark, setIsDraggingWatermark] = useState(false);
  const [isSnappedToCenter, setIsSnappedToCenter] = useState(false);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const watermarkInputRef = useRef<HTMLInputElement>(null);
  const libraryWatermarkInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const previewImageRef = useRef<HTMLImageElement>(null);
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
  const refreshWatermarkLibrary = useCallback(async () => {
    const cached = await loadSavedWatermarks();
    setSavedWatermarks(cached.filter((item) => Boolean(item.dataUrl)).map((item) => ({ ...item, source: 'local' })));
  }, []);

  const revokePreviewObjectUrl = useCallback(() => {
    if (!previewObjectUrlRef.current) return;
    URL.revokeObjectURL(previewObjectUrlRef.current);
    previewObjectUrlRef.current = '';
  }, []);

  const clearPreviewDisplay = useCallback(() => {
    revokePreviewObjectUrl();
    setPreviewImageUrl('');
    setPreviewWidth(0);
    setPreviewImageRect(emptyPreviewImageRect);
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

    refreshWatermarkLibrary()
      .catch((error) => {
        if (!cancelled) setWatermarkLibraryStatus(`常用水印库读取失败：${getErrorMessage(error)}`);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshWatermarkLibrary]);

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
    setPreviewImageRect(emptyPreviewImageRect);
    setPreviewError('');
    setPreviewLoading(true);

    const loadPreview = async () => {
      let nextUrl = '';

      try {
        const file = await getEntryFile(currentPreviewEntry, controller.signal);
        const previewBlob = await createImagePreviewBlob(file, { maxDimension: 1600, signal: controller.signal });
        nextUrl = URL.createObjectURL(previewBlob);

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
        const message = `${currentPreviewEntry.name} 无法解码，已从本批次移除并尝试下一张：${getErrorMessage(error)}`;
        imageItemsRef.current = imageItemsRef.current.filter((item) => item.id !== currentPreviewEntry.id);
        setEntries((previous) => previous.filter((entry) => entry.id !== currentPreviewEntry.id));
        setSelectedSkipped((previous) => previous + 1);
        setReadStats((previous) => ({
          ...previous,
          imageCount: Math.max(0, previous.imageCount - 1),
          skippedCount: previous.skippedCount + 1,
          invalidImageCount: previous.invalidImageCount + 1,
          decodeFailedCount: previous.decodeFailedCount + 1,
        }));
        setStatus((previous) => ({ ...previous, skipped: previous.skipped + 1, warnings: [...previous.warnings, message] }));
        setPreviewError(message);
        setPreviewLoadRequested(true);
        setPreviewReloadKey((previous) => previous + 1);
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

  const measurePreviewImageRect = useCallback(() => {
    const preview = previewRef.current;
    const image = previewImageRef.current;
    if (!preview || !image || !image.naturalWidth || !image.naturalHeight) {
      return emptyPreviewImageRect;
    }

    const previewBounds = preview.getBoundingClientRect();
    const imageBounds = image.getBoundingClientRect();
    const naturalRatio = image.naturalWidth / image.naturalHeight;
    const boxRatio = imageBounds.width / imageBounds.height;

    let width = imageBounds.width;
    let height = imageBounds.height;
    let left = imageBounds.left - previewBounds.left;
    let top = imageBounds.top - previewBounds.top;

    if (boxRatio > naturalRatio) {
      height = imageBounds.height;
      width = height * naturalRatio;
      left += (imageBounds.width - width) / 2;
    } else {
      width = imageBounds.width;
      height = width / naturalRatio;
      top += (imageBounds.height - height) / 2;
    }

    return { left, top, width, height };
  }, []);

  const updatePreviewImageRect = useCallback(() => {
    const nextRect = measurePreviewImageRect();
    setPreviewImageRect(nextRect);
    setPreviewWidth(nextRect.width);
    return nextRect;
  }, [measurePreviewImageRect]);

  useEffect(() => {
    if (!previewRef.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) updatePreviewImageRect();
    });
    observer.observe(previewRef.current);
    if (previewImageRef.current) observer.observe(previewImageRef.current);
    updatePreviewImageRect();
    return () => observer.disconnect();
  }, [previewImageUrl, updatePreviewImageRect]);

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
    setSourceLabel(`已选择 ${nextEntries.length} 张照片`);
    setPreviewIndex(0);
    setPreviewLoadRequested(nextEntries.length > 0);
    setPreviewReloadKey((prev) => prev + 1);
    setReadStats(stats);
    setStatus({
      ...emptyStatus,
      skipped: stats.skippedCount,
      warnings: [
        SHOW_FILE_IMPORT_DEBUG ? getSkippedSummary(stats) : '',
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
      setSourceLabel('正在读取照片…');
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
      setSourceLabel('正在等待选择文件夹…');

      const directory = await pickSourceDirectory();
      const controller = new AbortController();
      scanAbortControllerRef.current = controller;

      setSourceRootName(directory.name || '批量图片');
      setSourceLabel('正在读取照片…');

      const result = await readImagesFromDirectoryHandle(directory, {
        signal: controller.signal,
        createObjectUrls: false,
        onProgress: () => {
          setSourceLabel('正在读取照片…');
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

  const saveWatermarkToLocalLibrary = useCallback(async (file: File) => {
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        throw new Error('水印仅支持 PNG、JPEG 或 WebP 格式');
      }
      if (file.size > 2 * 1024 * 1024) {
        throw new Error('水印文件不能超过 2 MB');
      }
      const promptedName = window.prompt('给这个常用水印命名', file.name);
      if (promptedName === null) {
        setWatermarkLibraryStatus('已取消保存常用水印');
        return;
      }
      const name = promptedName.trim() || file.name;
      const item: SavedWatermark = {
        id: `watermark-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name,
        mimeType: file.type,
        dataUrl: await fileToDataUrl(file),
        createdAt: new Date().toISOString(),
        size: file.size,
        source: 'local',
      };
      await saveWatermark(item);
      await refreshWatermarkLibrary();
      setActiveSavedWatermarkId(item.id);
      setWatermarkLibraryStatus(`已保存到当前浏览器：${name}`);
    } catch (error) {
      setWatermarkLibraryStatus(`保存常用水印失败：${getErrorMessage(error)}`);
    }
  }, [refreshWatermarkLibrary]);

  const handleAddWatermarkToLibrary = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0] || null;
    event.currentTarget.value = '';
    if (!file) return;
    if (watermarkImageUrl) URL.revokeObjectURL(watermarkImageUrl);
    setWatermarkFile(file);
    setWatermarkImageUrl(URL.createObjectURL(file));
    setWatermarkType('image');
    void saveWatermarkToLocalLibrary(file);
  }, [saveWatermarkToLocalLibrary, watermarkImageUrl]);

  const applySavedWatermark = useCallback(async (item: SavedWatermark) => {
    try {
      if (!item.dataUrl) throw new Error('当前浏览器没有这个水印的本地副本');
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
      await refreshWatermarkLibrary();
      if (activeSavedWatermarkId === item.id) {
        setActiveSavedWatermarkId('');
        setWatermarkLibraryStatus(`已删除“${item.name}”。当前水印仍保留在本次任务中。`);
      } else {
        setWatermarkLibraryStatus(`已删除常用水印：${item.name}`);
      }
    } catch (error) {
      setWatermarkLibraryStatus(`删除常用水印失败：${getErrorMessage(error)}`);
    }
  }, [activeSavedWatermarkId, refreshWatermarkLibrary]);

  const getPositionFromPointer = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const imageRect = updatePreviewImageRect();
    if (!imageRect.width || !imageRect.height) return;
    const nextX = clamp((event.clientX - rect.left - imageRect.left) / imageRect.width);
    const centerSnap = getCenterSnapState(nextX, imageRect.width);
    setIsSnappedToCenter(centerSnap.showGuide);
    return {
      x: centerSnap.x,
      y: clamp((event.clientY - rect.top - imageRect.top) / imageRect.height),
    };
  }, [updatePreviewImageRect]);

  const movePreviewOverlay = useCallback((nextPosition: { x: number; y: number }) => {
    dragPositionRef.current = nextPosition;
    if (dragFrameRef.current !== null) return;

    dragFrameRef.current = window.requestAnimationFrame(() => {
      dragFrameRef.current = null;
      const overlay = previewOverlayRef.current;
      if (!overlay) return;
      const { x, y } = dragPositionRef.current;
      const imageRect = measurePreviewImageRect();
      if (!imageRect.width || !imageRect.height) return;
      overlay.style.left = `${imageRect.left + x * imageRect.width}px`;
      overlay.style.top = `${imageRect.top + y * imageRect.height}px`;
    });
  }, [measurePreviewImageRect]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    stopEvent(event);
    const nextPosition = getPositionFromPointer(event);
    if (!nextPosition) return;
    activeDragPointerRef.current = event.pointerId;
    setIsDraggingWatermark(true);
    movePreviewOverlay(nextPosition);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [getPositionFromPointer, movePreviewOverlay]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (activeDragPointerRef.current !== event.pointerId || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    stopEvent(event);
    const nextPosition = getPositionFromPointer(event);
    if (nextPosition) movePreviewOverlay(nextPosition);
  }, [getPositionFromPointer, movePreviewOverlay]);

  const finishWatermarkDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    stopEvent(event);
    if (activeDragPointerRef.current === event.pointerId) {
      activeDragPointerRef.current = null;
      setPosition(dragPositionRef.current);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsDraggingWatermark(false);
    setIsSnappedToCenter(false);
  }, []);

  const resetAll = useCallback(() => {
    abortControllerRef.current?.abort();
    clearSelectedImages();
    setOutputDirectory(null);
    setOutputDirectoryName('');
    setOutputRootTouched(false);
    setFileSuffix('_水印');
    setSuffixSubfolders(false);
    setImageConfig({ ...defaultImageConfig });
    setPosition({ ...defaultPosition });
    setIsDraggingWatermark(false);
    setIsSnappedToCenter(false);
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
    setShowMoreSettings(true);
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
      SHOW_FILE_IMPORT_DEBUG ? getSkippedSummary(readStats) : '',
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
  const previewOverlayStyle = useMemo<React.CSSProperties>(() => ({
    left: previewImageRect.width ? `${previewImageRect.left + position.x * previewImageRect.width}px` : `${position.x * 100}%`,
    top: previewImageRect.height ? `${previewImageRect.top + position.y * previewImageRect.height}px` : `${position.y * 100}%`,
    touchAction: 'none',
    userSelect: 'none',
  }), [position.x, position.y, previewImageRect]);
  const previewWatermarkWidth = Math.max(28, (previewImageRect.width || previewWidth || 560) * (imageConfig.scalePercent / 100));

  return (
    <BatchWatermarkWorkspace>
    <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white text-sm shadow-sm">
      <div className="flex h-14 items-center justify-between gap-3 border-b border-slate-200 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-violet-100 p-2 text-violet-600"><Stamp size={18} /></div>
          <div>
            <h2 className="text-base font-bold text-slate-900">批量水印</h2>
            <p className="text-[11px] font-medium text-slate-500">专业摄影工作台</p>
            {SHOW_FILE_IMPORT_DEBUG && <p className="text-[10px] text-violet-600 font-black">{FILE_IMPORT_DEBUG_VERSION}</p>}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5 p-4 pb-24 sm:p-5 sm:pb-24 lg:grid lg:min-h-[calc(100dvh-170px)] lg:grid-cols-[minmax(340px,380px)_minmax(0,1fr)] lg:grid-rows-[auto_auto_minmax(0,1fr)_auto] lg:gap-0 lg:p-0">
        <WatermarkControlRail>
        <section className="order-1 space-y-3 lg:p-6 lg:pb-0">
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
          {isReadingFolder && (
            <button type="button" onClick={cancelFolderScan} className="text-xs font-bold text-rose-500 hover:text-rose-600">
              取消读取
            </button>
          )}

          <input ref={imageInputRef} type="file" multiple accept={acceptedImageExtensions} className="hidden" onChange={handleImageInput} />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFallbackFolderInput}
            {...{ webkitdirectory: '' }}
          />

          {SHOW_FILE_IMPORT_DEBUG && (
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
          <p className="text-xs font-semibold text-slate-500">{entries.length ? `已选择 ${entries.length} 张照片` : '尚未选择照片'}</p>
        </section>

        <section className="order-2 space-y-3 lg:px-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-bold text-slate-600">常用水印</h4>
              <p className="mt-1 text-[11px] font-medium text-slate-400">仅保存在当前浏览器</p>
            </div>
            <button
              type="button"
              onClick={() => libraryWatermarkInputRef.current?.click()}
              disabled={isProcessing}
              className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-violet-700 hover:bg-violet-50 disabled:opacity-50"
            >
              + 添加常用水印
            </button>
          </div>
          <input ref={libraryWatermarkInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleAddWatermarkToLibrary} />
          {watermarkLibraryStatus && <p className="text-[11px] font-semibold text-violet-700">{watermarkLibraryStatus}</p>}
          {savedWatermarks.length ? (
            <div className="grid grid-cols-2 gap-2">
              {savedWatermarks.map((item) => (
                <div key={item.id} className={`rounded-xl border bg-white p-2 ${activeSavedWatermarkId === item.id ? 'border-violet-400 ring-1 ring-violet-300' : 'border-slate-200'}`}>
                  <button type="button" onClick={() => applySavedWatermark(item)} disabled={isProcessing} className="block w-full text-left disabled:opacity-50">
                    <div className="flex h-16 items-center justify-center overflow-hidden rounded-lg bg-slate-50">
                      <img src={item.dataUrl} alt={item.name} className="max-h-full max-w-full object-contain" draggable={false} />
                    </div>
                    <div className="mt-2 truncate text-[11px] font-bold text-slate-700" title={item.name}>{item.name}</div>
                  </button>
                  <button type="button" onClick={() => removeSavedWatermark(item)} disabled={isProcessing} className="mt-1 text-[10px] font-semibold text-slate-400 hover:text-rose-600 disabled:opacity-50">删除</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-[11px] font-medium text-slate-400">添加一个常用水印后，点击即可应用。</p>
          )}
        </section>

        <section className="order-4 space-y-3 lg:px-6">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-600">快速设置</h4>
            <button
              type="button"
              onClick={() => {
                setImageConfig({ ...defaultImageConfig });
                setPosition({ ...defaultPosition });
              }}
              className="text-[11px] font-semibold text-violet-700 hover:text-violet-800"
            >
              重置位置
            </button>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-slate-600">{watermarkType === 'image' ? '水印大小' : '文字大小'}</label>
              <span className="text-[11px] font-bold text-slate-700">{watermarkType === 'image' ? `${imageConfig.scalePercent}%` : textConfig.fontSize}</span>
            </div>
            <input
              type="range"
              min={watermarkType === 'image' ? '2' : '16'}
              max={watermarkType === 'image' ? '80' : '140'}
              value={watermarkType === 'image' ? imageConfig.scalePercent : textConfig.fontSize}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (watermarkType === 'image') setImageConfig((prev) => ({ ...prev, scalePercent: value }));
                else setTextConfig((prev) => ({ ...prev, fontSize: value }));
              }}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-violet-600"
            />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-slate-600">透明度</label>
              <span className="text-[11px] font-bold text-slate-700">{Math.round((watermarkType === 'image' ? imageConfig.opacity : textConfig.opacity) * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.01"
              value={watermarkType === 'image' ? imageConfig.opacity : textConfig.opacity}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (watermarkType === 'image') setImageConfig((prev) => ({ ...prev, opacity: value }));
                else setTextConfig((prev) => ({ ...prev, opacity: value }));
              }}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-violet-600"
            />
          </div>
        </section>

        <section className="order-5 space-y-3 lg:px-6 lg:pb-6">
          <button
            type="button"
            onClick={() => setShowMoreSettings((prev) => !prev)}
            className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left text-xs font-bold text-slate-700 hover:bg-slate-100"
            aria-expanded={showMoreSettings}
          >
            更多设置
            {showMoreSettings ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          {showMoreSettings && (
            <div className="space-y-5 pt-1">
          <button
            type="button"
            onClick={handleAdvancedPickSourceFolder}
            disabled={isProcessing || isReadingFolder || isReadingAdvancedFolder}
            className="text-xs font-semibold text-slate-500 hover:text-violet-700 disabled:opacity-50"
          >
            {isReadingAdvancedFolder ? '正在读取文件夹…' : '高级选择文件夹'}
          </button>
          <h4 className="text-xs font-bold text-slate-500">水印类型</h4>
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
              <button
                type="button"
                onClick={() => {
                  setImageConfig({ ...defaultImageConfig });
                  setPosition({ ...defaultPosition });
                }}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:border-violet-300 hover:text-violet-700"
              >
                重置水印位置
              </button>
            </div>
          )}
            </div>
          )}
        </section>

        </WatermarkControlRail>
        <WatermarkPreviewCanvas toolbar={null}>
        <section className="space-y-3 lg:col-start-2 lg:row-start-1 lg:row-span-3 lg:flex lg:min-h-0 lg:flex-col lg:gap-4 lg:overflow-hidden lg:bg-slate-100/80 lg:p-6">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-bold text-slate-800">照片预览</h4>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="上一张图片"
                onClick={() => {
                  setPreviewIndex((current) => Math.max(0, current - 1));
                  requestPreviewLoad();
                }}
                disabled={!entries.length || isProcessing || previewIndex === 0}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-700 disabled:opacity-40"
              >
                <ChevronLeft size={15} />
              </button>
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
                  <option key={entry.id} value={index}>{index + 1} / {entries.length} · {entry.name}</option>
                )) : <option value={0}>暂无图片</option>}
              </select>
              <button
                type="button"
                aria-label="下一张图片"
                onClick={() => {
                  setPreviewIndex((current) => Math.min(entries.length - 1, current + 1));
                  requestPreviewLoad();
                }}
                disabled={!entries.length || isProcessing || previewIndex >= entries.length - 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-700 disabled:opacity-40"
              >
                <ChevronRight size={15} />
              </button>
            </div>
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

          <div className="flex min-h-[420px] flex-1 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-200/70 p-3 sm:p-4">
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
                onPointerUp={finishWatermarkDrag}
                onPointerCancel={finishWatermarkDrag}
                onLostPointerCapture={finishWatermarkDrag}
                onDragStart={stopDragEvent}
                className="relative max-h-full max-w-full overflow-hidden rounded-lg bg-white shadow-sm touch-none cursor-crosshair select-none"
              >
                <img
                  ref={previewImageRef}
                  data-testid="batch-watermark-base-image"
                  src={previewImageUrl}
                  alt="批量水印示例图"
                  draggable={false}
                  onDragStart={stopDragEvent}
                  className="block max-h-[min(64dvh,680px)] w-full object-contain pointer-events-none bg-slate-200"
                  onLoad={() => {
                    updatePreviewImageRect();
                  }}
                />
                {shouldRenderCenterGuide(isDraggingWatermark, isSnappedToCenter) && (
                  <div
                    data-testid="batch-watermark-center-guide"
                    data-export-ignore="true"
                    className="pointer-events-none absolute z-0 w-px bg-violet-500/70"
                    style={{
                      left: `${previewImageRect.left + previewImageRect.width / 2}px`,
                      top: `${previewImageRect.top}px`,
                      height: `${previewImageRect.height}px`,
                    }}
                  />
                )}
                <div
                  ref={previewOverlayRef}
                  data-testid="batch-watermark-overlay"
                  draggable={false}
                  onDragStart={stopDragEvent}
                  className="absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-move select-none"
                  style={previewOverlayStyle}
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
                      style={{ width: previewWatermarkWidth, maxWidth: '90%', height: 'auto', opacity: imageConfig.opacity }}
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
        </WatermarkPreviewCanvas>

        <BatchTaskBar>
        <section className="fixed inset-x-4 bottom-0 z-30 grid grid-cols-2 gap-2 rounded-t-xl border border-slate-200 bg-white p-3 shadow-[0_-8px_20px_rgba(15,23,42,0.1)] lg:static lg:col-span-2 lg:row-start-4 lg:min-h-[76px] lg:grid-cols-[1fr_auto_auto] lg:items-center lg:rounded-none lg:border-x-0 lg:border-b-0 lg:px-6 lg:py-3 lg:shadow-none">
          <button
            type="button"
            onClick={isProcessing ? cancelProcessing : startProcessing}
            disabled={!entries.length}
            className="col-span-2 flex min-h-12 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-6 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-50 lg:col-start-3 lg:w-[260px]"
          >
            {isProcessing ? <Ban size={14} /> : <Play size={14} />}
            {isProcessing ? '取消处理' : '开始批量加水印'}
          </button>
          <div className="hidden text-xs font-semibold text-slate-500 lg:block">{entries.length ? `已选择 ${entries.length} 张照片` : '尚未选择照片'}{outputRootName ? ` · 输出：${outputRootName}` : ''}</div>
          <button type="button" onClick={resetAll} disabled={isProcessing} className="col-span-2 rounded-lg border border-slate-200 px-4 py-3 text-xs font-bold text-slate-500 hover:border-rose-200 hover:text-rose-600 disabled:opacity-50 lg:col-start-2">清空任务</button>
        </section>
        </BatchTaskBar>

        {showMoreSettings && (
        <section className="order-6 space-y-3 lg:col-start-1 lg:row-start-3 lg:overflow-y-auto lg:px-6 lg:pb-6">
          <h4 className="text-xs font-bold text-slate-500">输出设置</h4>
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
        )}

        {showMoreSettings && !outputSummary && (
        <section className="order-8 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={cancelProcessing} disabled={!isProcessing} className="col-span-2 flex items-center justify-center gap-1.5 p-3 bg-white border border-slate-200 text-slate-600 rounded-xl hover:border-amber-300 hover:text-amber-700 transition-all disabled:opacity-50 text-xs font-bold">
              <Ban size={14} />
              取消
            </button>
          </div>

          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
              <span>处理进度</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-violet-600 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
            </div>

            <div className="grid grid-cols-4 gap-1 text-center">
              {[
                ['总数', status.total || entries.length],
                ['已完成', status.processed],
                ['成功', status.success],
                ['失败', status.failed],
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
        )}
      </div>

      {outputSummary && (
        <ProcessingResultDrawer>
          <div className="w-full overflow-hidden rounded-t-xl border border-slate-200 bg-white shadow-[0_-8px_24px_rgba(15,23,42,0.12)]">
            <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
              <div className="rounded-xl bg-emerald-100 p-2 text-emerald-600">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <div className="text-base font-black text-slate-900">批量水印完成</div>
                <div className="text-[11px] font-semibold text-slate-500">处理结果已生成</div>
              </div>
            </div>
            <div className="grid gap-4 p-5 lg:grid-cols-[auto_1fr_auto] lg:items-center">
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
                  <div className="text-lg font-black text-emerald-700">{outputSummary.success}</div>
                  <div className="text-[10px] font-bold text-emerald-600">成功</div>
                </div>
                <div className="rounded-xl bg-rose-50 border border-rose-100 p-3">
                  <div className="text-lg font-black text-rose-700">{outputSummary.failed}</div>
                  <div className="text-[10px] font-bold text-rose-600">失败</div>
                </div>
              </div>

              <div className="rounded-lg bg-slate-50 p-3 text-left">
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
        </ProcessingResultDrawer>
      )}
    </div>
    </BatchWatermarkWorkspace>
  );
};
