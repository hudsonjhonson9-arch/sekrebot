# Review package - media plan Task 2 FIX ROUND 1

## Commits a793cce..c38a90f

c38a90f fix(gas): reject untrusted fileId, resolve folder before mutation

## Diff stat

 google-apps-script/Code.gs | 48 ++++++++++++++++--------
 tests/gas-media.test.js    | 93 ++++++++++++++++++++++++++++++++++++++--------
 2 files changed, 109 insertions(+), 32 deletions(-)

## Full diff (-U10)

diff --git a/google-apps-script/Code.gs b/google-apps-script/Code.gs
index fca1458..f1a8d35 100644
--- a/google-apps-script/Code.gs
+++ b/google-apps-script/Code.gs
@@ -1,14 +1,13 @@
-// /file/d/fileIdPattern
-// test pattern: /file/d/([-\w]+)
 const MAX_BYTES = 5 * 1024 * 1024;
 const MIME_PREFIX = 'image/';
+const FILE_ID_RE = /^[-\w]{5,200}$/;
 
 function jsonOut(code, body) {
   return ContentService
     .createTextOutput(JSON.stringify(body))
     .setMimeType(ContentService.MimeType.JSON)
     .setResponseCode(code);
 }
 
 function readParams_(e) {
   if (!e) return {};
@@ -17,78 +16,95 @@ function readParams_(e) {
   }
   return e.parameter || {};
 }
 
 function folderId_() {
   const id = PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID');
   if (!id) throw new Error('DRIVE_FOLDER_ID belum diset di PropertiesService');
   return id;
 }
 
-function fileIdFromUrl(url) {
-  const m = String(url || '').match(/\/file\/d\/([-\w]+)/);
-  return m ? m[1] : null;
-}
-
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
-    return jsonOut(500, { ok: false, message: String(err && err.message || err) });
+    console.error('health gagal', err);
+    return jsonOut(500, { ok: false, message: 'health check gagal' });
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
-  if (MIME_PREFIX.indexOf(p.mimeType) !== 0) {
-    return jsonOut(400, { ok: false, message: 'mimeType harus berupa image/*' });
+  // svg ditolak: bisa membawa <script>, tidak pernah dibutuhkan untuk foto/signature.
+  if (MIME_PREFIX.indexOf(p.mimeType) !== 0 || /svg/.test(p.mimeType)) {
+    return jsonOut(400, { ok: false, message: 'mimeType harus image/* dan bukan svg' });
   }
-  if (!p.dataBase64) {
+  if (typeof p.dataBase64 !== 'string' || !p.dataBase64) {
     return jsonOut(400, { ok: false, message: 'dataBase64 wajib diisi' });
   }
+  // ponytail: guard pra-decode, base64 ~4/3 byte asli + 4. Cabut kalau backend sudah membatasi ukuran body.
+  if (p.dataBase64.length > MAX_BYTES * 4 / 3 + 4) {
+    return jsonOut(413, { ok: false, message: 'ukuran file melebihi 5 MB' });
+  }
+  // only id file Drive, bukan URL ΓÇö URL disimpan di DB dan di-extract di sisi server.
+  if (p.fileId && !FILE_ID_RE.test(p.fileId)) {
+    return jsonOut(400, { ok: false, message: 'fileId harus id file Drive, bukan URL' });
+  }
 
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
+    // Folder diresolve lebih dulu: kalau DRIVE_FOLDER_ID belum diset, file tidak
+    // boleh ikut berubah. Dan karena endpoint ini publik, fileId dari luar tidak
+    // boleh menimpa file operator di luar folder tujuan.
+    const folder = DriveApp.getFolderById(folderId_());
     const blob = Utilities.newBlob(bytes, p.mimeType, p.filename);
-    const file = p.fileId
-      ? DriveApp.getFileById(p.fileId)
-      : DriveApp.createFile(blob);
+    let file;
     if (p.fileId) {
+      // upload ulang menimpa file yang sama lewat fileId, bukan membuat duplikat
+      file = DriveApp.getFileById(p.fileId);
+      const parents = file.getParents();
+      if (!parents.hasNext() || parents.next().getId() !== folder.getId()) {
+        return jsonOut(403, { ok: false, message: 'fileId bukan milik folder tujuan' });
+      }
       file.setName(p.filename);
       file.setContent(blob);
+    } else {
+      // createFile di dalam folder, bukan DriveApp.createFile + addFile yang
+      // menyisakan file yatim di root My Drive.
+      file = folder.createFile(blob);
     }
     file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
-    DriveApp.getFolderById(folderId_()).addFile(file);
 
     return jsonOut(200, {
       ok: true,
       fileId: file.getId(),
       url: canonicalUrl_(file.getId()),
       name: file.getName()
     });
   } catch (err) {
-    return jsonOut(500, { ok: false, message: String(err && err.message || err) });
+    console.error('mediaUpsert gagal', err);
+    return jsonOut(500, { ok: false, message: 'gagal menyimpan file' });
   }
 }
diff --git a/tests/gas-media.test.js b/tests/gas-media.test.js
index 3ede00e..6d630d9 100644
--- a/tests/gas-media.test.js
+++ b/tests/gas-media.test.js
@@ -1,39 +1,100 @@
 import test from 'node:test';
 import assert from 'node:assert/strict';
 import fs from 'node:fs';
 import path from 'node:path';
 
 const GS = path.resolve(import.meta.dirname, '..', 'google-apps-script', 'Code.gs');
 const src = fs.readFileSync(GS, 'utf8');
 
-test('file_id diambil dari URL kanonik Drive', () => {
-  assert.match(src, /function\s+fileIdFromUrl\s*\(/);
-  assert.match(src, /\/file\/d\/([-\w]+)/);
+// Assertion dicocokkan ke `code`, bukan `src`: baris komentar dibuang supaya tidak
+// ada implementasi yang hilang tapi tetap "lolos" karena ada marker di komentar.
+// Regex literal di .gs ditulis ter-escape (/\/file\/d\/...), jadi konstanta berbasis
+// regex diuji lewat `flat` (backslash-nya dibuang).
+const code = src.replace(/^\s*\/\/.*$/gm, '');
+const flat = code.replace(/\\/g, '');
+
+test('fileId harus id file Drive, URL diekstrak di sisi server', () => {
+  assert.match(code, /const\s+FILE_ID_RE\s*=/);
+  assert.match(flat, /FILE_ID_RE\s*=\s*\/\^\[-w\]\{5,200\}\$\//);
+  assert.match(code, /if\s*\(\s*p\.fileId\s*&&\s*!FILE_ID_RE\.test\(p\.fileId\)\s*\)/);
+  assert.doesNotMatch(code, /function\s+fileIdFromUrl\b/);
 });
 
 test('file yang sudah ada di-overwrite dengan setContent, bukan duplikat', () => {
-  assert.match(src, /DriveApp\.getFileById/);
-  assert.match(src, /\.setContent\(/);
-  assert.match(src, /if\s*\(\s*p\.fileId\s*\)/);
-  assert.match(src, /const\s+file\s*=\s*p\.fileId\s*\?\s*DriveApp\.getFileById\(\s*p\.fileId\s*\)/);
+  assert.match(code, /if\s*\(\s*p\.fileId\s*\)/);
+  assert.match(code, /file\s*=\s*DriveApp\.getFileById\(p\.fileId\)/);
+  assert.match(code, /file\.setContent\(blob\)/);
+  assert.match(code, /file\.setName\(p\.filename\)/);
 });
 
 test('file dibagikan publik Anyone with link', () => {
-  assert.match(src, /DriveApp\.Access\.ANYONE_WITH_LINK/);
-  assert.match(src, /DriveApp\.Permission\.VIEW/);
+  assert.match(code, /DriveApp\.Access\.ANYONE_WITH_LINK/);
+  assert.match(code, /DriveApp\.Permission\.VIEW/);
 });
 
 test('doGet dan doPost mengembalikan status HTTP yang benar', () => {
-  assert.match(src, /function\s+jsonOut\s*\(/);
-  assert.match(src, /setResponseCode\s*\(/);
+  assert.match(code, /function\s+jsonOut\s*\(/);
+  assert.match(code, /setResponseCode\(code\)/);
+});
+
+test('payload dibatasi 5 MB sebelum dan sesudah decode', () => {
+  assert.match(code, /const MAX_BYTES = 5 \* 1024 \* 1024/);
+  assert.match(code, /p\.dataBase64\.length > MAX_BYTES/);
+  assert.match(code, /bytes\.length > MAX_BYTES/);
+  assert.match(code, /return jsonOut\(413,/);
+  assert.ok(
+    code.indexOf('p.dataBase64.length > MAX_BYTES') < code.indexOf('Utilities.base64Decode'),
+    'encoded length harus dicek sebelum base64Decode'
+  );
 });
 
-test('payload dibatasi 5 MB dan tipe gambar divalidasi', () => {
-  assert.match(src, /5 \* 1024 \* 1024/);
-  assert.match(src, /image\//);
+test('mimeType divalidasi sebagai image/* dan svg ditolak', () => {
+  assert.match(code, /MIME_PREFIX\.indexOf\(p\.mimeType\)\s*!==\s*0/);
+  assert.match(code, /\/svg\/\.test\(p\.mimeType\)/);
 });
 
 test('folder tujuan diambil dari PropertiesService', () => {
-  assert.match(src, /PropertiesService/);
-  assert.match(src, /DRIVE_FOLDER_ID/);
+  assert.match(code, /PropertiesService/);
+  assert.match(code, /getProperty\('DRIVE_FOLDER_ID'\)/);
+});
+
+test('folder tujuan diresolve sebelum file dimutasi', () => {
+  const folderAt = code.indexOf('DriveApp.getFolderById(folderId_())');
+  assert.ok(folderAt > -1, 'folder harus di-resolve dari PropertiesService');
+  for (const mutation of ['file.setContent(blob)', 'file.setName(p.filename)', 'file.setSharing(']) {
+    assert.ok(folderAt < code.indexOf(mutation), `${mutation} harus setelah folder di-resolve`);
+  }
+});
+
+test('fileId di luar folder tujuan ditolak 403 sebelum file disentuh', () => {
+  assert.match(code, /const\s+parents\s*=\s*file\.getParents\(\)/);
+  assert.match(
+    code,
+    /!parents\.hasNext\(\)\s*\|\|\s*parents\.next\(\)\.getId\(\)\s*!==\s*folder\.getId\(\)/
+  );
+  const rejectAt = code.indexOf('return jsonOut(403,');
+  assert.ok(rejectAt > -1, 'harus ada balasan 403');
+  assert.ok(rejectAt < code.indexOf('file.setContent(blob)'), 'cek parent harus sebelum setContent');
+});
+
+test('file baru lahir di dalam folder, tidak menyisakan yatim di root Drive', () => {
+  assert.match(code, /file\s*=\s*folder\.createFile\(blob\)/);
+  assert.doesNotMatch(code, /DriveApp\.createFile\(/);
+  assert.doesNotMatch(code, /\.addFile\(/);
+});
+
+test('URL hasil selalu format kanonik /file/d/<ID>/view', () => {
+  assert.match(code, /function\s+canonicalUrl_\s*\(/);
+  assert.match(code, /https:\/\/drive\.google\.com\/file\/d\/'\s*\+\s*fileId\s*\+\s*'\/view/);
+  assert.doesNotMatch(code, /drive\.google\.com\/uc\?/);
+});
+
+test('setiap jalur error membalas JSON dan tidak melempar keluar', () => {
+  assert.equal(
+    (code.match(/return jsonOut\(500,/g) || []).length,
+    2,
+    'doGet dan doPost harus sama-sama membalas 500'
+  );
+  assert.doesNotMatch(code, /catch\s*\([^)]*\)\s*\{\s*throw\b/);
+  assert.doesNotMatch(code, /String\(err\s*&&\s*err\.message/);
 });

