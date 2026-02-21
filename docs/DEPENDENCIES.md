# Dependencies

## Core Runtime

- `next`, `react`, `react-dom`, `typescript`

## UI and Interaction

- `@headlessui/react`
- `next-themes`
- `clsx`
- `@heroicons/react`

## Content and MDX

- `@next/mdx`, `@mdx-js/loader`, `@mdx-js/react`
- `remark-gfm`
- `@mapbox/rehype-prism`
- `fast-glob`
- `cheerio` (content parsing helpers)

## APIs and Integrations

- `openai`
- `@sendgrid/mail`
- `feed`

## Styling Toolchain

- `tailwindcss`, `@tailwindcss/postcss`, `@tailwindcss/typography`
- `prettier`, `prettier-plugin-tailwindcss`
- `eslint`, `eslint-config-next`

## Image Processing

- `sharp` (required by Next image optimization pipeline)

When removing dependencies, check:

1. `src/app/api/*`
2. `next.config.mjs`
3. `mdx-components.tsx`
4. `typography.ts`
