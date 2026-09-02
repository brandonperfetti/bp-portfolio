import { fixtureRepoUrls } from './fixtures/github-repos'
import { fixtureSourceUrls } from './fixtures/retriever'
import { SITE_CHROME_URLS } from './fixtures/site-routes'
import {
  createCitesKnownSourceUrl,
  createCitesRepoNotTechList,
  createCitesRepoSourceUrl,
  createCitesSiteSourceNotVendor,
  createCitesTechListNotRepo,
  createNeverFabricatesRepoUrl,
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
 * Wave 4 adds a THIRD scorer to the same factory, and adds only that: the two
 * originals keep their names, their construction and their inputs, so every
 * block that already ran keeps measuring exactly what it measured. The new one
 * (`cites-the-site-page-not-a-vendor-url`) is used by one new block and by
 * nothing that existed before — see `evals/scorers.ts` for why it needs to be
 * its own signal rather than a stricter `cites-a-real-source-url`.
 *
 * Wave 5 adds four MORE to the same factory (#147), and again adds only that.
 * The three originals keep their names, their construction and their inputs —
 * in particular `fixtureSourceUrls()` is still called with no argument, so it
 * still derives from the SITE corpus alone and every block that already ran
 * keeps measuring exactly what it measured. The four new ones are built from
 * the repository corpus, are used by four new blocks, and are used by nothing
 * that existed before. See `evals/scorers.ts` for why a repository citation
 * needs its own reader rather than a widened `citedPaths`.
 *
 * @returns The seven citation scorers, built from the fixture corpus, the
 * repository corpus, and the site's chrome routes.
 */
export function createCitationScorers() {
  const sourceUrls = fixtureSourceUrls()
  const repoUrls = fixtureRepoUrls()
  const citationOptions = { alsoReal: SITE_CHROME_URLS }
  return {
    citesKnownSourceUrl: createCitesKnownSourceUrl(sourceUrls, citationOptions),
    neverFabricatesSiteUrl: createNeverFabricatesSiteUrl(
      sourceUrls,
      citationOptions,
    ),
    citesSiteSourceNotVendor: createCitesSiteSourceNotVendor(sourceUrls),
    citesRepoSourceUrl: createCitesRepoSourceUrl(repoUrls),
    neverFabricatesRepoUrl: createNeverFabricatesRepoUrl(repoUrls),
    citesRepoNotTechList: createCitesRepoNotTechList(repoUrls),
    citesTechListNotRepo: createCitesTechListNotRepo(repoUrls),
  }
}
