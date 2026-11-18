/**
 * Admin desktop controller — pengaturan lokasi/geofence yang tersambung ke database.
 * Dulu menyimpan ke localStorage (AbsensiApp.saveConfig) dan menimpa onclick setiap
 * tombol yang teksnya mengandung "simpan"/"update"/"terapkan". Sekarang memakai
 * AdminCore (js/admin-core.js) yang sama dengan panel admin mobile.
 */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', async function () {
    const core = window.AdminCore;
    const $ = (id) => document.getElementById(id);
    const lat = $('adminOfficeLat');
    const lon = $('adminOfficeLon');
    const rad = $('adminRadiusSlider');
    const label = $('radiusLabel');
    const btn = $('btnSaveLokasi');
    if (!core) return;

    let locId = '1';
    const showRadius = () => { if (label) label.textContent = rad.value + ' Meter'; };
    const jamMasukEl = $('inputJamMasuk') || $('adminJamMasuk');
    const jamPulangEl = $('inputJamPulang') || $('adminJamPulang');

    try {
      const { locations, shift } = await core.loadLokasi();
      const loc = locations[0];
      if (loc) {
        locId = String(loc.id);
        if (lat) lat.value = loc.latitude;
        if (lon) lon.value = loc.longitude;
        if (rad) rad.value = loc.radius || rad.value;
      }
      if (shift) {
        if (jamMasukEl && shift.masuk) jamMasukEl.value = shift.masuk;
        if (jamPulangEl && shift.pulang) jamPulangEl.value = shift.pulang;
      }
    } catch (err) {
      console.warn('[admin] gagal memuat lokasi/shift dari database:', err.message);
    }
    if (rad) {
      showRadius();
      rad.addEventListener('input', showRadius);
    }

    if (btn && lat && lon && rad) {
      btn.addEventListener('click', async function () {
        btn.disabled = true;
        try {
          await core.saveLokasi({ id: locId, lat: lat.value, lon: lon.value, radius: rad.value });
        } finally {
          btn.disabled = false;
        }
      });
    }

    // Bind tombol "Simpan Kebijakan Jam Kerja" di admin.html
    const btnJam = $('btnSaveJamKerja') || Array.from(document.querySelectorAll('button')).find(b => /Simpan Kebijakan Jam Kerja/i.test(b.textContent || ''));
    if (btnJam && jamMasukEl && jamPulangEl && typeof core.saveJamAbsen === 'function') {
      btnJam.addEventListener('click', async function () {
        btnJam.disabled = true;
        try {
          await core.saveJamAbsen({ masuk: jamMasukEl.value, pulang: jamPulangEl.value });
        } finally {
          btnJam.disabled = false;
        }
      });
    }
  });
})();
