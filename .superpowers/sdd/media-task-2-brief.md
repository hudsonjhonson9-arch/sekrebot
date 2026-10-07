# Task 2 brief - plan 2026-10-02-media-drive.md

BASE for this task: d47976c (master). Task 1 done.

---

### Task 2: Google Apps Script media uploader

Apps Script cannot run under `node --test`, so this task is verified the same way `tests/n8n-face.test.mjs` verifies workflows: static assertions on the source file.

**Files:**
- Create: `google-apps-script/Code.gs`
- Create: `google-apps-script/appsscript.json`
- Create: `tests/gas-media.test.js`

**Interfaces:**
- Produces: `GET  ?action=health` â†’ `{ ok: true, folderId }`
- Produces: `POST { action: 'mediaUpsert', filename, mimeType, dataBase64, fileId? }` â†’ `{ ok: true, fileId, url, name }`

- [ ] **Step 1: Write the failing test**

Create `tests/gas-media.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const GS = path.resolve(import.meta.dirname, '..', 'google-apps-script', 'Code.gs');
const src = fs.readFileSync(GS, 'utf8');

test('file_id diambil dari URL kanonik Drive', () => {
  assert.match(src, /function\s+fileIdFromUrl\s*\(/);
  assert.match(src, /\/file\/d\/([-\w]+)/);
});

test('file yang sudah ada di-overwrite dengan setContent, bukan duplikat', () => {
  assert.match(src, /DriveApp\.getFileById/);
  assert.match(src, /\.setContent\(/);
  // createFile hanya boleh muncul di cabang "belum ada file", bukan di jalur
  // re-upload. Menjamahnya sebagai larangan salah: upload pertama butuh
  // createFile. Yang dijaga adalah tidak adanya jalur duplikasi.
  assert.match(src, /if\s*\(\s*p\.fileId\s*\)/);
  assert.match(src, /const\s+file\s*=\s*p\.fileId\s*\?\s*DriveApp\.getFileById\(\s*p\.fileId\s*\)/);
});

test('file dibagikan publik Anyone with link', () => {
  assert.match(src, /DriveApp\.Access\.ANYONE_WITH_LINK/);
  assert.match(src, /DriveApp\.Permission\.VIEW/);
});

test('doGet dan doPost mengembalikan status HTTP yang benar', () => {
  assert.match(src, /function\s+jsonOut\s*\(/);
  assert.match(src, /setResponseCode\s*\(/);
});

test('payload dibatasi 5 MB dan tipe gambar divalidasi', () => {
  assert.match(src, /5 \* 1024 \* 1024/);
  assert.match(src, /image\//);
});

test('folder tujuan diambil dari PropertiesService', () => {
  assert.match(src, /PropertiesService/);
  assert.match(src, /DRIVE_FOLDER_ID/);
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```
cd D:\Code\absensi_refactored_v6
node --test tests/gas-media.test.js
```

Expected: `ENOENT` reading `google-apps-script/Code.gs`.

- [ ] **Step 3: Create `google-apps-script/appsscript.json`**

```json
{
  "timeZone": "Asia/Jakarta",
  "runtimeVersion": "V8",
  "exceptionLogging": "STACKDRIVER",
  "oauthScopes": ["https://www.googleapis.com/auth/drive"]
}
```

- [ ] **Step 4: Create `google-apps-script/Code.gs`**

```javascript
const MAX_BYTES = 5 * 1024 * 1024;
const MIME_PREFIX = 'image/';

function jsonOut(code, body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON)
    .setResponseCode(code);
}

function readParams_(e) {
  if (!e) return {};
  if (e.postData && e.postData.contents) {
    try { return JSON.parse(e.postData.contents); } catch (err) { return {}; }
  }
  return e.parameter || {};
}

function folderId_() {
  const id = PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID');
  if (!id) throw new Error('DRIVE_FOLDER_ID belum diset di PropertiesService');
  return id;
}

function fileIdFromUrl(url) {
  const m = String(url || '').match(/\/file\/d\/([-\w]+)/);
  return m ? m[1] : null;
}

function canonicalUrl_(fileId) {
  return 'https://drive.google.com/file/d/' + fileId + '/view';
}

function doGet(e) {
  const p = readParams_(e);
  try {
    if (p.action === 'health') {
      return jsonOut(200, { ok: true, folderId: folderId_() });
    }
    return jsonOut(404, { ok: false, message: 'action tidak dikenal' });
  } catch (err) {
    return jsonOut(500, { ok: false, message: String(err && err.message || err) });
  }
}

function doPost(e) {
  const p = readParams_(e);
  if (p.action !== 'mediaUpsert') {
    return jsonOut(400, { ok: false, message: "action wajib 'mediaUpsert'" });
  }
  if (!p.filename || !p.mimeType) {
    return jsonOut(400, { ok: false, message: 'filename dan mimeType wajib diisi' });
  }
  if (MIME_PREFIX.indexOf(p.mimeType) !== 0) {
    return jsonOut(400, { ok: false, message: 'mimeType harus berupa image/*' });
  }
  if (!p.dataBase64) {
    return jsonOut(400, { ok: false, message: 'dataBase64 wajib diisi' });
  }

  let bytes;
  try {
    bytes = Utilities.base64Decode(p.dataBase64);
  } catch (err) {
    return jsonOut(400, { ok: false, message: 'dataBase64 bukan base64 yang valid' });
  }
  if (bytes.length > MAX_BYTES) {
    return jsonOut(413, { ok: false, message: 'ukuran file melebihi 5 MB' });
  }

  try {
    const blob = Utilities.newBlob(bytes, p.mimeType, p.filename);
    // Upload pertama membuat file baru (blob sudah berisi isinya). Upload
    // berikutnya menimpa file yang sama lewat fileId, bukan membuat duplikat.
    const file = p.fileId
      ? DriveApp.getFileById(p.fileId)
      : DriveApp.createFile(blob);
    if (p.fileId) {
      file.setName(p.filename);
      file.setContent(blob);
    }
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    DriveApp.getFolderById(folderId_()).addFile(file);

    return jsonOut(200, {
      ok: true,
      fileId: file.getId(),
      url: canonicalUrl_(file.getId()),
      name: file.getName()
    });
  } catch (err) {
    return jsonOut(500, { ok: false, message: String(err && err.message || err) });
  }
}
```

- [ ] **Step 5: Run the test to confirm it passes**

```
cd D:\Code\absensi_refactored_v6
node --test tests/gas-media.test.js
```

Expected: 6 passing.

- [ ] **Step 5b: Verify nothing regressed**

```
cd D:\Code\absensi_refactored_v6
npm test
```

Expected: 63 passing (57 + 6 GAS).

- [ ] **Step 6: Manual deployment step (cannot be automated)**

1. Open <https://script.google.com>, create a project bound to the target Google account.
2. Paste `google-apps-script/Code.gs` and `google-apps-script/appsscript.json`.
3. Set script property `DRIVE_FOLDER_ID` to the target folder.
4. Run `folderId_` once from the editor to grant the Drive scope.
5. Deploy â†’ New deployment â†’ Web app â†’ Execute as *Me*, access *Anyone*.
6. Record the `/exec` URL as `GAS_WEBAPP_URL`.

- [ ] **Step 7: Commit**

```
cd D:\Code\absensi_refactored_v6
git add google-apps-script/ tests/gas-media.test.js
git commit -m "feat(gas): add media upsert Apps Script with Drive sharing"
```

---

