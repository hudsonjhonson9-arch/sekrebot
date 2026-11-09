/* ════ GPS SEGAR — SELALU MINTA FIX BARU ════
   getCurrentPosition({ maximumAge: 0 }) hanya petunjuk. WebView Android, Telegram
   Mini App, dan sebagian browser tetap membalas dengan fix lama yang tersimpan
   (timestamp-nya jauh sebelum permintaan), jadi pegawai bisa "absen" memakai
   lokasi beberapa menit lalu.

   getFreshPosition memakai watchPosition (terus meminta fix baru ke perangkat)
   dan hanya menerima fix yang timestamp-nya SESUDAH permintaan dimulai. Fix lama
   dibuang, lalu kita menunggu fix berikutnya.

   Signature sama dengan navigator.geolocation.getCurrentPosition supaya
   pemanggil cukup mengganti nama fungsi:
     getFreshPosition(onSuccess, onError, { enableHighAccuracy, timeout })
   Mengembalikan fungsi batal.

   Aturan selesai:
     • langsung, begitu ada fix segar dengan akurasi <= targetAccuracy (25 m)
     • setelah settleMs (6 dtk), fix segar terbaik bila akurasi <= settleAccuracy (100 m)
     • setelah timeout (15 dtk), fix segar terbaik berapa pun akurasinya (server dan
       GPS_MAX_ACCURACY_M yang memutuskan layak atau tidak)
     • tidak ada fix segar sama sekali → onError (kode 3, atau 2 bila perangkat
       melaporkan lokasi tidak tersedia). Fix lama TIDAK PERNAH dipakai.
   ════════════════════════════════════════════════════════════════════ */
function getFreshPosition(onSuccess, onError, options = {}) {
  const geo = typeof navigator !== 'undefined' ? navigator.geolocation : null;
  const {
    enableHighAccuracy = true,
    timeout = 15000,
    targetAccuracy = 25,
    settleMs = 6000,
    settleAccuracy = 100,
    // Toleransi selisih jam antara timestamp fix dan Date.now() (ms).
    clockSkewMs = 2000,
  } = options;

  if (!geo || typeof geo.watchPosition !== 'function') {
    if (typeof onError === 'function') onError({ code: 2, message: 'Geolocation tidak didukung di perangkat ini.' });
    return () => {};
  }

  const t0 = Date.now();
  const timers = [];
  let watchId = null;
  let best = null;
  let lastErr = null;
  let staleCount = 0;
  let done = false;

  // accuracy 0/NaN dianggap terburuk: bukan pembacaan GPS yang bisa dipercaya.
  const acc = (p) => {
    const a = Number(p?.coords?.accuracy);
    return a > 0 ? a : Infinity;
  };
  const isFresh = (p) => Number.isFinite(p?.timestamp) && p.timestamp >= t0 - clockSkewMs;

  const stop = () => {
    done = true;
    timers.forEach(clearTimeout);
    if (watchId !== null) {
      try { geo.clearWatch(watchId); } catch { /* sudah dibersihkan */ }
      watchId = null;
    }
  };
  const succeed = () => { if (done) return; stop(); if (typeof onSuccess === 'function') onSuccess(best); };
  const fail = (err) => { if (done) return; stop(); if (typeof onError === 'function') onError(err); };

  timers.push(setTimeout(() => {
    if (best) { succeed(); return; }
    if (lastErr && lastErr.code === 2) { fail(lastErr); return; }
    fail({
      code: 3,
      message: staleCount > 0
        ? 'Hanya mendapat data GPS lama. Pastikan GPS aktif dan coba di area terbuka.'
        : 'Permintaan lokasi habis waktu.',
    });
  }, timeout));

  if (settleMs < timeout) {
    timers.push(setTimeout(() => {
      if (best && acc(best) <= settleAccuracy) succeed();
    }, settleMs));
  }

  watchId = geo.watchPosition(
    (pos) => {
      if (done) return;
      if (!isFresh(pos)) { staleCount += 1; return; }
      if (!best || acc(pos) < acc(best)) best = pos;
      if (acc(best) <= targetAccuracy) succeed();
    },
    (err) => {
      if (done) return;
      if (err && err.code === 1) { fail(err); return; } // izin ditolak: tidak ada gunanya menunggu
      lastErr = err || lastErr; // 2/3 bisa sementara; putuskan saat timeout
    },
    { enableHighAccuracy, maximumAge: 0, timeout }
  );

  // watchPosition bisa memanggil callback sinkron sebelum id dikembalikan.
  if (done && watchId !== null) {
    try { geo.clearWatch(watchId); } catch { /* abaikan */ }
    watchId = null;
  }

  return () => { if (!done) stop(); };
}

if (typeof window !== 'undefined') window.getFreshPosition = getFreshPosition;
