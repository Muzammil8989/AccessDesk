# AccessDesk design system (Master)

Source of truth for the desktop renderer (`apps/desktop/src/renderer`). Page-specific overrides, if ever needed, go in `pages/<name>.md` and win over this file.

Direction: **Material Design 3** (m3.material.io). Tonal surfaces, pill buttons, filled text fields with floating labels, state layers instead of hover colour swaps, the M3 type scale, one blue brand hue, light and dark. It is an admin console for HR/IT staff, so it stays calm and dense enough for tables and forms.

## Tokens

Defined in `src/styles.css` as CSS variables and mapped into Tailwind with `@theme inline`. Components use the M3 **role names** only (`bg-surface-container`, `text-on-surface-variant`). Never write raw hex or oklch in a component.

The palette is the M3 "Vibrant" scheme generated from the brand blue `#2563EB` with `@material/material-color-utilities`, plus three extended colours (success, warning, info) harmonised to the same seed. Each has a `-container` and `on-*` pair. To change the brand colour, regenerate the light and dark blocks from a new seed and keep every pair at >= 4.5:1 (text) and >= 3:1 (outlines).

| Role                                                | Use                                                           |
| --------------------------------------------------- | ------------------------------------------------------------- |
| `surface`                                           | the page                                                      |
| `surface-container-low`                             | tonal cards, the navigation drawer                            |
| `surface-container` / `-high` / `-highest`          | table headers, search bar, text-field fill, skeletons         |
| `on-surface` / `on-surface-variant`                 | primary text / secondary text                                 |
| `primary` / `on-primary`                            | filled button, focus ring, links                              |
| `primary-container` / `on-primary-container`        | avatars, selected states of lower emphasis                    |
| `secondary-container` / `on-secondary-container`    | active navigation pill, tonal button, selected segment, chips |
| `error` / `error-container`                         | errors; pair with `on-error` / `on-error-container`           |
| `success` / `warning` / `info` and their containers | status labels and banners                                     |
| `outline` / `outline-variant`                       | field and button outlines (>= 3:1) / dividers                 |
| `inverse-surface` / `inverse-on-surface`            | snackbars and tooltips                                        |

- Older names (`background`, `card`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`, `sidebar*`) still exist as aliases of M3 roles. Prefer the M3 names in new code.
- Status is never colour alone. Always pair it with an icon or text.
- **Shape scale:** `rounded-xs` 4px (fields, snackbar, tooltip), `rounded-sm` 8px (chips, labels), `rounded-md` 12px (cards, banners), `rounded-lg` 16px, `rounded-xl` 28px, `rounded-full` (buttons, search bar, navigation pill).
- **Elevation:** `shadow-elevation-1/2/3`. Cards are tonal and flat; only the floating action bar and snackbars lift.
- Dark mode is the `.dark` class on `<html>`, managed by `lib/theme.ts` (Light / Dark / System, persisted).

## Typography

Roboto Flex Variable, bundled locally (`@fontsource-variable/roboto-flex`). The CSP is `font-src 'self'` and the app must work offline, so no CDN fonts. Use the M3 type scale tokens, not raw sizes:

| Class                                     | Use                                 |
| ----------------------------------------- | ----------------------------------- |
| `text-headline-small` (24/32)             | the page title (`h1`)               |
| `text-title-large` (22/28)                | card titles, sign-in title          |
| `text-title-medium` (16/24, 500)          | section titles, empty-state titles  |
| `text-title-small` (14/20, 500)           | small headings, navigation groups   |
| `text-body-large` / `-medium` / `-small`  | 16 / 14 / 12: text, fields, helpers |
| `text-label-large` / `-medium` / `-small` | buttons, table headers, labels      |

`lib/utils.ts` `cn()` knows these names, so a type-scale class and a colour class never cancel each other. One `h1` per page, then `h2`, then `h3`, with no skipped levels.

## Components

- **Buttons** (`ui/button.tsx`): pill, 40px. `default` = filled, `secondary` = tonal, `outline` = outlined, `ghost` = text, `destructive` = filled error. Disabled uses 12% container and 38% content.
- **Text fields** (`ui/form-field.tsx`, `ui/select-field.tsx`, `ui/field.tsx`): filled, 56px, floating label inside, 1px bottom indicator (2px primary on focus, 2px error when invalid). Supporting text and errors sit under the field. The label stays a real `<label htmlFor>`; selects stay native `<select>`.
- **Search bar** (`ui/search-field.tsx`): full radius, `surface-container-high`, leading icon, needs an `aria-label`.
- **Segmented button** (`ui/segmented-control.tsx`, theme toggle): outlined, the selected segment is `secondary-container` with a check.
- **Cards** (`ui/card.tsx`): 12px, `tonal` (default) or `outlined`. Tables and lists use an outlined container.
- **Labels** (`ui/badge.tsx`): 24px, 8px radius, tonal container colours, with an icon for status.
- **Banners** (`ui/alert.tsx`): container colours, 12px, bare icon. **Snackbars** (`toaster.tsx`): inverse surface, 4px. **Tooltips** (`ui/tooltip.tsx`): inverse surface, 4px, no arrow.
- **Navigation** (`components/app-layout.tsx`): drawer `w-72` expanded, rail `w-20` collapsed (header button or `Ctrl+B`, kept in `localStorage` as `accessdesk.sidebar`). The open screen is a 48px `secondary-container` pill.
- **Empty states** (`components/empty-state.tsx`): a bare 40px icon, a title and a line of help.

## State layers

`@utility state-layer` in `styles.css` puts a translucent overlay in the content colour on any control that has no tint of its own: hover 8%, focus and pressed 10%. Use it on buttons, navigation items, chips, icon buttons and clickable rows. Table rows use `hover:bg-on-surface/8`.

## Motion

Durations short 150ms, medium 250ms, long 350ms; easing `ease-standard` (M3 standard) and `ease-emphasized-decelerate`. Animate colour, opacity and transform only, never width or height. Motion marks state change only. `prefers-reduced-motion` collapses all durations globally.

## Interaction rules

- Pointer targets are at least 40px (default button `h-10`, large `h-12`, icon button `size-10`).
- Focus ring: 2px solid `primary`, with offset. Never remove it. Text fields show focus with the 2px bottom indicator and the label colour.
- Every clickable element has `cursor-pointer`. Icon-only buttons need an `aria-label`. Decorative icons get `aria-hidden`.
- **Icons have no background.** Draw a Lucide icon bare, in a text colour (`text-primary`, `text-on-surface-variant`, `text-error`). Do not put it in a tinted circle or square. Kept on purpose: the logo mark (`brand.tsx`), initials avatars (text, not icons), the active navigation pill (it marks the selected screen), and the transient state layer on icon buttons.
- Errors sit next to the field (`aria-describedby`). Forms with several fields also get a focusable error summary that links to each invalid field.
- Icons are `lucide-react` SVGs only, never emoji.
- Never pass a function `className` (NavLink) to a Radix `asChild` trigger: Slot joins class names as strings. Work out the active state first (`useMatch`).
- Hints on icon-only controls use `Tooltip` / `WithTooltip` from `components/ui/tooltip.tsx`, never the `title` attribute. A tooltip adds to an accessible name; it never replaces the `aria-label` or visually hidden text.
- Long forms: one tonal card per section (a bare icon, an `h2` title naming the fieldset, one-line description), and from `xl` up a summary column beside the form that stays in view (`sticky`). Below `xl` the Create and Clear buttons float in an action bar at the bottom of the window.

## Do not

- Hero or landing-page patterns. This is an application shell.
- Native-select replacements that drop real `<select>` semantics (tests and screen readers rely on them).
- Hard-coded colours, or `text-white` on a coloured surface (use the `on-*` role).
- Raw `text-sm` / `font-semibold` sizing for new text: use the M3 type scale tokens.
