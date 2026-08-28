import { Button } from '@/components/ui/button'

/**
 * The members-only teaser shown in place of a gated article's body, with the
 * "Sign in to continue" CTA that returns the reader to the article afterwards.
 *
 * @remarks
 * The CTA is the shared shadcn `Button` primitive (#113) rather than a raw
 * `<a>` with hand-written classes: `asChild` keeps real anchor semantics (a
 * `link` role for AT, middle-click / open-in-new-tab, no JS to navigate) while
 * the primitive supplies sizing, the focus ring, and the site's `teal` variant.
 * `rounded-xl` is threaded through `className` and beats the primitive's
 * `rounded-md` via `cn`'s tailwind-merge, so the visual is byte-for-byte the
 * pre-port treatment: teal-700 fill → teal-600 on hover, white ink, `px-4 py-2`
 * (= the primitive's 36px `h-9`).
 *
 * Split out of {@link ArticleBodyRegion}'s module so it can carry a Storybook
 * story: `GatedArticleBody.tsx` also holds the request-time
 * `AuthGatedArticleBody`, whose `@/lib/articles` / `getViewer` imports pull the
 * Payload Local API into any bundle that imports the module — which a
 * browser-mode story cannot build (measured: rolldown fails resolving
 * `payload/dist/uploads/*`). This leaf imports nothing but the primitive.
 */
export function MembersTeaser({ slug }: { slug: string }) {
  return (
    <div className="mt-8 rounded-2xl border border-zinc-200 p-6 text-center dark:border-zinc-700/60">
      <p className="text-base font-medium text-zinc-800 dark:text-zinc-100">
        This article is for members.
      </p>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Sign in (it&apos;s free) to read the full piece.
      </p>
      <Button asChild variant="teal" className="mt-4 rounded-xl">
        <a href={`/sign-in?redirect_url=/articles/${slug}`}>
          Sign in to continue
        </a>
      </Button>
    </div>
  )
}
