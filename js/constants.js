/* ════ KONSTANTA APLIKASI ════ */
    /* ════ KONSTANTA ════ */
    const TZ = 'Asia/Makassar';
    const H_ID = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
    const H_DISP = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const LOK_DEF = { senin: ['Kantor Utama'], rabu: ['Kantor Cabang'], default: ['Kantor Pusat'] };

    // ════ PANGKAT OPTIONS ════
    const PANGKAT_DATA = {
      PNS: [
        "Juru Muda (I/a)", "Juru Muda Tk.I (I/b)", "Juru (I/c)", "Juru Tk.I (I/d)",
        "Pengatur Muda (II/a)", "Pengatur Muda Tk.I (II/b)", "Pengatur (II/c)", "Pengatur Tk.I (II/d)",
        "Penata Muda (III/a)", "Penata Muda Tk.I (III/b)", "Penata (III/c)", "Penata Tk.I (III/d)",
        "Pembina (IV/a)", "Pembina Tk.I (IV/b)", "Pembina Utama Muda (IV/c)", "Pembina Utama Madya (IV/d)", "Pembina Utama (IV/e)"
      ],
      PPPK: [
        "Ahli Pertama", "Ahli Muda", "Ahli Madya", "Ahli Utama",
        "Terampil", "Mahir", "Penyelia",
        "Golongan I", "Golongan II", "Golongan III", "Golongan IV", "Golongan V", "Golongan VI", "Golongan VII", "Golongan VIII", "Golongan IX", "Golongan X", "Golongan XI", "Golongan XII", "Golongan XIII", "Golongan XIV", "Golongan XV", "Golongan XVI", "Golongan XVII"
      ]
    };

    async function loadBidangList(instansiId) {
      const regSelect = $('regBidang');
      const rekapSelect = $('rekapBidang');
      const adminSelect = $('inPegawaiBidang');
      if (!regSelect && !rekapSelect && !adminSelect) return;

      try {
        const endpoint = P.bidangList || (P.userList ? P.userList.replace('user-list', 'bidang-list') : '');
        if (!endpoint) return;
        
        const inst = instansiId || getScopedInstansiId();
        const params = {};
        if (inst) {
          params.instansi_id = inst;
        }
        
        const { ok: bOk, data: d } = await apiGet(endpoint, params);
        if (bOk) {
          const rawBidangs = (d?.rows && d.rows.length > 0) ? d.rows : (Array.isArray(d?.data) ? d.data : (Array.isArray(d) ? d : []));
          if (rawBidangs.length > 0) {
            const options = rawBidangs
              .filter(b => b && (b.nama_bidang || b.Nama_Bidang))
              .map(b => {
                const name = b.nama_bidang || b.Nama_Bidang;
                return `<option value="${name}">${name}</option>`;
              })
              .join('');
            if (regSelect) regSelect.innerHTML = `<option value="">— Pilih Bidang —</option>` + options;
            if (rekapSelect) {
              const currentVal = rekapSelect.value;
              rekapSelect.innerHTML = `<option value="Semua">— Tampilkan Semua Bidang —</option>` + options;
              if (currentVal && options.includes(`value="${currentVal}"`)) rekapSelect.value = currentVal;
            }
            if (adminSelect) {
              const currentVal = adminSelect.value;
              adminSelect.innerHTML = `<option value="">— Pilih Bidang —</option>` + options;
              if (currentVal && options.includes(`value="${currentVal}"`)) adminSelect.value = currentVal;
            }
          } else {
            if (regSelect) regSelect.innerHTML = `<option value="">— Tidak Ada Bidang —</option>`;
            if (rekapSelect) rekapSelect.innerHTML = `<option value="Semua">— Tampilkan Semua Bidang —</option>`;
            if (adminSelect) adminSelect.innerHTML = `<option value="">— Pilih Bidang —</option>`;
          }
        }
      } catch (e) {
        console.error('[Bidang] Load error:', e);
      }
    }

    function _updatePangkatDropdown(targetId, category) {
      const select = $(targetId);
      if (!select) return;
      let options = '<option value="">— Pilih —</option>';
      if (PANGKAT_DATA[category]) {
        options += PANGKAT_DATA[category].map(p => `<option value="${p}">${p}</option>`).join('');
      } else {
        options += '<option value="Lainnya">Lainnya / Staff</option>';
      }
      select.innerHTML = options;
    }

    const p2 = n => String(n).padStart(2, '0');
    const nowWITA = () => new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
    const fmtD = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
    // Helper: total menit → "HH:MM"
    const toHHMM = m => { if (!m || m <= 0) return '00:00'; const h = Math.floor(m / 60), mn = m % 60; return `${p2(h)}:${p2(mn)}`; };
    const $ = id => document.getElementById(id);

    /* ════ MAGIC NUMBER CONSTANTS (Prioritas #6) ════ */

    /** Threshold face matching — jarak Euclidean maksimum untuk dianggap cocok */
    const FACE_THRESHOLD = 0.55;
    /** Dimensi descriptor face-api.js (lama, 128-d) */
    const FACE_API_DIM = 128;
    /** Dimensi descriptor @vladmandic/human (baru, 512-d) */
    const HUMAN_DIM = 512;
    /** Berapa frame stabil sebelum Meja Absen trigger match — admin-configurable */
    const MEJA_STABILITY_FRAMES = 4;
    /** Cooldown Meja Absen antar-match (ms) — 20 detik */
    const MEJA_COOLDOWN_MS = 20_000;
    /** Delay setelah stream kamera terbuka sebelum deteksi dimulai (ms) */
    const STREAM_STABILITY_DELAY_MS = 2_500;

    /** Skor anti-spoofing GPS maksimum yang masih diterima */
    const GPS_FAKE_SCORE_THRESHOLD = 30;
    /** Akurasi GPS maksimum yang diterima (meter) */
    const GPS_MAX_ACCURACY_M = 500;
    /** Timeout getCurrentPosition (ms) */
    const GPS_TIMEOUT_MS = 15_000;

    /** Jam masuk default (format HH:MM) */
    const JAM_MASUK_DEFAULT = '08:00';
    /** Jam pulang default (format HH:MM) */
    const JAM_PULANG_DEFAULT = '14:30';
    /** Jam masuk default dalam menit dari tengah malam (mutable — bisa diubah admin) */
    let JAM_MASUK_MENIT = 8 * 60;        // 480
    /** Jam pulang default dalam menit dari tengah malam (mutable — bisa diubah admin) */
    let JAM_PULANG_MENIT = 14 * 60 + 30; // 870

    /** Storage keys yang dipakai di localStorage */
    const STORAGE_KEYS = {
      USER_ID:          'tg_user_id_v5',
      USER_OBJ:         'tg_user_obj_v5',
      JAM_ABSEN:        'jam_absen_bapperida',
      FACE_REF:         'face_ref_bapperida_v2',
      AI_ENGINE:        'absen_ai_engine',
      DESKTOP_MODE:     'bapperida_desktop_mode',
      FACE_RECOGNITION: 'face_recognition_bapperida',
      IP_CACHE:         'pub_ip_cache',
      IP_CACHE_TS:      'pub_ip_cache_ts',
    };

    /** Jenis-jenis absen yang valid */
    const JENIS_ABSEN = {
      MASUK:        'MASUK',
      PULANG:       'PULANG',
      PULANG_LUAR:  'PULANG LUAR',
      KONTROL:      'KONTROL',
      IZIN:         'IZIN',
      SAKIT:        'SAKIT',
      TUGAS:        'TUGAS',
      TUBEL:        'TUBEL',
      CUTI:         'CUTI',
      TANPA_BERITA: 'TANPA BERITA',
    };
