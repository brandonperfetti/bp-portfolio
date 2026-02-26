# State and Data Flow

## Client State Patterns

The codebase primarily uses local React state + URL state, not a global client store.

### Header Search (`HeaderSearch`)

State:

- `isOpen`
- `query`
- `items`
- `loadState` (`idle | loading | ready | error`)
- derived `debouncedQuery`, `filteredItems`

Behavior:

- Loads index from `/api/search` on first open and caches in session storage for fast reopen.
- Keyboard control via `Cmd/Ctrl + K` and `Escape`.
- Dev fallback behavior is resilient to temporary index failures (`Retry` path + stale payload support server-side).

### Articles Explorer (`ArticlesExplorer`)

State:

- `query`
- `topic`
- debounced `query`

Behavior:

- Syncs from `useSearchParams` (`q`, `topic`; legacy `category` is read for compatibility).
- Writes back with guarded `router.replace(..., { scroll: false })`.
- Filters against server-provided article list + search text.

### Hermes (`HermesChat`)

State:

- `messages`
- `input`
- `loading`
- typing/image loading indicators
- copy feedback state
- `isChatStart` (initial welcome screen vs active chat view)

Behavior:

- Streams NDJSON chunks into transient typing buffer.
- Commits final assistant message after stream completion.
- Keeps input static while message pane scrolls.

## Server-Side Data Flow

- `src/lib/articles.ts` is the facade used by routes/components.
- Local mode returns empty article-safe results.
- Notion mode sources:
  - summaries/projections from `Portfolio CMS - Articles`
  - canonical article body from `Source Article` page blocks
- Search API (`/api/search`) returns compact records (`title`, `description`, `date`, `href`, `searchText`) for header modal filtering.
