import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'log.js'), 'utf8');

// getField: ambil field pertama yang terisi (mirror js/helpers.js).
function getField(row, ...keys) {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

// Muat js/log.js ke sandbox agar fungsi privat dapat diuji tanpa DOM.
function load({ liburSet = new Set(), jamMasuk = '08:00' } = {}) {
  const win = {};
  const nowWITA = () => new Date('2026-10-13T01:00:00Z');
  const fmtD = (d) => {
    const dt = d instanceof Date ? d : new Date(d);
    const p = (n) => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
  };
  const hariLiburSet = liburSet;
  const getJamForTanggal = () => ({ nama: '', masuk: jamMasuk, pulang: '17:00' });
  // escapeHtml global di js/config.js — replika mini untuk sandbox.
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const factory = new Function(
    'getField', 'nowWITA', 'fmtD', 'hariLiburSet', 'getJamForTanggal', 'escapeHtml', 'window',
    `${src}\n;return { status: _weekDayStatus, detailHtml: _weekDetailHtml, setWeek: (m) => { _weekByDate = m; }, setRange: (r) => { _weekRange = r; }, ketMap: _WEEK_KET_MAP };`
  );
  const api = factory(getField, nowWITA, fmtD, hariLiburSet, getJamForTanggal, escapeHtml, win);
  // Senin..Minggu minggu yang memuat D (2026-10-13 = Selasa).
  api.range = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']
    .map((t) => new Date(t + 'T12:00:00'));
  api.setRange(api.range);
  api.day = (dStr, ...rows) => {
    const m = {};
    m[dStr] = rows;
    api.setWeek(m);
    return api.status(dStr, false, false);
  };
  return api;
}

const D = '2026-10-13';

test('MASUK tepat waktu → hadir dengan ikon fa-check (sama Rekap)', () => {
  const s = load().day(D, { 'Jenis Absen': 'MASUK', Jam: '07:55' });
  assert.equal(s.key, 'hadir');
  assert.equal(s.icon, 'fa-check');
});

test('MASUK lewat batas → telat dengan ikon fa-clock', () => {
  const s = load().day(D, { 'Jenis Absen': 'MASUK', Jam: '08:20' });
  assert.equal(s.key, 'telat');
  assert.equal(s.icon, 'fa-clock');
  assert.match(s.label, /Telat 20m/);
});

test('status telat tetap menampilkan jam pulang (masuk + pulang)', () => {
  const s = load().day(D, { 'Jenis Absen': 'MASUK', Jam: '08:20' }, { 'Jenis Absen': 'PULANG', Jam: '16:30' });
  assert.equal(s.key, 'telat');
  assert.equal(s.det, 'Masuk 08:20 • Batas 08:00 • Pulang 16:30');
});

test('status telat tanpa pulang menandai "belum pulang"', () => {
  const s = load().day(D, { 'Jenis Absen': 'MASUK', Jam: '08:20' });
  assert.match(s.det, /belum pulang$/);
});

test('MASUK tepat waktu lengkap dengan pulang', () => {
  const s = load().day(D, { 'Jenis Absen': 'MASUK', Jam: '07:55' }, { 'Jenis Absen': 'PULANG', Jam: '16:00' });
  assert.equal(s.key, 'hadir');
  assert.equal(s.det, 'Masuk 07:55 • Pulang 16:00');
});

test('DI LUAR JAM MASUK tetap dihitung sebagai jam masuk', () => {
  const s = load().day(D, { 'Jenis Absen': 'DI LUAR JAM MASUK', Jam: '09:00' });
  assert.equal(s.key, 'telat');
  assert.equal(s.icon, 'fa-clock');
});

test('semua varian PULANG terpakai sebagai jam pulang', () => {
  for (const j of ['PULANG', 'DI LUAR JAM PULANG', 'PULANG LUAR']) {
    const s = load().day(D, { 'Jenis Absen': 'MASUK', Jam: '07:50' }, { 'Jenis Absen': j, Jam: '16:30' });
    assert.equal(s.key, 'hadir', j);
    assert.match(s.det, /Pulang 16:30/, j);
  }
});

test('PULANG LUAR tanpa MASUK → Lapangan fa-running', () => {
  const s = load().day(D, { 'Jenis Absen': 'PULANG LUAR', Jam: '15:00' });
  assert.equal(s.key, 'hadir');
  assert.equal(s.icon, 'fa-running');
  assert.equal(s.label, 'Lapangan');
});

test('keterangan lengkap (+DL & varian PENDING) pakai ikon Rekap', () => {
  const cases = {
    'IZIN': ['fa-file-signature', 'izin'],
    'IZIN PENDING': ['fa-hourglass-half', 'izin'],
    'SAKIT': ['fa-user-sick', 'sakit'],
    'SAKIT PENDING': ['fa-hourglass-half', 'sakit'],
    'TUGAS': ['fa-briefcase', 'tugas'],
    'DL': ['fa-briefcase', 'tugas'],
    'TUGAS PENDING': ['fa-hourglass-half', 'tugas'],
    'TUBEL': ['fa-graduation-cap', 'tugas'],
    'CUTI': ['fa-umbrella-beach', 'cuti'],
    'TANPA BERITA': ['fa-times', 'alpha'],
  };
  for (const [jenis, [icon, key]] of Object.entries(cases)) {
    const s = load().day(D, { 'Jenis Absen': jenis, Jam: '', Keterangan: 'ket' });
    assert.equal(s.icon, icon, jenis);
    assert.equal(s.key, key, jenis);
  }
});

test('hari tanpa log: future/libur/hari ini/tanpa keterangan', () => {
  const s = load({ liburSet: new Set(['2026-10-16']) });
  s.setWeek({});
  assert.equal(s.status('2026-10-20', false, true).key, 'future');
  assert.equal(s.status('2026-10-16', false, false).key, 'libur');
  assert.equal(s.status(D, true, false).key, 'empty');
  assert.equal(s.status('2026-10-12', false, false).key, 'alpha');
});

test('kartu detail: tanggal + chip status berwarna + chip Masuk/Pulang beranimasi', () => {
  const s = load();
  s.setWeek({ '2026-10-13': [
    { 'Jenis Absen': 'MASUK', Jam: '07:10' },
    { 'Jenis Absen': 'PULANG', Jam: '14:30' },
  ] });
  const html = s.detailHtml(1); // Selasa
  assert.match(html, /class="wk-det-date">Selasa, 13 Okt 2026</);
  assert.match(html, /wk-det-status w-hadir/);
  assert.match(html, /fas fa-check/);
  assert.match(html, /fa-sign-in-alt"><\/i>Masuk 07:10/);
  assert.match(html, /fa-sign-out-alt"><\/i>Pulang 14:30/);
  assert.match(html, /animation-delay:120ms/);
  assert.match(html, /animation-delay:210ms/);
});

test('kartu detail telat: chip Batas ikon jam, status w-telat', () => {
  const s = load();
  s.setWeek({ '2026-10-13': [{ 'Jenis Absen': 'MASUK', Jam: '08:22' }] });
  const html = s.detailHtml(1);
  assert.match(html, /wk-det-status w-telat/);
  assert.match(html, /fa-clock"><\/i>Batas 08:00/);
  assert.match(html, /fa-hourglass-half"><\/i>belum pulang/);
});

test('kartu detail keterangan: chip Ket dengan ikon komentar & teks di-escape', () => {
  const s = load();
  s.setWeek({ '2026-10-13': [{ 'Jenis Absen': 'IZIN', Jam: '', Keterangan: 'Dinas <luar> & rapat' }] });
  const html = s.detailHtml(1);
  assert.match(html, /wk-det-status w-izin/);
  assert.match(html, /fa-comment-dots"><\/i>Dinas &lt;luar&gt; &amp; rapat/);
  assert.ok(!html.includes('<luar>'));
});
