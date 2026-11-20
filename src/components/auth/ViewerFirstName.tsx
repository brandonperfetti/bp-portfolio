'use client'

import { useUser } from '@clerk/nextjs'
import { createContext, useContext, type ReactNode } from 'react'

/**
 * The signed-in visitor's first name, or `null`. The default is `null`, so a
 * tree with no Clerk provider reads an anonymous visitor.
 */
const ViewerFirstNameContext = createContext<string | null>(null)

/**
 * Supplies a viewer first name to the tree below it.
 *
 * @remarks The app never mounts this directly: {@link ClerkViewerFirstName}
 * does, inside `<ClerkProvider>`. Stories and tests mount it to stand for a
 * signed-in visitor without a Clerk provider, which they cannot run (#381).
 *
 * @param props - `firstName`, the name to supply (`null` for anonymous), and
 *   `children`.
 */
export function ViewerFirstNameProvider({
  firstName,
  children,
}: {
  firstName: string | null
  children: ReactNode
}) {
  return (
    <ViewerFirstNameContext.Provider value={firstName}>
      {children}
    </ViewerFirstNameContext.Provider>
  )
}

/**
 * Reads Clerk's user and supplies its first name to the tree.
 *
 * @remarks Must be rendered inside `<ClerkProvider>`, because `useUser`
 * throws anywhere else. `ClerkClientProvider` is its only caller, so the name
 * exists exactly where the provider does. Components that want the name read
 * {@link useViewerFirstName} and never call `useUser` themselves: deciding
 * "is Clerk mounted" from an env var let a component disagree with the tree
 * it was rendered in (#381).
 *
 * @param props - `children`, the site.
 */
export function ClerkViewerFirstName({ children }: { children: ReactNode }) {
  const { user } = useUser()
  return (
    <ViewerFirstNameProvider firstName={user?.firstName ?? null}>
      {children}
    </ViewerFirstNameProvider>
  )
}

/**
 * The signed-in visitor's first name, or `null` when the visitor is
 * anonymous, has no first name on file, or no Clerk provider is mounted.
 *
 * @returns The first name, or `null`.
 */
export function useViewerFirstName(): string | null {
  return useContext(ViewerFirstNameContext)
}
