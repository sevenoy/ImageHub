import { ZipBuilder } from './zipBuilder';
import { decodeImageForCanvas, type DecodedImage } from './imageDecode';

export type BatchWatermarkType = 'text' | 'image';

export type BatchImageEntry = {
  id: string;
  file?: File;
  fileHandle?: FileHandleLike;
  name: string;
  relativePath: string;
  directoryPath: string[];
};

export type DirectoryHandleLike = {
  name: string;
  values(): AsyncIterable<FileSystemHandleLike>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandleLike>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>;
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
      values(): AsyncIterable<FileSystemHandleLike>;
      getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandleLike>;
      getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>;
    };

export type FileHandleLike = {
  name?: string;
  getFile?: () => Promise<File>;
  createWritable?: () => Promise<{
    write(data: Blob | BufferSource | string): Promise<void>;
    close(): Promise<void>;
  }>;
};

type WindowWithDirectoryPicker = Window & {
  showDirectoryPicker?: (options?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<DirectoryHandleLike>;
};

export type BatchSelection = {
  entries: BatchImageEntry[];
  skipped: number;
  sourceRootName: string;
  scanned: number;
  limited: boolean;
  warnings: string[];
};

export type TextWatermarkConfig = {
  text: string;
  fontSize: number;
  color: string;
  opacity: number;
  shadow: boolean;
  outline: boolean;
};

export type ImageWatermarkConfig = {
  opacity: number;
  scalePercent: number;
};

export type WatermarkRenderConfig = {
  type: BatchWatermarkType;
  position: { x: number; y: number };
  referenceWidth: number;
  text: TextWatermarkConfig;
  image: ImageWatermarkConfig;
};

export type LoadedCanvasImage = DecodedImage;

export type RenderWatermarkResult = {
  blob: Blob;
  extension: string;
  warning?: string;
};

export type SelectionLimitOptions = {
  maxImages?: number;
  maxScannedFiles?: number;
  maxScannedDirectories?: number;
  onEntry?: (entry: BatchImageEntry) => void;
  onProgress?: (progress: { scanned: number; accepted: number; skipped: number; directories: number }) => void;
};

export type OutputPathOptions = {
  fileSuffix: string;
  suffixSubfolders: boolean;
  preserveStructure: boolean;
};

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
export const DEFAULT_MAX_BATCH_IMAGES = 1000;
export const DEFAULT_MAX_SCANNED_FILES = 20000;
export const DEFAULT_MAX_SCANNED_DIRECTORIES = 5000;
const PROGRESS_YIELD_EVERY_FILES = 25;
const SKIPPED_DIRECTORY_NAMES = new Set([
  '.git',
  '.next',
  '.nuxt',
  '.svelte-kit',
  'node_modules',
  'dist',
  'build',
  '__MACOSX',
]);

const safeName = (name: string) => name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim() || '未命名';

const getExtension = (name: string) => {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
};

const isSkippableMacFile = (name: string) => name === '.DS_Store' || name.startsWith('._');

const stripExtension = (name: string) => {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(0, dot) : name;
};

const abortIfNeeded = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw new DOMException('任务已取消', 'AbortError');
  }
};

export const waitForBrowser = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0));

export const canUseFileSystemAccess = () => {
  return typeof window !== 'undefined' && typeof (window as WindowWithDirectoryPicker).showDirectoryPicker === 'function';
};

export const pickDirectory = async (mode: 'read' | 'readwrite') => {
  const picker = (window as WindowWithDirectoryPicker).showDirectoryPicker;
  if (!picker) throw new Error('当前浏览器不支持安全文件夹读取');
  return picker({
    id: mode === 'read' ? 'instagrid-watermark-source' : 'instagrid-watermark-output',
    mode,
  });
};

export const isSupportedImageFile = (file: File) => {
  if (isSkippableMacFile(file.name)) return false;
  if (file.type && ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return true;
  return IMAGE_EXTENSIONS.has(getExtension(file.name));
};

export const isSupportedImageName = (name: string) => !isSkippableMacFile(name) && IMAGE_EXTENSIONS.has(getExtension(name));

const getFileRelativePath = (file: File) => {
  const maybeRelativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  return maybeRelativePath || file.name;
};

export const getEntryFile = async (entry: BatchImageEntry, signal?: AbortSignal) => {
  abortIfNeeded(signal);
  if (entry.file) return entry.file;
  if (entry.fileHandle?.getFile) {
    const file = await entry.fileHandle.getFile();
    abortIfNeeded(signal);
    return file;
  }
  throw new Error('无法读取图片文件');
};

export const makeSelectionFromFiles = (fileList: ArrayLike<File>): BatchSelection => {
  let skipped = 0;
  const entries: BatchImageEntry[] = [];
  const firstRelativePath = fileList.length ? getFileRelativePath(fileList[0]) : '';
  const firstRootName = firstRelativePath.includes('/') ? safeName(firstRelativePath.split('/')[0]) : '批量图片';

  for (let index = 0; index < fileList.length && entries.length < DEFAULT_MAX_BATCH_IMAGES; index += 1) {
    const file = fileList[index];
    if (!isSupportedImageFile(file)) {
      skipped += 1;
      continue;
    }

    const name = safeName(file.name);
    const relativePath = getFileRelativePath(file);
    const relativeParts = relativePath.split('/').filter(Boolean).map(safeName);
    const hasFolderPath = relativeParts.length > 1;
    const directoryPath = hasFolderPath ? relativeParts.slice(1, -1) : [];
    entries.push({
      id: `file-${Date.now()}-${index}-${name}`,
      file,
      name,
      relativePath: hasFolderPath ? [...directoryPath, name].join('/') : name,
      directoryPath,
    });
  }

  const limited = fileList.length > DEFAULT_MAX_BATCH_IMAGES;
  return {
    entries,
    skipped,
    scanned: Math.min(fileList.length, DEFAULT_MAX_BATCH_IMAGES),
    sourceRootName: firstRootName,
    limited,
    warnings: limited ? [`已达到安全读取上限：最多 ${DEFAULT_MAX_BATCH_IMAGES} 张图片`] : [],
  };
};

export const collectImagesFromDirectory = async (
  directoryHandle: DirectoryHandleLike,
  signal?: AbortSignal,
  options: SelectionLimitOptions = {}
): Promise<BatchSelection> => {
  const maxImages = options.maxImages ?? DEFAULT_MAX_BATCH_IMAGES;
  const maxScannedFiles = options.maxScannedFiles ?? DEFAULT_MAX_SCANNED_FILES;
  const maxScannedDirectories = options.maxScannedDirectories ?? DEFAULT_MAX_SCANNED_DIRECTORIES;
  let skipped = 0;
  let scanned = 0;
  let directories = 0;
  let limited = false;
  const warnings: string[] = [];
  const entries: BatchImageEntry[] = [];
  let skippedGeneratedDirectories = 0;
  const queue: Array<{ handle: DirectoryHandleLike; directoryPath: string[] }> = [
    { handle: directoryHandle, directoryPath: [] },
  ];

  while (queue.length > 0) {
    abortIfNeeded(signal);
    const current = queue.shift();
    if (!current) break;

    for await (const child of current.handle.values()) {
      abortIfNeeded(signal);
      if (limited || scanned >= maxScannedFiles || entries.length >= maxImages) {
        limited = true;
        queue.length = 0;
        break;
      }

      if (child.kind === 'directory') {
        const childName = safeName(child.name);
        if (SKIPPED_DIRECTORY_NAMES.has(childName) || childName.endsWith('.photoslibrary')) {
          skippedGeneratedDirectories += 1;
        } else {
          directories += 1;
          if (directories >= maxScannedDirectories) {
            limited = true;
            queue.length = 0;
            break;
          }
          queue.push({ handle: child, directoryPath: [...current.directoryPath, childName] });
        }
        continue;
      }

      scanned += 1;

      if (!isSupportedImageName(child.name)) {
        skipped += 1;
      } else {
        const name = safeName(child.name);
        entries.push({
          id: `dir-${Date.now()}-${entries.length}-${name}`,
          fileHandle: child,
          name,
          relativePath: [...current.directoryPath, name].join('/'),
          directoryPath: current.directoryPath,
        });
        options.onEntry?.(entries[entries.length - 1]);
      }

      if (scanned % PROGRESS_YIELD_EVERY_FILES === 0) {
        options.onProgress?.({ scanned, accepted: entries.length, skipped, directories });
        await waitForBrowser();
      }
    }

    options.onProgress?.({ scanned, accepted: entries.length, skipped, directories });
    await waitForBrowser();
  }

  options.onProgress?.({ scanned, accepted: entries.length, skipped, directories });

  if (limited) {
    warnings.push(`已达到安全读取上限：最多 ${maxImages} 张图片 / 扫描 ${maxScannedFiles} 个文件 / ${maxScannedDirectories} 个文件夹`);
  }
  if (skippedGeneratedDirectories) {
    warnings.push(`已跳过 ${skippedGeneratedDirectories} 个常见生成目录或系统图库包，避免扫描卡死`);
  }

  return {
    entries,
    skipped,
    sourceRootName: safeName(directoryHandle.name),
    scanned,
    limited,
    warnings,
  };
};

export const loadCanvasImage = (blob: Blob, signal?: AbortSignal): Promise<LoadedCanvasImage> =>
  decodeImageForCanvas(blob, signal);

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('图片导出失败'));
      },
      type,
      quality
    );
  });

const getOutputFormat = (file: File) => {
  const extension = getExtension(file.name);
  if (extension === 'png' || file.type === 'image/png') {
    return { mime: 'image/png', extension: 'png', quality: undefined };
  }
  if (extension === 'webp' || file.type === 'image/webp') {
    return { mime: 'image/webp', extension: 'webp', quality: 0.95 };
  }
  if (extension === 'jpeg') {
    return { mime: 'image/jpeg', extension: 'jpeg', quality: 0.95 };
  }
  return { mime: 'image/jpeg', extension: 'jpg', quality: 0.95 };
};

const getReadableContrastStroke = (hexColor: string) => {
  const normalized = hexColor.replace('#', '');
  if (normalized.length !== 6) return 'rgba(15, 23, 42, 0.75)';
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.65 ? 'rgba(15, 23, 42, 0.72)' : 'rgba(255, 255, 255, 0.82)';
};

export const renderWatermarkedImage = async (
  file: File,
  config: WatermarkRenderConfig,
  watermarkImage?: LoadedCanvasImage,
  signal?: AbortSignal
): Promise<RenderWatermarkResult> => {
  abortIfNeeded(signal);
  const sourceImage = await loadCanvasImage(file, signal);

  try {
    abortIfNeeded(signal);
    const canvas = document.createElement('canvas');
    canvas.width = sourceImage.width;
    canvas.height = sourceImage.height;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('当前浏览器无法创建 Canvas');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sourceImage.source, 0, 0, canvas.width, canvas.height);

    const x = config.position.x * canvas.width;
    const y = config.position.y * canvas.height;

    if (config.type === 'text') {
      const fontSize = Math.max(8, Math.round((config.text.fontSize / Math.max(config.referenceWidth, 1)) * canvas.width));
      ctx.save();
      ctx.globalAlpha = config.text.opacity;
      ctx.font = `700 ${fontSize}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = config.text.color;

      if (config.text.shadow) {
        ctx.shadowColor = 'rgba(15, 23, 42, 0.42)';
        ctx.shadowBlur = Math.max(3, fontSize * 0.12);
        ctx.shadowOffsetX = Math.max(1, fontSize * 0.035);
        ctx.shadowOffsetY = Math.max(1, fontSize * 0.05);
      }

      if (config.text.outline) {
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(2, fontSize * 0.08);
        ctx.strokeStyle = getReadableContrastStroke(config.text.color);
        ctx.strokeText(config.text.text, x, y);
      }

      ctx.fillText(config.text.text, x, y);
      ctx.restore();
    } else {
      if (!watermarkImage) throw new Error('请先上传水印图片');
      const width = canvas.width * (config.image.scalePercent / 100);
      const height = width * (watermarkImage.height / watermarkImage.width);
      ctx.save();
      ctx.globalAlpha = config.image.opacity;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(watermarkImage.source, x - width / 2, y - height / 2, width, height);
      ctx.restore();
    }

    const format = getOutputFormat(file);
    let blob = await canvasToBlob(canvas, format.mime, format.quality);
    let extension = format.extension;
    let warning: string | undefined;

    if (format.mime === 'image/webp' && blob.type !== 'image/webp') {
      blob = await canvasToBlob(canvas, 'image/png');
      extension = 'png';
      warning = `${file.name} 的 WebP 导出不可用，已改为 PNG`;
    }

    canvas.width = 0;
    canvas.height = 0;

    return { blob, extension, warning };
  } finally {
    sourceImage.close();
  }
};

export const makeOutputRelativePath = (
  entry: BatchImageEntry,
  extension: string,
  options: OutputPathOptions
) => {
  const directories = options.preserveStructure
    ? entry.directoryPath.map((segment) => (options.suffixSubfolders ? `${segment}水印` : segment))
    : [];
  const baseName = safeName(stripExtension(entry.name));
  const suffix = options.fileSuffix || '';
  const fileName = `${baseName}${suffix}.${extension}`;
  return [...directories, fileName].join('/');
};

const splitOutputPath = (relativePath: string) => {
  const parts = relativePath.split('/').filter(Boolean);
  return {
    directories: parts.slice(0, -1).map(safeName),
    fileName: safeName(parts[parts.length - 1] || 'image.jpg'),
  };
};

const fileExists = async (directory: DirectoryHandleLike, fileName: string) => {
  try {
    await directory.getFileHandle(fileName);
    return true;
  } catch {
    return false;
  }
};

const getAvailableFileName = async (directory: DirectoryHandleLike, fileName: string) => {
  const extension = getExtension(fileName);
  const baseName = stripExtension(fileName);
  let candidate = fileName;
  let index = 2;

  while (await fileExists(directory, candidate)) {
    candidate = `${baseName}_${index}.${extension}`;
    index += 1;
  }

  return candidate;
};

export const ensureDirectory = async (root: DirectoryHandleLike, pathSegments: string[]) => {
  let current = root;
  for (const segment of pathSegments) {
    current = await current.getDirectoryHandle(safeName(segment), { create: true });
  }
  return current;
};

export const writeBlobToDirectory = async (
  root: DirectoryHandleLike,
  relativePath: string,
  blob: Blob
) => {
  const { directories, fileName } = splitOutputPath(relativePath);
  const directory = await ensureDirectory(root, directories);
  const availableName = await getAvailableFileName(directory, fileName);
  const fileHandle = await directory.getFileHandle(availableName, { create: true });
  if (!fileHandle.createWritable) throw new Error('当前输出文件夹没有写入权限');
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
  return [...directories, availableName].join('/');
};

export const makeUniqueZipPath = (path: string, usedPaths: Set<string>) => {
  const parts = path.split('/');
  const fileName = parts.pop() || 'image.jpg';
  const extension = getExtension(fileName);
  const baseName = stripExtension(fileName);
  let candidate = [...parts, fileName].join('/');
  let index = 2;

  while (usedPaths.has(candidate)) {
    candidate = [...parts, `${baseName}_${index}.${extension}`].join('/');
    index += 1;
  }

  usedPaths.add(candidate);
  return candidate;
};

export const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const createZipBuilder = () => new ZipBuilder();
