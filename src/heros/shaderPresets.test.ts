// @vitest-environment node
import type { SelectField } from 'payload'

import { describe, expect, it } from 'vitest'

import { ShaderHero } from '@/blocks/ShaderHero/config'
import { hero } from '@/heros/config'
import {
  DEFAULT_SHADER_PRESET,
  SHADER_PRESET_OPTIONS,
  SHADER_PRESETS,
} from '@/heros/shaderPresets'

/**
 * Guards issue #21: the shader preset vocabulary lives in exactly one
 * module, and both Payload selects derive from it. If either config ever
 * hand-copies the list again, these deep-equality checks catch the drift.
 */
const selectNamed = (source: unknown, name: string): SelectField => {
  const fields = (source as { fields: { name?: string; type?: string }[] })
    .fields
  const field = fields.find((candidate) => candidate.name === name)
  if (!field || field.type !== 'select') {
    throw new Error(`Expected a select field named "${name}"`)
  }
  return field as SelectField
}

describe('shader preset registry', () => {
  it('drives the Pages hero shaderPreset select', () => {
    const field = selectNamed(hero, 'shaderPreset')
    expect(field.options).toEqual([...SHADER_PRESET_OPTIONS])
    expect(field.defaultValue).toBe(DEFAULT_SHADER_PRESET)
  })

  it('drives the ShaderHero block preset select', () => {
    const field = selectNamed(ShaderHero, 'preset')
    expect(field.options).toEqual([...SHADER_PRESET_OPTIONS])
    expect(field.defaultValue).toBe(DEFAULT_SHADER_PRESET)
  })

  it('derives the id list and default from the option objects', () => {
    expect(SHADER_PRESETS).toEqual(
      SHADER_PRESET_OPTIONS.map((option) => option.value),
    )
    expect(SHADER_PRESETS).toContain(DEFAULT_SHADER_PRESET)
    // The Postgres enums were generated from this exact five-preset set;
    // growing or renaming it requires a migration in the same PR.
    expect(SHADER_PRESETS).toHaveLength(5)
  })
})
