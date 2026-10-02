import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const GS = path.resolve(import.meta.dirname, '..', 'google-apps-script', 'Code.gs');
const src = fs.readFileSync(GS, 'utf8');

// Assertion dicocokkan ke `code`, bukan `src`: baris komentar dibuang supaya tidak
// ada implementasi yang hilang tapi tetap "lolos" karena ada marker di komentar.
// Regex literal di .gs ditulis ter-escape (/\/file\/d\/...), jadi konstanta berbasis
// regex diuji lewat `flat` (backslash-nya dibuang).
const code = src.replace(/^\s*\/\/.*$/gm, '');
const flat = code.replace(/\\/g, '');

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
  assert.match(code, /DriveApp\.Access\.ANYONE_WITH_LINK/);
  assert.match(code, /DriveApp\.Permission\.VIEW/);
});

test('doGet dan doPost mengembalikan status HTTP yang benar', () => {
  assert.match(code, /function\s+jsonOut\s*\(/);
  assert.match(code, /setResponseCode\(code\)/);
});

test('payload dibatasi 5 MB sebelum dan sesudah decode', () => {
  assert.match(code, /const MAX_BYTES = 5 \* 1024 \* 1024/);
  assert.match(code, /p\.dataBase64\.length > MAX_BYTES/);
  assert.match(code, /bytes\.length > MAX_BYTES/);
  assert.match(code, /return jsonOut\(413,/);
  assert.ok(
    code.indexOf('p.dataBase64.length > MAX_BYTES') < code.indexOf('Utilities.base64Decode'),
    'encoded length harus dicek sebelum base64Decode'
  );
});

test('mimeType divalidasi sebagai image/* dan svg ditolak', () => {
  assert.match(code, /MIME_PREFIX\.indexOf\(p\.mimeType\)\s*!==\s*0/);
  assert.match(code, /\/svg\/\.test\(p\.mimeType\)/);
});

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
  assert.match(
    code,
    /!parents\.hasNext\(\)\s*\|\|\s*parents\.next\(\)\.getId\(\)\s*!==\s*folder\.getId\(\)/
  );
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
});
