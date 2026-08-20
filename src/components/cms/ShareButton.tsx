'use client'

import { ShareIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'

import { ShareModal } from '@/components/cms/ShareModal'
import { SHARE_TARGETS, type ShareTargetId } from '@/lib/share/shareTargets'

/**
 * Props for {@link ShareButton}. Payload is URL + title only — there is no
 * per-page share-text field; each destination derives its own copy.
 *
 * @remarks `targetIds` is a plain string array, not resolved
 * `ResolvedShareTarget`s, precisely so this client component can receive its
 * props across the RSC server→client boundary — icon components and
 * `buildIntentUrl` functions are not serializable. The full targets are
 * rehydrated here from the client-safe {@link SHARE_TARGETS} registry.
 */
export interface ShareButtonProps {
  /** Absolute canonical URL of the page being shared. */
  url: string
  /** Human title of the page — used as tweet text, email subject, etc. */
  title: string
  /**
   * The destination ids to offer, in canonical order (resolve on the server
   * via `resolveShareTargetIds`).
   */
  targetIds: ShareTargetId[]
}

/**
 * The "Share" affordance: an outlined pill that reads as one actions row with
 * the sibling `CopyPageButton` (identical pill styling).
 *
 * @remarks Two paths by device. On a touch device that exposes the Web Share
 * API (`navigator.share` present *and* a coarse pointer) it hands off to the
 * OS share sheet; a user-cancel (`AbortError`) is swallowed, and any other
 * failure falls back to the desktop modal. Everywhere else — desktop, or a
 * touch device without the API — it opens the in-page {@link ShareModal}. The
 * coarse-pointer gate keeps the native sheet off desktops that happen to
 * expose `navigator.share`, where the richer modal is the better surface.
 */
export function ShareButton({ url, title, targetIds }: ShareButtonProps) {
  const [open, setOpen] = useState(false)

  // Rehydrate the non-serializable targets (icons + intent builders) from the
  // client-safe registry; ShareModal's ResolvedShareTarget[] props are unchanged.
  const targets = targetIds.map((id) => SHARE_TARGETS[id])

  const handleClick = async () => {
    const canNativeShare =
      typeof navigator !== 'undefined' &&
      !!navigator.share &&
      typeof window !== 'undefined' &&
      window.matchMedia('(pointer: coarse)').matches

    if (canNativeShare) {
      try {
        await navigator.share({ title, url })
        return
      } catch (error) {
        // The user dismissing the native sheet is not a failure — swallow it
        // and do nothing. Any other throw means the sheet is unavailable, so
        // fall back to the in-page modal.
        if (error instanceof Error && error.name === 'AbortError') {
          return
        }
        setOpen(true)
        return
      }
    }

    setOpen(true)
  }

  return (
    <>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        onClick={handleClick}
      >
        <ShareIcon className="h-4 w-4" />
        Share
      </button>
      <ShareModal
        open={open}
        onClose={() => setOpen(false)}
        url={url}
        title={title}
        targets={targets}
      />
    </>
  )
}
