import type { Block } from 'payload'

/** Vertical rhythm spacer between page sections. */
export const Spacer: Block = {
  slug: 'spacer',
  interfaceName: 'SpacerBlock',
  imageURL: '/images/cms/spacer.svg',
  imageAltText: 'Line-art preview of the Spacer block',
  fields: [
    {
      name: 'size',
      type: 'select',
      defaultValue: 'md',
      options: [
        { label: 'Small', value: 'sm' },
        { label: 'Medium', value: 'md' },
        { label: 'Large', value: 'lg' },
      ],
      required: true,
    },
  ],
}
