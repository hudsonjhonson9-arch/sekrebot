# SDD Progress — Plan 1 (2026-09-30-aset-backend-pengaturan.md)

Task 1: complete (commits 7f0dedb + 87a5ab3 + 84ddd33, BASE 9a62600, review approved after 2 fix rounds)

## Minor findings roll-up (untuk final whole-branch review)
- kosongkan: rows_dihapus dari kids di-overwrite output {success:true} p2/p3 sebelum AGG_OK (plan-mandated, kosmetik)
- kosongkan = 3 statement terpisah, bukan transaksi; retry konvergen (plan-mandated)
- nomorinventaris duplikat dalam 1 batch bisa lolos (tidak ada unique index instansi+nomor)
- node id randomUUID → diff JSON churn tiap regen (deploy map by name, aman)
- tidak ada index pada SIMAPO.barang/unit_aset.instansi_id (seq scan)
- indent stray mjs:153 (mirror di plan)
- generator belum punya mode --check (regen+diff otomatis)

Task 2: pending — BLOCKED butuh N8N_TOKEN
Task 3-5: pending

Task 2: complete (commit 85ca2b4, BASE 84ddd33, review approved)
- Minor roll-up tambahan:
  - gate reject = 200 + body kosong (plan-mandated, instance-wide; client wajib cek body, bukan status) 
  - report task-2 punya section superseded kontradiktif (doc hygiene)
  - brief/plan Task 2 header masih "(tanpa commit)" padahal 85ca2b4 ada (teks basi)
  - deploy POST fallback retry di semua non-ok → duplikat workflow kalau 500-after-persist (gate sebaiknya post.status===400)
  - wording report "7 Agg baca .json" longgar (5 reader + 2 konstanta)

Task 3: complete (commits 7049e2c + c7d7371 + 8bcf547, BASE 85ca2b4, review approved + fix round 4)
- Minor roll-up tambahan:
  - test-1 assert !r.ok || j===null masih bisa lolos 404 (backstop test-2, Minor)
  - restore pengaturan hanya cek ack.ok, tanpa re-GET persistensi; fallback old='' bisa timpa nilai asli bila GET awal gagal
  - test-1 raw fetch tanpa try/catch (network error = unhandled exception)
- report task-3 state-table "Sebelum" basi (GET {} vs run awal p1_jabatan:'')
- 3 orphan unit_aset SMOKE-TEST-% (isactive barang false → inert dari summary); cleanup hanya via SQL manual (NO ACTION, tak tersentuh webhook) — berikan SQL ke user di handoff final

Task 4: complete (commits 800014d + d7aac6d, BASE 8bcf547, review approved + fix round)
- Critical fix: `bastSubmit` tidak lagi treat gate-reject 200+empty sebagai sukses (sentinel `Empty N8n Response` → pesan Indonesia, input konfirmasi tidak dibersihkan)
- Minor roll-up tambahan:
  - gate reject pada GET `simapo-pengaturan-get` tetap senyap (`bastGet` plan-mandated: return [] tanpa error) → form tampil kosong tanpa tanda; tidak diubah (sesuai plan)
  - wording report task-4 "meng exercises `simapo-bast-ruangan`" tidak persis (client guard, bukan call site)

Task 5: complete (commit 2bb4fe2, BASE d7aac6d) — spec baris 97 dirozen-kan (cakupan kosongkan per instansi + 10 FK child) + verifikasi UI 4/4 PASS
- Browser (browser-harness, vite lokal, login NIP-tunggal role ADMIN): tab `⚙️ Pengaturan` di group `ref` tampil; save roundtrip persist (toast "Pengaturan disimpan", nilai bertahan setelah pindah tab); guard kosongkan tanpa "HAPUS" → toast error + 0 request ke server (fetch spy); regresi PKS & Aset section normal
- Regresi `simapo-bast-list` 200 + body non-empty (BAST tidak terdampak)
- Nilai uji dikosongkan kembali; 7 key aset di `public.pengaturan` kini bernilai `''` (fungsional = belum diisi; baris kosong tersisa karena endpoint set bersifat upsert)

## Review Task 5: approved (2bb4fe2, spec baris 97 identik plan L806; 10 DELETE + unit + barang cocok JSON & pg_constraint)
- Minor roll-up tambahan:
  - spec menyebut daftar tabel sebagai fakta terverifikasi, padahal endpoint kosongkan belum pernah dieksekusi end-to-end (hanya guard client) → DONE (sudah dikualifikasi di task-5-report.md)
  - report: "reload tab" sebenarnya pindah tab Aset→Pengaturan (re-render + GET), bukan page reload
  - report: "normal" pada check 4 dibuktikan dari visibilitas section, bukan render data dalam group
  - report: spy total fetch 0 (bukan hanya 0 ke endpoint); guard server "ketik HAPUS" belum diuji (di luar scope)

## FINAL whole-branch review (9a62600..2bb4fe2): ⚠️ Merge with follow-ups — Issues blocking: tidak ada
Terverifikasi langsung ke DB/diff: blok generator & test byte-identical dengan plan, BAST JSON/logika utuh, 41 node + link resolve + 7 gate identik + 9 alwaysOutputData + 7 responder, cakupan FK 12 kolom = 10 DELETE + unit + barang (ruangan/kategori/pegawai/pengaturan/tanda_tangan/arsip memang tanpa FK), tidak ada SQL injection (semua lewat esc()/Number()), wiring tab resolve by name, tidak ada secret baru di range ini.
- PENTING (follow-up, sengaja tidak diubah sekarang — kode sudah terverifikasi jalan, perubahan butuh re-verifikasi):
  1. `js/simapo-bast.js:29` + `js/config.js:409` — guard Critical Task 4 bergantung string literal 'Empty N8n Response' di dua tempat, tanpa konstanta bersama/test JS; ubah wording di config.js diam-diam mengembalikan false-success. Fix murah nanti: satu konstanta global.
  2. `scripts/test-aset-data.mjs:88-94` — test kosongkan hanya menguji penolakan (tidak ada panggilan destruktif di suite sekarang); kalau suatu saat guard direvisi dan test jadi memanggil confirm='HAPUS', penghapusan terjadi sebelum assert. Tambahkan interlock `ALLOW_DESTRUCTIVE` saat需要的.
- Minor lain: `body !== null` di bastSubmit:31 kondisi mati (apiFetch tidak pernah null); 4 konstanta P.* belum punya konsumen UI dan path test hardcoded terpisah dari config (rename path = ubah 2 tempat).

## Follow-up final: #1 DONE (2 commit), #2/#3/#4 tetap follow-up
- `d173ed4` — satu konstanta global `EMPTY_N8N_RESPONSE` (js\config.js:100) dipakai apiFetch (config.js:411) & bastSubmit (simapo-bast.js:29); literal 'Empty N8n Response' sekarang nol di repo; cache-buster `?v=` di-bump untuk kedua file (config.js → 20260720b, simapo-bast.js → 2) supaya tidak mismatch di browser yang sudah cache.
- `0977873` — review menemukan penghapusan `body !== null` = regresi Important (`res.json()` throw saat 200 → body null → `isApiSuccess(null)` true → false-success); guard dikembalikan + komentar ponytail. Re-review lulus, blocking: tidak ada.
- Review juga menemukan false-success PRE-EXISTING di `isApiSuccess` fallback (js\api.js:101): 200 + body non-JSON → `return httpOk` = true. Di luar scope Plan 1; catat sebagai follow-up (fix murah: `return false` di fallback).
- Chrome remote-debugging permission sudah tidak aktif → verifikasi browser untuk 2 commit terakhir tidak diulang; guard ini identik logikanya dengan versi yang sudah PASS di browser (Task 4/5), `node --check` + load order + grep satu-satunya literal jadi bukti statis.
- Follow-up tersisa: (a) interlock `ALLOW_DESTRUCTIVE` di test kalau suatu saat ada panggilan `confirm='HAPUS'`; (b) 4 konstanta P.* tanpa konsumen UI / path test terduplikasi; (c) false-success non-JSON di js\api.js:101; (d) rapikan skema cache-buster (`2` vs tanggal).

# SDD Progress - Plan 2 (2026-10-08-login-web-nontelegram-implementation.md)

Task 1: complete (commits ee9cdb3 + fd2db70, BASE 2789426, review approved after 1 fix round)
- Critical fix: USERS_BY_NIP_SQL kini SELECT * + ` `NIP` AS nip, username AS nama ` (skema asli tak punya kolom nip/nama); mock test diubah ke bentuk row asli
- Keputusan user: login response TETAP full row (biometrik ikut) demi face-verify auth.js; threat model NIP-only diterima
- Minor roll-up:
  - tak ada test yang guard kolom full-row (face_histogram/face_photo) di response login -> regresi narrowing lolos
  - task-1-report.md bagian pre-fix basi (SQL lama +84 vs +99)
  - auth-session.test.js tanpa trailing newline
  - test terakhir set TELEGRAM_BOT_TOKEN tanpa restore (brief-mandated, urutan terakhir)
  - ` node --test server/ ` tak discover file di box ini -> pakai node --test 'server/*.test.js'

Task 2: complete (commit ff59ff6, BASE fd2db70, review approved, no issues)
- Catatan: cache-bumper ?v=20261008a di kedua index.html (controller-injected, di luar teks plan, disetujui reviewer)

Task 3: complete (commit 8e6ad08, BASE ff59ff6, review approved, no Critical/Important)
- Minor: sessionToken tanpa existence check di auth.js:64 (brief-mandated, hardening only)
- Reviewer ⚠️ localStorage read-side: controller verifikasi = key sama persis dengan blok lama, tak ada gap

Task 4: complete (verifikasi E2E Chrome produksi, commit 8e6ad08)
- Login NIP 200206302025061002: POST /api/auth/login 200, overlay hilang, token 192-hex, 40+ /api/* semua 200 termasuk user-list?format=full
- Bearer: Bearer <192-hex> (len 199) di wajah API call, 200
- Error path: NIP 000000 -> alert 'NIP tidak terdaftar.', token 0, overlay tetap
- Task 5: push origin+sekrebot bfc9be7..8e6ad08, redeploy Coolify selesai 12:18:57 UTC, probe health/root 200

Task 5: complete (push bfc9be7..8e6ad08 origin+sekrebot, redeploy user 12:18 UTC, probe / & /api/health 200, login re-verified)

Final whole-branch review: Needs fixes -> 1 Important (N1: face_histogram '[]' truthy blok photo-regen fallback). Fix a1f29a2: guard descriptorOrEmpty, cache-buster auth.js?v=20261008b, test kontrak full-row, env restore, trailing newline. Pushed 2 remote.
Minor roll-up: N2 cancel/fail tinggalkan _native_token 12h (ledger), N3 async route tanpa try/catch (konvensi saudara, fix saat sentuh file), N4 report task-4/5 basi (ditulis ulang).
MENUNGGU: redeploy Coolify (a1f29a2) + smoke test.


# SDD Progress - Plan 3 (2026-10-16-spt-sppd-generator.md)

BASE awal: a0e370c (branch master, keputusan user: implementasi langsung di master)

Task 1: complete (fc39260) - docx-patch.js + build-spt-template.js + public/spt_template.docx (75643 B, 18 tag)
  Review: 1 Important -> www/spt_template.docx hilang. Fix c00ad96 (+ plan: langkah copy/git add utk Task 1 & 2). Re-review APPROVED (byte-identical + tag OK).
Task 2: complete (8d53fb7) - build-sppd-template.js + public/sppd_template.docx (67422 B, 23 tag)
  Review: 1 Important (root cause) -> SPPD para 8 sisa ":  42 /SPPD/2025" karena <w:r> pertama punya DUA <w:t>, rewriteWhole hanya menimpa yang pertama.
  Fix db2700d di scripts/docx-patch.js: rewriteWhole per-<w:t>, + parText + assertion applyByIndex (wholeMap & blankList); rebuild KEDUA template.
  SPT blob hash 6a58704e->9166a693 hanya karena timestamp zip (word/document.xml identik). Re-review APPROVED.
Task 3: complete (b0cf742) - js/tugas-spt.js + tests/tugas-spt.test.mjs (7 tes) + package.json + index.html + www/js/tugas-spt.js + www/index.html
  focused 7/7, full 510/510. 2 deviasi di-rule BENAR oleh reviewer: (a) sisa() trim spasi ekor terbilang (kode plan kontradiksi tesnya sendiri);
  (b) path www/js/ bukan www/ (setup-capacitor.js:43 menyalin js/ -> www/js/). Review APPROVED.
  Sinkron plan 28dda18 (6x www/js/, snippet terbilang + sisa()), brief diregenerasi.
Task 4: complete (3e8a7be) - server/overtime.js POST /penugasan/perjadin + fix INSERT nomor_surat ($12, 12 kolom/12 placeholder konsisten)
  + tests/penugasan-perjadin.test.mjs BEHAVIORAL (express harness + fake query; menolak source-grep plan). RED 0/4 -> GREEN 4/4, full 514/514.
  Review: APPROVED, 0 Critical/Important. Minor: assertion `!calls.some(UPDATE_RE)` near-tautolog (bukti asli = assert 403); Test 4 jalur INSERT independen (scoping benar).
Task 5: complete (a0b3c95) - js/tugas-spt.js (masterIndex ASYNC + generate + simpanPerjadin + DOM glue modal), js/simapo-bast.js (bastRenderDocx + param templateUrl), js/config.js (penugasanPerjadin), index.html, css/styles.css + mirror www/*, tests/tugas-spt.test.mjs (11 tes), plan doc.
  focused RED 9/11 -> GREEN 11/11, full 518/518. sha1 mirror www/js/* = js/* semua true.
  Deviations sah: P.userList dijaga guard (P top-level const, tak ada di window); personTag TIDAK diubah (tes lama menang); ikon fa-print (fa-file-word absen di runeicons.css).
  Review: APPROVED. 3 Minor -> (a) spec belum diupdate padahal diminta brief, (b) cache-bust css/styles.css belum naik (stale webview), (c) masterIndex meng-cache hasil gagal fetch.
  TEMUAN CONTROLLER (sebelum dispatch): plan Step-4 masterIndex() baca global yang TIDAK ADA (MASTER_PEGAWAI/_masterPegawai)
  -> PangkatGol & Jabatan pelaksana akan KOSONG di surat. Verifikasi: /api/user-list (server/core-admin.js:69-70, MEDIA=ADMIN/SUPERADMIN/KEPALA/SEKRETARIS/KABID/IRBAN)
  mengembalikan `pangkat` + `"Jabatan" AS jabatan`; _allPegawaiTugas (tugas_lembur.js:601-621) TIDAK memuat pangkat. Penugasan rows (SELECT *) juga tanpa pangkat/jabatan.
  -> Task 5 wajib pakai masterIndex ASYNC dari apiGet(P.userList) ter-scope instansi_id + warn bila pangkat/jabatan kosong.

Roll-up Minor (final whole-branch review):
  1. Duplikasi primitif docx-patch.js vs build-bast-template.js (plan-mandated, sengaja).
  2. Rebuild template -> blob hash baru (timestamp zip non-deterministik, isi identik) -> diff berisik.
  3. Commit db2700d subject scope (spt) padahal cacat SPPD.
  4. Plan Task 4 Step 1 masih teks source-grep (implementasi pakai behavioral) - belum disinkronkan di titik itu.

Task 6: complete (1e1dd7a) - tombol cetak SPT/SPPD di kartu Monitoring Perjalanan Dinas.
  js/tugas_lembur.js renderMonitoringTasks (grupList render-time, tombol .btn-cetak-spt[data-grup], window.__tugasGrup[gi] di-reassign tiap render,
  guard dataset.grup !== '' untuk bug Number('')===0), tests/tugas-spt-wiring.test.mjs (+5 tes), package.json, index.html, www/index.html + mirror JS.
  Wiring RED 2/5 -> GREEN 5/0, full 523/523. Review: APPROVED + 1 Important (plan-mandated): tes wiring hanya uji KEBERADAAN, bukan BINDING id->grup.

FIX ROUND (controller, 08668f4, 4 file, +52/-12) - menutup Important Task 6 + Minor Task 5 (a)(b):
  - tests/tugas-spt-wiring.test.mjs: tes ke-5 (tautolog) diganti harness DOM-tiruan yang MENJALANKAN renderMonitoringTasks via new Function('window','$','_activeMonitoringTasks'),
    menangkap markup .btn-cetak-spt dari el.innerHTML, memanggil listener tertangkap, assert data-grup vs oracle kelompokkan + grup yang benar-benar dibuka (klik 2 tombol). Input diacak vs urutan grup.
  - Mutasi dibuktikan: grup0, kartu, bukagrup0, tanpabutton -> SEMUA CAUGHT; baseline 5/0; restore bersih.
  - cache-bust css/styles.css ?v=43/?v=23 -> ?v=20261016a (index.html + www/index.html).
  - spec §5 + §9: catat reuse bastRenderDocx(tags, filename, templateUrl).
  Re-review APPROVED (independen): baseline 5/0, 4 mutasi CAUGHT, probe tambahan (registrasi listener ditiadakan) juga CAUGHT.
  Kelemahan sisa: oracle & implementasi sama-sama panggil TugasSPT.kelompokkan -> bug DI DALAM kelompokkan tak terdeteksi.

TES PENJAGA BARU (bcf72cb) - tests/spt-template-tags.test.mjs (4 tes, paket -> 527):
  render template nyata (PizZip + docxtemplater 3.71.0) dengan tags dari builder; nullGetter mencatat tag template yang TIDAK punya nilai
  -> menangkap mismatch nama tag (surat kosong) yang tak terlihat oleh tes unit mana pun. Plus assert nilai kunci benar-benar masuk & SPPD tak menyisakan nomor/tahun template lama.
  Mutasi Nomor->NomorX, PangkatGol->PangkatGolX -> 0/4 (gagal, pesan menunjuk tag kosong); restore 4/4. Ini satu-satunya tes yang menyambung builder <-> template.

VERIFIKASI BROWSER (vite :5173, chrome-devtools) - HIJAU:
  semua modul termuat (TugasSPT 14 export, bastRenderDocx/PizZip/docxtemplater/showToast function), urutan script tugas-spt.js(46) < tugas_lembur.js(51),
  cache-bust ?v=20261018, #perjadinModal + #perjadinForm + 12 field nama hadir, P.userList + P.penugasanPerjadin terisi, 0 console error (hanya 3 warning Telegram pre-existing).
  TIDAK dilakukan: click-through pasca-login (isi form -> unduh docx -> simpan perjadin) - butuh kredensial uji.

Roll-up Minor tambahan (final whole-branch review):
  5. Tes wiring: oracle memakai kelompokkan yang sama dengan implementasi (bug internal kelompokkan saling menghapus).
  6. masterIndex meng-cache hasil gagal fetch (error sementara -> dialog kosong sampai reload).
  7. Plan Task 5 Step 6 (uji manual :5173) baru terverifikasi sampai smoke; click-through butuh kredensial.
  Sudah SELESAI dari daftar Task 5 Minor: (a) spec diupdate, (b) cache-bust css dinaikkan.

FIX ROUND FINAL REVIEW (controller, 8aae9a2, 5 file, +273/-9) - menutup 2 temuan Important final review:
  Important #1 (blok penandatangan tak bisa diedit; nama pejabat BAPPERIDA hardcode):
    js/tugas-spt.js + cariPejabat(masterIndex, re) + defaultsDariMaster(masterIndex) (regex /^Kepala Badan/i, /^Sekretaris/i dari /api/user-list);
    bukaModal -> async, await masterIndex, pakai defaultsDariMaster hanya bila perjadin grup belum punya kepala/sekretaris.
    Terverifikasi di BROWSER (halaman segar, window.apiGet di-fake): master berisi "Kepala Badan"/"Sekretaris" -> dialog prefill "Pejabat Kepala"/"Pejabat Sek"
    (BUKAN "CHARLES HERMANA WERU,S.Sos"); tanpa sesi login -> jatuh ke DEFAULT_PERJADIN (jalur terdegradasi yang benar).
  Important #2 (tak ada validasi field wajib sebelum generate):
    FIELD_WAJIB + validasiPerjadin(p) (merge dulu -> cek maksud/tempatTujuan/tanggalBerangkat/tanggalKembali); guard awal generate -> toast 'Wajib diisi: ...' + return false (render tak disentuh);
    handler submit menandai field kurang borderColor #dc3545 (inline, tanpa CSS baru -> cache-bust css tak perlu dinaikkan).
    Terverifikasi di BROWSER (#perjadinForm.requestSubmit dgn 4 field kosong): toast tepat, borderMaksud=rgb(220,53,69), modal TETAP terbuka (tidak menutup).
  UI: 9 input "Penandatangan" di #perjadinModal (ditetapkanDi, kepala{Nama,Pangkat,NIP}, sekretaris{Nama,NIP}, paraf1..3) di index.html DAN www/index.html (2x9/9); cache-bust js/tugas-spt.js ?v=20261018 -> ?v=20261019; mirror www (sha1 True).
  Tes: tests/tugas-spt.test.mjs +4 (validasiPerjadin, defaultsDariMaster, generate tolak + kontrol positif 2 render, paritas modal<->kode) -> file 15 tes, suite 531/531.
  Falsifiabilitas dibuktikan via MUTASI (backup file, BUKAN git checkout): guard->tes14 fail; pejabat->tes13 fail; paraf1x di index.html->tes15 fail;
    kepalaNama dihapus dari readForm->tes15 fail; set(paraf3) dihapus->tes15 fail; sekretarisNIPx di www/index.html->tes15 fail. Baseline & restore 15/0.
  CATATAN PROSES (penting): mutasi pertama saya memakai `git checkout --` pada file ber-perubahan-belum-commit -> menghapus 3 file kerja (js/tugas-spt.js, index.html, +1).
    Dipulihkan penuh dari salinan mirror www/js/tugas-spt.js + re-apply edit html; sha1 mirror diverifikasi ulang True. PELAJARAN: bukti mutasi WAJIB pakai cadangan file, jangan git checkout.
  Plan doc diberi amandemen fix round (blok penandatangan + validasi) -> plan:970-993.
  Minor sisa (tak ditutup, dipandang tak perlu): paritas readForm/fillForm diuji 3 himpunan terpisah (baca/isi/form) supaya field yg ada di form+fillForm tapi tak dibaca TIDAK lolos (sempat lolos sebelum diperketat).
RE-REVIEW FIX ROUND (8aae9a2) -> NEEDS-FIX (minor) oleh reviewer independen. Diterima SEMUA temuan (terverifikasi benar):
  Important #1 & #2: CLOSED (reviewer konfirmasi dgn file:line).
  Cacat tes (nyata, dibuktikan reviewer dgn mutasi): tes paritas hanya cek KEBERADAAN nama field.
    M3 `KepalaNama: ''` -> 534/534 masih lolos; M4 `readForm: p.kepala -> p.kepalaX` -> 15/15 masih lolos. Nilai pejabat bisa tak sampai ke dokumen tanpa ada tes yang gagal.
  Medium #1: bukaModal menaruh `modal.style.display='flex'` SETELAH `await masterIndex` -> /api/user-list lambat = dialog tak muncul.
  Medium #2: masterIndex meng-cache hasil fetch GAGAL -> pejabat/pangkat hilang untuk SEMUA dialog berikutnya sampai reload (mekanisme lama, tapi fix #1 kini bergantung padanya).
  Low #3: border merah validasi tak pernah dibersihkan fillForm -> dialog dibuka ulang masih merah.

FIX ROUND 2 (c36809a, 5 file, +147/-31) - menutup 2 Medium + 1 Low + lubang tes:
  js/tugas-spt.js: helper `setField(n,v)` (isi + bersihkan borderColor) dipakai fillForm & bukaModal;
    bukaModal: `fillForm(p); modal.style.display='flex';` SEBELUM await master, master menyusul via setField 6 field;
    masterIndex: `_masterCache = out;` dipindah KE DALAM try (cache hanya saat sukses);
    readForm(perjadinAwal) opsional; export readForm/fillForm; cache-bust js/tugas-spt.js ?v=20261020.
  tests/tugas-spt.test.mjs: 15 -> 18 tes:
    (a) readForm/fillForm lewat DOM tiruan dua arah (menutup M4);
    (b) kontrol positif generate kini assert nilai masuk tag: tags[0].KepalaNama/KepalaNIP/Paraf1/Paraf3 + tags[1].SekretarisNama/NIP (menutup M3);
    (c) masterIndex: kegagalan fetch TIDAK di-cache (menutup Medium #2);
    (d) bukaModal: dialog flex SEBELUM master balas, via apiGet yang di-pending (menutup Medium #1);
    (e) tes paritas + assert buffer js vs www identik (mirror APK tak bisa lagi basi diam-diam).
  Mutasi divalidasi ulang (cadangan file + Copy-Item, TIDAK pakai git checkout): tagnama->tes15; readform->tes16; border->tes16; cache->tes12; mirror->tes17; modalorder->tes13. Baseline & restore 18/0.
  Suite penuh 534/534. Browser (vite :5173, ?v=20261020): readForm/fillForm ada, dialog flex @85ms saat master masih pending 800ms, kepalaNama terisi 'Pejabat Kepala' dari master, validasi toast+border merah+modal tetap terbuka, fillForm membersihkan border, 22 kontrol form, 0 console error.
  CATATAN: cache-bust WAJIB dinaikkan tiap js/ berubah - sempat tertipu cache browser (?v=20261019) sampai dinaikkan ke 20261020.
RE-REVIEW FIX ROUND 2 (c36809a) -> APPROVED oleh reviewer independen. M3 & M4 direproduksi sendiri: mutasi `KepalaNama: ''` di js:150 -> GAGAL tes generate (expected 'Kepala Uji', actual ''); mutasi `p.kepala` -> `p.kepalaX` di js:296 -> GAGAL tes readForm/fillForm. Medium #1/#2 + Low #3 PASS dgn file:line. Suite 534/534, tes file 18/18. Nol perubahan file oleh reviewer.
  Sisa catatan (Low, ditutup di cd4d34b):
    (a) nilai tag SPPD `KpaNama` (js:164) & `KepalaNama` SPPD (js:181) tak di-assert -> mutasi lolos. Ditutup: 2 assert baru; mutasi baris 164/181/184 kini GAGAL tes generate.
    (b) BALAPAN yang saya sendiri ciptakan di c36809a: dialog kini tampil sebelum master selesai -> submit cepat (master lambat) mencetak nama DEFAULT_PERJADIN, bukan nama master.
        Ditutup: `tungguMaster(ms)` (batas 1,5 dtk) + `_siapMaster` promise dicatat di bukaModal; handler submit `await tungguMaster()` SEBELUM `readForm()`.
        ponytail: batas waktu mencegah tombol menggantung bila /api/user-list tak pernah balas; nilai yang terlihat = yang tercetak.

FIX ROUND 3 (cd4d34b, 5 file, +79/-12):
  js/tugas-spt.js: `let _siapMaster`, `tungguMaster(ms)` (Promise.race dgn batas waktu), bukaModal mencatat promise (bukan await), submit `await tungguMaster()` sebelum readForm, export +tungguMaster; cache-bust js/tugas-spt.js -> ?v=20261021.
  tests/tugas-spt.test.mjs: 18 -> 20 tes:
    (a) `tungguMaster: submit menunggu master, tapi tak menggantung bila master lambat` - dua sisi: menunggu selama master tertunda (assert selesai===false) DAN tetap lanjut lewat batas waktu saat master menggantung.
    (b) `submit menunggu master SEBELUM membaca form` - assert urutan sumber (await tungguMaster < const p = readForm) karena handler submit hanya terpasang di browser.
    Pelajaran: `fresh()` kedua JANGAN dipanggil saat shim globalThis.document sudah terpasang (modal tiruan tanpa `.dataset` -> initPerjadinModal TypeError). Ambil semua `fresh()` di awal tes.
  Mutasi divalidasi (cadangan file + Copy-Item): tunggumaster->tes14; hapus `await tungguMaster()`->tes15; kpanama->tes17; baris181/184->tes17. Baseline & restore 20/0.
  Suite penuh 536/536. Browser (vite :5173, ?v=20261021): 6 export (tungguMaster ada), dialog flex @1ms saat master tertunda, KLIK SUBMIT saat master tertunda -> setelh tunggu kepalaNama = 'Pejabat Kepala' (nilai master, bukan DEFAULT_PERJADIN), toast 'Wajib diisi: Maksud, Tempat Tujuan, Tanggal Berangkat, Tanggal Kembali', modal tetap terbuka, 0 console error (3 warning Telegram pre-existing). Sisa: E2E click-through penuh (butuh kredensial login) + push.
DIAGNOSA PRODUKSI (user: tombol SPT/SPPD tampil di https://absensi.mindcloud.my.id tapi klik TIDAK memunculkan dialog):
  Probe live: tag js/tugas-spt.js?v=20261021 200, window.TugasSPT lengkap (21 ekspor), #perjadinModal ada, js/tugas_lembur.js 200 + btn-cetak-spt + panggil TugasSPT.bukaModal -> lapisan JS sehat; gagal di VISIBILITAS.
  Bukti: bukaModal di live -> display:flex TAPI position:static, z-index:auto, getBoundingClientRect().top=1740 dgn viewport 844 -> dialog terbuka 1740px di bawah layar (di luar layar).
  Akar: #perjadinModal dikasih class="modal-overlay" yang TIDAK punya aturan CSS apa pun (app ini pakai class ber-prefix: .ket-modal-overlay, .dok-modal-backdrop, .arsip-modal; tak ada .modal/.modal-overlay generik). Yang ada cuma styling anak (.modal-content/.form-group) tanpa fixed/z-index.

FIX ROUND 4:
  css/styles.css: #perjadinModal -> pola .ket-modal-overlay (position:fixed, inset:0, bg rgba(0,0,0,.65), z-index:9000, bottom-sheet mobile / terpusat >=768px); .modal-content radius 16px 16px 0 0 mobile. display:none tetap dari inline HTML; JS display:flex menang. Mirror www/css/styles.css (byte-identik).
  index.html:63 + www/index.html:63: cache-buster styles.css ?v=20261016a -> ?v=20261021.
  Verifikasi (vite :5173): setelah bukaModal -> position:fixed, z-index:9000, rect 0..844 (viewport 844), terpusatX, terlihat:true; screenshot: dialog Detail Perjalanan Dinas tampil dgn backdrop + form terisi default. Suite 536/536.
  Sisa: user Redeploy Coolify + hard refresh (Ctrl+Shift+R) lalu klik tombol; E2E click-through penuh (butuh kredensial).

E2E PRODUKSI (live https://absensi.mindcloud.my.id) - LOLOS: login NIP-only 200206302025061002 (SUPERADMIN); dialog tampil (position:fixed, z-index:9000, rect 0..844, screenshot); isi 4 field wajib + Cetak -> POST /api/penugasan/perjadin 200 {"ok":true,"updated":1} (baris f6544eac-6de9-4f1d-8d11-4d4aabb3e16b), spt_template.docx 200 + sppd_template.docx 200 (docx dirender client-side, bukan round-trip server); ISI kedua docx diverifikasi dgn cegat anchor + baca blob via window.PizZip: nama/pangkat/NIP/jabatan dari master, "1. Monitoring dan evaluasi aplikasi di Kupang.", "2 (Dua) Hari", biaya C, sekretaris + KTU, 3 paraf.
  Temuan E2E: (1) hanya .docx PERTAMA mendarat di Downloads - Chrome memblokir unduhan otomatis ke-2 dst ("multiple automatic downloads") -> SPPD hilang SENYAP (generate() js/tugas-spt.js:256 dulu mengabaikan nilai balik render SPPD); (2) tanggal surat meleset 1 hari: dokumen "15 Oktober 2026" vs kartu "Jumat, 16 Oktober 2026" karena toDate() memotong bagian TANGGAL UTC dari 2026-10-15T16:00:00.000Z (kartu pakai new Date + toLocaleDateString WITA); (3) GET /api/simapo/pks-list&type=program 404 (pre-existing, di luar scope).

FIX ROUND 5 (bundle zip + tanggal + poles modal):
  js/simapo-bast.js: bastRenderDocxBlob(tags, templateUrl) = inti render (kembalikan blob|null, TANPA efek samping); unduhBerkas(blob, nama); unduhZipBerkas([{nama,blob}], namaZip) via PizZip -> 1 unduhan; bastRenderDocx kini wrapper tipis (blob + unduh) sehingga bastPreviewDocx dkk tak berubah.
  js/tugas-spt.js: toDate() hanya parse sendiri bila TANPA 'T'; string berwaktu (…T…Z) diserahkan ke new Date supaya harinya sama dgn kartu monitoring (bug 15 vs 16 Oktober).
    generate(): kumpulkan blob SPT+SPPD, FAIL-FAST bila ada blob null (SPPD tak lagi senyap), lalu unduh SATU .zip 'SPT-SPPD_<tgl>.zip'; nama entri disanitasi [^\w.-]+ -> '_' (':' ilegal di Windows, Chrome sudah menyulapnya jadi '_').
  tests/tugas-spt.test.mjs: 20 -> 21 tes. tanggalID + assert konsistensi lintas TZ (tanggalID(timestamp) === new Date(ts).toLocaleDateString('id-ID',…)); stub generate diganti ke bastRenderDocxBlob + unduhZipBerkas dan kini meng-assert isi zip (SPT_2026-07-02.docx + SPPD_111_2026-07-02.docx, nama 'SPT-SPPD_2026-07-02.zip', tepat 1 unduhan); tes baru "generate: SPPD gagal -> batal, tidak ada unduhan zip". Suite 537/537.
  Poles modal (index.html + www/index.html): blok #perjadinModal -> class perjadin-modal/head/body/sect/foot (inline style dihapus). css/styles.css: panel flex-column max-height:100%; .perjadin-head + .perjadin-foot STICKY sehingga hanya .perjadin-body menggulir (tombol Cetak tak lagi hilang di balik gulungan 21 field); .perjadin-grid 1 kolom mobile / 2 kolom >=768px; footer full-bleed via margin negatif; @media max-width:360px tombol jadi 1 kolom; + .btn-secondary GLOBAL (sebelumnya TIDAK punya aturan apa pun -> tombol Batal tampil seperti teks polos, juga di modal lain index.html:3242).
  Cache-bust (kedua index): styles.css ?v=20261021 -> 20261022, simapo-bast.js ?v=20261016a -> 20261022, tugas-spt.js ?v=20261021 -> 20261022. Mirror www/js/{tugas-spt,simapo-bast}.js + www/css/styles.css (SHA256 identik).
  Verifikasi browser (vite, emulasi viewport): 390x844 -> bottom-sheet, header+footer tetap, body menggulir (clientH 763 / scrollH 1736), grid 1 kolom 412px, .btn-secondary border 1px + radius 13px; 1100x900 -> panel terpusat 560px (270..830), grid 2 kolom 249.5px. 21 field ter-wiring, 0 console error. Screenshot: temp\perjadin_mobile_390.png, temp\perjadin_desktop_1100.png.
  JEBAKAN (jangan diulang): `Set-Content -Encoding UTF8` di PS 5.1 menulis BOM DAN membaca UTF-8-tanpa-BOM sebagai ANSI -> mojibake di setiap baris ber-non-ASCII (index.html 187/181 baris). Pemulihan: cadangkan dulu (temp\perjadin_mojibake\*.bak), balikkan dari HEAD via `cmd /c "git show HEAD:index.html > tmp"`, verifikasi `git hash-object tmp` == `git rev-parse HEAD:index.html`, baru ulangi edit HANYA dengan tool edit (diff jadi 43/37, tanpa BOM, tanpa mojibake).
  Sisa: user Redeploy Coolify + hard refresh -> cek 1 klik = 1 .zip berisi SPT+SPPD dan tanggal surat = tanggal kartu.

# SDD Progress - Plan 4 (ttd / penandatangan-terpilih) — Task 1
Task 1: complete (feat(spt): paraf jadi pilihan pegawai (nama+jabatan), tambah data bidang & KTU) - model data & tag
  js/tugas-spt.js: DEFAULT_PERJADIN +bidang/+ktu, paraf jadi {nip,nama,jabatan}; merge normalisasi; parafTeks(nama+jabatan dua baris, legacy jabatan-saja tetap 1 baris); defaultsDariMaster kembalikan 4 kunci (bidang/Kepala Bidang, ktu/KTU) ; validasiPerjadin +parafKurang (3 slot wajib); bangunTagsSPT Paraf1..3 via parafTeks; bangunTagsSPPD +BidangNama/NIP, KtuNama/NIP, Paraf1..3. Mirror www byte-identik (Get-FileHash).
  tests/tugas-spt.test.mjs: 21->26 tes; 2 assertion defaultsDariMaster lama diubah ke bentuk 4 kunci. TDD: RED 20/6 (bidang/ktu/paraf-barukan belum ada) -> GREEN 26/26; npm test 542/542.

TASK 1 (plan TTD/PARAF) SELESAI: commit 29947fd 'feat(spt): paraf jadi pilihan pegawai (nama+jabatan), tambah data bidang & KTU'. Review task: APPROVED (0 Critical/0 Important; 2 catatan Minor -> dibawa ke Task 3: readForm fallback jabatan wajib dibuang; cache-bust ?v= di Task 3). Focused 26/26, full npm test 542/542.

TASK 2 (plan TTD/PARAF) SELESAI: sppd_template.docx ditambahi tag {BidangNama}/{BidangNIP} (ganti nama keras BERLIAN MAGU WERU + Nip), sel KTU kosong -> {KtuNama}+NIP. {KtuNIP}, dan tabel paraf SPT (TableGrid, font diubah ke Arial) disalin sebelum <w:sectPr>. 23 tag lama + 7 tag baru = 30 tag; 3 salinan byte-identik. Skrip jejak scripts/patch-sppd-template.mjs idempoten. TDD: tests/spt-template-tags.test.mjs +2 tes, RED -> GREEN; npm test 544/544.

TASK 2 (plan TTD/PARAF) SELESAI: commit 4291637 'feat(spt): sppd_template memuat tag bidang/KTU + tabel paraf (3 salinan)'. Review task: APPROVED (0 Critical/0 Important). Verifikasi independen: 30 tag (23 lama + 7 baru), 3 salinan sha256 81077c3396c05bb4 identik, tabel paraf = elemen terakhir sebelum <w:sectPr>, Arial (0 Bookman), script fail-loud + idempoten. npm test 544/544. 4 temuan MINOR sengaja DITUNDA (kosmetik; akan dilihat di final review): (a) script: guard idempoten dihitung setelah parafTbl dibaca; (b) replace tc2 tanpa assert jumlah-kejadian; (c) tes: ROOT di-shadow; (d) tes paraf tak meng-assert label header 'Paraf Hirarki'/'1.'.

TASK 3 (plan TTD/PARAF) SELESAI: form #perjadinModal pakai <select> pegawai (kepalaNip/sekretarisNip/bidangNip/ktuNip + paraf1..3; opsi dari masterIndex teks 'Nama — Jabatan', value=NIP, placeholder '— pilih —'), data lama {jabatan} dipetakan ke NIP; readForm fallback paraf DIHAPUS, _siapMaster selalu diisi. TDD tes diganti 2 + tambah 1 (RED 26/2 -> GREEN 28/28); npm test 546/546.

FIX ROUND Task 3 (plan TTD/PARAF) - 2 temuan Important + Minor:
  Finding 1 (nilai ttd tersimpan hilang saat modal pertama dibuka): fillForm jalan saat <select> masih NOL <option> -> el.value=nip no-op; isiOpsiPegawai menyimpan '' dan memulihkannya kosong. Fix: setelah isiOpsiPegawai & SEBELUM cabang default punya.*, terapkan ulang nilai tersimpan p ke 7 select via setField LITERAL (kepalaNip/sekretarisNip/bidangNip/ktuNip/paraf1..3, paraf dari p.paraf[i].nip + nipCocok jabatan utk data lama).
  Finding 2 (parafKurang tak terjangkau): parafDariForm !e mengembalikan lama.jabatan (default) -> 3 paraf "wajib" tak ditegakkan. Fix: !e -> {nip:'',nama:'',jabatan:''}.
  Minor: .catch(()=>{}) -> .catch(e => console.error('[SPT] muat master gagal:', e)); hapus const dibuat (mati) di tes isiOpsiPegawai.
  Tes: harness <select> diperkuat (SelectTiruan; .value tanpa option cocok = no-op) + tes bukaModal perjadin-tersimpan + tes readForm/validasiPerjadin 3-paraf-kosong; 1 tes lama disesuaikan ke spec Finding 2. RED 27/3 -> GREEN focused 30/30, full npm test 548/548. Mirror www/js byte-identik. Tidak menyentuh index.html/www/css/templates.