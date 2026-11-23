---
status: draft
owner: Brandon Perfetti
last_reviewed: 2026-11-22
---

# Content imagery (article covers)

This is brandonperfetti.com's image direction: what a cover looks like, how
an agent writes one, which generator makes it, and how it reaches a post.
Read it before you make or replace a cover. The `cover-recipes` skill reads
this file. Voice and article craft live in `docs/CONTENT_STYLE.md`; the
article run lives in `docs/CONTENT_WORKFLOW.md`.

Every live cover is a heightened-real photograph from a logged recipe, in
the `cover-mj-A` series (53 covers, 2026-09-26/27). The code-rendered SVG
system that came before it is archived in
[`archive/code-rendered-covers/`](../archive/code-rendered-covers/HISTORY.md).
Do not use it.

Sources: the receipts and decisions on
[#415](https://github.com/brandonperfetti/bp-portfolio/issues/415) (the
direction grill D1–D29, `recipes-v1.json`, `recipes-v2-missing12.md`, the
§9 proposal, the rollout receipts) and the generator tests and v2 run log on
brandonperfetti/claude-skills#492 (private; summarized here, not copied).

## 1. Status

The front matter holds `status`, `owner` and `last_reviewed`. Only the owner
sets `status: approved`.

- **While `status: draft`:** generate nothing. A draft is a proposal for
  Brandon to read, not a direction to work from.
- **Once `approved`:** follow §2–§13. Re-read this file when
  `last_reviewed` changes.

## 2. Concept rule

**One impossible detail on a plausible scene.** A cover looks photographed.
Exactly one thing in it breaks a material or physical law, and that one
thing carries the article's idea. The benchmark is post 21's console:
solid stone ripples like water, in plain daylight.

- **Heightened realism, mid-key tone.** Mid-key is the only constant: no
  large pure-black or pure-white areas. Teal is optional, never forced (D17).
- **The detail is solid and physical,** with correct shadows, reflections
  and grain. It blends into the scene's light (D18). Never stack effects
  (D19).
- **One simple impossibility, readable at thumbnail size.** No machines
  with many moving parts: the generator fills in how they work, and the
  result looks artificial (v2).
- **Meaning mode follows the topic** (D4, D12):
  - an uncanny real object for tangible topics (tools, hardware, concrete
    tech);
  - a visual metaphor for techniques and comparisons;
  - mood for mindset, process and heady essays, the only place abstraction
    is allowed.
- **Metaphor family is a dial** (v2): scale, causality (time, shadow, cause
  and effect), material (one thing half-becoming another), gravity
  (suspension, flowing through air), nature (living things behaving
  impossibly), weather.
- **The line to hold:** "the fine line is between subtly uncanny and
  AI-generated slop" (Brandon, 2026-09-26).

**The recipe.** Per article, the agent sets each dial with a one-line
reason and logs it (D6). Brandon may override any dial before the cover is
made. The dials are scene (§5), era (§3), framing (§5), meaning mode,
metaphor family, people (§6), the impossible detail stated physically, and
hue (§4).

**Prompt template** (v1, locked 2026-09-26; §10 has each generator's form):

    [Scene] of [hero subject, large in frame], [the one impossible detail,
    stated physically], [optional people clause]. [Era design language],
    [film look], [era palette] with a hint of [topic hue], heightened
    realism, [bright | mid-key] [light].

## 3. Styles / eras

The era sets the design language, the film look and the palette. Use these
phrases as written; they are the ones the live covers were made with.

| Era key      | Design language                                  | Film look                | Palette                                                                                  |
| ------------ | ------------------------------------------------ | ------------------------ | ---------------------------------------------------------------------------------------- |
| `60s`        | 1960s space-age design, mid-century modern forms | Kodachrome film look     | cream, tangerine and avocado                                                             |
| `70s-cool`   | 1970s brutalist sci-fi production design         | grainy 35mm film         | concrete grey, deep teal and sodium-vapor amber; favour night, blue hour and storm light |
| `80s-pastel` | 1980s pastel Memphis-era design                  | soft VHS-era film look   | peach, lavender and turquoise                                                            |
| `80s-neon`   | 1980s synthwave, neon reflections                | VHS-era film softness    | magenta and cyan                                                                         |
| `nf`         | near-future minimalism                           | clean digital photograph | pale neutral                                                                             |

- **The 70s is the cool recast (v2).** The v1 warm 70s (burnt orange and
  brown) graded into the same warm brown as the 60s, so four eras read as
  three. Use `70s-cool` for new covers; `70s` in the history is the v1 warm
  version.
- **Dark, moody eras are welcome when they are the vibe** (D18), within the
  light-card constraint (§8). Add "bright" or "mid-key" to the light clause
  for night and storm scenes.

## 4. Topic → color map

The topic picks one accent hue. It enters the prompt as "with a hint of
{hue}" in the palette, and as a glow only where the scene has a real light
source for it (§5).

| Hue     | Topic family                                  |
| ------- | --------------------------------------------- |
| emerald | databases and infrastructure                  |
| violet  | AI and agents                                 |
| sky     | React, Next.js and frontend architecture      |
| cyan    | CSS and design systems                        |
| fuchsia | JavaScript and TypeScript language topics     |
| amber   | Node.js, APIs and messaging                   |
| rose    | CMS and content engineering                   |
| indigo  | engineering practice and architecture choices |

A new topic family claims a new hue here before its first cover. One hue per
cover.

## 5. Composition and framing

- **Scenes:** interior, landscape, macro close-up, architecture/city,
  machine/hardware, aerial/top-down, tabletop still life (D10, D14), plus
  water, weather and night exterior (v2). Favour exteriors; the v1 set
  skewed toward interiors and tabletops.
- **Framing follows the idea** (D22). An action (sorting, moving, syncing,
  filtering) gets mid-distance framing that shows the mechanism and both
  outcomes. Extreme macro is only for texture or material ideas; it erased
  the sorting idea on post 20 twice.
- **The hero is large in frame.** State the impossible detail early and
  concretely in the prompt.
- **Props:** at most three besides the hero. At most one floating object,
  and it casts a shadow (D20).
- **Glow comes from a physical source** (D23): a status LED, a gauge, a lit
  window. It lights the surfaces near it and is never a free-floating aura.
- **Screens** may show abstract UI shapes (bars, waveforms, grids), never
  letters or numbers (D13).
- **Leave empty space.** Quiet frames with room around the subject read
  better at card size than busy ones. Titles sit beside or below the image,
  not over it.
- **"A field of identical units with one that differs" is capped** (§9).

## 6. People

D21, kept in v2, with the round-6 age-cue addendum:

- Adults only, each with an age cue: "a woman in her forties", "a
  middle-aged man". Never write "small figure" or "small visitor"; both
  rendered as children.
- Two or three people at most, in varied everyday clothing, with individual
  poses. No identical crowds or matching lines of figures unless dystopia is
  the article's point. "Movers in 1970s overalls" rendered as drone workers.
- Faces turned away, seen from behind, or too far away to read.
- When people are the subject, frame at mid-distance. Large-in-foreground
  people read as a lifestyle shoot.
- People mode is a dial: none, a distant adult, subjects, or traces.

## 7. Exclusions

Always excluded: **text, letters, numbers, logos, borders, signage,
children, smoke, particles.** Add per recipe as needed: `people`, `crowd`,
`uniforms`, `graffiti`, or the specific object that keeps intruding (the
v2 tea pour excluded `teapot` and `hands`).

Never ask for the slop tropes (D20): smoke, mist, wisps, sparkles,
floating particles, bokeh fields, swarms of flying objects. Stacked
effects read as AI-generated; post 55's first tabletop (smoke-like drift,
flying pages and extra props together) is the example.

## 8. Display constraints

- **16:9.** Generation requests 2048×1152; what a generator returns can
  be smaller (GPT Image's native output is 1672×941 today, §10). The
  ingest derivation (§11) delivers 2048×1152. The article hero is an
  `aspect-[16/9] object-cover` frame (`src/components/ArticleLayout.tsx`),
  and so is the `/articles` card (`src/components/articles/ArticlesExplorer.tsx`).
  The same media is the post's `og:image`.
- **It must read on the light card and the dark card.** That constraint
  started this direction: the code-rendered covers sat on a zinc-950 ground
  and read as dark tiles in light mode. Judge every candidate on both.
- **Keep the subject in the middle band.** Generators that cannot output
  16:9 are cropped top and bottom, and `g_auto` may shift the crop (§11).
- **Distinctiveness gate, before upload.** Put the pick in a thumbnail
  contact sheet beside the 5 most recent covers. It must differ from each in
  scene or silhouette; a different era alone does not pass.

## 9. Rotation rules

Check a new recipe against the cover history (§13) before generating.

- **Scene** differs from each of the previous 3 covers (D24).
- **Era** differs from each of the previous 2 covers (D24, which replaced
  D9's "last 3": with four eras that forced one fixed cycle).
- **Metaphor family** rotates (v2). No look-back window was set; choose the
  family used least recently in the history.
- **"Field of identical units"**: at most 2 across the live set (v2).
  The history flags three live covers (posts 40, 46 and 52, from the
  2026-09-27 sameness audit), so the set is already over the cap. A new
  cover adds none, and a replacement for one of the three is welcome.
- **"Previous" means:** for a new article, the newest entries in the
  history. For a new cover on an older post, its neighbours in the listing
  order (the posts published just before and after it), as the September
  backfill did (D25).
- **A picked image outranks rotation.** Record the exception in the cover's
  history entry. Two stand from the rollout: post 55 after post 56 (both
  near-future) and post 47 two after post 6 (both 1960s).
- Entries with no scene or era recorded are skipped by the check, not
  counted as a match.

## 10. Generators

Keep two facts apart:

- **Midjourney was Brandon's chosen generator for the 53 live covers.** It
  ranked first on look in the September comparisons and stays his tool. It is a
  **human paste path**: Brandon runs the prompt and picks. Agents do not
  drive Midjourney. Its terms prohibit automated use, and driving its web UI
  proved fragile: submits failed silently and lists loaded lazily.
- **GPT Image (`openai/gpt-image-2`, via OpenClaw `image_generate` on the
  OpenClaw OAuth route) is the candidate route for agents.** Agents
  generate with it. Status, 2026-11-22: local candidates generated; A2-1
  is the recommended pick, A the fallback; neither uploaded nor attached.
- **Switching off Midjourney waits for proof.** The Midjourney subscription
  is cancelled only after GPT Image makes three clean covers in a row.
  Cloudinary hosting and its URLs stay; only Cloudinary's paid generation
  add-on is being cancelled.

### GPT Image (agents)

- **Route.** `openai/gpt-image-2` through OpenClaw OAuth, and only that.
  Confirm it before the first generation of a session and stop if it is
  unavailable. No API key, no silent fallback to another provider or
  model, and no change to OpenClaw's default model. GPT Image 2.5 needs an
  API-key route and is not available here.
- **Size: requested and native are different.** Request `2048x1152`; the
  OpenAI provider takes sizes, not aspect ratios, and `3840x2160` is the
  other 16:9 size. What comes back natively on the OpenClaw OAuth route is
  1672×941 [measured 2026-11-22, one trial]. Record both, keep the native
  PNG, and do not resize it in the pilot (§11 Upload).
- **The tuned prompt form.** The Midjourney text does not transfer.
  Untuned, GPT Image drifts toward stock photos and product renders. What
  closed most of the gap in the September tests:
  - Drop the `--` flags and turn the exclusions (§7) into one closing
    sentence.
  - Lead with the impossible detail, and give its geometry: where the
    object is, how far it is from what it should touch, and the shadow it
    casts.
  - Add three short lines describing a real photograph:
    - the camera (a 35mm still, a normal lens, a low angle off to one side,
      shallow focus);
    - the light (one directional source, long shadows);
    - the surface (visible grain, muted color, worn real materials).
  - Rule out the render look in words: not an ad, not a 3D render, not a
    catalogue shot, not symmetrical, not head-on.
  - Say that only the named objects appear, and name the decor it tends to
    add as excluded.
  - Ask for blank paper and unlettered signs, since it fills both with fake
    writing.
  - Keep people small, from behind or in silhouette.
  - Ask for a wide frame with everything important in the middle band, so
    a 16:9 crop loses nothing.
- **Known failure modes** [measured on the September tests, one image per
  cell, so the ranking below is inference-grade]:
  - staged, glossy, crowded frames with props nobody asked for;
  - a readable, front-lit face despite the people rule;
  - the wrong aspect ratio: 3:2, near-square, or wider than 16:9 with black
    bars added (crop it; never ship the bars);
  - tuning can weaken the impossible detail (a page meant to float stayed
    attached to its binder), which is why the detail goes first.
- **Ranking.** Tuned, it came second on look, behind Midjourney and ahead
  of Cloudinary's FLUX.2 Pro, and ahead of Midjourney on literal adherence
  in about a third of the rows.

### Midjourney (Brandon)

- Append `--ar 16:9 --style raw --s 150 --no <§7 list>` to the §2 template.
  Midjourney stores it in its normalized form (`--raw --stylize 150 --v
8.2`, with `--no` moved first), as the history's `finalPrompt` shows.
- The live covers used no moodboard or `--p` profile: the "BP Covers House
  Style" moodboard pulled every image toward one look (D15).
- **What it renders well:** one object with one odd property.
- **What it fails at** [measured across the v2 run]: an oddity that depends
  on something else, such as a reflection, a shadow, a copy of another
  object, or a mess around one object left untouched. Three v2 concepts (posts
  1, 15 and 41) missed after a re-run and needed new ideas, not more
  wording. One sharpened re-run per recipe is the cap; after that, change
  the concept.
- Base output is 1456×816; Upscale (Subtle) gives 2912×1632. Upscales draw
  on Fast hours, which ran out mid-rollout; Cloudinary's `e_upscale`
  covered the 13 that missed (history; §11 no longer uses it). A smaller
  original now goes through the ingest derivation's ordinary resize (§11).

### Other providers

None is approved for production covers. If GPT Image keeps missing, Google
(`gemini-3-pro-image`) is the named challenger, and it needs Brandon's go
first. xAI is untested.

## 11. Pipeline

How a picked image becomes a post's cover. The ingest route and attach
mechanics are in `docs/CONTENT_WORKFLOW.md` §4–§5; this section is what is
specific to covers.

### Pilot hold (2026-11-22)

The GPT Image pilot is **local only** until #415 lands and Brandon
approves the attach: no candidate upload, no ingest, no attach. While this
file is `status: draft`, §1 still applies.

### Autonomy and the publish boundary

- **Agents stop at the attach.** An agent generates, reviews against this
  file, and uploads its candidates (below). Brandon approves the attach
  (claude-skills#492, option (b), 2026-11-22). Whether agents may ever
  attach without asking is Brandon's decision, not yet made.
- **Covers never publish.** No cover step publishes, unpublishes or
  reschedules a post. `_status` is read before and after every attach and
  must not change.
- **Never print a secret.** That covers `CMS_REVALIDATE_SECRET_*`,
  `VERCEL_AUTOMATION_BYPASS_SECRET` and Blob tokens; print counts only.

### Media target and series naming

- **Folder:** `bp-portfolio/images/articles/{slug}/`. The other folders
  are `.../x-posts/{slug-or-id}/`, `.../linkedin-posts/{slug-or-id}/` and
  `.../long-form/{slug}/`. No ad-hoc paths.
- **Series id:** `cover-<provider>-<letter>`, where the provider slug names
  the generator that made the image:

  | Provider                  | Slug  | Example                           |
  | ------------------------- | ----- | --------------------------------- |
  | Midjourney                | `mj`  | `cover-mj-A` (all 53 live covers) |
  | GPT Image (`gpt-image-*`) | `gpt` | `cover-gpt-B`                     |

  A new provider claims its slug in this table before its first upload.
  Never put `mj` on an image another generator made.

- **The letter counts the post's photographic covers,** across providers.
  The next cover takes the letter after the highest one any `cover-<slug>-`
  series holds for that post. Every live post holds `-A`, so its next cover
  is `-B`: `cover-gpt-B` from an agent, `cover-mj-B` if Brandon pastes it
  from Midjourney.
- **Retired namespaces, never reused:** `cover-a`/`-b`/`-c` (the AI era,
  before 2026-08) and `cover-ds-A` (the code-rendered covers, 2026-08). Both
  still occupy their slots in Cloudinary.
- **Candidates:** upload to
  `bp-portfolio/images/articles/{slug}/candidates/cover-<provider>-<letter>-<n>`
  (`n` = 1, 2, …), tagged `bp-cover-candidate`. They are never ingested.
  After Brandon picks, the pick is uploaded again at the series id.

### Upload

- **`sign-upload` forces `overwrite: true`.** It rewrote `overwrite: false`
  to `true` on every upload of both rollouts, and added `upload_preset`,
  `colors` and `audit_context`. A collision would silently replace the old
  asset. So:
  1. **Look up the exact public ID.** Use the authenticated Cloudinary
     [Admin API single-resource lookup](https://cloudinary.com/documentation/admin_api#get_details_of_a_single_resource_by_public_id),
     `GET /resources/image/upload/{public_id}`, in the upload's product
     environment. Pass the full public ID, including its folder path, to
     the SDK's `api.resource` method or URL-encode it for REST. With the
     same connection, first confirm a known original such as the post's
     `cover-mj-A`. Only a resource-level 404 for the full target ID
     establishes absence. Treat any returned resource,
     including a backup placeholder, as occupied. Stop if the control
     fails or the result is ambiguous.
     The current Asset Management MCP exposes `get-asset-details` by
     internal asset ID and `list-images` by public IDs. If the upload
     operator lacks an authorized single-resource Admin API connection,
     stop before signing or uploading.
  2. **Run one writer per post folder.** The lookup and upload are separate
     operations. If the ID exists, choose the next available candidate
     number or series letter and check that ID before uploading.
  3. **Reconcile an uncertain upload before writing to that ID again.**
     After a timeout, missing response or error after send, repeat the
     exact lookup while holding the same writer slot. If the asset exists,
     verify its stored original against the intended file. Continue with the existing
     asset if it matches. If the match cannot be verified, stop and report
     it. If the asset is absent, stop until the original request can no
     longer complete. Then rerun step 1 before retrying.
  4. **When the upload returns a response**, check for `overwritten` or
     `existing`, check width and height match the file, and check stored
     bytes equal the file. If an overwrite happened, stop and report it.
- **Keep the native PNG, and a same-size JPEG beside it.** Do not resize
  in the pilot. Next to each PNG, export a JPEG at the same pixel size and
  about quality 90, and check it is under Cloudinary's upload limit of
  10,485,760 bytes. Lossless PNG optimisation alone does not meet this.
- _History:_ post 45's upscaled Midjourney PNG (10,712,024 bytes) went over
  the limit and was re-encoded losslessly (PIL `optimize`, level 9, keeping
  the text chunks that hold its final prompt), verified pixel-identical.
- **Cloudinary hosts and delivers; it does not generate** (Brandon,
  2026-11-22). No rule here depends on a Cloudinary generative or AI
  transform, so `e_upscale` is history, not a step (§Ingest URL).
- **Tags:** `bp-cover`, the series id, and the provider (`midjourney` or
  `gpt-image`). `cld-upscaled` marks the 13 history covers that used
  `e_upscale`; new covers do not get it.
  **Context:** `source`, `recipe` (the version) and `upscale`, plus the
  job id (`mj_job` for Midjourney, the generation id for GPT Image).
- **Match picks by job id,** never by prompt wording or by eye. Midjourney
  file names end in the job UUID and image index. Post 11 stalled on this: the
  matching phrase belonged to a re-run Brandon had turned down, and the
  image he had chosen was the earlier one.

### Ingest URL

Ingest a 16:9 JPEG derivation, not the original:

    https://res.cloudinary.com/dgwdyrmsn/image/upload/c_fill,ar_16:9,g_auto,w_2048/q_auto:good,f_jpg/<public_id>.jpg

- **The derivation sets the delivered size.** `c_fill,ar_16:9,w_2048` is
  an ordinary delivery resize, not a generative transform, so a native
  1672×941 original comes out at 2048×1152. Fetch the URL once, confirm
  200 at 2048×1152, and view it at full size for smearing, halos or
  plastic surfaces before ingesting.
- _History:_ 13 Midjourney covers under 2048 px wide were ingested with
  `e_upscale/` after `upload/` (5–24 s to warm the first time). In the
  September check it came out crisper than a Lanczos resize, with no
  halos, but softened the film grain a little [measured on 5 of 13].
  Since 2026-11-22 the rules do not use it (§Upload).
- `w_2048,c_limit` alone gave 2048×1148, because a Midjourney upscale is
  1.784:1, not 16:9. Use `c_fill,ar_16:9`.
- The ingest route takes only `https` URLs on `res.cloudinary.com`, refuses
  redirects and caps the body at 12 MB [source:
  `src/app/api/media/ingest/route.ts`]. It names the stored file from the
  URL's last two path segments: `<slug>-cover-gpt-B.jpg`.

### Attach

- After Brandon approves: production Payload `updatePosts`, setting only
  `heroImage` and `meta.image` to the new media id. A partial `meta`
  update keeps the meta title and description [measured 2026-09-27].
- **Record the previous `heroImage` and `meta.image` media ids first:**
  they are independent fields [source: `src/collections/Posts/index.ts`].
  Rollback re-attaches each recorded id to its own field.
- Read `_status` before and after; it must not change.
- In a batch, take one post end to end and verify it live first.
- **Verify a published post live:** the article page loads (200) and both
  its hero and its `og:image` point at the new file. A post whose
  `ogImageMode` is `generated` keeps the generated card
  (`/api/og/article/<slug>`) as its `og:image` [source:
  `src/lib/og/resolveOgImage.ts`,
  `src/app/(frontend)/articles/[slug]/ArticleView.tsx`]: check that URL
  returns 200, and leave the mode as it was. The Blob URL and
  `/_next/image` return 200 and decode; the post's tile shows on
  `/articles`. Not verified live means not done.
- **Verify a draft without publishing it:** open it through the
  authenticated draft preview (`/next/preview?path=/articles/<slug>`,
  `docs/CONTENT_WORKFLOW.md` § Draft preview), which needs a signed-in
  Payload session, and check the hero and the Blob URL there. Never
  publish to check a cover. Every preview link you hand anyone says "Sign
  in to Payload first."

### Environment gotchas

- **Name the environment with every id.** Staging and production media ids
  diverged at 177 on 2026-09-26: production 177 is an unrelated image,
  staging 177 a cover rehearsal.
- **Staging and production shared one Blob store when last checked,** and
  the stored name is deterministic. A staging rehearsal and a production
  ingest of the same Cloudinary URL target the same Blob path. Whether the
  second overwrites the first is unmeasured. Decide deliberately whether to
  rehearse on staging, and never treat a rehearsal as having placed
  production's bytes. Before relying on the shared path, compare the
  store ids: the id is the middle segment of each environment's
  `BLOB_READ_WRITE_TOKEN` (`vercel_blob_rw_<storeId>_…`). Parse and print
  only that segment, never the token. The code guarantees no sharing; each
  deployment derives its store from its own token
  (`src/lib/storage/mediaBlobUrl.ts`).
- **Vercel Authentication covers every `*.vercel.app` host.** Target
  production by `brandonperfetti.com` (`docs/CONTENT_WORKFLOW.md` §0).

## 12. Alt text

Describe the impossible detail as the thesis, in one plain sentence. Do
not describe decoration, and never write "AI image" or "illustration".
Examples from live covers:

- "A full-size airport baggage tug tows a single folded paper airplane
  across an empty runway at dawn" (post 53).
- "A glowing rural mailbox in a snowy field at blue hour, with a line of
  footprints that arrive and never leave" (post 2).

## 13. Cover history

[`docs/cover-history.json`](cover-history.json) holds one entry per live
cover, newest `publishedAt` first, so its first entries are "the previous
covers" for §9.

- **Each entry:** post id, slug, title, `publishedAt`, series, generator,
  recipe version, scene, era, metaphor family, hue, impossible detail,
  logged prompt, final prompt, Midjourney job id, Cloudinary public_id and
  version, production media id and filename, alt, rollout, and notes.
- **Where the values come from:**
  - **`finalPrompt`** is the prompt Midjourney embedded in each cover's
    original PNG (its `Description` text chunk), read from the Cloudinary
    original on 2026-11-22, for all 53. Each PNG's job GUID matches the
    rollout receipt. `finalPromptMatchesLogged` is false for 20: six first-9
    covers picked from trial-round prompts, the eight one-time re-runs with
    sharpened wording, and the six replacement concepts.
  - **`era`** is read from the final prompt's era phrase. `scene` comes
    from the recipe, or is classified from the final prompt for the six
    replacement concepts and for post 20, whose final prompt is a macro
    close-up although its recipe said interior.
  - **`metaphorFamily`** is logged for the nine v2 recipes still live. The
    other 44 were classified on 2026-11-22 from the final prompt
    (`metaphorFamilySource` says which). That covers the v1 covers, which
    had no such dial, and the three v2 recipes whose concept was replaced,
    since their logged family described the rejected idea. Treat those 44
    as a best reading, and correct any you disagree with.
  - **`hue`** is the recipe's topic hue. Two trial-round picks used a
    different accent in the final prompt (posts 55 and 6); their notes say
    so.

- **A new article's cover:** insert its entry in descending `publishedAt`
  order (at the top only when it is the newest post), with the same
  fields, in the same change that attaches it.
- **A new cover on an existing post:** update that post's entry in place,
  so the order stays by `publishedAt`. Move the replaced cover's series,
  public_id and media id into a `previous` list on the entry. That list is
  the cover's history, not the rollback: a rollback restores the per-field
  ids recorded at the attach (§ Attach).
- **Retire a post:** keep its entry and add `"retiredAt": "<date>"`.
  Rotation skips retired entries.
- **Count, 2026-11-22:** 53 published posts, 53 entries, 53 `cover-mj-A`
  originals in Cloudinary. Every `heroImage` and `meta.image` equals the
  entry's media id. The method is in the file's `verified` block. The
  count will drop as Sloane's audit retires posts.
- **Earlier eras:** the code-rendered covers and their spec are in
  [`archive/code-rendered-covers/`](../archive/code-rendered-covers/HISTORY.md).
