import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Uji SUMBER SEBENARNYA: jalankan js/tugas-spt.js sebagai script klasik di window palsu,
// supaya salinan di tes tidak bisa "lolos" padahal implementasinya beda.
const ROOT = path.resolve(import.meta.dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js', 'tugas-spt.js'), 'utf8');

function load() {
  const win = {};
  new Function('window', src)(win); // top-level tidak boleh menyentuh document
  assert.ok(win.TugasSPT, 'window.TugasSPT harus terdefinisi');
  return win.TugasSPT;
}
const T = load();

test('terbilang: satuan, belasan, puluhan', () => {
  assert.equal(T.terbilang(4), 'Empat');
  assert.equal(T.terbilang(11), 'Sebelas');
  assert.equal(T.terbilang(21), 'Dua Puluh Satu');
  assert.equal(T.terbilang(30), 'Tiga Puluh');
});

test('tanggalID: format Indonesia, aman timezone', () => {
  assert.equal(T.tanggalID('2026-06-29'), '29 Juni 2026');
  assert.equal(T.tanggalID('2026-01-01T00:00:00.000Z'), '1 Januari 2026');
  assert.equal(T.tanggalID(''), '');
});

test('lamaHari: inklusif dari tanggal berangkat s.d. kembali', () => {
  assert.equal(T.lamaHari('2026-06-29', '2026-07-02'), '4 (Empat) Hari');
  assert.equal(T.lamaHari('2026-06-29', '2026-06-29'), '1 (Satu) Hari');
  assert.equal(T.lamaHari('', '2026-07-02'), '');
});

test('kunciGrup: tanggal|keterangan|pemberi', () => {
  assert.equal(
    T.kunciGrup({ tanggal: '2026-06-29', keterangan: 'Rakor', created_by_nip: '123' }),
    '2026-06-29|Rakor|123'
  );
  assert.notEqual(
    T.kunciGrup({ tanggal: '2026-06-29', keterangan: 'Rakor', created_by_nip: '123' }),
    T.kunciGrup({ tanggal: '2026-06-29', keterangan: 'Rakor', created_by_nip: '999' })
  );
});

test('kelompokkan: baris seperjalanan jadi satu grup + bawa perjadin', () => {
  const rows = [
    { id: '1', tanggal: '2026-06-29', keterangan: 'Rakor', created_by_nip: '123', nip: '111', perjadin: { nomor: 'X' } },
    { id: '2', tanggal: '2026-06-29', keterangan: 'Rakor', created_by_nip: '123', nip: '222' },
    { id: '3', tanggal: '2026-07-02', keterangan: 'Fasilitasi', created_by_nip: '123', nip: '333' }
  ];
  const g = T.kelompokkan(rows);
  assert.equal(g.length, 2);
  assert.equal(g[0].items.length, 2);
  assert.equal(g[0].perjadin.nomor, 'X');
  assert.equal(g[1].items.length, 1);
  assert.equal(g[1].perjadin, null);
});

test('bangunTagsSPT: nomor urut pelaksana, 3 slot paraf, Untuk dari keterangan', () => {
  const grup = { items: [
    { tanggal: '2026-06-29', keterangan: 'Rapat Koordinasi', nip: '111', nama: 'A' },
    { tanggal: '2026-06-29', keterangan: 'Rapat Koordinasi', nip: '222', nama: 'B' }
  ] };
  const master = { 111: { nama: 'Acmad', pangkat: 'Penata Muda – III/a', jabatan: 'Pranata Komputer', nip: '111' } };
  const t = T.bangunTagsSPT(grup, { tempatTujuan: 'Waingapu' }, master);
  assert.equal(t.pelaksana.length, 2);
  assert.deepEqual(t.pelaksana.map(x => x.No), [1, 2]);
  assert.equal(t.pelaksana[0].Nama, 'Acmad');
  assert.equal(t.pelaksana[0].PangkatGol, 'Penata Muda – III/a');
  assert.ok(t.Untuk.includes('Waingapu'));
  assert.equal(t.Paraf1, 'Sekretaris BAPPERIDA');
  assert.equal(t.Paraf3, 'KTU BAPPERIDA');
});

test('bangunTagsSPPD: lama hari + nama pegawai dari baris', () => {
  const grup = { items: [{ tanggal: '2026-06-29', keterangan: 'Fasilitasi RKPD', nip: '111', nama: 'Alvian' }] };
  const t = T.bangunTagsSPPD(
    { nip: '111', nama: 'Alvian' }, grup,
    { tanggalBerangkat: '2026-06-29', tanggalKembali: '2026-07-02', tempatTujuan: 'Kupang' },
    { 111: { nama: 'Alvian Zadrakh', pangkat: 'Pembina-IV/a', jabatan: 'Kepala Bidang' } }
  );
  assert.equal(t.Nama, 'Alvian Zadrakh');
  assert.equal(t.LamaHari, '4 (Empat) Hari');
  assert.equal(t.TempatTujuan, 'Kupang');
  assert.equal(t.Nama === t.KpaNama, false);
});

// masterIndex memakai cache modul; tiap tes butuh instance baru (new Function = closure baru).
function fresh() {
  const win = {};
  new Function('window', src)(win);
  assert.ok(win.TugasSPT, 'window.TugasSPT harus terdefinisi');
  return win;
}

test('masterIndex: memetakan nip -> {pangkat, jabatan} dari apiGet palsu', async () => {
  const win = fresh();
  win.apiGet = async () => ({ rows: [{ nip: '123', nama: 'A', pangkat: 'IV/A', jabatan: 'Kabid' }] });
  const idx = await win.TugasSPT.masterIndex();
  assert.equal(idx['123'].pangkat, 'IV/A');
  assert.equal(idx['123'].jabatan, 'Kabid');
  assert.equal(idx['123'].nama, 'A');
});

test('personTag: PangkatGol/Jabatan dari indeks master', () => {
  const idx = { '111': { nama: 'Nama Master', pangkat: 'Penata – III/c', jabatan: 'Kasubbag', nip: '111' } };
  const t = T.personTag({ nip: '111', nama: 'Nama Baris', jabatan: 'Staf' }, idx);
  assert.equal(t.PangkatGol, 'Penata – III/c');
  assert.equal(t.Jabatan, 'Kasubbag');
  // Presedensi eksisting (dijaga tes bangunTagsSPT/SPPD): master menang saat punya nama.
  assert.equal(t.Nama, 'Nama Master');
  // Nama baris dipakai bila master tanpa nama.
  const t2 = T.personTag({ nip: '222', nama: 'Nama Baris 2' }, { '222': { pangkat: 'IX', jabatan: 'Kabid' } });
  assert.equal(t2.Nama, 'Nama Baris 2');
});

test('personTag: pelaksana tak ada di master jatuh ke baris, pangkat kosong', () => {
  const t = T.personTag({ nip: '999', nama: 'Bud', jabatan: 'Staf' }, {});
  assert.equal(t.Nama, 'Bud');
  assert.equal(t.PangkatGol, '');
  assert.equal(t.Jabatan, 'Staf');
  assert.equal(t.NIP, '999');
});

test('masterIndex: meneruskan instansi_id grup ke apiGet', async () => {
  const win = fresh();
  let got = null, endpoint = null;
  win.apiGet = async (ep, params) => { endpoint = ep; got = params; return { rows: [] }; };
  await win.TugasSPT.masterIndex('INS-1');
  assert.deepEqual(got, { instansi_id: 'INS-1' });
  assert.equal(typeof endpoint, 'string');

  const win2 = fresh();
  let got2 = null;
  win2.apiGet = async (ep, params) => { got2 = params; return { rows: [] }; };
  await win2.TugasSPT.masterIndex();
  assert.deepEqual(got2, {});
});

test('masterIndex: kegagalan fetch TIDAK di-cache (bisa pulih tanpa reload)', async () => {
  const win = fresh();
  let gagal = true;
  win.apiGet = async () => {
    if (gagal) throw new Error('jaringan putus');
    return { rows: [{ nip: '7', nama: 'A', jabatan: 'Kepala Badan', pangkat: 'IV' }] };
  };
  const kosong = await win.TugasSPT.masterIndex('INS');
  assert.deepEqual(kosong, {}, 'gagal -> indeks kosong, tidak melempar');
  gagal = false;
  const idx = await win.TugasSPT.masterIndex('INS');
  assert.equal((idx['7'] || {}).jabatan, 'Kepala Badan', 'percobaan berikutnya mencoba fetch ulang (tidak teracuni)');
});

test('bukaModal: dialog tampil SEBELUM master termuat (apiGet lambat tidak menahan dialog)', async () => {
  const win = fresh();
  const modal = { style: { display: 'none' } };
  const elements = {};
  const lama = globalThis.document;
  globalThis.document = {
    getElementById: id => ({ perjadinModal: modal, perjadinInfo: { textContent: '' }, perjadinForm: { elements } }[id] || null)
  };
  try {
    let lepas = () => {};
    win.apiGet = () => new Promise(r => { lepas = () => r({ rows: [] }); });
    const grup = { items: [{ id: '1', nip: '111', nama: 'A', tanggal: '2026-07-02', keterangan: 'R', instansi_id: 'INS' }], perjadin: null };
    const jalan = win.TugasSPT.bukaModal(grup);
    assert.equal(modal.style.display, 'flex', 'dialog sudah tampil walau /api/user-list belum balas');
    lepas();
    await jalan;
    assert.equal(modal.style.display, 'flex');
  } finally {
    if (lama === undefined) delete globalThis.document; else globalThis.document = lama;
  }
});

test('validasiPerjadin: kosong -> 4 label wajib, lengkap -> lolos', () => {
  assert.deepEqual(T.validasiPerjadin({}), ['Maksud', 'Tempat Tujuan', 'Tanggal Berangkat', 'Tanggal Kembali']);
  assert.deepEqual(T.validasiPerjadin({ maksud: 'Rakor', tempatTujuan: 'Kupang', tanggalBerangkat: '2026-07-02', tanggalKembali: '2026-07-04' }), []);
  // spasi saja dihitung kosong
  assert.deepEqual(T.validasiPerjadin({ maksud: '  ', tempatTujuan: 'Kupang', tanggalBerangkat: '2026-07-02', tanggalKembali: '2026-07-04' }), ['Maksud']);
});

test('defaultsDariMaster: Kepala Badan & Sekretaris diambil dari jabatan master', () => {
  const idx = {
    '111': { nip: '111', nama: 'Bukan', pangkat: 'III/a', jabatan: 'Pranata Komputer' },
    '222': { nip: '222', nama: 'Kepala', pangkat: 'IV/c', jabatan: 'Kepala Badan' },
    '333': { nip: '333', nama: 'Sek', pangkat: 'IV/a', jabatan: 'Sekretaris' }
  };
  const d = T.defaultsDariMaster(idx);
  assert.deepEqual(d.kepala, { nama: 'Kepala', pangkat: 'IV/c', nip: '222' });
  assert.deepEqual(d.sekretaris, { nama: 'Sek', nip: '333' });
  // tidak ada yang cocok -> null (pemanggil kembali ke DEFAULT_PERJADIN)
  assert.deepEqual(T.defaultsDariMaster({ '111': { jabatan: 'Staf' } }), { kepala: null, sekretaris: null });
  assert.deepEqual(T.defaultsDariMaster(null), { kepala: null, sekretaris: null });
});

test('generate: field wajib kosong -> batal + TIDAK menyentuh render (kontrol positif ikut diuji)', async () => {
  const toasts = [];
  const lamaToast = globalThis.showToast;
  globalThis.showToast = (m, t) => toasts.push([m, t]);
  const grup = { items: [{ id: '1', nip: '111', nama: 'A', tanggal: '2026-07-02', keterangan: 'Rakor', instansi_id: 'INS' }] };
  try {
    const win = fresh();
    const calls = [];
    win.bastRenderDocx = async () => { calls.push(1); return true; };
    win.apiGet = async () => ({ rows: [] });

    const tolak = await win.TugasSPT.generate(grup, { maksud: '', tempatTujuan: '' });
    assert.equal(tolak, false);
    assert.deepEqual(calls, [], 'render tidak boleh dipanggil saat validasi gagal');
    assert.ok(toasts.some(x => /Wajib diisi: .*Maksud/.test(x[0])), 'toast menyebut field wajib');

    // kontrol positif: perjadin lengkap harus tetap lanjut merender (1 SPT + 1 SPPD)
    // sekaligus membuktikan nilai pejabat benar-benar SAMPAI ke tag dokumen.
    const win2 = fresh();
    const tags = [];
    win2.bastRenderDocx = async (t) => { tags.push(t); return true; };
    win2.apiGet = async () => ({ rows: [] });
    const lanjut = await win2.TugasSPT.generate(grup, {
      maksud: 'Rakor', tempatTujuan: 'Kupang', tanggalBerangkat: '2026-07-02', tanggalKembali: '2026-07-04',
      kepala: { nama: 'Kepala Uji', pangkat: 'IV/c', nip: '900' },
      sekretaris: { nama: 'Sek Uji', nip: '901' },
      paraf: [{ jabatan: 'Sekretaris BAPPERIDA' }, { jabatan: 'Kabid X' }, { jabatan: 'Kasubbag Y' }]
    });
    assert.equal(lanjut, true);
    assert.equal(tags.length, 2, 'SPT + 1 SPPD di-render');
    assert.equal(tags[0].KepalaNama, 'Kepala Uji', 'nama kepala masuk tag SPT');
    assert.equal(tags[0].KepalaNIP, '900');
    assert.equal(tags[0].Paraf1, 'Sekretaris BAPPERIDA');
    assert.equal(tags[0].Paraf3, 'Kasubbag Y');
    assert.equal(tags[1].SekretarisNama, 'Sek Uji', 'nama sekretaris masuk tag SPPD');
    assert.equal(tags[1].SekretarisNIP, '901');
  } finally {
    if (lamaToast === undefined) delete globalThis.showToast; else globalThis.showToast = lamaToast;
  }
});

// Membuktikan editan pejabat di form benar-benar sampai ke objek perjadin (dan sebaliknya),
// bukan sekadar "nama field ada di sumber" — lubang yang ditemukan reviewer fix round.
test('readForm/fillForm: dua arah lewat DOM tiruan (editan pejabat sampai ke perjadin)', () => {
  const Mod = load();
  const isi = {
    nomor: '005/SPT', ditetapkanDi: 'Kupang', kepalaNama: 'Kepala Uji', kepalaPangkat: 'IV/c',
    kepalaNIP: '900', sekretarisNama: 'Sek Uji', sekretarisNIP: '901',
    paraf1: 'Sekretaris BAPPERIDA', paraf2: 'Kabid X', paraf3: 'Kasubbag Y'
  };
  const elements = {};
  for (const n of Object.keys(isi)) elements[n] = { value: isi[n], style: {} };
  const lama = globalThis.document;
  globalThis.document = { getElementById: id => (id === 'perjadinForm' ? { elements } : null) };
  try {
    const p = Mod.readForm({});
    assert.equal(p.ditetapkanDi, 'Kupang');
    assert.equal(p.kepala.nama, 'Kepala Uji', 'kepala dari form harus menang atas default');
    assert.equal(p.kepala.pangkat, 'IV/c');
    assert.equal(p.kepala.nip, '900');
    assert.equal(p.sekretaris.nama, 'Sek Uji');
    assert.equal(p.sekretaris.nip, '901');
    assert.equal(p.paraf[0].jabatan, 'Sekretaris BAPPERIDA');
    assert.equal(p.paraf[2].jabatan, 'Kasubbag Y');
    // fillForm menulis balik + membersihkan border merah sisa submit sebelumnya
    elements['kepalaNama'].style.borderColor = 'rgb(220, 53, 69)';
    elements['sekretarisNama'].value = 'harus tertimpa';
    Mod.fillForm({ kepala: { nama: 'Hasil Isi', pangkat: 'X', nip: '1' }, sekretaris: { nama: 'Sek Isi', nip: '2' }, paraf: [{ jabatan: 'P1' }] });
    assert.equal(elements['kepalaNama'].value, 'Hasil Isi');
    assert.equal(elements['kepalaNama'].style.borderColor, '', 'border merah dibersihkan fillForm');
    assert.equal(elements['sekretarisNama'].value, 'Sek Isi');
    assert.equal(elements['paraf1'].value, 'P1');
    assert.equal(elements['paraf2'].value, '');
  } finally {
    if (lama === undefined) delete globalThis.document; else globalThis.document = lama;
  }
});

test('modal #perjadinModal: tiap field ter-wiring di readForm DAN fillForm (index.html + www)', () => {
  const iRead = src.indexOf('function readForm(');
  const iFill = src.indexOf('function fillForm(');
  const iBuka = src.indexOf('async function bukaModal(');
  assert.ok(iRead > 0 && iFill > iRead && iBuka > iFill, 'struktur readForm/fillForm/bukaModal wajar');
  const baca = new Set([...src.slice(iRead, iFill).matchAll(/\bg\('([A-Za-z0-9]+)'\)/g)].map(m => m[1]));
  const isi = new Set([...src.slice(iFill, iBuka).matchAll(/\bset\('([A-Za-z0-9]+)'/g)].map(m => m[1]));
  assert.ok(baca.size >= 20 && isi.size >= 20, 'ekstraksi nama field wajar: baca=' + baca.size + ' isi=' + isi.size);
  for (const file of ['index.html', 'www/index.html']) {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const modalAll = html.slice(html.indexOf('id="perjadinModal"'), html.indexOf('</form>', html.indexOf('id="perjadinForm"')));
    const namaHtml = new Set([...modalAll.matchAll(/name="([A-Za-z0-9]+)"/g)].map(m => m[1]));
    assert.ok(namaHtml.size >= 20, file + ': field modal terbaca, dapat ' + namaHtml.size);
    for (const [label, kumpulan] of [['readForm', baca], ['fillForm', isi]]) {
      const kurang = [...namaHtml].filter(n => !kumpulan.has(n));
      const lebih = [...kumpulan].filter(n => !namaHtml.has(n));
      assert.deepEqual(kurang, [], file + ': field di form tapi tak di-' + label + ' -> ' + kurang.join(', '));
      assert.deepEqual(lebih, [], file + ': ' + label + ' menunjuk field yang tak ada di form -> ' + lebih.join(', '));
    }
  }
  // www = salinan APK yang dikirim; tanpa ini, mirroring bisa lupa dan APK basi lolos.
  assert.ok(
    fs.readFileSync(path.join(ROOT, 'js', 'tugas-spt.js')).equals(fs.readFileSync(path.join(ROOT, 'www', 'js', 'tugas-spt.js'))),
    'www/js/tugas-spt.js harus identik byte-per-byte dengan js/tugas-spt.js'
  );
});
