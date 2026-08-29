/**
 * Real site routes that carry no embedded content (#82, Batch 6).
 *
 * @remarks The two citation scorers ask different questions, and the fixture
 * corpus only answers one of them.
 *
 * *"Did this answer cite a source for the fact it just stated?"* is a question
 * about the CORPUS: the answer has to point at a chunk's `sourceUrl`, or the
 * claim is unverifiable.
 *
 * *"Did this answer invent a page on this site?"* is a question about the
 * SITE — and the site is bigger than the corpus. Pages are deliberately not
 * embedded (#82 decision D8(b)) and the four flat collections have no per-doc
 * route, so `/about` and `/articles` are real, linkable, published pages with
 * no chunk behind them.
 *
 * Conflating the two is what made `cites-a-real-source-url` punish the exact
 * behaviour the persona prompt asks for. `CORVUS_SYSTEM_PROMPT` tells Corvus
 * to "point curious visitors toward his work"; an answer that cites
 * `/articles/from-neon-to-supabase` **and** links `/articles` scored 0,
 * because the scorer required every cited path to be a corpus `sourceUrl`.
 * The fix is not a looser scorer — it is a scorer that knows the difference
 * between a page it has no chunk for and a page that does not exist.
 *
 * Derived, not hand-listed: `HEADER_NAV_LINKS` is what the header and footer
 * actually render, so a nav change moves this set with it instead of leaving
 * the scorer asserting last quarter's routes.
 *
 * Deliberately absent: `/contact`. The persona prompt says to "point to the
 * contact form", but the form is a page-builder BLOCK
 * (`src/blocks/ContactForm/`) that can sit on any page — there is no
 * `/contact` route in `src/app/(frontend)/`. An answer that links `/contact`
 * really is citing a path that may not resolve, and the scorer should keep
 * saying so.
 */
import { HEADER_NAV_LINKS } from '../../src/lib/navigation'

/**
 * Site-relative paths that exist as routes but are not corpus source URLs.
 *
 * @remarks Lower-cased and de-duplicated to match how `citedPaths` normalizes.
 * Overlap with the corpus (`/projects`, `/tech`, `/uses`) is harmless — the
 * scorers union the two sets.
 */
export const SITE_CHROME_URLS: readonly string[] = [
  ...new Set(HEADER_NAV_LINKS.map((link) => link.href.toLowerCase())),
].sort()
