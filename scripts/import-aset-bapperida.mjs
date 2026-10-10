// ═══════════════════════════════════════════════════════════════
// IMPOR PENUH aset-bapperida (SQLite aset.db) -> SIMAPO native.
//
// Cara pakai:
//   set SIMAPO_NIP=<NIP admin bapperida>   (shell: $env:SIMAPO_NIP=...)
//   node scripts/import-aset-bapperida.mjs --dry-run   # cek jumlah dulu
//   node scripts/import-aset-bapperida.mjs             # impor + QR
//
// env opsional: SIMAPO_BASE (default https://absensi.mindcloud.my.id),
//               INSTANSI_ID (default bapperida), ASET_DB.
//
// Destruktif: mengosongkan unit_aset+barang instansi lalu isi ulang dari aset.db.
// Pegawai TIDAK dibuat — hanya dicocokkan ke user_list lewat NIP (user_list.id =
// telegram id, tak ada di aset.db).
// ═══════════════════════════════════════════════════════════════
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE = (process.env.SIMAPO_BASE || 'https://absensi.mindcloud.my.id').replace(/\/+$/, '');
const NIP = process.env.SIMAPO_NIP;
const INSTANSI = process.env.INSTANSI_ID || 'bapperida';
const ASET_DB = process.env.ASET_DB || path.join(__dirname, '../../aset-bapperida/data/aset.db');
const DRY = process.argv.includes('--dry-run');
const MEDIA_ROLES = ['ADMIN', 'SUPERADMIN', 'KEPALA', 'SEKRETARIS', 'KABID', 'IRBAN'];

async function login() {
  const res = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nip: NIP }),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.session_token) throw new Error(`login gagal HTTP ${res.status}: ${JSON.stringify(j)}`);
  const role = String(j.user?.role || '').toUpperCase();
  if (!MEDIA_ROLES.includes(role)) throw new Error(`role "${j.user?.role}" bukan MEDIA_ROLES; impor butuh admin.`);
  console.log(`[login] ${j.user?.nama || NIP} (${role}, ${j.user?.instansi_id || '?'})`);
  return j.session_token;
}

async function main() {
  const db = new DatabaseSync(ASET_DB);
  const aset = db.prepare('SELECT * FROM aset').all();
  const pegawai = db.prepare('SELECT * FROM pegawai').all();
  const ruangan = db.prepare('SELECT * FROM ruangan').all();
  console.log(`[aset.db] aset=${aset.length}, pegawai=${pegawai.length}, ruangan=${ruangan.length}`);
  console.log(`[target] ${BASE} instansi=${INSTANSI}`);

  if (DRY) {
    const barang = new Set(aset.map((a) => `${a.kode_barang}||${a.nama}`));
    console.log(`[DRY-RUN] tidak mengirim apa pun. ~${barang.size} barang, ${aset.length} unit, ${ruangan.length} ruangan; pegawai dicocokkan by NIP.`);
    return;
  }

  if (!NIP) throw new Error('SIMAPO_NIP wajib diisi (NIP admin bapperida, role MEDIA_ROLES).');
  const token = await login();
  const res = await fetch(BASE + '/api/simapo/import-bapperida', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ confirm: 'IMPORT-BAPPERIDA', instansi_id: INSTANSI, pegawai, ruangan, aset }),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.ok) throw new Error(`impor gagal HTTP ${res.status}: ${JSON.stringify(j)}`);
  console.log('[OK]', JSON.stringify(j.data));
}

main().then(() => process.exit(0)).catch((e) => { console.error('\nGAGAL:', e.message); process.exit(1); });
