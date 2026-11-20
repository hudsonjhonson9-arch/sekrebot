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

  function renderKopHtml(t, compact = false) {
    const logoSrc = getLogoAbsUrl();
    const isSekda = t.KopJenis === 'SEKDA';
    const titleFontSize = isSekda ? (compact ? '15pt' : '16pt') : (compact ? '12pt' : '13pt');
    return `
      <table style="width: 100%; border-bottom: 3px double #000; padding-bottom: 6px; margin-bottom: ${compact ? '10px' : '14px'}; border-collapse: collapse;">
        <tr>
          <td style="width: 82px; vertical-align: middle; text-align: center; padding-right: 6px;">
            <img src="${esc(logoSrc)}" alt="Lambang Kabupaten Sumba Barat" crossorigin="anonymous" style="width: ${compact ? '68px' : '74px'}; height: auto; display: inline-block; object-fit: contain;" />
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
    const targetTingkat = person?.tingkat_biaya || it.tingkat_biaya || (it.jenis_sppd === 'LUAR_DAERAH' ? 'Tingkat B' : 'Tingkat C');
    const pptkNama = person?.pptk_nama || bid.nama || 'BERLIAN MAGU WERU,S.Sos';
    const pptkNip = person?.pptk_nip || bid.nip || '19690619 200503 1 001';
    const pptkJabatan = person?.pptk_jabatan || bid.jabatan || 'KEPALA BIDANG PPE';

    return {
      KopJenis: isSekda ? 'SEKDA' : 'BAPPERIDA',
      KopPemkab: kop.pemkab,
      KopInstansiHtml: isSekda ? 'SEKRETARIAT DAERAH' : 'BADAN PERENCANAAN PEMBANGUNAN, RISET DAN INOVASI<br/>DAERAH',
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
      const html = curMode === 'spt' ? bangunHtmlSPT(itCur, { paper: curPaper }) : bangunHtmlSPPD(itCur, { paper: curPaper, person });
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
