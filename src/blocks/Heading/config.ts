import type { Block } from 'payload'

import {
  DEFAULT_HEADING_LEVEL,
  DEFAULT_HEADING_VARIANT,
  HEADING_LEVEL_OPTIONS,
  HEADING_VARIANT_OPTIONS,
} from '@/blocks/Heading/levels'

/**
 * Animated heading (CMS page builder): the site's two headline animations,
 * exposed as a block.
 *
 * @remarks `AnimatedHeadline`'s `line` and `typewriter` variants were chosen
 * per call site in route code, so a heading outside a hero — the about page's
 * typewriter H1 — could not be composed in admin at all (#36). This block is
 * the missing surface; it adds no animation of its own.
 *
 * Level and animation are independent on purpose: an `h1` is a fact about
 * the document outline, not about how the text arrives.
 *
 * Both selects carry an explicit `enumName` — the block nests three levels
 * deep (`pages.layout` → `container` → `column` → here), where the generated
 * identifier crowds Postgres's 63-character limit and would change the
 * moment the block moves.
 */
export const Heading: Block = {
  slug: 'heading',
  interfaceName: 'HeadingBlock',
  imageURL: '/images/cms/heading.svg',
  imageAltText: 'Line-art preview of the Heading block',
  labels: {
    singular: 'Heading',
    plural: 'Headings',
  },
  fields: [
    {
      name: 'text',
      type: 'text',
      required: true,
      admin: {
        description:
          'Plain text — the animation splits it into words or characters, so formatting would not survive.',
      },
    },
    {
      name: 'level',
      type: 'select',
      required: true,
      defaultValue: DEFAULT_HEADING_LEVEL,
      enumName: 'enum_heading_level',
      options: [...HEADING_LEVEL_OPTIONS],
      admin: {
        description:
          'The tag that gets rendered, and the size that goes with it. Pages usually carry one h1 — pick h2 for a section heading.',
      },
    },
    {
      name: 'variant',
      type: 'select',
      required: true,
      defaultValue: DEFAULT_HEADING_VARIANT,
      enumName: 'enum_heading_variant',
      options: [...HEADING_VARIANT_OPTIONS],
      admin: {
        description:
          'Typewriter is the home and about page treatment. Either way, visitors who prefer reduced motion get the finished heading with no animation at all.',
      },
    },
  ],
}
