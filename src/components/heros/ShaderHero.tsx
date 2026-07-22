'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'

import { usePrefersReducedMotion } from '@/lib/motion/usePrefersReducedMotion'
import { DEFAULT_SHADER_PRESET, type ShaderPresetKey } from './presets'

// Never SSR the canvas — WebGPU/WebGL2 only exists in the browser (§23).
const ShaderBackground = dynamic(() => import('./ShaderBackground'), {
  ssr: false,
})

/**
 * Full-bleed hero background: animated aurora when supported, static gradient
 * otherwise (§23 acceptance criteria).
 *
 * @remarks
 * - Reduced motion or no WebGPU/WebGL2 → static CSS gradient only.
 * - Offscreen → the canvas unmounts (IntersectionObserver) so the GPU idles.
 * - The gradient paints first either way, so hero text LCPs without waiting
 *   on the canvas; the canvas is decoration (`aria-hidden`,
 *   `pointer-events-none`).
 * - Light mode keeps a lighter gradient so a near-black canvas never lands in
 *   a light page. TODO(brandon): pick the light-mode preset (§23 suggests
 *   Static Noise 4) on staging.
 */
export function ShaderHero({
  preset = DEFAULT_SHADER_PRESET,
}: {
  preset?: ShaderPresetKey
}) {
  const reducedMotion = usePrefersReducedMotion()
  const containerRef = useRef<HTMLDivElement>(null)
  const [gpuOk, setGpuOk] = useState(false)
  const [onscreen, setOnscreen] = useState(true)

  useEffect(() => {
    const hasGpu =
      typeof navigator !== 'undefined' &&
      ('gpu' in navigator ||
        Boolean(document.createElement('canvas').getContext('webgl2')))
    setGpuOk(hasGpu)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      ([entry]) => setOnscreen(entry.isIntersecting),
      { rootMargin: '120px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const enabled = !reducedMotion && gpuOk && onscreen

  return (
    // Anchored to the page top (behind the header) and clipped to the same
    // centered max-w-7xl panel the Layout draws, per Brandon's staging review
    // — the canvas must never bleed past the content panel.
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[36rem] sm:px-8"
    >
      <div className="mx-auto h-full w-full max-w-7xl lg:px-8">
        <div className="relative h-full overflow-hidden">
          {/* Static fallback — paints instantly, intentional in both themes. */}
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-100 via-white to-teal-50 dark:from-zinc-950 dark:via-[#0b1329] dark:to-black" />
          {enabled && (
            <div className="absolute inset-0 opacity-0 transition-opacity duration-700 dark:opacity-100">
              <ShaderBackground preset={preset} />
            </div>
          )}
          {/* Legibility scrim over the text zone + fade into the page below. */}
          <div className="absolute inset-0 bg-gradient-to-r from-white/60 via-white/20 to-transparent dark:from-zinc-900/70 dark:via-zinc-900/20 dark:to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-white dark:to-zinc-900" />
        </div>
      </div>
    </div>
  )
}
