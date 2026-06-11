# InstaGrid 常用水印库与输出提示优化 Handoff

## Project

- Path: `/Volumes/T7/整理归档_2026-05-31/06_备份归档/网站完美备份/InstaGrid-main`
- URL: `http://127.0.0.1:5206/`
- Start command: `npm run dev -- --host 127.0.0.1 --port 5206 --strictPort`
- Git: no Git repository detected under `/Volumes/T7/.../InstaGrid-main`

## Backup

- Full backup created before edits:
  `/Volumes/T7/整理归档_2026-05-31/06_备份归档/网站完美备份/InstaGrid-main-good-before-watermark-library-20260610-205332`

## Changed Files

- `App.tsx`
- `components/BatchWatermarkPanel.tsx`
- `utils/watermarkLibrary.ts`
- `INSTAGRID_WATERMARK_LIBRARY_AND_OUTPUT_MODAL_REPORT.md`
- `_fix_backups/watermark-library-e2e/run-smoke.cjs`

## What Changed

- Hid the top navigation entry for “文件夹读取”; kept source and internal branch intact.
- Added an IndexedDB-backed local “常用水印库” in image watermark mode.
- Added save/use/delete UI for saved watermark images.
- Added batch completion modal with success/fail/skipped counts, output mode, output folder name, output location, copy button, and failed-reason entry.
- Added one-off headless Playwright smoke script and local test assets under `_fix_backups/watermark-library-e2e/`.

## Validation

- `npx tsc --noEmit`: passed
- `npm run build`: passed
- `curl -I http://127.0.0.1:5206/`: `HTTP/1.1 200 OK`
- `node _fix_backups/watermark-library-e2e/run-smoke.cjs`: passed

Smoke test covered:

- “文件夹读取” hidden from top nav.
- “多图合成” and “批量水印” still visible.
- Image watermark upload works.
- Save to common watermark works.
- Saved watermark persists after page reload.
- Saved watermark can be applied.
- Batch watermark can run and download ZIP.
- Completion modal appears.
- Copy output path button works.
- No console/page crash errors detected.

## Port Status

- 5206: active for InstaGrid-main.
- 5207: still active, not touched.
- 5208: not used.

## Security Notes

- No `.env`, cookie, token, credential, private-key files found in scan.
- No secret values printed.
- Saved watermark data stays in browser IndexedDB only.
- No user watermark images are written into app source.

## Not Changed

- No folder-reading core logic changes.
- Did not revert `createObjectUrls:false`.
- Did not modify LocalHub config.
- Did not stop 5207 or use 5208.
- Did not initialize Git.
- No `git add`, `git commit`, or `git push`.

## Risks / Notes

- Direct Finder opening is not implemented because this is a browser-only app without a native/Node bridge.
- IndexedDB data is browser-local and can be cleared by browser site-data cleanup.
- The smoke test uses synthetic PNG files under `_fix_backups`; real folder-picker validation still requires user interaction in the browser.

## Next Recommended Prompt

“请在真实照片文件夹上手动验证常用水印库和批量输出弹窗，如果发现某个浏览器下 IndexedDB 或复制路径异常，再让 Codex 针对该浏览器补兼容处理。”

