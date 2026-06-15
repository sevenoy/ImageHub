# 批量水印预览与输出位置不一致修复报告

## 问题原因

批量水印预览图使用 `object-contain` 显示照片。竖图在宽预览框里会左右留出灰色区域。

修复前：

- 水印预览 overlay 的 `left/top` 按整个预览容器宽高计算。
- 拖动时保存的 `position.x/y` 也按整个预览容器计算。
- 最终生成时 `renderWatermarkedImage` 按原始照片像素宽高计算。

因此预览坐标包含了左右灰色留白，但最终输出坐标只在真实照片内计算，导致用户看到水印在预览左下，输出时位置偏到另一处。

## 修改文件

- `components/BatchWatermarkPanel.tsx`

## 修改内容

- 新增 `PreviewImageRect`，测量 `object-contain` 后真实照片在预览容器中的显示区域。
- 给示例底图 `<img>` 添加 `previewImageRef`。
- 用 `ResizeObserver` 和图片 `onLoad` 更新真实照片显示区域。
- 拖动坐标从“预览容器坐标”改成“真实照片显示区域坐标”。
- overlay 的 `left/top` 从百分比容器定位改成基于真实照片显示区域的像素定位。
- 图片水印预览尺寸改为基于真实照片显示宽度计算，与最终输出按原图宽度计算的逻辑一致。

## 未修改内容

- 未修改文件夹读取逻辑。
- 未修改批量处理核心流程。
- 未修改 `renderWatermarkedImage` 的最终 Canvas 渲染算法。
- 未修改 LocalHub 端口和配置。
- 未修改 GitHub Pages 配置。

## 验证结果

- `npx tsc --noEmit`：通过。
- `npm run build`：通过。
- `curl -I http://127.0.0.1:5206/`：HTTP 200。
- Headless Chromium 几何验证：通过。
  - 预览容器宽度：924px。
  - 真实照片显示区域：left 342.01px，width 239.98px，height 360px。
  - overlay 归一化坐标：x 0.84996，y 0.9。
  - 说明 overlay 已绑定到照片本身，而不是灰色预览容器。

## 敏感信息风险

本次只修改前端坐标计算。扫描命中均为既有报告或 `vite.config.ts` 的环境变量占位文本，未发现真实 cookie、token、API key 或密钥值。

## 备份

修改前备份目录：

`_fix_backups/watermark-preview-coordinate-fix-20260615-215222`

## 回滚方式

如需回滚，可从备份目录恢复：

- `components/BatchWatermarkPanel.tsx`
- `utils/batchWatermark.ts`
