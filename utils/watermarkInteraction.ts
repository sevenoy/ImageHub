export type CenterSnapState = {
  x: number;
  showGuide: boolean;
};

export type WatermarkBox = {
  imageWidth: number;
  imageHeight: number;
  watermarkWidth: number;
  watermarkHeight: number;
};

export type CenteredWatermarkBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export type FittedImageWatermarkSizeOptions = {
  imageWidth: number;
  imageHeight: number;
  watermarkAspectRatio: number;
  scalePercent: number;
};

export type AnchoredWatermarkBox = {
  imageWidth: number;
  imageHeight: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const getFittedImageWatermarkSize = ({
  imageWidth,
  imageHeight,
  watermarkAspectRatio,
  scalePercent,
}: FittedImageWatermarkSizeOptions) => {
  const desiredWidth = Math.max(0, imageWidth * (scalePercent / 100));
  const desiredHeight = desiredWidth * Math.max(watermarkAspectRatio, 0);
  const fitScale = Math.min(
    1,
    imageWidth / Math.max(desiredWidth, 1),
    imageHeight / Math.max(desiredHeight, 1)
  );
  return { width: desiredWidth * fitScale, height: desiredHeight * fitScale };
};

export const getCenteredWatermarkBounds = ({
  imageWidth,
  imageHeight,
  watermarkWidth,
  watermarkHeight,
}: WatermarkBox): CenteredWatermarkBounds => {
  const normalizedWidth = watermarkWidth / Math.max(imageWidth, 1);
  const normalizedHeight = watermarkHeight / Math.max(imageHeight, 1);
  const minX = Math.min(0.5, normalizedWidth / 2);
  const maxX = Math.max(0.5, 1 - normalizedWidth / 2);
  const minY = Math.min(0.5, normalizedHeight / 2);
  const maxY = Math.max(0.5, 1 - normalizedHeight / 2);

  return { minX, maxX, minY, maxY };
};

export const clampAnchoredWatermarkPosition = (
  position: { x: number; y: number },
  { imageWidth, imageHeight, left, right, top, bottom }: AnchoredWatermarkBox
) => ({
  x: clamp(position.x, Math.min(0.5, left / Math.max(imageWidth, 1)), Math.max(0.5, 1 - right / Math.max(imageWidth, 1))),
  y: clamp(position.y, Math.min(0.5, top / Math.max(imageHeight, 1)), Math.max(0.5, 1 - bottom / Math.max(imageHeight, 1))),
});

export const clampCenteredWatermarkPosition = (
  position: { x: number; y: number },
  watermarkBox: WatermarkBox
) => {
  const { minX, maxX, minY, maxY } = getCenteredWatermarkBounds(watermarkBox);
  return {
    x: clamp(position.x, minX, maxX),
    y: clamp(position.y, minY, maxY),
  };
};

export const getCenterSnapState = (nextX: number, previewImageWidth: number): CenterSnapState => {
  const centerSnapThreshold = Math.max(8 / Math.max(previewImageWidth, 1), 0.015);
  const showGuide = Math.abs(nextX - 0.5) <= centerSnapThreshold;

  return { x: showGuide ? 0.5 : nextX, showGuide };
};

export const shouldRenderCenterGuide = (isDragging: boolean, isSnapped: boolean) => isDragging && isSnapped;
