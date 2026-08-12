import type { Block } from 'payload'

import {
  DEFAULT_SHADER_PRESET,
  SHADER_PRESET_OPTIONS,
} from '@/heros/shaderPresets'

/**
 * Standalone shader background section for layout-builder pages.
 *
 * @remarks Legacy as of #39: the page hero's `shader` type with
 * `presentation: card` renders exactly this panel — the block's Component now
 * delegates to it — plus a headline, subtitle, call-to-action links and the
 * Identity social row, none of which this block can reach. Kept registered,
 * and unchanged in shape, so the pages already using it keep rendering; the
 * labels and descriptions below are what point new content at the page hero
 * (the `mediaBlock` → `image` pattern from #33). Nothing here touches the
 * schema, and no stored block is migrated — they render identically through
 * the delegated path.
 *
 * Deliberately still absent from `COLUMN_CONTENT_BLOCKS`: hero-scale by
 * construction, and a deprecated block has no business being offered for new
 * column content.
 */
export const ShaderHero: Block = {
  slug: 'shaderHero',
  interfaceName: 'ShaderHeroBlock',
  imageURL: '/images/cms/shader-hero.svg',
  imageAltText: 'Line-art preview of the Shader Hero block',
  labels: {
    singular: 'Shader Hero (legacy — use the page hero)',
    plural: 'Shader Heroes (legacy — use the page hero)',
  },
  fields: [
    {
      name: 'preset',
      type: 'select',
      defaultValue: DEFAULT_SHADER_PRESET,
      options: [...SHADER_PRESET_OPTIONS],
      required: true,
      admin: {
        description:
          'Existing content only. New shader sections belong in the page hero above (Hero type “Shader”, presentation “Card”), which draws this same panel and adds the headline, subtitle, links and social row.',
      },
    },
    {
      name: 'richText',
      type: 'richText',
      label: false,
    },
  ],
}
