import type { Block } from 'payload'

/** The site's contact form ("Send a message"), placeable on any page. */
export const ContactForm: Block = {
  slug: 'contactForm',
  interfaceName: 'ContactFormBlock',
  imageURL: '/images/cms/contact-form.svg',
  imageAltText: 'Line-art preview of the Contact Form block',
  labels: { singular: 'Contact Form', plural: 'Contact Forms' },
  fields: [
    {
      name: 'note',
      type: 'text',
      admin: {
        description:
          'No configuration needed — renders the standard contact form.',
        readOnly: true,
      },
    },
  ],
}
