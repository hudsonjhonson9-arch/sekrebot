/* ════ ADMIN CORE — logika admin bersama (desktop admin.html + mobile index.html#admin) ════
 *
 * Satu sumber untuk: monitoring presensi hari ini, persetujuan keterangan
 * (ket_temp), dan pengaturan lokasi/geofence. Dua halaman hanya menyediakan markup
 * dengan id yang sama; tampilan menyesuaikan lebar layar secara dinamis:
 *   - layar >= 768px : baris tabel (6 kolom)
 *   - layar  < 768px : kartu ringkas di dalam <tbody> (colspan penuh)
 * Perpindahan antar halaman (autoRoute): HP -> index.html#admin, desktop -> admin.html,
 * bisa dipaksa lewat AdminCore.setMode('desktop' | 'mobile' | null).
 *
 * Token sesi ditambahkan otomatis oleh js/stitch-auth.js (wajib dimuat lebih dulu).
 */
(function (w) {
  'use strict';
  if (w.AdminCore) return;

  const MODE_KEY = 'stitch_admin_mode';           // 'desktop' | 'mobile' | kosong = otomatis
  const STATUS = { PENDING: 'PENDING', OK: 'DISETUJUI', NO: 'DITOLAK' };

  /* ── util ─────────────────────────────────────────────────────────── */
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
  const el = (id) => document.getElementById(id);
  const wide = () => w.matchMedia('(min-width: 768px)').matches;

  // Status lama dari admin.html (APPROVED/REJECTED) disamakan dengan nilai DB.
  function normStatus(s) {
    const v = String(s || '').trim().toUpperCase();
    if (v === 'APPROVED') return STATUS.OK;
    if (v === 'REJECTED') return STATUS.NO;
    return v || STATUS.PENDING;
  }

  // Hanya http(s) atau path upload lokal; cegah javascript: pada drive_link.
  function safeUrl(u) {
    const v = String(u || '').trim();
    return /^(https?:\/\/|\/uploads\/)/i.test(v) ? v : '';
  }

  function notify(type, title, message) {
    if (typeof w.showDynamicIsland === 'function') {
      w.showDynamicIsland({ type, title, message });
    } else if (w.Swal) {
      w.Swal.fire(title, message, type === 'error' ? 'error' : type === 'success' ? 'success' : 'info');
    } else {
      alert(title + '\n' + message);
    }
  }

  async function api(path, opts) {
    const res = await fetch('/api/stitch' + path, opts);
    let json = null;
    try { json = await res.json(); } catch (_) { /* body bukan JSON */ }
    if (res.status === 401) throw new Error('Sesi berakhir. Silakan login ulang.');
    if (res.status === 403) throw new Error('Akses ditolak: fitur ini hanya untuk Administrator.');
    if (!res.ok || !json || json.ok === false) {
      throw new Error((json && json.message) || ('HTTP ' + res.status));
    }
    return json;
  }

  /* ── mode / routing ───────────────────────────────────────────────── */
  function getMode() {
    let pref = null;
    try { pref = localStorage.getItem(MODE_KEY); } catch (_) {}
    if (pref === 'desktop' || pref === 'mobile') return pref;
    return w.matchMedia('(min-width: 768px)').matches ? 'desktop' : 'mobile';
  }

  // 'desktop' | 'mobile' | 'auto' (ikuti lebar layar). null/lainnya = default (mobile).
  function setMode(mode) {
    try {
      if (mode === 'desktop' || mode === 'mobile' || mode === 'auto') localStorage.setItem(MODE_KEY, mode);
      else localStorage.removeItem(MODE_KEY);
    } catch (_) {}
  }

  // page: 'desktop' (admin.html) atau 'mobile' (index.html#admin).
  // Default: TIDAK mengalihkan; admin.html tetap admin.html (refresh tetap di sini) dan
  // tampilannya menyesuaikan lebar layar. Peralihan hanya bila dipilih eksplisit:
  // 'mobile' -> index.html#admin, 'desktop' -> admin.html, 'auto' -> ikut lebar layar.
  function autoRoute(page) {
    let pref = null;
    try { pref = localStorage.getItem(MODE_KEY); } catch (_) {}
    const auto = pref === 'auto';
    if (page === 'desktop') {
      if (pref === 'mobile' || (auto && w.matchMedia('(max-width: 767px)').matches)) {
        location.replace('index.html#admin');
        return true;
      }
    } else if (page === 'mobile') {
      if (pref === 'desktop' || (auto && w.matchMedia('(min-width: 1024px)').matches)) {
        location.replace('admin.html');
        return true;
      }
    }
    return false;
  }

  /* ── renderer ─────────────────────────────────────────────────────── */
  function avatar(u) {
    const ini = String(u.nama || 'P').split(/\s+/).filter((p) => !p.includes('.')).slice(0, 2)
      .map((p) => p[0]).join('').toUpperCase() || 'P';
    const resolved = typeof w.resolveBioImageSrc === 'function'
      ? w.resolveBioImageSrc(u.face_photo)
      : safeUrl(u.face_photo);
    const photo = resolved && (/^(\/api\/media\/raw\/|\/uploads\/|https?:|data:image\/)/i.test(resolved))
      ? resolved
      : '';
    if (photo) {
      return `<div class="w-8 h-8 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700 bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[11px] font-mono flex-shrink-0">
        <img src="${esc(photo)}" class="w-full h-full object-cover" alt="" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.classList.remove('hidden');">
        <span class="hidden">${esc(ini)}</span>
      </div>`;
    }
    return `<div class="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[11px] font-mono flex-shrink-0">${esc(ini)}</div>`;
  }

  const KET_BADGE = {
    DISETUJUI: 'bg-emerald-100 text-emerald-800',
    DITOLAK: 'bg-rose-100 text-rose-800',
    PENDING: 'bg-amber-100 text-amber-800',
  };

  function ketActions(k) {
    if (k.status !== STATUS.PENDING) return '<span class="text-slate-400 text-[11px]">Selesai</span>';
    const id = esc(k.id_ket);
    return `<div class="inline-flex items-center gap-1.5">
      <button type="button" data-ket-id="${id}" data-ket-status="${STATUS.OK}" class="min-h-[40px] px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold active:scale-95 cursor-pointer">Setujui</button>
      <button type="button" data-ket-id="${id}" data-ket-status="${STATUS.NO}" class="min-h-[40px] px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold active:scale-95 cursor-pointer">Tolak</button>
    </div>`;
  }

  function ketRow(k, isWide) {
    const rentang = (k.tgl_mulai && k.tgl_selesai)
      ? `${esc(k.tgl_mulai)} s/d ${esc(k.tgl_selesai)}` : esc(k.tanggal || 'Hari ini');
    const link = safeUrl(k.drive_link);
    const bukti = link
      ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline text-[11px]">Lampiran bukti</a>`
      : '<span class="text-slate-400 text-[11px]">Tanpa lampiran</span>';
    const badge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 whitespace-nowrap ${KET_BADGE[k.status] || KET_BADGE.PENDING}">${esc(k.status)}</span>`;

    if (!isWide) {
      return `<tr><td colspan="6" class="py-2 px-0"><div class="w-full max-w-full overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 p-3 flex flex-col gap-2">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0 flex-1"><p class="font-bold text-sm truncate">${esc(k.nama)}</p><p class="text-[10px] text-slate-400 font-mono truncate">${esc(k.nip)}</p></div>
          ${badge}
        </div>
        <div class="text-[11px] break-words"><span class="font-bold text-blue-600">${esc(String(k.jenis || '').toUpperCase())}</span> • <span class="font-mono">${rentang}</span></div>
        <p class="text-[12px] text-slate-600 dark:text-slate-300 break-words">${esc(k.keterangan || '-')}</p>
        <div class="flex flex-wrap items-center justify-between gap-2">${bukti}${ketActions(k)}</div>
      </div></td></tr>`;
    }
    return `<tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border-b border-slate-100">
      <td class="p-3"><p class="font-bold">${esc(k.nama)}</p><p class="text-[10px] text-slate-400 font-mono">${esc(k.nip)}</p></td>
      <td class="p-3 font-bold text-blue-600">${esc(String(k.jenis || '').toUpperCase())}</td>
      <td class="p-3 font-mono text-[11px]">${rentang}</td>
      <td class="p-3 max-w-xs"><p class="truncate" title="${esc(k.keterangan || '')}">${esc(k.keterangan || '-')}</p>${bukti}</td>
      <td class="p-3">${badge}</td>
      <td class="p-3 text-right">${ketActions(k)}</td>
    </tr>`;
  }

  function monRow(u, isWide) {
    const badge = `<span class="px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0 whitespace-nowrap ${esc(u.statusBadge)}">${esc(u.statusText)}</span>`;
    if (!isWide) {
      return `<tr><td colspan="6" class="py-2 px-0"><div class="w-full max-w-full overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 p-3 flex items-center gap-3">
        ${avatar(u)}
        <div class="min-w-0 flex-1"><p class="font-bold text-sm truncate">${esc(u.nama)}</p>
          <p class="text-[10px] text-slate-400 truncate">${esc(u.bidang || 'BAPPERIDA')} • ${esc(u.jabatan || 'Aparatur')}</p>
          <p class="text-[11px] font-mono mt-0.5 break-words">${esc(u.jamMasuk)} – ${esc(u.jamPulang)} • ${esc(u.lokasi)}</p></div>
        ${badge}
      </div></td></tr>`;
    }
    return `<tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
      <td class="p-3"><div class="flex items-center gap-2">${avatar(u)}<div><p class="font-bold">${esc(u.nama)}</p><p class="text-[10px] text-slate-400 font-mono">${esc(u.nip)}</p></div></div></td>
      <td class="p-3"><p class="font-semibold">${esc(u.bidang || 'BAPPERIDA')}</p><p class="text-[10px] text-slate-400">${esc(u.jabatan || 'Aparatur')}</p></td>
      <td class="p-3 font-mono font-bold">${esc(u.jamMasuk)}</td>
      <td class="p-3 font-mono font-bold">${esc(u.jamPulang)}</td>
      <td class="p-3">${esc(u.lokasi)}</td>
      <td class="p-3">${badge}</td>
    </tr>`;
  }

  /* ── data & aksi ──────────────────────────────────────────────────── */
  const cache = { ket: null, mon: null };

  function syncTableHead(tbody, isWide) {
    const table = tbody && tbody.closest && tbody.closest('table');
    const thead = table && table.querySelector('thead');
    if (thead) thead.style.display = isWide ? '' : 'none';
  }

  function renderKeterangan() {
    const tbody = el('adminKeteranganTableBody');
    if (!tbody || !cache.ket) return;
    const isWide = wide();
    syncTableHead(tbody, isWide);
    const items = cache.ket;
    const pill = el('adminPendingCount');
    if (pill) pill.textContent = `Semua (${items.length}) • Pending (${items.filter((k) => k.status === STATUS.PENDING).length})`;
    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-slate-400">Tidak ada pengajuan keterangan.</td></tr>';
      return;
    }
    tbody.innerHTML = items.slice(0, 50).map((k) => ketRow(k, isWide)).join('');
  }

  function renderMonitoring() {
    const tbody = el('adminMonitoringTableBody');
    if (!tbody || !cache.mon) return;
    const isWide = wide();
    syncTableHead(tbody, isWide);
    const { summary: s, data } = cache.mon;
    const set = (id, txt) => { const e = el(id); if (e) e.textContent = txt; };
    set('monBadgeHadir', `Hadir: ${s.hadir}`);
    set('monBadgeIzin', `Izin/Cuti: ${s.izin}`);
    set('monBadgeBelum', `Belum: ${s.belum}`);
    tbody.innerHTML = data.map((u) => monRow(u, isWide)).join('')
      || '<tr><td colspan="6" class="p-6 text-center text-slate-400">Belum ada data pegawai.</td></tr>';
  }

  function showError(tbodyId, err) {
    const tbody = el(tbodyId);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-rose-500 font-bold">${esc(err.message)}</td></tr>`;
    }
  }

  async function loadKeterangan() {
    try {
      const json = await api('/keterangan');
      cache.ket = (json.data || []).map((k) => Object.assign({}, k, { status: normStatus(k.status) }));
      renderKeterangan();
    } catch (err) { showError('adminKeteranganTableBody', err); }
  }

  async function loadMonitoring() {
    try {
      const json = await api('/admin/monitoring-today');
      cache.mon = { summary: json.summary, data: json.data || [] };
      renderMonitoring();
    } catch (err) { showError('adminMonitoringTableBody', err); }
  }

  async function approve(idKet, status) {
    const next = normStatus(status);
    if (next !== STATUS.OK && next !== STATUS.NO) return false;
    const label = next === STATUS.OK ? 'menyetujui' : 'menolak';
    let confirmed;
    if (w.Swal) {
      const r = await w.Swal.fire({ title: 'Konfirmasi', text: `Yakin ingin ${label} permohonan ini?`, icon: 'question', showCancelButton: true, confirmButtonText: 'Ya', cancelButtonText: 'Batal' });
      confirmed = r.isConfirmed;
    } else {
      confirmed = confirm(`Yakin ingin ${label} permohonan ini?`);
    }
    if (!confirmed) return false;
    try {
      const json = await api('/keterangan/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_ket: idKet, status: next }),
      });
      notify('success', 'Berhasil', json.message || 'Status diperbarui.');
      await loadKeterangan();
      return true;
    } catch (err) {
      notify('error', 'Gagal', err.message);
      return false;
    }
  }

  // Lokasi/geofence dari DB (lokasiabsen). Dipakai mengisi form di kedua halaman.
  async function loadLokasi() {
    const json = await api('/bootstrap');
    return { locations: json.locations || [], shift: json.shift || null };
  }

  async function saveLokasi({ id, lat, lon, radius }) {
    const la = parseFloat(lat), lo = parseFloat(lon), r = parseInt(radius, 10);
    if (!Number.isFinite(la) || la < -90 || la > 90) { notify('error', 'Latitude tidak valid', 'Isi angka antara -90 dan 90.'); return false; }
    if (!Number.isFinite(lo) || lo < -180 || lo > 180) { notify('error', 'Longitude tidak valid', 'Isi angka antara -180 dan 180.'); return false; }
    if (!Number.isFinite(r) || r < 10 || r > 500) { notify('error', 'Radius tidak valid', 'Isi antara 10 dan 500 meter.'); return false; }
    try {
      const json = await api('/admin-lokasi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: String(id || '1'), latitude: la, longitude: lo, radius: r }),
      });
      notify('success', 'Tersimpan di Database', json.message || 'Lokasi diperbarui.');
      return true;
    } catch (err) {
      notify('error', 'Gagal menyimpan', err.message);
      return false;
    }
  }

  async function saveJamAbsen({ masuk, pulang }) {
    const m = String(masuk || '').trim(), p = String(pulang || '').trim();
    if (!/^\d{2}:\d{2}$/.test(m) || !/^\d{2}:\d{2}$/.test(p)) {
      notify('error', 'Format Jam Tidak Valid', 'Gunakan format HH:MM (contoh 07:15 dan 14:30).');
      return false;
    }
    try {
      const json = await api('/admin-jam-absen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ masuk: m, pulang: p }),
      });
      notify('success', 'Jam Kerja Tersimpan', json.message || 'Jadwal kerja diperbarui.');
      return true;
    } catch (err) {
      notify('error', 'Gagal menyimpan jam kerja', err.message);
      return false;
    }
  }

  async function addLibur({ tanggal, nama }) {
    const t = String(tanggal || '').trim(), n = String(nama || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || !n) {
      notify('error', 'Data Libur Belum Lengkap', 'Pilih tanggal dan isi keterangan hari libur.');
      return null;
    }
    try {
      const json = await api('/admin-libur', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tanggal: t, nama: n }),
      });
      notify('success', 'Hari Libur Tersimpan', json.message || 'Kalender libur diperbarui.');
      return json.holidays || [];
    } catch (err) {
      notify('error', 'Gagal menambah libur', err.message);
      return null;
    }
  }

  async function deleteLibur(tanggal) {
    try {
      const json = await api('/admin-libur/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tanggal: String(tanggal || '').trim() }),
      });
      notify('success', 'Hari Libur Dihapus', json.message || 'Tanggal libur dihapus.');
      return json.holidays || [];
    } catch (err) {
      notify('error', 'Gagal menghapus libur', err.message);
      return null;
    }
  }

  /* ── event: tombol Setujui/Tolak (delegasi, aman dari injeksi onclick) ── */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('[data-ket-id]');
    if (!btn) return;
    approve(btn.getAttribute('data-ket-id'), btn.getAttribute('data-ket-status'));
  });

  // Render ulang saat layar melewati 768px (rotasi HP, resize jendela).
  const mq = w.matchMedia('(min-width: 768px)');
  const rerender = () => { renderKeterangan(); renderMonitoring(); };
  if (mq.addEventListener) mq.addEventListener('change', rerender);
  else if (mq.addListener) mq.addListener(rerender);

  w.AdminCore = {
    loadKeterangan, loadMonitoring, approve, loadLokasi, saveLokasi,
    saveJamAbsen, addLibur, deleteLibur,
    getMode, setMode, autoRoute, normStatus,
    refresh() { return Promise.all([loadMonitoring(), loadKeterangan()]); },
  };
})(window);
