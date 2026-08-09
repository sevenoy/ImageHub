import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('responsive workbench shell contract', () => {
  it('uses one shared tool switcher for both active tools', () => {
    expect(existsSync(resolve(root, 'components/ToolModeSwitcher.tsx'))).toBe(true);
    const app = source('App.tsx');
    const switcher = source('components/ToolModeSwitcher.tsx');

    expect(app).toContain('<ToolModeSwitcher activeView={activeView} onChange={setActiveView} />');
    expect(switcher).toContain('aria-label="工具模式"');
    expect(switcher).toContain('多图合成');
    expect(switcher).toContain('批量水印');
  });

  it('shares the measured fixed taskbar height with the scroll content and result drawer', () => {
    const panel = source('components/BatchWatermarkPanel.tsx');
    const taskbar = source('components/BatchTaskBar.tsx');
    const drawer = source('components/ProcessingResultDrawer.tsx');

    expect(panel).toContain('--batch-taskbar-height');
    expect(panel).toContain('<BatchTaskBar onHeightChange={setTaskBarHeight}>');
    expect(taskbar).toContain('ResizeObserver');
    expect(taskbar).toContain('data-testid="batch-taskbar"');
    expect(drawer).toContain('var(--batch-taskbar-height)');
  });

  it('keeps saved watermark cards in an independently scrollable single row', () => {
    const panel = source('components/BatchWatermarkPanel.tsx');

    expect(panel).toContain('data-testid="batch-watermark-library"');
    expect(panel).toContain('overflow-x-auto');
    expect(panel).toContain('flex-nowrap');
    expect(panel).toContain('shrink-0');
  });
});
