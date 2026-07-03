---
name: MARES Academic Intelligence
colors:
  surface: "#f7f9fb"
  surface-dim: "#d8dadc"
  surface-bright: "#f7f9fb"
  surface-container-lowest: "#ffffff"
  surface-container-low: "#f2f4f6"
  surface-container: "#eceef0"
  surface-container-high: "#e6e8ea"
  surface-container-highest: "#e0e3e5"
  on-surface: "#191c1e"
  on-surface-variant: "#43474f"
  inverse-surface: "#2d3133"
  inverse-on-surface: "#eff1f3"
  outline: "#737780"
  outline-variant: "#c3c6d1"
  surface-tint: "#3a5f94"
  primary: "#001e40"
  on-primary: "#ffffff"
  primary-container: "#003366"
  on-primary-container: "#799dd6"
  inverse-primary: "#a7c8ff"
  secondary: "#006876"
  on-secondary: "#ffffff"
  secondary-container: "#69e8fe"
  on-secondary-container: "#006774"
  tertiary: "#002504"
  on-tertiary: "#ffffff"
  tertiary-container: "#003d0b"
  on-tertiary-container: "#5ead5c"
  error: "#ba1a1a"
  on-error: "#ffffff"
  error-container: "#ffdad6"
  on-error-container: "#93000a"
  primary-fixed: "#d5e3ff"
  primary-fixed-dim: "#a7c8ff"
  on-primary-fixed: "#001b3c"
  on-primary-fixed-variant: "#1f477b"
  secondary-fixed: "#9eefff"
  secondary-fixed-dim: "#55d7ed"
  on-secondary-fixed: "#001f24"
  on-secondary-fixed-variant: "#004e59"
  tertiary-fixed: "#a3f69c"
  tertiary-fixed-dim: "#88d982"
  on-tertiary-fixed: "#002204"
  on-tertiary-fixed-variant: "#005312"
  background: "#f7f9fb"
  on-background: "#191c1e"
  surface-variant: "#e0e3e5"
  ocean-deep: "#002147"
  surface-cyan: "#E0F7FA"
  biological-green: "#43A047"
  text-main: "#1E293B"
  border-subtle: "#E2E8F0"
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: "700"
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: "600"
    lineHeight: 40px
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: "600"
    lineHeight: 32px
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: "500"
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: "400"
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: "400"
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: "400"
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: "600"
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 16px
  md: 24px
  lg: 40px
  xl: 64px
  container-max: 1280px
  gutter: 24px
---

## Brand & Style

The visual identity of this design system is rooted in **Academic Professionalism** and **Marine Biology**. It balances the rigorous, data-heavy requirements of scientific research with a serene, ocean-inspired aesthetic. The brand personality is authoritative yet accessible, evoking a sense of discovery, precision, and environmental stewardship.

The design style follows a **Modern Corporate** approach with a strong lean towards **Minimalism**. It prioritizes information density and legibility, utilizing expansive whitespace to separate complex data sets. High-quality typography and a structured grid system ensure that researchers can navigate necropsy reports, laboratory results, and epidemiological maps with cognitive ease. The integration of the dolphin silhouette logo acts as a mark of fluidity and organic life within the structured environment.

## Colors

The palette is strategically curated to reflect the marine environment while maintaining academic clarity.

- **Primary (Deep Navy):** Represents the depths of the ocean and the authority of scientific institutions. Used for navigation, primary buttons, and core branding.
- **Secondary (Soft Cyan):** Inspired by shallow coastal waters. Used for highlights, active states, and to provide "air" to the interface.
- **Tertiary (Emerald Green):** Directly represents biological health and environmental vitality. Reserved for status indicators (Positive results, healthy populations) and biological data accents.
- **Neutral (Slate/White):** The foundation of the platform. Using near-white grays for backgrounds prevents eye strain during long research sessions compared to pure white.

The default mode is **light**, providing a clean, paper-like feel familiar to academic workflows.

## Typography

**Inter** is utilized across all levels of the design system for its exceptional legibility in data-dense environments and its neutral, systematic character.

- **Headlines:** Use a tighter letter-spacing and heavier weights to establish clear section hierarchy.
- **Body Text:** Optimized for long-form reading of research notes and necropsy findings.
- **Labels:** Small, uppercase, and slightly tracked-out to differentiate metadata (like "AphiaID" or "Taxon Family") from user-generated content.
- **Scaling:** For mobile devices, `display-lg` and `headline-lg` should scale down by 20% to maintain visual balance on smaller viewports.

## Layout & Spacing

The layout follows a **Fixed Grid** philosophy on desktop to ensure that scientific tables and data visualizations remain readable and don't stretch excessively on ultrawide monitors.

- **Grid Model:** A 12-column system with a 24px gutter.
- **Rhythm:** An 8px baseline grid governs all vertical spacing, ensuring a consistent cadence between paragraphs, inputs, and components.
- **Responsive Behavior:**
  - **Desktop:** 12 columns, 40px side margins.
  - **Tablet:** 8 columns, 24px side margins.
  - **Mobile:** 4 columns, 16px side margins. Cards reflow into a single column, and data tables transition into expandable list items or scrollable horizontal containers.

## Elevation & Depth

To maintain a clean, academic appearance, depth is conveyed through **Tonal Layers** supplemented by **Ambient Shadows**.

- **Surface Tiers:** The main background is the lowest level (Neutral Slate). Data containers and cards sit on top of this in pure white (#FFFFFF), creating a clear "paper-on-desk" metaphor.
- **Shadows:** Use extremely soft, low-opacity shadows (e.g., `box-shadow: 0 4px 6px -1px rgba(0, 51, 102, 0.05)`). The shadow should have a slight Deep Navy tint to integrate with the brand's primary color palette.
- **Interaction:** Hovering over interactive cards (like a Research record) should slightly increase the shadow blur and lift the element by 2px, providing tactile feedback without breaking the minimalist aesthetic.

## Shapes

The shape language is **Rounded (Level 2)**, mirroring the organic curves of marine life and the dolphin logo while remaining professional.

- **Standard Elements:** Buttons, input fields, and small chips use a 0.5rem (8px) radius.
- **Containers:** Large cards and dashboard sections use a 1rem (16px) radius to soften the layout.
- **Specialized:** The dolphin logo and specific biological icons may use free-form organic shapes, but they must always be contained within these standardized radii when used in cards or buttons.

## Components

### Buttons

- **Primary:** Solid Deep Navy with white text. 0.5rem roundedness.
- **Secondary:** Outlined in Deep Navy with Cyan-tinted backgrounds on hover.
- **Success/Bio:** Solid Emerald Green for "Finalize Report" or "Positive Result" actions.

### Cards

- **Research Cards:** White background, subtle 8px border-radius, and a thin `border-subtle` (#E2E8F0) outline.
- **Header:** Include a small colored tab on the left representing the Research's public/private status (Cyan for Public, Navy for Private).

### Inputs & Selects

- Use high-contrast borders (Slate-300).
- Focus states should use a 2px Cyan ring to provide clear visual feedback for researchers entering extensive data.
- **WoRMS/NCBI Autocomplete:** Use a dropdown that displays the Scientific Name in bold and the common name in a smaller `label-md` style.

### Chips & Badges

- **Status Badges:** Use "Pill-shaped" (Level 3) rounding.
- **Results:** "Positivo" in Emerald Green text/background, "Negativo" in a neutral Slate, and "Inconclusivo" in a soft amber.

### Data Tables

- Header cells should use the `label-md` typography with a light Cyan background.
- Row zebra-striping is encouraged for high-density laboratory results using the softest available Cyan tint.
