export interface CollageItem {
  id: string;
  /** Full-resolution source (local blob URL or remote URL). Always used for export. */
  url: string;
  /** Lightweight local preview used by the editor so big photos are not re-decoded on every change. */
  previewUrl?: string;
  /** True while the preview is being generated (editor shows a placeholder). */
  loading?: boolean;
}

export enum LayoutType {
  GRID_2X2 = '2x2',
  GRID_3X3 = '3x3',
}

export interface GridConfig {
  rows: number;
  cols: number;
  gap: number; // in pixels
}