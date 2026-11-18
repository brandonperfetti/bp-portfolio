import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  hasMailingListOptIn,
  MAILING_LIST_OPT_IN_LABEL,
} from '@/lib/email/mailingListOptIn'

import { SignUpWithOptIn } from './SignUpWithOptIn'

/**
 * #362: the sign-up screen asks before adding anyone to the mailing list.
 *
 * `@clerk/nextjs` is mocked, as in the sign-up page's own test: the real
 * `<SignUp>` needs a live `ClerkProvider` and a network round-trip. The mock
 * renders the props it was given, so what is pinned here is this component's
 * half of the contract: which `unsafeMetadata` it hands Clerk for each state
 * of the box. That Clerk sends that value with the sign-up request is Clerk's
 * half and is not provable in jsdom.
 */
vi.mock('@clerk/nextjs', () => ({
  SignUp: (props: Record<string, unknown>) => (
    <div data-testid="sign-up" data-props={JSON.stringify(props)} />
  ),
}))

const { getPathname, setPathname } = vi.hoisted(() => {
  let pathname = '/sign-up'
  return {
    getPathname: () => pathname,
    setPathname: (next: string) => {
      pathname = next
    },
  }
})
vi.mock('next/navigation', () => ({ usePathname: () => getPathname() }))

afterEach(() => {
  setPathname('/sign-up')
})

const signUpProps = () =>
  JSON.parse(screen.getByTestId('sign-up').dataset.props ?? '{}') as {
    unsafeMetadata?: unknown
    path?: string
    routing?: string
    signInUrl?: string
  }

const box = () =>
  screen.getByRole('checkbox', { name: MAILING_LIST_OPT_IN_LABEL })

describe('SignUpWithOptIn', () => {
  it('shows the opt-in unticked, labelled with the contact form’s wording', () => {
    render(<SignUpWithOptIn />)

    expect(box()).not.toBeChecked()
    expect(MAILING_LIST_OPT_IN_LABEL).toBe(
      'Keep me posted when new articles are published. Unsubscribe anytime.',
    )
  })

  it('puts the box before the Clerk form, so it is reached before the form’s Continue', () => {
    render(<SignUpWithOptIn />)

    expect(
      box().compareDocumentPosition(screen.getByTestId('sign-up')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('hands Clerk an explicit "no" while the box is unticked', () => {
    render(<SignUpWithOptIn />)

    expect(signUpProps().unsafeMetadata).toEqual({ mailingListOptIn: false })
    // The webhook's reader agrees with what this component wrote.
    expect(hasMailingListOptIn(signUpProps().unsafeMetadata)).toBe(false)
  })

  it('hands Clerk the opt-in once the box is ticked, and takes it back when unticked', () => {
    render(<SignUpWithOptIn />)

    fireEvent.click(box())
    expect(box()).toBeChecked()
    expect(signUpProps().unsafeMetadata).toEqual({ mailingListOptIn: true })
    expect(hasMailingListOptIn(signUpProps().unsafeMetadata)).toBe(true)

    fireEvent.click(box())
    expect(signUpProps().unsafeMetadata).toEqual({ mailingListOptIn: false })
  })

  it('toggles from its label text, not only from the box', () => {
    render(<SignUpWithOptIn />)

    fireEvent.click(screen.getByText(MAILING_LIST_OPT_IN_LABEL))

    expect(box()).toBeChecked()
  })

  it('keeps the routing props the in-app sign-up depends on (#96)', () => {
    render(<SignUpWithOptIn />)

    expect(signUpProps()).toMatchObject({
      path: '/sign-up',
      routing: 'path',
      signInUrl: '/sign-in',
    })
  })

  it('hides the box on the later steps, where ticking it could no longer reach Clerk, and keeps the choice', () => {
    const { rerender } = render(<SignUpWithOptIn />)
    fireEvent.click(box())

    setPathname('/sign-up/verify-email-address')
    rerender(<SignUpWithOptIn />)

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(signUpProps().unsafeMetadata).toEqual({ mailingListOptIn: true })

    setPathname('/sign-up')
    rerender(<SignUpWithOptIn />)
    expect(box()).toBeChecked()
  })
})
