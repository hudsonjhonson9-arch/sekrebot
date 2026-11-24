/* Stitch SPPD & Surat Tugas (SPT) Auto-Generator — Official UMA DATA / BAPPERIDA Format */
(function (w, d) {
  'use strict';

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

  const LOGO_SUMBA_BARAT_B64 = 'data:image/png;base64,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';

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

  function renderKopHtml(t, compact = false) {
    const logoSrc = LOGO_SUMBA_BARAT_B64;
    const isSekda = t.KopJenis === 'SEKDA';
    const titleFontSize = isSekda ? (compact ? '15pt' : '16pt') : (compact ? '12pt' : '13pt');
    return `
      <table style="width: 100%; border-bottom: 3px double #000; padding-bottom: 6px; margin-bottom: ${compact ? '10px' : '14px'}; border-collapse: collapse;">
        <tr>
          <td style="width: 82px; vertical-align: middle; text-align: center; padding-right: 6px;">
            <img src="${logoSrc}" alt="Lambang Kabupaten Sumba Barat" style="width: ${compact ? '68px' : '74px'}; height: auto; display: inline-block; object-fit: contain;" />
          </td>
          <td style="text-align: center; vertical-align: middle; font-family: Arial, Helvetica, sans-serif; padding-right: 30px;">
            <div style="font-size: ${compact ? '12pt' : '13pt'}; font-weight: bold; letter-spacing: 0.3px; line-height: 1.2;">${esc(t.KopPemkab)}</div>
            <div style="font-size: ${titleFontSize}; font-weight: bold; margin: 2px 0; line-height: 1.2; letter-spacing: ${isSekda ? '1.5px' : '0.2px'};">${t.KopInstansiHtml}</div>
            <div style="font-size: ${compact ? '8.5pt' : '9pt'}; margin-top: 2px; line-height: 1.3;">${esc(t.KopAlamat)}<br/>${esc(t.KopKontak)}</div>
            <div style="font-size: ${compact ? '9.5pt' : '10pt'}; font-weight: bold; letter-spacing: 2.5px; margin-top: 2px;">${esc(t.KopKota)}</div>
          </td>
        </tr>
      </table>
    `;
  }

  function baseCss(paper = 'F4') {
    const pageSize = paper === 'A4' ? '210mm 297mm' : '215mm 330mm';
    return `
      @page { size: ${pageSize}; margin: 12mm 14mm 12mm 16mm; }
      body { font-family: Arial, 'Times New Roman', sans-serif; color: #000; background: #fff; margin: 0; padding: 14px; }
      .toolbar-print { position: fixed; top: 10px; right: 12px; display: flex; gap: 8px; z-index: 99; }
      .toolbar-print button { padding: 8px 14px; border: none; border-radius: 8px; background: #2563eb; color: #fff; font-family: system-ui, sans-serif; font-size: 12px; font-weight: 700; cursor: pointer; }
      @media print { .toolbar-print, .screen-page-divider { display: none !important; } body { padding: 0; } }
    `;
  }

  function buildDocTags(rawIt = {}, person = null) {
    const it = enrichWithWewenang(rawIt);
    const kop = resolveKop(it);
    const isSekda = kop === KOP_PRESETS.SEKDA;
    const wew = it.wewenang || {};
    const parafArr = Array.isArray(wew.paraf) && wew.paraf.length
      ? wew.paraf
      : ['Sekretaris BAPPERIDA', 'Kepala Bidang PPE', 'Kasubbag Umum & Kepegawaian'];
    const sek = wew.sekretaris || {};
    const bid = wew.bidang || wew.pptk || {};
    const tahun = it.tahun || new Date().getFullYear();
    const dasarRaw = it.dasar_hukum || it.dasar_surat || `DPA Bapperida Kabupaten Sumba Barat TA ${tahun}`;
    const dasarRows = String(dasarRaw).split(/\r?\n/).map((s) => s.trim()).filter(Boolean).map((s, idx) => ({
      No: idx + 1,
      Teks: s.replace(/^\d+\.\s*/, ''),
    }));
    const pengikut = parsePengikutList(it.pengikut).filter((p) => p && (p.nama || p.name));
    const pelaksana = [
      {
        No: 1,
        Nama: it.pelaksana_nama || '-',
        PangkatGol: it.pelaksana_pangkat || '-',
        NIP: it.pelaksana_nip ? `NIP. ${it.pelaksana_nip}` : '-',
        Jabatan: it.pelaksana_jabatan || '-',
      },
      ...pengikut.map((p, idx) => ({
        No: idx + 2,
        Nama: p.nama || p.name,
        PangkatGol: p.pangkat || '-',
        NIP: p.nip ? `NIP. ${p.nip}` : '-',
        Jabatan: p.jabatan || '-',
      })),
    ];

    const targetNama = person?.nama || person?.name || it.pelaksana_nama || '-';
    const targetNip = person?.nip ?? it.pelaksana_nip ?? '-';
    const targetPangkat = person?.pangkat ?? it.pelaksana_pangkat ?? '-';
    const targetJabatan = person?.jabatan ?? it.pelaksana_jabatan ?? '-';
    const targetNomorSppd = person?.nomor_sppd || it.nomor_sppd || it.nomor_spt || '-';
    const formatTingkat = (v) => {
      const s = String(v || '').trim();
      if (!s || /^dalam\s*daerah$/i.test(s)) return 'Tingkat C';
      if (/^luar\s*daerah$/i.test(s)) return 'Tingkat B';
      return s;
    };
    const targetTingkat = formatTingkat(person?.tingkat_biaya || it.pelaksana_tingkat_biaya || it.tingkat_biaya || (it.jenis_sppd === 'LUAR_DAERAH' ? 'Tingkat B' : 'Tingkat C'));
    const pelaksanaPptk = wew.pelaksana_pptk || {};
    const isMainPerson = !person;
    const pptkNama = person?.pptk_nama || (isMainPerson ? (it.pelaksana_pptk_nama || pelaksanaPptk.nama) : '') || bid.nama || 'BERLIAN MAGU WERU,S.Sos';
    const pptkNip = person?.pptk_nip || (isMainPerson ? (it.pelaksana_pptk_nip || pelaksanaPptk.nip) : '') || bid.nip || '19690619 200503 1 001';
    const pptkJabatan = person?.pptk_jabatan || (isMainPerson ? (it.pelaksana_pptk_jabatan || pelaksanaPptk.jabatan) : '') || bid.jabatan || 'KEPALA BIDANG PPE';

    return {
      KopJenis: isSekda ? 'SEKDA' : 'BAPPERIDA',
      KopPemkab: kop.pemkab,
      KopInstansiHtml: isSekda ? 'SEKRETARIAT DAERAH' : 'BADAN PERENCANAAN PEMBANGUNAN,<br/>RISET DAN INOVASI DAERAH',
      KopAlamat: kop.alamat,
      KopKontak: kop.kontak,
      KopKota: kop.kota,
      Nomor: it.nomor_spt || it.nomor_sppd || '-',
      NomorSPPD: targetNomorSppd,
      Dasar: dasarRaw,
      dasarRows,
      pelaksana,
      Untuk: it.maksud_perjalanan || '-',
      Paraf1: parafArr[0] || 'Sekretaris BAPPERIDA',
      Paraf2: parafArr[1] || 'Kepala Bidang PPE',
      Paraf3: parafArr[2] || 'Kasubbag Umum & Kepegawaian',
      DitetapkanDi: it.ditetapkan_di || it.tempat_berangkat || 'Waikabubak',
      TanggalSurat: tanggalID(it.tanggal_spt || it.tanggal_berangkat || new Date().toISOString().slice(0, 10)),
      TanggalPenetapan: tanggalID(it.tanggal_spt || it.tanggal_berangkat || new Date().toISOString().slice(0, 10)),
      JabatanTtd: formatJabatanTtd(it, kop).toUpperCase(),
      KepalaNama: it.penandatangan_nama || 'CHARLES HERMANA WERU, S.Sos',
      KepalaPangkat: it.penandatangan_pangkat || 'Pembina Utama Muda – IV/c',
      KepalaNIP: it.penandatangan_nip || '19721102 200112 1 001',
      KpaNama: it.penandatangan_nama || 'CHARLES HERMANA WERU, S.Sos',
      Nama: targetNama,
      NIP: targetNip || '-',
      PangkatGolongan: targetPangkat || '-',
      JabatanInstansi: targetJabatan || '-',
      TingkatBiaya: targetTingkat,
      Maksud: it.maksud_perjalanan || '-',
      AlatAngkut: it.alat_angkutan || 'Kendaraan Dinas Roda 4',
      TempatBerangkat: it.tempat_berangkat || 'Waikabubak',
      TempatTujuan: it.tempat_tujuan || '-',
      TempatBerangkatRomawiI: it.tempat_berangkat || 'Waikabubak',
      TempatTujuanBerangkat: it.tempat_tujuan || '-',
      TanggalBerangkatRomawiI: tanggalID(it.tanggal_berangkat),
      LamaHari: formatLamaHari(it.tanggal_berangkat, it.tanggal_kembali),
      TanggalBerangkat: tanggalID(it.tanggal_berangkat),
      TanggalKembali: tanggalID(it.tanggal_kembali),
      Instansi: kop.anggaranInstansi,
      MataAnggaran: it.subkegiatan_nama || `DPA Tahun Anggaran ${tahun}`,
      PPTKJabatan: pptkJabatan,
      BidangNama: pptkNama,
      BidangNIP: pptkNip,
      SekretarisJabatan: (sek.jabatan || 'SEKRETARIS BAPPERIDA').toUpperCase(),
      SekretarisNama: sek.nama || 'IMANUEL MOSES KALEGOTAN, ST.,M.Si',
      SekretarisNIP: sek.nip || '19800315 200501 1 011',
    };
  }

  function bangunHtmlSPT(rawIt = {}, opts = {}) {
    const t = buildDocTags(rawIt, null);
    return `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><title>Surat Tugas - ${esc(t.Nomor)}</title><style>${baseCss(opts.paper || 'F4')}</style></head><body>
      <div class="toolbar-print"><button onclick="window.print()">Cetak / Simpan PDF</button></div>
      <div style="font-family: Arial, 'Times New Roman', sans-serif; color: #000; background: #fff; padding: 6px 10px; max-width: 780px; margin: 0 auto; line-height: 1.4; box-sizing: border-box;">
        ${renderKopHtml(t, false)}

        <div style="text-align: center; margin-bottom: 16px;">
          <div style="font-size: 12.5pt; font-weight: bold; text-decoration: underline; letter-spacing: 0.8px;">SURAT PERINTAH TUGAS</div>
          <div style="font-size: 10.5pt; margin-top: 2px; font-weight: bold;">Nomor : ${esc(t.Nomor)}</div>
        </div>

        <table style="width: 100%; font-size: 10.5pt; margin-bottom: 12px; border-collapse: collapse;">
          <tr>
            <td style="width: 85px; vertical-align: top; font-weight: bold; padding: 2px 0;">Dasar</td>
            <td style="width: 16px; vertical-align: top; text-align: center; padding: 2px 0;">:</td>
            <td style="vertical-align: top; line-height: 1.45; padding: 2px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                ${t.dasarRows.map((dr) => `
                  <tr>
                    <td style="width: 22px; vertical-align: top; padding: 1px 0;">${dr.No}.</td>
                    <td style="vertical-align: top; padding: 1px 0; text-align: justify;">${esc(dr.Teks)}</td>
                  </tr>
                `).join('')}
              </table>
            </td>
          </tr>
        </table>

        <div style="text-align: center; font-size: 11pt; font-weight: bold; letter-spacing: 0.8px; margin: 12px 0 10px;">
          MEMERINTAHKAN :
        </div>

        <table style="width: 100%; font-size: 10.5pt; margin-bottom: 14px; border-collapse: collapse;">
          <tr>
            <td style="width: 85px; vertical-align: top; font-weight: bold; padding: 2px 0;">Kepada</td>
            <td style="width: 16px; vertical-align: top; text-align: center; padding: 2px 0;">:</td>
            <td style="vertical-align: top; padding: 2px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                ${t.pelaksana.map((p) => `
                  <tr>
                    <td style="width: 22px; vertical-align: top; padding: 1px 0;">${p.No}.</td>
                    <td style="width: 115px; vertical-align: top; padding: 1px 0;">Nama</td>
                    <td style="width: 14px; vertical-align: top; padding: 1px 0; text-align: center;">:</td>
                    <td style="vertical-align: top; padding: 1px 0; font-weight: bold;">${esc(p.Nama)}</td>
                  </tr>
                  <tr>
                    <td></td>
                    <td style="vertical-align: top; padding: 1px 0;">Pangkat / Gol</td>
                    <td style="vertical-align: top; padding: 1px 0; text-align: center;">:</td>
                    <td style="vertical-align: top; padding: 1px 0;">${esc(p.PangkatGol)}</td>
                  </tr>
                  <tr>
                    <td></td>
                    <td style="vertical-align: top; padding: 1px 0;">NIP</td>
                    <td style="vertical-align: top; padding: 1px 0; text-align: center;">:</td>
                    <td style="vertical-align: top; padding: 1px 0;">${esc(p.NIP)}</td>
                  </tr>
                  <tr>
                    <td></td>
                    <td style="vertical-align: top; padding: 1px 0;">Jabatan</td>
                    <td style="vertical-align: top; padding: 1px 0; text-align: center;">:</td>
                    <td style="vertical-align: top; padding: 1px 0;">${esc(p.Jabatan)}</td>
                  </tr>
                  <tr><td colspan="4" style="height: 6px;"></td></tr>
                `).join('')}
              </table>
            </td>
          </tr>
        </table>

        <table style="width: 100%; font-size: 10.5pt; margin-bottom: 20px; border-collapse: collapse;">
          <tr>
            <td style="width: 85px; vertical-align: top; font-weight: bold; padding: 2px 0;">Untuk</td>
            <td style="width: 16px; vertical-align: top; text-align: center; padding: 2px 0;">:</td>
            <td style="vertical-align: top; line-height: 1.45; padding: 2px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="width: 22px; vertical-align: top;">1.</td>
                  <td style="vertical-align: top; text-align: justify;">${esc(t.Untuk)}</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <table style="width: 100%; font-size: 10pt; margin-top: 18px; border-collapse: collapse;">
          <tr>
            <td style="width: 46%; vertical-align: bottom; padding-right: 12px;">
              <table style="border: 1px solid #000; border-collapse: collapse; font-size: 8.5pt; width: 230px;">
                <tr>
                  <th style="border: 1px solid #000; padding: 3px 5px; text-align: center; width: 26px;">NO</th>
                  <th style="border: 1px solid #000; padding: 3px 6px; text-align: center;" colspan="2">Paraf Hirarki</th>
                </tr>
                <tr><td style="border: 1px solid #000; text-align: center; padding: 3px;">1.</td><td style="border: 1px solid #000; padding: 3px 6px;">${esc(t.Paraf1)}</td><td style="border: 1px solid #000; width: 42px; padding: 3px;"></td></tr>
                <tr><td style="border: 1px solid #000; text-align: center; padding: 3px;">2.</td><td style="border: 1px solid #000; padding: 3px 6px;">${esc(t.Paraf2)}</td><td style="border: 1px solid #000; padding: 3px;"></td></tr>
                <tr><td style="border: 1px solid #000; text-align: center; padding: 3px;">3.</td><td style="border: 1px solid #000; padding: 3px 6px;">${esc(t.Paraf3)}</td><td style="border: 1px solid #000; padding: 3px;"></td></tr>
              </table>
            </td>
            <td style="width: 54%; vertical-align: top; text-align: left; padding-left: 16px;">
              <table style="border-collapse: collapse; font-size: 10pt; margin-bottom: 6px;">
                <tr><td style="width: 95px; padding: 1px 0;">Ditetapkan di</td><td style="width: 12px; text-align: center;">:</td><td style="padding: 1px 0;">${esc(t.DitetapkanDi)}</td></tr>
                <tr><td style="padding: 1px 0;">Pada Tanggal</td><td style="text-align: center;">:</td><td style="padding: 1px 0;">${esc(t.TanggalSurat)}</td></tr>
              </table>
              <div style="text-align: center; font-weight: bold; margin-top: 6px; line-height: 1.3;">
                ${esc(t.JabatanTtd)}<br/>KABUPATEN SUMBA BARAT,
              </div>
              <div style="height: 56px;"></div>
              <div style="text-align: center;">
                <div style="font-weight: bold; text-decoration: underline;">${esc(t.KepalaNama)}</div>
                <div>${esc(t.KepalaPangkat)}</div>
                <div>NIP. ${esc(t.KepalaNIP)}</div>
              </div>
            </td>
          </tr>
        </table>
      </div>
    </body></html>`;
  }

  function bangunHtmlSPPD(rawIt = {}, opts = {}) {
    const t = buildDocTags(rawIt, opts.person || null);
    return `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><title>SPPD - ${esc(t.NomorSPPD)}</title><style>${baseCss(opts.paper || 'F4')}</style></head><body>
      <div class="toolbar-print"><button onclick="window.print()">Cetak / Simpan PDF</button></div>
      <div style="font-family: Arial, 'Times New Roman', sans-serif; color: #000; background: #fff; padding: 2px 4px; max-width: 780px; margin: 0 auto; line-height: 1.25; box-sizing: border-box;">
        <div class="sppd-page-1" style="padding-bottom: 8px;">
          ${renderKopHtml(t, true)}

          <table style="width: 100%; font-size: 9pt; margin-bottom: 4px; border-collapse: collapse;">
            <tr>
              <td style="width: 55%;"></td>
              <td style="width: 45%;">
                <table style="width: 100%; font-size: 9.5pt; border-collapse: collapse;">
                  <tr><td style="width: 78px; padding: 1px 0;">Lembar ke</td><td style="width: 10px;">:</td><td></td></tr>
                  <tr><td style="padding: 1px 0;">Kode No</td><td>:</td><td></td></tr>
                  <tr><td style="padding: 1px 0;">Nomor</td><td>:</td><td><b>${esc(t.NomorSPPD)}</b></td></tr>
                </table>
              </td>
            </tr>
          </table>

          <div style="text-align: center; margin-bottom: 10px;">
            <div style="font-size: 11.5pt; font-weight: bold; text-decoration: underline; letter-spacing: 0.5px;">SURAT PERJALANAN DINAS (SPD)</div>
          </div>

          <table style="width: 100%; border: 1px solid #000; border-collapse: collapse; font-size: 9pt; table-layout: fixed;">
            <colgroup>
              <col style="width: 26px;" />
              <col style="width: 220px;" />
              <col style="width: 22px;" />
              <col style="width: auto;" />
            </colgroup>
            <tr>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 4px;">1.</td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 3px 6px;">Pengguna Anggaran / Kuasa Pengguna Anggaran</td>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 2px;">:</td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 3px 6px; font-weight: bold;">${esc(t.KpaNama)}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 4px;">2.</td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 3px 6px;">Nama / NIP Pegawai yang melaksanakan perjalanan Dinas</td>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 2px;">:</td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 3px 6px;"><b>${esc(t.Nama)}</b><br/>NIP. ${esc(t.NIP)}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 4px;">3.</td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 3px 6px;">Pangkat dan Golongan</td>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 2px;">a.</td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 3px 6px;">${esc(t.PangkatGolongan)}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 4px;"></td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 3px 6px;">Jabatan / Instansi</td>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 2px;">b.</td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 3px 6px;">${esc(t.JabatanInstansi)}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 4px;"></td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 3px 6px;">Tingkat Biaya Perjalanan Dinas</td>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 2px;">c.</td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 3px 6px;">${esc(t.TingkatBiaya)}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 4px;">4.</td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 3px 6px;">Maksud perjalanan dinas</td>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 2px;">:</td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 3px 6px; text-align: justify;">${esc(t.Maksud)}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 4px;">5.</td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 3px 6px;">Alat angkut yang digunakan</td>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 2px;">:</td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 3px 6px;">${esc(t.AlatAngkut)}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 4px;">6.</td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 3px 6px;">Tempat berangkat</td>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 2px;">a.</td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 3px 6px;">${esc(t.TempatBerangkat)}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 4px;"></td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 3px 6px;">Tempat tujuan</td>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 2px;">b.</td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 3px 6px;">${esc(t.TempatTujuan)}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 4px;">7.</td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 3px 6px;">Lamanya perjalanan dinas</td>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 2px;">a.</td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 3px 6px;">${esc(t.LamaHari)}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 4px;"></td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 3px 6px;">Tanggal berangkat</td>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 2px;">b.</td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 3px 6px;">${esc(t.TanggalBerangkat)}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 4px;"></td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 3px 6px;">Tanggal harus kembali</td>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 2px;">c.</td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 3px 6px;">${esc(t.TanggalKembali)}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 4px;">8.</td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 3px 6px;">Pengikut : Nama</td>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 2px;"></td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 0;">
                <table style="width: 100%; border-collapse: collapse; font-size: 8.5pt;">
                  <tr>
                    <td style="width: 50%; border-right: 1px solid #000; text-align: center; padding: 2px 4px;">Tanggal Lahir</td>
                    <td style="width: 50%; text-align: center; padding: 2px 4px;">Keterangan</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 4px;"></td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 3px 6px; line-height: 1.3;">1.<br/>2.<br/>3.<br/>4.<br/>5.</td>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 2px;"></td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 0;">
                <table style="width: 100%; height: 100%; min-height: 48px; border-collapse: collapse; font-size: 8.5pt;">
                  <tr><td style="width: 50%; border-right: 1px solid #000;">&nbsp;</td><td style="width: 50%;">&nbsp;</td></tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 4px;">9.</td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 3px 6px;">Pembebanan anggaran</td>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 2px;">:</td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 3px 6px;"></td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 4px;"></td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 3px 6px;">Instansi</td>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 2px;">a.</td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 3px 6px;">${esc(t.Instansi)}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 4px;"></td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 3px 6px;">Mata anggaran</td>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 2px;">b.</td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 3px 6px;">${esc(t.MataAnggaran)}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 4px;">10.</td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 3px 6px;">Keterangan lain-lain</td>
              <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 3px 2px;">:</td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 3px 6px;">-</td>
            </tr>
          </table>

          <table style="width: 100%; font-size: 9pt; margin-top: 10px; border-collapse: collapse;">
            <tr>
              <td style="width: 44%; vertical-align: bottom; padding-right: 10px;">
                <table style="border: 1px solid #000; border-collapse: collapse; font-size: 8pt; width: 210px;">
                  <tr><th style="border: 1px solid #000; padding: 2px 4px; text-align: center; width: 24px;">NO</th><th style="border: 1px solid #000; padding: 2px 5px; text-align: center;" colspan="2">Paraf Hirarki</th></tr>
                  <tr><td style="border: 1px solid #000; text-align: center; padding: 2px;">1.</td><td style="border: 1px solid #000; padding: 2px 5px;">${esc(t.Paraf1)}</td><td style="border: 1px solid #000; width: 34px;"></td></tr>
                  <tr><td style="border: 1px solid #000; text-align: center; padding: 2px;">2.</td><td style="border: 1px solid #000; padding: 2px 5px;">${esc(t.Paraf2)}</td><td style="border: 1px solid #000;"></td></tr>
                  <tr><td style="border: 1px solid #000; text-align: center; padding: 2px;">3.</td><td style="border: 1px solid #000; padding: 2px 5px;">${esc(t.Paraf3)}</td><td style="border: 1px solid #000;"></td></tr>
                </table>
              </td>
              <td style="width: 56%; vertical-align: top; padding-left: 12px;">
                <table style="border-collapse: collapse; font-size: 9pt; margin-bottom: 3px;">
                  <tr><td style="width: 85px;">Ditetapkan di</td><td style="width: 10px; text-align: center;">:</td><td>${esc(t.DitetapkanDi)}</td></tr>
                  <tr><td>Pada Tanggal</td><td style="text-align: center;">:</td><td>${esc(t.TanggalPenetapan)}</td></tr>
                </table>
                <div style="text-align: center; font-weight: bold; margin-top: 3px; line-height: 1.25; font-size: 9pt;">
                  ${esc(t.JabatanTtd)}<br/>KABUPATEN SUMBA BARAT,
                </div>
                <div style="height: 38px;"></div>
                <div style="text-align: center; font-size: 9pt;">
                  <div style="font-weight: bold; text-decoration: underline;">${esc(t.KepalaNama)}</div>
                  <div>${esc(t.KepalaPangkat)}</div>
                  <div>NIP. ${esc(t.KepalaNIP)}</div>
                </div>
              </td>
            </tr>
          </table>
        </div>

        <div class="screen-page-divider" style="border-top: 2px dashed #cbd5e1; margin: 16px 0 18px; position: relative; text-align: center;">
          <span style="background: #f1f5f9; color: #475569; font-family: sans-serif; font-size: 10px; font-weight: 700; padding: 2px 10px; border-radius: 99px; position: relative; top: -9px; letter-spacing: 0.5px;">
            LEMBAR II — VISUM &amp; PENGESAHAN PERJALANAN DINAS
          </span>
        </div>

        <div style="page-break-before: always; break-before: page; box-sizing: border-box;" class="sppd-page-2">
          <table style="width: 100%; border: 1px solid #000; border-collapse: collapse; font-size: 8.5pt; table-layout: fixed; line-height: 1.25;">
            <tr>
              <td style="border: 1px solid #000; width: 48%; vertical-align: top; padding: 4px 6px;">&nbsp;</td>
              <td style="border: 1px solid #000; width: 52%; vertical-align: top; padding: 4px 6px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 8.5pt;">
                  <tr><td style="width: 16px; vertical-align: top; font-weight: bold;">I.</td><td style="width: 95px; vertical-align: top;">Berangkat dari<br/><span style="font-size: 7.5pt;">(Tempat Kedudukan)</span></td><td style="width: 8px; vertical-align: top;">:</td><td style="vertical-align: top; font-weight: bold;">${esc(t.TempatBerangkatRomawiI)}</td></tr>
                  <tr><td></td><td style="vertical-align: top;">Ke</td><td style="vertical-align: top;">:</td><td style="vertical-align: top; font-weight: bold;">${esc(t.TempatTujuanBerangkat)}</td></tr>
                  <tr><td></td><td style="vertical-align: top;">Pada Tanggal</td><td style="vertical-align: top;">:</td><td style="vertical-align: top;">${esc(t.TanggalBerangkatRomawiI)}</td></tr>
                </table>
                <div style="text-align: center; margin-top: 4px;">
                  <div style="font-weight: bold; line-height: 1.2;">${esc(String(t.PPTKJabatan || 'KEPALA BIDANG PPE').toUpperCase())},</div>
                  <div style="height: 28px;"></div>
                  <div style="font-weight: bold; text-decoration: underline;">${esc(t.BidangNama)}</div>
                  <div>NIP. ${esc(t.BidangNIP)}</div>
                </div>
              </td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; vertical-align: top; padding: 4px 6px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 8.5pt;">
                  <tr><td style="width: 18px; vertical-align: top; font-weight: bold;">II.</td><td style="width: 70px; vertical-align: top;">Tiba di</td><td style="width: 8px; vertical-align: top;">:</td><td style="vertical-align: top;">${esc(t.TempatTujuan)}</td></tr>
                  <tr><td></td><td style="vertical-align: top;">Pada Tanggal</td><td style="vertical-align: top;">:</td><td style="vertical-align: top;">${esc(t.TanggalBerangkat)}</td></tr>
                  <tr><td></td><td colspan="3" style="padding-top: 1px;">Kepala / Pejabat :</td></tr>
                </table>
                <div style="height: 28px;"></div>
                <div style="text-align: center; font-size: 8.5pt;">( ............................................................ )<br/><span style="display: inline-block; width: 85%; text-align: left;">NIP.</span></div>
              </td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 4px 6px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 8.5pt;">
                  <tr><td style="width: 85px; vertical-align: top;">Berangkat dari</td><td style="width: 8px; vertical-align: top;">:</td><td style="vertical-align: top;">${esc(t.TempatTujuan)}</td></tr>
                  <tr><td style="vertical-align: top;">Ke</td><td style="vertical-align: top;">:</td><td style="vertical-align: top;">${esc(t.TempatBerangkat)}</td></tr>
                  <tr><td style="vertical-align: top;">Pada Tanggal</td><td style="vertical-align: top;">:</td><td style="vertical-align: top;">${esc(t.TanggalKembali)}</td></tr>
                  <tr><td colspan="3" style="padding-top: 1px;">Kepala / Pejabat :</td></tr>
                </table>
                <div style="height: 24px;"></div>
                <div style="text-align: center; font-size: 8.5pt;">( ............................................................ )<br/><span style="display: inline-block; width: 85%; text-align: left;">NIP.</span></div>
              </td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; vertical-align: top; padding: 4px 6px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 8.5pt;">
                  <tr><td style="width: 18px; vertical-align: top; font-weight: bold;">III.</td><td style="width: 70px; vertical-align: top;">Tiba di</td><td style="width: 8px; vertical-align: top;">:</td><td style="vertical-align: top;"></td></tr>
                  <tr><td></td><td style="vertical-align: top;">Pada Tanggal</td><td style="vertical-align: top;">:</td><td style="vertical-align: top;"></td></tr>
                  <tr><td></td><td colspan="3" style="padding-top: 1px;">Kepala / Pejabat :</td></tr>
                </table>
                <div style="height: 24px;"></div>
                <div style="text-align: center; font-size: 8.5pt;">( ............................................................ )<br/><span style="display: inline-block; width: 85%; text-align: left;">NIP.</span></div>
              </td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 4px 6px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 8.5pt;">
                  <tr><td style="width: 85px; vertical-align: top;">Berangkat dari</td><td style="width: 8px; vertical-align: top;">:</td><td style="vertical-align: top;"></td></tr>
                  <tr><td style="vertical-align: top;">Ke</td><td style="vertical-align: top;">:</td><td style="vertical-align: top;"></td></tr>
                  <tr><td style="vertical-align: top;">Pada Tanggal</td><td style="vertical-align: top;">:</td><td style="vertical-align: top;"></td></tr>
                  <tr><td colspan="3" style="padding-top: 1px;">Kepala / Pejabat :</td></tr>
                </table>
                <div style="height: 22px;"></div>
                <div style="text-align: center; font-size: 8.5pt;">( ............................................................ )<br/><span style="display: inline-block; width: 85%; text-align: left;">NIP.</span></div>
              </td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; vertical-align: top; padding: 4px 6px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 8.5pt;">
                  <tr><td style="width: 20px; vertical-align: top; font-weight: bold;">IV.</td><td style="width: 65px; vertical-align: top;">Tiba<br/>pada<br/>Tanggal</td><td style="width: 8px; vertical-align: top;">:<br/>:</td><td style="vertical-align: top;">${esc(t.TempatBerangkat)}<br/>${esc(t.TanggalKembali)}</td></tr>
                </table>
                <div style="text-align: center; margin-top: 6px;">
                  <div style="font-weight: bold; line-height: 1.2;">${esc(t.SekretarisJabatan)}<br/>KABUPATEN SUMBA BARAT</div>
                  <div style="height: 28px;"></div>
                  <div style="font-weight: bold; text-decoration: underline;">${esc(t.SekretarisNama)}</div>
                  <div style="font-weight: bold;">NIP. ${esc(t.SekretarisNIP)}</div>
                </div>
              </td>
              <td style="border: 1px solid #000; vertical-align: top; padding: 4px 6px;">
                <div style="text-align: justify; line-height: 1.3; font-size: 8.5pt;">
                  Telah diperiksa, dengan keterangan bahwa perjalanan tersebut diatas benar dilakukan atas perintahnya dan semata-mata untuk kepentingan jabatan dalam waktu yang sesingkat-singkatnya.
                </div>
              </td>
            </tr>
            <tr>
              <td colspan="2" style="border: 1px solid #000; padding: 3px 6px; font-size: 8.5pt; line-height: 1.25;">
                <table style="width: 100%; border-collapse: collapse; font-size: 8.5pt;"><tr><td style="width: 20px; vertical-align: top; font-weight: bold;">V.</td><td style="vertical-align: top;">Catatan Lain-lain</td></tr></table>
              </td>
            </tr>
            <tr>
              <td colspan="2" style="border: 1px solid #000; padding: 3px 6px; font-size: 8.5pt; line-height: 1.25;">
                <table style="width: 100%; border-collapse: collapse; font-size: 8.5pt;">
                  <tr>
                    <td style="width: 20px; vertical-align: top; font-weight: bold;">VI.</td>
                    <td style="vertical-align: top; text-align: justify;"><b>PERHATIAN:</b><br/>Pengguna Anggaran/Kuasa Pengguna Anggaran yang menerbitkan SPD, pejabat/pegawai/pihak lain yang melakukan perjalanan dinas, para pejabat yang mengesahkan tanggal berangkat/tiba serta bendahara pengeluaran bertanggung jawab berdasarkan peraturan-peraturan Keuangan Daerah apabila Negara menderita rugi akibat kesalahan kelalaian dan kearsipannya.</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </div>
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

  async function openPreviewModal(rawItem, initialMode = 'spt', initialPersonIdx = 0) {
    if (!rawItem) return;
    const prev = d.getElementById('stitchSppdPreviewOverlay');
    if (prev) prev.remove();

    await loadWewenang();
    const item = enrichWithWewenang(rawItem);
    const pengikut = parsePengikutList(item.pengikut).filter((p) => p && (p.nama || p.name));
    const wew = item.wewenang || {};
    const p1Pptk = wew.pelaksana_pptk || wew.bidang || {};
    const defTingkat = item.tingkat_biaya || (item.jenis_sppd === 'LUAR_DAERAH' ? 'Tingkat B' : 'Tingkat C');

    const allPersonnel = [
      {
        nama: item.pelaksana_nama || '-',
        nip: item.pelaksana_nip || '',
        pangkat: item.pelaksana_pangkat || '',
        jabatan: item.pelaksana_jabatan || '',
        tingkat_biaya: item.pelaksana_tingkat_biaya || p1Pptk.tingkat_biaya || defTingkat,
        pptk_nama: item.pelaksana_pptk_nama || p1Pptk.nama || '',
        pptk_nip: item.pelaksana_pptk_nip || p1Pptk.nip || '',
        pptk_jabatan: item.pelaksana_pptk_jabatan || p1Pptk.jabatan || 'Kepala Bidang PPE',
        tempat_berangkat: item.pelaksana_tempat_berangkat || p1Pptk.tempat_berangkat || item.tempat_berangkat || 'Waikabubak',
        tempat_tujuan: item.pelaksana_tempat_tujuan || p1Pptk.tempat_tujuan || item.tempat_tujuan || '',
        tanggal_berangkat: item.pelaksana_tanggal_berangkat || p1Pptk.tanggal_berangkat || item.tanggal_berangkat || '',
      },
      ...pengikut.map((p) => ({
        ...p,
        tingkat_biaya: p.tingkat_biaya || defTingkat,
      })),
    ];

    let curMode = initialMode === 'sppd' ? 'sppd' : 'spt';
    let curPersonIdx = Math.max(0, Math.min(initialPersonIdx || 0, allPersonnel.length - 1));
    let curPaper = 'A4';
    let curKop = String(item.kop_surat || 'BAPPERIDA').toUpperCase().includes('SEKDA') ? 'SEKDA' : 'BAPPERIDA';

    const wrap = d.createElement('div');
    wrap.id = 'stitchSppdPreviewOverlay';
    wrap.className = 'fixed inset-0 z-[97] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5';
    wrap.innerHTML = `
      <div class="w-full max-w-5xl max-h-[94vh] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
        <!-- Header -->
        <div class="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <span class="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-[#2563eb] flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-[20px]">description</span>
            </span>
            <div class="min-w-0">
              <h3 class="text-sm font-bold text-slate-900 dark:text-white leading-tight">Pratinjau Dokumen Resmi</h3>
              <p class="text-[11.5px] text-slate-500 dark:text-slate-400 truncate leading-tight mt-0.5">${esc(item.nomor_spt || item.nomor_register || '1')} · ${esc(item.pelaksana_nama || '-')}</p>
            </div>
          </div>
          <button type="button" data-close-pv class="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center cursor-pointer">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <!-- Body Scrollable -->
        <div class="p-4 sm:p-5 flex flex-col gap-3 overflow-y-auto">
          <!-- Toolbar Utama -->
          <div class="flex items-center justify-between flex-wrap gap-2.5">
            <div class="flex items-center gap-2 flex-wrap">
              <!-- Tabs -->
              <div class="inline-flex items-center gap-1.5">
                <button type="button" data-pv-tab="spt" class="px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all">Surat Perintah Tugas (SPT)</button>
                <button type="button" data-pv-tab="sppd" class="px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all">Lembar SPPD (${allPersonnel.length})</button>
              </div>

              <div class="h-5 w-px bg-slate-200 dark:bg-slate-700 mx-1"></div>

              <!-- KOP Switcher -->
              <div class="inline-flex items-center gap-1 text-[11.5px] font-bold text-slate-500">
                <span class="mr-1">KOP:</span>
                <button type="button" data-pv-kop="BAPPERIDA" class="px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer transition-all">BAPPERIDA</button>
                <button type="button" data-pv-kop="SEKDA" class="px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer transition-all">Sekretariat Daerah</button>
              </div>

              <div class="h-5 w-px bg-slate-200 dark:bg-slate-700 mx-1"></div>

              <!-- Kertas Switcher -->
              <div class="inline-flex items-center gap-1 text-[11.5px] font-bold text-slate-500">
                <span class="mr-1">Kertas:</span>
                <button type="button" data-pv-paper="A4" class="px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer transition-all">A4</button>
                <button type="button" data-pv-paper="F4" class="px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer transition-all">F4 (Folio)</button>
              </div>
            </div>

            <!-- Action buttons -->
            <div class="flex items-center gap-2 flex-wrap">
              <button type="button" id="pvBtnPrint" class="px-3.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs">
                <span class="material-symbols-outlined text-[16px]">print</span>
                <span id="pvBtnPrintLbl">Cetak (A4)</span>
              </button>
              <button type="button" id="pvBtnDocx" class="px-3.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs">
                <span class="material-symbols-outlined text-[16px]">description</span>
                <span>Unduh DOCX</span>
              </button>
              <button type="button" id="pvBtnPdf" class="px-3.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs">
                <span class="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                <span id="pvBtnPdfLbl">Unduh PDF (A4)</span>
              </button>
              <button type="button" id="pvBtnZip" class="px-3.5 py-1.5 rounded-lg bg-[#2563eb] hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm">
                <span class="material-symbols-outlined text-[16px]">download</span>
                <span>ZIP Lengkap</span>
              </button>
            </div>
          </div>

          <!-- Personil Selector Bar (muncul saat tab SPPD aktif) -->
          <div id="pvPersonBar" class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-3 flex-wrap">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-xs font-bold text-slate-500">Pilih Personil:</span>
              <div id="pvPersonBtnWrap" class="flex items-center gap-1.5 flex-wrap"></div>
            </div>
            <div id="pvPptkInfo" class="text-xs text-slate-500 dark:text-slate-400"></div>
          </div>

          <!-- Paper Preview Canvas -->
          <div class="bg-slate-300 dark:bg-slate-950 rounded-xl p-4 sm:p-6 overflow-auto flex justify-center border border-slate-300 dark:border-slate-800 max-h-[66vh]">
            <div id="stitchPaperCanvas" class="bg-white text-black rounded-xs shadow-2xl p-7 sm:p-9 box-border transition-all" style="width: 100%; max-width: 794px; min-height: 1123px; font-family: Arial, 'Times New Roman', sans-serif; font-size: 10pt; line-height: 1.4;">
            </div>
          </div>

          <!-- Footer Note -->
          <div id="pvFooterNote" class="text-center text-[11.5px] text-slate-500 dark:text-slate-400">
            Pratinjau A4 · Klik <strong>Cetak (A4)</strong> untuk mencetak langsung, <strong>Unduh PDF (A4)</strong> untuk berkas PDF, atau <strong>Unduh DOCX</strong> untuk berkas Microsoft Word.
          </div>
        </div>
      </div>
    `;

    const activeItem = () => ({ ...item, kop_surat: curKop });

    const render = () => {
      const itCur = activeItem();
      const curPerson = allPersonnel[curPersonIdx] || allPersonnel[0];
      const personArg = curPersonIdx > 0 ? curPerson : null;

      // Update Toolbar buttons
      wrap.querySelectorAll('[data-pv-tab]').forEach((b) => {
        const act = b.dataset.pvTab === curMode;
        b.className = act
          ? 'px-3.5 py-1.5 rounded-lg bg-[#2563eb] text-white text-xs font-bold shadow-xs cursor-pointer'
          : 'px-3.5 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 text-xs font-semibold cursor-pointer border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800';
      });

      wrap.querySelectorAll('[data-pv-kop]').forEach((b) => {
        const act = b.dataset.pvKop === curKop;
        b.className = act
          ? 'px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-950/60 text-[#2563eb] dark:text-blue-300 border border-[#2563eb] text-xs font-bold cursor-pointer'
          : 'px-2.5 py-1 rounded-md text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold cursor-pointer';
      });

      wrap.querySelectorAll('[data-pv-paper]').forEach((b) => {
        const act = b.dataset.pvPaper === curPaper;
        b.className = act
          ? 'px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-950/60 text-[#2563eb] dark:text-blue-300 border border-[#2563eb] text-xs font-bold cursor-pointer'
          : 'px-2.5 py-1 rounded-md text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold cursor-pointer';
      });

      const printLbl = wrap.querySelector('#pvBtnPrintLbl');
      if (printLbl) printLbl.textContent = `Cetak (${curPaper})`;
      const pdfLbl = wrap.querySelector('#pvBtnPdfLbl');
      if (pdfLbl) pdfLbl.textContent = `Unduh PDF (${curPaper})`;

      const footerNote = wrap.querySelector('#pvFooterNote');
      if (footerNote) {
        footerNote.innerHTML = `Pratinjau ${curPaper} · Klik <strong>Cetak (${curPaper})</strong> untuk mencetak langsung, <strong>Unduh PDF (${curPaper})</strong> untuk berkas PDF, atau <strong>Unduh DOCX</strong> untuk berkas Microsoft Word.`;
      }

      // Personil bar
      const pBar = wrap.querySelector('#pvPersonBar');
      if (pBar) {
        pBar.classList.toggle('hidden', curMode !== 'sppd');
        const btnWrap = wrap.querySelector('#pvPersonBtnWrap');
        if (btnWrap) {
          btnWrap.innerHTML = allPersonnel.map((p, idx) => {
            const act = idx === curPersonIdx;
            return `<button type="button" data-person-btn="${idx}" class="px-2.5 py-1 rounded-md text-xs cursor-pointer transition-all ${act ? 'bg-[#2563eb] text-white font-bold' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-medium'}">${idx + 1}. ${esc(p.nama)}</button>`;
          }).join('');
          btnWrap.querySelectorAll('[data-person-btn]').forEach((btn) => {
            btn.addEventListener('click', () => {
              curPersonIdx = Number(btn.dataset.personBtn);
              render();
            });
          });
        }
        const pptkInfo = wrap.querySelector('#pvPptkInfo');
        if (pptkInfo) {
          const p1Pptk = wew.pelaksana_pptk || {};
          const pptkJab = curPerson?.pptk_jabatan || (curPersonIdx === 0 ? (item.pelaksana_pptk_jabatan || p1Pptk.jabatan) : '') || wew.bidang?.jabatan || 'Kepala Bidang PPE';
          const pptkNm = curPerson?.pptk_nama || (curPersonIdx === 0 ? (item.pelaksana_pptk_nama || p1Pptk.nama) : '') || wew.bidang?.nama || 'BERLIAN MAGU WERU, S.Sos';
          pptkInfo.innerHTML = `Pengesah Romawi I: <strong class="text-slate-800 dark:text-slate-200">${esc(pptkJab)}</strong> (${esc(pptkNm)})`;
        }
      }

      // Paper Canvas Sizing & Content
      const paperCanvas = wrap.querySelector('#stitchPaperCanvas');
      if (paperCanvas) {
        if (curPaper === 'A4') {
          paperCanvas.style.maxWidth = '794px';
          paperCanvas.style.minHeight = '1123px';
        } else {
          paperCanvas.style.maxWidth = '813px';
          paperCanvas.style.minHeight = '1247px';
        }

        const rawHtml = curMode === 'spt'
          ? bangunHtmlSPT(itCur, { paper: curPaper })
          : bangunHtmlSPPD(itCur, { paper: curPaper, person: personArg });

        // Clean outer html/body tags to render directly into paperCanvas
        const cleaned = rawHtml
          .replace(/<!DOCTYPE[\s\S]*?<body[^>]*>/i, '')
          .replace(/<\/body>[\s\S]*?<\/html>/i, '')
          .replace(/<div class="toolbar-print">[\s\S]*?<\/div>/i, '');

        paperCanvas.innerHTML = cleaned;
      }
    };

    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || e.target.closest('[data-close-pv]')) wrap.remove();
    });

    wrap.querySelectorAll('[data-pv-tab]').forEach((b) => {
      b.addEventListener('click', () => { curMode = b.dataset.pvTab; render(); });
    });
    wrap.querySelectorAll('[data-pv-kop]').forEach((b) => {
      b.addEventListener('click', () => { curKop = b.dataset.pvKop; render(); });
    });
    wrap.querySelectorAll('[data-pv-paper]').forEach((b) => {
      b.addEventListener('click', () => { curPaper = b.dataset.pvPaper; render(); });
    });

    wrap.querySelector('#pvBtnPrint')?.addEventListener('click', () => {
      const itCur = activeItem();
      const curPerson = allPersonnel[curPersonIdx] || allPersonnel[0];
      const personArg = curPersonIdx > 0 ? curPerson : null;
      if (curMode === 'spt') w.SppdGenerator.cetakSPT(itCur, curPaper);
      else w.SppdGenerator.cetakSPPD(itCur, curPaper, personArg);
    });

    wrap.querySelector('#pvBtnPdf')?.addEventListener('click', () => {
      const itCur = activeItem();
      const curPerson = allPersonnel[curPersonIdx] || allPersonnel[0];
      const personArg = curPersonIdx > 0 ? curPerson : null;
      if (curMode === 'spt') w.SppdGenerator.cetakSPT(itCur, curPaper);
      else w.SppdGenerator.cetakSPPD(itCur, curPaper, personArg);
    });

    wrap.querySelector('#pvBtnZip')?.addEventListener('click', async () => {
      try {
        await downloadSppdBundleZip(activeItem());
      } catch (err) {
        if (w.Swal) w.Swal.fire('Gagal', err.message || 'Gagal membuat paket ZIP', 'error');
      }
    });

    wrap.querySelector('#pvBtnDocx')?.addEventListener('click', () => {
      const itCur = activeItem();
      const curPerson = allPersonnel[curPersonIdx] || allPersonnel[0];
      const personArg = curPersonIdx > 0 ? curPerson : null;
      if (curMode === 'spt') downloadDocxFromTemplate('spt', itCur, null);
      else downloadDocxFromTemplate('sppd', itCur, personArg);
    });

    d.body.appendChild(wrap);
    render();
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
