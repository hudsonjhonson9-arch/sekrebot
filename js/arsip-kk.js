/* ════ ARSIP NATIVE — Kertas Kerja (Tahap 2) ════
   Kontrak: window.ArsipKK = { mount(el), unmount(), setTahun(y) }.
   Semua data lewat proxy /api/arsip/p/*; peran tulis ditegakkan peta, di sini
   hanya meneruskan dan menampilkan hasil apa adanya (termasuk 403). */

(function () {
  'use strict';

  /* global escapeHtml, apiFetch, apiGet */

  const PROXY = '/api/arsip/p';
  let el = null;
  let tahun = null;
  let daftarTahun = [];
  let tree = [];
  let ringkas = null;
  let deadline = [];
  let buka = new Set();   // id sub kegiatan yang dibuka
  let hasilHtml = '';     // hasil aksi tulis terakhir (ikut render)
  let perluTahun = true;

  const $x = (sel) => (el ? el.querySelector(sel) : null);
  const isAdmin = () => !!(window.ARSIP && window.ARSIP.IS_ADMIN && window.ARSIP.IS_ADMIN());
  function jml(a) { return Array.isArray(a) ? a.length : 0; }

  // jumlah sub kegiatan ditulis ke tile beranda supaya tidak sekadar "—"
  function setTile(n) {
    const t = document.querySelector('#arsipHome [data-tile="kk"] em');
    if (t) t.textContent = n ? n + ' sub keg.' : '—';
  }

  async function kirim(method, path, body) {
    try {
      const res = await apiFetch(PROXY + path, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      let data = null;
      try { data = await res.json(); } catch { /* respons kosong/non-JSON */ }
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
  async function muat() {
    if (!tahun) return;
    render({ sibuk: true });
    try {
      const [t, rk, dl] = await Promise.all([
        ambil('/api/pks/tree?tahun=' + encodeURIComponent(tahun)),
        ambil('/api/pks/ringkasan/' + encodeURIComponent(tahun)),
        ambil('/api/pks/deadline-terdekat?tahun=' + encodeURIComponent(tahun) + '&hari=14'),
      ]);
      tree = (t && t.tree) || [];
      ringkas = rk || null;
      deadline = Array.isArray(dl) ? dl : (dl && dl.rows) || [];
      render();
      setTile(hitungSub());
    } catch (e) {
      render({ gagal: e.message });
      setTile(null);
    }
  }

  async function muatTahun() {
    if (!perluTahun) return;
    try {
      const t = await ambil('/api/pks/tahun');
      daftarTahun = Array.isArray(t) ? t : [];
      if (!tahun && daftarTahun.length) {
        const kini = new Date().getFullYear();
        tahun = daftarTahun.includes(kini) ? kini : daftarTahun[0];
      }
    } catch { /* daftar tahun gagal: pilihan manual tetap bisa diketik */ }
    perluTahun = false;
  }

  // ── Santuman kecil ──────────────────────────────────────────────────────
  function chip(teks, kelas) {
    return `<span class="arsip-badge ${kelas || ''}">${escapeHtml(teks)}</span>`;
  }

  function statusDoc(s) {
    if (!s) return chip('Belum ada', 'waiting');
    if (s === 'Diarsipkan') return chip('Diarsipkan', 'ok');
    if (s === 'Ditolak') return chip('Ditolak', 'no');
    return chip(s, 'waiting');
  }

  function tanggalPendek(s) {
    if (!s) return '—';
    const d = new Date(s);
    if (isNaN(d)) return String(s);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  }

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

  // ── Render ──────────────────────────────────────────────────────────────
  // hasilHtml ikut ditulis ulang supaya hasil aksi tulis tidak hilang saat
  // render() dipanggil lagi (mis. setelah muat() selesai).
  function tulis(isi) {
    if (!el) return;
    el.innerHTML = isi + `<div class="kk-hasil-wrap">${hasilHtml}</div>`;
  }

  function render(opt) {
    if (!el) return;
    const o = opt || {};
    const opsiTahun = daftarTahun.map((y) =>
      `<option value="${escapeHtml(y)}"${String(y) === String(tahun) ? ' selected' : ''}>${escapeHtml(y)}</option>`
    ).join('');

    let isi = `<div class="kk-head">
      <h3 class="kk-judul">Kertas Kerja</h3>
      <select class="arsip-search kk-tahun" aria-label="Tahun">${opsiTahun || '<option value="">—</option>'}</select>
      <button class="arsip-act" data-kk="muat"><i class="fas fa-sync" aria-hidden="true"></i> Muat ulang</button>
    </div>`;

    if (o.gagal) {
      isi += `<div class="arsip-placeholder">Gagal memuat: ${escapeHtml(o.gagal)}</div>`;
      tulis(isi);
      return;
    }
    if (o.sibuk && !tree.length) {
      isi += `<div class="arsip-placeholder">Memuat kertas kerja…</div>`;
      tulis(isi);
      return;
    }

    if (ringkas) {
      const stat = [
        ['Wajib', ringkas.wajib], ['Terisi', ringkas.terisi],
        ['Terlambat', ringkas.terlambat],         ['≤14 hari', ringkas.maudeadline],
        ['Output', ringkas.output], ['Sub kegiatan', ringkas.subkegiatan],
      ];
      isi += `<div class="kk-ringkas">` + stat.map(([l, v]) =>
        `<div class="kk-stat"><b>${escapeHtml(v == null || v === '' ? '—' : v)}</b><span>${escapeHtml(l)}</span></div>`
      ).join('') + `</div>`;
    }

    if (deadline.length) {
      isi += `<div class="kk-block"><div class="kk-block-t">
        <i class="fas fa-clock" aria-hidden="true"></i> Deadline terdekat (14 hari)
      </div><ul class="kk-dl">` + deadline.slice(0, 8).map((d) =>
        `<li class="${d.lewat ? 'lewat' : ''}">
          <span class="kk-dl-tgl">${escapeHtml(tanggalPendek(d.deadline))}</span>
          <span class="kk-dl-teks">${escapeHtml(d.periode_label || '')} — ${escapeHtml(d.output || '')}</span>
          ${d.lewat ? chip('Lewat', 'no') : ''}
        </li>`
      ).join('') + `</ul></div>`;
    }

    isi += `<div class="kk-block"><div class="kk-block-t">
      <i class="fas fa-list-ul" aria-hidden="true"></i> Sub kegiatan (${jml(tree) ? hitungSub() : 0})
    </div><div class="kk-list">` + (tree.length ? renderTree() :
      '<div class="arsip-placeholder">Belum ada data untuk tahun ini.</div>') + `</div></div>`;

    el.innerHTML = isi;
  }

  function hitungSub() {
    let n = 0;
    tree.forEach((b) => (b.kegiatan || []).forEach((k) => { n += jml(k.subkegiatan); }));
    return n;
  }

  function renderTree() {
    return tree.map((bidang) => {
      const sub = (bidang.kegiatan || []).reduce((a, k) => a.concat(k.subkegiatan || []), []);
      if (!sub.length) return '';
      return `<div class="kk-grup">
        <div class="kk-grup-t">${escapeHtml(bidang.nama || '')}</div>` +
        sub.map(renderSub).join('') + `</div>`;
    }).join('');
  }

  function renderSub(s) {
    const periode = s.outputs || [];
    const totalPeriode = periode.reduce((a, o) => a + jml(o.periods), 0);
    const sudah = periode.reduce((a, o) => a + jml((o.periods || []).filter((p) => p.doc_id)), 0);
    const terbuka = buka.has(s.id);
    const pic = periode.find((o) => o.pic_nama);
    let baris = `<div class="kk-row${terbuka ? ' on' : ''}" data-sub="${escapeHtml(s.id)}">
      <button class="kk-buka" data-kk="buka" data-id="${escapeHtml(s.id)}" aria-expanded="${terbuka}">
        <i class="fas fa-chevron-down" aria-hidden="true"></i>
      </button>
      <div class="kk-info">
        <div class="kk-nama">${escapeHtml(s.kode || '')} — ${escapeHtml(s.nama || '')}</div>
        <div class="kk-meta">
          ${pic ? `<span><i class="fas fa-user" aria-hidden="true"></i> ${escapeHtml(pic.pic_nama)}</span>` : ''}
          <span>${totalPeriode} periode</span>
          ${sudah ? chip(sudah + '/' + totalPeriode + ' terisi', 'ok') : chip('Belum ada dokumen', 'waiting')}
        </div>
      </div>
    </div>`;

    if (terbuka) {
      baris += `<div class="kk-periode">` + periode.map(renderOutput).join('') +
        (periode.length ? '' : '<div class="arsip-placeholder">Tidak ada output.</div>') + `</div>`;
    }
    return baris;
  }

  function renderOutput(o) {
    const ps = o.periods || [];
    return `<div class="kk-out">
      <div class="kk-out-t">${escapeHtml(o.nama || '')}</div>` + ps.map((p) => renderPeriode(p)).join('') + `</div>`;
  }

  function renderPeriode(p) {
    const ada = !!p.doc_id;
    let aksi = '';
    if (ada) {
      aksi = `<button class="arsip-act" data-kk="lihat" data-doc="${escapeHtml(p.doc_id)}">
        <i class="fas fa-eye" aria-hidden="true"></i> Lihat</button>`;
    } else if (isAdmin()) {
      aksi = `<button class="arsip-act" data-kk="tautan" data-periode="${escapeHtml(p.id)}">
        <i class="fas fa-link" aria-hidden="true"></i> Tautkan</button>`;
    }
    return `<div class="kk-per">
      <div class="kk-per-info">
        <span class="kk-per-label">${escapeHtml(p.periode_label || ('Periode ' + p.periode))}</span>
        <span class="kk-per-meta">
          <i class="fas fa-calendar" aria-hidden="true"></i> ${escapeHtml(tanggalPendek(p.deadline))}
          ${p.is_wajib ? chip('Wajib', 'waiting') : ''}
        </span>
        ${ada ? `<span class="kk-per-doc">
          <i class="fas fa-file-alt" aria-hidden="true"></i> ${escapeHtml(p.doc_judul || 'Dokumen')}
          ${statusDoc(p.doc_status)}
        </span>` : ''}
      </div>
      <div class="kk-per-aksi">
        ${aksi}
        <div class="kk-kandidat-wrap" data-periode="${escapeHtml(p.id)}"></div>
      </div>
    </div>`;
  }

  // ── Aksi tulis ──────────────────────────────────────────────────────────
  function tampilkanHasil(html) {
    hasilHtml = html;
    render();
    const box = $x('.kk-hasil-wrap');
    if (box) box.scrollIntoView({ block: 'nearest' });
  }

  async function aksiTulis(path, body, judul) {
    if (!isAdmin()) { tampilkanHasil(pesanHasil(null, false, 403)); return; }
    const r = await kirim('POST', path, body);
    tampilkanHasil(`<div class="kk-aksi-judul">${escapeHtml(judul)}</div>` + pesanHasil(r.data, r.ok, r.status));
    if (r.ok) await muat();
  }

  // ── Mount ───────────────────────────────────────────────────────────────
  function onClick(ev) {
    const t = ev.target.closest('[data-kk]');
    if (!t || !el || !el.contains(t)) return;
    const aksi = t.dataset.kk;

    if (aksi === 'muat') { muat(); return; }

    if (aksi === 'buka') {
      const id = Number(t.dataset.id);
      if (buka.has(id)) buka.delete(id); else buka.add(id);
      render();
      return;
    }

    if (aksi === 'lihat') {
      const id = t.dataset.doc;
      if (window.ARSIP && window.ARSIP.previewDocById) window.ARSIP.previewDocById(id);
      return;
    }

    if (aksi === 'tautan') {
      const id = t.dataset.periode;
      const wrap = $x('.kk-kandidat-wrap[data-periode="' + id + '"]');
      if (!wrap) return;
      if (wrap.innerHTML) { wrap.innerHTML = ''; return; }
      wrap.innerHTML = `<div class="kk-kandidat" data-periode="${escapeHtml(id)}">
        <input class="arsip-search" placeholder="Cari judul dokumen…" data-kk-cari="${escapeHtml(id)}">
        <div class="kk-kand-isi"><div class="arsip-placeholder">Mengetik untuk mencari…</div></div>
      </div>`;
      const inp = wrap.querySelector('[data-kk-cari]');
      let tTimer = null;
      inp.addEventListener('input', () => {
        clearTimeout(tTimer);
        tTimer = setTimeout(() => cariKandidat(id, inp.value), 350);
      });
      inp.focus();
      return;
    }

    if (aksi === 'pasang') {
      aksiTulis('/api/kertas-kerja/periode/' + encodeURIComponent(t.dataset.periode) + '/tautan',
        { doc_id: Number(t.dataset.doc) }, 'Tautkan dokumen');
      return;
    }
  }

  async function cariKandidat(periodeId, q) {
    const box = $x('.kk-kandidat[data-periode="' + periodeId + '"] .kk-kand-isi');
    if (!box) return;
    box.innerHTML = '<div class="arsip-placeholder">Mencari…</div>';
    const r = await kirim('GET', '/api/kertas-kerja/periode/' + encodeURIComponent(periodeId) + '/kandidat?q=' + encodeURIComponent(q || ''));
    const rows = (r.data && Array.isArray(r.data) ? r.data : (r.data && r.data.rows) || []);
    if (!r.ok) { box.innerHTML = `<div class="arsip-placeholder">Gagal (HTTP ${escapeHtml(r.status)}).</div>`; return; }
    if (!rows.length) { box.innerHTML = '<div class="arsip-placeholder">Tidak ada dokumen kandidat.</div>'; return; }
    box.innerHTML = rows.map((d) => `<div class="kk-kand">
      <span class="kk-kand-judul">${escapeHtml(d.judul || ('Dokumen ' + d.id))}</span>
      ${d.terpakai ? chip('Sudah dipakai', 'waiting') : ''}
      <button class="arsip-act" data-kk="pasang" data-periode="${escapeHtml(periodeId)}" data-doc="${escapeHtml(d.id)}"
        ${d.terpakai ? 'disabled' : ''}>Pakai</button>
    </div>`).join('');
  }

  function onChange(ev) {
    const sel = ev.target.closest('.kk-tahun');
    if (!sel) return;
    tahun = sel.value ? Number(sel.value) : null;
    buka.clear();
    muat();
  }

  window.ArsipKK = {
    async mount(container) {
      el = container;
      if (!el) return;
      el.addEventListener('click', onClick);
      el.addEventListener('change', onChange);
      await muatTahun();
      await muat();
    },
    unmount() {
      if (el) {
        el.removeEventListener('click', onClick);
        el.removeEventListener('change', onChange);
      }
      el = null;
      tree = [];
      ringkas = null;
      deadline = [];
      buka = new Set();
    },
    setTahun(y) {
      tahun = y;
      buka.clear();
      muat();
    },
  };
})();
