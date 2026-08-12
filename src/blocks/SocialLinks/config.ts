import type { Block } from 'payload'

/**
 * Social profile links (CMS page builder) in the site's two existing
 * treatments: Home's bare icon row and About's labeled list with its
 * `mailto` divider row.
 *
 * @remarks `source: identity` reads the Identity global's `sameAs` array —
 * the URLs that already feed the Person JSON-LD — so the links an editor
 * maintains in one place appear everywhere. This block does **not** change
 * the Identity schema (#32); `custom` is the escape hatch for a page that
 * needs a different set.
 *
 * Every select carries an explicit `enumName`: the block nests three levels
 * deep (`pages.layout` → `container` → `column` → here), and the generated
 * identifier would both crowd Postgres's 63-character limit and change the
 * moment the block moves.
 */
export const SocialLinks: Block = {
  slug: 'socialLinks',
  interfaceName: 'SocialLinksBlock',
  imageURL: '/images/cms/social-links.svg',
  imageAltText: 'Line-art preview of the Social Links block',
  labels: {
    singular: 'Social Links',
    plural: 'Social Links',
  },
  fields: [
    {
      name: 'variant',
      type: 'select',
      required: true,
      defaultValue: 'iconRow',
      enumName: 'enum_social_links_variant',
      options: [
        { label: 'Icon row (home page)', value: 'iconRow' },
        { label: 'Labeled list (about page)', value: 'labeledList' },
      ],
      admin: {
        description:
          'Icon row is the compact glyph strip under the home hero. Labeled list is the about-page rail: icon plus "Follow on …" text, one per line.',
      },
    },
    {
      name: 'source',
      type: 'select',
      required: true,
      defaultValue: 'identity',
      enumName: 'enum_social_links_source',
      options: [
        { label: 'Identity global', value: 'identity' },
        { label: 'Custom links', value: 'custom' },
      ],
      admin: {
        description:
          'Identity uses the profile URLs on the Identity global, so editing them there updates every page at once.',
      },
    },
    {
      name: 'links',
      type: 'array',
      label: 'Custom links',
      admin: {
        condition: (_, siblingData) => siblingData?.source === 'custom',
        description:
          'The icon is derived from the URL (X, GitHub, LinkedIn, Instagram, email — anything else gets a generic link glyph).',
      },
      fields: [
        {
          name: 'url',
          type: 'text',
          required: true,
          admin: {
            description:
              'Profile URL, or an email address for a mail row (mailto: is added for you).',
          },
        },
        {
          name: 'label',
          type: 'text',
          admin: {
            description:
              'Optional. Defaults to "Follow on <platform>" — the wording both pages use today.',
          },
        },
      ],
    },
    {
      name: 'showEmailDivider',
      type: 'checkbox',
      label: 'Add an email row below a divider',
      defaultValue: false,
      admin: {
        condition: (_, siblingData) => siblingData?.variant === 'labeledList',
        description:
          'The about-page treatment: a rule above a final mail row, set apart from the profile links.',
      },
    },
    {
      name: 'email',
      type: 'email',
      label: 'Override the address',
      admin: {
        condition: (_, siblingData) =>
          siblingData?.variant === 'labeledList' &&
          Boolean(siblingData?.showEmailDivider),
        description:
          'Leave empty to use the address on the Identity global, so one edit there updates every page. Fill it in only when this page needs a different address. If both are empty the row is hidden rather than shown broken.',
      },
    },
  ],
}
