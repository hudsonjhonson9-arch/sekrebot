/* ════ ARSIP NATIVE — Bank Data (Tahap 3) ════
   Kontrak: window.ArsipBD = { mount(el), unmount() }.
   Pohon: Bidang → OPD → (IKU → IKK) dan Sektoral → Indikator.
   Semua lewat proxy /api/arsip/p/*; peran tulis ditegakkan peta. */

(function () {
  'use strict';

  /* global escapeHtml, apiFetch, apiGet */

  const PROXY = '/api/arsip/p';
  let el = null;
  let tahun = null;
  let daftarTahun = [];   // [{id, tahun}]
  let pohon = [];         // hasil GET /api/bankdata, di-cache di memori
  let buka = new Set();   // kunci node yang dibuka, mis. "opd:12"
  let perluTahun = true;
  let perluPohon = true;
  let hasilHtml = '';

  // level yang menerima nilai/triwulan, dan kolomnya
  const LEVEL = {
    iku:      { nilai: true, valA: 'target',  valB: 'capaian', judulA: 'Target',  judulB: 'Capaian' },
    ikk:      { nilai: true, valA: 'target',  valB: 'capaian', judulA: 'Target',  judulB: 'Capaian' },
    indikator:{ nilai: true, valA: 'data',    valB: null,      judulA: 'Data',    judulB: null },
  };
  // endpoint struktural: POST/PUT/DELETE pada path yang sama
  const STRUKTUR = {
    opd:       { path: 'opd',        wajib: ['bidang_id', 'nama'],            induk: 'Bidang' },
    iku:       { path: 'iku',        wajib: ['opd_id', 'nama'],               induk: 'OPD' },
    ikk:       { path: 'ikk',        wajib: ['iku_id', 'nama'],               induk: 'IKU' },
    sektoral:  { path: 'sektoral',   wajib: ['opd_id', 'nama'],               induk: 'OPD' },
    indikator: { path: 'indikator/sektoral', wajib: ['sektoral_id', 'indikator'], induk: 'Sektoral' },
  };

  const $x = (s) => (el ? el.querySelector(s) : null);
  const isAdmin = () => !!(window.ARSIP && window.ARSIP.IS_ADMIN && window.ARSIP.IS_ADMIN());
  const jml = (a) => (Array.isArray(a) ? a.length : 0);
  const angka = (v) => (v === null || v === undefined || v === '' ? '' : String(v));
  const kunci = (t, id) => t + ':' + id;

  // jumlah OPD ditulis ke tile beranda supaya tidak sekadar "—"
  function setTile(n) {
    const t = document.querySelector('#arsipHome [data-tile="bd"] em');
    if (t) t.textContent = n ? n + ' OPD' : '—';
  }

  async function kirim(method, path, body) {
    try {
      const res = await apiFetch(PROXY + path, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      let data = null;
      try { data = await res.json(); } catch { /* kosong / non-JSON */ }
      return { ok: res.ok, status: res.status, data };
    } catch (e) {
      return { ok: false, status: 0, data: { message: e.message } };
    }
  }

  async function ambil(path) {
    const r = await apiGet(PROXY + path);
    if (!r || !r.ok) throw new Error('Gagal ' + (r ? r.status : ''));
    return r.data;
  }

  // ── Muat ────────────────────────────────────────────────────────────────
  async function muatTahun() {
    if (!perluTahun) return;
    try {
      const t = await ambil('/api/bankdata/tahun');
      daftarTahun = Array.isArray(t) ? t : [];
      if (!tahun && daftarTahun.length) {
        const kini = new Date().getFullYear();
        const cocok = daftarTahun.find((y) => Number(y.tahun) === kini);
        tahun = cocok ? cocok.tahun : daftarTahun[daftarTahun.length - 1].tahun;
      }
    } catch { /* daftar tahun gagal; pilihan manual tetap bisa diketik */ }
    perluTahun = false;
  }

  async function muatPohon() {
    const t = await ambil('/api/bankdata');
    pohon = Array.isArray(t) ? t : [];
    perluPohon = false;
  }

  async function muat() {
    if (!el) return;
    render({ sibuk: true });
    try {
      await Promise.all([muatTahun(), perluPohon ? muatPohon() : Promise.resolve()]);
      render();
    } catch (e) {
      render({ gagal: e.message });
    }
  }

  async function segarkan() {
    perluPohon = true;
    perluTahun = true;
    await muat();
  }

  // ── Santuman ────────────────────────────────────────────────────────────
  function pesanHasil(raw, ok, status) {
    const teks = ok
      ? 'Berhasil (HTTP ' + status + ')'
      : (status === 403 ? 'Tidak punya hak (ditolak server arsip)' : 'Gagal (HTTP ' + status + ')');
    const isi = raw == null ? '' : (typeof raw === 'string' ? raw : JSON.stringify(raw));
    return `<div class="kk-hasil ${ok ? 'ok' : 'no'}">
      <div><b>${escapeHtml(teks)}</b></div>
      ${isi ? `<pre class="kk-raw">${escapeHtml(isi)}</pre>` : ''}
    </div>`;
  }

  function tampilkanHasil(html) {
    hasilHtml = html;
    render();
    const box = $x('.kk-hasil-wrap');
    if (box) box.scrollIntoView({ block: 'nearest' });
  }

  async function aksi(method, path, body, judul) {
    const r = await kirim(method, path, body);
    tampilkanHasil(`<div class="kk-aksi-judul">${escapeHtml(judul)}</div>` + pesanHasil(r.data, r.ok, r.status));
    if (r.ok) await segarkan();
    return r;
  }

  // ── Render ──────────────────────────────────────────────────────────────
  function tulis(isi) {
    if (!el) return;
    el.innerHTML = isi + `<div class="kk-hasil-wrap">${hasilHtml}</div>`;
    pasangTahunDd();
  }

  // Select tahun diganti dropdown custom (makeSearchDd) — select asli tetap
  // jadi value source, pick dispatch 'change' ke onChange() lama.
  function pasangTahunDd() {
    if (el && el.querySelector('#bdTahunSel') && typeof makeSearchDd === 'function') {
      makeSearchDd('bdTahunSel', { ph: 'Tahun', h: 38, noIcon: true });
    }
  }

  function render(opt) {
    if (!el) return;
    const o = opt || {};
    const opsiTahun = daftarTahun.map((y) =>
      `<option value="${escapeHtml(y.tahun)}"${Number(y.tahun) === Number(tahun) ? ' selected' : ''}>${escapeHtml(y.tahun)}</option>`
    ).join('');

    let isi = `<div class="kk-head">
      <h3 class="kk-judul">Bank Data</h3>
      <select id="bdTahunSel" class="arsip-search kk-tahun" aria-label="Tahun">${opsiTahun || '<option value="">—</option>'}</select>
      ${isAdmin() ? '<button class="arsip-act" data-bd="tambah-tahun"><i class="fas fa-plus" aria-hidden="true"></i> Tahun</button>' : ''}
      <button class="arsip-act" data-bd="muat"><i class="fas fa-sync" aria-hidden="true"></i> Muat ulang</button>
    </div>`;

    if (o.gagal) {
      tulis(isi + `<div class="arsip-placeholder">Gagal memuat: ${escapeHtml(o.gagal)}</div>`);
      return;
    }
    if (o.sibuk && !pohon.length) {
      tulis(isi + `<div class="arsip-placeholder">Memuat bank data…</div>`);
      return;
    }

    isi += `<div class="kk-ringkas">` + hitung().map(([l, v]) =>
      `<div class="kk-stat"><b>${escapeHtml(v)}</b><span>${escapeHtml(l)}</span></div>`
    ).join('') + `</div>`;
    setTile(hitung()[1][1]);

    isi += `<div class="kk-block"><div class="kk-block-t">
      <i class="fas fa-chart-bar" aria-hidden="true"></i> Struktur bank data
    </div><div class="kk-list">` +
      (pohon.length ? pohon.map(renderBidang).join('') :
        '<div class="arsip-placeholder">Belum ada data.</div>') +
      `</div></div>`;

    tulis(isi);
  }

  function hitung() {
    let opd = 0, iku = 0, ikk = 0, sek = 0, ind = 0;
    pohon.forEach((b) => (b.opds || []).forEach((o) => {
      opd++;
      (o.ikus || []).forEach((k) => {
        iku++;
        ikk += jml(k.ikks);
      });
      (o.sektorals || []).forEach((s) => { sek++; ind += jml(s.indikator); });
    }));
    return [['Bidang', jml(pohon)], ['OPD', opd], ['IKU', iku], ['IKK', ikk], ['Sektoral', sek], ['Indikator', ind]];
  }

  function renderBidang(b) {
    const opds = b.opds || [];
    return `<div class="kk-grup">
      <div class="kk-grup-t">${escapeHtml(b.nama || '')}</div>` +
      (opds.length ? opds.map((o) => renderOpd(o)).join('') :
        '<div class="arsip-placeholder">Belum ada OPD.</div>') +
      `</div>`;
  }

  function renderOpd(o) {
    const k = kunci('opd', o.id);
    const on = buka.has(k);
    return `<div class="kk-row${on ? ' on' : ''}">
      <button class="kk-buka" data-bd="buka" data-k="${escapeHtml(k)}" aria-expanded="${on}">
        <i class="fas fa-chevron-down" aria-hidden="true"></i>
      </button>
      <div class="kk-info">
        <div class="kk-nama">${escapeHtml(o.nama || '')}</div>
        <div class="kk-meta">
          <span>${jml(o.ikus)} IKU</span><span>${jml(o.sektorals)} sektoral</span>
        </div>
      </div>
      ${tombolStruktur(o.id, 'opd')}
    </div>
    ${on ? `<div class="kk-periode">
      ${(o.ikus || []).map((i) => renderIku(i)).join('')}
      ${(o.sektorals || []).map((s) => renderSektoral(s)).join('')}
      ${(!jml(o.ikus) && !jml(o.sektorals)) ? '<div class="arsip-placeholder">Belum ada IKU maupun data sektoral.</div>' : ''}
    </div>` : ''}`;
  }

  function renderIku(i) {
    const k = kunci('iku', i.id);
    const on = buka.has(k);
    return `<div class="kk-out">
      <div class="kk-row${on ? ' on' : ''}" style="margin-bottom:0">
        <button class="kk-buka" data-bd="buka" data-k="${escapeHtml(k)}" aria-expanded="${on}">
          <i class="fas fa-chevron-down" aria-hidden="true"></i>
        </button>
        <div class="kk-info">
          <div class="kk-out-t">IKU — ${escapeHtml(i.nama || '')}</div>
          <div class="kk-meta">${metaSumber(i)}</div>
        </div>
        ${tombolStruktur(i.id, 'iku')}
      </div>
      ${on ? `<div class="kk-periode">
        ${tabelNilai(i, 'iku')}
        ${(i.ikks || []).map((x) => renderIkk(x)).join('')}
        ${!jml(i.ikks) ? '<div class="arsip-placeholder">Belum ada IKK.</div>' : ''}
      </div>` : ''}
    </div>`;
  }

  function renderIkk(x) {
    const k = kunci('ikk', x.id);
    const on = buka.has(k);
    return `<div class="kk-row${on ? ' on' : ''}">
      <button class="kk-buka" data-bd="buka" data-k="${escapeHtml(k)}" aria-expanded="${on}">
        <i class="fas fa-chevron-down" aria-hidden="true"></i>
      </button>
      <div class="kk-info">
        <div class="kk-nama">IKK — ${escapeHtml(x.nama || '')}</div>
        <div class="kk-meta">${metaSumber(x)}</div>
      </div>
      ${tombolStruktur(x.id, 'ikk')}
    </div>
    ${on ? `<div class="kk-periode">${tabelNilai(x, 'ikk')}</div>` : ''}`;
  }

  function renderSektoral(s) {
    const k = kunci('sektoral', s.id);
    const on = buka.has(k);
    return `<div class="kk-out">
      <div class="kk-row${on ? ' on' : ''}" style="margin-bottom:0">
        <button class="kk-buka" data-bd="buka" data-k="${escapeHtml(k)}" aria-expanded="${on}">
          <i class="fas fa-chevron-down" aria-hidden="true"></i>
        </button>
        <div class="kk-info">
          <div class="kk-out-t">Data Sektoral — ${escapeHtml(s.nama || '')}</div>
          <div class="kk-meta"><span>${jml(s.indikator)} indikator</span></div>
        </div>
        ${tombolStruktur(s.id, 'sektoral')}
      </div>
      ${on ? `<div class="kk-periode">
        ${(s.indikator || []).map((i) => renderIndikator(i)).join('')}
        ${!jml(s.indikator) ? '<div class="arsip-placeholder">Belum ada indikator.</div>' : ''}
      </div>` : ''}
    </div>`;
  }

  function renderIndikator(i) {
    const k = kunci('indikator', i.id);
    const on = buka.has(k);
    return `<div class="kk-row${on ? ' on' : ''}">
      <button class="kk-buka" data-bd="buka" data-k="${escapeHtml(k)}" aria-expanded="${on}">
        <i class="fas fa-chevron-down" aria-hidden="true"></i>
      </button>
      <div class="kk-info">
        <div class="kk-nama">${escapeHtml(i.indikator || i.nama || '(tanpa nama)')}</div>
        <div class="kk-meta">${metaSumber(i)}</div>
      </div>
      ${tombolStruktur(i.id, 'indikator')}
    </div>
    ${on ? `<div class="kk-periode">${tabelNilai(i, 'indikator')}</div>` : ''}`;
  }

  function metaSumber(n) {
    const a = [];
    if (n.sumber_data) a.push('<span><i class="fas fa-inbox" aria-hidden="true"></i> ' + escapeHtml(n.sumber_data) + '</span>');
    if (n.aspek) a.push('<span>' + escapeHtml(n.aspek) + '</span>');
    return a.join('') || '<span>—</span>';
  }

  // anak yang bisa ditambahkan di bawah tiap jenis node
  const ANAK = { opd: ['iku', 'sektoral'], iku: ['ikk'], sektoral: ['indikator'] };

  function tombolStruktur(id, jenis) {
    if (!isAdmin()) return '';
    const anak = ANAK[jenis] || [];
    return `<div class="kk-per-aksi">
      ${anak.map((a) => `<button class="arsip-act" data-bd="tambah" data-jenis="${escapeHtml(a)}"
          data-induk="${escapeHtml(id)}" title="Tambah ${escapeHtml(a)}">
        <i class="fas fa-plus" aria-hidden="true"></i></button>`).join('')}
      <button class="arsip-act" data-bd="ubah" data-jenis="${escapeHtml(jenis)}" data-id="${escapeHtml(id)}">
        <i class="fas fa-pen" aria-hidden="true"></i></button>
      <button class="arsip-act" data-bd="hapus" data-jenis="${escapeHtml(jenis)}" data-id="${escapeHtml(id)}">
        <i class="fas fa-trash" aria-hidden="true"></i></button>
    </div>`;
  }

  // ── Tabel nilai (hanya tahun terpilih) ──────────────────────────────────
  function tabelNilai(node, level) {
    const conf = LEVEL[level];
    if (!conf) return '';
    const baris = (node.nilai || []).find((n) => Number(n.tahun) === Number(tahun));
    const tw = (baris && baris.tw) || {};
    const kolomTw = [1, 2, 3, 4].map((i) => {
      const c = tw['tw' + i];
      if (!c) return '<td></td>';
      const isi = angka(c.a) + (conf.valB && c.b !== undefined && c.b !== null ? '<br>' + angka(c.b) : '');
      return `<td>${isi}</td>`;
    }).join('');

    const kepala = ['Tahun', conf.judulA, conf.judulB].filter(Boolean)
      .concat(['TW1', 'TW2', 'TW3', 'TW4']).map((h) => `<th>${escapeHtml(h)}</th>`).join('');

    const sel = (id) => `data-bd-form="${escapeHtml(level)}:${escapeHtml(id)}"`;
    const isiNilai = baris
      ? angka(baris[conf.valA])
      : '';
    const isiCapaian = conf.valB && baris ? angka(baris[conf.valB]) : '';

    return `<div class="kk-tabel-wrap"><table class="kk-tabel">
      <thead><tr>${kepala}</tr></thead>
      <tbody>
        <tr>
          <td><b>${escapeHtml(tahun)}</b></td>
          <td>${escapeHtml(isiNilai)}</td>
          ${conf.valB ? `<td>${escapeHtml(isiCapaian)}</td>` : ''}
          ${kolomTw}
        </tr>
      </tbody>
    </table></div>
    ${isAdmin() ? `<div class="kk-per-aksi kk-form-baris">
      <button class="arsip-act" data-bd="nilai" data-level="${escapeHtml(level)}" data-id="${escapeHtml(node.id)}">
        <i class="fas fa-pen" aria-hidden="true"></i> ${baris ? 'Ubah nilai' : 'Isi nilai'}</button>
      <button class="arsip-act" data-bd="triwulan" data-level="${escapeHtml(level)}" data-id="${escapeHtml(node.id)}">
        <i class="fas fa-calendar" aria-hidden="true"></i> Triwulan</button>
      <div ${sel(node.id)}></div>
    </div>` : ''}`;
  }

  // ── Form ────────────────────────────────────────────────────────────────
  function kotak(wadah, isi) {
    const box = $x(wadah);
    if (box) box.innerHTML = isi;
  }

  function formNilai(level, id, baris) {
    const conf = LEVEL[level];
    const t = (n) => (n !== undefined && n !== null ? n : '');
    return `<div class="kk-kandidat">
      <div class="kk-form-judul">Nilai ${escapeHtml(level)} · ${escapeHtml(tahun)}</div>
      <label class="kk-label">${escapeHtml(conf.judulA)}
        <input class="arsip-search" name="a" value="${escapeHtml(t(baris && baris[conf.valA]))}"></label>
      ${conf.valB ? `<label class="kk-label">${escapeHtml(conf.judulB)}
        <input class="arsip-search" name="b" value="${escapeHtml(t(baris && baris[conf.valB]))}"></label>` : ''}
      <div class="kk-form-aksi">
        <button class="arsip-act" data-bd-kirim="nilai">Simpan</button>
        <button class="arsip-act" data-bd-batal="1">Batal</button>
      </div>
    </div>`;
  }

  function formTriwulan(level, id, baris) {
    const conf = LEVEL[level];
    const tw = (baris && baris.tw) || {};
    let baris2 = '';
    for (let i = 1; i <= 4; i++) {
      const c = tw['tw' + i] || {};
      baris2 += `<div class="kk-tw">
        <span class="kk-tw-label">TW${i}</span>
        <input class="arsip-search" name="tw${i}a" value="${escapeHtml(angka(c.a))}" placeholder="${escapeHtml(conf.judulA)}">
        ${conf.valB ? `<input class="arsip-search" name="tw${i}b" value="${escapeHtml(angka(c.b))}" placeholder="${escapeHtml(conf.judulB)}">` : ''}
      </div>`;
    }
    return `<div class="kk-kandidat">
      <div class="kk-form-judul">Triwulan ${escapeHtml(level)} · ${escapeHtml(tahun)}</div>
      ${baris2}
      <div class="kk-form-aksi">
        <button class="arsip-act" data-bd-kirim="triwulan">Simpan</button>
        <button class="arsip-act" data-bd-batal="1">Batal</button>
      </div>
    </div>`;
  }

  function formStruktur(jenis, id, lama) {
    const conf = STRUKTUR[jenis];
    const nama = (lama && (lama.nama || lama.indikator)) || '';
    const sumber = (lama && lama.sumber_data) || '';
    const aspek = (lama && lama.aspek) || '';
    const isian = conf.wajib.filter((w) => w !== 'nama' && w !== 'indikator')
      .map((w) => `<input type="hidden" name="${escapeHtml(w)}" value="${escapeHtml(id)}">`).join('');
    const kunciNama = jenis === 'indikator' ? 'indikator' : 'nama';
    return `<div class="kk-kandidat">
      <div class="kk-form-judul">${lama ? 'Ubah' : 'Tambah'} ${escapeHtml(jenis)}${lama ? '' : ' di ' + escapeHtml(conf.induk)}</div>
      ${isian}
      <label class="kk-label">Nama
        <input class="arsip-search" name="${escapeHtml(kunciNama)}" value="${escapeHtml(nama)}"></label>
      ${jenis !== 'opd' && jenis !== 'sektoral' ? `
      <label class="kk-label">Sumber data
        <input class="arsip-search" name="sumber_data" value="${escapeHtml(sumber)}"></label>
      <label class="kk-label">Aspek
        <input class="arsip-search" name="aspek" value="${escapeHtml(aspek)}"></label>` : ''}
      <div class="kk-form-aksi">
        <button class="arsip-act" data-bd-kirim="struktur">Simpan</button>
        <button class="arsip-act" data-bd-batal="1">Batal</button>
      </div>
    </div>`;
  }

  // ── Aksi klik ───────────────────────────────────────────────────────────
  let mode = null;   // { jenis: 'nilai'|'triwulan'|'struktur', level?, id?, sub?, induk? }

  function cariNode(level, id) {
    if (level === 'iku' || level === 'ikk') {
      let hasil = null;
      pohon.forEach((b) => (b.opds || []).forEach((o) => (o.ikus || []).forEach((k) => {
        if (level === 'iku' && String(k.id) === String(id)) hasil = k;
        (k.ikks || []).forEach((x) => { if (level === 'ikk' && String(x.id) === String(id)) hasil = x; });
      })));
      return hasil;
    }
    let hasil = null;
    pohon.forEach((b) => (b.opds || []).forEach((o) => (o.sektorals || []).forEach((s) => (s.indikator || []).forEach((i) => {
      if (String(i.id) === String(id)) hasil = i;
    }))));
    return hasil;
  }

  async function onClick(ev) {
    const t = ev.target.closest('[data-bd], [data-bd-kirim], [data-bd-batal]');
    if (!t || !el || !el.contains(t)) return;

    if (t.hasAttribute('data-bd-batal')) {
      mode = null;
      el.querySelectorAll('.kk-kandidat').forEach((n) => { n.innerHTML = ''; });
      return;
    }

    if (t.hasAttribute('data-bd-kirim')) {
      await kirimMode(t.getAttribute('data-bd-kirim'));
      return;
    }

    const aksi2 = t.dataset.bd;
    if (aksi2 === 'muat') { await segarkan(); return; }

    if (aksi2 === 'buka') {
      const k = t.dataset.k;
      if (buka.has(k)) buka.delete(k); else buka.add(k);
      render();
      return;
    }

    if (!isAdmin()) return;

    if (aksi2 === 'tambah-tahun') {
      const y = window.prompt('Tahun yang mau ditambahkan:');
      if (!y) return;
      await aksi('POST', '/api/bankdata/tahun', { tahun: Number(y) }, 'Tambah tahun ' + y);
      return;
    }

    if (aksi2 === 'nilai' || aksi2 === 'triwulan') {
      const level = t.dataset.level;
      const id = t.dataset.id;
      const node = cariNode(level, id);
      const baris = node && (node.nilai || []).find((n) => Number(n.tahun) === Number(tahun));
      mode = { jenis: aksi2, level, id };
      kotak('[data-bd-form="' + level + ':' + id + '"]',
        aksi2 === 'nilai' ? formNilai(level, id, baris) : formTriwulan(level, id, baris));
      return;
    }

    if (aksi2 === 'tambah') {
      const jenis = t.dataset.jenis;
      const induk = t.dataset.induk;
      mode = { jenis: 'struktur', sub: jenis, induk };
      const wadah = t.closest('.kk-per-aksi');
      if (wadah) {
        let box = wadah.querySelector('.kk-kandidat');
        if (!box) {
          box = document.createElement('div');
          box.className = 'kk-kandidat';
          wadah.appendChild(box);
        }
        const isian = STRUKTUR[jenis].wajib.filter((w) => w !== 'nama' && w !== 'indikator')
          .map((w) => `<input type="hidden" name="${escapeHtml(w)}" value="${escapeHtml(induk)}">`).join('');
        const kunciNama = jenis === 'indikator' ? 'indikator' : 'nama';
        box.innerHTML = `<div class="kk-form-judul">Tambah ${escapeHtml(jenis)}</div>${isian}
          <label class="kk-label">Nama<input class="arsip-search" name="${escapeHtml(kunciNama)}"></label>
          <div class="kk-form-aksi">
            <button class="arsip-act" data-bd-kirim="struktur">Simpan</button>
            <button class="arsip-act" data-bd-batal="1">Batal</button>
          </div>`;
        box.querySelector('input:not([type=hidden])').focus();
      }
      return;
    }

    if (aksi2 === 'ubah') {
      const jenis = t.dataset.jenis;
      const id = t.dataset.id;
      const lama = jenis === 'iku' || jenis === 'ikk' ? cariNode(jenis, id) : cariNodeSektoral(jenis, id);
      mode = { jenis: 'struktur', sub: jenis, id };
      const wadah = t.closest('.kk-per-aksi');
      if (wadah) {
        let box = wadah.querySelector('.kk-kandidat');
        if (!box) {
          box = document.createElement('div');
          box.className = 'kk-kandidat';
          wadah.appendChild(box);
        }
        box.innerHTML = formStruktur(jenis, id, lama);
        box.querySelector('input:not([type=hidden])').focus();
      }
      return;
    }

    if (aksi2 === 'hapus') {
      const jenis = t.dataset.jenis;
      const id = t.dataset.id;
      if (!window.confirm('Hapus ' + jenis + ' ini?')) return;
      const path = jenis === 'indikator'
        ? '/api/bankdata/indikator/sektoral/' + encodeURIComponent(id)
        : '/api/bankdata/' + STRUKTUR[jenis].path + '/' + encodeURIComponent(id);
      await aksi('DELETE', path, undefined, 'Hapus ' + jenis);
    }
  }

  function cariNodeSektoral(jenis, id) {
    let hasil = null;
    pohon.forEach((b) => (b.opds || []).forEach((o) => {
      if (jenis === 'opd' && String(o.id) === String(id)) hasil = o;
      if (jenis === 'sektoral') (o.sektorals || []).forEach((s) => { if (String(s.id) === String(id)) hasil = s; });
      if (jenis === 'indikator') (o.sektorals || []).forEach((s) => (s.indikator || []).forEach((i) => { if (String(i.id) === String(id)) hasil = i; }));
    }));
    return hasil;
  }

  async function kirimMode(jenis) {
    const box = $x('.kk-kandidat');
    if (!box || !mode) return;
    const f = {};
    box.querySelectorAll('input').forEach((i) => { f[i.name] = i.value.trim(); });
    const lvl = mode.level;
    const id = mode.id;
    const sub = mode.sub;
    const induk = mode.induk;
    mode = null;

    if (jenis === 'nilai') {
      const conf = LEVEL[lvl];
      const body = { target_id: Number(id), tahun: Number(tahun), valA: f.a || null };
      if (conf.valB) body.valB = f.b || null;
      await aksi('POST', '/api/bankdata/nilai/' + lvl, body, 'Simpan nilai');
      return;
    }

    if (jenis === 'triwulan') {
      const conf = LEVEL[lvl];
      const tw = {};
      for (let i = 1; i <= 4; i++) {
        const c = {};
        const a = f['tw' + i + 'a'];
        const b = f['tw' + i + 'b'];
        if (a) c.a = a;
        if (conf.valB && b) c.b = b;
        if (Object.keys(c).length) tw['tw' + i] = c;
      }
      await aksi('POST', '/api/bankdata/triwulan/' + lvl,
        { target_id: Number(id), tahun: Number(tahun), tw }, 'Simpan triwulan');
      return;
    }

    if (jenis === 'struktur') {
      const path = sub === 'indikator' ? '/api/bankdata/indikator/sektoral' : '/api/bankdata/' + STRUKTUR[sub].path;
      const body = { ...f };
      if (!id) {
        // induk mengikuti jenis anaknya
        if (sub === 'opd') body.bidang_id = Number(induk);
        if (sub === 'iku') body.opd_id = Number(induk);
        if (sub === 'ikk') body.iku_id = Number(induk);
        if (sub === 'sektoral') body.opd_id = Number(induk);
        if (sub === 'indikator') body.sektoral_id = Number(induk);
        await aksi('POST', path, body, 'Tambah ' + sub);
      } else {
        await aksi('PUT', path + '/' + encodeURIComponent(id), body, 'Ubah ' + sub);
      }
    }
  }

  function onChange(ev) {
    const sel = ev.target.closest('.kk-tahun');
    if (!sel) return;
    tahun = sel.value ? Number(sel.value) : null;
    mode = null;
    render();
  }

  window.ArsipBD = {
    async mount(container) {
      el = container;
      if (!el) return;
      el.addEventListener('click', onClick);
      el.addEventListener('change', onChange);
      await muat();
    },
    unmount() {
      if (el) {
        el.removeEventListener('click', onClick);
        el.removeEventListener('change', onChange);
      }
      el = null;
      mode = null;
      hasilHtml = '';
      buka = new Set();
      pohon = [];
    },
  };
})();
