'use client'

import clsx from 'clsx'
import { gsap } from 'gsap'
import { useEffect, useRef, useState } from 'react'

import { EASE_OUT, HOVER_TIMING } from '@/lib/motion/timing'
import {
  getPrefersReducedMotion,
  usePrefersReducedMotion,
} from '@/lib/motion/usePrefersReducedMotion'

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
    // Read the shared source, not an inline `matchMedia` re-check (#26): the
    // hook's state is still false on the first client pass, so gate on the
    // synchronous value here.
    const prefersReducedMotionSync = getPrefersReducedMotion()
    if (
      !root ||
      prefersReducedMotionSync ||
      prefersReducedMotion ||
      !isHoverable
    ) {
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
        duration: HOVER_TIMING.enter.root,
        ease: EASE_OUT,
        overwrite: 'auto',
      })
      if (overlayNodes.length > 0) {
        gsap.to(overlayNodes, {
          autoAlpha: 1,
          duration: HOVER_TIMING.enter.overlay,
          ease: EASE_OUT,
          overwrite: 'auto',
        })
      }
      if (imageNodes.length > 0) {
        gsap.to(imageNodes, {
          scale: imageScale,
          duration: HOVER_TIMING.enter.image,
          ease: EASE_OUT,
          overwrite: 'auto',
        })
      }
      if (iconNodes.length > 0) {
        gsap.to(iconNodes, {
          x: iconShiftX,
          duration: HOVER_TIMING.enter.icon,
          ease: EASE_OUT,
          overwrite: 'auto',
        })
      }
    }

    const runLeave = () => {
      gsap.to(root, {
        y: 0,
        scale: 1,
        duration: HOVER_TIMING.leave.root,
        ease: EASE_OUT,
        overwrite: 'auto',
      })
      if (overlayNodes.length > 0) {
        gsap.to(overlayNodes, {
          autoAlpha: 0,
          duration: HOVER_TIMING.leave.overlay,
          ease: EASE_OUT,
          overwrite: 'auto',
        })
      }
      if (imageNodes.length > 0) {
        gsap.to(imageNodes, {
          scale: 1,
          duration: HOVER_TIMING.leave.image,
          ease: EASE_OUT,
          overwrite: 'auto',
        })
      }
      if (iconNodes.length > 0) {
        gsap.to(iconNodes, {
          x: 0,
          duration: HOVER_TIMING.leave.icon,
          ease: EASE_OUT,
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
      // Guard on a non-empty collection like runEnter/runLeave above: a card
      // without hover images/icons/overlays yields an empty NodeList, and
      // gsap.set(<empty NodeList>) logs "GSAP target [object NodeList] not
      // found" on every unmount — which floods the console (and Sentry Logs
      // via the console integration) on a grid of cards.
      if (imageNodes.length > 0)
        gsap.set(imageNodes, { clearProps: 'transform' })
      if (iconNodes.length > 0) gsap.set(iconNodes, { clearProps: 'transform' })
      if (overlayNodes.length > 0)
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
