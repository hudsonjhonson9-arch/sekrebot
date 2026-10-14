-- Native: bersihkan baris statistik_pegawai yatim.
-- Baris agregat NIP yang sudah dihapus dari user_list tidak dipakai siapa pun
-- (rekap & peringatan akumulasi JOIN user_list), tapi bikin jumlah baris
-- statistik_pegawai (49) tidak sama dengan jumlah pegawai (47).
-- Idempoten: jalankan ulang aman.

DELETE FROM statistik_pegawai s
WHERE NOT EXISTS (
  SELECT 1 FROM user_list u WHERE u."NIP" = s.nip
);
