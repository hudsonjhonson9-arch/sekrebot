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

