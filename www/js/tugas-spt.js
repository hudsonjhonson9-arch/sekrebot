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

  // ponytail: tanggal-only (yyyy-mm-dd) di-parse sendiri supaya tidak geser hari karena timezone.
  // String berwaktu (…T…Z, mis. tanggal penugasan dari API) diserahkan ke new Date agar
  // hasilnya sama dengan yang ditampilkan kartu monitoring (new Date + toLocaleDateString);
  // memotong bagian tanggalnya memberi hari UTC, yang bisa meleset 1 hari di WITA.
  // Upgrade path: pakai Temporal bila sudah tersedia di target.
  function toDate(v) {
    if (!v) return null;
    const s = String(v);
    const m = s.includes('T') ? null : s.match(/^(\d{4})-(\d{2})-(\d{2})/);
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
    // ponytail: nama keras template SPPD dipakai sebagai default -> SPPD tetap terisi walau master kosong.
    bidang: { nama: 'BERLIAN MAGU WERU,S.Sos', nip: '19690619 200903 1 001' },
    ktu: { nama: '', nip: '' },
    paraf: [
      { nip: '', nama: '', jabatan: 'Sekretaris BAPPERIDA' },
      { nip: '', nama: '', jabatan: 'Kepala Bidang Ekonomi' },
      { nip: '', nama: '', jabatan: 'KTU BAPPERIDA' }
    ]
  };

  function merge(p) {
    const out = Object.assign({}, DEFAULT_PERJADIN, p || {});
    out.kepala = Object.assign({}, DEFAULT_PERJADIN.kepala, (p && p.kepala) || {});
    out.sekretaris = Object.assign({}, DEFAULT_PERJADIN.sekretaris, (p && p.sekretaris) || {});
    out.bidang = Object.assign({}, DEFAULT_PERJADIN.bidang, (p && p.bidang) || {});
    out.ktu = Object.assign({}, DEFAULT_PERJADIN.ktu, (p && p.ktu) || {});
    const pf = (p && Array.isArray(p.paraf) && p.paraf.length) ? p.paraf : DEFAULT_PERJADIN.paraf;
    out.paraf = pf.map(e => { const x = e || {}; return { nip: x.nip || '', nama: x.nama || '', jabatan: x.jabatan || '' }; });
    return out;
  }

  // Pejabat dari master: entri pertama yang jabatannya cocok (spec §6, mis. /^Kepala Badan/i).
  function cariPejabat(masterIndex, re) {
    const idx = masterIndex || {};
    for (const nip of Object.keys(idx)) {
      const m = idx[nip] || {};
      if (m.jabatan && re.test(String(m.jabatan))) return m;
    }
    return null;
  }

  // Default penandatangan dari master; null bila tak ada yang cocok (pakai DEFAULT_PERJADIN).
  function defaultsDariMaster(masterIndex) {
    const k = cariPejabat(masterIndex, /^Kepala Badan/i);
    const s = cariPejabat(masterIndex, /^Sekretaris/i);
    const b = cariPejabat(masterIndex, /^Kepala Bidang/i);
    const t = cariPejabat(masterIndex, /^(KTU|Kepala Tata Usaha|Kasubbag Tata Usaha)/i);
    return {
      kepala: k ? { nama: k.nama || '', pangkat: k.pangkat || '', nip: k.nip || '' } : null,
      sekretaris: s ? { nama: s.nama || '', nip: s.nip || '' } : null,
      bidang: b ? { nama: b.nama || '', nip: b.nip || '' } : null,
      ktu: t ? { nama: t.nama || '', nip: t.nip || '' } : null
    };
  }

  // Field wajib sebelum generate (spec §11) -> label yang masih kosong.
  const FIELD_WAJIB = [
    ['maksud', 'Maksud'], ['tempatTujuan', 'Tempat Tujuan'],
    ['tanggalBerangkat', 'Tanggal Berangkat'], ['tanggalKembali', 'Tanggal Kembali']
  ];
  function validasiPerjadin(p) {
    const q = merge(p);
    return FIELD_WAJIB.filter(f => !String(q[f[0]] || '').trim()).map(f => f[1]).concat(parafKurang(q));
  }

  // Paraf berbentuk array -> diperiksa terpisah; ketiganya wajib (permintaan user minimal 3).
  function parafKurang(p) {
    const kurang = [];
    for (let i = 0; i < 3; i++) {
      const e = (p.paraf || [])[i] || {};
      if (!String(e.nip || '').trim() && !String(e.jabatan || '').trim() && !String(e.nama || '').trim()) kurang.push('Paraf ' + (i + 1));
    }
    return kurang;
  }

  // Paraf pakai jabatan saja (permintaan user); fallback nama bila jabatan kosong.
  function parafTeks(e) { const x = e || {}; return x.jabatan || x.nama || ''; }

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
      Paraf1: parafTeks(p.paraf[0]),
      Paraf2: parafTeks(p.paraf[1]),
      Paraf3: parafTeks(p.paraf[2])
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
      SekretarisNIP: p.sekretaris.nip,
      BidangNama: (p.bidang || {}).nama || '',
      BidangNIP: (p.bidang || {}).nip || '',
      KtuNama: (p.ktu || {}).nama || '',
      KtuNIP: (p.ktu || {}).nip || '',
      Paraf1: parafTeks(p.paraf[0]),
      Paraf2: parafTeks(p.paraf[1]),
      Paraf3: parafTeks(p.paraf[2])
    };
  }

  /* ─── INDEKS MASTER PEGAWAI (pangkat/jabatan) ─── */
  // ponytail: cache modul — sekali muat per sesi. Upgrade: invalidasi saat master berubah.
  let _masterCache = null;

  async function masterIndex(instansiId) {
    if (_masterCache) return _masterCache;
    const out = {};
    for (const m of (window.MASTER_PEGAWAI || [])) {
      const n = String((m && m.nip) || ''); if (n) out[n] = m;
    }
    const fn = window.apiGet || (typeof apiGet !== 'undefined' ? apiGet : null);
    if (!fn) { _masterCache = out; return out; }
    // ponytail: P hanya ada di browser; fallback literal agar modul bisa diuji murni.
    const endpoint = (typeof P !== 'undefined' && P && P.userList) || '/api/user-list';
    try {
      const res = await fn(endpoint, instansiId ? { instansi_id: instansiId } : {});
      const rows = (res && (res.rows || (res.data && res.data.rows))) || [];
      for (const u of rows) {
        const nip = String(u.nip || u.NIP || ''); if (!nip) continue;
        out[nip] = {
          nama: u.nama || u.Nama || u.username || '', nip,
          pangkat: u.pangkat || u.Pangkat || '', jabatan: u.jabatan || u.Jabatan || ''
        };
      }
      // ponytail: cache HANYA saat fetch sukses — kegagalan sesaat jangan meracuni sesi
      // (kalau di-cache, semua dialog berikutnya kehilangan pejabat/pangkat sampai reload).
      _masterCache = out;
    } catch (e) { console.error('[SPT] goldmaster pegawai gagal dimuat:', e); }
    return out;
  }

  /* ─── PILIH PEGAWAI (select dari master) ─── */
  const SLOT_PEGAWAI = ['kepalaNip', 'sekretarisNip', 'bidangNip', 'ktuNip', 'paraf1', 'paraf2', 'paraf3'];

  function pegawaiByNip(nip) {
    const n = String(nip || '').trim();
    return n && _masterCache ? (_masterCache[n] || null) : null;
  }

  // Cari NIP dari nama/jabatan (dipakai untuk data lama yang belum menyimpan NIP).
  function nipCocok(field, nilai) {
    const t = String(nilai || '').trim().toUpperCase().replace(/\s+/g, ' ');
    if (!t || !_masterCache) return '';
    for (const nip of Object.keys(_masterCache)) {
      const v = ((_masterCache[nip] || {})[field] || '').trim().toUpperCase().replace(/\s+/g, ' ');
      if (v === t) return nip;
    }
    return '';
  }

  // ponytail: <select> native; opsi pertama '— pilih —' (nilai kosong).
  function isiOpsiPegawai(idx) {
    const f = $('perjadinForm');
    if (!f || !f.elements) return;
    const daftar = Object.keys(idx || {}).map(nip => idx[nip]).filter(m => m && m.nama)
      .sort((a, b) => String(a.nama).localeCompare(String(b.nama)));
    for (const n of SLOT_PEGAWAI) {
      const el = f.elements[n];
      if (!el || el.tagName !== 'SELECT') continue;
      const simpan = el.value;
      el.innerHTML = '';
      el.appendChild(new Option('— pilih —', ''));
      for (const m of daftar) el.appendChild(new Option(m.nama + ' — ' + (m.jabatan || 'tanpa jabatan'), String(m.nip)));
      el.value = simpan;
    }
  }

  // NIP terpilih -> dari master; tak ada pilihan -> KOSONG (bukan jatuh ke default jabatan),
  // supaya "— pilih —" benar-benar dihitung belum diisi oleh parafKurang (ketiga paraf wajib).
  function parafDariForm(nip, lama) {
    const l = lama || {}, e = pegawaiByNip(nip);
    if (!e) return { nip: '', nama: '', jabatan: '' };
    return { nip: e.nip || String(nip), nama: e.nama || l.nama || '', jabatan: e.jabatan || l.jabatan || '' };
  }

  /* ─── SIMPAN + ORKESTRASI GENERATE ─── */
  async function simpanPerjadin(ids, perjadin) {
    try {
      const body = { ids, perjadin };
      if (perjadin.nomor) body.nomor_surat = perjadin.nomor;
      const r = await apiPost(P.penugasanPerjadin, body);
      return !!(r && r.ok && r.data && r.data.ok !== false);
    } catch (e) {
      console.error('[SPT] simpan perjadin gagal:', e);
      return false;
    }
  }

  async function generate(grup, perjadin) {
    const kurang = validasiPerjadin(perjadin);
    if (kurang.length) {
      if (typeof showToast === 'function') showToast('Wajib diisi: ' + kurang.join(', '), 'error');
      return false;
    }
    if (!window.bastRenderDocxBlob || !window.unduhZipBerkas) { showToast('Fungsi render dokumen belum siap.', 'error'); return false; }
    const instansiId = (grup.items[0] && grup.items[0].instansi_id) || '';
    const idx = await masterIndex(instansiId);
    // Jangan diam-diam mencetak pangkat/jabatan kosong di dokumen legal.
    const kosong = grup.items.map(r => personTag(r, idx))
      .filter(t => !t.PangkatGol || !t.Jabatan)
      .map(t => t.Nama || t.NIP);
    if (kosong.length && typeof showToast === 'function') {
      showToast('Pangkat/jabatan belum lengkap: ' + kosong.join(', '), 'info');
    }
    // Nama berkas dipakai juga sebagai entri di dalam .zip -> buang ':' (ilegal di Windows).
    const tglKunci = String((grup.items[0] && grup.items[0].tanggal) || '').replace(/[^\w.-]+/g, '_');
    const tagsSPT = bangunTagsSPT(grup, perjadin, idx);
    const berkas = [];
    const spt = await window.bastRenderDocxBlob(tagsSPT, 'spt_template.docx');
    if (!spt) return false;
    berkas.push({ nama: 'SPT_' + tglKunci + '.docx', blob: spt });
    for (const row of grup.items) {
      const tags = bangunTagsSPPD(row, grup, perjadin, idx);
      const nip = String(row.nip || '').replace(/\s+/g, '');
      const spd = await window.bastRenderDocxBlob(tags, 'sppd_template.docx');
      // ponytail: dulu nilai balik render SPPD diabaikan -> SPPD bisa hilang tanpa jejak.
      if (!spd) return false;
      berkas.push({ nama: 'SPPD_' + nip + '_' + tglKunci + '.docx', blob: spd });
    }
    // Satu .zip: Chrome memblokir unduhan otomatis ke-2 dst (prompt "unduhan ganda"),
    // sehingga SPPD bisa tak pernah sampai ke pengguna.
    await window.unduhZipBerkas(berkas, 'SPT-SPPD_' + tglKunci + '.zip');
    const ids = grup.items.map(r => r.id).filter(Boolean);
    if (ids.length) {
      const ok = await simpanPerjadin(ids, perjadin);
      showToast(ok ? 'SPT & SPPD dibuat, detail tersimpan.' : 'Dokumen dibuat, tapi detail gagal disimpan.', ok ? 'success' : 'error');
    }
    return true;
  }

  /* ─── DIALOG PERJADIN (DOM) ─── */
  function $(id) { return document.getElementById(id); }

  let _grupAktif = null;
  let _siapMaster = null;

  // ponytail: submit menunggu master selesai (maks 1,5 dtk) agar nilai yang terlihat di dialog
  // = yang tercetak; batas waktu mencegah tombol menggantung saat /api/user-list lambat.
  function tungguMaster(ms) {
    if (!_siapMaster) return Promise.resolve();
    return Promise.race([_siapMaster, new Promise(r => setTimeout(r, ms || 1500))]).then(() => {}, () => {});
  }

  // ponytail: penyalin field tunggal — dipakai fillForm & bukaModal (master menyusul).
  // Sekaligus membersihkan tanda merah validasi supaya dialog yang dibuka ulang tidak
  // mewarisi border merah dari submit sebelumnya.
  function setField(n, v) {
    const el = $('perjadinForm').elements[n];
    if (el) { el.value = v || ''; el.style.borderColor = ''; }
  }

  function readForm(perjadinAwal) {
    const f = $('perjadinForm');
    const g = n => { const el = f.elements[n]; return el ? el.value : ''; };
    const p = merge(perjadinAwal || (_grupAktif && _grupAktif.perjadin));
    p.nomor = g('nomor') || p.nomor;
    p.nomorSPPD = g('nomorSPPD') || p.nomorSPPD;
    p.dasar = g('dasar') || p.dasar;
    p.maksud = g('maksud');
    p.tempatBerangkat = g('tempatBerangkat') || p.tempatBerangkat;
    p.tempatTujuan = g('tempatTujuan');
    p.alatAngkut = g('alatAngkut') || p.alatAngkut;
    p.tanggalBerangkat = g('tanggalBerangkat');
    p.tanggalKembali = g('tanggalKembali');
    p.tingkatBiaya = g('tingkatBiaya') || p.tingkatBiaya;
    p.tanggalPenetapan = g('tanggalPenetapan');
    p.mataAnggaran = g('mataAnggaran') || p.mataAnggaran;
    p.ditetapkanDi = g('ditetapkanDi') || p.ditetapkanDi;
    const k = pegawaiByNip(g('kepalaNip')), s = pegawaiByNip(g('sekretarisNip'));
    const b = pegawaiByNip(g('bidangNip')), t = pegawaiByNip(g('ktuNip'));
    p.kepala = { nama: (k && k.nama) || p.kepala.nama, pangkat: g('kepalaPangkat') || p.kepala.pangkat, nip: (k && k.nip) || p.kepala.nip };
    p.sekretaris = { nama: (s && s.nama) || p.sekretaris.nama, nip: (s && s.nip) || p.sekretaris.nip };
    p.bidang = { nama: (b && b.nama) || p.bidang.nama, nip: (b && b.nip) || p.bidang.nip };
    p.ktu = { nama: (t && t.nama) || p.ktu.nama, nip: (t && t.nip) || p.ktu.nip };
    p.paraf = [
      parafDariForm(g('paraf1'), p.paraf[0]),
      parafDariForm(g('paraf2'), p.paraf[1]),
      parafDariForm(g('paraf3'), p.paraf[2])
    ];
    return p;
  }

  function fillForm(perjadin) {
    const set = setField;
    set('nomor', perjadin.nomor);
    set('nomorSPPD', perjadin.nomorSPPD);
    set('dasar', perjadin.dasar);
    set('maksud', perjadin.maksud);
    set('tempatBerangkat', perjadin.tempatBerangkat);
    set('tempatTujuan', perjadin.tempatTujuan);
    set('alatAngkut', perjadin.alatAngkut);
    set('tanggalBerangkat', perjadin.tanggalBerangkat);
    set('tanggalKembali', perjadin.tanggalKembali);
    set('tingkatBiaya', perjadin.tingkatBiaya);
    set('tanggalPenetapan', perjadin.tanggalPenetapan);
    set('mataAnggaran', perjadin.mataAnggaran);
    const k = perjadin.kepala || {}, s = perjadin.sekretaris || {}, pf = perjadin.paraf || [];
    set('ditetapkanDi', perjadin.ditetapkanDi);
    set('kepalaNip', k.nip || nipCocok('nama', k.nama));
    set('kepalaPangkat', k.pangkat);
    set('sekretarisNip', s.nip || nipCocok('nama', s.nama));
    const bd = perjadin.bidang || {}, kt = perjadin.ktu || {};
    set('bidangNip', bd.nip || nipCocok('nama', bd.nama));
    set('ktuNip', kt.nip || nipCocok('nama', kt.nama));
    set('paraf1', (pf[0] || {}).nip || nipCocok('jabatan', (pf[0] || {}).jabatan));
    set('paraf2', (pf[1] || {}).nip || nipCocok('jabatan', (pf[1] || {}).jabatan));
    set('paraf3', (pf[2] || {}).nip || nipCocok('jabatan', (pf[2] || {}).jabatan));
  }

  async function bukaModal(grup) {
    _grupAktif = grup;
    const modal = $('perjadinModal');
    if (!modal) return;
    const info = $('perjadinInfo');
    if (info) {
      const nama = grup.items.map(r => r.nama || r.nip).join(', ');
      info.textContent = grup.items.length + ' pelaksana: ' + nama + ' — ' + ((grup.items[0] || {}).keterangan || '');
    }
    const p = merge(grup.perjadin);
    // Dialog tampil lebih dulu (nilai tersimpan/default), master dimuat menyusul —
    // supaya /api/user-list yang lambat tidak menahan munculnya dialog.
    fillForm(p);
    modal.style.display = 'flex';
    const simpan = grup.perjadin || {};
    const punya = {
      kepala: !!(simpan.kepala && simpan.kepala.nama), sekretaris: !!(simpan.sekretaris && simpan.sekretaris.nama),
      bidang: !!(simpan.bidang && simpan.bidang.nama), ktu: !!(simpan.ktu && simpan.ktu.nama),
      paraf: !!(simpan.paraf && simpan.paraf.length)
    };
    // Promise dicatat (bukan di-await) supaya dialog tetap muncul segera; submit menunggunya
    // lewat tungguMaster() agar nilai yang terlihat = yang tercetak.
    // _siapMaster SELALU diisi: select harus tetap terisi walau perjadin sudah lengkap.
    _siapMaster = (async () => {
      const idx = await masterIndex((grup.items[0] || {}).instansi_id || '');
      isiOpsiPegawai(idx);                       // opsi dipasang setelah master siap
      // fillForm() tadi jalan SAAT select belum beropsi -> .value = nip diabaikan browser.
      // Terapkan ulang nilai tersimpan (p) ke 7 select sekarang opsi sudah ada, SEBELUM
      // default: yang tersimpan menang; default hanya mengisi slot yang belum pernah disimpan.
      setField('kepalaNip', p.kepala.nip || nipCocok('nama', p.kepala.nama));
      setField('sekretarisNip', p.sekretaris.nip || nipCocok('nama', p.sekretaris.nama));
      setField('bidangNip', (p.bidang || {}).nip || nipCocok('nama', (p.bidang || {}).nama));
      setField('ktuNip', (p.ktu || {}).nip || nipCocok('nama', (p.ktu || {}).nama));
      setField('paraf1', (p.paraf[0] || {}).nip || nipCocok('jabatan', (p.paraf[0] || {}).jabatan));
      setField('paraf2', (p.paraf[1] || {}).nip || nipCocok('jabatan', (p.paraf[1] || {}).jabatan));
      setField('paraf3', (p.paraf[2] || {}).nip || nipCocok('jabatan', (p.paraf[2] || {}).jabatan));
      const d = defaultsDariMaster(idx);
      if (d.kepala && !punya.kepala) { setField('kepalaNip', d.kepala.nip); setField('kepalaPangkat', d.kepala.pangkat); }
      if (d.sekretaris && !punya.sekretaris) setField('sekretarisNip', d.sekretaris.nip);
      if (d.bidang && !punya.bidang) setField('bidangNip', d.bidang.nip);
      if (d.ktu && !punya.ktu) setField('ktuNip', d.ktu.nip);
      if (!punya.paraf) {                        // tebak dari jabatan (persis default lama)
        setField('paraf1', (d.sekretaris || {}).nip || '');
        setField('paraf2', (d.bidang || {}).nip || '');
        setField('paraf3', (d.ktu || {}).nip || '');
      }
    })().catch(e => console.error('[SPT] muat master gagal:', e));
  }

  function tutupModal() { const m = $('perjadinModal'); if (m) m.style.display = 'none'; }

  function initPerjadinModal() {
    const modal = $('perjadinModal');
    if (!modal || modal.dataset.ready) return;
    modal.dataset.ready = '1';
    const close = $('perjadinClose'), cancel = $('perjadinCancel'), form = $('perjadinForm');
    if (close) close.addEventListener('click', tutupModal);
    if (cancel) cancel.addEventListener('click', tutupModal);
    modal.addEventListener('click', e => { if (e.target === modal) tutupModal(); });
    if (form) form.addEventListener('submit', async e => {
      e.preventDefault();
      if (!_grupAktif) return;
      const btn = form.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      try {
        await tungguMaster();
        const p = readForm();
        const kurang = validasiPerjadin(p);
        FIELD_WAJIB.forEach(f => {
          const el = form.elements[f[0]];
          if (el) el.style.borderColor = String(el.value || '').trim() ? '' : '#dc3545';
        });
        if (kurang.length) {
          if (typeof showToast === 'function') showToast('Wajib diisi: ' + kurang.join(', '), 'error');
          return;
        }
        if (await generate(_grupAktif, p)) tutupModal();
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPerjadinModal);
    else initPerjadinModal();
  }

  window.TugasSPT = {
    terbilang, tanggalID, lamaHari, kunciGrup, kelompokkan,
    personTag, bangunTagsSPT, bangunTagsSPPD, DEFAULT_PERJADIN, merge,
    cariPejabat, defaultsDariMaster, validasiPerjadin,
    masterIndex, bukaModal, generate, simpanPerjadin,
    readForm, fillForm, tungguMaster, isiOpsiPegawai
  };
})();
