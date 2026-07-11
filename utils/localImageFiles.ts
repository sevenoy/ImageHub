import { validateImageDecode } from './imageDecode';

export type LocalImageReadMode = 'webkitdirectory' | 'showDirectoryPicker' | 'files';

export type LocalImageItem = {
  id: string;
  file: File;
  name: string;
  relativePath: string;
  directoryPath: string;
  size: number;
  type: string;
  lastModified: number;
  objectUrl: string;
};

export type ImageFileItem = LocalImageItem;

export type LocalImageReadReport = {
  mode: LocalImageReadMode;
  rootName: string;
  rawFileCount: number;
  imageCount: number;
  skippedCount: number;
  systemSkippedCount: number;
  invalidImageCount: number;
  decodeFailedCount: number;
  limitSkippedCount: number;
  unsupportedCount: number;
  errorCount: number;
  firstRelativePaths: string[];
  firstSystemSkippedPaths: string[];
  firstSkippedReasons: string[];
  firstDecodeFailedPaths: string[];
  firstValidImagePaths: string[];
  errors: string[];
};

export type LocalImageReadStats = {
  sourceName: string;
  method: LocalImageReadMode;
  totalFiles: number;
  imageCount: number;
  skippedCount: number;
  systemSkippedCount: number;
  invalidImageCount: number;
  decodeFailedCount: number;
  limitSkippedCount: number;
  unsupportedCount: number;
  folderCount: number;
  errorCount: number;
  durationMs: number;
  warnings: string[];
  errors: string[];
  firstSystemSkippedPaths: string[];
  firstSkippedReasons: string[];
  firstDecodeFailedPaths: string[];
};

export type LocalImageReadResult = {
  images: LocalImageItem[];
  report: LocalImageReadReport;
  items: LocalImageItem[];
  stats: LocalImageReadStats;
};

export type LocalImageReadProgress = {
  totalFiles: number;
  imageCount: number;
  skippedCount: number;
  systemSkippedCount: number;
  invalidImageCount: number;
  decodeFailedCount: number;
  limitSkippedCount: number;
  unsupportedCount: number;
  folderCount: number;
  currentPath: string;
};

export type LocalImageReadOptions = {
  signal?: AbortSignal;
  createObjectUrls?: boolean;
  validateDecode?: boolean;
  maxImages?: number;
  onProgress?: (progress: LocalImageReadProgress) => void;
};

export type InputFileClassification =
  | { kind: 'image' }
  | { kind: 'system'; reason: string }
  | { kind: 'unsupported'; reason: string };

export type DirectoryHandleLike = {
  name: string;
  values?: () => AsyncIterable<FileSystemHandleLike>;
  entries?: () => AsyncIterable<[string, FileSystemHandleLike]>;
};

type FileSystemHandleLike =
  | {
      kind: 'file';
      name: string;
      getFile(): Promise<File>;
    }
  | {
      kind: 'directory';
      name: string;
      values?: () => AsyncIterable<FileSystemHandleLike>;
      entries?: () => AsyncIterable<[string, FileSystemHandleLike]>;
    };

type WindowWithDirectoryPicker = Window & {
  showDirectoryPicker?: (options?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<DirectoryHandleLike>;
};

type FileWithPath = {
  file: File;
  rawRelativePath: string;
};

const SUPPORTED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const UNSUPPORTED_PREVIEW_EXTENSIONS = new Set(['heic', 'heif', 'avif']);
const SUPPORTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const DEFAULT_MAX_LOCAL_IMAGES = 1000;
const GENERATED_DIRECTORY_NAMES = new Set([
  '.git',
  '.next',
  '.nuxt',
  '.svelte-kit',
  'node_modules',
  'dist',
  'build',
  '__MACOSX',
]);

const toSafeString = (value: unknown): string => (typeof value === 'string' ? value : '');

const safeSegment = (value: unknown) => toSafeString(value).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim() || '未命名';

const getExtension = (name: unknown) => {
  const safe = toSafeString(name);
  const dot = safe.lastIndexOf('.');
  return dot >= 0 ? safe.slice(dot + 1).toLowerCase() : '';
};

const getFileRelativePath = (
  file: { webkitRelativePath?: string; name?: string } | null | undefined,
  index = 0
) => {
  const relativePath = toSafeString(file?.webkitRelativePath);
  if (relativePath) return relativePath;
  const name = toSafeString(file?.name);
  if (name) return name;
  return `unnamed-file-${index}`;
};

const getRootName = (firstPath: unknown, fallback: string) => {
  const parts = toSafeString(firstPath).split('/').filter(Boolean);
  return parts.length > 1 ? safeSegment(parts[0]) : fallback;
};

const normalizeRelativePath = (relativePath: unknown, rootName?: string) => {
  const safe = toSafeString(relativePath);
  const parts = safe.split('/').filter(Boolean).map(safeSegment);
  if (rootName && parts.length > 1 && parts[0] === rootName) {
    return parts.slice(1).join('/');
  }
  return parts.join('/') || safeSegment(safe);
};

const getDirectoryPath = (relativePath: unknown) => {
  const parts = toSafeString(relativePath).split('/').filter(Boolean);
  return parts.slice(0, -1).join('/');
};

const makeImageId = (relativePath: string, file: File) => `${relativePath}__${file.size}__${file.lastModified}`;

export const isMacSystemFile = (relativePath: unknown, fileName: unknown) => {
  const safeName = toSafeString(fileName);
  const normalized = (toSafeString(relativePath) || safeName).replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  const names = parts.length ? parts : [safeName];

  return names.some((part) => {
    if (!part) return false;
    if (part === '.DS_Store') return true;
    if (part === '__MACOSX') return true;
    if (part === 'Thumbs.db') return true;
    if (part === 'desktop.ini') return true;
    if (part.startsWith('._')) return true;
    return false;
  });
};

const isSupportedImageName = (name: unknown) => SUPPORTED_EXTENSIONS.has(getExtension(name));

const isUnsupportedPreviewName = (name: unknown) => UNSUPPORTED_PREVIEW_EXTENSIONS.has(getExtension(name));

const abortIfNeeded = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw new DOMException('任务已取消', 'AbortError');
  }
};

const makeObjectUrl = (file: File, createObjectUrls: boolean) => {
  if (!createObjectUrls) return '';
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return '';
  return URL.createObjectURL(file);
};

export const classifyInputFile = (relativePath: unknown, file: Pick<File, 'name' | 'type'>): InputFileClassification => {
  const fileName = toSafeString(file?.name);
  if (isMacSystemFile(relativePath, fileName)) return { kind: 'system', reason: 'mac_system_file' };
  if (isSupportedImageName(fileName) || SUPPORTED_MIME_TYPES.has(toSafeString(file?.type).toLowerCase())) {
    return { kind: 'image' };
  }
  return { kind: 'unsupported', reason: 'unsupported_format' };
};

export const canDecodeImage = (file: File, signal?: AbortSignal) => validateImageDecode(file, signal);

const makeItem = (file: File, relativePath: string, createObjectUrls: boolean): LocalImageItem => ({
  id: makeImageId(relativePath, file),
  file,
  name: safeSegment(file.name) ,
  relativePath,
  directoryPath: getDirectoryPath(relativePath),
  size: typeof file.size === 'number' ? file.size : 0,
  type: file.type || getExtension(file.name),
  lastModified: typeof file.lastModified === 'number' ? file.lastModified : 0,
  objectUrl: makeObjectUrl(file, createObjectUrls),
});

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  return '未知错误';
};

const buildResult = async (
  fileEntries: FileWithPath[],
  mode: LocalImageReadMode,
  options: {
    rootName?: string;
    createObjectUrls?: boolean;
    validateDecode?: boolean;
    maxImages?: number;
    signal?: AbortSignal;
    onProgress?: (progress: LocalImageReadProgress) => void;
  } = {}
): Promise<LocalImageReadResult> => {
  const startedAt = performance.now();
  const firstPath = fileEntries[0]?.rawRelativePath || '';
  const rootName = options.rootName || getRootName(firstPath, '本地图片');
  const createObjectUrls = options.createObjectUrls ?? false;
  const validateDecode = options.validateDecode ?? true;
  const maxImages = options.maxImages ?? DEFAULT_MAX_LOCAL_IMAGES;
  const itemsById = new Map<string, LocalImageItem>();
  const directories = new Set<string>();
  const warnings = new Set<string>();
  const errors: string[] = [];
  const firstSystemSkippedPaths: string[] = [];
  const firstSkippedReasons: string[] = [];
  const firstDecodeFailedPaths: string[] = [];
  let skippedCount = 0;
  let systemSkippedCount = 0;
  let invalidImageCount = 0;
  let decodeFailedCount = 0;
  let limitSkippedCount = 0;
  let unsupportedCount = 0;

  const pushReason = (reason: string) => {
    if (firstSkippedReasons.length < 20) firstSkippedReasons.push(reason);
  };

  const imageCandidates: Array<{ file: File; relativePath: string }> = [];
  const reportProgress = (currentPath = '') => {
    options.onProgress?.({
      totalFiles: fileEntries.length,
      imageCount: itemsById.size,
      skippedCount,
      systemSkippedCount,
      invalidImageCount,
      decodeFailedCount,
      limitSkippedCount,
      unsupportedCount,
      folderCount: directories.size,
      currentPath,
    });
  };

  // First phase: classify quickly without decoding, so large folders stay responsive.
  for (const { file, rawRelativePath } of fileEntries) {
    if (options.signal?.aborted) {
      throw new DOMException('任务已取消', 'AbortError');
    }
    const relativePath = normalizeRelativePath(rawRelativePath, rootName);
    const directoryPath = getDirectoryPath(relativePath);
    if (directoryPath) directories.add(directoryPath);

    const classification = classifyInputFile(relativePath, file);

    if (classification.kind === 'system') {
      skippedCount += 1;
      systemSkippedCount += 1;
      if (firstSystemSkippedPaths.length < 20) firstSystemSkippedPaths.push(relativePath);
      pushReason(`${relativePath}:${classification.reason}`);
      continue;
    }

    if (classification.kind === 'unsupported') {
      skippedCount += 1;
      unsupportedCount += 1;
      pushReason(`${relativePath}:${classification.reason}`);
      if (isUnsupportedPreviewName(file.name)) {
        warnings.add('HEIC / HEIF / AVIF 当前不支持浏览器直接预览，已跳过');
      }
      continue;
    }
    imageCandidates.push({ file, relativePath });
  }

  // Second phase: bounded batches of four shared-decoder validations.
  for (let start = 0; start < imageCandidates.length; start += 4) {
    abortIfNeeded(options.signal);
    const batch = imageCandidates.slice(start, start + 4);
    const decoded = await Promise.all(batch.map(async (candidate) => ({
      candidate,
      decodable: !validateDecode || await canDecodeImage(candidate.file, options.signal),
    })));

    for (const { candidate, decodable } of decoded) {
      abortIfNeeded(options.signal);
      if (!decodable) {
        skippedCount += 1;
        decodeFailedCount += 1;
        invalidImageCount += 1;
        if (firstDecodeFailedPaths.length < 20) firstDecodeFailedPaths.push(candidate.relativePath);
        pushReason(`${candidate.relativePath}:decode_failed (无法解码，可能是损坏或伪装的图片)`);
      } else if (itemsById.size >= maxImages) {
        skippedCount += 1;
        limitSkippedCount += 1;
        pushReason(`${candidate.relativePath}:over_limit (已超过 ${maxImages} 张上限)`);
      } else {
        const item = makeItem(candidate.file, candidate.relativePath, createObjectUrls);
        itemsById.set(item.id, item);
      }
      reportProgress(candidate.relativePath);
    }

    if (itemsById.size >= maxImages && start + batch.length < imageCandidates.length) {
      const remaining = imageCandidates.slice(start + batch.length);
      skippedCount += remaining.length;
      limitSkippedCount += remaining.length;
      remaining.slice(0, Math.max(0, 20 - firstSkippedReasons.length)).forEach(({ relativePath }) => {
        pushReason(`${relativePath}:over_limit (已超过 ${maxImages} 张上限)`);
      });
      break;
    }
  }

  const images = [...itemsById.values()].sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'zh-Hans-CN'));
  const firstRelativePaths = images.slice(0, 20).map((item) => item.relativePath);
  if (limitSkippedCount > 0) {
    warnings.add(`已限制前 ${maxImages} 张，避免浏览器内存崩溃（其余 ${limitSkippedCount} 张已跳过）`);
  }
  const report: LocalImageReadReport = {
    mode,
    rootName,
    rawFileCount: fileEntries.length,
    imageCount: images.length,
    skippedCount,
    systemSkippedCount,
    invalidImageCount,
    decodeFailedCount,
    limitSkippedCount,
    unsupportedCount,
    errorCount: errors.length,
    firstRelativePaths,
    firstSystemSkippedPaths,
    firstSkippedReasons,
    firstDecodeFailedPaths,
    firstValidImagePaths: firstRelativePaths,
    errors,
  };

  return {
    images,
    report,
    items: images,
    stats: {
      sourceName: rootName,
      method: mode,
      totalFiles: fileEntries.length,
      imageCount: images.length,
      skippedCount,
      systemSkippedCount,
      invalidImageCount,
      decodeFailedCount,
      limitSkippedCount,
      unsupportedCount,
      folderCount: directories.size,
      errorCount: errors.length,
      durationMs: Math.round(performance.now() - startedAt),
      warnings: [...warnings],
      errors,
      firstSystemSkippedPaths,
      firstSkippedReasons,
      firstDecodeFailedPaths,
    },
  };
};

export async function readImagesFromFileList(
  fileListOrArray: FileList | File[] | ArrayLike<File> | null | undefined,
  mode: 'webkitdirectory' | 'files' = 'files',
  options: LocalImageReadOptions = {}
): Promise<LocalImageReadResult> {
  const files = Array.from(fileListOrArray || []);
  const fileEntries = files.map((file, index) => ({
    file,
    rawRelativePath: getFileRelativePath(file, index),
  }));
  return buildResult(fileEntries, mode, {
    createObjectUrls: options.createObjectUrls ?? false,
    validateDecode: options.validateDecode ?? true,
    maxImages: options.maxImages,
    signal: options.signal,
    onProgress: options.onProgress,
  });
}

export const revokeImageFileItemUrls = (items: ImageFileItem[]) => {
  for (const item of items) {
    if (item.objectUrl) URL.revokeObjectURL(item.objectUrl);
  }
};

export const canUseFileSystemAccessDirectory = () => {
  return typeof window !== 'undefined' && typeof (window as WindowWithDirectoryPicker).showDirectoryPicker === 'function';
};

export const pickSourceDirectory = async () => {
  const picker = (window as WindowWithDirectoryPicker).showDirectoryPicker;
  if (!picker) throw new Error('当前浏览器不支持 File System Access API');
  return picker({ id: 'instagrid-local-image-source', mode: 'read' });
};

async function* iterateDirectoryChildren(directoryHandle: DirectoryHandleLike): AsyncGenerator<FileSystemHandleLike> {
  if (directoryHandle.entries) {
    for await (const [, child] of directoryHandle.entries()) {
      yield child;
    }
    return;
  }

  if (directoryHandle.values) {
    for await (const child of directoryHandle.values()) {
      yield child;
    }
    return;
  }

  throw new Error('当前浏览器返回的文件夹句柄不支持遍历');
}

export async function* walkDirectoryFiles(
  directoryHandle: DirectoryHandleLike,
  options: { signal?: AbortSignal; currentPath?: string[] } = {}
): AsyncGenerator<{ file?: File; relativePath: string; directoryPath: string; error?: string }> {
  abortIfNeeded(options.signal);
  const currentPath = options.currentPath ?? [];

  for await (const child of iterateDirectoryChildren(directoryHandle)) {
    abortIfNeeded(options.signal);
    const childName = safeSegment(child.name);

    if (child.kind === 'directory') {
      if (GENERATED_DIRECTORY_NAMES.has(childName) || childName.endsWith('.photoslibrary')) {
        continue;
      }
      yield* walkDirectoryFiles(child, { signal: options.signal, currentPath: [...currentPath, childName] });
      continue;
    }

    const relativePath = [...currentPath, childName].join('/');
    try {
      const file = await child.getFile();
      yield {
        file,
        relativePath: [...currentPath, safeSegment(file.name || childName)].join('/'),
        directoryPath: currentPath.join('/'),
      };
    } catch (error) {
      yield {
        relativePath,
        directoryPath: currentPath.join('/'),
        error: getErrorMessage(error),
      };
    }
  }
}

export const readImagesFromDirectoryHandle = async (
  directoryHandle: DirectoryHandleLike,
  options: LocalImageReadOptions = {}
): Promise<LocalImageReadResult> => {
  const fileEntries: FileWithPath[] = [];
  const readErrors: string[] = [];

  for await (const entry of walkDirectoryFiles(directoryHandle, { signal: options.signal })) {
    abortIfNeeded(options.signal);
    if (entry.file) {
      fileEntries.push({ file: entry.file, rawRelativePath: entry.relativePath });
    } else {
      readErrors.push(`${entry.relativePath}：${entry.error || '读取失败'}`);
    }
  }

  const result = await buildResult(fileEntries, 'showDirectoryPicker', {
    rootName: safeSegment(directoryHandle.name),
    createObjectUrls: options.createObjectUrls ?? false,
    validateDecode: options.validateDecode ?? true,
    maxImages: options.maxImages,
    signal: options.signal,
    onProgress: options.onProgress,
  });

  if (readErrors.length) {
    result.report.errors.push(...readErrors);
    result.report.errorCount = result.report.errors.length;
    result.report.skippedCount += readErrors.length;
    result.stats.errors = result.report.errors;
    result.stats.errorCount = result.report.errorCount;
    result.stats.skippedCount = result.report.skippedCount;
    result.stats.totalFiles += readErrors.length;
    result.report.rawFileCount += readErrors.length;
  }

  options.onProgress?.({
    totalFiles: result.stats.totalFiles,
    imageCount: result.stats.imageCount,
    skippedCount: result.stats.skippedCount,
    systemSkippedCount: result.stats.systemSkippedCount,
    invalidImageCount: result.stats.invalidImageCount,
    decodeFailedCount: result.stats.decodeFailedCount,
    limitSkippedCount: result.stats.limitSkippedCount,
    unsupportedCount: result.stats.unsupportedCount,
    folderCount: result.stats.folderCount,
    currentPath: result.report.firstRelativePaths[0] || '',
  });

  return result;
};

export const formatFileSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
};
