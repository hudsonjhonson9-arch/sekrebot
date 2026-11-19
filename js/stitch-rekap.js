/* Stitch Rekap Bulanan, Riwayat Harian & Cetak PDF Resmi (F4 + Paraf/TTD) */
    /* ── REKAP BULANAN (menggantikan Riwayat) ─────────────────────────── */
    let rekapMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'

    function shiftRekapMonth(delta) {
      const [y, m] = rekapMonth.split('-').map(Number);
      const d = new Date(y, m - 1 + delta, 1);
      rekapMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      renderRiwayatCards(state.userLogs);
    }

    function logsOfRekapMonth(logs) {
      return (logs || []).filter(l => String(l.Tanggal || '').slice(0, 7) === rekapMonth);
    }

    function renderRekapSummary(monthLogs) {
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      const [y, m] = rekapMonth.split('-').map(Number);
      set('rekapMonthLabel', new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }));

      const days = new Map();
      monthLogs.forEach(l => {
        const t = String(l.Tanggal).slice(0, 10);
        const d = days.get(t) || { masuk: null, pulang: null, ket: false };
        const j = String(l['Jenis Absen'] || '').toUpperCase();
        const jam = l.Jam || '';
        if (j.includes('PULANG')) { if (!d.pulang || jam > d.pulang.Jam) d.pulang = l; }
        else if (j.includes('MASUK') || j === 'TERLAMBAT') { if (!d.masuk || jam < d.masuk.Jam) d.masuk = l; }
        else if (/IZIN|SAKIT|TUGAS|CUTI|DL|TUBEL/.test(j)) d.ket = true;
        days.set(t, d);
      });

      const shiftMasuk = (state.shift && state.shift.masuk) || '07:15';
      let tepat = 0, telat = 0, izin = 0, menit = 0;
      days.forEach(d => {
        if (d.ket) { izin++; return; }
        if (!d.masuk) return;
        const late = String(d.masuk['Jenis Absen']).toUpperCase() === 'TERLAMBAT' || /terlambat/i.test(d.masuk.Ket || '') || (d.masuk.Jam || '') > shiftMasuk;
        late ? telat++ : tepat++;
        if (d.pulang) {
          const [h1, m1] = d.masuk.Jam.split(':').map(Number), [h2, m2] = d.pulang.Jam.split(':').map(Number);
          if (h2 * 60 + m2 > h1 * 60 + m1) menit += (h2 * 60 + m2) - (h1 * 60 + m1);
        }
      });

      // Hari kerja (Sen–Jum) yang sudah lewat tanpa presensi/keterangan = tanpa keterangan (kecuali hari libur DB).
      const holidaySet = new Set((state.holidays || []).map(h => String(h.tanggal || '').slice(0, 10)));
      const todayStr = new Date().toISOString().slice(0, 10);
      let workdays = 0, alpa = 0;
      for (let d = 1, last = new Date(y, m, 0).getDate(); d <= last; d++) {
        const dt = new Date(y, m - 1, d), dow = dt.getDay();
        const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (dow === 0 || dow === 6 || holidaySet.has(iso) || iso > todayStr) continue;
        workdays++;
        const rec = days.get(iso);
        if (!rec || (!rec.masuk && !rec.ket)) { if (iso < todayStr) alpa++; else workdays--; }
      }

      const hadir = tepat + telat;
      const pct = workdays ? Math.min(100, Math.round((tepat / workdays) * 100)) : 0;
      set('riwayatTepatCount', tepat); set('riwayatTelatCount', telat); set('riwayatIzinCount', izin);
      set('rekapAlpa', alpa); set('rekapHadir', hadir);
      set('rekapJam', `${Math.floor(menit / 60)}j ${menit % 60}m`);
      set('rekapDisiplinPct', pct + '%');
      const bar = document.getElementById('rekapDisiplinBar'); if (bar) bar.style.width = pct + '%';
    }

    function renderRiwayatCards(logs) {
      logs = logsOfRekapMonth(logs);
      renderRekapSummary(logs);
      const container = document.getElementById('riwayatCardsContainer');

      if (!logs || !logs.length) {
        if (container) {
          container.innerHTML = `
            <div class="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">
              <span class="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-600 mb-2">history</span>
              <p class="text-xs font-bold text-slate-600 dark:text-slate-300">Belum Ada Presensi Bulan Ini</p>
              <p class="text-[11px] text-slate-400 mt-1">Tidak ada catatan di Log_Absen untuk bulan yang dipilih.</p>
            </div>
          `;
        }
        return;
      }

      // Group logs by Date (Hari yang sama digabung)
      const dateMap = new Map();
      logs.forEach(l => {
        const tgl = l.Tanggal || (l.created_at ? l.created_at.slice(0, 10) : 'Lainnya');
        if (!dateMap.has(tgl)) {
          dateMap.set(tgl, {
            tanggal: tgl,
            masuk: null,
            pulang: null,
            keterangan: null,
            allLogs: []
          });
        }
        const item = dateMap.get(tgl);
        item.allLogs.push(l);

        const jenis = String(l['Jenis Absen'] || '').toUpperCase();
        if (jenis.includes('MASUK') || jenis === 'TERLAMBAT') {
          if (!item.masuk || (l.Jam && (!item.masuk.Jam || l.Jam < item.masuk.Jam))) {
            item.masuk = l;
          }
        } else if (jenis.includes('PULANG')) {
          if (!item.pulang || (l.Jam && (!item.pulang.Jam || l.Jam > item.pulang.Jam))) {
            item.pulang = l;
          }
        } else if (jenis.includes('IZIN') || jenis.includes('SAKIT') || jenis.includes('TUGAS') || jenis.includes('CUTI')) {
          item.keterangan = l;
        }
      });

      // Sort dates descending (newest first)
      const sortedDays = Array.from(dateMap.values()).sort((a, b) => {
        return (b.tanggal || '').localeCompare(a.tanggal || '');
      });

      if (!container) return;
      container.innerHTML = sortedDays.map(day => {
        const dateStr = day.tanggal;
        const formattedDate = formatIndoDate(dateStr);
        
        // Determine status badge
        let badgeHtml = '';
        let durationHtml = '';
        let gpsStatus = 'Sesuai Radius';

        if (day.keterangan) {
          const kJenis = String(day.keterangan['Jenis Absen'] || 'IZIN').toUpperCase();
          badgeHtml = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60">${kJenis}</span>`;
          durationHtml = day.keterangan.Ket || 'Keterangan tercatat di sistem';
        } else if (day.masuk && day.pulang) {
          badgeHtml = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">Hadir Lengkap</span>`;
          durationHtml = calculateWorkDuration(day.masuk.Jam, day.pulang.Jam);
        } else if (day.masuk && !day.pulang) {
          badgeHtml = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60">Masuk Saja</span>`;
          durationHtml = 'Belum absen pulang';
        } else if (!day.masuk && day.pulang) {
          badgeHtml = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/60">Pulang Saja</span>`;
          durationHtml = 'Tidak ada jam masuk';
        }

        if ((day.masuk && day.masuk.koordinat) || (day.pulang && day.pulang.koordinat)) {
          gpsStatus = 'GPS Valid';
        }

        const masukJam = day.masuk ? day.masuk.Jam : '--:--';
        const masukLoc = day.masuk ? (day.masuk.Lokasi || 'Kantor BAPPERIDA') : 'Belum Absen';
        const isLate = day.masuk && (String(day.masuk['Jenis Absen']).includes('TERLAMBAT') || String(day.masuk.Ket || '').toLowerCase().includes('terlambat'));
        const masukBadge = day.masuk ? (isLate ? 'Terlambat' : 'Tepat Waktu') : '—';
        const masukBadgeClass = isLate ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-emerald-600 dark:text-emerald-400 font-bold';

        const pulangJam = day.pulang ? day.pulang.Jam : '--:--';
        const pulangLoc = day.pulang ? (day.pulang.Lokasi || 'Meja Absen') : (day.masuk ? 'Menunggu Pulang' : 'Belum Tercatat');
        const pulangBadge = day.pulang ? 'Tercatat' : '—';

        return `
          <div class="w-full rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col gap-3 transition-all hover:border-blue-200 dark:hover:border-blue-900">
            <!-- Header: Tanggal & Badge Status -->
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-xl bg-blue-50 dark:bg-slate-800 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <span class="material-symbols-outlined text-[18px]">calendar_today</span>
                </div>
                <div>
                  <h4 class="font-extrabold text-xs text-slate-900 dark:text-white">${formattedDate}</h4>
                  <span class="text-[10px] text-slate-400 font-mono">${dateStr}</span>
                </div>
              </div>
              <div class="flex items-center gap-2">
                ${badgeHtml}
                <button type="button" onclick="exportHarianPDF('${dateStr}')" aria-label="Unduh PDF ${dateStr}" class="w-7 h-7 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-slate-800 hover:bg-blue-100 cursor-pointer"><span class="material-symbols-outlined text-[16px]">picture_as_pdf</span></button>
              </div>
            </div>

            <!-- 2-Column Grid: Masuk vs Pulang -->
            <div class="grid grid-cols-2 gap-2">
              <!-- Box Masuk -->
              <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100/80 dark:border-slate-700/60 flex flex-col justify-between">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span class="w-2 h-2 rounded-full bg-emerald-500"></span> Masuk
                  </span>
                  <span class="text-[9px] ${masukBadgeClass}">
                    ${masukBadge}
                  </span>
                </div>
                <div class="text-sm font-extrabold font-mono text-slate-900 dark:text-white tabular-nums">
                  ${masukJam} <span class="text-[10px] font-normal text-slate-400 font-sans">WITA</span>
                </div>
                <span class="text-[10px] text-slate-400 truncate mt-1" title="${masukLoc}">
                  ${masukLoc}
                </span>
              </div>

              <!-- Box Pulang -->
              <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100/80 dark:border-slate-700/60 flex flex-col justify-between">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span class="w-2 h-2 rounded-full bg-blue-600"></span> Pulang
                  </span>
                  <span class="text-[9px] font-bold text-blue-600 dark:text-blue-400">
                    ${pulangBadge}
                  </span>
                </div>
                <div class="text-sm font-extrabold font-mono text-slate-900 dark:text-white tabular-nums">
                  ${pulangJam} <span class="text-[10px] font-normal text-slate-400 font-sans">WITA</span>
                </div>
                <span class="text-[10px] text-slate-400 truncate mt-1" title="${pulangLoc}">
                  ${pulangLoc}
                </span>
              </div>
            </div>

            <!-- Footer: Durasi Kerja & Koordinat GPS -->
            <div class="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
              <div class="flex items-center gap-1.5 font-medium">
                <span class="material-symbols-outlined text-[14px] text-blue-600 dark:text-blue-400">schedule</span>
                <span class="truncate max-w-[210px]">${durationHtml}</span>
              </div>
              <div class="flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400 font-mono text-[10px] shrink-0">
                <span class="material-symbols-outlined text-[13px]">verified</span>
                <span>${gpsStatus}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    function renderRiwayatFullTable(logs) {
      const tbody = document.getElementById('riwayatFullTableBody');
      if (!tbody) return;

      if (!logs.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-400">Tidak ada catatan log kehadiran di database untuk pegawai ini.</td></tr>`;
        return;
      }

      tbody.innerHTML = logs.map(l => {
        const badgeColor = l['Jenis Absen'] === 'MASUK' ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300' :
                          l['Jenis Absen'] === 'PULANG' ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300' :
                          'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300';
        return `
          <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <td class="p-3 font-mono font-bold">${l.Tanggal}</td>
            <td class="p-3 font-mono font-bold">${l.Jam} WITA</td>
            <td class="p-3"><span class="px-2 py-0.5 rounded-full font-bold text-[10px] ${badgeColor}">${l['Jenis Absen']}</span></td>
            <td class="p-3 text-slate-600 dark:text-slate-300">${l.Lokasi || '-'}</td>
            <td class="p-3 font-mono text-[11px] text-slate-400">${l.koordinat || '-'}</td>
            <td class="p-3 text-slate-500">${l.Ket || '-'}</td>
          </tr>
        `;
      }).join('');
    }
    function toggleRiwayatTableModal() {
      const modal = document.getElementById('riwayatTableModal');
      if (modal) modal.classList.toggle('hidden');
    }

    /* ── PDF HARIAN: Daftar Hadir Pegawai (format sama dengan D:\Code\absensi) ── */
    async function sigToDataUrl(sig) {
      if (!sig || sig.length < 10) return null;
      if (sig.startsWith('data:image')) return sig;
      try {
        const url = typeof window.resolveBioImageSrc === 'function' ? window.resolveBioImageSrc(sig) : sig;
        if (!url) return null;
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) return null;
        const blob = await res.blob();
        if (!blob || !String(blob.type || '').startsWith('image/')) return null;
        return await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.onerror = () => r(null); f.readAsDataURL(blob); });
      } catch (_) { return null; }
    }

    async function exportHarianPDF(tanggal) {
      if (!window.jspdf || !window.jspdf.jsPDF) {
        showDynamicIsland({ type: 'warning', title: 'Library PDF Sedang Dimuat', message: 'Silakan coba sesaat lagi.' });
        return;
      }
      try {
        const res = await fetch('/api/stitch/rekap-harian?tanggal=' + encodeURIComponent(tanggal));
        const json = await res.json();
        if (!json.ok) throw new Error(json.message || 'Gagal memuat data.');

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: [215, 330] }); // F4
        if (typeof doc.autoTable !== 'function') throw new Error('Plugin tabel PDF (autoTable) belum dimuat.');
        const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), margin = 10;
        const cx = W / 2 + 10;

        const logo = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = document.querySelector('img[src*="Lambang_Kabupaten_Sumba_Barat"]')?.src || 'Lambang_Kabupaten_Sumba_Barat.png'; });
        const sigs = new Map();
        await Promise.all(json.data.map(async r => { const s = await sigToDataUrl(r.signature); if (s) sigs.set(r.nip, s); }));
        const kepalaSig = json.kepala ? await sigToDataUrl(json.kepala.signature) : null;

        const label = new Date(tanggal + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const stats = { hadir: 0, sakit: 0, izin: 0, tugas: 0, tubel: 0, cuti: 0, tb: 0 };
        const body = json.data.map((p, i) => {
          const k = (p.ket || '').toUpperCase();
          if (k.startsWith('TUBEL')) stats.tubel++; else if (k.startsWith('CUTI')) stats.cuti++;
          else if (k.startsWith('SAKIT')) stats.sakit++; else if (k.startsWith('IZIN')) stats.izin++;
          else if (k.startsWith('TUGAS') || k.startsWith('DL')) stats.tugas++;
          else if (p.jamMasuk) stats.hadir++; else stats.tb++;
          return [i + 1, `${p.nama}\nNIP. ${p.nip || '—'}`, (p.jabatan || '—') + (p.pangkat ? `\n(${p.pangkat})` : ''),
                  p.jamMasuk || '—', '', p.jamPulang || '—', '', p.ket || '—'];
        });

        const dividerY = 37, titleY = dividerY + 9;
        doc.autoTable({
          startY: titleY + 11.5,
          margin: { top: 20, left: margin, right: margin, bottom: 20 },
          head: [['No', 'Nama / NIP', 'Jabatan / Pangkat', 'Jam\nMasuk', 'Paraf\nMasuk', 'Jam\nPulang', 'Paraf\nPulang', 'Ket']],
          body, theme: 'grid',
          headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center', lineWidth: 0.1 },
          styles: { font: 'times', fontSize: 7.5, cellPadding: 2, valign: 'middle', overflow: 'linebreak' },
          rowPageBreak: 'avoid',
          columnStyles: { 0: { halign: 'center', cellWidth: 7 }, 3: { halign: 'center', cellWidth: 16 }, 4: { cellWidth: 22, minCellHeight: 14 }, 5: { halign: 'center', cellWidth: 16 }, 6: { cellWidth: 22, minCellHeight: 14 } },
          didDrawCell: (d) => {
            if (d.cell.section !== 'body' || (d.column.index !== 4 && d.column.index !== 6)) return;
            const p = json.data[d.row.index], s = p && sigs.get(p.nip);
            const jam = d.column.index === 4 ? p?.jamMasuk : p?.jamPulang;
            if (s && jam) { try { doc.addImage(s, s.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG', d.cell.x + 2, d.cell.y + 2, 18, 10, undefined, 'FAST'); } catch (_) {} }
          },
          didDrawPage: (d) => {
            if (d.pageNumber !== 1) return;
            if (logo) { try { doc.addImage(logo, 'PNG', margin + 5, 10, 22, 25, undefined, 'FAST'); } catch (_) {} }
            doc.setFont('times', 'bold'); doc.setFontSize(11);
            doc.text('PEMERINTAH KABUPATEN SUMBA BARAT', cx, 15, { align: 'center' });
            doc.setFontSize(15);
            doc.text('BADAN PERENCANAAN PEMBANGUNAN RISET DAN INOVASI DAERAH', cx, 20, { align: 'center', maxWidth: W - 55 });
            doc.setFont('times', 'normal'); doc.setFontSize(7.5);
            doc.text('Jl. Weekarou, Waikabubak, Sumba Barat, Nusa Tenggara Timur', cx, 29, { align: 'center' });
            doc.text('WAIKABUBAK', cx, 32.5, { align: 'center' });
            doc.setLineWidth(0.7); doc.line(margin + 5, dividerY, W - margin - 5, dividerY);
            doc.setLineWidth(0.2); doc.line(margin + 5, dividerY + 0.8, W - margin - 5, dividerY + 0.8);
            doc.setFontSize(11); doc.setFont('times', 'bold');
            doc.text('DAFTAR HADIR PEGAWAI', W / 2, titleY, { align: 'center' });
            doc.setFont('times', 'normal');
            doc.text(`Periode: ${label}`, W / 2, titleY + 5.5, { align: 'center' });
          }
        });

        let y = doc.lastAutoTable.finalY + 10;
        if (y + 60 > H) { doc.addPage(); y = 20; }
        doc.setFont('times', 'bold'); doc.setFontSize(10); doc.text('Ringkasan Kehadiran:', margin, y);
        doc.setFont('times', 'normal'); doc.setFontSize(9);
        doc.text(`Hadir: ${stats.hadir} | Sakit: ${stats.sakit} | Izin: ${stats.izin} | Tugas/DL: ${stats.tugas} | Tubel: ${stats.tubel} | Cuti: ${stats.cuti} | TB: ${stats.tb}`, margin, y + 6);

        let fy = y + 20;
        if (fy + 45 > H) { doc.addPage(); fy = 25; }
        const sx = W - 60, kp = json.kepala;
        doc.setFontSize(10);
        doc.text(`Waikabubak, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, sx, fy, { align: 'center' });
        doc.text('Mengetahui,', sx, fy + 6, { align: 'center' });
        doc.text(kp?.jabatan || 'Kepala Badan', sx, fy + 11, { align: 'center' });
        if (kepalaSig) { try { doc.addImage(kepalaSig, kepalaSig.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG', sx - 15, fy + 14, 30, 15, undefined, 'FAST'); } catch (_) {} }
        doc.setFont('times', 'bold');
        doc.text(kp?.nama || '__________________________', sx, fy + 38, { align: 'center' });
        doc.setFont('times', 'normal');
        if (kp?.pangkat) {
          doc.text(kp.pangkat, sx, fy + 48, { align: 'center' });
          doc.text(`NIP. ${kp.nip || '..........................................'}`, sx, fy + 53, { align: 'center' });
        } else {
          doc.text(`NIP. ${kp?.nip || '..........................................'}`, sx, fy + 48, { align: 'center' });
        }

        doc.save(`Daftar_Hadir_${tanggal}.pdf`);
      } catch (e) {
        Swal.fire('Gagal membuat PDF', e.message, 'error');
      }
    }

    async function exportRiwayatPDF() {
      if (!window.jspdf || !window.jspdf.jsPDF) {
        showDynamicIsland({ type: 'warning', title: 'Library PDF Sedang Dimuat', message: 'Silakan coba sesaat lagi.' });
        return;
      }
      try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: [215, 330] }); // F4
        const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), margin = 10, cx = W / 2 + 10;
        const u = state.currentUser || { nama: '-', nip: '-', jabatan: '-', pangkat: '' };

        const [yNum, mNum] = rekapMonth.split('-').map(Number);
        const periodeStr = new Date(yNum, mNum - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
        const todayIso = new Date().toISOString().slice(0, 10);

        // Ambil data Kepala & tanda tangan dari server
        let kp = null, kepalaSig = null, userSig = await sigToDataUrl(u.signature || localStorage.getItem('sig_' + u.nip));
        try {
          const r = await fetch('/api/stitch/rekap-harian?tanggal=' + encodeURIComponent(todayIso));
          const j = await r.json();
          if (j && j.ok && j.kepala) {
            kp = j.kepala;
            kepalaSig = await sigToDataUrl(kp.signature);
          }
        } catch (_) {}

        const logo = await new Promise(res => {
          const i = new Image();
          i.onload = () => res(i);
          i.onerror = () => res(null);
          i.src = document.querySelector('img[src*="Lambang_Kabupaten_Sumba_Barat"]')?.src || 'Lambang_Kabupaten_Sumba_Barat.png';
        });

        // Kelompokkan log bulan rekapMonth per tanggal
        const monthLogs = logsOfRekapMonth(state.userLogs || []);
        const dayMap = new Map();
        monthLogs.forEach(l => {
          const t = String(l.Tanggal || '').slice(0, 10);
          const rec = dayMap.get(t) || { masuk: null, pulang: null, ket: null };
          const j = String(l['Jenis Absen'] || '').toUpperCase();
          if (j.includes('PULANG')) { if (!rec.pulang || (l.Jam || '') > (rec.pulang.Jam || '')) rec.pulang = l; }
          else if (j.includes('MASUK') || j === 'TERLAMBAT') { if (!rec.masuk || (l.Jam || '') < (rec.masuk.Jam || '')) rec.masuk = l; }
          else if (/IZIN|SAKIT|TUGAS|CUTI|DL|TUBEL/.test(j)) rec.ket = l;
          dayMap.set(t, rec);
        });

        const sortedDates = Array.from(dayMap.keys()).sort();
        const body = sortedDates.map((tgl, idx) => {
          const d = dayMap.get(tgl);
          const mJam = d.masuk ? d.masuk.Jam : '—';
          const pJam = d.pulang ? d.pulang.Jam : '—';
          const ketTxt = d.ket
            ? `${d.ket['Jenis Absen']}${d.ket.Ket ? ': ' + d.ket.Ket : ''}`
            : (d.masuk ? (d.masuk.Ket || 'Hadir') : '—');
          return [idx + 1, `${formatIndoDate(tgl)}\n(${tgl})`, mJam, '', pJam, '', ketTxt];
        });

        const tepat = document.getElementById('riwayatTepatCount')?.textContent || '0';
        const telat = document.getElementById('riwayatTelatCount')?.textContent || '0';
        const izin = document.getElementById('riwayatIzinCount')?.textContent || '0';
        const alpa = document.getElementById('rekapAlpa')?.textContent || '0';
        const disiplin = document.getElementById('rekapDisiplinPct')?.textContent || '0%';

        const dividerY = 37, titleY = dividerY + 9;
        doc.autoTable({
          startY: titleY + 26,
          margin: { top: 20, left: margin, right: margin, bottom: 20 },
          head: [['No', 'Hari / Tanggal', 'Jam\nMasuk', 'Paraf\nMasuk', 'Jam\nPulang', 'Paraf\nPulang', 'Keterangan']],
          body: body.length ? body : [['1', `Belum ada catatan di bulan ${periodeStr}`, '—', '', '—', '', '—']],
          theme: 'grid',
          headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center', lineWidth: 0.1 },
          styles: { font: 'times', fontSize: 8, cellPadding: 2, valign: 'middle', overflow: 'linebreak' },
          columnStyles: {
            0: { halign: 'center', cellWidth: 8 },
            2: { halign: 'center', cellWidth: 18 },
            3: { cellWidth: 22, minCellHeight: 13 },
            4: { halign: 'center', cellWidth: 18 },
            5: { cellWidth: 22, minCellHeight: 13 }
          },
          didDrawCell: (d) => {
            if (!userSig || d.cell.section !== 'body' || (d.column.index !== 3 && d.column.index !== 5)) return;
            const row = body[d.row.index];
            const jam = row && (d.column.index === 3 ? row[2] : row[4]);
            if (jam && jam !== '—') {
              try { doc.addImage(userSig, userSig.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG', d.cell.x + 2, d.cell.y + 1.5, 18, 9.5, undefined, 'FAST'); } catch (_) {}
            }
          },
          didDrawPage: (d) => {
            if (d.pageNumber !== 1) return;
            if (logo) { try { doc.addImage(logo, 'PNG', margin + 5, 10, 22, 25, undefined, 'FAST'); } catch (_) {} }
            doc.setFont('times', 'bold'); doc.setFontSize(11);
            doc.text('PEMERINTAH KABUPATEN SUMBA BARAT', cx, 15, { align: 'center' });
            doc.setFontSize(15);
            doc.text('BADAN PERENCANAAN PEMBANGUNAN RISET DAN INOVASI DAERAH', cx, 20, { align: 'center', maxWidth: W - 55 });
            doc.setFont('times', 'normal'); doc.setFontSize(7.5);
            doc.text('Jl. Weekarou, Waikabubak, Sumba Barat, Nusa Tenggara Timur', cx, 29, { align: 'center' });
            doc.text('WAIKABUBAK', cx, 32.5, { align: 'center' });
            doc.setLineWidth(0.7); doc.line(margin + 5, dividerY, W - margin - 5, dividerY);
            doc.setLineWidth(0.2); doc.line(margin + 5, dividerY + 0.8, W - margin - 5, dividerY + 0.8);

            doc.setFontSize(11); doc.setFont('times', 'bold');
            doc.text('REKAPITULASI KEHADIRAN BULANAN PEGAWAI', W / 2, titleY, { align: 'center' });
            doc.setFont('times', 'normal'); doc.setFontSize(9.5);
            doc.text(`Periode: ${periodeStr}`, W / 2, titleY + 5, { align: 'center' });

            doc.setFontSize(8.5);
            doc.setFont('times', 'bold'); doc.text('Nama / NIP', margin, titleY + 13);
            doc.setFont('times', 'normal'); doc.text(`: ${u.nama} / ${u.nip}`, margin + 26, titleY + 13);
            doc.setFont('times', 'bold'); doc.text('Jabatan', margin, titleY + 18);
            doc.setFont('times', 'normal'); doc.text(`: ${u.jabatan || '-'}`, margin + 26, titleY + 18);
            doc.setFont('times', 'bold'); doc.text('Ringkasan', W / 2 + 10, titleY + 13);
            doc.setFont('times', 'normal'); doc.text(`: Tepat ${tepat} | Telat ${telat} | Izin ${izin} | TK ${alpa}`, W / 2 + 30, titleY + 13);
            doc.setFont('times', 'bold'); doc.text('Disiplin', W / 2 + 10, titleY + 18);
            doc.setFont('times', 'normal'); doc.text(`: ${disiplin}`, W / 2 + 30, titleY + 18);
          }
        });

        let fy = doc.lastAutoTable.finalY + 14;
        if (fy + 45 > H) { doc.addPage(); fy = 25; }
        const sx = W - 60;
        doc.setFont('times', 'normal'); doc.setFontSize(10);
        doc.text(`Waikabubak, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, sx, fy, { align: 'center' });
        doc.text('Mengetahui,', sx, fy + 6, { align: 'center' });
        doc.text(kp?.jabatan || 'Kepala Badan', sx, fy + 11, { align: 'center' });
        if (kepalaSig) { try { doc.addImage(kepalaSig, kepalaSig.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG', sx - 15, fy + 14, 30, 15, undefined, 'FAST'); } catch (_) {} }
        doc.setFont('times', 'bold');
        doc.text(kp?.nama || '__________________________', sx, fy + 38, { align: 'center' });
        doc.setFont('times', 'normal');
        if (kp?.pangkat) {
          doc.text(kp.pangkat, sx, fy + 43, { align: 'center' });
          doc.text(`NIP. ${kp.nip || '..........................................'}`, sx, fy + 48, { align: 'center' });
        } else {
          doc.text(`NIP. ${kp?.nip || '..........................................'}`, sx, fy + 43, { align: 'center' });
        }

        doc.save(`Rekap_Bulanan_${(u.nama || 'ASN').replace(/\s+/g, '_')}_${rekapMonth}.pdf`);
        showDynamicIsland({ type: 'download', title: 'PDF Rekap Bulanan Tersimpan', message: `Periode ${periodeStr} lengkap dengan TTD.` });
      } catch (e) {
        Swal.fire('Gagal membuat PDF', e.message, 'error');
      }
    }

    /* ── REKAP RENTANG TANGGAL (port dari D:\Code\absensi\js\rekap-pdf.js) ── */
    function setRekapRangePreset(preset) {
      const now = new Date();
      const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      let dari = iso(now), sampai = iso(now);
      if (preset === 'minggu_ini') {
        const dow = (now.getDay() + 6) % 7; // Senin = 0
        const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
        dari = iso(mon);
      } else if (preset === 'bulan_ini') {
        const first = new Date(now.getFullYear(), now.getMonth(), 1);
        dari = iso(first);
      }
      const dEl = document.getElementById('rekapRangeDari');
      const sEl = document.getElementById('rekapRangeSampai');
      if (dEl) dEl.value = dari;
      if (sEl) sEl.value = sampai;
    }

    // Set default rentang ke awal bulan s.d. hari ini saat DOM siap
    document.addEventListener('DOMContentLoaded', () => {
      if (document.getElementById('rekapRangeDari')) setRekapRangePreset('bulan_ini');
    });

    async function exportRekapRangePDF() {
      const dari = (document.getElementById('rekapRangeDari')?.value || '').trim();
      const sampai = (document.getElementById('rekapRangeSampai')?.value || '').trim();
      if (!dari || !sampai) {
        Swal.fire('Rentang Belum Dipilih', 'Pilih tanggal Dari dan Sampai terlebih dahulu.', 'warning');
        return;
      }
      if (dari > sampai) {
        Swal.fire('Rentang Tidak Valid', 'Tanggal Dari tidak boleh lebih besar dari Sampai.', 'warning');
        return;
      }
      // Jika 1 hari yang sama, gunakan format Daftar Hadir Harian lengkap dengan kolom Paraf
      if (dari === sampai) {
        return exportHarianPDF(dari);
      }
      if (!window.jspdf || !window.jspdf.jsPDF) {
        showDynamicIsland({ type: 'warning', title: 'Library PDF Sedang Dimuat', message: 'Silakan coba sesaat lagi.' });
        return;
      }

      try {
        const res = await fetch(`/api/stitch/rekap-range?dari=${encodeURIComponent(dari)}&sampai=${encodeURIComponent(sampai)}`);
        const json = await res.json();
        if (!json.ok) throw new Error(json.message || 'Gagal memuat rekap rentang tanggal.');

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: [215, 330] }); // F4 Portrait
        const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), margin = 10, cx = W / 2 + 10;

        const logo = await new Promise(r => {
          const i = new Image();
          i.onload = () => r(i);
          i.onerror = () => r(null);
          i.src = document.querySelector('img[src*="Lambang_Kabupaten_Sumba_Barat"]')?.src || 'Lambang_Kabupaten_Sumba_Barat.png';
        });
        const kepalaSig = json.kepala ? await sigToDataUrl(json.kepala.signature) : null;

        const toHHMM = (mins) => {
          if (!mins || mins <= 0) return '00:00';
          const h = Math.floor(mins / 60), m = mins % 60;
          return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        };

        const stats = { hadir: 0, sakit: 0, izin: 0, tugas: 0, tubel: 0, cuti: 0, tb: 0 };
        const body = (json.data || []).map((p, i) => {
          stats.hadir += (p.hadir || 0);
          stats.sakit += (p.sakit || 0);
          stats.izin += (p.izin || 0);
          stats.tugas += (p.tugas || 0);
          stats.tubel += (p.tubel || 0);
          stats.cuti += (p.cuti || 0);
          stats.tb += (p.alpa || 0);

          const mLambat = p.menit_terlambat || 0;
          const mCepat = p.menit_lebih_awal || 0;
          const mAlpa = (p.alpa || 0) * 450;
          const totalM = mLambat + mCepat + mAlpa;
          const ist = (p.izin || 0) + (p.sakit || 0) + (p.tugas || 0) + (p.cuti || 0) + (p.tubel || 0);

          return [
            i + 1,
            `${p.nama}\nNIP. ${p.nip || '—'}`,
            (p.jabatan || '—') + (p.pangkat ? `\n(${p.pangkat})` : ''),
            p.hadir || 0,
            `${mLambat} m (${p.lambat_count || 0}x)`,
            `${mCepat} m`,
            ist,
            p.alpa || 0,
            toHHMM(totalM)
          ];
        });

        const dividerY = 37, titleY = dividerY + 9;
        doc.autoTable({
          startY: titleY + 11.5,
          margin: { top: 20, left: margin, right: margin, bottom: 20 },
          head: [['No', 'Nama / NIP', 'Jabatan', 'Hadir', 'Lambat\n(Menit)', 'Cepat\n(Menit)', 'I/S/T/C', 'Alpa', 'Akumulasi\n(JJ:MM)']],
          body,
          theme: 'grid',
          headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center', lineWidth: 0.1 },
          styles: { font: 'times', fontSize: 7.5, cellPadding: 2, valign: 'middle', overflow: 'linebreak' },
          rowPageBreak: 'avoid',
          columnStyles: {
            0: { halign: 'center', cellWidth: 7 },
            3: { halign: 'center', cellWidth: 13 },
            4: { halign: 'center', cellWidth: 20 },
            5: { halign: 'center', cellWidth: 16 },
            6: { halign: 'center', cellWidth: 14 },
            7: { halign: 'center', cellWidth: 12 },
            8: { halign: 'center', cellWidth: 18 }
          },
          didDrawPage: (d) => {
            if (d.pageNumber !== 1) return;
            if (logo) { try { doc.addImage(logo, 'PNG', margin + 5, 10, 22, 25, undefined, 'FAST'); } catch (_) {} }
            doc.setFont('times', 'bold'); doc.setFontSize(11);
            doc.text('PEMERINTAH KABUPATEN SUMBA BARAT', cx, 15, { align: 'center' });
            doc.setFontSize(15);
            doc.text('BADAN PERENCANAAN PEMBANGUNAN RISET DAN INOVASI DAERAH', cx, 20, { align: 'center', maxWidth: W - 55 });
            doc.setFont('times', 'normal'); doc.setFontSize(7.5);
            doc.text('Jl. Weekarou, Waikabubak, Sumba Barat, Nusa Tenggara Timur', cx, 29, { align: 'center' });
            doc.text('WAIKABUBAK', cx, 32.5, { align: 'center' });
            doc.setLineWidth(0.7); doc.line(margin + 5, dividerY, W - margin - 5, dividerY);
            doc.setLineWidth(0.2); doc.line(margin + 5, dividerY + 0.8, W - margin - 5, dividerY + 0.8);

            doc.setFontSize(11); doc.setFont('times', 'bold');
            doc.text('DAFTAR HADIR PEGAWAI', W / 2, titleY, { align: 'center' });
            doc.setFont('times', 'normal');
            doc.text(`Periode: ${dari} s.d. ${sampai} (${json.hariKerja || 0} Hari Kerja)`, W / 2, titleY + 5.5, { align: 'center' });
          }
        });

        let y = doc.lastAutoTable.finalY + 10;
        if (y + 60 > H) { doc.addPage(); y = 20; }
        doc.setFont('times', 'bold'); doc.setFontSize(10); doc.text('Ringkasan Kehadiran:', margin, y);
        doc.setFont('times', 'normal'); doc.setFontSize(9);
        doc.text(`Hadir: ${stats.hadir} | Sakit: ${stats.sakit} | Izin: ${stats.izin} | Tugas/DL: ${stats.tugas} | Tubel: ${stats.tubel} | Cuti: ${stats.cuti} | TB: ${stats.tb}`, margin, y + 6);

        let fy = y + 20;
        if (fy + 45 > H) { doc.addPage(); fy = 25; }
        const sx = W - 60, kp = json.kepala;
        doc.setFontSize(10);
        doc.text(`Waikabubak, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, sx, fy, { align: 'center' });
        doc.text('Mengetahui,', sx, fy + 6, { align: 'center' });
        doc.text(kp?.jabatan || 'Kepala Badan', sx, fy + 11, { align: 'center' });
        if (kepalaSig) { try { doc.addImage(kepalaSig, kepalaSig.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG', sx - 15, fy + 14, 30, 15, undefined, 'FAST'); } catch (_) {} }
        doc.setFont('times', 'bold');
        doc.text(kp?.nama || '__________________________', sx, fy + 38, { align: 'center' });
        doc.setFont('times', 'normal');
        if (kp?.pangkat) {
          doc.text(kp.pangkat, sx, fy + 48, { align: 'center' });
          doc.text(`NIP. ${kp.nip || '..........................................'}`, sx, fy + 53, { align: 'center' });
        } else {
          doc.text(`NIP. ${kp?.nip || '..........................................'}`, sx, fy + 48, { align: 'center' });
        }

        doc.save(`Rekap_HADIR_${dari}_${sampai}.pdf`);
        showDynamicIsland({ type: 'download', title: 'PDF Rekap Rentang Tersimpan', message: `Periode ${dari} s.d. ${sampai} berhasil diunduh.` });
      } catch (e) {
        Swal.fire('Gagal membuat PDF', e.message, 'error');
      }
    }
