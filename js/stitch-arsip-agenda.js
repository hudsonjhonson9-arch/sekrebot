/* Stitch Arsip Digital — Sub-menu Controller (Dokumen, Agenda Surat, Agenda SPPD — peta-ekonomi parity) */
(function (w, d) {
  'use strict';

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

  let _activeTab = 'dokumen';
  let _suratMode = 'masuk';
  let _sppdJenis = '';
  let _suratItems = [];
  let _sppdItems = [];
  let _pegawaiList = [];
  let _mTab = 'dokumen';
  let _mSuratMode = 'masuk';
  let _mSppdJenis = '';

  const ARAHAN_OPTIONS = [
    'Tindak lanjuti sesuai ketentuan',
    'Hadiri / Wakili rapat dinas',
    'Pelajari & berikan telaahan / saran',
    'Siapkan bahan / draf surat balasan',
    'Koordinasikan dengan bidang terkait',
    'Untuk diketahui & dipedomani',
    'Arsipkan & catat dalam agenda',
  ];

  const DITERUSKAN_OPTIONS = [
    'Sekretaris BAPPERIDA',
    'Subbagian Umum & Kepegawaian',
    'Subbagian Perencanaan & Keuangan',
    'Bidang Perencanaan Pengendalian dan Evaluasi Pembangunan Daerah',
    'Bidang Perekonomian dan Sumber Daya Alam',
    'Bidang Pemerintahan dan Pembangunan Manusia',
    'Bidang Infrastruktur dan Kewilayahan',
    'Bidang Riset dan Inovasi Daerah',
  ];

  const TAB_META = {
    dokumen: { crumb: 'Arsip Digital • Dokumen', fabLabel: 'Tambah Dokumen', fabIcon: 'add' },
    'agenda-surat': { crumb: 'Arsip Digital • Agenda Surat', fabLabel: 'Catat Surat', fabIcon: 'mail' },
    'agenda-sppd': { crumb: 'Arsip Digital • Agenda SPPD', fabLabel: 'Catat SPPD', fabIcon: 'flight_takeoff' },
  };

  function togglePanel(el, show) {
    if (!el) return;
    el.classList.toggle('hidden', !show);
    el.classList.toggle('flex', show);
  }

  /* ── SCAN KAMERA & UPLOAD DOKUMEN LAMPIRAN SURAT (MASUK & KELUAR) ──────── */
  function readBlobAsBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = String(reader.result || '');
        const idx = res.indexOf('base64,');
        resolve(idx >= 0 ? res.slice(idx + 7) : res);
      };
      reader.onerror = () => reject(new Error('Gagal membaca berkas.'));
      reader.readAsDataURL(blob);
    });
  }

  async function uploadSuratAttachment(blob, filename, mimeType, modalEl) {
    const statusEl = modalEl?.querySelector('[data-surat-upload-status]');
    if (statusEl) {
      statusEl.textContent = `Mengunggah "${filename}" ke Google Drive...`;
      statusEl.className = 'text-[11px] font-semibold text-blue-600 dark:text-blue-400 mt-1';
    }
    const dataBase64 = await readBlobAsBase64(blob);
    const upRes = await fetch('/api/arsip/docs/upload-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, mimeType: mimeType || 'application/octet-stream', dataBase64 }),
    });
    const upJson = await upRes.json().catch(() => ({}));
    if (!upRes.ok || upJson.ok === false) {
      throw new Error(upJson.message || `Gagal mengunggah berkas (HTTP ${upRes.status})`);
    }
    const finalUrl = upJson.url || (upJson.fileId ? `https://drive.google.com/file/d/${upJson.fileId}/view` : '');
    const urlInp = modalEl?.querySelector('[data-surat-field="file_url"]');
    if (urlInp && finalUrl) urlInp.value = finalUrl;
    if (statusEl) {
      statusEl.textContent = `Berhasil diunggah: ${filename}`;
      statusEl.className = 'text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mt-1';
    }
    return finalUrl;
  }

  async function uploadSuratFile(inputEl) {
    const file = inputEl?.files?.[0];
    if (!file) return;
    const modal = inputEl.closest('#modalArsipAgendaSurat, #drawerMobileAgendaSurat');
    try {
      await uploadSuratAttachment(file, file.name, file.type || 'application/pdf', modal);
    } catch (err) {
      const statusEl = modal?.querySelector('[data-surat-upload-status]');
      if (statusEl) {
        statusEl.textContent = `Gagal unggah: ${err?.message || 'Koneksi terganggu'}`;
        statusEl.className = 'text-[11px] font-semibold text-rose-600 mt-1';
      }
      if (w.Swal) w.Swal.fire('Gagal Mengunggah', err?.message || 'Koneksi terganggu.', 'error');
    } finally {
      inputEl.value = '';
    }
  }

  async function openSuratCameraScan(btnEl) {
    const modal = btnEl?.closest('#modalArsipAgendaSurat, #drawerMobileAgendaSurat');
    if (!w.Swal) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      w.Swal.fire('Kamera Tidak Tersedia', 'Browser/perangkat tidak mendukung akses kamera langsung. Gunakan tombol Upload Dokumen.', 'warning');
      return;
    }

    let stream = null;
    let capturedBlob = null;
    let facing = 'environment';

    const stopCam = () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
      }
    };

    const startCam = async (videoEl) => {
      stopCam();
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1600 }, height: { ideal: 1200 } }, audio: false });
      } catch (_) {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      if (videoEl) {
        videoEl.srcObject = stream;
        await videoEl.play().catch(() => {});
      }
    };

    const res = await w.Swal.fire({
      title: 'Scan Dokumen Surat (Kamera)',
      width: 560,
      html: `
        <div class="flex flex-col gap-3">
          <div class="relative rounded-2xl overflow-hidden bg-slate-950 aspect-[4/3] flex items-center justify-center">
            <video id="swalScanVideo" autoplay playsinline class="w-full h-full object-cover"></video>
            <img id="swalScanPreview" class="hidden w-full h-full object-contain bg-slate-900" alt="Hasil scan">
            <canvas id="swalScanCanvas" class="hidden"></canvas>
          </div>
          <div class="flex items-center justify-center gap-2">
            <button type="button" id="swalScanFlipBtn" class="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer">Balik Kamera</button>
            <button type="button" id="swalScanSnapBtn" class="px-4 py-2 rounded-xl bg-[#2563eb] text-white text-xs font-bold cursor-pointer">Ambil Foto Dokumen</button>
            <button type="button" id="swalScanRetakeBtn" class="hidden px-3 py-2 rounded-xl bg-amber-100 text-amber-800 text-xs font-bold cursor-pointer">Foto Ulang</button>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Unggah Hasil Scan',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#2563eb',
      didOpen: async (popup) => {
        const video = popup.querySelector('#swalScanVideo');
        const img = popup.querySelector('#swalScanPreview');
        const canvas = popup.querySelector('#swalScanCanvas');
        const snapBtn = popup.querySelector('#swalScanSnapBtn');
        const retakeBtn = popup.querySelector('#swalScanRetakeBtn');
        const flipBtn = popup.querySelector('#swalScanFlipBtn');
        try {
          await startCam(video);
        } catch (err) {
          w.Swal.showValidationMessage('Gagal mengakses kamera: ' + (err?.message || 'Izin ditolak'));
        }
        flipBtn?.addEventListener('click', async () => {
          facing = facing === 'environment' ? 'user' : 'environment';
          await startCam(video).catch(() => {});
        });
        snapBtn?.addEventListener('click', () => {
          if (!video.videoWidth) return;
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            if (!blob) return;
            capturedBlob = blob;
            img.src = URL.createObjectURL(blob);
            video.classList.add('hidden');
            img.classList.remove('hidden');
            snapBtn.classList.add('hidden');
            retakeBtn.classList.remove('hidden');
          }, 'image/jpeg', 0.9);
        });
        retakeBtn?.addEventListener('click', () => {
          capturedBlob = null;
          img.classList.add('hidden');
          video.classList.remove('hidden');
          retakeBtn.classList.add('hidden');
          snapBtn.classList.remove('hidden');
        });
      },
      willClose: () => stopCam(),
      preConfirm: () => {
        if (!capturedBlob) {
          w.Swal.showValidationMessage('Ambil foto dokumen terlebih dahulu sebelum mengunggah.');
          return false;
        }
        return capturedBlob;
      },
    });

    if (!res.isConfirmed || !res.value) return;
    try {
      const fname = `Scan_Surat_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.jpg`;
      await uploadSuratAttachment(res.value, fname, 'image/jpeg', modal);
    } catch (err) {
      w.Swal.fire('Gagal Mengunggah Hasil Scan', err?.message || 'Koneksi terganggu.', 'error');
    }
  }

  function showSppdGenerateMenu(item) {
    if (!item || !w.Swal || !w.SppdGenerator) return;
    w.Swal.fire({
      title: 'Generate Dokumen SPT & SPPD',
      width: 500,
      html: `
        <div class="text-left text-xs space-y-3">
          <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <div class="font-bold text-slate-900 dark:text-white">${esc(item.pelaksana_nama || '-')} &rarr; ${esc(item.tempat_tujuan || '-')}</div>
            <div class="font-mono text-[11px] text-primary mt-0.5">${esc(item.nomor_spt || '')} ${item.nomor_sppd ? '• ' + esc(item.nomor_sppd) : ''}</div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" id="btnGenCetakSpt" class="py-2.5 px-3 rounded-xl bg-[#2563eb] text-white font-bold cursor-pointer">Cetak / PDF SPT</button>
            <button type="button" id="btnGenCetakSppd" class="py-2.5 px-3 rounded-xl bg-[#2563eb] text-white font-bold cursor-pointer">Cetak / PDF SPPD</button>
            <button type="button" id="btnGenWordSpt" class="py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold cursor-pointer">Unduh Word SPT (.doc)</button>
            <button type="button" id="btnGenWordSppd" class="py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold cursor-pointer">Unduh Word SPPD (.doc)</button>
          </div>
        </div>
      `,
      showConfirmButton: true,
      confirmButtonText: 'Tutup',
      confirmButtonColor: '#64748b',
      didOpen: (el) => {
        el.querySelector('#btnGenCetakSpt')?.addEventListener('click', () => w.SppdGenerator.cetakSPT(item));
        el.querySelector('#btnGenCetakSppd')?.addEventListener('click', () => w.SppdGenerator.cetakSPPD(item));
        el.querySelector('#btnGenWordSpt')?.addEventListener('click', () => w.SppdGenerator.unduhWordSPT(item));
        el.querySelector('#btnGenWordSppd')?.addEventListener('click', () => w.SppdGenerator.unduhWordSPPD(item));
      },
    });
  }

  function resolveTabFromHash() {
    const h = String(w.location.hash || '').replace(/^#/, '').toLowerCase();
    if (h === 'agenda-surat') return 'agenda-surat';
    if (h === 'agenda-sppd') return 'agenda-sppd';
    return 'dokumen';
  }

  function fmtDate(val) {
    if (!val) return '-';
    const s = String(val);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const dt = new Date(s.slice(0, 10) + 'T00:00:00');
      if (!Number.isNaN(dt.getTime())) {
        return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
      }
    }
    return s;
  }

  function statusPill(st) {
    const s = String(st || 'Tercatat').toUpperCase();
    if (s.includes('SELESAI') || s.includes('TERBIT') || s.includes('DIKIRIM') || s.includes('LAPORAN')) {
      return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">${esc(st)}</span>`;
    }
    if (s.includes('DISPOSISI') || s.includes('PROSES') || s.includes('BERJALAN')) {
      return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-950/60 text-[#2563eb] dark:text-blue-300">${esc(st)}</span>`;
    }
    if (s.includes('BATAL') || s.includes('TOLAK')) {
      return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300">${esc(st)}</span>`;
    }
    return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">${esc(st || 'Tercatat')}</span>`;
  }

  function sifatPill(sifat) {
    const s = String(sifat || 'Biasa');
    if (/rahasia/i.test(s)) return `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300">${esc(s)}</span>`;
    if (/segera|penting/i.test(s)) return `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">${esc(s)}</span>`;
    return '';
  }

  function refreshPickersIn(root) {
    if (!root || !w.StitchPicker) return;
    root.querySelectorAll('select').forEach((s) => {
      w.StitchPicker.enhanceSelect?.(s);
      w.StitchPicker.refresh?.(s);
    });
    root.querySelectorAll('input[type="date"]').forEach((i) => w.StitchPicker.enhanceDate?.(i));
  }

  async function ensurePegawaiLoaded() {
    if (_pegawaiList.length) return _pegawaiList;
    try {
      const r = await fetch('/api/arsip/p/api/agenda/pegawai-list');
      const j = await r.json().catch(() => ({}));
      _pegawaiList = Array.isArray(j.items) ? j.items : (Array.isArray(j) ? j : []);
    } catch (_) {}
    d.querySelectorAll('datalist#agendaPegawaiDatalist').forEach((dl) => {
      dl.innerHTML = _pegawaiList.map((p) => `<option value="${esc(p.nama || p.username || '')}">${esc(p.nip ? `${p.nama || p.username} (${p.nip})` : (p.nama || ''))}</option>`).join('');
    });
    return _pegawaiList;
  }

  /* ── DESKTOP TAB ROUTING ──────────────────────────────────────────────── */
  function switchTab(tab, updateHash = true) {
    const next = TAB_META[tab] ? tab : 'dokumen';
    _activeTab = next;

    if (updateHash && w.location.hash !== '#' + next) {
      try { w.history.replaceState(null, '', '#' + next); } catch (_) { w.location.hash = next; }
      w.dispatchEvent(new HashChangeEvent('hashchange'));
    }

    togglePanel(d.getElementById('arsipPanelDokumen'), next === 'dokumen');
    togglePanel(d.getElementById('arsipPanelAgendaSurat'), next === 'agenda-surat');
    togglePanel(d.getElementById('arsipPanelAgendaSppd'), next === 'agenda-sppd');

    d.querySelectorAll('[data-arsip-tab-btn]').forEach((btn) => {
      const act = btn.dataset.arsipTabBtn === next;
      btn.className = act
        ? 'inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2563eb] text-white text-xs font-bold shadow-sm transition-all cursor-pointer'
        : 'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface text-xs font-semibold transition-all cursor-pointer';
    });

    const crumb = d.getElementById('arsipBreadcrumbTitle');
    if (crumb) crumb.textContent = TAB_META[next].crumb;

    const fab = d.getElementById('fabArsipAddDoc');
    if (fab) {
      const ic = fab.querySelector('.material-symbols-outlined');
      const sp = fab.querySelector('span:last-child');
      if (ic) ic.textContent = TAB_META[next].fabIcon;
      if (sp) sp.textContent = TAB_META[next].fabLabel;
    }

    if (next === 'agenda-surat') loadAgendaSurat();
    if (next === 'agenda-sppd') loadAgendaSppd();
  }

  function handleFabClick() {
    if (_activeTab === 'agenda-surat') { openSuratModal(); return; }
    if (_activeTab === 'agenda-sppd') { openSppdModal(); return; }
    w.ArsipColumns?.openUploadModal();
  }

  /* ── AGENDA SURAT (DESKTOP + SHARED ACTIONS) ──────────────────────────── */
  function setSuratMode(mode) {
    _suratMode = mode === 'keluar' ? 'keluar' : 'masuk';
    d.querySelectorAll('[data-surat-mode-btn]').forEach((btn) => {
      const act = btn.dataset.suratModeBtn === _suratMode;
      btn.className = act
        ? 'px-3.5 py-1.5 rounded-lg bg-[#2563eb] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer'
        : 'px-3.5 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition-colors cursor-pointer';
    });
    const thAsal = d.getElementById('thSuratAsalTujuan');
    if (thAsal) thAsal.textContent = _suratMode === 'masuk' ? 'Asal Surat' : 'Tujuan Surat';
    loadAgendaSurat();
  }

  async function loadAgendaSurat() {
    const tbody = d.getElementById('agendaSuratBody');
    const countEl = d.getElementById('agendaSuratCount');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" class="py-12 text-center text-xs text-slate-400"><span class="material-symbols-outlined text-xl text-primary animate-spin align-middle mr-2">progress_activity</span>Memuat agenda surat...</td></tr>';

    const tahun = d.getElementById('agendaSuratYear')?.value || String(new Date().getFullYear());
    const q = (d.getElementById('agendaSuratSearch')?.value || '').trim();
    const params = new URLSearchParams({ tahun, limit: '60' });
    if (q) params.set('q', q);

    const ep = _suratMode === 'masuk'
      ? `/api/arsip/p/api/agenda/surat-masuk?${params.toString()}`
      : `/api/arsip/p/api/agenda/surat-keluar?${params.toString()}`;

    try {
      const res = await fetch(ep);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
      _suratItems = Array.isArray(json.items) ? json.items : (Array.isArray(json) ? json : []);
      if (countEl) countEl.textContent = `${_suratItems.length} surat`;

      if (!_suratItems.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-xs text-slate-400">Belum ada data ${_suratMode === 'masuk' ? 'Surat Masuk' : 'Surat Keluar'} untuk tahun ${esc(tahun)}.</td></tr>`;
        return;
      }

      tbody.innerHTML = _suratItems.map((item, i) => {
        const noAgenda = _suratMode === 'masuk'
          ? (item.nomor_agenda || `#${item.id || i + 1}`)
          : (item.nomor_surat || `#${item.nomor_urut || item.id || i + 1}`);
        const noSub = _suratMode === 'masuk' ? (item.nomor_surat_asli || '-') : (item.bidang_pengonsep || '-');
        const tgl = _suratMode === 'masuk' ? fmtDate(item.tanggal_terima || item.tanggal_surat) : fmtDate(item.tanggal_surat);
        const pihak = _suratMode === 'masuk' ? (item.asal_surat || '-') : (item.tujuan_surat || '-');
        const st = item.status_tindaklanjut || item.status || 'Tercatat';

        return `
          <tr class="border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer" onclick="window.ArsipAgenda?.showSuratDetail(${i})">
            <td class="px-4 py-3 font-mono text-xs font-bold text-slate-900 dark:text-white whitespace-nowrap">
              <div class="flex items-center gap-1.5">${esc(noAgenda)} ${sifatPill(item.sifat)}</div>
              <div class="text-[10px] font-normal text-slate-400 truncate max-w-[180px]">${esc(noSub)}</div>
            </td>
            <td class="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">${esc(tgl)}</td>
            <td class="px-4 py-3 text-xs font-semibold text-slate-800 dark:text-slate-200 max-w-[200px] truncate">${esc(pihak)}</td>
            <td class="px-4 py-3 text-xs text-slate-700 dark:text-slate-300 max-w-[280px] truncate">${esc(item.perihal || '-')}</td>
            <td class="px-4 py-3 whitespace-nowrap">${statusPill(st)}</td>
            <td class="px-4 py-3 text-right whitespace-nowrap">
              <div class="inline-flex items-center gap-1.5">
                ${_suratMode === 'masuk' ? `<button type="button" onclick="event.stopPropagation(); window.ArsipAgenda?.openDisposisiModal(${item.id})" class="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-[#2563eb] dark:text-blue-300 text-[11px] font-bold cursor-pointer">Disposisi</button>` : ''}
                <button type="button" onclick="event.stopPropagation(); window.ArsipAgenda?.showSuratDetail(${i})" class="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-semibold cursor-pointer">Detail</button>
                <button type="button" onclick="event.stopPropagation(); window.ArsipAgenda?.deleteSurat(${item.id})" title="Hapus" class="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"><span class="material-symbols-outlined text-[16px]">delete</span></button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      if (countEl) countEl.textContent = '0 surat';
      tbody.innerHTML = `<tr><td colspan="6" class="py-10 text-center text-xs text-rose-500">Gagal memuat agenda surat: ${esc(err?.message || 'Koneksi terganggu')}</td></tr>`;
    }
  }

  function showSuratDetail(idx) {
    const item = _suratItems[idx];
    if (!item || !w.Swal) return;
    const isMasuk = _suratMode === 'masuk';
    const diteruskan = Array.isArray(item.diteruskan_kepada) ? item.diteruskan_kepada.join(', ') : (item.diteruskan_kepada || '');
    const rows = [
      ['Nomor Agenda / Surat', isMasuk ? (item.nomor_agenda || '-') : (item.nomor_surat || '-')],
      [isMasuk ? 'Nomor Surat Asli' : 'Bidang Pengonsep', isMasuk ? (item.nomor_surat_asli || '-') : (item.bidang_pengonsep || '-')],
      ['Tanggal Surat', fmtDate(item.tanggal_surat)],
      isMasuk ? ['Tanggal Diterima', fmtDate(item.tanggal_terima)] : null,
      ['Sifat Surat', item.sifat || 'Biasa'],
      [isMasuk ? 'Asal Surat' : 'Tujuan Surat', isMasuk ? (item.asal_surat || '-') : (item.tujuan_surat || '-')],
      ['Perihal', item.perihal || '-'],
      ['Status', item.status_tindaklanjut || item.status || 'Tercatat'],
      diteruskan ? ['Disposisi Kepada', diteruskan] : null,
      item.catatan_instruksi ? ['Catatan Disposisi', item.catatan_instruksi] : null,
    ].filter(Boolean);

    const fileUrl = item.file_url || item.file_final_url || item.drive_url || '';
    const html = `
      <div class="text-left text-xs divide-y divide-slate-100 dark:divide-slate-800">
        ${rows.map(([k, v]) => `<div class="py-2 flex justify-between gap-4"><span class="text-slate-500 shrink-0">${esc(k)}</span><span class="font-semibold text-slate-900 dark:text-white text-right">${esc(v)}</span></div>`).join('')}
        ${fileUrl ? `<div class="pt-3"><a href="${esc(fileUrl)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#2563eb] text-white font-bold text-xs">Buka Lampiran Berkas</a></div>` : ''}
      </div>
    `;
    w.Swal.fire({
      title: isMasuk ? 'Detail Surat Masuk' : 'Detail Surat Keluar',
      html,
      width: 540,
      showDenyButton: isMasuk,
      denyButtonText: 'Lembar Disposisi',
      denyButtonColor: '#0f172a',
      confirmButtonText: 'Tutup',
      confirmButtonColor: '#2563eb',
    }).then((res) => {
      if (res.isDenied && isMasuk) openDisposisiModal(item.id);
    });
  }

  async function openDisposisiModal(suratId) {
    if (!w.Swal || !suratId) return;
    let history = [];
    try {
      const r = await fetch(`/api/arsip/p/api/agenda/surat-masuk/${suratId}/disposisi`);
      const j = await r.json().catch(() => ({}));
      history = Array.isArray(j.items) ? j.items : (Array.isArray(j) ? j : []);
    } catch (_) {}

    const histHtml = history.length
      ? `<div class="mb-3 max-h-32 overflow-y-auto flex flex-col gap-1.5">${history.map((h) => `
          <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-left text-[11px] border border-slate-200/70 dark:border-slate-700">
            <div class="font-bold text-slate-900 dark:text-white">${esc(Array.isArray(h.diteruskan_kepada) ? h.diteruskan_kepada.join(', ') : (h.diteruskan_kepada || '-'))}</div>
            <div class="text-slate-600 dark:text-slate-300">${esc(h.catatan_instruksi || (Array.isArray(h.arahan) ? h.arahan.join('; ') : ''))}</div>
            <div class="text-[10px] text-slate-400 font-mono mt-0.5">${esc(fmtDate(h.tanggal_disposisi))} • ${esc(h.pemberi_disposisi || '')}</div>
          </div>`).join('')}</div>`
      : '';

    const { value: formValues } = await w.Swal.fire({
      title: 'Lembar Disposisi Surat Masuk',
      width: 560,
      html: `
        ${histHtml}
        <div class="text-left flex flex-col gap-3 text-xs">
          <div>
            <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Diteruskan Kepada *</label>
            <select id="swalDispTujuan" class="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
              ${DITERUSKAN_OPTIONS.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Arahan Pimpinan *</label>
            <select id="swalDispArahan" class="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
              ${ARAHAN_OPTIONS.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Batas Waktu (Opsional)</label>
            <input id="swalDispBatas" type="date" class="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono">
          </div>
          <div>
            <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1">Catatan / Instruksi Tambahan</label>
            <textarea id="swalDispCatatan" rows="2" placeholder="Instruksi khusus..." class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"></textarea>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Kirim Disposisi',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#2563eb',
      preConfirm: () => ({
        diteruskan_kepada: [d.getElementById('swalDispTujuan')?.value || ''],
        arahan: [d.getElementById('swalDispArahan')?.value || ''],
        batas_waktu: d.getElementById('swalDispBatas')?.value || null,
        catatan_instruksi: (d.getElementById('swalDispCatatan')?.value || '').trim(),
      }),
    });

    if (!formValues) return;
    try {
      const r = await fetch(`/api/arsip/p/api/agenda/surat-masuk/${suratId}/disposisi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false) throw new Error(j.message || `HTTP ${r.status}`);
      w.Swal.fire({ icon: 'success', title: 'Disposisi Tersimpan', text: 'Lembar disposisi berhasil dicatat.' });
      loadAgendaSurat();
      loadMobileAgendaSurat();
    } catch (err) {
      w.Swal.fire({ icon: 'error', title: 'Gagal', text: err?.message || 'Koneksi terganggu.' });
    }
  }

  async function deleteSurat(id) {
    if (!id || !w.Swal) return;
    const cf = await w.Swal.fire({
      icon: 'warning',
      title: 'Hapus Agenda Surat?',
      text: 'Data agenda surat yang dipilih akan dihapus permanen.',
      showCancelButton: true,
      confirmButtonText: 'Ya, Hapus',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#dc2626',
    });
    if (!cf.isConfirmed) return;
    const ep = _suratMode === 'masuk' ? `/api/arsip/p/api/agenda/surat-masuk/${id}` : `/api/arsip/p/api/agenda/surat-keluar/${id}`;
    try {
      const r = await fetch(ep, { method: 'DELETE' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false) throw new Error(j.message || `HTTP ${r.status}`);
      loadAgendaSurat();
      loadMobileAgendaSurat();
    } catch (err) {
      w.Swal.fire({ icon: 'error', title: 'Gagal Menghapus', text: err?.message || 'Koneksi terganggu.' });
    }
  }

  async function previewNomorSuratKeluar(btnEl) {
    const modal = btnEl?.closest('#modalArsipAgendaSurat, #drawerMobileAgendaSurat');
    if (!modal) return;
    const kode = modal.querySelector('[data-surat-field="kode"]')?.value || '050';
    const tgl = modal.querySelector('[data-surat-field="tanggal"]')?.value || new Date().toISOString().slice(0, 10);
    const tahun = tgl.slice(0, 4);
    const bulan = Number(tgl.slice(5, 7)) || (new Date().getMonth() + 1);
    try {
      const r = await fetch(`/api/arsip/p/api/agenda/surat-keluar/preview-nomor?tahun=${encodeURIComponent(tahun)}&kode=${encodeURIComponent(kode)}&bulan=${bulan}`);
      const j = await r.json().catch(() => ({}));
      const nomor = j.nomor_surat || j.nomor || '';
      const inp = modal.querySelector('[data-surat-field="nomor"]');
      if (inp && nomor) inp.value = nomor;
    } catch (_) {}
  }

  function openSuratModal(targetId) {
    const m = d.getElementById(targetId || 'modalArsipAgendaSurat') || d.getElementById('drawerMobileAgendaSurat');
    if (!m) return;
    const isMasuk = _suratMode === 'masuk';
    const titleEl = m.querySelector('[data-surat-modal-title]');
    if (titleEl) titleEl.textContent = isMasuk ? 'Catat Agenda Surat Masuk' : 'Catat Agenda Surat Keluar';
    const lblPihak = m.querySelector('[data-surat-pihak-label]');
    if (lblPihak) lblPihak.textContent = isMasuk ? 'Asal Surat *' : 'Tujuan Surat *';
    m.querySelectorAll('[data-surat-keluar-only]').forEach((el) => el.classList.toggle('hidden', isMasuk));
    m.querySelectorAll('input, textarea').forEach((el) => {
      if (el.type === 'date') el.value = new Date().toISOString().slice(0, 10);
      else el.value = '';
    });
    m.classList.remove('hidden');
    m.classList.add('flex');
    refreshPickersIn(m);
  }

  function closeSuratModal() {
    ['modalArsipAgendaSurat', 'drawerMobileAgendaSurat'].forEach((id) => {
      const m = d.getElementById(id);
      if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
    });
  }

  async function submitSurat(btnEl) {
    const m = btnEl?.closest('#modalArsipAgendaSurat, #drawerMobileAgendaSurat') || d.getElementById('modalArsipAgendaSurat');
    if (!m) return;
    const v = (k) => (m.querySelector(`[data-surat-field="${k}"]`)?.value || '').trim();
    const nomor = v('nomor');
    const kode = v('kode') || '050';
    const sifat = v('sifat') || 'Biasa';
    const tanggal = v('tanggal') || new Date().toISOString().slice(0, 10);
    const pihak = v('pihak');
    const perihal = v('perihal');
    const bidang = v('bidang') || 'Sekretariat';
    const keterangan = v('keterangan');
    const fileUrl = v('file_url');

    if (!pihak || !perihal) {
      if (w.Swal) w.Swal.fire('Perhatian', 'Asal/Tujuan surat dan Perihal wajib diisi.', 'warning');
      return;
    }

    const orig = btnEl ? btnEl.innerHTML : '';
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Menyimpan...'; }

    const isMasuk = _suratMode === 'masuk';
    const ep = isMasuk ? '/api/arsip/p/api/agenda/surat-masuk' : '/api/arsip/p/api/agenda/surat-keluar';
    const body = isMasuk
      ? { nomor_surat_asli: nomor, kode_klasifikasi: kode, sifat, tanggal_surat: tanggal, tanggal_terima: tanggal, asal_surat: pihak, perihal, keterangan, file_url: fileUrl || null, tahun: Number(tanggal.slice(0, 4)) }
      : { nomor_surat: nomor, kode_klasifikasi: kode, sifat, tanggal_surat: tanggal, tujuan_surat: pihak, perihal, bidang_pengonsep: bidang, keterangan, file_final_url: fileUrl || null, tahun: Number(tanggal.slice(0, 4)) };

    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) throw new Error(json.message || `HTTP ${res.status}`);
      closeSuratModal();
      if (w.Swal) w.Swal.fire({ icon: 'success', title: 'Tersimpan', text: 'Agenda surat berhasil dicatat.' });
      loadAgendaSurat();
      loadMobileAgendaSurat();
    } catch (err) {
      if (w.Swal) w.Swal.fire({ icon: 'error', title: 'Gagal Menyimpan', text: err?.message || 'Koneksi terganggu.' });
    } finally {
      if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = orig; }
    }
  }

  /* ── AGENDA SPPD (DESKTOP + SHARED ACTIONS) ───────────────────────────── */
  function setSppdJenis(jenis) {
    _sppdJenis = jenis || '';
    d.querySelectorAll('[data-sppd-jenis-btn]').forEach((btn) => {
      const act = (btn.dataset.sppdJenisBtn || '') === _sppdJenis;
      btn.className = act
        ? 'px-3.5 py-1.5 rounded-lg bg-[#2563eb] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer'
        : 'px-3.5 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition-colors cursor-pointer';
    });
    loadAgendaSppd();
  }

  async function loadAgendaSppd() {
    const tbody = d.getElementById('agendaSppdBody');
    const countEl = d.getElementById('agendaSppdCount');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" class="py-12 text-center text-xs text-slate-400"><span class="material-symbols-outlined text-xl text-primary animate-spin align-middle mr-2">progress_activity</span>Memuat register SPPD...</td></tr>';

    const tahun = d.getElementById('agendaSppdYear')?.value || String(new Date().getFullYear());
    const q = (d.getElementById('agendaSppdSearch')?.value || '').trim();
    const params = new URLSearchParams({ tahun, limit: '60' });
    if (_sppdJenis) params.set('jenis', _sppdJenis);
    if (q) params.set('q', q);

    try {
      const res = await fetch(`/api/arsip/p/api/agenda/sppd?${params.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
      _sppdItems = Array.isArray(json.items) ? json.items : (Array.isArray(json) ? json : []);
      if (countEl) countEl.textContent = `${_sppdItems.length} SPPD`;

      if (!_sppdItems.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-xs text-slate-400">Belum ada data Agenda SPPD untuk tahun ${esc(tahun)}.</td></tr>`;
        return;
      }

      tbody.innerHTML = _sppdItems.map((item, i) => {
        const noSppd = item.nomor_sppd || item.nomor_spt || `#${item.id || i + 1}`;
        const noSpt = item.nomor_spt && item.nomor_sppd ? item.nomor_spt : (item.jenis_sppd === 'LUAR_DAERAH' ? 'Luar Daerah' : 'Dalam Daerah');
        const tglRange = `${fmtDate(item.tanggal_berangkat)} – ${fmtDate(item.tanggal_kembali)}`;
        return `
          <tr class="border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer" onclick="window.ArsipAgenda?.showSppdDetail(${i})">
            <td class="px-4 py-3 font-mono text-xs font-bold text-slate-900 dark:text-white whitespace-nowrap">${esc(noSppd)}<div class="text-[10px] font-normal text-slate-400">${esc(noSpt)}</div></td>
            <td class="px-4 py-3 text-xs font-semibold text-slate-800 dark:text-slate-200 max-w-[180px] truncate">${esc(item.pelaksana_nama || '-')}</td>
            <td class="px-4 py-3 text-xs text-slate-700 dark:text-slate-300 max-w-[170px] truncate">${esc(item.tempat_tujuan || '-')}</td>
            <td class="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">${esc(tglRange)}</td>
            <td class="px-4 py-3 text-xs text-slate-700 dark:text-slate-300 max-w-[230px] truncate">${esc(item.maksud_perjalanan || '-')}</td>
            <td class="px-4 py-3 whitespace-nowrap text-right">
              <div class="inline-flex items-center gap-1.5">
                ${statusPill(item.status || 'Tercatat')}
                <button type="button" onclick="event.stopPropagation(); window.ArsipAgenda?.generateSppdByIndex(${i})" class="px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold cursor-pointer" title="Generate SPT & SPPD">Cetak/Word</button>
                <button type="button" onclick="event.stopPropagation(); window.ArsipAgenda?.openSppdSpjModal(${item.id})" class="px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-[#2563eb] dark:text-blue-300 text-[10px] font-bold cursor-pointer">LHP/SPJ</button>
                <button type="button" onclick="event.stopPropagation(); window.ArsipAgenda?.deleteSppd(${item.id})" title="Hapus" class="p-1 rounded-lg text-slate-400 hover:text-rose-600 cursor-pointer"><span class="material-symbols-outlined text-[16px]">delete</span></button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      if (countEl) countEl.textContent = '0 SPPD';
      tbody.innerHTML = `<tr><td colspan="6" class="py-10 text-center text-xs text-rose-500">Gagal memuat register SPPD: ${esc(err?.message || 'Koneksi terganggu')}</td></tr>`;
    }
  }

  function showSppdDetail(idx) {
    const item = _sppdItems[idx];
    if (!item || !w.Swal) return;
    const rows = [
      ['Nomor SPPD', item.nomor_sppd || '-'],
      ['Nomor SPT', item.nomor_spt || '-'],
      ['Jenis Perjalanan', item.jenis_sppd === 'LUAR_DAERAH' ? 'Luar Daerah' : 'Dalam Daerah'],
      ['Pejabat Perintah', item.pejabat_perintah || 'Kepala BAPPERIDA'],
      ['Pelaksana', item.pelaksana_nama || '-'],
      ['Tempat Tujuan', item.tempat_tujuan || '-'],
      ['Tanggal Berangkat', fmtDate(item.tanggal_berangkat)],
      ['Tanggal Kembali', fmtDate(item.tanggal_kembali)],
      ['Alat Angkutan', item.alat_angkutan || '-'],
      ['Maksud Perjalanan', item.maksud_perjalanan || '-'],
      ['Status', item.status || 'Tercatat'],
    ];
    const lhp = item.file_lhp_url || '';
    const html = `
      <div class="text-left text-xs divide-y divide-slate-100 dark:divide-slate-800">
        ${rows.map(([k, v]) => `<div class="py-2 flex justify-between gap-4"><span class="text-slate-500 shrink-0">${esc(k)}</span><span class="font-semibold text-slate-900 dark:text-white text-right">${esc(v)}</span></div>`).join('')}
        ${lhp ? `<div class="pt-3"><a href="${esc(lhp)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs">Buka Berkas LHP / SPJ</a></div>` : ''}
      </div>
    `;
    w.Swal.fire({
      title: 'Detail Agenda SPPD',
      html,
      width: 540,
      showDenyButton: true,
      denyButtonText: 'Tautkan LHP / SPJ',
      denyButtonColor: '#0f172a',
      confirmButtonText: 'Tutup',
      confirmButtonColor: '#2563eb',
    }).then((res) => {
      if (res.isDenied) openSppdSpjModal(item.id);
    });
  }

  async function openSppdSpjModal(id) {
    if (!w.Swal || !id) return;
    const { value: url } = await w.Swal.fire({
      title: 'Tautkan Berkas LHP / SPJ SPPD',
      input: 'url',
      inputLabel: 'URL Google Drive Berkas Laporan Hasil Perjalanan / SPJ',
      inputPlaceholder: 'https://drive.google.com/file/d/...',
      showCancelButton: true,
      confirmButtonText: 'Simpan LHP / SPJ',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#2563eb',
    });
    if (!url) return;
    try {
      const r = await fetch(`/api/arsip/p/api/agenda/sppd/${id}/spj`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_lhp_url: url, url }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false) throw new Error(j.message || `HTTP ${r.status}`);
      w.Swal.fire({ icon: 'success', title: 'Tersimpan', text: 'Status SPPD diperbarui menjadi Laporan Masuk.' });
      loadAgendaSppd();
      loadMobileAgendaSppd();
    } catch (err) {
      w.Swal.fire({ icon: 'error', title: 'Gagal', text: err?.message || 'Koneksi terganggu.' });
    }
  }

  async function deleteSppd(id) {
    if (!id || !w.Swal) return;
    const cf = await w.Swal.fire({
      icon: 'warning',
      title: 'Hapus Agenda SPPD?',
      text: 'Data register SPPD ini akan dihapus permanen.',
      showCancelButton: true,
      confirmButtonText: 'Ya, Hapus',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#dc2626',
    });
    if (!cf.isConfirmed) return;
    try {
      const r = await fetch(`/api/arsip/p/api/agenda/sppd/${id}`, { method: 'DELETE' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false) throw new Error(j.message || `HTTP ${r.status}`);
      loadAgendaSppd();
      loadMobileAgendaSppd();
    } catch (err) {
      w.Swal.fire({ icon: 'error', title: 'Gagal Menghapus', text: err?.message || 'Koneksi terganggu.' });
    }
  }

  async function previewNomorSppd(btnEl) {
    const modal = btnEl?.closest('#modalArsipAgendaSppd, #drawerMobileAgendaSppd');
    if (!modal) return;
    const jenis = modal.querySelector('[data-sppd-field="jenis"]')?.value || 'DALAM_DAERAH';
    const tgl = modal.querySelector('[data-sppd-field="berangkat"]')?.value || new Date().toISOString().slice(0, 10);
    const tahun = tgl.slice(0, 4);
    try {
      const r = await fetch(`/api/arsip/p/api/agenda/sppd/preview-nomor?tahun=${encodeURIComponent(tahun)}&jenis=${encodeURIComponent(jenis)}`);
      const j = await r.json().catch(() => ({}));
      const sptInp = modal.querySelector('[data-sppd-field="nomor_spt"]');
      const sppdInp = modal.querySelector('[data-sppd-field="nomor_sppd"]');
      if (sptInp && j.nomor_spt) sptInp.value = j.nomor_spt;
      if (sppdInp && j.nomor_sppd) sppdInp.value = j.nomor_sppd;
    } catch (_) {}
  }

  function openSppdModal(targetId) {
    const m = d.getElementById(targetId || 'modalArsipAgendaSppd') || d.getElementById('drawerMobileAgendaSppd');
    if (!m) return;
    ensurePegawaiLoaded();
    const today = new Date().toISOString().slice(0, 10);
    m.querySelectorAll('input, textarea').forEach((el) => {
      el.value = el.type === 'date' ? today : '';
    });
    m.classList.remove('hidden');
    m.classList.add('flex');
    refreshPickersIn(m);
  }

  function closeSppdModal() {
    ['modalArsipAgendaSppd', 'drawerMobileAgendaSppd'].forEach((id) => {
      const m = d.getElementById(id);
      if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
    });
  }

  async function submitSppd(btnEl) {
    const m = btnEl?.closest('#modalArsipAgendaSppd, #drawerMobileAgendaSppd') || d.getElementById('modalArsipAgendaSppd');
    if (!m) return;
    const v = (k) => (m.querySelector(`[data-sppd-field="${k}"]`)?.value || '').trim();
    const pelaksana_nama = v('pelaksana');
    const tempat_tujuan = v('tujuan');
    const maksud_perjalanan = v('maksud');
    const jenis_sppd = v('jenis') || 'DALAM_DAERAH';
    const tanggal_berangkat = v('berangkat') || new Date().toISOString().slice(0, 10);
    const tanggal_kembali = v('kembali') || tanggal_berangkat;
    const alat_angkutan = v('angkutan') || 'Kendaraan Dinas Roda 4';
    const pejabat_perintah = v('pejabat') || 'Kepala BAPPERIDA';
    const nomor_spt = v('nomor_spt');
    const nomor_sppd = v('nomor_sppd');

    if (!pelaksana_nama || !tempat_tujuan || !maksud_perjalanan) {
      if (w.Swal) w.Swal.fire('Perhatian', 'Nama pelaksana, tempat tujuan, dan maksud perjalanan wajib diisi.', 'warning');
      return;
    }

    const orig = btnEl ? btnEl.innerHTML : '';
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Menyimpan...'; }

    try {
      const res = await fetch('/api/arsip/p/api/agenda/sppd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jenis_sppd,
          pejabat_perintah,
          nomor_spt: nomor_spt || undefined,
          nomor_sppd: nomor_sppd || undefined,
          pelaksana_nama,
          tempat_tujuan,
          maksud_perjalanan,
          tanggal_berangkat,
          tanggal_kembali,
          alat_angkutan,
          tahun: Number(tanggal_berangkat.slice(0, 4)),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) throw new Error(json.message || `HTTP ${res.status}`);
      closeSppdModal();
      loadAgendaSppd();
      loadMobileAgendaSppd();
      const savedItem = json.item || {
        jenis_sppd, pejabat_perintah, nomor_spt, nomor_sppd, pelaksana_nama,
        tempat_tujuan, maksud_perjalanan, tanggal_berangkat, tanggal_kembali, alat_angkutan,
        tahun: Number(tanggal_berangkat.slice(0, 4)),
      };
      if (w.SppdGenerator) {
        showSppdGenerateMenu(savedItem);
      } else if (w.Swal) {
        w.Swal.fire({ icon: 'success', title: 'Tersimpan', text: 'Agenda SPPD berhasil dicatat.' });
      }
    } catch (err) {
      if (w.Swal) w.Swal.fire({ icon: 'error', title: 'Gagal Menyimpan', text: err?.message || 'Koneksi terganggu.' });
    } finally {
      if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = orig; }
    }
  }

  /* ── MOBILE #view-arsip SUB-MENU (Dokumen | Agenda Surat | Agenda SPPD) ── */
  function switchMobileTab(tab) {
    _mTab = (tab === 'agenda-surat' || tab === 'agenda-sppd') ? tab : 'dokumen';
    togglePanel(d.getElementById('mobileArsipTabDokumen'), _mTab === 'dokumen');
    togglePanel(d.getElementById('mobileArsipTabAgendaSurat'), _mTab === 'agenda-surat');
    togglePanel(d.getElementById('mobileArsipTabAgendaSppd'), _mTab === 'agenda-sppd');

    d.querySelectorAll('[data-m-arsip-tab]').forEach((btn) => {
      const act = btn.dataset.mArsipTab === _mTab;
      btn.className = act
        ? 'flex-1 py-2 px-2 rounded-xl bg-[#2563eb] text-white text-[11px] font-bold shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1'
        : 'flex-1 py-2 px-2 rounded-xl text-slate-600 dark:text-slate-300 text-[11px] font-semibold transition-all cursor-pointer flex items-center justify-center gap-1';
    });

    if (_mTab === 'agenda-surat') {
      refreshPickersIn(d.getElementById('mobileArsipTabAgendaSurat'));
      loadMobileAgendaSurat();
    }
    if (_mTab === 'agenda-sppd') {
      refreshPickersIn(d.getElementById('mobileArsipTabAgendaSppd'));
      loadMobileAgendaSppd();
    }
  }

  function setMobileSuratMode(mode) {
    _mSuratMode = mode === 'keluar' ? 'keluar' : 'masuk';
    _suratMode = _mSuratMode;
    d.querySelectorAll('[data-m-surat-mode]').forEach((btn) => {
      const act = btn.dataset.mSuratMode === _mSuratMode;
      btn.className = act
        ? 'flex-1 py-1.5 rounded-lg bg-[#2563eb] text-white text-[11px] font-bold cursor-pointer'
        : 'flex-1 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 text-[11px] font-semibold cursor-pointer';
    });
    loadMobileAgendaSurat();
  }

  async function loadMobileAgendaSurat() {
    const box = d.getElementById('mobileAgendaSuratList');
    if (!box) return;
    box.innerHTML = '<div class="py-8 text-center text-xs text-slate-400"><span class="material-symbols-outlined text-xl animate-spin text-primary align-middle mr-1">progress_activity</span>Memuat agenda surat...</div>';
    const tahun = d.getElementById('mobileAgendaSuratYear')?.value || String(new Date().getFullYear());
    const q = (d.getElementById('mobileAgendaSuratSearch')?.value || '').trim();
    const params = new URLSearchParams({ tahun, limit: '40' });
    if (q) params.set('q', q);
    const ep = _mSuratMode === 'masuk'
      ? `/api/arsip/p/api/agenda/surat-masuk?${params.toString()}`
      : `/api/arsip/p/api/agenda/surat-keluar?${params.toString()}`;
    try {
      const r = await fetch(ep);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message || `HTTP ${r.status}`);
      _suratItems = Array.isArray(j.items) ? j.items : (Array.isArray(j) ? j : []);

      const stTotal = d.getElementById('mSuratStatTotal');
      const stDisp = d.getElementById('mSuratStatDisposisi');
      if (stTotal) stTotal.textContent = String(_suratItems.length);
      if (stDisp) {
        const cnt = _suratItems.filter((x) => /disposisi|terbit|selesai/i.test(String(x.status_tindaklanjut || x.status || ''))).length;
        stDisp.textContent = String(cnt);
      }

      if (!_suratItems.length) {
        box.innerHTML = `<div class="p-6 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">Belum ada data ${_mSuratMode === 'masuk' ? 'Surat Masuk' : 'Surat Keluar'} tahun ${esc(tahun)}.</div>`;
        return;
      }
      box.innerHTML = _suratItems.map((item, i) => {
        const no = _mSuratMode === 'masuk' ? (item.nomor_agenda || `#${item.id || i + 1}`) : (item.nomor_surat || `#${item.nomor_urut || item.id || i + 1}`);
        const pihak = _mSuratMode === 'masuk' ? (item.asal_surat || '-') : (item.tujuan_surat || '-');
        const tgl = fmtDate(_mSuratMode === 'masuk' ? (item.tanggal_terima || item.tanggal_surat) : item.tanggal_surat);
        return `
          <div onclick="window.ArsipAgenda?.showSuratDetail(${i})" class="w-full text-left p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-xs hover:border-blue-300 transition-colors cursor-pointer flex flex-col gap-2">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="font-mono text-[11px] font-bold text-primary truncate">${esc(no)}</span>
                ${sifatPill(item.sifat)}
              </div>
              ${statusPill(item.status_tindaklanjut || item.status || 'Tercatat')}
            </div>
            <div class="text-xs font-bold text-slate-900 dark:text-white line-clamp-2">${esc(item.perihal || '-')}</div>
            <div class="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 gap-2">
              <span class="truncate">${esc(pihak)}</span>
              <span class="font-mono shrink-0">${esc(tgl)}</span>
            </div>
            <div class="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-1.5">
              ${_mSuratMode === 'masuk' ? `<button type="button" onclick="event.stopPropagation(); window.ArsipAgenda?.openDisposisiModal(${item.id})" class="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-[#2563eb] dark:text-blue-300 text-[11px] font-bold cursor-pointer">Disposisi</button>` : ''}
              <button type="button" onclick="event.stopPropagation(); window.ArsipAgenda?.deleteSurat(${item.id})" class="px-2 py-1 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-[11px] font-semibold cursor-pointer">Hapus</button>
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      box.innerHTML = `<div class="p-6 text-center text-xs text-rose-500 bg-white dark:bg-slate-900 rounded-2xl border border-rose-200 dark:border-rose-900">Gagal memuat: ${esc(err?.message || 'Koneksi terganggu')}</div>`;
    }
  }

  function setMobileSppdJenis(jenis) {
    _mSppdJenis = jenis || '';
    _sppdJenis = _mSppdJenis;
    d.querySelectorAll('[data-m-sppd-jenis]').forEach((btn) => {
      const act = (btn.dataset.mSppdJenis || '') === _mSppdJenis;
      btn.className = act
        ? 'flex-1 py-1.5 rounded-lg bg-[#2563eb] text-white text-[11px] font-bold cursor-pointer'
        : 'flex-1 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 text-[11px] font-semibold cursor-pointer';
    });
    loadMobileAgendaSppd();
  }

  async function loadMobileAgendaSppd() {
    const box = d.getElementById('mobileAgendaSppdList');
    if (!box) return;
    box.innerHTML = '<div class="py-8 text-center text-xs text-slate-400"><span class="material-symbols-outlined text-xl animate-spin text-primary align-middle mr-1">progress_activity</span>Memuat agenda SPPD...</div>';
    const tahun = d.getElementById('mobileAgendaSppdYear')?.value || String(new Date().getFullYear());
    const q = (d.getElementById('mobileAgendaSppdSearch')?.value || '').trim();
    const params = new URLSearchParams({ tahun, limit: '40' });
    if (_mSppdJenis) params.set('jenis', _mSppdJenis);
    if (q) params.set('q', q);
    try {
      const r = await fetch(`/api/arsip/p/api/agenda/sppd?${params.toString()}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message || `HTTP ${r.status}`);
      _sppdItems = Array.isArray(j.items) ? j.items : (Array.isArray(j) ? j : []);

      const stTotal = d.getElementById('mSppdStatTotal');
      const stDalam = d.getElementById('mSppdStatDalam');
      const stLuar = d.getElementById('mSppdStatLuar');
      if (stTotal) stTotal.textContent = String(_sppdItems.length);
      if (stDalam) stDalam.textContent = String(_sppdItems.filter((x) => x.jenis_sppd !== 'LUAR_DAERAH').length);
      if (stLuar) stLuar.textContent = String(_sppdItems.filter((x) => x.jenis_sppd === 'LUAR_DAERAH').length);

      if (!_sppdItems.length) {
        box.innerHTML = `<div class="p-6 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">Belum ada data Agenda SPPD tahun ${esc(tahun)}.</div>`;
        return;
      }
      box.innerHTML = _sppdItems.map((item, i) => {
        const no = item.nomor_sppd || item.nomor_spt || `#${item.id || i + 1}`;
        return `
          <div onclick="window.ArsipAgenda?.showSppdDetail(${i})" class="w-full text-left p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-xs hover:border-blue-300 transition-colors cursor-pointer flex flex-col gap-1.5">
            <div class="flex items-center justify-between gap-2">
              <span class="font-mono text-[11px] font-bold text-primary truncate">${esc(no)}</span>
              ${statusPill(item.status || 'Tercatat')}
            </div>
            <div class="text-xs font-bold text-slate-900 dark:text-white truncate">${esc(item.pelaksana_nama || '-')} &rarr; ${esc(item.tempat_tujuan || '-')}</div>
            <div class="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-1">${esc(item.maksud_perjalanan || '-')}</div>
            <div class="flex items-center justify-between pt-1.5 border-t border-slate-100 dark:border-slate-800">
              <span class="font-mono text-[10px] text-slate-400">${esc(fmtDate(item.tanggal_berangkat))} – ${esc(fmtDate(item.tanggal_kembali))}</span>
              <div class="flex items-center gap-1.5">
                <button type="button" onclick="event.stopPropagation(); window.ArsipAgenda?.generateSppdByIndex(${i})" class="px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold cursor-pointer">Cetak/Word</button>
                <button type="button" onclick="event.stopPropagation(); window.ArsipAgenda?.openSppdSpjModal(${item.id})" class="px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-[#2563eb] dark:text-blue-300 text-[10px] font-bold cursor-pointer">LHP/SPJ</button>
                <button type="button" onclick="event.stopPropagation(); window.ArsipAgenda?.deleteSppd(${item.id})" class="px-2 py-1 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-[10px] font-semibold cursor-pointer">Hapus</button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      box.innerHTML = `<div class="p-6 text-center text-xs text-rose-500 bg-white dark:bg-slate-900 rounded-2xl border border-rose-200 dark:border-rose-900">Gagal memuat: ${esc(err?.message || 'Koneksi terganggu')}</div>`;
    }
  }

  w.ArsipAgenda = {
    switchTab,
    handleFabClick,
    setSuratMode,
    loadAgendaSurat,
    showSuratDetail,
    openDisposisiModal,
    deleteSurat,
    previewNomorSuratKeluar,
    openSuratModal,
    closeSuratModal,
    submitSurat,
    setSppdJenis,
    loadAgendaSppd,
    showSppdDetail,
    openSppdSpjModal,
    deleteSppd,
    previewNomorSppd,
    openSppdModal,
    closeSppdModal,
    submitSppd,
    switchMobileTab,
    setMobileSuratMode,
    loadMobileAgendaSurat,
    setMobileSppdJenis,
    loadMobileAgendaSppd,
    uploadSuratFile,
    openSuratCameraScan,
    generateSppdByIndex(idx) {
      const item = _sppdItems[idx];
      if (item) showSppdGenerateMenu(item);
    },
  };

  function boot() {
    if (!d.getElementById('arsipPanelDokumen')) return;
    switchTab(resolveTabFromHash(), false);
    w.addEventListener('hashchange', () => {
      const t = resolveTabFromHash();
      if (t !== _activeTab) switchTab(t, false);
    });
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window, document);
