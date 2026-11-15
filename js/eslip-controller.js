/**
 * Absensi v2 - E-Slip Digital Receipt Controller
 */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    if (!window.AbsensiApp) return;

    const log = window.AbsensiApp.getTodayLog() || window.AbsensiApp.logs[0];
    const user = window.AbsensiApp.user;
    const config = window.AbsensiApp.config;

    if (!log) return;

    // 1. Employee Info
    document.querySelectorAll('[class*="Pegawai"], .employee-name, h2, h3').forEach(el => {
      if (el.textContent.includes('Rina') || el.textContent.includes('Nama')) {
        el.textContent = user.name;
      }
    });

    document.querySelectorAll('.employee-nip, p').forEach(el => {
      if (el.textContent.includes('1994') || el.textContent.includes('NIP')) {
        el.textContent = `NIP. ${user.nip}`;
      }
    });

    // 2. Attendance Timestamp
    document.querySelectorAll('.clock-in-time, [class*="08:"]').forEach(el => {
      if (el.textContent.match(/\d{2}:\d{2}/)) {
        el.textContent = log.inTime || '07:55:12 WITA';
      }
    });

    // 3. Status Badge
    document.querySelectorAll('[class*="TEPAT"], [class*="TERLAMBAT"], .status-badge').forEach(el => {
      el.textContent = log.inStatus || 'TEPAT WAKTU';
      if (log.inStatus === 'TERLAMBAT') {
        el.className = el.className.replace('bg-secondary', 'bg-error').replace('text-secondary', 'text-error');
      }
    });

    // 4. Coordinates & Distance
    document.querySelectorAll('.office-location, [class*="Kantor"], [class*="Sudirman"]').forEach(el => {
      if (el.tagName === 'P' || el.tagName === 'SPAN') {
        el.textContent = `${config.officeName} (~${log.inDistance || 14}m)`;
      }
    });

    // 5. Photo Snapshot
    if (log.inPhoto) {
      const photoEl = document.querySelector('img[alt*="Verifikasi"], img[alt*="Profile"], .selfie-snapshot');
      if (photoEl) {
        photoEl.src = log.inPhoto;
      }
    }
  });
})();
