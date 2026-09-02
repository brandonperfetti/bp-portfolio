/**
 * YouTube's glyph, for a social link the resolver reads off a
 * `youtube.com` / `youtu.be` host (#46).
 *
 * @param props - Passed through to the `svg` element, as every icon here does.
 * @remarks Path from simple-icons (https://simpleicons.org), CC0-1.0 — the
 * same public-domain source the other brand glyphs in this folder use. No
 * `fill` is set on purpose: the shape inherits whatever `fill-*` utility the
 * caller applies, which is what keeps one icon correct in both themes and on
 * hover rather than freezing it at a brand colour.
 */
export default function YouTubeIcon(
  props: React.ComponentPropsWithoutRef<'svg'>,
) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814ZM9.545 15.568V8.432L15.818 12l-6.273 3.568Z" />
    </svg>
  )
}
