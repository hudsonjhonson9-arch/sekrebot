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

    // ponytail: Google Drive has no CORS headers — route via weserv.nl image proxy
    async function _fetchSigToBase64(url) {
      if (!url || url.startsWith('data:')) return url;
      if (!url.includes('drive.google.com')) return url;
      let fileId = '';
      const m1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      fileId = (m1 && m1[1]) || (m2 && m2[1]) || '';
      if (!fileId) return url;
      const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(`https://drive.google.com/uc?export=view&id=${fileId}`)}`;
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
          try {
            const c = document.createElement('canvas');
            c.width = img.naturalWidth; c.height = img.naturalHeight;
            c.getContext('2d').drawImage(img, 0, 0);
            resolve(c.toDataURL('image/png'));
          } catch (e) { resolve(url); }
        };
        img.onerror = () => resolve(url);
        img.src = proxyUrl;
      });
    }

    async function generateRekapPDF(options = null) {
      // 1. Validasi Awal
      if (!lastRekapPegawai || lastRekapPegawai.length === 0) {
        showRekapToast('fail', '⚠️ Muat rekap terlebih dahulu');
        return;
      }

      // Check desktop mode preview flow
      if (window.innerWidth >= 992 && (!options || !options.previewOnly)) {
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
            const sigEntries = sigData.filter(s => s.signature && s.signature.length > 100);
            const fetched = await Promise.all(sigEntries.map(async (s) => ({
              key: String(s.telegram_id),
              nip: String(s.nip || ''),
              base64: await _fetchSigToBase64(s.signature)
            })));
            fetched.forEach(f => {
              sigMap[f.key] = f.base64;
              if (f.nip) sigMap[f.nip] = f.base64;
            });
          }
        } catch (e) {
          console.warn("Gagal load paraf, lanjut tanpa paraf.");
        }

        const filteredPegawai = lastRekapPegawai.filter(p => p.nama && p.nama.trim() !== "");

        // Statistik untuk ringkasan di bawah
        const stats = { hadir: 0, sakit: 0, izin: 0, tugas: 0, tubel: 0, cuti: 0, tanpaBerita: 0, terlambat: 0 };

        // 3. Update Table Body: Tambahkan Jabatan & Keterangan
        const tableBody = filteredPegawai.map((p, i) => {
          const row = p.dataExcelRow || {};
          const jamM = row['Jam Masuk'] || p.jamMasuk || '—';
          const jamP = row['Jam Pulang'] || p.jamPulang || '—';

          // Logika Status & Keterangan
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
            `${p.nama}\nNIP. ${p.nip || '—'}`,
            (p.jabatan || '—') + (p.pangkat ? `\n(${p.pangkat})` : ''),
            jamM,
            '',
            jamP,
            '',
            finalKet || '—'
          ];
        });

        // 4. Proses Tabel & Hitung Kop Dinamis
        const instId = (typeof getScopedInstansiId === 'function' ? getScopedInstansiId() : null) || (window.userProfile?.instansi_id) || 'bapperida';
        const instData = typeof getInstansiData === 'function' ? getInstansiData(instId) : null;

        // Prioritize dynamic letterhead overrides if present in options or DOM elements
        const fullHeader = cfg.headerName !== undefined ? cfg.headerName : (($('pdfOptHeaderName')?.value || '').trim() || instData?.header || instData?.nama_instansi || 'BADAN PERENCANAAN PEMBANGUNAN RISET DAN INOVASI DAERAH');
        const instAlamat = cfg.headerAlamat !== undefined ? cfg.headerAlamat : (($('pdfOptHeaderAlamat')?.value || '').trim() || instData?.alamat || 'Jl. Weekarou, Waikabubak, Sumba Barat, Nusa Tenggara Timur\nWAIKABUBAK');
        const instKontak = cfg.headerKontak !== undefined ? cfg.headerKontak : (($('pdfOptHeaderKontak')?.value || '').trim() || instData?.kontak || '');
        const logoUrl = cfg.headerLogo !== undefined ? cfg.headerLogo : (($('pdfOptHeaderLogo')?.value || '').trim() || instData?.logo_url || rawLogoUrl);

        const headerFont = cfg.headerFont !== undefined ? cfg.headerFont : ($('pdfOptHeaderFont')?.value || instData?.header_font || 'times');
        const headerSize = parseFloat(cfg.headerFontSize !== undefined ? cfg.headerFontSize : ($('pdfOptHeaderFontSize')?.value || instData?.header_size || '15'));

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
          head: [['No', 'Nama / NIP', 'Jabatan / Pangkat', 'Jam\nMasuk', 'Paraf\nMasuk', 'Jam\nPulang', 'Paraf\nPulang', 'Ket']],
          body: tableBody,
          theme: 'grid',
          headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center', lineWidth: 0.1 },
          styles: { font: 'times', fontSize: cfg.fontSize, cellPadding: cfg.padding, valign: 'middle', overflow: 'linebreak' },
          rowPageBreak: cfg.rowPageBreak,
          columnStyles: {
            0: { halign: 'center', cellWidth: 7 },
            3: { halign: 'center', cellWidth: 16 },
            4: { cellWidth: 22, minCellHeight: 14 },
            5: { halign: 'center', cellWidth: 16 },
            6: { cellWidth: 22, minCellHeight: 14 }
          },
          didDrawCell: (data) => {
            if (data.cell.section === 'body' && (data.column.index === 4 || data.column.index === 6)) {
              const rowIdx = data.row.index;
              const peg = filteredPegawai[rowIdx];
              if (!peg) return;

              const uid = String(peg.id || peg.ID || peg.telegram_id || '');
              const nip = String(peg.nip || peg.NIP || '');
              const sig = sigMap[uid] || sigMap[nip];

              if (sig) {
                const isParafMasuk = (data.column.index === 4);
                const jamVal = isParafMasuk ?
                  (peg.dataExcelRow?.['Jam Masuk'] || peg.jamMasuk) :
                  (peg.dataExcelRow?.['Jam Pulang'] || peg.jamPulang);

                if (jamVal && !['—', '-', 'Alpa', 'Alpha', 'Tanpa Berita', 'TB', 'Belum'].includes(jamVal.trim())) {
                  try {
                    const fmt = sig.includes('image/jpeg') ? 'JPEG' : 'PNG';
                    doc.addImage(sig, fmt, data.cell.x + 2, data.cell.y + 2, 18, 10, undefined, 'FAST');
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
              doc.text('DAFTAR HADIR PEGAWAI', pageWidth / 2, docTitleY, { align: 'center' });
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
        const statText = `Hadir: ${stats.hadir} | Sakit: ${stats.sakit} | Izin: ${stats.izin} | Tugas/DL: ${stats.tugas} | Tubel: ${stats.tubel} | Cuti: ${stats.cuti} | TB: ${stats.tanpaBerita} | Terlambat: ${stats.terlambat}`;
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

        const kabanSig = kaban ? (sigMap[String(kaban.id)] || sigMap[String(kaban.nip || '')]) : null;
        if (kabanSig) {
          try { const fmt2 = kabanSig.includes('image/jpeg') ? 'JPEG' : 'PNG'; doc.addImage(kabanSig, fmt2, signatureX - 15, footerY + 14, 30, 15, undefined, 'FAST'); } catch (e) { }
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
        const fileName = `Rekap_Absensi_${dari}_${sampai}.pdf`;
        const pdfBase64 = doc.output('datauristring').split(',')[1];
        const pdfMsg = `📄 *REKAP ABSENSI PDF*\n📅 Periode: ${tanggalLabel}\n👤 Peminta: ${window.userProfile?.nama || window.MY_ID}\n🪪 NIP: ${localStorage.getItem('MY_NIP') || '-'}\n\nLaporan telah siap.`;
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
                  title: 'Unduh Rekap Absensi',
                  text: 'Berikut adalah laporan rekap absensi yang Anda unduh.',
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

    // ══ MODAL INTERFACE CONTROLLERS & EXPOSURE ══
    window.openPdfPreviewModal = function() {
      const modal = $('pdfPreviewModal');
      if (modal) {
        modal.style.display = 'flex';
        
        // Populate default values from the current active instansi
        const instId = (typeof getScopedInstansiId === 'function' ? getScopedInstansiId() : null) || (window.userProfile?.instansi_id) || 'bapperida';
        const instData = typeof getInstansiData === 'function' ? getInstansiData(instId) : null;
        
        const fullHeader = instData?.header || instData?.nama_instansi || 'BADAN PERENCANAAN PEMBANGUNAN RISET DAN INOVASI DAERAH';
        const instAlamat = instData?.alamat || 'Jl. Weekarou, Waikabubak, Sumba Barat, Nusa Tenggara Timur\nWAIKABUBAK';
        const instKontak = instData?.kontak || '';
        const logoUrl = instData?.logo_url || "https://raw.githubusercontent.com/hudsonjhonson9-arch/sekrebot/main/Lambang_Kabupaten_Sumba_Barat.png";
        const headerFont = instData?.header_font || 'times';
        const headerSize = instData?.header_size || '15';

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
        if (iframe && window.lastGeneratedDoc) {
          const blobUrl = window.lastGeneratedDoc.output('bloburl');
          iframe.src = blobUrl;
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
                    title: 'Unduh Rekap Absensi',
                    text: 'Berikut adalah laporan rekap absensi yang Anda unduh.',
                    url: writeResult.uri,
                    dialogTitle: 'Buka atau Simpan PDF'
                  });
                }
              }
            } catch (err) {
              console.error("Native download from modal error:", err);
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
          chat_id: REKAP_CHAT_ID, 
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



