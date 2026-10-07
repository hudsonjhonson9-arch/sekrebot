import { isValidMejaToken } from './absen-util.js';

const RATE_M = 6371000;
const TENGAH_HARI = 12 * 60; // noon WITA, matches n8n "Validasi Absen"

const toRad = (v) => (v * Math.PI) / 180;

function haversine(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * RATE_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function ipToInt(ip) {
  return ip
    .trim()
    .split('.')
    .reduce((acc, o) => {
      const n = Number(o);
      if (!Number.isInteger(n) || n < 0 || n > 255) throw new Error(`Oktet IP tidak valid: ${o}`);
      return (acc << 8) | n;
    }, 0) >>> 0;
}

function ipInCidr(ip, cidr) {
  try {
    const c = String(cidr).trim();
    if (!c.includes('/')) return ip.trim() === c;
    const [range, prefixRaw] = c.split('/');
    const prefix = Number(prefixRaw);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
    const mask = prefix === 0 ? 0 : ~((1 << (32 - prefix)) - 1) >>> 0;
    return (ipToInt(ip) & mask) === (ipToInt(range) & mask);
  } catch {
    return false;
  }
}

const tolak = (kodeTolak, keterangan) => ({ ok: false, kodeTolak, keterangan });
const terima = (jenisAbsen, namaLokasi, keterangan) => ({ ok: true, jenisAbsen, namaLokasi, keterangan });

function toMenit(v) {
  const m = String(v ?? '').match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

// WFH is a lokasiabsen row named 'WFH', not a body flag (n8n baris 270).
const isWFH = (l) => String(l.Nama_Lokasi || '').trim().toUpperCase() === 'WFH';

const hariCocok = (l, hariIni) => {
  const hari = String(l.hari || '').trim();
  return hari === '' || hari.toLowerCase().split(',').map((s) => s.trim()).includes(String(hariIni).toLowerCase());
};

const BUTUH_KETERANGAN = ['IZIN', 'SAKIT', 'TUGAS'];

export function validateAbsen({ payload = {}, serverTime, employee = {}, settings = {} }) {
  const { hariIni = '', jamMasuk = '', jamPulang = '', tengahHari = TENGAH_HARI, lokasi = [] } = settings;
  const ket = String(payload.keterangan || '').trim() ? String(payload.keterangan) : '';

  if (!employee?.nip) return tolak('NIP_REQUIRED', 'NIP tidak dikenali.');
  const status = String(employee.status || 'AKTIF').toUpperCase();
  if (status === 'NONAKTIF' || status === 'INACTIVE') return tolak('PEGAWAI_NONAKTIF', 'Akun pegawai ini dinonaktifkan.');

  // Meja Absen: n8n only checks token presence; we check the value (T3).
  if (payload.source === 'meja_absen') {
    if (!isValidMejaToken(payload.meja_token, employee.instansi_id)) {
      return tolak('MEJA_TOKEN_INVALID', 'Akses Meja Absen ditolak (Token tidak valid/tidak ditemukan).');
    }
    return terima('MEJA', payload.lokasi_nama || 'Meja Absen', ket);
  }

  // ── Anti-fake GPS ──
  const lat = Number(payload.latitude);
  const lng = Number(payload.longitude);
  const accuracy = Number(payload.horizontal_accuracy) || Number(payload.accuracy) || 0;
  const fp = payload.gps_fingerprint && typeof payload.gps_fingerprint === 'object' ? payload.gps_fingerprint : {};
  if (!(accuracy > 0)) return tolak('GPS_ACCURACY_ZERO', 'Akurasi GPS tidak valid. Nonaktifkan Fake GPS.');
  if (accuracy > 500) return tolak('GPS_WEAK', `Sinyal GPS lemah (${Math.round(accuracy)}m). Coba di area terbuka.`);
  if (accuracy < 3 && fp.has_altitude !== true) {
    return tolak('GPS_ACCURACY_TOO_PERFECT', `Akurasi ${accuracy.toFixed(1)}m terlalu sempurna tanpa data altitude.`);
  }
  const nullCount = [fp.has_altitude === false, fp.has_altitude_acc === false, fp.has_heading === false, fp.has_speed === false]
    .filter(Boolean).length;
  if (nullCount >= 4 && accuracy <= 10) {
    return tolak('GPS_FAKE_FINGERPRINT', 'Profil data GPS tidak lengkap. Nonaktifkan Fake GPS.');
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return tolak('LOKASI_INVALID', 'Koordinat GPS tidak valid.');
  if (lat === 0 && lng === 0) return tolak('LOKASI_INVALID', 'Koordinat GPS 0,0 tidak valid.');

  // ── T2: jenis absen dari jam server, empat pita ──
  const menit = toMenit(serverTime?.jam);
  if (!Number.isFinite(menit)) return tolak('JAM_INVALID', 'Format jam tidak valid.');
  const mMasuk = toMenit(jamMasuk);
  const mPulang = toMenit(jamPulang);

  let jenisAbsen;
  if (!Number.isFinite(mMasuk) || !Number.isFinite(mPulang)) jenisAbsen = 'MASUK';
  // ponytail: <= tengah and < pulang is inconsistent, but it is what n8n ships.
  // Changing it silently would shift real attendance records — confirm before touching.
  else if (menit <= mMasuk) jenisAbsen = 'MASUK';
  else if (menit <= tengahHari) jenisAbsen = 'DI LUAR JAM MASUK';
  else if (menit < mPulang) jenisAbsen = 'DI LUAR JAM PULANG';
  else jenisAbsen = 'PULANG';

  const isPulangLuar = payload.jenis_absen === 'PULANG LUAR' && payload.skip_radius_check === true;
  if (isPulangLuar) jenisAbsen = 'PULANG LUAR';
  else if (payload.jenis_absen === 'KONTROL') jenisAbsen = 'KONTROL';

  if (BUTUH_KETERANGAN.includes(payload.jenis_absen) && !ket) {
    return tolak('KETERANGAN_WAJIB', 'Keterangan wajib diisi untuk jenis absen ini.');
  }

  // Parity with n8n baris 246-249: field staff are away from the office by definition,
  // so office radius is not checked for PULANG LUAR. Canonical juga tidak mewajibkan
  // keterangan di sini — dia meng-default-nya (baris 248), jadi jangan diubah jadi tolak.
  if (isPulangLuar) return terima('PULANG LUAR', 'Lapangan', ket || 'Pulang dari lapangan');

  // ── Lokasi: hari wajib untuk semua, termasuk WFH ──
  const hariLokasi = lokasi.filter((l) => hariCocok(l, hariIni));
  if (hariLokasi.length === 0) {
    return tolak('BUKAN_HARI_KERJA', 'Absensi reguler hanya pada hari kerja lokasi yang terdaftar.');
  }

  const near = hariLokasi.find((l) => {
    if (isWFH(l)) return true;
    const la = Number(l.latitude);
    const lo = Number(l.longitude);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return false;
    const r = Number(l.radius);
    if (!Number.isFinite(r) || r <= 0) return true;
    return haversine(lat, lng, la, lo) <= r;
  });
  if (!near) return tolak('LOKASI_TIDAK_VALID', 'Anda berada di luar radius lokasi kantor.');

  if (!isWFH(near)) {
    const ranges = String(near.ip_range || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (ranges.length && !ranges.some((c) => ipInCidr(String(payload.clientIp || ''), c))) {
      return tolak('IP_TIDAK_VALID', 'IP tidak dikenali untuk lokasi ini.');
    }
  }

  return terima(jenisAbsen, near.Nama_Lokasi, ket);
}

// ── Gate bisnis (node "Validasi Absen" canonical) ──
//
// Keempat gate ini butuh riwayat Log_Absen hari ini, jadi tidak bisa hidup di
// validateAbsen: file itu murni dan tidak boleh menyentuh DB. Router yang
// membaca log dan memanggil evaluateGates di sini.

const GRP_MASUK = ['MASUK', 'DI LUAR JAM MASUK'];
const GRP_PULANG = ['PULANG', 'DI LUAR JAM PULANG', 'PULANG LUAR'];
const GRP_KET = ['IZIN', 'SAKIT', 'TUGAS', 'DL', 'TUBEL', 'CUTI', 'TB', 'TANPA BERITA', 'ALPA'];

const norm = (v) => String(v ?? '').trim().toUpperCase();

/**
 * Kembalikan objek tolak() kalau request SHOULD ditolak, atau null kalau lolos.
 *
 * Baris yang dipakai hanya yang Tanggal + Telegram ID sama dengan pemanggil:
 * `ID` di Log_Absen adalah user_list.id, sedangkan NIP tidak dijamin unik di
 * user_list, jadi memfilter NIP saja bisa menghitung kehadiran orang lain.
 */
export function evaluateGates({ jenisAbsen, serverTime, tanggal, employeeId, rows = [] }) {
  const jA = norm(jenisAbsen);
  const hariIni = rows.filter(
    (r) => String(r.Tanggal ?? '').trim() === tanggal
      && String(r.ID ?? '').trim() === String(employeeId ?? '')
  );
  const menit = toMenit(serverTime?.jam);

  // Duplikat dibandingkan dengan jam SERVER. Canonical memakai body.jam, yang
  // dikendalikan klien, jadi cukup mengirim jam berbeda untuk lolos (T2).
  for (const r of hariIni) {
    const m = toMenit(r.Jam);
    if (Number.isFinite(m) && Number.isFinite(menit) && Math.abs(m - menit) <= 1) {
      return tolak('DUPLIKAT_ABSEN', 'Permintaan absen duplikat. Silakan tunggu sebentar.');
    }
  }

  // Keterangan dicek sebelum gate masuk/pulang: hari yang sudah beralasan tidak
  // perlu absen lagi, dan pesan "sudah ada keterangan" lebih informatif.
  const ket = hariIni.find((r) => GRP_KET.includes(norm(r['Jenis Absen'])));
  if (ket) {
    return tolak('SUDAH_ADA_KETERANGAN', `Anda tidak bisa melakukan absen karena sudah tercatat memiliki keterangan: ${norm(ket['Jenis Absen'])}`);
  }

  if (GRP_MASUK.includes(jA)) {
    if (hariIni.some((r) => GRP_MASUK.includes(norm(r['Jenis Absen'])))) {
      return tolak('SUDAH_ABSEN', 'Pegawai sudah melakukan absen masuk hari ini.');
    }
  }
  if (GRP_PULANG.includes(jA)) {
    if (hariIni.some((r) => GRP_PULANG.includes(norm(r['Jenis Absen'])))) {
      return tolak('SUDAH_ABSEN', 'Pegawai sudah melakukan absen pulang hari ini.');
    }
    // KONTROL sengaja tidak ada di GRP_PULANG: device absen kontrol boleh tanpa
    // absen masuk, jadi tidak ikut memicu BELUM_MASUK.
    if (!hariIni.some((r) => GRP_MASUK.includes(norm(r['Jenis Absen'])))) {
      return tolak('BELUM_MASUK', 'Pegawai belum melakukan absen masuk hari ini.');
    }
  }

  return null;
}