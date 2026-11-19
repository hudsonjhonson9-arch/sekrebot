/* Stitch Admin Rekap Kehadiran Semua Pegawai: Rentang/Bulanan + Harian + Preview Berkop/Paraf/TTD + PDF F4 + Excel (.xlsx) */
(function (w, d) {
  'use strict';

  let _mode = 'range'; // 'range' | 'harian' | 'logs'
  let _inited = false;
  let _logModalInited = false;
  let _rangePayload = null;
  let _harianPayload = null;
  let _logsList = [];

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function todayWitaIso() {
    return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  }

  function fmtIndo(iso) {
    if (!iso) return '-';
    const dt = new Date(iso + 'T00:00:00');
    if (isNaN(dt.getTime())) return iso;
    return dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function fmtIndoFull(iso) {
    if (!iso) return '-';
    const dt = new Date(iso + 'T00:00:00');
    if (isNaN(dt.getTime())) return iso;
    return dt.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  function resolveImg(raw) {
    if (!raw) return '';
    if (typeof w.resolveBioImageSrc === 'function') return w.resolveBioImageSrc(raw);
    return String(raw).startsWith('data:image') ? raw : '';
  }

  function initAdminRekapPanel() {
    if (!_inited) {
      _inited = true;
      if (w.StitchPicker && typeof w.StitchPicker.enhanceDate === 'function') {
        w.StitchPicker.enhanceDate('adminRekapDari', { placeholder: 'Dari tanggal' });
        w.StitchPicker.enhanceDate('adminRekapSampai', { placeholder: 'Sampai tanggal' });
        w.StitchPicker.enhanceDate('adminRekapTanggalHarian', { placeholder: 'Tanggal hadir' });
      }
      const today = todayWitaIso();
      const tglH = d.getElementById('adminRekapTanggalHarian');
      if (tglH && !tglH.value) tglH.value = today;
      setAdminRekapPreset('bulan_ini', false);
      if (w.StitchPicker && typeof w.StitchPicker.refreshAll === 'function') {
        w.StitchPicker.refreshAll();
      }
    }
    loadAdminRekapData();
  }

  function setAdminRekapMode(mode) {
    _mode = (mode === 'harian' || mode === 'logs') ? mode : 'range';
    const bR = d.getElementById('btnAdminRekapModeRange');
    const bH = d.getElementById('btnAdminRekapModeHarian');
    const bL = d.getElementById('btnAdminRekapModeLogs');
    const cR = d.getElementById('adminRekapControlsRange');
    const cH = d.getElementById('adminRekapControlsHarian');

    const activeCls = 'min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white shadow-xs transition-all cursor-pointer';
    const idleCls = 'min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 transition-all cursor-pointer';
    if (bR) bR.className = _mode === 'range' ? activeCls : idleCls;
    if (bH) bH.className = _mode === 'harian' ? activeCls : idleCls;
    if (bL) bL.className = _mode === 'logs' ? activeCls : idleCls;

    if (cR) cR.classList.toggle('hidden', _mode === 'harian');
    if (cH) {
      cH.classList.toggle('hidden', _mode !== 'harian');
      cH.classList.toggle('grid', _mode === 'harian');
    }
    loadAdminRekapData();
  }

  function setAdminRekapPreset(preset, autoLoad = true) {
    const today = todayWitaIso();
    const [y, m, day] = today.split('-').map(Number);
    const pad = (n) => String(n).padStart(2, '0');
    let dari = today;
    let sampai = today;
    if (preset === 'minggu_ini') {
      const dt = new Date(Date.UTC(y, m - 1, day));
      const dow = (dt.getUTCDay() + 6) % 7;
      dt.setUTCDate(dt.getUTCDate() - dow);
      dari = `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
    } else if (preset === 'bulan_ini') {
      dari = `${y}-${pad(m)}-01`;
    }
    const elD = d.getElementById('adminRekapDari');
    const elS = d.getElementById('adminRekapSampai');
    if (elD) elD.value = dari;
    if (elS) elS.value = sampai;
    if (w.StitchPicker && typeof w.StitchPicker.refreshAll === 'function') {
      w.StitchPicker.refreshAll();
    }
    if (autoLoad) loadAdminRekapData();
  }

  async function loadAdminRekapData() {
    const box = d.getElementById('adminRekapListContainer');
    const sumBar = d.getElementById('adminRekapSummaryBar');
    if (box) box.innerHTML = '<div class="p-8 text-center text-xs text-slate-400">Memuat data rekap seluruh pegawai...</div>';
    try {
      if (_mode === 'range') {
        const dari = d.getElementById('adminRekapDari')?.value || todayWitaIso();
        const sampai = d.getElementById('adminRekapSampai')?.value || dari;
        const res = await fetch(`/api/stitch/rekap-range?dari=${encodeURIComponent(dari)}&sampai=${encodeURIComponent(sampai)}`);
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.message || 'Gagal memuat rekap rentang.');
        _rangePayload = json;
        renderAdminRekapList();
      } else if (_mode === 'logs') {
        const dari = d.getElementById('adminRekapDari')?.value || todayWitaIso();
        const sampai = d.getElementById('adminRekapSampai')?.value || dari;
        const headers = {};
        if (typeof w.getStitchToken === 'function' && w.getStitchToken()) {
          headers.Authorization = 'Bearer ' + w.getStitchToken();
        }
        const res = await fetch(`/api/log?dari=${encodeURIComponent(dari)}&sampai=${encodeURIComponent(sampai)}`, { headers });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.message || 'Gagal memuat log presensi.');
        _logsList = (json.rows || json.data || []).filter((r) => {
          const t = String(r.Tanggal || r.tanggal || '').slice(0, 10);
          return (!dari || t >= dari) && (!sampai || t <= sampai);
        });
        renderAdminRekapList();
      } else {
        const tanggal = d.getElementById('adminRekapTanggalHarian')?.value || todayWitaIso();
        const res = await fetch(`/api/stitch/rekap-harian?tanggal=${encodeURIComponent(tanggal)}`);
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.message || 'Gagal memuat daftar hadir harian.');
        _harianPayload = json;
        renderAdminRekapList();
      }
    } catch (err) {
      if (sumBar) sumBar.innerHTML = '';
      if (box) box.innerHTML = `<div class="p-6 text-center text-xs text-rose-500 font-bold">${esc(err.message)}</div>`;
    }
  }

  function getFilteredRows() {
    const q = (_mode === 'harian'
      ? (d.getElementById('adminRekapSearchHarian')?.value || '')
      : (d.getElementById('adminRekapSearch')?.value || '')
    ).trim().toLowerCase();
    const list = _mode === 'range'
      ? (_rangePayload?.data || [])
      : (_mode === 'logs' ? _logsList : (_harianPayload?.data || []));
    if (!q) return list;
    return list.filter((r) =>
      String(r.nama || r.Nama || '').toLowerCase().includes(q)
      || String(r.nip || r.NIP || '').toLowerCase().includes(q)
      || String(r.jabatan || r['Jenis Absen'] || r.Ket || '').toLowerCase().includes(q)
    );
  }

  function filterAdminRekapList() {
    renderAdminRekapList();
  }

  function renderAdminRekapList() {
    const box = d.getElementById('adminRekapListContainer');
    const sumBar = d.getElementById('adminRekapSummaryBar');
    if (!box) return;
    const rows = getFilteredRows();
    const isWide = w.matchMedia('(min-width: 768px)').matches;

    if (_mode === 'range') {
      const p = _rangePayload;
      if (sumBar && p) {
        const totHadir = rows.reduce((a, r) => a + (r.hadir || 0), 0);
        const totAlpa = rows.reduce((a, r) => a + (r.alpa || 0), 0);
        const totTelat = rows.reduce((a, r) => a + (r.lambat_count || 0), 0);
        sumBar.innerHTML = `
          <span class="px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold">${rows.length} Pegawai</span>
          <span class="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold">${p.hariKerja || 0} Hari Kerja</span>
          <span class="px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold">Total Hadir: ${totHadir}</span>
          <span class="px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-bold">Telat: ${totTelat}</span>
          <span class="px-3 py-1 rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold">Alpa: ${totAlpa}</span>
        `;
      }
      if (!rows.length) {
        box.innerHTML = '<div class="p-8 text-center text-xs text-slate-400">Tidak ada data pegawai yang cocok.</div>';
        return;
      }
      if (!isWide) {
        box.innerHTML = `<div class="space-y-2.5">${rows.map((r) => `
          <div class="rounded-2xl border border-slate-200 dark:border-slate-700 p-3.5 bg-slate-50/70 dark:bg-slate-800/40 space-y-2">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="text-xs font-bold text-slate-900 dark:text-white truncate">${esc(r.nama)}</p>
                <p class="text-[10px] font-mono text-slate-400">${esc(r.nip || '-')}</p>
              </div>
              <span class="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold shrink-0">Hadir ${r.hadir || 0}</span>
            </div>
            <div class="grid grid-cols-4 gap-1.5 text-center text-[10px]">
              <div class="p-1.5 rounded-lg bg-white dark:bg-slate-900"><span class="font-bold text-amber-600 block">${r.lambat_count || 0}</span>Telat</div>
              <div class="p-1.5 rounded-lg bg-white dark:bg-slate-900"><span class="font-bold text-blue-600 block">${(r.izin || 0) + (r.sakit || 0)}</span>I/S</div>
              <div class="p-1.5 rounded-lg bg-white dark:bg-slate-900"><span class="font-bold text-indigo-600 block">${(r.tugas || 0) + (r.cuti || 0)}</span>DL/C</div>
              <div class="p-1.5 rounded-lg bg-white dark:bg-slate-900"><span class="font-bold text-rose-600 block">${r.alpa || 0}</span>Alpa</div>
            </div>
          </div>
        `).join('')}</div>`;
      } else {
        box.innerHTML = `
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase font-bold sticky top-0">
              <tr>
                <th class="p-2.5 rounded-l-xl">No</th>
                <th class="p-2.5">Nama / NIP</th>
                <th class="p-2.5 text-center">H</th>
                <th class="p-2.5 text-center">I</th>
                <th class="p-2.5 text-center">S</th>
                <th class="p-2.5 text-center">DL</th>
                <th class="p-2.5 text-center">C</th>
                <th class="p-2.5 text-center">TB</th>
                <th class="p-2.5 text-center">Alpa</th>
                <th class="p-2.5 text-center rounded-r-xl">Telat (Mnt)</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              ${rows.map((r, i) => `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td class="p-2.5 font-mono text-slate-400">${i + 1}</td>
                  <td class="p-2.5"><p class="font-bold text-slate-900 dark:text-white">${esc(r.nama)}</p><p class="text-[10px] font-mono text-slate-400">${esc(r.nip || '-')}</p></td>
                  <td class="p-2.5 text-center font-bold text-emerald-600 tabular-nums">${r.hadir || 0}</td>
                  <td class="p-2.5 text-center tabular-nums">${r.izin || 0}</td>
                  <td class="p-2.5 text-center tabular-nums">${r.sakit || 0}</td>
                  <td class="p-2.5 text-center tabular-nums">${r.tugas || 0}</td>
                  <td class="p-2.5 text-center tabular-nums">${r.cuti || 0}</td>
                  <td class="p-2.5 text-center tabular-nums">${r.tubel || 0}</td>
                  <td class="p-2.5 text-center font-bold text-rose-600 tabular-nums">${r.alpa || 0}</td>
                  <td class="p-2.5 text-center font-mono tabular-nums">${r.lambat_count || 0} (${r.menit_terlambat || 0}m)</td>
                </tr>
              `).join('')}
            </tbody>
          </table>`;
      }
      return;
    }

    if (_mode === 'logs') {
      if (sumBar) {
        sumBar.innerHTML = `<span class="px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold">${rows.length} Baris Log Presensi</span>`;
      }
      if (!rows.length) {
        box.innerHTML = '<div class="p-8 text-center text-xs text-slate-400">Belum ada log presensi pada rentang tanggal ini. Klik <strong>Tambah Log</strong> untuk mencatat manual.</div>';
        return;
      }
      if (!isWide) {
        box.innerHTML = `<div class="space-y-2.5">${rows.slice(0, 120).map((r) => {
          const logId = esc(r.ID_Log || r.id_log || '');
          const jenis = esc(r['Jenis Absen'] || r.jenis || '-');
          return `
            <div class="rounded-2xl border border-slate-200 dark:border-slate-700 p-3.5 bg-slate-50/70 dark:bg-slate-800/40 space-y-2">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="text-xs font-bold text-slate-900 dark:text-white truncate">${esc(r.Nama || r.nama || '-')}</p>
                  <p class="text-[10px] font-mono text-slate-400">${esc(r.NIP || r.nip || '-')}</p>
                </div>
                <span class="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[10px] font-bold shrink-0">${jenis}</span>
              </div>
              <div class="flex items-center justify-between text-[11px] font-mono text-slate-600 dark:text-slate-300">
                <span>${esc(String(r.Tanggal || '').slice(0, 10))} • ${esc(r.Jam || '-')} WITA</span>
                <button type="button" onclick="openAdminLogEditById('${logId}')" class="min-h-[34px] px-3 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer">
                  <span class="material-symbols-outlined text-[14px]">edit</span>
                  <span>Edit</span>
                </button>
              </div>
              ${r.Ket ? `<p class="text-[11px] text-slate-500 break-words">${esc(r.Ket)}</p>` : ''}
            </div>`;
        }).join('')}</div>`;
      } else {
        box.innerHTML = `
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase font-bold sticky top-0">
              <tr>
                <th class="p-2.5 rounded-l-xl">Tanggal</th>
                <th class="p-2.5">Jam</th>
                <th class="p-2.5">Pegawai / NIP</th>
                <th class="p-2.5">Jenis Absen</th>
                <th class="p-2.5">Keterangan</th>
                <th class="p-2.5 text-right rounded-r-xl">Aksi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              ${rows.slice(0, 150).map((r) => {
                const logId = esc(r.ID_Log || r.id_log || '');
                return `
                  <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td class="p-2.5 font-mono">${esc(String(r.Tanggal || '').slice(0, 10))}</td>
                    <td class="p-2.5 font-mono font-bold">${esc(r.Jam || '-')}</td>
                    <td class="p-2.5"><p class="font-bold text-slate-900 dark:text-white">${esc(r.Nama || r.nama || '-')}</p><p class="text-[10px] font-mono text-slate-400">${esc(r.NIP || r.nip || '-')}</p></td>
                    <td class="p-2.5"><span class="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[10px] font-bold">${esc(r['Jenis Absen'] || r.jenis || '-')}</span></td>
                    <td class="p-2.5 text-slate-500 max-w-xs truncate">${esc(r.Ket || '-')}</td>
                    <td class="p-2.5 text-right">
                      <button type="button" onclick="openAdminLogEditById('${logId}')" class="min-h-[34px] px-3 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 text-xs font-bold inline-flex items-center gap-1 cursor-pointer">
                        <span class="material-symbols-outlined text-[15px]">edit</span>
                        <span>Edit</span>
                      </button>
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>`;
      }
      return;
    }

    // Mode Harian
    const hadir = rows.filter((r) => r.jamMasuk).length;
    const ketCount = rows.filter((r) => !r.jamMasuk && r.ket).length;
    const belum = Math.max(0, rows.length - hadir - ketCount);
    if (sumBar) {
      sumBar.innerHTML = `
        <span class="px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold">${rows.length} Pegawai</span>
        <span class="px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold">Hadir: ${hadir}</span>
        <span class="px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-bold">Keterangan: ${ketCount}</span>
        <span class="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold">TB/Belum: ${belum}</span>
      `;
    }
    if (!rows.length) {
      box.innerHTML = '<div class="p-8 text-center text-xs text-slate-400">Tidak ada data pegawai pada tanggal ini.</div>';
      return;
    }
    if (!isWide) {
      box.innerHTML = `<div class="space-y-2.5">${rows.map((r) => `
        <div class="rounded-2xl border border-slate-200 dark:border-slate-700 p-3.5 bg-slate-50/70 dark:bg-slate-800/40 space-y-1.5">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="text-xs font-bold text-slate-900 dark:text-white truncate">${esc(r.nama)}</p>
              <p class="text-[10px] font-mono text-slate-400">${esc(r.nip || '-')}</p>
            </div>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${r.jamMasuk ? 'bg-emerald-100 text-emerald-700' : (r.ket ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600')}">${esc(r.jamMasuk ? 'HADIR' : (r.ket || 'TB'))}</span>
          </div>
          <div class="flex items-center justify-between text-[11px] font-mono text-slate-600 dark:text-slate-300">
            <span>Masuk: <strong>${esc(r.jamMasuk || '-')}</strong></span>
            <span>Pulang: <strong>${esc(r.jamPulang || '-')}</strong></span>
          </div>
        </div>
      `).join('')}</div>`;
    } else {
      box.innerHTML = `
        <table class="w-full text-left text-xs">
          <thead class="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase font-bold sticky top-0">
            <tr>
              <th class="p-2.5 rounded-l-xl">No</th>
              <th class="p-2.5">Nama / NIP</th>
              <th class="p-2.5">Jabatan</th>
              <th class="p-2.5 text-center">Masuk</th>
              <th class="p-2.5 text-center">Paraf</th>
              <th class="p-2.5 text-center">Pulang</th>
              <th class="p-2.5 text-center">Paraf</th>
              <th class="p-2.5 rounded-r-xl">Ket</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            ${rows.map((r, i) => {
              const sigUrl = resolveImg(r.signature);
              const parafHtml = sigUrl
                ? `<img src="${esc(sigUrl)}" class="h-7 mx-auto object-contain" alt="" onerror="this.style.display='none'">`
                : '<span class="text-slate-300">-</span>';
              return `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td class="p-2.5 font-mono text-slate-400">${i + 1}</td>
                  <td class="p-2.5"><p class="font-bold text-slate-900 dark:text-white">${esc(r.nama)}</p><p class="text-[10px] font-mono text-slate-400">${esc(r.nip || '-')}</p></td>
                  <td class="p-2.5 text-slate-500">${esc(r.jabatan || '-')}</td>
                  <td class="p-2.5 text-center font-mono font-bold">${esc(r.jamMasuk || '-')}</td>
                  <td class="p-2.5 text-center">${r.jamMasuk ? parafHtml : '-'}</td>
                  <td class="p-2.5 text-center font-mono font-bold">${esc(r.jamPulang || '-')}</td>
                  <td class="p-2.5 text-center">${r.jamPulang ? parafHtml : '-'}</td>
                  <td class="p-2.5 text-slate-600 dark:text-slate-300">${esc(r.ket || '-')}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>`;
    }
  }

  async function openAdminRekapPreview() {
    if (_mode === 'range' && !_rangePayload) await loadAdminRekapData();
    if (_mode === 'harian' && !_harianPayload) await loadAdminRekapData();

    const modal = d.getElementById('modalAdminRekapPreview');
    const body = d.getElementById('adminRekapPreviewBody');
    const titleEl = d.getElementById('adminRekapPreviewTitle');
    if (!modal || !body) return;

    const kp = _mode === 'range' ? _rangePayload?.kepala : _harianPayload?.kepala;
    const kpSig = kp ? resolveImg(kp.signature) : '';
    const tglCetak = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    const rows = getFilteredRows();

    const kopHtml = `
      <div style="display:flex;align-items:center;gap:14px;border-bottom:3px double #0f172a;padding-bottom:10px;margin-bottom:12px;">
        <img src="Lambang_Kabupaten_Sumba_Barat.png" alt="Logo" style="width:54px;height:62px;object-fit:contain;flex-shrink:0;" onerror="this.style.display='none'">
        <div style="flex:1;text-align:center;font-family:'Times New Roman',serif;color:#0f172a;">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.04em;">PEMERINTAH KABUPATEN SUMBA BARAT</div>
          <div style="font-size:15px;font-weight:800;line-height:1.2;">BADAN PERENCANAAN PEMBANGUNAN RISET DAN INOVASI DAERAH</div>
          <div style="font-size:10px;margin-top:3px;">Jl. Weekarou, Waikabubak, Sumba Barat, Nusa Tenggara Timur</div>
        </div>
      </div>`;

    let docTitle = '';
    let docPeriode = '';
    let tableHtml = '';

    if (_mode === 'range') {
      const dari = _rangePayload?.dari || d.getElementById('adminRekapDari')?.value || todayWitaIso();
      const sampai = _rangePayload?.sampai || d.getElementById('adminRekapSampai')?.value || dari;
      docTitle = 'REKAPITULASI KEHADIRAN PEGAWAI';
      docPeriode = `Periode: ${fmtIndo(dari)} s/d ${fmtIndo(sampai)} (${_rangePayload?.hariKerja || 0} Hari Kerja)`;
      if (titleEl) titleEl.textContent = `Preview Rekap Rentang (${dari} s/d ${sampai})`;
      tableHtml = `
        <table style="width:100%;border-collapse:collapse;font-size:10.5px;font-family:'Times New Roman',serif;color:#0f172a;">
          <thead>
            <tr style="background:#f1f5f9;">
              <th style="border:1px solid #334155;padding:5px;text-align:center;">No</th>
              <th style="border:1px solid #334155;padding:5px;text-align:left;">Nama / NIP</th>
              <th style="border:1px solid #334155;padding:5px;text-align:left;">Jabatan</th>
              <th style="border:1px solid #334155;padding:5px;text-align:center;">H</th>
              <th style="border:1px solid #334155;padding:5px;text-align:center;">I</th>
              <th style="border:1px solid #334155;padding:5px;text-align:center;">S</th>
              <th style="border:1px solid #334155;padding:5px;text-align:center;">DL</th>
              <th style="border:1px solid #334155;padding:5px;text-align:center;">C</th>
              <th style="border:1px solid #334155;padding:5px;text-align:center;">TB</th>
              <th style="border:1px solid #334155;padding:5px;text-align:center;">A</th>
              <th style="border:1px solid #334155;padding:5px;text-align:center;">Telat</th>
              <th style="border:1px solid #334155;padding:5px;text-align:center;">Mnt</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r, i) => `
              <tr>
                <td style="border:1px solid #334155;padding:4px;text-align:center;">${i + 1}</td>
                <td style="border:1px solid #334155;padding:4px;"><strong>${esc(r.nama)}</strong><br><span style="font-size:9.5px;">NIP. ${esc(r.nip || '-')}</span></td>
                <td style="border:1px solid #334155;padding:4px;">${esc(r.jabatan || '-')}</td>
                <td style="border:1px solid #334155;padding:4px;text-align:center;">${r.hadir || 0}</td>
                <td style="border:1px solid #334155;padding:4px;text-align:center;">${r.izin || 0}</td>
                <td style="border:1px solid #334155;padding:4px;text-align:center;">${r.sakit || 0}</td>
                <td style="border:1px solid #334155;padding:4px;text-align:center;">${r.tugas || 0}</td>
                <td style="border:1px solid #334155;padding:4px;text-align:center;">${r.cuti || 0}</td>
                <td style="border:1px solid #334155;padding:4px;text-align:center;">${r.tubel || 0}</td>
                <td style="border:1px solid #334155;padding:4px;text-align:center;">${r.alpa || 0}</td>
                <td style="border:1px solid #334155;padding:4px;text-align:center;">${r.lambat_count || 0}</td>
                <td style="border:1px solid #334155;padding:4px;text-align:center;">${r.menit_terlambat || 0}</td>
              </tr>`).join('')}
          </tbody>
        </table>`;
    } else {
      const tanggal = d.getElementById('adminRekapTanggalHarian')?.value || todayWitaIso();
      docTitle = 'DAFTAR HADIR PEGAWAI';
      docPeriode = `Hari / Tanggal: ${fmtIndoFull(tanggal)}`;
      if (titleEl) titleEl.textContent = `Preview Daftar Hadir (${tanggal})`;
      tableHtml = `
        <table style="width:100%;border-collapse:collapse;font-size:10.5px;font-family:'Times New Roman',serif;color:#0f172a;">
          <thead>
            <tr style="background:#f1f5f9;">
              <th style="border:1px solid #334155;padding:5px;text-align:center;">No</th>
              <th style="border:1px solid #334155;padding:5px;text-align:left;">Nama / NIP</th>
              <th style="border:1px solid #334155;padding:5px;text-align:left;">Jabatan / Pangkat</th>
              <th style="border:1px solid #334155;padding:5px;text-align:center;">Jam Masuk</th>
              <th style="border:1px solid #334155;padding:5px;text-align:center;width:72px;">Paraf Masuk</th>
              <th style="border:1px solid #334155;padding:5px;text-align:center;">Jam Pulang</th>
              <th style="border:1px solid #334155;padding:5px;text-align:center;width:72px;">Paraf Pulang</th>
              <th style="border:1px solid #334155;padding:5px;text-align:left;">Ket</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r, i) => {
              const sUrl = resolveImg(r.signature);
              const imgTag = sUrl ? `<img src="${esc(sUrl)}" style="max-height:26px;max-width:64px;object-fit:contain;margin:0 auto;display:block;" onerror="this.style.display='none'">` : '';
              return `
                <tr>
                  <td style="border:1px solid #334155;padding:4px;text-align:center;">${i + 1}</td>
                  <td style="border:1px solid #334155;padding:4px;"><strong>${esc(r.nama)}</strong><br><span style="font-size:9.5px;">NIP. ${esc(r.nip || '-')}</span></td>
                  <td style="border:1px solid #334155;padding:4px;">${esc(r.jabatan || '-')}${r.pangkat ? `<br><span style="font-size:9.5px;">(${esc(r.pangkat)})</span>` : ''}</td>
                  <td style="border:1px solid #334155;padding:4px;text-align:center;">${esc(r.jamMasuk || '-')}</td>
                  <td style="border:1px solid #334155;padding:4px;text-align:center;">${r.jamMasuk ? imgTag : ''}</td>
                  <td style="border:1px solid #334155;padding:4px;text-align:center;">${esc(r.jamPulang || '-')}</td>
                  <td style="border:1px solid #334155;padding:4px;text-align:center;">${r.jamPulang ? imgTag : ''}</td>
                  <td style="border:1px solid #334155;padding:4px;">${esc(r.ket || '-')}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>`;
    }

    const ttdHtml = `
      <div style="display:flex;justify-content:flex-end;margin-top:22px;font-family:'Times New Roman',serif;font-size:11px;color:#0f172a;">
        <div style="text-align:center;min-width:220px;">
          <div>Waikabubak, ${esc(tglCetak)}</div>
          <div>Mengetahui,</div>
          <div style="font-weight:700;">${esc(kp?.jabatan || 'Kepala Badan')}</div>
          <div style="height:56px;display:flex;align-items:center;justify-content:center;margin:4px 0;">
            ${kpSig ? `<img src="${esc(kpSig)}" style="max-height:52px;max-width:140px;object-fit:contain;" alt="TTD Kepala" onerror="this.style.display='none'">` : ''}
          </div>
          <div style="font-weight:700;text-decoration:underline;">${esc(kp?.nama || '__________________________')}</div>
          ${kp?.pangkat ? `<div>${esc(kp.pangkat)}</div>` : ''}
          <div>NIP. ${esc(kp?.nip || '..........................................')}</div>
        </div>
      </div>`;

    body.innerHTML = `
      <div style="background:#ffffff;padding:24px;border-radius:16px;box-shadow:0 6px 24px rgba(15,23,42,0.08);min-width:620px;margin:0 auto;">
        ${kopHtml}
        <div style="text-align:center;font-family:'Times New Roman',serif;margin-bottom:12px;color:#0f172a;">
          <div style="font-size:13px;font-weight:700;">${docTitle}</div>
          <div style="font-size:11px;">${esc(docPeriode)}</div>
        </div>
        ${tableHtml}
        ${ttdHtml}
      </div>`;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  function closeAdminRekapPreview() {
    const modal = d.getElementById('modalAdminRekapPreview');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  async function exportAdminRekapPDF() {
    if (_mode === 'harian') {
      const tanggal = d.getElementById('adminRekapTanggalHarian')?.value || todayWitaIso();
      if (typeof w.exportHarianPDF === 'function') return w.exportHarianPDF(tanggal);
    } else {
      const dari = d.getElementById('adminRekapDari')?.value || todayWitaIso();
      const sampai = d.getElementById('adminRekapSampai')?.value || dari;
      // Sinkronkan input opsional untuk exportRekapRangePDF
      let eD = d.getElementById('rekapRangeDari');
      let eS = d.getElementById('rekapRangeSampai');
      if (!eD) { eD = d.createElement('input'); eD.type = 'hidden'; eD.id = 'rekapRangeDari'; d.body.appendChild(eD); }
      if (!eS) { eS = d.createElement('input'); eS.type = 'hidden'; eS.id = 'rekapRangeSampai'; d.body.appendChild(eS); }
      eD.value = dari;
      eS.value = sampai;
      if (typeof w.exportRekapRangePDF === 'function') return w.exportRekapRangePDF();
    }
  }

  async function exportAdminRekapXLSX() {
    if (_mode === 'range' && !_rangePayload) await loadAdminRekapData();
    if (_mode === 'harian' && !_harianPayload) await loadAdminRekapData();
    if (!w.XLSX) {
      if (typeof w.showDynamicIsland === 'function') {
        w.showDynamicIsland({ type: 'warning', title: 'Library Excel Sedang Dimuat', message: 'Coba klik lagi sesaat.' });
      }
      return;
    }

    const rows = getFilteredRows();
    let aoa = [];
    let sheetName = 'Rekap';
    let fileName = '';

    if (_mode === 'range') {
      const dari = _rangePayload?.dari || d.getElementById('adminRekapDari')?.value || todayWitaIso();
      const sampai = _rangePayload?.sampai || d.getElementById('adminRekapSampai')?.value || dari;
      sheetName = 'Rekap_Kehadiran';
      fileName = `Rekap_Kehadiran_${dari}_sd_${sampai}.xlsx`;
      aoa = [
        ['PEMERINTAH KABUPATEN SUMBA BARAT'],
        ['BADAN PERENCANAAN PEMBANGUNAN RISET DAN INOVASI DAERAH'],
        [`REKAPITULASI KEHADIRAN PEGAWAI (${fmtIndo(dari)} s/d ${fmtIndo(sampai)})`],
        [],
        ['No', 'Nama', 'NIP', 'Jabatan', 'Pangkat', 'Hadir', 'Izin', 'Sakit', 'Tugas/DL', 'Cuti', 'Tubel', 'Alpa', 'Jml Telat', 'Menit Telat', 'Menit Pulang Cepat']
      ];
      rows.forEach((r, i) => {
        aoa.push([
          i + 1, r.nama || '', r.nip || '', r.jabatan || '', r.pangkat || '',
          r.hadir || 0, r.izin || 0, r.sakit || 0, r.tugas || 0, r.cuti || 0,
          r.tubel || 0, r.alpa || 0, r.lambat_count || 0, r.menit_terlambat || 0, r.menit_lebih_awal || 0
        ]);
      });
    } else {
      const tanggal = d.getElementById('adminRekapTanggalHarian')?.value || todayWitaIso();
      sheetName = 'Daftar_Hadir';
      fileName = `Daftar_Hadir_${tanggal}.xlsx`;
      aoa = [
        ['PEMERINTAH KABUPATEN SUMBA BARAT'],
        ['BADAN PERENCANAAN PEMBANGUNAN RISET DAN INOVASI DAERAH'],
        [`DAFTAR HADIR PEGAWAI (${fmtIndoFull(tanggal)})`],
        [],
        ['No', 'Nama', 'NIP', 'Jabatan', 'Pangkat', 'Jam Masuk', 'Jam Pulang', 'Keterangan']
      ];
      rows.forEach((r, i) => {
        aoa.push([
          i + 1, r.nama || '', r.nip || '', r.jabatan || '', r.pangkat || '',
          r.jamMasuk || '-', r.jamPulang || '-', r.ket || '-'
        ]);
      });
    }

    const ws = w.XLSX.utils.aoa_to_sheet(aoa);
    const wb = w.XLSX.utils.book_new();
    w.XLSX.utils.book_append_sheet(wb, ws, sheetName);
    w.XLSX.writeFile(wb, fileName);
    if (typeof w.showDynamicIsland === 'function') {
      w.showDynamicIsland({ type: 'download', title: 'Excel (.xlsx) Diunduh', message: fileName });
    }
  }

  /* ── TAMBAH & EDIT LOG ABSEN (/api/log/add & /api/log/edit) ─────────── */
  function ensureLogModalPickers() {
    if (_logModalInited) return;
    _logModalInited = true;
    if (w.StitchPicker) {
      w.StitchPicker.enhanceSelect('adminLogPegawaiSelect', { placeholder: 'Pilih pegawai...', searchable: true });
      w.StitchPicker.enhanceSelect('adminLogJenisSelect', { placeholder: 'Pilih jenis absen...', searchable: false });
      w.StitchPicker.enhanceDate('adminLogTanggal', { placeholder: 'Pilih tanggal' });
      w.StitchPicker.enhanceTime('adminLogJam', { minHour: 6, maxHour: 22, stepMin: 5 });
    }
  }

  function populateLogPegawaiOptions() {
    const sel = d.getElementById('adminLogPegawaiSelect');
    if (!sel) return;
    const users = (w.state && Array.isArray(w.state.allUsers)) ? w.state.allUsers : [];
    sel.innerHTML = users.map((u) => `<option value="${esc(u.id)}">${esc(u.nama)} (${esc(u.nip || '-')})</option>`).join('');
    if (w.StitchPicker && typeof w.StitchPicker.refreshSelect === 'function') {
      w.StitchPicker.refreshSelect('adminLogPegawaiSelect');
    }
  }

  function openAdminLogFormModal(logRecord = null) {
    ensureLogModalPickers();
    populateLogPegawaiOptions();

    const modal = d.getElementById('modalAdminLogForm');
    const titleEl = d.getElementById('adminLogModalTitle');
    const editIdEl = d.getElementById('adminLogEditId');
    const pegWrap = d.getElementById('adminLogPegawaiWrap');
    const pegRo = d.getElementById('adminLogPegawaiReadonly');
    const roNama = d.getElementById('adminLogReadonlyNama');
    const roNip = d.getElementById('adminLogReadonlyNip');
    const tglEl = d.getElementById('adminLogTanggal');
    const jamEl = d.getElementById('adminLogJam');
    const jenisEl = d.getElementById('adminLogJenisSelect');
    const ketEl = d.getElementById('adminLogKet');
    const btnTxt = d.getElementById('btnSubmitAdminLogText');

    if (logRecord) {
      if (titleEl) titleEl.textContent = 'Edit Log Kehadiran';
      if (btnTxt) btnTxt.textContent = 'Simpan Perubahan';
      if (editIdEl) editIdEl.value = String(logRecord.ID_Log || logRecord.id_log || '');
      if (pegWrap) pegWrap.classList.add('hidden');
      if (pegRo) pegRo.classList.remove('hidden');
      if (roNama) roNama.textContent = logRecord.Nama || logRecord.nama || '-';
      if (roNip) roNip.textContent = 'NIP. ' + (logRecord.NIP || logRecord.nip || '-');
      if (tglEl) tglEl.value = String(logRecord.Tanggal || '').slice(0, 10) || todayWitaIso();
      if (jamEl) jamEl.value = String(logRecord.Jam || '07:30').slice(0, 5);
      if (jenisEl) jenisEl.value = logRecord['Jenis Absen'] || logRecord.jenis || 'MASUK';
      if (ketEl) ketEl.value = logRecord.Ket || '';
    } else {
      if (titleEl) titleEl.textContent = 'Tambah Log Kehadiran';
      if (btnTxt) btnTxt.textContent = 'Simpan Log Baru';
      if (editIdEl) editIdEl.value = '';
      if (pegWrap) pegWrap.classList.remove('hidden');
      if (pegRo) pegRo.classList.add('hidden');
      if (tglEl) tglEl.value = todayWitaIso();
      if (jamEl) jamEl.value = '07:30';
      if (jenisEl) jenisEl.value = 'MASUK';
      if (ketEl) ketEl.value = '';
    }

    if (w.StitchPicker && typeof w.StitchPicker.refreshAll === 'function') {
      w.StitchPicker.refreshAll();
    }
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  }

  function openAdminLogEditById(logId) {
    const rec = _logsList.find((r) => String(r.ID_Log || r.id_log || '') === String(logId));
    if (!rec) return;
    openAdminLogFormModal(rec);
  }

  function closeAdminLogFormModal() {
    const modal = d.getElementById('modalAdminLogForm');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  async function submitAdminLogForm() {
    const editId = d.getElementById('adminLogEditId')?.value || '';
    const subjectId = d.getElementById('adminLogPegawaiSelect')?.value || '';
    const tanggal = d.getElementById('adminLogTanggal')?.value || '';
    const jam = d.getElementById('adminLogJam')?.value || '';
    const jenis = d.getElementById('adminLogJenisSelect')?.value || '';
    const ket = (d.getElementById('adminLogKet')?.value || '').trim();

    if (!tanggal || !jam || !jenis || (!editId && !subjectId)) {
      if (w.Swal) w.Swal.fire('Perhatian', 'Pegawai, tanggal, jam, dan jenis absen wajib diisi.', 'warning');
      return;
    }

    const btn = d.getElementById('btnSubmitAdminLog');
    if (btn) btn.disabled = true;
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (typeof w.getStitchToken === 'function' && w.getStitchToken()) {
        headers.Authorization = 'Bearer ' + w.getStitchToken();
      }
      const endpoint = editId ? '/api/log/edit' : '/api/log/add';
      const payload = editId
        ? { ID_Log: editId, tanggal, jam, jenis_absen: jenis, keterangan: ket }
        : { telegram_id: subjectId, tanggal, jam, jenis_absen: jenis, keterangan: ket, request_id: `stitch_admin_log_${subjectId}_${Date.now()}` };

      const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.message || 'Gagal menyimpan log.');

      closeAdminLogFormModal();
      if (typeof w.showDynamicIsland === 'function') {
        w.showDynamicIsland({ type: 'success', title: editId ? 'Log Diperbarui' : 'Log Ditambahkan', message: json.message || 'Tersimpan di database.' });
      }
      await loadAdminRekapData();
    } catch (err) {
      if (w.Swal) w.Swal.fire('Gagal', err.message, 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /* ── PETA LEAFLET GEOFENCING (JALAN OSM & SATELIT ESRI) ─────────────── */
  let _geoMap = null;
  let _geoMarker = null;
  let _geoCircle = null;
  let _geoStreetLayer = null;
  let _geoSatLayer = null;
  let _geoCurrentLayer = 'street';

  function readGeofenceInputs() {
    const lat = parseFloat(d.getElementById('adminOfficeLat')?.value) || -9.648769;
    const lon = parseFloat(d.getElementById('adminOfficeLon')?.value) || 119.389232;
    const rad = parseFloat(d.getElementById('adminRadiusSlider')?.value) || 50;
    return { lat, lon, rad };
  }

  function writeGeofenceInputs(lat, lon) {
    const latEl = d.getElementById('adminOfficeLat');
    const lonEl = d.getElementById('adminOfficeLon');
    if (latEl) latEl.value = Number(lat).toFixed(6);
    if (lonEl) lonEl.value = Number(lon).toFixed(6);
  }

  function initAdminGeofenceMap() {
    const container = d.getElementById('adminGeofenceMap');
    if (!container || typeof w.L === 'undefined') return;
    const { lat, lon, rad } = readGeofenceInputs();

    if (!_geoMap) {
      _geoMap = w.L.map(container, { zoomControl: true }).setView([lat, lon], 17);
      _geoStreetLayer = w.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      });
      _geoSatLayer = w.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: '&copy; Esri World Imagery'
      });
      _geoStreetLayer.addTo(_geoMap);

      _geoMarker = w.L.marker([lat, lon], { draggable: true }).addTo(_geoMap);
      _geoCircle = w.L.circle([lat, lon], {
        radius: rad,
        color: '#2563eb',
        fillColor: '#3b82f6',
        fillOpacity: 0.2,
        weight: 2
      }).addTo(_geoMap);

      _geoMarker.on('dragend', () => {
        const pos = _geoMarker.getLatLng();
        writeGeofenceInputs(pos.lat, pos.lng);
        _geoCircle.setLatLng(pos);
      });

      _geoMap.on('click', (ev) => {
        writeGeofenceInputs(ev.latlng.lat, ev.latlng.lng);
        _geoMarker.setLatLng(ev.latlng);
        _geoCircle.setLatLng(ev.latlng);
      });

      const latEl = d.getElementById('adminOfficeLat');
      const lonEl = d.getElementById('adminOfficeLon');
      if (latEl) latEl.addEventListener('change', updateAdminGeofenceMap);
      if (lonEl) lonEl.addEventListener('change', updateAdminGeofenceMap);
    }

    setTimeout(() => {
      if (_geoMap) {
        _geoMap.invalidateSize();
        updateAdminGeofenceMap();
      }
    }, 120);
  }

  function updateAdminGeofenceMap() {
    if (!_geoMap || !_geoMarker || !_geoCircle) return;
    const { lat, lon, rad } = readGeofenceInputs();
    _geoMarker.setLatLng([lat, lon]);
    _geoCircle.setLatLng([lat, lon]);
    _geoCircle.setRadius(rad);
    _geoMap.panTo([lat, lon]);
  }

  function setAdminMapLayer(layer) {
    _geoCurrentLayer = layer === 'satellite' ? 'satellite' : 'street';
    const bS = d.getElementById('btnMapLayerStreet');
    const bSat = d.getElementById('btnMapLayerSat');
    const activeCls = 'min-h-[34px] px-3 py-1 rounded-lg text-[11px] font-bold bg-blue-600 text-white shadow-xs transition-all cursor-pointer';
    const idleCls = 'min-h-[34px] px-3 py-1 rounded-lg text-[11px] font-semibold text-slate-600 dark:text-slate-300 transition-all cursor-pointer';
    if (bS) bS.className = _geoCurrentLayer === 'street' ? activeCls : idleCls;
    if (bSat) bSat.className = _geoCurrentLayer === 'satellite' ? activeCls : idleCls;

    if (!_geoMap || !_geoStreetLayer || !_geoSatLayer) return;
    if (_geoCurrentLayer === 'satellite') {
      if (_geoMap.hasLayer(_geoStreetLayer)) _geoMap.removeLayer(_geoStreetLayer);
      if (!_geoMap.hasLayer(_geoSatLayer)) _geoSatLayer.addTo(_geoMap);
    } else {
      if (_geoMap.hasLayer(_geoSatLayer)) _geoMap.removeLayer(_geoSatLayer);
      if (!_geoMap.hasLayer(_geoStreetLayer)) _geoStreetLayer.addTo(_geoMap);
    }
  }

  function useMyGpsForAdminMap() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        writeGeofenceInputs(pos.coords.latitude, pos.coords.longitude);
        updateAdminGeofenceMap();
        if (typeof w.showDynamicIsland === 'function') {
          w.showDynamicIsland({ type: 'info', title: 'Koordinat Diperbarui', message: `Akurasi ±${Math.round(pos.coords.accuracy)}m` });
        }
      },
      () => {
        if (w.Swal) w.Swal.fire('GPS Gagal', 'Pastikan izin lokasi browser diaktifkan.', 'warning');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  w.initAdminRekapPanel = initAdminRekapPanel;
  w.setAdminRekapMode = setAdminRekapMode;
  w.setAdminRekapPreset = setAdminRekapPreset;
  w.loadAdminRekapData = loadAdminRekapData;
  w.filterAdminRekapList = filterAdminRekapList;
  w.openAdminRekapPreview = openAdminRekapPreview;
  w.closeAdminRekapPreview = closeAdminRekapPreview;
  w.exportAdminRekapPDF = exportAdminRekapPDF;
  w.exportAdminRekapXLSX = exportAdminRekapXLSX;
  w.openAdminLogFormModal = openAdminLogFormModal;
  w.openAdminLogEditById = openAdminLogEditById;
  w.closeAdminLogFormModal = closeAdminLogFormModal;
  w.submitAdminLogForm = submitAdminLogForm;
  w.initAdminGeofenceMap = initAdminGeofenceMap;
  w.updateAdminGeofenceMap = updateAdminGeofenceMap;
  w.setAdminMapLayer = setAdminMapLayer;
  w.useMyGpsForAdminMap = useMyGpsForAdminMap;
})(window, document);
