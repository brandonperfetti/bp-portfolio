// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { CheckboxField, TextareaField } from 'payload'

import { describe, expect, it } from 'vitest'

import { Lead } from '@/blocks/Lead/config'
import { LEAD_CLASS, LEAD_REVEAL } from '@/blocks/Lead/lead'

const read = (relative: string) =>
  readFileSync(path.join(process.cwd(), relative), 'utf8')

const field = (name: string) =>
  Lead.fields.find((f) => 'name' in f && f.name === name)

/**
 * The pixel-parity gate for the about page's lead paragraph. Unlike Home, the
 * about page is still hand-built at `about/page.tsx`, so its lead treatment can
 * be read straight out of the source: the class string and the `ScrollReveal`
 * params are pinned to what that page renders, so a future edit to either the
 * page or this block fails loudly.
 */
describe('lead paragraph vocabulary', () => {
  it('reproduces the about page lead classes read from about/page.tsx', () => {
    const aboutSource = read('src/app/(frontend)/about/page.tsx')
    expect(LEAD_CLASS).toBe(
      'mt-6 space-y-7 text-base text-zinc-600 dark:text-zinc-400',
    )
    expect(aboutSource).toContain(LEAD_CLASS)
  })

  it('reproduces the about page lead reveal params read from about/page.tsx', () => {
    const aboutSource = read('src/app/(frontend)/about/page.tsx')
    expect(LEAD_REVEAL).toEqual({ y: 14, duration: 0.72, delay: 0.24 })
    expect(aboutSource).toContain('y={14} duration={0.72} delay={0.24}')
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
