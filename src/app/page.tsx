import { Card } from '@/components/common'
import { Container } from '@/components/common/Container'
import { Messenger, Newsletter, Resume } from '@/components/home'
import { GitHubIcon, LinkedInIcon, XIcon } from '@/icons'
import { formatDate } from '@/lib'
import { getAllArticles, type ArticleWithSlug } from '@/lib/articles'
import clsx from 'clsx'
import Image from 'next/image'
import Link from 'next/link'

function Article({ article }: { article: ArticleWithSlug }) {
  return (
    <Card as="article">
      <Card.Title href={`/articles/${article.slug}`}>
        {article.title}
      </Card.Title>
      <Card.Eyebrow as="time" dateTime={article.date} decorate>
        {formatDate(article.date)}
      </Card.Eyebrow>
      <Card.Description>{article.description}</Card.Description>
      <Card.Cta>Read article</Card.Cta>
    </Card>
  )
}

function SocialLink({
  icon: Icon,
  ...props
}: React.ComponentPropsWithoutRef<typeof Link> & {
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Link className="group -m-1 p-1" {...props}>
      <Icon className="h-6 w-6 fill-zinc-500 transition group-hover:fill-zinc-600 dark:fill-zinc-400 dark:group-hover:fill-zinc-300" />
    </Link>
  )
}

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

function Photos() {
  let rotations = ['rotate-2', '-rotate-2', 'rotate-2', 'rotate-2', '-rotate-2']

  return (
    <div className="mt-16 sm:mt-20">
      <div className="-my-4 flex justify-center gap-5 overflow-hidden py-4 sm:gap-8">
        {[image1, image2, image3, image4, image5].map((image, imageIndex) => (
          <div
            key={imageIndex}
            className={clsx(
              'relative aspect-[9/10] w-44 flex-none overflow-hidden rounded-xl bg-zinc-100 sm:w-72 sm:rounded-2xl dark:bg-zinc-800',
              rotations[imageIndex % rotations.length],
            )}
          >
            <Image
              src={image}
              width={100}
              height={100}
              alt=""
              sizes="(min-width: 640px) 18rem, 11rem"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export default async function Home() {
  let articles = (await getAllArticles()).slice(0, 7)

  return (
    <>
      <Container className="mt-9">
        <div className="max-w-2xl">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-800 sm:text-5xl dark:text-zinc-100">
            Seasoned Product & Project Manager, Software Engineer, and
            Continuous Learner.{' '}
          </h1>
          <p className="mt-6 text-base text-zinc-600 dark:text-zinc-400">
            I&apos;m Brandon, based in the beautiful Orange County, CA. My
            passion lies in crafting solutions that not only solve complex
            problems but also significantly improve user interactions and
            business processes. A continual learner, I thrive on exploring new
            technologies and methodologies to stay ahead in the ever-evolving
            tech landscape.
          </p>
          <div className="mt-6 flex gap-6">
            <SocialLink
              href="https://twitter.com/brandonperfetti"
              aria-label="Follow on X"
              icon={XIcon}
            />
            {/* <SocialLink
              href="#"
              aria-label="Follow on Instagram"
              icon={InstagramIcon}
            /> */}
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
        </div>
      </Container>
      <Photos />
      <Container className="mt-24 md:mt-28">
        <div className="mx-auto grid max-w-xl grid-cols-1 gap-y-20 lg:max-w-none lg:grid-cols-2">
          <div className="flex flex-col gap-16">
            {articles.map((article) => (
              <Article key={article.slug} article={article} />
            ))}
          </div>
          <div className="mb-4 space-y-10 lg:pl-16 xl:pl-24">
            <Newsletter />
            <Messenger />
            <Resume />
          </div>
        </div>
      </Container>
    </>
  )
}
