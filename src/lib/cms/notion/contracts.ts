export type NotionRichText = {
  plain_text?: string
  href?: string | null
  annotations?: {
    bold?: boolean
    italic?: boolean
    strikethrough?: boolean
    underline?: boolean
    code?: boolean
  }
  text?: {
    content?: string
    link?: { url?: string }
  }
}

export type NotionProperty = {
  id?: string
  type: string
  title?: NotionRichText[]
  rich_text?: NotionRichText[]
  url?: string | null
  number?: number | null
  checkbox?: boolean
  select?: { name?: string | null } | null
  status?: { name?: string | null } | null
  multi_select?: Array<{ name?: string | null }>
  relation?: Array<{ id: string }>
  date?: { start?: string | null; end?: string | null } | null
  email?: string | null
  phone_number?: string | null
  formula?: {
    type?: string
    string?: string | null
    number?: number | null
    boolean?: boolean | null
    date?: { start?: string | null; end?: string | null } | null
  }
  files?: Array<
    | { type?: 'file'; file?: { url?: string | null } }
    | { type?: 'external'; external?: { url?: string | null } }
  >
}

export type NotionPage = {
  object: 'page'
  id: string
  url?: string
  cover?: {
    type?: 'external' | 'file'
    external?: { url?: string | null }
    file?: { url?: string | null }
  } | null
  last_edited_time?: string
  archived?: boolean
  in_trash?: boolean
  properties: Record<string, NotionProperty>
}

export type NotionQueryResponse = {
  object: 'list'
  results: NotionPage[]
  has_more: boolean
  next_cursor: string | null
}

export type NotionBlock = {
  object: 'block'
  id: string
  type: string
  has_children?: boolean
  paragraph?: { rich_text?: NotionRichText[]; color?: string }
  heading_1?: { rich_text?: NotionRichText[]; color?: string }
  heading_2?: { rich_text?: NotionRichText[]; color?: string }
  heading_3?: { rich_text?: NotionRichText[]; color?: string }
  bulleted_list_item?: { rich_text?: NotionRichText[]; color?: string }
  numbered_list_item?: { rich_text?: NotionRichText[]; color?: string }
  to_do?: { rich_text?: NotionRichText[]; checked?: boolean; color?: string }
  quote?: { rich_text?: NotionRichText[]; color?: string }
  callout?: { rich_text?: NotionRichText[]; color?: string }
  code?: { rich_text?: NotionRichText[]; language?: string; caption?: NotionRichText[] }
  divider?: Record<string, never>
  image?: {
    type?: 'external' | 'file'
    external?: { url?: string }
    file?: { url?: string }
    caption?: NotionRichText[]
  }
  bookmark?: { url?: string; caption?: NotionRichText[] }
  embed?: { url?: string }
  video?: {
    type?: 'external' | 'file'
    external?: { url?: string }
    file?: { url?: string }
    caption?: NotionRichText[]
  }
  child_page?: { title?: string }
}

export type NotionBlockChildrenResponse = {
  object: 'list'
  results: NotionBlock[]
  has_more: boolean
  next_cursor: string | null
}
