/* Stitch Admin Rekap Kehadiran Semua Pegawai: Rentang/Bulanan + Harian + Kalender + Preview Berkop/Paraf/TTD + PDF + Excel (.xlsx) + Telegram */
(function (w, d) {
  'use strict';

  /* ── FALLBACK RESOLVER GAMBAR BIOMETRIK & TTD ───────────────────────── */
  if (typeof w.resolveBioImageSrc !== 'function') {
    w.resolveBioImageSrc = function resolveBioImageSrc(raw) {
      const s = String(raw ?? '').trim();
      if (!s || s === 'null' || s === 'undefined') return '';
      if (s.startsWith('data:image')) return s;
      const tok = (typeof w.getStitchToken === 'function' && w.getStitchToken())
        || localStorage.getItem('_native_token')
        || localStorage.getItem('native_token')
        || localStorage.getItem('_sess_token')
        || '';
      const q = tok ? ('?token=' + encodeURIComponent(tok)) : '';
      const rawMatch = s.match(/^\/api\/media\/raw\/([^/?#]+)/);
      if (rawMatch && rawMatch[1]) {
        return '/api/media/raw/' + encodeURIComponent(decodeURIComponent(rawMatch[1])) + q;
      }
      const m = s.match(/\/file\/d\/([-\w]{5,200})/) || s.match(/\/d\/([-\w]{5,200})/) || s.match(/[?&]id=([-\w]{5,200})/);
      if (m && m[1]) {
        return '/api/media/raw/' + encodeURIComponent(m[1]) + q;
      }
      if (s.startsWith('/') || s.startsWith('http://') || s.startsWith('https://')) return s;
      return '';
    };
  }

  let _mode = 'range'; // 'range' | 'harian' | 'logs'
  let _inited = false;
  let _logModalInited = false;
  let _printOptsInited = false;
  let _rangePayload = null;
  let _harianPayload = null;
  let _logsList = [];
  let _instansiList = [];
  let _instansiMap = {};
  let _instansiLoaded = false;
  let _usersCache = [];
  let _signersMap = new Map();
  let _activePreset = 'bulan_ini';
  let _calState = null;

  const LOG_JENIS_OPTIONS = [
    'MASUK',
    'PULANG',
    'IZIN',
    'SAKIT',
    'TUGAS',
    'TUBEL',
    'CUTI',
    'DL',
    'TB',
    'TANPA BERITA',
    'ALPA',
    'DI LUAR JAM MASUK',
    'DI LUAR JAM PULANG',
    'PULANG LUAR'
  ];

  const MONTHS_ID = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function getToken() {
    try {
      return (typeof w.getStitchToken === 'function' && w.getStitchToken())
        || localStorage.getItem('_native_token')
        || localStorage.getItem('native_token')
        || localStorage.getItem('_sess_token')
        || '';
    } catch (_) {
      return '';
    }
  }

  function authHeaders(extra) {
    const h = Object.assign({}, extra || {});
    const tok = getToken();
    if (tok && !h.Authorization) h.Authorization = 'Bearer ' + tok;
    return h;
  }

  function getUserMeta() {
    let role = '';
    let inst = '';
    try {
      const u = (w.state && w.state.currentUser) || w.userProfile || null;
      if (u) {
        role = String(u.role || '').toUpperCase();
        inst = String(u.instansi_id || u.Instansi_Id || '');
      }
      if (!role) role = String(localStorage.getItem('_sess_role') || localStorage.getItem('MY_ROLE') || '').toUpperCase();
      if (!inst) inst = String(localStorage.getItem('_sess_inst') || localStorage.getItem('MY_INSTANSI') || '');
      if (!role || !inst) {
        const raw = localStorage.getItem('tg_user_obj_v5');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (!role && parsed?.role) role = String(parsed.role).toUpperCase();
          if (!inst && (parsed?.instansi_id || parsed?.Instansi_Id)) inst = String(parsed.instansi_id || parsed.Instansi_Id);
        }
      }
    } catch (_) {}
    return { role, instansiId: inst };
  }

  function isSuperAdminUser() {
    return getUserMeta().role === 'SUPERADMIN';
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

  function toHHMM(mins) {
    const n = Number(mins) || 0;
    if (n <= 0) return '00:00';
    const h = Math.floor(n / 60);
    const m = n % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function toMin(hm) {
    if (typeof hm === 'number' && !isNaN(hm)) return hm;
    const m = String(hm || '').match(/(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  function resolveImg(raw) {
    if (!raw) return '';
    const res = typeof w.resolveBioImageSrc === 'function' ? w.resolveBioImageSrc(raw) : '';
    if (!res) return '';
    if (res.startsWith('/api/media/raw/') && !res.includes('token=')) {
      const tok = getToken();
      if (tok) return res + (res.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(tok);
    }
    return res;
  }

  function getSelectedInstansiId() {
    const el = d.getElementById('adminRekapInstansiFilter');
    if (!el) return '';
    const v = String(el.value || '').trim();
    return v && v !== 'all' ? v : '';
  }

  function getRoleFilterVal() {
    const el = d.getElementById('adminRekapRoleFilter');
    return el ? String(el.value || 'all').toLowerCase() : 'all';
  }

  function getBidangFilterVal() {
    const el = d.getElementById('adminRekapBidangFilter');
    return el ? String(el.value || 'all').trim() : 'all';
  }

  function nipDigits(nip) {
    return String(nip || '').replace(/\D/g, '');
  }

  function getLogId(obj) {
    if (!obj || typeof obj !== 'object') return '';
    if (obj.ID_Log) return String(obj.ID_Log);
    if (obj.id_log) return String(obj.id_log);
    if (obj.ID_LOG) return String(obj.ID_LOG);
    if (obj.log_id) return String(obj.log_id);
    for (const k of Object.keys(obj)) {
      const lk = k.toLowerCase();
      if ((lk === 'id_log' || lk === 'idlog' || lk === 'log_id') && obj[k]) return String(obj[k]);
    }
    return '';
  }

  /* ── INIT & FILTER SETUP ────────────────────────────────────────────── */
  function bindFilterControl(id, evt, fn) {
    const el = d.getElementById(id);
    if (!el || el.dataset.rekapBound === '1') return;
    el.dataset.rekapBound = '1';
    el.addEventListener(evt, fn);
  }

  function initPrintOptionListeners() {
    if (_printOptsInited) return;
    _printOptsInited = true;
    if (w.StitchPicker && typeof w.StitchPicker.enhanceSelect === 'function') {
      ['rekapOptPaper', 'rekapOptOrientation', 'rekapOptSigner'].forEach((id) => {
        if (d.getElementById(id)) w.StitchPicker.enhanceSelect(id, { searchable: id === 'rekapOptSigner' });
      });
    }
    ['rekapOptPaper', 'rekapOptOrientation', 'rekapOptFontSize', 'rekapOptSigner'].forEach((id) => {
      bindFilterControl(id, 'change', () => {
        const modal = d.getElementById('modalAdminRekapPreview');
        if (modal && !modal.classList.contains('hidden')) openAdminRekapPreview();
      });
    });
    ['rekapKopInstansi', 'rekapKopAlamat'].forEach((id) => {
      bindFilterControl(id, 'input', () => {
        const el = d.getElementById(id);
        if (el) el.dataset.userEdited = '1';
        const modal = d.getElementById('modalAdminRekapPreview');
        if (modal && !modal.classList.contains('hidden')) openAdminRekapPreview();
      });
    });
  }

  async function initInstansiFilter() {
    const sel = d.getElementById('adminRekapInstansiFilter');
    const wrap = d.getElementById('adminRekapInstansiWrap') || sel?.parentElement;
    if (!sel) return;
    const sa = isSuperAdminUser();
    if (wrap) wrap.classList.toggle('hidden', !sa);
    if (!sa) return;

    if (!_instansiLoaded) {
      _instansiLoaded = true;
      try {
        const res = await fetch('/api/instansi-list', { headers: authHeaders() });
        const json = await res.json();
        if (res.ok && json.ok) {
          _instansiList = json.data || json.rows || [];
          _instansiMap = {};
          _instansiList.forEach((it) => {
            if (it?.id) _instansiMap[String(it.id)] = it;
          });
        }
      } catch (_) {}
    }

    if (_instansiList.length) {
      const cur = sel.value || getUserMeta().instansiId || '';
      sel.innerHTML = '<option value="all">Semua Instansi</option>' + _instansiList.map((it) => {
        const name = it.nama_instansi || it.header || it.nama || String(it.id).toUpperCase();
        return `<option value="${esc(it.id)}">${esc(name)}</option>`;
      }).join('');
      if (cur && Array.from(sel.options).some((o) => o.value === cur)) {
        sel.value = cur;
      }
      if (w.StitchPicker && typeof w.StitchPicker.enhanceSelect === 'function') {
        w.StitchPicker.enhanceSelect('adminRekapInstansiFilter', { searchable: true, placeholder: 'Pilih instansi...' });
        w.StitchPicker.refreshSelect('adminRekapInstansiFilter');
      }
    }

    bindFilterControl('adminRekapInstansiFilter', 'change', () => {
      const bEl = d.getElementById('adminRekapBidangFilter');
      if (bEl) bEl.value = 'all';
      applyKopDefaultsFromInstansi();
      loadAdminRekapData();
    });
  }

  function applyKopDefaultsFromInstansi() {
    const instEl = d.getElementById('rekapKopInstansi');
    const addrEl = d.getElementById('rekapKopAlamat');
    const instId = getSelectedInstansiId() || getUserMeta().instansiId || 'bapperida';
    const meta = _instansiMap[instId];
    if (meta) {
      if (instEl && instEl.dataset.userEdited !== '1') {
        instEl.value = meta.header || meta.nama_instansi || '';
      }
      if (addrEl && addrEl.dataset.userEdited !== '1') {
        addrEl.value = meta.alamat || '';
      }
    }
  }

  function populateBidangFilter(payload) {
    const sel = d.getElementById('adminRekapBidangFilter');
    if (!sel) return;
    const prev = sel.value || 'all';
    const set = new Set();
    const rawList = Array.isArray(payload?.bidangList) ? payload.bidangList : [];
    rawList.forEach((b) => {
      const name = typeof b === 'string' ? b : (b?.nama || b?.nama_bidang || b?.bidang || '');
      if (String(name).trim()) set.add(String(name).trim());
    });
    if (!set.size && Array.isArray(payload?.data)) {
      payload.data.forEach((r) => {
        const b = String(r.bidang || r.Bidang || '').trim();
        if (b && b !== '-') set.add(b);
      });
    }
    const items = Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
    sel.innerHTML = '<option value="all">Semua Bidang</option>'
      + items.map((b) => `<option value="${esc(b)}">${esc(b)}</option>`).join('');
    if (prev && Array.from(sel.options).some((o) => o.value === prev)) sel.value = prev;
    else sel.value = 'all';

    if (w.StitchPicker && typeof w.StitchPicker.enhanceSelect === 'function') {
      w.StitchPicker.enhanceSelect('adminRekapBidangFilter', { searchable: items.length > 6, placeholder: 'Semua bidang' });
      w.StitchPicker.refreshSelect('adminRekapBidangFilter');
    }
  }

  function populateSignerSelect(payload) {
    const sel = d.getElementById('rekapOptSigner');
    if (!sel) return;
    const prev = sel.value;
    const list = (Array.isArray(payload?.signers) && payload.signers.length)
      ? payload.signers
      : (payload?.kepala ? [payload.kepala] : []);
    _signersMap = new Map();
    if (!list.length) {
      sel.innerHTML = '<option value="">Kepala Badan (Default)</option>';
    } else {
      sel.innerHTML = list.map((s, idx) => {
        const key = String(s.nip || s.id || idx);
        _signersMap.set(key, s);
        const label = `${s.nama || '-'}${s.jabatan ? ' — ' + s.jabatan : ''}`;
        return `<option value="${esc(key)}">${esc(label)}</option>`;
      }).join('');
      const defKey = payload?.kepala ? String(payload.kepala.nip || payload.kepala.id || '') : '';
      if (prev && _signersMap.has(prev)) sel.value = prev;
      else if (defKey && _signersMap.has(defKey)) sel.value = defKey;
    }
    if (w.StitchPicker && typeof w.StitchPicker.refreshSelect === 'function') {
      w.StitchPicker.refreshSelect('rekapOptSigner');
    }
  }

  function initAdminRekapPanel() {
    if (!_inited) {
      _inited = true;
      if (w.StitchPicker) {
        if (d.getElementById('adminRekapRangeTrigger') && typeof w.StitchPicker.enhanceDateRange === 'function') {
          w.StitchPicker.enhanceDateRange('adminRekapRangeTrigger', 'adminRekapDari', 'adminRekapSampai', { placeholder: 'Pilih rentang tanggal' });
        } else if (typeof w.StitchPicker.enhanceDate === 'function') {
          if (d.getElementById('adminRekapDari')) w.StitchPicker.enhanceDate('adminRekapDari', { placeholder: 'Dari tanggal' });
          if (d.getElementById('adminRekapSampai')) w.StitchPicker.enhanceDate('adminRekapSampai', { placeholder: 'Sampai tanggal' });
        }
        if (typeof w.StitchPicker.enhanceDate === 'function' && d.getElementById('adminRekapTanggalHarian')) {
          w.StitchPicker.enhanceDate('adminRekapTanggalHarian', { placeholder: 'Tanggal hadir' });
        }
      }
      if (w.StitchPicker && typeof w.StitchPicker.enhanceSelect === 'function') {
        if (d.getElementById('adminRekapRoleFilter')) w.StitchPicker.enhanceSelect('adminRekapRoleFilter', { searchable: false });
        if (d.getElementById('adminRekapBidangFilter')) w.StitchPicker.enhanceSelect('adminRekapBidangFilter', { searchable: false });
      }
      const today = todayWitaIso();
      const tglH = d.getElementById('adminRekapTanggalHarian');
      if (tglH && !tglH.value) tglH.value = today;

      setAdminRekapPreset('bulan_ini', false);

      bindFilterControl('adminRekapRoleFilter', 'change', filterAdminRekapList);
      bindFilterControl('adminRekapBidangFilter', 'change', filterAdminRekapList);
      bindFilterControl('adminRekapSearch', 'input', filterAdminRekapList);
      bindFilterControl('adminRekapSearchHarian', 'input', filterAdminRekapList);
      bindFilterControl('adminRekapDari', 'change', () => updatePresetButtons('custom'));
      bindFilterControl('adminRekapSampai', 'change', () => updatePresetButtons('custom'));
      bindFilterControl('adminRekapTanggalHarian', 'change', () => { if (_mode === 'harian') loadAdminRekapData(); });

      initPrintOptionListeners();
      initInstansiFilter();

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

  function updatePresetButtons(activeKey) {
    _activePreset = activeKey;
    const btns = d.querySelectorAll('[data-rekap-preset]');
    if (!btns.length) return;
    const activeCls = 'min-h-[36px] px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-xs font-bold text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800 cursor-pointer';
    const idleCls = 'min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-blue-50 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer';
    btns.forEach((btn) => {
      const k = btn.getAttribute('data-rekap-preset');
      btn.className = k === activeKey ? activeCls : idleCls;
    });
  }

  function setAdminRekapPreset(preset, autoLoad = true) {
    const alias = {
      today: 'hari_ini',
      week: 'minggu_ini',
      prevweek: 'minggu_lalu',
      month: 'bulan_ini',
      last30: '30_hari',
      prev_month: 'bulan_lalu'
    };
    const key = alias[preset] || preset || 'bulan_ini';
    updatePresetButtons(key);

    if (key !== 'custom') {
      const today = todayWitaIso();
      const [y, m, day] = today.split('-').map(Number);
      const pad = (n) => String(n).padStart(2, '0');
      const fmtUtc = (dt) => `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
      let dari = today;
      let sampai = today;

      if (key === 'hari_ini') {
        dari = today;
        sampai = today;
      } else if (key === 'minggu_ini') {
        const dt = new Date(Date.UTC(y, m - 1, day));
        const dow = (dt.getUTCDay() + 6) % 7;
        dt.setUTCDate(dt.getUTCDate() - dow);
        dari = fmtUtc(dt);
        sampai = today;
      } else if (key === 'minggu_lalu') {
        const dt = new Date(Date.UTC(y, m - 1, day));
        const dow = (dt.getUTCDay() + 6) % 7;
        dt.setUTCDate(dt.getUTCDate() - dow - 7);
        dari = fmtUtc(dt);
        dt.setUTCDate(dt.getUTCDate() + 6);
        sampai = fmtUtc(dt);
      } else if (key === 'bulan_ini') {
        dari = `${y}-${pad(m)}-01`;
        sampai = today;
      } else if (key === '30_hari') {
        const dt = new Date(Date.UTC(y, m - 1, day));
        dt.setUTCDate(dt.getUTCDate() - 29);
        dari = fmtUtc(dt);
        sampai = today;
      } else if (key === 'bulan_lalu') {
        const first = new Date(Date.UTC(y, m - 2, 1));
        const last = new Date(Date.UTC(y, m - 1, 0));
        dari = fmtUtc(first);
        sampai = fmtUtc(last);
      }

      const elD = d.getElementById('adminRekapDari');
      const elS = d.getElementById('adminRekapSampai');
      if (elD) elD.value = dari;
      if (elS) elS.value = sampai;
      if (w.StitchPicker && typeof w.StitchPicker.refreshAll === 'function') {
        w.StitchPicker.refreshAll();
      }
    }
    if (autoLoad) loadAdminRekapData();
  }

  /* ── DATA LOADING ───────────────────────────────────────────────────── */
  async function loadAdminRekapData() {
    const box = d.getElementById('adminRekapListContainer');
    const sumBar = d.getElementById('adminRekapSummaryBar');
    if (box) box.innerHTML = '<div class="p-8 text-center text-xs text-slate-400">Memuat data rekap seluruh pegawai...</div>';
    try {
      const instId = getSelectedInstansiId();
      const instQ = instId ? `&instansi_id=${encodeURIComponent(instId)}` : '';

      if (_mode === 'range') {
        const dari = d.getElementById('adminRekapDari')?.value || todayWitaIso();
        const sampai = d.getElementById('adminRekapSampai')?.value || dari;
        const res = await fetch(`/api/stitch/rekap-range?dari=${encodeURIComponent(dari)}&sampai=${encodeURIComponent(sampai)}${instQ}`, {
          headers: authHeaders()
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.message || 'Gagal memuat rekap rentang.');
        _rangePayload = json;
        populateBidangFilter(json);
        populateSignerSelect(json);
        applyKopDefaultsFromInstansi();
        renderAdminRekapList();
      } else if (_mode === 'logs') {
        const dari = d.getElementById('adminRekapDari')?.value || todayWitaIso();
        const sampai = d.getElementById('adminRekapSampai')?.value || dari;
        const res = await fetch(`/api/log?dari=${encodeURIComponent(dari)}&sampai=${encodeURIComponent(sampai)}${instQ}`, {
          headers: authHeaders()
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.message || 'Gagal memuat log presensi.');
        _logsList = (json.rows || json.data || []).filter((r) => {
          const t = String(r.Tanggal || r.tanggal || '').slice(0, 10);
          return (!dari || t >= dari) && (!sampai || t <= sampai);
        });
        renderAdminRekapList();
      } else {
        const tanggal = d.getElementById('adminRekapTanggalHarian')?.value || todayWitaIso();
        const res = await fetch(`/api/stitch/rekap-harian?tanggal=${encodeURIComponent(tanggal)}${instQ}`, {
          headers: authHeaders()
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.message || 'Gagal memuat daftar hadir harian.');
        _harianPayload = json;
        populateBidangFilter(json);
        populateSignerSelect(json);
        applyKopDefaultsFromInstansi();
        renderAdminRekapList();
      }
    } catch (err) {
      if (sumBar) sumBar.innerHTML = '';
      if (box) box.innerHTML = `<div class="p-6 text-center text-xs text-rose-500 font-bold">${esc(err.message)}</div>`;
    }
  }

  function applyRowFilters(list) {
    const roleVal = getRoleFilterVal();
    const bidangVal = getBidangFilterVal();
    const q = (_mode === 'harian'
      ? (d.getElementById('adminRekapSearchHarian')?.value || d.getElementById('adminRekapSearch')?.value || '')
      : (d.getElementById('adminRekapSearch')?.value || '')
    ).trim().toLowerCase();

    return (list || []).filter((r) => {
      const nip = r.nip || r.NIP || '';
      if (roleVal === 'pegawai' && nipDigits(nip).length !== 18) return false;
      if (roleVal === 'magang' && nipDigits(nip).length === 18) return false;
      if (bidangVal && bidangVal !== 'all' && bidangVal !== 'Semua') {
        const rb = String(r.bidang || r.Bidang || '').trim().toLowerCase();
        if (rb !== bidangVal.toLowerCase()) return false;
      }
      if (q) {
        const hay = [
          r.nama, r.Nama, nip, r.jabatan, r.Jabatan,
          r.bidang, r.Bidang, r['Jenis Absen'], r.jenis, r.Ket, r.ket
        ].map((v) => String(v || '').toLowerCase()).join(' ');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function getFilteredRows() {
    const list = _mode === 'range'
      ? (_rangePayload?.data || [])
      : (_mode === 'logs' ? _logsList : (_harianPayload?.data || []));
    return applyRowFilters(list);
  }

  function filterAdminRekapList() {
    renderAdminRekapList();
  }

  /* ── 10 SUMMARY STAT CARDS ──────────────────────────────────────────── */
  function computeSummaryStats(rows) {
    const s = {
      masuk: 0,
      pulang: 0,
      lapangan: 0,
      lambat: 0,
      izin: 0,
      sakit: 0,
      tugas: 0,
      tubel: 0,
      cuti: 0,
      alpa: 0
    };
    if (_mode === 'range') {
      rows.forEach((r) => {
        const m = Number(r.masuk ?? r.hadir ?? 0);
        let p = r.pulang !== undefined ? Number(r.pulang || 0) : 0;
        if (r.pulang === undefined && r.logByDate) {
          p = Object.values(r.logByDate).filter((v) => v && v.pulang !== undefined).length;
        }
        s.masuk += m;
        s.pulang += p;
        s.lapangan += Number(r.lapangan ?? r.pulang_luar ?? 0);
        s.lambat += Number(r.lambat_count || 0);
        s.izin += Number(r.izin || 0);
        s.sakit += Number(r.sakit || 0);
        s.tugas += Number(r.tugas || 0);
        s.tubel += Number(r.tubel || 0);
        s.cuti += Number(r.cuti || 0);
        s.alpa += Number(r.alpa || 0);
      });
      return s;
    }

    if (_mode === 'harian') {
      const shiftMasuk = (_harianPayload?.shift?.masuk) || (_rangePayload?.shift?.masuk) || '07:15';
      rows.forEach((r) => {
        const hasMasuk = Boolean(r.jamMasuk && r.jamMasuk !== '-' && r.jamMasuk !== '—') || Number(r.masuk || 0) > 0;
        const hasPulang = Boolean(r.jamPulang && r.jamPulang !== '-' && r.jamPulang !== '—') || Number(r.pulang || 0) > 0;
        const ku = String(r.ket || '').toUpperCase();
        const isIzin = Number(r.izin || 0) > 0 || ku.startsWith('IZIN');
        const isSakit = Number(r.sakit || 0) > 0 || ku.startsWith('SAKIT');
        const isTugas = Number(r.tugas || 0) > 0 || ku.startsWith('TUGAS') || ku.startsWith('DL');
        const isTubel = Number(r.tubel || 0) > 0 || ku.startsWith('TUBEL');
        const isCuti = Number(r.cuti || 0) > 0 || ku.startsWith('CUTI');

        if (hasMasuk) s.masuk++;
        if (hasPulang) s.pulang++;
        const pJenis = String(r.raw_pulang_log?.Jenis_Absen || r.jenisPulang || '').toUpperCase();
        const mJenis = String(r.raw_masuk_log?.Jenis_Absen || r.jenisMasuk || '').toUpperCase();
        if (Number(r.lapangan ?? r.pulang_luar ?? 0) > 0 || pJenis.includes('PULANG LUAR')) s.lapangan++;
        const isLate = Number(r.lambat_count || 0) > 0
          || Number(r.menit_terlambat || 0) > 0
          || mJenis.includes('DI LUAR JAM MASUK')
          || mJenis === 'TERLAMBAT'
          || (hasMasuk && String(r.jamMasuk).slice(0, 5) > shiftMasuk);
        if (isLate) s.lambat++;

        if (isIzin) s.izin++;
        else if (isSakit) s.sakit++;
        else if (isTugas) s.tugas++;
        else if (isTubel) s.tubel++;
        else if (isCuti) s.cuti++;
        else if (!hasMasuk) s.alpa++;
      });
      return s;
    }

    // logs mode
    rows.forEach((r) => {
      const j = String(r['Jenis Absen'] || r.jenis || '').toUpperCase();
      if (j === 'MASUK') s.masuk++;
      else if (j === 'PULANG') s.pulang++;
      else if (j === 'PULANG LUAR') s.lapangan++;
      else if (j === 'DI LUAR JAM MASUK' || j === 'DI LUAR JAM PULANG' || j === 'TERLAMBAT') s.lambat++;
      else if (j === 'IZIN') s.izin++;
      else if (j === 'SAKIT') s.sakit++;
      else if (j === 'TUGAS' || j === 'DL') s.tugas++;
      else if (j === 'TUBEL') s.tubel++;
      else if (j === 'CUTI') s.cuti++;
      else if (j === 'TB' || j === 'TANPA BERITA' || j === 'ALPA') s.alpa++;
    });
    return s;
  }

  function renderSummaryCards(sumBar, rows) {
    if (!sumBar) return;
    const st = computeSummaryStats(rows);
    const cards = [
      { label: 'Masuk', val: st.masuk, icon: 'login', tone: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-200/60 dark:border-emerald-800/50' },
      { label: 'Pulang', val: st.pulang, icon: 'logout', tone: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-200/60 dark:border-blue-800/50' },
      { label: 'Lapangan', val: st.lapangan, icon: 'directions_run', tone: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-50/80 dark:bg-cyan-950/40 border-cyan-200/60 dark:border-cyan-800/50' },
      { label: 'Lambat', val: st.lambat, icon: 'schedule', tone: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-200/60 dark:border-amber-800/50' },
      { label: 'Izin', val: st.izin, icon: 'assignment', tone: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-50/80 dark:bg-sky-950/40 border-sky-200/60 dark:border-sky-800/50' },
      { label: 'Sakit', val: st.sakit, icon: 'healing', tone: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-200/60 dark:border-rose-800/50' },
      { label: 'Tugas/DL', val: st.tugas, icon: 'work_outline', tone: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50/80 dark:bg-violet-950/40 border-violet-200/60 dark:border-violet-800/50' },
      { label: 'Tubel', val: st.tubel, icon: 'school', tone: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-200/60 dark:border-indigo-800/50' },
      { label: 'Cuti', val: st.cuti, icon: 'event_available', tone: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50/80 dark:bg-teal-950/40 border-teal-200/60 dark:border-teal-800/50' },
      { label: 'TB/Alpa', val: st.alpa, icon: 'person_off', tone: 'text-red-600 dark:text-red-400', bg: 'bg-red-50/80 dark:bg-red-950/40 border-red-200/60 dark:border-red-800/50' }
    ];

    const metaLeft = _mode === 'range'
      ? `${rows.length} Pegawai • ${_rangePayload?.hariKerja || 0} Hari Kerja (${_rangePayload?.dari || '-'} s/d ${_rangePayload?.sampai || '-'})`
      : (_mode === 'harian'
        ? `${rows.length} Pegawai • ${fmtIndoFull(d.getElementById('adminRekapTanggalHarian')?.value || todayWitaIso())}`
        : `${rows.length} Baris Log Presensi`);

    sumBar.innerHTML = `
      <div class="w-full space-y-2.5">
        <div class="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-300">
          <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold tabular-nums">
            <span class="material-symbols-outlined text-[15px]">groups</span>
            <span>${esc(metaLeft)}</span>
          </span>
          ${_mode === 'range' ? '<span class="text-[11px] text-slate-400">Klik baris pegawai untuk melihat Kalender Kehadiran</span>' : ''}
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2 w-full">
          ${cards.map((c) => `
            <div class="rounded-2xl border ${c.bg} px-2.5 py-2 flex flex-col justify-between">
              <div class="flex items-center justify-between gap-1">
                <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">${c.label}</span>
                <span class="material-symbols-outlined text-[15px] ${c.tone}">${c.icon}</span>
              </div>
              <div class="text-lg font-extrabold ${c.tone} tabular-nums mt-0.5 leading-tight">${c.val}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  /* ── RENDER LIST ────────────────────────────────────────────────────── */
  function renderAdminRekapList() {
    const box = d.getElementById('adminRekapListContainer');
    const sumBar = d.getElementById('adminRekapSummaryBar');
    if (!box) return;
    const rows = getFilteredRows();
    const isWide = w.matchMedia('(min-width: 768px)').matches;
    const isMagang = getRoleFilterVal() === 'magang';
    const idLabel = isMagang ? 'ID' : 'NIP';

    renderSummaryCards(sumBar, rows);

    if (_mode === 'range') {
      if (!rows.length) {
        box.innerHTML = '<div class="p-8 text-center text-xs text-slate-400">Tidak ada data pegawai yang cocok.</div>';
        return;
      }
      if (!isWide) {
        box.innerHTML = `<div class="space-y-2.5">${rows.map((r, idx) => {
          const key = esc(String(r.nip || r.id || idx));
          const hadir = r.hadir ?? r.masuk ?? 0;
          return `
            <div onclick="openAdminRekapCalendarModal('${key}')" class="rounded-2xl border border-slate-200 dark:border-slate-700 p-3.5 bg-slate-50/70 dark:bg-slate-800/40 hover:border-blue-400 dark:hover:border-blue-600 transition-colors cursor-pointer space-y-2">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="text-xs font-bold text-slate-900 dark:text-white truncate">${esc(r.nama)}</p>
                  <p class="text-[10px] font-mono text-slate-400 tabular-nums">${idLabel}. ${esc(r.nip || '-')}${r.bidang ? ' • ' + esc(r.bidang) : ''}</p>
                </div>
                <span class="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold shrink-0 tabular-nums">Hadir ${hadir}</span>
              </div>
              <div class="grid grid-cols-4 gap-1.5 text-center text-[10px] tabular-nums">
                <div class="p-1.5 rounded-lg bg-white dark:bg-slate-900"><span class="font-bold text-amber-600 block">${r.lambat_count || 0}</span>Telat</div>
                <div class="p-1.5 rounded-lg bg-white dark:bg-slate-900"><span class="font-bold text-blue-600 block">${(r.izin || 0) + (r.sakit || 0)}</span>I/S</div>
                <div class="p-1.5 rounded-lg bg-white dark:bg-slate-900"><span class="font-bold text-indigo-600 block">${(r.tugas || 0) + (r.cuti || 0)}</span>DL/C</div>
                <div class="p-1.5 rounded-lg bg-white dark:bg-slate-900"><span class="font-bold text-rose-600 block">${r.alpa || 0}</span>Alpa</div>
              </div>
            </div>`;
        }).join('')}</div>`;
      } else {
        box.innerHTML = `
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase font-bold sticky top-0 z-10">
              <tr>
                <th class="p-2.5 rounded-l-xl">No</th>
                <th class="p-2.5">Nama / ${idLabel}</th>
                <th class="p-2.5">Bidang / Jabatan</th>
                <th class="p-2.5 text-center">H</th>
                <th class="p-2.5 text-center">I</th>
                <th class="p-2.5 text-center">S</th>
                <th class="p-2.5 text-center">DL</th>
                <th class="p-2.5 text-center">C</th>
                <th class="p-2.5 text-center">TB</th>
                <th class="p-2.5 text-center">Alpa</th>
                <th class="p-2.5 text-center">Telat (Mnt)</th>
                <th class="p-2.5 text-center rounded-r-xl">Kalender</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              ${rows.map((r, i) => {
                const key = esc(String(r.nip || r.id || i));
                const hadir = r.hadir ?? r.masuk ?? 0;
                return `
                  <tr onclick="openAdminRekapCalendarModal('${key}')" class="hover:bg-blue-50/50 dark:hover:bg-slate-800/70 transition-colors cursor-pointer">
                    <td class="p-2.5 font-mono text-slate-400 tabular-nums">${i + 1}</td>
                    <td class="p-2.5"><p class="font-bold text-slate-900 dark:text-white">${esc(r.nama)}</p><p class="text-[10px] font-mono text-slate-400 tabular-nums">${esc(r.nip || '-')}</p></td>
                    <td class="p-2.5 text-slate-500 dark:text-slate-400"><p class="font-medium text-slate-700 dark:text-slate-300">${esc(r.bidang || '-')}</p><p class="text-[10px] text-slate-400">${esc(r.jabatan || '-')}</p></td>
                    <td class="p-2.5 text-center font-bold text-emerald-600 tabular-nums">${hadir}</td>
                    <td class="p-2.5 text-center tabular-nums">${r.izin || 0}</td>
                    <td class="p-2.5 text-center tabular-nums">${r.sakit || 0}</td>
                    <td class="p-2.5 text-center tabular-nums">${r.tugas || 0}</td>
                    <td class="p-2.5 text-center tabular-nums">${r.cuti || 0}</td>
                    <td class="p-2.5 text-center tabular-nums">${r.tubel || 0}</td>
                    <td class="p-2.5 text-center font-bold text-rose-600 tabular-nums">${r.alpa || 0}</td>
                    <td class="p-2.5 text-center font-mono tabular-nums">${r.lambat_count || 0} (${r.menit_terlambat || 0}m)</td>
                    <td class="p-2.5 text-center">
                      <span class="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                        <span class="material-symbols-outlined text-[17px]">calendar_month</span>
                      </span>
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>`;
      }
      return;
    }

    if (_mode === 'logs') {
      if (!rows.length) {
        box.innerHTML = '<div class="p-8 text-center text-xs text-slate-400">Belum ada log presensi pada rentang tanggal ini. Klik <strong>Tambah Log</strong> untuk mencatat manual.</div>';
        return;
      }
      if (!isWide) {
        box.innerHTML = `<div class="space-y-2.5">${rows.slice(0, 120).map((r) => {
          const logId = esc(getLogId(r));
          const jenis = esc(r['Jenis Absen'] || r.jenis || '-');
          return `
            <div class="rounded-2xl border border-slate-200 dark:border-slate-700 p-3.5 bg-slate-50/70 dark:bg-slate-800/40 space-y-2">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="text-xs font-bold text-slate-900 dark:text-white truncate">${esc(r.Nama || r.nama || '-')}</p>
                  <p class="text-[10px] font-mono text-slate-400 tabular-nums">${esc(r.NIP || r.nip || '-')}</p>
                </div>
                <span class="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[10px] font-bold shrink-0">${jenis}</span>
              </div>
              <div class="flex items-center justify-between text-[11px] font-mono text-slate-600 dark:text-slate-300 tabular-nums">
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
            <thead class="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase font-bold sticky top-0 z-10">
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
                const logId = esc(getLogId(r));
                return `
                  <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td class="p-2.5 font-mono tabular-nums">${esc(String(r.Tanggal || '').slice(0, 10))}</td>
                    <td class="p-2.5 font-mono font-bold tabular-nums">${esc(r.Jam || '-')}</td>
                    <td class="p-2.5"><p class="font-bold text-slate-900 dark:text-white">${esc(r.Nama || r.nama || '-')}</p><p class="text-[10px] font-mono text-slate-400 tabular-nums">${esc(r.NIP || r.nip || '-')}</p></td>
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
    if (!rows.length) {
      box.innerHTML = '<div class="p-8 text-center text-xs text-slate-400">Tidak ada data pegawai pada tanggal ini.</div>';
      return;
    }
    if (!isWide) {
      box.innerHTML = `<div class="space-y-2.5">${rows.map((r, i) => {
        const key = esc(String(r.nip || r.id || i));
        const hasM = Boolean(r.jamMasuk && r.jamMasuk !== '-' && r.jamMasuk !== '—');
        const hasP = Boolean(r.jamPulang && r.jamPulang !== '-' && r.jamPulang !== '—');
        const sigUrl = resolveImg(r.signature);
        const badgeCls = hasM
          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
          : (r.ket && r.ket !== 'TB' ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300');
        return `
          <div class="rounded-2xl border border-slate-200 dark:border-slate-700 p-3.5 bg-slate-50/70 dark:bg-slate-800/40 space-y-2">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="text-xs font-bold text-slate-900 dark:text-white truncate">${esc(r.nama)}</p>
                <p class="text-[10px] font-mono text-slate-400 tabular-nums">${esc(r.nip || '-')}</p>
              </div>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${badgeCls}">${esc(hasM ? 'HADIR' : (r.ket || 'TB'))}</span>
            </div>
            <div class="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-600 dark:text-slate-300 tabular-nums">
              <div class="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-1">
                <div>
                  <span class="text-[9px] font-sans uppercase text-slate-400 block">Masuk</span>
                  <strong>${esc(r.jamMasuk || '-')}</strong>
                </div>
                ${hasM && sigUrl ? `<img src="${esc(sigUrl)}" class="h-6 max-w-[48px] object-contain" alt="Paraf Masuk" onerror="this.style.display='none'">` : ''}
              </div>
              <div class="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-1">
                <div>
                  <span class="text-[9px] font-sans uppercase text-slate-400 block">Pulang</span>
                  <strong>${esc(r.jamPulang || '-')}</strong>
                </div>
                ${hasP && sigUrl ? `<img src="${esc(sigUrl)}" class="h-6 max-w-[48px] object-contain" alt="Paraf Pulang" onerror="this.style.display='none'">` : ''}
              </div>
            </div>
            <div class="flex items-center justify-between gap-2 pt-1">
              <span class="text-[11px] text-slate-500 truncate">${esc(r.ket || '-')}</span>
              <div class="flex items-center gap-1.5 shrink-0">
                <button type="button" onclick="openAdminLogQuickForEmployee('${key}', 'MASUK')" class="min-h-[32px] px-2.5 py-1 rounded-lg ${hasM ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' : 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'} text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer">
                  <span class="material-symbols-outlined text-[14px]">${hasM ? 'edit' : 'add'}</span>
                  <span>Masuk</span>
                </button>
                <button type="button" onclick="openAdminLogQuickForEmployee('${key}', 'PULANG')" class="min-h-[32px] px-2.5 py-1 rounded-lg ${hasP ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'} text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer">
                  <span class="material-symbols-outlined text-[14px]">${hasP ? 'edit' : 'add'}</span>
                  <span>Pulang</span>
                </button>
              </div>
            </div>
          </div>`;
      }).join('')}</div>`;
    } else {
      box.innerHTML = `
        <table class="w-full text-left text-xs">
          <thead class="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase font-bold sticky top-0 z-10">
            <tr>
              <th class="p-2.5 rounded-l-xl">No</th>
              <th class="p-2.5">Nama / ${idLabel}</th>
              <th class="p-2.5">Jabatan</th>
              <th class="p-2.5 text-center">Masuk</th>
              <th class="p-2.5 text-center">Paraf</th>
              <th class="p-2.5 text-center">Pulang</th>
              <th class="p-2.5 text-center">Paraf</th>
              <th class="p-2.5">Status / Ket</th>
              <th class="p-2.5 text-right rounded-r-xl">Aksi Log</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            ${rows.map((r, i) => {
              const key = esc(String(r.nip || r.id || i));
              const hasM = Boolean(r.jamMasuk && r.jamMasuk !== '-' && r.jamMasuk !== '—');
              const hasP = Boolean(r.jamPulang && r.jamPulang !== '-' && r.jamPulang !== '—');
              const sigUrl = resolveImg(r.signature);
              const parafHtml = sigUrl
                ? `<img src="${esc(sigUrl)}" class="h-7 mx-auto object-contain" alt="Paraf" onerror="this.style.display='none'">`
                : '<span class="text-slate-300 dark:text-slate-600">-</span>';
              return `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td class="p-2.5 font-mono text-slate-400 tabular-nums">${i + 1}</td>
                  <td class="p-2.5"><p class="font-bold text-slate-900 dark:text-white">${esc(r.nama)}</p><p class="text-[10px] font-mono text-slate-400 tabular-nums">${esc(r.nip || '-')}</p></td>
                  <td class="p-2.5 text-slate-500 dark:text-slate-400">${esc(r.jabatan || '-')}</td>
                  <td class="p-2.5 text-center font-mono font-bold tabular-nums">${esc(r.jamMasuk || '-')}</td>
                  <td class="p-2.5 text-center">${hasM ? parafHtml : '-'}</td>
                  <td class="p-2.5 text-center font-mono font-bold tabular-nums">${esc(r.jamPulang || '-')}</td>
                  <td class="p-2.5 text-center">${hasP ? parafHtml : '-'}</td>
                  <td class="p-2.5 text-slate-600 dark:text-slate-300">${esc(r.ket || (hasM ? 'Hadir' : 'TB'))}</td>
                  <td class="p-2.5 text-right">
                    <div class="inline-flex items-center gap-1">
                      <button type="button" onclick="openAdminLogQuickForEmployee('${key}', 'MASUK')" title="${hasM ? 'Edit Log Masuk' : 'Tambah Log Masuk'}" class="min-h-[30px] px-2 py-1 rounded-lg ${hasM ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' : 'bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'} text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer">
                        <span class="material-symbols-outlined text-[14px]">${hasM ? 'edit' : 'add'}</span>
                        <span>Masuk</span>
                      </button>
                      <button type="button" onclick="openAdminLogQuickForEmployee('${key}', 'PULANG')" title="${hasP ? 'Edit Log Pulang' : 'Tambah Log Pulang'}" class="min-h-[30px] px-2 py-1 rounded-lg ${hasP ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'} text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer">
                        <span class="material-symbols-outlined text-[14px]">${hasP ? 'edit' : 'add'}</span>
                        <span>Pulang</span>
                      </button>
                    </div>
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>`;
    }
  }

  /* ── KALENDER KEHADIRAN PEGAWAI MODAL (RANGE MODE) ───────────────────── */
  function ensureCalendarModalEl() {
    let modal = d.getElementById('modalAdminRekapCalendar');
    if (modal) return modal;
    modal = d.createElement('div');
    modal.id = 'modalAdminRekapCalendar';
    modal.className = 'hidden fixed inset-0 z-[77] bg-slate-900/75 backdrop-blur-sm items-center justify-center p-2 sm:p-4';
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeAdminRekapCalendarModal();
    });
    modal.innerHTML = `
      <div class="w-full max-w-2xl max-h-[92vh] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden font-sans">
        <div class="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-[22px]">calendar_month</span>
            </div>
            <div class="min-w-0">
              <h3 id="adminRekapCalNama" class="text-sm font-extrabold text-slate-900 dark:text-white truncate">Kalender Kehadiran Pegawai</h3>
              <p id="adminRekapCalSub" class="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">-</p>
            </div>
          </div>
          <button type="button" onclick="closeAdminRekapCalendarModal()" aria-label="Tutup kalender" class="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div class="p-4 sm:p-5 overflow-y-auto space-y-4">
          <div class="flex items-center justify-between gap-2">
            <button type="button" onclick="shiftAdminRekapCalendarMonth(-1)" class="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center cursor-pointer">
              <span class="material-symbols-outlined text-[18px]">chevron_left</span>
            </button>
            <h4 id="adminRekapCalMonthTitle" class="text-sm font-extrabold text-slate-900 dark:text-white">-</h4>
            <button type="button" onclick="shiftAdminRekapCalendarMonth(1)" class="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center cursor-pointer">
              <span class="material-symbols-outlined text-[18px]">chevron_right</span>
            </button>
          </div>
          <div id="adminRekapCalGrid" class="space-y-1.5"></div>
          <div class="flex flex-wrap items-center gap-2 text-[10px] font-semibold text-slate-600 dark:text-slate-300 pt-1">
            <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>Hadir</span>
            <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full bg-amber-500"></span>Terlambat</span>
            <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full bg-sky-500"></span>Izin</span>
            <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full bg-rose-500"></span>Sakit</span>
            <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full bg-violet-500"></span>Tugas</span>
            <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full bg-teal-500"></span>Cuti</span>
            <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>Tubel</span>
            <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full bg-red-500"></span>Alpa</span>
          </div>
          <div id="adminRekapCalDetail" class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 text-xs">
            <p class="text-slate-400">Klik tanggal pada kalender untuk melihat detail kehadiran.</p>
          </div>
        </div>
      </div>
    `;
    d.body.appendChild(modal);
    return modal;
  }

  function classifyCalendarDay(iso, row, dari, sampai) {
    const today = todayWitaIso();
    const dt = new Date(iso + 'T00:00:00Z');
    const dow = dt.getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    const liburArr = Array.isArray(_rangePayload?.libur) ? _rangePayload.libur : [];
    const isHoliday = isWeekend || liburArr.includes(iso);
    const inRange = (!dari || iso >= dari) && (!sampai || iso <= sampai);

    const ketByDate = row.ketByDate || {};
    const logByDate = row.logByDate || {};
    const ketEntry = ketByDate[iso];
    const ketRaw = String(typeof ketEntry === 'object' && ketEntry !== null ? (ketEntry.jenis || '') : (ketEntry || '')).toUpperCase().trim();
    const ketNote = typeof ketEntry === 'object' && ketEntry !== null ? String(ketEntry.ket || '').trim() : '';
    const logDay = logByDate[iso];

    if (ketRaw) {
      if (ketRaw.includes('SAKIT')) return { code: 'SAKIT', label: 'Sakit', note: ketNote, cls: 'bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800', log: logDay };
      if (ketRaw.includes('TUBEL')) return { code: 'TUBEL', label: 'Tubel', note: ketNote, cls: 'bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800', log: logDay };
      if (ketRaw.includes('CUTI')) return { code: 'CUTI', label: 'Cuti', note: ketNote, cls: 'bg-teal-100 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 border-teal-300 dark:border-teal-800', log: logDay };
      if (ketRaw.includes('TUGAS') || ketRaw === 'DL') return { code: 'TUGAS', label: 'Tugas / DL', note: ketNote, cls: 'bg-violet-100 dark:bg-violet-950/70 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-800', log: logDay };
      if (ketRaw === 'ALPA' || ketRaw === 'TB' || ketRaw.includes('TANPA BERITA')) return { code: 'ALPA', label: 'TB / Alpa', note: ketNote, cls: 'bg-red-100 dark:bg-red-950/70 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800', log: logDay };
      return { code: 'IZIN', label: 'Izin', note: ketNote, cls: 'bg-sky-100 dark:bg-sky-950/70 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-800', log: logDay };
    }

    if (logDay && (logDay.masuk != null || logDay.pulang != null)) {
      const mIn = toMin(logDay.masuk);
      const batasM = toMin(_rangePayload?.shift?.masuk || '07:15') ?? 435;
      const isLate = String(logDay.status || '').toUpperCase() === 'TERLAMBAT' || (mIn !== null && mIn > batasM);
      if (isLate) {
        return {
          code: 'TERLAMBAT',
          label: mIn !== null ? `Terlambat (${toHHMM(mIn)} > ${toHHMM(batasM)})` : 'Terlambat',
          cls: 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800',
          log: logDay
        };
      }
      return {
        code: 'HADIR',
        label: mIn !== null ? `Hadir (${toHHMM(mIn)})` : 'Hadir',
        cls: 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
        log: logDay
      };
    }

    if (isHoliday) {
      return { code: 'LIBUR', label: isWeekend ? 'Akhir Pekan' : 'Hari Libur', cls: 'bg-slate-100 dark:bg-slate-800/70 text-slate-400 border-slate-200 dark:border-slate-700', log: null };
    }
    if (!inRange) {
      return { code: 'OUT', label: 'Di luar periode', cls: 'bg-white dark:bg-slate-900 text-slate-300 dark:text-slate-600 border-slate-100 dark:border-slate-800 opacity-60', log: null };
    }
    if (iso > today) {
      return { code: 'FUTURE', label: 'Belum berlangsung', cls: 'bg-white dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-800', log: null };
    }
    return { code: 'ALPA', label: 'Tanpa Berita / Alpa', cls: 'bg-red-100 dark:bg-red-950/70 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800', log: null };
  }

  function renderAdminRekapCalendarGrid() {
    if (!_calState) return;
    const { row, dari, sampai, year, month } = _calState;
    const titleEl = d.getElementById('adminRekapCalMonthTitle');
    const gridEl = d.getElementById('adminRekapCalGrid');
    if (titleEl) titleEl.textContent = `${MONTHS_ID[month]} ${year}`;
    if (!gridEl) return;

    const first = new Date(Date.UTC(year, month, 1));
    const offset = (first.getUTCDay() + 6) % 7; // Sen=0..Min=6
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const pad = (n) => String(n).padStart(2, '0');
    const ym = `${year}-${pad(month + 1)}`;

    let html = '<div class="grid grid-cols-7 gap-1.5 text-center text-[10px] font-bold text-slate-400 uppercase pb-1">';
    ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].forEach((wd) => { html += `<div>${wd}</div>`; });
    html += '</div><div class="grid grid-cols-7 gap-1.5">';

    for (let i = 0; i < offset; i++) {
      html += '<div class="h-14 rounded-xl"></div>';
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${ym}-${pad(day)}`;
      const info = classifyCalendarDay(iso, row, dari, sampai);
      const isSelected = _calState.selectedDate === iso;
      const ring = isSelected ? 'ring-2 ring-blue-600 ring-offset-1 dark:ring-offset-slate-900' : '';
      const masukTxt = info.log && info.log.masuk != null ? toHHMM(toMin(info.log.masuk)) : '';
      const pulangTxt = info.log && info.log.pulang != null ? toHHMM(toMin(info.log.pulang)) : '';
      const timeLines = (masukTxt || pulangTxt)
        ? `<span class="text-[9px] font-mono leading-tight mt-0.5 opacity-95">${masukTxt || '--:--'}</span>
           <span class="text-[8.5px] font-mono leading-tight ${pulangTxt ? 'text-blue-700 dark:text-blue-300 font-bold' : 'opacity-45'}">${pulangTxt || '--:--'}</span>`
        : `<span class="text-[8px] font-bold leading-none mt-1 uppercase opacity-80">${esc(info.code === 'OUT' || info.code === 'FUTURE' || info.code === 'LIBUR' ? '' : info.code.slice(0, 5))}</span>`;
      html += `
        <button type="button" onclick="selectAdminRekapCalendarDay('${iso}')" title="${esc(info.label)}${pulangTxt ? ' • Pulang ' + pulangTxt : ''}" class="h-14 rounded-xl border ${info.cls} ${ring} flex flex-col items-center justify-center p-1 transition-all hover:brightness-95 cursor-pointer tabular-nums">
          <span class="text-xs font-extrabold leading-none">${day}</span>
          ${timeLines}
        </button>`;
    }
    html += '</div>';
    gridEl.innerHTML = html;
  }

  function selectAdminRekapCalendarDay(iso) {
    if (!_calState) return;
    _calState.selectedDate = iso;
    renderAdminRekapCalendarGrid();
    const detailEl = d.getElementById('adminRekapCalDetail');
    if (!detailEl) return;
    const info = classifyCalendarDay(iso, _calState.row, _calState.dari, _calState.sampai);
    const mIn = info.log && info.log.masuk != null ? toMin(info.log.masuk) : null;
    const mOut = info.log && info.log.pulang != null ? toMin(info.log.pulang) : null;
    const durasi = (mIn !== null && mOut !== null && mOut > mIn)
      ? `${Math.floor((mOut - mIn) / 60)}j ${(mOut - mIn) % 60}m`
      : '-';

    detailEl.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
        <span class="font-extrabold text-slate-900 dark:text-white">${esc(fmtIndoFull(iso))}</span>
        <span class="px-2.5 py-0.5 rounded-full border text-[10px] font-bold ${info.cls}">${esc(info.label)}</span>
      </div>
      ${info.note ? `<p class="text-[11px] text-slate-600 dark:text-slate-300 mb-2">${esc(info.note)}</p>` : ''}
      ${info.log && (mIn !== null || mOut !== null) ? `
        <div class="grid grid-cols-3 gap-2 text-center font-mono tabular-nums">
          <div class="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700">
            <span class="text-[9px] font-sans text-slate-400 block">Masuk</span>
            <strong class="text-slate-900 dark:text-white">${mIn !== null ? toHHMM(mIn) : '-'}</strong>
          </div>
          <div class="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700">
            <span class="text-[9px] font-sans text-slate-400 block">Pulang</span>
            <strong class="${mOut !== null ? 'text-slate-900 dark:text-white' : 'text-amber-600 dark:text-amber-400 font-sans text-[11px]'}">${mOut !== null ? toHHMM(mOut) : 'Belum absen'}</strong>
          </div>
          <div class="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700">
            <span class="text-[9px] font-sans text-slate-400 block">Durasi</span>
            <strong class="text-blue-600 dark:text-blue-400">${durasi}</strong>
          </div>
        </div>
      ` : '<p class="text-[11px] text-slate-500 dark:text-slate-400">Tidak ada catatan jam masuk/pulang pada tanggal ini.</p>'}
    `;
  }

  function shiftAdminRekapCalendarMonth(delta) {
    if (!_calState) return;
    const dt = new Date(Date.UTC(_calState.year, _calState.month + delta, 1));
    _calState.year = dt.getUTCFullYear();
    _calState.month = dt.getUTCMonth();
    renderAdminRekapCalendarGrid();
  }

  async function hydrateRowCalendarLogsIfMissing(row, dari, sampai) {
    if (row.logByDate && row.ketByDate) return row;
    try {
      const instId = getSelectedInstansiId();
      const instQ = instId ? `&instansi_id=${encodeURIComponent(instId)}` : '';
      const res = await fetch(`/api/log?dari=${encodeURIComponent(dari)}&sampai=${encodeURIComponent(sampai)}${instQ}`, {
        headers: authHeaders()
      });
      const json = await res.json();
      if (!res.ok || !json.ok) return row;
      const all = json.rows || json.data || [];
      const logByDate = {};
      const ketByDate = {};
      all.forEach((l) => {
        const sameNip = row.nip && String(l.NIP || l.nip || '') === String(row.nip);
        const sameId = row.id && String(l.ID || l.id || '') === String(row.id);
        if (!sameNip && !sameId) return;
        const t = String(l.Tanggal || l.tanggal || '').slice(0, 10);
        const jm = toMin(l.Jam || l.jam);
        if (!t) return;
        const j = String(l['Jenis Absen'] || l.jenis || '').toUpperCase().trim();
        if (j === 'MASUK' || j === 'DI LUAR JAM MASUK' || j === 'TERLAMBAT') {
          logByDate[t] ||= {};
          if (jm !== null && (logByDate[t].masuk === undefined || jm < logByDate[t].masuk)) logByDate[t].masuk = jm;
        } else if (j === 'PULANG' || j === 'DI LUAR JAM PULANG' || j === 'PULANG LUAR') {
          logByDate[t] ||= {};
          if (jm !== null && (logByDate[t].pulang === undefined || jm > logByDate[t].pulang)) logByDate[t].pulang = jm;
        } else if (/IZIN|SAKIT|TUGAS|DL|TUBEL|CUTI|TB|TANPA BERITA|ALPA/.test(j)) {
          ketByDate[t] = j === 'DL' ? 'TUGAS' : (j === 'TB' || j === 'TANPA BERITA' ? 'ALPA' : j);
        }
      });
      row.logByDate = logByDate;
      row.ketByDate = ketByDate;
    } catch (_) {}
    return row;
  }

  async function openAdminRekapCalendarModal(nipOrKey) {
    const list = (_rangePayload && Array.isArray(_rangePayload.data)) ? _rangePayload.data : [];
    const row = list.find((r, idx) =>
      String(r.nip || '') === String(nipOrKey)
      || String(r.id || '') === String(nipOrKey)
      || String(idx) === String(nipOrKey)
    );
    if (!row) return;

    const modal = ensureCalendarModalEl();
    const dari = _rangePayload?.dari || d.getElementById('adminRekapDari')?.value || todayWitaIso();
    const sampai = _rangePayload?.sampai || d.getElementById('adminRekapSampai')?.value || dari;
    const isMagang = getRoleFilterVal() === 'magang';

    const namaEl = d.getElementById('adminRekapCalNama');
    const subEl = d.getElementById('adminRekapCalSub');
    if (namaEl) namaEl.textContent = row.nama || '-';
    if (subEl) subEl.textContent = `${isMagang ? 'ID' : 'NIP'}. ${row.nip || '-'} • ${fmtIndo(dari)} s/d ${fmtIndo(sampai)}`;

    const startDt = new Date(dari + 'T00:00:00Z');
    _calState = {
      row,
      dari,
      sampai,
      year: isNaN(startDt.getTime()) ? new Date().getFullYear() : startDt.getUTCFullYear(),
      month: isNaN(startDt.getTime()) ? new Date().getMonth() : startDt.getUTCMonth(),
      selectedDate: dari
    };

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    renderAdminRekapCalendarGrid();
    selectAdminRekapCalendarDay(dari);

    if (!row.logByDate || !row.ketByDate) {
      await hydrateRowCalendarLogsIfMissing(row, dari, sampai);
      if (_calState && _calState.row === row) {
        renderAdminRekapCalendarGrid();
        selectAdminRekapCalendarDay(_calState.selectedDate || dari);
      }
    }
  }

  function closeAdminRekapCalendarModal() {
    const modal = d.getElementById('modalAdminRekapCalendar');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  /* ── PREVIEW DOKUMEN & PENGATURAN CETAK ─────────────────────────────── */
  function readPdfPrintOptions(payload) {
    const paper = String(d.getElementById('rekapOptPaper')?.value || 'f4').toLowerCase();
    const orientation = String(d.getElementById('rekapOptOrientation')?.value || 'p').toLowerCase().startsWith('l') ? 'l' : 'p';
    const fontSize = parseFloat(d.getElementById('rekapOptFontSize')?.value) || 7.5;
    const signerKey = d.getElementById('rekapOptSigner')?.value || '';
    const signer = (signerKey && _signersMap.get(signerKey)) || payload?.kepala || null;
    const kopInstansi = (d.getElementById('rekapKopInstansi')?.value || '').trim();
    const kopAlamat = (d.getElementById('rekapKopAlamat')?.value || '').trim();
    const kopOverride = (kopInstansi || kopAlamat)
      ? { instansi: kopInstansi || undefined, alamat: kopAlamat || undefined }
      : null;
    return {
      paper,
      orientation,
      fontSize,
      margin: 14,
      signer,
      kopOverride,
      isMagang: getRoleFilterVal() === 'magang'
    };
  }

  async function openAdminRekapPreview() {
    if (_mode === 'range' && !_rangePayload) await loadAdminRekapData();
    if (_mode === 'harian' && !_harianPayload) await loadAdminRekapData();

    const rows = getFilteredRows();
    if (!rows || rows.length === 0) {
      if (w.Swal) w.Swal.fire({ icon: 'warning', title: 'Data Kosong', text: 'Muat rekap terlebih dahulu.' });
      return;
    }

    const isHarian = (_mode === 'harian');
    w.lastRekapPegawai = rows.map(r => {
      const mapped = { ...r };
      if (isHarian) {
        const rawKet = String(r.ket || r.logKet || '').trim();
        const upperKet = rawKet.toUpperCase();
        mapped.tubel = /\bTUBEL\b/.test(upperKet) ? 1 : 0;
        mapped.cuti = /\bCUTI\b/.test(upperKet) ? 1 : 0;
        mapped.sakit = /\bSAKIT\b/.test(upperKet) ? 1 : 0;
        mapped.izin = /\bIZIN\b/.test(upperKet) ? 1 : 0;
        mapped.tugas = /\b(TUGAS|DL)\b/.test(upperKet) ? 1 : 0;
        mapped.lambat = Number(r.menit_terlambat || 0) > 0 ? 1 : 0;
        mapped.logKet = rawKet.replace(/^(TUBEL|CUTI|SAKIT|IZIN|TUGAS\/DL|TUGAS|DL|TB|HADIR|ALPA|ALPHA|—|-)\s*:?\s*/i, '').trim();
      } else {
        mapped.masuk = r.masuk ?? r.hadir ?? 0;
      }
      return mapped;
    });

    const dari = isHarian
      ? (d.getElementById('adminRekapTanggalHarian')?.value || todayWitaIso())
      : (_rangePayload?.dari || d.getElementById('adminRekapDari')?.value || todayWitaIso());
    const sampai = isHarian
      ? dari
      : (_rangePayload?.sampai || d.getElementById('adminRekapSampai')?.value || dari);
    const roleVal = d.getElementById('adminRekapRoleFilter')?.value || '';

    const elDari = d.getElementById('rekapDari');
    const elSampai = d.getElementById('rekapSampai');
    const elRole = d.getElementById('rekapRoleFilter');
    if (elDari) elDari.value = dari;
    if (elSampai) elSampai.value = sampai;
    if (elRole) elRole.value = roleVal;

    w.pdfPreviewContext = 'rekap';
    if (typeof w.openPdfPreviewModal === 'function') {
      w.openPdfPreviewModal();
    }
  }

  function closeAdminRekapPreview() {
    const modal = d.getElementById('modalAdminRekapPreview');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  async function buildPdfPayloadAndOpts(returnBase64 = false) {
    if (_mode === 'harian') {
      if (!_harianPayload) await loadAdminRekapData();
      const opts = { ...readPdfPrintOptions(_harianPayload), returnBase64 };
      const tanggal = _harianPayload?.tanggal || d.getElementById('adminRekapTanggalHarian')?.value || todayWitaIso();
      const payload = {
        ...(_harianPayload || {}),
        ok: true,
        tanggal,
        isMagang: opts.isMagang,
        data: getFilteredRows()
      };
      return { kind: 'harian', payload, opts, dari: tanggal, sampai: tanggal };
    }

    if (!_rangePayload) await loadAdminRekapData();
    const dari = _rangePayload?.dari || d.getElementById('adminRekapDari')?.value || todayWitaIso();
    const sampai = _rangePayload?.sampai || d.getElementById('adminRekapSampai')?.value || dari;
    if (dari === sampai) {
      const instId = getSelectedInstansiId();
      const instQ = instId ? `&instansi_id=${encodeURIComponent(instId)}` : '';
      const res = await fetch(`/api/stitch/rekap-harian?tanggal=${encodeURIComponent(dari)}${instQ}`, { headers: authHeaders() });
      const harianJson = await res.json();
      if (res.ok && harianJson.ok) {
        const opts = { ...readPdfPrintOptions(harianJson), returnBase64 };
        const filtered = applyRowFilters(harianJson.data || []);
        return { kind: 'harian', payload: { ...harianJson, isMagang: opts.isMagang, data: filtered }, opts, dari, sampai };
      }
    }
    const opts = { ...readPdfPrintOptions(_rangePayload), returnBase64 };
    const payload = {
      ...(_rangePayload || {}),
      ok: true,
      dari,
      sampai,
      isMagang: opts.isMagang,
      data: getFilteredRows()
    };
    return { kind: 'range', payload, opts, dari, sampai };
  }

  async function exportAdminRekapPDF() {
    const { kind, payload, opts } = await buildPdfPayloadAndOpts(false);
    if (kind === 'harian') {
      if (typeof w.exportHarianPDF === 'function') return w.exportHarianPDF(payload, opts);
    } else {
      if (typeof w.exportRekapRangePDF === 'function') return w.exportRekapRangePDF(payload, opts);
    }
    return null;
  }

  /* ── KIRIM REKAP PDF KE TELEGRAM ────────────────────────────────────── */
  async function sendAdminRekapToTelegram() {
    if (!w.Swal) return;
    if (_mode === 'range' && !_rangePayload) await loadAdminRekapData();
    if (_mode === 'harian' && !_harianPayload) await loadAdminRekapData();

    const rows = getFilteredRows();
    const dari = _mode === 'harian'
      ? (d.getElementById('adminRekapTanggalHarian')?.value || todayWitaIso())
      : (_rangePayload?.dari || d.getElementById('adminRekapDari')?.value || todayWitaIso());
    const sampai = _mode === 'harian'
      ? dari
      : (_rangePayload?.sampai || d.getElementById('adminRekapSampai')?.value || dari);
    const tanggalLabel = dari === sampai ? fmtIndoFull(dari) : `${fmtIndo(dari)} s.d. ${fmtIndo(sampai)}`;

    let savedChatId = '';
    try { savedChatId = localStorage.getItem('stitch_tg_chat_id') || ''; } catch (_) {}

    const promptRes = await w.Swal.fire({
      title: 'Kirim Rekap ke Telegram',
      text: `Periode ${tanggalLabel} (${rows.length} pegawai)`,
      input: 'text',
      inputLabel: 'Chat ID Telegram Tujuan',
      inputValue: savedChatId,
      inputPlaceholder: 'Contoh: -1001234567890 atau 123456789',
      showCancelButton: true,
      confirmButtonText: 'Kirim PDF ke Telegram',
      cancelButtonText: 'Batal',
      inputValidator: (v) => (!String(v || '').trim() ? 'Chat ID Telegram wajib diisi.' : null)
    });

    if (!promptRes.isConfirmed) return;
    const chatId = String(promptRes.value || '').trim();
    try { localStorage.setItem('stitch_tg_chat_id', chatId); } catch (_) {}

    w.Swal.fire({
      title: 'Menyiapkan & Mengirim PDF...',
      text: 'Membuat dokumen PDF resmi dengan kop dan paraf untuk dikirim ke Telegram.',
      allowOutsideClick: false,
      didOpen: () => w.Swal.showLoading()
    });

    try {
      const { kind, payload, opts } = await buildPdfPayloadAndOpts(true);
      let fileBase64 = null;
      if (kind === 'harian' && typeof w.exportHarianPDF === 'function') {
        fileBase64 = await w.exportHarianPDF(payload, opts);
      } else if (typeof w.exportRekapRangePDF === 'function') {
        fileBase64 = await w.exportRekapRangePDF(payload, opts);
      }
      if (!fileBase64) throw new Error('Gagal menghasilkan PDF untuk dikirim.');

      const instId = getSelectedInstansiId() || getUserMeta().instansiId || 'bapperida';
      const instName = opts.kopOverride?.instansi
        || _instansiMap[instId]?.nama_instansi
        || instId.toUpperCase();
      const fileName = dari === sampai
        ? `Daftar_Hadir_${dari}.pdf`
        : `Rekap_HADIR_${dari}_${sampai}.pdf`;

      const res = await fetch('/api/kirim-rekap', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          chat_id: chatId,
          dari,
          sampai,
          tanggal_label: tanggalLabel,
          instansi_id: instId,
          instansi_name: instName,
          file_base64: fileBase64,
          file_name: fileName,
          pegawai: rows
        })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || json.ok === false) {
        throw new Error((json && json.message) || `HTTP ${res.status}`);
      }
      await w.Swal.fire({
        icon: 'success',
        title: 'Terkirim ke Telegram',
        text: json.message || 'Dokumen rekap PDF berhasil dikirim ke Telegram.'
      });
    } catch (err) {
      await w.Swal.fire({
        icon: 'error',
        title: 'Gagal Mengirim Rekap',
        text: err.message || 'Terjadi kesalahan saat mengirim rekap ke Telegram.'
      });
    }
  }

  /* ── EKSPOR EXCEL (.XLSX) ───────────────────────────────────────────── */
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
    const kopInstansi = (d.getElementById('rekapKopInstansi')?.value || '').trim()
      || 'BADAN PERENCANAAN PEMBANGUNAN RISET DAN INOVASI DAERAH';
    let aoa = [];
    let sheetName = 'Rekap';
    let fileName = '';
    let cols = [];

    if (_mode === 'range') {
      const dari = _rangePayload?.dari || d.getElementById('adminRekapDari')?.value || todayWitaIso();
      const sampai = _rangePayload?.sampai || d.getElementById('adminRekapSampai')?.value || dari;
      const hkEfektif = _rangePayload?.hariKerja || 0;
      sheetName = 'Rekap_Kehadiran';
      fileName = `Rekap_Kehadiran_${dari}_sd_${sampai}.xlsx`;
      aoa = [
        ['PEMERINTAH KABUPATEN SUMBA BARAT'],
        [kopInstansi.toUpperCase()],
        [`REKAPITULASI KEHADIRAN PEGAWAI (${fmtIndo(dari)} s/d ${fmtIndo(sampai)})`],
        [],
        [
          'No', 'Nama Pegawai', 'NIP', 'Bidang', 'Jabatan', 'HK Efektif',
          'Hadir', 'Terlambat (m)', 'Pulang Cepat (m)', 'Izin', 'Sakit',
          'Tugas/DL', 'Cuti', 'Tubel', 'TB/Alpa', 'Akumulasi'
        ]
      ];
      rows.forEach((r, i) => {
        const mTelat = Number(r.menit_terlambat ?? r.menit_terlambat_periode ?? 0);
        const mCepat = Number(r.menit_lebih_awal ?? r.menit_lebih_awal_periode ?? 0);
        const mAlpa = (r.alpa || 0) * 450;
        aoa.push([
          i + 1,
          r.nama || '',
          r.nip || '-',
          r.bidang || r.Bidang || '-',
          r.jabatan || '-',
          hkEfektif,
          r.hadir ?? r.masuk ?? 0,
          mTelat,
          mCepat,
          r.izin || 0,
          r.sakit || 0,
          r.tugas || 0,
          r.cuti || 0,
          r.tubel || 0,
          r.alpa || 0,
          toHHMM(mTelat + mCepat + mAlpa)
        ]);
      });
      cols = [
        { wch: 5 }, { wch: 30 }, { wch: 22 }, { wch: 22 }, { wch: 26 }, { wch: 11 },
        { wch: 8 }, { wch: 14 }, { wch: 16 }, { wch: 8 }, { wch: 8 },
        { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 12 }
      ];
    } else if (_mode === 'logs') {
      const dari = d.getElementById('adminRekapDari')?.value || todayWitaIso();
      const sampai = d.getElementById('adminRekapSampai')?.value || dari;
      sheetName = 'Log_Presensi';
      fileName = `Log_Presensi_${dari}_sd_${sampai}.xlsx`;
      aoa = [
        ['PEMERINTAH KABUPATEN SUMBA BARAT'],
        [kopInstansi.toUpperCase()],
        [`LOG PRESENSI PEGAWAI (${fmtIndo(dari)} s/d ${fmtIndo(sampai)})`],
        [],
        ['No', 'Tanggal', 'Jam', 'Nama Pegawai', 'NIP', 'Jenis Absen', 'Lokasi', 'Keterangan']
      ];
      rows.forEach((r, i) => {
        aoa.push([
          i + 1,
          String(r.Tanggal || r.tanggal || '').slice(0, 10),
          r.Jam || r.jam || '-',
          r.Nama || r.nama || '-',
          r.NIP || r.nip || '-',
          r['Jenis Absen'] || r.jenis || '-',
          r.Lokasi || r.lokasi || '-',
          r.Ket || r.ket || '-'
        ]);
      });
      cols = [
        { wch: 5 }, { wch: 13 }, { wch: 10 }, { wch: 28 }, { wch: 22 }, { wch: 20 }, { wch: 24 }, { wch: 30 }
      ];
    } else {
      const tanggal = d.getElementById('adminRekapTanggalHarian')?.value || todayWitaIso();
      sheetName = 'Daftar_Hadir';
      fileName = `Daftar_Hadir_${tanggal}.xlsx`;
      aoa = [
        ['PEMERINTAH KABUPATEN SUMBA BARAT'],
        [kopInstansi.toUpperCase()],
        [`DAFTAR HADIR PEGAWAI (${fmtIndoFull(tanggal)})`],
        [],
        ['No', 'Nama Pegawai', 'NIP', 'Bidang', 'Jabatan', 'Jam Masuk', 'Jam Pulang', 'Status', 'Keterangan']
      ];
      rows.forEach((r, i) => {
        const hasM = Boolean(r.jamMasuk && r.jamMasuk !== '-' && r.jamMasuk !== '—');
        const ku = String(r.ket || '').toUpperCase();
        let status = 'TB';
        if (Number(r.tubel || 0) > 0 || ku.startsWith('TUBEL')) status = 'Tubel';
        else if (Number(r.cuti || 0) > 0 || ku.startsWith('CUTI')) status = 'Cuti';
        else if (Number(r.sakit || 0) > 0 || ku.startsWith('SAKIT')) status = 'Sakit';
        else if (Number(r.izin || 0) > 0 || ku.startsWith('IZIN')) status = 'Izin';
        else if (Number(r.tugas || 0) > 0 || ku.startsWith('TUGAS') || ku.startsWith('DL')) status = 'Tugas/DL';
        else if (hasM) status = 'Hadir';

        aoa.push([
          i + 1,
          r.nama || '',
          r.nip || '-',
          r.bidang || r.Bidang || '-',
          r.jabatan || '-',
          r.jamMasuk || '-',
          r.jamPulang || '-',
          status,
          r.ket || '-'
        ]);
      });
      cols = [
        { wch: 5 }, { wch: 30 }, { wch: 22 }, { wch: 22 }, { wch: 26 },
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 28 }
      ];
    }

    const ws = w.XLSX.utils.aoa_to_sheet(aoa);
    if (cols.length) ws['!cols'] = cols;
    const wb = w.XLSX.utils.book_new();
    w.XLSX.utils.book_append_sheet(wb, ws, sheetName);
    w.XLSX.writeFile(wb, fileName);
    if (typeof w.showDynamicIsland === 'function') {
      w.showDynamicIsland({ type: 'download', title: 'Excel (.xlsx) Diunduh', message: fileName });
    }
  }

  /* ── TAMBAH & EDIT LOG ABSEN (/api/log/add & /api/log/edit) ─────────── */
  function ensureLogJenisOptions() {
    const sel = d.getElementById('adminLogJenisSelect');
    if (!sel) return;
    const existing = new Set(Array.from(sel.options).map((o) => o.value));
    LOG_JENIS_OPTIONS.forEach((val) => {
      if (!existing.has(val)) {
        const opt = d.createElement('option');
        opt.value = val;
        opt.textContent = val === 'TUGAS' ? 'TUGAS / DINAS LUAR' : val;
        sel.appendChild(opt);
      }
    });
  }

  function _autoJenisLog() {
    const editId = d.getElementById('adminLogEditId')?.value || '';
    if (editId) return; // hanya auto-pilih saat menambah log baru
    const jam = d.getElementById('adminLogJam')?.value || '';
    const sel = d.getElementById('adminLogJenisSelect');
    if (!jam || !sel) return;
    const tot = toMin(jam);
    if (tot === null) return;

    ensureLogJenisOptions();
    let target = 'PULANG';
    if (tot <= 480) target = 'MASUK'; // <= 08:00
    else if (tot < 720) target = 'DI LUAR JAM MASUK'; // 08:01 - 11:59
    else if (tot < 870) target = 'DI LUAR JAM PULANG'; // 12:00 - 14:29
    else target = 'PULANG'; // >= 14:30

    sel.value = target;
    if (w.StitchPicker && typeof w.StitchPicker.refreshSelect === 'function') {
      w.StitchPicker.refreshSelect('adminLogJenisSelect');
    }
  }

  function ensureLogModalPickers() {
    ensureLogJenisOptions();
    if (_logModalInited) return;
    _logModalInited = true;
    if (w.StitchPicker) {
      w.StitchPicker.enhanceSelect('adminLogPegawaiSelect', { placeholder: 'Pilih pegawai...', searchable: true });
      w.StitchPicker.enhanceSelect('adminLogJenisSelect', { placeholder: 'Pilih jenis absen...', searchable: false });
      w.StitchPicker.enhanceDate('adminLogTanggal', { placeholder: 'Pilih tanggal' });
      w.StitchPicker.enhanceTime('adminLogJam', { minHour: 6, maxHour: 22, stepMin: 5 });
    }
    ['input', 'change'].forEach((evt) => {
      d.getElementById('adminLogJam')?.addEventListener(evt, _autoJenisLog);
    });
  }

  async function ensureUsersCache() {
    if (w.state && Array.isArray(w.state.allUsers) && w.state.allUsers.length) {
      _usersCache = w.state.allUsers;
      return _usersCache;
    }
    if (_usersCache.length) return _usersCache;
    try {
      const instId = getSelectedInstansiId();
      const instQ = instId ? `&instansi_id=${encodeURIComponent(instId)}` : '';
      const res = await fetch(`/api/user-list?format=full${instQ}`, { headers: authHeaders() });
      const json = await res.json();
      if (res.ok && json.ok) {
        _usersCache = json.data || json.rows || [];
      }
    } catch (_) {}
    if (!_usersCache.length) {
      const src = (_harianPayload?.data?.length ? _harianPayload.data : _rangePayload?.data) || [];
      _usersCache = src.filter((u) => u.id || u.ID);
    }
    return _usersCache;
  }

  async function populateLogPegawaiOptions() {
    const sel = d.getElementById('adminLogPegawaiSelect');
    if (!sel) return;
    const users = await ensureUsersCache();
    sel.innerHTML = users.map((u) => {
      const uid = u.id || u.ID || '';
      return `<option value="${esc(uid)}">${esc(u.nama || u.username || '-')} (${esc(u.nip || '-')})</option>`;
    }).join('');
    if (w.StitchPicker && typeof w.StitchPicker.refreshSelect === 'function') {
      w.StitchPicker.refreshSelect('adminLogPegawaiSelect');
    }
  }

  async function openAdminLogFormModal(logRecord = null, prefill = null) {
    ensureLogModalPickers();
    await populateLogPegawaiOptions();

    const modal = d.getElementById('modalAdminLogForm');
    const titleEl = d.getElementById('adminLogModalTitle');
    const editIdEl = d.getElementById('adminLogEditId');
    const pegWrap = d.getElementById('adminLogPegawaiWrap');
    const pegRo = d.getElementById('adminLogPegawaiReadonly');
    const roNama = d.getElementById('adminLogReadonlyNama');
    const roNip = d.getElementById('adminLogReadonlyNip');
    const pegSel = d.getElementById('adminLogPegawaiSelect');
    const tglEl = d.getElementById('adminLogTanggal');
    const jamEl = d.getElementById('adminLogJam');
    const jenisEl = d.getElementById('adminLogJenisSelect');
    const ketEl = d.getElementById('adminLogKet');
    const btnTxt = d.getElementById('btnSubmitAdminLogText');

    const editId = logRecord ? getLogId(logRecord) : '';
    if (logRecord && editId) {
      if (titleEl) titleEl.textContent = 'Edit Log Kehadiran';
      if (btnTxt) btnTxt.textContent = 'Simpan Perubahan';
      if (editIdEl) editIdEl.value = editId;
      if (pegWrap) pegWrap.classList.add('hidden');
      if (pegRo) pegRo.classList.remove('hidden');
      if (roNama) roNama.textContent = logRecord.Nama || logRecord.nama || '-';
      if (roNip) roNip.textContent = 'NIP. ' + (logRecord.NIP || logRecord.nip || '-');
      if (tglEl) tglEl.value = String(logRecord.Tanggal || logRecord.tanggal || '').slice(0, 10) || todayWitaIso();
      if (jamEl) jamEl.value = String(logRecord.Jam || logRecord.jam || '07:30').slice(0, 5);
      if (jenisEl) jenisEl.value = logRecord['Jenis Absen'] || logRecord.Jenis_Absen || logRecord.jenis || 'MASUK';
      if (ketEl) ketEl.value = logRecord.Ket || logRecord.ket || '';
    } else {
      if (titleEl) titleEl.textContent = 'Tambah Log Kehadiran';
      if (btnTxt) btnTxt.textContent = 'Simpan Log Baru';
      if (editIdEl) editIdEl.value = '';
      if (pegWrap) pegWrap.classList.remove('hidden');
      if (pegRo) pegRo.classList.add('hidden');

      const pId = prefill?.id || logRecord?.ID || logRecord?.id || '';
      if (pegSel && pId) {
        if (!Array.from(pegSel.options).some((o) => o.value === String(pId))) {
          const opt = d.createElement('option');
          opt.value = String(pId);
          opt.textContent = `${prefill?.nama || '-'} (${prefill?.nip || '-'})`;
          pegSel.appendChild(opt);
        }
        pegSel.value = String(pId);
      }
      if (tglEl) tglEl.value = prefill?.tanggal || todayWitaIso();
      const defJam = prefill?.jam || (prefill?.hintJenis === 'PULANG' ? '14:30' : '07:15');
      if (jamEl) jamEl.value = defJam;
      if (jenisEl) jenisEl.value = prefill?.jenis || prefill?.hintJenis || 'MASUK';
      if (ketEl) ketEl.value = prefill?.ket || '';
      _autoJenisLog();
    }

    if (w.StitchPicker && typeof w.StitchPicker.refreshAll === 'function') {
      w.StitchPicker.refreshAll();
    }
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  }

  async function openAdminLogQuickForEmployee(rowOrKey, hintJenis = 'MASUK') {
    const list = (_harianPayload && Array.isArray(_harianPayload.data)) ? _harianPayload.data : [];
    const row = (rowOrKey && typeof rowOrKey === 'object')
      ? rowOrKey
      : list.find((r, idx) =>
        String(r.nip || '') === String(rowOrKey)
        || String(r.id || '') === String(rowOrKey)
        || String(idx) === String(rowOrKey)
      );
    if (!row) return;

    const tanggal = _harianPayload?.tanggal || d.getElementById('adminRekapTanggalHarian')?.value || todayWitaIso();
    const isPulang = String(hintJenis || 'MASUK').toUpperCase().includes('PULANG');

    const users = await ensureUsersCache();
    let empId = row.id || row.ID || row.telegram_id || '';
    if (!empId && row.nip) {
      const matchedUser = users.find((u) => String(u.nip || u.NIP || '') === String(row.nip));
      if (matchedUser) empId = matchedUser.id || matchedUser.ID || '';
    }

    let existing = isPulang ? (row.raw_pulang_log || row._rawPulangLog) : (row.raw_masuk_log || row._rawMasukLog);
    if (!existing) {
      const explicitLogId = isPulang
        ? (row.pulang_id_log || row.id_log_pulang)
        : (row.masuk_id_log || row.id_log_masuk);
      const jamExisting = isPulang ? row.jamPulang : row.jamMasuk;
      if (explicitLogId) {
        existing = {
          ID_Log: explicitLogId,
          ID: empId,
          Nama: row.nama,
          NIP: row.nip,
          Tanggal: tanggal,
          Jam: String(jamExisting || '').slice(0, 5),
          'Jenis Absen': isPulang ? (row.jenisPulang || 'PULANG') : (row.jenisMasuk || 'MASUK'),
          Ket: row.ket || ''
        };
      }
    }

    if (existing && getLogId(existing)) {
      return openAdminLogFormModal({
        ...existing,
        Nama: existing.Nama || row.nama,
        NIP: existing.NIP || row.nip,
        Tanggal: existing.Tanggal || tanggal
      });
    }

    return openAdminLogFormModal(null, {
      id: empId,
      nama: row.nama,
      nip: row.nip,
      tanggal,
      hintJenis: isPulang ? 'PULANG' : 'MASUK',
      jam: isPulang ? '14:30' : '07:15'
    });
  }

  function openAdminLogEditById(logId) {
    const rec = _logsList.find((r) => getLogId(r) === String(logId));
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
      const headers = authHeaders({ 'Content-Type': 'application/json' });
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

      const stitchPinIcon = w.L.divIcon({
        className: 'stitch-geo-pin',
        html: '<div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 4px 6px rgba(15,23,42,0.35));"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#2563eb" stroke="#ffffff" stroke-width="1.8"/><circle cx="12" cy="9" r="2.8" fill="#ffffff"/></svg></div>',
        iconSize: [32, 32],
        iconAnchor: [16, 30]
      });
      _geoMarker = w.L.marker([lat, lon], { draggable: true, icon: stitchPinIcon }).addTo(_geoMap);
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

  /* ── EKSPOR KE GLOBAL WINDOW ────────────────────────────────────────── */
  w.initAdminRekapPanel = initAdminRekapPanel;
  w.setAdminRekapMode = setAdminRekapMode;
  w.setAdminRekapPreset = setAdminRekapPreset;
  w.loadAdminRekapData = loadAdminRekapData;
  w.filterAdminRekapList = filterAdminRekapList;
  w.openAdminRekapPreview = openAdminRekapPreview;
  w.closeAdminRekapPreview = closeAdminRekapPreview;
  w.exportAdminRekapPDF = exportAdminRekapPDF;
  w.exportAdminRekapXLSX = exportAdminRekapXLSX;
  w.sendAdminRekapToTelegram = sendAdminRekapToTelegram;
  w.openAdminRekapCalendarModal = openAdminRekapCalendarModal;
  w.closeAdminRekapCalendarModal = closeAdminRekapCalendarModal;
  w.shiftAdminRekapCalendarMonth = shiftAdminRekapCalendarMonth;
  w.selectAdminRekapCalendarDay = selectAdminRekapCalendarDay;
  w.openAdminLogFormModal = openAdminLogFormModal;
  w.openAdminLogQuickForEmployee = openAdminLogQuickForEmployee;
  w.openAdminLogEditById = openAdminLogEditById;
  w.closeAdminLogFormModal = closeAdminLogFormModal;
  w.submitAdminLogForm = submitAdminLogForm;
  w._autoJenisLog = _autoJenisLog;
  w.initAdminGeofenceMap = initAdminGeofenceMap;
  w.updateAdminGeofenceMap = updateAdminGeofenceMap;
  w.setAdminMapLayer = setAdminMapLayer;
  w.useMyGpsForAdminMap = useMyGpsForAdminMap;
})(window, document);
