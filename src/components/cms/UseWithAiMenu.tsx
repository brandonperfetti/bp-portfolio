'use client'

import { Fragment, useRef, useState } from 'react'
import { Menu, MenuButton, MenuItem, MenuItems, Transition } from '@headlessui/react'
import { ChevronDownIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline'

async function copyText(value: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }
}

export function UseWithAiMenu({ markdown }: { markdown: string }) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  return (
    <Menu as="div" className="relative">
      <MenuButton className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800">
        {copied ? 'Copied' : 'Use with AI'}
        <ChevronDownIcon className="h-4 w-4" />
      </MenuButton>
      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <MenuItems className="absolute right-0 z-30 mt-2 w-56 origin-top-right rounded-md border border-zinc-200 bg-white p-1 shadow-lg focus:outline-none dark:border-zinc-700 dark:bg-zinc-900">
          <MenuItem>
            {({ focus }) => (
              <button
                type="button"
                className={`flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm ${
                  focus
                    ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                    : 'text-zinc-700 dark:text-zinc-200'
                }`}
                onClick={async () => {
                  await copyText(markdown)
                  setCopied(true)
                  if (timeoutRef.current) {
                    clearTimeout(timeoutRef.current)
                  }
                  timeoutRef.current = setTimeout(() => {
                    setCopied(false)
                  }, 1400)
                }}
              >
                <ClipboardDocumentIcon className="h-4 w-4" />
                Copy as Markdown
              </button>
            )}
          </MenuItem>
        </MenuItems>
      </Transition>
    </Menu>
  )
}
