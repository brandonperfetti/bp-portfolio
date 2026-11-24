---
status: active
owner: Brandon Perfetti
last_reviewed: 2026-11-24
---

# Release runbook (tag and GitHub Release)

The steps after Brandon merges a release PR: tag the merge commit, push the
tag, and publish the GitHub Release. `docs/WORKFLOW.md` § Releases stays the
rule for the release PR, the changelog section and the version; this file
adds the commands and the checks around the tag and the Release. It
implements the shared procedure,
[`post-merge-release.md`](https://github.com/brandonperfetti/agent-working-agreements/blob/v2026.11.24/procedures/post-merge-release.md)
(agent-working-agreements v2026.11.24), with BP's own commands and checks.

> **Authority.** `AGENTS.md` § Release authority holds the standing grant
> (approved by Brandon 2026-11-24, #432); it takes effect when the PR that
> records it merges into `develop`. This file is the procedure it covers.
> Outside that grant, an agent acts on a tag only on Brandon's explicit word
> for that tag; that word covers the Release only if it says so, and a word
> given for one release does not cover the next. Brandon alone merges the release
> PR, and no step here merges, pushes `master` or `develop`, or commits to a
> branch; the only branch write is the fast-forward-only local `master`. Releases for tags that predate the grant, and `v2026.11.23`, are
> outside it.

## Verify the merge

Steps 1 to 5 change nothing but fetched refs. Stop and report on the first failed check; never
repair it by moving a tag or pushing a branch.

1. **The merge is Brandon's and is done.** The release PR is `MERGED` by
   `brandonperfetti` (`mergedBy.login`; a merge by anyone else, a bot
   included, is outside the grant), base `master`, head `develop`, and its
   `mergeCommit.oid` is the commit you will tag. Read it from the PR, never from `git log` alone. The PR's head commit
   is the accepted head: the merge commit's second parent equals it.
2. **The commit is on `master`.** After `git fetch origin master --tags`,
   the merge commit is on the first-parent line of `origin/master`
   (`git rev-list --first-parent origin/master`), has two parents, and its
   subject is `Merge pull request #<n> from brandonperfetti/develop`. If
   `origin/master` is anywhere but this merge commit (a later release or
   commit landed), stop and report to Brandon; do not tag an earlier merge on
   your own.
3. **The version is the Pacific date of the merge.** Convert the PR's
   `mergedAt` to `America/Los_Angeles`; the version is `vYYYY.MM.DD`. Read the
   tags first (`git ls-remote --tags origin 'vYYYY.MM.DD*'`, and the local
   tags):
   - none: use `vYYYY.MM.DD`;
   - one that peels to this same commit: a repeat run. Inspect it (§ Tag).
     If the remote has the same tag object, create and push nothing, still
     pass steps 4 and 5, and resume at § Publish the Release. If it exists only locally, use it only with
     provenance from this release attempt, then push it (§ Push only that
     tag); otherwise report it;
   - one on another commit, from an earlier release the same day: take the
     next suffix, `.1`, then `.2`. A conflict is not a reason for a suffix: a
     tag you cannot explain, or one that names this commit with a different
     annotation, goes to Brandon. A pushed tag is never moved or deleted.
4. **The changelog section.** `CHANGELOG.md` at the merge commit has a
   `## <version>` heading that matches step 3 and links the release PR. If the
   merge slipped past midnight Pacific the heading is wrong and Brandon is
   told; do not fix it from here.
5. **Review and checks, each recorded in the hand-back.**
   - the release PR's head has `Lint · Types · Unit`, `Build · E2E` and
     `Evalite (Corvus)` all `success`;
   - the review is accepted at that head (`docs/WORKFLOW.md` § Review;
     CodeRabbit `success`, or the recorded stand-in when its limit was hit);
   - the PR body's "After the merge" list: say which checks ran and which
     remain Brandon's. A Release never claims a check nobody ran.
6. **Only then, fast-forward local `master`.** This is the one local write in this section, made after steps 1 to 5
   pass. From a clean checkout on `master` that is
   not another session's, run `git merge --ff-only origin/master` as its own
   call. Stop if it fails. Confirm `HEAD` and `origin/master` both equal the
   merge commit. Never commit to local `master`.

## Tag

```sh
# message file: one line, then the agent line
#   Release YYYY-MM-DD — <what it ships>
#
#   Agent: <client> · <model id> · <effort>
git tag -a vYYYY.MM.DD <merge commit sha> -F <message file>
git cat-file -p refs/tags/vYYYY.MM.DD   # target, type, name, tagger, message
git rev-parse refs/tags/vYYYY.MM.DD refs/tags/vYYYY.MM.DD^{commit}
```

`git config user.email` is `brandon@brandonperfetti.com` before the tag, not
after (RULE ZERO). `v2026.11.17` is the model for the message. An existing
tag, local or remote, must be annotated, point at the verified merge, carry
Brandon's tagger email and the expected name and message. An unpushed local
tag with no provenance from this attempt is not used; report it.

## Push only that tag

Right before pushing: the live `master` tip still matches, the tag state is
unchanged, and `git remote get-url --push --all origin` returns exactly the
fetch URL for `brandonperfetti/bp-portfolio`. Then, as its own standalone call
(the Git guard reads a tag push word for word):

```sh
git push --no-follow-tags origin refs/tags/vYYYY.MM.DD:refs/tags/vYYYY.MM.DD
```

Never `--tags`, never a branch in the same push, never `--force`. The
pre-push hook skips the gate only when every pushed ref is a tag or a
deletion (`scripts/pre-push-hook.test.ts`), and prints `pre-push: this push
only deletes refs or pushes tags, so the gate is skipped.`

After any push result, including an error, read
`git ls-remote origin refs/tags/vYYYY.MM.DD refs/tags/vYYYY.MM.DD^{}` and
compare both IDs with the receipt. A match continues without another push. A
missing, different or unreadable result goes to Brandon before any retry.

## Publish the Release

1. **The Production deployment first.** Read the deployments for the merge
   commit (`gh api 'repos/brandonperfetti/bp-portfolio/deployments?sha=<merge commit>'`
   and its statuses). Publish only when the `Production` deployment is
   `success`. Pending: wait, and the Release stays unpublished. Failed or
   unreadable: stop and report to Brandon with the run.
2. Read the Releases for the exact tag first, drafts included
   (`gh api repos/brandonperfetti/bp-portfolio/releases --paginate`), and
   confirm absence from a successful read. A matching published Release
   completes this step. An unexpected draft, a conflicting record or an
   unreadable result stops the write.
3. Prepare the notes: the version's `CHANGELOG.md` section at the merge
   commit, without its heading and without the `[tag](…)` link line, which
   points at the page being created. Never `--generate-notes`, and no summary
   of your own. The title is `<tag> — <short summary>`, as for `v2026.11.24`.
4. Recheck the remote tag object and peeled commit against the receipt, then:

   ```sh
   gh release create vYYYY.MM.DD --repo brandonperfetti/bp-portfolio \
     --verify-tag --title "<title>" --notes-file <section file>
   ```

   Stable, with the default source archives and no uploaded assets. Add
   `--latest=false` for anything but the newest version. After an unclear
   result, read the Release and the tag before any other write.

## Read it back, then close

Read the remote, not the local state, and put the output in the hand-back:

- `git ls-remote --tags origin vYYYY.MM.DD vYYYY.MM.DD^{}`: annotated, and
  peels to the merge commit;
- `gh release view vYYYY.MM.DD --repo brandonperfetti/bp-portfolio --json tagName,name,isDraft,isPrerelease,url,body,assets`:
  the tag, title and body match, not a draft, not a prerelease, no assets;
- the `Production` deployment for the merge commit is still `success`. A
  later failure keeps the tag and Release as they are and goes to Brandon
  with the run.

BP has no back-merge workflow; `develop` is the release PR's head and stays
as it is.

## The no-tag-trigger assumption

The tag-only pre-push skip in `docs/WORKFLOW.md` § Local hooks rests on three
facts: no workflow runs on a tag, nothing deploys from one, and a release tag
names a commit already on `master`. Creating a GitHub Release fires the
`release` event. **No workflow listens for `tag` pushes or `release` events
today** (every `on:` in `.github/workflows` is a `push` to branches, a
`pull_request`, an `issues` event, a schedule or a manual dispatch), and
Vercel builds production from `master`. The publish step is therefore an
explicit command in this runbook, not an automation. If a workflow is ever
added that runs on `push: tags`, on `release`, or that deploys from a tag,
requalify the pre-push skip and the deploy behaviour before it merges.

## Historical Releases

Publishing against an earlier tag needs a grant that explicitly covers
historical Releases, or Brandon's explicit decision for that backfill. Audit
first and record each tag's eligibility: the tag is annotated, peels to its
release PR's merge commit on `master`, the version matches the Pacific merge
date, and a changelog section exists. Also record, for each, the evidence
§ Verify the merge asks of a new release: `mergedBy.login`, the PR head's
checks and accepted review, and a `success` `Production` deployment for the
exact merge commit (§ Publish the Release). Use the existing tags, and never
create history before `v2026.11.17`, the first tag and the start of the
changelog. The notes come from the changelog section at the release's merge
commit; `v2026.11.17` is the exception, since `CHANGELOG.md` was added after
that tag, so its notes are the section as first added (`0ab881f7`), and the
hand-back says so.

## What this does not cover

- Merging the release PR, or any `develop` or `master` change: Brandon's.
- Moving, deleting or re-pushing a tag, or editing a published Release.
  Report it to Brandon.
- Rollback: Brandon's decision.
