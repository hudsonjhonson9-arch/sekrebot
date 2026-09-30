/* ═══════════════════════════════════════════════════════════════
   SIMAPO — BAST SERAH TERIMA ASET
   Fitur: satu pegawai = satu Berita Acara Serah Terima berisi seluruh
   aset yang dipegangnya, digenerate menjadi .docx (docxtemplater)
   dan diarsipkan ke SIMAPO.bast via webhook n8n.
   ═══════════════════════════════════════════════════════════════ */

window._bastData = { pegawai: [], aset: [], ruangan: [], penandatangan: [] };
window._bastSel = { pe: '', ttd: '', incl: {} };   // incl: { [asetId]: true }

/* ─── HELPER SUBMIT (dengan header auth x-bast-key) ─────────── */
window.bastSubmit = async function(endpoint, payload, opts = {}) {
  const successMsg = opts.successMsg || 'Berhasil disimpan';
  const errorMsg = opts.errorMsg || 'Gagal menyimpan data.';
  let res, body = null;
  try {
    res = await apiFetch(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { [BAST_API_HEADER]: BAST_API_KEY }
    });
  } catch (e) {
    console.error('[BAST] Request gagal:', endpoint, e);
    showToast('Gagal menghubungi server.', 'error');
    return false;
  }
  try { body = await res.json(); } catch (_) {}
  const ok = res.ok && (typeof isApiSuccess === 'function' ? isApiSuccess(body, true) : true);
  if (!ok) {
    console.error('[BAST] Ditolak server:', endpoint, res.status, body);
    showToast(typeof getApiErrorMsg === 'function' ? getApiErrorMsg(body, errorMsg) : errorMsg, 'error');
    return false;
  }
  if (successMsg) showToast(successMsg, 'success');
  if (typeof opts.onSuccess === 'function') opts.onSuccess();
  return true;
};

/* ─── HELPER FORMAT ─────────────────────────────────────────── */
function bastRupiah(n) {
  if (n === null || n === undefined || n === '') return '-';
  const v = Number(n);
  if (isNaN(v) || v === 0) return '-';
  return 'Rp ' + v.toLocaleString('id-ID');
}

function bastHariTanggal(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return '';
  const h = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const b = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return h[d.getDay()] + ', ' + d.getDate() + ' ' + b[d.getMonth()] + ' ' + d.getFullYear();
}

function bastFindPegawai(nip) {
  return (window._bastData.pegawai || []).find(p => String(p.id) === String(nip)) || null;
}
function bastFindAset(id) {
  return (window._bastData.aset || []).find(a => String(a.id) === String(id)) || null;
}
function bastNamaRuangan(rid) {
  if (!rid) return '';
  const r = (window._bastData.ruangan || []).find(x => String(x.id) === String(rid));
  return r ? r.nama : '';
}
window._bastCacheKey = 'bast_list';

/* ─── INISIALISASI DB (migrasi idempoten via webhook) ────────── */
window.runBastMigration = async function() {
  const resEl = document.getElementById('bastInitResult');
  if (!resEl) return;
  resEl.innerHTML = '<div class="radius-note" style="color:#c9a84c;">⏳ Menjalankan inisialisasi tabel BAST...</div>';
  const ok = await window.bastSubmit(P.simapoBastInit, {}, {
    successMsg: 'Database BAST siap digunakan',
    errorMsg: 'Gagal inisialisasi database BAST'
  });
  if (ok) {
    resEl.innerHTML = '<div class="radius-note" style="color:#22c55e;">✅ Tabel & kolom BAST siap.</div>';
    window.loadAdminBast(true);
  } else {
    resEl.innerHTML = '<div class="radius-note" style="color:var(--danger);">⚠️ Inisialisasi gagal. Periksa log n8n.</div>';
  }
};

/* ─── LOAD DATA UTAMA ───────────────────────────────────────── */
function bastPopulateSelects() {
  const peSel = document.getElementById('bastPegawaiSel');
  const ttdSel = document.getElementById('bastTtdSel');
  if (!peSel || !ttdSel) return;
  const peOpts = (window._bastData.pegawai || []).map(p =>
    '<option value="' + p.id + '" data-nama="' + String(p.nama || '').replace(/"/g, '&quot;') + '" data-jab="' + String(p.jabatan || '').replace(/"/g, '&quot;') + '">' +
    String(p.nama || '') + ' — ' + String(p.nip || '') + '</option>').join('');
  peSel.innerHTML = '<option value="">-- Pilih Pegawai --</option>' + peOpts;
  ttdSel.innerHTML = (window._bastData.penandatangan || []).map(p =>
    '<option value="' + p.id + '" data-jab="' + String(p.jabatan || '').replace(/"/g, '&quot;') + '">' +
    String(p.nama || '') + ' — ' + String(p.jabatan || '') + '</option>').join('');

  if (window._bastSel.pe && bastFindPegawai(window._bastSel.pe)) peSel.value = window._bastSel.pe;
  if (!window._bastSel.ttd && (window._bastData.penandatangan || []).length) {
    window._bastSel.ttd = window._bastData.penandatangan[0].id;
  }
  if (window._bastSel.ttd) ttdSel.value = window._bastSel.ttd;
}

window.bastPegawaiChange = function() {
  const pe = document.getElementById('bastPegawaiSel').value;
  const prev = window._bastSel.pe;
  window._bastSel.pe = pe;
  if (pe && pe !== prev) {
    const owned = (window._bastData.aset || []).filter(a => String(a.pegawai_id || '') === String(pe));
    window._bastSel.incl = {};
    owned.forEach(a => { window._bastSel.incl[a.id] = true; });
  } else if (!pe) {
    window._bastSel.incl = {};
  }
  window.renderBastAsetList();
};

window.bastToggleAset = function(id, checked) {
  if (checked) window._bastSel.incl[id] = true;
  else delete window._bastSel.incl[id];
  window.renderBastAsetTotal();
};

window.renderBastAsetTotal = function() {
  const el = document.getElementById('bastAsetTotal');
  if (!el) return;
  const ids = Object.keys(window._bastSel.incl);
  const items = (window._bastData.aset || []).filter(a => ids.includes(String(a.id)));
  const total = items.reduce((s, a) => s + (Number(a.harga) || 0), 0);
  el.innerHTML = '<div class="radius-note" style="color:#22c55e;">✔️ <b>' + items.length + '</b> aset dipilih · Total nilai <b>' + bastRupiah(total) + '</b></div>';
};

window.renderBastAsetList = function() {
  const el = document.getElementById('bastAsetList');
  if (!el) return;
  const pe = window._bastSel.pe;
  if (!pe) {
    el.innerHTML = '<div class="radius-note">Pilih pegawai untuk memuat daftar aset yang dipegangnya (default: semua aset milik pegawai tersebut).</div>';
    return;
  }
  const all = window._bastData.aset || [];
  if (all.length === 0) {
    el.innerHTML = '<div class="radius-note">Belum ada aset terdaftar. Jalankan impor data aset atau cek inisialisasi DB.</div>';
    return;
  }
  const rows = all.map(a => {
    const id = a.id;
    const owned = String(a.pegawai_id || '') === String(pe);
    const checked = !!window._bastSel.incl[id];
    const pemegangName = owned ? ('✔️ ' + (bastFindPegawai(a.pegawai_id)?.nama || '')) : (a.pegawai_id ? (bastFindPegawai(a.pegawai_id)?.nama || ' (pemegang lain)') : '— belum ada');
    const ruang = a.ruangan_id ? (bastNamaRuangan(a.ruangan_id) || '—') : '—';
    const isKend = /kendaraan/i.test(a.kategori_nama || '') || !!a.no_polisi;
    return `
    <div style="display:flex;align-items:center;gap:10px;padding:10px;margin:8px 0;border:1px solid ${owned ? 'rgba(34,197,94,0.35)' : 'rgba(255,255,255,0.08)'};background:${owned ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.02)'};border-radius:12px;">
      <input type="checkbox" data-aset-id="${id}" onchange="bastToggleAset('${id}', this.checked)" ${checked ? 'checked' : ''} style="width:18px;height:18px;flex-shrink:0;">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:800;font-size:13px;color:var(--white);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${a.nama_barang || '-'}</div>
        <div style="font-size:11px;color:var(--muted);display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:2px;">
          <span>📌 ${a.nomorinventaris || '-'}</span>
          ${a.merk_type ? '<span>🏷️ ' + (a.merk_type || '') + '</span>' : ''}
          <span>📅 ${a.tahun_pembuatan || '-'}</span>
          ${isKend ? '<span>🚗 ' + (a.no_polisi || '-') + '</span>' : ''}
          <span>💰 ${bastRupiah(a.harga)}</span>
          <span>🧾 ${a.kondisi || '-'}</span>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px;">
          👤 Pemegang: <b style="color:${owned ? '#22c55e' : 'var(--white)'};">${pemegangName}</b> · 🏢 Ruangan: <b>${ruang}</b>
        </div>
      </div>
      <button class="btn-sm-admin" onclick="setBastPemegang('${id}')" style="flex-shrink:0;background:rgba(59,130,246,0.15);">⚙️ Set Pemegang</button>
    </div>`;
  }).join('');
  el.innerHTML = rows + '<div id="bastAsetTotal" style="margin-top:6px;"></div>';
  window.renderBastAsetTotal();
};

/* ─── ATUR PEMEGANG (pegawai & ruangan per aset) ────────────── */
window.setBastPemegang = async function(asetId) {
  const a = bastFindAset(asetId);
  if (!a) return;
  const pegOpts = (window._bastData.pegawai || []).map(p =>
    '<option value="' + p.id + '"' + (String(a.pegawai_id || '') === String(p.id) ? ' selected' : '') + '>' +
    String(p.nama || '') + ' — ' + String(p.nip || '') + '</option>').join('');
  const ruangOpts = '<option value="">— Tanpa Ruangan —</option>' + (window._bastData.ruangan || []).map(r =>
    '<option value="' + r.id + '"' + (a.ruangan_id && String(r.id) === String(a.ruangan_id) ? ' selected' : '') + '>' +
    String(r.nama || '') + '</option>').join('');

  const { value: v } = await Swal.fire({
    title: '⚙️ Atur Pemegang Aset',
    html:
      '<div style="font-size:12px;color:var(--muted);margin-bottom:12px;">' + (a.nama_barang || 'Aset') + '<br><b>' + (a.nomorinventaris || '') + '</b></div>' +
      '<label style="font-size:11px;font-weight:700;display:block;margin:6px 0 4px;text-align:left;">Pemegang (Pegawai)</label>' +
      '<select id="bastPemegangSel" class="form-input" style="width:100%;margin-bottom:8px;">' + pegOpts + '</select>' +
      '<label style="font-size:11px;font-weight:700;display:block;margin:6px 0 4px;text-align:left;">Ruangan</label>' +
      '<select id="bastRuanganSel" class="form-input" style="width:100%;">' + ruangOpts + '</select>',
    showCancelButton: true,
    confirmButtonText: '💾 Simpan',
    cancelButtonText: 'Batal',
    confirmButtonColor: 'var(--primary)',
    focusConfirm: false,
    preConfirm: () => {
      const peg = document.getElementById('bastPemegangSel').value;
      const ruang = document.getElementById('bastRuanganSel').value;
      return { pegawai_id: peg || null, ruangan_id: ruang || null };
    }
  });
  if (!v) return;

  const ok = await window.bastSubmit(P.simapoBastAssign, { aset_id: asetId, ...v }, {
    successMsg: 'Pemegang aset diperbarui',
    errorMsg: 'Gagal memperbarui pemegang aset'
  });
  if (ok) window.loadAdminBast(true);
};

/* ─── RENDER & UNDUH .DOCX ──────────────────────────────────── */
function bastBuildTags() {
  const peId = window._bastSel.pe;
  const ttdId = window._bastSel.ttd || document.getElementById('bastTtdSel')?.value;
  const pe = bastFindPegawai(peId);
  const ttd = bastFindPegawai(ttdId);
  if (!pe) { showToast('Pilih pegawai (Pihak Kedua) terlebih dahulu.', 'error'); return null; }
  if (!ttd) { showToast('Pilih penandatangan (Pihak Pertama).', 'error'); return null; }

  const ids = Object.keys(window._bastSel.incl);
  const items = (window._bastData.aset || []).filter(a => ids.includes(String(a.id)));
  if (items.length === 0) { showToast('Tidak ada aset yang dipilih untuk BAST.', 'error'); return null; }

  const nomor = document.getElementById('bastNomor')?.value.trim() || '';
  if (!nomor) { showToast('Isi nomor dokumen terlebih dahulu.', 'error'); return null; }
  const tgl = document.getElementById('bastTgl')?.value || new Date().toISOString().slice(0, 10);
  const alamat = 'Waikabubak, Kabupaten Sumba Barat';

  const asets = items.map((a, i) => {
    const isKend = /kendaraan/i.test(a.kategori_nama || '') || !!a.no_polisi;
    return {
      No: i + 1,
      NamaBarang: a.nama_barang || '-',
      MerkType: a.merk_type || (isKend ? 'Kendaraan Roda ' + (a.roda || '4') : '-'),
      Model: a.model_jenis || (isKend ? 'Kendaraan' : '-'),
      NomorInventaris: a.nomorinventaris || '-',
      Tahun: a.tahun_pembuatan || '-',
      Harga: bastRupiah(a.harga),
      Kondisi: a.kondisi || '-',
      NoPolisi: a.no_polisi || '-',
      Ruangan: a.ruangan_id ? (bastNamaRuangan(a.ruangan_id) || '-') : '-',
      Keterangan: a.kategori_nama || (a.kodebarang || '')
    };
  });

  return {
    tags: {
      Nomor: nomor,
      HariTanggal: bastHariTanggal(tgl),
      Tempat: document.getElementById('bastTempat')?.value.trim() || 'Waikabubak',
      P1Nama: ttd.nama || '', P1NIP: String(ttd.nip || ''), P1Jabatan: ttd.jabatan || '', P1Alamat: alamat,
      P2Nama: pe.nama || '', P2NIP: String(pe.nip || ''), P2Jabatan: pe.jabatan || '', P2Alamat: alamat,
      asets
    },
    nomor,
    tgl,
    totalAset: asets.length,
    totalNilai: items.reduce((s, a) => s + (Number(a.harga) || 0), 0)
  };
}

window.bastRenderDocx = async function(tags, filename) {
  if (!window.PizZip || !window.docxtemplater) {
    showToast('Library docxtemplater belum dimuat. Muat ulang aplikasi.', 'error');
    return;
  }
  try {
    const tp = await fetch('bast_template.docx');
    if (!tp.ok) throw new Error('template HTTP ' + tp.status);
    const buf = await tp.arrayBuffer();
    const zip = new window.PizZip(buf);
    const Docx = window.docxtemplater.default || window.docxtemplater;
    const doc = new Docx(zip, { delimiters: { start: '{', end: '}' }, paragraphLoop: true, linebreaks: true });
    doc.render(tags);
    const blob = doc.getZip().generate({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      compression: 'DEFLATE'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'BAST.docx';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
    return true;
  } catch (e) {
    console.error('[BAST] Gagal render docx:', e);
    showToast('Gagal membuat dokumen: ' + (e && e.message ? e.message : e), 'error');
    return false;
  }
};

window.bastPreviewDocx = async function() {
  const built = bastBuildTags();
  if (!built) return;
  const fname = 'BAST_' + String(built.nomor).replace(/[^A-Za-z0-9._-]/g, '_') + '.docx';
  await window.bastRenderDocx(built.tags, fname);
};

/* ─── ARSIP BAST ────────────────────────────────────────────── */
async function bastSavePayload(built) {
  const peId = window._bastSel.pe;
  const ttdId = window._bastSel.ttd || document.getElementById('bastTtdSel')?.value;
  const pe = bastFindPegawai(peId);
  const ttd = bastFindPegawai(ttdId);
  const inst = (typeof getScopedInstansiId === 'function' ? getScopedInstansiId() : '') || 'bapperida';
  return {
    id: null,
    nomor: built.nomor,
    instansi_id: inst,
    pegawai_id: pe ? pe.id : null,
    pegawai_nama: pe ? pe.nama : '',
    pegawai_nip: pe ? pe.nip : '',
    pegawai_jabatan: pe ? pe.jabatan : '',
    pegawai_alamat: 'Waikabubak, Kabupaten Sumba Barat',
    penandatangan_id: ttd ? ttd.id : null,
    penandatangan_nama: ttd ? ttd.nama : '',
    penandatangan_nip: ttd ? ttd.nip : '',
    penandatangan_jabatan: ttd ? ttd.jabatan : '',
    penandatangan_alamat: 'Waikabubak, Kabupaten Sumba Barat',
    tanggal: built.tgl ? new Date(built.tgl).toISOString() : new Date().toISOString(),
    hari_tanggal: built.tags.HariTanggal,
    tempat: built.tags.Tempat,
    daftar_aset: built.tags.asets,
    total_aset: built.totalAset,
    total_nilai: built.totalNilai,
    createdby: (window._session && window._session.nip) || localStorage.getItem('MY_NIP') || null
  };
}

window.bastSaveArchive = async function() {
  const built = bastBuildTags();
  if (!built) return;
  const payload = await bastSavePayload(built);
  const ok = await window.bastSubmit(P.simapoBastSave, payload, {
    successMsg: 'BAST diarsipkan',
    errorMsg: 'Gagal menyimpan arsip BAST'
  });
  if (ok) window.loadBastHistory(true);
};

/* ─── RIWAYAT BAST ──────────────────────────────────────────── */
window.loadBastHistory = async function(force = false) {
  const el = document.getElementById('bastHistoryList');
  if (!el) return;
  if (force) window.showAdminSimapoShimmer('bastHistoryList');
  let items = [];
  try {
    const res = await apiFetch(P.simapoBastHistory);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    items = (json && json.data) || [];
  } catch (e) {
    console.warn('[BAST] Riwayat fetch fail:', e);
    window.simapoErrorState('bastHistoryList', 'Gagal memuat riwayat BAST.');
    return;
  }
  window._bastHistory = items;

  if (!document.getElementById('bastNomor').value) {
    const yr = new Date().getFullYear();
    const seq = items.filter(b => String(b.nomor || '').includes(String(yr))).length + 1;
    document.getElementById('bastNomor').value = 'BAST.' + String(seq).padStart(3, '0') + '/' + yr;
  }

  if (!items || items.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:26px;color:var(--muted);font-size:12px;">🗂️ Belum ada berita acara tersimpan.</div>';
    return;
  }
  el.innerHTML = items.map(b => {
    const da = (b.daftar_aset || []);
    return `
    <div style="padding:12px;margin:8px 0;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.02);border-radius:12px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:800;font-size:13px;color:var(--gold);">${b.nomor || '-'}</div>
          <div style="font-size:12px;color:var(--white);margin-top:3px;">👤 ${b.pegawai_nama || '-'}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px;">📅 ${b.hari_tanggal || (b.tanggal ? new Date(b.tanggal).toLocaleDateString('id-ID') : '-')} · 🏢 ${b.tempat || '-'}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px;">${da.length} aset · 💰 ${bastRupiah(b.total_nilai)} · 📝 ${b.penandatangan_nama || '-'}</div>
        </div>
        <button class="btn-sm-admin" onclick="bastReopen('${b.id}')" style="flex-shrink:0;background:rgba(34,197,94,0.15);">📄 Buka</button>
      </div>
    </div>`;
  }).join('');
};
window._simapoRetryMap['bastHistoryList'] = window.loadBastHistory;

window.bastReopen = async function(id) {
  const b = (window._bastHistory || []).find(x => String(x.id) === String(id));
  if (!b) return;
  const rows = (b.daftar_aset || []).map((r, i) => ({
    No: i + 1,
    NamaBarang: r.NamaBarang || '',
    MerkType: r.MerkType || '-',
    Model: r.Model || '-',
    NomorInventaris: r.NomorInventaris || '-',
    Tahun: r.Tahun || '-',
    Harga: r.Harga || '-',
    Kondisi: r.Kondisi || '-',
    NoPolisi: r.NoPolisi || '-',
    Ruangan: r.Ruangan || '-',
    Keterangan: r.Keterangan || ''
  }));
  const tags = {
    Nomor: b.nomor || '',
    HariTanggal: b.hari_tanggal || '',
    Tempat: b.tempat || '',
    P1Nama: b.penandatangan_nama || '', P1NIP: b.penandatangan_nip || '',
    P1Jabatan: b.penandatangan_jabatan || '', P1Alamat: b.penandatangan_alamat || '',
    P2Nama: b.pegawai_nama || '', P2NIP: b.pegawai_nip || '',
    P2Jabatan: b.pegawai_jabatan || '', P2Alamat: b.pegawai_alamat || '',
    asets: rows
  };
  const fname = 'BAST_' + String(b.nomor || id).replace(/[^A-Za-z0-9._-]/g, '_') + '.docx';
  await window.bastRenderDocx(tags, fname);
};

/* ─── LOAD SEMUA ────────────────────────────────────────────── */
window.loadAdminBast = async function(force = false) {
  const el = document.getElementById('bastAsetList');
  if (!el) return;
  if (force) window.showAdminSimapoShimmer('bastAsetList');

  let json;
  try {
    const res = await apiFetch(P.simapoBastList);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    json = await res.json();
  } catch (e) {
    console.warn('[BAST] List fetch fail:', e);
    window.simapoErrorState('bastAsetList', 'Gagal memuat data aset & pegawai.');
    return;
  }

  const data = (json && json.data) || {};
  window._bastData = {
    pegawai: data.pegawai || [],
    aset: data.aset || [],
    ruangan: data.ruangan || [],
    penandatangan: data.penandatangan || []
  };
  const ownedIds = {};
  window._bastData.aset.forEach(a => { ownedIds[a.id] = true; });
  const prevIds = Object.keys(window._bastSel.incl).filter(id => ownedIds[id]);
  if (prevIds.length) window._bastSel.incl = Object.fromEntries(prevIds.map(id => [id, true]));

  bastPopulateSelects();
  window.renderBastAsetList();
  window.loadBastHistory(force);
};