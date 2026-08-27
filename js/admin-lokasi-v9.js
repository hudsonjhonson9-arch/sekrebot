// Sync window.INSTANSI_LIST with localStorage

window.populateAdminLokasiInstansiSelect = function() {
    if (typeof isSuperAdminUser === 'function' && isSuperAdminUser() && document.getElementById('adminLokasiInstansiSection') && document.getElementById('adminLokasiInstansiSelect')) {
        document.getElementById('adminLokasiInstansiSection').style.display = 'block';
        const sel = document.getElementById('adminLokasiInstansiSelect');
        const currentVal = sel.value;
        let opts = '<option value="all">- Semua Instansi -</option>';
        if (window.INSTANSI_LIST) {
            window.INSTANSI_LIST.forEach(i => {
                const id = i.id || i.ID || i.instansi_id || '';
                const name = i.nama_instansi || i.header || i.nama || i.Nama_Instansi || "Instansi";
                if (id) opts += `<option value="${id}">${name}</option>`;
            });
        }
        sel.innerHTML = opts;
        if (currentVal && opts.includes(`value="${currentVal}"`)) sel.value = currentVal;
    }
};

function syncInstansiList() {
    const fallback = [];
    try {
        const cached = localStorage.getItem('absen_instansi_map');
        if (cached) {
            const map = JSON.parse(cached);
            window.INSTANSI_LIST = Object.keys(map).map(k => map[k]).filter(i => i.id || i.ID || i.instansi_id);
            if (!window.INSTANSI_LIST || window.INSTANSI_LIST.length === 0) {
                window.INSTANSI_LIST = fallback;
            }
        } else {
            window.INSTANSI_LIST = fallback;
        }
    } catch(e) {
        window.INSTANSI_LIST = fallback;
    }
}
syncInstansiList();
if(typeof window.populateAdminLokasiInstansiSelect === "function") window.populateAdminLokasiInstansiSelect();

document.addEventListener('click', function(e) {
  if (!e.target.closest('.custom-search-dropdown')) {
    document.querySelectorAll('.dropdown-list-wrap').forEach(el => {
      if (el.id.startsWith('instansi')) el.style.display = 'none';
    });
  }
});

/* ════ ADMIN LOKASI ════ */
    /* ════ ADMIN ════ */
    // UI Utils
    window.toggleInstansiCheck = async function(cb, textId) {
    const grid = cb.closest('.dropdown-list-wrap');
    if (!grid) return;
    
    if (cb.value === 'all' && cb.checked) {
      grid.querySelectorAll('input').forEach(i => {
        if (i !== cb) { i.checked = false; }
      });
    } else if (cb.checked) {
      const allCb = grid.querySelector('input[value="all"]');
      if (allCb && allCb.checked) { allCb.checked = false; }
    }
    
    // Update custom UI classes
    grid.querySelectorAll('.custom-checkbox-lbl').forEach(lbl => {
      const input = lbl.querySelector('input');
      const box = lbl.querySelector('.checkbox-box');
      const mark = lbl.querySelector('.check-mark');
      const span = lbl.querySelector('span');
      if (input.checked) {
        lbl.style.background = 'rgba(212,175,55,0.1)';
        lbl.style.borderLeft = '3px solid var(--gold)';
        box.style.borderColor = 'var(--gold)';
        box.style.background = 'rgba(212,175,55,0.1)';
        mark.style.opacity = '1';
        mark.style.transform = 'scale(1)';
        span.style.fontWeight = '600';
      } else {
        lbl.style.background = 'transparent';
        lbl.style.borderLeft = '3px solid transparent';
        box.style.borderColor = 'rgba(255,255,255,0.3)';
        box.style.background = 'transparent';
        mark.style.opacity = '0';
        mark.style.transform = 'scale(0)';
        span.style.fontWeight = 'normal';
      }
    });
    
    // Update text
    const textEl = document.getElementById(textId);
    let instansiStr = 'all';
    if (textEl) {
      const checked = Array.from(grid.querySelectorAll('input:checked'));
      if (checked.length === 0 || (checked.length === 1 && checked[0].value === 'all')) {
        textEl.textContent = 'Semua Instansi';
      } else if (checked.length === 1) {
        const val = checked[0].value;
        const found = (window.INSTANSI_LIST && window.INSTANSI_LIST.length > 0 ? window.INSTANSI_LIST : []).find(i => (i.id || i.ID || i.instansi_id || '').toString().toLowerCase() === val.toString().toLowerCase());
        textEl.textContent = found ? (found.nama_instansi || found.header || found.nama || found.Nama_Instansi || found.id || '1 Instansi Terpilih') : '1 Instansi Terpilih';
      } else {
        textEl.textContent = checked.length + ' Instansi Terpilih';
      }
      instansiStr = checked.length ? checked.map(c => c.value).join(',') : 'all';
    }

    // Auto-save if it's a location card dropdown
    if (grid.id && grid.id.startsWith('instansi-grid-')) {
      const locId = grid.id.replace('instansi-grid-', '');
      try {
        await apiPost(P.lokasiUpdate, { id: locId, instansi_id: instansiStr });
      } catch(e) {
        console.error('Gagal update instansi lokasi', e);
      }
    }
  };
    function isSuperAdminUser() {
      return typeof _isSuperAdmin === 'function' ? _isSuperAdmin() : false;
    }

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
    /**
     * Tambah lokasi absen baru dengan koordinat GPS.
     * @returns {Promise<void>}
     */
        async function handleTambahLokasi() {
      const nama = $('namaLokasi').value.trim(), radius = parseInt($('radiusLokasi').value) || 100;
      const ipRange = ($('ipRangeLokasi')?.value || '').split(',').map(s => s.trim()).filter(Boolean).join(',');
      if (!selectedPin) { showResult('adminResult', 'adminRIcon', 'adminRTitle', 'adminRMsg', 'warning', '⚠️', 'Pilih Lokasi', 'Tap pada peta untuk menentukan titik lokasi.'); return; }
      if (!nama) { showResult('adminResult', 'adminRIcon', 'adminRTitle', 'adminRMsg', 'warning', '⚠️', 'Nama Kosong', 'Masukkan nama lokasi terlebih dahulu.'); return; }
      const hariChecked = Array.from(document.querySelectorAll('#hariCheckGrid input:checked')).map(el => el.value);
      if (!hariChecked.length) { showResult('adminResult', 'adminRIcon', 'adminRTitle', 'adminRMsg', 'warning', '⚠️', 'Pilih Hari', 'Pilih minimal satu hari aktif.'); return; }
      const hariStr = hariChecked.join(',');
      setBtnL('btnTambahLokasi', true, 'Menyimpan...');
      
      let instansi_id = 'all';
      if (isSuperAdminUser()) {
        const selectEl = $('adminLokasiInstansiSelect');
        if (selectEl && selectEl.value) {
          instansi_id = selectEl.value;
        }
      } else {
        instansi_id = localStorage.getItem('MY_INSTANSI') || 'all';
      }
      
      try {
        await apiPost(P.lokasiAdd, { 
          nama_lokasi: nama, latitude: selectedPin.lat, longitude: selectedPin.lng, 
          radius, hari: hariStr, ip_range: ipRange, 
          instansi_id,
          ditambahkan_oleh: MY_ID,
          nip: localStorage.getItem('MY_NIP') || '',
          timestamp: Math.floor(Date.now() / 1000) 
        });
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
    /**
     * Muat daftar lokasi absen dari server dan render ke tabel + peta.
     * @returns {Promise<void>}
     */
        async function loadLokasiAdmin() {
      if(typeof window.populateAdminLokasiInstansiSelect === "function") window.populateAdminLokasiInstansiSelect();

      const el = $('lokasiMgmtList');
      dom.shimmer(el.id, 2);
      let list = [];
      try {
        const params = {}; if (isSuperAdminUser() && $('adminLokasiInstansiSelect') && $('adminLokasiInstansiSelect').value && $('adminLokasiInstansiSelect').value !== 'all') params.instansi_id = $('adminLokasiInstansiSelect').value; const res = await apiGet(P.lokasiList, params); if (!res.ok) throw 0;
        const json = res?.data ?? {}; list = parseApiResponse(json);
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
          if (isSuperAdminUser() && $('instansiLokasiContainer')) {
            $('instansiLokasiContainer').style.display = 'block';
            var instList = window.INSTANSI_LIST && window.INSTANSI_LIST.length > 0 ? window.INSTANSI_LIST : [];
            var gridHtml = `
              <div class="custom-search-dropdown" style="width:100%; margin-top:4px;">
                <div class="dropdown-trigger" onclick="const list = this.nextElementSibling; document.querySelectorAll('#instansiCheckGrid-list, [id^=instansi-grid-]').forEach(el => { if (el !== list) el.style.display = 'none'; }); list.style.display = (list.style.display === 'none' || !list.style.display) ? 'flex' : 'none';" style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); border-radius:8px; cursor:pointer;">
                  <span class="selected-text" id="text-instansi-tambah" style="font-size:11px; color:var(--white); font-weight:700;">Semua Instansi</span>
                  <i class="fas fa-chevron-down arrow-icon" style="color:var(--muted); font-size:10px;"></i>
                </div>
                <div class="dropdown-list-wrap" id="instansiCheckGrid-list" style="position:absolute; top:100%; left:0; width:100%; max-height:200px; overflow-y:auto; background:rgba(15, 23, 42, 0.95); backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,0.1); border-radius:12px; margin-top:6px; z-index:9999; padding:6px; box-shadow:0 10px 25px rgba(0,0,0,0.5); display:none; flex-direction:column; gap:4px;">
                  <label class="dropdown-item custom-checkbox-lbl" style="display:flex; align-items:center; gap:10px; padding:10px 12px; cursor:pointer; font-size:11px; color:var(--white); border-radius:8px; transition:all 0.2s; margin-bottom:2px; background:rgba(212,175,55,0.1); border-left:3px solid var(--gold);">
                    <div class="checkbox-box" style="width:16px;height:16px;border:1px solid var(--gold);border-radius:4px;display:flex;align-items:center;justify-content:center;transition:all 0.2s;background:rgba(212,175,55,0.1);">
                      <i class="fas fa-check check-mark" style="font-size:10px;color:var(--gold);opacity:1;transform:scale(1);transition:all 0.2s;"></i>
                    </div>
                    <input type="checkbox" value="all" checked onchange="toggleInstansiCheck(this, 'text-instansi-tambah')" style="display:none;"> 
                    <span style="font-weight:600;">Semua Instansi</span>
                  </label>
            `;
            instList.forEach(function(ins) {
              gridHtml += `<label class="dropdown-item custom-checkbox-lbl" style="display:flex; align-items:center; gap:10px; padding:10px 12px; cursor:pointer; font-size:11px; color:var(--white); border-radius:8px; transition:all 0.2s; margin-bottom:2px; background:transparent; border-left:3px solid transparent;">
                    <div class="checkbox-box" style="width:16px;height:16px;border:1px solid rgba(255,255,255,0.3);border-radius:4px;display:flex;align-items:center;justify-content:center;transition:all 0.2s;background:transparent;">
                      <i class="fas fa-check check-mark" style="font-size:10px;color:var(--gold);opacity:0;transform:scale(0);transition:all 0.2s;"></i>
                    </div>
                    <input type="checkbox" value="${ins.id || ins.ID || ins.instansi_id || ''}" onchange="toggleInstansiCheck(this, 'text-instansi-tambah')" style="display:none;"> 
                    <span>${ins.nama_instansi || ins.header || ins.nama || ins.Nama_Instansi || ins.id || "Instansi"}</span>
                  </label>`;
            });
            gridHtml += `</div></div>`;
            $('instansiCheckGrid').innerHTML = gridHtml;
            $('instansiCheckGrid').style.display = 'block';
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
            const instansiVal = l.instansi_id || 'all';
            const instansiArr = instansiVal.split(',').map(i=>i.trim()).filter(Boolean);
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
            return `<div id="lokasi-item-${id}" style="background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:13px;margin-bottom:8px; overflow:visible!important; position:relative; z-index:${1000 - idx};">
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
            ${isSuperAdminUser() ? `
            <div style="margin-top:7px">
              <span style="font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;">🏢 Instansi Akses</span>
              <div class="custom-search-dropdown" style="width:100%; margin-top:4px;">
                <div class="dropdown-trigger" onclick="const list = this.nextElementSibling; document.querySelectorAll('#instansiCheckGrid-list, [id^=instansi-grid-]').forEach(el => { if (el !== list) el.style.display = 'none'; }); list.style.display = (list.style.display === 'none' || !list.style.display) ? 'flex' : 'none';" style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); border-radius:8px; cursor:pointer;">
                  <span class="selected-text" id="text-instansi-${id}" style="font-size:11px; color:var(--white); font-weight:700;">${instansiArr.includes('all') || instansiArr.length === 0 ? 'Semua Instansi' : (instansiArr.length === 1 ? ((window.INSTANSI_LIST && window.INSTANSI_LIST.length > 0 ? window.INSTANSI_LIST : []).find(i => i.id === instansiArr[0])?.nama_instansi || '1 Instansi Terpilih') : instansiArr.length + ' Instansi Terpilih')}</span>
                  <i class="fas fa-chevron-down arrow-icon" style="color:var(--muted); font-size:10px;"></i>
                </div>
                <div class="dropdown-list-wrap" id="instansi-grid-${id}" style="position:absolute; top:100%; left:0; width:100%; max-height:200px; overflow-y:auto; background:rgba(15, 23, 42, 0.95); backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,0.1); border-radius:12px; margin-top:6px; z-index:9999; padding:6px; box-shadow:0 10px 25px rgba(0,0,0,0.5); display:none; flex-direction:column; gap:4px;">
                  <label class="dropdown-item custom-checkbox-lbl" style="display:flex; align-items:center; gap:10px; padding:10px 12px; cursor:pointer; font-size:11px; color:var(--white); border-radius:8px; transition:all 0.2s; margin-bottom:2px; ${instansiArr.includes('all')?'background:rgba(212,175,55,0.1);border-left:3px solid var(--gold);':'background:transparent;border-left:3px solid transparent;'}">
                    <div class="checkbox-box" style="width:16px;height:16px;border:1px solid ${instansiArr.includes('all')?'var(--gold)':'rgba(255,255,255,0.3)'};border-radius:4px;display:flex;align-items:center;justify-content:center;transition:all 0.2s;background:${instansiArr.includes('all')?'rgba(212,175,55,0.1)':'transparent'};">
                      <i class="fas fa-check check-mark" style="font-size:10px;color:var(--gold);transition:all 0.2s;${instansiArr.includes('all')?'opacity:1;transform:scale(1);':'opacity:0;transform:scale(0);'}"></i>
                    </div>
                    <input type="checkbox" value="all" ${instansiArr.includes('all')?'checked':''} onchange="toggleInstansiCheck(this, 'text-instansi-${id}')" style="display:none;"> 
                    <span style="${instansiArr.includes('all')?'font-weight:600;':''}">Semua Instansi</span>
                  </label>
                  ${(window.INSTANSI_LIST && window.INSTANSI_LIST.length > 0 ? window.INSTANSI_LIST : []).map(ins => {
                    const insId = (ins.id || ins.ID || ins.instansi_id || "").toLowerCase(); const isChecked = instansiArr.some(a => a.toLowerCase() === insId);
                    return `<label class="dropdown-item custom-checkbox-lbl" style="display:flex; align-items:center; gap:10px; padding:10px 12px; cursor:pointer; font-size:11px; color:var(--white); border-radius:8px; transition:all 0.2s; margin-bottom:2px; ${isChecked?'background:rgba(212,175,55,0.1);border-left:3px solid var(--gold);':'background:transparent;border-left:3px solid transparent;'}">
                      <div class="checkbox-box" style="width:16px;height:16px;border:1px solid ${isChecked?'var(--gold)':'rgba(255,255,255,0.3)'};border-radius:4px;display:flex;align-items:center;justify-content:center;transition:all 0.2s;background:${isChecked?'rgba(212,175,55,0.1)':'transparent'};">
                        <i class="fas fa-check check-mark" style="font-size:10px;color:var(--gold);transition:all 0.2s;${isChecked?'opacity:1;transform:scale(1);':'opacity:0;transform:scale(0);'}"></i>
                      </div>
                      <input type="checkbox" value="${ins.id || ins.ID || ins.instansi_id || ''}" ${isChecked?'checked':''} onchange="toggleInstansiCheck(this, 'text-instansi-${id}')" style="display:none;"> 
                      <span style="${isChecked?'font-weight:600;':''}">${ins.nama_instansi || ins.header || ins.nama || ins.Nama_Instansi || ins.id || "Instansi"}</span>
                    </label>`;
                  }).join('')}
                </div>
              </div>
            </div>
            ` : `<input type="hidden" id="instansi-input-${id}" value="${instansiVal}" />`}
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
      try { 
        await apiPost(P.lokasiDel, { 
          id, 
          ditambahkan_oleh: MY_ID,
          nip: localStorage.getItem('MY_NIP') || ''
        }); 
        loadLokasiAdmin(); 
      }
      catch { alert('Gagal menghapus. Coba lagi.'); }
    }

    /**
     * Simpan perubahan radius/nama pada lokasi yang sudah ada.
     * @param {string} id - ID lokasi
     * @param {string} _namaLama - Nama lokasi sebelum diedit
     * @param {number} idx - Index pada array lokasiData
     * @returns {Promise<void>}
     */
        async function simpanLokasiItem(id, _namaLama, idx) {
      const btn = $(`btnSimpanLokasi-${id}`);
      const txtEl = $(`btnSimpanLokasiTxt-${id}`);
      const resEl = $(`simpanLokasiResult-${id}`);
      if (btn) { btn.disabled = true; if (txtEl) txtEl.textContent = 'Menyimpan...'; }
      
      const namaInp = $(`nama-input-${id}`);
      const namaBaru = namaInp ? namaInp.value.trim() : _namaLama;
      
      const radiusInp = $(`radius-input-${id}`);
      const ipInp = $(`ip-input-${id}`);
      const radius = parseInt(radiusInp?.value || 100);
      const ip_range = (ipInp?.value || '').trim();
      
      let instansi_id = 'all';
      if (isSuperAdminUser() && $(`instansi-grid-${id}`)) {
        const checked = Array.from($(`instansi-grid-${id}`).querySelectorAll('input:checked')).map(cb => cb.value);
        if (checked.length) instansi_id = checked.join(',');
        else instansi_id = 'all'; // fallback
      } else {
        instansi_id = $(`instansi-input-${id}`)?.value || 'all';
      }
      
      if (isNaN(radius) || radius < 10 || radius > 5000) {
        if (radiusInp) { radiusInp.style.borderColor = 'var(--danger)'; setTimeout(() => { radiusInp.style.borderColor = 'rgba(255,255,255,.12)'; }, 1500); }
        if (btn) { btn.disabled = false; if (txtEl) txtEl.textContent = 'Simpan Perubahan'; }
        return;
      }
      if (!namaBaru) {
        if (namaInp) { namaInp.style.borderBottomColor = 'var(--danger)'; setTimeout(() => { namaInp.style.borderBottomColor = 'rgba(255,255,255,.2)'; }, 1500); }
        if (btn) { btn.disabled = false; if (txtEl) txtEl.textContent = 'Simpan Perubahan'; }
        return;
      }

      const lok = jadwalLokData[idx];
      const hariStr = lok ? (lok.hari || []).join(',') : '';
      try {
        await apiPost(P.lokasiUpdate, { 
          id, nama_lokasi: namaBaru, radius, hari: hariStr, ip_range, instansi_id,
          diubah_oleh: MY_ID,
          nip: localStorage.getItem('MY_NIP') || ''
        });
        if (lok) {
          lok.radius = radius;
          lok.nama = namaBaru;
        }
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

    /**
     * Simpan jadwal hari per-lokasi ke server.
     * @returns {Promise<void>}
     */
        async function simpanJadwal() {
      const btn = $('btnSimpanJadwal');
      if (btn) { btn.disabled = true; dom.setText('btnJadwalText', '💾 Menyimpan...'); }

      if (!jadwalLokData.length) {
        showResult('jadwalResult', 'jadwalRIcon', 'jadwalRTitle', 'jadwalRMsg', 'warning', '⚠️', 'Tidak Ada Lokasi', 'Muat daftar lokasi terlebih dahulu.');
        if (btn) { btn.disabled = false; dom.setText('btnJadwalText', 'Simpan Jadwal'); }
        return;
      }

      let berhasil = 0, gagal = 0;
      for (const lok of jadwalLokData) {
        const hariStr = (lok.hari || []).join(',');
        try {
          await apiPost(P.lokasiUpdate, { 
            id: lok.id, nama_lokasi: lok.nama, hari: hariStr,
            diubah_oleh: MY_ID,
            nip: localStorage.getItem('MY_NIP') || ''
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

      if (btn) { setTimeout(() => { btn.disabled = false; dom.setText('btnJadwalText', 'Simpan Jadwal'); }, 2500); }
    }

    // syncJadwalState: dipanggil dari loadLokasiAdmin setelah list dimuat
    function syncJadwalState() {
      // Sync LOK_DEF ke jadwalLokData.hari (dipanggil setelah load)
      jadwalLokData.forEach(lok => {
        // jadwalLokData sudah punya hari dari server, tidak perlu sync ulang
      });
    }

