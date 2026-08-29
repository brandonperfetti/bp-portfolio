'use client'

import { useEffect, useRef } from 'react'

import { useConsentManager } from '@c15t/react'
import { Dialog, Switch } from 'radix-ui'

import { Button } from '@/components/ui/button'

import { markExplicitConsentChoice } from './consent-config'
import { useConsentConfig } from './consent-context'
import {
  type ConsentTriggerCapture,
  restoreConsentTriggerFocus,
  takeConsentTrigger,
} from './consent-focus'

/**
 * Custom "Manage cookies" dialog in bp's design system — headless c15t driven
 * by `useConsentManager()`. Radix `Dialog` supplies the focus trap,
 * Escape-to-close, return-focus, and scroll lock; Radix `Switch` is a real
 * `role="switch"` control. Open state is c15t's `activeUI` so the banner's
 * "Customize" and the footer "Manage cookies" button both drive it.
 *
 * @remarks
 * Copy and the offered categories are CMS-driven ({@link useConsentConfig});
 * only enabled categories render, each bound to its c15t consent name. Defaults
 * reproduce today's two-row (Essential always-on + Analytics) dialog and its
 * disclosure copy (the Consent Mode v2 cookieless-ping caveat, the
 * Clerk/Turnstile essential-cookie note) — resolving the code-review disclosure
 * gap (Sp-2). Reject/Save/Accept are explicit choices, so they clear the #103
 * auto-grant marker ({@link markExplicitConsentChoice}). See docs/ANALYTICS.md.
 */
export function CookieDialog() {
  const {
    activeUI,
    selectedConsents,
    setSelectedConsent,
    saveConsents,
    setActiveUI,
  } = useConsentManager()
  const { dialog, categories } = useConsentConfig()
  const rows = categories.filter((c) => c.enabled)

  const open = activeUI === 'dialog'

  const close = () => setActiveUI('none')

  const contentRef = useRef<HTMLDivElement>(null)
  // #112: the trigger recorded synchronously in its own click handler. This is
  // the authoritative return target — `document.activeElement` (below) is
  // already `<body>` for the banner flows, because `CookieBanner` un-renders
  // itself the moment `activeUI` becomes 'dialog', taking the "Customize" /
  // "cookie details" button with it before this effect ever runs.
  const captureRef = useRef<ConsentTriggerCapture | null>(null)
  // Fallback for an open that did not come through a known trigger: the element
  // focused when the dialog opened, so focus returns there without a scroll jump.
  const triggerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    captureRef.current = takeConsentTrigger()
    triggerRef.current = document.activeElement as HTMLElement | null
    // Focus the dialog for a11y WITHOUT scrolling — Radix's default
    // onOpenAutoFocus focuses the top focus-guard and yanks the page to
    // scrollY 0 (measured 2200 → 0). We prevent that below and focus here.
    contentRef.current?.focus({ preventScroll: true })
  }, [open])

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => setActiveUI(next ? 'dialog' : 'none')}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-in bg-black/50 fade-in motion-reduce:animate-none" />
        <Dialog.Content
          ref={contentRef}
          tabIndex={-1}
          // Keep the focus trap, Escape, and return-focus — only remove the
          // scroll side effects of Radix's auto-focus.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            // #112: restore to the *recorded* trigger — re-finding a banner
            // button that remounted as a new node, or falling back to the
            // persistent footer entry point — instead of leaving focus on
            // `<body>`. Only when the dialog was opened by something other than
            // a known trigger do we fall back to the old activeElement capture.
            const capture = captureRef.current
            captureRef.current = null
            if (capture) {
              restoreConsentTriggerFocus(capture)
              return
            }
            triggerRef.current?.focus({ preventScroll: true })
          }}
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 animate-in flex-col overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 shadow-xl duration-200 zoom-in-95 fade-in motion-reduce:animate-none dark:border-zinc-700/60 dark:bg-zinc-900"
        >
          <Dialog.Title className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {dialog.title}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {dialog.description}
          </Dialog.Description>

          <div className="mt-5 flex flex-col gap-4">
            {rows.map((cat) => {
              const checked = cat.alwaysOn
                ? true
                : Boolean(selectedConsents?.[cat.c15t])
              return (
                <div
                  key={cat.key}
                  className="flex items-start justify-between gap-4"
                >
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {cat.title}
                    </p>
                    <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                      {cat.subtitle}
                    </p>
                  </div>
                  {cat.alwaysOn ? (
                    <Switch.Root
                      checked
                      disabled
                      aria-label={`${cat.title} cookies (always on)`}
                      className="mt-1 inline-flex h-6 w-10 shrink-0 cursor-not-allowed items-center rounded-full bg-teal-700/60 p-0.5 opacity-70"
                    >
                      <Switch.Thumb className="block size-5 translate-x-4 rounded-full bg-white" />
                    </Switch.Root>
                  ) : (
                    <Switch.Root
                      checked={checked}
                      onCheckedChange={(next) =>
                        setSelectedConsent(cat.c15t, next)
                      }
                      aria-label={`${cat.title} cookies`}
                      className="mt-1 inline-flex h-6 w-10 shrink-0 items-center rounded-full bg-zinc-300 p-0.5 transition-colors data-[state=checked]:bg-teal-700 motion-reduce:transition-none dark:bg-zinc-600"
                    >
                      <Switch.Thumb className="block size-5 translate-x-0 rounded-full bg-white transition-transform data-[state=checked]:translate-x-4 motion-reduce:transition-none" />
                    </Switch.Root>
                  )}
                </div>
              )
            })}
          </div>

          {dialog.privacyPolicyText && dialog.privacyPolicyHref ? (
            <a
              href={dialog.privacyPolicyHref}
              className="mt-4 inline-block text-sm font-medium text-teal-700 underline underline-offset-2 hover:text-teal-600 dark:text-teal-400 dark:hover:text-teal-300"
            >
              {dialog.privacyPolicyText}
            </a>
          ) : null}

          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                markExplicitConsentChoice()
                void saveConsents('necessary')
                close()
              }}
            >
              {dialog.rejectLabel}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                markExplicitConsentChoice()
                void saveConsents('custom')
                close()
              }}
            >
              {dialog.saveLabel}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                markExplicitConsentChoice()
                void saveConsents('all')
                close()
              }}
            >
              {dialog.acceptAllLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
