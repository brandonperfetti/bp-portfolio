'use client'

import dynamic from 'next/dynamic'

import { RichTextContent } from '@/components/cms/RichTextContent'
import { usePrefersReducedMotion } from '@/lib/motion/usePrefersReducedMotion'
import type { ShaderPresetKey } from '@/components/heros/presets'
import type { ShaderHeroBlock as ShaderHeroBlockProps } from '@/payload-types'
import { useEffect, useState } from 'react'

// Never SSR the canvas — WebGPU/WebGL2 only exists in the browser (§23).
const ShaderBackground = dynamic(
  () => import('@/components/heros/ShaderBackground'),
  { ssr: false },
)

/**
 * Standalone shader section (CMS page builder): a bounded animated panel
 * with optional rich text overlaid. Distinct from the page-hero shader,
 * which is full-bleed behind the page top.
 *
 * @remarks Same §23 fallbacks as the hero: reduced motion or no
 * WebGPU/WebGL2 renders a static gradient; the canvas is decoration and the
 * text stays real HTML.
 */
export function ShaderHeroBlockComponent(props: ShaderHeroBlockProps) {
  const reducedMotion = usePrefersReducedMotion()
  const [gpuOk, setGpuOk] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const hasGpu =
      typeof navigator !== 'undefined' &&
      ('gpu' in navigator ||
        Boolean(document.createElement('canvas').getContext('webgl2')))
    setGpuOk(hasGpu)
  }, [])

  const showCanvas = mounted && gpuOk && !reducedMotion

  return (
    <section className="relative isolate my-12 min-h-[20rem] overflow-hidden rounded-2xl">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-br from-zinc-100 via-white to-teal-50 dark:from-zinc-950 dark:via-[#0b1329] dark:to-black"
      />
      {showCanvas ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <ShaderBackground
            preset={(props.preset ?? 'northern-lights-2') as ShaderPresetKey}
          />
        </div>
      ) : null}
      {props.richText ? (
        <div className="relative z-10 flex min-h-[20rem] items-center p-8 sm:p-12">
          <RichTextContent
            content={props.richText}
            className="max-w-xl [text-shadow:0_1px_8px_rgba(0,0,0,0.25)]"
          />
        </div>
      ) : null}
    </section>
  )
}
