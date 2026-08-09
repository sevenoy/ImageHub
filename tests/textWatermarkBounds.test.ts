import { afterEach, describe, expect, it, vi } from 'vitest';
import { getFittedTextWatermarkFontSize } from '../utils/batchWatermark';

const fillText = vi.fn();
const measureText = vi.fn(() => ({
  width: 1200,
  actualBoundingBoxLeft: 600,
  actualBoundingBoxRight: 600,
  actualBoundingBoxAscent: 100,
  actualBoundingBoxDescent: 100,
}));

vi.mock('../utils/imageDecode', () => ({
  decodeImageForCanvas: vi.fn(async () => ({
    source: { kind: 'source' },
    width: 3000,
    height: 2000,
    close: vi.fn(),
  })),
}));

const originalCreateElement = document.createElement.bind(document);

afterEach(() => {
  document.createElement = originalCreateElement;
  fillText.mockReset();
  measureText.mockClear();
});

describe('text-watermark Canvas bounds', () => {
  it('reduces an oversized measured text watermark before clamping its position', () => {
    const context = {
      font: '',
      measureText: vi.fn(() => ({
        width: 4000,
        actualBoundingBoxLeft: 2000,
        actualBoundingBoxRight: 2000,
        actualBoundingBoxAscent: 200,
        actualBoundingBoxDescent: 200,
      })),
    } as unknown as CanvasRenderingContext2D;

    expect(getFittedTextWatermarkFontSize(context, {
      text: 'TEST WATERMARK 2026', fontSize: 140, color: '#ffffff', opacity: 1, shadow: false, outline: false,
    }, 420, 3000, 2000).fontSize).toBeLessThan(420);
  });

  it('uses measured glyph bounds to keep a center-anchored text watermark inside the lower-left edge', async () => {
    document.createElement = ((tagName: string) => {
      if (tagName !== 'canvas') return originalCreateElement(tagName);
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: vi.fn(),
          fillText,
          measureText,
          save: vi.fn(),
          restore: vi.fn(),
          imageSmoothingEnabled: true,
          imageSmoothingQuality: 'high',
          globalAlpha: 1,
        }),
        toBlob: (callback: BlobCallback, type: string) => callback(new Blob(['test'], { type })),
      } as unknown as HTMLCanvasElement;
    }) as typeof document.createElement;

    const { renderWatermarkedImage } = await import('../utils/batchWatermark');
    await renderWatermarkedImage(
      new File(['source'], 'source.png', { type: 'image/png' }),
      {
        type: 'text',
        position: { x: 0, y: 1 },
        referenceWidth: 1000,
        text: { text: 'TEST WATERMARK 2026', fontSize: 42, color: '#ffffff', opacity: 1, shadow: false, outline: false },
        image: { opacity: 1, scalePercent: 60 },
      }
    );

    expect(measureText).toHaveBeenCalledWith('TEST WATERMARK 2026');
    expect(fillText).toHaveBeenLastCalledWith('TEST WATERMARK 2026', 600, 1900);
  });
});
