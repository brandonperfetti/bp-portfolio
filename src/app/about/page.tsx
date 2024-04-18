import clsx from 'clsx'
import { type Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

import { Container } from '@/components/Container'
import {
  GitHubIcon,
  InstagramIcon,
  LinkedInIcon,
  XIcon,
} from '@/components/SocialIcons'

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
    <Container className="mt-16 sm:mt-32">
      <div className="grid grid-cols-1 gap-y-16 lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:gap-y-12">
        <div className="lg:pl-20">
          <div className="max-w-xs px-2.5 lg:max-w-none">
            <Image
              height={800}
              width={800}
              src="https://res.cloudinary.com/dgwdyrmsn/image/upload/v1683142618/bp-spotlight/images/portrait_zdvgpf.jpg"
              alt=""
              sizes="(min-width: 1024px) 32rem, 20rem"
              className="aspect-square rotate-3 rounded-2xl bg-zinc-100 object-cover dark:bg-zinc-800"
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
              With over a decade of experience, I specialize in navigating the
              intricate landscape of real estate technology, crafting digital
              solutions that are both efficient and user-centric. My journey has
              been marked by a progressive transition from specialized roles in
              data integration to leading edge front-end engineering projects,
              particularly with Lone Wolf Technologies. This path has been
              fueled by a relentless pursuit of technological excellence,
              driving significant advancements within the teams and projects
              under my stewardship.
            </p>
          </div>
          <div>
            <div className="py-4">
              <h3 className="text-xl font-bold tracking-tight text-zinc-800 sm:text-3xl dark:text-zinc-100">
                My Journey 🚀
              </h3>
              <p className="mt-6 text-base text-zinc-600 dark:text-zinc-400">
                My professional odyssey commenced in the realm of data services,
                focusing on the seamless management and integration of complex
                data systems. This foundational role at W+R Studios honed my
                skills in ensuring robust data ingestion and optimized output
                via GraphQL APIs, serving a broad spectrum of SaaS products
                tailored for the real estate sector.
              </p>
              <p className="mt-6 text-base text-zinc-600 dark:text-zinc-400">
                As I elevated to the role of Senior Data Services Engineer, the
                scope of my responsibilities expanded dramatically. I was
                entrusted with the orchestration of over 250 distinct data
                feeds, overseeing their daily management and leading the quality
                assurance for new integrations. The primary aim was always
                clear: deliver timely, precise data with minimal latency,
                thereby enhancing the end-user experience.
              </p>
              <p className="mt-6 text-base text-zinc-600 dark:text-zinc-400">
                My journey took a pivotal turn as I embraced the challenges of
                Front End Software Engineering. Here, my focus was on driving
                innovation through detailed planning and execution of UI/UX
                strategies. The landmark project of refactoring an internal data
                ingestion tool, which I led, not only quintupled data feed
                integration speeds but also achieved widespread adoption across
                the organization, marking a significant milestone in my career
                trajectory.
              </p>
            </div>
            <div className="py-4">
              <h3 className="text-xl font-bold tracking-tight text-zinc-800 sm:text-3xl dark:text-zinc-100">
                Present Focus 🎯
              </h3>
              <p className="mt-6 text-base text-zinc-600 dark:text-zinc-400">
                Currently, my professional endeavor is to pioneer intuitive,
                robust, and scalable front-end architectures. My portfolio,
                including the comprehensive overhaul of a data pipeline
                ingestion tool and the development of my personal website,
                stands as a testament to my dedication towards continuous
                improvement and making a tangible impact.
              </p>
            </div>
            <div className="py-4">
              <h3 className="text-xl font-bold tracking-tight text-zinc-800 sm:text-3xl dark:text-zinc-100">
                Solutions & Problem-Solving 🛠
              </h3>
              <p className="mt-6 text-base text-zinc-600 dark:text-zinc-400">
                My career is built on identifying and solving intricate problems
                with no apparent solutions. Through a refined skill set in
                troubleshooting software and hardware issues, I excel in
                identifying negative feedback loops and transforming them into
                positive outcomes. My approach isolates the root cause of
                challenges, paving the way for multiple resolution scenarios.
              </p>
            </div>
            <div className="py-4">
              <h3 className="text-xl font-bold tracking-tight text-zinc-800 sm:text-3xl dark:text-zinc-100">
                Enterprise Client & Project Management 🤝
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
                Development & Technological Excellence 💻
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
          </div>
        </div>
        <div className="lg:pl-20">
          <ul role="list">
            <SocialLink href="https://twitter.com/brandonperfetti" icon={XIcon}>
              Follow on X
            </SocialLink>
            {/* <SocialLink href="#" icon={InstagramIcon} className="mt-4">
              Follow on Instagram
            </SocialLink> */}
            <SocialLink href="https://github.com/brandonperfetti" icon={GitHubIcon} className="mt-4">
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
