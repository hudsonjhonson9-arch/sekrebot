// Validasi SQL dengan PREPARE: paket resmi Postgres membiarkan PostgreSQL mengurai,
// merencanakan, dan menolak statement yang tidak valid, tanpa menjalankannya.
// Tidak ada INSERT/UPDATE/DELETE yang dieksekusi — aman terhadap data produksi.
//
// Cara ini menangkap kelas bug yang tidak bisa menangkap assertion tekstual:
// kolom yang dibaca dari sebuah CTE tapi tidak ada di RETURNING-nya.
//
//   set DATABASE_URL=... && node scripts/prepare-check.mjs
//
// Statement yang masih memuat placeholder %VALUES%/%FILTER% tidak bisa diuji di
// sini (arity placeholder-nya baru diketahui saat route berjalan), jadi sengaja
// dilaporkan sebagai "template", bukan "lulus".

import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL belum diset. Server juga butuh env ini, jadi tanpa itu boot mustahil.');
  process.exit(2);
}

// notify.js dikecualikan: notifikasi WA/Telegram di luar cakupan tugas ini.
const SKIP = new Set(['db.js', 'notify.js']);
const files = readdirSync(join(ROOT, 'server'))
  .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js') && !SKIP.has(f));

const { query, closePool } = await import(pathToFileURL(join(ROOT, 'server', 'db.js')).href);

const looksLikeSql = (v) => typeof v === 'string'
  && v.trim().length >= 25
  && /\b(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(v);

const statements = [];
for (const file of files) {
  for (const [name, value] of Object.entries(await import(pathToFileURL(join(ROOT, 'server', file)).href))) {
    if (looksLikeSql(value)) statements.push({ file, name, sql: value });
  }
}

const lulus = [];
const template = [];
const gagal = [];

for (const s of statements) {
  if (/%(VALUES|FILTER)%/.test(s.sql)) { template.push(s); continue; }
  const stmt = `chk_${Math.random().toString(36).slice(2, 8)}`;
  try {
    await query(`PREPARE ${stmt} AS ${s.sql}`);
    await query(`DEALLOCATE ${stmt}`);
    lulus.push(s);
  } catch (e) {
    gagal.push({ ...s, why: e.message.split('\n')[0] });
  }
}

const label = (s) => `${s.file}:${s.name}`;
console.log(`modul: ${files.length} (${[...SKIP].join(', ')} dikecualikan) | statement SQL: ${statements.length}`);
console.log(`lulus ${lulus.length} | template ${template.length} | GAGAL ${gagal.length}\n`);

if (gagal.length) {
  console.log('=== SQL tidak valid (akan error saat route dipanggil) ===');
  for (const g of gagal) console.log(`  ${label(g)}\n    ${g.why}`);
  console.log('\nTabel hilang berarti migrasi belum applied, bukan SQL rusak. Lihat scripts/migration_*.sql');
}
if (template.length) {
  console.log(`\n=== template, divalidasi saat runtime (${template.length}) ===`);
  for (const t of template) console.log(`  ${label(t)}`);
}

await closePool();
process.exit(gagal.length ? 1 : 0);
