/* Data 17 layar Aset — sumber kebenaran grid, router, dan eager load.
   load: [namaFungsiGlobal, ...argumen]. Fungsi yang hilang dilewati tanpa error. */
window.ASET_SCREENS = [
  { key: 'master',        label: 'Aset',                icon: 'fa-cubes',           role: 'admin', desc: 'Data master & unit',            load: [['loadAdminSimapoMaster', false]] },
  { key: 'kat',           label: 'Kategori',            icon: 'fa-tags',            role: 'admin', desc: 'Kelompok aset',                  load: [['loadSimapoKategori', true, false]] },
  { key: 'mutasi',        label: 'Mutasi',              icon: 'fa-exchange-alt',    role: 'admin', desc: 'Stok masuk & keluar',             load: [['loadMutasiRiwayat', false], ['populateMutasiBarangSelect']] },
  { key: 'opname',        label: 'Opname',              icon: 'fa-clipboard-check', role: 'admin', desc: 'Cek stok fisik',                  load: [['loadOpnameForm']] },
  { key: 'standar-harga', label: 'Standar Harga',       icon: 'fa-money-bill-wave', role: 'admin', desc: 'Acuan harga pasar',               load: [['loadStandarHarga', false]] },
  { key: 'bast',          label: 'Serah Terima (BAST)', icon: 'fa-file-signature',  role: 'admin', desc: 'Pengadaan & serah terima',        load: [['loadAdminBast', false], ['loadBastHistory', false]] },
  { key: 'ruangan',       label: 'Ruangan (KIR)',       icon: 'fa-building',        role: 'admin', desc: 'Kartu inventaris ruangan',         load: [['loadAsetRuangan', false]] },
  { key: 'pinjam',        label: 'Pinjaman',            icon: 'fa-clipboard-list',  role: 'admin', desc: 'Persetujuan peminjaman',          load: [['loadAdminSimapoPinjam', false]] },
  { key: 'tiket',         label: 'Tiket',               icon: 'fa-inbox',           role: 'admin', desc: 'Kerusakan yang dilapor',           load: [['loadAdminSimapoTiket', false]] },
  { key: 'penerimaan',    label: 'Penerimaan',          icon: 'fa-truck',           role: 'admin', desc: 'Barang diterima',                 load: [['loadAdminPenerimaan', false], ['populateStandarHargaDatalist']] },
  { key: 'pemeliharaan',  label: 'Pemeliharaan',        icon: 'fa-tools',           role: 'admin', desc: 'Perawatan rutin',                 load: [['loadAdminPemeliharaan', false], ['populatePemeliharaanBarang']] },
  { key: 'bku',           label: 'Buku Kas Umum',       icon: 'fa-book',            role: 'admin', desc: 'Catatan keuangan aset',           load: [['loadAdminBKU', false]] },
  { key: 'pks',           label: 'PKS',                 icon: 'fa-file-contract',   role: 'admin', desc: 'Perjanjian kerjasama',            load: [['loadAdminPKS', false]] },
  { key: 'pengaturan',    label: 'Pengaturan',          icon: 'fa-cog',             role: 'admin', desc: 'Preferensi modul aset',           load: [['loadSAPengaturan']] },
  { key: 'katalog',       label: 'Katalog Aset',        icon: 'fa-box-open',        role: 'user',  desc: 'Cari & unduh QR aset',             load: [['loadSimapoKatalog', false], ['loadSimapoKategori', false, false]] },
  { key: 'pinjaman-saya', label: 'Pinjaman Saya',       icon: 'fa-handshake',       role: 'user',  desc: 'Ajukan pinjam & riwayat',          load: [['populateSimapoPinjamSelect'], ['loadSimapoRiwayatPinjam', false]] },
  { key: 'tiket-saya',    label: 'Tiket Kerusakan',     icon: 'fa-ticket-alt',      role: 'user',  desc: 'Lapor aset rusak',                 load: [] },
];