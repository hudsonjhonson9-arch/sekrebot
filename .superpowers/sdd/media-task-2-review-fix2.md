# Review package - media plan Task 2 FIX ROUND 2

## Commits c38a90f..b689346

b689346 fix(gas): strip all comment forms before asserting, check every parent

## Diff stat

 google-apps-script/Code.gs |  9 ++++++++-
 tests/gas-media.test.js    | 45 ++++++++++++++++++++++++++++++++++++++-------
 2 files changed, 46 insertions(+), 8 deletions(-)

## Full diff (-U15)

diff --git a/google-apps-script/Code.gs b/google-apps-script/Code.gs
index f1a8d35..279a0e1 100644
--- a/google-apps-script/Code.gs
+++ b/google-apps-script/Code.gs
@@ -72,32 +72,39 @@ function doPost(e) {
   }
   if (bytes.length > MAX_BYTES) {
     return jsonOut(413, { ok: false, message: 'ukuran file melebihi 5 MB' });
   }
 
   try {
     // Folder diresolve lebih dulu: kalau DRIVE_FOLDER_ID belum diset, file tidak
     // boleh ikut berubah. Dan karena endpoint ini publik, fileId dari luar tidak
     // boleh menimpa file operator di luar folder tujuan.
     const folder = DriveApp.getFolderById(folderId_());
     const blob = Utilities.newBlob(bytes, p.mimeType, p.filename);
     let file;
     if (p.fileId) {
       // upload ulang menimpa file yang sama lewat fileId, bukan membuat duplikat
       file = DriveApp.getFileById(p.fileId);
+      // cek SEMUA parent, bukan cuma yang pertama: file dari versi lama
+      // (DriveApp.createFile + addFile) punya dua parent (root + folder tujuan)
+      // dan Drive tidak menjamin urutannya, jadi file sah bisa permanent 403.
       const parents = file.getParents();
-      if (!parents.hasNext() || parents.next().getId() !== folder.getId()) {
+      let inFolder = false;
+      while (parents.hasNext()) {
+        if (parents.next().getId() === folder.getId()) inFolder = true;
+      }
+      if (!inFolder) {
         return jsonOut(403, { ok: false, message: 'fileId bukan milik folder tujuan' });
       }
       file.setName(p.filename);
       file.setContent(blob);
     } else {
       // createFile di dalam folder, bukan DriveApp.createFile + addFile yang
       // menyisakan file yatim di root My Drive.
       file = folder.createFile(blob);
     }
     file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
 
     return jsonOut(200, {
       ok: true,
       fileId: file.getId(),
       url: canonicalUrl_(file.getId()),
diff --git a/tests/gas-media.test.js b/tests/gas-media.test.js
index 6d630d9..9061129 100644
--- a/tests/gas-media.test.js
+++ b/tests/gas-media.test.js
@@ -1,30 +1,54 @@
 import test from 'node:test';
 import assert from 'node:assert/strict';
 import fs from 'node:fs';
 import path from 'node:path';
 
 const GS = path.resolve(import.meta.dirname, '..', 'google-apps-script', 'Code.gs');
 const src = fs.readFileSync(GS, 'utf8');
 
-// Assertion dicocokkan ke `code`, bukan `src`: baris komentar dibuang supaya tidak
-// ada implementasi yang hilang tapi tetap "lolos" karena ada marker di komentar.
+// Assertion dicocokkan ke `code`, bukan `src`: semua bentuk komentar (baris penuh,
+// trailing, blok, blok multi-baris) dan isi template literal dibuang, supaya tidak
+// ada implementasi yang hilang tapi tetap "lolos" karena marker-nya disembunyikan.
+// Literal kutip tunggal/dua justru dipertahankan ΓÇö 2 assertion membutuhkannya ΓÇö
+// jadi `https://` di dalam string aman dari penghapusan `//`.
 // Regex literal di .gs ditulis ter-escape (/\/file\/d\/...), jadi konstanta berbasis
 // regex diuji lewat `flat` (backslash-nya dibuang).
-const code = src.replace(/^\s*\/\/.*$/gm, '');
+const CODE_NOISE = /(['"`])(?:\\.|(?!\1)[^\\\n])*\1|\/\*[\s\S]*?\*\/|\/\/.*$/gm;
+function stripNoise(text) {
+  return text.replace(CODE_NOISE, (m) => (/['"]/.test(m[0]) ? m : ''));
+}
+const code = stripNoise(src);
 const flat = code.replace(/\\/g, '');
 
+test('marker yang disembunyikan di komentar atau template literal tidak dihitung', () => {
+  const cheat = 'file.setContent(blob) DriveApp.Access.ANYONE_WITH_LINK';
+  const vectors = {
+    'komentar baris penuh': `// ${cheat}`,
+    'komentar trailing setelah kode': `const blob = 1; // ${cheat}`,
+    'komentar blok': `/* ${cheat} */`,
+    'blok membungkus seluruh fungsi': `function doPost(e) { /*\n${cheat}\n*/\n}`,
+    'template literal': `const m = \`${cheat}\`;`,
+  };
+  for (const [name, source] of Object.entries(vectors)) {
+    assert.doesNotMatch(stripNoise(source), /setContent|ANYONE_WITH_LINK/, `bypass: ${name}`);
+  }
+  // kebalikannya: kode asli tidak boleh ikut terhapus
+  assert.match(stripNoise("const url = 'https://drive.google.com/file/d/' + id;"), /https:\/\/drive\.google\.com\/file\/d\//);
+  assert.match(stripNoise("if (x) { y(); } // trailing note"), /y\(\)/);
+});
+
 test('fileId harus id file Drive, URL diekstrak di sisi server', () => {
   assert.match(code, /const\s+FILE_ID_RE\s*=/);
   assert.match(flat, /FILE_ID_RE\s*=\s*\/\^\[-w\]\{5,200\}\$\//);
   assert.match(code, /if\s*\(\s*p\.fileId\s*&&\s*!FILE_ID_RE\.test\(p\.fileId\)\s*\)/);
   assert.doesNotMatch(code, /function\s+fileIdFromUrl\b/);
 });
 
 test('file yang sudah ada di-overwrite dengan setContent, bukan duplikat', () => {
   assert.match(code, /if\s*\(\s*p\.fileId\s*\)/);
   assert.match(code, /file\s*=\s*DriveApp\.getFileById\(p\.fileId\)/);
   assert.match(code, /file\.setContent\(blob\)/);
   assert.match(code, /file\.setName\(p\.filename\)/);
 });
 
 test('file dibagikan publik Anyone with link', () => {
@@ -56,45 +80,52 @@ test('mimeType divalidasi sebagai image/* dan svg ditolak', () => {
 test('folder tujuan diambil dari PropertiesService', () => {
   assert.match(code, /PropertiesService/);
   assert.match(code, /getProperty\('DRIVE_FOLDER_ID'\)/);
 });
 
 test('folder tujuan diresolve sebelum file dimutasi', () => {
   const folderAt = code.indexOf('DriveApp.getFolderById(folderId_())');
   assert.ok(folderAt > -1, 'folder harus di-resolve dari PropertiesService');
   for (const mutation of ['file.setContent(blob)', 'file.setName(p.filename)', 'file.setSharing(']) {
     assert.ok(folderAt < code.indexOf(mutation), `${mutation} harus setelah folder di-resolve`);
   }
 });
 
 test('fileId di luar folder tujuan ditolak 403 sebelum file disentuh', () => {
   assert.match(code, /const\s+parents\s*=\s*file\.getParents\(\)/);
-  assert.match(
-    code,
-    /!parents\.hasNext\(\)\s*\|\|\s*parents\.next\(\)\.getId\(\)\s*!==\s*folder\.getId\(\)/
-  );
+  // semua parent diperiksa, bukan cuma yang pertama
+  assert.match(code, /while\s*\(\s*parents\.hasNext\(\)\s*\)/);
+  assert.match(code, /parents\.next\(\)\.getId\(\)\s*===\s*folder\.getId\(\)/);
+  assert.doesNotMatch(code, /parents\.next\(\)\.getId\(\)\s*!==\s*folder\.getId\(\)/);
   const rejectAt = code.indexOf('return jsonOut(403,');
   assert.ok(rejectAt > -1, 'harus ada balasan 403');
   assert.ok(rejectAt < code.indexOf('file.setContent(blob)'), 'cek parent harus sebelum setContent');
 });
 
 test('file baru lahir di dalam folder, tidak menyisakan yatim di root Drive', () => {
   assert.match(code, /file\s*=\s*folder\.createFile\(blob\)/);
   assert.doesNotMatch(code, /DriveApp\.createFile\(/);
   assert.doesNotMatch(code, /\.addFile\(/);
 });
 
 test('URL hasil selalu format kanonik /file/d/<ID>/view', () => {
   assert.match(code, /function\s+canonicalUrl_\s*\(/);
   assert.match(code, /https:\/\/drive\.google\.com\/file\/d\/'\s*\+\s*fileId\s*\+\s*'\/view/);
   assert.doesNotMatch(code, /drive\.google\.com\/uc\?/);
 });
 
 test('setiap jalur error membalas JSON dan tidak melempar keluar', () => {
   assert.equal(
     (code.match(/return jsonOut\(500,/g) || []).length,
     2,
     'doGet dan doPost harus sama-sama membalas 500'
   );
   assert.doesNotMatch(code, /catch\s*\([^)]*\)\s*\{\s*throw\b/);
   assert.doesNotMatch(code, /String\(err\s*&&\s*err\.message/);
+  // pesan harus literal statis: payload dan teks exception tidak boleh disisipkan
+  const messages = [...code.matchAll(/message\s*:\s*([^,\n}]*)/g)].map((m) => m[1].trim());
+  assert.ok(messages.length > 0, 'harus ada pesan error');
+  for (const msg of messages) {
+    assert.match(msg, /^['"]/, `pesan harus literal statis: ${msg}`);
+    assert.doesNotMatch(msg, /\+/, `pesan tidak boleh hasil interpolasi: ${msg}`);
+  }
 });

