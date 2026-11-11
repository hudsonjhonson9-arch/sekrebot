# Desktop Sidebar Resizable & Icon-Only Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

---

### Task 1: CSS Architecture for Resizable & Icon-Only Sidebar
- [ ] Define CSS variables `--sidebar-w: 260px` and `--sidebar-collapsed-w: 68px` in `css/styles.css`.
- [ ] Update `.bottom-nav` on desktop (`@media (min-width: 768px)` and `body.desktop-mode`) to consume `width: var(--sidebar-w, 260px) !important; max-width: var(--sidebar-w, 260px) !important;`.
- [ ] Update `.panel`, `body.desktop-mode .panel`, and `.arsip-back` to use `calc(100vw - var(--sidebar-w, 260px) - 20px)` and `calc(var(--sidebar-w, 260px) + 16px)`.
- [ ] Add `.sidebar-collapsed` styles:
  - `.bottom-nav.collapsed` / `body.sidebar-collapsed .bottom-nav`: width = 68px.
  - `.bottom-nav.collapsed .nav-item`: `padding: 12px 0 !important; justify-content: center !important; text-align: center !important;`.
  - `.bottom-nav.collapsed .nav-item span`: `display: none !important;` (hiding labels, icon-only).
  - `.bottom-nav.collapsed .nav-item i`: centered, `margin: 0 !important; font-size: 18px !important;`.
  - `.bottom-nav.collapsed::before`: monogram 'H' (`content: 'H'; font-size: 20px; letter-spacing: 0;`).
  - `.bottom-nav.collapsed .sidebar-toggle-btn i`: rotated 180deg (`transform: rotate(180deg);`).
  - Floating tooltips on `:hover` for collapsed nav items.
- [ ] Add `.sidebar-resizer` and `.sidebar-toggle-btn` styles with clean hover and dragging visuals.
- [ ] Add `.sidebar-resizing` utility class to disable transitions and text selection during drag.
- [ ] Mirror all CSS changes to `www/css/styles.css` (if present) or verify `styles.css` symlink/copy.

---

### Task 2: Markup Integration in `index.html` & `www/index.html`
- [ ] Inside `<nav class="bottom-nav" id="tabsBar">`:
  - Add collapse toggle button: `<button type="button" class="sidebar-toggle-btn desktop-only" id="sidebarToggleBtn" onclick="toggleSidebarCollapse()" title="Kecilkan / Perlebar Sidebar" aria-label="Toggle Sidebar"><i class="fas fa-arrow-left" id="sidebarToggleIcon"></i></button>`.
  - Add drag resizer handle: `<div class="sidebar-resizer desktop-only" id="sidebarResizer" title="Geser untuk mengubah ukuran sidebar (klik ganda untuk minimize/maximize)"></div>`.
  - Add `title` and `data-label` attributes to every `.nav-item` for accessible tooltips when collapsed.
- [ ] Mirror exact markup changes to `www/index.html`.

---

### Task 3: Interactive JS Handler for Resize, Collapse, and Persistence
- [ ] In `js/desktop.js`, implement:
  - `initSidebarResize()`:
    - Attach mousedown listener on `#sidebarResizer`.
    - Mousemove: compute new width clamped between 68px and 380px.
    - If width < 115px, snap to collapsed (68px). If >= 115px, expand and update `--sidebar-w`.
    - Mouseup: persist `hadir_sidebar_w` and `hadir_sidebar_collapsed` to `localStorage`.
    - Double click on resizer: toggle collapse.
  - `toggleSidebarCollapse()`:
    - Toggle `body.sidebar-collapsed` and `#tabsBar.classList.toggle('collapsed')`.
    - If collapsed, set `--sidebar-w: 68px`. If expanded, restore saved width (or default 260px).
    - Save to `localStorage`.
  - Auto-init on page load and window resize.
- [ ] Mirror `js/desktop.js` to `www/js/desktop.js`.

---

### Task 4: Automated Testing & Verification
- [ ] Create `tests/sidebar-desktop.test.mjs` verifying:
  - Presence of `#sidebarResizer`, `#sidebarToggleBtn`, and `.desktop-only` tags in `index.html` and `www/index.html`.
  - Valid `data-label` on all `.nav-item` elements.
  - CSS variables and rules for `.bottom-nav.collapsed` and `--sidebar-w`.
  - Runeicons compliance for all used icons.
- [ ] Run `npm test` to ensure all 692+ tests pass.
- [ ] Run `npm run build` to confirm production bundle builds cleanly.
- [ ] Commit and push to GitHub.
