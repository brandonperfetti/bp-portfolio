import type { Block } from 'payload'

import { cardChromeFields } from '@/blocks/cardChrome'

/**
 * The site's contact form ("Send a message"), placeable on any page, with
 * the optional heading + intro every zero-config card gained in #40.
 *
 * @remarks `note` is the placeholder the block carried while it had no
 * options at all. It is hidden rather than removed: dropping a column is not
 * an additive migration, and the schema stays additive until the Home/About
 * flip. Its old "no configuration needed" copy would now sit directly above
 * two configuration fields, which is why it no longer renders.
 */
export const ContactForm: Block = {
  slug: 'contactForm',
  interfaceName: 'ContactFormBlock',
  imageURL: '/images/cms/contact-form.svg',
  imageAltText: 'Line-art preview of the Contact Form block',
  labels: { singular: 'Contact Form', plural: 'Contact Forms' },
  fields: [
    ...cardChromeFields(),
    {
      name: 'note',
      type: 'text',
      admin: {
        description:
          'Retired placeholder — the form itself needs no configuration.',
        readOnly: true,
        hidden: true,
      },
    },
  ],
}
