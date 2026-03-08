'use client'

import clsx from 'clsx'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useEffect, useRef } from 'react'

import { usePrefersReducedMotion } from '@/lib/motion/usePrefersReducedMotion'

gsap.registerPlugin(ScrollTrigger)

/**
 * Applies subtle scroll-linked parallax transforms to children matching
 * `targetSelector`. Per-element strength can be controlled with
 * `data-parallax-speed`.
 */
export function ParallaxGroup({
  children,
  className,
  targetSelector = '[data-parallax-item]',
  amount = 11,
  start = 'top bottom',
  end = 'bottom top',
}: {
  children: React.ReactNode
  className?: string
  targetSelector?: string
  amount?: number
  start?: string
  end?: string
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const prefersReducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    if (prefersReducedMotion || !rootRef.current) {
      return
    }

    const ctx = gsap.context(() => {
      const targets = gsap.utils.toArray<HTMLElement>(
        targetSelector,
        rootRef.current,
      )

      for (const target of targets) {
        const parsedSpeed = parseFloat(target.dataset.parallaxSpeed ?? '1')
        const speed = Number.isFinite(parsedSpeed) ? parsedSpeed : 1
        const delta = amount * speed

        gsap.fromTo(
          target,
          { yPercent: -delta },
          {
            yPercent: delta,
            ease: 'none',
            scrollTrigger: {
              trigger: rootRef.current,
              start,
              end,
              scrub: 0.85,
              invalidateOnRefresh: true,
            },
          },
        )
      }
    }, rootRef)

    return () => ctx.revert()
  }, [amount, end, prefersReducedMotion, start, targetSelector])

  return (
    <div ref={rootRef} className={clsx(className)}>
      {children}
    </div>
  )
}
