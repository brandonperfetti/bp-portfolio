import { RenderBlocks } from '@/blocks/RenderBlocks'
import { Container } from '@/components/Container'
import { RenderHero } from '@/heros/RenderHero'
import { routeRhythmProfile } from '@/heros/routeRhythm'
import type { Page } from '@/payload-types'

/**
 * Shared page-builder body: a page's hero and layout blocks, wrapped in the one
 * `<Container>` that owns the full-bleed hero's stacking context and spaced by
 * the page's route rhythm.
 *
 * @param page - The page document to render (hero group + `layout` blocks).
 *
 * @remarks Both the dedicated `/` home route and the `[slug]` catch-all render
 * through here, so the two paths cannot drift: the same document renders
 * pixel-identically at `/` and at `/[slug]`. This is the single seam the home
 * flip (#42) leans on — `page.test.tsx` and `[slug]/page.test.tsx` both assert
 * against it.
 *
 * The rhythm is data, not a branch: {@link routeRhythmProfile} resolves the
 * stored `hero.rhythm` to its class knobs.
 *
 * - `standard` (every page written before the field existed) renders the hero
 *   *bare* — no wrapper element — under the Container's `mt-16 sm:mt-32`, with
 *   the blocks under `mt-8`. Byte-identical to the DOM the `[slug]` route
 *   emitted before the shared seam existed.
 * - `homeParity` wraps the hero in live Home's `pt-9 pb-16 sm:pb-20`, drops the
 *   Container top margin, and butts the blocks straight against the hero.
 *
 * Both keep {@link HERO_FULL_BLEED_ROUTE_ISOLATION_CLASS} on the Container —
 * the one element wrapping hero *and* blocks — so a full-bleed shader canvas at
 * `-z-10` sinks below the blocks yet above the fixed page panel
 * (`src/heros/presentation.ts`).
 */
export function RenderRhythmPage({ page }: { page: Page }) {
  const profile = routeRhythmProfile(page.hero?.rhythm)
  return (
    <Container className={profile.containerClass}>
      {profile.heroWrapperClass === null ? (
        <RenderHero page={page} />
      ) : (
        <div className={profile.heroWrapperClass}>
          <RenderHero page={page} />
        </div>
      )}
      <div className={profile.blocksWrapperClass}>
        <RenderBlocks blocks={page.layout} />
      </div>
    </Container>
  )
}
