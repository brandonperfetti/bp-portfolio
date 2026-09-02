import { render, screen } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  dispatchFields: vi.fn(),
  formFields: {} as Record<string, { value: unknown }>,
  hasPublishedDoc: { value: false },
  setValue: vi.fn(),
  value: { current: '' as string },
}))

/**
 * `@payloadcms/ui` is an admin-only ESM package that expects a Payload provider
 * tree (form state, document info, i18n) — mounting the real one in jsdom is
 * not viable, and the repo has no admin Playwright suite to host a real-browser
 * check. So the hooks are mocked and this stays a Vitest component test, which
 * is what `docs/TESTING.md` prescribes for logic in a client component.
 */
vi.mock('@payloadcms/ui', () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: React.ReactNode
    onClick: (e: unknown) => void
  }) => (
    <button onClick={onClick} type="button">
      {children}
    </button>
  ),
  FieldLabel: ({ label }: { label: string }) => <span>{label}</span>,
  TextInput: ({ readOnly, value }: { readOnly?: boolean; value?: string }) => (
    <input readOnly={readOnly} value={value ?? ''} onChange={() => {}} />
  ),
  useDocumentInfo: () => ({ hasPublishedDoc: mocks.hasPublishedDoc.value }),
  useField: () => ({ setValue: mocks.setValue, value: mocks.value.current }),
  useForm: () => ({ dispatchFields: mocks.dispatchFields }),
  useFormFields: (
    selector: (state: [Record<string, { value: unknown }>]) => unknown,
  ) => selector([mocks.formFields]),
}))

vi.mock('./index.scss', () => ({}))

import { SlugComponent, slugFieldDescription } from './SlugComponent'

/** The subset of `TextFieldClientProps` this component actually reads. */
const slugProps = {
  checkboxFieldPath: 'slugLock',
  field: { name: 'slug', type: 'text', label: 'Slug' },
  fieldToUse: 'title',
  path: 'slug',
} as unknown as React.ComponentProps<typeof SlugComponent>

const renderSlug = () => render(<SlugComponent {...slugProps} />)

describe('slugFieldDescription', () => {
  it('tells a published editor that the title will not move the URL', () => {
    expect(slugFieldDescription(true, true)).toMatch(
      /Locked to the published URL/,
    )
    expect(slugFieldDescription(true, true)).toMatch(/automatic redirect/)
  })

  it('warns that an unlocked published slug moves the URL', () => {
    expect(slugFieldDescription(true, false)).toMatch(/moves the published URL/)
  })

  it('says a pre-publish locked slug is generated from the title', () => {
    expect(slugFieldDescription(false, true)).toMatch(
      /Generated from the title/,
    )
  })

  it('never claims a draft is locked to a published URL', () => {
    expect(slugFieldDescription(false, false)).not.toMatch(/published URL/)
  })

  it('does not promise a pre-publish unlocked slug a lock it never gets', () => {
    // `enforceSlugFreeze` returns early on `lock === false`, so an unlocked
    // slug is never frozen — not at first publish, not after. The old sentence
    // said it locked at publish, which is the one thing this state does not
    // do, and the editor would only find out by renaming and watching the URL
    // move. Asserted as an absence plus the replacement claim, so restoring
    // the old copy fails here rather than passing on a substring.
    const description = slugFieldDescription(false, false)
    expect(description).not.toMatch(/locks? to this URL/i)
    expect(description).toMatch(/stays editable/)
    // Consistent with the post-publish unlocked sentence, which already says
    // the old URL redirects.
    expect(description).toMatch(/redirect/)
    expect(slugFieldDescription(true, false)).toMatch(/redirect/)
  })
})

describe('SlugComponent', () => {
  beforeEach(() => {
    mocks.setValue.mockClear()
    mocks.dispatchFields.mockClear()
    mocks.value.current = 'runbooks-to-agent-skills'
    mocks.formFields = {
      slugLock: { value: true },
      title: { value: 'A brand new title' },
    }
    mocks.hasPublishedDoc.value = false
  })

  it('does NOT re-derive the slug once the document is published (#120)', () => {
    mocks.hasPublishedDoc.value = true

    renderSlug()

    expect(mocks.setValue).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox')).toHaveValue('runbooks-to-agent-skills')
  })

  it('still derives from the title before first publish', () => {
    renderSlug()

    expect(mocks.setValue).toHaveBeenCalledWith('a-brand-new-title')
  })

  it('leaves an unlocked draft slug alone', () => {
    mocks.formFields.slugLock = { value: false }

    renderSlug()

    expect(mocks.setValue).not.toHaveBeenCalled()
  })

  it('keeps a locked input read-only and offers Unlock', () => {
    mocks.hasPublishedDoc.value = true

    renderSlug()

    expect(screen.getByRole('textbox')).toHaveAttribute('readonly')
    expect(screen.getByRole('button')).toHaveTextContent('Unlock')
  })

  it('shows the frozen-URL explanation on a published document', () => {
    mocks.hasPublishedDoc.value = true

    renderSlug()

    expect(screen.getByText(/Locked to the published URL/)).toBeInTheDocument()
  })
})
