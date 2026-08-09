import { describe, expect, it } from 'vitest';
import {
  clampCenteredWatermarkPosition,
  getCenteredWatermarkBounds,
  getCenterSnapState,
  getFittedImageWatermarkSize,
  shouldRenderCenterGuide,
} from '../utils/watermarkInteraction';

describe('watermark preview center snap', () => {
  it('snaps a drag near the horizontal center using the displayed image width', () => {
    expect(getCenterSnapState(0.52, 200)).toEqual({ x: 0.5, showGuide: true });
  });

  it('does not snap a drag outside the center threshold', () => {
    expect(getCenterSnapState(0.56, 200)).toEqual({ x: 0.56, showGuide: false });
  });

  it('keeps the 1.5% minimum threshold for a wide preview image', () => {
    expect(getCenterSnapState(0.514, 1200)).toEqual({ x: 0.5, showGuide: true });
    expect(getCenterSnapState(0.516, 1200)).toEqual({ x: 0.516, showGuide: false });
  });

  it('renders the guide only while dragging and snapped, with export ignored', () => {
    expect(shouldRenderCenterGuide(true, true)).toBe(true);
    expect(shouldRenderCenterGuide(false, true)).toBe(false);
    expect(shouldRenderCenterGuide(true, false)).toBe(false);
  });
});

describe('center-anchored image-watermark bounds', () => {
  it('keeps a 60% by 18% watermark inside all four image edges', () => {
    expect(getCenteredWatermarkBounds({ imageWidth: 3000, imageHeight: 2000, watermarkWidth: 1800, watermarkHeight: 360 }))
      .toEqual({ minX: 0.3, maxX: 0.7, minY: 0.09, maxY: 0.91 });

    expect(clampCenteredWatermarkPosition(
      { x: 0, y: 1 },
      { imageWidth: 3000, imageHeight: 2000, watermarkWidth: 1800, watermarkHeight: 360 }
    )).toEqual({ x: 0.3, y: 0.91 });
  });

  it('uses the actual height too, so portrait images and tall watermarks get independent y bounds', () => {
    expect(getCenteredWatermarkBounds({ imageWidth: 2000, imageHeight: 3000, watermarkWidth: 1200, watermarkHeight: 2400 }))
      .toEqual({ minX: 0.3, maxX: 0.7, minY: 0.4, maxY: 0.6 });
  });

  it('scales a tall watermark down to the image height before calculating bounds', () => {
    expect(getFittedImageWatermarkSize({
      imageWidth: 2000,
      imageHeight: 3000,
      watermarkAspectRatio: 5,
      scalePercent: 80,
    })).toEqual({ width: 600, height: 3000 });
  });

  it('contains all nine drag targets after clamping', () => {
    const watermarkBox = { imageWidth: 3000, imageHeight: 2000, watermarkWidth: 1800, watermarkHeight: 360 };
    for (const position of [
      { x: 0.5, y: 0.5 }, { x: 0, y: 0 }, { x: 0.5, y: 0 },
      { x: 1, y: 0 }, { x: 1, y: 0.5 }, { x: 1, y: 1 },
      { x: 0.5, y: 1 }, { x: 0, y: 1 }, { x: 0, y: 0.5 },
    ]) {
      const clamped = clampCenteredWatermarkPosition(position, watermarkBox);
      expect(clamped.x).toBeGreaterThanOrEqual(0.3);
      expect(clamped.x).toBeLessThanOrEqual(0.7);
      expect(clamped.y).toBeGreaterThanOrEqual(0.09);
      expect(clamped.y).toBeLessThanOrEqual(0.91);
    }
  });
});
