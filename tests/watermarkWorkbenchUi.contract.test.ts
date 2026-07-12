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
    expect(panel).toContain('lg:grid-cols-[minmax(360px,390px)_minmax(0,1fr)]');
    expect(panel).toContain('<BatchWatermarkWorkspace>');
    expect(panel).toContain('<ProcessingResultDrawer>');
  });

  it('keeps the result drawer independently dismissible without clearing results', () => {
    const panel = readFileSync(componentPath('BatchWatermarkPanel.tsx'), 'utf8');
    expect(panel).toContain('const [resultDrawerOpen, setResultDrawerOpen] = useState(false)');
    expect(panel).toContain('aria-label="收起处理结果"');
    expect(panel).toContain('aria-label="关闭处理结果"');
    expect(panel).toContain('onClick={() => setResultDrawerOpen(false)}');
    expect(panel).not.toContain('onClick={() => setOutputSummary(null)}');
  });

  it('anchors the drawer to the desktop preview workspace instead of the control rail', () => {
    const drawer = readFileSync(componentPath('ProcessingResultDrawer.tsx'), 'utf8');
    expect(drawer).toContain('lg:absolute lg:inset-x-0 lg:bottom-0');
    expect(drawer).not.toContain('lg:left-[380px]');
  });
});
