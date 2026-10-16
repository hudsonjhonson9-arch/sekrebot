// js/tugas-spt.js — generator Surat Perintah Tugas (SPT) & SPPD dari penugasan.
// Client-side, meniru pola BAST. Top level TIDAK menyentuh DOM supaya bisa diuji.
(function () {
  'use strict';

  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const SATUAN = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh',
    'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];

  function terbilang(n) {
    n = Math.abs(Math.round(Number(n) || 0));
    if (n < 12) return SATUAN[n];
    if (n < 20) return terbilang(n - 10) + ' Belas';
    if (n < 100) return terbilang(Math.floor(n / 10)) + ' Puluh' + sisa(n % 10);
    if (n < 200) return 'Seratus' + sisa(n - 100);
    if (n < 1000) return terbilang(Math.floor(n / 100)) + ' Ratus' + sisa(n % 100);
    return String(n);
  }

  // ponytail: sambung ekor hanya bila ada, supaya "Tiga Puluh" tak berjejak spasi.
  function sisa(r) { return r ? ' ' + terbilang(r) : ''; }

  // ponytail: parse tanggal-only sendiri (bukan new Date(str)) supaya tidak geser hari
  // akibat timezone. Upgrade path: pakai Temporal bila sudah tersedia di target.
  function toDate(v) {
    if (!v) return null;
    const s = String(v);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function tanggalID(v) {
    const d = toDate(v);
    if (!d) return v ? String(v) : '';
    return d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear();
  }

  function lamaHari(a, b) {
    const d1 = toDate(a), d2 = toDate(b);
    if (!d1 || !d2) return '';
    const n = Math.round((d2 - d1) / 86400000) + 1;
    if (n <= 0) return '';
    return n + ' (' + terbilang(n) + ') Hari';
  }

  function kunciGrup(r) {
    return [r.tanggal || '', r.keterangan || '', r.created_by_nip || ''].join('|');
  }

  function kelompokkan(rows) {
    const map = new Map();
    for (const r of rows || []) {
      const k = kunciGrup(r);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
    return Array.from(map.entries()).map(([kunci, items]) => ({
      kunci, items, perjadin: items[0].perjadin || null
    }));
  }

  const DEFAULT_PERJADIN = {
    nomor: 'BP4D.011.7/69/53.12/ST/01/2026',
    nomorSPPD: '001/SPPD/2026',
    dasar: 'DPA Bapperida Kabupaten Sumba Barat TA 2026',
    maksud: '',
    tempatBerangkat: 'Waikabubak',
    tempatTujuan: '',
    alatAngkut: 'Pesawat',
    tanggalBerangkat: '',
    tanggalKembali: '',
    tingkatBiaya: 'C',
    instansi: 'Bapperida Kabupaten Sumba Barat',
    mataAnggaran: 'DPA Bapperida Kabupaten Sumba Barat TA 2026',
    ditetapkanDi: 'Waikabubak',
    tanggalPenetapan: '',
    kepala: { nama: 'CHARLES HERMANA WERU,S.Sos', pangkat: 'Pembina Utama Muda – IV/c', nip: '19721102 200112 1 001' },
    sekretaris: { nama: 'IMANUEL MOSES KALEGOTAN, ST.,M.Si', nip: '19800315 200501 1 011' },
    paraf: [{ jabatan: 'Sekretaris BAPPERIDA' }, { jabatan: 'Kepala Bidang Ekonomi' }, { jabatan: 'KTU BAPPERIDA' }]
  };

  function merge(p) {
    const out = Object.assign({}, DEFAULT_PERJADIN, p || {});
    out.kepala = Object.assign({}, DEFAULT_PERJADIN.kepala, (p && p.kepala) || {});
    out.sekretaris = Object.assign({}, DEFAULT_PERJADIN.sekretaris, (p && p.sekretaris) || {});
    out.paraf = (p && Array.isArray(p.paraf) && p.paraf.length) ? p.paraf : DEFAULT_PERJADIN.paraf;
    return out;
  }

  function personTag(row, masterIndex) {
    const m = (masterIndex && masterIndex[String(row.nip)]) || {};
    return {
      Nama: m.nama || row.nama || '',
      PangkatGol: m.pangkat || row.pangkat || '',
      NIP: m.nip || row.nip || '',
      Jabatan: m.jabatan || row.jabatan || ''
    };
  }

  function susunUntuk(p, grup) {
    let u = p.maksud || (grup.items[0] && grup.items[0].keterangan) || '';
    if (p.tempatTujuan) u += ' di ' + p.tempatTujuan;
    u = u.trim();
    if (u && !/[.!]$/.test(u)) u += '.';
    return u;
  }

  function bangunTagsSPT(grup, perjadin, masterIndex) {
    const p = merge(perjadin);
    const items = grup.items.map((r, i) => Object.assign({ No: i + 1 }, personTag(r, masterIndex)));
    return {
      Nomor: p.nomor,
      Dasar: p.dasar,
      pelaksana: items,
      Untuk: susunUntuk(p, grup),
      DitetapkanDi: p.ditetapkanDi,
      TanggalSurat: tanggalID(p.tanggalPenetapan || (grup.items[0] && grup.items[0].tanggal)),
      KepalaNama: p.kepala.nama,
      KepalaPangkat: p.kepala.pangkat,
      KepalaNIP: p.kepala.nip,
      Paraf1: (p.paraf[0] || {}).jabatan || '',
      Paraf2: (p.paraf[1] || {}).jabatan || '',
      Paraf3: (p.paraf[2] || {}).jabatan || ''
    };
  }

  function bangunTagsSPPD(row, grup, perjadin, masterIndex) {
    const p = merge(perjadin);
    const t = personTag(row, masterIndex);
    return {
      NomorSPPD: p.nomorSPPD,
      KpaNama: p.kepala.nama,
      Nama: t.Nama,
      NIP: t.NIP,
      PangkatGolongan: p.pangkatGolongan || t.PangkatGol,
      JabatanInstansi: t.Jabatan,
      TingkatBiaya: p.tingkatBiaya,
      Maksud: p.maksud || susunUntuk(p, grup),
      AlatAngkut: p.alatAngkut,
      TempatBerangkat: p.tempatBerangkat,
      TempatTujuan: p.tempatTujuan,
      LamaHari: lamaHari(p.tanggalBerangkat, p.tanggalKembali),
      TanggalBerangkat: tanggalID(p.tanggalBerangkat),
      TanggalKembali: tanggalID(p.tanggalKembali),
      Instansi: p.instansi,
      MataAnggaran: p.mataAnggaran,
      DitetapkanDi: p.ditetapkanDi,
      TanggalPenetapan: tanggalID(p.tanggalPenetapan || (grup.items[0] && grup.items[0].tanggal)),
      KepalaNama: p.kepala.nama,
      KepalaPangkat: p.kepala.pangkat,
      KepalaNIP: p.kepala.nip,
      SekretarisNama: p.sekretaris.nama,
      SekretarisNIP: p.sekretaris.nip
    };
  }

  window.TugasSPT = {
    terbilang, tanggalID, lamaHari, kunciGrup, kelompokkan,
    personTag, bangunTagsSPT, bangunTagsSPPD, DEFAULT_PERJADIN, merge
  };
})();
