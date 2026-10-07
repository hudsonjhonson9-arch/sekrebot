import express from 'express';
import { sameInstansi } from './auth.js';

const s = (v) => v === undefined || v === null ? '' : String(v).trim();

export function createCoreUserRouter({ query } = {}) {
  const router = express.Router();

  router.post('/update-status', async (req, res) => {
    try {
      const b = req.body || {};
      const id = s(b.user_id || b.id || req.user.id);
      if (!/^\d+$/.test(id)) return res.status(400).json({ ok:false, message:'user_id tidak valid.' });
      // USER hanya boleh mengubah dirinya sendiri. Admin tetap boleh mengubah
      // pegawai dalam instansinya sendiri.
      if (req.user.role === 'USER' && String(req.user.id) !== id) {
        return res.status(403).json({ ok:false, message:'Forbidden' });
      }
      const u = (await query('SELECT id::text AS id,instansi_id FROM user_list WHERE id=$1::bigint',[id])).rows[0];
      if (!u || !sameInstansi(req.user,u.instansi_id)) return res.status(403).json({ok:false,message:'Forbidden'});
      const status = s(b.status || 'AKTIF').toUpperCase();
      const r = await query('UPDATE user_list SET "Status"=$1 WHERE id=$2::bigint RETURNING id::text AS id,"Status" AS status',[status,id]);
      return res.json({ok:true,data:r.rows[0],message:'Status diperbarui.'});
    } catch { return res.status(500).json({ok:false,message:'Gagal memperbarui status.'}); }
  });

  router.post('/gps-track', async (req,res) => {
    try {
      const b=req.body||{};
      const lat=Number(b.latitude),lng=Number(b.longitude),acc=Number(b.horizontal_accuracy);
      if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<-90||lat>90||lng<-180||lng>180) return res.status(400).json({ok:false,message:'Koordinat tidak valid.'});
      const r=await query(`INSERT INTO gps_tracking (nip,user_id,latitude,longitude,horizontal_accuracy,recorded_at,device) VALUES ($1,$2,$3,$4,$5,now(),$6) RETURNING id,recorded_at`,[req.user.nip,req.user.id,lat,lng,Number.isFinite(acc)?acc:null,s(b.device).slice(0,500)]);
      return res.json({ok:true,data:r.rows[0]});
    } catch { return res.status(500).json({ok:false,message:'Gagal menyimpan GPS.'}); }
  });

  return router;
}
