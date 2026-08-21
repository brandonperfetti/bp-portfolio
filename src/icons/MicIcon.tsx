/**
 * Waveform mic glyph for the Corvus composer's voice-input button (#80).
 *
 * @remarks Five bars of varying height rather than a classic microphone
 * silhouette — matches the approved `corvus-chat-mock.html` composer icon
 * set (paired with the existing {@link SendIcon}).
 */
export default function MicIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      {...props}
    >
      <line x1="4" y1="12" x2="4" y2="12" />
      <line x1="8" y1="8" x2="8" y2="16" />
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="16" y1="9" x2="16" y2="15" />
      <line x1="20" y1="11" x2="20" y2="13" />
    </svg>
  )
}
