'use client'

import { useRowLabel } from '@payloadcms/ui'

import {
  COLUMN_SIZE_LABELS,
  DEFAULT_COLUMN_SIZE,
  type ColumnSize,
} from '@/blocks/Column/sizes'

type ColumnRowData = {
  blockName?: null | string
  size?: ColumnSize | null
}

/**
 * Admin row label for a `column` block: shows the column's width so a
 * collapsed container reads as a layout ("01 · Column — Two Thirds") rather
 * than a stack of identical rows.
 *
 * @remarks Replaces Payload's default block header label, so it re-creates
 * the row number itself; an editor-supplied block name wins over the
 * generic "Column" wording. Registered by path on the block config, which
 * is what `pnpm generate:importmap` picks up.
 */
export function ColumnRowLabel() {
  const { data, rowNumber } = useRowLabel<ColumnRowData>()

  const number = String((rowNumber ?? 0) + 1).padStart(2, '0')
  const name = data?.blockName?.trim() || 'Column'
  const size =
    COLUMN_SIZE_LABELS[data?.size as ColumnSize] ??
    COLUMN_SIZE_LABELS[DEFAULT_COLUMN_SIZE]

  return (
    <span style={{ pointerEvents: 'none' }}>
      {number} · {name} — {size}
    </span>
  )
}
