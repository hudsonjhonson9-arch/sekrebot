const MAX_BYTES = 5 * 1024 * 1024;
const MIME_PREFIX = 'image/';
const FILE_ID_RE = /^[-\w]{5,200}$/;

function jsonOut(code, body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON)
    .setResponseCode(code);
}

function readParams_(e) {
  if (!e) return {};
  if (e.postData && e.postData.contents) {
    try { return JSON.parse(e.postData.contents); } catch (err) { return {}; }
  }
  return e.parameter || {};
}

function folderId_() {
  const id = PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID');
  if (!id) throw new Error('DRIVE_FOLDER_ID belum diset di PropertiesService');
  return id;
}

function canonicalUrl_(fileId) {
  return 'https://drive.google.com/file/d/' + fileId + '/view';
}

// URL /exec public-by-link, jadi tanpa token siapa pun yang punya URL itu bisa
// menulis file ke folder Drive. Token lewat query param: Apps Script hanya
// mengekspos e.parameter ke web app, custom header tidak diteruskan.
function assertToken_(e) {
  const expected = PropertiesService.getScriptProperties().getProperty('GAS_SHARED_SECRET');
  // Gagal tertutup: property kosong = endpoint terbuka untuk semua orang.
  if (!expected) throw new Error('GAS_SHARED_SECRET belum diset di PropertiesService');
  const p = (e && e.parameter) || {};
  if (p.token !== expected) {
    const err = new Error('token tidak valid');
    err.status = 401;
    throw err;
  }
}

// null = lanjut ke handler. Response = sudah selesai, tinggal di-return.
function guard_(e) {
  try {
    assertToken_(e);
    return null;
  } catch (err) {
    if (err.status === 401) return jsonOut(401, { ok: false, message: 'token tidak valid' });
    console.error('guard gagal', err);
    return jsonOut(500, { ok: false, message: 'konfigurasi server bermasalah' });
  }
}

function doGet(e) {
  const blocked = guard_(e);
  if (blocked) return blocked;
  const p = readParams_(e);
  try {
    if (p.action === 'health') {
      return jsonOut(200, { ok: true, folderId: folderId_() });
    }
    return jsonOut(404, { ok: false, message: 'action tidak dikenal' });
  } catch (err) {
    console.error('health gagal', err);
    return jsonOut(500, { ok: false, message: 'health check gagal' });
  }
}

function doPost(e) {
  const blocked = guard_(e);
  if (blocked) return blocked;
  const p = readParams_(e);
  if (p.action !== 'mediaUpsert') {
    return jsonOut(400, { ok: false, message: "action wajib 'mediaUpsert'" });
  }
  if (!p.filename || !p.mimeType) {
    return jsonOut(400, { ok: false, message: 'filename dan mimeType wajib diisi' });
  }
  // svg ditolak: bisa membawa <script>, tidak pernah dibutuhkan untuk foto/signature.
  if (MIME_PREFIX.indexOf(p.mimeType) !== 0 || /svg/.test(p.mimeType)) {
    return jsonOut(400, { ok: false, message: 'mimeType harus image/* dan bukan svg' });
  }
  if (typeof p.dataBase64 !== 'string' || !p.dataBase64) {
    return jsonOut(400, { ok: false, message: 'dataBase64 wajib diisi' });
  }
  // ponytail: guard pra-decode, base64 ~4/3 byte asli + 4. Cabut kalau backend sudah membatasi ukuran body.
  if (p.dataBase64.length > MAX_BYTES * 4 / 3 + 4) {
    return jsonOut(413, { ok: false, message: 'ukuran file melebihi 5 MB' });
  }
  // only id file Drive, bukan URL — URL disimpan di DB dan di-extract di sisi server.
  if (p.fileId && !FILE_ID_RE.test(p.fileId)) {
    return jsonOut(400, { ok: false, message: 'fileId harus id file Drive, bukan URL' });
  }

  let bytes;
  try {
    bytes = Utilities.base64Decode(p.dataBase64);
  } catch (err) {
    return jsonOut(400, { ok: false, message: 'dataBase64 bukan base64 yang valid' });
  }
  if (bytes.length > MAX_BYTES) {
    return jsonOut(413, { ok: false, message: 'ukuran file melebihi 5 MB' });
  }

  try {
    // Folder diresolve lebih dulu: kalau DRIVE_FOLDER_ID belum diset, file tidak
    // boleh ikut berubah. Dan karena endpoint ini publik, fileId dari luar tidak
    // boleh menimpa file operator di luar folder tujuan.
    const folder = DriveApp.getFolderById(folderId_());
    const blob = Utilities.newBlob(bytes, p.mimeType, p.filename);
    let file;
    if (p.fileId) {
      // upload ulang menimpa file yang sama lewat fileId, bukan membuat duplikat
      file = DriveApp.getFileById(p.fileId);
      // cek SEMUA parent, bukan cuma yang pertama: file dari versi lama
      // (DriveApp.createFile + addFile) punya dua parent (root + folder tujuan)
      // dan Drive tidak menjamin urutannya, jadi file sah bisa permanent 403.
      const parents = file.getParents();
      let inFolder = false;
      while (parents.hasNext()) {
        if (parents.next().getId() === folder.getId()) inFolder = true;
      }
      if (!inFolder) {
        return jsonOut(403, { ok: false, message: 'fileId bukan milik folder tujuan' });
      }
      file.setName(p.filename);
      file.setContent(blob);
    } else {
      // createFile di dalam folder, bukan DriveApp.createFile + addFile yang
      // menyisakan file yatim di root My Drive.
      file = folder.createFile(blob);
    }
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return jsonOut(200, {
      ok: true,
      fileId: file.getId(),
      url: canonicalUrl_(file.getId()),
      name: file.getName()
    });
  } catch (err) {
    console.error('mediaUpsert gagal', err);
    return jsonOut(500, { ok: false, message: 'gagal menyimpan file' });
  }
}
