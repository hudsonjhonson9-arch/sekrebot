---
name: Vibrant Enterprise Mobile Attendance
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#434655'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#737686'
  outline-variant: '#c3c6d7'
  surface-tint: '#0053db'
  primary: '#004ac6'
  on-primary: '#ffffff'
  primary-container: '#2563eb'
  on-primary-container: '#eeefff'
  inverse-primary: '#b4c5ff'
  secondary: '#006c49'
  on-secondary: '#ffffff'
  secondary-container: '#6cf8bb'
  on-secondary-container: '#00714d'
  tertiary: '#784b00'
  on-tertiary: '#ffffff'
  tertiary-container: '#996100'
  on-tertiary-container: '#ffeedd'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  title-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.03em
  time-display:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '800'
    lineHeight: 48px
    letterSpacing: -0.03em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-sm: 0.75rem
  margin: 1rem
  margin-md: 1.25rem
  margin-lg: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system targets modern corporate enterprises, operational field forces, and shift-driven businesses needing a dependable, instantaneous, and friction-free mobile attendance and roster management tool. The experience balances corporate authority with personal approachability, projecting operational precision, reliability, and modern efficiency. 

The aesthetic is Modern Tactile Corporate:
- **Clean Whitespace & Ergonomic Zones:** Information density is carefully calibrated for single-handed, thumb-driven interaction on mobile devices, emphasizing large touch targets (minimum 48×48dp) and bottom-sheet oriented workflows.
- **Vibrant Functional Accents:** Functional states—such as clocking in, shift transfers, and late alerts—use crisp, purposeful color signals rather than decorative noise.
- **Card-Centric Scaffolding:** Workflows are structured into distinct elevated card surfaces with subtle ambient diffusion, creating clean visual segregation between schedule timelines, biometric/geofence status, and personal activity logs.

## Colors

The palette leverages a functional chromatic hierarchy designed to communicate operational state and compliance instantly without cognitive load.

- **Primary (`#2563EB` - Vibrant Royal Blue):** Anchors identity, primary calls to action (e.g., "Clock In / Clock Out", biometric trigger button), active navigation items, and selected states.
- **Secondary (`#10B981` - Emerald Green):** Designated for affirmative operational states: on-time attendance, active GPS/geofence verification, successful verification badges, and completed shifts.
- **Tertiary (`#F59E0B` - Amber Gold):** Applied to pending managerial approvals, middle/evening shift indicators, early departure warnings, and grace-period alerts.
- **Neutral (`#64748B` - Slate Grey):** Governs structural framing, inactive tabs, secondary metadata, borders, and contextual body copy. 
- **System Semantic Addition:** An alert crimson (`#EF4444`) is reserved exclusively for missed shifts, geofence breaches, late flags, and urgent schedule conflicts.
- **Backgrounds:** Built on clean, cool neutral layers (`#F8FAFC` base canvas with pure `#FFFFFF` primary container cards) to maintain crisp legibility in high-glare outdoor work conditions.

## Typography

Plus Jakarta Sans is utilized uniformly across headlines, body copy, and status indicators. Its open apertures, geometric clarity, and humanist curves maintain exceptional legibility on variable mobile screens and handheld field conditions.

- **Numerics & Live Clocks:** The custom `time-display` token features tabular figures where possible to prevent layout shifts during live second ticking on the clock-in terminal.
- **Hierarchical Discipline:** Headers prioritize semi-bold to bold weights to anchor scanning eyes immediately to shift titles, attendance timestamps, and location breadcrumbs.
- **Labels & Badges:** Micro-labels utilize uppercase or semi-bold variants with subtle tracking for instantaneous status scanning (e.g., "ON DUTY", "CHECK-IN VALID", "LATE").

## Layout & Spacing

The layout is built primarily for mobile viewport constraints (360px to 428px base widths), utilizing a fluid 4-column grid system with 16px (`gutter`) column separation and 16px to 20px screen margins.

- **Thumb-Zone Architecture:** Primary action anchors (Clock-In action button, shift filter bars, punch controls) sit strictly within the lower 40% vertical zone of the mobile viewport. Supplementary navigation and profile selectors occupy the upper corners.
- **Card Spacing:** Standard spacing between distinct dashboard cards is locked to `space-md` (16px), while internal card content padding scales between `space-md` and `space-lg` to create clear visual breathing room.
- **Tablet & Desktop Adaptation:** When expanded to tablet or desktop views (such as supervisor consoles), the interface shifts to an 8-column or 12-column fixed grid with max-width containment of 1200px and increased margin padding of 24px (`space-lg`) to 32px (`space-xl`).

## Elevation & Depth

Visual hierarchy is expressed through layered physical surfaces, soft atmospheric shadows, and deliberate border strokes rather than harsh drop shadows.

- **Base Canvas (Level 0):** Flat background in slate-tinted off-white (`#F8FAFC`).
- **Primary Container (Level 1):** Solid white (`#FFFFFF`) card surfaces elevated by a soft, ambient shadow: `box-shadow: 0px 4px 20px -2px rgba(100, 116, 139, 0.08), 0px 2px 6px -1px rgba(100, 116, 139, 0.04)` combined with an ultra-subtle border stroke (`1px solid #F1F5F9`).
- **Floating Interactive Elements (Level 2):** Primary attendance punch buttons, active shift notifications, and bottom sheets: `box-shadow: 0px 12px 32px -4px rgba(37, 99, 235, 0.20), 0px 4px 12px -2px rgba(15, 23, 42, 0.06)`.
- **Modals & Overlays (Level 3):** Verification screens, facial recognition modals, and GPS map panels: `box-shadow: 0px 24px 48px -8px rgba(15, 23, 42, 0.16)` over a 40% blurred slate backdrop (`backdrop-filter: blur(8px)`).

## Shapes

The design system implements a rounded geometry (`roundedness: 2`, equivalent to a 16px / `1rem` base on cards and containers, progressing to `rounded-2xl` / 1.5rem for major surface modules) to foster an inviting, ergonomic feel.

- **Cards & Bottom Sheets:** Base cards feature `rounded-2xl` (16px to 24px corner radius) to eliminate sharp edges that conflict with mobile thumb navigation.
- **Buttons & Form Fields:** Interactive controls adopt `rounded-xl` (12px) to `rounded-2xl` (16px) for tactile button pressing.
- **Pill Indicators (Chips & Badges):** Status indicators, shift tag pills, and time trackers adopt full pill geometry (`border-radius: 9999px`) to distinguish categorical metadata from clickable content cards.
- **Action Clocking FAB:** Main clock-in action center features an expansive circular or pill geometry with concentric pulse ripples indicating active GPS signal capture.

## Components

### Attendance Action Button (Punch In / Out)
- **Geometry:** Large, high-priority touch target (minimum height 56px, up to 72px for full-width action pads; circular variants are 80×80px).
- **Style:** Solid vibrant primary blue (`#2563EB`) with a bold label and icon. On valid proximity/geofence detection, the boundary emits a subtle 2px emerald halo pulse. Disabled states drop to `#E2E8F0` with `#94A3B8` typography.

### Status Chips & Badges
- **Types:** "On Time" (Secondary green background tint `#ECFDF5`, text `#059669`), "Late / Overtime" (Red tint `#FEF2F2`, text `#DC2626`), "Evening Shift" (Tertiary amber tint `#FFFBEB`, text `#D97706`), "Break Active" (Slate tint `#F1F5F9`, text `#475569`).
- **Form:** Pill shape (`9999px` radius), horizontal padding 10px, vertical padding 4px. Always contains a 6px circular indicator dot or mini-icon preceding the label.

### Shift & Attendance Cards
- **Geometry:** `rounded-2xl` (16px), pure white fill, soft ambient slate shadow, 16px internal padding.
- **Structure:** 
  1. Top Row: Shift classification badge ("Morning Shift - 08:00 to 17:00") and dynamic status chip.
  2. Middle Row: Real-time schedule progress, office/site geofence indicator with map-pin icon.
  3. Bottom Row: Quick actions (Shift Swap, Leave Request, Log View) using subtle flat icon-buttons.

### Form Inputs & Selectors
- **Fields:** Height 48px to 52px, `rounded-xl` (12px), background `#F8FAFC`, border `1.5px solid #E2E8F0`. Focus state shifts border to vibrant blue (`#2563EB`) with an ambient 3px blue glow (`rgba(37, 99, 235, 0.15)`).
- **Date/Time Pickers:** Wheel or bottom-sheet calendar drawer with clear tap boundaries and large numeric touch regions.

### Bottom Navigation & App Bar
- **Bottom Navigation:** Elevated surface floating 12px above bottom screen margin with `rounded-2xl` corners, containing 4 thumb targets (Home, Schedule, Approvals, Profile). Active tab is highlighted with primary blue accent dots.
- **Geofence Live Indicator:** Top persistent micro-bar showing active workplace geofence connection status with a green or amber pulsing beacon.