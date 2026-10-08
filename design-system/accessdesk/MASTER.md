# AccessDesk design system (Master)

Source of truth for the desktop renderer (`apps/desktop/src/renderer`). Page-specific overrides, if ever needed, go in `pages/<name>.md` and win over this file.

Direction: **Minimalism / Swiss**. Neutral slate surfaces, one blue brand hue, high contrast, generous whitespace, light and dark. It is an admin console for HR/IT staff, so the style is calm and dense enough for tables and forms, not marketing.

## Tokens

Defined in `src/styles.css` (CSS variables, mapped into Tailwind with `@theme inline`). Components use semantic names only (`bg-primary`, `text-muted-foreground`). Never write raw hex or oklch in a component.

| Token                          | Light                     | Dark             | Use                                                           |
| ------------------------------ | ------------------------- | ---------------- | ------------------------------------------------------------- |
| `background`                   | slate-50                  | deep navy        | page                                                          |
| `card`                         | white                     | raised navy      | cards, inputs, popovers                                       |
| `primary`                      | blue (about #2563EB)      | light blue       | primary action, active nav, focus ring                        |
| `accent`                       | blue tint                 | blue tint        | hover and selected backgrounds                                |
| `muted-foreground`             | slate-600                 | slate-300        | secondary text (>= 4.5:1)                                     |
| `destructive`                  | red                       | light red        | errors, dangerous actions; pair with `destructive-foreground` |
| `success` / `warning` / `info` | deep green / amber / blue | lighter variants | status text on a 15% tint                                     |
| `input`                        | mid slate                 | mid slate        | field borders (>= 3:1 non-text contrast)                      |
| `border`                       | slate-200                 | white at 10%     | separators                                                    |

- Status is never colour alone. Always pair with an icon or text.
- Radius `--radius` is 0.5rem. Shadows `shadow-xs/sm/md` are slate-tinted. Use shadows sparingly: cards `shadow-xs`, menus `shadow-md`.
- Dark mode is the `.dark` class on `<html>`, managed by `lib/theme.ts` (Light / Dark / System, persisted).

## Typography

Inter Variable, bundled locally (`@fontsource-variable/inter`). The CSP is `font-src 'self'` and the app must work offline, so no CDN fonts. Body 14 to 16px, line-height 1.5, page title `text-2xl font-semibold`, section title `text-lg font-semibold`. One `h1` per page, then `h2`, then `h3`, with no skipped levels.

## Motion

Durations: fast 150ms, base 200ms, slow 250ms; easing `ease-standard`. Animate colour, opacity and transform only, never width or height. Motion marks state change only. `prefers-reduced-motion` collapses all durations globally.

## Interaction rules

- Pointer targets are at least 40px (default button `h-10`, large `h-11`).
- Focus ring: 2px solid `ring`, with offset. Never remove it.
- Every clickable element has `cursor-pointer`. Icon-only buttons need an `aria-label`. Decorative icons get `aria-hidden`.
- Errors sit next to the field (`aria-describedby`). Forms with several fields also get a focusable error summary that links to each invalid field.
- Icons are `lucide-react` SVGs only, never emoji.

## Do not

- Hero or landing-page patterns. This is an application shell.
- Native-select replacements that drop real `<select>` semantics (tests and screen readers rely on them).
- Hard-coded colours, or `text-white` on a coloured surface (use the `*-foreground` token).
