    /* ════ DOM HELPERS ════
       Kumpulan helper untuk manipulasi DOM yang berulang di seluruh modul.
       Menggantikan pola-pola seperti:
         document.getElementById('x').textContent = val
         el.style.display = 'none' / 'block'
         el.classList.add/remove/toggle
    */

    /**
     * Shorthand untuk document.getElementById — sudah ada di helpers.js ($),
     * tapi didefinisikan ulang di sini sebagai referensi eksplisit untuk dom.*
     * @param {string} id - Element ID
     * @returns {HTMLElement|null}
     */
    const dom = {

      /**
       * Set textContent sebuah elemen berdasarkan ID.
       * @param {string} id
       * @param {string|number} value
       */
      setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
      },

      /**
       * Set innerHTML sebuah elemen berdasarkan ID.
       * @param {string} id
       * @param {string} html
       */
      setHTML(id, html) {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
      },

      /**
       * Tampilkan elemen (default: display block).
       * @param {string} id
       * @param {string} [display='block']
       */
      show(id, display = 'block') {
        const el = document.getElementById(id);
        if (el) el.style.display = display;
      },

      /**
       * Sembunyikan elemen (display: none).
       * @param {string} id
       */
      hide(id) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      },

      /**
       * Toggle visibility berdasarkan kondisi boolean.
       * @param {string} id
       * @param {boolean} condition - true = tampilkan, false = sembunyikan
       * @param {string} [display='block']
       */
      toggle(id, condition, display = 'block') {
        const el = document.getElementById(id);
        if (el) el.style.display = condition ? display : 'none';
      },

      /**
       * Tambah class ke elemen.
       * @param {string} id
       * @param {string} cls
       */
      addClass(id, cls) {
        document.getElementById(id)?.classList.add(cls);
      },

      /**
       * Hapus class dari elemen.
       * @param {string} id
       * @param {string} cls
       */
      removeClass(id, cls) {
        document.getElementById(id)?.classList.remove(cls);
      },

      /**
       * Toggle class pada elemen.
       * @param {string} id
       * @param {string} cls
       * @param {boolean} [force] - Jika disertakan, acts as add (true) atau remove (false)
       */
      toggleClass(id, cls, force) {
        document.getElementById(id)?.classList.toggle(cls, force);
      },

      /**
       * Set disabled state tombol.
       * @param {string} id
       * @param {boolean} state
       */
      setDisabled(id, state) {
        const el = document.getElementById(id);
        if (el) el.disabled = state;
      },

      /**
       * Tampilkan shimmer/skeleton loading di dalam elemen.
       * Menggantikan shimmerRows() yang hanya return string.
       * @param {string} id - ID container
       * @param {number} [count=3] - Jumlah baris shimmer
       */
      shimmer(id, count = 3) {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = Array(count).fill(`
          <div class="sh-row">
            <div class="shimmer sh-circ"></div>
            <div class="sh-lines">
              <div class="shimmer sh-line" style="width:60%"></div>
              <div class="shimmer sh-line" style="width:40%"></div>
            </div>
          </div>`).join('');
      },

      /**
       * Render empty state di dalam container.
       * @param {string} id
       * @param {string} [icon='📭']
       * @param {string} [text='Tidak ada data']
       * @param {string} [sub='']
       */
      emptyState(id, icon = '📭', text = 'Tidak ada data', sub = '') {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">${icon}</div>
            <div class="empty-text">${text}</div>
            ${sub ? `<div class="empty-sub">${sub}</div>` : ''}
          </div>`;
      },

      /**
       * Render error state di dalam container.
       * @param {string} id
       * @param {string} [msg='Gagal memuat data']
       */
      errorState(id, msg = 'Gagal memuat data') {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">🔌</div>
            <div class="empty-text">${msg}</div>
          </div>`;
      },

      /**
       * Set tombol ke mode loading (spinner + disable).
       * Kembalikan fungsi restore untuk mengembalikan state awal.
       * @param {string} id
       * @param {string} [loadingText='Memproses...']
       * @returns {() => void} restore function
       */
      btnLoading(id, loadingText = 'Memproses...') {
        const el = document.getElementById(id);
        if (!el) return () => {};
        const original = el.innerHTML;
        el.disabled = true;
        el.innerHTML = `<span class="spin-sm"></span> ${loadingText}`;
        return () => {
          el.disabled = false;
          el.innerHTML = original;
        };
      },

      /**
       * Cek apakah elemen ada dan visible.
       * @param {string} id
       * @returns {boolean}
       */
      isVisible(id) {
        const el = document.getElementById(id);
        return !!(el && el.style.display !== 'none' && el.offsetParent !== null);
      },
    };
