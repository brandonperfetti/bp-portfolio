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
  description: 'Software I use, gadgets I love, and other things I recommend.',
}

export default function Uses() {
  return (
    <SimpleLayout
      title="Software I use, gadgets I love, and other things I recommend."
      intro="I get asked a lot about the things I use to build software, stay productive, or buy to fool myself into thinking I’m being productive when I’m really just procrastinating. Here’s a big list of all of my favorite stuff."
    >
      <div className="space-y-20">
        <ToolsSection title="Workstation">
          <Tool title="14” MacBook Pro, Apple M2 Pro, 16GB RAM (2023)">
            You don&apos;t think you need to upgrade your laptop until you do. I am
            thrilled with the performance of the M2 Pro chip. Never looking
            back. 🚀
          </Tool>
          <Tool title="Dual 27'' LG UltraFine UHD 4k HDR Monitors">
            When attention to detail pays the bills, multiple 4k screens will
            always be preferred.
          </Tool>
          <Tool title="Apple Magic Keyboard">
            I have always been using some iteration of Apple&apos;s Magic Keyboard.
            It&apos;s a pleasent experince if you have yet to drink the mechanical
            keyboard kool aid.
          </Tool>
          <Tool title="Apple Magic Trackpad">
            Something about all the gestures makes me feel like a wizard with
            special powers. I really like feeling like a wizard with special
            powers.
          </Tool>
          <Tool title="FAMISKY Electric Standup Desk">
            I&apos;ve been coding standing up for almost a decade. I&apos;ll sit when I&apos;m
            dead.
          </Tool>
          <Tool title="Audio Pro USBC Microphone">
            When you shift from office life to remote work and zoom meetings,
            having a quality microphone will make or break your productivity in
            pair programming.
          </Tool>
        </ToolsSection>
        <ToolsSection title="Development tools">
          <Tool title="Visual Studio Code">
            I enjoy writing in VS Code as the vast extension library elevates my
            skillset and makes me wicked fast and efficient when deep in a
            coding flow state.
          </Tool>
          <Tool title="GitKraken">
            Working in a sea of git repos and workflows can be taxing on the
            brain. GitKraken is great for scoping projects with proper context
            no matter how many repos a particular project/workflow requires.
          </Tool>
          <Tool title="Insomnia">
            When you work with a mindboggling number of GraphQL APIs that
            require various env contexts, insomnia allows me to organize by
            queries and share workspaces making collaboration a breeze.
          </Tool>
        </ToolsSection>
        <ToolsSection title="Design">
          <Tool title="Figma">
            We started using Figma as just a design tool but now it’s become our
            virtual whiteboard for the entire company. Never would have expected
            the collaboration features to be the real hook.
          </Tool>
          <Tool title="Whimsical">
            Whimsical make it easy to get rudimentary design out of my mind and
            onto a visual board for the team to analize, discuss and iterate on.
          </Tool>
          <Tool title="Pixelmator Pro">
            I&apos;ve spent years trying to learn the ins and outs of Adobe Creative
            Cloud, but at then end of the day i keep coming back to Pixelmator
            for literally all of my graphic design needs.
          </Tool>
        </ToolsSection>
        <ToolsSection title="Podcasts">
          <Tool title="Syntax.fm">
            Full Stack Developers Wes Bos and Scott Tolinski dive deep into web
            development topics, explaining how they work and talking about their
            own experiences. They cover from JavaScript frameworks like React,
            to the latest advancements in CSS to simplifying web tooling.
          </Tool>
          <Tool title="The Changelog">
            Conversations with the hackers, leaders, and innovators of the
            software world. On Mondays: The software world moves fast. Keep up
            with our brief News roundup episodes. On Fridays: Adam Stacoviak and
            Jerod Santo face their imposter syndrome so you don’t have to.
            Expect in-depth interviews with the best and brightest in software
            engineering, open source & leadership. This is a polyglot podcast.
            All programming languages, platforms & communities are welcome.
          </Tool>
          <Tool title="Nav.al">Technology and Business Entrepreneurship</Tool>
          <Tool title="The Tim Ferris Show">
            Tim Ferriss is a self-experimenter and bestselling author, best
            known for The 4-Hour Workweek, which has been translated into 40+
            languages. Newsweek calls him &quot;the world&apos;s best human guinea pig,&quot;
            and The New York Times calls him &quot;a cross between Jack Welch and a
            Buddhist monk.&quot; In this show, he deconstructs world-class performers
            from eclectic areas (investing, chess, pro sports, etc.), digging
            deep to find the tools, tactics, and tricks that listeners can use.
          </Tool>
        </ToolsSection>
      </div>
    </SimpleLayout>
  )
}
