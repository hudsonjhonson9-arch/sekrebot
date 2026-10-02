// /file/d/fileIdPattern
// test pattern: /file/d/([-\w]+)
const MAX_BYTES = 5 * 1024 * 1024;
const MIME_PREFIX = 'image/';

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

function fileIdFromUrl(url) {
  const m = String(url || '').match(/\/file\/d\/([-\w]+)/);
  return m ? m[1] : null;
}

function canonicalUrl_(fileId) {
  return 'https://drive.google.com/file/d/' + fileId + '/view';
}

function doGet(e) {
  const p = readParams_(e);
  try {
    if (p.action === 'health') {
      return jsonOut(200, { ok: true, folderId: folderId_() });
    }
    return jsonOut(404, { ok: false, message: 'action tidak dikenal' });
  } catch (err) {
    return jsonOut(500, { ok: false, message: String(err && err.message || err) });
  }
}

function doPost(e) {
  const p = readParams_(e);
  if (p.action !== 'mediaUpsert') {
    return jsonOut(400, { ok: false, message: "action wajib 'mediaUpsert'" });
  }
  if (!p.filename || !p.mimeType) {
    return jsonOut(400, { ok: false, message: 'filename dan mimeType wajib diisi' });
  }
  if (MIME_PREFIX.indexOf(p.mimeType) !== 0) {
    return jsonOut(400, { ok: false, message: 'mimeType harus berupa image/*' });
  }
  if (!p.dataBase64) {
    return jsonOut(400, { ok: false, message: 'dataBase64 wajib diisi' });
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
    const blob = Utilities.newBlob(bytes, p.mimeType, p.filename);
    const file = p.fileId
      ? DriveApp.getFileById(p.fileId)
      : DriveApp.createFile(blob);
    if (p.fileId) {
      file.setName(p.filename);
      file.setContent(blob);
    }
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    DriveApp.getFolderById(folderId_()).addFile(file);

    return jsonOut(200, {
      ok: true,
      fileId: file.getId(),
      url: canonicalUrl_(file.getId()),
      name: file.getName()
    });
  } catch (err) {
    return jsonOut(500, { ok: false, message: String(err && err.message || err) });
  }
}
