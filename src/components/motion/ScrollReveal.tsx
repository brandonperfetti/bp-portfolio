'use client'

import clsx from 'clsx'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useLayoutEffect, useRef } from 'react'

import { EASE_OUT, REVEAL_GRID } from '@/lib/motion/timing'
import {
  getPrefersReducedMotion,
  usePrefersReducedMotion,
} from '@/lib/motion/usePrefersReducedMotion'

gsap.registerPlugin(ScrollTrigger)

/** Upper bound on the last element's stagger delay in a single reveal. */
const MAX_STAGGER_TAIL_SECONDS = 1.1

/**
 * Reveals child content on scroll with configurable GSAP motion presets.
 *
 * @param children Rendered content to reveal.
 * @param className Optional wrapper classes.
 * @param targets Target selector within the wrapper (or `'self'`). Defaults to `'self'`.
 * @param once Whether animation should play only once. Defaults to `true`.
 * @param y Initial vertical offset in pixels. Defaults to `REVEAL_GRID.y`.
 * @param duration Animation duration in seconds. Defaults to `REVEAL_GRID.duration`.
 * @param stagger Stagger delay between multiple targets in seconds. Defaults to `REVEAL_GRID.stagger`.
 * @param start ScrollTrigger start position expression. Defaults to `REVEAL_GRID.start`.
 * @param delay Additional delay before animation starts in seconds. Defaults to `0`.
 * @param immediate Reveal as soon as the effect runs instead of waiting for a
 * scroll trigger. Defaults to `false` (scroll-gated). Opt in when the wrapped
 * content is the visitor's explicit target and must not sit hidden below the
 * fold — e.g. a deep-linked or actively-filtered result grid, where the
 * scroll-gated reveal otherwise leaves matches `visibility:hidden` until the
 * visitor scrolls (a shared `/tech?q=…` link showing "1 result" over a blank
 * grid). No caller that omits it changes behaviour.
 * @param revealKey When it changes, the reveal re-runs (re-hide then re-play)
 * so a changed target set — e.g. a new filter result — reveals rather than
 * inheriting the previous run's styles. Pair with `immediate` on filterable
 * grids; leave undefined elsewhere to keep the single-run default.
 * @remarks This component only changes visual presentation and does not alter focus order or keyboard interaction behavior.
 */
export function ScrollReveal({
  children,
  className,
  targets = 'self',
  once = true,
  y = REVEAL_GRID.y,
  duration = REVEAL_GRID.duration,
  stagger = REVEAL_GRID.stagger,
  start = REVEAL_GRID.start,
  delay = 0,
  immediate = false,
  revealKey,
}: {
  children: React.ReactNode
  className?: string
  targets?: string | 'self'
  once?: boolean
  y?: number
  duration?: number
  stagger?: number
  start?: string
  delay?: number
  immediate?: boolean
  revealKey?: string | number
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const prefersReducedMotion = usePrefersReducedMotion()

  useLayoutEffect(() => {
    // Read the shared source, not an inline `matchMedia` re-check (#26): the
    // hook's state is still false on the first client pass, so gate on the
    // synchronous value here.
    const prefersReducedMotionSync = getPrefersReducedMotion()
    if (prefersReducedMotionSync || prefersReducedMotion || !rootRef.current) {
      return
    }

    const ctx = gsap.context(() => {
      const elements =
        targets === 'self'
          ? [rootRef.current].filter(Boolean)
          : gsap.utils.toArray<HTMLElement>(targets, rootRef.current)

      if (!elements.length) {
        return
      }

      // Cap the total stagger tail so long grids (38 tech cards) finish
      // revealing in ~1s instead of scaling linearly with item count.
      const cappedStagger =
        elements.length > 1
          ? Math.min(stagger, MAX_STAGGER_TAIL_SECONDS / (elements.length - 1))
          : 0

      gsap.set(elements, { autoAlpha: 0, y })
      const revealVars = {
        autoAlpha: 1,
        y: 0,
        duration,
        delay,
        stagger: cappedStagger,
        ease: EASE_OUT,
      }
      if (immediate) {
        // No scroll gate: reveal now. Deep-linked / actively-filtered content
        // is the visitor's explicit target and must not stay hidden below the
        // fold waiting for a scroll that a single short result never prompts.
        gsap.to(elements, revealVars)
      } else {
        gsap.to(elements, {
          ...revealVars,
          scrollTrigger: {
            trigger: rootRef.current,
            start,
            once,
            toggleActions: once
              ? 'play none none none'
              : 'play none none reverse',
          },
        })
      }
    }, rootRef)

    return () => ctx.revert()
  }, [
    delay,
    duration,
    immediate,
    once,
    prefersReducedMotion,
    revealKey,
    stagger,
    start,
    targets,
    y,
  ])

  return (
    <div ref={rootRef} className={clsx(className)}>
      {children}
    </div>
  )
}
