import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const agendaSrc = fs.readFileSync(path.join(ROOT, 'js/arsip-agenda.js'), 'utf8');
const sppdSrc = fs.readFileSync(path.join(ROOT, 'js/arsip-sppd.js'), 'utf8');
const kkSrc = fs.readFileSync(path.join(ROOT, 'js/arsip-kk.js'), 'utf8');
const bdSrc = fs.readFileSync(path.join(ROOT, 'js/arsip-bd.js'), 'utf8');
const arsipSrc = fs.readFileSync(path.join(ROOT, 'js/arsip.js'), 'utf8');

const cssSrc = fs.readFileSync(path.join(ROOT, 'css/styles.css'), 'utf8');

test('floating .arsip-back disembunyikan pada mode native dan hanya muncul di fullscreen iframe (body.arsip-fs)', () => {
  assert.match(cssSrc, /body:not\(\.arsip-fs\)\s*\.arsip-back[\s\S]*?display:\s*none\s*!important/, 'floating button harus disembunyikan saat bukan fullscreen');
  assert.match(cssSrc, /body\.arsip-fs\s*\.arsip-back/, 'floating button harus aktif di body.arsip-fs');
});

test('arsip-agenda.js memiliki header in-flow dengan tombol kembali, KPI cards, dan tab masuk/keluar', () => {
  assert.match(agendaSrc, /arsip-btn-back|btn-arsip-back|arsipBack\(\)/, 'Agenda harus memiliki tombol kembali in-flow');
  assert.match(agendaSrc, /Surat Masuk/, 'Harus ada tab/stat Surat Masuk');
  assert.match(agendaSrc, /Surat Keluar/, 'Harus ada tab/stat Surat Keluar');
  assert.match(agendaSrc, /agenda-kpi|kk-stat|kk-ringkas/, 'Harus ada KPI cards');
  assert.match(agendaSrc, /agendaSearch|search/i, 'Harus ada input pencarian');
});

test('arsip-sppd.js memiliki header in-flow dengan tombol kembali, KPI cards, dan tab dalam/luar daerah', () => {
  assert.match(sppdSrc, /arsip-btn-back|btn-arsip-back|arsipBack\(\)/, 'SPPD harus memiliki tombol kembali in-flow');
  assert.match(sppdSrc, /Dalam Daerah/i, 'Harus ada tab/stat Dalam Daerah');
  assert.match(sppdSrc, /Luar Daerah/i, 'Harus ada tab/stat Luar Daerah');
  assert.match(sppdSrc, /sppd-kpi|kk-stat|kk-ringkas/, 'Harus ada KPI cards');
  assert.match(sppdSrc, /sppdSearch|search/i, 'Harus ada input pencarian');
});

test('arsipDokumen memiliki tombol kembali in-flow di toolbar/header', () => {
  assert.match(html, /id="arsipDokumen"[^>]*>[\s\S]*?arsipBack\(\)/, 'arsipDokumen harus memiliki tombol kembali');
});

test('arsip-kk.js dan arsip-bd.js memiliki header in-flow dengan tombol kembali', () => {
  assert.match(kkSrc, /arsip-btn-back[\s\S]*?arsipBack\(\)/, 'Kertas Kerja harus memiliki tombol kembali in-flow');
  assert.match(bdSrc, /arsip-btn-back[\s\S]*?arsipBack\(\)/, 'Bank Data harus memiliki tombol kembali in-flow');
});
