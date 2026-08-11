import type { Block } from 'payload'

import {
  DEFAULT_SHADER_PRESET,
  SHADER_PRESET_OPTIONS,
} from '@/heros/shaderPresets'

/**
 * Standalone shader background section for layout-builder pages (distinct
 * from the Pages hero group, which also supports a shader type).
 *
 * @remarks Component lands in Phase 6 (client-only, reduced-motion +
 * no-WebGPU static-gradient fallback, offscreen pause). Config ships first
 * so the content model is stable.
 */
export const ShaderHero: Block = {
  slug: 'shaderHero',
  interfaceName: 'ShaderHeroBlock',
  imageURL: '/images/cms/shader-hero.svg',
  imageAltText: 'Line-art preview of the Shader Hero block',
  fields: [
    {
      name: 'preset',
      type: 'select',
      defaultValue: DEFAULT_SHADER_PRESET,
      options: [...SHADER_PRESET_OPTIONS],
      required: true,
    },
    {
      name: 'richText',
      type: 'richText',
      label: false,
    },
  ],
}
