import { type BlockHostContext, blockRhythmClass } from '@/blocks/hostContext'
import { RichTextContent } from '@/components/cms/RichTextContent'
import { ShaderHero } from '@/components/heros/ShaderHero'
import {
  DEFAULT_SHADER_PRESET,
  type ShaderPresetKey,
} from '@/components/heros/presets'
import {
  HERO_CARD_FRAME_CLASS,
  HERO_CARD_PANEL_CLASS,
  HERO_CARD_SHELL_CLASS,
} from '@/heros/presentation'
import { cn } from '@/lib/utils'
import type { ShaderHeroBlock as ShaderHeroBlockProps } from '@/payload-types'

/**
 * Overlay box the hero's `card` presentation puts its text in — the same
 * string `HeroView` uses, kept here because `src/heros/**` does not export it
 * and this block must not fork the geometry.
 *
 * @remarks `Component.test.tsx` reads it back out of `src/heros/HeroView.tsx`
 * and fails if the two drift, the way `hostContext.test.ts` re-derives the
 * column rhythm from the homepage.
 */
export const SHADER_HERO_BLOCK_CONTENT_CLASS =
  'relative z-10 flex min-h-[20rem] items-center p-8 sm:p-12'

/**
 * Standalone shader section (CMS page builder).
 *
 * @remarks **Legacy as of #39.** This block no longer implements a shader
 * panel: it renders the hero system's `card` presentation
 * ({@link HERO_CARD_SHELL_CLASS} + the shared `ShaderHero`), so there is one
 * canvas codepath on the site instead of two and a future shader change
 * happens once. The block stays registered because published pages use it;
 * new pages should set the page hero to `shader` + `card` instead, which is
 * what the config's labels now say.
 *
 * Everything the card treatment gained in #31 arrives here by reuse: the
 * offscreen `IntersectionObserver` GPU pause, the light-mode preset swap, and
 * the fade-in over the static gradient. The gradient fallback, the
 * `min-h-[20rem]` rounded panel, the overlaid rich text and its text shadow
 * are unchanged — see the parity story.
 *
 * No longer a client component: the wrapper has no state of its own now that
 * `ShaderHero` owns the reduced-motion and WebGPU checks, so the rich text
 * renders on the server and only the canvas ships JS.
 *
 * @param props - The stored block, plus `hosted`: where it is rendering. The
 * block is root-only (columns exclude it — see `Column/config.ts`), so this
 * is the same `my-12` it has always emitted; taking the prop keeps the rhythm
 * in one place rather than hard-coded here.
 */
export function ShaderHeroBlockComponent(
  props: ShaderHeroBlockProps & { hosted?: BlockHostContext },
) {
  return (
    <section
      className={cn(HERO_CARD_SHELL_CLASS, blockRhythmClass(props.hosted))}
    >
      <ShaderHero
        preset={(props.preset ?? DEFAULT_SHADER_PRESET) as ShaderPresetKey}
        className={HERO_CARD_FRAME_CLASS}
        panelClassName={HERO_CARD_PANEL_CLASS}
        scrim={false}
        bottomFade={false}
      />
      {props.richText ? (
        <div className={SHADER_HERO_BLOCK_CONTENT_CLASS}>
          <RichTextContent
            content={props.richText}
            className="max-w-xl [text-shadow:0_1px_8px_rgba(0,0,0,0.25)]"
          />
        </div>
      ) : null}
    </section>
  )
}
