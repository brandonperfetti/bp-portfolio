import type { Block } from 'payload'

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
  fields: [
    {
      name: 'preset',
      type: 'select',
      defaultValue: 'northern-lights-2',
      options: [
        { label: 'Northern Lights 2 (aurora)', value: 'northern-lights-2' },
        { label: 'Ribbon Flows 4', value: 'ribbon-flows-4' },
        { label: 'Synthesis 14', value: 'synthesis-14' },
        { label: 'Drifting Lights 8', value: 'drifting-lights-8' },
        { label: 'Static Noise 4 (light)', value: 'static-noise-4' },
      ],
      required: true,
    },
    {
      name: 'richText',
      type: 'richText',
      label: false,
    },
  ],
}
