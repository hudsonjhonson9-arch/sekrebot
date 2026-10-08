import express from 'express';
import { sameInstansi } from './auth.js';

const KET_ROLES = new Set(['USER','INSPEKTUR','ADMIN','SUPERADMIN','KEPALA','SEKRETARIS','KABID','IRBAN']);
const ADMIN_ROLES = new Set(['ADMIN','SUPERADMIN','KEPALA','SEKRETARIS','KABID','IRBAN']);

const ok = (res, data = {}) => res.status(200).json({ ok: true, ...data });
const fail = (res, status, message) => res.status(status).json({ ok: false, message });
const roleIsAdmin = req => ADMIN_ROLES.has(String(req.user?.role || '').toUpperCase());
const instScope = (req, requested) => {
  const inst = requested == null || requested === '' ? req.user?.instansi_id : requested;
  return { inst, allowed: sameInstansi(req.user, inst) };
};
function parseDate(s) { const d = new Date(`${s}T00:00:00`); return Number.isNaN(d.getTime()) ? null : d; }
function dateRange(start, end) {
  const a = parseDate(start), b = parseDate(end); if (!a || !b || b < a) return [];
  const out=[]; for (let d=new Date(a); d<=b; d.setDate(d.getDate()+1)) out.push(d.toISOString().slice(0,10)); return out;
}
function toMinutes(v) { const m=/^(\d{1,2}):(\d{2})/.exec(String(v||'')); return m ? Number(m[1])*60+Number(m[2]) : null; }

export function createAttendanceDataRouter({ query, withTransaction }) {
  const router = express.Router();

  // KETERANGAN / IZIN
  router.get('/keterangan', async (req,res) => {
    try {
      const isAdmin = roleIsAdmin(req) && (req.query.is_admin === 'true' || req.query.status === 'PENDING');
      const requestedInst = req.query.instansi_id || req.user.instansi_id;
      const {inst,allowed}=instScope(req, requestedInst); if (!allowed) return fail(res,403,'Forbidden');
      const params=[]; let sql=`SELECT "ID_Ket" AS id_ket, "ID_Pegawai"::text AS user_id, "Nama" AS nama, "NIP" AS nip, "Tanggal" AS tanggal, "tgl_mulai" AS tgl_mulai, "tgl_selesai" AS tgl_selesai, "Jam" AS jam, "Jenis Absen" AS jenis, "Ket" AS keterangan, "Status" AS status, "drive_link" AS drive_link, "request_id", instansi_id FROM ket_temp WHERE 1=1`;
      if (isAdmin) { sql += ` AND (instansi_id = $${params.length+1} OR $${params.length+1} = '')`; params.push(inst || ''); }
      else { sql += ` AND "ID_Pegawai"::text = $${params.length+1}`; params.push(String(req.user.id)); }
      if (req.query.status) { sql += ` AND UPPER("Status") = UPPER($${params.length+1})`; params.push(String(req.query.status)); }
      sql += ' ORDER BY COALESCE("tgl_mulai", "Tanggal") DESC NULLS LAST, "ID_Ket" DESC';
      const rows=(await query(sql,params)).rows; return ok(res,{rows,data:rows,count:rows.length});
    } catch(e){ console.error('[keterangan/list]',e); return fail(res,503,'Layanan tidak tersedia'); }
  });

  router.post('/keterangan', async (req,res) => {
    try {
      const b=req.body||{}; const isAdmin=roleIsAdmin(req) && b.source==='admin_panel';
      const targetId=isAdmin && b.user_id ? String(b.user_id) : String(req.user.id);
      const emp=(await query(`SELECT id::text AS id, username, "NIP" AS nip, "Jabatan" AS jabatan, "Status" AS status, instansi_id FROM user_list WHERE id::text=$1 LIMIT 1`,[targetId])).rows[0];
      if(!emp) return fail(res,404,'Anda tidak terdaftar dalam sistem. Hubungi admin.');
      if(!sameInstansi(req.user,emp.instansi_id)) return fail(res,403,'Forbidden');
      if(String(emp.status||'AKTIF').toUpperCase()==='NONAKTIF') return fail(res,403,'Akun Anda dinonaktifkan. Hubungi admin.');
      const start=String(b.tgl_mulai||''), end=String(b.tgl_selesai||''); if(!start||!end) return fail(res,400,'Tanggal mulai dan selesai wajib diisi.');
      if(!parseDate(start)||!parseDate(end)||end<start) return fail(res,400,'Tanggal tidak valid atau tanggal selesai sebelum tanggal mulai.');
      const jenis=String(b.jenis||'').toUpperCase(); const valid=['IZIN','SAKIT','TUGAS','TUBEL','CUTI']; if(!valid.includes(jenis)) return fail(res,400,'Jenis tidak valid.');
      const ket=String(b.keterangan||'').trim(); if(!ket) return fail(res,400,'Keterangan tidak boleh kosong.');
      const dates=dateRange(start,end); const durasi=dates.length; const hasProof=Boolean(b.bukti_base64 || b.drive_link);
      if(jenis==='TUGAS'&&!hasProof) return fail(res,400,'Surat Tugas / Dinas Luar wajib menyertakan bukti.');
      if(jenis==='SAKIT'&&durasi>1&&!hasProof) return fail(res,400,`Izin Sakit lebih dari 1 hari (${durasi} hari) wajib menyertakan bukti.`);
      if(!isAdmin){ const now=new Date(); const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Makassar',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(now); const mins=Number(parts.find(x=>x.type==='hour').value)*60+Number(parts.find(x=>x.type==='minute').value); if(mins>480) return fail(res,400,'Lewat batas waktu pengajuan. Pengajuan keterangan hanya bisa dikirim sebelum jam 08:00 WITA.'); }
      const requestId=String(b.request_id||'').trim();
      if(requestId){ const prior=(await query(`SELECT "ID_Ket" AS id_ket,"Status" AS status FROM ket_temp WHERE request_id=$1 LIMIT 1`,[requestId])).rows[0]; if(prior) return ok(res,{message:'Pengajuan sudah diterima.',data:prior}); }
      const prefix={IZIN:'IZN',SAKIT:'SKT',TUGAS:'TGS'}[jenis] || jenis.slice(0,3);
      const idKet=`${prefix}${start.replace(/-/g,'')}_${emp.nip || emp.id}`;
      const status=(jenis==='IZIN')?'PENDING':'DISETUJUI';
      const jam=(b.jam_mulai&&b.jam_selesai)?`${b.jam_mulai} - ${b.jam_selesai}`:new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Makassar',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
      const tglRange=start===end?start:`${start} s.d. ${end}`;
      const driveLink=String(b.drive_link||'');
      const result=await query(`INSERT INTO ket_temp ("ID_Ket","ID_Pegawai","Nama","NIP","Tanggal","tgl_mulai","tgl_selesai","Jam","Jenis Absen","Ket","Status",${driveLink?'"drive_link",':''}"request_id","instansi_id") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,${driveLink?'$12,':''}$${driveLink?13:12},$${driveLink?14:13}) RETURNING *`, driveLink?[idKet,emp.id,emp.username||'—',emp.nip||'',tglRange,start,end,jam,jenis,ket,status,driveLink,requestId,emp.instansi_id]:[idKet,emp.id,emp.username||'—',emp.nip||'',tglRange,start,end,jam,jenis,ket,status,requestId,emp.instansi_id]);
      if(status==='DISETUJUI') await applyApprovedKeterangan(query,{row:result.rows[0],dates,jenis,emp,requestId,ket,jam});
      return ok(res,{message:status==='PENDING'?'Pengajuan berhasil dikirim dan menunggu persetujuan.':'Keterangan berhasil dicatat.',data:result.rows[0]});
    }catch(e){ console.error('[keterangan/add]',e); return fail(res,500,'Gagal menyimpan keterangan.'); }
  });

  router.post('/keterangan/edit', async(req,res)=>{
    try{const b=req.body||{}; const id=String(b.id_ket||''); if(!id)return fail(res,400,'id_ket wajib diisi'); const own=(await query(`SELECT * FROM ket_temp WHERE "ID_Ket"=$1 LIMIT 1`,[id])).rows[0]; if(!own)return fail(res,404,'Data tidak ditemukan.'); if(String(own.ID_Pegawai)!==String(req.user.id)&&!roleIsAdmin(req))return fail(res,403,'Forbidden'); if(String(own.Status||'').toUpperCase()!=='PENDING')return fail(res,400,'Hanya keterangan PENDING yang dapat diedit.'); const jenis=String(b.jenis||own['Jenis Absen']||'IZIN').toUpperCase(); const start=String(b.tgl_mulai||'');const end=String(b.tgl_selesai||start); if(!parseDate(start)||!parseDate(end)||end<start)return fail(res,400,'Tanggal tidak valid.'); const result=await query(`UPDATE ket_temp SET "Tanggal"=$1,"tgl_mulai"=$2,"tgl_selesai"=$3,"Jenis Absen"=$4,"Ket"=$5,"Status"='PENDING' WHERE "ID_Ket"=$6 RETURNING *`,[start===end?start:`${start} s.d. ${end}`,start,end,jenis,String(b.keterangan||'').trim(),id]);return ok(res,{message:'Keterangan berhasil diperbarui.',data:result.rows[0]});}catch(e){console.error('[keterangan/edit]',e);return fail(res,500,'Gagal memperbarui keterangan.');}}
  );

  router.post('/keterangan/delete', async(req,res)=>{
    try{const b=req.body||{};const id=String(b.id_ket||'');const row=(await query(`SELECT * FROM ket_temp WHERE "ID_Ket"=$1 LIMIT 1`,[id])).rows[0];if(!row)return fail(res,404,'Data tidak ditemukan.');if(String(row.ID_Pegawai)!==String(req.user.id)&&!roleIsAdmin(req))return fail(res,403,'Forbidden');if(String(row.Status||'').toUpperCase()!=='PENDING')return fail(res,400,'Hanya keterangan PENDING yang bisa dihapus.');await query(`DELETE FROM ket_temp WHERE "ID_Ket"=$1`,[id]);return ok(res,{message:'Keterangan berhasil dihapus.'});}catch(e){console.error('[keterangan/delete]',e);return fail(res,500,'Gagal menghapus keterangan.');}}
  );

  router.post('/keterangan/approve', async(req,res)=>{
    if(!roleIsAdmin(req))return fail(res,403,'Forbidden');
    try{const b=req.body||{};const id=String(b.id_ket||'').replace(/_\d{2}$/,'');const action=String(b.action||'').toUpperCase();const jenis=String(b.jenis||'').toUpperCase();if(!id||!['APPROVE','REJECT'].includes(action)||!jenis)return fail(res,400,'id_ket, action, dan jenis wajib diisi.');const row=(await query(`SELECT * FROM ket_temp WHERE "ID_Ket"=$1 LIMIT 1`,[id])).rows[0];if(!row)return fail(res,404,'Data tidak ditemukan di ket_temp.');if(!sameInstansi(req.user,row.instansi_id))return fail(res,403,'Forbidden');const dates=dateRange(row.tgl_mulai,row.tgl_selesai||row.tgl_mulai);const newStatus=action==='APPROVE'?'DISETUJUI':'DITOLAK';await withTransaction(async client=>{await client.query(`UPDATE ket_temp SET "Status"=$1,"Jenis Absen"=$2 WHERE "ID_Ket"=$3`,[newStatus,action==='APPROVE'?jenis:`${jenis} DITOLAK`,id]);if(action==='APPROVE'){await applyApprovedKeterangan(client,{row,dates,jenis,emp:{id:String(row.ID_Pegawai),username:row.Nama,nip:row.NIP,instansi_id:row.instansi_id},requestId:row.request_id,ket:row.Ket,jam:row.Jam});}});return ok(res,{message:action==='APPROVE'?'Keterangan disetujui.':'Keterangan ditolak.'});}catch(e){console.error('[keterangan/approve]',e);return fail(res,500,'Gagal memproses persetujuan.');}}
  );

  // DOKUMEN PEGAWAI
  router.get('/dokumen', async(req,res)=>{try{const nip=String(req.query.nip||req.user.nip||'');if(!nip)return fail(res,400,'nip wajib diisi');const target=(await query(`SELECT "NIP" AS nip,instansi_id FROM user_list WHERE "NIP"=$1 LIMIT 1`,[nip])).rows[0];if(!target||!sameInstansi(req.user,target.instansi_id))return fail(res,403,'Forbidden');const rows=(await query(`SELECT nip,nama_dokumen,jenis,tanggal,instansi_id,link,tambah_oleh FROM dokumen_pegawai WHERE nip=$1 ORDER BY tanggal DESC NULLS LAST,nama_dokumen`,[nip])).rows.map(r=>({...r,id:r.nama_dokumen,link:r.link==='-'?'':r.link}));return ok(res,{data:rows,rows,count:rows.length});}catch(e){console.error('[dokumen/list]',e);return fail(res,503,'Layanan tidak tersedia');}});
  router.post('/dokumen', async(req,res)=>{try{const b=req.body||{};const nip=String(b.nip||req.user.nip||'');const target=(await query(`SELECT "NIP" AS nip,instansi_id FROM user_list WHERE "NIP"=$1 LIMIT 1`,[nip])).rows[0];if(!target||!sameInstansi(req.user,target.instansi_id))return fail(res,403,'Forbidden');const nama=String(b.nama_dokumen||b.nama||'').trim();if(!nama)return fail(res,400,'nama_dokumen wajib diisi');const link=String(b.link||b.webViewLink||'-');const file=b.file_base64?String(b.file_base64):null;const row=(await query(`INSERT INTO dokumen_pegawai (nip,nama_dokumen,jenis,tanggal,instansi_id,link,file,tambah_oleh) VALUES ($1,$2,$3,CURRENT_DATE,$4,$5,NULLIF($6,''),$7) RETURNING nip,nama_dokumen,jenis,tanggal,instansi_id,link,tambah_oleh`,[nip,nama,String(b.jenis||b.kategori||'DOKUMEN').toUpperCase(),target.instansi_id,link,file,String(b.tambah_oleh||req.user.nip||req.user.id)])).rows[0];return ok(res,{data:{...row,id:row.nama_dokumen,link:row.link==='-'?'':row.link},message:'Dokumen berhasil disimpan.'});}catch(e){console.error('[dokumen/add]',e);return fail(res,500,'Gagal menyimpan dokumen.');}});
  router.post('/dokumen/delete', async(req,res)=>{try{const b=req.body||{};const id=String(b.id||'');const nip=String(b.nip||req.user.nip||'');const target=(await query(`SELECT "NIP" AS nip,instansi_id FROM user_list WHERE "NIP"=$1 LIMIT 1`,[nip])).rows[0];if(!target||!sameInstansi(req.user,target.instansi_id))return fail(res,403,'Forbidden');const r=await query(`DELETE FROM dokumen_pegawai WHERE nip=$1 AND nama_dokumen=$2 RETURNING *`,[nip,id]);if(!r.rows.length)return fail(res,404,'Dokumen tidak ditemukan.');return ok(res,{message:'Dokumen berhasil dihapus.'});}catch(e){console.error('[dokumen/delete]',e);return fail(res,500,'Gagal menghapus dokumen.');}});
  router.get('/dokumen/file', async(req,res)=>{try{const nip=String(req.query.nip||req.user.nip||''),id=String(req.query.id||'');const target=(await query(`SELECT "NIP" AS nip,instansi_id FROM user_list WHERE "NIP"=$1 LIMIT 1`,[nip])).rows[0];if(!target||!sameInstansi(req.user,target.instansi_id))return fail(res,403,'Forbidden');const row=(await query(`SELECT file AS file_base64,'application/pdf' AS mime_type FROM dokumen_pegawai WHERE nama_dokumen=$1 AND nip=$2 LIMIT 1`,[id,nip])).rows[0];if(!row)return fail(res,404,'Dokumen tidak ditemukan.');return ok(res,row);}catch(e){console.error('[dokumen/file]',e);return fail(res,500,'Gagal mengambil dokumen.');}});

  // REKAP ABSENSI — port dari workflow Hitung Rekap.
  router.get('/rekap-absen', async(req,res)=>{try{const dari=String(req.query.dari||''),sampai=String(req.query.sampai||'');if(!parseDate(dari)||!parseDate(sampai)||sampai<dari)return fail(res,400,'Periode rekap tidak valid.');const {inst,allowed}=instScope(req,req.query.instansi_id);if(!allowed)return fail(res,403,'Forbidden');const users=(await query(`SELECT id::text AS id,username,username AS nama,"NIP" AS nip,"Jabatan" AS jabatan,pangkat,bidang,nomorhp,"no" AS urutan,"Status" AS status FROM user_list WHERE instansi_id=$1 ORDER BY "no" ASC NULLS LAST`,[inst])).rows.filter(u=>String(u.status||'AKTIF').toUpperCase()!=='NONAKTIF');const logs=(await query(`SELECT * FROM "Log_Absen" WHERE "Tanggal" >= $1 AND "Tanggal" <= $2 AND instansi_id=$3 ORDER BY "Tanggal" ASC,"Jam" ASC`,[dari,sampai,inst])).rows;let libur=new Set();try{const q=String(req.query.libur||'');if(q){const a=JSON.parse(decodeURIComponent(q));if(Array.isArray(a))libur=new Set(a.map(String));}}catch{libur=new Set();}let periods=[];try{const q=String(req.query.jam_periode||'');if(q)periods=JSON.parse(decodeURIComponent(q));}catch{periods=[];}const stdIn=toMinutes(req.query.jam_masuk)||435,stdOut=toMinutes(req.query.jam_pulang)||870;const getJam=t=>{const p=periods.find(x=>{const a=parseDate(x.dari),b=parseDate(x.sampai);return a&&b&&parseDate(t)>=a&&parseDate(t)<=b&&x.masuk&&x.pulang});return p?{masuk:toMinutes(p.masuk)||stdIn,pulang:toMinutes(p.pulang)||stdOut}:{masuk:stdIn,pulang:stdOut};};const range=dateRange(dari,sampai).filter(t=>{const d=parseDate(t);return d.getDay()!==0&&d.getDay()!==6&&!libur.has(t)});const workDays=Math.max(1,range.length);const map=new Map(users.map(u=>[String(u.id),{...u,masuk:0,pulang:0,di_luar_masuk_periode:0,di_luar_pulang_periode:0,izin:0,sakit:0,tugas:0,tubel:0,cuti:0,alpa:0,menit_terlambat_periode:0,menit_lebih_awal_periode:0,hadir_dates:new Set(),excused_dates:new Set(),logByDate:{},jamMasuk:'-',jamPulang:'-'}]));for(const l of logs){const p=map.get(String(l.ID||l.id||''));if(!p)continue;const t=String(l.Tanggal||l.tanggal||'').slice(0,10),j=String(l.Jam||l.jam||'').slice(0,5),jm=toMinutes(j);if(!t||jm===null)continue;p.logByDate[t] ||= {};let jenis=String(l['Jenis Absen']||'').toUpperCase().trim();const batas=getJam(t);if(jenis==='MASUK'||jenis==='DI LUAR JAM MASUK'){if(jm>batas.masuk){p.di_luar_masuk_periode++;p.menit_terlambat_periode+=jm-batas.masuk;}else p.masuk++;p.jamMasuk=j;p.logByDate[t].masuk=jm;p.hadir_dates.add(t);}else if(['PULANG','DI LUAR JAM PULANG','PULANG LUAR'].includes(jenis)){if(jenis==='PULANG LUAR'||jm>=batas.pulang)p.pulang++;else{p.di_luar_pulang_periode++;p.menit_lebih_awal_periode+=batas.pulang-jm;}p.jamPulang=j;p.logByDate[t].pulang=jm;}else if(['IZIN','SAKIT','TUGAS','DL','TUBEL','CUTI','TB','TANPA BERITA','ALPA'].includes(jenis)){if(jenis==='IZIN')p.izin++;else if(jenis==='SAKIT')p.sakit++;else if(jenis==='TUBEL')p.tubel++;else if(jenis==='CUTI')p.cuti++;else if(['TB','TANPA BERITA','ALPA'].includes(jenis))p.alpa++;else p.tugas++;p.excused_dates.add(t);}}
      const pegawai=users.map(u=>{const p=map.get(String(u.id));let hadirMenit=0;for(const t of range){const x=p.logByDate[t];if(x&&x.masuk!==undefined&&x.pulang!==undefined&&x.pulang>x.masuk)hadirMenit+=x.pulang-x.masuk;}const totalMasuk=p.masuk+p.di_luar_masuk_periode;const disiplin=totalMasuk?Math.max(0,Math.round(p.masuk/totalMasuk*100)):100;const sah=p.hadir_dates.size+p.tugas+p.sakit+p.tubel+p.cuti;const kehadiran=Math.min(100,Math.round(sah/workDays*100));return {...p,jamHadir:(hadirMenit/60).toFixed(1),lambat_count:p.di_luar_masuk_periode,pulang_cepat_count:p.di_luar_pulang_periode,menit_terlambat:p.menit_terlambat_periode,menit_lebih_awal:p.menit_lebih_awal_periode,disiplinPct:disiplin,kehadiranPct:kehadiran,totalAkkHHMM:`${Math.floor((p.menit_terlambat_periode+p.menit_lebih_awal_periode)/60)}:${String((p.menit_terlambat_periode+p.menit_lebih_awal_periode)%60).padStart(2,'0')}`,hadir_dates:[...p.hadir_dates],excused_dates:[...p.excused_dates]};});const sum=k=>pegawai.reduce((s,p)=>s+(Number(p[k])||0),0);return ok(res,{ringkasan:{masuk:sum('masuk'),pulang:sum('pulang'),luar:sum('lambat_count')+sum('pulang_cepat_count'),izin:sum('izin'),sakit:sum('sakit'),tugas:sum('tugas'),tubel:sum('tubel'),cuti:sum('cuti'),alpa:sum('alpa')},pegawai});}catch(e){console.error('[rekap]',e);return fail(res,500,'Gagal menghitung rekap absensi.');}});

  return router;
}

async function qx(q, sql, params){ return typeof q === 'function' ? q(sql, params) : q.query(sql, params); }

async function applyApprovedKeterangan(queryLike,{row,dates,jenis,emp,requestId,ket,jam}){
  for(let i=0;i<dates.length;i++){
    const t=dates[i];const rid=`${requestId||''}_${t.replace(/-/g,'')}${String(i+1).padStart(2,'0')}`;await qx(queryLike, `INSERT INTO "Log_Absen" ("Nama","NIP","Tanggal","Jam","Jenis Absen","Lokasi","Ket","koordinat","ID","request_id","instansi_id") VALUES ($1,$2,$3,$4,$5,'-',$6,'-',$7,$8,$9)`,[emp.username||row.Nama||'',emp.nip||row.NIP||'',t,jam,jenis,ket,String(emp.id),rid,emp.instansi_id]);if(jenis==='IZIN'&&toMinutes(String(row.Jam||jam).split('-').pop()?.trim())>=870){await qx(queryLike, `INSERT INTO "Log_Absen" ("Nama","NIP","Tanggal","Jam","Jenis Absen","Lokasi","Ket","koordinat","ID","request_id","instansi_id") VALUES ($1,$2,$3,$4,'PULANG','-',$5,'-',$6,$7,$8)`,[emp.username||row.Nama||'',emp.nip||row.NIP||'',t,String(row.Jam||jam).split('-').pop().trim(),`${ket} (Auto Pulang dari Izin Jam)`,String(emp.id),`${rid}_PLG`,emp.instansi_id]);}}
}
