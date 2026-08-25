'use client'

import { useConsentManager } from '@c15t/react'
import { Dialog, Switch } from 'radix-ui'

import { Button } from '@/components/ui/button'

/**
 * Custom "Manage cookies" dialog in bp's design system — headless c15t driven
 * by `useConsentManager()`. Radix `Dialog` supplies the focus trap,
 * Escape-to-close, return-focus, and scroll lock; Radix `Switch` is a real
 * `role="switch"` control. Open state is c15t's `activeUI` so the banner's
 * "Customize" and the footer "Manage cookies" button both drive it.
 *
 * @remarks
 * Also carries the user-facing privacy disclosure (categories, the Consent
 * Mode v2 cookieless-ping caveat, the Clerk/Turnstile essential-cookie note) —
 * resolves the code-review disclosure gap (Sp-2). See docs/ANALYTICS.md.
 */
export function CookieDialog() {
  const {
    activeUI,
    selectedConsents,
    setSelectedConsent,
    saveConsents,
    setActiveUI,
  } = useConsentManager()

  const open = activeUI === 'dialog'
  const measurementOn = Boolean(selectedConsents?.measurement)

  const close = () => setActiveUI('none')

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => setActiveUI(next ? 'dialog' : 'none')}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-in bg-black/50 fade-in motion-reduce:animate-none" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 animate-in flex-col overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 shadow-xl duration-200 zoom-in-95 fade-in motion-reduce:animate-none dark:border-zinc-700/60 dark:bg-zinc-900">
          <Dialog.Title className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Cookie preferences
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Choose which cookies this site may use. Essential cookies are always
            on; analytics load only with your consent where consent is required.
          </Dialog.Description>

          <div className="mt-5 flex flex-col gap-4">
            {/* Necessary — always on */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Strictly necessary
                </p>
                <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                  Sign-in sessions (Clerk) and bot protection (Cloudflare
                  Turnstile). Required for the site to work — always on.
                </p>
              </div>
              <Switch.Root
                checked
                disabled
                aria-label="Strictly necessary cookies (always on)"
                className="mt-1 inline-flex h-6 w-10 shrink-0 cursor-not-allowed items-center rounded-full bg-teal-700/60 p-0.5 opacity-70"
              >
                <Switch.Thumb className="block size-5 translate-x-4 rounded-full bg-white" />
              </Switch.Root>
            </div>

            {/* Measurement — GA4 */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Analytics (measurement)
                </p>
                <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                  Google Analytics 4 via Consent Mode v2. Before you grant it,
                  GA sets no cookies; Google still receives an anonymous,
                  cookieless signal. A cookieless Vercel Analytics baseline runs
                  regardless of this choice.
                </p>
              </div>
              <Switch.Root
                checked={measurementOn}
                onCheckedChange={(checked) =>
                  setSelectedConsent('measurement', checked)
                }
                aria-label="Analytics cookies"
                className="mt-1 inline-flex h-6 w-10 shrink-0 items-center rounded-full bg-zinc-300 p-0.5 transition-colors data-[state=checked]:bg-teal-700 motion-reduce:transition-none dark:bg-zinc-600"
              >
                <Switch.Thumb className="block size-5 translate-x-0 rounded-full bg-white transition-transform data-[state=checked]:translate-x-4 motion-reduce:transition-none" />
              </Switch.Root>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void saveConsents('necessary')
                close()
              }}
            >
              Reject non-essential
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void saveConsents('custom')
                close()
              }}
            >
              Save choices
            </Button>
            <Button
              size="sm"
              onClick={() => {
                void saveConsents('all')
                close()
              }}
            >
              Accept all
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
