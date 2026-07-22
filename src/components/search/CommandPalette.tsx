'use client'

import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import BM25 from 'okapibm25'
import { Command } from 'cmdk'
import {
  ArrowRight,
  Copy,
  FileText,
  Laptop,
  MessageCircle,
  Moon,
  Search,
  Sun,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useDebouncedValue } from '@/lib/useDebouncedValue'

type SearchItem = {
  title: string
  description: string
  date: string
  href: string
  searchText: string
}

const NAV_ACTIONS: Array<{ label: string; href: string }> = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about' },
  { label: 'Articles', href: '/articles' },
  { label: 'Projects', href: '/projects' },
  { label: 'Tech', href: '/tech' },
  { label: 'Hermes', href: '/hermes' },
  { label: 'Uses', href: '/uses' },
]

const INDEX_TTL_MS = 5 * 60 * 1000

/**
 * Cmd/Ctrl+K command palette (wow moment #2): ranked article search plus
 * actions (navigate, theme toggle, open Hermes, copy link).
 *
 * @remarks Replaces v3's substring-over-sessionStorage HeaderSearch. Ranking
 * is BM25 over the `/api/search` index (fetched once per open, cached with a
 * short TTL). cmdk supplies combobox/listbox ARIA semantics and full keyboard
 * navigation; the trigger button preserves the v3 shortcut affordance.
 */
export function CommandPalette() {
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<SearchItem[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const fetchedAt = useRef(0)
  const debouncedQuery = useDebouncedValue(query, 120)

  // Global shortcut: Cmd/Ctrl+K toggles, Escape closes (v3 UX, preserved).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Load (and short-TTL cache) the search index when the palette opens.
  useEffect(() => {
    if (!open) return
    const isFresh = items && Date.now() - fetchedAt.current < INDEX_TTL_MS
    if (isFresh) return
    let cancelled = false
    setLoadError(false)
    fetch('/api/search')
      .then((res) => {
        if (!res.ok) throw new Error(`search index ${res.status}`)
        return res.json()
      })
      .then((data: SearchItem[]) => {
        if (cancelled) return
        setItems(data)
        fetchedAt.current = Date.now()
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
    return () => {
      cancelled = true
    }
  }, [open, items])

  // BM25-ranked article results for the current query.
  const rankedArticles = useMemo(() => {
    if (!items?.length) return []
    const q = debouncedQuery.trim().toLowerCase()
    if (!q) {
      return items.slice(0, 6)
    }
    const corpus = items.map((item) =>
      `${item.title} ${item.description} ${item.searchText}`.toLowerCase(),
    )
    const scores = BM25(corpus, q.split(/\s+/)) as number[]
    return items
      .map((item, index) => ({ item, score: scores[index] ?? 0 }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(({ item }) => item)
  }, [items, debouncedQuery])

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])

  const go = useCallback(
    (href: string) => {
      close()
      router.push(href)
    },
    [close, router],
  )

  const copyCurrentUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
    } catch {
      // Clipboard unavailable (permissions/insecure context) — noop.
    }
    close()
  }, [close])

  const otherTheme = resolvedTheme === 'dark' ? 'light' : 'dark'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open command palette (Command+K or Control+K)"
        className="group flex h-9 items-center gap-2 rounded-full bg-white/90 px-3 text-sm text-zinc-500 shadow-lg ring-1 shadow-zinc-800/5 ring-zinc-900/5 backdrop-blur transition hover:text-zinc-700 dark:bg-zinc-800/90 dark:text-zinc-400 dark:ring-white/10 dark:hover:text-zinc-300"
      >
        <Search aria-hidden className="h-4 w-4" />
        <span className="hidden sm:inline">Search</span>
        <kbd className="pointer-events-none hidden items-center gap-0.5 rounded border border-zinc-300/70 px-1.5 font-sans text-[11px] leading-5 font-medium text-zinc-400 sm:inline-flex dark:border-zinc-600/70 dark:text-zinc-500">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <Command.Dialog
        open={open}
        onOpenChange={(next) => (next ? setOpen(true) : close())}
        label="Command palette"
        shouldFilter={false}
        className="fixed inset-x-4 top-24 z-50 mx-auto max-w-xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
        overlayClassName="fixed inset-0 z-40 bg-zinc-900/40 backdrop-blur-xs dark:bg-black/60"
      >
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Search articles or type a command…"
          className="w-full border-b border-zinc-100 bg-transparent px-4 py-3 text-base text-zinc-900 outline-hidden placeholder:text-zinc-400 dark:border-zinc-800 dark:text-zinc-100"
        />
        <Command.List className="max-h-96 overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
            {loadError
              ? 'Search is unavailable right now — try again shortly.'
              : 'No results found.'}
          </Command.Empty>

          {rankedArticles.length > 0 && (
            <Command.Group
              heading="Articles"
              className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-zinc-400"
            >
              {rankedArticles.map((item) => (
                <Command.Item
                  key={item.href}
                  value={item.href}
                  onSelect={() => go(item.href)}
                  className="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 text-sm text-zinc-700 data-[selected=true]:bg-zinc-100 data-[selected=true]:text-zinc-900 dark:text-zinc-300 dark:data-[selected=true]:bg-zinc-800 dark:data-[selected=true]:text-zinc-50"
                >
                  <FileText
                    aria-hidden
                    className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{item.title}</span>
                    <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {item.description}
                    </span>
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          <Command.Group
            heading="Go to"
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-zinc-400"
          >
            {NAV_ACTIONS.filter(
              (action) =>
                !debouncedQuery ||
                action.label
                  .toLowerCase()
                  .includes(debouncedQuery.toLowerCase()),
            ).map((action) => (
              <Command.Item
                key={action.href}
                value={`nav-${action.label}`}
                onSelect={() => go(action.href)}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-700 data-[selected=true]:bg-zinc-100 data-[selected=true]:text-zinc-900 dark:text-zinc-300 dark:data-[selected=true]:bg-zinc-800 dark:data-[selected=true]:text-zinc-50"
              >
                <ArrowRight aria-hidden className="h-4 w-4 text-zinc-400" />
                {action.label}
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group
            heading="Actions"
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-zinc-400"
          >
            <Command.Item
              value="action-theme"
              onSelect={() => {
                setTheme(otherTheme)
                close()
              }}
              className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-700 data-[selected=true]:bg-zinc-100 data-[selected=true]:text-zinc-900 dark:text-zinc-300 dark:data-[selected=true]:bg-zinc-800 dark:data-[selected=true]:text-zinc-50"
            >
              {resolvedTheme === 'dark' ? (
                <Sun aria-hidden className="h-4 w-4 text-zinc-400" />
              ) : (
                <Moon aria-hidden className="h-4 w-4 text-zinc-400" />
              )}
              Switch to {otherTheme} mode
            </Command.Item>
            <Command.Item
              value="action-hermes"
              onSelect={() => go('/hermes')}
              className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-700 data-[selected=true]:bg-zinc-100 data-[selected=true]:text-zinc-900 dark:text-zinc-300 dark:data-[selected=true]:bg-zinc-800 dark:data-[selected=true]:text-zinc-50"
            >
              <MessageCircle aria-hidden className="h-4 w-4 text-zinc-400" />
              Ask Hermes
            </Command.Item>
            <Command.Item
              value="action-copy-url"
              onSelect={copyCurrentUrl}
              className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-700 data-[selected=true]:bg-zinc-100 data-[selected=true]:text-zinc-900 dark:text-zinc-300 dark:data-[selected=true]:bg-zinc-800 dark:data-[selected=true]:text-zinc-50"
            >
              <Copy aria-hidden className="h-4 w-4 text-zinc-400" />
              Copy current page link
            </Command.Item>
            <Command.Item
              value="action-system-theme"
              onSelect={() => {
                setTheme('system')
                close()
              }}
              className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-700 data-[selected=true]:bg-zinc-100 data-[selected=true]:text-zinc-900 dark:text-zinc-300 dark:data-[selected=true]:bg-zinc-800 dark:data-[selected=true]:text-zinc-50"
            >
              <Laptop aria-hidden className="h-4 w-4 text-zinc-400" />
              Use system theme
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command.Dialog>
    </>
  )
}
