import type { Block } from 'payload'

/**
 * Lead paragraph (CMS page builder): the single plain intro paragraph the
 * about page sets under its H1 — `text-base text-zinc-600 dark:text-zinc-400`,
 * not article typography.
 *
 * @remarks Exists because no column-hostable block rendered that treatment:
 * the `prose` block is the article-body pipeline (its own docstring is
 * explicit that it renders "exactly the typography an article body gets"), and
 * the `heading` block is headings. The about page's subtitle is neither — it
 * is a hand-styled lead paragraph — so composing the about page's left column
 * (`heading` + lead + `prose` body) needed this missing surface. It adds no
 * typography of its own beyond the about page's literal classes (see
 * `lead.ts`).
 *
 * Plain text, not rich text: the about page's subtitle is a single string, and
 * a lead is a lead, not a place for embedded blocks or headings. No selects,
 * so no Postgres enum — the block adds two plain columns (`text`, `reveal`)
 * wherever it is registered.
 */
export const Lead: Block = {
  slug: 'lead',
  interfaceName: 'LeadBlock',
  imageURL: '/images/cms/lead.svg',
  imageAltText: 'Line-art preview of the Lead block',
  labels: {
    singular: 'Lead',
    plural: 'Leads',
  },
  fields: [
    {
      name: 'text',
      type: 'textarea',
      required: true,
      admin: {
        description:
          'The lead paragraph under a headline — the about page’s subtitle treatment. Plain text; for long-form body copy use the Prose block instead.',
      },
    },
    {
      name: 'reveal',
      type: 'checkbox',
      label: 'Reveal on scroll',
      // Opt-in and off by default, so a lead written without the toggle emits
      // no ScrollReveal at all and renders exactly the bare paragraph it would
      // have (see `lead.ts`). Honors reduced motion via the shared component.
      defaultValue: false,
      admin: {
        description:
          'Fade the paragraph up on scroll, the way the about page’s subtitle does. Off by default. Honors reduced motion (renders static).',
      },
    },
  ],
}
