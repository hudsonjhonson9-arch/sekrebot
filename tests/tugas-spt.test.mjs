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
  // Tanggal penugasan dari API berbentuk timestamp (…T16:00:00.000Z = tengah malam WITA).
  // Kartu monitoring merendernya dengan new Date(v) + toLocaleDateString('id-ID'); dokumen
  // SPT/SPPD harus menyebut hari yang SAMA, bukan hari UTC-nya (dulu meleset 1 hari di WITA).
  const berwaktu = '2026-10-15T16:00:00.000Z';
  const kartu = new Date(berwaktu).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  assert.equal(T.tanggalID(berwaktu), kartu, 'tanggal berwaktu harus sama dengan tampilan kartu monitoring');
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

test('bangunTagsSPT: paraf cetak nama + jabatan dua baris', () => {
  const grup = { items: [{ tanggal: '2026-06-29', keterangan: 'Rakor', nip: '111', nama: 'A' }] };
  const t = T.bangunTagsSPT(grup, {
    tempatTujuan: 'Waingapu',
    paraf: [
      { nip: '901', nama: 'Sek Uji', jabatan: 'Sekretaris' },
      { nip: '', nama: '', jabatan: 'Kepala Bidang Ekonomi' },   // legacy: jabatan saja
      { nip: '903', nama: 'Ktu Uji', jabatan: 'KTU' }
    ]
  }, {});
  assert.equal(t.Paraf1, 'Sek Uji\nSekretaris');
  assert.equal(t.Paraf2, 'Kepala Bidang Ekonomi');
  assert.equal(t.Paraf3, 'Ktu Uji\nKTU');
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

test('bangunTagsSPPD: Bidang & KTU masuk tag, paraf ikut', () => {
  const grup = { items: [{ tanggal: '2026-06-29', keterangan: 'Fasilitasi', nip: '111', nama: 'A' }] };
  const t = T.bangunTagsSPPD({ nip: '111', nama: 'A' }, grup,
    { tanggalBerangkat: '2026-06-29', tanggalKembali: '2026-07-02', tempatTujuan: 'Kupang',
      bidang: { nama: 'Kabid Uji', nip: '902' }, ktu: { nama: 'Ktu Uji', nip: '903' },
      paraf: [{ nip: '901', nama: 'Sek Uji', jabatan: 'Sekretaris' }] }, {});
  assert.equal(t.BidangNama, 'Kabid Uji');
  assert.equal(t.BidangNIP, '902');
  assert.equal(t.KtuNama, 'Ktu Uji');
  assert.equal(t.KtuNIP, '903');
  assert.equal(t.Paraf1, 'Sek Uji\nSekretaris');
});

test('DEFAULT_PERJADIN: bidang = nama keras template lama (anti-regresi SPPD)', () => {
  const t = T.bangunTagsSPPD({ nip: '111', nama: 'A' }, { items: [{ nip: '111', nama: 'A', tanggal: '2026-06-29' }] },
    { tanggalBerangkat: '2026-06-29', tanggalKembali: '2026-06-29' }, {});
  assert.equal(t.BidangNama, 'BERLIAN MAGU WERU,S.Sos', 'default harus mengisi nama lama');
  assert.equal(t.BidangNIP, '19690619 200903 1 001');
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

test('tungguMaster: submit menunggu master, tapi tak menggantung bila master lambat', async () => {
  const win = fresh();
  const win2 = fresh();
  const modal = { style: { display: 'none' } };
  const lama = globalThis.document;
  globalThis.document = {
    getElementById: id => ({ perjadinModal: modal, perjadinInfo: { textContent: '' }, perjadinForm: { elements: {} } }[id] || null)
  };
  try {
    // tanpa master tertunda -> langsung selesai
    await win.TugasSPT.tungguMaster(10);

    let lepas = () => {};
    win.apiGet = () => new Promise(r => { lepas = () => r({ rows: [] }); });
    const grup = { items: [{ id: '1', nip: '111', nama: 'A', tanggal: '2026-07-02', instansi_id: 'INS' }], perjadin: null };
    const buka = win.TugasSPT.bukaModal(grup);

    let selesai = false;
    const tunggu = win.TugasSPT.tungguMaster(2000).then(() => { selesai = true; });
    await new Promise(r => setTimeout(r, 30));
    assert.equal(selesai, false, 'submit harus menunggu selama master masih tertunda');
    lepas();
    await buka; await tunggu;
    assert.equal(selesai, true, 'setelah master selesai, tungguMaster lanjut');

    // master yang tak pernah balas: tetap lanjut lewat batas waktu (tidak menggantung)
    win2.apiGet = () => new Promise(() => {});
    win2.TugasSPT.bukaModal({ items: [{ id: '1', nip: '1', nama: 'A', instansi_id: 'INS' }], perjadin: null });
    const mulai = Date.now();
    await win2.TugasSPT.tungguMaster(40);
    assert.ok(Date.now() - mulai < 1000, 'batas waktu membebaskan submit walau master menggantung');
  } finally {
    if (lama === undefined) delete globalThis.document; else globalThis.document = lama;
  }
});

test('submit menunggu master SEBELUM membaca form (nilai yang terlihat = yang tercetak)', () => {
  const iTunggu = src.indexOf('await tungguMaster();');
  const iBaca = src.indexOf('const p = readForm();');
  assert.ok(iTunggu > -1 && iBaca > -1, 'kedua baris harus ada');
  assert.ok(iTunggu < iBaca, 'submit wajib await tungguMaster() sebelum readForm()');
});

test('validasiPerjadin: kosong -> 4 label wajib, lengkap -> lolos', () => {
  assert.deepEqual(T.validasiPerjadin({}), ['Maksud', 'Tempat Tujuan', 'Tanggal Berangkat', 'Tanggal Kembali']);
  assert.deepEqual(T.validasiPerjadin({ maksud: 'Rakor', tempatTujuan: 'Kupang', tanggalBerangkat: '2026-07-02', tanggalKembali: '2026-07-04' }), []);
  // spasi saja dihitung kosong
  assert.deepEqual(T.validasiPerjadin({ maksud: '  ', tempatTujuan: 'Kupang', tanggalBerangkat: '2026-07-02', tanggalKembali: '2026-07-04' }), ['Maksud']);
});

test('validasiPerjadin: paraf kosong ditolak satu per satu', () => {
  const dasar = { maksud: 'Rakor', tempatTujuan: 'Kupang', tanggalBerangkat: '2026-07-02', tanggalKembali: '2026-07-04' };
  // default paraf terisi jabatan -> tetap lolos (perilaku lama tidak berubah)
  assert.deepEqual(T.validasiPerjadin(dasar), []);
  assert.deepEqual(
    T.validasiPerjadin(Object.assign({}, dasar, {
      paraf: [{ jabatan: 'Sekretaris BAPPERIDA' }, { jabatan: '' }, { jabatan: 'KTU BAPPERIDA' }]
    })),
    ['Paraf 2']
  );
  assert.deepEqual(
    T.validasiPerjadin(Object.assign({}, dasar, { paraf: [{ nip: '1', nama: 'A', jabatan: 'X' }, {}, {}] })),
    ['Paraf 2', 'Paraf 3']
  );
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
  assert.deepEqual(T.defaultsDariMaster({ '111': { jabatan: 'Staf' } }), { kepala: null, sekretaris: null, bidang: null, ktu: null });
  assert.deepEqual(T.defaultsDariMaster(null), { kepala: null, sekretaris: null, bidang: null, ktu: null });
});

test('defaultsDariMaster: Kepala Bidang & KTU ikut dideteksi', () => {
  const idx = {
    '111': { nip: '111', nama: 'Kepala', pangkat: 'IV/c', jabatan: 'Kepala Badan' },
    '112': { nip: '112', nama: 'Sek', jabatan: 'Sekretaris' },
    '113': { nip: '113', nama: 'Kabid', jabatan: 'Kepala Bidang Ekonomi' },
    '114': { nip: '114', nama: 'Ktu', jabatan: 'KTU Bapperida' }
  };
  const d = T.defaultsDariMaster(idx);
  assert.deepEqual(d.bidang, { nama: 'Kabid', nip: '113' });
  assert.deepEqual(d.ktu, { nama: 'Ktu', nip: '114' });
  assert.deepEqual(T.defaultsDariMaster({ '111': { jabatan: 'Staf' } }),
    { kepala: null, sekretaris: null, bidang: null, ktu: null });
  assert.deepEqual(T.defaultsDariMaster(null),
    { kepala: null, sekretaris: null, bidang: null, ktu: null });
});

test('generate: field wajib kosong -> batal + TIDAK menyentuh render (kontrol positif ikut diuji)', async () => {
  const toasts = [];
  const lamaToast = globalThis.showToast;
  globalThis.showToast = (m, t) => toasts.push([m, t]);
  const grup = { items: [{ id: '1', nip: '111', nama: 'A', tanggal: '2026-07-02', keterangan: 'Rakor', instansi_id: 'INS' }] };
  try {
    const win = fresh();
    const calls = [];
    win.bastRenderDocxBlob = async () => { calls.push(1); return new Blob(['x']); };
    win.unduhZipBerkas = async () => true;
    win.apiGet = async () => ({ rows: [] });

    const tolak = await win.TugasSPT.generate(grup, { maksud: '', tempatTujuan: '' });
    assert.equal(tolak, false);
    assert.deepEqual(calls, [], 'render tidak boleh dipanggil saat validasi gagal');
    assert.ok(toasts.some(x => /Wajib diisi: .*Maksud/.test(x[0])), 'toast menyebut field wajib');

    // kontrol positif: perjadin lengkap harus tetap lanjut merender (1 SPT + 1 SPPD)
    // sekaligus membuktikan nilai pejabat benar-benar SAMPAI ke tag dokumen.
    const win2 = fresh();
    const tags = [];
    const zip = [];
    win2.bastRenderDocxBlob = async (t) => { tags.push(t); return new Blob(['x']); };
    win2.unduhZipBerkas = async (berkas, nama) => { zip.push({ berkas, nama }); return true; };
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
    assert.equal(tags[1].KpaNama, 'Kepala Uji', 'kepala juga masuk tag SPPD (KpaNama)');
    assert.equal(tags[1].KepalaNama, 'Kepala Uji');
    // Satu unduhan saja: Chrome memblokir unduhan otomatis ke-2 dst, jadi SPT+SPPD
    // harus keluar sebagai satu .zip, bukan satu berkas per dokumen.
    assert.equal(zip.length, 1, 'tepat satu unduhan (zip)');
    assert.deepEqual(
      zip[0].berkas.map(b => b.nama),
      ['SPT_2026-07-02.docx', 'SPPD_111_2026-07-02.docx'],
      'isi zip: SPT + SPPD dengan nama bertanggal penugasan'
    );
    assert.equal(zip[0].nama, 'SPT-SPPD_2026-07-02.zip', 'nama unduhan .zip');
  } finally {
    if (lamaToast === undefined) delete globalThis.showToast; else globalThis.showToast = lamaToast;
  }
});

test('generate: SPPD gagal -> batal, tidak ada unduhan zip', async () => {
  const grup = { items: [{ id: '1', nip: '111', nama: 'A', tanggal: '2026-07-02', keterangan: 'Rakor', instansi_id: 'INS' }] };
  const win = fresh();
  let unduh = 0;
  win.bastRenderDocxBlob = async (t, tpl) => (String(tpl).startsWith('sppd') ? null : new Blob(['x']));
  win.unduhZipBerkas = async () => { unduh++; return true; };
  win.apiGet = async () => ({ rows: [] });
  const ok = await win.TugasSPT.generate(grup, {
    maksud: 'Rakor', tempatTujuan: 'Kupang', tanggalBerangkat: '2026-07-02', tanggalKembali: '2026-07-04',
    kepala: { nama: 'Kepala Uji', pangkat: 'IV/c', nip: '900' },
    sekretaris: { nama: 'Sek Uji', nip: '901' },
    paraf: [{ jabatan: 'a' }, { jabatan: 'b' }, { jabatan: 'c' }]
  });
  // Dulu nilai balik render SPPD diabaikan -> generate() tetap lapor sukses & menyimpan.
  assert.equal(ok, false, 'SPPD gagal harus membatalkan seluruh proses');
  assert.equal(unduh, 0, 'tidak ada zip setengah isi');
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
