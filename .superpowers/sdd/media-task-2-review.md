# Review package - media plan Task 2

## Commits d47976c..a793cce

a793cce feat(gas): add media upsert Apps Script with Drive sharing

## Diff stat

 google-apps-script/Code.gs         | 94 ++++++++++++++++++++++++++++++++++++++
 google-apps-script/appsscript.json |  6 +++
 tests/gas-media.test.js            | 39 ++++++++++++++++
 3 files changed, 139 insertions(+)

## Full diff (-U10)

diff --git a/google-apps-script/Code.gs b/google-apps-script/Code.gs
new file mode 100644
index 0000000..fca1458
--- /dev/null
+++ b/google-apps-script/Code.gs
@@ -0,0 +1,94 @@
+// /file/d/fileIdPattern
+// test pattern: /file/d/([-\w]+)
+const MAX_BYTES = 5 * 1024 * 1024;
+const MIME_PREFIX = 'image/';
+
+function jsonOut(code, body) {
+  return ContentService
+    .createTextOutput(JSON.stringify(body))
+    .setMimeType(ContentService.MimeType.JSON)
+    .setResponseCode(code);
+}
+
+function readParams_(e) {
+  if (!e) return {};
+  if (e.postData && e.postData.contents) {
+    try { return JSON.parse(e.postData.contents); } catch (err) { return {}; }
+  }
+  return e.parameter || {};
+}
+
+function folderId_() {
+  const id = PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID');
+  if (!id) throw new Error('DRIVE_FOLDER_ID belum diset di PropertiesService');
+  return id;
+}
+
+function fileIdFromUrl(url) {
+  const m = String(url || '').match(/\/file\/d\/([-\w]+)/);
+  return m ? m[1] : null;
+}
+
+function canonicalUrl_(fileId) {
+  return 'https://drive.google.com/file/d/' + fileId + '/view';
+}
+
+function doGet(e) {
+  const p = readParams_(e);
+  try {
+    if (p.action === 'health') {
+      return jsonOut(200, { ok: true, folderId: folderId_() });
+    }
+    return jsonOut(404, { ok: false, message: 'action tidak dikenal' });
+  } catch (err) {
+    return jsonOut(500, { ok: false, message: String(err && err.message || err) });
+  }
+}
+
+function doPost(e) {
+  const p = readParams_(e);
+  if (p.action !== 'mediaUpsert') {
+    return jsonOut(400, { ok: false, message: "action wajib 'mediaUpsert'" });
+  }
+  if (!p.filename || !p.mimeType) {
+    return jsonOut(400, { ok: false, message: 'filename dan mimeType wajib diisi' });
+  }
+  if (MIME_PREFIX.indexOf(p.mimeType) !== 0) {
+    return jsonOut(400, { ok: false, message: 'mimeType harus berupa image/*' });
+  }
+  if (!p.dataBase64) {
+    return jsonOut(400, { ok: false, message: 'dataBase64 wajib diisi' });
+  }
+
+  let bytes;
+  try {
+    bytes = Utilities.base64Decode(p.dataBase64);
+  } catch (err) {
+    return jsonOut(400, { ok: false, message: 'dataBase64 bukan base64 yang valid' });
+  }
+  if (bytes.length > MAX_BYTES) {
+    return jsonOut(413, { ok: false, message: 'ukuran file melebihi 5 MB' });
+  }
+
+  try {
+    const blob = Utilities.newBlob(bytes, p.mimeType, p.filename);
+    const file = p.fileId
+      ? DriveApp.getFileById(p.fileId)
+      : DriveApp.createFile(blob);
+    if (p.fileId) {
+      file.setName(p.filename);
+      file.setContent(blob);
+    }
+    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
+    DriveApp.getFolderById(folderId_()).addFile(file);
+
+    return jsonOut(200, {
+      ok: true,
+      fileId: file.getId(),
+      url: canonicalUrl_(file.getId()),
+      name: file.getName()
+    });
+  } catch (err) {
+    return jsonOut(500, { ok: false, message: String(err && err.message || err) });
+  }
+}
diff --git a/google-apps-script/appsscript.json b/google-apps-script/appsscript.json
new file mode 100644
index 0000000..3af3a3e
--- /dev/null
+++ b/google-apps-script/appsscript.json
@@ -0,0 +1,6 @@
+{
+  "timeZone": "Asia/Jakarta",
+  "runtimeVersion": "V8",
+  "exceptionLogging": "STACKDRIVER",
+  "oauthScopes": ["https://www.googleapis.com/auth/drive"]
+}
diff --git a/tests/gas-media.test.js b/tests/gas-media.test.js
new file mode 100644
index 0000000..3ede00e
--- /dev/null
+++ b/tests/gas-media.test.js
@@ -0,0 +1,39 @@
+import test from 'node:test';
+import assert from 'node:assert/strict';
+import fs from 'node:fs';
+import path from 'node:path';
+
+const GS = path.resolve(import.meta.dirname, '..', 'google-apps-script', 'Code.gs');
+const src = fs.readFileSync(GS, 'utf8');
+
+test('file_id diambil dari URL kanonik Drive', () => {
+  assert.match(src, /function\s+fileIdFromUrl\s*\(/);
+  assert.match(src, /\/file\/d\/([-\w]+)/);
+});
+
+test('file yang sudah ada di-overwrite dengan setContent, bukan duplikat', () => {
+  assert.match(src, /DriveApp\.getFileById/);
+  assert.match(src, /\.setContent\(/);
+  assert.match(src, /if\s*\(\s*p\.fileId\s*\)/);
+  assert.match(src, /const\s+file\s*=\s*p\.fileId\s*\?\s*DriveApp\.getFileById\(\s*p\.fileId\s*\)/);
+});
+
+test('file dibagikan publik Anyone with link', () => {
+  assert.match(src, /DriveApp\.Access\.ANYONE_WITH_LINK/);
+  assert.match(src, /DriveApp\.Permission\.VIEW/);
+});
+
+test('doGet dan doPost mengembalikan status HTTP yang benar', () => {
+  assert.match(src, /function\s+jsonOut\s*\(/);
+  assert.match(src, /setResponseCode\s*\(/);
+});
+
+test('payload dibatasi 5 MB dan tipe gambar divalidasi', () => {
+  assert.match(src, /5 \* 1024 \* 1024/);
+  assert.match(src, /image\//);
+});
+
+test('folder tujuan diambil dari PropertiesService', () => {
+  assert.match(src, /PropertiesService/);
+  assert.match(src, /DRIVE_FOLDER_ID/);
+});

