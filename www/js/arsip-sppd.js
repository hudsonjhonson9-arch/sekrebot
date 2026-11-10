/* ════ ARSIP NATIVE — Register SPPD (Dalam & Luar Daerah) ════
   Kontrak: window.ArsipSPPD = { mount(el), unmount() }.
   Data dialirkan via proxy /api/arsip/p/api/agenda/*
═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* global escapeHtml, apiFetch, apiGet */

  const PROXY = '/api/arsip/p/api/agenda';
  let el = null;
  let jenisAktif = 'DALAM_DAERAH'; // 'DALAM_DAERAH' | 'LUAR_DAERAH'
  let tahun = new Date().getFullYear();
  let itemsDD = [];
  let itemsLD = [];
  let totalDD = 0;
  let totalLD = 0;
  let query = '';
  let isLoading = false;

  const $x = (sel) => (el ? el.querySelector(sel) : null);

  function setTile(n) {
    const t = document.querySelector('#arsipHome [data-tile="sppd"] em');
    if (t) t.textContent = n !== undefined ? n + ' reg.' : '—';
  }

  function fmtRupiah(num) {
    const val = Number(num) || 0;
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(val);
  }

  async function fetchDD() {
    isLoading = true;
    render();
    try {
      const qStr = query ? `&q=${encodeURIComponent(query)}` : '';
      const res = await apiGet(`${PROXY}/sppd?jenis=DALAM_DAERAH&tahun=${tahun}${qStr}`);
      if (res && res.ok && res.data) {
        itemsDD = res.data.items || [];
        totalDD = res.data.total || 0;
        setTile(totalDD + totalLD);
      }
    } catch (e) {
      console.error('[SPPD] Gagal memuat SPPD Dalam Daerah:', e);
    } finally {
      isLoading = false;
      render();
    }
  }

  async function fetchLD() {
    isLoading = true;
    render();
    try {
      const qStr = query ? `&q=${encodeURIComponent(query)}` : '';
      const res = await apiGet(`${PROXY}/sppd?jenis=LUAR_DAERAH&tahun=${tahun}${qStr}`);
      if (res && res.ok && res.data) {
        itemsLD = res.data.items || [];
        totalLD = res.data.total || 0;
        setTile(totalDD + totalLD);
      }
    } catch (e) {
      console.error('[SPPD] Gagal memuat SPPD Luar Daerah:', e);
    } finally {
      isLoading = false;
      render();
    }
  }

  function render() {
    if (!el) return;

    const esc = (v) => (typeof escapeHtml === 'function' ? escapeHtml(v) : (v || ''));
    const isDD = jenisAktif === 'DALAM_DAERAH';
    const currentList = isDD ? itemsDD : itemsLD;

    let html = `
      <div class="arsip-section-head" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
        <div>
          <h2 style="font-size:18px; font-weight:800; color:var(--white); margin:0;">Buku Register Perjalanan Dinas (SPPD)</h2>
          <div style="font-size:12px; color:var(--muted); margin-top:2px;">Monitoring penugasan lapangan, biaya SBM, dan bukti SPJ pegawai</div>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <select id="sppdTahunSel" class="arsip-search" style="width:auto; padding:6px 12px; font-weight:700;">
            <option value="2026" ${tahun === 2026 ? 'selected' : ''}>Tahun 2026</option>
            <option value="2025" ${tahun === 2025 ? 'selected' : ''}>Tahun 2025</option>
          </select>
        </div>
      </div>

      <!-- Sub Tabs -->
      <div style="display:flex; gap:8px; border-bottom:1px solid rgba(255,255,255,0.1); margin-bottom:16px;">
        <button id="btnTabDD" class="arsip-act" style="background:${isDD ? 'var(--gold)' : 'transparent'}; color:${isDD ? '#000' : 'var(--white)'}; font-weight:700; border-radius:8px 8px 0 0; padding:8px 18px;">
          <i class="fas fa-map-marker-alt" style="margin-right:6px;"></i> Dalam Daerah (${totalDD})
        </button>
        <button id="btnTabLD" class="arsip-act" style="background:${!isDD ? 'var(--gold)' : 'transparent'}; color:${!isDD ? '#000' : 'var(--white)'}; font-weight:700; border-radius:8px 8px 0 0; padding:8px 18px;">
          <i class="fas fa-map-marked-alt" style="margin-right:6px;"></i> Luar Daerah (${totalLD})
        </button>
      </div>

      <!-- Filter Toolbar -->
      <div class="arsip-toolbar" style="margin-bottom:16px;">
        <input id="sppdSearch" class="arsip-search" placeholder="Cari nama pelaksana / tujuan / nomor SPT…" value="${esc(query)}" />
        <button id="btnSearchSppd" class="arsip-act ok"><i class="fas fa-search"></i> Cari</button>
      </div>
    `;

    if (isLoading) {
      html += `
        <div style="padding:24px; text-align:center; color:var(--muted);">
          <div style="font-size:24px; margin-bottom:8px;"><i class="fas fa-sync"></i></div>
          <div style="font-size:12px;">Memuat register SPPD…</div>
        </div>
      `;
      el.innerHTML = html;
      bindEvents();
      return;
    }

    if (!currentList.length) {
      html += `
        <div class="arsip-placeholder" style="text-align:center; padding:32px 16px;">
          <div style="font-size:32px; margin-bottom:8px; color:var(--muted);"><i class="fas fa-map"></i></div>
          <div style="font-weight:700; color:var(--white);">Belum ada register SPPD ${isDD ? 'Dalam Daerah' : 'Luar Daerah'} tahun ${tahun}</div>
          <div style="font-size:12px; color:var(--muted); margin-top:4px;">SPT & SPPD yang diterbitkan otomatis tersinkronisasi di register ini.</div>
        </div>
      `;
    } else {
      html += `
        <div style="overflow-x:auto;">
          <table class="arsip-table" style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;">
            <thead>
              <tr style="border-bottom:1px solid rgba(255,255,255,0.15); color:var(--muted);">
                <th style="padding:8px 12px; font-weight:700;">No. Register</th>
                <th style="padding:8px 12px; font-weight:700;">Pelaksana Utama</th>
                <th style="padding:8px 12px; font-weight:700;">Maksud Perjalanan</th>
                <th style="padding:8px 12px; font-weight:700;">Tempat Tujuan</th>
                <th style="padding:8px 12px; font-weight:700;">Waktu & Hari</th>
                <th style="padding:8px 12px; font-weight:700; text-align:right;">Total Biaya</th>
                <th style="padding:8px 12px; font-weight:700;">Status</th>
              </tr>
            </thead>
            <tbody>
      `;
      for (const it of currentList) {
        const badgeBg = it.status === 'Selesai' ? 'rgba(34,197,94,0.2)' : (it.status === 'Laporan Masuk' ? 'rgba(59,130,246,0.2)' : 'rgba(245,158,11,0.2)');
        const badgeColor = it.status === 'Selesai' ? '#4ade80' : (it.status === 'Laporan Masuk' ? '#60a5fa' : '#fbbf24');
        html += `
          <tr style="border-bottom:1px solid rgba(255,255,255,0.06);">
            <td style="padding:10px 12px;">
              <div style="font-family:monospace; font-weight:700; color:var(--gold); font-variant-numeric:tabular-nums;">${esc(it.nomor_register)}</div>
              <div style="font-size:10px; color:var(--muted); font-variant-numeric:tabular-nums;">SPT: ${esc(it.nomor_spt)}</div>
            </td>
            <td style="padding:10px 12px;">
              <div style="font-weight:700; color:var(--white);">${esc(it.pelaksana_nama)}</div>
              <div style="font-size:11px; color:var(--muted); font-family:monospace; font-variant-numeric:tabular-nums;">NIP: ${esc(it.pelaksana_nip)}</div>
            </td>
            <td style="padding:10px 12px; max-width:260px; line-height:1.4;">${esc(it.maksud_perjalanan)}</td>
            <td style="padding:10px 12px; font-weight:600; color:var(--white);">
              ${esc(it.tempat_tujuan)}
              ${it.provinsi_tujuan ? `<div style="font-size:10px; color:var(--muted); font-weight:normal;">Prov. ${esc(it.provinsi_tujuan)}</div>` : ''}
            </td>
            <td style="padding:10px 12px; font-variant-numeric:tabular-nums;">
              <div style="font-weight:600;">${esc(it.tanggal_berangkat)} s/d ${esc(it.tanggal_kembali)}</div>
              <div style="font-size:11px; color:var(--gold);">${esc(it.lama_hari)} Hari Dinas</div>
            </td>
            <td style="padding:10px 12px; font-weight:700; text-align:right; font-family:monospace; font-variant-numeric:tabular-nums; color:var(--white);">
              ${fmtRupiah(it.total_biaya)}
            </td>
            <td style="padding:10px 12px;">
              <span style="display:inline-block; padding:3px 8px; border-radius:6px; font-size:10px; font-weight:700; background:${badgeBg}; color:${badgeColor};">
                ${esc(it.status || 'Pengajuan')}
              </span>
            </td>
          </tr>
        `;
      }
      html += `</tbody></table></div>`;
    }

    el.innerHTML = html;
    bindEvents();
  }

  function bindEvents() {
    const selThn = $x('#sppdTahunSel');
    if (selThn) {
      selThn.onchange = (e) => {
        tahun = parseInt(e.target.value, 10);
        if (jenisAktif === 'DALAM_DAERAH') fetchDD();
        else fetchLD();
      };
    }

    const btnDD = $x('#btnTabDD');
    const btnLD = $x('#btnTabLD');
    if (btnDD) {
      btnDD.onclick = () => {
        jenisAktif = 'DALAM_DAERAH';
        fetchDD();
      };
    }
    if (btnLD) {
      btnLD.onclick = () => {
        jenisAktif = 'LUAR_DAERAH';
        fetchLD();
      };
    }

    const btnSearch = $x('#btnSearchSppd');
    const inpSearch = $x('#sppdSearch');
    if (btnSearch && inpSearch) {
      btnSearch.onclick = () => {
        query = inpSearch.value;
        if (jenisAktif === 'DALAM_DAERAH') fetchDD();
        else fetchLD();
      };
      inpSearch.onkeydown = (e) => {
        if (e.key === 'Enter') {
          query = inpSearch.value;
          if (jenisAktif === 'DALAM_DAERAH') fetchDD();
          else fetchLD();
        }
      };
    }
  }

  window.ArsipSPPD = {
    mount(targetEl) {
      el = targetEl;
      fetchDD();
      fetchLD();
    },
    unmount() {
      el = null;
    }
  };
})();
