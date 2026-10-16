## commits

3e8a7be feat(spt): endpoint simpan detail perjadin + fix nomor_surat penugasan

## stat

 package.json                      |   2 +-
 server/overtime.js                |   3 +-
 tests/penugasan-perjadin.test.mjs | 104 ++++++++++++++++++++++++++++++++++++++
 3 files changed, 107 insertions(+), 2 deletions(-)

## diff

diff --git a/package.json b/package.json
index b6f9429..c114e7b 100644
--- a/package.json
+++ b/package.json
@@ -2,21 +2,21 @@
   "name": "absensi-app",
   "private": true,
   "version": "0.0.0",
   "type": "module",
   "scripts": {
     "dev": "vite",
     "build": "vite build",
     "lint": "eslint .",
     "preview": "vite preview",
     "start": "node server/index.js",
-    "test": "node --test server/*.test.js tests/gas-media.test.js tests/aset-emoji.test.mjs tests/aset-kategori-dropdown.test.mjs tests/aset-kondisi.test.mjs tests/aset-markup.test.mjs tests/aset-nav.test.mjs tests/aset-router.test.mjs tests/aset-screens.test.mjs tests/workflow-mutasi.test.mjs tests/drive-img-url.test.js tests/deemoji.test.mjs tests/search-dd.test.mjs tests/log-week.test.mjs tests/aset-tahun.test.mjs tests/aset-peg-overview.test.mjs tests/aset-kir-format.test.mjs tests/lembur-ttd.test.mjs tests/kode-aset.test.mjs tests/aset-pemegang.test.mjs tests/aset-satu-barang.test.mjs tests/log-add-edit.test.mjs tests/tugas-spt.test.mjs",
+    "test": "node --test server/*.test.js tests/gas-media.test.js tests/aset-emoji.test.mjs tests/aset-kategori-dropdown.test.mjs tests/aset-kondisi.test.mjs tests/aset-markup.test.mjs tests/aset-nav.test.mjs tests/aset-router.test.mjs tests/aset-screens.test.mjs tests/workflow-mutasi.test.mjs tests/drive-img-url.test.js tests/deemoji.test.mjs tests/search-dd.test.mjs tests/log-week.test.mjs tests/aset-tahun.test.mjs tests/aset-peg-overview.test.mjs tests/aset-kir-format.test.mjs tests/lembur-ttd.test.mjs tests/kode-aset.test.mjs tests/aset-pemegang.test.mjs tests/aset-satu-barang.test.mjs tests/log-add-edit.test.mjs tests/tugas-spt.test.mjs tests/penugasan-perjadin.test.mjs",
     "test:live": "node --test tests/n8n-face.test.mjs tests/pks.test.mjs"
   },
   "dependencies": {
     "@vladmandic/human": "^3.3.6",
     "dotenv": "^18.0.5",
     "express": "^4.22.3",
     "pg": "^8.23.1",
     "react": "^19.2.4",
     "react-dom": "^19.2.4"
   },
diff --git a/server/overtime.js b/server/overtime.js
index 3cf663a..0625407 100644
--- a/server/overtime.js
+++ b/server/overtime.js
@@ -1,14 +1,15 @@
 import express from 'express';
 import { sameInstansi } from './auth.js';
 const MANAGERS=new Set(['ADMIN','SUPERADMIN','KEPALA','SEKRETARIS','KABID','IRBAN']);
 const ok=(res,data={})=>res.status(200).json({ok:true,...data});const fail=(res,s,m)=>res.status(s).json({ok:false,message:m});
 const admin=req=>MANAGERS.has(String(req.user?.role||'').toUpperCase());
 function scope(req,inst){const x=inst||req.user?.instansi_id;return {inst:x,allowed:sameInstansi(req.user,x)};}
 export function createOvertimeRouter({query}){const r=express.Router();
  r.get('/penugasan',async(req,res)=>{try{const {inst,allowed}=scope(req,req.query.instansi_id);if(!allowed)return fail(res,403,'Forbidden');const limit=Math.min(Math.max(parseInt(req.query.limit||'100',10)||100,1),500);const p=[];let sql='SELECT * FROM penugasan WHERE instansi_id=$1';p.push(inst);if(req.query.created_by_nip){sql+=' AND created_by_nip=$2';p.push(String(req.query.created_by_nip));}else if(req.query.nip&&req.query.nip!=='all'){sql+=` AND nip=$${p.length+1}`;p.push(String(req.query.nip));}sql+=` ORDER BY tanggal DESC LIMIT $${p.length+1}`;p.push(limit);const rows=(await query(sql,p)).rows;return ok(res,{rows,data:rows});}catch(e){console.error('[penugasan/list]',e);return fail(res,500,'Gagal memuat penugasan.');}});
- r.post('/penugasan',async(req,res)=>{try{if(!admin(req))return fail(res,403,'Forbidden');const b=req.body||{};const {inst,allowed}=scope(req,b.instansi_id);if(!allowed)return fail(res,403,'Forbidden');let row;if(b.id){row=(await query(`UPDATE penugasan SET status=$1,bukti=$2,lat_pengerjaan=$3,lon_pengerjaan=$4,instansi_id=$5 WHERE id=$6 RETURNING *`,[b.status||'',b.bukti||b.bukti_base64||'',Number(b.actual_lat)||0,Number(b.actual_lon)||0,inst,String(b.id)])).rows[0];}else{row=(await query(`INSERT INTO penugasan (user_id,nama,nip,tanggal,lat,lon,keterangan,created_by,created_by_nip,radius,instansi_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[String(b.user_id||''),String(b.nama||''),String(b.nip||''),String(b.tanggal||''),Number(b.lat)||0,Number(b.lon)||0,String(b.keterangan||''),String(b.created_by||req.user.id),String(b.created_by_nip||req.user.nip||''),Number(b.radius)||100,inst])).rows[0];}if(!row)return fail(res,404,'Penugasan tidak ditemukan.');return ok(res,{data:row,message:'Penugasan berhasil disimpan.'});}catch(e){console.error('[penugasan/save]',e);return fail(res,500,'Gagal menyimpan penugasan.');}});
+ r.post('/penugasan',async(req,res)=>{try{if(!admin(req))return fail(res,403,'Forbidden');const b=req.body||{};const {inst,allowed}=scope(req,b.instansi_id);if(!allowed)return fail(res,403,'Forbidden');let row;if(b.id){row=(await query(`UPDATE penugasan SET status=$1,bukti=$2,lat_pengerjaan=$3,lon_pengerjaan=$4,instansi_id=$5 WHERE id=$6 RETURNING *`,[b.status||'',b.bukti||b.bukti_base64||'',Number(b.actual_lat)||0,Number(b.actual_lon)||0,inst,String(b.id)])).rows[0];}else{row=(await query(`INSERT INTO penugasan (user_id,nama,nip,tanggal,lat,lon,keterangan,created_by,created_by_nip,radius,instansi_id,nomor_surat) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,[String(b.user_id||''),String(b.nama||''),String(b.nip||''),String(b.tanggal||''),Number(b.lat)||0,Number(b.lon)||0,String(b.keterangan||''),String(b.created_by||req.user.id),String(b.created_by_nip||req.user.nip||''),Number(b.radius)||100,inst,String(b.nomor_surat||'')])).rows[0];}if(!row)return fail(res,404,'Penugasan tidak ditemukan.');return ok(res,{data:row,message:'Penugasan berhasil disimpan.'});}catch(e){console.error('[penugasan/save]',e);return fail(res,500,'Gagal menyimpan penugasan.');}});
+ r.post('/penugasan/perjadin',async(req,res)=>{try{if(!admin(req))return fail(res,403,'Forbidden');const b=req.body||{};const {inst,allowed}=scope(req,b.instansi_id);if(!allowed)return fail(res,403,'Forbidden');const ids=(Array.isArray(b.ids)?b.ids:(b.id?[b.id]:[])).map(String).filter(Boolean);if(!ids.length)return fail(res,400,'ids kosong');await query('ALTER TABLE penugasan ADD COLUMN IF NOT EXISTS perjadin JSONB');await query('ALTER TABLE penugasan ADD COLUMN IF NOT EXISTS nomor_surat TEXT');const rows=(await query('UPDATE penugasan SET perjadin=$1,nomor_surat=$2 WHERE id::text=ANY($3::text[]) AND instansi_id=$4 RETURNING id',[JSON.stringify(b.perjadin||{}),String(b.nomor_surat||''),ids,inst])).rows;return ok(res,{updated:rows.length,message:'Detail perjalanan dinas disimpan.'});}catch(e){console.error('[penugasan/perjadin]',e);return fail(res,500,'Gagal menyimpan detail perjalanan dinas.');}});
  r.get('/lembur',async(req,res)=>{try{const {inst,allowed}=scope(req,req.query.instansi_id);if(!allowed)return fail(res,403,'Forbidden');const nips=String(req.query.nips||req.query.nip||'').split(',').map(x=>x.trim()).filter(Boolean);if(!nips.length)return ok(res,{data:[],rows:[]});const p=[nips, String(req.query.dari||''),String(req.query.sampai||'')];const rows=(await query(`SELECT l."NIP" AS nip,l."Nama" AS nama,l."Tanggal" AS tanggal,MIN(CASE WHEN UPPER(l."Jenis Absen") LIKE '%MASUK%' THEN l."Jam" END) AS jam_masuk,MAX(CASE WHEN UPPER(l."Jenis Absen") LIKE '%PULANG%' THEN l."Jam" END) AS jam_pulang,MAX(l."Ket") AS status_absen,MAX(CAST(p.id AS TEXT)) AS is_tugas,MAX(p.keterangan) AS tugas_detail,MAX(CASE WHEN UPPER(l."Jenis Absen") IN ('SAKIT','TUGAS','IZIN','CUTI','TUBEL') THEN UPPER(l."Jenis Absen") END) AS keterangan_status FROM "Log_Absen" l LEFT JOIN penugasan p ON l."NIP"=p.nip AND l."Tanggal"::text=p.tanggal::text AND p.instansi_id=$4 WHERE l."NIP"=ANY($1::text[]) AND l."Tanggal" BETWEEN $2 AND $3 AND l.instansi_id=$4 GROUP BY l."NIP",l."Nama",l."Tanggal" ORDER BY l."Tanggal" ASC,l."Nama" ASC`,[...p,inst])).rows;return ok(res,{data:rows,rows});}catch(e){console.error('[lembur/get]',e);return fail(res,500,'Gagal mengambil data lembur.');}});
  r.post('/lembur/archive',async(req,res)=>{try{if(!admin(req))return fail(res,403,'Forbidden');const b=req.body||{};const {inst,allowed}=scope(req,b.instansi_id);if(!allowed)return fail(res,403,'Forbidden');await query(`CREATE TABLE IF NOT EXISTS rekap_lembur (id SERIAL PRIMARY KEY, judul TEXT NOT NULL, nomor_surat TEXT, tanggal_dari DATE NOT NULL, tanggal_sampai DATE NOT NULL, tanggal_list TEXT[], pegawai_nips TEXT NOT NULL, pegawai_names TEXT NOT NULL, data_json JSONB NOT NULL, instansi_id TEXT, saved_by_nip TEXT, saved_by_nama TEXT, created_at TIMESTAMP DEFAULT NOW())`);const row=(await query(`INSERT INTO rekap_lembur (judul,nomor_surat,tanggal_dari,tanggal_sampai,tanggal_list,pegawai_nips,pegawai_names,data_json,instansi_id,saved_by_nip,saved_by_nama) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[String(b.judul||''),String(b.nomor_surat||''),b.tanggal_dari,b.tanggal_sampai,Array.isArray(b.tanggal_list)?b.tanggal_list:[],String(b.pegawai_nips||''),String(b.pegawai_names||''),JSON.stringify(b.data_json||[]),inst,String(b.saved_by_nip||req.user.nip||''),String(b.saved_by_nama||'')])).rows[0];return ok(res,{data:row,message:'Rekap lembur berhasil diarsipkan.'});}catch(e){console.error('[lembur/archive/save]',e);return fail(res,500,'Gagal menyimpan arsip lembur.');}});
  r.get('/lembur/archive',async(req,res)=>{try{const {inst,allowed}=scope(req,req.query.instansi_id);if(!allowed)return fail(res,403,'Forbidden');await query(`CREATE TABLE IF NOT EXISTS rekap_lembur (id SERIAL PRIMARY KEY, judul TEXT NOT NULL, nomor_surat TEXT, tanggal_dari DATE NOT NULL, tanggal_sampai DATE NOT NULL, tanggal_list TEXT[], pegawai_nips TEXT NOT NULL, pegawai_names TEXT NOT NULL, data_json JSONB NOT NULL, instansi_id TEXT, saved_by_nip TEXT, saved_by_nama TEXT, created_at TIMESTAMP DEFAULT NOW())`);const p=[];let sql;if(req.query.id){sql='SELECT * FROM rekap_lembur WHERE id=$1 AND instansi_id=$2';p.push(parseInt(req.query.id,10),inst);}else{const limit=Math.min(Math.max(parseInt(req.query.limit||'30',10)||30,1),200);const cols=(req.query.with_data==='true'||req.query.with_data==='1')?'*':'id,judul,nomor_surat,tanggal_dari,tanggal_sampai,pegawai_nips,pegawai_names,instansi_id,saved_by_nip,saved_by_nama,created_at';sql=`SELECT ${cols} FROM rekap_lembur WHERE instansi_id=$1 ORDER BY created_at DESC LIMIT $2`;p.push(inst,limit);}const rows=(await query(sql,p)).rows;return ok(res,{data:rows,rows});}catch(e){console.error('[lembur/archive/list]',e);return fail(res,500,'Gagal memuat arsip lembur.');}});
  r.post('/lembur/archive/delete',async(req,res)=>{try{if(!admin(req))return fail(res,403,'Forbidden');const id=parseInt(req.body?.id,10);if(!Number.isInteger(id))return fail(res,400,'id tidak valid');const {inst,allowed}=scope(req,req.body?.instansi_id);if(!allowed)return fail(res,403,'Forbidden');const row=(await query(`DELETE FROM rekap_lembur WHERE id=$1 AND instansi_id=$2 RETURNING id`,[id,inst])).rows[0];if(!row)return fail(res,404,'Arsip tidak ditemukan.');return ok(res,{message:'Arsip rekap lembur berhasil dihapus.'});}catch(e){console.error('[lembur/archive/delete]',e);return fail(res,500,'Gagal menghapus arsip lembur.');}});
  return r;}
diff --git a/tests/penugasan-perjadin.test.mjs b/tests/penugasan-perjadin.test.mjs
new file mode 100644
index 0000000..251dc50
--- /dev/null
+++ b/tests/penugasan-perjadin.test.mjs
@@ -0,0 +1,104 @@
+import test from 'node:test';
+import assert from 'node:assert/strict';
+import express from 'express';
+import { createOvertimeRouter } from '../server/overtime.js';
+
+// Harness meniru server/auth-device.test.js: mount di prefiks produksi (/api)
+// supaya test tidak hijau untuk konfigurasi yang tak pernah dipakai index.js.
+const ADMIN = { role: 'ADMIN', instansi_id: 'bapperida', nip: '123' };
+const PEGAWAI = { role: 'PEGAWAI', instansi_id: 'bapperida', nip: '123' };
+
+function stubApp(user, query) {
+  const app = express();
+  app.use(express.json());
+  app.use((req, _res, next) => { req.user = user; next(); });
+  app.use('/api', createOvertimeRouter({ query }));
+  return app;
+}
+
+async function listen(app) {
+  const s = await new Promise((resolve) => {
+    const x = app.listen(0, () => resolve(x));
+  });
+  return {
+    port: s.address().port,
+    close: () => new Promise((resolve) => { s.closeAllConnections?.(); s.close(() => resolve()); }),
+  };
+}
+
+async function post(port, path, body) {
+  const r = await fetch(`http://127.0.0.1:${port}${path}`, {
+    method: 'POST',
+    headers: { 'content-type': 'application/json' },
+    body: JSON.stringify(body),
+  });
+  return { status: r.status, body: await r.json() };
+}
+
+function recorder() {
+  const calls = [];
+  const query = async (sql, params) => {
+    calls.push({ sql, params });
+    if (/UPDATE penugasan SET perjadin/.test(sql)) return { rows: [{ id: '1' }, { id: '2' }] };
+    if (/INSERT INTO penugasan/.test(sql)) return { rows: [{ id: '9' }] };
+    return { rows: [] };
+  };
+  return { calls, query };
+}
+
+const UPDATE_RE = /UPDATE penugasan SET perjadin=\$1,nomor_surat=\$2 WHERE id::text=ANY\(\$3::text\[\]\) AND instansi_id=\$4/;
+
+test('non-admin ditolak 403 dan tidak menyentuh UPDATE', async (t) => {
+  const { calls, query } = recorder();
+  const { port, close } = await listen(stubApp(PEGAWAI, query));
+  t.after(close);
+  const r = await post(port, '/api/penugasan/perjadin', { ids: ['1'], perjadin: {}, nomor_surat: 'x' });
+  assert.equal(r.status, 403);
+  assert.ok(!calls.some((c) => UPDATE_RE.test(c.sql)), 'UPDATE tidak boleh dijalankan untuk non-admin');
+});
+
+test('admin tanpa ids ditolak 400', async (t) => {
+  const { port, close } = await listen(stubApp(ADMIN, recorder().query));
+  t.after(close);
+  const kosong = await post(port, '/api/penugasan/perjadin', { ids: [], perjadin: {} });
+  const absen = await post(port, '/api/penugasan/perjadin', { perjadin: {} });
+  assert.equal(kosong.status, 400);
+  assert.equal(absen.status, 400);
+});
+
+test('admin sukses: kolom dibuat dan UPDATE di-scope ke instansi pemanggil', async (t) => {
+  const perjadin = { maksud: 'Rapat koordinasi', tujuan: 'Bandung' };
+  const nomor_surat = 'B-123/SPT/2026';
+  const { calls, query } = recorder();
+  const { port, close } = await listen(stubApp(ADMIN, query));
+  t.after(close);
+  const r = await post(port, '/api/penugasan/perjadin', { ids: [1, 2], perjadin, nomor_surat });
+
+  assert.equal(r.status, 200);
+  assert.equal(r.body.ok, true);
+  assert.equal(r.body.updated, 2);
+
+  assert.ok(calls.some((c) => /ALTER TABLE penugasan ADD COLUMN IF NOT EXISTS perjadin JSONB/.test(c.sql)), 'kolom perjadin dibuat');
+  assert.ok(calls.some((c) => /ALTER TABLE penugasan ADD COLUMN IF NOT EXISTS nomor_surat TEXT/.test(c.sql)), 'kolom nomor_surat dibuat');
+
+  const upd = calls.find((c) => UPDATE_RE.test(c.sql));
+  assert.ok(upd, 'UPDATE perjadin dijalankan');
+  assert.equal(upd.params[0], JSON.stringify(perjadin));
+  assert.equal(upd.params[1], nomor_surat);
+  assert.deepEqual(upd.params[2], ['1', '2']);
+  assert.equal(upd.params[3], 'bapperida', 'scope instansi pemanggil dipakai, bukan sekadar dideklarasikan');
+});
+
+test('buat penugasan baru menyimpan nomor_surat', async (t) => {
+  const nomor_surat = 'B-9/SPT/2026';
+  const { calls, query } = recorder();
+  const { port, close } = await listen(stubApp(ADMIN, query));
+  t.after(close);
+  const r = await post(port, '/api/penugasan', { nama: 'A', nip: '1', tanggal: '2026-01-01', nomor_surat });
+  assert.equal(r.status, 200);
+
+  const ins = calls.find((c) => /INSERT INTO penugasan/.test(c.sql));
+  assert.ok(ins, 'INSERT dijalankan');
+  assert.match(ins.sql, /\([^)]*nomor_surat[^)]*\)/, 'nomor_surat ada di daftar kolom INSERT');
+  assert.ok(ins.params.includes(nomor_surat), 'nilai nomor_surat ikut dikirim sebagai parameter');
+});
