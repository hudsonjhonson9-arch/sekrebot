/* ════ OFFLINE SYNC & PWA ════ */
    /* ════════════════════════════════════════════════════
       OFFLINE QUEUE SYNC ════ */
    let isSyncing = false;
    async function syncOfflineQueue() {
      if (isSyncing || !navigator.onLine) return;
      isSyncing = true;
      try {
        const queue = await idb.getAll('offline_queue');
        if (!queue || queue.length === 0) { isSyncing = false; return; }

        // Sort by timestamp so older records are sent first
        queue.sort((a, b) => a.timestamp - b.timestamp);

        let successCount = 0;
        for (const item of queue) {
          try {
            let finalPayload = item.payload || item.data;
            
            const { ok: syncOk, data: res, status: syncStatus } = await apiPost(item.endpoint, finalPayload);
            if (syncOk) {
              await idb.delete('offline_queue', item.id);
              successCount++;
            }
          } catch (err) {
            console.warn('Sync failed for item', item.id, err);
            // Break loop if one fails to preserve order and avoid spamming server
            break;
          }
        }

        if (successCount > 0) {
          showToast(`${successCount} data offline berhasil disinkronisasi`, 'success');

          if (typeof loadLog === 'function') setTimeout(loadLog, 1500);
          if (typeof loadMyAssignments === 'function') setTimeout(loadMyAssignments, 1500);
        }
      } catch (err) {
        console.error('Offline sync error', err);
      } finally {
        isSyncing = false;
      }
    }

    /* ════ PWA & OFFLINE LOGIC ════ */
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js').catch(e => console.warn('SW Reg Failed:', e));
      });
    }

    function updateOnlineStatus() {
      const banner = $('offlineBanner');
      if (!navigator.onLine) {
        if (banner) banner.style.display = 'block';
        // Matikan kamera jika overlay masih terbuka saat offline
        if (typeof closeCamOverlay === 'function') {
          const overlay = $('camOverlay');
          if (overlay && !overlay.classList.contains('hidden')) {
            closeCamOverlay(false); // Programmatic - offline event, tidak trigger onCancel
          }
        }
      } else {
        if (banner) banner.style.display = 'none';
        // Di sini akan dipanggil sync offline queue nantinya
        if (typeof syncOfflineQueue === 'function') syncOfflineQueue();
      }
    }
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();

    /* ════════════════════════════════════════════════════
       MEJA ABSEN / DESK ATTENDANCE LOGIC
    ════════════════════════════════════════════════════════ */
    // 4. Handler Pencocokan & Cek Status (AJAX ke Webhook)
    // Tambahkan dua variabel ini di bagian paling atas script (di luar fungsi) 
    // agar tracker tetap tersimpan selama aplikasi terbuka.
    let _lastMejaId = null;
