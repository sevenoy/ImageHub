import { afterEach, describe, expect, it, vi } from 'vitest';

const drawImage = vi.fn();

vi.mock('../utils/imageDecode', () => ({
  decodeImageForCanvas: vi.fn(async (blob: Blob) => ({
    source: { kind: (blob as File).name },
    width: ({
      'watermark.png': 800,
      'watermark-tall.png': 160,
      'source-landscape.png': 3000,
      'source-portrait.png': 2000,
      'source-wide.png': 4000,
      'source-tall.png': 3000,
      'source-square.png': 2000,
    } as Record<string, number>)[(blob as File).name] ?? 3000,
    height: ({
      'watermark.png': 160,
      'watermark-tall.png': 800,
      'source-landscape.png': 2000,
      'source-portrait.png': 3000,
      'source-wide.png': 3000,
      'source-tall.png': 4000,
      'source-square.png': 2000,
    } as Record<string, number>)[(blob as File).name] ?? 2000,
    close: vi.fn(),
  })),
}));

const originalCreateElement = document.createElement.bind(document);

afterEach(() => {
  document.createElement = originalCreateElement;
  drawImage.mockReset();
});

describe('image-watermark Canvas bounds', () => {
  it('constrains a center-anchored 60% watermark at the lower-left edge', async () => {
    document.createElement = ((tagName: string) => {
      if (tagName !== 'canvas') return originalCreateElement(tagName);
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage, save: vi.fn(), restore: vi.fn(), imageSmoothingEnabled: true, imageSmoothingQuality: 'high', globalAlpha: 1 }),
        toBlob: (callback: BlobCallback, type: string) => callback(new Blob(['test'], { type })),
      } as unknown as HTMLCanvasElement;
    }) as typeof document.createElement;

    const { loadCanvasImage, renderWatermarkedImage } = await import('../utils/batchWatermark');
    const watermark = await loadCanvasImage(new File(['watermark'], 'watermark.png', { type: 'image/png' }));
    await renderWatermarkedImage(
      new File(['source'], 'source.png', { type: 'image/png' }),
      {
        type: 'image',
        position: { x: 0, y: 1 },
        referenceWidth: 1000,
        text: { text: '', fontSize: 42, color: '#ffffff', opacity: 1, shadow: false, outline: false },
        image: { opacity: 1, scalePercent: 60 },
      },
      watermark
    );

    expect(drawImage).toHaveBeenLastCalledWith(watermark.source, 0, 1640, 1800, 360);
  });

  it('keeps the watermark inside every image in a mixed-size batch', async () => {
    document.createElement = ((tagName: string) => {
      if (tagName !== 'canvas') return originalCreateElement(tagName);
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage, save: vi.fn(), restore: vi.fn(), imageSmoothingEnabled: true, imageSmoothingQuality: 'high', globalAlpha: 1 }),
        toBlob: (callback: BlobCallback, type: string) => callback(new Blob(['test'], { type })),
      } as unknown as HTMLCanvasElement;
    }) as typeof document.createElement;

    const { loadCanvasImage, renderWatermarkedImage } = await import('../utils/batchWatermark');
    const watermark = await loadCanvasImage(new File(['watermark'], 'watermark.png', { type: 'image/png' }));
    const config = {
      type: 'image' as const,
      position: { x: 0, y: 1 },
      referenceWidth: 1000,
      text: { text: '', fontSize: 42, color: '#ffffff', opacity: 1, shadow: false, outline: false },
      image: { opacity: 1, scalePercent: 60 },
    };

    for (const [name, expected] of [
      ['source-landscape.png', [0, 1640, 1800, 360]],
      ['source-portrait.png', [0, 2760, 1200, 240]],
      ['source-wide.png', [0, 2520, 2400, 480]],
      ['source-tall.png', [0, 3640, 1800, 360]],
      ['source-square.png', [0, 1760, 1200, 240]],
    ] as const) {
      drawImage.mockReset();
      await renderWatermarkedImage(new File(['source'], name, { type: 'image/png' }), config, watermark);
      expect(drawImage).toHaveBeenLastCalledWith(watermark.source, ...expected);
    }
  });

  it('fits a tall watermark before applying its edge bounds', async () => {
    document.createElement = ((tagName: string) => {
      if (tagName !== 'canvas') return originalCreateElement(tagName);
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage, save: vi.fn(), restore: vi.fn(), imageSmoothingEnabled: true, imageSmoothingQuality: 'high', globalAlpha: 1 }),
        toBlob: (callback: BlobCallback, type: string) => callback(new Blob(['test'], { type })),
      } as unknown as HTMLCanvasElement;
    }) as typeof document.createElement;

    const { loadCanvasImage, renderWatermarkedImage } = await import('../utils/batchWatermark');
    const watermark = await loadCanvasImage(new File(['watermark'], 'watermark-tall.png', { type: 'image/png' }));
    await renderWatermarkedImage(
      new File(['source'], 'source-portrait.png', { type: 'image/png' }),
      {
        type: 'image',
        position: { x: 0, y: 0 },
        referenceWidth: 1000,
        text: { text: '', fontSize: 42, color: '#ffffff', opacity: 1, shadow: false, outline: false },
        image: { opacity: 1, scalePercent: 80 },
      },
      watermark
    );

    expect(drawImage).toHaveBeenLastCalledWith(watermark.source, 0, 0, 600, 3000);
  });
});
