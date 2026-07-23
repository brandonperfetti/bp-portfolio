'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ChevronDown, GitBranch } from 'lucide-react'
import { useId, useState } from 'react'

import { Card } from '@/components/Card'
import { HoverMotionCard } from '@/components/motion/HoverMotionCard'
import LinkIcon from '@/icons/LinkIcon'
import type { CmsEntityItem } from '@/lib/cms/types'
import type { TechSignalSummary } from '@/lib/tech/githubSignals'
import { getOptimizedImageUrl } from '@/lib/image-utils'
import { getExternalLinkProps } from '@/lib/link-utils'

const PROFICIENCY_LABELS: Record<string, string> = {
  daily: 'Daily driver',
  proficient: 'Proficient',
  familiar: 'Familiar',
  exploring: 'Exploring',
}

const REASON_LABELS: Record<string, string> = {
  'primary-language': 'primary language',
  'language-breakdown': 'language mix',
  topic: 'repo topics',
  package: 'package manifests',
  'tooling-file': 'tooling files',
}

/**
 * Compact five-segment activity meter for a GitHub signal's relative
 * intensity. Purely decorative — the adjacent text carries the information.
 */
function SignalMeter({ intensity }: { intensity: number }) {
  const litSegments = Math.max(1, Math.round(intensity * 5))
  return (
    <span aria-hidden="true" className="flex items-end gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`w-1 rounded-full ${
            i < litSegments
              ? 'bg-teal-500 dark:bg-teal-400'
              : 'bg-zinc-200 dark:bg-zinc-700'
          }`}
          style={{ height: `${4 + i * 2}px` }}
        />
      ))}
    </span>
  )
}

/**
 * Shared card for the /tech and /uses visualizations (wow moment #3).
 *
 * Renders logo, name, description, category/proficiency chips, an optional
 * live GitHub activity badge, and a keyboard-operable expandable detail
 * section listing the scan evidence. Motion comes from the wrapping
 * `HoverMotionCard` (already reduced-motion aware); the expand/collapse uses
 * a `motion-safe` CSS grid transition so reduced-motion users get an instant
 * toggle.
 *
 * @param item CMS entity row (tech or uses).
 * @param signal Live GitHub signal summary for this item, when available.
 */
export function TechCard({
  item,
  signal,
}: {
  item: CmsEntityItem
  signal?: TechSignalSummary
}) {
  const [expanded, setExpanded] = useState(false)
  const detailId = useId()
  const proficiencyLabel = item.proficiency
    ? PROFICIENCY_LABELS[item.proficiency] || item.proficiency
    : null
  const hasDetails = Boolean(signal)

  return (
    <HoverMotionCard as="li">
      <Card className="h-full rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm dark:border-zinc-700/40 dark:bg-zinc-900">
        {item.link?.href ? (
          <>
            <div
              data-hover-overlay
              className="absolute inset-0 z-0 rounded-2xl bg-zinc-50 opacity-0 transition dark:bg-zinc-800/40"
            />
            <Link
              href={item.link.href}
              {...getExternalLinkProps(item.link.href)}
              aria-label={`Open technology: ${item.name}`}
              className="absolute inset-0 z-10 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/70 dark:focus-visible:ring-teal-400/70"
            />
          </>
        ) : null}

        <div className="pointer-events-none relative z-20 flex items-start justify-between">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-md ring-1 shadow-zinc-800/5 ring-zinc-900/5 dark:border dark:border-zinc-700/50 dark:bg-zinc-800 dark:ring-0">
            {item.logo ? (
              <Image
                height={48}
                width={48}
                src={getOptimizedImageUrl(item.logo, {
                  width: 96,
                  height: 96,
                  crop: 'fit',
                })}
                alt={item.name}
                className="h-8 w-8 rounded object-contain"
                sizes="2rem"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-8 w-8 items-center justify-center rounded bg-zinc-100 text-sm font-semibold text-zinc-600 uppercase dark:bg-zinc-700/70 dark:text-zinc-200"
              >
                {item.name.charAt(0)}
              </span>
            )}
          </div>
          {signal ? (
            <span
              className="mt-1 flex items-center gap-1.5 rounded-full bg-teal-50 px-2 py-1 text-[11px] font-medium text-teal-700 dark:bg-teal-950/50 dark:text-teal-300"
              title={`Active in ${signal.repoCount} recent ${signal.repoCount === 1 ? 'repo' : 'repos'} on GitHub`}
            >
              <SignalMeter intensity={signal.intensity} />
              <span>
                {signal.repoCount} {signal.repoCount === 1 ? 'repo' : 'repos'}
              </span>
            </span>
          ) : null}
        </div>

        <h2 className="pointer-events-none relative z-20 mt-6 text-base font-semibold text-zinc-800 dark:text-zinc-100">
          {item.name}
        </h2>
        <p className="pointer-events-none relative z-20 mt-2 line-clamp-4 text-sm text-zinc-600 dark:text-zinc-400">
          {item.description}
        </p>

        <div className="pointer-events-none relative z-20 mt-4 flex flex-wrap items-center gap-2 text-xs">
          {item.category ? (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {item.category}
            </span>
          ) : null}
          {proficiencyLabel ? (
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
              {proficiencyLabel}
            </span>
          ) : null}
        </div>

        {item.link?.label ? (
          <p className="pointer-events-none relative z-20 mt-4 flex text-sm font-medium text-zinc-500 dark:text-zinc-200">
            <LinkIcon data-hover-icon className="h-6 w-6 flex-none" />
            <span className="ml-2">{item.link.label}</span>
          </p>
        ) : null}

        {hasDetails ? (
          <div className="relative z-20 mt-4">
            <button
              type="button"
              onClick={() => setExpanded((current) => !current)}
              aria-expanded={expanded}
              aria-controls={detailId}
              className="flex items-center gap-1 rounded text-xs font-medium text-zinc-500 transition hover:text-teal-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/70 dark:text-zinc-400 dark:hover:text-teal-400 dark:focus-visible:ring-teal-400/70"
            >
              <ChevronDown
                aria-hidden
                className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${
                  expanded ? 'rotate-180' : ''
                }`}
              />
              {expanded ? 'Hide GitHub activity' : 'GitHub activity'}
            </button>
            <div
              id={detailId}
              className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
                expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
              }`}
            >
              <div className="overflow-hidden">
                {signal ? (
                  <div className="pt-3 text-xs text-zinc-600 dark:text-zinc-400">
                    <p className="flex items-center gap-1.5">
                      <GitBranch
                        aria-hidden
                        className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400"
                      />
                      Seen in {signal.repoCount} recently active{' '}
                      {signal.repoCount === 1 ? 'repo' : 'repos'} (signal score{' '}
                      {signal.score}).
                    </p>
                    <p className="mt-1.5">
                      Evidence:{' '}
                      {signal.reasons
                        .map((reason) => REASON_LABELS[reason] || reason)
                        .join(', ')}
                      .
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </Card>
    </HoverMotionCard>
  )
}
