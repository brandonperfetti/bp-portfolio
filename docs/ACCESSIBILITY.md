# Accessibility (acceptance criteria)

These are release gates, not aspirations:

- **Keyboard**: every interactive component fully operable by keyboard —
  palette (cmdk semantics), explorers, card links, expandable details
  (aria-expanded/aria-controls), chat composer, theme toggle.
- **Focus**: visible `focus-visible` rings everywhere (teal); focus order
  follows DOM; overlays trap and restore focus. **The overlay mechanism is the
  shadcn `Dialog` primitive** (`src/components/ui/dialog.tsx`, Radix): it owns
  the focus trap, the focus restore, Escape, outside-click dismissal, the
  portal and `role="dialog"`, and it hides the rest of the page from the
  accessibility tree (`aria-hidden` on the portal's body-level siblings). Do
  not hand-roll any of them — and **nothing hand-rolled remains**: #169
  deleted the last of it, the card-scoped `inert` effect and manual focus
  restore that `CorvusReplyLink` used to carry. Two things the caller still
  owes:
  - **`aria-modal`.** Radix omits it deliberately (it hides the rest of the
    page with `aria-hidden` on the portal's siblings instead). Pass it through
    `DialogContent` where a contract asks for it — `CorvusReplyLink` in
    `src/components/CorvusChat.tsx` does.
  - **Open it from a `DialogTrigger`.** The restore is Radix's, but only if
    Radix knows the trigger. `DialogContentModal` handles close-auto-focus by
    calling `event.preventDefault()` — cancelling `FocusScope`'s own restore —
    and focusing `context.triggerRef.current` instead, and `DialogTrigger` is
    the only thing that populates that ref. A controlled dialog opened from a
    plain sibling button therefore restores focus to **nothing** and drops it
    on `<body>`. `CorvusReplyLink` wraps its trigger in
    `<DialogTrigger asChild>` for exactly this reason. The restore is also
    deferred one tick (`setTimeout(…, 0)` in `FocusScope`'s cleanup), so a
    test must `waitFor` it rather than assert on the tick after close.

  The command palette (cmdk) predates the primitive and keeps its own dialog.

- **List paging**: a page step re-anchors the reader (#183). Every list
  surface pages with `router.push(…, { scroll: false })` — #88's back-button
  restore depends on it — so nothing moves on its own: the whole result set is
  replaced under a viewport parked wherever the reader left it, and focus dies
  with the control that was clicked. `usePageChangeAnchor`
  (`src/lib/usePageChangeAnchor.ts`, threaded through `ListPagination`) pays
  that back: it scrolls the **results container** to the top of the viewport
  (its `scroll-mt-16` clears the sticky header) and moves focus onto it. The
  container, not the first card: it is the only target that exists on every
  surface in every state, it keeps the reader _outside_ the first result's own
  links, and the next Tab walks the results from their start. It therefore
  carries `tabIndex={-1}` **and an accessible name** — a `<ul role="list">`
  takes an `aria-label`, a bare `<div>` needs `role="region"` with one, because
  focus landing on an unnamed generic announces nothing. The scroll is smooth,
  and instant under `prefers-reduced-motion` (via the shared
  `getPrefersReducedMotion`). It is armed from the pagination click and spent
  only on the page it was armed for, never inferred from a `page` change: a
  filter reset drops `?page` while the reader is typing, and anchoring there
  would rip focus out of the search box.
- **Reduced motion**: every animated surface — headline, scroll reveals,
  hover lifts, parallax, shader hero, tech viz, expand/collapse — renders
  static, fully functional DOM under `prefers-reduced-motion`. Motion
  wrappers handle this; new surfaces must too (CSS transitions use
  `motion-reduce:transition-none`).
- **Light/dark parity**: both themes reviewed for contrast (WCAG AA) on
  every new component; Storybook's theme toggle exists for exactly this.
  Parity means both themes _clear_ the floors, not that both use the same
  treatment: the Corvus sign-in-gate CTA's dark hover is a ring, not a fill
  step (#139). Ratios are pinned in `src/styles/corvus-accent-contrast.test.ts`
  and the arithmetic behind the choice is in the `tailwind.css` corvus token
  block.
- **Semantics**: real elements over ARIA where possible (`button`, `nav`,
  lists with `role="list"` where Tailwind resets apply); status text uses
  `role="status"` + `aria-live="polite"` (see explorer result counts);
  decorative art (shader canvas, signal meter) is `aria-hidden` with the
  information carried in adjacent text.
- **Images**: meaningful alt from CMS; empty alt for decorative.
- **Automated checks**: Storybook a11y addon (serious ⇒ fail) + the
  Playwright axe sweep in `e2e/` cover the baseline; manual keyboard passes
  remain required for new interaction patterns.
