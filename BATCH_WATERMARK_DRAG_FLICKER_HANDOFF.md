# Batch Watermark Drag Flicker Handoff

Date: 2026-06-10

## Project

- Path: `/Volumes/T7/整理归档_2026-05-31/06_备份归档/网站完美备份/InstaGrid-main`
- Git: not a git repository
- Dev URL: `http://127.0.0.1:5206/`
- Dev command: `npm run dev -- --host 127.0.0.1 --port 5206 --strictPort`

## Changed Files

- `components/BatchWatermarkPanel.tsx`
- `BATCH_WATERMARK_DRAG_FLICKER_FIX_REPORT.md`
- `BATCH_WATERMARK_DRAG_FLICKER_HANDOFF.md`
- Temporary validation assets/scripts/screenshots under `_fix_backups/playwright-e2e/`

## What Changed

- Decoupled sample base image preview from watermark `position`.
- Preview now creates one object URL for the current base image and keeps it stable while dragging.
- Watermark dragging updates only the overlay DOM position via `requestAnimationFrame`.
- Final `position` state is saved on pointerup, so batch export still uses the final dragged position.
- Added `draggable={false}` and dragstart prevention for base image and watermark overlay.

## Validation

- `npx tsc --noEmit`: passed.
- `npm run build`: passed.
- `curl -I http://127.0.0.1:5206/`: `HTTP/1.1 200 OK`.
- Text watermark drag script: passed 10s drag, base img DOM node stable, src stable, no placeholder/loading, ZIP download succeeded.
- Image watermark drag script: passed 10s drag, base img DOM node stable, src stable, ZIP download succeeded.

## Runtime Notes

- 5206 is running from the target InstaGrid-main path.
- 5207 is the separate InstaGrid Desktop Backup and was left untouched.
- 5208 is not listening and was not used.

## Security

- Filename/pattern-level scan found no actionable secret exposure. No secrets were printed.

## Open Items

- None blocking. User can manually retest with real large photos and transparent PNG watermark.

## Commit/Push

- No git add, commit, or push performed.
