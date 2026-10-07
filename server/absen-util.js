import crypto from 'node:crypto';

const WITA_OFFSET_MS = 8 * 3600 * 1000;

// T2: nilai resmi tanggal/jam absen berasal dari server, bukan body client.
export function witaNow(now = new Date()) {
  const ms = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(ms)) throw new Error('tanggal tidak valid');

  const wita = new Date(ms + WITA_OFFSET_MS);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return {
    tanggal: `${wita.getUTCFullYear()}-${pad(wita.getUTCMonth() + 1)}-${pad(wita.getUTCDate())}`,
    jam: `${pad(wita.getUTCHours())}:${pad(wita.getUTCMinutes())}:${pad(wita.getUTCSeconds())}`,
    isoWita: wita.toISOString(),
  };
}

// Nama hari harus persis sama dengan isi kolom lokasiabsen.hari
// ("senin,selasa,rabu,kamis,jumat"), lowercase, tanpa koma.
const HARI = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];

export function hariIndonesia(now = new Date()) {
  const ms = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(ms)) throw new Error('tanggal tidak valid');
  return HARI[new Date(ms + WITA_OFFSET_MS).getUTCDay()];
}

// T3: token meja divalidasi server-side. Tidak ada tabel token di DB,
// jadi sumber kebenaran adalah env MEJA_TOKENS (JSON: instansi -> [token]).
export function isValidMejaToken(token, instansiId) {
  if (typeof token !== 'string' || !token) return false;

  let map;
  try {
    map = JSON.parse(process.env.MEJA_TOKENS || '{}');
  } catch {
    return false; // fail-closed
  }

  const list = map?.[instansiId];
  if (!Array.isArray(list) || list.length === 0) return false;

  const a = Buffer.from(String(token));
  return list.some((t) => {
    const b = Buffer.from(String(t));
    // timingSafeEqual butuh panjang sama, else throw
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}