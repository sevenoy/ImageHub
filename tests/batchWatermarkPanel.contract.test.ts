import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const panelSource = readFileSync(resolve(process.cwd(), 'components/BatchWatermarkPanel.tsx'), 'utf8');

describe('batch watermark production UI contract', () => {
  it('uses the requested image-watermark defaults and reset position', () => {
    expect(panelSource).toContain('const defaultImageConfig = { opacity: 0.85, scalePercent: 60 }');
    expect(panelSource).toContain('const defaultPosition = { x: 0.5, y: 0.15 }');
    expect(panelSource).toContain('重置水印位置');
  });

  it('keeps the center guide out of exports', () => {
    expect(panelSource).toContain('data-export-ignore="true"');
    expect(panelSource).toContain('batch-watermark-center-guide');
  });

  it('keeps local watermark storage and production diagnostics separate', () => {
    expect(panelSource).toContain('仅保存在当前浏览器');
    expect(panelSource).toContain('SHOW_FILE_IMPORT_DEBUG && (');
    expect(panelSource).not.toContain('<WatermarkCloudAccount');
  });
});
