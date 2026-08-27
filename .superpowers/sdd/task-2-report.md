# Task 2 Report

**Status:** DONE

**Commits:**
- `33e4558` — base (Task 1)
- `9736266` — fix: login checks face toggle per-instansi after user fetch

**Changes:**
- `js/auth.js`: Replaced global `FACE_RECOGNITION_ENABLED` check with per-instansi API call to `P.faceToggle` after user fetch. Added try/catch with safe default OFF on error.
