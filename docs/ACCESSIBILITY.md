# Accessibility (acceptance criteria)

These are release gates, not aspirations:

- **Keyboard**: every interactive component fully operable by keyboard —
  palette (cmdk semantics), explorers, card links, expandable details
  (aria-expanded/aria-controls), chat composer, theme toggle.
- **Focus**: visible `focus-visible` rings everywhere (teal); focus order
  follows DOM; overlays trap and restore focus (cmdk dialog does this).
- **Reduced motion**: every animated surface — headline, scroll reveals,
  hover lifts, parallax, shader hero, tech viz, expand/collapse — renders
  static, fully functional DOM under `prefers-reduced-motion`. Motion
  wrappers handle this; new surfaces must too (CSS transitions use
  `motion-reduce:transition-none`).
- **Light/dark parity**: both themes reviewed for contrast (WCAG AA) on
  every new component; Storybook's theme toggle exists for exactly this.
  Parity means both themes _clear_ the floors, not that both use the same
  treatment. Worked example (#139): the Corvus sign-in-gate CTA hovers to a
  darker fill in light, but in dark keeps its resting teal-700 fill and gains
  a teal-300 ring instead — against the near-black gate panel no teal fill can
  hold the label at 4.5:1 (1.4.3) and the button's own edge at 3:1 (1.4.11) at
  once. Ring measured 3.70:1 on the fill and 13.38:1 on the panel;
  `src/styles/corvus-accent-contrast.test.ts` recomputes all of it from the
  stylesheet, because a CSS custom property is invisible to every other guard.
- **Semantics**: real elements over ARIA where possible (`button`, `nav`,
  lists with `role="list"` where Tailwind resets apply); status text uses
  `role="status"` + `aria-live="polite"` (see explorer result counts);
  decorative art (shader canvas, signal meter) is `aria-hidden` with the
  information carried in adjacent text.
- **Images**: meaningful alt from CMS; empty alt for decorative.
- **Automated checks**: Storybook a11y addon (serious ⇒ fail) + the
  Playwright axe sweep in `e2e/` cover the baseline; manual keyboard passes
  remain required for new interaction patterns.
