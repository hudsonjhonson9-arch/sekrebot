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
