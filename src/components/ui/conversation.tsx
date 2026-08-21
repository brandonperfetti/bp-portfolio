'use client'

import * as React from 'react'
import { ArrowDownIcon } from 'lucide-react'

import { usePrefersReducedMotion } from '@/lib/motion/usePrefersReducedMotion'
import { cn } from '@/lib/utils'

/** How close to the bottom (px) still counts as "at the bottom". */
const BOTTOM_THRESHOLD_PX = 24

interface ConversationContextValue {
  scrollRef: React.RefObject<HTMLDivElement | null>
  contentRef: React.RefObject<HTMLDivElement | null>
  isAtBottom: boolean
  scrollToBottom: (behavior?: ScrollBehavior) => void
}

const ConversationContext =
  React.createContext<ConversationContextValue | null>(null)

function useConversationContext(component: string) {
  const context = React.useContext(ConversationContext)
  if (!context) {
    throw new Error(`<${component}> must be rendered inside <Conversation>`)
  }
  return context
}

/**
 * Home-grown stick-to-bottom tracking (no `use-stick-to-bottom` dependency).
 * A scroll listener on the outer container tracks whether it's pinned to its
 * bottom edge; a `ResizeObserver` on the inner content wrapper re-pins it
 * whenever content grows (a new message, or a streaming message getting
 * longer) — but only while already pinned, so a visitor who has scrolled up
 * to read back isn't yanked back down. `isAtBottom` flipping false is what
 * lets {@link ConversationScrollButton} know to appear.
 */
function useStickToBottom() {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const contentRef = React.useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = React.useState(true)
  const isAtBottomRef = React.useRef(true)
  const prefersReducedMotion = usePrefersReducedMotion()
  const prefersReducedMotionRef = React.useRef(prefersReducedMotion)
  prefersReducedMotionRef.current = prefersReducedMotion

  const setAtBottom = React.useCallback((value: boolean) => {
    isAtBottomRef.current = value
    setIsAtBottom(value)
  }, [])

  const scrollToBottom = React.useCallback((behavior?: ScrollBehavior) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({
      top: el.scrollHeight,
      behavior:
        behavior ?? (prefersReducedMotionRef.current ? 'auto' : 'smooth'),
    })
  }, [])

  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const distanceFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight
      setAtBottom(distanceFromBottom <= BOTTOM_THRESHOLD_PX)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => el.removeEventListener('scroll', onScroll)
  }, [setAtBottom])

  React.useEffect(() => {
    const content = contentRef.current
    if (!content || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (isAtBottomRef.current) scrollToBottom()
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [scrollToBottom])

  return { scrollRef, contentRef, isAtBottom, scrollToBottom }
}

/**
 * Scrollable conversation viewport. Owns stick-to-bottom auto-scroll (via
 * {@link useStickToBottom}) and exposes it through context so
 * {@link ConversationContent} can observe its size and
 * {@link ConversationScrollButton} can offer a manual jump back down.
 */
function Conversation({
  className,
  children,
  ...props
}: React.ComponentProps<'div'>) {
  const stick = useStickToBottom()

  return (
    <ConversationContext.Provider value={stick}>
      <div
        ref={stick.scrollRef}
        aria-live="polite"
        data-slot="conversation"
        className={cn('relative min-h-0 flex-1 overflow-auto', className)}
        {...props}
      >
        {children}
      </div>
    </ConversationContext.Provider>
  )
}

/** Inner spacing wrapper for a `Conversation`'s messages and status rows. */
function ConversationContent({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  const { contentRef } = useConversationContext('ConversationContent')
  return (
    <div
      ref={contentRef}
      data-slot="conversation-content"
      className={cn('space-y-4 p-2', className)}
      {...props}
    />
  )
}

export interface ConversationEmptyStateProps extends Omit<
  React.ComponentProps<'div'>,
  'title'
> {
  /** Optional icon rendered above the title (e.g. a lucide icon element). */
  icon?: React.ReactNode
  title?: React.ReactNode
  description?: React.ReactNode
}

/** Centered placeholder shown before any messages exist. */
function ConversationEmptyState({
  icon,
  title,
  description,
  className,
  children,
  ...props
}: ConversationEmptyStateProps) {
  return (
    <div
      data-slot="conversation-empty-state"
      className={cn(
        'flex flex-col items-center justify-center gap-2 py-8 text-center',
        className,
      )}
      {...props}
    >
      {icon && <div className="text-zinc-400 dark:text-zinc-500">{icon}</div>}
      {title && (
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
          {title}
        </p>
      )}
      {description && (
        <div className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
          {description}
        </div>
      )}
      {children}
    </div>
  )
}

/**
 * "Jump to latest" button. Renders only while the conversation is scrolled
 * up off the bottom ({@link useStickToBottom}'s `isAtBottom` is false).
 */
function ConversationScrollButton({
  className,
  ...props
}: React.ComponentProps<'button'>) {
  const { isAtBottom, scrollToBottom } = useConversationContext(
    'ConversationScrollButton',
  )

  if (isAtBottom) return null

  return (
    <button
      type="button"
      onClick={() => scrollToBottom()}
      data-slot="conversation-scroll-button"
      aria-label="Scroll to latest message"
      className={cn(
        'absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 shadow-sm hover:text-teal-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-teal-400',
        className,
      )}
      {...props}
    >
      <ArrowDownIcon className="h-3.5 w-3.5" />
      Latest
    </button>
  )
}

export {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
}
