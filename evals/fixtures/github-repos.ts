/**
 * GitHub repository fixtures for the Corvus repo-grounding evals (#147).
 *
 * ## PROVENANCE — read this before treating any value below as a site fact
 *
 * These are **NOT captured from api.github.com.** The lane that wrote #147 had
 * no egress to that host (the environment's proxy denies it), so no live
 * response was recorded, and pretending otherwise would be the same class of
 * mistake `site-content.ts` avoids by labelling its capture date and endpoints.
 *
 * What they ARE is reconstructed, field for field, into the documented shape of
 * the GitHub REST responses, from two sources that were actually read:
 *
 * 1. **`bp-portfolio`** — this repository. Its stack values come from the tree
 *    the fixture was written in: `CLAUDE.md`'s "Runtime baseline" section
 *    (Next.js 16 App Router, React 19, Payload 3.x, Tailwind v4, Node 22+),
 *    `docs/MAINTENANCE.md` (Supabase Postgres), and `docs/AUTH.md`'s subject
 *    (Clerk). Every one of those is a fact about this codebase, verifiable by
 *    reading it.
 * 2. **`macos-portfolio`** — the captured `/api/projects` record in
 *    `site-content.ts` (id 13), whose `description` names React, TypeScript,
 *    GSAP, Zustand and Tailwind CSS, and whose `link` is the live site. That
 *    record WAS captured, on 2026-08-28, from the public REST API.
 *
 * The `id`, `pushed_at` and `languages` byte counts are fixture-local
 * inventions: nothing asserts them as site facts, and they exist only so the
 * chunker and the sweep have realistic shapes to work on.
 *
 * ## Why the site-stack pair needs BOTH corpora
 *
 * #147's sharpest eval case is a disambiguation: "what does this site run on"
 * must be answered from the `bp-portfolio` repository document, and "what
 * technologies does Brandon use" from `/tech` — and neither question tests
 * anything unless the retriever holds both corpora at once, so the model has a
 * real choice to get wrong. That is what `createFixtureRetriever({ repos })`
 * assembles, and it is why the `bp-portfolio` README below deliberately names
 * technologies that are NOT on `/tech` (Payload, Clerk, Vercel) alongside one
 * that is (PostgreSQL). A fixture where the two lists did not overlap would
 * make the disambiguation trivially easy and measure nothing.
 *
 * @module
 */
import type { GithubRepoSource } from '../../src/lib/ai/githubRepos'

/** ISO date these fixtures were written; they are reconstructions, not a capture. */
export const REPO_FIXTURES_WRITTEN_AT = '2026-09-02'

/**
 * This site's own repository — the document that answers "what does this site
 * run on".
 *
 * @remarks Every technology named in the README below is one this repository
 * actually uses, per the docs cited in the module header. The README is a
 * condensation, not a copy: the real one is long, and a fixture that tried to
 * mirror it would rot the moment it was edited while adding nothing the eval
 * cases ask about.
 */
const BP_PORTFOLIO: GithubRepoSource = {
  id: 1001,
  name: 'bp-portfolio',
  fullName: 'brandonperfetti/bp-portfolio',
  isPrivate: false,
  isFork: false,
  isArchived: false,
  description:
    'Source code for brandonperfetti.com — the portfolio site and its content platform.',
  homepage: 'https://brandonperfetti.com',
  topics: ['nextjs', 'payload-cms', 'typescript', 'portfolio'],
  language: 'TypeScript',
  languages: { TypeScript: 1_240_000, CSS: 41_000, JavaScript: 9_400 },
  pushedAt: '2026-09-01T18:04:00.000Z',
  createdAt: '2025-01-04T09:12:00.000Z',
  readme: [
    '# bp-portfolio',
    '',
    'The code behind brandonperfetti.com.',
    '',
    '## What this site runs on',
    '',
    'This site is built with Next.js 16 on the App Router, with Payload CMS as',
    'the single content source. Content is stored in Supabase Postgres and read',
    'through Payload. Authentication and gating use Clerk. Styling is Tailwind',
    'CSS v4 with shadcn/ui primitives. The site is deployed on Vercel and runs',
    'on Node 22. Corvus, the AI assistant, uses the Vercel AI SDK with a',
    'pgvector retrieval index.',
    '',
    '## Development',
    '',
    'pnpm is the only supported package manager. Tests run under Vitest,',
    'Storybook and Playwright.',
  ].join('\n'),
}

/**
 * The macOS-inspired portfolio — the "known repo" case's target.
 *
 * @remarks Chosen because #147's measured baseline names it: "What does the
 * macOS Portfolio project use?" scores 50% on both variants, answering with a
 * stack and citing no source. The repo document is what gives that answer
 * something to cite.
 */
const MACOS_PORTFOLIO: GithubRepoSource = {
  id: 1002,
  name: 'macos-portfolio',
  fullName: 'brandonperfetti/macos-portfolio',
  isPrivate: false,
  isFork: false,
  isArchived: false,
  description:
    'Interactive macOS-inspired portfolio experience built with React, TypeScript, GSAP, Zustand, and Tailwind CSS.',
  homepage: 'https://macos.brandonperfetti.com/',
  topics: ['react', 'gsap', 'zustand', 'portfolio'],
  language: 'TypeScript',
  languages: { TypeScript: 310_000, CSS: 22_000 },
  pushedAt: '2026-04-18T15:31:00.000Z',
  createdAt: '2024-06-02T11:00:00.000Z',
  readme: [
    '# macos-portfolio',
    '',
    'A macOS-inspired portfolio experience: draggable windows, a dock, and a',
    'desktop that behaves the way the real one does.',
    '',
    '## Built with',
    '',
    'React and TypeScript for the interface, GSAP for the window and dock',
    'animations, Zustand for window state, and Tailwind CSS for styling. Built',
    'with Vite.',
  ].join('\n'),
}

/** A third repo, so the corpus is not two documents wide. */
const TOP_TIMELINES: GithubRepoSource = {
  id: 1003,
  name: 'top-timelines',
  fullName: 'brandonperfetti/top-timelines',
  isPrivate: false,
  isFork: false,
  isArchived: false,
  description: 'Event timelines made simple for teams and organizations.',
  homepage: 'https://toptimelines.com/',
  topics: ['timelines', 'saas'],
  language: 'TypeScript',
  languages: { TypeScript: 180_000 },
  pushedAt: '2026-02-09T08:20:00.000Z',
  createdAt: '2023-11-14T16:45:00.000Z',
  readme: [
    '# top-timelines',
    '',
    'Event timelines made simple for teams and organizations. Build a timeline,',
    'share it, and let a team keep it current.',
  ].join('\n'),
}

/** The repository corpus the repo-grounded eval blocks retrieve from. */
export const GITHUB_REPO_FIXTURES: GithubRepoSource[] = [
  BP_PORTFOLIO,
  MACOS_PORTFOLIO,
  TOP_TIMELINES,
]

/**
 * Every GitHub URL the fixture repos can legitimately be cited by.
 *
 * @remarks Derived from the fixtures rather than hand-listed, exactly as
 * `fixtureSourceUrls` is derived from the chunks, so a fixture edit cannot
 * leave a scorer asserting a repo that is no longer in the corpus.
 *
 * @param repos - Repository fixtures; defaults to the whole set.
 * @returns The distinct repo URLs, sorted.
 */
export function fixtureRepoUrls(
  repos: GithubRepoSource[] = GITHUB_REPO_FIXTURES,
): string[] {
  return [
    ...new Set(repos.map((repo) => `https://github.com/${repo.fullName}`)),
  ].sort()
}
