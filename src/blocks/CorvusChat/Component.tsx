import {
  CORVUS_CHAT_BLOCK_HEADING_LEVEL,
  CORVUS_CHAT_BLOCK_SURFACE_CLASS,
  corvusChatVariantHeightClass,
} from '@/blocks/CorvusChat/variants'
import { type BlockHostContext, blockRhythmClass } from '@/blocks/hostContext'
import CorvusChat from '@/components/CorvusChat'
import { cn } from '@/lib/utils'
import type { CorvusChatBlock } from '@/payload-types'

/**
 * Corvus chat section (CMS page builder) — #217 phase 1.
 *
 * @param props - The stored block (`variant` / `heading` / `starterPrompt`),
 * plus `hosted`: where the block is rendering (see {@link BlockHostContext}).
 *
 * @remarks Three decisions live here, and each is argued in `variants.ts`
 * rather than in this file so the reasoning sits next to the value it
 * justifies:
 *
 * - **The wrapper owns the height.** `CorvusChat` keeps `h-full` and states no
 *   height of its own, so `/corvus` renders byte-identically; this section
 *   supplies the bounded frame the component needs anywhere else
 *   (`corvusChatVariantHeightClass`). That is what gives
 *   `[data-slot='conversation']` a region to scroll inside, and it is why the
 *   block's own `offsetHeight` does not move when the conversation grows.
 * - **`headingLevel` is `h2`, in both host contexts**
 *   ({@link CORVUS_CHAT_BLOCK_HEADING_LEVEL}) — a page hosting this block keeps
 *   exactly one `<h1>`, and `h2` is the only level that can never be a skip.
 * - **The block releases the page-wide `/` shortcut** (`globalShortcut={false}`).
 *   An editor can drop this block on any page, and the listener `CorvusChat`
 *   registers for `/corvus` is on `window`: on `/articles` it would hijack the
 *   `/` that `ArticlesExplorer` already owns for its filter field, and two
 *   block instances on one page would fight over focus. `/corvus` passes
 *   nothing and keeps the shortcut.
 * - **The block carries `.corvus-surface` itself**
 *   ({@link CORVUS_CHAT_BLOCK_SURFACE_CLASS}) — Corvus looks like Corvus
 *   wherever an editor drops it, instead of inheriting a skin no page-builder
 *   ancestor ever applies.
 *
 * `hosted` is read only for the outer rhythm — the root margin every block
 * ships, and nothing inside a column, where the stack owns the spacing. The
 * literal lives in `blockRhythmClass` and nowhere else, which
 * `hostContext.test.ts` audits by reading these files. The block takes no
 * width cap:
 * unlike the zero-config *form* cards, a chat is not a stack of labelled
 * inputs, and a capped card inside a column strands the rest of the band
 * (#188's argument, applied to the one block that is neither form nor prose).
 */
export function CorvusChatBlockComponent({
  variant,
  heading,
  starterPrompt,
  hosted,
}: Partial<CorvusChatBlock> & { hosted?: BlockHostContext }) {
  const headingText = heading?.trim() || undefined
  const starter = starterPrompt?.trim() || undefined

  return (
    <section
      data-slot="corvus-chat-block"
      data-variant={variant ?? undefined}
      className={cn(
        blockRhythmClass(hosted),
        CORVUS_CHAT_BLOCK_SURFACE_CLASS,
        corvusChatVariantHeightClass(variant),
      )}
    >
      <CorvusChat
        title={headingText}
        headingLevel={CORVUS_CHAT_BLOCK_HEADING_LEVEL}
        starterPrompt={starter}
        globalShortcut={false}
      />
    </section>
  )
}
