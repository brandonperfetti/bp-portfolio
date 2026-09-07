'use client'

import * as React from 'react'

import { XIcon } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

/**
 * shadcn/ui Dialog primitive (Radix-based), sourced via the shadcn MCP.
 *
 * @remarks Two deliberate departures from the upstream registry file, both
 * repo conventions rather than taste:
 *
 * 1. **`radix-ui` (unified), not `@radix-ui/react-dialog`.** The unified
 *    package is already a dependency and is already how this repo reaches for
 *    Radix (`src/components/ui/button.tsx` takes `Slot` from it,
 *    `src/components/consent/CookieDialog.tsx` takes `Dialog` and `Switch`).
 *    Upstream's own file imports it the same way, so adding the scoped package
 *    would have duplicated a Radix copy in the tree for nothing.
 * 2. **`motion-reduce:animate-none` on the overlay and the content.**
 *    `docs/ACCESSIBILITY.md`: every animated surface renders static under
 *    `prefers-reduced-motion`. `tw-animate-css` does not gate itself, so the
 *    variant is explicit — the same pairing `CookieDialog` already carries on
 *    its hand-rolled Radix dialog.
 *
 * Upstream's `DialogFooter` also accepts a `showCloseButton` prop that renders
 * a `Button`; it is dropped here rather than carried as dead configuration
 * that would make this primitive import another one.
 *
 * Colours come from the token layer (`bg-background`, `text-muted-foreground`,
 * `focus:ring-ring`) — see `docs/STYLING.md` §shadcn primitives are themed at
 * the token layer. Do not repaint a dialog at its call site.
 */
function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

/** The control that opens its {@link Dialog}; `asChild` to wrap your own. */
function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

/**
 * Portals the dialog out of the React tree it is declared in.
 *
 * @remarks Rendered into `document.body`, which is what lets a caller mark the
 * dialog's own ancestor `inert` without swallowing the dialog with it.
 */
function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

/** A control that closes its {@link Dialog}; `asChild` to wrap your own. */
function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

/** The scrim behind {@link DialogContent}; also the outside-click target. */
function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'fixed inset-0 z-50 animate-in bg-black/50 fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  )
}

/**
 * The modal panel. Radix owns the focus trap, focus restore, Escape,
 * outside-click dismissal, the portal and `role="dialog"`.
 *
 * @remarks It does NOT emit `aria-modal`: Radix hides the rest of the page
 * with `aria-hidden` on the portal's siblings instead, because `aria-modal` is
 * inconsistently honoured by screen readers. Pass it explicitly where a
 * contract asks for it — see `docs/ACCESSIBILITY.md` §Focus.
 *
 * It must contain a {@link DialogTitle} — that is the dialog's
 * accessible name, and Radix warns at runtime without one. Pass
 * `showCloseButton={false}` when the panel's own actions already offer a
 * cancel path and an extra ✕ would be a redesign rather than an affordance.
 */
function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          'fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] animate-in gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 fade-in-0 outline-none zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 motion-reduce:animate-none sm:max-w-lg',
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

/** Title/description cluster at the top of a {@link DialogContent}. */
function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col gap-2 text-center sm:text-left', className)}
      {...props}
    />
  )
}

/** Action row at the bottom of a {@link DialogContent}. */
function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  )
}

/** The dialog's accessible name. Required inside {@link DialogContent}. */
function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-lg leading-none font-semibold', className)}
      {...props}
    />
  )
}

/** The dialog's `aria-describedby` target. */
function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
