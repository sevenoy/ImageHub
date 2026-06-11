# Batch Watermark Preview Fix Report

## 1. 问题原因

批量水印页的读取阶段已经改为 `createObjectUrls:false`，真实照片会进入 `entries` state，但示例图预览仍需要在用户查看当前示例图时临时创建可显示的 URL。

旧逻辑在导入后不会自动加载示例图预览，按钮点击后的错误也只写入通用错误列表，示例区域仍可能停留在“已导入图片，点击加载示例图预览”的占位状态，用户看起来像照片没有进入预览。

## 2. 为什么读取成功但示例图不显示

读取链路已经成功：`readImagesFromFileList(..., { createObjectUrls:false })` 返回的 `ImageFileItem.file` 被映射到 `BatchImageEntry.file`，`entries` 有真实照片。

示例图显示链路缺少稳定的“当前 file -> 临时 objectURL -> decode -> 预览 URL -> revoke”状态管理；因此读取成功不等于预览区域已经有可用 `src`。

## 3. 是否因为 `image.url` 不再预生成导致

是，根因与不再预生成 URL 有关，但修复没有回退到全量 objectURL。

现在预览不依赖读取阶段的 URL，也不依赖 `image.url`。它直接使用当前 `BatchImageEntry.file`，只为当前示例图创建临时 URL。

## 4. 修改文件

- `components/BatchWatermarkPanel.tsx`
- `BATCH_WATERMARK_PREVIEW_FIX_REPORT.md`

备份目录：

- `_fix_backups/batch-preview-fix-20260610-141539/`

## 5. 如何只给当前示例图创建 objectURL

示例图加载时：

1. 通过 `getEntryFile(currentPreviewEntry, signal)` 取得当前示例图的 `File`。
2. 为当前 file 创建一个临时 `decodeUrl`。
3. 用 `Image.decode()` 验证当前文件可解码。
4. 立即 revoke `decodeUrl`。
5. 使用现有 `renderWatermarkedImage(...)` 生成当前水印预览 blob。
6. 只为这个预览 blob 创建 `previewImageUrl`。

如果选择的是图片水印但还没有上传水印图，则只为当前原图创建一个预览 URL，并在画面上保留“上传水印图”的提示。

## 6. 是否有 revoke

有。

- `decodeUrl` 在 decode 成功后立即 revoke。
- decode 或渲染失败时会 revoke 已创建的临时 URL。
- 切换示例图、重新加载、清空图片、组件卸载时会通过 `previewObjectUrlRef` revoke 当前预览 URL。
- 水印图片自身的 objectURL 仍在替换和卸载时 revoke。

## 7. tsc 结果

通过。

命令：

```bash
npx tsc --noEmit
```

结果：exit 0。

## 8. build 结果

通过。

命令：

```bash
npm run build
```

结果：exit 0，Vite build 成功。

## 9. 用户如何重新测试

1. 打开 `http://127.0.0.1:5208/`。
2. 进入“批量水印”页。
3. 选择包含真实照片和 `._*` 文件的文件夹。
4. 检查统计区：
   - 原始文件：20 个
   - 已读取照片：10 张
   - 已跳过系统文件：10 个
   - 坏图跳过：0 个
   - 超出上限跳过：0 个
5. 检查示例图下拉框显示真实照片名，例如 `DSC08517.jpg`。
6. 导入后示例图会自动加载；如果没有自动出现，可点击“加载示例图预览”。
7. 点击“开始批量加水印”，确认真实照片进入处理流程。

自动化限制：原生系统文件夹 picker 不能由 headless browser 自动选择真实本地文件夹。本次已通过逻辑测试、源码契约检查、TypeScript、build、以及 5208 页面 headless smoke 验证。

## 10. 是否发现敏感信息风险

未发现新的敏感信息风险。

扫描结果仅发现：

- `vite.config.ts` 中 `GEMINI_API_KEY` 是环境变量占位注入，没有实际密钥值。
- `README.md` 提到 `.env.local` 配置方式。
- 旧报告中有相同说明。

本次没有读取、输出、提交 Cookie、token 或实际密钥值。

## 11. 额外验证

逻辑测试：

```bash
node --experimental-strip-types _fix_backups/test-instagrid-folder-read-fix.mjs
```

结果：23 passed, 0 failed。

批量页源码契约检查：

- 没有 `createObjectUrls:true`。
- 文件选择、文件夹选择、showDirectoryPicker 都使用 `createObjectUrls:false`。
- 示例图预览通过 `getEntryFile(currentPreviewEntry, signal)` 使用当前 `file`。
- 预览 decode URL 有 revoke。
- 批量处理阶段通过 `getEntryFile(entry, signal)` 使用当前图片文件，不依赖 `image.url`。

浏览器 smoke：

- `http://127.0.0.1:5208/` 返回 HTTP 200。
- 使用 1 个 headless Chrome 实例截图成功。
- 截图路径：`_fix_backups/playwright-smoke/batch-watermark-page-5208.png`。
