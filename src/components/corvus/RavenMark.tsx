import type { ComponentPropsWithoutRef } from 'react'

export type RavenMarkProps = ComponentPropsWithoutRef<'svg'>

/**
 * Corvus raven identity mark — the assistant's primary glyph, a single
 * silhouetted raven traced in one fill path.
 *
 * @remarks Inline SVG (source: `_corvus_marks/corvus-raven.svg`), kept at
 * `viewBox="0 0 64 64"` with `fill="currentColor"` so it inherits color from
 * an ancestor — set `color: var(--corvus-accent)` (or a `text-*` utility
 * that resolves to it) to render it gold. All props (including `className`)
 * spread onto the root `<svg>`. Used beside the wordmark in the Corvus page
 * header and as the chat empty-state icon (replacing the generic
 * `MessagesSquare` lucide icon). Pass `aria-hidden="true"` to override the
 * default `role="img"`/`aria-label` when used purely decoratively alongside
 * visible adjacent text.
 */
export function RavenMark(props: RavenMarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="currentColor"
      fillRule="evenodd"
      role="img"
      aria-label="Corvus raven mark"
      {...props}
    >
      <path
        d="M7 27.8
           C 13 26.2, 19 26, 24 26.2
           C 24.5 20.4, 28 15.6, 35 14.6
           C 43.2 13.4, 50.4 19.4, 51.9 27.6
           C 53 33.6, 51.2 40, 47 44.6
           C 43.8 48.1, 39.1 50.3, 34.3 50.8
           C 35.5 47.1, 35.1 43.2, 32.8 40.5
           C 30.1 44.6, 25.3 45.5, 21.7 43.4
           C 24.9 42.7, 27 40.7, 27.7 37.9
           C 24.8 38.7, 21.9 38, 19.7 36.1
           C 23.3 35.7, 25.9 33.8, 27.1 30.8
           C 22 31.7, 15.5 31.4, 11 30
           C 9.4 29.5, 8 28.8, 7 27.8 Z
           M 39.6 25.8
           C 42 25.8, 44 27.8, 44 30.2
           C 44 32.6, 42 34.6, 39.6 34.6
           C 37.2 34.6, 35.2 32.6, 35.2 30.2
           C 35.2 27.8, 37.2 25.8, 39.6 25.8 Z"
      />
    </svg>
  )
}
