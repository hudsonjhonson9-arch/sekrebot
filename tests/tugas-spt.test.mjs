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
