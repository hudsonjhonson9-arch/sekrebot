/* ════ STITCH CUSTOM PICKERS (Dropdown, Date, Time) ════
 * Reusable, lightweight custom UI pickers replacing native <select>,
 * <input type="date">, and <input type="time"> while preserving original
 * element IDs, .value getters/setters, and change events.
 */
(function (global) {
  'use strict';

  const MONTHS_ID_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const MONTHS_ID_FULL = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  const WEEKDAYS_ID = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

  const LAYOUT_CLASS_RE = /^(col-span-\d+|sm:col-span-\d+|md:col-span-\d+|lg:col-span-\d+|flex-1|shrink-0|mt-\S+|mb-\S+|w-full)$/;

  const registry = {
    selects: new Map(),
    dates: new Map(),
    times: new Map()
  };

  let activePicker = null; // { id, panel, trigger, cleanup }
  let stylesInjected = false;

  function injectStyles() {
    if (stylesInjected || document.getElementById('stitch-picker-styles')) {
      stylesInjected = true;
      return;
    }
    const style = document.createElement('style');
    style.id = 'stitch-picker-styles';
    style.textContent = `
      .stitch-picker-portal {
        font-family: 'Plus Jakarta Sans', sans-serif;
        animation: stitchPickerPop 140ms cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes stitchPickerPop {
        from { opacity: 0; transform: translateY(-4px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .stitch-picker-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
      .stitch-picker-scroll::-webkit-scrollbar-thumb {
        background: rgba(148, 163, 184, 0.45);
        border-radius: 9999px;
      }
      .stitch-picker-scroll::-webkit-scrollbar-track { background: transparent; }
    `;
    document.head.appendChild(style);
    stylesInjected = true;
  }

  function resolveElement(target) {
    if (!target) return null;
    if (typeof target === 'string') return document.getElementById(target);
    if (target instanceof Element) return target;
    return null;
  }

  function extractLayoutClasses(el) {
    const classes = [];
    if (el && el.classList) {
      el.classList.forEach((cls) => {
        if (LAYOUT_CLASS_RE.test(cls)) classes.push(cls);
      });
    }
    if (!classes.some((c) => c === 'w-full' || c.startsWith('col-span-') || c === 'flex-1')) {
      classes.push('w-full');
    }
    return classes;
  }

  function hookValueProperty(el, proto, onSet) {
    if (el.dataset.stitchValueHooked === '1') return;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (!desc || !desc.get || !desc.set) return;

    Object.defineProperty(el, 'value', {
      configurable: true,
      enumerable: true,
      get() {
        return desc.get.call(this);
      },
      set(val) {
        const next = val == null ? '' : String(val);
        desc.set.call(this, next);
        onSet(next);
      }
    });
    el.dataset.stitchValueHooked = '1';
  }

  function dispatchChange(el) {
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setTriggerActive(trigger, isActive) {
    if (!trigger) return;
    if (isActive) {
      trigger.classList.add('border-blue-500', 'ring-2', 'ring-blue-500/20');
      trigger.setAttribute('aria-expanded', 'true');
    } else {
      trigger.classList.remove('border-blue-500', 'ring-2', 'ring-blue-500/20');
      trigger.setAttribute('aria-expanded', 'false');
    }
    const arrow = trigger.querySelector('[data-stitch-arrow]');
    if (arrow) {
      arrow.classList.toggle('rotate-180', isActive);
    }
  }

  function positionPortal(panel, trigger, preferredWidth, maxHeight) {
    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 12;

    const width = Math.min(Math.max(rect.width, preferredWidth), vw - margin * 2);
    panel.style.width = width + 'px';

    let left = rect.left;
    if (left + width > vw - margin) left = vw - width - margin;
    if (left < margin) left = margin;

    const spaceBelow = vh - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const measuredH = Math.min(panel.offsetHeight || maxHeight, maxHeight);

    let top;
    if (spaceBelow >= measuredH || spaceBelow >= spaceAbove) {
      top = rect.bottom + 6;
      if (top + measuredH > vh - margin) {
        top = Math.max(margin, vh - measuredH - margin);
      }
    } else {
      top = Math.max(margin, rect.top - measuredH - 6);
    }

    panel.style.left = Math.round(left) + 'px';
    panel.style.top = Math.round(top) + 'px';
  }

  function closeAll() {
    if (!activePicker) return;
    const current = activePicker;
    activePicker = null;
    setTriggerActive(current.trigger, false);
    if (current.panel && current.panel.parentNode) {
      current.panel.parentNode.removeChild(current.panel);
    }
    if (typeof current.cleanup === 'function') {
      current.cleanup();
    }
  }

  function handleGlobalPointerDown(e) {
    if (!activePicker) return;
    if (activePicker.panel.contains(e.target) || activePicker.trigger.contains(e.target)) {
      return;
    }
    closeAll();
  }

  function handleGlobalKeyDown(e) {
    if (e.key === 'Escape' && activePicker) {
      const trigger = activePicker.trigger;
      closeAll();
      if (trigger) trigger.focus();
    }
  }

  document.addEventListener('pointerdown', handleGlobalPointerDown, true);
  document.addEventListener('keydown', handleGlobalKeyDown);
  window.addEventListener('resize', closeAll);

  function createIcon(name, extraClass) {
    const span = document.createElement('span');
    span.className = 'material-symbols-outlined ' + (extraClass || '');
    span.textContent = name;
    return span;
  }

  function createTriggerButton(leadIconName) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.className = [
      'w-full min-h-[44px] px-3 py-2 rounded-xl',
      'bg-slate-50 dark:bg-slate-800',
      'border border-slate-200 dark:border-slate-700 hover:border-blue-500',
      'text-xs font-semibold text-slate-900 dark:text-white',
      'flex items-center justify-between gap-2 text-left',
      'transition-all cursor-pointer focus:outline-none'
    ].join(' ');

    const leftWrap = document.createElement('span');
    leftWrap.className = 'flex items-center gap-2 min-w-0 flex-1';

    if (leadIconName) {
      const lead = createIcon(leadIconName, 'text-[18px] text-blue-600 dark:text-blue-400 shrink-0');
      leftWrap.appendChild(lead);
    }

    const label = document.createElement('span');
    label.className = 'truncate';
    leftWrap.appendChild(label);

    const arrow = createIcon('expand_more', 'text-[18px] text-slate-400 shrink-0 transition-transform duration-150');
    arrow.setAttribute('data-stitch-arrow', '1');

    btn.appendChild(leftWrap);
    btn.appendChild(arrow);
    return { btn, label };
  }

  /* ── 1. CUSTOM SELECT DROPDOWN ──────────────────────────────────── */

  function getSelectMeta(sel) {
    return registry.selects.get(sel) || null;
  }

  function getSelectedOptionText(sel) {
    const idx = sel.selectedIndex;
    if (idx >= 0 && sel.options[idx]) {
      return sel.options[idx].textContent.trim();
    }
    const found = Array.from(sel.options).find((o) => o.value === sel.value);
    return found ? found.textContent.trim() : '';
  }

  function updateSelectLabel(sel) {
    const meta = getSelectMeta(sel);
    if (!meta) return;
    const text = getSelectedOptionText(sel);
    const hasVal = sel.value !== '' && text !== '';
    meta.label.textContent = text || meta.opts.placeholder || 'Pilih opsi...';
    if (!hasVal) {
      meta.label.classList.add('text-slate-400', 'dark:text-slate-500');
      meta.label.classList.remove('text-slate-900', 'dark:text-white');
    } else {
      meta.label.classList.remove('text-slate-400', 'dark:text-slate-500');
      meta.label.classList.add('text-slate-900', 'dark:text-white');
    }
  }

  function renderSelectOptions(sel, listEl, query) {
    const q = (query || '').trim().toLowerCase();
    const options = Array.from(sel.options);
    const currentVal = sel.value;
    listEl.innerHTML = '';

    const filtered = options.filter((opt) => {
      if (!q) return true;
      return opt.textContent.toLowerCase().includes(q) || String(opt.value).toLowerCase().includes(q);
    });

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'px-3.5 py-4 text-center text-xs text-slate-400 dark:text-slate-500';
      empty.textContent = 'Tidak ada opsi yang cocok';
      listEl.appendChild(empty);
      return;
    }

    filtered.forEach((opt) => {
      const isSelected = opt.value === currentVal && (opt.selected || currentVal !== '');
      const item = document.createElement('button');
      item.type = 'button';
      item.disabled = opt.disabled;
      item.className = [
        'w-full min-h-[44px] px-3.5 py-2.5 text-left text-xs flex items-center justify-between gap-2 transition-colors',
        opt.disabled
          ? 'opacity-50 cursor-not-allowed text-slate-400'
          : isSelected
            ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold cursor-pointer'
            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 font-medium cursor-pointer'
      ].join(' ');

      const textSpan = document.createElement('span');
      textSpan.className = 'leading-snug break-words';
      textSpan.textContent = opt.textContent.trim();
      item.appendChild(textSpan);

      if (isSelected) {
        item.appendChild(createIcon('check', 'text-[18px] text-blue-600 dark:text-blue-400 shrink-0'));
      }

      if (!opt.disabled) {
        item.addEventListener('click', () => {
          const changed = sel.value !== opt.value;
          sel.value = opt.value;
          updateSelectLabel(sel);
          closeAll();
          if (changed) dispatchChange(sel);
        });
      }

      listEl.appendChild(item);
    });
  }

  function openSelectPanel(sel) {
    const meta = getSelectMeta(sel);
    if (!meta) return;

    if (activePicker && activePicker.id === meta.uid) {
      closeAll();
      return;
    }
    closeAll();

    const panel = document.createElement('div');
    panel.className = [
      'stitch-picker-portal fixed z-[9999] rounded-2xl shadow-xl',
      'bg-white dark:bg-slate-900',
      'border border-slate-200 dark:border-slate-700',
      'overflow-hidden flex flex-col'
    ].join(' ');

    const isSearchable = meta.opts.searchable === true || (meta.opts.searchable !== false && sel.options.length > 6);
    let searchInput = null;

    if (isSearchable) {
      const searchWrap = document.createElement('div');
      searchWrap.className = 'p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/90';

      const inputBox = document.createElement('div');
      inputBox.className = 'relative flex items-center';

      const icon = createIcon('search', 'text-[18px] text-slate-400 absolute left-3 pointer-events-none');
      searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.placeholder = 'Cari...';
      searchInput.className = [
        'w-full min-h-[44px] pl-9 pr-3 py-2 rounded-xl text-xs',
        'bg-white dark:bg-slate-800',
        'border border-slate-200 dark:border-slate-700',
        'text-slate-900 dark:text-white placeholder:text-slate-400',
        'focus:outline-none focus:border-blue-500'
      ].join(' ');

      inputBox.appendChild(icon);
      inputBox.appendChild(searchInput);
      searchWrap.appendChild(inputBox);
      panel.appendChild(searchWrap);
    }

    const listEl = document.createElement('div');
    listEl.setAttribute('role', 'listbox');
    listEl.className = 'stitch-picker-scroll max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800';
    panel.appendChild(listEl);

    renderSelectOptions(sel, listEl, '');
    meta.activeListEl = listEl;
    meta.activeSearchInput = searchInput;

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        renderSelectOptions(sel, listEl, searchInput.value);
      });
    }

    document.body.appendChild(panel);
    positionPortal(panel, meta.trigger, 230, 320);
    setTriggerActive(meta.trigger, true);

    const onScroll = (e) => {
      if (panel.contains(e.target)) return;
      positionPortal(panel, meta.trigger, 230, 320);
    };
    window.addEventListener('scroll', onScroll, true);

    activePicker = {
      id: meta.uid,
      panel,
      trigger: meta.trigger,
      cleanup: () => {
        window.removeEventListener('scroll', onScroll, true);
        meta.activeListEl = null;
        meta.activeSearchInput = null;
      }
    };

    if (searchInput && window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
      setTimeout(() => searchInput.focus(), 10);
    }
  }

  function enhanceSelect(target, opts) {
    injectStyles();
    const sel = resolveElement(target);
    if (!sel || sel.tagName !== 'SELECT') return null;

    const options = Object.assign({ placeholder: '', searchable: undefined }, opts || {});

    if (sel.dataset.stitchEnhanced === '1') {
      const existing = getSelectMeta(sel);
      if (existing) {
        existing.opts = Object.assign(existing.opts, options);
        refreshSelect(sel);
      }
      return existing ? existing.trigger : null;
    }

    sel.dataset.stitchEnhanced = '1';
    const layoutClasses = extractLayoutClasses(sel);
    sel.classList.add('hidden');

    const wrap = document.createElement('div');
    wrap.className = 'stitch-picker-wrap relative ' + layoutClasses.join(' ');
    wrap.setAttribute('data-stitch-for', sel.id || '');

    const { btn, label } = createTriggerButton(null);
    wrap.appendChild(btn);
    sel.insertAdjacentElement('afterend', wrap);

    const meta = {
      uid: 'sel_' + Math.random().toString(36).slice(2, 9),
      el: sel,
      wrap,
      trigger: btn,
      label,
      opts: options,
      activeListEl: null,
      activeSearchInput: null
    };
    registry.selects.set(sel, meta);

    btn.addEventListener('click', () => openSelectPanel(sel));

    hookValueProperty(sel, HTMLSelectElement.prototype, () => {
      updateSelectLabel(sel);
    });

    sel.addEventListener('change', () => updateSelectLabel(sel));

    const observer = new MutationObserver(() => {
      refreshSelect(sel);
    });
    observer.observe(sel, { childList: true, subtree: true, characterData: true, attributes: true });
    meta.observer = observer;

    updateSelectLabel(sel);
    return btn;
  }

  function refreshSelect(target) {
    const sel = resolveElement(target);
    if (!sel) return;
    const meta = getSelectMeta(sel);
    if (!meta) return;
    updateSelectLabel(sel);
    if (meta.activeListEl) {
      const q = meta.activeSearchInput ? meta.activeSearchInput.value : '';
      renderSelectOptions(sel, meta.activeListEl, q);
    }
  }

  /* ── 2. CUSTOM DATE PICKER ──────────────────────────────────────── */

  function parseIsoDate(str) {
    if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
    const parts = str.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    if (d.getFullYear() !== parts[0] || d.getMonth() !== parts[1] - 1 || d.getDate() !== parts[2]) {
      return null;
    }
    return { year: parts[0], month: parts[1] - 1, day: parts[2] };
  }

  function toIsoDate(year, month, day) {
    return (
      String(year).padStart(4, '0') + '-' +
      String(month + 1).padStart(2, '0') + '-' +
      String(day).padStart(2, '0')
    );
  }

  function formatDateDisplay(isoStr) {
    const parsed = parseIsoDate(isoStr);
    if (!parsed) return '';
    return parsed.day + ' ' + MONTHS_ID_SHORT[parsed.month] + ' ' + parsed.year;
  }

  function updateDateLabel(inp) {
    const meta = registry.dates.get(inp);
    if (!meta) return;
    const formatted = formatDateDisplay(inp.value);
    if (formatted) {
      meta.label.textContent = formatted;
      meta.label.classList.remove('text-slate-400', 'dark:text-slate-500');
      meta.label.classList.add('text-slate-900', 'dark:text-white');
    } else {
      meta.label.textContent = meta.opts.placeholder || 'Pilih tanggal';
      meta.label.classList.add('text-slate-400', 'dark:text-slate-500');
      meta.label.classList.remove('text-slate-900', 'dark:text-white');
    }
  }

  function openDatePanel(inp) {
    const meta = registry.dates.get(inp);
    if (!meta) return;

    if (activePicker && activePicker.id === meta.uid) {
      closeAll();
      return;
    }
    closeAll();

    const now = new Date();
    const todayIso = toIsoDate(now.getFullYear(), now.getMonth(), now.getDate());
    const parsed = parseIsoDate(inp.value);
    let viewYear = parsed ? parsed.year : now.getFullYear();
    let viewMonth = parsed ? parsed.month : now.getMonth();

    const panel = document.createElement('div');
    panel.className = [
      'stitch-picker-portal fixed z-[9999] rounded-2xl shadow-xl',
      'bg-white dark:bg-slate-900',
      'border border-slate-200 dark:border-slate-700',
      'p-3 w-[min(340px,calc(100vw-24px))]'
    ].join(' ');

    function selectDay(iso) {
      const changed = inp.value !== iso;
      inp.value = iso;
      updateDateLabel(inp);
      closeAll();
      if (changed) dispatchChange(inp);
    }

    function renderCalendar() {
      panel.innerHTML = '';

      // Header: Prev | Month & Year Selectors | Next
      const header = document.createElement('div');
      header.className = 'flex items-center justify-between gap-1 mb-2';

      const prevBtn = document.createElement('button');
      prevBtn.type = 'button';
      prevBtn.setAttribute('aria-label', 'Bulan sebelumnya');
      prevBtn.className = 'min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors';
      prevBtn.appendChild(createIcon('chevron_left', 'text-[20px]'));
      prevBtn.addEventListener('click', () => {
        viewMonth -= 1;
        if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
        renderCalendar();
      });

      const titleWrap = document.createElement('div');
      titleWrap.className = 'flex items-center gap-1 min-w-0';

      const monthBtn = document.createElement('button');
      monthBtn.type = 'button';
      monthBtn.className = 'min-h-[44px] px-2.5 rounded-xl text-xs font-bold text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors';
      monthBtn.textContent = MONTHS_ID_FULL[viewMonth];
      monthBtn.addEventListener('click', () => renderMonthGrid());

      const yearBtn = document.createElement('button');
      yearBtn.type = 'button';
      yearBtn.className = 'min-h-[44px] px-2.5 rounded-xl text-xs font-mono font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 cursor-pointer transition-colors';
      yearBtn.textContent = String(viewYear);
      yearBtn.addEventListener('click', () => renderYearGrid());

      titleWrap.appendChild(monthBtn);
      titleWrap.appendChild(yearBtn);

      const nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.setAttribute('aria-label', 'Bulan berikutnya');
      nextBtn.className = 'min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors';
      nextBtn.appendChild(createIcon('chevron_right', 'text-[20px]'));
      nextBtn.addEventListener('click', () => {
        viewMonth += 1;
        if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
        renderCalendar();
      });

      header.appendChild(prevBtn);
      header.appendChild(titleWrap);
      header.appendChild(nextBtn);
      panel.appendChild(header);

      // Weekday labels
      const weekRow = document.createElement('div');
      weekRow.className = 'grid grid-cols-7 gap-1 mb-1';
      WEEKDAYS_ID.forEach((wd, i) => {
        const cell = document.createElement('div');
        cell.className = 'text-center text-[10px] font-bold py-1 ' + (i >= 5 ? 'text-rose-500/80' : 'text-slate-400 dark:text-slate-500');
        cell.textContent = wd;
        weekRow.appendChild(cell);
      });
      panel.appendChild(weekRow);

      // Days grid (Monday first)
      const grid = document.createElement('div');
      grid.className = 'grid grid-cols-7 gap-1';

      const firstDayDow = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
      const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
      const totalCells = Math.ceil((firstDayDow + daysInMonth) / 7) * 7;
      const selectedIso = inp.value;

      for (let i = 0; i < totalCells; i++) {
        let cellYear = viewYear;
        let cellMonth = viewMonth;
        let cellDay;
        let isOtherMonth = false;

        if (i < firstDayDow) {
          isOtherMonth = true;
          cellMonth = viewMonth - 1;
          if (cellMonth < 0) { cellMonth = 11; cellYear -= 1; }
          cellDay = prevMonthDays - firstDayDow + i + 1;
        } else if (i >= firstDayDow + daysInMonth) {
          isOtherMonth = true;
          cellMonth = viewMonth + 1;
          if (cellMonth > 11) { cellMonth = 0; cellYear += 1; }
          cellDay = i - (firstDayDow + daysInMonth) + 1;
        } else {
          cellDay = i - firstDayDow + 1;
        }

        const iso = toIsoDate(cellYear, cellMonth, cellDay);
        const isSelected = iso === selectedIso;
        const isToday = iso === todayIso;
        const isWeekend = (i % 7) >= 5;

        const dayBtn = document.createElement('button');
        dayBtn.type = 'button';
        dayBtn.textContent = String(cellDay);
        dayBtn.className = [
          'min-h-[44px] w-full rounded-xl text-xs font-mono tabular-nums flex items-center justify-center transition-all cursor-pointer',
          isSelected
            ? 'bg-blue-600 text-white font-bold shadow-sm'
            : isToday
              ? 'ring-1 ring-blue-500 text-blue-600 dark:text-blue-400 font-bold hover:bg-blue-50 dark:hover:bg-blue-950/50'
              : isOtherMonth
                ? 'text-slate-300 dark:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                : isWeekend
                  ? 'text-rose-600 dark:text-rose-400 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800'
                  : 'text-slate-700 dark:text-slate-200 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800'
        ].join(' ');

        dayBtn.addEventListener('click', () => selectDay(iso));
        grid.appendChild(dayBtn);
      }
      panel.appendChild(grid);

      // Footer: Hari Ini & Tutup
      const footer = document.createElement('div');
      footer.className = 'mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2';

      const todayBtn = document.createElement('button');
      todayBtn.type = 'button';
      todayBtn.className = 'min-h-[44px] px-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-400 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors';
      todayBtn.appendChild(createIcon('today', 'text-[16px]'));
      const todayLabel = document.createElement('span');
      todayLabel.textContent = 'Hari Ini';
      todayBtn.appendChild(todayLabel);
      todayBtn.addEventListener('click', () => selectDay(todayIso));

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'min-h-[44px] px-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold cursor-pointer transition-colors';
      closeBtn.textContent = 'Tutup';
      closeBtn.addEventListener('click', closeAll);

      footer.appendChild(todayBtn);
      footer.appendChild(closeBtn);
      panel.appendChild(footer);
    }

    function renderMonthGrid() {
      panel.innerHTML = '';
      const head = document.createElement('div');
      head.className = 'flex items-center justify-between mb-2';
      const title = document.createElement('span');
      title.className = 'text-xs font-bold text-slate-900 dark:text-white px-2';
      title.textContent = 'Pilih Bulan (' + viewYear + ')';
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'min-h-[44px] px-3 rounded-xl text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 cursor-pointer';
      back.textContent = 'Kembali';
      back.addEventListener('click', renderCalendar);
      head.appendChild(title);
      head.appendChild(back);
      panel.appendChild(head);

      const grid = document.createElement('div');
      grid.className = 'grid grid-cols-3 gap-1.5';
      MONTHS_ID_SHORT.forEach((mName, mIdx) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = mName;
        b.className = [
          'min-h-[44px] rounded-xl text-xs font-bold cursor-pointer transition-colors',
          mIdx === viewMonth
            ? 'bg-blue-600 text-white'
            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-700'
        ].join(' ');
        b.addEventListener('click', () => {
          viewMonth = mIdx;
          renderCalendar();
        });
        grid.appendChild(b);
      });
      panel.appendChild(grid);
    }

    function renderYearGrid() {
      panel.innerHTML = '';
      const baseYear = viewYear;
      const head = document.createElement('div');
      head.className = 'flex items-center justify-between mb-2';
      const title = document.createElement('span');
      title.className = 'text-xs font-bold text-slate-900 dark:text-white px-2';
      title.textContent = 'Pilih Tahun';
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'min-h-[44px] px-3 rounded-xl text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 cursor-pointer';
      back.textContent = 'Kembali';
      back.addEventListener('click', renderCalendar);
      head.appendChild(title);
      head.appendChild(back);
      panel.appendChild(head);

      const grid = document.createElement('div');
      grid.className = 'grid grid-cols-3 gap-1.5';
      for (let y = baseYear - 4; y <= baseYear + 7; y++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = String(y);
        b.className = [
          'min-h-[44px] rounded-xl text-xs font-mono font-bold cursor-pointer transition-colors',
          y === viewYear
            ? 'bg-blue-600 text-white'
            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-700'
        ].join(' ');
        b.addEventListener('click', () => {
          viewYear = y;
          renderCalendar();
        });
        grid.appendChild(b);
      }
      panel.appendChild(grid);
    }

    renderCalendar();
    document.body.appendChild(panel);
    positionPortal(panel, meta.trigger, 320, 410);
    setTriggerActive(meta.trigger, true);

    const onScroll = (e) => {
      if (panel.contains(e.target)) return;
      positionPortal(panel, meta.trigger, 320, 410);
    };
    window.addEventListener('scroll', onScroll, true);

    activePicker = {
      id: meta.uid,
      panel,
      trigger: meta.trigger,
      cleanup: () => window.removeEventListener('scroll', onScroll, true)
    };
  }

  function enhanceDate(target, opts) {
    injectStyles();
    const inp = resolveElement(target);
    if (!inp || inp.tagName !== 'INPUT') return null;

    const options = Object.assign({ placeholder: 'Pilih tanggal' }, opts || {});

    if (inp.dataset.stitchEnhanced === '1') {
      const existing = registry.dates.get(inp);
      if (existing) {
        existing.opts = Object.assign(existing.opts, options);
        updateDateLabel(inp);
      }
      return existing ? existing.trigger : null;
    }

    inp.dataset.stitchEnhanced = '1';
    const initialVal = inp.value;
    const layoutClasses = extractLayoutClasses(inp);
    inp.type = 'hidden';
    if (initialVal && inp.value !== initialVal) inp.value = initialVal;

    const wrap = document.createElement('div');
    wrap.className = 'stitch-picker-wrap relative ' + layoutClasses.join(' ');
    wrap.setAttribute('data-stitch-for', inp.id || '');

    const { btn, label } = createTriggerButton('calendar_month');
    btn.setAttribute('aria-haspopup', 'dialog');
    wrap.appendChild(btn);
    inp.insertAdjacentElement('afterend', wrap);

    const meta = {
      uid: 'date_' + Math.random().toString(36).slice(2, 9),
      el: inp,
      wrap,
      trigger: btn,
      label,
      opts: options
    };
    registry.dates.set(inp, meta);

    btn.addEventListener('click', () => openDatePanel(inp));

    hookValueProperty(inp, HTMLInputElement.prototype, () => {
      updateDateLabel(inp);
    });
    inp.addEventListener('change', () => updateDateLabel(inp));

    updateDateLabel(inp);
    return btn;
  }

  /* ── 3. CUSTOM TIME PICKER ──────────────────────────────────────── */

  function buildTimeSlots(minHour, maxHour, stepMin, currentValue) {
    const slots = [];
    const startTotal = minHour * 60;
    const endTotal = maxHour * 60;
    for (let m = startTotal; m <= endTotal; m += stepMin) {
      const hh = String(Math.floor(m / 60)).padStart(2, '0');
      const mm = String(m % 60).padStart(2, '0');
      slots.push(hh + ':' + mm);
    }
    const cleanVal = (currentValue || '').trim().slice(0, 5);
    if (/^\d{2}:\d{2}$/.test(cleanVal) && !slots.includes(cleanVal)) {
      slots.push(cleanVal);
      slots.sort();
    }
    return slots;
  }

  function updateTimeLabel(inp) {
    const meta = registry.times.get(inp);
    if (!meta) return;
    const val = (inp.value || '').trim().slice(0, 5);
    if (val) {
      meta.label.textContent = val;
      meta.label.classList.remove('text-slate-400', 'dark:text-slate-500');
      meta.label.classList.add('text-slate-900', 'dark:text-white');
    } else {
      meta.label.textContent = meta.opts.placeholder || 'Pilih jam';
      meta.label.classList.add('text-slate-400', 'dark:text-slate-500');
      meta.label.classList.remove('text-slate-900', 'dark:text-white');
    }
  }

  function openTimePanel(inp) {
    const meta = registry.times.get(inp);
    if (!meta) return;

    if (activePicker && activePicker.id === meta.uid) {
      closeAll();
      return;
    }
    closeAll();

    const panel = document.createElement('div');
    panel.className = [
      'stitch-picker-portal fixed z-[9999] rounded-2xl shadow-xl',
      'bg-white dark:bg-slate-900',
      'border border-slate-200 dark:border-slate-700',
      'overflow-hidden flex flex-col'
    ].join(' ');

    const header = document.createElement('div');
    header.className = 'px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between';
    const title = document.createElement('span');
    title.className = 'text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500';
    title.textContent = 'Pilih Jam (WITA)';
    header.appendChild(title);
    panel.appendChild(header);

    const listEl = document.createElement('div');
    listEl.setAttribute('role', 'listbox');
    listEl.className = 'stitch-picker-scroll max-h-64 overflow-y-auto p-1.5 space-y-1';

    const currentVal = (inp.value || '').trim().slice(0, 5);
    const slots = buildTimeSlots(meta.opts.minHour, meta.opts.maxHour, meta.opts.stepMin, currentVal);
    let selectedEl = null;

    slots.forEach((slot) => {
      const isSelected = slot === currentVal;
      const item = document.createElement('button');
      item.type = 'button';
      item.className = [
        'w-full min-h-[44px] px-3 py-2 rounded-xl text-xs font-mono font-bold tabular-nums',
        'flex items-center justify-between transition-colors cursor-pointer',
        isSelected
          ? 'bg-blue-600 text-white shadow-sm'
          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
      ].join(' ');

      const timeText = document.createElement('span');
      timeText.textContent = slot;
      item.appendChild(timeText);

      if (isSelected) {
        item.appendChild(createIcon('check', 'text-[18px] text-white shrink-0'));
        selectedEl = item;
      }

      item.addEventListener('click', () => {
        const changed = (inp.value || '').trim().slice(0, 5) !== slot;
        inp.value = slot;
        updateTimeLabel(inp);
        closeAll();
        if (changed) dispatchChange(inp);
      });

      listEl.appendChild(item);
    });

    panel.appendChild(listEl);
    document.body.appendChild(panel);
    positionPortal(panel, meta.trigger, 190, 320);
    setTriggerActive(meta.trigger, true);

    if (selectedEl) {
      requestAnimationFrame(() => {
        selectedEl.scrollIntoView({ block: 'center' });
      });
    }

    const onScroll = (e) => {
      if (panel.contains(e.target)) return;
      positionPortal(panel, meta.trigger, 190, 320);
    };
    window.addEventListener('scroll', onScroll, true);

    activePicker = {
      id: meta.uid,
      panel,
      trigger: meta.trigger,
      cleanup: () => window.removeEventListener('scroll', onScroll, true)
    };
  }

  function enhanceTime(target, opts) {
    injectStyles();
    const inp = resolveElement(target);
    if (!inp || inp.tagName !== 'INPUT') return null;

    const options = Object.assign({ minHour: 6, maxHour: 19, stepMin: 15, placeholder: 'Pilih jam' }, opts || {});

    if (inp.dataset.stitchEnhanced === '1') {
      const existing = registry.times.get(inp);
      if (existing) {
        existing.opts = Object.assign(existing.opts, options);
        updateTimeLabel(inp);
      }
      return existing ? existing.trigger : null;
    }

    inp.dataset.stitchEnhanced = '1';
    const initialVal = inp.value;
    const layoutClasses = extractLayoutClasses(inp);
    inp.type = 'hidden';
    if (initialVal && inp.value !== initialVal) inp.value = initialVal;

    const wrap = document.createElement('div');
    wrap.className = 'stitch-picker-wrap relative ' + layoutClasses.join(' ');
    wrap.setAttribute('data-stitch-for', inp.id || '');

    const { btn, label } = createTriggerButton('schedule');
    label.classList.add('font-mono', 'font-bold', 'tabular-nums');
    wrap.appendChild(btn);
    inp.insertAdjacentElement('afterend', wrap);

    const meta = {
      uid: 'time_' + Math.random().toString(36).slice(2, 9),
      el: inp,
      wrap,
      trigger: btn,
      label,
      opts: options
    };
    registry.times.set(inp, meta);

    btn.addEventListener('click', () => openTimePanel(inp));

    hookValueProperty(inp, HTMLInputElement.prototype, () => {
      updateTimeLabel(inp);
    });
    inp.addEventListener('change', () => updateDateLabelOrTime(inp));

    updateTimeLabel(inp);
    return btn;
  }

  /* ── SINGLE DATE RANGE PICKER (1 trigger -> start + end hidden inputs) ─── */
  const rangeRegistry = new Map();

  function updateRangeLabel(triggerEl) {
    const meta = rangeRegistry.get(triggerEl);
    if (!meta) return;
    const s = (meta.startInput.value || '').trim();
    const e = (meta.endInput.value || '').trim();
    const lbl = triggerEl.querySelector('[data-sp-range-label]');
    if (!lbl) return;
    if (s && e) {
      lbl.textContent = s === e ? formatDateDisplay(s) : `${formatDateDisplay(s)} – ${formatDateDisplay(e)}`;
      lbl.classList.remove('text-slate-400', 'dark:text-slate-500');
      lbl.classList.add('text-slate-900', 'dark:text-white');
    } else if (s) {
      lbl.textContent = `${formatDateDisplay(s)} – ...`;
      lbl.classList.remove('text-slate-400', 'dark:text-slate-500');
    } else {
      lbl.textContent = meta.placeholder || 'Pilih rentang tanggal';
      lbl.classList.add('text-slate-400', 'dark:text-slate-500');
    }
  }

  function openDateRangePanel(triggerEl) {
    const meta = rangeRegistry.get(triggerEl);
    if (!meta) return;
    if (activePortal && activePortal.trigger === triggerEl) {
      closeAll();
      return;
    }
    closeAll();

    const startParsed = parseIsoDate(meta.startInput.value) || parseIsoDate(new Date().toISOString().slice(0, 10));
    let viewYear = startParsed.year;
    let viewMonth = startParsed.month;
    let draftStart = (meta.startInput.value || '').trim();
    let draftEnd = (meta.endInput.value || '').trim();
    let pickingEnd = false;

    const panel = document.createElement('div');
    panel.className = 'sp-panel fixed z-[9999] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xl p-3.5 w-[310px] select-none';

    const MONTH_NAMES = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const DAYS_HDR = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

    const commitRange = (s, e) => {
      const a = s <= e ? s : e;
      const b = s <= e ? e : s;
      meta.startInput.value = a;
      meta.endInput.value = b;
      updateRangeLabel(triggerEl);
      dispatchChange(meta.startInput);
      dispatchChange(meta.endInput);
      closeAll();
    };

    const render = () => {
      const firstDay = new Date(Date.UTC(viewYear, viewMonth, 1));
      const offset = (firstDay.getUTCDay() + 6) % 7;
      const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();
      const todayIso = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);

      let cells = '';
      for (let i = 0; i < offset; i += 1) cells += '<div class="h-9"></div>';
      for (let day = 1; day <= daysInMonth; day += 1) {
        const iso = toIsoDate(viewYear, viewMonth, day);
        const isStart = draftStart && iso === draftStart;
        const isEnd = draftEnd && iso === draftEnd;
        const lo = draftStart && draftEnd ? (draftStart < draftEnd ? draftStart : draftEnd) : '';
        const hi = draftStart && draftEnd ? (draftStart < draftEnd ? draftEnd : draftStart) : '';
        const inBetween = lo && hi && iso > lo && iso < hi;
        const isToday = iso === todayIso;

        let cls = 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl';
        if (isStart || isEnd) {
          cls = 'bg-[#2563eb] text-white font-bold shadow-sm rounded-xl';
        } else if (inBetween) {
          cls = 'bg-blue-50 dark:bg-blue-950/60 text-[#2563eb] dark:text-blue-300 font-semibold rounded-lg';
        } else if (isToday) {
          cls = 'text-[#2563eb] font-bold ring-1 ring-[#2563eb]/40 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-950/40';
        }
        cells += `<button type="button" data-rng-iso="${iso}" class="h-9 w-full text-xs font-mono tabular-nums flex items-center justify-center transition-colors cursor-pointer ${cls}">${day}</button>`;
      }

      panel.innerHTML = `
        <div class="flex items-center justify-between mb-2.5">
          <button type="button" data-rng-prev class="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer">
            <span class="material-symbols-outlined text-[18px]">chevron_left</span>
          </button>
          <span class="text-xs font-extrabold text-slate-900 dark:text-white">${MONTH_NAMES[viewMonth]} ${viewYear}</span>
          <button type="button" data-rng-next class="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer">
            <span class="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
        </div>
        <div class="mb-2 px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 text-[11px] text-slate-600 dark:text-slate-300 flex items-center justify-between">
          <span>${pickingEnd ? 'Pilih tanggal akhir...' : 'Klik tanggal mulai'}</span>
          <span class="font-mono font-bold text-[#2563eb]">${draftStart ? formatDateDisplay(draftStart) : '-'}${draftEnd ? ' – ' + formatDateDisplay(draftEnd) : ''}</span>
        </div>
        <div class="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400 uppercase mb-1">
          ${DAYS_HDR.map((h) => `<div>${h}</div>`).join('')}
        </div>
        <div class="grid grid-cols-7 gap-1">${cells}</div>
        <div class="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
          <button type="button" data-rng-today class="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-[11px] font-bold text-slate-700 dark:text-slate-200 cursor-pointer">Hari Ini</button>
          <button type="button" data-rng-month class="px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-[11px] font-bold text-[#2563eb] dark:text-blue-300 cursor-pointer">Bulan Ini</button>
        </div>
      `;

      panel.querySelector('[data-rng-prev]')?.addEventListener('click', () => {
        viewMonth -= 1;
        if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
        render();
      });
      panel.querySelector('[data-rng-next]')?.addEventListener('click', () => {
        viewMonth += 1;
        if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
        render();
      });
      panel.querySelectorAll('[data-rng-iso]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const picked = btn.dataset.rngIso;
          if (!pickingEnd) {
            draftStart = picked;
            draftEnd = '';
            pickingEnd = true;
            render();
          } else {
            commitRange(draftStart, picked);
          }
        });
      });
      panel.querySelector('[data-rng-today]')?.addEventListener('click', () => commitRange(todayIso, todayIso));
      panel.querySelector('[data-rng-month]')?.addEventListener('click', () => {
        const dNow = parseIsoDate(todayIso);
        const first = toIsoDate(dNow.year, dNow.month, 1);
        commitRange(first, todayIso);
      });
    };

    document.body.appendChild(panel);
    render();
    positionPortal(panel, triggerEl, 310, 410);
    setTriggerActive(triggerEl, true);
    activePortal = { panel, trigger: triggerEl, input: meta.startInput };
  }

  function enhanceDateRange(triggerTarget, startTarget, endTarget, opts = {}) {
    const triggerEl = resolveElement(triggerTarget);
    const startInput = resolveElement(startTarget);
    const endInput = resolveElement(endTarget);
    if (!triggerEl || !startInput || !endInput) return null;
    if (rangeRegistry.has(triggerEl)) {
      updateRangeLabel(triggerEl);
      return triggerEl;
    }

    rangeRegistry.set(triggerEl, {
      startInput,
      endInput,
      placeholder: opts.placeholder || 'Pilih rentang tanggal',
    });

    triggerEl.addEventListener('click', (e) => {
      e.preventDefault();
      openDateRangePanel(triggerEl);
    });

    hookValueProperty(startInput, HTMLInputElement.prototype, () => updateRangeLabel(triggerEl));
    hookValueProperty(endInput, HTMLInputElement.prototype, () => updateRangeLabel(triggerEl));
    startInput.addEventListener('change', () => updateRangeLabel(triggerEl));
    endInput.addEventListener('change', () => updateRangeLabel(triggerEl));

    updateRangeLabel(triggerEl);
    return triggerEl;
  }

  function updateDateLabelOrTime(inp) {
    if (registry.times.has(inp)) updateTimeLabel(inp);
    if (registry.dates.has(inp)) updateDateLabel(inp);
  }

  function refreshAll() {
    registry.selects.forEach((_, sel) => refreshSelect(sel));
    registry.dates.forEach((_, inp) => updateDateLabel(inp));
    registry.times.forEach((_, inp) => updateTimeLabel(inp));
    rangeRegistry.forEach((_, trig) => updateRangeLabel(trig));
  }

  function initDefaultPickers() {
    // Dates
    ['rekapRangeDari', 'rekapRangeSampai', 'adminLiburDate', 'mapTglMulai', 'mapTglSelesai'].forEach((id) => {
      enhanceDate(id);
    });

    // Times
    ['adminJamMasuk', 'adminJamPulang'].forEach((id) => {
      enhanceTime(id, { minHour: 6, maxHour: 19, stepMin: 15 });
    });

    // Selects
    enhanceSelect('kpFilterBarang', { searchable: true, placeholder: 'Pilih aset / barang...' });
    enhanceSelect('kpFilterTahun', { searchable: false, placeholder: 'Pilih tahun...' });
    enhanceSelect('regInstansi', { searchable: false });
    enhanceSelect('regBidang', { searchable: false });
    enhanceSelect('regTipe', { searchable: false });
    enhanceSelect('regPangkat', { searchable: true });
    enhanceSelect('malSelectAset', { searchable: true, placeholder: 'Pilih aset...' });
    enhanceSelect('mapSelectAset', { searchable: true, placeholder: 'Pilih aset...' });
    enhanceSelect('devLogLevelFilter', { searchable: false });
  }

  document.addEventListener('DOMContentLoaded', initDefaultPickers);

  global.StitchPicker = {
    enhanceSelect,
    refreshSelect,
    enhanceDate,
    enhanceDateRange,
    enhanceTime,
    refreshAll,
    closeAll
  };
})(window);
