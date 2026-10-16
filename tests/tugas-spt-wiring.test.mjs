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

// Uji perilaku nyata: jalankan renderMonitoringTasks dengan DOM tiruan, lalu pastikan
// tiap tombol membawa nomor grup yang BENAR (bukan indeks kartu) dan klik-nya membuka
// grup itu. Urutan `data` sengaja diacak terhadap urutan grup supaya binding yang salah
// (mis. selalu grup 0, atau indeks kartu alih-alih id baris) tertangkap.
test('renderMonitoringTasks: tombol terikat ke grup yang benar + klik membuka grup itu', () => {
  const win = {};
  new Function('window', sptSrc)(win);

  const rows = [
    { id: 'b1', tanggal: '2026-07-01', keterangan: 'Pengawasan', created_by_nip: '9', status: 'PENDING', nama: 'B', bukti: '' },
    { id: 'a1', tanggal: '2026-06-29', keterangan: 'Rakor', created_by_nip: '1', status: 'PENDING', nama: 'A1', bukti: '' },
    { id: 'a2', tanggal: '2026-06-29', keterangan: 'Rakor', created_by_nip: '1', status: 'SELESAI', nama: 'A2', bukti: 'x.jpg' }
  ];

  const listeners = [];
  const el = {
    innerHTML: '',
    querySelectorAll(sel) {
      assert.equal(sel, '.btn-cetak-spt');
      return [...this.innerHTML.matchAll(/<button[^>]*class="btn-cetak-spt"[^>]*>/g)].map(tag => {
        const grup = (tag[0].match(/data-grup="([^"]*)"/) || [])[1];
        assert.notEqual(grup, undefined, 'tombol cetak harus punya data-grup');
        return {
          dataset: { grup },
          addEventListener(ev, fn) { assert.equal(ev, 'click'); listeners.push({ grup, fn }); }
        };
      });
    }
  };

  const render = new Function('window', '$', '_activeMonitoringTasks',
    bodyOf('renderMonitoringTasks') + '\nreturn renderMonitoringTasks;')(win, () => el, rows);

  const dibuka = [];
  win.TugasSPT.bukaModal = g => dibuka.push(g);
  render(rows);

  // Oracle: nomor grup tiap baris menurut kontrak kelompokkan (item grup membawa id baris).
  const grup = win.TugasSPT.kelompokkan(rows);
  const grupDari = id => String(grup.findIndex(g => g.items.some(i => String(i.id) === id)));
  assert.deepEqual(listeners.map(l => l.grup), [grupDari('b1'), grupDari('a1'), grupDari('a2')],
    'data-grup harus nomor grup sebenarnya, bukan indeks kartu');

  listeners[0].fn();  // tombol milik b1
  listeners[1].fn();  // tombol milik a1
  assert.equal(dibuka.length, 2, 'klik tiap tombol harus membuka tepat satu grup');
  assert.deepEqual(dibuka[0].items.map(i => String(i.id)), ['b1'], 'tombol b1 harus membuka grup b1');
  assert.deepEqual(dibuka[1].items.map(i => String(i.id)).sort(), ['a1', 'a2'],
    'tombol a1 harus membuka grup a1+a2, bukan grup lain');
});
