// Generator kode aset unik: SINGKATAN-NAMA-KATEGORI-TAHUN-HARGA
// Contoh: "Komputer PC/-All in one", Elektronik/TIK, 2025, 8702400
//          → KPC-ELEKTRONIKTIK-2025-8702400
// Port dari util.py aplikasi referensi aset-bapperida (kategori_from_kode/guess_kategori).

const STOP = new Set(['DAN', 'DI', 'KE', 'DARI', 'UNTUK', 'DENGAN', 'YANG', 'ATAU',
  'IN', 'ON', 'AT', 'OF', 'THE', 'A', 'AN', 'ALL', 'ONE', 'TIPE', 'TYPE', 'UNIT',
  'NO', 'NOMOR', 'SERI', 'IS', 'BY']);

// Singkatan nama: huruf awal tiap kata; kata akronim kapital asli (PC, AC, LCD)
// diambil utuh; kata penghubung & angka dilewati; maks 6 karakter.
export function singkatanNama(nama) {
  const raws = String(nama || '').split(/[^A-Za-z0-9]+/).filter(Boolean);
  let out = '';
  for (const raw of raws) {
    if (out.length >= 6) break;
    const w = raw.toUpperCase();
    if (!/[A-Z]/.test(w)) continue;
    if (STOP.has(w)) continue;
    if (raw === w && raw.length >= 2 && raw.length <= 4) {
      if (out.length + w.length > 6) break;
      out += w;
    } else out += w[0];
  }
  return out || 'ASSET';
}

// Kategori dari segmen ke-3/kode KIB 1.3.2.xx... (port util.kategori_from_kode).
export function kategoriDariKode(kode) {
  const p = String(kode || '').split('.');
  if (p.length < 4 || p[0] !== '1' || p[1] !== '3') return null;
  const g = p[2];
  if (g === '1') return 'Tanah';
  if (g === '3') return 'Gedung dan Bangunan';
  if (g === '4') return 'Jalan, Irigasi dan Jaringan';
  if (g === '5') return 'Aset Tetap Lainnya';
  if (g === '6') return 'Konstruksi Dalam Pengerjaan';
  if (g === '2') {
    const s = p[3];
    if (s === '02') return 'Kendaraan';
    if (s === '10' || s === '06') return 'Elektronik/TIK';
    if (s === '05') return p[4] === '02' ? 'Mebel' : 'Peralatan Kantor';
  }
  return null;
}

// Tebak kategori dari nama bila kode KIB tidak membantu (port util.guess_kategori).
export function guessKategori(nama, kode) {
  const k = kategoriDariKode(kode);
  if (k) return k;
  const n = String(nama || '').toLowerCase();
  if (['mobil', 'motor', 'kendaraan'].some(x => n.includes(x))) return 'Kendaraan';
  if (['laptop', 'notebook', 'komputer', 'pc', 'server', 'printer', 'jaringan', 'gis',
    'perangkat analisis', 'perangkat pengolah', 'perangkat sistem', 'perangkat pemetaan',
    'monitor', 'scanner', 'proyektor', 'lcd', 'hardisk', 'harddisk'].some(x => n.includes(x))) return 'Elektronik/TIK';
  if (['meja', 'kursi', 'sofa', 'lemari', 'inventaris ruang'].some(x => n.includes(x))) return 'Mebel';
  if (['atk', 'alat tulis', 'administrasi', 'rak ', 'filing'].some(x => n.includes(x))) return 'Peralatan Kantor';
  return 'Lainnya';
}

export function bersihKategori(kat) {
  return String(kat || '').toUpperCase().replace(/[^A-Z0-9]/g, '') || null;
}

// Kode dasar (tanpa urutan tabrakan): SINGKATAN-KATEGORI-TAHUN-HARGA
export function buatKodeAset({ nama, kategori, kodeBarang, tahun, harga } = {}) {
  const sing = singkatanNama(nama);
  const kat = bersihKategori(kategori) || bersihKategori(kategoriDariKode(kodeBarang))
    || bersihKategori(guessKategori(nama, kodeBarang)) || 'LAINNYA';
  const th = String(tahun == null ? '' : tahun).replace(/\D/g, '') || '0000';
  const hr = Math.max(0, Math.round(Number(harga) || 0));
  return `${sing}-${kat}-${th}-${hr}`;
}

// Kode dasar yang tabrak (nama+kategori+tahun+harga sama) diberi akhiran -2, -3, ...
// list: [{key, dasar}] → Map key → kode final. Urutan per dasar mengikuti key (stabil).
export function beriUrutan(list) {
  const kel = new Map();
  for (const it of list) {
    if (!kel.has(it.dasar)) kel.set(it.dasar, []);
    kel.get(it.dasar).push(it);
  }
  const out = new Map();
  for (const [dasar, items] of kel) {
    items.sort((a, b) => String(a.key).localeCompare(String(b.key)));
    items.forEach((it, i) => out.set(it.key, i === 0 ? dasar : `${dasar}-${i + 1}`));
  }
  return out;
}
