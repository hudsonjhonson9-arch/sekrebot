/* ════ HELPERS — DOM, DATA, RESULT UI ════ */
    /* ════ RIWAYAT HARI INI ════ */
    /**
     * Ambil nilai field dari row data dengan fallback multi-key.
     * Menangani perbedaan kapitalisasi key antara format lama dan baru.
     * @param {Object} r - Baris data
     * @param {...string} keys - Key yang dicoba berurutan
     * @returns {any} Nilai pertama yang ditemukan, atau undefined
     */
        function getField(r, ...keys) {
      if (!r) return '';
      for (const k of keys) {
        if (r[k] !== undefined && r[k] !== null && r[k] !== '') return r[k];
      }
      return '';
    }

    let _todayLoading = false;
    async function loadTodayHistory() {
      const uid = await waitForMyId();
      if (_todayLoading) return;
      _todayLoading = true;
      const el = $('todayList');
      if (!el) return;
      el.innerHTML = `<div class="shimmer" style="height:32px;border-radius:8px;margin-bottom:5px"></div>
                  <div class="shimmer" style="height:32px;border-radius:8px"></div>`;
      try {
        const todayStr = fmtD(nowWITA());
        const { ok: logOk, rows } = await apiGet(P.log, { user_id: uid || '', tanggal: todayStr });
        if (!logOk) throw 0;
        let rowsMut = rows;
        rowsMut = rowsMut.filter(r => {
          const rowUid = Number(getField(r, 'ID', 'id'));
          const tgl = getField(r, 'Tanggal', 'tanggal');
          const byMe = uid ? (Number(rowUid) === Number(uid)) : true;
          return byMe && tgl === todayStr;
        });
        rowsMut.sort((a, b) => {
          const ja = getField(a, 'Jam', 'jam'), jb = getField(b, 'Jam', 'jam');
          return ja.localeCompare(jb);
        });
        renderTodayHistory(rowsMut);
      } catch (e) {
        el.innerHTML = `<div class="today-empty">🔌 Gagal memuat. Pastikan n8n aktif.</div>`;
      } finally {
        _todayLoading = false;
      }
    }
    function getTodayBadge(jenis) {
      const j = (jenis || '').toUpperCase().trim();
      if (j === 'MASUK') return { cls: 'tb-masuk', icon: '🟢', lbl: 'MASUK' };
      if (j === 'PULANG') return { cls: 'tb-pulang', icon: '🔵', lbl: 'PULANG' };
      if (j === 'PULANG LUAR') return { cls: 'tb-pulang-luar', icon: '🏃', lbl: 'PULANG LAPANGAN' };
      if (j.includes('LUAR') && j.includes('MASUK')) return { cls: 'tb-luar', icon: '⚠️', lbl: 'LUAR JAM MASUK' };
      if (j.includes('LUAR') && j.includes('PULANG')) return { cls: 'tb-luar', icon: '🏃', lbl: 'PULANG CEPAT' };
      if (j.includes('LUAR')) return { cls: 'tb-luar', icon: '⚠️', lbl: 'DI LUAR JAM' };
      if (j === 'IZIN') return { cls: 'tb-izin', icon: '🙏', lbl: 'KETERANGAN' };
      if (j === 'SAKIT') return { cls: 'tb-sakit', icon: '🤒', lbl: 'SAKIT' };
      if (j === 'TUGAS') return { cls: 'tb-tugas', icon: '💼', lbl: 'TUGAS' };
      return { cls: 'tb-luar', icon: '📋', lbl: jenis || '—' };
    }
    function renderTodayHistory(rows) {
      const el = $('todayList');
      // Simpan ke global untuk dipakai cek masuk di pulang luar
      window._todayRows = rows;
      if (!rows.length) {
        el.innerHTML = `<div class="today-empty">📭 Belum ada absen hari ini</div>`;
        // Pastikan tombol aktif jika belum absen sama sekali
        const btn = $('btnAbsen');
        if (btn && !btn.dataset.manualDisabled) {
          btn.disabled = false;
          setBtnL('btnAbsen', false, 'Kirim Lokasi & Absen');
        }
        return;
      }

      el.innerHTML = rows.map(r => {
        const jenis = getField(r, 'Jenis Absen', 'jenis', 'Jenis') || '';
        const jam = getField(r, 'Jam', 'jam') || '—';
        const lokasi = getField(r, 'Lokasi', 'lokasi') || '—';
        const { cls, icon, lbl } = getTodayBadge(jenis);
        return `<div class="today-row">
      <span class="today-badge ${cls}">${icon} ${lbl}</span>
      <span class="today-jam">${jam}</span>
      <span class="today-lokasi">📍 ${lokasi}</span>
    </div>`;
      }).join('');

      // ── Cek apakah jenis absen saat ini sudah tercatat ──
      const n = nowWITA();
      const tot = n.getHours() * 60 + n.getMinutes();
      const _tglHari2 = n.toLocaleDateString('sv-SE', { timeZone: TZ });
      const _jH2 = getJamForTanggal(_tglHari2);
      const _jmH2 = toMenitStr(_jH2.masuk) ?? JAM_MASUK_MENIT;
      const _jpH2 = toMenitStr(_jH2.pulang) ?? JAM_PULANG_MENIT;
      let jenisSkrg;
      if (tot <= _jmH2) jenisSkrg = 'MASUK';
      else if (tot < 720) jenisSkrg = 'DI LUAR JAM MASUK';
      else if (tot < _jpH2) jenisSkrg = 'DI LUAR JAM PULANG';
      else jenisSkrg = 'PULANG';

      const GRP_MASUK = ['MASUK', 'DI LUAR JAM MASUK'];
      const GRP_PULANG = ['PULANG', 'DI LUAR JAM PULANG', 'PULANG LUAR'];

      const sudahMasuk = rows.some(r => GRP_MASUK.includes((getField(r, 'Jenis Absen', 'jenis', 'Jenis') || '').toUpperCase().trim()));
      const sudahPulang = rows.some(r => GRP_PULANG.includes((getField(r, 'Jenis Absen', 'jenis', 'Jenis') || '').toUpperCase().trim()));

      const isSkrgMasuk = GRP_MASUK.includes(jenisSkrg);
      const isSkrgPulang = GRP_PULANG.includes(jenisSkrg);

      const GRP_KETERANGAN = ['IZIN', 'SAKIT', 'TUGAS', 'CUTI', 'DL', 'TUBEL', 'TANPA BERITA', 'ALPA', 'TB'];
      const ketRow = rows.find(r => GRP_KETERANGAN.includes((getField(r, 'Jenis Absen', 'jenis', 'Jenis') || '').toUpperCase().trim()));

      const sudahAbsen = (isSkrgMasuk && sudahMasuk) || (isSkrgPulang && sudahPulang);
      const pesanTolak = sudahMasuk && isSkrgMasuk
        ? 'Absen masuk hari ini sudah tercatat.'
        : 'Absen pulang hari ini sudah tercatat.';

      const btn = $('btnAbsen');
      if (!btn) return;
      
      if (ketRow) {
        const nmKet = (getField(ketRow, 'Jenis Absen', 'jenis', 'Jenis') || 'KETERANGAN').toUpperCase().trim();
        btn.disabled = true;
        btn.dataset.manualDisabled = '1';
        setBtnL('btnAbsen', false, `🚫 Status: ${nmKet}`);
        
        // Disable tombol pulang luar juga jika ada
        const bpl = $('btnPulangLuar');
        if (bpl) {
          bpl.disabled = true;
          const tSpan = $('btnPulangLuarText');
          if (tSpan) tSpan.textContent = `🚫 Status: ${nmKet}`;
        }
      } else if (sudahAbsen) {
        btn.disabled = true;
        btn.dataset.manualDisabled = '1';
        setBtnL('btnAbsen', false, '✅ Sudah Absen');
      } else {
        // Belum absen di periode ini — aktifkan tombol
        btn.disabled = false;
        delete btn.dataset.manualDisabled;
        setBtnL('btnAbsen', false, 'Kirim Lokasi & Absen');
      }
    }

    /* ════ AUTO UPDATE STATUS AKTIF SAAT ABSEN ════ */
    async function autoUpdateStatusAktif() {
      // Hanya update jika status pegawai bukan AKTIF
      const statusSaatIni = (userProfile?.status || 'AKTIF').toUpperCase();
      if (statusSaatIni === 'AKTIF') return;

      const todayStr = fmtD(nowWITA());

      // Gunakan ketStatusCache jika sudah terisi — hindari request tambahan ke server
      const _checkKetRows = (rows) => rows.some(r => {
        const st = (r.status || r.Status || '').toUpperCase();
        const tgl = r.tanggal || r.Tanggal || r.tgl_mulai || '';
        const tglS = r.tgl_selesai || r.tanggal || '';
        return (st === 'DISETUJUI' || st === 'APPROVED') && tgl <= todayStr && todayStr <= tglS;
      });

      if (ketStatusCache.length > 0) {
        if (_checkKetRows(ketStatusCache)) {
          console.log('autoUpdateStatusAktif: ada keterangan aktif (cache), skip update status');
          return;
        }
      } else {
        // Cache kosong — fetch sekali, tidak simpan ke ketStatusCache agar tidak mempengaruhi UI ket
        try {
          const { ok: ckOk, data: dKet } = await apiGet(P.ketList, { user_id: MY_ID });
          if (ckOk) {
            const ketRows = dKet?.data || dKet?.rows || parseApiResponse(dKet);
            if (_checkKetRows(ketRows)) {
              console.log('autoUpdateStatusAktif: ada keterangan aktif hari ini, skip update status');
              return;
            }
          }
        } catch (_) { }
      }

      // Update status ke AKTIF
      try {
        await apiPost(P.updateStatus, { user_id: MY_ID, status, tanggal: todayStr });
        if (userProfile) { userProfile.status = 'AKTIF'; applyProfile(); }
      } catch (_) { }
    }
    function setBtnL(id, loading, txt) {
      const b = $(id); b.disabled = loading;
      const map = { btnAbsen: 'btnText', btnKet: 'btnKetText', btnTambahLokasi: 'btnAdminText' };
      const el = $(map[id]); if (el) el.innerHTML = loading ? `<span class="spinner"></span> ${txt}` : txt;
    }
    /**
     * Tampilkan result card di UI dengan icon, judul, dan pesan.
     */
    function showResult(cid, iid, tid, mid, type, icon, title, msg) {
      const el = $(cid);
      if (!el) {
        console.warn(`[showResult] Element not found: ${cid}. Title: ${title}, Msg: ${msg}`);
        return;
      }
      el.className = `result-card r-${type} show`;
      el.style.display = 'flex'; // Force show
      const iEl = $(iid), tEl = $(tid), mEl = $(mid);
      if (iEl) iEl.textContent = icon;
      if (tEl) tEl.textContent = title;
      if (mEl) mEl.textContent = msg;
    }
    window.showResult = showResult;
    window.hideResult = () => {
      const rc = $('resultCard');
      if (rc) {
        rc.classList.remove('show');
        rc.style.display = 'none';
      }
    };
    function showGPS(lat, lon, acc, lokasi) {
      const n = nowWITA();
      const elLat = $('gpsLat'), elLon = $('gpsLon'), elAcc = $('gpsAcc'), elLok = $('gpsLokasi');
      const elTgl = $('gpsTanggal'), elJam = $('gpsJam');

      if (elLat) elLat.textContent = lat.toFixed(6);
      if (elLon) elLon.textContent = lon.toFixed(6);
      if (elAcc) elAcc.textContent = `${Math.round(acc)} meter`;
      if (elLok) elLok.textContent = lokasi || 'Mendeteksi...';

      const clb = $('clockLocBadge');
      if (clb) {
        if (lokasi) {
          clb.textContent = '📍 ' + lokasi;
          clb.className = 'clock-loc-badge';
        } else {
          clb.textContent = '📍 Mendeteksi lokasi...';
          clb.className = 'clock-loc-badge unknown';
        }
      }
      
      if (elTgl) elTgl.textContent = n.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      if (elJam) elJam.textContent = `${p2(n.getHours())}:${p2(n.getMinutes())}:${p2(n.getSeconds())} WITA`;
      
      const elBar = $('gpsBar');
      if (elBar) {
        const pct = Math.max(5, Math.min(100, 100 - (acc / 5)));
        const col = acc <= 20 ? '#22c55e' : acc <= 100 ? '#f59e0b' : '#ef4444';
        const elFill = $('accFill');
        if (elFill) {
          elFill.style.width = pct + '%';
          elFill.style.background = col;
        }
        const elCard = $('gpsCard');
        if (elCard) elCard.classList.add('show');
      }
    }

    /**
     * Menghitung skor hierarki jabatan untuk keperluan sorting.
     * Semakin tinggi skor, semakin tinggi posisi dalam hierarki.
     * @param {string} j - Nama jabatan
     * @returns {number} Skor 0-100
     */
    function getJabatanScore(j) {
      if (!j) return 0;
      const s = String(j).toUpperCase().trim();
      // Level 1: Pimpinan Tertinggi (Kepala Badan / Dinas / Inspektur)
      if (s.includes('KEPALA DINAS') || s.includes('KEPALA BADAN') || s.includes('KEPALA KANTOR') || s.includes('KEPALA BAPPERIDA') || s.includes('KEPALA BAPPEDA') || s.includes('INSPEKTUR') || s === 'KEPALA') return 100;
      if (s.startsWith('KEPALA ') && !s.includes('BIDANG') && !s.includes('SUB')) return 100;

      // Level 2: Sekretaris
      if (s.includes('SEKRETARIS')) return 90;

      // Level 3: Kepala Bidang / Kabid / Inspektur Pembantu / Irban
      if (s.includes('KEPALA BIDANG') || s.includes('KABID') || s.includes('INSPEKTUR PEMBANTU') || s.includes('IRBAN')) return 80;

      // Level 4: Pengawas / Kasubag / Kasubbid / Ketua Tim / Koordinator
      if (s.includes('KASUBAG') || s.includes('KASUBBID') || s.includes('KEPALA SUB') || s.includes('KETUA TIM') || s.includes('KOORDINATOR') || s.includes('SUB KOORDINATOR') || s.includes('SUBKOR')) return 70;

      // Level 5: Seluruh Staf / Pelaksana / Fungsional (PNS & PPPK)
      if (s.includes('STAF') || s.includes('PELAKSANA') || s.includes('ADMIN') || s.includes('PERENCANA') || s.includes('ANALIS') || s.includes('PRANATA') || s.includes('PENELAAH') || s.includes('FASILITATOR') || s.includes('OPERATOR') || s.includes('PENATA LAYANAN') || s.includes('FUNGSIONAL') || s.includes('AHLI') || s.includes('DOKTER') || s.includes('GURU') || s.includes('BIDAN') || s.includes('PERAWAT')) return 50;
      
      // Level 6: Non-ASN / Kontrak / Pendukung
      if (s.includes('NON ASN') || s.includes('HONORER') || s.includes('THL') || s.includes('KONTRAK') || s.includes('PRAMU') || s.includes('DRIVER') || s.includes('SOPIR') || s.includes('PENJAGA')) return 40;
      
      return 50;
    }

    /**
     * Menghitung skor hierarki pangkat/golongan.
     * @param {string} p - String pangkat (e.g. IV/E)
     * @returns {number} Skor 0-17
     */
    function getPangkatScore(p) {
      if (!p || p === '—') return 0;
      // Normalisasi: hilangkan spasi, ganti titik/strip dengan slash, ke UPPERCASE
      const s = String(p).toUpperCase().replace(/\s/g, '').replace(/[\.\-]/g, '/');
      
      // Level IV / Ahli Utama / Madya
      if (s.includes('IV/E') || s.includes('GOL/XVII')) return 17;
      if (s.includes('IV/D') || s.includes('GOL/XVI') || s.includes('AHLIUTAMA')) return 16;
      if (s.includes('IV/C') || s.includes('GOL/XV')) return 15;
      if (s.includes('IV/B') || s.includes('GOL/XIV')) return 14;
      if (s.includes('IV/A') || s.includes('GOL/XIII') || s.includes('AHLIMADYA')) return 13;
      
      // Level III / Ahli Muda / Pertama
      if (s.includes('III/D') || s.includes('GOL/XII')) return 12;
      if (s.includes('III/C') || s.includes('GOL/XI') || s.includes('AHLIMUDA')) return 11;
      if (s.includes('III/B') || s.includes('GOL/X')) return 10;
      if (s.includes('III/A') || s.includes('GOL/IX') || s.includes('AHLIPERTAMA')) return 9;
      
      // Level II / Penyelia / Mahir / Terampil
      if (s.includes('II/D') || s.includes('GOL/VIII') || s.includes('PENYELIA')) return 8;
      if (s.includes('II/C') || s.includes('GOL/VII') || s.includes('MAHIR')) return 7;
      if (s.includes('II/B') || s.includes('GOL/VI')) return 6;
      if (s.includes('II/A') || s.includes('GOL/V') || s.includes('TERAMPIL')) return 5;
      
      // Level I
      if (s.includes('I/D') || s.includes('GOL/IV')) return 4;
      if (s.includes('I/C') || s.includes('GOL/III')) return 3;
      if (s.includes('I/B') || s.includes('GOL/II')) return 2;
      if (s.includes('I/A') || s.includes('GOL/I')) return 1;
      
      // Fallback untuk pencocokan kata kunci dasar jika normalisasi di atas tidak kena
      const raw = String(p).toUpperCase();
      if (raw.includes('III/A') || raw.includes('GOLONGAN IX') || raw.includes('AHLI PERTAMA')) return 9;
      
      return 0;
    }

    /**
     * Menghitung skor NIP (senioritas).
     * @param {string} nip - Nomor Induk Pegawai
     * @returns {string} String NIP yang hanya berisi angka untuk localeCompare
     */
    function getNipScore(nip) {
      return String(nip || '999999999999999999').replace(/\D/g, '');
    }
    /**
     * Kompresi gambar Base64 atau File ke format JPEG dengan kualitas tertentu.
     * Berguna untuk mengurangi beban bandwidth saat mengirim foto/ttd ke n8n.
     * @param {string|File} source - Source image (Base64 atau File)
     * @param {number} [maxDimension=1280] - Batas dimensi maksimal (lebar atau tinggi)
     * @param {number} [quality=0.7] - Kualitas JPEG (0.1 - 1.0)
     * @returns {Promise<string>} - Base64 hasil kompresi
     */
    async function compressImage(source, maxDimension = 1280, quality = 0.7) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = (maxDimension / width) * height;
              width = maxDimension;
            } else {
              width = (maxDimension / height) * width;
              height = maxDimension;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        if (typeof source === 'string') img.src = source;
        else {
          const reader = new FileReader();
          reader.onload = (e) => img.src = e.target.result;
          reader.readAsDataURL(source);
        }
      });
    }
    /**
     * Tampilkan toast notification menggunakan SweetAlert2.
     * @param {string} msg - Pesan yang ditampilkan
     * @param {'success'|'error'|'warning'|'info'} [type='info'] - Tipe toast
     */
    function showToast(msg, type = 'info') {
      const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true,
        didOpen: (toast) => {
          toast.addEventListener('mouseenter', Swal.stopTimer);
          toast.addEventListener('mouseleave', Swal.resumeTimer);
        }
      });
      Toast.fire({
        icon: type,
        title: msg
      });
    }
    window.showToast = showToast;
    window.toast = showToast; // Alias

    function getInstansiName(instansiId) {
      if (!instansiId) return '';
      try {
        const cached = localStorage.getItem('absen_instansi_map');
        if (cached) {
          const map = JSON.parse(cached);
          const inst = map[instansiId.toLowerCase()] || map[instansiId];
          if (inst) {
            if (typeof inst === 'object') {
              return inst.nama_instansi || inst.header || inst.nama || inst.Nama_Instansi || inst.id || inst.ID || '';
            }
            return inst;
          }
        }
      } catch(e){}
      
      // Fallback
      if (instansiId.toLowerCase() === 'bapperida') return 'BAPPERIDA Sumba Barat';
      return instansiId.toUpperCase();
    }
    window.getInstansiName = getInstansiName;

    /**
     * Mendapatkan data instansi lengkap secara dinamis berdasarkan ID instansi.
     * @param {string} instansiId - ID instansi
     * @returns {Object|null} Data instansi lengkap dari cache
     */
    function getInstansiData(instansiId) {
      if (!instansiId) return null;
      try {
        const cached = localStorage.getItem('absen_instansi_map');
        if (cached) {
          const map = JSON.parse(cached);
          const inst = map[instansiId.toLowerCase()] || map[instansiId];
          if (inst && typeof inst === 'object') return inst;
        }
      } catch(e){}
      return null;
    }
    window.getInstansiData = getInstansiData;
