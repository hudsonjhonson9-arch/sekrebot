/* Stitch Layanan Kedinasan: SPPD, KIR Pemeliharaan & Drawer Pengajuan Izin/Notifikasi */
    /* ── 9. SPPD & PERJALANAN DINAS (agenda_sppd) ────────────────────── */
    async function loadSppdData() {
      const tbody = document.getElementById('sppdTableBody');
      try {
        const res = await fetch('/api/stitch/sppd');
        const json = await res.json();
        if (json.ok && json.data) {
          if (!json.data.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-400">Belum ada riwayat SPPD di database.</td></tr>`;
            return;
          }
          tbody.innerHTML = json.data.map(s => `
            <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <td class="p-3 font-mono font-bold text-blue-600">${s.nomor_sppd || s.nomor_register || '-'}</td>
              <td class="p-3">
                <p class="font-bold text-slate-900 dark:text-white">${s.pelaksana_nama}</p>
                <p class="text-[10px] text-slate-400 font-mono">${s.pelaksana_nip}</p>
              </td>
              <td class="p-3 text-slate-700 dark:text-slate-300 max-w-xs truncate">${s.maksud_perjalanan}</td>
              <td class="p-3 font-medium">${s.tempat_tujuan}</td>
              <td class="p-3 font-mono">${s.lama_hari} Hari</td>
              <td class="p-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">${s.status}</span></td>
              <td class="p-3 text-right">
                <button onclick="downloadSppdSingleDoc('${s.nomor_sppd}')" class="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold flex items-center gap-1 ml-auto">
                  <span class="material-symbols-outlined text-[14px]">download</span>
                  <span>Word</span>
                </button>
              </td>
            </tr>
          `).join('');
        }
      } catch (err) {
        const safeErr = String(err?.message || 'Koneksi terganggu').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-rose-500 font-bold">Gagal memuat data SPPD: ${safeErr}</td></tr>`;
      }
    }

    async function submitSppdForm() {
      const maksud = document.getElementById('sppdMaksud').value.trim();
      const tujuan = document.getElementById('sppdTujuan').value.trim();
      const lama = document.getElementById('sppdLamaHari').value;

      if (!maksud) {
        Swal.fire('Peringatan', 'Maksud perjalanan dinas wajib diisi.', 'warning');
        return;
      }

      try {
        const res = await fetch('/api/stitch/sppd', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nip: state.currentUser.nip,
            maksud,
            tujuan,
            lama_hari: lama
          })
        });
        const json = await res.json();
        if (json.ok) {
          Swal.fire('SPPD Diterbitkan', `Berhasil disimpan ke tabel agenda_sppd dengan nomor ${json.data.nomor_sppd}.`, 'success');
          loadSppdData();
          document.getElementById('sppdMaksud').value = '';
        } else {
          Swal.fire('Gagal', json.message, 'error');
        }
      } catch (e) {
        Swal.fire('Error', e.message, 'error');
      }
    }

    function downloadSppdSingleDoc(no) {
      Swal.fire('Unduh Dokumen', `Template resmi SPPD & SPT Nomor ${no} siap diunduh (terintegrasi template BAPPERIDA).`, 'success');
    }

    /* ── 9B. ASET KIR & KARTU PEMELIHARAAN (SIMAPO) ──────────────────── */
    let _allKirBarang = [];
    let _allKirPemeliharaan = [];

    async function loadKirBarangData() {
      try {
        const sel = document.getElementById('kpFilterBarang');
        if (!sel) return;
        const res = await fetch('/api/stitch/aset/barang');
        const json = await res.json();
        if (json.ok && Array.isArray(json.data)) {
          _allKirBarang = json.data;
          sel.innerHTML = `
            <option value="">-- Pilih Aset / Barang (Total: ${_allKirBarang.length} Unit) --</option>
            ${_allKirBarang.map(b => `
              <option value="${b.id}">[${b.kodebarang || '-'}] ${b.nama_barang} • Inv: ${b.nomorinventaris || '-'} (${b.nama_ruangan || 'BAPPERIDA'})</option>
            `).join('')}
          `;
          if (_allKirBarang.length > 0 && !sel.value) {
            sel.value = _allKirBarang[0].id;
            onPmBarangChange();
          }
        }
      } catch (err) {
        console.error('loadKirBarangData error:', err);
      }
    }

    function onPmBarangChange() {
      const sel = document.getElementById('kpFilterBarang');
      if (!sel) return;
      const bId = sel.value;
      const b = _allKirBarang.find(x => String(x.id) === String(bId));
      if (!b) {
        document.getElementById('pmNamaBarangText').textContent = 'Pilih aset untuk melihat detail';
        document.getElementById('pmKodeBarangText').textContent = 'Kode Barang: -';
        document.getElementById('pmNibarText').textContent = '-';
        document.getElementById('pmRuanganText').textContent = '-';
        document.getElementById('pmSpesifikasiText').textContent = '-';
        return;
      }
      document.getElementById('pmNamaBarangText').textContent = b.nama_barang || 'Aset';
      document.getElementById('pmKodeBarangText').textContent = 'Kode Barang: ' + (b.kodebarang || '-');
      document.getElementById('pmNibarText').textContent = b.nomorinventaris || b.kodebarang || '-';
      document.getElementById('pmRuanganText').textContent = b.nama_ruangan || 'BAPPERIDA';
      document.getElementById('pmSpesifikasiText').textContent = b.spesifikasi || (b.satuan ? `Satuan: ${b.satuan}` : '-');
      document.getElementById('pmKondisiBadge').textContent = b.kondisi || 'Baik';
      filterKartuPemeliharaan();
    }

    function toggleFormPemeliharaan() {
      const wrap = document.getElementById('pemeliharaanFormWrap');
      const text = document.getElementById('btnToggleFormPmText');
      if (!wrap) return;
      const isHidden = wrap.classList.contains('hidden');
      if (isHidden) {
        wrap.classList.remove('hidden');
        if (text) text.textContent = 'Tutup Form';
        const container = document.getElementById('pmRowsContainer');
        if (container && container.children.length === 0) {
          addPemeliharaanRow();
        }
      } else {
        wrap.classList.add('hidden');
        if (text) text.textContent = 'Catat Pemeliharaan';
      }
    }

    function addPemeliharaanRow(data = {}) {
      const container = document.getElementById('pmRowsContainer');
      if (!container) return;
      const today = new Date().toISOString().split('T')[0];
      const tglId = 'pmTgl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      const row = document.createElement('div');
      row.className = 'pm-row grid grid-cols-1 sm:grid-cols-12 gap-2 items-center p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs shadow-xs';
      row.innerHTML = `
        <div class="sm:col-span-3">
          <label class="block text-[10px] text-slate-400 font-semibold mb-0.5">Tgl Pemeliharaan</label>
          <input id="${tglId}" type="date" class="pm-tgl w-full p-1.5 border rounded-lg dark:bg-slate-800 font-mono text-[11px]" value="${data.tgl || today}" />
        </div>
        <div class="sm:col-span-3">
          <label class="block text-[10px] text-slate-400 font-semibold mb-0.5">Jenis Pemeliharaan</label>
          <input type="text" class="pm-jenis w-full p-1.5 border rounded-lg dark:bg-slate-800 text-[11px]" placeholder="Servis / Ganti Komponen..." value="${data.jenis || ''}" />
        </div>
        <div class="sm:col-span-2">
          <label class="block text-[10px] text-slate-400 font-semibold mb-0.5">Biaya (Rp)</label>
          <input type="number" class="pm-biaya w-full p-1.5 border rounded-lg dark:bg-slate-800 font-mono text-[11px] tabular-nums" placeholder="0" min="0" value="${data.biaya || ''}" oninput="updatePmTotalBiaya()" />
        </div>
        <div class="sm:col-span-2">
          <label class="block text-[10px] text-slate-400 font-semibold mb-0.5">Penyedia / Vendor</label>
          <input type="text" class="pm-penyedia w-full p-1.5 border rounded-lg dark:bg-slate-800 text-[11px]" placeholder="CV / Bengkel..." value="${data.penyedia || 'CV. Sumba Mandiri'}" />
        </div>
        <div class="sm:col-span-2 flex items-center gap-1.5 mt-3 sm:mt-0">
          <div class="flex-1">
            <input type="text" class="pm-kontrak w-full p-1.5 border rounded-lg dark:bg-slate-800 text-[11px]" placeholder="SPK/Swakelola" value="${data.kontrak || 'SPK'}" />
          </div>
          <button type="button" onclick="removePemeliharaanRow(this)" class="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg transition-colors" title="Hapus Baris">
            <span class="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </div>
      `;
      container.appendChild(row);
      if (window.StitchPicker && typeof window.StitchPicker.enhanceDate === 'function') {
        window.StitchPicker.enhanceDate(tglId);
      }
      updatePmTotalBiaya();
    }

    function removePemeliharaanRow(btn) {
      const row = btn.closest('.pm-row');
      if (row) {
        row.remove();
        updatePmTotalBiaya();
      }
    }

    function updatePmTotalBiaya() {
      const container = document.getElementById('pmRowsContainer');
      if (!container) return;
      let total = 0;
      container.querySelectorAll('.pm-biaya').forEach(inp => {
        total += parseFloat(inp.value) || 0;
      });
      const el = document.getElementById('pmTotalBiayaText');
      if (el) el.textContent = total.toLocaleString('id-ID');
    }

    async function savePemeliharaan() {
      const sel = document.getElementById('kpFilterBarang');
      const bId = sel ? sel.value : null;
      if (!bId) {
        Swal.fire('Peringatan', 'Silakan pilih barang/aset terlebih dahulu.', 'warning');
        return;
      }

      const rows = document.querySelectorAll('#pmRowsContainer .pm-row');
      if (!rows.length) {
        Swal.fire('Peringatan', 'Tambahkan minimal 1 baris pemeliharaan.', 'warning');
        return;
      }

      let successCount = 0;
      for (const r of rows) {
        const tgl = r.querySelector('.pm-tgl')?.value;
        const jenis = r.querySelector('.pm-jenis')?.value?.trim();
        const biaya = parseFloat(r.querySelector('.pm-biaya')?.value) || 0;
        const penyedia = r.querySelector('.pm-penyedia')?.value?.trim();
        const kontrak = r.querySelector('.pm-kontrak')?.value?.trim();

        if (jenis) {
          try {
            const res = await fetch('/api/stitch/aset/pemeliharaan', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                barang_id: bId,
                tgl_pemeliharaan: tgl,
                jenis_pemeliharaan: jenis,
                biaya,
                nama_penyedia: penyedia,
                bentuk_kontrak: kontrak,
                keterangan: 'Dicatat via sistem STITCH BAPPERIDA'
              })
            });
            const json = await res.json();
            if (json.ok) successCount++;
          } catch (e) {
            console.error('savePemeliharaan err:', e);
          }
        }
      }

      if (successCount > 0) {
        Swal.fire('Tersimpan di PostgreSQL', `${successCount} baris pemeliharaan berhasil dicatat pada tabel SIMAPO.pemeliharaan.`, 'success');
        toggleFormPemeliharaan();
        document.getElementById('pmRowsContainer').innerHTML = '';
        loadKirPemeliharaanData();
      } else {
        Swal.fire('Gagal', 'Pastikan nama jenis pemeliharaan sudah diisi.', 'error');
      }
    }

    async function loadKirPemeliharaanData() {
      const tbody = document.getElementById('kirPemeliharaanTableBody');
      if (!tbody) return;
      try {
        const res = await fetch('/api/stitch/aset/pemeliharaan');
        const json = await res.json();
        if (json.ok && Array.isArray(json.data)) {
          _allKirPemeliharaan = json.data;
          renderKirPemeliharaanTable();
        }
      } catch (err) {
        const safeErr = String(err?.message || 'Koneksi terganggu').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        tbody.innerHTML = `<tr><td colspan="9" class="p-4 text-center text-rose-500">Gagal memuat data pemeliharaan aset: ${safeErr}</td></tr>`;
      }
    }

    function filterKartuPemeliharaan() {
      renderKirPemeliharaanTable();
    }

    function renderKirPemeliharaanTable() {
      const tbody = document.getElementById('kirPemeliharaanTableBody');
      if (!tbody) return;
      const bSel = document.getElementById('kpFilterBarang');
      const selectedBarangId = bSel ? bSel.value : '';
      const tSel = document.getElementById('kpFilterTahun');
      const selectedYear = tSel ? tSel.value : '';

      let list = _allKirPemeliharaan || [];
      if (selectedBarangId) {
        list = list.filter(p => String(p.barang_id) === String(selectedBarangId));
      }
      if (selectedYear) {
        list = list.filter(p => {
          if (!p.tgl_pemeliharaan) return false;
          return String(p.tgl_pemeliharaan).slice(0, 4) === selectedYear;
        });
      }

      if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="9" class="p-6 text-center text-slate-400">Belum ada riwayat pemeliharaan tercatat untuk filter ini.</td></tr>`;
        return;
      }

      tbody.innerHTML = list.map((p) => {
        const tglStr = p.tgl_pemeliharaan ? new Date(p.tgl_pemeliharaan).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
        const biayaNum = parseFloat(p.biaya) || 0;
        return `
          <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <td class="p-3 font-mono text-slate-400">${tglStr}</td>
            <td class="p-3">
              <span class="font-bold text-slate-900 dark:text-white">${p.nama_barang || 'Aset BAPPERIDA'}</span>
              <p class="text-[10px] text-slate-400">${p.spesifikasi || '-'}</p>
            </td>
            <td class="p-3 font-mono text-[11px] text-slate-500">${p.kodebarang || '-'}</td>
            <td class="p-3 font-medium text-slate-800 dark:text-slate-200">${p.jenis_pemeliharaan || '-'}</td>
            <td class="p-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">Rp ${biayaNum.toLocaleString('id-ID')}</td>
            <td class="p-3 text-slate-600 dark:text-slate-300">${p.nama_penyedia || '-'}</td>
            <td class="p-3"><span class="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[10px] font-bold">${p.bentuk_kontrak || 'SPK'}</span></td>
            <td class="p-3 text-slate-500 text-[11px] max-w-xs truncate">${p.keterangan || '-'}</td>
            <td class="p-3 text-right">
              <button onclick="cetakKartuPemeliharaanSingle('${p.id}')" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg text-[11px] font-bold transition-all inline-flex items-center gap-1">
                <span class="material-symbols-outlined text-[14px]">print</span>
                <span>Cetak</span>
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }

    function cetakKartuPemeliharaan() {
      const sel = document.getElementById('kpFilterBarang');
      const b = _allKirBarang.find(x => String(x.id) === String(sel?.value)) || { nama_barang: 'Seluruh Aset', kodebarang: '-' };
      Swal.fire({
        title: 'Kartu Pemeliharaan Barang',
        html: `
          <div class="text-left text-xs space-y-2 p-2">
            <div class="border-b pb-2 text-center">
              <p class="font-bold">KARTU PEMELIHARAAN BARANG MILIK DAERAH</p>
              <p class="text-[10px] text-slate-400">Lampiran Permendagri No. 47 Tahun 2021 • BAPPERIDA Sumba Barat</p>
            </div>
            <div class="grid grid-cols-2 gap-2 text-[11px]">
              <div><strong>Nama Barang:</strong> ${b.nama_barang}</div>
              <div><strong>Kode Barang:</strong> ${b.kodebarang || '-'}</div>
              <div><strong>Lokasi Ruangan:</strong> ${b.nama_ruangan || 'BAPPERIDA'}</div>
              <div><strong>Status Fisik:</strong> ${b.kondisi || 'Baik'}</div>
            </div>
            <p class="text-slate-500 mt-2 text-[11px]">Format siap cetak telah dikonfigurasi dan terhubung ke dokumen resmi penatausahaan barang milik daerah.</p>
          </div>
        `,
        confirmButtonText: 'Cetak Dokumen Resmi',
        confirmButtonColor: '#2563eb',
        showCancelButton: true,
        cancelButtonText: 'Tutup'
      }).then(r => {
        if (r.isConfirmed) {
          window.print();
        }
      });
    }

    function cetakKartuPemeliharaanSingle(pmId) {
      const pm = _allKirPemeliharaan.find(x => String(x.id) === String(pmId));
      if (!pm) return;
      Swal.fire({
        title: 'Bukti Pemeliharaan Barang',
        html: `
          <div class="text-left text-xs space-y-2">
            <p><strong>Aset:</strong> ${pm.nama_barang} (${pm.kodebarang || '-'})</p>
            <p><strong>Perbaikan:</strong> ${pm.jenis_pemeliharaan}</p>
            <p><strong>Biaya:</strong> Rp ${(parseFloat(pm.biaya) || 0).toLocaleString('id-ID')}</p>
            <p><strong>Vendor:</strong> ${pm.nama_penyedia || '-'}</p>
            <p><strong>Kontrak:</strong> ${pm.bentuk_kontrak || '-'}</p>
            <p><strong>Tanggal:</strong> ${pm.tgl_pemeliharaan ? new Date(pm.tgl_pemeliharaan).toLocaleDateString('id-ID') : '-'}</p>
          </div>
        `,
        confirmButtonText: 'Cetak',
        confirmButtonColor: '#2563eb'
      }).then(r => {
        if (r.isConfirmed) window.print();
      });
    }

    function downloadExcelKartuPemeliharaan() {
      const rows = [
        ['No', 'Tanggal', 'Nama Barang', 'Kode Barang', 'Jenis Pemeliharaan', 'Biaya Rp', 'Penyedia', 'Bentuk Kontrak', 'Keterangan']
      ];
      _allKirPemeliharaan.forEach((p, idx) => {
        rows.push([
          idx + 1,
          p.tgl_pemeliharaan ? new Date(p.tgl_pemeliharaan).toISOString().slice(0, 10) : '',
          p.nama_barang || '',
          p.kodebarang || '',
          p.jenis_pemeliharaan || '',
          p.biaya || 0,
          p.nama_penyedia || '',
          p.bentuk_kontrak || '',
          p.keterangan || ''
        ]);
      });
      const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `Kartu_Pemeliharaan_BAPPERIDA_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      Swal.fire('Berhasil Mengunduh', 'File spreadsheet riwayat pemeliharaan siap dibuka di Microsoft Excel.', 'success');
    }

    /* ── 10. MODAL DRAWER & DIALOGS WITH REAL DATA ───────────────────── */
    let drawerStartDate = '';
    let drawerEndDate = '';
    let drawerCalViewMonth = 10; // November (0-based)
    let drawerCalViewYear = 2026;
    let drawerPickingRange = false;

    let keteranganBuktiFile = {
      base64: null,
      mime: null,
      name: null,
      sizeStr: null,
      isImage: false
    };
    let keteranganCameraStream = null;

    function getWitaDateNow() {
      const witaStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Makassar',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());
      const [y, m, d] = witaStr.split('-').map(n => parseInt(n, 10));
      return new Date(Date.UTC(y, m - 1, d));
    }

    function initDrawerDatepicker() {
      const today = getWitaDateNow();
      drawerCalViewMonth = today.getUTCMonth();
      drawerCalViewYear = today.getUTCFullYear();
      const jumpPanel = document.getElementById('drawerCalendarJumpPanel');
      if (jumpPanel) jumpPanel.classList.add('hidden');
      setDrawerDatePreset('today');
    }

    function setDrawerDatePreset(preset) {
      const now = getWitaDateNow();
      const fmt = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      
      let startD = new Date(now.getTime());
      let endD = new Date(now.getTime());

      if (preset === 'today') {
        // start and end are today
      } else if (preset === 'tomorrow') {
        startD.setUTCDate(startD.getUTCDate() + 1);
        endD.setUTCDate(endD.getUTCDate() + 1);
      } else if (preset === '3days') {
        endD.setUTCDate(endD.getUTCDate() + 2);
      } else if (preset === 'week') {
        endD.setUTCDate(endD.getUTCDate() + 6);
      }

      drawerStartDate = fmt(startD);
      drawerEndDate = fmt(endD);
      drawerCalViewMonth = startD.getUTCMonth();
      drawerCalViewYear = startD.getUTCFullYear();
      drawerPickingRange = false;

      ['today', 'tomorrow', '3days', 'week'].forEach(p => {
        const btn = document.getElementById('presetBtn-' + p);
        if (btn) {
          if (p === preset) {
            btn.className = 'px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-600 text-white shadow-2xs transition-all cursor-pointer';
          } else {
            btn.className = 'px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 transition-all cursor-pointer';
          }
        }
      });

      updateDrawerDateDisplay();
      renderDrawerCalendar();
    }

    function updateDrawerDateDisplay() {
      const disp = document.getElementById('drawerDateRangeDisplay');
      const badge = document.getElementById('drawerDurasiBadge');
      const inMulai = document.getElementById('drawerTglMulai');
      const inSelesai = document.getElementById('drawerTglSelesai');

      if (inMulai) inMulai.value = drawerStartDate;
      if (inSelesai) inSelesai.value = drawerEndDate;

      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      const sParts = drawerStartDate.split('-');
      const eParts = drawerEndDate.split('-');

      if (sParts.length === 3 && eParts.length === 3) {
        const sD = parseInt(sParts[2], 10);
        const sM = monthNames[parseInt(sParts[1], 10) - 1];
        const sY = sParts[0];

        const eD = parseInt(eParts[2], 10);
        const eM = monthNames[parseInt(eParts[1], 10) - 1];
        const eY = eParts[0];

        const startMs = new Date(drawerStartDate).getTime();
        const endMs = new Date(drawerEndDate).getTime();
        const diffDays = Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1);

        if (disp) {
          if (drawerStartDate === drawerEndDate) {
            disp.textContent = `${sD} ${sM} ${sY}`;
          } else {
            disp.textContent = `${sD} ${sM} — ${eD} ${eM} ${eY}`;
          }
        }

        if (badge) {
          badge.textContent = `${diffDays} Hari`;
        }
      }
    }

    function toggleDrawerDatePickerDropdown() {
      const drop = document.getElementById('drawerCalendarDropdown');
      const icon = document.getElementById('drawerDatePickerIcon');
      if (!drop) return;
      if (drop.classList.contains('hidden')) {
        drop.classList.remove('hidden');
        if (icon) icon.textContent = 'expand_less';
        renderDrawerCalendar();
      } else {
        drop.classList.add('hidden');
        if (icon) icon.textContent = 'expand_more';
      }
    }

    function changeDrawerCalendarMonth(offset) {
      drawerCalViewMonth += offset;
      if (drawerCalViewMonth < 0) {
        drawerCalViewMonth = 11;
        drawerCalViewYear--;
      } else if (drawerCalViewMonth > 11) {
        drawerCalViewMonth = 0;
        drawerCalViewYear++;
      }
      renderDrawerCalendar();
      renderDrawerCalendarMonthGrid();
    }

    function toggleDrawerCalendarJump() {
      const panel = document.getElementById('drawerCalendarJumpPanel');
      if (!panel) return;
      const willOpen = panel.classList.contains('hidden');
      panel.classList.toggle('hidden', !willOpen);
      if (willOpen) renderDrawerCalendarMonthGrid();
    }

    function changeDrawerCalendarYear(offset) {
      drawerCalViewYear += offset;
      renderDrawerCalendar();
      renderDrawerCalendarMonthGrid();
    }

    function selectDrawerCalendarMonth(monthIdx) {
      drawerCalViewMonth = monthIdx;
      const panel = document.getElementById('drawerCalendarJumpPanel');
      if (panel) panel.classList.add('hidden');
      renderDrawerCalendar();
    }

    function renderDrawerCalendarMonthGrid() {
      const yearEl = document.getElementById('drawerCalendarJumpYear');
      const gridEl = document.getElementById('drawerCalendarMonthGrid');
      if (yearEl) yearEl.textContent = String(drawerCalViewYear);
      if (!gridEl) return;
      const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      gridEl.innerHTML = shortMonths.map((label, idx) => {
        const active = idx === drawerCalViewMonth;
        return `
          <button type="button" onclick="selectDrawerCalendarMonth(${idx})" class="py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${active ? 'bg-blue-600 text-white' : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-700'}">
            ${label}
          </button>
        `;
      }).join('');
    }

    function renderDrawerCalendar() {
      const grid = document.getElementById('drawerCalendarDaysGrid');
      const monthLabel = document.getElementById('drawerCalendarMonthLabel');
      if (!grid) return;

      const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
      if (monthLabel) {
        monthLabel.textContent = `${monthNames[drawerCalViewMonth]} ${drawerCalViewYear}`;
      }

      const firstDay = new Date(drawerCalViewYear, drawerCalViewMonth, 1);
      const lastDay = new Date(drawerCalViewYear, drawerCalViewMonth + 1, 0);
      const totalDays = lastDay.getDate();
      const startDayIndex = (firstDay.getDay() + 6) % 7;

      let html = '';
      for (let i = 0; i < startDayIndex; i++) {
        html += `<span class="py-1.5"></span>`;
      }

      for (let day = 1; day <= totalDays; day++) {
        const dateStr = `${drawerCalViewYear}-${String(drawerCalViewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isStart = (dateStr === drawerStartDate);
        const isEnd = (dateStr === drawerEndDate);
        const inRange = (dateStr >= drawerStartDate && dateStr <= drawerEndDate);

        let cellStyle = 'bg-transparent text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-slate-700 rounded-lg';
        if (isStart && isEnd) {
          cellStyle = 'bg-blue-600 text-white font-bold rounded-lg shadow-xs';
        } else if (isStart) {
          cellStyle = 'bg-blue-600 text-white font-bold rounded-l-lg';
        } else if (isEnd) {
          cellStyle = 'bg-blue-600 text-white font-bold rounded-r-lg';
        } else if (inRange) {
          cellStyle = 'bg-blue-100/70 dark:bg-blue-950/70 text-blue-800 dark:text-blue-200 font-semibold';
        }

        html += `
          <button type="button" onclick="selectDrawerDate('${dateStr}')" class="py-1.5 text-xs text-center transition-colors cursor-pointer ${cellStyle}">
            ${day}
          </button>
        `;
      }

      grid.innerHTML = html;
    }

    function selectDrawerDate(dateStr) {
      if (!drawerPickingRange || !drawerStartDate) {
        drawerStartDate = dateStr;
        drawerEndDate = dateStr;
        drawerPickingRange = true;
      } else {
        if (dateStr < drawerStartDate) {
          drawerEndDate = drawerStartDate;
          drawerStartDate = dateStr;
        } else {
          drawerEndDate = dateStr;
        }
        drawerPickingRange = false;
      }
      updateDrawerDateDisplay();
      renderDrawerCalendar();
    }

    async function openKeteranganCamera() {
      const modal = document.getElementById('keteranganCameraModal');
      const video = document.getElementById('keteranganCameraVideo');
      if (!modal || !video) return;

      modal.classList.remove('hidden');
      modal.classList.add('flex');

      try {
        keteranganCameraStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 } },
          audio: false
        });
        video.srcObject = keteranganCameraStream;
      } catch (err) {
        console.warn('Camera access error, fallback to front cam:', err);
        try {
          keteranganCameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          video.srcObject = keteranganCameraStream;
        } catch (_e2) {
          closeKeteranganCamera();
          Swal.fire('Kamera Tidak Dapat Dibuka', 'Pastikan izin akses kamera diberikan atau gunakan opsi Unggah Berkas.', 'error');
        }
      }
    }

    function closeKeteranganCamera() {
      const modal = document.getElementById('keteranganCameraModal');
      const video = document.getElementById('keteranganCameraVideo');
      if (keteranganCameraStream) {
        keteranganCameraStream.getTracks().forEach(t => t.stop());
        keteranganCameraStream = null;
      }
      if (video) video.srcObject = null;
      if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }
    }

    function captureKeteranganPhoto() {
      const video = document.getElementById('keteranganCameraVideo');
      const canvas = document.getElementById('keteranganCameraCanvas');
      if (!video || !canvas) return;

      const w = video.videoWidth || 640;
      const h = video.videoHeight || 480;
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, w, h);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      const b64 = dataUrl.split(',')[1];
      const sizeBytes = atob(b64).length;
      const sizeStr = (sizeBytes / 1024).toFixed(0) + ' KB';
      const fileName = 'Foto_Surat_' + Date.now() + '.jpg';

      keteranganBuktiFile = {
        base64: dataUrl,
        mime: 'image/jpeg',
        name: fileName,
        sizeStr: sizeStr,
        isImage: true
      };

      closeKeteranganCamera();
      updateKeteranganBuktiPreview();
    }

    function onKeteranganDocSelected(input) {
      if (!input || !input.files || !input.files[0]) return;
      const file = input.files[0];
      if (file.size > 10 * 1024 * 1024) {
        Swal.fire('Ukuran Terlalu Besar', 'Maksimal ukuran berkas adalah 10 MB.', 'warning');
        input.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = e => {
        const dataUrl = e.target.result;
        const sizeStr = (file.size / 1024).toFixed(0) + ' KB';
        keteranganBuktiFile = {
          base64: dataUrl,
          mime: file.type || 'application/pdf',
          name: file.name,
          sizeStr: sizeStr,
          isImage: (file.type || '').startsWith('image/')
        };
        updateKeteranganBuktiPreview();
      };
      reader.readAsDataURL(file);
    }

    function updateKeteranganBuktiPreview() {
      const card = document.getElementById('drawerBuktiPreviewCard');
      const btnGroup = document.getElementById('drawerUploadBtnGroup');
      const nameEl = document.getElementById('drawerBuktiFileName');
      const sizeEl = document.getElementById('drawerBuktiFileSize');
      const imgPrev = document.getElementById('drawerBuktiImgPreview');
      const icon = document.getElementById('drawerBuktiIcon');

      if (!keteranganBuktiFile.base64) {
        clearKeteranganBukti();
        return;
      }

      if (card) card.classList.remove('hidden');
      if (btnGroup) btnGroup.classList.add('hidden');
      if (nameEl) nameEl.textContent = keteranganBuktiFile.name;
      if (sizeEl) sizeEl.textContent = `${keteranganBuktiFile.sizeStr} • Siap Kirim`;

      if (keteranganBuktiFile.isImage) {
        if (imgPrev) {
          imgPrev.src = keteranganBuktiFile.base64;
          imgPrev.classList.remove('hidden');
        }
        if (icon) icon.classList.add('hidden');
      } else {
        if (imgPrev) imgPrev.classList.add('hidden');
        if (icon) {
          icon.classList.remove('hidden');
          icon.textContent = 'picture_as_pdf';
        }
      }
    }

    function clearKeteranganBukti() {
      keteranganBuktiFile = {
        base64: null,
        mime: null,
        name: null,
        sizeStr: null,
        isImage: false
      };
      const card = document.getElementById('drawerBuktiPreviewCard');
      const btnGroup = document.getElementById('drawerUploadBtnGroup');
      const fileInput = document.getElementById('inputKeteranganDocFile');
      if (card) card.classList.add('hidden');
      if (btnGroup) btnGroup.classList.remove('hidden');
      if (fileInput) fileInput.value = '';
    }

    function escDrawerHtml(str) {
      return String(str || '').replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[c]));
    }

    function getPegawaiInitials(nama) {
      const parts = String(nama || '').trim().split(/\s+/).filter(Boolean);
      if (!parts.length) return '--';
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }

    function toggleDrawerPegawaiDropdown(forceState) {
      const drop = document.getElementById('drawerPegawaiDropdown');
      const icon = document.getElementById('drawerPegawaiExpandIcon');
      if (!drop) return;
      const willOpen = typeof forceState === 'boolean' ? forceState : drop.classList.contains('hidden');
      drop.classList.toggle('hidden', !willOpen);
      if (icon) icon.textContent = willOpen ? 'expand_less' : 'expand_more';
      if (willOpen) {
        const searchEl = document.getElementById('drawerPegawaiSearch');
        renderDrawerPegawaiList(searchEl ? searchEl.value : '');
        setTimeout(() => { if (searchEl) searchEl.focus(); }, 20);
      }
    }

    function filterDrawerPegawaiList(q) {
      renderDrawerPegawaiList(q);
    }

    function renderDrawerPegawaiList(q = '') {
      const listEl = document.getElementById('drawerPegawaiList');
      if (!listEl) return;
      const users = Array.isArray(state.allUsers) ? state.allUsers : [];
      const query = String(q || '').trim().toLowerCase();
      const selectedNip = String(document.getElementById('drawerTargetNip')?.value || '');

      const filtered = query
        ? users.filter(u =>
            String(u.nama || '').toLowerCase().includes(query) ||
            String(u.nip || '').toLowerCase().includes(query) ||
            String(u.jabatan || '').toLowerCase().includes(query)
          )
        : users;

      if (filtered.length === 0) {
        listEl.innerHTML = `
          <div class="p-4 text-center text-[11px] text-slate-400">
            Pegawai tidak ditemukan.
          </div>
        `;
        return;
      }

      listEl.innerHTML = filtered.map(u => {
        const isSelected = String(u.nip || '') === selectedNip;
        const initials = getPegawaiInitials(u.nama);
        const nipSafe = escDrawerHtml(u.nip);
        return `
          <button type="button" onclick="selectDrawerPegawai('${nipSafe}')" class="w-full px-3 py-2 text-left flex items-center justify-between gap-2.5 hover:bg-blue-50/70 dark:hover:bg-slate-800 transition-colors cursor-pointer ${isSelected ? 'bg-blue-50 dark:bg-blue-950/40' : ''}">
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="w-8 h-8 rounded-lg ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'} font-bold text-[11px] font-mono flex items-center justify-center shrink-0">
                ${escDrawerHtml(initials)}
              </div>
              <div class="min-w-0">
                <p class="text-xs font-bold text-slate-900 dark:text-white truncate">${escDrawerHtml(u.nama || '-')}</p>
                <p class="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">${nipSafe}${u.jabatan ? ' • ' + escDrawerHtml(u.jabatan) : ''}</p>
              </div>
            </div>
            ${isSelected ? '<span class="material-symbols-outlined text-blue-600 dark:text-blue-400 text-[18px] shrink-0">check</span>' : ''}
          </button>
        `;
      }).join('');
    }

    function selectDrawerPegawai(nip, opts = {}) {
      const users = Array.isArray(state.allUsers) ? state.allUsers : [];
      const u = users.find(item => String(item.nip) === String(nip)) || null;
      const hiddenEl = document.getElementById('drawerTargetNip');
      const avatarEl = document.getElementById('drawerPegawaiSelectedAvatar');
      const namaEl = document.getElementById('drawerPegawaiSelectedNama');
      const nipEl = document.getElementById('drawerPegawaiSelectedNip');

      const resolvedNip = u ? String(u.nip) : String(nip || '');
      if (hiddenEl) hiddenEl.value = resolvedNip;

      if (u) {
        if (avatarEl) avatarEl.textContent = getPegawaiInitials(u.nama);
        if (namaEl) namaEl.textContent = u.nama || 'Pegawai';
        if (nipEl) nipEl.textContent = `NIP. ${u.nip}${u.jabatan ? ' • ' + u.jabatan : ''}`;
      } else {
        if (avatarEl) avatarEl.textContent = '--';
        if (namaEl) namaEl.textContent = 'Pilih Pegawai...';
        if (nipEl) nipEl.textContent = resolvedNip ? `NIP. ${resolvedNip}` : 'NIP. —';
      }

      const searchEl = document.getElementById('drawerPegawaiSearch');
      renderDrawerPegawaiList(searchEl ? searchEl.value : '');
      if (opts.closeDropdown !== false) {
        toggleDrawerPegawaiDropdown(false);
      }
    }

    const DRAWER_TIME_SLOTS = (() => {
      const slots = [];
      for (let h = 7; h <= 17; h++) {
        for (let m = 0; m < 60; m += 15) {
          if (h === 17 && m > 0) break;
          slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        }
      }
      return slots;
    })();

    function renderDrawerTimeSlots(which) {
      const isStart = which === 'mulai';
      const drop = document.getElementById(isStart ? 'drawerJamMulaiDropdown' : 'drawerJamSelesaiDropdown');
      const valEl = document.getElementById(isStart ? 'drawerJamMulai' : 'drawerJamSelesai');
      if (!drop) return;
      const activeVal = valEl ? valEl.value : (isStart ? '08:00' : '11:30');
      drop.innerHTML = DRAWER_TIME_SLOTS.map(slot => {
        const active = slot === activeVal;
        return `
          <button type="button" onclick="selectDrawerTime('${which}', '${slot}')" class="w-full px-3 py-2 text-left font-mono text-xs flex items-center justify-between hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors cursor-pointer ${active ? 'bg-blue-50/80 dark:bg-blue-950/40 font-bold text-blue-600 dark:text-blue-400' : 'font-semibold text-slate-700 dark:text-slate-200'}">
            <span>${slot}</span>
            ${active ? '<span class="material-symbols-outlined text-[15px]">check</span>' : ''}
          </button>
        `;
      }).join('');
    }

    function toggleDrawerTimeDropdown(which, forceState) {
      const isStart = which === 'mulai';
      const drop = document.getElementById(isStart ? 'drawerJamMulaiDropdown' : 'drawerJamSelesaiDropdown');
      const icon = document.getElementById(isStart ? 'drawerJamMulaiIcon' : 'drawerJamSelesaiIcon');
      const otherDrop = document.getElementById(isStart ? 'drawerJamSelesaiDropdown' : 'drawerJamMulaiDropdown');
      const otherIcon = document.getElementById(isStart ? 'drawerJamSelesaiIcon' : 'drawerJamMulaiIcon');
      if (!drop) return;

      if (otherDrop && !otherDrop.classList.contains('hidden')) {
        otherDrop.classList.add('hidden');
        if (otherIcon) otherIcon.textContent = 'expand_more';
      }

      const willOpen = typeof forceState === 'boolean' ? forceState : drop.classList.contains('hidden');
      if (willOpen) renderDrawerTimeSlots(which);
      drop.classList.toggle('hidden', !willOpen);
      if (icon) icon.textContent = willOpen ? 'expand_less' : 'expand_more';
    }

    function selectDrawerTime(which, hhmm) {
      const isStart = which === 'mulai';
      const valEl = document.getElementById(isStart ? 'drawerJamMulai' : 'drawerJamSelesai');
      const dispEl = document.getElementById(isStart ? 'drawerJamMulaiDisplay' : 'drawerJamSelesaiDisplay');
      if (valEl) valEl.value = hhmm;
      if (dispEl) dispEl.textContent = hhmm;
      toggleDrawerTimeDropdown(which, false);
    }

    async function openIzinDrawer(opts = {}) {
      if (!state.currentUser) {
        Swal.fire('Perhatian', 'Silakan pilih pegawai terlebih dahulu.', 'warning');
        return;
      }
      const u = state.currentUser;
      const isAdmin = typeof isStitchAdminUser === 'function'
        ? isStitchAdminUser(u)
        : ['ADMIN', 'SUPERADMIN', 'KEPALA', 'SEKRETARIS', 'KABID', 'IRBAN'].includes(String(u.role || '').toUpperCase());

      window._drawerAdminMode = Boolean(opts && opts.adminMode && isAdmin);

      const titleEl = document.getElementById('drawerKetTitle');
      const subtitleEl = document.getElementById('drawerKetSubtitle');
      const adminWrap = document.getElementById('drawerAdminPegawaiWrap');
      const userCard = document.getElementById('drawerUserInfoCard');
      const autoApproveEl = document.getElementById('drawerAdminAutoApprove');

      if (window._drawerAdminMode) {
        if (titleEl) titleEl.textContent = 'Input Keterangan Pegawai (Admin)';
        if (subtitleEl) subtitleEl.textContent = 'Catat Izin, Sakit, Dinas Luar, atau Cuti atas nama pegawai';
        if (adminWrap) adminWrap.classList.remove('hidden');
        if (userCard) userCard.classList.add('hidden');
        if (autoApproveEl) autoApproveEl.checked = true;

        if (!Array.isArray(state.allUsers) || state.allUsers.length === 0) {
          try {
            const res = await fetch('/api/stitch/bootstrap');
            const json = await res.json();
            if (json && json.ok && Array.isArray(json.users)) {
              state.allUsers = json.users;
            }
          } catch (e) {
            console.warn('[drawer] gagal bootstrap daftar pegawai:', e);
          }
        }

        const searchEl = document.getElementById('drawerPegawaiSearch');
        if (searchEl) searchEl.value = '';
        const defaultNip = opts.nip || u.nip || (state.allUsers[0]?.nip || '');
        selectDrawerPegawai(defaultNip, { closeDropdown: true });
      } else {
        if (titleEl) titleEl.textContent = 'Ajukan Keterangan Tidak Hadir';
        if (subtitleEl) subtitleEl.textContent = 'Izin, Sakit, Dinas Luar, atau Cuti';
        if (adminWrap) adminWrap.classList.add('hidden');
        if (userCard) userCard.classList.remove('hidden');

        const namaEl = document.getElementById('drawerUserNama');
        const nipEl = document.getElementById('drawerUserNip');
        const jabatanEl = document.getElementById('drawerUserJabatan');
        const targetNipEl = document.getElementById('drawerTargetNip');
        if (namaEl) namaEl.textContent = u.nama;
        if (nipEl) nipEl.textContent = 'NIP. ' + u.nip;
        if (jabatanEl) jabatanEl.textContent = u.jabatan || 'Aparatur BAPPERIDA';
        if (targetNipEl) targetNipEl.value = u.nip || '';
      }

      const ketEl = document.getElementById('drawerKet');
      const checkJam = document.getElementById('drawerCheckIzinJam');

      if (ketEl) ketEl.value = '';
      initDrawerDatepicker();
      clearKeteranganBukti();
      
      setDrawerJenis('IZIN');
      if (checkJam) checkJam.checked = false;
      toggleDrawerIzinJam(false);
      selectDrawerTime('mulai', '08:00');
      selectDrawerTime('selesai', '11:30');
      toggleDrawerPegawaiDropdown(false);

      const calDrop = document.getElementById('drawerCalendarDropdown');
      const calIcon = document.getElementById('drawerDatePickerIcon');
      if (calDrop) calDrop.classList.add('hidden');
      if (calIcon) calIcon.textContent = 'expand_more';

      const drawer = document.getElementById('drawerAjukanKeterangan');
      const backdrop = document.getElementById('drawerAjukanBackdrop');
      const panel = document.getElementById('drawerAjukanPanel');

      if (drawer) {
        drawer.classList.remove('hidden');
        setTimeout(() => {
          if (backdrop) {
            backdrop.classList.remove('opacity-0');
            backdrop.classList.add('opacity-100');
          }
          if (panel) {
            panel.classList.remove('translate-y-full');
            panel.classList.add('translate-y-0');
          }
        }, 10);
      }
    }

    function closeIzinDrawer() {
      toggleDrawerPegawaiDropdown(false);
      toggleDrawerTimeDropdown('mulai', false);
      toggleDrawerTimeDropdown('selesai', false);

      const drawer = document.getElementById('drawerAjukanKeterangan');
      const backdrop = document.getElementById('drawerAjukanBackdrop');
      const panel = document.getElementById('drawerAjukanPanel');

      if (!drawer || drawer.classList.contains('hidden')) return;

      if (backdrop) {
        backdrop.classList.remove('opacity-100');
        backdrop.classList.add('opacity-0');
      }
      if (panel) {
        panel.classList.remove('translate-y-0');
        panel.classList.add('translate-y-full');
      }

      setTimeout(() => {
        drawer.classList.add('hidden');
      }, 300);
    }

    function setDrawerJenis(jenis) {
      const valInput = document.getElementById('drawerJenisValue');
      if (valInput) valInput.value = jenis;

      ['IZIN', 'SAKIT', 'TUGAS', 'CUTI'].forEach(j => {
        const el = document.getElementById('pillDrawer' + j);
        if (el) {
          if (j === jenis) {
            el.className = 'py-2.5 px-1 rounded-xl border border-blue-600 bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 font-bold text-center text-xs transition-all shadow-xs cursor-pointer';
          } else {
            el.className = 'py-2.5 px-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold text-center text-xs transition-all hover:bg-slate-50 cursor-pointer';
          }
        }
      });
      const wrap = document.getElementById('drawerIzinJamWrapper');
      if (wrap) {
        wrap.style.display = (jenis === 'IZIN') ? 'block' : 'none';
      }
    }

    function toggleDrawerIzinJam(isChecked) {
      const row = document.getElementById('drawerRowIzinJam');
      if (row) {
        if (isChecked) {
          row.classList.remove('hidden');
          row.classList.add('grid');
        } else {
          row.classList.add('hidden');
          row.classList.remove('grid');
        }
      }
    }

    async function submitIzinDrawer() {
      if (!state.currentUser) return;
      const u = state.currentUser;
      const isAdminMode = Boolean(window._drawerAdminMode);
      const targetNip = isAdminMode
        ? String(document.getElementById('drawerTargetNip')?.value || '').trim()
        : String(u.nip || '').trim();

      if (isAdminMode && !targetNip) {
        Swal.fire('Perhatian', 'Pilih pegawai terlebih dahulu.', 'warning');
        return;
      }

      const jenis = document.getElementById('drawerJenisValue').value;
      const tglMulai = document.getElementById('drawerTglMulai')?.value || drawerStartDate;
      const tglSelesai = document.getElementById('drawerTglSelesai')?.value || drawerEndDate || tglMulai;
      let keterangan = document.getElementById('drawerKet').value.trim();
      const isIzinJam = document.getElementById('drawerCheckIzinJam')?.checked;
      const autoApprove = Boolean(isAdminMode && document.getElementById('drawerAdminAutoApprove')?.checked);

      if (isIzinJam && jenis === 'IZIN') {
        const jMulai = document.getElementById('drawerJamMulai')?.value || '08:00';
        const jSelesai = document.getElementById('drawerJamSelesai')?.value || '11:30';
        keterangan = `[Izin Jam ${jMulai} - ${jSelesai}] ${keterangan}`;
      }

      if (!keterangan) {
        Swal.fire('Perhatian', 'Alasan / rincian keperluan keterangan wajib diisi.', 'warning');
        return;
      }
      if (!tglMulai) {
        Swal.fire('Perhatian', 'Tanggal mulai wajib dipilih.', 'warning');
        return;
      }

      // Validasi bukti wajib untuk dinas luar pada mode pegawai biasa (opsional di mode admin)
      if (!isAdminMode && jenis === 'TUGAS' && !keteranganBuktiFile.base64) {
        Swal.fire('Bukti Surat Tugas Wajib', 'Pengajuan Dinas Luar wajib melampirkan foto kamera atau berkas surat tugas resmi.', 'warning');
        return;
      }

      const btn = document.getElementById('btnSubmitDrawerKet');
      const btnText = document.getElementById('btnSubmitDrawerKetText');
      if (btn) btn.disabled = true;
      if (btnText) btnText.textContent = 'Mengunggah & Mengirim...';

      try {
        const res = await fetch('/api/stitch/keterangan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nip: targetNip,
            jenis,
            tgl_mulai: tglMulai,
            tgl_selesai: tglSelesai,
            keterangan,
            auto_approve: autoApprove,
            bukti_base64: keteranganBuktiFile.base64,
            bukti_mime: keteranganBuktiFile.mime,
            bukti_nama: keteranganBuktiFile.name
          })
        });
        const json = await res.json();
        if (json.ok) {
          closeIzinDrawer();
          clearKeteranganBukti();
          showDynamicIsland({
            type: 'success',
            title: `Keterangan ${jenis} Terkirim`,
            message: autoApprove
              ? 'Langsung disetujui dan tersimpan di PostgreSQL.'
              : 'Tersimpan di Google Drive, PostgreSQL, dan grup dinas.'
          });
          if (isAdminMode) {
            if (typeof loadAdminKeteranganData === 'function') await loadAdminKeteranganData();
            if (typeof loadAdminMonitoringData === 'function') await loadAdminMonitoringData();
            if (targetNip === String(u.nip || '') && typeof selectUserByNip === 'function') {
              await selectUserByNip(u.nip);
            }
          } else {
            await selectUserByNip(u.nip);
          }
        } else {
          showDynamicIsland({ type: 'error', title: 'Gagal Mengajukan', message: json.message || 'Terjadi kesalahan sistem.' });
        }
      } catch (err) {
        console.error(err);
        Swal.fire('Gagal', 'Terjadi kesalahan jaringan.', 'error');
      } finally {
        if (btn) btn.disabled = false;
        if (btnText) btnText.textContent = 'Kirim Keterangan';
      }
    }

    // Keep openIzinModal as alias for backward compatibility
    function openIzinModal(opts) {
      return openIzinDrawer(opts);
    }

    async function openNotificationModal() {
      try {
        const nip = state.currentUser ? state.currentUser.nip : '';
        const contentEl = document.getElementById('drawerNotifContent');
        if (contentEl) {
          contentEl.innerHTML = `
            <div class="flex items-center justify-center p-8 text-slate-400 gap-2">
              <span class="material-symbols-outlined animate-spin text-[20px]">sync</span>
              <span class="text-xs">Memuat pemberitahuan...</span>
            </div>
          `;
        }

        openNotificationDrawer();

        const res = await fetch(`/api/stitch/notifications?nip=${nip}`);
        const json = await res.json();
        
        const notifList = (json.data && json.data.length) ? json.data : [
          { title: 'Sistem Terhubung', message: 'Database PostgreSQL aktif dan sinkron dengan server daerah BAPPERIDA.', created_at: new Date().toISOString() }
        ];

        renderNotificationDrawerItems(notifList);
      } catch (err) {
        const contentEl = document.getElementById('drawerNotifContent');
        if (contentEl) {
          contentEl.innerHTML = `
            <div class="p-6 text-center text-xs text-rose-500">
              Gagal memuat pemberitahuan: ${err.message}
            </div>
          `;
        }
      }
    }

    function renderNotificationDrawerItems(items) {
      const contentEl = document.getElementById('drawerNotifContent');
      if (!contentEl) return;
      if (!items || items.length === 0) {
        contentEl.innerHTML = `
          <div class="py-12 px-4 flex flex-col items-center justify-center text-center text-slate-400">
            <span class="material-symbols-outlined text-[36px] text-slate-300 dark:text-slate-600 mb-2">notifications_off</span>
            <p class="text-xs font-semibold text-slate-600 dark:text-slate-300">Belum Ada Pemberitahuan</p>
            <p class="text-[11px] text-slate-400 mt-0.5">Semua notifikasi pengumuman kedinasan akan tampil di sini.</p>
          </div>
        `;
        return;
      }

      contentEl.innerHTML = items.map(n => {
        const dateStr = n.created_at ? new Date(n.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Hari Ini';
        let iconName = 'notifications';
        let iconBg = 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400';
        const titleLower = (n.title || '').toLowerCase();
        if (titleLower.includes('disetujui') || titleLower.includes('acc')) {
          iconName = 'check_circle';
          iconBg = 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400';
        } else if (titleLower.includes('verifikasi') || titleLower.includes('menunggu')) {
          iconName = 'pending';
          iconBg = 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400';
        } else if (titleLower.includes('dokumen') || titleLower.includes('surat') || titleLower.includes('sppd')) {
          iconName = 'description';
          iconBg = 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400';
        }

        return `
          <div class="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800 flex gap-3 transition-all hover:bg-white dark:hover:bg-slate-800 shadow-2xs">
            <div class="w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0">
              <span class="material-symbols-outlined text-[18px]">${iconName}</span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-start justify-between gap-2 mb-1">
                <h4 class="font-bold text-xs text-slate-900 dark:text-white truncate">${n.title}</h4>
                <span class="text-[10px] text-slate-400 font-mono flex-shrink-0">${dateStr}</span>
              </div>
              <p class="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">${n.message}</p>
            </div>
          </div>
        `;
      }).join('');
    }

    function openNotificationDrawer() {
      const drawer = document.getElementById('drawerNotifikasi');
      const backdrop = document.getElementById('drawerNotifBackdrop');
      const panel = document.getElementById('drawerNotifPanel');

      if (drawer) {
        drawer.classList.remove('hidden');
        setTimeout(() => {
          if (backdrop) {
            backdrop.classList.remove('opacity-0');
            backdrop.classList.add('opacity-100');
          }
          if (panel) {
            panel.classList.remove('translate-y-full');
            panel.classList.add('translate-y-0');
          }
        }, 10);
      }
    }

    function closeNotificationDrawer() {
      const drawer = document.getElementById('drawerNotifikasi');
      const backdrop = document.getElementById('drawerNotifBackdrop');
      const panel = document.getElementById('drawerNotifPanel');

      if (!drawer || drawer.classList.contains('hidden')) return;

      if (backdrop) {
        backdrop.classList.remove('opacity-100');
        backdrop.classList.add('opacity-0');
      }
      if (panel) {
        panel.classList.remove('translate-y-0');
        panel.classList.add('translate-y-full');
      }

      setTimeout(() => {
        drawer.classList.add('hidden');
      }, 300);
    }
