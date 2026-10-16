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
    return {
      kepala: k ? { nama: k.nama || '', pangkat: k.pangkat || '', nip: k.nip || '' } : null,
      sekretaris: s ? { nama: s.nama || '', nip: s.nip || '' } : null
    };
  }

  // Field wajib sebelum generate (spec §11) -> label yang masih kosong.
  const FIELD_WAJIB = [
    ['maksud', 'Maksud'], ['tempatTujuan', 'Tempat Tujuan'],
    ['tanggalBerangkat', 'Tanggal Berangkat'], ['tanggalKembali', 'Tanggal Kembali']
  ];
  function validasiPerjadin(p) {
    const q = merge(p);
    return FIELD_WAJIB.filter(f => !String(q[f[0]] || '').trim()).map(f => f[1]);
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
    if (!window.bastRenderDocx) { showToast('Fungsi render dokumen belum siap.', 'error'); return false; }
    const instansiId = (grup.items[0] && grup.items[0].instansi_id) || '';
    const idx = await masterIndex(instansiId);
    // Jangan diam-diam mencetak pangkat/jabatan kosong di dokumen legal.
    const kosong = grup.items.map(r => personTag(r, idx))
      .filter(t => !t.PangkatGol || !t.Jabatan)
      .map(t => t.Nama || t.NIP);
    if (kosong.length && typeof showToast === 'function') {
      showToast('Pangkat/jabatan belum lengkap: ' + kosong.join(', '), 'info');
    }
    const tglKunci = (grup.items[0] && grup.items[0].tanggal) || '';
    const tagsSPT = bangunTagsSPT(grup, perjadin, idx);
    const okSPT = await window.bastRenderDocx(tagsSPT, 'SPT_' + tglKunci + '.docx', 'spt_template.docx');
    if (!okSPT) return false;
    for (const row of grup.items) {
      const tags = bangunTagsSPPD(row, grup, perjadin, idx);
      const nip = String(row.nip || '').replace(/\s+/g, '');
      await window.bastRenderDocx(tags, 'SPPD_' + nip + '_' + tglKunci + '.docx', 'sppd_template.docx');
    }
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
    p.kepala = {
      nama: g('kepalaNama') || p.kepala.nama,
      pangkat: g('kepalaPangkat') || p.kepala.pangkat,
      nip: g('kepalaNIP') || p.kepala.nip
    };
    p.sekretaris = {
      nama: g('sekretarisNama') || p.sekretaris.nama,
      nip: g('sekretarisNIP') || p.sekretaris.nip
    };
    p.paraf = [
      { jabatan: g('paraf1') || (p.paraf[0] || {}).jabatan || '' },
      { jabatan: g('paraf2') || (p.paraf[1] || {}).jabatan || '' },
      { jabatan: g('paraf3') || (p.paraf[2] || {}).jabatan || '' }
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
    set('kepalaNama', k.nama);
    set('kepalaPangkat', k.pangkat);
    set('kepalaNIP', k.nip);
    set('sekretarisNama', s.nama);
    set('sekretarisNIP', s.nip);
    set('paraf1', (pf[0] || {}).jabatan);
    set('paraf2', (pf[1] || {}).jabatan);
    set('paraf3', (pf[2] || {}).jabatan);
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
    const punya = grup.perjadin || {};
    // Promise dicatat (bukan di-await) supaya dialog tetap muncul segera; submit menunggunya
    // lewat tungguMaster() agar nilai yang terlihat = yang tercetak.
    _siapMaster = (!punya.kepala || !punya.sekretaris)
      ? (async () => {
        const idx = await masterIndex((grup.items[0] || {}).instansi_id || '');
        const d = defaultsDariMaster(idx);
        if (d.kepala && !punya.kepala) {
          setField('kepalaNama', d.kepala.nama); setField('kepalaPangkat', d.kepala.pangkat); setField('kepalaNIP', d.kepala.nip);
        }
        if (d.sekretaris && !punya.sekretaris) {
          setField('sekretarisNama', d.sekretaris.nama); setField('sekretarisNIP', d.sekretaris.nip);
        }
      })().catch(e => console.error('[SPT] default pejabat gagal:', e))
      : null;
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
    readForm, fillForm, tungguMaster
  };
})();
