// Split multi-unit barang → 1:1 (satu aset tetap = satu barang = satu unit).
// Kebijakan: unit PERTAMA (ORDER BY nomorinventaris, id) tetap menempel di barang
// asli; setiap unit berikutnya di-clone jadi barang BARU sendiri lalu unit
// direpoint ke clone. stok_saat_ini semua jadi 1 (1:1).
// Default: dry-run (hanya lapor + backup JSON). Apply: node --env-file=.env
// scripts/split-unit-aset.mjs --apply-prod
import fs from 'node:fs';
import pg from 'pg';

const APPLY = process.argv.includes('--apply-prod');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const BACKUP_DIR = 'data/cadangan';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  const multi = await client.query(`
    SELECT b.id,b.instansi_id,b.kodebarang,b.nama,b.satuan,b.spesifikasi,b.foto,
           b.kategoriid,b.hargasatuan,b.minimumstok,b.isactive,
           json_agg(to_jsonb(ua) ORDER BY ua.nomorinventaris,ua.id) units
    FROM "SIMAPO".barang b
    JOIN "SIMAPO".unit_aset ua ON ua.barangid=b.id
    GROUP BY b.id HAVING count(ua.id)>1
    ORDER BY b.nama`);

  let cloneCount = 0;
  const ops = [];
  for (const g of multi.rows) {
    for (const u of g.units.slice(1)) ops.push({ g, u });
  }
  cloneCount = ops.length;

  if (!APPLY) {
    console.log(`DRY-RUN — tidak ada yang diubah.`);
    console.log(`Barang multi-unit : ${multi.rows.length}`);
    console.log(`Unit yang akan di-split jadi barang baru: ${cloneCount}`);
    for (const g of multi.rows.slice(0, 10)) console.log(`  - ${g.nama} (${g.kodebarang}): ${g.units.length} unit`);
    if (multi.rows.length > 10) console.log(`  ... dan ${multi.rows.length - 10} barang lainnya.`);
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const file = `${BACKUP_DIR}/split-unit-aset-${stamp}.json`;
    fs.writeFileSync(file, JSON.stringify(multi.rows, null, 2));
    console.log(`Backup baris terdampak: ${file}`);
    await client.end();
    process.exit(0);
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const file = `${BACKUP_DIR}/split-unit-aset-${stamp}.json`;
  fs.writeFileSync(file, JSON.stringify(multi.rows, null, 2));
  console.log(`Backup: ${file}`);

  await client.query('BEGIN');
  try {
    let cloned = 0;
    for (const { g, u } of ops) {
      const harga = Number(u.nilaiperolehan) || Number(g.hargasatuan) || 0;
      const z = await client.query(
        `INSERT INTO "SIMAPO".barang(id,kodebarang,nama,jenisbarang,satuan,spesifikasi,foto,stok_saat_ini,minimumstok,hargasatuan,kategoriid,isactive,createdat,updatedat,instansi_id)
         VALUES(gen_random_uuid(),$1,$2,'Aset Tetap',COALESCE($3,'Unit'),$4,$5,1,$6,$7,$8,true,NOW(),NOW(),$9) RETURNING id`,
        [g.kodebarang, g.nama, g.satuan, g.spesifikasi, g.foto, g.minimumstok || 0, harga, g.kategoriid, g.instansi_id]);
      await client.query(`UPDATE "SIMAPO".unit_aset SET barangid=$1,updatedat=NOW() WHERE id=$2`, [z.rows[0].id, u.id]);
      cloned++;
    }
    for (const g of multi.rows) {
      await client.query(`UPDATE "SIMAPO".barang SET stok_saat_ini=1,updatedat=NOW() WHERE id=$1`, [g.id]);
    }
    await client.query('COMMIT');
    console.log(`OK: ${cloned} unit di-split jadi barang baru; ${multi.rows.length} barang asli stok_saat_ini=1.`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }

  const check = await client.query(`
    SELECT (SELECT count(*) FROM "SIMAPO".barang WHERE isactive=true) barang_aktif,
           (SELECT count(*) FROM "SIMAPO".unit_aset ua JOIN "SIMAPO".barang b ON b.id=ua.barangid WHERE b.isactive=true) unit_aktif,
           (SELECT count(*) FROM (SELECT b.id FROM "SIMAPO".barang b JOIN "SIMAPO".unit_aset ua ON ua.barangid=b.id GROUP BY b.id HAVING count(ua.id)>1) t) masih_multi`);
  console.log('Verifikasi:', check.rows[0]);
} finally {
  await client.end();
}
