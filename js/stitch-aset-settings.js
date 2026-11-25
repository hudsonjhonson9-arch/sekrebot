/* Stitch Manajemen Aset — Tab Router, Real CRUD, Pemeliharaan, Tiket/Pinjam, & Pengaturan SIMAPO */
(function (w, d) {
  'use strict';

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

  let _activeTab = 'inventaris';
  let _bastData = { pegawai: [], ruangan: [], aset: [] };
  let _barangList = [];
  let _kategoriList = [];

  const TABS = ['inventaris', 'bast-kir', 'pemeliharaan', 'tiket-pinjam', 'laporan-permen47', 'pengaturan'];
  const CRUMBS = {
    inventaris: 'Inventaris & Aset • Daftar KIR',
    'bast-kir': 'Inventaris & Aset • Berita Acara (BAST) & KIR Ruangan',
    pemeliharaan: 'Inventaris & Aset • Kartu Pemeliharaan',
    'tiket-pinjam': 'Inventaris & Aset • Tiket & Peminjaman',
    'laporan-permen47': 'Inventaris & Aset • Laporan Barang Permen 47',
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
    togglePanel('asetPanelBastKir', next === 'bast-kir');
    togglePanel('asetPanelPemeliharaan', next === 'pemeliharaan');
    togglePanel('asetPanelTiketPinjam', next === 'tiket-pinjam');
    togglePanel('asetPanelLaporanPermen47', next === 'laporan-permen47');
    togglePanel('asetPanelPengaturan', next === 'pengaturan');

    d.querySelectorAll('[data-aset-tab-btn]').forEach((btn) => {
      const act = btn.dataset.asetTabBtn === next;
      btn.className = act
        ? 'inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2563eb] text-white text-xs font-bold shadow-sm transition-all cursor-pointer'
        : 'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface text-xs font-semibold transition-all cursor-pointer';
    });

    const crumb = d.getElementById('asetBreadcrumbTitle');
    if (crumb) crumb.textContent = CRUMBS[next];

    if (next === 'bast-kir') w.AsetBastKir?.load();
    if (next === 'pemeliharaan') loadPemeliharaan();
    if (next === 'tiket-pinjam') { loadTiketList(); loadPinjamFullTable(); }
    if (next === 'laporan-permen47') loadLaporanPermen47();
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

    const swalRes = await w.Swal.fire({
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
      showDenyButton: true,
      confirmButtonText: 'Simpan Perubahan',
      denyButtonText: 'Hapus Unit',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#2563eb',
      denyButtonColor: '#dc2626',
      didOpen: (el) => refreshPickers(el),
      preConfirm: () => ({
        aset_id: asset.id,
        ruangan_id: d.getElementById('swAsRuang')?.value || '',
        pegawai_id: d.getElementById('swAsPeg')?.value || '',
        kondisi: d.getElementById('swAsKondisi')?.value || 'Baik',
        no_polisi: (d.getElementById('swAsNopol')?.value || '').trim(),
      }),
    });

    if (swalRes.isDenied) {
      const cf = await w.Swal.fire({
        icon: 'warning',
        title: 'Hapus Unit Aset?',
        text: `Unit "${asset.nama_barang || asset.id}" akan dihapus permanen dari SIMAPO.`,
        showCancelButton: true,
        confirmButtonText: 'Ya, Hapus',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#dc2626',
      });
      if (!cf.isConfirmed) return;
      try {
        const r = await fetch('/api/simapo/unit-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ aset_id: asset.id }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) throw new Error(j.message || `HTTP ${r.status}`);
        w.Swal.fire({ icon: 'success', title: 'Unit Dihapus', text: 'Data unit aset berhasil dihapus.' });
        if (typeof w.loadRealAsetData === 'function') w.loadRealAsetData();
      } catch (err) {
        w.Swal.fire({ icon: 'error', title: 'Gagal Menghapus', text: err?.message || 'Koneksi terganggu.' });
      }
      return;
    }

    const fv = swalRes.value;
    if (!swalRes.isConfirmed || !fv) return;
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

  /* ── TAB 2: KARTU PEMELIHARAAN ASET (PERMENDAGRI NO. 47) ─────────────── */
  let _allPemeliharaanData = [];
  let _pemeliharaanEditId = null;

  async function ensureBarangListForPm() {
    if (_barangList.length) return _barangList;
    try {
      const r = await fetch('/api/simapo/admin-master-list');
      const j = await r.json().catch(() => ({}));
      if (j.ok && Array.isArray(j.data) && j.data.length) {
        _barangList = j.data;
        return _barangList;
      }
    } catch (_) {}
    try {
      const r2 = await fetch('/api/stitch/aset/barang');
      const j2 = await r2.json().catch(() => ({}));
      if (j2.ok && Array.isArray(j2.data)) _barangList = j2.data;
    } catch (_) {}
    return _barangList;
  }

  function populateKartuPemeliharaanSelects() {
    const filterSel = d.getElementById('kpFilterBarang');
    const formSel = d.getElementById('pmBarangId');
    const items = _barangList || [];
    const optHtml = items.map((b) => {
      const nama = b.nama || b.nama_barang || b.namabarang || 'Tanpa Nama';
      const kode = b.kodebarang || b.kode_barang || '';
      return `<option value="${esc(b.id)}">${esc(nama)}${kode ? ` (${esc(kode)})` : ''}</option>`;
    }).join('');

    if (filterSel) {
      const prev = filterSel.value;
      filterSel.innerHTML = '<option value="">-- Semua Barang (Cetak Semua Kartu) --</option>' + optHtml;
      if (prev) filterSel.value = prev;
    }
    if (formSel) {
      const prev2 = formSel.value;
      formSel.innerHTML = '<option value="">-- Pilih Aset --</option>' + optHtml;
      if (prev2) formSel.value = prev2;
    }
  }

  function onPmBarangChange() {
    const barangId = d.getElementById('pmBarangId')?.value;
    const b = (_barangList || []).find((item) => String(item.id) === String(barangId)) || {};
    const setVal = (id, val) => { const el = d.getElementById(id); if (el) el.value = val || ''; };
    setVal('pmPenggunaBarang', b.nama_pemegang || b.pemegang_nama || b.pemegang || '-');
    setVal('pmKuasaPengguna', 'Kepala Badan/Dinas');
    setVal('pmKodeBarang', b.kodebarang || b.kode_barang || '');
    setVal('pmNamaBarang', b.nama || b.nama_barang || b.namabarang || b.uraian || '');
    setVal('pmNibar', b.nomorinventaris || b.kodebarang || b.nibar || '-');
    setVal('pmSpesifikasi', b.spesifikasi || b.merk || '-');
  }

  function updatePmRowDeleteButtons() {
    const container = d.getElementById('pmRowsContainer');
    if (!container) return;
    const rows = container.querySelectorAll('.pm-maintenance-row');
    rows.forEach((r) => {
      const btn = r.querySelector('.pm-row-del');
      if (btn) btn.style.display = rows.length > 1 ? 'inline-flex' : 'none';
    });
  }

  function updatePmTotalBiaya() {
    const container = d.getElementById('pmRowsContainer');
    if (!container) return;
    let total = 0;
    container.querySelectorAll('.pm-row-biaya').forEach((inp) => {
      total += parseFloat(inp.value) || 0;
    });
    const el = d.getElementById('pmTotalBiayaText');
    if (el) el.textContent = total.toLocaleString('id-ID');
  }

  function addPemeliharaanRow(initialData) {
    const container = d.getElementById('pmRowsContainer');
    if (!container) return;
    const today = new Date().toISOString().slice(0, 10);
    const data = initialData || {};
    const tglVal = String(data.tgl_pemeliharaan || data.tanggal || today).slice(0, 10);
    const row = d.createElement('div');
    row.className = 'pm-maintenance-row grid grid-cols-1 md:grid-cols-12 gap-2 items-center p-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant/30';
    row.innerHTML = `
      <div class="md:col-span-2">
        <input type="date" class="pm-row-tgl w-full h-9 px-2.5 rounded-lg bg-surface-container-low border border-outline-variant/40 text-xs font-mono text-on-surface" value="${esc(tglVal)}" title="Tanggal Pemeliharaan">
      </div>
      <div class="md:col-span-3">
        <input type="text" class="pm-row-jenis w-full h-9 px-2.5 rounded-lg bg-surface-container-low border border-outline-variant/40 text-xs text-on-surface" value="${esc(data.jenis_pemeliharaan || data.jenis || '')}" placeholder="Servis / Perbaikan..." title="Jenis Pemeliharaan">
      </div>
      <div class="md:col-span-2">
        <input type="number" min="0" class="pm-row-biaya w-full h-9 px-2.5 rounded-lg bg-surface-container-low border border-outline-variant/40 text-xs font-mono tabular-nums text-on-surface" value="${data.biaya !== undefined && data.biaya !== null ? esc(data.biaya) : ''}" placeholder="Biaya (Rp)" oninput="window.AsetSettings?.updatePmTotalBiaya()" title="Biaya Rp">
      </div>
      <div class="md:col-span-2">
        <input type="text" class="pm-row-penyedia w-full h-9 px-2.5 rounded-lg bg-surface-container-low border border-outline-variant/40 text-xs text-on-surface" value="${esc(data.nama_penyedia || data.penyedia || '')}" placeholder="Bengkel / vendor" title="Nama Penyedia">
      </div>
      <div class="md:col-span-1">
        <input type="text" class="pm-row-kontrak w-full h-9 px-2 rounded-lg bg-surface-container-low border border-outline-variant/40 text-xs text-on-surface" value="${esc(data.bentuk_kontrak || data.kontrak || '')}" placeholder="Kontrak" title="Bentuk Kontrak">
      </div>
      <div class="md:col-span-2 flex items-center gap-1.5">
        <input type="text" class="pm-row-ket w-full h-9 px-2.5 rounded-lg bg-surface-container-low border border-outline-variant/40 text-xs text-on-surface" value="${esc(data.keterangan || '')}" placeholder="Ket..." title="Keterangan">
        <button type="button" class="pm-row-del h-9 w-9 shrink-0 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-500 flex items-center justify-center cursor-pointer" onclick="window.AsetSettings?.removePemeliharaanRow(this)" title="Hapus Baris">
          <span class="material-symbols-outlined text-[16px]">delete</span>
        </button>
      </div>
    `;
    container.appendChild(row);
    updatePmRowDeleteButtons();
    updatePmTotalBiaya();
  }

  function removePemeliharaanRow(btn) {
    const row = btn?.closest?.('.pm-maintenance-row');
    if (row) {
      row.remove();
      updatePmRowDeleteButtons();
      updatePmTotalBiaya();
    }
  }

  function setModePemeliharaan(idBaris) {
    _pemeliharaanEditId = idBaris || null;
    const editing = !!_pemeliharaanEditId;
    const judul = d.getElementById('pemeliharaanFormTitle');
    const tombol = d.getElementById('btnSavePemeliharaan');
    if (judul) {
      judul.innerHTML = `<span class="material-symbols-outlined text-[16px]">${editing ? 'edit' : 'add_circle'}</span><span>${editing ? 'Ubah Riwayat Pemeliharaan' : 'Form Catat Riwayat Pemeliharaan'}</span>`;
    }
    if (tombol) {
      tombol.innerHTML = `<span class="material-symbols-outlined text-[16px]">save</span><span>${editing ? 'Simpan Perubahan' : 'Simpan Pemeliharaan'}</span>`;
    }
  }

  async function toggleFormPemeliharaan(forceOpen) {
    const wrap = d.getElementById('pemeliharaanFormWrap');
    const btn = d.getElementById('btnToggleFormPm');
    if (!wrap) return;
    const willOpen = typeof forceOpen === 'boolean' ? forceOpen : wrap.classList.contains('hidden');
    wrap.classList.toggle('hidden', !willOpen);
    wrap.classList.toggle('flex', willOpen);
    if (btn) {
      btn.innerHTML = willOpen
        ? '<span class="material-symbols-outlined text-[17px]">close</span><span>Tutup Form</span>'
        : '<span class="material-symbols-outlined text-[17px]">add</span><span>Catat Pemeliharaan</span>';
    }
    if (!willOpen && _pemeliharaanEditId) setModePemeliharaan(null);
    if (willOpen) {
      await ensureBarangListForPm();
      populateKartuPemeliharaanSelects();
      const container = d.getElementById('pmRowsContainer');
      if (container && !_pemeliharaanEditId) {
        container.innerHTML = '';
        addPemeliharaanRow();
      }
    }
  }

  async function savePemeliharaan() {
    const barangId = d.getElementById('pmBarangId')?.value || '';
    const container = d.getElementById('pmRowsContainer');
    const rows = [];
    if (container) {
      container.querySelectorAll('.pm-maintenance-row').forEach((r) => {
        const tgl = r.querySelector('.pm-row-tgl')?.value || new Date().toISOString().slice(0, 10);
        const jenis = (r.querySelector('.pm-row-jenis')?.value || '').trim();
        const biaya = parseFloat(r.querySelector('.pm-row-biaya')?.value) || 0;
        const penyedia = (r.querySelector('.pm-row-penyedia')?.value || '').trim();
        const kontrak = (r.querySelector('.pm-row-kontrak')?.value || '').trim();
        const ket = (r.querySelector('.pm-row-ket')?.value || '').trim();
        if (jenis) {
          rows.push({
            tgl_pemeliharaan: tgl,
            jenis_pemeliharaan: jenis,
            biaya,
            nama_penyedia: penyedia,
            bentuk_kontrak: kontrak,
            keterangan: ket,
          });
        }
      });
    }
    if (!barangId) {
      w.Swal?.fire('Perhatian', 'Pilih barang terlebih dahulu.', 'warning');
      return;
    }
    if (!rows.length) {
      w.Swal?.fire('Perhatian', 'Isi minimal 1 jenis pemeliharaan.', 'warning');
      return;
    }
    const editing = _pemeliharaanEditId;
    if (editing && rows.length > 1) {
      w.Swal?.fire('Perhatian', 'Mode ubah hanya menerima satu baris. Hapus baris tambahan terlebih dahulu.', 'warning');
      return;
    }

    const endpoint = editing ? '/api/simapo/pemeliharaan-update' : '/api/simapo/pemeliharaan';
    const payload = editing ? { id: editing, barang_id: barangId, items: rows } : { barang_id: barangId, items: rows };
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.message || `HTTP ${r.status}`);
      setModePemeliharaan(null);
      await toggleFormPemeliharaan(false);
      w.Swal?.fire({ icon: 'success', title: 'Tersimpan', text: editing ? 'Data pemeliharaan berhasil diubah.' : 'Data pemeliharaan berhasil disimpan.' });
      loadPemeliharaan(true);
    } catch (err) {
      w.Swal?.fire({ icon: 'error', title: 'Gagal Menyimpan', text: err?.message || 'Koneksi terganggu.' });
    }
  }

  async function editPemeliharaan(id) {
    const item = (_allPemeliharaanData || []).find((x) => String(x.id) === String(id));
    if (!item) {
      w.Swal?.fire('Tidak Ditemukan', 'Data pemeliharaan tidak ditemukan.', 'warning');
      return;
    }
    setModePemeliharaan(item.id);
    await toggleFormPemeliharaan(true);
    const sel = d.getElementById('pmBarangId');
    if (sel) {
      sel.value = item.barang_id || item.barangid || '';
      onPmBarangChange();
    }
    const container = d.getElementById('pmRowsContainer');
    if (container) {
      container.innerHTML = '';
      addPemeliharaanRow(item);
    }
    d.getElementById('pemeliharaanFormWrap')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function deletePemeliharaan(id) {
    let confirmed = false;
    if (w.Swal) {
      const res = await w.Swal.fire({
        title: 'Hapus Riwayat Pemeliharaan?',
        text: 'Tindakan ini tidak dapat dibatalkan.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Ya, Hapus',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#dc2626',
      });
      confirmed = !!res.isConfirmed;
    } else {
      confirmed = confirm('Hapus riwayat pemeliharaan ini?');
    }
    if (!confirmed) return;
    try {
      const r = await fetch('/api/simapo/pemeliharaan-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.message || `HTTP ${r.status}`);
      if (String(_pemeliharaanEditId) === String(id)) setModePemeliharaan(null);
      w.Swal?.fire({ icon: 'success', title: 'Dihapus', text: 'Riwayat pemeliharaan berhasil dihapus.' });
      loadPemeliharaan(true);
    } catch (err) {
      w.Swal?.fire({ icon: 'error', title: 'Gagal Menghapus', text: err?.message || 'Koneksi terganggu.' });
    }
  }

  function filterKartuPemeliharaan() {
    const el = d.getElementById('adminPemeliharaanList');
    if (!el) return;
    const data = _allPemeliharaanData || [];
    const barangId = d.getElementById('kpFilterBarang')?.value || '';
    const tahun = d.getElementById('kpFilterTahun')?.value || '';

    let filtered = data.slice();
    if (barangId) {
      filtered = filtered.filter((item) => String(item.barang_id || item.barangid) === String(barangId));
    }
    if (tahun) {
      filtered = filtered.filter((item) => String(item.tgl_pemeliharaan || item.tanggal || '').includes(tahun));
    }

    const cnt = d.getElementById('asetPemeliharaanCount');
    if (cnt) cnt.textContent = `${filtered.length} catatan`;

    if (!filtered.length) {
      el.innerHTML = `
        <div class="rounded-2xl border border-outline-variant/30 bg-surface-container-low/50 p-10 text-center text-xs text-on-surface-variant">
          <div class="mb-2 opacity-40"><span class="material-symbols-outlined text-3xl">build</span></div>
          Belum ada catatan pemeliharaan${barangId ? ' untuk barang terpilih' : ''}${tahun ? ' pada tahun ' + esc(tahun) : ''}.<br>
          Klik <strong>Catat Pemeliharaan</strong> di atas untuk menambahkan riwayat perawatan.
        </div>`;
      return;
    }

    // Kelompokkan per barang_id sesuai template Permendagri No. 47 (4. KARTU PEMELIHARAAN)
    const groups = {};
    filtered.forEach((item) => {
      const bId = item.barang_id || item.barangid || 'default';
      if (!groups[bId]) groups[bId] = [];
      groups[bId].push(item);
    });

    el.innerHTML = Object.keys(groups).map((bId) => {
      const list = groups[bId];
      const bInfo = (_barangList || []).find((x) => String(x.id) === String(bId)) || {};
      const namaBarang = bInfo.nama || bInfo.nama_barang || list[0].nama_barang || list[0].namabarang || 'Barang';
      const kodeBarang = bInfo.kodebarang || list[0].kodebarang || '—';
      const spesifikasi = bInfo.spesifikasi || bInfo.merk || list[0].spesifikasi || '-';
      const nibar = bInfo.nomorinventaris || list[0].nomorinventaris || '—';
      const penggunaBarang = bInfo.nama_pemegang || list[0].nama_pemegang || bInfo.pemegang || '-';
      const kuasaPenggunaBarang = 'Kepala Badan/Dinas';

      let totalBiaya = 0;
      const rowsHtml = list.map((item, idx) => {
        const biaya = Number(item.biaya) || 0;
        totalBiaya += biaya;
        const tgl = String(item.tgl_pemeliharaan || item.tanggal || '—').slice(0, 10);
        return `
          <tr class="border-b border-outline-variant/25 hover:bg-surface-container-low/60">
            <td class="px-3 py-2.5 text-center font-mono tabular-nums text-xs text-on-surface-variant">${idx + 1}</td>
            <td class="px-3 py-2.5 whitespace-nowrap font-mono tabular-nums text-xs text-on-surface">${esc(tgl)}</td>
            <td class="px-3 py-2.5 text-xs font-bold text-on-surface">${esc(item.jenis_pemeliharaan || item.jenis || '—')}</td>
            <td class="px-3 py-2.5 text-right font-mono tabular-nums text-xs font-bold text-primary whitespace-nowrap">${esc(formatRp(biaya))}</td>
            <td class="px-3 py-2.5 text-xs text-on-surface-variant">${esc(item.nama_penyedia || item.penyedia || '—')}</td>
            <td class="px-3 py-2.5 text-xs text-on-surface-variant">${esc(item.bentuk_kontrak || item.kontrak || '—')}</td>
            <td class="px-3 py-2.5 text-xs text-on-surface-variant">${esc(item.keterangan || '—')}</td>
            <td class="px-3 py-2.5 text-right whitespace-nowrap print-hide-col">
              <button type="button" onclick="window.AsetSettings?.editPemeliharaan('${esc(item.id)}')" title="Ubah riwayat ini" class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-surface-container-low hover:bg-surface-container-high text-on-surface cursor-pointer mr-1">
                <span class="material-symbols-outlined text-[15px]">edit</span>
              </button>
              <button type="button" onclick="window.AsetSettings?.deletePemeliharaan('${esc(item.id)}')" title="Hapus riwayat ini" class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-500 cursor-pointer">
                <span class="material-symbols-outlined text-[15px]">delete</span>
              </button>
            </td>
          </tr>`;
      }).join('');

      return `
        <div class="kartu-pm-card rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-sm">
          <div class="text-center mb-4">
            <div class="text-sm font-extrabold uppercase tracking-wider text-on-surface">KARTU PEMELIHARAAN</div>
            <div class="text-[11px] font-mono font-bold text-primary mt-0.5">NIBAR: ${esc(nibar)}</div>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 text-xs pb-3 mb-3 border-b border-outline-variant/30">
            <div class="flex justify-between gap-2"><span class="text-on-surface-variant">Pengguna Barang:</span><span class="font-bold text-on-surface text-right">${esc(penggunaBarang)}</span></div>
            <div class="flex justify-between gap-2"><span class="text-on-surface-variant">Kuasa Pengguna Barang:</span><span class="font-bold text-on-surface text-right">${esc(kuasaPenggunaBarang)}</span></div>
            <div class="flex justify-between gap-2"><span class="text-on-surface-variant">Kode Barang:</span><span class="font-mono font-bold text-primary text-right">${esc(kodeBarang)}</span></div>
            <div class="flex justify-between gap-2"><span class="text-on-surface-variant">Nama Barang:</span><span class="font-extrabold text-on-surface text-right">${esc(namaBarang)}</span></div>
            <div class="flex justify-between gap-2 md:col-span-2"><span class="text-on-surface-variant">Spesifikasi Barang:</span><span class="font-semibold text-on-surface text-right">${esc(spesifikasi)}</span></div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full border-collapse text-left min-w-[700px]">
              <thead>
                <tr class="bg-surface-container-low text-on-surface-variant text-[11px] font-bold uppercase tracking-wider border-b border-outline-variant/40">
                  <th class="px-3 py-2.5 text-center w-10">No.</th>
                  <th class="px-3 py-2.5 w-32">Tanggal</th>
                  <th class="px-3 py-2.5">Jenis Pemeliharaan</th>
                  <th class="px-3 py-2.5 text-right w-36">Biaya (Rp)</th>
                  <th class="px-3 py-2.5">Nama Penyedia</th>
                  <th class="px-3 py-2.5">Bentuk Kontrak</th>
                  <th class="px-3 py-2.5">Ket.</th>
                  <th class="px-3 py-2.5 text-right w-24 print-hide-col">Aksi</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
              <tfoot>
                <tr class="border-t-2 border-outline-variant/40 font-extrabold bg-surface-container-low/40">
                  <td colspan="3" class="px-3 py-2.5 text-right text-xs text-on-surface">TOTAL BIAYA:</td>
                  <td class="px-3 py-2.5 text-right font-mono tabular-nums text-xs text-primary whitespace-nowrap">${esc(formatRp(totalBiaya))}</td>
                  <td colspan="4"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>`;
    }).join('');
  }

  async function loadPemeliharaan(silent = false) {
    const el = d.getElementById('adminPemeliharaanList');
    if (el && !silent && !el.innerHTML.trim()) {
      el.innerHTML = '<div class="py-10 text-center text-xs text-on-surface-variant">Memuat kartu pemeliharaan aset...</div>';
    }
    try {
      const [pmRes] = await Promise.all([
        fetch('/api/simapo/pemeliharaan'),
        ensureBarangListForPm(),
      ]);
      const pmJson = await pmRes.json().catch(() => ({}));
      _allPemeliharaanData = Array.isArray(pmJson.data) ? pmJson.data : [];
      populateKartuPemeliharaanSelects();
      filterKartuPemeliharaan();
    } catch (err) {
      if (el && !silent) el.innerHTML = `<div class="py-10 text-center text-xs text-rose-500">Gagal memuat kartu pemeliharaan: ${esc(err?.message)}</div>`;
    }
  }

  async function downloadExcelKartuPemeliharaan() {
    const barangId = d.getElementById('kpFilterBarang')?.value || '';
    const tahun = d.getElementById('kpFilterTahun')?.value || '';
    const url = `/api/simapo/kartu-pemeliharaan/xlsx?barang_id=${encodeURIComponent(barangId)}&tahun=${encodeURIComponent(tahun)}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = d.createElement('a');
      a.href = blobUrl;
      a.download = `Kartu_Pemeliharaan_${barangId ? 'Barang_' + barangId : 'Semua'}_${tahun || 'Semua'}.xlsx`;
      d.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
    } catch (err) {
      w.Swal?.fire('Gagal Unduh', err?.message || 'Tidak dapat mengunduh Excel Kartu Pemeliharaan.', 'error');
    }
  }

  function cetakKartuPemeliharaan() {
    const el = d.getElementById('adminPemeliharaanList');
    if (!el || !el.innerHTML.trim() || el.innerHTML.includes('Belum ada catatan')) {
      w.Swal?.fire('Info', 'Tidak ada kartu pemeliharaan untuk dicetak.', 'info');
      return;
    }
    const popup = w.open('', '_blank');
    if (!popup) {
      w.Swal?.fire('Pop-up Diblokir', 'Izinkan pop-up pada browser untuk mencetak Kartu Pemeliharaan.', 'warning');
      return;
    }
    popup.document.write(`<!DOCTYPE html><html><head><title>Kartu Pemeliharaan Barang</title>
      <style>
        body{font-family:Arial,sans-serif;color:#000;background:#fff;margin:20px;font-size:12px;}
        .kartu-pm-card{border:1px solid #000;padding:16px;margin-bottom:24px;page-break-after:always;border-radius:4px;}
        table{width:100%;border-collapse:collapse;margin-top:12px;font-size:11px;}
        th,td{border:1px solid #333;padding:6px 8px;text-align:left;}
        th{background:#eee;}
        .print-hide-col{display:none!important;}
        @page{size:A4 portrait;margin:15mm;}
      </style></head><body>${el.innerHTML}<script>window.onload=function(){window.print();};<\/script></body></html>`);
    popup.document.close();
  }

  function openCatatPemeliharaanModal() {
    toggleFormPemeliharaan(true);
  }

  /* ── TAB 3: TIKET KERUSAKAN & PEMINJAMAN ──────────────────────────────── */
  async function loadTiketList(silent = false) {
    const tbody = d.getElementById('asetTiketBody');
    if (!tbody) return;
    if (!silent && !tbody.innerHTML.trim()) {
      tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-xs text-slate-400">Memuat tiket kerusakan...</td></tr>';
    }
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

  async function loadPinjamFullTable(silent = false) {
    const tbody = d.getElementById('asetPinjamFullBody');
    if (!tbody) return;
    if (!silent && !tbody.innerHTML.trim()) {
      tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-xs text-slate-400">Memuat daftar peminjaman unit...</td></tr>';
    }
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
      loadBastHistory(),
    ]);
  }

  async function loadBastHistory() {
    const tbody = d.getElementById('asetBastHistoryBody');
    if (!tbody) return;
    try {
      const r = await fetch('/api/simapo/bast-history');
      const j = await r.json().catch(() => ({}));
      const items = Array.isArray(j.data) ? j.data : [];
      if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="py-6 text-center text-xs text-slate-400">Belum ada riwayat Berita Acara Serah Terima (BAST).</td></tr>';
        return;
      }
      tbody.innerHTML = items.slice(0, 20).map((b) => `
        <tr class="border-b border-slate-100 dark:border-slate-800/80">
          <td class="px-4 py-2.5 font-mono text-xs font-bold text-primary whitespace-nowrap">${esc(b.nomor || '-')}</td>
          <td class="px-4 py-2.5 text-xs font-semibold text-slate-900 dark:text-white">${esc(b.pegawai_nama || '-')}<div class="text-[10px] font-mono text-slate-400">${esc(b.pegawai_nip || '')}</div></td>
          <td class="px-4 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">${esc(String(b.tanggal || b.createdat || '-').slice(0, 10))}</td>
          <td class="px-4 py-2.5 font-mono text-xs font-bold text-slate-800 dark:text-slate-200 text-right whitespace-nowrap">${esc(b.total_aset || 0)} unit • ${esc(formatRp(b.total_nilai))}</td>
        </tr>
      `).join('');
    } catch (_) {
      tbody.innerHTML = '<tr><td colspan="4" class="py-6 text-center text-xs text-slate-400">Akses riwayat BAST khusus Pengelola Barang.</td></tr>';
    }
  }

  function downloadPermen47Excel() {
    w.open('/api/simapo/laporan-permen47/xlsx', '_blank', 'noopener');
  }

  function downloadKartuPemeliharaanExcel() {
    w.open('/api/simapo/kartu-pemeliharaan/xlsx', '_blank', 'noopener');
  }

  /* ── MOBILE #view-aset SUB-MENU (Aset Saya | Pemeliharaan | Pengaturan) ── */
  let _mAsetTab = 'aset';

  function switchMobileAsetTab(tab) {
    const valid = ['aset', 'pemeliharaan', 'pengaturan', 'laporan', 'tiket'];
    _mAsetTab = valid.includes(tab) ? tab : 'aset';
    togglePanel('mobileAsetTabUtama', _mAsetTab === 'aset');
    togglePanel('mobileAsetTabPemeliharaan', _mAsetTab === 'pemeliharaan');
    togglePanel('mobileAsetTabPengaturan', _mAsetTab === 'pengaturan');
    togglePanel('mobileAsetTabLaporan', _mAsetTab === 'laporan');
    togglePanel('mobileAsetTabTiket', _mAsetTab === 'tiket');

    d.querySelectorAll('[data-m-aset-tab]').forEach((btn) => {
      const t = btn.dataset.mAsetTab;
      const act = t === _mAsetTab;
      if (t === 'laporan' || t === 'tiket') {
        btn.className = act
          ? 'py-2 px-3 rounded-xl bg-[#2563eb] text-white border border-[#2563eb] text-[11px] font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer'
          : 'py-2 px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:border-blue-500 text-[11px] font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer';
      } else {
        btn.className = act
          ? 'flex-1 py-2 px-2 rounded-xl bg-[#2563eb] text-white text-[11px] font-bold shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1'
          : 'flex-1 py-2 px-2 rounded-xl text-slate-600 dark:text-slate-300 text-[11px] font-semibold transition-all cursor-pointer flex items-center justify-center gap-1';
      }
    });

    if (_mAsetTab === 'pemeliharaan') loadMobilePemeliharaan();
    if (_mAsetTab === 'pengaturan') loadMobilePengaturan();
    if (_mAsetTab === 'laporan') loadMobileLaporan();
    if (_mAsetTab === 'tiket') loadMobileTiket();
  }

  async function loadMobileLaporan() {
    const box = d.getElementById('mobileAsetLaporanSummary');
    if (!box) return;
    box.innerHTML = '<div class="py-6 text-center text-xs text-slate-400">Memuat ringkasan Permen 47...</div>';
    try {
      const tahun = new Date().getFullYear();
      const r = await fetch(`/api/simapo/laporan-permen47?periode=tahunan&tahun=${tahun}`);
      const j = await r.json().catch(() => ({}));
      const summary = j.summary || j.ringkasan || {};
      const rows = Array.isArray(j.data) ? j.data : (Array.isArray(j.items) ? j.items : []);
      const totalUnit = summary.total_unit ?? summary.totalUnit ?? rows.length;
      const totalNilai = summary.total_nilai ?? summary.totalNilai ?? rows.reduce((a, b) => a + Number(b.harga || b.nilai || 0), 0);
      box.innerHTML = `
        <div class="grid grid-cols-2 gap-2">
          <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
            <div class="text-[10px] text-slate-400 font-semibold">Total Barang (${tahun})</div>
            <div class="text-base font-extrabold font-mono text-slate-900 dark:text-white mt-0.5">${esc(String(totalUnit))}</div>
          </div>
          <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
            <div class="text-[10px] text-slate-400 font-semibold">Total Nilai BMD</div>
            <div class="text-sm font-extrabold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">${esc(formatRp(totalNilai))}</div>
          </div>
        </div>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">Tekan tombol <strong>Excel</strong> di atas untuk mengunduh format lengkap Permendagri 47/2021.</p>
      `;
    } catch (err) {
      box.innerHTML = `<div class="py-5 text-center text-xs text-rose-500">Gagal memuat laporan: ${esc(err?.message)}</div>`;
    }
  }

  async function loadMobileTiket() {
    const tBox = d.getElementById('mobileAsetTiketList');
    const pBox = d.getElementById('mobileAsetPinjamList');
    if (tBox) tBox.innerHTML = '<div class="py-5 text-center text-xs text-slate-400">Memuat tiket kerusakan...</div>';
    if (pBox) pBox.innerHTML = '<div class="py-5 text-center text-xs text-slate-400">Memuat daftar peminjaman...</div>';
    try {
      const [tRes, pRes] = await Promise.allSettled([
        fetch('/api/simapo/admin-tiket-list').then((r) => r.json()),
        fetch('/api/simapo/admin-pinjam-list').then((r) => r.json())
      ]);
      if (tBox) {
        const items = (tRes.status === 'fulfilled' && Array.isArray(tRes.value?.data)) ? tRes.value.data : [];
        tBox.innerHTML = items.length ? items.slice(0, 20).map((t) => `
          <div class="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-xs space-y-2">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-bold text-slate-900 dark:text-white truncate">${esc(t.judul || t.nomortiket || '-')}</span>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-950/60 text-[#2563eb] dark:text-blue-300 shrink-0">${esc(t.status || 'MENUNGGU')}</span>
            </div>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">${esc(t.nama_pelapor || t.userid || '-')} • ${esc(t.deskripsi || '')}</p>
            <div class="flex items-center gap-1.5">
              <button type="button" onclick="window.AsetSettings?.updateTiketStatus('${esc(t.id)}','DIPROSES').then(()=>window.AsetSettings?.loadMobileTiket())" class="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 text-[11px] font-bold cursor-pointer">Proses</button>
              <button type="button" onclick="window.AsetSettings?.updateTiketStatus('${esc(t.id)}','SELESAI').then(()=>window.AsetSettings?.loadMobileTiket())" class="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold cursor-pointer">Selesai</button>
            </div>
          </div>
        `).join('') : '<div class="p-5 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">Tidak ada tiket kerusakan aset saat ini.</div>';
      }
      if (pBox) {
        const rows = (pRes.status === 'fulfilled' && Array.isArray(pRes.value?.data)) ? pRes.value.data : [];
        pBox.innerHTML = rows.length ? rows.slice(0, 20).map((p) => {
          const st = String(p.status || 'MENUNGGU').toUpperCase();
          return `
            <div class="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-xs space-y-1.5">
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs font-bold text-slate-900 dark:text-white truncate">${esc(p.nama_barang || '-')}</span>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 shrink-0">${esc(st)}</span>
              </div>
              <p class="text-[11px] text-slate-500 dark:text-slate-400">${esc(p.nama_peminjam || p.userid || '-')} • <span class="font-mono">${esc(p.tanggalmulai || '-')} s/d ${esc(p.tanggalselesai || '-')}</span></p>
              ${st === 'MENUNGGU' ? `<div class="flex items-center gap-1.5 pt-1"><button type="button" onclick="window.handleAdminPinjamAction?.('${esc(p.id)}','DIPINJAM').then(()=>window.AsetSettings?.loadMobileTiket())" class="px-2.5 py-1 rounded-lg bg-[#2563eb] text-white text-[11px] font-bold cursor-pointer">Setujui</button><button type="button" onclick="window.handleAdminPinjamAction?.('${esc(p.id)}','DITOLAK').then(()=>window.AsetSettings?.loadMobileTiket())" class="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-600 text-[11px] font-bold cursor-pointer">Tolak</button></div>` : ''}
            </div>
          `;
        }).join('') : '<div class="p-5 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">Belum ada riwayat peminjaman unit.</div>';
      }
    } catch (_) {}
  }

  async function loadMobilePemeliharaan() {
    const box = d.getElementById('mobileAsetPemeliharaanList');
    if (!box) return;
    box.innerHTML = '<div class="py-8 text-center text-xs text-slate-400">Memuat riwayat pemeliharaan...</div>';
    try {
      const r = await fetch('/api/stitch/aset/pemeliharaan');
      const j = await r.json().catch(() => ({}));
      const rows = Array.isArray(j.data) ? j.data : [];
      if (!rows.length) {
        box.innerHTML = '<div class="p-6 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">Belum ada catatan pemeliharaan aset.</div>';
        return;
      }
      box.innerHTML = rows.slice(0, 30).map((p) => `
        <div class="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-xs flex flex-col gap-1">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-bold text-slate-900 dark:text-white truncate">${esc(p.nama_barang || '-')}</span>
            <span class="font-mono text-[11px] font-bold text-primary shrink-0">${esc(formatRp(p.biaya))}</span>
          </div>
          <div class="text-[11px] text-slate-600 dark:text-slate-300">${esc(p.jenis_pemeliharaan || '-')} • ${esc(p.nama_penyedia || '-')}</div>
          <div class="flex items-center justify-between text-[10px] text-slate-400 font-mono">
            <span>${esc(String(p.tgl_pemeliharaan || '-').slice(0, 10))}</span>
            <span class="truncate max-w-[180px]">${esc(p.keterangan || '')}</span>
          </div>
        </div>
      `).join('');
    } catch (err) {
      box.innerHTML = `<div class="p-6 text-center text-xs text-rose-500">Gagal memuat: ${esc(err?.message)}</div>`;
    }
  }

  async function loadMobilePengaturan() {
    const box = d.getElementById('mobileAsetRuanganList');
    if (!box) return;
    box.innerHTML = '<div class="py-6 text-center text-xs text-slate-400">Memuat daftar ruangan KIR...</div>';
    await ensureBastData(true);
    const list = _bastData.ruangan || [];
    if (!list.length) {
      box.innerHTML = '<div class="p-5 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">Belum ada ruangan KIR terdaftar.</div>';
      return;
    }
    box.innerHTML = list.map((r, i) => `
      <div class="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-xs flex items-center justify-between gap-2">
        <div class="min-w-0">
          <div class="text-xs font-bold text-slate-900 dark:text-white truncate">${esc(r.nama || '-')} <span class="font-mono text-[10px] text-primary">(${esc(r.kode || '-')})</span></div>
          <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate">PJ: ${esc(r.penanggung_nama || 'Belum ditetapkan')}</div>
        </div>
        <button type="button" onclick="window.AsetSettings?.openRuanganModal(${i})" class="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-[#2563eb] dark:text-blue-300 text-[11px] font-bold shrink-0 cursor-pointer">Atur PJ</button>
      </div>
    `).join('');
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
      didOpen: (el) => refreshPickers(el),
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

  /* ── TAB 5: LAPORAN BARANG PERMEN 47 (FORMAT PERMENDAGRI NO. 47) ──────── */
  let _p47DraftItems = [];

  function toggleFormPermen47(forceState) {
    const wrap = d.getElementById('permen47FormWrap');
    if (!wrap) return;
    const show = typeof forceState === 'boolean' ? forceState : wrap.classList.contains('hidden');
    wrap.classList.toggle('hidden', !show);
    if (show) {
      const tglEl = d.getElementById('p47Tgl');
      if (tglEl && !tglEl.value) tglEl.value = new Date().toISOString().slice(0, 10);
    }
  }

  function renderPermen47DraftItems() {
    const box = d.getElementById('p47DraftItems');
    const totEl = d.getElementById('p47DraftTotal');
    const total = _p47DraftItems.reduce((s, it) => s + (Number(it.volume || 1) * Number(it.harga_satuan || 0)), 0);
    if (totEl) totEl.textContent = `Total: ${formatRp(total)}`;
    if (!box) return;
    if (!_p47DraftItems.length) {
      box.innerHTML = 'Belum ada item barang ditambahkan.';
      return;
    }
    box.innerHTML = _p47DraftItems.map((it, idx) => `
      <div class="flex items-center justify-between gap-2 p-2 rounded-lg bg-surface-container-lowest border border-outline-variant/30">
        <span class="text-xs font-semibold text-on-surface truncate">${esc(it.nama_barang)} — <span class="font-mono">${it.volume} ${esc(it.satuan)} x ${formatRp(it.harga_satuan)}</span></span>
        <div class="flex items-center gap-2 shrink-0">
          <span class="font-mono font-bold text-primary text-xs tabular-nums">${formatRp(it.volume * it.harga_satuan)}</span>
          <button type="button" onclick="window.AsetSettings?.removePermen47Item(${idx})" class="text-error font-bold text-xs cursor-pointer">&times;</button>
        </div>
      </div>`).join('');
  }

  function addPermen47Item() {
    const nama = String(d.getElementById('p47ItemNama')?.value || '').trim();
    const vol = Math.max(1, parseInt(d.getElementById('p47ItemJumlah')?.value, 10) || 1);
    const sat = String(d.getElementById('p47ItemSatuan')?.value || 'Unit').trim() || 'Unit';
    const harga = Math.max(0, parseFloat(d.getElementById('p47ItemHarga')?.value) || 0);
    if (!nama) return;
    _p47DraftItems.push({ nama_barang: nama, volume: vol, satuan: sat, harga_satuan: harga });
    if (d.getElementById('p47ItemNama')) d.getElementById('p47ItemNama').value = '';
    if (d.getElementById('p47ItemJumlah')) d.getElementById('p47ItemJumlah').value = '1';
    if (d.getElementById('p47ItemHarga')) d.getElementById('p47ItemHarga').value = '';
    renderPermen47DraftItems();
  }

  function removePermen47Item(idx) {
    _p47DraftItems.splice(idx, 1);
    renderPermen47DraftItems();
  }

  async function savePermen47Nota() {
    if (!_p47DraftItems.length) {
      if (w.Swal) w.Swal.fire({ icon: 'warning', title: 'Belum Ada Item', text: 'Tambahkan minimal 1 item barang terlebih dahulu.' });
      return;
    }
    const btn = d.getElementById('btnSavePermen47Nota');
    if (btn) btn.disabled = true;
    try {
      const instId = (localStorage.getItem('MY_INSTANSI') || localStorage.getItem('_sess_inst') || 'bapperida').trim() || 'bapperida';
      const payload = {
        no_nota: String(d.getElementById('p47NoNota')?.value || '').trim(),
        tgl_nota: String(d.getElementById('p47Tgl')?.value || new Date().toISOString().slice(0, 10)),
        kontrak: String(d.getElementById('p47Kontrak')?.value || 'Swakelola').trim(),
        bentuk_kontrak: String(d.getElementById('p47Kontrak')?.value || 'Swakelola').trim(),
        penyedia: String(d.getElementById('p47Penyedia')?.value || '').trim(),
        nama_penyedia: String(d.getElementById('p47Penyedia')?.value || '').trim(),
        no_sp2d: String(d.getElementById('p47Sp2d')?.value || '').trim(),
        sub_kegiatan: String(d.getElementById('p47SubKeg')?.value || '').trim(),
        instansi_id: instId,
        items: _p47DraftItems,
      };
      const r = await fetch('/api/simapo/penerimaan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false) throw new Error(j.message || `HTTP ${r.status}`);
      _p47DraftItems = [];
      renderPermen47DraftItems();
      toggleFormPermen47(false);
      if (w.Swal) w.Swal.fire({ icon: 'success', title: 'Tersimpan', text: j.message || 'Penerimaan barang berhasil disimpan.' });
      await loadLaporanPermen47();
    } catch (err) {
      if (w.Swal) w.Swal.fire({ icon: 'error', title: 'Gagal Menyimpan', text: err.message });
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  let _p47LastRows = [];
  let _p47LastMeta = {};
  let _p47ActiveSection = 'ALL';

  function resolvePermen47Section(r) {
    const rawCat = String(r.uraian_belanja || r.nama_kategori || '').trim();
    if (rawCat && !/^barang pakai habis lainnya$/i.test(rawCat)) return rawCat;
    const nm = String(r.nama_barang || r.nama || '').toLowerCase();
    if (/\b(kertas|hvs|amplop|map|stopmap|buku|notes|post-it|cover|jilid)\b/.test(nm)) return 'Kertas dan Cover';
    if (/\b(tinta|toner|cartridge|flashdisk|mouse|keyboard|kabel|printer|komputer|laptop|usb)\b/.test(nm)) return 'Bahan Komputer';
    if (/\b(cetak|spanduk|banner|baliho|fotokopi|foto copy|stiker|brosur|undangan)\b/.test(nm)) return 'Bahan Cetak';
    if (/\b(pulpen|bolpoin|pensil|spidol|klip|staples|isi staples|gunting|cutter|cuter|lem|lakban|penggaris|penghapus|binder|ordner|bantex|tip-ex|stabilo|atk)\b/.test(nm)) return 'Alat Tulis Kantor (ATK)';
    if (/\b(sabun|sapu|pel|tisu|tissue|pembersih|pewangi|detergen|sikat|lap|kanebo|sampah)\b/.test(nm)) return 'Alat / Bahan Kebersihan';
    if (/\b(lampu|baterai|saklar|stop kontak|listrik|colokan|mc[b])\b/.test(nm)) return 'Alat Listrik';
    if (/\b(makan|minum|snack|kopi|teh|gula|air mineral|aqua|kue|nasi)\b/.test(nm)) return 'Makanan dan Minuman';
    if (/\b(cat|paku|semen|kuas|thinner|kayu|pipa|kunci)\b/.test(nm)) return 'Bahan Bangunan';
    return rawCat || 'Barang Pakai Habis Lainnya';
  }

  function setPermen47Section(sec) {
    _p47ActiveSection = sec || 'ALL';
    renderPermen47Preview(_p47LastRows, _p47LastMeta);
  }

  function renderPermen47Preview(rows, meta) {
    _p47LastRows = rows || [];
    _p47LastMeta = meta || {};
    const container = d.getElementById('permen47PreviewContainer');
    const sumEl = d.getElementById('permen47SummaryTotal');
    if (!container) return;
    const pMap = {
      TW1: 'Triwulan I (Januari - Maret)',
      TW2: 'Triwulan II (April - Juni)',
      TW3: 'Triwulan III (Juli - September)',
      TW4: 'Triwulan IV (Oktober - Desember)',
      SM1: 'Semester I (Januari - Juni)',
      SM2: 'Semester II (Juli - Desember)',
      TAHUNAN: 'Tahunan (Januari - Desember)',
    };
    const labelPeriode = pMap[meta.periode] || meta.periode;
    const fmt = (n) => new Intl.NumberFormat('id-ID').format(Number(n) || 0);
    const leafRowsAll = (rows || []).filter((r) => !r.is_header);
    const sectionMap = new Map();
    leafRowsAll.forEach((r) => {
      const sec = resolvePermen47Section(r);
      if (!sectionMap.has(sec)) sectionMap.set(sec, { name: sec, items: [], qty: 0, total: 0 });
      const grp = sectionMap.get(sec);
      const jml = Number(r.jumlah || r.volume) || 1;
      const tot = Number(r.total_nilai || r.total || (jml * (Number(r.harga_satuan || r.hargasatuan || r.harga) || 0))) || 0;
      grp.items.push(r);
      grp.qty += jml;
      grp.total += tot;
    });
    const sections = Array.from(sectionMap.values());
    if (_p47ActiveSection !== 'ALL' && !sectionMap.has(_p47ActiveSection)) {
      _p47ActiveSection = 'ALL';
    }
    const visibleSections = _p47ActiveSection === 'ALL' ? sections : sections.filter((s) => s.name === _p47ActiveSection);
    const totalKeseluruhan = visibleSections.reduce((a, s) => a + s.total, 0);
    if (sumEl) {
      sumEl.innerHTML = `<span class="text-on-surface-variant font-medium">Total Nilai ${_p47ActiveSection === 'ALL' ? 'Pengadaan' : esc(_p47ActiveSection)}</span><span class="font-mono font-extrabold text-primary tabular-nums">Rp ${fmt(totalKeseluruhan)}</span>`;
    }

    if (!leafRowsAll.length) {
      container.innerHTML = `<div class="p-8 text-center text-xs text-on-surface-variant bg-surface-container-low rounded-xl border border-outline-variant/30">Belum ada data pengadaan untuk <strong>${esc(labelPeriode)} Tahun ${esc(meta.tahun)}</strong>.<br>Klik <strong>Catat Pengadaan Baru</strong> di atas untuk menambahkan transaksi pengadaan barang pakai habis.</div>`;
      return;
    }

    const kodeParts = (r) => {
      if (Array.isArray(r.kode_parts)) return Array.from({ length: 7 }, (_, i) => (r.kode_parts[i] == null ? '' : String(r.kode_parts[i])));
      const parts = String(r.kode_barang || r.kodebarang || '').split('.').filter(Boolean).slice(0, 7);
      return Array.from({ length: 7 }, (_, i) => parts[i] || '');
    };
    const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const tglIndo = (v) => {
      const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
      return m ? `${Number(m[3])} ${BULAN[Number(m[2]) - 1]} ${m[1]}` : String(v || '');
    };

    const th = (inner, attrs = '') => `<th class="p-1.5 border border-outline-variant/50 bg-surface-container-low text-on-surface font-bold text-center text-[10.5px] align-middle" ${attrs}>${inner}</th>`;
    const td = (inner, cls = '') => `<td class="p-1.5 border border-outline-variant/40 text-[11px] align-middle ${cls}">${inner == null ? '' : inner}</td>`;
    const tdNum = (v, cls = '') => td(v === '' || v == null ? '' : fmt(v), `text-right font-mono tabular-nums ${cls}`);
    const kotak = Array.from({ length: 6 }, () => th('')).join('');
    const rp = '<span class="font-semibold opacity-70">(Rp)</span>';

    const headRow1 = `<tr>${th('No.', 'rowspan="3"')}${th('Penggolongan dan Kodefikasi Barang', 'colspan="8"')}${th('Spesifikasi Nama Barang', 'rowspan="3"')}${th('Merek', 'rowspan="3"')}${th('Jumlah Barang', 'rowspan="3"')}${th('Satuan Barang', 'rowspan="3"')}${th('Harga Satuan<br>' + rp, 'rowspan="2"')}${th('Total Nilai Barang<br>' + rp, 'rowspan="2"')}${th('Total Biaya Atribusi<br>' + rp, 'rowspan="2"')}${th('Nilai Perolehan Barang<br>' + rp, 'rowspan="2"')}${th('Harga Satuan Perolehan<br>' + rp, 'rowspan="2"')}${th('Sub Kegiatan dan Rekening Anggaran Belanja Daerah atas Pengadaan Barang', 'colspan="4"')}${th('Tanggal Perolehan', 'rowspan="3"')}${th('Dokumen Sumber Perolehan', 'colspan="3"')}${th('Ket.', 'rowspan="3"')}${th('Aksi', 'rowspan="3" style="position:sticky;right:0;z-index:2;box-shadow:-4px 0 8px rgba(15,23,42,0.06);"')}</tr>`;
    const headRow2 = `<tr>${th('Kode Barang', 'rowspan="2"')}${kotak}${th('Nama Barang', 'rowspan="2"')}${th('Sub Kegiatan', 'colspan="2"')}${th('Rekening Belanja Daerah', 'colspan="2"')}${th('Bentuk Kontrak', 'rowspan="2"')}${th('Nama Penyedia', 'rowspan="2"')}${th('No.', 'rowspan="2"')}</tr>`;
    const headRow3 = `<tr>${kotak}${th(rp)}${th(rp)}${th(rp)}${th(rp)}${th(rp)}${th('Kode Sub Kegiatan')}${th('Nama Sub Kegiatan')}${th('Kode Rekening')}${th('Uraian Belanja')}</tr>`;
    const headRow4 = `<tr>${th('1')}${th('2', 'colspan="7"')}${['3', '4', '5', '6', '7', '8', '9 = 6 X 8', '10', '11 = 9 + 10', '12 = 11 : 6', '13', '14', '15', '16', '17', '18', '19', '20', '21'].map((v) => th(v)).join('')}${th('', 'style="position:sticky;right:0;z-index:2;"')}</tr>`;

    w._p47LastLeafRows = [];
    let noUrut = 0;
    const trs = visibleSections.map((sec, secIdx) => {
      const secHeader = `
        <tr class="bg-blue-50/70 dark:bg-blue-950/40">
          ${td(String.fromCharCode(65 + (secIdx % 26)), 'text-center font-extrabold text-primary font-mono')}
          <td colspan="10" class="p-2 border border-outline-variant/40 text-xs font-extrabold text-primary uppercase tracking-wide">${esc(sec.name)} <span class="font-normal text-[10.5px] text-on-surface-variant ml-1">(${sec.items.length} item)</span></td>
          ${tdNum(sec.qty, 'font-extrabold text-on-surface')}
          ${td('')}
          ${td('')}
          ${tdNum(sec.total, 'font-extrabold text-primary')}
          ${td('')}
          ${tdNum(sec.total, 'font-extrabold text-primary')}
          ${Array.from({ length: 10 }, () => td('')).join('')}
          <td class="p-1 border border-outline-variant/40 bg-blue-50/70 dark:bg-blue-950/40" style="position:sticky;right:0;"></td>
        </tr>`;

      const itemRows = sec.items.map((r) => {
        noUrut += 1;
        const leafIdx = w._p47LastLeafRows.length;
        w._p47LastLeafRows.push(r);
        const jumlah = Number(r.jumlah || r.volume) || 1;
        const harga = Number(r.harga_satuan || r.hargasatuan || r.harga) || 0;
        const total = Number(r.total_nilai || r.total || (jumlah * harga)) || 0;
        const atribusi = Number(r.biaya_atribusi) || 0;
        const perolehan = Number(r.nilai_perolehan) || total;
        const hsp = Number(r.harga_satuan_perolehan) || (jumlah > 0 ? Math.round(perolehan / jumlah) : harga);
        const c = [td(noUrut, 'text-center text-on-surface-variant font-mono tabular-nums')];
        kodeParts(r).forEach((k) => c.push(td(esc(k), 'text-center font-mono text-[10.5px]')));
        c.push(td(esc(r.nama_barang || r.nama || ''), 'font-bold text-on-surface'));
        c.push(td(esc(r.spesifikasi || ''), 'text-on-surface-variant'));
        c.push(td(esc(r.merek || ''), 'text-on-surface-variant'));
        c.push(tdNum(jumlah));
        c.push(td(esc(r.satuan || 'Unit'), 'text-center text-on-surface-variant'));
        c.push(tdNum(harga));
        c.push(tdNum(total, 'font-bold text-primary'));
        c.push(tdNum(atribusi));
        c.push(tdNum(perolehan, 'font-bold'));
        c.push(tdNum(hsp));
        c.push(td(esc(r.sub_kegiatan || ''), 'text-center font-mono text-[10.5px]'));
        c.push(td(esc(r.nama_sub_kegiatan || ''), 'text-on-surface-variant'));
        c.push(td(esc(r.kode_rekening || ''), 'text-center font-mono text-[10.5px]'));
        c.push(td(esc(r.uraian_belanja || sec.name), 'text-on-surface-variant'));
        c.push(td(esc(tglIndo(r.tgl_nota || r.tanggal || r.tgl)), 'text-center whitespace-nowrap'));
        c.push(td(esc(r.bentuk_kontrak || r.kontrak || ''), 'text-on-surface-variant'));
        c.push(td(esc(r.nama_penyedia || r.penyedia || ''), 'text-on-surface-variant'));
        c.push(td(esc(r.dokumen_sumber || r.no_bukti || r.no_nota || ''), 'text-on-surface-variant'));
        c.push(td(esc(r.keterangan || r.ket || ''), 'text-on-surface-variant'));
        const aksiHtml = r.detail_id
          ? `<div class="inline-flex items-center gap-1"><button type="button" onclick="window.AsetSettings?.openEditPermen47Row(${leafIdx})" class="px-2 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-[10.5px] font-bold cursor-pointer">Edit</button><button type="button" onclick="window.AsetSettings?.deletePermen47Row(${leafIdx})" class="px-2 py-1 rounded-lg bg-rose-500/15 text-rose-700 hover:bg-rose-500/25 text-[10.5px] font-bold cursor-pointer">Hapus</button></div>`
          : '<span class="text-[10px] text-on-surface-variant">-</span>';
        c.push(`<td class="p-1.5 border border-outline-variant/40 bg-surface-container-lowest text-center whitespace-nowrap" style="position:sticky;right:0;z-index:1;box-shadow:-4px 0 8px rgba(15,23,42,0.06);">${aksiHtml}</td>`);
        return `<tr>${c.join('')}</tr>`;
      }).join('');

      return secHeader + itemRows;
    }).join('');

    const sectionPills = [
      `<button type="button" onclick="window.AsetSettings?.setPermen47Section('ALL')" class="px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${_p47ActiveSection === 'ALL' ? 'bg-primary text-on-primary shadow-xs' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'}">Semua Akun (${leafRowsAll.length})</button>`,
      ...sections.map((s) => {
        const act = _p47ActiveSection === s.name;
        const safeName = esc(s.name).replace(/'/g, '&#39;');
        return `<button type="button" onclick="window.AsetSettings?.setPermen47Section('${safeName}')" class="px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${act ? 'bg-primary text-on-primary shadow-xs' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'}">${esc(s.name)} <span class="opacity-75 font-mono">(${s.items.length})</span></button>`;
      }),
    ].join('');

    const foot = `<tr>${td('')}<td colspan="13" class="p-2 border border-outline-variant/50 text-center font-extrabold tracking-widest bg-surface-container-low text-on-surface text-xs">J U M L A H &nbsp;&nbsp; T O T A L</td>${tdNum(totalKeseluruhan, 'font-extrabold text-primary')}${tdNum(0)}${tdNum(totalKeseluruhan, 'font-extrabold text-primary')}${tdNum(0)}${Array.from({ length: 10 }, () => td('')).join('')}</tr>`;

    container.innerHTML = `
      <div class="rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-4">
        <div class="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-outline-variant/30">
          <div class="flex-1 text-center">
            <div class="text-sm font-extrabold text-on-surface tracking-wide">LAPORAN PENGADAAN BMD BERUPA ASET LANCAR PERSEDIAAN</div>
            <div class="text-xs font-bold text-primary mt-1">Periode: ${esc(labelPeriode)} Tahun ${esc(meta.tahun)}</div>
            <div class="text-[11px] text-on-surface-variant mt-0.5">Pemerintah Kabupaten Sumba Barat • Pengguna Barang: BAPPERIDA</div>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-1.5 pb-3 mb-3 border-b border-outline-variant/20">
          ${sectionPills}
        </div>
        <div class="flex items-center justify-between gap-2 mb-2 text-[11px] text-on-surface-variant">
          <span>Format 21 Kolom Permendagri No. 47 — dikelompokkan per akun belanja, kolom <strong>Aksi</strong> tetap menempel di kanan</span>
          <div class="inline-flex items-center gap-1.5 shrink-0">
            <button type="button" onclick="document.getElementById('permen47ScrollBox')?.scrollBy({left:-420,behavior:'smooth'})" class="px-2.5 py-1 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-bold cursor-pointer">← Geser Kiri</button>
            <button type="button" onclick="document.getElementById('permen47ScrollBox')?.scrollBy({left:420,behavior:'smooth'})" class="px-2.5 py-1 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-bold cursor-pointer">Geser Kanan →</button>
          </div>
        </div>
        <div id="permen47ScrollBox" class="permen47-scroll overflow-x-auto pb-2">
          <table class="w-full border-collapse min-w-[1680px]">
            <thead>${headRow1}${headRow2}${headRow3}${headRow4}</thead>
            <tbody>${trs}</tbody>
            <tfoot>${foot}</tfoot>
          </table>
        </div>
      </div>`;
  }

  async function openEditPermen47Row(idx) {
    const row = (w._p47LastLeafRows || [])[idx];
    if (!row || !row.detail_id || !w.Swal) return;
    const { value: formVal } = await w.Swal.fire({
      title: `Edit: ${row.nama_barang || 'Item Pengadaan'}`,
      html: `
        <div class="text-left space-y-2.5 text-xs">
          <div class="grid grid-cols-2 gap-2">
            <div><label class="font-bold text-slate-600 block mb-1">Jumlah (${esc(row.satuan || 'Unit')})</label><input id="ep47Vol" type="number" min="1" value="${Number(row.jumlah || 1)}" class="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono" /></div>
            <div><label class="font-bold text-slate-600 block mb-1">Harga Satuan (Rp)</label><input id="ep47Harga" type="number" min="0" value="${Number(row.harga_satuan || 0)}" class="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono" /></div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="font-bold text-slate-600 block mb-1">Tanggal Perolehan</label><input id="ep47Tgl" type="date" value="${esc(String(row.tgl_nota || '').slice(0, 10))}" class="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono" /></div>
            <div><label class="font-bold text-slate-600 block mb-1">Bentuk Kontrak</label><input id="ep47Kontrak" type="text" value="${esc(row.bentuk_kontrak || '')}" class="w-full px-3 py-2 rounded-xl border border-slate-200" /></div>
          </div>
          <div><label class="font-bold text-slate-600 block mb-1">Nama Penyedia</label><input id="ep47Penyedia" type="text" value="${esc(row.nama_penyedia || '')}" class="w-full px-3 py-2 rounded-xl border border-slate-200" /></div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="font-bold text-slate-600 block mb-1">Kode Sub Kegiatan</label><input id="ep47SubKeg" type="text" value="${esc(row.sub_kegiatan || '')}" class="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono" /></div>
            <div><label class="font-bold text-slate-600 block mb-1">No. Dokumen / SP2D</label><input id="ep47Dok" type="text" value="${esc(row.dokumen_sumber || '')}" class="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono" /></div>
          </div>
        </div>`,
      showCancelButton: true,
      confirmButtonText: 'Simpan Perubahan',
      cancelButtonText: 'Batal',
      preConfirm: () => ({
        detail_id: row.detail_id,
        penerimaan_id: row.penerimaan_id || '',
        jumlah: Number(d.getElementById('ep47Vol')?.value || 1),
        harga_satuan: Number(d.getElementById('ep47Harga')?.value || 0),
        tgl_nota: d.getElementById('ep47Tgl')?.value || '',
        bentuk_kontrak: d.getElementById('ep47Kontrak')?.value || '',
        nama_penyedia: d.getElementById('ep47Penyedia')?.value || '',
        sub_kegiatan: d.getElementById('ep47SubKeg')?.value || '',
        dokumen_sumber: d.getElementById('ep47Dok')?.value || '',
      }),
    });
    if (!formVal) return;
    try {
      const r = await fetch('/api/simapo/penerimaan-item-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formVal),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false) throw new Error(j.message || `HTTP ${r.status}`);
      w.Swal.fire({ icon: 'success', title: 'Diperbarui', text: 'Item pengadaan berhasil disimpan.', timer: 1800, showConfirmButton: false });
      await loadLaporanPermen47();
    } catch (err) {
      w.Swal.fire({ icon: 'error', title: 'Gagal Memperbarui', text: err.message });
    }
  }

  async function deletePermen47Row(idx) {
    const row = (w._p47LastLeafRows || [])[idx];
    if (!row || !row.detail_id || !w.Swal) return;
    const res = await w.Swal.fire({
      title: 'Hapus Item Pengadaan?',
      text: `${row.nama_barang || 'Item'} (${row.jumlah || 1} ${row.satuan || 'Unit'}) akan dihapus dari laporan.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e11d48',
      confirmButtonText: 'Ya, Hapus',
      cancelButtonText: 'Batal',
    });
    if (!res.isConfirmed) return;
    try {
      const r = await fetch('/api/simapo/penerimaan-item-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ detail_id: row.detail_id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false) throw new Error(j.message || `HTTP ${r.status}`);
      w.Swal.fire({ icon: 'success', title: 'Dihapus', text: 'Item pengadaan telah dihapus.', timer: 1600, showConfirmButton: false });
      await loadLaporanPermen47();
    } catch (err) {
      w.Swal.fire({ icon: 'error', title: 'Gagal Menghapus', text: err.message });
    }
  }

  async function loadLaporanPermen47() {
    const container = d.getElementById('permen47PreviewContainer');
    if (!container) return;
    const periode = d.getElementById('permen47Periode')?.value || 'TAHUNAN';
    const tahun = d.getElementById('permen47Tahun')?.value || String(new Date().getFullYear());
    const instId = (localStorage.getItem('MY_INSTANSI') || localStorage.getItem('_sess_inst') || 'bapperida').trim() || 'bapperida';

    container.innerHTML = '<div class="p-8 text-center text-xs text-on-surface-variant">Memuat data laporan Permendagri 47...</div>';
    try {
      const url = `/api/simapo/laporan-permen47?periode=${encodeURIComponent(periode)}&tahun=${encodeURIComponent(tahun)}&instansi_id=${encodeURIComponent(instId)}`;
      const res = await fetch(url);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || json.ok === false) throw new Error((json && json.message) || `HTTP ${res.status}`);
      const payload = json.data || json;
      const rows = Array.isArray(payload) ? payload : (Array.isArray(payload.rows) ? payload.rows : (Array.isArray(payload.items) ? payload.items : []));
      renderPermen47Preview(rows, Object.assign({ periode, tahun }, typeof payload === 'object' && !Array.isArray(payload) ? payload : {}));
    } catch (err) {
      container.innerHTML = `<div class="p-6 text-center text-xs text-error font-semibold">Gagal memuat laporan Permen 47: ${esc(err.message)}</div>`;
    }
  }

  async function downloadLaporanPermen47Excel() {
    const periode = d.getElementById('permen47Periode')?.value || 'TAHUNAN';
    const tahun = d.getElementById('permen47Tahun')?.value || String(new Date().getFullYear());
    const instId = (localStorage.getItem('MY_INSTANSI') || localStorage.getItem('_sess_inst') || 'bapperida').trim() || 'bapperida';
    const url = `/api/simapo/laporan-permen47/xlsx?periode=${encodeURIComponent(periode)}&tahun=${encodeURIComponent(tahun)}&instansi_id=${encodeURIComponent(instId)}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = d.createElement('a');
      a.href = blobUrl;
      a.download = `Laporan_Pengadaan_Pakai_Habis_Permen47_${periode}_${tahun}.xlsx`;
      d.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
    } catch (err) {
      if (w.Swal) w.Swal.fire({ icon: 'error', title: 'Gagal Unduh Excel', text: err.message });
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
    loadPemeliharaan,
    filterKartuPemeliharaan,
    toggleFormPemeliharaan,
    onPmBarangChange,
    addPemeliharaanRow,
    removePemeliharaanRow,
    updatePmTotalBiaya,
    savePemeliharaan,
    editPemeliharaan,
    deletePemeliharaan,
    downloadExcelKartuPemeliharaan,
    cetakKartuPemeliharaan,
    openCatatPemeliharaanModal,
    loadTiketList,
    updateTiketStatus,
    loadPinjamFullTable,
    loadPengaturanAll,
    openRuanganModal,
    savePejabatSettings,
    addKategori,
    deleteKategori,
    loadBastHistory,
    downloadPermen47Excel,
    downloadKartuPemeliharaanExcel,
    loadLaporanPermen47,
    downloadLaporanPermen47Excel,
    setPermen47Section,
    openEditPermen47Row,
    deletePermen47Row,
    toggleFormPermen47,
    addPermen47Item,
    removePermen47Item,
    savePermen47Nota,
    switchMobileAsetTab,
    loadMobilePemeliharaan,
    loadMobilePengaturan,
    loadMobileLaporan,
    loadMobileTiket,
  };

  function boot() {
    if (!d.getElementById('asetPanelInventaris')) return;
    switchTab(resolveTab(), false);
    w.addEventListener('hashchange', () => {
      const t = resolveTab();
      if (t !== _activeTab) switchTab(t, false);
    });
    // Seamless auto-sync saat ada perubahan data aset (same-tab / cross-tab / kembali ke tab)
    if (w.StitchSync && typeof w.StitchSync.on === 'function') {
      w.StitchSync.on(['aset'], (ev) => {
        if (!ev || !ev.remote) return;
        if (_activeTab === 'inventaris' && typeof w.loadRealAsetData === 'function') w.loadRealAsetData();
        else if (_activeTab === 'pemeliharaan') loadPemeliharaan(true);
        else if (_activeTab === 'tiket-pinjam') { loadTiketList(true); loadPinjamFullTable(true); }
        else if (_activeTab === 'laporan-permen47') loadLaporanPermen47();
        else if (_activeTab === 'pengaturan') loadPengaturanAll();
      }, 280);
    }
    // Enhance filter selects in aset-kir.html with StitchPicker
    setTimeout(() => refreshPickers(d.getElementById('asetPanelInventaris')), 120);
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window, document);
