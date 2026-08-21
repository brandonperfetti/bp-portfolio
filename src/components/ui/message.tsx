import * as React from 'react'

import { cn } from '@/lib/utils'

/** Which side of the conversation a message came from. */
export type MessageFrom = 'user' | 'assistant'

export interface MessageProps extends React.ComponentProps<'div'> {
  /** Drives left/right alignment: `assistant` sits left, `user` sits right. */
  from: MessageFrom
}

/**
 * Row wrapper for one chat message — aligns its children left (assistant) or
 * right (user) and anchors them to the row's bottom edge.
 *
 * @remarks Presentational only; the caller supplies the bubble
 * ({@link MessageContent}) and any per-message affordances (e.g. a copy
 * button) as children.
 */
function Message({ from, className, ...props }: MessageProps) {
  return (
    <div
      data-slot="message"
      data-from={from}
      className={cn(
        'flex items-end',
        from === 'user' && 'justify-end',
        className,
      )}
      {...props}
    />
  )
}

export interface MessageContentProps extends React.ComponentProps<'div'> {
  /** Drives bubble color/corner-radius: teal for assistant, zinc for user. */
  from: MessageFrom
}

/**
 * The chat bubble itself — colored, padded, and rounded, with the
 * speaking-side corner squared off (the "tail" side).
 *
 * @remarks Token-driven (zinc/teal, matching light+dark parity elsewhere in
 * the app) — this is deliberately the *current* Corvus palette, not the
 * Corvus visual-identity work tracked separately in #78.
 */
function MessageContent({ from, className, ...props }: MessageContentProps) {
  return (
    <div
      data-slot="message-content"
      className={cn(
        'inline-block rounded-xl px-4 py-2.5 text-sm',
        from === 'assistant'
          ? 'rounded-bl-none bg-teal-700 text-white'
          : 'rounded-br-none bg-zinc-500 text-white dark:bg-zinc-600',
        className,
      )}
      {...props}
    />
  )
}

export { Message, MessageContent }
