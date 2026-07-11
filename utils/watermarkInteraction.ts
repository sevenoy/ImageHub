export type CenterSnapState = {
  x: number;
  showGuide: boolean;
};

export const getCenterSnapState = (nextX: number, previewImageWidth: number): CenterSnapState => {
  const centerSnapThreshold = Math.max(8 / Math.max(previewImageWidth, 1), 0.015);
  const showGuide = Math.abs(nextX - 0.5) <= centerSnapThreshold;

  return { x: showGuide ? 0.5 : nextX, showGuide };
};

export const shouldRenderCenterGuide = (isDragging: boolean, isSnapped: boolean) => isDragging && isSnapped;
