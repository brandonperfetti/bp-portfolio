# State and Data Flow

## Client State Patterns
The codebase primarily uses local React state and URL state, not a global store.

### Header Search (`HeaderSearch`)
State:
- `isOpen`
- `query`
- `items`
- `isLoading`
- derived `debouncedQuery`, `filteredItems`

Behavior:
- Loads index once per open session.
- Keyboard control via `Cmd/Ctrl + K` and `Escape`.

### Articles Explorer (`ArticlesExplorer`)
State:
- `query`
- `category`
- debounced `query`

Behavior:
- Syncs state from `useSearchParams`.
- Writes back via `router.replace` for shareable URLs.
- Filters against server-provided article list.

### Hermes (`HermesChat`)
State:
- `messages`
- `input`
- `loading`
- typing/image loading indicators
- copy feedback state

Behavior:
- Streams NDJSON chunks into transient typing buffer.
- Commits final assistant message after stream completion.
- Keeps input static while message pane scrolls.

## Server-Side Data Flow
- Articles are assembled server-side from MDX files (`lib/articles.ts`).
- API endpoints return JSON/stream payloads for client features.
