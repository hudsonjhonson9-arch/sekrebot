/* Utilitas panel arsip native. Script klasik: semua keluar lewat window.ArsipUI.
   Fungsi di sini MURNI (tanpa DOM) supaya bisa diuji di Node lewat
   new Function('window', src) — lihat tests/arsip-ui.test.js. */
(function () {
  'use strict';

  var WARNA_EXT = {
    pdf: '#e5484d',
    doc: '#3b82f6', docx: '#3b82f6',
    xls: '#16a34a', xlsx: '#16a34a', csv: '#16a34a',
    ppt: '#f59e0b', pptx: '#f59e0b',
    jpg: '#a855f7', jpeg: '#a855f7', png: '#a855f7', webp: '#a855f7', gif: '#a855f7',
    zip: '#64748b', rar: '#64748b', '7z': '#64748b',
  };
  var GAMBAR = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

  function driveFileId(url) {
    var s = String(url == null ? '' : url).trim();
    if (!s) return null;
    var m = s.match(/[?&]id=([a-zA-Z0-9_-]+)/) || s.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    return m ? m[1] : null;
  }

  // URL embed Drive (boleh di-iframe). Non-Drive / tanpa id -> null.
  function driveEmbedUrl(url) {
    var id = driveFileId(url);
    return id ? 'https://drive.google.com/file/d/' + id + '/preview' : null;
  }

  // Thumbnail Drive; delegasi ke driveImgUrl (js/helpers.js) supaya satu jalur saja.
  function driveThumbUrl(url, size) {
    var s = String(url == null ? '' : url);
    var w = size || 400;
    if (typeof window.driveImgUrl === 'function') return window.driveImgUrl(s, w);
    var id = driveFileId(s);
    return id ? 'https://drive.google.com/thumbnail?id=' + id + '&sz=w' + w : s;
  }

  function extOf(d) {
    var s = String((d && (d.title || d.url)) || '');
    var m = s.match(/\.([a-z0-9]{2,5})(?=$|[?#])/i);
    return m ? m[1].toLowerCase() : '';
  }

  function jenisFile(d) {
    var ext = extOf(d);
    if (GAMBAR.indexOf(ext) !== -1) return 'gambar';
    if (ext === 'pdf') return 'pdf';
    return 'lain';
  }

  function warnaFile(d) {
    return WARNA_EXT[extOf(d)] || '#64748b';
  }

  // Nama ikon harus ada di css/lib/runeicons.css (hasil generate, bukan Font
  // Awesome penuh) — ikon yang tidak terdaftar tampil kosong. Word & PPT tidak
  // punya glyph sendiri, jadi berbagi fa-file-alt dan dibedakan lewat warnaFile().
  function ikonFile(d) {
    var ext = extOf(d);
    if (GAMBAR.indexOf(ext) !== -1) return 'fa-image';
    if (ext === 'pdf') return 'fa-file-pdf';
    if (ext === 'doc' || ext === 'docx') return 'fa-file-alt';
    if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') return 'fa-file-excel';
    if (ext === 'ppt' || ext === 'pptx') return 'fa-file-alt';
    return 'fa-file-alt';
  }

  // Reducer navigasi: murni + tanpa DOM, jadi bisa diuji. Inilah satu-satunya
  // tempat aturan "naik satu tingkat" ditulis.
  function nav(state, action) {
    var s = {
      view: (state && state.view) || 'home',
      folder: (state && state.folder) || null,
      detail: (state && state.detail) || null,
    };
    var a = String(action == null ? '' : action);
    if (a.indexOf('tile:') === 0) {
      var v = a.slice(5);
      if (['dokumen', 'kk', 'bd', 'app'].indexOf(v) === -1) return s;
      return { view: v, folder: null, detail: null };
    }
    if (a === 'home') return { view: 'home', folder: null, detail: null };
    if (a === 'folder-back') return { view: 'dokumen', folder: null, detail: null };
    if (a === 'detail-close') return { view: s.view, folder: s.folder, detail: null };
    if (a.indexOf('folder:') === 0) return { view: 'dokumen', folder: a.slice(7) || null, detail: null };
    if (a.indexOf('detail:') === 0) return { view: s.view, folder: s.folder, detail: a.slice(7) || null };
    // back = langsung ke grid beranda, tanpa menaik satu per satu. Tombol "Tutup"
    // di detail memakai 'detail-close' (tetap di daftar), jadi keduanya tidak tabrakan.
    if (a === 'back') return { view: 'home', folder: null, detail: null };
    return s;
  }

  function esc(v) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(v);
    // ponytail: fallback escape sendiri, karena empty() juga dipakai di Node/test
    // dan teks dari dokumen bisa memuat tag.
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function skeleton(mode, n) {
    var k = Math.max(1, Math.min(8, n || 4));
    var cls = (mode === 'grid' ? 'arsip-card ' : 'arsip-item-wrap ') + 'arsip-skel';
    var out = '';
    for (var i = 0; i < k; i++) out += '<div class="' + cls + '"></div>';
    return out;
  }

  function empty(text) {
    return '<div class="arsip-placeholder">' + esc(text) + '</div>';
  }

  window.ArsipUI = {
    WARNA_EXT: WARNA_EXT,
    driveFileId: driveFileId,
    driveEmbedUrl: driveEmbedUrl,
    driveThumbUrl: driveThumbUrl,
    extOf: extOf,
    jenisFile: jenisFile,
    warnaFile: warnaFile,
    ikonFile: ikonFile,
    nav: nav,
    skeleton: skeleton,
    empty: empty,
  };
})();
