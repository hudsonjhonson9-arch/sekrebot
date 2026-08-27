    /* ════ ADMIN SERAGAM ════ */
    /* ════ ADMIN SERAGAM ════ */
    // SERAGAM_OPTIONS: dimuat ulang dari server via loadSeragamTypeAdmin()
    // Default bawaan dipakai jika server belum disetup
    let SERAGAM_OPTIONS = [
      {
        id: '1', warna: 'coklat_khaki', label: 'Coklat / Khaki (Seragam ASN)', emoji: '🟤', preview: '#c8a96e',
        hMin: 15, hMax: 65, sMin: 15, sMax: 75, lMin: 20, lMax: 75
      },
      {
        id: '2', warna: 'putih', label: 'Kemeja Putih', emoji: '⬜', preview: '#f0f0f0',
        hMin: 0, hMax: 360, sMin: 0, sMax: 20, lMin: 68, lMax: 100
      },
      {
        id: '3', warna: 'tenun_sumba', label: 'Kain Tenun Sumba', emoji: '🎨', preview: 'linear-gradient(135deg,#e53935,#f39c12,#27ae60,#2980b9)',
        hMin: null, hMax: null, sMin: null, sMax: null, lMin: null, lMax: null
      },
      {
        id: '4', warna: 'bebas', label: 'Baju Bebas', emoji: '👕', preview: 'linear-gradient(135deg,#667eea,#764ba2)',
        hMin: null, hMax: null, sMin: null, sMax: null, lMin: null, lMax: null
      },
      {
        id: '0', warna: null, label: 'Libur (Tidak Cek)', emoji: '🏠', preview: '#1a2540',
        hMin: null, hMax: null, sMin: null, sMax: null, lMin: null, lMax: null
      },
    ];

    function _seragamPreviewFromWarna(warna) {
      const MAP = {
        coklat_khaki: '#c8a96e', putih: '#f0f0f0',
        tenun_sumba: 'linear-gradient(135deg,#e53935,#f39c12,#27ae60,#2980b9)',
        bebas: 'linear-gradient(135deg,#667eea,#764ba2)',
      };
      return MAP[warna] || 'linear-gradient(135deg,var(--gold),#9b6e1a)';
    }

    /* ── CRUD Jenis Seragam ── */
    /**
     * Muat daftar jenis seragam dari server untuk panel admin.
     * @returns {Promise<void>}
     */
        async function loadSeragamTypeAdmin() {
      const el = $('seragamTypeList');
      if (!el) return;
      dom.shimmer(el.id, 2);
      try {
        let rows = _seragamTypeRawCache;
        if (!rows) {
          // Cache belum ada (pertama kali buka admin) — fetch sekali, simpan cache
          const res = await apiGet(P.seragamTypeList);
          const ok = res.ok;
          if (!ok) throw 0;
          const d = res?.data ?? {};
          rows = d.data || d || [];
          _seragamTypeRawCache = rows;
        }
        _applySeragamTypeRows(rows);
        renderSeragamTypeList();
        renderSeragamAdmin();
      } catch (_) {
        renderSeragamTypeList();
      }
    }

    function renderSeragamTypeList() {
      const el = $('seragamTypeList');
      if (!el) return;
      const items = SERAGAM_OPTIONS.filter(o => o.warna !== null); // tidak tampilkan "Libur" di list
      if (!items.length) { el.innerHTML = '<div style="font-size:10px;color:var(--muted);text-align:center;padding:10px">Belum ada jenis seragam. Tambah di atas.</div>'; return; }
      el.innerHTML = items.map(o => {
        const hslInfo = o.hMin !== null ? `H${o.hMin}–${o.hMax} S${o.sMin}–${o.sMax}% L${o.lMin}–${o.lMax}%` : 'Bebas (tidak cek warna)';
        const hslBg = o.hMin !== null
          ? `linear-gradient(90deg,hsl(${o.hMin},${Math.round((o.sMin + o.sMax) / 2)}%,${Math.round((o.lMin + o.lMax) / 2)}%) 0%,hsl(${Math.round((o.hMin + o.hMax) / 2)},${Math.round((o.sMin + o.sMax) / 2)}%,${Math.round((o.lMin + o.lMax) / 2)}%) 50%,hsl(${o.hMax},${Math.round((o.sMin + o.sMax) / 2)}%,${Math.round((o.lMin + o.lMax) / 2)}%) 100%)`
          : '#333';
        return `
    <div style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:9px 12px">
      <span style="width:26px;height:26px;border-radius:7px;display:inline-block;flex-shrink:0;background:${hslBg};border:1px solid rgba(255,255,255,.15)"></span>
      <div style="flex:1;min-width:0">
        <div style="font-size:11px;font-weight:700;color:var(--white)">${o.emoji} ${o.label}</div>
        <div style="font-size:8.5px;color:var(--muted);font-family:'JetBrains Mono',monospace">${o.warna} · ${hslInfo}</div>
      </div>
      <button onclick="editSeragamType('${o.id}','${o.warna}','${o.label.replace(/'/g, '&#39;')}','${o.emoji}',${o.hMin ?? 'null'},${o.hMax ?? 'null'},${o.sMin ?? 'null'},${o.sMax ?? 'null'},${o.lMin ?? 'null'},${o.lMax ?? 'null'})"
        style="padding:4px 8px;border-radius:7px;border:1px solid rgba(201,168,76,.3);background:rgba(201,168,76,.1);color:var(--gold);font-size:9px;font-weight:700;cursor:pointer">✏️</button>
      <button onclick="deleteSeragamType('${o.id}','${o.warna}','${o.label.replace(/'/g, '&#39;')}')"
        style="padding:4px 8px;border-radius:7px;border:1px solid rgba(239,68,68,.3);background:rgba(239,68,68,.1);color:var(--danger);font-size:9px;font-weight:700;cursor:pointer">🗑️</button>
    </div>`;
      }).join('');
    }

    function updateHslPreview() {
      const hMin = parseInt($('inputHMin').value) || 0;
      const hMax = parseInt($('inputHMax').value) || 360;
      const sMin = parseInt($('inputSMin').value) || 0;
      const sMax = parseInt($('inputSMax').value) || 100;
      const lMin = parseInt($('inputLMin').value) || 0;
      const lMax = parseInt($('inputLMax').value) || 100;
      const bar = $('hslPreviewBar');
      const label = $('hslPreviewLabel');
      if (!bar) return;
      const hMid = Math.round((hMin + hMax) / 2);
      const sMid = Math.round((sMin + sMax) / 2);
      const lMid = Math.round((lMin + lMax) / 2);
      const isEmpty = !$('inputHMin').value && !$('inputHMax').value;
      if (isEmpty) {
        bar.style.background = '#333';
        label.textContent = 'Preview warna akan muncul di sini';
        return;
      }
      bar.style.background = `linear-gradient(90deg,
    hsl(${hMin},${sMid}%,${lMid}%) 0%,
    hsl(${hMid},${sMid}%,${lMid}%) 50%,
    hsl(${hMax},${sMid}%,${lMid}%) 100%)`;
      label.textContent = `H ${hMin}–${hMax} · S ${sMin}–${sMax}% · L ${lMin}–${lMax}%`;
    }

    function resetSeragamTypeForm() {
      dom.setText('seragamTypeFormTitle', '➕ Tambah Jenis Seragam');
      $('seragamTypeEditId').value = '';
      $('inputSeragamLabel').value = '';
      $('inputSeragamWarna').value = '';
      $('inputSeragamEmoji').value = '';
      $('inputHMin').value = ''; $('inputHMax').value = '';
      $('inputSMin').value = ''; $('inputSMax').value = '';
      $('inputLMin').value = ''; $('inputLMax').value = '';
      updateHslPreview();
      dom.setText('btnSeragamTypeText', 'Simpan');
      const r = $('seragamTypeResult'); if (r) r.style.display = 'none';
    }

    function editSeragamType(id, warna, label, emoji, hMin, hMax, sMin, sMax, lMin, lMax) {
      dom.setText('seragamTypeFormTitle', '✏️ Edit Jenis Seragam');
      $('seragamTypeEditId').value = id;
      $('inputSeragamLabel').value = label;
      $('inputSeragamWarna').value = warna;
      $('inputSeragamEmoji').value = emoji;
      $('inputHMin').value = hMin ?? ''; $('inputHMax').value = hMax ?? '';
      $('inputSMin').value = sMin ?? ''; $('inputSMax').value = sMax ?? '';
      $('inputLMin').value = lMin ?? ''; $('inputLMax').value = lMax ?? '';
      updateHslPreview();
      dom.setText('btnSeragamTypeText', 'Perbarui');
      $('seragamTypeForm').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    /**
     * Submit form tambah/edit jenis seragam.
     * @returns {Promise<void>}
     */
        async function submitSeragamType() {
      const label = $('inputSeragamLabel').value.trim();
      const warna = $('inputSeragamWarna').value.trim().toLowerCase().replace(/\s+/g, '_');
      const emoji = $('inputSeragamEmoji').value.trim();
      const editId = $('seragamTypeEditId').value.trim();
      const hMin = $('inputHMin').value !== '' ? Number($('inputHMin').value) : null;
      const hMax = $('inputHMax').value !== '' ? Number($('inputHMax').value) : null;
      const sMin = $('inputSMin').value !== '' ? Number($('inputSMin').value) : null;
      const sMax = $('inputSMax').value !== '' ? Number($('inputSMax').value) : null;
      const lMin = $('inputLMin').value !== '' ? Number($('inputLMin').value) : null;
      const lMax = $('inputLMax').value !== '' ? Number($('inputLMax').value) : null;
      dom.hide('seragamTypeResult');

      if (!label || !warna || !emoji) {
        showResult('seragamTypeResult', 'seragamTypeRIcon', 'seragamTypeRTitle', 'seragamTypeRMsg', 'warning', '⚠️', 'Lengkapi Form', 'Label, kode warna, dan emoji wajib diisi.');
        dom.show('seragamTypeResult', 'flex'); return;
      }
      // Validasi: jika sebagian HSL diisi, semua harus diisi
      const hslFilled = [hMin, hMax, sMin, sMax, lMin, lMax].filter(v => v !== null);
      if (hslFilled.length > 0 && hslFilled.length < 6) {
        showResult('seragamTypeResult', 'seragamTypeRIcon', 'seragamTypeRTitle', 'seragamTypeRMsg', 'warning', '⚠️', 'HSL Tidak Lengkap', 'Isi semua 6 nilai HSL, atau kosongkan semua (baju bebas).');
        dom.show('seragamTypeResult', 'flex'); return;
      }

      const btn = $('btnSeragamTypeSubmit');
      if (btn) btn.disabled = true;
      try {
        const payload = { id: editId || warna, warna, label, emoji, hMin, hMax, sMin, sMax, lMin, lMax, diubah_oleh: MY_ID };
        const { ok: postOk, data: res } = await apiPost(P.seragamTypeAdd, payload);
        if (!postOk) throw new Error(`HTTP ${200}`);
        showResult('seragamTypeResult', 'seragamTypeRIcon', 'seragamTypeRTitle', 'seragamTypeRMsg', 'success', '✅',
          editId ? 'Seragam Diperbarui!' : 'Seragam Ditambahkan!',
          `${emoji} ${label} berhasil ${editId ? 'diperbarui' : 'ditambahkan'}.`);
        dom.show('seragamTypeResult', 'flex');
        resetSeragamTypeForm();
        _seragamTypeRawCache = null; // invalidasi cache agar reload dari server
        await loadSeragamTypeAdmin();
      } catch (e) {
        showResult('seragamTypeResult', 'seragamTypeRIcon', 'seragamTypeRTitle', 'seragamTypeRMsg', 'warning', '⚠️', 'Gagal ke Server',
          'Pastikan webhook seragam-type-add aktif di n8n.\n' + e.message);
        dom.show('seragamTypeResult', 'flex');
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    async function deleteSeragamType(id, warna, label) {
      if (!confirm(`Hapus jenis seragam "${label}"?\n\nPastikan tidak ada hari yang masih menggunakan jenis ini.`)) return;
      try {
        const { ok, data: res } = await apiPost(P.seragamTypeDel, { id, warna, diubah_oleh: MY_ID });
        if (!ok) throw new Error('Hapus seragam gagal');
        showResult('seragamTypeResult', 'seragamTypeRIcon', 'seragamTypeRTitle', 'seragamTypeRMsg', 'success', '✅', 'Dihapus!', `${label} berhasil dihapus.`);
        dom.show('seragamTypeResult', 'flex');
        _seragamTypeRawCache = null; // invalidasi cache
        await loadSeragamTypeAdmin();
      } catch (e) {
        showResult('seragamTypeResult', 'seragamTypeRIcon', 'seragamTypeRTitle', 'seragamTypeRMsg', 'warning', '⚠️', 'Gagal',
          'Pastikan webhook seragam-type-delete aktif di n8n.\n' + e.message);
        dom.show('seragamTypeResult', 'flex');
      }
    }

    function renderSeragamAdmin() {
      const el = $('seragamAdminList');
      if (!el) return;

      // Hari kerja yang bisa dipilih (Senin-Jumat = 1-5, Sabtu = 6 opsional)
      // Format: { idx, singkat, nama }
      const HARI_KERJA = [
        { idx: 1, singkat: 'Sen', nama: 'Senin' },
        { idx: 2, singkat: 'Sel', nama: 'Selasa' },
        { idx: 3, singkat: 'Rab', nama: 'Rabu' },
        { idx: 4, singkat: 'Kam', nama: 'Kamis' },
        { idx: 5, singkat: 'Jum', nama: 'Jumat' },
        { idx: 6, singkat: 'Sab', nama: 'Sabtu' },
      ];

      // Tampilkan seragam bukan libur saja
      const opts = SERAGAM_OPTIONS.filter(o => o.warna !== null);

      let html = '';

      // Baris hari libur info
      html += `<div style="display:flex;gap:6px;align-items:center;padding:8px 10px;background:rgba(255,255,255,.02);border:1px dashed rgba(255,255,255,.08);border-radius:10px;margin-bottom:4px">
    <span style="font-size:14px">🏠</span>
    <div>
      <div style="font-size:10px;font-weight:700;color:var(--muted)">Minggu & Sabtu</div>
      <div style="font-size:9px;color:rgba(255,255,255,.3)">Hari libur — tidak ada pemeriksaan seragam</div>
    </div>
  </div>`;

      opts.forEach(opt => {
        const aktifHari = HARI_KERJA.filter(h => {
          const w = JADWAL_SERAGAM[h.idx]?.warna;
          const arr = Array.isArray(w) ? w : _parseWarnaArray(w);
          return arr.includes(opt.warna);
        });
        const aktifIdxSet = new Set(aktifHari.map(h => h.idx));
        const hslBg = opt.hMin !== null
          ? `linear-gradient(90deg,hsl(${opt.hMin},${Math.round(((opt.sMin || 0) + (opt.sMax || 100)) / 2)}%,${Math.round(((opt.lMin || 0) + (opt.lMax || 100)) / 2)}%) 0%,hsl(${Math.round((opt.hMin + opt.hMax) / 2)},${Math.round(((opt.sMin || 0) + (opt.sMax || 100)) / 2)}%,${Math.round(((opt.lMin || 0) + (opt.lMax || 100)) / 2)}%) 50%,hsl(${opt.hMax},${Math.round(((opt.sMin || 0) + (opt.sMax || 100)) / 2)}%,${Math.round(((opt.lMin || 0) + (opt.lMax || 100)) / 2)}%) 100%)`
          : opt.preview;
        const hslInfo = opt.hMin !== null
          ? `H${opt.hMin}–${opt.hMax} · S${opt.sMin}–${opt.sMax}% · L${opt.lMin}–${opt.lMax}%`
          : 'Tidak cek warna (bebas)';

        html += `
    <div style="background:rgba(255,255,255,.04);border:1px solid rgba(201,168,76,.15);border-radius:12px;padding:10px 12px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <span style="width:32px;height:32px;border-radius:8px;flex-shrink:0;display:inline-block;background:${hslBg};border:1px solid rgba(255,255,255,.15)"></span>
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;font-weight:700;color:var(--white)">${opt.emoji} ${opt.label}</div>
          <div style="font-size:8.5px;color:var(--muted);font-family:'JetBrains Mono',monospace">${hslInfo}</div>
        </div>
      </div>
      <div style="font-size:9px;color:var(--muted);margin-bottom:6px;font-weight:600">📅 AKTIF PADA HARI:</div>
      <div style="display:flex;gap:5px;flex-wrap:wrap">
        ${HARI_KERJA.map(h => {
          const aktif = aktifIdxSet.has(h.idx);
          return `<button type="button" onclick="toggleSeragamHari(${h.idx},'${opt.warna}')"
            style="padding:5px 10px;border-radius:8px;border:1.5px solid ${aktif ? 'var(--gold)' : 'rgba(255,255,255,.12)'};background:${aktif ? 'rgba(201,168,76,.2)' : 'rgba(255,255,255,.03)'};cursor:pointer;font-size:10px;font-weight:${aktif ? '700' : '500'};color:${aktif ? 'var(--gold)' : 'rgba(255,255,255,.35)'};transition:all .15s;min-width:38px;text-align:center">
            ${h.singkat}
          </button>`;
        }).join('')}
      </div>
    </div>`;
      });

      el.innerHTML = html;
    }

    // Toggle hari pada seragam tertentu (multi-select)
    function toggleSeragamHari(hariIdx, warna) {
      const cur = JADWAL_SERAGAM[hariIdx];
      if (!cur) return;

      // Selalu normalisasi ke array terlebih dahulu
      cur.warna = Array.isArray(cur.warna) ? cur.warna : _parseWarnaArray(cur.warna);

      const idx = cur.warna.indexOf(warna);
      if (idx >= 0) {
        cur.warna.splice(idx, 1);
      } else {
        cur.warna.push(warna);
      }

      const built = _buildSeragamLabel(cur.warna);
      cur.label = built.label;
      cur.emoji = built.emoji;

      renderSeragamAdmin();
    }

    // Tetap untuk kompatibilitas
    function patchSeragamHari(idx, warna, label, emoji) {
      const realWarna = warna === 'null' ? null : warna;
      JADWAL_SERAGAM[idx].warna = realWarna ? [realWarna] : [];
      const built = _buildSeragamLabel(JADWAL_SERAGAM[idx].warna);
      JADWAL_SERAGAM[idx].label = built.label;
      JADWAL_SERAGAM[idx].emoji = built.emoji;
      renderSeragamAdmin();
    }

    /**
     * Simpan konfigurasi seragam harian ke server.
     * @returns {Promise<void>}
     */
        async function simpanSeragamAdmin() {
      const btn = $('btnSimpanSeragam');
      if (btn) { btn.disabled = true; dom.setText('btnSeragamText', '💾 Menyimpan...'); }
      try {
        const rows = Object.keys(JADWAL_SERAGAM).map(k => {
          const d = JADWAL_SERAGAM[k];
          const warnaArr = Array.isArray(d.warna) ? d.warna : _parseWarnaArray(d.warna);
          const built = _buildSeragamLabel(warnaArr);
          return {
            hari_idx: parseInt(k),
            nama_hari: d.nama,
            warna: warnaArr.join(','),   // CSV: "coklat_khaki,putih"
            label: built.label,
            emoji: built.emoji,
          };
        });
        const { ok, data: res } = await apiPost(P.seragamSave, { rows, diubah_oleh: MY_ID, timestamp: Math.floor(Date.now() / 1000) });
        if (!ok) throw new Error('Simpan seragam gagal');
        showResult('seragamResult', 'seragamRIcon', 'seragamRTitle', 'seragamRMsg', 'success', '✅', 'Seragam Tersimpan!',
          'Jadwal seragam disimpan ke Google Sheets dan berlaku untuk semua pegawai.');
      } catch (e) {
        showResult('seragamResult', 'seragamRIcon', 'seragamRTitle', 'seragamRMsg', 'warning', '⚠️', 'Gagal ke Server',
          'Pastikan workflow n8n seragam-save aktif.\n' + e.message);
      } finally {
        if (btn) { setTimeout(() => { btn.disabled = false; dom.setText('btnSeragamText', 'Simpan Pengaturan Seragam'); }, 2500); }
      }
    }

    /* ── Cache jenis seragam dari server (cegah double-fetch dengan loadSeragamTypeAdmin) ── */
    let _seragamTypeRawCache = null;

    /* ── Helper: apply raw rows dari server ke SERAGAM_OPTIONS ── */
    function _applySeragamTypeRows(rows) {
      if (!Array.isArray(rows) || !rows.length) return;
      SERAGAM_OPTIONS = rows.map(r => ({
        id: String(r.id || r.warna || ''),
        warna: r.warna || null,
        label: r.label,
        emoji: r.emoji,
        preview: _seragamPreviewFromWarna(r.warna),
        hMin: r.hMin !== '' && r.hMin !== null && r.hMin !== undefined ? Number(r.hMin) : null,
        hMax: r.hMax !== '' && r.hMax !== null && r.hMax !== undefined ? Number(r.hMax) : null,
        sMin: r.sMin !== '' && r.sMin !== null && r.sMin !== undefined ? Number(r.sMin) : null,
        sMax: r.sMax !== '' && r.sMax !== null && r.sMax !== undefined ? Number(r.sMax) : null,
        lMin: r.lMin !== '' && r.lMin !== null && r.lMin !== undefined ? Number(r.lMin) : null,
        lMax: r.lMax !== '' && r.lMax !== null && r.lMax !== undefined ? Number(r.lMax) : null,
      }));
      if (!SERAGAM_OPTIONS.find(o => o.warna === null)) {
        SERAGAM_OPTIONS.push({ id: '0', warna: null, label: 'Libur (Tidak Cek)', emoji: '🏠', preview: '#1a2540', hMin: null, hMax: null, sMin: null, sMax: null, lMin: null, lMax: null });
      }
    }

    async function loadSeragamPublik() {
      // Paralelkan kedua request sekaligus — tidak tunggu satu selesai dulu
      const [typeResult, schedResult] = await Promise.allSettled([
        apiGet(P.seragamTypeList),
        apiFetch(P.seragamGet, { method: 'GET' })
      ]);

      // Proses seragamTypeList
      if (typeResult.status === 'fulfilled' && typeResult.value.ok) {
        try {
          const d = typeResult.value?.data ?? {};
          const rows = d.data || d || [];
          _seragamTypeRawCache = rows;      // simpan untuk loadSeragamTypeAdmin()
          _applySeragamTypeRows(rows);
        } catch (_) { }
      }

      // Proses jadwal seragam per hari
      if (schedResult.status === 'fulfilled' && schedResult.value.ok) {
        try {
          const d = schedResult.value?.data ?? {};
          const rows = d.data || d || [];
          if (Array.isArray(rows) && rows.length) {
            const map = {};
            rows.forEach(r => {
              const idx = parseInt(r.hari_idx);
              if (!isNaN(idx)) map[idx] = { warna: r.warna || null, label: r.label, emoji: r.emoji };
            });
            _applySeragamData(map);
          }
        } catch (_) { }
      }
    }


    /* ════════════════════════════════════════════════════════
       MANAJEMEN ADMIN — baca/tulis sheet admin_list via n8n
       Endpoint: gunakan user-list webhook untuk read,
                 dan endpoint khusus admin-list untuk write
       ════════════════════════════════════════════════════════ */

