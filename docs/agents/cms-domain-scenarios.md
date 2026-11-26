# CMS Domain Agent scenario checks

Three changes the CMS Domain Agent (`docs/agents/cms-domain.md`) must catch.
Each is a short PR description with its diff, then the finding the agent must
give. Run them by hand, or under Claude Code with
`node scripts/cms-domain-scenarios.mjs [outDir]`, whenever the agent's brief,
its subagent definition or the CMS section of `GLOSSARY.md` changes. Record
each run (date, model, output) in the PR that changed the agent.

A check passes only when a reader has checked the agent's answer against the
finding below and recorded that verdict in the PR. The script cannot make that
call: an answer can name every term while recommending the defect. It checks a
floor. A run fails if it calls a tool other than Read, Grep or Glob, if it sees
this file, or if its answer misses one of the listed terms. A run that clears
the floor is reported `TERMS PRESENT`, never `PASS`.

**A scenario is never deleted to make a check pass.** If the agent misses one,
fix the brief, the subagent definition or the glossary, never the scenario.

## Scenario 1: a field added to Posts with no migration

> **feat(posts): add a reading-time field**
>
> Adds an optional `readingTime` number to Posts so the card can show it.
>
> ```diff
> --- a/src/collections/Posts/index.ts
> +++ b/src/collections/Posts/index.ts
> @@ fields: [
> +    {
> +      name: 'readingTime',
> +      type: 'number',
> +      admin: { position: 'sidebar' },
> +    },
> ```
>
> Files changed: `src/collections/Posts/index.ts`. No other files.

**Required finding:** the change adds a column to Posts but commits no
migration (`pnpm migrate:create`), so CI fails and the deploy's
`pnpm migrate` has nothing to apply. Posts has versions, so the migration also
covers the `_posts_v` table. `src/payload-types.ts` is not regenerated either.
The RLS line is not needed for a new column on an existing table, and the
agent says so or does not demand it.

Terms: `migration`, `migrate:create`, `_v`.

## Scenario 2: a seed script that expects every row

> **chore(seed): tag every existing post**
>
> ```ts
> // scripts/tag-all-posts.ts
> const { docs } = await payload.find({
>   collection: 'posts',
>   limit: 100,
>   pagination: false,
> })
> for (const post of docs) {
>   await payload.update({ collection: 'posts', id: post.id, data: { tags } })
> }
> console.log(`tagged all ${docs.length} posts`)
> ```

**Required finding:** `limit: 100` still caps the result with
`pagination: false`, so past 100 posts the script silently skips the rest and
the log line is wrong. Unlimited is `limit: 0`, or `pagination: false` with no
`limit` (`docs/PAYLOAD.md` § Local API gotchas).

Terms: `limit: 0`, `pagination: false`, `cap`.

## Scenario 3: a hook revalidating with `'max'`

> **fix(projects): purge the projects cache on change**
>
> ```ts
> // src/collections/Projects.ts
> import { revalidateTag } from 'next/cache'
> const revalidateProjects: CollectionAfterChangeHook = ({ doc }) => {
>   revalidateTag(CMS_TAGS.projects, 'max')
>   return doc
> }
> ```

**Required finding:** `revalidateTag(tag, 'max')` is the stale-while-revalidate
profile, so readers keep getting the old content after an edit. The repo's
rule is `revalidateTag(tag, { expire: 0 })` (#118, `docs/ARCHITECTURE.md`
§ Caching & revalidation).

Terms: `expire: 0`, `#118`.
