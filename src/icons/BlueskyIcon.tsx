/**
 * Bluesky's butterfly, for a social link the resolver reads off a `bsky.app`
 * host (#46).
 *
 * @param props - Passed through to the `svg` element, as every icon here does.
 * @remarks Path from simple-icons (https://simpleicons.org), CC0-1.0 — the
 * same public-domain source the other brand glyphs in this folder use. No
 * `fill` is set on purpose: the shape inherits whatever `fill-*` utility the
 * caller applies, which is what keeps one icon correct in both themes and on
 * hover rather than freezing it at a brand colour.
 */
export default function BlueskyIcon(
  props: React.ComponentPropsWithoutRef<'svg'>,
) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.479 0-.688-.139-1.86-.902-2.203-.659-.299-1.664-.621-4.3 1.24C16.046 4.747 13.087 8.686 12 10.8Z" />
    </svg>
  )
}
