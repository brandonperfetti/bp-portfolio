/**
 * Swappable shaders.com preset registry (§23) — mirrors the hero/ShaderHero
 * select options in the Payload config. Northern Lights 2 is the confirmed
 * default; the alternates are vetted in the handoff shortlist and land as
 * they're exported via the Shaders MCP.
 */
export const SHADER_PRESETS = [
  'northern-lights-2',
  'ribbon-flows-4',
  'synthesis-14',
  'drifting-lights-8',
  'static-noise-4',
] as const

export type ShaderPresetKey = (typeof SHADER_PRESETS)[number]

export const DEFAULT_SHADER_PRESET: ShaderPresetKey = 'northern-lights-2'
