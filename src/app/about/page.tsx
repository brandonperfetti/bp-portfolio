import { Container } from '@/components/common/Container'
import { GitHubIcon, LinkedInIcon, XIcon } from '@/icons'
import clsx from 'clsx'
import { type Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

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
        className="group flex text-sm font-medium text-zinc-800 transition hover:text-teal-500 dark:text-zinc-200 dark:hover:text-teal-500"
      >
        <Icon className="h-6 w-6 flex-none fill-zinc-500 transition group-hover:fill-teal-500" />
        <span className="ml-4">{children}</span>
      </Link>
    </li>
  )
}

function MailIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fillRule="evenodd"
        d="M6 5a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H6Zm.245 2.187a.75.75 0 0 0-.99 1.126l6.25 5.5a.75.75 0 0 0 .99 0l6.25-5.5a.75.75 0 0 0-.99-1.126L12 12.251 6.245 7.187Z"
      />
    </svg>
  )
}

export const metadata: Metadata = {
  title: 'About',
  description:
    'I’m Brandon Perfetti, a Project Manager + Software Engineer from Orange County CA, crafting efficient and user-friendly digital solutions.',
}

export default function About() {
  return (
    <Container className="my-16 sm:mt-32">
      <div className="grid grid-cols-1 gap-y-16 lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:gap-y-12">
        <div className="lg:pl-20">
          <div className="mx-auto max-w-xs px-2.5 lg:max-w-none">
            <Image
              height={800}
              width={800}
              src="https://res.cloudinary.com/dgwdyrmsn/image/upload/v1683142618/bp-spotlight/images/portrait_zdvgpf.jpg"
              alt=""
              sizes="(min-width: 1024px) 32rem, 20rem"
              className="aspect-square rounded-2xl bg-zinc-100 object-cover md:rotate-3 dark:bg-zinc-800"
            />
          </div>
        </div>
        <div className="lg:order-first lg:row-span-2">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-800 sm:text-5xl dark:text-zinc-100">
            Hey there! 👋<br></br>
            <p>I&apos;m Brandon Perfetti.</p>
          </h1>
          <div className="mt-6 space-y-7 text-base text-zinc-600 dark:text-zinc-400">
            <p>
              With over a decade of immersion in the agile tech startup
              ecosystem, I&rsquo;ve developed a dual expertise that intertwines
              the strategic oversight of a Project Manager with the technical
              acumen of a Software Engineer. This unique fusion not only defines
              my professional persona but also amplifies my contribution to
              every project I touch.
            </p>
          </div>
          <div>
            <div className="py-4">
              <h3 className="text-xl font-bold tracking-tight text-zinc-800 sm:text-3xl dark:text-zinc-100">
                Navigating Complexities with Agile Leadership 🚀
              </h3>
              <p className="mt-6 text-base text-zinc-600 dark:text-zinc-400">
                My career is a mosaic of leading and contributing to diverse
                teams, where my role oscillated between a versatile
                jack-of-all-trades and a specialized expert. This flexibility
                has been my cornerstone, enabling me to adapt, thrive, and drive
                success in the fast-paced, ever-evolving tech landscape.
              </p>
            </div>
            <div className="py-4">
              <h3 className="text-xl font-bold tracking-tight text-zinc-800 sm:text-3xl dark:text-zinc-100">
                Driving Innovation Through Continuous Learning 📚
              </h3>
              <p className="mt-6 text-base text-zinc-600 dark:text-zinc-400">
                At the heart of my approach is a relentless pursuit of knowledge
                and excellence. I am driven by the possibilities that new
                technologies bring to the table, not just to meet ambitious
                project deadlines but to redefine what&rsquo;s possible. My
                passion for learning is matched by my commitment to sharing
                knowledge, fostering an environment where innovation is not just
                encouraged but expected.
              </p>
            </div>
            <div className="py-4">
              <h3 className="text-xl font-bold tracking-tight text-zinc-800 sm:text-3xl dark:text-zinc-100">
                A Commitment to Excellence 💪
              </h3>
              <p className="mt-6 text-base text-zinc-600 dark:text-zinc-400">
                My professional journey is underpinned by a belief in the power
                of continuous improvement and the value of sharing knowledge. I
                am dedicated to not only advancing my own skills but also
                elevating those around me, ensuring that together, we can
                overcome challenges and exceed expectations.
              </p>
            </div>
            <div className="py-4">
              <h3 className="text-xl font-bold tracking-tight text-zinc-800 sm:text-3xl dark:text-zinc-100">
                Enterprise Client + Project Management 🤝
              </h3>
              <p className="mt-6 text-base text-zinc-600 dark:text-zinc-400">
                I thrive on effective communication and meticulous time
                management, which are crucial for achieving successful projects
                and client satisfaction. By setting realistic expectations and
                consistently delivering beyond them, I guide clients through
                tailored project pathways, ensuring a service experience
                uniquely catered to their specific needs and objectives.
              </p>
            </div>

            <div className="py-4">
              <h3 className="text-xl font-bold tracking-tight text-zinc-800 sm:text-3xl dark:text-zinc-100">
                Development + Technological Excellence 💻
              </h3>
              <p className="mt-6 text-base text-zinc-600 dark:text-zinc-400">
                With a solid foundation in technology and over ten years of
                cross-disciplinary experience, my role extends beyond mere
                participation to actively facilitating product inception,
                pragmatic execution, and seamless rollout. My dedication to
                crafting scalable solutions, optimizing internal processes, and
                fostering result-oriented teams underscores my unwavering
                commitment to delivering exceptional value in every project I
                undertake.
              </p>
            </div>
            <div className="py-4">
              <h3 className="text-xl font-bold tracking-tight text-zinc-800 sm:text-3xl dark:text-zinc-100">
                Looking forward 🔭
              </h3>
              <p className="mt-6 text-base text-zinc-600 dark:text-zinc-400">
                As I look to the future, I am excited about the opportunity to
                leverage my experience and insights to tackle new challenges,
                drive unparalleled innovation, and contribute to a culture of
                excellence and continuous growth.
              </p>
            </div>
          </div>
        </div>
        <div className="mb-4 lg:pl-20">
          <ul role="list">
            <SocialLink href="https://twitter.com/brandonperfetti" icon={XIcon}>
              Follow on X
            </SocialLink>
            {/* <SocialLink href="#" icon={InstagramIcon} className="mt-4">
              Follow on Instagram
            </SocialLink> */}
            <SocialLink
              href="https://github.com/brandonperfetti"
              icon={GitHubIcon}
              className="mt-4"
            >
              Follow on GitHub
            </SocialLink>
            <SocialLink href="#" icon={LinkedInIcon} className="mt-4">
              Follow on LinkedIn
            </SocialLink>
            <SocialLink
              href="https://www.linkedin.com/in/brandonperfetti/"
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
