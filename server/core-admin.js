import express from 'express';
import crypto from 'node:crypto';
import { sameInstansi } from './auth.js';

const MEDIA = new Set(['ADMIN','SUPERADMIN','KEPALA','SEKRETARIS','KABID','IRBAN']);
const ROLES = ['USER','ADMIN','SUPERADMIN','KEPALA','SEKRETARIS','KABID','IRBAN','INSPEKTUR'];
const s = (v) => v === undefined || v === null ? '' : String(v).trim();
const bool = (v) => v === true || v === 'true' || v === 1 || v === '1';

// Router ini di-mount untuk seluruh ABSEN_ROLES, karena pegawai biasa butuh
// profil, riwayat, jam, periode, dan lokasi instansinya sendiri. Endpoint tulis
// dan daftar lintas-instansi tetap eksklusif media (admin/kepala/sekre/kabid/
// irban): ditolak DI SINI, bukan di mount, supaya satu router bisa dipakai dua
// macam pemanggil.
const requireMedia = (req, res) => {
  if (MEDIA.has(String(req.user?.role || '').toUpperCase())) return false;
  res.status(403).json({ ok: false, message: 'Forbidden' });
  return true;
};

function scope(req, requested) {
  const want = s(requested || req.user?.instansi_id || '');
  if (!want) return { id: req.user?.instansi_id || '', ok: true };
  return { id: want, ok: sameInstansi(req.user, want) };
}
function ok(res, data = {}, message) { return res.json({ ok: true, ...(message ? { message } : {}), ...data }); }
function fail(res, status, message) { return res.status(status).json({ ok: false, message }); }

export function createCoreAdminRouter({ query } = {}) {
  const router = express.Router();

  // ── Master instansi & bidang ──────────────────────────────────────────────
  router.get('/instansi-list', async (req, res) => {
    if (requireMedia(req, res)) return;
    try {
      const { rows } = await query('SELECT * FROM instansi_list ORDER BY nome_instansi ASC, nama_instansi ASC'.replace('nome_instansi','nama_instansi'), []);
      return ok(res, { data: rows, rows });
    } catch (e) { console.error('[instansi-list]', e); return fail(res, 503, 'Layanan instansi tidak tersedia.'); }
  });

  router.post('/instansi-update', async (req, res) => {
    if (requireMedia(req, res)) return;
    try {
      const b = req.body || {}; const id = s(b.id);
      if (!id) return fail(res, 400, 'id instansi wajib diisi.');
      if (!sameInstansi(req.user, id) && req.user.role !== 'SUPERADMIN') return fail(res, 403, 'Forbidden');
      const sets = []; const vals = [];
      for (const [col, val] of [['nama_instansi',b.nama_instansi],['logo_url',b.logo_url],['alamat',b.alamat],['header',b.header]]) {
        if (val !== undefined) { vals.push(val); sets.push(`"${col}"=$${vals.length}`); }
      }
      if (!sets.length) return fail(res, 400, 'Tidak ada perubahan.');
      vals.push(id);
      const r = await query(`UPDATE instansi_list SET ${sets.join(', ')} WHERE id=$${vals.length} RETURNING *`, vals);
      if (!r.rows.length) return fail(res, 404, 'Instansi tidak ditemukan.');
      return ok(res, { data: r.rows[0] }, 'Instansi diperbarui.');
    } catch (e) { console.error('[instansi-update]', e); return fail(res, 500, 'Gagal memperbarui instansi.'); }
  });

  router.get('/bidang-list', async (req, res) => {
    try {
      const sc = scope(req, req.query.instansi_id); if (!sc.ok) return fail(res, 403, 'Forbidden');
      if (!sc.id) return ok(res, { data: [], rows: [] });
      const { rows } = await query('SELECT * FROM bidang_list WHERE instansi_id=$1 ORDER BY id ASC', [sc.id]);
      return ok(res, { data: rows, rows });
    } catch (e) { console.error('[bidang-list]', e); return fail(res, 503, 'Layanan bidang tidak tersedia.'); }
  });

  // ── Pegawai ────────────────────────────────────────────────────────────────
  const USER_SELECT = `SELECT id::text AS id, username AS nama, username, "NIP" AS nip, "NIP",
    "Jabatan" AS jabatan, "Jabatan", pangkat, "Status" AS status, "Status",
    "no" AS no, bidang, nomorhp, role, COALESCE(is_admin,false) AS is_admin,
    instansi_id, jam_masuk, jam_pulang, face_photo, face_descriptor, face_saved_at, face_model
    FROM user_list`;

  router.get('/user-list', async (req, res) => {
    try {
      const isMedia = MEDIA.has(String(req.user?.role || '').toUpperCase());
      const q = req.query || {};
      const vals = []; let where = [];
      if (!isMedia) {
        // Pegawai biasa hanya boleh menarik datanya sendiri: daftar pegawai
        // se-instansi adalah wewenang media, dan baris sendiri selalu dalam
        // wewenangnya apa pun instansi_id yang dikirim.
        vals.push(req.user.id); where.push(`id=$${vals.length}::bigint`);
      } else {
        const sc = scope(req, q.instansi_id);
        if (!sc.ok) return fail(res, 403, 'Forbidden');
        if (q.user_id || q.id) { vals.push(s(q.user_id || q.id)); where.push(`id=$${vals.length}::bigint`); }
        else if (q.nip) { vals.push(s(q.nip)); where.push(`"NIP"=$${vals.length}`); }
        else if (sc.id) { vals.push(sc.id); where.push(`instansi_id=$${vals.length}`); }
        else if (req.user.role !== 'SUPERADMIN') return fail(res, 403, 'Instansi wajib ditentukan.');
      }
      const sql = `${USER_SELECT}${where.length ? ' WHERE '+where.join(' AND ') : ''} ORDER BY "no" ASC NULLS LAST, id ASC`;
      const { rows } = await query(sql, vals);
      return ok(res, { data: rows, rows, ...(rows.length === 1 && (q.user_id || q.id || q.nip) ? { single: rows[0] } : {}) });
    } catch (e) { console.error('[user-list]', e); return fail(res, 503, 'Layanan pegawai tidak tersedia.'); }
  });

  router.post('/user-add', async (req, res) => {
    if (requireMedia(req, res)) return;
    try {
      const b = req.body || {}; const id = s(b.id), inst = s(b.instansi_id || req.user.instansi_id);
      if (!id || !s(b.nama) || !s(b.nip)) return fail(res, 400, 'id, nama, dan NIP wajib diisi.');
      if (!sameInstansi(req.user, inst)) return fail(res, 403, 'Forbidden');
      const role = s(b.role || 'USER').toUpperCase(); if (!ROLES.includes(role)) return fail(res,400,'Role tidak valid.');
      const sql = `INSERT INTO user_list (id,username,"NIP","Jabatan",bidang,"Status","no",pangkat,nomorhp,role,instansi_id,jam_masuk,jam_pulang,is_admin)
        VALUES ($1::bigint,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id::text AS id, username AS nama,"NIP" AS nip,role,instansi_id`;
      const r = await query(sql,[id,s(b.nama),s(b.nip),s(b.jabatan),s(b.bidang),s(b.status||'AKTIF'),b.no===''?null:b.no,s(b.pangkat),s(b.nomorhp),role,inst,s(b.jam_masuk)||null,s(b.jam_pulang)||null,MEDIA.has(role)]);
      return res.status(201).json({ok:true,data:r.rows[0],message:'Pegawai berhasil ditambahkan.'});
    } catch(e){ if(e?.code==='23505') return fail(res,409,'ID/NIP sudah digunakan.'); console.error('[user-add]',e); return fail(res,500,'Gagal menambah pegawai.'); }
  });

  router.post('/user-edit', async (req, res) => {
    if (requireMedia(req, res)) return;
    try {
      const b=req.body||{}, id=s(b.id); if(!/^\d+$/.test(id)) return fail(res,400,'id tidak valid.');
      const old=(await query('SELECT id::text AS id,instansi_id FROM user_list WHERE id=$1::bigint',[id])).rows[0];
      if(!old || !sameInstansi(req.user,old.instansi_id)) return fail(res,403,'Forbidden');
      const vals=[]; const sets=[];
      const fields=[['username',b.nama],['NIP',b.nip],['no',b.no],['Jabatan',b.jabatan],['bidang',b.bidang],['Status',b.status],['pangkat',b.pangkat],['nomorhp',b.nomorhp],['role',b.role],['instansi_id',b.instansi_id],['jam_masuk',b.jam_masuk],['jam_pulang',b.jam_pulang]];
      for(const [col,v] of fields){if(v!==undefined){vals.push(v===''?null:v);sets.push(`"${col}"=$${vals.length}`);}}
      if(b.role!==undefined){const r=s(b.role).toUpperCase();if(!ROLES.includes(r))return fail(res,400,'Role tidak valid.');vals.push(MEDIA.has(r));sets.push(`is_admin=$${vals.length}`);}
      if(!sets.length)return fail(res,400,'Tidak ada perubahan.');
      if(b.instansi_id!==undefined && !sameInstansi(req.user,s(b.instansi_id))) return fail(res,403,'Forbidden');
      vals.push(id);const r=await query(`UPDATE user_list SET ${sets.join(', ')} WHERE id=$${vals.length}::bigint RETURNING id::text AS id,username AS nama,"NIP" AS nip,role,instansi_id`,vals);
      return ok(res,{data:r.rows[0]},'Data pegawai diperbarui.');
    }catch(e){console.error('[user-edit]',e);return fail(res,500,'Gagal memperbarui pegawai.');}
  });

  router.post('/user-delete', async (req,res)=>{
    if (requireMedia(req, res)) return;
    try{const id=s(req.body?.id);const old=(await query('SELECT id::text AS id,instansi_id FROM user_list WHERE id=$1::bigint',[id])).rows[0];if(!old)return fail(res,404,'Pegawai tidak ditemukan.');if(!sameInstansi(req.user,old.instansi_id))return fail(res,403,'Forbidden');const r=await query('DELETE FROM user_list WHERE id=$1::bigint RETURNING id::text AS id',[id]);return ok(res,{data:r.rows[0]},'Pegawai dihapus.');}
    catch(e){console.error('[user-delete]',e);return fail(res,500,'Gagal menghapus pegawai.');}
  });

  // ── Admin list: derived from user_list, sehingga admin_list legacy tidak lagi dibutuhkan ──
  router.get('/admin-list', async (req,res)=>{
    if (requireMedia(req, res)) return;
    try{const sc=scope(req,req.query.instansi_id);if(!sc.ok)return fail(res,403,'Forbidden');const vals=[];let where=`UPPER(COALESCE(role,'')) <> 'USER' OR COALESCE(is_admin,false)=true OR UPPER(COALESCE("Jabatan",'')) LIKE '%KEPALA%' OR UPPER(COALESCE("Jabatan",'')) LIKE '%SEKRETARIS%' OR UPPER(COALESCE("Jabatan",'')) LIKE '%KABID%' OR UPPER(COALESCE("Jabatan",'')) LIKE '%IRBAN%' OR UPPER(COALESCE("Jabatan",'')) LIKE '%INSPEKTUR%'`;let sql=`SELECT id::text AS id,username AS nama,"NIP" AS nip,role,is_admin,instansi_id FROM user_list WHERE (${where})`;if(sc.id){vals.push(sc.id);sql+=` AND instansi_id=$${vals.length}`;}sql+=' ORDER BY "no" ASC NULLS LAST';const rows=(await query(sql,vals)).rows;const admin_ids=rows.map(r=>String(r.id));const admin_roles=Object.fromEntries(rows.map(r=>[String(r.id),String(r.role||'admin').toLowerCase()]));return ok(res,{data:rows,rows,admin_ids,admin_roles});}catch(e){console.error('[admin-list]',e);return fail(res,503,'Layanan admin tidak tersedia.');}
  });
  router.post('/admin-add', async(req,res)=>{
    if (requireMedia(req, res)) return;
    try{const id=s(req.body?.telegram_id||req.body?.id);const role=s(req.body?.role||'ADMIN').toUpperCase();if(!/^\d+$/.test(id)||!MEDIA.has(role))return fail(res,400,'ID atau role tidak valid.');const u=(await query('SELECT id::text AS id,instansi_id FROM user_list WHERE id=$1::bigint',[id])).rows[0];if(!u)return fail(res,404,'Pegawai tidak ditemukan.');if(!sameInstansi(req.user,u.instansi_id))return fail(res,403,'Forbidden');const r=await query('UPDATE user_list SET role=$1,is_admin=true WHERE id=$2::bigint RETURNING id::text AS id,username AS nama,"NIP" AS nip,role,instansi_id',[role,id]);return ok(res,{data:r.rows[0]},'Admin berhasil ditambahkan.');}
    catch(e){console.error('[admin-add]',e);return fail(res,500,'Gagal menambah admin.');}
  });
  router.delete('/admin-delete', async(req,res)=>{
    if (requireMedia(req, res)) return;
    try{const id=s(req.query.telegram_id||req.body?.telegram_id||req.body?.id);if(!/^\d+$/.test(id))return fail(res,400,'ID tidak valid.');const u=(await query('SELECT id::text AS id,instansi_id,role FROM user_list WHERE id=$1::bigint',[id])).rows[0];if(!u)return fail(res,404,'Admin tidak ditemukan.');if(!sameInstansi(req.user,u.instansi_id))return fail(res,403,'Forbidden');if(String(u.id)===String(req.user.id))return fail(res,400,'Tidak dapat menghapus admin sendiri.');const r=await query('UPDATE user_list SET role=\'USER\',is_admin=false WHERE id=$1::bigint RETURNING id::text AS id',[id]);return ok(res,{data:r.rows[0]},'Admin dihapus.');}
    catch(e){console.error('[admin-delete]',e);return fail(res,500,'Gagal menghapus admin.');}
  });

  // ── Jam absensi & periode ─────────────────────────────────────────────────
  router.get('/jam-absen', async(req,res)=>{try{const sc=scope(req,req.query.instansi_id);if(!sc.ok)return fail(res,403,'Forbidden');const id=sc.id||'bapperida';const r=await query(`SELECT * FROM jam_absen WHERE key='jam_absen_global' AND (instansi_id=$1 OR instansi_id IS NULL OR instansi_id='') ORDER BY CASE WHEN instansi_id=$1 THEN 0 ELSE 1 END LIMIT 1`,[id]);const admins=(await query(`SELECT id::text AS id,role FROM user_list WHERE instansi_id=$1 AND (UPPER(COALESCE(role,''))<>'USER' OR COALESCE(is_admin,false)=true) ORDER BY "no" ASC NULLS LAST`,[id])).rows;const row=r.rows[0]||{};return ok(res,{data:{masuk:row.masuk||'07:15',pulang:row.pulang||'14:30',updated_at:row.updated_at||null,admin_ids:admins.map(x=>x.id),admin_roles:Object.fromEntries(admins.map(x=>[x.id,String(x.role||'admin').toLowerCase()]))}});}catch(e){console.error('[jam-absen]',e);return fail(res,503,'Layanan jam absensi tidak tersedia.');}});
  router.post('/jam-absen', async(req,res)=>{try{const b=req.body||{},id=s(b.instansi_id||req.user.instansi_id||'bapperida');if(requireMedia(req,res))return;if(!sameInstansi(req.user,id))return fail(res,403,'Forbidden');const r=await query(`INSERT INTO jam_absen (key,instansi_id,masuk,pulang,diubah_oleh,updated_at) VALUES ('jam_absen_global',$1,$2,$3,$4,now()) ON CONFLICT (key,instansi_id) DO UPDATE SET masuk=EXCLUDED.masuk,pulang=EXCLUDED.pulang,diubah_oleh=EXCLUDED.diubah_oleh,updated_at=now() RETURNING *`,[id,s(b.masuk)||'07:15',s(b.pulang)||'14:30',req.user.id]);return ok(res,{data:r.rows[0]},'Jam absensi disimpan.');}catch(e){console.error('[jam-absen POST]',e);return fail(res,500,'Gagal menyimpan jam absensi.');}});

  router.get('/jam-periode-list', async(req,res)=>{try{const sc=scope(req,req.query.instansi_id);if(!sc.ok)return fail(res,403,'Forbidden');const id=sc.id||'bapperida';const r=await query(`SELECT * FROM jam_periode WHERE instansi_id=$1 OR instansi_id IS NULL OR instansi_id='' ORDER BY dari DESC`,[id]);return ok(res,{data:r.rows,rows:r.rows});}catch{return fail(res,503,'Layanan periode tidak tersedia.');}});
  router.post('/jam-periode-add', async(req,res)=>{
    try{
      const b=req.body||{},id=s(b.instansi_id||req.user.instansi_id||'bapperida');
      if(requireMedia(req,res))return;
      if(!sameInstansi(req.user,id))return fail(res,403,'Forbidden');
      const nama=s(b.nama),dari=s(b.dari),sampai=s(b.sampai||b.dari),masuk=s(b.masuk),pulang=s(b.pulang);
      if(!nama||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(dari)||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(sampai)||sampai<dari||!/^([01]\d|2[0-3]):[0-5]\d$/.test(masuk)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(pulang))return fail(res,400,'Data periode tidak valid.');
      if(masuk>=pulang)return fail(res,400,'Jam masuk harus lebih kecil dari jam pulang.');
      const idPeriode=crypto.randomUUID();
      const r=await query(`INSERT INTO jam_periode (id,nama,dari,sampai,masuk,pulang,ditambahkan_oleh,instansi_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO UPDATE SET nama=EXCLUDED.nama,dari=EXCLUDED.dari,sampai=EXCLUDED.sampai,masuk=EXCLUDED.masuk,pulang=EXCLUDED.pulang RETURNING *`,[idPeriode,nama,dari,sampai,masuk,pulang,req.user.id,id]);
      return res.status(201).json({ok:true,data:r.rows[0],message:'Periode berhasil ditambahkan.'});
    }catch(e){console.error('[periode-add]',e);return fail(res,500,'Gagal menambah periode.');}
  });
  router.post('/jam-periode-delete', async(req,res)=>{if(requireMedia(req,res))return;try{const id=s(req.body?.id);const r=await query(`DELETE FROM jam_periode WHERE id=$1 AND (instansi_id=$2 OR instansi_id IS NULL OR instansi_id='') RETURNING *`,[id,req.user.instansi_id]);if(!r.rows.length)return fail(res,404,'Periode tidak ditemukan.');return ok(res,{data:r.rows[0]},'Periode dihapus.');}catch{return fail(res,500,'Gagal menghapus periode.');}});

  // ── Lokasi ─────────────────────────────────────────────────────────────────
router.get('/lokasi-list', async(req,res)=>{try{const sc=scope(req,req.query.instansi_id);if(!sc.ok)return fail(res,403,'Forbidden');const vals=[];let sql='SELECT *, "Nama_Lokasi" AS nama_lokasi FROM lokasiabsen WHERE instansi_id=$1 OR instansi_id=\'all\'';vals.push(sc.id||'bapperida');const r=await query(sql,vals);return ok(res,{data:r.rows,rows:r.rows});}catch{return fail(res,503,'Layanan lokasi tidak tersedia.');}});
router.post('/lokasi-add', async(req,res)=>{if(requireMedia(req,res))return;try{const b=req.body||{},id=s(b.instansi_id||req.user.instansi_id||'bapperida');if(!sameInstansi(req.user,id))return fail(res,403,'Forbidden');const r=await query(`INSERT INTO lokasiabsen (id,"Nama_Lokasi",latitude,longitude,hari,radius,ip_range,instansi_id) VALUES ((SELECT COALESCE(MAX(id),0)+1 FROM lokasiabsen),$1,$2,$3,$4,$5,$6,$7) RETURNING *`,[s(b.nama_lokasi),b.latitude,b.longitude,s(b.hari),b.radius,s(b.ip_range),id]);return res.status(201).json({ok:true,data:r.rows[0],message:'Lokasi berhasil ditambahkan.'});}catch(e){console.error('[lokasi-add]',e);return fail(res,500,'Gagal menambah lokasi.');}});
router.delete('/lokasi-delete', async(req,res)=>{if(requireMedia(req,res))return;try{const id=s(req.query.id);const r=await query(`DELETE FROM lokasiabsen WHERE id=$1 AND (instansi_id=$2 OR instansi_id='all') RETURNING *`,[id,req.user.instansi_id]);if(!r.rows.length)return fail(res,404,'Lokasi tidak ditemukan.');return ok(res,{data:r.rows[0]},'Lokasi dihapus.');}catch{return fail(res,500,'Gagal menghapus lokasi.');}});
router.post('/lokasi-update', async(req,res)=>{if(requireMedia(req,res))return;try{const b=req.body||{},id=s(b.id);const old=(await query('SELECT instansi_id FROM lokasiabsen WHERE id=$1',[id])).rows[0];if(!old||!sameInstansi(req.user,old.instansi_id))return fail(res,403,'Forbidden');const vals=[s(b.nama_lokasi),s(b.hari),b.radius,s(b.ip_range),req.user.instansi_id,id];const r=await query(`UPDATE lokasiabsen SET "Nama_Lokasi"=$1,hari=$2,radius=$3,ip_range=$4,instansi_id=$5 WHERE id=$6 RETURNING *`,vals);return ok(res,{data:r.rows[0]},'Lokasi diperbarui.');}catch{return fail(res,500,'Gagal memperbarui lokasi.');}});

  // ── Hari libur ─────────────────────────────────────────────────────────────
  router.get('/libur-list', async(_req,res)=>{try{const r=await query(`SELECT * FROM libur_nasional ORDER BY tanggal ASC`,[]);return ok(res,{data:r.rows,rows:r.rows});}catch{return fail(res,503,'Layanan hari libur tidak tersedia.');}});
  router.post('/libur-add', async(req,res)=>{if(requireMedia(req,res))return;try{const b=req.body||{};const tanggal=s(b.tanggal),nama=s(b.nama||'Hari Libur');if(!/^\d{4}-\d{2}-\d{2}$/.test(tanggal))return fail(res,400,'Format tanggal tidak valid.');const r=await query(`INSERT INTO libur_nasional (tanggal,nama,ditambahkan_oleh) VALUES ($1,$2,$3) ON CONFLICT (tanggal) DO UPDATE SET nama=EXCLUDED.nama RETURNING *`,[tanggal,nama,req.user.id]);return ok(res,{data:r.rows[0]},'Hari libur disimpan.');}catch(e){console.error('[libur-add]',e);return fail(res,500,'Gagal menambah hari libur.');}});
  router.post('/libur-delete', async(req,res)=>{if(requireMedia(req,res))return;try{const tanggal=s(req.body?.tanggal);const r=await query(`DELETE FROM libur_nasional WHERE tanggal=$1 RETURNING *`,[tanggal]);if(!r.rows.length)return fail(res,404,'Hari libur tidak ditemukan.');return ok(res,{data:r.rows[0]},'Hari libur dihapus.');}catch{return fail(res,500,'Gagal menghapus hari libur.');}});

  // ── Kontrol absensi ─────────────────────────────────────────────────────────
  router.get('/kontrol-absen', async(req,res)=>{try{const sc=scope(req,req.query.instansi_id);if(!sc.ok)return fail(res,403,'Forbidden');const r=await query(`SELECT value FROM pengaturan WHERE key='kontrol_absen' AND instansi_id=$1 LIMIT 1`,[sc.id||'bapperida']);let config={enabled:false,toleransi:30,times:[{jam:'10:00',aktif:true}]};if(r.rows[0]?.value){try{config={...config,...JSON.parse(r.rows[0].value)};}catch{ /* invalid legacy JSON -> defaults */ }}if(!Array.isArray(config.times))config.times=[];return ok(res,{data:{config}});}catch{return fail(res,503,'Layanan kontrol absensi tidak tersedia.');}});
  router.post('/kontrol-absen', async(req,res)=>{if(requireMedia(req,res))return;try{const b=req.body||{},id=s(b.instansi_id||req.user.instansi_id||'bapperida');if(!sameInstansi(req.user,id))return fail(res,403,'Forbidden');const value=JSON.stringify({enabled:bool(b.enabled),toleransi:Number.parseInt(b.toleransi,10)||30,times:Array.isArray(b.times)?b.times.map(t=>({jam:s(t.jam).slice(0,5),aktif:t.aktif!==false})).filter(t=>/^\d{2}:\d{2}$/.test(t.jam)):[]});const r=await query(`INSERT INTO pengaturan (key,value,instansi_id) VALUES ('kontrol_absen',$1,$2) ON CONFLICT (key,instansi_id) DO UPDATE SET value=EXCLUDED.value RETURNING key,value,instansi_id`,[value,id]);return ok(res,{data:r.rows[0]},'Kontrol absensi disimpan.');}catch{return fail(res,500,'Gagal menyimpan kontrol absensi.');}});



  return router;
}
