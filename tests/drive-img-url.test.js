import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Uji SUMBER SEBENARNYA: potong fungsi driveImgUrl dari js/helpers.js lalu eval,
// supaya salinan di test tidak bisa "lolos" padahal implementasinya beda.
const HELPERS = path.resolve(import.meta.dirname, '..', 'js', 'helpers.js');
const src = fs.readFileSync(HELPERS, 'utf8');
const start = src.indexOf('function driveImgUrl(');
const end = src.indexOf('window.driveImgUrl', start);
assert.ok(start !== -1 && end > start, 'driveImgUrl tidak ditemukan di js/helpers.js');
const driveImgUrl = eval('(' + src.slice(start, end) + ')');

test('driveImgUrl: uc?export=view (bentuk tanda_tangan produksi) -> thumbnail', () => {
  assert.equal(
    driveImgUrl('https://drive.google.com/uc?export=view&id=ABCdef_123-xy'),
    'https://drive.google.com/thumbnail?id=ABCdef_123-xy&sz=w400',
  );
});

test('driveImgUrl: /file/d/<id>/ -> thumbnail, ukuran dihormati', () => {
  assert.equal(
    driveImgUrl('https://drive.google.com/file/d/ABCdef_123-xy/view', 200),
    'https://drive.google.com/thumbnail?id=ABCdef_123-xy&sz=w200',
  );
});

test('driveImgUrl: thumbnail?id= (bentuk face_photo produksi) -> sz diganti', () => {
  assert.equal(
    driveImgUrl('https://drive.google.com/thumbnail?id=ABCdef_123-xy&sz=w1000', 400),
    'https://drive.google.com/thumbnail?id=ABCdef_123-xy&sz=w400',
  );
});

test('driveImgUrl: data:/non-Drive/kosong dilewatkan apa adanya', () => {
  assert.equal(driveImgUrl('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
  assert.equal(driveImgUrl('https://example.com/a.png'), 'https://example.com/a.png');
  assert.equal(driveImgUrl(''), '');
  assert.equal(driveImgUrl(null), '');
});
