import crypto from 'node:crypto';

// SSO ke aplikasi arsip (peta-ekonomi) lewat cookie lintas-subdomain.
//
// Format token disalin VERBATIM dari peta-ekonomi/server/session.js supaya arsip
// bisa memverifikasinya dengan kodenya sendiri:
//   b64url(JSON { sub, exp }) . base64url( HMAC-SHA256(isi, SESSION_SECRET) )
// Jangan import dari repo peta-ekonomi (deploy terpisah) — rumusnya disalin, dan
// test memastikan hasilnya berpadan.
//
// Rahasianya dari env absensi ARSIP_SESSION_SECRET = SESSION_SECRET peta-ekonomi.
// Bila kosong/pendek → tidak set cookie (fail-open; iframe sekedar tampil login arsip).

export const NAMA_COOKIE = 'arsip_session';
export const MASA_JAM = 8;
export const PANJANG_MINIMUM = 16;

// Domain cookie harus registrable-domain bersama absensi & arsip.
const DOMAIN = '.mindcloud.my.id';

const b64 = (buf) => Buffer.from(buf).toString('base64url');

function tandaTangan(data, secret) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

// Guard fail-open: secret kosong / < 16 char diperlakukan sebagai "tidak ada".
export function bersihkanSecret(s) {
  const t = (s == null ? '' : String(s)).trim();
  return t.length >= PANJANG_MINIMUM ? t : '';
}

export function buatTokenArsip(nip, secret, { jam = MASA_JAM } = {}) {
  if (!secret) throw new Error(`secret belum diatur atau terlalu pendek (minimal ${PANJANG_MINIMUM} karakter)`);
  const isi = b64(JSON.stringify({
    sub: String(nip),
    exp: Math.floor(Date.now() / 1000) + jam * 3600,
  }));
  return `${isi}.${tandaTangan(isi, secret)}`;
}

// origin (host request) tidak dipakai: domain cookie tetap .mindcloud.my.id agar
// dikirim ke iframe arsipdigital.mindcloud.my.id juga. Param dipertahankan untuk
// pemakaian lanjutan bila suatu saat domain dibuat dinamis.
export function pasangArsipCookie(res, nip, { secret, ttlMs = MASA_JAM * 3600 * 1000 } = {}) {
  const s = bersihkanSecret(secret);
  if (!s || !nip) return false;
  res.cookie(NAMA_COOKIE, buatTokenArsip(nip, s), {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    domain: DOMAIN,
    path: '/',
    maxAge: ttlMs,
  });
  return true;
}

export function lepasArsipCookie(res) {
  res.clearCookie(NAMA_COOKIE, { domain: DOMAIN, path: '/' });
}
