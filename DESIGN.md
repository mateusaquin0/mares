---
name: MARES Academic Intelligence
colors:
  background: "#f7f9fb"
  foreground: "#1E293B"
  card: "#ffffff"
  primary: "#003366"
  on-primary: "#ffffff"
  ocean: "#002147"
  secondary: "#eceef0"
  muted-foreground: "#43474f"
  accent: "#E0F7FA"
  accent-foreground: "#006876"
  border: "#E2E8F0"
  input: "#737780"
  ring: "#007f99"
  bio: "#43A047"
  success: "#2E7D32"
  success-soft: "#e2f3e3"
  success-border: "#bcdfbe"
  warning: "#9c5211"
  warning-soft: "#fdeed8"
  warning-border: "#f4d09a"
  destructive: "#ba1a1a"
  chart-series: "#003366"
  chart-1: "#1f5fa8"
  chart-2: "#c2620a"
  chart-3: "#0e9aa7"
  chart-4: "#5a9e2f"
  chart-5: "#9b3d73"
  map-public: "#003366"
  map-hidden: "#B45309"
colors-dark:
  background: "#0d1621"
  foreground: "#edf0f3"
  card: "#15202e"
  primary: "#a7c8ff"
  on-primary: "#111d2c"
  ocean: "#12273f"
  secondary: "#222d39"
  muted-foreground: "#9ba7b5"
  accent: "#193c43"
  accent-foreground: "#a0e5ee"
  border: "#283443"
  input: "#647387"
  ring: "#17b3cf"
  bio: "#54b659"
  success: "#97d89b"
  success-soft: "#244225"
  success-border: "#366338"
  warning: "#f4bd71"
  warning-soft: "#433119"
  warning-border: "#7a5829"
  chart-series: "#a7c8ff"
  chart-1: "#4f8fdc"
  chart-2: "#cf7a2a"
  chart-3: "#1fa3b3"
  chart-4: "#66a83d"
  chart-5: "#c0609a"
typography:
  page-title:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: "700"
    lineHeight: 36px
    letterSpacing: -0.02em
  section-title:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: "600"
    lineHeight: 28px
  body:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: "400"
    lineHeight: 20px
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: "400"
    lineHeight: 16px
  label:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: "600"
    lineHeight: 16px
    letterSpacing: 0.025em
  stat:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: "700"
    lineHeight: 36px
  display:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: "700"
    lineHeight: 56px
    letterSpacing: -0.02em
rounded:
  sm: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 1rem
  full: 9999px
spacing:
  base: 4px
  container-max: 1280px
  gutter: 24px
---

The values above are the ones the app ships. The source of truth is
`src/app/globals.css` (CSS variables, light and `.dark`) and `tailwind.config.ts`;
when this file and the code disagree, fix whichever is wrong in the same change.

## Brand & Style

MARES is a data-management tool for marine-mammal research: stranding records,
necropsies, samples, laboratory results and maps. The identity combines **academic
rigor** with an **ocean** palette. It is a working tool used for long sessions, so
legibility and information density come before decoration.

Most screens are tables, forms and detail pages behind login. The public pages
(landing, login, terms) may be more expressive; the app itself stays quiet.

## Colors

One color acts, one highlights, one means "positive". Everything else is neutral.

- **Primary — Deep Navy `#003366`.** Primary buttons, links, active navigation.
- **Ocean `#002147`.** Navigation chrome only. Never a button or text color.
- **Accent — Coastal Cyan `#E0F7FA` / `#006876`.** Highlights, hover and selected
  states, table headers, informational notes. The focus ring is cyan.
- **Bio Green `#43A047`.** Icons and chart marks only. White text on it is 3.3:1,
  so it is never a text color or a filled-button background.
- **Neutrals.** Page background is a near-white slate (`#f7f9fb`); cards are pure
  white on top of it.

Raw Tailwind palette classes (`amber-500`, `slate-400`, …) and hex literals do not
appear in components. If a color is missing, add a token.

### Status

Four states, each with a text color, a soft background and a border. A status is
never color alone: it carries a label or an icon.

| State | Token | Use |
|---|---|---|
| Positive | `success`, `success-soft`, `success-border` | "Positivo" result, record found, filled confirm button (`bg-success text-success-foreground`) |
| Warning | `warning`, `warning-soft`, `warning-border` | "Inconclusivo", pending review, possible duplicates |
| Info | `accent`, `accent-foreground` | Public visibility, neutral highlights |
| Error | `destructive` | Validation errors, destructive actions |

"Negativo" is neutral (`secondary` background, `muted-foreground` text): a negative
result is not an alarm.

### Dark mode

Dark mode is a first-class theme, not an inversion. The background is deep navy,
cards sit one step lighter, and the primary becomes a light blue (`#a7c8ff`) with
dark text on it. Every token has a dark value in `.dark`; components use the
semantic tokens and need no `dark:` overrides for color.

## Typography

**Inter** everywhere.

- **Body is 14px** (`text-sm`). 16px is reserved for long-form prose such as the
  terms page.
- **Captions and metadata are 12px** (`text-xs`).
- **Labels** (table headers, filter labels, stat captions) are 12px, semibold,
  uppercase, slightly tracked.
- **Page titles** are 24–30px bold; section and card titles are 18px semibold.
- **Display (48px)** exists only on public pages.

### Data

- **Numbers in columns** use `tabular-nums` and are right-aligned, so digits line
  up down the column. Counts, measures, percentages and coordinates qualify.
- **Identifiers** (control ID, AphiaID, record numbers) stay in Inter with
  `tabular-nums`, so they line up in a column without changing typeface. `font-mono`
  is for technical strings only, such as hashes and raw payloads.
- **Scientific names** are italic, everywhere, including charts and map popups.
- An empty value is an em dash (`—`), never a blank cell.

## Layout & Spacing

- Content is capped at 1280px so tables do not stretch on ultrawide monitors.
- Spacing follows Tailwind's 4px scale. Cards and sections are separated by 16–24px.
- **Desktop:** 12 columns, 24px gutter. **Tablet:** 8 columns. **Mobile:** one
  column; tables scroll horizontally inside their container instead of reflowing.

## Elevation & Depth

Two levels, plus the flat page.

- **On the page:** a 1px `border` and, for cards, `shadow-card` — a very soft,
  navy-tinted shadow. Filter bars and inline panels use a border only, or
  `shadow-sm` at most.
- **Floating:** popovers, dropdowns, dialogs and toasts use `shadow-md`/`shadow-lg`.
  Nothing on the page itself uses these.
- **Clickable cards** move to `shadow-card-hover` on hover. Non-clickable cards do
  not react to the pointer.

## Shapes

- **Controls** (buttons, inputs, selects, chips): 6–8px (`rounded-md`, `rounded-lg`).
- **Cards and large sections:** 16px (`rounded-xl`).
- **Status badges and dots:** pill (`rounded-full`).

## Components

### Buttons

- **Primary:** solid navy, white text. One per view.
- **Outline:** `input` border on the page background; cyan tint on hover.
- **Confirm (save a record):** `bg-success text-success-foreground`.
- **Destructive:** solid `destructive`, always behind a confirmation dialog.

### Inputs & Selects

- The border uses `input` (`#737780`), which holds 3:1 against the background so
  the field boundary is visible without relying on the placeholder.
- Focus is a 2px cyan ring with an offset.
- Errors appear under their own field in `destructive`, 12px.
- **Taxon autocomplete (WoRMS/NCBI):** scientific name in bold italic, common name
  below it in caption style.

### Badges

Pill-shaped, 12px semibold. Variants map to meaning, not to color:
`positive`, `negative`, `inconclusive`, `public`, `private`, `highlight`, `faded`.

### Cards

White (`card`) on the slate background, 16px radius, `border` outline and
`shadow-card`. Research cards carry a visibility badge: cyan for public, navy for
private.

### Data Tables

- Header: cyan tint (`accent` at 40%), label typography.
- Rows: a bottom border and a `muted` hover. No zebra striping.
- **Density.** Default rows use 16px cell padding. Laboratory tables (results
  matrix, analyses of a sample) use `<Table density="compact">`: 8px vertical,
  12px horizontal, 36px header.
- Empty tables keep the header and show one centered `TableEmpty` row.
- Long text truncates with the full value in a tooltip; it never wraps a row to
  three lines.

### Charts

- **A single measure is a single color.** Bars of one series (animals per species,
  positivity per exam, records over time) all use `chart-series`. Color per bar
  would imply categories that do not exist.
- **Several series** take `chart-1` … `chart-5`, in that order, never cycled. The
  order is validated for color-vision deficiency in both themes; a sixth series
  folds into "Other" or becomes a second chart. Two or more series always get a
  legend.
- Status colors are reserved for status and are not used as series colors.
- Axis text uses `muted-foreground`; grid lines use `border`. Tooltips use the
  `popover` tokens.
- Recharts writes colors as SVG attributes, where CSS variables do not resolve, so
  chart colors are picked in JS from the resolved theme using the values above.

### Maps

- Map tiles are light in both themes, so pin and popup colors are fixed values, not
  theme tokens.
- Pins: `map-public` (navy) for records visible to everyone, `map-hidden` (amber)
  for records hidden from the public map.
- Popups: species in italic, labels in slate, positive pathogens as red pills.

## States

- **Loading:** skeletons shaped like the content for first load; dimmed content
  (60% opacity) while refetching. No spinners over whole pages.
- **Empty:** one sentence saying what is missing and, when the user can fix it, the
  action that does.
- **Error:** the message next to what failed, with a retry when one makes sense.
- **Disabled:** 50% opacity, no pointer events.

## Motion

Transitions are 150–200ms and limited to color, shadow and opacity; accordions
animate height in 200ms. Nothing animates on scroll, and motion is not used to draw
attention to data.
