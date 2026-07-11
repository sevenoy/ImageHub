import { LocalImageReadResult } from './localImageFiles';

export const FILE_IMPORT_DEBUG_VERSION = 'FILE_IMPORT_DEBUG_VERSION_2026_06_09_02';
const viteEnv = (import.meta as ImportMeta & { env?: Record<string, boolean | undefined> }).env || {};
export const SHOW_FILE_IMPORT_DEBUG = viteEnv.DEV === true
  && typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('debug') === '1';

export type NativeFolderInputDebugPage = 'folder-read' | 'batch-watermark';

export type NativeFolderInputDebugFile = {
  name: string;
  type: string;
  size: number;
  webkitRelativePath: string;
};

export type NativeFolderInputDebug = {
  debugVersion: string;
  pageName: NativeFolderInputDebugPage;
  inputChangeFired: boolean;
  rawFileListLength: number;
  frozenFilesLength: number;
  firstFileName: string | null;
  firstFileType: string | null;
  firstFileSize: number | null;
  firstFileWebkitRelativePath: string | null;
  firstTenFiles: NativeFolderInputDebugFile[];
  filteredImageCount: number;
  skippedCount: number;
  systemSkippedCount: number;
  invalidImageCount: number;
  firstSystemSkippedPaths: string[];
  firstSkippedReasons: string[];
  finalStateImagesLength: number;
  currentExampleName: string | null;
  userAgent: string;
  isSecureContext: boolean;
  pageUrl: string;
  inputHasWebkitDirectoryProp: boolean;
};

const getWebkitRelativePath = (file: File) => {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath || '';
};

const hasWebkitDirectory = (input: HTMLInputElement | null) => {
  if (!input) return false;
  return (
    (input as HTMLInputElement & { webkitdirectory?: unknown }).webkitdirectory !== undefined
    || input.hasAttribute('webkitdirectory')
  );
};

export const createNativeFolderInputDebug = (
  pageName: NativeFolderInputDebugPage,
  input: HTMLInputElement | null,
  files: File[],
  result: LocalImageReadResult | null,
  finalStateImagesLength = 0,
  currentExampleName: string | null = null
): NativeFolderInputDebug => {
  const firstFile = files[0] || null;

  return {
    debugVersion: FILE_IMPORT_DEBUG_VERSION,
    pageName,
    inputChangeFired: true,
    rawFileListLength: files.length,
    frozenFilesLength: files.length,
    firstFileName: firstFile?.name || null,
    firstFileType: firstFile?.type || null,
    firstFileSize: firstFile?.size ?? null,
    firstFileWebkitRelativePath: firstFile ? getWebkitRelativePath(firstFile) : null,
    firstTenFiles: files.slice(0, 10).map((file) => ({
      name: file.name,
      type: file.type,
      size: file.size,
      webkitRelativePath: getWebkitRelativePath(file),
    })),
    filteredImageCount: result?.items.length ?? 0,
    skippedCount: result?.stats.skippedCount ?? 0,
    systemSkippedCount: result?.stats.systemSkippedCount ?? 0,
    invalidImageCount: result?.stats.invalidImageCount ?? 0,
    firstSystemSkippedPaths: result?.stats.firstSystemSkippedPaths ?? [],
    firstSkippedReasons: result?.stats.firstSkippedReasons ?? [],
    finalStateImagesLength,
    currentExampleName,
    userAgent: navigator.userAgent,
    isSecureContext: window.isSecureContext,
    pageUrl: window.location.href,
    inputHasWebkitDirectoryProp: hasWebkitDirectory(input),
  };
};

export const createInitialNativeFolderInputDebug = (
  pageName: NativeFolderInputDebugPage,
  input: HTMLInputElement | null
): NativeFolderInputDebug => ({
  debugVersion: FILE_IMPORT_DEBUG_VERSION,
  pageName,
  inputChangeFired: false,
  rawFileListLength: 0,
  frozenFilesLength: 0,
  firstFileName: null,
  firstFileType: null,
  firstFileSize: null,
  firstFileWebkitRelativePath: null,
  firstTenFiles: [],
  filteredImageCount: 0,
  skippedCount: 0,
  systemSkippedCount: 0,
  invalidImageCount: 0,
  firstSystemSkippedPaths: [],
  firstSkippedReasons: [],
  finalStateImagesLength: 0,
  currentExampleName: null,
  userAgent: navigator.userAgent,
  isSecureContext: window.isSecureContext,
  pageUrl: window.location.href,
  inputHasWebkitDirectoryProp: hasWebkitDirectory(input),
});

export const copyNativeFolderInputDebug = async (debug: NativeFolderInputDebug) => {
  const payload = JSON.stringify(debug, null, 2);
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(payload);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = payload;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
};
