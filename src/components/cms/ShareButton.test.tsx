import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { ShareButton } from '@/components/cms/ShareButton'
import type { ShareTargetId } from '@/lib/share/shareTargets'

const URL = 'https://brandonperfetti.com/articles/deep-modules'
const TITLE = 'Deep Modules'
const targetIds: ShareTargetId[] = ['x', 'copylink']

// The native-share gate reads `matchMedia('(pointer: coarse)')`; the modal's
// reduced-motion hook reads `matchMedia('(prefers-reduced-motion: reduce)')`.
// jsdom ships neither, so install a query-aware stand-in. Reduced motion is
// forced on so Headless UI's Transition mounts/unmounts instantly (jsdom fires
// no transitionend) — the animated path is exercised in the Storybook run.
let coarsePointer = false

function installMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-reduced-motion')
        ? true
        : query.includes('coarse')
          ? coarsePointer
          : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
}

beforeEach(() => {
  coarsePointer = false
  installMatchMedia()
})

afterEach(() => {
  Reflect.deleteProperty(navigator, 'share')
})

function setNavigatorShare(
  fn: ((data: ShareData) => Promise<void>) | undefined,
) {
  Object.defineProperty(navigator, 'share', {
    value: fn,
    configurable: true,
    writable: true,
  })
}

describe('ShareButton native-share gate', () => {
  it('uses navigator.share on a coarse-pointer device and does NOT open the modal', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    setNavigatorShare(share)
    coarsePointer = true

    render(<ShareButton url={URL} title={TITLE} targetIds={targetIds} />)
    fireEvent.click(screen.getByRole('button', { name: /share/i }))

    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({ title: TITLE, url: URL }),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens the modal on a fine-pointer device even when navigator.share exists', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    setNavigatorShare(share)
    coarsePointer = false

    render(<ShareButton url={URL} title={TITLE} targetIds={targetIds} />)
    fireEvent.click(screen.getByRole('button', { name: /share/i }))

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(share).not.toHaveBeenCalled()
  })

  it('opens the modal when navigator.share is unavailable (even on coarse pointer)', async () => {
    setNavigatorShare(undefined)
    coarsePointer = true

    render(<ShareButton url={URL} title={TITLE} targetIds={targetIds} />)
    fireEvent.click(screen.getByRole('button', { name: /share/i }))

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
  })

  it('swallows a user-cancel AbortError without opening the modal', async () => {
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' })
    const share = vi.fn().mockRejectedValue(abort)
    setNavigatorShare(share)
    coarsePointer = true

    render(<ShareButton url={URL} title={TITLE} targetIds={targetIds} />)
    fireEvent.click(screen.getByRole('button', { name: /share/i }))

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('falls back to the modal when navigator.share throws a non-abort error', async () => {
    const share = vi.fn().mockRejectedValue(new Error('not allowed'))
    setNavigatorShare(share)
    coarsePointer = true

    render(<ShareButton url={URL} title={TITLE} targetIds={targetIds} />)
    fireEvent.click(screen.getByRole('button', { name: /share/i }))

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
  })
})
