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
    if (!core || !lat || !lon || !rad || !btn) return;

    let locId = '1';
    const showRadius = () => { if (label) label.textContent = rad.value + ' Meter'; };

    try {
      const { locations } = await core.loadLokasi();
      const loc = locations[0];
      if (loc) {
        locId = String(loc.id);
        lat.value = loc.latitude;
        lon.value = loc.longitude;
        rad.value = loc.radius || rad.value;
      }
    } catch (err) {
      console.warn('[admin] gagal memuat lokasi dari database:', err.message);
    }
    showRadius();
    rad.addEventListener('input', showRadius);

    btn.addEventListener('click', async function () {
      btn.disabled = true;
      try {
        await core.saveLokasi({ id: locId, lat: lat.value, lon: lon.value, radius: rad.value });
      } finally {
        btn.disabled = false;
      }
    });
  });
})();
