'use client'
import { SendIcon } from '@/icons/SendIcon'
import { ShortcutIcon } from '@/icons/ShortcutIcon'
import {
  ArrowDownIcon,
  ClipboardIcon,
  PencilIcon,
} from '@heroicons/react/24/outline'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useCopyToClipboard } from 'usehooks-ts'
import { Input } from './Input'
import { Tooltip } from './ToolTip'

interface Message {
  content: string
  role: 'user' | 'assistant'
}

interface ReadableStreamChunk {
  done: boolean
  value: Uint8Array
}

const HermesChat: React.FC = () => {
  // const [isLoading, setIsLoading] = useState<boolean>(false)
  const [isLoadingDali, setIsLoadingDali] = useState<boolean>(false)
  const [message, setMessage] = useState<string>('')
  const [typingMessage, setTypingMessage] = useState<string>('')
  const [isChatStart, setIsChatStart] = useState<boolean>(true)
  const [isDali, setIsDali] = useState<boolean>(false)
  // const [isBlogPost, setIsBlogPost] = useState<boolean>(false)

  const [value, copy] = useCopyToClipboard()
  const [isTyping, setIsTyping] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const [messages, setMessages] = useState([
    {
      content:
        "Hey there 👋, I'm Hermes ⚡, your virtual assistant! What can I help with?",
      role: 'assistant',
    },
  ])

  const chatContainerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const submitMessage = (event: React.FormEvent) => {
    event.preventDefault()
    setIsChatStart(false)
    // setIsLoading(true)

    // Add user message in the correct format
    const newUserMessage: Message = {
      role: 'user',
      content: message,
    }

    setMessages((prevMessages) => [...prevMessages, newUserMessage])
    processMessage(newUserMessage) // Send the newly formatted message to the API
    setMessage('')
  }

  const processMessage = async (newMessage: Message) => {
    const apiMessages = messages.map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    }))

    apiMessages.push({
      role: newMessage.role,
      content: newMessage.content,
    })

    if (newMessage.content.includes('Dali:')) {
      try {
        setIsDali(true)
        setIsLoadingDali(true)
        // setIsBlogPost(false)
        const strippedMessage = newMessage.content.replace('Dali: ', '')
        const { image } = await fetch('/api/openai/image', {
          method: 'POST',
          body: JSON.stringify({ message: strippedMessage }),
          headers: {
            'Content-Type': 'application/json',
          },
        }).then((r) => r.json())

        setIsLoadingDali(false)
        setMessages((messages) => [
          ...messages,
          { role: 'assistant', content: `<img src=${image} />` },
        ])
      } catch (err) {
        console.error('Error processing Dali image request:', err)
        setMessages((messages) => [
          ...messages,
          {
            role: 'assistant',
            content: `<p>Oops! Something went wrong 😬, please try again.</p>`,
          },
        ])
      } finally {
        setIsLoadingDali(false)
      }
    } else {
      try {
        const response = await fetch('/api/openai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: apiMessages }),
        })

        if (!response.ok) {
          throw new Error('Stream failed to start')
        }

        const reader: ReadableStreamDefaultReader<Uint8Array> =
          response.body!.getReader()
        let buffer = ''
        let currentMessage = ''

        const processStream = async ({
          done,
          value,
        }: ReadableStreamReadResult<Uint8Array>): Promise<void> => {
          if (done) {
            // setIsLoading(false)
            setIsTyping(false)
            finalizeMessage(currentMessage)
            setTypingMessage('') // Clear the typing simulation
            return
          }

          buffer += new TextDecoder().decode(value, { stream: true })
          let newLineIndex
          while ((newLineIndex = buffer.indexOf('\n')) !== -1) {
            const completeData = buffer.slice(0, newLineIndex)
            buffer = buffer.slice(newLineIndex + 1)
            const dataObject = JSON.parse(completeData)

            if (dataObject.choices[0].delta.content) {
              currentMessage += dataObject.choices[0].delta.content
              setTypingMessage(currentMessage) // Update the typing simulation message
              setIsTyping(true)
            }
          }
          reader?.read().then(processStream)
        }

        reader?.read().then(processStream)
      } catch (err) {
        console.error('Error fetching data:', err)
        // setIsLoading(false)
        setMessages((prevMessages) => [
          ...prevMessages,
          {
            role: 'assistant',
            content: `<p>Oops! Something went wrong 😬, please try again.</p>`,
          },
        ])
      }
    }
  }

  const finalizeMessage = (finalMessage: string) => {
    setIsTyping(false)
    setMessages((prevMessages) => [
      ...prevMessages,
      { role: 'assistant', content: finalMessage },
    ])
  }

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  })

  useEffect(() => {
    const onKeyPress = (event: KeyboardEvent) => {
      if (
        event.key === '/' &&
        document.activeElement !== searchInputRef.current
      ) {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    document.body.addEventListener('keydown', onKeyPress)
    return () => {
      document.body.removeEventListener('keydown', onKeyPress)
    }
  }, [])

  useEffect(() => {
    if (isCopied) {
      setTimeout(() => {
        setIsCopied(false)
      }, 1200)
    }
  }, [isCopied])

  return (
    <div>
      <div className="flex h-[70vh] flex-col overflow-hidden md:h-[75vh]">
        <div
          ref={chatContainerRef}
          id="messages"
          className="scrollbar-thumb-teal scrollbar-thumb-rounded scrollbar-track-teal-lighter scrollbar-w-2 scrolling-touch flex h-full flex-col space-y-4 overflow-y-scroll p-3"
        >
          {messages.map((message, index) => {
            return message.role === 'assistant' ? (
              <div key={index} id={`${index}_id`} className="chat-message">
                <div className="flex items-end">
                  <div className="order-2 mx-2 flex max-w-xs flex-col items-start space-y-2 text-xs lg:max-w-md">
                    <div>
                      <span className="inline-block rounded-lg rounded-bl-none bg-teal-600 px-4 py-2 text-lg text-gray-100">
                        <div>
                          <div
                            dangerouslySetInnerHTML={{
                              __html: message.content.replace(
                                /(\r\n|\n|\r)/gm,
                                '<br>',
                              ),
                            }}
                          />{' '}
                          <div className="flex">
                            {message.content !==
                              "Hey there 👋, I'm Hermes ⚡, your virtual assistant! What can I help with?" && (
                              <div className="w-full pt-2">
                                <Tooltip
                                  delay={700}
                                  placement="right"
                                  maxWidth={150}
                                  content="Click to copy"
                                >
                                  <button
                                    className="float-right"
                                    onClick={() => {
                                      copy(`${message.content}`)
                                      setIsCopied(true)
                                    }}
                                  >
                                    <ClipboardIcon className="h-3 w-3 text-white hover:text-yellow-400" />
                                  </button>
                                </Tooltip>
                                {/* {isCopied && <p className="text-sm float-right pr-2 -mt-1">Copied!</p>} */}
                              </div>
                            )}
                          </div>
                        </div>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div key={index} id="user" className="chat-message">
                <div className="flex items-end justify-end">
                  <div className="order-1 mx-2 flex max-w-xs flex-col items-end space-y-2 text-xs lg:max-w-md">
                    <div>
                      <span className="inline-block rounded-lg rounded-br-none bg-zinc-500 px-4 py-2 text-lg text-white dark:bg-zinc-600">
                        {message.content}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          {!!isChatStart && (
            <>
              <div className="flex w-full justify-center pt-4">
                <div className="flex align-middle dark:text-white">
                  <PencilIcon className="mr-2 mt-1 h-6 w-6" />
                  <h2 className="text-xl">Examples</h2>
                </div>
              </div>
              <form className="w-full" onSubmit={submitMessage}>
                <div className=" mx-auto grid max-w-sm grid-cols-1 space-y-3 md:max-w-lg">
                  <button
                    className="mx-auto inline-block rounded-lg bg-zinc-500 px-4 py-2 text-lg text-gray-100 transition duration-500 ease-in-out hover:bg-zinc-600 dark:bg-zinc-700 dark:hover:bg-zinc-600"
                    onClick={(event) => {
                      setMessage(`Explain "The Observer Effect".`)
                    }}
                  >
                    Explain &quot;The Observer Effect&quot;.
                  </button>
                  <button
                    className="mx-auto inline-block rounded-lg bg-zinc-500 px-4 py-2 text-lg text-gray-100 transition duration-500 ease-in-out hover:bg-zinc-600 dark:bg-zinc-700 dark:hover:bg-zinc-600"
                    onClick={(event) => {
                      setMessage(`Dali: A digital
                    illustration of Homer Simpson meditating while sitting on a donut, 4k, detailed, pixar animation.`)
                    }}
                  >
                    <span className="font-extrabold">Dali:</span> A digital
                    illustration of Homer Simpson meditating while sitting on a
                    donut, 4k, detailed, pixar animation.
                  </button>
                  {/* <button
                    className="mx-auto inline-block rounded-lg bg-zinc-500 px-4 py-2 text-lg text-gray-100 transition duration-500 ease-in-out hover:bg-zinc-600 dark:bg-zinc-700 dark:hover:bg-zinc-600"
                    onClick={(event) => {
                      setMessage(
                        `Generate Blog Topics: Software Engineering Management`
                      );
                    }}
                  >
                    <span className="font-extrabold">
                      Generate Blog Topics:
                    </span>{" "}
                    Software Engineering Management
                  </button> */}
                  {/* <button
                    className="mx-auto inline-block rounded-lg bg-zinc-500 px-4 py-2 text-lg text-gray-100 transition duration-500 ease-in-out hover:bg-zinc-600 dark:bg-zinc-700 dark:hover:bg-zinc-600"
                    onClick={(event) => {
                      setMessage(`Blog Post: Buckminster Fuller`);
                    }}
                  >
                    <span className="font-extrabold">Blog Post:</span>{" "}
                    Buckminster Fuller
                  </button> */}
                </div>
              </form>
            </>
          )}
          {isLoadingDali && (
            <div id="assistant" className="chat-message">
              <div className="flex animate-pulse items-end">
                <div className="order-2 mx-2 flex max-w-xs flex-col items-start space-y-2 text-xs lg:max-w-md">
                  <div>
                    <span className="inline-block rounded-lg rounded-bl-none bg-teal-500 px-4 py-2 text-lg text-white">
                      {!!isDali && <>Let&apos;s consult Salvador... 🧑‍🎨</>}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
          {isTyping && (
            <div className="chat-message">
              <div className="flex animate-pulse items-end">
                <div className="order-2 mx-2 flex max-w-xs flex-col items-start space-y-2 text-xs lg:max-w-md">
                  <div>
                    <span className="inline-block rounded-lg rounded-bl-none bg-teal-500 px-4 py-2 text-lg text-white">
                      {typingMessage}...
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        <div
          id="type-field"
          className="w-full border-t-2 border-gray-200 py-4 sm:mb-0"
        >
          <form onSubmit={submitMessage} className="relative flex gap-2">
            <div className="absolute z-30 flex w-full pr-1">
              <Link className="bottom-0 w-full justify-end" href="/hermes">
                <ArrowDownIcon className="float-right -mt-14 h-6 w-6 rounded-full bg-white/70 p-0.5 text-zinc-600 shadow-lg shadow-zinc-800/5 ring-1 ring-zinc-900/5 backdrop-blur dark:bg-zinc-800/70 dark:text-white dark:ring-white/10" />
              </Link>
            </div>
            <div className="flex w-full py-2">
              <Input
                fullWidth
                autoFocus
                ref={searchInputRef}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                type="text"
                name="message"
                placeholder="Write your message!"
                rightIcon={<ShortcutIcon className="text-gray-700" />}
              />
            </div>
            <div className="inset-y-0 hidden items-center sm:flex">
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center rounded-xl  bg-zinc-500 px-4 py-1.5 text-white transition duration-500 ease-in-out hover:bg-zinc-600 focus:outline-none dark:bg-zinc-700 dark:hover:bg-zinc-600"
              >
                <span className="font-semibold">Send</span>
                <SendIcon />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default HermesChat
