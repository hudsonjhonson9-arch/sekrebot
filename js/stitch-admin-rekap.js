/* Stitch Admin Rekap Kehadiran Semua Pegawai: Rentang/Bulanan + Harian + Preview Berkop/Paraf/TTD + PDF F4 + Excel (.xlsx) */
(function (w, d) {
  'use strict';

  let _mode = 'range'; // 'range' | 'harian'
  let _inited = false;
  let _rangePayload = null;
  let _harianPayload = null;

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
    _mode = mode === 'harian' ? 'harian' : 'range';
    const bR = d.getElementById('btnAdminRekapModeRange');
    const bH = d.getElementById('btnAdminRekapModeHarian');
    const cR = d.getElementById('adminRekapControlsRange');
    const cH = d.getElementById('adminRekapControlsHarian');

    if (bR && bH) {
      bR.className = _mode === 'range'
        ? 'min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white shadow-xs transition-all cursor-pointer'
        : 'min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 transition-all cursor-pointer';
      bH.className = _mode === 'harian'
        ? 'min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white shadow-xs transition-all cursor-pointer'
        : 'min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 transition-all cursor-pointer';
    }
    if (cR) cR.classList.toggle('hidden', _mode !== 'range');
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
    const q = (_mode === 'range'
      ? (d.getElementById('adminRekapSearch')?.value || '')
      : (d.getElementById('adminRekapSearchHarian')?.value || '')
    ).trim().toLowerCase();
    const list = _mode === 'range' ? (_rangePayload?.data || []) : (_harianPayload?.data || []);
    if (!q) return list;
    return list.filter((r) =>
      String(r.nama || '').toLowerCase().includes(q)
      || String(r.nip || '').toLowerCase().includes(q)
      || String(r.jabatan || '').toLowerCase().includes(q)
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

  w.initAdminRekapPanel = initAdminRekapPanel;
  w.setAdminRekapMode = setAdminRekapMode;
  w.setAdminRekapPreset = setAdminRekapPreset;
  w.loadAdminRekapData = loadAdminRekapData;
  w.filterAdminRekapList = filterAdminRekapList;
  w.openAdminRekapPreview = openAdminRekapPreview;
  w.closeAdminRekapPreview = closeAdminRekapPreview;
  w.exportAdminRekapPDF = exportAdminRekapPDF;
  w.exportAdminRekapXLSX = exportAdminRekapXLSX;
})(window, document);
