/* Stitch Arsip Digital — Miller Columns View + Preview Pane + Desktop Modal / Mobile Drawer Upload (peta-ekonomi parity) */
(function (w, d) {
  'use strict';

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

  let _allDocs = [];
  let _filteredDocs = [];
  let _selectedFolder = null; // null = Semua Dokumen
  let _selectedDocId = null;
  let _viewMode = 'columns'; // 'columns' | 'list'
  let _uploadMode = 'file'; // 'file' | 'gdrive'
  let _selectedFile = null;
  let _isAdminArsip = false;

  function extractDriveId(url) {
    const s = String(url || '').trim();
    if (!s) return '';
    const m = s.match(/\/file\/d\/([-\w]{5,200})/) || s.match(/\/d\/([-\w]{5,200})/) || s.match(/[?&]id=([-\w]{5,200})/);
    return m ? m[1] : '';
  }

  function fileBadgeInfo(doc) {
    const ft = String(doc.fileType || doc.file_type || '').toUpperCase();
    const title = String(doc.title || doc.judul || '').toLowerCase();
    if (ft.includes('XLS') || ft.includes('EXCEL') || title.endsWith('.xlsx') || title.endsWith('.xls')) {
      return { icon: 'table_view', label: 'Excel', cls: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300' };
    }
    if (ft.includes('DOC') || ft.includes('WORD') || title.endsWith('.docx') || title.endsWith('.doc')) {
      return { icon: 'article', label: 'Word', cls: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300' };
    }
    if (ft.includes('PPT') || title.endsWith('.pptx')) {
      return { icon: 'slideshow', label: 'PPT', cls: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300' };
    }
    return { icon: 'picture_as_pdf', label: ft || 'PDF', cls: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300' };
  }

  function normalizeDoc(raw, idx) {
    return {
      id: String(raw.id ?? raw.doc_id ?? (idx + 1)),
      title: String(raw.title || raw.judul || 'Dokumen Tanpa Judul').trim(),
      type: String(raw.type || raw.kategori || raw.jenis || 'Administrasi Umum').trim(),
      bidang: String(raw.bidang || raw.unit || raw.type || raw.kategori || 'Umum').trim(),
      sector: String(raw.sector || raw.sektor || 'Umum').trim(),
      year: String(raw.year || raw.tahun || new Date().getFullYear()).trim(),
      nomorDokumen: String(raw.nomorDokumen || raw.nomor_dokumen || '').trim(),
      tanggalDokumen: String(raw.tanggalDokumen || raw.tanggal_dokumen || raw.tanggal || '').trim(),
      uploader: String(raw.uploader || raw.pengunggah || 'Aparatur BAPPERIDA').trim(),
      uploaderId: String(raw.uploaderId || raw.uploader_nip || raw.nip || '').trim(),
      size: String(raw.size || raw.ukuran || '-').trim(),
      fileType: String(raw.fileType || raw.file_type || 'PDF').trim(),
      status: String(raw.status || (raw.publik ? 'Publik' : 'Terarsip')).trim(),
      publik: raw.publik !== false,
      url: String(raw.url || raw.file_url || raw.link || '').trim(),
      desc: String(raw.desc || raw.deskripsi || raw.keterangan || '').trim(),
    };
  }

  async function loadArsipDocs() {
    const colDocs = d.getElementById('arsipColDocs');
    if (colDocs) {
      colDocs.innerHTML = '<div class="py-12 text-center text-xs text-slate-400 flex flex-col items-center gap-2"><span class="material-symbols-outlined text-2xl text-primary animate-spin">progress_activity</span><span>Memuat pustaka dokumen...</span></div>';
    }

    // 1. Cek role arsipdigital (peta-ekonomi)
    fetch('/api/arsip/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        if (m && m.ok) {
          _isAdminArsip = Boolean(m.isAdmin);
          const rb = d.getElementById('arsipColRoleBadge');
          if (rb) rb.textContent = m.isAdmin ? 'Admin Arsip' : (m.role || 'Pembaca');
        }
      })
      .catch(() => {});

    // 2. Muat dokumen dari /api/stitch/arsip/mobile-data (peta-ekonomi + DB lokal)
    try {
      let list = [];
      const res = await fetch('/api/stitch/arsip/mobile-data');
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok && Array.isArray(json.documents)) {
        list = json.documents;
      } else {
        const r2 = await fetch('/api/arsip/docs');
        const j2 = await r2.json().catch(() => ({}));
        list = Array.isArray(j2) ? j2 : (Array.isArray(j2.data) ? j2.data : (Array.isArray(j2.documents) ? j2.documents : []));
      }

      _allDocs = list.map(normalizeDoc);
      populateYearFilter();
      applyFilters();
    } catch (err) {
      if (colDocs) {
        colDocs.innerHTML = `<div class="p-8 text-center text-xs text-rose-500">Gagal memuat dokumen: ${esc(err?.message || 'Koneksi terganggu')}</div>`;
      }
    }
  }

  function populateYearFilter() {
    const sel = d.getElementById('arsipColYearFilter');
    if (!sel) return;
    const prev = sel.value;
    const years = Array.from(new Set(_allDocs.map((x) => x.year).filter(Boolean))).sort((a, b) => Number(b) - Number(a));
    sel.innerHTML = '<option value="">Semua Tahun</option>' + years.map((y) => `<option value="${esc(y)}">${esc(y)}</option>`).join('');
    if (prev && years.includes(prev)) sel.value = prev;
  }

  function getFolderKey(doc) {
    return doc.type || doc.bidang || 'Lainnya';
  }

  function applyFilters() {
    const q = (d.getElementById('arsipColSearch')?.value || '').trim().toLowerCase();
    const yr = (d.getElementById('arsipColYearFilter')?.value || '').trim();

    const base = _allDocs.filter((doc) => {
      if (yr && doc.year !== yr) return false;
      if (q) {
        const hay = [doc.title, doc.type, doc.bidang, doc.sector, doc.nomorDokumen, doc.uploader, doc.year, doc.desc]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    // Hitung folder dari hasil filter pencarian/tahun
    const folderCounts = new Map();
    base.forEach((doc) => {
      const k = getFolderKey(doc);
      folderCounts.set(k, (folderCounts.get(k) || 0) + 1);
    });
    const folders = Array.from(folderCounts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

    if (_selectedFolder && !folderCounts.has(_selectedFolder)) {
      _selectedFolder = null;
    }

    _filteredDocs = _selectedFolder ? base.filter((doc) => getFolderKey(doc) === _selectedFolder) : base;

    const countBadge = d.getElementById('arsipColTotalCount');
    if (countBadge) countBadge.textContent = `${_filteredDocs.length} dokumen`;

    renderFolders(folders, base.length);
    renderDocList(_filteredDocs);

    const active = _filteredDocs.find((x) => x.id === _selectedDocId) || _filteredDocs[0] || null;
    _selectedDocId = active ? active.id : null;
    renderPreviewPane(active);
  }

  function renderFolders(folders, totalAll) {
    const el = d.getElementById('arsipColFolders');
    if (!el) return;

    const allActive = !_selectedFolder;
    let html = `
      <button type="button" onclick="window.ArsipColumns.selectFolder(null)"
        class="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors cursor-pointer border-l-[3px] ${allActive ? 'bg-blue-50/90 dark:bg-blue-950/50 border-[#2563eb] text-[#2563eb] dark:text-blue-300 font-bold' : 'border-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/70 font-semibold'}">
        <span class="w-7 h-7 rounded-lg ${allActive ? 'bg-[#2563eb] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'} flex items-center justify-center shrink-0">
          <span class="material-symbols-outlined text-[16px]">layers</span>
        </span>
        <span class="flex-1 text-xs truncate">Semua Dokumen</span>
        <span class="text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded-md ${allActive ? 'bg-blue-100 dark:bg-blue-900/70 text-[#2563eb] dark:text-blue-200' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}">${totalAll}</span>
      </button>
    `;

    html += folders.map(([name, cnt]) => {
      const act = _selectedFolder === name;
      return `
        <button type="button" onclick="window.ArsipColumns.selectFolder('${esc(name).replace(/'/g, "\\'")}')"
          class="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors cursor-pointer border-l-[3px] ${act ? 'bg-blue-50/90 dark:bg-blue-950/50 border-[#2563eb] text-[#2563eb] dark:text-blue-300 font-bold' : 'border-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/70 font-medium'}">
          <span class="w-7 h-7 rounded-lg ${act ? 'bg-blue-100 dark:bg-blue-900/60 text-[#2563eb] dark:text-blue-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'} flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-[16px]">${act ? 'folder_open' : 'folder'}</span>
          </span>
          <div class="flex-1 min-w-0">
            <div class="text-xs truncate">${esc(name)}</div>
            <div class="text-[10px] text-slate-400 font-mono tabular-nums">${cnt} dokumen</div>
          </div>
          <span class="material-symbols-outlined text-[15px] text-slate-400 shrink-0">chevron_right</span>
        </button>
      `;
    }).join('');

    el.innerHTML = html;
  }

  function renderDocList(items) {
    const el = d.getElementById('arsipColDocs');
    if (!el) return;

    if (!items.length) {
      el.innerHTML = `
        <div class="py-16 px-4 text-center flex flex-col items-center justify-center gap-2">
          <span class="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center">
            <span class="material-symbols-outlined text-[24px]">folder_off</span>
          </span>
          <div class="text-sm font-bold text-slate-800 dark:text-slate-200">Tidak ada dokumen ditemukan</div>
          <p class="text-xs text-slate-500 dark:text-slate-400">Ubah kata kunci pencarian atau tambah dokumen baru.</p>
        </div>
      `;
      return;
    }

    el.innerHTML = items.map((doc) => {
      const fi = fileBadgeInfo(doc);
      const isSelected = doc.id === _selectedDocId;
      return `
        <div role="button" tabindex="0"
          onclick="window.ArsipColumns.peekDoc('${esc(doc.id)}')"
          ondblclick="window.ArsipColumns.openDoc('${esc(doc.id)}')"
          class="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800/80 cursor-pointer transition-colors border-l-[3px] ${isSelected ? 'bg-blue-50/80 dark:bg-blue-950/40 border-l-[#2563eb]' : 'border-l-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50'}">
          <div class="w-9 h-9 rounded-xl ${fi.cls} flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-[19px]">${fi.icon}</span>
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-xs font-bold text-slate-900 dark:text-white truncate">${esc(doc.title)}</div>
            <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
              ${esc([doc.type, doc.sector].filter(Boolean).join(' • '))}${doc.nomorDokumen ? ' • ' + esc(doc.nomorDokumen) : ''}
            </div>
          </div>
          <div class="hidden sm:flex flex-col items-end shrink-0 text-right">
            <span class="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">${esc(doc.tanggalDokumen || doc.year)}</span>
            <span class="text-[10px] font-mono tabular-nums text-slate-400">${esc(doc.size)}</span>
          </div>
          <span class="material-symbols-outlined text-[16px] text-slate-400 shrink-0">chevron_right</span>
        </div>
      `;
    }).join('');
  }

  function renderPreviewPane(doc) {
    const pane = d.getElementById('arsipColPreview');
    if (!pane) return;

    if (!doc) {
      pane.innerHTML = `
        <div class="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 gap-2">
          <span class="material-symbols-outlined text-4xl">description</span>
          <p class="text-xs font-semibold">Pilih dokumen untuk melihat pratinjau dan detail metadata.</p>
        </div>
      `;
      return;
    }

    const fi = fileBadgeInfo(doc);
    const gid = extractDriveId(doc.url);
    const hasUrl = Boolean(doc.url && doc.url !== '#');
    const previewThumb = gid
      ? `<iframe src="https://drive.google.com/file/d/${encodeURIComponent(gid)}/preview" title="Pratinjau ${esc(doc.title)}" class="w-full h-44 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-800" loading="lazy"></iframe>`
      : `<div class="h-32 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center gap-1.5 text-slate-400">
           <span class="w-12 h-12 rounded-2xl ${fi.cls} flex items-center justify-center"><span class="material-symbols-outlined text-[26px]">${fi.icon}</span></span>
           <span class="text-[11px] font-mono font-bold uppercase">${esc(fi.label)}</span>
         </div>`;

    pane.innerHTML = `
      <div class="flex flex-col h-full">
        ${previewThumb}
        <div class="p-4 flex flex-col gap-3 flex-1 overflow-y-auto">
          <div>
            <h3 class="text-sm font-bold text-slate-900 dark:text-white leading-snug break-words">${esc(doc.title)}</h3>
            <div class="flex flex-wrap gap-1.5 mt-2">
              <span class="px-2 py-0.5 rounded-md text-[10px] font-bold ${fi.cls}">${esc(fi.label)}</span>
              <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">${esc(doc.publik ? 'Publik' : 'Internal')}</span>
              <span class="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">${esc(doc.year)}</span>
            </div>
          </div>

          <div class="divide-y divide-slate-100 dark:divide-slate-800 text-xs border-t border-b border-slate-100 dark:border-slate-800">
            <div class="py-2 flex justify-between gap-2"><span class="text-slate-400">Kategori</span><span class="font-semibold text-slate-800 dark:text-slate-200 text-right">${esc(doc.type)}</span></div>
            <div class="py-2 flex justify-between gap-2"><span class="text-slate-400">Bidang / Sektor</span><span class="font-semibold text-slate-800 dark:text-slate-200 text-right">${esc(doc.sector || doc.bidang)}</span></div>
            <div class="py-2 flex justify-between gap-2"><span class="text-slate-400">Pengunggah</span><span class="font-semibold text-slate-800 dark:text-slate-200 text-right truncate max-w-[170px]">${esc(doc.uploader)}</span></div>
            <div class="py-2 flex justify-between gap-2"><span class="text-slate-400">Tanggal</span><span class="font-mono tabular-nums text-slate-800 dark:text-slate-200">${esc(doc.tanggalDokumen || doc.year)}</span></div>
            <div class="py-2 flex justify-between gap-2"><span class="text-slate-400">Ukuran</span><span class="font-mono tabular-nums text-slate-800 dark:text-slate-200">${esc(doc.size)}</span></div>
            ${doc.nomorDokumen ? `<div class="py-2 flex justify-between gap-2"><span class="text-slate-400">Nomor</span><span class="font-mono text-slate-800 dark:text-slate-200 text-right break-all">${esc(doc.nomorDokumen)}</span></div>` : ''}
          </div>

          ${doc.desc ? `<p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl">${esc(doc.desc)}</p>` : ''}

          <div class="mt-auto pt-2 flex flex-col gap-2">
            ${hasUrl
              ? `<a href="${esc(doc.url)}" target="_blank" rel="noopener noreferrer" class="w-full py-2.5 px-3 rounded-xl bg-[#2563eb] hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm">
                   <span class="material-symbols-outlined text-[16px]">open_in_new</span>
                   <span>Buka / Unduh Berkas</span>
                 </a>`
              : `<button type="button" disabled class="w-full py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 text-xs font-semibold cursor-not-allowed">Berkas belum tertaut</button>`}
            ${hasUrl
              ? `<button type="button" onclick="window.ArsipColumns.copyUrl('${esc(doc.url).replace(/'/g, "\\'")}')" class="w-full py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer">
                   <span class="material-symbols-outlined text-[15px]">content_copy</span>
                   <span>Salin Tautan</span>
                 </button>`
              : ''}
          </div>
        </div>
      </div>
    `;
  }

  function setViewMode(mode) {
    _viewMode = mode === 'list' ? 'list' : 'columns';
    const colFolder = d.getElementById('arsipColFoldersWrap');
    const colPrev = d.getElementById('arsipColPreviewWrap');
    const btnCol = d.getElementById('btnArsipViewColumns');
    const btnList = d.getElementById('btnArsipViewList');
    if (colFolder) colFolder.classList.toggle('hidden', _viewMode === 'list');
    if (colPrev) colPrev.classList.toggle('xl:flex', _viewMode === 'columns');
    if (btnCol) {
      btnCol.className = _viewMode === 'columns'
        ? 'p-2 rounded-lg bg-[#2563eb] text-white shadow-xs transition-colors cursor-pointer'
        : 'p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer';
    }
    if (btnList) {
      btnList.className = _viewMode === 'list'
        ? 'p-2 rounded-lg bg-[#2563eb] text-white shadow-xs transition-colors cursor-pointer'
        : 'p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer';
    }
  }

  /* ── Upload Modal (Desktop) / Bottom Drawer (Mobile) ─────────────────── */
  function openUploadModal() {
    const modal = d.getElementById('modalArsipUpload') || d.getElementById('drawerMobileArsipUpload');
    if (!modal) return;
    _selectedFile = null;
    setUploadMode('file');
    const titleInp = modal.querySelector('[data-arsip-field="title"]');
    if (titleInp) titleInp.value = '';
    const urlInp = modal.querySelector('[data-arsip-field="url"]');
    if (urlInp) urlInp.value = '';
    const descInp = modal.querySelector('[data-arsip-field="desc"]');
    if (descInp) descInp.value = '';
    const nomorInp = modal.querySelector('[data-arsip-field="nomor"]');
    if (nomorInp) nomorInp.value = '';
    const fileLabel = modal.querySelector('[data-arsip-file-label]');
    if (fileLabel) fileLabel.textContent = 'Klik atau seret berkas PDF / Word / Excel ke sini (maks. 10 MB)';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  function closeUploadModal() {
    ['modalArsipUpload', 'drawerMobileArsipUpload'].forEach((id) => {
      const m = d.getElementById(id);
      if (m) {
        m.classList.add('hidden');
        m.classList.remove('flex');
      }
    });
  }

  function setUploadMode(mode) {
    _uploadMode = mode === 'gdrive' ? 'gdrive' : 'file';
    d.querySelectorAll('[data-arsip-upload-mode]').forEach((btn) => {
      const act = btn.dataset.arsipUploadMode === _uploadMode;
      btn.className = act
        ? 'flex-1 py-2 rounded-xl bg-[#2563eb] text-white text-xs font-bold transition-colors cursor-pointer'
        : 'flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer';
    });
    d.querySelectorAll('[data-arsip-file-pane]').forEach((el) => el.classList.toggle('hidden', _uploadMode !== 'file'));
    d.querySelectorAll('[data-arsip-gdrive-pane]').forEach((el) => el.classList.toggle('hidden', _uploadMode !== 'gdrive'));
  }

  function onFilePicked(inputEl) {
    const f = inputEl?.files?.[0] || null;
    _selectedFile = f;
    const modal = inputEl?.closest('#modalArsipUpload, #drawerMobileArsipUpload');
    const lbl = modal?.querySelector('[data-arsip-file-label]');
    if (lbl) {
      lbl.textContent = f
        ? `${f.name} (${(f.size / 1024).toFixed(0)} KB)`
        : 'Klik atau seret berkas PDF / Word / Excel ke sini (maks. 10 MB)';
    }
    const titleInp = modal?.querySelector('[data-arsip-field="title"]');
    if (f && titleInp && !titleInp.value.trim()) {
      titleInp.value = f.name.replace(/\.[^.]+$/, '');
    }
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = String(reader.result || '');
        const idx = res.indexOf('base64,');
        resolve(idx >= 0 ? res.slice(idx + 7) : res);
      };
      reader.onerror = () => reject(new Error('Gagal membaca berkas.'));
      reader.readAsDataURL(file);
    });
  }

  async function submitUpload(btnEl) {
    const modal = d.getElementById('modalArsipUpload')?.classList.contains('flex')
      ? d.getElementById('modalArsipUpload')
      : d.getElementById('drawerMobileArsipUpload');
    if (!modal) return;

    const val = (k) => (modal.querySelector(`[data-arsip-field="${k}"]`)?.value || '').trim();
    const title = val('title');
    const type = val('type') || 'Administrasi Umum';
    const sector = val('sector') || 'Umum';
    const year = val('year') || String(new Date().getFullYear());
    const nomor = val('nomor');
    const desc = val('desc');
    const publik = modal.querySelector('[data-arsip-field="publik"]')?.checked !== false;

    if (!title) {
      if (w.Swal) w.Swal.fire('Perhatian', 'Judul dokumen wajib diisi.', 'warning');
      return;
    }

    let finalUrl = val('url');
    if (_uploadMode === 'gdrive' && !finalUrl) {
      if (w.Swal) w.Swal.fire('Perhatian', 'Masukkan tautan Google Drive dokumen.', 'warning');
      return;
    }
    if (_uploadMode === 'file' && !_selectedFile) {
      if (w.Swal) w.Swal.fire('Perhatian', 'Pilih berkas dokumen terlebih dahulu.', 'warning');
      return;
    }

    const origHtml = btnEl ? btnEl.innerHTML : '';
    if (btnEl) {
      btnEl.disabled = true;
      btnEl.innerHTML = '<span class="material-symbols-outlined text-[16px] animate-spin">progress_activity</span><span>Mengunggah...</span>';
    }

    try {
      if (_uploadMode === 'file' && _selectedFile) {
        const dataBase64 = await readFileAsBase64(_selectedFile);
        const upRes = await fetch('/api/arsip/docs/upload-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: _selectedFile.name,
            mimeType: _selectedFile.type || 'application/pdf',
            dataBase64,
          }),
        });
        const upJson = await upRes.json().catch(() => ({}));
        if (!upRes.ok || upJson.ok === false) {
          throw new Error(upJson.message || `Gagal mengunggah berkas (HTTP ${upRes.status})`);
        }
        finalUrl = upJson.url || (upJson.fileId ? `https://drive.google.com/file/d/${upJson.fileId}/view` : '');
      }

      const saveRes = await fetch('/api/arsip/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          judul: title,
          type,
          kategori: type,
          sector,
          sektor: sector,
          year,
          tahun: Number(year) || new Date().getFullYear(),
          nomor_dokumen: nomor,
          desc,
          deskripsi: desc,
          url: finalUrl,
          file_url: finalUrl,
          publik,
        }),
      });
      const saveJson = await saveRes.json().catch(() => ({}));
      if (!saveRes.ok || saveJson.ok === false) {
        throw new Error(saveJson.message || `Gagal menyimpan metadata dokumen (HTTP ${saveRes.status})`);
      }

      closeUploadModal();
      if (typeof w.showDynamicIsland === 'function') {
        w.showDynamicIsland({ type: 'success', title: 'Dokumen Tersimpan', message: `"${title}" berhasil ditambahkan ke Arsip Digital.` });
      } else if (w.Swal) {
        w.Swal.fire({ icon: 'success', title: 'Dokumen Tersimpan', text: `"${title}" berhasil ditambahkan ke Arsip Digital.` });
      }
      if (d.getElementById('arsipColDocs')) loadArsipDocs();
      if (typeof w.loadRealMobileArsipData === 'function') w.loadRealMobileArsipData();
    } catch (err) {
      if (w.Swal) w.Swal.fire({ icon: 'error', title: 'Gagal Mengunggah', text: err?.message || 'Koneksi terganggu.' });
    } finally {
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.innerHTML = origHtml;
      }
    }
  }

  w.ArsipColumns = {
    init: loadArsipDocs,
    reload: loadArsipDocs,
    applyFilters,
    selectFolder(name) {
      _selectedFolder = name;
      applyFilters();
    },
    peekDoc(id) {
      _selectedDocId = id;
      const doc = _filteredDocs.find((x) => x.id === id) || null;
      renderDocList(_filteredDocs);
      renderPreviewPane(doc);
    },
    openDoc(id) {
      const doc = _filteredDocs.find((x) => x.id === id);
      if (doc && doc.url && doc.url !== '#') {
        w.open(doc.url, '_blank', 'noopener,noreferrer');
      }
    },
    copyUrl(url) {
      if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => {});
      if (typeof w.showDynamicIsland === 'function') {
        w.showDynamicIsland({ type: 'success', title: 'Tautan Disalin', message: 'Tautan dokumen berhasil disalin ke clipboard.' });
      }
    },
    setViewMode,
    openUploadModal,
    closeUploadModal,
    setUploadMode,
    onFilePicked,
    submitUpload,
  };

  if (d.readyState === 'loading') {
    d.addEventListener('DOMContentLoaded', () => {
      if (d.getElementById('arsipColDocs')) loadArsipDocs();
    });
  } else if (d.getElementById('arsipColDocs')) {
    loadArsipDocs();
  }
})(window, document);
