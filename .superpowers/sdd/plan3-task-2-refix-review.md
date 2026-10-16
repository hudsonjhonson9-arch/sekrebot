## commits

db2700d fix(spt): rewriteWhole tangani <w:t> ganda dalam satu run + verifikasi teks hasil

## stat

 public/sppd_template.docx | Bin 67422 -> 67412 bytes
 public/spt_template.docx  | Bin 75643 -> 75643 bytes
 scripts/docx-patch.js     |  49 ++++++++++++++++++++++++----------------------
 sppd_template.docx        | Bin 67422 -> 67412 bytes
 spt_template.docx         | Bin 75643 -> 75643 bytes
 www/sppd_template.docx    | Bin 67422 -> 67412 bytes
 www/spt_template.docx     | Bin 75643 -> 75643 bytes
 7 files changed, 26 insertions(+), 23 deletions(-)

## diff

diff --git a/public/sppd_template.docx b/public/sppd_template.docx
index 615a6c6..01da3e8 100644
--- a/public/sppd_template.docx
+++ b/public/sppd_template.docx
@@ -1,25 +1,25 @@
 
                         PEMERINTAH KABUPATEN SUMBA BARAT
           BADAN PERENCANAAN PEMBANGUNAN, PENELITIAN DAN PENGEMBANGAN DAERAH
          Jl. Wee karou Nomor.  -  Waikabubak Provinsi Nusa Tenggara Timur
    Telp (0387) 22203 Fax (0387) 21093,Email : wesumba@yahoo.com [HYPERLINK: mailto:wesumba@yahoo.com])
                                W A I K A B U B A K
 --------------------------------------------------------------------------------
 
 --------------------------------------------------------------------------------
 	Lembar ke	: 
 --------------------------------------------------------------------------------
 	Kode No	:
 --------------------------------------------------------------------------------
-	Nomor: {NomorSPPD}	:  42 /SPPD/2025
+	Nomor: {NomorSPPD}	
 --------------------------------------------------------------------------------
 SURAT PERJALANAN DINAS (SPD)
                                        
 1.
 Pengguna Anggaran/Kuasa Pengguna Anggaran
 :
 {KpaNama}
 2.
 Nama/NIP Pegawai yang melaksanakan perjalanan Dinas
 :
 {Nama}
 NIP.{NIP}
diff --git a/scripts/docx-patch.js b/scripts/docx-patch.js
index 8b44711..c692a3d 100644
--- a/scripts/docx-patch.js
+++ b/scripts/docx-patch.js
@@ -1,46 +1,36 @@
 // scripts/docx-patch.js GÇö utilitas sulam tag docxtemplater ke docx asli.
 // Dipakai scripts/build-spt-template.js & scripts/build-sppd-template.js.
 // Logika inti disalin dari scripts/build-bast-template.js (sudah dipakai produksi).
 
 const tOf = run => {
   const m = run.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/);
   if (!m) return null;
   return { open: m[0].slice(0, m[0].indexOf('>') + 1), text: m[1] };
 };
 
-function spliceRun(par, rawRun, newT) {
-  const i = par.indexOf(rawRun);
-  const t = tOf(rawRun);
-  const inner = t.open + t.text + '</w:t>';
-  const replaced = rawRun.slice(0, rawRun.indexOf(inner)) + newT + rawRun.slice(rawRun.indexOf(inner) + inner.length);
-  return par.slice(0, i) + replaced + par.slice(i + rawRun.length);
-}
-
 export function rewriteWhole(par, tag) {
-  // ganti seluruh teks paragraf: run pertama berisi teks -> tag, sisanya dikosongkan
-  const runs = Array.from(par.matchAll(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g), m => m[0]);
+  // ganti seluruh teks paragraf: <w:t> pertama yang berisi -> tag, sisanya dikosongkan.
+  // Bekerja per-<w:t> (bukan per-run): satu run bisa memuat beberapa <w:t>.
   let done = false;
-  let out = par;
-  for (const r of runs) {
-    const t = tOf(r);
-    if (!t) continue;
-    if (!done && t.text.trim() !== '') {
-      out = spliceRun(out, r, t.open + tag + '</w:t>');
+  return par.replace(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g, m => {
+    const open = m.slice(0, m.indexOf('>') + 1);
+    const text = m.slice(open.length, m.length - '</w:t>'.length);
+    if (!done && text.trim() !== '') {
       done = true;
-    } else if (t.text.length) {
-      out = spliceRun(out, r, t.open + '</w:t>');
+      return open + tag + '</w:t>';
     }
-  }
-  return out;
+    if (text.length) return open + '</w:t>';
+    return m;
+  });
 }
 
 function applyOne(para, target, repl) {
   const runs = Array.from(para.matchAll(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g), m => ({ raw: m[0], start: m.index }));
   let full = '';
   const segs = [];
   runs.forEach((r, i) => {
     const t = tOf(r.raw);
     segs.push({ i, off: full.length, len: t ? t.text.length : 0 });
     full += t ? t.text : '';
   });
   const idx = full.indexOf(target);
@@ -82,30 +72,43 @@ export function patchParagraph(para, patches) {
 export function loadParagraphs(docXml) {
   const re = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
   const out = [];
   let m;
   while ((m = re.exec(docXml))) {
     const raw = m[0];
     const text = Array.from(raw.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g), x => x[1]).join('');
     out.push({ raw, start: m.index, text });
   }
   return out;
 }
 
+export const parText = par =>
+  Array.from(par.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g), m => m[1]).join('').replace(/\s+/g, ' ').trim();
+
 // wholeMap: { index: '{Tag}' }, patchesMap: { index: [[target, repl], GÇª] }, blankList: [index, GÇª]
 export function applyByIndex(paras, wholeMap = {}, patchesMap = {}, blankList = []) {
   const blanks = new Set(blankList);
-  const newParas = paras.map(({ raw, text }, i) => {
-    if (blanks.has(i)) return rewriteWhole(raw, '');
-    if (wholeMap[i] !== undefined) return rewriteWhole(raw, wholeMap[i]);
+  const newParas = paras.map(({ raw }, i) => {
+    if (blanks.has(i)) {
+      const out = rewriteWhole(raw, '');
+      if (parText(out) !== '') throw new Error(`Paragraf ${i}: hasil blank tidak kosong: "${parText(out)}"`);
+      return out;
+    }
+    if (wholeMap[i] !== undefined) {
+      const out = rewriteWhole(raw, wholeMap[i]);
+      const got = parText(out);
+      const want = String(wholeMap[i]).replace(/\s+/g, ' ').trim();
+      if (got !== want) throw new Error(`Paragraf ${i}: hasil "${got}" != "${want}"`);
+      return out;
+    }
     if (patchesMap[i] !== undefined) return patchParagraph(raw, patchesMap[i]);
     return raw;
   });
   return newParas;
 }
 
 export function spliceInto(docXml, paras, newParas) {
   let out = docXml;
   for (let i = paras.length - 1; i >= 0; i--) {
     out = out.slice(0, paras[i].start) + newParas[i] + out.slice(paras[i].start + paras[i].raw.length);
   }
   return out;
diff --git a/sppd_template.docx b/sppd_template.docx
index 615a6c6..01da3e8 100644
--- a/sppd_template.docx
+++ b/sppd_template.docx
@@ -1,25 +1,25 @@
 
                         PEMERINTAH KABUPATEN SUMBA BARAT
           BADAN PERENCANAAN PEMBANGUNAN, PENELITIAN DAN PENGEMBANGAN DAERAH
          Jl. Wee karou Nomor.  -  Waikabubak Provinsi Nusa Tenggara Timur
    Telp (0387) 22203 Fax (0387) 21093,Email : wesumba@yahoo.com [HYPERLINK: mailto:wesumba@yahoo.com])
                                W A I K A B U B A K
 --------------------------------------------------------------------------------
 
 --------------------------------------------------------------------------------
 	Lembar ke	: 
 --------------------------------------------------------------------------------
 	Kode No	:
 --------------------------------------------------------------------------------
-	Nomor: {NomorSPPD}	:  42 /SPPD/2025
+	Nomor: {NomorSPPD}	
 --------------------------------------------------------------------------------
 SURAT PERJALANAN DINAS (SPD)
                                        
 1.
 Pengguna Anggaran/Kuasa Pengguna Anggaran
 :
 {KpaNama}
 2.
 Nama/NIP Pegawai yang melaksanakan perjalanan Dinas
 :
 {Nama}
 NIP.{NIP}
diff --git a/www/sppd_template.docx b/www/sppd_template.docx
index 615a6c6..01da3e8 100644
--- a/www/sppd_template.docx
+++ b/www/sppd_template.docx
@@ -1,25 +1,25 @@
 
                         PEMERINTAH KABUPATEN SUMBA BARAT
           BADAN PERENCANAAN PEMBANGUNAN, PENELITIAN DAN PENGEMBANGAN DAERAH
          Jl. Wee karou Nomor.  -  Waikabubak Provinsi Nusa Tenggara Timur
    Telp (0387) 22203 Fax (0387) 21093,Email : wesumba@yahoo.com [HYPERLINK: mailto:wesumba@yahoo.com])
                                W A I K A B U B A K
 --------------------------------------------------------------------------------
 
 --------------------------------------------------------------------------------
 	Lembar ke	: 
 --------------------------------------------------------------------------------
 	Kode No	:
 --------------------------------------------------------------------------------
-	Nomor: {NomorSPPD}	:  42 /SPPD/2025
+	Nomor: {NomorSPPD}	
 --------------------------------------------------------------------------------
 SURAT PERJALANAN DINAS (SPD)
                                        
 1.
 Pengguna Anggaran/Kuasa Pengguna Anggaran
 :
 {KpaNama}
 2.
 Nama/NIP Pegawai yang melaksanakan perjalanan Dinas
 :
 {Nama}
 NIP.{NIP}
