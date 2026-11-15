/**
 * Absensi v2 - Riwayat & Log Kehadiran Controller
 */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    if (!window.AbsensiApp) return;

    const logs = window.AbsensiApp.logs;
    const container = document.querySelector('.space-y-3, .space-y-space-sm, [class*="space-y"]') || document.querySelector('main');
    if (!container) return;

    // Filter Buttons
    let currentFilter = 'ALL';
    const filterButtons = document.querySelectorAll('button');
    filterButtons.forEach(btn => {
      const text = btn.textContent.toLowerCase().trim();
      if (text.includes('semua') || text.includes('hadir') || text.includes('terlambat') || text.includes('izin')) {
        btn.onclick = function (e) {
          e.preventDefault();
          filterButtons.forEach(b => b.classList.remove('bg-primary', 'text-white'));
          btn.classList.add('bg-primary', 'text-white');

          if (text.includes('semua')) currentFilter = 'ALL';
          else if (text.includes('hadir')) currentFilter = 'TEPAT WAKTU';
          else if (text.includes('terlambat')) currentFilter = 'TERLAMBAT';
          else if (text.includes('izin')) currentFilter = 'IZIN';

          renderLogList();
        };
      }
    });

    function renderLogList() {
      const listContainer = document.getElementById('dynamicLogContainer') || container;
      const filtered = logs.filter(log => {
        if (currentFilter === 'ALL') return true;
        return log.inStatus === currentFilter;
      });

      // If we don't have dedicated container, create one
      let wrapper = document.getElementById('dynamicLogContainer');
      if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.id = 'dynamicLogContainer';
        wrapper.className = 'space-y-3 pt-2';
        container.appendChild(wrapper);
      }

      wrapper.innerHTML = filtered.map(log => {
        const isLate = log.inStatus === 'TERLAMBAT';
        const badgeColor = isLate ? 'bg-error-container text-on-error-container' : 'bg-secondary-fixed text-on-secondary-fixed';
        const icon = isLate ? 'alarm_on' : 'check_circle';

        return `
          <div class="bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-surface-container flex items-center justify-between">
            <div class="flex items-center space-x-3.5">
              <div class="w-11 h-11 rounded-xl ${isLate ? 'bg-error-container/40 text-error' : 'bg-secondary-fixed/50 text-secondary'} flex items-center justify-center flex-shrink-0">
                <span class="material-symbols-outlined text-[22px]">${icon}</span>
              </div>
              <div>
                <div class="flex items-center space-x-2">
                  <span class="font-title-md text-title-md font-bold text-on-surface">${log.dateDisplay || log.date}</span>
                  <span class="font-label-sm text-label-sm ${badgeColor} font-bold px-2 py-0.5 rounded-full">${log.inStatus || 'HADIR'}</span>
                </div>
                <p class="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                  Masuk: <strong>${log.inTime || '--:--'}</strong> • Pulang: <strong>${log.outTime || '--:--'}</strong> • Jarak ~${log.inDistance || 12}m
                </p>
              </div>
            </div>
            <a href="e-slip.html" class="p-2 rounded-xl text-primary hover:bg-surface-container transition-colors" title="Lihat E-Slip">
              <span class="material-symbols-outlined text-[20px]">chevron_right</span>
            </a>
          </div>
        `;
      }).join('');
    }

    renderLogList();
  });
})();
