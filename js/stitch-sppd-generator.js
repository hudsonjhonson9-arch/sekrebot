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

  function bangunHtmlSPT(it = {}, opts = {}) {
    const kop = resolveKop(it);
    const dasarLines = String(it.dasar_surat || 'Dokumen Pelaksanaan Anggaran (DPA) BAPPERIDA Kabupaten Sumba Barat Tahun Anggaran ' + (it.tahun || new Date().getFullYear()))
      .split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const tglSpt = tanggalID(it.tanggal_spt || it.tanggal_berangkat || new Date().toISOString().slice(0, 10));
    const tglBerangkat = tanggalID(it.tanggal_berangkat);
    const tglKembali = tanggalID(it.tanggal_kembali);
    const lama = formatLamaHari(it.tanggal_berangkat, it.tanggal_kembali);
    const jabatanTtd = it.pejabat_perintah || kop.jabatanTtd;

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
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="width:110px;">Nama</td><td style="width:12px;">:</td><td style="font-weight:bold;">${esc(it.pelaksana_nama || '-')}</td></tr>
              <tr><td>NIP</td><td>:</td><td>${esc(it.pelaksana_nip || '-')}</td></tr>
              <tr><td>Pangkat / Gol.</td><td>:</td><td>${esc(it.pelaksana_pangkat || '-')}</td></tr>
              <tr><td>Jabatan</td><td>:</td><td>${esc(it.pelaksana_jabatan || 'Aparatur Sipil Negara BAPPERIDA')}</td></tr>
            </table>
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

      <div class="ttd-wrap">
        <div>Ditetapkan di : Waikabubak</div>
        <div>Pada tanggal : ${esc(tglSpt)}</div>
        <div style="margin-top:8px;font-weight:bold;text-transform:uppercase;">${esc(jabatanTtd)},</div>
        <div class="ttd-space"></div>
        <div style="font-weight:bold;text-decoration:underline;">${esc(it.penandatangan_nama || 'CHARLES HERMANA WERU, S.Sos')}</div>
        <div>NIP. ${esc(it.penandatangan_nip || '19721102 200112 1 001')}</div>
      </div>
    </body></html>`;
  }

  function bangunHtmlSPPD(it = {}, opts = {}) {
    const kop = resolveKop(it);
    const tglSpt = tanggalID(it.tanggal_spt || it.tanggal_berangkat || new Date().toISOString().slice(0, 10));
    const tglBerangkat = tanggalID(it.tanggal_berangkat);
    const tglKembali = tanggalID(it.tanggal_kembali);
    const lama = formatLamaHari(it.tanggal_berangkat, it.tanggal_kembali);
    const jabatanTtd = it.pejabat_perintah || kop.jabatanTtd;

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
        <tr><td style="text-align:center;">3.</td><td>a. Pangkat dan Golongan<br>b. Jabatan / Instansi<br>c. Tingkat Biaya Perjalanan Dinas</td><td>a. ${esc(it.pelaksana_pangkat || '-')}<br>b. ${esc(it.pelaksana_jabatan || 'ASN BAPPERIDA Kab. Sumba Barat')}<br>c. ${esc(it.jenis_sppd === 'LUAR_DAERAH' ? 'Luar Daerah' : 'Dalam Daerah')}</td></tr>
        <tr><td style="text-align:center;">4.</td><td>Maksud Perjalanan Dinas</td><td>${esc(it.maksud_perjalanan || '-')}</td></tr>
        <tr><td style="text-align:center;">5.</td><td>Alat Angkutan yang dipergunakan</td><td>${esc(it.alat_angkutan || 'Kendaraan Dinas Roda 4')}</td></tr>
        <tr><td style="text-align:center;">6.</td><td>a. Tempat Berangkat<br>b. Tempat Tujuan</td><td>a. ${esc(it.tempat_berangkat || 'Waikabubak')}<br>b. ${esc(it.tempat_tujuan || '-')}</td></tr>
        <tr><td style="text-align:center;">7.</td><td>a. Lamanya Perjalanan Dinas<br>b. Tanggal Berangkat<br>c. Tanggal harus kembali</td><td>a. ${esc(lama)}<br>b. ${esc(tglBerangkat)}<br>c. ${esc(tglKembali)}</td></tr>
        <tr><td style="text-align:center;">8.</td><td>Pengikut</td><td>-</td></tr>
        <tr><td style="text-align:center;">9.</td><td>Pembebanan Anggaran<br>a. Instansi<br>b. Akun / Tahun Anggaran</td><td><br>a. ${esc(kop.anggaranInstansi)}<br>b. DPA Tahun Anggaran ${esc(it.tahun || new Date().getFullYear())}</td></tr>
        <tr><td style="text-align:center;">10.</td><td>Keterangan Lain-lain</td><td>Nomor SPT: ${esc(it.nomor_spt || '-')}</td></tr>
      </table>

      <div class="ttd-wrap">
        <div>Dikeluarkan di : Waikabubak</div>
        <div>Pada tanggal : ${esc(tglSpt)}</div>
        <div style="margin-top:8px;font-weight:bold;text-transform:uppercase;">${esc(jabatanTtd)},</div>
        <div class="ttd-space"></div>
        <div style="font-weight:bold;text-decoration:underline;">${esc(it.penandatangan_nama || 'CHARLES HERMANA WERU, S.Sos')}</div>
        <div>NIP. ${esc(it.penandatangan_nip || '19721102 200112 1 001')}</div>
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
              <div style="margin-top:6px;font-weight:bold;">${esc(jabatanTtd)},</div>
              <div style="height:48px;"></div>
              <div style="font-weight:bold;text-decoration:underline;">${esc(it.penandatangan_nama || 'CHARLES HERMANA WERU, S.Sos')}</div>
              <div>NIP. ${esc(it.penandatangan_nip || '19721102 200112 1 001')}</div>
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
              <div style="font-weight:bold;text-decoration:underline;">${esc(it.penandatangan_nama || 'CHARLES HERMANA WERU, S.Sos')}</div>
              <div>NIP. ${esc(it.penandatangan_nip || '19721102 200112 1 001')}</div>
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

  w.SppdGenerator = {
    bangunHtmlSPT,
    bangunHtmlSPPD,
    cetakSPT(item, paper = 'F4') {
      openPrintWindow(bangunHtmlSPT(item, { paper }));
    },
    cetakSPPD(item, paper = 'F4') {
      openPrintWindow(bangunHtmlSPPD(item, { paper }));
    },
    unduhWordSPT(item) {
      return downloadDocxFromTemplate('spt', item, null);
    },
    unduhWordSPPD(item, person = null) {
      return downloadDocxFromTemplate('sppd', item, person);
    },
  };
})(window, document);
