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
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      {/* Static fallback — paints instantly, intentional in both themes. */}
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-100 via-white to-teal-50 dark:from-zinc-950 dark:via-[#0b1329] dark:to-black" />
      {enabled && (
        <div className="absolute inset-0 opacity-0 transition-opacity duration-700 dark:opacity-100">
          <ShaderBackground preset={preset} />
        </div>
      )}
    </div>
  )
}
