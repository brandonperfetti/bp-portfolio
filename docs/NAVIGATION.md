# Navigation

## Primary Top Navigation

Shared defaults are defined in `src/lib/navigation.ts`:

- `HEADER_NAV_LINKS`
- `PRIMARY_NAV_LINKS`

Consumed by:

- `src/components/Header.tsx`
- `src/components/Footer.tsx`
- `src/app/llms.txt/route.ts` (for Primary Pages output)

Desktop + mobile nav include:

- `/about`
- `/articles`
- `/projects`
- `/tech`
- `/hermes`
- `/uses`

## Header Utilities

- Search trigger button (opens modal search).
- Theme toggle.
- Avatar/home link behavior varies by route and scroll position.

## Footer Navigation

Defaults sourced from `PRIMARY_NAV_LINKS` in `src/lib/navigation.ts`.

Footer links:

- About
- Articles
- Projects
- Tech
- Uses

Note: Footer is intentionally hidden on `/hermes` to reduce non-chat scroll and keep focus on the conversation pane.

## Route Ownership

- `src/app/page.tsx`: Home
- `src/app/articles/page.tsx`: Articles index + explorer UI
- `src/app/hermes/page.tsx`: Hermes shell container
- `src/components/HermesChat.tsx`: Hermes interaction logic
