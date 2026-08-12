import { AnimatedHeadline } from '@/components/motion/AnimatedHeadline'
import { type BlockHostContext, blockRhythmClass } from '@/blocks/hostContext'
import {
  DEFAULT_HEADING_LEVEL,
  DEFAULT_HEADING_VARIANT,
  HEADING_LEVEL_CLASSES,
} from '@/blocks/Heading/levels'
import { cn } from '@/lib/utils'
import type { HeadingBlock } from '@/payload-types'

/**
 * Animated heading (CMS page builder).
 *
 * @param props - The stored block, plus `hosted`: where it is rendering.
 * @remarks Thin by design: `AnimatedHeadline` already owns both animations
 * and the reduced-motion path (it renders the plain heading, no spans, no
 * GSAP, when the visitor asks for less motion), so this block resolves stored
 * values to that component's props and nothing else. #36 is explicit that no
 * new animation variants come with it.
 *
 * The rhythm class rides on the heading element itself rather than a wrapper
 * div — one element, and margins on a heading collapse the way the rest of
 * the page expects.
 */
export function HeadingBlockComponent(
  props: HeadingBlock & { hosted?: BlockHostContext },
) {
  const text = props.text?.trim()
  if (!text) return null

  const level = props.level ?? DEFAULT_HEADING_LEVEL

  return (
    <AnimatedHeadline
      text={text}
      as={level}
      variant={props.variant ?? DEFAULT_HEADING_VARIANT}
      className={cn(
        blockRhythmClass(props.hosted),
        HEADING_LEVEL_CLASSES[level],
      )}
    />
  )
}
