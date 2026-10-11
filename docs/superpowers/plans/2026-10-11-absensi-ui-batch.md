# 2026-10-11 — Absensi UI Batch Fix

## Scope
Six small, fully-scoped fixes. No new abstractions. Ponytail: shortest diff, root-cause, accessibility kept.

## Tasks (ordered)

### 1. Week strip animation
- `js/log.js:564` — `showWeekDetail` timeout **120→200** (match `.18s` transition; fixes text ghosting)
- `css/styles.css:6934` — `.week-day` animation fill **`both`→`backwards`** (restore hover `translateY(-2px)`)
- `js/log.js:537` — `fa-ellipsis` → **`fa-circle`** + existing `w-empty` class (stop "•••" reading as stuck loading)

### 2. `.rs-ico` follows card color
- `css/styles.css:2806,2815,2824,2833,2842,2851,2860,2869,2878,2887` — extend each `.rs-X .rs-num` selector to `.rs-X .rs-num, .rs-X .rs-ico`

### 3. Select zigzag (opaque bg)
- `css/styles.css:2070` — dark theme: `background: rgba(30,41,59,.92)` → `background-color: #1E293B` (keep chevron `background-image`)
- `css/styles.css:6387` — light theme: same split, opaque color

### 4. PULANG icon → `fa-home`
- `js/log.js:90` — `getLC` PULANG
- `js/helpers.js:53` — `getTodayBadge` PULANG
- `index.html:1099` — `rs-pulang` card
- `js/rekap.js:725` — `pulangIcon` "Tepat"
- **KEEP** `fa-running` for PULANG LUAR/CEPAT everywhere (`log.js:91,93`, `helpers.js:54,56`, `rekap.js:723`, `absen.js:700,766,787,794,804`, `index.html:569,913,941`)

### 5. Panel enter animation + reduced-motion guard
- `css/styles.css` — add `.panel.active` fadeIn (300ms) + global `@media (prefers-reduced-motion: reduce)` disabling all added animations

### 6. Auto Jenis Absen (admin log modal)
- `js/admin-log.js` `openLogEditor` — change-listeners on `inLogJam` + `inLogTanggal`
- Logic: reuse grouping from `helpers.js:95-104` (via `getJamForTanggal` for `_jmH2`/`_jpH2`)
- **Default:** derived from configured jam (matches existing pattern). Flag: user said "jam 7:15" literally — confirm if fixed-threshold instead.

## Version bumps (`index.html`)
- styles.css `?v=16`→`17`
- log.js `?v=20261011a`→`20261011b`
- helpers.js `?v=20261011a`→`20261011b`
- rekap.js `?v=20261009a`→`20261011a`
- admin-log.js `?v=20261009b`→`20261011a`

## Verification
- `npm test` (392/392)
- `node --check` on touched JS files
- Visual: week hover works, MIN card not stuck-looking, rs-ico colored, select no zigzag, pulang=home, panel fade-in

## Out of scope
- Mobile first-load week history (needs device repro)
- Commit/push (await explicit instruction)

## Files touched
`js/log.js`, `js/helpers.js`, `js/rekap.js`, `js/admin-log.js`, `css/styles.css`, `index.html`
