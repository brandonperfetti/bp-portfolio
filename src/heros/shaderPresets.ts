/**
 * The single source of truth for the shaders.com preset vocabulary (§23).
 *
 * @remarks Every surface that names a preset derives from this list: the
 * Pages hero select (`src/heros/config.ts`), the ShaderHero block select
 * (`src/blocks/ShaderHero/config.ts`), and the frontend registry
 * (`src/components/heros/presets.ts`). Adding or renaming a preset here is
 * a schema change — the Postgres enums behind both selects must migrate in
 * the same PR (see `src/migrations/`). Northern Lights 2 is the confirmed
 * default; the alternates are vetted in the handoff shortlist.
 */
export const SHADER_PRESET_OPTIONS = [
  { label: 'Northern Lights 2 (aurora)', value: 'northern-lights-2' },
  { label: 'Ribbon Flows 4', value: 'ribbon-flows-4' },
  { label: 'Synthesis 14', value: 'synthesis-14' },
  { label: 'Drifting Lights 8', value: 'drifting-lights-8' },
  { label: 'Static Noise 4 (light)', value: 'static-noise-4' },
] as const

/** Union of valid preset ids, derived from the option list. */
export type ShaderPresetKey = (typeof SHADER_PRESET_OPTIONS)[number]['value']

/**
 * Preset ids only, for surfaces that don't need admin labels (Storybook
 * controls, runtime guards).
 */
export const SHADER_PRESETS: readonly ShaderPresetKey[] =
  SHADER_PRESET_OPTIONS.map((option) => option.value)

/** The default preset every select and runtime fallback agrees on. */
export const DEFAULT_SHADER_PRESET =
  'northern-lights-2' satisfies ShaderPresetKey
