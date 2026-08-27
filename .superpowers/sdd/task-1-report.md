# Task 1 Report — loadFaceToggle: per-instansi, no localStorage fallback

**Status:** DONE

**Commits:** `b96d0a2`

**Tests:** `node -c js/admin-face.js` and `node -c js/face.js` — both passed (no errors).

**Changes:**
- `js/face.js:42` — default changed from `true` to `null`
- `js/admin-face.js` — `loadFaceToggle()` now accepts optional `instansi_id`, queries with `&instansi_id=`, guards early if no inst; removed localStorage fallback
- `js/admin-face.js` — removed parse-time `_restoreFaceToggleSync()` IIFE and the `loadFaceToggle()` call

**Concerns:** None.
