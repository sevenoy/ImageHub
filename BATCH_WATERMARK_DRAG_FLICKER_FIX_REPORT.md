# 批量水印拖动闪烁修复报告

日期：2026-06-10

## 1. 实际使用的 skills

- skill-router
- local-project-manager
- legacy-code-safe-change
- frontend-ui-review
- production-reliability-review
- security-secret-scan
- playwright-e2e-check
- handoff

## 2. 问题根因

批量水印预览的水印位置 `position` 被放进 `previewRenderConfig`，而示例图预览加载 effect 依赖 `previewRenderConfig`。用户拖动水印时，每一次 pointermove 都会 `setPosition`，从而触发预览 effect 重新运行。该 effect 会先 revoke 旧 objectURL、清空 `previewImageUrl`、进入 loading/占位分支，再重新生成预览，所以底图在拖动中会反复消失和恢复，看起来就是闪烁。

这不是文件夹读取失败，也不是 5206/5208 端口问题。

## 3. 修改文件

- `components/BatchWatermarkPanel.tsx`
- 新增验证脚本和截图：`_fix_backups/playwright-e2e/`
- 备份目录：`_fix_backups/watermark-drag-flicker-fix-20260610-202224/`

## 4. 每个文件改了什么

### components/BatchWatermarkPanel.tsx

- 移除了示例图预览加载 effect 对 `position`、`textConfig`、`imageConfig`、`watermarkType`、`watermarkFile` 的依赖。
- 示例图预览现在只为当前底图文件创建一个稳定 objectURL，并只在换图、重新加载、清空或卸载时 revoke。
- 不再在拖动水印时调用 `renderWatermarkedImage` 生成合成图预览。
- 水印层改为独立 overlay，拖动时只移动 overlay。
- pointermove 中使用 `requestAnimationFrame` 写入 overlay DOM 的 `left/top`，不在每一帧触发 React 全组件重渲染。
- pointerup 时才 `setPosition` 保存最终位置，批量导出仍使用该最终位置。
- 给底图和水印图设置 `draggable={false}`，并阻止 `dragstart` 冒泡。
- 增加 `data-testid`，用于验证底图节点没有被替换。

### _fix_backups/playwright-e2e/

- 新增临时 headless Chrome 验证脚本和测试图片。
- 验证了文字水印拖动、图片水印拖动、底图节点稳定、底图 src 稳定、占位区不出现、ZIP 导出成功。

## 5. createObjectURL 重复生成问题

修复前：拖动位置变化会间接触发预览 effect，导致反复 create/revoke 示例图预览 URL 或合成图 URL。

修复后：当前示例底图 objectURL 只在加载当前示例图时创建。拖动过程中不会重新 createObjectURL，不会重新 revoke。

## 6. dropzone 误触发问题

批量水印页本身没有独立 dropzone。外层 App 有全局文件拖拽遮罩，但水印拖动使用 pointer events，已阻止 pointer 事件冒泡。本次还补充了 `dragstart` 阻止和 `draggable={false}`，避免浏览器原生拖拽图片或 overlay。

## 7. 底图 img 是否被重新 mount

修复前：拖动会清空 `previewImageUrl`，导致预览分支从 img 切到 loading/占位，再切回 img，底图会被卸载/重建。

修复后：Playwright 验证确认拖动 10 秒后底图 DOM 节点未替换，src 未变化。

## 8. 如何保证底图稳定不闪

- 底图 URL 与水印位置解耦。
- 拖动过程只移动 overlay，不重新生成 canvas 合成图。
- `position` 只在 pointerup 同步最终值。
- 预览 loading/empty 分支不会因 pointermove 被触发。
- 底图 img 没有绑定变化 key，也没有在拖动过程中改变 src。

## 9. build 结果

- `npx tsc --noEmit`：通过。
- `npm run build`：通过。

## 10. 5206 页面验证结果

- `curl -I http://127.0.0.1:5206/` 返回 `HTTP/1.1 200 OK`。
- 5206 监听进程 cwd 确认为：`/Volumes/T7/整理归档_2026-05-31/06_备份归档/网站完美备份/InstaGrid-main`。
- 启动命令包含 `--host 127.0.0.1 --port 5206 --strictPort`。

## 11. 拖动水印 10 秒验证结果

文字水印模式：

- 拖动时长：约 10.17 秒。
- 底图 DOM 节点稳定：true。
- 底图 src 稳定：true。
- 占位/loading 文案出现次数：0。
- ZIP 导出成功：`本地图片水印.zip`。

图片水印模式：

- 拖动时长：约 10.16 秒。
- 底图 DOM 节点稳定：true。
- 底图 src 稳定：true。
- ZIP 导出成功：`本地图片水印.zip`。

验证截图：

- `_fix_backups/playwright-e2e/before-drag.png`
- `_fix_backups/playwright-e2e/after-drag-and-export.png`
- `_fix_backups/playwright-e2e/image-watermark-before-drag.png`
- `_fix_backups/playwright-e2e/image-watermark-after-drag-and-export.png`

## 12. 批量处理是否受影响

未受影响。批量处理仍使用 `renderWatermarkedImage(sourceFile, renderConfig, loadedWatermarkImage, signal)`，其中 `renderConfig.position` 是拖动结束后保存的最终位置。Playwright 验证中点击“开始批量加水印”后成功触发 ZIP 下载。

## 13. 是否影响 5207、5208 或其他 LocalHub 项目

没有。

- 5206：InstaGrid-main，已验证运行。
- 5207：InstaGrid Desktop Backup，保持原状，未停止。
- 5208：无监听，未占用；LocalHub 中该端口属于 Prompt Optimizer Site，不是本次目标。
- 未修改 LocalHub 其他项目。

## 14. 敏感信息风险

执行了文件名和关键词级扫描，未输出任何 token/cookie/API key/密钥值。命中的文件是 README、vite config 和既有报告中的配置关键词引用，未发现本次改动引入敏感信息风险。

## 15. 未完成事项

没有阻塞项。建议用户在真实照片和真实水印图上再手动拖动确认视觉效果，尤其是大图和透明 PNG 水印。
