import { fileIdFromDriveUrl } from './media-payload.js';

const TIMEOUT_MS = 45_000;

// Fail-fast saat dipanggil, bukan saat import: test meng-import modul tanpa env.
// Token ikut di query string karena Apps Script tidak mengekspos custom header ke
// doGet/doPost -- satu-satunya channel yang tersedia adalah e.parameter.
function gasUrl_(path = '') {
  const base = process.env.GAS_WEBAPP_URL;
  if (!base) throw new Error('GAS_WEBAPP_URL belum diset');
  const token = process.env.GAS_SHARED_SECRET;
  if (!token) throw new Error('GAS_SHARED_SECRET belum diset');
  const sep = path.indexOf('?') === -1 ? '?' : '&';
  return base + path + sep + 'token=' + encodeURIComponent(token);
}

async function callGas_(path, init = {}) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(gasUrl_(path), { ...init, signal: ctrl.signal });
    let json;
    try {
      json = await res.json();
    } catch {
      // body HTML = halaman login Google, artinya deployment belum dibuka untuk
      // "Anyone". Status tetap 200, jadi "HTTP 200" saja akan menyesatkan.
      throw new Error(`Apps Script HTTP ${res.status} (respons bukan JSON — cek izin deploy "Anyone" dan URL /exec)`);
    }
    // `?.` menutup dua kasus: body JSON `null` dan body `{}` tanpa field ok
    if (!res.ok || !json?.ok) {
      // pesan dari Apps Script diteruskan apa adanya (mis. batas 5 MB)
      throw new Error(json?.message || `Apps Script HTTP ${res.status}`);
    }
    return json;
  } finally {
    clearTimeout(tid);
  }
}

export function gasHealth() {
  return callGas_('/?action=health');
}

export async function gasUpsert({ filename, mimeType, dataBase64, fileId }) {
  // dataBase64 dikirim verbatim, tanpa re-wrap: Code.gs menghitung panjang string
  // sebelum decode dan akan 413 kalau ada line break. Buffer#toString('base64')
  // sudah tidak menghasilkan newline.
  const out = await callGas_('', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'mediaUpsert', filename, mimeType, dataBase64, fileId: fileId || null }),
  });
  if (!out.fileId || !out.url) throw new Error('Apps Script tidak mengembalikan fileId');
  return { fileId: out.fileId, url: out.url };
}

// Code.gs hanya menerima id file Drive polos, bukan URL — URL disimpan di DB,
// jadi id diekstrak di sisi server ini.
export function existingFileId(previousUrl) {
  return fileIdFromDriveUrl(previousUrl);
}
