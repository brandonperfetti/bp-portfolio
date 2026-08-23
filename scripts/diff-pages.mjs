#!/usr/bin/env node
/**
 * Screenshot-diff harness for the page-parity gate (#24).
 *
 * Captures two URLs at two widths, reports the share of differing pixels, and
 * exits nonzero when any width is above the threshold. It is an on-demand
 * tool, deliberately **not** wired into CI.
 *
 * ## Usage
 *
 * ```
 * pnpm diff:pages <baseline-url> <candidate-url> [options]
 * ```
 *
 * | Option              | Default                   | Meaning                                            |
 * | ------------------- | ------------------------- | -------------------------------------------------- |
 * | `--threshold=`      | `0.1`                     | Max differing pixels, in percent, per width         |
 * | `--pixel-threshold=`| `0.1`                     | Per-pixel colour tolerance, 0–1 (anti-aliasing)     |
 * | `--widths=`         | `1440x900,390x844`        | `WxH` pairs to capture at                           |
 * | `--out=`            | `test-results/diff-pages` | Where the PNGs and `report.json` land               |
 * | `--mask=`           | none                      | Comma-separated CSS selectors to paint over         |
 * | `--timeout=`        | `30000`                   | Per-navigation timeout, ms                          |
 * | `--no-prescroll`    | off                       | Skip the scroll-through that settles lazy content   |
 *
 * ## How the migration tickets invoke it
 *
 * The Home and About migrations compare the **production route** against the
 * **CMS draft preview** of the page that is meant to replace it:
 *
 * ```
 * pnpm diff:pages https://<site>/ https://<staging>/<slug>?draft=true
 * ```
 *
 * The baseline is always the hard-coded route that still ships; the candidate
 * is always the page-builder version. The route only flips once this exits 0.
 * The homepage carries the shader hero, which cannot be frozen into an
 * identical frame — mask it:
 *
 * ```
 * pnpm diff:pages https://<site>/ https://<staging>/home?draft=true --mask="canvas"
 * ```
 *
 * ## Staging protection
 *
 * A protected Vercel deployment needs a bypass secret. Provide it as the
 * environment variable named by `BYPASS_TOKEN_ENV` in `lib/page-diff.mjs`
 * (currently `VERCEL_AUTOMATION_BYPASS_SECRET`) — it is sent as a request
 * header, never appended to the URL. `--bypass-token=` exists for one-off
 * runs but puts the secret in your shell history; prefer the environment.
 * No secret is ever printed: URLs pass through `redactUrl` before they reach
 * the console or `report.json`.
 *
 * ## Running it
 *
 * Needs a Chromium that Playwright can launch:
 *
 * ```
 * pnpm exec playwright install chromium   # once, where browsers are absent
 * PLAYWRIGHT_EXECUTABLE_PATH=/path/to/chrome pnpm diff:pages ...   # or point at one
 * ```
 *
 * The comparison itself is browserless and unit-tested in
 * `scripts/lib/page-diff.test.ts`, so the threshold logic can be verified in
 * environments where no browser can be installed.
 *
 * ## Determinism
 *
 * Captures run with `prefers-reduced-motion: reduce`, a frozen-animation
 * stylesheet, a fixed device scale factor of 1, `networkidle`, `document.fonts.ready`,
 * and a scroll to the bottom and back so scroll-triggered and lazy content has
 * settled. Two consecutive runs against the same pair should report the same
 * percentage; if they do not, mask the region that moves.
 *
 * @module
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { chromium } from '@playwright/test'
import sharp from 'sharp'

import {
  BYPASS_HEADER,
  FREEZE_CSS,
  compareFrames,
  formatSummary,
  parseArgs,
  redactUrl,
  verdict,
} from './lib/page-diff.mjs'

/**
 * Capture one page at one viewport and return raw RGBA bytes.
 *
 * @param browser - A launched Playwright browser.
 * @param url - The page to capture.
 * @param viewport - `{ name, width, height }`.
 * @param options - The parsed run configuration.
 * @returns `{ data, width, height, png }` — raw pixels plus the PNG buffer.
 */
async function capture(browser, url, viewport, options) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    // A scale factor of 2 would double the pixel count for no extra signal,
    // and differs between machines unless pinned.
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    colorScheme: 'light',
    ...(options.bypassToken
      ? { extraHTTPHeaders: { [BYPASS_HEADER]: options.bypassToken } }
      : {}),
  })

  try {
    const page = await context.newPage()
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: options.timeout,
    })
    await page.addStyleTag({ content: FREEZE_CSS })

    if (options.prescroll) {
      await page.evaluate(async () => {
        const step = window.innerHeight
        for (let y = 0; y < document.body.scrollHeight; y += step) {
          window.scrollTo(0, y)
          await new Promise((resolve) => setTimeout(resolve, 60))
        }
        window.scrollTo(0, 0)
        await new Promise((resolve) => setTimeout(resolve, 120))
      })
      await page.waitForLoadState('networkidle')
    }

    await page.evaluate(() => document.fonts.ready)

    const png = await page.screenshot({
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      mask: options.masks.map((selector) => page.locator(selector)),
    })

    const { data, info } = await sharp(png)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    return { data, width: info.width, height: info.height, png }
  } finally {
    await context.close()
  }
}

/**
 * Run the harness.
 *
 * @returns The process exit code: 0 within threshold, 1 above it, 2 on a
 * usage or runtime error.
 */
async function main() {
  let options
  try {
    options = parseArgs(process.argv.slice(2), process.env)
  } catch (error) {
    console.error(`diff-pages: ${error.message}`)
    console.error(
      'usage: pnpm diff:pages <baseline-url> <candidate-url> [--threshold=0.1] [--mask="canvas"] [--out=dir]',
    )
    return 2
  }

  await mkdir(options.outDir, { recursive: true })

  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {}),
  })

  const comparisons = []
  try {
    for (const viewport of options.viewports) {
      const baseline = await capture(
        browser,
        options.baselineUrl,
        viewport,
        options,
      )
      const candidate = await capture(
        browser,
        options.candidateUrl,
        viewport,
        options,
      )
      const result = compareFrames(baseline, candidate, options)

      const stem = path.join(options.outDir, viewport.name)
      await writeFile(`${stem}-baseline.png`, baseline.png)
      await writeFile(`${stem}-candidate.png`, candidate.png)
      await sharp(Buffer.from(result.diff.buffer), {
        raw: { width: result.width, height: result.height, channels: 4 },
      })
        .png()
        .toFile(`${stem}-diff.png`)

      comparisons.push({
        viewport: viewport.name,
        percent: result.percent,
        differing: result.differing,
        total: result.total,
        width: result.width,
        height: result.height,
        sizeMismatch: result.sizeMismatch,
        diffImage: `${stem}-diff.png`,
      })
    }
  } finally {
    await browser.close()
  }

  const summary = {
    baselineUrl: redactUrl(options.baselineUrl),
    candidateUrl: redactUrl(options.candidateUrl),
    threshold: options.threshold,
    pixelThreshold: options.pixelThreshold,
    comparisons,
  }

  await writeFile(
    path.join(options.outDir, 'report.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
  )
  console.log(formatSummary(summary))
  console.log(`\ndiff images: ${options.outDir}`)

  return verdict(comparisons, options.threshold).exitCode
}

process.exitCode = await main()
