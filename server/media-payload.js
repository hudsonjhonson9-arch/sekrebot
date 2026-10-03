// Batas ini dikunci sama dengan MAX_BYTES di google-apps-script/Code.gs.
// Kalau salah satu berubah, upload ditolak Apps Script dengan 413 yang membingungkan.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const DATA_URL = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i;

export function decodeDataUrl(dataUrl) {
  const m = DATA_URL.exec(String(dataUrl || ''));
  if (!m) throw new Error('foto harus berupa data URL image/*;base64');
  const mimeType = m[1].toLowerCase();
  // svg ditolak juga di server, aturan sama dengan Code.gs: bisa membawa <script>,
  // tidak pernah dibutuhkan untuk foto wajah atau tanda tangan.
  if (/svg/.test(mimeType)) throw new Error('foto svg tidak boleh');
  const buffer = Buffer.from(m[2], 'base64');
  if (!buffer.length) throw new Error('base64 kosong');
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error('ukuran foto melebihi 5 MB');
  return { buffer, mimeType };
}

export function fileIdFromDriveUrl(url) {
  // Batas {5,200} dikunci sama dengan FILE_ID_RE di Code.gs:3, dan letak batas itu
  // wajib di dalam pattern. Lookahead di belakang wajib juga: tanpa itu segment
  // dengan karakter invalid di tengah hanya terpotong jadi prefix yang tetap lolos
  // FILE_ID_RE (`/file/d/1AbCd EfGh/view` -> "1AbCd"), dan gasUpsert lalu menunjuk
  // file Drive yang lain, bukan file yang dimaksud. Lebih baik null.
  // Batas depan `/`, `?`, `#`, atau akhir string; `?`/`#` dipakai Share link Drive
  // ("...&usp=sharing"), jadi tidak boleh ikut dipotong.
  const m = /\/file\/d\/([-\w]{5,200})(?=[/?#]|$)/.exec(String(url || ''));
  return m ? m[1] : null;
}
