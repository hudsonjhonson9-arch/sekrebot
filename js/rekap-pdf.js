/* ════ PROFESSIONAL PDF REKAP ════ */
    /* ════ PROFESSIONAL PDF REKAP ════ */
    // Base64 image cache to speed up PDF re-rendering instantly
    window._pdfImageCache = window._pdfImageCache || {};
    window.preloadPdfImage = function(url) {
      if (!url || window._pdfImageCache[url]) return Promise.resolve(window._pdfImageCache[url]);
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = function() {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const dataURL = canvas.toDataURL('image/png');
            window._pdfImageCache[url] = dataURL;
            resolve(dataURL);
          } catch (e) {
            console.warn("Gagal convert image to base64:", e);
            resolve(url);
          }
        };
        img.onerror = function() {
          resolve(url);
        };
        img.src = url;
      });
    };

    async function generateRekapPDF(options = null) {
      // 1. Validasi Awal
      if (!lastRekapPegawai || lastRekapPegawai.length === 0) {
        showRekapToast('fail', '⚠️ Muat rekap terlebih dahulu');
        return;
      }

      // Show preview and settings modal on all devices before generating
      if (!options || !options.previewOnly) {
        window.pdfPreviewContext = 'rekap';
        openPdfPreviewModal();
        return;
      }

      const defaults = {
        orientation: 'p',
        size: 'f4', // F4 default
        margin: 10,
        fontSize: 7.5,
        padding: 2,
        rowPageBreak: 'avoid',
        previewOnly: false
      };
      const cfg = Object.assign({}, defaults, options);

      const btn = $('btnDownloadPDF');
      const originalHtml = btn ? btn.innerHTML : '';

      try {
        // UI: Loading State
        if (btn && !cfg.previewOnly) {
          btn.disabled = true;
          btn.innerHTML = '<span class="spin-sm"></span> Mengirim...';
        }

        const { jsPDF } = window.jspdf;
        if (!jsPDF) throw new Error('Library jsPDF tidak ditemukan');

        // Dynamic Orientation & Size
        const orientation = cfg.orientation;
        let format = [215, 330]; // F4 default
        if (cfg.size === 'a4') format = [210, 297];
        else if (cfg.size === 'letter') format = [216, 279];

        const doc = new jsPDF({
          orientation: orientation,
          unit: 'mm',
          format: format
        });

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = cfg.margin;
        const dari = $('rekapDari').value;
        const sampai = $('rekapSampai').value;
        const isHarian = dari === sampai;
        const tanggalLabel = isHarian
          ? new Date(dari + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
          : `${dari} s.d. ${sampai}`;

        const rawLogoUrl = "https://raw.githubusercontent.com/hudsonjhonson9-arch/sekrebot/main/Lambang_Kabupaten_Sumba_Barat.png";

        let sigMap = {};
        try {
          const { ok: sigListOk, data: sigRaw } = await apiGet(P.signatureList);
          const sigData = sigListOk ? (parseApiResponse(sigRaw) || []) : [];
          if (Array.isArray(sigData)) {
            sigData.forEach(s => {
              if (s.signature && s.signature.length > 100) {
                if (s.nip) sigMap[String(s.nip)] = s.signature;
                if (s.telegram_id) sigMap[String(s.telegram_id)] = s.signature;
              }
            });
          }
        } catch (e) {
          console.warn("Gagal load paraf, lanjut tanpa paraf.");
        }

        const filteredPegawai = lastRekapPegawai.filter(p => p.nama && p.nama.trim() !== "");

        // Statistik untuk ringkasan di bawah
        const stats = { hadir: 0, sakit: 0, izin: 0, tugas: 0, tubel: 0, cuti: 0, tanpaBerita: 0, terlambat: 0 };

        // Logika Magang vs Pegawai untuk label PDF
        const roleFilter = document.getElementById('rekapRoleFilter');
        const isMagang = roleFilter && roleFilter.value === 'magang';

        let tableBody = [];
        let pdfHead = [];
        let pdfColumnStyles = {};

        if (isHarian) {
          tableBody = filteredPegawai.map((p, i) => {
            const row = p.dataExcelRow || {};
            const jamM = row['Jam Masuk'] || p.jamMasuk || '—';
            const jamP = row['Jam Pulang'] || p.jamPulang || '—';

            let ketStatus = '';
            if (p.tubel > 0) { ketStatus = 'TUBEL'; stats.tubel++; }
            else if (p.cuti > 0) { ketStatus = 'CUTI'; stats.cuti++; }
            else if (p.sakit > 0) { ketStatus = 'SAKIT'; stats.sakit++; }
            else if (p.izin > 0) { ketStatus = 'IZIN'; stats.izin++; }
            else if (p.tugas > 0) { ketStatus = 'TUGAS/DL'; stats.tugas++; }
            else if (jamM !== '—' && jamM !== '-') { stats.hadir++; }
            else { ketStatus = 'TB'; stats.tanpaBerita++; }

            if (p.lambat > 0) stats.terlambat++;

            const logKet = p.logKet || '';
            const finalKet = [ketStatus, logKet].filter(Boolean).join(': ');

            return [
              i + 1,
              `${p.nama}\n${isMagang ? 'ID' : 'NIP'}. ${p.nip || '—'}`,
              (p.jabatan || '—') + (!isMagang && p.pangkat ? `\n(${p.pangkat})` : ''),
              jamM,
              '',
              jamP,
              '',
              finalKet || '—'
            ];
          });

          pdfHead = [['No', isMagang ? 'Nama / ID' : 'Nama / NIP', isMagang ? 'Jabatan / Institusi' : 'Jabatan / Pangkat', 'Jam\nMasuk', 'Paraf\nMasuk', 'Jam\nPulang', 'Paraf\nPulang', 'Ket']];
          pdfColumnStyles = {
            0: { halign: 'center', cellWidth: 7 },
            3: { halign: 'center', cellWidth: 16 },
            4: { cellWidth: 22, minCellHeight: 14 },
            5: { halign: 'center', cellWidth: 16 },
            6: { cellWidth: 22, minCellHeight: 14 }
          };
        } else {
          // Rekapan Rentang Waktu (Seperti Excel)
          tableBody = filteredPegawai.map((p, i) => {
            const hHadir = (p.masuk || 0);
            
            stats.hadir += hHadir;
            stats.sakit += (p.sakit || 0);
            stats.izin += (p.izin || 0);
            stats.tugas += (p.tugas || 0);
            stats.tubel += (p.tubel || 0);
            stats.cuti += (p.cuti || 0);
            stats.tanpaBerita += (p.alpa || 0);
            stats.terlambat += (p.lambat_count || 0);

            const mT_p = p.menit_terlambat_periode || 0;
            const mT_all = p.menit_terlambat || 0;
            const mC_p = p.menit_lebih_awal_periode || 0;
            const mC_all = p.menit_lebih_awal || 0;
            const mAlpa_p = (p.alpa || 0) * 450;
            const mAlpa_all = (p.all_alpa || 0) * 450;
            const totalM_p = mT_p + mC_p + mAlpa_p;
            const totalM_all = mT_all + mC_all + mAlpa_all;
            
            const toHHMMFormat = (mins) => {
              if (isNaN(mins) || mins <= 0) return '00:00';
              const h = Math.floor(mins / 60);
              const m = mins % 60;
              return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
            };
            
            const lbt_str = `${mT_p} | ${mT_all}`;
            const cpt_str = `${mC_p} | ${mC_all}`;
            const akum_str = `${toHHMMFormat(totalM_p)} | ${toHHMMFormat(totalM_all)}`;
            
            return [
              i + 1,
              `${p.nama}\n${isMagang ? 'ID' : 'NIP'}. ${p.nip || '—'}`,
              (p.jabatan || '—'),
              hHadir,
              lbt_str,
              cpt_str,
              (p.izin || 0) + (p.sakit || 0) + (p.tugas || 0),
              p.alpa || 0,
              akum_str
            ];
          });

          pdfHead = [['No', isMagang ? 'Nama / ID' : 'Nama / NIP', 'Jabatan', 'Hadir', 'Lambat(m)\nRntg|Total', 'Cepat(m)\nRntg|Total', 'I/S/T', 'Alpa', 'Akumulasi\nRntg|Total']];
          pdfColumnStyles = {
            0: { halign: 'center', cellWidth: 7 },
            3: { halign: 'center' },
            4: { halign: 'center' },
            5: { halign: 'center' },
            6: { halign: 'center' },
            7: { halign: 'center' },
            8: { halign: 'center' }
          };
        }

        // 4. Proses Tabel & Hitung Kop Dinamis
        const instId = (typeof getScopedInstansiId === 'function' ? getScopedInstansiId() : null) || (window.userProfile?.instansi_id) || 'bapperida';
        const instData = typeof getInstansiData === 'function' ? getInstansiData(instId) : null;

        // Prioritize dynamic letterhead overrides if present in options or DOM elements or LocalStorage
        const savedName = localStorage.getItem('absen_pdf_opt_header_name');
        const savedAlamat = localStorage.getItem('absen_pdf_opt_header_alamat');
        const savedKontak = localStorage.getItem('absen_pdf_opt_header_kontak');
        const savedLogo = localStorage.getItem('absen_pdf_opt_header_logo');
        const savedFont = localStorage.getItem('absen_pdf_opt_header_font');
        const savedFontSize = localStorage.getItem('absen_pdf_opt_header_font_size');

        const fullHeader = cfg.headerName !== undefined ? cfg.headerName : (($('pdfOptHeaderName')?.value || '').trim() || savedName || instData?.header || instData?.nama_instansi || 'BADAN PERENCANAAN PEMBANGUNAN RISET DAN INOVASI DAERAH');
        const instAlamat = cfg.headerAlamat !== undefined ? cfg.headerAlamat : (($('pdfOptHeaderAlamat')?.value || '').trim() || savedAlamat || instData?.alamat || 'Jl. Weekarou, Waikabubak, Sumba Barat, Nusa Tenggara Timur\nWAIKABUBAK');
        const instKontak = cfg.headerKontak !== undefined ? cfg.headerKontak : (($('pdfOptHeaderKontak')?.value || '').trim() || savedKontak || instData?.kontak || '');
        const logoUrl = cfg.headerLogo !== undefined ? cfg.headerLogo : (($('pdfOptHeaderLogo')?.value || '').trim() || savedLogo || instData?.logo_url || rawLogoUrl);

        const headerFont = cfg.headerFont !== undefined ? cfg.headerFont : ($('pdfOptHeaderFont')?.value || savedFont || instData?.header_font || 'times');
        const headerSize = parseFloat(cfg.headerFontSize !== undefined ? cfg.headerFontSize : ($('pdfOptHeaderFontSize')?.value || savedFontSize || instData?.header_size || '15'));

        const sizePemerintah = Math.max(9, headerSize * 0.72);
        const sizeAlamat = Math.max(7, headerSize * 0.55);
        const sizeKontak = Math.max(6, headerSize * 0.5);

        doc.setFont(headerFont, 'bold');
        doc.setFontSize(headerSize);
        const headerLines = doc.splitTextToSize(fullHeader.toUpperCase(), pageWidth - 55);
        
        let currentHeaderY = 20;
        headerLines.forEach(() => {
          currentHeaderY += (headerSize * 0.35);
        });

        doc.setFont(headerFont, 'normal');
        doc.setFontSize(sizeAlamat);
        const addressLines = doc.splitTextToSize(instAlamat, pageWidth - 55);
        let currentAddressY = currentHeaderY;
        addressLines.forEach(() => {
          currentAddressY += (sizeAlamat * 0.45);
        });

        // Account for contact lines in height calculation
        if (instKontak) {
          doc.setFont(headerFont, 'bold');
          doc.setFontSize(sizeKontak);
          const contactLines = doc.splitTextToSize(instKontak, pageWidth - 55);
          contactLines.forEach(() => {
            currentAddressY += (sizeKontak * 0.45);
          });
        }

        const finalDividerY = Math.max(currentAddressY + 1.5, 37);
        const docTitleY = finalDividerY + 9;
        const docPeriodeY = docTitleY + 5.5;
        const calculatedStartY = docPeriodeY + 6;

        doc.autoTable({
          startY: calculatedStartY,
          margin: { top: 20, left: margin, right: margin, bottom: 20 },
          head: pdfHead,
          body: tableBody,
          theme: 'grid',
          headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center', lineWidth: 0.1 },
          styles: { font: 'times', fontSize: cfg.fontSize, cellPadding: cfg.padding, valign: 'middle', overflow: 'linebreak' },
          rowPageBreak: cfg.rowPageBreak,
          columnStyles: pdfColumnStyles,
          didDrawCell: (data) => {
            if (!isHarian) return; // Tidak ada gambar paraf di rekap range waktu
            
            if (data.cell.section === 'body' && (data.column.index === 4 || data.column.index === 6)) {
              const rowIdx = data.row.index;
              const peg = filteredPegawai[rowIdx];
              if (!peg) return;

              const uid = String(peg.id || peg.ID || peg.telegram_id || '');
              const nip = String(peg.nip || peg.NIP || '');
              const sig = sigMap[nip] || sigMap[uid];

              if (sig) {
                const isParafMasuk = (data.column.index === 4);
                const jamVal = isParafMasuk ?
                  (peg.dataExcelRow?.['Jam Masuk'] || peg.jamMasuk) :
                  (peg.dataExcelRow?.['Jam Pulang'] || peg.jamPulang);

                if (jamVal && !['—', '-', 'Alpa', 'Alpha', 'Tanpa Berita', 'TB', 'Belum'].includes(jamVal.trim())) {
                  try {
                    doc.addImage(sig, 'PNG', data.cell.x + 2, data.cell.y + 2, 18, 10, undefined, 'FAST');
                  } catch (err) { }
                }
              }
            }
          },
          didDrawPage: (data) => {
            if (data.pageNumber === 1) {
              try {
                const drawLogo = window._pdfImageCache[logoUrl] || logoUrl;
                doc.addImage(drawLogo, 'PNG', margin + 5, 10, 22, 25, undefined, 'FAST');
              } catch (e) {
                try {
                  const drawDefault = window._pdfImageCache[rawLogoUrl] || rawLogoUrl;
                  doc.addImage(drawDefault, 'PNG', margin + 5, 10, 22, 25, undefined, 'FAST');
                } catch (err) { }
              }

              doc.setFont('times', 'bold');
              doc.setFontSize(sizePemerintah);
              doc.text('PEMERINTAH KABUPATEN SUMBA BARAT', pageWidth / 2 + 10, 15, { align: 'center' });
              
              // Draw Dynamic Kop Header lines
              doc.setFont(headerFont, 'bold');
              doc.setFontSize(headerSize);
              let drawHeaderY = 20;
              headerLines.forEach((line) => {
                doc.text(line, pageWidth / 2 + 10, drawHeaderY, { align: 'center' });
                drawHeaderY += (headerSize * 0.35);
              });

              // Draw Dynamic Address lines
              doc.setFont(headerFont, 'normal');
              doc.setFontSize(sizeAlamat);
              let drawAddressY = drawHeaderY;
              addressLines.forEach((line) => {
                doc.text(line, pageWidth / 2 + 10, drawAddressY, { align: 'center' });
                drawAddressY += (sizeAlamat * 0.45);
              });

              // Draw Dynamic Contact lines
              if (instKontak) {
                doc.setFont(headerFont, 'bold');
                doc.setFontSize(sizeKontak);
                const contactLines = doc.splitTextToSize(instKontak, pageWidth - 55);
                contactLines.forEach((line) => {
                  doc.text(line, pageWidth / 2 + 10, drawAddressY, { align: 'center' });
                  drawAddressY += (sizeKontak * 0.45);
                });
              }

              // Draw Divider lines
              doc.setLineWidth(0.7);
              doc.line(margin + 5, finalDividerY, pageWidth - (margin + 5), finalDividerY);
              doc.setLineWidth(0.2);
              doc.line(margin + 5, finalDividerY + 0.8, pageWidth - (margin + 5), finalDividerY + 0.8);

              // Draw Document Title and Periode
              doc.setFontSize(11);
              doc.setFont('times', 'bold');
              doc.text(isMagang ? 'DAFTAR HADIR MAGANG / LAINNYA' : 'DAFTAR HADIR PEGAWAI', pageWidth / 2, docTitleY, { align: 'center' });
              doc.setFont('times', 'normal');
              doc.text(`Periode: ${tanggalLabel}`, pageWidth / 2, docPeriodeY, { align: 'center' });
            }
          }
        });

        // 5. Statistik Kehadiran & Footer
        let currentY = doc.lastAutoTable.finalY + 10;
        if (currentY + 60 > pageHeight) {
          doc.addPage();
          currentY = 20;
        }

        // Box Statistik
        doc.setFont('times', 'bold');
        doc.setFontSize(10);
        doc.text('Ringkasan Kehadiran:', margin, currentY);
        doc.setFont('times', 'normal');
        doc.setFontSize(9);
        const statText = `Hadir: ${stats.hadir} | Sakit: ${stats.sakit} | Izin: ${stats.izin} | Tugas/DL: ${stats.tugas} | Tubel: ${stats.tubel} | Cuti: ${stats.cuti} | TB: ${stats.tanpaBerita}`;
        doc.text(statText, margin, currentY + 6);

        let footerY = currentY + 20;
        if (footerY + 45 > pageHeight) {
          doc.addPage();
          footerY = 25;
        }

        doc.setFontSize(10);
        const signatureX = pageWidth - 60; // Posisi di sisi kanan
        doc.text(`Waikabubak, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, signatureX, footerY, { align: 'center' });
        doc.text('Mengetahui,', signatureX, footerY + 6, { align: 'center' });

        // Find true Kepala dynamically (excluding sub-heads like Kepala Bidang)
        const getKepalaSignatureData = (employees) => {
          if (!Array.isArray(employees)) return null;
          // 1. Strict top-level Kepala check
          let found = employees.find(u => {
            const j = (u.jabatan || u.Jabatan || '').toUpperCase();
            if (j.includes('BIDANG') || j.includes('SEKSI') || j.includes('SUB') || j.includes('BAGIAN') || j.includes('UPTD') || j.includes('PELAKSANA') || j.includes('FUNGSIONAL')) {
              return false;
            }
            return j.includes('KEPALA BADAN') || j.includes('KEPALA DINAS') || j.includes('INSPEKTUR') || j.includes('SEKRETARIS DAERAH') || j.includes('CAMAT') || j === 'KEPALA';
          });

          // 2. Broad Kepala check
          if (!found) {
            found = employees.find(u => {
              const j = (u.jabatan || u.Jabatan || '').toUpperCase();
              if (j.includes('BIDANG') || j.includes('SEKSI') || j.includes('SUB') || j.includes('BAGIAN') || j.includes('UPTD') || j.includes('PELAKSANA') || j.includes('FUNGSIONAL')) {
                return false;
              }
              return j.includes('KEPALA');
            });
          }
          return found;
        };

        const kaban = getKepalaSignatureData(lastRekapPegawai) || filteredPegawai[0];

        // Dynamic Signature Title: Inspektur, Kepala Dinas, Kepala Badan, Camat, etc.
        let leaderTitle = 'Kepala Badan';
        if (kaban && kaban.jabatan) {
          leaderTitle = kaban.jabatan;
        } else {
          const instNameLower = (instData?.nama_instansi || '').toLowerCase();
          const headerLower = fullHeader.toLowerCase();
          
          if (instNameLower.includes('inspektorat') || headerLower.includes('inspektorat')) {
            leaderTitle = 'Inspektur';
          } else if (instNameLower.includes('dinas') || headerLower.includes('dinas')) {
            leaderTitle = 'Kepala Dinas';
          } else if (instNameLower.includes('sekretariat daerah') || headerLower.includes('sekretariat daerah')) {
            leaderTitle = 'Sekretaris Daerah';
          } else if (instNameLower.includes('sekretariat') || headerLower.includes('sekretariat')) {
            leaderTitle = 'Sekretaris';
          } else if (instNameLower.includes('kecamatan') || headerLower.includes('kecamatan')) {
            leaderTitle = 'Camat';
          }
        }
        
        doc.text(leaderTitle, signatureX, footerY + 11, { align: 'center' });

        const kabanUid = String(kaban?.id || kaban?.ID || '');
        const kabanNip = String(kaban?.nip || kaban?.NIP || '');
        const kabanSig = kaban ? (sigMap[kabanNip] || sigMap[kabanUid]) : null;
        if (kabanSig) {
          try { doc.addImage(kabanSig, 'PNG', signatureX - 15, footerY + 14, 30, 15, undefined, 'FAST'); } catch (e) { }
        }

        doc.setFont('times', 'bold');
        doc.text(kaban?.nama || '__________________________', signatureX, footerY + 38, { align: 'center' });
        doc.setFont('times', 'normal');
        
        // Pangkat & NIP
        if (kaban?.pangkat) {
          doc.text(kaban.pangkat, signatureX, footerY + 48, { align: 'center' });
          doc.text(`NIP. ${kaban?.nip || '..........................................'}`, signatureX, footerY + 53, { align: 'center' });
        } else {
          doc.text(`NIP. ${kaban?.nip || '..........................................'}`, signatureX, footerY + 48, { align: 'center' });
        }

        // 6. Simpan & Kirim references
        const fileName = `Rekap_HADIR_${dari}_${sampai}.pdf`;
        const pdfBase64 = doc.output('datauristring').split(',')[1];
        const pdfMsg = `📄 *REKAP HADIR PDF*\n📅 Periode: ${tanggalLabel}\n👤 Peminta: ${window.userProfile?.nama || window.MY_ID}\n🪪 NIP: ${localStorage.getItem('MY_NIP') || '-'}\n\nLaporan telah siap.`;
        const instName = instData?.nama_instansi || (typeof getInstansiName === 'function' ? getInstansiName(instId) : instId.toUpperCase());

        window.lastGeneratedDoc = doc;
        window.lastGeneratedFileName = fileName;
        window.lastGeneratedPdfBase64 = pdfBase64;
        window.lastGeneratedPdfMsg = pdfMsg;
        window.lastGeneratedInstId = instId;
        window.lastGeneratedInstName = instName;

        if (cfg.previewOnly) {
          return; // Modal handles rendering
        }

        // Android Native Download Support
        if (window.Capacitor) {
          try {
            const { Filesystem } = window.Capacitor.Plugins;
            const { Share } = window.Capacitor.Plugins;
            
            if (Filesystem) {
              const writeResult = await Filesystem.writeFile({
                path: fileName,
                data: pdfBase64,
                directory: 'CACHE',
                encoding: ''
              });
              
              if (Share) {
                await Share.share({
                  title: 'Unduh Rekap HADIR',
                  text: 'Berikut adalah laporan rekap HADIR yang Anda unduh.',
                  url: writeResult.uri,
                  dialogTitle: 'Buka atau Simpan PDF'
                });
              } else {
                showRekapToast('success', '✅ PDF disimpan di: ' + writeResult.uri);
              }
            } else {
              throw new Error("Plugin Filesystem tidak tersedia");
            }
          } catch (err) {
            console.error("Capacitor download error:", err);
            showRekapToast('fail', '❌ Gagal menyimpan PDF: ' + err.message);
          }
        } else {
          doc.save(fileName);
        }

        // Send to Telegram Webhook
        await apiPost(P.kirimRekap, { 
          chat_id: REKAP_CHAT_ID, 
          pesan: pdfMsg,
          nip: localStorage.getItem('MY_NIP') || '',
          file_base64: pdfBase64,
          file_name: fileName,
          instansi_id: instId,
          instansi_name: instName
        });
        showRekapToast('success', '✅ Rekap PDF berhasil dikirim!');

      } catch (e) {
        console.error('PDF Generation Error:', e);
        showRekapToast('fail', '❌ Gagal membuat PDF: ' + (e.message || 'Error tidak diketahui'));
      } finally {
        if (btn && !cfg.previewOnly) {
          btn.disabled = false;
          btn.innerHTML = originalHtml;
        }
      }
    }

    // ══ HTML PREVIEW GENERATOR (FOR MOBILE) ══
    window.buildHtmlPreview = function() {
      const context = window.pdfPreviewContext;
      const headerName = $('pdfOptHeaderName')?.value || 'PEMERINTAH KABUPATEN SUMBA BARAT';
      const headerAlamat = $('pdfOptHeaderAlamat')?.value || '';
      const headerKontak = $('pdfOptHeaderKontak')?.value || '';
      const logoUrl = $('pdfOptHeaderLogo')?.value || '';

      let html = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <style>
              body { font-family: 'Times New Roman', Times, serif; padding: 15px 10px; margin: 0; background: #fff; color: #000; font-size: 11px; line-height: 1.3; }
              .kop { display: flex; align-items: center; justify-content: center; position: relative; padding-bottom: 8px; margin-bottom: 2px; }
              .kop img { width: 45px; position: absolute; left: 0; top: 0; }
              .kop-text { text-align: center; margin-left: 45px; }
              .kop h2 { margin: 0; font-size: 13px; font-weight: bold; }
              .kop h1 { margin: 2px 0; font-size: 15px; font-weight: bold; }
              .kop p { margin: 0; font-size: 9px; line-height: 1.2; }
              .kop-divider { border-bottom: 2.5px solid #000; position: relative; margin-bottom: 15px; }
              .kop-divider::after { content: ''; position: absolute; left: 0; right: 0; bottom: -2px; border-bottom: 1px solid #000; }
              .title-area { text-align: center; margin-bottom: 15px; }
              .title-area h3 { margin: 0; font-size: 13px; font-weight: bold; text-decoration: underline; }
              .title-area p { margin: 3px 0 0 0; font-size: 11px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10px; }
              th, td { border: 1px solid #333; padding: 5px; text-align: center; vertical-align: middle; word-wrap: break-word; }
              th { background: #f9f9f9; font-weight: bold; }
              .text-left { text-align: left; }
              .footer { margin-top: 25px; display: flex; justify-content: flex-end; font-size: 11px; }
              .footer-box { width: 160px; text-align: center; }
              .footer-box p { margin: 2px 0; }
              .footer-box .name { margin-top: 40px; font-weight: bold; text-decoration: underline; }
              .alert-mobile { background: #f0fdf4; border: 1px solid #bbf7d0; padding: 10px; margin-bottom: 15px; font-family: sans-serif; font-size: 11.5px; text-align: center; color: #166534; border-radius: 6px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
            </style>
          </head>
          <body>
            <div class="alert-mobile">ℹ️ <b>Pratinjau HTML</b><br>Tampilan di bawah adalah ringkasan dokumen. Silakan unduh PDF untuk melihat format resmi (A4/F4).</div>
            <div class="kop">
              ${logoUrl ? `<img src="${logoUrl}" />` : ''}
              <div class="kop-text">
                <h2>PEMERINTAH KABUPATEN SUMBA BARAT</h2>
                <h1>${headerName}</h1>
                <p>${headerAlamat.replace(/\n/g, '<br>')}</p>
                ${headerKontak ? `<p>${headerKontak}</p>` : ''}
              </div>
            </div>
            <div class="kop-divider"></div>
      `;

      if (context === 'rekap') {
        const dari = $('rekapDari')?.value || '';
        const sampai = $('rekapSampai')?.value || '';
        const isMagang = $('rekapRoleFilter')?.value === 'magang';
        
        html += `
            <div class="title-area">
              <h3>${isMagang ? 'DAFTAR HADIR MAGANG / LAINNYA' : 'DAFTAR HADIR PEGAWAI'}</h3>
              <p>Periode: ${dari === sampai ? dari : dari + ' s.d. ' + sampai}</p>
            </div>
            <table>
              <thead>
                <tr>
                  <th style="width:5%">No</th>
                  <th style="width:40%">Nama / ${isMagang ? 'ID' : 'NIP'}</th>
                  <th style="width:25%">Jam</th>
                  <th style="width:30%">Ket</th>
                </tr>
              </thead>
              <tbody>
        `;
        
        const data = window.lastRekapPegawai || [];
        data.filter(p => p.nama && p.nama.trim() !== "").forEach((p, i) => {
          const jamM = p.dataExcelRow?.['Jam Masuk'] || p.jamMasuk || '—';
          const jamP = p.dataExcelRow?.['Jam Pulang'] || p.jamPulang || '—';
          let ketStatus = '';
          if (p.tubel > 0) ketStatus = 'TUBEL';
          else if (p.cuti > 0) ketStatus = 'CUTI';
          else if (p.sakit > 0) ketStatus = 'SAKIT';
          else if (p.izin > 0) ketStatus = 'IZIN';
          else if (p.tugas > 0) ketStatus = 'TUGAS/DL';
          else if (jamM === '—' || jamM === '-') ketStatus = 'TB';
          
          const ket = [ketStatus, p.logKet || ''].filter(Boolean).join(': ');
          
          html += `
            <tr>
              <td>${i+1}</td>
              <td class="text-left"><b>${p.nama}</b><br><span style="font-size:9px; color:#555">${p.nip||'—'}</span></td>
              <td><span style="font-size:9px">In: ${jamM}</span><br><span style="font-size:9px">Out: ${jamP}</span></td>
              <td>${ket || '—'}</td>
            </tr>
          `;
        });
        
        html += `</tbody></table>`;
        
      } else if (context === 'lembur') {
        const range = window._currentLemburRange || {};
        const dalamRangka = range.judul || ($('lemburDalamRangka')?.value || '').trim();
        html += `
            <div class="title-area">
              <h3>REKAPITULASI KERJA LEMBUR PEGAWAI</h3>
              <p>Periode: ${range.dari || ''} s.d. ${range.sampai || ''}</p>
              ${dalamRangka ? `<p style="font-style:italic">Dalam Rangka: ${dalamRangka}</p>` : ''}
            </div>
            <table>
              <thead>
                <tr>
                  <th style="width:5%">No</th>
                  <th style="width:45%">Nama Pegawai</th>
                  <th style="width:50%">Rincian Lembur</th>
                </tr>
              </thead>
              <tbody>
        `;
        
        const data = window._currentLemburData || [];
        const groups = {};
        data.forEach(r => {
          if (!groups[r.nip]) {
            groups[r.nip] = { nama: r.nama, nip: r.nip, list: [] };
          }
          if (r.keterangan_status) {
            groups[r.nip].list.push(`<span style="color:#d97706">${r.tanggal.slice(8,10)}</span>: ${r.keterangan_status}`);
          } else {
            groups[r.nip].list.push(`<span style="color:#2563eb">${r.tanggal.slice(8,10)}</span>: ${r.jam_pulang || '—'}`);
          }
        });
        
        Object.values(groups).forEach((g, i) => {
          html += `
            <tr>
              <td>${i+1}</td>
              <td class="text-left"><b>${g.nama}</b><br><span style="font-size:9px; color:#555">${g.nip||'—'}</span></td>
              <td class="text-left" style="font-size:9px; line-height:1.4;">${g.list.join('<br>')}</td>
            </tr>
          `;
        });
        
        html += `</tbody></table>`;
      }
      
      html += `
            <div class="footer">
              <div class="footer-box">
                <p>Waikabubak, ${new Date().toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'})}</p>
                <p>Mengetahui,</p>
                <p>Pimpinan</p>
                <div class="name">TTD</div>
              </div>
            </div>
          </body>
        </html>
      `;
      
      return html;
    };

    // ══ MODAL INTERFACE CONTROLLERS & EXPOSURE ══
    window.openPdfPreviewModal = function() {
      const modal = $('pdfPreviewModal');
      if (modal) {
        modal.style.display = 'flex';
        
        // Populate default values from the current active instansi
        const instId = (typeof getScopedInstansiId === 'function' ? getScopedInstansiId() : null) || (window.userProfile?.instansi_id) || 'bapperida';
        const instData = typeof getInstansiData === 'function' ? getInstansiData(instId) : null;
        
        const savedName = localStorage.getItem('absen_pdf_opt_header_name');
        const savedAlamat = localStorage.getItem('absen_pdf_opt_header_alamat');
        const savedKontak = localStorage.getItem('absen_pdf_opt_header_kontak');
        const savedLogo = localStorage.getItem('absen_pdf_opt_header_logo');
        const savedFont = localStorage.getItem('absen_pdf_opt_header_font');
        const savedFontSize = localStorage.getItem('absen_pdf_opt_header_font_size');

        const fullHeader = savedName !== null ? savedName : (instData?.header || instData?.nama_instansi || 'BADAN PERENCANAAN PEMBANGUNAN RISET DAN INOVASI DAERAH');
        const instAlamat = savedAlamat !== null ? savedAlamat : (instData?.alamat || 'Jl. Weekarou, Waikabubak, Sumba Barat, Nusa Tenggara Timur\nWAIKABUBAK');
        const instKontak = savedKontak !== null ? savedKontak : (instData?.kontak || '');
        const logoUrl = savedLogo !== null ? savedLogo : (instData?.logo_url || "https://raw.githubusercontent.com/hudsonjhonson9-arch/sekrebot/main/Lambang_Kabupaten_Sumba_Barat.png");
        const headerFont = savedFont !== null ? savedFont : (instData?.header_font || 'times');
        const headerSize = savedFontSize !== null ? savedFontSize : (instData?.header_size || '15');

        // Load into inputs
        if ($('pdfOptHeaderName')) $('pdfOptHeaderName').value = fullHeader;
        if ($('pdfOptHeaderAlamat')) $('pdfOptHeaderAlamat').value = instAlamat;
        if ($('pdfOptHeaderKontak')) $('pdfOptHeaderKontak').value = instKontak;
        if ($('pdfOptHeaderLogo')) $('pdfOptHeaderLogo').value = logoUrl;
        if ($('pdfOptHeaderFont')) $('pdfOptHeaderFont').value = headerFont;
        if ($('pdfOptHeaderFontSize')) $('pdfOptHeaderFontSize').value = headerSize;

        // Set default orientation based on context: lembur → landscape, rekap → portrait
        const orientEl = $('pdfOptOrientation');
        if (orientEl) {
          orientEl.value = (window.pdfPreviewContext === 'lembur') ? 'l' : 'p';
        }

        if (typeof window.preloadPdfImage === 'function') {
          window.preloadPdfImage(logoUrl).then(() => {
            refreshPdfPreview();
          }).catch(() => {
            refreshPdfPreview();
          });
        } else {
          refreshPdfPreview();
        }
      }
    };

    window.closePdfPreviewModal = function() {
      const modal = $('pdfPreviewModal');
      if (modal) {
        modal.style.display = 'none';
        const iframe = $('pdfPreviewIframe');
        if (iframe) iframe.src = 'about:blank';
        const toolbar = $('pdfMobileToolbar');
        if (toolbar) toolbar.style.display = 'none';
      }
    };

    window.refreshPdfPreview = async function() {
      const loader = $('pdfPreviewLoader');
      if (loader) loader.style.display = 'flex';

      const orientation = $('pdfOptOrientation')?.value || 'p';
      const size = $('pdfOptSize')?.value || 'f4';
      const margin = parseFloat($('pdfOptMargin')?.value || '10');
      const fontSize = parseFloat($('pdfOptFontSize')?.value || '7.5');
      const padding = parseFloat($('pdfOptPadding')?.value || '2.0');
      const rowPageBreak = $('pdfOptRowBreak')?.value || 'avoid';

      // Custom letterhead overridden settings
      const headerName = $('pdfOptHeaderName')?.value || '';
      const headerAlamat = $('pdfOptHeaderAlamat')?.value || '';
      const headerKontak = $('pdfOptHeaderKontak')?.value || '';
      const headerLogo = $('pdfOptHeaderLogo')?.value || '';
      const headerFont = $('pdfOptHeaderFont')?.value || '';
      const headerFontSize = $('pdfOptHeaderFontSize')?.value || '';

      // Save to localStorage for persistence
      try {
        if ($('pdfOptHeaderName')) localStorage.setItem('absen_pdf_opt_header_name', headerName);
        if ($('pdfOptHeaderAlamat')) localStorage.setItem('absen_pdf_opt_header_alamat', headerAlamat);
        if ($('pdfOptHeaderKontak')) localStorage.setItem('absen_pdf_opt_header_kontak', headerKontak);
        if ($('pdfOptHeaderLogo')) localStorage.setItem('absen_pdf_opt_header_logo', headerLogo);
        if ($('pdfOptHeaderFont')) localStorage.setItem('absen_pdf_opt_header_font', headerFont);
        if ($('pdfOptHeaderFontSize')) localStorage.setItem('absen_pdf_opt_header_font_size', headerFontSize);
      } catch (e) {}

      if (headerLogo && typeof window.preloadPdfImage === 'function') {
        try {
          await window.preloadPdfImage(headerLogo);
        } catch (e) {}
      }

      try {
        if (window.pdfPreviewContext === 'lembur') {
          if (!window._currentLemburData || window._currentLemburData.length === 0) {
            throw new Error('Data lembur belum ada. Tarik data terlebih dahulu.');
          }
          if (typeof window.generateLemburPDF === 'function') {
            await window.generateLemburPDF({
              orientation,
              size,
              margin,
              fontSize,
              padding,
              rowPageBreak,
              headerName,
              headerAlamat,
              headerKontak,
              headerLogo,
              headerFont,
              headerFontSize,
              previewOnly: true
            });
          }
        } else {
          await generateRekapPDF({
            orientation,
            size,
            margin,
            fontSize,
            padding,
            rowPageBreak,
            headerName,
            headerAlamat,
            headerKontak,
            headerLogo,
            headerFont,
            headerFontSize,
            previewOnly: true
          });
        }

        const iframe = $('pdfPreviewIframe');
        const canvasContainer = $('pdfPreviewCanvasContainer');
        if (iframe && window.lastGeneratedDoc) {
          try {
            if (window.innerWidth > 768) {
              if (canvasContainer) canvasContainer.style.display = 'none';
              iframe.style.display = 'block';
              const blobUrl = window.lastGeneratedDoc.output('bloburl');
              iframe.src = blobUrl;
            } else {
              // Mobile fallback: Render with PDF.js to canvas
              iframe.style.display = 'none';
              if (canvasContainer) {
                canvasContainer.style.display = 'flex';
                const dataUri = window.lastGeneratedDoc.output('datauristring');
                
                if (window.innerWidth <= 768) {
                  const sidebar = document.getElementById('pdfPreviewSidebar');
                  if (sidebar) sidebar.classList.remove('show-sidebar');
                }
                
                if (!window.pdfjsLib) {
                  canvasContainer.innerHTML = '<div style="color:#94a3b8;margin-top:20px;font-size:12px;">Memuat penampil PDF...</div>';
                  await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
                    script.onload = () => {
                      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                      resolve();
                    };
                    script.onerror = reject;
                    document.head.appendChild(script);
                  });
                }
                
                canvasContainer.innerHTML = '<div style="color:#94a3b8;margin-top:20px;font-size:12px;">Memproses dokumen...</div>';
                
                try {
                  const base64Data = dataUri.split('base64,')[1];
                  const binaryString = atob(base64Data);
                  const loadingTask = window.pdfjsLib.getDocument({data: binaryString});
                  const pdf = await loadingTask.promise;
                  
                  canvasContainer.innerHTML = '';
                  const wrapper = document.createElement('div');
                  wrapper.id = 'pdfCanvasWrapper';
                  wrapper.style.display = 'flex';
                  wrapper.style.flexDirection = 'column';
                  wrapper.style.alignItems = 'center';
                  wrapper.style.transformOrigin = 'top center';
                  wrapper.style.transition = 'transform 0.15s ease-out';
                  canvasContainer.appendChild(wrapper);
                  
                  const toolbar = document.getElementById('pdfMobileToolbar');
                  if (toolbar) toolbar.style.display = 'flex';
                  
                  window.currentPdfZoom = 1.0;
                  window.zoomPdf = function(step) {
                    window.currentPdfZoom = Math.max(0.5, Math.min(3.0, window.currentPdfZoom + step));
                    const wrp = document.getElementById('pdfCanvasWrapper');
                    const ind = document.getElementById('pdfZoomIndicator');
                    if (wrp) wrp.style.transform = `scale(${window.currentPdfZoom})`;
                    if (ind) ind.textContent = Math.round(window.currentPdfZoom * 100) + '%';
                  };
                  
                  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                    const page = await pdf.getPage(pageNum);
                    
                    const viewportBase = page.getViewport({ scale: 1.0 });
                    const containerWidth = canvasContainer.clientWidth - 40; // padding
                    const cssScale = containerWidth / viewportBase.width;
                    
                    const dpr = window.devicePixelRatio || 1;
                    const renderScale = cssScale * dpr;
                    const viewport = page.getViewport({ scale: renderScale });
                    
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;
                    
                    canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
                    canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
                    canvas.style.marginBottom = '20px';
                    canvas.style.boxShadow = '0 10px 25px -5px rgba(0,0,0,0.5)';
                    canvas.style.borderRadius = '4px';
                    canvas.style.background = '#fff';
                    
                    wrapper.appendChild(canvas);
                    
                    const renderContext = {
                      canvasContext: context,
                      viewport: viewport
                    };
                    await page.render(renderContext).promise;
                  }
                } catch (pdfErr) {
                  console.error("PDF.js render error:", pdfErr);
                  canvasContainer.innerHTML = `<div style="color:#f87171;padding:20px;text-align:center;font-size:12px;">Gagal menampilkan PDF.<br>Silakan langsung unduh laporan.</div>`;
                }
              }
            }
          } catch (err) {
            console.warn("Pratinjau PDF gagal dirender di browser ini.");
          }
        } else if (iframe) {
          iframe.srcdoc = '<div style="padding:20px;color:red;font-family:sans-serif">⚠️ PDF gagal di-generate. Coba tutup dan buka kembali modal ini.</div>';
        }
      } catch (err) {
        console.error("Gagal refresh preview PDF:", err);
        const iframe = $('pdfPreviewIframe');
        if (iframe) {
          iframe.srcdoc = `<div style="padding:20px;color:#c00;font-family:sans-serif;font-size:14px">
            <b>❌ Error:</b> ${err.message || err}
          </div>`;
        }
      } finally {
        if (loader) loader.style.display = 'none';
      }
    };

    window.triggerPdfModalDownload = function() {
      if (window.lastGeneratedDoc && window.lastGeneratedFileName) {
        if (window.Capacitor) {
          (async () => {
            try {
              const { Filesystem } = window.Capacitor.Plugins;
              const { Share } = window.Capacitor.Plugins;
              
              if (Filesystem) {
                const writeResult = await Filesystem.writeFile({
                  path: window.lastGeneratedFileName,
                  data: window.lastGeneratedPdfBase64,
                  directory: 'CACHE',
                  encoding: ''
                });
                if (Share) {
                  await Share.share({
                    title: 'Unduh Rekap HADIR',
                    text: 'Berikut adalah laporan rekap HADIR yang Anda unduh.',
                    url: writeResult.uri,
                  });
                }
              } else {
                // Fallback for browser / PWA
                window.lastGeneratedDoc.save(window.lastGeneratedFileName);
              }
            } catch (e) {
              // If it fails, fallback to web download
              window.lastGeneratedDoc.save(window.lastGeneratedFileName);
            }
          })();
        } else {
          window.lastGeneratedDoc.save(window.lastGeneratedFileName);
        }
      } else {
        alert("Laporan belum siap atau kosong.");
      }
    };

    window.triggerPdfModalSendTelegram = async function() {
      const btn = $('btnPdfModalSendTelegram');
      if (!btn) return;
      const originalText = btn.innerHTML;

      try {
        btn.disabled = true;
        btn.innerHTML = '<span class="spin-sm"></span> Mengirim...';

        if (!window.lastGeneratedPdfBase64) {
          alert("Laporan belum siap untuk dikirim.");
          return;
        }

        await apiPost(P.kirimRekap, { 
          chat_id: String(typeof REKAP_CHAT_ID !== 'undefined' && REKAP_CHAT_ID ? REKAP_CHAT_ID : (window.MY_ID || localStorage.getItem(STORAGE_KEYS.USER_ID) || '')), 
          pesan: window.lastGeneratedPdfMsg,
          nip: localStorage.getItem('MY_NIP') || '',
          file_base64: window.lastGeneratedPdfBase64,
          file_name: window.lastGeneratedFileName,
          instansi_id: window.lastGeneratedInstId,
          instansi_name: window.lastGeneratedInstName
        });

        showRekapToast('success', '✅ Rekap PDF berhasil dikirim!');
        closePdfPreviewModal();
      } catch (e) {
        console.error("Kirim Telegram error:", e);
        alert("Gagal mengirim rekap ke Telegram: " + (e.message || "Error tidak diketahui"));
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    };



