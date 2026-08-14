import { Container } from '@/components/Container'
import { AnimatedHeadline } from '@/components/motion/AnimatedHeadline'
import { ScrollReveal } from '@/components/motion/ScrollReveal'
import { REVEAL_INTRO } from '@/lib/motion/timing'

export function SimpleLayout({
  title,
  intro,
  actions,
  children,
}: {
  title: string
  intro: string
  /** Optional page-actions row (e.g. the reader Share control) rendered
   * right-aligned below the hero; omitted entirely when absent so every
   * existing consumer's markup is unchanged. */
  actions?: React.ReactNode
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
        <ScrollReveal {...REVEAL_INTRO}>
          <p className="mt-6 text-base text-zinc-600 dark:text-zinc-400">
            {intro}
          </p>
        </ScrollReveal>
      </header>
      {actions ? <div className="mt-8 flex justify-end">{actions}</div> : null}
      {children && <div className="mt-16 sm:mt-20">{children}</div>}
    </Container>
  )
}
