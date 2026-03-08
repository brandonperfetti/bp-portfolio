'use client'

import clsx from 'clsx'
import { gsap } from 'gsap'
import { useEffect, useRef, useState } from 'react'

import { usePrefersReducedMotion } from '@/lib/motion/usePrefersReducedMotion'

/**
 * Applies hover/focus motion treatment to a card container and optional descendants.
 *
 * Descendant opt-in markers:
 * - `data-hover-image`: image/media node that scales on hover.
 * - `data-hover-overlay`: overlay node that fades in/out on hover.
 * - `data-hover-icon`: icon node that shifts horizontally on hover.
 *
 * @param children Card contents.
 * @param className Optional wrapper className.
 * @param as Polymorphic wrapper tag (`div` | `li` | `article`).
 * @param y Vertical lift amount on hover.
 * @param scale Root scale amount on hover.
 * @param imageScale Descendant image scale amount on hover.
 * @param iconShiftX Horizontal icon shift amount on hover.
 */
export function HoverMotionCard({
  children,
  className,
  as = 'div',
  y = -4,
  scale = 1.01,
  imageScale = 1.03,
  iconShiftX = 3,
}: {
  children: React.ReactNode
  className?: string
  as?: 'div' | 'li' | 'article'
  y?: number
  scale?: number
  imageScale?: number
  iconShiftX?: number
}) {
  const Component = as
  const rootRef = useRef<HTMLElement | null>(null)
  const prefersReducedMotion = usePrefersReducedMotion()
  const [isHoverable, setIsHoverable] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const mediaQuery = window.matchMedia('(hover: hover) and (pointer: fine)')
    const syncHoverCapability = (event?: MediaQueryListEvent) => {
      setIsHoverable(event ? event.matches : mediaQuery.matches)
    }

    syncHoverCapability()

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncHoverCapability)
      return () => {
        mediaQuery.removeEventListener('change', syncHoverCapability)
      }
    }

    mediaQuery.addListener(syncHoverCapability)
    return () => {
      mediaQuery.removeListener(syncHoverCapability)
    }
  }, [])

  useEffect(() => {
    const root = rootRef.current
    if (!root || prefersReducedMotion || !isHoverable) {
      return
    }

    const imageNodes = root.querySelectorAll<HTMLElement>('[data-hover-image]')
    const overlayNodes = root.querySelectorAll<HTMLElement>(
      '[data-hover-overlay]',
    )
    const iconNodes = root.querySelectorAll<HTMLElement>('[data-hover-icon]')

    const runEnter = () => {
      gsap.to(root, {
        y,
        scale,
        duration: 0.36,
        ease: 'power2.out',
        overwrite: 'auto',
      })
      if (overlayNodes.length > 0) {
        gsap.to(overlayNodes, {
          autoAlpha: 1,
          duration: 0.28,
          ease: 'power2.out',
          overwrite: 'auto',
        })
      }
      if (imageNodes.length > 0) {
        gsap.to(imageNodes, {
          scale: imageScale,
          duration: 0.46,
          ease: 'power2.out',
          overwrite: 'auto',
        })
      }
      if (iconNodes.length > 0) {
        gsap.to(iconNodes, {
          x: iconShiftX,
          duration: 0.34,
          ease: 'power2.out',
          overwrite: 'auto',
        })
      }
    }

    const runLeave = () => {
      gsap.to(root, {
        y: 0,
        scale: 1,
        duration: 0.44,
        ease: 'power2.out',
        overwrite: 'auto',
      })
      if (overlayNodes.length > 0) {
        gsap.to(overlayNodes, {
          autoAlpha: 0,
          duration: 0.36,
          ease: 'power2.out',
          overwrite: 'auto',
        })
      }
      if (imageNodes.length > 0) {
        gsap.to(imageNodes, {
          scale: 1,
          duration: 0.52,
          ease: 'power2.out',
          overwrite: 'auto',
        })
      }
      if (iconNodes.length > 0) {
        gsap.to(iconNodes, {
          x: 0,
          duration: 0.4,
          ease: 'power2.out',
          overwrite: 'auto',
        })
      }
    }

    const onFocusIn = () => runEnter()
    const onFocusOut = (event: FocusEvent) => {
      const nextTarget = event.relatedTarget
      if (nextTarget instanceof Node && root.contains(nextTarget)) {
        return
      }
      runLeave()
    }

    root.addEventListener('mouseenter', runEnter)
    root.addEventListener('mouseleave', runLeave)
    root.addEventListener('focusin', onFocusIn)
    root.addEventListener('focusout', onFocusOut)

    return () => {
      root.removeEventListener('mouseenter', runEnter)
      root.removeEventListener('mouseleave', runLeave)
      root.removeEventListener('focusin', onFocusIn)
      root.removeEventListener('focusout', onFocusOut)
      gsap.set(root, { clearProps: 'transform' })
      gsap.set(imageNodes, { clearProps: 'transform' })
      gsap.set(iconNodes, { clearProps: 'transform' })
      gsap.set(overlayNodes, { clearProps: 'opacity,visibility' })
    }
  }, [iconShiftX, imageScale, isHoverable, prefersReducedMotion, scale, y])

  return (
    <Component
      // Keep callback ref for the polymorphic `as` union, whose intrinsic refs are
      // more specific than HTMLElement and don't accept a shared object ref.
      ref={(node: HTMLElement | null) => {
        rootRef.current = node
      }}
      className={clsx('transform-gpu', className)}
    >
      {children}
    </Component>
  )
}
