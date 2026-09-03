import { render, screen } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  collectionSlug: { value: 'pages' as string | undefined },
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
  // `htmlAttributes` is spread onto the `<input>`, and spread LAST, because
  // that is what the pinned `@payloadcms/ui@3.86.0` dist does
  // (`dist/fields/Text/Input.js`: `...(htmlAttributes ?? {})` after every
  // built-in attribute). A mock that dropped it would let the a11y assertion
  // below pass against a component that never wired anything up.
  TextInput: ({
    htmlAttributes,
    readOnly,
    value,
  }: {
    htmlAttributes?: Record<string, string>
    readOnly?: boolean
    value?: string
  }) => (
    <input
      readOnly={readOnly}
      value={value ?? ''}
      onChange={() => {}}
      {...(htmlAttributes ?? {})}
    />
  ),
  useDocumentInfo: () => ({
    collectionSlug: mocks.collectionSlug.value,
    hasPublishedDoc: mocks.hasPublishedDoc.value,
  }),
  useField: () => ({ setValue: mocks.setValue, value: mocks.value.current }),
  useForm: () => ({ dispatchFields: mocks.dispatchFields }),
  useFormFields: (
    selector: (state: [Record<string, { value: unknown }>]) => unknown,
  ) => selector([mocks.formFields]),
}))

vi.mock('./index.scss', () => ({}))

import {
  SlugComponent,
  resolvedPublicPath,
  slugFieldDescription,
} from './SlugComponent'

/** The subset of `TextFieldClientProps` this component actually reads. */
const slugProps = {
  checkboxFieldPath: 'slugLock',
  field: { name: 'slug', type: 'text', label: 'Slug' },
  fieldToUse: 'title',
  path: 'slug',
} as unknown as React.ComponentProps<typeof SlugComponent>

const renderSlug = (
  overrides: Partial<React.ComponentProps<typeof SlugComponent>> = {},
) => render(<SlugComponent {...slugProps} {...overrides} />)

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

describe('resolvedPublicPath', () => {
  it('resolves a new top-level page from its slug alone', () => {
    expect(resolvedPublicPath('pages', undefined, 'colophon')).toBe('/colophon')
  })

  it('keeps the ancestor prefix when a placed page is re-slugged', () => {
    // The whole point: an editor renaming `brytecore` must see the URL that
    // will actually move, not the bare slug (#120's lesson, #148's fix).
    expect(resolvedPublicPath('pages', 'work/brytecore', 'brytecore-inc')).toBe(
      '/work/brytecore-inc',
    )
  })

  it('resolves a depth-3 page', () => {
    expect(resolvedPublicPath('pages', 'a/b/c', 'c2')).toBe('/a/b/c2')
  })

  it('shows the site root as /', () => {
    expect(resolvedPublicPath('pages', 'home', 'home')).toBe('/')
  })

  it('shows an unplaced post under /articles', () => {
    expect(resolvedPublicPath('posts', undefined, 'hello-world')).toBe(
      '/articles/hello-world',
    )
    // Null and empty stored paths are the same state — unplaced — and must not
    // be synthesised into `path: slug`, which would read as `/hello-world`.
    expect(resolvedPublicPath('posts', null, 'hello-world')).toBe(
      '/articles/hello-world',
    )
    expect(resolvedPublicPath('posts', '', 'hello-world')).toBe(
      '/articles/hello-world',
    )
  })

  it('shows a PLACED post at its section path (#153)', () => {
    expect(resolvedPublicPath('posts', 'work/brytecore', 'brytecore')).toBe(
      '/work/brytecore',
    )
  })

  it('keeps the section prefix when a placed post is re-slugged', () => {
    expect(resolvedPublicPath('posts', 'work/brytecore', 'brytecore-inc')).toBe(
      '/work/brytecore-inc',
    )
  })

  it('shows nothing for a collection with no public URL, or with no slug yet', () => {
    expect(resolvedPublicPath('categories', undefined, 'ai')).toBeNull()
    expect(resolvedPublicPath('pages', 'work', '')).toBeNull()
    expect(resolvedPublicPath(undefined, 'work', 'x')).toBeNull()
  })
})

describe('SlugComponent', () => {
  beforeEach(() => {
    mocks.setValue.mockClear()
    mocks.dispatchFields.mockClear()
    mocks.collectionSlug.value = 'pages'
    mocks.value.current = 'runbooks-to-agent-skills'
    mocks.formFields = {
      slugLock: { value: true },
      title: { value: 'A brand new title' },
    }
    mocks.hasPublishedDoc.value = false
  })

  it('shows the resolved full public path, not the bare slug', () => {
    mocks.value.current = 'brytecore'
    mocks.formFields.path = { value: 'work/brytecore' }

    renderSlug()

    expect(screen.getByText('/work/brytecore')).toBeInTheDocument()
  })

  it('puts the resolved path inside the description the input points at', () => {
    // Sighted-only would repeat the #120 defect this component exists to fix.
    mocks.value.current = 'brytecore'
    mocks.formFields.path = { value: 'work/brytecore' }

    renderSlug()

    const describedBy = screen
      .getByRole('textbox')
      .getAttribute('aria-describedby')

    expect(document.getElementById(describedBy as string)).toHaveTextContent(
      /Served at \/work\/brytecore/,
    )
  })

  it('omits the path line for a collection with no public URL', () => {
    mocks.collectionSlug.value = 'categories'

    renderSlug()

    expect(screen.queryByText(/Served at/)).not.toBeInTheDocument()
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

  it('associates the description with the input for a screen reader', () => {
    // `TextInput` wires no `aria-describedby` of its own (measured against the
    // pinned dist), and this component renders its own `<p>` rather than using
    // the `description` prop — so without the explicit association the
    // four-state sentence is visible and silent. Assert the pointer AND its
    // target, since a dangling id reads as no description at all.
    mocks.hasPublishedDoc.value = true

    renderSlug()

    const describedBy = screen
      .getByRole('textbox')
      .getAttribute('aria-describedby')

    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy as string)).toHaveTextContent(
      /Locked to the published URL/,
    )
  })

  it('scopes the description id to the field path', () => {
    // Two slug fields in one form must not collide on the id, so the id has
    // to FOLLOW the path — a hardcoded 'field-slug-description' would pass a
    // default-path render and still collide. A nested path also exercises the
    // dot-to-underscore fold, because a dot inside an id is legal HTML but a
    // trap for any querySelector('#…') that meets it unescaped.
    renderSlug({
      path: 'meta.slug',
    } as Partial<React.ComponentProps<typeof SlugComponent>>)

    const describedBy = screen
      .getByRole('textbox')
      .getAttribute('aria-describedby')
    expect(describedBy).toBe('field-meta__slug-description')
    expect(document.getElementById('field-meta__slug-description')).toBeTruthy()
  })
})
