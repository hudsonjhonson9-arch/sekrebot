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
    'Selesaikan sesuai batas waktu',
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

  const PEMBERI_DISPOSISI_OPTIONS = [
    'Kepala BAPPERIDA',
    'Sekretaris BAPPERIDA',
    'Kepala Bidang PPE',
    'Kepala Bidang PSDA',
    'Kepala Bidang PPM',
    'Kepala Bidang Infrastruktur & Kewilayahan',
    'Kepala Bidang Riset & Inovasi Daerah',
    'Kasubbag Umum & Kepegawaian',
    'Kasubbag Perencanaan & Keuangan',
  ];

  function buildDisposisiWaText(surat = {}, disp = null) {
    const s = surat || {};
    const dObj = disp || {};
    const ditRaw = dObj.diteruskan_kepada || s.diteruskan_kepada;
    const ditArr = Array.isArray(ditRaw) ? ditRaw : (ditRaw ? [ditRaw] : []);
    const arRaw = dObj.arahan || s.arahan;
    const arArr = Array.isArray(arRaw) ? arRaw : (arRaw ? [arRaw] : []);
    const link = s.file_url || s.file_final_url || s.drive_url || '';
    const line = '━━━━━━━━━━━━━━━━━━━━━━━━━';

    let txt = `📌 *LEMBAR DISPOSISI SURAT MASUK*\n${line}\n`;
    txt += `🔢 *No. Agenda* : ${s.nomor_agenda || '—'}\n`;
    txt += `📄 *No. Surat*  : ${s.nomor_surat_asli || '—'}\n`;
    txt += `🏢 *Asal Surat* : ${s.asal_surat || '—'}\n`;
    txt += `🏷️ *Sifat*      : ${s.sifat || 'Biasa'}\n`;
    txt += `📝 *Perihal*    : ${s.perihal || '—'}\n\n`;
    txt += `👤 *Pemberi*    : ${dObj.pemberi_disposisi || 'Kepala BAPPERIDA'}\n`;
    txt += `📅 *Tanggal*    : ${fmtDate(dObj.tanggal_disposisi || new Date().toISOString().slice(0, 10))}\n`;
    if (ditArr.length) txt += `➡️ *Diteruskan* : ${ditArr.join(', ')}\n`;
    if (arArr.length) txt += `📋 *Arahan*     : ${arArr.join('; ')}\n`;
    if (dObj.catatan_instruksi) txt += `💬 *Catatan*    : ${dObj.catatan_instruksi}\n`;
    if (dObj.batas_waktu) txt += `⏰ *Batas Waktu*: ${fmtDate(dObj.batas_waktu)}\n`;
    if (link) txt += `📎 *Lampiran*   : ${link}\n`;
    txt += `${line}\n_Status: ${dObj.status_tindaklanjut || s.status || 'Didisposisi'} • BAPPERIDA Sumba Barat_`;
    return txt;
  }

  async function copyTextToClipboard(text, successTitle = 'Berhasil Disalin') {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = d.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        d.body.appendChild(ta);
        ta.focus();
        ta.select();
        d.execCommand('copy');
        ta.remove();
      }
      if (w.Swal) {
        w.Swal.fire({
          icon: 'success',
          title: successTitle,
          text: 'Format teks disposisi siap dibagikan ke WhatsApp.',
          timer: 1600,
          showConfirmButton: false,
        });
      }
    } catch {
      if (w.Swal) w.Swal.fire('Gagal', 'Tidak dapat menyalin ke clipboard', 'error');
    }
  }

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

  /* ── PURE-JS MULTI-PAGE JPEG-TO-PDF BUILDER (ZERO DEPENDENCY) ──────────── */
  function buildMultiPagePdfBlob(jpegDataUrls, paper = 'A4') {
    const pageW = paper === 'F4' ? 609.45 : 595.28; // pt (215mm vs 210mm)
    const pageH = paper === 'F4' ? 935.43 : 841.89; // pt (330mm vs 297mm)
    const chunks = [];
    const offsets = [0];
    let byteLen = 0;

    const pushStr = (s) => {
      const b = new TextEncoder().encode(s);
      chunks.push(b);
      byteLen += b.length;
    };
    const pushBytes = (u8) => {
      chunks.push(u8);
      byteLen += u8.length;
    };
    const b64ToBytes = (dataUrl) => {
      const bin = atob(dataUrl.split(',')[1] || '');
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) u8[i] = bin.charCodeAt(i);
      return u8;
    };
    const getJpegDim = (u8) => {
      let i = 2;
      while (i < u8.length - 8) {
        if (u8[i] === 0xFF && (u8[i + 1] === 0xC0 || u8[i + 1] === 0xC2)) {
          return { h: (u8[i + 5] << 8) | u8[i + 6], w: (u8[i + 7] << 8) | u8[i + 8] };
        }
        const segLen = (u8[i + 2] << 8) | u8[i + 3];
        if (!segLen) break;
        i += 2 + segLen;
      }
      return { w: 1200, h: 1600 };
    };

    const pages = jpegDataUrls.map((du) => {
      const bytes = b64ToBytes(du);
      const dim = getJpegDim(bytes);
      return { bytes, w: dim.w, h: dim.h };
    });

    pushStr('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

    // Obj 1: Catalog, Obj 2: Pages
    const startObj = 3;
    const pageObjIds = [];
    pages.forEach((_, idx) => pageObjIds.push(startObj + idx * 3));

    offsets.push(byteLen);
    pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

    offsets.push(byteLen);
    pushStr(`2 0 obj\n<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>\nendobj\n`);

    pages.forEach((pg, idx) => {
      const pageId = startObj + idx * 3;
      const imgId = pageId + 1;
      const contId = pageId + 2;

      const scale = Math.min((pageW - 24) / pg.w, (pageH - 24) / pg.h);
      const drawW = (pg.w * scale).toFixed(2);
      const drawH = (pg.h * scale).toFixed(2);
      const offX = ((pageW - Number(drawW)) / 2).toFixed(2);
      const offY = ((pageH - Number(drawH)) / 2).toFixed(2);

      offsets.push(byteLen);
      pushStr(`${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] /Resources << /XObject << /Im0 ${imgId} 0 R >> >> /Contents ${contId} 0 R >>\nendobj\n`);

      offsets.push(byteLen);
      pushStr(`${imgId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pg.w} /Height ${pg.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.bytes.length} >>\nstream\n`);
      pushBytes(pg.bytes);
      pushStr('\nendstream\nendobj\n');

      const streamStr = `q ${drawW} 0 0 ${drawH} ${offX} ${offY} cm /Im0 Do Q\n`;
      offsets.push(byteLen);
      pushStr(`${contId} 0 obj\n<< /Length ${streamStr.length} >>\nstream\n${streamStr}endstream\nendobj\n`);
    });

    const xrefOffset = byteLen;
    pushStr(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
    for (let i = 1; i < offsets.length; i += 1) {
      pushStr(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
    }
    pushStr(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
    return new Blob(chunks, { type: 'application/pdf' });
  }

  async function openSuratCameraScan(btnEl) {
    const modal = btnEl?.closest('#modalArsipAgendaSurat, #drawerMobileAgendaSurat');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (w.Swal) w.Swal.fire('Kamera Tidak Tersedia', 'Browser/perangkat tidak mendukung akses kamera langsung. Gunakan tombol Upload Dokumen.', 'warning');
      return;
    }

    closeStitchOverlay('stitchDocScannerOverlay');
    let stream = null;
    let facing = 'environment';
    let filterMode = 'enhance'; // 'original' | 'enhance' | 'bw'
    let paperSize = 'A4';
    const pages = []; // [{ dataUrl }]
    let activeIdx = -1; // -1 = live camera, >=0 = preview captured page

    const stopCam = () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
      }
    };

    const wrap = d.createElement('div');
    wrap.id = 'stitchDocScannerOverlay';
    wrap.className = 'fixed inset-0 z-[99] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4';
    wrap.innerHTML = `
      <div class="w-full max-w-3xl max-h-[94vh] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
        <div class="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
          <div class="flex items-center gap-2.5">
            <span class="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-[#2563eb] flex items-center justify-center">
              <span class="material-symbols-outlined text-[20px]">document_scanner</span>
            </span>
            <div>
              <h3 class="text-sm font-bold text-slate-900 dark:text-white">Pemindai Dokumen Multi-Halaman</h3>
              <p id="scanSubInfo" class="text-[11px] text-slate-500 dark:text-slate-400">0 halaman dipindai • Ekspor otomatis ke PDF</p>
            </div>
          </div>
          <div class="flex items-center gap-1.5 flex-wrap">
            <div class="inline-flex p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-bold">
              <button type="button" data-scan-paper="A4" class="px-2 py-1 rounded-md bg-slate-900 text-white cursor-pointer">A4</button>
              <button type="button" data-scan-paper="F4" class="px-2 py-1 rounded-md text-slate-500 cursor-pointer">F4</button>
            </div>
            <div class="inline-flex p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-bold">
              <button type="button" data-scan-filter="original" class="px-2 py-1 rounded-md text-slate-500 cursor-pointer">Asli</button>
              <button type="button" data-scan-filter="enhance" class="px-2 py-1 rounded-md bg-[#2563eb] text-white cursor-pointer">Tajam</button>
              <button type="button" data-scan-filter="bw" class="px-2 py-1 rounded-md text-slate-500 cursor-pointer">B&amp;W</button>
            </div>
            <button type="button" data-close-scan class="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center cursor-pointer">
              <span class="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>

        <div class="flex-1 bg-slate-950 relative min-h-[300px] sm:min-h-[380px] flex items-center justify-center overflow-hidden">
          <video id="stScanVideo" autoplay playsinline class="w-full h-full max-h-[52vh] object-contain"></video>
          <img id="stScanPreviewImg" class="hidden w-full h-full max-h-[52vh] object-contain" alt="Halaman hasil scan">
          <canvas id="stScanCanvas" class="hidden"></canvas>
          <div id="stScanFlash" class="pointer-events-none absolute inset-0 bg-white opacity-0 transition-opacity duration-150"></div>
          <div id="stScanGuide" class="pointer-events-none absolute inset-6 sm:inset-10 border-2 border-dashed border-white/50 rounded-2xl"></div>
        </div>

        <!-- Strip Thumbnail Halaman -->
        <div id="stScanStrip" class="hidden px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex items-center gap-2 overflow-x-auto"></div>

        <div class="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
          <div class="flex items-center gap-1.5 flex-wrap">
            <button type="button" id="stScanFlipBtn" class="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1 cursor-pointer">
              <span class="material-symbols-outlined text-[16px]">flip_camera_ios</span>
              <span>Kamera</span>
            </button>
            <button type="button" id="stScanBackCamBtn" class="hidden px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1 cursor-pointer">
              <span class="material-symbols-outlined text-[16px]">add_a_photo</span>
              <span>Tambah Halaman</span>
            </button>
            <button type="button" id="stScanRotateBtn" class="hidden px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1 cursor-pointer">
              <span class="material-symbols-outlined text-[16px]">rotate_right</span>
              <span>Putar</span>
            </button>
            <button type="button" id="stScanDelPageBtn" class="hidden px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 text-xs font-bold flex items-center gap-1 cursor-pointer">
              <span class="material-symbols-outlined text-[16px]">delete</span>
              <span>Hapus Hal</span>
            </button>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" id="stScanSnapBtn" class="px-4 py-2 rounded-xl bg-[#2563eb] hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer">
              <span class="material-symbols-outlined text-[17px]">photo_camera</span>
              <span>Ambil Halaman</span>
            </button>
            <button type="button" id="stScanUploadBtn" disabled class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer">
              <span class="material-symbols-outlined text-[17px]">cloud_upload</span>
              <span id="stScanUploadLbl">Unggah PDF</span>
            </button>
          </div>
        </div>
      </div>
    `;
    d.body.appendChild(wrap);

    const video = wrap.querySelector('#stScanVideo');
    const img = wrap.querySelector('#stScanPreviewImg');
    const canvas = wrap.querySelector('#stScanCanvas');
    const guide = wrap.querySelector('#stScanGuide');
    const strip = wrap.querySelector('#stScanStrip');
    const subInfo = wrap.querySelector('#scanSubInfo');
    const snapBtn = wrap.querySelector('#stScanSnapBtn');
    const backCamBtn = wrap.querySelector('#stScanBackCamBtn');
    const rotBtn = wrap.querySelector('#stScanRotateBtn');
    const delBtn = wrap.querySelector('#stScanDelPageBtn');
    const uploadBtn = wrap.querySelector('#stScanUploadBtn');
    const uploadLbl = wrap.querySelector('#stScanUploadLbl');

    const startCam = async () => {
      stopCam();
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1654 }, height: { ideal: 1240 } }, audio: false });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      video.srcObject = stream;
      await video.play().catch(() => {});
    };

    const renderUi = () => {
      const inPreview = activeIdx >= 0 && pages[activeIdx];
      video.classList.toggle('hidden', inPreview);
      guide.classList.toggle('hidden', inPreview);
      img.classList.toggle('hidden', !inPreview);
      snapBtn.classList.toggle('hidden', inPreview);
      backCamBtn.classList.toggle('hidden', !inPreview);
      rotBtn.classList.toggle('hidden', !inPreview);
      delBtn.classList.toggle('hidden', !inPreview);
      if (inPreview) img.src = pages[activeIdx].dataUrl;

      subInfo.textContent = `${pages.length} halaman dipindai • Kertas ${paperSize} • Ekspor PDF`;
      uploadBtn.disabled = pages.length === 0;
      uploadLbl.textContent = pages.length > 1 ? `Unggah PDF (${pages.length} Hal)` : 'Unggah PDF';

      strip.classList.toggle('hidden', pages.length === 0);
      strip.innerHTML = pages.map((p, i) => `
        <div class="relative shrink-0 group">
          <button type="button" data-pg-idx="${i}" class="w-12 h-16 rounded-lg overflow-hidden border-2 ${i === activeIdx ? 'border-[#2563eb]' : 'border-slate-200 dark:border-slate-700'} bg-white cursor-pointer block">
            <img src="${p.dataUrl}" class="w-full h-full object-cover" alt="Hal ${i + 1}">
          </button>
          <span class="absolute bottom-0.5 right-0.5 px-1 rounded bg-slate-900/80 text-white text-[9px] font-mono font-bold">${i + 1}</span>
        </div>
      `).join('');
      strip.querySelectorAll('[data-pg-idx]').forEach((b) => {
        b.addEventListener('click', () => { activeIdx = Number(b.dataset.pgIdx); renderUi(); });
      });
    };

    const applyFilterStr = () => {
      if (filterMode === 'bw') return 'grayscale(1) contrast(1.45) brightness(1.08)';
      if (filterMode === 'enhance') return 'contrast(1.15) brightness(1.04) saturate(1.06)';
      return 'none';
    };

    const closeAll = () => { stopCam(); wrap.remove(); };
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || e.target.closest('[data-close-scan]')) closeAll();
    });

    wrap.querySelectorAll('[data-scan-paper]').forEach((b) => {
      b.addEventListener('click', () => {
        paperSize = b.dataset.scanPaper;
        wrap.querySelectorAll('[data-scan-paper]').forEach((x) => {
          x.className = x.dataset.scanPaper === paperSize ? 'px-2 py-1 rounded-md bg-slate-900 text-white cursor-pointer' : 'px-2 py-1 rounded-md text-slate-500 cursor-pointer';
        });
        renderUi();
      });
    });

    wrap.querySelectorAll('[data-scan-filter]').forEach((b) => {
      b.addEventListener('click', () => {
        filterMode = b.dataset.scanFilter;
        wrap.querySelectorAll('[data-scan-filter]').forEach((x) => {
          x.className = x.dataset.scanFilter === filterMode ? 'px-2 py-1 rounded-md bg-[#2563eb] text-white cursor-pointer' : 'px-2 py-1 rounded-md text-slate-500 cursor-pointer';
        });
        video.style.filter = applyFilterStr();
      });
    });

    wrap.querySelector('#stScanFlipBtn')?.addEventListener('click', async () => {
      facing = facing === 'environment' ? 'user' : 'environment';
      activeIdx = -1;
      renderUi();
      await startCam().catch(() => {});
    });

    snapBtn.addEventListener('click', () => {
      if (!video.videoWidth) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.filter = applyFilterStr();
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.filter = 'none';
      const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
      pages.push({ dataUrl });
      activeIdx = pages.length - 1;
      const fl = wrap.querySelector('#stScanFlash');
      if (fl) { fl.style.opacity = '0.85'; setTimeout(() => { fl.style.opacity = '0'; }, 120); }
      renderUi();
    });

    backCamBtn.addEventListener('click', () => { activeIdx = -1; renderUi(); });

    rotBtn.addEventListener('click', () => {
      if (activeIdx < 0 || !pages[activeIdx]) return;
      const im = new Image();
      im.onload = () => {
        canvas.width = im.height;
        canvas.height = im.width;
        const ctx = canvas.getContext('2d');
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(im, -im.width / 2, -im.height / 2);
        pages[activeIdx].dataUrl = canvas.toDataURL('image/jpeg', 0.88);
        renderUi();
      };
      im.src = pages[activeIdx].dataUrl;
    });

    delBtn.addEventListener('click', () => {
      if (activeIdx < 0) return;
      pages.splice(activeIdx, 1);
      activeIdx = pages.length ? Math.min(activeIdx, pages.length - 1) : -1;
      renderUi();
    });

    uploadBtn.addEventListener('click', async () => {
      if (!pages.length) return;
      uploadBtn.disabled = true;
      uploadLbl.textContent = 'Mengunggah...';
      try {
        const pdfBlob = buildMultiPagePdfBlob(pages.map((p) => p.dataUrl), paperSize);
        const fname = `Scan_Dokumen_${paperSize}_${pages.length}hal_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.pdf`;
        closeAll();
        await uploadSuratAttachment(pdfBlob, fname, 'application/pdf', modal);
      } catch (err) {
        uploadBtn.disabled = false;
        renderUi();
        if (w.Swal) w.Swal.fire('Gagal Mengunggah', err?.message || 'Koneksi terganggu.', 'error');
      }
    });

    try {
      video.style.filter = applyFilterStr();
      await startCam();
    } catch (err) {
      closeAll();
      if (w.Swal) w.Swal.fire('Gagal Akses Kamera', err?.message || 'Izin kamera ditolak.', 'error');
    }
  }

  /* ── CLEAN STITCH MODAL & FLOATING POPOVER (NO DYNAMIC ISLAND HIJACK) ─── */
  function closeStitchOverlay(id) {
    const el = d.getElementById(id);
    if (el) el.remove();
  }

  function closeActionPopover() {
    const pop = d.getElementById('stitchAgendaPopover');
    if (pop) pop.remove();
  }

  d.addEventListener('click', (ev) => {
    const pop = d.getElementById('stitchAgendaPopover');
    if (pop && !pop.contains(ev.target) && !ev.target.closest('[data-sppd-pop-trigger]')) {
      pop.remove();
    }
  });
  d.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      closeActionPopover();
      closeStitchOverlay('stitchAgendaDetailOverlay');
      closeStitchOverlay('stitchAgendaSpjOverlay');
      closeStitchOverlay('stitchSppdPreviewOverlay');
      closeStitchOverlay('stitchDisposisiOverlay');
      closeStitchOverlay('stitchWewenangOverlay');
      closeStitchOverlay('stitchDocScannerOverlay');
    }
  });

  function openSppdPopover(btnEl, idx) {
    const item = _sppdItems[idx];
    if (!item || !btnEl) return;
    const existing = d.getElementById('stitchAgendaPopover');
    if (existing && existing.dataset.idx === String(idx)) {
      existing.remove();
      return;
    }
    closeActionPopover();

    let pengikut = [];
    try { pengikut = Array.isArray(item.pengikut) ? item.pengikut : JSON.parse(item.pengikut || '[]'); } catch (_) {}

    const pop = d.createElement('div');
    pop.id = 'stitchAgendaPopover';
    pop.dataset.idx = String(idx);
    pop.className = 'fixed z-[98] w-60 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-1.5 flex flex-col gap-0.5 text-left';

    const pengikutHtml = pengikut.length
      ? `<div class="px-2.5 pt-1.5 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">SPPD Pengikut (.docx)</div>` +
        pengikut.map((p, pi) => `
          <button type="button" data-pop-act="sppd-pk" data-pk-idx="${pi}" class="w-full px-2.5 py-2 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-950/50 text-slate-700 dark:text-slate-200 hover:text-[#2563eb] text-xs font-medium flex items-center gap-2 cursor-pointer text-left">
            <span class="material-symbols-outlined text-[16px] text-[#2563eb]">person</span>
            <span class="truncate">${esc(p.nama || `Pengikut ${pi + 1}`)}</span>
          </button>`).join('')
      : '';

    pop.innerHTML = `
      <div class="px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800 mb-0.5">
        <div class="text-[11px] font-bold text-slate-900 dark:text-white truncate">${esc(item.pelaksana_nama || '-')}</div>
        <div class="text-[10px] font-mono text-slate-400 truncate">${esc(item.nomor_sppd || item.nomor_spt || '-')}</div>
      </div>
      <button type="button" data-pop-act="preview" class="w-full px-2.5 py-2 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-950/50 text-[#2563eb] dark:text-blue-300 text-xs font-bold flex items-center gap-2 cursor-pointer">
        <span class="material-symbols-outlined text-[17px]">preview</span>
        <span>Pratinjau SPT &amp; SPPD</span>
      </button>
      <button type="button" data-pop-act="detail" class="w-full px-2.5 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-2 cursor-pointer">
        <span class="material-symbols-outlined text-[17px] text-slate-500">visibility</span>
        <span>Detail Agenda SPPD</span>
      </button>
      <button type="button" data-pop-act="edit" class="w-full px-2.5 py-2 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-950/50 text-amber-700 dark:text-amber-300 text-xs font-semibold flex items-center gap-2 cursor-pointer">
        <span class="material-symbols-outlined text-[17px]">edit</span>
        <span>Edit Agenda SPPD</span>
      </button>
      <div class="px-2.5 pt-1.5 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Generate Dokumen Resmi</div>
      <button type="button" data-pop-act="docx-spt" class="w-full px-2.5 py-2 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-950/50 text-slate-700 dark:text-slate-200 hover:text-[#2563eb] text-xs font-semibold flex items-center gap-2 cursor-pointer">
        <span class="material-symbols-outlined text-[17px] text-[#2563eb]">description</span>
        <span>Unduh SPT (.docx)</span>
      </button>
      <button type="button" data-pop-act="docx-sppd" class="w-full px-2.5 py-2 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-950/50 text-slate-700 dark:text-slate-200 hover:text-[#2563eb] text-xs font-semibold flex items-center gap-2 cursor-pointer">
        <span class="material-symbols-outlined text-[17px] text-[#2563eb]">article</span>
        <span>Unduh SPPD (.docx)</span>
      </button>
      <button type="button" data-pop-act="bundle-zip" class="w-full px-2.5 py-2 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2 cursor-pointer">
        <span class="material-symbols-outlined text-[17px]">folder_zip</span>
        <span>Unduh Paket ZIP (Semua)</span>
      </button>
      ${pengikutHtml}
      <button type="button" data-pop-act="print-spt" class="w-full px-2.5 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center gap-2 cursor-pointer">
        <span class="material-symbols-outlined text-[17px] text-slate-500">print</span>
        <span>Cetak / PDF SPT</span>
      </button>
      <button type="button" data-pop-act="print-sppd" class="w-full px-2.5 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center gap-2 cursor-pointer">
        <span class="material-symbols-outlined text-[17px] text-slate-500">print</span>
        <span>Cetak / PDF SPPD</span>
      </button>
      <div class="h-px bg-slate-100 dark:bg-slate-800 my-1"></div>
      <button type="button" data-pop-act="spj" class="w-full px-2.5 py-2 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-2 cursor-pointer">
        <span class="material-symbols-outlined text-[17px]">folder_check</span>
        <span>Kelola LPJ / LHP &amp; SPJ</span>
      </button>
      <div class="h-px bg-slate-100 dark:bg-slate-800 my-1"></div>
      <button type="button" data-pop-act="delete" class="w-full px-2.5 py-2 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/50 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-2 cursor-pointer">
        <span class="material-symbols-outlined text-[17px]">delete</span>
        <span>Hapus Agenda SPPD</span>
      </button>
    `;

    d.body.appendChild(pop);

    // Position cleanly near trigger button without overflowing viewport
    const rect = btnEl.getBoundingClientRect();
    const popRect = pop.getBoundingClientRect();
    let left = rect.right - popRect.width;
    if (left < 12) left = 12;
    let top = rect.bottom + 6;
    if (top + popRect.height > w.innerHeight - 12) {
      top = Math.max(12, rect.top - popRect.height - 6);
    }
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;

    pop.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-pop-act]');
      if (!btn) return;
      const act = btn.dataset.popAct;
      closeActionPopover();
      if (act === 'preview') w.SppdGenerator?.openPreviewModal(item, 'spt');
      else if (act === 'detail') showSppdDetail(idx);
      else if (act === 'edit') openEditSppdModal(idx);
      else if (act === 'docx-spt') w.SppdGenerator?.unduhWordSPT(item);
      else if (act === 'docx-sppd') w.SppdGenerator?.unduhWordSPPD(item);
      else if (act === 'bundle-zip') w.SppdGenerator?.downloadSppdBundleZip(item);
      else if (act === 'sppd-pk') {
        const p = pengikut[Number(btn.dataset.pkIdx)];
        if (p) w.SppdGenerator?.unduhWordSPPD(item, p);
      }
      else if (act === 'print-spt') w.SppdGenerator?.cetakSPT(item);
      else if (act === 'print-sppd') w.SppdGenerator?.cetakSPPD(item);
      else if (act === 'spj') openSppdSpjModal(item.id);
      else if (act === 'delete') deleteSppd(item.id);
    });
  }

  function openSuratPopover(btnEl, idx) {
    const item = _suratItems[idx];
    if (!item || !btnEl) return;
    const existing = d.getElementById('stitchAgendaPopover');
    if (existing && existing.dataset.suratIdx === String(idx)) {
      existing.remove();
      return;
    }
    closeActionPopover();

    const isMasuk = _suratMode === 'masuk';
    const fileUrl = item.file_url || item.file_final_url || item.drive_url || '';
    const pop = d.createElement('div');
    pop.id = 'stitchAgendaPopover';
    pop.dataset.suratIdx = String(idx);
    pop.className = 'fixed z-[98] w-56 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-1.5 flex flex-col gap-0.5 text-left';
    pop.innerHTML = `
      <div class="px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800 mb-0.5">
        <div class="text-[11px] font-bold text-slate-900 dark:text-white truncate">${esc(isMasuk ? (item.asal_surat || '-') : (item.tujuan_surat || '-'))}</div>
        <div class="text-[10px] font-mono text-slate-400 truncate">${esc(isMasuk ? (item.nomor_agenda || '-') : (item.nomor_surat || '-'))}</div>
      </div>
      <button type="button" data-sp-act="detail" class="w-full px-2.5 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-2 cursor-pointer">
        <span class="material-symbols-outlined text-[17px] text-slate-500">visibility</span>
        <span>Detail &amp; Pratinjau Berkas</span>
      </button>
      ${isMasuk ? `
      <button type="button" data-sp-act="disposisi" class="w-full px-2.5 py-2 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-950/50 text-[#2563eb] dark:text-blue-300 text-xs font-bold flex items-center gap-2 cursor-pointer">
        <span class="material-symbols-outlined text-[17px]">assignment_turned_in</span>
        <span>Disposisi Berjenjang</span>
      </button>
      <button type="button" data-sp-act="cetak-disp" class="w-full px-2.5 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-2 cursor-pointer">
        <span class="material-symbols-outlined text-[17px] text-slate-500">print</span>
        <span>Cetak Lembar Disposisi</span>
      </button>` : ''}
      ${fileUrl ? `
      <a href="${esc(fileUrl)}" target="_blank" rel="noopener noreferrer" class="w-full px-2.5 py-2 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2">
        <span class="material-symbols-outlined text-[17px]">open_in_new</span>
        <span>Buka Lampiran Drive</span>
      </a>` : ''}
      <button type="button" data-sp-act="edit" class="w-full px-2.5 py-2 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-950/50 text-amber-700 dark:text-amber-300 text-xs font-semibold flex items-center gap-2 cursor-pointer">
        <span class="material-symbols-outlined text-[17px]">edit</span>
        <span>Edit Agenda Surat</span>
      </button>
      <div class="h-px bg-slate-100 dark:bg-slate-800 my-1"></div>
      <button type="button" data-sp-act="delete" class="w-full px-2.5 py-2 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/50 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-2 cursor-pointer">
        <span class="material-symbols-outlined text-[17px]">delete</span>
        <span>Hapus Surat</span>
      </button>
    `;
    d.body.appendChild(pop);

    const rect = btnEl.getBoundingClientRect();
    const popRect = pop.getBoundingClientRect();
    let left = rect.right - popRect.width;
    if (left < 12) left = 12;
    let top = rect.bottom + 6;
    if (top + popRect.height > w.innerHeight - 12) top = Math.max(12, rect.top - popRect.height - 6);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;

    pop.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-sp-act]');
      if (!btn) return;
      const act = btn.dataset.spAct;
      closeActionPopover();
      if (act === 'detail') showSuratDetail(idx);
      else if (act === 'disposisi') openDisposisiModal(item.id, item);
      else if (act === 'cetak-disp') cetakLembarDisposisi(item);
      else if (act === 'edit') openEditSuratModal(idx);
      else if (act === 'delete') deleteSurat(item.id);
    });
  }

  function showSppdGenerateMenu(item) {
    if (!item || !w.SppdGenerator) return;
    w.SppdGenerator.openPreviewModal(item, 'spt');
  }

  function onPelaksanaPicked(inputEl) {
    const rawVal = (inputEl?.value || '').trim();
    if (!rawVal) return;
    const val = rawVal.toLowerCase();
    const pg = _pegawaiList.find((x) => {
      const nm = (x.nama || x.username || '').trim().toLowerCase();
      const np = String(x.nip || '').trim().toLowerCase();
      return nm === val || np === val || val.startsWith(nm) || (np && val.includes(np));
    });
    if (!pg) return;
    if (rawVal.includes('(') && (pg.nama || pg.username)) inputEl.value = pg.nama || pg.username;
    const container = inputEl.closest('[data-sppd-pengikut-row]') || inputEl.closest('#modalArsipAgendaSppd, #drawerMobileAgendaSppd');
    if (!container) return;
    const isPengikut = container.hasAttribute('data-sppd-pengikut-row');
    if (isPengikut) {
      const nip = container.querySelector('[data-pk="nip"]');
      const pkt = container.querySelector('[data-pk="pangkat"]');
      const jab = container.querySelector('[data-pk="jabatan"]');
      if (nip) nip.value = pg.nip || '';
      if (pkt) pkt.value = pg.pangkat || pg.golongan || '';
      if (jab) jab.value = pg.jabatan || '';
    } else {
      const nip = container.querySelector('[data-sppd-field="pelaksana_nip"]');
      const pkt = container.querySelector('[data-sppd-field="pelaksana_pangkat"]');
      const jab = container.querySelector('[data-sppd-field="pelaksana_jabatan"]');
      if (nip) nip.value = pg.nip || '';
      if (pkt) pkt.value = pg.pangkat || pg.golongan || '';
      if (jab) jab.value = pg.jabatan || '';
    }

    // Auto-match Pejabat Pengesah Romawi I & Paraf 2 dari bidang pegawai yang dipilih
    if (pg.bidang) {
      const bidangClean = pg.bidang.trim().toLowerCase();
      const kabid = _pegawaiList.find((x) => {
        const xJab = (x.jabatan || '').toLowerCase();
        const xBid = (x.bidang || '').toLowerCase();
        return (xJab.includes('kepala bidang') || xJab.includes('kabid') || xJab.includes('sekretaris')) &&
               (xBid === bidangClean || xJab.includes(bidangClean));
      });
      if (kabid) {
        if (isPengikut) {
          const pptkNm = container.querySelector('[data-pk="pptk_nama"]');
          const pptkJb = container.querySelector('[data-pk="pptk_jabatan"]');
          const pptkNp = container.querySelector('[data-pk="pptk_nip"]');
          const pf2 = container.querySelector('[data-pk="paraf2"]');
          if (pptkNm && !pptkNm.value.trim()) pptkNm.value = kabid.nama || kabid.username || '';
          if (pptkJb && !pptkJb.value.trim()) pptkJb.value = kabid.jabatan || '';
          if (pptkNp && !pptkNp.value.trim()) pptkNp.value = kabid.nip || '';
          if (pf2 && !pf2.value.trim()) pf2.value = kabid.jabatan || '';
        } else {
          const pptkNm = container.querySelector('[data-sppd-field="pelaksana_pptk_nama"]');
          const pptkJb = container.querySelector('[data-sppd-field="pelaksana_pptk_jabatan"]');
          const pptkNp = container.querySelector('[data-sppd-field="pelaksana_pptk_nip"]');
          const pf2 = container.querySelector('[data-sppd-field="pelaksana_paraf2"]');
          if (pptkNm && !pptkNm.value.trim()) pptkNm.value = kabid.nama || kabid.username || '';
          if (pptkJb && !pptkJb.value.trim()) pptkJb.value = kabid.jabatan || '';
          if (pptkNp && !pptkNp.value.trim()) pptkNp.value = kabid.nip || '';
          if (pf2 && !pf2.value.trim()) pf2.value = kabid.jabatan || '';
        }
      }
    }
  }

  function onPengesahPicked(inputEl) {
    const rawVal = (inputEl?.value || '').trim();
    if (!rawVal) return;
    const val = rawVal.toLowerCase();
    const pg = _pegawaiList.find((x) => {
      const nm = (x.nama || x.username || '').trim().toLowerCase();
      const np = String(x.nip || '').trim().toLowerCase();
      return nm === val || np === val || val.startsWith(nm) || (np && val.includes(np));
    });
    if (!pg) return;
    if (rawVal.includes('(') && (pg.nama || pg.username)) inputEl.value = pg.nama || pg.username;
    const container = inputEl.closest('[data-sppd-pengikut-row]') || inputEl.closest('#modalArsipAgendaSppd, #drawerMobileAgendaSppd');
    if (!container) return;
    if (container.hasAttribute('data-sppd-pengikut-row')) {
      const nip = container.querySelector('[data-pk="pptk_nip"]');
      const jab = container.querySelector('[data-pk="pptk_jabatan"]');
      const pf2 = container.querySelector('[data-pk="paraf2"]');
      if (nip) nip.value = pg.nip || '';
      if (jab && pg.jabatan) {
        jab.value = pg.jabatan;
        if (pf2 && !pf2.value.trim()) pf2.value = pg.jabatan;
      }
    } else {
      const nip = container.querySelector('[data-sppd-field="pelaksana_pptk_nip"]');
      const jab = container.querySelector('[data-sppd-field="pelaksana_pptk_jabatan"]');
      const pf2 = container.querySelector('[data-sppd-field="pelaksana_paraf2"]');
      if (nip) nip.value = pg.nip || '';
      if (jab && pg.jabatan) {
        jab.value = pg.jabatan;
        if (pf2 && !pf2.value.trim()) pf2.value = pg.jabatan;
      }
    }
  }

  function renumberPengikutRows(wrap) {
    if (!wrap) return;
    wrap.querySelectorAll('[data-sppd-pengikut-row]').forEach((row, i) => {
      const lbl = row.querySelector('[data-pk-pengesah-label]');
      if (lbl) lbl.textContent = `Pejabat Pengesah Berangkat (Romawi I - Personil ${i + 2}):`;
      const plbl = row.querySelector('[data-pk-paraf-label] span');
      if (plbl) plbl.textContent = `Paraf Hirarki (Personil ${i + 2}):`;
    });
  }

  function addPengikutRow(btnEl) {
    const modal = btnEl?.closest('#modalArsipAgendaSppd, #drawerMobileAgendaSppd');
    const wrap = modal?.querySelector('[data-sppd-pengikut-list]');
    if (!wrap) return;
    const personNum = wrap.querySelectorAll('[data-sppd-pengikut-row]').length + 2;
    const row = d.createElement('div');
    row.setAttribute('data-sppd-pengikut-row', '1');
    row.className = 'p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-2 gap-2 relative';
    row.innerHTML = `
      <input data-pk="nama" list="agendaPegawaiDatalist" onchange="window.ArsipAgenda?.onPelaksanaPicked(this)" type="text" placeholder="Nama Pengikut / Anggota Tim..." class="h-9 px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white outline-none focus:border-[#2563eb]">
      <input data-pk="nip" type="text" placeholder="NIP" class="h-9 px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white outline-none focus:border-[#2563eb]">
      <input data-pk="pangkat" type="text" placeholder="Pangkat / Golongan" class="h-9 px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white outline-none focus:border-[#2563eb]">
      <div class="flex gap-1.5">
        <input data-pk="jabatan" type="text" placeholder="Jabatan" class="flex-1 h-9 px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white outline-none focus:border-[#2563eb]">
        <button type="button" onclick="const w=this.closest('[data-sppd-pengikut-list]');this.closest('[data-sppd-pengikut-row]').remove();window.ArsipAgenda?.renumberPengikutRows?.(w);" class="px-2.5 h-9 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300 text-xs font-bold cursor-pointer" title="Hapus Pengikut">Hapus</button>
      </div>
      <div class="sm:col-span-2 pt-2 mt-0.5 border-t border-dashed border-slate-200 dark:border-slate-700">
        <div data-pk-pengesah-label class="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5">Pejabat Pengesah Berangkat (Romawi I - Personil ${personNum}):</div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input data-pk="pptk_nama" list="agendaPegawaiDatalist" oninput="window.ArsipAgenda?.onPengesahPicked(this)" onchange="window.ArsipAgenda?.onPengesahPicked(this)" type="text" placeholder="Nama Pejabat Pengesah (Cari / Ketik)" class="h-8 px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-900 dark:text-white outline-none focus:border-[#2563eb]">
          <input data-pk="pptk_jabatan" type="text" placeholder="Jabatan Pengesah (Romawi I)" class="h-8 px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-900 dark:text-white outline-none focus:border-[#2563eb]">
          <input data-pk="pptk_nip" type="text" placeholder="NIP Pejabat Pengesah" class="h-8 px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-mono text-slate-900 dark:text-white outline-none focus:border-[#2563eb]">
        </div>
      </div>
      <div class="sm:col-span-2 pt-2 mt-0.5 border-t border-dashed border-slate-200 dark:border-slate-700">
        <div data-pk-paraf-label class="flex items-center justify-between mb-1.5">
          <span class="text-[11px] font-bold text-slate-700 dark:text-slate-300">Paraf Hirarki (Personil ${personNum}):</span>
          <span class="text-[10px] text-slate-400">Otomatis jika kosong</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input data-pk="paraf1" type="text" placeholder="Paraf 1 (Sekretaris)" class="h-8 px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-900 dark:text-white outline-none focus:border-[#2563eb]">
          <input data-pk="paraf2" type="text" placeholder="Paraf 2 (Kabid/PPTK)" class="h-8 px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-900 dark:text-white outline-none focus:border-[#2563eb]">
          <input data-pk="paraf3" type="text" placeholder="Paraf 3 (Kasubbag)" class="h-8 px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-900 dark:text-white outline-none focus:border-[#2563eb]">
        </div>
      </div>
      <details class="sm:col-span-2 text-[11px] text-slate-500">
        <summary class="cursor-pointer font-semibold text-[#2563eb] hover:underline select-none">Pengaturan Tambahan (Nomor SPPD &amp; Tingkat Biaya)</summary>
        <div class="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input data-pk="nomor_sppd" type="text" placeholder="Nomor SPPD khusus (opsional)" class="h-8 px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-mono text-slate-900 dark:text-white">
          <input data-pk="tingkat_biaya" type="text" placeholder="Tingkat Biaya (mis. Tingkat C)" class="h-8 px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-900 dark:text-white">
        </div>
      </details>
    `;
    wrap.appendChild(row);
  }

  function collectPengikut(modal) {
    if (!modal) return [];
    const list = [];
    modal.querySelectorAll('[data-sppd-pengikut-row]').forEach((row) => {
      const nama = (row.querySelector('[data-pk="nama"]')?.value || '').trim();
      if (!nama) return;
      const g = (k) => (row.querySelector(`[data-pk="${k}"]`)?.value || '').trim();
      const pParaf = [g('paraf1'), g('paraf2'), g('paraf3')].filter(Boolean);
      list.push({
        nama,
        nip: g('nip'),
        pangkat: g('pangkat'),
        jabatan: g('jabatan'),
        nomor_sppd: g('nomor_sppd') || undefined,
        tingkat_biaya: g('tingkat_biaya') || undefined,
        pptk_nama: g('pptk_nama') || undefined,
        pptk_jabatan: g('pptk_jabatan') || undefined,
        pptk_nip: g('pptk_nip') || undefined,
        paraf: pParaf.length ? pParaf : undefined,
      });
    });
    return list;
  }

  let _cekSuratTimer = null;
  let _cekSuratSeq = 0;
  function checkNomorSuratKeluar(inputEl) {
    if (_suratMode !== 'keluar' || !inputEl) return;
    const modal = inputEl.closest('#modalArsipAgendaSurat, #drawerMobileAgendaSurat');
    const stEl = modal?.querySelector('[data-surat-nomor-status]');
    const nomor = (inputEl.value || '').trim();
    if (!stEl) return;
    const seq = ++_cekSuratSeq;
    clearTimeout(_cekSuratTimer);
    if (!nomor) { stEl.classList.add('hidden'); return; }
    _cekSuratTimer = setTimeout(async () => {
      try {
        const exId = modal?.dataset.editId || '';
        const r = await fetch(`/api/arsip/p/api/agenda/surat-keluar/cek-nomor?nomor=${encodeURIComponent(nomor)}&excludeId=${encodeURIComponent(exId)}`);
        const j = await r.json().catch(() => ({}));
        if (seq !== _cekSuratSeq) return;
        stEl.classList.remove('hidden');
        if (j.tersedia === false) {
          stEl.className = 'text-[10px] font-bold mt-1 text-rose-600';
          stEl.textContent = `Nomor sudah dipakai${j.bentrok?.perihal ? ': ' + j.bentrok.perihal : ''}`;
        } else {
          stEl.className = 'text-[10px] font-bold mt-1 text-emerald-600';
          stEl.textContent = 'Nomor surat tersedia';
        }
      } catch { if (seq === _cekSuratSeq) stEl.classList.add('hidden'); }
    }, 350);
  }

  let _cekSppdTimer = null;
  let _cekSppdSeq = 0;
  function checkNomorSppd(inputEl) {
    if (!inputEl) return;
    const modal = inputEl.closest('#modalArsipAgendaSppd, #drawerMobileAgendaSppd');
    const stEl = modal?.querySelector('[data-sppd-nomor-status]');
    const nomor = (inputEl.value || '').trim();
    if (!stEl) return;
    const seq = ++_cekSppdSeq;
    clearTimeout(_cekSppdTimer);
    if (!nomor) { stEl.classList.add('hidden'); return; }
    _cekSppdTimer = setTimeout(async () => {
      try {
        const exId = modal?.dataset.editId || '';
        const r = await fetch(`/api/arsip/p/api/agenda/sppd/cek-nomor?nomor=${encodeURIComponent(nomor)}&excludeId=${encodeURIComponent(exId)}`);
        const j = await r.json().catch(() => ({}));
        if (seq !== _cekSppdSeq) return;
        stEl.classList.remove('hidden');
        if (j.tersedia === false) {
          stEl.className = 'text-[10px] font-bold mt-1 text-rose-600';
          stEl.textContent = `Nomor SPPD bentrok${j.bentrok?.pelaksana_nama ? ' (' + j.bentrok.pelaksana_nama + ')' : ''}`;
        } else {
          stEl.className = 'text-[10px] font-bold mt-1 text-emerald-600';
          stEl.textContent = 'Nomor SPPD tersedia';
        }
      } catch { if (seq === _cekSppdSeq) stEl.classList.add('hidden'); }
    }, 350);
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

  let _pegawaiPromise = null;
  async function ensurePegawaiLoaded() {
    if (_pegawaiList.length) return _pegawaiList;
    if (_pegawaiPromise) return _pegawaiPromise;
    _pegawaiPromise = (async () => {
      try {
        const r = await fetch('/api/arsip/p/api/agenda/pegawai-list');
        const j = await r.json().catch(() => ({}));
        _pegawaiList = Array.isArray(j.items) ? j.items : (Array.isArray(j) ? j : []);
      } catch { /* ignore */ }
      d.querySelectorAll('datalist#agendaPegawaiDatalist').forEach((dl) => {
        dl.innerHTML = _pegawaiList.map((p) => `<option value="${esc(p.nama || p.username || '')}">${esc(p.nip ? `${p.nama || p.username} (${p.nip})` : (p.nama || ''))}</option>`).join('');
      });
      _pegawaiPromise = null;
      return _pegawaiList;
    })();
    return _pegawaiPromise;
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

  function renderSkeletonRows(cols = 6, rows = 4) {
    return Array.from({ length: rows }).map(() => `
      <tr class="border-b border-slate-100 dark:border-slate-800/70 animate-pulse">
        ${Array.from({ length: cols }).map((_, ci) => `<td class="px-4 py-3.5"><div class="h-3.5 rounded-lg bg-slate-200/80 dark:bg-slate-800 ${ci === 0 ? 'w-24' : ci === cols - 1 ? 'w-16 ml-auto' : 'w-32'}"></div></td>`).join('')}
      </tr>
    `).join('');
  }

  function buildDrivePreviewSrc(url) {
    if (!url) return '';
    const m = String(url).match(/\/d\/([a-zA-Z0-9_-]+)/) || String(url).match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
    return url;
  }

  async function cetakLembarDisposisi(surat, historyOverride = null) {
    if (!surat) return;
    let history = historyOverride;
    if (!history) {
      try {
        const r = await fetch(`/api/arsip/p/api/agenda/surat-masuk/${surat.id}/disposisi`);
        const j = await r.json().catch(() => ({}));
        history = Array.isArray(j.items) ? j.items : (Array.isArray(j) ? j : []);
      } catch { history = []; }
    }
    const allTujuan = new Set();
    const allArahan = new Set();
    history.forEach((h) => {
      const tj = Array.isArray(h.diteruskan_kepada) ? h.diteruskan_kepada : (h.diteruskan_kepada ? [h.diteruskan_kepada] : []);
      const ar = Array.isArray(h.arahan) ? h.arahan : (h.arahan ? [h.arahan] : []);
      tj.forEach((x) => allTujuan.add(String(x)));
      ar.forEach((x) => allArahan.add(String(x)));
    });
    const customTujuan = Array.from(allTujuan).filter((x) => !DITERUSKAN_OPTIONS.includes(x));
    const customArahan = Array.from(allArahan).filter((x) => !ARAHAN_OPTIONS.includes(x));
    const logoUrl = new URL('images/Lambang_Kabupaten_Sumba_Barat.png', w.location.href).href;
    const win = w.open('', '_blank', 'width=860,height=980');
    if (!win) {
      if (w.Swal) w.Swal.fire('Pop-up Diblokir', 'Izinkan pop-up untuk mencetak Lembar Disposisi.', 'warning');
      return;
    }
    const html = `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><title>Lembar Disposisi - ${esc(surat.nomor_agenda || '')}</title>
      <style>
        @page { size: A4; margin: 12mm 14mm; }
        body { font-family: 'Times New Roman', serif; font-size: 10.5pt; color: #000; margin: 0; padding: 14px; line-height: 1.35; }
        .kop { display: flex; align-items: center; gap: 14px; border-bottom: 3px double #000; padding-bottom: 8px; margin-bottom: 10px; }
        .kop img { width: 62px; height: auto; }
        .kop-t { flex: 1; text-align: center; }
        .kop-t .a { font-size: 13pt; font-weight: bold; }
        .kop-t .b { font-size: 13.5pt; font-weight: bold; }
        .kop-t .c { font-size: 9pt; font-style: italic; }
        h2 { text-align: center; margin: 8px 0 10px; font-size: 13pt; letter-spacing: 2px; text-decoration: underline; }
        table.box { width: 100%; border-collapse: collapse; }
        table.box td, table.box th { border: 1px solid #000; padding: 5px 8px; vertical-align: top; }
        .chk { display: inline-block; width: 13px; height: 13px; border: 1px solid #000; text-align: center; line-height: 12px; font-size: 10px; margin-right: 6px; font-weight: bold; }
        .row-chk { margin: 3px 0; }
        .print-btn { position: fixed; top: 10px; right: 12px; padding: 8px 14px; background: #2563eb; color: #fff; border: 0; border-radius: 8px; font-weight: 700; cursor: pointer; font-family: sans-serif; font-size: 12px; }
        @media print { .print-btn { display: none; } body { padding: 0; } }
      </style>
    </head><body>
      <button class="print-btn" onclick="window.print()">Cetak Lembar Disposisi</button>
      <div class="kop">
        <img src="${esc(logoUrl)}" alt="Logo">
        <div class="kop-t">
          <div class="a">PEMERINTAH KABUPATEN SUMBA BARAT</div>
          <div class="b">BADAN PERENCANAAN PEMBANGUNAN, RISET DAN INOVASI DAERAH</div>
          <div class="c">Jl. Wee Karou Nomor – Waikabubak, Provinsi Nusa Tenggara Timur</div>
        </div>
      </div>
      <h2>LEMBAR DISPOSISI</h2>
      <table class="box">
        <tr>
          <td style="width:50%;"><strong>Surat Dari :</strong><br>${esc(surat.asal_surat || '-')}</td>
          <td style="width:50%;"><strong>Diterima Tanggal :</strong> ${esc(fmtDate(surat.tanggal_terima || surat.tanggal_surat))}<br><strong>No. Agenda :</strong> <b>${esc(surat.nomor_agenda || '-')}</b><br><strong>Sifat :</strong> ${esc(surat.sifat || 'Biasa')}</td>
        </tr>
        <tr>
          <td><strong>Nomor Surat :</strong> ${esc(surat.nomor_surat_asli || '-')}</td>
          <td><strong>Tanggal Surat :</strong> ${esc(fmtDate(surat.tanggal_surat))}</td>
        </tr>
        <tr>
          <td colspan="2"><strong>Perihal :</strong><br>${esc(surat.perihal || '-')}</td>
        </tr>
        <tr>
          <td style="width:50%;">
            <div style="font-weight:bold;margin-bottom:6px;text-decoration:underline;">DITERUSKAN KEPADA SDR :</div>
            ${DITERUSKAN_OPTIONS.map((opt) => `<div class="row-chk"><span class="chk">${allTujuan.has(opt) ? '&#10003;' : '&nbsp;'}</span>${esc(opt)}</div>`).join('')}
            ${customTujuan.map((opt) => `<div class="row-chk"><span class="chk">&#10003;</span>${esc(opt)}</div>`).join('')}
          </td>
          <td style="width:50%;">
            <div style="font-weight:bold;margin-bottom:6px;text-decoration:underline;">DISPOSISI / PETUNJUK :</div>
            ${ARAHAN_OPTIONS.map((opt) => `<div class="row-chk"><span class="chk">${allArahan.has(opt) ? '&#10003;' : '&nbsp;'}</span>${esc(opt)}</div>`).join('')}
            ${customArahan.map((opt) => `<div class="row-chk"><span class="chk">&#10003;</span>${esc(opt)}</div>`).join('')}
          </td>
        </tr>
        <tr>
          <td colspan="2" style="min-height:90px;">
            <div style="font-weight:bold;margin-bottom:6px;">CATATAN / INSTRUKSI PIMPINAN :</div>
            ${history.length
              ? history.map((h, i) => `<div style="margin-bottom:6px;padding-bottom:4px;border-bottom:1px dashed #ccc;"><strong>Tingkat ${i + 1} (${esc(h.pemberi_disposisi || 'Pimpinan')} - ${esc(fmtDate(h.tanggal_disposisi))}):</strong> ${esc(h.catatan_instruksi || (Array.isArray(h.arahan) ? h.arahan.join('; ') : '-'))}${h.batas_waktu ? ` <em>[Batas Waktu: ${esc(fmtDate(h.batas_waktu))}]</em>` : ''}</div>`).join('')
              : '<div style="height:60px;"></div>'}
          </td>
        </tr>
      </table>
      <div style="margin-top:20px;width:44%;margin-left:auto;text-align:center;">
        <div>Waikabubak, ${esc(fmtDate(new Date().toISOString().slice(0, 10)))}</div>
        <div style="font-weight:bold;margin-top:4px;">KEPALA BAPPERIDA,</div>
        <div style="height:56px;"></div>
        <div style="font-weight:bold;text-decoration:underline;">( .............................................. )</div>
      </div>
    </body></html>`;
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  let _suratReqId = 0;
  let _suratAbortCtrl = null;

  async function loadAgendaSurat() {
    const tbody = d.getElementById('agendaSuratBody');
    const countEl = d.getElementById('agendaSuratCount');
    if (!tbody) return;

    const reqId = ++_suratReqId;
    if (_suratAbortCtrl) {
      try { _suratAbortCtrl.abort(); } catch { /* ignore */ }
    }
    _suratAbortCtrl = typeof AbortController === 'function' ? new AbortController() : null;
    const signal = _suratAbortCtrl?.signal;

    tbody.innerHTML = renderSkeletonRows(6, 5);

    const tahun = d.getElementById('agendaSuratYear')?.value || String(new Date().getFullYear());
    const q = (d.getElementById('agendaSuratSearch')?.value || '').trim();
    const sifatFilter = (d.getElementById('agendaSuratSifat')?.value || '').trim();
    const statusFilter = (d.getElementById('agendaSuratStatus')?.value || '').trim();
    const params = new URLSearchParams({ tahun, limit: '80' });
    if (q) params.set('q', q);

    const modeAtReq = _suratMode;
    const ep = modeAtReq === 'masuk'
      ? `/api/arsip/p/api/agenda/surat-masuk?${params.toString()}`
      : `/api/arsip/p/api/agenda/surat-keluar?${params.toString()}`;

    try {
      const res = await fetch(ep, { signal });
      const json = await res.json().catch(() => ({}));
      if (reqId !== _suratReqId || modeAtReq !== _suratMode) return;
      if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
      let items = Array.isArray(json.items) ? json.items : (Array.isArray(json) ? json : []);
      if (sifatFilter) items = items.filter((it) => String(it.sifat || 'Biasa').toLowerCase() === sifatFilter.toLowerCase());
      if (statusFilter) items = items.filter((it) => String(it.status_tindaklanjut || it.status || '').toLowerCase() === statusFilter.toLowerCase());
      _suratItems = items;
      if (countEl) {
        const dispCnt = _suratMode === 'masuk' ? _suratItems.filter((it) => String(it.status || '').toLowerCase().includes('dispos')).length : 0;
        countEl.textContent = _suratMode === 'masuk' && dispCnt ? `${_suratItems.length} surat • ${dispCnt} didisposisi` : `${_suratItems.length} surat`;
      }

      if (!_suratItems.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-xs text-slate-400">Belum ada data ${_suratMode === 'masuk' ? 'Surat Masuk' : 'Surat Keluar'} untuk filter ini.</td></tr>`;
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
        const hasFile = Boolean(item.file_url || item.file_final_url || item.drive_url);

        const diteruskanRaw = item.diteruskan_kepada;
        const diteruskanList = Array.isArray(diteruskanRaw)
          ? diteruskanRaw
          : (typeof diteruskanRaw === 'string' && diteruskanRaw.startsWith('[')
            ? (() => { try { return JSON.parse(diteruskanRaw); } catch { return [diteruskanRaw]; } })()
            : (diteruskanRaw ? [diteruskanRaw] : []));
        const diteruskanStr = diteruskanList.filter(Boolean).join(', ');

        return `
          <tr class="border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer" onclick="window.ArsipAgenda?.showSuratDetail(${i})">
            <td class="px-4 py-3 font-mono text-xs font-bold text-slate-900 dark:text-white whitespace-nowrap">
              <div class="flex items-center gap-1.5">${esc(noAgenda)} ${sifatPill(item.sifat)}${hasFile ? '<span class="material-symbols-outlined text-[14px] text-emerald-600" title="Ada Lampiran">attach_file</span>' : ''}</div>
              <div class="text-[10px] font-normal text-slate-400 truncate max-w-[180px]">${esc(noSub)}</div>
            </td>
            <td class="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">${esc(tgl)}</td>
            <td class="px-4 py-3 text-xs font-semibold text-slate-800 dark:text-slate-200 max-w-[200px] truncate">${esc(pihak)}</td>
            <td class="px-4 py-3 text-xs text-slate-700 dark:text-slate-300 max-w-[280px] truncate">${esc(item.perihal || '-')}</td>
            <td class="px-4 py-3 whitespace-nowrap">
              <div class="flex flex-col gap-0.5">
                <div>${statusPill(st)}</div>
                ${_suratMode === 'masuk' ? (diteruskanStr
                  ? `<div class="inline-flex items-center gap-1 text-[10.5px] font-medium text-slate-600 dark:text-slate-300 max-w-[170px] truncate" title="Diteruskan kepada: ${esc(diteruskanStr)}"><span class="material-symbols-outlined text-[13px] text-blue-500 shrink-0">arrow_forward</span><span class="truncate">${esc(diteruskanStr)}</span></div>`
                  : `<span class="text-[10px] text-slate-400 italic">Belum disposisi</span>`
                ) : ''}
                ${item.batas_waktu ? `<span class="text-[10px] font-mono text-amber-600 dark:text-amber-400">⏰ ${esc(fmtDate(item.batas_waktu))}</span>` : ''}
              </div>
            </td>
            <td class="px-4 py-3 text-right whitespace-nowrap">
              ${_suratMode === 'masuk' ? `
                <button type="button" onclick="event.stopPropagation(); window.ArsipAgenda?.openDisposisiModal(${item.id})" class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 hover:bg-[#2563eb] text-[#2563eb] hover:text-white dark:text-blue-300 dark:hover:text-white text-[11px] font-bold transition-all cursor-pointer mr-1 shadow-2xs">
                  <span class="material-symbols-outlined text-[15px]">assignment_turned_in</span>
                  <span>Disposisi</span>
                </button>
              ` : ''}
              <button type="button" data-sppd-pop-trigger onclick="event.stopPropagation(); window.ArsipAgenda?.openSuratPopover(this, ${i})" class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-bold transition-colors cursor-pointer">
                <span>Aksi</span>
                <span class="material-symbols-outlined text-[15px]">expand_more</span>
              </button>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      if (err?.name === 'AbortError' || reqId !== _suratReqId) return;
      if (countEl) countEl.textContent = '0 surat';
      tbody.innerHTML = `<tr><td colspan="6" class="py-10 text-center text-xs text-rose-500">Gagal memuat agenda surat: ${esc(err?.message || 'Koneksi terganggu')}</td></tr>`;
    }
  }

  function showSuratDetail(idx) {
    const item = _suratItems[idx];
    if (!item) return;
    closeStitchOverlay('stitchAgendaDetailOverlay');
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
    const previewSrc = buildDrivePreviewSrc(fileUrl);
    const wrap = d.createElement('div');
    wrap.id = 'stitchAgendaDetailOverlay';
    wrap.className = 'fixed inset-0 z-[96] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4';
    wrap.innerHTML = `
      <div class="w-full ${fileUrl ? 'max-w-4xl' : 'max-w-lg'} bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
        <div class="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 class="text-base font-bold text-slate-900 dark:text-white">${isMasuk ? 'Detail Surat Masuk' : 'Detail Surat Keluar'}</h3>
          <button type="button" data-close-ov class="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer"><span class="material-symbols-outlined text-[18px]">close</span></button>
        </div>
        <div class="flex-1 overflow-y-auto grid grid-cols-1 ${fileUrl ? 'lg:grid-cols-2' : ''} divide-y lg:divide-y-0 lg:divide-x divide-slate-100 dark:divide-slate-800">
          <div class="p-6 text-xs divide-y divide-slate-100 dark:divide-slate-800">
            ${rows.map(([k, v]) => `<div class="py-2.5 flex justify-between gap-4"><span class="text-slate-500 dark:text-slate-400 shrink-0">${esc(k)}</span><span class="font-semibold text-slate-900 dark:text-white text-right">${esc(v)}</span></div>`).join('')}
          </div>
          ${fileUrl ? `
          <div class="p-4 bg-slate-50 dark:bg-slate-950/60 flex flex-col gap-2 min-h-[340px]">
            <div class="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <span>Pratinjau Lampiran</span>
              <a href="${esc(fileUrl)}" target="_blank" rel="noopener noreferrer" class="text-[#2563eb] hover:underline normal-case">Buka Tab Baru</a>
            </div>
            <iframe src="${esc(previewSrc)}" class="w-full flex-1 min-h-[320px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white" title="Pratinjau Lampiran Surat"></iframe>
          </div>` : ''}
        </div>
        <div class="px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex items-center justify-end gap-2 flex-wrap">
          <button type="button" id="btnOvEditSurat" class="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold cursor-pointer">Edit Surat</button>
          ${isMasuk ? `<button type="button" id="btnOvCetakDisp" class="px-3.5 py-2 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer">Cetak Disposisi</button>` : ''}
          ${isMasuk ? `<button type="button" id="btnOvDisposisi" class="px-3.5 py-2 rounded-xl bg-[#2563eb] hover:bg-blue-700 text-white text-xs font-bold cursor-pointer">Disposisi Berjenjang</button>` : ''}
          <button type="button" data-close-ov class="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer">Tutup</button>
        </div>
      </div>
    `;
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close-ov]')) wrap.remove(); });
    wrap.querySelector('#btnOvDisposisi')?.addEventListener('click', () => { wrap.remove(); openDisposisiModal(item.id, item); });
    wrap.querySelector('#btnOvCetakDisp')?.addEventListener('click', () => cetakLembarDisposisi(item));
    wrap.querySelector('#btnOvEditSurat')?.addEventListener('click', () => { wrap.remove(); openEditSuratModal(idx); });
    d.body.appendChild(wrap);
  }

  async function openDisposisiModal(suratId, suratObj = null) {
    if (!suratId) return;
    closeStitchOverlay('stitchDisposisiOverlay');
    const surat = suratObj || _suratItems.find((x) => Number(x.id) === Number(suratId)) || { id: suratId };
    let history = [];
    const fetchHist = async () => {
      try {
        const r = await fetch(`/api/arsip/p/api/agenda/surat-masuk/${suratId}/disposisi`);
        const j = await r.json().catch(() => ({}));
        history = Array.isArray(j.items) ? j.items : (Array.isArray(j) ? j : []);
      } catch { history = []; }
    };
    await fetchHist();

    const wrap = d.createElement('div');
    wrap.id = 'stitchDisposisiOverlay';
    wrap.className = 'fixed inset-0 z-[97] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5';

    const hasFile = Boolean(surat.file_url || surat.file_final_url || surat.drive_url);
    const fileUrl = surat.file_url || surat.file_final_url || surat.drive_url || '';

    const renderBody = () => {
      const histBox = wrap.querySelector('#stDispHistBox');
      const histCountEl = wrap.querySelector('#stDispHistCount');
      if (histCountEl) histCountEl.textContent = `${history.length} entri`;
      if (!histBox) return;

      if (!history.length) {
        histBox.innerHTML = `
          <div class="p-3.5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/40 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2.5">
            <span class="material-symbols-outlined text-[20px] text-amber-600 dark:text-amber-400 shrink-0">info</span>
            <span>Surat ini belum pernah didisposisikan. Silakan isi form di bawah untuk mendisposisikan ke pejabat / bidang terkait.</span>
          </div>
        `;
        return;
      }

      histBox.innerHTML = history.map((h, idx) => {
        const dit = Array.isArray(h.diteruskan_kepada) ? h.diteruskan_kepada : (h.diteruskan_kepada ? [h.diteruskan_kepada] : []);
        const ar = Array.isArray(h.arahan) ? h.arahan : (h.arahan ? [h.arahan] : []);
        const st = h.status_tindaklanjut || 'Didisposisi';
        const isSelesai = st.toLowerCase() === 'selesai';

        return `
          <div class="p-3.5 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700 shadow-2xs flex flex-col gap-2">
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <div class="flex items-center gap-2">
                <span class="px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 text-[10px] font-bold uppercase tracking-wider">Tingkat ${idx + 1}</span>
                <span class="font-bold text-slate-900 dark:text-white text-xs">${esc(h.pemberi_disposisi || 'Pimpinan')}</span>
                <span class="text-[11px] text-slate-400 font-mono">• ${esc(fmtDate(h.tanggal_disposisi))}</span>
              </div>
              <div class="flex items-center gap-1.5">
                <span class="px-2 py-0.5 rounded-md text-[10px] font-bold ${isSelesai ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300' : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'}">${esc(st)}</span>
                <button type="button" data-wa-disp="${h.id}" title="Salin format WhatsApp disposisi ini" class="p-1 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer">
                  <span class="material-symbols-outlined text-[15px]">share</span>
                </button>
                ${!isSelesai ? `
                  <button type="button" data-done-disp="${h.id}" title="Tandai Selesai" class="px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-600 hover:text-white text-emerald-700 dark:text-emerald-300 text-[10.5px] font-bold flex items-center gap-1 cursor-pointer transition-colors">
                    <span class="material-symbols-outlined text-[13px]">check_circle</span>
                    <span>Selesai</span>
                  </button>
                ` : ''}
                <button type="button" data-del-disp="${h.id}" title="Hapus entri ini" class="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer">
                  <span class="material-symbols-outlined text-[15px]">delete</span>
                </button>
              </div>
            </div>

            ${dit.length ? `
              <div class="flex items-center gap-1.5 flex-wrap text-[11px]">
                <span class="text-slate-400 font-medium">Diteruskan:</span>
                ${dit.map((dItem) => `<span class="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-700/70 text-slate-700 dark:text-slate-200 font-medium">${esc(dItem)}</span>`).join('')}
              </div>
            ` : ''}

            ${ar.length ? `
              <div class="text-[11px] text-slate-700 dark:text-slate-300 flex items-start gap-1.5">
                <span class="text-slate-400 font-medium shrink-0">Arahan:</span>
                <span>${esc(ar.join('; '))}</span>
              </div>
            ` : ''}

            ${h.catatan_instruksi ? `
              <div class="p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 text-[11px] text-slate-800 dark:text-slate-200">
                <span class="font-bold text-slate-500">Catatan:</span> ${esc(h.catatan_instruksi)}
              </div>
            ` : ''}

            ${h.batas_waktu ? `
              <div class="text-[10.5px] font-mono text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <span class="material-symbols-outlined text-[13px]">alarm</span>
                <span>Batas Waktu: ${esc(fmtDate(h.batas_waktu))}</span>
              </div>
            ` : ''}
          </div>
        `;
      }).join('');

      histBox.querySelectorAll('[data-del-disp]').forEach((b) => {
        b.addEventListener('click', async () => {
          const id = b.dataset.delDisp;
          if (w.Swal) {
            const ask = await w.Swal.fire({
              title: 'Hapus Disposisi?',
              text: 'Entri disposisi ini akan dihapus permanen.',
              icon: 'warning',
              showCancelButton: true,
              confirmButtonText: 'Ya, Hapus',
              cancelButtonText: 'Batal',
              confirmButtonColor: '#ef4444',
            });
            if (!ask.isConfirmed) return;
          }
          try {
            await fetch(`/api/arsip/p/api/agenda/disposisi/${id}`, { method: 'DELETE' });
            await fetchHist();
            renderBody();
            loadAgendaSurat();
            loadMobileAgendaSurat();
          } catch { /* ignore */ }
        });
      });

      histBox.querySelectorAll('[data-done-disp]').forEach((b) => {
        b.addEventListener('click', async () => {
          const id = b.dataset.doneDisp;
          try {
            await fetch(`/api/arsip/p/api/agenda/disposisi/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status_tindaklanjut: 'Selesai' }),
            });
            await fetchHist();
            renderBody();
            loadAgendaSurat();
            loadMobileAgendaSurat();
            if (w.Swal) w.Swal.fire({ icon: 'success', title: 'Disposisi Selesai', timer: 1200, showConfirmButton: false });
          } catch { /* ignore */ }
        });
      });

      histBox.querySelectorAll('[data-wa-disp]').forEach((b) => {
        b.addEventListener('click', () => {
          const id = Number(b.dataset.waDisp);
          const itemDisp = history.find((x) => Number(x.id) === id) || history[0];
          const waTxt = buildDisposisiWaText(surat, itemDisp);
          copyTextToClipboard(waTxt, 'Teks Disposisi Disalin');
        });
      });
    };

    wrap.innerHTML = `
      <div class="w-full max-w-3xl max-h-[94vh] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
        <!-- Header -->
        <div class="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <span class="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-[#2563eb] flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-[20px]">assignment_turned_in</span>
            </span>
            <div class="min-w-0">
              <h3 class="text-sm font-bold text-slate-900 dark:text-white leading-tight">Disposisi Berjenjang Surat Masuk</h3>
              <p class="text-[11px] font-mono text-slate-500 truncate mt-0.5">${esc(surat.nomor_agenda || `#${suratId}`)} · ${esc(surat.asal_surat || '')}</p>
            </div>
          </div>
          <div class="flex items-center gap-1.5">
            <button type="button" id="stDispCopyWaBtn" class="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs">
              <span class="material-symbols-outlined text-[15px]">share</span>
              <span class="hidden sm:inline">Salin WA</span>
            </button>
            <button type="button" id="stDispPrintBtn" class="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs">
              <span class="material-symbols-outlined text-[15px]">print</span>
              <span class="hidden sm:inline">Cetak Lembar</span>
            </button>
            <button type="button" data-close-disp class="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center cursor-pointer">
              <span class="material-symbols-outlined text-[19px]">close</span>
            </button>
          </div>
        </div>

        <!-- Content (Scrollable) -->
        <div class="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
          <!-- Card Ringkasan Surat -->
          <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700 flex flex-col gap-2">
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <div class="flex items-center gap-2">
                <span class="font-mono text-xs font-bold text-primary">${esc(surat.nomor_agenda || '-')}</span>
                ${sifatPill(surat.sifat)}
              </div>
              <div class="text-[11px] font-mono text-slate-500">
                Terima: <strong>${esc(fmtDate(surat.tanggal_terima || surat.tanggal_surat))}</strong>
              </div>
            </div>
            <div class="text-xs text-slate-800 dark:text-slate-200">
              <div class="font-bold text-slate-900 dark:text-white">${esc(surat.perihal || '-')}</div>
              <div class="text-[11.5px] text-slate-500 dark:text-slate-400 mt-0.5">Dari: <strong>${esc(surat.asal_surat || '-')}</strong> · No. Surat: <span class="font-mono">${esc(surat.nomor_surat_asli || '-')}</span> (${esc(fmtDate(surat.tanggal_surat))})</div>
            </div>
            ${hasFile ? `
              <div class="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
                <span class="text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1 font-medium">
                  <span class="material-symbols-outlined text-[15px]">attach_file</span>
                  <span>Tersedia Berkas Lampiran</span>
                </span>
                <a href="${esc(fileUrl)}" target="_blank" rel="noopener noreferrer" class="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:underline text-[11px] font-bold inline-flex items-center gap-1">
                  <span>Buka Berkas</span>
                  <span class="material-symbols-outlined text-[14px]">open_in_new</span>
                </a>
              </div>
            ` : ''}
          </div>

          <!-- Riwayat Disposisi Berjenjang -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="text-[11px] font-bold uppercase tracking-wider text-slate-400">Riwayat Disposisi Berjenjang</span>
              <span id="stDispHistCount" class="text-[11px] text-slate-400 font-mono">${history.length} entri</span>
            </div>
            <div id="stDispHistBox" class="space-y-2 max-h-52 overflow-y-auto pr-1"></div>
          </div>

          <!-- Form Tambah Disposisi Baru / Lanjutan -->
          <div class="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-3">
            <div class="flex items-center justify-between">
              <h4 class="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <span class="material-symbols-outlined text-[16px] text-primary">add_circle</span>
                <span>Catat Disposisi ${history.length ? 'Lanjutan (Berjenjang)' : 'Baru'}</span>
              </h4>
              <span class="text-[10.5px] text-slate-400">* Wajib diisi</span>
            </div>

            <!-- Baris 1: Pemberi & Tanggal & Batas Waktu & Status -->
            <div class="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
              <div>
                <label class="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Pemberi Disposisi *</label>
                <select id="stDispPemberi" class="w-full h-9 px-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
                  ${PEMBERI_DISPOSISI_OPTIONS.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Tgl Disposisi *</label>
                <input id="stDispTgl" type="date" value="${new Date().toISOString().slice(0, 10)}" class="w-full h-9 px-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono">
              </div>
              <div>
                <label class="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Batas Waktu</label>
                <input id="stDispBatas" type="date" class="w-full h-9 px-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono">
              </div>
              <div>
                <label class="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Status Tindak Lanjut</label>
                <select id="stDispStatus" class="w-full h-9 px-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold">
                  <option value="Didisposisi" selected>Didisposisi</option>
                  <option value="Sedang Diproses">Sedang Diproses</option>
                  <option value="Menunggu Arahan">Menunggu Arahan</option>
                  <option value="Selesai">Selesai</option>
                </select>
              </div>
            </div>

            <!-- Baris 2: Diteruskan Kepada & Arahan -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <!-- Diteruskan -->
              <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 flex flex-col gap-2">
                <div class="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                  <span>Diteruskan Kepada *</span>
                  <span class="text-[10px] text-slate-400 font-normal">Pilih 1 atau lebih</span>
                </div>
                <div class="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  ${DITERUSKAN_OPTIONS.map((o) => `
                    <label class="flex items-center gap-2 cursor-pointer text-[11px] text-slate-700 dark:text-slate-300 hover:text-primary">
                      <input type="checkbox" name="stDispTujuan" value="${esc(o)}" class="accent-[#2563eb] rounded">
                      <span>${esc(o)}</span>
                    </label>
                  `).join('')}
                </div>
                <div class="pt-1.5 border-t border-slate-200/50 dark:border-slate-700/50">
                  <input id="stDispCustomTujuan" type="text" list="agendaPegawaiDatalist" placeholder="+ Ketik Staf / Tujuan Kustom..." class="w-full h-8 px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] outline-none focus:border-primary">
                </div>
              </div>

              <!-- Arahan -->
              <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 flex flex-col gap-2">
                <div class="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                  <span>Arahan / Petunjuk Pimpinan *</span>
                  <span class="text-[10px] text-slate-400 font-normal">Pilih 1 atau lebih</span>
                </div>
                <div class="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  ${ARAHAN_OPTIONS.map((o) => `
                    <label class="flex items-center gap-2 cursor-pointer text-[11px] text-slate-700 dark:text-slate-300 hover:text-primary">
                      <input type="checkbox" name="stDispArahan" value="${esc(o)}" class="accent-[#2563eb] rounded">
                      <span>${esc(o)}</span>
                    </label>
                  `).join('')}
                </div>
                <div class="pt-1.5 border-t border-slate-200/50 dark:border-slate-700/50">
                  <input id="stDispCustomArahan" type="text" placeholder="+ Tambah arahan khusus lainnya..." class="w-full h-8 px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] outline-none focus:border-primary">
                </div>
              </div>
            </div>

            <!-- Baris 3: Catatan Instruksi Khusus -->
            <div>
              <label class="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Catatan / Instruksi Khusus Pimpinan</label>
              <textarea id="stDispCatatan" rows="2" placeholder="Tuliskan catatan khusus atau instruksi penanganan surat..." class="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs outline-none focus:border-primary"></textarea>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex items-center justify-between gap-2 flex-wrap">
          <div class="flex items-center gap-2">
            <button type="button" id="stDispFootWaBtn" class="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs">
              <span class="material-symbols-outlined text-[15px] text-emerald-600">share</span>
              <span>Salin WA</span>
            </button>
            <button type="button" id="stDispFootPrintBtn" class="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs">
              <span class="material-symbols-outlined text-[15px] text-slate-600">print</span>
              <span>Cetak Lembar</span>
            </button>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" data-close-disp class="px-3.5 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer">Tutup</button>
            <button type="button" id="stDispSaveBtn" class="px-4 py-1.5 rounded-xl bg-[#2563eb] hover:bg-blue-700 text-white text-xs font-bold shadow-sm cursor-pointer flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[15px]">send</span>
              <span>Simpan Disposisi</span>
            </button>
          </div>
        </div>
      </div>
    `;

    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || e.target.closest('[data-close-disp]')) wrap.remove();
    });

    const handleCopyWa = () => {
      const latestDisp = history[history.length - 1] || null;
      const waTxt = buildDisposisiWaText(surat, latestDisp);
      copyTextToClipboard(waTxt, 'Teks Disposisi Disalin');
    };

    wrap.querySelector('#stDispCopyWaBtn')?.addEventListener('click', handleCopyWa);
    wrap.querySelector('#stDispFootWaBtn')?.addEventListener('click', handleCopyWa);
    wrap.querySelector('#stDispPrintBtn')?.addEventListener('click', () => cetakLembarDisposisi(surat, history));
    wrap.querySelector('#stDispFootPrintBtn')?.addEventListener('click', () => cetakLembarDisposisi(surat, history));

    wrap.querySelector('#stDispSaveBtn')?.addEventListener('click', async () => {
      const diteruskan = Array.from(wrap.querySelectorAll('input[name="stDispTujuan"]:checked')).map((el) => el.value);
      const customTujuan = (wrap.querySelector('#stDispCustomTujuan')?.value || '').trim();
      if (customTujuan && !diteruskan.includes(customTujuan)) {
        diteruskan.push(customTujuan);
      }

      const arahan = Array.from(wrap.querySelectorAll('input[name="stDispArahan"]:checked')).map((el) => el.value);
      const customArahan = (wrap.querySelector('#stDispCustomArahan')?.value || '').trim();
      if (customArahan && !arahan.includes(customArahan)) {
        arahan.push(customArahan);
      }

      if (!diteruskan.length || !arahan.length) {
        if (w.Swal) w.Swal.fire('Perhatian', 'Pilih minimal 1 tujuan dan 1 arahan disposisi.', 'warning');
        return;
      }

      const payload = {
        pemberi_disposisi: wrap.querySelector('#stDispPemberi').value,
        tanggal_disposisi: wrap.querySelector('#stDispTgl').value || new Date().toISOString().slice(0, 10),
        diteruskan_kepada: diteruskan,
        arahan,
        batas_waktu: wrap.querySelector('#stDispBatas').value || null,
        status_tindaklanjut: wrap.querySelector('#stDispStatus').value || 'Didisposisi',
        catatan_instruksi: wrap.querySelector('#stDispCatatan').value.trim(),
      };

      try {
        const r = await fetch(`/api/arsip/p/api/agenda/surat-masuk/${suratId}/disposisi`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.ok === false) throw new Error(j.message || `HTTP ${r.status}`);
        await fetchHist();
        renderBody();
        wrap.querySelectorAll('input[type="checkbox"]').forEach((c) => { c.checked = false; });
        if (wrap.querySelector('#stDispCustomTujuan')) wrap.querySelector('#stDispCustomTujuan').value = '';
        if (wrap.querySelector('#stDispCustomArahan')) wrap.querySelector('#stDispCustomArahan').value = '';
        wrap.querySelector('#stDispCatatan').value = '';
        loadAgendaSurat();
        loadMobileAgendaSurat();
        if (w.Swal) {
          w.Swal.fire({
            icon: 'success',
            title: 'Disposisi Dicatat',
            text: 'Disposisi berhasil disimpan dan status surat diperbarui.',
            timer: 1600,
            showConfirmButton: false,
          });
        }
      } catch (err) {
        if (w.Swal) w.Swal.fire({ icon: 'error', title: 'Gagal', text: err?.message || 'Koneksi terganggu.' });
      }
    });

    d.body.appendChild(wrap);
    renderBody();
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
    delete m.dataset.editId;
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

  function openEditSuratModal(idx) {
    const item = _suratItems[idx];
    if (!item) return;
    const m = d.getElementById('modalArsipAgendaSurat') || d.getElementById('drawerMobileAgendaSurat');
    if (!m) return;
    m.dataset.editId = String(item.id);
    const isMasuk = _suratMode === 'masuk';
    const titleEl = m.querySelector('[data-surat-modal-title]');
    if (titleEl) titleEl.textContent = isMasuk ? 'Edit Agenda Surat Masuk' : 'Edit Agenda Surat Keluar';
    const lblPihak = m.querySelector('[data-surat-pihak-label]');
    if (lblPihak) lblPihak.textContent = isMasuk ? 'Asal Surat *' : 'Tujuan Surat *';
    m.querySelectorAll('[data-surat-keluar-only]').forEach((el) => el.classList.toggle('hidden', isMasuk));
    const set = (k, val) => { const el = m.querySelector(`[data-surat-field="${k}"]`); if (el) el.value = val ?? ''; };
    set('nomor', isMasuk ? (item.nomor_surat_asli || '') : (item.nomor_surat || ''));
    set('kode', item.kode_klasifikasi || '050');
    set('sifat', item.sifat || 'Biasa');
    set('tanggal', String(item.tanggal_surat || '').slice(0, 10) || new Date().toISOString().slice(0, 10));
    set('pihak', isMasuk ? (item.asal_surat || '') : (item.tujuan_surat || ''));
    set('perihal', item.perihal || '');
    set('bidang', item.bidang_pengonsep || 'Sekretariat');
    set('penandatangan', item.penandatangan || 'Kepala BAPPERIDA');
    set('status', item.status || 'Terbit');
    set('file_draft_url', item.file_draft_url || '');
    set('keterangan', item.keterangan || '');
    set('file_url', item.file_url || item.file_final_url || item.drive_url || '');
    m.classList.remove('hidden');
    m.classList.add('flex');
    refreshPickersIn(m);
  }

  function closeSuratModal() {
    ['modalArsipAgendaSurat', 'drawerMobileAgendaSurat'].forEach((id) => {
      const m = d.getElementById(id);
      if (m) { delete m.dataset.editId; m.classList.add('hidden'); m.classList.remove('flex'); }
    });
  }

  let _submittingSurat = false;

  async function submitSurat(btnEl) {
    if (_submittingSurat) return;
    const m = btnEl?.closest('#modalArsipAgendaSurat, #drawerMobileAgendaSurat') || d.getElementById('modalArsipAgendaSurat');
    if (!m) return;
    const editId = m.dataset.editId || '';
    const v = (k) => (m.querySelector(`[data-surat-field="${k}"]`)?.value || '').trim();
    const nomor = v('nomor');
    const kode = v('kode') || '050';
    const sifat = v('sifat') || 'Biasa';
    const tanggal = v('tanggal') || new Date().toISOString().slice(0, 10);
    const pihak = v('pihak');
    const perihal = v('perihal');
    const isMasuk = _suratMode === 'masuk';
    const bidang = v('bidang') || 'Sekretariat';
    const penandatangan = v('penandatangan') || 'Kepala BAPPERIDA';
    const status = v('status') || (isMasuk ? 'Diterima' : 'Terbit');
    const fileDraftUrl = v('file_draft_url');
    const keterangan = v('keterangan');
    const fileUrl = v('file_url');

    if (!pihak || !perihal) {
      if (w.Swal) w.Swal.fire('Perhatian', 'Asal/Tujuan surat dan Perihal wajib diisi.', 'warning');
      return;
    }

    const orig = btnEl ? btnEl.innerHTML : '';
    _submittingSurat = true;
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Menyimpan...'; }

    const baseEp = isMasuk ? '/api/arsip/p/api/agenda/surat-masuk' : '/api/arsip/p/api/agenda/surat-keluar';
    const ep = editId ? `${baseEp}/${editId}` : baseEp;
    const body = isMasuk
      ? { nomor_surat_asli: nomor, kode_klasifikasi: kode, sifat, tanggal_surat: tanggal, tanggal_terima: tanggal, asal_surat: pihak, perihal, keterangan, file_url: fileUrl || null, tahun: Number(tanggal.slice(0, 4)) }
      : { nomor_surat: nomor, kode_klasifikasi: kode, sifat, tanggal_surat: tanggal, tujuan_surat: pihak, perihal, bidang_pengonsep: bidang, penandatangan, status, file_draft_url: fileDraftUrl || null, keterangan, file_final_url: fileUrl || null, tahun: Number(tanggal.slice(0, 4)) };

    try {
      const res = await fetch(ep, {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) throw new Error(json.message || `HTTP ${res.status}`);
      closeSuratModal();
      if (w.Swal) w.Swal.fire({ icon: 'success', title: editId ? 'Diperbarui' : 'Tersimpan', text: editId ? 'Agenda surat berhasil diperbarui.' : 'Agenda surat berhasil dicatat.' });
      loadAgendaSurat();
      loadMobileAgendaSurat();
    } catch (err) {
      if (w.Swal) w.Swal.fire({ icon: 'error', title: 'Gagal Menyimpan', text: err?.message || 'Koneksi terganggu.' });
    } finally {
      _submittingSurat = false;
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

  let _sppdReqId = 0;
  let _sppdAbortCtrl = null;

  async function loadAgendaSppd() {
    const tbody = d.getElementById('agendaSppdBody');
    const countEl = d.getElementById('agendaSppdCount');
    if (!tbody) return;

    const reqId = ++_sppdReqId;
    if (_sppdAbortCtrl) {
      try { _sppdAbortCtrl.abort(); } catch { /* ignore */ }
    }
    _sppdAbortCtrl = typeof AbortController === 'function' ? new AbortController() : null;
    const signal = _sppdAbortCtrl?.signal;

    tbody.innerHTML = renderSkeletonRows(6, 5);

    const tahun = d.getElementById('agendaSppdYear')?.value || String(new Date().getFullYear());
    const q = (d.getElementById('agendaSppdSearch')?.value || '').trim();
    const statusFilter = (d.getElementById('agendaSppdStatus')?.value || '').trim();
    const params = new URLSearchParams({ tahun, limit: '80' });
    if (_sppdJenis) params.set('jenis', _sppdJenis);
    if (statusFilter) params.set('status', statusFilter);
    if (q) params.set('q', q);

    try {
      const res = await fetch(`/api/arsip/p/api/agenda/sppd?${params.toString()}`, { signal });
      const json = await res.json().catch(() => ({}));
      if (reqId !== _sppdReqId) return;
      if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
      let items = Array.isArray(json.items) ? json.items : (Array.isArray(json) ? json : []);
      if (statusFilter) items = items.filter((it) => String(it.status || '').toLowerCase() === statusFilter.toLowerCase());
      _sppdItems = items;
      if (countEl) {
        const selesaiCnt = _sppdItems.filter((it) => /selesai|laporan/i.test(String(it.status || ''))).length;
        countEl.textContent = selesaiCnt ? `${_sppdItems.length} SPPD • ${selesaiCnt} selesai/LPJ` : `${_sppdItems.length} SPPD`;
      }

      if (!_sppdItems.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-12 text-center text-xs text-slate-400">Belum ada data Agenda SPPD untuk filter ini.</td></tr>`;
        return;
      }

      tbody.innerHTML = _sppdItems.map((item, i) => {
        const noSppd = item.nomor_sppd || item.nomor_spt || `#${item.id || i + 1}`;
        const noSpt = item.nomor_spt && item.nomor_sppd ? item.nomor_spt : (item.jenis_sppd === 'LUAR_DAERAH' ? 'Luar Daerah' : 'Dalam Daerah');
        const tglRange = `${fmtDate(item.tanggal_berangkat)} – ${fmtDate(item.tanggal_kembali)}`;
        let pkCnt = 0;
        try { const arr = Array.isArray(item.pengikut) ? item.pengikut : JSON.parse(item.pengikut || '[]'); pkCnt = arr.length; } catch { pkCnt = 0; }
        return `
          <tr class="border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer" onclick="window.ArsipAgenda?.showSppdDetail(${i})">
            <td class="px-4 py-3 font-mono text-xs font-bold text-slate-900 dark:text-white whitespace-nowrap">${esc(noSppd)}<div class="text-[10px] font-normal text-slate-400">${esc(noSpt)}</div></td>
            <td class="px-4 py-3 text-xs font-semibold text-slate-800 dark:text-slate-200 max-w-[190px]">
              <div class="truncate">${esc(item.pelaksana_nama || '-')}</div>
              ${pkCnt ? `<div class="text-[10px] font-semibold text-[#2563eb]">+${pkCnt} pengikut</div>` : ''}
            </td>
            <td class="px-4 py-3 text-xs text-slate-700 dark:text-slate-300 max-w-[170px]">
              <div class="truncate font-medium">${esc(item.tempat_tujuan || '-')}</div>
              <div class="text-[10px] text-slate-400 truncate">${esc(item.alat_angkutan || '')}</div>
            </td>
            <td class="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">${esc(tglRange)}</td>
            <td class="px-4 py-3 text-xs text-slate-700 dark:text-slate-300 max-w-[230px] truncate">${esc(item.maksud_perjalanan || '-')}</td>
            <td class="px-4 py-3 whitespace-nowrap text-right">
              <div class="inline-flex items-center gap-2">
                ${statusPill(item.status || 'Tercatat')}
                <button type="button" data-sppd-pop-trigger onclick="event.stopPropagation(); window.ArsipAgenda?.openSppdPopover(this, ${i})" class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/60 text-slate-700 dark:text-slate-200 hover:text-[#2563eb] text-[11px] font-bold transition-colors cursor-pointer">
                  <span>Aksi</span>
                  <span class="material-symbols-outlined text-[15px]">expand_more</span>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      if (err?.name === 'AbortError' || reqId !== _sppdReqId) return;
      if (countEl) countEl.textContent = '0 SPPD';
      tbody.innerHTML = `<tr><td colspan="6" class="py-10 text-center text-xs text-rose-500">Gagal memuat register SPPD: ${esc(err?.message || 'Koneksi terganggu')}</td></tr>`;
    }
  }

  function showSppdDetail(idx) {
    const item = _sppdItems[idx];
    if (!item) return;
    closeStitchOverlay('stitchAgendaDetailOverlay');
    let pengikut = [];
    try { pengikut = Array.isArray(item.pengikut) ? item.pengikut : JSON.parse(item.pengikut || '[]'); } catch (_) {}
    let berkasSpj = [];
    try { berkasSpj = Array.isArray(item.berkas_spj) ? item.berkas_spj : JSON.parse(item.berkas_spj || '[]'); } catch (_) {}

    const rows = [
      ['Nomor SPPD', item.nomor_sppd || '-'],
      ['Nomor SPT', item.nomor_spt || '-'],
      ['Jenis Perjalanan', item.jenis_sppd === 'LUAR_DAERAH' ? 'Luar Daerah' : 'Dalam Daerah'],
      ['Pejabat Perintah', item.pejabat_perintah || 'Kepala BAPPERIDA'],
      ['Pelaksana Utama', `${item.pelaksana_nama || '-'}${item.pelaksana_nip ? ' (NIP ' + item.pelaksana_nip + ')' : ''}`],
      pengikut.length ? ['Pengikut', pengikut.map((p) => p.nama).filter(Boolean).join(', ')] : null,
      ['Tempat Berangkat / Tujuan', `${item.tempat_berangkat || 'Waikabubak'} → ${item.tempat_tujuan || '-'}`],
      ['Jadwal Perjalanan', `${fmtDate(item.tanggal_berangkat)} – ${fmtDate(item.tanggal_kembali)}`],
      ['Alat Angkutan', item.alat_angkutan || '-'],
      ['Maksud Perjalanan', item.maksud_perjalanan || '-'],
      ['Status', item.status || 'Tercatat'],
      berkasSpj.length ? ['Lampiran SPJ', `${berkasSpj.length} berkas bukti terunggah`] : null,
    ].filter(Boolean);

    const wrap = d.createElement('div');
    wrap.id = 'stitchAgendaDetailOverlay';
    wrap.className = 'fixed inset-0 z-[96] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4';
    wrap.innerHTML = `
      <div class="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        <div class="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-[#2563eb] flex items-center justify-center"><span class="material-symbols-outlined text-[20px]">flight_takeoff</span></span>
            <div>
              <h3 class="text-base font-bold text-slate-900 dark:text-white">Detail Agenda SPPD</h3>
              <p class="text-[11px] font-mono text-slate-500 dark:text-slate-400">${esc(item.nomor_sppd || item.nomor_spt || '-')}</p>
            </div>
          </div>
          <button type="button" data-close-ov class="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer"><span class="material-symbols-outlined text-[18px]">close</span></button>
        </div>
        <div class="p-6 overflow-y-auto text-xs divide-y divide-slate-100 dark:divide-slate-800">
          ${rows.map(([k, v]) => `<div class="py-2.5 flex justify-between gap-4"><span class="text-slate-500 dark:text-slate-400 shrink-0">${esc(k)}</span><span class="font-semibold text-slate-900 dark:text-white text-right">${esc(v)}</span></div>`).join('')}
        </div>
        <div class="px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex items-center justify-between gap-2 flex-wrap">
          <div class="flex items-center gap-1.5 flex-wrap">
            <button type="button" id="btnDetPreview" class="px-3 py-2 rounded-xl bg-[#2563eb] hover:bg-blue-700 text-white text-xs font-bold cursor-pointer">Pratinjau Dokumen</button>
            <button type="button" id="btnDetDocxSpt" class="px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-[#2563eb] dark:text-blue-300 text-xs font-bold cursor-pointer">SPT (.docx)</button>
            <button type="button" id="btnDetDocxSppd" class="px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-[#2563eb] dark:text-blue-300 text-xs font-bold cursor-pointer">SPPD (.docx)</button>
            <button type="button" id="btnDetSpj" class="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer">Kelola LPJ / SPJ</button>
          </div>
          <button type="button" data-close-ov class="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer">Tutup</button>
        </div>
      </div>
    `;
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close-ov]')) wrap.remove(); });
    wrap.querySelector('#btnDetPreview')?.addEventListener('click', () => { wrap.remove(); w.SppdGenerator?.openPreviewModal(item, 'spt'); });
    wrap.querySelector('#btnDetDocxSpt')?.addEventListener('click', () => w.SppdGenerator?.unduhWordSPT(item));
    wrap.querySelector('#btnDetDocxSppd')?.addEventListener('click', () => w.SppdGenerator?.unduhWordSPPD(item));
    wrap.querySelector('#btnDetSpj')?.addEventListener('click', () => { wrap.remove(); openSppdSpjModal(item.id); });
    d.body.appendChild(wrap);
  }

  /* ── KELOLA LPJ / LHP & SPJ SPPD (100% UMA DATA PARITY) ───────────────── */
  async function openSppdSpjModal(id) {
    const item = _sppdItems.find((x) => String(x.id) === String(id));
    if (!item) return;
    closeStitchOverlay('stitchAgendaSpjOverlay');

    let berkasList = [];
    try { berkasList = Array.isArray(item.berkas_spj) ? [...item.berkas_spj] : JSON.parse(item.berkas_spj || '[]'); } catch (_) { berkasList = []; }

    const wrap = d.createElement('div');
    wrap.id = 'stitchAgendaSpjOverlay';
    wrap.className = 'fixed inset-0 z-[96] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4';
    wrap.innerHTML = `
      <div class="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
        <div class="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center"><span class="material-symbols-outlined text-[22px]">folder_check</span></span>
            <div>
              <h3 class="text-base font-bold text-slate-900 dark:text-white">Kelola LPJ / LHP &amp; Berkas SPJ SPPD</h3>
              <p class="text-xs text-slate-500 dark:text-slate-400">${esc(item.pelaksana_nama || '-')} • ${esc(item.nomor_sppd || item.nomor_spt || '-')}</p>
            </div>
          </div>
          <button type="button" data-close-spj class="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer"><span class="material-symbols-outlined text-[19px]">close</span></button>
        </div>

        <div class="p-6 overflow-y-auto flex flex-col gap-5 text-xs">
          <!-- Status Pertanggungjawaban -->
          <div>
            <label class="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">Status Pertanggungjawaban SPPD</label>
            <select id="spjFieldStatus" class="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white">
              <option value="Pengajuan" ${item.status === 'Pengajuan' ? 'selected' : ''}>Pengajuan</option>
              <option value="Terbit" ${item.status === 'Terbit' ? 'selected' : ''}>Terbit / Sedang Berjalan</option>
              <option value="Laporan Masuk" ${item.status === 'Laporan Masuk' ? 'selected' : ''}>Laporan Masuk (LHP Terunggah)</option>
              <option value="Selesai" ${item.status === 'Selesai' ? 'selected' : ''}>SPJ Lengkap / Selesai</option>
            </select>
          </div>

          <!-- 3 Dokumen Utama (LHP, Scan SPT, Scan SPPD/Visum) -->
          <div class="flex flex-col gap-3">
            <div class="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <span class="w-1 h-4 rounded-full bg-[#2563eb]"></span>
              <span>Dokumen Utama Perjalanan Dinas</span>
            </div>

            ${[
              ['lhp', 'Laporan Hasil Perjalanan (LHP)', item.file_lhp_url || ''],
              ['spt', 'Scan SPT Resmi Bertanda Tangan', item.file_spt_url || ''],
              ['sppd', 'Scan SPPD & Lembar Visum', item.file_sppd_url || ''],
            ].map(([key, label, val]) => `
              <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex flex-col gap-2">
                <div class="flex items-center justify-between gap-2 flex-wrap">
                  <label class="font-bold text-slate-800 dark:text-slate-200">${label}</label>
                  <div class="flex items-center gap-1.5">
                    <button type="button" data-spj-up-btn="${key}" class="px-2.5 py-1 rounded-lg bg-[#2563eb] hover:bg-blue-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer">
                      <span class="material-symbols-outlined text-[14px]">upload_file</span>
                      <span>Upload ke Drive</span>
                    </button>
                    <input type="file" data-spj-up-inp="${key}" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp" class="hidden">
                    ${val ? `<a href="${esc(val)}" target="_blank" rel="noopener noreferrer" class="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold">Buka</a>` : ''}
                  </div>
                </div>
                <input id="spjField_${key}" type="url" value="${esc(val)}" placeholder="https://drive.google.com/file/d/... (otomatis terisi saat upload)" class="w-full h-10 px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white outline-none focus:border-[#2563eb]">
                <div id="spjStatus_${key}" class="text-[10px] text-slate-400"></div>
              </div>
            `).join('')}
          </div>

          <!-- Lampiran Bukti SPJ / Kwitansi (Multi-item) -->
          <div class="flex flex-col gap-3">
            <div class="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <span class="w-1 h-4 rounded-full bg-emerald-600"></span>
              <span>Lampiran Bukti SPJ / Kwitansi</span>
            </div>
            <div id="spjBerkasListBox" class="flex flex-col gap-2"></div>
            <div class="p-3.5 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 flex flex-col gap-2.5">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input id="spjBaruNama" type="text" placeholder="Nama Bukti (mis. Tiket, Bill Hotel, BBM)" class="h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white outline-none focus:border-[#2563eb]">
                <input id="spjBaruUrl" type="url" placeholder="URL Drive atau klik Upload File..." class="h-10 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white outline-none focus:border-[#2563eb]">
              </div>
              <div class="flex items-center gap-2 flex-wrap">
                <button type="button" id="spjBaruUploadBtn" class="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer">
                  <span class="material-symbols-outlined text-[15px]">upload_file</span>
                  <span>Upload Bukti SPJ</span>
                </button>
                <input type="file" id="spjBaruFileInp" accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.docx" class="hidden">
                <button type="button" id="spjBaruAddBtn" class="px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-700 text-white text-[11px] font-bold cursor-pointer">+ Tambah ke Daftar</button>
                <span id="spjBaruStatus" class="text-[11px] text-slate-400"></span>
              </div>
            </div>
          </div>
        </div>

        <div class="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex items-center justify-end gap-2.5">
          <button type="button" data-close-spj class="px-4 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer">Batal</button>
          <button type="button" id="btnSaveSpjAll" class="px-5 py-2.5 rounded-xl bg-[#2563eb] hover:bg-blue-700 text-white text-xs font-bold shadow-sm cursor-pointer">Simpan LPJ &amp; Berkas SPJ</button>
        </div>
      </div>
    `;

    const renderBerkasList = () => {
      const box = wrap.querySelector('#spjBerkasListBox');
      if (!box) return;
      if (!berkasList.length) {
        box.innerHTML = '<div class="text-[11px] text-slate-400 py-2">Belum ada lampiran bukti SPJ (tiket/hotel/kwitansi) ditambahkan.</div>';
        return;
      }
      box.innerHTML = berkasList.map((b, bi) => `
        <div class="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700">
          <div class="min-w-0">
            <div class="font-bold text-slate-800 dark:text-slate-200 truncate">${esc(b.nama || `Bukti ${bi + 1}`)}</div>
            <div class="text-[10px] font-mono text-slate-400 truncate">${esc(b.url || '')}</div>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            ${b.url ? `<a href="${esc(b.url)}" target="_blank" rel="noopener noreferrer" class="px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-[#2563eb] text-[11px] font-bold">Buka</a>` : ''}
            <button type="button" data-del-spj="${bi}" class="px-2 py-1 rounded-lg text-rose-600 hover:bg-rose-50 text-[11px] font-bold cursor-pointer">Hapus</button>
          </div>
        </div>
      `).join('');
      box.querySelectorAll('[data-del-spj]').forEach((btn) => {
        btn.addEventListener('click', () => {
          berkasList.splice(Number(btn.dataset.delSpj), 1);
          renderBerkasList();
        });
      });
    };

    const uploadToDrive = async (file, statusEl) => {
      if (statusEl) statusEl.textContent = `Mengunggah "${file.name}" ke Google Drive...`;
      const dataBase64 = await readBlobAsBase64(file);
      const r = await fetch('/api/arsip/docs/upload-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, mimeType: file.type || 'application/octet-stream', dataBase64 }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false) throw new Error(j.message || `HTTP ${r.status}`);
      const url = j.url || (j.fileId ? `https://drive.google.com/file/d/${j.fileId}/view` : '');
      if (statusEl) statusEl.textContent = `Berhasil diunggah: ${file.name}`;
      return url;
    };

    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close-spj]')) wrap.remove(); });

    ['lhp', 'spt', 'sppd'].forEach((key) => {
      const btn = wrap.querySelector(`[data-spj-up-btn="${key}"]`);
      const inp = wrap.querySelector(`[data-spj-up-inp="${key}"]`);
      btn?.addEventListener('click', () => inp?.click());
      inp?.addEventListener('change', async () => {
        const f = inp.files?.[0];
        if (!f) return;
        const st = wrap.querySelector(`#spjStatus_${key}`);
        try {
          const url = await uploadToDrive(f, st);
          const field = wrap.querySelector(`#spjField_${key}`);
          if (field && url) field.value = url;
          if (key === 'lhp') {
            const stSel = wrap.querySelector('#spjFieldStatus');
            if (stSel && (stSel.value === 'Pengajuan' || stSel.value === 'Terbit')) {
              stSel.value = 'Laporan Masuk';
              refreshPickersIn(wrap);
            }
          }
        } catch (err) {
          if (st) st.textContent = `Gagal upload: ${err?.message}`;
        } finally {
          inp.value = '';
        }
      });
    });

    wrap.querySelector('#spjBaruUploadBtn')?.addEventListener('click', () => wrap.querySelector('#spjBaruFileInp')?.click());
    wrap.querySelector('#spjBaruFileInp')?.addEventListener('change', async (ev) => {
      const f = ev.target.files?.[0];
      if (!f) return;
      const st = wrap.querySelector('#spjBaruStatus');
      try {
        const url = await uploadToDrive(f, st);
        const nmInp = wrap.querySelector('#spjBaruNama');
        const nama = (nmInp?.value || '').trim() || f.name.replace(/\.[^.]+$/, '');
        berkasList.push({ nama, url });
        if (nmInp) nmInp.value = '';
        const uInp = wrap.querySelector('#spjBaruUrl');
        if (uInp) uInp.value = '';
        renderBerkasList();
      } catch (err) {
        if (st) st.textContent = `Gagal: ${err?.message}`;
      } finally {
        ev.target.value = '';
      }
    });

    wrap.querySelector('#spjBaruAddBtn')?.addEventListener('click', () => {
      const nm = (wrap.querySelector('#spjBaruNama')?.value || '').trim();
      const ur = (wrap.querySelector('#spjBaruUrl')?.value || '').trim();
      if (!nm || !ur) return;
      berkasList.push({ nama: nm, url: ur });
      wrap.querySelector('#spjBaruNama').value = '';
      wrap.querySelector('#spjBaruUrl').value = '';
      renderBerkasList();
    });

    wrap.querySelector('#btnSaveSpjAll')?.addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      const orig = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Menyimpan...';
      try {
        const body = {
          file_lhp_url: (wrap.querySelector('#spjField_lhp')?.value || '').trim(),
          file_spt_url: (wrap.querySelector('#spjField_spt')?.value || '').trim(),
          file_sppd_url: (wrap.querySelector('#spjField_sppd')?.value || '').trim(),
          berkas_spj: berkasList,
          status: wrap.querySelector('#spjFieldStatus')?.value || 'Laporan Masuk',
        };
        const r = await fetch(`/api/arsip/p/api/agenda/sppd/${item.id}/spj`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.ok === false) throw new Error(j.message || `HTTP ${r.status}`);
        wrap.remove();
        if (typeof w.showDynamicIsland === 'function') {
          w.showDynamicIsland({ type: 'success', title: 'LPJ & SPJ Tersimpan', message: `Status diperbarui menjadi ${body.status}.` });
        }
        loadAgendaSppd();
        loadMobileAgendaSppd();
      } catch (err) {
        if (w.Swal) w.Swal.fire({ icon: 'error', title: 'Gagal Menyimpan LPJ', text: err?.message || 'Koneksi terganggu.' });
      } finally {
        btn.disabled = false;
        btn.textContent = orig;
      }
    });

    d.body.appendChild(wrap);
    renderBerkasList();
    refreshPickersIn(wrap);
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
    delete m.dataset.editId;
    ensurePegawaiLoaded();
    const today = new Date().toISOString().slice(0, 10);
    const yr = today.slice(0, 4);
    m.querySelectorAll('input, textarea').forEach((el) => {
      if (el.type === 'date') el.value = today;
      else if (el.dataset.sppdField === 'tempat_berangkat' || el.dataset.sppdField === 'ditetapkan_di') el.value = 'Waikabubak';
      else if (el.dataset.sppdField === 'dasar_hukum') el.value = `DPA Bapperida Kabupaten Sumba Barat TA ${yr}`;
      else if (el.dataset.sppdField === 'subkegiatan_nama') el.value = 'Koordinasi dan Penyusunan Dokumen Perencanaan Pembangunan Daerah';
      else el.value = '';
    });
    const pkWrap = m.querySelector('[data-sppd-pengikut-list]');
    if (pkWrap) pkWrap.innerHTML = '';
    m.classList.remove('hidden');
    m.classList.add('flex');
    refreshPickersIn(m);
  }

  function openEditSppdModal(idx) {
    const item = _sppdItems[idx];
    if (!item) return;
    const m = d.getElementById('modalArsipAgendaSppd') || d.getElementById('drawerMobileAgendaSppd');
    if (!m) return;
    m.dataset.editId = String(item.id);
    ensurePegawaiLoaded();
    const set = (k, val) => { const el = m.querySelector(`[data-sppd-field="${k}"]`); if (el) el.value = val ?? ''; };
    set('jenis', item.jenis_sppd || 'DALAM_DAERAH');
    set('kop_surat', item.kop_surat || 'BAPPERIDA');
    set('pejabat', item.pejabat_perintah || 'Kepala BAPPERIDA');
    set('nomor_spt', item.nomor_spt || '');
    set('nomor_sppd', item.nomor_sppd || '');
    set('tanggal_spt', String(item.tanggal_spt || '').slice(0, 10));
    set('ditetapkan_di', item.ditetapkan_di || 'Waikabubak');
    set('dasar_hukum', item.dasar_hukum || '');
    set('tingkat_biaya', item.tingkat_biaya || '');
    set('pelaksana', item.pelaksana_nama || '');
    set('pelaksana_nip', item.pelaksana_nip || '');
    set('pelaksana_pangkat', item.pelaksana_pangkat || '');
    set('pelaksana_jabatan', item.pelaksana_jabatan || '');
    let parsedWewenang = {};
    try { parsedWewenang = typeof item.wewenang === 'object' && item.wewenang ? item.wewenang : JSON.parse(item.wewenang || '{}'); } catch { parsedWewenang = {}; }
    const p1Pptk = parsedWewenang.pelaksana_pptk || {};
    set('pelaksana_pptk_nama', item.pelaksana_pptk_nama || p1Pptk.nama || '');
    set('pelaksana_pptk_jabatan', item.pelaksana_pptk_jabatan || p1Pptk.jabatan || '');
    set('pelaksana_pptk_nip', item.pelaksana_pptk_nip || p1Pptk.nip || '');
    const mainParaf = Array.isArray(item.paraf) && item.paraf.length ? item.paraf : (Array.isArray(parsedWewenang.paraf) ? parsedWewenang.paraf : []);
    set('pelaksana_paraf1', mainParaf[0] || '');
    set('pelaksana_paraf2', mainParaf[1] || '');
    set('pelaksana_paraf3', mainParaf[2] || '');
    set('tempat_berangkat', item.tempat_berangkat || 'Waikabubak');
    set('tujuan', item.tempat_tujuan || '');
    set('provinsi_tujuan', item.provinsi_tujuan || 'Nusa Tenggara Timur');
    set('rute_perjalanan', item.rute_perjalanan || '');
    set('maksud', item.maksud_perjalanan || '');
    set('berangkat', String(item.tanggal_berangkat || '').slice(0, 10));
    set('kembali', String(item.tanggal_kembali || '').slice(0, 10));
    set('angkutan', item.alat_angkutan || 'Kendaraan Dinas Roda 4');
    set('subkegiatan_nama', item.subkegiatan_nama || '');

    const pkWrap = m.querySelector('[data-sppd-pengikut-list]');
    if (pkWrap) {
      pkWrap.innerHTML = '';
      let pks = [];
      try { pks = Array.isArray(item.pengikut) ? item.pengikut : JSON.parse(item.pengikut || '[]'); } catch { pks = []; }
      pks.forEach((p) => {
        addPengikutRow(pkWrap);
        const last = pkWrap.lastElementChild;
        if (!last) return;
        const s = (k, val) => { const el = last.querySelector(`[data-pk="${k}"]`); if (el) el.value = val || ''; };
        s('nama', p.nama || p.name);
        s('nip', p.nip);
        s('pangkat', p.pangkat);
        s('jabatan', p.jabatan);
        s('nomor_sppd', p.nomor_sppd);
        s('tingkat_biaya', p.tingkat_biaya);
        s('pptk_nama', p.pptk_nama);
        s('pptk_jabatan', p.pptk_jabatan);
        s('pptk_nip', p.pptk_nip);
        const pParaf = Array.isArray(p.paraf) ? p.paraf : [];
        s('paraf1', pParaf[0]);
        s('paraf2', pParaf[1]);
        s('paraf3', pParaf[2]);
      });
    }
    m.classList.remove('hidden');
    m.classList.add('flex');
    refreshPickersIn(m);
  }

  function closeSppdModal() {
    ['modalArsipAgendaSppd', 'drawerMobileAgendaSppd'].forEach((id) => {
      const m = d.getElementById(id);
      if (m) { delete m.dataset.editId; m.classList.add('hidden'); m.classList.remove('flex'); }
    });
  }

  let _submittingSppd = false;

  async function submitSppd(btnEl) {
    if (_submittingSppd) return;
    const m = btnEl?.closest('#modalArsipAgendaSppd, #drawerMobileAgendaSppd') || d.getElementById('modalArsipAgendaSppd');
    if (!m) return;
    const editId = m.dataset.editId || '';
    const v = (k) => (m.querySelector(`[data-sppd-field="${k}"]`)?.value || '').trim();
    const pelaksana_nama = v('pelaksana');
    const pelaksana_nip = v('pelaksana_nip');
    const pelaksana_pangkat = v('pelaksana_pangkat');
    const pelaksana_jabatan = v('pelaksana_jabatan');
    const pelaksana_pptk_nama = v('pelaksana_pptk_nama');
    const pelaksana_pptk_jabatan = v('pelaksana_pptk_jabatan');
    const pelaksana_pptk_nip = v('pelaksana_pptk_nip');
    const pelaksana_paraf1 = v('pelaksana_paraf1');
    const pelaksana_paraf2 = v('pelaksana_paraf2');
    const pelaksana_paraf3 = v('pelaksana_paraf3');
    const mainParaf = [pelaksana_paraf1, pelaksana_paraf2, pelaksana_paraf3].filter(Boolean);
    const tempat_berangkat = v('tempat_berangkat') || 'Waikabubak';
    const tempat_tujuan = v('tujuan');
    const provinsi_tujuan = v('provinsi_tujuan') || 'Nusa Tenggara Timur';
    const rute_perjalanan = v('rute_perjalanan');
    const maksud_perjalanan = v('maksud');
    const jenis_sppd = v('jenis') || 'DALAM_DAERAH';
    const kop_surat = v('kop_surat') || 'BAPPERIDA';
    const tingkat_biaya = v('tingkat_biaya') || (jenis_sppd === 'LUAR_DAERAH' ? 'Tingkat B' : 'Tingkat C');
    const dasar_hukum = v('dasar_hukum') || `DPA Bapperida Kabupaten Sumba Barat TA ${new Date().getFullYear()}`;
    const ditetapkan_di = v('ditetapkan_di') || 'Waikabubak';
    const tanggal_spt = v('tanggal_spt') || new Date().toISOString().slice(0, 10);
    const tanggal_berangkat = v('berangkat') || todayOrNow();
    const tanggal_kembali = v('kembali') || tanggal_berangkat;
    const alat_angkutan = v('angkutan') || 'Kendaraan Dinas Roda 4';
    const pejabat_perintah = v('pejabat') || 'Kepala BAPPERIDA';
    const subkegiatan_nama = v('subkegiatan_nama');
    const nomor_spt = v('nomor_spt');
    const nomor_sppd = v('nomor_sppd');
    const pengikut = collectPengikut(m);

    if (!pelaksana_nama || !tempat_tujuan || !maksud_perjalanan) {
      if (w.Swal) w.Swal.fire('Perhatian', 'Nama pelaksana, tempat tujuan, dan maksud perjalanan wajib diisi.', 'warning');
      return;
    }

    const orig = btnEl ? btnEl.innerHTML : '';
    _submittingSppd = true;
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Menyimpan...'; }

    const payload = {
      jenis_sppd,
      kop_surat,
      pejabat_perintah,
      nomor_spt: nomor_spt || undefined,
      nomor_sppd: nomor_sppd || undefined,
      tanggal_spt,
      ditetapkan_di,
      dasar_hukum,
      tingkat_biaya,
      pelaksana_nama,
      pelaksana_nip,
      pelaksana_pangkat,
      pelaksana_jabatan,
      pelaksana_pptk_nama: pelaksana_pptk_nama || undefined,
      pelaksana_pptk_jabatan: pelaksana_pptk_jabatan || undefined,
      pelaksana_pptk_nip: pelaksana_pptk_nip || undefined,
      paraf: mainParaf.length ? mainParaf : undefined,
      wewenang: (pelaksana_pptk_nama || pelaksana_pptk_jabatan || pelaksana_pptk_nip || mainParaf.length)
        ? {
            ...(pelaksana_pptk_nama || pelaksana_pptk_jabatan || pelaksana_pptk_nip
              ? { pelaksana_pptk: { nama: pelaksana_pptk_nama, jabatan: pelaksana_pptk_jabatan, nip: pelaksana_pptk_nip } }
              : {}),
            ...(mainParaf.length ? { paraf: mainParaf } : {}),
          }
        : undefined,
      pengikut,
      tempat_berangkat,
      tempat_tujuan,
      provinsi_tujuan,
      rute_perjalanan,
      maksud_perjalanan,
      tanggal_berangkat,
      tanggal_kembali,
      alat_angkutan,
      subkegiatan_nama,
      tahun: Number(tanggal_berangkat.slice(0, 4)),
    };

    try {
      const ep = editId ? `/api/arsip/p/api/agenda/sppd/${editId}` : '/api/arsip/p/api/agenda/sppd';
      const res = await fetch(ep, {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) throw new Error(json.message || `HTTP ${res.status}`);
      closeSppdModal();
      loadAgendaSppd();
      loadMobileAgendaSppd();
      const savedItem = { ...payload, ...(json.item || {}) };
      if (!editId && w.SppdGenerator) {
        showSppdGenerateMenu(savedItem);
      } else if (w.Swal) {
        w.Swal.fire({ icon: 'success', title: editId ? 'Diperbarui' : 'Tersimpan', text: editId ? 'Agenda SPPD berhasil diperbarui.' : 'Agenda SPPD berhasil dicatat.' });
      }
    } catch (err) {
      if (w.Swal) w.Swal.fire({ icon: 'error', title: 'Gagal Menyimpan', text: err?.message || 'Koneksi terganggu.' });
    } finally {
      _submittingSppd = false;
      if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = orig; }
    }
  }

  async function openWewenang() {
    await ensurePegawaiLoaded();
    w.SppdGenerator?.openWewenangModal(_pegawaiList || []);
  }

  function todayOrNow() {
    return new Date().toISOString().slice(0, 10);
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
            ${_mSuratMode === 'masuk' && (item.diteruskan_kepada || item.catatan_instruksi) ? `
              <div class="px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800 text-[10.5px] flex items-center justify-between gap-1">
                <span class="text-slate-600 dark:text-slate-300 truncate">➡️ <strong>${esc(Array.isArray(item.diteruskan_kepada) ? item.diteruskan_kepada.join(', ') : item.diteruskan_kepada)}</strong></span>
                ${item.batas_waktu ? `<span class="font-mono text-amber-600 dark:text-amber-400 shrink-0">⏰ ${esc(fmtDate(item.batas_waktu))}</span>` : ''}
              </div>
            ` : ''}
            <div class="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-1.5">
              ${_mSuratMode === 'masuk' ? `<button type="button" onclick="event.stopPropagation(); window.ArsipAgenda?.openDisposisiModal(${item.id})" class="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-[#2563eb] dark:text-blue-300 text-[11px] font-bold cursor-pointer">Disposisi</button>` : ''}
              <button type="button" data-sppd-pop-trigger onclick="event.stopPropagation(); window.ArsipAgenda?.openSuratPopover(this, ${i})" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-bold cursor-pointer">
                <span>Aksi</span>
                <span class="material-symbols-outlined text-[14px]">expand_more</span>
              </button>
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
                <button type="button" data-sppd-pop-trigger onclick="event.stopPropagation(); window.ArsipAgenda?.openSppdPopover(this, ${i})" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-bold cursor-pointer">
                  <span>Aksi</span>
                  <span class="material-symbols-outlined text-[14px]">expand_more</span>
                </button>
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
    checkNomorSuratKeluar,
    checkNomorSppd,
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
    onPelaksanaPicked,
    onPengesahPicked,
    renumberPengikutRows,
    addPengikutRow,
    openSuratPopover,
    openSppdPopover,
    openEditSuratModal,
    openEditSppdModal,
    cetakLembarDisposisi,
    openWewenang,
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
