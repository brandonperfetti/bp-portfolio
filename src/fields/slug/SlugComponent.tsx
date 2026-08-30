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
    : 'Set by hand. It locks to this URL when the document is first published.'
}

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
      />

      <p className="slug-field-description">
        {slugFieldDescription(Boolean(hasPublishedDoc), locked)}
      </p>
    </div>
  )
}
