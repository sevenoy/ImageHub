# ImageHub 文件夹导入与云端水印修复报告

## 1. 本轮结论

已在本地修复导入、统计和云端水印的前端基础：导入验证、示例预览和 Canvas 输出共享一个解码器；macOS 系统元数据正常忽略且不再计为错误；水印库保留 IndexedDB 离线缓存，并在配置与登录齐备时可通过 Supabase 私有 Storage 与 RLS 同步。

## 2. 当前阶段

`IMAGEHUB-FOLDER-IMPORT-COUNT-CLOUD-WATERMARK-V1`

## 3. 命令档位

`RELEASE_GATE`（仅本地分支、代码、SQL 草案与验证）

## 4. 模型

GPT-5 Codex；请求中建议的 Pixel codexpro 不在当前运行环境。

## 5. 项目路径

`/Volumes/T7/Projects/ImageHub`

## 6. 仓库 remote

`https://github.com/sevenoy/ImageHub.git`

## 7. 分支

`fix/imagehub-folder-import-cloud-watermarks-v1`

## 8. 起始 HEAD

`8156da88839f84a57e4a7797673d5b6b2fee1168`

## 9. 结束 HEAD

本报告写入时尚未创建本地 commit；最终 commit SHA 以交付记录为准。

## 10. 三个问题的最终根因

1. 导入校验、示例预览、Canvas 输出分别使用 `createImageBitmap`、`Image.decode()` 和另一份 `loadCanvasImage()`，导致同一个文件在不同阶段得出不同结果。
2. macOS `._*`、`.DS_Store` 等元数据虽然被跳过，但仍被推入 `errors`，使原始文件数和错误 UI 误导用户。
3. 常用水印只有 IndexedDB 实现，没有账号、远端 metadata、私有对象存储或 RLS。

## 11. 修改文件

- `App.tsx`
- `components/BatchWatermarkPanel.tsx`
- `components/LocalFolderReadTestPanel.tsx`
- `package.json`
- `package-lock.json`
- `utils/batchWatermark.ts`
- `utils/localImageFiles.ts`
- `utils/nativeFolderInputDebug.ts`
- `utils/watermarkLibrary.ts`

## 12. 新增文件

- `components/WatermarkCloudAccount.tsx`
- `utils/imageDecode.ts`
- `utils/cloudWatermarkLibrary.ts`
- `utils/supabaseClient.ts`
- `tests/localImageFiles.test.ts`
- `tests/watermarkLibrary.test.ts`
- `supabase/migrations/20260711183000_watermark_assets.sql`
- `.env.example`
- `docs/CLOUD_WATERMARK_SETUP.md`

## 13. 文件夹读取修复摘要

读取流程先做路径/格式分类，再以最大并发 4 验证候选图片。有效图片上限仍为 1000，不会被系统元数据消耗。`relativePath + size + lastModified` 继续用于 id，排序只作用于有效图片。

## 14. 系统文件计数修复摘要

任一路径段的 `._*`、`.DS_Store`、`__MACOSX`、`Thumbs.db`、`desktop.ini` 均先于 MIME/扩展名判断分类为系统文件。它们仅增加 `systemSkippedCount`，不进入 entries、预览、处理、ZIP、输出或 `errors`。

## 15. 图片解码统一摘要

`utils/imageDecode.ts` 是导入验证、示例预览和 `loadCanvasImage()` 的共同底层：优先 `createImageBitmap`、失败后 `HTMLImageElement` fallback，并释放 ImageBitmap 与 objectURL。示例图生成最长边 1600 的 preview Blob；若运行时预览仍失败，该条目会被从批次移除、记为坏图并继续下一条。

## 16. 云端水印架构摘要

`WatermarkRepository` 有 IndexedDB 与 Supabase 两个实现。前端仅在三个 Vite 环境变量齐备且开关为 `true` 时创建 Supabase client。登录使用邮箱 Magic Link；Storage path 是 `<auth-user-id>/<watermark-id>/<safe-file-name>`；元数据用 SHA-256 按用户去重；metadata 写入失败会回收刚上传的对象。

## 17. IndexedDB 兼容与迁移摘要

未登录时保存本机。登录并配置云端后，用户可显式点击“同步本机水印到云端”；原 IndexedDB 数据保留，成功同步的旧条目用 `cloudId` 关联以避免 UI 重复显示。云端下载会写入本机缓存，不保存公开永久 URL。

## 18. Supabase migration 是否只生成未执行

是。只生成了 `supabase/migrations/20260711183000_watermark_assets.sql`；没有连接 Supabase、创建 bucket、执行 migration 或修改 RLS。

## 19. typecheck 命令与结果

`npx tsc --noEmit`：通过（exit 0）。

## 20. unit test 命令与结果

`npm test`：通过，2 个文件、17 个断言。覆盖 200 文件（100 实图 + 100 `._*.jpg`）计数、系统分类、空 MIME 大写扩展名、坏图、共享解码资源释放、IndexedDB、Mock Supabase rollback/去重/删除与跨用户防御过滤。

## 21. build 命令与结果

`npm run build`：通过（exit 0）。Vite 警告单一压缩 chunk 为 548.28 kB；未在本轮进行不相关的拆包重构。

## 22. 200 文件测试结果

`rawFileCount = 200`、`imageCount = 100`、`systemSkippedCount = 100`、`errorCount = 0`、final entries = 100；已由 `tests/localImageFiles.test.ts` 验证。

## 23. 浏览器验收结果

本地 `npm run dev -- --host 127.0.0.1 --port 5206` 与 Playwright 页面检查通过：批量水印页面正常加载，主统计显示真实照片/系统忽略/不支持/坏图，未配置云端时显示“仅本机”。

真实手动验收 A-D 未执行：任务明确禁止读取用户照片目录，而 Playwright 文件注入不等同 macOS 原生文件夹选择器。待人工在授权的测试目录完成 6 张、81+89、坏图自动跳过、同名子目录四个场景。

## 24. 云端 mock 测试结果

通过。使用 Mock Supabase client，不连接任何项目；已覆盖 metadata 失败回收对象、同 hash 不重复上传、删除对象/metadata/缓存及跨用户记录过滤。

## 25. 真实跨设备验证状态

`BLOCKED_CLOUD_VERIFICATION`：需要用户提供且明确授权使用的非生产 Supabase 测试项目、Magic Link redirect 配置和两个测试账号。本轮没有连接任何 Supabase 项目。

## 26. 未做事项

- 未执行 Supabase migration、未创建 bucket、未配置 Auth。
- 未配置 GitHub Pages 环境变量或 Actions Secrets。
- 未 push、未部署、未发布。
- 未进行真实 macOS 原生选择器或跨设备验收。
- 未处理 npm audit 的 5 个既有依赖漏洞，避免超范围升级。

## 27. 生产上线前置条件

遵循 `docs/CLOUD_WATERMARK_SETUP.md` 在受控的非生产环境先执行 SQL、验证 RLS/Storage 目录隔离和 Magic Link，再进行授权的真实跨设备与文件夹验收；之后需要单独的 RELEASE_GATE 授权才能配置 Pages、push 或部署。

## 28. 安全检查结果

针对本轮新增/修改的前端、SQL、配置模板与文档进行 secret 路径与服务角色使用检查。没有 service-role key、真实 URL、token、cookie、密码或数据库凭据；`.env.example` 只有空变量名。SQL 开启表 RLS、私有 bucket 与按 `auth.uid()` 的 Storage path policy。

## 29. 风险

- migration 尚未在真实 Supabase 环境验证。
- Storage 与数据库跨服务删除不具备事务性；客户端在任一步失败时会报告错误且不删除本机缓存。
- HEIC/HEIF/AVIF 仍明确提示不支持，未把未验证转码能力引入当前批次。
- Vite chunk warning 仍存在。

## 30. 是否触发失败 2 次规则

否。T7 的 AppleDouble 测试文件被一次性排除；jsdom fallback fixture 被一次性修正；没有相同根因的连续两次失败。

## 31. 是否建议 Claude 只读分析

否。未触发失败 2 次规则，且本地验证可完成。

## 32. 本地 commit SHA，如有

本报告写入时尚无；交付记录为准。

## 33. 当前 git status

创建 commit 前以最终 `git status --short` 为准；预期仅本报告列出的本轮文件。

## 34. 是否执行 push

否。

## 35. 是否执行部署

否。

## 36. 下一步最小建议

在不连接生产的前提下，配置一个测试 Supabase 项目并由用户单独授权执行 migration 与真实跨设备/真实目录验收；通过后再申请一次独立的发布门禁。
