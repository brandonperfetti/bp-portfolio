import { type Metadata } from 'next'

import { Container } from '@/components/Container'
import { HermesChat } from '@/components/HermesChat'

export const metadata: Metadata = {
  title: 'Hermes',
  description:
    'Chat with Hermes using streaming responses and image generation prompts.',
}

export default function HermesPage() {
  return (
    <Container className="py-0">
      <div className="flex h-[calc(100dvh-5.75rem)] min-h-0 flex-col overflow-hidden pt-8 pb-2 sm:h-[calc(100dvh-6.25rem)] sm:pt-10 sm:pb-3">
        <div className="shrink-0">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-800 dark:text-zinc-100">
            Hermes
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Prefix your prompt with image: or Dali: to generate an image.
          </p>
        </div>
        <div className="mt-3 min-h-0 flex-1">
          <HermesChat />
        </div>
      </div>
    </Container>
  )
}
