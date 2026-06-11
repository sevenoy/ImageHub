# ImageHub Save And GitHub Report

## Summary

- Project: ImageHub 图片综合工具
- Original project path: /Volumes/T7/整理归档_2026-05-31/06_备份归档/网站完美备份/InstaGrid-main
- Local access URL: http://127.0.0.1:5206/
- Local backup path: /Volumes/T7/整理归档_2026-05-31/06_备份归档/网站完美备份/ImageHub-good-stable-20260611-120252
- Local backup size: 1.8G
- GitHub repository: https://github.com/sevenoy/ImageHub
- GitHub visibility: PRIVATE
- Branch: main
- Stable commit: cb78647

## Verification Before Saving

- `npx tsc --noEmit`: passed
- `npm run build`: passed
- `curl -I http://127.0.0.1:5206/`: HTTP 200

## Stable Function State

- LocalHub fixed port restored to 5206.
- Folder import crash fixed.
- Batch watermark page fixed.
- Image watermark preview fixed.
- Multi-image collage click-to-swap fixed.
- Downloaded collage image no longer includes page swap notices.

## Git And GitHub Actions Taken

- Git repository was initialized locally because the project was not previously a Git repository.
- Branch set to `main`.
- Created initial commit: `cb78647 Save stable ImageHub local tool`.
- Created private GitHub repository: `sevenoy/ImageHub`.
- Added remote: `origin https://github.com/sevenoy/ImageHub.git`.
- Pushed `main` to GitHub successfully.
- No force push was used.

## Publish Safety

`.gitignore` was updated to exclude common generated, cache, local-data, and sensitive files, including:

- `node_modules/`
- `dist/`
- `.vite/`
- `.next/`
- `build/`
- `.DS_Store`
- `._*`
- `__MACOSX/`
- `.env`
- `.env.*`
- `logs/`
- `coverage/`
- `playwright-report/`
- `test-results/`
- `_fix_backups/`
- archives such as `*.zip`, `*.tar`, `*.tar.gz`
- local output folders such as `outputs/`, `output/`, `downloads/`
- local watermark folders such as `watermark-library/`, `local-watermarks/`
- raw/photo formats such as `*.raw`, `*.arw`, `*.cr2`, `*.cr3`, `*.nef`, `*.dng`

## Excluded From GitHub

Confirmed by `git add --dry-run`, staged file review, and `.gitignore`:

- `node_modules/` was not uploaded.
- `dist/` was not uploaded.
- `_fix_backups/` was not uploaded.
- `.env` files were not uploaded.
- test output folders were not uploaded.
- generated local output/download folders were not uploaded.
- user photo/raw formats were excluded.

## Security Scan

Before `git add`, a filename scan and keyword scan were run while excluding `node_modules`, `dist`, `.git`, `_fix_backups`, source maps, and `package-lock.json`.

Findings:

- No suspicious secret/token/cookie/key filenames were found in publishable files.
- Keyword matches were limited to documentation/report text and `vite.config.ts` environment variable names such as `GEMINI_API_KEY`.
- No real API key, token, cookie, or private secret value was found or printed.

## Rollback

To roll back to this stable local backup:

1. Stop the running dev server if needed.
2. Make a new backup of the current `InstaGrid-main` directory.
3. Replace `/Volumes/T7/整理归档_2026-05-31/06_备份归档/网站完美备份/InstaGrid-main` with `/Volumes/T7/整理归档_2026-05-31/06_备份归档/网站完美备份/ImageHub-good-stable-20260611-120252`.
4. Run `npm install` if dependencies are missing.
5. Start with `npm run dev -- --host 127.0.0.1 --port 5206 --strictPort`.

## Notes

- Original project files were not deleted or moved.
- LocalHub configuration was not modified.
- Business functionality was not changed during the save/publish process.
