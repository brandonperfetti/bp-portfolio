'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

/**
 * Client channel that lets a gated article's member-unlocked Markdown reach the
 * "Copy page" button after it streams in — without pulling `auth()` up into the
 * page level (which would break the route's partial prerender, #76 B2/B3).
 *
 * The button lives in the prerendered shell (the top actions row) with the
 * signed-out *teaser* Markdown baked into its `markdown` prop, so the static
 * output stays byte-identical for anonymous visitors. When a signed-in member's
 * `AuthGatedArticleBody` resolves inside its `<Suspense>` boundary, it renders a
 * `<MemberMarkdownOverride>` carrying the unlocked Markdown; that override
 * publishes into this context on mount and the button swaps to copying the
 * unlocked body (#106). With no provider — or before an override streams in —
 * the button keeps using its own prop, so non-gated and signed-out paths are
 * unchanged.
 */
type ArticleCopyMarkdown = {
  /** Member-unlocked Markdown once it has streamed in; `undefined` until then. */
  override: string | undefined
  setOverride: (markdown: string) => void
}

const ArticleCopyMarkdownContext = createContext<ArticleCopyMarkdown | null>(
  null,
)

/**
 * Wraps a gated article's actions row + body so the streamed member override can
 * reach the copy button. Rendered only for gated articles, so non-gated pages
 * gain no client boundary (their copy button reads its prop directly).
 */
export function ArticleCopyMarkdownProvider({
  children,
}: {
  children: ReactNode
}) {
  const [override, setOverride] = useState<string | undefined>(undefined)
  const value = useMemo(() => ({ override, setOverride }), [override])
  return (
    <ArticleCopyMarkdownContext.Provider value={value}>
      {children}
    </ArticleCopyMarkdownContext.Provider>
  )
}

/**
 * Read the member-unlocked Markdown override, if one has streamed in. Returns
 * `undefined` outside a provider (non-gated / other pages) or before the member
 * body resolves — callers fall back to their own prerendered Markdown.
 */
export function useArticleCopyMarkdownOverride(): string | undefined {
  return useContext(ArticleCopyMarkdownContext)?.override
}

/**
 * Publishes the member-unlocked Markdown into the copy-markdown context on
 * mount. Renders nothing; it exists only to move the copy source behind the
 * auth-gated `<Suspense>` child (#106). `AuthGatedArticleBody` renders it for an
 * authenticated viewer alongside the visible unlocked body, so the copied
 * Markdown always matches what the member is reading.
 */
export function MemberMarkdownOverride({ markdown }: { markdown: string }) {
  const setOverride = useContext(ArticleCopyMarkdownContext)?.setOverride
  useEffect(() => {
    setOverride?.(markdown)
  }, [setOverride, markdown])
  return null
}
