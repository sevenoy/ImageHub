import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const componentPath = (name: string) => resolve(root, 'components', name);

describe('professional watermark workbench UI contract', () => {
  it('splits the approved workbench regions into dedicated UI components', () => {
    [
      'BatchWatermarkWorkspace.tsx',
      'WatermarkControlRail.tsx',
      'WatermarkPreviewCanvas.tsx',
      'BatchTaskBar.tsx',
      'ProcessingResultDrawer.tsx',
    ].forEach((name) => expect(existsSync(componentPath(name))).toBe(true));
  });

  it('uses a desktop control rail and a mobile single-column fallback', () => {
    const panel = readFileSync(componentPath('BatchWatermarkPanel.tsx'), 'utf8');
    expect(panel).toContain('lg:grid-cols-[minmax(340px,380px)_minmax(0,1fr)]');
    expect(panel).toContain('<BatchWatermarkWorkspace>');
    expect(panel).toContain('<ProcessingResultDrawer>');
  });
});
