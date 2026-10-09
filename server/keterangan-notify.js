// Notifikasi keterangan (IZIN/SAKIT/TUGAS/TUBEL/CUTI) — replika matriks kirim
// workflow n8n "Ket absensi wf.json": broadcast ke semua pegawai aktif
// (Telegram PM + grup WhatsApp via WAHA) saat keterangan auto-tercatat atau
// disetujui, dan notif ke admin (Telegram PM) saat IZIN masih PENDING.
// Semua pengiriman fail-soft: kegagalan jaringan tidak boleh membatalkan simpan DB.
const INSTANSI_MAP = { bapperida: 'BAPPERIDA Sumba Barat', dpmptsp: 'DPMPTSP Sumba Barat' };
const instName = id => INSTANSI_MAP[id] || String(id || 'bapperida').toUpperCase();
const emAuto = j => (j === 'SAKIT' ? '🤧' : '💼');
const emApprove = j => ({ IZIN: '🙏', SAKIT: '🤒', TUGAS: '💼' }[j] || '📝');
const labelAuto = j => (j === 'SAKIT' ? 'SAKIT' : 'SURAT TUGAS / DINAS LUAR (DL)');
const LINE = '━━━━━━━━━━━━━━━━━━';

export function buildAutoText({ jenis, nama, nip, jabatan, ket, tglRange, durasi, driveLink, instansi_id }) {
  return `${emAuto(jenis)} *INFO ${labelAuto(jenis)} — TERCATAT OTOMATIS*\n${LINE}\n`
    + `👤 *${nama}*\n🪪 NIP: ${nip}\n🏢 ${jabatan || '—'}\n\n`
    + `📅 *Tanggal* : ${tglRange}\n⏱️ *Durasi*  : ${durasi} hari\n📝 *Keterangan*:\n${ket}\n`
    + (driveLink ? `📎 *Bukti*   : [Lihat di Google Drive](${driveLink})\n` : '')
    + `${LINE}\n_Info otomatis dari sistem ${instName(instansi_id)}_`;
}

export function buildApproveText({ action, jenis, nama, ket, tglRange, instansi_id }) {
  const isApprove = String(action).toUpperCase() === 'APPROVE';
  return `DIINFORMASIKAN BAHWA\n${LINE}\n`
    + `${isApprove ? '✅' : '❌'} *STATUS: ${isApprove ? 'DISETUJUI' : 'DITOLAK'}*\n`
    + `${emApprove(jenis)} *${jenis}* — ${tglRange}\n👤 *${nama}*\n📝 ${ket || '—'}\n`
    + `${LINE}\n_Pengumuman dari Admin ${instName(instansi_id)}_`;
}

export function buildAdminText({ nama, nip, jabatan, ket, tglRange, durasi, driveLink }) {
  return `🙏 *PENGAJUAN IZIN — BUTUH KONFIRMASI ADMIN*\n${LINE}\n`
    + `👤 *${nama}*\n🪪 NIP: ${nip}\n🏢 ${jabatan || '—'}\n\n`
    + `📅 *Tanggal* : ${tglRange}\n⏱️ *Durasi*  : ${durasi} hari\n📝 *Keterangan*:\n${ket}\n`
    + (driveLink ? `📎 *Bukti*   : [Lihat di Google Drive](${driveLink})\n` : '')
    + `${LINE}\n_Buka Panel Admin untuk Menyetujui / Menolak._`;
}

export function telegramSender(token) {
  return async ({ chatId, text }) => {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', disable_web_page_preview: true }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(d.description || `Telegram HTTP ${r.status}`);
    return d;
  };
}

export function wahaSender({ url, apiKey, session = 'default', chatId }) {
  return async ({ text }) => {
    const r = await fetch(`${String(url).replace(/\/$/, '')}/api/sendText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'X-Api-Key': apiKey } : {}) },
      body: JSON.stringify({ session, chatId, text }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.message || `WAHA HTTP ${r.status}`);
    return d;
  };
}

const ACTIVE = `UPPER(COALESCE("Status",'AKTIF')) NOT IN ('NONAKTIF','INACTIVE')`;

// notify({kind, ...}):
//   kind='auto'          → broadcast ke pegawai aktif (WA grup + Telegram PM), teks INFO
//   kind='approve'       → broadcast ke pegawai aktif, teks STATUS (APPROVE & REJECT sama)
//   kind='admin_pending' → Telegram PM ke admin instansi saat IZIN PENDING (tanpa WA)
export function createKeteranganNotify({ query, sendTelegram, sendWA, fallbackAdmin = '1383864355' }) {
  async function pegawaiAktif(inst) {
    const { rows } = await query(`SELECT id::text AS id FROM user_list WHERE instansi_id=$1 AND ${ACTIVE}`, [inst || 'bapperida']);
    return rows.map(r => String(r.id)).filter(Boolean);
  }
  async function adminList(inst) {
    const { rows } = await query(`SELECT id::text AS id FROM user_list WHERE is_admin=true AND (instansi_id=$1 OR UPPER(COALESCE(role,'')) IN ('SUPERADMIN','SUPER ADMIN'))`, [inst || 'bapperida']);
    const ids = rows.map(r => String(r.id)).filter(Boolean);
    return ids.length ? ids : [fallbackAdmin];
  }
  const tg = (chatId, text) => (sendTelegram ? sendTelegram({ chatId, text }).catch(e => console.error('[ket-notify/tg]', chatId, e.message)) : Promise.resolve());
  const wa = text => (sendWA ? sendWA({ text }).catch(e => console.error('[ket-notify/wa]', e.message)) : Promise.resolve());

  return async function notify({ kind, jenis, emp = {}, ket, tglRange, durasi, driveLink, instansi_id, nama, nip, jabatan, action }) {
    const inst = instansi_id || emp.instansi_id || 'bapperida';
    const nm = nama || emp.username || '—';
    if (kind === 'admin_pending') {
      const text = buildAdminText({ nama: nm, nip: nip || emp.nip || '—', jabatan: jabatan || emp.jabatan || '—', ket, tglRange, durasi, driveLink });
      const ids = await adminList(inst);
      await Promise.all(ids.map(id => tg(id, text)));
      return;
    }
    const text = kind === 'approve'
      ? buildApproveText({ action, jenis, nama: nm, ket, tglRange, instansi_id: inst })
      : buildAutoText({ jenis, nama: nm, nip: nip || emp.nip || '—', jabatan: jabatan || emp.jabatan || '—', ket, tglRange, durasi, driveLink, instansi_id: inst });
    const ids = await pegawaiAktif(inst);
    await Promise.all([wa(text), ...ids.map(id => tg(id, text))]);
  };
}
