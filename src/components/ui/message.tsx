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
 * @remarks The zinc/teal utility classes are the *base* palette used anywhere
 * this component renders outside a Corvus surface (e.g. Storybook). Inside
 * `.corvus-surface`, the scoped rules in `src/styles/tailwind.css` key on
 * `[data-slot='message-content'][data-from='...']` and override the bubble to
 * the #78 Corvus identity palette — so `data-from` must live on THIS element
 * (not only the parent `Message` row) for that override to match.
 */
function MessageContent({ from, className, ...props }: MessageContentProps) {
  return (
    <div
      data-slot="message-content"
      data-from={from}
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
