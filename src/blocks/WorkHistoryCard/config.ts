import type { Block } from 'payload'

import { cardChromeFields } from '@/blocks/cardChrome'

/**
 * The Work block: the home-page résumé card (work-history collection + CV
 * download) by default, or **one** role's structured facts when `entry` names
 * a `work-history` row — the per-role block `/work/<slug>` pages are composed
 * from (#137).
 *
 * @remarks **Why this block gained a mode instead of a sibling block being
 * added (#137, deciding the choice the ticket left to the implementing lane;
 * Brandon's 2026-09-02 direction on the issue prefers the extension).**
 *
 * A new `WorkHistory` block would have been a second entry in
 * `blocks/library.ts`, a second `RenderBlocks` case, a second Storybook
 * registration and a second admin picker tile — all for a component that reads
 * the same collection and renders the same four facts as this one, differing
 * only in how many rows it shows. The two would then have to be kept in visual
 * sync forever, and an editor would face two tiles named "Work History
 * (something)" with no way to tell from the picker which one they want.
 *
 * As one block with an optional relationship the choice is a field, described
 * where it is made: **empty ⇒ the whole résumé** (byte for byte the section
 * every page stored before #137 renders, because `entry` is nullable and every
 * existing row reads back `null`), **set ⇒ that role alone**. It also keeps
 * the change inside `blocks/WorkHistoryCard/**`, touching neither the block
 * library nor the dispatcher — the block is already registered, already
 * dispatched, and already stubbed for the browser-mode Storybook project.
 *
 * The one cost, stated so it is not a surprise: the block's label still reads
 * "Work History Card" on a page that uses the per-entry mode. Renaming the
 * label is presentation-only, but the `blockType` (`workHistoryCard`) is
 * stored on every existing page's `layout`, so the *slug* stays.
 *
 * `note` is hidden rather than removed — see `ContactForm/config.ts` for the
 * reasoning (additive-only schema until the Home/About flip).
 */
export const WorkHistoryCard: Block = {
  slug: 'workHistoryCard',
  interfaceName: 'WorkHistoryCardBlock',
  imageURL: '/images/cms/work-history-card.svg',
  imageAltText: 'Line-art preview of the Work History Card block',
  labels: { singular: 'Work History Card', plural: 'Work History Cards' },
  fields: [
    ...cardChromeFields(),
    {
      name: 'entry',
      type: 'relationship',
      relationTo: 'work-history',
      hasMany: false,
      admin: {
        description:
          'Optional. Leave empty for the full résumé card. Pick one role to render just that role’s facts — company, title, period, logo and description — which is what a /work/<slug> page uses.',
      },
    },
    {
      name: 'showDescription',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        // #137 asks the block to render "company / title / period / logo +
        // OPTIONAL description". Optional to *whom* is the question, and the
        // row cannot answer it: `work-history.description` is a single
        // textarea shared by the Resume card and the Corvus chunker, so an
        // editor who wants the facts without the paragraph on one role page
        // would otherwise have to empty the field for every consumer. A
        // per-block checkbox is the cheapest reading that keeps the row's
        // description authoritative — default on, so the ticket's own default
        // ("+ optional description") is what a freshly picked role renders.
        //
        // Only meaningful in per-entry mode: the résumé card has never
        // rendered descriptions, so the toggle would be a lie with `entry`
        // empty.
        condition: (_data, siblingData) => Boolean(siblingData?.entry),
        description: 'Render the role’s description paragraph under its facts.',
      },
    },
    {
      name: 'note',
      type: 'text',
      admin: {
        description:
          'Retired placeholder — the work-history card itself needs no configuration.',
        readOnly: true,
        hidden: true,
      },
    },
  ],
}
