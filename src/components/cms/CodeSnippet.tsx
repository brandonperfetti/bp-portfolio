'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline'
import rehypePrism from '@mapbox/rehype-prism'
import ReactMarkdown from 'react-markdown'

type RehypePlugins = NonNullable<
  React.ComponentProps<typeof ReactMarkdown>['rehypePlugins']
>

// ignoreMissing: unregistered languages render unhighlighted instead of
// throwing "Unknown language" — migrated articles carry values (e.g.
// `none`) outside prism's registry, and a throw here 500s the article.
const rehypePlugins = [
  [rehypePrism, { ignoreMissing: true }],
] as unknown as RehypePlugins

/** Languages that mean "no highlighting" — emit a bare code fence. */
const PLAIN_LANGUAGES = new Set(['', 'none', 'plain', 'plaintext', 'text'])

const fenceLanguage = (language: string) => {
  const normalized = language.trim().toLowerCase()
  // Only pass through safe token characters; anything else gets a bare fence.
  if (PLAIN_LANGUAGES.has(normalized)) return ''
  return /^[a-z0-9#+-]+$/.test(normalized) ? normalized : ''
}

async function copyText(value: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }
}

/**
 * Prism-highlighted code block with a copy button, fed by CMS code blocks.
 *
 * @remarks Language handling is deliberately defensive: rehype-prism runs
 * with `ignoreMissing` and "plain" aliases collapse to a bare fence,
 * because migrated articles carry language values outside prism's registry
 * (e.g. `none`) that previously threw during render and 500'd the whole
 * article page. Copy falls back to `execCommand` for non-secure contexts.
 */
export function CodeSnippet({
  language,
  code,
}: {
  language: string
  code: string
}) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={copied ? 'Code copied' : 'Copy code'}
        onClick={async (event) => {
          event.preventDefault()
          event.stopPropagation()
          try {
            await copyText(code)
            setCopied(true)
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current)
            }
            timeoutRef.current = setTimeout(() => {
              setCopied(false)
            }, 1400)
          } catch {
            setCopied(false)
          }
        }}
        className="absolute top-3 right-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-700/70 bg-zinc-900/70 text-zinc-300 transition hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/70"
      >
        {copied ? (
          <CheckIcon className="h-4 w-4" />
        ) : (
          <ClipboardDocumentIcon className="h-4 w-4" />
        )}
      </button>
      <ReactMarkdown rehypePlugins={rehypePlugins}>
        {`\`\`\`${fenceLanguage(language)}\n${code}\n\`\`\``}
      </ReactMarkdown>
    </div>
  )
}
