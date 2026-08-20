import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { ShareModal } from '@/components/cms/ShareModal'
import { resolveShareTargets } from '@/lib/share/shareTargets'

const URL = 'https://brandonperfetti.com/articles/deep-modules'
const TITLE = 'Deep Modules'
const ALL_IDS = [
  'x',
  'linkedin',
  'facebook',
  'reddit',
  'hackernews',
  'email',
  'copylink',
]

const writeText = vi.fn().mockResolvedValue(undefined)

// Reduced motion is forced on so Headless UI's Transition mounts/unmounts
// instantly under jsdom (which fires no transitionend). The fade/scale path is
// exercised in the Storybook (real-browser) run.
function installMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
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
  installMatchMedia()
  writeText.mockClear()
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
})

/** Controlled harness so Escape/backdrop dismissal is observable. */
function Harness({
  targets,
}: {
  targets: ReturnType<typeof resolveShareTargets>
}) {
  const [open, setOpen] = useState(true)
  return (
    <ShareModal
      open={open}
      onClose={() => setOpen(false)}
      url={URL}
      title={TITLE}
      targets={targets}
    />
  )
}

describe('ShareModal', () => {
  it('renders exactly one link per non-copylink target with intent href + aria-label', async () => {
    render(<Harness targets={resolveShareTargets(ALL_IDS, [], [])} />)

    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible())

    // 7 targets in, 6 icon links out — copylink is excluded from the row.
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(6)
    expect(screen.queryByRole('link', { name: /copy link/i })).toBeNull()

    const x = screen.getByRole('link', { name: 'Share on X' })
    expect(x).toHaveAttribute(
      'href',
      `https://x.com/intent/tweet?text=${encodeURIComponent(
        TITLE,
      )}&url=${encodeURIComponent(URL)}`,
    )
    expect(x).toHaveAttribute('target', '_blank')
    expect(x).toHaveAttribute('rel', 'noopener noreferrer')

    const email = screen.getByRole('link', { name: 'Share on Email' })
    expect(email).toHaveAttribute(
      'href',
      `mailto:?subject=${encodeURIComponent(TITLE)}&body=${encodeURIComponent(
        URL,
      )}`,
    )
  })

  it('shows only the copy-link field (no icon row) for a floor-only set', async () => {
    render(<Harness targets={resolveShareTargets(['copylink'], [], [])} />)

    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible())

    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByLabelText('Page link')).toHaveValue(URL)
    expect(screen.getByRole('button', { name: 'Copy' })).toBeVisible()
  })

  it('copies the url and shows "Copied" when the copy button is clicked', async () => {
    render(<Harness targets={resolveShareTargets(ALL_IDS, [], [])} />)

    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible())

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(URL))
    expect(await screen.findByText('Copied')).toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    render(<Harness targets={resolveShareTargets(ALL_IDS, [], [])} />)

    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible())

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('closes when the close button is clicked', async () => {
    render(<Harness targets={resolveShareTargets(ALL_IDS, [], [])} />)

    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible())

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
