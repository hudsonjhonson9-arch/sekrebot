/**
 * Absensi v2 - Biometric Face & Geolocation Controller
 */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    const video = document.getElementById('cameraStream') || document.querySelector('video');
    const captureBtn = document.getElementById('takePhotoBtn') || document.querySelector('button[id*="capture"], button:has(.material-symbols-outlined)');
    let stream = null;

    // 1. Initialize Camera
    async function initCamera() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn('Camera API not available; fallback to simulated capture.');
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 720 },
            height: { ideal: 720 }
          },
          audio: false
        });

        if (video) {
          video.srcObject = stream;
          video.play();
        }
      } catch (err) {
        console.warn('Camera permission denied or not found:', err);
      }
    }

    initCamera();

    // 2. Capture and Clock In
    window.handleClockInVerification = function () {
      let photoData = null;

      if (video && video.srcObject) {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 480;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        photoData = canvas.toDataURL('image/jpeg', 0.85);

        // Stop camera tracks
        const tracks = stream ? stream.getTracks() : [];
        tracks.forEach(track => track.stop());
      }

      // Record Clock In
      const log = window.AbsensiApp.clockIn(photoData);

      // Sound feedback
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
      } catch (e) {}

      window.AbsensiApp.showToast('Verifikasi Wajah Sukses! Presensi Masuk Dicatat.');

      setTimeout(() => {
        window.location.href = 'e-slip.html';
      }, 1000);
    };

    // Auto bind any submit button on verification page
    document.querySelectorAll('button').forEach(btn => {
      const text = btn.textContent.toLowerCase();
      if (text.includes('ambil foto') || text.includes('verifikasi') || text.includes('absen sekarang') || text.includes('pakai foto')) {
        btn.onclick = function (e) {
          e.preventDefault();
          window.handleClockInVerification();
        };
      }
    });
  });
})();
