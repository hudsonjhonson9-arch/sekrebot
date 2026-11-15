/**
 * Absensi v2 - Panel Administrator Controller
 */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    if (!window.AbsensiApp) return;

    const config = window.AbsensiApp.config;

    // Load initial values into inputs if present
    const latInput = document.querySelector('input[placeholder*="Lat"], input[name*="lat"]');
    const lonInput = document.querySelector('input[placeholder*="Lon"], input[name*="lon"]');
    const radiusInput = document.querySelector('input[placeholder*="Radius"], input[name*="radius"]');

    if (latInput) latInput.value = config.lat;
    if (lonInput) lonInput.value = config.lon;
    if (radiusInput) radiusInput.value = config.radiusMeters;

    // Save Settings
    document.querySelectorAll('button').forEach(btn => {
      const text = btn.textContent.toLowerCase();
      if (text.includes('simpan') || text.includes('update') || text.includes('terapkan')) {
        btn.onclick = function (e) {
          e.preventDefault();
          const newLat = latInput ? parseFloat(latInput.value) : config.lat;
          const newLon = lonInput ? parseFloat(lonInput.value) : config.lon;
          const newRad = radiusInput ? parseInt(radiusInput.value, 10) : config.radiusMeters;

          window.AbsensiApp.saveConfig({
            lat: newLat,
            lon: newLon,
            radiusMeters: newRad
          });
        };
      }
    });
  });
})();
