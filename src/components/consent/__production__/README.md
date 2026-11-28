# Production's consent code before #375 (a frozen test baseline)

These five files are `src/components/consent/` as it stood before #375, at
`64708f34`: the code production runs until the #375 change ships. Only their
imports of unchanged siblings were rewritten (`./consent-content` →
`../consent-content`, and the same for `consent-focus` and `consent-inset`).

They exist for one reason. #375's acceptance asks that "the comparison with
production's code is part of the test, not an argument: for each history, the
same sequence run against base and against the change".
`ConsentManager.histories.test.tsx` runs every history twice: once against
the change and once against these files. Nothing in the app imports them.

- **Do not edit them** to make a history pass or fail; they stand for what is
  deployed. A history whose production verdict changes means this baseline
  no longer matches production, or the test changed meaning.
- **Delete the folder** once the #375 change has been in production long
  enough that the comparison is no longer wanted, together with the
  `production` runs in the history file.
