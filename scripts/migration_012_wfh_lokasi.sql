-- migration_012: pastikan baris lokasi bernama persis 'WFH' ada.
-- Absensi WFH dikenali server dari Nama_Lokasi === 'WFH' (absen-validate.js isWFH),
-- dan hari='' berarti berlaku setiap hari (hariCocok), instansi_id='all' semua instansi.
-- Tanpa baris ini, absen WFH selalu gagal (tidak ada lokasi WFH yang cocok).
-- Idempoten: hanya menyisipkan kalau belum ada. Apply manual.
INSERT INTO lokasiabsen (id, "Nama_Lokasi", latitude, longitude, hari, radius, ip_range, instansi_id)
SELECT COALESCE(MAX(id), 0) + 1, 'WFH', 0, 0, '', 0, '', 'all'
FROM lokasiabsen
WHERE NOT EXISTS (SELECT 1 FROM lokasiabsen WHERE UPPER("Nama_Lokasi") = 'WFH');
