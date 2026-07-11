// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifyInputFile,
  readImagesFromFileList,
} from '../utils/localImageFiles';
import {
  createImagePreviewBlob,
  decodeImageForCanvas,
  validateImageDecode,
} from '../utils/imageDecode';

const makeFile = (name: string, type = 'image/jpeg', content = 'image-data') =>
  new File([content], name, { type, lastModified: 1 });

const setRelativePath = (file: File, path: string) => {
  Object.defineProperty(file, 'webkitRelativePath', { value: path });
  return file;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('local image classification', () => {
  it.each([
    ['real/a.jpg', 'a.jpg'],
    ['real/._a.jpg', '._a.jpg'],
    ['__MACOSX/._a.jpg', '._a.jpg'],
    ['.DS_Store', '.DS_Store'],
    ['Thumbs.db', 'Thumbs.db'],
  ])('classifies %s before mime or extension checks', (path, name) => {
    const file = setRelativePath(makeFile(name), path);
    const expected = path === 'real/a.jpg' ? 'image' : 'system';
    expect(classifyInputFile(path, file)).toMatchObject({ kind: expected });
  });

  it('treats a macOS sidecar as system data even when it claims image/jpeg', () => {
    const file = setRelativePath(makeFile('._photo.jpg', 'image/jpeg'), 'album/._photo.jpg');
    expect(classifyInputFile('album/._photo.jpg', file)).toMatchObject({ kind: 'system' });
  });

  it('counts 100 real photos and 100 macOS sidecars without reporting errors', async () => {
    const files = Array.from({ length: 100 }, (_, index) => [
      setRelativePath(makeFile(`photo-${index}.JPG`), `album/photo-${index}.JPG`),
      setRelativePath(makeFile(`._photo-${index}.JPG`), `album/._photo-${index}.JPG`),
    ]).flat();

    const result = await readImagesFromFileList(files, 'webkitdirectory', {
      validateDecode: false,
    });

    expect(result.report.rawFileCount).toBe(200);
    expect(result.items).toHaveLength(100);
    expect(result.stats.imageCount).toBe(100);
    expect(result.stats.systemSkippedCount).toBe(100);
    expect(result.stats.errorCount).toBe(0);
    expect(result.stats.errors).toEqual([]);
  });

  it('keeps an uppercase extension with an empty MIME type eligible for decode', async () => {
    const result = await readImagesFromFileList([makeFile('PHOTO.JPG', '', 'image')], 'files', {
      validateDecode: false,
    });

    expect(result.items).toHaveLength(1);
  });

  it('counts an undecodable photo as invalid instead of a runtime error', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('cannot decode')));
    class FailingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      decoding = 'async';
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal('Image', FailingImage);

    const result = await readImagesFromFileList([makeFile('broken.jpg')], 'files');

    expect(result.items).toHaveLength(0);
    expect(result.stats.invalidImageCount).toBe(1);
    expect(result.stats.decodeFailedCount).toBe(1);
    expect(result.stats.errorCount).toBe(0);
  });
});

describe('shared image decoder', () => {
  it('uses the same decoder for validation and releases ImageBitmap resources', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 40, height: 20, close }));
    const file = makeFile('valid.jpg');

    expect(await validateImageDecode(file)).toBe(true);
    const decoded = await decodeImageForCanvas(file);
    expect(decoded.width).toBe(40);
    decoded.close();
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('builds a bounded preview blob through the shared decoder', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 4000, height: 2000, close }));
    const toBlob = vi.fn((callback: BlobCallback) => callback(new Blob(['preview'], { type: 'image/jpeg' })));
    vi.spyOn(document, 'createElement').mockReturnValue({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: vi.fn() }),
      toBlob,
    } as unknown as HTMLCanvasElement);

    const preview = await createImagePreviewBlob(makeFile('valid.jpg'), { maxDimension: 1600 });

    expect(preview.type).toBe('image/jpeg');
    expect(close).toHaveBeenCalledOnce();
  });
});
