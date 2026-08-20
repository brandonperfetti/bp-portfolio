import type { GlobalConfig } from 'payload'

import { anyone } from '@/access/anyone'
import { authenticated } from '@/access/authenticated'
import { revalidateGlobal } from '@/hooks/revalidateGlobal'

/** Header + primary navigation (v3 nav ported; Hermes sits after Tech). */
export const Navigation: GlobalConfig = {
  slug: 'navigation',
  access: {
    read: anyone,
    update: authenticated,
  },
  fields: [
    {
      name: 'headerLinks',
      type: 'array',
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'href', type: 'text', required: true },
      ],
    },
  ],
  hooks: {
    afterChange: [revalidateGlobal('navigation')],
  },
}
