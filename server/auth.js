import { query } from './db.js';

export const MEDIA_ROLES = new Set([
  'ADMIN',
  'SUPERADMIN',
  'KEPALA',
  'SEKRETARIS',
  'KABID',
  'IRBAN',
]);

// Token sesi nyata = public.create_session() -> encode(gen_random_bytes(48),'hex'),
// jadi 192 hex huruf kecil. Forma lain (mis. legacy `usr_<id>_<ts>` dari n8n) ditolak
// di sini, sebelum database disentuh.
const SESSION_TOKEN_RE = /^[0-9a-f]{192}$/;

// Header tanpa skema ("usr_1_2") juga diterima; skema selain "bearer" ditolak.
export function bearerToken(req) {
  const raw = (req.headers?.authorization || '').trim();
  if (!raw) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(raw);
  if (m) return m[1];
  // Skema tanpa kredensial ("Bearer") ditolak; bentuk tanpa skema harus satu kata tanpa spasi.
  return /^\S+$/.test(raw) && !/^bearer$/i.test(raw) ? raw : null;
}

export function isSessionToken(token) {
  return typeof token === 'string' && SESSION_TOKEN_RE.test(token);
}

// Satu statement. session_token punya index unik (auth_sessions_session_token_key),
// jadi lookup-nya indeks. `role` dan `instansi_id` diambil dari user_list, BUKAN dari
// baris sesi: role di auth_sessions hanya snapshot saat login, jadi user yang di-
// downgrade masih membawa privilege lamanya sampai token 24 jamnya kadaluarsa. Join
// yang meleset (user dihapus) -> nol baris -> 401, tanpa jatuh ke snapshot.
// `u.id::text` disengaja: user_list.id itu bigint, dan parser default node-postgres
// (OID 20/int8) sudah mengembalikan string, jadi tanpa cast ini id diam-diam bisa
// berubah tipe. Text juga satu-satunya yang aman: max(id) live 9999999999 > int4.
// TANPA `LIMIT 1` — user_list."NIP" hanya punya index NON-unique, jadi NIP ganda
// mem-fan-out join ini dan LIMIT 1 akan memilih satu baris secara acak (lihat
// singleSessionRow). Memakai DISTINCT tidak menolong: id/NIP/role ikut tercampur.
export const SESSION_LOOKUP_SQL =
  'SELECT u.id::text AS id, u."NIP" AS nip, u.role, u.instansi_id ' +
  'FROM auth_sessions s ' +
  'JOIN user_list u ON u."NIP" = s.nip ' +
  'WHERE s.session_token = $1 AND s.is_active AND s.expires_at > now()';

// Nol baris = sesi tak dikenal/kedaluwarsa. Lebih dari satu = NIP dobel di user_list,
// jadi request ini tidak bisa dikaitkan ke tepat satu identitas: JANGAN pernah pilih
// salah satu, karena "baris mana yang kebetulan duluan" menentukan otorisasi.
// Keduanya dikembalikan sebagai null -> 401 yang sama persis, jadi ambiguitas data
// tidak bocor sebagai token yang valid (500 justru akan membocorkan itu).
export function singleSessionRow(rows) {
  return rows.length === 1 ? rows[0] : null;
}

async function defaultLookup(sessionToken) {
  const { rows } = await query(SESSION_LOOKUP_SQL, [sessionToken]);
  return singleSessionRow(rows);
}

export function requireRole(roles, deps = {}) {
  const lookup = deps.lookup || defaultLookup;
  // Semua yang bisa gagal (await lookup, roles.has dari pemanggil yang salah bentuk,
  // res.status) ada DI DALAM try, jadi fungsi async ini tidak pernah menolak: Express 4
  // tidak meneruskan rejected promise ke error handler, dan penolakan seperti itu akan
  // menggantung request selamanya. next() disinkronkan dan di luar try.
  return async function authMiddleware(req, res, next) {
    const token = bearerToken(req);
    // 401 yang sama untuk tanpa token / token rusak / tak dikenal / kedaluwarsa,
    // supaya statusnya tidak membocorkan apakah token itu ada.
    if (!isSessionToken(token)) return unauthorized(res);
    let row;
    let role;
    try {
      row = await lookup(token);
      if (!row) return unauthorized(res);
      role = String(row.role || '').trim().toUpperCase();
      if (!roles.has(role)) {
        return res.status(403).json({ ok: false, message: 'Forbidden' });
      }
    } catch {
      // DB mati = 500, bukan next(): error lookup yang jatuh ke next() akan
      // mengubah outage menjadi bypass otorisasi.
      return res.status(500).json({ ok: false, message: 'Gagal memverifikasi sesi' });
    }
    // id tetap string (lihat ::text di SQL): Task 5 harus memakainya lewat String(),
    // jangan pernah `req.user.id === <number>`.
    req.user = { id: row.id, nip: row.nip, role, instansi_id: row.instansi_id };
    next();
  };
}

function unauthorized(res) {
  return res.status(401).json({ ok: false, message: 'Unauthorized' });
}

export function sameInstansi(user, targetInstansiId) {
  if (user?.role === 'SUPERADMIN') return true;
  // null/undefined = pemanggil tidak meminta pembatasan (mis. endpoint global).
  if (targetInstansiId === null || targetInstansiId === undefined) return true;
  // '' BUKAN "tanpa filter": user_list menyimpan '' untuk user tanpa instansi, jadi
  // fail-open di sini membuat setiap user tanpa instansi cocok dengan setiap target
  // tanpa instansi — kebocoran lintas instansi. Fail-closed.
  if (targetInstansiId === '') return false;
  return String(user?.instansi_id) === String(targetInstansiId);
}
