import { ImageResponse } from 'next/og'

import { loadOgCardFonts } from '@/lib/og/loadFonts'

/** Rendered card dimensions — the OG/Twitter `summary_large_image` standard. */
export const OG_CARD_SIZE = { width: 1200, height: 630 } as const

const BRAND = 'Brandon Perfetti'
const DOMAIN = 'brandonperfetti.com'
const ROLE = 'Senior Frontend & Full-Stack Engineer'

/**
 * Pick a title size that keeps long headlines inside three lines without
 * shrinking short ones. Mirrors the two-step scale from the approved mock
 * (68px short → 60px long), with a third step for very long titles the line
 * clamp would otherwise truncate mid-thought.
 */
function titleFontSize(title: string): number {
  if (title.length <= 45) return 68
  if (title.length <= 78) return 60
  return 52
}

/**
 * Render the branded fallback OG card for an entry that resolves to a generated
 * image (T7). The **title** is the only dynamic content; the eyebrow, footer,
 * background, and teal glow are fixed branding matched to the site's
 * `og-default` (near-black `#0a0a0b` + teal accent).
 *
 * Shared by the article and page OG routes so both emit an identical card. Pure
 * apart from reading the bundled fonts; returns a streaming PNG response.
 *
 * @param title - The headline to render (entry's SEO title or title). Falls
 *   back to the brand name when empty so the card is never blank.
 */
export function renderOgCard(title: string): ImageResponse {
  const fonts = loadOgCardFonts()
  const headline = title.trim() || BRAND

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#0a0a0b',
          padding: '72px 76px',
          position: 'relative',
          fontFamily: 'Geist',
        }}
      >
        {/* Teal glow, echoing og-default. Absolutely-positioned divs rather than
            a ::before, which Satori does not render. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            backgroundImage:
              'radial-gradient(760px 520px at 88% 8%, rgba(45, 212, 191, 0.16), transparent 60%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            backgroundImage:
              'radial-gradient(620px 480px at 6% 104%, rgba(20, 184, 166, 0.10), transparent 60%)',
          }}
        />

        {/* Eyebrow */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 15,
              height: 15,
              borderRadius: 9999,
              backgroundColor: '#2dd4bf',
              boxShadow: '0 0 22px 3px rgba(45, 212, 191, 0.55)',
            }}
          />
          <div
            style={{
              fontSize: 25,
              fontWeight: 600,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: '#2dd4bf',
            }}
          >
            {BRAND}
          </div>
        </div>

        {/* Title — the only dynamic content. `-webkit-box` + line-clamp is how
            Satori truncates to a fixed number of lines. */}
        <div
          style={{
            display: '-webkit-box',
            fontSize: titleFontSize(headline),
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: '-0.02em',
            color: '#ffffff',
            overflow: 'hidden',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 3,
          }}
        >
          {headline}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 26,
            borderTop: '2px solid rgba(45, 212, 191, 0.35)',
          }}
        >
          <div style={{ fontSize: 27, fontWeight: 600, color: '#d4d4d8' }}>
            {DOMAIN}
          </div>
          <div style={{ fontSize: 22, fontWeight: 400, color: '#71717a' }}>
            {ROLE}
          </div>
        </div>
      </div>
    ),
    { ...OG_CARD_SIZE, fonts },
  )
}
