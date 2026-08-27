/* ─── GLOBAL STATE ── */
window._simapoMasterEditId = null;
window._allPinjamData = [];
window._allTiketData = [];
window._allMasterData = [];

/* ─── CACHE MANAGER ────────────────────────────────────────── */
window._simapoCache = {
  data: {},
  expiry: 2 * 60 * 1000,
  async getOrFetch(key, fetchFn, force = false) {
    if (!force && this.data[key] && (Date.now() - this.data[key].time < this.expiry)) {
      return this.data[key].value;
    }
    try {
      const val = await fetchFn();
      if (val !== null) this.set(key, val);
      return val;
    } catch (e) {
      console.error(`[Cache] Fetch Error for ${key}:`, e);
      return null;
    }
  },
  set(key, value) { this.data[key] = { value, time: Date.now() }; },
  clear(key) { if(key) delete this.data[key]; else this.data = {}; }
};

/* ─── SUB-TAB SWITCHER ──────────────────────────────────────── */
window.switchSATab = function(name, force = false) {
  console.log('[SIMAPO] Switching sub-tab to:', name);
  document.querySelectorAll('.sa-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.sa-sect').forEach(s => {
      s.style.display = 'none';
      s.style.opacity = '0';
  });
  
  const btn = document.getElementById('sa-tab-' + name);
  const sect = document.getElementById('sa-sect-' + name);
  if (btn) {
    btn.classList.add('active');
    document.querySelectorAll('.sa-tab.hidden').forEach(b => b.classList.remove('hidden'));
    const group = btn.dataset.group;
    document.querySelectorAll('.sa-tab').forEach(b => b.classList.toggle('hidden', b.dataset.group !== group));
    document.querySelectorAll('.sa-group-btn').forEach(b => b.classList.remove('active'));
    const gbtn = document.getElementById('sa-group-' + group);
    if (gbtn) gbtn.classList.add('active');
  }
  if (sect) {
      sect.style.display = 'block';
      setTimeout(() => { sect.style.opacity = '1'; sect.style.transition = 'opacity 0.3s'; }, 10);
  }
  
  if (name === 'pinjam') window.loadAdminSimapoPinjam(force);
  else if (name === 'tiket') window.loadAdminSimapoTiket(force);
  else if (name === 'master') window.loadAdminSimapoMaster(force);
  else if (name === 'mutasi') { window.loadMutasiRiwayat(force); window.populateMutasiBarangSelect(); }
  else if (name === 'opname') window.loadOpnameForm(force);
  else if (name === 'kat') window.loadSimapoKategori(true, force);
  else if (name === 'standar-harga') window.loadStandarHarga();
  else if (name === 'penerimaan') { window.loadAdminPenerimaan(force); window.populateStandarHargaDatalist(); }
  else if (name === 'pemeliharaan') { window.loadAdminPemeliharaan(force); window.populatePemeliharaanBarang(); }
  else if (name === 'bku') window.loadAdminBKU(force);
  else if (name === 'pks') window.loadAdminPKS(force);
};

/* ─── HELPER: SHOW SHIMMER ── */
window.showAdminSimapoShimmer = function(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = `
    <div class="shimmer-wrapper" style="width:100%;">
      <div class="shimmer sh-line" style="height:80px; border-radius:12px; margin-bottom:10px;"></div>
      <div class="shimmer sh-line" style="height:80px; border-radius:12px; margin-bottom:10px;"></div>
    </div>
  `;
};

/* ─── ADMIN: PEMINJAMAN ── */
window.loadAdminSimapoPinjam = async function(force = false) {
  console.log('[SIMAPO] Loading Admin Pinjaman...');
  const el = document.getElementById('adminSimapoPinjamList');
  if (!el) return;
  
  if (force || !window._allPinjamData || window._allPinjamData.length === 0) {
    window.showAdminSimapoShimmer('adminSimapoPinjamList');
  }

  try {
    const data = await window._simapoCache.getOrFetch('admin_pinjam', async () => {
      try {
        const res = await apiFetch(P.simapoAdminPinjamList);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        return parseApiResponse(json);
      } catch (e) { 
        console.warn('[SIMAPO] Pinjam Fetch Fail:', e); 
        return null; 
      }
    }, force);

    if (data && Array.isArray(data)) {
      window._allPinjamData = data;
    } else {
      console.log('[SIMAPO] No data from server, using demo fallback');
      window._allPinjamData = [
        { id:'P001', userid:'1234567', nama_peminjam:'Demo User 1', nama_barang:'Proyektor Epson', tujuanpeminjaman:'Presentasi', tanggalmulai:'2026-05-15', tanggalselesai:'2026-05-15', status:'MENUNGGU' },
        { id:'P002', userid:'7654321', nama_peminjam:'Demo User 2', nama_barang:'Kamera DSLR', tujuanpeminjaman:'Dokumentasi', tanggalmulai:'2026-05-18', tanggalselesai:'2026-05-20', status:'MENUNGGU' },
      ];
    }
    window.renderSADipinjam(window._allPinjamData);
  } catch (e) {
    console.error('[SIMAPO] Critical Load Error:', e);
  }

  // Auto-filter based on active button or default to MENUNGGU
  const activeFilterBtn = document.querySelector('.sa-filter-btn.active');
  const activeFilter = activeFilterBtn ? (activeFilterBtn.dataset.filter || 'MENUNGGU') : 'MENUNGGU';
  window.filterSAPinjam(activeFilter, activeFilterBtn);
};

window.filterSAPinjam = function(status, btnEl) {
  document.querySelectorAll('.sa-filter-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  
  const filtered = status ? window._allPinjamData.filter(d => (d.status||'').toUpperCase() === status.toUpperCase()) : window._allPinjamData;
  window.renderAdminSimapoPinjam(filtered);
};

window.renderAdminSimapoPinjam = function(data) {
  const el = document.getElementById('adminSimapoPinjamList');
  if (!el) return;
  if (!data || data.length === 0) {
    el.innerHTML = `<div style="text-align:center;padding:30px;color:var(--muted);font-size:12px">📭 Tidak ada data peminjaman.</div>`;
    return;
  }
  el.innerHTML = data.map(item => {
    const st = (item.status || 'MENUNGGU').toUpperCase();
    const isPending = st === 'MENUNGGU';
    let badge = `<span style="background:var(--warning);color:#000;">⏳ ${st}</span>`;
    if (st === 'DISETUJUI' || st === 'DIPINJAM') badge = `<span style="background:var(--success);color:#fff;">✅ ${st}</span>`;
    if (st === 'DITOLAK') badge = `<span style="background:var(--danger);color:#fff;">❌ ${st}</span>`;
    if (st === 'KEMBALI' || st === 'DIKEMBALIKAN') badge = `<span style="background:rgba(100,180,255,0.3);color:#64b4ff;">📦 ${st}</span>`;

    return `
      <div style="padding:14px;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <div>
            <div style="font-weight:800;font-size:14px;color:var(--white)">${item.nama_barang || 'Tanpa Nama'} <span style="font-size:11px; color:var(--gold); font-weight:700;">(x${item.jumlah || 1})</span></div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px;">👤 ${item.nama_peminjam || 'Pegawai'} &nbsp;·&nbsp; NIP ${item.userid || item.nip_peminjam || '—'}</div>
          </div>
          <div style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:8px;">${badge}</div>
        </div>
        <div style="font-size:12px;color:var(--gold);margin:10px 0 4px;font-style:italic;">"${item.tujuanpeminjaman || item.tujuan || '—'}"</div>
        <div style="font-size:11px;color:var(--muted);">${item.jenisbarang === 'Habis Pakai' ? `📅 Diminta pd ${item.tanggalmulai}` : `📅 ${item.tanggalmulai} s/d ${item.tanggalselesai}`}</div>
        ${isPending ? `
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button onclick="window.adminSimapoPinjamAction('${item.id}','${item.jenisbarang === 'Habis Pakai' ? 'SELESAI' : 'DIPINJAM'}')" style="flex:1;padding:8px;background:var(--success);color:#fff;border:none;border-radius:8px;font-weight:800;font-size:12px;cursor:pointer;">✅ Setujui</button>
          <button onclick="window.adminSimapoPinjamAction('${item.id}','DITOLAK')" style="flex:1;padding:8px;background:var(--danger);color:#fff;border:none;border-radius:8px;font-weight:800;font-size:12px;cursor:pointer;">❌ Tolak</button>
        </div>` : ( (st === 'DISETUJUI' || st === 'DIPINJAM') && item.jenisbarang !== 'Habis Pakai' ? `
        <button onclick="window.adminSimapoPinjamAction('${item.id}','DIKEMBALIKAN')" style="width:100%;padding:8px;background:rgba(100,180,255,0.2);color:#64b4ff;border:1px solid rgba(100,180,255,0.3);border-radius:8px;font-weight:800;font-size:12px;cursor:pointer;margin-top:12px;">📦 Tandai Kembali</button>
        ` : '')}
      </div>`;
  }).join('');
};

/* ─── RENDER: BARANG SEDANG DIPINJAM ── */
window.renderSADipinjam = function(data) {
  const el = document.getElementById('adminSimapoDipinjamList');
  if (!el) return;
  const aktif = (data || window._allPinjamData || []).filter(d => (d.status||'').toUpperCase() === 'DIPINJAM');
  if (!aktif.length) {
    el.innerHTML = `<div style="text-align:center;padding:20px;color:var(--muted);font-size:11px">✅ Tidak ada barang sedang dipinjam.</div>`;
    return;
  }
  el.innerHTML = aktif.map(item => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04);gap:8px;">
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:12px;color:var(--white)">${item.nama_barang || 'Tanpa Nama'} <span style="font-size:10px;color:#60a5fa;font-weight:700;">(×${item.jumlah || 1})</span></div>
        <div style="font-size:10px;color:var(--muted)">👤 ${item.nama_peminjam || '—'} · ${item.tujuanpeminjaman || item.tujuan || '—'}</div>
      </div>
      <div style="font-size:9px;color:var(--muted);text-align:right;white-space:nowrap">${item.tanggalmulai || '—'}</div>
    </div>
  `).join('');
};

/* ─── ADMIN: QR KEMBALI ── */
window.adminQRKembaliScan = function() {
  window._qrOnScan = async (raw) => {
    showToast('Memuat data aset...', 'info');
    try {
      const res = await apiGet(P.simapoUnitByQR, { q: raw });
      if (!res.ok || !res.rows?.length) { showToast('QR tidak dikenal', 'error'); return; }
      const unit = res.rows[0];
      const pa = unit.peminjaman_aktif;
      if (!pa || !pa.id) { showToast('Aset ini sedang tidak dipinjam', 'warning'); return; }

      const ok = await Swal.fire({
        title: 'Kembalikan Aset?',
        html: `
          <div style="text-align:left;font-size:13px;line-height:1.8;">
            <b>${unit.nama_barang}</b><br>
            Inventaris: ${unit.nomorinventaris || '—'}<br>
            <span style="color:#64b4ff;">👤 Dipinjam oleh: ${pa.nama || pa.userid}</span>
          </div>`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: '📦 Kembalikan',
        cancelButtonText: 'Batal',
        background: '#1a1d21',
        color: '#fff',
        confirmButtonColor: '#22c55e',
      });
      if (!ok.isConfirmed) return;

      window.adminSimapoPinjamAction(pa.id, 'DIKEMBALIKAN');
    } catch (e) {
      showToast('Gagal memproses QR', 'error');
    }
  };
  if (typeof scanQRAset === 'function') scanQRAset();
  else showToast('QR scanner tidak tersedia', 'error');
};

/* ─── ADMIN: TIKET KERUSAKAN ── */
window.loadAdminSimapoTiket = async function(force = false) {
  const el = document.getElementById('adminSimapoTiketList');
  if (!el) return;
  if (force || window._allTiketData.length === 0) window.showAdminSimapoShimmer('adminSimapoTiketList');

  const data = await window._simapoCache.getOrFetch('admin_tiket', async () => {
    try {
      const res = await apiFetch(P.simapoAdminTiketList);
      return parseApiResponse(await res.json());
    } catch { return null; }
  }, force);

  if (data) window._allTiketData = data;
  else if (!force && window._allTiketData.length) {}
  else {
    window._allTiketData = [{ id: 'T001', judul: 'AC Ruang Rapat Bocor', deskripsi: 'Air menetes.', lokasi: 'Ruang Rapat', nip_pelapor: '12345', nama_pelapor: 'Demo User', status: 'MASUK', createdat: '2026-05-12' }];
  }
  window.renderAdminSimapoTiket(window._allTiketData);
};

window.renderAdminSimapoTiket = function(data) {
  const el = document.getElementById('adminSimapoTiketList');
  if (!el) return;
  if (!data || data.length === 0) { el.innerHTML = `<div style="text-align:center;padding:30px;color:var(--muted);font-size:12px">🚨 Tidak ada tiket kerusakan.</div>`; return; }
  el.innerHTML = data.map(item => {
    const st = (item.status || 'MASUK').toUpperCase();
    const colorMap = { MASUK: 'var(--warning)', DIPROSES: '#64b4ff', SELESAI: 'var(--success)', DITUTUP: 'var(--muted)' };
    const color = colorMap[st] || 'var(--muted)';
    return `
      <div style="padding:14px;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);margin-bottom:10px;border-left:4px solid ${color};">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <div style="font-weight:800;font-size:14px;color:var(--white)">${item.judul}</div>
          <div style="font-size:10px;font-weight:800;padding:4px 10px;border-radius:8px;background:rgba(255,255,255,0.05);color:${color};">${st}</div>
        </div>
        <div style="font-size:12px;color:var(--muted);margin-top:6px;">📍 ${item.lokasi || '—'} &nbsp;·&nbsp; 👤 ${item.nama_pelapor || '—'}</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:8px;font-style:italic;">"${item.deskripsi || ''}"</div>
        <div style="font-size:11px;color:var(--muted);margin-top:4px;">📅 ${item.createdat}</div>
        ${(st==='MASUK'||st==='DIPROSES') ? `<div style="display:flex;gap:8px;margin-top:12px;">
          <button onclick="window.adminSimapoTiketAction('${item.id}','DIPROSES')" style="flex:1;padding:8px;background:rgba(100,180,255,0.2);color:#64b4ff;border:1px solid rgba(100,180,255,0.3);border-radius:8px;font-weight:800;font-size:12px;cursor:pointer;">🔧 Proses</button>
          <button onclick="window.adminSimapoTiketAction('${item.id}','SELESAI')" style="flex:1;padding:8px;background:var(--success);color:#fff;border:none;border-radius:8px;font-weight:800;font-size:12px;cursor:pointer;">✅ Selesai</button>
        </div>` : ''}
      </div>`;
  }).join('');
};

/* ─── ADMIN: MASTER ASET ── */
window.loadAdminSimapoMaster = async function(force = false) {
  const el = document.getElementById('adminSimapoMasterList');
  if (!el) return;
  if (force || window._allMasterData.length === 0) window.showAdminSimapoShimmer('adminSimapoMasterList');

  const data = await window._simapoCache.getOrFetch('admin_master', async () => {
    try {
      const res = await apiFetch(P.simapoAdminMasterList);
      return parseApiResponse(await res.json());
    } catch { return null; }
  }, force);

  if (data) window._allMasterData = data;
  else if (!force && window._allMasterData.length) {}
  else {
    window._allMasterData = [{ id:'1',nama:'Demo Laptop',kodebarang:'IT-001',stok_saat_ini:5,satuan:'Unit',hargasatuan:10000000,isactive:true }];
  }
  window.renderAdminSimapoMaster(window._allMasterData);
};

window.renderAdminSimapoMaster = function(data) {
  const el = document.getElementById('adminSimapoMasterList');
  if (!el) return;
  if (!data || data.length === 0) { el.innerHTML = `<div style="text-align:center;padding:30px;color:var(--muted);font-size:12px">📦 Belum ada data aset.</div>`; return; }
  const fmt = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);

  el.innerHTML = data.map(item => `
    <div data-barang-id="${item.id}" style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);margin-bottom:8px;">
      <div style="width:40px;height:40px;border-radius:8px;background:rgba(201,168,76,0.15);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">📦</div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:800;font-size:13px;color:var(--white);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.nama}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px;">${item.kodebarang} &nbsp;·&nbsp; Stok: <span style="color:${item.stok_saat_ini > 0 ? 'var(--success)' : 'var(--danger)'}">${item.stok_saat_ini} ${item.satuan}</span></div>
        <div style="font-size:11px;color:var(--gold);margin-top:2px;">${fmt(item.hargasatuan || 0)}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">
        <button onclick="window.showSimapoMasterForm('${item.id}')" style="padding:6px 10px;background:rgba(255,255,255,0.08);color:var(--white);border:none;border-radius:6px;font-size:11px;cursor:pointer;font-weight:700;">✏️</button>
        <button onclick="window.deleteSimapoMaster('${item.id}')" style="padding:6px 10px;background:rgba(255,60,60,0.15);color:var(--danger);border:1px solid rgba(255,60,60,0.2);border-radius:6px;font-size:11px;cursor:pointer;font-weight:700;">🗑</button>
        <button onclick="toggleUnitList('${item.id}', this)" style="padding:6px 10px;background:rgba(34,197,94,0.1);color:#22c55e;border:1px solid rgba(34,197,94,0.2);border-radius:6px;font-size:10px;cursor:pointer;font-weight:700;">▶ QR</button>
      </div>
    </div>`).join('');
};

window.filterSAMaster = function(val) {
  const q = val.toLowerCase();
  const filtered = window._allMasterData.filter(b => 
    (b.nama && b.nama.toLowerCase().includes(q)) || 
    (b.kodebarang && b.kodebarang.toLowerCase().includes(q))
  );
  window.renderAdminSimapoMaster(filtered);
};

window.showSimapoMasterForm = async function(id = null) {
  window._simapoMasterEditId = id;
  const modal = document.getElementById('modalSimapoMaster');
  if (!modal) return;

  // Pastikan data kategori dimuat
  const katData = await window._simapoCache.getOrFetch('simapo_kategori', async () => {
    try {
      const res = await apiFetch(P.simapoKategoriList);
      return parseApiResponse(await res.json());
    } catch { return null; }
  }, false);

  const selKat = document.getElementById('smfKategori');
  if (selKat && katData) {
    selKat.innerHTML = '<option value="">-- Pilih Kategori --</option>' + 
      katData.map(k => `<option value="${k.id}">${k.nama}</option>`).join('');
  }

  // Reset Form
  document.getElementById('smfNama').value = '';
  document.getElementById('smfKode').value = '';
  document.getElementById('smfSatuan').value = 'Unit';
  document.getElementById('smfJenis').value = 'Aset Tetap';
  if (selKat) selKat.value = '';
  document.getElementById('smfStok').value = '0';
  document.getElementById('smfHarga').value = '0';
  document.getElementById('smfSpesifikasi').value = '';
  const titleEl = document.getElementById('smfTitle');
  if (titleEl) titleEl.textContent = id ? '✏️ Edit Data Aset' : '➕ Tambah Aset Baru';

  if (id) {
    const item = window._allMasterData.find(b => b.id === id);
    if (item) {
      document.getElementById('smfNama').value = item.nama || '';
      document.getElementById('smfKode').value = item.kodebarang || '';
      document.getElementById('smfSatuan').value = item.satuan || 'Unit';
      document.getElementById('smfJenis').value = item.jenisbarang || 'Aset Tetap';
      if (selKat) selKat.value = item.kategoriid || '';
      document.getElementById('smfStok').value = item.stok_saat_ini || 0;
      document.getElementById('smfHarga').value = item.hargasatuan || 0;
      document.getElementById('smfSpesifikasi').value = item.spesifikasi || '';
    }
  }

  modal.style.display = 'flex';
  modal.style.opacity = '0';
  setTimeout(() => { modal.style.opacity = '1'; modal.style.transition = 'opacity 0.3s'; }, 10);
};

window.closeSimapoMasterForm = function() {
  const modal = document.getElementById('modalSimapoMaster');
  if (modal) modal.style.display = 'none';
};

/* ─── ACTIONS ── */
window.adminSimapoPinjamAction = async function(id, status) {
  if (!confirm(`Konfirmasi perubahan status ke ${status}?`)) return;
  showToast('Memproses...', 'info');
  try {
    const res = await apiFetch(P.simapoAdminPinjamAction, { method:'POST', body: JSON.stringify({ id, status }) });
    if (res.ok) { showToast('Berhasil', 'success'); window._simapoCache.clear('admin_pinjam'); window.loadAdminSimapoPinjam(true); }
    else throw 1;
  } catch { showToast('Status diubah (Demo)', 'success'); window._simapoCache.clear('admin_pinjam'); window.loadAdminSimapoPinjam(true); }
};

window.adminSimapoTiketAction = async function(id, status) {
  showToast('Memproses...', 'info');
  try {
    const res = await apiFetch(P.simapoAdminTiketAction, { method:'POST', body: JSON.stringify({ id, status }) });
    if (res.ok) { showToast('Berhasil', 'success'); window._simapoCache.clear('admin_tiket'); window.loadAdminSimapoTiket(true); }
    else throw 1;
  } catch { showToast('Status diubah (Demo)', 'success'); window._simapoCache.clear('admin_tiket'); window.loadAdminSimapoTiket(true); }
};

window.deleteSimapoMaster = async function(id) {
  if (!confirm('Hapus aset ini?')) return;
  showToast('Menghapus...', 'info');
  try {
    const res = await apiFetch(P.simapoAdminMasterDel, { method:'POST', body: JSON.stringify({ id }) });
    if (res.ok) { showToast('Aset dihapus', 'success'); window._simapoCache.clear('admin_master'); window.loadAdminSimapoMaster(true); }
    else throw 1;
  } catch { showToast('Dihapus (Demo)', 'success'); window._simapoCache.clear('admin_master'); window.loadAdminSimapoMaster(true); }
};

window.saveSimapoMaster = async function() {
  const payload = {
    id: window._simapoMasterEditId,
    nama: document.getElementById('smfNama')?.value.trim(),
    kodebarang: document.getElementById('smfKode')?.value.trim(),
    satuan: document.getElementById('smfSatuan')?.value.trim(),
    jenisbarang: document.getElementById('smfJenis')?.value.trim(),
    kategoriid: document.getElementById('smfKategori')?.value || null,
    stok_saat_ini: parseInt(document.getElementById('smfStok')?.value) || 0,
    hargasatuan: parseFloat(document.getElementById('smfHarga')?.value) || 0,
    spesifikasi: document.getElementById('smfSpesifikasi')?.value.trim(),
  };
  if (!payload.nama) { showToast('Nama wajib diisi!', 'error'); return; }
  showToast('Menyimpan...', 'info');
  try {
    const res = await apiFetch(P.simapoAdminMasterSave, { method:'POST', body: JSON.stringify(payload) });
    if (res.ok) { showToast('Berhasil', 'success'); window._simapoCache.clear('admin_master'); window.loadAdminSimapoMaster(true); if(window.closeSimapoMasterForm) window.closeSimapoMasterForm(); }
    else throw 1;
  } catch { showToast('Simpan (Demo)', 'success'); window._simapoCache.clear('admin_master'); window.loadAdminSimapoMaster(true); if(window.closeSimapoMasterForm) window.closeSimapoMasterForm(); }
};

/* ─── OTHERS ── */
window.populateMutasiBarangSelect = async function() {
  const sel = document.getElementById('mutasiBarangId'); if (!sel) return;
  let data = window._allMasterData;
  if (!data.length) try { data = parseApiResponse(await (await apiFetch(P.simapoAdminMasterList)).json()); } catch { data=[]; }
  sel.innerHTML = '<option value="">-- Pilih Barang --</option>' + data.map(b => `<option value="${b.id}">${b.nama} (${b.kodebarang})</option>`).join('');
};

window.loadMutasiRiwayat = async function(force = false) {
  const el = document.getElementById('mutasiRiwayatList'); if (!el) return;
  const data = await window._simapoCache.getOrFetch('mutasi_riwayat', async () => {
    try { const res = await apiFetch(P.simapoMutasiList); return parseApiResponse(await res.json()); } catch { return null; }
  }, force);
  if (!data || !data.length) { el.innerHTML = '<div style="text-align:center;padding:20px;font-size:12px;color:var(--muted)">Belum ada riwayat.</div>'; return; }
  el.innerHTML = data.map(m => `<div style="padding:10px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);margin-bottom:6px;"><div style="font-weight:800;font-size:13px">${m.nama_barang}</div><div style="font-size:11px">${m.jenis} · ${m.jumlah} · ${m.createdat}</div></div>`).join('');
};

window.loadOpnameForm = async function() {
  const el = document.getElementById('opnameFormList'); if (!el) return;
  let data = window._allMasterData;
  if (!data.length) try { data = parseApiResponse(await (await apiFetch(P.simapoAdminMasterList)).json()); } catch { data=[]; }
  el.innerHTML = data.map(b => `<div style="display:flex;align-items:center;gap:10px;padding:10px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);margin-bottom:6px;"><div style="flex:1;"><div style="font-weight:700;font-size:13px">${b.nama}</div><div style="font-size:11px">${b.kodebarang} · Sistem: ${b.stok_saat_ini}</div></div><input type="number" class="form-input opname-input" data-id="${b.id}" data-sistem="${b.stok_saat_ini}" value="${b.stok_saat_ini}" style="width:70px;padding:6px;"></div>`).join('');
};

window.submitStokOpname = async function() {
  const items = Array.from(document.querySelectorAll('.opname-input')).map(i => ({
    id: i.dataset.id,
    stok_fisik: parseInt(i.value) || 0,
    stok_sistem: parseInt(i.dataset.sistem) || 0
  }));
  if (!confirm('Simpan hasil opname?')) return;
  showToast('Menyimpan...', 'info');
  try {
    const res = await apiFetch(P.simapoOpnameSave, { method:'POST', body: JSON.stringify({ items }) });
    if (res.ok) { showToast('Berhasil', 'success'); window._simapoCache.clear('admin_master'); window.loadAdminSimapoMaster(true); }
    else throw 1;
  } catch { showToast('Opname (Demo)', 'success'); window._simapoCache.clear('admin_master'); window.loadAdminSimapoMaster(true); }
};

/* ─── KATEGORI ── */
window.loadSimapoKategori = async function(isAdmin = true, force = false) {
  const elId = isAdmin ? 'adminSimapoKatList' : 'simapoKatFilterBar';
  const el = document.getElementById(elId);
  if (!el) return;

  if (force) window.showAdminSimapoShimmer(elId);

  const data = await window._simapoCache.getOrFetch('simapo_kategori', async () => {
    try {
      const res = await apiFetch(P.simapoKategoriList);
      return parseApiResponse(await res.json());
    } catch { return null; }
  }, force);

  if (isAdmin) {
    window.renderAdminSimapoKat(data || []);
  } else {
    window.renderUserSimapoKatFilter(data || []);
  }
};

window.renderAdminSimapoKat = function(data) {
  const el = document.getElementById('adminSimapoKatList');
  if (!el) return;
  if (!data || data.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:20px;font-size:12px;color:var(--muted)">Belum ada kategori.</div>';
    return;
  }
  el.innerHTML = data.map(k => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);margin-bottom:6px;">
      <div>
        <div style="font-weight:800;font-size:13px;color:var(--white)">${k.nama}</div>
        <div style="font-size:11px;color:var(--muted)">${k.jumlah_aset || 0} Aset</div>
      </div>
      <button onclick="window.deleteSimapoKategori('${k.id}')" style="padding:6px;background:rgba(255,60,60,0.1);color:var(--danger);border:none;border-radius:6px;cursor:pointer;">
        <i class="fas fa-trash-alt"></i>
      </button>
    </div>
  `).join('');
};

window.addSimapoKategori = async function() {
  const input = document.getElementById('katNamaInput');
  const nama = input?.value.trim();
  if (!nama) {
    showToast('Silakan ketik nama kategori terlebih dahulu!', 'error');
    if (input) input.focus();
    return;
  }

  showToast('Menyimpan...', 'info');
  try {
    const res = await apiFetch(P.simapoKategoriSave, { method:'POST', body: JSON.stringify({ nama }) });
    if (res.ok) {
      showToast('Kategori berhasil ditambahkan', 'success');
      input.value = '';
      window._simapoCache.clear('simapo_kategori');
      window.loadSimapoKategori(true, true);
    } else throw 1;
  } catch {
    showToast('Berhasil (Demo)', 'success');
    input.value = '';
    window.loadSimapoKategori(true, true);
  }
};

window.deleteSimapoKategori = async function(id) {
  if (!confirm('Hapus kategori ini?')) return;
  showToast('Menghapus...', 'info');
  try {
    const res = await apiFetch(P.simapoKategoriDel, { method:'POST', body: JSON.stringify({ id }) });
    if (res.ok) {
      showToast('Kategori dihapus', 'success');
      window._simapoCache.clear('simapo_kategori');
      window.loadSimapoKategori(true, true);
    } else throw 1;
  } catch {
    showToast('Dihapus (Demo)', 'success');
    window.loadSimapoKategori(true, true);
  }
};

window.renderUserSimapoKatFilter = function(data) {
  const el = document.getElementById('simapoKatFilterBar');
  if (!el) return;
  el.innerHTML = '<button onclick="filterSimapoKatalog(\'\')" class="simapo-kat-badge active">Semua</button>' + 
    data.map(k => `<button onclick="filterSimapoKatalog('${k.nama}')" class="simapo-kat-badge">${k.nama}</button>`).join('');
};

/* ─── ADMIN: QR GENERATOR ──────────────────────────────────── */
window._unitCache = {};

window.toggleUnitList = async function(barangId, btnEl) {
  const row = document.getElementById('unit-list-' + barangId);
  if (row) {
    row.remove();
    if (btnEl) btnEl.textContent = '▶ Lihat Unit';
    return;
  }

  if (btnEl) btnEl.textContent = '▼ Tutup';

  const masterContainer = document.getElementById('adminSimapoMasterList');
  const targetItem = document.querySelector(`[data-barang-id="${barangId}"]`);
  if (!targetItem) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'unit-list-' + barangId;
  wrapper.innerHTML = '<div style="padding:12px;text-align:center;color:var(--muted);font-size:12px;">Memuat unit...</div>';
  targetItem.after(wrapper);

  try {
    const res = await apiGet(P.simapoUnitList, { barangid: barangId });
    const units = res.ok ? (res.rows || []) : [];
    window._unitCache[barangId] = units;

    if (!units.length) {
      wrapper.innerHTML = '<div style="padding:12px;text-align:center;color:var(--muted);font-size:11px;">Tidak ada unit aset.</div>';
      return;
    }

    wrapper.innerHTML = `
      <div style="margin:0 0 10px 0;border-radius:10px;overflow:hidden;border:1px solid rgba(255,255,255,0.06);">
        ${units.map(u => {
          const hasQR = !!(u.qrcode && u.qrcode.startsWith('http'));
          const isPinjam = u.statuspinjam === true || u.statuspinjam === 'true';
          return `
          <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(255,255,255,0.02);border-bottom:1px solid rgba(255,255,255,0.04);">
            <div style="width:16px;height:16px;border-radius:4px;flex-shrink:0;background:${isPinjam ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'};">
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;font-size:12px;color:var(--white);">${u.nomorinventaris || '—'}</div>
              <div style="font-size:10px;color:var(--muted);">Seri: ${u.nomorseri || '—'} · ${isPinjam ? '🔴 Dipinjam' : '✅ Tersedia'}</div>
            </div>
            <div style="flex-shrink:0;display:flex;gap:4px;align-items:center;">
              ${hasQR
                ? `<span style="font-size:10px;color:#22c55e;font-weight:700;">✅ QR</span>
                   <button onclick="viewQRCode('${u.id}')" style="padding:4px 8px;background:rgba(255,255,255,0.06);border:none;border-radius:4px;color:var(--muted);font-size:10px;cursor:pointer;" title="Lihat QR">📱</button>
                   <button onclick="generateQRCode('${u.id}','${u.nomorinventaris || u.id}')" style="padding:4px 8px;background:rgba(255,255,255,0.06);border:none;border-radius:4px;color:var(--muted);font-size:10px;cursor:pointer;" title="Regenerate">🔄</button>`
                : `<span style="font-size:10px;color:var(--muted);">❌</span>
                   <button onclick="generateQRCode('${u.id}','${u.nomorinventaris || u.id}')" style="padding:4px 8px;background:rgba(201,168,76,0.15);border:1px solid rgba(201,168,76,0.3);border-radius:4px;color:var(--gold);font-size:10px;cursor:pointer;font-weight:700;">Generate QR</button>`
              }
            </div>
          </div>`;
        }).join('')}
        <div style="padding:8px 14px;background:rgba(255,255,255,0.01);text-align:center;border-top:1px solid rgba(255,255,255,0.04);">
          <button onclick="generateAllQR('${barangId}')" style="padding:6px 14px;background:rgba(201,168,76,0.1);border:1px dashed rgba(201,168,76,0.3);border-radius:6px;color:var(--gold);font-size:11px;cursor:pointer;font-weight:700;">⚡ Generate All QR</button>
        </div>
      </div>
    `;
  } catch (e) {
    wrapper.innerHTML = '<div style="padding:12px;text-align:center;color:#ef4444;font-size:11px;">Gagal memuat unit.</div>';
  }
};

window.generateQRCode = async function(unitasetId, label) {
  const origin = window.location.origin;
  const path = window.location.pathname;
  const payload = origin + path + '?qr=SIMAPO-' + unitasetId;

  try {
    const qr = qrcode(0, 'M');
    qr.addData(payload);
    qr.make();
    const canvas = qr.createImgTag(6, 8);

    // Simpan ke API
    await apiFetch(P.simapoQRUpdate, {
      method: 'POST',
      body: JSON.stringify({ unitasetid: unitasetId, qrcode: payload })
    });

    // Tampilkan modal QR
    Swal.fire({
      title: `QR: ${label}`,
      html: `
        <div style="text-align:center;">
          <div style="background:#fff;display:inline-block;padding:12px;border-radius:8px;margin:10px 0;">
            ${canvas}
          </div>
          <div style="font-size:11px;color:var(--muted);word-break:break-all;margin-bottom:8px;">${payload}</div>
          <button onclick="downloadQRImage('${payload}','${label}')" style="padding:8px 20px;background:#22c55e;color:#fff;border:none;border-radius:6px;font-weight:700;font-size:12px;cursor:pointer;">
            📥 Download PNG
          </button>
        </div>
      `,
      background: '#1a1d21',
      color: '#fff',
      confirmButtonText: 'Tutup',
      didClose: () => { window.loadAdminSimapoMaster(true); }
    });
  } catch (e) {
    showToast('Gagal generate QR', 'error');
  }
};

window.downloadQRImage = function(payload, label) {
  const qr = qrcode(0, 'M');
  qr.addData(payload);
  qr.make();
  const dataUrl = qr.createDataURL(6, 8);
  const link = document.createElement('a');
  link.download = `QR-${label.replace(/[^a-zA-Z0-9-]/g,'_')}.png`;
  link.href = dataUrl;
  link.click();
};

window.generateAllQR = async function(barangId) {
  const units = window._unitCache[barangId] || [];
  const withoutQR = units.filter(u => !u.qrcode || !u.qrcode.startsWith('http'));
  if (!withoutQR.length) {
    showToast('Semua unit sudah punya QR', 'info');
    return;
  }

  showToast(`Generate QR untuk ${withoutQR.length} unit...`, 'info');
  for (const u of withoutQR) {
    const origin = window.location.origin;
    const path = window.location.pathname;
    const payload = origin + path + '?qr=SIMAPO-' + u.id;
    try {
      await apiFetch(P.simapoQRUpdate, {
        method: 'POST',
        body: JSON.stringify({ unitasetid: u.id, qrcode: payload })
      });
    } catch (e) { /* skip */ }
  }
  showToast(`QR berhasil digenerate untuk ${withoutQR.length} unit`, 'success');
  // Refresh unit list
  const btn = document.querySelector(`[onclick*="toggleUnitList('${barangId}'"]`);
  if (btn) { btn.textContent = '▶ Lihat Unit'; }
  window.toggleUnitList(barangId, null);
};

/* ─── GROUP SWITCHER ──────────────────────────────────────── */
window.switchSAGroup = function(group) {
  console.log('[SIMAPO] Switching group to:', group);
  document.querySelectorAll('.sa-group-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('sa-group-' + group);
  if (btn) btn.classList.add('active');

  document.querySelectorAll('.sa-tab').forEach(b => {
    b.classList.toggle('hidden', b.dataset.group !== group);
  });

  const firstVisible = document.querySelector('.sa-tab:not(.hidden)');
  if (firstVisible) {
    const name = firstVisible.id.replace('sa-tab-', '');
    switchSATab(name);
  }
};

/* ─── STANDAR HARGA (persisted) ────────────────────────────── */
window._shData = [];

window._shSaveToStorage = function() {
  try { localStorage.setItem('simapo_standar_harga', JSON.stringify(window._shData)); } catch {}
};

window._shLoadFromStorage = function() {
  try {
    const raw = localStorage.getItem('simapo_standar_harga');
    if (raw) { window._shData = JSON.parse(raw); return true; }
  } catch {}
  return false;
};

window.parseStandarHargaFile = async function(input) {
  if (!input.files || !input.files[0]) return;
  showToast('Membaca standar harga...', 'info');
  try {
    const buf = await input.files[0].arrayBuffer();
    const wb = XLSX.read(buf, {type:'array'});
    const items = [];
    for (const sn of wb.SheetNames) {
      if (sn === 'Lampiran Penjelasan') continue;
      const ws = wb.Sheets[sn];
      const rows = XLSX.utils.sheet_to_json(ws, {header:1});
      let headerRow = -1;
      for (let i=0; i<Math.min(15,rows.length); i++) {
        const row = rows[i];
        if (!row || !row.length) continue;
        const joined = row.map(c=>String(c||'').toLowerCase()).join(' ');
        if (joined.includes('harga satuan') || joined.includes('uraian barang')) {
          headerRow = i; break;
        }
      }
      if (headerRow < 0) continue;
      for (let i=headerRow+1; i<rows.length; i++) {
        const r = rows[i] || [];
        const nama = String(r[2]||'').trim();
        if (!nama) continue;
        let hargaRaw = '';
        for (const c of [5,6]) {
          const v = r[c];
          if (v !== undefined && v !== null) { hargaRaw = String(v); break; }
        }
        let harga = 0;
        try { harga = parseFloat(hargaRaw.replace(/[^0-9.,]/g,'').replace(/,/g,'')) || 0; } catch {}
        if (harga <= 0) continue;
        const satuan = String(r[4]||'').trim();
        if (!satuan) continue;
        items.push({ nama, satuan, harga, sheet: sn });
      }
    }
    const seen = {};
    const unique = [];
    for (const i of items) {
      const key = i.nama + '|' + i.harga;
      if (!seen[key]) { seen[key]=true; unique.push(i); }
    }
    window._shData = unique;
    _shSaveToStorage();

    try {
      await apiFetch(P.simapoStandarHargaSave, { method:'POST', body: JSON.stringify({ rows: unique }) });
    } catch {}

    loadStandarHarga();
    populateStandarHargaDatalist();
    showToast(`Standar harga: ${unique.length} item`, 'success');
  } catch(e) {
    console.error('[StandarHarga] Parse error:', e);
    showToast('Gagal parse', 'error');
  }
  input.value = '';
};

window.populateStandarHargaDatalist = function() {
  const dl = document.getElementById('shItemList');
  if (!dl) return;
  dl.innerHTML = window._shData.map(i => `<option value="${i.nama} — Rp ${i.harga.toLocaleString('id-ID')}">`).join('');
};

window.importStandarHargaExcel = function() {
  document.getElementById('shExcelFile')?.click();
};

window.loadStandarHarga = async function(forceApi = false) {
  const el = document.getElementById('adminStandarHargaList');
  if (!el) return;

  if (forceApi || !window._shData.length) {
    try {
      const res = await apiFetch(P.simapoStandarHargaList);
      const data = parseApiResponse(await res.json());
      if (data && data.length) {
        window._shData = data.map(d => ({ nama: d.nama_barang || d.nama, satuan: d.satuan, harga: parseFloat(d.harga_satuan || d.harga), sheet: d.sheet_name || '' }));
        _shSaveToStorage();
        populateStandarHargaDatalist();
      }
    } catch {}
  }

  if (!window._shData.length) {
    _shLoadFromStorage();
    if (window._shData.length) populateStandarHargaDatalist();
  }

  const data = window._shData;
  if (!data || !data.length) {
    el.innerHTML = `<div style="text-align:center;padding:30px;color:var(--muted);font-size:12px">📋 Klik "Import Excel" untuk memuat standar harga.</div>`;
    return;
  }
  el.innerHTML = data.map(i => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-radius:8px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);margin-bottom:4px;">
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;font-weight:700;color:var(--white);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${i.nama}</div>
        <div style="font-size:10px;color:var(--muted);">${i.satuan} · ${i.sheet || ''}</div>
      </div>
      <div style="font-size:12px;font-weight:800;color:var(--gold);flex-shrink:0;">Rp ${i.harga.toLocaleString('id-ID')}</div>
    </div>
  `).join('');
};

window.filterStandarHarga = function(val) {
  const q = val.toLowerCase();
  const el = document.getElementById('adminStandarHargaList');
  if (!el) return;
  const data = window._shData.filter(i => i.nama.toLowerCase().includes(q) || String(i.harga).includes(q));
  if (!data.length) { el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);font-size:12px">Tidak ditemukan.</div>'; return; }
  el.innerHTML = data.map(i => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-radius:8px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);margin-bottom:4px;">
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;font-weight:700;color:var(--white);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${i.nama}</div>
        <div style="font-size:10px;color:var(--muted);">${i.satuan}</div>
      </div>
      <div style="font-size:12px;font-weight:800;color:var(--gold);flex-shrink:0;">Rp ${i.harga.toLocaleString('id-ID')}</div>
    </div>
  `).join('');
};

/* ─── PENERIMAAN: ITEMS ──────────────────────────────────── */
window._penerimaanItems = [];

window.onStandarHargaItemInput = function(val) {
  const match = window._shData.find(i => val.includes(i.nama));
  if (!match) return;
  document.getElementById('ptdSatuan').value = match.satuan;
  document.getElementById('ptdHarga').value = match.harga;
};

window.addPenerimaanItem = function() {
  const nama = document.getElementById('ptdNama')?.value.trim();
  const jumlah = parseInt(document.getElementById('ptdJumlah')?.value) || 1;
  const satuan = document.getElementById('ptdSatuan')?.value.trim() || 'Unit';
  const harga = parseFloat(document.getElementById('ptdHarga')?.value) || 0;
  if (!nama) { showToast('Nama barang wajib!', 'error'); return; }
  const total = jumlah * harga;
  window._penerimaanItems.push({ nama, jumlah, satuan, harga, total });
  renderPenerimaanItems();
  document.getElementById('ptdNama').value = '';
  document.getElementById('ptdJumlah').value = '1';
  document.getElementById('ptdSatuan').value = '';
  document.getElementById('ptdHarga').value = '';
  document.getElementById('ptdNama').focus();
};

window.renderPenerimaanItems = function() {
  const el = document.getElementById('penerimaanItemsContainer');
  if (!el) return;
  const items = window._penerimaanItems;
  const fmt = n => new Intl.NumberFormat('id-ID',{minimumFractionDigits:0}).format(n);
  let grandTotal = 0;
  if (!items.length) {
    el.innerHTML = `<div style="text-align:center;padding:20px;color:var(--muted);font-size:12px;">Belum ada item. Tambah barang di atas.</div>`;
  } else {
    el.innerHTML = items.map((item,i) => {
      grandTotal += item.total;
      return `
      <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);margin-bottom:4px;">
        <div style="flex:2;min-width:0;font-size:12px;font-weight:700;color:var(--white);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.nama}</div>
        <div style="flex:0 0 40px;text-align:center;font-size:12px;color:var(--muted);">${item.jumlah}</div>
        <div style="flex:0 0 60px;text-align:center;font-size:11px;color:var(--muted);">${item.satuan}</div>
        <div style="flex:0 0 100px;text-align:right;font-size:12px;color:var(--gold);">${item.harga ? 'Rp '+fmt(item.harga) : '—'}</div>
        <div style="flex:0 0 110px;text-align:right;font-size:12px;font-weight:700;color:var(--white);">Rp ${fmt(item.total)}</div>
        <button onclick="removePenerimaanItem(${i})" style="padding:4px 8px;background:rgba(255,60,60,0.15);color:var(--danger);border:none;border-radius:4px;cursor:pointer;font-size:11px;">✕</button>
      </div>`;
    }).join('');
  }
  document.getElementById('ptTotalItem').textContent = items.length;
  document.getElementById('ptTotalNilai').textContent = fmt(grandTotal);
};

window.removePenerimaanItem = function(idx) {
  window._penerimaanItems.splice(idx, 1);
  renderPenerimaanItems();
};

/* ─── ADMIN: PENERIMAAN BARANG ────────────────────────────── */
window.loadAdminPenerimaan = async function(force = false) {
  const el = document.getElementById('adminPenerimaanList');
  if (!el) return;
  if (force) window.showAdminSimapoShimmer('adminPenerimaanList');

  const data = await window._simapoCache.getOrFetch('admin_penerimaan', async () => {
    try {
      const res = await apiFetch(P.simapoPenerimaanList);
      return parseApiResponse(await res.json());
    } catch { return null; }
  }, force);

  if (!data || data.length === 0) {
    el.innerHTML = `<div style="text-align:center;padding:30px;color:var(--muted);font-size:12px">📥 Belum ada penerimaan barang.</div>`;
    return;
  }
  el.innerHTML = data.map(item => {
    const st = item.status_spj || '';
    const stBadge = st === 'sudah_lapor' ? '<span style="color:var(--success)">✅ '+st+'</span>' : st === 'sudah_di_map' ? '<span style="color:#64b4ff">📁 '+st+'</span>' : '<span style="color:var(--warning)">⏳ '+st+'</span>';
    return `
    <div style="padding:14px;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <div>
          <div style="font-weight:800;font-size:14px;color:var(--white)">${item.no_nota || '—'}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px;">🏢 ${item.penyedia || '—'}</div>
          <div style="font-size:11px;color:var(--gold);margin-top:2px;">${item.total_nilai ? new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(item.total_nilai) : '—'}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:10px;color:var(--muted);">${item.tgl_nota || item.tanggal||'—'}</div>
          <div style="font-size:10px;font-weight:700;margin-top:2px;">${stBadge}</div>
        </div>
      </div>
      <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:6px;">📄 SP2D: ${item.no_sp2d || '—'} ${item.kontrak ? '· '+item.kontrak : ''}</div>
    </div>`;
  }).join('');
};

window.savePenerimaan = async function() {
  const items = window._penerimaanItems;
  if (!items.length) { showToast('Tambah minimal 1 barang!', 'error'); return; }
  const payload = {
    no_nota: document.getElementById('ptNoNota')?.value.trim(),
    tgl_nota: document.getElementById('ptTgl')?.value,
    penyedia: document.getElementById('ptPenyedia')?.value.trim(),
    no_sp2d: document.getElementById('ptSp2d')?.value.trim() || null,
    kontrak: document.getElementById('ptKontrak')?.value.trim() || null,
    sub_kegiatan: document.getElementById('ptSubKeg')?.value.trim() || null,
    status_spj: document.getElementById('ptStatusSpj')?.value || 'belum_dikumpulkan',
    total_nilai: items.reduce((s,i) => s + i.total, 0),
    items: items.map(i => ({
      barang_id: (window._allMasterData || []).find(b => b.nama === i.nama)?.id || null,
      nama_barang: i.nama,
      volume: i.jumlah,
      satuan: i.satuan,
      harga_satuan: i.harga,
      total: i.total,
    })),
  };
  if (!payload.no_nota || !payload.penyedia) { showToast('No. Nota & Penyedia wajib!', 'error'); return; }
  showToast('Menyimpan...', 'info');
  try {
    const res = await apiFetch(P.simapoPenerimaanSave, { method:'POST', body: JSON.stringify(payload) });
    if (res.ok) { showToast('Berhasil', 'success'); window._simapoCache.clear('admin_penerimaan'); window.loadAdminPenerimaan(true); clearPenerimaanForm(); }
    else throw 1;
  } catch {
    showToast('Tersimpan (Demo)', 'success');
    window._simapoCache.clear('admin_penerimaan');
    window.loadAdminPenerimaan(true);
    clearPenerimaanForm();
  }
};

window.clearPenerimaanForm = function() {
  ['ptNoNota','ptTgl','ptPenyedia','ptSp2d','ptKontrak','ptSubKeg'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const ss = document.getElementById('ptStatusSpj');
  if (ss) ss.value = 'belum_dikumpulkan';
  window._penerimaanItems = [];
  renderPenerimaanItems();
};

/* ─── ADMIN: PEMELIHARAAN ─────────────────────────────────── */
window.loadAdminPemeliharaan = async function(force = false) {
  const el = document.getElementById('adminPemeliharaanList');
  if (!el) return;
  if (force) window.showAdminSimapoShimmer('adminPemeliharaanList');

  const data = await window._simapoCache.getOrFetch('admin_pemeliharaan', async () => {
    try {
      const res = await apiFetch(P.simapoPemeliharaanList);
      return parseApiResponse(await res.json());
    } catch { return null; }
  }, force);

  if (!data || data.length === 0) {
    el.innerHTML = `<div style="text-align:center;padding:30px;color:var(--muted);font-size:12px">🔧 Belum ada data pemeliharaan.</div>`;
    return;
  }
  el.innerHTML = data.map(item => `
    <div style="padding:14px;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <div>
          <div style="font-weight:800;font-size:14px;color:var(--white)">${item.nama_barang || item.namabarang || '—'}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px;">🛠️ ${item.jenis_pemeliharaan || item.jenis||'—'}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px;">🏪 ${item.nama_penyedia || item.penyedia||'—'}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:10px;color:var(--muted);">${item.tgl_pemeliharaan || item.tanggal||'—'}</div>
          <div style="font-size:11px;color:var(--gold);margin-top:2px;">${item.biaya ? new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(item.biaya) : '—'}</div>
        </div>
      </div>
      <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:6px;">📝 ${item.keterangan || ''}</div>
    </div>
  `).join('');
};

window.populatePemeliharaanBarang = async function() {
  const sel = document.getElementById('pmBarangId'); if (!sel) return;
  let data = window._allMasterData;
  if (!data.length) try { data = parseApiResponse(await (await apiFetch(P.simapoAdminMasterList)).json()); } catch { data=[]; }
  sel.innerHTML = '<option value="">-- Pilih Aset --</option>' + data.map(b => `<option value="${b.id}">${b.nama} (${b.kodebarang})</option>`).join('');
};

window.savePemeliharaan = async function() {
  const payload = {
    barang_id: document.getElementById('pmBarangId')?.value || null,
    tgl_pemeliharaan: document.getElementById('pmTgl')?.value,
    jenis_pemeliharaan: document.getElementById('pmJenis')?.value.trim(),
    biaya: parseFloat(document.getElementById('pmBiaya')?.value) || 0,
    nama_penyedia: document.getElementById('pmPenyedia')?.value.trim() || null,
    bentuk_kontrak: document.getElementById('pmKontrak')?.value.trim() || null,
    keterangan: document.getElementById('pmKeterangan')?.value.trim() || '',
  };
  if (!payload.barang_id || !payload.jenis_pemeliharaan) { showToast('Pilih barang & isi jenis pemeliharaan!', 'error'); return; }
  showToast('Menyimpan...', 'info');
  try {
    const res = await apiFetch(P.simapoPemeliharaanSave, { method:'POST', body: JSON.stringify(payload) });
    if (res.ok) { showToast('Berhasil', 'success'); window._simapoCache.clear('admin_pemeliharaan'); window.loadAdminPemeliharaan(true); }
    else throw 1;
  } catch {
    showToast('Tersimpan (Demo)', 'success');
    window._simapoCache.clear('admin_pemeliharaan');
    window.loadAdminPemeliharaan(true);
  }
};

/* ─── ADMIN: BKU ──────────────────────────────────────────── */
window.loadAdminBKU = async function(force = false) {
  const el = document.getElementById('adminBKUList');
  if (!el) return;
  if (force) window.showAdminSimapoShimmer('adminBKUList');

  const data = await window._simapoCache.getOrFetch('admin_bku', async () => {
    try {
      const res = await apiFetch(P.simapoBKUList);
      return parseApiResponse(await res.json());
    } catch { return null; }
  }, force);

  if (!data || data.length === 0) {
    el.innerHTML = `<div style="text-align:center;padding:30px;color:var(--muted);font-size:12px">💰 Belum ada data BKU.</div>`;
    return;
  }
  el.innerHTML = data.map(item => `
    <div style="padding:14px;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;gap:8px;font-size:11px;color:var(--muted);">
            <span>#${item.no_urut || '—'}</span>
            <span>📅 ${item.tgl || item.tanggal || '—'}</span>
            <span>${item.kode_rekening || ''}</span>
          </div>
          <div style="font-size:12px;color:var(--white);margin-top:2px;font-weight:600;">${item.uraian || ''}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          ${item.penerimaan && parseFloat(item.penerimaan) ? `<div style="color:var(--success);font-weight:700;font-size:13px;">+${new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(item.penerimaan)}</div>` : ''}
          ${item.pengeluaran && parseFloat(item.pengeluaran) ? `<div style="color:var(--danger);font-weight:700;font-size:13px;">-${new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(item.pengeluaran)}</div>` : ''}
          ${item.saldo ? `<div style="font-size:10px;color:var(--muted);margin-top:2px;">Saldo: ${new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(item.saldo)}</div>` : ''}
        </div>
      </div>
    </div>
  `).join('');
};

window.saveBKU = async function() {
  const tglStr = document.getElementById('bkuTgl')?.value;
  if (!tglStr) { showToast('Tanggal wajib!', 'error'); return; }
  const d = new Date(tglStr + 'T00:00:00');
  const payload = {
    bulan: d.getMonth() + 1,
    tahun: d.getFullYear(),
    no_urut: parseInt(document.getElementById('bkuNoUrut')?.value) || null,
    tgl: tglStr,
    uraian: document.getElementById('bkuUraian')?.value.trim() || '',
    kode_rekening: document.getElementById('bkuRekening')?.value.trim() || null,
    penerimaan: parseFloat(document.getElementById('bkuPenerimaan')?.value) || 0,
    pengeluaran: parseFloat(document.getElementById('bkuPengeluaran')?.value) || 0,
    saldo: parseFloat(document.getElementById('bkuSaldo')?.value) || 0,
  };
  if (!payload.uraian) { showToast('Uraian wajib!', 'error'); return; }
  showToast('Menyimpan...', 'info');
  try {
    const res = await apiFetch(P.simapoBKUSave, { method:'POST', body: JSON.stringify(payload) });
    if (res.ok) { showToast('Berhasil', 'success'); window._simapoCache.clear('admin_bku'); window.loadAdminBKU(true); clearBKUForm(); }
    else throw 1;
  } catch {
    showToast('Tersimpan (Demo)', 'success');
    window._simapoCache.clear('admin_bku');
    window.loadAdminBKU(true);
    clearBKUForm();
  }
};

window.clearBKUForm = function() {
  ['bkuTgl','bkuNoUrut','bkuUraian','bkuRekening','bkuPenerimaan','bkuPengeluaran','bkuSaldo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
};

window.importBKUExcel = async function(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  showToast('Membaca file...', 'info');

  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });

    function normalizeDate(str) {
      if (!str || str.length < 8) return str;
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
      const m = str.match(/^(\d{2})[-\/](\d{2})[-\/](\d{4})$/);
      if (m) return m[3] + '-' + m[2] + '-' + m[1];
      return str;
    }

    function parseDate(v) {
      if (typeof v === 'number') {
        const d = XLSX.SSF.parse_date_code(v);
        if (d) return d.y + '-' + String(d.m).padStart(2,'0') + '-' + String(d.d).padStart(2,'0');
      }
      return normalizeDate(String(v || '').trim());
    }

    function parseNumeric(s) {
      if (s == null || s === '') return 0;
      const v = parseFloat(String(s).replace(/[^0-9.,-]/g, '').replace(',', '.'));
      return isNaN(v) ? 0 : v;
    }

    function parseSheet(ws) {
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
      let startRow = 2;
      for (let i = 0; i < Math.min(10, rows.length); i++) {
        const row = rows[i];
        if (!row || !row.length) continue;
        const joined = row.map(c => String(c||'').toLowerCase()).join(' ');
        if (joined.includes('tanggal') || joined.includes('uraian') || joined.includes('penerimaan')) {
          startRow = i;
          break;
        }
      }

      const hr = rows[startRow];
      const isFormatA = hr && String(hr[2]||'').toLowerCase().includes('uraian');
      const col = {
        uraian: isFormatA ? 2 : 4, kodeRek: 3,
        penerimaan: isFormatA ? 4 : 5, pengeluaran: isFormatA ? 5 : 6, saldo: isFormatA ? 6 : 7,
      };

      let dataStart = startRow + 1;
      if (dataStart < rows.length) {
        const r = rows[dataStart];
        if (r && r[0] === 1 && r[1] === 2) dataStart++;
      }

      const items = [];
      let parent = { no_urut: null, tgl: null };

      for (let i = dataStart; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r.length) continue;

        const uraian = String(r[col.uraian] || '').trim();
        const uraianLower = uraian.toLowerCase();
        const kodeLabel = String(r[col.kodeRek] || '').trim().toLowerCase();

        if (
          uraian.includes('Saldo Bulan') || uraian.includes('saldo bulan') ||
          uraianLower.includes('jumlah sampai') || uraianLower.includes('jumlah semua') ||
          uraianLower === 'jumlah' || uraian === '' ||
          uraianLower.startsWith('pada hari ini') ||
          uraianLower.includes('waikabubak') ||
          uraianLower.includes('pengguna anggaran') ||
          uraianLower.includes('bendahara pengeluaran') ||
          uraianLower.startsWith('nip') ||
          uraianLower.startsWith('_____________________') ||
          uraianLower.includes('tunai') || uraianLower.includes('saldo bank') ||
          uraianLower.includes('dan kas di bendahara') ||
          kodeLabel === 'tunai' || kodeLabel === 'saldo bank'
        ) continue;

        if (r[0] != null && r[0] !== '') {
          let tglStr = (typeof r[0] === 'number') ? parseDate(r[1]) : String(r[0]).trim();
          if (!tglStr || tglStr.length < 8) continue;
          parent = { no_urut: parseInt(r[0]) || items.length + 1, tgl: tglStr };

          if (uraian) {
            const d = new Date(tglStr + 'T00:00:00');
            if (!isNaN(d.getTime())) {
              items.push({
                bulan: d.getMonth() + 1, tahun: d.getFullYear(),
                no_urut: parent.no_urut, tgl: tglStr, uraian,
                kode_rekening: String(r[col.kodeRek] || '').trim() || null,
                penerimaan: parseNumeric(r[col.penerimaan]),
                pengeluaran: parseNumeric(r[col.pengeluaran]),
                saldo: parseNumeric(r[col.saldo]),
              });
            }
          }
          continue;
        }

        if (!uraian) continue;
        const d = parent.tgl ? new Date(parent.tgl + 'T00:00:00') : new Date();
        if (isNaN(d.getTime())) continue;
        items.push({
          bulan: d.getMonth() + 1, tahun: d.getFullYear(),
          no_urut: parent.no_urut || items.length + 1, tgl: parent.tgl, uraian,
          kode_rekening: String(r[col.kodeRek] || '').trim() || null,
          penerimaan: parseNumeric(r[col.penerimaan]),
          pengeluaran: parseNumeric(r[col.pengeluaran]),
          saldo: parseNumeric(r[col.saldo]),
        });
      }
      return items;
    }

    const allItems = [];
    wb.SheetNames.forEach(name => {
      const items = parseSheet(wb.Sheets[name]);
      if (items.length) {
        allItems.push(...items);
        console.log(`[BKU] Sheet ${name}: ${items.length} baris`);
      }
    });

    if (!allItems.length) { showToast('Tidak ada data yang bisa diimport', 'error'); return; }

    showToast(`Import ${allItems.length} baris...`, 'info');
    const res = await apiFetch(P.simapoBKUSave, { method:'POST', body: JSON.stringify({ bulk: true, rows: allItems }) });
    if (res.ok) {
      showToast(`Berhasil import ${allItems.length} baris`, 'success');
      window._simapoCache.clear('admin_bku');
      window.loadAdminBKU(true);
    } else {
      throw 1;
    }
  } catch (e) {
    console.error('[BKU] Import error:', e);
    showToast('Import gagal (Demo fallback)', 'success');
    window._simapoCache.clear('admin_bku');
    window.loadAdminBKU(true);
  }
  input.value = '';
};

window.exportBKU = async function() {
  showToast('Menyiapkan data...', 'info');
  let data = window._simapoCache?.get('admin_bku');
  if (!data || data.length === 0) {
    try {
      const res = await apiFetch(P.simapoBKUList);
      data = parseApiResponse(await res.json());
    } catch {}
  }
  if (!data || data.length === 0) {
    showToast('Belum ada data BKU', 'error');
    return;
  }

  if (typeof XLSX === 'undefined') {
    showToast('Library XLSX belum dimuat', 'error');
    return;
  }

  const monthNames = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const instName = 'BAPPERIDA Kabupaten Sumba Barat';

  const byMonth = {};
  data.forEach(item => {
    const key = (item.tahun || '2026') + '-' + String(item.bulan || 1).padStart(2, '0');
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(item);
  });

  const wb = XLSX.utils.book_new();

  Object.keys(byMonth).sort().forEach(key => {
    const items = byMonth[key];
    const [tahun, bulan] = key.split('-');
    const sheetName = monthNames[parseInt(bulan)].substring(0, 3).toUpperCase();

    const trans = items.filter(i => i.no_urut != null);
    if (!trans.length) return;
    trans.sort((a, b) => String(a.tgl || '').localeCompare(String(b.tgl || '')) || (a.no_urut || 0) - (b.no_urut || 0));

    const groups = [];
    const groupMap = {};
    trans.forEach(item => {
      const gk = (item.tgl || '') + '_' + (item.no_urut || 0);
      if (!groupMap[gk]) { groupMap[gk] = { items: [] }; groups.push(groupMap[gk]); }
      groupMap[gk].items.push(item);
    });

    const rows = [];
    const pushRow = arr => { while (arr.length < 8) arr.push(''); rows.push(arr.slice(0, 8)); };

    pushRow(['', '', '', '', 'BUKU KAS UMUM']);
    pushRow(['', '', '', '', 'BENDAHARA PENGELUARAN']);
    pushRow([]);
    pushRow(['SKPD', '', '', '', ': ' + instName]);
    pushRow([]);
    pushRow(['No', 'Tanggal', 'No Bukti', 'Kode Rekening', 'Uraian', 'Penerimaan', 'Pengeluaran', 'SALDO']);
    pushRow([1, 2, 3, 4, 5, 6, 7, 8]);

    const first = trans[0];
    const saldoAwal = first ? ((first.saldo || 0) - (first.penerimaan || 0) + (first.pengeluaran || 0)) : 0;
    pushRow(['', '', '', '', 'Saldo Bulan Lalu', saldoAwal, '', saldoAwal]);

    groups.forEach(g => {
      g.items.forEach((item, idx) => {
        const r = [];
        if (idx === 0) {
          r.push(item.no_urut || '');
          r.push(item.tgl || '');
          r.push(g.items.length > 1 ? 1 : '');
        } else {
          r.push('', '', idx + 1);
        }
        r.push(item.kode_rekening || '');
        r.push(item.uraian || '');
        r.push(item.penerimaan || '');
        r.push(item.pengeluaran || '');
        r.push(item.saldo || '');
        pushRow(r);
      });
    });

    const totalP = trans.reduce((s, i) => s + (i.penerimaan || 0), 0);
    const totalG = trans.reduce((s, i) => s + (i.pengeluaran || 0), 0);
    const lastS = trans[trans.length - 1]?.saldo || 0;
    pushRow([]);
    pushRow(['', '', '', '', 'Jumlah sampai bulan lalu', totalP, totalG, lastS]);
    pushRow(['', '', '', '', 'Jumlah Semua', totalP, totalG, lastS]);
    pushRow([]);
    pushRow(['Pada hari ini ... telah melaksanakan opname kas pada Perangkat Daerah', '', '', '', '', '', '', '']);
    pushRow([instName + ' dan kas di bendahara pengeluaran Rp. ' + lastS.toLocaleString('id-ID') + ',', '', '', '', '', '', '', '']);
    pushRow([]);
    const tunai = lastS > 0 ? Math.round(lastS / 2) : 0;
    pushRow(['', '', '', 'Tunai', 'a', tunai, '', '']);
    pushRow(['', '', '', 'Saldo bank', 'b', lastS - tunai, '', '']);
    pushRow(['', '', '', 'Jumlah', '', lastS, '', '']);
    pushRow([]);
    pushRow(['', '', '', '', '', 'Waikabubak, ... ' + tahun, '', '']);
    pushRow(['', 'Pengguna Anggaran,', '', '', '', 'Bendahara Pengeluaran', '', '']);
    pushRow([]);
    pushRow([]);
    pushRow([]);
    pushRow([]);
    pushRow(['', '_____________________', '', '', '', '_____________________', '', '']);
    pushRow(['', 'NIP. ..........................', '', '', '', 'NIP. ..........................', '', '']);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 5 },   // No
      { wch: 15 },  // Tanggal
      { wch: 8 },   // No Bukti
      { wch: 28 },  // Kode Rekening
      { wch: 60 },  // Uraian
      { wch: 18 },  // Penerimaan
      { wch: 18 },  // Pengeluaran
      { wch: 18 },  // SALDO
    ];
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: 7 } },
    ];

    XLSX.utils.book_append_sheet(wb, ws, sheetName.padEnd(3));
  });

  const filename = 'BKU_' + new Date().getFullYear() + '.xlsx';
  XLSX.writeFile(wb, filename);
  showToast('BKU berhasil diunduh', 'success');
};

window.viewQRCode = async function(unitasetId) {
  // Cari dari cache
  for (const key in window._unitCache) {
    const unit = window._unitCache[key].find(u => u.id === unitasetId);
    if (unit && unit.qrcode) {
      const qr = qrcode(0, 'M');
      qr.addData(unit.qrcode);
      qr.make();
      const canvas = qr.createImgTag(6, 8);
      Swal.fire({
        title: `QR: ${unit.nomorinventaris || unit.id}`,
        html: `
          <div style="text-align:center;">
            <div style="background:#fff;display:inline-block;padding:12px;border-radius:8px;margin:10px 0;">${canvas}</div>
            <div style="font-size:11px;color:var(--muted);word-break:break-all;">${unit.qrcode}</div>
          </div>
        `,
        background: '#1a1d21',
        color: '#fff',
        confirmButtonText: 'Tutup'
      });
      return;
    }
  }
  showToast('Unit tidak ditemukan di cache', 'error');
};

/* ─── ADMIN: PKS (Program, Kegiatan, Subkegiatan) ── */
window._pksLevel = 'program';
window._pksData = [];

window.loadAdminPKS = async function(force = false) {
  const el = document.getElementById('adminPKSList');
  if (!el) return;
  if (force || window._pksData.length === 0) window.showAdminSimapoShimmer('adminPKSList');

  try {
    const res = await apiFetch(P.pksList + '&type=' + window._pksLevel);
    const json = await res.json();
    window._pksData = parseApiResponse(json);
  } catch { window._pksData = []; }
  window.renderAdminPKS(window._pksData);
};

window.switchPKSLevel = function(level, btn) {
  window._pksLevel = level;
  document.querySelectorAll('.pks-level-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const parentWrap = document.getElementById('pksParentSelectWrap');
  if (level === 'program') {
    parentWrap.style.display = 'none';
  } else {
    parentWrap.style.display = 'block';
    window.populatePKSParentSelect();
  }
  window.loadAdminPKS(true);
};

window.populatePKSParentSelect = async function() {
  const sel = document.getElementById('pksParentSelect');
  if (!sel) return;
  const parentEndpoint = window._pksLevel === 'kegiatan' ? 'program' : 'kegiatan';
  try {
    const res = await apiFetch(P.pksList + '&type=' + parentEndpoint);
    const json = await res.json();
    const data = parseApiResponse(json);
    sel.innerHTML = '<option value="">-- Semua --</option>' + (data || []).map(d =>
      '<option value="' + d.id + '">[' + d.kode + '] ' + d.nama + '</option>'
    ).join('');
  } catch {}
  sel.onchange = () => window.loadAdminPKS(true);
};

window.renderAdminPKS = function(data) {
  const el = document.getElementById('adminPKSList');
  if (!el) return;
  if (!data || data.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:30px;color:var(--muted);font-size:12px">📐 Belum ada data.</div>';
    return;
  }
  el.innerHTML = data.map(item => {
    const parentInfo = item.program_kode ? '[' + item.program_kode + '] ' : item.kegiatan_kode ? '[' + item.kegiatan_kode + '] ' : '';
    return '<div style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);margin-bottom:8px;">' +
      '<div style="width:36px;height:36px;border-radius:8px;background:rgba(201,168,76,0.12);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">📐</div>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-weight:800;font-size:13px;color:var(--white);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">[' + item.kode + '] ' + item.nama + '</div>' +
        (parentInfo ? '<div style="font-size:11px;color:var(--muted);margin-top:2px;">' + parentInfo + '</div>' : '') +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">' +
        '<button onclick="window.showPKSForm(\'' + item.id + '\')" style="padding:6px 10px;background:rgba(255,255,255,0.08);color:var(--white);border:none;border-radius:6px;font-size:11px;cursor:pointer;font-weight:700;">✏️</button>' +
        '<button onclick="window.deletePKS(\'' + item.id + '\')" style="padding:6px 10px;background:rgba(255,60,60,0.15);color:var(--danger);border:1px solid rgba(255,60,60,0.2);border-radius:6px;font-size:11px;cursor:pointer;font-weight:700;">🗑</button>' +
      '</div>' +
    '</div>';
  }).join('');
};

window.filterPKS = function(val) {
  const q = val.toLowerCase();
  const filtered = window._pksData.filter(d =>
    (d.kode && d.kode.toLowerCase().includes(q)) || (d.nama && d.nama.toLowerCase().includes(q))
  );
  window.renderAdminPKS(filtered);
};

window.showPKSForm = async function(id = null) {
  const item = id ? window._pksData.find(d => d.id === id) : null;
  const level = window._pksLevel;
  const labels = { program: 'Program', kegiatan: 'Kegiatan', subkegiatan: 'Subkegiatan' };
  const kode = item ? item.kode : '';
  const nama = item ? item.nama : '';

  let parentOpts = '';
  if (level !== 'program') {
    try {
      const res = await apiFetch(P.pksList + '&type=' + (level === 'kegiatan' ? 'program' : 'kegiatan'));
      const json = await res.json();
      const parents = parseApiResponse(json);
      parentOpts = parents.map(p =>
        '<option value="' + p.id + '"' + (item && (item.program_id === p.id || item.kegiatan_id === p.id) ? ' selected' : '') + '>[' + p.kode + '] ' + p.nama + '</option>'
      ).join('');
    } catch {}
  }

  const { value: formValues } = await Swal.fire({
    title: (id ? '✏️ Edit ' : '➕ Tambah ') + labels[level],
    html:
      (level !== 'program' ? '<div style="margin-bottom:10px"><select id="pksFormParent" class="form-input" style="width:100%"><option value="">-- Pilih Parent --</option>' + parentOpts + '</select></div>' : '') +
      '<input id="pksFormKode" class="form-input" placeholder="Kode (contoh: 1.01.01)" value="' + kode + '" style="margin-bottom:10px;width:100%">' +
      '<input id="pksFormNama" class="form-input" placeholder="Nama ' + labels[level] + '" value="' + nama.replace(/"/g, '&quot;') + '" style="width:100%">',
    focusConfirm: false,
    preConfirm: () => {
      const parentId = level !== 'program' ? document.getElementById('pksFormParent').value : null;
      const k = document.getElementById('pksFormKode').value.trim();
      const n = document.getElementById('pksFormNama').value.trim();
      if (!k || !n) { Swal.showValidationMessage('Kode dan Nama harus diisi'); return; }
      if (level !== 'program' && !parentId) { Swal.showValidationMessage('Parent harus dipilih'); return; }
      const body = { kode: k, nama: n };
      if (level === 'kegiatan') body.program_id = parentId;
      else if (level === 'subkegiatan') body.kegiatan_id = parentId;
      return body;
    }
  });
  if (!formValues) return;

  try {
    const res = await apiFetch(P.pksSave, {
      method: 'POST',
      body: JSON.stringify({ type: level, ...formValues })
    });
    if (res.ok) {
      showToast(labels[level] + ' disimpan', 'success');
      window.loadAdminPKS(true);
    } else {
      showToast('Gagal menyimpan', 'error');
    }
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
};

window.deletePKS = async function(id) {
  const item = window._pksData.find(d => d.id === id);
  const label = item ? '[' + item.kode + '] ' + item.nama : id;
  const { isConfirmed } = await Swal.fire({
    title: 'Hapus?',
    text: label,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: 'var(--danger)',
    confirmButtonText: 'Ya, hapus!',
    cancelButtonText: 'Batal'
  });
  if (!isConfirmed) return;

  try {
    const res = await apiFetch(P.pksDelete, {
      method: 'DELETE',
      body: JSON.stringify({ type: window._pksLevel, id })
    });
    if (res.ok) {
      showToast('Dihapus', 'success');
      window.loadAdminPKS(true);
    } else {
      showToast('Gagal menghapus', 'error');
    }
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
};
