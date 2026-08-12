'use client'

import dynamic from 'next/dynamic'
import { useTheme } from 'next-themes'
import { useEffect, useRef, useState } from 'react'

import { usePrefersReducedMotion } from '@/lib/motion/usePrefersReducedMotion'
import { DEFAULT_SHADER_PRESET, type ShaderPresetKey } from './presets'

// Never SSR the canvas — WebGPU/WebGL2 only exists in the browser (§23).
const ShaderBackground = dynamic(() => import('./ShaderBackground'), {
  ssr: false,
})

/**
 * Preset light mode always uses, whatever the page configured (§23): a
 * near-black canvas must never land in a light page.
 */
export const LIGHT_MODE_SHADER_PRESET: ShaderPresetKey = 'static-noise-4'

/**
 * The preset actually rendered, given the configured one and the resolved
 * theme.
 *
 * @param preset - Preset the page (or the homepage default) configured.
 * @param resolvedTheme - `next-themes`' resolved theme; `undefined` before
 * the theme is known, which keeps the configured preset.
 * @returns {@link LIGHT_MODE_SHADER_PRESET} in light mode, else `preset`.
 */
export function activeShaderPreset(
  preset: ShaderPresetKey,
  resolvedTheme: string | undefined,
): ShaderPresetKey {
  return resolvedTheme === 'light' ? LIGHT_MODE_SHADER_PRESET : preset
}

/**
 * Positioning box of the homepage hero canvas: anchored to the page top
 * (behind the header) and inset to the centered `max-w-7xl` panel the Layout
 * draws, per Brandon's staging review — the canvas must never bleed past the
 * content panel.
 *
 * @remarks Exported as the component's default so callers that need another
 * box (the CMS full-bleed and card presentations, `src/heros/presentation.ts`)
 * override it explicitly, and the homepage keeps rendering this exact string.
 */
export const SHADER_HERO_FRAME_CLASS =
  'pointer-events-none absolute inset-x-0 top-0 -z-10 h-[36rem] sm:px-8'

/** Clip panel of the homepage hero canvas — the centered `max-w-7xl` panel. */
export const SHADER_HERO_PANEL_CLASS = 'mx-auto h-full w-full max-w-7xl lg:px-8'

/**
 * Hero background: animated aurora when supported, static gradient otherwise
 * (§23 acceptance criteria).
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
 *
 * @param preset - Preset rendered in dark mode (light mode always swaps to
 * the §23 light preset).
 * @param className - Positioning box of the canvas. Defaults to the homepage
 * geometry ({@link SHADER_HERO_FRAME_CLASS}); the CMS hero passes its own so
 * one component serves the page-top and the bounded-card treatments.
 * @param panelClassName - Clip panel inside that box
 * ({@link SHADER_HERO_PANEL_CLASS} by default).
 * @param scrim - Legibility wash over the text zone. On by default; a
 * bounded card turns it off (it exists to make a page-top background readable
 * behind left-aligned text).
 * @param bottomFade - Fade from the canvas into the page background. On by
 * default; a bounded card turns it off (there is no page background to reach).
 */
export function ShaderHero({
  preset = DEFAULT_SHADER_PRESET,
  className = SHADER_HERO_FRAME_CLASS,
  panelClassName = SHADER_HERO_PANEL_CLASS,
  scrim = true,
  bottomFade = true,
}: {
  preset?: ShaderPresetKey
  className?: string
  panelClassName?: string
  scrim?: boolean
  bottomFade?: boolean
}) {
  const reducedMotion = usePrefersReducedMotion()
  const { resolvedTheme } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const [gpuOk, setGpuOk] = useState(false)
  const [onscreen, setOnscreen] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

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

  const enabled = !reducedMotion && gpuOk && onscreen && mounted
  // Light mode gets the §23 light preset; dark mode uses the configured one.
  const activePreset = activeShaderPreset(preset, resolvedTheme)

  return (
    <div ref={containerRef} aria-hidden className={className}>
      <div className={panelClassName}>
        <div className="relative h-full overflow-hidden">
          {/* Static fallback — paints instantly, intentional in both themes. */}
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-100 via-white to-teal-50 dark:from-zinc-950 dark:via-[#0b1329] dark:to-black" />
          {enabled && (
            <div className="absolute inset-0 animate-[fadeIn_0.7s_ease-out]">
              <ShaderBackground key={activePreset} preset={activePreset} />
            </div>
          )}
          {/* Legibility scrim over the text zone + fade into the page below. */}
          {scrim && (
            <div className="absolute inset-0 bg-gradient-to-r from-white/60 via-white/20 to-transparent dark:from-zinc-900/70 dark:via-zinc-900/20 dark:to-transparent" />
          )}
          {bottomFade && (
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-white dark:to-zinc-900" />
          )}
        </div>
      </div>
    </div>
  )
}
