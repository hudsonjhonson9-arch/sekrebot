/* ════ SESSION AUTHENTICATION ════ */
// Session token disimpan di memory (window._session), bukan localStorage.
// Di-set setelah biometric login berhasil, expired dalam 24 jam.
// Server validasi tiap request via auth_sessions table.

/* ════ SECURITY UTILS ════ */
// ponytail: single escapeHtml, apply di semua innerHTML/onclick injection
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function requireAdmin() {
  const role = (window._session?.role || '').toLowerCase();
  if (!role.includes('admin') && !role.includes('super') && !role.includes('kepala') && !role.includes('sekretaris') && !role.includes('kabid')) {
    alert('Akses ditolak: hanya admin');
    return false;
  }
  return true;
}

/* ════ OFFLINE STORAGE (INDEXEDDB) ════ */
const DB_NAME = 'AbsensiOfflineDB';
const DB_VERSION = 1;

const idb = {
  db: null,
  async init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('offline_queue')) {
          db.createObjectStore('offline_queue', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('master_data')) {
          db.createObjectStore('master_data', { keyPath: 'key' });
        }
      };
      req.onsuccess = (e) => { this.db = e.target.result; resolve(); };
      req.onerror = reject;
    });
  },
  async set(storeName, val) {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(val);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) { resolve(false); }
    });
  },
  async get(storeName, key) {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  },
  async getAll(storeName) {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      try {
        const req = this.db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve([]);
      } catch (e) { resolve([]); }
    });
  },
  async delete(storeName, key) {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      try {
        const req = this.db.transaction(storeName, 'readwrite').objectStore(storeName).delete(key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch (e) { resolve(false); }
    });
  }
};
idb.init();

/* ════ KONFIGURASI N8N ════ */
const SERVER_1 = 'https://mindcloud.my.id';
const SERVER_2 = 'https://n8n-sp8dtwslkxal.jkt3.sumopod.my.id';
const isTest = false;
let ADMIN_NIPS = [];
let MANDATORY_FACE_NIPS = [];
window._adminRoleMap = {};
let REKAP_CHAT_ID = null;

/* ════ KONFIGURASI JARINGAN WIFI KANTOR ════ */
const WIFI_CHECK_ENABLED = true;
const WIFI_MODE = 'block';

/* ════ SESSION MANAGEMENT (localStorage-backed) ════ */
// localStorage: persist across tab close / WebView restart.
// Token tetap aman karena hanya disimpan di device yang login.
window._session = {
  token: null,
  nip: null,
  role: 'USER',
  instansi_id: '',
  isLoggedIn: false,
};

// Restore session dari localStorage on page load
(function restoreSession() {
  try {
    const t = localStorage.getItem('_sess_token');
    console.log('[Session] Restore:', { hasToken: !!t, tokenLen: t?.length || 0 });
    if (t) {
      window._session.token = t;
      window._session.nip = localStorage.getItem('_sess_nip') || '';
      window._session.role = localStorage.getItem('_sess_role') || 'USER';
      window._session.instansi_id = localStorage.getItem('_sess_inst') || '';
      window._session.isLoggedIn = true;
    }
  } catch (_) {}
})();

function setSession(token, data) {
  window._session.token = token;
  window._session.nip = data.nip || '';
  window._session.role = (data.role || 'USER').toUpperCase();
  window._session.instansi_id = data.instansi_id || '';
  window._session.isLoggedIn = true;
  try {
    localStorage.setItem('_sess_token', token);
    localStorage.setItem('_sess_nip', data.nip || '');
    localStorage.setItem('_sess_role', (data.role || 'USER').toUpperCase());
    localStorage.setItem('_sess_inst', data.instansi_id || '');
  } catch (_) {}
  // QR pending: proses setelah login
  setTimeout(() => {
    const qr = localStorage.getItem('simapo_qr_pending');
    if (qr && typeof processQR === 'function') {
      localStorage.removeItem('simapo_qr_pending');
      processQR(qr);
    }
  }, 500);
}

function clearSession() {
  window._session.token = null;
  window._session.nip = null;
  window._session.role = 'USER';
  window._session.instansi_id = '';
  window._session.isLoggedIn = false;
  try {
    localStorage.removeItem('_sess_token');
    localStorage.removeItem('_sess_nip');
    localStorage.removeItem('_sess_role');
    localStorage.removeItem('_sess_inst');
  } catch (_) {}
}

function _getSessionRole() {
  return window._session.isLoggedIn ? window._session.role : (localStorage.getItem('MY_ROLE') || 'USER');
}

function _isSuperAdmin() {
  if (window._session.isLoggedIn) return window._session.role.includes('SUPER');
  // Fallback for backward compat during migration
  return (localStorage.getItem('MY_ROLE') || '').toLowerCase().includes('super');
}

/* ════ ENDPOINT PATHS ════ */
const P = {
  sessionLogin: isTest ? '/webhook-test/session-login' : '/webhook/session-login',
  instansiList: isTest ? '/webhook-test/instansi-list' : '/webhook/instansi-list',
  instansiUpdate: isTest ? '/webhook-test/instansi-update' : '/webhook/instansi-update',
  bidangList: isTest ? '/webhook-test/bidang-list' : '/webhook/bidang-list',
  absen: isTest ? '/webhook-test/absen' : '/webhook/absen',
  ket: isTest ? '/webhook-test/keterangan' : '/webhook/keterangan',
  log: isTest ? '/webhook-test/log-absen' : '/webhook/log-absen',
  rekap: isTest ? '/webhook-test/rekap-absen' : '/webhook/rekap-absen',
  userList: isTest ? '/webhook-test/user-list' : '/webhook/user-list',
  updateStatus: isTest ? '/webhook-test/update-status' : '/webhook/update-status',
  lokasiList: isTest ? '/webhook-test/lokasi-list' : '/webhook/lokasi-list',
  lokasiAdd: isTest ? '/webhook-test/lokasi-add' : '/webhook/lokasi-add',
  lokasiDel: isTest ? '/webhook-test/lokasi-delete' : '/webhook/lokasi-delete',
  lokasiUpdate: isTest ? '/webhook-test/lokasi-update' : '/webhook/lokasi-update',
  dokumenList: isTest ? '/webhook-test/dokumen-list' : '/webhook/dokumen-list',
  jamAbsen: isTest ? '/webhook-test/jam-absen' : '/webhook/jam-absen',
  kontrolAbsen: isTest ? '/webhook-test/kontrol-absen' : '/webhook/kontrol-absen',
  kirimRekap: isTest ? '/webhook-test/kirim-rekap' : '/webhook/kirim-rekap',
  ketList: isTest ? '/webhook-test/ket-list' : '/webhook/ket-list',
  ketEdit: isTest ? '/webhook-test/ket-edit' : '/webhook/ket-edit',
  ketDelete: isTest ? '/webhook-test/ket-delete' : '/webhook/ket-delete',
  ketApprove: isTest ? '/webhook-test/ket-approve' : '/webhook/ket-approve',
  liburList: isTest ? '/webhook-test/libur-list' : '/webhook/libur-list',
  liburAdd: isTest ? '/webhook-test/libur-add' : '/webhook/libur-add',
  liburDel: isTest ? '/webhook-test/libur-delete' : '/webhook/libur-delete',
  dokumenAdd: isTest ? '/webhook-test/dokumen-add' : '/webhook/dokumen-add',
  dokumenDel: isTest ? '/webhook-test/dokumen-delete' : '/webhook/dokumen-delete',
  dokumenGet: isTest ? '/webhook-test/dokumen-get' : '/webhook/dokumen-get',
  faceRegister: isTest ? '/webhook-test/face-register' : '/webhook/face-register',
  faceGet: isTest ? '/webhook-test/face-get' : '/webhook/face-get',
  faceToggle: isTest ? '/webhook-test/face-toggle' : '/webhook/face-toggle',
  faceGetAll: isTest ? '/webhook-test/face-get-all' : '/webhook/face-get-all',
  faceSettings: isTest ? '/webhook-test/face-settings' : '/webhook/face-settings',
  mejaAbsen: isTest ? '/webhook-test/meja-absen' : '/webhook/meja-absen',
  jamPeriodeList: isTest ? '/webhook-test/jam-periode-list' : '/webhook/jam-periode-list',
  jamPeriodeAdd: isTest ? '/webhook-test/jam-periode-add' : '/webhook/jam-periode-add',
  jamPeriodeDel: isTest ? '/webhook-test/jam-periode-delete' : '/webhook/jam-periode-delete',
  adminList: isTest ? '/webhook-test/admin-list' : '/webhook/admin-list',
  adminAdd: isTest ? '/webhook-test/admin-add' : '/webhook/admin-add',
  adminDel: isTest ? '/webhook-test/admin-delete' : '/webhook/admin-delete',
  userAdd: isTest ? '/webhook-test/user-add' : '/webhook/user-add',
  userEdit: isTest ? '/webhook-test/user-edit' : '/webhook/user-edit',
  penugasanList: isTest ? '/webhook-test/penugasan-list' : '/webhook/penugasan-list',
  penugasanSave: isTest ? '/webhook-test/penugasan-save' : '/webhook/penugasan-save',
  userDel: isTest ? '/webhook-test/user-delete' : '/webhook/user-delete',
  logAdd: isTest ? '/webhook-test/log-add' : '/webhook/log-add',
  logEdit: isTest ? '/webhook-test/log-edit' : '/webhook/log-edit',
  signatureSave: isTest ? '/webhook-test/signature-save' : '/webhook/signature-save',
  signatureGet: isTest ? '/webhook-test/signature-get' : '/webhook/signature-get',
  signatureList: isTest ? '/webhook-test/signature-list' : '/webhook/signature-list',
  keteranganAdd: isTest ? '/webhook-test/keterangan' : '/webhook/keterangan',
  tugasAdd: isTest ? '/webhook-test/tugas-add' : '/webhook/tugas-add',
  tugasList: isTest ? '/webhook-test/tugas-list' : '/webhook/tugas-list',
  lemburGet: isTest ? '/webhook-test/lembur-get' : '/webhook/lembur-get',
  simapoKatalog: isTest ? '/webhook-test/simapo-katalog' : '/webhook/simapo-katalog',
  simapoPinjam: isTest ? '/webhook-test/simapo-pinjam' : '/webhook/simapo-pinjam',
  simapoPinjamList: isTest ? '/webhook-test/simapo-pinjam-list' : '/webhook/simapo-pinjam-list',
  simapoTiket: isTest ? '/webhook-test/simapo-tiket' : '/webhook/simapo-tiket',
  simapoAdminPinjamList: isTest ? '/webhook-test/simapo-admin-pinjam-list' : '/webhook/simapo-admin-pinjam-list',
  simapoAdminPinjamAction: isTest ? '/webhook-test/simapo-admin-pinjam-action' : '/webhook/simapo-admin-pinjam-action',
  simapoAdminTiketList: isTest ? '/webhook-test/simapo-admin-tiket-list' : '/webhook/simapo-admin-tiket-list',
  simapoAdminTiketAction: isTest ? '/webhook-test/simapo-admin-tiket-action' : '/webhook/simapo-admin-tiket-action',
  simapoAdminMasterList: isTest ? '/webhook-test/simapo-admin-master-list' : '/webhook/simapo-admin-master-list',
  simapoAdminMasterSave: isTest ? '/webhook-test/simapo-admin-master-save' : '/webhook/simapo-admin-master-save',
  simapoAdminMasterDel: isTest ? '/webhook-test/simapo-admin-master-delete' : '/webhook/simapo-admin-master-delete',
  simapoMutasiSave: isTest ? '/webhook-test/simapo-mutasi-save' : '/webhook/simapo-mutasi-save',
  simapoMutasiList: isTest ? '/webhook-test/simapo-mutasi-list' : '/webhook/simapo-mutasi-list',
  simapoOpnameSave: isTest ? '/webhook-test/simapo-opname-save' : '/webhook/simapo-opname-save',
  simapoKategoriList: isTest ? '/webhook-test/simapo-kategori-list' : '/webhook/simapo-kategori-list',
  simapoKategoriSave: isTest ? '/webhook-test/simapo-kategori-save' : '/webhook/simapo-kategori-save',
  simapoKategoriDel: isTest ? '/webhook-test/simapo-kategori-delete' : '/webhook/simapo-kategori-delete',
  simapoUnitByQR: isTest ? '/webhook-test/simapo-unit-by-qr' : '/webhook/simapo-unit-by-qr',
  simapoQRUpdate: isTest ? '/webhook-test/simapo-qr-update' : '/webhook/simapo-qr-update',
  simapoUnitList: isTest ? '/webhook-test/simapo-unit-list' : '/webhook/simapo-unit-list',
  simapoQRPinjam: isTest ? '/webhook-test/simapo-qr-pinjam' : '/webhook/simapo-qr-pinjam',
  simapoPenerimaanList: isTest ? '/webhook-test/simapo-penerimaan-get' : '/webhook/simapo-penerimaan-get',
  simapoPenerimaanSave: isTest ? '/webhook-test/simapo-penerimaan' : '/webhook/simapo-penerimaan',
  simapoPemeliharaanList: isTest ? '/webhook-test/simapo-pemeliharaan' : '/webhook/simapo-pemeliharaan',
  simapoPemeliharaanSave: isTest ? '/webhook-test/simapo-pemeliharaan-post' : '/webhook/simapo-pemeliharaan-post',
  simapoBKUList: isTest ? '/webhook-test/simapo-bku-list' : '/webhook/simapo-bku-list',
  simapoBKUSave: isTest ? '/webhook-test/simapo-bku' : '/webhook/simapo-bku',
  simapoStandarHargaList: isTest ? '/webhook-test/simapo-standar-harga-list' : '/webhook/simapo-standar-harga-list',
  simapoStandarHargaSave: isTest ? '/webhook-test/simapo-standar-harga-save' : '/webhook/simapo-standar-harga-save',
  lemburSave: isTest ? '/webhook-test/lembur-save' : '/webhook/lembur-save',
  lemburArchiveList: isTest ? '/webhook-test/lembur-archive-list' : '/webhook/lembur-archive-list',
  lemburArchiveDelete: isTest ? '/webhook-test/lembur-archive-delete' : '/webhook/lembur-archive-delete',
  gpsTrack: isTest ? '/webhook-test/gps-track' : '/webhook/gps-track',
  pksList: isTest ? '/webhook-test/simapo-pks-list' : '/webhook/simapo-pks-list',
  pksSave: isTest ? '/webhook-test/simapo-pks-save' : '/webhook/simapo-pks-save',
  pksDelete: isTest ? '/webhook-test/simapo-pks-delete' : '/webhook/simapo-pks-delete',
};

function getScopedInstansiId() {
  const p = window.userProfile || {};
  const myNip = p.nip || localStorage.getItem('MY_NIP');
  const isSA = _isSuperAdmin();

  const currentTab = localStorage.getItem('absen_last_tab') || 'absen';
  if (isSA) {
    if (currentTab === 'rekap') {
      const rekapSelect = document.getElementById('rekapInstansiSelect');
      if (rekapSelect && rekapSelect.value) return rekapSelect.value;
    } else if (currentTab === 'admin') {
      const activeAdminSect = localStorage.getItem('absen_last_admin_section') || 'ops';
      if (activeAdminSect === 'user') {
        const pegawaiSelect = document.getElementById('pegawaiInstansiSelect');
        if (pegawaiSelect && pegawaiSelect.value) return pegawaiSelect.value;
      } else if (activeAdminSect === 'ops') {
        const adminKetSelect = document.getElementById('adminKetInstansiSelect');
        if (adminKetSelect && adminKetSelect.value) return adminKetSelect.value;
      }
      const adminSelect = document.getElementById('inEditInstansiSelect') || document.getElementById('adminInstansiSelect');
      if (adminSelect && adminSelect.value) return adminSelect.value;
    } else if (currentTab === 'tugas') {
      const tugasSelect = document.getElementById('tugasInstansiSelect');
      if (tugasSelect && tugasSelect.value) return tugasSelect.value;
    } else if (currentTab === 'simapo') {
      const simapoSelect = document.getElementById('simapoInstansiSelect');
      if (simapoSelect && simapoSelect.value) return simapoSelect.value;
    }
  }

  if (isSA) {
    const savedInst = localStorage.getItem('MY_INSTANSI');
    if (savedInst) return savedInst;
  }

  const urlParams = new URLSearchParams(window.location.search);
  let inst = urlParams.get('instansi') || urlParams.get('instansi_id');
  if (inst) return inst;

  if (window.userProfile?.instansi_id) return window.userProfile.instansi_id;

  const savedInst = localStorage.getItem('MY_INSTANSI');
  if (savedInst) return savedInst;

  try {
    const u = JSON.parse(localStorage.getItem('tg_user_obj_v5') || '{}');
    const uInst = u.instansi_id || u.Instansi_Id;
    if (uInst) return uInst;
  } catch (e) { }

  return '';
}

// ── API Fetch dengan Session Token ──
async function generateSignature(payloadString) {
  const encoder = new TextEncoder();
  const data = encoder.encode(payloadString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const HDR = {
  'Content-Type': 'application/json',
  'ngrok-skip-browser-warning': 'true',
  'Accept': 'application/json',
};
async function apiFetch(path, opts = {}) {
  path += (path.includes('?') ? '&' : '?') + '_t=' + Date.now();

  const p = window.userProfile || {};
  const myNip = p.nip || localStorage.getItem('MY_NIP');
  const isSA = _isSuperAdmin();
  const inst = getScopedInstansiId();

  if (inst && !path.includes('instansi_id=') && !path.includes('log-absen')) {
    path += '&instansi_id=' + inst;
  }

  if (myNip && !path.includes('nip=')) {
    const isAdminOrSA = isSA || (localStorage.getItem('MY_ROLE') || '').toLowerCase().includes('admin') || (p.role || '').toLowerCase().includes('admin') || !!window.IS_ADMIN;
    if (!isAdminOrSA) {
      path += (path.includes('?') ? '&' : '?') + 'nip=' + encodeURIComponent(myNip);
    }
  }

  for (const base of [SERVER_1, SERVER_2]) {
    try {
      console.log(`[Fetch] -> ${base}${path}`);
      const fetchOpts = { ...opts };

      let finalHeaders = { ...HDR };
      if (window._session?.token) {
        finalHeaders['Authorization'] = 'Bearer ' + window._session.token;
      }

      fetchOpts.headers = { ...finalHeaders, ...(opts.headers || {}) };

      if (opts.method === 'GET' || !opts.body) {
        delete fetchOpts.headers['Content-Type'];
      }

      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 15000);

      try {
        const r = await fetch(base + path, { ...fetchOpts, signal: ctrl.signal });
        clearTimeout(tid);

        if (r.status === 401) {
          console.warn(`[Fetch] 401 from ${base}${path} — session may be invalid`);
          // ponytail: don't wipe session on every 401 — only on explicit logout or identity calls.
          // n8n Security Gates may return 401 for data endpoints while session is still valid locally.
          return { ok: false, status: 401, data: null, rows: [] };
        }

        if (r.ok || (r.status >= 400 && r.status < 500)) {
          console.log(`[Fetch] Success: ${base}${path}`);

          const originalJson = r.json.bind(r);
          r.json = async () => {
            const text = await r.text();
            if (!text || text.trim() === '') return { data: [], message: 'Empty N8n Response' };
            try { return JSON.parse(text); } catch(e) { return { data: [], message: text }; }
          };

          return r;
        }
        throw new Error(`HTTP ${r.status}`);
      } catch (e) {
        clearTimeout(tid);
        throw e;
      }
    } catch (e) {
      console.warn(`[Fetch Fallback] ${base}${path}:`, e.message);
    }
  }
  throw new Error(`Semua server offline/error.`);
}

/* ════ API RESPONSE PARSER ════ */
function parseApiResponse(json) {
  if (!json) return [];
  if (Array.isArray(json) && json.length === 1 && Array.isArray(json[0]?.data)) return json[0].data;
  if (!Array.isArray(json) && Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json) && json.length === 1 && Array.isArray(json[0])) return json[0];
  if (Array.isArray(json)) return json;
  if (typeof json === 'object' && (json.id || json.ID || json.telegram_id)) return [json];
  return [];
}
