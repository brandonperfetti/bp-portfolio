import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import {
  ArticleCopyMarkdownProvider,
  MemberMarkdownOverride,
} from '@/components/cms/ArticleCopyMarkdown'
import { CopyPageButton } from '@/components/cms/CopyPageButton'

const MARKDOWN = '# Title\n\nBody paragraph.'

const writeText = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  writeText.mockClear()
  // jsdom has no clipboard by default; install a spy the component can call.
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
})

describe('CopyPageButton', () => {
  it('renders a single plain button — not a menu/expandable control', () => {
    render(<CopyPageButton markdown={MARKDOWN} />)

    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)

    const button = screen.getByRole('button', { name: /copy page/i })
    // A collapsed single action: no dropdown affordances.
    expect(button).not.toHaveAttribute('aria-haspopup')
    expect(button).not.toHaveAttribute('aria-expanded')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.queryByText('Copy as Markdown')).toBeNull()
  })

  it('renders the default "Copy page" label when `label` is omitted', () => {
    render(<CopyPageButton markdown={MARKDOWN} />)

    expect(
      screen.getByRole('button', { name: /copy page/i }),
    ).toBeInTheDocument()
  })

  it('renders a custom `label` when provided', () => {
    render(<CopyPageButton markdown={MARKDOWN} label="Copy article" />)

    expect(
      screen.getByRole('button', { name: /copy article/i }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /copy page/i })).toBeNull()
  })

  it('copies the markdown and shows "Copied" on click', async () => {
    render(<CopyPageButton markdown={MARKDOWN} />)

    fireEvent.click(screen.getByRole('button', { name: /copy page/i }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(MARKDOWN))
    expect(await screen.findByText('Copied')).toBeInTheDocument()
  })
})

describe('CopyPageButton — gated member override (#106)', () => {
  const UNLOCKED = '# Unlocked\n\nMembers-only body.'

  it('copies the streamed member-unlocked markdown when an override is present', async () => {
    render(
      <ArticleCopyMarkdownProvider>
        <CopyPageButton markdown={MARKDOWN} />
        <MemberMarkdownOverride markdown={UNLOCKED} />
      </ArticleCopyMarkdownProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /copy page/i }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(UNLOCKED))
    expect(writeText).not.toHaveBeenCalledWith(MARKDOWN)
  })

  it('copies the prerendered teaser prop while no override has streamed in (signed-out gated)', async () => {
    render(
      <ArticleCopyMarkdownProvider>
        <CopyPageButton markdown={MARKDOWN} />
      </ArticleCopyMarkdownProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /copy page/i }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(MARKDOWN))
  })
})
