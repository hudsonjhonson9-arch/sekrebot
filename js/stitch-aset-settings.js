/* Stitch Manajemen Aset — Tab Router, Real CRUD, Pemeliharaan, Tiket/Pinjam, & Pengaturan SIMAPO */
(function (w, d) {
  'use strict';

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

  let _activeTab = 'inventaris';
  let _bastData = { pegawai: [], ruangan: [], aset: [] };
  let _barangList = [];
  let _kategoriList = [];

  const TABS = ['inventaris', 'pemeliharaan', 'tiket-pinjam', 'pengaturan'];
  const CRUMBS = {
    inventaris: 'Inventaris & Aset • Daftar KIR',
    pemeliharaan: 'Inventaris & Aset • Pemeliharaan',
    'tiket-pinjam': 'Inventaris & Aset • Tiket & Peminjaman',
    pengaturan: 'Inventaris & Aset • Pengaturan SIMAPO',
  };

  function resolveTab() {
    const h = String(w.location.hash || '').replace(/^#/, '').toLowerCase();
    return TABS.includes(h) ? h : 'inventaris';
  }

  function togglePanel(id, show) {
    const el = d.getElementById(id);
    if (!el) return;
    el.classList.toggle('hidden', !show);
    el.classList.toggle('flex', show);
  }

  function refreshPickers(root) {
    if (!root || !w.StitchPicker) return;
    root.querySelectorAll('select').forEach((s) => {
      w.StitchPicker.enhanceSelect?.(s);
      w.StitchPicker.refresh?.(s);
    });
    root.querySelectorAll('input[type="date"]').forEach((i) => w.StitchPicker.enhanceDate?.(i));
  }

  function switchTab(tab, updateHash = true) {
    const next = TABS.includes(tab) ? tab : 'inventaris';
    _activeTab = next;
    if (updateHash && w.location.hash !== '#' + next) {
      try { w.history.replaceState(null, '', '#' + next); } catch (_) { w.location.hash = next; }
      w.dispatchEvent(new HashChangeEvent('hashchange'));
    }

    togglePanel('asetPanelInventaris', next === 'inventaris');
    togglePanel('asetPanelPemeliharaan', next === 'pemeliharaan');
    togglePanel('asetPanelTiketPinjam', next === 'tiket-pinjam');
    togglePanel('asetPanelPengaturan', next === 'pengaturan');

    d.querySelectorAll('[data-aset-tab-btn]').forEach((btn) => {
      const act = btn.dataset.asetTabBtn === next;
      btn.className = act
        ? 'inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2563eb] text-white text-xs font-bold shadow-sm transition-all cursor-pointer'
        : 'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface text-xs font-semibold transition-all cursor-pointer';
    });

    const crumb = d.getElementById('asetBreadcrumbTitle');
    if (crumb) crumb.textContent = CRUMBS[next];

    if (next === 'pemeliharaan') loadPemeliharaan();
    if (next === 'tiket-pinjam') { loadTiketList(); loadPinjamFullTable(); }
    if (next === 'pengaturan') loadPengaturanAll();
  }

  function formatRp(n) {
    return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
  }

  /* ── REAL QR CODE RENDERER FOR STIKER KIR ─────────────────────────────── */
  function renderStickerQr(codeText) {
    const box = d.getElementById('asetStickerQrBox');
    if (!box) return;
    const text = String(codeText || 'SIMAPO-KIR');
    if (typeof w.QRCode === 'function') {
      box.innerHTML = '';
      try {
        new w.QRCode(box, {
          text,
          width: 72,
          height: 72,
          colorDark: '#0f172a',
          colorLight: '#ffffff',
          correctLevel: w.QRCode.CorrectLevel ? w.QRCode.CorrectLevel.M : 0,
        });
        return;
      } catch (_) {}
    }
  }

  /* ── TAMBAH ASET / KIB BARU (REAL POST /api/simapo/bast-import-unit) ──── */
  function openTambahAsetModal() {
    const m = d.getElementById('modalTambahAsetUnit');
    if (!m) return;
    m.querySelectorAll('input').forEach((el) => {
      if (el.dataset.asetAddField === 'tahunperolehan') el.value = String(new Date().getFullYear());
      else if (el.dataset.asetAddField === 'satuan') el.value = 'Unit';
      else el.value = '';
    });
    m.classList.remove('hidden');
    m.classList.add('flex');
    refreshPickers(m);
  }

  function closeTambahAsetModal() {
    const m = d.getElementById('modalTambahAsetUnit');
    if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
  }

  async function submitTambahAset(btnEl) {
    const m = d.getElementById('modalTambahAsetUnit');
    if (!m) return;
    const v = (k) => (m.querySelector(`[data-aset-add-field="${k}"]`)?.value || '').trim();
    const nama = v('nama');
    const kodebarang = v('kodebarang');
    const nomorinventaris = v('nomorinventaris');
    const satuan = v('satuan') || 'Unit';
    const tahunperolehan = v('tahunperolehan') || String(new Date().getFullYear());
    const nilaiperolehan = Number(v('nilaiperolehan') || 0);

    if (!nama || !kodebarang) {
      if (w.Swal) w.Swal.fire('Perhatian', 'Nama barang dan kode barang wajib diisi.', 'warning');
      return;
    }

    const orig = btnEl ? btnEl.innerHTML : '';
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Menyimpan...'; }
    try {
      const r = await fetch('/api/simapo/bast-import-unit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nama, kodebarang, nomorinventaris, satuan, tahunperolehan, nilaiperolehan }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.message || `HTTP ${r.status}`);
      closeTambahAsetModal();
      if (w.Swal) w.Swal.fire({ icon: 'success', title: 'Unit Aset Ditambahkan', text: `"${nama}" berhasil dicatat di SIMAPO.` });
      if (typeof w.loadRealAsetData === 'function') w.loadRealAsetData();
    } catch (err) {
      if (w.Swal) w.Swal.fire({ icon: 'error', title: 'Gagal Menambah Aset', text: err?.message || 'Koneksi terganggu.' });
    } finally {
      if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = orig; }
    }
  }

  /* ── EDIT / ASSIGN UNIT ASET (POST /api/simapo/bast-assign) ───────────── */
  async function openAssignUnitModal(asset) {
    if (!asset || !w.Swal) return;
    await ensureBastData();
    const ruangOpts = ['<option value="">— Tanpa Perubahan Ruangan —</option>']
      .concat((_bastData.ruangan || []).map((r) => `<option value="${esc(r.id)}" ${String(r.id) === String(asset.ruangan_id || '') ? 'selected' : ''}>${esc(r.nama)}</option>`))
      .join('');
    const pegOpts = ['<option value="">— Inventaris Umum / Tanpa Pemegang —</option>']
      .concat((_bastData.pegawai || []).map((p) => `<option value="${esc(p.id)}" ${String(p.id) === String(asset.pegawai_id || '') ? 'selected' : ''}>${esc(p.nama)} (${esc(p.nip || '-')})</option>`))
      .join('');

    const { value: fv } = await w.Swal.fire({
      title: `Atur Unit: ${esc(asset.nama_barang || 'Aset')}`,
      width: 560,
      html: `
        <div class="text-left grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div class="sm:col-span-2">
            <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Lokasi Ruangan (KIR)</label>
            <select id="swAsRuang" class="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">${ruangOpts}</select>
          </div>
          <div class="sm:col-span-2">
            <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Pemegang / Penanggung Jawab ASN</label>
            <select id="swAsPeg" class="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">${pegOpts}</select>
          </div>
          <div>
            <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Kondisi Fisik</label>
            <select id="swAsKondisi" class="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
              <option value="Baik" ${/baik/i.test(asset.kondisi || '') && !/kurang/i.test(asset.kondisi || '') ? 'selected' : ''}>Baik</option>
              <option value="Kurang Baik" ${/kurang/i.test(asset.kondisi || '') ? 'selected' : ''}>Kurang Baik</option>
              <option value="Rusak Berat" ${/rusak/i.test(asset.kondisi || '') ? 'selected' : ''}>Rusak Berat</option>
            </select>
          </div>
          <div>
            <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Nomor Polisi (Opsional)</label>
            <input id="swAsNopol" type="text" value="${esc(asset.no_polisi || '')}" placeholder="ED xxxx WB" class="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono">
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Simpan Perubahan',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#2563eb',
      preConfirm: () => ({
        aset_id: asset.id,
        ruangan_id: d.getElementById('swAsRuang')?.value || '',
        pegawai_id: d.getElementById('swAsPeg')?.value || '',
        kondisi: d.getElementById('swAsKondisi')?.value || 'Baik',
        no_polisi: (d.getElementById('swAsNopol')?.value || '').trim(),
      }),
    });

    if (!fv) return;
    try {
      const r = await fetch('/api/simapo/bast-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fv),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.message || `HTTP ${r.status}`);
      w.Swal.fire({ icon: 'success', title: 'Unit Diperbarui', text: 'Pengaturan ruangan, pemegang, dan kondisi unit berhasil disimpan.' });
      if (typeof w.loadRealAsetData === 'function') w.loadRealAsetData();
    } catch (err) {
      w.Swal.fire({ icon: 'error', title: 'Gagal Menyimpan', text: err?.message || 'Koneksi terganggu.' });
    }
  }

  /* ── TAB 2: PEMELIHARAAN ASET ─────────────────────────────────────────── */
  async function loadPemeliharaan() {
    const tbody = d.getElementById('asetPemeliharaanBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="py-10 text-center text-xs text-slate-400">Memuat riwayat pemeliharaan aset...</td></tr>';
    try {
      const [pmRes, brRes] = await Promise.all([
        fetch('/api/stitch/aset/pemeliharaan'),
        _barangList.length ? Promise.resolve(null) : fetch('/api/stitch/aset/barang'),
      ]);
      const pmJson = await pmRes.json().catch(() => ({}));
      if (brRes) {
        const brJson = await brRes.json().catch(() => ({}));
        if (brJson.ok && Array.isArray(brJson.data)) _barangList = brJson.data;
      }
      const rows = Array.isArray(pmJson.data) ? pmJson.data : [];
      const cnt = d.getElementById('asetPemeliharaanCount');
      if (cnt) cnt.textContent = `${rows.length} catatan`;
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="py-10 text-center text-xs text-slate-400">Belum ada riwayat pemeliharaan aset tercatat.</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map((r) => `
        <tr class="border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
          <td class="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">${esc(String(r.tgl_pemeliharaan || '-').slice(0, 10))}</td>
          <td class="px-4 py-3 text-xs font-bold text-slate-900 dark:text-white">${esc(r.nama_barang || '-')}<div class="text-[10px] font-mono font-normal text-slate-400">${esc(r.kodebarang || '')}</div></td>
          <td class="px-4 py-3 text-xs text-slate-700 dark:text-slate-300">${esc(r.jenis_pemeliharaan || '-')}</td>
          <td class="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">${esc(r.nama_penyedia || '-')}<div class="text-[10px] text-slate-400">${esc(r.bentuk_kontrak || '')}</div></td>
          <td class="px-4 py-3 font-mono text-xs font-bold text-primary whitespace-nowrap text-right">${esc(formatRp(r.biaya))}</td>
          <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 max-w-[220px] truncate">${esc(r.keterangan || '-')}</td>
        </tr>
      `).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" class="py-10 text-center text-xs text-rose-500">Gagal memuat: ${esc(err?.message)}</td></tr>`;
    }
  }

  async function openCatatPemeliharaanModal() {
    if (!w.Swal) return;
    if (!_barangList.length) {
      try {
        const r = await fetch('/api/stitch/aset/barang');
        const j = await r.json().catch(() => ({}));
        if (j.ok && Array.isArray(j.data)) _barangList = j.data;
      } catch (_) {}
    }
    const opts = _barangList.map((b) => `<option value="${esc(b.id)}">${esc(b.nama_barang)} (${esc(b.kodebarang || '-')})</option>`).join('');
    const today = new Date().toISOString().slice(0, 10);
    const { value: fv } = await w.Swal.fire({
      title: 'Catat Pemeliharaan Aset',
      width: 560,
      html: `
        <div class="text-left grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div class="sm:col-span-2">
            <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Barang / Aset *</label>
            <select id="swPmBarang" class="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">${opts}</select>
          </div>
          <div>
            <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Tanggal</label>
            <input id="swPmTgl" type="date" value="${today}" class="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono">
          </div>
          <div>
            <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Biaya (Rp)</label>
            <input id="swPmBiaya" type="number" value="0" class="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono">
          </div>
          <div>
            <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Jenis Pemeliharaan</label>
            <input id="swPmJenis" type="text" value="Servis Berkala" class="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
          </div>
          <div>
            <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Penyedia / Bengkel</label>
            <input id="swPmPenyedia" type="text" placeholder="Nama bengkel / vendor" class="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
          </div>
          <div class="sm:col-span-2">
            <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Keterangan</label>
            <textarea id="swPmKet" rows="2" placeholder="Uraian pekerjaan..." class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"></textarea>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Simpan Pemeliharaan',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#2563eb',
      preConfirm: () => ({
        barang_id: d.getElementById('swPmBarang')?.value || '',
        tgl_pemeliharaan: d.getElementById('swPmTgl')?.value || today,
        biaya: Number(d.getElementById('swPmBiaya')?.value || 0),
        jenis_pemeliharaan: (d.getElementById('swPmJenis')?.value || '').trim(),
        nama_penyedia: (d.getElementById('swPmPenyedia')?.value || '').trim(),
        keterangan: (d.getElementById('swPmKet')?.value || '').trim(),
      }),
    });
    if (!fv || !fv.barang_id) return;
    try {
      const r = await fetch('/api/stitch/aset/pemeliharaan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fv),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.message || `HTTP ${r.status}`);
      w.Swal.fire({ icon: 'success', title: 'Tersimpan', text: 'Kartu pemeliharaan berhasil dicatat.' });
      loadPemeliharaan();
    } catch (err) {
      w.Swal.fire({ icon: 'error', title: 'Gagal', text: err?.message || 'Koneksi terganggu.' });
    }
  }

  /* ── TAB 3: TIKET KERUSAKAN & PEMINJAMAN ──────────────────────────────── */
  async function loadTiketList() {
    const tbody = d.getElementById('asetTiketBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-xs text-slate-400">Memuat tiket kerusakan...</td></tr>';
    try {
      const r = await fetch('/api/simapo/admin-tiket-list');
      const j = await r.json().catch(() => ({}));
      const items = Array.isArray(j.data) ? j.data : [];
      if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-xs text-slate-400">Tidak ada tiket kerusakan aset saat ini.</td></tr>';
        return;
      }
      tbody.innerHTML = items.map((t) => `
        <tr class="border-b border-slate-100 dark:border-slate-800/80">
          <td class="px-4 py-3 font-mono text-xs font-bold text-slate-900 dark:text-white whitespace-nowrap">${esc(t.nomortiket || t.id)}<div class="text-[10px] font-normal text-slate-400">${esc(t.createdat || '')}</div></td>
          <td class="px-4 py-3 text-xs font-semibold text-slate-800 dark:text-slate-200">${esc(t.judul || '-')}<div class="text-[11px] font-normal text-slate-500">${esc(t.deskripsi || '')}</div></td>
          <td class="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">${esc(t.nama_pelapor || t.userid || '-')}<div class="text-[10px] text-slate-400">${esc(t.lokasi || '')}</div></td>
          <td class="px-4 py-3 whitespace-nowrap"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-950/60 text-[#2563eb] dark:text-blue-300">${esc(t.status || 'MENUNGGU')}</span></td>
          <td class="px-4 py-3 text-right whitespace-nowrap">
            <div class="inline-flex gap-1">
              <button type="button" onclick="window.AsetSettings?.updateTiketStatus('${esc(t.id)}','DIPROSES')" class="px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 text-[11px] font-bold cursor-pointer">Proses</button>
              <button type="button" onclick="window.AsetSettings?.updateTiketStatus('${esc(t.id)}','SELESAI')" class="px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold cursor-pointer">Selesai</button>
            </div>
          </td>
        </tr>
      `).join('');
    } catch (_) {
      tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-xs text-slate-400">Akses tiket khusus Pengelola Barang / Admin SIMAPO.</td></tr>';
    }
  }

  async function updateTiketStatus(id, status) {
    try {
      const r = await fetch('/api/simapo/admin-tiket-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.message || `HTTP ${r.status}`);
      loadTiketList();
    } catch (err) {
      if (w.Swal) w.Swal.fire('Gagal', err?.message || 'Tidak dapat memperbarui tiket.', 'error');
    }
  }

  async function loadPinjamFullTable() {
    const tbody = d.getElementById('asetPinjamFullBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-xs text-slate-400">Memuat daftar peminjaman unit...</td></tr>';
    try {
      const r = await fetch('/api/simapo/admin-pinjam-list');
      const j = await r.json().catch(() => ({}));
      const items = Array.isArray(j.data) ? j.data : [];
      if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-xs text-slate-400">Belum ada riwayat peminjaman unit.</td></tr>';
        return;
      }
      tbody.innerHTML = items.map((p) => {
        const st = String(p.status || 'MENUNGGU').toUpperCase();
        return `
          <tr class="border-b border-slate-100 dark:border-slate-800/80">
            <td class="px-4 py-3 text-xs font-bold text-slate-900 dark:text-white">${esc(p.nama_peminjam || p.userid)}</td>
            <td class="px-4 py-3 text-xs text-slate-800 dark:text-slate-200">${esc(p.nama_barang || '-')}<div class="text-[10px] font-mono text-slate-400">${esc(p.kodebarang || '')}</div></td>
            <td class="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">${esc(p.tanggalmulai || '-')} s/d ${esc(p.tanggalselesai || '-')}</td>
            <td class="px-4 py-3 whitespace-nowrap"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">${esc(st)}</span></td>
            <td class="px-4 py-3 text-right whitespace-nowrap">
              <div class="inline-flex gap-1">
                ${st === 'MENUNGGU' ? `<button type="button" onclick="window.handleAdminPinjamAction?.('${esc(p.id)}','DIPINJAM').then(()=>window.AsetSettings?.loadPinjamFullTable())" class="px-2 py-1 rounded-lg bg-[#2563eb] text-white text-[11px] font-bold cursor-pointer">Setujui</button><button type="button" onclick="window.handleAdminPinjamAction?.('${esc(p.id)}','DITOLAK').then(()=>window.AsetSettings?.loadPinjamFullTable())" class="px-2 py-1 rounded-lg bg-rose-50 text-rose-600 text-[11px] font-bold cursor-pointer">Tolak</button>` : ''}
                ${st === 'DIPINJAM' ? `<button type="button" onclick="window.handleAdminPinjamAction?.('${esc(p.id)}','DIKEMBALIKAN').then(()=>window.AsetSettings?.loadPinjamFullTable())" class="px-2 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold cursor-pointer">Kembalikan</button>` : ''}
              </div>
            </td>
          </tr>
        `;
      }).join('');
    } catch (_) {
      tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-xs text-slate-400">Akses peminjaman khusus Pengelola Barang / Admin SIMAPO.</td></tr>';
    }
  }

  /* ── TAB 4: PENGATURAN ASET (RUANGAN KIR, PEJABAT BAST, KATEGORI) ─────── */
  async function ensureBastData(force = false) {
    if (_bastData.ruangan.length && !force) return _bastData;
    try {
      const r = await fetch('/api/simapo/bast-list');
      const j = await r.json().catch(() => ({}));
      if (j.ok && j.data) _bastData = j.data;
    } catch (_) {}
    return _bastData;
  }

  async function loadPengaturanAll() {
    await Promise.all([
      ensureBastData(true).then(renderRuanganTable),
      loadPejabatSettings(),
      loadKategoriList(),
    ]);
  }

  function renderRuanganTable() {
    const tbody = d.getElementById('asetRuanganBody');
    if (!tbody) return;
    const list = _bastData.ruangan || [];
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-xs text-slate-400">Belum ada ruangan KIR terdaftar.</td></tr>';
      return;
    }
    tbody.innerHTML = list.map((r, i) => `
      <tr class="border-b border-slate-100 dark:border-slate-800/80">
        <td class="px-4 py-2.5 font-mono text-xs font-bold text-primary">${esc(r.kode || '-')}</td>
        <td class="px-4 py-2.5 text-xs font-semibold text-slate-900 dark:text-white">${esc(r.nama || '-')}<div class="text-[10px] font-normal text-slate-400">${esc(r.keterangan || '')}</div></td>
        <td class="px-4 py-2.5 text-xs text-slate-700 dark:text-slate-300">${esc(r.penanggung_nama || 'Belum ditetapkan')}<div class="text-[10px] font-mono text-slate-400">${esc(r.penanggung_nip || '')}</div></td>
        <td class="px-4 py-2.5 text-right"><button type="button" onclick="window.AsetSettings?.openRuanganModal(${i})" class="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 text-slate-700 dark:text-slate-200 hover:text-[#2563eb] text-[11px] font-bold cursor-pointer">Atur PJ</button></td>
      </tr>
    `).join('');
  }

  async function openRuanganModal(idx = -1) {
    if (!w.Swal) return;
    await ensureBastData();
    const existing = idx >= 0 ? (_bastData.ruangan || [])[idx] : null;
    const pegOpts = ['<option value="">— Pilih Penanggung Jawab Ruangan —</option>']
      .concat((_bastData.pegawai || []).map((p) => `<option value="${esc(p.id)}" data-nama="${esc(p.nama)}" data-nip="${esc(p.nip)}" ${existing && String(existing.penanggung_id || '') === String(p.id) ? 'selected' : ''}>${esc(p.nama)} (${esc(p.nip || '-')})</option>`))
      .join('');

    const { value: fv } = await w.Swal.fire({
      title: existing ? 'Edit Ruangan & PJ KIR' : 'Tambah Ruangan KIR Baru',
      width: 520,
      html: `
        <div class="text-left flex flex-col gap-3 text-xs">
          <div class="grid grid-cols-3 gap-2.5">
            <div>
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Kode Ruang *</label>
              <input id="swRgKode" type="text" value="${esc(existing?.kode || '')}" placeholder="R-01" class="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono">
            </div>
            <div class="col-span-2">
              <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Nama Ruangan *</label>
              <input id="swRgNama" type="text" value="${esc(existing?.nama || '')}" placeholder="Ruang Rapat Utama" class="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
            </div>
          </div>
          <div>
            <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Penanggung Jawab (PJ) Ruangan</label>
            <select id="swRgPj" class="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">${pegOpts}</select>
          </div>
          <div>
            <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Keterangan</label>
            <input id="swRgKet" type="text" value="${esc(existing?.keterangan || '')}" placeholder="Lantai / Gedung (opsional)" class="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Simpan Ruangan',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#2563eb',
      preConfirm: () => {
        const sel = d.getElementById('swRgPj');
        const opt = sel?.selectedOptions?.[0];
        return {
          id: existing?.id || undefined,
          kode: (d.getElementById('swRgKode')?.value || '').trim(),
          nama: (d.getElementById('swRgNama')?.value || '').trim(),
          keterangan: (d.getElementById('swRgKet')?.value || '').trim(),
          penanggung_id: sel?.value || '',
          penanggung_nama: opt?.dataset?.nama || '',
          penanggung_nip: opt?.dataset?.nip || '',
        };
      },
    });
    if (!fv || !fv.nama) return;
    try {
      const r = await fetch('/api/simapo/bast-ruangan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fv),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.message || `HTTP ${r.status}`);
      w.Swal.fire({ icon: 'success', title: 'Ruangan Tersimpan', text: `Data ruangan "${fv.nama}" berhasil diperbarui.` });
      await ensureBastData(true);
      renderRuanganTable();
    } catch (err) {
      w.Swal.fire({ icon: 'error', title: 'Gagal', text: err?.message || 'Koneksi terganggu.' });
    }
  }

  async function loadPejabatSettings() {
    try {
      const r = await fetch('/api/simapo/pengaturan-get');
      const j = await r.json().catch(() => ({}));
      const data = j.data || {};
      ['sekda_nama', 'sekda_nip', 'sekda_jabatan', 'sekda_alamat', 'p1_jabatan', 'p1_alamat'].forEach((k) => {
        const el = d.querySelector(`[data-aset-set-field="${k}"]`);
        if (el) el.value = data[k] || '';
      });
    } catch (_) {}
  }

  async function savePejabatSettings(btnEl) {
    const payload = {};
    ['sekda_nama', 'sekda_nip', 'sekda_jabatan', 'sekda_alamat', 'p1_jabatan', 'p1_alamat'].forEach((k) => {
      const el = d.querySelector(`[data-aset-set-field="${k}"]`);
      if (el) payload[k] = el.value.trim();
    });
    const orig = btnEl ? btnEl.innerHTML : '';
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Menyimpan...'; }
    try {
      const r = await fetch('/api/simapo/pengaturan-set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.message || `HTTP ${r.status}`);
      if (w.Swal) w.Swal.fire({ icon: 'success', title: 'Pengaturan Disimpan', text: 'Data penandatangan BAST & KIR berhasil disimpan.' });
    } catch (err) {
      if (w.Swal) w.Swal.fire({ icon: 'error', title: 'Gagal', text: err?.message || 'Koneksi terganggu.' });
    } finally {
      if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = orig; }
    }
  }

  async function loadKategoriList() {
    const box = d.getElementById('asetKategoriList');
    if (!box) return;
    try {
      const r = await fetch('/api/simapo/kategori-list');
      const j = await r.json().catch(() => ({}));
      _kategoriList = Array.isArray(j.data) ? j.data : [];
      if (!_kategoriList.length) {
        box.innerHTML = '<div class="text-xs text-slate-400 py-4 text-center">Belum ada kategori barang.</div>';
        return;
      }
      box.innerHTML = _kategoriList.map((k) => `
        <div class="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70">
          <span class="text-xs font-semibold text-slate-800 dark:text-slate-200">${esc(k.nama)}</span>
          <button type="button" onclick="window.AsetSettings?.deleteKategori('${esc(k.id)}')" class="text-rose-500 hover:text-rose-700 text-[11px] font-bold cursor-pointer">Hapus</button>
        </div>
      `).join('');
    } catch (_) {
      box.innerHTML = '<div class="text-xs text-slate-400 py-4 text-center">Akses kategori khusus Pengelola Barang.</div>';
    }
  }

  async function addKategori() {
    const inp = d.getElementById('asetNewKategoriInput');
    const nama = (inp?.value || '').trim();
    if (!nama) return;
    try {
      const r = await fetch('/api/simapo/kategori-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nama }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.message || `HTTP ${r.status}`);
      if (inp) inp.value = '';
      loadKategoriList();
    } catch (err) {
      if (w.Swal) w.Swal.fire('Gagal', err?.message || 'Gagal menambah kategori.', 'error');
    }
  }

  async function deleteKategori(id) {
    try {
      const r = await fetch('/api/simapo/kategori-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.message || `HTTP ${r.status}`);
      loadKategoriList();
    } catch (err) {
      if (w.Swal) w.Swal.fire('Gagal', err?.message || 'Kategori mungkin masih digunakan.', 'error');
    }
  }

  w.AsetSettings = {
    switchTab,
    renderStickerQr,
    openTambahAsetModal,
    closeTambahAsetModal,
    submitTambahAset,
    openAssignUnitModal,
    loadPemeliharaan,
    openCatatPemeliharaanModal,
    loadTiketList,
    updateTiketStatus,
    loadPinjamFullTable,
    loadPengaturanAll,
    openRuanganModal,
    savePejabatSettings,
    addKategori,
    deleteKategori,
  };

  function boot() {
    if (!d.getElementById('asetPanelInventaris')) return;
    switchTab(resolveTab(), false);
    w.addEventListener('hashchange', () => {
      const t = resolveTab();
      if (t !== _activeTab) switchTab(t, false);
    });
    // Enhance filter selects in aset-kir.html with StitchPicker
    setTimeout(() => refreshPickers(d.getElementById('asetPanelInventaris')), 120);
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window, document);
