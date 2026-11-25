/* Stitch Manajemen Aset — Berita Acara Serah Terima (BAST .docx) Otomatis & KIR Ruangan (A4 Landscape)
 * Ported & diselaraskan dari D:\Code\absensi\js\simapo-bast.js untuk portal Stitch. */
(function (w, d) {
  'use strict';

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

  const SATUAN = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan'];
  const BELAS = ['sepuluh', 'sebelas', 'dua belas', 'tiga belas', 'empat belas', 'lima belas', 'enam belas', 'tujuh belas', 'delapan belas', 'sembilan belas'];

  let _data = { pegawai: [], aset: [], ruangan: [], penandatangan: [] };
  let _history = [];
  let _sel = { pe: '', ttd: '', incl: {} };

  function rupiah(n) {
    return (Number(n) || 0).toLocaleString('id-ID');
  }

  function terbilang(n) {
    n = Math.floor(Number(n) || 0);
    if (n <= 0) return 'nol';
    if (n < 10) return SATUAN[n];
    if (n < 20) return BELAS[n - 10];
    if (n < 100) return SATUAN[Math.floor(n / 10)] + ' puluh' + (n % 10 ? ' ' + SATUAN[n % 10] : '');
    if (n < 1000) {
      const r = Math.floor(n / 100), rem = n % 100;
      return (r === 1 ? 'seratus' : SATUAN[r] + ' ratus') + (rem ? ' ' + terbilang(rem) : '');
    }
    if (n < 10000) {
      const r = Math.floor(n / 1000), rem = n % 1000;
      return (r === 1 ? 'seribu' : terbilang(r) + ' ribu') + (rem ? ' ' + terbilang(rem) : '');
    }
    const p = Math.floor(n / 1000);
    return terbilang(p) + ' ribu' + (n % 1000 ? ' ' + terbilang(n % 1000) : '');
  }

  function hariTanggal(iso) {
    const dt = iso ? new Date(iso + 'T00:00:00') : new Date();
    const h = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const b = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return `${h[dt.getDay()]} Tanggal ${terbilang(dt.getDate())} Bulan ${b[dt.getMonth()]} Tahun ${terbilang(dt.getFullYear())}`;
  }

  function jumlahUnit(n) {
    return `${n} (${n < 10 ? SATUAN[n] : terbilang(n)})`;
  }

  function rodaText(roda) {
    return Number(roda) > 2 ? '4 (empat)' : '2 (dua)';
  }

  function findPegawai(id) {
    return (_data.pegawai || []).find((p) => String(p.id) === String(id)) || null;
  }

  function findPenandatangan(id) {
    return (_data.penandatangan || []).find((p) => String(p.id) === String(id)) || findPegawai(id);
  }

  function refreshPickersIn(root) {
    if (!root || !w.StitchPicker) return;
    root.querySelectorAll('select').forEach((s) => {
      w.StitchPicker.enhanceSelect?.(s);
      w.StitchPicker.refresh?.(s);
    });
    root.querySelectorAll('input[type="date"]').forEach((i) => w.StitchPicker.enhanceDate?.(i));
  }

  function notify(icon, title, text) {
    if (w.Swal) {
      w.Swal.fire({ icon, title, text, timer: icon === 'success' ? 2000 : undefined, showConfirmButton: icon !== 'success' });
    }
  }

  function suggestNomorBast() {
    const year = new Date().getFullYear();
    let maxSeq = 0;
    (_history || []).forEach((h) => {
      const m = String(h.nomor || '').match(/^(\d+)/);
      if (m) maxSeq = Math.max(maxSeq, Number(m[1]) || 0);
    });
    const seq = String(maxSeq + 1).padStart(3, '0');
    const inp = d.getElementById('bastNomorInput');
    if (inp) inp.value = `${seq}/BAST-BMD/BAPPERIDA/${year}`;
  }

  function populateSelects() {
    const peSel = d.getElementById('bastPegawaiSelect');
    const ttdSel = d.getElementById('bastPenandatanganSelect');
    if (!peSel || !ttdSel) return;

    const curPe = _sel.pe || peSel.value || '';
    const countByPeg = {};
    (_data.aset || []).forEach((a) => {
      const k = String(a.pegawai_id || '');
      if (k) countByPeg[k] = (countByPeg[k] || 0) + 1;
    });

    peSel.innerHTML = '<option value="">— Pilih Pegawai (Pihak Kedua) —</option>'
      + (_data.pegawai || []).map((p) => {
        const cnt = countByPeg[String(p.id)] || 0;
        const suffix = cnt > 0 ? ` (${cnt} aset)` : '';
        return `<option value="${esc(p.id)}" ${String(p.id) === String(curPe) ? 'selected' : ''}>${esc(p.nama || '-')}${esc(suffix)}</option>`;
      }).join('');

    const ttdList = (_data.penandatangan && _data.penandatangan.length) ? _data.penandatangan : (_data.pegawai || []);
    const defaultTtd = _sel.ttd || ttdSel.value || (ttdList[0] ? String(ttdList[0].id) : '');
    _sel.ttd = defaultTtd;
    ttdSel.innerHTML = '<option value="">— Pilih Penandatangan (Pihak Pertama) —</option>'
      + ttdList.map((p) => `<option value="${esc(p.id)}" ${String(p.id) === String(defaultTtd) ? 'selected' : ''}>${esc(p.nama || '-')}${p.jabatan ? ' — ' + esc(p.jabatan) : ''}</option>`).join('');

    const tglInp = d.getElementById('bastTanggalInput');
    if (tglInp && !tglInp.value) tglInp.value = new Date().toISOString().slice(0, 10);
    const nomInp = d.getElementById('bastNomorInput');
    if (nomInp && !nomInp.value) suggestNomorBast();

    refreshPickersIn(d.getElementById('asetPanelBastKir'));
  }

  function onPegawaiChange() {
    const peSel = d.getElementById('bastPegawaiSelect');
    _sel.pe = peSel ? peSel.value : '';
    _sel.incl = {};
    if (_sel.pe) {
      (_data.aset || []).forEach((a) => {
        if (String(a.pegawai_id || '') === String(_sel.pe)) _sel.incl[String(a.id)] = true;
      });
    }
    renderBastAsetList();
  }

  function toggleAset(id, checked) {
    if (checked) _sel.incl[String(id)] = true;
    else delete _sel.incl[String(id)];
    updateBastSummary();
  }

  function updateBastSummary() {
    const el = d.getElementById('bastSelectedSummary');
    if (!el) return;
    const ids = Object.keys(_sel.incl);
    const items = (_data.aset || []).filter((a) => ids.includes(String(a.id)));
    const total = items.reduce((s, a) => s + (Number(a.nilaiperolehan) || 0), 0);
    el.textContent = `${items.length} unit dipilih • Total Rp ${rupiah(total)}`;
  }

  function renderBastAsetList() {
    const box = d.getElementById('bastAsetChecklist');
    if (!box) return;
    if (!_sel.pe) {
      box.innerHTML = '<div class="py-6 text-center text-xs text-slate-400">Pilih pegawai (Pihak Kedua) untuk menampilkan daftar aset yang dipegang.</div>';
      updateBastSummary();
      return;
    }
    const items = (_data.aset || []).filter((a) => String(a.pegawai_id || '') === String(_sel.pe));
    if (!items.length) {
      box.innerHTML = '<div class="py-6 text-center text-xs text-slate-400">Pegawai ini belum tercatat memegang unit aset BMD. Tetapkan pemegang di tab Inventaris terlebih dahulu.</div>';
      updateBastSummary();
      return;
    }
    box.innerHTML = items.map((a) => {
      const checked = !!_sel.incl[String(a.id)];
      const sub = [a.kodebarang, a.merk_type || a.model_jenis, a.no_polisi, a.tahun_pembuatan || a.tahunperolehan].filter(Boolean).join(' • ');
      return `
        <label class="flex items-start gap-3 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/70 bg-slate-50/60 dark:bg-slate-800/40 hover:border-[#2563eb] cursor-pointer transition-colors">
          <input type="checkbox" ${checked ? 'checked' : ''} onchange="window.AsetBastKir?.toggleAset('${esc(a.id)}', this.checked)" class="mt-0.5 rounded accent-[#2563eb]">
          <div class="min-w-0 flex-1">
            <div class="text-xs font-bold text-slate-900 dark:text-white truncate">${esc(a.nama_barang || a.model_jenis || '-')}</div>
            <div class="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">${esc(sub || '-')}</div>
          </div>
          <div class="text-right shrink-0 font-mono tabular-nums text-xs font-bold text-slate-700 dark:text-slate-200">Rp ${rupiah(a.nilaiperolehan)}</div>
        </label>
      `;
    }).join('');
    updateBastSummary();
  }

  function buildBastTags() {
    const peId = _sel.pe || d.getElementById('bastPegawaiSelect')?.value || '';
    const ttdId = d.getElementById('bastPenandatanganSelect')?.value || _sel.ttd || '';
    const pe = findPegawai(peId);
    const ttd = findPenandatangan(ttdId);
    if (!pe) { notify('warning', 'Perhatian', 'Pilih pegawai (Pihak Kedua) terlebih dahulu.'); return null; }
    if (!ttd) { notify('warning', 'Perhatian', 'Pilih penandatangan (Pihak Pertama) terlebih dahulu.'); return null; }

    const ids = Object.keys(_sel.incl);
    const items = (_data.aset || []).filter((a) => ids.includes(String(a.id)));
    if (!items.length) { notify('warning', 'Perhatian', 'Pilih minimal 1 unit aset untuk dimasukkan ke Berita Acara.'); return null; }

    const nomor = (d.getElementById('bastNomorInput')?.value || '').trim();
    if (!nomor) { notify('warning', 'Perhatian', 'Isi nomor Berita Acara terlebih dahulu.'); return null; }
    const tgl = d.getElementById('bastTanggalInput')?.value || new Date().toISOString().slice(0, 10);
    const tempat = (d.getElementById('bastTempatInput')?.value || 'Waikabubak').trim();
    const alamat = 'Waikabubak, Kabupaten Sumba Barat';

    const asets = items.map((a, i) => {
      const isKend = /kendaraan/i.test(a.kategori_nama || '') || !!a.no_polisi;
      return {
        No: i + 1,
        ModelJenis: a.model_jenis || a.nama_barang || '-',
        MerkType: a.merk_type || (isKend ? 'Kendaraan Roda ' + (a.roda || '4') : '-'),
        Warna: a.warna || '-',
        Tahun: a.tahun_pembuatan || a.tahunperolehan || '-',
        NoRangka: a.no_rangka || '-',
        NoMesin: a.no_mesin || '-',
        KodeBarang: a.kodebarang || '-',
        NoPolisi: a.no_polisi || '-',
        Roda: Number(a.roda) > 2 ? 4 : 2,
      };
    });
    const firstRoda = Number((items[0] && items[0].roda) || 4);

    return {
      pe, ttd, nomor, tgl, tempat,
      totalAset: asets.length,
      totalNilai: items.reduce((s, a) => s + (Number(a.nilaiperolehan) || 0), 0),
      tags: {
        Nomor: nomor,
        HariTanggal: hariTanggal(tgl),
        Tempat: tempat,
        P1Nama: ttd.nama || '', P1NIP: String(ttd.nip || ''), P1Jabatan: ttd.jabatan || '', P1Alamat: alamat,
        P2Nama: pe.nama || '', P2NIP: String(pe.nip || ''), P2Jabatan: pe.jabatan || '', P2Alamat: alamat,
        JumlahUnit: jumlahUnit(asets.length),
        RodaText: rodaText(firstRoda),
        asets,
      },
    };
  }

  async function renderAndDownloadDocx(tags, filename) {
    if (!w.PizZip || !w.docxtemplater) {
      notify('error', 'Library Belum Siap', 'PizZip / docxtemplater belum dimuat. Muat ulang halaman.');
      return false;
    }
    try {
      const tp = await fetch('/bast_template.docx');
      if (!tp.ok) throw new Error('Template BAST tidak ditemukan (HTTP ' + tp.status + ')');
      const buf = await tp.arrayBuffer();
      const zip = new w.PizZip(buf);
      const Docx = w.docxtemplater.default || w.docxtemplater;
      const doc = new Docx(zip, { delimiters: { start: '{', end: '}' }, paragraphLoop: true, linebreaks: true });
      doc.render(tags);
      const blob = doc.getZip().generate({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        compression: 'DEFLATE',
      });
      const url = URL.createObjectURL(blob);
      const a = d.createElement('a');
      a.href = url;
      a.download = filename || 'BAST.docx';
      d.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
      return true;
    } catch (e) {
      console.error('[AsetBastKir] render docx error:', e);
      notify('error', 'Gagal Membuat BAST', e?.message || 'Terjadi kesalahan saat merender template .docx.');
      return false;
    }
  }

  async function downloadBastDocx(saveArchive) {
    const built = buildBastTags();
    if (!built) return;
    if (saveArchive) {
      try {
        const inst = localStorage.getItem('MY_INSTANSI') || 'bapperida';
        const payload = {
          id: null,
          nomor: built.nomor,
          instansi_id: inst,
          pegawai_id: built.pe.id,
          pegawai_nama: built.pe.nama || '',
          pegawai_nip: built.pe.nip || '',
          pegawai_jabatan: built.pe.jabatan || '',
          pegawai_alamat: 'Waikabubak, Kabupaten Sumba Barat',
          penandatangan_id: built.ttd.id,
          penandatangan_nama: built.ttd.nama || '',
          penandatangan_nip: built.ttd.nip || '',
          penandatangan_jabatan: built.ttd.jabatan || '',
          penandatangan_alamat: 'Waikabubak, Kabupaten Sumba Barat',
          tanggal: new Date(built.tgl + 'T00:00:00Z').toISOString(),
          hari_tanggal: built.tags.HariTanggal,
          tempat: built.tempat,
          daftar_aset: built.tags.asets,
          total_aset: built.totalAset,
          total_nilai: built.totalNilai,
          createdby: localStorage.getItem('MY_NIP') || null,
        };
        const r = await fetch('/api/simapo/bast-save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.ok === false) throw new Error(j.message || `HTTP ${r.status}`);
        await loadHistory();
      } catch (e) {
        notify('error', 'Gagal Mengarsipkan BAST', e?.message || 'Koneksi terganggu.');
        return;
      }
    }
    const fname = 'BAST_' + built.nomor.replace(/[^A-Za-z0-9._-]/g, '_') + '.docx';
    const ok = await renderAndDownloadDocx(built.tags, fname);
    if (ok && saveArchive) notify('success', 'BAST Diarsipkan & Diunduh', `Nomor ${built.nomor} berhasil dibuat.`);
  }

  async function redownloadHistory(idx) {
    const h = _history[idx];
    if (!h) return;
    let daftar = [];
    try { daftar = Array.isArray(h.daftar_aset) ? h.daftar_aset : JSON.parse(h.daftar_aset || '[]'); } catch { daftar = []; }
    const firstRoda = Number((daftar[0] && daftar[0].Roda) || 4);
    const tglIso = String(h.tanggal || h.createdat || '').slice(0, 10);
    const alamat = 'Waikabubak, Kabupaten Sumba Barat';
    const tags = {
      Nomor: h.nomor || '-',
      HariTanggal: h.hari_tanggal || hariTanggal(tglIso),
      Tempat: h.tempat || 'Waikabubak',
      P1Nama: h.penandatangan_nama || '', P1NIP: String(h.penandatangan_nip || ''), P1Jabatan: h.penandatangan_jabatan || '', P1Alamat: h.penandatangan_alamat || alamat,
      P2Nama: h.pegawai_nama || '', P2NIP: String(h.pegawai_nip || ''), P2Jabatan: h.pegawai_jabatan || '', P2Alamat: h.pegawai_alamat || alamat,
      JumlahUnit: jumlahUnit(daftar.length || Number(h.total_aset) || 0),
      RodaText: rodaText(firstRoda),
      asets: daftar,
    };
    const fname = 'BAST_' + String(h.nomor || 'arsip').replace(/[^A-Za-z0-9._-]/g, '_') + '.docx';
    await renderAndDownloadDocx(tags, fname);
  }

  function renderHistoryTable() {
    const tbody = d.getElementById('bastKirHistoryBody');
    if (!tbody) return;
    if (!_history.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-xs text-slate-400">Belum ada arsip Berita Acara Serah Terima (BAST).</td></tr>';
      return;
    }
    tbody.innerHTML = _history.slice(0, 25).map((b, i) => `
      <tr class="border-b border-slate-100 dark:border-slate-800/80 hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
        <td class="px-4 py-2.5 font-mono tabular-nums text-xs font-bold text-[#2563eb] whitespace-nowrap">${esc(b.nomor || '-')}</td>
        <td class="px-4 py-2.5 text-xs font-semibold text-slate-900 dark:text-white">${esc(b.pegawai_nama || '-')}<div class="text-[10.5px] font-mono text-slate-400">${esc(b.pegawai_nip || '')}</div></td>
        <td class="px-4 py-2.5 font-mono tabular-nums text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">${esc(String(b.tanggal || b.createdat || '-').slice(0, 10))}</td>
        <td class="px-4 py-2.5 font-mono tabular-nums text-xs font-semibold text-slate-800 dark:text-slate-200 text-right whitespace-nowrap">${esc(b.total_aset || 0)} unit • Rp ${rupiah(b.total_nilai)}</td>
        <td class="px-4 py-2.5 text-right whitespace-nowrap">
          <button type="button" onclick="window.AsetBastKir?.redownloadHistory(${i})" class="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-[#2563eb] dark:text-blue-300 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer">
            <span class="material-symbols-outlined text-[14px]">download</span>
            <span>DOCX</span>
          </button>
        </td>
      </tr>
    `).join('');
  }

  /* ── KIR RUANGAN (KARTU INVENTARIS RUANGAN — CETAK A4 LANDSCAPE) ───────── */
  function renderKirRuanganGrid() {
    const grid = d.getElementById('kirRuanganGrid');
    if (!grid) return;
    const rooms = _data.ruangan || [];
    const asets = _data.aset || [];
    if (!rooms.length) {
      grid.innerHTML = '<div class="col-span-full py-8 text-center text-xs text-slate-400">Belum ada ruangan KIR terdaftar. Tambahkan ruangan di tab Pengaturan.</div>';
      return;
    }
    grid.innerHTML = rooms.map((r) => {
      const list = asets.filter((a) => String(a.ruangan_id || '') === String(r.id));
      let baik = 0, kb = 0, rb = 0, total = 0;
      list.forEach((a) => {
        if (/kurang baik/i.test(a.kondisi || '')) kb++;
        else if (/rusak/i.test(a.kondisi || '')) rb++;
        else baik++;
        total += Number(a.nilaiperolehan) || 0;
      });
      return `
        <div class="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/70 flex flex-col justify-between gap-3">
          <div>
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="text-sm font-bold text-slate-900 dark:text-white truncate">${esc(r.nama || '-')}</div>
                <div class="text-[11px] font-mono text-slate-500 dark:text-slate-400">${esc(r.kode || 'Tanpa kode')} • PJ: ${esc(r.penanggung_nama || 'Belum diatur')}</div>
              </div>
              <span class="px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-[#2563eb] dark:text-blue-300 font-mono tabular-nums text-[11px] font-bold shrink-0">${list.length} unit</span>
            </div>
            <div class="mt-2.5 flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
              <span>Baik ${baik} • KB ${kb} • RB ${rb}</span>
              <span class="font-bold text-slate-900 dark:text-white">Rp ${rupiah(total)}</span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" onclick="window.AsetBastKir?.cetakKirRuangan('${esc(r.id)}')" class="flex-1 h-9 px-3 rounded-xl bg-[#2563eb] hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-xs">
              <span class="material-symbols-outlined text-[16px]">print</span>
              <span>Cetak KIR Ruangan</span>
            </button>
            <button type="button" onclick="window.AsetBastKir?.aturPjRuangan('${esc(r.id)}')" class="h-9 px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer" title="Atur Penanggung Jawab Ruangan">
              <span class="material-symbols-outlined text-[15px]">person</span>
              <span>PJ</span>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  function cetakKirRuangan(rid) {
    if (!rid) return;
    const ruang = (_data.ruangan || []).find((x) => String(x.id) === String(rid));
    const asets = (_data.aset || []).filter((a) => String(a.ruangan_id || '') === String(rid));
    if (!asets.length) {
      notify('warning', 'Ruangan Kosong', 'Tidak ada aset BMD yang tercatat di ruangan ini.');
      return;
    }

    const KOP = {
      provinsi: 'Nusa Tenggara Timur',
      kabupaten: 'Sumba Barat',
      kota: 'Waikabubak',
      opd: 'Badan Perencanaan Pembangunan, Riset dan Inovasi Daerah (BAPPERIDA)',
    };
    const kepala = (_data.pegawai || []).find((p) => /^Kepala Badan|^Kepala Dinas|^Inspektur/i.test(String(p.jabatan || '').trim()))
      || (_data.penandatangan || [])[0] || null;
    const pj = (ruang && ruang.penanggung_nama)
      ? { nama: ruang.penanggung_nama, nip: ruang.penanggung_nip || '' }
      : { nama: '', nip: '' };
    const tgl = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

    let nBaik = 0, nKb = 0, nRb = 0, total = 0;
    const rows = asets.map((a, i) => {
      const kd = /kurang baik/i.test(a.kondisi || '') ? 'Kurang Baik'
        : /rusak/i.test(a.kondisi || '') ? 'Rusak Berat' : 'Baik';
      if (kd === 'Kurang Baik') nKb++; else if (kd === 'Rusak Berat') nRb++; else nBaik++;
      const nilai = Number(a.nilaiperolehan) || 0;
      total += nilai;
      return `<tr>
        <td style="text-align:center;">${i + 1}</td>
        <td>${esc(a.nama_barang || '-')}</td>
        <td>${esc(a.merk_type || a.model_jenis || '')}</td>
        <td>${esc(a.ukuran || a.no_polisi || '')}</td>
        <td>${esc(a.bahan || '')}</td>
        <td style="text-align:center;">${esc(a.tahunperolehan || a.tahun_pembuatan || '')}</td>
        <td style="text-align:center;">${esc(a.kodebarang || '')}</td>
        <td style="text-align:center;">${esc(a.no_register || '')}</td>
        <td style="text-align:center;">1</td>
        <td style="text-align:right;">${rupiah(nilai)}</td>
        <td style="text-align:center;">${kd === 'Baik' ? '1' : ''}</td>
        <td style="text-align:center;">${kd === 'Kurang Baik' ? '1' : ''}</td>
        <td style="text-align:center;">${kd === 'Rusak Berat' ? '1' : ''}</td>
        <td>${esc(a.keterangan || '')}</td>
      </tr>`;
    }).join('');

    const ttdKiri = `Mengetahui,<br>${esc(kepala ? (kepala.jabatan || 'Kepala Badan') : 'Kepala Badan')}<div style="height:48px"></div><b><u>${esc(kepala ? kepala.nama : '...............................')}</u></b>${kepala && kepala.nip ? '<br>NIP. ' + esc(kepala.nip) : ''}`;
    const ttdKanan = `${esc(KOP.kota)}, ${tgl}<br>Penanggung Jawab Ruangan<div style="height:48px"></div><b><u>${esc(pj.nama || '...............................')}</u></b>${pj.nip ? '<br>NIP. ' + esc(pj.nip) : ''}`;

    const html = `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><title>KIR - ${esc(ruang?.nama || '')}</title>
      <style>
        @page{size:A4 landscape;margin:10mm;}
        body{font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#000;margin:0;padding:10px;}
        .kop{text-align:center;margin-bottom:8px;}.kop div{font-size:11px;font-weight:bold;}
        .kop h1{font-size:13px;margin:2px 0 0;text-transform:uppercase;}
        .info{margin:0 0 6px;font-size:10px;}.info b{display:inline-block;min-width:120px;}
        table{width:100%;border-collapse:collapse;font-size:9px;}
        th,td{border:1px solid #000;padding:2px 4px;}
        th{background:#f0f0f0;font-size:8.5px;}
        .ttd{margin-top:36px;display:flex;justify-content:space-between;font-size:10px;}
        .ttd>div{width:46%;text-align:center;}
        .print-btn{position:fixed;top:10px;right:12px;padding:7px 14px;background:#2563eb;color:#fff;border:0;border-radius:8px;font-weight:700;cursor:pointer;font-size:11px;}
        @media print{.print-btn{display:none;}body{padding:0;}}
      </style></head><body>
      <button class="print-btn" onclick="window.print()">Cetak KIR (A4 Landscape)</button>
      <div class="kop">
        <div>PEMERINTAH KABUPATEN ${esc(KOP.kabupaten.toUpperCase())}</div>
        <div>${esc(KOP.opd.toUpperCase())}</div>
        <h1>KARTU INVENTARIS RUANGAN (KIR)</h1>
      </div>
      <div class="info">
        <div><b>Provinsi</b> : ${esc(KOP.provinsi)}</div>
        <div><b>Kabupaten / Kota</b> : ${esc(KOP.kabupaten)}</div>
        <div><b>OPD / Unit</b> : ${esc(KOP.opd)}</div>
        <div><b>Ruangan</b> : <b>${esc(ruang?.nama || '-')}</b>${ruang?.kode ? ' (kode ' + esc(ruang.kode) + ')' : ''}</div>
      </div>
      <table>
        <thead>
          <tr>
            <th rowspan="2">No</th><th rowspan="2">Nama Barang</th><th rowspan="2">Merk / Model</th>
            <th rowspan="2">No. Seri / Ukuran</th><th rowspan="2">Bahan</th><th rowspan="2">Tahun</th>
            <th rowspan="2">Kode Barang</th><th rowspan="2">No. Register</th><th rowspan="2">Jumlah</th>
            <th rowspan="2">Harga Perolehan (Rp)</th>
            <th colspan="3" style="text-align:center;">Keadaan Barang</th><th rowspan="2">Keterangan</th>
          </tr>
          <tr><th>Baik</th><th>Kurang Baik</th><th>Rusak Berat</th></tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <th colspan="8" style="text-align:right;">JUMLAH</th>
            <th style="text-align:center;">${asets.length}</th>
            <th style="text-align:right;">${rupiah(total)}</th>
            <th style="text-align:center;">${nBaik}</th>
            <th style="text-align:center;">${nKb}</th>
            <th style="text-align:center;">${nRb}</th>
            <th></th>
          </tr>
        </tfoot>
      </table>
      <div class="ttd"><div>${ttdKiri}</div><div>${ttdKanan}</div></div>
      </body></html>`;

    const win = w.open('', '_blank', 'width=1120,height=760');
    if (!win) { notify('warning', 'Pop-up Diblokir', 'Izinkan pop-up untuk mencetak KIR Ruangan.'); return; }
    win.document.write(html);
    win.document.close();
  }

  async function aturPjRuangan(rid) {
    const r = (_data.ruangan || []).find((x) => String(x.id) === String(rid));
    if (!r || !w.Swal) return;
    const opts = '<option value="">— Kosongkan PJ —</option>' + (_data.pegawai || []).map((p) =>
      `<option value="${esc(p.id)}" ${String(p.id) === String(r.penanggung_id || '') ? 'selected' : ''}>${esc(p.nama)} (${esc(p.nip || '-')})</option>`
    ).join('');
    const res = await w.Swal.fire({
      title: `Penanggung Jawab: ${r.nama}`,
      html: `<select id="swalKirPjSel" class="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs">${opts}</select>`,
      showCancelButton: true,
      confirmButtonText: 'Simpan PJ',
      cancelButtonText: 'Batal',
      preConfirm: () => d.getElementById('swalKirPjSel')?.value || '',
    });
    if (!res.isConfirmed) return;
    try {
      const resp = await fetch('/api/simapo/bast-ruangan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id, nama: r.nama, kode: r.kode || '', penanggung_id: res.value || null }),
      });
      const j = await resp.json().catch(() => ({}));
      if (!resp.ok || j.ok === false) throw new Error(j.message || `HTTP ${resp.status}`);
      await load(true);
      notify('success', 'Tersimpan', 'Penanggung jawab ruangan diperbarui.');
    } catch (e) {
      notify('error', 'Gagal', e?.message || 'Tidak dapat menyimpan PJ ruangan.');
    }
  }

  async function loadHistory() {
    try {
      const r = await fetch('/api/simapo/bast-history');
      const j = await r.json().catch(() => ({}));
      _history = Array.isArray(j.data) ? j.data : [];
    } catch (_) {
      _history = [];
    }
    renderHistoryTable();
  }

  async function load(force = false) {
    if (force || !_data.pegawai.length) {
      try {
        const r = await fetch('/api/simapo/bast-list');
        const j = await r.json().catch(() => ({}));
        if (j.ok && j.data) _data = j.data;
      } catch (_) {}
    }
    await loadHistory();
    populateSelects();
    renderBastAsetList();
    renderKirRuanganGrid();
  }

  w.AsetBastKir = {
    load,
    onPegawaiChange,
    toggleAset,
    suggestNomorBast,
    downloadBastDocx,
    redownloadHistory,
    cetakKirRuangan,
    aturPjRuangan,
  };
})(window, document);
