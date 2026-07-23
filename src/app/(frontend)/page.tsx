import { type Metadata } from 'next'
import { Resume } from '@/components/home/Resume'
import { CmsPageBlocks } from '@/components/cms/CmsPageBlocks'
import Link from 'next/link'

import { Card } from '@/components/Card'
import { Container } from '@/components/Container'
import { ShaderHero } from '@/components/heros/ShaderHero'
import { NotFoundState } from '@/components/cms/NotFoundState'
import { Messenger } from '@/components/home/Messenger'
import { PhotoStrip } from '@/components/home/PhotoStrip'
import { AnimatedHeadline } from '@/components/motion/AnimatedHeadline'
import { HoverMotionCard } from '@/components/motion/HoverMotionCard'
import { ScrollReveal } from '@/components/motion/ScrollReveal'
import { GitHubIcon, LinkedInIcon, XIcon } from '@/icons'
import { buildPageMetadata } from '@/lib/cms/pageMetadata'
import { type ArticleWithSlug, getAllArticles } from '@/lib/articles'
import { getCmsPageByPath } from '@/lib/cms/pagesRepo'
import { getCmsSiteSettings } from '@/lib/cms/siteSettingsRepo'
import { formatDate } from '@/lib/formatDate'
import { getExternalLinkProps } from '@/lib/link-utils'
import { toSafeJsonLd } from '@/lib/seo/jsonLd'
import { buildPersonSchema, buildWebsiteSchema } from '@/lib/seo/structuredData'
import { getSiteUrl } from '@/lib/site'
import { dedupeArticlesBySlug } from '@/lib/articleUtils'

const image1 =
  'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1684298666/image-1_ebktnx.jpg'
const image2 =
  'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1684298666/image-2_vutl5o.jpg'
const image3 =
  'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1684298667/image-3_rfkaku.jpg'
const image4 =
  'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1684298665/image-4_iten8l.jpg'
const image5 =
  'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1684298668/image-5_cpx20p.jpg'
const defaultHomeGalleryImages = [image1, image2, image3, image4, image5]
const defaultHomeMeta = {
  title: 'Home',
  description:
    'I’m Brandon, a product and project manager plus software engineer based in Orange County, California.',
}

function Article({ article }: { article: ArticleWithSlug }) {
  return (
    <HoverMotionCard>
      <Card as="article">
        <div
          data-hover-overlay
          className="absolute -inset-x-4 -inset-y-6 z-0 scale-95 bg-zinc-50 opacity-0 transition sm:-inset-x-6 sm:rounded-2xl dark:bg-zinc-800/50"
        />
        <Link
          href={`/articles/${article.slug}`}
          aria-label={`Read article: ${article.title}`}
          className="absolute -inset-x-4 -inset-y-6 z-20 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/70 sm:-inset-x-6 sm:rounded-2xl dark:focus-visible:ring-teal-400/70"
        />
        <Card.Title>{article.title}</Card.Title>
        <Card.Eyebrow as="time" dateTime={article.date} decorate>
          {formatDate(article.date)}
        </Card.Eyebrow>
        <Card.Description>{article.description}</Card.Description>
        <Card.Cta>
          <span data-hover-icon className="inline-flex items-center">
            Read article
          </span>
        </Card.Cta>
      </Card>
    </HoverMotionCard>
  )
}

function SocialLink({
  icon: Icon,
  ...props
}: React.ComponentPropsWithoutRef<typeof Link> & {
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Link
      className="group -m-1 rounded-md p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/80 dark:focus-visible:ring-teal-400/80"
      {...getExternalLinkProps(props.href)}
      {...props}
    >
      <Icon className="h-6 w-6 fill-zinc-500 transition group-hover:fill-zinc-600 dark:fill-zinc-400 dark:group-hover:fill-zinc-300" />
    </Link>
  )
}

export default async function Home() {
  const siteUrl = getSiteUrl()
  const settings = await getCmsSiteSettings()
  const canonicalSiteUrl = (settings.canonicalUrl || siteUrl).replace(
    /\/+$/,
    '',
  )
  const articles = dedupeArticlesBySlug(await getAllArticles()).slice(0, 7)
  const homePage = await getCmsPageByPath('/')
  const homeTitle =
    homePage?.title ||
    'Product and project leader focused on practical software delivery.'
  const homeSubtitle =
    homePage?.subtitle ||
    "I'm Brandon, based in Orange County, CA. I help teams turn complex product goals into reliable, user-focused software."
  // The Home page doc's PhotoStrip block feeds the hero-slot gallery below
  // (CmsPageBlocks excludes it so it doesn't render twice at page end).
  const homeGalleryImagesRaw = Array.from(
    new Set(
      (homePage?.photoStripImages ?? [])
        .map((image) => image?.trim())
        .filter(isNonEmptyString),
    ),
  )
  const homeGalleryImages =
    homeGalleryImagesRaw.length > 0
      ? homeGalleryImagesRaw
      : defaultHomeGalleryImages
  const websiteSchema = buildWebsiteSchema(
    settings.siteName,
    settings.siteDescription,
    canonicalSiteUrl,
  )
  const personSchema = buildPersonSchema(canonicalSiteUrl)

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toSafeJsonLd(websiteSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toSafeJsonLd(personSchema) }}
      />
      <section className="isolate">
        <ShaderHero />
        <Container className="pt-9 pb-16 sm:pb-20">
          <div className="max-w-2xl">
            <AnimatedHeadline
              text={homeTitle}
              variant="typewriter"
              className="text-4xl font-bold tracking-tight text-zinc-800 sm:text-5xl dark:text-zinc-100"
            />
            <ScrollReveal y={14} duration={0.78} delay={0.26}>
              <p className="mt-6 text-base text-zinc-600 dark:text-zinc-400">
                {homeSubtitle}
              </p>
            </ScrollReveal>
            <ScrollReveal y={10} duration={0.68} delay={0.37}>
              <div className="mt-6 flex gap-6">
                <SocialLink
                  href="https://x.com/brandonperfetti"
                  aria-label="Follow on X"
                  icon={XIcon}
                />
                <SocialLink
                  href="https://github.com/brandonperfetti"
                  aria-label="Follow on GitHub"
                  icon={GitHubIcon}
                />
                <SocialLink
                  href="https://www.linkedin.com/in/brandonperfetti/"
                  aria-label="Follow on LinkedIn"
                  icon={LinkedInIcon}
                />
              </div>
            </ScrollReveal>
          </div>
        </Container>
      </section>
      <PhotoStrip images={homeGalleryImages} priority />
      <Container className="mt-24 mb-24 md:mt-28 md:mb-28">
        <div className="mx-auto grid max-w-xl grid-cols-1 gap-y-20 lg:max-w-none lg:grid-cols-2">
          <ScrollReveal targets="article" y={20} stagger={0.08}>
            <div className="flex flex-col gap-16">
              {articles.length > 0 ? (
                articles.map((article) => (
                  <Article key={article.slug} article={article} />
                ))
              ) : (
                <NotFoundState
                  title="No published articles"
                  description="No CMS article records are currently publish-safe."
                />
              )}
            </div>
          </ScrollReveal>
          <ScrollReveal
            className="lg:pl-16 xl:pl-24"
            targets="[data-reveal-item]"
            y={20}
            stagger={0.16}
          >
            <div
              data-testid="home-sticky-rail-anchor"
              className="space-y-10 lg:sticky lg:top-10"
            >
              <div data-reveal-item>
                <Messenger />
              </div>
              <div data-reveal-item>
                <Resume />
              </div>
            </div>
          </ScrollReveal>
        </div>
        <CmsPageBlocks slug="home" exclude={['photoStrip']} />
      </Container>
    </>
  )
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getCmsSiteSettings()
  const page = await getCmsPageByPath('/')

  return buildPageMetadata({
    page,
    settings,
    fallbackTitle: defaultHomeMeta.title,
    fallbackDescription: defaultHomeMeta.description,
    path: '/',
  })
}
function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0
}
