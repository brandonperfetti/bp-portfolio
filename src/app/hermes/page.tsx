import { type Metadata } from 'next'

import { Container } from '@/components/common/Container'
import HermesChat from '@/components/HermesChat'

export const metadata: Metadata = {
  title: 'Hermes - Open AI Chat',
  description: "I'm an AI assistant that can help you with anything!",
}

export default function Hermes() {
  return (
    <Container>
      <div className="flex">
        <h1 className="sm:tracking-tigh mx-auto w-fit py-3 text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl dark:text-white">
          <span className="text-teal-600">Hermes</span>
        </h1>
      </div>
      <HermesChat />
    </Container>
  )
}
