# Styling

## Stack

- Tailwind CSS 4 via `src/styles/tailwind.css`.
- Typography plugin configured through `typography.ts`.
- Prism code highlighting styles in `src/styles/prism.css`.

## Conventions

- Keep utility-first styling inline in components.
- Reuse existing component primitives (`Button`, `Card`, `Container`) before introducing new wrappers.
- Prefer existing color semantics (`zinc`, `teal`) to keep visual consistency.

## Mobile Input Font Size

- To prevent iOS Safari auto-zoom on focus, form controls must render at `16px` on mobile.
- Use `text-base sm:text-sm` for `input`, `textarea`, and `select` controls unless a specific control requires a larger size.
- Keep this rule consistent across Hermes, search, and all form surfaces.

## Cursor UX Rules

Global base layer in `tailwind.css` sets:

- pointer cursor for interactive controls
- not-allowed for disabled controls

When adding controls, preserve semantic `button`/`a` usage and disabled states to benefit from this baseline.

## Theme Support

- Uses `next-themes`.
- Dark mode driven by `.dark` class variant.
- Components should include dark mode classes for readable contrast.

## Icons

- Project-local icon components in `src/icons` are the default pattern.
- Heroicons are used where already introduced (e.g., search modal close icon).
- Match existing line weight and size rhythm when adding/replacing icons.
