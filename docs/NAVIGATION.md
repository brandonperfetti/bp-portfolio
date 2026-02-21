# Navigation

## Primary Top Navigation

Defined in `src/components/Header.tsx`.

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

Defined in `src/components/Footer.tsx`.

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
