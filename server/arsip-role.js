// Role arsipdigital. Harus sama persis dengan peta-ekonomi/server/session.js:
// hak akses arsip (termasuk tulis) ditentukan di sana lewat user_credentials.role,
// bukan lewat user_list yang dipakai absensi untuk IS_ADMIN.
export const R_ADMIN = 'Admin';
export const R_REVIEWER = 'Reviewer';
export const R_STAF = 'Staf';

// Kapitalisasi di database tidak seragam ('Admin', 'ADMIN', 'KABID', 'USER'),
// jadi semua penentuan hak akses lewat normalisasiRole — bukan perbandingan mentah.
const PETA_ROLE = new Map(Object.entries({
  ADMIN: R_ADMIN, ADMINISTRATOR: R_ADMIN,
  KABID: R_REVIEWER, REVIEWER: R_REVIEWER, REVIEW: R_REVIEWER,
  USER: R_STAF, STAF: R_STAF, STAFF: R_STAF, UPLOADER: R_STAF,
}));

export function normalisasiRole(dbRole) {
  if (!dbRole) return R_STAF;
  return PETA_ROLE.get(String(dbRole).trim().toUpperCase()) || R_STAF;
}

// Baca role arsip dari user_credentials (tabel login arsipdigital, database yang
// sama dengan absensi). NIP tanpa baris = Staf. Gagal baca juga Staf (fail-closed):
// lebih baik menolak tulis daripada membuka akses karena database sedang error.
export async function roleArsip(query, nip) {
  if (!nip) return R_STAF;
  try {
    const r = await query('SELECT role FROM user_credentials WHERE nip = $1', [String(nip)]);
    return normalisasiRole(r.rows[0]?.role);
  } catch (e) {
    console.warn('[arsip] gagal baca user_credentials:', e.message);
    return R_STAF;
  }
}
