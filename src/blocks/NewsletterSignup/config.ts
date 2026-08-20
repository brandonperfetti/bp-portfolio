import type { Block } from 'payload'

import { cardChromeFields } from '@/blocks/cardChrome'

/**
 * The site's newsletter signup card, placeable on any page, with the
 * optional heading + intro every zero-config card gained in #40.
 *
 * @remarks `note` is hidden rather than removed — see `ContactForm/config.ts`
 * for the reasoning (additive-only schema until the Home/About flip).
 */
export const NewsletterSignup: Block = {
  slug: 'newsletterSignup',
  interfaceName: 'NewsletterSignupBlock',
  imageURL: '/images/cms/newsletter-signup.svg',
  imageAltText: 'Line-art preview of the Newsletter Signup block',
  labels: { singular: 'Newsletter Signup', plural: 'Newsletter Signups' },
  fields: [
    ...cardChromeFields(),
    {
      name: 'note',
      type: 'text',
      admin: {
        description:
          'Retired placeholder — the signup card itself needs no configuration.',
        readOnly: true,
        hidden: true,
      },
    },
  ],
}
