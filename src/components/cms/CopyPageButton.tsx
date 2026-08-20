'use client'

import { ClipboardDocumentIcon } from '@heroicons/react/24/outline'
import { useEffect, useRef, useState } from 'react'

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
 * "Copy page" button on article pages: copies the article's Markdown export so
 * readers can paste it into an LLM. Takes pre-rendered `markdown` because
 * conversion happens server-side in the content layer.
 *
 * @remarks Collapsed from a menu-of-one dropdown to a single button (#25/W5B1e)
 * — there was only ever one action. Copy falls back to a hidden-textarea
 * `execCommand` path for non-secure contexts where the async clipboard API is
 * unavailable. The `label` is supplied by SiteSettings (resolved upstream in
 * `getCmsSiteSettings`, empty → "Copy page"); whether the button renders at all
 * is decided by the article page, not here.
 *
 * @param markdown Pre-rendered Markdown export copied to the clipboard.
 * @param label Idle button label; defaults to `'Copy page'`.
 */
export function CopyPageButton({
  markdown,
  label = 'Copy page',
}: {
  markdown: string
  label?: string
}) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [])

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      onClick={async () => {
        try {
          await copyText(markdown)
          setCopied(true)
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current)
          }
          timeoutRef.current = setTimeout(() => {
            setCopied(false)
          }, 1400)
        } catch (error) {
          console.error('[CopyPageButton] copy failed', {
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }}
    >
      <ClipboardDocumentIcon className="h-4 w-4" />
      {copied ? 'Copied' : label}
    </button>
  )
}
