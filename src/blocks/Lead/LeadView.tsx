import { type ReactNode } from 'react'

import { LEAD_CLASS, LEAD_REVEAL } from '@/blocks/Lead/lead'
import { ScrollReveal } from '@/components/motion/ScrollReveal'

/**
 * Wraps its children in a `ScrollReveal` with the about page's lead params
 * when `enabled`, and renders them bare otherwise — no wrapper element at all.
 *
 * @remarks "Bare when off" is the parity contract: a lead with the reveal off
 * emits exactly the paragraph it would have before the toggle existed, so the
 * reveal is either the about page's wrapper or nothing (the same shape
 * `HeroView`'s `MaybeReveal` uses).
 */
function MaybeReveal({
  enabled,
  children,
}: {
  enabled: boolean
  children: ReactNode
}) {
  if (!enabled) return <>{children}</>
  return (
    <ScrollReveal
      y={LEAD_REVEAL.y}
      duration={LEAD_REVEAL.duration}
      delay={LEAD_REVEAL.delay}
    >
      {children}
    </ScrollReveal>
  )
}

/**
 * Lead paragraph, presentational: plain props only, so the reveal on/off pair
 * is reachable from a story without a stored block.
 *
 * @param text - The lead paragraph text.
 * @param reveal - Wrap in the about page's `ScrollReveal`. Off by default, so
 * the paragraph renders bare — byte-identical to before the toggle existed.
 * @remarks Empty text renders nothing, so a block an editor added and never
 * filled leaves no gap behind (the same contract `prose` and `heading` keep).
 *
 * The paragraph carries its own `mt-6` gap-under-headline rather than the
 * generic block rhythm — see {@link LEAD_CLASS}.
 */
export function LeadView({
  text,
  reveal = false,
}: {
  text?: string | null
  reveal?: boolean
}) {
  const value = text?.trim()
  if (!value) return null

  return (
    <MaybeReveal enabled={reveal}>
      <div className={LEAD_CLASS}>
        <p>{value}</p>
      </div>
    </MaybeReveal>
  )
}
