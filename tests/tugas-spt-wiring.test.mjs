import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js', 'tugas_lembur.js'), 'utf8');
const sptSrc = fs.readFileSync(path.join(ROOT, 'js', 'tugas-spt.js'), 'utf8');

// Ambil badan renderMonitoringTasks saja (dari deklarasi s.d. assignment window. berikutnya)
// supaya asersi tidak bisa "lolos" karena kode wiring nyangkut di fungsi lain.
function bodyOf(name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + ' harus ada di js/tugas_lembur.js');
  const next = src.indexOf('\n  window.', start + 1);
  return src.slice(start, next > 0 ? next : src.length);
}

test('renderMonitoringTasks: kartu mengelompokkan _activeMonitoringTasks lewat TugasSPT.kelompokkan', () => {
  const body = bodyOf('renderMonitoringTasks');
  assert.match(body, /window\.TugasSPT\.kelompokkan\(_activeMonitoringTasks\)/,
    'kartu harus mengelompokkan _activeMonitoringTasks via TugasSPT.kelompokkan');
});

test('renderMonitoringTasks: tiap kartu punya tombol cetak SPT/SPPD ber-data-grup', () => {
  const body = bodyOf('renderMonitoringTasks');
  assert.match(body, /class="btn-cetak-spt"[^>]*data-grup=/, 'tombol cetak harus membawa data-grup');
  assert.match(body, /SPT\/SPPD/, 'label tombol harus menyebut SPT/SPPD');
});

test('renderMonitoringTasks: klik tombol merutekan ke TugasSPT.bukaModal(grup)', () => {
  const body = bodyOf('renderMonitoringTasks');
  assert.match(body, /querySelectorAll\(['"]\.btn-cetak-spt['"]\)/, 'listener harus dipasang di semua tombol cetak');
  assert.match(body, /dataset\.grup/, 'indeks grup dibaca dari data-grup tombol');
  assert.match(body, /window\.TugasSPT\.bukaModal\(/, 'klik harus memanggil window.TugasSPT.bukaModal');
});

test('index.html: tugas-spt.js dimuat sebelum tugas_lembur.js', () => {
  for (const rel of ['index.html', path.join('www', 'index.html')]) {
    const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const iSpt = html.indexOf('js/tugas-spt.js');
    const iLembur = html.indexOf('js/tugas_lembur.js');
    assert.ok(iSpt >= 0, rel + ': script js/tugas-spt.js belum ada');
    assert.ok(iLembur >= 0, rel + ': script js/tugas_lembur.js tidak ditemukan');
    assert.ok(iSpt < iLembur, rel + ': tugas-spt.js harus dimuat sebelum tugas_lembur.js');
  }
});

// Kontrak data yang diandalkan tombol: kelompokkan() mengembalikan grup yang
// item-nya masih membawa id baris, sehingga grupIndex.get(String(row.id)) bekerja.
test('kelompokkan: tiap item grup masih membawa id baris (kontrak tombol data-grup)', () => {
  const win = {};
  new Function('window', sptSrc)(win);
  const rows = [
    { id: 'a1', tanggal: '2026-06-29', keterangan: 'Rakor', created_by_nip: '1' },
    { id: 'a2', tanggal: '2026-06-29', keterangan: 'Rakor', created_by_nip: '1' }
  ];
  const grup = win.TugasSPT.kelompokkan(rows);
  const index = new Map();
  grup.forEach((g, gi) => g.items.forEach(it => index.set(String(it.id), gi)));
  assert.equal(index.get('a1'), 0);
  assert.equal(index.get('a2'), 0);
});
