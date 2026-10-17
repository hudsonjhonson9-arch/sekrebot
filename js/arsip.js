/* ════ ARSIP NATIVE — Dokumen (port Jalur A dari peta-ekonomi) ════
    Frontend panel arsip absensi, data dari /api/arsip/docs (proxy server-side
    ke API arsipdigital). Tampilan full tersedia via showFull() (iframe). */


  /* global escapeHtml, apiFetch, apiGet, apiPost, showToast, switchTab */
(function () {
  'use strict';

    const KELAS_STATUS = { 'Menunggu Review': 'waiting', Diarsipkan: 'ok', Ditolak: 'no' };

  let docs = [];
  let loaded = false;
  let loading = false;
  let failed = false;
let meLoaded = false;
  let view = { view: 'home', folder: null, detail: null }; // beranda -> dokumen/kk/bd/app

  // Tampilkan hanya satu bagian panel sekaligus; iframe "Aplikasi lengkap"
  // tetap dikelola showFull()/closeFull() supaya perilaku lamanya tidak berubah.
  function tampil(id, on) {
    const el = $(id);
    if (el) el.style.display = on ? '' : 'none';
  }

  // Chrome panel (FAB unggah + tombol Kembali) mengikuti view & role, bukan daftar.
  // render() HANYA dipanggil untuk view 'dokumen' (lihat applyView), jadi kalau
  // penyinkronan tombol disimpan di sana, beranda/KK/BD tidak pernah jalan — FAB
  // tetap display:none dari atribut inline dan Kembali tidak pernah muncul.
  // Dipanggil dari applyView (setiap navigasi), render, dan loadArsipMe (begitu role
  // diketahui) supaya tidak pernah tertinggal.
  // FAB hanya di view Dokumen — beranda/KK/BD tidak punya tombol unggah, sama
  // seperti arsipdigital. Sembunyikan juga saat panel detail terbuka.
  // Kembali tampil di semua view selain beranda (Dokumen/KK/BD/app) → langsung
  // ke grid beranda; di beranda disembunyikan karena navigasi keluar tab ada di
  // bottom nav.
  function syncChrome() {
    const upBtn = $('arsipUploadBtn');
    if (upBtn) {
      const diDokumen = view.view === 'dokumen' && !view.detail;
      upBtn.style.display = (IS_ADMIN() && diDokumen) ? '' : 'none';
    }
    const backBtn = $('arsipBackBtn');
    if (backBtn) backBtn.style.display = view.view !== 'home' ? 'flex' : 'none';
  }

  // Modul Tahap 2/3 dipasang lewat kontrak mount/unmount. Kalau skripnya belum
  // dimuat, tampilkan placeholder (jangan sampai panel kosong tanpa penjelasan).
  function pasangModul(id, namaView, label, ambilModul) {
    const el = $(id);
    if (!el) return;
    const on = view.view === namaView;
    const sudah = el.dataset.mounted === '1';
    if (on && sudah) return;
    if (sudah) {
      const m = ambilModul();
      if (m && typeof m.unmount === 'function') {
        try { m.unmount(); } catch { /* biarkan, DOM tetap dibersihkan */ }
      }
      delete el.dataset.mounted;
      el.innerHTML = '';
      return;
    }
    if (!on) return;
    const m = ambilModul();
    if (m && typeof m.mount === 'function') {
      el.dataset.mounted = '1';
      el.innerHTML = '';
      try { m.mount(el); } catch { /* biarkan, DOM tetap dibersihkan */ }
    } else {
      el.innerHTML = `<div class="arsip-placeholder">${label} menyusul.</div>`;
    }
  }

  function applyView() {
    tampil('arsipHome', view.view === 'home');
    tampil('arsipDokumen', view.view === 'dokumen');
    tampil('arsipKK', view.view === 'kk');
    tampil('arsipBD', view.view === 'bd');
    if (window._arsipFull !== (view.view === 'app')) {
      if (view.view === 'app') showFull();
      else closeFull();
    }
    pasangModul('arsipKK', 'kk', 'Kertas Kerja', () => window.ArsipKK);
    pasangModul('arsipBD', 'bd', 'Bank Data', () => window.ArsipBD);
    if (view.detail) openDetail(view.detail);
    else if (view.view === 'dokumen') {
      const listEl = $('arsipList');
      const detailEl = $('arsipDetail');
      if (listEl) listEl.style.display = '';
      if (detailEl) detailEl.style.display = 'none';
      render();
    }
    syncChrome();
  }

  function goArsip(action) {
    view = window.ArsipUI.nav(view, action);
    applyView();
  }

  const $ = (id) => document.getElementById(id);

  function filterDocs(list, q, status) {
    const s = String(q || '').trim().toLowerCase();
    return list.filter((d) => {
      if (status && d.status !== status) return false;
      if (!s) return true;
      return [d.title, d.type, d.sector, d.bidang, d.year].some(
        (f) => f !== undefined && f !== null && String(f).toLowerCase().includes(s)
      );
    });
  }

  function badge(status) {
    const cls = KELAS_STATUS[status] || '';
    return `<span class="arsip-badge ${cls}">${escapeHtml(status || '')}</span>`;
  }

  // Admin panel arsip = role di user_credentials arsipdigital (GET /api/arsip/me),
  // BUKAN window.IS_ADMIN absensi — dua sumber role memang tidak sinkron. Fail-closed:
  // selama belum diambil atau gagal, dianggap bukan admin (FAB & aksi massal tersembunyi).
  const IS_ADMIN = () => window.ARSIP_IS_ADMIN === true;

  function actionsFor(d) {
    const st = String(d.status || '');
    let h = `<button class="arsip-act" data-act="publik" data-id="${escapeHtml(d.id)}">${d.publik ? 'Tarik' : 'Publik'}</button>`;
    if (st !== 'Diarsipkan') h += `<button class="arsip-act ok" data-act="setujui" data-id="${escapeHtml(d.id)}">Setujui</button>`;
    if (st === 'Menunggu Review') h += `<button class="arsip-act no" data-act="tolak" data-id="${escapeHtml(d.id)}">Tolak</button>`;
    h += `<button class="arsip-act danger" data-act="hapus" data-id="${escapeHtml(d.id)}">Hapus</button>`;
    return `<div class="arsip-actions">${h}</div>`;
  }

  async function loadHistory(id) {
    const h = $('arsipHistory');
    if (!h) return;
    const r = await apiSend('GET', '/api/arsip/docs/' + id + '/history');
    if (!r.ok) {
      h.textContent = 'Gagal memuat riwayat.';
      return;
    }
    const rows = Array.isArray(r.data) ? r.data : Array.isArray(r.data?.data) ? r.data.data : [];
    if (!rows.length) {
      h.textContent = 'Belum ada riwayat.';
      return;
    }
    h.innerHTML = '<div style="color:var(--white);margin-bottom:4px">Riwayat</div>'
      + '<div style="display:flex;flex-direction:column;gap:6px">'
      + rows.map((x) => {
          const t = x.created_at || x.waktu || x.date || '';
          const a = x.action || x.aksi || '';
          const from = x.from_status || '';
          const to = x.to_status || '';
          const note = x.note || '';
          const actor = x.actor_name || x.actor || '';
          return `<div style="border:1px solid var(--border);border-radius:8px;padding:6px 8px">
            <div><strong>${escapeHtml(a)}</strong> ${from && to ? ('→ ' + escapeHtml(from) + ' → ' + escapeHtml(to)) : ''}</div>
            <div style="font-size:11px;opacity:.8">${escapeHtml([actor, t].filter(Boolean).join(' · '))}</div>
            ${note ? '<div style="font-size:11px;opacity:.8;margin-top:2px">' + escapeHtml(note) + '</div>' : ''}
          </div>`;
        }).join('')
      + '</div>';
  }

  function closeDetail() {
    const detail = $('arsipDetail');
    const listEl = $('arsipList');
    if (detail) detail.style.display = 'none';
    if (listEl) listEl.style.display = 'flex';
  }

  // Preview di dalam panel. Jenis berkas menentukan cara tampilnya; pemanggilan
  // tab baru hanya sebagai jalan terakhir (jenis yang memang tidak bisa di-embed).
  function pesanLuar(d) {
    return '<div class="arsip-placeholder">Berkas ini tidak bisa ditampilkan di sini.'
      + ` <a class="arsip-act" href="${escapeHtml(d.url || '#')}" target="_blank" rel="noopener">Buka di tab baru</a></div>`;
  }

  function previewDoc(d) {
    const box = $('arsipPreview');
    const body = $('arsipPreviewBody');
    if (!d || !box || !body) return;
    const t = $('arsipPreviewTitle');
    if (t) t.textContent = d.title || 'Dokumen';
    const url = d.url || '';
    const buka = $('arsipPreviewOpen');
    if (buka) buka.href = url || '#';
    const dl = $('arsipPreviewDl');
    if (dl) dl.href = url || '#';

    const mode = window.ArsipUI.modePreview(d);
    if (mode === 'gambar') {
      const thumb = window.ArsipUI.driveThumbUrl(url, 1000);
      body.innerHTML = `<img class="arsip-preview-img" alt="${escapeHtml(d.title || '')}">`;
      const img = body.firstElementChild;
      // Dua cadangan: proxy gambar, lalu pesan + tombol buka.
      img.onerror = () => {
        img.onerror = () => { body.innerHTML = pesanLuar(d); };
        img.src = 'https://images.weserv.nl/?url=' + encodeURIComponent(thumb.replace(/^https?:\/\//, ''));
      };
      img.src = thumb;
    } else if (mode === 'embed') {
      const emb = window.ArsipUI.driveEmbedUrl(url);
      body.innerHTML = `<iframe class="arsip-preview-frame" src="${escapeHtml(emb)}" title="${escapeHtml(d.title || '')}"></iframe>`;
    } else {
      body.innerHTML = pesanLuar(d);
    }
    box.style.display = '';
    document.body.classList.add('arsip-preview-open');
  }

  function openPreview(id) {
    const d = (docs || []).find((x) => String(x.id) === String(id));
    if (d) previewDoc(d);
  }

  // Dipakai modul Kertas Kerja: dokumen yang baru ditautkan belum tentu ada di
  // cache daftar Dokumen, jadi kalau tidak ketemu, muat daftar sekali lalu cari lagi.
  async function previewDocById(id) {
    const cari = () => (docs || []).find((x) => String(x.id) === String(id));
    let d = cari();
    if (!d) {
      const r = await apiGet('/api/arsip/docs');
      if (r && r.ok && Array.isArray(r.rows)) {
        docs = r.rows;
        loaded = true;
        d = cari();
      }
    }
    if (d) return previewDoc(d);
    const box = $('arsipPreview');
    const body = $('arsipPreviewBody');
    if (!box || !body) return;
    const t = $('arsipPreviewTitle');
    if (t) t.textContent = 'Dokumen';
    body.innerHTML = '<div class="arsip-placeholder">Dokumen tidak ditemukan.</div>';
    box.style.display = '';
    document.body.classList.add('arsip-preview-open');
  }

  function closePreview() {
    const box = $('arsipPreview');
    if (!box) return;
    box.style.display = 'none';
    const body = $('arsipPreviewBody');
    if (body) body.innerHTML = ''; // hentikan iframe/muat gambar
    document.body.classList.remove('arsip-preview-open');
  }

  async function apiSend(method, path, body) {
    try {
      const res = await apiFetch('/api/arsip' + path, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      let data = null;
      try { data = await res.json(); } catch (e) { void e; }
      return { ok: res.ok, data, status: res.status };
    } catch (e) {
      console.error('[arsip]', path, e.message);
      return { ok: false, data: null, status: 0 };
    }
  }

  function openDetail(id) {
    const d = (docs || []).find((x) => String(x.id) === String(id));
    const detail = $('arsipDetail');
    const listEl = $('arsipList');
    if (!detail || !listEl) return;
    listEl.style.display = 'none';
    detail.style.display = 'block';
    let html = `<div class="arsip-detail-top"><button class="arsip-act" data-close-detail>Tutup</button></div>`;
    if (!d) {
      html += '<div class="arsip-placeholder">Dokumen tidak ditemukan</div>';
      detail.innerHTML = html;
      return;
    }
    const meta = [d.type, d.sector, d.bidang, d.year, d.versi ? 'v' + d.versi : ''].filter(Boolean).map((x) => escapeHtml(x)).join(' · ');
    html += `<h4 style="margin:0;color:var(--white);font-size:14px">${escapeHtml(d.title)}</h4>
      <div style="color:var(--muted);font-size:12px">${meta}</div>
      <div style="color:var(--muted);font-size:11px;margin-top:4px">${escapeHtml([d.uploader, d.uploadDate].filter(Boolean).join(' · '))}</div>
      <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">${badge(d.status)}${d.publik ? '<span class="arsip-badge">Publik</span>' : ''}</div>
      ${(() => {
        // metadata yang diisi lewat form unggah tapi sebelumnya tidak pernah tampil
        const dok = [d.nomorDokumen ? 'No. ' + d.nomorDokumen : '', d.tanggalDokumen || '']
          .filter(Boolean).map((x) => escapeHtml(x)).join(' &middot; ');
        const tagList = Array.isArray(d.tags) ? d.tags
          : (d.tagsRaw ? d.tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : []);
        return (dok ? `<div style="color:var(--muted);font-size:11px;margin-top:4px">${dok}</div>` : '')
          + (d.desc ? `<p style="margin:8px 0 0;font-size:12px;line-height:1.5;color:var(--white);white-space:pre-wrap">${escapeHtml(d.desc)}</p>` : '')
          + (tagList.length ? `<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">${tagList.map((t) => `<span class="arsip-badge">${escapeHtml(t)}</span>`).join('')}</div>` : '');
      })()}
      <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
        <button class="arsip-act ok" data-view="${escapeHtml(d.id)}">Lihat dokumen</button>
        <a class="arsip-act" href="${escapeHtml(d.url || '#')}" target="_blank" rel="noopener">Buka di tab baru</a>
      </div>
      <div id="arsipHistory" style="margin-top:10px;font-size:12px;color:var(--muted)">Memuat riwayat…</div>`;
    detail.innerHTML = html;
    loadHistory(id);
  }

  const ergErr = (r, fb) => (r.data && (r.data.error || r.data.message)) || fb;

  function updateSel() {
    if (!IS_ADMIN()) return;
    const cbs = Array.from(document.querySelectorAll('.arsip-cb'));
    const sel = cbs.filter((x) => x.checked);
    const s = $('arsipSel');
    if (s) s.textContent = sel.length ? sel.length + ' dipilih' : '';
    const all = $('arsipCbAll');
    if (all) all.checked = cbs.length > 0 && sel.length === cbs.length;
  }

  async function bulkAction(action) {
    if (!IS_ADMIN()) return;
    const ids = Array.from(document.querySelectorAll('.arsip-cb'))
      .filter((x) => x.checked)
      .map((x) => x.dataset.id)
      .filter(Boolean);
    if (!ids.length) return showToast('Pilih minimal 1 dokumen.', 'info');
    if (action === 'delete' && !confirm(`Hapus ${ids.length} dokumen terpilih? Tidak bisa dibatalkan.`)) return;
    const r = await apiSend('POST', '/api/arsip/docs/bulk', { action, ids });
    if (!r.ok) return showToast(ergErr(r, 'Gagal bulk'), 'error');
    showToast('Berhasil (' + (r.data?.affected || ids.length) + ').', 'success');
    loadArsipDocs(true);
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
      fr.onerror = () => reject(new Error('Gagal membaca berkas'));
      fr.readAsDataURL(file);
    });
  }

  // Opsi Kategori & Sektor untuk form unggah, diambil sekali dari master
  // arsipdigital lewat proxy. Gagal memuat tidak memblokir unggah: kolomnya
  // tetap teks bebas, <datalist> hanya menawarkan saran.
  async function isiOpsiUnggah() {
    if (isiOpsiUnggah.done) return;
    isiOpsiUnggah.done = true;
    const [kat, sek] = await Promise.all([
      apiGet('/api/arsip/p/api/kategori-dokumen'),
      apiGet('/api/arsip/p/api/sektor'),
    ]);
    isiDatalist('arsipKategoriList', kat);
    isiDatalist('arsipSektorList', sek);
  }

  function isiDatalist(id, r) {
    const box = $(id);
    if (!box) return;
    const arr = (r && Array.isArray(r.rows) && r.rows.length)
      ? r.rows : (Array.isArray(r && r.data) ? r.data : []);
    box.innerHTML = arr
      .map((x) => `<option value="${escapeHtml(x && x.nama != null ? x.nama : x)}">`)
      .join('');
  }

  function openUpload() {
    const m = $('arsipUploadModal');
    if (!m) return;
    const msg = $('arsipUploadMsg');
    if (msg) msg.textContent = '';
    m.style.display = 'flex';
    isiOpsiUnggah();
  }

  function closeUpload() {
    const m = $('arsipUploadModal');
    if (m) m.style.display = 'none';
  }

  async function onUploadSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const msg = $('arsipUploadMsg');
    const btn = $('arsipUploadSubmit');
    const say = (t) => { if (msg) msg.textContent = t || ''; };
    const file = fd.get('file');
    if (!file || !file.size) return say('Pilih berkas dulu.');
    const val = (k) => String(fd.get(k) ?? '').trim();
    say('Mengunggah berkas…');
    if (btn) btn.disabled = true;
    try {
      const dataBase64 = await fileToBase64(file);
      const up = await apiSend('POST', '/api/arsip/docs/upload-file', {
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        dataBase64,
      });
      if (!up.ok || !up.data?.url) throw new Error(ergErr(up, 'Gagal mengunggah berkas'));
      say('Menyimpan dokumen…');
      const prof = window.userProfile || {};
      const cr = await apiSend('POST', '/api/arsip/docs', {
        title: val('title'),
        type: val('type'),
        sector: val('sector'),
        bidang: val('bidang'),
        nomor_dokumen: val('nomor_dokumen'),
        tanggal_dokumen: val('tanggal_dokumen') || null,
        // peta menyimpan dua kolom ini (lihat POST /api/docs) dan GET-nya sudah
        // membalikkannya; tanpa ini arsipdigital punya deskripsi/tag, panel tidak.
        desc: val('desc'),
        tags: val('tags'),
        fileType: file.type || '',
        ukuran: (file.size / 1048576).toFixed(2) + ' MB',
        url: up.data.url,
        pages: 0,
        uploader_id: prof.nip || '',
        uploader: prof.nama || '',
        files: [{ fileId: up.data.fileId, name: file.name, url: up.data.url }],
      });
      if (!cr.ok) throw new Error(ergErr(cr, 'Gagal menyimpan dokumen'));
      showToast('Dokumen terunggah.', 'success');
      form.reset();
      closeUpload();
      loadArsipDocs(true);
    } catch (err) {
      say(err.message || 'Gagal mengunggah.');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function render() {
    const box = $('arsipList');
    if (!box) return;
    const q = $('arsipQuery') ? $('arsipQuery').value : '';
    const status = $('arsipStatus') ? $('arsipStatus').value : '';
    // Disinkronkan di sini juga, bukan cuma di applyView: render dipanggil ulang
    // setelah loadArsipMe() selesai, jadi flag IS_ADMIN baru terisi saat itu.
    syncChrome();
    if (failed) {
      box.innerHTML = '<div class="arsip-placeholder">Gagal memuat dokumen.'
        + ' <button class="arsip-act" data-retry>Coba lagi</button></div>';
      return;
    }
    const list = filterDocs(docs, q, status);
    const cnt = $('arsipCount');
    if (cnt) cnt.textContent = `${new Set(docs.map((d) => d.bidang).filter(Boolean)).size} bidang · ${list.length} dokumen`;
    const tileCnt = $('arsipTileCount');
    if (tileCnt) tileCnt.textContent = `${docs.length} dokumen`;
    if (!list.length) {
      box.innerHTML = loading && !loaded
        ? window.ArsipUI.skeleton('list', 5)
        : window.ArsipUI.empty('Tidak ada dokumen.');
      return;
    }
    let cb = '';
    if (IS_ADMIN()) {
      cb = '<div class="arsip-bulk-head"><label><input type="checkbox" id="arsipCbAll"> Pilih semua (terfilter)</label><span id="arsipSel"></span>'
        + '<div class="arsip-bulk-acts">'
        + '<button class="arsip-act ok" data-bulk="archive">Setujui terpilih</button>'
        + '<button class="arsip-act" data-bulk="publish">Publik terpilih</button>'
        + '<button class="arsip-act danger" data-bulk="delete">Hapus terpilih</button>'
        + '</div></div>';
    }
    const row = (d) => {
      const meta = [d.type, d.sector, d.year, d.versi ? 'v' + d.versi : '']
        .filter(Boolean)
        .map((x) => escapeHtml(x))
        .join(' · ');
      const sub = [d.uploader, d.uploadDate].filter(Boolean).map((x) => escapeHtml(x)).join(' · ');
      const chk = IS_ADMIN() ? `<input type="checkbox" class="arsip-cb" data-id="${escapeHtml(d.id)}">` : '';
      const ico = `<span class="arsip-ico" style="--ic:${window.ArsipUI.warnaFile(d)}"><i class="fas ${window.ArsipUI.ikonFile(d)}" aria-hidden="true"></i></span>`;
      const item = `<button type="button" class="arsip-item" data-detail="${escapeHtml(d.id)}">
          ${ico}
          <span class="arsip-item-body">
            <span class="arsip-item-top"><strong>${escapeHtml(d.title)}</strong>${badge(d.status)}</span>
            <span class="arsip-item-meta">${meta}</span>
            <span class="arsip-item-sub">${sub}</span>
          </span>
        </button>`;
      const acts = IS_ADMIN()
        ? actionsFor(d)
        : `<button class="arsip-act" data-detail="${escapeHtml(d.id)}">Detail</button>`;
      return `<div class="arsip-item-wrap"><div class="arsip-row">${chk}${item}</div>${acts}</div>`;
    };
    // dikelompokkan per bidang ("Tanpa Bidang" dulu, lalu A–Z)
    const groups = new Map();
    for (const d of list) {
      const k = String(d.bidang || '').trim() || 'Tanpa Bidang';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(d);
    }
    const names = [...groups.keys()].sort((a, b) =>
      ((b === 'Tanpa Bidang') - (a === 'Tanpa Bidang')) || a.localeCompare(b, 'id'));

    // ── tampilan utama: folder per bidang (file baru muncul setelah folder dibuka) ──
    if (view.folder === null) {
      box.innerHTML = `<div class="arsip-folders">` + names.map((name) => {
        const n = groups.get(name).length;
        return `<button class="arsip-folder" data-folder="${escapeHtml(name)}">`
          + `<span class="arsip-folder-ico"><i class="fas fa-folder" aria-hidden="true"></i></span>`
          + `<span class="arsip-folder-name">${escapeHtml(name)}</span>`
          + `<em>${n} dokumen</em></button>`;
      }).join('') + `</div>`;
      return;
    }

    // ── di dalam folder: tampilkan isinya saja ──
    if (!groups.has(view.folder)) { view.folder = null; return render(); }
    const back = `<button class="arsip-back-folder" data-folder-back>`
      + `<i class="fas fa-arrow-left" aria-hidden="true"></i> Semua Bidang</button>`
      + `<div class="arsip-folder-title"><i class="fas fa-folder" aria-hidden="true"></i> ${escapeHtml(view.folder)}`
      + `<em>${groups.get(view.folder).length} dokumen</em></div>`;
    box.innerHTML = cb + back + groups.get(view.folder).map(row).join('');
  }

  // Sekali saja per sesi: role arsip dari user_credentials arsipdigital.
  // Hati-hati: apiGet membalikan {ok, rows, data, status} — isi body ada di .data.
  // Membaca r.isAdmin langsung selalu undefined, jadi FAB hilang untuk semua orang.
  async function loadArsipMe() {
    if (meLoaded) return;
    try {
      const r = await apiGet('/api/arsip/me');
      const d = r && r.data;
      window.ARSIP_IS_ADMIN = Boolean(r && r.ok && d && d.isAdmin === true);
    } catch {
      window.ARSIP_IS_ADMIN = false;
    }
    meLoaded = true;
    // Sinkron segera begitu role diketahui — tidak menunggu render(), supaya FAB
    // tidak pernah tertinggal di "sembunyi" saat beranda dibuka duluan.
    syncChrome();
  }

  async function loadArsipDocs(force) {
    if ((loaded && !force) || loading) return;
    loading = true;
    failed = false;
    await loadArsipMe();
    render();
    try {
      const res = await apiGet('/api/arsip/docs');
      if (!res.ok) throw new Error('Gagal ' + res.status);
      docs = Array.isArray(res.rows) ? res.rows : [];
      loaded = true;
    } catch {
      failed = true;
    }
    loading = false;
    render();
  }

  function showFull() {
    const native = $('arsipNative');
    const frame = $('arsipFrame');
    if (!frame) return;
    if (native) native.style.display = 'none';
    frame.style.display = 'block';
    // Tampilan full (iframe): header & bottom nav disembunyikan, tombol Kembali muncul.
    window._arsipFull = true;
    document.body.classList.add('arsip-fs');
    if (frame.src) return;
    const url = (window.AppConfig && window.AppConfig.ARCHIVE_URL) || 'https://arsipdigital.mindcloud.my.id';
    let token = null;
    try {
      token = localStorage.getItem('_native_token');
    } catch {
      /* mode privat */
    }
    if (token && typeof apiPost === 'function') {
      apiPost('/api/auth/arsip-cookie', { session_token: token }).finally(() => {
        frame.src = url;
      });
    } else {
      frame.src = url;
    }
  }

  // Tutup iframe "Aplikasi lengkap" dan kembali ke daftar native (bottom nav terlihat lagi).
  function closeFull() {
    const native = $('arsipNative');
    const frame = $('arsipFrame');
    if (frame) frame.style.display = 'none';
    if (native) native.style.display = '';
    window._arsipFull = false;
    document.body.classList.remove('arsip-fs');
  }

  // Tombol Kembali: naik satu tingkat di panel; kalau sudah di beranda, baru keluar tab.
  function arsipBack() {
    if (window._arsipFull) return goArsip('home');
    if (view.view !== 'home' || view.folder || view.detail) return goArsip('back');
    switchTab(window._arsipPrevTab || 'absen');
  }

  async function onListClick(e) {
    const tile = e.target.closest('[data-tile]');
    if (tile) {
      e.preventDefault();
      return goArsip('tile:' + tile.dataset.tile);
    }
    const fol = e.target.closest('[data-folder]');
    if (fol) {
      e.preventDefault();
      return goArsip('folder:' + fol.dataset.folder);
    }
    const back = e.target.closest('[data-folder-back]');
    if (back) {
      e.preventDefault();
      return goArsip('folder-back');
    }
    const btn = e.target.closest('[data-act]');
    if (btn) {
      e.preventDefault();
      const { act, id } = btn.dataset;
      if (act === 'hapus') {
        if (!confirm('Hapus dokumen ini? Tindakan tidak bisa dibatalkan.')) return;
        const r = await apiSend('DELETE', '/api/arsip/docs/' + id);
        if (!r.ok) return showToast(ergErr(r, 'Gagal hapus'), 'error');
        showToast('Dokumen dihapus.', 'success');
        return loadArsipDocs(true);
      }
      let path = '/api/arsip/docs/' + id + '/status';
      let body;
      if (act === 'setujui') body = { status: 'Diarsipkan' };
      else if (act === 'tolak') {
        const note = prompt('Catatan penolakan (min. 5 karakter):');
        if (note === null) return;
        if (String(note || '').trim().length < 5) return showToast('Catatan minimal 5 karakter.', 'error');
        body = { status: 'Ditolak', note: note.trim() };
      } else if (act === 'publik') {
        path = '/api/arsip/docs/' + id + '/publik';
      }
      const r = await apiSend('PATCH', path, body);
      if (!r.ok) return showToast(ergErr(r, 'Gagal'), 'error');
      showToast(ergErr(r, 'Berhasil.'), 'success');
      return loadArsipDocs(true);
    }

    const bb = e.target.closest('[data-bulk]');
    if (bb) {
      e.preventDefault();
      return bulkAction(bb.dataset.bulk);
    }

    const rt = e.target.closest('[data-retry]');
    if (rt) {
      e.preventDefault();
      return loadArsipDocs(true);
    }
    const vw = e.target.closest('[data-view]');
    if (vw) {
      e.preventDefault();
      return openPreview(vw.dataset.view);
    }
    const dt = e.target.closest('[data-detail]');
    if (dt) {
      e.preventDefault();
      return goArsip('detail:' + dt.dataset.detail);
    }
    const cls = e.target.closest('[data-close-detail]');
    if (cls) {
      e.preventDefault();
      return goArsip('detail-close');
    }

    const cb = e.target.closest('.arsip-cb');
    if (cb) return updateSel();

    const all = e.target.closest('#arsipCbAll');
    if (all) {
      document.querySelectorAll('.arsip-cb').forEach((x) => {
        x.checked = all.checked;
      });
      return updateSel();
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const q = $('arsipQuery');
    if (q) q.addEventListener('input', render);
    const st = $('arsipStatus');
    if (st) st.addEventListener('change', render);
    const listEl = $('arsipList');
    if (listEl) listEl.addEventListener('click', onListClick);
    const homeEl = $('arsipHome');
    if (homeEl) homeEl.addEventListener('click', onListClick);
    // #arsipDetail itu SIBLING #arsipList di dalam #arsipDokumen, bukan anaknya.
    // Tombol "Lihat dokumen" (data-view) dan "Tutup" (data-close-detail) ada di
    // dalamnya; tanpa ikatan ini keduanya diam total (klik tidak melakukan apa pun).
    const detailEl = $('arsipDetail');
    if (detailEl) detailEl.addEventListener('click', onListClick);
    const pvClose = $('arsipPreviewClose');
    if (pvClose) pvClose.addEventListener('click', closePreview);
    const pv = $('arsipPreview');
    if (pv) pv.addEventListener('click', (e) => {
      if (e.target === pv) closePreview();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePreview();
    });
    const pvOpen = $('arsipPreviewOpen');
    if (pvOpen) pvOpen.addEventListener('click', closePreview);
    const pvDl = $('arsipPreviewDl');
    if (pvDl) pvDl.addEventListener('click', (e) => { e.stopPropagation(); });
    const full = $('arsipFullBtn');
    if (full) full.addEventListener('click', showFull);
    const upBtn = $('arsipUploadBtn');
    if (upBtn) {
      // visibilitas diatur render() sesuai IS_ADMIN (sudah ada setelah login); listener tetap dipasang
      upBtn.addEventListener('click', openUpload);
    }
    const uf = $('arsipUploadForm');
    if (uf) uf.addEventListener('submit', onUploadSubmit);
    const um = $('arsipUploadModal');
    if (um) um.addEventListener('click', (e) => {
      if (e.target.closest('[data-upload-close]')) closeUpload();
    });
    // Dropzone unggah: input berkas asli disembunyikan, kotaknya yang menampilkan
    // daftar file (nama + ukuran) supaya tampilannya sama dengan modal arsipdigital.
    const pick = $('arsipPick');
    const fileIn = $('arsipUploadFile');
    const drop = $('arsipDrop');
    const dropList = $('arsipDropList');
    const showFiles = () => {
      if (!dropList || !fileIn) return;
      dropList.innerHTML = Array.from(fileIn.files || [])
        .map((f) => `<li><i class="fas fa-file-alt" aria-hidden="true"></i><span>${escapeHtml(f.name)}</span>`
          + `<span class="size">${(f.size / 1048576).toFixed(1)} MB</span></li>`)
        .join('');
    };
    if (pick && fileIn) pick.addEventListener('click', () => fileIn.click());
    if (drop && fileIn) {
      drop.addEventListener('click', (e) => {
        if (e.target.closest('button, li')) return;
        fileIn.click();
      });
      fileIn.addEventListener('change', showFiles);
      ['dragover', 'dragenter'].forEach((t) => drop.addEventListener(t, (e) => {
        e.preventDefault();
        drop.classList.add('drag');
      }));
      ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => {
        e.preventDefault();
        drop.classList.remove('drag');
      }));
      drop.addEventListener('drop', (e) => {
        const fs = e.dataTransfer && e.dataTransfer.files;
        if (!fs || !fs.length || typeof window.DataTransfer === 'undefined') return;
        const dt = new window.DataTransfer();
        Array.from(fs).forEach((f) => dt.items.add(f));
        fileIn.files = dt.files;
        showFiles();
      });
    }
    applyView();
    if (document.querySelector('#panel-arsip.active')) loadArsipDocs();
  });

  window.loadArsipDocs = loadArsipDocs;
  window.arsipBack = arsipBack;
  window.arsipReset = () => goArsip('home');
  window.ARSIP = {
    filterDocs, showFull, closeFull, openDetail, closeDetail, openUpload, closeUpload,
    goArsip, openPreview, closePreview, previewDocById, IS_ADMIN,
  };
})();