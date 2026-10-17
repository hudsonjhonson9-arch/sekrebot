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
    // Judul lebih dulu (biasanya lebih deskriptif), TAPI jatuh ke url kalau judul
    // tidak punya ekstensi — dulu url tidak pernah dilihat selama judul terisi,
    // jadi PDF Drive bermjudul "Laporan 2024" dikira 'lain' dan tidak di-preview.
    var pola = /\.([a-z0-9]{2,5})(?=$|[?#])/i;
    var m = String((d && d.title) || '').match(pola) || String((d && d.url) || '').match(pola);
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

  // Cara overlay menampilkan satu dokumen. Murni (tanpa DOM) supaya bisa diuji:
  //   'gambar' -> <img> (thumbnail Drive, paling ringan)
  //   'embed'  -> <iframe> Drive /preview — Drive merender pdf, docx, xlsx, ppt
  //               sendiri, jadi tidak perlu tahu ekstensinya
  //   'luar'   -> pesan + tombol "Buka di tab baru" (tautan non-Drive)
  function modePreview(d) {
    var url = String((d && d.url) || '');
    if (!url) return 'luar';
    if (jenisFile(d) === 'gambar') return 'gambar';
    return driveEmbedUrl(url) ? 'embed' : 'luar';
  }

  // HTML media untuk overlay preview DAN kartu detail — satu jalur saja supaya
  // keduanya tidak bisa beda perilaku. Gambar membawa cadangan weserv lewat
  // data-fallback (dipasang penangan error di js/arsip.js).
  function mediaHtml(d) {
    var url = String((d && d.url) || '');
    var judul = esc((d && d.title) || 'Dokumen');
    var mode = modePreview(d);
    if (mode === 'gambar') {
      var thumb = driveThumbUrl(url, 1200);
      var weserv = 'https://images.weserv.nl/?url=' + encodeURIComponent(thumb.replace(/^https?:\/\//, ''));
      return '<img class="arsip-media arsip-media-img" src="' + esc(thumb) + '" data-fallback="'
        + esc(weserv) + '" alt="' + judul + '" loading="lazy">';
    }
    if (mode === 'embed') {
      return '<iframe class="arsip-media arsip-media-frame" src="' + esc(driveEmbedUrl(url))
        + '" title="' + judul + '" loading="lazy"></iframe>';
    }
    return '<div class="arsip-placeholder">Berkas ini tidak bisa ditampilkan di sini.'
      + ' <a class="arsip-act" href="' + esc(url || '#') + '" target="_blank" rel="noopener">Buka di tab baru</a></div>';
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
    modePreview: modePreview,
    mediaHtml: mediaHtml,
    nav: nav,
    skeleton: skeleton,
    empty: empty,
  };
})();
