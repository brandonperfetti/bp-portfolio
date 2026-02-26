'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline'
import rehypePrism from '@mapbox/rehype-prism'
import ReactMarkdown from 'react-markdown'

type RehypePlugin = NonNullable<
  React.ComponentProps<typeof ReactMarkdown>['rehypePlugins']
>[number]

const prismRehypePlugin = rehypePrism as unknown as RehypePlugin

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
      <ReactMarkdown rehypePlugins={[prismRehypePlugin]}>
        {`\`\`\`${language}\n${code}\n\`\`\``}
      </ReactMarkdown>
    </div>
  )
}
