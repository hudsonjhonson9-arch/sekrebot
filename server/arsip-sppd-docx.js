import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '..', 'templates');

const BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const KOP_PRESETS = {
  BAPPERIDA: {
    key: 'BAPPERIDA',
    label: 'KOP BAPPERIDA',
    pemkab: 'PEMERINTAH KABUPATEN SUMBA BARAT',
    instansi1: 'BADAN PERENCANAAN PEMBANGUNAN, ',
    instansi2: 'RISET DAN INOVASI DAERAH',
    instansiHtml: 'BADAN PERENCANAAN PEMBANGUNAN, RISET DAN INOVASI DAERAH',
    alamat: 'Jl. Wee Karou Nomor. – Waikabubak Provinsi Nusa Tenggara Timur',
    kontak: 'Telp (0387) 22203 Fax (0387) 21093, Email : wesumba@yahoo.com',
    kota: 'W A I K A B U B A K',
    defaultJabatanTtd: 'KEPALA BAPPERIDA',
    defaultSekretarisJabatan: 'SEKRETARIS BAPPERIDA',
    defaultInstansiAnggaran: 'Bapperida Kabupaten Sumba Barat',
  },
  SEKDA: {
    key: 'SEKDA',
    label: 'KOP Sekretariat Daerah',
    pemkab: 'PEMERINTAH KABUPATEN SUMBA BARAT',
    instansi1: 'SEKRETARIAT DAERAH',
    instansi2: '',
    instansiHtml: 'SEKRETARIAT DAERAH',
    alamat: 'Jl. Wee Karou Nomor. – Waikabubak Provinsi Nusa Tenggara Timur',
    kontak: 'Telp (0387) 22203 Fax (0387) 21093, Email : wesumba@yahoo.com',
    kota: 'W A I K A B U B A K',
    defaultJabatanTtd: 'SEKRETARIS DAERAH',
    defaultSekretarisJabatan: 'SEKRETARIS DAERAH',
    defaultInstansiAnggaran: 'Sekretariat Daerah Kabupaten Sumba Barat',
  },
};

const TTD_DEFAULT = {
  status: 'Definitif',
  jabatan: 'KEPALA BAPPERIDA',
  nama: 'CHARLES HERMANA WERU,S.Sos',
  pangkat: 'Pembina Utama Muda – IV/c',
  nip: '19721102 200112 1 001',
};

const PARAF_DEFAULT = ['Sekretaris BAPPERIDA', 'Kepala Bidang Terkait', 'Kasubbag Umum & Kepegawaian'];

function parseJson(v, fb) {
  if (!v) return fb;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (_) { return fb; }
}

function toDate(v) {
  if (!v) return null;
  const s = String(v);
  const m = s.includes('T') ? null : s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const dt = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function tanggalID(v) {
  const dt = toDate(v);
  if (!dt) return v ? String(v) : '';
  return `${dt.getDate()} ${BULAN[dt.getMonth()]} ${dt.getFullYear()}`;
}

function terbilang(n) {
  const angka = Number(n);
  if (!Number.isFinite(angka) || angka < 0) return '';
  const satuan = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
  if (angka < 12) return satuan[angka];
  if (angka < 20) return `${terbilang(angka - 10)} Belas`;
  if (angka < 100) return `${terbilang(Math.floor(angka / 10))} Puluh${angka % 10 ? ' ' + terbilang(angka % 10) : ''}`;
  if (angka < 200) return `Seratus${angka % 100 ? ' ' + terbilang(angka % 100) : ''}`;
  return String(angka);
}

function formatLamaHari(start, end) {
  const d1 = toDate(start);
  const d2 = toDate(end);
  if (!d1 || !d2) return '1 (Satu) Hari';
  const n = Math.max(1, Math.round(Math.abs(d2.getTime() - d1.getTime()) / 86400000) + 1);
  return `${n} (${terbilang(n)}) Hari`;
}

function splitDasar(s) {
  return String(s || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
    .map((t, i) => ({ No: i + 1, Teks: t }));
}

function resolveKopConfig(it = {}) {
  const wewenang = parseJson(it.wewenang, {}) || {};
  const rawKey = String(it.kop_surat || wewenang.kop_surat || 'BAPPERIDA').toUpperCase();
  return (rawKey === 'SEKDA' || rawKey.includes('SEKRETARIAT')) ? KOP_PRESETS.SEKDA : KOP_PRESETS.BAPPERIDA;
}

function tagsTtdParaf(it) {
  const kop = resolveKopConfig(it);
  const rawTtd = parseJson(it.penandatangan, {}) || {};
  const t = { ...TTD_DEFAULT, ...rawTtd };
  const prefix = t.status && t.status !== 'Definitif' ? `${t.status} ` : '';
  const paraf = parseJson(it.paraf, []);
  let baseJabatan = rawTtd.jabatan || it.pejabat_perintah || kop.defaultJabatanTtd || TTD_DEFAULT.jabatan;
  if (kop.key === 'SEKDA' && (!rawTtd.jabatan || /kepala bapperida/i.test(rawTtd.jabatan)) && it.pejabat_perintah && /sekretaris daerah|sekda|bupati/i.test(it.pejabat_perintah)) {
    baseJabatan = it.pejabat_perintah;
  }
  const jabatanTtd = (prefix + baseJabatan).toUpperCase();
  return {
    KopJenis: kop.key,
    KopLabel: kop.label,
    KopPemkab: kop.pemkab,
    KopInstansi1: kop.instansi1,
    KopInstansi2: kop.instansi2,
    KopInstansiHtml: kop.instansiHtml,
    KopAlamat: kop.alamat,
    KopKontak: kop.kontak,
    KopKota: kop.kota,
    JabatanTtd: jabatanTtd,
    KepalaJabatan: jabatanTtd,
    KepalaNama: t.nama || TTD_DEFAULT.nama,
    KepalaPangkat: t.pangkat || TTD_DEFAULT.pangkat,
    KepalaNIP: t.nip || TTD_DEFAULT.nip,
    Paraf1: paraf[0] || PARAF_DEFAULT[0],
    Paraf2: paraf[1] || PARAF_DEFAULT[1],
    Paraf3: paraf[2] || PARAF_DEFAULT[2],
    parafRows: (paraf.length ? paraf : PARAF_DEFAULT).map((j, i) => ({ No: i + 1, Jabatan: j })),
  };
}

export function bangunTagsSPT(it = {}) {
  const tahun = it.tahun || new Date().getFullYear();
  const pengikutList = parseJson(it.pengikut, []);
  const pelaksana = [
    {
      No: 1,
      Nama: it.pelaksana_nama || '-',
      PangkatGol: it.pelaksana_pangkat || '-',
      NIP: it.pelaksana_nip ? `NIP. ${it.pelaksana_nip}` : '-',
      Jabatan: it.pelaksana_jabatan || '-',
    },
    ...(Array.isArray(pengikutList) ? pengikutList : []).map((p, idx) => ({
      No: idx + 2,
      Nama: p.nama || '-',
      PangkatGol: p.pangkat || '-',
      NIP: p.nip ? `NIP. ${p.nip}` : '-',
      Jabatan: p.jabatan || '-',
    })),
  ];

  let untuk = String(it.maksud_perjalanan || '').trim();
  if (it.tempat_tujuan && !untuk.toLowerCase().includes(String(it.tempat_tujuan).toLowerCase())) {
    untuk += ` di ${it.tempat_tujuan}`;
  }
  if (untuk && !/[.!]$/.test(untuk)) untuk += '.';

  pelaksana.forEach((p, i) => {
    p.KepadaLabel = i === 0 ? 'Kepada' : '';
    p.TitikLabel = i === 0 ? ':' : '';
    p.Kepada = p.KepadaLabel;
    p.Titik = p.TitikLabel;
    p.NoTxt = pelaksana.length > 1 ? `${p.No}.` : '';
  });

  const dasarStr = it.dasar_hukum || `DPA Bapperida Kabupaten Sumba Barat TA ${tahun}`;
  return {
    Nomor: it.nomor_spt || it.nomor_register || `001/SPT/${tahun}`,
    Dasar: dasarStr,
    dasarRows: splitDasar(dasarStr),
    pelaksana,
    Untuk: untuk,
    DitetapkanDi: it.ditetapkan_di || it.tempat_berangkat || 'Waikabubak',
    TanggalSurat: tanggalID(it.tanggal_spt || it.tanggal_berangkat || new Date()),
    ...tagsTtdParaf(it),
  };
}

export function bangunTagsSPPD(it = {}, person = null) {
  const tahun = it.tahun || new Date().getFullYear();
  const isMainPerson = !person || (person.nip && person.nip === it.pelaksana_nip && person.nama === it.pelaksana_nama);
  const nama = person?.nama || it.pelaksana_nama || '-';
  const nip = person?.nip || it.pelaksana_nip || '-';
  const pangkat = person?.pangkat || it.pelaksana_pangkat || '-';
  const jabatan = person?.jabatan || it.pelaksana_jabatan || '-';

  const tp = tagsTtdParaf(it);
  const kop = resolveKopConfig(it);
  const wewenang = parseJson(it.wewenang, {}) || {};
  const sekretaris = wewenang.sekretaris || {};
  const bidang = wewenang.bidang || {};
  const pelaksanaPptk = wewenang.pelaksana_pptk || {};
  const ktu = wewenang.ktu || {};

  const pptkNama = person?.pptk_nama || person?.bidang_nama || (isMainPerson ? (it.pelaksana_pptk_nama || pelaksanaPptk.nama) : '') || bidang.nama || 'BERLIAN MAGU WERU,S.Sos';
  const pptkNip = person?.pptk_nip || person?.bidang_nip || (isMainPerson ? (it.pelaksana_pptk_nip || pelaksanaPptk.nip) : '') || bidang.nip || '19690619 200903 1 001';
  const pptkJabatan = person?.pptk_jabatan || person?.bidang_jabatan || (isMainPerson ? (it.pelaksana_pptk_jabatan || pelaksanaPptk.jabatan) : '') || bidang.jabatan || 'Kepala Bidang PPE';

  const tempatBerangkat = it.tempat_berangkat || 'Waikabubak';
  const tempatTujuan = it.tempat_tujuan || '-';
  const tglBerangkat = tanggalID(it.tanggal_berangkat);

  return {
    NomorSPPD: person?.nomor_sppd || it.nomor_sppd || it.nomor_register || `001/SPPD/${tahun}`,
    KpaNama: tp.KepalaNama,
    Nama: nama,
    NIP: nip,
    PangkatGolongan: pangkat,
    JabatanInstansi: jabatan,
    TingkatBiaya: person?.tingkat_biaya || it.tingkat_biaya || (it.jenis_sppd === 'LUAR_DAERAH' ? 'Tingkat B' : 'Tingkat C'),
    Maksud: it.maksud_perjalanan || '-',
    AlatAngkut: person?.alat_angkutan || it.alat_angkutan || 'Kendaraan Dinas Roda 4',
    TempatBerangkat: tempatBerangkat,
    TempatTujuan: tempatTujuan,
    TempatBerangkatRomawiI: person?.tempat_berangkat || tempatBerangkat,
    TempatTujuanBerangkat: person?.tempat_tujuan || tempatTujuan,
    TanggalBerangkatRomawiI: person?.tanggal_berangkat ? tanggalID(person.tanggal_berangkat) : tglBerangkat,
    LamaHari: it.lama_hari ? `${it.lama_hari} (${terbilang(it.lama_hari)}) Hari` : formatLamaHari(it.tanggal_berangkat, it.tanggal_kembali),
    TanggalBerangkat: tglBerangkat,
    TanggalKembali: tanggalID(it.tanggal_kembali || it.tanggal_berangkat),
    Instansi: it.instansi || kop.defaultInstansiAnggaran,
    MataAnggaran: it.subkegiatan_nama ? `DPA Bapperida - ${it.subkegiatan_nama}` : `DPA Bapperida Kabupaten Sumba Barat TA ${tahun}`,
    DitetapkanDi: it.ditetapkan_di || tempatBerangkat,
    TanggalPenetapan: tanggalID(it.tanggal_spt || it.tanggal_berangkat || new Date()),
    SekretarisJabatan: (sekretaris.jabatan || kop.defaultSekretarisJabatan || 'SEKRETARIS BAPPERIDA').toUpperCase(),
    SekretarisNama: sekretaris.nama || 'IMANUEL MOSES KALEGOTAN, ST.,M.Si',
    SekretarisNIP: sekretaris.nip || '19800315 200501 1 011',
    BidangNama: pptkNama,
    BidangNIP: pptkNip,
    PPTKJabatan: pptkJabatan,
    KtuNama: ktu.nama || '',
    KtuNIP: ktu.nip || '',
    ...tp,
  };
}

export function renderSppdDocxBuffer(kind, item, person = null) {
  const isSpt = String(kind || '').toLowerCase() === 'spt';
  const tplFile = path.join(TEMPLATES_DIR, isSpt ? 'spt_template.docx' : 'sppd_template.docx');
  const content = fs.readFileSync(tplFile);
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, {
    delimiters: { start: '{', end: '}' },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
  });
  const tags = isSpt ? bangunTagsSPT(item) : bangunTagsSPPD(item, person);
  doc.render(tags);
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export function renderSppdBundleZipBuffer(item = {}) {
  const bundle = new PizZip();
  const safeNo = (v, fb) => String(v || fb).replace(/[/\\?%*:|"<>]/g, '_');
  const safeName = (v) => String(v || 'Pelaksana').replace(/[^a-zA-Z0-9_-]+/g, '_');

  // 1. Surat Tugas (SPT)
  const sptBuf = renderSppdDocxBuffer('spt', item, null);
  bundle.file(`01_Surat_Tugas_${safeNo(item.nomor_spt, 'SPT')}.docx`, sptBuf);

  // 2. SPPD Pelaksana Utama
  const mainPerson = {
    nama: item.pelaksana_nama || 'Pelaksana',
    nip: item.pelaksana_nip || '',
    pangkat: item.pelaksana_pangkat || '',
    jabatan: item.pelaksana_jabatan || '',
  };
  const mainBuf = renderSppdDocxBuffer('sppd', item, mainPerson);
  bundle.file(`02_SPPD_${safeNo(item.nomor_sppd, 'SPPD')}_${safeName(mainPerson.nama)}.docx`, mainBuf);

  // 3. SPPD Pengikut
  let pengikut = [];
  if (Array.isArray(item.pengikut)) {
    pengikut = item.pengikut;
  } else if (typeof item.pengikut === 'string' && item.pengikut.trim().startsWith('[')) {
    try { pengikut = JSON.parse(item.pengikut); } catch { pengikut = []; }
  }
  pengikut.forEach((p, idx) => {
    const nama = p?.nama || p?.name;
    if (!nama) return;
    const pBuf = renderSppdDocxBuffer('sppd', item, {
      nama,
      nip: p.nip || '',
      pangkat: p.pangkat || '',
      jabatan: p.jabatan || '',
      tingkat_biaya: p.tingkat_biaya || '',
      pptk_nama: p.pptk_nama || '',
      pptk_nip: p.pptk_nip || '',
      pptk_jabatan: p.pptk_jabatan || '',
    });
    const num = String(idx + 3).padStart(2, '0');
    bundle.file(`${num}_SPPD_${safeNo(p.nomor_sppd || item.nomor_sppd, 'SPPD')}_${safeName(nama)}.docx`, pBuf);
  });

  return bundle.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}
