/**
 * Absensi v2 - Mode Kiosk Lobi / Terminal Meja Absen Controller
 */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    const video = document.getElementById('kioskCamera') || document.querySelector('video');
    let masukCount = 42;
    let pulangCount = 18;
    let gagalCount = 1;

    // 1. Live Camera Stream
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
        .then(stream => {
          if (video) {
            video.srcObject = stream;
            video.play();
          }
        })
        .catch(err => {
          console.warn('Kiosk camera fallback active.');
        });
    }

    // 2. Counters
    const masukElem = document.querySelector('[class*="MASUK"]')?.parentElement?.querySelector('.font-headline-lg, .text-3xl, h3') || document.getElementById('countMasuk');
    const pulangElem = document.querySelector('[class*="PULANG"]')?.parentElement?.querySelector('.font-headline-lg, .text-3xl, h3') || document.getElementById('countPulang');

    // 3. Kiosk Loop Simulation: Every 6 seconds simulate a person recognized
    const sampleEmployees = [
      'Agil Susanto, S.Kom.',
      'Maria L. Rambu, S.Sos.',
      'Yohanes D. Umbu, S.T.',
      'Siti Nurhaliza, A.Md.',
      'Petrus K. Lado, S.AP.'
    ];

    setInterval(() => {
      const randomEmp = sampleEmployees[Math.floor(Math.random() * sampleEmployees.length)];
      masukCount++;
      if (masukElem) masukElem.textContent = masukCount;

      if (window.AbsensiApp) {
        window.AbsensiApp.showToast(`✅ Absen Masuk Dikenali: ${randomEmp} (08:${Math.floor(Math.random() * 20) + 10} WITA)`);
      }
    }, 8000);
  });
})();
