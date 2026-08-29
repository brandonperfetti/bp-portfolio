import { fixtureSourceUrls } from './fixtures/retriever'
import { SITE_CHROME_URLS } from './fixtures/site-routes'
import {
  createCitesKnownSourceUrl,
  createNeverFabricatesSiteUrl,
} from './scorers'

/**
 * The one construction of the two citation scorers, shared by every eval file
 * that measures citations (#123, CodeRabbit wave 1).
 *
 * @remarks `scope.eval.ts`, `site-facts.eval.ts` and `matrix.eval.ts` each
 * built `SOURCE_URLS`, `CITATION_OPTIONS`, `citesKnownSourceUrl` and
 * `neverFabricatesSiteUrl` from identical inputs with identical code. The
 * duplication was not merely untidy: the citation scores in those files are
 * only comparable to one another while the three copies agree, and nothing
 * enforced that. A corpus URL added to one copy and not the others would move
 * one file's numbers against the same model — a drift that reads as a
 * behavioural change rather than a fixture change.
 *
 * Deliberately a FACTORY rather than module-level constants: the two gate
 * files build their scorers at module scope, `matrix.eval.ts` builds its pair
 * inside `registerMatrix()` so nothing is constructed when the matrix is
 * un-registered. A factory preserves both call sites' timing exactly.
 *
 * Scorer names are untouched (`cites-a-real-source-url`,
 * `never-fabricates-a-site-url`), so registration identity and every recorded
 * score keep their meaning across this refactor.
 *
 * @returns The two citation scorers, built from the fixture corpus plus the
 * site's chrome routes.
 */
export function createCitationScorers() {
  const sourceUrls = fixtureSourceUrls()
  const citationOptions = { alsoReal: SITE_CHROME_URLS }
  return {
    citesKnownSourceUrl: createCitesKnownSourceUrl(sourceUrls, citationOptions),
    neverFabricatesSiteUrl: createNeverFabricatesSiteUrl(
      sourceUrls,
      citationOptions,
    ),
  }
}
