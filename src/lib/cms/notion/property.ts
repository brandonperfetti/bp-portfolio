import type { NotionProperty, NotionRichText } from '@/lib/cms/notion/contracts'

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function firstDefined<T>(values: Array<T | undefined>): T | undefined {
  for (const value of values) {
    if (value !== undefined) {
      return value
    }
  }

  return undefined
}

export function getProperty(
  properties: Record<string, NotionProperty>,
  names: string[],
): NotionProperty | undefined {
  const keyByNormalizedName = new Map<string, NotionProperty>()

  for (const [name, property] of Object.entries(properties)) {
    keyByNormalizedName.set(normalizeName(name), property)
  }

  return firstDefined(
    names.map((name) => keyByNormalizedName.get(normalizeName(name))),
  )
}

export function richTextToPlainText(
  values: NotionRichText[] | undefined,
): string {
  return (values ?? [])
    .map((value) => value.plain_text ?? value.text?.content ?? '')
    .join('')
    .trim()
}

export function propertyToText(property: NotionProperty | undefined): string {
  if (!property) {
    return ''
  }

  if (property.type === 'title') {
    return richTextToPlainText(property.title)
  }

  if (property.type === 'rich_text') {
    return richTextToPlainText(property.rich_text)
  }

  if (property.type === 'status') {
    return property.status?.name?.trim() ?? ''
  }

  if (property.type === 'select') {
    return property.select?.name?.trim() ?? ''
  }

  if (property.type === 'url') {
    return property.url?.trim() ?? ''
  }

  if (property.type === 'email') {
    return property.email?.trim() ?? ''
  }

  if (property.type === 'phone_number') {
    return property.phone_number?.trim() ?? ''
  }

  if (property.type === 'formula') {
    if (property.formula?.type === 'string') {
      return property.formula.string?.trim() ?? ''
    }

    if (property.formula?.type === 'number') {
      return String(property.formula.number ?? '')
    }

    if (property.formula?.type === 'boolean') {
      return String(Boolean(property.formula.boolean))
    }
  }

  if (property.type === 'number') {
    return property.number === null || property.number === undefined
      ? ''
      : String(property.number)
  }

  return ''
}

export function propertyToNumber(
  property: NotionProperty | undefined,
): number | undefined {
  if (!property) {
    return undefined
  }

  if (property.type === 'number') {
    return property.number ?? undefined
  }

  if (property.type === 'formula' && property.formula?.type === 'number') {
    return property.formula.number ?? undefined
  }

  const asText = propertyToText(property)
  const parsed = Number(asText)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function propertyToBoolean(
  property: NotionProperty | undefined,
): boolean | undefined {
  if (!property) {
    return undefined
  }

  if (property.type === 'checkbox') {
    return property.checkbox
  }

  if (property.type === 'formula' && property.formula?.type === 'boolean') {
    return property.formula.boolean ?? undefined
  }

  const asText = propertyToText(property).toLowerCase()
  if (asText === 'true') {
    return true
  }

  if (asText === 'false') {
    return false
  }

  return undefined
}

export function propertyToDate(property: NotionProperty | undefined): string {
  if (!property) {
    return ''
  }

  if (property.type === 'date') {
    return property.date?.start?.trim() ?? ''
  }

  if (property.type === 'formula' && property.formula?.type === 'date') {
    return property.formula.date?.start?.trim() ?? ''
  }

  return ''
}

export function propertyToMultiSelect(
  property: NotionProperty | undefined,
): string[] {
  if (!property || property.type !== 'multi_select') {
    return []
  }

  return (
    property.multi_select
      ?.map((value) => value.name?.trim())
      .filter((value): value is string => Boolean(value)) ?? []
  )
}

export function propertyToRelationIds(
  property: NotionProperty | undefined,
): string[] {
  if (!property || property.type !== 'relation') {
    return []
  }

  return (
    property.relation
      ?.map((entry) => entry.id?.trim())
      .filter((id): id is string => typeof id === 'string' && id.length > 0) ??
    []
  )
}

export function propertyToFileUrl(
  property: NotionProperty | undefined,
): string {
  if (!property || property.type !== 'files') {
    return ''
  }

  for (const file of property.files ?? []) {
    if (file.type === 'external' && file.external?.url) {
      return file.external.url
    }

    if (file.type === 'file' && file.file?.url) {
      return file.file.url
    }
  }

  return ''
}

export function propertyToFileUrls(
  property: NotionProperty | undefined,
): string[] {
  if (!property || property.type !== 'files') {
    return []
  }

  const urls: string[] = []
  for (const file of property.files ?? []) {
    if (file.type === 'external' && file.external?.url) {
      urls.push(file.external.url)
    } else if (file.type === 'file' && file.file?.url) {
      urls.push(file.file.url)
    }
  }

  return urls
}
