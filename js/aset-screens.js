/* Data 16 layar Aset — sumber kebenaran grid, router, dan eager load.
   load: [namaFungsiGlobal, ...argumen]. Fungsi yang hilang dilewati tanpa error. */
window.ASET_SCREENS = [
  { key: 'master',        label: 'Aset',                icon: 'fa-cubes',           role: 'admin', load: [['loadAdminSimapoMaster', false]] },
  { key: 'kat',           label: 'Kategori',            icon: 'fa-tags',            role: 'admin', load: [['loadSimapoKategori', true, false]] },
  { key: 'mutasi',        label: 'Mutasi',              icon: 'fa-exchange-alt',    role: 'admin', load: [['loadMutasiRiwayat', false], ['populateMutasiBarangSelect']] },
  { key: 'opname',        label: 'Opname',              icon: 'fa-clipboard-check', role: 'admin', load: [['loadOpnameForm']] },
  { key: 'standar-harga', label: 'Standar Harga',       icon: 'fa-money-bill-wave', role: 'admin', load: [['loadStandarHarga', false]] },
  { key: 'bast',          label: 'Serah Terima (BAST)', icon: 'fa-file-signature',  role: 'admin', load: [['loadAdminBast', false], ['loadBastHistory', false]] },
  { key: 'pinjam',        label: 'Pinjaman',            icon: 'fa-clipboard-list',  role: 'admin', load: [['loadAdminSimapoPinjam', false]] },
  { key: 'tiket',         label: 'Tiket',               icon: 'fa-inbox',           role: 'admin', load: [['loadAdminSimapoTiket', false]] },
  { key: 'penerimaan',    label: 'Penerimaan',          icon: 'fa-truck',           role: 'admin', load: [['loadAdminPenerimaan', false], ['populateStandarHargaDatalist']] },
  { key: 'pemeliharaan',  label: 'Pemeliharaan',        icon: 'fa-tools',           role: 'admin', load: [['loadAdminPemeliharaan', false], ['populatePemeliharaanBarang']] },
  { key: 'bku',           label: 'Buku Kas Umum',       icon: 'fa-book',            role: 'admin', load: [['loadAdminBKU', false]] },
  { key: 'pks',           label: 'PKS',                 icon: 'fa-file-contract',   role: 'admin', load: [['loadAdminPKS', false]] },
  { key: 'pengaturan',    label: 'Pengaturan',          icon: 'fa-cog',             role: 'admin', load: [['loadSAPengaturan']] },
  { key: 'katalog',       label: 'Katalog Aset',        icon: 'fa-box-open',        role: 'user',  load: [['loadSimapoKatalog', false], ['loadSimapoKategori', false, false]] },
  { key: 'pinjaman-saya', label: 'Pinjaman Saya',       icon: 'fa-handshake',       role: 'user',  load: [['populateSimapoPinjamSelect'], ['loadSimapoRiwayatPinjam', false]] },
  { key: 'tiket-saya',    label: 'Tiket Kerusakan',     icon: 'fa-ticket-alt',      role: 'user',  load: [] },
];