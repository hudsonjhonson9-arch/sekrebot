/**
 * Dynamic Island Notification System for HADIR BAPPERIDA (absensi-STICH)
 * iOS-style morphing glass capsule notification & alert engine
 *
 * Provides:
 * - window.DynamicIsland.show({ title, message, type, duration, confirmText, cancelText, ... })
 * - window.DynamicIsland.success(title, message, duration)
 * - window.DynamicIsland.error(title, message, duration)
 * - window.DynamicIsland.warning(title, message, duration)
 * - window.DynamicIsland.info(title, message, duration)
 * - window.DynamicIsland.loading(title, message)
 * - window.DynamicIsland.confirm(title, message, options)
 * - window.DynamicIsland.dismiss()
 *
 * Universal Interception:
 * - Auto-routes Swal.fire, Swal.showLoading, Swal.close
 * - Auto-routes window.showToast
 * - Replaces window.alert with non-blocking elegant Island alerts
 */

(function () {
  'use strict';

  // Prevent duplicate initialization
  if (window.DynamicIsland && window.DynamicIsland.__initialized) {
    return;
  }

  // --- STYLES & KEYFRAMES ---
  const islandStyle = document.createElement('style');
  islandStyle.id = 'dynamic-island-styles';
  islandStyle.textContent = `
    #dynamic-island-root {
      position: fixed;
      top: 14px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999999;
      pointer-events: none;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      width: 100%;
      max-width: 100vw;
      padding: 0 16px;
      perspective: 1000px;
      font-family: 'Plus Jakarta Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .di-capsule {
      pointer-events: auto;
      position: relative;
      background: rgba(10, 14, 23, 0.92);
      backdrop-filter: blur(24px) saturate(200%);
      -webkit-backdrop-filter: blur(24px) saturate(200%);
      border: 1px solid rgba(255, 255, 255, 0.14);
      box-shadow: 
        0 20px 48px -12px rgba(0, 0, 0, 0.75),
        0 8px 20px -6px rgba(0, 0, 0, 0.4),
        0 0 0 1px rgba(255, 255, 255, 0.08) inset,
        0 1px 2px 0 rgba(255, 255, 255, 0.25) inset;
      color: #FFFFFF;
      border-radius: 9999px;
      padding: 10px 18px;
      min-width: 180px;
      max-width: min(440px, calc(100vw - 32px));
      display: flex;
      flex-direction: column;
      overflow: hidden;
      cursor: pointer;
      user-select: none;
      transform-origin: top center;
      opacity: 0;
      transform: translateY(-24px) scale(0.85);
      transition: 
        transform 0.42s cubic-bezier(0.175, 0.885, 0.32, 1.25),
        opacity 0.28s ease,
        border-radius 0.35s cubic-bezier(0.16, 1, 0.3, 1),
        max-width 0.35s cubic-bezier(0.16, 1, 0.3, 1),
        padding 0.35s cubic-bezier(0.16, 1, 0.3, 1),
        background 0.3s ease;
    }

    .di-capsule.di-active {
      opacity: 1;
      transform: translateY(0) scale(1);
    }

    .di-capsule.di-expanded {
      border-radius: 26px;
      padding: 14px 18px;
    }

    .di-capsule.di-interactive {
      border-radius: 28px;
      padding: 16px 20px;
      cursor: default;
    }

    .di-capsule.di-exiting {
      opacity: 0;
      transform: translateY(-24px) scale(0.8);
      transition: transform 0.28s cubic-bezier(0.4, 0, 1, 1), opacity 0.24s ease;
    }

    .di-main-row {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
    }

    /* Status indicator icons */
    .di-icon-badge {
      flex-shrink: 0;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      transition: all 0.3s ease;
    }

    .di-icon-badge::after {
      content: '';
      position: absolute;
      inset: -2px;
      border-radius: 50%;
      opacity: 0.4;
      animation: di-pulse 2.2s infinite ease-out;
    }

    @keyframes di-pulse {
      0% { transform: scale(1); opacity: 0.5; }
      50% { transform: scale(1.35); opacity: 0; }
      100% { transform: scale(1.35); opacity: 0; }
    }

    .di-type-error .di-icon-badge {
      background: rgba(239, 68, 68, 0.22);
      border: 1px solid rgba(239, 68, 68, 0.5);
      color: #F87171;
    }
    .di-type-error .di-icon-badge::after {
      background: rgba(239, 68, 68, 0.4);
    }

    .di-type-success .di-icon-badge {
      background: rgba(16, 185, 129, 0.22);
      border: 1px solid rgba(16, 185, 129, 0.5);
      color: #34D399;
    }
    .di-type-success .di-icon-badge::after {
      background: rgba(16, 185, 129, 0.4);
    }

    .di-type-warning .di-icon-badge {
      background: rgba(245, 158, 11, 0.22);
      border: 1px solid rgba(245, 158, 11, 0.5);
      color: #FBBF24;
    }
    .di-type-warning .di-icon-badge::after {
      background: rgba(245, 158, 11, 0.4);
    }

    .di-type-info .di-icon-badge {
      background: rgba(37, 99, 235, 0.22);
      border: 1px solid rgba(37, 99, 235, 0.5);
      color: #60A5FA;
    }
    .di-type-info .di-icon-badge::after {
      background: rgba(37, 99, 235, 0.4);
    }

    .di-type-loading .di-icon-badge {
      background: rgba(99, 102, 241, 0.2);
      border: 1px solid rgba(99, 102, 241, 0.4);
      color: #818CF8;
    }

    .di-spinner {
      width: 18px;
      height: 18px;
      border: 2.2px solid rgba(255, 255, 255, 0.2);
      border-top-color: #60A5FA;
      border-radius: 50%;
      animation: di-spin 0.75s linear infinite;
    }

    @keyframes di-spin {
      to { transform: rotate(360deg); }
    }

    /* Text contents */
    .di-text-content {
      display: flex;
      flex-direction: column;
      flex-grow: 1;
      min-width: 0;
      justify-content: center;
    }

    .di-title {
      font-size: 13.5px;
      font-weight: 700;
      color: #FFFFFF;
      letter-spacing: -0.01em;
      line-height: 1.25;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .di-message {
      font-size: 12.5px;
      font-weight: 500;
      color: rgba(226, 232, 240, 0.88);
      line-height: 1.4;
      margin-top: 3px;
      word-break: break-word;
    }

    .di-close-hint {
      flex-shrink: 0;
      font-size: 11px;
      font-weight: 600;
      color: rgba(148, 163, 184, 0.7);
      padding: 3px 7px;
      border-radius: 9999px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.08);
      margin-left: 4px;
      transition: all 0.2s;
    }

    .di-capsule:hover .di-close-hint {
      color: #FFFFFF;
      background: rgba(255, 255, 255, 0.12);
    }

    /* Action buttons in interactive confirmation mode */
    .di-actions-row {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 14px;
      padding-top: 10px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      width: 100%;
    }

    .di-btn {
      appearance: none;
      border: none;
      cursor: pointer;
      font-family: inherit;
      font-size: 12px;
      font-weight: 600;
      padding: 7px 16px;
      border-radius: 9999px;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      white-space: nowrap;
    }

    .di-btn-cancel {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #CBD5E1;
    }
    .di-btn-cancel:hover {
      background: rgba(255, 255, 255, 0.14);
      color: #FFFFFF;
    }

    .di-btn-confirm {
      background: #2563EB;
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #FFFFFF;
      box-shadow: 0 4px 14px rgba(37, 99, 235, 0.45);
    }
    .di-btn-confirm:hover {
      background: #1D4ED8;
      box-shadow: 0 6px 18px rgba(37, 99, 235, 0.6);
      transform: translateY(-1px);
    }

    .di-btn-danger {
      background: #DC2626;
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #FFFFFF;
      box-shadow: 0 4px 14px rgba(220, 38, 38, 0.45);
    }
    .di-btn-danger:hover {
      background: #B91C1C;
      box-shadow: 0 6px 18px rgba(220, 38, 38, 0.6);
      transform: translateY(-1px);
    }

    /* Progress bar indicator */
    .di-progress-bar {
      position: absolute;
      bottom: 0;
      left: 16px;
      right: 16px;
      height: 2px;
      background: rgba(255, 255, 255, 0.06);
      border-radius: 9999px;
      overflow: hidden;
    }
    .di-progress-fill {
      height: 100%;
      background: rgba(255, 255, 255, 0.4);
      border-radius: 9999px;
      transform-origin: left;
      animation: di-progress-drain linear forwards;
    }

    @keyframes di-progress-drain {
      from { transform: scaleX(1); }
      to { transform: scaleX(0); }
    }

    /* Subtle shake on error */
    .di-shake {
      animation: di-island-shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
    }

    @keyframes di-island-shake {
      10%, 90% { transform: translateY(0) translateX(-3px); }
      20%, 80% { transform: translateY(0) translateX(3px); }
      30%, 50%, 70% { transform: translateY(0) translateX(-4px); }
      40%, 60% { transform: translateY(0) translateX(4px); }
    }
  `;
  document.head.appendChild(islandStyle);

  // SVG Icons
  const ICONS = {
    error: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    success: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="16 9 10 15 7 12"/></svg>`,
    warning: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    info: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    question: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    lock: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
    user: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`
  };

  class DynamicIslandManager {
    constructor() {
      this.__initialized = true;
      this.root = null;
      this.capsule = null;
      this.timerId = null;
      this.currentResolve = null;
    }

    ensureRoot() {
      // Script bisa dimuat di <head> (body belum ada) - root dibuat lazy saat show()
      if (!document.body) return;
      if (!this.root || !document.body.contains(this.root)) {
        this.root = document.createElement('div');
        this.root.id = 'dynamic-island-root';
        document.body.appendChild(this.root);
      }
    }

    // Play subtle audio cue if permitted
    playHaptic(type) {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;
        if (type === 'error') {
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(220, now);
          osc.frequency.setValueAtTime(160, now + 0.08);
          gain.gain.setValueAtTime(0.08, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
          osc.start(now);
          osc.stop(now + 0.22);
        } else if (type === 'success') {
          osc.type = 'sine';
          osc.frequency.setValueAtTime(587.33, now); // D5
          osc.frequency.setValueAtTime(880, now + 0.08);   // A5
          gain.gain.setValueAtTime(0.08, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
          osc.start(now);
          osc.stop(now + 0.25);
        } else {
          osc.type = 'sine';
          osc.frequency.setValueAtTime(440, now);
          gain.gain.setValueAtTime(0.05, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
          osc.start(now);
          osc.stop(now + 0.15);
        }
      } catch (_) {
        // Audio policy or unsupported: fail silently
      }
    }

    dismiss() {
      if (this.timerId) {
        clearTimeout(this.timerId);
        this.timerId = null;
      }
      if (this.capsule) {
        const el = this.capsule;
        this.capsule = null;
        el.classList.remove('di-active', 'di-shake');
        el.classList.add('di-exiting');
        setTimeout(() => {
          if (el.parentNode) el.parentNode.removeChild(el);
        }, 300);
      }
      if (this.currentResolve) {
        const res = this.currentResolve;
        this.currentResolve = null;
        res({ isConfirmed: false, isDismissed: true });
      }
    }

    show(options = {}) {
      this.ensureRoot();

      let title = '';
      let message = '';
      let type = 'info';
      let duration = 4000;
      let interactive = false;
      let confirmText = 'Lanjutkan';
      let cancelText = 'Batal';
      let isDanger = false;
      let customIcon = null;

      if (typeof options === 'string') {
        message = options;
      } else {
        title = options.title || '';
        message = options.message || options.text || options.html || '';
        type = options.type || options.icon || 'info';
        duration = options.duration !== undefined ? options.duration : (options.timer !== undefined ? options.timer : 4000);
        interactive = Boolean(options.showCancelButton || options.interactive);
        confirmText = options.confirmButtonText || options.confirmText || 'Lanjutkan';
        cancelText = options.cancelButtonText || options.cancelText || 'Batal';
        isDanger = options.isDanger || options.confirmButtonColor === '#ef4444' || options.confirmButtonColor === '#dc2626';
        customIcon = options.customIcon || null;
      }

      // Map SweetAlert icons to Island types
      if (type === 'question') type = 'info';
      if (!['success', 'error', 'warning', 'info', 'loading'].includes(type)) {
        type = 'info';
      }

      // Format clean title if missing
      if (!title && message) {
        if (type === 'error') title = 'Terjadi Kesalahan';
        else if (type === 'success') title = 'Berhasil';
        else if (type === 'warning') title = 'Perhatian';
        else if (type === 'info') title = 'Informasi';
        else if (type === 'loading') title = 'Memproses...';
      }

      // Clean HTML tags from title if present
      const cleanTitle = String(title).replace(/<[^>]+>/g, '').trim();

      // Dismiss existing timer
      if (this.timerId) {
        clearTimeout(this.timerId);
        this.timerId = null;
      }

      return new Promise((resolve) => {
        this.currentResolve = resolve;

        // Existing capsule re-use or create new
        let el = this.capsule;
        const isNew = !el;

        if (isNew) {
          el = document.createElement('div');
          this.root.appendChild(el);
          this.capsule = el;
        }

        // Reset classes
        el.className = `di-capsule di-type-${type}`;
        if (message && message.length > 36 || interactive) {
          el.classList.add('di-expanded');
        }
        if (interactive) {
          el.classList.add('di-interactive');
        }

        // Icon markup
        let iconHtml = '';
        if (type === 'loading') {
          iconHtml = `<div class="di-spinner"></div>`;
        } else if (customIcon) {
          iconHtml = customIcon;
        } else {
          iconHtml = ICONS[type] || ICONS.info;
        }

        // Action buttons markup
        let actionsHtml = '';
        if (interactive) {
          const confirmClass = isDanger ? 'di-btn di-btn-danger' : 'di-btn di-btn-confirm';
          actionsHtml = `
            <div class="di-actions-row">
              <button class="di-btn di-btn-cancel" id="di-btn-cancel">${cancelText}</button>
              <button class="${confirmClass}" id="di-btn-confirm">${confirmText}</button>
            </div>
          `;
        }

        // Progress bar for auto-dismiss
        let progressHtml = '';
        if (!interactive && duration > 0 && type !== 'loading') {
          progressHtml = `
            <div class="di-progress-bar">
              <div class="di-progress-fill" style="animation-duration: ${duration}ms;"></div>
            </div>
          `;
        }

        // Assemble Inner HTML
        el.innerHTML = `
          <div class="di-main-row">
            <div class="di-icon-badge">${iconHtml}</div>
            <div class="di-text-content">
              <div class="di-title">${cleanTitle}</div>
              ${message ? `<div class="di-message">${message}</div>` : ''}
            </div>
            ${!interactive ? `<div class="di-close-hint">Tutup</div>` : ''}
          </div>
          ${actionsHtml}
          ${progressHtml}
        `;

        // Click / Swipe to dismiss handler
        if (!interactive) {
          el.onclick = () => this.dismiss();
        } else {
          const btnCancel = el.querySelector('#di-btn-cancel');
          const btnConfirm = el.querySelector('#di-btn-confirm');
          if (btnCancel) {
            btnCancel.onclick = (e) => {
              e.stopPropagation();
              this.dismiss();
              resolve({ isConfirmed: false, isDismissed: true });
            };
          }
          if (btnConfirm) {
            btnConfirm.onclick = (e) => {
              e.stopPropagation();
              this.dismiss();
              resolve({ isConfirmed: true });
            };
          }
        }

        // Trigger entrance animation
        requestAnimationFrame(() => {
          el.classList.add('di-active');
          if (type === 'error') {
            el.classList.add('di-shake');
          }
        });

        this.playHaptic(type);

        // Auto dismiss timer
        if (!interactive && duration > 0 && type !== 'loading') {
          this.timerId = setTimeout(() => {
            this.dismiss();
            resolve({ isConfirmed: true });
          }, duration);
        }
      });
    }

    success(title, message, duration) {
      return this.show({ title, message, type: 'success', duration });
    }

    error(title, message, duration) {
      return this.show({ title, message, type: 'error', duration });
    }

    warning(title, message, duration) {
      return this.show({ title, message, type: 'warning', duration });
    }

    info(title, message, duration) {
      return this.show({ title, message, type: 'info', duration });
    }

    loading(title, message) {
      return this.show({ title: title || 'Memproses...', message, type: 'loading', duration: 0 });
    }

    confirm(title, message, options = {}) {
      return this.show({
        title,
        message,
        type: options.icon || options.type || 'warning',
        interactive: true,
        confirmText: options.confirmButtonText || options.confirmText || 'Ya, Lanjutkan',
        cancelText: options.cancelButtonText || options.cancelText || 'Batal',
        isDanger: options.isDanger || options.confirmButtonColor === '#ef4444' || options.confirmButtonColor === '#dc2626'
      });
    }
  }

  // Instantiate singleton
  const manager = new DynamicIslandManager();
  window.DynamicIsland = manager;

  // Global helper functions
  window.showToast = function (msg, type = 'info', duration = 3500) {
    let t = type;
    if (type === 'danger') t = 'error';
    return manager.show({ title: '', message: msg, type: t, duration });
  };

  window.showNotification = function (title, msg, type = 'info', duration = 4000) {
    return manager.show({ title, message: msg, type, duration });
  };

  // Replace default blocking alert() with non-blocking Dynamic Island
  const nativeAlert = window.alert;
  window.alert = function (message) {
    if (!message) return;
    const isError = /gagal|error|salah|tolak|wajib/i.test(String(message));
    const isSuccess = /berhasil|sukses|tersimpan|selesai/i.test(String(message));
    const type = isError ? 'error' : (isSuccess ? 'success' : 'info');
    const title = isError ? 'Peringatan' : (isSuccess ? 'Berhasil' : 'Perhatian');
    manager.show({ title, message: String(message), type, duration: 4500 });
  };


  // Intersepsi SweetAlert2: tahan terhadap urutan pemuatan (Swal bisa muncul setelah script ini)
  function toIslandOpts(args) {
    if (args.length === 1 && args[0] && typeof args[0] === 'object') return args[0];
    return { title: args[0], text: args[1], icon: args[2] || 'info' };
  }

  function hookSwal(S) {
    if (!S || S.__islandHooked) return;
    S.__islandHooked = true;
    const origFire = S.fire;
    S.fire = function (...args) {
      if (args.length === 0) return Promise.resolve({ isConfirmed: true });
      const opts = toIslandOpts(args);
      // Dialog berisi input/form/preConfirm atau konten HTML kaya tetap pakai SweetAlert asli
      const isRichHtml = typeof opts.html === 'string' && (opts.html.length > 120 || /<(table|ul|ol|section|header|div\b[^>]*class)/i.test(opts.html) || opts.isRichModal);
      const needsForm = opts.input || typeof opts.preConfirm === 'function' || opts.imageUrl || isRichHtml ||
        (typeof opts.html === 'string' && /<(input|select|textarea|form)\b/i.test(opts.html));
      if (needsForm && origFire) return origFire.apply(this, args);
      // Dialog "Memuat/Menyimpan..." (didOpen -> Swal.showLoading()) jadi kapsul loading
      if (typeof opts.didOpen === 'function' && !opts.showCancelButton && !opts.showConfirmButton) {
        manager.loading(String(opts.title || 'Memproses...').replace(/<[^>]+>/g, ''), opts.text || '');
        return Promise.resolve({ isConfirmed: false });
      }
      return manager.show(opts);
    };
    S.showLoading = function () { manager.loading('Memproses...', 'Mohon tunggu sebentar'); };
    S.hideLoading = function () { manager.dismiss(); };
    S.close = function () { manager.dismiss(); };
    S.isVisible = function () { return !!manager.capsule; };
  }

  let _swal = window.Swal;
  if (_swal) {
    hookSwal(_swal);
  } else {
    // Swal belum dimuat: hook begitu di-assign oleh sweetalert2
    try {
      Object.defineProperty(window, 'Swal', {
        configurable: true,
        get() { return _swal; },
        set(v) { _swal = v; hookSwal(v); }
      });
    } catch (_) {}
  }
  const rehook = () => hookSwal(window.Swal);
  document.addEventListener('DOMContentLoaded', rehook);
  window.addEventListener('load', rehook);

  console.log('[DynamicIsland] Aktif: Swal.fire, alert() dan showToast dialihkan ke kapsul.');
})();
