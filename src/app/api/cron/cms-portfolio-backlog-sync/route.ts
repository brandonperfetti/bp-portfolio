import { NextResponse } from 'next/server'

import { isAuthorizedCronRequest } from '@/app/api/cron/_auth'
import { logAutomationErrorToNotion } from '@/lib/cms/notion/automationErrorLog'
import { runPortfolioBacklogSync } from '@/lib/cms/notion/portfolioBacklogSync'

// Accepts body.writeFile, legacy body.write, or ?write= for compatibility with
// existing scripts and ad-hoc curl usage.
function parseWriteParam(
  body: Record<string, unknown>,
  searchParams: URLSearchParams,
) {
  if (typeof body.writeFile === 'boolean') {
    return body.writeFile
  }
  if (typeof body.write === 'boolean') {
    return body.write
  }

  const raw = searchParams.get('write')?.trim().toLowerCase()
  if (raw === '1' || raw === 'true') {
    return true
  }
  if (raw === '0' || raw === 'false') {
    return false
  }

  return false
}

async function run(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  try {
    const url = new URL(request.url)
    const body =
      request.method === 'POST'
        ? ((await request.json().catch(() => ({}))) as Record<string, unknown>)
        : {}
    const writeFile = parseWriteParam(body, url.searchParams)

    const result = await runPortfolioBacklogSync({ writeFile })

    if (!result.ok) {
      await logAutomationErrorToNotion({
        workflow: 'portfolio-backlog-sync',
        endpoint: '/api/cron/cms-portfolio-backlog-sync',
        error: `Backlog sync completed with ${result.errors.length} error(s)`,
        details: result,
      }).catch((logError) => {
        console.error(
          '[portfolio-backlog-sync] failed to write Notion error log',
          {
            error:
              logError instanceof Error ? logError.message : String(logError),
          },
        )
      })
    }

    return NextResponse.json(result, { status: result.ok ? 200 : 500 })
  } catch (error) {
    await logAutomationErrorToNotion({
      workflow: 'portfolio-backlog-sync',
      endpoint: '/api/cron/cms-portfolio-backlog-sync',
      error: error instanceof Error ? error.message : 'Unknown error',
    }).catch((logError) => {
      console.error(
        '[portfolio-backlog-sync] failed to write Notion error log',
        {
          error:
            logError instanceof Error ? logError.message : String(logError),
        },
      )
    })

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}

export async function GET(request: Request) {
  return run(request)
}

export async function POST(request: Request) {
  return run(request)
}
