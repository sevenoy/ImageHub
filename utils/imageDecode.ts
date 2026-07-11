export type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close(): void;
};

type PreviewOptions = {
  maxDimension?: number;
  signal?: AbortSignal;
};

const abortError = () => new DOMException('任务已取消', 'AbortError');

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw abortError();
};

const isAbortError = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

const decodeWithHtmlImage = (blob: Blob, signal?: AbortSignal): Promise<DecodedImage> => {
  if (typeof Image === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error('当前浏览器不支持图片解码');
  }

  throwIfAborted(signal);
  const objectUrl = URL.createObjectURL(blob);

  return new Promise<DecodedImage>((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    let settled = false;
    let closed = false;

    const revoke = () => {
      if (closed) return;
      closed = true;
      URL.revokeObjectURL(objectUrl);
    };
    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
      image.onload = null;
      image.onerror = null;
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      revoke();
      reject(error);
    };
    const onAbort = () => fail(abortError());

    image.onload = () => {
      if (settled) return;
      if (signal?.aborted) {
        fail(abortError());
        return;
      }
      settled = true;
      cleanup();
      resolve({
        source: image,
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
        close: revoke,
      });
    };
    image.onerror = () => fail(new Error('The source image cannot be decoded'));
    signal?.addEventListener('abort', onAbort, { once: true });
    image.src = objectUrl;
  });
};

export async function decodeImageForCanvas(blob: Blob, signal?: AbortSignal): Promise<DecodedImage> {
  throwIfAborted(signal);

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      if (signal?.aborted) {
        bitmap.close();
        throw abortError();
      }
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch (error) {
      if (isAbortError(error)) throw error;
      // Browser codecs differ; preserve a compatible HTMLImageElement fallback.
    }
  }

  return decodeWithHtmlImage(blob, signal);
}

export async function validateImageDecode(blob: Blob, signal?: AbortSignal): Promise<boolean> {
  try {
    const decoded = await decodeImageForCanvas(blob, signal);
    decoded.close();
    return true;
  } catch (error) {
    if (isAbortError(error)) throw error;
    return false;
  }
}

const canvasToBlob = (canvas: HTMLCanvasElement, type: string) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('无法生成图片预览'));
    }, type, 0.92);
  });

export async function createImagePreviewBlob(blob: Blob, options: PreviewOptions = {}): Promise<Blob> {
  throwIfAborted(options.signal);
  const decoded = await decodeImageForCanvas(blob, options.signal);

  try {
    throwIfAborted(options.signal);
    if (typeof document === 'undefined') throw new Error('当前环境无法生成图片预览');
    const maxDimension = options.maxDimension ?? 1600;
    const scale = Math.min(1, maxDimension / Math.max(decoded.width, decoded.height, 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(decoded.width * scale));
    canvas.height = Math.max(1, Math.round(decoded.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前浏览器无法生成图片预览');
    context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
    const type = blob.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const preview = await canvasToBlob(canvas, type);
    canvas.width = 0;
    canvas.height = 0;
    throwIfAborted(options.signal);
    return preview;
  } finally {
    decoded.close();
  }
}
