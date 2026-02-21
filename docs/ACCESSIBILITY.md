# Accessibility

## Existing Patterns to Preserve

- Semantic interactive elements (`button`, `a`, form controls).
- Explicit `aria-label` on icon-only controls (theme toggle, search controls, menu close).
- Keyboard shortcuts augment but do not replace pointer interactions.
- Focus-visible outline behavior using Tailwind outline utilities.

## Search and Chat Considerations

- Search modal should remain dismissible with Escape and outside click.
- Inputs must keep clear placeholders and labels/context in surrounding copy.
- Hermes streaming state should remain understandable without relying on animation alone.

## Color and Contrast

- Maintain contrast parity in both themes for:
  - nav controls
  - category chips
  - chat bubbles and Markdown text
  - form validation/error text

## Regression Checklist

- Tab through header controls and modal controls.
- Validate keyboard-only open/close for search and chat shortcuts.
- Verify no hidden route links in mobile nav causing dead-end navigation.
