import { type Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import clsx from 'clsx'

import { Container } from '@/components/Container'
import { Prose } from '@/components/Prose'
import { ArticleBody } from '@/components/cms/ArticleBody'
import { GitHubIcon, LinkedInIcon, MailIcon, XIcon } from '@/icons'
import { buildPageMetadata } from '@/lib/cms/pageMetadata'
import { getCmsPageByPath } from '@/lib/cms/pagesRepo'
import { getCmsSiteSettings } from '@/lib/cms/siteSettingsRepo'
import { getOptimizedImageUrl } from '@/lib/image-utils'
import { getExternalLinkProps } from '@/lib/link-utils'

function SocialLink({
  className,
  href,
  children,
  icon: Icon,
}: {
  className?: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <li className={clsx(className, 'flex')}>
      <Link
        href={href}
        {...getExternalLinkProps(href)}
        className="group flex text-sm font-medium text-zinc-800 transition hover:text-teal-500 dark:text-zinc-200 dark:hover:text-teal-500"
      >
        <Icon className="h-6 w-6 flex-none fill-zinc-500 transition group-hover:fill-teal-500" />
        <span className="ml-4">{children}</span>
      </Link>
    </li>
  )
}

const defaultAboutMeta = {
  title: 'About',
  description:
    'Brandon Perfetti is a product and project leader plus software engineer based in Orange County, California.',
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getCmsSiteSettings()
  const page = await getCmsPageByPath('/about')

  return buildPageMetadata({
    page,
    settings,
    fallbackTitle: defaultAboutMeta.title,
    fallbackDescription: defaultAboutMeta.description,
    path: '/about',
  })
}

function AboutFallbackBody() {
  return (
    <div>
      <div className="py-4">
        <h3 className="text-xl font-bold tracking-tight text-zinc-800 sm:text-3xl dark:text-zinc-100">
          Navigating Complexities with Agile Leadership
        </h3>
        <p className="mt-6 text-base text-zinc-600 dark:text-zinc-400">
          I&apos;ve led and contributed across diverse teams, shifting between strategic
          planning and hands-on implementation as needed. That adaptability helps me keep
          teams aligned in fast-moving, ambiguous environments.
        </p>
      </div>
      <div className="py-4">
        <h3 className="text-xl font-bold tracking-tight text-zinc-800 sm:text-3xl dark:text-zinc-100">
          Driving Innovation Through Continuous Learning
        </h3>
        <p className="mt-6 text-base text-zinc-600 dark:text-zinc-400">
          I continuously refine the systems, tooling, and workflows behind delivery. I adopt
          new methods when they improve quality, reduce risk, and help teams make better
          product decisions.
        </p>
      </div>
      <div className="py-4">
        <h3 className="text-xl font-bold tracking-tight text-zinc-800 sm:text-3xl dark:text-zinc-100">
          A Commitment to Excellence
        </h3>
        <p className="mt-6 text-base text-zinc-600 dark:text-zinc-400">
          My work is grounded in continuous improvement and collaborative knowledge sharing. I
          focus on raising both delivery standards and team capability so outcomes improve over
          time.
        </p>
      </div>
      <div className="py-4">
        <h3 className="text-xl font-bold tracking-tight text-zinc-800 sm:text-3xl dark:text-zinc-100">
          Enterprise Client and Project Management
        </h3>
        <p className="mt-6 text-base text-zinc-600 dark:text-zinc-400">
          I prioritize clear communication, realistic commitments, and disciplined execution.
          That combination helps clients and stakeholders move forward with confidence.
        </p>
      </div>
      <div className="py-4">
        <h3 className="text-xl font-bold tracking-tight text-zinc-800 sm:text-3xl dark:text-zinc-100">
          Development and Technological Excellence
        </h3>
        <p className="mt-6 text-base text-zinc-600 dark:text-zinc-400">
          With a strong technical foundation and cross-disciplinary experience, I help teams
          move from product inception to pragmatic rollout. I prioritize scalable solutions,
          operational efficiency, and measurable outcomes.
        </p>
      </div>
      <div className="py-4">
        <h3 className="text-xl font-bold tracking-tight text-zinc-800 sm:text-3xl dark:text-zinc-100">
          Looking Forward
        </h3>
        <p className="mt-6 text-base text-zinc-600 dark:text-zinc-400">
          I&apos;m most energized by hard product problems, strong teams, and builds that
          create durable value for users and businesses.
        </p>
      </div>
    </div>
  )
}

export default async function About() {
  const page = await getCmsPageByPath('/about', { includeBody: true })

  const heroTitle = page?.title || 'I build software with a product mindset and an execution-first approach.'
  const heroSubtitle =
    page?.subtitle ||
    "I'm Brandon Perfetti, a product and project manager plus software engineer based in Orange County, California. Over the last decade, I've worked across startup and client teams where clear priorities, fast iteration, and reliable delivery are non-negotiable."
  const portraitImage =
    page?.heroImage ||
    'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1683142618/bp-spotlight/images/portrait_zdvgpf.jpg'

  return (
    <Container className="my-16 sm:mt-32">
      <div className="grid grid-cols-1 gap-y-14 lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:gap-y-12">
        <div className="order-2 lg:order-none lg:pl-20">
          <div className="mx-auto max-w-xs px-2.5 lg:max-w-none">
            <Image
              height={800}
              width={800}
              src={getOptimizedImageUrl(portraitImage, {
                width: 1024,
                height: 1024,
                crop: 'fill',
              })}
              alt="Brandon Perfetti"
              sizes="(min-width: 1024px) 32rem, 20rem"
              priority
              className="aspect-square rounded-2xl bg-zinc-100 object-cover md:rotate-3 dark:bg-zinc-800"
            />
          </div>
        </div>
        <div className="order-first lg:order-first lg:row-span-2">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-800 sm:text-5xl dark:text-zinc-100">
            {heroTitle}
          </h1>
          <div className="mt-6 space-y-7 text-base text-zinc-600 dark:text-zinc-400">
            <p>{heroSubtitle}</p>
          </div>
          {page?.bodyBlocks?.length ? (
            <Prose className="mt-8 max-w-none" data-mdx-content>
              <ArticleBody blocks={page.bodyBlocks} />
            </Prose>
          ) : (
            <AboutFallbackBody />
          )}
        </div>
        <div className="mb-4 lg:mt-2 lg:pl-20">
          <ul role="list">
            <SocialLink href="https://x.com/brandonperfetti" icon={XIcon}>
              Follow on X
            </SocialLink>
            <SocialLink
              href="https://github.com/brandonperfetti"
              icon={GitHubIcon}
              className="mt-4"
            >
              Follow on GitHub
            </SocialLink>
            <SocialLink
              href="https://www.linkedin.com/in/brandonperfetti/"
              icon={LinkedInIcon}
              className="mt-4"
            >
              Follow on LinkedIn
            </SocialLink>
            <SocialLink
              href="mailto:brandon@brandonperfetti.com"
              icon={MailIcon}
              className="mt-8 border-t border-zinc-100 pt-8 dark:border-zinc-700/40"
            >
              brandon@brandonperfetti.com
            </SocialLink>
          </ul>
        </div>
      </div>
    </Container>
  )
}
