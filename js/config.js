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
const SERVER_1 = ''; // native Express is same-origin
const SERVER_2 = ''; // legacy n8n disabled: native Express is the only API backend
const isTest = false;

/* ════ API NATIVE (Express, backend sendiri) ════ */
// Kosong = path relatif, jadi request dikirim ke origin yang sama dengan halaman ini.
// Syaratnya: reverse proxy meneruskan /api/* ke Express. Tanpa itu akan 404.
// ponytail: kalau Express pindah ke origin lain, isi API_BASE dengan URL-nya
// (mis. 'https://api.domain.kamu') DAN tambahkan CORS di server/index.js.
const API_BASE = '';
// Sesi native diterbitkan oleh /api/auth/session dari init_data Telegram, format
// 192 hex. Berbeda dari token legacy n8n, jadi disimpan terpisah supaya ~50
// endpoint n8n yang masih berjalan tidak ikut menerima bearer yang tak dikenal.
let _nativeToken = null;
let _deviceToken = null;
let _authExpiredShown = false;
try {
  _nativeToken = localStorage.getItem('_native_token');
  _deviceToken = localStorage.getItem('_device_token');
} catch { /* mode privat */ }

// Endpoint native mewajibkan init_data Telegram di setiap request (server/absen.js)
// dan sesi dari /api/auth/session. Pemakai yang tidak punya init_data - Meja Absen
// di perangkat bersama, dan pengguna Capacitor yang membuka di luar Telegram -
// belum bisa ke native, jadi mereka tetap jalur n8n sampai auth non-Telegram selesai.
// ponytail: hapus peta ini begitu auth non-Telegram tersedia; jangan dibiarkan
// diam-diam, setiap fallback dilog loudly di bawah.
const NATIVE_TO_LEGACY = {};

const BAST_API_KEY = 'ogsbIpBCCzi3yndE85JkxFmPJeECw_5u';
const BAST_API_HEADER = 'x-bast-key';
// ponytail: sentinel gate/guard n8n (200 + body kosong) — dipakai apiFetch DI sini dan dicek di bastSubmit, jangan disalin jadi string lain.
const EMPTY_N8N_RESPONSE = 'Empty N8n Response';
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

// Sesi native: tukar init_data Telegram jadi bearer 192 hex milik Express.
// Tidak ada kredensial yang di-hardcode di sini; init_data sudah ditandatangani
// Telegram lalu diverifikasi ulang di server lewat HMAC bot token.
async function ensureNativeSession() {
  if (_nativeToken) return _nativeToken;
  // Meja Absen/perangkat bersama memakai token dv_ yang diterbitkan SUPERADMIN
  // lewat /api/auth/devices. Token hanya disimpan di perangkat, bukan di source.
  if (_deviceToken && /^dv_[0-9a-f]{64}$/.test(_deviceToken)) return _deviceToken;
  const initData = window.tg?.initData || window.Telegram?.WebApp?.initData || '';
  console.info('[Native] init_data Telegram, panjang:', initData.length);
  if (!initData) {
    console.warn('[Native] Tidak ada init_data Telegram. Endpoint /api/* akan 401.');
    console.warn('[Native] Halaman ini dibuka di luar Mini App, atau_user_list belum punya id yang cocok.');
    return null;
  }
  try {
    const r = await fetch(API_BASE + '/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ init_data: initData }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.warn('[Native] Sesi tidak terbit:', r.status, d.message);
      return null;
    }
    _nativeToken = d.session_token || null;
    if (_nativeToken) {
      try { localStorage.setItem('_native_token', _nativeToken); } catch { /* mode privat: token tetap hidup di memori */ }
      console.log('[Native] Sesi terbit, panjang', _nativeToken.length, 'hex');
    }
    return _nativeToken;
  } catch (e) {
    console.warn('[Native] Gagal memanggil /api/auth/session:', e.message);
    return null;
  }
}

function setSession(token, data) {
  window._session.token = token;
  window._session.nip = data.nip || '';
  window._session.role = (data.role || 'USER').toUpperCase();
  window._session.instansi_id = data.instansi_id || '';
  window._session.isLoggedIn = true;
  _authExpiredShown = false;
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

// Sesi web/NIP: token 192 hex dari /api/auth/login disimpan sebagai _native_token
// supaya nativeFetch memakainya, dan di localStorage supaya bertahan reload.
function setNativeToken(token) {
  _nativeToken = token;
  _authExpiredShown = false;
  try { localStorage.setItem('_native_token', token); } catch { /* mode privat */ }
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
  sessionLogin: '/api/auth/session',
  webLogin: '/api/auth/login',
  instansiList: '/api/instansi-list',
  instansiUpdate: '/api/instansi-update',
  bidangList: '/api/bidang-list',
  absen: '/api/absen',
  ket: '/api/keterangan',
  log: '/api/log',
  rekap: '/api/rekap-absen',
  userList: '/api/user-list',
  updateStatus: '/api/update-status',
  lokasiList: '/api/lokasi-list',
  lokasiAdd: '/api/lokasi-add',
  lokasiDel: '/api/lokasi-delete',
  lokasiUpdate: '/api/lokasi-update',
  dokumenList: '/api/dokumen',
  jamAbsen: '/api/jam-absen',
  kontrolAbsen: '/api/kontrol-absen',
  kirimRekap: '/api/kirim-rekap',
  ketList: '/api/keterangan',
  ketEdit: '/api/keterangan/edit',
  ketDelete: '/api/keterangan/delete',
  ketApprove: '/api/keterangan/approve',
  liburList: '/api/libur-list',
  liburAdd: '/api/libur-add',
  liburDel: '/api/libur-delete',
  dokumenAdd: '/api/dokumen',
  dokumenDel: '/api/dokumen/delete',
  dokumenGet: '/api/dokumen/file',
  faceRegister: '/api/media/face',
  faceGet: '/api/media/face',
  faceToggle: '/api/media/face-toggle',
  faceGetAll: '/api/media/faces',
  faceSettings: '/api/media/face-settings',
  mejaAbsen: '/api/absen',
  jamPeriodeList: '/api/jam-periode-list',
  jamPeriodeAdd: '/api/jam-periode-add',
  jamPeriodeDel: '/api/jam-periode-delete',
  adminList: '/api/admin-list',
  adminAdd: '/api/admin-add',
  adminDel: '/api/admin-delete',
  userAdd: '/api/user-add',
  userEdit: '/api/user-edit',
  penugasanList: '/api/penugasan',
  penugasanSave: '/api/penugasan',
  userDel: '/api/user-delete',
  logAdd: '/api/log/add',
  logEdit: '/api/log/edit',
  signatureSave: '/api/media/signature',
  signatureGet: '/api/media/signature',
  signatureList: '/api/media/signatures',
  keteranganAdd: '/api/keterangan',
  tugasAdd: '/api/penugasan',
  tugasList: '/api/penugasan',
  lemburGet: '/api/lembur',
  simapoKatalog: '/api/simapo/katalog',
  simapoPinjam: '/api/simapo/pinjam',
  simapoPinjamList: '/api/simapo/pinjam-list',
  simapoTiket: '/api/simapo/tiket',
  simapoAdminPinjamList: '/api/simapo/admin-pinjam-list',
  simapoAdminPinjamAction: '/api/simapo/admin-pinjam-action',
  simapoAdminTiketList: '/api/simapo/admin-tiket-list',
  simapoAdminTiketAction: '/api/simapo/admin-tiket-action',
  simapoAdminMasterList: '/api/simapo/admin-master-list',
  simapoAdminMasterSave: '/api/simapo/admin-master-save',
  simapoAdminMasterDel: '/api/simapo/admin-master-delete',
  simapoMutasiSave: '/api/simapo/mutasi-save',
  simapoMutasiList: '/api/simapo/mutasi-list',
  simapoOpnameSave: '/api/simapo/opname-save',
  simapoKategoriList: '/api/simapo/kategori-list',
  simapoKategoriSave: '/api/simapo/kategori-save',
  simapoKategoriDel: '/api/simapo/kategori-delete',
  simapoUnitByQR: '/api/simapo/unit-by-qr',
  simapoQRUpdate: '/api/simapo/qr-update',
  simapoUnitList: '/api/simapo/unit-list',
  simapoQRPinjam: '/api/simapo/qr-pinjam',
  simapoPenerimaanList: '/api/simapo/penerimaan',
  simapoPenerimaanSave: '/api/simapo/penerimaan',
  simapoPemeliharaanList: '/api/simapo/pemeliharaan',
  simapoPemeliharaanSave: '/api/simapo/pemeliharaan',
  simapoBKUList: '/api/simapo/bku',
  simapoBKUSave: '/api/simapo/bku',
  simapoStandarHargaList: '/api/simapo/standar-harga-list',
  simapoStandarHargaSave: '/api/simapo/standar-harga-save',
  lemburSave: '/api/lembur/archive',
  lemburArchiveList: '/api/lembur/archive',
  lemburArchiveDelete: '/api/lembur/archive/delete',
  gpsTrack: '/api/gps-track',
  pksList: '/api/simapo/pks-list',
  pksSave: '/api/simapo/pks-save',
  pksDelete: '/api/simapo/pks-delete',
  simapoBastInit: '/api/simapo/bast-init',
  simapoBastList: '/api/simapo/bast-list',
  simapoBastAssign: '/api/simapo/bast-assign',
  simapoBastRuangan: '/api/simapo/bast-ruangan',
  simapoBastSave: '/api/simapo/bast-save',
  simapoBastHistory: '/api/simapo/bast-history',
  simapoAsetMassal: '/api/simapo/aset-massal',
  simapoAsetKib: '/api/simapo/aset-kib',
  simapoAsetSummary: '/api/simapo/aset-summary',
  simapoPengaturanGet: '/api/simapo/pengaturan-get',
  simapoPengaturanSet: '/api/simapo/pengaturan-set',
  simapoTtdGet: '/api/simapo/ttd-get',
  simapoAsetKosongkan: '/api/simapo/aset-kosongkan',
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
// Endpoint native (/api/*) memakai satu origin lewat API_BASE.
// tanpa failover SERVER_1/SERVER_2, tanpa injeksi nip/instansi ke query string
// (server membaca body dan session), dan bearer-nya token native.
// Sesi native kedaluwarsa (TTL 12 jam) -> 401. Tak ada refresh token di server,
// jadi bersihkan token basi supaya ensureNativeSession menerbitkan ulang dari
// init_data Telegram; pengguna web/NIP tak punya init_data -> tampilkan layar login.
function _handleAuthExpired() {
  _nativeToken = null;
  try { localStorage.removeItem('_native_token'); } catch { /* mode privat */ }
  try { clearSession(); } catch { /* belum terdefinisi saat boot */ }
  const hasTg = !!(window.tg?.initData || window.Telegram?.WebApp?.initData);
  if (hasTg || _authExpiredShown) return;
  _authExpiredShown = true;
  const overlay = document.getElementById('authOverlay');
  if (overlay) overlay.style.display = 'flex';
}

async function nativeFetch(path, opts = {}) {
  const token = await ensureNativeSession();
  if (!token) throw new Error('Sesi native tidak tersedia: login Telegram atau token perangkat.');

  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(API_BASE + path, {
      method: opts.method || 'GET',
      body: opts.body,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      signal: ctrl.signal,
    });
    if (res.status === 401) _handleAuthExpired();
    return res;
  } finally {
    clearTimeout(tid);
  }
}

async function apiFetch(path, opts = {}) {
  if (!path.startsWith('/api/')) {
    throw new Error('Endpoint non-native ditolak: ' + path);
  }
  return nativeFetch(path, opts);
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
