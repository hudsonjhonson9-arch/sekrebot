import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const load = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'n8n/export', f), 'utf8'));

const face = load('Face Recognition.json');
const bot = load('Absensi Bot V5.2 Postgres.json');

// Export n8n menyimpan node dua kali: nodes[] (working copy) dan activeVersion.nodes[]
// (snapshot yang sedang jalan). Keduanya wajib sama, kalau tidak yang ke-import bisa
// mengembalikan kode lama.
const copies = wf => [wf.nodes, wf.activeVersion.nodes];

test('Check Role Face-Register tidak memakai items[] yang tidak terdefinisi', () => {
  for (const nodes of copies(face)) {
    const node = nodes.find(n => n.name === 'Check Role Face-Register');
    assert.ok(node, 'node Check Role Face-Register harus ada');
    assert.ok(
      !node.parameters.jsCode.includes('items[0]'),
      'items[0] ReferenceError di n8n Code node v2 — harus ambil body dari webhook'
    );
    assert.match(node.parameters.jsCode, /\$\('Face Register Webhook'\)\.first\(\)\.json\.body/);
  }
});

test('tidak ada query yang menarik face_photo (base64 ~1,7 MB)', () => {
  for (const nodes of copies(bot)) {
    for (const node of nodes) {
      const q = node.parameters?.query || '';
      if (!q) continue;
      assert.ok(!/face_photo/i.test(q), `${node.name} masih SELECT face_photo`);
      assert.ok(
        !/SELECT\s+\*[\s\S]{0,40}FROM\s+"?user_list"?/i.test(q),
        `${node.name} masih SELECT * dari user_list (ikut menarik foto)`
      );
    }
  }
});

test('query pegawai tetap membawa descriptor untuk face recognition', () => {
  const wajib = ['face_histogram', 'face_model', 'face_saved_at', '"NIP"'];
  for (const nama of ['Get Pegawai User-List', 'Get All Pegawai (Reorder)', 'Get Pegawai Absen']) {
    for (const nodes of copies(bot)) {
      const node = nodes.find(n => n.name === nama);
      assert.ok(node, `node ${nama} harus ada`);
      for (const col of wajib) {
        assert.ok(node.parameters.query.includes(col), `${nama} kehilangan kolom ${col}`);
      }
    }
  }
});

test('nodes[] dan activeVersion.nodes[] sinkron untuk node yang dipatch', () => {
  const target = ['Get Pegawai User-List', 'Get All Pegawai (Reorder)', 'Get Pegawai Absen'];
  for (const nama of target) {
    const a = bot.nodes.find(n => n.name === nama).parameters.query;
    const b = bot.activeVersion.nodes.find(n => n.name === nama).parameters.query;
    assert.equal(a, b, `${nama}: salinan Nodes tidak sinkron`);
  }
  const fa = face.nodes.find(n => n.name === 'Check Role Face-Register').parameters.jsCode;
  const fb = face.activeVersion.nodes.find(n => n.name === 'Check Role Face-Register').parameters.jsCode;
  assert.equal(fa, fb, 'Check Role Face-Register: salinan nodes tidak sinkron');
});