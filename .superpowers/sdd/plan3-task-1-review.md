## commits

fc39260 feat(spt): build template SPT dari dokumen asli + helper patch docx

## stat

 public/spt_template.docx      | Bin 0 -> 75643 bytes
 scripts/build-spt-template.js |  59 ++++++++++++++++++++
 scripts/docx-patch.js         | 121 ++++++++++++++++++++++++++++++++++++++++++
 scripts/setup-capacitor.js    |   2 +
 spt_template.docx             | Bin 0 -> 75643 bytes
 5 files changed, 182 insertions(+)

## diff

diff --git a/public/spt_template.docx b/public/spt_template.docx
new file mode 100644
index 0000000..6a58704
--- /dev/null
+++ b/public/spt_template.docx
@@ -0,0 +1,79 @@
+                          PEMERINTAH KABUPATEN SUMBA BARAT
+                           BADAN PERENCANAAN PEMBANGUNAN,
+                              RISET DAN INOVASI DAERAH
+          Jl. Wee karou Nomor.  -  Waikabubak Provinsi Nusa Tenggara Timur
+      Telp (0387) 22203 Fax (0387) 21093,Email : wesumba@yahoo.com [HYPERLINK: mailto:wesumba@yahoo.com])
+                                 W A I K A B U B A K
+                                         
+                                       
+                             SURAT PERINTAH TUGAS
+                                Nomor : {Nomor}
+            
+Dasar
+:
+1.
+{Dasar}
+
+                                MEMERINTAHKAN :
+                                       
+                                    Kepada
+:
+{#pelaksana}{No}.
+Nama
+Pangkat/Gol
+NIP
+Jabatan
+:
+:
+:
+:
+{Nama}
+{PangkatGol}
+{NIP}
+{Jabatan}{/pelaksana}
+
+Untuk
+:
+1.
+{Untuk}
+
+Ditetapkan di
+:
+{DitetapkanDi}
+Pada Tanggal
+:
+{TanggalSurat}
+
+
+                             
+                                        KEPALA BAPPERIDA
+                                    	KABUPATEN SUMBA BARAT,
+                                          
+
+                                       
+                                       
+
+                                            {KepalaNama}
+                                          {KepalaPangkat}
+                                          NIP. {KepalaNIP}
+                                                  
+                                      NO
+                                 Paraf Hirarki
+1.
+{Paraf1}
+
+2.
+{Paraf2}
+
+3.
+{Paraf3}
+
+
+
+
+
+
+
+
+
+
diff --git a/scripts/build-spt-template.js b/scripts/build-spt-template.js
new file mode 100644
index 0000000..2c9aaab
--- /dev/null
+++ b/scripts/build-spt-template.js
@@ -0,0 +1,59 @@
+// GòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉ
+// Bangun spt_template.docx dari "Salinan Surat Tugas.docx".
+//   TEMPLATE_SRC=... node scripts/build-spt-template.js
+// Keluaran: public/spt_template.docx + ./spt_template.docx
+// GòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉGòÉ
+import fs from 'node:fs';
+import path from 'node:path';
+import { createRequire } from 'node:module';
+import { fileURLToPath } from 'node:url';
+import { loadParagraphs, applyByIndex, spliceInto, assertPlaceholders } from './docx-patch.js';
+
+const require = createRequire(import.meta.url);
+const PizZip = require('pizzip');
+const __dirname = path.dirname(fileURLToPath(import.meta.url));
+
+const SRC = process.env.TEMPLATE_SRC || path.join(__dirname, '../Salinan Surat Tugas.docx');
+const OUTS = [path.join(__dirname, '../public/spt_template.docx'), path.join(__dirname, '../spt_template.docx')];
+
+// indeks paragraf deterministik (template ini file tetap yang di-commit).
+// Lihat docs/superpowers/specs/2026-10-16-spt-sppd-generator-design.md -º9.
+const WHOLE = {
+  9: 'Nomor : {Nomor}',
+  14: '{Dasar}',
+  20: '{#pelaksana}{No}.',
+  29: '{Nama}',
+  30: '{PangkatGol}',
+  31: '{NIP}',
+  32: '{Jabatan}{/pelaksana}',
+  37: '{Untuk}',
+  41: '{DitetapkanDi}',
+  44: '{TanggalSurat}',
+  55: '{KepalaNama}',
+  56: '{KepalaPangkat}',
+  57: 'NIP. {KepalaNIP}',
+  62: '{Paraf1}',
+  65: '{Paraf2}',
+  68: '{Paraf3}'
+};
+const PATCHES = {};
+const BLANK = [];
+
+const PLACEHOLDERS = [
+  '{Nomor}', '{Dasar}', '{#pelaksana}', '{No}', '{Nama}', '{PangkatGol}', '{NIP}',
+  '{Jabatan}', '{/pelaksana}', '{Untuk}', '{DitetapkanDi}', '{TanggalSurat}',
+  '{KepalaNama}', '{KepalaPangkat}', '{KepalaNIP}', '{Paraf1}', '{Paraf2}', '{Paraf3}'
+];
+
+const zip = new PizZip(fs.readFileSync(SRC));
+const docXml = zip.file('word/document.xml').asText();
+const paras = loadParagraphs(docXml);
+const newXml = spliceInto(docXml, paras, applyByIndex(paras, WHOLE, PATCHES, BLANK));
+
+assertPlaceholders(newXml, PLACEHOLDERS);
+zip.file('word/document.xml', newXml);
+for (const out of OUTS) {
+  fs.writeFileSync(out, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
+  console.log('[OK]', out, fs.statSync(out).size, 'bytes');
+}
+console.log('Tag SPT aktif:', PLACEHOLDERS.filter(p => !/^\{[/#]/.test(p)).length);
diff --git a/scripts/docx-patch.js b/scripts/docx-patch.js
new file mode 100644
index 0000000..8b44711
--- /dev/null
+++ b/scripts/docx-patch.js
@@ -0,0 +1,121 @@
+// scripts/docx-patch.js GÇö utilitas sulam tag docxtemplater ke docx asli.
+// Dipakai scripts/build-spt-template.js & scripts/build-sppd-template.js.
+// Logika inti disalin dari scripts/build-bast-template.js (sudah dipakai produksi).
+
+const tOf = run => {
+  const m = run.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/);
+  if (!m) return null;
+  return { open: m[0].slice(0, m[0].indexOf('>') + 1), text: m[1] };
+};
+
+function spliceRun(par, rawRun, newT) {
+  const i = par.indexOf(rawRun);
+  const t = tOf(rawRun);
+  const inner = t.open + t.text + '</w:t>';
+  const replaced = rawRun.slice(0, rawRun.indexOf(inner)) + newT + rawRun.slice(rawRun.indexOf(inner) + inner.length);
+  return par.slice(0, i) + replaced + par.slice(i + rawRun.length);
+}
+
+export function rewriteWhole(par, tag) {
+  // ganti seluruh teks paragraf: run pertama berisi teks -> tag, sisanya dikosongkan
+  const runs = Array.from(par.matchAll(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g), m => m[0]);
+  let done = false;
+  let out = par;
+  for (const r of runs) {
+    const t = tOf(r);
+    if (!t) continue;
+    if (!done && t.text.trim() !== '') {
+      out = spliceRun(out, r, t.open + tag + '</w:t>');
+      done = true;
+    } else if (t.text.length) {
+      out = spliceRun(out, r, t.open + '</w:t>');
+    }
+  }
+  return out;
+}
+
+function applyOne(para, target, repl) {
+  const runs = Array.from(para.matchAll(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g), m => ({ raw: m[0], start: m.index }));
+  let full = '';
+  const segs = [];
+  runs.forEach((r, i) => {
+    const t = tOf(r.raw);
+    segs.push({ i, off: full.length, len: t ? t.text.length : 0 });
+    full += t ? t.text : '';
+  });
+  const idx = full.indexOf(target);
+  if (idx < 0) throw new Error('Target tidak ditemukan dalam paragraf: ' + JSON.stringify(target).slice(0, 60));
+  const end = idx + target.length;
+  const aff = segs.filter(s => s.off < end && s.off + s.len > idx && s.len > 0);
+  const first = aff[0];
+  const last = aff[aff.length - 1];
+  const edits = {};
+  for (const s of aff) {
+    const cutA = Math.max(0, idx - s.off);
+    const cutB = Math.max(0, Math.min(end, s.off + s.len) - s.off);
+    const txt = tOf(runs[s.i].raw).text;
+    let nt;
+    if (s === first) nt = txt.slice(0, cutA) + repl + (s === last ? txt.slice(cutB) : '');
+    else nt = s === last ? txt.slice(cutB) : '';
+    edits[s.i] = nt;
+  }
+  let outPara = para;
+  const keys = Object.keys(edits).map(Number).sort((a, b) => b - a);
+  for (const key of keys) {
+    const { raw } = runs[key];
+    const t = tOf(raw);
+    const inner = t.open + t.text + '</w:t>';
+    const at = outPara.indexOf(raw);
+    if (at < 0) throw new Error('Run tidak ditemukan saat patch');
+    const replaced = raw.slice(0, raw.indexOf(inner)) + t.open + edits[key] + '</w:t>' + raw.slice(raw.indexOf(inner) + inner.length);
+    outPara = outPara.slice(0, at) + replaced + outPara.slice(at + raw.length);
+  }
+  return outPara;
+}
+
+export function patchParagraph(para, patches) {
+  let out = para;
+  for (const [target, repl] of patches) out = applyOne(out, target, repl);
+  return out;
+}
+
+export function loadParagraphs(docXml) {
+  const re = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
+  const out = [];
+  let m;
+  while ((m = re.exec(docXml))) {
+    const raw = m[0];
+    const text = Array.from(raw.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g), x => x[1]).join('');
+    out.push({ raw, start: m.index, text });
+  }
+  return out;
+}
+
+// wholeMap: { index: '{Tag}' }, patchesMap: { index: [[target, repl], GÇª] }, blankList: [index, GÇª]
+export function applyByIndex(paras, wholeMap = {}, patchesMap = {}, blankList = []) {
+  const blanks = new Set(blankList);
+  const newParas = paras.map(({ raw, text }, i) => {
+    if (blanks.has(i)) return rewriteWhole(raw, '');
+    if (wholeMap[i] !== undefined) return rewriteWhole(raw, wholeMap[i]);
+    if (patchesMap[i] !== undefined) return patchParagraph(raw, patchesMap[i]);
+    return raw;
+  });
+  return newParas;
+}
+
+export function spliceInto(docXml, paras, newParas) {
+  let out = docXml;
+  for (let i = paras.length - 1; i >= 0; i--) {
+    out = out.slice(0, paras[i].start) + newParas[i] + out.slice(paras[i].start + paras[i].raw.length);
+  }
+  return out;
+}
+
+export function assertPlaceholders(xml, list) {
+  for (const p of list) {
+    if (!xml.includes(p)) {
+      console.error('[FAIL] Placeholder TIDAK ditemukan di hasil:', p);
+      process.exit(1);
+    }
+  }
+}
diff --git a/scripts/setup-capacitor.js b/scripts/setup-capacitor.js
index e7a9496..4dffb74 100644
--- a/scripts/setup-capacitor.js
+++ b/scripts/setup-capacitor.js
@@ -38,20 +38,22 @@ function copyDirSync(src, dest) {
 // Copy essential files and folders to "www"
 fs.copyFileSync('index.html', 'www/index.html');
 if (fs.existsSync('manifest.json')) fs.copyFileSync('manifest.json', 'www/manifest.json');
 if (fs.existsSync('service-worker.js')) fs.copyFileSync('service-worker.js', 'www/service-worker.js');
 if (fs.existsSync('css')) copyDirSync('css', 'www/css');
 if (fs.existsSync('js')) copyDirSync('js', 'www/js');
 // icons/ dibutuhkan css/lib/runeicons.css (mask SVG) GÇö tanpa ini semua ikon 404 di APK.
 if (fs.existsSync('icons')) copyDirSync('icons', 'www/icons');
 // bast_template.docx di-fetch js/simapo-bast.js untuk generate BAST.
 if (fs.existsSync('bast_template.docx')) fs.copyFileSync('bast_template.docx', 'www/bast_template.docx');
+// spt_template.docx di-fetch js/tugas-spt.js untuk generate SPT/SPPD.
+if (fs.existsSync('spt_template.docx')) fs.copyFileSync('spt_template.docx', 'www/spt_template.docx');
 console.log('G£à Clean web assets copied to "www"!');
 
 // 2. Write capacitor.config.json pointing to "www"
 const config = {
   appId: 'com.bapperida.absensi',
   appName: 'Absensi Digital',
   webDir: 'www',
   bundledWebRuntime: false,
   plugins: {
     CapacitorUpdater: {
diff --git a/spt_template.docx b/spt_template.docx
new file mode 100644
index 0000000..6a58704
--- /dev/null
+++ b/spt_template.docx
@@ -0,0 +1,79 @@
+                          PEMERINTAH KABUPATEN SUMBA BARAT
+                           BADAN PERENCANAAN PEMBANGUNAN,
+                              RISET DAN INOVASI DAERAH
+          Jl. Wee karou Nomor.  -  Waikabubak Provinsi Nusa Tenggara Timur
+      Telp (0387) 22203 Fax (0387) 21093,Email : wesumba@yahoo.com [HYPERLINK: mailto:wesumba@yahoo.com])
+                                 W A I K A B U B A K
+                                         
+                                       
+                             SURAT PERINTAH TUGAS
+                                Nomor : {Nomor}
+            
+Dasar
+:
+1.
+{Dasar}
+
+                                MEMERINTAHKAN :
+                                       
+                                    Kepada
+:
+{#pelaksana}{No}.
+Nama
+Pangkat/Gol
+NIP
+Jabatan
+:
+:
+:
+:
+{Nama}
+{PangkatGol}
+{NIP}
+{Jabatan}{/pelaksana}
+
+Untuk
+:
+1.
+{Untuk}
+
+Ditetapkan di
+:
+{DitetapkanDi}
+Pada Tanggal
+:
+{TanggalSurat}
+
+
+                             
+                                        KEPALA BAPPERIDA
+                                    	KABUPATEN SUMBA BARAT,
+                                          
+
+                                       
+                                       
+
+                                            {KepalaNama}
+                                          {KepalaPangkat}
+                                          NIP. {KepalaNIP}
+                                                  
+                                      NO
+                                 Paraf Hirarki
+1.
+{Paraf1}
+
+2.
+{Paraf2}
+
+3.
+{Paraf3}
+
+
+
+
+
+
+
+
+
+
