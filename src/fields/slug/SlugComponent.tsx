'use client'

import React, { useCallback, useEffect } from 'react'
import { TextFieldClientProps } from 'payload'

import {
  useField,
  Button,
  TextInput,
  FieldLabel,
  useDocumentInfo,
  useFormFields,
  useForm,
} from '@payloadcms/ui'

import './index.scss'

type SlugComponentProps = {
  fieldToUse: string
  checkboxFieldPath: string
} & TextFieldClientProps

/**
 * The sentence shown under the slug input. Four states, each describing what
 * will actually happen on save — the old UI said only "Unlock"/"Lock", which
 * is what let an editor read "locked" as "frozen" when it meant "tracks the
 * title" (#120).
 *
 * The two unlocked sentences both say the slug stays editable, because it
 * does: `enforceSlugFreeze` returns early on `lock === false`, so an unlocked
 * slug is never frozen — not at first publish, not afterwards. The pre-publish
 * one used to promise a lock at publish that never happens, which is the
 * opposite of what the editor would then observe.
 *
 * @param hasPublishedDoc - Whether a published version of this document exists.
 * @param locked - Current `slugLock` value.
 */
export const slugFieldDescription = (
  hasPublishedDoc: boolean,
  locked: boolean,
): string => {
  if (hasPublishedDoc) {
    return locked
      ? 'Locked to the published URL. Editing the title will not move it. Unlock to rename — the old URL keeps working via an automatic redirect.'
      : 'Unlocked. Saving a different slug moves the published URL, and the old one will redirect here.'
  }
  return locked
    ? 'Generated from the title. It locks to this URL when the document is first published.'
    : 'Set by hand. It stays editable after publish — a later rename moves the URL and redirects the old one here.'
}

/**
 * The `htmlAttributes` bag that points the slug input at its description.
 *
 * @param descriptionId - The `id` of the paragraph describing the field.
 * @returns Props to spread onto `TextInput`'s underlying `<input>`.
 *
 * @remarks Exists because `@payloadcms/ui`'s `TextInput` does NOT associate a
 * description with its input. Measured against the pinned
 * `@payloadcms/ui@3.86.0` dist: `dist/fields/Text/Input.js` renders the
 * `<input>` with `data-rtl`, `disabled`, `id`, `name`, `onChange`, `onKeyDown`,
 * `placeholder`, `ref`, `type` and `value`, then spreads
 * `...(htmlAttributes ?? {})` — and emits no `aria-describedby` anywhere. Its
 * `description` prop is forwarded only to `FieldDescription`, whose
 * `dist/fields/FieldDescription/index.js` renders a bare `<div>` with a class
 * and no `id`, so there is nothing to point at even when that prop is used.
 * (The only `aria-describedby` in the package's client bundle belongs to
 * `react-select`'s live region.) This component sidesteps `description`
 * entirely and renders its own `<p>`, so without this the four-state sentence
 * that `slugFieldDescription` computes — the whole point of #120 — is visible
 * to sighted editors and silent to a screen reader on the input.
 *
 * The cast is the honest part. `htmlAttributes` is TYPED as
 * `{ autoComplete?: … }` only, but is SPREAD wholesale onto the `<input>` at
 * runtime, and last, so it can carry any attribute; the declared type is
 * narrower than the implementation. Casting here confines that one mismatch
 * to a documented helper instead of scattering it at the call site.
 */
const describedByDescription = (
  descriptionId: string,
): React.ComponentProps<typeof TextInput>['htmlAttributes'] =>
  ({ 'aria-describedby': descriptionId }) as React.ComponentProps<
    typeof TextInput
  >['htmlAttributes']

/**
 * Admin slug input with a lock toggle.
 *
 * @remarks `slugLock` means "I do not hand-edit this slug" (see
 * `src/fields/slug/index.ts`). Before first publish that means the slug is
 * derived from `fieldToUse`; once a published version exists it means the slug
 * is frozen, so this component stops re-deriving — otherwise it would show the
 * editor a value that `enforceSlugFreeze` is going to revert on save.
 *
 * The server hook is the enforcement point; everything here is presentation.
 * `hasPublishedDoc` comes from `useDocumentInfo()` rather than the form's
 * `_status` field because `_status` flips to `'draft'` as soon as autosave
 * writes a version, which would wrongly resume title-tracking mid-edit on a
 * live document.
 */
export const SlugComponent: React.FC<SlugComponentProps> = ({
  field,
  fieldToUse,
  checkboxFieldPath: checkboxFieldPathFromProps,
  path,
  readOnly: readOnlyFromProps,
}) => {
  const { label } = field

  const checkboxFieldPath = path?.includes('.')
    ? `${path}.${checkboxFieldPathFromProps}`
    : checkboxFieldPathFromProps

  const { value, setValue } = useField<string>({ path: path || field.name })

  const { dispatchFields } = useForm()
  const { hasPublishedDoc } = useDocumentInfo()

  const checkboxValue = useFormFields(([fields]) => {
    return fields[checkboxFieldPath]?.value as string
  })

  const targetFieldValue = useFormFields(([fields]) => {
    return fields[fieldToUse]?.value as string
  })

  useEffect(() => {
    // Once published, the slug is frozen — never re-derive it from the title.
    if (hasPublishedDoc) return

    if (checkboxValue) {
      if (targetFieldValue) {
        const formattedSlug = targetFieldValue
          .replace(/ /g, '-')
          .replace(/[^\w-]+/g, '')
          .toLowerCase()

        if (value !== formattedSlug) setValue(formattedSlug)
      } else {
        if (value !== '') setValue('')
      }
    }
  }, [targetFieldValue, checkboxValue, setValue, value, hasPublishedDoc])

  const handleLock = useCallback(
    (e: React.MouseEvent<Element>) => {
      e.preventDefault()

      dispatchFields({
        type: 'UPDATE',
        path: checkboxFieldPath,
        value: !checkboxValue,
      })
    },
    [checkboxValue, checkboxFieldPath, dispatchFields],
  )

  const locked = Boolean(checkboxValue)
  const readOnly = readOnlyFromProps || locked
  // Derived from the field path, not `useId`, so it matches the id scheme
  // `TextInput` already uses for the input itself (`field-${path}` with dots
  // flattened) and stays unique when two slug fields share a form.
  const descriptionId = `field-${(path || field.name).replace(/\./g, '__')}-description`

  return (
    <div className="field-type slug-field-component">
      <div className="label-wrapper">
        <FieldLabel htmlFor={`field-${path}`} label={label} />

        <Button className="lock-button" buttonStyle="none" onClick={handleLock}>
          {locked ? 'Unlock' : 'Lock'}
        </Button>
      </div>

      <TextInput
        value={value}
        onChange={setValue}
        path={path || field.name}
        readOnly={Boolean(readOnly)}
        htmlAttributes={describedByDescription(descriptionId)}
      />

      <p className="slug-field-description" id={descriptionId}>
        {slugFieldDescription(Boolean(hasPublishedDoc), locked)}
      </p>
    </div>
  )
}
