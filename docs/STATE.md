# State & data flow

## Server (content)

Payload (Postgres) → Local API → `src/lib/cms/*Repo.ts` (unstable_cache +
tags) → stable `Cms*` types → RSC pages. Publishing triggers hook-driven
revalidation, so there is no client content state.

Rules:

- Pages never call `getPayload()` directly — always go through a repo module
  so caching, access control (`overrideAccess: false`), and shape mapping
  stay in one place.
- Repos return `null` when a collection is empty so pages can fall back to
  the retained v3 hard-coded content.

## Client (interaction)

- **URL is the state store** for explorers: `/articles` (`q`, `topic`),
  `/tech` (`q`, `category`, `sort`). Pattern: local `useState` seeded from
  `useSearchParams`, debounced, mirrored back via `router.replace` — see
  `TechExplorer`/`ArticlesExplorer` before writing a new one.
- **Theme:** `next-themes` (`attribute="class"`) + `ThemeWatcher` system sync
  (`src/app/(frontend)/providers.tsx`). Components read `resolvedTheme` only
  after mount (hydration guard).
- **Chat:** `useChat` (Vercel AI SDK) inside `HermesChat`; transient UI state
  only, no persistence.
- **Palette:** open/query state local to `CommandPalette`; index fetch cached
  in a ref with a 5-minute TTL.
- No global client state library — introduce one only with a documented need.
