import { readFileSync } from 'node:fs'
import path from 'node:path'

import { render } from '@testing-library/react'
import type { Field } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { CardChromeHeader } from '@/blocks/CardChromeHeader'
import { ContactFormComponent } from '@/blocks/ContactForm/Component'
import { ContactForm } from '@/blocks/ContactForm/config'
import { NewsletterSignupComponent } from '@/blocks/NewsletterSignup/Component'
import { NewsletterSignup } from '@/blocks/NewsletterSignup/config'
import { WorkHistoryCardComponent } from '@/blocks/WorkHistoryCard/Component'
import { WorkHistoryCard } from '@/blocks/WorkHistoryCard/config'
import {
  CARD_CHROME_HEADING_CLASS,
  CARD_CHROME_INTRO_SPACING_CLASS,
  CARD_CHROME_SPACING_CLASS,
  cardChromeFields,
  hasCardChrome,
} from '@/blocks/cardChrome'

// The work-history card reads the Payload Local API; the chrome above it is
// what this suite is about, and the card's own data path has its own cover.
vi.mock('@/components/home/Resume', () => ({
  Resume: () => <div data-card="resume" />,
}))
vi.mock('@/components/home/Messenger', () => ({
  Messenger: () => <div data-card="messenger" />,
}))
vi.mock('@/components/home/Newsletter', () => ({
  Newsletter: () => <div data-card="newsletter" />,
}))

const read = (relative: string) =>
  readFileSync(path.join(process.cwd(), relative), 'utf8')

/** The three blocks #40 gives a heading and an intro to. */
const ZERO_CONFIG_CARDS = [
  ['contactForm', ContactForm, ContactFormComponent],
  ['newsletterSignup', NewsletterSignup, NewsletterSignupComponent],
  ['workHistoryCard', WorkHistoryCard, WorkHistoryCardComponent],
] as const

const field = (fields: Field[], name: string) =>
  fields.find((candidate) => 'name' in candidate && candidate.name === name)

describe('card chrome fields', () => {
  it.each(ZERO_CONFIG_CARDS)(
    '%s accepts an optional heading',
    (_slug, config) => {
      const heading = field(config.fields, 'heading')

      expect(heading?.type).toBe('text')
      expect(heading).not.toHaveProperty('required', true)
      // Always available: no condition to satisfy, nothing to discover.
      expect(heading?.admin).not.toHaveProperty('condition')
    },
  )

  it.each(ZERO_CONFIG_CARDS)(
    '%s accepts an optional intro',
    (_slug, config) => {
      const intro = field(config.fields, 'intro')

      // Textarea, not rich text: a heading plus one line is the whole need, and
      // it keeps the migration two nullable varchars instead of Lexical JSON.
      expect(intro?.type).toBe('textarea')
      expect(intro).not.toHaveProperty('required', true)
      expect(intro?.admin).not.toHaveProperty('condition')
    },
  )

  it.each(ZERO_CONFIG_CARDS)(
    '%s keeps its retired `note` column, hidden',
    (_slug, config) => {
      // Removing it would be a DROP COLUMN, and the schema stays additive
      // until the Home/About flip.
      const note = field(config.fields, 'note')
      expect(note?.type).toBe('text')
      expect(note?.admin).toHaveProperty('hidden', true)
    },
  )

  it('hands every block its own field objects', () => {
    // Payload sanitizes configs in place; three blocks sharing one object
    // would share whatever the first sanitization wrote onto it.
    const [first] = cardChromeFields()
    const [second] = cardChromeFields()

    expect(first).not.toBe(second)
    expect(first).toEqual(second)
  })
})

describe('hasCardChrome', () => {
  it('is false for every shape a block written before #40 can have', () => {
    for (const chrome of [
      {},
      { heading: null, intro: null },
      { heading: undefined, intro: undefined },
      { heading: '', intro: '' },
      // A stray keystroke must not open 32px of air above the card.
      { heading: '  ', intro: '\n' },
    ]) {
      expect(hasCardChrome(chrome)).toBe(false)
    }
  })

  it('is true as soon as either field carries content', () => {
    expect(hasCardChrome({ heading: 'Say hello' })).toBe(true)
    expect(hasCardChrome({ intro: 'I reply to everything.' })).toBe(true)
  })
})

describe('CardChromeHeader', () => {
  it('renders nothing when the block stores no chrome', () => {
    const { container } = render(<CardChromeHeader />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the heading in the site block-heading treatment', () => {
    const { container } = render(<CardChromeHeader heading="Say hello" />)
    const heading = container.querySelector('h2') as HTMLElement

    expect(heading).toHaveTextContent('Say hello')
    expect(heading).toHaveAttribute('class', CARD_CHROME_HEADING_CLASS)
    expect(container.querySelector('header')).toHaveClass(
      CARD_CHROME_SPACING_CLASS,
    )
  })

  it('spaces the intro under the heading, and not when it stands alone', () => {
    const { container: both } = render(
      <CardChromeHeader heading="Say hello" intro="I reply to everything." />,
    )
    expect(both.querySelector('p')).toHaveClass(CARD_CHROME_INTRO_SPACING_CLASS)

    const { container: alone } = render(
      <CardChromeHeader intro="I reply to everything." />,
    )
    expect(alone.querySelector('h2')).toBeNull()
    expect(alone.querySelector('p')).not.toHaveClass(
      CARD_CHROME_INTRO_SPACING_CLASS,
    )
  })

  /**
   * The heading treatment is the site's, not a fourth one: read it back out
   * of the archive block the handoff named, so the two cannot drift apart
   * silently (`hostContext.test.ts` guards the column rhythm the same way).
   */
  it('uses the same heading class the other block headings do', () => {
    expect(
      read('src/blocks/ArticlesArchive/ArticlesArchiveView.tsx'),
    ).toContain(CARD_CHROME_HEADING_CLASS)
    expect(read('src/blocks/FeatureCardGrid/Component.tsx')).toContain(
      CARD_CHROME_HEADING_CLASS,
    )
  })
})

/**
 * #40's binding clause: "not any visual change to root-level rendering". A
 * block stored before this batch has no heading and no intro, and must render
 * the section it always rendered — not an empty `<header>`, not a wrapper.
 */
describe('zero-config cards with no chrome', () => {
  it.each(ZERO_CONFIG_CARDS)(
    '%s renders exactly the card, and nothing above it',
    (_slug, _config, Component) => {
      const { container } = render(<Component />)
      const section = container.querySelector('section') as HTMLElement

      expect(section).toHaveClass('my-12', 'max-w-xl')
      expect(section.children).toHaveLength(1)
      expect(section.querySelector('header')).toBeNull()
      expect(section.firstElementChild).toHaveAttribute('data-card')
    },
  )

  it.each(ZERO_CONFIG_CARDS)(
    '%s renders the chrome above the card in both host contexts',
    (_slug, _config, Component) => {
      for (const hosted of ['root', 'column'] as const) {
        const { container } = render(
          <Component
            heading="Work with me"
            intro="Two lines about what this card is for."
            hosted={hosted}
          />,
        )
        const section = container.querySelector('section') as HTMLElement

        expect(section.children).toHaveLength(2)
        expect(section.firstElementChild?.tagName).toBe('HEADER')
        expect(section.firstElementChild).toHaveClass(CARD_CHROME_SPACING_CLASS)
        expect(section.lastElementChild).toHaveAttribute('data-card')
        expect(section.querySelector('h2')?.getAttribute('class')).toBe(
          CARD_CHROME_HEADING_CLASS,
        )
      }
    },
  )
})
