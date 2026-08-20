import type { SpacerBlock as SpacerBlockProps } from '@/payload-types'

const SIZES: Record<string, string> = {
  sm: 'h-8',
  md: 'h-16',
  lg: 'h-28',
}

/** Vertical rhythm spacer (CMS page builder). */
export function SpacerBlockComponent(props: SpacerBlockProps) {
  return <div aria-hidden className={SIZES[props.size ?? 'md'] ?? SIZES.md} />
}
