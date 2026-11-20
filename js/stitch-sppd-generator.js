/* Stitch SPPD & Surat Tugas (SPT) Auto-Generator — Official UMA DATA / BAPPERIDA Format */
(function (w, d) {
  'use strict';

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

  const BULAN = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];

  const KOP_PRESETS = {
    BAPPERIDA: {
      pemkab: 'PEMERINTAH KABUPATEN SUMBA BARAT',
      instansi: 'BADAN PERENCANAAN PEMBANGUNAN, RISET DAN INOVASI DAERAH',
      alamat: 'Jl. Wee Karou Nomor. – Waikabubak Provinsi Nusa Tenggara Timur',
      kontak: 'Telp (0387) 22203 Fax (0387) 21093, Email : wesumba@yahoo.com',
      kota: 'W A I K A B U B A K',
      jabatanTtd: 'KEPALA BAPPERIDA',
      anggaranInstansi: 'Bapperida Kabupaten Sumba Barat',
    },
    SEKDA: {
      pemkab: 'PEMERINTAH KABUPATEN SUMBA BARAT',
      instansi: 'SEKRETARIAT DAERAH',
      alamat: 'Jl. Wee Karou Nomor. – Waikabubak Provinsi Nusa Tenggara Timur',
      kontak: 'Telp (0387) 22203 Fax (0387) 21093, Email : wesumba@yahoo.com',
      kota: 'W A I K A B U B A K',
      jabatanTtd: 'SEKRETARIS DAERAH',
      anggaranInstansi: 'Sekretariat Daerah Kabupaten Sumba Barat',
    },
  };

  function toDate(v) {
    if (!v) return null;
    const s = String(v);
    const m = s.includes('T') ? null : s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const dt = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  function tanggalID(v) {
    const dt = toDate(v);
    if (!dt) return v ? String(v) : '-';
    return `${dt.getDate()} ${BULAN[dt.getMonth()]} ${dt.getFullYear()}`;
  }

  function terbilang(n) {
    const a = Number(n);
    if (!Number.isFinite(a) || a < 0) return '';
    const sat = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
    if (a < 12) return sat[a];
    if (a < 20) return `${terbilang(a - 10)} Belas`;
    if (a < 100) return `${terbilang(Math.floor(a / 10))} Puluh${a % 10 ? ' ' + terbilang(a % 10) : ''}`;
    if (a < 200) return `Seratus${a % 100 ? ' ' + terbilang(a % 100) : ''}`;
    return String(a);
  }

  function formatLamaHari(start, end) {
    const d1 = toDate(start);
    const d2 = toDate(end);
    if (!d1 || !d2) return '1 (Satu) Hari';
    const n = Math.max(1, Math.round(Math.abs(d2.getTime() - d1.getTime()) / 86400000) + 1);
    return `${n} (${terbilang(n)}) Hari`;
  }

  let _wewenangCache = null;
  let _wewenangPromise = null;

  function getAuthToken() {
    try { return w.localStorage?.getItem('token') || w.sessionStorage?.getItem('token') || ''; } catch { return ''; }
  }

  async function loadWewenang(force = false) {
    if (_wewenangCache && !force) return _wewenangCache;
    if (_wewenangPromise && !force) return _wewenangPromise;
    _wewenangPromise = (async () => {
      try {
        const headers = {};
        const tok = getAuthToken();
        if (tok) headers.Authorization = `Bearer ${tok}`;
        const res = await fetch('/api/arsip/p/api/agenda/wewenang', { headers, credentials: 'include' });
        const data = await res.json().catch(() => ({}));
        _wewenangCache = data?.data || data?.wewenang || (data && typeof data === 'object' && !Array.isArray(data) && !data.ok ? data : {}) || {};
      } catch {
        _wewenangCache = _wewenangCache || {};
      } finally {
        _wewenangPromise = null;
      }
      return _wewenangCache;
    })();
    return _wewenangPromise;
  }

  function enrichWithWewenang(item = {}, wewOverride = null) {
    const wew = wewOverride || item.wewenang || _wewenangCache || {};
    const mergedWew = { ...(wew || {}), ...(item.wewenang || {}) };
    const kepala = mergedWew.kepala || mergedWew.penandatangan || {};
    const kopSurat = item.kop_surat || mergedWew.default_kop || (String(item.pejabat_perintah || '').toUpperCase().includes('SEKDA') ? 'SEKDA' : 'BAPPERIDA');
    return {
      ...item,
      kop_surat: kopSurat,
      wewenang: mergedWew,
      penandatangan_nama: item.penandatangan_nama || kepala.nama || 'CHARLES HERMANA WERU, S.Sos',
      penandatangan_nip: item.penandatangan_nip || kepala.nip || '19721102 200112 1 001',
      penandatangan_pangkat: item.penandatangan_pangkat || kepala.pangkat || 'Pembina Utama Muda – IV/c',
      penandatangan_jabatan: item.penandatangan_jabatan || kepala.jabatan || '',
      penandatangan_status: item.penandatangan_status || kepala.status_jabatan || 'Definitif',
    };
  }

  function formatJabatanTtd(it, kop) {
    const base = (it.penandatangan_jabatan || it.pejabat_perintah || kop.jabatanTtd || 'KEPALA BAPPERIDA').trim();
    const status = String(it.penandatangan_status || it.wewenang?.kepala?.status_jabatan || 'Definitif').trim();
    if (/^plt\.?$/i.test(status) && !/^plt\.?\s/i.test(base)) return `Plt. ${base}`;
    if (/^plh\.?$/i.test(status) && !/^plh\.?\s/i.test(base)) return `Plh. ${base}`;
    return base;
  }

  function parsePengikutList(raw) {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string' && raw.trim().startsWith('[')) {
      try { return JSON.parse(raw); } catch { return []; }
    }
    return [];
  }

  function resolveKop(it = {}) {
    const raw = String(it.kop_surat || it.pejabat_perintah || '').toUpperCase();
    return raw.includes('SEKDA') || raw.includes('SEKRETARIS DAERAH') ? KOP_PRESETS.SEKDA : KOP_PRESETS.BAPPERIDA;
  }

  function getLogoAbsUrl() {
    try {
      return new URL('images/Lambang_Kabupaten_Sumba_Barat.png', w.location.href).href;
    } catch (_) {
      return '/images/Lambang_Kabupaten_Sumba_Barat.png';
    }
  }

  function kopHtml(kop) {
    return `
      <table class="kop-table">
        <tr>
          <td class="kop-logo"><img src="${esc(getLogoAbsUrl())}" alt="Logo Sumba Barat" width="68" height="76"></td>
          <td class="kop-text">
            <div class="kop-pemkab">${esc(kop.pemkab)}</div>
            <div class="kop-instansi">${esc(kop.instansi)}</div>
            <div class="kop-sub">${esc(kop.alamat)}</div>
            <div class="kop-sub">${esc(kop.kontak)}</div>
            <div class="kop-kota">${esc(kop.kota)}</div>
          </td>
        </tr>
      </table>
      <div class="kop-line"></div>
    `;
  }

  function baseCss(paper = 'F4') {
    const pageSize = paper === 'A4' ? '210mm 297mm' : '215mm 330mm';
    return `
      @page { size: ${pageSize}; margin: 14mm 16mm 14mm 18mm; }
      body { font-family: 'Times New Roman', Georgia, serif; font-size: 11.5pt; color: #000; line-height: 1.4; margin: 0; padding: 14px; }
      .kop-table { width: 100%; border-collapse: collapse; }
      .kop-logo { width: 78px; vertical-align: middle; text-align: center; }
      .kop-text { text-align: center; vertical-align: middle; }
      .kop-pemkab { font-size: 13pt; font-weight: bold; letter-spacing: 0.4px; }
      .kop-instansi { font-size: 13.5pt; font-weight: bold; letter-spacing: 0.3px; }
      .kop-sub { font-size: 9.5pt; font-style: italic; }
      .kop-kota { font-size: 10.5pt; font-weight: bold; letter-spacing: 3px; margin-top: 2px; }
      .kop-line { border-top: 3px solid #000; border-bottom: 1px solid #000; height: 2px; margin: 6px 0 14px; }
      .doc-title { text-align: center; font-size: 13pt; font-weight: bold; text-decoration: underline; letter-spacing: 1px; }
      .doc-nomor { text-align: center; font-size: 11pt; margin-bottom: 14px; }
      table.meta { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
      table.meta td { vertical-align: top; padding: 3px 4px; }
      table.grid { width: 100%; border-collapse: collapse; font-size: 10.5pt; }
      table.grid td, table.grid th { border: 1px solid #000; padding: 5px 7px; vertical-align: top; }
      .ttd-wrap { margin-top: 22px; width: 46%; margin-left: auto; text-align: left; }
      .ttd-space { height: 64px; }
      .page-break { page-break-before: always; margin-top: 28px; }
      .toolbar-print { position: fixed; top: 10px; right: 12px; display: flex; gap: 8px; z-index: 99; }
      .toolbar-print button { padding: 8px 14px; border: none; border-radius: 8px; background: #2563eb; color: #fff; font-family: system-ui, sans-serif; font-size: 12px; font-weight: 700; cursor: pointer; }
      @media print { .toolbar-print { display: none !important; } body { padding: 0; } }
    `;
  }

  function bangunHtmlSPT(rawIt = {}, opts = {}) {
    const it = enrichWithWewenang(rawIt);
    const kop = resolveKop(it);
    const dasarLines = String(it.dasar_hukum || it.dasar_surat || 'Dokumen Pelaksanaan Anggaran (DPA) BAPPERIDA Kabupaten Sumba Barat Tahun Anggaran ' + (it.tahun || new Date().getFullYear()))
      .split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const tglSpt = tanggalID(it.tanggal_spt || it.tanggal_berangkat || new Date().toISOString().slice(0, 10));
    const tglBerangkat = tanggalID(it.tanggal_berangkat);
    const tglKembali = tanggalID(it.tanggal_kembali);
    const lama = formatLamaHari(it.tanggal_berangkat, it.tanggal_kembali);
    const jabatanTtd = formatJabatanTtd(it, kop);
    const pengikut = parsePengikutList(it.pengikut);
    const allPelaksana = [
      { nama: it.pelaksana_nama || '-', nip: it.pelaksana_nip || '-', pangkat: it.pelaksana_pangkat || '-', jabatan: it.pelaksana_jabatan || 'Aparatur Sipil Negara BAPPERIDA' },
      ...pengikut.filter((p) => p && (p.nama || p.name)).map((p) => ({
        nama: p.nama || p.name, nip: p.nip || '-', pangkat: p.pangkat || '-', jabatan: p.jabatan || 'Aparatur Sipil Negara BAPPERIDA',
      })),
    ];
    const parafArr = Array.isArray(it.wewenang?.paraf) ? it.wewenang.paraf.filter(Boolean) : [];
    const parafHtml = parafArr.length ? `
      <table style="border-collapse:collapse;font-size:8.5pt;margin-top:16px;width:210px;">
        <tr><th colspan="2" style="border:1px solid #000;padding:3px 6px;text-align:center;">PARAF HIERARKI</th></tr>
        ${parafArr.map((j) => `<tr><td style="border:1px solid #000;padding:3px 6px;">${esc(j)}</td><td style="border:1px solid #000;width:52px;"></td></tr>`).join('')}
      </table>
    ` : '';

    return `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><title>Surat Tugas - ${esc(it.nomor_spt || 'SPT')}</title><style>${baseCss(opts.paper || 'F4')}</style></head><body>
      <div class="toolbar-print"><button onclick="window.print()">Cetak / Simpan PDF</button></div>
      ${kopHtml(kop)}
      <div class="doc-title">SURAT PERINTAH TUGAS</div>
      <div class="doc-nomor">Nomor : ${esc(it.nomor_spt || '090/___/SPT/BAPPERIDA/' + (it.tahun || new Date().getFullYear()))}</div>

      <table class="meta">
        <tr>
          <td style="width:95px;font-weight:bold;">Dasar</td>
          <td style="width:14px;">:</td>
          <td>${dasarLines.map((l, i) => `<div style="margin-bottom:3px;">${dasarLines.length > 1 ? `${i + 1}. ` : ''}${esc(l)}</div>`).join('')}</td>
        </tr>
      </table>

      <div style="text-align:center;font-weight:bold;letter-spacing:1.5px;margin:10px 0;">MEMERINTAHKAN :</div>

      <table class="meta">
        <tr>
          <td style="width:95px;font-weight:bold;">Kepada</td>
          <td style="width:14px;">:</td>
          <td>
            ${allPelaksana.map((p, idx) => `
              <table style="width:100%;border-collapse:collapse;${idx > 0 ? 'margin-top:8px;' : ''}">
                <tr><td style="width:${allPelaksana.length > 1 ? '22px' : '0px'};vertical-align:top;font-weight:bold;">${allPelaksana.length > 1 ? `${idx + 1}.` : ''}</td><td style="width:110px;">Nama</td><td style="width:12px;">:</td><td style="font-weight:bold;">${esc(p.nama)}</td></tr>
                <tr><td></td><td>NIP</td><td>:</td><td>${esc(p.nip)}</td></tr>
                <tr><td></td><td>Pangkat / Gol.</td><td>:</td><td>${esc(p.pangkat)}</td></tr>
                <tr><td></td><td>Jabatan</td><td>:</td><td>${esc(p.jabatan)}</td></tr>
              </table>
            `).join('')}
          </td>
        </tr>
        <tr>
          <td style="font-weight:bold;padding-top:10px;">Untuk</td>
          <td style="padding-top:10px;">:</td>
          <td style="padding-top:10px;">
            <div>1. Melaksanakan perjalanan dinas dalam rangka <strong>${esc(it.maksud_perjalanan || '-')}</strong> bertempat di <strong>${esc(it.tempat_tujuan || '-')}</strong>.</div>
            <div>2. Lamanya perjalanan dinas selama <strong>${esc(lama)}</strong>, terhitung mulai tanggal <strong>${esc(tglBerangkat)}</strong> sampai dengan <strong>${esc(tglKembali)}</strong>.</div>
            <div>3. Melaporkan hasil pelaksanaan tugas secara tertulis kepada pimpinan setelah kembali dari perjalanan dinas.</div>
          </td>
        </tr>
      </table>

      <div style="margin-top:12px;">Demikian Surat Perintah Tugas ini diberikan untuk dilaksanakan dengan penuh tanggung jawab.</div>

      <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-top:20px;">
        <div>${parafHtml}</div>
        <div class="ttd-wrap" style="margin-top:0;">
          <div>Ditetapkan di : ${esc(it.ditetapkan_di || it.tempat_berangkat || 'Waikabubak')}</div>
          <div>Pada tanggal : ${esc(tglSpt)}</div>
          <div style="margin-top:8px;font-weight:bold;text-transform:uppercase;">${esc(jabatanTtd)},</div>
          <div class="ttd-space"></div>
          <div style="font-weight:bold;text-decoration:underline;">${esc(it.penandatangan_nama)}</div>
          <div>${esc(it.penandatangan_pangkat || '')}</div>
          <div>NIP. ${esc(it.penandatangan_nip)}</div>
        </div>
      </div>
    </body></html>`;
  }

  function bangunHtmlSPPD(rawIt = {}, opts = {}) {
    const it = enrichWithWewenang(rawIt);
    const kop = resolveKop(it);
    const tglSpt = tanggalID(it.tanggal_spt || it.tanggal_berangkat || new Date().toISOString().slice(0, 10));
    const tglBerangkat = tanggalID(it.tanggal_berangkat);
    const tglKembali = tanggalID(it.tanggal_kembali);
    const lama = formatLamaHari(it.tanggal_berangkat, it.tanggal_kembali);
    const jabatanTtd = formatJabatanTtd(it, kop);
    const pengikut = parsePengikutList(it.pengikut).filter((p) => p && (p.nama || p.name));
    const pptk = it.wewenang?.bidang || it.wewenang?.pptk || {};
    const sek = it.wewenang?.sekretaris || {};
    const visumJabatan = (pptk.jabatan || sek.jabatan || jabatanTtd).toUpperCase();
    const visumNama = pptk.nama || sek.nama || it.penandatangan_nama;
    const visumNip = pptk.nip || sek.nip || it.penandatangan_nip;

    return `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><title>SPPD - ${esc(it.nomor_sppd || 'SPPD')}</title><style>${baseCss(opts.paper || 'F4')}</style></head><body>
      <div class="toolbar-print"><button onclick="window.print()">Cetak / Simpan PDF</button></div>
      ${kopHtml(kop)}
      <div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
        <table style="font-size:10pt;border-collapse:collapse;">
          <tr><td>Lembar Ke</td><td>: I</td></tr>
          <tr><td>Kode No.</td><td>: ${esc(it.jenis_sppd === 'LUAR_DAERAH' ? '094' : '090')}</td></tr>
          <tr><td>Nomor</td><td>: ${esc(it.nomor_sppd || '090/___/SPPD/BAPPERIDA/' + (it.tahun || new Date().getFullYear()))}</td></tr>
        </table>
      </div>
      <div class="doc-title">SURAT PERJALANAN DINAS (SPD)</div>
      <div class="doc-nomor"></div>

      <table class="grid">
        <tr><td style="width:28px;text-align:center;">1.</td><td style="width:38%;">Pejabat Pembuat Komitmen / Pemberi Perintah</td><td>${esc(jabatanTtd)}</td></tr>
        <tr><td style="text-align:center;">2.</td><td>Nama / NIP Pegawai yang melaksanakan perjalanan dinas</td><td><strong>${esc(it.pelaksana_nama || '-')}</strong><br>NIP. ${esc(it.pelaksana_nip || '-')}</td></tr>
        <tr><td style="text-align:center;">3.</td><td>a. Pangkat dan Golongan<br>b. Jabatan / Instansi<br>c. Tingkat Biaya Perjalanan Dinas</td><td>a. ${esc(it.pelaksana_pangkat || '-')}<br>b. ${esc(it.pelaksana_jabatan || 'ASN BAPPERIDA Kab. Sumba Barat')}<br>c. ${esc(it.tingkat_biaya || (it.jenis_sppd === 'LUAR_DAERAH' ? 'Luar Daerah' : 'Dalam Daerah'))}</td></tr>
        <tr><td style="text-align:center;">4.</td><td>Maksud Perjalanan Dinas</td><td>${esc(it.maksud_perjalanan || '-')}</td></tr>
        <tr><td style="text-align:center;">5.</td><td>Alat Angkutan yang dipergunakan</td><td>${esc(it.alat_angkutan || 'Kendaraan Dinas Roda 4')}</td></tr>
        <tr><td style="text-align:center;">6.</td><td>a. Tempat Berangkat<br>b. Tempat Tujuan</td><td>a. ${esc(it.tempat_berangkat || 'Waikabubak')}<br>b. ${esc(it.tempat_tujuan || '-')}</td></tr>
        <tr><td style="text-align:center;">7.</td><td>a. Lamanya Perjalanan Dinas<br>b. Tanggal Berangkat<br>c. Tanggal harus kembali</td><td>a. ${esc(lama)}<br>b. ${esc(tglBerangkat)}<br>c. ${esc(tglKembali)}</td></tr>
        <tr><td style="text-align:center;">8.</td><td>Pengikut</td><td>${pengikut.length ? pengikut.map((p, i) => `${i + 1}. ${esc(p.nama || p.name)}`).join('<br>') : '-'}</td></tr>
        <tr><td style="text-align:center;">9.</td><td>Pembebanan Anggaran<br>a. Instansi<br>b. Akun / Sub Kegiatan</td><td><br>a. ${esc(kop.anggaranInstansi)}<br>b. ${esc(it.subkegiatan_nama || ('DPA Tahun Anggaran ' + (it.tahun || new Date().getFullYear())))}</td></tr>
        <tr><td style="text-align:center;">10.</td><td>Keterangan Lain-lain</td><td>Nomor SPT: ${esc(it.nomor_spt || '-')}</td></tr>
      </table>

      <div class="ttd-wrap">
        <div>Dikeluarkan di : ${esc(it.ditetapkan_di || it.tempat_berangkat || 'Waikabubak')}</div>
        <div>Pada tanggal : ${esc(tglSpt)}</div>
        <div style="margin-top:8px;font-weight:bold;text-transform:uppercase;">${esc(jabatanTtd)},</div>
        <div class="ttd-space"></div>
        <div style="font-weight:bold;text-decoration:underline;">${esc(it.penandatangan_nama)}</div>
        <div>${esc(it.penandatangan_pangkat || '')}</div>
        <div>NIP. ${esc(it.penandatangan_nip)}</div>
      </div>

      <!-- HALAMAN 2: LEMBAR VISUM I-VI -->
      <div class="page-break">
        <table class="grid">
          <tr>
            <td style="width:50%;"></td>
            <td style="width:50%;">
              <strong>I. Berangkat dari :</strong> ${esc(it.tempat_berangkat || 'Waikabubak')}<br>
              Ke : ${esc(it.tempat_tujuan || '-')}<br>
              Pada Tanggal : ${esc(tglBerangkat)}<br>
              <div style="margin-top:6px;font-weight:bold;">${esc(visumJabatan)},</div>
              <div style="height:48px;"></div>
              <div style="font-weight:bold;text-decoration:underline;">${esc(visumNama)}</div>
              <div>NIP. ${esc(visumNip)}</div>
            </td>
          </tr>
          <tr>
            <td>
              <strong>II. Tiba di :</strong> ${esc(it.tempat_tujuan || '-')}<br>
              Pada Tanggal : ${esc(tglBerangkat)}<br>
              Kepala / Pejabat Setempat,<div style="height:52px;"></div>
              ( ................................................. )<br>NIP.
            </td>
            <td>
              <strong>Berangkat dari :</strong> ${esc(it.tempat_tujuan || '-')}<br>
              Ke : ${esc(it.tempat_berangkat || 'Waikabubak')}<br>
              Pada Tanggal : ${esc(tglKembali)}<br>
              Kepala / Pejabat Setempat,<div style="height:36px;"></div>
              ( ................................................. )<br>NIP.
            </td>
          </tr>
          <tr>
            <td><strong>III. Tiba di :</strong> ..........................<br>Pada Tanggal : ..........................<div style="height:50px;"></div>( ................................................. )</td>
            <td><strong>Berangkat dari :</strong> ..........................<br>Ke : ..........................<br>Pada Tanggal : ..........................<div style="height:34px;"></div>( ................................................. )</td>
          </tr>
          <tr>
            <td>
              <strong>IV. Tiba kembali di :</strong> ${esc(it.tempat_berangkat || 'Waikabubak')}<br>
              Pada Tanggal : ${esc(tglKembali)}<br>
              <div style="font-size:9.5pt;margin-top:4px;">Telah diperiksa dengan keterangan bahwa perjalanan tersebut di atas benar dilakukan atas perintahnya dan semata-mata untuk kepentingan jabatan.</div>
            </td>
            <td>
              <strong>${esc(jabatanTtd)},</strong>
              <div style="height:56px;"></div>
              <div style="font-weight:bold;text-decoration:underline;">${esc(it.penandatangan_nama)}</div>
              <div>NIP. ${esc(it.penandatangan_nip)}</div>
            </td>
          </tr>
          <tr><td colspan="2"><strong>V. Catatan Lain-lain :</strong> -</td></tr>
          <tr><td colspan="2" style="font-size:9.5pt;"><strong>VI. PERHATIAN :</strong> Pejabat yang berwenang menerbitkan SPD, pegawai yang melakukan perjalanan dinas, para pejabat yang mengesahkan tanggal berangkat/tiba, serta bendahara pengeluaran bertanggung jawab berdasarkan peraturan-peraturan Keuangan Negara apabila negara menderita rugi akibat kesalahan, kelalaian, dan kealpaannya.</td></tr>
        </table>
      </div>
    </body></html>`;
  }

  function openPrintWindow(html) {
    const win = w.open('', '_blank', 'width=900,height=1000');
    if (!win) {
      if (w.Swal) w.Swal.fire('Pop-up Diblokir', 'Izinkan pop-up browser untuk mencetak dokumen SPT/SPPD.', 'warning');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  function downloadWord(html, filename) {
    const blob = new Blob(['\uFEFF', html], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = d.createElement('a');
    a.href = url;
    a.download = filename;
    d.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }

  async function downloadDocxFromTemplate(kind, item, person = null) {
    const isSpt = kind === 'spt';
    const cleanNo = String(isSpt ? (item?.nomor_spt || 'SPT') : (item?.nomor_sppd || 'SPPD')).replace(/[/\\?%*:|"<>]/g, '_');
    const safeName = String(person?.nama || item?.pelaksana_nama || (isSpt ? 'SPT' : 'SPPD')).replace(/[^a-zA-Z0-9_-]+/g, '_');
    try {
      const r = await fetch('/api/arsip/sppd-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, item, person }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = d.createElement('a');
      a.href = url;
      a.download = isSpt ? `Surat_Tugas_${cleanNo}.docx` : `SPPD_${cleanNo}_${safeName}.docx`;
      d.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
      return true;
    } catch (_) {
      downloadWord(isSpt ? bangunHtmlSPT(item) : bangunHtmlSPPD(item), `${isSpt ? 'SPT' : 'SPPD'}_${safeName}.doc`);
      return false;
    }
  }

  async function downloadSppdBundleZip(rawItem = {}) {
    await loadWewenang();
    const item = enrichWithWewenang(rawItem);
    const headers = { 'Content-Type': 'application/json' };
    const tok = getAuthToken();
    if (tok) headers.Authorization = `Bearer ${tok}`;
    const res = await fetch('/api/arsip/sppd-bundle-zip', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ item }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Gagal membuat paket ZIP (${res.status})`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = d.createElement('a');
    a.href = url;
    const cleanNo = String(item.nomor_sppd || item.nomor_spt || 'SPPD').replace(/[/\\?%*:|"<>]/g, '_');
    a.download = `Paket_SPPD_${cleanNo}.zip`;
    d.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
  }

  async function openWewenangModal(pegawaiList = []) {
    d.getElementById('stitchWewenangOverlay')?.remove();
    const wew = await loadWewenang(true);
    const kepala = wew.kepala || wew.penandatangan || {};
    const sek = wew.sekretaris || {};
    const bid = wew.bidang || wew.pptk || {};
    const ktu = wew.ktu || {};
    const paraf = Array.isArray(wew.paraf) ? wew.paraf : ['Sekretaris', 'Kepala Bidang', 'Kasubbag Umum'];
    const defKop = wew.default_kop || 'BAPPERIDA';

    const pegOpts = `<option value="">-- Pilih dari Daftar Pegawai (Opsional) --</option>` +
      (Array.isArray(pegawaiList) ? pegawaiList : []).map((p, i) => `<option value="${i}">${esc(p.nama || p.username)} — ${esc(p.jabatan || p.nip || '')}</option>`).join('');

    const wrap = d.createElement('div');
    wrap.id = 'stitchWewenangOverlay';
    wrap.className = 'fixed inset-0 z-[98] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5';
    wrap.innerHTML = `
      <div class="w-full max-w-2xl max-h-[92vh] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
        <div class="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <span class="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-[#2563eb] flex items-center justify-center">
              <span class="material-symbols-outlined text-[22px]">verified_user</span>
            </span>
            <div>
              <h3 class="text-base font-bold text-slate-900 dark:text-white">Pengaturan Wewenang &amp; Penandatangan</h3>
              <p class="text-[11px] text-slate-500 dark:text-slate-400">Otomatis diterapkan pada pratinjau, cetak, dan ekspor Word/ZIP SPT &amp; SPPD</p>
            </div>
          </div>
          <button type="button" data-close-wew class="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer">
            <span class="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <form id="formStitchWewenang" class="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60">
            <label class="block text-[11px] font-bold text-slate-700 dark:text-slate-200 mb-1.5">Default KOP Surat</label>
            <div class="grid grid-cols-2 gap-2">
              <label class="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer">
                <input type="radio" name="wewDefaultKop" value="BAPPERIDA" ${defKop !== 'SEKDA' ? 'checked' : ''} class="accent-[#2563eb]">
                <span class="font-bold text-slate-800 dark:text-slate-100">KOP BAPPERIDA</span>
              </label>
              <label class="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer">
                <input type="radio" name="wewDefaultKop" value="SEKDA" ${defKop === 'SEKDA' ? 'checked' : ''} class="accent-[#2563eb]">
                <span class="font-bold text-slate-800 dark:text-slate-100">KOP SEKDA</span>
              </label>
            </div>
          </div>

          <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 space-y-2.5">
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <span class="text-[11px] font-bold uppercase tracking-wider text-[#2563eb]">1. Pejabat Penandatangan Utama (Kepala Badan)</span>
              <select id="wewPickKepala" class="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px]">${pegOpts}</select>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">Nama Lengkap</label>
                <input type="text" id="wewKepalaNama" value="${esc(kepala.nama || 'CHARLES HERMANA WERU, S.Sos')}" class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
              </div>
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">NIP</label>
                <input type="text" id="wewKepalaNip" value="${esc(kepala.nip || '19721102 200112 1 001')}" class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono">
              </div>
              <div>
                <label class="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">Pangkat / Golongan</label>
                <input type="text" id="wewKepalaPangkat" value="${esc(kepala.pangkat || 'Pembina Utama Muda – IV/c')}" class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
              </div>
              <div class="grid grid-cols-3 gap-1.5">
                <div>
                  <label class="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">Status</label>
                  <select id="wewKepalaStatus" class="w-full px-2 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                    ${['Definitif', 'Plt.', 'Plh.'].map((st) => `<option value="${st}" ${(kepala.status_jabatan || 'Definitif') === st ? 'selected' : ''}>${st}</option>`).join('')}
                  </select>
                </div>
                <div class="col-span-2">
                  <label class="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">Jabatan</label>
                  <input type="text" id="wewKepalaJabatan" value="${esc(kepala.jabatan || 'KEPALA BAPPERIDA')}" class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                </div>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 space-y-2">
              <span class="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">2. Sekretaris Badan</span>
              <input type="text" id="wewSekNama" value="${esc(sek.nama || '')}" placeholder="Nama Sekretaris..." class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
              <input type="text" id="wewSekNip" value="${esc(sek.nip || '')}" placeholder="NIP Sekretaris..." class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono">
              <input type="text" id="wewSekJabatan" value="${esc(sek.jabatan || 'SEKRETARIS BAPPERIDA')}" placeholder="Jabatan..." class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
            </div>
            <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 space-y-2">
              <span class="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">3. PPTK / Kabid (Visum I)</span>
              <input type="text" id="wewBidNama" value="${esc(bid.nama || '')}" placeholder="Nama PPTK / Kabid..." class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
              <input type="text" id="wewBidNip" value="${esc(bid.nip || '')}" placeholder="NIP PPTK / Kabid..." class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono">
              <input type="text" id="wewBidJabatan" value="${esc(bid.jabatan || 'PEJABAT PELAKSANA TEKNIS KEGIATAN')}" placeholder="Jabatan..." class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 space-y-2">
              <span class="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">4. KTU / Kasubbag Umum</span>
              <input type="text" id="wewKtuNama" value="${esc(ktu.nama || '')}" placeholder="Nama KTU / Kasubbag..." class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
              <input type="text" id="wewKtuNip" value="${esc(ktu.nip || '')}" placeholder="NIP..." class="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono">
            </div>
            <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 space-y-2">
              <span class="block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">5. Paraf Hierarki (3 Baris)</span>
              <input type="text" id="wewParaf1" value="${esc(paraf[0] || '')}" placeholder="Jabatan Paraf 1..." class="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
              <input type="text" id="wewParaf2" value="${esc(paraf[1] || '')}" placeholder="Jabatan Paraf 2..." class="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
              <input type="text" id="wewParaf3" value="${esc(paraf[2] || '')}" placeholder="Jabatan Paraf 3..." class="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
            </div>
          </div>
        </form>

        <div class="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
          <button type="button" data-close-wew class="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer">Batal</button>
          <button type="button" id="btnSaveWewenang" class="px-5 py-2 rounded-xl bg-[#2563eb] hover:bg-blue-700 text-white text-xs font-bold shadow-sm cursor-pointer">Simpan Pengaturan Wewenang</button>
        </div>
      </div>
    `;

    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || e.target.closest('[data-close-wew]')) wrap.remove();
    });
    wrap.querySelector('#wewPickKepala')?.addEventListener('change', (e) => {
      const idx = Number(e.target.value);
      const p = pegawaiList[idx];
      if (!p) return;
      wrap.querySelector('#wewKepalaNama').value = p.nama || p.username || '';
      wrap.querySelector('#wewKepalaNip').value = p.nip || '';
      if (p.pangkat) wrap.querySelector('#wewKepalaPangkat').value = p.pangkat;
      if (p.jabatan) wrap.querySelector('#wewKepalaJabatan').value = p.jabatan.toUpperCase();
    });
    wrap.querySelector('#btnSaveWewenang')?.addEventListener('click', async () => {
      const payload = {
        default_kop: wrap.querySelector('input[name="wewDefaultKop"]:checked')?.value || 'BAPPERIDA',
        kepala: {
          nama: wrap.querySelector('#wewKepalaNama').value.trim(),
          nip: wrap.querySelector('#wewKepalaNip').value.trim(),
          pangkat: wrap.querySelector('#wewKepalaPangkat').value.trim(),
          status_jabatan: wrap.querySelector('#wewKepalaStatus').value || 'Definitif',
          jabatan: wrap.querySelector('#wewKepalaJabatan').value.trim(),
        },
        sekretaris: {
          nama: wrap.querySelector('#wewSekNama').value.trim(),
          nip: wrap.querySelector('#wewSekNip').value.trim(),
          jabatan: wrap.querySelector('#wewSekJabatan').value.trim(),
        },
        bidang: {
          nama: wrap.querySelector('#wewBidNama').value.trim(),
          nip: wrap.querySelector('#wewBidNip').value.trim(),
          jabatan: wrap.querySelector('#wewBidJabatan').value.trim(),
        },
        ktu: {
          nama: wrap.querySelector('#wewKtuNama').value.trim(),
          nip: wrap.querySelector('#wewKtuNip').value.trim(),
        },
        paraf: [
          wrap.querySelector('#wewParaf1').value.trim(),
          wrap.querySelector('#wewParaf2').value.trim(),
          wrap.querySelector('#wewParaf3').value.trim(),
        ].filter(Boolean),
      };
      try {
        const headers = { 'Content-Type': 'application/json' };
        const tok = getAuthToken();
        if (tok) headers.Authorization = `Bearer ${tok}`;
        const res = await fetch('/api/arsip/p/api/agenda/wewenang', {
          method: 'POST', headers, credentials: 'include', body: JSON.stringify({ data: payload, ...payload }),
        });
        if (!res.ok) throw new Error('Gagal menyimpan pengaturan wewenang');
        _wewenangCache = payload;
        wrap.remove();
        if (w.Swal) w.Swal.fire({ icon: 'success', title: 'Wewenang Disimpan', timer: 1600, showConfirmButton: false });
      } catch (err) {
        if (w.Swal) w.Swal.fire('Gagal', err.message || 'Tidak dapat menyimpan wewenang', 'error');
      }
    });

    d.body.appendChild(wrap);
  }

  async function openPreviewModal(rawItem, initialMode = 'spt') {
    if (!rawItem) return;
    const prev = d.getElementById('stitchSppdPreviewOverlay');
    if (prev) prev.remove();

    await loadWewenang();
    const item = enrichWithWewenang(rawItem);
    const pengikut = parsePengikutList(item.pengikut);

    let curMode = initialMode === 'sppd' ? 'sppd' : 'spt';
    let curPersonIdx = -1;
    let curPaper = 'F4';
    let curKop = String(item.kop_surat || 'BAPPERIDA').toUpperCase().includes('SEKDA') ? 'SEKDA' : 'BAPPERIDA';

    const wrap = d.createElement('div');
    wrap.id = 'stitchSppdPreviewOverlay';
    wrap.className = 'fixed inset-0 z-[97] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5';
    wrap.innerHTML = `
      <div class="w-full max-w-5xl h-[92vh] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
        <!-- Header -->
        <div class="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
          <div class="flex items-center gap-3 min-w-0">
            <span class="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-[#2563eb] flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-[20px]">preview</span>
            </span>
            <div class="min-w-0">
              <h3 class="text-sm font-bold text-slate-900 dark:text-white truncate">Pratinjau Dokumen SPT &amp; SPPD</h3>
              <p class="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">${esc(item.pelaksana_nama || '-')} • ${esc(item.nomor_sppd || item.nomor_spt || '-')}</p>
            </div>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <!-- Switcher Dokumen -->
            <div class="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
              <button type="button" data-pv-tab="spt" class="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer">Surat Tugas (SPT)</button>
              <button type="button" data-pv-tab="sppd" class="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer">SPPD</button>
            </div>
            <!-- Switcher KOP -->
            <div class="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
              <button type="button" data-pv-kop="BAPPERIDA" class="px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer">BAPPERIDA</button>
              <button type="button" data-pv-kop="SEKDA" class="px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer">SEKDA</button>
            </div>
            <!-- Switcher Kertas -->
            <div class="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
              <button type="button" data-pv-paper="F4" class="px-2.5 py-1.5 rounded-lg text-[11px] font-mono font-bold cursor-pointer">F4</button>
              <button type="button" data-pv-paper="A4" class="px-2.5 py-1.5 rounded-lg text-[11px] font-mono font-bold cursor-pointer">A4</button>
            </div>
            <button type="button" data-close-pv class="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer">
              <span class="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>

        <!-- Bar Personil (muncul jika mode SPPD dan ada pengikut) -->
        <div id="pvPersonBar" class="hidden px-5 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 flex items-center gap-1.5 overflow-x-auto">
          <span class="text-[11px] font-bold text-slate-500 shrink-0 mr-1">Personil:</span>
          <button type="button" data-pv-person="-1" class="px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 cursor-pointer">${esc(item.pelaksana_nama || 'Utama')}</button>
          ${pengikut.map((p, i) => `<button type="button" data-pv-person="${i}" class="px-2.5 py-1 rounded-lg text-[11px] font-semibold shrink-0 cursor-pointer">${esc(p.nama || `Pengikut ${i + 1}`)}</button>`).join('')}
        </div>

        <!-- Live Iframe Preview -->
        <div class="flex-1 bg-slate-200/80 dark:bg-slate-950 p-3 sm:p-5 overflow-auto flex justify-center">
          <div class="w-full max-w-[820px] bg-white rounded-xl shadow-lg overflow-hidden min-h-full">
            <iframe id="stitchSppdPreviewFrame" title="Pratinjau Dokumen" class="w-full h-full min-h-[680px] border-0 bg-white"></iframe>
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 flex items-center justify-between gap-2 flex-wrap">
          <span class="text-[11px] text-slate-500 dark:text-slate-400">Template Word resmi: <code class="font-mono text-primary">spt_template.docx</code> &amp; <code class="font-mono text-primary">sppd_template.docx</code></span>
          <div class="flex items-center gap-2 flex-wrap">
            <button type="button" id="pvBtnPrint" class="px-3.5 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-bold flex items-center gap-1.5 cursor-pointer">
              <span class="material-symbols-outlined text-[16px]">print</span>
              <span>Cetak / PDF</span>
            </button>
            <button type="button" id="pvBtnZip" class="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer">
              <span class="material-symbols-outlined text-[16px]">folder_zip</span>
              <span>Paket ZIP</span>
            </button>
            <button type="button" id="pvBtnDocx" class="px-4 py-2 rounded-xl bg-[#2563eb] hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer">
              <span class="material-symbols-outlined text-[16px]">download</span>
              <span id="pvBtnDocxLbl">Unduh SPT (.docx)</span>
            </button>
          </div>
        </div>
      </div>
    `;

    const activeItem = () => ({ ...item, kop_surat: curKop });

    const renderFrame = () => {
      const itCur = activeItem();
      const person = curPersonIdx >= 0 ? pengikut[curPersonIdx] : null;
      const mergedItem = person
        ? { ...itCur, pelaksana_nama: person.nama || itCur.pelaksana_nama, pelaksana_nip: person.nip || itCur.pelaksana_nip, pelaksana_pangkat: person.pangkat || itCur.pelaksana_pangkat, pelaksana_jabatan: person.jabatan || itCur.pelaksana_jabatan }
        : itCur;
      const html = curMode === 'spt' ? bangunHtmlSPT(itCur, { paper: curPaper }) : bangunHtmlSPPD(mergedItem, { paper: curPaper });
      const cleanHtml = html.replace(/<div class="toolbar-print">[\s\S]*?<\/div>/i, '');
      const frame = wrap.querySelector('#stitchSppdPreviewFrame');
      if (frame) frame.srcdoc = cleanHtml;

      wrap.querySelectorAll('[data-pv-tab]').forEach((b) => {
        const act = b.dataset.pvTab === curMode;
        b.className = act
          ? 'px-3 py-1.5 rounded-lg bg-[#2563eb] text-white text-xs font-bold shadow-xs cursor-pointer'
          : 'px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 text-xs font-semibold cursor-pointer';
      });
      wrap.querySelectorAll('[data-pv-kop]').forEach((b) => {
        const act = b.dataset.pvKop === curKop;
        b.className = act
          ? 'px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-bold cursor-pointer'
          : 'px-2.5 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 text-[11px] font-semibold cursor-pointer';
      });
      wrap.querySelectorAll('[data-pv-paper]').forEach((b) => {
        const act = b.dataset.pvPaper === curPaper;
        b.className = act
          ? 'px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[11px] font-mono font-bold cursor-pointer'
          : 'px-2.5 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 text-[11px] font-mono font-semibold cursor-pointer';
      });

      const pBar = wrap.querySelector('#pvPersonBar');
      if (pBar) pBar.classList.toggle('hidden', !(curMode === 'sppd' && pengikut.length > 0));
      wrap.querySelectorAll('[data-pv-person]').forEach((b) => {
        const act = Number(b.dataset.pvPerson) === curPersonIdx;
        b.className = act
          ? 'px-2.5 py-1 rounded-lg bg-[#2563eb] text-white text-[11px] font-bold shrink-0 cursor-pointer'
          : 'px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-semibold shrink-0 cursor-pointer';
      });

      const lbl = wrap.querySelector('#pvBtnDocxLbl');
      if (lbl) lbl.textContent = curMode === 'spt' ? 'Unduh SPT (.docx)' : 'Unduh SPPD (.docx)';
    };

    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || e.target.closest('[data-close-pv]')) wrap.remove();
    });
    wrap.querySelectorAll('[data-pv-tab]').forEach((b) => {
      b.addEventListener('click', () => { curMode = b.dataset.pvTab; renderFrame(); });
    });
    wrap.querySelectorAll('[data-pv-kop]').forEach((b) => {
      b.addEventListener('click', () => { curKop = b.dataset.pvKop; renderFrame(); });
    });
    wrap.querySelectorAll('[data-pv-paper]').forEach((b) => {
      b.addEventListener('click', () => { curPaper = b.dataset.pvPaper; renderFrame(); });
    });
    wrap.querySelectorAll('[data-pv-person]').forEach((b) => {
      b.addEventListener('click', () => { curPersonIdx = Number(b.dataset.pvPerson); renderFrame(); });
    });
    wrap.querySelector('#pvBtnPrint')?.addEventListener('click', () => {
      const frame = wrap.querySelector('#stitchSppdPreviewFrame');
      if (frame?.contentWindow) {
        frame.contentWindow.focus();
        frame.contentWindow.print();
      }
    });
    wrap.querySelector('#pvBtnZip')?.addEventListener('click', async () => {
      try {
        await downloadSppdBundleZip(activeItem());
      } catch (err) {
        if (w.Swal) w.Swal.fire('Gagal', err.message || 'Gagal membuat paket ZIP', 'error');
      }
    });
    wrap.querySelector('#pvBtnDocx')?.addEventListener('click', () => {
      const person = curPersonIdx >= 0 ? pengikut[curPersonIdx] : null;
      if (curMode === 'spt') downloadDocxFromTemplate('spt', activeItem(), null);
      else downloadDocxFromTemplate('sppd', activeItem(), person);
    });

    d.body.appendChild(wrap);
    renderFrame();
  }

  w.SppdGenerator = {
    loadWewenang,
    enrichWithWewenang,
    openWewenangModal,
    downloadSppdBundleZip,
    bangunHtmlSPT,
    bangunHtmlSPPD,
    openPreviewModal,
    cetakSPT(item, paper = 'F4') {
      openPrintWindow(bangunHtmlSPT(item, { paper }));
    },
    cetakSPPD(item, paper = 'F4') {
      openPrintWindow(bangunHtmlSPPD(item, { paper }));
    },
    async unduhWordSPT(item) {
      await loadWewenang();
      return downloadDocxFromTemplate('spt', enrichWithWewenang(item), null);
    },
    async unduhWordSPPD(item, person = null) {
      await loadWewenang();
      return downloadDocxFromTemplate('sppd', enrichWithWewenang(item), person);
    },
  };
})(window, document);
