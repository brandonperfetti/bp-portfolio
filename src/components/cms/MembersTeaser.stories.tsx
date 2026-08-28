import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { MembersTeaser } from '@/components/cms/MembersTeaser'

/**
 * The members-only teaser a gated article renders in place of its body, and
 * specifically its "Sign in to continue" CTA — ported from a raw `<a>` with
 * hand-written teal classes onto the shared shadcn `Button` primitive (#113).
 *
 * @remarks
 * The a11y addon (`test:'error'`, see `.storybook/preview.tsx`) runs axe on
 * every story here, which is the coverage the ticket asks for. Light/dark
 * parity is reviewable with the toolbar theme toggle: the teal fill and its
 * white ink are intentionally identical in both themes, like every other teal
 * CTA on the site (`--corvus-accent-solid`).
 */
const meta = {
  title: 'CMS/MembersTeaser',
  component: MembersTeaser,
  tags: ['autodocs'],
  args: { slug: 'a-members-only-post' },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MembersTeaser>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The teaser as a signed-out reader sees it. The play function pins the ported
 * CTA's contract: anchor semantics, the redirect-preserving href, that it
 * really is the primitive, and that the bespoke teal / `rounded-xl` treatment
 * survived the port rather than regressing to the primitive's defaults.
 */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(canvas.getByText('This article is for members.')).toBeVisible()

    // Anchor semantics survive `asChild` — a `link`, not a `button`.
    const cta = canvas.getByRole('link', { name: 'Sign in to continue' })
    await expect(cta.tagName).toBe('A')
    await expect(cta).toHaveAttribute(
      'href',
      '/sign-in?redirect_url=/articles/a-members-only-post',
    )

    // It is the primitive now (the shadcn Button stamps these), on the new
    // teal variant rather than a re-application of the old custom classes.
    await expect(cta).toHaveAttribute('data-slot', 'button')
    await expect(cta).toHaveAttribute('data-variant', 'teal')

    // …and the treatment is preserved: teal-700 fill, white ink, `rounded-xl`
    // corners — `--radius-xl` = `calc(var(--radius) + 4px)` = 14px with this
    // theme's `--radius: 0.625rem`. Seeing the primitive's own `rounded-md`
    // (`calc(var(--radius) - 2px)` = 8px) would mean tailwind-merge failed to
    // drop the base radius and the port silently regressed the visual.
    const styles = getComputedStyle(cta)
    await expect(styles.borderTopLeftRadius).toBe('14px')
    await expect(styles.borderTopLeftRadius).not.toBe('8px')
    await expect(styles.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
    await expect(styles.color).toBe('rgb(255, 255, 255)')
  },
}
