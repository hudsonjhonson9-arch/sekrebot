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
  // ponytail: gate/guard instance balas 200 + body kosong; apiFetch membungkusnya jadi sentinel EMPTY_N8N_RESPONSE (bukan null) → wajib gagal
  const empty = !!(body && body.message === EMPTY_N8N_RESPONSE);
  if (empty) body.message = 'Respons kosong dari server — permintaan gagal atau ditolak';
  // ponytail: `body !== null` menangkap res.json() yang throw (body stream putus) pada respons 200 — tanpa itu isApiSuccess(null) = true → false success. Bukan kondisi mati.
  const ok = res.ok && body !== null && !empty && (typeof isApiSuccess === 'function' ? isApiSuccess(body, true) : true);
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
  const hari = h[d.getDay()] + '  Tanggal ' + bastTerbilang(d.getDate());
  const tahun = bastTerbilang(d.getFullYear());
  return 'Pada hari ini ' + hari + ' Bulan ' + b[d.getMonth()] + ' Tahun ' + tahun + ', kami yang bertanda tangan dibawah ini :';
}

const _BAST_SATUAN = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan'];
const _BAST_BELAS = ['sepuluh', 'sebelas', 'dua belas', 'tiga belas', 'empat belas', 'lima belas', 'enam belas', 'tujuh belas', 'delapan belas', 'sembilan belas'];

function bastTerbilang(n) {
  n = Number(n) || 0;
  const s = _BAST_SATUAN;
  if (n < 10) return s[n];
  if (n < 20) return _BAST_BELAS[n - 10];
  if (n < 100) {
    const pul = Math.floor(n / 10);
    return (pul === 1 ? 'sepuluh' : s[pul] + ' puluh') + (n % 10 ? ' ' + s[n % 10] : '');
  }
  if (n < 1000) {
    const rat = Math.floor(n / 100);
    const rem = n % 100;
    return (rat === 1 ? 'seratus' : s[rat] + ' ratus') + (rem ? ' ' + bastTerbilang(rem) : '');
  }
  if (n < 10000) {
    const rib = Math.floor(n / 1000);
    const rem = n % 1000;
    return (rib === 1 ? 'seribu' : bastTerbilang(rib) + ' ribu') + (rem ? ' ' + bastTerbilang(rem) : '');
  }
  const pul = Math.floor(n / 1000);
  return bastTerbilang(pul) + ' ribu' + (n % 1000 ? ' ' + bastTerbilang(n % 1000) : '');
}

function bastJumlahUnit(n) {
  const s = _BAST_SATUAN;
  return (n <= 9 && s[n]) ? s[n] : String(n);
}

function bastRodaText(roda) {
  return Number(roda) > 2 ? 'empat' : 'dua';
}

function bastFindPegawai(nip) {
  return (window._bastData.pegawai || []).find(p => String(p.id) === String(nip)) || null;
}
function bastFindPenandatangan(nip) {
  return (window._bastData.penandatangan || []).find(p => String(p.id) === String(nip)) || null;
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
  resEl.innerHTML = '<div class="radius-note" style="color:#c9a84c;"><i class="fas fa-hourglass-half" aria-hidden="true"></i> Menjalankan inisialisasi tabel BAST...</div>';
  const ok = await window.bastSubmit(P.simapoBastInit, {}, {
    successMsg: 'Database BAST siap digunakan',
    errorMsg: 'Gagal inisialisasi database BAST'
  });
  if (ok) {
    resEl.innerHTML = '<div class="radius-note" style="color:#22c55e;"><i class="fas fa-check" aria-hidden="true"></i> Tabel & kolom BAST siap.</div>';
    window.loadAdminBast(true);
  } else {
    resEl.innerHTML = '<div class="radius-note" style="color:var(--danger);"><i class="fas fa-exclamation-triangle" aria-hidden="true"></i> Inisialisasi gagal. Periksa log n8n.</div>';
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
  const total = items.reduce((s, a) => s + (Number(a.nilaiperolehan) || 0), 0);
  el.innerHTML = '<div class="radius-note" style="color:#22c55e;"><i class="fas fa-check" aria-hidden="true"></i> <b>' + items.length + '</b> aset dipilih · Total nilai <b>' + bastRupiah(total) + '</b></div>';
};

window.renderBastAsetList = function() {
  const el = document.getElementById('bastAsetList');
  if (!el) return;
  const pe = window._bastSel.pe;
  if (!pe) {
    el.innerHTML = '<div class="radius-note">Pilih pegawai untuk memuat daftar aset yang dipegangnya.</div>';
    return;
  }
  const all = (window._bastData.aset || []).filter(a => String(a.pegawai_id || '') === String(pe));
  if (all.length === 0) {
    el.innerHTML = '<div class="radius-note">Pegawai ini belum memiliki aset. Tambah lewat tab "Aset Pegawai" atau Set Pemegang.</div>';
    return;
  }
  const rows = all.map(a => {
    const id = a.id;
    const checked = !!window._bastSel.incl[id];
    const ruang = a.ruangan_id ? (bastNamaRuangan(a.ruangan_id) || '—') : '—';
    const isKend = /kendaraan/i.test(a.kategori_nama || '') || !!a.no_polisi;
    return `
    <div style="display:flex;align-items:center;gap:10px;padding:10px;margin:8px 0;border:1px solid rgba(34,197,94,0.35);background:rgba(34,197,94,0.06);border-radius:12px;">
      <input type="checkbox" data-aset-id="${id}" onchange="bastToggleAset('${id}', this.checked)" ${checked ? 'checked' : ''} style="width:18px;height:18px;flex-shrink:0;">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:800;font-size:13px;color:var(--white);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${a.nama_barang || '-'}</div>
        <div style="font-size:11px;color:var(--muted);display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:2px;">
          <span><i class="fas fa-thumbtack" aria-hidden="true"></i> ${a.nomorinventaris || '-'}</span>
          ${a.merk_type ? '<span><i class="fas fa-tags" aria-hidden="true"></i> ' + (a.merk_type || '') + '</span>' : ''}
          <span><i class="fas fa-calendar-alt" aria-hidden="true"></i> ${a.tahun_pembuatan || '-'}</span>
          ${isKend ? '<span><i class="fas fa-car" aria-hidden="true"></i> ' + (a.no_polisi || '-') + '</span>' : ''}
          <span><i class="fas fa-money-bill" aria-hidden="true"></i> ${bastRupiah(a.nilaiperolehan)}</span>
          <span><i class="fas fa-receipt" aria-hidden="true"></i> ${a.kondisi || '-'}</span>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px;">
          <i class="fas fa-building" aria-hidden="true"></i> Ruangan: <b>${ruang}</b>
        </div>
      </div>
      <button class="btn-sm-admin" onclick="setBastPemegang('${id}')" style="flex-shrink:0;background:rgba(59,130,246,0.15);"><i class="fas fa-cog" aria-hidden="true"></i> Set Pemegang</button>
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
    title: 'Atur Pemegang Aset',
    html:
      '<div style="font-size:12px;color:var(--muted);margin-bottom:12px;">' + (a.nama_barang || 'Aset') + '<br><b>' + (a.nomorinventaris || '') + '</b></div>' +
      '<label style="font-size:11px;font-weight:700;display:block;margin:6px 0 4px;text-align:left;">Pemegang (Pegawai)</label>' +
      '<select id="bastPemegangSel" class="form-input" style="width:100%;margin-bottom:8px;">' + pegOpts + '</select>' +
      '<label style="font-size:11px;font-weight:700;display:block;margin:6px 0 4px;text-align:left;">Ruangan</label>' +
      '<select id="bastRuanganSel" class="form-input" style="width:100%;">' + ruangOpts + '</select>',
    showCancelButton: true,
    confirmButtonText: 'Simpan',
    cancelButtonText: 'Batal',
    confirmButtonColor: 'var(--primary)',
    focusConfirm: false,
    didOpen: () => {
      makeSearchDd('bastPemegangSel', { ph: 'Ketik nama/NIP...', static: true });
      makeSearchDd('bastRuanganSel', { ph: 'Pilih ruangan...', static: true });
    },
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
  const ttd = bastFindPenandatangan(ttdId) || bastFindPegawai(ttdId);
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
      ModelJenis: a.model_jenis || a.nama_barang || '-',
      MerkType: a.merk_type || (isKend ? 'Kendaraan Roda ' + (a.roda || '4') : '-'),
      Warna: a.warna || '-',
      Tahun: a.tahun_pembuatan || '-',
      NoRangka: a.no_rangka || '-',
      NoMesin: a.no_mesin || '-',
      KodeBarang: a.kodebarang || '-',
      NoPolisi: a.no_polisi || '-',
      Roda: Number(a.roda) > 2 ? 4 : 2
    };
  });
  const firstRoda = Number((items[0] && items[0].roda) || 4);

  return {
    tags: {
      Nomor: nomor,
      HariTanggal: bastHariTanggal(tgl),
      Tempat: document.getElementById('bastTempat')?.value.trim() || 'Waikabubak',
      P1Nama: ttd.nama || '', P1NIP: String(ttd.nip || ''), P1Jabatan: ttd.jabatan || '', P1Alamat: alamat,
      P2Nama: pe.nama || '', P2NIP: String(pe.nip || ''), P2Jabatan: pe.jabatan || '', P2Alamat: alamat,
      JumlahUnit: bastJumlahUnit(asets.length),
      RodaText: bastRodaText(firstRoda),
      asets
    },
    nomor,
    tgl,
    totalAset: asets.length,
    totalNilai: items.reduce((s, a) => s + (Number(a.nilaiperolehan) || 0), 0)
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

/* ─── KIR — KARTU INVENTARIS RUANGAN (cetak dari layar Ruangan) ─── */
window._kirData = { ruangan: [], aset: [] };

window.loadAsetRuangan = async function(force = false) {
  const el = document.getElementById('ruanganList');
  if (!el) return;
  if (force) window.showAdminSimapoShimmer('ruanganList');
  try {
    const res = await apiFetch(P.simapoBastList);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    const data = (json && json.data) || {};
    window._kirData = { ruangan: data.ruangan || [], aset: data.aset || [], pegawai: data.pegawai || [] };
  } catch (e) {
    console.warn('[Ruangan] fetch fail:', e);
    window.simapoErrorState('ruanganList', 'Gagal memuat data ruangan.');
    return;
  }
  window.renderAsetRuangan();
};

window.renderAsetRuangan = function() {
  const el = document.getElementById('ruanganList');
  if (!el) return;
  const { ruangan, aset } = window._kirData;
  if (!ruangan.length) {
    el.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:12px;padding:20px;">Belum ada ruangan. Tambah lewat "Set Pemegang" pada layar BAST.</div>';
    return;
  }
  el.innerHTML = ruangan.map(function(r) {
    const n = aset.filter(function(a) { return String(a.ruangan_id || '') === String(r.id); }).length;
    const pj = r.penanggung_nama
      ? '<div style="font-size:11px;color:var(--gold);margin-top:2px;"><i class="fas fa-user-tie" aria-hidden="true"></i> PJ: ' + String(r.penanggung_nama).replace(/</g, '&lt;') + (r.penanggung_nip ? ' · NIP. ' + String(r.penanggung_nip).replace(/</g, '&lt;') : '') + '</div>'
      : '<div style="font-size:11px;color:var(--muted);margin-top:2px;"><i class="fas fa-user-tie" aria-hidden="true"></i> Penanggung jawab belum ditentukan</div>';
    return '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;margin-bottom:8px;">' +
      '<i class="fas fa-building" aria-hidden="true" style="color:var(--muted);"></i>' +
      '<div style="flex:1;min-width:0;">' +
      '<div style="font-size:13px;font-weight:600;color:var(--white);">' + String(r.nama || '').replace(/</g, '&lt;') + '</div>' +
      '<div style="font-size:11px;color:var(--muted);">' + n + ' aset' + (r.kode ? ' · ' + String(r.kode).replace(/</g, '&lt;') : '') + '</div>' +
      pj +
      '</div>' +
      '<button class="btn-sm-admin" onclick="aturPenanggungJawab(\'' + String(r.id).replace(/'/g, '') + '\')" title="Atur penanggung jawab ruangan (tampil di KIR)" style="background:rgba(201,168,76,0.15);white-space:nowrap;"><i class="fas fa-user-tie" aria-hidden="true"></i> PJ</button>' +
      '<button class="btn-sm-admin" onclick="cetakKIR(\'' + String(r.id).replace(/'/g, '') + '\')" style="background:rgba(59,130,246,0.2);white-space:nowrap;"><i class="fas fa-print" aria-hidden="true"></i> Cetak KIR</button>' +
      '</div>';
  }).join('');
};

/* Atur Penanggung Jawab ruangan — nama & NIP tampil di blok tanda tangan bawah KIR. */
window.aturPenanggungJawab = async function(rid) {
  const r = (window._kirData.ruangan || []).find(x => String(x.id) === String(rid));
  if (!r) return;
  const peg = window._kirData.pegawai || [];
  if (!peg.length) { showToast('Daftar pegawai belum termuat. Muat ulang layar Ruangan.', 'error'); return; }
  const opts = '<option value="">— Belum ditentukan —</option>' + peg.map(p =>
    '<option value="' + apEsc(p.id) + '"' + (String(r.penanggung_id || '') === String(p.id) ? ' selected' : '') + '>' +
    apEsc(p.nama) + (p.nip ? ' — ' + apEsc(p.nip) : '') + '</option>').join('');
  const { value: v } = await Swal.fire({
    title: 'Penanggung Jawab Ruangan',
    html: '<div style="font-size:12px;color:var(--muted);margin-bottom:10px;text-align:left;">' +
      '<b>' + apEsc(r.nama) + '</b>' + (r.kode ? ' (' + apEsc(r.kode) + ')' : '') +
      '<br>Nama terpilih menjadi penandatangan bawah pada KIR (sebelah Kepala Badan).</div>' +
      '<select id="apPjSel" class="form-input" style="width:100%;">' + opts + '</select>',
    showCancelButton: true,
    confirmButtonText: 'Simpan',
    cancelButtonText: 'Batal',
    preConfirm: () => document.getElementById('apPjSel').value,
  });
  if (typeof v !== 'string') return;
  const p = peg.find(x => String(x.id) === String(v)) || null;
  try {
    const res = await apiPost(P.simapoBastRuangan, {
      id: rid,
      penanggung_id: p ? p.id : '',
      penanggung_nama: p ? p.nama : '',
      penanggung_nip: p ? (p.nip || '') : '',
    });
    if (!res.ok) throw new Error(res.message || 'Gagal menyimpan');
    showToast(p ? 'Penanggung jawab ruangan: ' + p.nama : 'Penanggung jawab dikosongkan.', 'success');
    window.loadAsetRuangan(true);
  } catch (e) { showToast(e.message || 'Gagal menyimpan penanggung jawab', 'error'); }
};

window.cetakKIR = function(rid) {
  if (!rid) return;
  const ruang = (window._kirData.ruangan || []).find(x => String(x.id) === String(rid));
  const asets = (window._kirData.aset || []).filter(a => String(a.ruangan_id || '') === String(rid));
  if (!asets.length) { showToast('Tidak ada aset di ruangan ini.', 'error'); return; }

  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const KOP = {
    provinsi: 'Nusa Tenggara Timur',
    kabupaten: 'Sumba Barat',
    kota: 'Waikabubak',
    opd: 'Badan Perencanaan Pembangunan, Riset dan Inovasi Daerah (BAPPERIDA)',
  };
  // Kepala Badan: pegawai dengan jabatan berawalan "Kepala Badan"
  const peg = window._kirData.pegawai || [];
  const kepala = peg.find(p => /^Kepala Badan/i.test(String(p.jabatan || '').trim())) || null;
  const pj = (ruang && ruang.penanggung_nama)
    ? { nama: ruang.penanggung_nama, nip: ruang.penanggung_nip || '' }
    : { nama: '', nip: '' };
  const tgl = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

  let nBaik = 0, nKb = 0, nRb = 0, total = 0;
  const rows = asets.map((a, i) => {
    const kd = /kurang baik/i.test(a.kondisi || '') ? 'Kurang Baik'
      : /rusak/i.test(a.kondisi || '') ? 'Rusak Berat' : 'Baik';
    if (kd === 'Kurang Baik') nKb++; else if (kd === 'Rusak Berat') nRb++; else nBaik++;
    const nilai = Number(a.nilaiperolehan) || 0;
    total += nilai;
    return '<tr><td style="text-align:center;">' + (i + 1) + '</td>' +
      '<td>' + esc(a.nama_barang || '-') + '</td>' +
      '<td>' + esc(a.merk_type || a.model_jenis || '') + '</td>' +
      '<td>' + esc(a.ukuran || a.no_polisi || '') + '</td>' +
      '<td>' + esc(a.bahan || '') + '</td>' +
      '<td style="text-align:center;">' + esc(a.tahunperolehan || a.tahun_pembuatan || '') + '</td>' +
      '<td style="text-align:center;">' + esc(a.kodebarang || '') + '</td>' +
      '<td style="text-align:center;">' + esc(a.no_register || '') + '</td>' +
      '<td style="text-align:center;">1</td>' +
      '<td style="text-align:right;">' + bastRupiah(nilai) + '</td>' +
      '<td style="text-align:center;">' + (kd === 'Baik' ? '1' : '') + '</td>' +
      '<td style="text-align:center;">' + (kd === 'Kurang Baik' ? '1' : '') + '</td>' +
      '<td style="text-align:center;">' + (kd === 'Rusak Berat' ? '1' : '') + '</td>' +
      '<td>' + esc(a.keterangan || '') + '</td></tr>';
  }).join('');

  const ttdKiri = 'Mengetahui,<br>' + esc(kepala ? (kepala.jabatan || 'Kepala Badan') : 'Kepala Badan') +
    '<div style="height:48px"></div><b><u>' + esc(kepala ? kepala.nama : '...............................') + '</u></b>' +
    (kepala && kepala.nip ? '<br>NIP. ' + esc(kepala.nip) : '');
  const ttdKanan = esc(KOP.kota) + ', ' + tgl + '<br>Penanggung Jawab Ruangan' +
    '<div style="height:48px"></div><b><u>' + esc(pj.nama || '...............................') + '</u></b>' +
    (pj.nip ? '<br>NIP. ' + esc(pj.nip) : '');

  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>KIR - ' + esc(ruang && ruang.nama) + '</title>' +
    '<style>@page{size:A4 landscape;margin:10mm;}' +
    'body{font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#000;margin:0;}' +
    '.kop{text-align:center;margin-bottom:8px;}.kop div{font-size:11px;font-weight:bold;}' +
    '.kop h1{font-size:13px;margin:2px 0 0;text-transform:uppercase;}' +
    '.info{margin:0 0 6px;font-size:10px;}.info b{display:inline-block;min-width:120px;}' +
    'table{width:100%;border-collapse:collapse;font-size:9px;}' +
    'th,td{border:1px solid #000;padding:2px 3px;}' +
    'th{background:#f0f0f0;font-size:8px;}' +
    '.ttd{margin-top:40px;display:flex;justify-content:space-between;font-size:10px;}' +
    '.ttd>div{width:46%;text-align:center;}' +
    '</style></head><body>' +
    '<div class="kop"><div>PEMERINTAH KABUPATEN ' + esc(KOP.kabupaten.toUpperCase()) + '</div>' +
    '<div>' + esc(KOP.opd.toUpperCase()) + '</div>' +
    '<h1>KARTU INVENTARIS RUANGAN (KIR)</h1></div>' +
    '<div class="info">' +
    '<div><b>Provinsi</b> : ' + esc(KOP.provinsi) + '</div>' +
    '<div><b>Kabupaten / Kota</b> : ' + esc(KOP.kabupaten) + '</div>' +
    '<div><b>OPD / Unit</b> : ' + esc(KOP.opd) + '</div>' +
    '<div><b>Ruangan</b> : <b>' + esc(ruang && ruang.nama) + '</b>' + (ruang && ruang.kode ? ' (kode ' + esc(ruang.kode) + ')' : '') + '</div>' +
    '</div>' +
    '<table><thead><tr>' +
    '<th rowspan="2">No</th><th rowspan="2">Nama Barang</th><th rowspan="2">Merk / Model</th>' +
    '<th rowspan="2">No. Seri / Ukuran</th><th rowspan="2">Bahan</th><th rowspan="2">Tahun</th>' +
    '<th rowspan="2">Kode Barang</th><th rowspan="2">No. Register</th><th rowspan="2">Jumlah</th>' +
    '<th rowspan="2">Harga Perolehan (Rp)</th>' +
    '<th colspan="3" style="text-align:center;">Keadaan Barang</th><th rowspan="2">Keterangan</th></tr>' +
    '<tr><th>Baik</th><th>Kurang Baik</th><th>Rusak Berat</th></tr></thead>' +
    '<tbody>' + rows + '</tbody>' +
    '<tfoot><tr><th colspan="8" style="text-align:right;">JUMLAH</th>' +
    '<th style="text-align:center;">' + asets.length + '</th>' +
    '<th style="text-align:right;">' + bastRupiah(total) + '</th>' +
    '<th style="text-align:center;">' + nBaik + '</th><th style="text-align:center;">' + nKb + '</th>' +
    '<th style="text-align:center;">' + nRb + '</th><th></th></tr></tfoot></table>' +
    '<div class="ttd"><div>' + ttdKiri + '</div><div>' + ttdKanan + '</div></div>' +
    '<script>window.onload=function(){setTimeout(function(){window.print();},250);};<\/script>' +
    '</body></html>';

  const w = window.open('', '_blank');
  if (!w) { showToast('Popup diblokir. Izinkan popup untuk mencetak KIR.', 'error'); return; }
  w.document.write(html);
  w.document.close();
};

/* ─── ARSIP BAST ────────────────────────────────────────────── */
async function bastSavePayload(built) {
  const peId = window._bastSel.pe;
  const ttdId = window._bastSel.ttd || document.getElementById('bastTtdSel')?.value;
  const pe = bastFindPegawai(peId);
  const ttd = bastFindPenandatangan(ttdId) || bastFindPegawai(ttdId);
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
    el.innerHTML = '<div style="text-align:center;padding:26px;color:var(--muted);font-size:12px;"><i class="fas fa-folder-open" aria-hidden="true"></i> Belum ada berita acara tersimpan.</div>';
    return;
  }
  el.innerHTML = items.map(b => {
    const da = (b.daftar_aset || []);
    return `
    <div style="padding:12px;margin:8px 0;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.02);border-radius:12px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:800;font-size:13px;color:var(--gold);">${b.nomor || '-'}</div>
          <div style="font-size:12px;color:var(--white);margin-top:3px;"><i class="fas fa-user" aria-hidden="true"></i> ${b.pegawai_nama || '-'}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px;"><i class="fas fa-calendar-alt" aria-hidden="true"></i> ${b.hari_tanggal || (b.tanggal ? new Date(b.tanggal).toLocaleDateString('id-ID') : '-')} · <i class="fas fa-building" aria-hidden="true"></i> ${b.tempat || '-'}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px;">${da.length} aset · <i class="fas fa-money-bill" aria-hidden="true"></i> ${bastRupiah(b.total_nilai)} · <i class="fas fa-file-alt" aria-hidden="true"></i> ${b.penandatangan_nama || '-'}</div>
        </div>
        <button class="btn-sm-admin" onclick="bastReopen('${b.id}')" style="flex-shrink:0;background:rgba(34,197,94,0.15);"><i class="fas fa-file-alt" aria-hidden="true"></i> Buka</button>
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
    ModelJenis: r.ModelJenis || r.Model || r.NamaBarang || '-',
    MerkType: r.MerkType || '-',
    Warna: r.Warna || '-',
    Tahun: r.Tahun || '-',
    NoRangka: r.NoRangka || '-',
    NoMesin: r.NoMesin || '-',
    KodeBarang: r.KodeBarang || r.NomorInventaris || '-',
    NoPolisi: r.NoPolisi || '-',
    Roda: Number(r.Roda) > 2 ? 4 : 2
  }));
  const firstRoda = Number((rows[0] && rows[0].Roda) || 2);
  const tags = {
    Nomor: b.nomor || '',
    HariTanggal: b.hari_tanggal || bastHariTanggal(b.tanggal),
    Tempat: b.tempat || '',
    JumlahUnit: bastJumlahUnit(rows.length),
    RodaText: bastRodaText(firstRoda),
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
  // Re-select owned assets after reload; if a pegawai is selected, restrict incl to their assets
  const ownedIds = {};
  window._bastData.aset.forEach(a => { ownedIds[a.id] = true; });
  const prevIds = Object.keys(window._bastSel.incl).filter(id => ownedIds[id]);
  window._bastSel.incl = Object.fromEntries(prevIds.map(id => [id, true]));

  bastPopulateSelects();
  makeSearchDd('bastPegawaiSel', { ph: 'Ketik nama/NIP pegawai...' });
  makeSearchDd('bastTtdSel', { ph: 'Pilih penandatangan...' });
  syncSearchDdLabel('bastPegawaiSel');
  syncSearchDdLabel('bastTtdSel');
  window.renderBastAsetList();
  window.loadBastHistory(force);
};

/* ─── ASET PEGAWAI: CRUD unit per pegawai ───────────────────── */
window._asetPegSel = { pegawai: '', aset: null };

function apEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

window.loadAsetPegawai = async function(force = false) {
  const listEl = document.getElementById('asetPegList');
  const selEl = document.getElementById('asetPegSel');
  if (!listEl || !selEl) return;
  if (force) window.showAdminSimapoShimmer('asetPegList');
  // Reuse bast-list data source (same auth header, same shape)
  try {
    const res = await apiFetch(P.simapoBastList);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    const data = (json && json.data) || {};
    window._bastData = {
      pegawai: data.pegawai || [],
      aset: data.aset || [],
      ruangan: data.ruangan || [],
      penandatangan: data.penandatangan || []
    };
  } catch (e) {
    console.warn('[AsetPegawai] fetch fail:', e);
    window.simapoErrorState('asetPegList', 'Gagal memuat data aset pegawai.');
    return;
  }
  const pegOpts = (window._bastData.pegawai || []).map(p =>
    '<option value="' + apEsc(p.id) + '">' + apEsc(p.nama) + ' — ' + apEsc(p.nip) + '</option>').join('');
  selEl.innerHTML = '<option value="">-- Pilih Pegawai --</option>' + pegOpts;
  if (window._asetPegSel.pegawai && (window._bastData.pegawai || []).some(p => String(p.id) === String(window._asetPegSel.pegawai))) {
    selEl.value = window._asetPegSel.pegawai;
  }
  makeSearchDd('asetPegSel', { ph: 'Ketik nama/NIP pegawai...' });
  syncSearchDdLabel('asetPegSel');
  window.renderAsetPegList();
};

window.asetPegChange = function() {
  window._asetPegSel.pegawai = document.getElementById('asetPegSel').value;
  window.renderAsetPegList();
};

window.renderAsetPegList = function() {
  const el = document.getElementById('asetPegList');
  if (!el) return;
  const pe = window._asetPegSel.pegawai;
  const aset = window._bastData.aset || [];
  const pegawai = window._bastData.pegawai || [];

  function card(a) {
    const isKend = /kendaraan/i.test(a.kategori_nama || '') || !!a.no_polisi;
    const ruang = a.ruangan_id ? (bastNamaRuangan(a.ruangan_id) || '—') : '—';
    return `
    <div style="display:flex;align-items:center;gap:10px;padding:10px;margin:8px 0;border:1px solid rgba(34,197,94,0.35);background:rgba(34,197,94,0.06);border-radius:12px;">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:800;font-size:13px;color:var(--white);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${apEsc(a.nama_barang) || '-'}</div>
        <div style="font-size:11px;color:var(--muted);display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:2px;">
          <span><i class="fas fa-thumbtack" aria-hidden="true"></i> ${apEsc(a.nomorinventaris) || '-'}</span>
          ${a.tahunperolehan ? '<span><i class="fas fa-calendar" aria-hidden="true"></i> ' + apEsc(a.tahunperolehan) + '</span>' : ''}
          ${a.merk_type ? '<span><i class="fas fa-tags" aria-hidden="true"></i> ' + apEsc(a.merk_type) + '</span>' : ''}
          ${isKend ? '<span><i class="fas fa-car" aria-hidden="true"></i> ' + (apEsc(a.no_polisi) || '-') + '</span>' : ''}
          <span><i class="fas fa-money-bill" aria-hidden="true"></i> ${bastRupiah(a.nilaiperolehan)}</span>
          <span><i class="fas fa-receipt" aria-hidden="true"></i> ${apEsc(a.kondisi) || '-'}</span>
          <span><i class="fas fa-building" aria-hidden="true"></i> ${apEsc(ruang)}</span>
        </div>
      </div>
      <button class="btn-sm-admin" onclick="asetPegEdit('${a.id}')" style="flex-shrink:0;background:rgba(59,130,246,0.15);"><i class="fas fa-edit" aria-hidden="true"></i></button>
      <button class="btn-sm-admin" onclick="asetPegPindah('${a.id}')" style="flex-shrink:0;background:rgba(245,158,11,0.15);"><i class="fas fa-exchange-alt" aria-hidden="true"></i></button>
      <button class="btn-sm-admin" onclick="asetPegHapus('${a.id}')" style="flex-shrink:0;background:rgba(239,68,68,0.15);"><i class="fas fa-trash" aria-hidden="true"></i></button>
    </div>`;
  }

  if (pe) {
    const owned = aset.filter(a => String(a.pegawai_id || '') === String(pe));
    const peg = bastFindPegawai(pe);
    const head = '<div class="radius-note" style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">' +
      '<span><i class="fas fa-user" aria-hidden="true"></i> <b>' + apEsc(peg ? peg.nama : pe) + '</b> · ' + owned.length + ' unit</span>' +
      (owned.length ? '<button class="btn-sm-admin" onclick="asetPegExportExcel().catch(e=>showToast(e.message||\'Export gagal\',\'error\'))" style="background:rgba(34,197,94,0.15);"><i class="fas fa-file-excel" aria-hidden="true"></i> Export Excel</button>' : '') +
      '</div>';
    if (!owned.length) {
      el.innerHTML = head + '<div class="radius-note">Belum ada aset. Klik "Tambah Unit" untuk menambah.</div>';
      return;
    }
    el.innerHTML = head + owned.map(card).join('');
    return;
  }

  // ── Tanpa pilihan pegawai: overview semua pemegang aset, langsung tampil ──
  const groups = pegawai
    .map(p => ({
      id: String(p.id),
      nama: p.nama || p.nip || '—',
      list: aset.filter(a => String(a.pegawai_id || '') === String(p.id)),
    }))
    .filter(g => g.list.length)
    .sort((a, b) => b.list.length - a.list.length || String(a.nama).localeCompare(String(b.nama)));
  const known = new Set(groups.map(g => g.id));
  const orphan = aset.filter(a => a.pegawai_id && !known.has(String(a.pegawai_id)));
  if (orphan.length) groups.push({ id: '', nama: 'Pegawai tidak terdaftar', list: orphan });
  if (!groups.length) {
    el.innerHTML = '<div class="radius-note"><i class="fas fa-inbox" aria-hidden="true"></i> Belum ada aset yang dipegang pegawai. Pilih pegawai di atas lalu klik "Tambah Unit".</div>';
    return;
  }
  const totalUnit = groups.reduce((n, g) => n + g.list.length, 0);
  const summary = '<div class="radius-note" style="margin-bottom:8px;"><i class="fas fa-users" aria-hidden="true"></i> <b>' + groups.length + ' pemegang</b> · <b>' + totalUnit + ' unit</b> — klik nama untuk melipat/membuka</div>';
  el.innerHTML = summary + groups.map(g => {
    const nilai = g.list.reduce((n, a) => n + (Number(a.nilaiperolehan) || 0), 0);
    return `
    <details open style="margin-bottom:8px;border:1px solid var(--border);border-radius:10px;background:var(--card-bg);overflow:hidden;">
      <summary style="cursor:pointer;list-style:none;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <span style="font-weight:800;font-size:12px;color:var(--white);"><i class="fas fa-user" aria-hidden="true"></i> ${apEsc(g.nama)} <span style="color:var(--muted);font-weight:600;">· ${g.list.length} unit</span></span>
        <span style="font-size:11px;font-weight:700;color:var(--gold);white-space:nowrap;">${bastRupiah(nilai)}</span>
      </summary>
      <div style="padding:0 6px 6px;">${g.list.map(card).join('')}</div>
    </details>`;
  }).join('');
};

window.asetPegEdit = async function(asetId) {
  const a = bastFindAset(asetId);
  if (!a) return;
  const ruangOpts = '<option value="">— Tanpa Ruangan —</option>' + (window._bastData.ruangan || []).map(r =>
    '<option value="' + apEsc(r.id) + '"' + (a.ruangan_id && String(r.id) === String(a.ruangan_id) ? ' selected' : '') + '>' + apEsc(r.nama) + '</option>').join('');
  const { value: v } = await Swal.fire({
    title: 'Edit Unit Aset',
    html:
      '<div style="font-size:12px;color:var(--muted);margin-bottom:12px;">' + apEsc(a.nama_barang) + '<br><b>' + apEsc(a.nomorinventaris) + '</b></div>' +
      '<label style="font-size:11px;font-weight:700;display:block;margin:6px 0 4px;text-align:left;">Nomor Inventaris</label>' +
      '<input id="apNomor" class="form-input" value="' + apEsc(a.nomorinventaris) + '" style="width:100%;margin-bottom:8px;">' +
      '<label style="font-size:11px;font-weight:700;display:block;margin:6px 0 4px;text-align:left;">Kondisi</label>' +
      '<select id="apKondisi" class="form-input" style="width:100%;margin-bottom:8px;">' +
        ['Baik', 'Rusak Ringan', 'Rusak Berat'].map(k => '<option' + (a.kondisi === k ? ' selected' : '') + '>' + k + '</option>').join('') +
      '</select>' +
      '<label style="font-size:11px;font-weight:700;display:block;margin:6px 0 4px;text-align:left;">Nilai Perolehan</label>' +
      '<input id="apNilai" type="number" class="form-input" value="' + apEsc(a.nilaiperolehan) + '" style="width:100%;margin-bottom:8px;">' +
      '<label style="font-size:11px;font-weight:700;display:block;margin:6px 0 4px;text-align:left;">Ruangan</label>' +
      '<select id="apRuangan" class="form-input" style="width:100%;">' + ruangOpts + '</select>',
    showCancelButton: true,
    confirmButtonText: 'Simpan',
    cancelButtonText: 'Batal',
    confirmButtonColor: 'var(--primary)',
    focusConfirm: false,
    didOpen: () => {
      makeSearchDd('apRuangan', { ph: 'Pilih ruangan...', static: true });
    },
    preConfirm: () => ({
      nomorinventaris: document.getElementById('apNomor').value.trim(),
      kondisi: document.getElementById('apKondisi').value,
      nilaiperolehan: document.getElementById('apNilai').value,
      ruangan_id: document.getElementById('apRuangan').value || null
    })
  });
  if (!v) return;
  // ponytail: bast-assign sudah UPDATE nomorinventaris/kondisi/nilaiperolehan via COALESCE(NULLIF)
  const ok = await window.bastSubmit(P.simapoBastAssign, {
    aset_id: asetId,
    pegawai_id: window._asetPegSel.pegawai,
    ruangan_id: v.ruangan_id,
    nomorinventaris: v.nomorinventaris,
    kondisi: v.kondisi,
    nilaiperolehan: v.nilaiperolehan
  }, { successMsg: 'Unit diperbarui', errorMsg: 'Gagal memperbarui unit' });
  if (ok) window.loadAsetPegawai(true);
};

window.asetPegPindah = async function(asetId) {
  const a = bastFindAset(asetId);
  if (!a) return;
  const pegOpts = '<option value="">— Tanpa Pemegang (Gudang) —</option>' + (window._bastData.pegawai || []).map(p =>
    '<option value="' + apEsc(p.id) + '"' + (String(a.pegawai_id || '') === String(p.id) ? ' selected' : '') + '>' + apEsc(p.nama) + ' — ' + apEsc(p.nip) + '</option>').join('');
  const ruangOpts = '<option value="">— Tanpa Ruangan —</option>' + (window._bastData.ruangan || []).map(r =>
    '<option value="' + apEsc(r.id) + '"' + (a.ruangan_id && String(r.id) === String(a.ruangan_id) ? ' selected' : '') + '>' + apEsc(r.nama) + '</option>').join('');
  const { value: v } = await Swal.fire({
    title: 'Pindah Aset',
    html:
      '<div style="font-size:12px;color:var(--muted);margin-bottom:12px;">' + apEsc(a.nama_barang) + '<br><b>' + apEsc(a.nomorinventaris) + '</b></div>' +
      '<label style="font-size:11px;font-weight:700;display:block;margin:6px 0 4px;text-align:left;">Pemegang Baru</label>' +
      '<select id="apPeg" class="form-input" style="width:100%;margin-bottom:8px;">' + pegOpts + '</select>' +
      '<label style="font-size:11px;font-weight:700;display:block;margin:6px 0 4px;text-align:left;">Ruangan Baru</label>' +
      '<select id="apRuang" class="form-input" style="width:100%;">' + ruangOpts + '</select>',
    showCancelButton: true,
    confirmButtonText: 'Pindahkan',
    cancelButtonText: 'Batal',
    confirmButtonColor: 'var(--primary)',
    focusConfirm: false,
    didOpen: () => {
      makeSearchDd('apPeg', { ph: 'Ketik nama/NIP...', static: true });
      makeSearchDd('apRuang', { ph: 'Pilih ruangan...', static: true });
    },
    preConfirm: () => ({
      pegawai_id: document.getElementById('apPeg').value || null,
      ruangan_id: document.getElementById('apRuang').value || null
    })
  });
  if (!v) return;
  const ok = await window.bastSubmit(P.simapoBastAssign, { aset_id: asetId, ...v }, {
    successMsg: 'Aset dipindahkan',
    errorMsg: 'Gagal memindahkan aset'
  });
  if (ok) {
    window.loadAsetPegawai(true);
    window.loadAdminBast(true); // refresh BAST data too
  }
};

window.asetPegHapus = async function(asetId) {
  const a = bastFindAset(asetId);
  if (!a) return;
  const { isConfirmed } = await Swal.fire({
    title: 'Hapus Unit Aset?',
    html: '<div style="font-size:12px;color:var(--muted);">' + apEsc(a.nama_barang) + '<br><b>' + apEsc(a.nomorinventaris) + '</b><br><br>Tindakan ini tidak bisa dibatalkan.</div>',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Ya, Hapus',
    cancelButtonText: 'Batal',
    confirmButtonColor: '#ef4444'
  });
  if (!isConfirmed) return;
  const ok = await window.bastSubmit(P.simapoUnitDelete, { aset_id: asetId }, {
    successMsg: 'Unit aset dihapus',
    errorMsg: 'Gagal menghapus unit aset'
  });
  if (ok) {
    window.loadAsetPegawai(true);
    window.loadAdminBast(true);
  }
};

window.asetPegExportExcel = async function() {
  const pe = window._asetPegSel.pegawai;
  if (!pe) { showToast('Pilih pegawai terlebih dahulu.', 'error'); return; }
  const owned = (window._bastData.aset || []).filter(a => String(a.pegawai_id || '') === String(pe));
  if (!owned.length) { showToast('Tidak ada aset untuk diekspor.', 'error'); return; }
  if (typeof ExcelJS === 'undefined') { showToast('ExcelJS belum termuat', 'error'); return; }
  const peg = bastFindPegawai(pe);
  const QR = window.QRCode || qrcode;
  if (typeof QR !== 'function') { showToast('QR library tidak tersedia', 'error'); return; }

  const origin = window.location.origin + window.location.pathname;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Aset ' + (peg ? peg.nama : pe));

  ws.mergeCells('A1:F1');
  ws.getCell('A1').value = 'DAFTAR ASET PEGAWAI';
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A1').alignment = { horizontal: 'center' };
  ws.mergeCells('A2:F2');
  ws.getCell('A2').value = peg ? peg.nama : pe;
  ws.getCell('A2').alignment = { horizontal: 'center' };
  ws.mergeCells('A3:F3');
  ws.getCell('A3').value = 'Tanggal Export: ' + new Date().toLocaleDateString('id-ID');
  ws.getCell('A3').alignment = { horizontal: 'center' };

  const header = ws.getRow(5);
  ['No', 'Nama Aset', 'No. Inventaris', 'Kondisi', 'Nilai (Rp)', 'QR Code'].forEach((h, i) => {
    const c = header.getCell(i + 1);
    c.value = h;
    c.font = { bold: true };
    c.alignment = { horizontal: 'center' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
    c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });

  owned.forEach((a, i) => {
    const row = ws.getRow(6 + i);
    row.getCell(1).value = i + 1;
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(2).value = a.nama_barang || '-';
    row.getCell(3).value = a.nomorinventaris || '-';
    row.getCell(3).alignment = { horizontal: 'center' };
    row.getCell(4).value = a.kondisi || '-';
    row.getCell(4).alignment = { horizontal: 'center' };
    row.getCell(5).value = a.nilaiperolehan || 0;
    row.getCell(5).numFmt = '#,##0';
    row.getCell(5).alignment = { horizontal: 'right' };
    [1, 2, 3, 4, 5, 6].forEach(ci => {
      row.getCell(ci).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
    row.height = 100;

    const payload = origin + '?qr=SIMAPO-' + a.id;
    const qr = QR(0, 'M');
    qr.addData(payload);
    qr.make();
    const dataUrl = qr.createDataURL(8, 10);
    const imgId = wb.addImage({ base64: dataUrl.split(',')[1], extension: 'png' });
    ws.addImage(imgId, { tl: { col: 5.1, row: 5 + i + 0.15 }, ext: { width: 96, height: 96 } });
  });

  ws.columns = [
    { key: 'no', width: 6 },
    { key: 'nama', width: 32 },
    { key: 'inv', width: 20 },
    { key: 'kondisi', width: 12 },
    { key: 'nilai', width: 16 },
    { key: 'qr', width: 18 }
  ];

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'Aset_' + (peg ? peg.nama : pe).replace(/[^a-zA-Z0-9]+/g, '_') + '.xlsx';
  link.click();
  URL.revokeObjectURL(link.href);
  showToast('Excel berhasil diunduh', 'success');
};

window.asetPegTambah = async function() {
  const pe = window._asetPegSel.pegawai;
  if (!pe) { showToast('Pilih pegawai terlebih dahulu.', 'error'); return; }
  const peg = bastFindPegawai(pe);

  const units = (window._bastData.aset || []).filter(a => String(a.pegawai_id || '') !== String(pe));
  const gridRows = units.map(u => `
    <div class="ap-grid-row" style="display:flex;flex-direction:column;gap:4px;padding:11px 13px;border:1px solid rgba(255,255,255,0.07);background:rgba(255,255,255,0.02);border-radius:12px;cursor:pointer;transition:border-color .15s;" onclick="this.querySelector('input[type=checkbox]').click();this.querySelector('input[type=checkbox]').dispatchEvent(new Event('change'));this.style.borderColor=this.querySelector('input[type=checkbox').checked?'var(--success)':'';">
      <div style="display:flex;align-items:flex-start;gap:9px;">
        <input type="checkbox" data-aset-id="${u.id}" style="width:16px;height:16px;flex-shrink:0;margin-top:2px;accent-color:#22c55e;" onclick="event.stopPropagation()" onchange="window._apUpdateCount()">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:13px;color:var(--white);line-height:1.3;">${apEsc(u.nama_barang || '-')}</div>
          <div style="font-size:10px;color:var(--muted);margin-top:3px;">${apEsc(u.nomorinventaris || '-')}</div>
        </div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:4px 8px;font-size:10px;color:var(--muted);padding-left:25px;">
        <span><i class="fas fa-receipt" aria-hidden="true"></i> ${apEsc(u.kondisi || '-')}</span>
        ${u.pegawai_id ? '<span style="color:var(--warning);"><i class="fas fa-user" aria-hidden="true"></i> ' + apEsc(bastFindPegawai(u.pegawai_id)?.nama || 'Pegawai lain') + '</span>' : '<span style="color:var(--success);"><i class="fas fa-check" aria-hidden="true"></i> Tanpa pemegang</span>'}
      </div>
      <div style="font-size:11px;color:var(--gold);font-weight:700;padding-left:25px;">${bastRupiah(u.nilaiperolehan || 0)}</div>
    </div>`).join('');

  const { value: v } = await Swal.fire({
    title: 'Tambah Unit ke Pegawai',
    width: '720px',
    html:
      '<div style="font-size:12px;color:var(--muted);margin-bottom:10px;">Untuk: <b>' + apEsc(peg ? peg.nama : pe) + '</b></div>' +
      '<input id="apSearch" class="form-input" placeholder="Ketik nama / nomor inventaris..." style="width:100%;margin-bottom:10px;font-size:12px;" oninput="window._apFilterGrid(this.value)">' +
      '<div id="apGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:8px;max-height:420px;overflow-y:auto;padding:2px;">' +
        (gridRows || '<div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:20px;font-size:12px;">Tidak ada unit tersedia.</div>') +
      '</div>' +
      '<div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center;">' +
        '<span style="font-size:11px;color:var(--muted);"><span id="apCount">0</span> dipilih</span>' +
        '<button type="button" onclick="window.asetPegTambahManual()" style="font-size:10px;color:var(--gold);background:none;border:none;cursor:pointer;text-decoration:underline;padding:0;">atau buat unit baru...</button>' +
      '</div>',
    showCancelButton: true,
    confirmButtonText: 'Assign Terpilih',
    cancelButtonText: 'Batal',
    confirmButtonColor: 'var(--primary)',
    focusConfirm: false,
    preConfirm: () => {
      const ids = [...document.querySelectorAll('#apGrid input[type=checkbox]:checked')].map(cb => cb.dataset.asetId);
      if (!ids.length) { showToast('Pilih minimal satu unit.', 'error'); return false; }
      return { ids };
    }
  });
  if (!v) return;

  for (const id of v.ids) {
    await window.bastSubmit(P.simapoBastAssign, { aset_id: id, pegawai_id: pe }, { successMsg: '', errorMsg: '' });
  }
  showToast(v.ids.length + ' unit berhasil diassign', 'success');
  window.loadAsetPegawai(true);
  window.loadAdminBast(true);
};

window._apUpdateCount = function() {
  const el = document.getElementById('apCount');
  if (el) el.textContent = document.querySelectorAll('#apGrid input[type=checkbox]:checked').length;
};

window._apFilterGrid = function(q) {
  q = q.toLowerCase();
  document.querySelectorAll('#apGrid .ap-grid-row').forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
};

window.asetPegTambahManual = async function() {
  const pe = window._asetPegSel.pegawai;
  if (!pe) { showToast('Pilih pegawai terlebih dahulu.', 'error'); return; }
  const peg = bastFindPegawai(pe);
  Swal.close();
  const { value: v } = await Swal.fire({
    title: 'Buat Unit Baru',
    html:
      '<div style="font-size:12px;color:var(--muted);margin-bottom:12px;">Untuk: <b>' + apEsc(peg ? peg.nama : pe) + '</b></div>' +
      '<label style="font-size:11px;font-weight:700;display:block;margin:6px 0 4px;text-align:left;">Kode Barang</label>' +
      '<input id="apKode" class="form-input" placeholder="KB001" style="width:100%;margin-bottom:8px;">' +
      '<label style="font-size:11px;font-weight:700;display:block;margin:6px 0 4px;text-align:left;">Nama Barang</label>' +
      '<input id="apNama" class="form-input" placeholder="Laptop" style="width:100%;margin-bottom:8px;">' +
      '<label style="font-size:11px;font-weight:700;display:block;margin:6px 0 4px;text-align:left;">Nomor Inventaris</label>' +
      '<input id="apNoInv" class="form-input" placeholder="INV-001" style="width:100%;margin-bottom:8px;">' +
      '<label style="font-size:11px;font-weight:700;display:block;margin:6px 0 4px;text-align:left;">Satuan</label>' +
      '<input id="apSatuan" class="form-input" value="Unit" style="width:100%;margin-bottom:8px;">' +
      '<label style="font-size:11px;font-weight:700;display:block;margin:6px 0 4px;text-align:left;">Nilai Perolehan</label>' +
      '<input id="apNilaiBaru" type="number" class="form-input" placeholder="0" style="width:100%;margin-bottom:8px;">' +
      '<label style="font-size:11px;font-weight:700;display:block;margin:6px 0 4px;text-align:left;">Tahun Perolehan</label>' +
      '<input id="apTahun" type="number" class="form-input" placeholder="2024" style="width:100%;">',
    showCancelButton: true,
    confirmButtonText: 'Tambah',
    cancelButtonText: 'Batal',
    confirmButtonColor: 'var(--primary)',
    focusConfirm: false,
    preConfirm: () => ({
      kodebarang: document.getElementById('apKode').value.trim(),
      nama: document.getElementById('apNama').value.trim(),
      nomorinventaris: document.getElementById('apNoInv').value.trim(),
      satuan: document.getElementById('apSatuan').value.trim() || 'Unit',
      nilaiperolehan: document.getElementById('apNilaiBaru').value,
      tahunperolehan: document.getElementById('apTahun').value
    })
  });
  if (!v) return;
  if (!v.kodebarang || !v.nama || !v.nomorinventaris) {
    showToast('Kode, nama, dan nomor inventaris wajib diisi.', 'error');
    return;
  }
  const ok = await window.bastSubmit(P.simapoBastImportUnit, v, { successMsg: 'Unit ditambahkan', errorMsg: 'Gagal menambah unit' });
  if (!ok) return;
  await window.loadAsetPegawai(true);
  const newUnit = (window._bastData.aset || []).find(a => String(a.nomorinventaris) === String(v.nomorinventaris));
  if (newUnit) {
    await window.bastSubmit(P.simapoBastAssign, { aset_id: newUnit.id, pegawai_id: pe }, {
      successMsg: '',
      errorMsg: 'Unit dibuat tapi gagal assign pegawai'
    });
    window.loadAsetPegawai(true);
    window.loadAdminBast(true);
  }
};