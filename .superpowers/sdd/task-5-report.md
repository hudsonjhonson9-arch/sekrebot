# Task 5 Report: Per-instansi face toggle

**Status:** DONE

**Commits:**
- `7c73cb7` feat: per-instansi face toggle in n8n workflow + migration SQL

**Changes made:**
1. `scripts/migration_006_face_toggle_per_instansi.sql` — new migration to remove global `face_recognition` entry
2. `n8n/face recognition wf.json` — 4 nodes updated:
   - Get Face Setting (552399e9): query now filters by `instansi_id`
   - Format Face GET (7e2be4fc): default changed from `true` to `false`
   - Parse Face POST (7676575d): passes `instansi_id` through
   - Update Face Setting (a6a1dc09): UPDATE query now scoped by `instansi_id`

**Verification:** JSON valid, migration file exists, committed successfully.

**Concerns:** None.
