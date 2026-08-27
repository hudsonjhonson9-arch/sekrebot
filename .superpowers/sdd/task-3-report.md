# Task 3 Report

**Status:** DONE

## Commits

- `507ad2a` — fix: face toggle only for superadmin, no localStorage fallback in simpanFaceToggle

## Changes

1. **js/admin-face.js** — Removed two `localStorage.setItem('face_recognition_bapperida', ...)` calls from `simpanFaceToggle()` (lines 269 and 280). Added superadmin-only visibility for `#faceToggleCard` inside `_applyFaceToggleUI()`.
2. **index.html** — Added `id="faceToggleCard"` to the face recognition card `<div>`.

## Verification

- `node -c "js/admin-face.js"` — no syntax errors.
- Commit is on top of base `9736266` (Task 2).

## Concerns

None.
