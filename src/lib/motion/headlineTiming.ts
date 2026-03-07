export type HeadlineVariant = 'typewriter' | 'line'

export const TYPEWRITER_CHAR_DURATION = 0.02
export const TYPEWRITER_CHAR_STAGGER = 0.04
export const LINE_WORD_DURATION = 1.08
export const LINE_WORD_STAGGER = 0.14

/**
 * Estimates when a headline animation has visually settled so adjacent copy can
 * reveal after it without overlapping the primary motion beat.
 */
export function getHeadlineSettleDelay({
  text,
  variant,
  delay = 0.1,
}: {
  text: string
  variant: HeadlineVariant
  delay?: number
}) {
  if (variant === 'typewriter') {
    const charCount = Array.from(text).length
    return (
      delay +
      Math.max(0, charCount - 1) * TYPEWRITER_CHAR_STAGGER +
      TYPEWRITER_CHAR_DURATION +
      0.1
    )
  }

  const wordCount = text.trim().split(/\s+/).length
  return (
    delay + Math.max(0, wordCount - 1) * LINE_WORD_STAGGER + LINE_WORD_DURATION
  )
}
