import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SocialLinksBlock } from '@/payload-types'

const getCmsIdentity = vi.fn()

vi.mock('@/lib/cms/identityRepo', () => ({
  getCmsIdentity: () => getCmsIdentity(),
}))
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const { SocialLinksBlockComponent } =
  await import('@/blocks/SocialLinks/Component')

const block = (overrides: Partial<SocialLinksBlock> = {}): SocialLinksBlock =>
  ({
    blockType: 'socialLinks',
    variant: 'iconRow',
    source: 'identity',
    ...overrides,
  }) as SocialLinksBlock

/**
 * The server half of #32: which links a block renders, and from where. The
 * pixels live in `SocialLinksView` (stories); what is asserted here is the
 * data path — Identity global vs the block's own array — because that is the
 * decision the block exists to make.
 */
describe('SocialLinksBlockComponent', () => {
  beforeEach(() => {
    getCmsIdentity.mockReset()
    getCmsIdentity.mockResolvedValue({
      name: 'Brandon Perfetti',
      sameAs: [
        'https://x.com/brandonperfetti',
        'https://github.com/brandonperfetti',
      ],
    })
  })

  it('reads the Identity global by default, deriving icon and wording', async () => {
    render(await SocialLinksBlockComponent(block()))

    expect(getCmsIdentity).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('link', { name: 'Follow on X' })).toHaveAttribute(
      'href',
      'https://x.com/brandonperfetti',
    )
    expect(screen.getAllByRole('link')).toHaveLength(2)
  })

  it('uses the block array instead when the source is custom, and skips Identity entirely', async () => {
    render(
      await SocialLinksBlockComponent(
        block({
          source: 'custom',
          variant: 'labeledList',
          links: [
            { id: 'a', url: 'https://github.com/someone', label: 'My code' },
            { id: 'b', url: '   ', label: 'Blank row' },
          ],
        }),
      ),
    )

    expect(getCmsIdentity).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'My code' })).toBeInTheDocument()
    // A blank URL is an empty admin row, not a link.
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })

  it('renders the About divider row only for the labeled list', async () => {
    const { rerender } = render(
      await SocialLinksBlockComponent(
        block({
          variant: 'labeledList',
          showEmailDivider: true,
          email: 'info@brandonperfetti.com',
        }),
      ),
    )
    const mail = screen.getByRole('link', { name: 'info@brandonperfetti.com' })
    expect(mail).toHaveAttribute('href', 'mailto:info@brandonperfetti.com')
    expect(mail.closest('li')).toHaveClass('border-t')

    // The icon row has no divider treatment, so the address is not rendered
    // even if the stored value survives a variant switch in the admin.
    rerender(
      await SocialLinksBlockComponent(
        block({
          variant: 'iconRow',
          showEmailDivider: true,
          email: 'info@brandonperfetti.com',
        }),
      ),
    )
    expect(
      screen.queryByRole('link', { name: 'info@brandonperfetti.com' }),
    ).toBeNull()
  })

  it('renders nothing when there is nothing to render', async () => {
    getCmsIdentity.mockResolvedValue({ name: 'Brandon Perfetti', sameAs: [] })
    const { container } = render(await SocialLinksBlockComponent(block()))
    expect(container).toBeEmptyDOMElement()
  })

  it('hands its rhythm to the column when hosted in one', async () => {
    const { container } = render(
      await SocialLinksBlockComponent({ ...block(), hosted: 'column' }),
    )
    expect(container.querySelector('section')).not.toHaveClass('my-12')
  })

  it('keeps its own rhythm at layout root', async () => {
    const { container } = render(await SocialLinksBlockComponent(block()))
    expect(container.querySelector('section')).toHaveClass('my-12')
  })
})
