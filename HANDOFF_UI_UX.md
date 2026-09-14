# UI-UX Pro Max handoff — Luyen Thi THPT

## Scope
The visual foundation in `src/app/globals.css` now exposes semantic Pro Max tokens while preserving existing module aliases. Page logic and route behavior are intentionally unchanged.

## Foundations
- **Token architecture:** primitive `--palette-*` → semantic `--color-*` → component contracts (`--button-*`, `--field-*`, `--card-*`). This follows the cloned design-system skill and keeps theme switching centralized.
- **Palette:** navy/slate base with accessible green accent (`--color-primary`, `--color-accent`) and semantic status colors. Legacy `--primary`, `--surface`, `--text` tokens remain supported.
- **Typography:** Be Vietnam Pro (`--font-body` / `--font-heading`) for Vietnamese readability; JetBrains Mono via `--font-code` for IDs, timers, and code-like data.
- **Spacing:** 4px base scale with aliases `--space-xs` through `--space-3xl` (4–64px).
- **Elevation:** `--shadow-depth-sm` … `--shadow-depth-xl`; existing `--shadow-*` values continue to style modules.
- **Glass:** `.card` and `.theme-toggle` consume `--glass-bg`, `--glass-border`, `--glass-blur`, and saturation tokens. Use `.card.elevated` for dialogs/featured panels.

## Component guidance
- Buttons use `.btn` plus `.secondary`, `.outline`, `.ghost`, `.danger`, `.small`, `.large`, `.block` modifiers.
- Inputs/selects/textareas share `.input`/`.select`/`.textarea`; invalid fields should set `aria-invalid="true"`.
- Clickable cards should add `.interactive`; do not use layout-shifting scale hovers.
- Status labels use `.badge`, `.badge-success`, `.badge-warning`, `.badge-danger`, `.badge-info`.

## Accessibility and responsive behavior
- Visible `:focus-visible` ring (3px) is applied to controls, links, and tabs; keyboard skip-link is available globally. `scroll-padding-block` keeps focused targets from being obscured by sticky chrome.
- Touch controls stay at least 44px on mobile; form text is 16px to prevent iOS zoom.
- `prefers-reduced-motion` disables transitions/animations; `prefers-reduced-transparency` and unsupported `backdrop-filter` fall back to opaque surfaces.
- `forced-colors: active` adds explicit CanvasText borders and Highlight focus outlines.
- Validate at 375px, 768px, 1024px, and 1440px; avoid horizontal overflow and content hidden beneath fixed navigation.

## Contrast evidence (WCAG relative luminance)
| Pair | Ratio | Result |
|---|---:|---|
| Light primary text `#0f1f3d` / page `#eef2f7` | 14.55:1 | AA/AAA normal text |
| Light body `#24365a` / page `#eef2f7` | 10.67:1 | AA/AAA normal text |
| Light muted `#5a6b8c` / page `#eef2f7` | 4.77:1 | AA normal text |
| Light primary button `#1d4ed8` / white | 6.70:1 | AA normal text |
| Dark primary text `#eef3fd` / page `#0b1327` | 16.60:1 | AA/AAA normal text |
| Dark body `#c4d1e9` / page `#0b1327` | 12.00:1 | AA/AAA normal text |
| Dark muted `#93a5c6` / page `#0b1327` | 7.42:1 | AA/AAA normal text |
| Dark primary `#7ea4ff` / surface `#131f3d` | 6.69:1 | AA normal text |

These are token-pair checks, not a rendered-page accessibility certification. Re-test opacity, images, gradients, and module-specific hard-coded colors in browser.

## Migration checklist
1. Replace hard-coded colors with semantic aliases where convenient; do not remove legacy aliases until all modules migrate.
2. Prefer spacing aliases over arbitrary margins.
3. Use SVG icon components (Lucide/Heroicons), never emoji glyphs for navigation/actions.
4. Verify contrast (4.5:1 normal text, 3:1 large text) in both light and dark themes.
