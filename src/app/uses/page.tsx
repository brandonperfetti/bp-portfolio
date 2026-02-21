import { Card } from '@/components/Card'
import { Section } from '@/components/Section'
import { SimpleLayout } from '@/components/SimpleLayout'

function ToolsSection({
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof Section>) {
  return (
    <Section {...props}>
      <ul role="list" className="space-y-16">
        {children}
      </ul>
    </Section>
  )
}

function Tool({
  title,
  href,
  children,
}: {
  title: string
  href?: string
  children: React.ReactNode
}) {
  return (
    <Card as="li">
      <Card.Title as="h3" href={href}>
        {title}
      </Card.Title>
      <Card.Description>{children}</Card.Description>
    </Card>
  )
}

export const metadata = {
  title: 'Uses',
  description: 'Software, hardware, and tools I use to plan, build, and ship.',
}

export default function Uses() {
  return (
    <SimpleLayout
      title="Software, hardware, and workflows I rely on every week."
      intro="A practical list of tools I use for product work, engineering, communication, and learning."
    >
      <div className="space-y-20">
        <ToolsSection title="Workstation">
          <Tool title="14-inch MacBook Pro, Apple M2 Pro, 16GB RAM (2023)">
            Strong performance for daily development, project management, and
            content work.
          </Tool>
          <Tool title="Dual 27-inch LG UltraFine UHD 4K HDR monitors">
            When attention to detail pays the bills, multiple 4K screens are
            always preferred.
          </Tool>
          <Tool title="Apple Magic Keyboard">
            A dependable, low-friction setup I&apos;ve used for years.
          </Tool>
          <Tool title="Apple Magic Trackpad">
            Gesture support keeps navigation and context-switching fast.
          </Tool>
          <Tool title="FAMISKY electric standing desk">
            I have been coding standing up for nearly a decade. It helps me
            maintain energy over long sessions.
          </Tool>
          <Tool title="Audio Pro USB-C microphone">
            Clean audio quality improves remote collaboration and pair
            programming.
          </Tool>
        </ToolsSection>

        <ToolsSection title="Development tools">
          <Tool title="Visual Studio Code">
            The extension ecosystem and speed make VS Code my daily driver for
            most engineering work.
          </Tool>
          <Tool title="GitKraken">
            Helpful when I need high-level context across many repositories and
            branching workflows.
          </Tool>
          <Tool title="Insomnia">
            Great for managing and testing large sets of REST and GraphQL
            requests across environments.
          </Tool>
        </ToolsSection>

        <ToolsSection title="Design">
          <Tool title="Figma">
            Started as a design tool and became a collaborative workspace for
            planning and iteration.
          </Tool>
          <Tool title="Whimsical">
            Fast way to turn rough ideas into diagrams that teams can discuss
            and improve quickly.
          </Tool>
          <Tool title="Pixelmator Pro">
            My default for lightweight graphic work when I need to move quickly.
          </Tool>
        </ToolsSection>

        <ToolsSection title="Podcasts">
          <Tool title="Syntax.fm">
            Practical web development conversations covering modern tooling and
            frameworks.
          </Tool>
          <Tool title="The Changelog">
            Deep interviews and weekly updates across software engineering, open
            source, and leadership.
          </Tool>
          <Tool title="Nav.al">
            Technology and business entrepreneurship perspectives that
            consistently challenge assumptions.
          </Tool>
          <Tool title="The Tim Ferriss Show">
            Long-form conversations that surface useful mental models, habits,
            and systems.
          </Tool>
        </ToolsSection>
      </div>
    </SimpleLayout>
  )
}
