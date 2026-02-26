import type {
  NotionBlock,
  NotionBlockChildrenResponse,
  NotionPage,
  NotionQueryResponse,
} from '@/lib/cms/notion/contracts'

import { notionRequest } from '@/lib/cms/notion/client'

export async function queryAllDataSourcePages(
  dataSourceId: string,
  body: Record<string, unknown>,
): Promise<NotionPage[]> {
  const pages: NotionPage[] = []
  let nextCursor: string | null = null

  do {
    const requestBody: Record<string, unknown> = {
      ...body,
      page_size: 100,
    }

    if (nextCursor) {
      requestBody.start_cursor = nextCursor
    }

    const response: NotionQueryResponse =
      await notionRequest<NotionQueryResponse>(
        `/data_sources/${dataSourceId}/query`,
        {
          method: 'POST',
          body: requestBody,
        },
      )

    pages.push(...response.results)
    nextCursor = response.has_more ? response.next_cursor : null
  } while (nextCursor)

  return pages
}

export async function listAllBlockChildren(
  blockId: string,
): Promise<NotionBlock[]> {
  const blocks: NotionBlock[] = []
  let nextCursor: string | null = null

  do {
    const encodedCursor = nextCursor ? encodeURIComponent(nextCursor) : null
    const response: NotionBlockChildrenResponse =
      await notionRequest<NotionBlockChildrenResponse>(
        `/blocks/${blockId}/children?page_size=100${encodedCursor ? `&start_cursor=${encodedCursor}` : ''}`,
        {
          method: 'GET',
        },
      )

    blocks.push(...response.results)
    nextCursor = response.has_more ? response.next_cursor : null
  } while (nextCursor)

  return blocks
}
