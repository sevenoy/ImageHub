import { describe, expect, it } from 'vitest';
import {
  getCenterSnapState,
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
