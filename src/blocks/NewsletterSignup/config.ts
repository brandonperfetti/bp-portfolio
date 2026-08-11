import type { Block } from 'payload'

/** The site's newsletter signup card, placeable on any page. */
export const NewsletterSignup: Block = {
  slug: 'newsletterSignup',
  interfaceName: 'NewsletterSignupBlock',
  imageURL: '/images/cms/newsletter-signup.svg',
  imageAltText: 'Line-art preview of the Newsletter Signup block',
  labels: { singular: 'Newsletter Signup', plural: 'Newsletter Signups' },
  fields: [
    {
      name: 'note',
      type: 'text',
      admin: {
        description:
          'No configuration needed — renders the standard newsletter card.',
        readOnly: true,
      },
    },
  ],
}
