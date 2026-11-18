'use client'

import * as React from 'react'

import { Label as LabelPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

/**
 * shadcn/ui form label (Radix `Label`): pair it with a field through
 * `htmlFor`, so a click on the text focuses the field and the field takes
 * the text as its accessible name.
 *
 * @remarks Dims with a disabled `peer` field or a `data-disabled` group, so a
 * form that disables its fields while a request is in flight needs no label
 * styling of its own.
 */
function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Label }
