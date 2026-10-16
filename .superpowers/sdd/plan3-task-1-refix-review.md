## commits

c00ad96 fix(spt): salin spt_template.docx ke www + rencana tambah salinan www

## stat

 docs/superpowers/plans/2026-10-16-spt-sppd-generator.md |  10 ++++++----
 www/spt_template.docx                                   | Bin 0 -> 75643 bytes
 2 files changed, 6 insertions(+), 4 deletions(-)

## diff

diff --git a/docs/superpowers/plans/2026-10-16-spt-sppd-generator.md b/docs/superpowers/plans/2026-10-16-spt-sppd-generator.md
index c056364..16f292c 100644
--- a/docs/superpowers/plans/2026-10-16-spt-sppd-generator.md
+++ b/docs/superpowers/plans/2026-10-16-spt-sppd-generator.md
@@ -234,20 +234,21 @@ Run:
 ```
 node scripts/build-spt-template.js
 node -e "const z=require('pizzip'),fs=require('fs');const x=z(fs.readFileSync('public/spt_template.docx')).file('word/document.xml').asText();['{Nomor}','{#pelaksana}{No}.','{Jabatan}{/pelaksana}','{Paraf3}'].forEach(t=>console.log(x.includes(t)?'OK '+t:'FAIL '+t))"
 ```
 Expected: `[OK] GÇª spt_template.docx GÇª bytes` dua kali, lalu empat baris `OK GÇª`.
 
-- [ ] **Step 4: Daftarkan template di Capacitor**
+- [ ] **Step 4: Daftarkan template di Capacitor + salin ke www**
 
 Modify `scripts/setup-capacitor.js:47` GÇö tambahkan `spt_template.docx` ke daftar salin, tepat setelah `bast_template.docx`.
+Lalu salin salinan APK: `Copy-Item public/spt_template.docx www/spt_template.docx -Force` (tanpa ini fitur mati di APK GÇö sama seperti `www/bast_template.docx`).
 
 - [ ] **Step 5: Commit**
 
 ```bash
-git add scripts/docx-patch.js scripts/build-spt-template.js scripts/setup-capacitor.js public/spt_template.docx spt_template.docx
+git add scripts/docx-patch.js scripts/build-spt-template.js scripts/setup-capacitor.js public/spt_template.docx spt_template.docx www/spt_template.docx
 git commit -m "feat(spt): build template SPT dari dokumen asli + helper patch docx"
 ```
 
 ---
 
 ### Task 2: Template SPPD
@@ -344,20 +345,21 @@ for (const out of OUTS) {
 Run:
 ```
 node scripts/build-sppd-template.js
 ```
 Expected: dua baris `[OK] GÇª sppd_template.docx GÇª bytes`, tanpa `[FAIL]`.
 
-- [ ] **Step 3: Daftarkan template di Capacitor**
+- [ ] **Step 3: Daftarkan template di Capacitor + salin ke www**
 
 Modify `scripts/setup-capacitor.js:47` GÇö tambahkan `sppd_template.docx` setelah `spt_template.docx` (Task 1).
+Lalu salin: `Copy-Item public/sppd_template.docx www/sppd_template.docx -Force`.
 
 - [ ] **Step 4: Commit**
 
 ```bash
-git add scripts/build-sppd-template.js scripts/setup-capacitor.js public/sppd_template.docx sppd_template.docx
+git add scripts/build-sppd-template.js scripts/setup-capacitor.js public/sppd_template.docx sppd_template.docx www/sppd_template.docx
 git commit -m "feat(spt): build template SPPD dari dokumen asli"
 ```
 
 ---
 
 ### Task 3: Logika murni generator + tes
diff --git a/www/spt_template.docx b/www/spt_template.docx
new file mode 100644
index 0000000..6a58704
--- /dev/null
+++ b/www/spt_template.docx
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
