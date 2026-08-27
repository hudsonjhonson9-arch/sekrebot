# Task 5: n8n face-toggle workflow + migration SQL

**Context:** The face-toggle n8n workflow needs per-instansi `instansi_id` support. The existing workflow is at `n8n/face recognition wf.json` (combined file with face-toggle, face-get, face-register). We only need to modify the face-toggle GET and POST nodes.

## Step 1: Migration SQL

Create `scripts/migration_006_face_toggle_per_instansi.sql`:

```sql
-- Migration: Per-instansi face_recognition toggle — remove old global key
-- Run this in PostgreSQL directly (psql, pgAdmin, or n8n SQL node)
-- Database: n8n_storage @ 10.11.8.62

-- Remove the old global face_recognition entry (now per-instansi)
DELETE FROM pengaturan WHERE key = 'face_recognition' AND instansi_id IS NULL;

-- Verify no orphaned global entries remain
SELECT key, value, instansi_id FROM pengaturan WHERE key = 'face_recognition' ORDER BY instansi_id;
```

## Step 2: Update "Get Face Setting" GET node (id: 552399e9)

In `n8n/face recognition wf.json`, find the node with id `"552399e9-47a9-4ef3-b3c3-f1619c991884"` ("Get Face Setting").

Change line 141 from:
```json
"query": "SELECT * FROM \"pengaturan\" WHERE \"key\" = 'face_recognition'"
```
to:
```json
"query": "SELECT * FROM \"pengaturan\" WHERE \"key\" = 'face_recognition' AND \"instansi_id\" = '{{ ($input.first().json.query.instansi_id || '').replace(/'/g, \"''\") }}'"
```

## Step 3: Update "Format Face GET" node (id: 7e2be4fc)

In the same file, find the node with id `"7e2be4fc-bc27-426c-b019-8612f06728ec"` ("Format Face GET").

Change line 127 from:
```javascript
const enabled = row.value !== undefined ? (String(row.value).trim()!=='0') : true;
```
to:
```javascript
const enabled = row.value !== undefined ? (String(row.value).trim()!=='0') : false;
```
(Default changed from `true` to `false` — safe OFF for instansi without entry)

## Step 4: Update "Parse Face POST" node (id: 7676575d)

Find the node with id `"7676575d-6af1-4879-a7ad-7337e9c4bf4a"` ("Parse Face POST").

Change the JS code at line 54 to pass `instansi_id` through. Replace the last line (before closing brackets):
```javascript
return [{json:{key:'face_recognition',value}}];
```
with:
```javascript
return [{json:{key:'face_recognition', value, instansi_id: body.instansi_id || ''}}];
```

## Step 5: Update "Update Face Setting" POST node (id: a6a1dc09)

Find the node with id `"a6a1dc09-172d-41c9-b8c5-9c82235b33f6"` ("Update Face Setting").

Change line 34 from:
```json
"query": "UPDATE \"pengaturan\" SET \"value\" = '{{ ($json.value).toString().replace(/'/g, \"''\") }}' WHERE \"key\" = '{{ ($json.key).toString().replace(/'/g, \"''\") }}' RETURNING *"
```
to:
```json
"query": "UPDATE \"pengaturan\" SET \"value\" = '{{ ($json.value).toString().replace(/'/g, \"''\") }}' WHERE \"key\" = '{{ ($json.key).toString().replace(/'/g, \"''\") }}' AND \"instansi_id\" = '{{ ($json.instansi_id || '').replace(/'/g, \"''\") }}' RETURNING *"
```

## Verify

Run: `node -e "JSON.parse(require('fs').readFileSync('n8n/face recognition wf.json','utf8'))"` from D:\Code\absensi_refactored_v6 — expected: no error (validates JSON).

## Commit

```
git add n8n/face\ recognition\ wf.json scripts/migration_006_face_toggle_per_instansi.sql
git commit -m "feat: per-instansi face toggle in n8n workflow + migration SQL"
```
