'use client'

import clsx from 'clsx'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useLayoutEffect, useRef } from 'react'

import { usePrefersReducedMotion } from '@/lib/motion/usePrefersReducedMotion'

gsap.registerPlugin(ScrollTrigger)

export function ScrollReveal({
  children,
  className,
  targets = 'self',
  once = true,
  y = 18,
  duration = 0.86,
  stagger = 0.09,
  start = 'top 88%',
  delay = 0,
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
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const prefersReducedMotion = usePrefersReducedMotion()

  useLayoutEffect(() => {
    const prefersReducedMotionSync =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
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

      gsap.set(elements, { autoAlpha: 0, y })
      gsap.to(elements, {
        autoAlpha: 1,
        y: 0,
        duration,
        delay,
        stagger: elements.length > 1 ? stagger : 0,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: rootRef.current,
          start,
          once,
          toggleActions: once
            ? 'play none none none'
            : 'play none none reverse',
        },
      })
    }, rootRef)

    return () => ctx.revert()
  }, [delay, duration, once, prefersReducedMotion, stagger, start, targets, y])

  return (
    <div ref={rootRef} className={clsx(className)}>
      {children}
    </div>
  )
}
