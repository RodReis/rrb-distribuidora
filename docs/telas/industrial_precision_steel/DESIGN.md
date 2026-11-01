---
name: Industrial Precision Steel
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#5c403c'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#916f6b'
  outline-variant: '#e6bdb8'
  surface-tint: '#bf0715'
  primary: '#b70011'
  on-primary: '#ffffff'
  primary-container: '#dc2626'
  on-primary-container: '#fff6f5'
  inverse-primary: '#ffb4ab'
  secondary: '#006e2d'
  on-secondary: '#ffffff'
  secondary-container: '#7cf994'
  on-secondary-container: '#007230'
  tertiary: '#005e90'
  on-tertiary: '#ffffff'
  tertiary-container: '#0078b6'
  on-tertiary-container: '#f5f8ff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdad6'
  primary-fixed-dim: '#ffb4ab'
  on-primary-fixed: '#410002'
  on-primary-fixed-variant: '#93000b'
  secondary-fixed: '#7ffc97'
  secondary-fixed-dim: '#62df7d'
  on-secondary-fixed: '#002109'
  on-secondary-fixed-variant: '#005320'
  tertiary-fixed: '#cce5ff'
  tertiary-fixed-dim: '#93ccff'
  on-tertiary-fixed: '#001d31'
  on-tertiary-fixed-variant: '#004b73'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.03em
  headline-xl-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.015em
  body-lg:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0em
  label-lg:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: -0.01em
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-mobile: 0.75rem
  margin: 1.5rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1.25rem
  space-xl: 2rem
---

## Brand & Style

This design system delivers an industrial intelligence aesthetic engineered for high-throughput manufacturing, metallurgy operations, and automated production telemetry. The visual language rejects decorative clutter in favor of razor-sharp micro-precision, calibrated contrast, and uncompromising optical utility.

The design movement is **Clean Precision Functionalism**:
- **Industrial Precision:** Visual motifs evoke machined alloy sheets, micrometric scales, and rigorous manufacturing control panels.
- **Micro-Structured Hierarchy:** Layouts prioritize dense operational metrics, real-time agent decisions, and tabular telemetries without cognitive fatigue.
- **Decisive Contrast:** A clinical, neutral substrate composed of zinc-tinted whites and surgical cool slates, punctuated decisively by high-visibility carmine red and functional status pigments.

## Colors

The palette balances clean structural zinc neutrals with clinical, high-visibility signal tones.

### Palette Architecture
- **Primary Accent (`#dc2626` / Carmine Red):** Represents core operational commands, brand identification, critical intervention, and agent active states. Deep carmine (`#b91c1c`) serves as interactive press and hover states.
- **Secondary Accent (`#16a34a` / Industrial Emerald):** Signals autonomous validation, positive margin thresholds, machine pass states, and deterministic AI approval.
- **Tertiary Accent (`#0284c7` / Telemetry Cyan):** Used for live telemetry feeds, stream pipes, sensor traces, and machine-to-cloud diagnostic data.
- **Warning Accent (`#d97706` / Industrial Amber):** Used for quarantine gates, thermal variance cautions, and manual inspection triggers.
- **Neutral Substrates & Structural Framework:**
  - Base Ground: `#ffffff`
  - Tier 1 Substrate: `#f8fafc` (Zinc-50, dashboard canvas)
  - Tier 2 Substrate: `#f1f5f9` (Zinc-100, toolbars, pinned rail backdrops)
  - Hairline Borders: `#e2e8f0` (Primary boundary) and `#cbd5e1` (Interactive/nested cell boundary)
- **Typographic Scale:**
  - Carbon Base: `#0f172a` (Headings, primary readings)
  - Deep Slate: `#1e293b` (Body metrics, parameter labels)
  - Muted Zinc: `#64748b` (Units of measurement, inactive timestamps, inactive headers)

## Typography

The typographic pairing implements **Inter** for conversational clarity and visual density alongside **JetBrains Mono** for machine telemetries, numeric sensor readouts, UUIDs, and system statuses.

- **Proportional Pacing:** All metric numbers, tolerances, serial IDs, and batch numbers must render in `JetBrains Mono` with tabular numeral sizing enabled (`font-variant-numeric: tabular-nums`).
- **Precision Kerning:** Large display numbers use tight letter tracking (`-0.02em` to `-0.03em`) to prevent visual drift across multi-panel views.
- **Micro-Labels:** Field labels and column headers use uppercase `label-sm` or `label-md` tracking at `0.02em` to `0.04em` to sustain structural legibility at microscopic scales.

## Layout & Spacing

Layouts follow a fluid, high-density modular grid engineered for high-resolution industrial consoles, engineering workstations, and responsive shop-floor tablets.

### Grid & Breakpoints
- **Desktop (>= 1440px):** 12-column or 16-column continuous fluid layout with a maximum container threshold of 1920px. Default `gutter` is `1rem`, `margin` is `1.5rem`.
- **Workstation / Tablet (768px – 1439px):** 8-column layout. Gutter shrinks to `0.75rem`; telemetry sidebars collapse into persistent icon-rail overlays.
- **Field Terminal / Mobile (< 768px):** 4-column single-stack layout with `margin-mobile` at `1rem`. Dense data tables switch to horizontally scrollable data lanes or stacked card cells.

### Rhythm & Alignment
- Spacing follows strict multiples of `4px` (`0.25rem`). Component paddings favor horizontal density (`space-md` horizontal, `space-xs` to `space-sm` vertical) to maximize vertical information yield per screen height.

## Elevation & Depth

This design system avoids soft, floating cloud shadows in favor of **Tonal Layering & Structural Hairlines**.

- **Z-Index Layering:**
  - **Ground Floor (`#f8fafc`):** Background application surface.
  - **Level 1 (Cards, Workspaces, Tables):** Solid `#ffffff` surface delineated by a crisp `1px solid #e2e8f0` boundary.
  - **Level 2 (Active Cells, Panels, Flyouts):** `#ffffff` with a double hairline boundary or a strict industrial ambient occlusion: `box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.04)`.
  - **Level 3 (Modal Alerts, Quarantine Overlays):** `#ffffff` encased in a prominent hairline border (`1px solid #cbd5e1`), supported by an architectural shadow: `0 10px 15px -3px rgba(15, 23, 42, 0.1), 0 4px 6px -2px rgba(15, 23, 42, 0.05)`.
- **Divider Logic:** Separators utilize clean `1px` lines tinted with `#e2e8f0`. Highlighting active operational states uses an inset `2px` left or bottom border in `#dc2626` or `#16a34a`.

## Shapes

The design uses a restrained, sharp shape vocabulary that reflects machined cold-rolled steel:
- **Base Geometry:** Standard components utilize a strict `0.25rem` (4px) corner radius, reinforcing structural solidity without harsh needle points.
- **Control Indicators:** Sensor pills, live ping dots, and micro status chips utilize continuous pill geometry (`rounded-full` / `9999px`) purely to separate state tags from structural data containers.
- **Panels & Canvases:** Primary cards, inspection tables, and telemetry grids strictly adhere to `0.25rem` or zero radius when edge-to-edge abutting, creating an integrated machine dashboard look.

## Components

### Buttons & Operational Triggers
- **Primary (Emergency Action / Commit):** Solid carmine red (`#dc2626`) fill, crisp `#ffffff` text, subtle hover shift to `#b91c1c`, zero shadow, `0.25rem` corner radius. Typography: `label-lg` or `body-md` (weight: 600).
- **Secondary (Machine Control / Neutral Action):** Solid `#ffffff` background with `1px solid #cbd5e1`, text `#0f172a`. Hover state switches to `#f8fafc` with border `#94a3b8`.
- **Tertiary / Utility:** Transparent background, `1px solid transparent`, text `#64748b`, hover to `#f1f5f9` with text `#0f172a`.

### Data Grids & Telemetry Tables
- **Header:** Background `#f8fafc`, bottom border `1px solid #cbd5e1`, font `JetBrains Mono` (`label-sm`), uppercase, tracking `0.04em`, text `#64748b`.
- **Row:** Alternating clean white (`#ffffff`) and micro-tint (`#fbfcfd`), row border `1px solid #e2e8f0`. Pinned hover state uses `#f1f5f9`.
- **Numerical Cells:** Rendered strictly in `JetBrains Mono`, aligned right, with unit labels in muted slate (`#64748b`).

### Chips & Sensor Badges
- **Approval / In-Spec:** Background `#f0fdf4`, border `1px solid #bbf7d0`, text `#16a34a`.
- **Quarantine / Alert:** Background `#fffbeb`, border `1px solid #fde68a`, text `#d97706`.
- **Critical Deviation:** Background `#fef2f2`, border `1px solid #fecaca`, text `#dc2626`.
- **Telemetry Active:** Background `#f0f9ff`, border `1px solid #bae6fd`, text `#0284c7`.

### Input Fields & Parameter Controls
- **Geometry:** Height fixed at 32px (compact) or 36px (standard). Border `1px solid #cbd5e1`, background `#ffffff`.
- **Active / Focus:** Border switches to `1px solid #0f172a` with an outline ring of `1px solid #0f172a` (no soft blurry glow). Monospaced entry values for tolerance overrides.

### Machine Cards & Modular Units
- **Container Structure:** Crisp `#ffffff` ground, outer frame `1px solid #e2e8f0`.
- **Header Band:** Compact 36px header zone with a distinct bottom rule `1px solid #e2e8f0`, housing an agent status beacon on the left and numeric timestamp in `JetBrains Mono` on the right.