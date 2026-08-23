/**
 * Frontend re-export of the shader preset registry (§23).
 *
 * @remarks The canonical list (ids + admin labels) lives in
 * `src/heros/shaderPresets.ts` so the Payload configs and this frontend
 * surface can never drift — this module exists so component-land keeps its
 * established import path.
 */
export {
  DEFAULT_SHADER_PRESET,
  SHADER_PRESET_OPTIONS,
  SHADER_PRESETS,
  type ShaderPresetKey,
} from '@/heros/shaderPresets'
