import { Container } from '@/components/Container'
import { AnimatedHeadline } from '@/components/motion/AnimatedHeadline'
import { ScrollReveal } from '@/components/motion/ScrollReveal'

export function SimpleLayout({
  title,
  intro,
  children,
}: {
  title: string
  intro: string
  children?: React.ReactNode
}) {
  return (
    <Container className="mt-16 sm:mt-32">
      <header className="max-w-2xl">
        <AnimatedHeadline
          text={title}
          variant="line"
          className="text-4xl font-bold tracking-tight text-zinc-800 sm:text-5xl dark:text-zinc-100"
        />
        <ScrollReveal y={14} duration={0.7} delay={0.12}>
          <p className="mt-6 text-base text-zinc-600 dark:text-zinc-400">
            {intro}
          </p>
        </ScrollReveal>
      </header>
      {children && <div className="mt-16 sm:mt-20">{children}</div>}
    </Container>
  )
}
