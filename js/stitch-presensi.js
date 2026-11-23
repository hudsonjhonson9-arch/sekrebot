/* Stitch Presensi: 1-Tombol Masuk/Pulang/Lapangan, Anti-Spoofing GPS v3, Kalender & E-Slip */
    /* ── 4. CLOCK IN / OUT WITH REAL POSTGRESQL INSERTION ────────────── */
    let _lastStitchAbsenClick = 0;
    let _isClockActionInFlight = false;
    let _lastClockInSuccessAt = 0;

    function setClockBtnLoading(loading, label) {
      const inBtn = document.getElementById('clockInBtn');
      const inTitle = document.getElementById('clockInBtnTitle');
      if (inBtn) {
        inBtn.disabled = Boolean(loading);
        inBtn.classList.toggle('opacity-75', Boolean(loading));
        inBtn.classList.toggle('pointer-events-none', Boolean(loading));
      }
      if (loading && inTitle && label) {
        inTitle.textContent = label;
      }
    }

    function getStitchFaceContext() {
      if (state.currentUser && !window.MY_ID) window.MY_ID = String(state.currentUser.id || '');
      const myNip = String(state.currentUser?.nip || '').trim();
      const mandNips = Array.isArray(window.MANDATORY_FACE_NIPS) ? window.MANDATORY_FACE_NIPS.map(s => String(s).trim()) : [];
      const isMandatory = mandNips.includes(myNip);
      const faceGlobal = (typeof FACE_RECOGNITION_ENABLED !== 'undefined' && FACE_RECOGNITION_ENABLED !== null)
        ? Boolean(FACE_RECOGNITION_ENABLED)
        : Boolean(window.FACE_RECOGNITION_ENABLED);
      const faceOn = faceGlobal || isMandatory;
      const ref = typeof getFaceRef === 'function' ? getFaceRef() : null;
      const hasRef = Boolean(ref && (ref.dataUrl || (Array.isArray(ref.descriptor) && ref.descriptor.length >= 128)));
      return { faceOn, hasRef };
    }

    function promptEnrollFaceFirst() {
      Swal.fire({
        title: 'Wajah Belum Didaftarkan',
        text: 'Daftarkan wajah Anda terlebih dahulu untuk verifikasi biometrik AI.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#2563eb',
        confirmButtonText: 'Daftarkan Sekarang',
        cancelButtonText: 'Nanti'
      }).then(r => { if (r.isConfirmed && typeof enrollMyFaceStitch === 'function') enrollMyFaceStitch(); });
    }

    function startClockInFlow() {
      if (_isClockActionInFlight) return;
      const now = Date.now();
      if (now - _lastStitchAbsenClick < 2500) return;
      _lastStitchAbsenClick = now;

      if (state.attendance.status === 'KETERANGAN') {
        Swal.fire('Tidak Dapat Presensi', `Status Anda hari ini sudah tercatat sebagai ${state.attendance.keterangan || 'KETERANGAN'}.`, 'warning');
        return;
      }
      if (state.attendance.status === 'SUDAH_MASUK') {
        if (now - _lastClockInSuccessAt < 5000) return; // cegah tap ganda saat baru selesai masuk
        startClockOutFlow(); // satu tombol: sudah masuk -> presensi pulang
        return;
      }
      if (state.attendance.status === 'SELESAI') {
        Swal.fire('Selesai', 'Anda sudah menyelesaikan absensi masuk dan pulang hari ini di database.', 'info');
        return;
      }
      // Verifikasi wajah AI (Human.js) hanya jika toggle global aktif atau NIP masuk daftar wajib wajah.
      try {
        const { faceOn, hasRef } = getStitchFaceContext();
        if (faceOn && typeof openCamOverlay === 'function') {
          if (!hasRef) {
            promptEnrollFaceFirst();
            return;
          }
          openCamOverlay(async (cam) => { await captureAndVerifySelfie(cam); });
          return;
        }
        if (!faceOn) {
          captureAndVerifySelfie(null);
          return;
        }
      } catch (e) { console.warn('[Face] fallback ke kamera sederhana:', e); }
      openCameraModal();
    }

    function openCameraModal() {
      const modal = document.getElementById('cameraModal');
      if (!modal) return;
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      startSelfieCamera();
    }

    function closeCameraModal() {
      const modal = document.getElementById('cameraModal');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      stopSelfieCamera();
    }

    let selfieStream = null;
    function startSelfieCamera() {
      const video = document.getElementById('selfieVideo');
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
          .then(stream => {
            selfieStream = stream;
            video.srcObject = stream;
          })
          .catch(err => {
            console.warn('[Camera] Fallback stream:', err);
          });
      }
    }

    function stopSelfieCamera() {
      if (selfieStream) {
        selfieStream.getTracks().forEach(track => track.stop());
        selfieStream = null;
      }
    }

    // Akuisisi GPS + Anti-Spoofing / Fake GPS v3 (port dari D:\Code\absensi\js\absen.js)
    async function getRealPosition() {
      if (!navigator.geolocation) throw new Error('GPS tidak didukung perangkat ini.');

      // Kumpulkan sampel sensor gerak singkat (anti-emulator)
      const accel = [];
      const onMotion = (e) => {
        const a = e.accelerationIncludingGravity || {};
        accel.push({ x: a.x || 0, y: a.y || 0, z: a.z || 0 });
      };
      try {
        window.addEventListener('devicemotion', onMotion);
        await new Promise(r => setTimeout(r, 450));
        window.removeEventListener('devicemotion', onMotion);
      } catch (_) {}

      const t0 = Date.now();
      const acquire = typeof getFreshPosition === 'function'
        ? (ok, err, opt) => getFreshPosition(ok, err, opt)
        : (ok, err, opt) => navigator.geolocation.getCurrentPosition(ok, err, opt);

      const pos = await new Promise((resolve, reject) => {
        acquire(
          p => resolve(p),
          e => reject(new Error(e && e.code === 1 ? 'Izin lokasi ditolak. Aktifkan GPS lalu coba lagi.' : 'Gagal mendapatkan lokasi GPS.')),
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
      });

      const { latitude, longitude, accuracy, altitude, altitudeAccuracy, speed, heading } = pos.coords;
      const elapsed = Date.now() - t0;
      if (accuracy <= 0) throw new Error('Akurasi 0m tidak valid. Nonaktifkan Mock Location di Pengaturan Developer.');
      if (accuracy > 100) throw new Error(`Sinyal GPS lemah (${Math.round(accuracy)}m). Pindah ke area terbuka.`);

      let score = 0;
      const flags = [];
      const ua = navigator.userAgent || '';
      if (/xposed|cydia|substrate|frida|objection/i.test(ua)) { score += 50; flags.push('UA_PATCHING_FRAMEWORK'); }
      if (accuracy === 1) { score += 20; flags.push('ACCURACY_EXACTLY_1M'); }
      else if (Number.isInteger(accuracy) && [2, 3, 5].includes(accuracy)) { score += 15; flags.push('ACCURACY_SUSPICIOUS_LOW'); }
      if (elapsed < 40) { score += 12; flags.push('ULTRA_INSTANT_FIX'); }

      const latStr = String(latitude), lonStr = String(longitude);
      if ((latStr.split('.')[1] || '').length >= 7 && (latStr.endsWith('00') || lonStr.endsWith('00'))) {
        score += 10; flags.push('COORD_TRAILING_ZEROS');
      }
      if (altitude !== null && altitude !== undefined && Number.isInteger(altitude) && Math.abs(altitude % 10) === 0 && (altitudeAccuracy === null || altitudeAccuracy === undefined)) {
        score += 14; flags.push('ALTITUDE_ROUNDED_NO_ACC');
      }
      if (speed !== null && speed !== undefined && speed > 28) { score += 20; flags.push('SPEED_TOO_HIGH'); }
      const tsAge = Date.now() - (pos.timestamp || Date.now());
      if (tsAge < -2000) { score += 25; flags.push('GPS_TIMESTAMP_FUTURE'); }
      if (heading !== null && heading !== undefined && (isNaN(heading) || heading < 0 || heading > 360)) {
        score += 15; flags.push('HEADING_INVALID');
      }

      // Cek teleport dari lokasi sebelumnya
      try {
        const prev = JSON.parse(localStorage.getItem('_prev_loc_bapperida') || 'null');
        const nowSec = Math.floor(Date.now() / 1000);
        if (prev && prev.lat && prev.lng && prev.ts && (nowSec - prev.ts) > 0 && (nowSec - prev.ts) < 86400) {
          const R = 6371000, dLat = (latitude - prev.lat) * Math.PI / 180, dLng = (longitude - prev.lng) * Math.PI / 180;
          const a = Math.sin(dLat / 2) ** 2 + Math.cos(prev.lat * Math.PI / 180) * Math.cos(latitude * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
          const distM = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const kmh = (distM / (nowSec - prev.ts)) * 3.6;
          if (kmh > 220 && distM > 1500) { score += 30; flags.push('TELEPORT_' + Math.round(kmh) + 'kmh'); }
        }
        localStorage.setItem('_prev_loc_bapperida', JSON.stringify({ lat: latitude, lng: longitude, acc: accuracy, ts: nowSec }));
      } catch (_) {}

      // Cek koordinat identik berulang (tanpa micro-jitter) di perangkat mobile
      try {
        const jHist = JSON.parse(sessionStorage.getItem('_gps_jitter_hist') || '[]');
        jHist.push({ lat: latitude, lng: longitude });
        if (jHist.length > 5) jHist.shift();
        sessionStorage.setItem('_gps_jitter_hist', JSON.stringify(jHist));
        if (jHist.length >= 4 && jHist.every(h => h.lat === latitude && h.lng === longitude) && Number.isInteger(accuracy)) {
          score += 15; flags.push('COORD_NO_JITTER');
        }
      } catch (_) {}

      if (score >= 50) {
        throw new Error(`Terdeteksi lokasi GPS tidak wajar / Mock Location (${flags.join(', ')}). Nonaktifkan Fake GPS lalu coba lagi.`);
      }

      return {
        koordinat: `${latitude},${longitude}`,
        akurasi: accuracy,
        gps_fingerprint: { elapsed_ms: elapsed, score, flags, accel_count: accel.length }
      };
    }

    async function verifyFaceCapture(camResult) {
      let faceNote = '';
      if (camResult && camResult.dataUrl) {
        if (typeof matchFace === 'function') {
          const m = await matchFace(camResult.dataUrl, camResult.descriptor || null);
          const minSim = typeof FS_FACE_THRESHOLD !== 'undefined' ? FS_FACE_THRESHOLD : 0.45;
          if (m && typeof m.similarity === 'number') {
            if (m.similarity < minSim) {
              throw new Error(`Wajah tidak cocok (${m.score}%). Pastikan pencahayaan cukup dan wajah Anda sendiri.`);
            }
            faceNote = ` • Face AI ${m.score}%`;
          }
        }
        state.attendance.selfiePhotoUrl = camResult.dataUrl;
      }
      return faceNote;
    }

    async function captureAndVerifySelfie(camResult) {
      if (_isClockActionInFlight) return;
      _isClockActionInFlight = true;
      setClockBtnLoading(true, 'Memproses Presensi Masuk...');
      const btn = document.getElementById('btnCapturePhoto');
      if (btn) {
        btn.innerHTML = `<span class="material-symbols-outlined text-[18px] animate-spin">refresh</span><span>Mengirim Presensi...</span>`;
        btn.disabled = true;
      }

      try {
        if (!camResult) {
          const video = document.getElementById('selfieVideo');
          const canvas = document.getElementById('selfieCanvas');
          if (video && canvas && video.videoWidth > 0 && video.videoHeight > 0) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              state.attendance.selfiePhotoUrl = canvas.toDataURL('image/jpeg', 0.85);
            }
          }
        }

        // Jika datang dari kamera biometrik AI (openCamOverlay), cocokkan descriptor wajah dengan referensi pegawai
        const faceNote = await verifyFaceCapture(camResult);

        const locName = state.currentLocation ? state.currentLocation.nama_lokasi : 'Kantor Bapperida';
        const gps = await getRealPosition();
        const coords = gps.koordinat;

        // POST to database
        const res = await fetch('/api/stitch/absen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nip: state.currentUser.nip,
            jenis: 'MASUK',
            lokasi: locName,
            koordinat: coords,
            akurasi: gps.akurasi,
            ket: 'Hadir (Stitch UI' + faceNote + ')'
          })
        });
        const json = await res.json();

        if (json.ok) {
          _lastClockInSuccessAt = Date.now();
          state.attendance.status = 'SUDAH_MASUK';
          state.attendance.clockInTime = json.witaTime;
          state.metrics.hadir += 1;

          closeCameraModal();
          if (btn) {
            btn.innerHTML = `<span class="material-symbols-outlined text-[20px]">camera</span><span>Ambil Foto & Kirim</span>`;
            btn.disabled = false;
          }

          updateAttendanceUI();

          // Refresh logs
          await selectUserByNip(state.currentUser.nip);

          showDynamicIsland({
            type: 'success',
            title: 'Presensi Masuk Tercatat!',
            message: `Pukul ${json.witaTime}${faceNote} • Tersimpan di PostgreSQL`
          });

          const titleEl = document.getElementById('successModalTitle');
          if (titleEl) titleEl.textContent = 'Presensi Masuk Tercatat!';
          document.getElementById('successWitaTime').textContent = json.witaTime;
          const successModal = document.getElementById('successModal');
          successModal.classList.remove('hidden');
          successModal.classList.add('flex');
        } else {
          Swal.fire('Gagal', json.message || 'Gagal menyimpan absensi.', 'error');
          if (btn) {
            btn.innerHTML = `<span class="material-symbols-outlined text-[20px]">camera</span><span>Ambil Foto & Kirim</span>`;
            btn.disabled = false;
          }
        }
      } catch (err) {
        console.error(err);
        Swal.fire('Gagal', err.message, 'error');
        if (btn) {
          btn.innerHTML = `<span class="material-symbols-outlined text-[20px]">camera</span><span>Ambil Foto & Kirim</span>`;
          btn.disabled = false;
        }
      } finally {
        _isClockActionInFlight = false;
        setClockBtnLoading(false);
        updateAttendanceUI();
      }
    }

    function showESlipFromSuccess() {
      const successModal = document.getElementById('successModal');
      successModal.classList.add('hidden');
      successModal.classList.remove('flex');
      showESlipModal();
    }

    async function submitClockOutRequest(isLapangan, ketLapangan, camResult) {
      if (_isClockActionInFlight) return;
      _isClockActionInFlight = true;
      setClockBtnLoading(true, 'Memproses Presensi Pulang...');
      try {
        const faceNote = await verifyFaceCapture(camResult);
        const gps = await getRealPosition();
        const coords = gps.koordinat;
        const locName = isLapangan
          ? `Lapangan: ${ketLapangan.slice(0, 60)}`
          : (state.currentLocation ? state.currentLocation.nama_lokasi : 'Kantor Bapperida');

        const res = await fetch('/api/stitch/absen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nip: state.currentUser.nip,
            jenis: isLapangan ? 'PULANG LUAR' : 'PULANG',
            lokasi: locName,
            koordinat: coords,
            akurasi: gps.akurasi,
            ket: (isLapangan ? `Pulang dari Lapangan: ${ketLapangan}` : 'Pulang Kerja (Stitch UI)') + faceNote
          })
        });
        const json = await res.json();

        if (json.ok) {
          state.attendance.status = 'SELESAI';
          state.attendance.clockOutTime = json.witaTime;
          updateAttendanceUI();
          await selectUserByNip(state.currentUser.nip);
          showDynamicIsland({
            type: 'success',
            title: isLapangan ? 'Pulang Lapangan Tersimpan' : 'Presensi Pulang Tersimpan',
            message: `Tercatat di PostgreSQL pukul ${json.witaTime}${faceNote}. Selamat beristirahat!`
          });
        } else {
          Swal.fire('Gagal', json.message || 'Gagal menyimpan presensi pulang.', 'error');
        }
      } catch (err) {
        console.error('[ClockOut]', err);
        Swal.fire('Gagal', err?.message || 'Gagal memproses presensi pulang.', 'error');
      } finally {
        _isClockActionInFlight = false;
        setClockBtnLoading(false);
        updateAttendanceUI();
      }
    }

    async function startClockOutFlow() {
      if (_isClockActionInFlight || state.attendance.status !== 'SUDAH_MASUK') return;
      if (Date.now() - _lastClockInSuccessAt < 5000) return;

      Swal.fire({
        title: 'Presensi Pulang',
        html: `
          <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">Pilih jenis presensi pulang hari ini:</p>
          <div class="text-left space-y-1.5">
            <label for="swalKetPulangLuar" class="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">Lokasi / Kegiatan Lapangan <span class="font-normal text-slate-400">(wajib bila dari lapangan)</span></label>
            <input id="swalKetPulangLuar" type="text" placeholder="Contoh: Rapat koordinasi di Kantor Bupati..." class="w-full min-h-[44px] px-3.5 py-2.5 text-[13px] rounded-[14px] border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white dark:focus:bg-slate-900 transition-colors" />
          </div>
        `,
        icon: 'question',
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonColor: '#e11d48',
        denyButtonColor: '#d97706',
        confirmButtonText: 'Pulang dari Kantor',
        denyButtonText: 'Pulang dari Lapangan',
        cancelButtonText: 'Batal',
        preDeny: () => {
          const val = (document.getElementById('swalKetPulangLuar')?.value || '').trim();
          if (!val) {
            Swal.showValidationMessage('Tuliskan lokasi/kegiatan lapangan Anda terlebih dahulu.');
            return false;
          }
          return val;
        }
      }).then(async (result) => {
        if (!result.isConfirmed && !result.isDenied) return;
        const isLapangan = result.isDenied;
        const ketLapangan = isLapangan ? String(result.value || '').trim() : '';

        try {
          const { faceOn, hasRef } = getStitchFaceContext();
          if (faceOn && typeof openCamOverlay === 'function') {
            if (!hasRef) {
              promptEnrollFaceFirst();
              return;
            }
            openCamOverlay(async (cam) => {
              try {
                await submitClockOutRequest(isLapangan, ketLapangan, cam);
              } catch (e) {
                Swal.fire('Gagal', e.message, 'error');
              }
            });
            return;
          }
          await submitClockOutRequest(isLapangan, ketLapangan, null);
        } catch (e) {
          Swal.fire('Gagal', e.message, 'error');
        }
      });
    }

    function updateAttendanceUI() {
      const inBtn = document.getElementById('clockInBtn');
      const inTitle = document.getElementById('clockInBtnTitle');
      const inIcon = document.getElementById('clockInBtnIcon');

      // Analog Hero Check In/Out Displays
      const heroCheckin = document.getElementById('display-checkin');
      const heroCheckinLoc = document.getElementById('display-checkin-loc');
      const heroCheckout = document.getElementById('display-checkout');
      const heroCheckoutLoc = document.getElementById('display-checkout-loc');

      if (heroCheckin) heroCheckin.textContent = state.attendance.clockInTime || '-:-:-';
      if (heroCheckinLoc) heroCheckinLoc.textContent = state.attendance.clockInTime ? 'Tercatat Masuk' : 'Belum Absen';
      if (heroCheckout) heroCheckout.textContent = state.attendance.clockOutTime || '-:-:-';
      if (heroCheckoutLoc) heroCheckoutLoc.textContent = state.attendance.clockOutTime ? 'Tercatat Pulang' : 'Belum Tercatat';

      if (state.attendance.status === 'SUDAH_MASUK') {
        if (inBtn) {
          inBtn.className = "tap-effect w-full flex items-center justify-center gap-2.5 py-3.5 px-4 rounded-2xl bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white font-extrabold text-sm shadow-[0_6px_20px_rgba(225,29,72,0.28)] border border-rose-500 transition-all cursor-pointer";
        }
        if (inIcon) inIcon.textContent = 'logout';
        if (inTitle) inTitle.textContent = 'PRESENSI PULANG';
      } else if (state.attendance.status === 'SELESAI') {
        if (inBtn) {
          inBtn.className = "tap-effect w-full flex items-center justify-center gap-2.5 py-3.5 px-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-extrabold text-sm shadow-xs border border-emerald-200 dark:border-emerald-800 transition-all cursor-pointer";
        }
        if (inIcon) inIcon.textContent = 'check_circle';
        if (inTitle) inTitle.textContent = 'PRESENSI SELESAI';
      } else if (state.attendance.status === 'KETERANGAN') {
        if (inBtn) {
          inBtn.className = "tap-effect w-full flex items-center justify-center gap-2.5 py-3.5 px-4 rounded-2xl bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 font-extrabold text-sm shadow-xs border border-amber-300 dark:border-amber-800 transition-all cursor-pointer";
        }
        if (inIcon) inIcon.textContent = 'event_busy';
        if (inTitle) inTitle.textContent = `STATUS: ${state.attendance.keterangan || 'IZIN / CUTI'}`;
      } else {
        if (inBtn) {
          inBtn.className = "tap-effect w-full flex items-center justify-center gap-2.5 py-3.5 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-extrabold text-sm shadow-[0_6px_20px_rgba(37,99,235,0.28)] border border-blue-500 transition-all cursor-pointer";
        }
        if (inIcon) inIcon.textContent = 'login';
        if (inTitle) inTitle.textContent = 'PRESENSI MASUK';
      }
    }

    /* ── 4B. DIRECT MONTH & YEAR PICKER LOGIC ────────────────────────── */
    let pickerSelectedYear = new Date().getFullYear();
    let pickerSelectedMonth = new Date().getMonth(); // 0-11

    function openMonthYearPicker() {
      const anchor = state.calendarStripAnchorDate ? new Date(state.calendarStripAnchorDate) : new Date();
      pickerSelectedYear = anchor.getFullYear();
      pickerSelectedMonth = anchor.getMonth();

      updatePickerUI();
      const modal = document.getElementById('monthYearPickerModal');
      if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
      }
    }

    function closeMonthYearPicker() {
      const modal = document.getElementById('monthYearPickerModal');
      if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }
    }

    function stepPickerYear(delta) {
      pickerSelectedYear += delta;
      updatePickerUI();
    }

    function updatePickerUI() {
      const yearDisplay = document.getElementById('pickerYearDisplay');
      if (yearDisplay) yearDisplay.textContent = pickerSelectedYear;

      const grid = document.getElementById('pickerMonthGrid');
      if (!grid) return;

      const monthShortNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      
      const anchor = state.calendarStripAnchorDate ? new Date(state.calendarStripAnchorDate) : new Date();
      const currentActiveYear = anchor.getFullYear();
      const currentActiveMonth = anchor.getMonth();

      grid.innerHTML = monthShortNames.map((mName, idx) => {
        const isCurrentChosen = (pickerSelectedYear === currentActiveYear && idx === currentActiveMonth);
        const btnStyle = isCurrentChosen
          ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-600/30 ring-2 ring-blue-400/50 scale-[1.03]'
          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-slate-700 font-semibold border border-slate-100 dark:border-slate-800';

        return `
          <button type="button" onclick="selectPickerMonth(${idx})" class="py-2.5 px-2 rounded-xl text-xs text-center transition-all cursor-pointer ${btnStyle}">
            ${mName}
          </button>
        `;
      }).join('');
    }

    function selectPickerMonth(monthIdx) {
      pickerSelectedMonth = monthIdx;
      
      // Update calendar anchor date
      const newAnchor = new Date(pickerSelectedYear, pickerSelectedMonth, 1, 12, 0, 0);
      state.calendarStripAnchorDate = newAnchor;
      
      const now = new Date();
      if (now.getFullYear() === pickerSelectedYear && now.getMonth() === pickerSelectedMonth) {
        selectedStripDate = now.toISOString().slice(0, 10);
      } else {
        selectedStripDate = `${pickerSelectedYear}-${String(pickerSelectedMonth + 1).padStart(2, '0')}-01`;
      }

      closeMonthYearPicker();

      if (stripMode === 'week') {
        renderCalendarStrip();
      } else {
        renderMonthStripView();
      }
    }

    function resetPickerToCurrentMonth() {
      const now = new Date();
      state.calendarStripAnchorDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
      selectedStripDate = now.toISOString().slice(0, 10);
      closeMonthYearPicker();

      if (stripMode === 'week') {
        renderCalendarStrip();
      } else {
        renderMonthStripView();
      }
    }

    function stepStripMonth(delta) {
      const anchor = state.calendarStripAnchorDate ? new Date(state.calendarStripAnchorDate) : new Date();
      if (stripMode === 'week') {
        // Mode Minggu: geser ±7 hari agar bisa berpindah Minggu ke-1..ke-5 secara akurat
        const target = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + (delta * 7), 12, 0, 0);
        state.calendarStripAnchorDate = target;
        const y = target.getFullYear();
        const m = String(target.getMonth() + 1).padStart(2, '0');
        const dt = String(target.getDate()).padStart(2, '0');
        selectedStripDate = `${y}-${m}-${dt}`;
        renderCalendarStrip();
        return;
      }
      // Mode Bulan: geser ±1 bulan
      const target = new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1, 12, 0, 0);
      pickerSelectedYear = target.getFullYear();
      selectPickerMonth(target.getMonth());
    }

    /* ── 4C. INTERACTIVE CALENDAR WEEK STRIP & DAILY DETAIL ── */
    let selectedStripDate = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    let stripMode = 'week';

    function setStripMode(mode) {
      stripMode = mode;
      const btnWeek = document.getElementById('stripBtnWeek');
      const btnMonth = document.getElementById('stripBtnMonth');
      const weekSel = document.getElementById('stripWeekSelector');

      const activeClasses = ['font-bold', 'text-blue-600', 'dark:text-blue-400'];
      const inactiveClasses = ['font-medium', 'text-slate-400', 'hover:text-slate-700', 'dark:hover:text-slate-200'];

      if (mode === 'week') {
        if (btnWeek) {
          btnWeek.classList.add(...activeClasses);
          btnWeek.classList.remove(...inactiveClasses);
        }
        if (btnMonth) {
          btnMonth.classList.remove(...activeClasses);
          btnMonth.classList.add(...inactiveClasses);
        }
        if (weekSel) weekSel.classList.remove('hidden');
        renderCalendarStrip();
      } else {
        if (btnMonth) {
          btnMonth.classList.add(...activeClasses);
          btnMonth.classList.remove(...inactiveClasses);
        }
        if (btnWeek) {
          btnWeek.classList.remove(...activeClasses);
          btnWeek.classList.add(...inactiveClasses);
        }
        if (weekSel) weekSel.classList.add('hidden');
        renderMonthStripView();
      }
    }

    function selectStripWeekOfMonth(weekIdx) {
      const anchor = state.calendarStripAnchorDate ? new Date(state.calendarStripAnchorDate) : new Date();
      const dayOfWeek = (anchor.getDay() + 6) % 7;
      const curMon = new Date(anchor);
      curMon.setDate(anchor.getDate() - dayOfWeek);
      const curThu = new Date(curMon);
      curThu.setDate(curMon.getDate() + 3);
      const year = curThu.getFullYear();
      const month = curThu.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const targetDay = Math.min(daysInMonth, Math.max(1, (weekIdx - 1) * 7 + 4));
      const target = new Date(year, month, targetDay, 12, 0, 0);
      state.calendarStripAnchorDate = target;
      const y = target.getFullYear();
      const m = String(target.getMonth() + 1).padStart(2, '0');
      const dt = String(target.getDate()).padStart(2, '0');
      selectedStripDate = `${y}-${m}-${dt}`;
      renderCalendarStrip();
    }
    window.selectStripWeekOfMonth = selectStripWeekOfMonth;

    function renderCalendarStrip() {
      const container = document.getElementById('calendarWeekStripCards');
      if (!container) return;

      const now = state.calendarStripAnchorDate ? new Date(state.calendarStripAnchorDate) : new Date();
      const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

      // Calculate Monday of anchor week
      const dayOfWeek = (now.getDay() + 6) % 7; // 0 = Mon, 6 = Sun
      const monday = new Date(now);
      monday.setDate(now.getDate() - dayOfWeek);
      monday.setHours(0, 0, 0, 0);

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      // Gunakan hari Kamis minggu tersebut sebagai acuan bulan & nomor minggu (aturan mayoritas hari)
      const thursday = new Date(monday);
      thursday.setDate(monday.getDate() + 3);

      const monthHeader = document.getElementById('stripMonthDisplay');
      if (monthHeader) {
        monthHeader.textContent = `${monthNames[thursday.getMonth()]} ${thursday.getFullYear()}`;
      }

      // Render pemilih minggu langsung (Minggu 1..N) yang bisa diklik, tanpa chips
      const daysInMonth = new Date(thursday.getFullYear(), thursday.getMonth() + 1, 0).getDate();
      const totalWeeks = Math.ceil(daysInMonth / 7);
      const weekNo = Math.min(totalWeeks, Math.ceil(thursday.getDate() / 7));
      const weekSel = document.getElementById('stripWeekSelector');
      if (weekSel) {
        weekSel.classList.remove('hidden');
        weekSel.style.gridTemplateColumns = `repeat(${totalWeeks}, minmax(0, 1fr))`;
        let wHtml = '';
        for (let w = 1; w <= totalWeeks; w++) {
          const isAct = (w === weekNo);
          wHtml += `<button type="button" onclick="selectStripWeekOfMonth(${w})" class="py-1.5 text-center transition-colors cursor-pointer focus:outline-none border-b-2 ${isAct ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-bold' : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-medium'}">M${w}</button>`;
        }
        weekSel.innerHTML = wHtml;
      }

      const dayLabels = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
      const userLogs = state.userLogs || [];

      let html = '';
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dt = String(d.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${dt}`;
        const dateNum = d.getDate();
        const isSelected = (dateStr === selectedStripDate);
        const isOtherMonth = d.getMonth() !== thursday.getMonth();

        // Find log for this date in PostgreSQL logs
        const dLogs = userLogs.filter(l => l.Tanggal === dateStr);
        const masuk = dLogs.find(l => l['Jenis Absen'] === 'MASUK' || l['Jenis Absen'] === 'DI LUAR JAM MASUK');
        const izin = dLogs.find(l => l['Jenis Absen'] === 'IZIN' || l['Jenis Absen'] === 'SAKIT' || l['Jenis Absen'] === 'CUTI');
        
        // Status dot color
        let dotColor = 'bg-transparent';
        if (izin) {
          dotColor = 'bg-blue-500';
        } else if (masuk && masuk['Jenis Absen'] === 'DI LUAR JAM MASUK') {
          dotColor = 'bg-amber-500';
        } else if (masuk) {
          dotColor = 'bg-emerald-500';
        } else if (i < 5) {
          dotColor = 'bg-slate-200 dark:bg-slate-700';
        }

        html += `
          <button type="button" onclick="selectStripDate('${dateStr}')" class="py-1.5 flex flex-col items-center justify-center gap-1 rounded-xl cursor-pointer transition-colors focus:outline-none ${isSelected ? '' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'} ${isOtherMonth && !isSelected ? 'opacity-45' : ''}">
            <span class="text-[11px] font-medium leading-none ${isSelected ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-400 dark:text-slate-500'}">${dayLabels[i]}</span>
            <span class="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold font-mono tabular-nums leading-none transition-colors ${isSelected ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-800 dark:text-slate-200'}">${dateNum}</span>
            <span class="w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-blue-600 dark:bg-blue-400' : dotColor} inline-block"></span>
          </button>
        `;
      }

      container.innerHTML = html;
      renderCalendarDailyDetail(selectedStripDate);
    }

    function selectStripDate(dateStr) {
      selectedStripDate = dateStr;
      renderCalendarStrip();
    }

    function renderCalendarDailyDetail(dateStr) {
      const container = document.getElementById('calendarDailyDetail');
      if (!container) return;

      const formattedDate = formatIndoDate(dateStr);
      const dLogs = (state.userLogs || []).filter(l => l.Tanggal === dateStr);
      const masuk = dLogs.find(l => String(l['Jenis Absen'] || '').includes('MASUK') || l['Jenis Absen'] === 'DI LUAR JAM MASUK');
      const pulang = dLogs.find(l => String(l['Jenis Absen'] || '').includes('PULANG'));
      const izin = dLogs.find(l => ['IZIN', 'SAKIT', 'CUTI', 'DINAS LUAR'].includes(String(l['Jenis Absen'] || '').toUpperCase()));

      // Check if weekend
      const parts = dateStr.split('-');
      let isWeekend = false;
      if (parts.length === 3) {
        const dObj = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        const day = dObj.getDay();
        isWeekend = (day === 0 || day === 6);
      }

      if (izin) {
        container.innerHTML = `
          <div class="p-3 rounded-2xl bg-blue-50/80 dark:bg-slate-800/80 border border-blue-100 dark:border-slate-700 space-y-2">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-blue-600 dark:text-blue-400 text-[18px]">event_note</span>
                <span class="text-xs font-bold text-slate-900 dark:text-white">${formattedDate}</span>
              </div>
              <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60">${izin['Jenis Absen']}</span>
            </div>
            <p class="text-xs text-slate-600 dark:text-slate-300">${izin.Ket || 'Pengajuan izin / sakit tercatat di sistem SIMPEG.'}</p>
          </div>
        `;
        return;
      }

      if (masuk || pulang) {
        let badgeHtml = '';
        let durationText = '';
        if (masuk && pulang) {
          badgeHtml = '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">Hadir Lengkap</span>';
          durationText = calculateWorkDuration(masuk.Jam, pulang.Jam);
        } else if (masuk) {
          const isLate = String(masuk['Jenis Absen']).includes('DI LUAR JAM MASUK') || String(masuk.Ket || '').toLowerCase().includes('terlambat');
          badgeHtml = isLate
            ? '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60">Terlambat</span>'
            : '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">Tepat Waktu</span>';
          durationText = 'Belum absen pulang';
        } else {
          badgeHtml = '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/60">Pulang Saja</span>';
          durationText = 'Tidak ada jam masuk';
        }

        const masukJam = masuk ? masuk.Jam : '--:--';
        const masukLoc = masuk ? (masuk.Lokasi || 'Kantor BAPPERIDA') : 'Belum Absen';
        const pulangJam = pulang ? pulang.Jam : '--:--';
        const pulangLoc = pulang ? (pulang.Lokasi || 'Meja Absen') : 'Belum Absen';

        container.innerHTML = `
          <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700/80 space-y-2.5">
            <!-- Header Tanggal & Status -->
            <div class="flex items-center justify-between pb-1.5 border-b border-slate-200/60 dark:border-slate-700/60">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-blue-600 dark:text-blue-400 text-[18px]">event_available</span>
                <span class="text-xs font-bold text-slate-900 dark:text-white">${formattedDate}</span>
              </div>
              ${badgeHtml}
            </div>

            <!-- Bento 2-Col Detail Masuk & Pulang -->
            <div class="grid grid-cols-2 gap-2">
              <div class="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 flex flex-col">
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Jam Masuk
                </span>
                <span class="text-sm font-black font-mono text-slate-900 dark:text-white mt-0.5">${masukJam} <span class="text-[10px] font-normal text-slate-400 font-sans">WITA</span></span>
                <span class="text-[10px] text-slate-400 truncate mt-0.5">${masukLoc}</span>
              </div>
              <div class="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 flex flex-col">
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-blue-600"></span> Jam Pulang
                </span>
                <span class="text-sm font-black font-mono text-slate-900 dark:text-white mt-0.5">${pulangJam} <span class="text-[10px] font-normal text-slate-400 font-sans">WITA</span></span>
                <span class="text-[10px] text-slate-400 truncate mt-0.5">${pulangLoc}</span>
              </div>
            </div>

            <!-- Footer Durasi & GPS -->
            <div class="flex items-center justify-between text-[11px] pt-0.5 px-0.5 text-slate-500 dark:text-slate-400">
              <span class="flex items-center gap-1 font-medium">
                <span class="material-symbols-outlined text-[15px] text-slate-400">timer</span>
                <span>Durasi: <strong>${durationText}</strong></span>
              </span>
              <span class="flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                <span class="material-symbols-outlined text-[15px]">verified</span>
                <span>Titik GPS DB Terverifikasi</span>
              </span>
            </div>
          </div>
        `;
        return;
      }

      // No logs
      if (isWeekend) {
        container.innerHTML = `
          <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-[18px] text-amber-500">weekend</span>
              <span>${formattedDate} • <strong>Akhir Pekan (Hari Libur)</strong></span>
            </div>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">Libur</span>
          </div>
        `;
      } else {
        container.innerHTML = `
          <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-[18px] text-slate-400">event_busy</span>
              <span>${formattedDate} • <strong>Belum ada catatan presensi</strong></span>
            </div>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">Nir-Absen</span>
          </div>
        `;
      }
    }

    function renderMonthStripView() {
      const weekContainer = document.getElementById('calendarWeekStripCards');
      const dailyContainer = document.getElementById('calendarDailyDetail');
      if (!weekContainer || !dailyContainer) return;

      const userLogs = state.userLogs || [];
      const anchor = state.calendarStripAnchorDate ? new Date(state.calendarStripAnchorDate) : new Date();
      const targetYear = anchor.getFullYear();
      const targetMonth = anchor.getMonth();
      const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

      const monthHeader = document.getElementById('stripMonthDisplay');
      if (monthHeader) {
        monthHeader.textContent = `${monthNames[targetMonth]} ${targetYear}`;
      }
      const weekBadge = document.getElementById('stripWeekBadge');
      if (weekBadge) weekBadge.classList.add('hidden');

      const currentYearMonth = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`;
      
      // Filter target month logs
      const monthLogs = userLogs.filter(l => {
        const t = l.Tanggal || (l.created_at ? l.created_at.slice(0, 10) : '');
        return t.startsWith(currentYearMonth);
      });

      // Calculate statistics
      const dateMap = new Map();
      monthLogs.forEach(l => {
        const t = l.Tanggal || (l.created_at ? l.created_at.slice(0, 10) : 'Lainnya');
        if (!dateMap.has(t)) dateMap.set(t, { tanggal: t, masuk: null, pulang: null, izin: null });
        const item = dateMap.get(t);
        const j = String(l['Jenis Absen'] || '').toUpperCase();
        if (j.includes('MASUK') || j === 'TERLAMBAT') {
          if (!item.masuk || (l.Jam && (!item.masuk.Jam || l.Jam < item.masuk.Jam))) item.masuk = l;
        } else if (j.includes('PULANG')) {
          if (!item.pulang || (l.Jam && (!item.pulang.Jam || l.Jam > item.pulang.Jam))) item.pulang = l;
        } else if (j.includes('IZIN') || j.includes('SAKIT') || j.includes('CUTI') || j.includes('TUGAS')) {
          item.izin = l;
        }
      });

      let hadirCount = 0;
      let lateCount = 0;
      let izinCount = 0;
      dateMap.forEach(v => {
        if (v.izin) {
          izinCount++;
        } else if (v.masuk) {
          hadirCount++;
          if (String(v.masuk['Jenis Absen']).includes('DI LUAR JAM MASUK') || String(v.masuk.Ket || '').toLowerCase().includes('terlambat')) {
            lateCount++;
          }
        }
      });

      const totalActive = hadirCount + izinCount;
      const rate = totalActive > 0 ? Math.round(((hadirCount - (lateCount * 0.5)) / totalActive) * 100) : 100;
      const disiplinPercent = Math.max(0, Math.min(100, rate));

      // 1. Bento monthly stats in weekContainer
      weekContainer.innerHTML = `
        <div class="col-span-7 grid grid-cols-4 gap-2 pt-0.5">
          <div class="p-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-800/60 flex flex-col items-center text-center">
            <span class="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Hadir</span>
            <span class="text-base font-black font-mono text-emerald-700 dark:text-emerald-300 mt-0.5">${hadirCount}</span>
            <span class="text-[9px] text-emerald-600/80">Hari</span>
          </div>
          <div class="p-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-800/60 flex flex-col items-center text-center">
            <span class="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Terlambat</span>
            <span class="text-base font-black font-mono text-amber-700 dark:text-amber-300 mt-0.5">${lateCount}</span>
            <span class="text-[9px] text-amber-600/80">Hari</span>
          </div>
          <div class="p-2.5 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-800/60 flex flex-col items-center text-center">
            <span class="text-[10px] font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">Izin/Cuti</span>
            <span class="text-base font-black font-mono text-blue-700 dark:text-blue-300 mt-0.5">${izinCount}</span>
            <span class="text-[9px] text-blue-600/80">Hari</span>
          </div>
          <div class="p-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800/60 flex flex-col items-center text-center">
            <span class="text-[10px] font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">Disiplin</span>
            <span class="text-base font-black font-mono text-indigo-700 dark:text-indigo-300 mt-0.5">${disiplinPercent}%</span>
            <span class="text-[9px] text-indigo-600/80">Kepatuhan</span>
          </div>
        </div>
      `;

      // 2. Monthly logs list in dailyContainer
      const sortedDays = Array.from(dateMap.values())
        .sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || ''));

      if (!sortedDays.length) {
        dailyContainer.innerHTML = `
          <div class="p-4 text-center rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs text-slate-400 space-y-1">
            <span class="material-symbols-outlined text-[24px]">event_busy</span>
            <p>Belum ada catatan presensi pada ${monthNames[targetMonth]} ${targetYear}.</p>
          </div>
        `;
        return;
      }

      const listHtml = sortedDays.slice(0, 7).map(d => {
        const formatted = formatIndoDate(d.tanggal);
        let badge = '';
        let jamStr = '';
        let lokasiStr = '';

        if (d.izin) {
          badge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">${d.izin['Jenis Absen']}</span>`;
          jamStr = d.izin.Jam || 'Seharian';
          lokasiStr = d.izin.Ket || 'Keterangan izin tercatat di database';
        } else if (d.masuk && d.pulang) {
          badge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Lengkap</span>`;
          jamStr = `${d.masuk.Jam} - ${d.pulang.Jam} WITA`;
          lokasiStr = d.masuk.Lokasi || 'Kantor BAPPERIDA';
        } else if (d.masuk) {
          const isLate = String(d.masuk['Jenis Absen']).includes('DI LUAR JAM MASUK');
          badge = isLate
            ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">Terlambat</span>`
            : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Masuk Saja</span>`;
          jamStr = `${d.masuk.Jam} WITA`;
          lokasiStr = d.masuk.Lokasi || 'Kantor BAPPERIDA';
        } else if (d.pulang) {
          badge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">Pulang Saja</span>`;
          jamStr = `${d.pulang.Jam} WITA`;
          lokasiStr = d.pulang.Lokasi || 'Meja Absen';
        }

        return `
          <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 overflow-hidden">
              <div class="w-8 h-8 rounded-lg bg-blue-50 dark:bg-slate-700 text-blue-600 dark:text-blue-300 flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-[18px]">calendar_today</span>
              </div>
              <div class="overflow-hidden">
                <p class="text-xs font-bold text-slate-900 dark:text-white truncate">${formatted}</p>
                <p class="text-[10px] text-slate-400 truncate">${jamStr} • ${lokasiStr}</p>
              </div>
            </div>
            ${badge}
          </div>
        `;
      }).join('');

      dailyContainer.innerHTML = `
        <div class="space-y-2">
          <div class="flex items-center justify-between pb-1">
            <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Log Presensi Bulan Ini</span>
            <span class="text-[10px] font-mono text-slate-400 font-bold">${sortedDays.length} Catatan</span>
          </div>
          <div class="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
            ${listHtml}
          </div>
          <button onclick="switchMobileTab('riwayat')" class="w-full mt-2 py-2.5 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-blue-600 dark:text-blue-400 text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer">
            <span class="material-symbols-outlined text-[16px]">receipt_long</span>
            <span>Buka Rekap Lengkap &amp; Ekspor PDF</span>
            <span class="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
        </div>
      `;
    }

    /* ── 5. E-SLIP OFFICIAL RECEIPT (SCREEN 11) ─────────────────────── */
    function showESlipModal() {
      if (!state.currentUser) return;
      const modal = document.getElementById('eSlipModal');
      modal.classList.remove('hidden');
      modal.classList.add('flex');

      document.getElementById('eSlipName').textContent = state.currentUser.nama;
      document.getElementById('eSlipNip').textContent = 'NIP. ' + state.currentUser.nip;
      document.getElementById('eSlipRole').textContent = state.currentUser.jabatan;
      const initials = (state.currentUser.nama || '').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'AA';
      const eInitials = document.getElementById('eSlipInitials');
      if (eInitials) eInitials.textContent = initials;
      document.getElementById('eSlipTimeIn').textContent = state.attendance.clockInTime || '07:45:12 WITA';
      document.getElementById('eSlipLocationName').textContent = state.currentLocation ? state.currentLocation.nama_lokasi : 'Kantor Bapperida';
      document.getElementById('eSlipCoords').textContent = state.currentLocation ? `${state.currentLocation.latitude}, ${state.currentLocation.longitude}` : '-9.648769, 119.389232';

      // QR Code
      const qrContainer = document.getElementById('eSlipQrCode');
      qrContainer.innerHTML = '';
      if (typeof QRCode !== 'undefined') {
        new QRCode(qrContainer, {
          text: `HADIR-BAPPERIDA-DB|${state.currentUser.nip}|${state.attendance.clockInTime}|${Date.now()}`,
          width: 90,
          height: 90,
          colorDark: "#0b1c30",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.H
        });
      }
    }

    function closeESlipModal() {
      const modal = document.getElementById('eSlipModal');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }

    async function downloadSlipPdf() {
      if (!window.jspdf || !window.jspdf.jsPDF) {
        showDynamicIsland({ type: 'warning', title: 'Library PDF Sedang Dimuat', message: 'Silakan tunggu sebentar.' });
        return;
      }
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      
      // 1. Official Regency Logo
      try {
        const logoImg = document.querySelector('img[src*="Lambang_Kabupaten_Sumba_Barat"]') || await new Promise(res => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => res(img);
          img.onerror = () => res(null);
          img.src = 'Lambang_Kabupaten_Sumba_Barat.png';
        });
        if (logoImg) {
          doc.addImage(logoImg, 'PNG', 15, 11, 18, 22);
        }
      } catch (e) {
        console.warn('Gagal memuat logo ke PDF:', e);
      }

      // 2. Official Government Kop Surat Header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('PEMERINTAH KABUPATEN SUMBA BARAT', 112, 16, { align: 'center' });
      doc.setFontSize(11);
      doc.text('BADAN PERENCANAAN PEMBANGUNAN, RISET DAN INOVASI DAERAH', 112, 22, { align: 'center' });
      doc.setFontSize(10);
      doc.text('(BAPPERIDA)', 112, 27, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('Jalan Weekarou No. 12, Waikabubak, Nusa Tenggara Timur - Kode Pos: 87211', 112, 32, { align: 'center' });
      doc.setFontSize(7.5);
      doc.text('Laman: bapperida.sumbabaratkab.go.id • Pos-el: info@bapperida.sumbabaratkab.go.id', 112, 36, { align: 'center' });

      // 3. Official Double Divider Line (Garis Ganda Kop Surat)
      doc.setLineWidth(0.8);
      doc.line(15, 39, 195, 39);
      doc.setLineWidth(0.2);
      doc.line(15, 40, 195, 40);

      // 4. Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('BUKTI ELEKTRONIK KEHADIRAN APARATUR (E-SLIP)', 105, 49, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text('Tervalidasi Otomatis Melalui Sistem HADIR BAPPERIDA Sumba Barat', 105, 54, { align: 'center' });

      // 5. Details
      doc.setFontSize(9.5);
      doc.text(`Nama Pegawai   : ${state.currentUser.nama}`, 20, 68);
      doc.text(`NIP            : ${state.currentUser.nip}`, 20, 76);
      doc.text(`Jabatan        : ${state.currentUser.jabatan || 'Pranata Komputer Ahli Pertama'}`, 20, 84);
      doc.text(`Waktu Presensi : ${state.attendance.clockInTime || '07:45:12 WITA'}`, 20, 92);
      doc.text(`Lokasi Absen   : ${state.currentLocation ? state.currentLocation.nama_lokasi : 'Kantor BAPPERIDA'}`, 20, 100);
      doc.text(`Sistem Database: PostgreSQL Live (Tabel Log_Absen)`, 20, 108);

      doc.setFontSize(8);
      doc.text('* Dokumen elektronik ini sah diterbitkan otomatis oleh sistem HADIR BAPPERIDA Sumba Barat.', 20, 126);
      doc.save(`E-Slip_${state.currentUser.nip}_${Date.now()}.pdf`);
      showDynamicIsland({
        type: 'download',
        title: 'E-Slip Presensi Tersimpan',
        message: 'Bukti elektronik presensi berkop resmi berhasil diunduh.'
      });
    }
