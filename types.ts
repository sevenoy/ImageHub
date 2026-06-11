export interface CollageItem {
  id: string;
  url: string;
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