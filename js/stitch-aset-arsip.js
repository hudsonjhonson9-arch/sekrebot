/* Stitch Mobile Aset SIMAPO, QR Scanner & Bank Arsip Digital */
    /* ───────────────────────────────────────────────────────────────── */
    /* 11. MOBILE REAL ASET & ARSIP DATA (POSTGRESQL & SIMAPO)          */
    /* ───────────────────────────────────────────────────────────────── */
    let _mobilePersonalAssets = [];
    let _mobileBorrowedAssets = [];
    let _activeAsetListFilter = 'dipegang';
    let _scannerMode = 'general';
    let _mobileKatalogAssets = [];
    let _selectedAsetId = null;
    let _mobileArsipDocs = [];
    let _activeArsipCategory = 'Semua';
    let _arsipSearchTimeout = null;

    function formatRupiah(val) {
      const num = parseFloat(val) || 0;
      return 'Rp ' + num.toLocaleString('id-ID');
    }

    function getAssetIcon(nama, nopol) {
      const n = (nama || '').toLowerCase();
      if (nopol || n.includes('motor') || n.includes('revo') || n.includes('mega pro')) return 'two_wheeler';
      if (n.includes('mobil') || n.includes('pickup') || n.includes('rush') || n.includes('strada') || n.includes('hilux') || n.includes('kendaraan')) return 'directions_car';
      if (n.includes('pc') || n.includes('komputer') || n.includes('all in one')) return 'desktop_windows';
      if (n.includes('laptop') || n.includes('thinkpad') || n.includes('notebook')) return 'laptop_mac';
      if (n.includes('printer') || n.includes('epson') || n.includes('canon')) return 'print';
      if (n.includes('ac') || n.includes('spilit')) return 'ac_unit';
      if (n.includes('monitor')) return 'monitor';
      if (n.includes('proyektor') || n.includes('infocus') || n.includes('kamera')) return 'videocam';
      return 'inventory_2';
    }

    async function loadRealMobileAsetData() {
      const listContainer = document.getElementById('mobilePersonalAssetsList');
      if (!listContainer) return;

      try {
        const nip = state.currentUser ? state.currentUser.nip : '';
        const userId = state.currentUser ? state.currentUser.id : '';

        const res = await fetch(`/api/stitch/aset/mobile-data?nip=${nip}&userId=${userId}`);
        const json = await res.json();

        if (json.ok) {
          const st = json.stats || {};
          const elTotal = document.getElementById('mobileAsetStatTotal');
          const elHeld = document.getElementById('mobileAsetStatHeld');
          const elKondisi = document.getElementById('mobileAsetStatKondisi');

          if (elTotal) elTotal.textContent = st.totalUnit || 359;
          if (elHeld) elHeld.textContent = (st.userHeldCount || json.personalAssets?.length || 0) + ' Unit';
          if (elKondisi) elKondisi.textContent = st.persenBaik || '90.3%';

          _mobilePersonalAssets = json.personalAssets || [];
          _mobileBorrowedAssets = json.borrowedAssets || [];
          _mobileKatalogAssets = json.katalogAssets || [];

          const countHeld = document.getElementById('mCountAsetDipegang');
          if (countHeld) countHeld.textContent = _mobilePersonalAssets.length;
          const countPjm = document.getElementById('mCountAsetDipinjam');
          if (countPjm) countPjm.textContent = _mobileBorrowedAssets.length;

          populateAsetSelectDropdowns();
          renderCurrentAsetList();
        } else {
          const safeMsg = String(json.message || 'Gagal memuat data').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
          listContainer.innerHTML = `<div class="p-4 text-center text-xs text-rose-500">Gagal memuat inventaris: ${safeMsg}</div>`;
        }
      } catch (err) {
        console.error('loadRealMobileAsetData error:', err);
        const safeErr = String(err?.message || 'Koneksi terganggu').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        listContainer.innerHTML = `<div class="p-4 text-center text-xs text-rose-500">Koneksi inventaris terganggu: ${safeErr}</div>`;
      }
    }

    function populateAsetSelectDropdowns() {
      const selLapor = document.getElementById('malSelectAset');
      const selPinjam = document.getElementById('mapSelectAset');
      const allItems = [..._mobilePersonalAssets, ..._mobileKatalogAssets];
      const seen = new Set();
      const unique = [];
      for (const item of allItems) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          unique.push(item);
        }
      }

      const optsHtml = unique.map(a => {
        const extra = a.no_polisi ? ` (${a.no_polisi})` : (a.nomorinventaris ? ` - Inv: ${a.nomorinventaris}` : '');
        return `<option value="${a.id}">[${a.kodebarang || '-'}] ${a.nama_barang}${extra}</option>`;
      }).join('');

      if (selLapor) {
        selLapor.innerHTML = '<option value="">-- Pilih Aset yang Dilaporkan --</option>' + optsHtml;
      }
      if (selPinjam) {
        selPinjam.innerHTML = '<option value="">-- Pilih Aset yang Dipinjam --</option>' + optsHtml;
      }
    }

    function renderMobilePersonalAssets() {
      const container = document.getElementById('mobilePersonalAssetsList');
      if (!container) return;

      if (!_mobilePersonalAssets.length) {
        container.innerHTML = `
          <div class="p-6 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">
            <span class="material-symbols-outlined text-[32px] text-slate-300 dark:text-slate-600 mb-1 block">inventory</span>
            <p class="font-bold text-slate-700 dark:text-slate-300">Belum Ada Aset Terdaftar</p>
            <p class="text-[11px] text-slate-400 mt-0.5">Semua barang milik daerah yang tercatat atas nama Anda akan tampil di sini.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = _mobilePersonalAssets.map(item => {
        const icon = getAssetIcon(item.nama_barang, item.no_polisi);
        const kLower = (item.kondisi || 'Baik').toLowerCase();
        let badgeColor = 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300';
        if (kLower.includes('kurang')) badgeColor = 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300';
        else if (kLower.includes('rusak')) badgeColor = 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300';

        const subIdentifier = item.no_polisi ? item.no_polisi : (item.nomorinventaris || item.kodebarang || '-');
        const pemegangTag = item.status_pemegang === 'Dipegang Pribadi' ? 'Tanggung Jawab Pribadi' : 'Operasional Bersama';
        const pemegangColor = item.status_pemegang === 'Dipegang Pribadi' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500';

        return `
          <div onclick="openMobileAsetDetail('${item.id}')" class="bg-white dark:bg-slate-900 rounded-2xl p-3.5 shadow-sm border border-slate-100 dark:border-slate-800 flex items-center justify-between hover:border-blue-400 transition-all cursor-pointer group">
            <div class="flex items-center gap-3 min-w-0 pr-2">
              <div class="w-10 h-10 rounded-xl bg-blue-50 dark:bg-slate-800 flex items-center justify-center text-blue-600 shrink-0 group-hover:scale-105 transition-transform">
                <span class="material-symbols-outlined text-[20px]">${icon}</span>
              </div>
              <div class="min-w-0">
                <h4 class="text-xs font-bold text-slate-900 dark:text-white truncate">${item.nama_barang} ${item.merk_type ? '(' + item.merk_type + ')' : ''}</h4>
                <div class="flex items-center gap-2 mt-0.5 text-[10px] font-mono">
                  <span class="text-slate-400 font-semibold truncate">${subIdentifier}</span>
                  <span class="text-slate-300 dark:text-slate-600">•</span>
                  <span class="font-bold ${pemegangColor}">${pemegangTag}</span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <span class="text-[9px] font-bold px-2 py-0.5 rounded-full ${badgeColor}">${item.kondisi || 'Baik'}</span>
              <button onclick="event.stopPropagation(); openMobileAsetDetail('${item.id}')" class="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 text-slate-600 hover:text-blue-600 flex items-center justify-center transition-colors">
                <span class="material-symbols-outlined text-[18px]">info</span>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    function setMobileAsetListFilter(filter) {
      _activeAsetListFilter = filter;
      const btnHeld = document.getElementById('btnFilterAsetDipegang');
      const btnPjm = document.getElementById('btnFilterAsetDipinjam');
      if (btnHeld && btnPjm) {
        if (filter === 'dipegang') {
          btnHeld.className = 'flex-1 py-1.5 px-3 rounded-lg text-xs font-bold bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs transition-all cursor-pointer';
          btnPjm.className = 'flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 transition-all cursor-pointer';
        } else {
          btnPjm.className = 'flex-1 py-1.5 px-3 rounded-lg text-xs font-bold bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs transition-all cursor-pointer';
          btnHeld.className = 'flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 transition-all cursor-pointer';
        }
      }
      renderCurrentAsetList();
    }
    window.setMobileAsetListFilter = setMobileAsetListFilter;

    function renderCurrentAsetList() {
      if (_activeAsetListFilter === 'dipinjam') {
        renderMobileBorrowedAssets();
      } else {
        renderMobilePersonalAssets();
      }
    }

    function renderMobileBorrowedAssets() {
      const container = document.getElementById('mobilePersonalAssetsList');
      if (!container) return;

      if (!_mobileBorrowedAssets.length) {
        container.innerHTML = `
          <div class="p-6 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">
            <span class="material-symbols-outlined text-[32px] text-slate-300 dark:text-slate-600 mb-1 block">handshake</span>
            <p class="font-bold text-slate-700 dark:text-slate-300">Tidak Ada Aset Dipinjam</p>
            <p class="text-[11px] text-slate-400 mt-0.5">Anda belum memiliki peminjaman aktif. Scan barcode aset atau gunakan tombol pinjam untuk meminjam barang.</p>
            <button onclick="openMobileQrScanModal('pinjam')" class="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs shadow-xs hover:bg-blue-700 transition-all cursor-pointer">
              <span class="material-symbols-outlined text-[16px]">qr_code_scanner</span>
              <span>Scan Pinjam Aset</span>
            </button>
          </div>
        `;
        return;
      }

      container.innerHTML = _mobileBorrowedAssets.map(item => {
        const icon = getAssetIcon(item.nama_barang, item.no_polisi);
        const stLower = (item.status_pinjam || 'Dipinjam').toLowerCase();
        let badgeColor = 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300';
        if (stLower.includes('menunggu')) badgeColor = 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300';
        else if (stLower.includes('selesai') || stLower.includes('kembali')) badgeColor = 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300';

        const subIdentifier = item.no_polisi ? item.no_polisi : (item.nomorinventaris || item.kodebarang || item.nomorpeminjaman || '-');
        const rentang = item.tanggalmulai ? `${item.tanggalmulai} s.d. ${item.tanggalselesai || '-'}` : 'Peminjaman Aktif';

        return `
          <div onclick="openMobileAsetDetail('${item.id}')" class="bg-white dark:bg-slate-900 rounded-2xl p-3.5 shadow-sm border border-slate-100 dark:border-slate-800 flex items-center justify-between hover:border-blue-400 transition-all cursor-pointer group">
            <div class="flex items-center gap-3 min-w-0 pr-2">
              <div class="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-slate-800 flex items-center justify-center text-indigo-600 shrink-0 group-hover:scale-105 transition-transform">
                <span class="material-symbols-outlined text-[20px]">${icon}</span>
              </div>
              <div class="min-w-0">
                <h4 class="text-xs font-bold text-slate-900 dark:text-white truncate">${item.nama_barang} ${item.merk_type ? '(' + item.merk_type + ')' : ''}</h4>
                <div class="flex items-center gap-2 mt-0.5 text-[10px] font-mono">
                  <span class="text-slate-400 font-semibold truncate">${subIdentifier}</span>
                  <span class="text-slate-300 dark:text-slate-600">•</span>
                  <span class="font-bold text-indigo-600 dark:text-indigo-400 truncate">${rentang}</span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <span class="text-[9px] font-bold px-2 py-0.5 rounded-full ${badgeColor}">${item.status_pinjam || 'Dipinjam'}</span>
              <button onclick="event.stopPropagation(); openMobileAsetDetail('${item.id}')" class="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 text-slate-600 hover:text-blue-600 flex items-center justify-center transition-colors">
                <span class="material-symbols-outlined text-[18px]">info</span>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    function openMobileAsetDetail(assetId) {
      const allItems = [..._mobilePersonalAssets, ..._mobileKatalogAssets];
      const item = allItems.find(a => String(a.id) === String(assetId)) || allItems[0];
      if (!item) return;

      _selectedAsetId = item.id;

      const icon = getAssetIcon(item.nama_barang, item.no_polisi);
      const iconEl = document.getElementById('madIcon');
      if (iconEl) iconEl.textContent = icon;

      const titleEl = document.getElementById('madNamaBarang');
      if (titleEl) titleEl.textContent = item.nama_barang;

      const subEl = document.getElementById('madSubTitle');
      if (subEl) subEl.textContent = `SIMAPO • ${item.kodebarang || '-'}`;

      const pemegangEl = document.getElementById('madStatusPemegang');
      if (pemegangEl) pemegangEl.textContent = item.status_pemegang || 'Aset Inventaris BAPPERIDA';

      const badgeEl = document.getElementById('madKondisiBadge');
      if (badgeEl) {
        badgeEl.textContent = item.kondisi || 'Baik';
        const kLower = (item.kondisi || 'Baik').toLowerCase();
        if (kLower.includes('kurang')) {
          badgeEl.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300';
        } else if (kLower.includes('rusak')) {
          badgeEl.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300';
        } else {
          badgeEl.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300';
        }
      }

      const invEl = document.getElementById('madNoInventaris');
      if (invEl) invEl.textContent = item.nomorinventaris || '-';

      const kdEl = document.getElementById('madKodeBarang');
      if (kdEl) kdEl.textContent = item.kodebarang || '-';

      const merkEl = document.getElementById('madMerkType');
      if (merkEl) merkEl.textContent = [item.merk_type, item.spesifikasi].filter(Boolean).join(' • ') || '-';

      const nopolRow = document.getElementById('madNoPolisiRow');
      const nopolEl = document.getElementById('madNoPolisi');
      if (item.no_polisi) {
        if (nopolRow) nopolRow.classList.remove('hidden');
        if (nopolEl) nopolEl.textContent = item.no_polisi;
      } else {
        if (nopolRow) nopolRow.classList.add('hidden');
      }

      const ruangEl = document.getElementById('madRuangan');
      if (ruangEl) ruangEl.textContent = item.nama_ruangan || 'Ruang Kerja BAPPERIDA';

      const tahunNilaiEl = document.getElementById('madTahunNilai');
      if (tahunNilaiEl) {
        const thn = item.tahunperolehan ? `Tahun ${item.tahunperolehan}` : '';
        const nilai = item.nilaiperolehan ? formatRupiah(item.nilaiperolehan) : '';
        tahunNilaiEl.textContent = [thn, nilai].filter(Boolean).join(' • ') || '-';
      }

      const kodeAsetEl = document.getElementById('madKodeAset');
      if (kodeAsetEl) kodeAsetEl.textContent = item.kode_aset || item.kib || 'KIB B / Peralatan Mesin';

      const drawer = document.getElementById('drawerAsetDetail');
      const backdrop = document.getElementById('drawerAsetDetailBackdrop');
      const panel = document.getElementById('drawerAsetDetailPanel');

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

    function closeMobileAsetDetail() {
      const drawer = document.getElementById('drawerAsetDetail');
      const backdrop = document.getElementById('drawerAsetDetailBackdrop');
      const panel = document.getElementById('drawerAsetDetailPanel');

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

    function openAsetLaporFromDetail() {
      closeMobileAsetDetail();
      setTimeout(() => openMobileAsetLaporModal(_selectedAsetId), 320);
    }

    function openAsetPinjamFromDetail() {
      closeMobileAsetDetail();
      setTimeout(() => openMobileAsetPinjamModal(_selectedAsetId), 320);
    }

    function openMobileAsetLaporModal(preselectedId) {
      const sel = document.getElementById('malSelectAset');
      if (sel && preselectedId) sel.value = preselectedId;

      const drawer = document.getElementById('drawerAsetLapor');
      const backdrop = document.getElementById('drawerAsetLaporBackdrop');
      const panel = document.getElementById('drawerAsetLaporPanel');

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

    function closeMobileAsetLaporModal() {
      const drawer = document.getElementById('drawerAsetLapor');
      const backdrop = document.getElementById('drawerAsetLaporBackdrop');
      const panel = document.getElementById('drawerAsetLaporPanel');

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

    async function submitMobileAsetLapor() {
      const sel = document.getElementById('malSelectAset');
      const deskripsiEl = document.getElementById('malDeskripsi');
      const lokasiEl = document.getElementById('malLokasi');
      const prioritasInp = document.querySelector('input[name="malPrioritas"]:checked');

      const unitasetid = sel ? sel.value : '';
      const deskripsi = deskripsiEl ? deskripsiEl.value.trim() : '';
      const lokasi = lokasiEl ? lokasiEl.value.trim() : 'Kantor BAPPERIDA';
      const prioritas = prioritasInp ? prioritasInp.value : 'Sedang';

      if (!deskripsi) {
        Swal.fire('Perhatian', 'Silakan tuliskan deskripsi kerusakan atau kendala barang.', 'warning');
        return;
      }

      try {
        const nip = state.currentUser ? state.currentUser.nip : '';
        const res = await fetch('/api/stitch/aset/tiket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            unitasetid,
            deskripsi,
            prioritas,
            lokasi,
            nip,
            judul: 'Laporan Kerusakan via Mobile ASN'
          })
        });
        const json = await res.json();

        if (json.ok) {
          closeMobileAsetLaporModal();
          if (deskripsiEl) deskripsiEl.value = '';
          showDynamicIsland({
            type: 'success',
            title: 'Tiket Servis Dibuat!',
            message: `${json.nomortiket || 'TKT-OK'} tercatat di PostgreSQL SIMAPO.`
          });
          Swal.fire({
            title: 'Laporan Kerusakan Terkirim',
            text: `Tiket perbaikan ${json.nomortiket || ''} telah didaftarkan ke pengurus barang BAPPERIDA.`,
            icon: 'success',
            confirmButtonColor: '#2563eb'
          });
          loadRealMobileAsetData();
        } else {
          Swal.fire('Gagal', json.message || 'Gagal mengirim tiket kerusakan.', 'error');
        }
      } catch (err) {
        Swal.fire('Error', 'Koneksi API gagal: ' + err.message, 'error');
      }
    }

    function openMobileAsetPinjamModal(preselectedId) {
      const sel = document.getElementById('mapSelectAset');
      if (sel && preselectedId) sel.value = preselectedId;

      const tglMulai = document.getElementById('mapTglMulai');
      const tglSelesai = document.getElementById('mapTglSelesai');
      const today = new Date().toISOString().slice(0, 10);
      const nextDay = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

      if (tglMulai && !tglMulai.value) tglMulai.value = today;
      if (tglSelesai && !tglSelesai.value) tglSelesai.value = nextDay;

      const drawer = document.getElementById('drawerAsetPinjam');
      const backdrop = document.getElementById('drawerAsetPinjamBackdrop');
      const panel = document.getElementById('drawerAsetPinjamPanel');

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

    function closeMobileAsetPinjamModal() {
      const drawer = document.getElementById('drawerAsetPinjam');
      const backdrop = document.getElementById('drawerAsetPinjamBackdrop');
      const panel = document.getElementById('drawerAsetPinjamPanel');

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

    async function submitMobileAsetPinjam() {
      const sel = document.getElementById('mapSelectAset');
      const tglMulaiEl = document.getElementById('mapTglMulai');
      const tglSelesaiEl = document.getElementById('mapTglSelesai');
      const keperluanEl = document.getElementById('mapKeperluan');

      const unitasetid = sel ? sel.value : '';
      const keperluan = keperluanEl ? keperluanEl.value.trim() : '';
      const tgl_mulai = tglMulaiEl ? tglMulaiEl.value : '';
      const tgl_selesai = tglSelesaiEl ? tglSelesaiEl.value : '';

      if (!unitasetid) {
        Swal.fire('Perhatian', 'Silakan pilih aset yang ingin dipinjam.', 'warning');
        return;
      }
      if (!keperluan) {
        Swal.fire('Perhatian', 'Silakan tuliskan keperluan atau acara kedinasan.', 'warning');
        return;
      }

      try {
        const nip = state.currentUser ? state.currentUser.nip : '';
        const res = await fetch('/api/stitch/aset/pinjam', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            unitasetid,
            keperluan,
            tgl_mulai,
            tgl_selesai,
            nip
          })
        });
        const json = await res.json();

        if (json.ok) {
          closeMobileAsetPinjamModal();
          if (keperluanEl) keperluanEl.value = '';
          showDynamicIsland({
            type: 'success',
            title: 'Pengajuan Pinjam Terkirim!',
            message: `${json.nomorpeminjaman || 'PJM-OK'} tersimpan di SIMAPO.`
          });
          Swal.fire({
            title: 'Permohonan Berhasil',
            text: `Nomor pengajuan ${json.nomorpeminjaman || ''} menunggu persetujuan pengurus barang.`,
            icon: 'success',
            confirmButtonColor: '#2563eb'
          });
        } else {
          Swal.fire('Gagal', json.message || 'Gagal mengajukan pinjaman.', 'error');
        }
      } catch (err) {
        Swal.fire('Error', 'Koneksi API gagal: ' + err.message, 'error');
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // LIVE CAMERA QR & BARCODE SCANNER (SIMAPO ASET BAPPERIDA)
    // ═══════════════════════════════════════════════════════════════════
    let _scannerStream = null;
    let _scannerActive = false;
    let _scannerFacingMode = 'environment';
    let _scannerTorchOn = false;
    let _scannerBarcodeDetector = null;
    let _scannerTimer = null;
    let _scannerCanvas = null;
    let _scannerCtx = null;

    if ('BarcodeDetector' in window) {
      try {
        _scannerBarcodeDetector = new BarcodeDetector({
          formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e']
        });
      } catch (_e) {
        _scannerBarcodeDetector = null;
      }
    }

    async function openMobileQrScanModal(mode = 'general') {
      _scannerMode = mode;
      const modal = document.getElementById('modalQrScanner');
      if (!modal) return;

      modal.classList.remove('hidden');
      _scannerActive = true;

      // Reset state
      const fallbackBox = document.getElementById('scannerFallbackBox');
      if (fallbackBox) fallbackBox.classList.add('hidden');
      const manualArea = document.getElementById('scannerManualInputArea');
      if (manualArea) manualArea.classList.add('hidden');
      const laser = document.getElementById('scannerLaser');
      if (laser) laser.classList.remove('hidden');
      const successRing = document.getElementById('scannerSuccessRing');
      if (successRing) {
        successRing.classList.add('opacity-0', 'scale-95');
        successRing.classList.remove('opacity-100', 'scale-100');
      }
      const statusText = document.getElementById('scannerStatusText');
      if (statusText) {
        statusText.textContent = _scannerMode === 'pinjam'
          ? 'Arahkan kamera ke barcode/QR aset untuk langsung meminjam...'
          : 'Menghubungkan kamera...';
      }

      await startScannerCamera();
    }

    async function startScannerCamera() {
      const video = document.getElementById('scannerVideo');
      const statusText = document.getElementById('scannerStatusText');
      const fallbackBox = document.getElementById('scannerFallbackBox');
      const torchBtn = document.getElementById('btnScannerTorch');

      stopScannerStream();

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('WebRTC MediaDevices tidak didukung pada browser ini.');
        }

        const constraints = {
          video: {
            facingMode: _scannerFacingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        _scannerStream = stream;

        if (video) {
          video.srcObject = stream;
          await video.play();
        }

        if (statusText) statusText.textContent = 'Arahkan kamera ke stiker QR atau Barcode BMD';
        if (fallbackBox) fallbackBox.classList.add('hidden');

        // Check torch capability
        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities ? track.getCapabilities() : {};
        if (capabilities.torch && torchBtn) {
          torchBtn.classList.remove('hidden');
        } else if (torchBtn) {
          torchBtn.classList.add('hidden');
        }

        _scannerActive = true;
        initScanLoop();
      } catch (err) {
        console.warn('Gagal mengakses kamera:', err.message);
        if (statusText) statusText.textContent = 'Kamera tidak aktif / izin belum diberikan';
        if (fallbackBox) fallbackBox.classList.remove('hidden');
        if (torchBtn) torchBtn.classList.add('hidden');
      }
    }

    function initScanLoop() {
      if (_scannerTimer) clearInterval(_scannerTimer);

      if (!_scannerCanvas) {
        _scannerCanvas = document.createElement('canvas');
        _scannerCtx = _scannerCanvas.getContext('2d', { willReadFrequently: true });
      }

      const video = document.getElementById('scannerVideo');

      _scannerTimer = setInterval(async () => {
        if (!_scannerActive || !video || video.readyState !== video.HAVE_ENOUGH_DATA) return;

        try {
          // 1. Coba Native BarcodeDetector (High performance, QR + Barcode 1D)
          if (_scannerBarcodeDetector) {
            try {
              const barcodes = await _scannerBarcodeDetector.detect(video);
              if (barcodes && barcodes.length > 0) {
                const raw = barcodes[0].rawValue;
                if (raw) {
                  onCodeDetected(raw);
                  return;
                }
              }
            } catch (_e) {
              // fallback ke jsQR
            }
          }

          // 2. Fallback ke jsQR
          if (typeof jsQR === 'function') {
            const w = Math.min(video.videoWidth || 640, 640);
            const h = Math.min(video.videoHeight || 480, 480);
            _scannerCanvas.width = w;
            _scannerCanvas.height = h;
            _scannerCtx.drawImage(video, 0, 0, w, h);

            const imgData = _scannerCtx.getImageData(0, 0, w, h);
            const qrCode = jsQR(imgData.data, w, h, { inversionAttempts: 'dontInvert' });

            if (qrCode && qrCode.data) {
              onCodeDetected(qrCode.data);
              return;
            }
          }
        } catch (_e) {
          // ignore scan frame error
        }
      }, 200);
    }

    function stopScannerStream() {
      if (_scannerTimer) {
        clearInterval(_scannerTimer);
        _scannerTimer = null;
      }
      if (_scannerStream) {
        try {
          _scannerStream.getTracks().forEach(t => t.stop());
        } catch (_e) {}
        _scannerStream = null;
      }
      const video = document.getElementById('scannerVideo');
      if (video) {
        video.srcObject = null;
      }
      _scannerTorchOn = false;
      const torchIcon = document.getElementById('scannerTorchIcon');
      if (torchIcon) torchIcon.textContent = 'flashlight_on';
    }

    function closeQrScannerModal() {
      _scannerActive = false;
      stopScannerStream();
      const modal = document.getElementById('modalQrScanner');
      if (modal) modal.classList.add('hidden');
    }

    async function toggleScannerTorch() {
      if (!_scannerStream) return;
      const track = _scannerStream.getVideoTracks()[0];
      if (!track) return;

      try {
        _scannerTorchOn = !_scannerTorchOn;
        await track.applyConstraints({
          advanced: [{ torch: _scannerTorchOn }]
        });
        const torchIcon = document.getElementById('scannerTorchIcon');
        if (torchIcon) {
          torchIcon.textContent = _scannerTorchOn ? 'flashlight_off' : 'flashlight_on';
        }
      } catch (e) {
        console.warn('Torch constraint error:', e);
      }
    }

    function switchScannerCamera() {
      _scannerFacingMode = _scannerFacingMode === 'environment' ? 'user' : 'environment';
      startScannerCamera();
    }

    function toggleScannerManualInput() {
      const area = document.getElementById('scannerManualInputArea');
      if (!area) return;
      area.classList.toggle('hidden');
      if (!area.classList.contains('hidden')) {
        const inp = document.getElementById('scannerManualInputText');
        if (inp) inp.focus();
      }
    }

    function handleScannerManualSubmit(e) {
      if (e) e.preventDefault();
      const inp = document.getElementById('scannerManualInputText');
      const val = inp ? inp.value.trim() : '';
      if (!val) return;
      onCodeDetected(val);
    }

    function triggerScannerFileUpload() {
      const inp = document.getElementById('scannerFileInput');
      if (inp) {
        inp.value = '';
        inp.click();
      }
    }

    async function handleScannerFilePicked(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const statusText = document.getElementById('scannerStatusText');
      if (statusText) statusText.textContent = 'Memproses foto stiker...';

      try {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = rej;
        });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        const maxDim = 1200;
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w > maxDim || h > maxDim) {
          const ratio = maxDim / Math.max(w, h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }

        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(img.src);

        // 1. Coba BarcodeDetector
        if (_scannerBarcodeDetector) {
          try {
            const barcodes = await _scannerBarcodeDetector.detect(canvas);
            if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
              onCodeDetected(barcodes[0].rawValue);
              return;
            }
          } catch (_err) {}
        }

        // 2. Coba jsQR
        if (typeof jsQR === 'function') {
          const imgData = ctx.getImageData(0, 0, w, h);
          const qr = jsQR(imgData.data, w, h);
          if (qr && qr.data) {
            onCodeDetected(qr.data);
            return;
          }
        }

        if (statusText) statusText.textContent = 'QR/Barcode tidak terbaca pada foto.';
        showDynamicIsland({
          type: 'warning',
          title: 'Tidak Terbaca',
          message: 'Stiker barcode tidak terdeteksi pada gambar.'
        });
      } catch (_err) {
        if (statusText) statusText.textContent = 'Gagal memproses gambar.';
      }
    }

    function playScanBeep() {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, ctx.currentTime);
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.12);
        }
      } catch (_e) {}

      try {
        if (navigator.vibrate) {
          navigator.vibrate([60, 40, 60]);
        }
      } catch (_e) {}
    }

    async function onCodeDetected(rawCode) {
      if (!_scannerActive) return;
      _scannerActive = false;

      // Visual success animation
      const laser = document.getElementById('scannerLaser');
      if (laser) laser.classList.add('hidden');
      const successRing = document.getElementById('scannerSuccessRing');
      if (successRing) {
        successRing.classList.remove('opacity-0', 'scale-95');
        successRing.classList.add('opacity-100', 'scale-100');
      }
      const statusText = document.getElementById('scannerStatusText');
      if (statusText) statusText.textContent = 'Kode terdeteksi: ' + rawCode;

      playScanBeep();

      // Normalize raw code
      let q = String(rawCode || '').trim();
      if (q.includes('qr=')) {
        const m = q.match(/[?&]qr=([^&]+)/);
        if (m) q = decodeURIComponent(m[1]);
      }
      if (q.startsWith('SIMAPO-')) {
        q = q.slice(7);
      }

      // Close modal after brief feedback
      setTimeout(async () => {
        closeQrScannerModal();

        // 1. Cari di local memory assets
        const cleanQ = q.toLowerCase().replace(/\s+/g, '');
        const allItems = [..._mobilePersonalAssets, ..._mobileKatalogAssets];
        let found = allItems.find(a => 
          String(a.id).toLowerCase() === cleanQ ||
          (a.kode_aset && a.kode_aset.toLowerCase().replace(/\s+/g, '').includes(cleanQ)) ||
          (a.nomorinventaris && a.nomorinventaris.toLowerCase().replace(/\s+/g, '').includes(cleanQ)) ||
          (a.no_polisi && a.no_polisi.toLowerCase().replace(/\s+/g, '').includes(cleanQ)) ||
          (a.kodebarang && a.kodebarang.toLowerCase().replace(/\s+/g, '').includes(cleanQ))
        );

        if (found) {
          if (_scannerMode === 'pinjam') {
            showDynamicIsland({
              type: 'success',
              title: 'Aset Siap Dipinjam!',
              message: `${found.nama_barang || found.kode_aset}`
            });
            openMobileAsetPinjamModal(found.id);
            return;
          }
          showDynamicIsland({
            type: 'success',
            title: 'Aset Ditemukan!',
            message: `${found.nama_barang || found.kode_aset}`
          });
          openMobileAsetDetail(found.id);
          return;
        }

        // 2. Cari ke database server SIMAPO (/api/stitch/aset/scan)
        try {
          const res = await fetch(`/api/stitch/aset/scan?q=${encodeURIComponent(rawCode)}`);
          const json = await res.json();
          if (json.ok && json.asset) {
            _mobileKatalogAssets.push(json.asset);
            if (_scannerMode === 'pinjam') {
              showDynamicIsland({
                type: 'success',
                title: 'Aset Siap Dipinjam!',
                message: `${json.asset.nama_barang || json.asset.kode_aset}`
              });
              openMobileAsetPinjamModal(json.asset.id);
              return;
            }
            showDynamicIsland({
              type: 'success',
              title: 'Aset Teridentifikasi!',
              message: `${json.asset.nama_barang || json.asset.kode_aset}`
            });
            openMobileAsetDetail(json.asset.id);
          } else {
            showDynamicIsland({
              type: 'warning',
              title: 'Aset Belum Terdaftar',
              message: `Kode "${rawCode}" tidak ditemukan di database SIMAPO.`
            });
            Swal.fire({
              title: 'Aset Tidak Ditemukan',
              text: `Barang dengan kode/barcode "${rawCode}" belum tercatat di SIMAPO BAPPERIDA.`,
              icon: 'info',
              confirmButtonColor: '#2563eb'
            });
          }
        } catch (err) {
          showDynamicIsland({
            type: 'error',
            title: 'Gagal Mencari Aset',
            message: err.message
          });
        }
      }, 400);
    }

    async function loadRealMobileArsipData(category = '') {
      const container = document.getElementById('mobileArsipDocsContainer');
      if (!container) return;

      _activeArsipCategory = category || 'Semua';

      try {
        const nip = state.currentUser ? state.currentUser.nip : '';
        const searchInput = document.getElementById('mobileArsipSearchInput');
        const q = searchInput ? searchInput.value.trim() : '';

        const url = `/api/stitch/arsip/mobile-data?nip=${nip}&kategori=${encodeURIComponent(_activeArsipCategory)}&q=${encodeURIComponent(q)}`;
        const res = await fetch(url);
        const json = await res.json();

        if (json.ok) {
          const st = json.stats || {};
          const elStorageLabel = document.getElementById('arsipStorageLabel');
          const elStorageBar = document.getElementById('arsipStorageBar');
          const elTotalDocs = document.getElementById('arsipStatTotalDocs');
          const elKat1 = document.getElementById('arsipStatKat1');
          const elKat2 = document.getElementById('arsipStatKat2');

          if (elStorageLabel) elStorageLabel.textContent = st.storageDisplay || '14.8 GB / Cloud Storage';
          if (elStorageBar) elStorageBar.style.width = (st.storagePercent || 29.6) + '%';
          if (elTotalDocs) elTotalDocs.textContent = st.totalDocs || 91;

          if (st.kategoriBreakdown && st.kategoriBreakdown.length > 0) {
            if (elKat1) elKat1.textContent = st.kategoriBreakdown[0]?.count ?? 0;
            if (elKat2) elKat2.textContent = (st.kategoriBreakdown[1]?.count ?? 0) + (st.kategoriBreakdown[2]?.count ?? 0);
          }

          renderArsipCategoryChips(st.kategoriBreakdown || []);

          _mobileArsipDocs = json.documents || [];
          renderMobileArsipDocs();
        } else {
          const safeMsg = String(json.message || 'Gagal memuat data').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
          container.innerHTML = `<div class="p-4 text-center text-xs text-rose-500">Gagal memuat arsip: ${safeMsg}</div>`;
        }
      } catch (err) {
        console.error('loadRealMobileArsipData error:', err);
        const safeErr = String(err?.message || 'Koneksi terganggu').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        container.innerHTML = `<div class="p-4 text-center text-xs text-rose-500">Koneksi arsip terganggu: ${safeErr}</div>`;
      }
    }

    function renderArsipCategoryChips(categories) {
      const chipsContainer = document.getElementById('mobileArsipCategoryChips');
      if (!chipsContainer) return;

      const topCats = ['Semua', ...categories.map(c => c.kategori).filter(Boolean)];
      chipsContainer.innerHTML = topCats.map(cat => {
        const isActive = cat === _activeArsipCategory;
        const activeClass = isActive
          ? 'bg-blue-600 text-white font-bold'
          : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-medium hover:border-blue-500';
        return `
          <button onclick="filterArsipCategory('${cat}')" class="arsip-chip px-3 py-1.5 rounded-full text-xs shrink-0 transition-all cursor-pointer ${activeClass}">
            ${cat}
          </button>
        `;
      }).join('');
    }

    function filterArsipCategory(cat) {
      _activeArsipCategory = cat;
      loadRealMobileArsipData(cat);
    }

    function debounceFilterArsip() {
      clearTimeout(_arsipSearchTimeout);
      _arsipSearchTimeout = setTimeout(() => {
        loadRealMobileArsipData(_activeArsipCategory);
      }, 350);
    }

    function renderMobileArsipDocs() {
      const container = document.getElementById('mobileArsipDocsContainer');
      if (!container) return;

      if (!_mobileArsipDocs.length) {
        container.innerHTML = `
          <div class="p-8 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">
            <span class="material-symbols-outlined text-[32px] text-slate-300 dark:text-slate-600 mb-1 block">folder_off</span>
            <p class="font-bold text-slate-700 dark:text-slate-300">Dokumen Tidak Ditemukan</p>
            <p class="text-[11px] text-slate-400 mt-0.5">Tidak ada berkas yang cocok dengan filter atau pencarian saat ini.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = _mobileArsipDocs.map(doc => {
        let iconName = 'description';
        let iconBg = 'bg-blue-50 text-blue-600 dark:bg-slate-800';

        const tLower = (doc.title || '').toLowerCase();
        const katLower = (doc.type || '').toLowerCase();

        if (katLower.includes('administrasi') || tLower.includes('sk') || tLower.includes('surat')) {
          iconName = 'description';
          iconBg = 'bg-blue-50 text-blue-600 dark:bg-slate-800';
        } else if (katLower.includes('rka') || katLower.includes('rkpd') || katLower.includes('renja') || katLower.includes('renstra')) {
          iconName = 'assignment';
          iconBg = 'bg-emerald-50 text-emerald-600 dark:bg-slate-800';
        } else if (tLower.includes('aset') || tLower.includes('berita acara')) {
          iconName = 'verified';
          iconBg = 'bg-amber-50 text-amber-600 dark:bg-slate-800';
        } else {
          iconName = 'folder';
          iconBg = 'bg-purple-50 text-purple-600 dark:bg-slate-800';
        }

        const subInfo = [doc.type || 'Umum', doc.fileType || 'PDF', doc.size || '1.2 MB'].filter(Boolean).join(' • ');

        return `
          <div onclick="openMobileArsipDetail(${doc.id})" class="bg-white dark:bg-slate-900 rounded-2xl p-3.5 shadow-sm border border-slate-100 dark:border-slate-800 flex items-center justify-between hover:border-blue-400 transition-all cursor-pointer group">
            <div class="flex items-center gap-3 min-w-0 pr-2">
              <div class="w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <span class="material-symbols-outlined text-[20px]">${iconName}</span>
              </div>
              <div class="min-w-0">
                <h4 class="text-xs font-bold text-slate-900 dark:text-white truncate">${doc.title}</h4>
                <div class="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400 font-mono truncate">
                  <span>${doc.nomorDokumen || doc.type || 'BAPPERIDA'}</span>
                  <span>•</span>
                  <span>${subInfo}</span>
                </div>
              </div>
            </div>
            <button onclick="event.stopPropagation(); openMobileArsipDetail(${doc.id})" class="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 text-slate-600 hover:text-blue-600 flex items-center justify-center shrink-0 transition-colors">
              <span class="material-symbols-outlined text-[18px]">open_in_new</span>
            </button>
          </div>
        `;
      }).join('');
    }

    let _activeMobileDoc = null;
    let _activeMobileFileIdx = 0;

    function getMobileDocFiles(doc) {
      if (!doc) return [];
      const arr = Array.isArray(doc.files) ? doc.files.filter((f) => f && (f.url || f.fileUrl || f.link)) : [];
      if (arr.length > 0) {
        return arr.map((f, i) => ({
          name: String(f.name || f.filename || f.title || `Berkas ${i + 1}`),
          url: String(f.url || f.fileUrl || f.link || ''),
          size: String(f.size || ''),
        }));
      }
      if (doc.url && doc.url !== '#') {
        return [{ name: String(doc.title || 'Berkas Utama'), url: String(doc.url), size: String(doc.size || '') }];
      }
      return [];
    }

    function renderMobileArsipPreview(doc, fileIdx = 0) {
      _activeMobileDoc = doc;
      const files = getMobileDocFiles(doc);
      const safeIdx = Math.max(0, Math.min(fileIdx, Math.max(0, files.length - 1)));
      _activeMobileFileIdx = safeIdx;
      const activeFile = files[safeIdx] || null;

      const barEl = document.getElementById('mdocFilesBar');
      if (barEl) {
        if (files.length > 1) {
          barEl.classList.remove('hidden');
          barEl.innerHTML = files.map((f, i) => {
            const act = i === safeIdx;
            return `<button type="button" onclick="window.selectMobileArsipPreviewFile(${i})" class="px-2.5 py-1.5 rounded-xl text-[11px] font-semibold shrink-0 transition-colors cursor-pointer ${act ? 'bg-[#2563eb] text-white font-bold shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}">${escapeHtml(f.name.length > 24 ? f.name.slice(0, 22) + '...' : f.name)}</button>`;
          }).join('');
        } else {
          barEl.classList.add('hidden');
          barEl.innerHTML = '';
        }
      }

      const prevEl = document.getElementById('mdocPreviewWrap');
      if (prevEl) {
        const url = activeFile ? activeFile.url : (doc.url || '');
        const fname = activeFile ? activeFile.name : (doc.title || '');
        if (window.ArsipColumns && typeof window.ArsipColumns.buildUniversalPreviewHtml === 'function') {
          prevEl.innerHTML = window.ArsipColumns.buildUniversalPreviewHtml(url, fname, 'h-56');
        } else if (url && url !== '#') {
          prevEl.innerHTML = `<iframe src="${escapeHtml(url)}" class="w-full h-56 border-0" loading="lazy"></iframe>`;
        } else {
          prevEl.innerHTML = '<div class="py-8 text-center text-xs text-slate-400">Pratinjau tidak tersedia untuk berkas ini.</div>';
        }
      }

      const linkEl = document.getElementById('mdocLink');
      const targetUrl = activeFile ? activeFile.url : (doc.url || '#');
      if (linkEl) {
        linkEl.href = targetUrl || '#';
        linkEl.onclick = (e) => {
          if (!targetUrl || targetUrl === '#') {
            e.preventDefault();
            Swal.fire('Tautan Dokumen', 'Berkas fisik terdaftar resmi dalam server arsip digital BAPPERIDA.', 'info');
          }
        };
      }
    }

    window.selectMobileArsipPreviewFile = (idx) => {
      if (_activeMobileDoc) renderMobileArsipPreview(_activeMobileDoc, idx);
    };

    function openMobileArsipDetail(docId) {
      const doc = _mobileArsipDocs.find(d => String(d.id) === String(docId));
      if (!doc) return;

      const titleEl = document.getElementById('mdocTitle');
      if (titleEl) titleEl.textContent = doc.title;

      const catEl = document.getElementById('mdocCategory');
      if (catEl) catEl.textContent = doc.type || 'Dokumen Kepegawaian & Perencanaan';

      const nomorEl = document.getElementById('mdocNomor');
      if (nomorEl) nomorEl.textContent = doc.nomorDokumen || '-';

      const tglEl = document.getElementById('mdocTanggal');
      if (tglEl) tglEl.textContent = doc.tanggalDokumen || doc.year || '-';

      const uploaderEl = document.getElementById('mdocUploader');
      if (uploaderEl) uploaderEl.textContent = doc.uploader || 'Admin BAPPERIDA';

      const sizeEl = document.getElementById('mdocSize');
      const files = getMobileDocFiles(doc);
      if (sizeEl) {
        const countTag = files.length > 1 ? ` • ${files.length} berkas` : '';
        sizeEl.textContent = `${doc.fileType || 'PDF'} (${doc.size || '-'})${countTag}`;
      }

      renderMobileArsipPreview(doc, 0);

      const drawer = document.getElementById('drawerArsipDetail');
      const backdrop = document.getElementById('drawerArsipDetailBackdrop');
      const panel = document.getElementById('drawerArsipDetailPanel');

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

    function closeMobileArsipDetail() {
      const drawer = document.getElementById('drawerArsipDetail');
      const backdrop = document.getElementById('drawerArsipDetailBackdrop');
      const panel = document.getElementById('drawerArsipDetailPanel');

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
