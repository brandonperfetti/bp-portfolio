'use client'

import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from '@headlessui/react'
import { ClipboardDocumentIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { Fragment, useEffect, useId, useRef, useState } from 'react'

import { usePrefersReducedMotion } from '@/lib/motion/usePrefersReducedMotion'
import type { ResolvedShareTarget } from '@/lib/share/shareTargets'

/**
 * Copies `value` to the clipboard, mirroring `CopyPageButton`: the async
 * Clipboard API where available, else a hidden-`textarea` `execCommand('copy')`
 * fallback for non-secure contexts.
 */
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
 * Props for {@link ShareModal}. Purely presentational — the parent owns the
 * `open` state and provides the already-resolved `targets`.
 */
export interface ShareModalProps {
  /** Whether the dialog is open. */
  open: boolean
  /** Called on Escape, backdrop click, or the close button. */
  onClose: () => void
  /** Absolute canonical URL of the page being shared. */
  url: string
  /** Human title of the page. */
  title: string
  /** The resolved destinations to offer. */
  targets: ResolvedShareTarget[]
}

/**
 * The desktop share dialog: an icon row of intent links plus a copy-link
 * field (the floor affordance).
 *
 * @remarks Built on Headless UI's `Dialog`, which supplies the focus-trap,
 * Escape-to-close, focus restoration, and `role="dialog"`/`aria-modal`
 * wiring; the `DialogTitle` names it via `aria-labelledby`. Only targets whose
 * `buildIntentUrl` is non-null become icon links — `copylink` (whose builder
 * returns `null`) is represented once, by the copy-link field, never in the
 * row. The `Transition` collapses to an instant show/hide under
 * `prefers-reduced-motion`, honoring the site-wide motion invariant. Every
 * surface carries `dark:` classes for light/dark parity.
 */
export function ShareModal({
  open,
  onClose,
  url,
  title,
  targets,
}: ShareModalProps) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const linkInputId = useId()

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [])

  // A freshly reopened dialog should not still read "Copied".
  useEffect(() => {
    if (!open) setCopied(false)
  }, [open])

  const handleCopy = async () => {
    try {
      await copyText(url)
      setCopied(true)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      timeoutRef.current = setTimeout(() => {
        setCopied(false)
      }, 1400)
    } catch (error) {
      console.error('[ShareModal] copy failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // Only navigable destinations get an icon link; copylink returns null.
  const intentTargets = targets.filter(
    (target) => target.buildIntentUrl({ url, title }) !== null,
  )

  // Under reduced motion, hand the Transition empty class strings so it toggles
  // instantly instead of fading/scaling.
  const fade = prefersReducedMotion
    ? {}
    : {
        enter: 'ease-out duration-150',
        enterFrom: 'opacity-0',
        enterTo: 'opacity-100',
        leave: 'ease-in duration-100',
        leaveFrom: 'opacity-100',
        leaveTo: 'opacity-0',
      }

  const panelMotion = prefersReducedMotion
    ? {}
    : {
        enter: 'ease-out duration-150',
        enterFrom: 'opacity-0 scale-95',
        enterTo: 'opacity-100 scale-100',
        leave: 'ease-in duration-100',
        leaveFrom: 'opacity-100 scale-100',
        leaveTo: 'opacity-0 scale-95',
      }

  return (
    <Transition show={open} as={Fragment}>
      <Dialog onClose={onClose} className="relative z-50">
        <TransitionChild as={Fragment} {...fade}>
          <div
            className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm dark:bg-black/60"
            aria-hidden="true"
          />
        </TransitionChild>

        <div className="fixed inset-0 flex items-center justify-center p-4">
          <TransitionChild as={Fragment} {...panelMotion}>
            <DialogPanel className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
              <div className="flex items-center justify-between">
                <DialogTitle className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Share
                </DialogTitle>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="-m-1 rounded-md p-1 text-zinc-500 transition hover:text-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/80 dark:text-zinc-400 dark:hover:text-zinc-200 dark:focus-visible:ring-teal-400/80"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>

              {intentTargets.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-4">
                  {intentTargets.map((target) => {
                    const href = target.buildIntentUrl({ url, title })
                    if (!href) return null
                    const Icon = target.icon
                    return (
                      <a
                        key={target.id}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Share on ${target.label}`}
                        className="group -m-1 rounded-md p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/80 dark:focus-visible:ring-teal-400/80"
                      >
                        <Icon className="h-6 w-6 fill-zinc-500 transition group-hover:fill-zinc-600 dark:fill-zinc-400 dark:group-hover:fill-zinc-300" />
                      </a>
                    )
                  })}
                </div>
              )}

              <div className="mt-6">
                <label htmlFor={linkInputId} className="sr-only">
                  Page link
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id={linkInputId}
                    type="text"
                    readOnly
                    value={url}
                    className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                  />
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <ClipboardDocumentIcon className="h-4 w-4" />
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  )
}
