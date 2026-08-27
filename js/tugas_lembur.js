/* ════ PENUGASAN & LEMBUR ════ */
(function () {
  let _allPegawaiTugas = [];
  let _allPegawaiLembur = [];
  let _selectedLemburPegawai = []; 
  let _selectedTugasPegawai = []; 
  let _tugasMap = null;
  let _tugasMarker = null;
  let _activeTugasData = null; // Store data of the task being worked on
  let _activeMonitoringTasks = []; // Store data of monitoring tasks
  let _activeMyTasks = []; // Store data of personal assignments

  /**
   * Helper: Get direct/thumbnail URL for Google Drive links or return original
   */
  function getDirectImageUrl(url) {
    if (!url) return '';
    if (url.startsWith('data:')) return url;
    if (url.includes('drive.google.com')) {
      let fileId = '';
      const fileDMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (fileDMatch && fileDMatch[1]) {
        fileId = fileDMatch[1];
      } else {
        const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (idMatch && idMatch[1]) {
          fileId = idMatch[1];
        }
      }
      if (fileId) {
        return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
      }
    }
    return url;
  }

  /**
   * Helper: Convert raw binary string to Base64
   */
  function binaryStringToBase64(str) {
    try {
      const bytes = new Uint8Array(str.length);
      for (let i = 0; i < str.length; i++) {
        bytes[i] = str.charCodeAt(i) & 0xff;
      }
      let binary = '';
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return window.btoa(binary);
    } catch (e) {
      console.error('[TugasLembur] Failed to convert binary string to base64:', e);
      return null;
    }
  }

  /**
   * Helper: Detect mime type from raw binary string
   */
  function detectMimeType(str) {
    if (!str) return 'image/jpeg';
    // Check PDF signature %PDF
    if (str.startsWith('%PDF') || (str.charCodeAt(0) === 0x25 && str.charCodeAt(1) === 0x50 && str.charCodeAt(2) === 0x44 && str.charCodeAt(3) === 0x46)) {
      return 'application/pdf';
    }
    // Check PNG signature
    if (str.charCodeAt(0) === 0x89 && str.charCodeAt(1) === 0x50 && str.charCodeAt(2) === 0x4E && str.charCodeAt(3) === 0x47) {
      return 'image/png';
    }
    // Check JPEG signature
    if (str.charCodeAt(0) === 0xFF && str.charCodeAt(1) === 0xD8 && str.charCodeAt(2) === 0xFF) {
      return 'image/jpeg';
    }
    if (str.startsWith('GIF8')) {
      return 'image/gif';
    }
    return 'image/jpeg';
  }

  /**
   * Helper: Get direct image URL or Base64 representation (handles raw binary fallback)
   */
  function getDirectImageUrlOrBase64(bukti) {
    if (!bukti) return '';
    
    // If it's a URL or already a base64 data URL
    if (bukti.startsWith('data:') || bukti.startsWith('http://') || bukti.startsWith('https://') || bukti.startsWith('/')) {
      return getDirectImageUrl(bukti);
    }
    
    // Check if it is a pure Base64 string (no prefix)
    const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
    if (bukti.length > 20 && base64Regex.test(bukti.replace(/[\r\n\s]/g, ''))) {
      return `data:image/jpeg;base64,${bukti.replace(/[\r\n\s]/g, '')}`;
    }
    
    // Otherwise, treat as raw binary bytes
    try {
      const mime = detectMimeType(bukti);
      const b64 = binaryStringToBase64(bukti);
      if (b64) {
        return `data:${mime};base64,${b64}`;
      }
    } catch (e) {
      console.error('[TugasLembur] Error parsing binary bukti:', e);
    }
    return '';
  }

  /**
   * Inisialisasi Modul
   */
  async function initTugasLembur() {
    console.log('[TugasLembur] Initializing...');
    checkTugasLemburAccess();
    
    // Set default dates
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
    if ($('tugasTanggal')) $('tugasTanggal').value = today; 
    if ($('lemburDari')) $('lemburDari').value = today;
    if ($('lemburSampai')) $('lemburSampai').value = today;

    // Load archives if has overtime access
    const p = window.userProfile || {};
    const role = String(p.role || localStorage.getItem('MY_ROLE') || 'USER').toLowerCase().trim();
    const isManager = ['kepala', 'sekretaris', 'kabid', 'irban', 'admin', 'superadmin'].includes(role) || !!window.IS_ADMIN;
    const userInstansi = (p.instansi_id || localStorage.getItem('MY_INSTANSI') || '').toLowerCase().trim();
    const hasLemburAccess = isManager || (userInstansi && userInstansi !== '');
    if (hasLemburAccess) {
      loadLemburArchive();
    }
  }
  window.initTugasLembur = initTugasLembur;

  /**
   * Check Role Access
   */
  /**
   * Check Role Access and Initialize UI
   */
  function checkTugasLemburAccess() {
    const p = userProfile || {};
    const role = String(p.role || localStorage.getItem('MY_ROLE') || 'USER').toLowerCase().trim();
    const isManager = ['kepala', 'sekretaris', 'kabid', 'irban', 'admin', 'superadmin'].includes(role) || !!window.IS_ADMIN;
    const userInstansi = (p.instansi_id || localStorage.getItem('MY_INSTANSI') || '').toLowerCase().trim();
    const hasLemburAccess = isManager || (userInstansi && userInstansi !== '');
    
    // 1. Sidebar/Bottom Nav & Admin Visibility
    if (typeof applyAdminVisibility === 'function') applyAdminVisibility();
    
    const navTugasDesk = $('nav-tugas-desk');
    const navLemburDesk = $('nav-lembur-desk');
    const moreTugas = $('more-tugas');
    const moreLembur = $('more-lembur');

    if (navTugasDesk) navTugasDesk.style.display = 'flex';
    if (moreTugas) moreTugas.style.display = 'flex';
    
    if (navLemburDesk) navLemburDesk.style.display = hasLemburAccess ? 'flex' : 'none';
    if (moreLembur) moreLembur.style.display = hasLemburAccess ? 'flex' : 'none';

    // 2. Form vs List visibility
    const creationForm = $('tugasCreationForm');
    const actingAsGroup = $('actingAsGroup');
    if (creationForm) {
      creationForm.style.display = isManager ? 'block' : 'none';
    }
    if (actingAsGroup) {
      const isAdmin = ['admin', 'superadmin'].includes(role) || !!window.IS_ADMIN;
      actingAsGroup.style.display = isAdmin ? 'block' : 'none';
    }

    // 3. Load personal assignments
    loadMyAssignments();
    // 4. Load monitoring if manager
    if (isManager) loadMonitoringTasks();
    // 5. Initialize Superadmin scoping dropdown
    initSuperadminTugasScoping();
  }
  window.checkTugasLemburAccess = checkTugasLemburAccess;

  /**
   * Load Assignments for the current user (NIP based)
   */
  async function loadMyAssignments() {
    const listEl = $('tugasListSection');
    if (!listEl) return;
    
    const p = typeof userProfile !== 'undefined' && userProfile ? userProfile : {};
    let nip = p.nip || localStorage.getItem('MY_NIP');
    
    if (!nip) {
      try {
        const u = JSON.parse(localStorage.getItem('tg_user_obj_v5') || '{}');
        nip = u.nip || u.NIP;
      } catch(e) {}
    }

    if (!nip) {
      listEl.innerHTML = '<div class="empty-state">Data profil belum tersedia</div>';
      return;
    }

    listEl.innerHTML = `
      <div class="shimmer-wrapper">
        <div class="shimmer sh-line" style="width:100%; height:80px; border-radius:15px; margin-bottom:10px"></div>
        <div class="shimmer sh-line" style="width:100%; height:80px; border-radius:15px"></div>
      </div>
    `;

    try {
      // Endpoint: fetching from dedicated penugasan table
      // apiGet already returns {ok, rows, data, status}
      const res = await apiGet(`${P.penugasanList}?nip=${nip}&limit=20`);
      console.log('[TugasLembur] API Response:', res);
      
      if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
      
      // Handle n8n wrap { data: [...] } or direct array via apiGet's logic
      const data = res.rows || parseApiResponse(res.data) || [];
      _activeMyTasks = data;
      console.log('[TugasLembur] Parsed Data:', data);

      if (data.length === 0) {
        listEl.innerHTML = `
          <div class="empty-state" style="padding:40px 20px">
            <div style="font-size:40px; margin-bottom:15px">📋</div>
            <div style="font-weight:800; color:var(--white); font-size:14px">Belum Ada Perjalanan Dinas</div>
            <div style="color:var(--muted); font-size:11px; margin-top:5px">Perjalanan dinas yang diberikan atasan akan muncul di sini</div>
          </div>
        `;
        return;
      }

      listEl.innerHTML = `
        <div style="font-size:12px; font-weight:800; color:var(--gold); margin-bottom:15px; text-transform:uppercase; letter-spacing:1px">
          <i class="fas fa-list-ul" style="margin-right:8px"></i> Daftar Perjalanan Dinas Saya
        </div>
        ${data.map(r => renderTugasCard(r)).join('')}
      `;
    } catch (e) {
      console.error('[TugasLembur] Load Error:', e);
      listEl.innerHTML = `
        <div class="empty-state">
          <div style="font-size:30px; margin-bottom:10px">⚠️</div>
          <div style="font-weight:700">Gagal memuat tugas</div>
          <div style="font-size:10px; color:var(--muted); margin:5px 0 10px">${e.message}</div>
          <button onclick="loadMyAssignments()" class="btn-sm" style="background:rgba(255,255,255,0.1); border-radius:10px; padding:8px 15px; border:1px solid rgba(255,255,255,0.2); color:var(--white); cursor:pointer">🔄 Coba Lagi</button>
        </div>
      `;
    }

    // 2. LOAD MONITORING & FORM VISIBILITY (If Manager)
    const profileData = userProfile || {};
    const userRole = String(profileData.role || localStorage.getItem('MY_ROLE') || 'USER').toLowerCase().trim();
    const isManagerRole = ['kepala', 'sekretaris', 'kabid', 'irban', 'admin', 'superadmin'].includes(userRole) || !!window.IS_ADMIN;
    
    // Form Visibility
    const formEl = $('tugasCreationForm');
    if (formEl) {
      formEl.style.display = isManagerRole ? 'block' : 'none';
      if (isManagerRole) {
        loadTugasPegawai();
        loadMonitoringTasks();
      }
    }

    // Monitoring Section
    if (isManagerRole) {
      loadMonitoringTasks();
    } else {
      const monEl = $('tugasMonitoringSection');
      if (monEl) monEl.style.display = 'none';
    }
  }
  function renderTugasCard(r) {
    const rawTgl = r.tanggal || '—';
    let tglDisplay = rawTgl;
    try {
      if (rawTgl.includes('T') || rawTgl.includes('-')) {
        const d = new Date(rawTgl);
        if (!isNaN(d.getTime())) {
          tglDisplay = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        }
      }
    } catch(e) {}

    const ket = r.keterangan || '—';
    const lat = r.lat;
    const lon = r.lon;
    const rad = r.radius || 100;
    const status = (r.status || 'AKTIF').toUpperCase();
    const bukti = r.bukti || '';
    const tglSelesai = r.updated_at || r.pengerjaan_timestamp ? new Date(r.updated_at || r.pengerjaan_timestamp).toLocaleString('id-ID', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}) : '';
    
    let mapBtn = '';
    if (lat && lon) {
      mapBtn = `
        <a href="https://www.google.com/maps?q=${lat},${lon}" target="_blank" class="btn-sm" style="background:rgba(96,165,250,0.1); color:#60a5fa; border:1px solid rgba(96,165,250,0.2); padding:6px 12px; border-radius:10px; text-decoration:none; font-size:10px; font-weight:700; display:inline-flex; align-items:center; gap:6px; transition:all 0.3s ease">
          <i class="fas fa-map-marked-alt"></i> Lokasi
        </a>
      `;
    }

    let actionBtn = '';
    if (status === 'AKTIF') {
      actionBtn = `
        <button onclick='handleKerjakanTugas(${JSON.stringify(r)})' class="btn-sm" style="background:linear-gradient(135deg, var(--gold) 0%, #d4af37 100%); color:#000; border:none; padding:8px 16px; border-radius:10px; font-size:11px; font-weight:800; cursor:pointer; box-shadow: 0 4px 15px rgba(212,175,55,0.3); transition:all 0.3s ease">
          🚀 Kerjakan Tugas
        </button>
      `;
    } else {
      actionBtn = `
        <div style="text-align:right">
          <div class="status-badge s-success" style="font-size:9px; background:rgba(16,185,129,0.2); color:#10b981; border:1px solid rgba(16,185,129,0.3)">SELESAI</div>
          <div style="font-size:8px; color:var(--muted); margin-top:4px; font-weight:600">${tglSelesai}</div>
        </div>
      `;
    }

    let buktiTag = '';
    if (bukti) {
      const processedBukti = getDirectImageUrlOrBase64(bukti);
      if (processedBukti) {
        const isPdf = processedBukti.startsWith('data:application/pdf');
        if (isPdf) {
          buktiTag = `
            <div style="margin-top:15px; border-radius:12px; padding:15px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08); display:flex; align-items:center; justify-content:space-between">
              <div style="display:flex; align-items:center; gap:12px">
                <div style="font-size:24px; color:#ef4444"><i class="fas fa-file-pdf"></i></div>
                <div>
                  <div style="font-size:12px; font-weight:700; color:#fff">Dokumen Bukti (PDF)</div>
                  <div style="font-size:10px; color:var(--muted)">Format PDF terlampir</div>
                </div>
              </div>
              <button type="button" onclick="viewMyTugasBuktiById('${r.id}')" class="btn-sm" style="background:rgba(239,68,68,0.2); color:#f87171; border:1px solid rgba(239,68,68,0.3); padding:6px 12px; border-radius:8px; cursor:pointer; font-weight:700">
                📄 Buka PDF
              </button>
            </div>
          `;
        } else {
          buktiTag = `
            <div style="margin-top:15px; border-radius:12px; overflow:hidden; border:1px solid rgba(255,255,255,0.08); position:relative; cursor:pointer" onclick="viewMyTugasBuktiById('${r.id}')">
              <img src="${processedBukti}" style="width:100%; height:140px; object-fit:cover; display:block" alt="Bukti Tugas">
              <div style="position:absolute; bottom:0; left:0; right:0; background:linear-gradient(transparent, rgba(0,0,0,0.8)); padding:10px; font-size:9px; color:#fff; font-weight:600; display:flex; justify-content:space-between; align-items:center">
                 <span><i class="fas fa-check-circle" style="color:#10b981; margin-right:5px"></i> Bukti Terlampir</span>
                 <span style="opacity:0.8">Klik untuk memperbesar</span>
              </div>
            </div>
          `;
        }
      } else {
        buktiTag = `
          <div style="margin-top:15px; border-radius:12px; padding:12px; background:rgba(239,68,68,0.05); border:1px solid rgba(239,68,68,0.15); display:flex; align-items:center; gap:10px">
            <span style="font-size:18px">⚠️</span>
            <div>
              <div style="font-size:11px; font-weight:700; color:#f87171">Bukti Rusak / Tidak Dikenali</div>
              <div style="font-size:9px; color:var(--muted)">Format data bukti tidak valid</div>
            </div>
          </div>
        `;
      }
    }

    return `
      <div class="card glass-card" style="margin-bottom:15px; padding:18px; border-left:4px solid ${status === 'AKTIF' ? 'var(--gold)' : '#10b981'}; transition:transform 0.3s ease">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px">
          <div style="flex:1; padding-right:10px">
            <div style="font-size:10px; font-weight:800; color:var(--gold); text-transform:uppercase; letter-spacing:0.5px; opacity:0.8">${tglDisplay}</div>
            ${r.nomor_surat ? `<div style="font-size:11px; color:#fff; font-weight:700; margin-top:4px; background:rgba(255,255,255,0.05); padding:4px 8px; border-radius:6px; display:inline-block"><i class="fas fa-file-invoice" style="margin-right:6px; color:var(--gold)"></i> ${r.nomor_surat}</div>` : ''}
            <div style="font-size:15px; font-weight:800; color:var(--white); margin-top:6px; line-height:1.4">${ket}</div>
          </div>
          ${status === 'AKTIF' ? '<div class="status-badge s-warning" style="font-size:9px; letter-spacing:1px; font-weight:900">AKTIF</div>' : ''}
        </div>
        
        <div style="background:rgba(255,255,255,0.03); padding:12px; border-radius:10px; margin-top:10px">
          <div style="display:flex; justify-content:space-between; align-items:center">
             <div style="font-size:11px; color:var(--muted); display:flex; align-items:center; gap:8px">
                <i class="fas fa-bullseye" style="color:var(--danger)"></i>
                Radius: ${rad}m
             </div>
             <div style="display:flex; gap:8px">
                ${mapBtn}
                ${actionBtn}
             </div>
          </div>
          ${buktiTag}
        </div>
      </div>
    `;
  }

  /**
   * Distance Helper (Haversine)
   */
  function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // in meters
  }

  /**
   * Action: Kerjakan Tugas
   */
  window.handleKerjakanTugas = function(r) {
    if ((r.status || '').toUpperCase() === 'SELESAI') {
      Swal.fire('Info', 'Perjalanan dinas ini sudah diselesaikan.', 'info');
      return;
    }
    _activeTugasData = r;
    
    // Check if target coordinates are defined
    const hasTargetCoords = (r.lat && String(r.lat).trim() !== '' && r.lon && String(r.lon).trim() !== '');

    Swal.fire({
      title: 'Kerjakan Perjalanan Dinas',
      html: `
        <div style="margin-bottom:10px">
          <i class="fas fa-map-marker-alt" style="color:#ef4444; margin-right:8px"></i> 
          ${hasTargetCoords ? 'Pastikan Anda berada di lokasi perjalanan dinas.' : 'Sistem akan mencatat lokasi koordinat penyelesaian perjalanan dinas Anda.'}
        </div>
        <div style="font-size:12px; opacity:0.7">${hasTargetCoords ? 'Sistem akan mengecek jarak koordinat dan meminta bukti foto.' : 'Sistem akan mengambil koordinat lokasi Anda saat ini dan meminta bukti foto.'}</div>
      `,
      icon: 'info',
      showCancelButton: true,
      confirmButtonText: '📍 Cek Lokasi & Foto',
      cancelButtonText: 'Batal'
    }).then((res) => {
      if (res.isConfirmed) {
        // 1. Get Geolocation
        if (!navigator.geolocation) {
          alert('Geolocation tidak didukung di browser ini.');
          return;
        }

        Swal.fire({ title: 'Mengecek Lokasi...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        navigator.geolocation.getCurrentPosition(async (pos) => {
          const myLat = pos.coords.latitude;
          const myLon = pos.coords.longitude;
          
          let insideRadius = true;
          let dist = 0;
          
          if (hasTargetCoords) {
            dist = getDistance(myLat, myLon, parseFloat(r.lat), parseFloat(r.lon));
            if (dist > (r.radius || 100)) {
              insideRadius = false;
            }
          }

          if (!insideRadius) {
            Swal.fire('❌ Gagal', `Anda berada ${Math.round(dist)}m dari titik perjalanan dinas. Jarak maksimal adalah ${r.radius}m.`, 'error');
          } else {
            // 2. Trigger File Input
            Swal.close();
            _activeTugasData.actual_lat = myLat;
            _activeTugasData.actual_lon = myLon;
            $('tugasBuktiInput').click();
          }
        }, (err) => {
          Swal.fire('❌ Gagal', 'Gagal mendapatkan lokasi: ' + err.message, 'error');
        }, { enableHighAccuracy: true });
      }
    });
  };

  /**
   * Process Proof Upload
   */
  window.processTugasBukti = async function(input) {
    if (!input.files || !input.files[0] || !_activeTugasData) return;

    const file = input.files[0];
    
    Swal.fire({ title: 'Memproses Bukti...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
      let b64 = null;
      let fileMime = file.type;
      let fileName = file.name;

      if (file.type.startsWith('image/')) {
        const compressedDataUrl = await compressImage(file, 1280, 0.7);
        b64 = compressedDataUrl.split(',')[1];
        fileMime = 'image/jpeg';
        if (!fileName.toLowerCase().endsWith('.jpg') && !fileName.toLowerCase().endsWith('.jpeg')) {
          fileName = fileName.substring(0, fileName.lastIndexOf('.')) + '.jpg';
        }
      } else {
        b64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = ev => resolve(ev.target.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      // Check size (5MB limit)
      const sizeBytes = atob(b64).length;
      if (sizeBytes > 5 * 1024 * 1024) {
        Swal.fire({
          title: '❌ File Terlalu Besar',
          text: `Ukuran file (${(sizeBytes / 1024 / 1024).toFixed(2)} MB) melebihi batas maksimal 5 MB.`,
          icon: 'error',
          confirmButtonColor: '#3085d6'
        });
        input.value = '';
        return;
      }

      // Check if offline
      if (!navigator.onLine) {
        const base64DataUrl = `data:${fileMime};base64,${b64}`;
        const offlineData = {
          endpoint: P.penugasanSave,
          method: 'POST',
          payload: {
            id: _activeTugasData.id,
            status: 'SELESAI',
            bukti_base64: base64DataUrl,
            bukti_mime: fileMime,
            bukti_nama: fileName,
            actual_lat: _activeTugasData.actual_lat,
            actual_lon: _activeTugasData.actual_lon,
            pengerjaan_timestamp: Date.now()
          },
          timestamp: Date.now(),
          type: 'tugas',
          nip: _activeTugasData.nip
        };
        
        await idb.set('offline_queue', offlineData);
        
        Swal.fire({
          title: '📴 Disimpan Offline',
          text: 'Penyelesaian Perjalanan Dinas disimpan sementara di perangkat Anda karena tidak ada koneksi internet. Data akan disinkronisasikan otomatis saat terhubung internet.',
          icon: 'warning',
          confirmButtonText: 'OK'
        });
        loadMyAssignments();
        input.value = '';
        return;
      }

      // If online, send the payload with base64 image data directly
      const base64DataUrl = `data:${fileMime};base64,${b64}`;
      const updateRes = await apiPost(P.penugasanSave, {
        id: _activeTugasData.id,
        status: 'SELESAI',
        bukti_base64: base64DataUrl,
        bukti_mime: fileMime,
        bukti_nama: fileName,
        actual_lat: _activeTugasData.actual_lat,
        actual_lon: _activeTugasData.actual_lon,
        pengerjaan_timestamp: Date.now()
      });

      if (updateRes.ok) {
        Swal.fire('✅ Berhasil', 'Tugas telah diselesaikan!', 'success');
        loadMyAssignments();
      } else {
        throw new Error(updateRes.data?.message || 'Gagal memperbarui status tugas');
      }

    } catch (e) {
      Swal.fire('❌ Gagal', e.message, 'error');
    } finally {
      input.value = '';
    }
  };

  /* ════════════════════════════════════════════════════
     ADMIN/MANAGER LOGIC
     ════════════════════════════════════════════════════ */

  /**
   * Load Pegawai for Tugas Dropdown
   */
  async function loadTugasPegawai() {
    const el = $('tugasOptionsList');
    const pemberiEl = $('tugasPemberi');
    if (!el) return;
    el.innerHTML = '<div style="padding:10px; text-align:center; font-size:11px; color:var(--muted)">⏳ Memuat...</div>';
    
    try {
      // Use format=full to get ALL employees (including Kabid/Manager)
      const res = await apiGet(P.userList, { format: 'full' });
      const rows = res.rows || parseApiResponse(res.data) || [];
      
      _allPegawaiTugas = rows.map(u => {
        const j = String(u.jabatan || u.Jabatan || '').toLowerCase();
        let r = String(u.role || u.Role || 'USER').toLowerCase().trim();
        
        // Auto-detect role from jabatan if current role is 'user'
        if (r === 'user') {
          // STRICT matches to avoid flooding the list
          if (j === 'kepala badan' || j === 'kepala dinas') r = 'kepala';
          else if (j === 'sekretaris badan' || j === 'sekretaris') r = 'sekretaris';
          else if (j.startsWith('kepala bidang') || j === 'kabid') r = 'kabid';
          else if (j === 'irban') r = 'irban';
        }

        return {
          id: u.id || u.ID || u.telegram_id || '',
          nama: u.nama || u.Nama || u.username || '',
          nip: u.nip || u.NIP || '',
          jabatan: u.jabatan || u.Jabatan || '',
          role: r
        };
      }).sort((a, b) => a.nama.localeCompare(b.nama));

      renderTugasPegawaiList(_allPegawaiTugas);

      // Populate Pemberi Tugas dropdown if it exists (for Admins)
      if (pemberiEl) {
        const managers = _allPegawaiTugas.filter(u => 
          ['kepala', 'sekretaris', 'kabid', 'irban', 'admin', 'superadmin'].includes(u.role)
        );
        pemberiEl.innerHTML = '<option value="">-- Gunakan Profil Saya --</option>' + 
          managers.map(m => `<option value="${m.nip}|${m.nama}">${m.nama} (${m.role.toUpperCase()})</option>`).join('');
      }
    } catch (e) {
      el.innerHTML = '<div style="padding:10px; text-align:center; color:var(--danger)">❌ Gagal memuat pegawai</div>';
    }
  }

  function renderTugasPegawaiList(list) {
    const el = $('tugasOptionsList');
    if (!el) return;
    if (list.length === 0) {
      el.innerHTML = '<div style="padding:10px; text-align:center; color:var(--muted)">🔍 Tidak ditemukan</div>';
      return;
    }
    el.innerHTML = list.map(u => {
      const isSelected = _selectedTugasPegawai.some(s => s.id == u.id);
      return `
        <div class="dropdown-item ${isSelected ? 'selected' : ''}" onclick="selectTugasPegawai('${u.id}', '${u.nama.replace(/'/g, "\\'")}', '${u.nip}')">
          <div style="display:flex; align-items:center; justify-content:space-between; width:100%">
            <div>
              <span class="item-name">${u.nama}</span>
              <span class="item-nip">🪪 ${u.nip || '—'}</span>
            </div>
            ${isSelected ? '<i class="fas fa-check-circle" style="color:var(--success)"></i>' : ''}
          </div>
        </div>
      `;
    }).join('');
  }


  window.toggleTugasDropdown = function(forceClose = false) {
    const container = $('tugasPegawaiContainer');
    if (!container) return;
    if (forceClose) container.classList.remove('open');
    else {
      container.classList.toggle('open');
      if (container.classList.contains('open')) {
        if (!_allPegawaiTugas.length) loadTugasPegawai();
        $('tugasSearchInput').focus();
      }
    }
  };

  window.filterTugasPegawai = function(query) {
    const q = query.toLowerCase().trim();
    const filtered = _allPegawaiTugas.filter(u => u.nama.toLowerCase().includes(q) || u.nip.toLowerCase().includes(q));
    renderTugasPegawaiList(filtered);
    const container = $('tugasPegawaiContainer');
    if (container && !container.classList.contains('open')) container.classList.add('open');
  };

  window.selectTugasPegawai = function(id, nama, nip) {
    const idx = _selectedTugasPegawai.findIndex(p => p.id == id);
    if (idx > -1) {
      _selectedTugasPegawai.splice(idx, 1);
    } else {
      _selectedTugasPegawai.push({ id, nama, nip });
    }
    
    renderTugasPills();
    renderTugasPegawaiList(_allPegawaiTugas);
    
    // Multi-select: keep open and focus search
    $('tugasSearchInput').value = '';
    $('tugasSearchInput').focus();
  };

  function renderTugasPills() {
    const container = $('tugasSelectedPills');
    if (!container) {
      const trigger = document.querySelector('#tugasPegawaiContainer .dropdown-trigger');
      const pillsWrap = document.createElement('div');
      pillsWrap.id = 'tugasSelectedPills';
      pillsWrap.style = 'display:flex; flex-wrap:wrap; gap:6px; margin-top:10px;';
      trigger.parentNode.insertBefore(pillsWrap, trigger.nextSibling);
    }
    
    const el = $('tugasSelectedPills');
    if (_selectedTugasPegawai.length === 0) {
      el.innerHTML = '';
      return;
    }

    el.innerHTML = _selectedTugasPegawai.map(u => `
      <div class="pegawai-pill">
        <span>${u.nama.split(' ')[0]}</span>
        <i class="fas fa-times-circle" onclick="event.stopPropagation(); selectTugasPegawai('${u.id}')"></i>
      </div>
    `).join('');
  }


  /**
   * Map Initialization
   */
  function initTugasMap() {
    if (_tugasMap) return;
    
    // Default center (Sumba Barat / Kantor Bapperida)
    const defCenter = [-9.6548, 119.4122]; 
    _tugasMap = L.map('tugasMap').setView(defCenter, 15);
    
    L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      attribution: '&copy; Google Maps'
    }).addTo(_tugasMap);

    _tugasMap.on('click', function(e) {
      const { lat, lng } = e.latlng;
      setTugasMarker(lat, lng);
    });

    // Try to get current location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        const { latitude, longitude } = pos.coords;
        _tugasMap.setView([latitude, longitude], 16);
      });
    }
  }
  window.initTugasMap = initTugasMap;

  function setTugasMarker(lat, lng) {
    if (_tugasMarker) _tugasMarker.setLatLng([lat, lng]);
    else _tugasMarker = L.marker([lat, lng], { draggable: true }).addTo(_tugasMap);

    $('tugasLat').value = lat.toFixed(6);
    $('tugasLon').value = lng.toFixed(6);
  }

  /**
   * Save Assignment
   */
  window.handleSaveTugas = async function() {
    const pegSel = $('tugasPegawai');
    const lat = $('tugasLat').value;
    const lon = $('tugasLon').value;
    const ket = $('tugasKet').value.trim();
    const tgl = $('tugasTanggal').value;

    if (_selectedTugasPegawai.length === 0 || !tgl) {
      alert('⚠️ Harap pilih minimal satu pegawai dan tanggal tugas.');
      return;
    }

    // Save for each selected employee
    setBtnL('btnSaveTugas', true, '⏳ Memproses...');
    try {
      const pemberiVal = $('tugasPemberi')?.value || '';
      let creatorNama = userProfile?.nama || 'Admin';
      let creatorNip = userProfile?.nip || localStorage.getItem('MY_NIP');

      if (pemberiVal) {
        const [pNip, pNama] = pemberiVal.split('|');
        creatorNip = pNip;
        creatorNama = pNama;
      }

      const results = await Promise.all(_selectedTugasPegawai.map(async (u) => {
        const payload = {
          user_id: u.id,
          nama: u.nama,
          nip: u.nip,
          lat, lon,
          keterangan: ket,
          nomor_surat: $('tugasNomorSurat')?.value?.trim() || '',
          tanggal: tgl,
          radius: parseInt($('tugasRadius').value) || 100,
          created_by: creatorNama,
          created_by_nip: creatorNip,
          timestamp: Date.now()
        };
        return await apiPost(P.penugasanSave, payload);
      }));

      const allOk = results.every(r => r.ok && r.data?.ok !== false);
      if (allOk) {
        showResult('tugasResult', 'tugasRIcon', 'tugasRTitle', 'tugasRMsg', 'success', '✅', 'Penugasan Berhasil', 
          `${_selectedTugasPegawai.length} Pegawai telah ditugaskan pada ${tgl}.`);
        dom.show('tugasResult', 'flex');
        
        // Reset
        $('tugasKet').value = '';
        if ($('tugasNomorSurat')) $('tugasNomorSurat').value = '';
        if (_tugasMarker) { _tugasMap.removeLayer(_tugasMarker); _tugasMarker = null; }
        $('tugasLat').value = ''; $('tugasLon').value = '';
        _selectedTugasPegawai = [];
        renderTugasPills();
      } else {
        showResult('tugasResult', 'tugasRIcon', 'tugasRTitle', 'tugasRMsg', 'fail', '❌', 'Sebagian Gagal', 'Beberapa penugasan gagal disimpan.');
        dom.show('tugasResult', 'flex');
      }

    } catch (e) {
      alert('❌ Terjadi kesalahan koneksi.');
    } finally {
      setBtnL('btnSaveTugas', false, '💾 Simpan Penugasan');
    }
  };

  /* ════════════════════════════════════════════════════
     LEMBUR LOGIC
     ════════════════════════════════════════════════════ */

  /**
   * Load Pegawai for Lembur Dropdown
   */
  async function loadLemburPegawai() {
    const el = $('lemburOptionsList');
    if (!el) return;
    el.innerHTML = '<div style="padding:10px; text-align:center; font-size:11px; color:var(--muted)">⏳ Memuat...</div>';
    
    try {
      const res = await apiGet(P.userList + '?format=full');
      const rows = res.ok ? ((res.rows?.length ?? 0) ? res.rows : parseApiResponse(res.data)) : [];
      
      _allPegawaiLembur = rows.map(u => ({
        id: u.id || u.ID || u.telegram_id || '',
        nama: u.nama || u.Nama || u.username || '',
        nip: u.nip || u.NIP || '',
        jabatan: u.jabatan || u.Jabatan || '',
        pangkat: u.pangkat || u.Pangkat || ''
      })).sort((a, b) => a.nama.localeCompare(b.nama));

      renderLemburPegawaiList(_allPegawaiLembur);
    } catch (e) {
      el.innerHTML = '<div style="padding:10px; text-align:center; color:var(--danger)">❌ Gagal</div>';
    }
  }

  function renderLemburPegawaiList(list) {
    const el = $('lemburOptionsList');
    if (!el) return;
    if (list.length === 0) {
      el.innerHTML = '<div style="padding:10px; text-align:center; color:var(--muted)">🔍 Tidak ditemukan</div>';
      return;
    }
    el.innerHTML = list.map(u => {
      const isSelected = _selectedLemburPegawai.some(s => s.id == u.id);
      return `
        <div class="dropdown-item ${isSelected ? 'selected' : ''}" onclick="selectLemburPegawai('${u.id}', '${u.nama.replace(/'/g, "\\'")}', '${u.nip}')">
          <div style="display:flex; align-items:center; justify-content:space-between; width:100%">
            <div>
              <span class="item-name">${u.nama}</span>
              <span class="item-nip">🪪 ${u.nip || '—'}</span>
            </div>
            ${isSelected ? '<i class="fas fa-check-circle" style="color:var(--success)"></i>' : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  window.toggleLemburDropdown = function(forceClose = false) {
    const container = $('lemburPegawaiContainer');
    if (!container) return;
    if (forceClose) container.classList.remove('open');
    else {
      container.classList.toggle('open');
      if (container.classList.contains('open')) {
        if (!_allPegawaiLembur.length) loadLemburPegawai();
        $('lemburSearchInput').focus();
      }
    }
  };

  window.filterLemburPegawai = function(query) {
    const q = query.toLowerCase().trim();
    const filtered = _allPegawaiLembur.filter(u => u.nama.toLowerCase().includes(q) || u.nip.toLowerCase().includes(q));
    renderLemburPegawaiList(filtered);
    const container = $('lemburPegawaiContainer');
    if (container && !container.classList.contains('open')) container.classList.add('open');
  };

  window.selectLemburPegawai = function(id, nama, nip) {
    const idx = _selectedLemburPegawai.findIndex(p => p.id == id);
    if (idx > -1) {
      _selectedLemburPegawai.splice(idx, 1);
    } else {
      _selectedLemburPegawai.push({ id, nama, nip });
    }
    
    renderLemburPills();
    renderLemburPegawaiList(_allPegawaiLembur); // Refresh list for checkmarks
    
    // Don't close for multi-select
    $('lemburSearchInput').value = '';
    $('lemburSearchInput').focus();
  };

  function renderLemburPills() {
    const container = $('lemburSelectedPills');
    if (!container) {
      // Create container if not exists
      const trigger = document.querySelector('#lemburPegawaiContainer .dropdown-trigger');
      const pillsWrap = document.createElement('div');
      pillsWrap.id = 'lemburSelectedPills';
      pillsWrap.style = 'display:flex; flex-wrap:wrap; gap:6px; margin-top:10px;';
      trigger.parentNode.insertBefore(pillsWrap, trigger.nextSibling);
    }
    
    const el = $('lemburSelectedPills');
    if (_selectedLemburPegawai.length === 0) {
      el.innerHTML = '';
      return;
    }

    el.innerHTML = _selectedLemburPegawai.map(u => `
      <div class="pegawai-pill">
        <span>${u.nama.split(' ')[0]}</span>
        <i class="fas fa-times-circle" onclick="event.stopPropagation(); selectLemburPegawai('${u.id}')"></i>
      </div>
    `).join('');
  }

  window._selectedLemburDates = new Set();
  let _rawLemburRange = { start: null, end: null };

  // Setup Flatpickr when DOM loads or script runs
  setTimeout(() => {
    if (window.flatpickr && $('lemburDateSelect')) {
      flatpickr("#lemburDateSelect", {
        mode: "range",
        dateFormat: "Y-m-d",
        onChange: function(selectedDates, dateStr, instance) {
          if (selectedDates.length === 2) {
            _rawLemburRange.start = instance.formatDate(selectedDates[0], "Y-m-d");
            _rawLemburRange.end = instance.formatDate(selectedDates[1], "Y-m-d");
            window.recalculateLemburDates();
          } else {
            _rawLemburRange.start = null;
            _rawLemburRange.end = null;
            window._selectedLemburDates.clear();
            renderLemburDates();
          }
        }
      });
    }
  }, 500);

  window.recalculateLemburDates = async function() {
    if (!_rawLemburRange.start || !_rawLemburRange.end) return;
    
    const c = $('lemburSelectedDatesList');
    if (c) c.innerHTML = '<div class="shimmer" style="height:30px; width:100%; border-radius:8px"></div>';

    const start = new Date(_rawLemburRange.start);
    const end = new Date(_rawLemburRange.end);
    const includeSabtu = $('lemburIncludeSabtu')?.checked;

    // Fetch libur (holidays)
    let liburDates = new Set();
    try {
      const res = await apiGet(P.liburList);
      if (res.ok && res.data) {
        const liburData = parseApiResponse(res.data) || [];
        liburData.forEach(L => {
          if (L.tanggal) liburDates.add(L.tanggal);
        });
      }
    } catch(e) {
      console.warn("Gagal menarik data libur:", e);
    }
    window._currentLiburDates = liburDates; // Store globally for PDF coloring

    window._selectedLemburDates.clear();
    
    let current = new Date(start);
    while (current <= end) {
      const day = current.getDay();
      const dStr = current.getFullYear() + '-' + String(current.getMonth() + 1).padStart(2, '0') + '-' + String(current.getDate()).padStart(2, '0');
      
      let skip = false;
      if (day === 0) skip = true; // Sunday
      if (day === 6 && !includeSabtu) skip = true; // Saturday
      if (liburDates.has(dStr)) skip = true; // Hari Libur

      if (!skip) {
        window._selectedLemburDates.add(dStr);
      }
      current.setDate(current.getDate() + 1);
    }
    
    renderLemburDates();
  };

  window.removeLemburDate = function(d) {
    window._selectedLemburDates.delete(d);
    renderLemburDates();
  };

  function renderLemburDates() {
    const c = $('lemburSelectedDatesList');
    if (!c) return;

    if (window._selectedLemburDates.size === 0) {
      c.innerHTML = '';
      return;
    }

    const datesArr = Array.from(window._selectedLemburDates).sort();
    const n = datesArr.length;
    const first = datesArr[0].split('-').reverse().join('/');
    const last  = datesArr[n - 1].split('-').reverse().join('/');
    const label = n === 1 ? `📅 ${first}` : `📅 ${first} — ${last} &nbsp;·&nbsp; <strong>${n} hari kerja</strong>`;

    c.innerHTML = `
      <div style="
        background: rgba(212,175,55,0.08);
        border: 1px solid rgba(212,175,55,0.25);
        border-radius: 10px;
        padding: 8px 14px;
        font-size: 12px;
        font-weight: 600;
        color: var(--gold);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      ">
        <span>${label}</span>
        <span style="font-size:10px; opacity:0.7; cursor:pointer;" onclick="window._selectedLemburDates.clear(); renderLemburDates(); renderLemburPills();">✕ Reset</span>
      </div>
    `;
  }

  /**
   * Fetch Overtime Data
   */
  window.handleFetchLembur = async function() {
    if (window._selectedLemburDates.size === 0 || _selectedLemburPegawai.length === 0) {
      alert('⚠️ Harap pilih minimal satu tanggal dan pilih minimal satu pegawai.');
      return;
    }

    const nips = _selectedLemburPegawai.map(p => p.nip).join(',');
    const datesArr = Array.from(window._selectedLemburDates).sort();
    const dari = datesArr[0];
    const sampai = datesArr[datesArr.length - 1];

    const listEl = $('lemburResultList');
    listEl.innerHTML = '<div class="shimmer" style="height:100px; border-radius:15px"></div>';
    
    setBtnL('btnFetchLembur', true, '⌛ Menarik Data...');

    try {
      const [resLembur, resSig] = await Promise.all([
        apiGet(`${P.lemburGet}?dari=${dari}&sampai=${sampai}&nips=${nips}`),
        apiGet(P.signatureList)
      ]);

      if (!resLembur.ok) {
        const msg = getApiErrorMsg(resLembur.data, 'Gagal menarik data dari server.');
        listEl.innerHTML = `<div class="empty-state">❌ ${escapeHtml(msg)}</div>`;
        return;
      }
      
      let lemburData = parseApiResponse(resLembur.data) || [];
      
      const sigData = resSig.ok ? (parseApiResponse(resSig.data) || []) : [];
      const sigMap = {};
      sigData.forEach(s => {
        if (s.signature && s.signature.length > 100) {
          if (s.nip)         sigMap[String(s.nip).replace(/\s/g, '')] = s.signature;
          if (s.nip)         sigMap[String(s.nip)]                    = s.signature;
          if (s.telegram_id) sigMap[String(s.telegram_id)]            = s.signature;
        }
      });
      window._currentSigMap = sigMap;

      // Build NIP → signature map by cross-referencing pegawai list (id = telegram_id)
      const nipSigMap = {};
      (_allPegawaiLembur || []).forEach(p => {
        const nip = String(p.nip || '').replace(/\s/g, '');
        if (!nip) return;
        // Try direct NIP lookup first
        let sig = sigMap[nip] || sigMap[p.nip];
        // Fallback: lookup by id (telegram_id)
        if (!sig) {
          const tid = String(p.id || p.telegram_id || '');
          if (tid) sig = sigMap[tid];
        }
        if (sig) nipSigMap[nip] = sig;
      });
      window._currentNipSigMap = nipSigMap;

      // Filter only selected dates
      lemburData = lemburData.filter(r => window._selectedLemburDates.has(r.tanggal));
      
      // keterangan_status is now returned directly from lembur-get SQL (from Log_Absen SAKIT/TUGAS/IZIN entries)
      // For days where an employee has keterangan but NO masuk/pulang, lembur-get returns a row with
      // keterangan_status filled and jam_masuk/jam_pulang = null.
      // We just need to ensure all selected employees have rows for all selected dates.
      datesArr.forEach(date => {
        _selectedLemburPegawai.forEach(pegawai => {
          const exists = lemburData.find(l =>
            (l.nip || '').toString().trim() === (pegawai.nip || '').toString().trim()
            && l.tanggal === date
          );
          if (!exists) {
            // No log at all for this employee on this date → blank row
            lemburData.push({
              nip: pegawai.nip,
              nama: pegawai.nama,
              tanggal: date,
              jam_masuk: null,
              jam_pulang: null,
              keterangan_status: null
            });
          }
        });
      });

      
      // Sort final data by date
      lemburData.sort((a, b) => new Date(a.tanggal) - new Date(b.tanggal));
      
      renderLemburResults(lemburData);
      
      // Store data for PDF
      window._currentLemburData = lemburData;
      window._currentLemburRange = { dari, sampai, dates: datesArr };
      // Also re-fetch & store holiday set for PDF coloring (reuse from selection phase if available)
      if (!window._currentLiburDates) window._currentLiburDates = new Set();
      
    } catch (e) {
      listEl.innerHTML = `<div class="empty-state">❌ Terjadi kesalahan jaringan atau server offline.</div>`;
    } finally {
      setBtnL('btnFetchLembur', false, '📊 Tarik Data Lembur');
    }
  };

  /**
   * Calculate Overtime (Standard 14:30)
   */
  function calculateOvertime(jamPulang) {
    if (!jamPulang || jamPulang === '—') return 0;
    const standard = "14:30:00";
    const [h, m] = jamPulang.split(':').map(Number);
    const [sh, sm] = standard.split(':').map(Number);
    
    const pulMin = h * 60 + m;
    const stdMin = sh * 60 + sm;
    
    const diff = pulMin - stdMin;
    return diff > 0 ? diff : 0;
  }

  function formatDuration(minutes) {
    if (minutes <= 0) return '—';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h} jam ${m} mnt` : `${m} mnt`;
  }

  /**
   * Handle PDF Export (Matrix Format)
   */
  const rawLogoUrl = "https://raw.githubusercontent.com/hudsonjhonson9-arch/sekrebot/main/Lambang_Kabupaten_Sumba_Barat.png";

  window.generateLemburPDF = async function(options = {}) {
    const cfg = Object.assign({
      orientation: 'l',
      size: 'f4',
      margin: 10,
      fontSize: 7.5,
      padding: 2.0,
      rowPageBreak: 'avoid',
      previewOnly: false
    }, options);

    const data = window._currentLemburData;
    const range = window._currentLemburRange;
    if (!data || data.length === 0) {
      throw new Error('Tidak ada data lembur untuk dicetak.');
    }

    // 1. Get unique dates in range (sorted)
    const dates = range.dates || [...new Set(data.map(r => r.tanggal))].sort();
    
    // 2. Group data by employee (NIP)
    const groups = {};
    data.forEach(r => {
      if (!groups[r.nip]) {
        groups[r.nip] = {
          nama: r.nama,
          nip: r.nip,
          dates: {}
        };
      }
      if (r.keterangan_status) {
        groups[r.nip].dates[r.tanggal] = { ket: r.keterangan_status };
      } else {
        groups[r.nip].dates[r.tanggal] = {
          pulang: r.jam_pulang,
          mins: calculateOvertime(r.jam_pulang)
        };
      }
    });

    // Find true Kepala dynamically (excluding sub-heads like Kepala Bidang)
    const getKepalaSignatureData = (employees) => {
      if (!Array.isArray(employees)) return null;
      // 1. Strict top-level Kepala check
      let found = employees.find(u => {
        const j = (u.jabatan || u.Jabatan || '').toUpperCase();
        if (j.includes('BIDANG') || j.includes('SEKSI') || j.includes('SUB') || j.includes('BAGIAN') || j.includes('UPTD') || j.includes('PELAKSANA') || j.includes('FUNGSIONAL')) {
          return false;
        }
        return j.includes('KEPALA BADAN') || j.includes('KEPALA DINAS') || j.includes('INSPEKTUR') || j.includes('SEKRETARIS DAERAH') || j.includes('CAMAT') || j === 'KEPALA';
      });

      // 2. Broad Kepala check
      if (!found) {
        found = employees.find(u => {
          const j = (u.jabatan || u.Jabatan || '').toUpperCase();
          if (j.includes('BIDANG') || j.includes('SEKSI') || j.includes('SUB') || j.includes('BAGIAN') || j.includes('UPTD') || j.includes('PELAKSANA') || j.includes('FUNGSIONAL')) {
            return false;
          }
          return j.includes('KEPALA');
        });
      }
      return found;
    };

    const kb = getKepalaSignatureData(_allPegawaiLembur) || {
      nama: 'TITUS JURI, S.T., M.Si',
      pangkat: 'Pembina Utama Muda (IV/c)',
      nip: '19740523 200212 1 004',
      jabatan: 'Kepala Badan'
    };
    const kepTitle = kb.jabatan ? kb.jabatan : 'Kepala';

    const { jsPDF } = window.jspdf;
    if (!jsPDF) throw new Error('Library jsPDF tidak ditemukan');

    // 3. Setup paper size
    let width = 215;
    let height = 330;
    if (cfg.size === 'a4') { width = 210; height = 297; }
    else if (cfg.size === 'letter') { width = 216; height = 279; }

    const format = (cfg.orientation === 'l') ? [height, width] : [width, height];
    const doc = new jsPDF({
      orientation: cfg.orientation,
      unit: 'mm',
      format: format,
      compress: true
    });

    const pageWidth = doc.internal.pageSize.width || doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.height || doc.internal.pageSize.getHeight();
    const margin = cfg.margin;

    // 4. Proses Tabel & Hitung Kop Dinamis
    const instId = (typeof getScopedInstansiId === 'function' ? getScopedInstansiId() : null) || (window.userProfile?.instansi_id) || 'bapperida';
    const instData = typeof getInstansiData === 'function' ? getInstansiData(instId) : null;

    // Overrides from options, DOM, or LocalStorage
    const savedName = localStorage.getItem('absen_pdf_opt_header_name');
    const savedAlamat = localStorage.getItem('absen_pdf_opt_header_alamat');
    const savedKontak = localStorage.getItem('absen_pdf_opt_header_kontak');
    const savedLogo = localStorage.getItem('absen_pdf_opt_header_logo');
    const savedFont = localStorage.getItem('absen_pdf_opt_header_font');
    const savedFontSize = localStorage.getItem('absen_pdf_opt_header_font_size');

    const fullHeader = cfg.headerName !== undefined ? cfg.headerName : (($('pdfOptHeaderName')?.value || '').trim() || savedName || instData?.header || instData?.nama_instansi || 'BADAN PERENCANAAN PEMBANGUNAN RISET DAN INOVASI DAERAH');
    const instAlamat = cfg.headerAlamat !== undefined ? cfg.headerAlamat : (($('pdfOptHeaderAlamat')?.value || '').trim() || savedAlamat || instData?.alamat || 'Jl. Weekarou, Waikabubak, Sumba Barat, Nusa Tenggara Timur\nWAIKABUBAK');
    const instKontak = cfg.headerKontak !== undefined ? cfg.headerKontak : (($('pdfOptHeaderKontak')?.value || '').trim() || savedKontak || instData?.kontak || '');
    const logoUrl = cfg.headerLogo !== undefined ? cfg.headerLogo : (($('pdfOptHeaderLogo')?.value || '').trim() || savedLogo || instData?.logo_url || rawLogoUrl);

    const headerFont = cfg.headerFont !== undefined ? cfg.headerFont : ($('pdfOptHeaderFont')?.value || savedFont || instData?.header_font || 'times');
    const headerSize = parseFloat(cfg.headerFontSize !== undefined ? cfg.headerFontSize : ($('pdfOptHeaderFontSize')?.value || savedFontSize || instData?.header_size || '15'));

    const sizePemerintah = Math.max(9, headerSize * 0.72);
    const sizeAlamat = Math.max(7, headerSize * 0.55);
    const sizeKontak = Math.max(6, headerSize * 0.5);

    doc.setFont(headerFont, 'bold');
    doc.setFontSize(headerSize);
    const headerLines = doc.splitTextToSize(fullHeader.toUpperCase(), pageWidth - 55);
    
    let currentHeaderY = 20;
    headerLines.forEach(() => {
      currentHeaderY += (headerSize * 0.35);
    });

    doc.setFont(headerFont, 'normal');
    doc.setFontSize(sizeAlamat);
    const addressLines = doc.splitTextToSize(instAlamat, pageWidth - 55);
    let currentAddressY = currentHeaderY;
    addressLines.forEach(() => {
      currentAddressY += (sizeAlamat * 0.45);
    });

    if (instKontak) {
      doc.setFont(headerFont, 'bold');
      doc.setFontSize(sizeKontak);
      const contactLines = doc.splitTextToSize(instKontak, pageWidth - 55);
      contactLines.forEach(() => {
        currentAddressY += (sizeKontak * 0.45);
      });
    }

    const dalamRangka = cfg.judul !== undefined ? cfg.judul : (range.judul || ($('lemburDalamRangka')?.value || '').trim());
    const nomorSurat = cfg.nomor_surat !== undefined ? cfg.nomor_surat : (range.nomor_surat || '');

    const finalDividerY = Math.max(currentAddressY + 1.5, 37);
    const docTitleY   = finalDividerY + 9;
    const hasNomor    = !!nomorSurat;
    const docNomorY   = docTitleY + 5.5;
    const docPeriodeY = hasNomor ? docNomorY + 5.5 : docTitleY + 5.5;
    const docRangkaY  = dalamRangka ? docPeriodeY + 5.5 : docPeriodeY;
    const calculatedStartY = docRangkaY + 7;

    // 5. Build Overtime Matrix Table — 2-row header (matches paper format)
    // Row1: NO(r2) | NAMA(r2) | [DD-Mon-YY colSpan:2] | JML JAM(r2) | PARAF(r2) | ...
    // Row2:                     MASUK | PULANG
    // Body: 4 cols per date: MASUK | PULANG | JML JAM | PARAF
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];

    // Single-row header: NO | NAMA | [DD-Mon-YY colSpan:2] | JML JAM | TTD | ...
    const headRow = [
      { content: 'NO',      styles: { halign: 'center', valign: 'middle' } },
      { content: 'NAMA\n& NIP', styles: { halign: 'center', valign: 'middle' } }
    ];

    dates.forEach(d => {
      const [y, m, day] = d.split('-');
      const label = `${day}-${monthNames[parseInt(m,10)-1]}-${y.substring(2)}`;
      headRow.push({ content: label,      colSpan: 2, styles: { halign: 'center', valign: 'middle' } });
      headRow.push({ content: 'JML\nJAM',             styles: { halign: 'center', valign: 'middle' } });
      headRow.push({ content: 'TTD',                   styles: { halign: 'center', valign: 'middle' } });
    });

    const head = [headRow];

    // Body: 4 items per date [MASUK][PULANG][JML JAM][PARAF]
    const body = Object.values(groups).map((g, i) => {
      const row = [
        { content: i + 1, styles: { halign: 'center', valign: 'middle' } },
        { content: `${g.nama}\nNIP. ${g.nip}`, styles: { valign: 'middle' } }
      ];
      dates.forEach(d => {
        const val = g.dates[d];
        if (!val) {
          row.push(
            { content: '—', styles: { halign: 'center' } },
            { content: '—', styles: { halign: 'center' } },
            { content: '—', styles: { halign: 'center' } },
            { content: '',  styles: { halign: 'center' } }
          );
        } else if (val.ket) {
          // keterangan: span MASUK+PULANG+JML JAM = 3, PARAF kosong
          row.push(
            { content: val.ket, colSpan: 3,
              styles: { halign: 'center', fontStyle: 'bold', textColor: [160, 60, 0] } },
            { content: '', styles: { halign: 'center' } }
          );
        } else {
          const mins = val.mins || 0;
          row.push(
            { content: '14.30',                                    styles: { halign: 'center' } },
            { content: (val.pulang || '').replace(':', '.'),       styles: { halign: 'center' } },
            { content: mins > 0 ? formatDuration(mins) : '—',     styles: { halign: 'center' } },
            { content: '',                                         styles: { halign: 'center' } }
          );
        }
      });
      return row;
    });

    // ── Auto-scale to ALWAYS fit in 1 page width ──────────────────────────────
    const usableWidth = pageWidth - margin * 2;
    const nDates = dates.length;

    // Fixed columns
    const noW = 6;
    // Shrink NAMA column as dates grow; minimum 20mm
    const namaW = Math.max(20, Math.min(36, 36 - (nDates - 3) * 1.2));

    // Total width available for all date groups combined
    const remainW = usableWidth - noW - namaW;
    // Each date = 4 sub-cols: MASUK(ratio 2) + PULANG(ratio 2) + JML(ratio 2) + TTD(ratio 3) = 9 parts
    // Total parts = nDates * 9
    const totalParts = nDates * 9;
    const onePart = remainW / totalParts;
    // Sub-col widths derived from one "part" unit — guaranteed to sum exactly to remainW
    const subW = onePart * 2;   // MASUK & PULANG each
    const jmlW = onePart * 2;   // JML JAM
    const ttdW = onePart * 3;   // TTD (wider for signature)

    // Aggressive font/padding shrink so rows fit vertically too
    // Base row height is roughly (fontSize * 1.8 + padding*2) in mm
    // Target: (nEmployees + 1 header) rows * rowH <= usablePageH
    const usablePageH = pageHeight - calculatedStartY - 65; // reserve footer
    const nRows = Object.keys(groups).length + 1;
    const maxRowH = Math.max(6, usablePageH / nRows);
    // fontSize that fits: maxRowH ≈ fontSize * 0.45 + padding*2
    const fsByHeight = Math.max(5.5, (maxRowH - 4) / 0.45);
    const autoFontSize = Math.min(cfg.fontSize, Math.max(5.5, cfg.fontSize - (nDates - 3) * 0.25), fsByHeight);
    const autoPad      = Math.max(0.6, Math.min(cfg.padding, cfg.padding - (nDates - 3) * 0.12));

    // ── Weekend / Holiday helper ───────────────────────────────────────────────
    const liburSet = window._currentLiburDates || new Set();
    function isWeekendOrLibur(dateStr) {
      if (!dateStr) return false;
      const d = new Date(dateStr + 'T00:00:00');
      const day = d.getDay();
      return day === 0 || day === 6 || liburSet.has(dateStr);
    }
    // Build set of "red" date indices for quick lookup in didDrawCell
    const redDateIndices = new Set();
    dates.forEach((d, i) => { if (isWeekendOrLibur(d)) redDateIndices.add(i); });

    // Column styles: per date = [masuk][pulang][jml][ttd]
    const colStyles = {
      0: { cellWidth: noW,   halign: 'center' },
      1: { cellWidth: namaW, halign: 'left'   }
    };
    dates.forEach((_, i) => {
      const base = 2 + i * 4;
      colStyles[base]     = { cellWidth: subW,  halign: 'center' }; // MASUK
      colStyles[base + 1] = { cellWidth: subW,  halign: 'center' }; // PULANG
      colStyles[base + 2] = { cellWidth: jmlW,  halign: 'center' }; // JML JAM
      colStyles[base + 3] = { cellWidth: ttdW,  halign: 'center', minCellHeight: 12 }; // TTD
    });

    // Build indexed groups array for direct row lookup in didDrawCell
    const groupsArr = Object.values(groups);

    doc.autoTable({
      startY: calculatedStartY,
      margin: { top: 20, left: margin, right: margin, bottom: 20 },
      head: head,
      body: body,
      theme: 'grid',
      headStyles: {
        fillColor: [240, 240, 240],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
        fontSize: autoFontSize,
        lineWidth: 0.2,
        lineColor: [100, 100, 100]
      },
      styles: {
        font: 'times',
        fontSize: autoFontSize,
        cellPadding: autoPad,
        valign: 'middle',
        overflow: 'linebreak',
        lineWidth: 0.2,
        lineColor: [120, 120, 120]
      },
      rowPageBreak: cfg.rowPageBreak,
      columnStyles: colStyles,
      willDrawCell: (data) => {
        // Color weekend/holiday columns red (header + body)
        if (data.column.index < 2) return;
        const colOffset = data.column.index - 2;
        const dateIdx = Math.floor(colOffset / 4);
        if (!redDateIndices.has(dateIdx)) return;

        if (data.section === 'head') {
          // Light red background for header
          data.cell.styles.fillColor = [255, 220, 220];
          data.cell.styles.textColor = [180, 0, 0];
          data.cell.styles.fontStyle = 'bold';
        } else if (data.section === 'body') {
          // Very light red tint for body cells
          data.cell.styles.fillColor = [255, 240, 240];
          data.cell.styles.textColor = [180, 0, 0];
        }
      },
      didDrawCell: (data) => {
        // Auto-render TTD: find signature by NIP first, then by telegram_id fallback
        if (data.section !== 'body' || data.column.index < 2) return;
        const dataColIdx = data.column.index - 2;
        if (dataColIdx % 4 !== 3) return; // only TTD columns

        const g = groupsArr[data.row.index];
        if (!g) return;

        // Check if this date has keterangan (skip TTD)
        const dateIdx = Math.floor(dataColIdx / 4);
        const dateKey = dates[dateIdx];
        const val = g.dates[dateKey];
        if (!val || val.ket) return; // keterangan or no data → no TTD

        const nipClean  = String(g.nip || '').replace(/\s/g, '');
        const nipSigMap = window._currentNipSigMap || {};
        const sigMap    = window._currentSigMap    || {};

        // DEBUG (remove after fix)
        if (dataColIdx === 3 && data.row.index === 0) {
          console.log('[TTD-DEBUG] nipClean:', nipClean,
            '| nipSigMap keys:', Object.keys(nipSigMap),
            '| found:', !!nipSigMap[nipClean]);
        }

        // Use NIP-keyed map (built via _allPegawaiLembur cross-ref at fetch time)
        let sig = nipSigMap[nipClean] || sigMap[nipClean] || sigMap[g.nip];

        // Fallback: find telegram_id via _selectedLemburPegawai
        if (!sig) {
          const peg = (window._selectedLemburPegawai || []).find(p =>
            String(p.nip || '').replace(/\s/g, '') === nipClean);
          if (peg) {
            const tid = String(peg.id || peg.telegram_id || '');
            sig = sigMap[tid];
          }
        }

        if (!sig) return;

        try {
          const pad = 2;
          doc.addImage(sig, 'PNG',
            data.cell.x + pad,
            data.cell.y + pad,
            data.cell.width  - pad * 2,
            data.cell.height - pad * 2,
            undefined, 'FAST');
        } catch(e) {}
      },
      didDrawPage: (data) => {
        if (data.pageNumber === 1) {
          try {
            const drawLogo = window._pdfImageCache[logoUrl] || logoUrl;
            doc.addImage(drawLogo, 'PNG', margin + 5, 10, 22, 25, undefined, 'FAST');
          } catch (e) {
            try {
              const drawDefault = window._pdfImageCache[rawLogoUrl] || rawLogoUrl;
              doc.addImage(drawDefault, 'PNG', margin + 5, 10, 22, 25, undefined, 'FAST');
            } catch (err) { }
          }

          doc.setFont('times', 'bold');
          doc.setFontSize(sizePemerintah);
          doc.text('PEMERINTAH KABUPATEN SUMBA BARAT', pageWidth / 2 + 10, 15, { align: 'center' });
          
          // Draw Dynamic Kop Header lines
          doc.setFont(headerFont, 'bold');
          doc.setFontSize(headerSize);
          let drawHeaderY = 20;
          headerLines.forEach((line) => {
            doc.text(line, pageWidth / 2 + 10, drawHeaderY, { align: 'center' });
            drawHeaderY += (headerSize * 0.35);
          });

          // Draw Dynamic Address lines
          doc.setFont(headerFont, 'normal');
          doc.setFontSize(sizeAlamat);
          let drawAddressY = drawHeaderY;
          addressLines.forEach((line) => {
            doc.text(line, pageWidth / 2 + 10, drawAddressY, { align: 'center' });
            drawAddressY += (sizeAlamat * 0.45);
          });

          // Draw Dynamic Contact lines
          if (instKontak) {
            doc.setFont(headerFont, 'bold');
            doc.setFontSize(sizeKontak);
            const contactLines = doc.splitTextToSize(instKontak, pageWidth - 55);
            contactLines.forEach((line) => {
              doc.text(line, pageWidth / 2 + 10, drawAddressY, { align: 'center' });
              drawAddressY += (sizeKontak * 0.45);
            });
          }

          // Draw Divider lines
          doc.setLineWidth(0.7);
          doc.line(margin + 5, finalDividerY, pageWidth - (margin + 5), finalDividerY);
          doc.setLineWidth(0.2);
          doc.line(margin + 5, finalDividerY + 0.8, pageWidth - (margin + 5), finalDividerY + 0.8);

          // Draw Document Title and Periode
          doc.setFontSize(11);
          doc.setFont('times', 'bold');
          doc.text('REKAPITULASI KERJA LEMBUR PEGAWAI', pageWidth / 2, docTitleY, { align: 'center' });
          if (nomorSurat) {
            doc.setFontSize(9.5);
            doc.setFont('times', 'bold');
            doc.text(`Nomor: ${nomorSurat}`, pageWidth / 2, docNomorY, { align: 'center' });
          }
          doc.setFont('times', 'normal');
          doc.setFontSize(9);
          doc.text(`Periode: ${range.dari} s/d ${range.sampai}`, pageWidth / 2, docPeriodeY, { align: 'center' });
          if (dalamRangka) {
            doc.setFont('times', 'italic');
            doc.setFontSize(8.5);
            doc.text(`Dalam Rangka: ${dalamRangka}`, pageWidth / 2, docRangkaY, { align: 'center' });
          }
        }
      }
    });

    // 6. Signature Footer
    let footerY = doc.lastAutoTable.finalY + 15;
    if (footerY + 45 > pageHeight) {
      doc.addPage();
      footerY = 25;
    }

    doc.setFontSize(10);
    const signatureX = pageWidth - 60;
    doc.text(`Waikabubak, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, signatureX, footerY, { align: 'center' });
    doc.text('Mengetahui,', signatureX, footerY + 6, { align: 'center' });
    doc.text(kepTitle, signatureX, footerY + 11, { align: 'center' });

    doc.setFont('times', 'bold');
    doc.text(kb.nama, signatureX, footerY + 38, { align: 'center' });
    doc.setFont('times', 'normal');
    if (kb.pangkat) {
      doc.text(kb.pangkat, signatureX, footerY + 44, { align: 'center' });
      doc.text(`NIP. ${kb.nip || '—'}`, signatureX, footerY + 49, { align: 'center' });
    } else {
      doc.text(`NIP. ${kb.nip || '—'}`, signatureX, footerY + 44, { align: 'center' });
    }

    // 7. Store references
    const fileName = `Rekap_Kerja_Lembur_${range.dari}_${range.sampai}.pdf`;
    const pdfBase64 = doc.output('datauristring').split(',')[1];
    const pdfMsg = `📄 *REKAPITULASI KERJA LEMBUR PDF*\n📅 Periode: ${range.dari} s/d ${range.sampai}\n👤 Peminta: ${window.userProfile?.nama || window.MY_ID}\n🪪 NIP: ${localStorage.getItem('MY_NIP') || '-'}\n\nLaporan lembur telah siap.`;
    const instName = instData?.nama_instansi || (typeof getInstansiName === 'function' ? getInstansiName(instId) : instId.toUpperCase());

    window.lastGeneratedDoc = doc;
    window.lastGeneratedFileName = fileName;
    window.lastGeneratedPdfBase64 = pdfBase64;
    window.lastGeneratedPdfMsg = pdfMsg;
    window.lastGeneratedInstId = instId;
    window.lastGeneratedInstName = instName;

    if (cfg.previewOnly) {
      return;
    }

    // Android Native Download Support
    if (window.Capacitor) {
      try {
        const { Filesystem } = window.Capacitor.Plugins;
        const { Share } = window.Capacitor.Plugins;
        
        if (Filesystem) {
          const writeResult = await Filesystem.writeFile({
            path: fileName,
            data: pdfBase64,
            directory: 'CACHE',
            encoding: ''
          });
          
          if (Share) {
            await Share.share({
              title: 'Unduh Rekap Lembur',
              text: 'Berikut adalah laporan rekap lembur yang Anda unduh.',
              url: writeResult.uri,
              dialogTitle: 'Buka atau Simpan PDF'
            });
          }
        }
      } catch (err) {
        console.error("Capacitor download error:", err);
        alert('❌ Gagal menyimpan PDF: ' + err.message);
      }
    } else {
      doc.save(fileName);
    }

    // Send to Telegram Webhook
    await apiPost(P.kirimRekap, { 
      chat_id: REKAP_CHAT_ID, 
      pesan: pdfMsg,
      nip: localStorage.getItem('MY_NIP') || '',
      file_base64: pdfBase64,
      file_name: fileName,
      instansi_id: instId,
      instansi_name: instName
    });
    alert('✅ Rekap Lembur PDF berhasil dikirim!');
  };

  window.handleExportLemburPDF = async function(options = null) {
    const data = window._currentLemburData;
    if (!data || data.length === 0) return alert('Tidak ada data untuk dicetak.');

    // Show preview and settings modal on all devices before generating
    if (!options || !options.previewOnly) {
      window.pdfPreviewContext = 'lembur';
      if (typeof window.openPdfPreviewModal === 'function') window.openPdfPreviewModal();
      return;
    }

    const defaults = {
      orientation: 'l',
      size: 'f4',
      margin: 10,
      fontSize: 7.5,
      padding: 2.0,
      rowPageBreak: 'avoid',
      previewOnly: false
    };
    const cfg = Object.assign({}, defaults, options);

    await window.generateLemburPDF(cfg);
  };

  /**
   * Render Results to UI
   */
  function renderLemburResults(data) {
    const listEl = $('lemburResultList');
    if (!listEl) return;

    if (data.length === 0) {
      listEl.innerHTML = '<div class="empty-state">📭 Tidak ada data absen untuk rentang ini.</div>';
      return;
    }

    const isArchiveMode = !!window._currentLemburArchiveId;

    const actionButtons = isArchiveMode ? `
      <div style="display:flex; gap:8px;">
        <button class="btn-sm-admin" onclick="exitLemburArchivePreview()" style="background:#6b7280; color:white; border:none; padding:6px 12px; border-radius:8px; font-size:10px; font-weight:700; cursor:pointer;">
           ✕ Tutup Preview
        </button>
        <button class="btn-sm-admin" onclick="handleExportLemburPDF()" style="background:var(--success); border:none; color:white; padding:6px 12px; border-radius:8px; font-size:10px; font-weight:700; cursor:pointer;">
           📄 Cetak Rekap PDF
        </button>
      </div>
    ` : `
      <div style="display:flex; gap:8px;">
        <button class="btn-sm-admin" onclick="handleExportLemburPDF()" style="background:var(--success); border:none; color:white; padding:6px 12px; border-radius:8px; font-size:10px; font-weight:700; cursor:pointer;">
           📄 Cetak Rekap PDF
        </button>
        <button id="btnSaveLemburRekap" class="btn-sm-admin" onclick="handleSaveLemburRekap()" style="background:var(--gold); border:none; color:black; padding:6px 12px; border-radius:8px; font-size:10px; font-weight:700; cursor:pointer;">
           💾 Simpan Rekap
        </button>
      </div>
    `;

    const header = `
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:15px; margin-top:20px">
        <div style="font-size:12px; font-weight:800; color:var(--white)">
          ${isArchiveMode ? '📂 PREVIEW ARSIP' : '📋 HASIL PENCARIAN'} (${data.length})
        </div>
        ${actionButtons}
      </div>
    `;

    // Color palette per status
    const KET_STYLE = {
      'SAKIT':  { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   icon: '🤒', border: '#ef4444' },
      'TUGAS':  { color: '#f97316', bg: 'rgba(249,115,22,0.12)',  icon: '💼', border: '#f97316' },
      'IZIN':   { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  icon: '🙏', border: '#3b82f6' },
      'CUTI':   { color: '#a855f7', bg: 'rgba(168,85,247,0.12)',  icon: '🏖️', border: '#a855f7' },
      'TUBEL':  { color: '#ec4899', bg: 'rgba(236,72,153,0.12)',  icon: '🎓', border: '#ec4899' },
    };

    const items = data.map(r => {
      const minutes = calculateOvertime(r.jam_pulang);
      const ket = (r.keterangan_status || '').toString().toUpperCase().trim();
      const ketStyle = KET_STYLE[ket];

      // Determine card border color
      let borderColor = ket && ketStyle ? ketStyle.border : (minutes > 0 ? 'var(--success)' : 'rgba(255,255,255,0.1)');

      // Duration / status display
      let durasiHtml;
      if (ket && ketStyle) {
        durasiHtml = `
          <div style="font-size:9px; color:var(--muted)">STATUS</div>
          <div style="
            display:inline-flex; align-items:center; gap:4px;
            background:${ketStyle.bg};
            color:${ketStyle.color};
            border:1px solid ${ketStyle.color}55;
            border-radius:8px;
            padding:3px 10px;
            font-size:12px;
            font-weight:900;
            margin-top:2px;
            letter-spacing:0.5px;
          ">${ketStyle.icon} ${ket}</div>
        `;
      } else {
        const dur = formatDuration(minutes);
        const durColor = minutes > 0 ? 'var(--gold)' : 'var(--muted)';
        durasiHtml = `
          <div style="font-size:9px; color:var(--muted)">DURASI LEMBUR</div>
          <div style="font-size:14px; font-weight:900; color:${durColor}">${dur}</div>
        `;
      }

      return `
        <div class="card glass-card" style="margin-bottom:12px; border-left:4px solid ${borderColor}">
          <div style="display:flex; justify-content:space-between; align-items:flex-start">
            <div>
              <div style="font-size:13px; font-weight:800; color:var(--white)">${r.nama}</div>
              <div style="font-size:10px; color:var(--muted); margin-bottom:8px">NIP: ${r.nip} | Tanggal: ${r.tanggal}</div>
              
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px">
                <div style="background:rgba(255,255,255,0.03); padding:6px; border-radius:8px">
                  <div style="font-size:8px; color:var(--muted)">MASUK</div>
                  <div style="font-size:11px; font-weight:700; color:var(--success)">${r.jam_masuk || '—'}</div>
                </div>
                <div style="background:rgba(255,255,255,0.03); padding:6px; border-radius:8px">
                  <div style="font-size:8px; color:var(--muted)">PULANG</div>
                  <div style="font-size:11px; font-weight:700; color:var(--info)">${r.jam_pulang || '—'}</div>
                </div>
              </div>
            </div>
            
            <div style="text-align:right; min-width:90px">
              ${durasiHtml}
            </div>
          </div>
        </div>
      `;
    }).join('');

    listEl.innerHTML = header + items;
  }

  // Close dropdowns on click outside
  document.addEventListener('click', (e) => {
    const tCont = $('tugasPegawaiContainer');
    if (tCont && !tCont.contains(e.target)) window.toggleTugasDropdown(true);
    
    const lCont = $('lemburPegawaiContainer');
    if (lCont && !lCont.contains(e.target)) window.toggleLemburDropdown(true);
  });

  /**
   * Load Monitoring Tasks (Tasks created by this manager)
   */
  async function loadMonitoringTasks() {
    const el = $('tugasMonitoringSection');
    if (!el) return;
    
    const p = userProfile || {};
    const role = String(p.role || localStorage.getItem('MY_ROLE') || 'USER').toLowerCase().trim();
    const isManager = ['kepala', 'sekretaris', 'kabid', 'irban', 'admin', 'superadmin'].includes(role) || !!window.IS_ADMIN;
    if (!isManager) {
      el.innerHTML = '';
      return;
    }

    el.innerHTML = `
      <div class="shimmer-wrapper">
        <div class="shimmer sh-line" style="width:100%; height:80px; border-radius:15px; margin-bottom:10px"></div>
      </div>
    `;

    try {
      const myNip = userProfile?.nip || localStorage.getItem('MY_NIP');
      const isAdmin = ['admin', 'superadmin'].includes(role) || !!window.IS_ADMIN;
      
      // Fetch tasks: Admins see everything, Managers see what they created
      let url = `${P.penugasanList}?limit=100`;
      if (!isAdmin) {
        url += `&created_by_nip=${myNip}`;
      }
      
      const res = await apiGet(url);
      
      if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
      
      const data = res.rows || parseApiResponse(res.data) || [];
      _activeMonitoringTasks = data; // Store data in module scope for id-based lookup
      renderMonitoringTasks(data);
    } catch (e) {
      console.error('[TugasLembur] Monitoring Load Error:', e);
      el.innerHTML = `<div class="empty-state" style="padding:20px; font-size:11px">⚠️ Gagal memuat monitoring: ${escapeHtml(e.message)}</div>`;
    }
  }

  function renderMonitoringTasks(data) {
    const el = $('tugasMonitoringSection');
    if (!el) return;

    if (data.length === 0) {
      el.innerHTML = `
        <div class="card glass-card" style="padding:20px; text-align:center; opacity:0.7">
          <div style="font-size:24px; margin-bottom:8px">📡</div>
          <div style="font-size:11px; font-weight:700">Belum ada perjalanan dinas yang Anda instruksikan</div>
          <div style="font-size:9px; color:var(--muted)">Progres perjalanan dinas yang Anda berikan ke staf akan muncul di sini.</div>
        </div>
      `;
      return;
    }

    const header = `
      <div style="font-size:12px; font-weight:800; color:var(--gold); margin-bottom:15px; margin-top:25px; text-transform:uppercase; letter-spacing:1px">
        <i class="fas fa-satellite-dish" style="margin-right:8px"></i> Monitoring Progres Perjalanan Dinas
      </div>
    `;

    const cards = data.map(t => {
      const isSelesai = String(t.status).toUpperCase() === 'SELESAI';
      const color = isSelesai ? 'var(--success)' : 'var(--warning)';
      const icon = isSelesai ? 'check-circle' : 'clock';
      
      let tglDisplay = t.tanggal || '—';
      try {
        if (tglDisplay.includes('T') || tglDisplay.includes('-')) {
          const d = new Date(tglDisplay);
          if (!isNaN(d.getTime())) {
            tglDisplay = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
          }
        }
      } catch (err) {}

      return `
        <div class="card glass-card" style="margin-bottom:12px; border-left: 4px solid ${color}">
          <div style="display:flex; justify-content:space-between; align-items:flex-start">
            <div style="flex:1">
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px">
                <div style="font-size:13px; font-weight:800; color:var(--white)">${t.nama || '—'}</div>
                <span class="status-badge" style="background:${isSelesai ? 'rgba(34,197,94,0.1)' : 'rgba(234,179,8,0.1)'}; color:${color}; font-size:9px; border:1px solid ${color}44">
                  <i class="fas fa-${icon}" style="margin-right:4px"></i> ${t.status || 'PENDING'}
                </span>
              </div>
              <div style="font-size:10px; color:var(--muted)">NIP: ${t.nip || '—'}</div>
              <div style="font-size:9px; color:var(--gold); margin-top:2px; font-weight:700">
                <i class="fas fa-user-tie"></i> Pemberi: ${t.created_by || 'Admin'}
              </div>
              <div style="font-size:11px; color:var(--text); margin-top:8px; line-height:1.4">
                <strong>Ket:</strong> ${t.keterangan || '—'}
              </div>
              <div style="font-size:9px; color:var(--muted); margin-top:8px; display:flex; align-items:center; gap:10px">
                 <span>📅 ${tglDisplay}</span>
                 <span>📍 Radius ${t.radius || 100}m</span>
              </div>
            </div>
            
            ${t.bukti ? `
              <button onclick="viewTugasBuktiById('${t.id}')" style="background:rgba(255,255,255,0.05); border:1px solid var(--border); color:var(--white); padding:6px 12px; border-radius:10px; font-size:10px; font-weight:700; cursor:pointer">
                📷 BUKTI
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    el.innerHTML = header + cards;
  }

  window.viewTugasBuktiById = function(id) {
    const t = _activeMonitoringTasks.find(x => x.id === id);
    if (!t || !t.bukti) return;
    viewTugasBukti(t.bukti, t.nama);
  };

  window.viewMyTugasBuktiById = function(id) {
    const t = _activeMyTasks.find(x => x.id === id);
    if (!t || !t.bukti) return;
    viewTugasBukti(t.bukti, t.nama || (typeof userProfile !== 'undefined' && userProfile ? userProfile.nama : 'bukti'));
  };

  window.downloadPdfFromBase64 = function(base64Data, filename) {
    try {
      const link = document.createElement('a');
      link.href = base64Data;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error('[TugasLembur] Failed to download PDF:', e);
      alert('Gagal mengunduh file PDF.');
    }
  };

  window.viewTugasBukti = function(url, namaPegawai = 'bukti') {
    if (!url) return;
    const processedUrl = getDirectImageUrlOrBase64(url);
    if (!processedUrl) {
      Swal.fire('Info', 'Data bukti rusak atau tidak valid.', 'info');
      return;
    }
    const isGDrive = url.includes('drive.google.com');
    const isPdf = processedUrl.startsWith('data:application/pdf');
    
    if (isPdf) {
      Swal.fire({
        title: 'Bukti Pengerjaan (PDF)',
        html: `
          <div style="margin: 15px 0;">
            <p style="font-size: 12px; opacity: 0.8; margin-bottom:15px">Dokumen bukti pengerjaan tugas dalam format PDF.</p>
            <button onclick="downloadPdfFromBase64('${processedUrl}', '${namaPegawai.replace(/'/g, "\\'")}_bukti.pdf')" class="btn-sm" style="background:#ef4444; color:#fff; border:none; padding:10px 20px; border-radius:10px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:8px;">
              <i class="fas fa-download"></i> Unduh PDF
            </button>
          </div>
        `,
        confirmButtonText: 'Tutup',
        background: '#0a192f',
        color: '#fff',
        confirmButtonColor: '#3b82f6'
      });
    } else {
      Swal.fire({
        title: 'Bukti Pengerjaan',
        imageUrl: processedUrl,
        imageAlt: 'Foto Bukti',
        html: isGDrive ? `
          <div style="margin-top: 15px;">
            <a href="${url}" target="_blank" style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; background: rgba(59, 130, 246, 0.1); border: 1px solid #3b82f6; color: #60a5fa; border-radius: 12px; font-size: 11px; font-weight: 700; text-decoration: none; transition: all 0.3s ease; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15)">
              <i class="fas fa-external-link-alt"></i> Buka di Google Drive
            </a>
          </div>
        ` : '',
        confirmButtonText: 'Tutup',
        background: '#0a192f',
        color: '#fff',
        confirmButtonColor: '#3b82f6'
      });
    }
  };

  function initSuperadminTugasScoping() {
    const isSA = typeof _isSuperAdmin === 'function' && _isSuperAdmin();
    const sec = $('tugasInstansiSection');
    if (!sec) return;

    if (isSA) {
      sec.style.display = 'block';
      const el = $('tugasInstansiSelect');
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
            console.error('[Tugas Superadmin] populate error:', e);
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

  function onTugasInstansiChange() {
    const el = $('tugasInstansiSelect');
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
    if (typeof applyInstansiBranding === 'function') applyInstansiBranding(val);
    if (window.userProfile) {
      window.userProfile.instansi_id = val;
    }

    // Sync other superadmin dropdowns to match
    const adminSelect = $('adminInstansiSelect');
    if (adminSelect) adminSelect.value = val;
    const rekapSelect = $('rekapInstansiSelect');
    if (rekapSelect) rekapSelect.value = val;
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
    
    // Reload dynamic employee list for tugas
    loadTugasPegawai();
    
    // Reload tugas list / monitoring for this instansi
    loadMyAssignments();
    loadMonitoringTasks();
  }

  function initSuperadminLemburScoping() {
    const isSA = typeof _isSuperAdmin === 'function' && _isSuperAdmin();
    const sec = $('lemburInstansiSection');
    if (!sec) return;

    if (isSA) {
      sec.style.display = 'block';
      const el = $('lemburInstansiSelect');
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
            console.error('[Lembur Superadmin] populate error:', e);
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

  function onLemburInstansiChange() {
    const el = $('lemburInstansiSelect');
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
    if (typeof applyInstansiBranding === 'function') applyInstansiBranding(val);
    if (window.userProfile) {
      window.userProfile.instansi_id = val;
    }

    // Sync other superadmin dropdowns to match
    const adminSelect = $('adminInstansiSelect');
    if (adminSelect) adminSelect.value = val;
    const rekapSelect = $('rekapInstansiSelect');
    if (rekapSelect) rekapSelect.value = val;
    const tugasSelect = $('tugasInstansiSelect');
    if (tugasSelect) tugasSelect.value = val;
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
    
    // Invalidate caches & selected employees
    _allPegawaiLembur = [];
    _selectedLemburPegawai = [];
    renderLemburPills();
    
    // Reload dynamic employee list for Overtime (Lembur)
    loadLemburPegawai();
    loadLemburArchive();
  }

  /* ════ FITUR ARSIP REKAP LEMBUR ════ */
  
  async function loadLemburArchive() {
    const sectionEl = $('lemburArchiveSection');
    if (!sectionEl) return;

    sectionEl.innerHTML = `
      <div style="font-size:12px; font-weight:800; color:var(--white); margin-bottom:10px; display:flex; align-items:center; gap:6px;">
        📂 ARSIP REKAP LEMBUR
      </div>
      <div class="shimmer-wrapper">
        <div class="shimmer sh-line" style="width:100%; height:80px; border-radius:15px; margin-bottom:10px"></div>
      </div>
    `;

    try {
      const instansiId = getScopedInstansiId() || '';
      const res = await apiGet(`${P.lemburArchiveList}?instansi_id=${instansiId}`);
      if (!res.ok) {
        throw new Error(getApiErrorMsg(res.data, 'Gagal memuat arsip.'));
      }
      const list = parseApiResponse(res.data) || [];
      renderLemburArchive(list);
    } catch (e) {
      console.error('[LemburArchive] load error:', e);
      sectionEl.innerHTML = `
        <div style="font-size:12px; font-weight:800; color:var(--white); margin-bottom:10px;">
          📂 ARSIP REKAP LEMBUR
        </div>
        <div class="empty-state" style="padding:15px; text-align:center; font-size:11px; color:var(--muted)">
          ⚠️ Gagal memuat arsip dari server.<br>
          <span style="font-size:9px">Pastikan webhook lembur-archive-list aktif.</span>
        </div>
      `;
    }
  }

  function renderLemburArchive(list) {
    const sectionEl = $('lemburArchiveSection');
    if (!sectionEl) return;

    if (list.length === 0) {
      sectionEl.innerHTML = `
        <div style="font-size:12px; font-weight:800; color:var(--white); margin-bottom:10px;">
          📂 ARSIP REKAP LEMBUR
        </div>
        <div class="card glass-card" style="padding:20px; text-align:center; color:var(--muted); font-size:12px">
          📭 Belum ada rekap lembur yang diarsipkan.
        </div>
      `;
      return;
    }

    const header = `
      <div style="font-size:12px; font-weight:800; color:var(--white); margin-bottom:12px;">
        📂 ARSIP REKAP LEMBUR (${list.length})
      </div>
    `;

    const items = list.map(item => {
      let dateStr = '—';
      if (item.created_at) {
        try {
          const d = new Date(item.created_at);
          dateStr = d.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
        } catch (e) {}
      }

      const title = item.judul || `Rekap Lembur: ${item.tanggal_dari} s/d ${item.tanggal_sampai}`;
      const nomorSurat = item.nomor_surat ? `No. Surat: ${item.nomor_surat}` : 'Tanpa Nomor Surat';
      const countPegawai = (item.pegawai_names || '').split(',').filter(Boolean).length;
      const pegawaiSnippet = (item.pegawai_names || '').split(',').slice(0, 3).join(', ') + 
        (countPegawai > 3 ? ` dan ${countPegawai - 3} lainnya` : '');

      return `
        <div class="card glass-card" style="margin-bottom:12px; padding:15px; border-left:4px solid var(--gold); display:flex; justify-content:space-between; align-items:center;">
          <div style="flex:1; min-width:0; padding-right:12px; cursor:pointer;" onclick="viewLemburArchive(${item.id})">
            <div style="font-size:13px; font-weight:800; color:var(--white); margin-bottom:2px;">
              📂 ${title}
            </div>
            <div style="font-size:11px; color:var(--gold); font-weight:700; margin-bottom:4px;">
              ${nomorSurat}
            </div>
            <div style="font-size:10px; color:var(--muted); margin-bottom:4px;">
              Pegawai: ${pegawaiSnippet}
            </div>
            <div style="font-size:9px; color:var(--muted);">
              Periode: ${item.tanggal_dari} s/d ${item.tanggal_sampai} | Diarsipkan: ${dateStr} oleh ${item.saved_by_nama || 'Admin'}
            </div>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn-sm-admin" onclick="viewLemburArchive(${item.id})" style="background:var(--primary); color:white; border:none; padding:6px 10px; border-radius:6px; font-size:10px; cursor:pointer; font-weight:700;">
              👁️ Lihat
            </button>
            <button class="btn-sm-admin" onclick="deleteLemburArchive(${item.id}, '${title.replace(/'/g, "\\'")}')" style="background:#ef4444; color:white; border:none; padding:6px 10px; border-radius:6px; font-size:10px; cursor:pointer; font-weight:700;">
              🗑️ Hapus
            </button>
          </div>
        </div>
      `;
    }).join('');

    sectionEl.innerHTML = header + items;
  }

  window.handleSaveLemburRekap = async function() {
    const data = window._currentLemburData;
    const range = window._currentLemburRange;
    if (!data || data.length === 0) {
      Swal.fire('⚠️ Peringatan', 'Tidak ada data lembur untuk disimpan.', 'warning');
      return;
    }

    // Ask user for Nomor Surat
    const { value: nomorSurat } = await Swal.fire({
      title: 'Simpan Rekap Lembur',
      input: 'text',
      inputLabel: 'Masukkan Nomor Surat Lembur',
      inputPlaceholder: 'Contoh: 800/123/BAP-SB/2026...',
      showCancelButton: true,
      confirmButtonText: '💾 Simpan',
      cancelButtonText: 'Batal',
      inputValidator: (value) => {
        if (!value.trim()) {
          return 'Nomor surat harus diisi!';
        }
      }
    });

    if (!nomorSurat) return; // User cancelled

    // Show loading
    Swal.fire({
      title: 'Menyimpan...',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    try {
      const p = window.userProfile || {};
      const myNip = p.nip || localStorage.getItem('MY_NIP') || '';
      const myNama = p.nama || localStorage.getItem('MY_NAME') || 'Admin';
      const instansiId = getScopedInstansiId() || '';
      const dalamRangka = ($('lemburDalamRangka')?.value || '').trim();

      const payload = {
        judul: dalamRangka || `Dalam Rangka Lembur ${range.dari} s/d ${range.sampai}`,
        nomor_surat: nomorSurat.trim(),
        tanggal_dari: range.dari,
        tanggal_sampai: range.sampai,
        tanggal_list: range.dates || [],
        pegawai_nips: [...new Set(data.map(r => r.nip))].join(','),
        pegawai_names: [...new Set(data.map(r => r.nama))].join(','),
        data_json: data,
        instansi_id: instansiId,
        saved_by_nip: myNip,
        saved_by_nama: myNama
      };

      const res = await apiPost(P.lemburSave, payload);
      if (!res.ok) {
        throw new Error(getApiErrorMsg(res.data, 'Gagal menyimpan ke database.'));
      }

      Swal.fire('✅ Berhasil', 'Rekap lembur berhasil diarsipkan!', 'success');
      
      // Reload archive list
      loadLemburArchive();
    } catch (e) {
      console.error('[LemburSave] error:', e);
      Swal.fire('❌ Gagal', e.message || 'Gagal menghubungi server.', 'error');
    }
  };

  window.viewLemburArchive = async function(id) {
    Swal.fire({
      title: 'Memuat data...',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    try {
      const res = await apiGet(`${P.lemburArchiveList}?id=${id}`);
      if (!res.ok) {
        throw new Error(getApiErrorMsg(res.data, 'Gagal memuat detail arsip.'));
      }

      const rows = parseApiResponse(res.data) || [];
      if (rows.length === 0) {
        throw new Error('Arsip tidak ditemukan.');
      }

      const archive = rows[0];
      
      // Store globally for PDF generation
      window._currentLemburData = archive.data_json;
      window._currentLemburRange = {
        dari: archive.tanggal_dari,
        sampai: archive.tanggal_sampai,
        dates: archive.tanggal_list || [],
        judul: archive.judul,
        nomor_surat: archive.nomor_surat
      };
      
      // Set the viewing archive state
      window._currentLemburArchiveId = archive.id;

      // Close loading dialog
      Swal.close();

      // Render the results into the UI
      renderLemburResults(archive.data_json);

      // Scroll to result section
      const listEl = $('lemburResultList');
      if (listEl) {
        listEl.scrollIntoView({ behavior: 'smooth' });
      }
    } catch (e) {
      console.error('[LemburArchiveView] error:', e);
      Swal.fire('❌ Gagal', e.message || 'Gagal memuat detail arsip.', 'error');
    }
  };

  window.exitLemburArchivePreview = function() {
    window._currentLemburArchiveId = null;
    window._currentLemburData = null;
    window._currentLemburRange = null;
    const listEl = $('lemburResultList');
    if (listEl) listEl.innerHTML = '';
  };

  window.deleteLemburArchive = async function(id, title) {
    const confirm = await Swal.fire({
      title: 'Hapus Arsip?',
      text: `Apakah Anda yakin ingin menghapus arsip "${title}"? Tindakan ini tidak dapat dibatalkan.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: '🗑️ Hapus',
      cancelButtonText: 'Batal'
    });

    if (!confirm.isConfirmed) return;

    Swal.fire({
      title: 'Menghapus...',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    try {
      const res = await apiPost(P.lemburArchiveDelete, { id });
      if (!res.ok) {
        throw new Error(getApiErrorMsg(res.data, 'Gagal menghapus arsip.'));
      }

      Swal.fire('✅ Terhapus', 'Arsip rekap lembur berhasil dihapus.', 'success');
      
      // If we are currently previewing the deleted archive, exit preview
      if (window._currentLemburArchiveId === id) {
        exitLemburArchivePreview();
      }
      
      // Reload archive list
      loadLemburArchive();
    } catch (e) {
      console.error('[LemburArchiveDelete] error:', e);
      Swal.fire('❌ Gagal', e.message || 'Gagal menghubungi server.', 'error');
    }
  };

  window.initSuperadminTugasScoping = initSuperadminTugasScoping;
  window.onTugasInstansiChange = onTugasInstansiChange;
  window.initSuperadminLemburScoping = initSuperadminLemburScoping;
  window.onLemburInstansiChange = onLemburInstansiChange;
  window.checkTugasLemburAccess = checkTugasLemburAccess;
  window.loadMonitoringTasks = loadMonitoringTasks;
  window.loadLemburArchive = loadLemburArchive;
  window.renderLemburArchive = renderLemburArchive;
  window.exitLemburArchivePreview = exitLemburArchivePreview;
})();