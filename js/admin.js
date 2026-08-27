/* ════ ADMIN — LIBUR, LOKASI, SERAGAM, PEGAWAI, LOG, JAM ════ */
    /* ════ HARI LIBUR & JAM PEGAWAI ════ */

    // Fetch libur dari n8n untuk dipakai rekap

    async function fetchInstansiList() {
      try {
        console.log('[Instansi] Fetching list...');
        const res = await apiFetch(P.instansiList, { method: 'GET' });
        if (!res.ok) {
          console.error('[Instansi] API Error:', res.status);
          const el = $('regInstansi');
          if (el) el.innerHTML = '<option value="">— Gagal memuat instansi —</option>';
          return;
        }
        const json = await res.json();
        console.log('[Instansi] Raw JSON:', json);
        let data = parseApiResponse(json);

        // Cache the instansi mapping in localStorage for global access
        try {
          const instMap = {};
          data.forEach(i => {
            const id = i.id || i.ID || i.instansi_id || '';
            if (id) instMap[id.toLowerCase()] = i;
          });
          localStorage.setItem('absen_instansi_map', JSON.stringify(instMap));
          window.INSTANSI_LIST = Object.keys(instMap).map(k => instMap[k]);
          
          console.log('[Instansi] Cached full mapping to localStorage:', instMap);

          if (typeof applyInstansiBranding === 'function') applyInstansiBranding();
          
          if (typeof populateSuperadminInstansiSelect === 'function') {
            populateSuperadminInstansiSelect();
          }
          // Populate other scoping dropdowns if present
          if (typeof initSuperadminAdminScoping === 'function') initSuperadminAdminScoping();
          if (typeof initSuperadminRekapScoping === 'function') initSuperadminRekapScoping();
          if (typeof initSuperadminTugasScoping === 'function') initSuperadminTugasScoping();
          if (typeof initSuperadminLemburScoping === 'function') initSuperadminLemburScoping();
          if (typeof initSuperadminConfigScoping === 'function') initSuperadminConfigScoping();
          if (typeof loadLokasiAdmin === 'function') loadLokasiAdmin();
        } catch(e) {
          console.error('[Instansi] Cache error:', e);
        }
        
        const el = $('regInstansi');
        if (!el) return;
        
        if (!data || data.length === 0) {
          console.warn('[Instansi] No data found in response');
          el.innerHTML = '<option value="">— Tidak ada data instansi —</option>';
          return;
        }
        
        el.innerHTML = '<option value="">— Pilih Instansi —</option>' + 
          data.map(i => {
              const id = i.id || i.ID || i.instansi_id || '';
              const name = i.nama_instansi || i.nama || i.Nama_Instansi || id || 'Instansi';
              return `<option value="${id}">${name}</option>`;
          }).join('');
        console.log('[Instansi] Populated', data.length, 'items');

        // Jika hanya ada 1 instansi selain BAPPERIDA (atau jika bapperida dipilih), auto-load bidang
        const selected = el.value || (data.length === 1 ? data[0].id : '');
        if (selected) fetchBidangList(selected);

      } catch (e) {
        console.error('[Instansi] Error:', e);
        const el = $('regInstansi');
        if (el) el.innerHTML = `<option value="">— Error: ${escapeHtml(e.message || 'Koneksi Terputus')} —</option>`;
      }
    }

    async function fetchBidangList(instansiId) {
      const el = $('regBidang');
      if (!el) return;
      if (!instansiId) {
        el.innerHTML = '<option value="">— Pilih Bidang —</option>';
        return;
      }
      try {
        el.innerHTML = '<option value="">— Memuat Bidang... —</option>';
        console.log('[Bidang] Fetching for:', instansiId);
        const res = await apiFetch(`${P.bidangList}?instansi_id=${instansiId}`, { method: 'GET' });
        if (!res.ok) throw new Error(res.status);
        const json = await res.json();
        
        let data = [];
        if (Array.isArray(json)) data = json;
        else if (json && Array.isArray(json.data)) data = json.data;
        
        if (!data || data.length === 0) {
          el.innerHTML = '<option value="">— Tidak ada data bidang —</option>';
          return;
        }
        
        el.innerHTML = '<option value="">— Pilih Bidang —</option>' + 
          data.map(b => `<option value="${b.nama_bidang || b.nama || b.id}">${b.nama_bidang || b.nama || b.id}</option>`).join('');
        console.log('[Bidang] Populated', data.length, 'items');
      } catch (e) {
        console.error('[Bidang] Error:', e);
        el.innerHTML = '<option value="">— Error memuat bidang —</option>';
      }
    }

    async function fetchLiburForRekap() {
      try {
        const res = await apiFetch(P.liburList, { method: 'GET' });
        if (!res.ok) return;
        const d = await res.json();
        const rows = d.data || d.rows || [];
        hariLiburMap = {};
        rows.forEach(r => {
          const tgl = String(r.tanggal || r.Tanggal || '').trim();
          if (tgl) hariLiburMap[tgl] = r.nama || r.Nama || r.keterangan || r.Keterangan || 'Hari Libur';
        });
        hariLiburSet = new Set(Object.keys(hariLiburMap));
        liburLoaded = true;
      } catch (_) { }
    }

    // Fetch jam per pegawai dari user_list (kolom jam_masuk, jam_pulang)
    async function fetchJamPegawai() {
      try {
        const res = await apiFetch(`${P.userList}`, { method: 'GET' });
        if (!res.ok) return;
        const d = await res.json();
        const rows = Array.isArray(d) ? d : (d.data || d.rows || []);
        jamPegawaiMap = {};
        rows.forEach(r => {
          const id = String(r.id || r.ID || '').trim();
          const jm = (r.jam_masuk || r['Jam Masuk'] || '').trim();
          const jp = (r.jam_pulang || r['Jam Pulang'] || '').trim();
          if (id && (jm || jp)) {
            const toM = s => { const [h, m] = (s || '').split(':').map(Number); return (isNaN(h) || isNaN(m)) ? null : h * 60 + m; };
            jamPegawaiMap[id] = {
              masuk: jm || null, pulang: jp || null,
              masukMenit: toM(jm), pulangMenit: toM(jp)
            };
          }
        });
      } catch (_) { }
    }

    // Durasi preview saat range berubah
    function updateLiburDurasi() {
      const mulai = $('inputTglLiburMulai').value, selesai = $('inputTglLiburSelesai').value;
      const info = $('liburDurasiInfo'), teks = $('liburDurasiTeks');
      if (!mulai) { if (info) info.style.display = 'none'; return; }
      if (!selesai || selesai < mulai) {
        if ($('inputTglLiburSelesai')) $('inputTglLiburSelesai').value = mulai;
        if (info) info.style.display = 'none'; return;
      }
      const d1 = new Date(mulai), d2 = new Date(selesai);
      const days = Math.round((d2 - d1) / (864e5)) + 1;
      if (info) { info.style.display = 'block'; }
      if (teks) { teks.textContent = days === 1 ? `1 hari (${mulai})` : `${days} hari (${mulai} s.d. ${selesai})`; }
    }
    document.addEventListener('DOMContentLoaded', () => {
      const m = $('inputTglLiburMulai'), s = $('inputTglLiburSelesai');
      if (m) m.addEventListener('change', updateLiburDurasi);
      if (s) s.addEventListener('change', updateLiburDurasi);
    });

    // Admin: tambah hari libur (support range multi-hari)
    async function handleTambahLibur() {
      const mulai = $('inputTglLiburMulai').value;
      let selesai = $('inputTglLiburSelesai').value || mulai;
      const nama = $('inputNamaLibur').value.trim();
      if (!mulai) { showResult('liburResult', 'liburRIcon', 'liburRTitle', 'liburRMsg', 'warning', '⚠️', 'Pilih Tanggal', 'Tanggal mulai libur wajib dipilih.'); dom.show('liburResult', 'flex'); return; }
      if (selesai < mulai) selesai = mulai;
      // Hitung semua tanggal dalam range
      const dates = [];
      const cur = new Date(mulai);
      const end = new Date(selesai);
      while (cur <= end) {
        dates.push(cur.toISOString().split('T')[0]);
        cur.setDate(cur.getDate() + 1);
      }
      setBtnL('btnTambahLibur', true, `Menyimpan ${dates.length} hari...`);
      dom.hide('liburResult');
      let ok = 0, fail = 0;
      for (const tgl of dates) {
        try {
          const res = await apiFetch(P.liburAdd, { method: 'POST', body: JSON.stringify({ tanggal: tgl, nama: nama || 'Hari Libur', ditambahkan_oleh: MY_ID, admin_ids: ADMIN_IDS, timestamp: Math.floor(Date.now() / 1000) }) });
          let d = {}; try { d = await res.json() } catch (_) { }
          if (d.ok !== false) { ok++; hariLiburSet.add(tgl); } else fail++;
        } catch { fail++; }
      }
      if (ok > 0) {
        const msg = dates.length > 1 ? `${ok} tanggal berhasil ditambahkan${fail ? `, ${fail} gagal` : ''}.` : `${mulai} — ${nama || 'Hari Libur'} ditambahkan.`;
        showResult('liburResult', 'liburRIcon', 'liburRTitle', 'liburRMsg', 'success', '✅', 'Berhasil', msg);
        $('inputTglLiburMulai').value = ''; $('inputTglLiburSelesai').value = ''; $('inputNamaLibur').value = '';
        if ($('liburDurasiInfo')) dom.hide('liburDurasiInfo');
        liburLoaded = true; loadLiburAdmin();
      } else {
        showResult('liburResult', 'liburRIcon', 'liburRTitle', 'liburRMsg', 'fail', '❌', 'Gagal', 'Semua tanggal gagal disimpan. Coba lagi.');
      }
      dom.show('liburResult', 'flex');
      setBtnL('btnTambahLibur', false, '➕ Tambah Hari Libur');
    }

    // Admin: load daftar libur — tampilan lebih baik
    async function loadLiburAdmin() {
      const el = $('liburAdminList');
      if (!el) return;
      dom.shimmer(el.id, 2);
      try {
        const res = await apiFetch(P.liburList, { method: 'GET' });
        if (!res.ok) throw 0;
        const d = await res.json();
        const rows = (d.data || d.rows || [])
          .filter(r => String(r.tanggal || r.Tanggal || '').trim())
          .sort((a, b) => (a.tanggal || '').localeCompare(b.tanggal || ''));
        hariLiburMap = {};
        rows.forEach(r => { const t = String(r.tanggal || r.Tanggal || '').trim(); if (t) hariLiburMap[t] = r.nama || r.Nama || r.keterangan || r.Keterangan || 'Hari Libur'; });
        hariLiburSet = new Set(Object.keys(hariLiburMap));
        liburLoaded = true;
        const badge = $('liburTotalBadge');
        if (badge) { badge.textContent = rows.length; badge.style.display = rows.length ? 'inline-block' : 'none'; }
        if (!rows.length) {
          el.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:11px;padding:16px">Belum ada hari libur tersimpan.</div>';
          return;
        }
        const BULAN = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
        const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        const byMonth = {};
        rows.forEach(r => {
          const tgl = r.tanggal || r.Tanggal || '';
          const ym = tgl.slice(0, 7);
          if (!byMonth[ym]) byMonth[ym] = [];
          byMonth[ym].push(r);
        });
        el.innerHTML = Object.entries(byMonth).map(([ym, items]) => {
          const [y, m] = ym.split('-');
          const label = `${BULAN[parseInt(m)]} ${y}`;
          const itemsHtml = items.map(r => {
            const tgl = r.tanggal || r.Tanggal || '';
            const nm = r.nama || r.Nama || '—';
            const rn = r.row_number || r.rowNumber || '';
            const dt = new Date(tgl + 'T00:00:00');
            const hari = HARI[dt.getDay()];
            const tgl_fmt = tgl.split('-').reverse().join('/');
            const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
            return `<div class="libur-item">
          <div class="libur-item-left">
            <span class="libur-item-tgl">${tgl_fmt}</span>
            <span class="libur-item-day" style="color:${isWeekend ? 'var(--danger)' : 'var(--muted)'}">${hari}</span>
            <span class="libur-item-nama">${nm}</span>
          </div>
          <button class="libur-del-btn" onclick="hapusLibur('${tgl}',${rn})" title="Hapus">🗑️</button>
        </div>`;
          }).join('');
          return `<div style="margin-bottom:12px">
        <div class="libur-month-header"><span>📅 ${label}</span><span class="libur-badge">${items.length} hari</span></div>
        <div style="display:flex;flex-direction:column;gap:5px">${itemsHtml}</div>
      </div>`;
        }).join('');
      } catch {
        el.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:11px;padding:12px">Gagal memuat. Tekan 🔄 untuk coba lagi.</div>';
      }
    }

    // Admin: hapus hari libur
    async function hapusLibur(tgl, rowNum) {
      if (!confirm(`Hapus hari libur ${tgl}?`)) return;
      try {
        const res = await apiFetch(P.liburDel, { method: 'POST', body: JSON.stringify({ tanggal: tgl, row_number: rowNum, timestamp: Math.floor(Date.now() / 1000) }) });
        hariLiburSet.delete(tgl);
        loadLiburAdmin();
      } catch { alert('Gagal menghapus. Coba lagi.'); }
    }

    /* ════ ADMIN ════ */
    function toggleHariCheck(label) {
      const cb = label.querySelector('input');
      cb.checked = !cb.checked;
      label.classList.toggle('checked', cb.checked);
    }
    let adminMap = null, adminMarker = null, selectedPin = null, adminMapInited = false;
    function initAdminMap() {
      if (adminMapInited || !IS_ADMIN) return;
      adminMapInited = true;
      setTimeout(() => {
        adminMap = L.map('adminMap', { zoomControl: true }).setView([-9.6567, 119.3894], 14);
        L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', { attribution: '© Google', maxZoom: 20 }).addTo(adminMap);
        adminMap.on('click', e => {
          const { lat, lng } = e.latlng; selectedPin = { lat, lng };
          if (adminMarker) adminMap.removeLayer(adminMarker);
          adminMarker = L.marker([lat, lng], { icon: L.divIcon({ html: `<div style="background:#a78bfa;width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.6)"></div>`, iconSize: [20, 20], iconAnchor: [10, 10] }) }).addTo(adminMap);
          $('pinLat').textContent = lat.toFixed(6); $('pinLon').textContent = lng.toFixed(6);
          $('mapCoords').classList.add('show');
        });
        loadLokasiAdmin();
      }, 150);
    }
    async function handleTambahLokasi() {
      const nama = $('namaLokasi').value.trim(), radius = parseInt($('radiusLokasi').value) || 100;
      const ipRange = ($('ipRangeLokasi')?.value || '').split(',').map(s => s.trim()).filter(Boolean).join(',');
      if (!selectedPin) { showResult('adminResult', 'adminRIcon', 'adminRTitle', 'adminRMsg', 'warning', '⚠️', 'Pilih Lokasi', 'Tap pada peta untuk menentukan titik lokasi.'); return; }
      if (!nama) { showResult('adminResult', 'adminRIcon', 'adminRTitle', 'adminRMsg', 'warning', '⚠️', 'Nama Kosong', 'Masukkan nama lokasi terlebih dahulu.'); return; }
      const hariChecked = Array.from(document.querySelectorAll('#hariCheckGrid input:checked')).map(el => el.value);
      if (!hariChecked.length) { showResult('adminResult', 'adminRIcon', 'adminRTitle', 'adminRMsg', 'warning', '⚠️', 'Pilih Hari', 'Pilih minimal satu hari aktif.'); return; }
      const hariStr = hariChecked.join(',');
      setBtnL('btnTambahLokasi', true, 'Menyimpan...');
      try {
        await apiFetch(P.lokasiAdd, { method: 'POST', body: JSON.stringify({ nama_lokasi: nama, latitude: selectedPin.lat, longitude: selectedPin.lng, radius, hari: hariStr, ip_range: ipRange, ditambahkan_oleh: MY_ID, timestamp: Math.floor(Date.now() / 1000) }) });
        const ipInfo = ipRange ? `\n🌐 IP Range: ${ipRange}` : '';
        showResult('adminResult', 'adminRIcon', 'adminRTitle', 'adminRMsg', 'success', '📌', 'Lokasi Tersimpan!', `${nama}\nHari aktif: ${hariStr}\nLat: ${selectedPin.lat.toFixed(6)}, Lng: ${selectedPin.lng.toFixed(6)}${ipInfo}`);
        setBtnL('btnTambahLokasi', false, 'Simpan Lokasi ke Database');
        $('namaLokasi').value = ''; if ($('ipRangeLokasi')) $('ipRangeLokasi').value = ''; selectedPin = null;
        if (adminMarker) { adminMap.removeLayer(adminMarker); adminMarker = null; }
        $('mapCoords').classList.remove('show');
        document.querySelectorAll('#hariCheckGrid .hari-check-label').forEach(l => {
          const val = l.querySelector('input').value;
          const def = ['senin', 'selasa', 'rabu', 'kamis', 'jumat'].includes(val);
          l.classList.toggle('checked', def);
          l.querySelector('input').checked = def;
        });
        loadLokasiAdmin();
      } catch { showResult('adminResult', 'adminRIcon', 'adminRTitle', 'adminRMsg', 'fail', '🔌', 'Gagal Menyimpan', 'Server tidak merespons.'); setBtnL('btnTambahLokasi', false, 'Simpan Lokasi ke Database'); }
    }
    async function loadLokasiAdmin() {
      const el = $('lokasiMgmtList');
      dom.shimmer(el.id, 2);
      let list = [];
      try {
        const res = await apiFetch(P.lokasiList, { method: 'GET' }); if (!res.ok) throw 0;
        const json = await res.json(); list = Array.isArray(json) ? json : (json.data || []);
        if (!list.length) {
          el.innerHTML = `<div class="empty-state" style="padding:16px"><div class="empty-icon">📭</div><div class="empty-text">Belum ada lokasi tersimpan</div></div>`;
        } else {
          if (adminMap) {
            // Clear existing markers/circles before re-adding
            adminMap.eachLayer((layer) => {
              if (layer instanceof L.Circle || layer instanceof L.Marker) {
                adminMap.removeLayer(layer);
              }
            });
            list.forEach(l => { const lat = parseFloat(l.latitude || l.lat || 0), lng = parseFloat(l.longitude || l.lng || 0); if (!lat || !lng) return; L.circle([lat, lng], { radius: l.radius || 100, color: '#c9a84c', fillColor: 'rgba(201,168,76,.1)', fillOpacity: 1, weight: 1 }).addTo(adminMap).bindTooltip(l.nama_lokasi || l.nama || 'Lokasi'); });
          }
          // ── Rebuild LOK_DEF dari datatable pakai kolom hari ──
          const newLOK = {};
          list.forEach(l => {
            const nama = l.nama_lokasi || l.nama || '';
            const hariRaw = (l.hari || '').toLowerCase();
            if (hariRaw) {
              hariRaw.split(',').map(h => h.trim()).filter(Boolean).forEach(h => {
                if (!newLOK[h]) newLOK[h] = [];
                if (!newLOK[h].includes(nama)) newLOK[h].push(nama);
              });
            }
          });
          // Hapus semua key lama lalu assign baru
          Object.keys(LOK_DEF).forEach(k => delete LOK_DEF[k]);
          Object.assign(LOK_DEF, newLOK);
          // ── Rebuild jadwalLokData untuk Jadwal UI baru ──
          jadwalLokData = list.map(l => ({
            id: l.id || l.ID || '',
            nama: l.nama_lokasi || l.nama || '',
            radius: l.radius || 100,
            lat: l.latitude || l.lat || 0,
            lng: l.longitude || l.lng || 0,
            hari: (l.hari || '').toLowerCase().split(',').map(h => h.trim()).filter(Boolean)
          }));
          updateClock();
          const cntBadge = $('lokasiCountBadge');
          if (cntBadge) { cntBadge.textContent = list.length + ' lokasi'; cntBadge.style.display = list.length ? 'inline' : 'none'; }
          el.innerHTML = list.map((l, idx) => {
            const lat = parseFloat(l.latitude || l.lat || 0).toFixed(5);
            const lng = parseFloat(l.longitude || l.lng || 0).toFixed(5);
            const id = l.id || l.ID || '';
            const radius = l.radius || 100;
            const ipVal = (l.ip_range || l.IP_Range || '');
            const namaEsc = (l.nama_lokasi || l.nama || '').replace(/'/g, '&apos;');
            const hariAktif = (l.hari || '').toLowerCase().split(',').map(h => h.trim()).filter(Boolean);
            const hariCount = hariAktif.length;
            const hariToggles = HARI_KERJA.map(h => {
              const aktif = hariAktif.includes(h.id);
              return `<button class="jadwal-hari-btn${aktif ? ' aktif' : ''}" onclick="toggleHariLokasi(${idx},'${h.id}',this)">${h.label}</button>`;
            }).join('');
            const badgeStyle = hariCount > 0
              ? 'background:var(--gold-dim);color:var(--gold);border:1px solid rgba(201,168,76,.3)'
              : 'background:rgba(239,68,68,.1);color:#ef4444;border:1px solid rgba(239,68,68,.3)';
            return `<div id="lokasi-item-${id}" style="background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:13px;margin-bottom:8px;overflow:hidden">
          <div style="display:flex;align-items:center;gap:9px;padding:10px 12px 9px">
            <div style="width:30px;height:30px;border-radius:8px;background:var(--gold-dim);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">📍</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:700;color:var(--white)">${l.nama_lokasi || l.nama || '—'}</div>
              <div style="font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--muted);margin-top:1px">${lat}, ${lng}</div>
            </div>
            <button class="btn-del" onclick="hapusLokasi('${id}','${namaEsc}')">🗑</button>
          </div>
          <div style="height:1px;background:rgba(255,255,255,.05);margin:0 12px"></div>
          <div style="padding:9px 12px 8px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px">
              <span style="font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em">📅 Hari Aktif</span>
              <span id="hariCountBadge-${id}" style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:20px;${badgeStyle}">${hariCount > 0 ? hariCount + ' hari' : 'Nonaktif'}</span>
            </div>
            <div class="jadwal-hari-toggles">${hariToggles}</div>
          </div>
          <div style="height:1px;background:rgba(255,255,255,.05);margin:0 12px"></div>
          <div style="padding:9px 12px 9px;display:flex;flex-direction:column;gap:7px">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;width:48px;flex-shrink:0">📏 Radius</span>
              <input type="number" id="radius-input-${id}" value="${radius}" min="10" max="5000"
                style="width:74px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:7px;padding:4px 8px;color:var(--white);font-family:'JetBrains Mono',monospace;font-size:11px;outline:none;transition:border-color .2s"
                onfocus="this.style.borderColor='var(--gold)'" onblur="this.style.borderColor='rgba(255,255,255,.12)'"/>
              <span style="font-size:10px;color:var(--muted)">meter</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;width:48px;flex-shrink:0">🌐 IP</span>
              <input type="text" id="ip-input-${id}" value="${ipVal}" placeholder="cth: 36.84.0.0/16"
                style="flex:1;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:7px;padding:4px 8px;color:var(--white);font-family:'JetBrains Mono',monospace;font-size:10px;outline:none;transition:border-color .2s"
                onfocus="this.style.borderColor='rgba(34,197,94,.6)'" onblur="this.style.borderColor='rgba(255,255,255,.12)'"/>
            </div>
          </div>
          <div style="height:1px;background:rgba(255,255,255,.05);margin:0 12px"></div>
          <div style="padding:8px 12px 10px">
            <button onclick="simpanLokasiItem('${id}','${namaEsc}',${idx})" id="btnSimpanLokasi-${id}"
              style="width:100%;padding:8px;border-radius:9px;border:none;background:linear-gradient(135deg,var(--gold),#9b6e1a);color:var(--navy);font-size:11px;font-weight:800;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px">
              <span>💾</span><span id="btnSimpanLokasiTxt-${id}">Simpan Perubahan</span>
            </button>
            <div id="simpanLokasiResult-${id}" style="display:none;margin-top:6px;padding:6px 10px;border-radius:8px;font-size:10px;font-weight:700;text-align:center"></div>
          </div>
        </div>`;
          }).join('');
        }
      } catch { el.innerHTML = `<div class="empty-state" style="padding:16px"><div class="empty-icon">🔌</div><div class="empty-text">Gagal memuat</div></div>`; }
      renderJadwalAdmin();
    }
    async function hapusLokasi(id, nama) {
      if (!confirm(`Hapus lokasi "${nama}"?`)) return;
      try { await apiFetch(`${P.lokasiDel}?id=${id}`, { method: 'DELETE' }); loadLokasiAdmin(); }
      catch { alert('Gagal menghapus. Coba lagi.'); }
    }

    async function simpanLokasiItem(id, nama, idx) {
      const btn = $(`btnSimpanLokasi-${id}`);
      const txtEl = $(`btnSimpanLokasiTxt-${id}`);
      const resEl = $(`simpanLokasiResult-${id}`);
      if (btn) { btn.disabled = true; if (txtEl) txtEl.textContent = 'Menyimpan...'; }
      const radiusInp = $(`radius-input-${id}`);
      const ipInp = $(`ip-input-${id}`);
      const radius = parseInt(radiusInp?.value || 100);
      const ip_range = (ipInp?.value || '').trim();
      if (isNaN(radius) || radius < 10 || radius > 5000) {
        if (radiusInp) { radiusInp.style.borderColor = 'var(--danger)'; setTimeout(() => { radiusInp.style.borderColor = 'rgba(255,255,255,.12)'; }, 1500); }
        if (btn) { btn.disabled = false; if (txtEl) txtEl.textContent = 'Simpan Perubahan'; }
        return;
      }
      const lok = jadwalLokData[idx];
      const hariStr = lok ? (lok.hari || []).join(',') : '';
      try {
        await apiFetch(P.lokasiUpdate, { method: 'POST', body: JSON.stringify({ id, nama_lokasi: nama, radius, hari: hariStr, ip_range }) });
        if (lok) lok.radius = radius;
        Object.keys(LOK_DEF).forEach(k => delete LOK_DEF[k]);
        jadwalLokData.forEach(l => { (l.hari || []).forEach(h => { if (!LOK_DEF[h]) LOK_DEF[h] = []; if (!LOK_DEF[h].includes(l.nama)) LOK_DEF[h].push(l.nama); }); });
        updateClock();
        if (resEl) { resEl.style.cssText = 'display:block;margin-top:6px;padding:6px 10px;border-radius:8px;font-size:10px;font-weight:700;text-align:center;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.25);color:var(--success)'; resEl.textContent = '✅ Tersimpan!'; }
        setTimeout(() => { if (resEl) resEl.style.display = 'none'; }, 2500);
      } catch (_) {
        if (resEl) { resEl.style.cssText = 'display:block;margin-top:6px;padding:6px 10px;border-radius:8px;font-size:10px;font-weight:700;text-align:center;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);color:var(--danger)'; resEl.textContent = '🔌 Gagal menyimpan.'; }
        setTimeout(() => { if (resEl) resEl.style.display = 'none'; }, 3000);
      } finally {
        if (btn) { btn.disabled = false; if (txtEl) txtEl.textContent = 'Simpan Perubahan'; }
      }
    }

    /* ════ JADWAL LOKASI ADMIN ════ */
    const HARI_KERJA = [
      { id: 'senin', label: 'Sen' },
      { id: 'selasa', label: 'Sel' },
      { id: 'rabu', label: 'Rab' },
      { id: 'kamis', label: 'Kam' },
      { id: 'jumat', label: 'Jum' },
      { id: 'sabtu', label: 'Sab' },
      { id: 'minggu', label: 'Min' },
    ];

    // jadwalLokData: [ { id, nama, radius, lat, lng, hari:['senin','selasa',...] } ]
    let jadwalLokData = [];

    function renderJadwalAdmin() {
      const container = $('jadwalLokasiContainer');
      if (!container) return;

      if (!jadwalLokData.length) {
        container.innerHTML = `<div class="empty-state" style="padding:16px"><div class="empty-icon">🗺️</div><div class="empty-text">Belum ada lokasi</div><div class="empty-sub">Tambah lokasi terlebih dahulu</div></div>`;
        return;
      }

      container.innerHTML = jadwalLokData.map((lok, idx) => {
        const hariAktif = lok.hari || [];
        const toggles = HARI_KERJA.map(h => {
          const aktif = hariAktif.includes(h.id);
          return `<button class="jadwal-hari-btn${aktif ? ' aktif' : ''}"
        onclick="toggleHariLokasi(${idx},'${h.id}',this)">${h.label}</button>`;
        }).join('');

        const aktifCount = hariAktif.length;
        const badge = aktifCount > 0
          ? `<span class="jadwal-lok-badge">${aktifCount} hari</span>`
          : `<span class="jadwal-lok-badge" style="background:rgba(239,68,68,.1);color:#ef4444;border-color:rgba(239,68,68,.3)">Nonaktif</span>`;

        return `<div class="jadwal-lok-card">
      <div class="jadwal-lok-card-header">
        <div class="jadwal-lok-card-name"><span class="lok-icon">📍</span>${lok.nama}</div>
        ${badge}
      </div>
      <div class="jadwal-hari-toggles">${toggles}</div>
      <div class="jadwal-lok-meta">📏 ${lok.radius || 100}m &nbsp;·&nbsp; ${(parseFloat(lok.lat || 0)).toFixed(5)}, ${(parseFloat(lok.lng || 0)).toFixed(5)}</div>
    </div>`;
      }).join('');
    }

    function toggleHariLokasi(idx, hariId, btn) {
      if (!jadwalLokData[idx]) return;
      const lok = jadwalLokData[idx];
      if (!lok.hari) lok.hari = [];
      const i = lok.hari.indexOf(hariId);
      if (i > -1) {
        lok.hari.splice(i, 1);
        btn.classList.remove('aktif');
      } else {
        lok.hari.push(hariId);
        btn.classList.add('aktif');
      }
      // Update badge hari di header item
      const lokId = jadwalLokData[idx]?.id || '';
      const badge = lokId ? $(`hariCountBadge-${lokId}`) : null;
      if (badge) {
        const cnt = lok.hari.length;
        badge.textContent = cnt > 0 ? `${cnt} hari` : 'Nonaktif';
        badge.style.cssText = cnt > 0
          ? 'font-size:9px;font-weight:700;padding:2px 8px;border-radius:20px;background:var(--gold-dim);color:var(--gold);border:1px solid rgba(201,168,76,.3)'
          : 'font-size:9px;font-weight:700;padding:2px 8px;border-radius:20px;background:rgba(239,68,68,.1);color:#ef4444;border:1px solid rgba(239,68,68,.3)';
      }
    }

    async function simpanJadwal() {
      const btn = $('btnSimpanJadwal');
      if (btn) { btn.disabled = true; $('btnJadwalText').textContent = '💾 Menyimpan...'; }

      if (!jadwalLokData.length) {
        showResult('jadwalResult', 'jadwalRIcon', 'jadwalRTitle', 'jadwalRMsg', 'warning', '⚠️', 'Tidak Ada Lokasi', 'Muat daftar lokasi terlebih dahulu.');
        if (btn) { btn.disabled = false; $('btnJadwalText').textContent = 'Simpan Jadwal'; }
        return;
      }

      let berhasil = 0, gagal = 0;
      for (const lok of jadwalLokData) {
        const hariStr = (lok.hari || []).join(',');
        try {
          await apiFetch(P.lokasiUpdate, {
            method: 'POST',
            body: JSON.stringify({ id: lok.id, nama_lokasi: lok.nama, hari: hariStr })
          });
          berhasil++;
        } catch (_) { gagal++; }
      }

      // Sync ke LOK_DEF
      Object.keys(LOK_DEF).forEach(k => delete LOK_DEF[k]);
      jadwalLokData.forEach(lok => {
        (lok.hari || []).forEach(h => {
          if (!LOK_DEF[h]) LOK_DEF[h] = [];
          if (!LOK_DEF[h].includes(lok.nama)) LOK_DEF[h].push(lok.nama);
        });
      });
      updateClock();

      if (gagal === 0) {
        showResult('jadwalResult', 'jadwalRIcon', 'jadwalRTitle', 'jadwalRMsg', 'success', '✅', 'Jadwal Tersimpan!', `${berhasil} lokasi berhasil diperbarui.`);
      } else {
        showResult('jadwalResult', 'jadwalRIcon', 'jadwalRTitle', 'jadwalRMsg', 'warning', '⚠️', 'Sebagian Gagal', `${berhasil} berhasil, ${gagal} gagal.`);
      }

      if (btn) { setTimeout(() => { btn.disabled = false; $('btnJadwalText').textContent = 'Simpan Jadwal'; }, 2500); }
    }

    // syncJadwalState: dipanggil dari loadLokasiAdmin setelah list dimuat
    function syncJadwalState() {
      // Sync LOK_DEF ke jadwalLokData.hari (dipanggil setelah load)
      jadwalLokData.forEach(lok => {
        // jadwalLokData sudah punya hari dari server, tidak perlu sync ulang
      });
    }

    /* ════ PENGATURAN JAM ABSEN (ADMIN) ════ */
    function updateJamPreview() {
      const jmStr = menitToStr(JAM_MASUK_MENIT);
      const jpStr = menitToStr(JAM_PULANG_MENIT);
      setT('prevMasuk', jmStr);
      setT('prevMasuk1', menitToStr(JAM_MASUK_MENIT + 1));  // Terlambat mulai dari JamMasuk+1
      setT('prevTengah', '11:59');                           // Terlambat s/d sebelum tengah hari
      setT('prevTengah2', '12:00');
      setT('prevPulang1', menitToStr(JAM_PULANG_MENIT - 1)); // Belum waktunya s/d JamPulang-1
      setT('prevPulang', jpStr);
    }

    function initJamAdminUI() {
      const inM = $('inputJamMasuk'), inP = $('inputJamPulang');
      if (!inM || !inP) return;
      inM.value = menitToStr(JAM_MASUK_MENIT);
      inP.value = menitToStr(JAM_PULANG_MENIT);
      updateJamPreview();
      inM.addEventListener('input', () => {
        const m = toMenitStr(inM.value);
        if (m !== null) { JAM_MASUK_MENIT = m; updateJamPreview(); updateClock(); }
      });
      inP.addEventListener('input', () => {
        const m = toMenitStr(inP.value);
        if (m !== null) { JAM_PULANG_MENIT = m; updateJamPreview(); updateClock(); }
      });
    }

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
    async function loadSeragamTypeAdmin() {
      const el = $('seragamTypeList');
      if (!el) return;
      dom.shimmer(el.id, 2);
      try {
        let rows = _seragamTypeRawCache;
        if (!rows) {
          // Cache belum ada (pertama kali buka admin) — fetch sekali, simpan cache
          const res = await apiFetch(P.seragamTypeList, { method: 'GET' });
          if (!res.ok) throw 0;
          const d = await res.json();
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
      $('seragamTypeFormTitle').textContent = '➕ Tambah Jenis Seragam';
      $('seragamTypeEditId').value = '';
      $('inputSeragamLabel').value = '';
      $('inputSeragamWarna').value = '';
      $('inputSeragamEmoji').value = '';
      $('inputHMin').value = ''; $('inputHMax').value = '';
      $('inputSMin').value = ''; $('inputSMax').value = '';
      $('inputLMin').value = ''; $('inputLMax').value = '';
      updateHslPreview();
      $('btnSeragamTypeText').textContent = 'Simpan';
      const r = $('seragamTypeResult'); if (r) r.style.display = 'none';
    }

    function editSeragamType(id, warna, label, emoji, hMin, hMax, sMin, sMax, lMin, lMax) {
      $('seragamTypeFormTitle').textContent = '✏️ Edit Jenis Seragam';
      $('seragamTypeEditId').value = id;
      $('inputSeragamLabel').value = label;
      $('inputSeragamWarna').value = warna;
      $('inputSeragamEmoji').value = emoji;
      $('inputHMin').value = hMin ?? ''; $('inputHMax').value = hMax ?? '';
      $('inputSMin').value = sMin ?? ''; $('inputSMax').value = sMax ?? '';
      $('inputLMin').value = lMin ?? ''; $('inputLMax').value = lMax ?? '';
      updateHslPreview();
      $('btnSeragamTypeText').textContent = 'Perbarui';
      $('seragamTypeForm').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

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
        const res = await apiFetch(P.seragamTypeAdd, { method: 'POST', body: JSON.stringify(payload) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
        const res = await apiFetch(P.seragamTypeDel, { method: 'POST', body: JSON.stringify({ id, warna, diubah_oleh: MY_ID }) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
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

    async function simpanSeragamAdmin() {
      const btn = $('btnSimpanSeragam');
      if (btn) { btn.disabled = true; $('btnSeragamText').textContent = '💾 Menyimpan...'; }
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
        const res = await apiFetch(P.seragamSave, { method: 'POST', body: JSON.stringify({ rows, diubah_oleh: MY_ID, timestamp: Math.floor(Date.now() / 1000) }) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        showResult('seragamResult', 'seragamRIcon', 'seragamRTitle', 'seragamRMsg', 'success', '✅', 'Seragam Tersimpan!',
          'Jadwal seragam disimpan ke Google Sheets dan berlaku untuk semua pegawai.');
      } catch (e) {
        showResult('seragamResult', 'seragamRIcon', 'seragamRTitle', 'seragamRMsg', 'warning', '⚠️', 'Gagal ke Server',
          'Pastikan workflow n8n seragam-save aktif.\n' + e.message);
      } finally {
        if (btn) { setTimeout(() => { btn.disabled = false; $('btnSeragamText').textContent = 'Simpan Pengaturan Seragam'; }, 2500); }
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
        apiFetch(P.seragamTypeList, { method: 'GET' }),
        apiFetch(P.seragamGet, { method: 'GET' })
      ]);

      // Proses seragamTypeList
      if (typeResult.status === 'fulfilled' && typeResult.value.ok) {
        try {
          const d = await typeResult.value.json();
          const rows = d.data || d || [];
          _seragamTypeRawCache = rows;      // simpan untuk loadSeragamTypeAdmin()
          _applySeragamTypeRows(rows);
        } catch (_) { }
      }

      // Proses jadwal seragam per hari
      if (schedResult.status === 'fulfilled' && schedResult.value.ok) {
        try {
          const d = await schedResult.value.json();
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

    async function loadPegawaiMgmt() {
      const el = $('pegawaiMgmtList');
      if (!el) return;
      dom.shimmer(el.id, 2);
      try {
        const res = await apiFetch(P.userList + '?format=full', { method: 'GET' });
        if (!res.ok) throw new Error('Refresh failed');
        const ud = await res.json();
        const users = (Array.isArray(ud) ? ud : (ud.data || [])).filter(u => (u.id || u.ID));

        if (!users.length) {
          el.innerHTML = `<div class="empty-state" style="padding:15px"><div class="empty-icon">👥</div><div class="empty-text">Belum ada data pegawai</div></div>`;
          return;
        }

        // Urutkan berdasarkan "no" (No Pegawai) secara numerik
        users.sort((a, b) => {
          const valA = parseInt(a.no || a.No || 9999);
          const valB = parseInt(b.no || b.No || 9999);
          return valA - valB;
        });

        el.innerHTML = users.map(u => {
          const uid = String(u.id || u.ID || '');
          const nama = u.nama || u.Nama || u.username || 'Tanpa Nama';
          const nip = u.nip || u.NIP || '—';
          const jab = u.jabatan || u.Jabatan || '—';
          const bid = u.bidang || u.Bidang || '—';
          const status = (u.status || u.Status || 'AKTIF').toUpperCase();
          const isAktif = status === 'AKTIF';

          return `<div class="face-adm-item" style="padding:10px 12px; margin-bottom:8px">
            <div class="face-adm-thumb" style="width:36px; height:36px; border-radius:10px; background:rgba(255,184,0,0.1); display:flex; align-items:center; justify-content:center; font-size:16px">
              ${isAktif ? '👤' : '💤'}
            </div>
            <div style="flex:1; min-width:0; margin-left:2px">
              <div class="face-adm-name" style="font-size:12px; margin-bottom:1px; color:#fff; display:flex; align-items:center; gap:6px;">
                ${nama}
                ${!isAktif ? `<span style="font-size:8px; padding:2px 6px; border-radius:4px; background:rgba(239,68,68,0.2); color:#f87171; border:1px solid rgba(239,68,68,0.4)">${status}</span>` : ''}
              </div>
              <div style="font-size:9px; color:rgba(255,255,255,0.4)">ID: ${uid} &nbsp;·&nbsp; ${jab} &nbsp;·&nbsp; ${bid}</div>
            </div>
            <div style="display:flex; gap:6px; margin-left:10px">
              <button onclick="editPegawai('${escapeHtml(uid)}')" style="background:rgba(96,165,250,0.1); border:1px solid rgba(110,131,236,0.35); color:#60a5fa; width:30px; height:30px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:12px; cursor:pointer">✍️</button>
              <button onclick="deletePegawai('${escapeHtml(uid)}', '${escapeHtml(nama)}')" style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); color:#f87171; width:30px; height:30px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:12px; cursor:pointer">🗑</button>
            </div>
          </div>`;
        }).join('');
      } catch (e) {
        console.error('[Fetch Pegawai Error]', e);
        el.innerHTML = `<div class="empty-state" style="padding:15px"><div class="empty-icon">🔌</div><div class="empty-text">Gagal memuat data pegawai</div><div class="empty-sub">${escapeHtml(e.message || 'Coba lagi beberapa saat')}</div></div>`;
      }
    }

    function showAddPegawai() {
      const f = $('pegawaiForm');
      if (!f) return;
      $('pegawaiFormTitle').textContent = '➕ TAMBAH PEGAWAI BARU';
      $('editPegawaiId').value = '';
      $('inPegawaiId').value = '';
      dom.setDisabled('inPegawaiId', false);
      $('inPegawaiNama').value = '';
      $('inPegawaiNo').value = '';
      $('inPegawaiNip').value = '';
      $('inPegawaiJabatan').value = '';
      $('inPegawaiRole').value = 'USER';
      $('inPegawaiStatus').value = 'AKTIF';
      dom.hide('pegawaiFormResult');
      f.style.display = 'block';
      f.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function hidePegawaiForm() {
      const f = $('pegawaiForm');
      if (f) f.style.display = 'none';
      dom.hide('pegawaiFormResult');
    }

    async function editPegawai(uid) {
      const f = $('pegawaiForm');
      if (!f) return;
      if (!requireAdmin()) return;
      try {
        // Find existing data in list (to avoid extra fetch)
        // Or fetch single if needed. For now, try logic: fetch all or find in cache
        const ur = await apiFetch(P.userList + '?user_id=' + uid, { method: 'GET' });
        if (!ur.ok) return;
        const res = await ur.json();
        const p = res.single ? res : (res.data ? res.data[0] : null);
        if (!p) return;

        $('pegawaiFormTitle').textContent = '✍️ EDIT DATA PEGAWAI';
        $('editPegawaiId').value = uid;
        $('inPegawaiId').value = uid;
        dom.setDisabled('inPegawaiId', true); // Telegram ID cannot be changed in edit
        $('inPegawaiNama').value = p.nama || p.Nama || '';
        $('inPegawaiNo').value = p.no || '';
        $('inPegawaiNip').value = p.nip || p.NIP || '';
        $('inPegawaiJabatan').value = p.jabatan || p.Jabatan || '';
        $('inPegawaiBidang').value = p.bidang || p.Bidang || '';
        $('inPegawaiPangkat').value = p.pangkat || p.Pangkat || '';

        // Auto select Tipe based on string content if not explicit
        const pkt = (p.pangkat || '').toUpperCase();
        if (pkt.includes('GOLONGAN')) $('inPegawaiTipe').value = 'PPPK';
        else if (pkt.includes('/') || pkt.includes('JURU') || pkt.includes('PENGATUR') || pkt.includes('PENATA') || pkt.includes('PEMBINA')) $('inPegawaiTipe').value = 'PNS';
        else $('inPegawaiTipe').value = 'NONASN';
        _updatePangkatDropdown('inPegawaiPangkat', $('inPegawaiTipe').value);
        $('inPegawaiPangkat').value = p.pangkat || '';

        $('inPegawaiRole').value = (p.role || p.Role || 'USER').toUpperCase();
        $('inPegawaiStatus').value = (p.real_status || p.status || p.Status || 'AKTIF').toUpperCase();

        f.style.display = 'block';
        f.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (e) { console.error('Edit error:', e); }
    }

    async function savePegawai() {
      const editId = $('editPegawaiId').value;
      const isEdit = !!editId;
      let id = $('inPegawaiId').value.trim();
      const nama = $('inPegawaiNama').value.trim();
      const no = $('inPegawaiNo').value;
      const nip = $('inPegawaiNip').value.trim().replace(/\s/g, '');
      const jabatan = $('inPegawaiJabatan').value.trim();
      const pangkat = $('inPegawaiPangkat').value;
      const bidang = $('inPegawaiBidang').value;
      const role = $('inPegawaiRole').value;
      const status = $('inPegawaiStatus').value;

      if (!isEdit && !id) {
        id = String(Math.floor(1000000000 + Math.random() * 9000000000));
      }

      if (!id || !nama) {
        showResult('pegawaiFormResult', 'pegawaiFormRIcon', 'pegawaiFormRTitle', 'pegawaiFormRMsg', 'warning', '⚠️', 'Data Kurang', 'Nama wajib diisi.');
        return;
      }

      $('btnSavePegawaiTxt').textContent = 'Menyimpan...';
      try {
        const path = isEdit ? P.userEdit : P.userAdd;
        const mainPayload = { id, nama, no, nip, jabatan, pangkat, bidang, role, status, instansi_id: 'bapperida' };

        const res = await apiFetch(path, {
          method: 'POST',
          body: JSON.stringify(mainPayload)
        });
        const d = await res.json().catch(() => ({}));

        if (!res.ok || d.ok === false) {
          showResult('pegawaiFormResult', 'pegawaiFormRIcon', 'pegawaiFormRTitle', 'pegawaiFormRMsg', 'fail', '❌', 'Gagal', d.message || 'Gagal menyimpan data pegawai.');
        } else {
          // ── SYNC ADMIN LOGIC (Request User) ──
          // Jika role adalah ADMIN atau SUPERADMIN, sync ke webhook admin-add
          const cleanRole = role.toLowerCase().replace(/\s+/g, '');
          if (cleanRole === 'admin' || cleanRole === 'superadmin') {
            try {
              console.log('[Sync] Detecting Admin role, syncing to admin-add...');
              await apiFetch(P.adminAdd, {
                method: 'POST',
                body: JSON.stringify({
                  telegram_id: Number(id),
                  nama: nama,
                  role: cleanRole,
                  ditambahkan_oleh: Number(MY_ID)
                })
              });
            } catch (err) {
              console.warn('[Sync] Gagal sync ke admin-list (opsional):', err.message);
            }
          }

          showResult('pegawaiFormResult', 'pegawaiFormRIcon', 'pegawaiFormRTitle', 'pegawaiFormRMsg', 'success', '✅', 'Berhasil', isEdit ? 'Data pegawai diperbarui.' : 'Pegawai baru ditambahkan.');
          setTimeout(hidePegawaiForm, 2500);
          loadPegawaiMgmt();
        }
      } catch (e) {
        console.error('[SavePegawai] Error:', e);
        showResult('pegawaiFormResult', 'pegawaiFormRIcon', 'pegawaiFormRTitle', 'pegawaiFormRMsg', 'fail', '🔌', 'Koneksi Error', `Server tidak merespons: ${e.message}`);
      }
      $('btnSavePegawaiTxt').textContent = 'Simpan Data';
    }

    async function deletePegawai(uid, nama) {
      if (!requireAdmin()) return;
      if (!confirm(`Hapus pegawai "${nama}" (${uid})?\nData wajah dan ttd mungkin juga tidak akan bisa digunakan lagi.`)) return;
      try {
        const res = await apiFetch(P.userDel, {
          method: 'POST',
          body: JSON.stringify({ id: uid })
        });
        const d = await res.json();
        if (d.ok !== false) {
          loadPegawaiMgmt();
        } else {
          alert('Gagal: ' + (d.message || 'Error server'));
        }
      } catch (e) { alert('Server error'); }
    }

    /* ════ LOG MANAGEMENT (ADMIN) ════ */
    function getLogId(obj) {
      if (!obj) return '';
      // Prioritas Utama: ID_Log (numeric Primary Key)
      if (obj.ID_Log) return String(obj.ID_Log);
      if (obj.id_log) return String(obj.id_log);
      if (obj.ID_LOG) return String(obj.ID_LOG);
      if (obj.ID_log) return String(obj.ID_log);
      if (obj.Id_Log) return String(obj.Id_Log);
      
      // Case-insensitive check
      for (const k of Object.keys(obj)) {
        const lk = k.toLowerCase();
        if (lk === 'id_log' || lk === 'idlog' || lk === 'log_id') {
          if (obj[k]) return String(obj[k]);
        }
      }
      return '';
    }

    async function openLogEditor(uid = '', date = '', log = null, hintJenis = '') {
      const modal = $('logModal');
      if (!modal) return;

      // Load pegawai list for dropdown if first time
      await loadLogPegawaiList();

      // Find the existing ID from various sources
      let existingId = log ? getLogId(log) : '';

      // SMART UI DETECTION: If ID still missing, search in our global order cache
      if (!existingId && uid && date) {
        const p = (window.userListOrder || []).find(u => String(u.id) === String(uid));
        if (p) {
          // Check which log we should prioritize based on possible selection
          // If log data was passed but has no ID, or if we have a hintJenis
          const hJ = (hintJenis || '').toUpperCase();
          const isM = hJ.includes('MASUK');
          const isP = hJ.includes('PULANG');

          const logsToCheck = [];
          if (isM) { if (p._rawMasukLog) logsToCheck.push(p._rawMasukLog); }
          else if (isP) { if (p._rawPulangLog) logsToCheck.push(p._rawPulangLog); }
          else {
            if (p._rawMasukLog) logsToCheck.push(p._rawMasukLog);
            if (p._rawPulangLog) logsToCheck.push(p._rawPulangLog);
            if (p._rawKetLog) logsToCheck.push(p._rawKetLog);
          }

          for (const l of logsToCheck) {
            const lid = getLogId(l);
            if (lid) {
              const lTime = (l.Jam || l.jam || '').substring(0, 5);
              const paramTime = log ? ((log.Jam || log.jam || '').substring(0, 5)) : '';
              if (paramTime && lTime === paramTime) {
                existingId = lid;
                break;
              }
              // If we have a hint, and this is the record of that type, we target it
              if (hJ) {
                const lJ = (l['Jenis Absen'] || l.jenis_absen || l.Jenis || '').toUpperCase();
                if (lJ.includes(hJ)) {
                   existingId = lid;
                   break;
                }
              }
            }
          }
        }
      }

      $('editLogId').value = existingId;
      $('inLogPegawai').value = uid;
      $('inLogTanggal').value = date || fmtD(nowWITA());
      $('inLogJam').value = log ? ((log.Jam || log.jam || '').substring(0, 5)) : '';
      $('inLogJenis').value = log ? (log['Jenis Absen'] || log.jenis_absen || log.Jenis || 'MASUK') : (hintJenis || 'MASUK');
      $('inLogKet').value = log ? (log.Ket || log.ket || log.keterangan || '') : '';
      dom.hide('logFormResult');

      const isActualEdit = !!existingId;
      if (isActualEdit) {
        $('logModalTitle').textContent = 'UPDATE LOG ABSEN';
        $('logModalIcon').textContent = '📝';
        $('btnSaveLogTxt').textContent = 'Perbarui Log';
      } else {
        $('logModalTitle').textContent = 'TAMBAH LOG MANUAL';
        $('logModalIcon').textContent = '➕';
        $('btnSaveLogTxt').textContent = 'Simpan Log';
      }

      modal.style.display = 'flex';
    }

    function closeLogEditor() {
      dom.hide('logModal');
    }

    let _pegawaiListCache = null;
    async function loadLogPegawaiList() {
      const select = $('inLogPegawai');
      if (!select || select.options.length > 1) return;

      try {
        const res = await apiFetch(P.userList + '?format=full', { method: 'GET' });
        if (!res.ok) return;
        const data = await res.json();
        const users = (Array.isArray(data) ? data : (data.data || [])).filter(u => u.id || u.ID);

        _pegawaiListCache = users; // Store in cache for saveLog reference

        // Urutkan berdasarkan ID (numerik)
        users.sort((a, b) => Number(a.id || a.ID || 0) - Number(b.id || b.ID || 0));

        users.forEach(u => {
          const opt = document.createElement('option');
          opt.value = u.id || u.ID;
          opt.textContent = `${u.nama || u.Nama} (${u.id || u.ID})`;
          select.appendChild(opt);
        });
      } catch (e) { console.error('Load log pegawai failed', e); }
    }

    async function saveLog() {
      let editId = $('editLogId').value;
      const uid = $('inLogPegawai').value;
      const tgl = $('inLogTanggal').value;
      const jamRaw = $('inLogJam').value;
      const jenis = $('inLogJenis').value;
      const ket = $('inLogKet').value.trim();

      // SMART DETECTION: If no editId is set, check if we already have this log in memory (rekap view)
      if (!editId && uid && tgl && jenis) {
        const p = (window.userListOrder || []).find(u => String(u.id) === String(uid));
        if (p) {
          const jU = jenis.toUpperCase();
          const isMasuk = jU.includes('MASUK');
          const isPulang = jU.includes('PULANG');
          const existing = isMasuk ? p._rawMasukLog : (isPulang ? p._rawPulangLog : p._rawKetLog);
          const lid = existing ? getLogId(existing) : '';
          if (lid) {
            editId = lid;
            console.log(`[Smart Log] Detected existing record: ${editId}. Switching to EDIT mode.`);
          }
        }
      }

      const isEdit = !!editId;

      if (!uid || !tgl || !jamRaw) {
        showResult('logFormResult', 'logFormRIcon', 'logFormRTitle', 'logFormRMsg', 'warning', '⚠️', 'Data Kurang', 'Pegawai, Tanggal, dan Jam wajib diisi.');
        return;
      }

      setBtnL('btnSaveLog', true, 'Menyimpan...');
      try {
        const path = isEdit ? P.logEdit : P.logAdd;

        // Cari data p untuk nama & nip (utamakan cache dari dropdown)
        const pData = (_pegawaiListCache || []).find(u => String(u.id || u.ID) === String(uid))
          || (window.userListOrder || []).find(u => String(u.id) === String(uid))
          || {};

        const res = await apiFetch(path, {
          method: 'POST',
          body: JSON.stringify({
            ID_Log: editId,
            telegram_id: uid,
            nama: pData.nama || pData.Nama || '',
            nip: pData.nip || pData.NIP || '',
            tanggal: tgl,
            jam: jamRaw,
            jenis_absen: jenis,
            keterangan: ket,
            admin_id: MY_ID,
            timestamp: Math.floor(Date.now() / 1000)
          })
        });
        const d = await res.json().catch(() => ({}));

        if (!res.ok || d.ok === false) {
          showResult('logFormResult', 'logFormRIcon', 'logFormRTitle', 'logFormRMsg', 'fail', '❌', 'Gagal', d.message || 'Gagal menyimpan log.');
        } else {
          showResult('logFormResult', 'logFormRIcon', 'logFormRTitle', 'logFormRMsg', 'success', '✅', 'Berhasil', isEdit ? 'Log absen diperbarui.' : 'Log absen manual ditambahkan.');
          setTimeout(() => {
            closeLogEditor();
            loadRekap(); // Refresh rekap after change
          }, 2000);
        }
      } catch (e) {
        showResult('logFormResult', 'logFormRIcon', 'logFormRTitle', 'logFormRMsg', 'fail', '🔌', 'Koneksi Error', 'Server tidak merespons.');
      } finally {
        setBtnL('btnSaveLog', false, 'Simpan Log');
      }
    }

    async function loadAdminMgmt() {
      const el = $('adminMgmtList');
      if (!el) return;
      dom.shimmer(el.id, 1);
      try {
        // Gunakan cache dari loadJamAbsen() — tidak perlu fetch ulang ke server
        const jam = _jamAbsenCache || await _getJamAbsen();
        const ids = (jam || {}).admin_ids || [];

        // Update global ADMIN_IDS jika perlu
        if (ids.length) {
          ADMIN_IDS.length = 0;
          ids.forEach(id => ADMIN_IDS.push(id));
          IS_ADMIN = ADMIN_IDS.includes(MY_ID);
          REKAP_CHAT_ID = ADMIN_IDS[0] || MY_ID;
        }

        if (!ids.length) {
          el.innerHTML = `<div class="empty-state" style="padding:12px"><div class="empty-icon">👥</div><div class="empty-text">Belum ada admin terdaftar</div></div>`;
          return;
        }

        // Untuk tampilkan nama, fetch dari user-list
        let namaMap = {};
        try {
          const ur = await apiFetch(P.userList + '?format=full', { method: 'GET' });
          if (ur.ok) {
            const ud = await ur.json();
            const users = Array.isArray(ud) ? ud : (ud.data || []);
            users.forEach(u => {
              const uid = parseInt(u.ID || u.id || u.telegram_id || 0);
              if (uid) {
                namaMap[uid] = u.Nama || u.nama || u.username || String(uid);
              }
            });
          }
        } catch (_) { }

        el.innerHTML = ids.map(id => {
          const nama = namaMap[id] || `ID: ${id}`;
          const isMe = id === MY_ID;
          // Role diambil dari window._adminRoleMap yang diisi oleh _getJamAbsen()
          const rawRole = window._adminRoleMap[id] || (isMe ? userProfile?.role : null) || 'admin';
          const rText = String(rawRole).toLowerCase().trim();
          // PENTING: ID pertama di ADMIN_IDS selalu Super Admin (Fallback)
          const isSAId = (Array.isArray(ADMIN_IDS) && ADMIN_IDS.length > 0 && String(id) === String(ADMIN_IDS[0]));
          const isSuperAdmin = rText.includes('super') || isSAId;
          
          console.log(`[AdminMgmt] ID: ${id}, RawRole: "${rawRole}", IsSuper: ${isSuperAdmin} (isSAId: ${isSAId})`);

          return `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--card-bg);border:1px solid var(--border);border-radius:10px;margin-bottom:6px">
        <div style="font-size:18px">${isSuperAdmin ? '👑' : '🛡️'}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:700;color:var(--text)">${nama}${isMe ? ' <span style="color:var(--gold);font-size:9px">(Anda)</span>' : ''}</div>
          <div style="font-size:9px;color:var(--muted);font-family:'JetBrains Mono',monospace">${id} · ${isSuperAdmin ? 'superadmin' : 'admin'}</div>
        </div>
        ${!isMe && ids.length > 1 ? `<button onclick="hapusAdmin(${id},'${nama.replace(/'/g, "&#39;")}')" style="padding:3px 10px;border-radius:7px;border:1px solid rgba(239,68,68,.3);background:rgba(239,68,68,.08);color:#ef4444;font-size:10px;font-weight:700;cursor:pointer">🗑 Hapus</button>` : ''}
      </div>`;
        }).join('');
      } catch (e) {
        el.innerHTML = `<div class="empty-state" style="padding:12px"><div class="empty-icon">🔌</div><div class="empty-text">Gagal memuat daftar admin</div></div>`;
      }
    }

    async function tambahAdmin() {
      const idInput = $('inputAdminTgId');
      const namaInput = $('inputAdminNama');
      const roleInput = $('inputAdminRole');
      const tgId = parseInt(idInput?.value || 0);
      const nama = (namaInput?.value || '').trim();
      const role = roleInput?.value || 'admin';

      if (!tgId || tgId < 1) {
        _showAdminMgmtResult('warning', '⚠️', 'ID Tidak Valid', 'Masukkan Telegram ID yang benar.');
        return;
      }
      if (ADMIN_IDS.includes(tgId)) {
        _showAdminMgmtResult('warning', '⚠️', 'Sudah Ada', `ID ${tgId} sudah terdaftar sebagai admin.`);
        return;
      }
      try {
        const res = await apiFetch(P.adminAdd, {
          method: 'POST', body: JSON.stringify({
            telegram_id: tgId, nama, role,
            ditambahkan_oleh: MY_ID,
            timestamp: Math.floor(Date.now() / 1000)
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) {
          _showAdminMgmtResult('warning', '⚠️', 'Ditolak', data.message || 'Gagal menambahkan admin.');
          return;
        }
        ADMIN_IDS.push(tgId);
        REKAP_CHAT_ID = ADMIN_IDS[0] || MY_ID;
        if (idInput) idInput.value = '';
        if (namaInput) namaInput.value = '';
        _showAdminMgmtResult('success', '✅', 'Admin Ditambahkan', `${nama || tgId} berhasil ditambahkan sebagai ${role}.`);
        loadAdminMgmt();
      } catch (e) {
        _showAdminMgmtResult('fail', '🔌', 'Gagal', 'Server tidak merespons. Coba lagi.');
      }
    }

    async function hapusAdmin(tgId, nama) {
      if (tgId === MY_ID) {
        _showAdminMgmtResult('warning', '⚠️', 'Tidak Bisa', 'Anda tidak bisa menghapus akun Anda sendiri.');
        return;
      }
      if (ADMIN_IDS.length <= 1) {
        _showAdminMgmtResult('warning', '⚠️', 'Minimal 1 Admin', 'Harus ada minimal 1 admin yang terdaftar.');
        return;
      }
      if (!confirm(`Hapus ${nama} (${tgId}) dari daftar admin?`)) return;
      try {
        const res = await apiFetch(P.adminDel + '?telegram_id=' + tgId, {
          method: 'DELETE',
          body: JSON.stringify({ ditambahkan_oleh: MY_ID })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) {
          _showAdminMgmtResult('warning', '⚠️', 'Ditolak', data.message || 'Gagal menghapus admin.');
          return;
        }
        const idx = ADMIN_IDS.indexOf(tgId);
        if (idx > -1) ADMIN_IDS.splice(idx, 1);
        REKAP_CHAT_ID = ADMIN_IDS[0] || MY_ID;
        _showAdminMgmtResult('success', '✅', 'Dihapus', `${nama} dihapus dari daftar admin.`);
        loadAdminMgmt();
      } catch (e) {
        _showAdminMgmtResult('fail', '🔌', 'Gagal', 'Server tidak merespons.');
      }
    }

    function _showAdminMgmtResult(type, icon, title, msg) {
      const el = $('adminMgmtResult');
      if (!el) return;
      el.style.display = 'block';
      showResult('adminMgmtResult', 'adminMgmtRIcon', 'adminMgmtRTitle', 'adminMgmtRMsg', type, icon, title, msg);
    }

    /* ── Cache bersama endpoint jamAbsen — P.jamAbsen hanya dipanggil 1× ──
       Baik loadJamAbsen() maupun loadAdminMgmt() memakai _getJamAbsen()
       sehingga tidak ada double-request ke server Google Sheets.           */
    let _jamAbsenCache = null;   // objek hasil JSON
    let _jamAbsenPromise = null;   // Promise aktif yang sedang berjalan

    async function _getJamAbsen() {
      if (_jamAbsenCache) return _jamAbsenCache;
      if (_jamAbsenPromise) return _jamAbsenPromise;
      const configSelect = $('configInstansiSelect');
      const instId = (configSelect && configSelect.value) || getScopedInstansiId();
      const url = instId ? `${P.jamAbsen}?instansi_id=${instId}` : P.jamAbsen;
      _jamAbsenPromise = apiFetch(url, { method: 'GET' })
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
        .then(d => {
          _jamAbsenCache = d.data || d;
          // Sinkronisasi role ke map global dari admin_list (bukan user_list)
          if (_jamAbsenCache.admin_roles) {
            Object.entries(_jamAbsenCache.admin_roles).forEach(([uid, role]) => {
              window._adminRoleMap[uid] = role;
            });
            // Re-apply admin UI jika role saya berubah (misal baru login)
            if (typeof _applyAdminUIExtended === 'function') _applyAdminUIExtended();
          }
          return _jamAbsenCache;
        })
        .catch(e => { _jamAbsenPromise = null; return Promise.reject(e); });
      return _jamAbsenPromise;
    }
    function _resetJamAbsenCache() {
      _jamAbsenCache = null;
      _jamAbsenPromise = null;
    }

    async function loadJamAbsen() {
      const uid = await waitForMyId();
      try {
        const jam = await _getJamAbsen();
        if (jam.masuk) { const m = toMenitStr(jam.masuk); if (m !== null) JAM_MASUK_MENIT = m; }
        if (jam.pulang) { const m = toMenitStr(jam.pulang); if (m !== null) JAM_PULANG_MENIT = m; }

        // ── Muat daftar admin dari server (dinamis, tanpa hardcode) ──
        if (Array.isArray(jam.admin_ids) && jam.admin_ids.length) {
          ADMIN_IDS.length = 0;
          jam.admin_ids.forEach(id => ADMIN_IDS.push(id));
        }
        IS_ADMIN = ADMIN_IDS.includes(uid);
        REKAP_CHAT_ID = ADMIN_IDS[0] || uid || null;
        _applyAdminUI();
        if (typeof _applyAdminUIExtended === 'function') _applyAdminUIExtended();

        try { localStorage.setItem('jam_absen_bapperida', JSON.stringify({ masuk: menitToStr(JAM_MASUK_MENIT), pulang: menitToStr(JAM_PULANG_MENIT) })); } catch (_) { }
        updateClock();
        initJamAdminUI();

        // FIX: Jika sedang di tab admin saat data jam/admin dimuat, refresh UI admin
        const activeTab = document.querySelector('.tab.active')?.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
        if (activeTab === 'admin' && IS_ADMIN) {
          _applyAdminUIExtended();
          // Trigger loading data admin jika baru pertama kali terbuka
          if (typeof loadKonfirmasiAdmin === 'function') loadKonfirmasiAdmin();
        }
      } catch (e) {
        initJamAdminUI();
      }
    }

    function _applyAdminUI() {
      const panelAdmin = $('panel-admin');
      if (!panelAdmin) return;

      // Update visibility of manual log button in Rekap tab
      const btnLog = $('btnTambahLog');
      if (btnLog) btnLog.style.display = IS_ADMIN ? 'inline-block' : 'none';

      if (!IS_ADMIN) {
        panelAdmin.style.display = 'none';
        // Sembunyikan tombol tab admin jika ada
        const btn = document.querySelector('.tab[data-tab="admin"]');
        if (btn) btn.style.display = 'none';
        // Jika sedang di tab admin (yang sekarang terlarang), kembali ke absen
        if (localStorage.getItem('absen_last_tab') === 'admin') switchTab('absen');
      } else {
        panelAdmin.style.display = '';
        // Buat tombol tab admin jika belum ada, lalu tampilkan
        setupAdminTab();
        const btn = document.querySelector('.tab[data-tab="admin"]');
        if (btn) btn.style.display = '';
      }
    }

    async function simpanJamAbsen() {
      const inM = $('inputJamMasuk'), inP = $('inputJamPulang');
      if (!inM || !inP) return;
      const mMasuk = toMenitStr(inM.value);
      const mPulang = toMenitStr(inP.value);
      if (mMasuk === null || mPulang === null) {
        showResult('jamResult', 'jamRIcon', 'jamRTitle', 'jamRMsg', 'warning', '⚠️', 'Input Tidak Valid', 'Pastikan format jam benar (HH:MM).');
        return;
      }
      if (mMasuk >= mPulang) {
        showResult('jamResult', 'jamRIcon', 'jamRTitle', 'jamRMsg', 'warning', '⚠️', 'Jam Tidak Logis', 'Jam masuk harus lebih kecil dari jam pulang.');
        return;
      }
      const btn = $('btnSimpanJam');
      if (btn) { btn.disabled = true; $('btnJamText').textContent = '💾 Menyimpan...'; }
      try {
        const configSelect = $('configInstansiSelect');
        const instId = (configSelect && configSelect.value) || getScopedInstansiId() || 'bapperida';
        await apiFetch(P.jamAbsen, { 
          method: 'POST', 
          body: JSON.stringify({ 
            masuk: inM.value, 
            pulang: inP.value, 
            instansi_id: instId,
            diubah_oleh: MY_ID, 
            timestamp: Math.floor(Date.now() / 1000) 
          }) 
        });
        // Invalidasi cache agar loadAdminMgmt() membaca data terbaru
        _jamAbsenCache = null; _jamAbsenPromise = null;
        JAM_MASUK_MENIT = mMasuk;
        JAM_PULANG_MENIT = mPulang;
        try { localStorage.setItem('jam_absen_bapperida', JSON.stringify({ masuk: inM.value, pulang: inP.value })); } catch (_) { }
        updateClock();
        updateJamPreview();
        showResult('jamResult', 'jamRIcon', 'jamRTitle', 'jamRMsg', 'success', '✅', 'Jam Tersimpan!',
          `Masuk ≤ ${inM.value} · Pulang ≥ ${inP.value}\nBerlaku langsung untuk semua pengguna.`);
      } catch {
        showResult('jamResult', 'jamRIcon', 'jamRTitle', 'jamRMsg', 'warning', '⚠️', 'Gagal Menyimpan',
          'Simpan lokal berhasil, tapi gagal ke server. Pastikan webhook jam-absen aktif di n8n.');
        JAM_MASUK_MENIT = mMasuk;
        JAM_PULANG_MENIT = mPulang;
        try { localStorage.setItem('jam_absen_bapperida', JSON.stringify({ masuk: inM.value, pulang: inP.value })); } catch (_) { }
        updateClock(); updateJamPreview();
      } finally {
        if (btn) { setTimeout(() => { btn.disabled = false; $('btnJamText').textContent = 'Simpan Pengaturan Jam'; }, 2500); }
      }
    }

    /* ════ JAM PERIODE KHUSUS (ADMIN) ════ */

    function _initPeriodeListeners() {
      ['inPeriodeNama', 'inPeriodeDari', 'inPeriodeSampai', 'inPeriodeMasuk', 'inPeriodePulang'].forEach(id => {
        const el = $(id); if (el) el.addEventListener('input', _updatePeriodePreview);
      });
    }

    function _updatePeriodePreview() {
      const nama = ($('inPeriodeNama')?.value || '').trim();
      const dari = $('inPeriodeDari')?.value || '';
      const sampai = $('inPeriodeSampai')?.value || '';
      const masuk = $('inPeriodeMasuk')?.value || '';
      const pulang = $('inPeriodePulang')?.value || '';
      const box = $('periodePreview');
      if (!box) return;
      if (!nama && !dari && !masuk) { box.style.display = 'none'; return; }
      const fmtD = s => { try { const d = new Date(s + 'T00:00:00'); return isNaN(d) ? s : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return s; } };
      box.style.display = 'block';
      box.innerHTML =
        `<b style="color:#a78bfa">🌙 ${nama || '(belum ada nama)'}</b><br>` +
        `📅 ${dari ? fmtD(dari) : '—'} s.d. ${sampai ? fmtD(sampai) : '—'}<br>` +
        `🟢 Masuk ≤ ${masuk || '—'} &nbsp;·&nbsp; 🔵 Pulang ≥ ${pulang || '—'}`;
    }
    let _faceSigCurrentTab = 'data';
    function switchFaceSigTab(tab) {
      _faceSigCurrentTab = tab;
      const dataTab = $('faceSigTabData');
      const faceTab = $('faceSigTabFace');
      const sigTab = $('faceSigTabSig');
      const btnData = $('tabDataBtn');
      const btnFace = $('tabFaceBtn');
      const btnSig = $('tabSigBtn');
      const btnAdd = $('btnAdminAddData');
      if (!dataTab || !faceTab || !sigTab) return;

      // Reset visibiliti & styling
      [dataTab, faceTab, sigTab].forEach(p => p.style.display = 'none');
      [btnData, btnFace, btnSig].forEach(b => {
        if (b) { b.style.background = 'transparent'; b.style.color = 'var(--muted)'; b.style.fontWeight = '700'; }
      });
      if (btnAdd) btnAdd.style.display = 'none';

      if (tab === 'data') {
        dataTab.style.display = 'block';
        if (btnData) { btnData.style.background = 'var(--gold)'; btnData.style.color = 'var(--bg)'; btnData.style.fontWeight = '800'; }
        if (btnAdd) btnAdd.style.display = 'block';
        // Auto fetch list jika belum ada isi
        loadPegawaiMgmt();
      } else if (tab === 'face') {
        faceTab.style.display = 'block';
        if (btnFace) { btnFace.style.background = 'var(--gold)'; btnFace.style.color = 'var(--bg)'; btnFace.style.fontWeight = '800'; }
        if ($('adminFaceRegList') && $('adminFaceRegList').children.length <= 2) loadAdminFaceReg();
      } else if (tab === 'sig') {
        sigTab.style.display = 'block';
        if (btnSig) { btnSig.style.background = 'var(--gold)'; btnSig.style.color = 'var(--bg)'; btnSig.style.fontWeight = '800'; }
        if (typeof loadAdminSigStatus === 'function') loadAdminSigStatus();
      }
    }

    function refreshFaceSigTab() {
      if (_faceSigCurrentTab === 'data') loadPegawaiMgmt();
      else if (_faceSigCurrentTab === 'face') loadAdminFaceReg();
      else if (_faceSigCurrentTab === 'sig') {
        if (typeof loadAdminSigStatus === 'function') loadAdminSigStatus();
      }
    }

    async function loadJamPeriodeAdmin() {
      const list = $('periodeAdminList');
      if (!list) return;
      list.innerHTML = '<div style="text-align:center;padding:14px;color:var(--muted);font-size:11px">⏳ Memuat...</div>';
      try {
        await fetchJamPeriode(); // pakai fungsi yang sudah ada (update jamPeriodeList)
        renderPeriodeAdminList();
      } catch {
        list.innerHTML = '<div style="text-align:center;padding:14px;color:var(--danger);font-size:11px">❌ Gagal memuat periode</div>';
      }
    }

    // Debug: cek tanggal apakah masuk periode atau tidak
    function debugCekPeriode() {
      const tgl = prompt('Masukkan tanggal (YYYY-MM-DD):');
      if (!tgl) return;
      const hasil = getJamForTanggal(tgl);
      const msg = hasil.nama
        ? `✅ ${tgl} → PERIODE: "${hasil.nama}"\nMasuk  : ${hasil.masuk}\nPulang : ${hasil.pulang}`
        : `🔵 ${tgl} → JAM GLOBAL\nMasuk  : ${hasil.masuk}\nPulang : ${hasil.pulang}`;
      alert(msg);
    }

    function renderPeriodeAdminList() {
      const list = $('periodeAdminList');
      if (!list) return;
      if (!jamPeriodeList.length) {
        list.innerHTML = '<div style="text-align:center;padding:14px;color:var(--muted);font-size:11px">📭 Belum ada periode khusus</div>';
        return;
      }
      const todayStr = fmtD(nowWITA());
      const fmtTgl = s => { try { const d = new Date(s + 'T00:00:00'); return isNaN(d) ? s : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return s; } };
      list.innerHTML = jamPeriodeList.map(p => {
        const aktif = todayStr >= p.dari && todayStr <= p.sampai;
        const expired = todayStr > p.sampai;
        const belumMulai = todayStr < p.dari;
        const statusLabel = aktif ? '● Aktif' : expired ? '✕ Expired' : '○ Belum Mulai';
        const statusColor = aktif ? '#a78bfa' : expired ? 'var(--danger)' : 'var(--muted)';
        const borderAlpha = aktif ? '.4' : expired ? '.2' : '.15';
        const bgAlpha = aktif ? '.07' : expired ? '.03' : '.04';
        return `<div style="background:rgba(167,139,250,${bgAlpha});border:1px solid rgba(167,139,250,${borderAlpha});border-radius:10px;padding:10px 12px;margin-bottom:7px;position:relative;${expired ? 'opacity:.6' : ''}">
      <div style="position:absolute;top:8px;right:10px;font-size:8px;font-weight:700;color:${statusColor};background:rgba(0,0,0,.2);border-radius:5px;padding:2px 6px">${statusLabel}</div>
      <div style="font-size:11px;font-weight:800;color:var(--white);margin-bottom:4px;padding-right:70px">${p.nama}</div>
      <div style="font-size:9px;color:var(--muted);margin-bottom:6px">📅 ${fmtTgl(p.dari)} — ${fmtTgl(p.sampai)}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <span style="font-size:9px;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.2);border-radius:6px;padding:2px 8px;color:var(--success)">🟢 Masuk ≤ ${p.masuk}</span>
        <span style="font-size:9px;background:rgba(96,165,250,.1);border:1px solid rgba(96,165,250,.2);border-radius:6px;padding:2px 8px;color:#60a5fa">🔵 Pulang ≥ ${p.pulang}</span>
        ${expired ? `<button onclick="hapusPeriodeAdmin('${p.id}')" style="font-size:8px;padding:2px 8px;border-radius:6px;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.25);color:var(--danger);cursor:pointer;font-weight:700;margin-left:auto">🗑️ Hapus</button>` : ''}
      </div>
    </div>`;
      }).join('');
    }


    function togglePeriodeForm(show) {
      const form = $('periodeForm');
      const btn = $('btnShowPeriodeForm');
      if (!form || !btn) return;
      form.style.display = show ? 'block' : 'none';
      btn.style.display = show ? 'none' : 'block';
      if (show) {
        // Init with default dates
        const now = new Date();
        const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0'), d = String(now.getDate()).padStart(2, '0');
        $('inPeriodeDari').value = `${y}-${m}-${d}`;
        $('inPeriodeSampai').value = `${y}-${m}-${d}`;
      }
    }

    async function submitTambahPeriode() {
      const nama = ($('inPeriodeNama')?.value || '').trim();
      const dari = $('inPeriodeDari')?.value || '';
      const sampai = $('inPeriodeSampai')?.value || '';
      const masuk = $('inPeriodeMasuk')?.value || '';
      const pulang = $('inPeriodePulang')?.value || '';

      if (!nama || !dari || !sampai || !masuk || !pulang) {
        showResult('periodeResult', 'periodeRIcon', 'periodeRTitle', 'periodeRMsg', 'warning', '⚠️', 'Field Belum Lengkap', 'Isi semua field: nama, tanggal, jam masuk & pulang.');
        return;
      }
      if (dari > sampai) {
        showResult('periodeResult', 'periodeRIcon', 'periodeRTitle', 'periodeRMsg', 'warning', '⚠️', 'Tanggal Tidak Valid', 'Tanggal selesai tidak boleh sebelum tanggal mulai.');
        return;
      }
      const mM = toMenitStr(masuk), mP = toMenitStr(pulang);
      if (mM === null || mP === null || mM >= mP) {
        showResult('periodeResult', 'periodeRIcon', 'periodeRTitle', 'periodeRMsg', 'warning', '⚠️', 'Jam Tidak Valid', 'Jam masuk harus lebih kecil dari jam pulang.');
        return;
      }
      const btn = $('btnTambahPeriode');
      if (btn) { btn.disabled = true; $('btnTambahPeriodeTxt').textContent = 'Menyimpan...'; }
      try {
        const res = await apiFetch(P.jamPeriodeAdd, {
          method: 'POST', body: JSON.stringify({
            nama, dari, sampai, masuk, pulang, ditambahkan_oleh: MY_ID,
            timestamp: new Date().toISOString()
          })
        });
        if (!res.ok) throw 0;
        // Reset form
        ['inPeriodeNama', 'inPeriodeDari', 'inPeriodeSampai', 'inPeriodeMasuk', 'inPeriodePulang'].forEach(id => { const el = $(id); if (el) el.value = ''; });
        dom.hide('periodePreview');
        showResult('periodeResult', 'periodeRIcon', 'periodeRTitle', 'periodeRMsg', 'success', '✅', 'Periode Tersimpan!', `🌙 ${nama} (${dari} s.d. ${sampai}) berhasil ditambahkan.`);
        setTimeout(() => togglePeriodeForm(false), 2000);
        await loadJamPeriodeAdmin();
      } catch {
        showResult('periodeResult', 'periodeRIcon', 'periodeRTitle', 'periodeRMsg', 'warning', '⚠️', 'Gagal Menyimpan', 'Pastikan webhook jam-periode-add aktif di n8n.');
      } finally {
        if (btn) { btn.disabled = false; $('btnTambahPeriodeTxt').textContent = '💾 Simpan Periode'; }
      }
    }

    // Alias untuk tombol hapus dari daftar periode (expired)
    function hapusPeriodeAdmin(id) {
      const p = jamPeriodeList.find(x => String(x.id) === String(id));
      const nama = p ? p.nama : id;
      hapusJamPeriode(id, nama);
    }

    async function hapusJamPeriode(id, nama) {
      if (!confirm(`Hapus periode "${nama}"?`)) return;
      try {
        const res = await apiFetch(P.jamPeriodeDel, { method: 'POST', body: JSON.stringify({ id }) });
        if (!res.ok) throw 0;
        showResult('periodeResult', 'periodeRIcon', 'periodeRTitle', 'periodeRMsg', 'success', '🗑️', 'Periode Dihapus', `"${nama}" berhasil dihapus.`);
        await loadJamPeriodeAdmin();
      } catch {
        showResult('periodeResult', 'periodeRIcon', 'periodeRTitle', 'periodeRMsg', 'warning', '⚠️', 'Gagal Hapus', 'Pastikan webhook jam-periode-delete aktif di n8n.');
      }
    }

    /* ════ FACE RECOGNITION TOGGLE ════ */

    // State lokal yang diubah oleh toggle button, disimpan saat klik Simpan
    let _faceTogglePending = null; // null = belum ada perubahan

    function _applyFaceToggleUI(enabled) {
      const sw = $('faceToggleSwitch');
      const knob = $('faceToggleKnob');
      const label = $('faceToggleLabel');
      const desc = $('faceToggleDesc');
      if (!sw || !knob) return;

      if (enabled) {
        if (sw) sw.style.background = '#22c55e'; // Green
        if (knob) knob.style.left = '27px';    // Right
        if (label) label.textContent = '🟢 Face Recognition Aktif';
        if (desc) desc.textContent = 'Pegawai wajib verifikasi wajah saat absen';
      } else {
        if (sw) sw.style.background = '#6b7280'; // Grey (Neutral Inactive)
        if (knob) knob.style.left = '3px';     // Left
        if (label) label.textContent = '⚪ Face Recognition Nonaktif';
        if (desc) desc.textContent = 'Absen tanpa verifikasi wajah (hanya GPS)';
      }
      // Sinkronisasi UI profil dengan status toggle
      if (typeof updateProfilFaceUI === 'function') updateProfilFaceUI();
    }

    async function loadFaceToggle() {
      try {
        const res = await apiFetch(P.faceToggle, { method: 'GET' });
        if (!res.ok) throw 0;
        const d = await res.json();
        FACE_RECOGNITION_ENABLED = d.enabled !== false;
      } catch {
        // Fallback: read from localStorage, then default to false (safe default)
        try {
          const v = localStorage.getItem('face_recognition_bapperida');
          if (v !== null) FACE_RECOGNITION_ENABLED = v !== '0';
          else FACE_RECOGNITION_ENABLED = false;
        } catch (_) {
          FACE_RECOGNITION_ENABLED = false;
        }
      }
      _faceTogglePending = FACE_RECOGNITION_ENABLED;
      _applyFaceToggleUI(FACE_RECOGNITION_ENABLED);
    }

    function toggleFaceRecognition() {
      // Flip state pending (belum ke server sampai klik Simpan)
      _faceTogglePending = !(_faceTogglePending ?? FACE_RECOGNITION_ENABLED);
      _applyFaceToggleUI(_faceTogglePending);
      // Sembunyikan result card jika muncul dari simpan sebelumnya
      const rc = $('faceToggleResult');
      if (rc) rc.style.display = 'none';
    }

    async function simpanFaceToggle() {
      const enabled = _faceTogglePending ?? FACE_RECOGNITION_ENABLED;
      const btn = $('btnSimpanFaceToggle');
      if (btn) { btn.disabled = true; $('btnFaceToggleText').textContent = '💾 Menyimpan...'; }
      const rc = $('faceToggleResult');
      if (rc) rc.style.display = 'flex';
      try {
        await apiFetch(P.faceToggle, { method: 'POST', body: JSON.stringify({ enabled, admin_id: MY_ID, admin_ids: ADMIN_IDS }) });
        FACE_RECOGNITION_ENABLED = enabled;
        try { localStorage.setItem('face_recognition_bapperida', enabled ? '1' : '0'); } catch (_) { }
        _applyFaceToggleUI(enabled);
        showResult('faceToggleResult', 'faceToggleRIcon', 'faceToggleRTitle', 'faceToggleRMsg', 'success', '✅',
          enabled ? 'Face Recognition Diaktifkan' : 'Face Recognition Dinonaktifkan',
          enabled
            ? 'Semua pegawai wajib verifikasi wajah saat absen.'
            : 'HADIR hanya menggunakan GPS, tanpa kamera.'
        );
      } catch {
        // Simpan lokal saja
        FACE_RECOGNITION_ENABLED = enabled;
        try { localStorage.setItem('face_recognition_bapperida', enabled ? '1' : '0'); } catch (_) { }
        showResult('faceToggleResult', 'faceToggleRIcon', 'faceToggleRTitle', 'faceToggleRMsg', 'warning', '⚠️', 'Tersimpan Lokal',
          'Berhasil disimpan di perangkat ini, tapi gagal ke server. Pastikan webhook face-toggle aktif di n8n.');
      } finally {
        if (btn) { setTimeout(() => { btn.disabled = false; $('btnFaceToggleText').textContent = 'Simpan Pengaturan Face Recognition'; }, 2500); }
      }
    }

    /* ════ AUTO INIT ════ */
    // Load lokasi dari server saat startup agar tab Absen langsung menampilkan lokasi
    async function loadLokasiPublik() {
      try {
        const res = await apiFetch(P.lokasiList, { method: 'GET' });
        if (!res.ok) throw 0;
        const json = await res.json();
        const list = Array.isArray(json) ? json : (json.data || []);
        if (!list.length) return;
        const newLOK = {};
        list.forEach(l => {
          const nama = l.nama_lokasi || l.nama || '';
          const hariRaw = (l.hari || '').toLowerCase();
          if (hariRaw) {
            hariRaw.split(',').map(h => h.trim()).filter(Boolean).forEach(h => {
              if (!newLOK[h]) newLOK[h] = [];
              if (!newLOK[h].includes(nama)) newLOK[h].push(nama);
            });
          }
        });
        Object.keys(LOK_DEF).forEach(k => delete LOK_DEF[k]);
        Object.assign(LOK_DEF, newLOK);
        // Simpan koordinat untuk passive GPS badge
        window._lokasiCoords = list.filter(l => l.latitude && l.longitude).map(l => ({
          nama: l.nama_lokasi || l.nama || 'Kantor',
          lat: parseFloat(l.latitude), lon: parseFloat(l.longitude),
          radius: parseFloat(l.radius) || 150
        }));
        updateClock(); // refresh lokasiList di tab Absen
        _updateLocBadgeGPS(); // update badge lokasi setelah koordinat tersedia
      } catch (_) { }
    }
    loadLokasiPublik();
    // Badge lokasi — dipanggil setelah koordinat lokasi tersedia
    // GPS badge — minta izin 1x, pakai watchPosition permanen (tidak restart)
    let _locWatchId = null;
    let _locPermDenied = false;

    function _applyLocPos(lat, lon) {
      if (!window._lokasiCoords || !window._lokasiCoords.length) return;
      let best = null, bestDist = Infinity;
      window._lokasiCoords.forEach(l => {
        const R = 6371000, dLat = (l.lat - lat) * Math.PI / 180, dLon = (l.lon - lon) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(l.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        if (dist < bestDist) { bestDist = dist; best = l; }
      });
      const clb = $('clockLocBadge'); if (!clb) return;
      if (best && bestDist <= (best.radius || 150)) {
        clb.textContent = '📍 ' + best.nama; clb.className = 'clock-loc-badge';
      } else {
        clb.textContent = '📍 Di luar area kantor'; clb.className = 'clock-loc-badge unknown';
      }
    }

    function _updateLocBadgeGPS() {
      if (!navigator.geolocation || _locPermDenied || _locWatchId !== null) return;

      // ── Permissions API: cek state izin tanpa trigger prompt ──
      const _permState = (_readPermStore()['geolocation']) || 'unknown';
      if (_permState === 'denied') {
        _locPermDenied = true;
        const clb = $('clockLocBadge');
        if (clb) { clb.textContent = '📍 Izin lokasi ditolak'; clb.className = 'clock-loc-badge unknown'; }
        return;
      }

      // ── Coba pakai GPS cache terlebih dulu (TTL 2 menit, badge only) ──
      const _cachedPos = _getCachedGPS();
      if (_cachedPos) {
        _applyLocPos(_cachedPos.lat, _cachedPos.lon);
        // Tetap request fresh position di background (silent, tanpa blok UI)
      }

      // Jika cache hit DAN permission bukan 'prompt', skip re-request saat ini
      if (_cachedPos && _permState === 'granted') return;

      _locWatchId = 1; // tandai sudah dijalankan agar tidak dipanggil ulang
      navigator.geolocation.getCurrentPosition(
        pos => {
          const { latitude, longitude } = pos.coords;
          _setCachedGPS(latitude, longitude); // simpan ke cache
          _applyLocPos(latitude, longitude);
        },
        err => {
          const clb = $('clockLocBadge');
          if (err && err.code === 1) {
            _locPermDenied = true;
            _writePermStore({ geolocation: 'denied' });
            if (clb) { clb.textContent = '📍 Izin lokasi ditolak'; clb.className = 'clock-loc-badge unknown'; }
          }
          // timeout/unavailable → badge tetap "Mendeteksi", tidak minta lagi
        },
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }
      );
    }

    // Initial data loading is now handled by initApp() at the bottom.
    initPermissions(); // pre-check & watch geolocation + camera permissions

    /* ============================================================
       WAJIB DAFTAR WAJAH
       ============================================================ */

    async function _cekWajibFace() {
      await new Promise(r => setTimeout(r, 1200));
      if (!MY_ID) return;
      // Toggle OFF → sembunyikan modal paksa (tidak perlu daftar wajah untuk absen)
      if (!FACE_RECOGNITION_ENABLED) {
        _hideFaceRequiredModal();
        return;
      }
      const ref = getFaceRef();
      if (ref && ref.dataUrl && ref.dataUrl !== '') return;
      _showFaceRequiredModal();
    }

    function _showFaceRequiredModal() {
      const modal = $('faceRequiredModal');
      if (!modal) return;
      modal.style.display = 'flex';
    }

    function _hideFaceRequiredModal() {
      const modal = $('faceRequiredModal');
      if (!modal) return;
      modal.style.display = 'none';
    }

    async function daftarWajahPaksa() {
      const btn = $('btnDaftarWajahPaksa');
      const txt = $('btnDaftarWajahTxt');
      const status = $('faceRequiredStatus');
      if (btn) btn.disabled = true;
      if (txt) txt.textContent = 'Membuka kamera...';

      openCamOverlay({
        isRegister: true, onDone: async (cap) => {
          if (!cap || !cap.dataUrl) {
            if (btn) btn.disabled = false;
            if (txt) txt.textContent = 'Daftarkan Wajah Sekarang';
            if (status) status.textContent = 'Foto tidak berhasil diambil, coba lagi.';
            return;
          }
          if (status) { status.textContent = 'Menyimpan data wajah...'; status.style.color = 'var(--muted)'; }
          const ok = await saveFaceRef(cap.dataUrl, cap.descriptor);
          if (ok) {
            if (status) { status.textContent = 'Wajah berhasil didaftarkan!'; status.style.color = 'var(--success)'; }
            updateFaceRegUI();
            updateProfilFaceUI();
            await new Promise(r => setTimeout(r, 1200));
            _hideFaceRequiredModal();
          } else {
            if (status) { status.textContent = 'Gagal menyimpan. Coba lagi.'; status.style.color = 'var(--danger)'; }
            if (btn) btn.disabled = false;
            if (txt) txt.textContent = 'Daftarkan Wajah Sekarang';
          }
        }, onCancel: () => {
          if (btn) btn.disabled = false;
          if (txt) txt.textContent = 'Daftarkan Wajah Sekarang';
          if (status) { status.textContent = 'Pendaftaran dibatalkan. Wajah wajib didaftarkan untuk absen.'; status.style.color = 'var(--warning)'; }
          setTimeout(_showFaceRequiredModal, 500);
        }
      });
    }

    /* ============================================================
       ADMIN: STATUS WAJAH PEGAWAI
       ============================================================ */

    async function loadFaceStatusAdmin() {
      const list = $('faceStatusAdminList');
      if (!list) return;
      dom.shimmer(list.id, 3);
      try {
        const res = await apiFetch(P.userList, { method: 'GET' });
        if (!res.ok) throw 0;
        const json = await res.json();

        // Response format: { ok, data: [...], total } — ambil dari data
        const pegawai = (Array.isArray(json)
          ? json
          : Array.isArray(json.data)
            ? json.data
            : []).filter(u => u.id || u.ID);

        // Urutkan berdasarkan ID (numerik)
        pegawai.sort((a, b) => {
          const valA = Number(a.id || a.ID || 999999);
          const valB = Number(b.id || b.ID || 999999);
          return valA - valB;
        });

        if (!pegawai.length) {
          list.innerHTML = '<div style="text-align:center;padding:16px;font-size:11px;color:var(--muted)">Tidak ada data pegawai</div>';
          return;
        }

        // Helper ambil nama — Supabase pakai "Nama" (kapital)
        const getNama = p => p.Nama || p.nama || p.username || p.Username || '—';
        const getUid = p => String(p.id || p.ID || '');
        const getNip = p => p.NIP || p.nip || '';

        // hasFace: face_histogram tidak null, tidak '', dan tidak '[]' (hasil reset)
        const hasFace = p => {
          const hist = p.face_histogram;
          const photo = p.face_photo;
          const validHist = hist && hist !== '[]' && hist !== '';
          const validPhoto = photo && photo !== '';
          return validHist || validPhoto;
        };
        const sudah = pegawai.filter(p => hasFace(p));
        const belum = pegawai.filter(p => !hasFace(p));
        const total = pegawai.length;
        const pct = total > 0 ? Math.round(sudah.length / total * 100) : 0;
        const barColor = pct === 100 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)';

        let html = `
      <div style="background:rgba(255,255,255,.04);border-radius:10px;padding:10px 12px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span style="font-size:10px;font-weight:700;color:var(--white)">Progress Pendaftaran</span>
          <span style="font-size:11px;font-weight:800;color:${barColor}">${sudah.length}/${total} (${pct}%)</span>
        </div>
        <div style="height:5px;background:rgba(255,255,255,.1);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${barColor};border-radius:3px"></div>
        </div>
        <div style="display:flex;gap:12px;margin-top:6px">
          <span style="font-size:9px;color:var(--success)">✅ Sudah: ${sudah.length}</span>
          <span style="font-size:9px;color:var(--danger)">❌ Belum: ${belum.length}</span>
        </div>
      </div>`;

        if (belum.length) {
          html += `<div style="font-size:9px;font-weight:800;color:var(--danger);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Belum Daftar (${belum.length})</div>`;
          belum.forEach(p => {
            const nama = getNama(p);
            const uid = getUid(p);
            const nip = getNip(p);
            html += `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.2);border-radius:10px;margin-bottom:6px">
          <div style="width:32px;height:32px;border-radius:8px;background:rgba(239,68,68,.15);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">👤</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;font-weight:700;color:var(--white);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nama}</div>
            <div style="font-size:9px;color:var(--muted)">${nip ? 'NIP: ' + nip + ' · ' : ''}Belum daftar wajah</div>
          </div>
          <span style="font-size:9px;padding:2px 8px;border-radius:6px;background:rgba(239,68,68,.15);color:var(--danger);font-weight:700;flex-shrink:0">Belum</span>
        </div>`;
          });
        }

        if (sudah.length) {
          html += `<div style="font-size:9px;font-weight:800;color:var(--success);text-transform:uppercase;letter-spacing:.06em;margin:10px 0 6px">Sudah Daftar (${sudah.length})</div>`;
          sudah.forEach(p => {
            const nama = getNama(p);
            const uid = getUid(p);
            const nip = getNip(p);
            const savedAt = p.face_saved_at || null;
            let tgl = '?';
            if (savedAt && savedAt !== '') {
              try { const d = new Date(savedAt); tgl = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`; } catch (_) { }
            }
            const thumb = p.face_photo || null;

            // Tentukan Engine Type
            let engineBadge = '';
            const histData = p.face_histogram || p.descriptor;
            if (histData && histData !== '' && histData !== '[]') {
              try {
                const arr = typeof histData === 'string' ? JSON.parse(histData) : histData;
                const dLen = Array.isArray(arr) ? arr.length : 0;
                if (dLen >= 512) engineBadge = '<span style="font-size:8px;padding:1px 4px;background:rgba(201,168,76,0.2);color:var(--gold);border-radius:4px;margin-left:4px;border:1px solid rgba(201,168,76,0.3)">🛡️ Human</span>';
                else if (dLen === 128) engineBadge = '<span style="font-size:8px;padding:1px 4px;background:rgba(96,165,250,0.2);color:#60a5fa;border-radius:4px;margin-left:4px;border:1px solid rgba(96,165,250,0.3)">🤖 API</span>';
              } catch (e) { }
            }

            html += `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(34,197,94,.05);border:1px solid rgba(34,197,94,.2);border-radius:10px;margin-bottom:6px">
          <div style="width:32px;height:32px;border-radius:8px;border:1px solid rgba(34,197,94,.3);overflow:hidden;flex-shrink:0;background:rgba(0,0,0,.3)">
            ${thumb
                ? `<img src="${thumb}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none';this.parentNode.innerHTML='👤'">`
                : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:16px">👤</div>`
              }
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;font-weight:700;color:var(--white);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nama}</div>
            <div style="font-size:9px;color:var(--muted)">${nip ? 'NIP: ' + nip + ' · ' : ''}Terdaftar: ${tgl}${engineBadge}</div>
          </div>
          <button onclick="resetFacePegawai('${uid}','${nama.replace(/'/g, "\'")}')"
            style="font-size:9px;padding:3px 8px;border-radius:6px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);color:var(--danger);cursor:pointer;flex-shrink:0;font-weight:700">
            🗑️ Reset
          </button>
        </div>`;
          });
        }

        list.innerHTML = html;
      } catch (e) {
        list.innerHTML = '<div style="text-align:center;padding:16px;font-size:11px;color:var(--muted)">Gagal memuat. Pastikan n8n aktif.</div>';
      }
    }


    async function resetFacePegawai(uid, nama) {
      if (!confirm('Reset data wajah ' + nama + '?\nPegawai akan dipaksa daftar ulang saat buka app.')) return;
      try {
        const res = await apiFetch(P.faceRegister, {
          method: 'POST',
          body: JSON.stringify({ user_id: uid, foto_base64: '', histogram: [], saved_at: '', _reset: true })
        });
        if (res && res.ok) {
          alert('Data wajah ' + nama + ' berhasil direset.');
          loadFaceStatusAdmin();
        } else { alert('Gagal reset. Coba lagi.'); }
      } catch (_) { alert('Gagal terhubung ke server.'); }
    }

    cekJaringan();  // cek jaringan WiFi kantor saat halaman dimuat
    loadWeather();  // muat cuaca Waikabubak

    // ==========================================
    // 🏛️ SUPERADMIN: MULTI-AGENCY ADMIN SCOPING
    // ==========================================
    function initSuperadminAdminScoping() {
      const isSA = typeof _isSuperAdmin === 'function' && _isSuperAdmin();
      const sec = $('adminInstansiSection');
      if (!sec) return;

      if (isSA) {
        sec.style.display = 'block';
        const el = $('adminInstansiSelect');
        if (el) {
          if (el.options.length <= 1) { // Not populated yet
            try {
              const cached = localStorage.getItem('absen_instansi_map');
              if (cached) {
                const map = JSON.parse(cached);
                const keys = Object.keys(map);
                el.innerHTML = '<option value="">— Pilih Instansi —</option>' +
                  keys.map(k => {
                    const inst = map[k];
                    const id = inst.id || inst.ID || k;
                    const name = inst.nama_instansi || inst.header || inst.nama || id.toUpperCase();
                    return `<option value="${id}">${name}</option>`;
                  }).join('');
              }
            } catch (e) {
              console.error('[Admin Superadmin] populate error:', e);
            }
          }
          // Pre-select current instansi ALWAYS
          const scoped = getScopedInstansiId();
          if (scoped) {
            el.value = scoped;
          }
        }
      } else {
        sec.style.display = 'none';
      }
    }

    function onAdminInstansiChange() {
      const el = $('adminInstansiSelect');
      if (!el) return;
      let val = el.value;
      if (!val) {
        try {
          const u = JSON.parse(localStorage.getItem('tg_user_obj_v5') || '{}');
          val = u.instansi_id || u.Instansi_Id || 'bapperida';
        } catch (e) {
          val = 'bapperida';
        }
      }
      localStorage.setItem('MY_INSTANSI', val);
      document.documentElement.style.setProperty('--agency-name', `'${val.toUpperCase()}'`);
      if (window.userProfile) {
        window.userProfile.instansi_id = val;
      }
      
      // Invalidate userListOrder cache so it fetches new employees
      userListOrder = [];

      // Reload dynamic Bidang list for this instansi
      if (typeof loadBidangList === 'function') {
        loadBidangList(val);
      }
      
      // Sync other superadmin dropdowns to match
      const rekapSelect = $('rekapInstansiSelect');
      if (rekapSelect) rekapSelect.value = val;
      const tugasSelect = $('tugasInstansiSelect');
      if (tugasSelect) tugasSelect.value = val;
      const lemburSelect = $('lemburInstansiSelect');
      if (lemburSelect) lemburSelect.value = val;
      const pegawaiSelect = $('pegawaiInstansiSelect');
      if (pegawaiSelect) pegawaiSelect.value = val;
      const adminKetSelect = $('adminKetInstansiSelect');
      if (adminKetSelect) adminKetSelect.value = val;

      // Clear SIMAPO Cache
      if (window._simapoCache && typeof window._simapoCache.clear === 'function') {
        window._simapoCache.clear();
      }
      
      // Trigger reloading of all active admin sections!
      if (typeof loadAdminMgmt === 'function') loadAdminMgmt();
      if (typeof loadKonfirmasiAdmin === 'function') loadKonfirmasiAdmin();
      if (typeof loadPegawaiMgmt === 'function') loadPegawaiMgmt();
      if (typeof adminLoadKetPegawai === 'function') adminLoadKetPegawai();
      if (typeof loadLiburAdmin === 'function') loadLiburAdmin();
      if (typeof loadLokasiAdmin === 'function') loadLokasiAdmin();
      if (typeof loadFaceStatusAdmin === 'function') loadFaceStatusAdmin();

      // Trigger reloading of SIMAPO components if active
      if (typeof loadAdminSimapoPinjam === 'function') loadAdminSimapoPinjam();
      if (typeof loadAdminSimapoTiket === 'function') loadAdminSimapoTiket();
      if (typeof loadAdminSimapoMaster === 'function') loadAdminSimapoMaster();
    }

    window.initSuperadminAdminScoping = initSuperadminAdminScoping;
    window.onAdminInstansiChange = onAdminInstansiChange;

    function initSuperadminConfigScoping() {
      const isSA = typeof _isSuperAdmin === 'function' && _isSuperAdmin();
      const sec = $('configInstansiSection');
      if (!sec) return;

      if (isSA) {
        sec.style.display = 'block';
        const el = $('configInstansiSelect');
        if (el) {
          if (el.options.length <= 1) {
            try {
              const cached = localStorage.getItem('absen_instansi_map');
              if (cached) {
                const map = JSON.parse(cached);
                const keys = Object.keys(map);
                el.innerHTML = '<option value="">— Pilih Instansi —</option>' +
                  keys.map(k => {
                    const inst = map[k];
                    const id = inst.id || inst.ID || k;
                    const name = inst.nama_instansi || inst.header || inst.nama || id.toUpperCase();
                    return `<option value="${id}">${name}</option>`;
                  }).join('');
              }
            } catch (e) {
              console.error('[Config Superadmin] populate error:', e);
            }
          }
          const scoped = getScopedInstansiId();
          if (scoped) {
            el.value = scoped;
          }
        }
      } else {
        sec.style.display = 'none';
      }
    }

    async function onConfigInstansiChange() {
      const el = $('configInstansiSelect');
      if (!el) return;
      const instId = el.value;
      if (!instId) return;

      _resetJamAbsenCache();
      try {
        const url = `${P.jamAbsen}?instansi_id=${instId}`;
        const res = await apiFetch(url, { method: 'GET' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const jam = data.data || data;
        
        const inM = $('inputJamMasuk'), inP = $('inputJamPulang');
        if (inM && jam.masuk) inM.value = jam.masuk;
        if (inP && jam.pulang) inP.value = jam.pulang;
        
        if (jam.masuk) { const m = toMenitStr(jam.masuk); if (m !== null) JAM_MASUK_MENIT = m; }
        if (jam.pulang) { const m = toMenitStr(jam.pulang); if (m !== null) JAM_PULANG_MENIT = m; }
        
        updateClock();
        updateJamPreview();
        
        // Sync other dropdowns
        const mainSelect = $('adminInstansiSelect');
        if (mainSelect) {
          mainSelect.value = instId;
          // Set local storage and trigger update
          localStorage.setItem('MY_INSTANSI', instId);
          if (window.userProfile) window.userProfile.instansi_id = instId;
        }
      } catch (e) {
        console.error('[Config Scoping] Failed to load jam for instansi:', instId, e);
      }
    }

    window.initSuperadminConfigScoping = initSuperadminConfigScoping;
    window.onConfigInstansiChange = onConfigInstansiChange;


