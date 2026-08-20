// @vitest-environment node
import type { CheckboxField, TextareaField } from 'payload'

import { describe, expect, it } from 'vitest'

import { Lead } from '@/blocks/Lead/config'
import { LEAD_CLASS, LEAD_REVEAL } from '@/blocks/Lead/lead'

const field = (name: string) =>
  Lead.fields.find((f) => 'name' in f && f.name === name)

/**
 * The pixel-parity pins for the about page's lead paragraph. The #44 flip put
 * `/about` on the page builder and deleted the hand-built `about/page.tsx` JSX
 * these once cross-checked (the way the #42 home flip retired its source
 * guards), so `lead.ts` is now the sole source of truth: the class string and
 * the `ScrollReveal` params are pinned to the exact literals the hand-built
 * page rendered, so a future edit to the block fails loudly.
 */
describe('lead paragraph vocabulary', () => {
  it('pins the about page lead classes', () => {
    expect(LEAD_CLASS).toBe(
      'mt-6 space-y-7 text-base text-zinc-600 dark:text-zinc-400',
    )
  })

  it('pins the about page lead reveal params', () => {
    expect(LEAD_REVEAL).toEqual({ y: 14, duration: 0.72, delay: 0.24 })
  })
})

describe('lead block config', () => {
  it('takes plain text, required — a lead is a single string, not rich text', () => {
    const text = field('text') as TextareaField | undefined
    expect(text).toBeDefined()
    expect(text?.type).toBe('textarea')
    expect(text?.required).toBe(true)
  })

  it('exposes an opt-in reveal checkbox that defaults to off', () => {
    // Off by default so a lead written without the toggle emits no
    // ScrollReveal — it renders exactly the bare paragraph it would have.
    const reveal = field('reveal') as CheckboxField | undefined
    expect(reveal?.type).toBe('checkbox')
    expect(reveal?.defaultValue).toBe(false)
  })

  it('adds no select, so it mints no Postgres enum', () => {
    for (const f of Lead.fields) {
      expect('type' in f && f.type).not.toBe('select')
    }
  })

  it('carries the interface name the generated type and renderer share', () => {
    expect(Lead.slug).toBe('lead')
    expect(Lead.interfaceName).toBe('LeadBlock')
  })
})
