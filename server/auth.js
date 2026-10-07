import crypto from 'node:crypto';
import { query } from './db.js';

export const MEDIA_ROLES = new Set([
  'ADMIN',
  'SUPERADMIN',
  'KEPALA',
  'SEKRETARIS',
  'KABID',
  'IRBAN',
]);

// Absen boleh dipakai seluruh peran media ditambah USER dan INSPEKTUR, sesuai
// node "Check Role Absen" canonical. Daftar peran media tidak ditulis ulang:
//-media.js dan USER/INSPEKTUR itu satu-satunya selisihnya.
export const ABSEN_ROLES = new Set(['USER', 'INSPEKTUR', ...MEDIA_ROLES]);

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

// Token perangkat Meja Absen: 'dv_' + 64 hex (32 byte acak). Prefiks 'dv_' yang
// membedakan bentuknya dari token sesi, jadi satu header Authorization cukup untuk
// keduanya dan requireRole tidak perlu tahu pemanggilnya siapa lebih dulu.
const DEVICE_TOKEN_RE = /^dv_[0-9a-f]{64}$/;

export function isDeviceToken(token) {
  return typeof token === 'string' && DEVICE_TOKEN_RE.test(token);
}

// Disimpan sebagai hash, bukan plaintext seperti auth_sessions: token perangkat
// berumur berbulan-bulan, jadi isi tabel yang bocor tidak boleh langsung jadi token
// hidup. SHA-256 cukup karena tokennya 256 bit acak, tidak perlu bcrypt/argon.
export function hashDeviceToken(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
}

// Sama seperti SESSION_LOOKUP_SQL: role dan instansi diambil dari user_list, bukan
// dari kolom device_sessions, supaya lowering role tetap berlaku seketika tanpa
// menunggu token kedaluwarsa. revoked_at IS NULL writable di luar is_active supaya
// token yang dicabut tidak bisa dihidupkan lagi dengan sekadar menggeser flag.
export const DEVICE_LOOKUP_SQL =
  'SELECT u.id::text AS id, u."NIP" AS nip, u.role, u.instansi_id ' +
  'FROM device_sessions d ' +
  'JOIN user_list u ON u.id::text = d.user_id ' +
  'WHERE d.token_hash = $1 AND d.is_active AND d.revoked_at IS NULL ' +
  'AND (d.expires_at IS NULL OR d.expires_at > now())';

// Satu statement. session_token punya index unik (auth_sessions_session_token_key),
// jadi lookup-nya indeks. `role` dan `instansi_id` diambil dari user_list, BUKAN dari
// baris sesi: role di auth_sessions hanya snapshot saat login, jadi user yang di-
// downgrade masih membawa privilege lamanya sampai token 24 jamnya kadaluarsa. Join
// yang meleset (user dihapus) -> nol baris -> 401, tanpa jatuh ke snapshot.
// `u.id::text` disengaja: user_list.id itu bigint, dan parser default node-postgres
// (OID 20/int8) sudah mengembalikan string, jadi tanpa cast ini id diam-diam bisa
// berubah tipe. Text juga satu-satunya yang aman: max(id) live 9999999999 > int4.
// Join lewat `s.user_id`, bukan `s.nip`: user_list."NIP" hanya punya index NON-unique,
// jadi NIP dobel mem-fan-out join dan mengunci pengguna yang sah tidak bisa absen sama
// sekali (lihat singleSessionRow). user_id diisi saat sesi terbit dan nilainya primary key.
// Cast-nya di sisi u.id, bukan s.user_id::bigint: itu membuat join tidak bisa bantuan
// index, tapi Planner memindai user_list (47 baris) sekali per lookup sehingga jauh
// lebih murah daripada casts yang bisa gagal diam-diam kalau ada baris rusak.
// ponytail: hash scan 47 baris per session, tidak masalah; kalau user_list jadi
// ratusan ribu, pakai u.id = s.user_id::bigint plus index.
export const SESSION_LOOKUP_SQL =
  'SELECT u.id::text AS id, u."NIP" AS nip, u.role, u.instansi_id ' +
  'FROM auth_sessions s ' +
  'JOIN user_list u ON u.id::text = s.user_id ' +
  'WHERE s.session_token = $1 AND s.is_active AND s.expires_at > now()';

// Nol baris = sesi tak dikenal/kedaluwarsa. Lebih dari satu = user_list berubah
// sehingga id yang sama terduplikasi, jadi request ini tidak bisa dikaitkan ke tepat
// satu identitas: JANGAN pernah pilih salah satu, karena "baris mana yang kebetulan
// duluan" menentukan otorisasi.
// Keduanya dikembalikan sebagai null -> 401 yang sama persis, jadi ambiguitas data
// tidak bocor sebagai token yang valid (500 justru akan membocorkan itu).
export function singleSessionRow(rows) {
  return rows.length === 1 ? rows[0] : null;
}

async function defaultLookup(sessionToken, kind) {
  // Hash hanya untuk token perangkat; token sesi sudah acak dan disimpan plaintext
  // oleh create_session(), jadi bentuk lamanya harus tetap cocok.
  const sql = kind === 'device' ? DEVICE_LOOKUP_SQL : SESSION_LOOKUP_SQL;
  const params = kind === 'device' ? [hashDeviceToken(sessionToken)] : [sessionToken];
  const { rows } = await query(sql, params);
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
    const kind = isSessionToken(token) ? 'session' : isDeviceToken(token) ? 'device' : null;
    if (!kind) return unauthorized(res);
    let row;
    let role;
    try {
      row = await lookup(token, kind);
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
    req.authKind = kind;
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
