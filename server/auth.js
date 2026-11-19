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

// Absen boleh dipakai seluruh peran media ditambah USER, INSPEKTUR, dan
// BENDAHARA BARANG (staf bendahara barang tetap harus bisa absen & baca log sendiri).
export const ABSEN_ROLES = new Set(['USER', 'INSPEKTUR', 'BENDAHARA BARANG', ...MEDIA_ROLES]);

// BENDAHARA BARANG = staf bendahara barang: admin aset (SIMAPO) saja, BUKAN media.
// Sengaja tidak masuk MEDIA_ROLES supaya tidak mendapat tulis log manual
// (log.js) atau endpoint media lain; hanya dipakai mount /api/simapo.
export const SIMAPO_ROLES = new Set([...MEDIA_ROLES, 'BENDAHARA BARANG']);

// Token sesi nyata = public.create_session() -> encode(gen_random_bytes(48),'hex'),
// jadi 192 hex huruf kecil. Forma lain (mis. legacy `usr_<id>_<ts>` dari n8n) ditolak
// di sini, sebelum database disentuh.
const SESSION_TOKEN_RE = /^[0-9a-f]{192}$/;

// Header tanpa skema ("usr_1_2") juga diterima; skema selain "bearer" ditolak.
// Untuk tag <img src="/api/media/raw/:fileId?token=..."> (yang tidak bisa mengirim
// header Authorization), token query diterima khusus untuk GET /api/media/raw/*.
export function bearerToken(req) {
  const raw = (req.headers?.authorization || '').trim();
  if (raw) {
    const m = /^Bearer\s+(\S+)$/i.exec(raw);
    if (m) return m[1];
    // Skema tanpa kredensial ("Bearer") ditolak; bentuk tanpa skema harus satu kata tanpa spasi.
    return /^\S+$/.test(raw) && !/^bearer$/i.test(raw) ? raw : null;
  }
  const qTok = req.method === 'GET' && /^\/raw\//.test(String(req.path || ''))
    ? String(req.query?.token || '').trim()
    : '';
  return qTok && (SESSION_TOKEN_RE.test(qTok) || DEVICE_TOKEN_RE.test(qTok)) ? qTok : null;
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
  'SELECT u.id::text AS id, u."NIP" AS nip, u.role, u.is_admin, u.instansi_id ' +
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
  'SELECT u.id::text AS id, u."NIP" AS nip, u.role, u.is_admin, u.instansi_id ' +
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

const DEFAULT_CACHE_TTL_MS = 15000;
const DEFAULT_CACHE_MAX_ENTRIES = 500;

export function createSessionCache({ ttlMs = DEFAULT_CACHE_TTL_MS, maxEntries = DEFAULT_CACHE_MAX_ENTRIES } = {}) {
  const entries = new Map();
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (Date.now() > entry.expiresAt) {
        entries.delete(key);
        return undefined;
      }
      return entry.row;
    },
    set(key, row) {
      if (!row) return;
      if (entries.has(key)) entries.delete(key);
      while (entries.size >= maxEntries) {
        const oldest = entries.keys().next().value;
        entries.delete(oldest);
      }
      entries.set(key, { row, expiresAt: Date.now() + ttlMs });
    },
    delete(key) {
      entries.delete(key);
    },
    clear() {
      entries.clear();
    },
    get size() {
      return entries.size;
    },
  };
}

async function queryLookup(doQuery, sessionToken, kind) {
  // Hash hanya untuk token perangkat; token sesi sudah acak dan disimpan plaintext
  // oleh create_session(), jadi bentuk lamanya harus tetap cocok.
  const sql = kind === 'device' ? DEVICE_LOOKUP_SQL : SESSION_LOOKUP_SQL;
  const params = kind === 'device' ? [hashDeviceToken(sessionToken)] : [sessionToken];
  const { rows } = await doQuery(sql, params);
  return singleSessionRow(rows);
}

export function createRequireRole(defaultDeps = {}) {
  // Cache scoped per instance (bukan module-global) supaya test dengan mock
  // query/lookup tidak pernah berbagi sesi cache antar-test.
  const instanceCache = defaultDeps.cache || createSessionCache({
    ttlMs: defaultDeps.ttlMs,
    maxEntries: defaultDeps.maxEntries,
  });

  function requireRoleMiddleware(roles, deps = {}) {
    const activeCache = deps.cache || instanceCache;
    const doQuery = deps.query || defaultDeps.query || query;
    const rawLookup = deps.lookup || defaultDeps.lookup || ((token, kind) => queryLookup(doQuery, token, kind));

    async function cachedLookup(token, kind) {
      const key = kind === 'device' ? hashDeviceToken(token) : token;
      const cached = activeCache.get(key);
      if (cached !== undefined) return cached;
      const row = await rawLookup(token, kind);
      if (row) activeCache.set(key, row);
      return row;
    }

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
        row = await cachedLookup(token, kind);
        if (!row) return unauthorized(res);
        role = String(row.role || '').trim().toUpperCase();
        let allowed = roles.has(role) || roles.has(role.replace(/_/g, ' ')) || roles.has(role.replace(/\s+/g, '_'));
        if (!allowed && roles === ABSEN_ROLES && (deps.query || defaultDeps.query || process.env.DATABASE_URL)) {
          try {
            const roleCheck = await doQuery('SELECT id FROM absen_roles WHERE id = $1', [role]);
            if (roleCheck?.rows?.length > 0) allowed = true;
          } catch {}
        }
        if (!allowed) {
          return res.status(403).json({ ok: false, message: 'Forbidden' });
        }
      } catch {
        // DB mati = 500, bukan next(): error lookup yang jatuh ke next() akan
        // mengubah outage menjadi bypass otorisasi.
        return res.status(500).json({ ok: false, message: 'Gagal memverifikasi sesi' });
      }
      // id tetap string (lihat ::text di SQL): Task 5 harus memakainya lewat String(),
      // jangan pernah `req.user.id === <number>`.
      // is_admin: boolean user_list — satu-satunya sumber izin tambah/edit log
      // (bukan role). Fail-closed: selain true dianggap false.
      req.user = {
        id: row.id,
        nip: row.nip,
        role,
        instansi_id: row.instansi_id,
        is_admin: row.is_admin === true || row.is_admin === 'true',
      };
      req.authKind = kind;
      next();
    };
  }

  requireRoleMiddleware.cache = instanceCache;
  requireRoleMiddleware.invalidate = (token) => {
    if (typeof token !== 'string' || !token) return;
    instanceCache.delete(isDeviceToken(token) ? hashDeviceToken(token) : token);
  };
  requireRoleMiddleware.invalidateHash = (tokenHash) => {
    if (typeof tokenHash === 'string' && tokenHash) instanceCache.delete(tokenHash);
  };
  requireRoleMiddleware.clearCache = () => instanceCache.clear();
  return requireRoleMiddleware;
}

export function requireRole(roles, deps = {}) {
  return createRequireRole(deps)(roles);
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

export function hasPermission(userPermissions, requiredPermission) {
  if (!Array.isArray(userPermissions)) return false;
  if (userPermissions.includes('*')) return true;
  if (userPermissions.includes(requiredPermission)) return true;
  const [mod] = String(requiredPermission || '').split('.');
  if (mod && userPermissions.includes(`${mod}.*`)) return true;
  return false;
}

export function requirePermission(permission, deps = {}) {
  const lookup = deps.lookup || defaultLookup;
  const doQuery = deps.query || query;
  return async function permissionMiddleware(req, res, next) {
    const token = bearerToken(req);
    const kind = isSessionToken(token) ? 'session' : isDeviceToken(token) ? 'device' : null;
    if (!kind) return unauthorized(res);
    let row;
    let role;
    try {
      row = await lookup(token, kind);
      if (!row) return unauthorized(res);
      role = String(row.role || '').trim().toUpperCase();
      if (role === 'SUPERADMIN') {
        req.user = {
          id: row.id,
          nip: row.nip,
          role,
          instansi_id: row.instansi_id,
          is_admin: true,
          permissions: ['*'],
        };
        req.authKind = kind;
        return next();
      }

      const roleRes = await doQuery('SELECT permissions FROM absen_roles WHERE id = $1', [role]);
      const rolePerms = roleRes?.rows?.[0]?.permissions || [];
      const permsArray = Array.isArray(rolePerms)
        ? rolePerms
        : (typeof rolePerms === 'string' ? JSON.parse(rolePerms) : []);

      if (!hasPermission(permsArray, permission)) {
        return res.status(403).json({ ok: false, message: 'Forbidden: Insufficient permissions' });
      }

      req.user = {
        id: row.id,
        nip: row.nip,
        role,
        instansi_id: row.instansi_id,
        is_admin: row.is_admin === true || row.is_admin === 'true',
        permissions: permsArray,
      };
      req.authKind = kind;
      next();
    } catch {
      return res.status(500).json({ ok: false, message: 'Gagal memverifikasi izin' });
    }
  };
}
