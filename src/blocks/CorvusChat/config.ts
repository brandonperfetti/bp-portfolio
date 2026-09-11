import type { Block } from 'payload'

import {
  CORVUS_CHAT_VARIANT_OPTIONS,
  DEFAULT_CORVUS_CHAT_VARIANT,
} from '@/blocks/CorvusChat/variants'

/**
 * Corvus, as a block an editor can drop onto any page — especially a sticky
 * sidebar column (#217 phase 1).
 *
 * @remarks Phase 1 renders the chat and nothing else: the block has **no
 * page-context awareness**, and `/api/ai/chat`'s body schema stays
 * `{ messages }` (phase 2 is what widens it, server-side). Nothing an editor
 * types here reaches the model as instructions — see `starterPrompt` below.
 *
 * `variant` rather than a height field on purpose: an editor-entered height is
 * a number nobody can keep consistent across pages, and the three that exist
 * are each argued in `variants.ts`. The select carries an explicit `enumName`
 * for the reason `Heading/config.ts` and `ArticlesArchive/config.ts` record —
 * the block nests three levels deep (`pages.layout` → `container` → `column` →
 * here), where the generated Postgres identifier crowds the 63-character limit
 * and would change the moment the block moves.
 */
export const CorvusChatBlock: Block = {
  slug: 'corvusChat',
  interfaceName: 'CorvusChatBlock',
  imageURL: '/images/cms/corvus-chat.svg',
  imageAltText: 'Line-art preview of the Corvus Chat block',
  labels: { singular: 'Corvus Chat', plural: 'Corvus Chats' },
  fields: [
    {
      name: 'variant',
      type: 'select',
      required: true,
      defaultValue: DEFAULT_CORVUS_CHAT_VARIANT,
      enumName: 'enum_corvus_chat_variant',
      options: [...CORVUS_CHAT_VARIANT_OPTIONS],
      admin: {
        description:
          'How tall the chat frame is. Every option is a fixed height — never a share of the screen — so the block cannot push the rest of the page out of the fold.',
      },
    },
    {
      name: 'heading',
      type: 'text',
      admin: {
        description:
          "The name shown in the chat's header row. Defaults to Corvus. Rendered as an h2, so a page keeps exactly one h1.",
      },
    },
    {
      name: 'starterPrompt',
      type: 'text',
      admin: {
        description:
          'Optional opening question, pre-typed into the message box. The visitor can edit or clear it, and nothing is sent until they press send — this is a suggestion, not an instruction to Corvus.',
      },
    },
  ],
}
